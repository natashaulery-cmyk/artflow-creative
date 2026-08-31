import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const normalize = (value = '') => String(value || '').trim().toLowerCase();
const clean = (value = '') => String(value || '').trim();

const TAB_VALUES = {
  Dashboard: [
    ['ArtFlow Creative Dashboard'],
    ['Statistics Month', 'All Months'],
    ['Total Sales', '=IF(B2="All Months",SUM(Orders!H2:H),SUMIFS(Orders!H2:H,Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Total Expenses', '=IF(B2="All Months",SUM(Expenses!D2:D),SUMIFS(Expenses!D2:D,Expenses!A2:A,">="&EOMONTH(B2,-1)+1,Expenses!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Estimated Profit', '=IF(B2="All Months",SUM(Orders!O2:O)-SUM(Expenses!F2:F),SUMIFS(Orders!O2:O,Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0))-SUMIFS(Expenses!F2:F,Expenses!A2:A,">="&EOMONTH(B2,-1)+1,Expenses!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Vinted Sales', '=IF(B2="All Months",SUMIF(Orders!B2:B,"Vinted",Orders!H2:H),SUMIFS(Orders!H2:H,Orders!B2:B,"Vinted",Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Depop Sales', '=IF(B2="All Months",SUMIF(Orders!B2:B,"Depop",Orders!H2:H),SUMIFS(Orders!H2:H,Orders!B2:B,"Depop",Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Etsy Sales', '=IF(B2="All Months",SUMIF(Orders!B2:B,"Etsy",Orders!H2:H),SUMIFS(Orders!H2:H,Orders!B2:B,"Etsy",Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['eBay Sales', '=IF(B2="All Months",SUMIF(Orders!B2:B,"eBay",Orders!H2:H),SUMIFS(Orders!H2:H,Orders!B2:B,"eBay",Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Order Count', '=IF(B2="All Months",COUNTA(Orders!A2:A),COUNTIFS(Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Expense Count', '=IF(B2="All Months",COUNTA(Expenses!A2:A),COUNTIFS(Expenses!A2:A,">="&EOMONTH(B2,-1)+1,Expenses!A2:A,"<="&EOMONTH(B2,0)))'],
    ['Estimated Tax Reserve', '=IF(B2="All Months",Taxes!B7,MAX(0,B3-SUMIFS(Orders!N2:N,Orders!A2:A,">="&EOMONTH(B2,-1)+1,Orders!A2:A,"<="&EOMONTH(B2,0))-SUMIFS(Expenses!F2:F,Expenses!A2:A,">="&EOMONTH(B2,-1)+1,Expenses!A2:A,"<="&EOMONTH(B2,0)))*Taxes!B6)'],
  ],
  'Month Lists': [
    ['All Months'],
    ['=IFERROR(SORT(UNIQUE(FILTER({EOMONTH(Orders!A2:A,0);EOMONTH(Expenses!A2:A,0)},{Orders!A2:A;Expenses!A2:A}<>"")),1,FALSE),"")'],
  ],
  'All Items': [
    ['Item #','Product Name','Condition','Size','Item Description','Purchase Price','Purchase Date','Purchase Platform / Store','Listed?','Sold?','Sold On','Gross Sale Price','Fees','Shipping Cost','Net Profit','Sale Date','Box Letter','Bag Number'],
    ['=SEQUENCE(999)'],
  ],
  Orders: [['Sale Date','Platform','Order ID','Product Name','Quantity','Size','Unit Price','Sale Total','Buyer','Source Email ID','Base Item Cost','Paper & Ink','Packaging Cost','Total Cost','Estimated Profit','Source URL']],
  Expenses: [['Date','Category','Description','Amount','Deductible %','Deductible Amount','Source','Notes','Receipt ID']],
  'Inventory Costs': [
    ['Category','Item Name','Size','Base Item Cost','Paper & Ink','Packaging Cost','Total Unit Cost','Quantity On Hand','Low Stock Level','Notes'],
    ['Frame','Framed Print','4x4',1.00,0.09,0.40,'=SUM(D2:F2)',0,5,'Starter cost — edit to match your supplies'],
    ['Frame','Framed Print','4x6',1.25,0.09,0.40,'=SUM(D3:F3)',0,5,'Starter cost — edit to match your supplies'],
    ['Frame','Framed Print','5x7',1.50,0.09,0.40,'=SUM(D4:F4)',0,5,'Starter cost — edit to match your supplies'],
    ['Frame','Framed Print','8x8',2.00,0.09,0.40,'=SUM(D5:F5)',0,5,'Starter cost — edit to match your supplies'],
    ['Frame','Framed Print','8x10',2.00,0.09,0.40,'=SUM(D6:F6)',0,5,'Starter cost — edit to match your supplies'],
    ['Frame','Framed Print','11x14',3.00,0.09,2.00,'=SUM(D7:F7)',0,5,'Starter large-mailer cost — edit as needed'],
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

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function getLegacyProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
       WHERE auth_user_id = $1 OR lower(email) = $2
       ORDER BY CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END, created_date NULLS LAST
       LIMIT 1`,
    [user.id, email]
  );
  let profile = result.rows[0] || null;
  if (profile && !profile.auth_user_id) {
    await client.query(`UPDATE artflow.legacy_users SET auth_user_id=$2 WHERE base44_id=$1`, [profile.base44_id, user.id]);
    profile.auth_user_id = user.id;
  }
  return profile;
}

function sheetIdFromBusiness(business, profile) {
  const d = business?.data || {};
  return clean(
    d.spreadsheet_id || d.spreadsheetId || d?.data?.spreadsheet_id ||
    profile?.spreadsheet_id || profile?.data?.spreadsheet_id || ''
  );
}

async function getOrCreateBusiness(client, profile, user) {
  const email = normalize(user?.email);
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const accessible = result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    const d = row.data || {};
    const emails = [
      row.primary_email,
      d.primary_email,
      ...(Array.isArray(d.member_emails) ? d.member_emails : []),
      ...(Array.isArray(d.sales_emails) ? d.sales_emails : []),
      ...(Array.isArray(d.expense_emails) ? d.expense_emails : []),
    ].map(normalize).filter(Boolean);
    return email && emails.includes(email);
  });

  let business = accessible.find((row) => row.base44_id === active) || accessible[0] || null;
  if (business) return business;

  const id = crypto.randomUUID();
  const name = `${clean(user?.name) || 'My'} Art Business`;
  const data = {
    primary_email: user.email,
    member_emails: [user.email],
    sales_emails: [user.email],
    expense_emails: [user.email],
  };
  await client.query(
    `INSERT INTO artflow.businesses (base44_id, name, primary_email, data)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [id, name, user.email, JSON.stringify(data)]
  );
  return { base44_id: id, name, primary_email: user.email, data };
}

async function getGoogleAccessToken(req) {
  const headers = fromNodeHeaders(req.headers);
  const accounts = await auth.api.listUserAccounts({ headers });
  const google = (accounts || []).find((account) => account.providerId === 'google');
  if (!google?.id) {
    const error = new Error('Connect Google Sheets first.');
    error.code = 'GOOGLE_NOT_LINKED';
    throw error;
  }
  const token = await auth.api.getAccessToken({ headers, body: { accountId: google.id } });
  if (!token?.accessToken) {
    const error = new Error('Reconnect Google so Art Flow can create your tracker.');
    error.code = 'GOOGLE_RECONNECT';
    throw error;
  }
  return token.accessToken;
}

async function googleRequest(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Google Sheets error ${response.status}`);
    error.code = response.status === 401 || response.status === 403 ? 'GOOGLE_RECONNECT' : 'SHEETS_ERROR';
    throw error;
  }
  return data;
}

async function createSpreadsheet(accessToken, businessName) {
  const titles = Object.keys(TAB_VALUES);
  const created = await googleRequest(accessToken, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: `ArtFlow Creative Tracker - ${businessName || 'My Business'}` },
      sheets: titles.map((title) => ({
        properties: {
          title,
          gridProperties: { rowCount: title === 'All Items' ? 1200 : 1000, columnCount: 26, frozenRowCount: 1 },
        },
      })),
    }),
  });

  const spreadsheetId = created.spreadsheetId;
  if (!spreadsheetId) throw new Error('Google did not return a spreadsheet ID.');

  const valueData = Object.entries(TAB_VALUES).map(([title, values]) => ({
    range: `${title}!A1`,
    majorDimension: 'ROWS',
    values,
  }));
  await googleRequest(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: valueData }),
  });

  const sheetProps = created.sheets || [];
  const sheetByTitle = Object.fromEntries(
    sheetProps.map((sheet) => [sheet?.properties?.title, sheet?.properties?.sheetId]).filter(([, id]) => id != null)
  );
  const headerRequests = [];
  for (const sheet of sheetProps) {
    const sheetId = sheet?.properties?.sheetId;
    const title = sheet?.properties?.title;
    if (sheetId == null) continue;
    headerRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.92, green: 0.90, blue: 0.98 },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat.bold)',
      },
    });
    headerRequests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: title === 'All Items' ? 18 : 16 },
      },
    });
  }
  const dashboardSheetId = sheetByTitle.Dashboard;
  const monthListSheetId = sheetByTitle['Month Lists'];
  if (dashboardSheetId != null && monthListSheetId != null) {
    headerRequests.push(
      {
        setDataValidation: {
          range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
          rule: {
            condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: "='Month Lists'!$A$1:$A$1000" }] },
            strict: true,
            showCustomUi: true,
          },
        },
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmmm yyyy' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
      {
        repeatCell: {
          range: { sheetId: monthListSheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmmm yyyy' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId: monthListSheetId, hidden: true },
          fields: 'hidden',
        },
      }
    );
  }

  if (headerRequests.length) {
    await googleRequest(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: headerRequests }),
    });
  }

  return spreadsheetId;
}

async function saveSpreadsheetId(client, business, profile, spreadsheetId) {
  const nextData = {
    ...(business.data || {}),
    spreadsheet_id: spreadsheetId,
    spreadsheet_created_by_artflow: true,
  };
  await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [business.base44_id, JSON.stringify(nextData)]);

  if (profile?.base44_id) {
    try {
      const profileData = { ...(profile.data || {}), spreadsheet_id: spreadsheetId };
      await client.query(`UPDATE artflow.legacy_users SET data=$2::jsonb WHERE base44_id=$1`, [profile.base44_id, JSON.stringify(profileData)]);
    } catch {
      // The business workspace is authoritative; legacy profile update is best-effort only.
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const profile = await getLegacyProfile(client, session.user);
    const business = await getOrCreateBusiness(client, profile, session.user);
    const existingId = sheetIdFromBusiness(business, profile);

    let googleConnected = false;
    try {
      const accounts = await auth.api.listUserAccounts({ headers: fromNodeHeaders(req.headers) });
      googleConnected = (accounts || []).some((account) => account.providerId === 'google');
    } catch {}

    if (req.method === 'GET') {
      return res.status(200).json({
        connected: Boolean(existingId),
        spreadsheet_id: existingId || null,
        spreadsheet_url: existingId ? `https://docs.google.com/spreadsheets/d/${existingId}/edit` : null,
        google_connected: googleConnected,
      });
    }

    if (existingId) {
      return res.status(200).json({
        ok: true,
        already_exists: true,
        spreadsheet_id: existingId,
        spreadsheet_url: `https://docs.google.com/spreadsheets/d/${existingId}/edit`,
        message: 'Your ArtFlow Creative Tracker is already connected.',
      });
    }

    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(req);
    } catch (error) {
      return res.status(409).json({ error: error.message, code: error.code || 'GOOGLE_NOT_LINKED' });
    }

    const spreadsheetId = await createSpreadsheet(accessToken, business.name || 'My Business');
    await saveSpreadsheetId(client, business, profile, spreadsheetId);

    return res.status(201).json({
      ok: true,
      created: true,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      message: 'Your ArtFlow Creative Tracker was created and connected automatically.',
    });
  } catch (error) {
    console.error('create tracker error', error?.message || error);
    const status = error?.code === 'GOOGLE_RECONNECT' ? 409 : 500;
    return res.status(status).json({ error: error?.message || 'Could not create the tracker.', code: error?.code || 'CREATE_TRACKER_ERROR' });
  } finally {
    client.release();
  }
}
