import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const ENTITY_TABLES = {
  Order: 'orders',
  Expense: 'expenses',
  Business: 'businesses',
  SyncState: 'sync_states',
  EmailImportMessage: 'email_import_messages',
  EtsyConnection: 'etsy_connections',
  MileageLog: 'mileage_logs',
  ScheduleEvent: 'schedule_events',
  ArtPiece: 'art_pieces',
  InventoryCost: 'inventory_costs',
  User: 'legacy_users',
};

const ALLOWED_ENTITIES = new Set([
  'Order','EtsyConnection','MileageLog','ScheduleEvent','Business','SyncState',
  'Tmp','ArtPiece','TmpNoop','EmailImportMessage','Expense','InventoryCost','User'
]);

function secureEqual(a = '', b = '') {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function cleanRecord(entity, record) {
  const copy = structuredClone(record || {});
  if (entity === 'EtsyConnection') {
    delete copy.access_token;
    delete copy.refresh_token;
    delete copy.oauth_state;
    delete copy.pkce_verifier;
  }
  return copy;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

function readBundledExport(token) {
  const packed = fs.readFileSync(new URL('./_base44-export.enc', import.meta.url));
  if (packed.length < 29) throw new Error('Encrypted migration bundle is invalid');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const key = crypto.createHash('sha256').update(token).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

async function bulkUpsert(client, table, columns, rows) {
  if (!rows.length) return;
  const values = [];
  const groups = rows.map((row, i) => {
    const offset = i * columns.length;
    for (const col of columns) values.push(row[col] ?? null);
    return `(${columns.map((_, j) => `$${offset + j + 1}`).join(',')})`;
  });
  const updates = columns.filter(c => c !== 'base44_id').map(c => `${c}=EXCLUDED.${c}`).join(',');
  await client.query(
    `INSERT INTO artflow.${table} (${columns.join(',')}) VALUES ${groups.join(',')} ON CONFLICT (base44_id) DO UPDATE SET ${updates}`,
    values
  );
}

async function initSchema(client, body) {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS artflow;

      CREATE TABLE IF NOT EXISTS artflow.migration_runs (
        migration_id text PRIMARY KEY,
        source_sha256 text,
        expected_total integer,
        status text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        counts jsonb
      );

      CREATE TABLE IF NOT EXISTS artflow.base44_archive (
        entity_name text NOT NULL,
        base44_id text NOT NULL,
        data jsonb NOT NULL,
        migrated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (entity_name, base44_id)
      );

      CREATE TABLE IF NOT EXISTS artflow.orders (
        base44_id text PRIMARY KEY,
        business_id text,
        sale_date text,
        platform text,
        archived boolean NOT NULL DEFAULT false,
        order_id text,
        source_email_id text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.expenses (
        base44_id text PRIMARY KEY,
        business_id text,
        expense_date text,
        category text,
        amount numeric,
        archived boolean NOT NULL DEFAULT false,
        source text,
        receipt_id text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.businesses (
        base44_id text PRIMARY KEY,
        name text,
        primary_email text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.sync_states (
        base44_id text PRIMARY KEY,
        business_id text,
        source text,
        status text,
        last_synced_at text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.email_import_messages (
        base44_id text PRIMARY KEY,
        business_id text,
        message_id text,
        import_type text,
        status text,
        platform text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.etsy_connections (
        base44_id text PRIMARY KEY,
        business_id text,
        etsy_user_id text,
        shop_id text,
        shop_name text,
        status text,
        expires_at text,
        scopes text,
        redirect_uri text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.mileage_logs (
        base44_id text PRIMARY KEY,
        log_date text,
        destination text,
        purpose text,
        miles numeric,
        rate numeric,
        deduction numeric,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.schedule_events (
        base44_id text PRIMARY KEY,
        title text,
        event_date text,
        event_time text,
        type text,
        google_event_id text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.art_pieces (
        base44_id text PRIMARY KEY,
        title text,
        medium text,
        size text,
        price numeric,
        status text,
        sale_price numeric,
        sale_date text,
        buyer text,
        platform text,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.inventory_costs (
        base44_id text PRIMARY KEY,
        business_id text,
        name text,
        category text,
        size text,
        base_item_cost numeric,
        paper_ink_cost numeric,
        packaging_cost numeric,
        total_unit_cost numeric,
        quantity_on_hand numeric,
        low_stock_level numeric,
        created_by_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artflow.legacy_users (
        base44_id text PRIMARY KEY,
        email text,
        full_name text,
        role text,
        active_business_id text,
        disabled boolean NOT NULL DEFAULT false,
        auth_user_id text,
        created_date timestamptz,
        updated_date timestamptz,
        data jsonb NOT NULL
      );

      CREATE INDEX IF NOT EXISTS artflow_orders_business_idx ON artflow.orders (business_id);
      CREATE INDEX IF NOT EXISTS artflow_orders_sale_date_idx ON artflow.orders (sale_date DESC);
      CREATE INDEX IF NOT EXISTS artflow_orders_source_email_idx ON artflow.orders (source_email_id);
      CREATE INDEX IF NOT EXISTS artflow_expenses_business_idx ON artflow.expenses (business_id);
      CREATE INDEX IF NOT EXISTS artflow_expenses_date_idx ON artflow.expenses (expense_date DESC);
      CREATE INDEX IF NOT EXISTS artflow_email_import_message_idx ON artflow.email_import_messages (message_id);
      CREATE INDEX IF NOT EXISTS artflow_legacy_users_email_idx ON artflow.legacy_users (lower(email));
    `);

    await client.query(
      `INSERT INTO artflow.migration_runs (migration_id, source_sha256, expected_total, status)
       VALUES ($1,$2,$3,'running')
       ON CONFLICT (migration_id) DO UPDATE SET source_sha256=EXCLUDED.source_sha256, expected_total=EXCLUDED.expected_total, status='running', completed_at=NULL`,
      [body.migrationId, body.sha256, body.total]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function loadEntity(client, entity, records) {
  const clean = records.map(r => cleanRecord(entity, r));
  await client.query('BEGIN');
  try {
    const archiveRows = clean.map(r => ({
      entity_name: entity,
      base44_id: String(r.id),
      data: JSON.stringify(r),
    }));
    if (archiveRows.length) {
      const cols = ['entity_name','base44_id','data'];
      const vals = [];
      const groups = archiveRows.map((row, i) => {
        const off = i * 3;
        vals.push(row.entity_name, row.base44_id, row.data);
        return `($${off+1},$${off+2},$${off+3}::jsonb)`;
      });
      await client.query(
        `INSERT INTO artflow.base44_archive (${cols.join(',')}) VALUES ${groups.join(',')} ON CONFLICT (entity_name,base44_id) DO UPDATE SET data=EXCLUDED.data, migrated_at=now()`,
        vals
      );
    }

    if (entity === 'Order') {
      await bulkUpsert(client, 'orders', ['base44_id','business_id','sale_date','platform','archived','order_id','source_email_id','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, sale_date:r.sale_date, platform:r.platform, archived:bool(r.archived), order_id:r.order_id, source_email_id:r.source_email_id, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'Expense') {
      await bulkUpsert(client, 'expenses', ['base44_id','business_id','expense_date','category','amount','archived','source','receipt_id','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, expense_date:r.date, category:r.category, amount:num(r.amount), archived:bool(r.archived), source:r.source, receipt_id:r.receipt_id, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'Business') {
      await bulkUpsert(client, 'businesses', ['base44_id','name','primary_email','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), name:r.name, primary_email:r.primary_email, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'SyncState') {
      await bulkUpsert(client, 'sync_states', ['base44_id','business_id','source','status','last_synced_at','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, source:r.source, status:r.status, last_synced_at:r.last_synced_at, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'EmailImportMessage') {
      await bulkUpsert(client, 'email_import_messages', ['base44_id','business_id','message_id','import_type','status','platform','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, message_id:r.message_id, import_type:r.import_type, status:r.status, platform:r.platform, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'EtsyConnection') {
      await bulkUpsert(client, 'etsy_connections', ['base44_id','business_id','etsy_user_id','shop_id','shop_name','status','expires_at','scopes','redirect_uri','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, etsy_user_id:r.etsy_user_id, shop_id:r.shop_id, shop_name:r.shop_name, status:r.status, expires_at:r.expires_at, scopes:r.scopes, redirect_uri:r.redirect_uri, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'MileageLog') {
      await bulkUpsert(client, 'mileage_logs', ['base44_id','log_date','destination','purpose','miles','rate','deduction','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), log_date:r.date, destination:r.destination, purpose:r.purpose, miles:num(r.miles), rate:num(r.rate), deduction:num(r.deduction), created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'ScheduleEvent') {
      await bulkUpsert(client, 'schedule_events', ['base44_id','title','event_date','event_time','type','google_event_id','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), title:r.title, event_date:r.date, event_time:r.time, type:r.type, google_event_id:r.google_event_id, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'ArtPiece') {
      await bulkUpsert(client, 'art_pieces', ['base44_id','title','medium','size','price','status','sale_price','sale_date','buyer','platform','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), title:r.title, medium:r.medium, size:r.size, price:num(r.price), status:r.status, sale_price:num(r.sale_price), sale_date:r.sale_date, buyer:r.buyer, platform:r.platform, created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'InventoryCost') {
      await bulkUpsert(client, 'inventory_costs', ['base44_id','business_id','name','category','size','base_item_cost','paper_ink_cost','packaging_cost','total_unit_cost','quantity_on_hand','low_stock_level','created_by_id','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), business_id:r.business_id, name:r.name, category:r.category, size:r.size, base_item_cost:num(r.base_item_cost), paper_ink_cost:num(r.paper_ink_cost), packaging_cost:num(r.packaging_cost), total_unit_cost:num(r.total_unit_cost), quantity_on_hand:num(r.quantity_on_hand), low_stock_level:num(r.low_stock_level), created_by_id:r.created_by_id, created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
    } else if (entity === 'User') {
      await bulkUpsert(client, 'legacy_users', ['base44_id','email','full_name','role','active_business_id','disabled','created_date','updated_date','data'], clean.map(r => ({
        base44_id:String(r.id), email:r.email, full_name:r.full_name, role:r.role, active_business_id:r.active_business_id, disabled:bool(r.disabled), created_date:r.created_date, updated_date:r.updated_date, data:JSON.stringify(r)
      })));
      try {
        await client.query(`UPDATE artflow.legacy_users lu SET auth_user_id = u.id FROM public."user" u WHERE lu.email IS NOT NULL AND u.email IS NOT NULL AND lower(lu.email)=lower(u.email)`);
      } catch {
        // Better Auth table may not exist yet on another branch; migration data is still valid.
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function verify(client, body) {
  const archive = await client.query(`SELECT entity_name, count(*)::int AS count FROM artflow.base44_archive GROUP BY entity_name ORDER BY entity_name`);
  const typed = await client.query(`
    SELECT 'Order' entity_name, count(*)::int count FROM artflow.orders
    UNION ALL SELECT 'Expense', count(*)::int FROM artflow.expenses
    UNION ALL SELECT 'Business', count(*)::int FROM artflow.businesses
    UNION ALL SELECT 'SyncState', count(*)::int FROM artflow.sync_states
    UNION ALL SELECT 'EmailImportMessage', count(*)::int FROM artflow.email_import_messages
    UNION ALL SELECT 'EtsyConnection', count(*)::int FROM artflow.etsy_connections
    UNION ALL SELECT 'MileageLog', count(*)::int FROM artflow.mileage_logs
    UNION ALL SELECT 'ScheduleEvent', count(*)::int FROM artflow.schedule_events
    UNION ALL SELECT 'ArtPiece', count(*)::int FROM artflow.art_pieces
    UNION ALL SELECT 'InventoryCost', count(*)::int FROM artflow.inventory_costs
    UNION ALL SELECT 'User', count(*)::int FROM artflow.legacy_users
    ORDER BY entity_name
  `);
  const totalResult = await client.query(`SELECT count(*)::int AS count FROM artflow.base44_archive`);
  const authMapped = await client.query(`SELECT count(*)::int AS count FROM artflow.legacy_users WHERE auth_user_id IS NOT NULL`);
  const counts = Object.fromEntries(archive.rows.map(r => [r.entity_name, r.count]));
  const total = totalResult.rows[0]?.count || 0;
  const expected = Number(body.total || 0);
  const status = expected && total === expected ? 'complete' : 'needs_review';
  if (body.migrationId) {
    await client.query(`UPDATE artflow.migration_runs SET status=$2, completed_at=CASE WHEN $2='complete' THEN now() ELSE completed_at END, counts=$3::jsonb WHERE migration_id=$1`, [body.migrationId, status, JSON.stringify(counts)]);
  }
  return { status, total, expected, counts, typed: Object.fromEntries(typed.rows.map(r => [r.entity_name, r.count])), authMapped: authMapped.rows[0]?.count || 0 };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const expectedToken = process.env.MIGRATION_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expectedToken || !secureEqual(supplied, expectedToken)) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const body = await readJson(req);
    if (body.action === 'init') {
      await initSchema(client, body);
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'load') {
      if (!ALLOWED_ENTITIES.has(body.entity) || !Array.isArray(body.records)) return res.status(400).json({ error: 'Invalid batch' });
      await loadEntity(client, body.entity, body.records);
      return res.status(200).json({ ok: true, entity: body.entity, loaded: body.records.length });
    }
    if (body.action === 'load-bundled') {
      if (!ALLOWED_ENTITIES.has(body.entity)) return res.status(400).json({ error: 'Invalid entity' });
      const doc = readBundledExport(expectedToken);
      const all = doc.entities?.[body.entity] || [];
      const start = Math.max(0, Number(body.start || 0));
      const limit = Math.max(1, Math.min(1200, Number(body.limit || 900)));
      const selected = all.slice(start, start + limit);
      let loaded = 0;
      for (let i = 0; i < selected.length; i += 150) {
        const batch = selected.slice(i, i + 150);
        await loadEntity(client, body.entity, batch);
        loaded += batch.length;
      }
      return res.status(200).json({ ok: true, entity: body.entity, start, loaded, total: all.length, next: start + loaded < all.length ? start + loaded : null });
    }
    if (body.action === 'verify') {
      const result = await verify(client, body);
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('migration error', e?.message || e);
    return res.status(500).json({ error: 'Migration failed', detail: e?.message || 'Unknown error' });
  } finally {
    client.release();
  }
}
