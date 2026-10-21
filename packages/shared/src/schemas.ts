import { z } from 'zod';
import { UUID_PATTERN } from './ids.ts';
import { RECUR_BY, type RecurBy } from './dateTypes.ts';
import type { HebrewDate } from './hebrewCalendar.ts';
import type { PledgePayments } from './money.ts';

/** Record IDs and foreign keys are UUIDs (generated with newId() from ids.ts). */
const uuid = () => z.string().regex(UUID_PATTERN, 'Must be a UUID');

// ---------------------------------------------------------------------------
// Core entity schemas (single source of truth for types + validation)
// ---------------------------------------------------------------------------

export const familySchema = z.object({
  id: uuid(),
  name: z.string().min(1),
  hebrewName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
  createdAt: z.string(),
});

export const memberSchema = z.object({
  id: uuid(),
  familyId: uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  hebrewName: z.string().optional(),
  fatherHebrewName: z.string().optional(),
  motherHebrewName: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']),
  /** Key from the member-roles list (Settings → Lists). */
  role: z.string().min(1).optional(),
  birthDate: z.string().optional(),
  deathDate: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  occupation: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.string(),
});

/** Currency code from the shul's currency list (Settings → Lists); USD when unset. */
export const currencySchema = z.string().min(1).default('USD');

export const pledgeSchema = z.object({
  id: uuid(),
  /** Key from the funds list. */
  fund: z.string().min(1),
  type: z.enum(['annual', 'one_time']).optional(),
  familyId: uuid(),
  year: z.number().int(),
  dueDate: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  createdAt: z.string(),
});

