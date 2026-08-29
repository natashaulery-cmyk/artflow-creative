import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { importInventory } from '../../shared/inventorySync.js';

// Inventory sync. Pulls the Inventory Pricing tab from the spreadsheet saved
// on the current user's account, using the app's managed Google Sheets connection.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const reqBody = await req.json().catch(() => ({}));
    const spreadsheetId =
      reqBody?.spreadsheetId || user.spreadsheet_id || user.data?.spreadsheet_id;
    const sheetName = reqBody?.sheetName;
    if (!spreadsheetId) {
      return Response.json(
        { error: 'No spreadsheet connected. Add your Google Sheet in Account.' },
        { status: 400 }
      );
    }
    const { accessToken } =
      await base44.asServiceRole.connectors.getConnection('googlesheets');
    return await importInventory(base44, accessToken, spreadsheetId, sheetName);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}