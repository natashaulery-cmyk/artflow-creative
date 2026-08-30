import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ebayAuthorizeUrl, ebayConfigured } from '../../shared/ebay.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  if (!ebayConfigured()) {
    return Response.json({ available: false, needs_setup: true, message: 'eBay developer credentials are not configured yet.' });
  }

  let email = '';
  try { email = (await base44.auth.me())?.email || ''; } catch {}
  const { ownerId, businessId } = await resolveBusinessWorkspace(base44, email);
  if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

  const state = randomToken(24);
  const all = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 100);
  const existing = all.find((x) => x.business_id === businessId);
  const payload = {
    business_id: businessId,
    owner_id: ownerId,
    status: existing?.status === 'connected' ? 'connected' : 'disconnected',
    oauth_state: state,
    last_error: '',
  };
  if (existing) await base44.asServiceRole.entities.EbayConnection.update(existing.id, payload);
  else await base44.asServiceRole.entities.EbayConnection.create({ ...payload, created_by_id: ownerId });

  return Response.json({ available: true, authorize_url: ebayAuthorizeUrl(state) });
}
