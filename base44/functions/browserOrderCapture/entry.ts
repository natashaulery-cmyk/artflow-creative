import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { appendOrdersToMasterSheet } from '../../shared/spreadsheetMaster.js';

const normalize = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const validPlatform = (value = '') => /vinted/i.test(value) ? 'Vinted' : /depop/i.test(value) ? 'Depop' : '';
const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};
const validDate = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sourceHostMatches(platform, url = '') {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (platform === 'Vinted') return host === 'vinted.com' || host.endsWith('.vinted.com');
    if (platform === 'Depop') return host === 'depop.com' || host.endsWith('.depop.com');
  } catch {}
  return false;
}

export default async function(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const syncKey = String(body?.sync_key || '').trim();
    const incoming = Array.isArray(body?.orders) ? body.orders.slice(0, 50) : body?.order ? [body.order] : [];
    if (!syncKey || !incoming.length) {
      return Response.json({ error: 'Missing sync key or orders' }, { status: 400, headers: cors });
    }

    const businesses = await base44.asServiceRole.entities.Business.list('-updated_date', 500);
    const business = businesses.find((item) =>
      item.extension_sync_enabled !== false &&
      String(item.extension_sync_key || '').trim() === syncKey
    );
    if (!business?.id) return Response.json({ error: 'Invalid Art Flow Browser Sync key' }, { status: 401, headers: cors });

    const existingCaptures = await base44.asServiceRole.entities.BrowserCapture.list('-captured_at', 5000);
    const businessCaptures = existingCaptures.filter((row) => row.business_id === business.id);
    const existingFingerprints = new Set(businessCaptures.map((row) => row.fingerprint).filter(Boolean));
    const today = new Date().toISOString().slice(0, 10);
    const accepted = [];
    const createdCaptureIds = [];
    let skipped = 0;

    for (const raw of incoming) {
      const platform = validPlatform(raw?.platform);
      const productName = String(raw?.product_name || raw?.title || '').trim().slice(0, 300);
      const quantity = Math.max(1, Math.min(50, Number(raw?.quantity) || 1));
      const saleTotal = Number(raw?.sale_total ?? raw?.price ?? 0);
      const saleDate = validDate(raw?.sale_date) ? String(raw.sale_date) : today;
      const sourceUrl = String(raw?.source_url || '').trim().slice(0, 1000);
      if (!platform || !productName || !Number.isFinite(saleTotal) || saleTotal <= 0 || !sourceHostMatches(platform, sourceUrl)) {
        skipped += 1;
        continue;
      }

      const orderId = String(raw?.order_id || '').trim().slice(0, 160);
      const buyer = String(raw?.buyer || '').trim().slice(0, 200);
      const fingerprint = await sha256([
        platform,
        orderId,
        saleDate,
        saleTotal.toFixed(2),
        normalize(productName),
        normalize(sourceUrl),
      ].join('|'));
      if (existingFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      existingFingerprints.add(fingerprint);

      const capture = await base44.asServiceRole.entities.BrowserCapture.create({
        business_id: business.id,
        platform,
        order_id: orderId || null,
        product_name: productName,
        quantity,
        sale_total: saleTotal,
        buyer: buyer || null,
        sale_date: saleDate,
        source_url: sourceUrl || null,
        fingerprint,
        status: 'pending',
        last_error: '',
        captured_at: new Date().toISOString(),
        created_by_id: business.created_by_id,
      });
      createdCaptureIds.push(capture.id);
      accepted.push({
        sale_date: saleDate,
        platform,
        order_id: orderId || null,
        product_name: productName,
        quantity,
        size: inferSize(productName),
        unit_price: +(saleTotal / quantity).toFixed(2),
        sale_total: saleTotal,
        buyer: buyer || null,
        source_email_id: `browser:${fingerprint}`,
        base_item_cost: 0,
        paper_ink_cost: 0,
        packaging_cost: 0,
        total_cost: 0,
        estimated_profit: saleTotal,
        source_url: sourceUrl || null,
      });
    }

    if (!accepted.length) {
      return Response.json({ ok: true, accepted: 0, written: 0, queued: 0, skipped }, { headers: cors });
    }

    let written = 0;
    let writeError = '';
    try {
      const workspace = { spreadsheetId: business.spreadsheet_id || '' };
      const result = await appendOrdersToMasterSheet(base44, workspace, accepted);
      written = Number(result?.appended || 0);
      for (const id of createdCaptureIds) {
        await base44.asServiceRole.entities.BrowserCapture.update(id, { status: 'written', last_error: '' });
      }
    } catch (error) {
      writeError = String(error?.message || error || 'Spreadsheet write failed').slice(0, 1000);
      for (const id of createdCaptureIds) {
        await base44.asServiceRole.entities.BrowserCapture.update(id, { status: 'pending', last_error: writeError });
      }
    }

    return Response.json({
      ok: true,
      accepted: accepted.length,
      written,
      queued: writeError ? accepted.length : 0,
      skipped,
      message: writeError
        ? `${accepted.length} sale${accepted.length === 1 ? '' : 's'} safely queued for the spreadsheet.`
        : `${written} sale${written === 1 ? '' : 's'} added to the ArtFlow Creative Tracker.`,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: String(error?.message || error || 'Browser capture failed') }, { status: 500, headers: cors });
  }
}