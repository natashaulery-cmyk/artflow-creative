import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const workspace = await resolveBusinessWorkspace(base44, me.email);
    const { businessId, ownerId } = workspace;
    if (!businessId) return Response.json({ orders: [], business_id: null });

    const allOrders = await base44.asServiceRole.entities.Order.list('-sale_date', 5000);
    const currentEmail = String(me.email || '').trim().toLowerCase();
    const matchingOrders = allOrders
      .filter((o) => o.archived !== true)
      .filter((o) => {
        if (o.business_id === businessId) return true;
        if (!o.business_id && o.created_by_id === ownerId) return true;
        return (o.access_emails || []).some(
          (email) => String(email || '').trim().toLowerCase() === currentEmail
        );
      });

    // Historical imports created duplicate physical rows for some marketplace
    // emails. Collapse only exact sale-line duplicates here so totals and the UI
    // remain accurate while preserving legitimate multi-item orders that share
    // one marketplace order/email id but have different products.
    const normalize = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
    const seen = new Set();
    const orders = matchingOrders
      .filter((o) => {
        const stableId = o.source_email_id || o.order_id || '';
        const key = stableId
          ? [o.platform || '', stableId, normalize(o.product_name || ''), Number(o.sale_total || 0).toFixed(2)].join('|')
          : [o.platform || '', o.sale_date || '', normalize(o.product_name || ''), Number(o.sale_total || 0).toFixed(2), Number(o.quantity || 1)].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(b.sale_date || '').localeCompare(String(a.sale_date || '')));

    const item_count = orders.reduce((sum, order) => sum + Math.max(1, Number(order.quantity) || 1), 0);
    return Response.json({ orders, business_id: businessId, count: orders.length, item_count });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not load business orders' }, { status: 500 });
  }
}
