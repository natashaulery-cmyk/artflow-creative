import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const TAB_VALUES = {
  Dashboard: [
    ['ArtFlow Creative Dashboard'],
    ['Total Sales', '=SUM(Orders!H2:H)'],
    ['Total Expenses', '=SUM(Expenses!D2:D)'],
    ['Estimated Profit', '=SUM(Orders!O2:O)-SUM(Expenses!F2:F)'],
    ['Vinted Sales', '=SUMIF(Orders!B2:B,"Vinted",Orders!H2:H)'],
    ['Depop Sales', '=SUMIF(Orders!B2:B,"Depop",Orders!H2:H)'],
    ['Etsy Sales', '=SUMIF(Orders!B2:B,"Etsy",Orders!H2:H)'],
    ['eBay Sales', '=SUMIF(Orders!B2:B,"eBay",Orders!H2:H)'],
    ['Estimated Tax Reserve', '=Taxes!B7'],
  ],
  'All Items': [
    ['Item #','Product Name','Condition','Size','Item Description','Purchase Price','Purchase Date','Purchase Platform / Store','Listed?','Sold?','Sold On','Gross Sale Price','Fees','Shipping Cost','Net Profit','Sale Date','Box Letter','Bag Number'],
    ['=SEQUENCE(999)'],
  ],
  Orders: [['Sale Date','Platform','Order ID','Product Name','Quantity','Size','Unit Price','Sale Total','Buyer','Source Email ID','Base Item Cost','Paper & Ink','Packaging Cost','Total Cost','Estimated Profit','Source URL']],
  Expenses: [['Date','Category','Description','Amount','Deductible %','Deductible Amount','Source','Notes','Receipt ID']],
  'Inventory Costs': [
    ['Category','Item Name','Size','Base Item Cost','Paper & Ink','Packaging Cost','Total Unit Cost','Quantity On Hand','Low Stock Level','Notes'],
    ['Frame','Framed Print','4x4',1.00,0.09,0.40,'=SUM(D2:F2)',0,5,'Default art cost'],
    ['Frame','Framed Print','4x6',1.25,0.09,0.40,'=SUM(D3:F3)',0,5,'Default art cost'],
    ['Frame','Framed Print','5x7',1.50,0.09,0.40,'=SUM(D4:F4)',0,5,'Default art cost'],
    ['Frame','Framed Print','8x8',2.00,0.09,0.40,'=SUM(D5:F5)',0,5,'Default art cost'],
    ['Frame','Framed Print','8x10',2.00,0.09,0.40,'=SUM(D6:F6)',0,5,'Default art cost'],
    ['Frame','Framed Print','11x14',3.00,0.09,2.00,'=SUM(D7:F7)',0,5,'Large mailing box'],
  ],
  Taxes: [
    ['ArtFlow Tax Summary'],
    ['Gross Sales', '=SUM(Orders!H2:H)'],
    ['Order Costs', '=SUM(Orders!N2:N)'],
    ['Other Deductible Expenses', '=SUM(Expenses!F2:F)'],
    ['Estimated Net Business Income', '=MAX(0,B2-B3-B4)'],
    ['Tax Set-Aside Rate', 0.30],
    ['Estimated Tax Reserve', '=B5*B6'],
    ['Quarterly Planning Amount', '=B7/4'],
    ['Note', 'Bundles count once using the full Sale Total. This is a planning estimate, not tax advice.'],
  ],
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

    const workspace = await resolveBusinessWorkspace(base44, user.email || '');
    const businesses = await base44.asServiceRole.entities.Business.list('-updated_date', 500);
    const business = businesses.find((item) => item.id === workspace.businessId);
    const body = await req.json().catch(() => ({}));
    const spreadsheetId = String(body?.spreadsheetId || business?.spreadsheet_id || '').trim();
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
    const missing = Object.keys(TAB_VALUES).filter((title) => !existingTitles.has(title));

    if (missing.length) {
      await sheetsFetch(accessToken, `${root}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) }),
      });
    }

    const initialized = [];
    const untouched = [];
    for (const [title, values] of Object.entries(TAB_VALUES)) {
      const read = await sheetsFetch(accessToken, `${root}/values/${encodeURIComponent(title)}!A1:Z3`);
      const rows = Array.isArray(read?.values) ? read.values : [];
      const hasContent = rows.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''));
      if (hasContent) {
        untouched.push(title);
        continue;
      }

      await sheetsFetch(accessToken, `${root}/values/${encodeURIComponent(title)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      initialized.push(title);
    }

    if (business?.id && String(business.spreadsheet_id || '') !== spreadsheetId) {
      await base44.asServiceRole.entities.Business.update(business.id, { spreadsheet_id: spreadsheetId });
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
