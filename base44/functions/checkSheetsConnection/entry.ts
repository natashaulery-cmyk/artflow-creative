import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';

// Reports whether the current signed-in app user has connected their own
// Google Sheets account. Each user's OAuth token is isolated from other users.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ connected: false }, { status: 200 });
    }
    await base44.asServiceRole.connectors.getCurrentAppUserConnection(
      GOOGLE_SHEETS_CONNECTOR_ID
    );
    return Response.json({ connected: true });
  } catch (error) {
    return Response.json({ connected: false }, { status: 200 });
  }
}