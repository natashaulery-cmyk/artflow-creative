import { calculateOrderCosts } from './orderCost.js';

export const APP_ID = '6a91be5ced6058323eb21f7d';
export const functionUrl = (name, key = '') =>
  `https://base44.app/api/apps/${APP_ID}/functions/${name}${key ? `?key=${encodeURIComponent(key)}` : ''}`;

export const inferSize = (name = '') => {
  const m = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return m ? m[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

export const money = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  if (typeof value === 'object') {
    const amount = Number(value.amount ?? value.value ?? value.total ?? 0);
    const divisor = Number(value.divisor || 1);
    return divisor ? amount / divisor : amount;
  }
  return 0;
};

const encoder = new TextEncoder();
const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const toB64 = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (value) => {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function hmacBase64(secretBytes, payload) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export function timingSafeText(a, b) {
  const left = encoder.encode(String(a || ''));
  const right = encoder.encode(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function verifyVinted(raw, header, secret) {
  const match = String(header || '').match(/(?:^|,)t=(\d+)(?:,|$).*?(?:^|,)v1=([a-f0-9]+)/i);
  if (!match) return false;
  const ts = Number(match[1]);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = await hmacHex(secret, `${match[1]}.${raw}`);
  return timingSafeText(expected.toLowerCase(), match[2].toLowerCase());
}

export async function verifyDepop(raw, timestamp, signature, secret) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  return timingSafeText(expected.toLowerCase(), String(signature || '').toLowerCase());
}

export async function verifyEtsy(raw, webhookId, timestamp, signatureHeader, secret) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const normalized = String(secret || '').startsWith('whsec_') ? String(secret).slice(6) : String(secret || '');
  let secretBytes;
  try { secretBytes = fromB64(normalized); } catch { return false; }
  const expected = await hmacBase64(secretBytes, `${webhookId}.${timestamp}.${raw}`);
  const candidates = String(signatureHeader || '').split(/\s+/).map((part) => part.includes(',') ? part.split(',').pop() : part).map((part) => part.includes('=') ? part.split('=').pop() : part).filter(Boolean);
  return candidates.some((candidate) => timingSafeText(candidate, expected));
}

export function vintedCredentials() {
  const combined = String(Deno.env.get('VINTED_PRO_ACCESS_TOKEN') || '').trim();
  if (combined.includes(',')) {
    const i = combined.indexOf(',');
    return { accessKey: combined.slice(0, i).trim(), signingKey: combined.slice(i + 1).trim() };
  }
  return {
    accessKey: String(Deno.env.get('VINTED_PRO_ACCESS_KEY') || '').trim(),
    signingKey: String(Deno.env.get('VINTED_PRO_SIGNING_KEY') || '').trim(),
  };
}

export async function vintedRequest(path, { method = 'GET', body = '' } = {}) {
  const creds = vintedCredentials();
  if (!creds.accessKey || !creds.signingKey) throw new Error('Vinted Pro credentials are not configured');
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyText = body && typeof body !== 'string' ? JSON.stringify(body) : String(body || '');
  const signature = await hmacHex(creds.signingKey, `${timestamp}.${method}.${path}.${creds.accessKey}.${bodyText}`);
  const res = await fetch(`https://pro.svc.vinted.com${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Vpi-Access-Key': creds.accessKey,
      'X-Vpi-Hmac-Sha256': `t=${timestamp},v1=${signature}`,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : bodyText,
  });
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Vinted API ${res.status}: ${data?.error || data?.message || text.slice(0, 250)}`);
  return data;
}

export async function depopRequest(path, { method = 'GET', body } = {}) {
  const apiKey = String(Deno.env.get('DEPOP_PARTNER_API_KEY') || '').trim();
  if (!apiKey) throw new Error('Depop Partner API key is not configured');
  const res = await fetch(`https://partnerapi.depop.com${path}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Depop API ${res.status}: ${data?.detail || data?.error || data?.message || text.slice(0, 250)}`);
  return data;
}

export async function upsertOrderLines(base44, connection, provider, orderId, saleDate, buyer, lines, syncSource) {
  const [allOrders, allInventory] = await Promise.all([
    base44.asServiceRole.entities.Order.list('-sale_date', 5000),
    base44.asServiceRole.entities.InventoryCost.list('size', 500),
  ]);
  const orders = allOrders.filter((o) => o.business_id === connection.business_id || (!o.business_id && o.created_by_id === connection.owner_id));
  const inventory = allInventory.filter((i) => i.business_id === connection.business_id || (!i.business_id && i.created_by_id === connection.owner_id));
  let created = 0, updated = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || {};
    const title = String(line.title || `${provider} sale`).trim() || `${provider} sale`;
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const total = money(line.total);
    if (!(total > 0)) continue;
    const size = inferSize(title);
    const inv = inventory.find((i) => i.size === size);
    const costs = calculateOrderCosts({ quantity, size, unit_price: total / quantity }, inv);
    const sourceId = `${String(provider).toLowerCase()}-api:${orderId}:${line.lineId || index}`;
    let existing = orders.find((o) => o.source_email_id === sourceId);
    if (!existing) existing = orders.find((o) => o.platform === provider && String(o.order_id || '') === String(orderId) && String(o.product_name || '').trim().toLowerCase() === title.toLowerCase());
    const payload = {
      business_id: connection.business_id,
      access_emails: connection.access_emails || [],
      platform: provider,
      order_id: String(orderId),
      source_email_id: sourceId,
      sync_source: syncSource,
      sale_date: saleDate || new Date().toISOString().slice(0, 10),
      product_name: title,
      quantity,
      size,
      unit_price: total / quantity,
      buyer: buyer || null,
      archived: false,
      ...costs,
    };
    if (existing) {
      await base44.asServiceRole.entities.Order.update(existing.id, payload);
      Object.assign(existing, payload); updated += 1;
    } else {
      const made = await base44.asServiceRole.entities.Order.create({ ...payload, created_by_id: connection.owner_id });
      orders.push(made); created += 1;
    }
  }
  return { created, updated };
}

export async function archiveProviderOrder(base44, connection, provider, orderId, reason) {
  const all = await base44.asServiceRole.entities.Order.list('-sale_date', 5000);
  const matches = all.filter((o) => o.business_id === connection.business_id && o.platform === provider && String(o.order_id || '') === String(orderId) && o.archived !== true);
  for (const order of matches) await base44.asServiceRole.entities.Order.update(order.id, { archived: true, sync_source: reason });
  return matches.length;
}
