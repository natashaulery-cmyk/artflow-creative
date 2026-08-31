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

const normalize = (value = '') => String(value ?? '').trim().toLowerCase();
const clean = (value = '') => String(value ?? '').trim();
const moneyNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizePlatform(value = '') {
  if (/vinted/i.test(value)) return 'Vinted';
  if (/depop/i.test(value)) return 'Depop';
  if (/etsy/i.test(value)) return 'Etsy';
  if (/ebay/i.test(value)) return 'eBay';
  return '';
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Google Sheets serial date: 1899-12-30 is serial day zero.
    const millis = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const raw = clean(value);
  if (/^20\d{2}-\d{2}-\d{2}$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function sheetIdFromBusiness(business, profile) {
  const data = business?.data || {};
  return clean(
    data.spreadsheet_id || data.spreadsheetId || data?.data?.spreadsheet_id ||
    profile?.spreadsheet_id || profile?.data?.spreadsheet_id || ''
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
    `SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`
  );
  const accessible = result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    const data = row.data || {};
    const emails = [
      row.primary_email,
      data.primary_email,
      ...(Array.isArray(data.member_emails) ? data.member_emails : []),
      ...(Array.isArray(data.sales_emails) ? data.sales_emails : []),
      ...(Array.isArray(data.expense_emails) ? data.expense_emails : []),
    ].map(normalize).filter(Boolean);
    return email && emails.includes(email);
  });
  return accessible.find((row) => row.base44_id === active)
    || accessible.find((row) => sheetIdFromBusiness(row, profile))
    || accessible[0]
    || null;
}

async function getGoogleAccessToken(req) {
  const headers = fromNodeHeaders(req.headers);
  const accounts = await auth.api.listUserAccounts({ headers });
  const google = (accounts || []).find((account) => account.providerId === 'google');
  if (!google?.id) {
    const error = new Error('Connect Google Sheets in Account first.');
    error.code = 'GOOGLE_NOT_LINKED';
    throw error;
  }
  const token = await auth.api.getAccessToken({ headers, body: { accountId: google.id } });
  if (!token?.accessToken) {
    const error = new Error('Reconnect Google Sheets in Account.');
    error.code = 'GOOGLE_RECONNECT';
    throw error;
  }
  return token.accessToken;
}

