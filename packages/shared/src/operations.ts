// ---------------------------------------------------------------------------
// Phase 3 shapes: events and RSVPs, email (settings, templates, log), and the
// report tables.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { UUID_PATTERN } from './ids.ts';
import type { PledgePayments } from './money.ts';
import type { Donation, Family, ImportantDate, Member, Pledge, UpcomingDate } from './schemas.ts';
import type { OrgProfile } from './settings.ts';

const uuid = () => z.string().regex(UUID_PATTERN, 'Must be a UUID');
const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

// ---------------------------------------------------------------------------
// Events and RSVPs
// ---------------------------------------------------------------------------

export const eventSchema = z.object({
  id: uuid(),
  title: z.string().min(1, 'Title is required'),
  date: isoDate(),
  startTime: time().optional(),
  endTime: time().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  /** Most people (adults + children) who can come; unset = no limit. */
  capacity: z.number().int().nonnegative().optional(),
  /** Whether RSVPs are being taken. */
  rsvpOpen: z.boolean().optional(),
  createdAt: z.string(),
});
export type ShulEvent = z.infer<typeof eventSchema>;
export const eventInputSchema = eventSchema.omit({ id: true, createdAt: true });
export type EventInput = z.infer<typeof eventInputSchema>;

export const RSVP_STATUSES = ['yes', 'maybe', 'no'] as const;
export const rsvpSchema = z.object({
  id: uuid(),
  eventId: uuid(),
  familyId: uuid(),
  status: z.enum(RSVP_STATUSES),
  adults: z.number().int().nonnegative(),
  children: z.number().int().nonnegative(),
  note: z.string().optional(),
  createdAt: z.string(),
});
export type Rsvp = z.infer<typeof rsvpSchema>;
export const rsvpInputSchema = rsvpSchema.omit({ id: true, createdAt: true });
export type RsvpInput = z.infer<typeof rsvpInputSchema>;

/** An event with its RSVP totals, as the list and calendar show it. */
export interface EventSummary extends ShulEvent {
  rsvps: number;
  /** People coming (adults + children with status "yes"). */
  attending: number;
  maybe: number;
}

