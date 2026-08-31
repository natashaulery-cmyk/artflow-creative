import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { appendOrdersToMasterSheet } from '../../shared/spreadsheetMaster.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const workspace = await resolveBusinessWorkspace(base44, user.email || '');
    const { businessId } = workspace;
    if (!businessId) return Response.json({ error: 'No business workspace found' }, { status: 400 });

    const captures = await base44.asServiceRole.entities.BrowserCapture.list('-captured_at', 5000);
    const pending = captures.filter((row) => row.business_id === businessId && row.status !== 'written').slice(0, 250);
    if (!pending.length) return Response.json({ flushed: 0, remaining: 0, message: 'Browser sales are already in the spreadsheet.' });

    const orders = pending.map((row) => {
      const quantity = Math.max(1, Number(row.quantity) || 1);
      const saleTotal = Number(row.sale_total || 0);
      return {
        sale_date: row.sale_date || new Date().toISOString().slice(0, 10),
        platform: row.platform,
        order_id: row.order_id || null,
        product_name: row.product_name,
        quantity,
        size: inferSize(row.product_name),
        unit_price: +(saleTotal / quantity).toFixed(2),
        sale_total: saleTotal,
        buyer: row.buyer || null,
        source_email_id: `browser:${row.fingerprint}`,
        base_item_cost: 0,
        paper_ink_cost: 0,
        packaging_cost: 0,
        total_cost: 0,
        estimated_profit: saleTotal,
        source_url: row.source_url || null,
      };
    });

    const result = await appendOrdersToMasterSheet(base44, workspace, orders);
    for (const row of pending) {
      await base44.asServiceRole.entities.BrowserCapture.update(row.id, { status: 'written', last_error: '' });
    }

    const remaining = Math.max(0, captures.filter((row) => row.business_id === businessId && row.status !== 'written').length - pending.length);
    return Response.json({
      flushed: Number(result?.appended || 0),
      skipped: Number(result?.skipped || 0),
      remaining,
      message: Number(result?.appended || 0)
        ? `Added ${result.appended} browser sale${result.appended === 1 ? '' : 's'} to the spreadsheet.`
        : 'Browser captures were already represented in the spreadsheet.',
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error || 'Could not flush browser captures') }, { status: 500 });
  }
}