import type { DatabaseSync } from 'node:sqlite';
import { isUuid, newId } from '@shulcrm/shared';

// ---------------------------------------------------------------------------
// Numbered schema migrations. `schema_version` holds the last one applied; each
// later migration runs once, in order, at startup. Never edit a migration that
// has shipped: add a new one.
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  name: string;
  /** Rebuilding a table needs foreign-key enforcement off around the copy. */
  foreignKeysOff?: boolean;
  /** The baseline manages its own transactions. */
  ownTransactions?: boolean;
  up(db: DatabaseSync): void;
}

/** Run `work` in a transaction with foreign keys off, checking them before commit.
 * (PRAGMA foreign_keys has no effect inside a transaction, so it is set outside.) */
export function withForeignKeysOff(db: DatabaseSync, work: () => void): void {
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN');
    try {
      work();
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length > 0) throw new Error(`Migration left ${broken.length} broken foreign keys`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * 1 — Baseline: everything before numbered migrations (Phases 0 and 1). Idempotent, so it
 * brings any older database, or an empty one, to the same starting schema.
 */
function baseline(db: DatabaseSync): void {
  // Column names mirror the JSON field names exactly (camelCase) — no mapping.
  db.exec(`
  CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hebrewName TEXT,
    address TEXT,
    city TEXT,
    zip TEXT,
    country TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    notes TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    familyId TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    hebrewName TEXT,
    fatherHebrewName TEXT,
    motherHebrewName TEXT,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    role TEXT,
    birthDate TEXT,
    deathDate TEXT,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,
    occupation TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pledges (
    id TEXT PRIMARY KEY,
    fund TEXT NOT NULL,
    type TEXT,
    familyId TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    dueDate TEXT,
    amount REAL NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    fund TEXT NOT NULL,
    familyId TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    pledgeId TEXT REFERENCES pledges(id) ON DELETE SET NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    date TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('cash', 'check', 'credit', 'transfer')),
    note TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS importantDates (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    afterNightfall INTEGER,
    hebrewDay INTEGER,
    hebrewMonth INTEGER,
    hebrewYear INTEGER,
    recurring INTEGER,
    recurBy TEXT,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    familyId TEXT REFERENCES families(id) ON DELETE CASCADE,
    memberId TEXT REFERENCES members(id) ON DELETE CASCADE,
    type TEXT,
    priority TEXT,
    subject TEXT,
    body TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_family ON members(familyId);
  CREATE INDEX IF NOT EXISTS idx_pledges_family ON pledges(familyId);
  CREATE INDEX IF NOT EXISTS idx_donations_family ON donations(familyId);
  CREATE INDEX IF NOT EXISTS idx_donations_pledge ON donations(pledgeId);
  CREATE INDEX IF NOT EXISTS idx_dates_member ON importantDates(memberId);
  `);

  // ---------------------------------------------------------------------------
  // Idempotent migration: the SQLite file may predate a column addition, and
  // CREATE TABLE IF NOT EXISTS will not add columns to an existing table. Add
  // any new nullable column that is missing (all new columns are nullable).
  // ---------------------------------------------------------------------------
  function ensureColumn(table: string, column: string, def: string): void {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
    }
  }


  // One-time cleanup: drop a column that has been removed from the schema.
  // SQLite >= 3.35 supports DROP COLUMN; the guard keeps this idempotent.
  function dropColumnIfPresent(table: string, column: string): void {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
  }
  ensureColumn('families', 'zip', 'TEXT');
  ensureColumn('families', 'country', 'TEXT');
  ensureColumn('members', 'role', 'TEXT');
  ensureColumn('members', 'deathDate', 'TEXT');
  ensureColumn('members', 'occupation', 'TEXT');
  ensureColumn('pledges', 'type', 'TEXT');
  ensureColumn('pledges', 'dueDate', 'TEXT');
  ensureColumn('importantDates', 'hebrewDay', 'INTEGER');
  ensureColumn('importantDates', 'hebrewMonth', 'INTEGER');
  ensureColumn('importantDates', 'hebrewYear', 'INTEGER');
  ensureColumn('importantDates', 'recurring', 'INTEGER');
  ensureColumn('notes', 'type', 'TEXT');
  ensureColumn('notes', 'priority', 'TEXT');
  ensureColumn('notes', 'subject', 'TEXT');
  ensureColumn('families', 'hebrewName', 'TEXT');
  ensureColumn('families', 'whatsapp', 'TEXT');
  ensureColumn('members', 'hebrewName', 'TEXT');
  ensureColumn('members', 'fatherHebrewName', 'TEXT');
  ensureColumn('members', 'motherHebrewName', 'TEXT');
  ensureColumn('members', 'whatsapp', 'TEXT');
  ensureColumn('pledges', 'currency', "TEXT NOT NULL DEFAULT 'USD'");
  ensureColumn('donations', 'currency', "TEXT NOT NULL DEFAULT 'USD'");

  // Remove the legacy free-text hebrewDate column (superseded by hebrewDay/Month/Year).
  dropColumnIfPresent('importantDates', 'hebrewDate');
  ensureColumn('importantDates', 'afterNightfall', 'INTEGER');
  ensureColumn('importantDates', 'recurBy', 'TEXT');

  // Table rebuilds: SQLite cannot ALTER a CHECK constraint, so the table is copied into a fresh one.
  // importantDates.type used to be limited to ('birthday', 'yahrzeit', 'brit_mitzvah'), which
  // rejected bar/bat mitzvah, anniversary and seuda hoda'a. Types are validated in zod instead.
  const datesSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'importantDates'`).get() as
    | { sql: string }
    | undefined;
  if (datesSql?.sql.includes('CHECK')) {
    withForeignKeysOff(db, () => {
      db.exec(`
        CREATE TABLE importantDates_new (
          id TEXT PRIMARY KEY,
          memberId TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          date TEXT NOT NULL,
          afterNightfall INTEGER,
          hebrewDay INTEGER,
          hebrewMonth INTEGER,
          hebrewYear INTEGER,
          recurring INTEGER,
          recurBy TEXT,
          note TEXT
        );
        INSERT INTO importantDates_new (id, memberId, type, date, afterNightfall, hebrewDay, hebrewMonth, hebrewYear, recurring, recurBy, note)
          SELECT id, memberId, type, date, afterNightfall, hebrewDay, hebrewMonth, hebrewYear, recurring, recurBy, note FROM importantDates;
        DROP TABLE importantDates;
        ALTER TABLE importantDates_new RENAME TO importantDates;
        CREATE INDEX IF NOT EXISTS idx_dates_member ON importantDates(memberId);
      `);
    });
  }

  // ---------------------------------------------------------------------------
  // One-time ID migration: older databases used prefixed ids ("fam-001",
  // "mem-lx3k…"). Every id and foreign key is rewritten to a UUIDv7 in one
  // transaction; rows that already have UUIDs are left alone.
  // ---------------------------------------------------------------------------
  const ID_TABLES = ['families', 'members', 'pledges', 'donations', 'importantDates', 'notes'] as const;
  const FOREIGN_KEYS: ReadonlyArray<readonly [table: string, column: string]> = [
    ['members', 'familyId'],
    ['pledges', 'familyId'],
    ['donations', 'familyId'],
    ['donations', 'pledgeId'],
    ['importantDates', 'memberId'],
    ['notes', 'familyId'],
    ['notes', 'memberId'],
  ];

  const legacyIds = new Map<string, string>();
  for (const table of ID_TABLES) {
    for (const { id } of db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]) {
      if (!isUuid(id)) legacyIds.set(id, newId());
    }
  }
  if (legacyIds.size > 0) {
    withForeignKeysOff(db, () => {
      for (const [oldId, id] of legacyIds) {
        for (const table of ID_TABLES) db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).run(id, oldId);
        for (const [table, column] of FOREIGN_KEYS) {
          db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(id, oldId);
        }
      }
    });
    console.log(`[db] migrated ${legacyIds.size} legacy ids to UUIDs`);
  }
}

/** 2 — Shul settings (org profile, lookups, terms, features) and stored files (the logo).
 * Payment methods become an editable list, so the donations.method CHECK goes. */
function settingsAndFiles(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      contentType TEXT NOT NULL,
      data BLOB NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE donations_new (
      id TEXT PRIMARY KEY,
      fund TEXT NOT NULL,
      familyId TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      pledgeId TEXT REFERENCES pledges(id) ON DELETE SET NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      date TEXT NOT NULL,
      method TEXT NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL
    );
    INSERT INTO donations_new (id, fund, familyId, pledgeId, amount, currency, date, method, note, createdAt)
      SELECT id, fund, familyId, pledgeId, amount, currency, date, method, note, createdAt FROM donations;
    DROP TABLE donations;
    ALTER TABLE donations_new RENAME TO donations;
    CREATE INDEX IF NOT EXISTS idx_donations_family ON donations(familyId);
    CREATE INDEX IF NOT EXISTS idx_donations_pledge ON donations(pledgeId);
  `);
}

