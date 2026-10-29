import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-api-test-');

const { db, closeDatabase } = await import('./db.ts');
const { donations, dashboardStats, families, importantDates, members, pledges, upcomingImportantDates } = await import('./repo.ts');
const { ensureDefaultOrganization, listOrganizationIds, loadOrganizationIds } = await import('./tenant.ts');

const YEAR = new Date().getFullYear();

beforeAll(async () => {
  await loadOrganizationIds();
  if (listOrganizationIds().length === 0) await ensureDefaultOrganization();
  await loadOrganizationIds();
});

beforeEach(async () => {
  for (const table of ['notes', 'importantDates', 'donations', 'pledges', 'members', 'families']) {
    await db.exec(`DELETE FROM ${table}`);
  }
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort: on Windows the file may stay locked; the OS temp dir reclaims it.
  }
});

describe('repo: foreign-key behavior', () => {
  it('cascades a family delete to its members, pledges, and donations', async () => {
    const family = await families.create({ name: 'Cascade Family', status: 'active' });
    const member = await members.create({
      familyId: family.id,
      firstName: 'Avi',
      lastName: 'Cohen',
      gender: 'male',
      status: 'active',
    });
    const pledge = await pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    const donation = await donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledge.id,
      amount: 100,
      currency: 'USD',
      date: `${YEAR}-01-01`,
      method: 'cash',
    });

    expect(await members.get(member.id)).toBeDefined();
    expect((await pledges.list()).some((p) => p.id === pledge.id)).toBe(true);
    expect((await donations.list()).some((d) => d.id === donation.id)).toBe(true);

    await families.remove(family.id);

    expect(await families.get(family.id)).toBeUndefined();
    expect(await members.get(member.id)).toBeUndefined();
    expect((await pledges.list()).some((p) => p.id === pledge.id)).toBe(false);
    expect((await donations.list()).some((d) => d.id === donation.id)).toBe(false);
  });

  it('keeps a donation when its pledge is deleted (donations.pledgeId -> ON DELETE SET NULL)', async () => {
    const family = await families.create({ name: 'Unlink Family', status: 'active' });
    const pledge = await pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    const donation = await donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledge.id,
      amount: 500,
      currency: 'USD',
      date: `${YEAR}-01-01`,
      method: 'check',
    });

    expect((await donations.list()).find((d) => d.id === donation.id)?.pledgeId).toBe(pledge.id);

    await pledges.remove(pledge.id);

    expect((await pledges.list()).some((p) => p.id === pledge.id)).toBe(false);
    const surviving = (await donations.list()).find((d) => d.id === donation.id);
    expect(surviving).toBeDefined();
    expect(surviving?.pledgeId).toBeUndefined();
  });
});

describe('repo: dashboardStats math', () => {
  it('floors each pledge at zero and sums only current-year donations', async () => {
    const family = await families.create({ name: 'Stats Family', status: 'active' });

    const pledgeA = await pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 1000, currency: 'USD' });
    await donations.create({
      fund: 'General',
      familyId: family.id,
      pledgeId: pledgeA.id,
      amount: 1200,
      currency: 'USD',
      date: `${YEAR}-03-01`,
      method: 'check',
    });

    await pledges.create({ fund: 'General', familyId: family.id, year: YEAR, amount: 500, currency: 'USD' });

    await donations.create({
      fund: 'General',
      familyId: family.id,
      amount: 100,
      currency: 'USD',
      date: `${YEAR}-04-01`,
      method: 'cash',
    });

    const stats = await dashboardStats();

    expect(stats.openPledgeBalance.USD).toBe(500);
    expect(stats.donatedYtd.USD).toBe(1300);
  });
});

describe('repo: upcomingImportantDates', () => {
  const today = '2026-10-14';

  it('resolves names, rolls recurring dates to the next anniversary, and filters to the window', async () => {
    const family = await families.create({ name: 'Levi Family', status: 'active' });
    const member = await members.create({
      familyId: family.id,
      firstName: 'Rivka',
      lastName: 'Levi',
      gender: 'female',
      status: 'active',
    });

    const bday = await importantDates.create({ memberId: member.id, type: 'birthday', date: '2020-11-01', recurring: true });
    const yahrzeit = await importantDates.create({ memberId: member.id, type: 'yahrzeit', date: '2019-09-01', recurring: true });
    const past = await importantDates.create({ memberId: member.id, type: 'bar_mitzvah', date: '2023-01-18', recurring: false });
    const future = await importantDates.create({ memberId: member.id, type: 'bar_mitzvah', date: '2026-11-10', recurring: false });

    const upcoming = await upcomingImportantDates(90, today);

    expect(upcoming.map((u) => u.id)).toEqual([bday.id, future.id]);
    expect(upcoming.map((u) => u.id)).not.toContain(past.id);
    expect(upcoming.map((u) => u.id)).not.toContain(yahrzeit.id);

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
