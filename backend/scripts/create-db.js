import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

/**
 * Creates the `skiller` database. Connects to the server's default `postgres`
 * database, so it needs an admin connection string — set ADMIN_DATABASE_URL,
 * or fall back to DATABASE_URL with the database name swapped for `postgres`.
 */
function resolveAdminUrl() {
  if (process.env.ADMIN_DATABASE_URL) return process.env.ADMIN_DATABASE_URL;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

async function createDb() {
  const url = resolveAdminUrl();
  if (!url) {
    console.error('Set ADMIN_DATABASE_URL or DATABASE_URL in .env before running this script.');
    process.exit(1);
  }

  console.log('Connecting to postgres...');
  const sql = postgres(url);

  try {
    await sql`CREATE DATABASE skiller`;
    console.log('Database skiller created successfully!');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('Database skiller already exists.');
    } else {
      console.error('Error creating database:', err);
    }
  } finally {
    await sql.end();
  }
}

createDb();
