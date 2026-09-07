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

// ---------------------------------------------------------------------------
// Busca — quais páginas respondem a uma pergunta
//
// O ranqueamento anterior era `alvo.includes(termo)` somando 1 por termo
// presente. Três defeitos que se somavam: substring crua (`base` casava dentro
// de `database`), todo termo valendo o mesmo, e nenhum descarte de palavra
// vazia — `sobre`, `como` e `qual` passavam pelo filtro de tamanho e batiam em
// toda página. Numa base de skills geradas, onde `skill`, `agente` e
// `conectores` aparecem em todas elas, isso empatava a base inteira e as cinco
// primeiras saíam por ordem de escrita, não por relevância.
//
// Aqui a seleção é BM25 com IDF: termo presente em toda página vale zero,
// termo raro decide o ranking, e frequência satura em vez de crescer linear —
// senão a página mais longa ganha sempre.
// ---------------------------------------------------------------------------

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Palavras que não discriminam nada. Sem elas o filtro de tamanho deixava
 * passar `sobre`, `quando`, `qualquer` — presentes em quase toda página.
 */
const STOPWORDS = new Set(
  (
    'a as ao aos à às com como da das de do dos e em entre era essa esse esta este eu foi ' +
    'ha isso isto já lhe mais mas me mesmo meu minha muito na nas no nos nós não o os ou ' +
    'para pela pelas pelo pelos por porque qual quais quando que quem se sem ser seu sua ' +
    'são so só também tem ter teu tua um uma umas uns vocé você vocês sobre onde qualquer ' +
    'cada pode posso podem fazer faz usar usa deve devem está estão estar tudo todo toda ' +
    'todos todas quero preciso sei feito feita feitos feitas sendo sido havia haver ' +
    'tinha temos quer queria precisam existe existem algum alguma alguns algumas ' +
    'outro outra outros outras entao assim ainda apenas agora coisa coisas ' +
    'a an and are as at be but by can did do does for from had has have how in is it its ' +
    'of on or that the their then there these this to was what when where which who why ' +
    'will with you your'
  )
    .split(' ')
    .map(semAcento)
);

