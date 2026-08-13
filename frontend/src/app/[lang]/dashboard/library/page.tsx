import { getDictionary } from '@/dictionaries';
import LibraryClient from './LibraryClient';

export default async function LibraryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  return <LibraryClient dict={dict} lang={lang} />;
}
