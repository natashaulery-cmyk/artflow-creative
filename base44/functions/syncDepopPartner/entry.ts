import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const HOST = 'https://partnerapi.depop.com';
const START_DATE = '2026-01-01';
const PAGE_LIMIT = 200;

const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

const normalize = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

async function saveState(base44, ownerId, businessId, payload) {
  if (!ownerId || !businessId) return;
  try {
    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200);
    const existing = states.find((s) => s.business_id === businessId && s.source === 'depop_api');
    const next = {
      business_id: businessId,
      source: 'depop_api',
      last_synced_at: new Date().toISOString(),
      last_found: Number(payload.found || 0),
      last_processed: Number(payload.processed || 0),
      last_created: Number(payload.created || 0),
      last_remaining: Number(payload.remaining || 0),
      status: payload.status || 'ok',
      message: payload.message || '',
      cursor: payload.cursor == null ? (existing?.cursor || '') : String(payload.cursor || ''),
    };
    if (existing) await base44.asServiceRole.entities.SyncState.update(existing.id, next);
    else await base44.asServiceRole.entities.SyncState.create({ ...next, created_by_id: ownerId });
  } catch {}
}

function getApiKey() {
  return String(Deno.env.get('DEPOP_PARTNER_API_KEY') || '').trim();
}

async function depopGet(path, apiKey) {
  const res = await fetch(`${HOST}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Depop API ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

function extractOrders(payload) {
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function nextCursor(payload) {
  return payload?.meta?.cursor || payload?.meta?.next_cursor || payload?.next_cursor || payload?.cursor || '';
}

function likelySameDepopSale(existing, candidate) {
  if (existing.archived || existing.platform !== 'Depop') return false;
  if (candidate.order_id && String(existing.order_id || '') === String(candidate.order_id)) return true;
  if ((existing.sale_date || '') !== candidate.sale_date) return false;
  if (Number(existing.sale_total || 0).toFixed(2) !== Number(candidate.sale_total || 0).toFixed(2)) return false;
  const a = normalize(existing.product_name);
  const b = normalize(candidate.product_name);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({
      available: false,
      needs_setup: true,
      created: 0,
      updated: 0,
      remaining: 0,
      more_possible: false,
      message: 'Depop Partner API is ready but no API key is configured yet.',
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
    const prior = states.find((s) => s.business_id === businessId && s.source === 'depop_api');
    const priorCursor = String(prior?.cursor || '');

    await saveState(base44, ownerId, businessId, {
      status: 'running',
      cursor: priorCursor,
      message: 'Syncing directly from Depop…',
    });

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), from: START_DATE });
    if (priorCursor) params.set('cursor', priorCursor);
    const payload = await depopGet(`/api/v1/orders/?${params.toString()}`, apiKey);
    const orders = extractOrders(payload);

    const [allOrders, allInventory] = await Promise.all([
      base44.asServiceRole.entities.Order.list('-sale_date', 5000),
      base44.asServiceRole.entities.InventoryCost.list('size', 500),
    ]);

    const targetOrders = allOrders.filter((o) => o.business_id === businessId || (!o.business_id && o.created_by_id === ownerId));
    const inventoryCosts = allInventory.filter((i) => i.business_id === businessId || (!i.business_id && i.created_by_id === ownerId));

    let created = 0;
    let updated = 0;

    for (const order of orders) {
      const purchaseId = String(order.purchase_id || order.id || order.order_id || '');
      const saleDate = String(order.created_at || order.date || '').slice(0, 10);
      if (!saleDate || saleDate < START_DATE) continue;

      // Depop keeps refunded orders in the Orders API. Exclude fully refunded
      // purchases from live sales totals during every reconciliation pass so a
      // missed webhook cannot leave a refunded sale counted forever.
      if (String(order.status || '').toUpperCase() === 'REFUNDED') {
        for (const existing of targetOrders.filter((o) => o.platform === 'Depop' && String(o.order_id || '') === purchaseId && !o.archived)) {
          await base44.asServiceRole.entities.Order.update(existing.id, { archived: true, sync_source: 'depop_api_refunded' });
          existing.archived = true;
          updated++;
        }
        continue;
      }

      const rawItems = Array.isArray(order.line_items) ? order.line_items : Array.isArray(order.items) ? order.items : Array.isArray(order.products) ? order.products : [];
      const fallbackTitle = String(order.description || order.product_name || 'Depop sale');
      const fallbackPrice = money(order.sold_price || order.subtotal || order.total || order.amount);
      const items = rawItems.length ? rawItems : [{ description: fallbackTitle, sold_price: fallbackPrice }];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const title = String(item.description || item.title || item.name || fallbackTitle || 'Depop sale').trim();
        const price = money(item.sold_price || item.price || item.original_price || fallbackPrice);
        if (!(price > 0)) continue;

        const candidate = { order_id: purchaseId, sale_date: saleDate, sale_total: price, product_name: title };
        const sourceId = `depop-api:${purchaseId}:${item.id || item.product_id || index}`;
        let existing = targetOrders.find((o) => o.source_email_id === sourceId);
        if (!existing) existing = targetOrders.find((o) => likelySameDepopSale(o, candidate));

        const size = inferSize(title);
        const inv = inventoryCosts.find((entry) => entry.size === size);
        const costs = calculateOrderCosts({ quantity: 1, size, unit_price: price }, inv);
        const buyer = order.buyer?.username || order.buyer?.name || order.shipping_address?.name || order.address?.name || '';

        const data = {
          business_id: businessId,
          access_emails: accessEmails,
          platform: 'Depop',
          order_id: purchaseId || null,
          source_email_id: sourceId,
          sync_source: 'depop_api',
          sale_date: saleDate,
          product_name: title,
          quantity: 1,
          size,
          unit_price: price,
          sale_total: price,
          buyer: buyer || null,
          archived: false,
          ...costs,
        };

        if (existing) {
          await base44.asServiceRole.entities.Order.update(existing.id, data);
          Object.assign(existing, data);
          updated++;
        } else {
          const createdOrder = await base44.asServiceRole.entities.Order.create({ ...data, created_by_id: ownerId });
          targetOrders.push(createdOrder);
          created++;
        }
      }
    }

    const cursor = nextCursor(payload);
    const morePossible = !!cursor && cursor !== priorCursor;
    const message = morePossible
      ? `Depop synced ${created} new and ${updated} updated order lines. Backfill continuing automatically.`
      : `Depop synced ${created} new and ${updated} updated order lines. Everything is up to date.`;

    await saveState(base44, ownerId, businessId, {
      status: 'ok',
      cursor,
      found: orders.length,
      processed: orders.length,
      created,
      remaining: morePossible ? 1 : 0,
      message,
    });

    return Response.json({
      available: true,
      created,
      updated,
      remaining: morePossible ? 1 : 0,
      more_possible: morePossible,
      cursor: cursor || null,
      message,
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const hint = status === 401 || status === 403
      ? 'Depop rejected the API key or this shop/app has not been granted Partner API access.'
      : String(error?.message || 'Depop Partner API sync failed');
    if (workspace?.ownerId && workspace?.businessId) {
      await saveState(base44, workspace.ownerId, workspace.businessId, { status: 'error', message: hint });
    }
    return Response.json({ available: true, error: hint, created: 0, updated: 0, remaining: 0, more_possible: false }, { status: 502 });
  }
}
