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

interface SkillPackageMeta {
  name?: string;
  description?: string;
}

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

function parsePackageMeta(raw: unknown): SkillPackageMeta {
  if (raw === null || typeof raw !== 'object') return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as SkillPackageMeta; } catch { return {}; }
  }
  return raw as SkillPackageMeta;
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
  const generatedSkills = await db
    .select()
    .from(skills)
    .where(and(isNotNull(skills.skillPackage), eq(skills.userId, conta.userId)));

  const tools = generatedSkills.map((s) => {
    const pkg = parsePackageMeta(s.skillPackage);
    const name = pkg?.name ?? `skill_${s.id.replace(/-/g, '_')}`;
    const description = pkg?.description ?? s.name ?? 'Skiller dynamic tool';

    return {
      name,
      description,
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[]
      }
    };
  });

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
  // encontrável por nome.
  const generatedSkills = await db
    .select()
    .from(skills)
    .where(and(isNotNull(skills.skillPackage), eq(skills.userId, conta.userId)));

  const skill = generatedSkills.find((s) => {
    const pkg = parsePackageMeta(s.skillPackage);
    const name = pkg?.name ?? `skill_${s.id.replace(/-/g, '_')}`;
    return name === toolName;
  });

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
