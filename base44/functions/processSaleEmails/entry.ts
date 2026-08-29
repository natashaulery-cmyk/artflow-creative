import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveOwnerUserId } from '../../shared/ownerUser.js';

const START_DATE = '2026-01-01';
const BATCH_SIZE = 25;

const decode = (value = '') => {
  try {
    const clean = value.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
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

const normalized = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const platformFromSender = (sender = '') =>
  /etsy/i.test(sender) ? 'Etsy' :
  /poshmark/i.test(sender) ? 'Poshmark' :
  /ebay/i.test(sender) ? 'eBay' :
  /depop/i.test(sender) ? 'Depop' : 'Vinted';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const ownerId = await resolveOwnerUserId(base44);
    if (!ownerId) return Response.json({ error: 'No app owner found to attribute sales to' }, { status: 500 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };
    const query = 'after:2026/01/01 {from:vinted.com from:depop.com from:etsy.com from:poshmark.com from:ebay.com}';

    const allMessageIds = [];
    let pageToken = '';
    do {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const listRes = await fetch(url, { headers });
      if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
      const page = await listRes.json();
      allMessageIds.push(...(page.messages || []).map((m) => m.id));
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const [inventoryCosts, existingOrders, importHistory] = await Promise.all([
      base44.asServiceRole.entities.InventoryCost.list('size', 100),
      base44.asServiceRole.entities.Order.list('-created_date', 5000),
      base44.asServiceRole.entities.EmailImportMessage.list('-created_date', 5000),
    ]);

    const completedEmailIds = new Set(
      importHistory
        .filter((item) => item.import_type === 'sale' && item.status !== 'error')
        .map((item) => item.message_id)
    );
    const seenEmailIds = new Set(existingOrders.map((o) => o.source_email_id).filter(Boolean));
    const seenOrderIds = new Set(existingOrders.map((o) => normalized(o.order_id)).filter(Boolean));
    const seenFallbackKeys = new Set(
      existingOrders.map((o) => `${o.platform}|${normalized(o.product_name)}|${o.sale_date}|${Number(o.sale_total || 0).toFixed(2)}`)
    );

    const unseenIds = allMessageIds.filter((id) => !completedEmailIds.has(id) && !seenEmailIds.has(id));
    const batch = unseenIds.slice().reverse().slice(0, BATCH_SIZE);
    let created = 0;
    let skipped = 0;
    let errors = 0;

    const recordHistory = async (messageId, status, platform, details) => {
      await base44.asServiceRole.entities.EmailImportMessage.create({
        message_id: messageId,
        import_type: 'sale',
        status,
        platform: platform || null,
        details: String(details || '').slice(0, 500),
        created_by_id: ownerId,
      });
    };

    for (const messageId of batch) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers }
        );
        if (!msgRes.ok) throw new Error('Could not read message');
        const msg = await msgRes.json();
        const emailHeaders = msg.payload?.headers || [];
        const sender = emailHeaders.find((h) => h.name.toLowerCase() === 'from')?.value || '';
        const subject = emailHeaders.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
        const body = textFromPayload(msg.payload) || msg.snippet || '';
        const fallbackDate = new Date(Number(msg.internalDate) || Date.now()).toISOString().slice(0, 10);
        const inferredPlatform = platformFromSender(sender);

        const prompt =
          'Decide whether this marketplace email proves the inbox owner completed a seller sale. Shipping-label and bundle emails count when they contain the sold item and buyer-paid item price. ' +
          'Ignore offers, likes, messages, listing notices, cancellations, refunds, payouts, fees, purchases made by the inbox owner, and emails without a clear item price. Never invent a value.\\n' +
          `Sender: ${sender}\\nSubject: ${subject}\\nReceived date: ${fallbackDate}\\nBody: ${body.slice(0, 18000)}\\n` +
          'Return JSON with is_sale, platform (Vinted, Depop, Etsy, Poshmark, or eBay), order_id, product_name, quantity, size, unit_price (the total item price, excluding shipping and tax), buyer, and sale_date (YYYY-MM-DD).';

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
        const platform = ['Vinted', 'Depop', 'Etsy', 'Poshmark', 'eBay'].includes(order.platform)
          ? order.platform : inferredPlatform;

        if (!order.is_sale || !order.product_name || !Number.isFinite(price) || price <= 0) {
          await recordHistory(messageId, 'skipped', platform, subject || 'Not a completed seller sale');
          skipped++;
          continue;
        }

        const extractedDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(order.sale_date || '') ? order.sale_date : '';
        const today = new Date().toISOString().slice(0, 10);
        const saleDate = extractedDate >= START_DATE && extractedDate <= today ? extractedDate : fallbackDate;
        const orderIdKey = normalized(order.order_id);
        const saleTotal = price * quantity;
        const fallbackKey = `${platform}|${normalized(order.product_name)}|${saleDate}|${saleTotal.toFixed(2)}`;

        if ((orderIdKey && seenOrderIds.has(orderIdKey)) || seenFallbackKeys.has(fallbackKey)) {
          await recordHistory(messageId, 'skipped', platform, `Duplicate: ${subject}`);
          skipped++;
          continue;
        }

        const size = order.size || 'Unknown';
        const inv = inventoryCosts.find((item) => item.size === size);
        const costs = calculateOrderCosts({ ...order, quantity, unit_price: price }, inv);
        await base44.asServiceRole.entities.Order.create({
          sale_date: saleDate,
          platform,
          order_id: order.order_id || null,
          product_name: order.product_name,
          quantity,
          size,
          unit_price: price,
          sale_total: saleTotal,
          buyer: order.buyer || null,
          source_email_id: messageId,
          sync_source: 'gmail',
          created_by_id: ownerId,
          ...costs,
        });

        await recordHistory(messageId, 'imported', platform, subject);
        seenEmailIds.add(messageId);
        if (orderIdKey) seenOrderIds.add(orderIdKey);
        seenFallbackKeys.add(fallbackKey);
        created++;
      } catch (error) {
        errors++;
        try {
          await recordHistory(messageId, 'error', '', error.message || 'Import failed');
        } catch {}
      }
    }

    const remaining = Math.max(0, unseenIds.length - batch.length);
    const message = remaining > 0
      ? `Imported ${created} sale${created === 1 ? '' : 's'}. Backfill continuing automatically (${remaining} emails left).`
      : created
        ? `Imported ${created} new sale${created === 1 ? '' : 's'}. All marketplace emails are up to date.`
        : 'All marketplace sales emails are up to date.';

    return Response.json({
      found: allMessageIds.length,
      processed: batch.length,
      created,
      skipped,
      errors,
      remaining,
      message,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Email import failed' }, { status: 500 });
  }
}
