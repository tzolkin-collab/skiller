import { Hono, type Context } from 'hono';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../db/db.js';
import { skills } from '../db/schema.js';
import { and, eq, isNotNull } from 'drizzle-orm';
import crypto from 'crypto';
import type { SkillDocument } from '../lib/skill-document.js';
import { KB_TOOLS, handleKbTool } from '../lib/kb-tools.js';
import { SKILL_TOOLS, handleSkillTool } from '../lib/skill-tools.js';
import { runWithMcpContext, readBearer, readChannel, resolveAccount } from '../lib/mcp-context.js';
import { can, upgradeMessage } from '../lib/plans.js';

export const mcpRouter = new Hono();

// `SkillPackageMeta { name?, description? }` e `parsePackageMeta` viviam aqui e
// liam campos que `skillPackage` NUNCA teve: `buildGitPackage` devolve
// `{ root, blobs }` e nada mais. Das 26 linhas, 23 têm `root` e só 2 têm `name`
// — as duas são seeds. Não era um campo que faltava preencher: era um campo que
// não existe. O nome e a descrição vêm de `skillDocument`, que é onde a síntese
// realmente escreve.

/**
 * Uma sessão por cliente conectado.
 *
 * Antes havia um `transport` e um `server` únicos no módulo: o primeiro cliente
 * a chamar `initialize` tomava o processo inteiro, e todo cliente seguinte
 * recebia "Server already initialized". Num produto cujo argumento é conectar a
 * IDE de cada cliente, isso significava um cliente por servidor.
 */
const sessoes = new Map<string, WebStandardStreamableHTTPServerTransport>();

