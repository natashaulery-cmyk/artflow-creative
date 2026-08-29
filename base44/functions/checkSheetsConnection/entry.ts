import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Reports whether the app's managed Google Sheets connector is available.
// The spreadsheet itself is still selected per signed-in user by URL/ID.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ connected: false }, { status: 200 });
    }
    await base44.asServiceRole.connectors.getConnection('googlesheets');
    return Response.json({ connected: true });
  } catch (error) {
    return Response.json({ connected: false }, { status: 200 });
  }
}