// ---------------------------------------------------------------------------
// What can be imported and exported, and how spreadsheet columns map to fields.
// The API validates with these; the web uses them for the column-mapping step
// (labels, required fields, and aliases for guessing the mapping from headers).
// Exports use the labels as headers, so an exported file imports back as is.
// ---------------------------------------------------------------------------

import type { LookupKind } from './settings.ts';

export const IMPORT_ENTITIES = ['families', 'members', 'pledges', 'donations', 'importantDates'] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export type FieldKind = 'text' | 'email' | 'date' | 'number' | 'integer' | 'boolean' | 'choice' | 'lookup' | 'ref';

export interface ImportField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** For 'choice': the allowed values (matched case-insensitively, aliases on the right). */
  choices?: Record<string, string[]>;
  /** For 'lookup': which list the value must be in (missing items are added on import). */
  lookup?: LookupKind;
  /** For 'ref': what the text names (a family by name; a member by "First Last"). */
  ref?: 'family' | 'member';
  /** Other header names this column often has, lower-case. */
  aliases?: string[];
}

export interface ImportSpec {
  entity: ImportEntity;
  label: string;
  fields: ImportField[];
  /** How duplicates are recognized, for the preview. */
  duplicateRule: string;
}

const status: ImportField = {
  key: 'status',
  label: 'Status',
  kind: 'choice',
  choices: { active: ['active', 'yes', 'current', 'member'], inactive: ['inactive', 'no', 'former', 'left'] },
};

export const IMPORT_SPECS: Record<ImportEntity, ImportSpec> = {
  families: {
    entity: 'families',
    label: 'Families',
    duplicateRule: 'Same name, and the same phone (or no phone on either)',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, aliases: ['family', 'family name', 'surname', 'last name', 'household'] },
      { key: 'hebrewName', label: 'Hebrew name', kind: 'text', aliases: ['hebrew', 'שם'] },
      { key: 'address', label: 'Address', kind: 'text', aliases: ['street', 'address 1', 'address line 1'] },
      { key: 'city', label: 'City', kind: 'text', aliases: ['town'] },
      { key: 'zip', label: 'Zip', kind: 'text', aliases: ['postcode', 'postal code', 'zip code'] },
      { key: 'country', label: 'Country', kind: 'text' },
      { key: 'phone', label: 'Phone', kind: 'text', aliases: ['telephone', 'tel', 'home phone', 'phone number'] },
      { key: 'whatsapp', label: 'WhatsApp', kind: 'text', aliases: ['whatsapp number', 'mobile'] },
      { key: 'email', label: 'Email', kind: 'email', aliases: ['e-mail', 'email address'] },
      status,
      { key: 'notes', label: 'Notes', kind: 'text', aliases: ['note', 'comments'] },
    ],
  },
  members: {
    entity: 'members',
    label: 'Members',
    duplicateRule: 'Same family, first name and last name',
    fields: [
      { key: 'family', label: 'Family', kind: 'ref', ref: 'family', required: true, aliases: ['family name', 'household'] },
      { key: 'firstName', label: 'First name', kind: 'text', required: true, aliases: ['first', 'given name', 'forename', 'name'] },
      { key: 'lastName', label: 'Last name', kind: 'text', aliases: ['last', 'surname', 'family name'] },
      { key: 'hebrewName', label: 'Hebrew name', kind: 'text', aliases: ['hebrew'] },
      { key: 'fatherHebrewName', label: "Father's Hebrew name", kind: 'text', aliases: ['father', 'ben'] },
      { key: 'motherHebrewName', label: "Mother's Hebrew name", kind: 'text', aliases: ['mother'] },
      {
        key: 'gender',
        label: 'Gender',
        kind: 'choice',
        choices: { male: ['male', 'm', 'man', 'boy'], female: ['female', 'f', 'woman', 'girl'], other: ['other', ''] },
        aliases: ['sex'],
      },
      { key: 'role', label: 'Role', kind: 'lookup', lookup: 'memberRoles', aliases: ['relationship', 'relation'] },
      { key: 'birthDate', label: 'Birth date', kind: 'date', aliases: ['birthday', 'date of birth', 'dob', 'born'] },
      { key: 'deathDate', label: 'Death date', kind: 'date', aliases: ['date of death', 'died'] },
      { key: 'email', label: 'Email', kind: 'email', aliases: ['e-mail', 'email address'] },
      { key: 'phone', label: 'Phone', kind: 'text', aliases: ['telephone', 'tel', 'cell', 'mobile'] },
      { key: 'whatsapp', label: 'WhatsApp', kind: 'text' },
      { key: 'occupation', label: 'Occupation', kind: 'text', aliases: ['job', 'profession'] },
      status,
    ],
  },
  pledges: {
    entity: 'pledges',
    label: 'Pledges',
    duplicateRule: 'Same family, fund, year, amount and currency',
    fields: [
      { key: 'family', label: 'Family', kind: 'ref', ref: 'family', required: true, aliases: ['family name', 'donor', 'name'] },
      { key: 'fund', label: 'Fund', kind: 'lookup', lookup: 'funds', required: true, aliases: ['campaign', 'purpose'] },
      {
        key: 'type',
        label: 'Type',
        kind: 'choice',
        choices: { annual: ['annual', 'yearly', 'recurring'], one_time: ['one_time', 'one-time', 'one time', 'once', ''] },
      },
      { key: 'year', label: 'Year', kind: 'integer', required: true },
      { key: 'dueDate', label: 'Due date', kind: 'date', aliases: ['due'] },
      { key: 'amount', label: 'Amount', kind: 'number', required: true, aliases: ['pledge', 'pledged', 'total'] },
      { key: 'currency', label: 'Currency', kind: 'lookup', lookup: 'currencies' },
    ],
  },
  donations: {
    entity: 'donations',
    label: 'Donations',
    duplicateRule: 'Same family, date, fund and amount',
    fields: [
      { key: 'family', label: 'Family', kind: 'ref', ref: 'family', required: true, aliases: ['family name', 'donor', 'name'] },
      { key: 'fund', label: 'Fund', kind: 'lookup', lookup: 'funds', required: true, aliases: ['campaign', 'purpose'] },
      { key: 'amount', label: 'Amount', kind: 'number', required: true, aliases: ['donation', 'paid', 'total', 'sum'] },
      { key: 'currency', label: 'Currency', kind: 'lookup', lookup: 'currencies' },
      { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['date paid', 'paid on', 'received'] },
      { key: 'method', label: 'Method', kind: 'lookup', lookup: 'paymentMethods', required: true, aliases: ['payment method', 'paid by', 'type'] },
      { key: 'note', label: 'Note', kind: 'text', aliases: ['notes', 'memo', 'comment'] },
    ],
  },
  importantDates: {
    entity: 'importantDates',
    label: 'Important dates',
    duplicateRule: 'Same member, type and date',
    fields: [
      { key: 'member', label: 'Member', kind: 'ref', ref: 'member', required: true, aliases: ['name', 'person', 'full name'] },
      { key: 'family', label: 'Family', kind: 'ref', ref: 'family', aliases: ['family name'] },
      { key: 'type', label: 'Type', kind: 'lookup', lookup: 'dateTypes', required: true, aliases: ['event', 'occasion'] },
      { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['english date', 'gregorian date', 'date of death'] },
      {
        key: 'afterNightfall',
        label: 'After nightfall',
        kind: 'boolean',
        aliases: ['after sunset', 'evening', 'night', 'nightfall'],
      },
      { key: 'recurring', label: 'Repeats', kind: 'boolean', aliases: ['recurring', 'annual', 'yearly'] },
      {
        key: 'recurBy',
        label: 'Repeats on',
        kind: 'choice',
        choices: { hebrew: ['hebrew', 'hebrew date', 'jewish'], gregorian: ['gregorian', 'english', 'english date', 'civil'] },
      },
      { key: 'personName', label: 'In memory of', kind: 'text', aliases: ['deceased', 'name of deceased', 'departed'] },
      { key: 'personHebrewName', label: 'Hebrew name of the departed', kind: 'text', aliases: ['hebrew name of deceased'] },
      { key: 'relationship', label: 'Relationship', kind: 'text', aliases: ['relation'] },
      { key: 'note', label: 'Note', kind: 'text', aliases: ['notes', 'comment'] },
    ],
  },
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[_*]+/g, ' ').replace(/\s+/g, ' ');

