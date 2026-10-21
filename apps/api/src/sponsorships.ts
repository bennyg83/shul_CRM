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

const claimsOf = (sponsorshipId: string) =>
  list<SponsorshipClaim>('sponsorshipClaims', 'createdAt ASC').filter((c) => c.sponsorshipId === sponsorshipId);

/**
 * Sponsorships between two dates with their claims. `forFamilyId` is the portal's view: it marks
 * the family's own claims and leaves every other family anonymous, since who sponsored what is
 * the shul's business to share, not the portal's.
 */
export function summaries(from?: string, to?: string, forFamilyId?: string): SponsorshipSummary[] {
  const names = new Map(families.list().map((f) => [f.id, f.name]));
  // Everything paid against a pledge, in one query rather than one per claim.
  const paidByPledge = new Map(
    (
      db
        // Any currency counts here: whatever was paid, giving the slot back is the office's job.
        .prepare('SELECT pledgeId, SUM(amount) AS paid FROM donations WHERE pledgeId IS NOT NULL GROUP BY pledgeId')
        .all() as Array<{ pledgeId: string; paid: number }>
    ).map((r) => [r.pledgeId, r.paid]),
  );
  return sponsorships
    .list()
    .filter((s) => (!from || s.date >= from) && (!to || s.date <= to))
    .map((s) => {
      const claims = claimsOf(s.id);
      // The portal is told only about this family's own claim. Who else sponsored — and what they
      // wrote in their dedication — is the shul's to share, so it never leaves the office view.
      const visible = forFamilyId === undefined ? claims : claims.filter((c) => c.familyId === forFamilyId);
      return {
        ...s,
        claims: visible.map((c) => ({
          ...c,
          familyName: names.get(c.familyId),
          paid: (c.pledgeId && paidByPledge.get(c.pledgeId)) || 0,
        })),
        remaining: Math.max(0, s.maxSponsors - claims.length),
        ...(forFamilyId === undefined ? {} : { mine: claims.some((c) => c.familyId === forFamilyId) }),
      };
    });
}

export function claimsForFamily(familyId: string): Array<SponsorshipClaim & { sponsorship?: Sponsorship }> {
  const byId = new Map(sponsorships.list().map((s) => [s.id, s]));
  return list<SponsorshipClaim>('sponsorshipClaims', 'createdAt DESC')
    .filter((c) => c.familyId === familyId)
    .map((c) => ({ ...c, sponsorship: byId.get(c.sponsorshipId) }));
}

/**
 * Take a sponsorship on for a family, creating the matching pledge. Everything happens in one
 * transaction so a family can never end up claiming a slot without owing for it, or the reverse.
 */
export function claim(sponsorshipId: string, familyId: string, memberId: string | undefined, input: ClaimInput): SponsorshipClaim {
  const sponsorship = sponsorships.get(sponsorshipId);
  if (!sponsorship) throw new NotFound('That sponsorship is no longer listed');
  if (!sponsorship.open) throw new Conflict('This one is no longer open');
  const existing = claimsOf(sponsorshipId);
  if (existing.some((c) => c.familyId === familyId)) throw new Conflict('You have already taken this one on');
  if (existing.length >= sponsorship.maxSponsors) throw new Conflict('Someone else has just taken this one');

  const amount = input.amount ?? sponsorship.suggestedAmount;
  if (amount === undefined) throw new BadRequest('Enter an amount');
  if (!getLookups().funds.some((f) => f.key === sponsorship.fund)) {
    throw new BadRequest(`"${sponsorship.fund}" is not in the funds list`);
  }

  db.exec('BEGIN');
  try {
    const pledge = pledges.create({
      fund: sponsorship.fund,
      type: 'one_time',
      familyId,
      year: Number(sponsorship.date.slice(0, 4)),
      dueDate: sponsorship.date,
      amount,
      currency: sponsorship.currency,
    });
    const saved = insert<SponsorshipClaim>('sponsorshipClaims', {
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
    db.exec('COMMIT');
    audit('sponsorship.claimed', {
      entity: 'sponsorships',
      entityId: sponsorshipId,
      summary: `${sponsorship.title} on ${sponsorship.date}`,
      changes: { amount, currency: sponsorship.currency, dedication: saved.dedication ?? null },
    });
    return saved;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Give a sponsorship back. The pledge it created goes too, unless something was paid against it. */
export function release(claimId: string, limitToFamilyId?: string): void {
  const claim = get<SponsorshipClaim>('sponsorshipClaims', claimId);
  if (!claim) throw new NotFound('No such claim');
  if (limitToFamilyId !== undefined && claim.familyId !== limitToFamilyId) throw new NotFound('No such claim');
  const sponsorship = sponsorships.get(claim.sponsorshipId);

  db.exec('BEGIN');
  try {
    // Checked inside the transaction: a payment landing between the check and the delete would
    // otherwise leave a donation pointing at a pledge that no longer exists.
    const paid = claim.pledgeId
      ? (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM donations WHERE pledgeId = ?').get(claim.pledgeId) as { n: number }).n
      : 0;
    if (paid > 0) {
      throw new Conflict('Something has already been paid towards this one, so the office needs to undo it');
    }
    removeRow('sponsorshipClaims', claimId);
    if (claim.pledgeId) removeRow('pledges', claim.pledgeId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  audit('sponsorship.released', {
    entity: 'sponsorships',
    entityId: claim.sponsorshipId,
    summary: sponsorship ? `${sponsorship.title} on ${sponsorship.date}` : claimId,
  });
}

/** Validate and default a sponsorship the office is creating or changing. */
export function parseSponsorship(body: unknown): SponsorshipInput {
  const input = sponsorshipInputSchema.parse({ currency: getOrg().defaultCurrency, maxSponsors: 1, open: true, ...(body as object) });
  if (!getLookups().funds.some((f) => f.key === input.fund)) throw new BadRequest(`"${input.fund}" is not in the funds list`);
  return input;
}
