import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts, calculateUnitCost } from '../../shared/orderCost.js';

// One-time import of historical orders from the existing Google Sheets
// sales tracker. Admin-only. Maps columns by header name, calculates costs
// from InventoryCost records, and dedupes by platform + order_id + product_name.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const reqBody = await req.json().catch(() => ({}));
    const spreadsheetId = reqBody?.spreadsheetId;
    const sheetName = reqBody?.sheetName;
    if (!spreadsheetId) {
      return Response.json({ error: 'spreadsheetId required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const mode = reqBody?.mode || 'orders';

    if (mode === 'discover') {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
      const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!metaRes.ok) {
        return Response.json({ error: 'Sheets API error: ' + (await metaRes.text()) }, { status: 502 });
      }
      const meta = await metaRes.json();
      const tabs = (meta.sheets || []).map((s) => s.properties.title);
      const preview = {};
      for (const tab of tabs) {
        const r = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}!A:Z`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const d = await r.json();
        preview[tab] = (d.values || []).slice(0, 4);
      }
      return Response.json({ tabs, preview });
    }

    if (mode === 'inventory') {
      return await importInventory(base44, accessToken, spreadsheetId, sheetName);
    }

    const range = sheetName ? `${sheetName}!A:Z` : 'A:Z';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      return Response.json(
        { error: 'Sheets API error: ' + (await res.text()) },
        { status: 502 }
      );
    }
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length < 2) {
      return Response.json({ imported: 0, skipped: 0, message: 'Empty sheet' });
    }

    // The sheet has a title row before the real headers — find the header row.
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      if (rows[i].some((c) => /product name|sale date/i.test(String(c || '')))) {
        headerRowIndex = i;
        break;
      }
    }
    const headers = rows[headerRowIndex].map((h) =>
      String(h || '').toLowerCase().trim()
    );
    const colIndex = (names) => {
      for (const n of names) {
        const i = headers.findIndex((h) => h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = {
      product: colIndex(['product', 'item', 'title', 'name']),
      size: colIndex(['size']),
      quantity: colIndex(['quantity', 'qty']),
      price: colIndex(['price', 'sale', 'unit_price', 'amount', 'total']),
      platform: colIndex(['platform', 'site']),
      date: colIndex(['date', 'sale_date']),
      buyer: colIndex(['buyer', 'customer', 'name']),
      orderId: colIndex(['order', 'order_id', 'id']),
    };

    const inventoryCosts = await base44.asServiceRole.entities.InventoryCost.list('size', 100);
    const existing = await base44.asServiceRole.entities.Order.list('-created_date', 5000);
    const dupKey = (p, oid, pn) => `${p}|${oid || ''}|${pn}`;
    const seen = new Set(
      existing.map((o) => dupKey(o.platform, o.order_id, o.product_name))
    );

    const normalizeDate = (v) => {
      if (!v) return new Date().toISOString().slice(0, 10);
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(
          m[2]
        ).padStart(2, '0')}`;
      }
      const d = new Date(s);
      if (isNaN(d)) return new Date().toISOString().slice(0, 10);
      return d.toISOString().slice(0, 10);
    };

    let skipped = 0;
    const toCreate = [];

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      const product = idx.product >= 0 ? row[idx.product] : null;
      if (!product) continue;
      const platformRaw = String(idx.platform >= 0 ? row[idx.platform] || '' : 'Vinted').trim();
      const platform = /depop/i.test(platformRaw) ? 'Depop' : 'Vinted';
      const size = String(idx.size >= 0 ? row[idx.size] || '5x7' : '5x7').trim();
      const quantity = Number(idx.quantity >= 0 ? row[idx.quantity] : 1) || 1;
      const priceRaw = String(idx.price >= 0 ? row[idx.price] || '' : '').replace(/[^0-9.]/g, '');
      const unit_price = Number(priceRaw) || 0;
      const sale_date = normalizeDate(idx.date >= 0 ? row[idx.date] : null);
      const order_id = idx.orderId >= 0 && row[idx.orderId] ? String(row[idx.orderId]) : null;
      const buyer = idx.buyer >= 0 && row[idx.buyer] ? String(row[idx.buyer]) : null;

      const key = dupKey(platform, order_id, String(product));
      if (seen.has(key)) {
        skipped++;
        continue;
      }

      const inv = inventoryCosts.find((i) => i.size === size);
      const costs = calculateOrderCosts({ quantity, size, unit_price }, inv);

      toCreate.push({
        sale_date,
        platform,
        order_id,
        product_name: String(product),
        quantity,
        size,
        unit_price,
        buyer,
        ...costs,
      });
      seen.add(key);
    }

    let imported = 0;
    for (let i = 0; i < toCreate.length; i += 200) {
      const batch = toCreate.slice(i, i + 200);
      await base44.asServiceRole.entities.Order.bulkCreate(batch);
      imported += batch.length;
    }

    return Response.json({
      imported,
      skipped,
      total: rows.length - headerRowIndex - 1,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Import inventory items (print sizes + costs + on-hand quantities) from a
// Google Sheets tab into InventoryCost records, upserting by size.
async function importInventory(base44, accessToken, spreadsheetId, sheetName) {
  // Resolve the tab: explicit name, or the first one matching inventory/stock/cost.
  let tab = sheetName;
  if (!tab) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const tabs = (meta.sheets || []).map((s) => s.properties.title);
    tab = tabs.find((t) => /inventory|stock|cost|pieces/i.test(t)) || tabs[0];
    if (!tab) return Response.json({ error: 'No sheets found' }, { status: 400 });
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}!A:Z`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    return Response.json({ error: 'Sheets API error: ' + (await res.text()) }, { status: 502 });
  }
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length < 2) {
    return Response.json({ imported: 0, skipped: 0, message: 'Empty sheet' });
  }

  // Find the header row (the row containing a "size" column).
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    if (rows[i].some((c) => /size|print|item|piece/i.test(String(c || '')))) {
      headerRowIndex = i;
      break;
    }
  }
  const headers = rows[headerRowIndex].map((h) => String(h || '').toLowerCase().trim());
  const colIndex = (names) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = {
    size: colIndex(['size', 'print', 'dimensions']),
    base: colIndex(['base', 'base_item', 'item cost', 'cost', 'frame']),
    paperInk: colIndex(['paper', 'ink', 'paper_ink', 'material']),
    packaging: colIndex(['packaging', 'pack', 'mail']),
    qty: colIndex(['quantity', 'qty', 'on hand', 'stock', 'count']),
    low: colIndex(['low', 'reorder', 'threshold']),
  };

  const num = (v, fallback = 0) => {
    const n = Number(String(v || '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? fallback : n;
  };

  const existing = await base44.asServiceRole.entities.InventoryCost.list('size', 200);
  const bySize = new Map(existing.map((e) => [String(e.size), e]));

  const toCreate = [];
  const toUpdate = [];
  let skipped = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const sizeRaw = idx.size >= 0 ? row[idx.size] : null;
    if (!sizeRaw || !String(sizeRaw).trim()) {
      skipped++;
      continue;
    }
    const size = String(sizeRaw).trim();
    const record = {
      size,
      base_item_cost: num(idx.base >= 0 ? row[idx.base] : 0),
      paper_ink_cost: idx.paperInk >= 0 ? num(row[idx.paperInk], 0.09) : 0.09,
      packaging_cost: idx.packaging >= 0 ? num(row[idx.packaging], 0.4) : 0.4,
      quantity_on_hand: num(idx.qty >= 0 ? row[idx.qty] : 0),
      low_stock_level: idx.low >= 0 ? num(row[idx.low], 5) : 5,
    };
    record.total_unit_cost = calculateUnitCost(record);

    const prev = bySize.get(size);
    if (prev) {
      toUpdate.push({ id: prev.id, ...record });
    } else {
      toCreate.push(record);
      bySize.set(size, { id: 'pending' });
    }
  }

  let imported = 0;
  for (let i = 0; i < toCreate.length; i += 200) {
    const batch = toCreate.slice(i, i + 200);
    await base44.asServiceRole.entities.InventoryCost.bulkCreate(batch);
    imported += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    const batch = toUpdate.slice(i, i + 200);
    await base44.asServiceRole.entities.InventoryCost.bulkUpdate(batch);
    imported += batch.length;
  }

  return Response.json({
    imported,
    skipped,
    tab,
    created: toCreate.length,
    updated: toUpdate.length,
  });
}