/** Guess which column each field comes from: an exact label or key first, then an alias. */
export function guessMapping(spec: ImportSpec, headers: readonly string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const mapping: Record<string, number> = {};
  const pick = (field: ImportField, names: string[]) => {
    if (field.key in mapping) return;
    const i = normalized.findIndex((h, idx) => !taken.has(idx) && names.includes(h));
    if (i >= 0) {
      mapping[field.key] = i;
      taken.add(i);
    }
  };
  for (const f of spec.fields) pick(f, [normalizeHeader(f.label), f.key.toLowerCase()]);
  for (const f of spec.fields) pick(f, (f.aliases ?? []).map(normalizeHeader));
  return mapping;
}

export interface ImportRequest {
  /** Data rows (no header row), each an array of cell text. */
  rows: string[][];
  /** Field key -> column index. */
  mapping: Record<string, number>;
  /** Members/pledges/donations/dates: create a family that isn't found by name. */
  createMissingFamilies?: boolean;
  /** Leave out rows that look like records already in the system (or earlier rows). Default true. */
  skipDuplicates?: boolean;
}

export interface ImportRowResult {
  /** 0-based index into `rows`. */
  row: number;
  status: 'ok' | 'duplicate' | 'error';
  messages: string[];
  /** A short description of the record, for the preview table. */
  summary: string;
}

export interface ImportPreview {
  results: ImportRowResult[];
  counts: { ok: number; duplicate: number; error: number };
  /** List items that importing would add, e.g. funds only the old system had. */
  newListItems: Array<{ list: LookupKind; key: string }>;
  /** Families that importing would create (createMissingFamilies). */
  newFamilies: string[];
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  newFamilies: number;
  newListItems: number;
}
