import {
  newId,
  sponsorshipInputSchema,
  type ClaimInput,
  type Sponsorship,
  type SponsorshipClaim,
  type SponsorshipInput,
  type SponsorshipSummary,
} from '@shulcrm/shared';
import { db } from './db.ts';
import { NotFound, families, get, insert, list, pledges, removeRow, update } from './repo.ts';
import { BadRequest, Conflict, getLookups, getOrg } from './settings.ts';
import { audit } from './audit.ts';
import { resolveOrgId } from './tenant.ts';

// ---------------------------------------------------------------------------
// Sponsorships: a kiddush, a shiur or a seudah the shul offers, and the
// families who take them on. Taking one on creates a pledge, so everything the
// family owes stays in one place rather than in a second ledger.
// ---------------------------------------------------------------------------

export const sponsorships = {
  list: () => list<Sponsorship>('sponsorships', 'date ASC'),
  get: (id: string) => get<Sponsorship>('sponsorships', id),
  create: (input: SponsorshipInput) =>
    insert<Sponsorship>('sponsorships', { ...input, id: newId(), createdAt: new Date().toISOString() }),
  update: (id: string, patch: Partial<SponsorshipInput>) => update<Sponsorship>('sponsorships', id, patch),
  remove: (id: string) => removeRow('sponsorships', id),
};

async function claimsOf(sponsorshipId: string): Promise<SponsorshipClaim[]> {
  return (await list<SponsorshipClaim>('sponsorshipClaims', 'createdAt ASC')).filter((c) => c.sponsorshipId === sponsorshipId);
}

export async function summaries(from?: string, to?: string, forFamilyId?: string): Promise<SponsorshipSummary[]> {
  const names = new Map((await families.list()).map((f) => [f.id, f.name]));
  const paidByPledge = new Map(
    (
      (await db
        .prepare(
          'SELECT pledgeId, SUM(amount) AS paid FROM donations WHERE orgId = ? AND pledgeId IS NOT NULL GROUP BY pledgeId',
        )
        .all(resolveOrgId())) as Array<{ pledgeId: string; paid: number }>
    ).map((r) => [r.pledgeId, r.paid]),
  );
  const out: SponsorshipSummary[] = [];
  for (const s of await sponsorships.list()) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    const claims = await claimsOf(s.id);
    const visible = forFamilyId === undefined ? claims : claims.filter((c) => c.familyId === forFamilyId);
    out.push({
      ...s,
      claims: visible.map((c) => ({
        ...c,
        familyName: names.get(c.familyId),
        paid: (c.pledgeId && paidByPledge.get(c.pledgeId)) || 0,
      })),
      remaining: Math.max(0, s.maxSponsors - claims.length),
      ...(forFamilyId === undefined ? {} : { mine: claims.some((c) => c.familyId === forFamilyId) }),
    });
  }
  return out;
}

export async function claimsForFamily(familyId: string): Promise<Array<SponsorshipClaim & { sponsorship?: Sponsorship }>> {
  const byId = new Map((await sponsorships.list()).map((s) => [s.id, s]));
  return (await list<SponsorshipClaim>('sponsorshipClaims', 'createdAt DESC'))
    .filter((c) => c.familyId === familyId)
    .map((c) => ({ ...c, sponsorship: byId.get(c.sponsorshipId) }));
}

export async function claim(
  sponsorshipId: string,
  familyId: string,
  memberId: string | undefined,
  input: ClaimInput,
): Promise<SponsorshipClaim> {
  const sponsorship = await sponsorships.get(sponsorshipId);
  if (!sponsorship) throw new NotFound('That sponsorship is no longer listed');
  if (!sponsorship.open) throw new Conflict('This one is no longer open');
  const existing = await claimsOf(sponsorshipId);
  if (existing.some((c) => c.familyId === familyId)) throw new Conflict('You have already taken this one on');
  if (existing.length >= sponsorship.maxSponsors) throw new Conflict('Someone else has just taken this one');

  const amount = input.amount ?? sponsorship.suggestedAmount;
  if (amount === undefined) throw new BadRequest('Enter an amount');
  if (!(await getLookups()).funds.some((f) => f.key === sponsorship.fund)) {
    throw new BadRequest(`"${sponsorship.fund}" is not in the funds list`);
  }

  await db.exec('BEGIN');
  try {
    const pledge = await pledges.create({
      fund: sponsorship.fund,
      type: 'one_time',
      familyId,
      year: Number(sponsorship.date.slice(0, 4)),
      dueDate: sponsorship.date,
      amount,
      currency: sponsorship.currency,
    });
    const saved = await insert<SponsorshipClaim>('sponsorshipClaims', {
      id: newId(),
      sponsorshipId,
      familyId,
      memberId,
      dedication: input.dedication?.trim() || undefined,
      amount,
      currency: sponsorship.currency,
      pledgeId: pledge.id,
      createdAt: new Date().toISOString(),
    });
    await db.exec('COMMIT');
    await audit('sponsorship.claimed', {
      entity: 'sponsorships',
      entityId: sponsorshipId,
      summary: `${sponsorship.title} on ${sponsorship.date}`,
      changes: { amount, currency: sponsorship.currency, dedication: saved.dedication ?? null },
    });
    return saved;
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

export async function release(claimId: string, limitToFamilyId?: string): Promise<void> {
  const claim = await get<SponsorshipClaim>('sponsorshipClaims', claimId);
  if (!claim) throw new NotFound('No such claim');
  if (limitToFamilyId !== undefined && claim.familyId !== limitToFamilyId) throw new NotFound('No such claim');
  const sponsorship = await sponsorships.get(claim.sponsorshipId);

  await db.exec('BEGIN');
  try {
    const paid = claim.pledgeId
      ? ((await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM donations WHERE pledgeId = ?').get(claim.pledgeId)) as { n: number }).n
      : 0;
    if (paid > 0) {
      throw new Conflict('Something has already been paid towards this one, so the office needs to undo it');
    }
    await removeRow('sponsorshipClaims', claimId);
    if (claim.pledgeId) await removeRow('pledges', claim.pledgeId);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
  await audit('sponsorship.released', {
    entity: 'sponsorships',
    entityId: claim.sponsorshipId,
    summary: sponsorship ? `${sponsorship.title} on ${sponsorship.date}` : claimId,
  });
}

export async function parseSponsorship(body: unknown): Promise<SponsorshipInput> {
  const org = await getOrg();
  const input = sponsorshipInputSchema.parse({ currency: org.defaultCurrency, maxSponsors: 1, open: true, ...(body as object) });
  if (!(await getLookups()).funds.some((f) => f.key === input.fund)) throw new BadRequest(`"${input.fund}" is not in the funds list`);
  return input;
}
