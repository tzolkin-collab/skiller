import { NextRequest, NextResponse } from 'next/server';

/**
 * Bridge de sessão cross-domain.
 *
 * O backend (easypanel.host) e o frontend (tzolkin.cloud) estão em domínios
 * diferentes. O middleware do Next.js e os Server Components lêem cookies do
 * domínio do frontend — não conseguem ver o cookie setado pelo backend.
 *
 * Esta rota resolve: recebe o token de sessão (via GET para OAuth redirect,
 * via POST para logins por formulário) e seta o cookie no domínio certo.
 */

const COOKIE = 'skiller_session';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 dias em segundos
const TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;

function cookieOpts() {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };
}

/** OAuth redirect: GET /api/auth/session?token=XXX&next=/pt/dashboard */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const next = req.nextUrl.searchParams.get('next') ?? '/pt/dashboard';

  if (!TOKEN_RE.test(token)) {
    return NextResponse.redirect(new URL('/pt/entrar?erro=token_invalido', req.url));
  }

  const destino = next.startsWith('/') ? next : '/pt/dashboard';
  const res = NextResponse.redirect(new URL(destino, req.url));
  res.cookies.set(COOKIE, token, cookieOpts());
  return res;
}

/** Logins por formulário: POST /api/auth/session com { token } */
export async function POST(req: NextRequest) {
  let token = '';
  try {
    const body = await req.json() as { token?: string };
    token = body.token ?? '';
  } catch {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 });
  }

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'token_invalido' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, cookieOpts());
  return res;
}

/** Logout: DELETE /api/auth/session */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
