import { getDictionary } from '@/dictionaries';
import PricingClient from './PricingClient';

export default async function PricingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return <PricingClient lang={lang} dict={dict} />;
}
