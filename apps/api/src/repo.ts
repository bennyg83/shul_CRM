import { db } from './db.ts';
import { quoteIdent, rewriteSortClause } from './database/sql-dialect.ts';
import { getLookups, recurrenceOptions } from './settings.ts';
import { currentUser } from './context.ts';
import { ORG_SCOPED_TABLES, resolveOrgId } from './tenant.ts';
import { assertEventInOrg, assertFamilyInOrg, assertMemberInOrg, assertMemberOfFamily } from './guards.ts';

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
  events: ['rsvpOpen'],
};

function clean<T>(table: string, row: Row): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = value === null ? undefined : value;
  for (const col of BOOLEAN_COLUMNS[table] ?? []) if (out[col] !== undefined) out[col] = Boolean(out[col]);
  delete out.orgId;
  return out as T;
}

function scoped(table: string): boolean {
  return ORG_SCOPED_TABLES.has(table);
}

function toRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function toParam(value: unknown): string | number | bigint | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  throw new Error(`Unsupported SQL value: ${String(value)}`);
}

export async function list<T>(table: string, order: string): Promise<T[]> {
  const rows = scoped(table)
    ? ((await db
        .prepare(`SELECT * FROM ${quoteIdent(table)} WHERE ${quoteIdent('orgId')} = ? ORDER BY ${rewriteSortClause(order)}`)
        .all(resolveOrgId())) as Row[])
    : ((await db.prepare(`SELECT * FROM ${quoteIdent(table)} ORDER BY ${rewriteSortClause(order)}`).all()) as Row[]);
  return rows.map((row) => clean<T>(table, row));
}

