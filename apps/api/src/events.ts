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

async function totals(eventId: string): Promise<{ rsvps: number; attending: number; maybe: number }> {
  return (await db
    .prepare(
      `SELECT COUNT(*) AS rsvps,
              COALESCE(SUM(CASE WHEN status = 'yes' THEN adults + children ELSE 0 END), 0) AS attending,
              COALESCE(SUM(CASE WHEN status = 'maybe' THEN adults + children ELSE 0 END), 0) AS maybe
       FROM rsvps WHERE eventId = ?`,
    )
    .get(eventId)) as { rsvps: number; attending: number; maybe: number };
}

/** Events, optionally between two ISO dates, with RSVP totals. */
export async function eventSummaries(from?: string, to?: string): Promise<EventSummary[]> {
  const all = await events.list();
  const out: EventSummary[] = [];
  for (const e of all) {
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    out.push({ ...e, ...(await totals(e.id)) });
  }
  return out;
}

export async function eventDetail(id: string): Promise<EventDetail> {
  const event = await events.get(id);
  if (!event) throw new NotFound(`events ${id} not found`);
  const families = new Map((await list<Family>('families', 'name')).map((f) => [f.id, f.name]));
  const rsvps = (await list<Rsvp>('rsvps', 'createdAt ASC'))
    .filter((r) => r.eventId === id)
    .map((r) => ({ ...r, familyName: families.get(r.familyId) ?? '' }))
    .sort((a, b) => a.familyName.localeCompare(b.familyName));
  return { event, rsvps, attending: (await totals(id)).attending };
}

/** Add or change a family's RSVP; refuse a "yes" that would go over capacity. */
export async function saveRsvp(input: RsvpInput): Promise<Rsvp> {
  const event = await events.get(input.eventId);
  if (!event) throw new NotFound(`events ${input.eventId} not found`);
  const existing = (await db.prepare('SELECT * FROM rsvps WHERE eventId = ? AND familyId = ?').get(input.eventId, input.familyId)) as
    | (Rsvp & { adults: number; children: number })
    | undefined;
  if (input.status === 'yes' && event.capacity !== undefined) {
    const t = await totals(input.eventId);
    const others = t.attending - (existing?.status === 'yes' ? existing.adults + existing.children : 0);
    const people = input.adults + input.children;
    if (others + people > event.capacity) {
      throw new Conflict(`Only ${Math.max(0, event.capacity - others)} places are left (capacity ${event.capacity})`);
    }
  }
  if (existing) return update<Rsvp>('rsvps', existing.id, input);
  return insert<Rsvp>('rsvps', { ...input, id: newId(), createdAt: new Date().toISOString() });
}

export const removeRsvp = (id: string) => removeRow('rsvps', id);
