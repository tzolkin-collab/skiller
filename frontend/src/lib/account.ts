'use client';

import { BASE_URL } from '@/lib/api-base';
/**
 * Operações sobre a própria conta.
 *
 * Todas mandam o cookie de sessão e nenhuma recebe `userId`: quem é a pessoa
 * quem diz é o backend. Uma função que aceitasse `userId` como argumento
 * reabriria exatamente o buraco que a autenticação fechou.
 */


async function api(caminho: string, init?: RequestInit): Promise<Response> {
  return fetch(BASE_URL + '/api/account' + caminho, {
    cache: 'no-store',
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

async function exigirOk(res: Response): Promise<Record<string, unknown>> {
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((d.message as string) ?? (d.error as string) ?? 'Algo deu errado.');
  return d;
}

// ------------------------------------------------------------------ conta

export interface ContaAtual {
  id: string;
  name: string | null;
  email: string;
  credits: number;
  plan: {
    id: string;
    label: string;
    priceCents: number | null;
    monthlyCredits: number;
    trialing?: boolean;
    allowance?: number;
    validUntil: string | null;
    lapsed: boolean;
  };
  capabilities: string[];
}

/**
 * A conta de quem está logado.
 *
 * Sem argumento, como todo o resto deste arquivo: quem identifica a pessoa é o
 * cookie, e uma versão que aceitasse `userId` reabriria o buraco que a
 * autenticação fechou.
 */
export async function buscarConta(): Promise<ContaAtual> {
  const res = await api('');
  if (!res.ok) throw new Error('conta_indisponivel');
  return (await res.json()) as ContaAtual;
}

// ------------------------------------------------------------------ perfil

export async function salvarPerfil(dados: { name?: string; avatarUrl?: string; preferences?: Record<string, unknown> }): Promise<void> {
  await exigirOk(await api('/profile', { method: 'PATCH', body: JSON.stringify(dados) }));
}

// ---------------------------------------------------------------- vínculos

export interface Vinculo {
  id: string;
  provider: string;
  email: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listarVinculos(): Promise<Vinculo[]> {
  const res = await api('/identities');
  return res.ok ? res.json() : [];
}

export async function desvincular(id: string): Promise<void> {
  await exigirOk(await api(`/identities/${id}`, { method: 'DELETE' }));
}

// ------------------------------------------------------------- dispositivos

export interface SessaoAberta {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export async function listarSessoes(): Promise<SessaoAberta[]> {
  const res = await api('/sessions');
  return res.ok ? res.json() : [];
}

export async function encerrarSessao(id: string): Promise<void> {
  await exigirOk(await api(`/sessions/${id}`, { method: 'DELETE' }));
}

// -------------------------------------------------------- meios de pagamento

export interface Cartao {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export async function listarCartoes(): Promise<{ methods: Cartao[]; unavailable?: boolean }> {
  const res = await api('/payment-methods');
  return res.ok ? res.json() : { methods: [], unavailable: true };
}

// ---------------------------------------------------------------- LGPD

/** Baixa o JSON com tudo que guardamos. */
export async function baixarMeusDados(): Promise<void> {
  const res = await api('/export');
  if (!res.ok) throw new Error('Não foi possível gerar a exportação.');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'skiller-meus-dados.json';
  a.click();
  // Sem isto o blob fica na memória da aba até ela fechar.
  URL.revokeObjectURL(url);
}

export async function pedirExclusao(): Promise<string> {
  const d = await exigirOk(await api('/delete', { method: 'POST', body: '{}' }));
  return (d.message as string) ?? 'Conta agendada para exclusão.';
}

// ------------------------------------------------------------------ ajuda

/** Descrição curta de um navegador, a partir do user-agent. */
export function descreverDispositivo(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';

  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : 'Navegador';

  const sistema = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';

  return sistema ? `${navegador} no ${sistema}` : navegador;
}

export const NOME_PROVEDOR: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  password: 'E-mail e senha',
  email: 'Link mágico',
};
