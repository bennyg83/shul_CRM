import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initTestDatabase } from './init-db.ts';

/** Isolated PGlite database directory for one test file. */
export async function freshTestDatabase(prefix: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.env.DATABASE_URL = `pglite://${join(dir, 'pg')}`;
  await initTestDatabase();
  return dir;
}
