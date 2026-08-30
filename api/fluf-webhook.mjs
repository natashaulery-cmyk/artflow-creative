import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('Art Flow auth secret is not configured');
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptWebhookSecret(row) {
  if (!row?.webhook_secret_cipher || !row?.webhook_secret_iv || !row?.webhook_secret_tag) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(row.webhook_secret_iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(row.webhook_secret_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.webhook_secret_cipher, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySignature(secret, rawBody, signature, timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) >= 300) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex')}`;
  return safeEqual(expected, signature);
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object') return numberValue(first(value.amount, value.value, value.total, value.gross));
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function dateValue(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().slice(0, 10);
}

function platformLabel(value) {
  const raw = String(value || 'Other').trim();
  const key = raw.toLowerCase();
  const labels = {
    vinted: 'Vinted', depop: 'Depop', mercari: 'Mercari', poshmark: 'Poshmark',
    ebay: 'eBay', etsy: 'Etsy', shopify: 'Shopify', facebook: 'Facebook Marketplace',
    facebook_marketplace: 'Facebook Marketplace', whatnot: 'Whatnot', grailed: 'Grailed',
    vestiaire: 'Vestiaire Collective', wallapop: 'Wallapop', temu: 'Temu', tise: 'Tise', yaga: 'Yaga', tilt: 'Tilt',
  };
  return labels[key] || raw || 'Other';
}

function normalizeSale(payload, email) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const orderId = String(first(payload.order_id, payload.event_id, crypto.randomUUID()));
  const platform = platformLabel(first(payload.channel, payload.platform, payload.marketplace));
  const quantity = Math.max(1, items.length
    ? items.reduce((sum, item) => sum + Math.max(1, numberValue(first(item.quantity, 1))), 0)
    : numberValue(first(payload.quantity, 1)) || 1);
  const names = items.map((item) => String(first(item.title, item.name, '') || '').trim()).filter(Boolean);
  const productName = String(first(
    names.length ? names.join(' + ') : null,
    payload.title,
    'FLUF sale'
  ));
  const total = numberValue(first(payload.order_total, payload.total, payload.price));
  const unitPrice = quantity ? total / quantity : total;
  const sourceKey = `fluf:${platform.toLowerCase().replace(/\s+/g, '_')}:${orderId}`;
  const base44Id = `fluf_${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 28)}`;
  return {
    base44Id,
    saleDate: dateValue(first(payload.sold_at, payload.fired_at)),
    platform,
    orderId,
    productName,
    quantity,
    size: '',
    unitPrice,
    total,
    buyer: String(first(payload.buyer_username, '') || ''),
    sourceKey,
    data: {
      access_emails: [String(email || '').trim().toLowerCase()].filter(Boolean),
      imported_via: 'fluf_webhook',
      fluf_event_id: first(payload.event_id, null),
      fluf_user_id: first(payload.fluf_user_id, null),
      fluf_connection_id: first(payload.connection_id, null),
      fluf_sku: first(payload.sku, null),
      currency: first(payload.currency, null),
      items,
    },
  };
}

async function ensureSchema(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS artflow');
  await client.query(`
    CREATE TABLE IF NOT EXISTS artflow.fluf_webhook_deliveries (
      event_id text PRIMARY KEY,
      auth_user_id text NOT NULL,
      event_name text,
      attempt integer,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      status text NOT NULL DEFAULT 'received',
      error text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
}

async function activeBusinessId(client, authUserId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  const profile = await client.query(
    `SELECT active_business_id, data
       FROM artflow.legacy_users
      WHERE auth_user_id=$1 OR lower(email)=$2
      ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [authUserId, normalized]
  ).catch(() => ({ rows: [] }));
  const row = profile.rows[0];
  const active = row?.active_business_id || row?.data?.active_business_id;
  if (active) return active;

  const business = await client.query(
    `SELECT base44_id
       FROM artflow.businesses
      WHERE lower(primary_email)=$1
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(data->'member_emails')='array' THEN data->'member_emails' ELSE '[]'::jsonb END
           ) e(value) WHERE lower(e.value)=$1
         )
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(data->'sales_emails')='array' THEN data->'sales_emails' ELSE '[]'::jsonb END
           ) e(value) WHERE lower(e.value)=$1
         )
      ORDER BY created_date NULLS LAST
      LIMIT 1`,
    [normalized]
  ).catch(() => ({ rows: [] }));
  return business.rows[0]?.base44_id || null;
}

async function upsertOrder(client, normalized, authUserId, businessId) {
  await client.query(
    `INSERT INTO artflow.orders (
       base44_id, created_by_id, created_date, updated_date, sale_date, platform,
       order_id, product_name, quantity, size, unit_price, sale_total, buyer,
       source_email_id, base_item_cost, paper_ink_cost, packaging_cost, total_cost,
       estimated_profit, archived, sync_source, business_id, data
     ) VALUES (
       $1,$2,now(),now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       0,0,0,0,$10,false,'fluf',$13,$14::jsonb
     )
     ON CONFLICT (base44_id) DO UPDATE SET
       updated_date=now(), sale_date=EXCLUDED.sale_date, platform=EXCLUDED.platform,
       order_id=EXCLUDED.order_id, product_name=EXCLUDED.product_name,
       quantity=EXCLUDED.quantity, unit_price=EXCLUDED.unit_price,
       sale_total=EXCLUDED.sale_total, buyer=EXCLUDED.buyer,
       source_email_id=EXCLUDED.source_email_id, archived=false,
       sync_source='fluf', business_id=COALESCE(EXCLUDED.business_id, artflow.orders.business_id),
       data=COALESCE(artflow.orders.data, '{}'::jsonb) || EXCLUDED.data`,
    [
      normalized.base44Id, authUserId, normalized.saleDate, normalized.platform,
      normalized.orderId, normalized.productName, normalized.quantity, normalized.size,
      normalized.unitPrice, normalized.total, normalized.buyer, normalized.sourceKey,
      businessId, JSON.stringify(normalized.data),
    ]
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = String(req.query?.k || new URL(req.url, 'https://art-flow-creative-staging.vercel.app').searchParams.get('k') || '');
  if (!key) return res.status(404).json({ error: 'Webhook not found' });

  const rawBody = await readRawBody(req);
  const signature = String(req.headers['x-fluf-signature'] || '');
  const timestamp = String(req.headers['x-fluf-timestamp'] || '');
  const deliveryHeader = String(req.headers['x-fluf-delivery'] || '');
  const eventHeader = String(req.headers['x-fluf-event'] || '');
  const attempt = Number(req.headers['x-fluf-attempt'] || 1) || 1;

  const client = await pool.connect();
  let eventId = deliveryHeader || null;
  try {
    await ensureSchema(client);
    const found = await client.query(
      `SELECT * FROM artflow.fluf_connections WHERE webhook_key=$1 AND webhook_active=true LIMIT 1`,
      [key]
    );
    const connection = found.rows[0];
    if (!connection) return res.status(404).json({ error: 'Webhook not found' });

    const secret = decryptWebhookSecret(connection);
    if (!secret || !verifySignature(secret, rawBody, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid FLUF signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    eventId = String(first(deliveryHeader, payload.event_id, crypto.createHash('sha256').update(rawBody).digest('hex')));
    const eventName = String(first(eventHeader, payload.event, 'unknown'));

    const inserted = await client.query(
      `INSERT INTO artflow.fluf_webhook_deliveries
         (event_id, auth_user_id, event_name, attempt, payload, status)
       VALUES ($1,$2,$3,$4,$5::jsonb,'received')
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, connection.auth_user_id, eventName, attempt, JSON.stringify(payload)]
    );

    if (!inserted.rows.length) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (payload.test === true) {
      await client.query(
        `UPDATE artflow.fluf_webhook_deliveries SET status='test_ok', processed_at=now() WHERE event_id=$1`,
        [eventId]
      );
      await client.query(
        `UPDATE artflow.fluf_connections SET last_webhook_at=now(), last_error=NULL, updated_at=now() WHERE auth_user_id=$1`,
        [connection.auth_user_id]
      );
      return res.status(200).json({ received: true, test: true });
    }

    if (eventName !== 'new_sale' && payload.event !== 'new_sale') {
      await client.query(
        `UPDATE artflow.fluf_webhook_deliveries SET status='ignored', processed_at=now() WHERE event_id=$1`,
        [eventId]
      );
      return res.status(200).json({ received: true, ignored: true });
    }

    const normalized = normalizeSale(payload, connection.email);
    const businessId = await activeBusinessId(client, connection.auth_user_id, connection.email);
    await upsertOrder(client, normalized, connection.auth_user_id, businessId);

    await client.query(
      `UPDATE artflow.fluf_webhook_deliveries SET status='processed', processed_at=now(), error=NULL WHERE event_id=$1`,
      [eventId]
    );
    await client.query(
      `UPDATE artflow.fluf_connections
          SET last_webhook_at=now(), last_sync_at=now(), last_error=NULL, updated_at=now()
        WHERE auth_user_id=$1`,
      [connection.auth_user_id]
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('FLUF webhook error', error?.message || error);
    if (eventId) {
      await client.query(
        `UPDATE artflow.fluf_webhook_deliveries
            SET status='failed', processed_at=now(), error=$2
          WHERE event_id=$1`,
        [eventId, String(error?.message || error).slice(0, 500)]
      ).catch(() => {});
    }
    return res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
}
