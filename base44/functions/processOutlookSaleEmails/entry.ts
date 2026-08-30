import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';
import { getOutlookConnection, getOutlookProfile, listOutlookMessages, outlookSender, outlookBody, outlookDate } from '../../shared/outlookMail.js';
import { parseKnownSale, platformFromSender, sameSale, validDate } from '../../shared/marketplaceEmailParser.js';

const START_DATE = '2026-01-01';
const BATCH_SIZE = 150;
const MARKETPLACE = /vinted|depop|etsy|ebay/i;

async function saveState(base44, ownerId, businessId, data) {
  if (!businessId) return;
  const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
  const existing = states.find((x) => x.business_id === businessId && x.source === 'outlook_sales');
  const payload = {
    business_id: businessId,
    source: 'outlook_sales',
    last_synced_at: new Date().toISOString(),
    last_found: data.found || 0,
    last_processed: data.processed || 0,
    last_created: data.created || 0,
    last_remaining: data.remaining || 0,
    status: data.status || 'ok',
    message: data.message || '',
  };
  if (existing) await base44.asServiceRole.entities.SyncState.update(existing.id, payload);
  else await base44.asServiceRole.entities.SyncState.create({ ...payload, created_by_id: ownerId });
}

export default async function(req) {
  let base44;
  let workspace = { ownerId: null, businessId: null, email: null, accessEmails: [] };
  try {
    base44 = createClientFromRequest(req);
    const { accessToken } = await getOutlookConnection(base44);
    const profile = await getOutlookProfile(accessToken);
    workspace = await resolveBusinessWorkspace(base44, profile.email);
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found for this Outlook account' }, { status: 400 });

    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
    const prior = states.find((x) => x.business_id === businessId && x.source === 'outlook_sales');
    const caughtUp = prior && Number(prior.last_remaining || 0) === 0;
    const sinceIso = caughtUp
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : new Date(`${START_DATE}T00:00:00.000Z`).toISOString();

    const messages = (await listOutlookMessages(accessToken, { sinceIso, maxMessages: 2000 }))
      .filter((m) => MARKETPLACE.test(`${outlookSender(m)} ${m.subject || ''}`));

    const [orders, history, inventory] = await Promise.all([
      base44.asServiceRole.entities.Order.list('-created_date', 5000),
      base44.asServiceRole.entities.EmailImportMessage.list('-created_date', 5000),
      base44.asServiceRole.entities.InventoryCost.list('size', 500),
    ]);
    const currentOrders = orders.filter((o) => !o.archived && o.business_id === businessId);
    const completed = new Set(history
      .filter((h) => h.business_id === businessId && h.import_type === 'sale' && h.status !== 'error')
      .map((h) => h.message_id));
    const historyById = new Map(history.filter((h) => h.business_id === businessId && h.import_type === 'sale').map((h) => [h.message_id, h]));
    const pending = messages.filter((m) => !completed.has(`outlook:${m.id}`));
    const batch = pending.slice(0, BATCH_SIZE);
    const today = new Date().toISOString().slice(0, 10);
    const inventoryCosts = inventory.filter((x) => x.business_id === businessId || (!x.business_id && x.created_by_id === ownerId));

    let created = 0, skipped = 0, errors = 0;
    const recordHistory = async (messageId, status, platform, details) => {
      const id = `outlook:${messageId}`;
      const payload = { message_id: id, import_type: 'sale', status, platform: platform || null, details: String(details || '').slice(0, 500), business_id: businessId, parser_version: 3 };
      const existing = historyById.get(id);
      if (existing) await base44.asServiceRole.entities.EmailImportMessage.update(existing.id, payload);
      else historyById.set(id, await base44.asServiceRole.entities.EmailImportMessage.create({ ...payload, created_by_id: ownerId }));
    };

    for (const message of batch) {
      try {
        const sender = outlookSender(message);
        const subject = String(message.subject || '');
        const body = outlookBody(message);
        const fallbackDate = outlookDate(message);
        const inferredPlatform = platformFromSender(sender) || platformFromSender(subject);
        const known = parseKnownSale({ sender: `${sender} ${subject}`, subject, body, fallbackDate });
        let order = known.order;

        if (!known.handled) {
          const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt:
              'Decide whether this marketplace email proves the inbox owner completed a seller sale. Ignore offers, likes, messages, cancellations, refunds, payouts, fees, purchases by the inbox owner, and emails without a clear sold-item price. Never invent values.\n' +
              `Sender: ${sender}\nSubject: ${subject}\nReceived date: ${fallbackDate}\nBody: ${body.slice(0, 18000)}\n` +
              'Return JSON with is_sale, platform (Vinted, Depop, Etsy, or eBay), order_id, product_name, quantity, size, sale_total, buyer, and sale_date (YYYY-MM-DD).',
            response_json_schema: {
              type: 'object',
              properties: { is_sale:{type:'boolean'}, platform:{type:'string'}, order_id:{type:'string'}, product_name:{type:'string'}, quantity:{type:'number'}, size:{type:'string'}, sale_total:{type:'number'}, buyer:{type:'string'}, sale_date:{type:'string'} },
              required: ['is_sale'],
            },
          });
          order = typeof result === 'string' ? JSON.parse(result) : result;
        }

        const saleTotal = Number(order?.sale_total);
        const quantity = Math.max(1, Number(order?.quantity) || 1);
        const platform = ['Vinted','Depop','Etsy','eBay'].includes(order?.platform) ? order.platform : inferredPlatform;
        if (!order?.is_sale || !order?.product_name || !Number.isFinite(saleTotal) || saleTotal <= 0 || !platform) {
          await recordHistory(message.id, 'skipped', platform, subject || 'Not a completed seller sale');
          skipped++;
          continue;
        }

        const extracted = validDate(order.sale_date || '') ? order.sale_date : '';
        const saleDate = extracted >= START_DATE && extracted <= today ? extracted : fallbackDate;
        const candidate = { platform, order_id: order.order_id || null, product_name: order.product_name, sale_date: saleDate, sale_total: saleTotal, quantity, source_email_id: `outlook:${message.id}` };
        if (currentOrders.some((existing) => sameSale(existing, candidate))) {
          await recordHistory(message.id, 'skipped', platform, `Duplicate: ${subject}`);
          skipped++;
          continue;
        }

        const size = order.size || 'Unknown';
        const inv = inventoryCosts.find((x) => x.size === size);
        const unitPrice = saleTotal / quantity;
        const costs = calculateOrderCosts({ ...order, quantity, unit_price: unitPrice }, inv);
        const createdOrder = await base44.asServiceRole.entities.Order.create({
          business_id: businessId,
          access_emails: accessEmails,
          sale_date: saleDate,
          platform,
          order_id: order.order_id || null,
          product_name: order.product_name,
          quantity,
          size,
          unit_price: unitPrice,
          sale_total: saleTotal,
          buyer: order.buyer || null,
          source_email_id: `outlook:${message.id}`,
          sync_source: 'outlook',
          created_by_id: ownerId,
          ...costs,
        });
        currentOrders.push(createdOrder);
        await recordHistory(message.id, 'imported', platform, subject);
        created++;
      } catch (e) {
        errors++;
        await recordHistory(message.id, 'error', '', e?.message || 'Outlook sale import failed').catch(() => {});
      }
    }

    const remaining = Math.max(0, pending.length - batch.length);
    const message = created ? `Synced ${created} Outlook sale${created === 1 ? '' : 's'}${remaining ? ` · ${remaining} emails left` : ''}` : remaining ? `Checked ${batch.length} Outlook emails · ${remaining} left` : 'Outlook sales are up to date';
    const response = { provider: 'Outlook', connected_email: profile.email, found: messages.length, processed: batch.length, created, skipped, errors, remaining, message };
    await saveState(base44, ownerId, businessId, { ...response, status: errors ? 'error' : 'ok' });
    return Response.json(response);
  } catch (e) {
    if (base44 && workspace.businessId) await saveState(base44, workspace.ownerId, workspace.businessId, { status:'error', message:e?.message || 'Outlook sale import failed' }).catch(() => {});
    return Response.json({ available: false, error: e?.message || 'Outlook is not connected' }, { status: 400 });
  }
}
