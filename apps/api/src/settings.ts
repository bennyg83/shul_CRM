import { db } from './db.ts';
import {
  DEFAULT_FEATURES,
  DEFAULT_LOOKUPS,
  DEFAULT_TERMS,
  LOOKUP_KINDS,
  defaultOrgProfile,
  featuresSchema,
  lookupsSchema,
  orgProfileSchema,
  termsSchema,
  type Features,
  type LookupKind,
  type Lookups,
  type OrgProfile,
  type RecurrenceOptions,
  type Settings,
  type Terms,
} from '@shulcrm/shared';
import type { ZodTypeAny } from 'zod';
import { log } from './log.ts';
import { resolveOrgId } from './tenant.ts';

// ---------------------------------------------------------------------------
// Shul settings (one JSON value per part in the `settings` table) and the logo
// (one row in `files`). Missing parts read as the defaults.
// ---------------------------------------------------------------------------

/** 400 with a message (bad input the schema can't express). */
export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequest';
  }
}

/** 409: the change conflicts with existing data (e.g. deleting a list item still in use). */
export class Conflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Conflict';
  }
}

async function read<T>(key: string, schema: ZodTypeAny, fallback: () => T | Promise<T>): Promise<T> {
  const orgId = resolveOrgId();
  const row = (await db.prepare('SELECT value FROM settings WHERE orgId = ? AND key = ?').get(orgId, key)) as
    | { value: string }
    | undefined;
  if (row) {
    const parsed = schema.safeParse(JSON.parse(row.value));
    if (parsed.success) return parsed.data as T;
    log.warn({ key, orgId }, 'stored setting is invalid; using defaults');
  }
  return fallback();
}

async function write(key: string, value: unknown): Promise<void> {
  const orgId = resolveOrgId();
  await db
    .prepare(
      'INSERT INTO settings ("orgId", key, value) VALUES (?, ?, ?) ON CONFLICT ("orgId", key) DO UPDATE SET value = EXCLUDED.value',
    )
    .run(orgId, key, JSON.stringify(value));
}

/** Read a JSON settings blob for the current organization (shared with email templates, etc.). */
export async function readJsonSetting<T>(key: string, schema: ZodTypeAny, fallback: () => T | Promise<T>): Promise<T> {
  return read(key, schema, fallback);
}

export async function writeJsonSetting(key: string, value: unknown): Promise<void> {
  await write(key, value);
}

export async function getOrg(): Promise<OrgProfile> {
  const orgId = resolveOrgId();
  return read('org', orgProfileSchema, async () => {
    const org = defaultOrgProfile(orgId);
    await write('org', org);
    await db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(org.name, orgId);
    return org;
  });
}

export const getFeatures = (): Promise<Features> => read('features', featuresSchema, () => DEFAULT_FEATURES);
export const getTerms = (): Promise<Terms> => read('terms', termsSchema, () => DEFAULT_TERMS);

/** Lists, with any list that was never saved taken from the defaults. */
export async function getLookups(): Promise<Lookups> {
  const stored = await read<Partial<Lookups>>('lookups', lookupsSchema.partial(), () => ({}));
  return { ...DEFAULT_LOOKUPS, ...stored };
}

export async function getSettings(): Promise<Settings> {
  const orgId = resolveOrgId();
  const logo = (await db.prepare('SELECT updatedAt FROM files WHERE orgId = ? AND id = ?').get(orgId, 'logo')) as
    | { updatedAt: string }
    | undefined;
  return {
    org: await getOrg(),
    features: await getFeatures(),
    terms: await getTerms(),
    lookups: await getLookups(),
    hasLogo: Boolean(logo),
    logoVersion: logo?.updatedAt,
  };
}

/** Recurrence options from the settings (Adar custom, date types, Hebrew calendar switch). */
export async function recurrenceOptions(): Promise<RecurrenceOptions> {
  const org = await getOrg();
  const lookups = await getLookups();
  const features = await getFeatures();
  return {
    adarYahrzeit: org.adarYahrzeit,
    dateTypes: lookups.dateTypes,
    hebrewCalendar: features.hebrewCalendar,
  };
}

export async function saveOrg(input: unknown): Promise<OrgProfile> {
  const org = orgProfileSchema.parse({ ...(input as object), orgId: (await getOrg()).orgId });
  if (!(await getLookups()).currencies.some((c) => c.key === org.defaultCurrency)) {
    throw new BadRequest(`Default currency "${org.defaultCurrency}" is not in the currencies list`);
  }
  await write('org', org);
  await db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(org.name, org.orgId);
  return org;
}

export async function saveFeatures(input: unknown): Promise<Features> {
  const features = featuresSchema.parse(input);
  await write('features', features);
  return features;
}

export async function saveTerms(input: unknown): Promise<Terms> {
  const terms = termsSchema.parse(input);
  await write('terms', terms);
  return terms;
}

/** Where each list's keys are stored, for "in use" checks and validation. */
const USAGE: Record<LookupKind, Array<[table: string, column: string]>> = {
  dateTypes: [['importantDates', 'type']],
  funds: [
    ['pledges', 'fund'],
    ['donations', 'fund'],
  ],
  noteTypes: [['notes', 'type']],
  memberRoles: [['members', 'role']],
  paymentMethods: [['donations', 'method']],
  currencies: [
    ['pledges', 'currency'],
    ['donations', 'currency'],
  ],
};

/** How many records use each key of a list. */
export async function lookupUsage(kind: LookupKind): Promise<Record<string, number>> {
  const orgId = resolveOrgId();
  const out: Record<string, number> = {};
  for (const [table, column] of USAGE[kind]) {
    const rows = (await db
      .prepare(
        `SELECT ${column} AS key, COUNT(*) AS n FROM ${table} WHERE orgId = ? AND ${column} IS NOT NULL GROUP BY ${column}`,
      )
      .all(orgId)) as Array<{ key: string; n: number }>;
    for (const r of rows) out[r.key] = (out[r.key] ?? 0) + r.n;
  }
  return out;
}

