/**
 * Leitura da Base da IA para o painel.
 *
 * A escrita acontece pelo MCP — é o agente que registra o que aprendeu. Aqui o
 * humano só lê, e faz a única escrita que é dele por contrato: aprovar a
 * remoção que o agente pediu.
 *
 * TODO(D1): estas rotas ainda não resolvem o usuário por sessão. Enquanto a
 * autenticação do painel não existe, `userId` vem por query param — o mesmo
 * padrão das outras rotas do app, e a mesma dívida.
 */
import { Hono, type Context } from 'hono';
import { db } from '../db/db.js';
import { kbPages, kbLog, skills } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getErrorMessage } from '../lib/errors.js';
import {
  parseFrontmatter, buildPage, pathFor, type Frontmatter,
  INDEX_PATH, LOG_PATH, CANVAS_PATH, appendLog, today,
  upsertIndexEntry, emptyCanvas, addCanvasNode
} from '../lib/kb.js';
import { ingestarSkillNaKb } from '../lib/kb-skill-bridge.js';
import { usuarioAtual, naoAutenticado } from '../lib/current-user.js';
import { planOf, denyUnless } from '../lib/entitlements.js';

export const kbRouter = new Hono();

const INFRA = new Set([INDEX_PATH, LOG_PATH, CANVAS_PATH]);

/**
 * Dono do cofre. Vem do cookie de sessão — antes vinha de `?userId=`, o que
 * significava que qualquer um lia a Base de qualquer conta trocando um id na
 * barra de endereços.
 */
type Acesso = { userId: string } | { negar: Response };

/**
 * Dono do cofre E direito de usa-lo.
 *
 * Antes so conferia sessao. A Base e capacidade de Pro (`kb` em `plans.ts`),
 * mas nenhuma das seis rotas perguntava o plano — entao quem estava no teste do
 * Starter, ou sem plano nenhum, lia e escrevia a Base normalmente.
 *
 * 401 e 403 sao coisas diferentes de proposito: "entre na sua conta" e "seu
 * plano nao inclui isso" levam a telas diferentes.
 */
async function exigirAcessoKb(c: Context): Promise<Acesso> {
  const userId = await usuarioAtual(c);
  if (!userId) return { negar: c.json(naoAutenticado(), 401) };

  const barrado = denyUnless(await planOf(userId), 'kb');
  if (barrado) return { negar: c.json(barrado, 403) };

  return { userId };
}

/** Inicializa a estrutura do cofre da Base da IA para o usuário. */
kbRouter.post('/init', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const data = today();

    // 1. Index mestre limpo
    await db
      .insert(kbPages)
      .values({ userId, path: INDEX_PATH, content: '# Índice da Base da IA\n', title: 'Índice' })
      .onConflictDoNothing();

    // 2. Log append-only inicial
    const initialLog = appendLog('# Log de Alterações\n', data, 'init', 'Cofre Inicializado', 'painel');
    await db
      .insert(kbPages)
      .values({ userId, path: LOG_PATH, content: initialLog, title: 'Log' })
      .onConflictDoNothing();

    // 3. Canvas visual inicial
    const canvas = emptyCanvas();
    await db
      .insert(kbPages)
      .values({ userId, path: CANVAS_PATH, content: JSON.stringify(canvas), title: 'Canvas' })
      .onConflictDoNothing();

    await db.insert(kbLog).values({
      userId,
      action: 'init',
      summary: 'Inicialização da Base da IA',
      channel: 'painel',
    });

    // 4. Ingesta automaticamente todas as skills existentes da conta (migração / inicialização)
    const userSkills = await db
      .select()
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.status, 'completed')));

    let skillsIngestadas = 0;
    for (const s of userSkills) {
      const qte = await ingestarSkillNaKb(userId, s);
      if (qte > 0) skillsIngestadas++;
    }

    return c.json({
      ok: true,
      message: 'Base da IA inicializada com sucesso.',
      skillsIngestadas,
    });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/** Catálogo do cofre, sem o corpo das páginas — a lista pode ficar grande. */
