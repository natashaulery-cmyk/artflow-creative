// Shared inventory import logic. Reads a Google Sheets tab and upserts
// InventoryCost records by size, scoped to the current user (the function
// passes a user-scoped base44 client, so creates/updates are owned by them).
import { calculateUnitCost } from './orderCost.js';

export async function importInventory(base44, accessToken, spreadsheetId, sheetName) {
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

  const existing = await base44.entities.InventoryCost.list('size', 200);
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
    await base44.entities.InventoryCost.bulkCreate(batch);
    imported += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    const batch = toUpdate.slice(i, i + 200);
    await base44.entities.InventoryCost.bulkUpdate(batch);
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