/**
 * Reatribui as skills órfãs do `dummy@skiller.com` para uma conta real.
 *
 *   npx tsx scripts/reatribuir-skills.ts <email-de-destino>
 *   npx tsx scripts/reatribuir-skills.ts <email-de-destino> --apagar-placeholder
 *
 * Aquelas skills foram geradas quando o app ainda não tinha autenticação e
 * atribuía tudo a um placeholder. Não são lixo — são o histórico real. Apagar o
 * `dummy@skiller.com` cascatearia e levaria as 22 junto, então o caminho é
 * transferir primeiro e só depois remover.
 *
 * Roda em transação: ou tudo muda de dono, ou nada muda.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { skills, users } from '../src/db/schema.js';

const PLACEHOLDER = 'dummy@skiller.com';

const destino = process.argv[2];
const apagar = process.argv.includes('--apagar-placeholder');

if (!destino || !destino.includes('@')) {
  console.error('Uso: npx tsx scripts/reatribuir-skills.ts <email-de-destino> [--apagar-placeholder]');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL ausente. Rode com: npx env-cmd -f ../.env npx tsx scripts/reatribuir-skills.ts …');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
  const [origem] = await db.select().from(users).where(eq(users.email, PLACEHOLDER)).limit(1);
  if (!origem) {
    console.log(`Nada a fazer: ${PLACEHOLDER} não existe.`);
    process.exit(0);
  }

  const [alvo] = await db.select().from(users).where(eq(users.email, destino)).limit(1);
  if (!alvo) {
    console.error(`Conta de destino não existe: ${destino}`);
    console.error('Crie a conta primeiro (cadastro normal) e rode de novo.');
    process.exit(1);
  }

  const daOrigem = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, origem.id));
  console.log(`${daOrigem.length} skill(s) em ${PLACEHOLDER} -> ${destino}`);

  if (daOrigem.length === 0 && !apagar) {
    console.log('Nenhuma skill para mover. Use --apagar-placeholder para remover a conta vazia.');
    process.exit(0);
  }

  await sql.begin(async () => {
    await db.update(skills).set({ userId: alvo.id }).where(eq(skills.userId, origem.id));
    if (apagar) await db.delete(users).where(eq(users.id, origem.id));
  });

  const restantes = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, origem.id));
  console.log(`Movidas. Restam ${restantes.length} na origem.`);
  console.log(apagar ? `${PLACEHOLDER} removido.` : `${PLACEHOLDER} mantido (rode com --apagar-placeholder para remover).`);
} finally {
  await sql.end();
}
