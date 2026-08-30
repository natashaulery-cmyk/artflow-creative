const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

export async function getOutlookConnection(base44) {
  const connectorId = String(Deno.env.get('OUTLOOK_USER_CONNECTOR_ID') || '').trim();
  if (connectorId) {
    return base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
  }

  // Builder-only compatibility path. Never expose the builder's shared Outlook
  // token to ordinary app users; production should set OUTLOOK_USER_CONNECTOR_ID
  // so each user authorizes their own mailbox.
  const user = await base44.auth.me().catch(() => null);
  if (user?.role !== 'admin') {
    throw new Error('Connect your own Microsoft account in Account before syncing Outlook mail.');
  }
  return base44.asServiceRole.connectors.getConnection('outlook');
}

export async function graphJson(accessToken, urlOrPath) {
  const url = /^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${GRAPH_ROOT}${urlOrPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error?.message || data?.message || `Microsoft Graph ${res.status}`);
  return data;
}

export async function getOutlookProfile(accessToken) {
  const profile = await graphJson(accessToken, '/me?$select=displayName,mail,userPrincipalName');
  return {
    email: String(profile?.mail || profile?.userPrincipalName || '').trim().toLowerCase(),
    name: String(profile?.displayName || '').trim(),
  };
}

export async function listOutlookMessages(accessToken, { sinceIso, maxMessages = 1200 } = {}) {
  const select = 'id,subject,from,receivedDateTime,body,bodyPreview,hasAttachments';
  const params = new URLSearchParams({
    '$top': '100',
    '$select': select,
    '$orderby': 'receivedDateTime desc',
  });
  if (sinceIso) params.set('$filter', `receivedDateTime ge ${sinceIso}`);

  const messages = [];
  let next = `/me/mailFolders/inbox/messages?${params.toString()}`;
  while (next && messages.length < maxMessages) {
    const page = await graphJson(accessToken, next);
    messages.push(...(Array.isArray(page?.value) ? page.value : []));
    next = page?.['@odata.nextLink'] || '';
  }
  return messages.slice(0, maxMessages);
}

export async function listOutlookFileAttachments(accessToken, messageId) {
  const page = await graphJson(
    accessToken,
    `/me/messages/${encodeURIComponent(messageId)}/attachments?$top=50`
  );
  return (Array.isArray(page?.value) ? page.value : [])
    .filter((item) => item?.['@odata.type'] === '#microsoft.graph.fileAttachment' && item?.contentBytes)
    .map((item) => ({
      name: item.name || 'attachment',
      contentType: item.contentType || 'application/octet-stream',
      contentBytes: item.contentBytes,
    }));
}

export function outlookSender(message) {
  return String(message?.from?.emailAddress?.address || '').trim();
}

export function outlookBody(message) {
  return String(message?.body?.content || message?.bodyPreview || '').trim();
}

export function outlookDate(message) {
  const date = new Date(message?.receivedDateTime || Date.now());
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

export function decodeBase64Bytes(value = '') {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
