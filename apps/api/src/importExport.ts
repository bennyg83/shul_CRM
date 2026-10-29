import type { ZodTypeAny } from 'zod';
import {
  IMPORT_SPECS,
  donationInputSchema,
  familyInputSchema,
  gregorianToHebrew,
  formatHebrew,
  importantDateInputSchema,
  lookupLabel,
  memberInputSchema,
  pledgeInputSchema,
  type Donation,
  type Family,
  type ImportEntity,
  type ImportField,
  type ImportPreview,
  type ImportRequest,
  type ImportResult,
  type ImportRowResult,
  type ImportantDate,
  type LookupKind,
  type Member,
  type Pledge,
} from '@shulcrm/shared';
import { db } from './db.ts';
import * as repo from './repo.ts';
import { BadRequest, ensureLookupKeys, getLookups, getOrg } from './settings.ts';
import { excelSerialToISO } from './spreadsheet.ts';

// ---------------------------------------------------------------------------
// Import: rows + a column mapping -> validated records, with duplicates and
// missing references found before anything is written. Commit re-runs the same
// analysis and writes every accepted row in one transaction.
// ---------------------------------------------------------------------------

export const MAX_IMPORT_ROWS = 10_000;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');

const INPUT_SCHEMAS: Record<ImportEntity, ZodTypeAny> = {
  families: familyInputSchema,
  members: memberInputSchema,
  pledges: pledgeInputSchema,
  donations: donationInputSchema,
  importantDates: importantDateInputSchema,
};

