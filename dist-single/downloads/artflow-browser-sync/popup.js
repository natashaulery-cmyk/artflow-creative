const APP_ID = '6a91be5ced6058323eb21f7d';
const ENDPOINT = `https://base44.app/api/apps/${APP_ID}/functions/browserOrderCapture`;
const $ = (id) => document.getElementById(id);
let pageUrl = '';

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function setStatus(message, kind = '') {
  const el = $('status');
  el.textContent = message;
  el.className = `status ${kind}`.trim();
}

function extractOrderFromPage() {
  const host = location.hostname.toLowerCase();
  const platform = host.includes('vinted') ? 'Vinted' : host.includes('depop') ? 'Depop' : '';
  const body = (document.body?.innerText || '').replace(/\r/g, '');
  const lines = body.split('\n').map((v) => v.trim()).filter(Boolean);
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const h1 = document.querySelector('h1')?.innerText || '';
  let product = (h1 || metaTitle || document.title || '').replace(/\s*[|–-]\s*(Vinted|Depop).*$/i, '').trim();
  if (product.length > 300) product = product.slice(0, 300);

  const labeledMoney = [
    /(?:order\s+total|subtotal|item\s+price|sale\s+price|sold\s+for|price)\s*[:\n]?\s*\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:item\s+price|subtotal|total)/i,
  ];
  let saleTotal = '';
  for (const re of labeledMoney) {
    const match = body.match(re);
    if (match) { saleTotal = match[1].replace(/,/g, ''); break; }
  }

  const orderMatch = body.match(/(?:order(?:\s*(?:id|number))?|order\s*#)\s*[:#]?\s*([A-Z0-9][A-Z0-9_-]{5,})/i);
  const buyerMatch = body.match(/(?:buyer|sold\s+to)\s*[:\n]\s*([^\n]{2,80})/i);
  const quantityMatch = body.match(/(?:quantity|qty)\s*[:\n]?\s*(\d{1,2})/i);

  // Some marketplace order pages use nearby text rather than semantic headings.
  // If the H1 is generic, prefer a line just before a clearly labeled item price.
  if (!product || /^(order|sold|purchase|messages?)$/i.test(product)) {
    const priceLine = lines.findIndex((line) => /^(item price|sale price|subtotal)$/i.test(line));
    if (priceLine > 0) product = lines[Math.max(0, priceLine - 1)].slice(0, 300);
  }

  return {
    supported: !!platform,
    platform,
    product_name: product,
    sale_total: saleTotal,
    quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
    order_id: orderMatch?.[1] || '',
    buyer: buyerMatch?.[1]?.trim() || '',
    sale_date: new Date().toISOString().slice(0, 10),
    source_url: location.href,
  };
}

async function readPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    pageUrl = tab.url || '';
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractOrderFromPage });
    const data = result?.[0]?.result || {};
    if (!data.supported) {
      setStatus('Open a Vinted or Depop sold/order page first.', 'bad');
      $('capture').disabled = true;
      return;
    }
    $('capture').disabled = false;
    $('platform').value = data.platform || 'Vinted';
    $('product').value = data.product_name || '';
    $('total').value = data.sale_total || '';
    $('quantity').value = data.quantity || 1;
    $('orderId').value = data.order_id || '';
    $('buyer').value = data.buyer || '';
    $('saleDate').value = data.sale_date || localDate();
    pageUrl = data.source_url || pageUrl;
    setStatus(data.sale_total ? 'Page read. Check the amount and product before sending.' : 'Page read. Enter the sale total, then send.', data.sale_total ? 'ok' : '');
  } catch (error) {
    setStatus(`Could not read this page: ${error.message || error}`, 'bad');
  }
}

async function loadKey() {
  const stored = await chrome.storage.local.get(['artflowSyncKey']);
  $('syncKey').value = stored.artflowSyncKey || '';
}

$('saveKey').addEventListener('click', async () => {
  const key = $('syncKey').value.trim();
  if (!key.startsWith('af_') || key.length < 20) {
    setStatus('Paste the Browser Sync key from Art Flow Account.', 'bad');
    return;
  }
  await chrome.storage.local.set({ artflowSyncKey: key });
  setStatus('Sync key saved on this computer.', 'ok');
});

$('reread').addEventListener('click', readPage);

$('capture').addEventListener('click', async () => {
  const key = $('syncKey').value.trim();
  const total = Number(String($('total').value).replace(/[$,]/g, ''));
  const product = $('product').value.trim();
  if (!key.startsWith('af_')) return setStatus('Save your Art Flow Browser Sync key first.', 'bad');
  if (!product) return setStatus('Enter the product name.', 'bad');
  if (!Number.isFinite(total) || total <= 0) return setStatus('Enter the correct sale total.', 'bad');

  $('capture').disabled = true;
  setStatus('Sending sale to Art Flow…');
  try {
    await chrome.storage.local.set({ artflowSyncKey: key });
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_key: key,
        order: {
          platform: $('platform').value,
          product_name: product,
          sale_total: total,
          quantity: Math.max(1, Number($('quantity').value) || 1),
          order_id: $('orderId').value.trim(),
          buyer: $('buyer').value.trim(),
          sale_date: $('saleDate').value || localDate(),
          source_url: pageUrl,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Art Flow returned ${response.status}`);
    setStatus(data.message || 'Sale sent to Art Flow.', 'ok');
  } catch (error) {
    setStatus(`Could not send sale: ${error.message || error}`, 'bad');
  } finally {
    $('capture').disabled = false;
  }
});

loadKey().then(readPage);
