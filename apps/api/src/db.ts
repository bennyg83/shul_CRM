import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isUuid, newId } from '@pilzno/shared';

// ---------------------------------------------------------------------------
// SQLite database (node:sqlite — zero native dependencies, file-backed)
// Data lives in apps/api/data/crm.sqlite (WAL mode). Set CRM_DATA_DIR to override
// the directory (tests point it at a throwaway database so real data is never touched).
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.CRM_DATA_DIR ?? join(import.meta.dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'crm.sqlite'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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

// ---------------------------------------------------------------------------
// Table rebuilds. SQLite cannot ALTER a CHECK constraint, so a table whose
// definition changed is copied into a fresh one. Foreign keys are switched off
// for the copy (PRAGMA foreign_keys has no effect inside a transaction).
// ---------------------------------------------------------------------------
function withForeignKeysOff(work: () => void): void {
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

// importantDates.type used to be limited to ('birthday', 'yahrzeit', 'brit_mitzvah'), which
// rejected bar/bat mitzvah, anniversary and seuda hoda'a. Types are validated in zod instead.
const datesSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'importantDates'`).get() as
  | { sql: string }
  | undefined;
if (datesSql?.sql.includes('CHECK')) {
  withForeignKeysOff(() => {
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
        note TEXT
      );
      INSERT INTO importantDates_new (id, memberId, type, date, afterNightfall, hebrewDay, hebrewMonth, hebrewYear, recurring, note)
        SELECT id, memberId, type, date, afterNightfall, hebrewDay, hebrewMonth, hebrewYear, recurring, note FROM importantDates;
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
  withForeignKeysOff(() => {
    for (const [oldId, id] of legacyIds) {
      for (const table of ID_TABLES) db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).run(id, oldId);
      for (const [table, column] of FOREIGN_KEYS) {
        db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(id, oldId);
      }
    }
  });
  console.log(`[db] migrated ${legacyIds.size} legacy ids to UUIDs`);
}
