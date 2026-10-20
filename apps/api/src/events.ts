import {
  newId,
  type EventDetail,
  type EventInput,
  type EventSummary,
  type Family,
  type Rsvp,
  type RsvpInput,
  type ShulEvent,
} from '@shulcrm/shared';
import { db } from './db.ts';
import { NotFound, get, insert, list, removeRow, update } from './repo.ts';
import { Conflict } from './settings.ts';

// ---------------------------------------------------------------------------
// Events and RSVPs (one RSVP per family per event; capacity counts the
// adults and children of "yes" RSVPs).
// ---------------------------------------------------------------------------

export const events = {
  list: () => list<ShulEvent>('events', 'date ASC, startTime ASC'),
  get: (id: string) => get<ShulEvent>('events', id),
  create: (input: EventInput) => insert<ShulEvent>('events', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<EventInput>) => update<ShulEvent>('events', id, patch),
  remove: (id: string) => removeRow('events', id),
};

function totals(eventId: string): { rsvps: number; attending: number; maybe: number } {
  return db
    .prepare(
      `SELECT COUNT(*) AS rsvps,
              COALESCE(SUM(CASE WHEN status = 'yes' THEN adults + children ELSE 0 END), 0) AS attending,
              COALESCE(SUM(CASE WHEN status = 'maybe' THEN adults + children ELSE 0 END), 0) AS maybe
       FROM rsvps WHERE eventId = ?`,
    )
    .get(eventId) as { rsvps: number; attending: number; maybe: number };
}

/** Events, optionally between two ISO dates, with RSVP totals. */
export function eventSummaries(from?: string, to?: string): EventSummary[] {
  return events
    .list()
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .map((e) => ({ ...e, ...totals(e.id) }));
}

export function eventDetail(id: string): EventDetail {
  const event = events.get(id);
  if (!event) throw new NotFound(`events ${id} not found`);
  const families = new Map(list<Family>('families', 'name').map((f) => [f.id, f.name]));
  const rsvps = list<Rsvp>('rsvps', 'createdAt ASC')
    .filter((r) => r.eventId === id)
    .map((r) => ({ ...r, familyName: families.get(r.familyId) ?? '' }))
    .sort((a, b) => a.familyName.localeCompare(b.familyName));
  return { event, rsvps, attending: totals(id).attending };
}

/** Add or change a family's RSVP; refuse a "yes" that would go over capacity. */
export function saveRsvp(input: RsvpInput): Rsvp {
  const event = events.get(input.eventId);
  if (!event) throw new NotFound(`events ${input.eventId} not found`);
  const existing = db.prepare('SELECT * FROM rsvps WHERE eventId = ? AND familyId = ?').get(input.eventId, input.familyId) as
    | (Rsvp & { adults: number; children: number })
    | undefined;
  if (input.status === 'yes' && event.capacity !== undefined) {
    const others = totals(input.eventId).attending - (existing?.status === 'yes' ? existing.adults + existing.children : 0);
    const people = input.adults + input.children;
    if (others + people > event.capacity) {
      throw new Conflict(`Only ${Math.max(0, event.capacity - others)} places are left (capacity ${event.capacity})`);
    }
  }
  if (existing) return update<Rsvp>('rsvps', existing.id, input);
  return insert<Rsvp>('rsvps', { ...input, id: newId(), createdAt: new Date().toISOString() });
}

export const removeRsvp = (id: string) => removeRow('rsvps', id);
