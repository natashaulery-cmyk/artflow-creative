import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';
import { getOutlookConnection, getOutlookProfile, listOutlookMessages, listOutlookFileAttachments, outlookSender, outlookBody, outlookDate, decodeBase64Bytes } from '../../shared/outlookMail.js';
import { appendExpensesToMasterSheet } from '../../shared/spreadsheetMaster.js';

const BATCH_SIZE = 500;
const EXPENSE_HINT = /artflow expense|receipt|ordered|order confirmation|order received|purchase confirmation|invoice|payment successful|payment received|your order|subscription|renewal|shipping label/i;
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

async function saveState(base44, ownerId, businessId, data) {
  if (!businessId) return;
  const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
  const existing = states.find((x) => x.business_id === businessId && x.source === 'outlook_expenses');
  const payload = {
    business_id: businessId,
    source: 'outlook_expenses',
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
}

export default async function(req) {
  let base44;
  let workspace = { ownerId: null, businessId: null, email: null, accessEmails: [] };
  try {
    base44 = createClientFromRequest(req);
    const { accessToken } = await getOutlookConnection(base44);
    const profile = await getOutlookProfile(accessToken);
    workspace = await resolveBusinessWorkspace(base44, profile.email);
    const { ownerId, businessId, accessEmails = [] } = workspace;
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found for this Outlook account' }, { status: 400 });

    const states = await base44.asServiceRole.entities.SyncState.list('-last_synced_at', 200).catch(() => []);
    const prior = states.find((x) => x.business_id === businessId && x.source === 'outlook_expenses');
    const caughtUp = prior && Number(prior.last_remaining || 0) === 0;
    const since = new Date();
    if (caughtUp) since.setDate(since.getDate() - 14);
    else since.setMonth(since.getMonth() - 18);

    const allMessages = await listOutlookMessages(accessToken, { sinceIso: since.toISOString(), maxMessages: 2000 });
    const messages = allMessages.filter((m) => EXPENSE_HINT.test(`${m.subject || ''}\n${m.bodyPreview || ''}`));

    const [history, existingExpenses] = await Promise.all([
      base44.asServiceRole.entities.EmailImportMessage.list('-created_date', 5000).catch(() => []),
      base44.asServiceRole.entities.Expense.list('-date', 5000),
    ]);
    const completed = new Set(history
      .filter((h) => h.business_id === businessId && h.import_type === 'expense' && h.status !== 'error')
      .map((h) => h.message_id));
    const historyById = new Map(history.filter((h) => h.business_id === businessId && h.import_type === 'expense').map((h) => [h.message_id, h]));
    const pending = messages.filter((m) => !completed.has(`outlook:${m.id}`));
    const batch = pending.slice(0, BATCH_SIZE);
    const seenReceiptIds = new Set(existingExpenses.filter((e) => !e.archived && e.business_id === businessId).map((e) => e.receipt_id).filter(Boolean));

    let created = 0, skipped = 0, errors = 0;
    const createdForSheet = [];
    const recordHistory = async (messageId, status, details) => {
      const id = `outlook:${messageId}`;
      const payload = { message_id: id, import_type: 'expense', status, platform: 'Outlook', details: String(details || '').slice(0, 500), business_id: businessId };
      const existing = historyById.get(id);
      if (existing) await base44.asServiceRole.entities.EmailImportMessage.update(existing.id, payload);
      else historyById.set(id, await base44.asServiceRole.entities.EmailImportMessage.create({ ...payload, created_by_id: ownerId }));
    };

    for (const message of batch) {
      try {
        const subject = String(message.subject || '');
        const sender = outlookSender(message);
        const body = outlookBody(message);
        const explicitlyForwarded = /artflow expense/i.test(subject);
        const fileUrls = [];
        const attachmentNames = [];

        if (message.hasAttachments) {
          const attachments = await listOutlookFileAttachments(accessToken, message.id).catch(() => []);
          for (const attachment of attachments.slice(0, 8)) {
            try {
              const file = new File([decodeBase64Bytes(attachment.contentBytes)], attachment.name, { type: attachment.contentType });
              const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
              if (uploaded?.file_url) fileUrls.push(uploaded.file_url);
              attachmentNames.push(attachment.name);
            } catch {}
          }
        }

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt:
            'Identify every separate PAID expense in this email or its attachments that is clearly related to operating an art-selling or creative-products business. Do not rely on a fixed keyword list; use actual purchase context. ' +
            'Qualifying expenses can include art/craft materials, paper, ink, printers and maintenance, frames, packaging, mailers, boxes, labels, postage, cameras and photography gear, tablets/drawing devices, production equipment, business software/subscriptions, phone/internet used for business, advertising/marketing, office supplies, and other purchases used to create, photograph, display, market, package, or ship artwork. ' +
            'Exclude groceries, clothing, household/personal purchases, entertainment, unrelated personal electronics, marketplace sales/payouts, refunds, failed payments, unpaid quotes, buyer-paid shipping, and installment notices that only repay a purchase already represented by a merchant receipt. ' +
            `This message was ${explicitlyForwarded ? '' : 'not '}explicitly marked ArtFlow Expense. For automatic detection, require strong business relevance. Never invent an amount. Use the paid/transaction date, not delivery date, and never return a future date. ` +
            `Allowed categories: ${categories.join(', ')}.\nSender: ${sender}\nSubject: ${subject}\nReceived: ${outlookDate(message)}\nBody: ${body.slice(0, 16000)}\nAttachment names: ${attachmentNames.join(', ')}. ` +
            'Return JSON with an expenses array. Each item must contain is_expense, confidence (0 to 1), vendor, description, amount, date (YYYY-MM-DD), category, deductible_percent, and notes.',
          file_urls: fileUrls,
          response_json_schema: {
            type: 'object',
            properties: {
              expenses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    is_expense:{type:'boolean'}, confidence:{type:'number'}, vendor:{type:'string'}, description:{type:'string'}, amount:{type:'number'}, date:{type:'string'}, category:{type:'string'}, deductible_percent:{type:'number'}, notes:{type:'string'}
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
          const receiptId = `outlook:${message.id}:${index}`;
          if (seenReceiptIds.has(receiptId)) { skipped++; continue; }
          const expenseAmount = Number(expense.amount);
          const confidence = Math.max(0, Math.min(1, Number(expense.confidence) || 0));
          const minimumConfidence = explicitlyForwarded ? 0.55 : 0.82;
          if (!expense.is_expense || confidence < minimumConfidence || !Number.isFinite(expenseAmount) || expenseAmount <= 0) { skipped++; continue; }

          const today = new Date().toISOString().slice(0, 10);
          const fallbackDate = outlookDate(message);
          const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(expense.date || '') ? expense.date : '';
          const date = parsedDate && parsedDate <= today ? parsedDate : fallbackDate <= today ? fallbackDate : today;
          const deductiblePercent = Math.min(100, Math.max(0, Number(expense.deductible_percent) || 100));
          const category = categories.includes(expense.category) ? expense.category : 'Other Business Expense';

          const createdExpense = await base44.asServiceRole.entities.Expense.create({
            business_id: businessId,
            access_emails: accessEmails,
            date,
            category,
            description: expense.description || expense.vendor || 'Outlook receipt',
            amount: expenseAmount,
            deductible_percent: deductiblePercent,
            deductible_amount: expenseAmount * deductiblePercent / 100,
            source: expense.vendor || sender,
            receipt_id: receiptId,
            notes: expense.notes || (explicitlyForwarded ? 'Imported from an ArtFlow Expense email' : 'Automatically recognized from an Outlook purchase receipt'),
            sync_source: 'outlook_auto',
            auto_classified: !explicitlyForwarded,
            confidence,
            created_by_id: ownerId,
          });
          createdForSheet.push(createdExpense);
          seenReceiptIds.add(receiptId);
          created++;
          messageCreated++;
        }
        await recordHistory(message.id, messageCreated ? 'imported' : 'skipped', messageCreated ? `Imported ${messageCreated} art-business expense(s)` : 'No qualifying art-business expense found');
      } catch (e) {
        errors++;
        await recordHistory(message.id, 'error', e?.message || 'Outlook expense import failed').catch(() => {});
      }
    }

    let emailSheetAppended = 0;
    try {
      if (createdForSheet.length) {
        const writeResult = await appendExpensesToMasterSheet(base44, workspace, createdForSheet);
        emailSheetAppended = Number(writeResult?.appended || 0);
      }
    } catch {
      // Keep the Outlook expense in Art Flow if Sheets is temporarily unavailable;
      // the next reconciliation pass can retry persistence safely.
    }

    const remaining = Math.max(0, pending.length - batch.length);
    const message = created ? `Synced ${created} Outlook expense${created === 1 ? '' : 's'}${remaining ? ` · ${remaining} emails left` : ''}` : remaining ? `Checked ${batch.length} Outlook emails · ${remaining} left` : 'Outlook business expenses are up to date';
    const response = { provider:'Outlook', connected_email:profile.email, found:messages.length, processed:batch.length, created, email_sheet_appended:emailSheetAppended, skipped, errors, remaining, message };
    await saveState(base44, ownerId, businessId, { ...response, status: errors ? 'error' : 'ok' });
    return Response.json(response);
  } catch (e) {
    if (base44 && workspace.businessId) await saveState(base44, workspace.ownerId, workspace.businessId, { status:'error', message:e?.message || 'Outlook expense import failed' }).catch(() => {});
    return Response.json({ available:false, error:e?.message || 'Outlook is not connected' }, { status:400 });
  }
}
