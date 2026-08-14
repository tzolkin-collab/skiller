import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in the environment variables.');
}

export const sql = postgres(process.env.DATABASE_URL);
export const db = drizzle(sql);
