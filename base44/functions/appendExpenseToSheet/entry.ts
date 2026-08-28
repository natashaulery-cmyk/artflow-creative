import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Appends a newly created Expense record as a row in the "Expenses" tab of the
// Google Sheets tracker. Config (spreadsheet) is hardcoded server-side. Invoked
// by the "Sync Expenses to Sheets" workflow (payload { workflow: true, expense_id })
// or manually by an admin for testing.
const SPREADSHEET_ID = '1_GRVGcbkKvgB1B7FiQkCJxkZaQaegYPtx35i7dhav4k';
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
    const reqBody = await req.json().catch(() => ({}));

    // Workflow path carries no user, so skip the admin gate.
    if (reqBody?.workflow !== true) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const expenseId = reqBody?.expense_id;
    if (!expenseId) {
      return Response.json({ error: 'expense_id required' }, { status: 400 });
    }

    const expense = await base44.asServiceRole.entities.Expense.get(expenseId);
    if (!expense) {
      return Response.json({ error: 'Expense not found' }, { status: 404 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Ensure the Expenses tab exists; create it with a header row if missing.
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`,
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
      const addRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
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
      if (!addRes.ok) {
        return Response.json(
          { error: 'Could not create tab: ' + (await addRes.text()) },
          { status: 502 }
        );
      }
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
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
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
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