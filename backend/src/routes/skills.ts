import { Hono } from 'hono';
import { extractPlaylistId, extractVideoId } from '../services/youtube.js';
import { db } from '../db/db.js';
import { skillQueue } from '../queue/queue.js';
import { skills, skillVideos, pipelineLogs, users } from '../db/schema.js';
import { eq, desc, or, ilike, sql, and } from 'drizzle-orm';
import { z } from 'zod';
import { getErrorMessage } from '../lib/errors.js';
import { DOWNLOAD_NAME_BY_FORMAT } from '../lib/skill-package.js';
import { planOfSkill, denyUnless } from '../lib/entitlements.js';
import { buildGitPackage } from '../utils/git-indexer.js';
import { SkillDocumentSchema } from '../lib/skill-document.js';
import { renderSkill } from '../lib/renderers.js';
import type { SkillFormat } from '../prompts/synthesis.js';
import { usuarioAtual, naoAutenticado } from '../lib/current-user.js';
import type { SkillDocument } from '../lib/skill-document.js';

/** Formatos que o download aceita. Espelha `SkillFormat`. */
const FORMATOS: SkillFormat[] = ['generic', 'claude', 'cursor', 'copilot', 'gemini', 'mcp'];

const skillsRouter = new Hono();

const createSkillSchema = z.object({
  sourceType: z.enum(['youtube', 'google_search', 'github']).default('youtube'),
  sourceQuery: z.string().optional(),
  playlistUrl: z.string().optional(),
  urls: z.array(z.string()).min(1).optional(),
  targetFormat: z.enum(['gemini', 'cursor', 'claude', 'copilot', 'mcp', 'generic']).default('generic'),
  language: z.string().optional().default('en'),
  editSkillId: z.string().uuid().optional()
});

skillsRouter.get('/migrate-now', async (c) => {
  try {
    await db.execute(sql`ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_document jsonb`);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: getErrorMessage(err) }, 500);
  }
});

skillsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const result = createSkillSchema.safeParse(body);
    
    if (!result.success) {
      return c.json({ error: 'Invalid payload' }, 400);
    }
    
    // Support legacy playlistUrl or new urls array, or just use sourceQuery
    const sourceUrls = result.data.urls || (result.data.playlistUrl ? [result.data.playlistUrl] : []);
    const sourceQuery = result.data.sourceQuery || (sourceUrls.length > 0 ? sourceUrls[0] : undefined);
    const sourceType = result.data.sourceType;

    if (!sourceQuery) {
      return c.json({ error: 'No valid source query or URL provided' }, 400);
    }
    
    let playlistId = null;
    let videoId = null;

    if (sourceType === 'youtube') {
      playlistId = extractPlaylistId(sourceQuery);
      videoId = extractVideoId(sourceQuery);
      
      if (!playlistId && !videoId) {
        return c.json({ error: 'Could not extract playlist ID or video ID from primary URL' }, 400);
      }
    }

    // Quem está gerando. Antes disto havia três degraus de adivinhação: o
    // `?userId=` da URL, depois `users.limit(1)` — o PRIMEIRO registro da
    // tabela, fosse de quem fosse — e por fim a criação de `dummy@skiller.com`.
    // Na prática, gerar sem se identificar criava skill e debitava crédito na
    // conta de um desconhecido.
    const userId = await usuarioAtual(c);
    if (!userId) {
      return c.json(naoAutenticado(), 401);
    }

    const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) {
      return c.json({ error: 'user_not_found' }, 404);
    }

    if (user.creditsBalance <= 0) {
      return c.json({ error: 'Insufficient credits to process this skill' }, 402);
    }

    // Se estiver editando (adicionando fontes) a uma skill existente
    if (result.data.editSkillId) {
      const existing = await db.select().from(skills).where(eq(skills.id, result.data.editSkillId)).limit(1);
      if (existing.length === 0) {
        return c.json({ error: 'Skill to edit not found' }, 404);
      }
      
      const skill = existing[0];
      const oldUrls = (skill.sourceUrls as string[]) || (skill.playlistUrl ? [skill.playlistUrl] : []);
      
      // Faz o merge das URLs sem duplicar
      const combinedUrls = Array.from(new Set([...oldUrls, ...sourceUrls]));
      
      await db.update(skills).set({
        sourceUrls: combinedUrls,
        status: 'queued'
      }).where(eq(skills.id, skill.id));
      
      await skillQueue.add('process-skill', { 
        skillId: skill.id,
        sourceType: sourceType,
        sourceQuery: sourceQuery
      });
      return c.json({ skillId: skill.id });
    }

    // Deduplication check: Se a query/url já foi processada
    if (sourceQuery) {
      const existingSkills = await db.select().from(skills)
        .where(
          and(
            eq(skills.sourceType, sourceType),
            eq(skills.sourceQuery, sourceQuery)
          )
        )
        .limit(1);
        
      if (existingSkills.length > 0) {
        return c.json({ id: existingSkills[0].id, status: existingSkills[0].status, deduplicated: true }, 200);
      }
    }

    const inserted = await db.insert(skills).values({
      userId: user.id,
      sourceType: sourceType,
      sourceQuery: sourceQuery,
      playlistUrl: sourceUrls.length > 0 ? sourceUrls[0] : null,
      sourceUrls: sourceUrls,
      targetFormat: result.data.targetFormat,
      language: result.data.language,
      status: 'queued',
    }).returning();

    const skill = inserted[0];

    await skillQueue.add('generate-skill', {
      skillId: skill.id,
      sourceType: sourceType,
      sourceQuery: sourceQuery,
      urls: sourceUrls,
      targetFormat: skill.targetFormat,
      language: skill.language,
      userId: user.id
    }, {
      jobId: skill.id
    });

    return c.json({ id: skill.id, status: 'queued' }, 202);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/', async (c) => {
  try {
    const query = c.req.query('q');
    // Sem sessão não há biblioteca para listar. Antes, `userId` ausente fazia a
    // consulta devolver as skills de TODAS as contas.
    const userId = await usuarioAtual(c);
    if (!userId) return c.json(naoAutenticado(), 401);
    const source = c.req.query('source');   // filtra por channelName
    const niche = c.req.query('niche');     // filtra por skillDocument->>'niche'

    const conditions = [];

    if (query) {
      conditions.push(or(
        ilike(skills.name, `%${query}%`),
        ilike(skills.description, `%${query}%`)
      ));
    }
    if (userId) {
      conditions.push(eq(skills.userId, userId));
    }
    if (source) {
      conditions.push(ilike(skills.channelName, `%${source}%`));
    }
    if (niche) {
      // Extrai o campo 'niche' do jsonb skillDocument e compara
      conditions.push(
        sql`${skills.skillDocument}->>'niche' = ${niche}`
      );
    }

    // `and()` devolve `SQL | undefined` para cobrir o caso de lista vazia; checar
    // o resultado (em vez do tamanho da lista) e o que faz o TypeScript estreitar.
    const filtro = and(...conditions);

    const rows = await db
      .select()
      .from(skills)
      .where(filtro ?? undefined)
      .orderBy(desc(skills.createdAt));

    // Injeta o `niche` do skillDocument no shape retornado, sem alterar o schema.
    const withNiche = rows.map((row) => {
      const doc = row.skillDocument as Record<string, unknown> | null;
      return {
        ...row,
        niche: (doc?.niche as string | undefined) ?? null,
      };
    });

    return c.json(withNiche);
  } catch (error: unknown) {
    console.error('GET /api/skills failed:', error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});


// Registrada ANTES de `/:id`: o Hono casa na ordem, e a rota parametrizada
// engoliria "formats" como se fosse um identificador.
/** Formatos oferecidos no download, com o nome que a pessoa lê. */
skillsRouter.get('/formats', (c) =>
  c.json(
    FORMATOS.map((id) => ({
      id,
      label: ROTULO_FORMATO[id],
      // O universal vem primeiro e é o padrão: qualquer agente lê AGENTS.md.
      universal: id === 'generic',
    }))
  )
);

