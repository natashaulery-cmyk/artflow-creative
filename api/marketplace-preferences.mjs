import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const SUPPORTED = ['Vinted', 'Depop', 'Etsy', 'eBay'];
const normalize = (value = '') => String(value || '').trim().toLowerCase();

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function getProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id=$1 OR lower(email)=$2
     ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END, created_date NULLS LAST
     LIMIT 1`,
    [user.id, email]
  );
  return result.rows[0] || null;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [
    row?.primary_email,
    d.primary_email,
    ...(Array.isArray(d.member_emails) ? d.member_emails : []),
    ...(Array.isArray(d.sales_emails) ? d.sales_emails : []),
    ...(Array.isArray(d.expense_emails) ? d.expense_emails : []),
  ].map(normalize).filter(Boolean);
}

async function getBusiness(client, profile, user) {
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
  return result.rows.find((row) => active && row.base44_id === active)
    || result.rows.find((row) => email && businessEmails(row).includes(email))
    || null;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const profile = await getProfile(client, session.user);
    const business = await getBusiness(client, profile, session.user);
    if (!business) return res.status(404).json({ error: 'Business workspace not found' });

    const data = business.data || {};
    const configured = Array.isArray(data.tracked_marketplaces);
    const current = configured
      ? data.tracked_marketplaces.filter((item) => SUPPORTED.includes(item))
      : [];

    if (req.method === 'GET') {
      return res.status(200).json({
        supported: SUPPORTED,
        selected: current,
        configured,
      });
    }

    const body = parseBody(req);
    const requested = Array.isArray(body?.selected) ? body.selected : [];
    const selected = SUPPORTED.filter((item) => requested.includes(item));
    const nextData = { ...data, tracked_marketplaces: selected };
    await client.query(
      `UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,
      [business.base44_id, JSON.stringify(nextData)]
    );

    return res.status(200).json({ ok: true, supported: SUPPORTED, selected, configured: true });
  } catch (error) {
    console.error('marketplace preferences error', error?.message || error);
    return res.status(500).json({ error: 'Could not save marketplace preferences' });
  } finally {
    client.release();
  }
}
