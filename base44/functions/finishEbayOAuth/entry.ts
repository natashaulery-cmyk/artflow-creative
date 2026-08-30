import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ebayConfigured, exchangeEbayCode, ebayIdentity } from '../../shared/ebay.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  if (!ebayConfigured()) return Response.json({ error: 'eBay developer credentials are not configured.' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const state = String(body.state || '').trim();
  if (!code || !state) return Response.json({ error: 'Missing eBay authorization response.' }, { status: 400 });

  let email = '';
  try { email = (await base44.auth.me())?.email || ''; } catch {}
  const { ownerId, businessId } = await resolveBusinessWorkspace(base44, email);
  if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

  const all = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 100);
  const connection = all.find((x) => x.business_id === businessId);
  if (!connection || connection.oauth_state !== state) {
    return Response.json({ error: 'eBay authorization state did not match. Start the connection again.' }, { status: 400 });
  }

  try {
    const token = await exchangeEbayCode(code);
    if (!token?.access_token || !token?.refresh_token) throw new Error('eBay did not return the required OAuth tokens.');
    const identity = await ebayIdentity(token.access_token);
    const patch = {
      business_id: businessId,
      owner_id: ownerId,
      ebay_user_id: identity.userId || '',
      username: identity.username || '',
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + Number(token.expires_in || 7200) * 1000).toISOString(),
      scopes: token.scope || '',
      status: 'connected',
      oauth_state: '',
      last_error: '',
    };
    await base44.asServiceRole.entities.EbayConnection.update(connection.id, patch);
    return Response.json({ connected: true, username: patch.username, ebay_user_id: patch.ebay_user_id });
  } catch (error) {
    await base44.asServiceRole.entities.EbayConnection.update(connection.id, { status: 'error', last_error: String(error?.message || error).slice(0, 500) }).catch(() => {});
    return Response.json({ error: String(error?.message || 'Could not connect eBay.') }, { status: 400 });
  }
}
