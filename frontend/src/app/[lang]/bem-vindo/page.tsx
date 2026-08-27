import BemVindoClient from './BemVindoClient';

export const metadata = { title: 'Bem-vindo · Skiller' };

export default async function BemVindoPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <BemVindoClient lang={lang} />;
}
