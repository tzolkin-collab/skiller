import { getDictionary } from '@/dictionaries';
import SkillClient from './SkillClient';

export default async function SkillPage({ params }: { params: Promise<{ id: string, lang: string }> }) {
  const { id, lang } = await params;
  const dict = await getDictionary(lang);
  
  return <SkillClient dict={dict} skillId={id} />;
}
