import CheckoutClient from './CheckoutClient';
import { exigirSessao } from '@/lib/require-session';

export const metadata = { title: 'Checkout · Skiller' };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const q = await searchParams;

  /*
   * Barra no servidor, e não só no cliente.
   *
   * O CheckoutClient já redireciona quem não tem sessão, mas isso acontece
   * depois da hidratação: quem abre o link direto vê a tela de pagamento por um
   * instante antes de ser mandado ao login. Aqui a resposta já sai como 307.
   *
   * O destino preserva a query, senão quem volta do login cai num checkout sem
   * plano nem moeda e teria que escolher de novo o que já tinha escolhido.
   */
  const busca = new URLSearchParams(
    Object.entries(q).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]]
    )
  ).toString();
  await exigirSessao(lang, `/${lang}/checkout${busca ? `?${busca}` : ''}`);

  return (
    <>
      {/*
        DNS e TLS resolvidos antes de precisarmos. O Stripe.js só começa a
        baixar depois que a sessão volta do nosso backend, então sem isto o
        handshake com `js.stripe.com` entra em série com a espera — e o
        formulário demora a aparecer por um motivo que não é trabalho nenhum.
        `fonts.gstatic.com` entra pelo mesmo motivo: é de lá que o iframe puxa
        a Roboto que faz a tipografia dos campos casar com a da página.
      */}
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <CheckoutClient lang={lang} />
    </>
  );
}