/** Registra os handlers num servidor novo. Cada sessão recebe o seu. */
function criarServidor(): Server {
  const server = new Server(
    { name: 'skiller-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  registrarHandlers(server);
  return server;
}

/**
 * Resolve quem está do outro lado da conexão.
 *
 * Sem isto, as tools de skill varriam a tabela inteira: qualquer cliente MCP —
 * inclusive um sem token — listava e lia as skills de todos os usuários. As
 * tools da Base da IA já resolviam a conta; as de skill não, porque nasceram
 * antes do multiusuário existir.
 */
async function donoDaSessao(): Promise<{ userId: string; plan: string } | null> {
  return resolveAccount();
}

/** Uma linha de `skills`, derivada do schema. */
type Skill = typeof skills.$inferSelect;

/**
 * As skills com pacote do usuário, em ordem estável.
 *
 * A ordem importa mais do que parece: `mapaDeTools` desempata nome repetido, e
 * sem `ORDER BY` o Postgres é livre para devolver as linhas em ordem diferente
 * entre duas consultas. ListTools e CallTool fazem a MESMA consulta — se a
 * ordem variasse, o nome anunciado e o nome procurado poderiam divergir.
 */
function skillsComPacote(userId: string) {
  return db
    .select()
    .from(skills)
    .where(and(isNotNull(skills.skillPackage), eq(skills.userId, userId)))
    .orderBy(skills.createdAt, skills.id);
}

/**
 * Nome de tool aceito por cliente MCP.
 *
 * `skillDocument.name` é um `Slug` (kebab-case, sem acento) e já passaria
 * direto; isto existe para as linhas gravadas antes daquela restrição, e para
 * o dia em que o modelo devolver algo fora do formato. Nome inválido não é
 * detalhe cosmético: o cliente rejeita a tool e ela some da lista.
 */
function sanitizarNome(bruto: string | undefined | null): string | null {
  if (!bruto) return null;
  const limpo = bruto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64);
  return limpo.length >= 3 ? limpo : null;
}

/**
 * A descrição que o agente lê para decidir se chama esta skill.
 *
 * Vinha de `skillPackage.description`, e era ali que a descoberta morria: aquele
 * campo guarda o TÍTULO DO VÍDEO de origem, não o que a skill ensina. Uma skill
 * de gestão de canal se anunciava como "Skill: URGENTE! ME AJUDEM POR FAVOR!" —
 * nenhum modelo casa isso com "como evito que meu canal seja bloqueado".
 *
 * `skillDocument` guarda o texto certo, escrito pela síntese justamente para
 * descrever a capacidade. `goal` entra junto porque descrição de tool é prompt:
 * quanto mais superfície semântica, maior a chance de o agente escolher certo.
 */
export function descricaoDaSkill(s: Skill): string {
  const doc = s.skillDocument as SkillDocument | null;
  if (doc?.description) {
    return `${doc.description}${doc.goal ? ` Objetivo: ${doc.goal}` : ''}`.slice(0, 480);
  }

  // Sem documento estruturado só existe o título da fonte, guardado em
  // `skills.name` como "Skill: <título do vídeo>". Dizer que é a FONTE evita
  // que o agente leia um título de vídeo como promessa de capacidade.
  const bruto = s.name;
  return bruto
    ? `Skill gerada a partir da fonte "${String(bruto).replace(/^Skill:\s*/, '').slice(0, 160)}". Sem descrição estruturada — carregue para ver o conteúdo.`
    : 'Skill do Skiller sem descrição registrada.';
}

/**
 * Nome de tool → skill, para o conjunto inteiro do usuário.
 *
 * ListTools e CallTool PRECISAM derivar o mesmo nome. Antes cada um repetia a
 * expressão por conta própria; bastava a regra mudar de um lado para o agente
 * enxergar uma tool que não conseguiria chamar. A resolução mora aqui e os dois
 * consomem esta função.
 *
 * Colisão (duas skills com o mesmo slug) recebe sufixo do id em TODAS as
 * envolvidas, não só na segunda — assim o nome de uma skill não depende de qual
 * outra apareceu antes na consulta.
 */
export function mapaDeTools(linhas: Skill[]): Map<string, Skill> {
  const bases = linhas.map((s) =>
    sanitizarNome((s.skillDocument as SkillDocument | null)?.name)
      ?? `skill_${s.id.replace(/-/g, '_')}`
  );

  const contagem = new Map<string, number>();
  for (const base of bases) contagem.set(base, (contagem.get(base) ?? 0) + 1);

  const mapa = new Map<string, Skill>();
  linhas.forEach((s, i) => {
    const base = bases[i];
    const nome = (contagem.get(base) ?? 0) > 1 ? `${base.slice(0, 55)}-${s.id.slice(0, 8)}` : base;
    mapa.set(nome, s);
  });
  return mapa;
}

/** Resposta padrão quando o cliente não tem direito às tools de skill. */
function semAcesso(motivo: string) {
  return { content: [{ type: 'text' as const, text: motivo }] };
}

const PRECISA_CONECTAR =
  'Sua conta Skiller não está conectada a este cliente. Abra Conectores no painel e gere o perfil de conexão.';

/**
 * As tools do Skiller. Recebe o servidor porque agora existe um por sessão.
 */
function registrarHandlers(server: Server): void {
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const conta = await donoDaSessao();

  // Sem conta resolvida, ou sem direito a conector, o cliente só enxerga as
  // tools da Base da IA — que por sua vez explicam o que fazer para liberar.
  if (!conta || !can(conta.plan, 'connectors.mcp')) {
    return { tools: KB_TOOLS };
  }

  // Só as skills DESTE usuário. O filtro por dono é o que separa as contas.
  const generatedSkills = await skillsComPacote(conta.userId);

  const tools = [...mapaDeTools(generatedSkills)].map(([name, s]) => ({
    name,
    description: descricaoDaSkill(s),
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[]
    }
  }));

  // Ordem por estabilidade: Base da IA e criação são fixas e poucas; a lista de
  // skills cresce com o banco. `skiller_create_skill` só aparece neste ramo
  // porque ele já passou pelo portão de `connectors.mcp` lá em cima.
  return { tools: [...KB_TOOLS, ...SKILL_TOOLS, ...tools] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;

  // Base da IA: resolve o usuario pelo bearer e trata a operacao.
  const kb = await handleKbTool(toolName, (request.params.arguments ?? {}) as Record<string, unknown>);
  if (kb) return kb;

  const conta = await donoDaSessao();
  if (!conta) return semAcesso(PRECISA_CONECTAR);
  if (!can(conta.plan, 'connectors.mcp')) {
    // Verificar aqui e não só na emissão do token: quem foi rebaixado mantém
    // o token na IDE, e sem esta checagem continuaria usando o conector.
    return semAcesso(upgradeMessage('connectors.mcp', conta.plan));
  }

  // Criação vem antes da busca por skill existente: é tool de nome fixo, e
  // procurá-la na tabela de skills seria varrer o banco para nunca achar.
  const criada = await handleSkillTool(toolName, (request.params.arguments ?? {}) as Record<string, unknown>);
  if (criada) return criada;

  // Busca restrita ao dono: uma skill de outra conta não deve nem ser
  // encontrável por nome. A resolução do nome é a MESMA de ListTools, pela
  // mesma função — é o que garante que toda tool anunciada seja chamável.
  const generatedSkills = await skillsComPacote(conta.userId);
  const skill = mapaDeTools(generatedSkills).get(toolName);

  if (!skill) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  // ADR-004: quando o skillDocument estruturado existe, entregamos campos navegáveis.
  // O cliente MCP pode depois chamar get_principles / get_module / get_connectors
  // no servidor MCP gerado pelo formato `mcp`. Aqui devolvemos o índice da skill.
  if (skill.skillDocument) {
    const doc = skill.skillDocument as SkillDocument;
    const index = {
      name: doc.name,
      title: doc.title,
      description: doc.description,
      goal: doc.goal,
      principles: doc.principles,
      commands: doc.commands.map(c => ({ name: c.name, description: c.description })),
      modules: doc.modules.map(m => ({ slug: m.slug, title: m.title, summary: m.summary })),
      connectors: doc.connectors
    };
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(index, null, 2)
        }
      ]
    };
  }

  // Fallback para skills geradas antes do ADR-004 (sem skillDocument gravado)
  return {
    content: [
      {
        type: 'text' as const,
        text: skill.skillMdContent ?? skill.humanMdContent ?? 'No content available.'
      }
    ]
  };
});

} // fim de registrarHandlers

