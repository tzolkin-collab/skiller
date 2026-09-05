import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { db } from '../src/db/db.js';
import { users } from '../src/db/schema.js';
import { abrirSessao, registrarEvento } from '../src/lib/mcp-sessions.js';

async function run() {
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.log('No users found.');
    return;
  }
  const user = allUsers[0];
  console.log('Creating session for user:', user.email);

  const sess = await abrirSessao({ userId: user.id, title: 'Assistente (Test)', client: 'cli' });
  console.log('Session created:', sess.id, sess.url);

  await registrarEvento(sess.id, 'info', 'Iniciando assistente...');
  await registrarEvento(sess.id, 'ok', 'Assistente conectado com sucesso.');
  await registrarEvento(sess.id, 'info', 'Analisando os requisitos...');
  
  console.log('Events added.');
  process.exit(0);
}
run();
