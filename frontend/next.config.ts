import type { NextConfig } from "next";

/**
 * Backend, visto pelo SERVIDOR do Next. Nao leva `NEXT_PUBLIC_` de proposito:
 * quem resolve estas URLs e' o proxy abaixo, que roda no servidor. O browser
 * nunca ve' este valor.
 */
const BACKEND = (process.env.API_URL ?? process.env.NEXT_API_URL ?? 'http://localhost:3001')
  .replace(/\/+$/, '');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },

  /**
   * O browser passa a falar so' com o proprio dominio; o Next repassa.
   *
   * Isso resolve tres coisas de uma vez: o endereco do backend sai do bundle,
   * o cookie de sessao vira primario (o browser o ve' vindo do proprio site,
   * nao de terceiro) e nenhuma requisicao do navegador toca mais o dominio
   * que o Safe Browsing marcou.
   *
   * `fallback` e' o que torna isto seguro: as rotas do proprio front,
   * tanto estaticas quanto dinamicas (/api/auth/session, /api/auth/start/...),
   * sao resolvidas ANTES e continuam ganhando; so' o que sobra e' repassado.
   * Com `afterFiles` o proxy engoliria as rotas dinamicas do App Router.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: '/api/:path*', destination: `${BACKEND}/api/:path*` },
      ],
    };
  },
};

export default nextConfig;
