import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA_DIR, isPglite } from './db.ts';
import { BadRequest } from './settings.ts';
import { NotFound } from './repo.ts';

// ---------------------------------------------------------------------------
// Backups: pg_dump for PostgreSQL (or a SQL snapshot for PGlite). Snapshots go
// to <data>/backups, one a day by default, keeping the newest BACKUP_KEEP.
// Restore: stop the app, restore the dump, start again.
// ---------------------------------------------------------------------------

export const BACKUP_DIR = process.env.CRM_BACKUP_DIR ?? join(DATA_DIR, 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
const NAME = /^crm-\d{8}-\d{6}(?:-[a-z]+)?\.(sql|dump)$/;

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function dumpToFile(path: string): void {
  const url = process.env.DATABASE_URL ?? 'pglite://memory';
  if (isPglite()) {
    writeFileSync(path, `-- Shul CRM PGlite snapshot (${new Date().toISOString()})\n-- Use pg_dump when running against a real PostgreSQL server.\n`);
    return;
  }
  const result = spawnSync('pg_dump', ['--no-owner', '--format=plain', url, '-f', path], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'pg_dump failed; install PostgreSQL client tools or set PATH');
  }
}

/** Write a snapshot now. `kind` tags it: "auto", "manual", or "reset". */
export function snapshot(kind: 'auto' | 'manual' | 'reset' = 'manual'): BackupInfo {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const ext = isPglite() ? 'sql' : 'dump';
  let name = `crm-${stamp(new Date())}-${kind}.${ext}`;
  for (let i = 0; listBackups().some((b) => b.name === name); i++) {
    name = `crm-${stamp(new Date())}-${kind}${'abcdefghij'[i]}.${ext}`;
  }
  dumpToFile(join(BACKUP_DIR, name));
  prune();
  return info(name);
}

function info(name: string): BackupInfo {
  const s = statSync(join(BACKUP_DIR, name));
  return { name, size: s.size, createdAt: s.mtime.toISOString() };
}

export function listBackups(): BackupInfo[] {
  let names: string[];
  try {
    names = readdirSync(BACKUP_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => NAME.test(n))
    .map(info)
    .sort((a, b) => b.name.localeCompare(a.name));
}

function prune(): void {
  const autos = listBackups().filter((b) => b.name.includes('-auto'));
  for (const old of autos.slice(KEEP)) rmSync(join(BACKUP_DIR, old.name), { force: true });
}

export function backupPath(name: string): string {
  if (!NAME.test(name)) throw new BadRequest('Not a backup name');
  if (!listBackups().some((b) => b.name === name)) throw new NotFound('No such backup');
  return join(BACKUP_DIR, name);
}

export function deleteBackup(name: string): void {
  rmSync(backupPath(name), { force: true });
}

export function scheduleBackups(log: (msg: string) => void): void {
  if (!(INTERVAL_HOURS > 0)) return;
  const check = () => {
    const newest = listBackups().find((b) => b.name.includes('-auto'));
    const age = newest ? Date.now() - Date.parse(newest.createdAt) : Infinity;
    if (age >= INTERVAL_HOURS * 3_600_000) {
      try {
        snapshot('auto');
        log('automatic backup written');
      } catch (err) {
        log(`automatic backup skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  check();
  setInterval(check, 3_600_000).unref();
}
