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
import { addUsage, usageToMicroUsd, EMPTY_USAGE, type LlmUsage } from '../services/gemini.js';
import { renderSkill } from '../lib/renderers.js';
import { assertDocumentSafe, SanitizeError, type SanitizeFinding } from '../lib/sanitize.js';
import { SynthesisParseError } from '../services/gemini.js';

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
  urls?: string[];
  playlistId?: string | null;
  videoId?: string | null;
  targetFormat?: SkillFormat;
  isAppend?: boolean;
  language?: string;
  userId?: string;
}

export const skillWorker = new Worker<SkillJobData>(
  SKILL_QUEUE_NAME,
  async (job: Job<SkillJobData>) => {
    const { skillId, urls, playlistId, videoId, isAppend, language, userId } = job.data;
    
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (!skillResult.length) throw new Error('Skill not found');
    const skill = skillResult[0];
    const targetFormat = (job.data.targetFormat || skill.targetFormat || 'generic') as SkillFormat;
    const targetLanguage = language || skill.language || 'en';
    
    await db.update(skills).set({ status: 'processing' }).where(eq(skills.id, skillId));

    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    let totalUsage: LlmUsage = { ...EMPTY_USAGE };
    let sanitizeWarnings: SanitizeFinding[] = [];
    let cardsExtracted = 0;

    try {
      await job.updateProgress(10);
      
      const sourceUrls = urls || [];
      if (sourceUrls.length === 0 && (playlistId || videoId)) {
        sourceUrls.push(playlistId ? `https://youtube.com/playlist?list=${playlistId}` : `https://youtube.com/watch?v=${videoId}`);
      }

      if (sourceUrls.length === 0) {
        throw new Error('No URLs provided for skill generation');
      }

      let allVideos: any[] = [];
      let primaryDetails: any = null;
      
      for (const url of sourceUrls) {
        const pId = extractPlaylistId(url);
        const vId = extractVideoId(url);
        
        if (pId) {
          const details = await getPlaylistDetails(pId);
          if (!primaryDetails) primaryDetails = details;
          const vids = await getPlaylistVideos(pId);
          allVideos = allVideos.concat(vids);
        } else if (vId) {
          const vid = await getVideoDetails(vId);
          if (!primaryDetails) {
            primaryDetails = {
              playlistTitle: vid.title,
              channelName: vid.channelName,
              channelId: vid.channelId
            };
          }
          allVideos.push(vid);
        }
      }
      
      // Deduplicate videos by videoId just in case
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
        }).where(eq(skills.id, skillId));
      }
      await job.updateProgress(20);

      const cards: ExtractedCard[] = [];
      const videoLogs = [];

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        
        let dbVideo = await db.insert(skillVideos).values({
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
          
          await db.update(skillVideos).set({
            transcriptSource: 'youtube-transcript',
            transcriptContent: transcript,
          }).where(eq(skillVideos.id, dbVideo[0].id));

          const extraction = await extractVideoCard(transcript, video.title, video.description);
          const card = extraction.data;
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

      await job.updateProgress(85);
      
      let allCards = cards;
      if (isAppend) {
        const existingVideos = await db.select().from(skillVideos).where(eq(skillVideos.skillId, skillId));
        const existingCards = existingVideos
          .filter(v => v.extractedCard)
          .map(v => v.extractedCard as ExtractedCard);
        
        // Use all cards (the ones just extracted are already in cards, but we can just use the DB ones for simplicity)
        allCards = existingCards;
      }
      
      // Filter out null cards just in case
      allCards = allCards.filter(c => !!c);

      // Gate 1 — nothing to synthesize from. Without this a playlist whose videos
      // all failed transcription produces a fabricated skill marked `completed`.
      assertCardsUsable(allCards, skillId);

      // ADR-004: o modelo devolve conhecimento estruturado, não arquivos.
      // O Zod dentro de `synthesizeSkill` já reprovou campo curto, slug inválido
      // e conector fora da allowlist antes de chegarmos aqui.
      const synthesis = await synthesizeSkill(
        allCards,
        skill.playlistTitle || primaryDetails?.playlistTitle || 'Custom Selection',
        targetLanguage
      );
      const document = synthesis.data;
      totalUsage = addUsage(totalUsage, synthesis.usage);

      // Gate 2 — sanitização. Só é possível porque agora existem campos:
      // sequestro de contexto, credencial e shell destrutivo reprovam o job.
      sanitizeWarnings = assertDocumentSafe(document).filter(f => f.severity === 'warn');
      if (sanitizeWarnings.length > 0) {
        console.warn(`[worker] ${sanitizeWarnings.length} aviso(s) de sanitização em ${skillId}`);
      }

      // Renderização determinística. Uma síntese, cinco formatos — sem custo extra.
      const pluginPackage = { files: renderSkill(document, targetFormat) };

      // Gate 3 — o que renderizamos precisa carregar uma skill de verdade.
      const mainFile = assertSynthesisUsable(pluginPackage, targetFormat);

      const skillMd = mainFile.content;
      const humanMd = pluginPackage.files.find(f => f.path.toLowerCase() === 'human.md')?.content || '';

      const gitPackage = buildGitPackage(pluginPackage.files);

      await db.update(skills).set({
        name: `Skill: ${skill.playlistTitle || primaryDetails?.playlistTitle || 'Custom Selection'}`,
        description: `Generated from ${skill.channelName || primaryDetails?.channelName || 'Multiple Channels'}`,
        skillMdContent: skillMd, // Fallback for backwards compatibility
        humanMdContent: humanMd,
        skillPackage: gitPackage,
        skillJsonOutput: allCards,
        status: 'completed',
        updatedAt: new Date()
      }).where(eq(skills.id, skillId));

      await db.insert(pipelineLogs).values({
        skillId,
        runId,
        videoLogs,
        synthesisLog: {
          success: true,
          format: targetFormat,
          language: targetLanguage,
          cardsUsed: allCards.length,
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
        const microUsd = usageToMicroUsd(totalUsage);
        // 1 cent ($0.01) = 10,000 microUsd. 1 Skiller Credit = 1 cent. Markup = 5x
        const creditsToDeduct = Math.max(1, Math.ceil((microUsd / 10000) * 5));
        
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
            const creditsToDeduct = Math.max(1, Math.ceil((microUsd / 10000) * 5));
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
