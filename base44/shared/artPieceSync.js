// Shared art-piece import logic. Reads a Google Sheets tab and upserts
// ArtPiece records by title, scoped to the current user (the function passes
// a user-scoped base44 client, so creates/updates are owned by them).
export async function importArtPieces(base44, accessToken, spreadsheetId, sheetName) {
  let tab = sheetName;
  if (!tab) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const tabs = (meta.sheets || []).map((s) => s.properties.title);
    tab = tabs.find((t) => /art|gallery|piece|artwork/i.test(t)) || tabs[0];
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
    if (rows[i].some((c) => /title|piece|artwork|name/i.test(String(c || '')))) {
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
  // Price column must exclude sale_price / sold_price so the asking price
  // doesn't accidentally pick up the sold-for column.
  const priceIdx = (() => {
    let i = headers.findIndex((h) => h === 'price' || h === 'asking price');
    if (i >= 0) return i;
    i = headers.findIndex((h) => h.includes('price') && !h.includes('sale') && !h.includes('sold'));
    if (i >= 0) return i;
    return headers.findIndex((h) => h.includes('asking'));
  })();
  const idx = {
    title: colIndex(['title', 'piece', 'artwork', 'name']),
    medium: colIndex(['medium', 'material', 'type']),
    size: colIndex(['size', 'dimensions']),
    price: priceIdx,
    status: colIndex(['status', 'availability', 'available']),
    image: colIndex(['image', 'photo', 'picture', 'image_url', 'link', 'url']),
    salePrice: colIndex(['sale_price', 'sold_price', 'sold for', 'sold']),
    saleDate: colIndex(['sale_date', 'sold_date', 'date sold']),
    buyer: colIndex(['buyer', 'customer']),
    platform: colIndex(['platform', 'site', 'marketplace']),
    notes: colIndex(['notes', 'note', 'description']),
  };

  const num = (v, fallback = 0) => {
    const n = Number(String(v || '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? fallback : n;
  };
  const normalizeDate = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    const d = new Date(s);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  };

  const existing = await base44.entities.ArtPiece.list('title', 500);
  const byTitle = new Map(
    existing.map((p) => [String(p.title || '').toLowerCase().trim(), p])
  );

  const toCreate = [];
  const toUpdate = [];
  let skipped = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const title = idx.title >= 0 ? String(row[idx.title] || '').trim() : '';
    if (!title) {
      skipped++;
      continue;
    }
    const statusRaw = idx.status >= 0 ? String(row[idx.status] || '').trim() : '';
    const status = /sold/i.test(statusRaw) ? 'Sold' : 'Available';
    const record = {
      title,
      status,
      price: num(idx.price >= 0 ? row[idx.price] : 0),
    };
    if (idx.medium >= 0 && row[idx.medium]) record.medium = String(row[idx.medium]).trim();
    if (idx.size >= 0 && row[idx.size]) record.size = String(row[idx.size]).trim();
    if (idx.image >= 0 && row[idx.image]) record.image_url = String(row[idx.image]).trim();
    if (idx.notes >= 0 && row[idx.notes]) record.notes = String(row[idx.notes]).trim();
    if (status === 'Sold') {
      const sp = num(idx.salePrice >= 0 ? row[idx.salePrice] : 0);
      if (sp > 0) record.sale_price = sp;
      const sd = normalizeDate(idx.saleDate >= 0 ? row[idx.saleDate] : null);
      if (sd) record.sale_date = sd;
      if (idx.buyer >= 0 && row[idx.buyer]) record.buyer = String(row[idx.buyer]).trim();
      if (idx.platform >= 0 && row[idx.platform]) record.platform = String(row[idx.platform]).trim();
    }

    const prev = byTitle.get(title.toLowerCase());
    if (prev) {
      toUpdate.push({ id: prev.id, ...record });
    } else {
      toCreate.push(record);
      byTitle.set(title.toLowerCase(), { id: 'pending' });
    }
  }

  let imported = 0;
  for (let i = 0; i < toCreate.length; i += 200) {
    const batch = toCreate.slice(i, i + 200);
    await base44.entities.ArtPiece.bulkCreate(batch);
    imported += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    const batch = toUpdate.slice(i, i + 200);
    await base44.entities.ArtPiece.bulkUpdate(batch);
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