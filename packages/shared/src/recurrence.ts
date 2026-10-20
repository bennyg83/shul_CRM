// ---------------------------------------------------------------------------
// When does an important date come round again? Gregorian dates repeat on the
// same month and day; Hebrew dates repeat on their Hebrew anniversary, with the
// standard rules for days and months that don't exist every year (following
// Reingold & Dershowitz, "Calendrical Calculations", yahrzeit and
// hebrew-birthday). All dates are ISO strings (YYYY-MM-DD); there is no
// time-of-day, so a Hebrew occurrence is the daytime date (it starts at
// nightfall the evening before).
// ---------------------------------------------------------------------------

import {
  ADAR,
  ADAR_II,
  CHESHVAN,
  KISLEV,
  TEVET,
  SHEVAT,
  daysInHebrewMonth,
  gregorianToHebrew,
  hebrewToGregorianISO,
  isHebrewLeapYear,
  monthsInHebrewYear,
  type HebrewDate,
} from './hebrewCalendar.ts';
import { DEFAULT_RECUR_BY, type ImportantDateType, type RecurBy } from './dateTypes.ts';

/**
 * Someone who died in Adar of a regular year: in a leap year, is the yahrzeit kept in
 * Adar I (Rema, the common Ashkenazi custom, and Calendrical Calculations) or Adar II
 * (Shulchan Aruch)? A shul setting; Adar I by default.
 */
export type AdarYahrzeitRule = 'adar1' | 'adar2';

export interface RecurrenceOptions {
  adarYahrzeit?: AdarYahrzeitRule;
}

/** The fields of an important date that decide when it recurs. */
export interface RecurringDate {
  type: ImportantDateType;
  date: string;
  afterNightfall?: boolean;
  hebrewDay?: number;
  hebrewMonth?: number;
  hebrewYear?: number;
  recurring?: boolean;
  recurBy?: RecurBy;
}

const DAY_MS = 86_400_000;

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getTime();
}

function utcToIso(ms: number): string {
  const date = new Date(ms);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  return `${y}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Add whole days to an ISO date. */
export function addDaysISO(iso: string, days: number): string {
  return utcToIso(isoToUtc(iso) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS);
}

/** Today's local date as an ISO string. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const lastMonthOf = (year: number) => monthsInHebrewYear(year);

/** Yahrzeit of a death on `death` (Hebrew), as kept in Hebrew year `year`. */
export function yahrzeitInYear(death: HebrewDate, year: number, options: RecurrenceOptions = {}): string {
  const { day, month } = death;
  // 30 Cheshvan / 30 Kislev: these days don't exist every year. What counts is the first
  // anniversary: if the following year had no such day, the yahrzeit is the last day of the month.
  if (month === CHESHVAN && day === 30 && daysInHebrewMonth(CHESHVAN, death.year + 1) === 29) {
    return addDaysISO(hebrewToGregorianISO(1, KISLEV, year), -1);
  }
  if (month === KISLEV && day === 30 && daysInHebrewMonth(KISLEV, death.year + 1) === 29) {
    return addDaysISO(hebrewToGregorianISO(1, TEVET, year), -1);
  }
  // Died in Adar II: always the last Adar (Adar II in a leap year, Adar otherwise).
  if (month === ADAR_II) return hebrewToGregorianISO(day, lastMonthOf(year), year);
  // 30 Adar I in a year with only one, 29-day Adar: the last day of Sh'vat.
  if (month === ADAR && day === 30 && !isHebrewLeapYear(year)) return hebrewToGregorianISO(30, SHEVAT, year);
  // Died in Adar of a regular year, kept in a leap year: Adar I by default, Adar II if the shul says so.
  if (month === ADAR && !isHebrewLeapYear(death.year) && isHebrewLeapYear(year) && options.adarYahrzeit === 'adar2') {
    return hebrewToGregorianISO(day, ADAR_II, year);
  }
  // Otherwise the same day of the same month; a 30th in a 29-day month rolls to the 1st of the next.
  return hebrewToGregorianISO(day, month, year);
}

/** Hebrew anniversary (birthday, bar mitzvah, simcha) of `original`, in Hebrew year `year`. */
export function hebrewAnniversaryInYear(original: HebrewDate, year: number): string {
  // Born in the last month of the year (Adar in a regular year, Adar II in a leap year):
  // the anniversary is in the last month of the target year.
  if (original.month === lastMonthOf(original.year)) {
    return hebrewToGregorianISO(original.day, lastMonthOf(year), year);
  }
  return hebrewToGregorianISO(original.day, original.month, year);
}

/** How a date repeats: its own choice, else its type's default. */
export function effectiveRecurBy(date: Pick<RecurringDate, 'type' | 'recurBy'>): RecurBy {
  return date.recurBy ?? DEFAULT_RECUR_BY[date.type];
}

/** The Hebrew date of the original event: the stored one, else computed (nightfall-aware). */
export function hebrewDateOf(date: RecurringDate): HebrewDate {
  if (date.hebrewDay && date.hebrewMonth && date.hebrewYear) {
    return { day: date.hebrewDay, month: date.hebrewMonth, year: date.hebrewYear };
  }
  return gregorianToHebrew(date.date, { afterNightfall: date.afterNightfall });
}

/** The occurrence of `date` in Hebrew year `year` (Hebrew recurrence only). */
function hebrewOccurrence(date: RecurringDate, original: HebrewDate, year: number, options: RecurrenceOptions): string {
  if (year === original.year) return hebrewToGregorianISO(original.day, original.month, original.year);
  return date.type === 'yahrzeit'
    ? yahrzeitInYear(original, year, options)
    : hebrewAnniversaryInYear(original, year);
}

/** The occurrence of `date` in Gregorian year `year`. 29 February falls on the 28th in other years. */
function gregorianOccurrence(date: RecurringDate, year: number): string {
  const [, m, d] = date.date.split('-').map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Every day in [from, to] (inclusive ISO dates) on which `date` falls. A one-time date
 * occurs only on its own day; a recurring one on each anniversary from the event onward.
 */
export function occurrencesBetween(
  date: RecurringDate,
  from: string,
  to: string,
  options: RecurrenceOptions = {},
): string[] {
  if (to < from) return [];
  if (!date.recurring) return date.date >= from && date.date <= to ? [date.date] : [];

  const out: string[] = [];
  if (effectiveRecurBy(date) === 'hebrew') {
    // The Gregorian day of the Hebrew event (after nightfall = the evening before the Hebrew day).
    const original = hebrewDateOf(date);
    const first = Math.max(original.year, gregorianToHebrew(from).year - 1);
    const last = gregorianToHebrew(to).year + 1;
    for (let year = first; year <= last; year++) {
      const iso = hebrewOccurrence(date, original, year, options);
      if (iso >= from && iso <= to && iso >= date.date) out.push(iso);
    }
  } else {
    const first = Math.max(Number(date.date.slice(0, 4)), Number(from.slice(0, 4)));
    for (let year = first; year <= Number(to.slice(0, 4)); year++) {
      const iso = gregorianOccurrence(date, year);
      if (iso >= from && iso <= to && iso >= date.date) out.push(iso);
    }
  }
  return out;
}

/** The next day on or after `today` on which `date` falls, or null if it never will again. */
export function nextOccurrence(date: RecurringDate, today: string, options: RecurrenceOptions = {}): string | null {
  // Every recurring date comes round within a little over a year.
  return occurrencesBetween(date, today, addDaysISO(today, 400), options)[0] ?? null;
}
