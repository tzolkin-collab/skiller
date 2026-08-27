import { getDictionary } from '@/dictionaries';
import DashboardClient from './DashboardClient';

export default async function DashboardPage(props: { 
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { lang } = await props.params;
  const searchParams = await props.searchParams;
  const dict = await getDictionary(lang);
  
  const q = searchParams?.q;
  const editSkillId = searchParams?.editSkillId;
  const initialQuery = typeof q === 'string' ? q : 'AI Agent Tutorial';
  
  return <DashboardClient dict={dict} lang={lang} initialQuery={initialQuery} editSkillId={typeof editSkillId === 'string' ? editSkillId : undefined} />;
}
