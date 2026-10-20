import { describe, expect, it } from 'vitest';
import {
  ADAR,
  ADAR_II,
  CHESHVAN,
  KISLEV,
  SHEVAT,
  TEVET,
  gregorianToHebrew,
  hebrewAnniversaryInYear,
  hebrewToGregorianISO,
  nextOccurrence,
  occurrencesBetween,
  yahrzeitInYear,
  type RecurringDate,
} from '@pilzno/shared';
import { seedImportantDates } from '@pilzno/shared/seed';

// Year facts used below (from the calendar module, which is checked against known dates):
// 5784 leap (383 days, short Cheshvan and Kislev), 5785 355 days (both 30), 5786 354 (Cheshvan 29,
// Kislev 30), 5787 leap 385 (both 30), 5788 355, 5789 354, 5790 383 (both 29), 5791 355.

describe('yahrzeit rules', () => {
  it('keeps an ordinary date on the same Hebrew day', () => {
    // 4 Cheshvan 5780 -> 4 Cheshvan 5787. 1 Tishrei 5787 is 12 Sep 2026 and Tishrei has 30 days.
    expect(yahrzeitInYear({ day: 4, month: CHESHVAN, year: 5780 }, 5787)).toBe('2026-10-15');
  });

  describe('Adar', () => {
    const regularYearAdar = { day: 10, month: ADAR, year: 5783 }; // 5783 is not a leap year

    it('keeps a regular-year Adar death in Adar I of a leap year by default', () => {
      // 1 Adar I 5784 = 10 Feb 2024, so 10 Adar I = 19 Feb.
      expect(yahrzeitInYear(regularYearAdar, 5784)).toBe('2024-02-19');
    });

    it('can keep it in Adar II instead (shul setting)', () => {
      // 1 Adar II 5784 = 11 Mar 2024, so 10 Adar II = 20 Mar.
      expect(yahrzeitInYear(regularYearAdar, 5784, { adarYahrzeit: 'adar2' })).toBe('2024-03-20');
    });

    it('keeps it in Adar in another regular year, whatever the setting', () => {
      // 1 Adar 5785 = 1 Mar 2025.
      expect(yahrzeitInYear(regularYearAdar, 5785)).toBe('2025-03-10');
      expect(yahrzeitInYear(regularYearAdar, 5785, { adarYahrzeit: 'adar2' })).toBe('2025-03-10');
    });

    it('keeps an Adar II death in Adar II, or in Adar in a regular year', () => {
      const adarII = { day: 15, month: ADAR_II, year: 5784 };
      expect(yahrzeitInYear(adarII, 5785)).toBe('2025-03-15');
      expect(yahrzeitInYear(adarII, 5787)).toBe(hebrewToGregorianISO(15, ADAR_II, 5787));
    });

    it('keeps an Adar I death in Adar I of a leap year and in Adar of a regular year', () => {
      const adarI = { day: 5, month: ADAR, year: 5784 };
      expect(yahrzeitInYear(adarI, 5785)).toBe('2025-03-05');
      expect(yahrzeitInYear(adarI, 5787)).toBe(hebrewToGregorianISO(5, ADAR, 5787));
    });

    it("moves 30 Adar I to 30 Sh'vat in a regular year (whose Adar has 29 days)", () => {
      // 30 Adar I 5784 = 10 Mar 2024; in 5785 that is 30 Sh'vat = 28 Feb 2025 (the day before 1 Adar).
      expect(hebrewToGregorianISO(30, ADAR, 5784)).toBe('2024-03-10');
      expect(yahrzeitInYear({ day: 30, month: ADAR, year: 5784 }, 5785)).toBe('2025-02-28');
      expect(hebrewToGregorianISO(30, SHEVAT, 5785)).toBe('2025-02-28');
    });
  });

  describe('30 Cheshvan and 30 Kislev', () => {
    it('uses the last day of Cheshvan when the first anniversary had no 30 Cheshvan', () => {
      // Died 30 Cheshvan 5785; 5786 has a 29-day Cheshvan, so from then on the yahrzeit is the last
      // day of Cheshvan: 29 Cheshvan in 5786 (not 1 Kislev), and 30 Cheshvan = 10 Nov 2026 in 5787.
      const death = { day: 30, month: CHESHVAN, year: 5785 };
      expect(yahrzeitInYear(death, 5786)).toBe(hebrewToGregorianISO(29, CHESHVAN, 5786));
      expect(yahrzeitInYear(death, 5787)).toBe('2026-11-10');
      expect(yahrzeitInYear(death, 5789)).toBe(hebrewToGregorianISO(29, CHESHVAN, 5789));
    });

    it('keeps 30 Cheshvan when the first anniversary had one, else the next day (1 Kislev)', () => {
      // Died 30 Cheshvan 5787; 5788 also has 30 Cheshvan. 5789 does not: 1 Kislev.
      const death = { day: 30, month: CHESHVAN, year: 5787 };
      expect(yahrzeitInYear(death, 5788)).toBe(hebrewToGregorianISO(30, CHESHVAN, 5788));
      expect(yahrzeitInYear(death, 5789)).toBe(hebrewToGregorianISO(1, KISLEV, 5789));
    });

    it('uses the last day of Kislev when the first anniversary had no 30 Kislev', () => {
      // Died 30 Kislev 5789; 5790 has a 29-day Kislev: 29 Kislev then (not 1 Tevet), 30 Kislev in 5791.
      const death = { day: 30, month: KISLEV, year: 5789 };
      expect(yahrzeitInYear(death, 5790)).toBe(hebrewToGregorianISO(29, KISLEV, 5790));
      expect(yahrzeitInYear(death, 5791)).toBe(hebrewToGregorianISO(30, KISLEV, 5791));
    });

    it('keeps 30 Kislev when the first anniversary had one, else 1 Tevet', () => {
      // Died 30 Kislev 5785; 5786 has 30 Kislev. 5790 does not: 1 Tevet.
      const death = { day: 30, month: KISLEV, year: 5785 };
      expect(yahrzeitInYear(death, 5786)).toBe(hebrewToGregorianISO(30, KISLEV, 5786));
      expect(yahrzeitInYear(death, 5790)).toBe(hebrewToGregorianISO(1, TEVET, 5790));
    });
  });
});

