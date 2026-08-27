/**
 * Quem está fazendo esta request HTTP.
 *
 * Substitui o `?userId=` que o painel inteiro usava. Aquilo nunca foi
 * autenticação: qualquer um mandava o id que quisesse e lia os dados de
 * qualquer conta. Agora quem responde é o cookie de sessão, que o navegador não
 * deixa outro site enviar nem o JavaScript de terceiros ler.
 *
 * O parâmetro de query continua aceito SÓ quando `ALLOW_QUERY_USER=true`, para
 * os scripts de teste e auditoria seguirem funcionando. A variável é ignorada
 * em produção — de propósito, e não por convenção.
 */
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';
import { validarSessao } from './auth.js';

const COOKIE = 'skiller_session';

let avisou = false;

/**
 * Extrai o IP real da requisição (cabeçalhos de proxy ou conexão direta Node).
 */
export function extrairIp(c: Context): string | null {
  const proxyIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim();
  if (proxyIp) return proxyIp;
  try {
    const info = getConnInfo(c);
    if (info?.remote?.address) {
      const addr = info.remote.address;
      if (addr === '::1') return '127.0.0.1';
      if (addr.startsWith('::ffff:')) return addr.replace('::ffff:', '');
      return addr;
    }
  } catch {
    // Ambiente sem @hono/node-server
  }
  return null;
}

/** Dono da request, ou `null` quando não há sessão válida. */
export async function usuarioAtual(c: Context): Promise<string | null> {
  const sessao = await validarSessao(getCookie(c, COOKIE), {
    userAgent: c.req.header('user-agent'),
    ipAddress: extrairIp(c),
  });
  if (sessao) return sessao.userId;

  const permiteQuery = process.env.ALLOW_QUERY_USER === 'true' && process.env.NODE_ENV !== 'production';
  if (!permiteQuery) return null;

  const daQuery = c.req.query('userId');
  if (!daQuery) return null;

  if (!avisou) {
    console.warn(
      '[auth] ALLOW_QUERY_USER=true — `?userId=` está sendo aceito como identidade. ' +
      'Isto NÃO é autenticação e nunca vale em produção.'
    );
    avisou = true;
  }
  return daQuery;
}

/** Resposta padrão para request sem sessão. */
export function naoAutenticado() {
  return {
    error: 'unauthenticated',
    message: 'Entre na sua conta para continuar.',
  } as const;
}

/**
 * `true` quando a string tem forma de UUID.
 *
 * `users.id` é `uuid` no Postgres, e consultar essa coluna com texto qualquer
 * não devolve vazio: LANÇA. Como o `client_reference_id` que volta do Stripe é
 * texto livre — pode vir de uma integração antiga, de um teste, de qualquer
 * coisa — conferir antes é o que separa "não achei" de erro 500.
 */
export function pareceUuid(valor: string | null | undefined): valor is string {
  return typeof valor === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}
