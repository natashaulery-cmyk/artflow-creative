import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const q = await pool.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name`);
  console.log(q.rows.map(r => `${r.table_schema}.${r.table_name}`).join('\n'));
} finally { await pool.end(); }
