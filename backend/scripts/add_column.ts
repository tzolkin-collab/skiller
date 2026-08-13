import postgres from 'postgres';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in .env');
}

const sql = postgres(process.env.DATABASE_URL);
async function run() {
  await sql`ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_package jsonb;`;
  console.log('Done');
  process.exit(0);
}
run();