/** Quebra em palavras comparáveis: sem acento, sem pontuação, sem stopword. */
export function tokenize(texto: string): string[] {
  return semAcento(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export type RankablePage = {
  path: string;
  title: string | null;
  content: string;
  tags?: string[] | null;
};

/** Saturação da frequência e normalização por tamanho — parâmetros BM25 usuais. */
const K1 = 1.2;
const B = 0.6;
/**
 * Fração mínima dos termos da pergunta que a melhor página precisa conter para
 * a resposta valer alguma coisa. É o piso que permite ao `kb_query` dizer que
 * não sabe — ver o comentário em `rankPages`.
 */
const COBERTURA_MINIMA = 0.34;
/** Bater no título vale mais que bater no meio do corpo; em tag, quase tanto. */
const PESO_TITULO = 3;
const PESO_TAG = 2;

function frequencias(p: RankablePage): { freq: Map<string, number>; tamanho: number } {
  const freq = new Map<string, number>();
  const somar = (tokens: string[], peso: number) => {
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + peso);
  };
  somar(tokenize(p.content), 1);
  somar(tokenize(p.title ?? ''), PESO_TITULO);
  somar(tokenize((p.tags ?? []).join(' ')), PESO_TAG);

  let tamanho = 0;
  for (const n of freq.values()) tamanho += n;
  return { freq, tamanho: tamanho || 1 };
}

/**
 * Devolve as páginas que realmente respondem à pergunta, da mais relevante
 * para a menos, já cortando o rabo fraco do ranking.
 */
export function rankPages<P extends RankablePage>(
  pergunta: string,
  paginas: P[],
  limite = 5
): (P & { score: number })[] {
  const termos = [...new Set(tokenize(pergunta))].slice(0, 12);
  if (termos.length === 0 || paginas.length === 0) return [];

  const docs = paginas.map((page) => ({ page, ...frequencias(page) }));
  const total = docs.length;
  const tamanhoMedio = docs.reduce((s, d) => s + d.tamanho, 0) / total;

  const df = new Map<string, number>();
  for (const t of termos) {
    df.set(t, docs.reduce((n, d) => n + (d.freq.has(t) ? 1 : 0), 0));
  }

  // log((N+1)/(df+1)) zera o termo que está em TODA página. É o que fazia
  // `conectores` e `mcp` promoverem skills de vendas e de canal do YouTube.
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return n === 0 ? 0 : Math.log((total + 1) / (n + 1));
  };

  const bm25 = (d: (typeof docs)[number], comIdf: boolean) =>
    termos.reduce((s, t) => {
      const f = d.freq.get(t) ?? 0;
      const peso = comIdf ? idf(t) : 1;
      if (f === 0 || peso === 0) return s;
      const norma = 1 - B + B * (d.tamanho / tamanhoMedio);
      return s + peso * ((f * (K1 + 1)) / (f + K1 * norma));
    }, 0);

  const pontuar = (comIdf: boolean) =>
    docs.map((doc) => ({ doc, score: bm25(doc, comIdf) })).filter((x) => x.score > 0);

  // Base pequena e homogênea pode ter todo termo da pergunta em toda página, e
  // aí o IDF zera o ranking inteiro. Devolver por frequência é melhor que
  // afirmar que não há nada registrado.
  const comIdf = pontuar(true);
  const pontuadas = comIdf.length > 0 ? comIdf : pontuar(false);
  if (pontuadas.length === 0) return [];

  pontuadas.sort((a, b) => b.score - a.score);

  // Piso absoluto, antes do corte relativo. O corte relativo sozinho sempre
  // devolve alguma coisa, porque só compara os candidatos entre si: perguntado
  // sobre OAuth numa base que nunca ouviu falar de OAuth, ele entrega a página
  // que por acaso cita "conectores" e o agente do outro lado sintetiza em cima
  // do ruído sem saber que é ruído. Se a melhor página não cobre nem um terço
  // dos termos da pergunta, a base não trata do assunto — e dizer isso vale
  // mais que devolver o menos-errado.
  const cobertos = termos.filter((t) => pontuadas[0].doc.freq.has(t)).length;
  if (cobertos / termos.length < COBERTURA_MINIMA) return [];

  // Corte relativo: o que pontua menos de um quarto do primeiro é ruído que só
  // gasta contexto de quem chamou.
  const corte = pontuadas[0].score * 0.25;
  return pontuadas
    .filter((x) => x.score >= corte)
    .slice(0, limite)
    .map((x) => ({ ...x.doc.page, score: x.score }));
}

/** Teto de caracteres por página devolvida pelo `kb_query`. */
const TRECHO_MAX = 1800;

/**
 * Recorta a página nas seções que respondem à pergunta.
 *
 * `kb_query` devolvia até cinco páginas inteiras. Com dez páginas na base isso
 * passa; com cem, uma consulta trivial estoura o contexto de quem chamou. O
 * frontmatter fica sempre — é onde estão título, tags e fontes.
 */
export function excerpt(content: string, pergunta: string, orcamento = TRECHO_MAX): string {
  if (content.length <= orcamento) return content;

  const fm = content.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? '';
  const blocos = content
    .slice(fm.length)
    .split(/\n(?=#{1,6} )/)
    .filter((b) => b.trim());
  if (blocos.length === 0) return content.slice(0, orcamento);

  const termos = new Set(tokenize(pergunta));
  const pontuados = blocos.map((texto, ordem) => {
    const presentes = new Set(tokenize(texto));
    let hits = 0;
    for (const t of termos) if (presentes.has(t)) hits++;
    return { texto, ordem, hits };
  });

  const escolhidos: typeof pontuados = [];
  let usado = fm.length;
  for (const b of [...pontuados].sort((x, y) => y.hits - x.hits || x.ordem - y.ordem)) {
    if (escolhidos.length > 0 && (b.hits === 0 || usado + b.texto.length > orcamento)) continue;
    // O bloco mais relevante entra mesmo se sozinho estourar — mas truncado.
    const texto = escolhidos.length === 0 ? b.texto.slice(0, orcamento) : b.texto;
    escolhidos.push({ ...b, texto });
    usado += texto.length;
  }

  escolhidos.sort((x, y) => x.ordem - y.ordem);
  const omitidas = blocos.length - escolhidos.length;
  const corpo = escolhidos.map((b) => b.texto.trim()).join('\n\n');
  return omitidas > 0
    ? `${fm}${corpo}\n\n_[trecho — ${omitidas} seção(ões) omitida(s); use \`kb_read\` para a página inteira]_`
    : `${fm}${corpo}`;
}
