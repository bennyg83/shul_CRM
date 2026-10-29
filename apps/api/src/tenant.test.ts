import { afterAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-tenant-migration-');

const { db, SCHEMA_VERSION, closeDatabase } = await import('./db.ts');
const { resolveOrgId, soleOrgId, listOrganizationIds, ensureDefaultOrganization, loadOrganizationIds } = await import('./tenant.ts');

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

describe('PostgreSQL schema — logical multi-tenant', () => {
  it('applies schema version 8 and creates one organization with a slug', async () => {
    await loadOrganizationIds();
    if (listOrganizationIds().length === 0) await ensureDefaultOrganization();
    await loadOrganizationIds();
    expect(SCHEMA_VERSION).toBe(8);
    const version = ((await db.prepare('SELECT version FROM schema_version').get()) as { version: number }).version;
    expect(version).toBe(8);
    const org = (await db.prepare('SELECT slug FROM organizations LIMIT 1').get()) as { slug: string };
    expect(org.slug.length).toBeGreaterThan(1);
    expect(listOrganizationIds()).toHaveLength(1);
    expect(soleOrgId()).toBeDefined();
    expect(resolveOrgId()).toBe(soleOrgId());
  });

  it('scopes settings by orgId', async () => {
    const orgId = resolveOrgId();
    const keys = (await db.prepare('SELECT key FROM settings WHERE "orgId" = ?').all(orgId)) as Array<{ key: string }>;
    expect(await db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(orgId)).toBeTruthy();
    expect(keys.every((k) => typeof k.key === 'string')).toBe(true);
  });

  it('requires orgId on families after migration', async () => {
    const cols = (await db
      .prepare(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'families' AND column_name = 'orgId'`,
      )
      .all()) as Array<{ column_name: string }>;
    expect(cols.length).toBe(1);
  });

  it('stores roles in org_memberships, not on users', async () => {
    const userCols = (await db
      .prepare(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'orgId'`,
      )
      .all()) as Array<{ column_name: string }>;
    expect(userCols.length).toBe(0);
    expect(
      await db.prepare("SELECT 1 FROM information_schema.tables WHERE table_name = 'org_memberships'").get(),
    ).toBeTruthy();
  });
});
