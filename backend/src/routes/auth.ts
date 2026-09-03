/**
 * Entrada na conta: Google, GitHub, senha e link mágico.
 *
 * Uma pessoa é UMA conta com VÁRIAS formas de entrar. Quem se cadastrou com
 * senha e depois clica em "entrar com Google" cai na mesma conta — desde que o
 * provedor confirme o e-mail. Sem essa confirmação o vínculo não acontece:
 * aceitar um e-mail não verificado deixaria qualquer um criar conta no provedor
 * com o endereço alheio e assumir a conta existente.
 *
 * A sessão é um cookie httpOnly com token opaco. O front nunca lê o token — e
 * é por isso que `?userId=` some: quem diz quem é a pessoa é o cookie, que o
 * navegador não deixa o JavaScript de terceiros roubar.
 */
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { users, identities } from '../db/schema.js';
import {
  hashSenha, conferirSenha, senhaFraca, criarSessao, validarSessao,
  revogarSessao, revogarTodasSessoes, emitirTokenEmail, consumirTokenEmail,
  registrarTentativa, limparTentativas, LIMITES, DURACAO_SESSAO_MS,
} from '../lib/auth.js';
import {
  provedor, provedoresDisponiveis, gerarPkce, urlDeAutorizacao,
  trocarCodigoPorToken, type PerfilExterno,
} from '../lib/oauth-providers.js';
import { enviarEmail, appUrl } from '../lib/email.js';
import * as tpl from '../lib/email-templates.js';
import { PLAN_SPEC } from '../lib/plans.js';
import { pareceUuid, extrairIp } from '../lib/current-user.js';
import { stripe, isStripeConfigured } from '../lib/stripe.js';
import { stripeEvents } from '../db/schema.js';
import type Stripe from 'stripe';

export const authRouter = new Hono();

/** Versão vigente dos Termos. Subir aqui faz o painel pedir novo aceite. */
export const VERSAO_TERMOS = '2026-08-22';

const COOKIE_SESSAO = 'skiller_session';
const COOKIE_OAUTH = 'skiller_oauth';

/** `secure` só fora de desenvolvimento: em `http://localhost` ele impede o cookie. */
function producao(): boolean {
  return process.env.NODE_ENV === 'production';
}

function gravarCookieSessao(c: Context, token: string): void {
  // `SameSite=None` porque o frontend (skiller.tzolkin.cloud) e o backend
  // (easypanel.host) ficam em domínios diferentes. Com `Lax`, o browser não
  // manda o cookie de sessão nas requisições fetch do frontend — o painel
  // abre sem sessão e redireciona para o login. `None` exige `Secure=true`.
  // O CSRF continua protegido pelo `httpOnly` + tokens de sessão opacos.
  //
  // `COOKIE_DOMAIN` cobre o caso em que front e back passam a dividir o mesmo
  // dominio registravel (skiller.tzolkin.cloud e api.skiller.tzolkin.cloud).
  // Sem ele o cookie e' host-only no backend, o que o torna DE TERCEIRO na
  // visao do Chrome quando o painel o chama — e o bloqueio de cookies de
  // terceiro derruba so' a checagem do cliente. O sintoma e' entrar no painel
  // (o middleware le' o cookie-ponte do proprio front) e levar "sessao
  // expirou" logo em seguida.
  //
  // Definido como `.tzolkin.cloud`, o cookie vira primario nos dois hosts e
  // deixa de depender de politica de terceiros. Vazio mantem o de antes.
  const dominio = process.env.COOKIE_DOMAIN?.trim();

  setCookie(c, COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
    ...(dominio ? { domain: dominio } : {}),
  });
}

function ip(c: Context): string | null {
  return extrairIp(c);
}

// ------------------------------------------------------------------- quem é

/** Estado do login. O front chama isto no boot em vez de adivinhar. */
authRouter.get('/me', async (c) => {
  const sessao = await validarSessao(getCookie(c, COOKIE_SESSAO), {
    userAgent: c.req.header('user-agent'),
    ipAddress: ip(c),
  });
  if (!sessao) return c.json({ authenticated: false, providers: provedoresDisponiveis() });

  const [u] = await db.select().from(users).where(eq(users.id, sessao.userId)).limit(1);
  if (!u) return c.json({ authenticated: false, providers: provedoresDisponiveis() });

  const vinculos = await db
    .select({ provider: identities.provider })
    .from(identities)
    .where(eq(identities.userId, u.id));

  c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return c.json({
    authenticated: true,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      emailVerified: Boolean(u.emailVerifiedAt),
      hasPassword: Boolean(u.passwordHash),
      identities: vinculos.map((v) => v.provider),
      /** `true` quando os Termos aceitos são de uma versão anterior à vigente. */
      needsTermsAcceptance: u.acceptedTermsVersion !== VERSAO_TERMOS,
      deletionRequestedAt: u.deletionRequestedAt,
      preferences: u.preferences,
    },
  });
});

