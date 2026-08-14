import { getDictionary } from '@/dictionaries';
import WatchClient from './WatchClient';

export default async function WatchPage(props: { 
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { lang } = await props.params;
  const searchParams = await props.searchParams;
  const dict = await getDictionary(lang);
  
  const v = searchParams?.v;
  const videoId = typeof v === 'string' ? v : undefined;
  
  if (!videoId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
        No video selected.
      </div>
    );
  }
  
  return <WatchClient dict={dict} lang={lang} videoId={videoId} />;
}
