// ---------------------------------------------------------------------------
// The member portal (Phase 6): what a family can see and change about itself,
// what it owes, and the sponsorships it can take on.
//
// The API decides which family a portal request belongs to from the signed-in
// user's own member record — never from anything the browser sends. The schemas
// here exist so both sides agree on the shape, not to grant access.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { UUID_PATTERN } from './ids.ts';
import { importantDateSchema, type Donation, type Family, type ImportantDate, type Member, type Pledge } from './schemas.ts';

const uuid = () => z.string().regex(UUID_PATTERN, 'Must be a UUID');
const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// What a member may change about their own family
// ---------------------------------------------------------------------------

/** Contact details only. The family's name, status and the shul's own notes stay with the office. */
export const portalFamilySchema = z.object({
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zip: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
});
export type PortalFamilyInput = z.infer<typeof portalFamilySchema>;

/**
 * A person in the family. Status and which family they belong to are not here: leaving or
 * joining a shul is an office decision, and a date of death goes with the yahrzeit the
 * office records.
 */
export const portalMemberSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  hebrewName: z.string().max(80).optional(),
  fatherHebrewName: z.string().max(80).optional(),
  motherHebrewName: z.string().max(80).optional(),
  gender: z.enum(['male', 'female', 'other']),
  role: z.string().max(60).optional(),
  birthDate: isoDate().optional().or(z.literal('')),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  occupation: z.string().max(100).optional(),
});
export type PortalMemberInput = z.infer<typeof portalMemberSchema>;

/** An important date, for one of this family's own members. */
export const portalDateSchema = importantDateSchema.omit({ id: true });
export type PortalDateInput = z.infer<typeof portalDateSchema>;

// ---------------------------------------------------------------------------
// What the portal shows
// ---------------------------------------------------------------------------

/** The signed-in member, their family, and everyone in it. */
export interface PortalHome {
  member: Member;
  family: Family;
  members: Member[];
  dates: ImportantDate[];
  /** The shul can switch the portal off, leaving it readable but not editable. */
  canEdit: boolean;
}

export interface PortalPledge extends Pledge {
  paid: number;
  balance: number;
  fundLabel: string;
}

/** What the family owes and has given. Read-only: money is recorded by the office. */
export interface PortalAccount {
  pledges: PortalPledge[];
  donations: Array<Donation & { fundLabel: string; receiptNumber: string }>;
  /** Still owed, per currency, across every open pledge. */
  owed: Record<string, number>;
  /** Given this year, per currency. */
  givenThisYear: Record<string, number>;
  year: number;
  /** Years that have at least one donation, newest first, for the statement links. */
  statementYears: number[];
  /** Where to pay, if the shul has set it up. */
  payment?: { url: string; note?: string };
}

// ---------------------------------------------------------------------------
// Sponsorships
// ---------------------------------------------------------------------------

export const sponsorshipSchema = z.object({
  id: uuid(),
  title: z.string().min(1, 'Give it a name').max(120),
  date: isoDate(),
  /** Which fund the resulting pledge belongs to (from the shul's funds list). */
  fund: z.string().min(1, 'Choose a fund'),
  suggestedAmount: z.number().nonnegative().optional(),
  currency: z.string().min(1),
  /** How many families may share it. One unless the shul allows co-sponsors. */
  maxSponsors: z.number().int().min(1).max(20),
  note: z.string().max(2000).optional(),
  /** Closed slots stay visible but can no longer be taken. */
  open: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});
export type Sponsorship = z.infer<typeof sponsorshipSchema>;
export const sponsorshipInputSchema = sponsorshipSchema.omit({ id: true, createdAt: true, createdBy: true });
export type SponsorshipInput = z.infer<typeof sponsorshipInputSchema>;

export const sponsorshipClaimSchema = z.object({
  id: uuid(),
  sponsorshipId: uuid(),
  familyId: uuid(),
  memberId: uuid().optional(),
  /** "In memory of…", "In honour of…" — shown to the shul, printed where the shul chooses. */
  dedication: z.string().max(300).optional(),
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  pledgeId: uuid().optional(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});
export type SponsorshipClaim = z.infer<typeof sponsorshipClaimSchema>;

/** What a family sends when taking a sponsorship on. */
export const claimInputSchema = z.object({
  dedication: z.string().max(300).optional(),
  amount: z.number().nonnegative().optional(),
});
export type ClaimInput = z.infer<typeof claimInputSchema>;

/**
 * A sponsorship with who has taken it. The office sees every claim; the portal is sent only the
 * family's own, so one family learns nothing about another beyond how many places are left.
 */
export interface SponsorshipSummary extends Sponsorship {
  /** `paid` is what has been given towards this claim's pledge: anything above zero means it
   * can no longer simply be given back, so the UI can say so before anyone tries. */
  claims: Array<SponsorshipClaim & { familyName?: string; paid: number }>;
  /** Places still free (maxSponsors minus every claim, including ones not listed above). */
  remaining: number;
  /** Whether the signed-in family has already taken this one (portal only). */
  mine?: boolean;
}

// ---------------------------------------------------------------------------
// Paying
// ---------------------------------------------------------------------------

/**
 * The shul's payment page, with {amount} and {reference} filled in. Only those two are ever
 * substituted: a payment link must not carry anyone's name or email address to another company.
 */
export function buildPaymentUrl(template: string, values: { amount?: number; reference?: string } = {}): string {
  return template
    .replace(/\{amount\}/g, values.amount === undefined ? '' : encodeURIComponent(String(values.amount)))
    .replace(/\{reference\}/g, encodeURIComponent(values.reference ?? ''));
}

/** A payment link must be a plain http(s) address; anything else could run script. */
export const paymentUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a web address starting with http:// or https://');
