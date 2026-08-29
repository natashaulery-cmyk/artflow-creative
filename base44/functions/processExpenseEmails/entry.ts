import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const decode = (value = '') => {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

const textFromPayload = (payload) => {
  if (payload?.mimeType === 'text/plain' && payload?.body?.data) return decode(payload.body.data);
  for (const part of payload?.parts || []) {
    const text = textFromPayload(part);
    if (text) return text;
  }
  if (payload?.body?.data) return decode(payload.body.data);
  return '';
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const headers = { Authorization: `Bearer ${accessToken}` };
    const query = 'after:2026/01/01 subject:"ArtFlow Expense"';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers }
    );
    if (!listRes.ok) throw new Error('Could not read Gmail: ' + (await listRes.text()));
    const ids = ((await listRes.json()).messages || []).map((m) => m.id);
    const existing = await base44.entities.Expense.list('-date', 5000);
    const seen = new Set(existing.map((e) => e.receipt_id).filter(Boolean));
    const categories = ['Inventory / Frames', 'Printing Supplies', 'Packaging', 'Equipment', 'Office Expense', 'Software & Subscriptions', 'Phone / Internet', 'Advertising', 'Shipping', 'Other'];

    let created = 0;
    let skipped = 0;

    for (const id of ids) {
      if (seen.has(id)) {
        skipped++;
        continue;
      }
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

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          'Extract one paid business expense from this forwarded receipt or bill. Never invent an amount. Set is_expense=false if there is no clear completed charge or paid amount. ' +
          `Allowed categories: ${categories.join(', ')}.\nSender: ${sender}\nSubject: ${subject}\nBody: ${body.slice(0, 16000)}\n` +
          'Return JSON with is_expense, vendor, description, amount, date (YYYY-MM-DD), category, deductible_percent, and notes.',
        response_json_schema: {
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
      });
      const expense = typeof result === 'string' ? JSON.parse(result) : result;
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

      await base44.entities.Expense.create({
        date,
        category,
        description: expense.description || expense.vendor || 'Forwarded receipt',
        amount,
        deductible_percent: deductiblePercent,
        deductible_amount: amount * deductiblePercent / 100,
        source: expense.vendor || sender,
        receipt_id: id,
        notes: expense.notes || 'Imported from an email marked ArtFlow Expense',
        sync_source: 'gmail',
      });
      seen.add(id);
      created++;
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
