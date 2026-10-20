import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Role } from '@shulcrm/shared';

// Sign-in and permissions over HTTP, against a throwaway database (set before db.ts loads; see repo.test.ts).
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'crm-auth-test-'));
process.env.CRM_DATA_DIR = TEST_DATA_DIR;

const { app, prepareData } = await import('./app.ts');
const { db } = await import('./db.ts');
const api = request(app);

beforeAll(() => prepareData()); // seeds the demo data; leaves the user table empty

afterAll(() => {
  try {
    db.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

const OWNER = { name: 'Rivka Stern', email: 'owner@shul.test', password: 'correct horse battery' };
const INVITED_PASSWORD = 'bring your own passphrase';

type WithHeaders = { headers: Record<string, string | string[] | undefined> };

/** The Set-Cookie header, which comes typed as one string or as a list depending on the call. */
const setCookies = (res: WithHeaders): string[] => [res.headers['set-cookie'] ?? []].flat();

/** `sid=…` from a response that signed someone in, ready to send back as a Cookie header. */
function cookieOf(res: WithHeaders): string {
  const [cookie] = setCookies(res);
  expect(cookie, 'expected a session cookie').toBeTruthy();
  return cookie.split(';')[0];
}

let ownerCookie = '';

async function signIn(email: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return cookieOf(res);
}

/** Invite someone, accept the invitation, and hand back their user, session cookie and token. */
async function invited(role: Role, email = `${role}@shul.test`, extra: Record<string, unknown> = {}) {
  const sent = await api
    .post('/api/users')
    .set('Cookie', ownerCookie)
    .send({ name: `${role} person`, email, role, ...extra });
  expect(sent.status).toBe(201);
  const token = String(sent.body.link).split('/welcome/')[1];
  const accepted = await api.post(`/api/auth/token/${token}`).send({ password: INVITED_PASSWORD });
  expect(accepted.status).toBe(200);
  return { user: accepted.body.user, cookie: cookieOf(accepted), token, link: String(sent.body.link) };
}

describe('first run', () => {
  it('reports that setup is needed while there are no users', async () => {
    const res = await api.get('/api/auth/session');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: null, needsSetup: true });
  });

  it('creates the owner and sets a session cookie scripts and other sites cannot use', async () => {
    const res = await api.post('/api/auth/setup').send(OWNER);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: OWNER.email, name: OWNER.name, role: 'owner', status: 'active' });
    expect(res.body.needsSetup).toBe(false);
    const [setCookie] = setCookies(res);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/SameSite=Lax/);
    ownerCookie = cookieOf(res);
    expect((await api.get('/api/auth/session').set('Cookie', ownerCookie)).body).toMatchObject({
      needsSetup: false,
      user: { role: 'owner' },
    });
  });

  it('refuses a second setup: the owner already exists', async () => {
    const res = await api.post('/api/auth/setup').send({ name: 'Second', email: 'second@shul.test', password: 'another long one' });
    expect(res.status).toBe(409);
    expect((await api.get('/api/users').set('Cookie', ownerCookie)).body).toHaveLength(1);
  });
});

