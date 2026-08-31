import { getGoogleSheetsAccessToken } from './sheetsConnector.js';

const ORDER_SHEET = 'Orders';
const EXPENSE_SHEET = 'Expenses';

const normalize = (value = '') => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const money = (value) => Number(value || 0).toFixed(2);

async function readRows(spreadsheetId, sheetName, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}!A:Z?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Could not read ${sheetName} spreadsheet tab: ${await res.text()}`);
  return (await res.json())?.values || [];
}

async function appendRows(spreadsheetId, sheetName, accessToken, rows) {
  if (!rows.length) return 0;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Could not append to ${sheetName} spreadsheet tab: ${await res.text()}`);
  return rows.length;
}

const orderKey = (order = {}) => {
  const sourceEmailId = String(order.source_email_id || '').trim();
  if (sourceEmailId) return `email:${sourceEmailId}`;
  const orderId = String(order.order_id || '').trim();
  if (orderId) return `order:${normalize(order.platform)}:${orderId}:${normalize(order.product_name)}`;
  return `sale:${normalize(order.platform)}:${order.sale_date || ''}:${money(order.sale_total)}:${normalize(order.product_name)}`;
};

const expenseKey = (expense = {}) => {
  const receiptId = String(expense.receipt_id || '').trim();
  if (receiptId) return `receipt:${receiptId}`;
  return `expense:${expense.date || ''}:${money(expense.amount)}:${normalize(expense.description || expense.source)}`;
};

export async function appendOrdersToMasterSheet(base44, workspace, orders = []) {
  const spreadsheetId = String(workspace?.spreadsheetId || '').trim();
  if (!spreadsheetId || !orders.length) return { available: !!spreadsheetId, appended: 0, skipped: 0 };

  const accessToken = await getGoogleSheetsAccessToken(base44);
  const rows = await readRows(spreadsheetId, ORDER_SHEET, accessToken);
  const existing = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const candidate = {
      sale_date: row[0] || '',
      platform: row[1] || '',
      order_id: row[2] || '',
      product_name: row[3] || '',
      sale_total: row[7] || '',
      source_email_id: row[9] || '',
    };
    existing.add(orderKey(candidate));
  }

  const pending = [];
  let skipped = 0;
  for (const order of orders) {
    const key = orderKey(order);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    pending.push([
      order.sale_date || '',
      order.platform || '',
      order.order_id || '',
      order.product_name || '',
      Number(order.quantity || 1),
      order.size || 'Unknown',
      Number(order.unit_price || 0),
      Number(order.sale_total || 0),
      order.buyer || '',
      order.source_email_id || '',
      Number(order.base_item_cost || 0),
      Number(order.paper_ink_cost || 0),
      Number(order.packaging_cost || 0),
      Number(order.total_cost || 0),
      Number(order.estimated_profit || 0),
      order.source_url || '',
    ]);
  }

  const appended = await appendRows(spreadsheetId, ORDER_SHEET, accessToken, pending);
  return { available: true, appended, skipped };
}

export async function appendExpensesToMasterSheet(base44, workspace, expenses = []) {
  const spreadsheetId = String(workspace?.spreadsheetId || '').trim();
  if (!spreadsheetId || !expenses.length) return { available: !!spreadsheetId, appended: 0, skipped: 0 };

  const accessToken = await getGoogleSheetsAccessToken(base44);
  const rows = await readRows(spreadsheetId, EXPENSE_SHEET, accessToken);
  const existing = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    existing.add(expenseKey({
      date: row[0] || '',
      description: row[2] || '',
      amount: row[3] || '',
      source: row[6] || '',
      receipt_id: row[8] || '',
    }));
  }

  const pending = [];
  let skipped = 0;
  for (const expense of expenses) {
    const key = expenseKey(expense);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    pending.push([
      expense.date || '',
      expense.category || 'Other Business Expense',
      expense.description || '',
      Number(expense.amount || 0),
      Number(expense.deductible_percent ?? 100),
      Number(expense.deductible_amount ?? expense.amount ?? 0),
      expense.source || '',
      expense.notes || '',
      expense.receipt_id || '',
    ]);
  }

  const appended = await appendRows(spreadsheetId, EXPENSE_SHEET, accessToken, pending);
  return { available: true, appended, skipped };
}