kbRouter.get('/pages', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const rows = await db
      .select({
        path: kbPages.path,
        title: kbPages.title,
        type: kbPages.type,
        namespace: kbPages.namespace,
        status: kbPages.status,
        tags: kbPages.tags,
        updatedAt: kbPages.updatedAt,
      })
      .from(kbPages)
      .where(eq(kbPages.userId, userId))
      .orderBy(desc(kbPages.updatedAt));

    return c.json(rows.filter((r) => !INFRA.has(r.path)));
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/** Uma página, com o frontmatter já separado do corpo para a UI não reparsear. */
kbRouter.get('/page', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  const path = c.req.query('path');
  if (!path) return c.json({ error: 'path é obrigatório' }, 400);

  try {
    const rows = await db
      .select()
      .from(kbPages)
      .where(and(eq(kbPages.userId, userId), eq(kbPages.path, path)))
      .limit(1);

    if (rows.length === 0) return c.json({ error: 'Página não encontrada' }, 404);

    const { data, body } = parseFrontmatter(rows[0].content);
    return c.json({ ...rows[0], frontmatter: data, body });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/** O canvas cru, no formato aberto do Obsidian. */
kbRouter.get('/canvas', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const rows = await db
      .select({ content: kbPages.content })
      .from(kbPages)
      .where(and(eq(kbPages.userId, userId), eq(kbPages.path, CANVAS_PATH)))
      .limit(1);

    if (rows.length === 0) return c.json({ nodes: [], edges: [] });
    return c.json(JSON.parse(rows[0].content));
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/** Histórico — alimenta a timeline e a auditoria, que são o mesmo dado. */
kbRouter.get('/log', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const rows = await db
      .select()
      .from(kbLog)
      .where(eq(kbLog.userId, userId))
      .orderBy(desc(kbLog.createdAt))
      .limit(200);
    return c.json(rows);
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/** Páginas que o agente pediu para remover e aguardam decisão humana. */
kbRouter.get('/pending-removal', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const paginas = await db
      .select({ path: kbPages.path, title: kbPages.title, updatedAt: kbPages.updatedAt })
      .from(kbPages)
      .where(and(eq(kbPages.userId, userId), eq(kbPages.status, 'deprecated')));

    const pedidos = await db
      .select({ pagePath: kbLog.pagePath, summary: kbLog.summary, channel: kbLog.channel, createdAt: kbLog.createdAt })
      .from(kbLog)
      .where(and(eq(kbLog.userId, userId), eq(kbLog.action, 'remove-request')))
      .orderBy(desc(kbLog.createdAt));

    return c.json(
      paginas.map((p) => {
        const pedido = pedidos.find((r) => r.pagePath === p.path);
        return { ...p, reason: pedido?.summary ?? null, channel: pedido?.channel ?? null, requestedAt: pedido?.createdAt ?? null };
      })
    );
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/**
 * A decisão humana sobre a remoção.
 *
 * `approve` apaga a página; `reject` devolve ao estado ativo. Nos dois casos o
 * `log.md` recebe uma linha — nada some do histórico, que é a regra 6.
 */
kbRouter.post('/removal', async (c) => {
  const acesso = await exigirAcessoKb(c);
  if ('negar' in acesso) return acesso.negar;
  const { userId } = acesso;

  try {
    const body = (await c.req.json()) as { path?: string; decision?: 'approve' | 'reject' };
    const { path, decision } = body;
    if (!path || (decision !== 'approve' && decision !== 'reject')) {
      return c.json({ error: 'path e decision (approve|reject) são obrigatórios' }, 400);
    }

    const alvo = and(eq(kbPages.userId, userId), eq(kbPages.path, path));

    if (decision === 'approve') {
      await db.delete(kbPages).where(alvo);
    } else {
      await db.update(kbPages).set({ status: 'active', updatedAt: new Date() }).where(alvo);
    }

    const logRows = await db
      .select({ content: kbPages.content })
      .from(kbPages)
      .where(and(eq(kbPages.userId, userId), eq(kbPages.path, LOG_PATH)))
      .limit(1);

    const acao = decision === 'approve' ? 'remove-approved' : 'remove-rejected';
    const novoLog = appendLog(logRows[0]?.content ?? '', today(), acao, path, 'painel');

    await db
      .insert(kbPages)
      .values({ userId, path: LOG_PATH, content: novoLog, title: 'Log' })
      .onConflictDoUpdate({
        target: [kbPages.userId, kbPages.path],
        set: { content: novoLog, updatedAt: new Date() },
      });

    await db.insert(kbLog).values({ userId, action: acao, pagePath: path, summary: path, channel: 'painel' });

    return c.json({ ok: true, decision });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});
