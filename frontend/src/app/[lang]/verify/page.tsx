import { getDictionary } from '@/dictionaries';
import VerifyClient from './VerifyClient';

export default async function VerifyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  return <VerifyClient lang={lang} dict={dict} />;
}
