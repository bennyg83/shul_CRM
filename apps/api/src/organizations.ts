import {
  createOrganizationSchema,
  defaultOrgProfile,
  newId,
  slugifyOrganizationName,
  type OrganizationSummary,
} from '@shulcrm/shared';
import { DEFAULT_FEATURES, DEFAULT_LOOKUPS, DEFAULT_TERMS } from '@shulcrm/shared';
import { db } from './db.ts';
import { runWithOrg } from './context.ts';
import { Conflict } from './settings.ts';
import { writeJsonSetting } from './settings.ts';
import { noteOrganizationCreated } from './tenant.ts';

// ---------------------------------------------------------------------------
// Logical multi-tenant: each shul is a row in `organizations`, with its own
// settings blob and data scoped by orgId elsewhere.
// ---------------------------------------------------------------------------

function rowToSummary(row: Record<string, unknown>): OrganizationSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    createdAt: String(row.createdAt),
  };
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  return (
    (await db.prepare('SELECT id, slug, name, createdAt FROM organizations ORDER BY name COLLATE NOCASE').all()) as Array<
      Record<string, unknown>
    >
  ).map(rowToSummary);
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationSummary | undefined> {
  const row = (await db
    .prepare('SELECT id, slug, name, createdAt FROM organizations WHERE slug = ? COLLATE NOCASE')
    .get(slug)) as Record<string, unknown> | undefined;
  return row ? rowToSummary(row) : undefined;
}

export async function getOrganizationById(id: string): Promise<OrganizationSummary | undefined> {
  const row = (await db.prepare('SELECT id, slug, name, createdAt FROM organizations WHERE id = ?').get(id)) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToSummary(row) : undefined;
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

/** Default settings for a brand-new shul (no families yet). */
export async function initOrganizationSettings(orgId: string, name: string): Promise<void> {
  await runWithOrg(orgId, async () => {
    await writeJsonSetting('org', {
      ...defaultOrgProfile(orgId),
      name,
      shortName: name.length > 40 ? name.slice(0, 40) : name,
    });
    await writeJsonSetting('features', DEFAULT_FEATURES);
    await writeJsonSetting('terms', DEFAULT_TERMS);
    await writeJsonSetting('lookups', DEFAULT_LOOKUPS);
  });
}

export async function usersInOrganization(orgId: string): Promise<number> {
  return ((await db.prepare('SELECT COUNT(*) AS n FROM org_memberships WHERE orgId = ?').get(orgId)) as { n: number }).n;
}

/** Insert the organization row and its default settings. Caller adds the owner user. */
export async function createOrganizationRow(name: string, slug: string): Promise<OrganizationSummary> {
  const parsed = createOrganizationSchema.parse({ name, slug });
  if (await getOrganizationBySlug(parsed.slug)) throw new Conflict('That web address is already taken; pick another slug');
  const id = newId();
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO organizations (id, slug, name, createdAt) VALUES (?, ?, ?, ?)').run(
    id,
    parsed.slug,
    parsed.name.trim(),
    createdAt,
  );
  noteOrganizationCreated(id);
  await initOrganizationSettings(id, parsed.name.trim());
  return (await getOrganizationById(id)) as OrganizationSummary;
}

/** Orgs where this email has an active account (for the login picker). */
export { loginOrganizationsForEmail as loginTargets } from './memberships.ts';

export async function suggestSlug(name: string): Promise<string> {
  return uniqueSlug(slugifyOrganizationName(name));
}
