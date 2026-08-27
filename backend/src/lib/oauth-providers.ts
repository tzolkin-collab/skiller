/**
 * Login por Google e GitHub.
 *
 * Escrito à mão em vez de trazer uma biblioteca de auth: são duas requisições
 * por provedor, e o que uma dependência acrescentaria aqui é superfície, não
 * capacidade. O que precisa estar certo — `state`, PKCE, verificação de e-mail —
 * está abaixo e é auditável de uma sentada.
 *
 * `state` protege contra CSRF no retorno; PKCE impede que um código
 * interceptado no redirect seja trocado por token por outra pessoa.
 */
import crypto from 'node:crypto';

export type ProviderId = 'google' | 'github';

export interface PerfilExterno {
  /** Identificador estável no provedor. Nunca o e-mail: e-mail muda. */
  providerAccountId: string;
  email: string;
  /** O provedor confirmou o e-mail? Sem isso, não dá para vincular por e-mail. */
  emailVerificado: boolean;
  nome: string | null;
  avatarUrl: string | null;
}

interface Provedor {
  id: ProviderId;
  nome: string;
  autorizacao: string;
  token: string;
  escopo: string;
  /** PKCE. O GitHub não suporta; o Google sim. */
  usaPkce: boolean;
  clientId(): string | undefined;
  clientSecret(): string | undefined;
  buscarPerfil(accessToken: string): Promise<PerfilExterno>;
}

const PROVEDORES: Record<ProviderId, Provedor> = {
  google: {
    id: 'google',
    nome: 'Google',
    autorizacao: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    escopo: 'openid email profile',
    usaPkce: true,
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    async buscarPerfil(accessToken) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`Google userinfo respondeu ${r.status}`);
      const d = (await r.json()) as {
        sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string;
      };
      if (!d.email) throw new Error('Google não devolveu e-mail.');
      return {
        providerAccountId: d.sub,
        email: d.email.toLowerCase(),
        emailVerificado: d.email_verified === true,
        nome: d.name ?? null,
        avatarUrl: d.picture ?? null,
      };
    },
  },

  github: {
    id: 'github',
    nome: 'GitHub',
    autorizacao: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    escopo: 'read:user user:email',
    usaPkce: false,
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    async buscarPerfil(accessToken) {
      const cab = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };

      const r = await fetch('https://api.github.com/user', { headers: cab });
      if (!r.ok) throw new Error(`GitHub /user respondeu ${r.status}`);
      const u = (await r.json()) as { id: number; login: string; name?: string; avatar_url?: string; email?: string };

      // O e-mail do perfil vem null quando a pessoa o mantém privado — que é o
      // padrão no GitHub. O endereço real está em /user/emails.
      let email = u.email?.toLowerCase() ?? null;
      let verificado = false;

      const re = await fetch('https://api.github.com/user/emails', { headers: cab });
      if (re.ok) {
        const lista = (await re.json()) as { email: string; primary: boolean; verified: boolean }[];
        const principal = lista.find((e) => e.primary && e.verified) ?? lista.find((e) => e.verified);
        if (principal) {
          email = principal.email.toLowerCase();
          verificado = true;
        }
      }

      if (!email) throw new Error('Não foi possível obter um e-mail verificado do GitHub.');

      return {
        providerAccountId: String(u.id),
        email,
        emailVerificado: verificado,
        nome: u.name ?? u.login,
        avatarUrl: u.avatar_url ?? null,
      };
    },
  },
};

export function provedor(id: string): Provedor | null {
  return (PROVEDORES as Record<string, Provedor>)[id] ?? null;
}

export function provedorConfigurado(id: ProviderId): boolean {
  const p = PROVEDORES[id];
  return Boolean(p.clientId() && p.clientSecret());
}

/** Quais botões de login mostrar. O front não deve oferecer o que não funciona. */
export function provedoresDisponiveis(): { id: ProviderId; nome: string }[] {
  return (Object.keys(PROVEDORES) as ProviderId[])
    .filter(provedorConfigurado)
    .map((id) => ({ id, nome: PROVEDORES[id].nome }));
}

// ------------------------------------------------------------------- PKCE

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function gerarPkce(): Pkce {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function urlDeAutorizacao(
  p: Provedor, redirectUri: string, state: string, pkce: Pkce | null
): string {
  const q = new URLSearchParams({
    client_id: p.clientId()!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: p.escopo,
    state,
  });

  if (p.usaPkce && pkce) {
    q.set('code_challenge', pkce.challenge);
    q.set('code_challenge_method', 'S256');
  }

  // Faz o Google mostrar o seletor de contas em vez de entrar direto na última
  // usada — importante em máquina compartilhada.
  if (p.id === 'google') q.set('prompt', 'select_account');

  return `${p.autorizacao}?${q.toString()}`;
}

export async function trocarCodigoPorToken(
  p: Provedor, code: string, redirectUri: string, verifier: string | null
): Promise<string> {
  const corpo = new URLSearchParams({
    client_id: p.clientId()!,
    client_secret: p.clientSecret()!,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (p.usaPkce && verifier) corpo.set('code_verifier', verifier);

  const r = await fetch(p.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: corpo.toString(),
  });

  const d = (await r.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!r.ok || !d.access_token) {
    throw new Error(d.error_description ?? d.error ?? `Troca de código falhou (${r.status})`);
  }
  return d.access_token;
}
