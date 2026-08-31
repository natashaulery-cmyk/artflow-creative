import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { appendOrdersToMasterSheet } from '../../shared/spreadsheetMaster.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const validDate = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const platformFrom = (platform = '', sourceUrl = '', pastedText = '') => {
  const haystack = `${platform} ${sourceUrl} ${pastedText}`;
  if (/vinted/i.test(haystack)) return 'Vinted';
  if (/depop/i.test(haystack)) return 'Depop';
  if (/etsy/i.test(haystack)) return 'Etsy';
  if (/ebay/i.test(haystack)) return 'eBay';
  return '';
};
const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const pastedText = String(body?.pasted_text || '').trim().slice(0, 12000);
    const sourceUrl = String(body?.source_url || '').trim().slice(0, 1200);
    const platform = platformFrom(body?.platform, sourceUrl, pastedText);
    const productName = String(body?.product_name || '').trim().slice(0, 300);
    const orderId = String(body?.order_id || '').trim().slice(0, 160);
    const buyer = String(body?.buyer || '').trim().slice(0, 200);
    const quantity = Math.max(1, Math.min(50, Number(body?.quantity) || 1));
    const saleTotal = Number(body?.sale_total || 0);
    const saleDate = validDate(body?.sale_date) ? String(body.sale_date) : new Date().toISOString().slice(0, 10);

    if (!platform) return Response.json({ error: 'Choose Vinted, Depop, Etsy, or eBay.' }, { status: 400 });
    if (!productName) return Response.json({ error: 'Add the product name.' }, { status: 400 });
    if (!Number.isFinite(saleTotal) || saleTotal <= 0) return Response.json({ error: 'Add the sale total.' }, { status: 400 });

    const workspace = await resolveBusinessWorkspace(base44, user.email || '');
    if (!workspace?.businessId) return Response.json({ error: 'No Art Flow business workspace found.' }, { status: 400 });
    if (!workspace?.spreadsheetId) return Response.json({ error: 'Connect the ArtFlow Creative Tracker spreadsheet first.' }, { status: 409 });

    const order = {
      sale_date: saleDate,
      platform,
      order_id: orderId || null,
      product_name: productName,
      quantity,
      size: String(body?.size || inferSize(productName) || 'Unknown').trim(),
      unit_price: +(saleTotal / quantity).toFixed(2),
      sale_total: saleTotal,
      buyer: buyer || null,
      source_email_id: '',
      base_item_cost: 0,
      paper_ink_cost: 0,
      packaging_cost: 0,
      total_cost: 0,
      estimated_profit: saleTotal,
      source_url: sourceUrl || null,
    };

    const result = await appendOrdersToMasterSheet(base44, workspace, [order]);
    return Response.json({
      ok: true,
      platform,
      appended: Number(result?.appended || 0),
      skipped: Number(result?.skipped || 0),
      message: Number(result?.appended || 0) > 0
        ? 'Sale added to the ArtFlow Creative Tracker.'
        : 'This sale is already in the ArtFlow Creative Tracker.',
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error || 'Could not save mobile sale') }, { status: 500 });
  }
}
