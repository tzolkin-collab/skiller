import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

import { db } from '../src/db/db.js';
import { pipelineLogs, skills } from '../src/db/schema.js';
import { inArray, desc } from 'drizzle-orm';

async function check() {
  const s = await db.select().from(skills).where(inArray(skills.id, ['03490294-7d01-4f4d-8c57-fa88f1af8d1e', 'd51a27df-b6d5-4e49-b77e-e6bb09e76ae1']));
  console.log('Skills:', JSON.stringify(s, null, 2));

  process.exit(0);
}

check().catch(console.error);
