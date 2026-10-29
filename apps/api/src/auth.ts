import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { Request, Response } from 'express';
import { canAssignRole, type Role, type User, type UserStatus } from '@shulcrm/shared';
import { db } from './db.ts';
import { BadRequest, Conflict } from './settings.ts';
import { NotFound } from './repo.ts';
import { log } from './log.ts';
import { resolveOrgId, soleOrgId } from './tenant.ts';
import { getOrganizationBySlug, loginTargets, createOrganizationRow, usersInOrganization } from './organizations.ts';
import {
  accountByEmail,
  activeMemberships,
  activeOwnersInOrg,
  addUserToOrg,
  createAccountWithMembership,
  listUsersInOrg,
  loginOrganizationsForUser,
  updateMembership,
  userInOrg,
} from './memberships.ts';
import { createOrganizationSchema, type CreateOrganizationInput, type LoginOrganization } from '@shulcrm/shared';
import { runWithOrg } from './context.ts';

// ---------------------------------------------------------------------------
// Sign-in: users, scrypt passwords, sessions in an httpOnly cookie, invitations
// and reset links, and first-run setup. Tokens are random 32 bytes; only their
// SHA-256 is stored.
// ---------------------------------------------------------------------------

/** Thrown to answer 401 (not signed in) or 403 (signed in, not allowed). */
export class AuthError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/** Same email in more than one shul: the client must send `orgSlug` on the next attempt. */
export class ChooseOrgError extends Error {
  readonly status = 409;
  readonly organizations: LoginOrganization[];

  constructor(organizations: LoginOrganization[]) {
    super('Choose which community to sign in to.');
    this.name = 'ChooseOrgError';
    this.organizations = organizations;
  }
}

// --- Passwords ---------------------------------------------------------------

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64 };

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash" (base64url), so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLength } = SCRYPT;
  const key = await scrypt(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: 128 * N * r * 2 });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await hashPassword(password);
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const N = Number(n);
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N,
    r: Number(r),
    p: Number(p),
    maxmem: 128 * N * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// --- Tokens ------------------------------------------------------------------

const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// --- Users (account + org_memberships) ---------------------------------------

export async function userCount(): Promise<number> {
  return ((await db.prepare('SELECT COUNT(*) AS n FROM users').get()) as { n: number }).n;
}

export const listUsers = listUsersInOrg;

export async function getUser(id: string, orgId: string): Promise<User | undefined> {
  return userInOrg(id, orgId);
}

async function hasHostMembership(userId: string): Promise<boolean> {
  return Boolean(
    await db.prepare("SELECT 1 FROM org_memberships WHERE userId = ? AND role = 'host' LIMIT 1").get(userId),
  );
}

/** Change a user's role or status in this shul, keeping at least one active owner and the owner rules. */
export async function updateUser(
  actor: User,
  id: string,
  patch: { role?: Role; status?: UserStatus; name?: string; memberId?: string | null },
): Promise<User> {
  const target = await getUser(id, actor.orgId);
  if (!target) throw new NotFound('No such user');
  if (target.role === 'owner' && actor.role !== 'owner') throw new AuthError(403, 'Only an owner can change an owner');
  if (patch.role && !canAssignRole(actor.role, patch.role)) throw new AuthError(403, 'Only an owner can make someone an owner');
  const losingOwner =
    target.role === 'owner' && target.status === 'active' && ((patch.role && patch.role !== 'owner') || patch.status === 'disabled');
  if (losingOwner && (await activeOwnersInOrg(actor.orgId)) <= 1) throw new Conflict('Keep at least one active owner');
  if (id === actor.id && patch.status === 'disabled') throw new Conflict('You cannot disable your own account');
  await updateMembership(id, actor.orgId, patch);
  if (patch.status === 'disabled' || (patch.role && patch.role !== target.role)) await endSessionsForOrg(id, actor.orgId);
  return (await getUser(id, actor.orgId)) as User;
}

// --- Sessions ----------------------------------------------------------------

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const IDLE_DAYS = 14;
const DAY_MS = 86_400_000;

export async function startSession(userId: string, orgId: string): Promise<string> {
  const user = await userInOrg(userId, orgId);
  if (!user) throw new NotFound('No such user');
  const token = newToken();
  const now = new Date();
  await db
    .prepare(
      'INSERT INTO sessions (tokenHash, userId, orgId, createdAt, lastSeenAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      hashToken(token),
      userId,
      orgId,
      now.toISOString(),
      now.toISOString(),
      new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
    );
  await db.prepare('UPDATE users SET lastLoginAt = ? WHERE id = ?').run(now.toISOString(), userId);
  return token;
}

