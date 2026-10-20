// ---------------------------------------------------------------------------
// Hebrew calendar: our own implementation of the fixed arithmetic calendar
// (molad of Tishrei, the four dechiyot, 19-year leap cycle). Written from the
// published algorithm; no third-party code, no dependencies.
//
// Dates are converted through a day count ("fixed day", day 1 = 1 Jan 1 CE
// proleptic Gregorian), so there is no time-of-day or timezone involved:
// "2026-09-12" is always 1 Tishrei 5787, everywhere. Whether the event was
// before or after nightfall can't be known from the date, so it is an explicit
// option (see gregorianToHebrew).
//
// Month numbering (same as stored data): 1 = Nisan ... 6 = Elul, 7 = Tishrei
// ... 12 = Adar (Adar I in a leap year), 13 = Adar II. The year starts at 7.
// ---------------------------------------------------------------------------

export interface HebrewDate {
  /** Day of the Hebrew month, 1-30. */
  day: number;
  /** Hebrew month, 1-13 (1 = Nisan, 7 = Tishrei, 13 = Adar II). */
  month: number;
  /** Hebrew year (Anno Mundi), e.g. 5787. */
  year: number;
}

export const NISAN = 1;
export const TISHREI = 7;
export const CHESHVAN = 8;
export const KISLEV = 9;
export const TEVET = 10;
export const SHEVAT = 11;
export const ADAR = 12; // Adar I in a leap year
export const ADAR_II = 13;

/** Fixed day of 1 Tishrei, year 1 (7 Oct 3761 BCE, Julian). */
const HEBREW_EPOCH = -1373427;
/** Fixed day of 1970-01-01. */
const UNIX_EPOCH_FIXED = 719163;
const DAY_MS = 86_400_000;
/** Parts (1/1080 hour) in a day; a synodic month is 29d 12h 793p = 765433 parts. */
const PARTS_PER_DAY = 25920;

export function isHebrewLeapYear(year: number): boolean {
  return mod(7 * year + 1, 19) < 7;
}

export function monthsInHebrewYear(year: number): number {
  return isHebrewLeapYear(year) ? 13 : 12;
}

/** Days from the epoch to the molad-based Rosh Hashanah of `year`, before the
 * year-length corrections (applies the molad zaken and lo ADU rosh dechiyot). */
function elapsedDays(year: number): number {
  const monthsElapsed = Math.floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const days = 29 * monthsElapsed + Math.floor(partsElapsed / PARTS_PER_DAY);
  // Rosh Hashanah never falls on Sunday, Wednesday or Friday.
  return mod(3 * (days + 1), 7) < 3 ? days + 1 : days;
}

/** The GaTaRaD / BeTUTaKPaT dechiyot: keep every year at a legal length (353-355, 383-385). */
function yearLengthCorrection(year: number): number {
  const ny0 = elapsedDays(year - 1);
  const ny1 = elapsedDays(year);
  const ny2 = elapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

/** Fixed day of 1 Tishrei of `year`. */
function newYear(year: number): number {
  return HEBREW_EPOCH + elapsedDays(year) + yearLengthCorrection(year);
}

export function daysInHebrewYear(year: number): number {
  return newYear(year + 1) - newYear(year);
}

export function daysInHebrewMonth(month: number, year: number): number {
  const len = daysInHebrewYear(year);
  if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
  if (month === ADAR && !isHebrewLeapYear(year)) return 29;
  if (month === CHESHVAN && len % 10 !== 5) return 29; // Cheshvan is long only in 355/385-day years
  if (month === KISLEV && len % 10 === 3) return 29; // Kislev is short in 353/383-day years
  return 30;
}

function fixedFromHebrew(year: number, month: number, day: number): number {
  let days = newYear(year) + day - 1;
  if (month < TISHREI) {
    for (let m = TISHREI; m <= monthsInHebrewYear(year); m++) days += daysInHebrewMonth(m, year);
    for (let m = NISAN; m < month; m++) days += daysInHebrewMonth(m, year);
  } else {
    for (let m = TISHREI; m < month; m++) days += daysInHebrewMonth(m, year);
  }
  return days;
}

function hebrewFromFixed(fixed: number): HebrewDate {
  // Average year = 35975351/98496 days; the estimate is never more than a year off.
  let year = Math.floor((fixed - HEBREW_EPOCH) / (35975351 / 98496));
  while (newYear(year + 1) <= fixed) year++;
  let month = fixed < fixedFromHebrew(year, NISAN, 1) ? TISHREI : NISAN;
  while (fixed > fixedFromHebrew(year, month, daysInHebrewMonth(month, year))) month++;
  return { day: fixed - fixedFromHebrew(year, month, 1) + 1, month, year };
}

function fixedFromISO(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.round(date.getTime() / DAY_MS) + UNIX_EPOCH_FIXED;
}

function isoFromFixed(fixed: number): string {
  const date = new Date((fixed - UNIX_EPOCH_FIXED) * DAY_MS);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convert a Gregorian ISO date (YYYY-MM-DD) to a Hebrew date. The Hebrew day
 * begins at nightfall, so an event after nightfall belongs to the next Hebrew
 * day: pass `afterNightfall: true` for e.g. a death on the evening of the date. */
export function gregorianToHebrew(iso: string, options: { afterNightfall?: boolean } = {}): HebrewDate {
  return hebrewFromFixed(fixedFromISO(iso) + (options.afterNightfall ? 1 : 0));
}

/** Convert a Hebrew date to a Gregorian ISO date (YYYY-MM-DD). A day past the
 * end of the month (e.g. 30 Cheshvan in a short year) rolls into the next month. */
export function hebrewToGregorianISO(day: number, month: number, year: number): string {
  return isoFromFixed(fixedFromHebrew(year, month, day));
}

const MONTH_NAMES = [
  '',
  'Nisan',
  'Iyyar',
  'Sivan',
  'Tamuz',
  'Av',
  'Elul',
  'Tishrei',
  'Cheshvan',
  'Kislev',
  'Tevet',
  "Sh'vat",
  'Adar',
  'Adar II',
] as const;

/** English month name; month 12 is "Adar I" in a leap year and "Adar" otherwise. */
export function hebrewMonthName(month: number, year: number): string {
  if (month === ADAR && isHebrewLeapYear(year)) return 'Adar I';
  return MONTH_NAMES[month] ?? '';
}

/** Human-readable Hebrew date, e.g. "6 Tishrei, 5787". */
export function formatHebrew(day: number, month: number, year: number): string {
  return `${day} ${hebrewMonthName(month, year)}, ${year}`;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
