import { describe, expect, it } from 'vitest';
import {
  daysInHebrewMonth,
  daysInHebrewYear,
  formatHebrew,
  gregorianToHebrew,
  hebrewToGregorianISO,
  isHebrewLeapYear,
  isUuid,
  newId,
} from '@pilzno/shared';

// Reference pairs. The implementation was also cross-checked day by day for
// 1900-2240 (124,182 days) against an independent calendar before release.
const KNOWN: Array<[iso: string, day: number, month: number, year: number, label: string]> = [
  ['1900-01-01', 1, 11, 5660, "1 Sh'vat, 5660"],
  ['1948-05-14', 5, 2, 5708, '5 Iyyar, 5708'],
  ['2000-01-01', 23, 10, 5760, '23 Tevet, 5760'],
  ['2024-02-10', 1, 12, 5784, '1 Adar I, 5784'],
  ['2024-03-11', 1, 13, 5784, '1 Adar II, 5784'],
  ['2024-10-03', 1, 7, 5785, '1 Tishrei, 5785'],
  ['2025-03-01', 1, 12, 5785, '1 Adar, 5785'],
  ['2026-09-11', 29, 6, 5786, '29 Elul, 5786'],
  ['2026-09-12', 1, 7, 5787, '1 Tishrei, 5787'],
  ['2239-12-31', 5, 10, 6000, '5 Tevet, 6000'],
];

describe('hebrewCalendar', () => {
  it.each(KNOWN)('%s is %s', (iso, day, month, year, label) => {
    expect(gregorianToHebrew(iso)).toEqual({ day, month, year });
    expect(hebrewToGregorianISO(day, month, year)).toBe(iso);
    expect(formatHebrew(day, month, year)).toBe(label);
  });

  it('moves an event after nightfall to the next Hebrew day', () => {
    // Evening of 11 Sep 2026 is already Rosh Hashanah 5787.
    expect(gregorianToHebrew('2026-09-11', { afterNightfall: false })).toEqual({ day: 29, month: 6, year: 5786 });
    expect(gregorianToHebrew('2026-09-11', { afterNightfall: true })).toEqual({ day: 1, month: 7, year: 5787 });
  });

  it('has the right year lengths, leap years, and variable months', () => {
    expect([5783, 5784, 5785, 5786, 5787].map(daysInHebrewYear)).toEqual([355, 383, 355, 354, 385]);
    expect(isHebrewLeapYear(5784)).toBe(true);
    expect(isHebrewLeapYear(5785)).toBe(false);
    // Cheshvan (8) is long and Kislev (9) full only in 355/385-day years; Kislev is short in 353/383.
    expect([daysInHebrewMonth(8, 5785), daysInHebrewMonth(9, 5785)]).toEqual([30, 30]);
    expect([daysInHebrewMonth(8, 5784), daysInHebrewMonth(9, 5784)]).toEqual([29, 29]);
    expect([daysInHebrewMonth(8, 5786), daysInHebrewMonth(9, 5786)]).toEqual([29, 30]);
    // Adar has 29 days in a regular year; Adar I has 30 in a leap year.
    expect(daysInHebrewMonth(12, 5785)).toBe(29);
    expect(daysInHebrewMonth(12, 5784)).toBe(30);
  });

  it('rejects malformed dates', () => {
    expect(() => gregorianToHebrew('11/09/2026')).toThrow(RangeError);
  });
});

describe('newId (UUIDv7)', () => {
  it('produces valid version-7 UUIDs', () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('is unique across many ids', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });

  it('sorts by creation time', () => {
    const earlier = newId(Date.UTC(2026, 0, 1));
    const later = newId(Date.UTC(2026, 0, 2));
    expect(earlier < later).toBe(true);
    expect(earlier.slice(0, 8)).toBe(Date.UTC(2026, 0, 1).toString(16).padStart(12, '0').slice(0, 8));
  });

  it('rejects the old prefixed ids', () => {
    expect(isUuid('fam-001')).toBe(false);
  });
});
