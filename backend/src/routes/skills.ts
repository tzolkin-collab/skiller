import { Hono, type Context } from 'hono';
import crypto from 'crypto';
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
import { usuarioAtual, naoAutenticado, pareceUuid } from '../lib/current-user.js';
import type { SkillDocument } from '../lib/skill-document.js';

/** A skill lida do banco. Derivado do schema para não repetir 24 campos aqui. */
type Skill = typeof skills.$inferSelect;

/** Ou a rota segue com a skill do dono, ou devolve a recusa já montada. */
type Acesso = { negar: Response } | { userId: string; skill: Skill };

/**
 * A skill de `/:id`, conferindo sessão E posse.
 *
 * Todas as rotas de `/:id` liam a skill direto do parâmetro da URL, sem
 * perguntar quem estava chamando. O id ERA a credencial — e ele fica visível na
 * URL do painel. Com isso, um UUID vazado dava leitura da transcrição, edição
 * do conteúdo, `retry` e DELETE na skill de qualquer conta.
 *
 * Três decisões que não são óbvias:
 *
 * - **404 e não 403** quando a skill é de outra pessoa. Responder "existe, mas
 *   não é sua" confirma o id para quem está enumerando. Quem não é dono não
 *   precisa saber a diferença entre inexistente e alheia.
 * - **Confere o formato do id antes de consultar.** `skills.id` é `uuid` no
 *   Postgres: consultar essa coluna com texto qualquer não devolve vazio, LANÇA.
 *   Sem isto, `/api/skills/foo` vira 500 em vez de 404 — o mesmo motivo que fez
 *   `pareceUuid` existir para o `client_reference_id` do Stripe.
 * - **Devolve a skill junto.** As rotas todas precisavam dela logo em seguida;
 *   separar em duas consultas só dava chance de uma delas esquecer o filtro.
 */
/**
 * Compara dois segredos em tempo constante.
 *
 * `a === b` sai no primeiro byte diferente, e essa diferença de tempo é
 * mensurável pela rede: dá para descobrir o token byte a byte. O hash iguala os
 * comprimentos antes de comparar, porque `timingSafeEqual` lança com tamanhos
 * diferentes — e o erro em si já diria que o palpite tem o tamanho errado.
 */
function segredosIguais(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function skillDoDono(c: Context): Promise<Acesso> {
  const userId = await usuarioAtual(c);
  if (!userId) return { negar: c.json(naoAutenticado(), 401) };

  const skillId = c.req.param('id');
  if (!pareceUuid(skillId)) return { negar: c.json({ error: 'Skill not found' }, 404) };

  const linhas = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, skillId), eq(skills.userId, userId)))
    .limit(1);

  const skill = linhas[0];
  if (!skill) return { negar: c.json({ error: 'Skill not found' }, 404) };

  return { userId, skill };
}

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

// `GET /migrate-now` ficava aqui: executava `ALTER TABLE` sem autenticação
// nenhuma, exposto na internet. Schema muda por migration (regra 7 do
// AGENTS.md) — a coluna que ele criava já vive em `drizzle/`.

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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { skill } = acesso;

    /**
     * O token de compartilhamento nasce aqui, na primeira abertura da skill.
     *
     * Não dá para preenchê-lo na migration: cada linha precisa de um segredo
     * diferente, e schema não gera valor por linha. Cunhar na leitura do dono
     * resolve sem passo manual — o painel busca esta rota antes de mostrar o
     * comando de instalação, então o token existe quando o botão aparece.
     */
    let shareToken = skill.shareToken;
    if (!shareToken) {
      shareToken = crypto.randomBytes(24).toString('base64url');
      await db.update(skills).set({ shareToken }).where(eq(skills.id, skill.id));
    }

    const videosResult = await db.select().from(skillVideos).where(eq(skillVideos.skillId, skill.id));

    return c.json({ ...skill, shareToken, videos: videosResult });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.get('/:id/download', async (c) => {
  try {
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { skill } = acesso;

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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { skill } = acesso;

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


/**
 * O pacote cru, para a IDE instalar.
 *
 * Única rota de `/:id` que não pode exigir sessão: quem busca esta URL é o
 * agente do Cursor/Claude a partir do comando que a pessoa colou, e ele não tem
 * o cookie do navegador. Por isso a autorização aqui é `?t=`, o segredo cunhado
 * em `GET /:id` — e não a sessão.
 *
 * A comparação é feita com `timingSafeEqual` pelo mesmo motivo que a de senha:
 * comparar segredo com `===` vaza o tamanho do prefixo correto no tempo de
 * resposta. Os buffers são igualados no comprimento antes porque a função lança
 * quando os tamanhos diferem — e o próprio lançamento seria um sinal.
 */
skillsRouter.get('/:id/plugin', async (c) => {
  try {
    const skillId = c.req.param('id');
    const oferecido = c.req.query('t');

    // 404 e não 401/403: para quem não tem o token, a skill não existe.
    const naoAchou = () => c.json({ error: 'Plugin package not found' }, 404);

    // A recusa vem ANTES da consulta, de propósito. Rota sem sessão é rota que
    // qualquer um chama em laço; se o `?t=` ausente ainda custasse um SELECT,
    // bastaria um laço de requisições vazias para carregar o banco.
    // Token tem sempre 32 chars base64url (randomBytes(24).toString('base64url')).
    // Rejeitar formato errado ANTES do SELECT elimina a amplificação: um token
    // malformado prova que não veio do painel e não merece uma consulta ao banco.
    const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;
    if (!oferecido || !TOKEN_FORMAT.test(oferecido) || !pareceUuid(skillId)) return naoAchou();

    const linhas = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
    const skill = linhas[0];
    if (!skill || !skill.skillPackage || !skill.shareToken) return naoAchou();
    if (!segredosIguais(oferecido, skill.shareToken)) return naoAchou();

    // Return the raw package JSON which AI tools can easily parse
    return c.json(skill.skillPackage);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

skillsRouter.post('/:id/retry', async (c) => {
  try {
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { userId, skill } = acesso;
    const skillId = skill.id;

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
      urls: sourceUrls,
      // Sem isto o job rodava sem dono, e o débito de créditos no worker é
      // guardado por `if (userId)`: cada retry gerava a playlist inteira de
      // graça. Combinado com a rota estar aberta, era quota de Gemini e YouTube
      // à disposição de qualquer um com um `curl` em laço.
      userId
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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { userId, skill } = acesso;
    const skillId = skill.id;

    const body = await c.req.json();
    const result = appendSkillSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Invalid payload' }, 400);
    }

    const sourceUrls = result.data.urls || (result.data.playlistUrl ? [result.data.playlistUrl] : []);

    if (sourceUrls.length === 0) {
      return c.json({ error: 'No valid URLs provided' }, 400);
    }

    await db.update(skills).set({ status: 'queued' }).where(eq(skills.id, skillId));

    await skillQueue.add('append-skill', {
      skillId,
      urls: sourceUrls,
      isAppend: true,
      // Mesmo motivo do `retry`: sem dono, o worker não debita nada.
      userId
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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;

    await db.delete(skills).where(eq(skills.id, acesso.skill.id));
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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { skill } = acesso;
    const skillId = skill.id;

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
    const acesso = await skillDoDono(c);
    if ('negar' in acesso) return acesso.negar;
    const { skill } = acesso;
    const skillId = skill.id;

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
