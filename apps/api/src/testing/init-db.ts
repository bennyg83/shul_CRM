import { initDatabase } from '../db.ts';

/** Call once before importing app.ts in tests (top-level await). */
export async function initTestDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'pglite://memory';
  await initDatabase();
}
