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
// Variável privada — só roda no servidor (import 'server-only' garante isso).
// Não precisa do prefixo NEXT_PUBLIC_, que exporia a URL no bundle do cliente.
const BASE_URL = process.env.NEXT_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface SessaoAtual {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
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

  // Sem plano NÃO redireciona.
  //
  // A versão anterior mandava para `/pricing?motivo=sem-plano`, e o efeito era
  // expulsar do app quem tinha acabado de entrar nele: a pessoa clicava em
  // "Começar" na landing, fazia login, e aterrissava numa tabela de preços que
  // não pediu para ver — sem nunca ter visto o produto.
  //
  // Agora o painel abre e o `PlanGate` bloqueia por cima, com o produto visível
  // atrás. Login primeiro, app depois, oferta por último e já de dentro.
  return usuario!;
}
