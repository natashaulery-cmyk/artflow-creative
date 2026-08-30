import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const normalize = (v = '') => String(v || '').trim().toLowerCase();

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function getLegacyProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const found = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id = $1 OR lower(email) = $2
     ORDER BY CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END, created_date NULLS LAST
     LIMIT 1`,
    [user.id, email]
  );
  let row = found.rows[0] || null;
  if (row && !row.auth_user_id) {
    await client.query(`UPDATE artflow.legacy_users SET auth_user_id=$2 WHERE base44_id=$1`, [row.base44_id, user.id]);
    row.auth_user_id = user.id;
  }
  return row;
}

async function getAccessibleBusinesses(client, profile, user) {
  const email = normalize(user?.email);
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
  return result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    const d = row.data || {};
    const emails = [row.primary_email, d.primary_email, ...(d.member_emails || []), ...(d.sales_emails || [])]
      .map(normalize)
      .filter(Boolean);
    return email && emails.includes(email);
  });
}

function businessIds(businesses) {
  return Array.from(new Set((businesses || []).map((b) => b.base44_id).filter(Boolean)));
}

async function countBusinessRows(client, table, ids, email, archivedColumn = false) {
  const params = [ids, email];
  const archived = archivedColumn ? `AND archived IS NOT TRUE` : '';
  const result = await client.query(
    `SELECT count(*)::int AS count
       FROM artflow.${table}
      WHERE (
        business_id = ANY($1::text[])
        OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value)
           WHERE lower(e.value) = $2
        )
      ) ${archived}`,
    [ids, normalize(email)]
  );
  return result.rows[0]?.count || 0;
}

async function summary(client, session) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
  const [orders, expenses, emailImports, syncStates] = await Promise.all([
    countBusinessRows(client, 'orders', ids, session.user.email, true),
    countBusinessRows(client, 'expenses', ids, session.user.email, true),
    countBusinessRows(client, 'email_import_messages', ids, session.user.email, false),
    countBusinessRows(client, 'sync_states', ids, session.user.email, false),
  ]);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || profile?.full_name || null,
      legacyProfileLinked: Boolean(profile),
      legacyProfileId: profile?.base44_id || null,
      activeBusinessId: profile?.active_business_id || profile?.data?.active_business_id || null,
    },
    businesses: businesses.map((b) => ({ id: b.base44_id, name: b.name || b.data?.name || 'Business' })),
    counts: { orders, expenses, emailImports, syncStates },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const op = String(req.query?.op || 'summary');
    if (op === 'summary') return res.status(200).json(await summary(client, session));
    return res.status(400).json({ error: 'Unknown operation' });
  } catch (e) {
    console.error('neon data error', e?.message || e);
    return res.status(500).json({ error: 'Data request failed' });
  } finally {
    client.release();
  }
}