export async function saveLookup(kind: string, input: unknown): Promise<Lookups> {
  if (!(LOOKUP_KINDS as readonly string[]).includes(kind)) throw new BadRequest(`Unknown list "${kind}"`);
  const k = kind as LookupKind;
  const items = lookupsSchema.shape[k].parse(input);
  const kept = new Set(items.map((i) => i.key));
  const usage = await lookupUsage(k);
  const removedInUse = Object.entries(usage).filter(([key]) => !kept.has(key));
  if (removedInUse.length > 0) {
    const list = removedInUse.map(([key, n]) => `"${key}" (${n} record${n === 1 ? '' : 's'})`).join(', ');
    throw new Conflict(`Still in use, so it can be retired but not deleted: ${list}`);
  }
  const org = await getOrg();
  if (k === 'currencies' && !kept.has(org.defaultCurrency)) {
    throw new Conflict(`"${org.defaultCurrency}" is the default currency; pick another default first`);
  }
  const lookups = { ...(await getLookups()), [k]: items };
  await write('lookups', lookups);
  return lookups;
}

/** Add list items that records need (e.g. a fund name only the old system had). */
export async function ensureLookupKeys(
  kind: LookupKind,
  keys: Iterable<string>,
  { active = true, label = (key: string) => key }: { active?: boolean; label?: (key: string) => string } = {},
): Promise<string[]> {
  const lookups = await getLookups();
  const existing = new Set(lookups[kind].map((i) => i.key));
  const added = [...new Set(keys)].filter((key) => key && !existing.has(key));
  if (added.length === 0) return [];
  const org = await getOrg();
  const extra = added.map((key) => {
    const base = { key, label: label(key), active };
    if (kind === 'dateTypes') return { ...base, color: '#607d8b', recurBy: 'gregorian' as const, rules: 'anniversary' as const };
    if (kind === 'currencies') return { ...base, symbol: key, locale: org.locale };
    return base;
  });
  await write('lookups', { ...lookups, [kind]: [...lookups[kind], ...extra] });
  return added;
}

/**
 * At startup: a value stored on records but missing from its list (data from before the
 * lists existed, e.g. an old "brit_mitzvah" date type) is added as a retired item, so the
 * record still shows a label and stays editable. Staff can relabel or reactivate it.
 */
export async function reconcileLookups(): Promise<void> {
  const humanize = (key: string) => {
    const words = key.replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  for (const kind of LOOKUP_KINDS) {
    const added = await ensureLookupKeys(kind, Object.keys(await lookupUsage(kind)), { active: false, label: humanize });
    if (added.length > 0) log.info({ list: kind, added: added.length }, 'added retired list items for existing records');
  }
}

/** Fields on each entity that hold a list key. */
const ENTITY_LOOKUPS: Record<string, Array<[field: string, kind: LookupKind]>> = {
  members: [['role', 'memberRoles']],
  pledges: [
    ['fund', 'funds'],
    ['currency', 'currencies'],
  ],
  donations: [
    ['fund', 'funds'],
    ['method', 'paymentMethods'],
    ['currency', 'currencies'],
  ],
  importantDates: [['type', 'dateTypes']],
  notes: [['type', 'noteTypes']],
};

/** Reject a record whose list fields hold a key the shul's lists don't have. Retired items are
 * still accepted (an old record keeps its value when edited). */
export async function checkLookups(entity: string, data: Record<string, unknown>): Promise<void> {
  const fields = ENTITY_LOOKUPS[entity];
  if (!fields) return;
  const lookups = await getLookups();
  for (const [field, kind] of fields) {
    const value = data[field];
    if (typeof value !== 'string') continue;
    if (!lookups[kind].some((i) => i.key === value)) {
      throw new BadRequest(`"${value}" is not in the ${kind} list (Settings → Lists)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Logo: PNG, JPEG or WebP up to 2 MB, checked by its first bytes (not the
// client's content type). No SVG: it can carry scripts.
// ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function sniffImageType(data: Uint8Array): string | undefined {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to));
  if (data.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

export async function saveLogo(data: Uint8Array): Promise<void> {
  if (data.length === 0) throw new BadRequest('The upload was empty');
  if (data.length > LOGO_MAX_BYTES) throw new BadRequest('The logo must be 2 MB or smaller');
  const contentType = sniffImageType(data);
  if (!contentType) throw new BadRequest('Use a PNG, JPEG or WebP image');
  const orgId = resolveOrgId();
  await db
    .prepare(
      `INSERT INTO files (orgId, id, contentType, data, updatedAt) VALUES (?, 'logo', ?, ?, ?)
     ON CONFLICT(orgId, id) DO UPDATE SET contentType = excluded.contentType, data = excluded.data, updatedAt = excluded.updatedAt`,
    )
    .run(orgId, contentType, data, new Date().toISOString());
}

export async function getLogo(): Promise<{ contentType: string; data: Uint8Array; updatedAt: string } | undefined> {
  const orgId = resolveOrgId();
  return (await db.prepare('SELECT contentType, data, updatedAt FROM files WHERE orgId = ? AND id = ?').get(orgId, 'logo')) as
    | { contentType: string; data: Uint8Array; updatedAt: string }
    | undefined;
}

export async function removeLogo(): Promise<void> {
  await db.prepare('DELETE FROM files WHERE orgId = ? AND id = ?').run(resolveOrgId(), 'logo');
}
