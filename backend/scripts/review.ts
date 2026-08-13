import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { skills, skillVideos } from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import * as fs from 'fs';

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  const lastSkill = await db.select().from(skills).where(eq(skills.status, 'completed')).orderBy(desc(skills.createdAt)).limit(1);
  
  if (lastSkill.length === 0) {
    fs.writeFileSync('report.json', JSON.stringify({ error: "No completed skills found" }, null, 2));
    process.exit(0);
  }
  
  const skill = lastSkill[0];
  const videos = await db.select().from(skillVideos).where(eq(skillVideos.skillId, skill.id));
  
  const report = {
    skill: {
      name: skill.name,
      description: skill.description,
      package: skill.skillPackage,
    },
    videos: videos.map(v => ({
      title: v.title,
      status: v.processingStatus,
      card: v.extractedCard
    }))
  };
  
  fs.writeFileSync('report.json', JSON.stringify(report, null, 2));
  process.exit(0);
}
main();
