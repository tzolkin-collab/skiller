import { getDictionary } from '@/dictionaries';
import PricingClient from './PricingClient';

export default async function PricingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <>
      {/*
        Aquecido aqui, e nao so no checkout: quem esta nesta pagina e o
        candidato a clicar em assinar, e o handshake com o Stripe fica pronto
        antes da navegacao em vez de comecar depois dela.
      */}
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <PricingClient lang={lang} dict={dict} />
    </>
  );
}
