import { createHash, createVerify } from 'node:crypto';

const API = 'https://api.ebay.com';
const AUTH = 'https://auth.ebay.com';
const TOKEN_URL = `${API}/identity/v1/oauth2/token`;

export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

export function ebayCredentials() {
  return {
    clientId: String(Deno.env.get('EBAY_CLIENT_ID') || '').trim(),
    clientSecret: String(Deno.env.get('EBAY_CLIENT_SECRET') || '').trim(),
    redirectUri: String(Deno.env.get('EBAY_REDIRECT_URI') || '').trim(),
  };
}

export function ebayConfigured() {
  const c = ebayCredentials();
  return !!(c.clientId && c.clientSecret && c.redirectUri);
}

const basicAuth = (clientId, clientSecret) => {
  const raw = `${clientId}:${clientSecret}`;
  let binary = '';
  for (const b of new TextEncoder().encode(raw)) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
};

async function tokenRequest(params) {
  const { clientId, clientSecret } = ebayCredentials();
  if (!clientId || !clientSecret) throw new Error('eBay API credentials are not configured');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error_description || data?.error || `eBay OAuth ${res.status}`);
  return data;
}

export function ebayAuthorizeUrl(state) {
  const { clientId, redirectUri } = ebayCredentials();
  if (!clientId || !redirectUri) throw new Error('eBay OAuth is not configured');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: EBAY_SCOPES.join(' '),
  });
  return `${AUTH}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeEbayCode(code) {
  const { redirectUri } = ebayCredentials();
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export async function refreshEbayToken(refreshToken) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: EBAY_SCOPES.join(' '),
  });
}

export async function ebayAppToken() {
  const data = await tokenRequest({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });
  return data.access_token;
}

export async function ebayJson(path, accessToken, options = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || `eBay API ${res.status}`);
  return data;
}

export async function ensureFreshEbayConnection(base44, connection) {
  if (!connection?.refresh_token) throw new Error('eBay is not connected');
  if (connection.access_token && new Date(connection.expires_at || 0).getTime() > Date.now() + 120000) return connection;
  const token = await refreshEbayToken(connection.refresh_token);
  const next = {
    ...connection,
    access_token: token.access_token,
    refresh_token: token.refresh_token || connection.refresh_token,
    expires_at: new Date(Date.now() + Number(token.expires_in || 7200) * 1000).toISOString(),
    scopes: token.scope || connection.scopes || EBAY_SCOPES.join(' '),
  };
  await base44.asServiceRole.entities.EbayConnection.update(connection.id, {
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at: next.expires_at,
    scopes: next.scopes,
    status: 'connected',
    last_error: '',
  });
  return next;
}

export async function ebayIdentity(accessToken) {
  const data = await ebayJson('/commerce/identity/v1/user/', accessToken);
  return {
    userId: String(data?.userId || '').trim(),
    username: String(data?.username || '').trim(),
  };
}

export function challengeResponse(challengeCode, verificationToken, endpoint) {
  return createHash('sha256')
    .update(String(challengeCode || ''))
    .update(String(verificationToken || ''))
    .update(String(endpoint || ''))
    .digest('hex');
}

function decodeSignatureHeader(signatureHeader) {
  try {
    const raw = atob(String(signatureHeader || ''));
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid eBay signature header');
  }
}

function formatPublicKey(value = '') {
  const key = String(value || '').trim();
  if (!key) return '';
  if (/-----BEGIN PUBLIC KEY-----/.test(key) && /\n/.test(key)) return key;
  return key
    .replace(/-----BEGIN PUBLIC KEY-----/, '-----BEGIN PUBLIC KEY-----\n')
    .replace(/-----END PUBLIC KEY-----/, '\n-----END PUBLIC KEY-----');
}

export async function verifyEbayNotification(messageObject, signatureHeader) {
  const header = decodeSignatureHeader(signatureHeader);
  const kid = String(header?.kid || '').trim();
  const signature = String(header?.signature || '').trim();
  if (!kid || !signature) return false;

  const appToken = await ebayAppToken();
  const keyResponse = await ebayJson(`/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, appToken);
  const publicKey = formatPublicKey(keyResponse?.key || '');
  if (!publicKey) return false;

  const verifier = createVerify('ssl3-sha1');
  verifier.update(JSON.stringify(messageObject));
  verifier.end();
  return verifier.verify(publicKey, signature, 'base64');
}
