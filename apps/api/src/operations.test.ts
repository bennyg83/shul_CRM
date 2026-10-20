import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatMoneyWith } from '@shulcrm/shared';

// Throwaway database, set before db.ts loads (see repo.test.ts).
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'crm-ops-test-'));
process.env.CRM_DATA_DIR = TEST_DATA_DIR;

const { db } = await import('./db.ts');
const repo = await import('./repo.ts');
const settings = await import('./settings.ts');
const ev = await import('./events.ts');
const docs = await import('./documents.ts');
const email = await import('./email.ts');
const { report } = await import('./reports.ts');

let familyId = '';
let donationId = '';
let yahrzeitId = '';

beforeAll(() => {
  repo.reseed();
  settings.saveOrg({ ...settings.getOrg(), name: 'Beth Shalom Synagogue', email: 'office@bethshalom.example', taxId: '12-3456789' });
  const cohen = repo.families.list().find((f) => f.name === 'Cohen')!;
  familyId = cohen.id;
  donationId = repo.donations.list().find((d) => d.familyId === familyId && d.fund === 'Education')!.id;
  yahrzeitId = repo.importantDates.list().find((d) => d.type === 'yahrzeit' && d.personName === 'Avraham Cohen')!.id;
});

afterAll(() => {
  try {
    db.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

describe('documents', () => {
  it('builds a receipt with labels, a receipt number and the greeting', () => {
    const r = docs.receipt(donationId);
    expect(r.greeting).toBe('Yosef and Esther Cohen');
    expect(r.receiptNumber).toMatch(/^2026-[0-9A-F]{8}$/);
    expect(r.fundLabel).toBe('Education');
    expect(r.org.taxId).toBe('12-3456789');
  });

  it('builds a year-end statement with per-currency totals and pledge balances', () => {
    const s = docs.statement(familyId, 2026);
    const mine = repo.donations.list().filter((d) => d.familyId === familyId && d.date.startsWith('2026'));
    expect(s.donations.map((d) => d.date)).toEqual(mine.map((d) => d.date).sort()); // in date order
    const totals: Record<string, number> = {};
    for (const d of mine) totals[d.currency] = (totals[d.currency] ?? 0) + d.amount;
    expect(s.totals).toEqual(totals);
    expect(s.pledges.every((p) => p.balance === Math.max(0, p.amount - p.paid))).toBe(true);
    expect(docs.statements(2026).map((x) => x.family.name)).toContain('Cohen');
  });

  it('finds yahrzeits in a range, with who is remembered and the evening it starts', () => {
    // 4 Cheshvan 5787 = 15 Oct 2026; it begins the evening before.
    const [n] = docs.yahrzeitNotices('2026-10-01', '2026-10-31');
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
    expect(out.text).toContain('{{unknown.var}}'); // left visible
    expect(out.html).toContain('Tom &amp; Jerry &lt;script&gt;');
    expect(out.html).toContain('&lt;b&gt;{{unknown.var}}&lt;/b&gt;');
  });

  it('previews a receipt email without sending', async () => {
    const result = await email.sendEmails({ template: 'receipt', recipients: [{ familyId, donationId }], dryRun: true });
    const [m] = result.messages;
    expect(m.to).toBe('cohen@example.com');
    expect(m.subject).toBe('Thank you for your donation to Beth Shalom Synagogue');
    expect(m.text).toContain('Dear Yosef and Esther Cohen,');
    const d = repo.donations.list().find((x) => x.id === donationId)!;
    const amount = formatMoneyWith(settings.getLookups().currencies, d.amount, d.currency);
    expect(m.text).toContain(`${amount} to the Education fund`);
    expect(m.text).toContain('Tax / charity number: 12-3456789');
    expect(m.html).toContain('<table');
    expect(email.emailLog()).toHaveLength(0); // a preview is not logged
  });

  it('sends a yahrzeit reminder in test mode: rendered and logged, not sent', async () => {
    const result = await email.sendEmails({
      template: 'yahrzeit',
      recipients: [{ familyId, importantDateId: yahrzeitId, occurrence: '2026-10-15' }],
    });
    expect(result).toMatchObject({ sent: 1, failed: 0, testMode: true });
    expect(result.messages[0].text).toContain('the yahrzeit of Avraham Cohen (אברהם בן יצחק), your father, falls on 4 Cheshvan, 5787');
    const [entry] = email.emailLog();
    expect(entry).toMatchObject({ status: 'test', toAddress: 'cohen@example.com', familyName: 'Cohen', template: 'yahrzeit' });
  });

  it('skips a family without an email address', async () => {
    const weiss = repo.families.list().find((f) => !f.email)!;
    const result = await email.sendEmails({ template: 'statement', recipients: [{ familyId: weiss.id, year: 2026 }] });
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(result.messages[0].problem).toBe('No email address');
  });

  it('never returns the saved password', () => {
    const view = email.saveEmailSettings({ host: 'smtp.example.org', port: 587, secure: false, user: 'u', password: 'secret', testMode: true });
    expect(view).not.toHaveProperty('password');
    expect(view.hasPassword).toBe(true);
    // Saving again without a password keeps it.
    expect(email.saveEmailSettings({ ...view, password: '' }).hasPassword).toBe(true);
    expect(email.saveEmailSettings({ ...view, clearPassword: true }).hasPassword).toBe(false);
  });
});

describe('events', () => {
  it('counts RSVPs and enforces capacity', () => {
    const e = ev.events.create({ title: 'Shabbat kiddush', date: '2026-11-07', capacity: 6, rsvpOpen: true });
    const [a, b] = repo.families.list();
    ev.saveRsvp({ eventId: e.id, familyId: a.id, status: 'yes', adults: 2, children: 2 });
    expect(() => ev.saveRsvp({ eventId: e.id, familyId: b.id, status: 'yes', adults: 3, children: 0 })).toThrow(/Only 2 places/);
    ev.saveRsvp({ eventId: e.id, familyId: b.id, status: 'maybe', adults: 3, children: 0 });
    // Changing your own RSVP doesn't count it twice.
    ev.saveRsvp({ eventId: e.id, familyId: a.id, status: 'yes', adults: 2, children: 4 });
    const [summary] = ev.eventSummaries('2026-11-01', '2026-11-30');
    expect(summary).toMatchObject({ rsvps: 2, attending: 6, maybe: 3 });
    expect(ev.eventDetail(e.id).rsvps).toHaveLength(2);
  });
});

describe('reports', () => {
  it('totals donations by fund and month', () => {
    const t = report('donationsByFund', 2026);
    const general = t.rows.find((r) => r[0] === 'General' && r[1] === 'USD')!;
    const expected = repo.donations
      .list()
      .filter((d) => d.fund === 'General' && d.currency === 'USD' && d.date.startsWith('2026'))
      .reduce((sum, d) => sum + d.amount, 0);
    expect(general.at(-1)).toBe(expected);
    expect(t.columns).toHaveLength(16);
  });

  it('lists pledge status and the directory', () => {
    expect(report('pledgeStatus', 2026).rows.length).toBe(repo.pledges.list().filter((p) => p.year === 2026).length);
    expect(report('directory', 2026).rows.length).toBeGreaterThan(0);
  });
});
