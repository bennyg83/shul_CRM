import { newId, type AuditEntry } from '@shulcrm/shared';
import { db } from './db.ts';
import { currentUser } from './context.ts';
import { resolveOrgId } from './tenant.ts';
import { NotFound, get, insert, removeRow, update } from './repo.ts';
import { BadRequest, Conflict } from './settings.ts';

// ---------------------------------------------------------------------------
// The audit log: who did what, when. Record changes keep the fields that
// changed (before and after), so a mistaken edit can be traced and undone.
// It lives in the database (like the records it describes), not in the logs.
// ---------------------------------------------------------------------------

export async function audit(
  action: string,
  details: { entity?: string; entityId?: string; summary?: string; changes?: unknown } = {},
): Promise<void> {
  const user = currentUser();
  await db
    .prepare(
      `INSERT INTO auditLog (id, orgId, at, userId, userName, action, entity, entityId, summary, changes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      resolveOrgId(),
      new Date().toISOString(),
      user?.id ?? null,
      user?.name ?? null,
      action,
      details.entity ?? null,
      details.entityId ?? null,
      details.summary ?? null,
      details.changes === undefined ? null : JSON.stringify(details.changes),
    );
}

/** Fields that differ between two versions of a record: field -> [before, after]. */
export function diff(beforeRecord: object, afterRecord: object): Record<string, [unknown, unknown]> {
  const before = beforeRecord as Record<string, unknown>;
  const after = afterRecord as Record<string, unknown>;
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'createdAt' || key === 'createdBy') continue;
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = [a, b];
  }
  return out;
}

/** A one-line description of a record, for the log. */
export function describe(entity: string, r: Record<string, unknown>): string {
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  switch (entity) {
    case 'families':
      return s(r.name);
    case 'members':
      return `${s(r.firstName)} ${s(r.lastName)}`.trim();
    case 'pledges':
      return `${s(r.fund)} ${s(r.year)}: ${s(r.amount)} ${s(r.currency)}`;
    case 'donations':
      return `${s(r.date)} ${s(r.fund)}: ${s(r.amount)} ${s(r.currency)}`;
    case 'importantDates':
      return `${s(r.type)} ${s(r.date)}`;
    case 'notes':
      return s(r.subject) || s(r.body).slice(0, 60);
    case 'events':
      return `${s(r.title)} ${s(r.date)}`;
    default:
      return s(r.name ?? r.title ?? r.id);
  }
}

export async function auditLog(query: {
  entity?: string;
  entityId?: string;
  limit?: number;
  before?: string;
  source?: string;
}): Promise<AuditEntry[]> {
  const where: string[] = ['orgId = ?'];
  const params: string[] = [resolveOrgId()];
  if (query.source === 'portal') where.push("action LIKE 'portal.%'");
  if (query.entity) {
    where.push('entity = ?');
    params.push(query.entity);
  }
  if (query.entityId) {
    where.push('entityId = ?');
    params.push(query.entityId);
  }
  if (query.before) {
    where.push('at < ?');
    params.push(query.before);
  }
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const rows = (await db
    .prepare(`SELECT * FROM auditLog ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT ?`)
    .all(...params, limit)) as Array<Record<string, string | null>>;
  return rows.map((r) => ({
    id: String(r.id),
    at: String(r.at),
    userId: r.userId ?? undefined,
    userName: r.userName ?? undefined,
    action: String(r.action),
    entity: r.entity ?? undefined,
    entityId: r.entityId ?? undefined,
    summary: r.summary ?? undefined,
    changes: r.changes ? (JSON.parse(r.changes) as Record<string, unknown>) : undefined,
  }));
}

const UNDOABLE = new Set(['families', 'members', 'importantDates']);

function isFieldDiff(changes: Record<string, unknown>): changes is Record<string, [unknown, unknown]> {
  const values = Object.values(changes);
  return values.length > 0 && values.every((v) => Array.isArray(v) && v.length === 2);
}

export async function undo(entryId: string): Promise<{ action: string; entity: string }> {
  const row = (await db.prepare('SELECT * FROM auditLog WHERE id = ? AND orgId = ?').get(entryId, resolveOrgId())) as
    | Record<string, string | null>
    | undefined;
  if (!row) throw new NotFound('No such entry in the log');
  const entry: AuditEntry = {
    id: String(row.id),
    at: String(row.at),
    action: String(row.action),
    entity: row.entity ?? undefined,
    entityId: row.entityId ?? undefined,
    summary: row.summary ?? undefined,
    changes: row.changes ? (JSON.parse(row.changes) as Record<string, unknown>) : undefined,
  };
  if (!entry.action.startsWith('portal.')) throw new BadRequest('Only changes a family made about itself can be put back');
  if (!entry.entity || !UNDOABLE.has(entry.entity) || !entry.entityId) throw new BadRequest('This change cannot be put back');
  if (!entry.changes) throw new BadRequest('This entry does not record what changed');

  const { entity, entityId, changes } = entry;
  const exists = (await get<Record<string, unknown>>(entity, entityId)) !== undefined;

  await db.exec('BEGIN');
  try {
    if (entry.action === 'portal.update') {
      if (!isFieldDiff(changes)) throw new BadRequest('This entry does not record what changed');
      if (!exists) throw new Conflict('That record has since been deleted');
      const patch = Object.fromEntries(Object.entries(changes).map(([field, [before]]) => [field, before]));
      await update(entity, entityId, patch);
    } else if (entry.action === 'portal.create') {
      if (exists) await removeRow(entity, entityId);
    } else if (entry.action === 'portal.delete') {
      if (exists) throw new Conflict('That record is already back');
      await insert(entity, changes as object);
    } else {
      throw new BadRequest('This change cannot be put back');
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  await audit('undo', { entity, entityId, summary: `Put back: ${entry.summary ?? entry.action}`, changes: { undid: entry.id } });
  return { action: entry.action, entity };
}
