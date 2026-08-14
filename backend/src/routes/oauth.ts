import { Hono } from 'hono';
import { db } from '../db/db.js';
import { mcpDevices, oauthConnections, users } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';

if (!process.env.API_URL) {
  throw new Error('API_URL is required in the environment variables.');
}

export const oauthRouter = new Hono();

// --- RFC 8628: OAuth 2.0 Device Authorization Grant ---

// 1. CLI requests a device code
oauthRouter.post('/device/code', async (c) => {
  const deviceCode = crypto.randomBytes(32).toString('hex');
  const userCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars e.g. A1B2C3D4
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(mcpDevices).values({
    deviceCode,
    userCode,
    expiresAt,
    status: 'pending'
  });

  const verificationUri = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/verify` : `${process.env.API_URL}/verify`;

  return c.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    expires_in: 900, // 15 minutes in seconds
    interval: 5 // Polling interval
  });
});

// 2. CLI polls for token
oauthRouter.post('/token', async (c) => {
  const body = await c.req.parseBody();
  const grantType = body['grant_type'];
  const deviceCode = body['device_code'];

  if (grantType !== 'urn:ietf:params:oauth:grant-type:device_code' || !deviceCode) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // Find the device
  const deviceList = await db.select().from(mcpDevices).where(eq(mcpDevices.deviceCode, String(deviceCode)));
  const device = deviceList[0];

  if (!device) {
    return c.json({ error: 'invalid_client' }, 400);
  }

  if (new Date() > device.expiresAt) {
    return c.json({ error: 'expired_token' }, 400);
  }

  if (device.status === 'pending') {
    return c.json({ error: 'authorization_pending' }, 400);
  }

  if (device.status === 'authorized' && device.accessToken) {
    return c.json({
      access_token: device.accessToken,
      token_type: 'bearer'
    });
  }

  return c.json({ error: 'access_denied' }, 400);
});

// 3. Frontend verifies the user code
oauthRouter.post('/device/verify', async (c) => {
  const body = await c.req.json();
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

  // MOCK: Para testarmos sem auth real no momento, vamos criar ou pegar um user genérico
  let defaultUser = (await db.select().from(users).limit(1))[0];
  if (!defaultUser) {
    const inserted = await db.insert(users).values({
      email: 'admin@skiller.local',
      name: 'Skiller Admin'
    }).returning();
    defaultUser = inserted[0];
  }

  // Generate an access token for the device
  const accessToken = 'sk_' + crypto.randomBytes(32).toString('hex');

  await db.update(mcpDevices)
    .set({ 
      status: 'authorized', 
      accessToken, 
      userId: defaultUser.id 
    })
    .where(eq(mcpDevices.id, device.id));

  return c.json({ success: true, message: 'Device authorized successfully' });
});


// --- Standard Web OAuth 2.0 (Foundation for Platform Connectors) ---

oauthRouter.get('/connect/:provider', async (c) => {
  const provider = c.req.param('provider');
  // Aqui geraremos o state, PKCE, e faremos o redirect para o provedor
  // Ex: return c.redirect(`https://slack.com/oauth/v2/authorize?client_id=...`);
  return c.json({ message: `Initiating connection for ${provider}` });
});

oauthRouter.get('/callback/:provider', async (c) => {
  const provider = c.req.param('provider');
  const code = c.req.query('code');
  
  // Aqui trocaremos o code pelo token da plataforma e salvaremos em oauth_connections
  // await db.insert(oauthConnections).values({ ... })
  
  // Depois redirecionamos o usuário de volta para o Dashboard de Connectors
  return c.json({ message: `Callback received for ${provider} with code ${code}` });
});
