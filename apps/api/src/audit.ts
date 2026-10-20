import { newId, type AuditEntry } from '@shulcrm/shared';
import { db } from './db.ts';
import { currentUser } from './context.ts';

// ---------------------------------------------------------------------------
// The audit log: who did what, when. Record changes keep the fields that
// changed (before and after), so a mistaken edit can be traced and undone.
// It lives in the database (like the records it describes), not in the logs.
// ---------------------------------------------------------------------------

export function audit(action: string, details: { entity?: string; entityId?: string; summary?: string; changes?: unknown } = {}): void {
  const user = currentUser();
  db.prepare(
    `INSERT INTO auditLog (id, at, userId, userName, action, entity, entityId, summary, changes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
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

export function auditLog(query: { entity?: string; entityId?: string; limit?: number; before?: string }): AuditEntry[] {
  const where: string[] = [];
  const params: string[] = [];
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
  const rows = db
    .prepare(`SELECT * FROM auditLog ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT ?`)
    .all(...params, limit) as Array<Record<string, string | null>>;
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
