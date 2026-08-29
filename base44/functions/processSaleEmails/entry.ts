import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';

const decode = (value = '') => {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

const textFromPayload = (payload) => {
  if (payload?.mimeType === 'text/plain' && payload?.body?.data) return decode(payload.body.data);
  for (const part of payload?.parts || []) {
    const text = textFromPayload(part);
    if (text) return text;
  }
  if (payload?.body?.data) return decode(payload.body.data);
  return '';
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };
    const query = 'newer_than:120d (from:vinted.com OR from:depop.com OR from:etsy.com OR from:poshmark.com OR from:ebay.com) (sold OR sale OR order)';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers }
    );
    if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
    const messageIds = ((await listRes.json()).messages || []).map((m) => m.id);

    const [inventoryCosts, existingOrders] = await Promise.all([
      base44.entities.InventoryCost.list('size', 100),
      base44.entities.Order.list('-created_date', 5000),
    ]);
    const seenEmailIds = new Set(existingOrders.map((o) => o.source_email_id).filter(Boolean));
    const seenOrderKeys = new Set(
      existingOrders.map((o) => `${o.platform}|${o.order_id || ''}|${o.product_name}|${o.sale_date}`)
    );

    let created = 0;
    let skipped = 0;

    for (const messageId of messageIds) {
      if (seenEmailIds.has(messageId)) {
        skipped++;
        continue;
      }

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers }
      );
      if (!msgRes.ok) {
        skipped++;
        continue;
      }
      const msg = await msgRes.json();
      const emailHeaders = msg.payload?.headers || [];
      const sender = emailHeaders.find((h) => h.name.toLowerCase() === 'from')?.value || '';
      const subject = emailHeaders.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
      const body = textFromPayload(msg.payload) || msg.snippet || '';

      const prompt =
        'Extract one completed seller sale from this Vinted, Depop, Etsy, Poshmark, or eBay email. Ignore offers, likes, messages, listing notices, shipping-only notices, cancellations, refunds, payouts, fees, and purchases made by the inbox owner. ' +
        'Set is_sale=false unless the inbox owner sold an item and the sale price is clearly present. Never invent a price.\n' +
        `Sender: ${sender}\nSubject: ${subject}\nBody: ${body.slice(0, 16000)}\n` +
        'Return JSON with is_sale, platform (Vinted, Depop, Etsy, Poshmark, or eBay), order_id, product_name, quantity, size, unit_price, buyer, and sale_date (YYYY-MM-DD).';

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            is_sale: { type: 'boolean' },
            platform: { type: 'string' },
            order_id: { type: 'string' },
            product_name: { type: 'string' },
            quantity: { type: 'number' },
            size: { type: 'string' },
            unit_price: { type: 'number' },
            buyer: { type: 'string' },
            sale_date: { type: 'string' },
          },
          required: ['is_sale'],
        },
      });
      const order = typeof result === 'string' ? JSON.parse(result) : result;
      const price = Number(order.unit_price);
      const quantity = Math.max(1, Number(order.quantity) || 1);
      if (!order.is_sale || !order.product_name || !Number.isFinite(price) || price <= 0) {
        skipped++;
        continue;
      }

      const allowedPlatforms = ['Vinted', 'Depop', 'Etsy', 'Poshmark', 'eBay'];
      const platform = allowedPlatforms.includes(order.platform) ? order.platform :
        (/etsy/i.test(sender) ? 'Etsy' : /poshmark/i.test(sender) ? 'Poshmark' : /ebay/i.test(sender) ? 'eBay' : /depop/i.test(sender) ? 'Depop' : 'Vinted');
      const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(order.sale_date || '')
        ? order.sale_date
        : new Date(Number(msg.internalDate) || Date.now()).toISOString().slice(0, 10);
      const key = `${platform}|${order.order_id || ''}|${order.product_name}|${saleDate}`;
      if (seenOrderKeys.has(key)) {
        skipped++;
        continue;
      }

      const size = order.size || 'Unknown';
      const inv = inventoryCosts.find((item) => item.size === size);
      const costs = calculateOrderCosts({ ...order, quantity, unit_price: price }, inv);

      await base44.entities.Order.create({
        sale_date: saleDate,
        platform,
        order_id: order.order_id || null,
        product_name: order.product_name,
        quantity,
        size,
        unit_price: price,
        sale_total: price * quantity,
        buyer: order.buyer || null,
        source_email_id: messageId,
        sync_source: 'gmail',
        ...costs,
      });

      seenEmailIds.add(messageId);
      seenOrderKeys.add(key);
      created++;
    }

    return Response.json({
      processed: messageIds.length,
      created,
      skipped,
      message: created ? `Imported ${created} new sale${created === 1 ? '' : 's'}` : 'No new sales found',
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Email import failed' }, { status: 500 });
  }
}
