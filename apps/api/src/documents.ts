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

/** A short, stable receipt number: the year and the end of the donation's id. */
export const receiptNumber = (d: Pick<Donation, 'id' | 'date'>) => `${d.date.slice(0, 4)}-${d.id.slice(-8).toUpperCase()}`;

/** How to address a family ("Dear …"): "Yosef and Esther Cohen", else "Cohen Family". */
export function familyGreeting(family: Family, familyMembers: Member[]): string {
  const active = familyMembers.filter((m) => m.status === 'active');
  const heads = ['husband', 'wife'].flatMap((role) => active.filter((m) => m.role === role));
  if (heads.length === 0) return `${family.name} ${getTerms().family}`;
  const names = heads.map((m) => m.firstName);
  const last = heads[0].lastName || family.name;
  return `${names.join(' and ')} ${last}`;
}

/** Postal address lines for a family. */
export const addressLines = (f: Family) =>
  [f.address, [f.zip, f.city].filter(Boolean).join(' '), f.country].filter((l): l is string => Boolean(l && l.trim()));


export function receipt(donationId: string): ReceiptData {
  const donation = get<Donation>('donations', donationId);
  if (!donation) throw new NotFound(`donations ${donationId} not found`);
  const family = families.get(donation.familyId);
  if (!family) throw new NotFound(`families ${donation.familyId} not found`);
  const lists = getLookups();
  const label = (items: Array<{ key: string; label: string }>, key: string) => items.find((i) => i.key === key)?.label ?? key;
  return {
    org: getOrg(),
    family,
    greeting: familyGreeting(family, members.list().filter((m) => m.familyId === family.id)),
    addressLines: addressLines(family),
    donation,
    receiptNumber: receiptNumber(donation),
    fundLabel: label(lists.funds, donation.fund),
    methodLabel: label(lists.paymentMethods, donation.method),
    pledge: donation.pledgeId ? pledges.list().find((p) => p.id === donation.pledgeId) : undefined,
  };
}


function statementFor(family: Family, year: number, all: { donations: Donation[]; pledges: Pledge[]; members: Member[] }): StatementData {
  const lists = getLookups();
  const label = (items: Array<{ key: string; label: string }>, key: string) => items.find((i) => i.key === key)?.label ?? key;
  const mine = all.donations
    .filter((d) => d.familyId === family.id && d.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totals: Record<string, number> = {};
  for (const d of mine) totals[d.currency] = (totals[d.currency] ?? 0) + d.amount;
  const paidTowards = (pledgeId: string) => all.donations.filter((d) => d.pledgeId === pledgeId);
  return {
    org: getOrg(),
    family,
    greeting: familyGreeting(family, all.members.filter((m) => m.familyId === family.id)),
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

export function statement(familyId: string, year: number): StatementData {
  const family = families.get(familyId);
  if (!family) throw new NotFound(`families ${familyId} not found`);
  return statementFor(family, year, { donations: donations.list(), pledges: pledges.list(), members: members.list() });
}

/** Statements for every family that gave in `year`, in name order. */
export function statements(year: number): StatementData[] {
  const all = { donations: donations.list(), pledges: pledges.list(), members: members.list() };
  const gave = new Set(all.donations.filter((d) => d.date.startsWith(String(year))).map((d) => d.familyId));
  return families
    .list()
    .filter((f) => gave.has(f.id))
    .map((f) => statementFor(f, year, all));
}


/** Yahrzeits whose day falls in [from, to], with everything a letter needs. */
export function yahrzeitNotices(from: string, to: string): YahrzeitNotice[] {
  const yahrzeitTypes = new Set(getLookups().dateTypes.filter((t) => t.rules === 'yahrzeit').map((t) => t.key));
  const datesById = new Map(importantDates.list().map((d) => [d.id, d]));
  const memberById = new Map(members.list().map((m) => [m.id, m]));
  const allMembers = [...memberById.values()];
  const out: YahrzeitNotice[] = [];
  for (const occurrence of dateOccurrences(from, to)) {
    if (!yahrzeitTypes.has(occurrence.type)) continue;
    const date = datesById.get(occurrence.id);
    const member = memberById.get(occurrence.memberId);
    const family = member ? families.get(member.familyId) : undefined;
    if (!date || !member || !family) continue;
    const h = occurrence.occurrenceHebrew;
    out.push({
      occurrence,
      date,
      member,
      family,
      greeting: familyGreeting(family, allMembers.filter((m) => m.familyId === family.id)),
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
