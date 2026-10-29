import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { formatMoneyWith } from '@shulcrm/shared';
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-ops-test-');

const { closeDatabase } = await import('./db.ts');
const repo = await import('./repo.ts');
const settings = await import('./settings.ts');
const ev = await import('./events.ts');
const docs = await import('./documents.ts');
const email = await import('./email.ts');
const { report } = await import('./reports.ts');
const { ensureDefaultOrganization, listOrganizationIds, loadOrganizationIds } = await import('./tenant.ts');

let familyId = '';
let donationId = '';
let yahrzeitId = '';

beforeAll(async () => {
  await loadOrganizationIds();
  if (listOrganizationIds().length === 0) await ensureDefaultOrganization();
  await loadOrganizationIds();
  await repo.reseed();
  await settings.saveOrg({
    ...(await settings.getOrg()),
    name: 'Beth Shalom Synagogue',
    email: 'office@bethshalom.example',
    taxId: '12-3456789',
  });
  const cohen = (await repo.families.list()).find((f) => f.name === 'Cohen')!;
  familyId = cohen.id;
  donationId = (await repo.donations.list()).find((d) => d.familyId === familyId && d.fund === 'Education')!.id;
  yahrzeitId = (await repo.importantDates.list()).find((d) => d.type === 'yahrzeit' && d.personName === 'Avraham Cohen')!.id;
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

describe('documents', () => {
  it('builds a receipt with labels, a receipt number and the greeting', async () => {
    const r = await docs.receipt(donationId);
    expect(r.greeting).toBe('Yosef and Esther Cohen');
    expect(r.receiptNumber).toMatch(/^2026-[0-9A-F]{8}$/);
    expect(r.fundLabel).toBe('Education');
    expect(r.org.taxId).toBe('12-3456789');
  });

  it('builds a year-end statement with per-currency totals and pledge balances', async () => {
    const s = await docs.statement(familyId, 2026);
    const mine = (await repo.donations.list()).filter((d) => d.familyId === familyId && d.date.startsWith('2026'));
    expect(s.donations.map((d) => d.date)).toEqual(mine.map((d) => d.date).sort());
    const totals: Record<string, number> = {};
    for (const d of mine) totals[d.currency] = (totals[d.currency] ?? 0) + d.amount;
    expect(s.totals).toEqual(totals);
    expect(s.pledges.every((p) => p.balance === Math.max(0, p.amount - p.paid))).toBe(true);
    expect((await docs.statements(2026)).map((x) => x.family.name)).toContain('Cohen');
  });

  it('finds yahrzeits in a range, with who is remembered and the evening it starts', async () => {
    const [n] = await docs.yahrzeitNotices('2026-10-01', '2026-10-31');
    expect(n).toMatchObject({ name: 'Avraham Cohen', relationship: 'Father', hebrewDate: '4 Cheshvan, 5787', evening: '2026-10-14' });
    expect(n.occurrence.nextOccurrence).toBe('2026-10-15');
  });
});

describe('email', () => {
  it('renders variables into text and HTML, escaping what people typed', () => {
    const out = email.renderTemplate('Hi {{family.name}}', 'Dear {{family.greeting}},\n\n<b>{{unknown.var}}</b>', {
      'family.name': { text: 'Cohen' },
      'family.greeting': { text: 'Tom & Jerry <script>' },
    });
    expect(out.subject).toBe('Hi Cohen');
    expect(out.text).toContain('Dear Tom & Jerry <script>,');
    expect(out.text).toContain('{{unknown.var}}');
    expect(out.html).toContain('Tom &amp; Jerry &lt;script&gt;');
    expect(out.html).toContain('&lt;b&gt;{{unknown.var}}&lt;/b&gt;');
  });

  it('previews a receipt email without sending', async () => {
    const result = await email.sendEmails({ template: 'receipt', recipients: [{ familyId, donationId }], dryRun: true });
    const [m] = result.messages;
    expect(m.to).toBe('cohen@example.com');
    expect(m.subject).toBe('Thank you for your donation to Beth Shalom Synagogue');
    expect(m.text).toContain('Dear Yosef and Esther Cohen,');
    const d = (await repo.donations.list()).find((x) => x.id === donationId)!;
    const amount = formatMoneyWith((await settings.getLookups()).currencies, d.amount, d.currency);
    expect(m.text).toContain(`${amount} to the Education fund`);
    expect(m.text).toContain('Tax / charity number: 12-3456789');
    expect(m.html).toContain('<table');
    expect(await email.emailLog()).toHaveLength(0);
  });

  it('sends a yahrzeit reminder in test mode: rendered and logged, not sent', async () => {
    const result = await email.sendEmails({
      template: 'yahrzeit',
      recipients: [{ familyId, importantDateId: yahrzeitId, occurrence: '2026-10-15' }],
    });
    expect(result).toMatchObject({ sent: 1, failed: 0, testMode: true });
    expect(result.messages[0].text).toContain('the yahrzeit of Avraham Cohen (אברהם בן יצחק), your father, falls on 4 Cheshvan, 5787');
    const [entry] = await email.emailLog();
    expect(entry).toMatchObject({ status: 'test', toAddress: 'cohen@example.com', familyName: 'Cohen', template: 'yahrzeit' });
  });

  it('skips a family without an email address', async () => {
    const weiss = (await repo.families.list()).find((f) => !f.email)!;
    const result = await email.sendEmails({ template: 'statement', recipients: [{ familyId: weiss.id, year: 2026 }] });
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(result.messages[0].problem).toBe('No email address');
  });

  it('never returns the saved password', async () => {
    const view = await email.saveEmailSettings({ host: 'smtp.example.org', port: 587, secure: false, user: 'u', password: 'secret', testMode: true });
    expect(view).not.toHaveProperty('password');
    expect(view.hasPassword).toBe(true);
    expect((await email.saveEmailSettings({ ...view, password: '' })).hasPassword).toBe(true);
    expect((await email.saveEmailSettings({ ...view, clearPassword: true })).hasPassword).toBe(false);
  });
});

describe('events', () => {
  it('counts RSVPs and enforces capacity', async () => {
    const e = await ev.events.create({ title: 'Shabbat kiddush', date: '2026-11-07', capacity: 6, rsvpOpen: true });
    const [a, b] = await repo.families.list();
    await ev.saveRsvp({ eventId: e.id, familyId: a.id, status: 'yes', adults: 2, children: 2 });
    await expect(ev.saveRsvp({ eventId: e.id, familyId: b.id, status: 'yes', adults: 3, children: 0 })).rejects.toThrow(/Only 2 places/);
    await ev.saveRsvp({ eventId: e.id, familyId: b.id, status: 'maybe', adults: 3, children: 0 });
    await ev.saveRsvp({ eventId: e.id, familyId: a.id, status: 'yes', adults: 2, children: 4 });
    const [summary] = await ev.eventSummaries('2026-11-01', '2026-11-30');
    expect(summary).toMatchObject({ rsvps: 2, attending: 6, maybe: 3 });
    expect((await ev.eventDetail(e.id)).rsvps).toHaveLength(2);
  });
});

describe('reports', () => {
  it('totals donations by fund and month', async () => {
    const t = await report('donationsByFund', 2026);
    const general = t.rows.find((r) => r[0] === 'General' && r[1] === 'USD')!;
    const expected = (await repo.donations
      .list())
      .filter((d) => d.fund === 'General' && d.currency === 'USD' && d.date.startsWith('2026'))
      .reduce((sum, d) => sum + d.amount, 0);
    expect(general.at(-1)).toBe(expected);
    expect(t.columns).toHaveLength(16);
  });

  it('lists pledge status and the directory', async () => {
    expect((await report('pledgeStatus', 2026)).rows.length).toBe((await repo.pledges.list()).filter((p) => p.year === 2026).length);
    expect((await report('directory', 2026)).rows.length).toBeGreaterThan(0);
  });
});
