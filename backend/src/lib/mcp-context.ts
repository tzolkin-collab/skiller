import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from '../db/db.js';
import { mcpDevices, oauthTokens, users } from '../db/schema.js';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { planoVigente } from './entitlements.js';

/**
 * O SDK do MCP entrega ao handler da tool apenas a chamada, sem a request HTTP.
 * Mas a Base da IA é por usuário — sem saber quem chamou, o cofre seria global.
 *
 * Este armazenamento carrega o contexto da request pela pilha assíncrona até o
 * handler, sem precisar mudar a assinatura do SDK.
 */
export interface McpContext {
  /** Bearer do device-flow (`/oauth/token`). Ausente em cliente não conectado. */
  token: string | null;
  /**
   * Qual agente está falando — Claude Desktop, Cursor, outro. A base é
   * multi-canal: quando duas entradas se contradizem, a origem é o que permite
   * ao humano decidir. Gravado em `kb_log.channel`.
   */
  channel: string | null;
}

const storage = new AsyncLocalStorage<McpContext>();

export function runWithMcpContext<T>(ctx: McpContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): McpContext {
  return storage.getStore() ?? { token: null, channel: null };
}

/**
 * Resolve o dono do cofre a partir do token do device-flow ou OAuth 2.1.
 * Retorna null quando não há token válido — as tools tratam isso como
 * "conecte sua conta", não como erro genérico.
 */
export async function resolveUserId(): Promise<string | null> {
  return (await resolveAccount())?.userId ?? null;
}

/**
 * Resolve dono e plano numa consulta só. O plano vem junto porque quase toda
 * tool precisa dos dois, e buscar duas vezes seria desperdício por chamada.
 */
export async function resolveAccount(): Promise<{ userId: string; plan: string } | null> {
  const { token } = currentContext();
  if (!token) return null;

  // 1. Procura em oauth_tokens (OAuth 2.1 com expiração e revogação)
  const oauthRows = await db
    .select({ userId: oauthTokens.userId, plan: users.plan, validUntil: users.planValidUntil })
    .from(oauthTokens)
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(
        eq(oauthTokens.accessToken, token),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.accessTokenExpiresAt, new Date())
      )
    )
    .limit(1);

  if (oauthRows.length > 0 && oauthRows[0]?.userId) {
    const row = oauthRows[0];
    return { userId: row.userId, plan: planoVigente(row.plan, row.validUntil) };
  }

  // 2. Procura em mcp_devices (Device Code Flow clássico / CLI)
  const deviceRows = await db
    .select({ userId: mcpDevices.userId, plan: users.plan, validUntil: users.planValidUntil })
    .from(mcpDevices)
    .innerJoin(users, eq(users.id, mcpDevices.userId))
    .where(and(eq(mcpDevices.accessToken, token), eq(mcpDevices.status, 'authorized')))
    .limit(1);

  const row = deviceRows[0];
  if (!row?.userId) return null;

  // Mesma regra do lado HTTP: assinatura vencida sem renovação vale como
  // gratuito, mesmo que a coluna ainda diga outra coisa. O token continua
  // válido — o que caduca é o plano, não a conexão.
  return { userId: row.userId, plan: planoVigente(row.plan, row.validUntil) };
}

/** Extrai o Bearer do header, tolerando ausência e capitalização. */
export function readBearer(headers: Headers): string | null {
  const raw = headers.get('authorization') ?? headers.get('Authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}

/** Identifica o cliente para o log. Não é segurança, é rastreabilidade. */
export function readChannel(headers: Headers): string | null {
  return (
    headers.get('x-mcp-client') ??
    headers.get('user-agent')?.slice(0, 80) ??
    null
  );
}
