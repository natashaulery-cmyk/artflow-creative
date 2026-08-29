import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const START_DATE = '2026-01-01';
const BATCH_SIZE = 150;
const LEGACY_MIGRATION_BATCH = 150;
const PARSER_VERSION = 2;

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
const amount = (value) => Number(value || 0).toFixed(2);
const validDate = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(value);

const platformFromSender = (sender = '') =>
  /etsy/i.test(sender) ? 'Etsy' :
  /poshmark/i.test(sender) ? 'Poshmark' :
  /ebay/i.test(sender) ? 'eBay' :
  /depop/i.test(sender) ? 'Depop' : 'Vinted';

const moneyValue = (value = '') => {
  const parsed = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

// High-confidence marketplace templates are parsed directly so routine syncing
// does not consume an AI integration call for every email. This keeps new sales
// flowing even when the optional AI integration quota is exhausted.
const parseKnownSale = ({ sender = '', subject = '', body = '', fallbackDate = '' }) => {
  const platform = platformFromSender(sender);

  if (platform === 'Vinted') {
    // Vinted sends many status emails for one order. Only the original seller
    // confirmation is treated as the sale; completion/payout/shipping updates
    // are handled and ignored so they cannot create duplicates.
    if (/^you sold an item on vinted$/i.test(subject.trim())) {
      const chunks = String(body).split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
      const boughtIndex = chunks.findIndex((part) => /\shas bought$/i.test(part));
      if (boughtIndex >= 0) {
        const buyer = chunks[boughtIndex].replace(/\s+has bought$/i, '').trim();
        let cursor = boughtIndex + 1;
        let quantity = 1;
        if (/^\d+$/.test(chunks[cursor] || '')) quantity = Math.max(1, Number(chunks[cursor++]));
        const productName = chunks[cursor] || '';
        const saleTotal = moneyValue(chunks.slice(cursor + 1).find((part) => /^\$[\d,.]+$/.test(part)) || '');
        if (productName && saleTotal && saleTotal > 0) {
          return {
            handled: true,
            order: {
              is_sale: true,
              platform: 'Vinted',
              order_id: '',
              product_name: productName,
              quantity,
              size: inferSize(productName),
              sale_total: saleTotal,
              buyer,
              sale_date: fallbackDate,
            },
          };
        }
      }
      return { handled: true, order: { is_sale: false, platform: 'Vinted' } };
    }

    // These are follow-up notices, purchases by the inbox owner, messages,
    // offers, payouts, or other non-sale records. The actual seller sale is the
    // "You sold an item on Vinted" email above.
    return { handled: true, order: { is_sale: false, platform: 'Vinted' } };
  }

  if (platform === 'Depop') {
    if (/sale confirmation/i.test(subject) && /you(?:'|’)?ve made a sale/i.test(body)) {
      const buyerMatch = body.match(/\nBuyer\s*\n+([^\n]+)/i)
        || subject.match(/sale confirmation for @([^\.]+)\.?/i);
      const subtotalMatch = body.match(/\nSubtotal\s*\n+\$([\d,.]+)/i);
      const orderDetailsMatch = body.match(/\nOrder details\s*\n+([\s\S]*?)\nShip to\s*\n/i);
      const detailChunks = (orderDetailsMatch?.[1] || '')
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);
      const itemNames = [];
      for (let i = 0; i < detailChunks.length; i += 1) {
        if (!/^\$[\d,.]+$/.test(detailChunks[i]) && /^\$[\d,.]+$/.test(detailChunks[i + 1] || '')) {
          itemNames.push(detailChunks[i]);
          i += 1;
        }
      }
      const quantity = Math.max(1, itemNames.length || (body.match(/\nItem price\s*\n+\$[\d,.]+/gi) || []).length || 1);
      const saleTotal = moneyValue(subtotalMatch?.[1] || '');
      const productName = itemNames.length > 1
        ? `Bundle ${itemNames.length} items: ${itemNames.join(' + ')}`
        : itemNames[0] || 'Depop sale';
      if (saleTotal && saleTotal > 0) {
        return {
          handled: true,
          order: {
            is_sale: true,
            platform: 'Depop',
            order_id: '',
            product_name: productName,
            quantity,
            size: inferSize(productName),
            sale_total: saleTotal,
            buyer: buyerMatch?.[1]?.trim() || '',
            sale_date: fallbackDate,
          },
        };
      }
      return { handled: true, order: { is_sale: false, platform: 'Depop' } };
    }

    // Shipping reminders, delivery notices, marketing, and other Depop emails
    // are not separate sales.
    return { handled: true, order: { is_sale: false, platform: 'Depop' } };
  }

  return { handled: false, order: null };
};

const productSimilar = (a = '', b = '') => {
  const left = normalized(a);
  const right = normalized(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const prefix = Math.min(28, left.length, right.length);
  return prefix >= 18 && left.slice(0, prefix) === right.slice(0, prefix);
};

const sameSale = (a, b) => {
  if ((a.platform || '') !== (b.platform || '')) return false;

  // Marketplace/email IDs identify an order, not necessarily a single line item.
  // Depop bundle emails can contain several legitimate products under the same
  // order/email ID, so only treat overlapping IDs as duplicates when the line
  // itself also matches by amount, quantity, and product.
  const idsA = [normalized(a.order_id), normalized(a.source_email_id)].filter(Boolean);
  const idsB = [normalized(b.order_id), normalized(b.source_email_id)].filter(Boolean);
  const idOverlap = idsA.some((id) => idsB.includes(id));
  if (idOverlap) {
    if (amount(a.sale_total) !== amount(b.sale_total)) return false;
    if (Number(a.quantity || 1) !== Number(b.quantity || 1)) return false;
    return productSimilar(a.product_name, b.product_name);
  }
  if (idsA.length && idsB.length) return false;

  // Only use the date/amount/product fingerprint for truly identifier-less rows.
  if ((a.sale_date || '') !== (b.sale_date || '')) return false;
  if (amount(a.sale_total) !== amount(b.sale_total)) return false;
  return productSimilar(a.product_name, b.product_name);
};

async function saveSyncState(base44, ownerId, businessId, data) {
  if (!businessId) return;
  try {
    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 100);
    const existing = states.find((item) => item.business_id === businessId && item.source === 'gmail_sales');
    const payload = {
      business_id: businessId,
      source: 'gmail_sales',
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
  } catch {}
}

export default async function(req) {
  let base44;
  let workspace = { ownerId: null, businessId: null, email: null };
  try {
    base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };

    let connectedEmail = '';
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers });
      if (profileRes.ok) connectedEmail = (await profileRes.json()).emailAddress || '';
    } catch {}

    workspace = await resolveBusinessWorkspace(base44, connectedEmail);
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) {
      return Response.json({ error: 'No business workspace found for the connected Gmail account' }, { status: 500 });
    }

    // Prevent overlapping login/focus/timer syncs from importing the same email
    // at the same time. Client-side guards do not protect multiple tabs/devices.
    const priorStates = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 100);
    const priorState = priorStates.find((item) => item.business_id === businessId && item.source === 'gmail_sales');
    if (priorState?.status === 'running') {
      const age = Date.now() - new Date(priorState.last_synced_at || 0).getTime();
      if (Number.isFinite(age) && age >= 0 && age < 2 * 60 * 1000) {
        return Response.json({
          connected_email: workspace.email,
          found: priorState.last_found || 0,
          processed: 0,
          created: 0,
          migrated: 0,
          skipped: 0,
          errors: 0,
          remaining: priorState.last_remaining || 0,
          message: 'Sales sync is already running.',
        });
      }
    }
    await saveSyncState(base44, ownerId, businessId, { status: 'running', message: 'Syncing sales emails…' });

    // Once historical backfill is caught up, only scan a small recent window instead
    // of relisting every marketplace email since January on every foreground sync.
    // Keep a 7-day overlap so delayed emails and parser retries are still picked up.
    const caughtUp = !!priorState && Number(priorState.last_remaining || 0) === 0;
    const query = caughtUp
      ? 'newer_than:7d {from:vinted from:depop from:etsy from:poshmark from:ebay}'
      : 'after:2026/01/01 {from:vinted from:depop from:etsy from:poshmark from:ebay}';
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

    const [allInventory, existingOrders, importHistory] = await Promise.all([
      base44.asServiceRole.entities.InventoryCost.list('size', 500),
      base44.asServiceRole.entities.Order.list('-created_date', 5000),
      base44.asServiceRole.entities.EmailImportMessage.list('-created_date', 5000),
    ]);

    const inventoryCosts = allInventory.filter(
      (item) => item.business_id === businessId || (!item.business_id && item.created_by_id === ownerId)
    );
    const today = new Date().toISOString().slice(0, 10);
    const targetOrders = existingOrders.filter(
      (o) => !o.archived && (o.business_id === businessId || (o.created_by_id === ownerId && !o.business_id))
    );

    // Move legacy rows that were created by old service users / previous logins
    // into the shared business workspace. Process curated sheet/Gmail rows first,
    // then raw service rows, so duplicate copies are archived instead of counted.
    const priority = (o) => o.sync_source === 'google_sheet' ? 0 : o.sync_source === 'gmail' ? 1 : String(o.created_by_id || '').startsWith('service_') ? 3 : 2;
    const legacyCandidates = existingOrders
      .filter((o) => !o.archived && o.business_id !== businessId)
      .sort((a, b) => priority(a) - priority(b) || String(b.sale_date || '').localeCompare(String(a.sale_date || '')));

    let migrated = 0;
    let legacyArchived = 0;
    for (const oldOrder of legacyCandidates.slice(0, LEGACY_MIGRATION_BATCH)) {
      const isValid = validDate(oldOrder.sale_date)
        && oldOrder.sale_date >= START_DATE
        && oldOrder.sale_date <= today
        && Number(oldOrder.sale_total || 0) > 0
        && oldOrder.product_name;

      if (isValid) {
        const duplicate = targetOrders.some((existing) => sameSale(existing, oldOrder));
        if (!duplicate) {
          const created = await base44.asServiceRole.entities.Order.create({
            sale_date: oldOrder.sale_date,
            platform: oldOrder.platform,
            order_id: oldOrder.order_id || null,
            product_name: oldOrder.product_name,
            quantity: Number(oldOrder.quantity) || 1,
            size: oldOrder.size || 'Unknown',
            unit_price: Number(oldOrder.unit_price || oldOrder.sale_total || 0),
            sale_total: Number(oldOrder.sale_total || 0),
            buyer: oldOrder.buyer || null,
            source_email_id: oldOrder.source_email_id || null,
            base_item_cost: Number(oldOrder.base_item_cost || 0),
            paper_ink_cost: Number(oldOrder.paper_ink_cost || 0),
            packaging_cost: Number(oldOrder.packaging_cost || 0),
            total_cost: Number(oldOrder.total_cost || 0),
            estimated_profit: Number(oldOrder.estimated_profit ?? oldOrder.sale_total ?? 0),
            archived: false,
            sync_source: oldOrder.sync_source || 'legacy',
            business_id: businessId,
            access_emails: accessEmails,
            created_by_id: ownerId,
          });
          targetOrders.push(created);
          migrated++;
        }
      }
      await base44.asServiceRole.entities.Order.update(oldOrder.id, { archived: true });
      legacyArchived++;
    }

    // Ensure records already owned by this account join the business workspace.
    for (const order of targetOrders.filter((o) => !o.business_id).slice(0, 250)) {
      try {
        await base44.asServiceRole.entities.Order.update(order.id, {
          business_id: businessId,
          access_emails: accessEmails,
        });
        order.business_id = businessId;
      } catch {}
    }

    const completedEmailIds = new Set(
      importHistory
        .filter((item) =>
          item.import_type === 'sale' &&
          (!item.business_id || item.business_id === businessId) &&
          (
            // Imported messages are permanently complete. Skipped messages are
            // complete only for the current parser version so parser improvements
            // automatically retry previously missed sales exactly once.
            item.status === 'imported' ||
            (item.status === 'skipped' && Number(item.parser_version || 0) === PARSER_VERSION)
          )
        )
        .map((item) => item.message_id)
    );
    const seenEmailIds = new Set(targetOrders.map((o) => o.source_email_id).filter(Boolean));
    const unseenIds = allMessageIds.filter((id) => !completedEmailIds.has(id) && !seenEmailIds.has(id));
    // Gmail lists newest messages first. Never reverse this list: doing so makes a
    // new sale wait behind hundreds of historical emails during a backfill.
    const batch = unseenIds.slice(0, BATCH_SIZE);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    const historyByMessage = new Map();
    for (const item of importHistory) {
      if (item.import_type !== 'sale' || !item.message_id) continue;
      if (item.business_id && item.business_id !== businessId) continue;
      if (!historyByMessage.has(item.message_id)) historyByMessage.set(item.message_id, item);
    }

    const recordHistory = async (messageId, status, platform, details) => {
      const payload = {
        message_id: messageId,
        import_type: 'sale',
        status,
        platform: platform || null,
        details: String(details || '').slice(0, 500),
        business_id: businessId,
        parser_version: PARSER_VERSION,
      };
      const existing = historyByMessage.get(messageId);
      if (existing) {
        await base44.asServiceRole.entities.EmailImportMessage.update(existing.id, payload);
        Object.assign(existing, payload);
      } else {
        const createdHistory = await base44.asServiceRole.entities.EmailImportMessage.create({
          ...payload,
          created_by_id: ownerId,
        });
        historyByMessage.set(messageId, createdHistory);
      }
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

        const known = parseKnownSale({ sender, subject, body, fallbackDate });
        let order = known.order;

        if (!known.handled) {
          const prompt =
            'Decide whether this marketplace email proves the inbox owner completed a seller sale. Shipping-label and bundle emails count when they contain the sold item and buyer-paid item price. ' +
            'Ignore offers, likes, messages, listing notices, cancellations, refunds, payouts, fees, purchases made by the inbox owner, and emails without a clear item price. Never invent a value.\n' +
            `Sender: ${sender}\nSubject: ${subject}\nReceived date: ${fallbackDate}\nBody: ${body.slice(0, 18000)}\n` +
            'Return JSON with is_sale, platform (Vinted, Depop, Etsy, Poshmark, or eBay), order_id, product_name, quantity, size, sale_total (the full amount paid for the item or bundle, excluding shipping and tax), buyer, and sale_date (YYYY-MM-DD). Do not multiply bundle totals by quantity.';

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
                sale_total: { type: 'number' },
                buyer: { type: 'string' },
                sale_date: { type: 'string' },
              },
              required: ['is_sale'],
            },
          });
          order = typeof result === 'string' ? JSON.parse(result) : result;
        }
        const saleTotal = Number(order.sale_total);
        const quantity = Math.max(1, Number(order.quantity) || 1);
        const platform = ['Vinted', 'Depop', 'Etsy', 'Poshmark', 'eBay'].includes(order.platform)
          ? order.platform : inferredPlatform;

        if (!order.is_sale || !order.product_name || !Number.isFinite(saleTotal) || saleTotal <= 0) {
          await recordHistory(messageId, 'skipped', platform, subject || 'Not a completed seller sale');
          skipped++;
          continue;
        }

        const extractedDate = validDate(order.sale_date || '') ? order.sale_date : '';
        const saleDate = extractedDate >= START_DATE && extractedDate <= today ? extractedDate : fallbackDate;
        const unitPrice = saleTotal / quantity;
        const candidate = {
          platform,
          order_id: order.order_id || null,
          product_name: order.product_name,
          sale_date: saleDate,
          sale_total: saleTotal,
          source_email_id: messageId,
        };

        if (targetOrders.some((existing) => sameSale(existing, candidate))) {
          await recordHistory(messageId, 'skipped', platform, `Duplicate: ${subject}`);
          skipped++;
          continue;
        }

        const size = order.size || 'Unknown';
        const inv = inventoryCosts.find((item) => item.size === size);
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
          source_email_id: messageId,
          sync_source: 'gmail',
          created_by_id: ownerId,
          ...costs,
        });

        targetOrders.push(createdOrder);
        await recordHistory(messageId, 'imported', platform, subject);
        seenEmailIds.add(messageId);
        created++;
      } catch (error) {
        errors++;
        try {
          await recordHistory(messageId, 'error', '', error.message || 'Import failed');
        } catch {}
      }
    }

    const emailRemaining = Math.max(0, unseenIds.length - batch.length);
    const legacyRemaining = Math.max(0, legacyCandidates.length - Math.min(legacyCandidates.length, LEGACY_MIGRATION_BATCH));
    const remaining = emailRemaining + legacyRemaining;
    const message = remaining > 0
      ? `Synced ${created + migrated} order${created + migrated === 1 ? '' : 's'}. Backfill continuing automatically (${remaining} records left).`
      : created + migrated
        ? `Synced ${created + migrated} order${created + migrated === 1 ? '' : 's'}. Everything is up to date.`
        : 'Everything is up to date.';

    const response = {
      connected_email: workspace.email,
      found: allMessageIds.length,
      processed: batch.length,
      created,
      migrated,
      legacy_archived: legacyArchived,
      skipped,
      errors,
      remaining,
      message,
    };
    await saveSyncState(base44, ownerId, businessId, { ...response, status: errors ? 'error' : 'ok' });
    return Response.json(response);
  } catch (error) {
    if (base44 && workspace.businessId) {
      await saveSyncState(base44, workspace.ownerId, workspace.businessId, {
        status: 'error',
        message: error.message || 'Email import failed',
      });
    }
    return Response.json({ error: error.message || 'Email import failed' }, { status: 500 });
  }
}
