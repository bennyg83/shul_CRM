// ---------------------------------------------------------------------------
// Shul settings: what makes one install Pilzno and another Beth Shalom without
// code changes. Four parts, each stored and edited separately:
//   org      — the shul's profile (name, address, currency, locale, colors, customs)
//   features — modules switched on or off
//   terms    — the words the UI uses ("Family" or "Household", ...)
//   lookups  — the editable lists behind the dropdowns
// The defaults below are this app's behaviour before settings existed.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { RECUR_BY, DATE_TYPE_COLOR, DATE_TYPE_LABEL, DEFAULT_RECUR_BY, IMPORTANT_DATE_TYPES } from './dateTypes.ts';
import { UUID_PATTERN } from './ids.ts';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a color like #4A148C');

export const orgProfileSchema = z.object({
  /** Stable id for this install; exports and backups carry it. Set once, never edited. */
  orgId: z.string().regex(UUID_PATTERN),
  name: z.string().min(1, 'Name is required'),
  shortName: z.string().min(1, 'Short name is required').max(24),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  /** Currency code (from the currencies list) preselected on new pledges and donations. */
  defaultCurrency: z.string().min(1),
  /** BCP 47 locale for dates and numbers, e.g. en-US, en-GB, he-IL. */
  locale: z.string().min(2),
  /** IANA time zone, e.g. America/New_York, Europe/Prague. */
  timezone: z.string().min(1),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  /** Someone who died in Adar of a regular year: in a leap year, Adar I (default) or Adar II. */
  adarYahrzeit: z.enum(['adar1', 'adar2']),
});
export type OrgProfile = z.infer<typeof orgProfileSchema>;

export const featuresSchema = z.object({
  /** Hebrew dates, the nightfall question, and Hebrew recurrence. */
  hebrewCalendar: z.boolean(),
  /** Yahrzeits as a date type, and the yahrzeit lists. */
  yahrzeits: z.boolean(),
  /** Pledges (donations are always on). */
  pledges: z.boolean(),
  /** Events, RSVPs and sponsorships (Phase 3 / 6). */
  events: z.boolean(),
  /** The member portal (Phase 6). */
  portal: z.boolean(),
});
export type Features = z.infer<typeof featuresSchema>;

export const TERM_KEYS = ['family', 'families', 'member', 'members', 'pledge', 'pledges', 'donation', 'donations'] as const;
export type TermKey = (typeof TERM_KEYS)[number];
export const termsSchema = z.object(
  Object.fromEntries(TERM_KEYS.map((k) => [k, z.string().min(1).max(40)])) as Record<TermKey, z.ZodString>,
);
export type Terms = z.infer<typeof termsSchema>;

// ---------------------------------------------------------------------------
// Lookup lists. Each item has a stable `key` (what records store) and a label.
// Retired items stay valid for old records but are not offered for new ones.
// ---------------------------------------------------------------------------

const lookupItem = {
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  active: z.boolean(),
};

export const dateTypeItemSchema = z.object({
  ...lookupItem,
  color: hexColor,
  recurBy: z.enum(RECUR_BY),
  /** Which Hebrew anniversary rules apply: the yahrzeit rules, or the birthday ones. */
  rules: z.enum(['yahrzeit', 'anniversary']),
});
export const simpleItemSchema = z.object(lookupItem);
export const currencyItemSchema = z.object({
  ...lookupItem,
  symbol: z.string().min(1).max(4),
  /** Locale for number formatting, e.g. en-US, he-IL. */
  locale: z.string().min(2),
});

