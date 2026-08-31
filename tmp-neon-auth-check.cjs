const pg = require('pg');
const connectionString = 'postgresql://neondb_owner:npg_yEKla3Fo8Xsz@ep-blue-cake-awym2ibp-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
(async () => {
  try {
    const tables = await pool.query(`select table_schema, table_name from information_schema.tables where table_schema in ('public','neon_auth') and lower(table_name) in ('user','users','session','sessions','account','accounts','verification','verifications') order by 1,2`);
    const result = { tables: tables.rows, counts: {} };
    for (const row of tables.rows) {
      const qualified = `"${row.table_schema.replaceAll('"','""')}"."${row.table_name.replaceAll('"','""')}"`;
      try {
        const count = await pool.query(`select count(*)::int as c from ${qualified}`);
        result.counts[`${row.table_schema}.${row.table_name}`] = count.rows[0].c;
      } catch {}
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
  } finally {
    await pool.end().catch(() => {});
  }
})();
