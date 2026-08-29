import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveOwnerUserId } from '../../shared/ownerUser.js';

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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const ownerId = await resolveOwnerUserId(base44);
    if (!ownerId) return Response.json({ error: 'No app owner found to attribute expenses to' }, { status: 500 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };
    const query = 'after:2026/01/01 subject:"ArtFlow Expense"';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers }
    );
    if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
    const ids = ((await listRes.json()).messages || []).map((m) => m.id);
    const existing = await base44.asServiceRole.entities.Expense.list('-date', 5000);
    const seen = new Set(existing.map((e) => e.receipt_id).filter(Boolean));
    const categories = ['Inventory / Frames', 'Printing Supplies', 'Packaging', 'Equipment', 'Office Expense', 'Software & Subscriptions', 'Phone / Internet', 'Advertising', 'Shipping', 'Other'];

    let created = 0;
    let skipped = 0;

    for (const id of ids) {
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
        const amount = Number(expense.amount);
        if (!expense.is_expense || !Number.isFinite(amount) || amount <= 0) {
          skipped++;
          continue;
        }
        const date = /^\d{4}-\d{2}-\d{2}$/.test(expense.date || '')
          ? expense.date
          : new Date(Number(msg.internalDate) || Date.now()).toISOString().slice(0, 10);
        const deductiblePercent = Math.min(100, Math.max(0, Number(expense.deductible_percent) || 100));
        const category = categories.includes(expense.category) ? expense.category : 'Other';

        await base44.asServiceRole.entities.Expense.create({
          date,
          category,
          description: expense.description || expense.vendor || 'Forwarded receipt',
          amount,
          deductible_percent: deductiblePercent,
          deductible_amount: amount * deductiblePercent / 100,
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

    return Response.json({
      processed: ids.length,
      created,
      skipped,
      message: created ? `Imported ${created} new expense${created === 1 ? '' : 's'}` : 'No new forwarded expenses found',
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Expense email import failed' }, { status: 500 });
  }
}