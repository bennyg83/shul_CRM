import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
  type TEXT NOT NULL CHECK (type IN ('birthday', 'yahrzeit', 'brit_mitzvah')),
  date TEXT NOT NULL,
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
