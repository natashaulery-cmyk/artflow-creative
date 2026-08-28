import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';

// Processes Vinted/Depop sale emails and creates Order records for the signed-in
// admin (the builder). Uses the builder's shared Gmail connection. Records are
// created under the admin so per-user privacy keeps them visible to them.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const reqBody = await req.json().catch(() => ({}));

    let messageIds = reqBody?.data?.new_message_ids || reqBody?.messageIds || [];

    if (messageIds.length === 0) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const query =
        '(from:vinted.com OR from:depop.com) (subject:sale OR subject:sold OR subject:order) newer_than:14d';
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
          query
        )}&maxResults=25`,
        { headers: authHeader }
      );
      if (!listRes.ok) {
        return Response.json(
          { error: 'Gmail list failed: ' + (await listRes.text()) },
          { status: 502 }
        );
      }
      const listData = await listRes.json();
      messageIds = (listData.messages || []).map((m) => m.id);
    }

    if (messageIds.length === 0) {
      return Response.json({ processed: 0, created: 0, skipped: 0, message: 'No sale emails found' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const inventoryCosts = await base44.entities.InventoryCost.list('size', 100);
    const existingOrders = await base44.entities.Order.list('-created_date', 5000);
    const dupKey = (p, oid, pn) => `${p}|${oid || ''}|${pn}`;
    const seen = new Set(
      existingOrders.map((o) => dupKey(o.platform, o.order_id, o.product_name))
    );

    let created = 0;
    let skipped = 0;

    for (const messageId of messageIds) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: authHeader }
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      let emailBody = msg.snippet || '';
      const decodeB64 = (b64) => {
        const clean = (b64 || '').replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(clean);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      };
      if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            emailBody = decodeB64(part.body.data);
            break;
          }
        }
      } else if (msg.payload?.body?.data) {
        emailBody = decodeB64(msg.payload.body.data);
      }

      const headers = msg.payload?.headers || [];
      const sender = headers.find((h) => h.name === 'From')?.value || '';
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';

      const prompt =
        'Extract order information from this Vinted or Depop sale notification email. ' +
        'ONLY extract if an item was actually SOLD (not listings, offers, likes, messages, or shipping-only emails). ' +
        'If not a sale, set is_sale=false.\n\n' +
        `Sender: ${sender}\nSubject: ${subject}\nEmail content:\n${emailBody}\n\n` +
        'Return JSON: is_sale (bool), platform ("Vinted" or "Depop"), order_id (string), ' +
        'product_name (string), quantity (number), size (one of: 4x4,4x6,5x7,8x8,8x10,11x14; default 5x7 if unknown), ' +
        'unit_price (number, sale price per item), buyer (string), sale_date (YYYY-MM-DD).';

      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
        },
      });

      const order = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;

      if (!order.is_sale || !order.product_name) {
        skipped++;
        continue;
      }

      const key = dupKey(order.platform, order.order_id, order.product_name);
      if (seen.has(key)) {
        skipped++;
        continue;
      }

      const inv = inventoryCosts.find((i) => i.size === order.size);
      const costs = calculateOrderCosts(order, inv);

      await base44.entities.Order.create({
        sale_date: order.sale_date || new Date().toISOString().slice(0, 10),
        platform: order.platform === 'Depop' ? 'Depop' : 'Vinted',
        order_id: order.order_id || null,
        product_name: order.product_name,
        quantity: Number(order.quantity) || 1,
        size: order.size,
        unit_price: Number(order.unit_price) || 0,
        buyer: order.buyer || null,
        source_email_id: messageId,
        ...costs,
      });

      if (inv) {
        const newQty = Math.max(
          0,
          (inv.quantity_on_hand || 0) - (Number(order.quantity) || 1)
        );
        await base44.entities.InventoryCost.update(inv.id, {
          quantity_on_hand: newQty,
        });
      }

      seen.add(key);
      created++;
    }

    return Response.json({ processed: messageIds.length, created, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}