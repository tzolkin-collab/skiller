import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { SKILL_QUEUE_NAME } from './queue.js';
import { getPlaylistVideos, getPlaylistDetails, getVideoDetails, extractPlaylistId, extractVideoId } from '../services/youtube.js';
import { getVideoTranscript } from '../services/transcript.js';
import { extractVideoCard, synthesizeSkill, ExtractedCard } from '../services/gemini.js';
import { SkillFormat } from '../prompts/synthesis.js';
import { skills, skillVideos, pipelineLogs, users } from '../db/schema.js';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/db.js';
import crypto from 'crypto';
import { getErrorMessage } from '../lib/errors.js';
import { buildGitPackage } from '../utils/git-indexer.js';
import { assertCardsUsable, assertSynthesisUsable } from '../lib/skill-package.js';
import { addUsage, usageToMicroUsd, EMPTY_USAGE, type LlmUsage, extractFromGoogleSearch } from '../services/gemini.js';
import { creditosDe } from '../lib/credits.js';
import { renderSkill } from '../lib/renderers.js';
import { SanitizeError, type SanitizeFinding } from '../lib/sanitize.js';
import { persistirSkill, DocumentoInvalidoError } from '../lib/persist-skill.js';
import { SynthesisParseError } from '../services/gemini.js';
import { extractFromGithub } from '../services/github.js';

if (!process.env.REDIS_HOST) {
  throw new Error('REDIS_HOST is required in the environment variables.');
}

const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

interface SkillJobData {
  skillId: string;
  sourceType?: string;
  sourceQuery?: string;
  urls?: string[];
  playlistId?: string | null;
  videoId?: string | null;
  targetFormat?: SkillFormat;
  isAppend?: boolean;
  language?: string;
  userId?: string;
}


/**
 * Tipos derivados do que os serviços do YouTube realmente devolvem.
 *
 * Eram três `any`, o que a regra 1 do AGENTS.md proíbe — e que passou porque o
 * backend nunca teve linter. Derivar em vez de redeclarar mantém isto correto
 * quando o retorno daquelas funções mudar.
 */
type VideoDaFonte = Awaited<ReturnType<typeof getPlaylistVideos>>[number];
type DetalhesDaFonte = Awaited<ReturnType<typeof getPlaylistDetails>>;

/** Uma linha do relatório por vídeo, guardada no log do pipeline. */
type RegistroDeVideo =
  | { videoId: string; status: 'success'; inputTokens: number; outputTokens: number }
  | { videoId: string; status: 'failed'; error: string };
