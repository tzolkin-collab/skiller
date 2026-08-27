import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/db.js';
import { mcpDevices, oauthClients, oauthCodes, oauthTokens, users } from '../db/schema.js';
import { eq, and, isNull, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { denyUnless } from '../lib/entitlements.js';
import { normalizePlan, can } from '../lib/plans.js';
import { validarSessao } from '../lib/auth.js';

export const oauthRouter = new Hono();

function apiUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function verifyPkce(verifier: string, challenge: string): boolean {
  // S256 PKCE: BASE64URL-ENCODE(SHA256(verifier))
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

// -------------------------------------------------------------------
// 1. RFC 7591: Dynamic Client Registration
// -------------------------------------------------------------------
oauthRouter.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  };

  const clientName = (body.client_name ?? 'MCP Client').slice(0, 100);
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  if (redirectUris.length === 0) {
    return c.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must contain at least one valid URI.',
      },
      400
    );
  }

  const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = `sec_${crypto.randomBytes(32).toString('hex')}`;
  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
  const responseTypes = body.response_types ?? ['code'];
  const tokenEndpointAuthMethod = body.token_endpoint_auth_method ?? 'none';

  const [client] = await db
    .insert(oauthClients)
    .values({
      id: clientId,
      clientSecret,
      clientName,
      redirectUris,
      grantTypes,
      responseTypes,
      tokenEndpointAuthMethod,
    })
    .returning();

  return c.json(
    {
      client_id: client.id,
      client_secret: client.clientSecret ?? undefined,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    },
    201
  );
});