/** The signed-in user for a session token, or undefined (expired, idle too long, or disabled). */
export async function sessionUser(token: string | undefined): Promise<User | undefined> {
  if (!token) return undefined;
  const row = (await db.prepare('SELECT * FROM sessions WHERE tokenHash = ?').get(hashToken(token))) as
    | { tokenHash: string; userId: string; orgId: string; lastSeenAt: string; expiresAt: string }
    | undefined;
  if (!row) return undefined;
  const now = Date.now();
  if (Date.parse(row.expiresAt) < now || Date.parse(row.lastSeenAt) + IDLE_DAYS * DAY_MS < now) {
    await db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(row.tokenHash);
    return undefined;
  }
  const user = await userInOrg(row.userId, row.orgId);
  if (!user || user.status !== 'active') return undefined;
  if (now - Date.parse(row.lastSeenAt) > 5 * 60_000) {
    await db.prepare('UPDATE sessions SET lastSeenAt = ? WHERE tokenHash = ?').run(new Date(now).toISOString(), row.tokenHash);
  }
  return user;
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token));
}

export async function endSessionsFor(userId: string, exceptToken?: string): Promise<void> {
  if (exceptToken) {
    await db.prepare('DELETE FROM sessions WHERE userId = ? AND tokenHash != ?').run(userId, hashToken(exceptToken));
  } else {
    await db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
  }
}

