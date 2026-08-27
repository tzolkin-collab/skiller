import { Hono } from 'hono';

export const wellKnownRouter = new Hono();

function apiUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata
 * Usado pelo cliente MCP para descobrir qual Authorization Server protege `/api/mcp`.
 */
wellKnownRouter.get('/oauth-protected-resource', (c) => {
  const base = apiUrl();
  return c.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: ['mcp:read', 'mcp:write', 'kb:read', 'kb:write', 'skills:read'],
    bearer_methods_supported: ['header'],
  });
});

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata
 * Descoberta de endpoints de registro dinâmico, autorização PKCE e emissão de tokens.
 */
wellKnownRouter.get('/oauth-authorization-server', (c) => {
  const base = apiUrl();
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:device_code',
    ],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['mcp:read', 'mcp:write', 'kb:read', 'kb:write', 'skills:read'],
  });
});