/**
 * Encaminha a request para a sessão certa, criando uma quando é `initialize`.
 *
 * O `mcp-session-id` é quem separa os clientes. O token do Bearer segue por
 * fora, na `AsyncLocalStorage`, porque é ele — e não a sessão — que diz de
 * quem são as skills a listar.
 */
async function encaminhar(req: Request): Promise<Response> {
  const sessionId = req.headers.get('mcp-session-id');

  const existente = sessionId ? sessoes.get(sessionId) : undefined;
  if (existente) return existente.handleRequest(req);

  if (sessionId) {
    // Sessão que o servidor não conhece — reiniciou, ou expirou. Dizer isso é
    // melhor que abrir uma nova em silêncio: o cliente refaz o handshake.
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Sessão desconhecida. Refaça o initialize.' },
        id: null,
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Sem sessão: só o handshake pode abrir uma.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id: string) => { sessoes.set(id, transport); },
    onsessionclosed: (id: string) => { sessoes.delete(id); },
  });

  // Solta o registro quando o cliente desconecta, senão o mapa cresce sem fim.
  await criarServidor().connect(transport);
  return transport.handleRequest(req);
}

function apiUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

async function handleMcpRequest(c: Context): Promise<Response> {
  const token = readBearer(c.req.raw.headers);
  const channel = readChannel(c.req.raw.headers);
  const metadataUrl = `${apiUrl()}/.well-known/oauth-protected-resource`;

  if (!token) {
    return c.json(
      { error: 'unauthorized', message: 'Authentication required. See WWW-Authenticate for metadata.' },
      401,
      { 'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"` }
    );
  }

  return runWithMcpContext({ token, channel }, async () => {
    const conta = await resolveAccount();
    if (!conta) {
      return c.json(
        { error: 'invalid_token', message: 'The access token is invalid, expired, or revoked.' },
        401,
        { 'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${metadataUrl}"` }
      );
    }
    return encaminhar(c.req.raw);
  });
}

// O transporte cuida de GET e POST na mesma rota. `/sse` existe por
// compatibilidade com clientes que apontam para lá explicitamente.
mcpRouter.all('/sse', async (c) => handleMcpRequest(c));
mcpRouter.all('/*', async (c) => handleMcpRequest(c));
