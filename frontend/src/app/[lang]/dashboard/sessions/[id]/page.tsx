import SessionClient from './SessionClient';

export const metadata = { title: 'Sessão · Skiller' };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  return <SessionClient lang={lang} id={id} />;
}
