const postgres = require('postgres');
const sql = postgres('postgres://postgres:3ad3550763e84d5864a7@easypanel.landcriativa.com:9000/skiller?sslmode=disable');

async function run() {
  try {
    await sql`ALTER TABLE skills ADD COLUMN human_md_content TEXT;`;
    console.log('Added human_md_content');
  } catch (e) {
    console.log(e.message);
  }
  
  try {
    await sql`ALTER TABLE skills ADD COLUMN language VARCHAR(10) DEFAULT 'en';`;
    console.log('Added language');
  } catch (e) {
    console.log(e.message);
  }
  
  process.exit(0);
}

run();
