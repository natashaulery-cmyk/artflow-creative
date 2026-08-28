import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { GOOGLE_CALENDAR_CONNECTOR_ID } from '../../shared/calendarConnector.js';

// Creates a Google Calendar event on the connected user's primary calendar for
// a ScheduleEvent they just added in the app, and stores the returned Google
// event id back on the ScheduleEvent record. Skips silently (200) when the user
// has not connected Google Calendar.
function addHour(hhmm) {
  const parts = String(hhmm || '').split(':');
  if (parts.length < 2) return '01:00';
  const h = (Number(parts[0]) || 0) + 1;
  const m = Number(parts[1]) || 0;
  const eh = ((h % 24) + 24) % 24;
  return `${String(eh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { event_id, title, date, time, type, notes } = body;
    if (!event_id || !date || !title) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        GOOGLE_CALENDAR_CONNECTOR_ID
      ));
    } catch (e) {
      return Response.json({ skipped: true, reason: 'not_connected' });
    }
    if (!accessToken) return Response.json({ skipped: true, reason: 'not_connected' });

    const start = time ? { dateTime: `${date}T${time}:00` } : { date };
    const end = time ? { dateTime: `${date}T${addHour(time)}:00` } : { date };

    const description = [type && type !== 'Other' ? type : null, notes || null]
      .filter(Boolean)
      .join(' · ');

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ summary: title, description, start, end }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return Response.json(
        { error: 'calendar_api_error', details: txt.slice(0, 300) },
        { status: 502 }
      );
    }

    const created = await res.json();
    try {
      await base44.entities.ScheduleEvent.update(event_id, { google_event_id: created.id });
    } catch (e) {}
    return Response.json({ google_event_id: created.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}