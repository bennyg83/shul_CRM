import { db } from './db.ts';
import { currentOrgOverride, currentUser } from './context.ts';
import { createOrganizationRow, suggestSlug } from './organizations.ts';

// ---------------------------------------------------------------------------
// Logical multi-tenant: every row belongs to an organization. The signed-in
// user's orgId scopes reads and writes; when nobody is signed in but exactly
// one org exists (setup, tests), that org is used.
// ---------------------------------------------------------------------------

export const ORG_SCOPED_TABLES = new Set([
  'families',
  'members',
  'pledges',
  'donations',
  'importantDates',
  'notes',
  'events',
  'rsvps',
  'emailLog',
  'sponsorships',
  'sponsorshipClaims',
  'auditLog',
]);

let cachedOrgIds: string[] | undefined;

/** Load org ids from the database (call during startup and after creating an org). */
export async function loadOrganizationIds(): Promise<string[]> {
  cachedOrgIds = (
    (await db.prepare('SELECT id FROM organizations ORDER BY createdAt').all()) as Array<{ id: string }>
  ).map((r) => r.id);
  return cachedOrgIds;
}

export function noteOrganizationCreated(id: string): void {
  cachedOrgIds = [...(cachedOrgIds ?? []), id];
}

export function listOrganizationIds(): string[] {
  if (!cachedOrgIds) throw new Error('Organization list not loaded; call loadOrganizationIds() during startup');
  return cachedOrgIds;
}

/** When the install still has a single shul, callers may run without a signed-in user. */
export function soleOrgId(): string | undefined {
  const ids = listOrganizationIds();
  return ids.length === 1 ? ids[0] : undefined;
}

/** Create the first organization row when none exists (fresh PostgreSQL install). */
export async function ensureDefaultOrganization(): Promise<string> {
  const existing = soleOrgId();
  if (existing) return existing;
  const org = await createOrganizationRow('Demo Shul', await suggestSlug('demo-shul'));
  noteOrganizationCreated(org.id);
  return org.id;
}

/** Organization for the current request: override, signed-in user, else the only org on the install. */
export function resolveOrgId(): string {
  const override = currentOrgOverride();
  if (override) return override;
  const fromUser = currentUser()?.orgId;
  if (fromUser) return fromUser;
  const sole = soleOrgId();
  if (sole) return sole;
  throw new Error('No organization context; call ensureDefaultOrganization() during startup');
}
