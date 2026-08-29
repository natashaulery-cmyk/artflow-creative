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
    const { ownerId, businessId } = workspace;
    if (!ownerId || !businessId) {
      return Response.json({ error: 'No business workspace found for the connected Gmail account' }, { status: 500 });
    }

    const query = 'after:2026/01/01 subject:"ArtFlow Expense"';
    const allIds = [];
    let pageToken = '';
    do {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const listRes = await fetch(url, { headers });
      if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
      const page = await listRes.json();
      allIds.push(...(page.messages || []).map((m) => m.id));
      pageToken = page.nextPageToken || '';
    } while (pageToken);

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
    const categories = ['Inventory / Frames', 'Printing Supplies', 'Packaging', 'Equipment', 'Office Expense', 'Software & Subscriptions', 'Phone / Internet', 'Advertising', 'Shipping', 'Other'];

    let created = 0;
    let skipped = 0;

    for (const id of allIds) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers }
      );
      if (!msgRes.ok) {
        skipped++;
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

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          'Extract every separate paid business expense from this batch email and its attachments. Each receipt, invoice, or attached forwarded email is a separate expense. Never invent an amount. Ignore unpaid quotes, orders without a completed charge, refunds, and personal purchases. ' +
          `Allowed categories: ${categories.join(', ')}.\nSender: ${sender}\nSubject: ${subject}\nEmail body: ${body.slice(0, 16000)}\n` +
          `Attachment names: ${parts.map((p) => p.filename).join(', ')}. Return JSON with an expenses array. Each item must contain is_expense, vendor, description, amount, date (YYYY-MM-DD), category, deductible_percent, and notes.`,
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

      for (let index = 0; index < expenses.length; index++) {
        const expense = expenses[index];
        const receiptId = `${id}:${index}`;
        if (seen.has(receiptId)) {
          skipped++;
          continue;
        }
        const expenseAmount = Number(expense.amount);
        if (!expense.is_expense || !Number.isFinite(expenseAmount) || expenseAmount <= 0) {
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
          date,
          category,
          description: expense.description || expense.vendor || 'Forwarded receipt',
          amount: expenseAmount,
          deductible_percent: deductiblePercent,
          deductible_amount: expenseAmount * deductiblePercent / 100,
          source: expense.vendor || sender,
          receipt_id: receiptId,
          notes: expense.notes || 'Imported from a batch email marked ArtFlow Expense',
          sync_source: 'gmail',
          created_by_id: ownerId,
        });
        seen.add(receiptId);
        created++;
      }
    }

    const message = created + migrated
      ? `Synced ${created + migrated} expense${created + migrated === 1 ? '' : 's'}`
      : 'Expenses are up to date';
    const response = {
      connected_email: workspace.email,
      found: allIds.length,
      processed: allIds.length,
      created,
      migrated,
      remaining: 0,
      skipped,
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