export async function endSessionsForOrg(userId: string, orgId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE userId = ? AND orgId = ?').run(userId, orgId);
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** httpOnly session cookie. Lax for same-origin; None+Secure when the UI is on another site (GitHub Pages). */
export function setSessionCookie(req: Request, res: Response, token: string | null): void {
  const secure = req.secure || process.env.COOKIE_SECURE === '1';
  const sameSite =
    process.env.COOKIE_SAMESITE === 'none' ? 'None' : process.env.COOKIE_SAMESITE === 'strict' ? 'Strict' : 'Lax';
  const attrs = ['Path=/', 'HttpOnly', `SameSite=${sameSite}`, token ? `Max-Age=${SESSION_DAYS * 86_400}` : 'Max-Age=0'];
  if (secure || sameSite === 'None') attrs.push('Secure');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}; ${attrs.join('; ')}`);
}

// --- Sign in -----------------------------------------------------------------

export async function login(email: string, password: string, orgSlug?: string): Promise<User> {
  const account = await accountByEmail(email);
  const ok = await verifyPassword(password, account?.passwordHash);
  if (!account || !ok) throw new AuthError(401, 'That email and password don’t match');

  if (orgSlug) {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) throw new AuthError(401, 'That email and password don’t match');
    const user = await userInOrg(account.id, org.id);
    if (!user || user.status !== 'active') throw new AuthError(401, 'That email and password don’t match');
    return user;
  }

  const active = await activeMemberships(account.id);
  if (active.length > 1) throw new ChooseOrgError(await loginTargets(email));
  if (active.length === 0) throw new AuthError(401, 'That email and password don’t match');
  return (await userInOrg(account.id, active[0].orgId)) as User;
}

/** Signed-in user switches to another shul they belong to (same cookie, new org context). */
export async function switchOrganization(token: string | undefined, orgSlug: string): Promise<User> {
  if (!token) throw new AuthError(401, 'Please sign in');
  const hash = hashToken(token);
  const row = (await db.prepare('SELECT userId, orgId FROM sessions WHERE tokenHash = ?').get(hash)) as
    | { userId: string; orgId: string }
    | undefined;
  if (!row) throw new AuthError(401, 'Please sign in');
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) throw new NotFound('No such community');
  const user = await userInOrg(row.userId, org.id);
  if (!user || user.status !== 'active') throw new AuthError(403, 'You do not have access to that community');
  await db.prepare('UPDATE sessions SET orgId = ? WHERE tokenHash = ?').run(org.id, hash);
  return user;
}

export async function membershipsForSession(token: string | undefined): Promise<LoginOrganization[]> {
  if (!token) return [];
  const row = (await db.prepare('SELECT userId FROM sessions WHERE tokenHash = ?').get(hashToken(token))) as
    | { userId: string }
    | undefined;
  if (!row) return [];
  return loginOrganizationsForUser(row.userId);
}

export async function changePassword(user: User, current: string, next: string): Promise<void> {
  const account = await accountByEmail(user.email);
  if (!account || !(await verifyPassword(current, account.passwordHash))) throw new BadRequest('Your current password is not right');
  await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(await hashPassword(next), user.id);
}

// --- First run ---------------------------------------------------------------

let setupCode: string | undefined;

/** With no users yet, a one-time code for setting up from another computer (shown in the log). */
export async function prepareSetup(): Promise<void> {
  if ((await userCount()) > 0) return;
  setupCode = randomBytes(5).toString('hex').toUpperCase();
  log.warn({ area: 'auth' }, `No users yet. Open the app to create the owner. From another computer, use setup code ${setupCode}`);
}

/** Create the owner from OWNER_EMAIL / OWNER_PASSWORD / OWNER_NAME when there are no users (e.g. in Docker). */
export async function ownerFromEnv(): Promise<void> {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password || (await userCount()) > 0) return;
  const orgId = resolveOrgId();
  await createAccountWithMembership({
    orgId,
    email,
    name: process.env.OWNER_NAME ?? 'Owner',
    role: 'owner',
    status: 'active',
    passwordHash: await hashPassword(password),
  });
  log.info({ area: 'auth' }, 'owner created from OWNER_EMAIL');
}

/** Platform operator who can create new shuls on this server (optional env at first boot). */
export async function hostFromEnv(): Promise<void> {
  const email = process.env.HOST_EMAIL;
  const password = process.env.HOST_PASSWORD;
  if (!email || !password) return;
  const existing = await accountByEmail(email);
  if (existing && (await hasHostMembership(existing.id))) return;
  const orgId = resolveOrgId();
  if (existing) {
    await addUserToOrg({
      orgId,
      email,
      name: process.env.HOST_NAME ?? 'Host',
      role: 'host',
      status: 'active',
    });
    if (!existing.passwordHash) {
      await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(await hashPassword(password), existing.id);
    }
  } else {
    await createAccountWithMembership({
      orgId,
      email,
      name: process.env.HOST_NAME ?? 'Host',
      role: 'host',
      status: 'active',
      passwordHash: await hashPassword(password),
    });
  }
  log.info({ area: 'auth' }, 'host user created from HOST_EMAIL');
}

export async function provisionOrganization(input: CreateOrganizationInput) {
  const parsed = createOrganizationSchema.parse(input);
  const org = await createOrganizationRow(parsed.name, parsed.slug);
  if (parsed.owner) {
    if ((await usersInOrganization(org.id)) > 0) throw new Conflict('This shul already has users');
    const passwordHash = await hashPassword(parsed.owner.password);
    await runWithOrg(org.id, async () =>
      addUserToOrg({
        orgId: org.id,
        email: parsed.owner!.email,
        name: parsed.owner!.name,
        role: 'owner',
        status: 'active',
        passwordHash,
      }),
    );
  }
  return org;
}

export const setupRequiresCode = (req: Request) => Boolean(process.env.TRUST_PROXY) || !isLoopback(req);

function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export async function setupOwner(req: Request, input: { name: string; email: string; password: string; code?: string }): Promise<User> {
  if ((await userCount()) > 0) throw new Conflict('Setup is already done; sign in instead');
  if (setupRequiresCode(req) && (!setupCode || input.code?.trim().toUpperCase() !== setupCode)) {
    throw new AuthError(403, 'Enter the setup code shown in the server’s log');
  }
  const orgId = soleOrgId() ?? resolveOrgId();
  const user = await createAccountWithMembership({
    orgId,
    email: input.email,
    name: input.name,
    role: 'owner',
    status: 'active',
    passwordHash: await hashPassword(input.password),
  });
  setupCode = undefined;
  return user;
}

// --- Invitations and reset links -----------------------------------------------

const INVITE_DAYS = 7;
const RESET_DAYS = 2;

async function issueToken(userId: string, orgId: string, purpose: 'invite' | 'reset', days: number): Promise<string> {
  await db.prepare('DELETE FROM userTokens WHERE userId = ? AND orgId = ? AND purpose = ?').run(userId, orgId, purpose);
  const token = newToken();
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO userTokens (tokenHash, userId, orgId, purpose, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      hashToken(token),
      userId,
      orgId,
      purpose,
      new Date(now).toISOString(),
      new Date(now + days * DAY_MS).toISOString(),
    );
  return token;
}

export async function invite(
  actor: User,
  input: { name: string; email: string; role: Role; memberId?: string },
): Promise<{ user: User; token: string }> {
  if (!canAssignRole(actor.role, input.role)) throw new AuthError(403, 'Only an owner can invite an owner');
  if (input.role === 'member' && !input.memberId) throw new BadRequest('Choose which member this login is for');
  if (input.role === 'member' && input.memberId) {
    const member = (await db.prepare('SELECT orgId FROM members WHERE id = ?').get(input.memberId)) as
      | { orgId: string }
      | undefined;
    if (!member || member.orgId !== actor.orgId) throw new BadRequest('Choose a member from this shul');
  }
  const user = await addUserToOrg({
    orgId: actor.orgId,
    email: input.email,
    name: input.name,
    role: input.role,
    memberId: input.role === 'member' ? input.memberId : undefined,
    status: 'invited',
  });
  return { user, token: await issueToken(user.id, actor.orgId, 'invite', INVITE_DAYS) };
}

/** A new link for an invited user, or a password-reset link for an active one. */
export async function newLinkFor(actor: User, id: string): Promise<{ user: User; token: string; purpose: 'invite' | 'reset' }> {
  const user = await getUser(id, actor.orgId);
  if (!user) throw new NotFound('No such user');
  if (user.role === 'owner' && actor.role !== 'owner') throw new AuthError(403, 'Only an owner can reset an owner');
  if (user.status === 'disabled') throw new Conflict('This user is disabled; enable them first');
  const purpose = user.status === 'invited' ? 'invite' : 'reset';
  return {
    user,
    token: await issueToken(id, actor.orgId, purpose, purpose === 'invite' ? INVITE_DAYS : RESET_DAYS),
    purpose,
  };
}

async function tokenOrgId(row: { userId: string; orgId?: string | null }): Promise<string> {
  if (row.orgId) return row.orgId;
  const fallback = (await db.prepare('SELECT orgId FROM org_memberships WHERE userId = ? LIMIT 1').get(row.userId)) as
    | { orgId: string }
    | undefined;
  if (!fallback) throw new AuthError(403, 'This link can no longer be used');
  return fallback.orgId;
}

async function tokenRow(token: string) {
  const row = (await db.prepare('SELECT * FROM userTokens WHERE tokenHash = ?').get(hashToken(token))) as
    | { tokenHash: string; userId: string; orgId?: string | null; purpose: 'invite' | 'reset'; expiresAt: string }
    | undefined;
  if (!row || Date.parse(row.expiresAt) < Date.now()) throw new AuthError(403, 'This link has expired or was already used; ask for a new one');
  return { ...row, orgId: await tokenOrgId(row) };
}

/** What an invitation or reset link is for, so the page can greet the person. */
export async function describeToken(token: string): Promise<{ name: string; email: string; purpose: 'invite' | 'reset' }> {
  const row = await tokenRow(token);
  const user = await userInOrg(row.userId, row.orgId);
  if (!user || user.status === 'disabled') throw new AuthError(403, 'This link can no longer be used');
  return { name: user.name, email: user.email, purpose: row.purpose };
}

/** Set the password from an invitation or reset link; the link is then used up. */
export async function useToken(token: string, password: string): Promise<User> {
  const row = await tokenRow(token);
  const user = await userInOrg(row.userId, row.orgId);
  if (!user || user.status === 'disabled') throw new AuthError(403, 'This link can no longer be used');
  const hash = await hashPassword(password);
  const account = await accountByEmail(user.email);
  if (!account) throw new AuthError(403, 'This link can no longer be used');
  await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hash, account.id);
  if (user.status === 'invited') {
    const changed = (
      await db
        .prepare("UPDATE org_memberships SET status = 'active' WHERE userId = ? AND orgId = ? AND status = 'invited'")
        .run(account.id, row.orgId)
    ).changes;
    if (changed === 0) throw new AuthError(403, 'This link can no longer be used');
  }
  await db.prepare('DELETE FROM userTokens WHERE tokenHash = ?').run(row.tokenHash);
  await endSessionsFor(account.id);
  return (await userInOrg(account.id, row.orgId)) as User;
}
