require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const postgres = require('./backend/node_modules/postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT video_id, url FROM skill_videos ORDER BY published_at DESC LIMIT 5`;
  console.log('Recent videos:', res);
  process.exit(0);
}
run();
