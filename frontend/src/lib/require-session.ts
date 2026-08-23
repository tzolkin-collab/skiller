import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Exige sessão válida antes de renderizar o app.
 *
 * O middleware já barra quem não tem cookie nenhum, mas ele roda no edge e não
 * consulta banco: um cookie expirado, revogado ou forjado passa por lá. Aqui a
 * sessão é conferida contra o backend, que é quem sabe se ela ainda vale.
 *
 * Falha fechada de propósito. Se o backend não responder, manda para o login em
 * vez de abrir o painel — um portão que cede quando a rede oscila não é portão.
 */
const COOKIE = 'skiller_session';
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface SessaoAtual {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

/**
 * Ter conta nao e ter acesso.
 *
 * A porta de entrada e o teste de 7 dias do Starter, com cartao. Quem so
 * cadastrou e nunca comecou o teste — ou cancelou, ou deixou vencer — fica em
 * `free`, que nao da capacidade nenhuma. Sem esta checagem essas pessoas
 * entravam no painel e usavam o produto: era o "avanco livre".
 */
async function temPlanoAtivo(cookieSessao: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/account`, {
      headers: { cookie: `${COOKIE}=${cookieSessao}` },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const conta = (await res.json()) as { plan?: { id?: string } };
    return Boolean(conta.plan?.id && conta.plan.id !== 'free');
  } catch {
    return false;
  }
}

/** Devolve o usuário, ou redireciona para `/entrar` guardando o destino. */
export async function exigirSessao(lang: string, destino: string): Promise<SessaoAtual> {
  const jar = await cookies();
  const sessao = jar.get(COOKIE);

  const paraLogin = () => redirect(`/${lang}/entrar?next=${encodeURIComponent(destino)}`);

  if (!sessao?.value) paraLogin();

  let usuario: SessaoAtual | null = null;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { cookie: `${COOKIE}=${sessao!.value}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const corpo = (await res.json()) as { authenticated?: boolean; user?: SessaoAtual };
      if (corpo.authenticated && corpo.user) usuario = corpo.user;
    }
  } catch {
    // Backend fora do ar. Cai no redirect abaixo — nunca abre o painel.
  }

  // Fora do try: `redirect()` funciona lançando, e um catch o engoliria.
  if (!usuario) paraLogin();

  // Sessao valida, mas sem assinatura em vigor: manda escolher um plano em vez
  // de abrir o painel. `/pricing` e publica, entao nao ha laco de redirect.
  const ativo = await temPlanoAtivo(sessao!.value);
  if (!ativo) redirect(`/${lang}/pricing?motivo=sem-plano`);

  return usuario!;
}
