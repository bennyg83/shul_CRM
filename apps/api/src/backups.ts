import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, db } from './db.ts';
import { BadRequest } from './settings.ts';
import { NotFound } from './repo.ts';

// ---------------------------------------------------------------------------
// Backups: VACUUM INTO writes a complete, consistent copy of the database (safe
// while the app is running). Snapshots go to <data>/backups, one a day by
// default, keeping the newest BACKUP_KEEP. Because the logo and settings live
// in the database too, one file is the whole shul.
// Restore: stop the app, replace data/crm.sqlite with a snapshot, start again.
// ---------------------------------------------------------------------------

export const BACKUP_DIR = process.env.CRM_BACKUP_DIR ?? join(DATA_DIR, 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
const NAME = /^crm-\d{8}-\d{6}(?:-[a-z]+)?\.sqlite$/;

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Write a snapshot now. `kind` tags it: "auto", "manual", or "reset" (taken before a demo reset). */
export function snapshot(kind: 'auto' | 'manual' | 'reset' = 'manual'): BackupInfo {
  mkdirSync(BACKUP_DIR, { recursive: true });
  let name = `crm-${stamp(new Date())}-${kind}.sqlite`;
  // Two in the same second: add a letter rather than overwrite.
  for (let i = 0; listBackups().some((b) => b.name === name); i++) name = `crm-${stamp(new Date())}-${kind}${'abcdefghij'[i]}.sqlite`;
  db.prepare('VACUUM INTO ?').run(join(BACKUP_DIR, name));
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

/** Keep the newest KEEP automatic snapshots; manual ones are kept until deleted. */
function prune(): void {
  const autos = listBackups().filter((b) => b.name.includes('-auto'));
  for (const old of autos.slice(KEEP)) rmSync(join(BACKUP_DIR, old.name), { force: true });
}

/** The full path of a snapshot, for downloading. Only names this module made are accepted. */
export function backupPath(name: string): string {
  if (!NAME.test(name)) throw new BadRequest('Not a backup name');
  if (!listBackups().some((b) => b.name === name)) throw new NotFound('No such backup');
  return join(BACKUP_DIR, name);
}

export function deleteBackup(name: string): void {
  rmSync(backupPath(name), { force: true });
}

/** Take an automatic snapshot when the newest is older than the interval; check hourly. */
export function scheduleBackups(log: (msg: string) => void): void {
  if (!(INTERVAL_HOURS > 0)) return;
  const check = () => {
    const newest = listBackups().find((b) => b.name.includes('-auto'));
    const age = newest ? Date.now() - Date.parse(newest.createdAt) : Infinity;
    if (age >= INTERVAL_HOURS * 3_600_000) {
      try {
        const b = snapshot('auto');
        log(`backup written: ${b.name}`);
      } catch (err) {
        log(`backup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  check();
  setInterval(check, 3_600_000).unref();
}
