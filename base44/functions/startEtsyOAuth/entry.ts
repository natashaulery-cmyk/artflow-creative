import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64url(data);
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const keystring = String(Deno.env.get('ETSY_API_KEY') || '').trim();
  const sharedSecret = String(Deno.env.get('ETSY_SHARED_SECRET') || '').trim();
  if (!keystring || !sharedSecret) {
    return Response.json({ available: false, needs_setup: true, message: 'Etsy app credentials are not configured yet.' });
  }

  const body = await req.json().catch(() => ({}));
  const redirectUri = String(body.redirect_uri || '').trim();
  if (!/^https:\/\//i.test(redirectUri)) {
    return Response.json({ error: 'A secure HTTPS Etsy callback URL is required.' }, { status: 400 });
  }

  let emailHint = '';
  try { emailHint = (await base44.auth.me())?.email || ''; } catch {}
  const { ownerId, businessId } = await resolveBusinessWorkspace(base44, emailHint);
  if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

  const verifier = randomToken(48);
  const challenge = b64url(await sha256(verifier));
  const state = randomToken(32);

  const all = await base44.asServiceRole.entities.EtsyConnection.list('-updated_date', 100);
  const existing = all.find((x) => x.business_id === businessId);
  const pending = {
    business_id: businessId,
    status: existing?.status === 'connected' ? 'connected' : 'disconnected',
    oauth_state: state,
    pkce_verifier: verifier,
    redirect_uri: redirectUri,
  };
  if (existing) await base44.asServiceRole.entities.EtsyConnection.update(existing.id, pending);
  else await base44.asServiceRole.entities.EtsyConnection.create({ ...pending, created_by_id: ownerId });

  const url = new URL('https://www.etsy.com/oauth/connect');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', keystring);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'transactions_r shops_r');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return Response.json({ available: true, authorize_url: url.toString() });
}