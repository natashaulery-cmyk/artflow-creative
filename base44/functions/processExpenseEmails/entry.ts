import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const decodeBytes = (value = '') => {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
};

const decodeText = (value = '') => new TextDecoder('utf-8').decode(decodeBytes(value));

const textFromPayload = (payload) => {
  if (payload?.mimeType === 'text/plain' && payload?.body?.data) return decodeText(payload.body.data);
  for (const part of payload?.parts || []) {
    const text = textFromPayload(part);
    if (text) return text;
  }
  if (payload?.body?.data && String(payload.mimeType || '').startsWith('text/')) return decodeText(payload.body.data);
  return '';
};

const attachmentParts = (payload, found = []) => {
  if (payload?.filename && (payload?.body?.attachmentId || payload?.body?.data)) found.push(payload);
  for (const part of payload?.parts || []) attachmentParts(part, found);
  return found;
};

async function saveSyncState(base44, ownerId, businessId, data) {
  if (!businessId) return;
  try {
    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 100);
    const existing = states.find((item) => item.business_id === businessId && item.source === 'gmail_expenses');
    const payload = {
      business_id: businessId,
      source: 'gmail_expenses',
      last_synced_at: new Date().toISOString(),
      last_found: data.found || 0,
      last_processed: data.processed || 0,
      last_created: data.created || 0,
      last_remaining: data.remaining || 0,
      status: data.status || 'ok',
      message: data.message || '',
    };
    if (existing) await base44.asServiceRole.entities.SyncState.update(existing.id, payload);
    else await base44.asServiceRole.entities.SyncState.create({ ...payload, created_by_id: ownerId });
  } catch {}
}

