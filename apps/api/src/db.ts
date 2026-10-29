import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { connectPostgres } from './database/postgres-client.ts';
import { migratePostgres, POSTGRES_SCHEMA_VERSION } from './database/postgres-schema.ts';
import type { SqlDatabase } from './database/types.ts';

// ---------------------------------------------------------------------------
// PostgreSQL (pg or PGlite). Set DATABASE_URL; tests default to pglite://memory.
// ---------------------------------------------------------------------------

export const DATA_DIR = process.env.CRM_DATA_DIR ?? join(import.meta.dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

let _db: SqlDatabase | undefined;

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'pglite://memory';
}

export function isPglite(): boolean {
  return connectionString().startsWith('pglite:');
}

export const SCHEMA_VERSION = POSTGRES_SCHEMA_VERSION;

export async function initDatabase(): Promise<void> {
  if (_db) return;
  _db = await connectPostgres(connectionString());
  await migratePostgres(_db);
}

export function getDb(): SqlDatabase {
  if (!_db) throw new Error('Database not initialized; call initDatabase() first');
  return _db;
}

export const db: SqlDatabase = new Proxy({} as SqlDatabase, {
  get(_target, prop: keyof SqlDatabase) {
    return getDb()[prop];
  },
});

export async function closeDatabase(): Promise<void> {
  await _db?.close();
  _db = undefined;
}
