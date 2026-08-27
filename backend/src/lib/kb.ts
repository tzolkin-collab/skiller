/**
 * Primitivas da Base da IA.
 *
 * Implementa o contrato Karpathy LLM-Wiki v2.0 que já roda em disco no cofre do
 * Haylander, com uma única tradução: arquivo vira linha. O markdown continua
 * sendo a fonte da verdade, incluindo o frontmatter.
 *
 * As 11 regras do contrato viram código aqui — não confie no agente para
 * lembrar delas.
 */

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export type PageType =
  | 'skill' | 'architecture' | 'feature' | 'decision' | 'integration' | 'security'
  | 'workflow' | 'migration' | 'output' | 'stakeholder';

export const PAGE_TYPES: PageType[] = [
  'skill', 'architecture', 'feature', 'decision', 'integration', 'security',
  'workflow', 'migration', 'output', 'stakeholder',
];

/** Cada tipo mora numa pasta. Regra do contrato, não convenção. */
const FOLDER: Record<PageType, string> = {
  skill: 'skills',
  architecture: 'architecture',
  feature: 'features',
  decision: 'decisions',
  integration: 'integrations',
  security: 'security',
  workflow: 'workflows',
  migration: 'migrations',
  output: 'outputs',
  stakeholder: 'stakeholders',
};

export interface Frontmatter {
  title: string;
  type: PageType;
  tags: string[];
  namespace?: string;
  sources: string[];
  created: string;
  updated: string;
  status?: 'draft' | 'active' | 'deprecated';
}

/**
 * Parser deliberadamente restrito: chaves planas, string ou lista inline.
 * É exatamente o que o template usa. Um parser YAML completo aceitaria
 * estruturas que o contrato não prevê e que ninguém sabe renderizar depois.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: content };

  const bloco = content.slice(3, end).trim();
  const body = content.slice(end + 4).replace(/^\n/, '');
  const data: Record<string, unknown> = {};

  for (const linha of bloco.split('\n')) {
    const sep = linha.indexOf(':');
    if (sep === -1) continue;
    const chave = linha.slice(0, sep).trim();
    if (!chave) continue;

    let valor = linha.slice(sep + 1).trim();
    valor = valor.replace(/\s+#.*$/, '').trim();

    if (valor.startsWith('[') && valor.endsWith(']')) {
      data[chave] = valor
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      data[chave] = valor.replace(/^['"]|['"]$/g, '');
    }
  }

  return { data, body };
}

function serializeFrontmatter(fm: Frontmatter): string {
  const linhas = [
    `title: ${fm.title}`,
    `type: ${fm.type}`,
    `tags: [${fm.tags.join(', ')}]`,
  ];
  if (fm.namespace) linhas.push(`namespace: ${fm.namespace}`);
  linhas.push(`sources: [${fm.sources.join(', ')}]`);
  linhas.push(`created: ${fm.created}`);
  linhas.push(`updated: ${fm.updated}`);
  if (fm.status) linhas.push(`status: ${fm.status}`);
  return `---\n${linhas.join('\n')}\n---\n`;
}

export function buildPage(fm: Frontmatter, body: string): string {
  return `${serializeFrontmatter(fm)}\n${body.trim()}\n`;
}

// ---------------------------------------------------------------------------
// Caminhos
// ---------------------------------------------------------------------------

export function slugify(titulo: string): string {
  const s = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'sem-titulo';
}

/** `wiki/features/x.md` — ou `wiki/features/secretaria/x.md` com namespace. */
export function pathFor(type: PageType, slug: string, namespace?: string): string {
  const pasta = FOLDER[type];
  // Regra do contrato: decisions/ e stakeholders/ ficam planas mesmo em projeto
  // multi-produto, porque decisão cross-cutting é frequente.
  const usaNamespace = Boolean(namespace) && type !== 'decision' && type !== 'stakeholder';
  return usaNamespace ? `wiki/${pasta}/${namespace}/${slug}.md` : `wiki/${pasta}/${slug}.md`;
}

export const INDEX_PATH = 'wiki/index.md';
export const LOG_PATH = 'wiki/log.md';
export const CANVAS_PATH = 'wiki/tracking.canvas';

// ---------------------------------------------------------------------------
// index.md
// ---------------------------------------------------------------------------

const SECAO: Record<PageType, string> = {
  skill: 'Skills',
  architecture: 'Arquitetura',
  feature: 'Features',
  decision: 'Decisões (ADRs)',
  integration: 'Integrações',
  security: 'Segurança',
  workflow: 'Workflows',
  migration: 'Migrations',
  output: 'Outputs',
  stakeholder: 'Stakeholders',
};

/**
 * Insere ou atualiza a entrada da página na seção correta, criando a seção se
 * ainda não existir. Migrations ficam de fora por contrato (regra 11).
 */
