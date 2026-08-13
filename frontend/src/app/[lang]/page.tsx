import { getDictionary } from '@/dictionaries';
import { LandingPageClient } from '@/components/ui/LandingPageClient/LandingPageClient';

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return <LandingPageClient dict={dict} lang={lang} />;
}
