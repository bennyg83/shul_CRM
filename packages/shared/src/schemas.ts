import { z } from 'zod';

// ---------------------------------------------------------------------------
// Core entity schemas (single source of truth for types + validation)
// ---------------------------------------------------------------------------

export const familySchema = z.object({
  id: z.string(),
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
  id: z.string(),
  familyId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  hebrewName: z.string().optional(),
  fatherHebrewName: z.string().optional(),
  motherHebrewName: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']),
  role: z.enum(['husband', 'wife', 'son', 'daughter', 'other']).optional(),
  birthDate: z.string().optional(),
  deathDate: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  occupation: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.string(),
});

export const CURRENCIES = ['USD', 'AUD', 'GBP', 'NIS'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const currencySchema = z.enum(CURRENCIES).default('USD');
export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', AUD: 'A$', GBP: '£', NIS: '₪' };
export const CURRENCY_LABEL: Record<Currency, string> = {
  USD: 'USD ($)',
  AUD: 'AUD (A$)',
  GBP: 'GBP (£)',
  NIS: 'NIS (₪)',
};

const CURRENCY_LOCALE: Record<Currency, string> = { USD: 'en-US', AUD: 'en-AU', GBP: 'en-GB', NIS: 'he-IL' };

/** Format an amount with its currency symbol (USD $, AUD A$, GBP £, NIS ₪). */
export const formatMoney = (n: number, currency: Currency = 'USD') =>
  new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const pledgeSchema = z.object({
  id: z.string(),
  fund: z.string(),
  type: z.enum(['annual', 'one_time']).optional(),
  familyId: z.string(),
  year: z.number().int(),
  dueDate: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  createdAt: z.string(),
});

export const donationSchema = z.object({
  id: z.string(),
  fund: z.string(),
  familyId: z.string(),
  pledgeId: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  date: z.string(),
  method: z.enum(['cash', 'check', 'credit', 'transfer']),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const importantDateSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  type: z.enum(["birthday", "yahrzeit", "bar_mitzvah", "bat_mitzvah", "anniversary", 'seuda_hoda\'a']),
  /** Gregorian ISO date of the original event (death date for yahrzeit). */
  date: z.string(),
  hebrewDay: z.number().int().min(1).max(30).optional(),
  hebrewMonth: z.number().int().min(1).max(13).optional(),
  hebrewYear: z.number().int().min(1).optional(),
  recurring: z.boolean().optional(),
  note: z.string().optional(),
});



export const noteSchema = z.object({
  id: z.string(),
  familyId: z.string().optional(),
  memberId: z.string().optional(),
  type: z
    .enum(['general', 'pastoral', 'membership', 'lifecycle', 'donation', 'other'])
    .optional(),
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

/** An important date with its member/family resolved and its next occurrence computed. */
export interface UpcomingDate {
  id: string;
  memberId: string;
  memberName: string;
  familyName: string;
  type: ImportantDate['type'];
  /** Original event date (Gregorian ISO, YYYY-MM-DD). */
  date: string;
  /** The next occurrence on/after today (Gregorian ISO, YYYY-MM-DD). */
  nextOccurrence: string;
  /** Whole days from today to the next occurrence (0 = today). */
  daysUntil: number;
  hebrewDay?: number;
  hebrewMonth?: number;
  hebrewYear?: number;
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