const ROTULO_FORMATO: Record<SkillFormat, string> = {
  generic: 'AGENTS.md (universal)',
  claude: 'Claude Code',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini / Antigravity',
  mcp: 'Servidor MCP',
};

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
    
    const skill = skillResult[0];
    if (!skill) return c.json({ error: 'Skill not found' }, 404);

    /**
     * O formato é escolhido AQUI, na hora de baixar — não na hora de gerar.
     *
     * Renderizar é função pura sobre o documento estruturado que a síntese já
     * gravou: sem rede, sem LLM, sem custo. Perguntar o formato antes de gerar
     * amarrava uma saída só a uma decisão que a pessoa nem sempre sabe tomar
     * naquele momento, e trocar de ideia obrigava a gerar de novo.
     *
     * `generic` (AGENTS.md) é o padrão por ser o formato que qualquer agente lê.
     */
    const pedido = c.req.query('format');
    const format = (FORMATOS.includes(pedido as SkillFormat) ? pedido : skill.targetFormat || 'generic') as SkillFormat;

    let content = skill.skillMdContent;

    const documento = skill.skillDocument as SkillDocument | null;
    if (documento) {
      // O primeiro arquivo do renderer é sempre o principal do formato.
      const arquivos = renderSkill(documento, format);
      content = arquivos[0]?.content ?? content;
    } else if (pedido && pedido !== skill.targetFormat) {
      // Skill antiga, gerada antes do documento estruturado existir: só há o
      // markdown de um formato. Dizer isso é melhor que entregar o arquivo
      // errado com o nome pedido.
      return c.json(
        {
          error: 'format_unavailable',
          message: 'Esta skill foi gerada antes da saída em múltiplos formatos. Gere de novo para escolher o formato.',
        },
        409
      );
    }

    if (!content) {
      return c.json({ error: 'Skill markdown not found' }, 404);
    }

    // Named from the same table the worker and the synthesis prompt use, so the
    // attachment always matches the file that was actually generated.
    const filename = DOWNLOAD_NAME_BY_FORMAT[format] ?? DOWNLOAD_NAME_BY_FORMAT.generic;
    const contentType = format === 'mcp' ? 'text/plain' : 'text/markdown';

    c.header('Content-Type', `${contentType}; charset=utf-8`);
    c.header('Content-Disposition', `attachment; filename="${filename}"`);

    return c.text(content);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/**
 * O pacote completo, renderizado no formato pedido.
 *
 * Existe porque `skillPackage` guarda um formato só — o que a geração produziu.
 * Renderizar outro é função pura sobre `skillDocument`, então não há motivo
 * para gerar de novo: a escolha do formato passou a ser do download, e este
 * endpoint é o que a torna possível para o pacote inteiro, não só o arquivo
 * principal.
 *
 * Devolve os arquivos, e não um ZIP: o front já compacta, e montar ZIP aqui
 * traria uma dependência para fazer o que o navegador já faz.
 */
