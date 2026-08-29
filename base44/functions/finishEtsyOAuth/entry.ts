import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const API = 'https://openapi.etsy.com/v3/application';

async function etsyFetch(path, key, secret, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'x-api-key': `${key}:${secret}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || `Etsy API ${res.status}`);
  return data;
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const keystring = String(Deno.env.get('ETSY_API_KEY') || '').trim();
  const sharedSecret = String(Deno.env.get('ETSY_SHARED_SECRET') || '').trim();
  if (!keystring || !sharedSecret) return Response.json({ error: 'Etsy credentials are not configured.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const state = String(body.state || '').trim();
  const redirectUri = String(body.redirect_uri || '').trim();
  if (!code || !state || !redirectUri) return Response.json({ error: 'Missing Etsy authorization response.' }, { status: 400 });

  let emailHint = '';
  try { emailHint = (await base44.auth.me())?.email || ''; } catch {}
  const { ownerId, businessId } = await resolveBusinessWorkspace(base44, emailHint);
  if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

  const all = await base44.asServiceRole.entities.EtsyConnection.list('-updated_date', 100);
  const connection = all.find((x) => x.business_id === businessId);
  if (!connection || connection.oauth_state !== state || connection.redirect_uri !== redirectUri || !connection.pkce_verifier) {
    return Response.json({ error: 'Etsy authorization state did not match. Start the connection again.' }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('client_id', keystring);
  form.set('redirect_uri', redirectUri);
  form.set('code', code);
  form.set('code_verifier', connection.pkce_verifier);

  const tokenRes = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const tokenText = await tokenRes.text();
  let tokenData = {};
  try { tokenData = tokenText ? JSON.parse(tokenText) : {}; } catch { tokenData = {}; }
  if (!tokenRes.ok || !tokenData.access_token) {
    return Response.json({ error: tokenData?.error_description || tokenData?.error || 'Etsy token exchange failed.' }, { status: 400 });
  }

  const accessToken = String(tokenData.access_token);
  const etsyUserId = accessToken.split('.')[0] || '';
  let shop = null;
  if (etsyUserId) {
    try { shop = await etsyFetch(`/users/${etsyUserId}/shops`, keystring, sharedSecret, accessToken); } catch {}
  }

  const patch = {
    business_id: businessId,
    etsy_user_id: etsyUserId,
    shop_id: shop?.shop_id ? String(shop.shop_id) : '',
    shop_name: shop?.shop_name || '',
    access_token: accessToken,
    refresh_token: String(tokenData.refresh_token || ''),
    expires_at: new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString(),
    scopes: String(tokenData.scope || ''),
    status: 'connected',
    oauth_state: '',
    pkce_verifier: '',
    redirect_uri: redirectUri,
  };
  await base44.asServiceRole.entities.EtsyConnection.update(connection.id, patch);

  return Response.json({ connected: true, shop_name: patch.shop_name, shop_id: patch.shop_id });
}