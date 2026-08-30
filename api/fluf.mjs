import crypto from 'node:crypto';
import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const FLUF_BASE_URL = 'https://fluf.io';
const normalizeEmail = (v = '') => String(v || '').trim().toLowerCase();

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('Art Flow auth secret is not configured');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptToken(row) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(row.token_iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(row.token_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.token_cipher, 'base64')),
    decipher.final(),
  ]).toString('utf8');
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

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function ensureSchema(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS artflow');
  await client.query(`
    CREATE TABLE IF NOT EXISTS artflow.fluf_connections (
      auth_user_id text PRIMARY KEY,
      email text,
      token_cipher text NOT NULL,
      token_iv text NOT NULL,
      token_tag text NOT NULL,
      connected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_sync_at timestamptz,
      last_error text,
      last_order_count integer NOT NULL DEFAULT 0,
      sync_cursor integer NOT NULL DEFAULT 1,
      webhook_key text,
      webhook_id text,
      webhook_secret_cipher text,
      webhook_secret_iv text,
      webhook_secret_tag text,
      webhook_url text,
      webhook_active boolean NOT NULL DEFAULT false,
      last_webhook_at timestamptz
    )
  `);
  const flufConnectionAdditions = [
    ['webhook_key', 'text'],
    ['webhook_id', 'text'],
    ['webhook_secret_cipher', 'text'],
    ['webhook_secret_iv', 'text'],
    ['webhook_secret_tag', 'text'],
    ['webhook_url', 'text'],
    ['webhook_active', 'boolean NOT NULL DEFAULT false'],
    ['last_webhook_at', 'timestamptz'],
  ];
  for (const [name, type] of flufConnectionAdditions) {
    await client.query(`ALTER TABLE artflow.fluf_connections ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS artflow_fluf_webhook_key_uq ON artflow.fluf_connections(webhook_key) WHERE webhook_key IS NOT NULL');
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
  await client.query('CREATE INDEX IF NOT EXISTS artflow_fluf_deliveries_user_idx ON artflow.fluf_webhook_deliveries(auth_user_id, received_at DESC)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS artflow.orders (
      base44_id text PRIMARY KEY,
      created_by_id text,
      created_date timestamptz,
      updated_date timestamptz,
      sale_date date,
      platform text,
      order_id text,
      product_name text,
      quantity numeric,
      size text,
      unit_price numeric,
      sale_total numeric,
      buyer text,
      source_email_id text,
      base_item_cost numeric,
      paper_ink_cost numeric,
      packaging_cost numeric,
      total_cost numeric,
      estimated_profit numeric,
      archived boolean DEFAULT false,
      sync_source text,
      business_id text,
      data jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  const additions = [
    ['base44_id', 'text'],
    ['created_by_id', 'text'],
    ['created_date', 'timestamptz'],
    ['updated_date', 'timestamptz'],
    ['sale_date', 'date'],
    ['platform', 'text'],
    ['order_id', 'text'],
    ['product_name', 'text'],
    ['quantity', 'numeric'],
    ['size', 'text'],
    ['unit_price', 'numeric'],
    ['sale_total', 'numeric'],
    ['buyer', 'text'],
    ['source_email_id', 'text'],
    ['base_item_cost', 'numeric'],
    ['paper_ink_cost', 'numeric'],
    ['packaging_cost', 'numeric'],
    ['total_cost', 'numeric'],
    ['estimated_profit', 'numeric'],
    ['archived', 'boolean DEFAULT false'],
    ['sync_source', 'text'],
    ['business_id', 'text'],
    ["data", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
  ];
  for (const [name, type] of additions) {
    await client.query(`ALTER TABLE artflow.orders ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS artflow_orders_base44_id_uq ON artflow.orders(base44_id)');
  await client.query('CREATE INDEX IF NOT EXISTS artflow_orders_fluf_source_idx ON artflow.orders(sync_source, source_email_id)');
}

async function flufRequest(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${FLUF_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ArtFlowCreative/1.0',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data && typeof data === 'object'
      ? (data.message || data.error || data.code)
      : data;
    const err = new Error(detail || `FLUF returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function registerWebhook(client, session, token) {
  const key = crypto.randomBytes(24).toString('hex');
  const baseUrl = String(process.env.BETTER_AUTH_URL || 'https://art-flow-creative-staging.vercel.app').replace(/\/$/, '');
  const url = `${baseUrl}/api/fluf-webhook?k=${encodeURIComponent(key)}`;
  const created = await flufRequest(token, '/wp-json/fc/api/v1/webhooks', {
    method: 'POST',
    body: {
      url,
      events: ['new_sale'],
      description: 'Art Flow Creative real-time sales sync',
    },
  });
  if (!created?.secret || created?.id === undefined || created?.id === null) {
    throw new Error('FLUF created the webhook but did not return its verification secret.');
  }
  const enc = encryptToken(String(created.secret));
  await client.query(
    `UPDATE artflow.fluf_connections
        SET webhook_key=$2, webhook_id=$3,
            webhook_secret_cipher=$4, webhook_secret_iv=$5, webhook_secret_tag=$6,
            webhook_url=$7, webhook_active=true, updated_at=now(), last_error=NULL
      WHERE auth_user_id=$1`,
    [session.user.id, key, String(created.id), enc.cipher, enc.iv, enc.tag, url]
  );

  let testStatus = null;
  try {
    const test = await flufRequest(token, `/wp-json/fc/api/v1/webhooks/${encodeURIComponent(String(created.id))}/test`, { method: 'POST' });
    testStatus = test?.status_code ?? test?.status ?? null;
  } catch (error) {
    await client.query(
      `UPDATE artflow.fluf_connections SET last_error=$2, updated_at=now() WHERE auth_user_id=$1`,
      [session.user.id, `Webhook registered, but FLUF's test delivery reported: ${String(error?.message || error).slice(0, 400)}`]
    );
  }

  return { id: String(created.id), url, testStatus };
}

function extractOrders(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [payload.orders, payload.items, payload.results, payload.data];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === 'object') {
      for (const nested of [c.orders, c.items, c.results]) {
        if (Array.isArray(nested)) return nested;
      }
    }
  }
  return [];
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
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const labels = {
    vinted: 'Vinted',
    depop: 'Depop',
    mercari: 'Mercari',
    poshmark: 'Poshmark',
    ebay: 'eBay',
    etsy: 'Etsy',
    shopify: 'Shopify',
    facebook: 'Facebook Marketplace',
    facebook_marketplace: 'Facebook Marketplace',
    whatnot: 'Whatnot',
    grailed: 'Grailed',
    vestiaire: 'Vestiaire Collective',
    vestiaire_collective: 'Vestiaire Collective',
    wallapop: 'Wallapop',
    temu: 'Temu',
  };
  return labels[key] || raw || 'Other';
}