export function upsertIndexEntry(indexContent: string, fm: Frontmatter, path: string): string {
  if (fm.type === 'migration') return indexContent;

  const rel = path.replace(/^wiki\//, '');
  const secao = `## ${SECAO[fm.type]}`;
  const linha = `- [${fm.title}](${rel}) — ${fm.tags.slice(0, 3).join(', ') || 'sem tags'}`;
  const base = indexContent.trim() || '# Índice';

  if (base.includes(`](${rel})`)) {
    return base
      .split('\n')
      .map((l) => (l.includes(`](${rel})`) ? linha : l))
      .join('\n') + '\n';
  }

  if (!base.includes(secao)) {
    return `${base}\n\n${secao}\n\n${linha}\n`;
  }

  const linhas = base.split('\n');
  const i = linhas.findIndex((l) => l.trim() === secao);
  let j = i + 1;
  while (j < linhas.length && !linhas[j].startsWith('## ')) j++;
  linhas.splice(j, 0, linha);
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// log.md — append-only (regra 6)
// ---------------------------------------------------------------------------

export function appendLog(
  logContent: string,
  data: string,
  acao: string,
  titulo: string,
  canal?: string
): string {
  const base = logContent.trim() || '# Log\n\n> Append-only. Nunca reescreva linhas passadas.';
  const origem = canal ? ` _(${canal})_` : '';
  return `${base}\n\n## [${data}] ${acao} | ${titulo}${origem}\n`;
}

// ---------------------------------------------------------------------------
// tracking.canvas — formato aberto do Obsidian Canvas
// ---------------------------------------------------------------------------

export interface CanvasNode {
  id: string;
  type: 'text' | 'file';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: string;
  toNode: string;
  toSide: string;
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const DATE_Y = -60;
const DATE_W = 420;
const DATE_H = 280;
const FILE_Y = 420;
const FILE_W = 340;
const FILE_H = 1400;
const GAP_DATA = 760;
const GAP_ARQUIVO = 380;

export function emptyCanvas(): Canvas {
  return { nodes: [], edges: [] };
}

/**
 * Coloca a página no canvas seguindo a geometria do cofre real: as datas formam
 * uma espinha horizontal no topo, ligadas da esquerda para a direita; os
 * arquivos alterados naquele dia descem abaixo dela.
 */
export function addCanvasNode(
  canvas: Canvas,
  path: string,
  titulo: string,
  data: string,
  cor?: string
): Canvas {
  const nodes = canvas.nodes.map((n) => ({ ...n }));
  const edges = [...canvas.edges];

  const dateId = `e_${data.replace(/-/g, '')}`;
  let dateNode = nodes.find((n) => n.id === dateId);

  if (!dateNode) {
    const datas = nodes.filter((n) => n.id.startsWith('e_')).sort((a, b) => a.x - b.x);
    const anterior = datas[datas.length - 1];
    const x = anterior ? anterior.x + GAP_DATA : 0;

    dateNode = {
      id: dateId,
      type: 'text',
      x,
      y: DATE_Y,
      width: DATE_W,
      height: DATE_H,
      text: `## 📅 ${data}`,
    };
    nodes.push(dateNode);

    if (anterior) {
      edges.push({
        id: `edge_${dateId}`,
        fromNode: anterior.id,
        fromSide: 'right',
        toNode: dateId,
        toSide: 'left',
      });
    }
  }

  const fileId = `file_${slugify(path)}`;
  if (!nodes.some((n) => n.id === fileId)) {
    const irmaos = edges.filter((e) => e.fromNode === dateId).length;
    nodes.push({
      id: fileId,
      type: 'file',
      file: path,
      x: dateNode.x + irmaos * GAP_ARQUIVO,
      y: FILE_Y,
      width: FILE_W,
      height: FILE_H,
      ...(cor ? { color: cor } : {}),
    });
    edges.push({
      id: `edge_${fileId}`,
      fromNode: dateId,
      fromSide: 'bottom',
      toNode: fileId,
      toSide: 'top',
    });
  }

  // O nó de data lista o que mudou, para o canvas ser legível sem abrir arquivo.
  if (dateNode.text && !dateNode.text.includes(titulo)) {
    dateNode.text = `${dateNode.text}\n- ${titulo}`;
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Contradições (regra 5)
// ---------------------------------------------------------------------------

/**
 * Heurística barata: páginas do mesmo tipo que compartilham tags. Não resolve a
 * contradição — sinaliza para o humano, que é o que o contrato manda.
 */
export function findRelated(
  fm: Frontmatter,
  existentes: { path: string; type: string | null; tags: string[] | null }[]
): string[] {
  const minhas = new Set(fm.tags.map((t) => t.toLowerCase()));
  if (minhas.size === 0) return [];

  return existentes
    .filter((p) => p.type === fm.type)
    .filter((p) => (p.tags ?? []).some((t) => minhas.has(String(t).toLowerCase())))
    .map((p) => p.path)
    .slice(0, 5);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
