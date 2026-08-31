import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '../../shared/sheetsConnector.js';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { importInventory } from '../../shared/inventorySync.js';
import { importArtPieces } from '../../shared/artPieceSync.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

// Business-scoped Google Sheets import. The business-level spreadsheet is the
// authoritative fallback, with the older per-user spreadsheet ID kept only as
// a compatibility fallback.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reqBody = await req.json().catch(() => ({}));
    const workspace = await resolveBusinessWorkspace(base44, user.email || '');
    const spreadsheetId =
      reqBody?.spreadsheetId || workspace.spreadsheetId || user.spreadsheet_id || user.data?.spreadsheet_id;
    const sheetName = reqBody?.sheetName;
    if (!spreadsheetId) {
      return Response.json(
        { error: 'No spreadsheet connected. Add your Google Sheet in Account.' },
        { status: 400 }
      );
    }

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        GOOGLE_SHEETS_CONNECTOR_ID
      ));
    } catch {
      return Response.json(
        { error: 'Connect your Google Sheets account in Account before importing.' },
        { status: 409 }
      );
    }
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

    if (mode === 'artpieces') {
      return await importArtPieces(base44, accessToken, spreadsheetId, sheetName);
    }

    const range = sheetName ? `${sheetName}!A:Z` : 'A:Z';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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
      if (rows[i].some((c) => /product name|sale date/i.test(String(c || '')))) {
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
    const costIdx = headers.findIndex(
      (h) => /cost/i.test(h) && !/sale/i.test(h)
    );
    const priceIdx = (() => {
      for (const n of ['price', 'sale', 'unit_price', 'amount', 'total']) {
        const i = headers.findIndex((h, j) => j !== costIdx && h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    })();
    const idx = {
      product: colIndex(['product', 'item', 'title', 'name']),
      size: colIndex(['size']),
      quantity: colIndex(['quantity', 'qty']),
      price: priceIdx,
      platform: colIndex(['platform', 'site']),
      date: colIndex(['date', 'sale_date']),
      buyer: colIndex(['buyer', 'customer', 'name']),
      orderId: colIndex(['order', 'order_id', 'id']),
      cost: costIdx,
    };

    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) {
      return Response.json({ error: 'No business workspace found.' }, { status: 400 });
    }

    const [allInventoryCosts, allExisting] = await Promise.all([
      base44.asServiceRole.entities.InventoryCost.list('size', 5000),
      base44.asServiceRole.entities.Order.list('-created_date', 5000),
    ]);
    const inventoryCosts = allInventoryCosts.filter((item) =>
      item.business_id === businessId || (!item.business_id && item.created_by_id === ownerId)
    );
    const existing = allExisting.filter((order) =>
      order.business_id === businessId || (!order.business_id && order.created_by_id === ownerId)
    );
    const dupKey = (p, oid, pn) => `${p}|${oid || ''}|${pn}`;
    const seen = new Set(existing.map((o) => dupKey(o.platform, o.order_id, o.product_name)));

    const normalizeDate = (v) => {
      if (!v) return new Date().toISOString().slice(0, 10);
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
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
      const platformRaw = String(idx.platform >= 0 ? row[idx.platform] || '' : '').trim();
      const platform = /vinted/i.test(platformRaw) ? 'Vinted'
        : /depop/i.test(platformRaw) ? 'Depop'
        : /etsy/i.test(platformRaw) ? 'Etsy'
        : /ebay/i.test(platformRaw) ? 'eBay'
        : null;
      if (!platform) {
        skipped++;
        continue;
      }
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
      let costs = calculateOrderCosts({ quantity, size, unit_price }, inv);
      const costRaw =
        idx.cost >= 0 ? String(row[idx.cost] || '').replace(/[^0-9.]/g, '') : '';
      if (idx.cost >= 0 && costRaw && Number(costRaw) > 0) {
        const manualCost = Number(costRaw);
        costs = {
          ...costs,
          base_item_cost: 0,
          paper_ink_cost: 0,
          packaging_cost: 0,
          total_cost: manualCost,
          estimated_profit: +(costs.sale_total - manualCost).toFixed(2),
        };
      }

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
        business_id: businessId,
        access_emails: accessEmails,
        created_by_id: ownerId,
        sync_source: 'google_sheet_fallback',
        archived: false,
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