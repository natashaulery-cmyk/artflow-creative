import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const SHEETS = ['Expenses', 'Deductions', '💸 Expenditures / Materials'];

const lower = (value = '') => String(value || '').trim().toLowerCase();
const num = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/[$,%]/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
};
const isoDate = (value, dayFirst = false) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 20000 && serial < 100000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const useDayFirst = first > 12 || (second <= 12 && dayFirst);
    const day = useDayFirst ? first : second;
    const month = useDayFirst ? second : first;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const normalizeText = (value = '') => lower(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const headerMap = (row = []) => {
  const out = {};
  row.forEach((cell, index) => {
    const key = lower(cell);
    if (key) out[key] = index;
  });
  return out;
};
const findIndex = (headers, names) => {
  for (const name of names) {
    const exact = Object.keys(headers).find((key) => key === name || key.includes(name));
    if (exact) return headers[exact];
  }
  return -1;
};
const mapCategory = (raw) => {
  const s = lower(raw);
  if (/art|craft|material/.test(s)) return 'Art Materials & Supplies';
  if (/paper|media/.test(s)) return 'Paper & Print Media';
  if (/ink|cartridge|printhead/.test(s)) return 'Ink & Printing Supplies';
  if (/frame|display/.test(s)) return 'Frames & Display';
  if (/packag|mailer|envelope|sleeve|box|label|tape/.test(s)) return 'Packaging & Shipping Supplies';
  if (/camera|photo|lens|lighting|tripod/.test(s)) return 'Photography Equipment';
  if (/printer|equipment|tool|tablet/.test(s)) return 'Equipment & Tools';
  if (/software|subscription|app/.test(s)) return 'Software & Subscriptions';
  if (/phone|internet/.test(s)) return 'Phone / Internet';
  if (/advert|marketing/.test(s)) return 'Advertising & Marketing';
  if (/postage|shipping/.test(s)) return 'Shipping & Postage';
  if (/office/.test(s)) return 'Office & Business';
  return 'Other Business Expense';
};

async function fetchRows(spreadsheetId, sheetName, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 400 || res.status === 404) return [];
  if (!res.ok) throw new Error(`Google Sheets ${sheetName} read failed: ${await res.text()}`);
  return (await res.json()).values || [];
}

function parseRows(rows, sheetName) {
  const headerIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const cells = row.map((cell) => lower(cell));
    const hasDate = cells.some((cell) => cell === 'date' || cell.includes('purchase date'));
    const hasDescription = cells.some((cell) => cell.includes('description') || cell === 'item');
    const hasAmount = cells.some((cell) => cell === 'amount' || cell.includes('total') || cell.includes('cost price') || cell.includes('purchase price'));
    return hasDate && hasDescription && hasAmount;
  });
  if (headerIndex < 0) return [];
  const headers = headerMap(rows[headerIndex]);
  const idx = {
    date: findIndex(headers, ['purchase date', 'date']),
    category: findIndex(headers, ['category']),
    description: findIndex(headers, ['description', 'item', 'vendor']),
    amount: findIndex(headers, ['cost price', 'purchase price', 'amount', 'total']),
    deductiblePercent: findIndex(headers, ['deductible %', 'deductible percent']),
    deductibleAmount: findIndex(headers, ['deductible amount']),
    source: findIndex(headers, ['source', 'vendor', 'merchant']),
    notes: findIndex(headers, ['notes', 'note']),
    receiptId: findIndex(headers, ['receipt id', 'receipt_id', 'transaction id', 'transaction_id']),
  };
  const parsed = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const date = isoDate(idx.date >= 0 ? row[idx.date] : null, sheetName === '💸 Expenditures / Materials');
    const description = String(idx.description >= 0 ? row[idx.description] || '' : '').trim();
    const amount = num(idx.amount >= 0 ? row[idx.amount] : null, 0);
    if (!date || !description || !(amount > 0)) continue;
    const pctRaw = num(idx.deductiblePercent >= 0 ? row[idx.deductiblePercent] : null, 100);
    const deductiblePercent = Math.max(0, Math.min(100, pctRaw <= 1 ? pctRaw * 100 : pctRaw));
    const deductibleAmount = idx.deductibleAmount >= 0 && row[idx.deductibleAmount] !== undefined
      ? num(row[idx.deductibleAmount], amount * deductiblePercent / 100)
      : amount * deductiblePercent / 100;
    const source = String(idx.source >= 0 ? row[idx.source] || 'Google Sheets' : 'Google Sheets').trim();
    const rawReceiptId = String(idx.receiptId >= 0 ? row[idx.receiptId] || '' : '').trim();
    parsed.push({
      date,
      category: mapCategory(idx.category >= 0 ? row[idx.category] : ''),
      description,
      amount,
      deductible_percent: deductiblePercent,
      deductible_amount: +deductibleAmount.toFixed(2),
      source: source || 'Google Sheets',
      notes: String(idx.notes >= 0 ? row[idx.notes] || '' : '').trim() || `Imported from ${sheetName}`,
      receipt_id: rawReceiptId ? `sheet:${rawReceiptId}` : `sheet:${sheetName}:${rowIndex + 1}:${date}:${amount.toFixed(2)}`,
      sync_source: 'google_sheet_fallback',
      archived: false,
    });
  }
  return parsed;
}

