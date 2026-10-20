import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from './migrations.ts';

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

// Schema changes are numbered migrations (migrations.ts), applied once each at startup.
migrate(db);
