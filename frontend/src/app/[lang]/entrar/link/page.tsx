import RetornoClient from '../RetornoClient';

export const metadata = { title: 'Entrando · Skiller' };

export default async function LinkPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <RetornoClient lang={lang} acao="link" />;
}
