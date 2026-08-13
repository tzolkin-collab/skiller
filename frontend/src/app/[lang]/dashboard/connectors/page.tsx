import { getDictionary } from '@/dictionaries';
import ConnectorsClient from './ConnectorsClient';

export default async function ConnectorsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  return <ConnectorsClient lang={lang} dict={dict} />;
}
