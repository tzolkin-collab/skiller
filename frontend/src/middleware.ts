import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

// Espelha o registro de `dictionaries.ts`. Não dá para importar de lá: aquele
// módulo é `server-only` e o middleware roda no edge. Ao acrescentar um idioma,
// mude nos dois — `pnpm --filter frontend run check` cobra a paridade dos JSON.
const locales = ['en', 'pt'];
const defaultLocale = 'en';

/** Mesmo nome que o backend grava em `lib/current-user.ts`. */
const COOKIE_SESSAO = 'skiller_session';

/**
 * Prefixos que exigem conta. Tudo sob `/dashboard` é o app em si.
 *
 * O middleware só sabe se o cookie EXISTE — validar exige banco, e isso é
 * trabalho do layout. Mesmo assim vale: cobre o caso comum de digitar a URL
 * ou voltar depois do logout, sem custar uma ida ao backend.
 */
function exigeSessao(pathname: string): boolean {
  return locales.some((l) => pathname === `/${l}/dashboard` || pathname.startsWith(`/${l}/dashboard/`));
}

/**
 * Aceita apenas etiquetas BCP-47 plausíveis.
 *
 * O `Negotiator` devolve o que vier no cabeçalho — inclusive `*`, quando o
 * cliente não tem preferência. E `Intl.getCanonicalLocales('*')` LANÇA, o que
 * derrubava a página inteira com 500: qualquer request sem `Accept-Language`
 * válido (curl, health check, alguns clientes de IDE abrindo a URL de
 * verificação do conector) batia nisso.
 */
function etiquetaValida(tag: string): boolean {
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(tag);
}

function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  const brutas = new Negotiator({ headers: negotiatorHeaders }).languages() ?? [];
  const languages = brutas.filter(etiquetaValida);

  if (languages.length === 0) return defaultLocale;

  try {
    return match(languages, locales, defaultLocale);
  } catch {
    // Rede de segurança: escolher idioma nunca deve poder derrubar uma página.
    return defaultLocale;
  }
}

export function middleware(request: NextRequest) {
  // Check if there is any supported locale in the pathname
  const { pathname } = request.nextUrl;
  
  // Exclude static assets and api routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return;
  }

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    const lang = pathname.split('/')[1] ?? defaultLocale;
    const isHome = locales.some((l) => pathname === `/${l}` || pathname === `/${l}/`);
    const isForceHome = request.nextUrl.searchParams.has('force');
    const hasSession = request.cookies.has(COOKIE_SESSAO);
    const isReturning = request.cookies.has('skiller_returning');

    // Regra da Home: Cliente com conta não passa pela landing page a menos que "?force=true".
    if (isHome && !isForceHome) {
      if (hasSession) {
        const destino = request.nextUrl.clone();
        destino.pathname = `/${lang}/dashboard`;
        return NextResponse.redirect(destino);
      } else if (isReturning) {
        const destino = request.nextUrl.clone();
        destino.pathname = `/${lang}/entrar`;
        return NextResponse.redirect(destino);
      }
    }

    // Portão: sem cookie de sessão, o app não abre. Antes `/dashboard` era
    // acessível por URL direta — dava para ver o painel inteiro sem conta.
    if (exigeSessao(pathname) && !hasSession) {
      const destino = request.nextUrl.clone();
      destino.pathname = `/${lang}/entrar`;
      destino.search = '';
      destino.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(destino);
    }
    
    const response = NextResponse.next();

    // Marca o cliente permanentemente (10 anos) para sabermos que ele já tem conta, 
    // mesmo que depois a sessão (skiller_session) expire.
    if (hasSession && !isReturning) {
      response.cookies.set('skiller_returning', '1', {
        maxAge: 60 * 60 * 24 * 365 * 10,
        path: '/',
      });
    }

    return response;
  }

  // Redirect if there is no locale
  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    '/((?!_next|api|favicon.ico).*)',
  ],
};
