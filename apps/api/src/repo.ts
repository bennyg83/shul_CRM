import { db } from './db.ts';

// ---------------------------------------------------------------------------
// Data access for the six core entities. Column names mirror the JSON field
// names exactly (see db.ts), so rows map to shared entity types with only
// null -> undefined normalization.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export class NotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFound';
  }
}

// SQLite has no boolean type: boolean columns round-trip as 0/1, so map them back to booleans.
const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  importantDates: ['recurring', 'afterNightfall'],
};

function clean<T>(table: string, row: Row): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = value === null ? undefined : value;
  for (const col of BOOLEAN_COLUMNS[table] ?? []) if (out[col] !== undefined) out[col] = Boolean(out[col]);
  return out as T;
}

function toRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function toParam(value: unknown): string | number | bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  throw new Error(`Unsupported SQL value: ${String(value)}`);
}

export function list<T>(table: string, order: string): T[] {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all() as Row[]; // raw table rows
  return rows.map((row) => clean<T>(table, row));
}

export function get<T>(table: string, id: string): T | undefined {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
  return row ? clean<T>(table, row) : undefined;
}

export function insert<T>(table: string, row: object): T {
  const rec = toRecord(row);
  const cols = Object.keys(rec);
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
    ...cols.map((c) => toParam(rec[c]))
  );
  return get<T>(table, String(rec.id)) as T;
}

export function update<T>(table: string, id: string, patch: object): T {
  if (!get(table, id)) throw new NotFound(`${table} ${id} not found`);
  const rec = toRecord(patch);
  const keys = Object.keys(rec);
  if (keys.length > 0) {
    db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((k) => toParam(rec[k])),
      id
    );
  }
  return get<T>(table, id) as T;
}

export function removeRow(table: string, id: string): boolean {
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
}

import type {
  DashboardStats,
  Donation,
  DonationInput,
  Family,
  FamilyDetail,
  FamilyInput,
  ImportantDate,
  ImportantDateInput,
  Member,
  MemberDetail,
  MemberInput,
  Note,
  NoteInput,
  Pledge,
  PledgeInput,
  UpcomingDate,
} from '@pilzno/shared';
import {
  CURRENCIES,
  addDaysISO,
  daysBetweenISO,
  effectiveRecurBy,
  gregorianToHebrew,
  newId,
  occurrencesBetween,
  todayISO,
  type RecurrenceOptions,
} from '@pilzno/shared';

// ---------------------------------------------------------------------------
// Entity repos (cascades handled by the DDL foreign keys in db.ts)
// ---------------------------------------------------------------------------

export const families = {
  list: () => list<Family>('families', 'name COLLATE NOCASE'),
  get: (id: string) => get<Family>('families', id),
  create: (input: FamilyInput) =>
    insert<Family>('families', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<FamilyInput>) => update<Family>('families', id, patch),
  remove: (id: string) => removeRow('families', id),
};

export const members = {
  list: () => list<Member>('members', 'lastName COLLATE NOCASE, firstName COLLATE NOCASE'),
  get: (id: string) => get<Member>('members', id),
  create: (input: MemberInput) =>
    insert<Member>('members', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<MemberInput>) => update<Member>('members', id, patch),
  remove: (id: string) => removeRow('members', id),
};

export const pledges = {
  list: () => list<Pledge>('pledges', 'year DESC, createdAt DESC'),
  create: (input: PledgeInput) =>
    insert<Pledge>('pledges', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<PledgeInput>) => update<Pledge>('pledges', id, patch),
  remove: (id: string) => removeRow('pledges', id),
};

export const donations = {
  list: () => list<Donation>('donations', 'date DESC, createdAt DESC'),
  create: (input: DonationInput) =>
    insert<Donation>('donations', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<DonationInput>) => update<Donation>('donations', id, patch),
  remove: (id: string) => removeRow('donations', id),
};

export const importantDates = {
  list: () => list<ImportantDate>('importantDates', 'date ASC'),
  create: (input: ImportantDateInput) => insert<ImportantDate>('importantDates', { ...input, id: newId() }),
  update: (id: string, patch: Partial<ImportantDateInput>) => update<ImportantDate>('importantDates', id, patch),
  remove: (id: string) => removeRow('importantDates', id),
};

export const notes = {
  list: () => list<Note>('notes', 'createdAt DESC'),
  create: (input: NoteInput) =>
    insert<Note>('notes', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<NoteInput>) => update<Note>('notes', id, patch),
  remove: (id: string) => removeRow('notes', id),
};

// ---------------------------------------------------------------------------
// Upcoming important dates and calendar occurrences (shared recurrence rules:
// Hebrew dates repeat on their Hebrew anniversary, with the yahrzeit rules)
// ---------------------------------------------------------------------------

/** Every occurrence of every important date in [from, to] (inclusive ISO dates), with
 * member/family resolved. `today` (ISO) sets daysUntil; it is injectable for tests. */
