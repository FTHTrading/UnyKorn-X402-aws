const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://fth_x402_app:db5637f17445bbffa3ed143bc1a55935@localhost:5450/fth_x402'
});

async function main() {
  await c.connect();
  const res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log(res.rows.map(r => r.table_name).join('\n'));
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
