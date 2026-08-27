/**
 * As operações da Base da IA expostas como tools MCP.
 *
 * Deliberadamente NÃO são `read`/`write` genéricos. O contrato Karpathy exige
 * que toda escrita atualize índice, log e canvas na mesma transação, e um
 * `write` cru deixaria o agente pular esses passos. As operações são o que
 * garante as 11 regras.
 */
import { db } from '../db/db.js';
import { kbPages, kbLog } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { resolveAccount, currentContext } from './mcp-context.js';
import { can, upgradeMessage } from './plans.js';
import {
  PAGE_TYPES, type PageType, type Frontmatter, type Canvas,
  buildPage, parseFrontmatter, slugify, pathFor, findRelated, today,
  upsertIndexEntry, appendLog, addCanvasNode, emptyCanvas,
  INDEX_PATH, LOG_PATH, CANVAS_PATH,
} from './kb.js';

const INFRA = new Set<string>([INDEX_PATH, LOG_PATH, CANVAS_PATH]);

type ToolResult = { content: { type: 'text'; text: string }[] };

function texto(s: string): ToolResult {
  return { content: [{ type: 'text', text: s }] };
}

const SEM_CONTA = texto(
  'Sua conta Skiller não está conectada a este cliente. ' +
    'Abra Conectores no painel e gere o perfil de conexão para usar a Base da IA.'
);

// ---------------------------------------------------------------------------
// Acesso a arquivos do cofre
// ---------------------------------------------------------------------------

async function lerArquivo(userId: string, path: string): Promise<string | null> {
  const rows = await db
    .select({ content: kbPages.content })
    .from(kbPages)
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, path)))
    .limit(1);
  return rows[0]?.content ?? null;
}

async function gravarArquivo(
  userId: string,
  path: string,
  content: string,
  meta?: { title?: string; type?: string; namespace?: string; status?: string; tags?: string[] }
): Promise<void> {
  await db
    .insert(kbPages)
    .values({
      userId, path, content,
      title: meta?.title ?? null,
      type: meta?.type ?? null,
      namespace: meta?.namespace ?? null,
      status: meta?.status ?? 'active',
      tags: meta?.tags ?? [],
    })
    .onConflictDoUpdate({
      target: [kbPages.userId, kbPages.path],
      set: {
        content,
        title: meta?.title ?? null,
        type: meta?.type ?? null,
        namespace: meta?.namespace ?? null,
        status: meta?.status ?? 'active',
        tags: meta?.tags ?? [],
        updatedAt: new Date(),
      },
    });
}

async function registrar(
  userId: string,
  action: string,
  summary: string,
  pagePath?: string
): Promise<void> {
  await db.insert(kbLog).values({
    userId, action, summary,
    pagePath: pagePath ?? null,
    channel: currentContext().channel,
  });
}

// ---------------------------------------------------------------------------
// Definições
// ---------------------------------------------------------------------------

export const KB_TOOLS = [
  {
    name: 'kb_ingest',
    description:
      'Registra conhecimento na Base da IA do usuário. Cria ou atualiza uma página ' +
      'da wiki e mantém índice, log e canvas em sincronia. Use ao aprender algo que ' +
      'vale reter entre sessões: uma decisão e seu porquê, um comportamento de ' +
      'integração, uma pegadinha descoberta.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Título humano da página.' },
        type: { type: 'string', enum: PAGE_TYPES, description: 'Tipo — define a pasta.' },
        body: {
          type: 'string',
          description:
            'Corpo em markdown. Use as seções do contrato: Resumo, Detalhes, ' +
            'Decisões Tomadas, Learnings, Relacionados. Marque com 🟡 HIPÓTESE o que ' +
            'você inferiu e não verificou.',
        },
        tags: { type: 'array', items: { type: 'string' } },
        sources: {
          type: 'array', items: { type: 'string' },
          description: 'De onde veio: URL, caminho, ou `session:<id>`. Obrigatório.',
        },
        namespace: { type: 'string', description: 'Sub-produto, quando houver.' },
      },
      required: ['title', 'type', 'body', 'sources'],
    },
  },
  {
    name: 'kb_query',
    description:
      'Consulta a Base da IA. Lê o índice, seleciona as páginas relevantes e devolve ' +
      'o conteúdo delas para você sintetizar a resposta. Use antes de responder ' +
      'qualquer coisa que o usuário já possa ter registrado.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'A pergunta, em linguagem natural.' },
        type: { type: 'string', enum: PAGE_TYPES, description: 'Filtro opcional por tipo.' },
      },
      required: ['question'],
    },
  },
  {
    name: 'kb_read',
    description: 'Lê uma página específica da Base da IA pelo caminho.',
    inputSchema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Ex.: wiki/features/x.md' } },
      required: ['path'],
    },
  },
  {
    name: 'kb_lint',
    description:
      'Auditoria de saúde da Base: páginas órfãs, hipóteses pendentes há mais de ' +
      '14 dias, frontmatter inválido e possíveis contradições. Reporta, não corrige.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'kb_remove_request',
    description:
      'Marca uma página para remoção. NÃO apaga: registra o pedido com o motivo ' +
      'resumido para o humano aprovar no painel. Conhecimento só sai da base com ' +
      'confirmação de gente.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        reason: { type: 'string', description: 'Por que deve sair, em 1–2 frases.' },
      },
      required: ['path', 'reason'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleKbTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (!name.startsWith('kb_')) return null;

  const conta = await resolveAccount();
  if (!conta) return SEM_CONTA;

  // A Base da IA é o entregável do Pro. Starter tem skills e conectores.
  if (!can(conta.plan, 'kb')) {
    return texto(
      `${upgradeMessage('kb', conta.plan)}

` +
        'A Base da IA guarda o que você aprende entre sessões e fica acessível de ' +
        'qualquer agente. Ative no painel, em Configurações → Plano.'
    );
  }
  const userId = conta.userId;

  switch (name) {
    case 'kb_ingest': return ingest(userId, args);
    case 'kb_query': return query(userId, args);
    case 'kb_read': return read(userId, args);
    case 'kb_lint': return lint(userId);
    case 'kb_remove_request': return removeRequest(userId, args);
    default: return texto(`Ferramenta desconhecida: ${name}`);
  }
}

