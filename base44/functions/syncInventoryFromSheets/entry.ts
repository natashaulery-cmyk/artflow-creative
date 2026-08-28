import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { importInventory } from '../../shared/inventorySync.js';

// Scheduled sync: pulls the Inventory Pricing tab from the Google Sheets
// tracker into InventoryCost records. Config (spreadsheet + tab) is hardcoded
// server-side. Invoked by the "Sync Inventory" workflow (payload { scheduled: true })
// or manually by an admin.
const SPREADSHEET_ID = '1_GRVGcbkKvgB1B7FiQkCJxkZaQaegYPtx35i7dhav4k';
const SHEET_NAME = 'Inventory Pricing';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const reqBody = await req.json().catch(() => ({}));

    // Workflow path: scheduled invocations carry no user, so skip the admin gate.
    if (reqBody?.scheduled !== true) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    return await importInventory(base44, accessToken, SPREADSHEET_ID, SHEET_NAME);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}