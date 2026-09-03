/**
 * Base das chamadas do NAVEGADOR para a API.
 *
 * Vazia de proposito: o browser chama o proprio dominio (`/api/...`) e o
 * rewrite em `next.config.ts` repassa para o backend. Era
 * `process.env.NEXT_PUBLIC_API_URL`, que obrigava o endereco do backend a
 * viajar dentro do bundle — e, pior, fazia o cookie de sessao chegar como
 * cookie de terceiro, que o Chrome bloqueia.
 *
 * Constante em vez de env var porque agora nao ha' o que configurar: o
 * destino do proxy vive no servidor, em `API_URL`.
 *
 * Nao serve para dois casos, e nenhum deles e' chamada de dados:
 *   - o inicio do login OAuth, que precisa de navegacao direta ao backend
 *     para o cookie nascer no mesmo host que atende o callback
 *     (`/api/auth/start/[provider]` cuida disso no servidor);
 *   - a URL do conector MCP mostrada na tela, que e' publica por natureza
 *     e chega por prop de Server Component.
 */
export const BASE_URL = '';
