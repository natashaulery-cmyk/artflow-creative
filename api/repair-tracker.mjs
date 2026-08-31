import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const TOKEN = '7fkys7AYZfRdM_TemPEeEe1gJbNGPFaKYXetA0QxPn8';
const BUSINESS_ID = '6a922b3cda8054f2f06c9832';
const OLD_SHEET_ID = '1jcqVlLsnzHI4Q0jTdMrYW5wprAf59Nzf8lWWTtTCpAs';
const NEW_SHEET_ID = '1nRVqSpgmYWPobHiLCCiAJPLfFl8aP9CTMpewNhHgsek';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (String(req.headers['x-artflow-repair-token'] || '') !== TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business = await client.query(
      `UPDATE artflow.businesses
          SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{spreadsheet_id}', to_jsonb($2::text), true)
        WHERE base44_id = $1
        RETURNING base44_id, data->>'spreadsheet_id' AS spreadsheet_id`,
      [BUSINESS_ID, NEW_SHEET_ID]
    );

    const profiles = await client.query(
      `UPDATE artflow.legacy_users
          SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{spreadsheet_id}', to_jsonb($2::text), true)
        WHERE active_business_id = $1
           OR data->>'active_business_id' = $1
           OR data->>'spreadsheet_id' = $3`,
      [BUSINESS_ID, NEW_SHEET_ID, OLD_SHEET_ID]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      business_updated: business.rowCount,
      profiles_updated: profiles.rowCount,
      spreadsheet_id: business.rows[0]?.spreadsheet_id || null,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('repair tracker error', error?.message || error);
    return res.status(500).json({ error: 'Repair failed' });
  } finally {
    client.release();
  }
}
