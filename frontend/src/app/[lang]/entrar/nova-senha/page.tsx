import RetornoClient from '../RetornoClient';

export const metadata = { title: 'Nova senha · Skiller' };

export default async function NovaSenhaPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <RetornoClient lang={lang} acao="nova-senha" />;
}
