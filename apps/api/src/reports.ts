import { formatHebrew, pledgePayments, type ReportKey, type ReportTable } from '@shulcrm/shared';
import { donations, families, members, pledges } from './repo.ts';
import { getLookups, getTerms } from './settings.ts';
import { yahrzeitNotices } from './documents.ts';

// ---------------------------------------------------------------------------
// Reports: plain tables (shown in the app and downloadable as CSV). Money stays
// per currency; amounts are numbers so a spreadsheet can add them up.
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function label(kind: 'funds' | 'paymentMethods', key: string): string {
  return getLookups()[kind].find((i) => i.key === key)?.label ?? key;
}

function donationsByFund(year: number): ReportTable {
  const groups = new Map<string, { fund: string; currency: string; months: number[]; total: number; count: number }>();
  for (const d of donations.list()) {
    if (!d.date.startsWith(String(year))) continue;
    const key = `${d.fund}|${d.currency}`;
    const g = groups.get(key) ?? { fund: label('funds', d.fund), currency: d.currency, months: Array(12).fill(0), total: 0, count: 0 };
    g.months[Number(d.date.slice(5, 7)) - 1] += d.amount;
    g.total += d.amount;
    g.count++;
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .sort((a, b) => a.fund.localeCompare(b.fund) || a.currency.localeCompare(b.currency))
    .map((g) => [g.fund, g.currency, g.count, ...g.months, g.total]);
  return {
    title: `Donations by fund, ${year}`,
    columns: ['Fund', 'Currency', 'Gifts', ...MONTHS, 'Total'],
    rows,
    numeric: Array.from({ length: 14 }, (_, i) => i + 2),
  };
}

function donors(year: number): ReportTable {
  const famName = new Map(families.list().map((f) => [f.id, f]));
  const byFamily = new Map<string, { total: number; count: number; last: string }>();
  for (const d of donations.list()) {
    if (!d.date.startsWith(String(year))) continue;
    const key = `${d.familyId}|${d.currency}`;
    const g = byFamily.get(key) ?? { total: 0, count: 0, last: '' };
    g.total += d.amount;
    g.count++;
    if (d.date > g.last) g.last = d.date;
    byFamily.set(key, g);
  }
  const rows = [...byFamily.entries()]
    .map(([key, g]) => {
      const [familyId, currency] = key.split('|');
      const f = famName.get(familyId);
      return [f?.name ?? '', f?.email ?? '', f?.phone ?? '', currency, g.count, g.total, g.last];
    })
    .sort((a, b) => Number(b[5]) - Number(a[5]));
  return {
    title: `Donors, ${year}`,
    columns: [getTerms().family, 'Email', 'Phone', 'Currency', 'Gifts', 'Total', 'Last gift'],
    rows,
    numeric: [4, 5],
  };
}

function pledgeStatus(year: number): ReportTable {
  const famName = new Map(families.list().map((f) => [f.id, f.name]));
  const all = donations.list();
  const rows = pledges
    .list()
    .filter((p) => p.year === year)
    .map((p) => {
      const { paid, balance, paidOther } = pledgePayments(p, all.filter((d) => d.pledgeId === p.id));
      // Payments in another currency get their own column rather than being added in.
      const other = Object.entries(paidOther)
        .map(([currency, amount]) => `${amount} ${currency}`)
        .join(', ');
      return [famName.get(p.familyId) ?? '', label('funds', p.fund), p.currency, p.amount, paid, balance, other, p.dueDate ?? ''];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return {
    title: `${getTerms().pledge} status, ${year}`,
    columns: [getTerms().family, 'Fund', 'Currency', 'Pledged', 'Paid', 'Still owed', 'Paid in other currencies', 'Due'],
    rows,
    numeric: [3, 4, 5],
  };
}

function lapsed(year: number): ReportTable {
  const gaveIn = (y: number) => new Set(donations.list().filter((d) => d.date.startsWith(String(y))).map((d) => d.familyId));
  const before = gaveIn(year - 1);
  const now = gaveIn(year);
  const lastGift = new Map<string, { date: string; amount: number; currency: string }>();
  for (const d of donations.list()) {
    const cur = lastGift.get(d.familyId);
    if (!cur || d.date > cur.date) lastGift.set(d.familyId, { date: d.date, amount: d.amount, currency: d.currency });
  }
  const rows = families
    .list()
    .filter((f) => before.has(f.id) && !now.has(f.id))
    .map((f) => {
      const g = lastGift.get(f.id);
      return [f.name, f.email ?? '', f.phone ?? '', g?.date ?? '', g?.amount ?? '', g?.currency ?? ''];
    });
  return {
    title: `Gave in ${year - 1} but not in ${year}`,
    columns: [getTerms().family, 'Email', 'Phone', 'Last gift', 'Amount', 'Currency'],
    rows,
    numeric: [4],
  };
}

function directory(): ReportTable {
  const famById = new Map(families.list().map((f) => [f.id, f]));
  const roles = getLookups().memberRoles;
  const rows = members
    .list()
    .filter((m) => m.status === 'active' && famById.get(m.familyId)?.status !== 'inactive')
    .map((m) => {
      const f = famById.get(m.familyId);
      return [
        m.lastName,
        m.firstName,
        m.hebrewName ?? '',
        f?.name ?? '',
        roles.find((r) => r.key === m.role)?.label ?? m.role ?? '',
        m.email || f?.email || '',
        m.phone || f?.phone || '',
        [f?.address, f?.city].filter(Boolean).join(', '),
      ];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  return {
    title: 'Directory',
    columns: ['Last name', 'First name', 'Hebrew name', getTerms().family, 'Role', 'Email', 'Phone', 'Address'],
    rows,
  };
}

function yahrzeits(year: number): ReportTable {
  const rows = yahrzeitNotices(`${year}-01-01`, `${year}-12-31`).map((n) => [
    n.occurrence.nextOccurrence,
    MONTHS[Number(n.occurrence.nextOccurrence.slice(5, 7)) - 1],
    n.hebrewDate,
    n.name,
    n.hebrewName ?? '',
    n.relationship ?? '',
    `${n.member.firstName} ${n.member.lastName}`,
    n.family.name,
    n.family.email ?? '',
    n.family.phone ?? '',
    n.date.hebrewDay && n.date.hebrewMonth && n.date.hebrewYear
      ? formatHebrew(n.date.hebrewDay, n.date.hebrewMonth, n.date.hebrewYear)
      : '',
  ]);
  return {
    title: `Yahrzeits, ${year}`,
    columns: ['Date', 'Month', 'Hebrew date', 'In memory of', 'Hebrew name', 'Relationship', 'Mourner', getTerms().family, 'Email', 'Phone', 'Date of death (Hebrew)'],
    rows,
  };
}

export function report(key: ReportKey, year: number): ReportTable {
  switch (key) {
    case 'donationsByFund':
      return donationsByFund(year);
    case 'donors':
      return donors(year);
    case 'pledgeStatus':
      return pledgeStatus(year);
    case 'lapsed':
      return lapsed(year);
    case 'directory':
      return directory();
    case 'yahrzeits':
      return yahrzeits(year);
  }
}
