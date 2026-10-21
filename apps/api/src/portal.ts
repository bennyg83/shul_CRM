import {
  addMoney,
  gregorianToHebrew,
  pledgePayments,
  portalDateSchema,
  portalFamilySchema,
  portalMemberSchema,
  type Donation,
  type Family,
  type ImportantDate,
  type Member,
  type Pledge,
  type PortalAccount,
  type PortalHome,
  type User,
} from '@shulcrm/shared';
import { NotFound, donations, families, importantDates, members, pledges } from './repo.ts';
import { AuthError } from './auth.ts';
import { BadRequest, getFeatures, getLookups, getOrg } from './settings.ts';
import { audit, describe, diff } from './audit.ts';
import { receiptNumber } from './documents.ts';

// ---------------------------------------------------------------------------
// The member portal. Every function here starts from the signed-in user's own
// member record and works out the family from that. No route takes a family id
// from the browser, so there is no id for anyone to change.
// ---------------------------------------------------------------------------

export interface PortalScope {
  user: User;
  member: Member;
  family: Family;
}

/** Who this request belongs to. Refuses unless the portal is on and the user really is a member. */
export function scope(user: User | undefined): PortalScope {
  if (!user) throw new AuthError(401, 'Please sign in');
  if (!getFeatures().portal) throw new AuthError(403, 'The member portal is switched off');
  if (!user.memberId) throw new AuthError(403, 'This login is not linked to a member record');
  const member = members.get(user.memberId);
  if (!member) throw new AuthError(403, 'This login is no longer linked to a member record');
  const family = families.get(member.familyId);
  if (!family) throw new AuthError(403, 'This login is no longer linked to a family');
  return { user, member, family };
}

const ourMembers = (scope: PortalScope) => members.list().filter((m) => m.familyId === scope.family.id);

/** The member this id names, but only if they are in the same family. */
function ourMember(scope: PortalScope, memberId: string): Member {
  const found = ourMembers(scope).find((m) => m.id === memberId);
  // Say "not found" rather than "not yours": a stranger's id should not be confirmed to exist.
  if (!found) throw new NotFound('No such person in your family');
  return found;
}

function ourDate(scope: PortalScope, dateId: string): ImportantDate {
  const ids = new Set(ourMembers(scope).map((m) => m.id));
  const found = importantDates.list().find((d) => d.id === dateId && ids.has(d.memberId));
  if (!found) throw new NotFound('No such date in your family');
  return found;
}

export function home(scope: PortalScope): PortalHome {
  const ids = new Set(ourMembers(scope).map((m) => m.id));
  return {
    member: scope.member,
    family: scope.family,
    members: ourMembers(scope),
    dates: importantDates.list().filter((d) => ids.has(d.memberId)),
    // A family the office has marked inactive can look but not change.
    canEdit: scope.family.status === 'active',
  };
}

/**
 * Every change a family makes about itself goes through here, so a family the office has marked
 * inactive cannot change anything — including giving a sponsorship back, which would cancel a
 * pledge they owe. Exported so routes outside this module use the same rule rather than their own.
 */
export function mustEdit(scope: PortalScope): void {
  if (scope.family.status !== 'active') {
    throw new AuthError(403, 'Your membership is marked inactive, so please contact the office to make changes');
  }
}

/** Blank strings mean "clear this", which is what an emptied form field means. */
const clean = <T extends object>(input: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v]));

export function updateFamily(scope: PortalScope, body: unknown): Family {
  mustEdit(scope);
  const patch = clean(portalFamilySchema.parse(body));
  const before = scope.family;
  const after = families.update(before.id, patch);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    audit('portal.update', { entity: 'families', entityId: after.id, summary: describe('families', after), changes });
  }
  return after;
}

export function addMember(scope: PortalScope, body: unknown): Member {
  mustEdit(scope);
  const input = clean(portalMemberSchema.parse(body));
  checkRole(input.role);
  // The family and the active status are ours to set, not the browser's.
  const created = members.create({ ...input, familyId: scope.family.id, status: 'active' } as Parameters<typeof members.create>[0]);
  audit('portal.create', { entity: 'members', entityId: created.id, summary: describe('members', created), changes: created });
  return created;
}

