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

          const card = await extractVideoCard(transcript, video.title, video.description);
          cards.push(card);

          await db.update(skillVideos).set({
            extractedCard: card,
            processingStatus: 'completed',
            processedAt: new Date()
          }).where(eq(skillVideos.id, dbVideo[0].id));
          
          videoLogs.push({ videoId: video.videoId, status: 'success' });

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
      
      const pluginPackage = await synthesizeSkill(allCards, skill.playlistTitle || playlistDetails.playlistTitle, targetFormat, targetLanguage);
      
      const skillMd = pluginPackage.files.find(f => f.path.toUpperCase() === 'SKILL.MD' || f.path.toUpperCase() === 'AGENTS.MD')?.content || '';
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

      const runId = crypto.randomUUID();
      await db.insert(pipelineLogs).values({
        skillId,
        runId,
        videoLogs: videoLogs,
        synthesisLog: { success: true }
      });

      await job.updateProgress(100);

    } catch (error: unknown) {
      console.error(`Job failed for skill ${skillId}`, getErrorMessage(error), error);
      await db.update(skills).set({ 
        status: 'failed',
        updatedAt: new Date()
      }).where(eq(skills.id, skillId));
      throw error;
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

skillWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed with error ${err.message}`);
  }
});
