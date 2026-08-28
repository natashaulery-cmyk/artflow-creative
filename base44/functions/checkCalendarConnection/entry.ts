import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_CALENDAR_CONNECTOR_ID } from '../../shared/calendarConnector.js';

// Reports whether the current app user has connected their own Google Calendar
// account. Used by the Account screen to show connection status. Always
// returns 200 with { connected } so the frontend treats failure as
// "not connected" rather than an error.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ connected: false }, { status: 200 });
    }
    await base44.asServiceRole.connectors.getCurrentAppUserConnection(
      GOOGLE_CALENDAR_CONNECTOR_ID
    );
    return Response.json({ connected: true });
  } catch (error) {
    return Response.json({ connected: false }, { status: 200 });
  }
}