function marketplaceCandidate(value) {
  if (value && typeof value === 'object') {
    return first(value.slug, value.key, value.code, value.name, value.title, value.id);
  }
  return value;
}

function resolveMarketplace(order) {
  const candidates = [
    order.marketplace_name,
    order.marketplaceName,
    order.source_marketplace,
    order.sourceMarketplace,
    order.original_marketplace,
    order.originalMarketplace,
    order.channel_name,
    order.channelName,
    order.source_channel,
    order.sourceChannel,
    order.marketplace,
    order.channel,
    order.source,
    order.store,
    order.platform_name,
    order.platformName,
    order.platform,
    order.shop?.marketplace,
    order.shop?.channel,
    order.connection?.marketplace,
    order.connection?.channel,
  ];

  for (const candidate of candidates) {
    const value = marketplaceCandidate(candidate);
    if (value === null || value === undefined || value === '') continue;
    const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    // FLUF's own internal product/order store is not the marketplace where the sale happened.
    if (key === 'fluf' || key === 'fluf_db' || key === 'fluf_connect') continue;
    return platformLabel(value);
  }
  return 'FLUF';
}

function itemList(order) {
  const items = first(order.items, order.line_items, order.products, order.order_items, order.lines);
  return Array.isArray(items) ? items : [];
}