export default async function(req) {
  let base44;
  let workspace = { ownerId: null, businessId: null, email: null };
  try {
    base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };

    let connectedEmail = '';
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers });
      if (profileRes.ok) connectedEmail = (await profileRes.json()).emailAddress || '';
    } catch {}

    workspace = await resolveBusinessWorkspace(base44, connectedEmail);
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) {
      return Response.json({ error: 'No business workspace found for the connected Gmail account' }, { status: 500 });
    }

    // Search broadly for purchase/receipt language so an artist is not limited to
    // a hard-coded retailer or supply list. The classifier below decides whether
    // each purchase is actually related to the art business.
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 18);
    const afterDate = lookback.toISOString().slice(0, 10).replace(/-/g, '/');
    const queries = [
      `after:${afterDate} subject:"ArtFlow Expense"`,
      `after:${afterDate} {subject:receipt subject:ordered subject:"order confirmation" subject:"order received" subject:"purchase confirmation" subject:invoice subject:"payment successful" subject:"payment received" subject:"your order"}`,
    ];
    const allIds = [];
    const idSet = new Set();
    for (const query of queries) {
      let pageToken = '';
      let pages = 0;
      do {
        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
        url.searchParams.set('q', query);
        url.searchParams.set('maxResults', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const listRes = await fetch(url, { headers });
        if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
        const page = await listRes.json();
        for (const message of page.messages || []) {
          if (!idSet.has(message.id)) {
            idSet.add(message.id);
            allIds.push(message.id);
          }
        }
        pageToken = page.nextPageToken || '';
        pages++;
      } while (pageToken && pages < 20 && allIds.length < 2000);
    }

    const importHistory = await base44.asServiceRole.entities.EmailImportMessage.list('-created_date', 5000).catch(() => []);
    const completedIds = new Set(
      importHistory
        .filter((item) => item.import_type === 'expense' && item.status !== 'error' && (!item.business_id || item.business_id === businessId))
        .map((item) => item.message_id)
        .filter(Boolean)
    );
    const pendingIds = allIds.filter((id) => !completedIds.has(id));
    const batch = pendingIds.slice(0, 150);

    const existing = await base44.asServiceRole.entities.Expense.list('-date', 5000);

    // Move older expenses from prior logins into the shared workspace.
    let migrated = 0;
    for (const oldExpense of existing.filter((e) => !e.archived && e.business_id !== businessId).slice(0, 150)) {
      const duplicate = existing.some((candidate) =>
        candidate.id !== oldExpense.id &&
        !candidate.archived &&
        candidate.business_id === businessId &&
        candidate.date === oldExpense.date &&
        Number(candidate.amount || 0).toFixed(2) === Number(oldExpense.amount || 0).toFixed(2) &&
        String(candidate.description || '').trim().toLowerCase() === String(oldExpense.description || '').trim().toLowerCase()
      );
      if (!duplicate && oldExpense.date && Number(oldExpense.amount || 0) > 0) {
        await base44.asServiceRole.entities.Expense.create({
          business_id: businessId,
          access_emails: accessEmails,
          date: oldExpense.date,
          category: oldExpense.category,
          description: oldExpense.description,
          amount: Number(oldExpense.amount || 0),
          deductible_percent: Number(oldExpense.deductible_percent ?? 100),
          deductible_amount: Number(oldExpense.deductible_amount ?? oldExpense.amount ?? 0),
          source: oldExpense.source || 'legacy',
          receipt_id: oldExpense.receipt_id || null,
          notes: oldExpense.notes || null,
          sync_source: oldExpense.sync_source || 'legacy',
          archived: false,
          created_by_id: ownerId,
        });
        migrated++;
      }
      await base44.asServiceRole.entities.Expense.update(oldExpense.id, { archived: true });
    }

    const currentExpenses = await base44.asServiceRole.entities.Expense.list('-date', 5000);
    const seen = new Set(currentExpenses.filter((e) => !e.archived && e.business_id === businessId).map((e) => e.receipt_id).filter(Boolean));
    const categories = [
      'Art Materials & Supplies',
      'Paper & Print Media',
      'Ink & Printing Supplies',
      'Frames & Display',
      'Packaging & Shipping Supplies',
      'Equipment & Tools',
      'Photography Equipment',
      'Software & Subscriptions',
      'Phone / Internet',
      'Advertising & Marketing',
      'Shipping & Postage',
      'Office & Business',
      'Other Business Expense',
    ];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    const historyByMessage = new Map();
    for (const item of importHistory) {
      if (item.import_type !== 'expense' || !item.message_id) continue;
      if (item.business_id && item.business_id !== businessId) continue;
      if (!historyByMessage.has(item.message_id)) historyByMessage.set(item.message_id, item);
    }

    const recordHistory = async (messageId, status, details) => {
      const payload = {
        message_id: messageId,
        import_type: 'expense',
        status,
        platform: 'Gmail',
        details: String(details || '').slice(0, 500),
        business_id: businessId,
      };
      const prior = historyByMessage.get(messageId);
      if (prior) {
        await base44.asServiceRole.entities.EmailImportMessage.update(prior.id, payload);
        Object.assign(prior, payload);
      } else {
        const createdHistory = await base44.asServiceRole.entities.EmailImportMessage.create({ ...payload, created_by_id: ownerId });
        historyByMessage.set(messageId, createdHistory);
      }
    };

    for (const id of batch) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers }
      );
      if (!msgRes.ok) {
        errors++;
        await recordHistory(id, 'error', 'Could not read Gmail message');
        continue;
      }
      const msg = await msgRes.json();
      const emailHeaders = msg.payload?.headers || [];
      const subject = emailHeaders.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
      const sender = emailHeaders.find((h) => h.name.toLowerCase() === 'from')?.value || '';
      const body = textFromPayload(msg.payload) || msg.snippet || '';
      const parts = attachmentParts(msg.payload);
      const fileUrls = [];

      for (const part of parts) {
        let data = part.body?.data;
        if (!data && part.body?.attachmentId) {
          const attachmentRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${part.body.attachmentId}`,
            { headers }
          );
          if (attachmentRes.ok) data = (await attachmentRes.json()).data;
        }
        if (!data) continue;
        const file = new File([decodeBytes(data)], part.filename || 'receipt', {
          type: part.mimeType || 'application/octet-stream',
        });
        const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        if (uploaded?.file_url) fileUrls.push(uploaded.file_url);
      }

      const explicitlyForwarded = subject.toLowerCase().includes('artflow expense');
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          'Identify every separate PAID expense in this email or its attachments that is clearly related to operating an art-selling or creative-products business. Do not rely on a fixed keyword list; use the actual item and purchase context. ' +
          'Examples that qualify include art materials and craft supplies; paints, inks, markers, pencils, adhesives, cutting tools, mats and tools; canvases and substrates; photo paper, cardstock and specialty print media; printer ink, cartridges, printheads, printers and printer maintenance; frames, mats, backing boards and display hardware; sleeves, cellophane bags, protectors, rigid mailers, envelopes, boxes, tape, labels and packaging; cameras, lenses, lighting, tripods and photography gear used to create/list products; tablets, drawing devices and production equipment; business software/subscriptions; advertising/marketing; postage and shipping; and other clearly business-related purchases used to create, photograph, package, display, market, or ship artwork. ' +
          'Exclude groceries, clothing, household/personal purchases, entertainment, personal electronics with no business evidence, marketplace sales/payouts, refunds, failed payments, unpaid quotes, buyer-paid shipping, and installment/payment-plan notices that merely repay a purchase already represented by a merchant receipt. ' +
          `This message was ${explicitlyForwarded ? '' : 'not '}explicitly forwarded/labeled by the user as ArtFlow Expense. ` +
          'For automatic detection, only mark an item is_expense=true when business relevance is strong. Never invent an amount or split one order total across items unless the receipt gives item-level amounts. Prefer the actual charged/paid amount attributable to the business item. ' +
          `Allowed categories: ${categories.join(', ')}.\nSender: ${sender}\nSubject: ${subject}\nEmail body: ${body.slice(0, 16000)}\n` +
          `Attachment names: ${parts.map((p) => p.filename).join(', ')}. Return JSON with an expenses array. Each item must contain is_expense, confidence (0 to 1), vendor, description, amount, date (YYYY-MM-DD), category, deductible_percent, and notes.`,
        file_urls: fileUrls,
        response_json_schema: {
          type: 'object',
          properties: {
            expenses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  is_expense: { type: 'boolean' },
                  confidence: { type: 'number' },
                  vendor: { type: 'string' },
                  description: { type: 'string' },
                  amount: { type: 'number' },
                  date: { type: 'string' },
                  category: { type: 'string' },
                  deductible_percent: { type: 'number' },
                  notes: { type: 'string' },
                },
                required: ['is_expense'],
              },
            },
          },
          required: ['expenses'],
        },
      });

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const expenses = Array.isArray(parsed?.expenses) ? parsed.expenses : [];

      let messageCreated = 0;
      for (let index = 0; index < expenses.length; index++) {
        const expense = expenses[index];
        const receiptId = `${id}:${index}`;
        if (seen.has(receiptId)) {
          skipped++;
          continue;
        }
        const expenseAmount = Number(expense.amount);
        const confidence = Math.max(0, Math.min(1, Number(expense.confidence) || 0));
        const minimumConfidence = explicitlyForwarded ? 0.55 : 0.82;
        if (!expense.is_expense || confidence < minimumConfidence || !Number.isFinite(expenseAmount) || expenseAmount <= 0) {
          skipped++;
          continue;
        }
        const date = /^\d{4}-\d{2}-\d{2}$/.test(expense.date || '')
          ? expense.date
          : new Date(Number(msg.internalDate) || Date.now()).toISOString().slice(0, 10);
        const deductiblePercent = Math.min(100, Math.max(0, Number(expense.deductible_percent) || 100));
        const category = categories.includes(expense.category) ? expense.category : 'Other';

        await base44.asServiceRole.entities.Expense.create({
          business_id: businessId,
          access_emails: accessEmails,
          date,
          category,
          description: expense.description || expense.vendor || 'Forwarded receipt',
          amount: expenseAmount,
          deductible_percent: deductiblePercent,
          deductible_amount: expenseAmount * deductiblePercent / 100,
          source: expense.vendor || sender,
          receipt_id: receiptId,
          notes: expense.notes || (explicitlyForwarded ? 'Imported from an ArtFlow Expense email' : 'Automatically recognized from a purchase receipt'),
          sync_source: 'gmail_auto',
          auto_classified: !explicitlyForwarded,
          confidence,
          created_by_id: ownerId,
        });
        seen.add(receiptId);
        created++;
        messageCreated++;
      }
      await recordHistory(id, messageCreated ? 'imported' : 'skipped', messageCreated ? `Imported ${messageCreated} art-business expense(s)` : 'No qualifying art-business expense found');
    }

    const remaining = Math.max(0, pendingIds.length - batch.length);
    const message = created + migrated
      ? `Synced ${created + migrated} expense${created + migrated === 1 ? '' : 's'}${remaining ? ` · ${remaining} emails left to check` : ''}`
      : remaining
        ? `Checked ${batch.length} emails · ${remaining} left to check`
        : 'Art-business expenses are up to date';
    const response = {
      connected_email: workspace.email,
      found: allIds.length,
      processed: batch.length,
      created,
      migrated,
      remaining,
      skipped,
      errors,
      message,
    };
    await saveSyncState(base44, ownerId, businessId, { ...response, status: 'ok' });
    return Response.json(response);
  } catch (error) {
    if (base44 && workspace.businessId) {
      await saveSyncState(base44, workspace.ownerId, workspace.businessId, {
        status: 'error',
        message: error.message || 'Expense email import failed',
      });
    }
    return Response.json({ error: error.message || 'Expense email import failed' }, { status: 500 });
  }
}
