import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ensureFreshEbayConnection, ebayJson } from '../../shared/ebay.js';
import { functionUrl } from '../../shared/marketplaceWebhook.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const listFrom = (payload, ...keys) => {
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    let email = '';
    try { email = (await base44.auth.me())?.email || ''; } catch {}
    const { ownerId, businessId } = await resolveBusinessWorkspace(base44, email);
    if (!ownerId || !businessId) return Response.json({ error: 'No business workspace found.' }, { status: 400 });

    const all = await base44.asServiceRole.entities.EbayConnection.list('-updated_date', 100);
    let connection = all.find((x) => x.business_id === businessId && x.status === 'connected');
    if (!connection) return Response.json({ available: true, connected: false, needs_connection: true, message: 'Connect eBay first.' });
    connection = await ensureFreshEbayConnection(base44, connection);

    const callbackKey = String(connection.callback_key || randomToken());
    const verificationToken = String(connection.verification_token || randomToken(20));
    const endpoint = functionUrl('ebayWebhook', callbackKey);

    // eBay immediately sends a GET challenge while createDestination is in flight.
    // Persist these values first so ebayWebhook can answer that challenge.
    await base44.asServiceRole.entities.EbayConnection.update(connection.id, {
      callback_key: callbackKey,
      verification_token: verificationToken,
      last_error: '',
    });
    connection = { ...connection, callback_key: callbackKey, verification_token: verificationToken };

    let destinationsPayload = await ebayJson('/commerce/notification/v1/destination?limit=100', connection.access_token);
    let destinations = listFrom(destinationsPayload, 'destinations');
    let destination = destinations.find((d) => String(d?.deliveryConfig?.endpoint || '') === endpoint);

    if (!destination) {
      await ebayJson('/commerce/notification/v1/destination', connection.access_token, {
        method: 'POST',
        body: {
          name: `ArtFlow-${businessId.slice(0, 12)}`,
          status: 'ENABLED',
          deliveryConfig: { endpoint, verificationToken },
        },
      });
      destinationsPayload = await ebayJson('/commerce/notification/v1/destination?limit=100', connection.access_token);
      destinations = listFrom(destinationsPayload, 'destinations');
      destination = destinations.find((d) => String(d?.deliveryConfig?.endpoint || '') === endpoint);
    }
    const destinationId = String(destination?.destinationId || connection.notification_destination_id || '').trim();
    if (!destinationId) throw new Error('eBay destination was created but could not be located.');

    let topic = null;
    try { topic = await ebayJson('/commerce/notification/v1/topic/ORDER_CONFIRMATION', connection.access_token); } catch {
      const topicsPayload = await ebayJson('/commerce/notification/v1/topic?limit=100', connection.access_token);
      topic = listFrom(topicsPayload, 'topics').find((t) => String(t?.topicId || t?.topic || '') === 'ORDER_CONFIRMATION') || null;
    }
    const supported = Array.isArray(topic?.supportedPayloads) ? topic.supportedPayloads[0] : null;
    const supportedFormat = Array.isArray(supported?.format) ? supported.format[0] : supported?.format;
    const subscriptionPayload = {
      deliveryProtocol: supported?.deliveryProtocol || 'HTTPS',
      format: supportedFormat || 'JSON',
      schemaVersion: supported?.schemaVersion || '1.0',
    };

    let subsPayload = await ebayJson('/commerce/notification/v1/subscription?limit=100', connection.access_token);
    let subs = listFrom(subsPayload, 'subscriptions');
    let subscription = subs.find((s) => String(s?.topicId || '') === 'ORDER_CONFIRMATION' && String(s?.destinationId || '') === destinationId);
    if (!subscription) {
      await ebayJson('/commerce/notification/v1/subscription', connection.access_token, {
        method: 'POST',
        body: { topicId: 'ORDER_CONFIRMATION', destinationId, status: 'ENABLED', payload: subscriptionPayload },
      });
      subsPayload = await ebayJson('/commerce/notification/v1/subscription?limit=100', connection.access_token);
      subs = listFrom(subsPayload, 'subscriptions');
      subscription = subs.find((s) => String(s?.topicId || '') === 'ORDER_CONFIRMATION' && String(s?.destinationId || '') === destinationId);
    }
    const subscriptionId = String(subscription?.subscriptionId || connection.notification_subscription_id || '').trim();
    if (!subscriptionId) throw new Error('eBay subscription was created but could not be located.');

    await base44.asServiceRole.entities.EbayConnection.update(connection.id, {
      callback_key: callbackKey,
      verification_token: verificationToken,
      notification_destination_id: destinationId,
      notification_subscription_id: subscriptionId,
      status: 'connected',
      last_error: '',
    });

    return Response.json({ available: true, connected: true, notifications_connected: true, message: 'eBay live order notifications are connected.' });
  } catch (error) {
    return Response.json({ available: true, connected: false, error: String(error?.message || 'eBay notification setup failed') }, { status: 500 });
  }
}
