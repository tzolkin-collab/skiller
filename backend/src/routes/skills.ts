import { Hono } from 'hono';
import { extractPlaylistId, extractVideoId } from '../services/youtube.js';
import { skillQueue } from '../queue/queue.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { skills, skillVideos, pipelineLogs } from '../db/schema.js';
import { eq, desc, or, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { getErrorMessage } from '../lib/errors.js';

const queryClient = postgres(process.env.DATABASE_URL || 'postgres://postgres:password@127.0.0.1:5432/skiller');
const db = drizzle(queryClient);

const skillsRouter = new Hono();

const createSkillSchema = z.object({
  playlistUrl: z.string().url(),
  targetFormat: z.enum(['gemini', 'claude', 'copilot', 'mcp', 'generic']).default('generic'),
  language: z.string().optional().default('en')
});

skillsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const result = createSkillSchema.safeParse(body);
    
    if (!result.success) {
      return c.json({ error: 'Invalid URL' }, 400);
    }
    
    const playlistId = extractPlaylistId(result.data.playlistUrl);
    const videoId = extractVideoId(result.data.playlistUrl);
    
    if (!playlistId && !videoId) {
      return c.json({ error: 'Could not extract playlist ID or video ID from URL' }, 400);
    }

    // Deduplication check: Se a URL contém o mesmo ID, já foi processada ou está na fila
    const searchId = playlistId || videoId;
    if (searchId) {
      const existingSkills = await db.select().from(skills)
        .where(ilike(skills.playlistUrl, `%${searchId}%`))
        .limit(1);
        
      if (existingSkills.length > 0) {
        return c.json({ id: existingSkills[0].id, status: existingSkills[0].status, deduplicated: true }, 200);
      }
    }

    const inserted = await db.insert(skills).values({
      playlistUrl: result.data.playlistUrl,
      targetFormat: result.data.targetFormat,
      language: result.data.language,
      status: 'queued'
    }).returning();
    
    const skill = inserted[0];
    
    await skillQueue.add('generate-skill', {
      skillId: skill.id,
      playlistId,
      videoId,
      targetFormat: result.data.targetFormat,
      language: result.data.language
    }, {
      jobId: skill.id
    });
    
    return c.json({ id: skill.id, status: 'queued' }, 201);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/', async (c) => {
  try {
    const query = c.req.query('q');
    
    let allSkills;
    if (query) {
      allSkills = await db.select().from(skills)
        .where(
          or(
            ilike(skills.name, `%${query}%`),
            ilike(skills.description, `%${query}%`)
          )
        )
        .orderBy(desc(skills.createdAt));
    } else {
      allSkills = await db.select().from(skills).orderBy(desc(skills.createdAt));
    }
    
    return c.json(allSkills);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/:id', async (c) => {
  try {
    const skillId = c.req.param('id');
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    
    if (skillResult.length === 0) {
      return c.json({ error: 'Skill not found' }, 404);
    }
    
    const videosResult = await db.select().from(skillVideos).where(eq(skillVideos.skillId, skillId));
    
    return c.json({ ...skillResult[0], videos: videosResult });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/:id/download', async (c) => {
  try {
    const skillId = c.req.param('id');
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    
    if (skillResult.length === 0 || !skillResult[0].skillMdContent) {
      return c.json({ error: 'Skill markdown not found' }, 404);
    }
    
    const skill = skillResult[0];
    const format = skill.targetFormat || 'generic';
    
    let filename: string;
    switch (format) {
      case 'gemini':
        filename = 'SKILL.md';
        break;
      case 'claude':
        filename = `${(skill.name || 'skill').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mdc`;
        break;
      case 'copilot':
        filename = 'copilot-instructions.md';
        break;
      case 'mcp':
        filename = 'mcp-server.md';
        break;
      default:
        filename = 'AGENTS.md';
    }
    
    c.header('Content-Type', 'text/markdown');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    
    return c.text(skill.skillMdContent || '');
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/:id/plugin', async (c) => {
  try {
    const skillId = c.req.param('id');
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    
    if (skillResult.length === 0 || !skillResult[0].skillPackage) {
      return c.json({ error: 'Plugin package not found' }, 404);
    }
    
    // Return the raw package JSON which AI tools can easily parse
    return c.json(skillResult[0].skillPackage);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.post('/:id/retry', async (c) => {
  try {
    const skillId = c.req.param('id');
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (skillResult.length === 0) return c.json({ error: 'Skill not found' }, 404);
    
    const skill = skillResult[0];
    
    await db.delete(skillVideos).where(eq(skillVideos.skillId, skillId));
    await db.delete(pipelineLogs).where(eq(pipelineLogs.skillId, skillId));
    await db.update(skills).set({ status: 'queued', skillMdContent: null, skillPackage: null, skillJsonOutput: null }).where(eq(skills.id, skillId));
    
    const playlistId = extractPlaylistId(skill.playlistUrl);
    const videoId = extractVideoId(skill.playlistUrl);
    
    try {
      const oldJob = await skillQueue.getJob(skill.id);
      if (oldJob) {
        await oldJob.remove();
      }
    } catch (err) {
      console.error('Could not remove old job from queue', err);
    }
    
    await skillQueue.add('generate-skill', {
      skillId: skill.id,
      playlistId,
      videoId
    }, {
      jobId: `${skill.id}-retry-${Date.now()}` // Bypass BullMQ lock using a unique retry ID
    });
    
    return c.json({ status: 'queued' });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

const appendSkillSchema = z.object({
  playlistUrl: z.string().url()
});

skillsRouter.post('/:id/append', async (c) => {
  try {
    const skillId = c.req.param('id');
    const body = await c.req.json();
    const result = appendSkillSchema.safeParse(body);
    
    if (!result.success) {
      return c.json({ error: 'Invalid URL' }, 400);
    }
    
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (skillResult.length === 0) return c.json({ error: 'Skill not found' }, 404);
    
    const playlistId = extractPlaylistId(result.data.playlistUrl);
    const videoId = extractVideoId(result.data.playlistUrl);
    
    if (!playlistId && !videoId) {
      return c.json({ error: 'Could not extract playlist ID or video ID from URL' }, 400);
    }

    await db.update(skills).set({ status: 'queued' }).where(eq(skills.id, skillId));
    
    await skillQueue.add('append-skill', {
      skillId,
      playlistId,
      videoId,
      isAppend: true
    }, {
      jobId: `${skillId}-append-${Date.now()}` // Allow multiple distinct appends
    });
    
    return c.json({ status: 'queued' }, 202);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.delete('/:id', async (c) => {
  try {
    const skillId = c.req.param('id');
    await db.delete(skills).where(eq(skills.id, skillId));
    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export { skillsRouter };
