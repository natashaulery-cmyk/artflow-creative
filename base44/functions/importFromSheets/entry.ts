import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';

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

    const headers = rows[0].map((h) => String(h || '').toLowerCase().trim());
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
      const d = new Date(v);
      if (isNaN(d)) return new Date().toISOString().slice(0, 10);
      return d.toISOString().slice(0, 10);
    };

    let imported = 0;
    let skipped = 0;

    for (let r = 1; r < rows.length; r++) {
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

      await base44.asServiceRole.entities.Order.create({
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
      imported++;
    }

    return Response.json({ imported, skipped, total: rows.length - 1 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}