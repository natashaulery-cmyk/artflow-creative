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
    const orders = allOrders
      .filter((o) => o.archived !== true)
      .filter((o) => {
        if (o.business_id === businessId) return true;
        if (!o.business_id && o.created_by_id === ownerId) return true;
        return (o.access_emails || []).some(
          (email) => String(email || '').trim().toLowerCase() === currentEmail
        );
      })
      .sort((a, b) => String(b.sale_date || '').localeCompare(String(a.sale_date || '')));

    return Response.json({ orders, business_id: businessId, count: orders.length });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not load business orders' }, { status: 500 });
  }
}
