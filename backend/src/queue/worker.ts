import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { SKILL_QUEUE_NAME } from './queue.js';
import { getPlaylistVideos, getPlaylistDetails, getVideoDetails } from '../services/youtube.js';
import { getVideoTranscript } from '../services/transcript.js';
import { extractVideoCard, synthesizeSkill, ExtractedCard } from '../services/gemini.js';
import { SkillFormat } from '../prompts/synthesis.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { skills, skillVideos, pipelineLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { getErrorMessage } from '../lib/errors.js';
import { buildGitPackage } from '../utils/git-indexer.js';
import { assertCardsUsable, assertSynthesisUsable } from '../lib/skill-package.js';
import { addUsage, usageToMicroUsd, EMPTY_USAGE, type LlmUsage } from '../services/gemini.js';

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:password@127.0.0.1:5432/skiller');
const db = drizzle(sql);

interface SkillJobData {
  skillId: string;
  playlistId: string | null;
  videoId?: string | null;
  targetFormat?: SkillFormat;
  isAppend?: boolean;
  language?: string;
}

export const skillWorker = new Worker<SkillJobData>(
  SKILL_QUEUE_NAME,
  async (job: Job<SkillJobData>) => {
    const { skillId, playlistId, videoId, isAppend, language } = job.data;
    
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (!skillResult.length) throw new Error('Skill not found');
    const skill = skillResult[0];
    const targetFormat = (job.data.targetFormat || skill.targetFormat || 'generic') as SkillFormat;
    const targetLanguage = language || skill.language || 'en';
    
    await db.update(skills).set({ status: 'processing' }).where(eq(skills.id, skillId));

    // Telemetria da execução — NFR "todo job deve gerar log estruturado completo".
    // Acumulada aqui e gravada nos dois caminhos, sucesso e falha.
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    let totalUsage: LlmUsage = { ...EMPTY_USAGE };
    const videoLogs: Record<string, unknown>[] = [];

    try {
      await job.updateProgress(10);
      
      let playlistDetails;
      let videos = [];
      
      if (playlistId) {
        playlistDetails = await getPlaylistDetails(playlistId);
        videos = await getPlaylistVideos(playlistId);
      } else if (videoId) {
        const vid = await getVideoDetails(videoId);
        playlistDetails = {
          playlistTitle: vid.title,
          channelName: vid.channelName,
          channelId: vid.channelId
        };
        videos = [vid];
      } else {
        throw new Error('No playlist or video ID provided');
      }

      if (!isAppend) {
        // Idempotency: Clean up existing videos if this is a job retry
        await db.delete(skillVideos).where(eq(skillVideos.skillId, skillId));
        
        await db.update(skills).set({
          playlistTitle: playlistDetails.playlistTitle,
          channelName: playlistDetails.channelName,
          channelId: playlistDetails.channelId,
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

      const synthesis = await synthesizeSkill(allCards, skill.playlistTitle || playlistDetails.playlistTitle, targetFormat, targetLanguage);
      const pluginPackage = synthesis.data;
      totalUsage = addUsage(totalUsage, synthesis.usage);

      // Gate 2 — the package must actually carry a skill for this format.
      const mainFile = assertSynthesisUsable(pluginPackage, targetFormat);

      const skillMd = mainFile.content;
      const humanMd = pluginPackage.files.find(f => f.path.toLowerCase() === 'human.md')?.content || '';

      const gitPackage = buildGitPackage(pluginPackage.files);

      await db.update(skills).set({
        name: `Skill: ${skill.playlistTitle || playlistDetails.playlistTitle}`,
        description: `Generated from ${skill.channelName || playlistDetails.channelName}`,
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
          inputTokens: synthesis.usage.inputTokens,
          outputTokens: synthesis.usage.outputTokens
        },
        totalInputTokens: totalUsage.inputTokens,
        totalOutputTokens: totalUsage.outputTokens,
        estimatedCostMicroUsd: usageToMicroUsd(totalUsage),
        totalDurationMs: Date.now() - startedAt
      });

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
        await db.insert(pipelineLogs).values({
          skillId,
          runId,
          videoLogs,
          synthesisLog: { success: false, error: message, format: targetFormat },
          totalInputTokens: totalUsage.inputTokens,
          totalOutputTokens: totalUsage.outputTokens,
          estimatedCostMicroUsd: usageToMicroUsd(totalUsage),
          totalDurationMs: Date.now() - startedAt
        });
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
