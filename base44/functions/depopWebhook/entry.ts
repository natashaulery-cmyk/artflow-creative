import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  archiveProviderOrder,
  depopRequest,
  upsertOrderLines,
  verifyDepop,
  money,
} from '../../shared/marketplaceWebhook.js';

const ORDER_EVENTS = new Set(['v1:order.new', 'v1:order.update', 'v1:order.refund']);

function refundItemAmount(order = {}) {
  return money(
    order?.refund_summary?.breakdown?.refunded_to_buyer?.item_refund_amount
    ?? order?.refund_summary?.buyer_refund_amount
    ?? 0
  );
}

function toLines(order = {}) {
  const items = Array.isArray(order?.line_items)
    ? order.line_items
    : Array.isArray(order?.items)
      ? order.items
      : [];
  const raw = items.map((item, index) => ({
    lineId: String(item?.purchase_item_id || item?.id || item?.product_id || item?.sku || index),
    title: String(item?.description || item?.title || item?.name || 'Depop sale').trim() || 'Depop sale',
    quantity: Math.max(1, Number(item?.quantity) || 1),
    total: money(item?.sold_price || item?.price || item?.original_price),
    source_url: String(item?.url || item?.listing_url || item?.product_url || '').trim(),
  })).filter((line) => Number(line.total) > 0);

  const originalTotal = raw.reduce((sum, line) => sum + Number(line.total || 0), 0);
  const refunded = Math.max(0, refundItemAmount(order));
  if (!(originalTotal > 0) || !(refunded > 0) || refunded >= originalTotal) return raw;
  const keepRatio = Math.max(0, (originalTotal - refunded) / originalTotal);
  return raw.map((line) => ({ ...line, total: +(Number(line.total || 0) * keepRatio).toFixed(2) }));
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const url = new URL(req.url);
  const callbackKey = String(url.searchParams.get('key') || '').trim();
  if (!callbackKey) return Response.json({ error: 'Missing callback key' }, { status: 401 });

  const hooks = await base44.asServiceRole.entities.MarketplaceWebhook.list('-updated_date', 500);
  const hook = hooks.find((row) => row.provider === 'Depop' && row.callback_key === callbackKey);
  if (!hook?.signing_secret) return Response.json({ error: 'Unknown webhook' }, { status: 401 });

  const raw = await req.text();
  const timestamp = req.headers.get('X-Depop-Timestamp') || '';
  const signature = req.headers.get('X-Depop-Signature') || '';
  const valid = await verifyDepop(raw, timestamp, signature, hook.signing_secret);
  if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const eventType = String(payload?.event_type || '').trim();
  const purchaseId = String(payload?.data?.purchase_id || '').trim();
  if (!ORDER_EVENTS.has(eventType)) return Response.json({ ok: true, ignored: true, event_type: eventType || null });
  if (!purchaseId) return Response.json({ error: 'Missing purchase_id' }, { status: 400 });

  try {
    const businesses = await base44.asServiceRole.entities.Business.list('name', 500);
    const business = businesses.find((b) => b.id === hook.business_id);
    const ownerId = hook.owner_id || business?.created_by_id || null;
    if (!ownerId) throw new Error('Webhook workspace owner is missing');

    const connection = {
      ...hook,
      owner_id: ownerId,
      access_emails: Array.from(new Set([
        ...(hook.access_emails || []),
        ...(business?.member_emails || []),
        ...(business?.sales_emails || []),
        ...(business?.expense_emails || []),
        business?.primary_email,
      ].filter(Boolean))),
    };

    const order = await depopRequest(`/api/v1/orders/${encodeURIComponent(purchaseId)}/`);
    const status = String(order?.status || payload?.data?.status || '').toUpperCase();
    let result = { created: 0, updated: 0, archived: 0 };
    const itemTotal = (Array.isArray(order?.line_items) ? order.line_items : [])
      .reduce((sum, item) => sum + money(item?.sold_price || item?.price || item?.original_price), 0);
    const refundedItems = refundItemAmount(order);
    const fullyRefunded = status === 'REFUNDED' && itemTotal > 0 && refundedItems >= itemTotal - 0.005;

    if (fullyRefunded) {
      result.archived = await archiveProviderOrder(base44, connection, 'Depop', purchaseId, 'depop_webhook_refunded');
    } else {
      const saleDate = String(order?.created_at || payload?.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const buyer = order?.buyer_address?.name || order?.buyer?.username || order?.buyer?.name || '';
      const lines = toLines(order);
      result = { ...result, ...(await upsertOrderLines(base44, connection, 'Depop', purchaseId, saleDate, buyer, lines, refundedItems > 0 ? 'depop_webhook_partial_refund' : 'depop_webhook')) };
    }

    await base44.asServiceRole.entities.MarketplaceWebhook.update(hook.id, {
      status: 'active',
      owner_id: ownerId,
      access_emails: connection.access_emails,
      event_types: Array.from(new Set([...(hook.event_types || []), eventType])),
      last_event_at: new Date().toISOString(),
      last_error: '',
    });

    return Response.json({ ok: true, event_type: eventType, purchase_id: purchaseId, ...result });
  } catch (error) {
    try {
      await base44.asServiceRole.entities.MarketplaceWebhook.update(hook.id, {
        status: 'error',
        last_event_at: new Date().toISOString(),
        last_error: String(error?.message || error || 'Depop webhook failed').slice(0, 1000),
      });
    } catch {}
    return Response.json({ error: String(error?.message || 'Depop webhook failed') }, { status: 500 });
  }
}