export const LOOKUP_KINDS = ['dateTypes', 'funds', 'noteTypes', 'memberRoles', 'paymentMethods', 'currencies'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

const uniqueKeys = <T extends { key: string }>(items: T[]) => new Set(items.map((i) => i.key)).size === items.length;
const list = <S extends z.ZodTypeAny>(item: S) =>
  z
    .array(item)
    .min(1, 'Keep at least one item')
    .refine((items) => uniqueKeys(items as Array<{ key: string }>), 'Each item needs its own key');

export const lookupsSchema = z.object({
  dateTypes: list(dateTypeItemSchema),
  funds: list(simpleItemSchema),
  noteTypes: list(simpleItemSchema),
  memberRoles: list(simpleItemSchema),
  paymentMethods: list(simpleItemSchema),
  currencies: list(currencyItemSchema),
});
export type Lookups = z.infer<typeof lookupsSchema>;
export type DateTypeItem = z.infer<typeof dateTypeItemSchema>;
export type LookupItem = z.infer<typeof simpleItemSchema>;
export type CurrencyItem = z.infer<typeof currencyItemSchema>;

export const settingsSchema = z.object({
  org: orgProfileSchema,
  features: featuresSchema,
  terms: termsSchema,
  lookups: lookupsSchema,
  /** Whether a logo has been uploaded (GET /api/org/logo serves it). */
  hasLogo: z.boolean(),
  /** Changes whenever the logo does, for cache-busting its URL. */
  logoVersion: z.string().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_FEATURES: Features = {
  hebrewCalendar: true,
  yahrzeits: true,
  pledges: true,
  events: true,
  portal: false,
};

export const DEFAULT_TERMS: Terms = {
  family: 'Family',
  families: 'Families',
  member: 'Member',
  members: 'Members',
  pledge: 'Pledge',
  pledges: 'Pledges',
  donation: 'Donation',
  donations: 'Donations',
};

const items = (pairs: Array<[key: string, label: string]>) => pairs.map(([key, label]) => ({ key, label, active: true }));

export const DEFAULT_LOOKUPS: Lookups = {
  dateTypes: IMPORTANT_DATE_TYPES.map((key) => ({
    key,
    label: DATE_TYPE_LABEL[key],
    active: true,
    color: DATE_TYPE_COLOR[key],
    recurBy: DEFAULT_RECUR_BY[key],
    rules: key === 'yahrzeit' ? ('yahrzeit' as const) : ('anniversary' as const),
  })),
  funds: items([
    ['General', 'General'],
    ['Education', 'Education'],
    ['Building', 'Building'],
    ['Kiddush', 'Kiddush'],
    ['Chesed', 'Chesed'],
  ]),
  noteTypes: items([
    ['general', 'General'],
    ['pastoral', 'Pastoral'],
    ['membership', 'Membership'],
    ['lifecycle', 'Lifecycle'],
    ['donation', 'Donation'],
    ['other', 'Other'],
  ]),
  memberRoles: items([
    ['husband', 'Husband'],
    ['wife', 'Wife'],
    ['son', 'Son'],
    ['daughter', 'Daughter'],
    ['other', 'Other'],
  ]),
  paymentMethods: items([
    ['cash', 'Cash'],
    ['check', 'Check'],
    ['credit', 'Credit'],
    ['transfer', 'Transfer'],
  ]),
  currencies: [
    { key: 'USD', label: 'USD ($)', symbol: '$', locale: 'en-US', active: true },
    { key: 'AUD', label: 'AUD (A$)', symbol: 'A$', locale: 'en-AU', active: true },
    { key: 'GBP', label: 'GBP (£)', symbol: '£', locale: 'en-GB', active: true },
    { key: 'NIS', label: 'NIS (₪)', symbol: '₪', locale: 'he-IL', active: true },
  ],
};

/** A fresh org profile (the demo shul). `orgId` is generated by the API on first start. */
export const defaultOrgProfile = (orgId: string): OrgProfile => ({
  orgId,
  name: 'Beth Shalom Synagogue',
  shortName: 'Beth Shalom',
  defaultCurrency: 'USD',
  locale: 'en-US',
  timezone: 'America/New_York',
  primaryColor: '#4A148C',
  secondaryColor: '#B8860B',
  adarYahrzeit: 'adar1',
});

// ---------------------------------------------------------------------------
// Helpers shared by the API and the web app
// ---------------------------------------------------------------------------

/** The label for a stored key, falling back to the key itself (e.g. an item since deleted). */
export function lookupLabel(items: ReadonlyArray<{ key: string; label: string }>, key: string | undefined): string {
  if (!key) return '';
  return items.find((i) => i.key === key)?.label ?? key;
}

/** The items to offer in a dropdown: active ones, plus the current value if it was retired. */
export function lookupOptions<T extends { key: string; active: boolean }>(items: readonly T[], current?: string): T[] {
  return items.filter((i) => i.active || i.key === current);
}

/** Format money with the shul's currency list ("$1,200", "₪2,000"); unknown codes print the code. */
export function formatMoneyWith(
  currencies: ReadonlyArray<Pick<CurrencyItem, 'key' | 'symbol' | 'locale'>>,
  amount: number,
  code: string,
): string {
  const c = currencies.find((i) => i.key === code);
  const number = new Intl.NumberFormat(c?.locale ?? 'en-US', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return c ? `${sign}${c.symbol}${number}` : `${sign}${number} ${code}`;
}

/** A key for a new lookup item, from its label: "Seudah Shlishit" -> "seudah_shlishit". */
export function keyFromLabel(label: string, taken: ReadonlyArray<string>): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9\p{Script=Hebrew}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'item';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}
