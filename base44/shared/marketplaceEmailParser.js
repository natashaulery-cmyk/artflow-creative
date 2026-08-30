const normalized = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const amount = (value) => Number(value || 0).toFixed(2);

export const validDate = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const platformFromSender = (sender = '') =>
  /etsy/i.test(sender) ? 'Etsy' :
  /ebay/i.test(sender) ? 'eBay' :
  /depop/i.test(sender) ? 'Depop' :
  /vinted/i.test(sender) ? 'Vinted' : '';

const moneyValue = (value = '') => {
  const parsed = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

export function parseKnownSale({ sender = '', subject = '', body = '', fallbackDate = '' }) {
  const platform = platformFromSender(sender);
  if (!platform) return { handled: false, order: null };

  if (platform === 'Vinted') {
    if (/^you sold an item on vinted$/i.test(subject.trim())) {
      const chunks = String(body).split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
      const boughtIndex = chunks.findIndex((part) => /\shas bought$/i.test(part));
      if (boughtIndex >= 0) {
        const buyer = chunks[boughtIndex].replace(/\s+has bought$/i, '').trim();
        let cursor = boughtIndex + 1;
        let quantity = 1;
        if (/^\d+$/.test(chunks[cursor] || '')) quantity = Math.max(1, Number(chunks[cursor++]));
        const productName = chunks[cursor] || '';
        const saleTotal = moneyValue(chunks.slice(cursor + 1).find((part) => /^\$[\d,.]+$/.test(part)) || '');
        if (productName && saleTotal && saleTotal > 0) {
          return { handled: true, order: { is_sale: true, platform, order_id: '', product_name: productName, quantity, size: inferSize(productName), sale_total: saleTotal, buyer, sale_date: fallbackDate } };
        }
      }
      return { handled: true, order: { is_sale: false, platform } };
    }
    return { handled: true, order: { is_sale: false, platform } };
  }

  if (platform === 'Depop') {
    if (/sale confirmation/i.test(subject) && /you(?:'|’)?ve made a sale/i.test(body)) {
      const buyerMatch = body.match(/\nBuyer\s*\n+([^\n]+)/i) || subject.match(/sale confirmation for @([^\.]+)\.?/i);
      const subtotalMatch = body.match(/\nSubtotal\s*\n+\$([\d,.]+)/i);
      const orderDetailsMatch = body.match(/\nOrder details\s*\n+([\s\S]*?)\nShip to\s*\n/i);
      const detailChunks = (orderDetailsMatch?.[1] || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
      const itemNames = [];
      for (let i = 0; i < detailChunks.length; i += 1) {
        if (!/^\$[\d,.]+$/.test(detailChunks[i]) && /^\$[\d,.]+$/.test(detailChunks[i + 1] || '')) {
          itemNames.push(detailChunks[i]);
          i += 1;
        }
      }
      const quantity = Math.max(1, itemNames.length || (body.match(/\nItem price\s*\n+\$[\d,.]+/gi) || []).length || 1);
      const saleTotal = moneyValue(subtotalMatch?.[1] || '');
      const productName = itemNames.length > 1 ? `Bundle ${itemNames.length} items: ${itemNames.join(' + ')}` : itemNames[0] || 'Depop sale';
      if (saleTotal && saleTotal > 0) {
        return { handled: true, order: { is_sale: true, platform, order_id: '', product_name: productName, quantity, size: inferSize(productName), sale_total: saleTotal, buyer: buyerMatch?.[1]?.trim() || '', sale_date: fallbackDate } };
      }
    }
    return { handled: true, order: { is_sale: false, platform } };
  }

  if (platform === 'Etsy' && /did you recently sign into etsy|seller app is now live|password|security|verification|prohibited items policy/i.test(subject)) {
    return { handled: true, order: { is_sale: false, platform } };
  }

  return { handled: false, order: null };
}

const productSimilar = (a = '', b = '') => {
  const left = normalized(a);
  const right = normalized(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const prefix = Math.min(28, left.length, right.length);
  return prefix >= 18 && left.slice(0, prefix) === right.slice(0, prefix);
};

export const sameSale = (a, b) => {
  if ((a.platform || '') !== (b.platform || '')) return false;
  const idsA = [normalized(a.order_id), normalized(a.source_email_id)].filter(Boolean);
  const idsB = [normalized(b.order_id), normalized(b.source_email_id)].filter(Boolean);
  const idOverlap = idsA.some((id) => idsB.includes(id));
  if (idOverlap) {
    if (amount(a.sale_total) !== amount(b.sale_total)) return false;
    if (Number(a.quantity || 1) !== Number(b.quantity || 1)) return false;
    return productSimilar(a.product_name, b.product_name);
  }
  if (idsA.length && idsB.length) return false;
  if ((a.sale_date || '') !== (b.sale_date || '')) return false;
  if (amount(a.sale_total) !== amount(b.sale_total)) return false;
  return productSimilar(a.product_name, b.product_name);
};
