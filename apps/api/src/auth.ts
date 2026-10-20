import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { Request, Response } from 'express';
import { canAssignRole, newId, type Role, type User, type UserStatus } from '@shulcrm/shared';
import { db } from './db.ts';
import { BadRequest, Conflict } from './settings.ts';
import { NotFound } from './repo.ts';
import { log } from './log.ts';

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
    // Same work either way, so a missing user can't be told apart by timing.
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

// --- Users -------------------------------------------------------------------

type UserRow = User & { passwordHash?: string | null };

function toUser(row: Record<string, unknown> | undefined): UserRow | undefined {
  if (!row) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === null ? undefined : v;
  return out as unknown as UserRow;
}

/** A user as the API shows it: never with the password hash. */
const publicUser = (u: UserRow): User => {
  const out = { ...u };
  delete out.passwordHash;
  return out;
};

export const userCount = () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;

export function listUsers(): User[] {
  return (db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as Array<Record<string, unknown>>).map(
    (r) => publicUser(toUser(r) as UserRow),
  );
}

export function getUser(id: string): User | undefined {
  const u = toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined);
  return u ? publicUser(u) : undefined;
}

const userByEmail = (email: string) =>
  toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as Record<string, unknown> | undefined);

function insertUser(u: { email: string; name: string; role: Role; memberId?: string; status: UserStatus; passwordHash?: string }): User {
  if (userByEmail(u.email)) throw new Conflict('Someone already has that email address');
  const id = newId();
  db.prepare(
    'INSERT INTO users (id, email, name, role, memberId, passwordHash, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, u.email.trim(), u.name.trim(), u.role, u.memberId ?? null, u.passwordHash ?? null, u.status, new Date().toISOString());
  return getUser(id) as User;
}

const activeOwners = () =>
  (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND status = 'active'").get() as { n: number }).n;

/** Change a user's role or status, keeping at least one active owner and the owner rules. */
export function updateUser(actor: User, id: string, patch: { role?: Role; status?: UserStatus; name?: string; memberId?: string | null }): User {
  const target = getUser(id);
  if (!target) throw new NotFound('No such user');
  if (target.role === 'owner' && actor.role !== 'owner') throw new AuthError(403, 'Only an owner can change an owner');
  if (patch.role && !canAssignRole(actor.role, patch.role)) throw new AuthError(403, 'Only an owner can make someone an owner');
  const losingOwner =
    target.role === 'owner' && target.status === 'active' && ((patch.role && patch.role !== 'owner') || patch.status === 'disabled');
  if (losingOwner && activeOwners() <= 1) throw new Conflict('Keep at least one active owner');
  if (id === actor.id && patch.status === 'disabled') throw new Conflict('You cannot disable your own account');
  const sets: string[] = [];
  const params: Array<string | null> = [];
  for (const key of ['role', 'status', 'name', 'memberId'] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key] ?? null);
    }
  }
  if (sets.length > 0) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  // A disabled user, or one whose role changed, signs in again.
  if (patch.status === 'disabled' || (patch.role && patch.role !== target.role)) endSessionsFor(id);
  return getUser(id) as User;
}

// --- Sessions ----------------------------------------------------------------

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const IDLE_DAYS = 14;
const DAY_MS = 86_400_000;

export function startSession(userId: string): string {
  const token = newToken();
  const now = new Date();
  db.prepare('INSERT INTO sessions (tokenHash, userId, createdAt, lastSeenAt, expiresAt) VALUES (?, ?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    now.toISOString(),
    now.toISOString(),
    new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
  );
  db.prepare('UPDATE users SET lastLoginAt = ? WHERE id = ?').run(now.toISOString(), userId);
  return token;
}

/** The signed-in user for a session token, or undefined (expired, idle too long, or disabled). */
export function sessionUser(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const row = db.prepare('SELECT * FROM sessions WHERE tokenHash = ?').get(hashToken(token)) as
    | { tokenHash: string; userId: string; lastSeenAt: string; expiresAt: string }
    | undefined;
  if (!row) return undefined;
  const now = Date.now();
  if (Date.parse(row.expiresAt) < now || Date.parse(row.lastSeenAt) + IDLE_DAYS * DAY_MS < now) {
    db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(row.tokenHash);
    return undefined;
  }
  const user = getUser(row.userId);
  if (!user || user.status !== 'active') return undefined;
  // Note activity at most every few minutes.
  if (now - Date.parse(row.lastSeenAt) > 5 * 60_000) {
    db.prepare('UPDATE sessions SET lastSeenAt = ? WHERE tokenHash = ?').run(new Date(now).toISOString(), row.tokenHash);
  }
  return user;
}

export function endSession(token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token));
}

export function endSessionsFor(userId: string, exceptToken?: string): void {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE userId = ? AND tokenHash != ?').run(userId, hashToken(exceptToken));
  } else {
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
  }
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** httpOnly (scripts can't read it), SameSite=Lax (other sites can't post with it), Secure over HTTPS. */
export function setSessionCookie(req: Request, res: Response, token: string | null): void {
  const secure = req.secure || process.env.COOKIE_SECURE === '1';
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', token ? `Max-Age=${SESSION_DAYS * 86_400}` : 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}; ${attrs.join('; ')}`);
}

// --- Sign in -----------------------------------------------------------------

export async function login(email: string, password: string): Promise<User> {
  const user = userByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || user.status !== 'active') throw new AuthError(401, 'That email and password don’t match');
  return publicUser(user);
}

export async function changePassword(user: User, current: string, next: string): Promise<void> {
  const row = userByEmail(user.email);
  if (!row || !(await verifyPassword(current, row.passwordHash))) throw new BadRequest('Your current password is not right');
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(await hashPassword(next), user.id);
}

