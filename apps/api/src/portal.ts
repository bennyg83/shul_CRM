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
export async function scope(user: User | undefined): Promise<PortalScope> {
  if (!user) throw new AuthError(401, 'Please sign in');
  if (!(await getFeatures()).portal) throw new AuthError(403, 'The member portal is switched off');
  if (!user.memberId) throw new AuthError(403, 'This login is not linked to a member record');
  const member = await members.get(user.memberId);
  if (!member) throw new AuthError(403, 'This login is no longer linked to a member record');
  const family = await families.get(member.familyId);
  if (!family) throw new AuthError(403, 'This login is no longer linked to a family');
  return { user, member, family };
}

async function ourMembers(scope: PortalScope): Promise<Member[]> {
  return (await members.list()).filter((m) => m.familyId === scope.family.id);
}

async function ourMember(scope: PortalScope, memberId: string): Promise<Member> {
  const found = (await ourMembers(scope)).find((m) => m.id === memberId);
  if (!found) throw new NotFound('No such person in your family');
  return found;
}

async function ourDate(scope: PortalScope, dateId: string): Promise<ImportantDate> {
  const ids = new Set((await ourMembers(scope)).map((m) => m.id));
  const found = (await importantDates.list()).find((d) => d.id === dateId && ids.has(d.memberId));
  if (!found) throw new NotFound('No such date in your family');
  return found;
}

export async function home(scope: PortalScope): Promise<PortalHome> {
  const ids = new Set((await ourMembers(scope)).map((m) => m.id));
  return {
    member: scope.member,
    family: scope.family,
    members: await ourMembers(scope),
    dates: (await importantDates.list()).filter((d) => ids.has(d.memberId)),
    canEdit: scope.family.status === 'active',
  };
}

export function mustEdit(scope: PortalScope): void {
  if (scope.family.status !== 'active') {
    throw new AuthError(403, 'Your membership is marked inactive, so please contact the office to make changes');
  }
}

const clean = <T extends object>(input: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v]));

export async function updateFamily(scope: PortalScope, body: unknown): Promise<Family> {
  mustEdit(scope);
  const patch = clean(portalFamilySchema.parse(body));
  const before = scope.family;
  const after = await families.update(before.id, patch);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    await audit('portal.update', { entity: 'families', entityId: after.id, summary: describe('families', after), changes });
  }
  return after;
}

export async function addMember(scope: PortalScope, body: unknown): Promise<Member> {
  mustEdit(scope);
  const input = clean(portalMemberSchema.parse(body));
  await checkRole(input.role);
  const created = await members.create({ ...input, familyId: scope.family.id, status: 'active' } as Parameters<
    typeof members.create
  >[0]);
  await audit('portal.create', { entity: 'members', entityId: created.id, summary: describe('members', created), changes: created });
  return created;
}

export async function updateMember(scope: PortalScope, memberId: string, body: unknown): Promise<Member> {
  mustEdit(scope);
  const before = await ourMember(scope, memberId);
  const patch = clean(portalMemberSchema.partial().parse(body));
  await checkRole(patch.role);
  const after = await members.update(memberId, patch);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    await audit('portal.update', { entity: 'members', entityId: memberId, summary: describe('members', after), changes });
  }
  return after;
}

async function checkRole(role: unknown): Promise<void> {
  if (typeof role !== 'string' || role === '') return;
  if (!(await getLookups()).memberRoles.some((r) => r.key === role)) throw new BadRequest('Choose a role from the list');
}

async function dateInput(scope: PortalScope, body: unknown): Promise<Record<string, unknown>> {
  const input = portalDateSchema.parse(body);
  await ourMember(scope, input.memberId);
  if (!(await getLookups()).dateTypes.some((t) => t.key === input.type)) throw new BadRequest('Choose a type from the list');
  const hebrew = gregorianToHebrew(input.date, { afterNightfall: input.afterNightfall === true });
  return { ...input, hebrewDay: hebrew.day, hebrewMonth: hebrew.month, hebrewYear: hebrew.year };
}

export async function addDate(scope: PortalScope, body: unknown): Promise<ImportantDate> {
  mustEdit(scope);
  const created = await importantDates.create((await dateInput(scope, body)) as Parameters<typeof importantDates.create>[0]);
  await audit('portal.create', {
    entity: 'importantDates',
    entityId: created.id,
    summary: describe('importantDates', created),
    changes: created,
  });
  return created;
}

export async function updateDate(scope: PortalScope, dateId: string, body: unknown): Promise<ImportantDate> {
  mustEdit(scope);
  const before = await ourDate(scope, dateId);
  const after = await importantDates.update(dateId, (await dateInput(scope, body)) as Parameters<typeof importantDates.update>[1]);
  const changes = diff(before, after);
  if (Object.keys(changes).length > 0) {
    await audit('portal.update', { entity: 'importantDates', entityId: dateId, summary: describe('importantDates', after), changes });
  }
  return after;
}

export async function removeDate(scope: PortalScope, dateId: string): Promise<void> {
  mustEdit(scope);
  const before = await ourDate(scope, dateId);
  await importantDates.remove(dateId);
  await audit('portal.delete', {
    entity: 'importantDates',
    entityId: dateId,
    summary: describe('importantDates', before),
    changes: before,
  });
}

export async function account(scope: PortalScope): Promise<PortalAccount> {
  const org = await getOrg();
  const lists = await getLookups();
  const fundLabel = (key: string) => lists.funds.find((f) => f.key === key)?.label ?? key;
  const year = new Date().getFullYear();
  const all = await donations.list();
  const ours = all.filter((d: Donation) => d.familyId === scope.family.id);
  const paidTowards = (pledgeId: string) => all.filter((d) => d.pledgeId === pledgeId);

  const owed: Record<string, number> = {};
  const ourPledges = (await pledges.list())
    .filter((p) => p.familyId === scope.family.id)
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
