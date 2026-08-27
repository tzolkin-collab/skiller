import { sql } from 'drizzle-orm';
import { db } from '../src/db/db';

async function main() {
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb;`);
  console.log("Done");
  process.exit(0);
}
main();