authRouter.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_SESSAO);
  if (token) await revogarSessao(token);
  // O apagar precisa repetir o `domain` do gravar: sem ele o browser mira um
  // cookie host-only, e o de dominio — que e' o que existe — fica de pe'.
  const dominio = process.env.COOKIE_DOMAIN?.trim();
  deleteCookie(c, COOKIE_SESSAO, { path: '/', ...(dominio ? { domain: dominio } : {}) });
  return c.json({ ok: true });
});

// --------------------------------------------------------------- conta nova

/**
 * Cria ou recupera a conta de um e-mail.
 *
 * Compartilhado pelos quatro caminhos de entrada, porque a decisão "isso é a
 * mesma pessoa?" precisa ser a mesma em todos eles.
 */
async function contaPorEmail(
  email: string, nome: string | null, avatar: string | null, emailVerificado: boolean
): Promise<{ id: string; novo: boolean }> {
  const existente = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (existente) {
    // Completa o que falta sem sobrescrever o que a pessoa já preencheu.
    const remendo: Record<string, unknown> = {};
    if (!existente.name && nome) remendo.name = nome;
    if (!existente.avatarUrl && avatar) remendo.avatarUrl = avatar;
    if (!existente.emailVerifiedAt && emailVerificado) remendo.emailVerifiedAt = new Date();
    if (Object.keys(remendo).length > 0) {
      await db.update(users).set(remendo).where(eq(users.id, existente.id));
    }
    return { id: existente.id, novo: false };
  }

  const [criado] = await db
    .insert(users)
    .values({
      email,
      name: nome,
      avatarUrl: avatar,
      emailVerifiedAt: emailVerificado ? new Date() : null,
      plan: 'free',
      creditsBalance: PLAN_SPEC.free.monthlyCredits,
    })
    .returning();

  return { id: criado.id, novo: true };
}

async function vincularIdentidade(
  userId: string, provider: string, providerAccountId: string, email: string | null
): Promise<void> {
  await db
    .insert(identities)
    .values({ userId, provider, providerAccountId, email, lastUsedAt: new Date() })
    .onConflictDoUpdate({
      target: [identities.provider, identities.providerAccountId],
      set: { lastUsedAt: new Date() },
    });
}

// ------------------------------------------------------------------- OAuth

/** Provedores prontos para uso, para o front só desenhar o que funciona. */
authRouter.get('/providers', (c) => c.json({ providers: provedoresDisponiveis() }));

authRouter.get('/:provider/start', async (c) => {
  const p = provedor(c.req.param('provider'));
  if (!p) return c.json({ error: 'provider_unknown' }, 404);
  if (!p.clientId() || !p.clientSecret()) {
    return c.json({ error: 'provider_not_configured', message: `${p.nome} não está configurado neste ambiente.` }, 503);
  }

  // O cookie abaixo e' gravado no host que atende ESTA requisicao, mas quem
  // vai le-lo e' o callback, que o provedor chama no host de `API_URL`. Se os
  // dois diferirem o cookie simplesmente nao existe la', e o login morre em
  // `resposta_incompleta` sem dizer por que — foi o que aconteceu quando o
  // backend passou a responder tambem por um dominio proprio e o front
  // continuou apontando para o antigo.
  //
  // Redirecionar para o host canonico antes de gravar mantem o par
  // start/callback sempre no mesmo dominio, venha a chamada de onde vier.
  const canonico = new URL(redirectUri(p.id)).origin;
  const hostAtual = c.req.header('x-forwarded-host') ?? c.req.header('host');
  if (hostAtual) {
    const proto = c.req.header('x-forwarded-proto') ?? 'https';
    if (`${proto}://${hostAtual}` !== canonico) {
      const veio = new URL(c.req.url);
      return c.redirect(`${canonico}${veio.pathname}${veio.search}`);
    }
  }

  const state = crypto.randomUUID();
  const pkce = p.usaPkce ? gerarPkce() : null;
  const proximo = c.req.query('next') ?? '/pt/dashboard';

  // `state` e `verifier` vão num cookie curto, não em memória do servidor:
  // com mais de uma instância, memória não sobrevive ao balanceador.
  // `SameSite=None` e não `Lax`: o frontend e o backend ficam em domínios
  // diferentes (ex.: skiller.tzolkin.cloud ↔ other-skiller.rzkso2.easypanel.host).
  // Chrome classifica o cookie como cross-site e o bloqueia no callback do
  // Google mesmo numa navegação de topo, onde `Lax` deveria bastir.
  // É seguro porque (a) o cookie dura 10 min, (b) a proteção CSRF é o `state`
  // opaco — o cookie em si não prova nada sem o `state` que o Google devolve.
  setCookie(c, COOKIE_OAUTH, JSON.stringify({ state, verifier: pkce?.verifier ?? null, proximo, p: p.id }), {
    httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: 600,
  });

  return c.redirect(urlDeAutorizacao(p, redirectUri(p.id), state, pkce));
});

