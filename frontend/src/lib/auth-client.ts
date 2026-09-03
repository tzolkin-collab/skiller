'use client';

/**
 * Identidade, do lado do navegador.
 *
 * Nenhuma função aqui devolve token: a sessão vive num cookie `httpOnly` que o
 * JavaScript não lê nem escreve. Por isso todo `fetch` leva
 * `credentials: 'include'` — sem isso o navegador não manda o cookie para outra
 * origem, e o backend responde como se ninguém estivesse logado.
 *
 * Substitui `lib/session.ts`, que guardava um `userId` no `localStorage`.
 * Aquilo nunca foi autenticação — era um bilhete que qualquer um podia
 * reescrever no console.
 */
import { useCallback, useEffect, useState } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface UsuarioLogado {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  /** `google`, `github`, `password`, `email`. */
  identities: string[];
  needsTermsAcceptance: boolean;
  deletionRequestedAt: string | null;
  preferences: {
    locationTrackingEnabled?: boolean;
  } | null;
}

export interface Provedor {
  id: string;
  nome: string;
}

interface RespostaMe {
  authenticated: boolean;
  user?: UsuarioLogado;
  providers?: Provedor[];
}

async function api(caminho: string, init?: RequestInit): Promise<Response> {
  return fetch(BASE_URL + '/api/auth' + caminho, {
    cache: 'no-store',
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

async function corpo(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Erro com a mensagem que o backend escreveu para o usuário final. */
export class ErroAuth extends Error {
  constructor(message: string, readonly codigo: string, readonly status: number) {
    super(message);
  }
}

async function exigirOk(res: Response): Promise<Record<string, unknown>> {
  const d = await corpo(res);
  if (!res.ok) {
    throw new ErroAuth(
      (d.message as string) ?? (d.error as string) ?? 'Algo deu errado.',
      (d.error as string) ?? 'unknown',
      res.status
    );
  }
  return d;
}

/**
 * Seta o cookie de sessão no domínio do frontend (skiller.tzolkin.cloud).
 *
 * O backend seta o cookie no domínio dele (easypanel.host). O middleware do
 * Next.js e os Server Components não conseguem ler cookies de outro domínio.
 * Esta chamada sincroniza: POST para /api/auth/session faz o Next.js setar o
 * mesmo token no domínio certo.
 */
async function sincronizarSessao(token: unknown): Promise<void> {
  if (typeof token !== 'string' || !token) return;
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => {/* falha silenciosa — próximo reload detecta ausência de sessão */});
}

// ------------------------------------------------------------------ ações

export async function entrarComSenha(email: string, password: string): Promise<void> {
  const d = await exigirOk(await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
  await sincronizarSessao(d.token);
}

export async function criarConta(dados: {
  email: string; password: string; name?: string; acceptTerms: boolean;
}): Promise<void> {
  const d = await exigirOk(await api('/register', { method: 'POST', body: JSON.stringify(dados) }));
  await sincronizarSessao(d.token);
}

export async function pedirLinkMagico(email: string, next?: string): Promise<string> {
  const d = await exigirOk(await api('/magic-link', { method: 'POST', body: JSON.stringify({ email, next }) }));
  return (d.message as string) ?? 'Link enviado.';
}

export async function consumirLinkMagico(token: string): Promise<void> {
  const d = await exigirOk(await api('/magic-link/consume', { method: 'POST', body: JSON.stringify({ token }) }));
  await sincronizarSessao(d.token);
}

export async function confirmarEmail(token: string): Promise<void> {
  await exigirOk(await api('/verify-email/consume', { method: 'POST', body: JSON.stringify({ token }) }));
}

export async function reenviarConfirmacao(): Promise<void> {
  await exigirOk(await api('/verify-email/resend', { method: 'POST', body: '{}' }));
}

export async function pedirRedefinicao(email: string): Promise<string> {
  const d = await exigirOk(await api('/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }));
  return (d.message as string) ?? 'Se existe uma conta, o link está a caminho.';
}

export async function redefinirSenha(token: string, password: string): Promise<void> {
  const d = await exigirOk(await api('/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }));
  await sincronizarSessao(d.token);
}

export async function sair(): Promise<void> {
  await Promise.all([
    api('/logout', { method: 'POST', body: '{}' }),
    fetch('/api/auth/session', { method: 'DELETE' }),
  ]);
}

/** Começa o fluxo do provedor. Navegação de topo, não `fetch`: há redirects. */
export function entrarComProvedor(provider: string, next?: string): void {
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  window.location.href = `${BASE_URL}/api/auth/${provider}/start${q}`;
}


/**
 * Entra na conta a partir de uma compra concluída.
 *
 * Quem comprou sem ter conta chega aqui: o backend confere com o Stripe que o
 * pagamento saiu, acha a conta que o webhook criou e devolve o cookie. Vale uma
 * vez só — recarregar a página de retorno não gera novo acesso.
 */
export async function entrarPeloCheckout(sessionId: string): Promise<{ email: string; needsPassword: boolean }> {
  const d = await exigirOk(await api('/from-checkout', { method: 'POST', body: JSON.stringify({ sessionId }) }));
  await sincronizarSessao(d.token);
  return { email: d.email as string, needsPassword: Boolean(d.needsPassword) };
}

/** Define a primeira senha de quem entrou sem uma (compra ou provedor). */
export async function definirSenha(password: string): Promise<void> {
  await exigirOk(await api('/password/set', { method: 'POST', body: JSON.stringify({ password }) }));
}

// ------------------------------------------------------------------- hook

export interface EstadoAuth {
  usuario: UsuarioLogado | null;
  provedores: Provedor[];
  /** `false` até a primeira resposta — evita piscar a tela de login. */
  carregado: boolean;
  recarregar: () => Promise<void>;
}

export function useAuth(): EstadoAuth {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const res = await api('/me');
      const d = (await res.json()) as RespostaMe;
      setUsuario(d.authenticated && d.user ? d.user : null);
      if (d.providers) setProvedores(d.providers);
    } catch {
      // Backend fora do ar não deve travar a tela num spinner eterno.
      setUsuario(null);
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { usuario, provedores, carregado, recarregar };
}
