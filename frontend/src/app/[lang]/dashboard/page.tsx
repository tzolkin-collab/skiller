import { getDictionary } from '@/dictionaries';
import DashboardClient from './DashboardClient';

export default async function DashboardPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  return <DashboardClient dict={dict} lang={lang} />;
}
