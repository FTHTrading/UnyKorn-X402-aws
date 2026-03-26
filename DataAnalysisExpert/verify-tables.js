const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://fth_x402_app:db5637f17445bbffa3ed143bc1a55935@localhost:5450/fth_x402'
});

async function main() {
  await c.connect();
  const res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('Total tables:', res.rows.length);
  res.rows.forEach(r => console.log(' ', r.table_name));
  
  // Verify legacy data is intact
  const checks = ['guardian_audit_log', 'guardian_metrics', 'invoices', 'namespace_records', 'guardian_daemon_state'];
  for (const tbl of checks) {
    const cnt = await c.query(`SELECT COUNT(*)::int as cnt FROM "${tbl}"`);
    console.log(`  ${tbl}: ${cnt.rows[0].cnt} rows`);
  }
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