function redirectUri(providerId: string): string {
  const base = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/api/auth/${providerId}/callback`;
}

authRouter.get('/:provider/callback', async (c) => {
  const p = provedor(c.req.param('provider'));
  const erroProvedor = c.req.query('error');
  const code = c.req.query('code');
  const state = c.req.query('state');

  const bruto = getCookie(c, COOKIE_OAUTH);
  deleteCookie(c, COOKIE_OAUTH, { path: '/' });

  const falhar = (motivo: string) => c.redirect(`${appUrl()}/pt/entrar?erro=${encodeURIComponent(motivo)}`);

  if (erroProvedor) return falhar(erroProvedor);
  if (!p || !code || !state || !bruto) return falhar('resposta_incompleta');

  let guardado: { state: string; verifier: string | null; proximo: string; p: string };
  try {
    guardado = JSON.parse(bruto);
  } catch {
    return falhar('estado_invalido');
  }

  // A checagem que impede um terceiro de iniciar o fluxo e entregar o retorno
  // na sua sessão. Sem ela, o callback aceita qualquer código.
  if (guardado.state !== state || guardado.p !== p.id) return falhar('estado_invalido');

  let perfil: PerfilExterno;
  try {
    const accessToken = await trocarCodigoPorToken(p, code, redirectUri(p.id), guardado.verifier);
    perfil = await p.buscarPerfil(accessToken);
  } catch (e) {
    console.error(`[auth] ${p.id} falhou:`, e instanceof Error ? e.message : e);
    return falhar('provedor_falhou');
  }

  // Vínculo por e-mail só com endereço confirmado pelo provedor. Sem isso,
  // criar uma conta no provedor com o e-mail de outra pessoa daria acesso à
  // conta dela aqui.
  if (!perfil.emailVerificado) return falhar('email_nao_verificado');

  const jaVinculado = (await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, p.id), eq(identities.providerAccountId, perfil.providerAccountId)))
    .limit(1))[0];

  let userId: string;
  let novo = false;

  if (jaVinculado) {
    userId = jaVinculado.userId;
    await vincularIdentidade(userId, p.id, perfil.providerAccountId, perfil.email);
  } else {
    const conta = await contaPorEmail(perfil.email, perfil.nome, perfil.avatarUrl, true);
    userId = conta.id;
    novo = conta.novo;
    await vincularIdentidade(userId, p.id, perfil.providerAccountId, perfil.email);
  }

  // Entrar cancela um pedido de exclusão pendente — é o "voltar atrás" que o
  // e-mail de confirmação promete.
  await db.update(users).set({ deletionRequestedAt: null }).where(eq(users.id, userId));

  if (novo) {
    const t = tpl.boasVindas(perfil.nome);
    void enviarEmail({ para: perfil.email, template: 'boas_vindas', userId, ...t, assunto: t.assunto, texto: t.texto, html: t.html });
  }

  const token = await criarSessao(userId, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });

  // Grava no backend domain para que os componentes client-side (useAuth)
  // consigam chamar /api/auth/me com credentials:include e receber sessão válida.
  gravarCookieSessao(c, token);

  // Redireciona para a bridge do Next.js, que seta o mesmo token no domínio do
  // frontend. O middleware do Next.js e o exigirSessao (Server Components) só
  // enxergam cookies do domínio deles — sem a bridge eles redirecionam pro /entrar.
  const destino = guardado.proximo.startsWith('/') ? guardado.proximo : '/pt/dashboard';
  return c.redirect(`${appUrl()}/api/auth/session?token=${encodeURIComponent(token)}&next=${encodeURIComponent(destino)}`);
});

// ------------------------------------------------------------ e-mail e senha

interface CorpoCredencial {
  email?: string;
  password?: string;
  name?: string;
  acceptTerms?: boolean;
}

function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 320;
}

authRouter.post('/register', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as CorpoCredencial;
  const email = b.email?.trim().toLowerCase() ?? '';
  const senha = b.password ?? '';

  if (!emailValido(email)) return c.json({ error: 'email_invalid', message: 'E-mail inválido.' }, 400);

  const fraca = senhaFraca(senha);
  if (fraca) return c.json({ error: 'password_weak', message: fraca }, 400);

  if (!b.acceptTerms) {
    return c.json({ error: 'terms_required', message: 'É preciso aceitar os Termos e a Política de Privacidade.' }, 400);
  }

  const limite = await registrarTentativa(`registro:${ip(c) ?? 'sem-ip'}`, LIMITES.registro);
  if (!limite.permitido) {
    return c.json({ error: 'rate_limited', message: 'Muitas tentativas. Tente mais tarde.', retryAfter: limite.esperarSegundos }, 429);
  }

  const existente = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existente?.passwordHash) {
    // Não confirma nem nega que a conta existe — isso enumera clientes. A
    // mensagem serve para os dois casos.
    return c.json({ error: 'email_taken', message: 'Não foi possível criar a conta com este e-mail.' }, 409);
  }

  const conta = existente
    ? { id: existente.id, novo: false }
    : await contaPorEmail(email, b.name?.trim() || null, null, false);

  await db
    .update(users)
    .set({
      passwordHash: await hashSenha(senha),
      acceptedTermsAt: new Date(),
      acceptedTermsVersion: VERSAO_TERMOS,
      ...(b.name?.trim() ? { name: b.name.trim() } : {}),
    })
    .where(eq(users.id, conta.id));

  await vincularIdentidade(conta.id, 'password', email, email);

  const token = await emitirTokenEmail(conta.id, 'verify_email');
  const t = tpl.confirmarEmail(`${appUrl()}/pt/entrar/confirmar?token=${token}`);
  void enviarEmail({ para: email, template: 'confirmar_email', userId: conta.id, assunto: t.assunto, html: t.html, texto: t.texto });

  const bv = tpl.boasVindas(b.name?.trim() || null);
  void enviarEmail({ para: email, template: 'boas_vindas', userId: conta.id, assunto: bv.assunto, html: bv.html, texto: bv.texto });

  const sessao = await criarSessao(conta.id, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });
  gravarCookieSessao(c, sessao);

  return c.json({ ok: true, emailVerificationSent: true, token: sessao });
});

authRouter.post('/login', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as CorpoCredencial;
  const email = b.email?.trim().toLowerCase() ?? '';
  const senha = b.password ?? '';

  const chave = `login:${email || ip(c) || 'sem-ip'}`;
  const limite = await registrarTentativa(chave, LIMITES.login);
  if (!limite.permitido) {
    return c.json(
      { error: 'rate_limited', message: `Muitas tentativas. Tente em ${Math.ceil(limite.esperarSegundos / 60)} minutos.`, retryAfter: limite.esperarSegundos },
      429
    );
  }

  const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

  // A conferência roda mesmo sem usuário, contra um hash descartável, para o
  // tempo de resposta não revelar quais e-mails existem.
  const ok = await conferirSenha(senha, u?.passwordHash ?? null);

  if (!u || !ok) {
    return c.json({ error: 'invalid_credentials', message: 'E-mail ou senha incorretos.' }, 401);
  }

  await limparTentativas(chave);
  await db.update(users).set({ deletionRequestedAt: null }).where(eq(users.id, u.id));

  const token = await criarSessao(u.id, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });
  gravarCookieSessao(c, token);

  return c.json({ ok: true, token });
});

// -------------------------------------------------------------- link mágico

authRouter.post('/magic-link', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; next?: string };
  const email = b.email?.trim().toLowerCase() ?? '';

  if (!emailValido(email)) return c.json({ error: 'email_invalid', message: 'E-mail inválido.' }, 400);

  const limite = await registrarTentativa(`magic:${email}`, LIMITES.email);
  if (!limite.permitido) {
    return c.json({ error: 'rate_limited', message: 'Já enviamos vários links para este endereço. Aguarde um pouco.', retryAfter: limite.esperarSegundos }, 429);
  }

  const existente = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  const conta = existente ? { id: existente.id } : await contaPorEmail(email, null, null, false);

  if (!existente) await vincularIdentidade(conta.id, 'email', email, email);

  const token = await emitirTokenEmail(conta.id, 'magic_link');
  const destino = b.next?.startsWith('/') ? b.next : '/pt/dashboard';
  const t = tpl.linkMagico(`${appUrl()}/pt/entrar/link?token=${token}&next=${encodeURIComponent(destino)}`);
  await enviarEmail({ para: email, template: 'link_magico', userId: conta.id, assunto: t.assunto, html: t.html, texto: t.texto });

  // Resposta idêntica exista ou não a conta: o contrário permite descobrir
  // quem é cliente só tentando endereços.
  return c.json({ ok: true, message: 'Se existe uma conta com este e-mail, o link está a caminho.' });
});

authRouter.post('/magic-link/consume', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!b.token) return c.json({ error: 'token_required' }, 400);

  const userId = await consumirTokenEmail(b.token, 'magic_link');
  if (!userId) return c.json({ error: 'token_invalid', message: 'Link inválido, expirado ou já usado.' }, 400);

  // Entrar pelo link prova o endereço.
  await db.update(users).set({ emailVerifiedAt: new Date(), deletionRequestedAt: null }).where(eq(users.id, userId));

  const token = await criarSessao(userId, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });
  gravarCookieSessao(c, token);
  return c.json({ ok: true, token });
});

// -------------------------------------------------------- e-mail e senha (2)

authRouter.post('/verify-email/consume', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!b.token) return c.json({ error: 'token_required' }, 400);

  const userId = await consumirTokenEmail(b.token, 'verify_email');
  if (!userId) return c.json({ error: 'token_invalid', message: 'Link inválido ou expirado.' }, 400);

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return c.json({ ok: true });
});

authRouter.post('/verify-email/resend', async (c) => {
  const sessao = await validarSessao(getCookie(c, COOKIE_SESSAO));
  if (!sessao) return c.json({ error: 'unauthenticated' }, 401);

  const [u] = await db.select().from(users).where(eq(users.id, sessao.userId)).limit(1);
  if (!u || u.emailVerifiedAt) return c.json({ ok: true });

  const limite = await registrarTentativa(`verify:${u.email}`, LIMITES.email);
  if (!limite.permitido) return c.json({ error: 'rate_limited', retryAfter: limite.esperarSegundos }, 429);

  const token = await emitirTokenEmail(u.id, 'verify_email');
  const t = tpl.confirmarEmail(`${appUrl()}/pt/entrar/confirmar?token=${token}`);
  await enviarEmail({ para: u.email, template: 'confirmar_email', userId: u.id, assunto: t.assunto, html: t.html, texto: t.texto });
  return c.json({ ok: true });
});

authRouter.post('/password/forgot', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string };
  const email = b.email?.trim().toLowerCase() ?? '';
  if (!emailValido(email)) return c.json({ error: 'email_invalid' }, 400);

  const limite = await registrarTentativa(`reset:${email}`, LIMITES.email);
  if (!limite.permitido) return c.json({ error: 'rate_limited', retryAfter: limite.esperarSegundos }, 429);

  const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (u) {
    const token = await emitirTokenEmail(u.id, 'password_reset');
    const t = tpl.redefinirSenha(`${appUrl()}/pt/entrar/nova-senha?token=${token}`);
    await enviarEmail({ para: email, template: 'redefinir_senha', userId: u.id, assunto: t.assunto, html: t.html, texto: t.texto });
  }

  return c.json({ ok: true, message: 'Se existe uma conta com este e-mail, o link está a caminho.' });
});

authRouter.post('/password/reset', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!b.token) return c.json({ error: 'token_required' }, 400);

  const fraca = senhaFraca(b.password ?? '');
  if (fraca) return c.json({ error: 'password_weak', message: fraca }, 400);

  const userId = await consumirTokenEmail(b.token, 'password_reset');
  if (!userId) return c.json({ error: 'token_invalid', message: 'Link inválido, expirado ou já usado.' }, 400);

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ passwordHash: await hashSenha(b.password!) }).where(eq(users.id, userId));
  if (u) await vincularIdentidade(userId, 'password', u.email, u.email);

  // Trocar senha derruba tudo: se alguém entrou indevidamente, é aqui que perde
  // o acesso.
  await revogarTodasSessoes(userId);

  const token = await criarSessao(userId, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });
  gravarCookieSessao(c, token);
  return c.json({ ok: true, token });
});


// ----------------------------------------------- entrada vinda do checkout

/**
 * Troca uma sessão de checkout paga por uma sessão nossa.
 *
 * É assim que quem comprou sem ter conta entra: o Stripe confirma que aquela
 * compra foi paga e devolve o e-mail; nós encontramos a conta que o webhook
 * criou e emitimos o cookie.
 *
 * O `session_id` é impossível de adivinhar e vem na URL de retorno, mas isso não
 * basta: a URL fica no histórico do navegador e pode vazar por `Referer`. Por
 * isso o consumo é ÚNICO — a trava é uma linha em `stripe_events`, cuja chave
 * primária faz o segundo uso falhar sozinho.
 */
authRouter.post('/from-checkout', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { sessionId?: string };
  if (!b.sessionId) return c.json({ error: 'session_required' }, 400);

  if (!isStripeConfigured()) return c.json({ error: 'billing_unavailable' }, 503);

  let sessao: Stripe.Checkout.Session;
  try {
    sessao = await stripe().checkout.sessions.retrieve(b.sessionId);
  } catch {
    return c.json({ error: 'session_invalid', message: 'Sessão de compra não encontrada.' }, 404);
  }

  const pago = sessao.payment_status === 'paid' || sessao.payment_status === 'no_payment_required';
  if (!pago) {
    return c.json({ error: 'not_paid', message: 'Este pagamento ainda não foi confirmado.' }, 402);
  }

  const email = sessao.customer_details?.email?.trim().toLowerCase() ?? null;
  const porReferencia = sessao.client_reference_id ?? sessao.metadata?.userId ?? null;

  const dono = pareceUuid(porReferencia)
    ? (await db.select().from(users).where(eq(users.id, porReferencia)).limit(1))[0]
    : email
      ? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]
      : undefined;

  if (!dono) {
    // O webhook ainda não rodou. Não criamos a conta aqui de propósito: dois
    // caminhos criando o mesmo usuário produziriam duplicata na corrida.
    return c.json(
      { error: 'account_pending', message: 'Estamos preparando sua conta. Recarregue em alguns segundos.' },
      202
    );
  }

  // Uso único — reservado só AGORA, quando o acesso vai de fato ser emitido.
  //
  // A ordem importa: reservar antes de achar a conta queimaria a trava no
  // caminho do 202 acima (webhook ainda não rodou), e a tentativa seguinte —
  // que é o comportamento correto do navegador — levaria 409 "já usado".
  const reservado = await db
    .insert(stripeEvents)
    .values({ id: `login:${sessao.id}`, type: 'checkout_login' })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });

  if (reservado.length === 0) {
    return c.json(
      { error: 'session_used', message: 'Este link de acesso já foi usado. Entre pelo seu e-mail.' },
      409
    );
  }

  const token = await criarSessao(dono.id, { userAgent: c.req.header('user-agent'), ipAddress: ip(c) });
  gravarCookieSessao(c, token);

  return c.json({
    ok: true,
    email: dono.email,
    token,
    /** O front usa isto para pedir uma senha logo depois da compra. */
    needsPassword: !dono.passwordHash,
  });
});

/**
 * Define a primeira senha de quem entrou sem uma.
 *
 * Separado de `/password/reset`: aqui não há token de e-mail, porque a pessoa
 * JÁ está autenticada. Recusa quando já existe senha — trocar senha existente
 * exige provar a atual, e isso é outro fluxo.
 */
authRouter.post('/password/set', async (c) => {
  const sessao = await validarSessao(getCookie(c, COOKIE_SESSAO));
  if (!sessao) return c.json({ error: 'unauthenticated' }, 401);

  const b = (await c.req.json().catch(() => ({}))) as { password?: string };
  const fraca = senhaFraca(b.password ?? '');
  if (fraca) return c.json({ error: 'password_weak', message: fraca }, 400);

  const [u] = await db.select().from(users).where(eq(users.id, sessao.userId)).limit(1);
  if (!u) return c.json({ error: 'not_found' }, 404);

  if (u.passwordHash) {
    return c.json(
      { error: 'password_exists', message: 'Esta conta já tem senha. Use "esqueci a senha" para trocar.' },
      409
    );
  }

  await db.update(users).set({ passwordHash: await hashSenha(b.password!) }).where(eq(users.id, u.id));
  await vincularIdentidade(u.id, 'password', u.email, u.email);

  return c.json({ ok: true });
});

export { COOKIE_SESSAO };