export interface EventDetail {
  event: ShulEvent;
  rsvps: Array<Rsvp & { familyName: string }>;
  attending: number;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const emailSettingsSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535),
  /** TLS from the start (port 465); otherwise STARTTLS is used when the server offers it. */
  secure: z.boolean(),
  user: z.string().optional(),
  /** Write-only: never returned by the API. Leave out to keep the saved one. */
  password: z.string().optional(),
  fromName: z.string().optional(),
  fromAddress: z.string().email().optional().or(z.literal('')),
  replyTo: z.string().email().optional().or(z.literal('')),
  /** Test mode: messages are rendered and logged but not sent. */
  testMode: z.boolean(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
/** What the API returns: the password is never sent back. */
export type EmailSettingsView = Omit<EmailSettings, 'password'> & { hasPassword: boolean };

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = { port: 587, secure: false, testMode: true };

export const emailTemplateSchema = z.object({
  key: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  subject: z.string().min(1).max(200),
  /** Plain text with {{variables}}; blank lines separate paragraphs. */
  body: z.string().min(1).max(20_000),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export const emailTemplatesSchema = z
  .array(emailTemplateSchema)
  .refine((t) => new Set(t.map((x) => x.key)).size === t.length, 'Each template needs its own key');

/** The variables a template can use, by what it is sent about. */
export const TEMPLATE_VARIABLES = {
  always: ['org.name', 'org.address', 'org.phone', 'org.email', 'family.name', 'family.greeting', 'today'],
  donation: ['donation.amount', 'donation.date', 'donation.fund', 'donation.method', 'donation.receipt'],
  yahrzeit: [
    'yahrzeit.name',
    'yahrzeit.hebrewName',
    'yahrzeit.relationship',
    'yahrzeit.member',
    'yahrzeit.date',
    'yahrzeit.hebrewDate',
    'yahrzeit.evening',
  ],
  event: ['event.title', 'event.date', 'event.time', 'event.location'],
  statement: ['statement.year', 'statement.total', 'statement.table'],
} as const;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'receipt',
    name: 'Donation receipt',
    subject: 'Thank you for your donation to {{org.name}}',
    body: `Dear {{family.greeting}},

Thank you for your generous donation of {{donation.amount}} to the {{donation.fund}} fund on {{donation.date}}.

{{donation.receipt}}

With gratitude,
{{org.name}}`,
  },
  {
    key: 'yahrzeit',
    name: 'Yahrzeit reminder',
    subject: 'Yahrzeit of {{yahrzeit.name}} on {{yahrzeit.date}}',
    body: `Dear {{family.greeting}},

We are writing to remind you that the yahrzeit of {{yahrzeit.name}} ({{yahrzeit.hebrewName}}), your {{yahrzeit.relationship}}, falls on {{yahrzeit.hebrewDate}}, which is {{yahrzeit.date}}.

The yahrzeit begins at nightfall on {{yahrzeit.evening}}, when the memorial candle is lit. Kaddish may be said at the services that evening and the following day. Please let us know if you would like an aliyah or a memorial prayer.

May the memory of your loved one be a blessing.

{{org.name}}`,
  },
  {
    key: 'statement',
    name: 'Year-end statement',
    subject: 'Your {{statement.year}} giving statement from {{org.name}}',
    body: `Dear {{family.greeting}},

Thank you for your support during {{statement.year}}. Your donations this year total {{statement.total}}:

{{statement.table}}

Please keep this statement for your records.

{{org.name}}`,
  },
  {
    key: 'event',
    name: 'Event invitation',
    subject: 'You are invited: {{event.title}}',
    body: `Dear {{family.greeting}},

You are warmly invited to {{event.title}} on {{event.date}}{{event.time}} at {{event.location}}.

Please let us know if you can come.

{{org.name}}`,
  },
];

/** One message to send: which template, to whom, and what it is about. */
export const sendEmailSchema = z.object({
  template: z.string().min(1),
  /** Override the template's subject/body for this send (edited in the send dialog). */
  subject: z.string().optional(),
  body: z.string().optional(),
  recipients: z
    .array(
      z.object({
        familyId: uuid(),
        donationId: uuid().optional(),
        importantDateId: uuid().optional(),
        /** The occurrence of the important date (for yahrzeits). */
        occurrence: isoDate().optional(),
        eventId: uuid().optional(),
        year: z.number().int().optional(),
      }),
    )
    .min(1)
    .max(1000),
  /** Render only: return the messages without sending or logging. */
  dryRun: z.boolean().optional(),
});
export type SendEmailRequest = z.infer<typeof sendEmailSchema>;

export interface RenderedEmail {
  familyId: string;
  familyName: string;
  to?: string;
  subject: string;
  text: string;
  html: string;
  /** Why it can't be sent (e.g. the family has no email address). */
  problem?: string;
}

export interface SendEmailResult {
  messages: RenderedEmail[];
  sent: number;
  failed: number;
  skipped: number;
  testMode: boolean;
}

export interface EmailLogEntry {
  id: string;
  toAddress: string;
  subject: string;
  template?: string;
  familyId?: string;
  familyName?: string;
  status: 'sent' | 'failed' | 'test';
  error?: string;
  testMode: boolean;
  sentAt: string;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const REPORTS = [
  { key: 'donationsByFund', label: 'Donations by fund', help: 'Totals per fund and currency for a year, by month.' },
  { key: 'donors', label: 'Donors', help: 'Each family’s giving in a year, with their last gift.' },
  { key: 'pledgeStatus', label: 'Pledge status', help: 'Pledged, paid and still owed, per family, for a year.' },
  { key: 'lapsed', label: 'Lapsed donors', help: 'Families who gave the year before but not in the chosen year.' },
  { key: 'directory', label: 'Directory', help: 'Every active member with their family’s contact details.' },
  { key: 'yahrzeits', label: 'Yahrzeits by month', help: 'Every yahrzeit in the chosen year, in date order.' },
] as const;
export type ReportKey = (typeof REPORTS)[number]['key'];

export interface ReportTable {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  /** Columns holding money, for right-alignment. */
  numeric?: number[];
}

// ---------------------------------------------------------------------------
// Documents: what a receipt, a statement and a yahrzeit letter print
// ---------------------------------------------------------------------------

export interface ReceiptData {
  org: OrgProfile;
  family: Family;
  greeting: string;
  addressLines: string[];
  donation: Donation;
  receiptNumber: string;
  fundLabel: string;
  methodLabel: string;
  pledge?: Pledge;
}

export interface StatementData {
  org: OrgProfile;
  family: Family;
  greeting: string;
  addressLines: string[];
  year: number;
  donations: Array<Donation & { receiptNumber: string; fundLabel: string; methodLabel: string }>;
  /** Total per currency. */
  totals: Record<string, number>;
  pledges: Array<Pledge & PledgePayments & { fundLabel: string }>;
}

export interface YahrzeitNotice {
  occurrence: UpcomingDate;
  date: ImportantDate;
  member: Member;
  family: Family;
  greeting: string;
  addressLines: string[];
  /** Who is remembered: the named person, else the member. */
  name: string;
  hebrewName?: string;
  relationship?: string;
  hebrewDate: string;
  /** The evening the yahrzeit begins (the day before, at nightfall). */
  evening: string;
  /** The date doesn't say who is remembered and the member isn't recorded as deceased, so the
   * letter would name the member. Fill in "In memory of" on the date. */
  missingName: boolean;
}
