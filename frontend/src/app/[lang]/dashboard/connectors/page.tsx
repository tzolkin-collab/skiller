import { getDictionary } from '@/dictionaries';
import ConnectorsClient from './ConnectorsClient';

/**
 * O endereço público do backend, lido aqui no servidor.
 *
 * A página inteira fala com a API por caminho relativo, via proxy — menos o
 * endpoint do MCP, que quem abre é um cliente externo e portanto precisa da
 * URL absoluta. Ler no Server Component e descer por prop entrega esse valor
 * sem `NEXT_PUBLIC_`, que o colocaria no bundle de todas as páginas.
 */
function mcpUrl(): string {
  const base = (process.env.API_URL ?? process.env.NEXT_API_URL ?? 'http://localhost:3001')
    .replace(/\/+$/, '');
  return `${base}/api/mcp`;
}

export default async function ConnectorsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return <ConnectorsClient lang={lang} dict={dict} mcpUrl={mcpUrl()} />;
}