async function readRange(accessToken, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Could not read ArtFlow Tracker: ${text}`);
    error.code = response.status === 401 || response.status === 403 ? 'GOOGLE_RECONNECT' : 'SHEETS_ERROR';
    throw error;
  }
  const data = await response.json();
  return Array.isArray(data?.values) ? data.values : [];
}

function headerIndex(headers, exact, contains = []) {
  const normalized = headers.map((header) => normalize(header).replace(/[^a-z0-9]+/g, ' ').trim());
  for (const label of exact) {
    const index = normalized.indexOf(label);
    if (index >= 0) return index;
  }
  for (const label of contains) {
    const index = normalized.findIndex((header) => header.includes(label));
    if (index >= 0) return index;
  }
  return -1;
}

function parseOrders(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(8, rows.length); i += 1) {
    const joined = (rows[i] || []).map(normalize).join('|');
    if (joined.includes('sale date') && (joined.includes('product name') || joined.includes('platform'))) {
      headerRowIndex = i;
      break;
    }
  }
  const headers = rows[headerRowIndex] || [];
  const idx = {
    date: headerIndex(headers, ['sale date', 'date'], ['sale date']),
    platform: headerIndex(headers, ['platform', 'site'], ['platform']),
    orderId: headerIndex(headers, ['order id', 'order number'], ['order id', 'order #']),
    product: headerIndex(headers, ['product name', 'item name', 'title'], ['product', 'item']),
    quantity: headerIndex(headers, ['quantity', 'qty'], ['quantity']),
    size: headerIndex(headers, ['size'], ['size']),
    unitPrice: headerIndex(headers, ['unit price'], ['unit price']),
    saleTotal: headerIndex(headers, ['sale total', 'gross sale price', 'total sale'], ['sale total', 'gross sale']),
    buyer: headerIndex(headers, ['buyer', 'customer'], ['buyer', 'customer']),
    sourceId: headerIndex(headers, ['source email id', 'source id'], ['source email']),
    baseCost: headerIndex(headers, ['base item cost'], ['base item cost']),
    paperInk: headerIndex(headers, ['paper ink', 'paper and ink'], ['paper ink']),
    packaging: headerIndex(headers, ['packaging cost'], ['packaging']),
    totalCost: headerIndex(headers, ['total cost'], ['total cost']),
    profit: headerIndex(headers, ['estimated profit', 'net profit'], ['profit']),
    sourceUrl: headerIndex(headers, ['source url', 'order url'], ['source url']),
  };

  // Standard ArtFlow Tracker columns are A:P. Keep these fallbacks so older
  // copies of the tracker continue syncing even if a header was edited slightly.
  const fallback = {
    date: 0, platform: 1, orderId: 2, product: 3, quantity: 4, size: 5,
    unitPrice: 6, saleTotal: 7, buyer: 8, sourceId: 9, baseCost: 10,
    paperInk: 11, packaging: 12, totalCost: 13, profit: 14, sourceUrl: 15,
  };
  for (const key of Object.keys(idx)) if (idx[key] < 0) idx[key] = fallback[key];

  const parsed = [];
  const occurrenceByFingerprint = new Map();
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const productName = clean(row[idx.product]);
    const platform = normalizePlatform(row[idx.platform]);
    const saleTotal = moneyNumber(row[idx.saleTotal]);
    const saleDate = normalizeDate(row[idx.date]);
    if (!productName || !platform || !saleDate || saleTotal <= 0) continue;
    const quantity = Math.max(1, Number(row[idx.quantity]) || 1);
    const totalCost = moneyNumber(row[idx.totalCost]);
    const order = {
      sale_date: saleDate,
      platform,
      order_id: clean(row[idx.orderId]) || null,
      product_name: productName,
      quantity,
      size: clean(row[idx.size]) || 'Unknown',
      unit_price: moneyNumber(row[idx.unitPrice]) || +(saleTotal / quantity).toFixed(2),
      sale_total: +saleTotal.toFixed(2),
      buyer: clean(row[idx.buyer]) || null,
      source_email_id: clean(row[idx.sourceId]) || null,
      base_item_cost: +moneyNumber(row[idx.baseCost]).toFixed(2),
      paper_ink_cost: +moneyNumber(row[idx.paperInk]).toFixed(2),
      packaging_cost: +moneyNumber(row[idx.packaging]).toFixed(2),
      total_cost: +totalCost.toFixed(2),
      estimated_profit: moneyNumber(row[idx.profit]) || +(saleTotal - totalCost).toFixed(2),
      source_url: clean(row[idx.sourceUrl]) || null,
    };
    const occurrenceBase = fallbackFingerprint(order);
    const occurrence = (occurrenceByFingerprint.get(occurrenceBase) || 0) + 1;
    occurrenceByFingerprint.set(occurrenceBase, occurrence);
    order.sheet_record_key = `orders:${crypto.createHash('sha256').update(occurrenceBase).digest('hex')}:${occurrence}`;
    parsed.push(order);
  }
  return parsed;
}

function legacyFallbackFingerprint(order) {
  return [
    normalize(order.platform),
    order.sale_date,
    Number(order.sale_total).toFixed(2),
    normalize(order.product_name),
  ].join('|');
}

function fallbackFingerprint(order) {
  return [
    legacyFallbackFingerprint(order),
    Number(order.quantity || 1),
    normalize(order.size),
    normalize(order.buyer),
  ].join('|');
}

function lineIdentity(order) {
  return [
    normalize(order.product_name),
    Number(order.sale_total || 0).toFixed(2),
  ].join('|');
}

function existingKeys(order) {
  const keys = [];
  const sheetRecordKey = clean(order.sheet_record_key || order.data?.sheet_record_key);
  if (sheetRecordKey) keys.push(`sheet:${sheetRecordKey}`);
  if (clean(order.source_email_id) && !clean(order.source_email_id).startsWith('sheet:')) {
    keys.push(`source:${clean(order.source_email_id)}:${lineIdentity(order)}`);
  }
  if (clean(order.order_id)) {
    keys.push(`order:${normalize(order.platform)}:${clean(order.order_id)}:${lineIdentity(order)}`);
  }
  if (!keys.length) keys.push(`fallback:${fallbackFingerprint(order)}`);
  return keys;
}

async function syncOrders(client, profile, business, orders) {
  const result = await client.query(
    `SELECT base44_id, platform, order_id, product_name, quantity, size, sale_date, sale_total, source_email_id, data
       FROM artflow.orders
      WHERE business_id = $1 AND archived IS NOT TRUE`,
    [business.base44_id]
  );
  const seen = new Set();
  const legacySheetSources = new Set();
  for (const order of result.rows) {
    for (const key of existingKeys(order)) seen.add(key);
    const sourceId = clean(order.source_email_id);
    if (/^sheet:[a-f0-9]{64}$/i.test(sourceId)) legacySheetSources.add(sourceId);
  }
  const consumedLegacySources = new Set();

  const accessEmails = Array.from(new Set([
    business.primary_email,
    business.data?.primary_email,
    ...(Array.isArray(business.data?.member_emails) ? business.data.member_emails : []),
    ...(Array.isArray(business.data?.sales_emails) ? business.data.sales_emails : []),
    ...(Array.isArray(business.data?.expense_emails) ? business.data.expense_emails : []),
  ].map(normalize).filter(Boolean)));

  let imported = 0;
  let skipped = 0;
  for (const order of orders) {
    const keys = existingKeys(order);
    let duplicate = keys.some((key) => seen.has(key));

    // Before occurrence-aware sheet keys existed, identifier-less rows used one
    // hash per sale fingerprint. Consume that legacy match only once so a second
    // legitimate identical sale in the tracker is no longer discarded.
    if (!duplicate && !clean(order.source_email_id) && !clean(order.order_id)) {
      const legacySourceId = `sheet:${crypto.createHash('sha256').update(legacyFallbackFingerprint(order)).digest('hex')}`;
      if (legacySheetSources.has(legacySourceId) && !consumedLegacySources.has(legacySourceId)) {
        consumedLegacySources.add(legacySourceId);
        duplicate = true;
      }
    }

    if (duplicate) {
      skipped += 1;
      continue;
    }

    const generatedSourceId = order.source_email_id || `sheet:${order.sheet_record_key}`;
    const data = {
      access_emails: accessEmails,
      source_url: order.source_url,
      source: 'google_sheet_master',
      sheet_record_key: order.sheet_record_key,
    };
    const id = crypto.randomUUID();
    const now = new Date();
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
        order.order_id,
        order.product_name,
        order.quantity,
        order.size,
        order.unit_price,
        order.sale_total,
        order.buyer,
        generatedSourceId,
        order.base_item_cost,
        order.paper_ink_cost,
        order.packaging_cost,
        order.total_cost,
        order.estimated_profit,
        'google_sheet_master',
        business.base44_id,
        JSON.stringify(data),
      ]
    );
    imported += 1;
    for (const key of [...keys, `source:${generatedSourceId}`]) seen.add(key);
  }
  return { imported, skipped };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const profile = await getLegacyProfile(client, session.user);
    const business = await getBusiness(client, profile, session.user);
    if (!business?.base44_id) return res.status(400).json({ error: 'No Art Flow business workspace was found.' });

    const spreadsheetId = sheetIdFromBusiness(business, profile);
    if (!spreadsheetId) {
      return res.status(409).json({ error: 'Connect your ArtFlow Creative Tracker in Account first.', code: 'SPREADSHEET_NOT_CONNECTED' });
    }

    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(req);
    } catch (error) {
      return res.status(409).json({ error: error.message, code: error.code || 'GOOGLE_NOT_LINKED' });
    }

    const rows = await readRange(accessToken, spreadsheetId, 'Orders!A:P');
    const orders = parseOrders(rows);
    const result = await syncOrders(client, profile, business, orders);
    return res.status(200).json({
      ok: true,
      spreadsheetRows: orders.length,
      ...result,
      message: result.imported > 0
        ? `Synced ${result.imported} missing order${result.imported === 1 ? '' : 's'} from the tracker.`
        : 'Tracker orders are already synced.',
    });
  } catch (error) {
    console.error('tracker sync error', error?.message || error);
    const status = error?.code === 'GOOGLE_RECONNECT' ? 409 : 500;
    return res.status(status).json({ error: error?.message || 'Could not sync ArtFlow Tracker.', code: error?.code || 'TRACKER_SYNC_ERROR' });
  } finally {
    client.release();
  }
}
