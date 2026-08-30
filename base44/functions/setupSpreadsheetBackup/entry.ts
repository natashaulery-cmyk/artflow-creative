import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';

const TAB_HEADERS = {
  Orders: ['Sale Date','Platform','Order ID','Product Name','Quantity','Size','Unit Price','Sale Total','Buyer','Source Email ID','Base Item Cost','Paper & Ink','Packaging Cost','Total Cost','Estimated Profit'],
  Expenses: ['Date','Category','Description','Amount','Deductible %','Deductible Amount','Source','Notes','Receipt ID'],
  Deductions: ['Date','Category','Description','Amount','Deductible %','Deductible Amount','Source','Notes','Receipt ID'],
  Inventory: ['Item','Size','Category','Base Item Cost','Paper & Ink Cost','Packaging Cost','Quantity On Hand','Low Stock Level','Notes'],
  Summary: ['ArtFlow Spreadsheet Backup','Purpose'],
};

async function sheetsFetch(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error?.message || `Google Sheets ${res.status}`);
  return data;
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const spreadsheetId = String(body?.spreadsheetId || user.spreadsheet_id || user.data?.spreadsheet_id || '').trim();
    if (!spreadsheetId) return Response.json({ error: 'Paste a Google Sheet link or spreadsheet ID first.' }, { status: 400 });

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(GOOGLE_SHEETS_CONNECTOR_ID));
    } catch {
      return Response.json({ error: 'Connect Google Sheets before setting up the spreadsheet backup.' }, { status: 409 });
    }

    const root = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const meta = await sheetsFetch(accessToken, `${root}?fields=properties.title,sheets.properties`);
    const existingTitles = new Set((meta.sheets || []).map((sheet) => sheet?.properties?.title).filter(Boolean));
    const missing = Object.keys(TAB_HEADERS).filter((title) => !existingTitles.has(title));

    if (missing.length) {
      await sheetsFetch(accessToken, `${root}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title, frozenRowCount: 1 } } })) }),
      });
    }

    const initialized = [];
    const untouched = [];
    for (const [title, headers] of Object.entries(TAB_HEADERS)) {
      const read = await sheetsFetch(accessToken, `${root}/values/${encodeURIComponent(title)}!A1:Z3`);
      const rows = Array.isArray(read?.values) ? read.values : [];
      const hasContent = rows.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''));
      if (hasContent) {
        untouched.push(title);
        continue;
      }

      const values = title === 'Summary'
        ? [headers, ['Keep this sheet connected to ArtFlow.','Marketplace APIs/webhooks and connected inboxes sync first. Expenses/Deductions are used only as a duplicate-safe fallback for anything ArtFlow misses.']]
        : [headers];
      await sheetsFetch(accessToken, `${root}/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      initialized.push(title);
    }

    if (String(user.spreadsheet_id || '') !== spreadsheetId) {
      await base44.auth.updateMe({ spreadsheet_id: spreadsheetId });
    }

    return Response.json({
      ok: true,
      spreadsheet_id: spreadsheetId,
      created_tabs: missing,
      initialized_tabs: initialized,
      untouched_tabs: untouched,
      message: missing.length || initialized.length
        ? 'Spreadsheet backup is ready. Existing data was left untouched.'
        : 'Spreadsheet backup was already set up; no existing data was changed.',
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
