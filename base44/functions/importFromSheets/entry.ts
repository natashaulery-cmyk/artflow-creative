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
      return await importInventory(base44, accessToken, spreadsheetId, sheetName, workspace);
    }

    if (mode === 'artpieces') {
      return await importArtPieces(base44, accessToken, spreadsheetId, sheetName);
    }

    // The ArtFlow master template uses styled tab names. Keep compatibility
    // with older trackers that used a plain "Orders" tab.
    const requestedSheet = String(sheetName || '').trim();
    const orderSheetCandidates = Array.from(new Set([
      requestedSheet,
      requestedSheet === 'Orders' || !requestedSheet ? '🛍️ Orders' : '',
      'Orders',
    ].filter(Boolean)));
    let rows = [];
    let resolvedSheetName = '';
    let lastSheetError = '';
    for (const candidate of orderSheetCandidates) {
      const range = `${candidate}!A:Z`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        rows = data.values || [];
        resolvedSheetName = candidate;
        break;
      }
      lastSheetError = await res.text();
      if (res.status !== 400 && res.status !== 404) {
        return Response.json({ error: 'Sheets API error: ' + lastSheetError }, { status: 502 });
      }
    }
    if (!resolvedSheetName) {
      return Response.json({ error: `Could not find the Orders tab in the connected tracker. ${lastSheetError}` }, { status: 502 });
    }
    if (rows.length < 2) {
      return Response.json({ imported: 0, skipped: 0, message: 'Empty sheet' });
    }

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      if (rows[i].some((c) => /what sold|product name|sale date/i.test(String(c || '')))) {
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
    const exactColIndex = (names) => {
      for (const name of names) {
        const i = headers.findIndex((h) => h === name);
        if (i >= 0) return i;
      }
      return -1;
    };
    const costIdx = exactColIndex(['purchase price', 'item cost', 'cost']);
    const priceIdx = exactColIndex(['gross sale price', 'sale price', 'unit price', 'price', 'amount', 'total']);
    const profitIdx = exactColIndex(['net profit', 'estimated profit', 'profit']);
    const feesIdx = exactColIndex(['fees', 'fee']);
    const shippingIdx = exactColIndex(['shipping cost', 'shipping']);
    const soldIdx = exactColIndex(['sold?', 'sold']);
    const idx = {
      product: colIndex(['what sold', 'product', 'item', 'title', 'name']),
      size: colIndex(['size']),
      quantity: colIndex(['quantity', 'qty']),
      price: priceIdx,
      platform: colIndex(['platform', 'site']),
      date: exactColIndex(['sale date', 'sale_date', 'date', 'purchase date']),
      buyer: colIndex(['buyer', 'customer', 'name']),
      // The Exact Style tracker uses # as a display sequence, not a marketplace
      // order id, so only explicit order-id headers are treated as identifiers.
      orderId: exactColIndex(['order id', 'order_id', 'order number', 'order #']),
      cost: costIdx,
      profit: profitIdx,
      fees: feesIdx,
      shipping: shippingIdx,
      sold: soldIdx,
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
    const normalizeProduct = (value = '') => String(value || '')
      .toLowerCase()
      .replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parseMoney = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const cleaned = String(value).replace(/[$,%]/g, '').replace(/,/g, '').trim();
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };
    const normalizeDate = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const first = Number(m[1]);
        const second = Number(m[2]);
        const dayFirst = first > 12;
        const month = dayFirst ? second : first;
        const day = dayFirst ? first : second;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    const fingerprint = (platform, date, product, total) =>
      `${platform}|${date || ''}|${Number(total || 0).toFixed(2)}|${normalizeProduct(product)}`;
    const existingByFingerprint = new Map();
    for (const order of existing) {
      if (order.archived) continue;
      existingByFingerprint.set(
        fingerprint(order.platform, order.sale_date, order.product_name, order.sale_total),
        order
      );
    }
    const usedExistingIds = new Set();
    const seenSheetRows = new Set();

    let skipped = 0;
    const toCreate = [];
    const toUpdate = [];

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const product = idx.product >= 0 ? row[idx.product] : null;
      if (!product) continue;

      if (idx.sold >= 0) {
        const soldValue = String(row[idx.sold] ?? '').trim().toLowerCase();
        if (soldValue && !['true', 'yes', 'y', '1', 'sold'].includes(soldValue)) continue;
      }

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

      const productText = String(product).trim();
      const sizeFromProduct = productText.match(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/i)?.[0]?.replace(/\s+/g, '') || '';
      const size = String(idx.size >= 0 ? row[idx.size] || sizeFromProduct || 'Other' : sizeFromProduct || 'Other').trim();
      const bundleQty = Number(productText.match(/bundle(?:\s+of)?\s+(\d+)/i)?.[1] || 0);
      const quantity = Number(idx.quantity >= 0 ? row[idx.quantity] : bundleQty || 1) || 1;
      const grossSale = parseMoney(idx.price >= 0 ? row[idx.price] : null) || 0;
      if (!(grossSale > 0)) continue;
      const unit_price = +(grossSale / Math.max(1, quantity)).toFixed(8);
      const sale_date = normalizeDate(idx.date >= 0 ? row[idx.date] : null);
      if (!sale_date) continue;
      const order_id = idx.orderId >= 0 && row[idx.orderId] ? String(row[idx.orderId]).trim() : null;
      const buyer = idx.buyer >= 0 && row[idx.buyer] ? String(row[idx.buyer]) : null;

      const inv = inventoryCosts.find((i) => i.size === size);
      let costs = calculateOrderCosts({ quantity, size, unit_price }, inv);
      const purchaseCost = parseMoney(idx.cost >= 0 ? row[idx.cost] : null);
      const fees = parseMoney(idx.fees >= 0 ? row[idx.fees] : null) || 0;
      const shipping = parseMoney(idx.shipping >= 0 ? row[idx.shipping] : null) || 0;
      const sheetProfit = parseMoney(idx.profit >= 0 ? row[idx.profit] : null);
      if (sheetProfit !== null) {
        const totalCost = Math.max(0, +(grossSale - sheetProfit).toFixed(2));
        const baseItemCost = Math.max(0, purchaseCost || 0);
        costs = {
          ...costs,
          sale_total: +grossSale.toFixed(2),
          base_item_cost: +baseItemCost.toFixed(2),
          paper_ink_cost: 0,
          packaging_cost: +Math.max(0, totalCost - baseItemCost).toFixed(2),
          total_cost: totalCost,
          estimated_profit: +sheetProfit.toFixed(2),
        };
      } else if (purchaseCost !== null || fees || shipping) {
        const totalCost = Math.max(0, +((purchaseCost || 0) + fees + shipping).toFixed(2));
        costs = {
          ...costs,
          sale_total: +grossSale.toFixed(2),
          base_item_cost: +(purchaseCost || 0).toFixed(2),
          paper_ink_cost: 0,
          packaging_cost: +(fees + shipping).toFixed(2),
          total_cost: totalCost,
          estimated_profit: +(grossSale - totalCost).toFixed(2),
        };
      }

      const rowFingerprint = fingerprint(platform, sale_date, productText, costs.sale_total);
      if (seenSheetRows.has(rowFingerprint)) {
        skipped++;
        continue;
      }
      seenSheetRows.add(rowFingerprint);

      let match = existingByFingerprint.get(rowFingerprint) || null;
      if (!match) {
        const normalizedProduct = normalizeProduct(productText);
        match = existing.find((order) => {
          if (order.archived || usedExistingIds.has(order.id)) return false;
          if (order.platform !== platform || order.sale_date !== sale_date) return false;
          if (Math.abs(Number(order.sale_total || 0) - Number(costs.sale_total || 0)) > 0.011) return false;
          const existingProduct = normalizeProduct(order.product_name);
          return existingProduct === normalizedProduct || existingProduct.includes(normalizedProduct) || normalizedProduct.includes(existingProduct);
        }) || null;
      }

      const sheetValues = {
        sale_date,
        platform,
        product_name: productText,
        order_id: order_id || match?.order_id || null,
        quantity,
        size,
        unit_price,
        buyer,
        ...costs,
        business_id: businessId,
        access_emails: accessEmails,
        created_by_id: ownerId,
        sync_source: 'google_sheet_master',
        archived: false,
      };

      if (match?.id) {
        usedExistingIds.add(match.id);
        toUpdate.push({ id: match.id, data: sheetValues });
      } else {
        toCreate.push({ ...sheetValues, order_id });
      }
    }

    let imported = 0;
    for (let i = 0; i < toCreate.length; i += 200) {
      const batch = toCreate.slice(i, i + 200);
      await base44.asServiceRole.entities.Order.bulkCreate(batch);
      imported += batch.length;
    }

    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += 25) {
      const batch = toUpdate.slice(i, i + 25);
      const results = await Promise.allSettled(
        batch.map(({ id, data }) => base44.asServiceRole.entities.Order.update(id, data))
      );
      updated += results.filter((result) => result.status === 'fulfilled').length;
    }

    return Response.json({
      imported,
      updated,
      skipped,
      sheet: resolvedSheetName,
      total: rows.length - headerRowIndex - 1,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}