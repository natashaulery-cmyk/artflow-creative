import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Art Flow Creative uses Google Sheets as the source of truth for sales.
// This function is intentionally kept as a safe no-op because the legacy
// Gmail importer created a second independent set of Order records, causing
// duplicates, bad dates, zero-dollar rows, and dashboard totals that did not
// match the spreadsheet.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    return Response.json({
      processed: 0,
      created: 0,
      skipped: 0,
      source: 'google_sheets',
      message: user
        ? 'Sales are synced from the Google Sheets tracker. Use Sync Spreadsheet in Orders.'
        : 'Sales are synced from the Google Sheets tracker.',
    });
  } catch (error) {
    return Response.json({
      processed: 0,
      created: 0,
      skipped: 0,
      source: 'google_sheets',
      message: 'Sales are synced from the Google Sheets tracker.',
    });
  }
}
