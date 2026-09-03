import { NextRequest, NextResponse } from 'next/server';

/**
 * Porta de entrada do login social.
 *
 * Redireciona (nao repassa) para o `/start` do backend. A diferenca importa:
 * o backend grava ali um cookie de 10 min com o `state` do OAuth, e quem o
 * le' e' o callback, que o provedor chama no dominio do backend. Repassando
 * pelo proxy, o cookie nasceria em skiller.tzolkin.cloud e seria procurado em
 * api.skiller.tzolkin.cloud — some, e o login morre em `resposta_incompleta`.
 * Com redirect, o browser vai ao backend e os dois lados ficam no mesmo host.
 *
 * O ganho e' o endereco do backend ficar no servidor: o cliente so' conhece
 * `/api/auth/start/google`, do proprio dominio.
 */

const PROVEDORES = new Set(['google', 'github']);

function backend(): string {
  return (process.env.API_URL ?? process.env.NEXT_API_URL ?? 'http://localhost:3001')
    .replace(/\/+$/, '');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  // Lista fechada: `provider` entra na URL de destino, e sem isto viraria
  // um redirecionador aberto — bastaria forjar o caminho para mandar
  // alguem a um host arbitrario a partir de um link do nosso dominio.
  if (!PROVEDORES.has(provider)) {
    return NextResponse.redirect(new URL('/pt/entrar?erro=provider_desconhecido', req.url));
  }

  const proximo = req.nextUrl.searchParams.get('next');
  const destino = new URL(`${backend()}/api/auth/${provider}/start`);
  // So' caminho interno: `next` volta como redirect depois do login, e aceitar
  // URL absoluta aqui teria o mesmo problema de redirecionador aberto.
  if (proximo?.startsWith('/')) destino.searchParams.set('next', proximo);

  return NextResponse.redirect(destino);
}