describe('Hebrew birthdays and other anniversaries', () => {
  it("moves a regular year's Adar to Adar II in a leap year", () => {
    // Born 10 Adar 5783 (the last month of a regular year) -> 10 Adar II 5784.
    expect(hebrewAnniversaryInYear({ day: 10, month: ADAR, year: 5783 }, 5784)).toBe('2024-03-20');
  });

  it('keeps Adar I as Adar in a regular year', () => {
    expect(hebrewAnniversaryInYear({ day: 5, month: ADAR, year: 5784 }, 5785)).toBe('2025-03-05');
  });
});

describe('seed data', () => {
  it.each(seedImportantDates.map((d) => [d.date, d] as const))(
    '%s has a nightfall answer and the matching Hebrew date',
    (_iso, d) => {
      expect(d.afterNightfall).toBeTypeOf('boolean');
      expect({ day: d.hebrewDay, month: d.hebrewMonth, year: d.hebrewYear }).toEqual(
        gregorianToHebrew(d.date, { afterNightfall: d.afterNightfall }),
      );
    },
  );
});

describe('occurrences', () => {
  const yahrzeit: RecurringDate = { type: 'yahrzeit', date: '2019-11-02', recurring: true };

  it('repeats a yahrzeit on its Hebrew date by default', () => {
    // 2 Nov 2019 = 4 Cheshvan 5780.
    expect(occurrencesBetween(yahrzeit, '2026-01-01', '2026-12-31')).toEqual(['2026-10-15']);
  });

  it('uses the Hebrew day after an event after nightfall', () => {
    expect(occurrencesBetween({ ...yahrzeit, afterNightfall: true }, '2026-01-01', '2026-12-31')).toEqual([
      '2026-10-16',
    ]);
  });

  it('prefers the stored Hebrew date', () => {
    const stored = { ...yahrzeit, hebrewDay: 4, hebrewMonth: CHESHVAN, hebrewYear: 5780, afterNightfall: true };
    expect(occurrencesBetween(stored, '2026-01-01', '2026-12-31')).toEqual(['2026-10-15']);
  });

  it('can repeat on the English date instead', () => {
    expect(occurrencesBetween({ ...yahrzeit, recurBy: 'gregorian' }, '2026-01-01', '2026-12-31')).toEqual([
      '2026-11-02',
    ]);
  });

  it('repeats a birthday on the English date by default, with 29 Feb on the 28th', () => {
    const leapling: RecurringDate = { type: 'birthday', date: '2020-02-29', recurring: true };
    expect(occurrencesBetween(leapling, '2027-01-01', '2028-12-31')).toEqual(['2027-02-28', '2028-02-29']);
  });

  it('only shows a one-time date on its own day, and never before an event', () => {
    const once: RecurringDate = { type: 'bar_mitzvah', date: '2026-11-10', recurring: false };
    expect(occurrencesBetween(once, '2026-01-01', '2026-12-31')).toEqual(['2026-11-10']);
    expect(occurrencesBetween(once, '2027-01-01', '2027-12-31')).toEqual([]);
    const future: RecurringDate = { type: 'birthday', date: '2026-06-01', recurring: true };
    expect(occurrencesBetween(future, '2025-01-01', '2025-12-31')).toEqual([]);
  });

  it('finds the next occurrence, today included', () => {
    expect(nextOccurrence(yahrzeit, '2026-10-15')).toBe('2026-10-15');
    expect(nextOccurrence(yahrzeit, '2026-10-16')).toBe(hebrewToGregorianISO(4, CHESHVAN, 5788));
    expect(nextOccurrence({ type: 'birthday', date: '2020-01-01' }, '2026-10-16')).toBeNull();
  });
});