// -------------------------------------------------------------------
// 2. RFC 7636 / RFC 6749: Authorization Endpoint (PKCE + Session Check)
// -------------------------------------------------------------------
oauthRouter.get('/authorize', async (c) => {
  const responseType = c.req.query('response_type');
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method') ?? 'S256';
  const state = c.req.query('state');
  const scope = c.req.query('scope') ?? 'mcp:read mcp:write';

  if (responseType !== 'code') {
    return c.json({ error: 'unsupported_response_type' }, 400);
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'client_id, redirect_uri, and code_challenge are required.',
      },
      400
    );
  }

  if (codeChallengeMethod !== 'S256') {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported.',
      },
      400
    );
  }

  // Verifica cliente registrado
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  if (!client) {
    return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 400);
  }

  // Valida URI de redirecionamento autorizada
  if (!client.redirectUris.includes(redirectUri)) {
    return c.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uri does not match registered URIs.',
      },
      400
    );
  }

  // Verifica se o usuário está logado via cookie de sessão
  const sessao = await validarSessao(getCookie(c, 'skiller_session'));
  if (!sessao) {
    // Redireciona para o login com retorno para autorizar
    const loginUrl = `${appUrl()}/pt/entrar?next=${encodeURIComponent(c.req.url)}`;
    return c.redirect(loginUrl);
  }

  // Verifica se o plano do usuário dá direito ao conector MCP
  const [u] = await db.select().from(users).where(eq(users.id, sessao.userId)).limit(1);
  if (!u) {
    return c.redirect(`${appUrl()}/pt/entrar?next=${encodeURIComponent(c.req.url)}`);
  }

  if (!can(u.plan, 'connectors.mcp')) {
    return c.redirect(`${appUrl()}/pt/pricing?motivo=connectors_mcp`);
  }

  // Emite o authorization code com validade de 10 minutos
  const code = `code_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(oauthCodes).values({
    code,
    userId: u.id,
    clientId: client.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: 'S256',
    scope,
    expiresAt,
  });

  // Redireciona para o cliente com o code
  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  if (state) target.searchParams.set('state', state);

  return c.redirect(target.toString());
});

// -------------------------------------------------------------------
// 3. RFC 6749 / RFC 7636 / RFC 8628: Token Endpoint
// -------------------------------------------------------------------
oauthRouter.post('/token', async (c) => {
  const tipo = c.req.header('content-type') ?? '';
  const body: Record<string, unknown> = tipo.includes('application/json')
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();

  const grantType = body['grant_type'];

  // A. Authorization Code Grant (PKCE)
  if (grantType === 'authorization_code') {
    const code = String(body['code'] ?? '');
    const codeVerifier = String(body['code_verifier'] ?? '');
    const clientId = String(body['client_id'] ?? '');
    const redirectUri = String(body['redirect_uri'] ?? '');

    if (!code || !codeVerifier) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'code and code_verifier are required for authorization_code grant.',
        },
        400
      );
    }

    const [authCode] = await db
      .select()
      .from(oauthCodes)
      .where(and(eq(oauthCodes.code, code), isNull(oauthCodes.usedAt), gt(oauthCodes.expiresAt, new Date())))
      .limit(1);

    if (!authCode) {
      return c.json({ error: 'invalid_grant', error_description: 'Code is invalid, expired, or already used.' }, 400);
    }

    // Valida client_id e redirect_uri caso enviados
    if (clientId && authCode.clientId !== clientId) {
      return c.json({ error: 'invalid_client' }, 400);
    }
    if (redirectUri && authCode.redirectUri !== redirectUri) {
      return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400);
    }

    // Validação PKCE (S256)
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed.' }, 400);
    }

    // Marca code como usado
    await db.update(oauthCodes).set({ usedAt: new Date() }).where(eq(oauthCodes.code, code));

    // Verifica plano do usuário
    const [u] = await db.select().from(users).where(eq(users.id, authCode.userId)).limit(1);
    if (!u || !can(u.plan, 'connectors.mcp')) {
      return c.json({ error: 'access_denied', error_description: 'Subscription does not support MCP connector.' }, 403);
    }

    const accessToken = `sk_at_${crypto.randomBytes(32).toString('hex')}`;
    const refreshToken = `sk_rt_${crypto.randomBytes(32).toString('hex')}`;
    const accessTokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hora
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 dias

    await db.insert(oauthTokens).values({
      userId: u.id,
      clientId: authCode.clientId,
      accessToken,
      refreshToken,
      scope: authCode.scope ?? 'mcp:read mcp:write',
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authCode.scope ?? 'mcp:read mcp:write',
    });
  }

  // B. Refresh Token Grant
  if (grantType === 'refresh_token') {
    const refreshToken = String(body['refresh_token'] ?? '');
    if (!refreshToken) {
      return c.json({ error: 'invalid_request', error_description: 'refresh_token is required.' }, 400);
    }

    const [tokenRecord] = await db
      .select()
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.refreshToken, refreshToken),
          isNull(oauthTokens.revokedAt),
          gt(oauthTokens.refreshTokenExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!tokenRecord) {
      return c.json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' }, 400);
    }

    const [u] = await db.select().from(users).where(eq(users.id, tokenRecord.userId)).limit(1);
    if (!u || !can(u.plan, 'connectors.mcp')) {
      return c.json({ error: 'access_denied', error_description: 'Subscription does not support MCP connector.' }, 403);
    }

    // Revoga o token anterior (Token Rotation)
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, tokenRecord.id));

    const newAccessToken = `sk_at_${crypto.randomBytes(32).toString('hex')}`;
    const newRefreshToken = `sk_rt_${crypto.randomBytes(32).toString('hex')}`;
    const accessTokenExpiresAt = new Date(Date.now() + 3600 * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);

    await db.insert(oauthTokens).values({
      userId: u.id,
      clientId: tokenRecord.clientId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      scope: tokenRecord.scope,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    return c.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: newRefreshToken,
      scope: tokenRecord.scope ?? 'mcp:read mcp:write',
    });
  }

  // C. Device Code Grant (RFC 8628 para CLI)
  if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
    const deviceCode = body['device_code'];
    if (!deviceCode) {
      return c.json({ error: 'invalid_request', error_description: 'device_code is required.' }, 400);
    }

    const deviceList = await db.select().from(mcpDevices).where(eq(mcpDevices.deviceCode, String(deviceCode)));
    const device = deviceList[0];

    if (!device) return c.json({ error: 'invalid_client' }, 400);
    if (new Date() > device.expiresAt) return c.json({ error: 'expired_token' }, 400);
    if (device.status === 'pending') return c.json({ error: 'authorization_pending' }, 400);

    if (device.status === 'authorized' && device.accessToken) {
      return c.json({
        access_token: device.accessToken,
        token_type: 'Bearer',
      });
    }

    return c.json({ error: 'access_denied' }, 400);
  }

  return c.json(
    {
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types: authorization_code, refresh_token, urn:ietf:params:oauth:grant-type:device_code.',
    },
    400
  );
});

// -------------------------------------------------------------------
// 4. RFC 7009: Token Revocation Endpoint
// -------------------------------------------------------------------
oauthRouter.post('/revoke', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  const token = body.token ?? c.req.query('token');

  if (token) {
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthTokens.accessToken, token));
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthTokens.refreshToken, token));
  }

  return c.json({ ok: true });
});

// -------------------------------------------------------------------
// 5. RFC 8628: Device Flow Endpoints (CLI)
// -------------------------------------------------------------------
oauthRouter.post('/device/code', async (c) => {
  const deviceCode = crypto.randomBytes(32).toString('hex');
  const userCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(mcpDevices).values({
    deviceCode,
    userCode,
    expiresAt,
    status: 'pending',
  });

  const base = appUrl();
  const verificationUri = `${base}/pt/verify`;

  return c.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    expires_in: 900,
    interval: 5,
  });
});

oauthRouter.post('/device/verify', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { userCode?: string; userId?: string };
  const userCode = body.userCode;

  if (!userCode) {
    return c.json({ error: 'user_code required' }, 400);
  }

  const deviceList = await db.select().from(mcpDevices).where(eq(mcpDevices.userCode, String(userCode)));
  const device = deviceList[0];

  if (!device) {
    return c.json({ error: 'invalid_code' }, 400);
  }

  if (new Date() > device.expiresAt) {
    return c.json({ error: 'expired_code' }, 400);
  }

  const userId = body.userId ?? c.req.query('userId');
  if (!userId) {
    return c.json({ error: 'user_required', message: 'Informe qual conta está autorizando o dispositivo.' }, 400);
  }

  const contas = await db.select().from(users).where(eq(users.id, String(userId))).limit(1);
  const defaultUser = contas[0];
  if (!defaultUser) {
    return c.json({ error: 'user_not_found' }, 404);
  }

  const barrado = denyUnless(normalizePlan(defaultUser.plan), 'connectors.mcp');
  if (barrado) return c.json(barrado, 402);

  const accessToken = `sk_${crypto.randomBytes(32).toString('hex')}`;

  await db
    .update(mcpDevices)
    .set({
      status: 'authorized',
      accessToken,
      userId: defaultUser.id,
    })
    .where(eq(mcpDevices.id, device.id));

  return c.json({ success: true, message: 'Device authorized successfully' });
});