export const skillWorker = new Worker<SkillJobData>(
  SKILL_QUEUE_NAME,
  async (job: Job<SkillJobData>) => {
    const { skillId, sourceType, sourceQuery, urls, playlistId, videoId, isAppend, language, userId } = job.data;
    
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (!skillResult.length) throw new Error('Skill not found');
    const skill = skillResult[0];
    const targetFormat = (job.data.targetFormat || skill.targetFormat || 'generic') as SkillFormat;
    const targetLanguage = language || skill.language || 'en';
    
    await db.update(skills).set({ status: 'processing' }).where(eq(skills.id, skillId));

    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    let totalUsage: LlmUsage = { ...EMPTY_USAGE };
    // Teto real do job. O portão em `routes/skills.ts` só checa `saldo > 0`
    // antes de enfileirar, e o débito acontece no fim — sozinhos, os dois
    // deixam uma playlist de 50 vídeos rodar inteira com 1 crédito na conta.
    // Lendo o saldo aqui, o loop abaixo consegue parar quando estoura.
    const saldoInicial = userId
      ? (await db.select({ c: users.creditsBalance }).from(users).where(eq(users.id, userId)).limit(1))[0]?.c ?? 0
      : Number.POSITIVE_INFINITY;
    /** Vídeos que ficaram de fora por falta de crédito. */
    let cortadosPorSaldo = 0;
    let sanitizeWarnings: SanitizeFinding[];
    let cardsExtracted = 0;
    let videoLogs: RegistroDeVideo[] = [];

    try {
      await job.updateProgress(10);
      const cards: ExtractedCard[] = [];
      videoLogs = [];
      await db.update(skills).set({ status: 'extracting' }).where(eq(skills.id, skillId));

      const type = sourceType || skill.sourceType || 'youtube';
      let extractedTitle = 'Custom Selection';

      if (type === 'google_search') {
        const query = sourceQuery || skill.sourceQuery;
        if (!query) throw new Error('No query provided for google search');
        
        await db.update(skills).set({
          playlistTitle: `Pesquisa: ${query}`,
          channelName: 'Google Search'
        }).where(eq(skills.id, skillId));
        extractedTitle = query;
        
        const extraction = await extractFromGoogleSearch(query);
        extraction.data.sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        totalUsage = addUsage(totalUsage, extraction.usage);
        cards.push(extraction.data);

        videoLogs.push({ videoId: query, status: 'success', inputTokens: extraction.usage.inputTokens, outputTokens: extraction.usage.outputTokens });
      } else if (type === 'github') {
        const url = sourceQuery || (urls ? urls[0] : null);
        if (!url) throw new Error('No github URL provided');
        
        const githubData = await extractFromGithub(url);
        await db.update(skills).set({
          playlistTitle: githubData.title,
          channelName: githubData.channelName,
          channelImageUrl: githubData.channelImageUrl
        }).where(eq(skills.id, skillId));
        extractedTitle = githubData.title;

        const extraction = await extractVideoCard(githubData.text, githubData.title, 'Github README');
        extraction.data.sourceUrl = url;
        totalUsage = addUsage(totalUsage, extraction.usage);
        cards.push(extraction.data);

        videoLogs.push({ videoId: url, status: 'success', inputTokens: extraction.usage.inputTokens, outputTokens: extraction.usage.outputTokens });
      } else {
        // YOUTUBE
        const sourceUrls = urls || [];
        if (sourceUrls.length === 0 && (playlistId || videoId)) {
          sourceUrls.push(playlistId ? `https://youtube.com/playlist?list=${playlistId}` : `https://youtube.com/watch?v=${videoId}`);
        }

        if (sourceUrls.length === 0) {
          throw new Error('No URLs provided for skill generation');
        }

        let allVideos: VideoDaFonte[] = [];
        let primaryDetails: DetalhesDaFonte | null = null;
        
        for (const url of sourceUrls) {
          const pId = extractPlaylistId(url);
          const vId = extractVideoId(url);
          
          if (pId) {
            const details = await getPlaylistDetails(pId);
            if (!primaryDetails) primaryDetails = details;
            const vids = await getPlaylistVideos(pId);
            allVideos = allVideos.concat(vids);
          } else if (vId) {
            try {
              const vid = await getVideoDetails(vId);
              if (vid) {
                if (!primaryDetails) {
                  primaryDetails = {
                    playlistTitle: vid.title,
                    channelName: vid.channelName,
                    channelId: vid.channelId,
                    channelImageUrl: vid.channelImageUrl
                  };
                }
                allVideos.push(vid);
              }
            } catch (e) {
              console.error(`Failed to fetch video details for ${vId}`, e);
            }
          }
        }
        
        const seenIds = new Set();
        const videos = allVideos.filter(v => {
          if (seenIds.has(v.videoId)) return false;
          seenIds.add(v.videoId);
          return true;
        });

        if (!isAppend) {
          await db.delete(skillVideos).where(eq(skillVideos.skillId, skillId));
          await db.update(skills).set({
            playlistTitle: primaryDetails?.playlistTitle || 'Custom Selection',
            channelName: primaryDetails?.channelName || 'Multiple Channels',
            channelId: primaryDetails?.channelId,
            channelImageUrl: primaryDetails?.channelImageUrl || null,
          }).where(eq(skills.id, skillId));
        }
        await job.updateProgress(20);
        extractedTitle = skill.playlistTitle || primaryDetails?.playlistTitle || 'Custom Selection';

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        // Para antes de gastar o que a conta não tem. O primeiro vídeo sempre
        // roda — sem isso não haveria skill nenhuma —, então o estouro máximo é
        // de um vídeo, e não de uma playlist. Os cards já extraídos seguem para
        // a síntese: a pessoa recebe uma skill menor, não um erro.
        if (i > 0 && creditosDe(totalUsage) >= saldoInicial) {
          cortadosPorSaldo = videos.length - i;
          console.warn(
            `[worker] skill ${skillId}: saldo de ${saldoInicial} créditos esgotado, ` +
            `${cortadosPorSaldo} de ${videos.length} vídeos não processados.`
          );
          for (const restante of videos.slice(i)) {
            videoLogs.push({ videoId: restante.videoId, status: 'failed', error: 'insufficient_credits' });
          }
          break;
        }

        const dbVideo = await db.insert(skillVideos).values({
          skillId,
          videoId: video.videoId,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          publishedAt: new Date(video.publishedAt),
          processingStatus: 'processing'
        }).returning();

        try {
          const transcript = await getVideoTranscript(video.videoId);

          // `language` fica gravado para que uma transcricao vinda no idioma
          // errado seja rastreavel no banco em vez de virar skill silenciosamente.
          await db.update(skillVideos).set({
            transcriptSource: transcript.source,
            transcriptLanguage: transcript.language,
            transcriptContent: transcript.text,
          }).where(eq(skillVideos.id, dbVideo[0].id));



          const extraction = await extractVideoCard(transcript.text, video.title, video.description);
          const card = extraction.data;
          card.sourceUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
          totalUsage = addUsage(totalUsage, extraction.usage);
          cards.push(card);

          await db.update(skillVideos).set({
            extractedCard: card,
            processingStatus: 'completed',
            processedAt: new Date()
          }).where(eq(skillVideos.id, dbVideo[0].id));

          videoLogs.push({
            videoId: video.videoId,
            status: 'success',
            inputTokens: extraction.usage.inputTokens,
            outputTokens: extraction.usage.outputTokens
          });

        } catch (error: unknown) {
          const message = getErrorMessage(error, `Failed processing video ${video.videoId}`);
          console.error(`Failed processing video ${video.videoId}`, error);
          await db.update(skillVideos).set({
            processingStatus: 'failed',
            error: message,
            processedAt: new Date()
          }).where(eq(skillVideos.id, dbVideo[0].id));

          videoLogs.push({ videoId: video.videoId, status: 'failed', error: message });
        }

        await job.updateProgress(20 + Math.floor(((i + 1) / videos.length) * 60));
      }
      } // CLOSE ELSE BLOCK FOR YOUTUBE

      // Marca o fim da extracao. `cards` vive dentro do `try` e o `catch` nao o
      // enxerga; este contador e o espelho de escopo externo — e ate agora ele
      // nunca era preenchido, entao o diagnostico de falha dizia "extraction"
      // mesmo quando a sintese e que tinha quebrado.
      cardsExtracted = cards.length;

      await job.updateProgress(85);
      
      // For both append and non-append, we read all cards from the DB to easily map videoId.
      const existingVideos = await db.select().from(skillVideos).where(eq(skillVideos.skillId, skillId));
      const allCards: ExtractedCard[] = [...cards]; // Add cards from non-youtube sources

      for (const sv of existingVideos) {
        if (!sv.extractedCard) continue;
        // avoid duplicating if we just inserted it (though for youtube we push to cards AND insert to db... wait, youtube logic inserts to db, but does it push to cards? Yes, cards.push(card))
        // So we might duplicate if we do both. Let's rebuild allCards entirely from DB for youtube, and use `cards` for non-youtube.
      }
      
      if (type === 'youtube') {
        allCards.length = 0;
        for (const sv of existingVideos) {
          if (!sv.extractedCard) continue;
          allCards.push(sv.extractedCard as ExtractedCard);
        }
      }

      // Gate 1 — nothing to synthesize from. Without this a playlist whose videos
      // all failed transcription produces a fabricated skill marked `completed`.
      assertCardsUsable(allCards, skillId);

      // ADR-004: o modelo devolve conhecimento estruturado, não arquivos.
      // O Zod dentro de `synthesizeSkill` já reprovou campo curto, slug inválido
      // e conector fora da allowlist antes de chegarmos aqui.
      await db.update(skills).set({ status: 'synthesizing' }).where(eq(skills.id, skillId));
      const synthesis = await synthesizeSkill(
        allCards,
        extractedTitle,
        targetLanguage
      );
      const document = synthesis.data;
      totalUsage = addUsage(totalUsage, synthesis.usage);

      const updatedSkill = await db.select().from(skills).where(eq(skills.id, skillId)).then(res => res[0]);

      // Portões 1 a 4 e a gravação, tudo dentro de `persistirSkill`. Estavam
      // soltos aqui, e funcionavam porque este era o único caminho que gravava.
      // Com o MCP passando a criar skill, repetir a sequência lá do lado seria
      // pedir para uma das duas esquecer um portão — e o esquecido não falha
      // barulhento, grava conteúdo não verificado.
      const persistida = await persistirSkill({
        skillId,
        documento: document,
        format: targetFormat,
        cards: allCards,
        nome: `Skill: ${updatedSkill.playlistTitle || 'Custom Selection'}`,
        descricao: `Generated from ${updatedSkill.channelName || 'Multiple Channels'}`,
      });

      sanitizeWarnings = persistida.avisos;
      if (sanitizeWarnings.length > 0) {
        console.warn(`[worker] ${sanitizeWarnings.length} aviso(s) de sanitização em ${skillId}`);
      }

      const pluginPackage = { files: persistida.files };
      const mainFile = persistida.mainFile;

      await db.insert(pipelineLogs).values({
        skillId,
        runId,
        videoLogs,
        synthesisLog: {
          success: true,
          format: targetFormat,
          language: targetLanguage,
          cardsUsed: allCards.length,
          // Quantos vídeos ficaram fora por falta de saldo. Sem este número, uma
          // skill curta por limite de crédito é indistinguível de uma playlist
          // curta — e o suporte não teria como responder "por que veio menos?".
          videosCortadosPorSaldo: cortadosPorSaldo,
          filesGenerated: pluginPackage.files.length,
          mainFile: mainFile.path,
          // Forma do documento estruturado — permite avaliar qualidade sem reler o texto.
          document: {
            name: document.name,
            principles: document.principles.length,
            modules: document.modules.length,
            commands: document.commands.length,
            connectors: document.connectors.map(c => c.id)
          },
          sanitizeWarnings,
          inputTokens: synthesis.usage.inputTokens,
          outputTokens: synthesis.usage.outputTokens
        },
        totalInputTokens: totalUsage.inputTokens,
        totalOutputTokens: totalUsage.outputTokens,
        estimatedCostMicroUsd: usageToMicroUsd(totalUsage),
        totalDurationMs: Date.now() - startedAt
      });

      if (userId) {
        const creditsToDeduct = creditosDe(totalUsage);
        
        await db.update(users)
          .set({ creditsBalance: drizzleSql`credits_balance - ${creditsToDeduct}` })
          .where(eq(users.id, userId));
          
        console.log(`[worker] Deducted ${creditsToDeduct} credits from user ${userId} for skill ${skillId}`);
      }

      await job.updateProgress(100);

    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error(`Job failed for skill ${skillId}`, message, error);

      await db.update(skills).set({
        status: 'failed',
        updatedAt: new Date()
      }).where(eq(skills.id, skillId));

      // Falha também gera log: sem isto, execução reprovada some e o custo
      // já gasto até o ponto da falha nunca aparece na conta.
      try {
        // Diagnóstico específico por tipo de falha. Sem isto, reprovação de
        // schema vira uma string e a resposta do modelo — o único artefato que
        // permite corrigir o prompt — se perde.
        const diagnosis: Record<string, unknown> = {
          success: false,
          error: message,
          format: targetFormat,
          stage: cardsExtracted === 0 ? 'extraction' : 'synthesis'
        };

        if (error instanceof SynthesisParseError) {
          diagnosis.kind = 'schema-rejected';
          diagnosis.issues = error.issues;
          diagnosis.rawResponse = error.rawResponse;
        } else if (error instanceof SanitizeError) {
          diagnosis.kind = 'sanitize-blocked';
          diagnosis.findings = error.findings;
        } else if (error instanceof DocumentoInvalidoError) {
          // O schema reprovou na porta de gravação, e não na saída do LLM.
          // Distinguir importa: aqui o modelo devolveu algo que passou no
          // parse da síntese e mesmo assim não sobreviveu ao portão — o que
          // aponta divergência entre os dois, não erro do modelo.
          diagnosis.kind = 'schema-rejected';
          diagnosis.issues = error.detalhe;
        }

        await db.insert(pipelineLogs).values({
          skillId,
          runId,
          videoLogs,
          synthesisLog: diagnosis,
          totalInputTokens: totalUsage.inputTokens,
          totalOutputTokens: totalUsage.outputTokens,
          estimatedCostMicroUsd: usageToMicroUsd(totalUsage),
          totalDurationMs: Date.now() - startedAt
        });

        if (userId) {
          const microUsd = usageToMicroUsd(totalUsage);
          if (microUsd > 0) {
            const creditsToDeduct = creditosDe(totalUsage);
            await db.update(users)
              .set({ creditsBalance: drizzleSql`credits_balance - ${creditsToDeduct}` })
              .where(eq(users.id, userId));
              
            console.log(`[worker] (Failure Path) Deducted ${creditsToDeduct} credits from user ${userId} for skill ${skillId}`);
          }
        }
      } catch (logError: unknown) {
        console.error('Could not persist pipeline log for failed run', getErrorMessage(logError));
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    // Each video costs one transcript fetch plus one LLM call, both network-bound.
    // At concurrency 1 a 50-video playlist runs far past the 5-minute target in
    // vision.md. Raise via WORKER_CONCURRENCY once the provider rate limits are known.
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '4')
  }
);

skillWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed with error ${err.message}`);
  }
});
