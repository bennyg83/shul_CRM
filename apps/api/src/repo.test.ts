import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB singleton (src/db.ts) at a throwaway file BEFORE it — or repo.ts,
// which imports it — is loaded, so the tests never touch the real
// apps/api/data/crm.sqlite. A static import cannot work: it would evaluate
// src/db.ts before the env assignment below, binding the singleton to the real
// database path. The dynamic imports below are therefore intentional (they exist
// only to control module-load order relative to the env setup).
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'crm-api-test-'));
process.env.CRM_DATA_DIR = TEST_DATA_DIR;

const { db } = await import('./db.ts');
const { donations, dashboardStats, families, importantDates, members, pledges, upcomingImportantDates } = await import('./repo.ts');

const YEAR = new Date().getFullYear();

// Start each test from an empty database so the stats counts are deterministic.
beforeEach(() => {
  for (const table of ['notes', 'importantDates', 'donations', 'pledges', 'members', 'families']) {
    db.exec(`DELETE FROM ${table}`);
  }
});

afterAll(() => {
  try {
    db.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort: on Windows the file may stay locked; the OS temp dir reclaims it.
  }
});

describe('repo: foreign-key behavior', () => {
  it('cascades a family delete to its members, pledges, and donations', () => {
    const family = families.create({ name: 'Cascade Family', status: 'active' });
    const member = members.create({
      familyId: family.id,
      firstName: 'Avi',
      lastName: 'Cohen',
      gender: 'male',
      status: 'active',
    });
    const pledge = pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    const donation = donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledge.id,
      amount: 100,
      currency: 'USD',
      date: `${YEAR}-01-01`,
      method: 'cash',
    });

    // All three linked rows exist before the cascade.
    expect(members.get(member.id)).toBeDefined();
    expect(pledges.list().some((p) => p.id === pledge.id)).toBe(true);
    expect(donations.list().some((d) => d.id === donation.id)).toBe(true);

    families.remove(family.id);

    expect(families.get(family.id)).toBeUndefined();
    expect(members.get(member.id)).toBeUndefined(); // members.familyId  -> ON DELETE CASCADE
    expect(pledges.list().some((p) => p.id === pledge.id)).toBe(false); // pledges.familyId -> CASCADE
    expect(donations.list().some((d) => d.id === donation.id)).toBe(false); // donations.familyId -> CASCADE
  });

  it('keeps a donation when its pledge is deleted (donations.pledgeId -> ON DELETE SET NULL)', () => {
    const family = families.create({ name: 'Unlink Family', status: 'active' });
    const pledge = pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    const donation = donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledge.id,
      amount: 500,
      currency: 'USD',
      date: `${YEAR}-01-01`,
      method: 'check',
    });

    // The donation is linked to the pledge before the delete.
    expect(donations.list().find((d) => d.id === donation.id)?.pledgeId).toBe(pledge.id);

    pledges.remove(pledge.id);

    // The pledge is gone, but the donation survives with its link nulled out.
    expect(pledges.list().some((p) => p.id === pledge.id)).toBe(false);
    const surviving = donations.list().find((d) => d.id === donation.id);
    expect(surviving).toBeDefined();
    expect(surviving?.pledgeId).toBeUndefined();
  });
});

describe('repo: dashboardStats math', () => {
  it('floors each pledge at zero and sums only current-year donations', () => {
    const family = families.create({ name: 'Stats Family', status: 'active' });

    // Pledge A is overpaid (1000 pledged, 1200 paid) -> contributes 0.
    const pledgeA = pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledgeA.id,
      amount: 1200,
      currency: 'USD',
      date: `${YEAR}-03-01`,
      method: 'check',
    });

    // Pledge B is underpaid (500 pledged, 0 paid) -> contributes 500.
    pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 500, currency: 'USD' });

    // A current-year donation not tied to any pledge still counts toward YTD.
    donations.create({
      fund: 'General',
      familyId: family.id,
      amount: 100,
      currency: 'USD',
      date: `${YEAR}-04-01`,
      method: 'cash',
    });

    const stats = dashboardStats();

    // openPledgeBalance.USD = MAX(0, 1000 - 1200) + MAX(0, 500 - 0) = 0 + 500 = 500.
    // (Overpayment on pledge A does not offset the underpayment on pledge B. All test rows are USD.)
    expect(stats.openPledgeBalance.USD).toBe(500);

    // donatedYtd.USD = 1200 + 100 = 1300 (both donations dated in the current year).
    expect(stats.donatedYtd.USD).toBe(1300);
  });
});

describe('repo: upcomingImportantDates', () => {
  const today = new Date(2026, 9, 14); // local 2026-10-14

  it('resolves names, rolls recurring dates to the next anniversary, and filters to the window', () => {
    const family = families.create({ name: 'Levi Family', status: 'active' });
    const member = members.create({
      familyId: family.id,
      firstName: 'Rivka',
      lastName: 'Levi',
      gender: 'female',
      status: 'active',
    });

    // Recurring birthday: the anniversary lands ~18 days ahead (within the 90-day window).
    const bday = importantDates.create({ memberId: member.id, type: 'birthday', date: '2020-11-01', recurring: true });
    // Recurring yahrzeit: this year's anniversary already passed -> rolls to next year (outside the window).
    const yahrzeit = importantDates.create({ memberId: member.id, type: 'yahrzeit', date: '2019-09-01', recurring: true });
    // One-time date in the past -> excluded.
    const past = importantDates.create({ memberId: member.id, type: 'brit_mitzvah', date: '2023-01-18', recurring: false });
    // One-time date ~27 days ahead -> included.
    const future = importantDates.create({ memberId: member.id, type: 'brit_mitzvah', date: '2026-11-10', recurring: false });

    const upcoming = upcomingImportantDates(90, today);

    // Exactly the two in-window dates, sorted by next occurrence (Nov 1 before Nov 10).
    expect(upcoming.map((u) => u.id)).toEqual([bday.id, future.id]);
    expect(upcoming.map((u) => u.id)).not.toContain(past.id);
    expect(upcoming.map((u) => u.id)).not.toContain(yahrzeit.id);

    // Member/family resolved; next occurrence and daysUntil computed correctly.
    const bdayRow = upcoming.find((u) => u.id === bday.id);
    expect(bdayRow?.memberName).toBe('Rivka Levi');
    expect(bdayRow?.familyName).toBe('Levi Family');
    expect(bdayRow?.nextOccurrence).toBe('2026-11-01');
    expect(bdayRow?.daysUntil).toBe(18);

    const futureRow = upcoming.find((u) => u.id === future.id);
    expect(futureRow?.nextOccurrence).toBe('2026-11-10');
    expect(futureRow?.daysUntil).toBe(27);
  });
});
