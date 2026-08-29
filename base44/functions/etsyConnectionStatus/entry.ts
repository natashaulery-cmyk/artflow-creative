import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const hasApiKey = !!String(Deno.env.get('ETSY_API_KEY') || '').trim();
  const hasSharedSecret = !!String(Deno.env.get('ETSY_SHARED_SECRET') || '').trim();
  const configured = hasApiKey && hasSharedSecret;
  const missing = [
    ...(!hasApiKey ? ['ETSY_API_KEY'] : []),
    ...(!hasSharedSecret ? ['ETSY_SHARED_SECRET'] : []),
  ];
  let emailHint = '';
  try { emailHint = (await base44.auth.me())?.email || ''; } catch {}
  const { businessId } = await resolveBusinessWorkspace(base44, emailHint);
  if (!businessId) return Response.json({ configured, connected: false, missing });
  const all = await base44.asServiceRole.entities.EtsyConnection.list('-updated_date', 100);
  const connection = all.find((x) => x.business_id === businessId && x.status === 'connected');
  return Response.json({
    configured,
    connected: !!connection,
    missing,
    shop_name: connection?.shop_name || '',
    shop_id: connection?.shop_id || '',
    scopes: connection?.scopes || '',
  });
}