export function updateMember(scope: PortalScope, memberId: string, body: unknown): Member {
  mustEdit(scope);
  const before = ourMember(scope, memberId);
  const patch = clean(portalMemberSchema.partial().parse(body));
  checkRole(patch.role);
  const after = members.update(memberId, patch);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    audit('portal.update', { entity: 'members', entityId: memberId, summary: describe('members', after), changes });
  }
  return after;
}

function checkRole(role: unknown): void {
  if (typeof role !== 'string' || role === '') return;
  if (!getLookups().memberRoles.some((r) => r.key === role)) throw new BadRequest('Choose a role from the list');
}

/** Dates always belong to one of this family's members, and the Hebrew date is worked out here. */
function dateInput(scope: PortalScope, body: unknown): Record<string, unknown> {
  const input = portalDateSchema.parse(body);
  ourMember(scope, input.memberId);
  if (!getLookups().dateTypes.some((t) => t.key === input.type)) throw new BadRequest('Choose a type from the list');
  const hebrew = gregorianToHebrew(input.date, { afterNightfall: input.afterNightfall === true });
  // Recomputed rather than trusted, so a stored Hebrew date always matches its English one.
  return { ...input, hebrewDay: hebrew.day, hebrewMonth: hebrew.month, hebrewYear: hebrew.year };
}

export function addDate(scope: PortalScope, body: unknown): ImportantDate {
  mustEdit(scope);
  const created = importantDates.create(dateInput(scope, body) as Parameters<typeof importantDates.create>[0]);
  audit('portal.create', { entity: 'importantDates', entityId: created.id, summary: describe('importantDates', created), changes: created });
  return created;
}

export function updateDate(scope: PortalScope, dateId: string, body: unknown): ImportantDate {
  mustEdit(scope);
  const before = ourDate(scope, dateId);
  const after = importantDates.update(dateId, dateInput(scope, body) as Parameters<typeof importantDates.update>[1]);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    audit('portal.update', { entity: 'importantDates', entityId: dateId, summary: describe('importantDates', after), changes });
  }
  return after;
}

export function removeDate(scope: PortalScope, dateId: string): void {
  mustEdit(scope);
  const before = ourDate(scope, dateId);
  importantDates.remove(dateId);
  audit('portal.delete', { entity: 'importantDates', entityId: dateId, summary: describe('importantDates', before), changes: before });
}

/** What the family owes and has given. Read-only: money is only ever recorded by the office. */
export function account(scope: PortalScope): PortalAccount {
  const org = getOrg();
  const lists = getLookups();
  const fundLabel = (key: string) => lists.funds.find((f) => f.key === key)?.label ?? key;
  const year = new Date().getFullYear();
  const all = donations.list();
  const ours = all.filter((d: Donation) => d.familyId === scope.family.id);
  const paidTowards = (pledgeId: string) => all.filter((d) => d.pledgeId === pledgeId);

  const owed: Record<string, number> = {};
  const ourPledges = pledges
    .list()
    .filter((p: Pledge) => p.familyId === scope.family.id)
    .map((p) => {
      const money = pledgePayments(p, paidTowards(p.id));
      addMoney(owed, p.currency, money.balance);
      return { ...p, ...money, fundLabel: fundLabel(p.fund) };
    })
    .sort((a, b) => b.year - a.year || b.balance - a.balance);

  const givenThisYear: Record<string, number> = {};
  for (const d of ours) {
    if (d.date.startsWith(String(year))) givenThisYear[d.currency] = (givenThisYear[d.currency] ?? 0) + d.amount;
  }

  return {
    pledges: ourPledges,
    donations: ours
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({ ...d, fundLabel: fundLabel(d.fund), receiptNumber: receiptNumber(d) })),
    owed,
    givenThisYear,
    year,
    statementYears: [...new Set(ours.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => b - a),
    payment: org.paymentUrl ? { url: org.paymentUrl, note: org.paymentNote } : undefined,
  };
}
