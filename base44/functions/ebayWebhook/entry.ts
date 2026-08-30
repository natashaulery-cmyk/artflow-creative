import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { challengeResponse, ensureFreshEbayConnection, ebayJson, verifyEbayNotification } from '../../shared/ebay.js';
import { functionUrl, money, upsertOrderLines } from '../../shared/marketplaceWebhook.js';

const sourceUrl = (line = {}, fallbackListingId = '') => {
  const id = String(line?.legacyItemId || line?.listingId || fallbackListingId || '').trim();
  return /^\d+$/.test(id) ? `https://www.ebay.com/itm/${id}` : '';
};

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const url = new URL(req.url);
  const callbackKey = String(url.searchParams.get('key') || '').trim();
  if (!callbackKey) return Response.json({ error: 'Missing callback key' }, { status: 401 });

  const connections = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 200);
  let connection = connections.find((x) => x.callback_key === callbackKey);
  if (!connection) return Response.json({ error: 'Unknown webhook' }, { status: 404 });

  if (req.method === 'GET') {
    const challengeCode = String(url.searchParams.get('challenge_code') || '').trim();
    if (!challengeCode || !connection.verification_token) return Response.json({ error: 'Missing challenge' }, { status: 400 });
    const endpoint = functionUrl('ebayWebhook', callbackKey);
    return Response.json({ challengeResponse: challengeResponse(challengeCode, connection.verification_token, endpoint) });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const raw = await req.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const signature = req.headers.get('X-EBAY-SIGNATURE') || req.headers.get('x-ebay-signature') || '';
  let valid = false;
  try { valid = await verifyEbayNotification(payload, signature); } catch { valid = false; }
  if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  const topic = String(payload?.metadata?.topic || '').trim();
  if (topic !== 'ORDER_CONFIRMATION') return Response.json({ ok: true, ignored: true, topic: topic || null });

  const data = payload?.notification?.data || {};
  const notifiedOrder = data?.order || {};
  const orderId = String(notifiedOrder?.orderId || '').trim();
  if (!orderId) return Response.json({ error: 'Missing eBay order ID' }, { status: 400 });

  try {
    connection = await ensureFreshEbayConnection(base44, connection);
    const eventUserId = String(data?.user?.userId || '').trim();
    if (eventUserId && connection.ebay_user_id && eventUserId !== String(connection.ebay_user_id)) {
      return Response.json({ error: 'Notification user mismatch' }, { status: 403 });
    }

    const order = await ebayJson(`/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`, connection.access_token);
    const notificationLines = new Map(
      (Array.isArray(notifiedOrder?.orderLineItems) ? notifiedOrder.orderLineItems : [])
        .map((line) => [String(line?.orderLineItemId || line?.lineItemId || ''), String(line?.listingId || '')])
        .filter(([id]) => id)
    );
    const lines = (Array.isArray(order?.lineItems) ? order.lineItems : []).map((line, index) => {
      const quantity = Math.max(1, Number(line?.quantity) || 1);
      const lineId = String(line?.lineItemId || index);
      const total = money(line?.lineItemCost || line?.lineItemTotal || line?.total || 0);
      return {
        lineId,
        title: String(line?.title || line?.sku || 'eBay sale').trim() || 'eBay sale',
        quantity,
        total,
        source_url: sourceUrl(line, notificationLines.get(lineId) || ''),
      };
    }).filter((line) => Number(line.total) > 0);

    const saleDate = String(order?.creationDate || payload?.notification?.eventDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const buyer = order?.buyer?.username || '';
    const normalizedConnection = {
      business_id: connection.business_id,
      owner_id: connection.owner_id,
      access_emails: [],
    };
    const businesses = await base44.asServiceRole.entities.Business.list('name', 500);
    const business = businesses.find((b) => b.id === connection.business_id);
    normalizedConnection.access_emails = Array.from(new Set([
      ...(business?.member_emails || []),
      ...(business?.sales_emails || []),
      ...(business?.expense_emails || []),
      business?.primary_email,
    ].filter(Boolean)));

    const result = await upsertOrderLines(base44, normalizedConnection, 'eBay', orderId, saleDate, buyer, lines, 'ebay_webhook');
    await base44.asServiceRole.entities.EbayConnection.update(connection.id, { status: 'connected', last_error: '' });
    return Response.json({ ok: true, topic, order_id: orderId, ...result });
  } catch (error) {
    await base44.asServiceRole.entities.EbayConnection.update(connection.id, { status: 'error', last_error: String(error?.message || error).slice(0, 500) }).catch(() => {});
    return Response.json({ error: String(error?.message || 'eBay webhook processing failed') }, { status: 500 });
  }
}
