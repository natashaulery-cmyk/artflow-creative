import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { depopRequest, functionUrl } from '../../shared/marketplaceWebhook.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const EVENTS = ['v1:order.*'];

const randomKey = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

function webhookEntries(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return Object.entries(payload).map(([id, value]) => ({ webhook_id: id, ...(value || {}) }));
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    let email = '';
    try { email = (await base44.auth.me())?.email || ''; } catch {}
    const { ownerId, businessId, accessEmails = [] } = await resolveBusinessWorkspace(base44, email);
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

    const all = await base44.asServiceRole.entities.MarketplaceWebhook.list('-updated_date', 500);
    let local = all.find((row) => row.provider === 'Depop' && row.business_id === businessId);
    const callbackKey = String(local?.callback_key || randomKey());
    const callbackUrl = functionUrl('depopWebhook', callbackKey);

    let remote = [];
    try { remote = webhookEntries(await depopRequest('/api/v1/webhooks/')); } catch (error) {
      return Response.json({
        available: false,
        needs_setup: true,
        connected: false,
        message: String(error?.message || 'Depop Partner API credentials are not configured.'),
      });
    }

    const existingRemote = remote.find((row) => String(row?.url || '') === callbackUrl);
    if (existingRemote && local?.signing_secret) {
      await base44.asServiceRole.entities.MarketplaceWebhook.update(local.id, {
        provider_webhook_id: String(existingRemote.webhook_id || existingRemote.id || local.provider_webhook_id || ''),
        status: existingRemote.enabled === false ? 'paused' : 'active',
        event_types: existingRemote.event_types || EVENTS,
        owner_id: ownerId,
        access_emails: accessEmails,
        last_error: '',
      });
      return Response.json({ available: true, connected: existingRemote.enabled !== false, webhook_url: callbackUrl, message: existingRemote.enabled === false ? 'Depop webhook exists but is paused.' : 'Depop live order webhooks are connected.' });
    }

    // If the remote URL exists but the one-time secret was lost locally, recreate it.
    if (existingRemote && !local?.signing_secret) {
      const remoteId = String(existingRemote.webhook_id || existingRemote.id || '');
      if (remoteId) await depopRequest(`/api/v1/webhooks/${encodeURIComponent(remoteId)}/`, { method: 'DELETE' });
    }

    const created = await depopRequest('/api/v1/webhooks/', {
      method: 'POST',
      body: { url: callbackUrl, enabled: true, event_types: EVENTS },
    });
    const secret = String(created?.secret || '').trim();
    const webhookId = String(created?.webhook_id || created?.id || '').trim();
    if (!secret || !webhookId) throw new Error('Depop did not return the webhook secret/id.');

    const record = {
      provider: 'Depop',
      business_id: businessId,
      owner_id: ownerId,
      access_emails: accessEmails,
      callback_key: callbackKey,
      provider_webhook_id: webhookId,
      signing_secret: secret,
      status: 'active',
      event_types: EVENTS,
      last_error: '',
    };
    if (local) await base44.asServiceRole.entities.MarketplaceWebhook.update(local.id, record);
    else local = await base44.asServiceRole.entities.MarketplaceWebhook.create({ ...record, created_by_id: ownerId });

    return Response.json({ available: true, connected: true, webhook_url: callbackUrl, message: 'Depop live order webhooks are connected.' });
  } catch (error) {
    return Response.json({ available: true, connected: false, error: String(error?.message || 'Depop webhook setup failed') }, { status: 500 });
  }
}