function normalizeOrder(order, userEmail, forcedPlatform = null) {
  const items = itemList(order);
  const firstItem = items[0] || {};
  const orderId = String(first(
    order.order_id,
    order.orderId,
    order.order_number,
    order.orderNumber,
    order.reference,
    order.id,
    order.external_id,
    order.externalId
  ) || crypto.randomUUID());
  const platform = forcedPlatform ? platformLabel(forcedPlatform) : resolveMarketplace(order);
  const quantity = Math.max(1, items.length
    ? items.reduce((sum, item) => sum + Math.max(1, numberValue(first(item.quantity, item.qty, 1))), 0)
    : numberValue(first(order.quantity, order.qty, 1)) || 1);

  const names = items
    .map((item) => String(first(
      item.title,
      item.name,
      item.product_name,
      item.productName,
      item.product?.title,
      item.listing?.title
    ) || '').trim())
    .filter(Boolean);
  const productName = String(first(
    names.length ? names.slice(0, 4).join(' + ') + (names.length > 4 ? ` +${names.length - 4} more` : '') : null,
    order.product_name,
    order.productName,
    order.title,
    order.listing?.title,
    'FLUF sale'
  ));

  const total = numberValue(first(
    order.total,
    order.total_amount,
    order.totalAmount,
    order.order_total,
    order.orderTotal,
    order.total_price,
    order.totalPrice,
    order.amount,
    order.gross
  ));
  const unitPrice = quantity ? total / quantity : total;
  const buyer = String(first(
    order.buyer?.name,
    order.buyer?.username,
    order.buyer_username,
    order.customer?.name,
    order.customer_name,
    order.customerName,
    order.buyer,
    ''
  ) || '');
  const size = String(first(
    firstItem.size,
    firstItem.variant,
    firstItem.variation,
    firstItem.option,
    order.size,
    ''
  ) || '');
  const saleDate = dateValue(first(
    order.sale_date,
    order.saleDate,
    order.order_date,
    order.orderDate,
    order.created_at,
    order.createdAt,
    order.date_created,
    order.date,
    order.sold_at
  ));
  const sourceKey = `fluf:${platform.toLowerCase().replace(/\s+/g, '_')}:${orderId}`;
  const base44Id = `fluf_${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 28)}`;

  return {
    base44Id,
    saleDate,
    platform,
    orderId,
    productName,
    quantity,
    size,
    unitPrice,
    total,
    buyer,
    sourceKey,
    data: {
      access_emails: [normalizeEmail(userEmail)].filter(Boolean),
      fluf_order_id: orderId,
      fluf_platform: platform,
      fluf_status: first(order.status, order.order_status, null),
      currency: first(order.currency, order.total?.currency, order.amount?.currency, null),
      imported_via: 'fluf',
    },
  };
}

async function activeBusinessId(client, session) {
  const email = normalizeEmail(session.user.email);
  const profile = await client.query(
    `SELECT active_business_id, data
       FROM artflow.legacy_users
      WHERE auth_user_id=$1 OR lower(email)=$2
      ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [session.user.id, email]
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
    [email]
  ).catch(() => ({ rows: [] }));
  return business.rows[0]?.base44_id || null;
}

async function upsertOrder(client, normalized, session, businessId) {
  // Repair orders imported by the first FLUF integration, which could label the
  // original marketplace as "FLUF". Reuse that row instead of creating a duplicate.
  const legacy = await client.query(
    `SELECT base44_id
       FROM artflow.orders
      WHERE sync_source='fluf'
        AND order_id=$1
        AND lower(COALESCE(platform,'')) IN ('fluf','fluf connect','fluf_db')
      ORDER BY created_date DESC NULLS LAST
      LIMIT 1`,
    [normalized.orderId]
  );
  const targetId = legacy.rows[0]?.base44_id || normalized.base44Id;

  const result = await client.query(
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
       quantity=EXCLUDED.quantity, size=EXCLUDED.size, unit_price=EXCLUDED.unit_price,
       sale_total=EXCLUDED.sale_total, buyer=EXCLUDED.buyer,
       source_email_id=EXCLUDED.source_email_id, archived=false,
       sync_source='fluf', business_id=COALESCE(EXCLUDED.business_id, artflow.orders.business_id),
       data=COALESCE(artflow.orders.data, '{}'::jsonb) || EXCLUDED.data
     RETURNING (xmax = 0) AS inserted`,
    [
      targetId,
      session.user.id,
      normalized.saleDate,
      normalized.platform,
      normalized.orderId,
      normalized.productName,
      normalized.quantity,
      normalized.size,
      normalized.unitPrice,
      normalized.total,
      normalized.buyer,
      normalized.sourceKey,
      businessId,
      JSON.stringify(normalized.data),
    ]
  );
  return Boolean(result.rows[0]?.inserted);
}

