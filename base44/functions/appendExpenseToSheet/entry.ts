import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';

// Expense export. Appends a single expense to the spreadsheet saved on the
// current user's account, using the app's managed Google Sheets connection.
const SHEET_NAME = 'Expenses';
const HEADERS = [
  'Date',
  'Category',
  'Description',
  'Amount',
  'Deductible %',
  'Deductible Amount',
  'Source',
  'Notes',
];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const reqBody = await req.json().catch(() => ({}));
    const expenseId = reqBody?.expense_id;
    if (!expenseId) {
      return Response.json({ error: 'expense_id required' }, { status: 400 });
    }
    const spreadsheetId =
      reqBody?.spreadsheetId || user.spreadsheet_id || user.data?.spreadsheet_id;
    if (!spreadsheetId) {
      return Response.json({ error: 'No spreadsheet connected' }, { status: 400 });
    }

    const expense = await base44.entities.Expense.get(expenseId);
    if (!expense) {
      return Response.json({ error: 'Expense not found' }, { status: 404 });
    }

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        GOOGLE_SHEETS_CONNECTOR_ID
      ));
    } catch {
      return Response.json(
        { error: 'Connect your Google Sheets account in Account before exporting expenses.' },
        { status: 409 }
      );
    }

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      return Response.json(
        { error: 'Sheets API error: ' + (await metaRes.text()) },
        { status: 502 }
      );
    }
    const meta = await metaRes.json();
    const tabs = (meta.sheets || []).map((s) => s.properties.title);
    if (!tabs.includes(SHEET_NAME)) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
          }),
        }
      );
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          SHEET_NAME
        )}!A1:append?valueInputOption=RAW`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [HEADERS] }),
        }
      );
    }

    const row = [
      expense.date || '',
      expense.category || '',
      expense.description || '',
      expense.amount ?? '',
      expense.deductible_percent ?? 100,
      expense.deductible_amount ?? '',
      expense.source || '',
      expense.notes || '',
    ];

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        SHEET_NAME
      )}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      }
    );
    if (!appendRes.ok) {
      return Response.json(
        { error: 'Sheets API error: ' + (await appendRes.text()) },
        { status: 502 }
      );
    }

    return Response.json({ ok: true, appended: true, sheet: SHEET_NAME });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}