require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const postgres = require('./backend/node_modules/postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT id, name, status, error FROM skills WHERE id = '7c0ccc6a-f777-4eba-90e5-730ed58af76d'`;
  console.log('Skill:', res[0]);
  const videos = await sql`SELECT video_id, processing_status, error FROM skill_videos WHERE skill_id = '7c0ccc6a-f777-4eba-90e5-730ed58af76d'`;
  console.log('Videos:', videos);
  process.exit(0);
}
run();
