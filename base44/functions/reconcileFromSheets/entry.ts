import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const ORDER_SHEET = 'Orders';
const DEDUCTIONS_SHEET = 'Deductions';

const num = (v, fallback = 0) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[$,%]/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
};

const isoDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 20000 && serial < 100000) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + serial * 86400000).toISOString().slice(0, 10);
    }
  }

  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const headerMap = (row = []) => {
  const out = {};
  row.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) out[key] = i;
  });
  return out;
};

const mapExpenseCategory = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (s.includes('inventory') || s.includes('frame')) return 'Inventory / Frames';
  if (s.includes('postage') || s.includes('shipping')) return 'Shipping';
  if (s.includes('equipment') || s.includes('printer')) return 'Equipment';
  if (s.includes('software') || s.includes('subscription')) return 'Software & Subscriptions';
  if (s.includes('office')) return 'Office Expense';
  if (s.includes('supply')) return 'Printing Supplies';
  if (s.includes('phone') || s.includes('internet')) return 'Phone / Internet';
  if (s.includes('advert')) return 'Advertising';
  if (s.includes('packag')) return 'Packaging';
  return 'Other';
};

const fetchValues = async (spreadsheetId, sheetName, accessToken) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google Sheets ${sheetName} read failed: ${await res.text()}`);
  const data = await res.json();
  return data.values || [];
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Spreadsheet reconciliation is available to the app owner only.' }, { status: 403 });
    }

    const spreadsheetId = user.spreadsheet_id || user.data?.spreadsheet_id;
    if (!spreadsheetId) {
      return Response.json({ error: 'No spreadsheet is saved on this account.' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Fetch and validate everything before changing app data.
    const [orderRows, deductionRows] = await Promise.all([
      fetchValues(spreadsheetId, ORDER_SHEET, accessToken),
      fetchValues(spreadsheetId, DEDUCTIONS_SHEET, accessToken),
    ]);

    const orderHeaderIndex = orderRows.findIndex((r) =>
      Array.isArray(r) && r.some((c) => /sale date/i.test(String(c || ''))) && r.some((c) => /product name/i.test(String(c || '')))
    );
    if (orderHeaderIndex < 0) throw new Error('Could not find the Orders header row.');
    const oh = headerMap(orderRows[orderHeaderIndex]);
    const oi = (name) => oh[name.toLowerCase()];

    const orders = [];
    for (const row of orderRows.slice(orderHeaderIndex + 1)) {
      const product = row[oi('product name')];
      const date = isoDate(row[oi('sale date')]);
      if (!product || !date) continue;

      const platformRaw = String(row[oi('platform')] || 'Vinted').trim();
      const platform = /depop/i.test(platformRaw) ? 'Depop' : 'Vinted';
      const quantity = num(row[oi('quantity')], 1) || 1;
      const unitPrice = num(row[oi('unit price')]);
      const saleTotal = num(row[oi('sale total')], quantity * unitPrice);
      const totalCost = num(row[oi('total cost')], 0);

      orders.push({
        sale_date: date,
        platform,
        order_id: String(row[oi('order id')] || ''),
        product_name: String(product),
        quantity,
        size: String(row[oi('size')] || ''),
        unit_price: unitPrice,
        sale_total: saleTotal,
        buyer: String(row[oi('buyer')] || ''),
        source_email_id: String(row[oi('source email id')] || ''),
        base_item_cost: num(row[oi('base item cost')], 0),
        paper_ink_cost: num(row[oi('paper & ink')], 0),
        packaging_cost: num(row[oi('packaging cost')], 0),
        total_cost: totalCost,
        // The tracker Summary defines profit as Sale Total minus Total Cost.
        // Some spreadsheet rows intentionally leave Estimated Profit blank,
        // so calculate it from those two source-of-truth columns here.
        estimated_profit: +(saleTotal - totalCost).toFixed(2),
      });
    }
    if (!orders.length) throw new Error('No valid order rows were found in the spreadsheet.');

    const deductionHeaderIndex = deductionRows.findIndex((r) =>
      Array.isArray(r) && r.some((c) => /^date$/i.test(String(c || '').trim())) && r.some((c) => /deductible amount/i.test(String(c || '')))
    );
    if (deductionHeaderIndex < 0) throw new Error('Could not find the Deductions header row.');
    const dh = headerMap(deductionRows[deductionHeaderIndex]);
    const di = (name) => dh[name.toLowerCase()];

    const expenses = [];
    for (const row of deductionRows.slice(deductionHeaderIndex + 1)) {
      const date = isoDate(row[di('date')]);
      const description = row[di('description')];
      if (!date || !description) continue;
      const pctRaw = num(row[di('deductible %')], 0);
      const deductiblePercent = pctRaw <= 1 ? pctRaw * 100 : pctRaw;
      expenses.push({
        date,
        category: mapExpenseCategory(row[di('category')]),
        description: String(description),
        amount: num(row[di('amount')]),
        deductible_percent: deductiblePercent,
        deductible_amount: num(row[di('deductible amount')]),
        source: 'Google Sheets',
        notes: `Imported from ${DEDUCTIONS_SHEET}`,
      });
    }

    // Exact rebuild for this signed-in owner. This removes demo rows, duplicate
    // email imports, and bad historical dates so the app matches the tracker.
    await base44.asServiceRole.entities.Order.deleteMany({ created_by_id: user.id });
    await base44.asServiceRole.entities.Expense.deleteMany({ created_by_id: user.id });

    for (let i = 0; i < orders.length; i += 100) {
      await base44.entities.Order.bulkCreate(orders.slice(i, i + 100));
    }
    for (let i = 0; i < expenses.length; i += 100) {
      await base44.entities.Expense.bulkCreate(expenses.slice(i, i + 100));
    }

    const totals = orders.reduce(
      (a, o) => {
        a.sales += o.sale_total || 0;
        a.costs += o.total_cost || 0;
        a.profit += o.estimated_profit || 0;
        a.items += o.quantity || 0;
        return a;
      },
      { sales: 0, costs: 0, profit: 0, items: 0 }
    );
    const deductions = expenses.reduce((s, e) => s + (e.deductible_amount || 0), 0);

    return Response.json({
      ok: true,
      orders: orders.length,
      expenses: expenses.length,
      totals: {
        sales: +totals.sales.toFixed(2),
        items: totals.items,
        costs: +totals.costs.toFixed(2),
        profit: +totals.profit.toFixed(2),
        deductions: +deductions.toFixed(2),
      },
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
