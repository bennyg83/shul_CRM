import { db } from './db.ts';
import { NotFound } from './repo.ts';
import { resolveOrgId } from './tenant.ts';

// ---------------------------------------------------------------------------
// Cross-org checks: foreign keys must stay inside the current organization.
// ---------------------------------------------------------------------------

async function orgOf(table: string, id: string): Promise<string | undefined> {
  const row = (await db.prepare(`SELECT orgId FROM ${table} WHERE id = ?`).get(id)) as { orgId: string } | undefined;
  return row?.orgId;
}

async function assertOrg(entity: string, id: string | undefined | null, table: string): Promise<void> {
  if (!id) return;
  const orgId = await orgOf(table, id);
  const expected = resolveOrgId();
  if (!orgId || orgId !== expected) throw new NotFound(`${entity} ${id} not found`);
}

export async function assertFamilyInOrg(familyId: string): Promise<void> {
  await assertOrg('families', familyId, 'families');
}

export async function assertMemberInOrg(memberId: string): Promise<void> {
  await assertOrg('members', memberId, 'members');
}

export async function assertEventInOrg(eventId: string): Promise<void> {
  await assertOrg('events', eventId, 'events');
}

export async function assertSponsorshipInOrg(sponsorshipId: string): Promise<void> {
  await assertOrg('sponsorships', sponsorshipId, 'sponsorships');
}

/** Member must belong to the given family, both in this org. */
export async function assertMemberOfFamily(memberId: string, familyId: string): Promise<void> {
  await assertMemberInOrg(memberId);
  const row = (await db.prepare('SELECT familyId FROM members WHERE id = ? AND orgId = ?').get(memberId, resolveOrgId())) as
    | { familyId: string }
    | undefined;
  if (!row || row.familyId !== familyId) throw new NotFound(`members ${memberId} not found`);
}
