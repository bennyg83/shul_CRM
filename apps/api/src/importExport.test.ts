import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { IMPORT_SPECS, guessMapping } from '@shulcrm/shared';

// Throwaway database, set before db.ts loads (see repo.test.ts for why the imports are dynamic).
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-import-test-');

const { db, closeDatabase } = await import('./db.ts');
const repo = await import('./repo.ts');
const settings = await import('./settings.ts');
const { commitImport, exportTable, parseDate, parseNumber, previewImport } = await import('./importExport.ts');
const { readTable, readXlsx, writeCsv, writeXlsx } = await import('./spreadsheet.ts');
const { resolveOrgId, ensureDefaultOrganization, listOrganizationIds, loadOrganizationIds } = await import('./tenant.ts');

beforeAll(async () => {
  await loadOrganizationIds();
  if (listOrganizationIds().length === 0) await ensureDefaultOrganization();
  await loadOrganizationIds();
});

beforeEach(async () => {
  for (const table of ['notes', 'importantDates', 'donations', 'pledges', 'members', 'families', 'settings']) {
    await db.exec(`DELETE FROM ${table}`);
  }
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

describe('cell parsing', () => {
  it('reads dates in the common formats', () => {
    expect(parseDate('2026-03-05', false)).toBe('2026-03-05');
    expect(parseDate('2026/3/5', false)).toBe('2026-03-05');
    expect(parseDate('5/3/2026', false)).toBe('2026-03-05'); // day first
    expect(parseDate('5/3/2026', true)).toBe('2026-05-03'); // US: month first
    expect(parseDate('25/3/2026', true)).toBe('2026-03-25'); // 25 can only be the day
    expect(parseDate('5.3.71', false)).toBe('1971-03-05');
    expect(parseDate('46086', false)).toBe('2026-03-05'); // Excel day number
    expect(parseDate('31/2/2026', false)).toBeUndefined();
    expect(parseDate('soon', false)).toBeUndefined();
  });

  it('reads amounts', () => {
    expect(parseNumber('$1,200.50')).toBe(1200.5);
    expect(parseNumber('₪ 2000')).toBe(2000);
    expect(parseNumber('1.200,50')).toBe(1200.5);
    expect(parseNumber('abc')).toBeUndefined();
  });
});

describe('spreadsheets', () => {
  const headers = ['Name', 'Hebrew name', 'Phone', 'Amount'];
  const rows: Array<Array<string | number>> = [
    ['Cohen', 'כהן', '+420 601 111 202', 1200],
    ['Levy & Sons <Ltd>', '', '=1+1', 0.5],
  ];

  it('writes and reads back an Excel file', () => {
    const table = readXlsx(writeXlsx('Families', headers, rows));
    expect(table).toEqual([headers, ...rows.map((r) => r.map(String))]);
  });

  it('writes CSV that reads back, with formula-looking cells guarded and restored', () => {
    const csv = writeCsv(headers, rows);
    expect(csv).toContain("'+420 601 111 202");
    expect(csv).toContain("'=1+1");
    const table = readTable(new TextEncoder().encode(csv));
    expect(table).toEqual([headers, ...rows.map((r) => r.map(String))]);
  });
});

describe('import', () => {
  const families = {
    rows: [
      ['Cohen', 'כהן', '+420 601 111 202', 'cohen@example.com'],
      ['Levy', '', '', 'LEVY@EXAMPLE.COM'],
      ['Cohen', '', '+420 601 111 202', ''], // same as row 1
      ['', '', '', 'no-name@example.com'], // missing name
    ],
    mapping: { name: 0, hebrewName: 1, phone: 2, email: 3 },
  };

  it('previews families: ready rows, duplicates within the file, and problems', async () => {
    const preview = await previewImport('families', families);
    expect(preview.results.map((r) => r.status)).toEqual(['ok', 'ok', 'duplicate', 'error']);
    expect(preview.results[3].messages).toContain('Name is missing');
    expect(await repo.families.list()).toHaveLength(0); // nothing written
  });

  it('imports families, then flags the same file as duplicates', async () => {
    const result = await commitImport('families', { ...families, skipDuplicates: true });
    expect(result).toMatchObject({ created: 2, skipped: 1, failed: 1 });
    const saved = await repo.families.list();
    expect(saved.map((f) => f.name)).toEqual(['Cohen', 'Levy']);
    expect(saved[1].email).toBe('levy@example.com');
    expect(saved[0].status).toBe('active');
    expect((await previewImport('families', families)).counts).toEqual({ ok: 0, duplicate: 3, error: 1 });
  });

  it('imports members into existing or new families', async () => {
    await repo.families.create({ name: 'Cohen', status: 'active' });
    const req = {
      rows: [
        ['Cohen', 'Yosef', 'M', 'husband', '25/01/1965'],
        ['Weiss', 'Devorah', 'female', 'Wife', '1963-10-05'],
        ['Nobody', 'Ann', 'x', '', ''],
      ],
      mapping: { family: 0, firstName: 1, gender: 2, role: 3, birthDate: 4 },
      createMissingFamilies: true,
    };
    const preview = await previewImport('members', req);
    expect(preview.results.map((r) => r.status)).toEqual(['ok', 'ok', 'error']);
    expect(preview.newFamilies).toEqual(['Weiss']); // "Nobody" has an error, so it isn't created
    const result = await commitImport('members', req);
    expect(result).toMatchObject({ created: 2, newFamilies: 1 });
    const members = await repo.members.list();
    const yosef = members.find((m) => m.firstName === 'Yosef');
    expect(yosef).toMatchObject({ lastName: 'Cohen', gender: 'male', role: 'husband', birthDate: '1965-01-25' });
    const devorah = members.find((m) => m.firstName === 'Devorah');
    expect((await repo.families.get(devorah!.familyId))?.name).toBe('Weiss');
  });

  it('adds funds and payment methods only the old system had', async () => {
    await repo.families.create({ name: 'Perl', status: 'active' });
    const req = {
      rows: [['Perl', 'Yom Kippur Appeal', '$180', '2025-09-30', 'Zelle']],
      mapping: { family: 0, fund: 1, amount: 2, date: 3, method: 4 },
    };
    expect((await previewImport('donations', req)).newListItems).toEqual([
      { list: 'funds', key: 'Yom Kippur Appeal' },
      { list: 'paymentMethods', key: 'Zelle' },
    ]);
    await commitImport('donations', req);
    const lists = await settings.getLookups();
    expect(lists.funds.some((f) => f.key === 'Yom Kippur Appeal')).toBe(true);
    expect(lists.paymentMethods.some((m) => m.key === 'Zelle')).toBe(true);
    expect((await repo.donations.list())[0]).toMatchObject({ amount: 180, currency: 'USD', method: 'Zelle' });
  });

  it('imports a yahrzeit with its Hebrew date, matching the member by name', async () => {
    const fam = await repo.families.create({ name: 'Cohen', status: 'active' });
    await repo.members.create({ familyId: fam.id, firstName: 'Yosef', lastName: 'Cohen', gender: 'male', status: 'active' });
    await commitImport('importantDates', {
      rows: [['Yosef Cohen', 'Yahrzeit (Memorial)', '2019-11-02', 'yes']],
      mapping: { member: 0, type: 1, date: 2, afterNightfall: 3 },
    });
    // After nightfall on 2 Nov 2019 is already 5 Cheshvan 5780.
    expect((await repo.importantDates.list())[0]).toMatchObject({
      type: 'yahrzeit',
      afterNightfall: true,
      recurring: true,
      hebrewDay: 5,
      hebrewMonth: 8,
      hebrewYear: 5780,
    });
  });

  it('exports with the import headers, so an export imports back as duplicates', async () => {
    await commitImport('families', families);
    const { headers, rows } = await exportTable('families');
    const table = readTable(new TextEncoder().encode(writeCsv(headers, rows)));
    const [h, ...data] = table;

    const preview = await previewImport('families', { rows: data, mapping: guessMapping(IMPORT_SPECS.families, h) });
    expect(preview.counts).toEqual({ ok: 0, duplicate: 2, error: 0 });
  });
});

describe('settings', () => {
  it('refuses to delete a list item that records use, but allows retiring it', async () => {
    const fam = await repo.families.create({ name: 'Perl', status: 'active' });
    await repo.donations.create({ fund: 'General', familyId: fam.id, amount: 1, currency: 'USD', date: '2026-01-01', method: 'cash' });
    const methods = (await settings.getLookups()).paymentMethods;
    await expect(settings.saveLookup('paymentMethods', methods.filter((m) => m.key !== 'cash'))).rejects.toThrow(/Still in use/);
    const retired = methods.map((m) => (m.key === 'cash' ? { ...m, active: false } : m));
    expect((await settings.saveLookup('paymentMethods', retired)).paymentMethods.find((m) => m.key === 'cash')?.active).toBe(false);
  });

  it('rejects a record whose list value is unknown', async () => {
    await expect(settings.checkLookups('donations', { method: 'bitcoin' })).rejects.toThrow(/not in the paymentMethods list/);
    await expect(settings.checkLookups('donations', { method: 'cash' })).resolves.toBeUndefined();
  });

  it('keeps the install id when the profile is saved', async () => {
    const id = (await settings.getOrg()).orgId;
    const saved = await settings.saveOrg({ ...(await settings.getOrg()), name: 'Pilzno Synagogue', orgId: 'changed' });
    expect(saved.orgId).toBe(id);
  });

  it('adds values found on old records to their list, retired', async () => {
    const fam = await repo.families.create({ name: 'Levy', status: 'active' });
    const m = await repo.members.create({ familyId: fam.id, firstName: 'Daniel', lastName: 'Levy', gender: 'male', status: 'active' });
    await db
      .prepare(
        `INSERT INTO importantDates (id, orgId, memberId, type, date) VALUES ('00000000-0000-7000-8000-00000000abcd', ?, ?, 'brit_mitzvah', '2023-01-18')`,
      )
      .run(resolveOrgId(), m.id);
    await settings.reconcileLookups();
    expect((await settings.getLookups()).dateTypes.find((t) => t.key === 'brit_mitzvah')).toMatchObject({
      label: 'Brit mitzvah',
      active: false,
    });
  });

  it('accepts only PNG, JPEG or WebP logos', async () => {
    expect(settings.sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(settings.sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(settings.sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    await expect(settings.saveLogo(new TextEncoder().encode('<svg/>'))).rejects.toThrow(/PNG, JPEG or WebP/);
  });
});
