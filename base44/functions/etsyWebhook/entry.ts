import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { verifyEtsy, upsertOrderLines, archiveProviderOrder, functionUrl, money } from '../../shared/marketplaceWebhook.js';

const API = 'https://openapi.etsy.com/v3/application';

async function etsyApi(path, key, secret, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'x-api-key': `${key}:${secret}`,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || `Etsy API ${res.status}`);
  return data;
}

async function refreshConnection(base44, connection, key) {
  if (new Date(connection.expires_at || 0).getTime() > Date.now() + 120000) return connection;
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: key,
    refresh_token: connection.refresh_token || '',
  });
  const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data?.error_description || 'Could not refresh Etsy authorization.');
  const next = {
    ...connection,
    access_token: data.access_token,
    refresh_token: data.refresh_token || connection.refresh_token,
    expires_at: new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString(),
    scopes: data.scope || connection.scopes,
  };
  await base44.asServiceRole.entities.EtsyConnection.update(connection.id, {
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at: next.expires_at,
    scopes: next.scopes,
  });
  return next;
}

function receiptIdFromResource(resourceUrl = '') {
  const match = String(resourceUrl).match(/\/receipts\/(\d+)/i);
  return match ? match[1] : '';
}

function toOrderLines(transactions = []) {
  return transactions.map((tx, index) => {
    const quantity = Math.max(1, Number(tx?.quantity) || 1);
    const unit = money(tx?.price);
    return {
      lineId: String(tx?.transaction_id || tx?.listing_id || index),
      title: String(tx?.title || 'Etsy sale').trim() || 'Etsy sale',
      quantity,
      total: unit * quantity,
      source_url: tx?.listing_id ? `https://www.etsy.com/listing/${tx.listing_id}` : '',
    };
  }).filter((line) => Number(line.total) > 0);
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const url = new URL(req.url);
  const callbackKey = String(url.searchParams.get('key') || '').trim();
  if (!callbackKey) return Response.json({ error: 'Missing callback key' }, { status: 400 });

  const raw = await req.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const allHooks = await base44.asServiceRole.entities.MarketplaceWebhook.list('-updated_date', 500);
  const hook = allHooks.find((x) => x.provider === 'Etsy' && x.callback_key === callbackKey);
  if (!hook) return Response.json({ error: 'Unknown webhook' }, { status: 404 });
  if (!hook.signing_secret) return Response.json({ error: 'Webhook secret not configured' }, { status: 503 });

  const webhookId = req.headers.get('webhook-id') || '';
  const timestamp = req.headers.get('webhook-timestamp') || '';
  const signature = req.headers.get('webhook-signature') || '';
  const valid = await verifyEtsy(raw, webhookId, timestamp, signature, hook.signing_secret);
  if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  const shopId = String(payload?.shop_id || '').trim();
  const eventType = String(payload?.event_type || '').trim();
  const resourceUrl = String(payload?.resource_url || '').trim();
  if (!shopId || !eventType) return Response.json({ error: 'Missing Etsy event fields' }, { status: 400 });

  try {
    const key = String(Deno.env.get('ETSY_API_KEY') || '').trim();
    const secret = String(Deno.env.get('ETSY_SHARED_SECRET') || '').trim();
    if (!key || !secret) throw new Error('Etsy API credentials are not configured');

    const connections = await base44.asServiceRole.entities.EtsyConnection.list('-updated_date', 500);
    let connection = connections.find((x) => String(x.shop_id || '') === shopId && x.business_id === hook.business_id && x.status === 'connected');
    if (!connection) throw new Error('No connected Etsy shop matches this webhook');
    connection = await refreshConnection(base44, connection, key);

    const businesses = await base44.asServiceRole.entities.Business.list('name', 500);
    const business = businesses.find((b) => b.id === hook.business_id);
    const ownerId = hook.owner_id || business?.created_by_id || null;
    const accessEmails = Array.from(new Set([
      ...(hook.access_emails || []),
      ...(business?.member_emails || []),
      ...(business?.sales_emails || []),
      business?.primary_email,
    ].filter(Boolean)));
    if (!ownerId) throw new Error('Webhook workspace owner is missing');

    const normalizedHook = {
      ...hook,
      owner_id: ownerId,
      access_emails: accessEmails,
    };

    const receiptId = receiptIdFromResource(resourceUrl);
    let result = { created: 0, updated: 0, archived: 0 };

    if (eventType === 'order.canceled') {
      if (!receiptId) throw new Error('Could not determine canceled Etsy receipt ID');
      result.archived = await archiveProviderOrder(base44, normalizedHook, 'Etsy', receiptId, 'etsy_webhook_cancelled');
    } else if (['order.paid', 'order.shipped', 'order.delivered'].includes(eventType)) {
      if (!receiptId) throw new Error('Could not determine Etsy receipt ID');
      const receipt = await etsyApi(`/shops/${shopId}/receipts/${receiptId}`, key, secret, connection.access_token);
      let transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
      if (!transactions.length) {
        const txResponse = await etsyApi(`/shops/${shopId}/receipts/${receiptId}/transactions`, key, secret, connection.access_token);
        transactions = Array.isArray(txResponse?.results) ? txResponse.results : [];
      }
      const saleTimestamp = Number(receipt?.created_timestamp || receipt?.create_timestamp || 0);
      const saleDate = saleTimestamp > 0 ? new Date(saleTimestamp * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const buyer = receipt?.name || receipt?.buyer_email || '';
      const lines = toOrderLines(transactions);
      result = { ...result, ...(await upsertOrderLines(base44, normalizedHook, 'Etsy', receiptId, saleDate, buyer, lines, 'etsy_webhook')) };
    }

    await base44.asServiceRole.entities.MarketplaceWebhook.update(hook.id, {
      status: 'active',
      event_types: Array.from(new Set([...(hook.event_types || []), eventType])),
      last_event_at: new Date().toISOString(),
      last_error: '',
      owner_id: ownerId,
      access_emails: accessEmails,
    });

    return Response.json({ ok: true, event_type: eventType, ...result });
  } catch (error) {
    try {
      await base44.asServiceRole.entities.MarketplaceWebhook.update(hook.id, {
        status: 'error',
        last_event_at: new Date().toISOString(),
        last_error: String(error?.message || error || 'Etsy webhook failed').slice(0, 500),
      });
    } catch {}
    return Response.json({ error: String(error?.message || 'Etsy webhook failed') }, { status: 500 });
  }
}