// --- First run ---------------------------------------------------------------

let setupCode: string | undefined;

/** With no users yet, a one-time code for setting up from another computer (shown in the log). */
export function prepareSetup(): void {
  if (userCount() > 0) return;
  setupCode = randomBytes(5).toString('hex').toUpperCase();
  log.warn({ area: 'auth' }, `No users yet. Open the app to create the owner. From another computer, use setup code ${setupCode}`);
}

/** Create the owner from OWNER_EMAIL / OWNER_PASSWORD / OWNER_NAME when there are no users (e.g. in Docker). */
export async function ownerFromEnv(): Promise<void> {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password || userCount() > 0) return;
  insertUser({ email, name: process.env.OWNER_NAME ?? 'Owner', role: 'owner', status: 'active', passwordHash: await hashPassword(password) });
  log.info({ area: 'auth' }, 'owner created from OWNER_EMAIL');
}

/**
 * Setting up from this very machine needs no code; from anywhere else it does. Behind a proxy
 * every visitor arrives from the proxy, which is usually loopback, so "local" stops meaning
 * "sitting at the server" and the code is always required. (Docker instead sets OWNER_EMAIL.)
 */
export const setupRequiresCode = (req: Request) => Boolean(process.env.TRUST_PROXY) || !isLoopback(req);

function isLoopback(req: Request): boolean {
  // The real TCP peer, not X-Forwarded-For, which anyone can set.
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export async function setupOwner(req: Request, input: { name: string; email: string; password: string; code?: string }): Promise<User> {
  if (userCount() > 0) throw new Conflict('Setup is already done; sign in instead');
  if (setupRequiresCode(req) && (!setupCode || input.code?.trim().toUpperCase() !== setupCode)) {
    throw new AuthError(403, 'Enter the setup code shown in the server’s log');
  }
  const user = insertUser({ ...input, role: 'owner', status: 'active', passwordHash: await hashPassword(input.password) });
  setupCode = undefined;
  return user;
}

// --- Invitations and reset links -----------------------------------------------

const INVITE_DAYS = 7;
const RESET_DAYS = 2;

function issueToken(userId: string, purpose: 'invite' | 'reset', days: number): string {
  db.prepare('DELETE FROM userTokens WHERE userId = ? AND purpose = ?').run(userId, purpose);
  const token = newToken();
  const now = Date.now();
  db.prepare('INSERT INTO userTokens (tokenHash, userId, purpose, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    purpose,
    new Date(now).toISOString(),
    new Date(now + days * DAY_MS).toISOString(),
  );
  return token;
}

export function invite(actor: User, input: { name: string; email: string; role: Role; memberId?: string }): { user: User; token: string } {
  if (!canAssignRole(actor.role, input.role)) throw new AuthError(403, 'Only an owner can invite an owner');
  if (input.role === 'member' && !input.memberId) throw new BadRequest('Choose which member this login is for');
  const user = insertUser({ ...input, memberId: input.role === 'member' ? input.memberId : undefined, status: 'invited' });
  return { user, token: issueToken(user.id, 'invite', INVITE_DAYS) };
}

/** A new link for an invited user, or a password-reset link for an active one. */
export function newLinkFor(actor: User, id: string): { user: User; token: string; purpose: 'invite' | 'reset' } {
  const user = getUser(id);
  if (!user) throw new NotFound('No such user');
  if (user.role === 'owner' && actor.role !== 'owner') throw new AuthError(403, 'Only an owner can reset an owner');
  if (user.status === 'disabled') throw new Conflict('This user is disabled; enable them first');
  const purpose = user.status === 'invited' ? 'invite' : 'reset';
  return { user, token: issueToken(id, purpose, purpose === 'invite' ? INVITE_DAYS : RESET_DAYS), purpose };
}

function tokenRow(token: string) {
  const row = db.prepare('SELECT * FROM userTokens WHERE tokenHash = ?').get(hashToken(token)) as
    | { tokenHash: string; userId: string; purpose: 'invite' | 'reset'; expiresAt: string }
    | undefined;
  if (!row || Date.parse(row.expiresAt) < Date.now()) throw new AuthError(403, 'This link has expired or was already used; ask for a new one');
  return row;
}

/** What an invitation or reset link is for, so the page can greet the person. */
export function describeToken(token: string): { name: string; email: string; purpose: 'invite' | 'reset' } {
  const row = tokenRow(token);
  const user = getUser(row.userId);
  if (!user || user.status === 'disabled') throw new AuthError(403, 'This link can no longer be used');
  return { name: user.name, email: user.email, purpose: row.purpose };
}

/** Set the password from an invitation or reset link; the link is then used up. */
export async function useToken(token: string, password: string): Promise<User> {
  const row = tokenRow(token);
  const user = getUser(row.userId);
  if (!user || user.status === 'disabled') throw new AuthError(403, 'This link can no longer be used');
  // Hashing takes a moment, and an admin could disable the account in the meantime, so the write
  // itself refuses a disabled account rather than trusting the check above.
  const hash = await hashPassword(password);
  const changed = db
    .prepare("UPDATE users SET passwordHash = ?, status = 'active' WHERE id = ? AND status != 'disabled'")
    .run(hash, user.id).changes;
  if (changed === 0) throw new AuthError(403, 'This link can no longer be used');
  db.prepare('DELETE FROM userTokens WHERE tokenHash = ?').run(row.tokenHash);
  // A reset signs out every other device.
  endSessionsFor(user.id);
  return getUser(user.id) as User;
}
