// Shared inventory import logic. Reads the business spreadsheet and upserts
// InventoryCost records inside the active business workspace.
import { calculateUnitCost } from './orderCost.js';

export async function importInventory(base44, accessToken, spreadsheetId, sheetName, workspace = {}) {
  let tab = sheetName;
  if (!tab) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const tabs = (meta.sheets || []).map((s) => s.properties.title);
    tab = tabs.find((t) => /^inventory costs?$/i.test(t))
      || tabs.find((t) => /inventory|stock|cost|pieces/i.test(t))
      || tabs.find((t) => /^all items$/i.test(t))
      || tabs[0];
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
    name: colIndex(['name', 'item', 'piece', 'title', 'product', 'description']),
    category: colIndex(['category', 'type', 'kind']),
    image: colIndex(['image', 'photo', 'picture', 'image_url', 'link', 'url']),
    size: colIndex(['size', 'print', 'dimensions']),
    base: colIndex(['purchase price', 'base', 'base_item', 'item cost', 'cost', 'frame']),
    paperInk: colIndex(['paper', 'ink', 'paper_ink', 'material']),
    packaging: colIndex(['packaging', 'pack', 'mail']),
    qty: colIndex(['quantity', 'qty', 'on hand', 'stock', 'count']),
    low: colIndex(['low', 'reorder', 'threshold']),
    sold: colIndex(['sold?', 'sold']),
  };

  const num = (v, fallback = 0) => {
    const n = Number(String(v || '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? fallback : n;
  };

  const validCats = ['Frame', 'Print', 'Supply', 'Packaging', 'Other'];
  const ownerId = workspace?.ownerId || null;
  const businessId = workspace?.businessId || null;
  const accessEmails = workspace?.accessEmails || [];
  const allExisting = await base44.asServiceRole.entities.InventoryCost.list('size', 5000);
  const existing = allExisting.filter((item) =>
    (businessId && item.business_id === businessId)
    || (ownerId && !item.business_id && item.created_by_id === ownerId)
  );
  const inventoryKey = (name, size) => String(size || name || '').trim().toLowerCase();
  const byKey = new Map(existing.map((e) => [inventoryKey(e.name, e.size), e]));

  const toCreate = [];
  const toUpdate = [];
  let skipped = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = idx.name >= 0 ? String(row[idx.name] || '').trim() : '';
    const size = idx.size >= 0 ? String(row[idx.size] || '').trim() : '';
    const key = inventoryKey(name, size);
    if (!key) {
      skipped++;
      continue;
    }
    const catRaw = idx.category >= 0 ? String(row[idx.category] || '').trim() : '';
    const catMatch = validCats.find((c) => c.toLowerCase() === catRaw.toLowerCase());
    const record = {
      base_item_cost: num(idx.base >= 0 ? row[idx.base] : 0),
      paper_ink_cost: idx.paperInk >= 0 ? num(row[idx.paperInk], 0.09) : 0.09,
      packaging_cost: idx.packaging >= 0 ? num(row[idx.packaging], 0.4) : 0.4,
      quantity_on_hand: idx.qty >= 0
        ? num(row[idx.qty])
        : (idx.sold >= 0 && ['true', 'yes', 'sold', '1'].includes(String(row[idx.sold] || '').toLowerCase().trim()) ? 0 : 1),
      low_stock_level: idx.low >= 0 ? num(row[idx.low], 5) : 5,
    };
    if (name) record.name = name;
    if (size) record.size = size;
    record.category = catMatch || 'Frame';
    if (idx.image >= 0 && row[idx.image]) {
      record.image_url = String(row[idx.image]).trim();
    }
    record.total_unit_cost = calculateUnitCost(record);
    if (businessId) record.business_id = businessId;
    if (accessEmails.length) record.access_emails = accessEmails;
    if (ownerId) record.created_by_id = ownerId;

    const prev = byKey.get(key);
    if (prev) {
      toUpdate.push({ id: prev.id, ...record });
    } else {
      toCreate.push(record);
      byKey.set(key, { id: 'pending' });
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