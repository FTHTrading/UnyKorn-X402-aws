const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://fth_x402_app:db5637f17445bbffa3ed143bc1a55935@localhost:5450/fth_x402'
});

async function main() {
  await c.connect();
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  
  for (const row of tables.rows) {
    const tbl = row.table_name;
    const cols = await c.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns 
      WHERE table_schema='public' AND table_name=$1 
      ORDER BY ordinal_position
    `, [tbl]);
    
    console.log(`\n=== ${tbl} ===`);
    for (const col of cols.rows) {
      let type = col.data_type;
      if (col.character_maximum_length) type += `(${col.character_maximum_length})`;
      if (col.udt_name === 'numeric' && col.numeric_precision) type = `numeric(${col.numeric_precision},${col.numeric_scale})`;
      if (col.udt_name === 'int8') type = 'bigint';
      if (col.udt_name === 'int4') type = 'integer';
      if (col.udt_name === 'bool') type = 'boolean';
      if (col.udt_name === 'float8') type = 'double precision';
      if (col.udt_name === 'timestamptz') type = 'timestamptz';
      if (col.udt_name === 'jsonb') type = 'jsonb';
      if (col.udt_name === 'text') type = 'text';
      if (col.udt_name === 'uuid') type = 'uuid';
      const nullable = col.is_nullable === 'YES' ? '?' : '';
      const def = col.column_default ? ` @default(${col.column_default})` : '';
      console.log(`  ${col.column_name}: ${type}${nullable}${def}`);
    }

    // Also get row count
    const count = await c.query(`SELECT COUNT(*)::int as cnt FROM "${tbl}"`);
    console.log(`  --- rows: ${count.rows[0].cnt}`);
  }
  
  // Also get primary keys and indexes
  console.log('\n\n=== PRIMARY KEYS ===');
  const pks = await c.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);
  for (const pk of pks.rows) {
    console.log(`  ${pk.table_name}: ${pk.column_name}`);
  }

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
