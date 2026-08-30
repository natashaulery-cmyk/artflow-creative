import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  archiveProviderOrder,
  upsertOrderLines,
  verifyVinted,
  vintedRequest,
} from '../../shared/marketplaceWebhook.js';

const EVENT_CREATED = 'ORDER_CREATED';
const EVENT_CANCELLED = 'ORDER_CANCELLED';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const url = new URL(req.url);
  const callbackKey = String(url.searchParams.get('key') || '').trim();
  if (!callbackKey) return Response.json({ error: 'Missing callback key' }, { status: 401 });

  const connections = await base44.asServiceRole.entities.MarketplaceWebhook.list('-updated_date', 500);
  const connection = connections.find((row) =>
    row.provider === 'Vinted' && row.callback_key === callbackKey && row.status === 'active'
  );
  if (!connection?.signing_secret) {
    return Response.json({ error: 'Unknown webhook' }, { status: 401 });
  }

  const raw = await req.text();
  const signature = req.headers.get('X-Vpi-Webhook-Hmac-Sha256') || '';
  const verified = await verifyVinted(raw, signature, connection.signing_secret);
  if (!verified) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  let payload;
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const eventType = String(payload?.event_type || '').toUpperCase();
  const eventData = payload?.event_data || {};
  const orderId = String(eventData?.order_id || '').trim();

  try {
    let result = { created: 0, updated: 0, archived: 0 };

    if (eventType === EVENT_CREATED && orderId) {
      const order = await vintedRequest(`/api/v1/orders/${encodeURIComponent(orderId)}`);
      const saleDate = String(order?.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const buyer = order?.delivery_address?.name || order?.billing_address?.name || '';
      const items = Array.isArray(order?.items) ? order.items : [];
      const lines = items.map((item, index) => ({
        lineId: item?.id || item?.item_reference || index,
        title: String(item?.title || 'Vinted sale'),
        quantity: 1,
        total: item?.price,
      }));
      const saved = await upsertOrderLines(base44, connection, 'Vinted', orderId, saleDate, buyer, lines, 'vinted_webhook');
      result = { ...result, ...saved };
    } else if (eventType === EVENT_CANCELLED && orderId) {
      result.archived = await archiveProviderOrder(base44, connection, 'Vinted', orderId, 'vinted_webhook_cancelled');
    }

    await base44.asServiceRole.entities.MarketplaceWebhook.update(connection.id, {
      last_event_at: new Date().toISOString(),
      last_error: '',
    });

    return Response.json({ ok: true, event_type: eventType, order_id: orderId || null, ...result });
  } catch (error) {
    try {
      await base44.asServiceRole.entities.MarketplaceWebhook.update(connection.id, {
        last_event_at: new Date().toISOString(),
        last_error: String(error?.message || error || 'Webhook processing failed').slice(0, 1000),
      });
    } catch {}
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