async function getConnection(client, session) {
  const result = await client.query(
    'SELECT * FROM artflow.fluf_connections WHERE auth_user_id=$1 LIMIT 1',
    [session.user.id]
  );
  return result.rows[0] || null;
}

async function connectedFlufChannels(token) {
  const payload = await flufRequest(token, '/wp-json/fc/listings/v1/listings?per_page=1&page=1');
  const raw = Array.isArray(payload?.connected_channels) ? payload.connected_channels : [];
  const channels = raw
    .map((entry) => marketplaceCandidate(entry))
    .map((value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter((value) => value && value !== 'fluf' && value !== 'fluf_db' && value !== 'fluf_connect');
  return Array.from(new Set(channels));
}

async function syncOrders(client, session, connection, { reset = false } = {}) {
  let page = reset ? 1 : Math.max(1, Number(connection.sync_cursor || 1));
  const perPage = 100;
  let imported = 0;
  let updated = 0;
  let seen = 0;
  let morePossible = false;
  const token = decryptToken(connection);
  const businessId = await activeBusinessId(client, session);
  const channels = await connectedFlufChannels(token);

  // Ask FLUF for each marketplace separately. This is intentional: FLUF's
  // unified response can identify its internal source as "fluf", while the
  // platform query parameter is authoritative about where the order came from.
  for (const channel of channels) {
    const payload = await flufRequest(
      token,
      `/wp-json/fc/orders?platform=${encodeURIComponent(channel)}&per_page=${perPage}&page=${page}`
    );
    const orders = extractOrders(payload);
    if (orders.length >= perPage) morePossible = true;

    for (const raw of orders) {
      const normalized = normalizeOrder(raw, session.user.email, channel);
      const wasInserted = await upsertOrder(client, normalized, session, businessId);
      if (wasInserted) imported += 1;
      else updated += 1;
      seen += 1;
    }
  }

  // If no connected channel exposes order sync, fall back to FLUF's unified
  // endpoint so the user still gets whatever order data FLUF makes available.
  if (channels.length === 0) {
    const payload = await flufRequest(token, `/wp-json/fc/orders?per_page=${perPage}&page=${page}`);
    const orders = extractOrders(payload);
    if (orders.length >= perPage) morePossible = true;
    for (const raw of orders) {
      const normalized = normalizeOrder(raw, session.user.email);
      const wasInserted = await upsertOrder(client, normalized, session, businessId);
      if (wasInserted) imported += 1;
      else updated += 1;
      seen += 1;
    }
  }

  const nextPage = morePossible ? page + 1 : 1;
  await client.query(
    `UPDATE artflow.fluf_connections
        SET last_sync_at=now(), updated_at=now(), last_error=NULL,
            last_order_count=$2, sync_cursor=$3
      WHERE auth_user_id=$1`,
    [session.user.id, seen, nextPage]
  );

  return {
    imported,
    updated,
    seen,
    more_possible: morePossible,
    next_page: nextPage,
    channels,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Sign in to Art Flow to connect FLUF.' });

  const client = await pool.connect();
  try {
    await ensureSchema(client);
    const op = String(req.query?.op || req.body?.op || 'status');

    if (req.method === 'GET' && op === 'status') {
      const connection = await getConnection(client, session);
      return res.status(200).json({
        connected: Boolean(connection),
        connected_at: connection?.connected_at || null,
        last_sync_at: connection?.last_sync_at || null,
        last_error: connection?.last_error || null,
        last_order_count: connection?.last_order_count || 0,
        webhook_active: Boolean(connection?.webhook_active && connection?.webhook_secret_cipher),
        webhook_url: connection?.webhook_url || null,
        last_webhook_at: connection?.last_webhook_at || null,
      });
    }

    if (req.method === 'POST' && op === 'connect') {
      const token = String(req.body?.token || '').trim();
      if (!token.startsWith('fluf_pat_')) {
        return res.status(400).json({ error: 'Paste the FLUF API token that starts with fluf_pat_.' });
      }
      await flufRequest(token, '/wp-json/fc/orders?per_page=1&page=1');
      const enc = encryptToken(token);
      await client.query(
        `INSERT INTO artflow.fluf_connections (
           auth_user_id,email,token_cipher,token_iv,token_tag,connected_at,updated_at,last_error,sync_cursor,
           webhook_active
         ) VALUES ($1,$2,$3,$4,$5,now(),now(),NULL,1,false)
         ON CONFLICT (auth_user_id) DO UPDATE SET
           email=EXCLUDED.email, token_cipher=EXCLUDED.token_cipher,
           token_iv=EXCLUDED.token_iv, token_tag=EXCLUDED.token_tag,
           connected_at=now(), updated_at=now(), last_error=NULL, sync_cursor=1`,
        [session.user.id, normalizeEmail(session.user.email), enc.cipher, enc.iv, enc.tag]
      );
      let webhook = null;
      let webhookError = null;
      const current = await getConnection(client, session);
      if (current?.webhook_active && current?.webhook_secret_cipher) {
        webhook = { id: current.webhook_id, url: current.webhook_url, reused: true };
      } else {
        try {
          webhook = await registerWebhook(client, session, token);
        } catch (error) {
          webhookError = String(error?.message || error);
          await client.query(
            `UPDATE artflow.fluf_connections SET webhook_active=false, last_error=$2, updated_at=now() WHERE auth_user_id=$1`,
            [session.user.id, `Real-time sales setup: ${webhookError}`.slice(0, 500)]
          );
        }
      }
      return res.status(200).json({
        connected: true,
        webhook_active: Boolean(webhook),
        webhook_error: webhookError,
        message: webhook
          ? 'FLUF connected. New sales will arrive in Art Flow automatically.'
          : 'FLUF connected for manual syncing. Real-time webhook setup still needs attention.',
      });
    }

    if (req.method === 'POST' && op === 'enable-webhook') {
      const connection = await getConnection(client, session);
      if (!connection) return res.status(409).json({ error: 'Connect FLUF first.' });
      if (connection.webhook_active && connection.webhook_secret_cipher) {
        return res.status(200).json({ webhook_active: true, message: 'Real-time FLUF sales are already enabled.' });
      }
      const token = decryptToken(connection);
      const webhook = await registerWebhook(client, session, token);
      return res.status(200).json({ webhook_active: true, webhook_id: webhook.id, message: 'Real-time FLUF sales are enabled.' });
    }

    if (req.method === 'POST' && op === 'sync') {
      const connection = await getConnection(client, session);
      if (!connection) return res.status(409).json({ error: 'Connect FLUF first.' });
      try {
        const result = await syncOrders(client, session, connection, { reset: Boolean(req.body?.reset) });
        return res.status(200).json({
          ...result,
          message: result.more_possible
            ? `Synced ${result.seen} FLUF orders. More history is available.`
            : `FLUF sales are up to date. ${result.imported} new order${result.imported === 1 ? '' : 's'} added.`,
        });
      } catch (error) {
        await client.query(
          'UPDATE artflow.fluf_connections SET last_error=$2, updated_at=now() WHERE auth_user_id=$1',
          [session.user.id, String(error?.message || 'FLUF sync failed').slice(0, 500)]
        );
        throw error;
      }
    }

    if (req.method === 'POST' && op === 'disconnect') {
      await client.query('DELETE FROM artflow.fluf_connections WHERE auth_user_id=$1', [session.user.id]);
      return res.status(200).json({ connected: false, message: 'FLUF disconnected.' });
    }

    return res.status(405).json({ error: 'Unsupported FLUF operation.' });
  } catch (error) {
    console.error('FLUF integration error', error?.message || error);
    const status = Number(error?.status) === 401 ? 401 : Number(error?.status) === 403 ? 403 : 500;
    return res.status(status).json({
      error: Number(error?.status) === 401
        ? 'FLUF rejected that API token. Create a new token in FLUF Developers and reconnect.'
        : String(error?.message || 'FLUF request failed'),
    });
  } finally {
    client.release();
  }
}
