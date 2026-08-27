import RetornoClient from '../RetornoClient';

export const metadata = { title: 'Confirmando e-mail · Skiller' };

export default async function ConfirmarPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <RetornoClient lang={lang} acao="confirmar" />;
}
