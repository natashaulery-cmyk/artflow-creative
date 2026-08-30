import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const HOST = 'https://pro.svc.vinted.com';
const START_DATE = '2026-01-01';
const MAX_ORDERS_PER_RUN = 100;
const CONCURRENCY = 10;

const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

const normalize = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const cents = (value) => Number(value || 0).toFixed(2);

function getCredentials() {
  const combined = String(Deno.env.get('VINTED_PRO_ACCESS_TOKEN') || '').trim();
  if (combined.includes(',')) {
    const comma = combined.indexOf(',');
    return {
      accessKey: combined.slice(0, comma).trim(),
      signingKey: combined.slice(comma + 1).trim(),
    };
  }
  return {
    accessKey: String(Deno.env.get('VINTED_PRO_ACCESS_KEY') || '').trim(),
    signingKey: String(Deno.env.get('VINTED_PRO_SIGNING_KEY') || '').trim(),
  };
}

async function hmacHex(signingKey, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vintedRequest(path, credentials) {
  const method = 'GET';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = '';
  const payload = `${timestamp}.${method}.${path}.${credentials.accessKey}.${body}`;
  const signature = await hmacHex(credentials.signingKey, payload);
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Vpi-Access-Key': credentials.accessKey,
      'X-Vpi-Hmac-Sha256': `t=${timestamp},v1=${signature}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Vinted API ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

async function saveState(base44, ownerId, businessId, payload) {
  if (!ownerId || !businessId) return;
  try {
    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200);
    const existing = states.find((s) => s.business_id === businessId && s.source === 'vinted_api');
    const next = {
      business_id: businessId,
      source: 'vinted_api',
      last_synced_at: new Date().toISOString(),
      last_found: Number(payload.found || 0),
      last_processed: Number(payload.processed || 0),
      last_created: Number(payload.created || 0),
      last_remaining: Number(payload.remaining || 0),
      status: payload.status || 'ok',
      message: payload.message || '',
      cursor: payload.cursor == null ? (existing?.cursor || '') : String(payload.cursor),
    };
    if (existing) await base44.asServiceRole.entities.SyncState.update(existing.id, next);
    else await base44.asServiceRole.entities.SyncState.create({ ...next, created_by_id: ownerId });
  } catch {}
}

function likelySameSale(existing, candidate) {
  if (existing.archived || existing.platform !== 'Vinted') return false;
  if (String(existing.order_id || '') === String(candidate.order_id || '') && candidate.order_id) return true;
  if ((existing.sale_date || '') !== (candidate.sale_date || '')) return false;
  if (cents(existing.sale_total) !== cents(candidate.sale_total)) return false;
  const a = normalize(existing.product_name);
  const b = normalize(candidate.product_name);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => run()));
  return results;
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const credentials = getCredentials();
  if (!credentials.accessKey || !credentials.signingKey) {
    return Response.json({
      available: false,
      needs_setup: true,
      created: 0,
      updated: 0,
      remaining: 0,
      message: 'Vinted Pro API is ready but no production token is configured yet.',
    });
  }

  let workspace;
  try {
    let emailHint = '';
    try { emailHint = (await base44.auth.me())?.email || ''; } catch {}
    workspace = await resolveBusinessWorkspace(base44, emailHint);
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) throw new Error('No business workspace found');

    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200);
    const prior = states.find((s) => s.business_id === businessId && s.source === 'vinted_api');
    const priorCursor = Number(prior?.cursor || 0);
    const path = priorCursor > 0 ? `/api/v1/orders?after-id=${encodeURIComponent(String(priorCursor))}` : '/api/v1/orders';

    await saveState(base44, ownerId, businessId, {
      status: 'running',
      cursor: priorCursor || '',
      message: 'Syncing directly from Vinted Pro…',
    });

    const listPayload = await vintedRequest(path, credentials);
    const listed = Array.isArray(listPayload?.orders) ? listPayload.orders : [];
    const candidates = listed
      .filter((o) => Number(o?.id) > priorCursor)
      .sort((a, b) => Number(a.id) - Number(b.id));

    const batch = candidates.slice(0, MAX_ORDERS_PER_RUN);
    if (!batch.length) {
      await saveState(base44, ownerId, businessId, {
        status: 'ok', cursor: priorCursor || '', found: listed.length, processed: 0, created: 0, remaining: 0,
        message: 'Vinted Pro is up to date.',
      });
      return Response.json({ available: true, created: 0, updated: 0, remaining: 0, more_possible: false, cursor: priorCursor || null, message: 'Vinted Pro is up to date.' });
    }

    const [details, allOrders, allInventory] = await Promise.all([
      mapLimit(batch, CONCURRENCY, (order) => vintedRequest(`/api/v1/orders/${order.id}`, credentials)),
      base44.asServiceRole.entities.Order.list('-sale_date', 5000),
      base44.asServiceRole.entities.InventoryCost.list('size', 500),
    ]);

    const targetOrders = allOrders.filter((o) =>
      o.business_id === businessId || (!o.business_id && o.created_by_id === ownerId)
    );
    const inventoryCosts = allInventory.filter((item) =>
      item.business_id === businessId || (!item.business_id && item.created_by_id === ownerId)
    );

    let created = 0;
    let updated = 0;
    let canceled = 0;
    let errors = 0;
    let maxProcessedId = priorCursor;

    for (let i = 0; i < batch.length; i += 1) {
      const summary = batch[i];
      const result = details[i];
      if (result?.error) {
        errors++;
        continue;
      }
      const order = result;
      const orderId = String(order.id ?? summary.id ?? '');
      maxProcessedId = Math.max(maxProcessedId, Number(summary.id || order.id || 0));
      const saleDate = String(order.created_at || summary.created_at || '').slice(0, 10);
      if (!saleDate || saleDate < START_DATE) continue;

      const isCanceled = String(order.status || summary.status || '').toUpperCase() === 'CANCELED';
      if (isCanceled) {
        for (const existing of targetOrders.filter((o) => o.platform === 'Vinted' && String(o.order_id || '') === orderId && !o.archived)) {
          await base44.asServiceRole.entities.Order.update(existing.id, { archived: true, sync_source: 'vinted_api_cancelled' });
          existing.archived = true;
          updated++;
        }
        canceled++;
        continue;
      }

      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const price = Number(item?.price || 0);
        const title = String(item?.title || 'Vinted sale').trim() || 'Vinted sale';
        if (!(price > 0)) continue;

        const candidate = {
          platform: 'Vinted',
          order_id: orderId,
          product_name: title,
          sale_date: saleDate,
          sale_total: price,
        };
        const exactSourceId = `vinted-api:${orderId}:${item?.id || normalize(title)}`;
        let existing = targetOrders.find((o) => o.source_email_id === exactSourceId);
        if (!existing) existing = targetOrders.find((o) => likelySameSale(o, candidate));

        const size = inferSize(title);
        const inv = inventoryCosts.find((entry) => entry.size === size);
        const costs = calculateOrderCosts({ quantity: 1, size, unit_price: price }, inv);
        const buyer = order.delivery_address?.name || order.billing_address?.name || '';
        const sourceUrl = String(item?.url || item?.item_url || item?.listing_url || '').trim() || null;

        if (existing) {
          const patch = {
            business_id: businessId,
            access_emails: accessEmails,
            order_id: orderId,
            source_email_id: exactSourceId,
            sync_source: 'vinted_api',
            platform: 'Vinted',
            sale_date: saleDate,
            product_name: title,
            quantity: 1,
            size,
            unit_price: price,
            sale_total: price,
            buyer: buyer || existing.buyer || null,
            source_url: sourceUrl || existing.source_url || null,
            archived: false,
            ...costs,
          };
          await base44.asServiceRole.entities.Order.update(existing.id, patch);
          Object.assign(existing, patch);
          updated++;
          continue;
        }

        const createdOrder = await base44.asServiceRole.entities.Order.create({
          business_id: businessId,
          access_emails: accessEmails,
          platform: 'Vinted',
          order_id: orderId,
          source_email_id: exactSourceId,
          sync_source: 'vinted_api',
          sale_date: saleDate,
          product_name: title,
          quantity: 1,
          size,
          unit_price: price,
          sale_total: price,
          buyer: buyer || null,
          source_url: sourceUrl,
          archived: false,
          created_by_id: ownerId,
          ...costs,
        });
        targetOrders.push(createdOrder);
        created++;
      }
    }

    const remaining = Math.max(0, candidates.length - batch.length);
    const morePossible = remaining > 0 || batch.length === MAX_ORDERS_PER_RUN;
    const message = errors
      ? `Vinted Pro synced ${created} new and ${updated} updated order lines; ${errors} order detail request${errors === 1 ? '' : 's'} will retry.`
      : remaining > 0
        ? `Vinted Pro synced ${created} new and ${updated} updated order lines. Backfill continuing automatically (${remaining}+ orders left in this page).`
        : `Vinted Pro synced ${created} new and ${updated} updated order lines.${canceled ? ` ${canceled} canceled order${canceled === 1 ? '' : 's'} excluded.` : ''}`;

    // Do not advance beyond failed details; retry from the last contiguous successful
    // summary next run so an isolated API failure cannot create a permanent gap.
    let safeCursor = priorCursor;
    for (let i = 0; i < batch.length; i += 1) {
      if (details[i]?.error) break;
      safeCursor = Math.max(safeCursor, Number(batch[i].id || 0));
    }

    await saveState(base44, ownerId, businessId, {
      status: errors ? 'error' : 'ok',
      cursor: safeCursor || '',
      found: listed.length,
      processed: batch.length - errors,
      created,
      remaining,
      message,
    });

    return Response.json({
      available: true,
      created,
      updated,
      canceled,
      errors,
      remaining,
      more_possible: morePossible,
      cursor: safeCursor || null,
      message,
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const hint = status === 401 || status === 403
      ? 'Vinted rejected the production credentials or this Pro account is not allowlisted for Integrations.'
      : String(error?.message || 'Vinted Pro sync failed');
    if (workspace?.ownerId && workspace?.businessId) {
      await saveState(base44, workspace.ownerId, workspace.businessId, { status: 'error', message: hint });
    }
    return Response.json({ available: true, error: hint, created: 0, updated: 0, remaining: 0, more_possible: false }, { status: 502 });
  }
}
