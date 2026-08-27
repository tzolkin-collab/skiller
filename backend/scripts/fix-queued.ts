import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

import { db } from '../src/db/db.js';
import { skills } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

async function fix() {
  const queued = await db.select().from(skills).where(sql`status = 'queued'`);
  
  if (queued.length > 0) {
    console.log(`Found ${queued.length} stuck queued skills. Setting them to 'failed'.`);
    await db.update(skills).set({ 
      status: 'failed'
    }).where(sql`status = 'queued'`);
    console.log('Done.');
  } else {
    console.log('No queued skills found.');
  }

  process.exit(0);
}

fix().catch(console.error);
