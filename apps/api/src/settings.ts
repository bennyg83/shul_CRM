import { db } from './db.ts';
import {
  DEFAULT_FEATURES,
  DEFAULT_LOOKUPS,
  DEFAULT_TERMS,
  LOOKUP_KINDS,
  defaultOrgProfile,
  featuresSchema,
  lookupsSchema,
  newId,
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

function read<T>(key: string, schema: ZodTypeAny, fallback: () => T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (row) {
    const parsed = schema.safeParse(JSON.parse(row.value));
    if (parsed.success) return parsed.data as T;
    log.warn({ key }, 'stored setting is invalid; using defaults');
  }
  return fallback();
}

function write(key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

export function getOrg(): OrgProfile {
  return read('org', orgProfileSchema, () => {
    // First start: give this install its permanent id.
    const org = defaultOrgProfile(newId());
    write('org', org);
    return org;
  });
}

export const getFeatures = (): Features => read('features', featuresSchema, () => DEFAULT_FEATURES);
export const getTerms = (): Terms => read('terms', termsSchema, () => DEFAULT_TERMS);

/** Lists, with any list that was never saved taken from the defaults. */
export function getLookups(): Lookups {
  const stored = read<Partial<Lookups>>('lookups', lookupsSchema.partial(), () => ({}));
  return { ...DEFAULT_LOOKUPS, ...stored };
}

export function getSettings(): Settings {
  const logo = db.prepare('SELECT updatedAt FROM files WHERE id = ?').get('logo') as { updatedAt: string } | undefined;
  return {
    org: getOrg(),
    features: getFeatures(),
    terms: getTerms(),
    lookups: getLookups(),
    hasLogo: Boolean(logo),
    logoVersion: logo?.updatedAt,
  };
}

/** Recurrence options from the settings (Adar custom, date types, Hebrew calendar switch). */
export function recurrenceOptions(): RecurrenceOptions {
  return {
    adarYahrzeit: getOrg().adarYahrzeit,
    dateTypes: getLookups().dateTypes,
    hebrewCalendar: getFeatures().hebrewCalendar,
  };
}

export function saveOrg(input: unknown): OrgProfile {
  // orgId is permanent: whatever the client sends, keep the stored one.
  const org = orgProfileSchema.parse({ ...(input as object), orgId: getOrg().orgId });
  if (!getLookups().currencies.some((c) => c.key === org.defaultCurrency)) {
    throw new BadRequest(`Default currency "${org.defaultCurrency}" is not in the currencies list`);
  }
  write('org', org);
  return org;
}

export function saveFeatures(input: unknown): Features {
  const features = featuresSchema.parse(input);
  write('features', features);
  return features;
}

export function saveTerms(input: unknown): Terms {
  const terms = termsSchema.parse(input);
  write('terms', terms);
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
export function lookupUsage(kind: LookupKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [table, column] of USAGE[kind]) {
    const rows = db
      .prepare(`SELECT ${column} AS key, COUNT(*) AS n FROM ${table} WHERE ${column} IS NOT NULL GROUP BY ${column}`)
      .all() as Array<{ key: string; n: number }>;
    for (const r of rows) out[r.key] = (out[r.key] ?? 0) + r.n;
  }
  return out;
}

export function saveLookup(kind: string, input: unknown): Lookups {
  if (!(LOOKUP_KINDS as readonly string[]).includes(kind)) throw new BadRequest(`Unknown list "${kind}"`);
  const k = kind as LookupKind;
  const items = lookupsSchema.shape[k].parse(input);
  const kept = new Set(items.map((i) => i.key));
  const usage = lookupUsage(k);
  const removedInUse = Object.entries(usage).filter(([key]) => !kept.has(key));
  if (removedInUse.length > 0) {
    const list = removedInUse.map(([key, n]) => `"${key}" (${n} record${n === 1 ? '' : 's'})`).join(', ');
    throw new Conflict(`Still in use, so it can be retired but not deleted: ${list}`);
  }
  if (k === 'currencies' && !kept.has(getOrg().defaultCurrency)) {
    throw new Conflict(`"${getOrg().defaultCurrency}" is the default currency; pick another default first`);
  }
  const lookups = { ...getLookups(), [k]: items };
  write('lookups', lookups);
  return lookups;
}

/** Add list items that records need (e.g. a fund name only the old system had). */
export function ensureLookupKeys(
  kind: LookupKind,
  keys: Iterable<string>,
  { active = true, label = (key: string) => key }: { active?: boolean; label?: (key: string) => string } = {},
): string[] {
  const lookups = getLookups();
  const existing = new Set(lookups[kind].map((i) => i.key));
  const added = [...new Set(keys)].filter((key) => key && !existing.has(key));
  if (added.length === 0) return [];
  const extra = added.map((key) => {
    const base = { key, label: label(key), active };
    if (kind === 'dateTypes') return { ...base, color: '#607d8b', recurBy: 'gregorian' as const, rules: 'anniversary' as const };
    if (kind === 'currencies') return { ...base, symbol: key, locale: getOrg().locale };
    return base;
  });
  write('lookups', { ...lookups, [kind]: [...lookups[kind], ...extra] });
  return added;
}

/**
 * At startup: a value stored on records but missing from its list (data from before the
 * lists existed, e.g. an old "brit_mitzvah" date type) is added as a retired item, so the
 * record still shows a label and stays editable. Staff can relabel or reactivate it.
 */
export function reconcileLookups(): void {
  const humanize = (key: string) => {
    const words = key.replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  for (const kind of LOOKUP_KINDS) {
    const added = ensureLookupKeys(kind, Object.keys(lookupUsage(kind)), { active: false, label: humanize });
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
export function checkLookups(entity: string, data: Record<string, unknown>): void {
  const fields = ENTITY_LOOKUPS[entity];
  if (!fields) return;
  const lookups = getLookups();
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

export function saveLogo(data: Uint8Array): void {
  if (data.length === 0) throw new BadRequest('The upload was empty');
  if (data.length > LOGO_MAX_BYTES) throw new BadRequest('The logo must be 2 MB or smaller');
  const contentType = sniffImageType(data);
  if (!contentType) throw new BadRequest('Use a PNG, JPEG or WebP image');
  db.prepare(
    `INSERT INTO files (id, contentType, data, updatedAt) VALUES ('logo', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET contentType = excluded.contentType, data = excluded.data, updatedAt = excluded.updatedAt`,
  ).run(contentType, data, new Date().toISOString());
}

export function getLogo(): { contentType: string; data: Uint8Array; updatedAt: string } | undefined {
  return db.prepare('SELECT contentType, data, updatedAt FROM files WHERE id = ?').get('logo') as
    | { contentType: string; data: Uint8Array; updatedAt: string }
    | undefined;
}

export function removeLogo(): void {
  db.prepare('DELETE FROM files WHERE id = ?').run('logo');
}