/** Os 7 passos do `/memory-ingest`, indivisíveis. */
async function ingest(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const title = String(args.title ?? '').trim();
  const type = String(args.type ?? '') as PageType;
  const body = String(args.body ?? '').trim();
  const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
  const sources = Array.isArray(args.sources) ? args.sources.map(String) : [];
  const namespace = args.namespace ? String(args.namespace) : undefined;

  if (!title || !body) return texto('`title` e `body` são obrigatórios.');
  if (!PAGE_TYPES.includes(type)) {
    return texto(`\`type\` inválido. Use um de: ${PAGE_TYPES.join(', ')}`);
  }
  // Regra: sem proveniência não entra. É o que impede conhecimento anônimo —
  // e o que permite rastrear de volta quando algo estiver errado.
  if (sources.length === 0) {
    return texto('`sources` é obrigatório: informe a origem (URL, caminho ou `session:<id>`).');
  }

  const path = pathFor(type, slugify(title), namespace);
  const data = today();
  const existente = await lerArquivo(userId, path);
  const created = existente ? String(parseFrontmatter(existente).data.created ?? data) : data;

  const fm: Frontmatter = { title, type, tags, namespace, sources, created, updated: data, status: 'active' };

  // 1-3. página
  await gravarArquivo(userId, path, buildPage(fm, body), { title, type, namespace, tags, status: 'active' });

  // 4. índice
  const idx = (await lerArquivo(userId, INDEX_PATH)) ?? '';
  await gravarArquivo(userId, INDEX_PATH, upsertIndexEntry(idx, fm, path), { title: 'Índice', type: null as never });

  // 5. log
  const log = (await lerArquivo(userId, LOG_PATH)) ?? '';
  await gravarArquivo(
    userId, LOG_PATH,
    appendLog(log, data, existente ? 'update' : 'ingest', title, currentContext().channel ?? undefined),
    { title: 'Log', type: null as never }
  );

  // 6. canvas
  const canvasRaw = await lerArquivo(userId, CANVAS_PATH);
  let canvas: Canvas = emptyCanvas();
  if (canvasRaw) {
    try { canvas = JSON.parse(canvasRaw) as Canvas; } catch { canvas = emptyCanvas(); }
  }
  await gravarArquivo(
    userId, CANVAS_PATH,
    JSON.stringify(addCanvasNode(canvas, path, title, data), null, 2),
    { title: 'Tracking', type: null as never }
  );

  await registrar(userId, existente ? 'update' : 'ingest', title, path);

  // 7. contradições
  const outras = await db
    .select({ path: kbPages.path, type: kbPages.type, tags: kbPages.tags })
    .from(kbPages)
    .where(eq(kbPages.userId, userId));

  const relacionadas = findRelated(fm, outras.filter((p) => p.path !== path));
  const aviso = relacionadas.length
    ? `\n\n⚠️ Páginas do mesmo tipo com tags em comum — verifique se alguma contradiz esta e sinalize com um bloco \`> ⚠️ CONFLITO\` na mais antiga:\n${relacionadas.map((p) => `- ${p}`).join('\n')}`
    : '';

  return texto(`${existente ? 'Atualizada' : 'Criada'}: ${path}\nÍndice, log e canvas atualizados.${aviso}`);
}

