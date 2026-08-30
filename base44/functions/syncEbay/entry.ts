import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { ensureFreshEbayConnection, ebayJson, ebayConfigured } from '../../shared/ebay.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const START = '2026-01-01T00:00:00.000Z';
const PAGE_SIZE = 100;

const money = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return money(value?.value ?? value?.amount ?? value?.total ?? 0);
};
const norm = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const inferSize = (name = '') => {
  const m = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return m ? m[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};
const itemUrl = (line = {}) => {
  const id = String(line?.legacyItemId || line?.listingId || line?.itemId || '').trim();
  return id && /^[A-Za-z0-9|_-]+$/.test(id) ? `https://www.ebay.com/itm/${encodeURIComponent(id)}` : null;
};
const lineOriginalTotal = (line = {}) => {
  const quantity = Math.max(1, Number(line.quantity) || 1);
  const explicitTotal = money(line.total || line.lineItemTotal || line.netPrice);
  if (explicitTotal > 0) return explicitTotal;
  const cost = money(line.lineItemCost || line.unitPrice || line.price);
  if (!(cost > 0)) return 0;
  return line?.lineItemCost ? cost : cost * quantity;
};
const refundTotal = (line = {}) => (Array.isArray(line.refunds) ? line.refunds : []).reduce((sum, refund) => sum + money(refund?.amount), 0);

async function saveState(base44, ownerId, businessId, patch) {
  const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
  const existing = states.find((x) => x.business_id === businessId && x.source === 'ebay_api');
  const payload = {
    business_id: businessId,
    source: 'ebay_api',
    last_synced_at: new Date().toISOString(),
    last_found: Number(patch.found || 0),
    last_processed: Number(patch.processed || 0),
    last_created: Number(patch.created || 0),
    last_remaining: Number(patch.remaining || 0),
    status: patch.status || 'ok',
    message: patch.message || '',
    cursor: patch.cursor == null ? String(existing?.cursor || '0') : String(patch.cursor || '0'),
  };
  if (existing) await base44.asServiceRole.entities.SyncState.update(existing.id, payload);
  else await base44.asServiceRole.entities.SyncState.create({ ...payload, created_by_id: ownerId });
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  if (!ebayConfigured()) return Response.json({ available:false, needs_setup:true, more_possible:false, message:'eBay developer credentials are not configured yet.' });

  let email = '';
  try { email = (await base44.auth.me())?.email || ''; } catch {}
  const { ownerId, businessId, accessEmails = [] } = await resolveBusinessWorkspace(base44, email);
  if (!ownerId || !businessId) return Response.json({ error:'No business workspace found.' }, { status:400 });

  const connections = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 100);
  let connection = connections.find((x) => x.business_id === businessId && x.status === 'connected');
  if (!connection) return Response.json({ available:true, connected:false, more_possible:false, message:'Connect eBay in Account settings to sync eBay orders directly.' });

  try {
    connection = await ensureFreshEbayConnection(base44, connection);
    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
    const prior = states.find((x) => x.business_id === businessId && x.source === 'ebay_api');
    const offset = Math.max(0, Number(prior?.cursor || 0));
    const filter = `creationdate:[${START}..]`;
    const response = await ebayJson(`/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=${PAGE_SIZE}&offset=${offset}`, connection.access_token);
    const orders = Array.isArray(response?.orders) ? response.orders : [];

    const [allOrders, inventory] = await Promise.all([
      base44.asServiceRole.entities.Order.list('-sale_date', 5000),
      base44.asServiceRole.entities.InventoryCost.list('size', 500),
    ]);
    const target = allOrders.filter((o) => o.business_id === businessId || (!o.business_id && o.created_by_id === ownerId));
    const invs = inventory.filter((i) => i.business_id === businessId || (!i.business_id && i.created_by_id === ownerId));
    let created = 0, updated = 0, archived = 0;

    for (const order of orders) {
      const orderId = String(order?.orderId || '').trim();
      if (!orderId) continue;
      const saleDate = String(order?.creationDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const canceled = ['CANCELED','CANCELLED'].includes(String(order?.cancelStatus?.cancelState || order?.orderPaymentStatus || '').toUpperCase());
      if (canceled) {
        for (const existing of target.filter((o) => o.platform === 'eBay' && String(o.order_id || '') === orderId && !o.archived)) {
          await base44.asServiceRole.entities.Order.update(existing.id, { archived:true, sync_source:'ebay_api_cancelled' });
          existing.archived = true; archived++;
        }
        continue;
      }

      const lines = Array.isArray(order?.lineItems) ? order.lineItems : [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || {};
        const quantity = Math.max(1, Number(line.quantity) || 1);
        const originalTotal = lineOriginalTotal(line);
        const refunded = Math.max(0, refundTotal(line));
        const total = Math.max(0, originalTotal - refunded);
        const lineId = String(line?.lineItemId || index);
        const sourceId = `ebay-api:${orderId}:${lineId}`;
        const title = String(line?.title || line?.sku || 'eBay sale').trim() || 'eBay sale';
        let existing = target.find((o) => o.source_email_id === sourceId);
        if (!existing) existing = target.find((o) => o.platform === 'eBay' && String(o.order_id || '') === orderId && norm(o.product_name) === norm(title));

        if (!(total > 0)) {
          if (existing && !existing.archived) {
            await base44.asServiceRole.entities.Order.update(existing.id, { archived:true, sync_source:'ebay_api_refunded' });
            existing.archived = true; archived++;
          }
          continue;
        }

        const size = inferSize(title);
        const inv = invs.find((i) => i.size === size);
        const unitPrice = total / quantity;
        const costs = calculateOrderCosts({ quantity, size, unit_price: unitPrice }, inv);
        const buyer = order?.buyer?.username || order?.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || '';
        const payload = {
          business_id: businessId,
          access_emails: accessEmails,
          platform: 'eBay',
          order_id: orderId,
          source_email_id: sourceId,
          source_url: itemUrl(line) || existing?.source_url || null,
          sync_source: refunded > 0 ? 'ebay_api_refund_adjusted' : 'ebay_api',
          sale_date: saleDate,
          product_name: title,
          quantity,
          size,
          unit_price: unitPrice,
          sale_total: total,
          buyer: buyer || null,
          archived: false,
          ...costs,
        };
        if (existing) {
          await base44.asServiceRole.entities.Order.update(existing.id, payload);
          Object.assign(existing, payload); updated++;
        } else {
          const made = await base44.asServiceRole.entities.Order.create({ ...payload, created_by_id: ownerId });
          target.push(made); created++;
        }
      }
    }

    const totalFound = Number(response?.total || orders.length);
    const nextOffset = offset + orders.length;
    const more = orders.length === PAGE_SIZE && nextOffset < totalFound;
    const message = more
      ? `eBay synced ${created} new and ${updated} updated order lines. Backfill continuing.`
      : `eBay synced ${created} new and ${updated} updated order lines.${archived ? ` ${archived} canceled/refunded line${archived === 1 ? '' : 's'} excluded.` : ''}`;
    await saveState(base44, ownerId, businessId, { status:'ok', found:totalFound, processed:orders.length, created, remaining:more ? 1 : 0, cursor:more ? nextOffset : 0, message });
    return Response.json({ available:true, connected:true, created, updated, archived, more_possible:more, remaining:more ? 1 : 0, message });
  } catch (error) {
    const message = String(error?.message || 'eBay sync failed');
    await saveState(base44, ownerId, businessId, { status:'error', message }).catch(() => {});
    return Response.json({ available:true, error:message, more_possible:false }, { status:502 });
  }
}
