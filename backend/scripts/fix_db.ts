import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

async function fix() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    await sql`ALTER TABLE "skills" ADD COLUMN "source_urls" jsonb;`;
    console.log("Column added successfully.");
  } catch (err: any) {
    if (err.code === '42701') {
      console.log("Column already exists.");
    } else {
      console.error(err);
    }
  } finally {
    await sql.end();
  }
}

fix();