export function dateOccurrences(from: string, to: string, today = todayISO(), options?: RecurrenceOptions): UpcomingDate[] {
  const memberById = new Map(list<Member>('members', 'lastName COLLATE NOCASE').map((m) => [m.id, m]));
  const familyById = new Map(list<Family>('families', 'name COLLATE NOCASE').map((f) => [f.id, f]));

  const out: UpcomingDate[] = [];
  for (const dt of list<ImportantDate>('importantDates', 'date ASC')) {
    const member = memberById.get(dt.memberId);
    if (!member) continue;
    for (const occurrence of occurrencesBetween(dt, from, to, options)) {
      out.push({
        id: dt.id,
        memberId: dt.memberId,
        memberName: `${member.firstName} ${member.lastName}`,
        familyId: member.familyId,
        familyName: familyById.get(member.familyId)?.name ?? '',
        type: dt.type,
        date: dt.date,
        nextOccurrence: occurrence,
        daysUntil: daysBetweenISO(today, occurrence),
        hebrewDay: dt.hebrewDay,
        hebrewMonth: dt.hebrewMonth,
        hebrewYear: dt.hebrewYear,
        recurBy: dt.recurring ? effectiveRecurBy(dt) : 'once',
        occurrenceHebrew: gregorianToHebrew(occurrence),
      });
    }
  }
  out.sort(
    (a, b) => a.nextOccurrence.localeCompare(b.nextOccurrence) || a.memberName.localeCompare(b.memberName),
  );
  return out;
}

/** Upcoming important dates within `days` days of `today` (ISO), soonest first. */
export function upcomingImportantDates(days = 90, today = todayISO(), options?: RecurrenceOptions): UpcomingDate[] {
  return dateOccurrences(today, addDaysISO(today, days), today, options);
}

// ---------------------------------------------------------------------------
// Composed detail views (one family / one member with their related records)
// ---------------------------------------------------------------------------

export function familyDetail(id: string): FamilyDetail {
  const family = get<Family>('families', id);
  if (!family) throw new NotFound(`families ${id} not found`);
  const members = list<Member>('members', 'lastName COLLATE NOCASE, firstName COLLATE NOCASE').filter(
    (m) => m.familyId === id
  );
  const memberIds = new Set(members.map((m) => m.id));
  const pledges = list<Pledge>('pledges', 'year DESC, createdAt DESC').filter((p) => p.familyId === id);
  const donations = list<Donation>('donations', 'date DESC, createdAt DESC').filter((d) => d.familyId === id);
  const importantDates = list<ImportantDate>('importantDates', 'date ASC').filter((d) =>
    memberIds.has(d.memberId)
  );
  const notes = list<Note>('notes', 'createdAt DESC').filter(
    (n) => n.familyId === id || (n.memberId !== undefined && memberIds.has(n.memberId))
  );
  return { family, members, pledges, donations, importantDates, notes };
}

export function memberDetail(id: string): MemberDetail {
  const member = get<Member>('members', id);
  if (!member) throw new NotFound(`members ${id} not found`);
  const family = get<Family>('families', member.familyId);
  if (!family) throw new NotFound(`families ${member.familyId} not found`);
  const importantDates = list<ImportantDate>('importantDates', 'date ASC').filter((d) => d.memberId === id);
  const notes = list<Note>('notes', 'createdAt DESC').filter((n) => n.memberId === id);
  return { member, family, importantDates, notes };
}

import {
  seedDonations,
  seedFamilies,
  seedImportantDates,
  seedMembers,
  seedNotes,
  seedPledges,
} from '@pilzno/shared/seed';

// ---------------------------------------------------------------------------
// Dashboard stats (same math as the old mock service: overpayment on one
// pledge never offsets underpayment on another)
// ---------------------------------------------------------------------------

export function dashboardStats(): DashboardStats {
  const year = new Date().getFullYear();

  function count(table: string, active: boolean): number {
    // COUNT(*) always returns a single { n } row.
    const row = db
      .prepare(
        active
          ? `SELECT COUNT(*) AS n FROM ${table} WHERE status = 'active'`
          : `SELECT COUNT(*) AS n FROM ${table}`
      )
      .get() as { n: number };
    return row.n;
  }

  // Per-currency totals: group by currency so mixed-currency KPIs don't add apples and oranges.
  const currencyTotals = (rows: { currency: string; total: number }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of CURRENCIES) out[c] = 0;
    for (const r of rows) out[r.currency] = r.total;
    return out;
  };

  const pledgeRows = db
    .prepare(`
        SELECT p.currency AS currency,
               COALESCE(SUM(MAX(0, p.amount - COALESCE(
                 (SELECT SUM(d.amount) FROM donations d WHERE d.pledgeId = p.id), 0)
               )), 0) AS total
        FROM pledges p
        WHERE p.year = ?
        GROUP BY p.currency
      `)
    .all(year) as { currency: string; total: number }[];
  const openPledgeBalance = currencyTotals(pledgeRows);

  const donationRows = db
    .prepare(`SELECT currency AS currency, COALESCE(SUM(amount), 0) AS total FROM donations WHERE date LIKE ? GROUP BY currency`)
    .all(`${year}%`) as { currency: string; total: number }[];
  const donatedYtd = currencyTotals(donationRows);

  return {
    families: count('families', false),
    activeFamilies: count('families', true),
    members: count('members', false),
    activeMembers: count('members', true),
    openPledgeBalance,
    donatedYtd,
  };
}

// ---------------------------------------------------------------------------
// Seed (deterministic data from @pilzno/shared)
// ---------------------------------------------------------------------------

export function reseed(): void {
  db.exec('BEGIN');
  try {
    for (const table of ['notes', 'importantDates', 'donations', 'pledges', 'members', 'families']) {
      db.exec(`DELETE FROM ${table}`);
    }
    for (const family of seedFamilies) insert<Family>('families', family);
    for (const member of seedMembers) insert<Member>('members', member);
    for (const pledge of seedPledges) insert<Pledge>('pledges', pledge);
    for (const donation of seedDonations) insert<Donation>('donations', donation);
    for (const date of seedImportantDates) insert<ImportantDate>('importantDates', date);
    for (const note of seedNotes) insert<Note>('notes', note);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