function sameExpense(a, b) {
  const receiptA = String(a?.receipt_id || '');
  const receiptB = String(b?.receipt_id || '');
  if (receiptA && receiptB && receiptA === receiptB) return true;
  if (String(a?.date || '') !== String(b?.date || '')) return false;
  if (Number(a?.amount || 0).toFixed(2) !== Number(b?.amount || 0).toFixed(2)) return false;
  const left = normalizeText(a?.description || a?.source || '');
  const right = normalizeText(b?.description || b?.source || '');
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const spreadsheetId = String(body?.spreadsheetId || user.spreadsheet_id || user.data?.spreadsheet_id || '').trim();
    if (!spreadsheetId) {
      return Response.json({ available: true, connected: false, needs_sheet: true, message: 'Add your Google Sheet in Account to use spreadsheet expense backup.' });
    }

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(GOOGLE_SHEETS_CONNECTOR_ID));
    } catch {
      return Response.json({ available: true, connected: false, needs_connection: true, message: 'Connect Google Sheets in Account to use spreadsheet expense backup.' });
    }

    const workspace = await resolveBusinessWorkspace(base44, user.email || '');
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

    const [sheetRows, allExpenses] = await Promise.all([
      Promise.all(SHEETS.map(async (sheetName) => ({ sheetName, rows: await fetchRows(spreadsheetId, sheetName, accessToken) }))),
      base44.asServiceRole.entities.Expense.list('-date', 5000),
    ]);

    const candidates = sheetRows.flatMap(({ sheetName, rows }) => parseRows(rows, sheetName));
    const existing = allExpenses.filter((expense) =>
      !expense.archived && (expense.business_id === businessId || (!expense.business_id && expense.created_by_id === ownerId))
    );

    let created = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      if (existing.some((expense) => sameExpense(expense, candidate))) {
        skipped += 1;
        continue;
      }
      const made = await base44.asServiceRole.entities.Expense.create({
        ...candidate,
        business_id: businessId,
        access_emails: accessEmails,
        created_by_id: ownerId,
      });
      existing.push(made || candidate);
      created += 1;
    }

    return Response.json({
      available: true,
      connected: true,
      found: candidates.length,
      created,
      skipped,
      message: created
        ? `Spreadsheet backup added ${created} missing expense${created === 1 ? '' : 's'} and skipped ${skipped} already in ArtFlow.`
        : `Spreadsheet backup checked ${candidates.length} row${candidates.length === 1 ? '' : 's'}; nothing missing.`,
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
