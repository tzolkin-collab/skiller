import { db } from '../src/db/db.js';
import { sql } from 'drizzle-orm';

async function run() {
  await db.execute(sql`DELETE FROM skill_videos WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (partition BY skill_id, video_id ORDER BY id) AS rnum FROM skill_videos) t WHERE t.rnum > 1)`);
  console.log('Duplicates deleted');
  process.exit(0);
}
run().catch(console.error);
