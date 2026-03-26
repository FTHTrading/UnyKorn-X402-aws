const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://fth_x402_app:db5637f17445bbffa3ed143bc1a55935@localhost:5450/fth_x402'
});

async function main() {
  await c.connect();
  
  // Get all unique constraints and indexes
  const res = await c.query(`
    SELECT 
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY', 'FOREIGN KEY')
    GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
    ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
  `);
  
  for (const row of res.rows) {
    console.log(`${row.table_name} | ${row.constraint_type} | ${row.constraint_name} | (${row.columns})`);
  }

  // Also get all indexes
  console.log('\n=== INDEXES ===');
  const indexes = await c.query(`
    SELECT 
      schemaname, tablename, indexname, indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  for (const idx of indexes.rows) {
    console.log(`${idx.tablename} | ${idx.indexname} | ${idx.indexdef}`);
  }
  
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