export async function get<T>(table: string, id: string): Promise<T | undefined> {
  const row = scoped(table)
    ? ((await db
        .prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ? AND ${quoteIdent('orgId')} = ?`)
        .get(id, resolveOrgId())) as Row | undefined)
    : ((await db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(id)) as Row | undefined);
  return row ? clean<T>(table, row) : undefined;
}

/** Tables whose rows remember who created them (the signed-in user, if any). */
const CREATED_BY = new Set(['families', 'members', 'pledges', 'donations', 'importantDates', 'notes', 'events']);

async function guardInsert(table: string, rec: Record<string, unknown>): Promise<void> {
  switch (table) {
    case 'members':
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      break;
    case 'pledges':
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      break;
    case 'donations':
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      if (rec.pledgeId && !(await get('pledges', String(rec.pledgeId)))) throw new NotFound(`pledges ${rec.pledgeId} not found`);
      break;
    case 'importantDates':
      if (rec.memberId) await assertMemberInOrg(String(rec.memberId));
      break;
    case 'notes':
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      if (rec.memberId) await assertMemberInOrg(String(rec.memberId));
      break;
    case 'rsvps':
      if (rec.eventId) await assertEventInOrg(String(rec.eventId));
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      break;
    case 'sponsorshipClaims':
      if (rec.familyId) await assertFamilyInOrg(String(rec.familyId));
      if (rec.memberId && rec.familyId) await assertMemberOfFamily(String(rec.memberId), String(rec.familyId));
      if (rec.sponsorshipId && !(await get('sponsorships', String(rec.sponsorshipId)))) {
        throw new NotFound(`sponsorships ${rec.sponsorshipId} not found`);
      }
      break;
    default:
      break;
  }
}

export async function insert<T>(table: string, row: object): Promise<T> {
  const rec = { ...toRecord(row) };
  await guardInsert(table, rec);
  const user = currentUser();
  if (scoped(table)) rec.orgId = resolveOrgId();
  if (CREATED_BY.has(table) && user && rec.createdBy === undefined) rec.createdBy = user.id;
  const cols = Object.keys(rec);
  const qcols = cols.map(quoteIdent);
  await db
    .prepare(
      `INSERT INTO ${quoteIdent(table)} (${qcols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    )
    .run(...cols.map((c) => toParam(rec[c])));
  return (await get<T>(table, String(rec.id))) as T;
}

export async function update<T>(table: string, id: string, patch: object): Promise<T> {
  if (!(await get(table, id))) throw new NotFound(`${table} ${id} not found`);
  const rec = toRecord(patch);
  await guardInsert(table, rec);
  delete rec.orgId;
  const keys = Object.keys(rec);
  if (keys.length > 0) {
    const sql = scoped(table)
      ? `UPDATE ${quoteIdent(table)} SET ${keys.map((k) => `${quoteIdent(k)} = ?`).join(', ')} WHERE id = ? AND ${quoteIdent('orgId')} = ?`
      : `UPDATE ${quoteIdent(table)} SET ${keys.map((k) => `${quoteIdent(k)} = ?`).join(', ')} WHERE id = ?`;
    const params = [...keys.map((k) => toParam(rec[k])), id];
    if (scoped(table)) params.push(resolveOrgId());
    await db.prepare(sql).run(...params);
  }
  return (await get<T>(table, id)) as T;
}

export async function removeRow(table: string, id: string): Promise<boolean> {
  const result = scoped(table)
    ? await db.prepare(`DELETE FROM ${quoteIdent(table)} WHERE id = ? AND ${quoteIdent('orgId')} = ?`).run(id, resolveOrgId())
    : await db.prepare(`DELETE FROM ${quoteIdent(table)} WHERE id = ?`).run(id);
  return result.changes > 0;
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
} from '@shulcrm/shared';
import {
  addDaysISO,
  daysBetweenISO,
  effectiveRecurBy,
  gregorianToHebrew,
  newId,
  occurrencesBetween,
  todayISO,
  type RecurrenceOptions,
} from '@shulcrm/shared';

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
export async function dateOccurrences(
  from: string,
  to: string,
  today = todayISO(),
  options?: RecurrenceOptions,
): Promise<UpcomingDate[]> {
  const opts = options ?? (await recurrenceOptions());
  const memberById = new Map((await list<Member>('members', 'lastName COLLATE NOCASE')).map((m) => [m.id, m]));
  const familyById = new Map((await list<Family>('families', 'name COLLATE NOCASE')).map((f) => [f.id, f]));

  const out: UpcomingDate[] = [];
  for (const dt of await list<ImportantDate>('importantDates', 'date ASC')) {
    const member = memberById.get(dt.memberId);
    if (!member) continue;
    for (const occurrence of occurrencesBetween(dt, from, to, opts)) {
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
        recurBy: dt.recurring ? effectiveRecurBy(dt, opts) : 'once',
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
export async function upcomingImportantDates(
  days = 90,
  today = todayISO(),
  options?: RecurrenceOptions,
): Promise<UpcomingDate[]> {
  const opts = options ?? (await recurrenceOptions());
  return dateOccurrences(today, addDaysISO(today, days), today, opts);
}

// ---------------------------------------------------------------------------
// Composed detail views (one family / one member with their related records)
// ---------------------------------------------------------------------------

export async function familyDetail(id: string): Promise<FamilyDetail> {
  const family = await get<Family>('families', id);
  if (!family) throw new NotFound(`families ${id} not found`);
  const memberList = (await list<Member>('members', 'lastName COLLATE NOCASE, firstName COLLATE NOCASE')).filter(
    (m) => m.familyId === id,
  );
  const memberIds = new Set(memberList.map((m) => m.id));
  const pledgeList = (await list<Pledge>('pledges', 'year DESC, createdAt DESC')).filter((p) => p.familyId === id);
  const donationList = (await list<Donation>('donations', 'date DESC, createdAt DESC')).filter((d) => d.familyId === id);
  const dateList = (await list<ImportantDate>('importantDates', 'date ASC')).filter((d) => memberIds.has(d.memberId));
  const noteList = (await list<Note>('notes', 'createdAt DESC')).filter(
    (n) => n.familyId === id || (n.memberId !== undefined && memberIds.has(n.memberId)),
  );
  return { family, members: memberList, pledges: pledgeList, donations: donationList, importantDates: dateList, notes: noteList };
}

export async function memberDetail(id: string): Promise<MemberDetail> {
  const member = await get<Member>('members', id);
  if (!member) throw new NotFound(`members ${id} not found`);
  const family = await get<Family>('families', member.familyId);
  if (!family) throw new NotFound(`families ${member.familyId} not found`);
  const dateList = (await list<ImportantDate>('importantDates', 'date ASC')).filter((d) => d.memberId === id);
  const noteList = (await list<Note>('notes', 'createdAt DESC')).filter((n) => n.memberId === id);
  return { member, family, importantDates: dateList, notes: noteList };
}

import {
  seedDonations,
  seedFamilies,
  seedImportantDates,
  seedMembers,
  seedNotes,
  seedPledges,
} from '@shulcrm/shared/seed';

// ---------------------------------------------------------------------------
// Dashboard stats (same math as the old mock service: overpayment on one
// pledge never offsets underpayment on another)
// ---------------------------------------------------------------------------

export async function dashboardStats(): Promise<DashboardStats> {
  const year = new Date().getFullYear();
  const orgId = resolveOrgId();

  async function count(table: string, active: boolean): Promise<number> {
    const row = (await db
      .prepare(
        active
          ? `SELECT COUNT(*) AS n FROM ${table} WHERE orgId = ? AND status = 'active'`
          : `SELECT COUNT(*) AS n FROM ${table} WHERE orgId = ?`,
      )
      .get(orgId)) as { n: number };
    return row.n;
  }

  const lookups = await getLookups();
  const currencyTotals = (rows: { currency: string; total: number }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of lookups.currencies) out[c.key] = 0;
    for (const r of rows) out[r.currency] = r.total;
    return out;
  };

  const pledgeRows = (await db
    .prepare(`
        SELECT p.currency AS currency,
               COALESCE(SUM(GREATEST(0, p.amount - COALESCE(
                 (SELECT SUM(d.amount) FROM donations d WHERE d.pledgeId = p.id AND d.currency = p.currency), 0)
               )), 0) AS total
        FROM pledges p
        WHERE p.orgId = ? AND p.year = ?
        GROUP BY p.currency
      `)
    .all(orgId, year)) as { currency: string; total: number }[];
  const openPledgeBalance = currencyTotals(pledgeRows);

  const donationRows = (await db
    .prepare(
      `SELECT currency AS currency, COALESCE(SUM(amount), 0) AS total FROM donations WHERE orgId = ? AND date LIKE ? GROUP BY currency`,
    )
    .all(orgId, `${year}%`)) as { currency: string; total: number }[];
  const donatedYtd = currencyTotals(donationRows);

  return {
    families: await count('families', false),
    activeFamilies: await count('families', true),
    members: await count('members', false),
    activeMembers: await count('members', true),
    openPledgeBalance,
    donatedYtd,
  };
}

// ---------------------------------------------------------------------------
// Seed (deterministic data from @shulcrm/shared)
// ---------------------------------------------------------------------------

export async function reseed(): Promise<void> {
  const orgId = resolveOrgId();
  await db.exec('BEGIN');
  try {
    for (const table of ['notes', 'importantDates', 'donations', 'pledges', 'members', 'families']) {
      await db.prepare(`DELETE FROM ${table} WHERE orgId = ?`).run(orgId);
    }
    for (const family of seedFamilies) await insert<Family>('families', family);
    for (const member of seedMembers) await insert<Member>('members', member);
    for (const pledge of seedPledges) await insert<Pledge>('pledges', pledge);
    for (const donation of seedDonations) await insert<Donation>('donations', donation);
    for (const date of seedImportantDates) await insert<ImportantDate>('importantDates', date);
    for (const note of seedNotes) await insert<Note>('notes', note);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
