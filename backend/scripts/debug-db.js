import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function check() {
  const skills = await sql`SELECT id, status, name, playlist_title FROM skills ORDER BY created_at DESC`;
  console.log('Skills:', JSON.stringify(skills, null, 2));
  
  for (const s of skills) {
    const videos = await sql`SELECT processing_status, error, title FROM skill_videos WHERE skill_id = ${s.id}`;
    console.log(`Videos for ${s.id}:`, JSON.stringify(videos, null, 2));
  }
  process.exit(0);
}
check();