/** 3 — Events with RSVPs, an email log, and who a date is for (the person a yahrzeit remembers). */
function eventsAndEmail(db: DatabaseSync): void {
  db.exec(`
    ALTER TABLE importantDates ADD COLUMN personName TEXT;
    ALTER TABLE importantDates ADD COLUMN personHebrewName TEXT;
    ALTER TABLE importantDates ADD COLUMN relationship TEXT;

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      startTime TEXT,
      endTime TEXT,
      location TEXT,
      description TEXT,
      capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
      rsvpOpen INTEGER,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX idx_events_date ON events(date);

    CREATE TABLE rsvps (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      familyId TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      adults INTEGER NOT NULL DEFAULT 0 CHECK (adults >= 0),
      children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE (eventId, familyId)
    );
    CREATE INDEX idx_rsvps_event ON rsvps(eventId);

    CREATE TABLE emailLog (
      id TEXT PRIMARY KEY,
      toAddress TEXT NOT NULL,
      subject TEXT NOT NULL,
      template TEXT,
      familyId TEXT REFERENCES families(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      error TEXT,
      testMode INTEGER NOT NULL DEFAULT 0,
      sentAt TEXT NOT NULL
    );
    CREATE INDEX idx_email_family ON emailLog(familyId);
  `);
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: 'baseline', ownTransactions: true, up: baseline },
  { version: 2, name: 'settings and files', foreignKeysOff: true, up: settingsAndFiles },
  { version: 3, name: 'events, RSVPs, email log', up: eventsAndEmail },
];

/** The schema version this code expects. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Apply every migration newer than the database's schema_version, in order. */
export function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  if (!row) db.exec('INSERT INTO schema_version (version) VALUES (0)');
  const current = row?.version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema ${current} is newer than this app (${SCHEMA_VERSION}); update the app.`);
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const setVersion = () => db.prepare('UPDATE schema_version SET version = ?').run(m.version);
    if (m.ownTransactions) {
      m.up(db);
      setVersion();
    } else if (m.foreignKeysOff) {
      withForeignKeysOff(db, () => {
        m.up(db);
        setVersion();
      });
    } else {
      db.exec('BEGIN');
      try {
        m.up(db);
        setVersion();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    console.log(`[db] migration ${m.version} (${m.name}) applied`);
  }
}
