import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';
import { getOutlookProfile } from '../../shared/outlookMail.js';

async function currentUserConnector(base44, connectorId) {
  if (!connectorId) return { configured: false, connected: false, connector_id: '' };
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
    return { configured: true, connected: !!accessToken, connector_id: connectorId, accessToken };
  } catch {
    return { configured: true, connected: false, connector_id: connectorId };
  }
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  let user = null;
  try { user = await base44.auth.me(); } catch {}
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const gmailConnectorId = String(Deno.env.get('GMAIL_USER_CONNECTOR_ID') || '').trim();
  const outlookConnectorId = String(Deno.env.get('OUTLOOK_USER_CONNECTOR_ID') || '').trim();

  const [gmail, outlook, sheets] = await Promise.all([
    currentUserConnector(base44, gmailConnectorId),
    currentUserConnector(base44, outlookConnectorId),
    currentUserConnector(base44, GOOGLE_SHEETS_CONNECTOR_ID),
  ]);

  let gmailEmail = '';
  if (gmail.connected && gmail.accessToken) {
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${gmail.accessToken}` } });
      if (res.ok) gmailEmail = String((await res.json())?.emailAddress || '').toLowerCase();
    } catch {}
  } else if (!gmail.configured && user.role === 'admin') {
    // Temporary compatibility for the owner's current single-account install.
    // Ordinary users never receive or use the shared builder mailbox.
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) gmailEmail = String((await res.json())?.emailAddress || '').toLowerCase();
      gmail.legacy_shared = !!gmailEmail;
    } catch {}
  }

  let outlookEmail = '';
  if (outlook.connected && outlook.accessToken) {
    try { outlookEmail = (await getOutlookProfile(outlook.accessToken)).email; } catch {}
  }

  const spreadsheetId = String(user.spreadsheet_id || user.data?.spreadsheet_id || '').trim();

  return Response.json({
    gmail: {
      configured: gmail.configured,
      connected: gmail.connected,
      connector_id: gmail.connector_id,
      email: gmailEmail,
      legacy_shared: !!gmail.legacy_shared,
    },
    outlook: {
      configured: outlook.configured,
      connected: outlook.connected,
      connector_id: outlook.connector_id,
      email: outlookEmail,
    },
    yahoo: {
      configured: false,
      connected: false,
      requires_provider_approval: true,
    },
    sheets: {
      configured: true,
      connected: sheets.connected,
      connector_id: GOOGLE_SHEETS_CONNECTOR_ID,
      spreadsheet_id: spreadsheetId,
      ready: sheets.connected && !!spreadsheetId,
    },
  });
}
