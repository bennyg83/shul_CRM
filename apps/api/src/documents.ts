import {
  addDaysISO,
  pledgePayments,
  formatHebrew,
  type Donation,
  type Family,
  type Member,
  type Pledge,
  type ReceiptData,
  type StatementData,
  type YahrzeitNotice,
} from '@shulcrm/shared';
import { NotFound, dateOccurrences, donations, families, get, importantDates, members, pledges } from './repo.ts';
import { getLookups, getOrg, getTerms } from './settings.ts';

// ---------------------------------------------------------------------------
// The data behind printed and emailed documents: donation receipts, year-end
// statements, and yahrzeit letters. The web prints them (Save as PDF); email
// renders them into messages.
// ---------------------------------------------------------------------------

export const receiptNumber = (d: Pick<Donation, 'id' | 'date'>) => `${d.date.slice(0, 4)}-${d.id.slice(-8).toUpperCase()}`;

export async function familyGreeting(family: Family, familyMembers: Member[]): Promise<string> {
  const active = familyMembers.filter((m) => m.status === 'active');
  const heads = ['husband', 'wife'].flatMap((role) => active.filter((m) => m.role === role));
  if (heads.length === 0) return `${family.name} ${(await getTerms()).family}`;
  const names = heads.map((m) => m.firstName);
  const last = heads[0].lastName || family.name;
  return `${names.join(' and ')} ${last}`;
}

export const addressLines = (f: Family) =>
  [f.address, [f.zip, f.city].filter(Boolean).join(' '), f.country].filter((l): l is string => Boolean(l && l.trim()));

async function statementFor(
  family: Family,
  year: number,
  all: { donations: Donation[]; pledges: Pledge[]; members: Member[] },
): Promise<StatementData> {
  const lists = await getLookups();
  const label = (items: Array<{ key: string; label: string }>, key: string) => items.find((i) => i.key === key)?.label ?? key;
  const mine = all.donations
    .filter((d) => d.familyId === family.id && d.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totals: Record<string, number> = {};
  for (const d of mine) totals[d.currency] = (totals[d.currency] ?? 0) + d.amount;
  const paidTowards = (pledgeId: string) => all.donations.filter((d) => d.pledgeId === pledgeId);
  return {
    org: await getOrg(),
    family,
    greeting: await familyGreeting(
      family,
      all.members.filter((m) => m.familyId === family.id),
    ),
    addressLines: addressLines(family),
    year,
    donations: mine.map((d) => ({
      ...d,
      receiptNumber: receiptNumber(d),
      fundLabel: label(lists.funds, d.fund),
      methodLabel: label(lists.paymentMethods, d.method),
    })),
    totals,
    pledges: all.pledges
      .filter((p) => p.familyId === family.id && p.year === year)
      .map((p) => {
        return { ...p, ...pledgePayments(p, paidTowards(p.id)), fundLabel: label(lists.funds, p.fund) };
      }),
  };
}

export async function receipt(donationId: string): Promise<ReceiptData> {
  const donation = await get<Donation>('donations', donationId);
  if (!donation) throw new NotFound(`donations ${donationId} not found`);
  const family = await families.get(donation.familyId);
  if (!family) throw new NotFound(`families ${donation.familyId} not found`);
  const lists = await getLookups();
  const label = (items: Array<{ key: string; label: string }>, key: string) => items.find((i) => i.key === key)?.label ?? key;
  const memberList = await members.list();
  const pledgeList = await pledges.list();
  return {
    org: await getOrg(),
    family,
    greeting: await familyGreeting(
      family,
      memberList.filter((m) => m.familyId === family.id),
    ),
    addressLines: addressLines(family),
    donation,
    receiptNumber: receiptNumber(donation),
    fundLabel: label(lists.funds, donation.fund),
    methodLabel: label(lists.paymentMethods, donation.method),
    pledge: donation.pledgeId ? pledgeList.find((p) => p.id === donation.pledgeId) : undefined,
  };
}

export async function statement(familyId: string, year: number): Promise<StatementData> {
  const family = await families.get(familyId);
  if (!family) throw new NotFound(`families ${familyId} not found`);
  const all = { donations: await donations.list(), pledges: await pledges.list(), members: await members.list() };
  return statementFor(family, year, all);
}

export async function statements(year: number): Promise<StatementData[]> {
  const all = { donations: await donations.list(), pledges: await pledges.list(), members: await members.list() };
  const gave = new Set(all.donations.filter((d) => d.date.startsWith(String(year))).map((d) => d.familyId));
  const out: StatementData[] = [];
  for (const f of await families.list()) {
    if (gave.has(f.id)) out.push(await statementFor(f, year, all));
  }
  return out;
}

export async function yahrzeitNotices(from: string, to: string): Promise<YahrzeitNotice[]> {
  const yahrzeitTypes = new Set((await getLookups()).dateTypes.filter((t) => t.rules === 'yahrzeit').map((t) => t.key));
  const datesById = new Map((await importantDates.list()).map((d) => [d.id, d]));
  const memberById = new Map((await members.list()).map((m) => [m.id, m]));
  const allMembers = [...memberById.values()];
  const out: YahrzeitNotice[] = [];
  for (const occurrence of await dateOccurrences(from, to)) {
    if (!yahrzeitTypes.has(occurrence.type)) continue;
    const date = datesById.get(occurrence.id);
    const member = memberById.get(occurrence.memberId);
    const family = member ? await families.get(member.familyId) : undefined;
    if (!date || !member || !family) continue;
    const h = occurrence.occurrenceHebrew;
    out.push({
      occurrence,
      date,
      member,
      family,
      greeting: await familyGreeting(
        family,
        allMembers.filter((m) => m.familyId === family.id),
      ),
      addressLines: addressLines(family),
      name: date.personName || `${member.firstName} ${member.lastName}`,
      hebrewName: date.personHebrewName || (date.personName ? undefined : member.hebrewName),
      relationship: date.relationship,
      hebrewDate: formatHebrew(h.day, h.month, h.year),
      evening: addDaysISO(occurrence.nextOccurrence, -1),
      missingName: !date.personName && !member.deathDate && member.status === 'active',
    });
  }
  return out;
}
