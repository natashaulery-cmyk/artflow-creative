import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const normalize = (value = '') => String(value || '').trim().toLowerCase();
const clean = (value = '') => String(value || '').trim();
const today = () => new Date().toISOString().slice(0, 10);

function validPlatform(value = '') {
  if (/vinted/i.test(value)) return 'Vinted';
  if (/depop/i.test(value)) return 'Depop';
  if (/etsy/i.test(value)) return 'Etsy';
  if (/ebay/i.test(value)) return 'eBay';
  return '';
}

function validDate(value = '') {
  return /^20\d{2}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : today();
}

function inferSize(value = '') {
  const match = String(value).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
}

function getSpreadsheetId(business) {
  const d = business?.data || {};
  return clean(
    d.spreadsheet_id ||
    d.spreadsheetId ||
    d?.data?.spreadsheet_id ||
    business?.spreadsheet_id ||
    ''
  );
}

async function getLegacyProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
       WHERE auth_user_id = $1 OR lower(email) = $2
       ORDER BY CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END, created_date NULLS LAST
       LIMIT 1`,
    [user.id, email]
  );
  let profile = result.rows[0] || null;
  if (profile && !profile.auth_user_id) {
    await client.query(`UPDATE artflow.legacy_users SET auth_user_id=$2 WHERE base44_id=$1`, [profile.base44_id, user.id]);
    profile.auth_user_id = user.id;
  }
  return profile;
}

async function getBusiness(client, profile, user) {
  const email = normalize(user?.email);
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const result = await client.query(
    `SELECT base44_id, name, primary_email, data
       FROM artflow.businesses
       ORDER BY name NULLS LAST`
  );

  const accessible = result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    const d = row.data || {};
    const emails = [
      row.primary_email,
      d.primary_email,
      ...(Array.isArray(d.member_emails) ? d.member_emails : []),
      ...(Array.isArray(d.sales_emails) ? d.sales_emails : []),
      ...(Array.isArray(d.expense_emails) ? d.expense_emails : []),
    ].map(normalize).filter(Boolean);
    return email && emails.includes(email);
  });

  return accessible.find((row) => row.base44_id === active)
    || accessible.find((row) => getSpreadsheetId(row))
    || accessible[0]
    || null;
}

async function getGoogleAccessToken(req) {
  const headers = fromNodeHeaders(req.headers);
  const accounts = await auth.api.listUserAccounts({ headers });
  const google = (accounts || []).find((account) => account.providerId === 'google');
  if (!google?.id) {
    const error = new Error('Connect Google Sheets to Art Flow first.');
    error.code = 'GOOGLE_NOT_LINKED';
    throw error;
  }

  const token = await auth.api.getAccessToken({
    headers,
    body: { accountId: google.id },
  });
  if (!token?.accessToken) {
    const error = new Error('Reconnect Google so Art Flow can update your spreadsheet.');
    error.code = 'GOOGLE_RECONNECT';
    throw error;
  }
  return token.accessToken;
}

async function sheetsRequest(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Google Sheets error ${response.status}`);
    error.code = response.status === 401 || response.status === 403 ? 'GOOGLE_RECONNECT' : 'SHEETS_ERROR';
    throw error;
  }
  return data;
}

async function readRange(accessToken, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const data = await sheetsRequest(accessToken, url, { method: 'GET' });
  return Array.isArray(data?.values) ? data.values : [];
}

async function appendOrder(accessToken, spreadsheetId, row) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('Orders!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsRequest(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

function findCosts(rows, size, quantity, saleTotal) {
  const normalizedSize = normalize(size).replace(/\s+/g, '');
  let base = 0;
  let paper = 0;
  let packaging = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rowSize = normalize(row[2]).replace(/\s+/g, '');
    if (rowSize && rowSize === normalizedSize) {
      base = Number(row[3] || 0) || 0;
      paper = Number(row[4] || 0) || 0;
      packaging = Number(row[5] || 0) || 0;
      break;
    }
  }

  const baseItemCost = +(base * quantity).toFixed(2);
  const paperInkCost = +(paper * quantity).toFixed(2);
  const packagingCost = +packaging.toFixed(2);
  const totalCost = +(baseItemCost + paperInkCost + packagingCost).toFixed(2);
  return {
    base_item_cost: baseItemCost,
    paper_ink_cost: paperInkCost,
    packaging_cost: packagingCost,
    total_cost: totalCost,
    estimated_profit: +(saleTotal - totalCost).toFixed(2),
  };
}

