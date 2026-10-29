import { newId, type Role, type User, type UserStatus } from '@shulcrm/shared';
import { db } from './db.ts';
import { Conflict } from './settings.ts';
import type { LoginOrganization } from '@shulcrm/shared';

// ---------------------------------------------------------------------------
// One login (users.email) can belong to many shuls via org_memberships.
// ---------------------------------------------------------------------------

export interface MembershipRow {
  id: string;
  userId: string;
  orgId: string;
  role: Role;
  memberId?: string;
  status: UserStatus;
  name: string;
  createdAt: string;
}

type AccountRow = {
  id: string;
  email: string;
  passwordHash?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
};

async function accountById(id: string): Promise<AccountRow | undefined> {
  return (await db.prepare('SELECT id, email, passwordHash, createdAt, lastLoginAt FROM users WHERE id = ?').get(id)) as
    | AccountRow
    | undefined;
}

export async function accountByEmail(email: string): Promise<AccountRow | undefined> {
  return (await db
    .prepare('SELECT id, email, passwordHash, createdAt, lastLoginAt FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim())) as AccountRow | undefined;
}

export async function membership(userId: string, orgId: string): Promise<MembershipRow | undefined> {
  const row = (await db.prepare('SELECT * FROM org_memberships WHERE userId = ? AND orgId = ?').get(userId, orgId)) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  return {
    id: String(row.id),
    userId: String(row.userId),
    orgId: String(row.orgId),
    role: row.role as Role,
    memberId: row.memberId ? String(row.memberId) : undefined,
    status: row.status as UserStatus,
    name: String(row.name),
    createdAt: String(row.createdAt),
  };
}

export function toSessionUser(account: AccountRow, m: MembershipRow): User {
  return {
    id: account.id,
    email: account.email,
    orgId: m.orgId,
    name: m.name,
    role: m.role,
    memberId: m.memberId,
    status: m.status,
    createdAt: m.createdAt,
    lastLoginAt: account.lastLoginAt ?? undefined,
  };
}

export async function userInOrg(userId: string, orgId: string): Promise<User | undefined> {
  const account = await accountById(userId);
  const m = await membership(userId, orgId);
  if (!account || !m) return undefined;
  return toSessionUser(account, m);
}

export async function activeMemberships(userId: string): Promise<MembershipRow[]> {
  return (
    (await db
      .prepare("SELECT * FROM org_memberships WHERE userId = ? AND status = 'active' ORDER BY createdAt")
      .all(userId)) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    userId: String(row.userId),
    orgId: String(row.orgId),
    role: row.role as Role,
    memberId: row.memberId ? String(row.memberId) : undefined,
    status: row.status as UserStatus,
    name: String(row.name),
    createdAt: String(row.createdAt),
  }));
}

export async function loginOrganizationsForEmail(email: string): Promise<LoginOrganization[]> {
  return (await db
    .prepare(
      `SELECT o.slug, o.name FROM users u
       JOIN org_memberships m ON m.userId = u.id
       JOIN organizations o ON o.id = m.orgId
       WHERE u.email = ? COLLATE NOCASE AND m.status = 'active'
       ORDER BY o.name COLLATE NOCASE`,
    )
    .all(email.trim())) as unknown as LoginOrganization[];
}

export async function loginOrganizationsForUser(userId: string): Promise<LoginOrganization[]> {
  return (await db
    .prepare(
      `SELECT o.slug, o.name FROM org_memberships m
       JOIN organizations o ON o.id = m.orgId
       WHERE m.userId = ? AND m.status = 'active'
       ORDER BY o.name COLLATE NOCASE`,
    )
    .all(userId)) as unknown as LoginOrganization[];
}

export async function listUsersInOrg(orgId: string): Promise<User[]> {
  const rows = (await db
    .prepare(
      `SELECT u.id AS userId, u.email, u.lastLoginAt, m.orgId, m.role, m.memberId, m.status, m.name, m.createdAt
       FROM org_memberships m
       JOIN users u ON u.id = m.userId
       WHERE m.orgId = ?
       ORDER BY m.name COLLATE NOCASE`,
    )
    .all(orgId)) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.userId),
    email: String(r.email),
    orgId: String(r.orgId),
    name: String(r.name),
    role: r.role as Role,
    memberId: r.memberId ? String(r.memberId) : undefined,
    status: r.status as UserStatus,
    createdAt: String(r.createdAt),
    lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : undefined,
  }));
}

export async function activeOwnersInOrg(orgId: string): Promise<number> {
  return (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM org_memberships WHERE orgId = ? AND role = 'owner' AND status = 'active'")
      .get(orgId)) as { n: number }
  ).n;
}

export async function insertMembership(input: {
  userId: string;
  orgId: string;
  name: string;
  role: Role;
  memberId?: string;
  status: UserStatus;
}): Promise<MembershipRow> {
  const id = newId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO org_memberships (id, userId, orgId, role, memberId, status, name, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, input.userId, input.orgId, input.role, input.memberId ?? null, input.status, input.name.trim(), createdAt);
  return (await membership(input.userId, input.orgId)) as MembershipRow;
}

export async function updateMembership(
  userId: string,
  orgId: string,
  patch: { role?: Role; status?: UserStatus; name?: string; memberId?: string | null },
): Promise<MembershipRow> {
  const sets: string[] = [];
  const params: Array<string | null> = [];
  for (const key of ['role', 'status', 'name', 'memberId'] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key] ?? null);
    }
  }
  if (sets.length > 0) {
    await db.prepare(`UPDATE org_memberships SET ${sets.join(', ')} WHERE userId = ? AND orgId = ?`).run(...params, userId, orgId);
  }
  return (await membership(userId, orgId)) as MembershipRow;
}

export async function createAccountWithMembership(input: {
  email: string;
  name: string;
  orgId: string;
  role: Role;
  memberId?: string;
  status: UserStatus;
  passwordHash?: string;
}): Promise<User> {
  const id = newId();
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO users (id, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(
    id,
    input.email.trim(),
    input.passwordHash ?? null,
    createdAt,
  );
  await insertMembership({
    userId: id,
    orgId: input.orgId,
    name: input.name,
    role: input.role,
    memberId: input.memberId,
    status: input.status,
  });
  return (await userInOrg(id, input.orgId)) as User;
}

/** Add this shul to an existing login, or create a new account. */
export async function addUserToOrg(input: {
  email: string;
  name: string;
  orgId: string;
  role: Role;
  memberId?: string;
  status: UserStatus;
  passwordHash?: string;
}): Promise<User> {
  const existing = await accountByEmail(input.email);
  if (existing) {
    if (await membership(existing.id, input.orgId)) throw new Conflict('This person already has access to this shul');
    await insertMembership({
      userId: existing.id,
      orgId: input.orgId,
      name: input.name,
      role: input.role,
      memberId: input.memberId,
      status: input.status,
    });
    return (await userInOrg(existing.id, input.orgId)) as User;
  }
  return createAccountWithMembership(input);
}

export async function membershipsInOrg(orgId: string): Promise<number> {
  return ((await db.prepare('SELECT COUNT(*) AS n FROM org_memberships WHERE orgId = ?').get(orgId)) as { n: number }).n;
}