/** A date in a cell: ISO, an Excel day number, or d/m/y (m/d/y for a US locale). */
export function parseDate(text: string, usOrder: boolean): string | undefined {
  const s = text.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if (/^\d{2,5}(\.\d+)?$/.test(s) && Number(s) > 59 && Number(s) < 80_000) {
    return excelSerialToISO(Math.floor(Number(s)));
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    let a = Number(match[1]);
    let b = Number(match[2]);
    // Day-first unless the shul is US-style; a part over 12 settles it either way.
    if (usOrder ? a <= 12 || b > 12 : a <= 12 && b > 12) [a, b] = [b, a];
    [d, m] = [a, b];
    y = Number(match[3]);
    if (match[3].length === 2) y += y > 30 ? 1900 : 2000;
  } else {
    return undefined;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

/** An amount in a cell: "$1,200.50", "1200", "1.200,50". */
export function parseNumber(text: string): number | undefined {
  let s = text.replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^-?\d+(\.\d+)?$/.test(s.replace(/,/g, ''))) s = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

const TRUE_WORDS = ['yes', 'y', 'true', '1', 'x', '✓', 'after', 'evening', 'night'];
const FALSE_WORDS = ['no', 'n', 'false', '0', 'before', 'day', 'daytime'];

interface Context {
  families: Family[];
  members: Member[];
  usOrder: boolean;
  lists: Awaited<ReturnType<typeof getLookups>>;
  defaultCurrency: string;
}

interface Analyzed {
  result: ImportRowResult;
  /** The record to create; family references to new families are "new:<name>". */
  record?: Record<string, unknown>;
  newListItems: Array<{ list: LookupKind; key: string }>;
  newFamily?: string;
}

async function context(): Promise<Context> {
  const org = await getOrg();
  return {
    families: await repo.families.list(),
    members: await repo.members.list(),
    usOrder: org.locale.toLowerCase().startsWith('en-us'),
    lists: await getLookups(),
    defaultCurrency: org.defaultCurrency,
  };
}

function analyzeRow(entity: ImportEntity, row: string[], index: number, req: ImportRequest, ctx: Context): Analyzed {
  const spec = IMPORT_SPECS[entity];
  const messages: string[] = [];
  const record: Record<string, unknown> = {};
  const newListItems: Analyzed['newListItems'] = [];
  let newFamily: string | undefined;
  const cell = (key: string) => {
    const col = req.mapping[key];
    const v = col === undefined ? undefined : row[col]?.trim();
    return v ? v : undefined;
  };

  const convert = (f: ImportField, text: string): unknown => {
    switch (f.kind) {
      case 'text':
        return text;
      case 'email':
        return text.toLowerCase();
      case 'date': {
        const iso = parseDate(text, ctx.usOrder);
        if (!iso) messages.push(`${f.label}: "${text}" is not a date`);
        return iso;
      }
      case 'number': {
        const n = parseNumber(text);
        if (n === undefined) messages.push(`${f.label}: "${text}" is not a number`);
        return n;
      }
      case 'integer': {
        const n = parseNumber(text);
        if (n === undefined || !Number.isInteger(n)) messages.push(`${f.label}: "${text}" is not a whole number`);
        return n;
      }
      case 'boolean': {
        const t = norm(text);
        if (TRUE_WORDS.includes(t)) return true;
        if (FALSE_WORDS.includes(t)) return false;
        messages.push(`${f.label}: "${text}" should be yes or no`);
        return undefined;
      }
      case 'choice': {
        const t = norm(text);
        const hit = Object.entries(f.choices ?? {}).find(([key, words]) => key === t || words.includes(t));
        if (!hit) messages.push(`${f.label}: "${text}" should be one of ${Object.keys(f.choices ?? {}).join(', ')}`);
        return hit?.[0];
      }
      case 'lookup': {
        const items = ctx.lists[f.lookup as LookupKind] as Array<{ key: string; label: string }>;
        const hit = items.find((i) => norm(i.key) === norm(text) || norm(i.label) === norm(text));
        if (hit) return hit.key;
        const key = f.lookup === 'currencies' ? text.toUpperCase() : text.trim();
        newListItems.push({ list: f.lookup as LookupKind, key });
        return key;
      }
      default:
        return text;
    }
  };

  for (const f of spec.fields) {
    const text = cell(f.key);
    if (text === undefined) {
      if (f.required) messages.push(`${f.label} is missing`);
      continue;
    }
    if (f.kind === 'ref') continue; // resolved below
    const value = convert(f, text);
    if (value !== undefined) record[f.key] = value;
  }

  // Family by name (members, pledges, donations; optional for dates, to tell members apart).
  const familyName = cell('family');
  let familyId: string | undefined;
  if (familyName !== undefined && entity !== 'families') {
    const matches = ctx.families.filter((fam) => norm(fam.name) === norm(familyName));
    if (matches.length === 1) familyId = matches[0].id;
    else if (matches.length > 1) messages.push(`${matches.length} families are named "${familyName}"`);
    else if (req.createMissingFamilies && entity !== 'importantDates') {
      familyId = `new:${norm(familyName)}`;
      newFamily = familyName.trim();
    } else messages.push(`No family named "${familyName}"`);
  }
  if (entity === 'members' || entity === 'pledges' || entity === 'donations') {
    if (familyId) record.familyId = familyId;
    if (entity === 'members' && record.lastName === undefined && familyName) record.lastName = familyName.trim();
    if (entity === 'members') {
      record.gender ??= 'other';
      record.status ??= 'active';
    }
    if (entity !== 'members') record.currency ??= ctx.defaultCurrency;
  }
  if (entity === 'families') record.status ??= 'active';

  // Member by "First Last" (dates), within the family if one was given.
  if (entity === 'importantDates') {
    const memberName = cell('member');
    if (memberName !== undefined) {
      const matches = ctx.members.filter(
        (m) => norm(`${m.firstName} ${m.lastName}`) === norm(memberName) && (!familyId || m.familyId === familyId),
      );
      if (matches.length === 1) record.memberId = matches[0].id;
      else if (matches.length > 1) messages.push(`${matches.length} members are named "${memberName}"; add a Family column`);
      else messages.push(`No member named "${memberName}"${familyName ? ` in "${familyName}"` : ''}`);
    }
    if (typeof record.date === 'string') {
      const h = gregorianToHebrew(record.date, { afterNightfall: record.afterNightfall === true });
      Object.assign(record, { hebrewDay: h.day, hebrewMonth: h.month, hebrewYear: h.year });
    }
    record.recurring ??= true;
  }
  delete record.family;
  delete record.member;

  // Final check with the API's own schema (ids for new families are placeholders until commit).
  if (messages.length === 0) {
    const forSchema = { ...record };
    if (typeof forSchema.familyId === 'string' && forSchema.familyId.startsWith('new:')) {
      forSchema.familyId = '00000000-0000-7000-8000-000000000000';
    }
    const parsed = INPUT_SCHEMAS[entity].safeParse(forSchema);
    if (!parsed.success) for (const issue of parsed.error.issues) messages.push(`${issue.path.join('.') || 'Row'}: ${issue.message}`);
  }

  const summary = summarize(entity, record, familyName, cell('member'));
  return {
    result: { row: index, status: messages.length > 0 ? 'error' : 'ok', messages, summary },
    record: messages.length > 0 ? undefined : record,
    newListItems: messages.length > 0 ? [] : newListItems,
    newFamily: messages.length > 0 ? undefined : newFamily,
  };
}

function summarize(entity: ImportEntity, r: Record<string, unknown>, family?: string, member?: string): string {
  const parts: unknown[] = (() => {
    switch (entity) {
      case 'families':
        return [r.name, r.city, r.phone];
      case 'members':
        return [`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(), family, r.birthDate];
      case 'pledges':
        return [family, r.fund, r.year, r.amount !== undefined ? `${r.amount} ${r.currency ?? ''}` : undefined];
      case 'donations':
        return [family, r.date, r.fund, r.amount !== undefined ? `${r.amount} ${r.currency ?? ''}` : undefined];
      case 'importantDates':
        return [member, r.type, r.date];
    }
  })();
  return parts.filter((p) => p !== undefined && p !== '').join(' · ');
}

/** The key two records share when they are the same thing (see IMPORT_SPECS.duplicateRule). */
function duplicateKey(entity: ImportEntity, r: Record<string, unknown>): string {
  const s = (v: unknown) => norm(String(v ?? ''));
  switch (entity) {
    case 'families':
      return [s(r.name), digits(r.phone as string | undefined)].join('|');
    case 'members':
      return [r.familyId, s(r.firstName), s(r.lastName)].join('|');
    case 'pledges':
      return [r.familyId, s(r.fund), r.year, Number(r.amount), s(r.currency)].join('|');
    case 'donations':
      return [r.familyId, r.date, s(r.fund), Number(r.amount)].join('|');
    case 'importantDates':
      return [r.memberId, s(r.type), r.date].join('|');
  }
}

async function existingKeys(entity: ImportEntity): Promise<Set<string>> {
  const rows: Array<Record<string, unknown>> = (() => {
    switch (entity) {
      case 'families':
        return [] as Array<Record<string, unknown>>;
      case 'members':
        return [];
      case 'pledges':
        return [];
      case 'donations':
        return [];
      case 'importantDates':
        return [];
    }
  })();
  switch (entity) {
    case 'families':
      rows.push(...(await repo.families.list()));
      break;
    case 'members':
      rows.push(...(await repo.members.list()));
      break;
    case 'pledges':
      rows.push(...(await repo.pledges.list()));
      break;
    case 'donations':
      rows.push(...(await repo.donations.list()));
      break;
    case 'importantDates':
      rows.push(...(await repo.importantDates.list()));
      break;
  }
  return new Set(rows.map((r) => duplicateKey(entity, r)));
}

async function analyze(entity: ImportEntity, req: ImportRequest) {
  if (!Array.isArray(req.rows) || typeof req.mapping !== 'object' || req.mapping === null) {
    throw new BadRequest('Send rows and a column mapping');
  }
  if (req.rows.length > MAX_IMPORT_ROWS) throw new BadRequest(`At most ${MAX_IMPORT_ROWS} rows per import`);
  const ctx = await context();
  const seen = await existingKeys(entity);
  const analyzed = req.rows.map((row, i) => analyzeRow(entity, row.map(String), i, req, ctx));
  for (const a of analyzed) {
    if (!a.record) continue;
    const key = duplicateKey(entity, a.record);
    if (seen.has(key)) {
      a.result.status = 'duplicate';
      a.result.messages.push('Looks like a record that is already here (or an earlier row)');
    }
    seen.add(key);
  }
  return analyzed;
}

function summarizePreview(analyzed: Analyzed[], req: ImportRequest): ImportPreview {
  const used = analyzed.filter((a) => a.result.status === 'ok' || (a.result.status === 'duplicate' && req.skipDuplicates === false));
  const items = new Map<string, { list: LookupKind; key: string }>();
  for (const a of used) for (const i of a.newListItems) items.set(`${i.list}:${i.key}`, i);
  const families = new Map<string, string>();
  for (const a of used) if (a.newFamily) families.set(norm(a.newFamily), a.newFamily);
  const counts = { ok: 0, duplicate: 0, error: 0 };
  for (const a of analyzed) counts[a.result.status]++;
  return {
    results: analyzed.map((a) => a.result),
    counts,
    newListItems: [...items.values()],
    newFamilies: [...families.values()],
  };
}

export async function previewImport(entity: ImportEntity, req: ImportRequest): Promise<ImportPreview> {
  return summarizePreview(await analyze(entity, req), req);
}

export async function commitImport(entity: ImportEntity, req: ImportRequest): Promise<ImportResult> {
  const analyzed = await analyze(entity, req);
  const preview = summarizePreview(analyzed, req);
  const accepted = analyzed.filter(
    (a) => a.record && (a.result.status === 'ok' || (a.result.status === 'duplicate' && req.skipDuplicates === false)),
  );

  await db.exec('BEGIN');
  try {
    const byList = new Map<LookupKind, string[]>();
    for (const i of preview.newListItems) byList.set(i.list, [...(byList.get(i.list) ?? []), i.key]);
    for (const [list, keys] of byList) await ensureLookupKeys(list, keys);

    const newFamilyIds = new Map<string, string>();
    for (const name of preview.newFamilies) {
      const fam = await repo.families.create({ name, status: 'active' });
      newFamilyIds.set(`new:${norm(name)}`, fam.id);
    }

    for (const a of accepted) {
      const r = { ...a.record };
      if (typeof r.familyId === 'string' && r.familyId.startsWith('new:')) r.familyId = newFamilyIds.get(r.familyId);
      switch (entity) {
        case 'families':
          await repo.families.create(familyInputSchema.parse(r) as Parameters<typeof repo.families.create>[0]);
          break;
        case 'members':
          await repo.members.create(memberInputSchema.parse(r) as Parameters<typeof repo.members.create>[0]);
          break;
        case 'pledges':
          await repo.pledges.create(pledgeInputSchema.parse(r) as Parameters<typeof repo.pledges.create>[0]);
          break;
        case 'donations':
          await repo.donations.create(donationInputSchema.parse(r) as Parameters<typeof repo.donations.create>[0]);
          break;
        case 'importantDates':
          await repo.importantDates.create(importantDateInputSchema.parse(r) as Parameters<typeof repo.importantDates.create>[0]);
          break;
      }
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
  return {
    created: accepted.length,
    skipped: analyzed.length - accepted.length - preview.counts.error,
    failed: preview.counts.error,
    newFamilies: preview.newFamilies.length,
    newListItems: preview.newListItems.length,
  };
}

// ---------------------------------------------------------------------------
// Export: one sheet per entity, headed by the import labels so it imports back.
// ---------------------------------------------------------------------------

export async function exportTable(entity: ImportEntity): Promise<{ headers: string[]; rows: Array<Array<string | number>> }> {
  const spec = IMPORT_SPECS[entity];
  const lists = await getLookups();
  const familyName = new Map((await repo.families.list()).map((f) => [f.id, f.name]));
  const memberById = new Map((await repo.members.list()).map((m) => [m.id, m]));
  const yesNo = (v: unknown) => (v === undefined ? '' : v ? 'Yes' : 'No');

  const value = (f: ImportField, r: Record<string, unknown>): string | number => {
    if (f.key === 'family') {
      if (entity === 'importantDates') return familyName.get(memberById.get(r.memberId as string)?.familyId ?? '') ?? '';
      return familyName.get(r.familyId as string) ?? '';
    }
    if (f.key === 'member') {
      const m = memberById.get(r.memberId as string);
      return m ? `${m.firstName} ${m.lastName}` : '';
    }
    const v = r[f.key];
    if (v === undefined || v === null) return '';
    if (f.kind === 'boolean') return yesNo(v);
    if (f.kind === 'lookup') return lookupLabel(lists[f.lookup as LookupKind], String(v));
    if (typeof v === 'number') return v;
    return String(v);
  };

  const records: Array<Record<string, unknown>> = (() => {
    switch (entity) {
      case 'families':
        return [] as Array<Record<string, unknown>>;
      case 'members':
        return [];
      case 'pledges':
        return [] as Pledge[];
      case 'donations':
        return [] as Donation[];
      case 'importantDates':
        return [] as ImportantDate[];
    }
  })();
  switch (entity) {
    case 'families':
      records.push(...(await repo.families.list()));
      break;
    case 'members':
      records.push(...(await repo.members.list()));
      break;
    case 'pledges':
      records.push(...((await repo.pledges.list()) as Pledge[]));
      break;
    case 'donations':
      records.push(...((await repo.donations.list()) as Donation[]));
      break;
    case 'importantDates':
      records.push(...((await repo.importantDates.list()) as ImportantDate[]));
      break;
  }

  const headers = spec.fields.map((f) => f.label);
  const rows = records.map((r) => spec.fields.map((f) => value(f, r)));
  if (entity === 'importantDates') {
    // Read-only extra column: the Hebrew date (import recomputes it from the date).
    headers.push('Hebrew date');
    records.forEach((r, i) => {
      const d = r as ImportantDate;
      rows[i].push(d.hebrewDay && d.hebrewMonth && d.hebrewYear ? formatHebrew(d.hebrewDay, d.hebrewMonth, d.hebrewYear) : '');
    });
  }
  return { headers, rows };
}
