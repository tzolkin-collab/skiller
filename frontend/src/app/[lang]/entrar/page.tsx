import EntrarClient from './EntrarClient';

export const metadata = { title: 'Entrar · Skiller' };

export default async function EntrarPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <EntrarClient lang={lang} />;
}