export const donationSchema = z.object({
  id: uuid(),
  /** Key from the funds list. */
  fund: z.string().min(1),
  familyId: uuid(),
  pledgeId: uuid().optional(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  date: z.string(),
  /** Key from the payment-methods list. */
  method: z.string().min(1),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const importantDateSchema = z.object({
  id: uuid(),
  memberId: uuid(),
  /** Key from the date-types list. */
  type: z.string().min(1),
  /** Gregorian ISO date of the original event (death date for yahrzeit). */
  date: z.string(),
  /** The event happened after nightfall, so it belongs to the next Hebrew day. */
  afterNightfall: z.boolean().optional(),
  hebrewDay: z.number().int().min(1).max(30).optional(),
  hebrewMonth: z.number().int().min(1).max(13).optional(),
  hebrewYear: z.number().int().min(1).optional(),
  recurring: z.boolean().optional(),
  /** Repeat on the Hebrew or the English date; unset = the type's default (DEFAULT_RECUR_BY). */
  recurBy: z.enum(RECUR_BY).optional(),
  /** Who the date is for when that isn't the member: the person a yahrzeit remembers. */
  personName: z.string().optional(),
  personHebrewName: z.string().optional(),
  /** The person's relationship to the member, e.g. "Father". */
  relationship: z.string().optional(),
  note: z.string().optional(),
});



export const noteSchema = z.object({
  id: uuid(),
  familyId: uuid().optional(),
  memberId: uuid().optional(),
  /** Key from the note-types list. */
  type: z.string().min(1).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type Family = z.infer<typeof familySchema>;
export type Member = z.infer<typeof memberSchema>;
export type Pledge = z.infer<typeof pledgeSchema>;
export type Donation = z.infer<typeof donationSchema>;
export type ImportantDate = z.infer<typeof importantDateSchema>;
export type Note = z.infer<typeof noteSchema>;

// ---------------------------------------------------------------------------
// Composed read models (single-entity detail views returned by the API)
// ---------------------------------------------------------------------------

export const familyDetailSchema = z.object({
  family: familySchema,
  members: z.array(memberSchema),
  pledges: z.array(pledgeSchema),
  donations: z.array(donationSchema),
  importantDates: z.array(importantDateSchema),
  notes: z.array(noteSchema),
});

export type FamilyDetail = z.infer<typeof familyDetailSchema>;

export const memberDetailSchema = z.object({
  member: memberSchema,
  family: familySchema,
  importantDates: z.array(importantDateSchema),
  notes: z.array(noteSchema),
});

export type MemberDetail = z.infer<typeof memberDetailSchema>;

/** One occurrence of an important date, with its member/family resolved. Used for the
 * upcoming list (the next occurrence) and the calendar (every occurrence in a range). */
export interface UpcomingDate {
  id: string;
  memberId: string;
  memberName: string;
  familyId: string;
  familyName: string;
  type: ImportantDate['type'];
  /** Original event date (Gregorian ISO, YYYY-MM-DD). */
  date: string;
  /** The occurrence (Gregorian ISO, YYYY-MM-DD); for a Hebrew date, the daytime date. */
  nextOccurrence: string;
  /** Whole days from today to the occurrence (0 = today). */
  daysUntil: number;
  /** Hebrew date of the original event, when known. */
  hebrewDay?: number;
  hebrewMonth?: number;
  hebrewYear?: number;
  /** How it repeats: on the Hebrew or the English anniversary, or not at all. */
  recurBy: RecurBy | 'once';
  /** The Hebrew date of the occurrence day itself. */
  occurrenceHebrew: HebrewDate;
}

// ---------------------------------------------------------------------------
// Create/update input types (id + timestamps generated by the service)
// ---------------------------------------------------------------------------

export type FamilyInput = z.infer<typeof familySchema> extends infer T
  ? Omit<T, 'id' | 'createdAt'>
  : never;
export type MemberInput = Omit<z.infer<typeof memberSchema>, 'id' | 'createdAt'>;
export type PledgeInput = Omit<z.infer<typeof pledgeSchema>, 'id' | 'createdAt'>;
export type DonationInput = Omit<z.infer<typeof donationSchema>, 'id' | 'createdAt'>;
export type ImportantDateInput = Omit<z.infer<typeof importantDateSchema>, 'id'>;
export type NoteInput = Omit<z.infer<typeof noteSchema>, 'id' | 'createdAt'>;

// ---------------------------------------------------------------------------
// Dashboard stats shape
// ---------------------------------------------------------------------------

export const dashboardStatsSchema = z.object({
  families: z.number().int(),
  activeFamilies: z.number().int(),
  members: z.number().int(),
  activeMembers: z.number().int(),
  openPledgeBalance: z.record(z.number()),
  donatedYtd: z.record(z.number()),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// ---------------------------------------------------------------------------
// API input schemas (server-side validation; id/createdAt are server-set)
// ---------------------------------------------------------------------------

export const familyInputSchema = familySchema.omit({ id: true, createdAt: true });
export const memberInputSchema = memberSchema.omit({ id: true, createdAt: true });
export const pledgeInputSchema = pledgeSchema.omit({ id: true, createdAt: true });
export const donationInputSchema = donationSchema.omit({ id: true, createdAt: true });
export const importantDateInputSchema = importantDateSchema.omit({ id: true });
export const noteInputSchema = noteSchema.omit({ id: true, createdAt: true });

// ---------------------------------------------------------------------------
// API error shape (single contract for all non-2xx JSON responses)
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------------------
// Paged lists (GET /api/<list>/page?q=&sort=&order=&limit=&offset=&<filters>)
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  /** Rows matching the search and filters, across all pages. */
  total: number;
  limit: number;
  offset: number;
  /** Money lists: the sum of `amount` per currency over every matching row. */
  totals?: Record<string, number>;
}

export interface PageQuery {
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  [filter: string]: string | number | undefined;
}

/** A pledge row in a paged list, with its family and what has been paid toward it. */
/** A pledge row in a paged list, with its family and what has been paid towards it. */
export type PledgeRow = Pledge & PledgePayments & { familyName: string };
/** A donation row in a paged list, with its family's name. */
export type DonationRow = Donation & { familyName: string; pledgeFund?: string; pledgeYear?: number };