function orderFingerprint(order) {
  return crypto.createHash('sha256').update([
    normalize(order.platform),
    clean(order.order_id),
    order.sale_date,
    Number(order.sale_total).toFixed(2),
    normalize(order.product_name),
    normalize(order.source_url),
  ].join('|')).digest('hex');
}

function sheetHasOrder(rows, order, sourceId) {
  const targetOrder = clean(order.order_id);
  const targetProduct = normalize(order.product_name);
  const targetPlatform = normalize(order.platform);
  return rows.slice(1).some((row) => {
    if (clean(row?.[9]) === sourceId) return true;
    if (targetOrder && clean(row?.[2]) === targetOrder && normalize(row?.[1]) === targetPlatform) return true;
    return !targetOrder
      && normalize(row?.[1]) === targetPlatform
      && normalize(row?.[3]) === targetProduct
      && clean(row?.[0]) === order.sale_date
      && Number(row?.[7] || 0).toFixed(2) === Number(order.sale_total).toFixed(2);
  });
}

async function neonHasOrder(client, businessId, order, sourceId) {
  const result = await client.query(
    `SELECT base44_id
       FROM artflow.orders
      WHERE business_id = $1
        AND archived IS NOT TRUE
        AND (
          source_email_id = $2
          OR ($3 <> '' AND order_id = $3 AND lower(platform) = lower($4))
        )
      LIMIT 1`,
    [businessId, sourceId, clean(order.order_id), order.platform]
  );
  return Boolean(result.rows[0]);
}