describe('signing in', () => {
  it('accepts the right password and never echoes it back', async () => {
    const res = await api.post('/api/auth/login').send({ email: OWNER.email, password: OWNER.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: OWNER.email, role: 'owner' });
    expect(JSON.stringify(res.body)).not.toContain(OWNER.password);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const session = await api.get('/api/auth/session').set('Cookie', cookieOf(res));
    expect(JSON.stringify(session.body)).not.toContain(OWNER.password);
    const users = await api.get('/api/users').set('Cookie', ownerCookie);
    expect(JSON.stringify(users.body)).not.toContain(OWNER.password);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');
  });

  it('answers a wrong password and an unknown address the same way', async () => {
    const wrong = await api.post('/api/auth/login').send({ email: OWNER.email, password: 'not the password' });
    const unknown = await api.post('/api/auth/login').send({ email: 'nobody@shul.test', password: OWNER.password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    // The same vague message either way: a different one would tell a guesser which addresses exist.
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(wrong.body.error.message).not.toMatch(/owner@shul\.test|nobody@shul\.test|password is|no such|unknown/i);
  });
});

describe('sessions', () => {
  it('needs the cookie, and drops it on logout', async () => {
    expect((await api.get('/api/families')).status).toBe(401);
    const cookie = await signIn(OWNER.email, OWNER.password);
    expect((await api.get('/api/families').set('Cookie', cookie)).status).toBe(200);
    expect((await api.post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    // The session is gone server-side, so the same cookie value is worthless if it is stolen later.
    expect((await api.get('/api/families').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('permissions', () => {
  const roleCookies: Partial<Record<Role, string>> = {};

  beforeAll(async () => {
    for (const role of ['viewer', 'staff', 'admin'] as const) {
      roleCookies[role] = (await invited(role)).cookie;
    }
    roleCookies.owner = await signIn(OWNER.email, OWNER.password);
  });

  const as = (role: Role) => roleCookies[role] as string;

  it('lets a viewer read records but change nothing', async () => {
    expect((await api.get('/api/families').set('Cookie', as('viewer'))).status).toBe(200);
    const created = await api.post('/api/families').set('Cookie', as('viewer')).send({ name: 'Viewer Family', status: 'active' });
    expect(created.status).toBe(403);
  });

  it('lets staff keep records, but not settings or users', async () => {
    const created = await api.post('/api/families').set('Cookie', as('staff')).send({ name: 'Staff Family', status: 'active' });
    expect(created.status).toBe(201);
    const { org } = (await api.get('/api/settings').set('Cookie', as('staff'))).body;
    expect((await api.put('/api/settings/org').set('Cookie', as('staff')).send(org)).status).toBe(403);
    expect((await api.get('/api/users').set('Cookie', as('staff'))).status).toBe(403);
  });

  it('lets an admin run the shul, but not wipe its data', async () => {
    const { org } = (await api.get('/api/settings').set('Cookie', as('admin'))).body;
    const saved = await api.put('/api/settings/org').set('Cookie', as('admin')).send({ ...org, name: 'Admin Renamed' });
    expect(saved.status).toBe(200);
    expect(saved.body.name).toBe('Admin Renamed');
    expect((await api.get('/api/users').set('Cookie', as('admin'))).status).toBe(200);
    expect((await api.post('/api/reset').set('Cookie', as('admin'))).status).toBe(403);
  });

  it('lets the owner do all of it, resetting included', async () => {
    const { org } = (await api.get('/api/settings').set('Cookie', as('owner'))).body;
    expect((await api.put('/api/settings/org').set('Cookie', as('owner')).send(org)).status).toBe(200);
    expect((await api.get('/api/users').set('Cookie', as('owner'))).status).toBe(200);
    expect((await api.post('/api/families').set('Cookie', as('owner')).send({ name: 'Owner Family', status: 'active' })).status).toBe(201);
    expect((await api.post('/api/reset').set('Cookie', as('owner'))).body).toEqual({ ok: true });
  });
});

describe('invitations', () => {
  it('invites, describes the link, activates the account, and uses the link up', async () => {
    const sent = await api
      .post('/api/users')
      .set('Cookie', ownerCookie)
      .send({ name: 'Yosef Klein', email: 'yosef@shul.test', role: 'staff' });
    expect(sent.status).toBe(201);
    expect(sent.body.user).toMatchObject({ name: 'Yosef Klein', role: 'staff', status: 'invited' });
    const token = String(sent.body.link).split('/welcome/')[1];
    expect(token).toMatch(/^[\w-]{20,}$/);

    const described = await api.get(`/api/auth/token/${token}`);
    expect(described.body).toEqual({ name: 'Yosef Klein', email: 'yosef@shul.test', purpose: 'invite' });

    const accepted = await api.post(`/api/auth/token/${token}`).send({ password: INVITED_PASSWORD });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user).toMatchObject({ email: 'yosef@shul.test', status: 'active' });
    expect((await api.get('/api/families').set('Cookie', cookieOf(accepted))).status).toBe(200);

    // One link, one use: a forwarded or logged invitation cannot be replayed.
    expect((await api.get(`/api/auth/token/${token}`)).status).toBe(403);
    expect((await api.post(`/api/auth/token/${token}`).send({ password: 'yet another one' })).status).toBe(403);
  });

  it('refuses a password shorter than ten characters', async () => {
    const sent = await api
      .post('/api/users')
      .set('Cookie', ownerCookie)
      .send({ name: 'Short Pass', email: 'short@shul.test', role: 'viewer' });
    const token = String(sent.body.link).split('/welcome/')[1];
    const res = await api.post(`/api/auth/token/${token}`).send({ password: 'short123' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('password');
    // The invitation is still usable, so a weak first try does not lock the person out.
    expect((await api.post(`/api/auth/token/${token}`).send({ password: INVITED_PASSWORD })).status).toBe(200);
  });
});

describe('owner safety', () => {
  it('keeps at least one active owner', async () => {
    const owner = (await api.get('/api/auth/session').set('Cookie', ownerCookie)).body.user;
    const demoted = await api.patch(`/api/users/${owner.id}`).set('Cookie', ownerCookie).send({ role: 'admin' });
    expect(demoted.status).toBe(409);
    const disabled = await api.patch(`/api/users/${owner.id}`).set('Cookie', ownerCookie).send({ status: 'disabled' });
    expect(disabled.status).toBe(409);
    expect((await api.get('/api/auth/session').set('Cookie', ownerCookie)).body.user.role).toBe('owner');
  });

  it('does not let an admin change an owner', async () => {
    const owner = (await api.get('/api/auth/session').set('Cookie', ownerCookie)).body.user;
    const admin = await invited('admin', 'admin2@shul.test');
    const res = await api.patch(`/api/users/${owner.id}`).set('Cookie', admin.cookie).send({ role: 'viewer' });
    expect(res.status).toBe(403);
  });

  it('does not let anyone disable their own account', async () => {
    const admin = await invited('admin', 'admin3@shul.test');
    const res = await api.patch(`/api/users/${admin.user.id}`).set('Cookie', admin.cookie).send({ status: 'disabled' });
    expect(res.status).toBe(409);
    expect((await api.get('/api/families').set('Cookie', admin.cookie)).status).toBe(200);
  });
});

describe('disabling a user', () => {
  it('ends their session straight away and stops them signing in', async () => {
    const victim = await invited('staff', 'leaver@shul.test');
    const admin = await invited('admin', 'admin4@shul.test');
    expect((await api.get('/api/families').set('Cookie', victim.cookie)).status).toBe(200);

    const res = await api.patch(`/api/users/${victim.user.id}`).set('Cookie', admin.cookie).send({ status: 'disabled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disabled');

    // Someone who has left should lose access at once, not whenever their cookie expires.
    expect((await api.get('/api/families').set('Cookie', victim.cookie)).status).toBe(401);
    expect((await api.post('/api/auth/login').send({ email: 'leaver@shul.test', password: INVITED_PASSWORD })).status).toBe(401);
  });
});

describe('path spelling cannot sidestep a permission rule', () => {
  it('does not let staff reset the data through a differently cased /API/RESET', async () => {
    const staff = await invited('staff', 'caseguard@shul.test');
    const family = await api.post('/api/families').set('Cookie', staff.cookie).send({ name: 'Case Guard Family', status: 'active' });
    expect(family.status).toBe(201);

    // The permission rules are written in lowercase, and Express used to match routes case-insensitively:
    // a mis-cased path reached the reset route while matching no rule, so staff could have wiped the data.
    // /api/RESET is now held by the rule table (403) and /API/RESET no longer reaches the app (404).
    // Trailing slashes and percent-encoding are spellings of the same path too.
    for (const path of ['/API/RESET', '/api/RESET', '/Api/Reset', '/api/reset/', '/api/%72eset']) {
      const res = await api.post(path).set('Cookie', staff.cookie);
      expect(res.status, `POST ${path} must be refused, not ${res.status} ${JSON.stringify(res.body)}`).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    }
    expect((await api.post('/api/RESET').set('Cookie', staff.cookie)).status).toBe(403);

    // A reset reseeds the demo data, so this record surviving proves no reset happened.
    expect((await api.get(`/api/families/${family.body.id}`).set('Cookie', staff.cookie)).body.name).toBe('Case Guard Family');
  });

  it('refuses a path no rule matches, even for an owner', async () => {
    const cookie = await signIn(OWNER.email, OWNER.password);
    expect((await api.get('/api/families').set('Cookie', cookie)).status).toBe(200);
    // The same request with a mis-cased prefix must never be served: either the mount does not match
    // it (404) or it reaches the access check and no rule matches, which denies by default (403).
    // What matters is that it is refused rather than waved through as an ordinary read.
    const res = await api.get('/API/families').set('Cookie', cookie);
    expect([403, 404], `GET /API/families answered ${res.status}`).toContain(res.status);
    expect(res.body.families).toBeUndefined();
    expect(Array.isArray(res.body)).toBe(false);
  });
});

describe('audit log', () => {
  it('records who signed in, who invited whom, and who added a record', async () => {
    const cookie = await signIn(OWNER.email, OWNER.password);
    await api.post('/api/users').set('Cookie', cookie).send({ name: 'Audited Invitee', email: 'audited@shul.test', role: 'viewer' });
    const family = await api.post('/api/families').set('Cookie', cookie).send({ name: 'Audited Family', status: 'active' });
    expect(family.status).toBe(201);

    const entries = (await api.get('/api/audit').set('Cookie', cookie).query({ limit: 50 })).body as Array<{
      action: string;
      userName?: string;
      entity?: string;
      summary?: string;
    }>;
    const login = entries.find((e) => e.action === 'login');
    const invite = entries.find((e) => e.action === 'user.invited');
    const create = entries.find((e) => e.action === 'create' && e.entity === 'families' && e.summary === 'Audited Family');
    expect(login?.userName).toBe(OWNER.name);
    expect(invite?.userName).toBe(OWNER.name);
    expect(invite?.summary).toBe('Audited Invitee as viewer');
    expect(create?.userName).toBe(OWNER.name);
  });
});