async function query(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const question = String(args.question ?? '').trim();
  const tipo = args.type ? String(args.type) : null;
  if (!question) return texto('`question` é obrigatório.');

  const termos = question
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);

  const base = tipo
    ? and(eq(kbPages.userId, userId), eq(kbPages.type, tipo))
    : eq(kbPages.userId, userId);

  const candidatas = await db
    .select({ path: kbPages.path, title: kbPages.title, content: kbPages.content, type: kbPages.type })
    .from(kbPages)
    .where(base)
    .orderBy(desc(kbPages.updatedAt))
    .limit(200);

  const pontuadas = candidatas
    // index, log e canvas sao a infraestrutura do cofre, nao conhecimento.
    // Sem este filtro o log aparece como "pagina relevante" em toda busca,
    // porque contem o titulo de tudo que ja foi gravado.
    .filter((p) => !INFRA.has(p.path))
    .map((p) => {
      const alvo = `${p.title ?? ''} ${p.content}`.toLowerCase();
      const score = termos.reduce((s, t) => s + (alvo.includes(t) ? 1 : 0), 0);
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (pontuadas.length === 0) {
    return texto(`Nada na Base sobre "${question}". Se descobrir a resposta, registre com \`kb_ingest\`.`);
  }

  const corpo = pontuadas
    .map((p) => `### ${p.title ?? p.path}\n_${p.path}_\n\n${p.content}`)
    .join('\n\n---\n\n');

  await registrar(userId, 'query', question);
  return texto(`${pontuadas.length} página(s) relevante(s):\n\n${corpo}`);
}

async function read(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const path = String(args.path ?? '').trim();
  if (!path) return texto('`path` é obrigatório.');
  const content = await lerArquivo(userId, path);
  return content ? texto(content) : texto(`Não existe: ${path}`);
}

async function lint(userId: string): Promise<ToolResult> {
  const paginas = await db
    .select({ path: kbPages.path, title: kbPages.title, content: kbPages.content, updatedAt: kbPages.updatedAt })
    .from(kbPages)
    .where(eq(kbPages.userId, userId));

  const wiki = paginas.filter((p) => p.path.endsWith('.md') && !p.path.endsWith('index.md') && !p.path.endsWith('log.md'));
  const achados: string[] = [];

  const semFrontmatter = wiki.filter((p) => !p.content.startsWith('---'));
  if (semFrontmatter.length) {
    achados.push(`**Frontmatter ausente (${semFrontmatter.length})**\n${semFrontmatter.map((p) => `- ${p.path}`).join('\n')}`);
  }

  const limite = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const hipoteses = wiki.filter((p) => p.content.includes('🟡 HIPÓTESE') && p.updatedAt.getTime() < limite);
  if (hipoteses.length) {
    achados.push(`**Hipóteses pendentes há mais de 14 dias (${hipoteses.length})**\n${hipoteses.map((p) => `- ${p.path}`).join('\n')}`);
  }

  const idx = (await lerArquivo(userId, INDEX_PATH)) ?? '';
  const orfas = wiki.filter((p) => !idx.includes(p.path.replace(/^wiki\//, '')));
  if (orfas.length) {
    achados.push(`**Fora do índice (${orfas.length})**\n${orfas.map((p) => `- ${p.path}`).join('\n')}`);
  }

  const conflitos = wiki.filter((p) => p.content.includes('⚠️ CONFLITO'));
  if (conflitos.length) {
    achados.push(`**Conflitos sinalizados e não resolvidos (${conflitos.length})**\n${conflitos.map((p) => `- ${p.path}`).join('\n')}`);
  }

  await registrar(userId, 'lint', `${achados.length} categoria(s) de achado`);

  return texto(
    achados.length
      ? `Auditoria de ${wiki.length} página(s):\n\n${achados.join('\n\n')}\n\nNada foi corrigido — diga o que quer que eu ajuste.`
      : `Auditoria de ${wiki.length} página(s): nenhum problema encontrado.`
  );
}

/** O agente marca; quem apaga é gente. */
async function removeRequest(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const path = String(args.path ?? '').trim();
  const reason = String(args.reason ?? '').trim();
  if (!path || !reason) return texto('`path` e `reason` são obrigatórios.');

  const content = await lerArquivo(userId, path);
  if (!content) return texto(`Não existe: ${path}`);

  await db
    .update(kbPages)
    .set({ status: 'deprecated', updatedAt: new Date() })
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, path)));

  const log = (await lerArquivo(userId, LOG_PATH)) ?? '';
  await gravarArquivo(
    userId, LOG_PATH,
    appendLog(log, today(), 'remove-request', `${path} — ${reason}`, currentContext().channel ?? undefined),
    { title: 'Log', type: null as never }
  );

  await registrar(userId, 'remove-request', reason, path);

  return texto(
    `Marcada para remoção: ${path}\nMotivo registrado: ${reason}\n\n` +
      'A página segue na base como `deprecated` até alguém aprovar a remoção no painel. Nada foi apagado.'
  );
}