async function insertNeonOrder(client, profile, business, order, sourceId, costs) {
  if (await neonHasOrder(client, business.base44_id, order, sourceId)) return false;
  const id = crypto.randomUUID();
  const now = new Date();
  const accessEmails = Array.from(new Set([
    business.primary_email,
    business.data?.primary_email,
    ...(Array.isArray(business.data?.member_emails) ? business.data.member_emails : []),
    ...(Array.isArray(business.data?.sales_emails) ? business.data.sales_emails : []),
  ].map(normalize).filter(Boolean)));

  const data = {
    access_emails: accessEmails,
    source_url: order.source_url || null,
    source: 'mobile_sale_capture',
  };

  await client.query(
    `INSERT INTO artflow.orders (
       base44_id, created_by_id, created_date, updated_date,
       sale_date, platform, order_id, product_name, quantity, size,
       unit_price, sale_total, buyer, source_email_id,
       base_item_cost, paper_ink_cost, packaging_cost, total_cost,
       estimated_profit, archived, sync_source, business_id, data
     ) VALUES (
       $1,$2,$3,$3,$4,$5,$6,$7,$8,$9,
       $10,$11,$12,$13,$14,$15,$16,$17,$18,false,$19,$20,$21::jsonb
     )`,
    [
      id,
      profile?.base44_id || profile?.auth_user_id || null,
      now,
      order.sale_date,
      order.platform,
      order.order_id || null,
      order.product_name,
      order.quantity,
      order.size,
      order.unit_price,
      order.sale_total,
      order.buyer || null,
      sourceId,
      costs.base_item_cost,
      costs.paper_ink_cost,
      costs.packaging_cost,
      costs.total_cost,
      costs.estimated_profit,
      'google_sheet_master_mobile',
      business.base44_id,
      JSON.stringify(data),
    ]
  );
  return true;
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const body = parseBody(req);
  const platform = validPlatform(body.platform);
  const productName = clean(body.product_name).slice(0, 300);
  const quantity = Math.max(1, Math.min(100, Number(body.quantity) || 1));
  const saleTotal = Number(body.sale_total || 0);
  const saleDate = validDate(body.sale_date);
  const size = clean(body.size) || inferSize(`${productName}\n${body.pasted_text || ''}`);
  const sourceUrl = clean(body.source_url).slice(0, 1000);
  const orderId = clean(body.order_id).slice(0, 160);
  const buyer = clean(body.buyer).slice(0, 200);

  if (!platform || !productName || !Number.isFinite(saleTotal) || saleTotal <= 0) {
    return res.status(400).json({ error: 'Platform, product name, and a positive sale total are required.' });
  }

  const client = await pool.connect();
  try {
    const profile = await getLegacyProfile(client, session.user);
    const business = await getBusiness(client, profile, session.user);
    if (!business?.base44_id) return res.status(400).json({ error: 'No Art Flow business workspace was found.' });

    const tracked = Array.isArray(business.data?.tracked_marketplaces)
      ? business.data.tracked_marketplaces.filter((item) => ['Vinted', 'Depop', 'Etsy', 'eBay'].includes(item))
      : [];
    if (!tracked.includes(platform)) {
      return res.status(409).json({
        error: `${platform} is not selected in Sites I sell on. Turn it on in Account first.`,
        code: 'MARKETPLACE_NOT_SELECTED',
      });
    }

    const spreadsheetId = getSpreadsheetId(business);
    if (!spreadsheetId) {
      return res.status(409).json({
        error: 'Connect your ArtFlow Creative Tracker in Account first.',
        code: 'SPREADSHEET_NOT_CONNECTED',
      });
    }

    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(req);
    } catch (error) {
      return res.status(409).json({ error: error.message, code: error.code || 'GOOGLE_NOT_LINKED' });
    }

    const order = {
      platform,
      product_name: productName,
      quantity,
      sale_total: +saleTotal.toFixed(2),
      sale_date: saleDate,
      size,
      source_url: sourceUrl,
      order_id: orderId,
      buyer,
      unit_price: +(saleTotal / quantity).toFixed(2),
    };
    const fingerprint = orderFingerprint(order);
    const sourceId = `mobile:${fingerprint}`;

    const [orderRows, inventoryRows] = await Promise.all([
      readRange(accessToken, spreadsheetId, 'Orders!A:P'),
      readRange(accessToken, spreadsheetId, 'Inventory Costs!A:J').catch(() => []),
    ]);
    const costs = findCosts(inventoryRows, size, quantity, order.sale_total);

    let spreadsheetAdded = false;
    if (!sheetHasOrder(orderRows, order, sourceId)) {
      await appendOrder(accessToken, spreadsheetId, [
        order.sale_date,
        order.platform,
        order.order_id,
        order.product_name,
        order.quantity,
        order.size,
        order.unit_price,
        order.sale_total,
        order.buyer,
        sourceId,
        costs.base_item_cost,
        costs.paper_ink_cost,
        costs.packaging_cost,
        costs.total_cost,
        costs.estimated_profit,
        order.source_url,
      ]);
      spreadsheetAdded = true;
    }

    // Spreadsheet write happens first. Only after that succeeds do we mirror the
    // exact row into Neon for immediate app statistics and order display.
    const appAdded = await insertNeonOrder(client, profile, business, order, sourceId, costs);

    return res.status(200).json({
      ok: true,
      spreadsheetAdded,
      appAdded,
      size,
      costs,
      message: spreadsheetAdded
        ? 'Sale saved to the tracker and synced into Art Flow.'
        : appAdded
          ? 'Sale was already in the tracker and is now synced into Art Flow.'
          : 'Sale is already synced.',
    });
  } catch (error) {
    console.error('mobile sale error', error?.message || error);
    const status = error?.code === 'GOOGLE_RECONNECT' ? 409 : 500;
    return res.status(status).json({
      error: error?.message || 'Could not save the sale.',
      code: error?.code || 'MOBILE_SALE_ERROR',
    });
  } finally {
    client.release();
  }
}
