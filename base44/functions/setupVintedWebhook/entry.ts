import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { functionUrl, vintedRequest } from '../../shared/marketplaceWebhook.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const EVENTS = ['ORDER_CREATED', 'ORDER_CANCELLED'];

const randomKey = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    let email = '';
    try { email = (await base44.auth.me())?.email || ''; } catch {}
    const { ownerId, businessId, accessEmails = [] } = await resolveBusinessWorkspace(base44, email);
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

    const all = await base44.asServiceRole.entities.MarketplaceWebhook.list('-updated_date', 500);
    let local = all.find((row) => row.provider === 'Vinted' && row.business_id === businessId);
    const callbackKey = String(local?.callback_key || randomKey());
    const callbackUrl = functionUrl('vintedWebhook', callbackKey);

    let remote = [];
    try {
      const payload = await vintedRequest('/api/v1/webhooks');
      remote = Array.isArray(payload) ? payload : [];
    } catch (error) {
      return Response.json({
        available: false,
        needs_setup: true,
        connected: false,
        message: String(error?.message || 'Vinted Pro credentials are not configured.'),
      });
    }

    const existingRemote = remote.find((row) => String(row?.url || '') === callbackUrl);
    if (existingRemote && local?.signing_secret) {
      const record = {
        provider_webhook_id: String(existingRemote.id || local.provider_webhook_id || ''),
        status: 'active',
        event_types: existingRemote.event_types || EVENTS,
        owner_id: ownerId,
        access_emails: accessEmails,
        last_error: '',
      };
      await base44.asServiceRole.entities.MarketplaceWebhook.update(local.id, record);
      return Response.json({ available: true, connected: true, webhook_url: callbackUrl, message: 'Vinted live order webhooks are connected.' });
    }

    // If the callback exists remotely but the one-time signing key is no longer
    // stored locally, recreate the webhook so Vinted issues a fresh signing key.
    if (existingRemote && !local?.signing_secret && existingRemote?.id) {
      try { await vintedRequest(`/api/v1/webhooks/${encodeURIComponent(existingRemote.id)}`, { method: 'DELETE' }); } catch {}
    }

    const created = await vintedRequest('/api/v1/webhooks', {
      method: 'POST',
      body: { event_types: EVENTS, url: callbackUrl },
    });
    const signingSecret = String(created?.signing_key || '').trim();
    const webhookId = String(created?.webhook?.id || '').trim();
    if (!signingSecret || !webhookId) throw new Error('Vinted did not return the webhook signing key/id.');

    const record = {
      provider: 'Vinted',
      business_id: businessId,
      owner_id: ownerId,
      access_emails: accessEmails,
      callback_key: callbackKey,
      provider_webhook_id: webhookId,
      signing_secret: signingSecret,
      status: 'active',
      event_types: EVENTS,
      last_error: '',
    };
    if (local) await base44.asServiceRole.entities.MarketplaceWebhook.update(local.id, record);
    else local = await base44.asServiceRole.entities.MarketplaceWebhook.create({ ...record, created_by_id: ownerId });

    return Response.json({ available: true, connected: true, webhook_url: callbackUrl, message: 'Vinted live order webhooks are connected.' });
  } catch (error) {
    return Response.json({ available: true, connected: false, error: String(error?.message || 'Vinted webhook setup failed') }, { status: 500 });
  }
}
