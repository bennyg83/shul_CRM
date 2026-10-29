import type { SqlDatabase } from './types.ts';

/** Fresh PostgreSQL database: full schema at version 8 (no SQLite migration path). */
export async function applyPostgresSchema(db: SqlDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT,
      "createdAt" TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "hebrewName" TEXT,
      address TEXT,
      city TEXT,
      zip TEXT,
      country TEXT,
      phone TEXT,
      whatsapp TEXT,
      email TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      notes TEXT,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_families_org ON families("orgId");

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "familyId" TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "hebrewName" TEXT,
      "fatherHebrewName" TEXT,
      "motherHebrewName" TEXT,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
      role TEXT,
      "birthDate" TEXT,
      "deathDate" TEXT,
      email TEXT,
      phone TEXT,
      whatsapp TEXT,
      occupation TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_members_family ON members("familyId");
    CREATE INDEX IF NOT EXISTS idx_members_org ON members("orgId");

    CREATE TABLE IF NOT EXISTS pledges (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      fund TEXT NOT NULL,
      type TEXT,
      "familyId" TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      "dueDate" TEXT,
      amount DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pledges_family ON pledges("familyId");
    CREATE INDEX IF NOT EXISTS idx_pledges_org ON pledges("orgId");

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      fund TEXT NOT NULL,
      "familyId" TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      "pledgeId" TEXT REFERENCES pledges(id) ON DELETE SET NULL,
      amount DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      date TEXT NOT NULL,
      method TEXT NOT NULL,
      note TEXT,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_donations_family ON donations("familyId");
    CREATE INDEX IF NOT EXISTS idx_donations_pledge ON donations("pledgeId");
    CREATE INDEX IF NOT EXISTS idx_donations_org ON donations("orgId");

    CREATE TABLE IF NOT EXISTS "importantDates" (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "memberId" TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      "afterNightfall" BOOLEAN,
      "hebrewDay" INTEGER,
      "hebrewMonth" INTEGER,
      "hebrewYear" INTEGER,
      recurring BOOLEAN,
      "recurBy" TEXT,
      note TEXT,
      "personName" TEXT,
      "personHebrewName" TEXT,
      relationship TEXT,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_dates_member ON "importantDates"("memberId");
    CREATE INDEX IF NOT EXISTS idx_dates_org ON "importantDates"("orgId");

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "familyId" TEXT REFERENCES families(id) ON DELETE CASCADE,
      "memberId" TEXT REFERENCES members(id) ON DELETE CASCADE,
      type TEXT,
      priority TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notes_org ON notes("orgId");

    CREATE TABLE IF NOT EXISTS settings (
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY ("orgId", key)
    );

    CREATE TABLE IF NOT EXISTS files (
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      "contentType" TEXT NOT NULL,
      data BYTEA NOT NULL,
      "updatedAt" TEXT NOT NULL,
      PRIMARY KEY ("orgId", id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      "startTime" TEXT,
      "endTime" TEXT,
      location TEXT,
      description TEXT,
      capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
      "rsvpOpen" BOOLEAN,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_org ON events("orgId");

    CREATE TABLE IF NOT EXISTS rsvps (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "familyId" TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      adults INTEGER NOT NULL DEFAULT 0 CHECK (adults >= 0),
      children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
      note TEXT,
      "createdAt" TEXT NOT NULL,
      UNIQUE ("eventId", "familyId")
    );
    CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps("eventId");
    CREATE INDEX IF NOT EXISTS idx_rsvps_org ON rsvps("orgId");

    CREATE TABLE IF NOT EXISTS "emailLog" (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "toAddress" TEXT NOT NULL,
      subject TEXT NOT NULL,
      template TEXT,
      "familyId" TEXT REFERENCES families(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      error TEXT,
      "testMode" BOOLEAN NOT NULL DEFAULT false,
      "sentAt" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_email_family ON "emailLog"("familyId");
    CREATE INDEX IF NOT EXISTS idx_email_org ON "emailLog"("orgId");

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      "passwordHash" TEXT,
      "createdAt" TEXT NOT NULL,
      "lastLoginAt" TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

    CREATE TABLE IF NOT EXISTS "org_memberships" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      "memberId" TEXT REFERENCES members(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      name TEXT NOT NULL,
      "createdAt" TEXT NOT NULL,
      UNIQUE ("orgId", "userId")
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON "org_memberships"("userId");
    CREATE INDEX IF NOT EXISTS idx_memberships_org ON "org_memberships"("orgId");

    CREATE TABLE IF NOT EXISTS sessions (
      "tokenHash" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "createdAt" TEXT NOT NULL,
      "lastSeenAt" TEXT NOT NULL,
      "expiresAt" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions("userId");
    CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions("orgId");

    CREATE TABLE IF NOT EXISTS "userTokens" (
      "tokenHash" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "orgId" TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      "createdAt" TEXT NOT NULL,
      "expiresAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "auditLog" (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      "userId" TEXT,
      "userName" TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      "entityId" TEXT,
      summary TEXT,
      changes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON "auditLog"(at);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON "auditLog"(entity, "entityId");
    CREATE INDEX IF NOT EXISTS idx_audit_org ON "auditLog"("orgId");

    CREATE TABLE IF NOT EXISTS sponsorships (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      fund TEXT NOT NULL,
      "suggestedAmount" DOUBLE PRECISION CHECK ("suggestedAmount" IS NULL OR "suggestedAmount" >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      "maxSponsors" INTEGER NOT NULL DEFAULT 1 CHECK ("maxSponsors" >= 1),
      note TEXT,
      open BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sponsorships_date ON sponsorships(date);
    CREATE INDEX IF NOT EXISTS idx_sponsorships_org ON sponsorships("orgId");

    CREATE TABLE IF NOT EXISTS "sponsorshipClaims" (
      id TEXT PRIMARY KEY,
      "orgId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      "sponsorshipId" TEXT NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
      "familyId" TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      "memberId" TEXT REFERENCES members(id) ON DELETE SET NULL,
      dedication TEXT,
      amount DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      "pledgeId" TEXT REFERENCES pledges(id) ON DELETE SET NULL,
      "createdAt" TEXT NOT NULL,
      "createdBy" TEXT,
      UNIQUE ("sponsorshipId", "familyId")
    );
    CREATE INDEX IF NOT EXISTS idx_claims_sponsorship ON "sponsorshipClaims"("sponsorshipId");
    CREATE INDEX IF NOT EXISTS idx_claims_family ON "sponsorshipClaims"("familyId");
    CREATE INDEX IF NOT EXISTS idx_claims_org ON "sponsorshipClaims"("orgId");
  `);
}

export const POSTGRES_SCHEMA_VERSION = 8;

export async function migratePostgres(db: SqlDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `);
  let row = (await db.prepare('SELECT version FROM schema_version').get()) as { version: number } | undefined;
  if (!row) {
    await db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
    row = { version: 0 };
  }
  const current = row.version;
  if (current > POSTGRES_SCHEMA_VERSION) {
    throw new Error(`Database schema ${current} is newer than this app (${POSTGRES_SCHEMA_VERSION}); update the app.`);
  }
  if (current < POSTGRES_SCHEMA_VERSION) {
    await applyPostgresSchema(db);
    await db.prepare('UPDATE schema_version SET version = ?').run(POSTGRES_SCHEMA_VERSION);
  }
}