skillsRouter.get('/:id/package', async (c) => {
  try {
    const skillId = c.req.param('id');
    const linhas = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
    const skill = linhas[0];
    if (!skill) return c.json({ error: 'Skill not found' }, 404);

    const pedido = c.req.query('format');
    const format = (FORMATOS.includes(pedido as SkillFormat) ? pedido : skill.targetFormat || 'generic') as SkillFormat;

    const documento = skill.skillDocument as SkillDocument | null;
    if (!documento) {
      return c.json(
        {
          error: 'format_unavailable',
          message: 'Esta skill foi gerada antes da saída em múltiplos formatos. Gere de novo para escolher o formato.',
        },
        409
      );
    }

    return c.json({ format, files: renderSkill(documento, format) });
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
    
    const sourceUrls = (skill.sourceUrls as string[]) || [skill.playlistUrl];
    
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
      urls: sourceUrls
    }, {
      jobId: `${skill.id}-retry-${Date.now()}` // Bypass BullMQ lock using a unique retry ID
    });
    
    return c.json({ status: 'queued' });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

const appendSkillSchema = z.object({
  playlistUrl: z.string().url().optional(),
  urls: z.array(z.string().url()).min(1).optional()
});

skillsRouter.post('/:id/append', async (c) => {
  try {
    const skillId = c.req.param('id');
    const body = await c.req.json();
    const result = appendSkillSchema.safeParse(body);
    
    if (!result.success) {
      return c.json({ error: 'Invalid payload' }, 400);
    }
    
    const sourceUrls = result.data.urls || (result.data.playlistUrl ? [result.data.playlistUrl] : []);
    
    if (sourceUrls.length === 0) {
      return c.json({ error: 'No valid URLs provided' }, 400);
    }
    
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (skillResult.length === 0) return c.json({ error: 'Skill not found' }, 404);

    await db.update(skills).set({ status: 'queued' }).where(eq(skills.id, skillId));
    
    await skillQueue.add('append-skill', {
      skillId,
      urls: sourceUrls,
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

const updateFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

skillsRouter.patch('/:id/file', async (c) => {
  try {
    const skillId = c.req.param('id');
    // Editar é do Starter para cima: o Free gera, testa e exporta, mas o
    // refino fica atrás da assinatura. O dono vem da skill, não da query.
    const dono = await planOfSkill(skillId);
    if (!dono) return c.json({ error: 'Skill not found' }, 404);
    const barrado = denyUnless(dono.plan, 'skill.edit');
    if (barrado) return c.json(barrado, 402);

    const body = await c.req.json();
    const result = updateFileSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Invalid payload: path and content are required' }, 400);
    }

    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (skillResult.length === 0) return c.json({ error: 'Skill not found' }, 404);

    const skill = skillResult[0];
    const pkg = skill.skillPackage as { root: unknown; blobs: Record<string, { content: string }> } | null;
    if (!pkg) return c.json({ error: 'No skill package to edit' }, 404);

    // Flatten the tree back into FlatFile[], update the target file, then rebuild
    const flatFiles: { path: string; content: string }[] = [];
    function walk(node: Record<string, unknown>, currentPath: string) {
      if (node.type === 'file' && typeof node.sha === 'string') {
        const blob = pkg!.blobs[node.sha as string];
        const filePath = currentPath ? `${currentPath}/${node.name}` : (node.name as string);
        flatFiles.push({ path: filePath, content: blob?.content || '' });
      }
      if (node.type === 'directory' && Array.isArray(node.children)) {
        const dirPath = (node.name === 'root') ? '' : (currentPath ? `${currentPath}/${node.name}` : (node.name as string));
        for (const child of node.children) {
          walk(child as Record<string, unknown>, dirPath);
        }
      }
    }
    walk(pkg.root as Record<string, unknown>, '');

    // Update the matching file or add it if it doesn't exist
    const targetPath = result.data.path.replace(/^\/+/, '');
    const existingIndex = flatFiles.findIndex(f => f.path === targetPath);
    if (existingIndex >= 0) {
      flatFiles[existingIndex].content = result.data.content;
    } else {
      flatFiles.push({ path: targetPath, content: result.data.content });
    }

    // Also update the legacy skillMdContent if the edited file is the main skill file
    const format = (skill.targetFormat || 'generic') as SkillFormat;
    const mainFileName = DOWNLOAD_NAME_BY_FORMAT[format] ?? DOWNLOAD_NAME_BY_FORMAT.generic;
    const isMainFile = targetPath.toLowerCase() === mainFileName.toLowerCase();

    const newPackage = buildGitPackage(flatFiles);

    const updatePayload: Record<string, unknown> = {
      skillPackage: newPackage,
      updatedAt: new Date()
    };
    if (isMainFile) {
      updatePayload.skillMdContent = result.data.content;
    }
    if (targetPath.toLowerCase() === 'human.md') {
      updatePayload.humanMdContent = result.data.content;
    }

    await db.update(skills).set(updatePayload).where(eq(skills.id, skillId));

    return c.json({ ok: true, package: newPackage });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.patch('/:id/document', async (c) => {
  try {
    const skillId = c.req.param('id');
    // Editar é do Starter para cima: o Free gera, testa e exporta, mas o
    // refino fica atrás da assinatura. O dono vem da skill, não da query.
    const dono = await planOfSkill(skillId);
    if (!dono) return c.json({ error: 'Skill not found' }, 404);
    const barrado = denyUnless(dono.plan, 'skill.edit');
    if (barrado) return c.json(barrado, 402);

    const body = await c.req.json();
    
    // Validate the incoming document
    const result = SkillDocumentSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Invalid document schema', details: result.error.errors }, 400);
    }
    const document = result.data;

    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    if (skillResult.length === 0) return c.json({ error: 'Skill not found' }, 404);

    const skill = skillResult[0];
    const targetFormat = (skill.targetFormat || 'generic') as SkillFormat;

    // 1. Re-render the markdown files based on the new visual document
    const flatFiles = renderSkill(document, targetFormat);

    // 2. We MUST preserve the existing `assets/` directory (Breach 1 fix)
    const pkg = skill.skillPackage as { root: unknown; blobs: Record<string, { content: string }> } | null;
    if (pkg) {
      // Find all files that were in the assets folder
      function walkForAssets(node: Record<string, unknown>, currentPath: string) {
        if (node.type === 'file' && typeof node.sha === 'string') {
          const filePath = currentPath ? `${currentPath}/${node.name}` : (node.name as string);
          if (filePath.startsWith('assets/')) {
            const blob = pkg!.blobs[node.sha as string];
            flatFiles.push({ path: filePath, content: blob?.content || '' });
          }
        }
        if (node.type === 'directory' && Array.isArray(node.children)) {
          const dirPath = (node.name === 'root') ? '' : (currentPath ? `${currentPath}/${node.name}` : (node.name as string));
          for (const child of node.children) {
            walkForAssets(child as Record<string, unknown>, dirPath);
          }
        }
      }
      walkForAssets(pkg.root as Record<string, unknown>, '');
    }

    // 3. Build the new git package
    const newPackage = buildGitPackage(flatFiles);

    const skillMd = newPackage.blobs[newPackage.root.children?.find(c => c.name === (DOWNLOAD_NAME_BY_FORMAT[targetFormat] ?? DOWNLOAD_NAME_BY_FORMAT.generic))?.sha || '']?.content || null;
    const humanMd = flatFiles.find(f => f.path.toLowerCase() === 'human.md')?.content || null;

    // 4. Update the database
    await db.update(skills).set({
      skillDocument: document,
      skillPackage: newPackage,
      skillMdContent: skillMd,
      humanMdContent: humanMd,
      updatedAt: new Date()
    }).where(eq(skills.id, skillId));

    return c.json({ ok: true, package: newPackage, document });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export { skillsRouter };
