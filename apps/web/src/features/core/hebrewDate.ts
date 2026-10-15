/**
 * Hebrew-calendar conversion for Important Dates.
 *
 * Anti-drift rule: `new HDate(gregorianDate)` uses LOCAL time, and
 * `new Date('2026-09-17')` parses as UTC-midnight (which flips to the previous
 * day in timezones behind UTC). We therefore always build the Gregorian
 * reference as LOCAL NOON so the conversion is deterministic across timezones
 * and AM/PM. The result is computed once at save time and stored; display reads
 * the stored value and never recomputes live.
 */
import { HDate } from '@hebcal/core';

export interface HebrewDate {
  /** Day of the Hebrew month, 1-30. */
  day: number;
  /** Hebrew month, 1-13 (1=Nisan, 7=Tishrei). */
  month: number;
  /** Hebrew year, e.g. 5787. */
  year: number;
}

/** Convert a Gregorian ISO date (YYYY-MM-DD) to a Hebrew date (deterministic). */
export function gregorianToHebrew(iso: string): HebrewDate {
  const [y, m, d] = iso.split('-').map(Number);
  const hd = new HDate(new Date(y, m - 1, d, 12, 0, 0));
  return { day: hd.getDate(), month: hd.getMonth(), year: hd.getFullYear() };
}

/** Convert a Hebrew date to a Gregorian ISO date (YYYY-MM-DD), local time. */
export function hebrewToGregorianISO(day: number, month: number, year: number): string {
  const g = new HDate(day, month, year).greg();
  const mm = String(g.getMonth() + 1).padStart(2, '0');
  const dd = String(g.getDate()).padStart(2, '0');
  return `${g.getFullYear()}-${mm}-${dd}`;
}

/** Human-readable Hebrew date, e.g. "6 Tishrei, 5787". */
export function formatHebrew(day: number, month: number, year: number): string {
  const hd = new HDate(day, month, year);
  return `${hd.getDate()} ${hd.getMonthName()}, ${hd.getFullYear()}`;
}
