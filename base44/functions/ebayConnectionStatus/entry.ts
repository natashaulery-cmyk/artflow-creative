import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ebayConfigured } from '../../shared/ebay.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  let email = '';
  try { email = (await base44.auth.me())?.email || ''; } catch {}
  const { businessId } = await resolveBusinessWorkspace(base44, email);
  if (!businessId) return Response.json({ configured: ebayConfigured(), connected: false });
  const all = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 100);
  const connection = all.find((x) => x.business_id === businessId);
  return Response.json({
    configured: ebayConfigured(),
    connected: connection?.status === 'connected',
    username: connection?.username || '',
    notifications_connected: !!(connection?.notification_destination_id && connection?.notification_subscription_id),
    last_error: connection?.last_error || '',
  });
}
