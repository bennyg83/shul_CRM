import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import request from 'supertest';
import type { AuditEntry, Role } from '@shulcrm/shared';

// The member portal over HTTP, against a throwaway database (set before db.ts loads; see repo.test.ts).
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-portal-test-');

const { app, prepareData } = await import('./app.ts');
const { closeDatabase } = await import('./db.ts');
const api = request(app);

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

/** Invite someone, accept the invitation, and hand back their user and session cookie. */
async function invited(role: Role, email = `${role}@shul.test`, extra: Record<string, unknown> = {}) {
  const sent = await api
    .post('/api/users')
    .set('Cookie', ownerCookie)
    .send({ name: `${role} person`, email, role, ...extra });
  expect(sent.status, JSON.stringify(sent.body)).toBe(201);
  const token = String(sent.body.link).split('/welcome/')[1];
  const accepted = await api.post(`/api/auth/token/${token}`).send({ password: INVITED_PASSWORD });
  expect(accepted.status).toBe(200);
  return { user: accepted.body.user, cookie: cookieOf(accepted) };
}

// ---------------------------------------------------------------------------
// Office helpers: the staff side of every fixture, so the portal only ever
// sees records it did not create itself.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };

// `body` is typed the way supertest's .send() accepts it, rather than unknown.
async function office<T = Row>(method: 'post' | 'patch' | 'get' | 'delete' | 'put', path: string, body?: object | string): Promise<T> {
  const req = api[method](path).set('Cookie', ownerCookie);
  const res = await (body === undefined ? req : req.send(body));
  expect(res.status, `${method.toUpperCase()} ${path} answered ${res.status}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  return res.body as T;
}

/** importantDates has no GET /:id route (see resourceRoutes), so read one back out of the list. */
const storedDate = async (id: string): Promise<Row | undefined> =>
  (await office<Row[]>('get', '/api/important-dates')).find((d) => d.id === id);

/** Switch the portal module on or off, leaving the other features as they are. */
async function setPortal(on: boolean): Promise<void> {
  const { features } = await office<{ features: Record<string, boolean> }>('get', '/api/settings');
  const saved = await office<Record<string, boolean>>('put', '/api/settings/features', { ...features, portal: on });
  expect(saved.portal).toBe(on);
}

/** The newest audit entry matching `match`, which is what the undo route takes. */
async function auditEntry(match: (e: AuditEntry) => boolean): Promise<AuditEntry> {
  const res = await api.get('/api/audit').set('Cookie', ownerCookie).query({ limit: 500 });
  expect(res.status).toBe(200);
  const found = (res.body as AuditEntry[]).find(match);
  expect(found, 'expected a matching audit entry in the log').toBeTruthy();
  return found as AuditEntry;
}

// Two families, each with its own portal login. Every scoping test is "A cannot reach B".
let famA: Row;
let famB: Row;
let memA1: Row; // the member family A's login belongs to
let memA2: Row;
let memB1: Row; // the member family B's login belongs to
let dateB: Row; // a date belonging to family B, for the cross-family attempts
let alpha = ''; // family A's member cookie
let beta = ''; // family B's member cookie

beforeAll(async () => {
  await prepareData(); // seeds the demo data; leaves the user table empty
  const setup = await api.post('/api/auth/setup').send(OWNER);
  expect(setup.status).toBe(200);
  ownerCookie = cookieOf(setup);

  famA = await office('post', '/api/families', { name: 'Portal Alpha', status: 'active', phone: '+44 20 7000 0000', city: 'London' });
  famB = await office('post', '/api/families', { name: 'Portal Beta', status: 'active', phone: '+1 555 0001' });
  const member = (familyId: string, firstName: string, lastName: string, gender: string, role: string) =>
    office('post', '/api/members', { familyId, firstName, lastName, gender, role, status: 'active' });
  memA1 = await member(famA.id, 'Dovid', 'Alpha', 'male', 'husband');
  memA2 = await member(famA.id, 'Esti', 'Alpha', 'female', 'wife');
  memB1 = await member(famB.id, 'Shimon', 'Beta', 'male', 'husband');
  dateB = await office('post', '/api/important-dates', { memberId: memB1.id, type: 'birthday', date: '1990-05-05' });

  alpha = (await invited('member', 'alpha@shul.test', { memberId: memA1.id })).cookie;
  beta = (await invited('member', 'beta@shul.test', { memberId: memB1.id })).cookie;
  await setPortal(true);
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

/** Every portal route as a thunk, so a rule that covers the whole portal is checked in one loop. */
function portalRoutes(cookie: string, ids: { memberId: string; dateId: string; sponsorshipId: string; claimId: string }) {
  const date = { memberId: ids.memberId, type: 'birthday', date: '2000-01-01' };
  return {
    reads: [
      ['GET /api/portal/home', () => api.get('/api/portal/home').set('Cookie', cookie)],
      ['GET /api/portal/account', () => api.get('/api/portal/account').set('Cookie', cookie)],
      ['GET /api/portal/sponsorships', () => api.get('/api/portal/sponsorships').set('Cookie', cookie)],
    ],
    writes: [
      ['PATCH /api/portal/family', () => api.patch('/api/portal/family').set('Cookie', cookie).send({ phone: '+1 555 9999' })],
      [
        'POST /api/portal/members',
        () => api.post('/api/portal/members').set('Cookie', cookie).send({ firstName: 'New', lastName: 'Person', gender: 'male' }),
      ],
      [
        'PATCH /api/portal/members/:id',
        () => api.patch(`/api/portal/members/${ids.memberId}`).set('Cookie', cookie).send({ phone: '+1 555 9999' }),
      ],
      ['POST /api/portal/dates', () => api.post('/api/portal/dates').set('Cookie', cookie).send(date)],
      ['PATCH /api/portal/dates/:id', () => api.patch(`/api/portal/dates/${ids.dateId}`).set('Cookie', cookie).send(date)],
      ['DELETE /api/portal/dates/:id', () => api.delete(`/api/portal/dates/${ids.dateId}`).set('Cookie', cookie)],
      [
        'POST /api/portal/sponsorships/:id/claim',
        () => api.post(`/api/portal/sponsorships/${ids.sponsorshipId}/claim`).set('Cookie', cookie).send({ amount: 10 }),
      ],
      ['DELETE /api/portal/claims/:id', () => api.delete(`/api/portal/claims/${ids.claimId}`).set('Cookie', cookie)],
    ],
  } as const;
}

describe('the portal switch', () => {
  beforeAll(() => setPortal(false));
  afterAll(() => setPortal(true));

  it('answers 403 on every portal route while the feature is off', async () => {
    const { reads, writes } = portalRoutes(alpha, {
      memberId: memA2.id,
      dateId: dateB.id,
      sponsorshipId: famB.id,
      claimId: famB.id,
    });
    for (const [name, call] of [...reads, ...writes]) {
      const res = await call();
      expect(res.status, `${name} answered ${res.status}: ${JSON.stringify(res.body)}`).toBe(403);
    }
  });

  it('leaves the office untouched: switching the portal off is not switching the shul off', async () => {
    expect((await api.get('/api/families').set('Cookie', ownerCookie)).status).toBe(200);
  });
});

describe('scope', () => {
  it('shows one family only: its own members and its own dates', async () => {
    const res = await api.get('/api/portal/home').set('Cookie', alpha);
    expect(res.status).toBe(200);
    expect(res.body.family.id).toBe(famA.id);
    expect(res.body.member.id).toBe(memA1.id);
    expect(res.body.canEdit).toBe(true);
    expect([...res.body.members].map((m: Row) => m.id).sort()).toEqual([memA1.id, memA2.id].sort());
    // Not one member, date or family of anyone else — the seeded demo shul included.
    for (const m of res.body.members) expect(m.familyId).toBe(famA.id);
    const ours = new Set([memA1.id, memA2.id]);
    for (const d of res.body.dates) expect(ours.has(d.memberId)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(famB.id);
  });

  // 404, not 403: a 403 would confirm that the id names a real record, which is how someone
  // walking a list of ids learns who exists. "No such person in your family" says nothing either way.
  it('answers 404, not 403, when a member of one family edits a member of another', async () => {
    const res = await api.patch(`/api/portal/members/${memB1.id}`).set('Cookie', alpha).send({ phone: '+1 555 0666' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).not.toMatch(/Shimon|Beta|not yours|another family|allowed/i);
    // And nothing changed, of course.
    expect((await office('get', `/api/members/${memB1.id}`)).phone).toBeUndefined();
  });

  it('answers 404 when editing or deleting a date that belongs to another family', async () => {
    const body = { memberId: memB1.id, type: 'birthday', date: '1991-06-06' };
    const edited = await api.patch(`/api/portal/dates/${dateB.id}`).set('Cookie', alpha).send(body);
    expect(edited.status).toBe(404);
    const deleted = await api.delete(`/api/portal/dates/${dateB.id}`).set('Cookie', alpha);
    expect(deleted.status).toBe(404);
    expect(deleted.body.error.message).not.toMatch(/Beta|not yours|another family/i);
    // The date is still there and still says what it said.
    const home = await api.get('/api/portal/home').set('Cookie', beta);
    expect(home.body.dates.find((d: Row) => d.id === dateB.id)?.date).toBe('1990-05-05');
  });

  it('answers 404 for an id that exists nowhere, the same as for someone else’s', async () => {
    const nowhere = await api.patch(`/api/portal/members/${famB.id}`).set('Cookie', alpha).send({ phone: '+1 555 0000' });
    expect(nowhere.status).toBe(404);
  });
});

describe('staff routes stay shut to a member', () => {
  it('refuses the office’s own routes with 403', async () => {
    const calls: Array<[string, () => request.Test]> = [
      ['GET /api/families', () => api.get('/api/families').set('Cookie', alpha)],
      ['GET /api/users', () => api.get('/api/users').set('Cookie', alpha)],
      ['PUT /api/settings/org', () => api.put('/api/settings/org').set('Cookie', alpha).send({ name: 'Mine Now' })],
      ['POST /api/reset', () => api.post('/api/reset').set('Cookie', alpha)],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect(res.status, `${name} answered ${res.status}: ${JSON.stringify(res.body)}`).toBe(403);
    }
    // A reset reseeds the demo data, so this record surviving proves no reset happened.
    expect((await office('get', `/api/families/${famA.id}`)).name).toBe('Portal Alpha');
  });
});

describe('editing a family', () => {
  it('saves contact details', async () => {
    const res = await api
      .patch('/api/portal/family')
      .set('Cookie', alpha)
      .send({ phone: '+44 20 7000 1234', address: '12 Shul Lane', city: 'Manchester', email: 'alpha@home.test' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+44 20 7000 1234', address: '12 Shul Lane', city: 'Manchester', email: 'alpha@home.test' });
  });

  // Who a family is, and whether they are still members, is the office's call. The schema simply
  // has no such fields, so these have to be *dropped* rather than refused — assert the record, not the status.
  it('ignores a name or status smuggled into the body', async () => {
    const res = await api
      .patch('/api/portal/family')
      .set('Cookie', alpha)
      .send({ phone: '+44 20 7000 4321', name: 'Renamed By A Member', status: 'inactive', notes: 'office only' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Portal Alpha');
    expect(res.body.status).toBe('active');
    const stored = await office('get', `/api/families/${famA.id}`);
    expect(stored).toMatchObject({ name: 'Portal Alpha', status: 'active', phone: '+44 20 7000 4321' });
    expect(stored.notes).toBeUndefined();
  });
});

describe('editing a member', () => {
  it('saves the person’s own details', async () => {
    const res = await api
      .patch(`/api/portal/members/${memA2.id}`)
      .set('Cookie', alpha)
      .send({ phone: '+44 7700 900111', hebrewName: 'Esther', occupation: 'Teacher' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+44 7700 900111', hebrewName: 'Esther', occupation: 'Teacher' });
  });

  // Moving someone to another family, or marking them gone, is the office's decision — and a
  // writable familyId would be a way out of the scope rules altogether.
  it('ignores a familyId or status smuggled into the body', async () => {
    const res = await api
      .patch(`/api/portal/members/${memA2.id}`)
      .set('Cookie', alpha)
      .send({ firstName: 'Esti', familyId: famB.id, status: 'inactive', deathDate: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ familyId: famA.id, status: 'active', firstName: 'Esti' });
    expect(res.body.deathDate).toBeUndefined();
    // And family B's portal still cannot see her.
    const bHome = await api.get('/api/portal/home').set('Cookie', beta);
    expect(bHome.body.members.map((m: Row) => m.id)).not.toContain(memA2.id);
  });

  it('adds a person to our own family, never to another', async () => {
    const res = await api
      .post('/api/portal/members')
      .set('Cookie', alpha)
      .send({ firstName: 'Yitzy', lastName: 'Alpha', gender: 'male', role: 'son', familyId: famB.id, status: 'inactive' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ familyId: famA.id, status: 'active' });
  });

  it('refuses a role that is not in the shul’s list', async () => {
    const res = await api
      .post('/api/portal/members')
      .set('Cookie', alpha)
      .send({ firstName: 'Bad', lastName: 'Role', gender: 'male', role: 'treasurer-of-mars' });
    expect(res.status).toBe(400);
  });
});

describe('dates', () => {
  let ownDate: Row;

  // 2026-03-15 is 26 Adar 5786; after nightfall the Hebrew day has already turned, so it is the 27th.
  const EXPECTED = { hebrewDay: 27, hebrewMonth: 12, hebrewYear: 5786 };

  it('computes the Hebrew date itself and ignores the one sent in the body', async () => {
    const res = await api.post('/api/portal/dates').set('Cookie', alpha).send({
      memberId: memA2.id,
      type: 'birthday',
      date: '2026-03-15',
      afterNightfall: true,
      // Deliberately wrong: a stored Hebrew date that disagrees with its English one would make
      // every yahrzeit and birthday list wrong, so it is recomputed rather than trusted.
      hebrewDay: 1,
      hebrewMonth: 1,
      hebrewYear: 5000,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ memberId: memA2.id, date: '2026-03-15', afterNightfall: true, ...EXPECTED });
    ownDate = res.body;
    // And it is what the office reads back, not just what the response said.
    expect(await storedDate(ownDate.id)).toMatchObject(EXPECTED);
  });

  it('recomputes on an edit too, and the nightfall answer moves the Hebrew day', async () => {
    const res = await api
      .patch(`/api/portal/dates/${ownDate.id}`)
      .set('Cookie', alpha)
      .send({ memberId: memA2.id, type: 'birthday', date: '2026-03-15', afterNightfall: false, hebrewDay: 9, hebrewMonth: 9, hebrewYear: 5999 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hebrewDay: 26, hebrewMonth: 12, hebrewYear: 5786 });
  });

  it('refuses a date for someone in another family', async () => {
    const res = await api
      .post('/api/portal/dates')
      .set('Cookie', alpha)
      .send({ memberId: memB1.id, type: 'birthday', date: '1980-02-02' });
    expect(res.status).toBe(404);
    // Nothing was created against family B.
    const bHome = await api.get('/api/portal/home').set('Cookie', beta);
    expect(bHome.body.dates).toHaveLength(1);
  });

  it('refuses a type that is not in the shul’s list', async () => {
    const res = await api
      .post('/api/portal/dates')
      .set('Cookie', alpha)
      .send({ memberId: memA2.id, type: 'moon-landing', date: '1969-07-20' });
    expect(res.status).toBe(400);
  });

  it('deletes our own date', async () => {
    expect((await api.delete(`/api/portal/dates/${ownDate.id}`).set('Cookie', alpha)).status).toBe(204);
    const home = await api.get('/api/portal/home').set('Cookie', alpha);
    expect(home.body.dates.map((d: Row) => d.id)).not.toContain(ownDate.id);
  });
});

describe('an inactive family', () => {
  let ownDate: Row;
  let ownClaim: Row;
  let sponsorshipId = '';

  beforeAll(async () => {
    ownDate = (await api.post('/api/portal/dates').set('Cookie', alpha).send({ memberId: memA1.id, type: 'birthday', date: '1985-07-07' }))
      .body;
    // A real date and a real claim of our own, so each write is refused for being a write rather
    // than for naming something that does not exist.
    const s = await office('post', '/api/sponsorships', {
      title: 'Before Going Inactive',
      date: '2027-05-05',
      fund: 'Kiddush',
      currency: 'GBP',
      suggestedAmount: 40,
      maxSponsors: 1,
      open: true,
    });
    sponsorshipId = s.id;
    const claimed = await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({});
    expect(claimed.status).toBe(201);
    ownClaim = claimed.body;
    await office('patch', `/api/families/${famA.id}`, { status: 'inactive' });
  });

  afterAll(async () => {
    await office('patch', `/api/families/${famA.id}`, { status: 'active' });
    // Clear the fixture claim (and its pledge) from the office side, so what the family owes is
    // the same here whether or not the release above was refused.
    await api.delete(`/api/sponsorships/claims/${ownClaim.id}`).set('Cookie', ownerCookie);
    await api.delete(`/api/sponsorships/${sponsorshipId}`).set('Cookie', ownerCookie);
  });

  // Someone who has left should still be able to see what the shul holds about them and what they
  // owe; only changing it is the office's business now.
  it('can still read, with canEdit false', async () => {
    const res = await api.get('/api/portal/home').set('Cookie', alpha);
    expect(res.status).toBe(200);
    expect(res.body.family.status).toBe('inactive');
    expect(res.body.canEdit).toBe(false);
    expect((await api.get('/api/portal/account').set('Cookie', alpha)).status).toBe(200);
  });

  it('answers 403 on every portal write', async () => {
    const { writes } = portalRoutes(alpha, {
      memberId: memA1.id,
      dateId: ownDate.id,
      sponsorshipId,
      claimId: ownClaim.id,
    });
    // Releasing a claim is checked on its own below, because it is the one write that gets through.
    for (const [name, call] of writes.filter(([name]) => name !== 'DELETE /api/portal/claims/:id')) {
      const res = await call();
      expect(res.status, `${name} answered ${res.status}: ${JSON.stringify(res.body)}`).toBe(403);
    }
    // Every write was refused, so the date the member made earlier is untouched.
    expect(await storedDate(ownDate.id)).toMatchObject({ date: '1985-07-07' });
  });

  // Every other write goes through portal.ts's mustEdit(), and POST .../claim has its own status
  // check in app.ts — but DELETE /api/portal/claims/:id has neither, so an inactive family can
  // still give a sponsorship back and delete the pledge that went with it. The office should be
  // the one to do that, as it is for every other change once a family is marked inactive.
  it('answers 403 when an inactive family releases a claim', async () => {
    const res = await api.delete(`/api/portal/claims/${ownClaim.id}`).set('Cookie', alpha);
    expect(res.status, `DELETE /api/portal/claims/:id answered ${res.status}: ${JSON.stringify(res.body)}`).toBe(403);
    // The pledge it created should still be owed.
    expect((await office<Row[]>('get', '/api/pledges')).map((p) => p.id)).toContain(ownClaim.pledgeId);
  });
});

describe('the account page', () => {
  beforeAll(async () => {
    // Family A: 1000 USD pledged with 400 paid, 500 GBP pledged with nothing paid, and a
    // 100 USD gift against no pledge (which must not reduce what is owed).
    const usd = await office('post', '/api/pledges', { fund: 'General', type: 'annual', familyId: famA.id, year: 2026, amount: 1000, currency: 'USD' });
    await office('post', '/api/pledges', { fund: 'Building', type: 'one_time', familyId: famA.id, year: 2026, amount: 500, currency: 'GBP' });
    await office('post', '/api/donations', {
      fund: 'General',
      familyId: famA.id,
      pledgeId: usd.id,
      amount: 400,
      currency: 'USD',
      date: '2026-02-01',
      method: 'check',
    });
    await office('post', '/api/donations', { fund: 'Chesed', familyId: famA.id, amount: 100, currency: 'USD', date: '2026-02-02', method: 'cash' });
    // Family B's money, which family A must never see.
    await office('post', '/api/pledges', { fund: 'General', familyId: famB.id, year: 2026, amount: 7777, currency: 'USD' });
    await office('post', '/api/donations', { fund: 'General', familyId: famB.id, amount: 6666, currency: 'USD', date: '2026-03-03', method: 'cash' });
  });

  it('shows this family’s money only', async () => {
    const res = await api.get('/api/portal/account').set('Cookie', alpha);
    expect(res.status).toBe(200);
    for (const p of res.body.pledges) expect(p.familyId).toBe(famA.id);
    for (const d of res.body.donations) expect(d.familyId).toBe(famA.id);
    // The other family's figures are distinctive, so searching the whole payload is a fair check.
    expect(JSON.stringify(res.body)).not.toContain('7777');
    expect(JSON.stringify(res.body)).not.toContain('6666');
    expect(JSON.stringify(res.body)).not.toContain(famB.id);
  });

  it('owes pledged minus paid, per currency', async () => {
    const res = await api.get('/api/portal/account').set('Cookie', alpha);
    expect(res.body.owed).toEqual({ USD: 600, GBP: 500 });
    const usd = res.body.pledges.find((p: Row) => p.currency === 'USD');
    expect(usd).toMatchObject({ amount: 1000, paid: 400, balance: 600, fundLabel: 'General' });
    expect(res.body.pledges.find((p: Row) => p.currency === 'GBP')).toMatchObject({ paid: 0, balance: 500 });
  });

  it('offers a payment link only once the shul has set one up', async () => {
    const before = await api.get('/api/portal/account').set('Cookie', alpha);
    expect(before.body.payment).toBeUndefined();

    const { org } = await office<{ org: Record<string, unknown> }>('get', '/api/settings');
    await office('put', '/api/settings/org', { ...org, paymentUrl: 'https://pay.example.test/shul', paymentNote: 'Quote your family name' });

    const after = await api.get('/api/portal/account').set('Cookie', alpha);
    expect(after.body.payment).toEqual({ url: 'https://pay.example.test/shul', note: 'Quote your family name' });
  });
});

describe('sponsorships', () => {
  const sponsorship = (extra: Record<string, unknown>) =>
    office('post', '/api/sponsorships', { title: 'Kiddush', date: '2027-01-02', fund: 'Kiddush', currency: 'GBP', open: true, ...extra });

  const seen = async (cookie: string, id: string) => {
    const res = await api.get('/api/portal/sponsorships').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body as Array<Record<string, unknown>>).find((s) => s.id === id) as
      | (Record<string, unknown> & { claims: Array<Row & { familyName?: string }>; remaining: number; mine: boolean })
      | undefined;
  };

  const pledgesOf = async (familyId: string) =>
    (await office<Row[]>('get', '/api/pledges')).filter((p) => p.familyId === familyId);

  it('lets the office register a family the same way the portal would', async () => {
    const s = await sponsorship({ title: 'Office Kiddush', suggestedAmount: 180, maxSponsors: 1 });
    const registered = await office('post', `/api/sponsorships/${s.id}/claims`, {
      familyId: famA.id,
      dedication: 'L\'chaim',
    });
    expect(registered).toMatchObject({
      familyId: famA.id,
      amount: 180,
      currency: 'GBP',
      dedication: 'L\'chaim',
    });
    const pledge = (await pledgesOf(famA.id)).find((p) => p.id === registered.pledgeId);
    expect(pledge).toMatchObject({ fund: 'Kiddush', amount: 180, familyId: famA.id, dueDate: '2027-01-02' });

    const summary = await office<Array<{ id: string; claims: Array<{ familyName?: string }> }>>(
      'get',
      '/api/sponsorships/summary',
    );
    expect(summary.find((row) => row.id === s.id)?.claims[0].familyName).toBe('Portal Alpha');
    expect((await seen(alpha, s.id))?.mine).toBe(true);
  });

  it('shows the open slots, and claiming one creates the matching pledge', async () => {
    const s = await sponsorship({ title: 'Shabbos Kiddush', suggestedAmount: 250, maxSponsors: 1 });
    const before = await seen(alpha, s.id);
    expect(before).toMatchObject({ remaining: 1, mine: false });
    expect(before?.claims).toHaveLength(0);

    const claimed = await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({ dedication: 'In memory of Sara' });
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(201);
    expect(claimed.body).toMatchObject({ familyId: famA.id, memberId: memA1.id, amount: 250, currency: 'GBP', dedication: 'In memory of Sara' });

    // Taking a sponsorship on is a promise to pay, so it has to land in the one ledger the family sees.
    const pledge = (await pledgesOf(famA.id)).find((p) => p.id === claimed.body.pledgeId);
    expect(pledge).toMatchObject({ fund: 'Kiddush', amount: 250, currency: 'GBP', familyId: famA.id, dueDate: '2027-01-02', year: 2027 });

    const after = await seen(alpha, s.id);
    expect(after).toMatchObject({ remaining: 0, mine: true });
  });

  it('refuses the same family taking the same one on twice (409)', async () => {
    const s = await sponsorship({ title: 'Twice', suggestedAmount: 50, maxSponsors: 2 });
    expect((await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).status).toBe(201);
    const again = await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({});
    expect(again.status).toBe(409);
    // One claim, one pledge: the refused second attempt must not have left a pledge behind.
    expect((await seen(alpha, s.id))?.claims).toHaveLength(1);
  });

  it('refuses the next family once maxSponsors is reached (409)', async () => {
    const s = await sponsorship({ title: 'Only One Place', suggestedAmount: 80, maxSponsors: 1 });
    expect((await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).status).toBe(201);
    const late = await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', beta).send({});
    expect(late.status).toBe(409);
    expect(await pledgesOf(famB.id)).toHaveLength(1); // only the office's own 7777 pledge
  });

  it('keeps other families anonymous in the portal, but not to the office', async () => {
    const s = await sponsorship({ title: 'Anonymous Check', suggestedAmount: 90, maxSponsors: 2 });
    expect((await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).status).toBe(201);

    // Our own claim is still ours to recognise, in full.
    const asAlpha = await seen(alpha, s.id);
    expect(asAlpha?.claims[0].familyName).toBe('Portal Alpha');
    const alphaClaim = asAlpha!.claims[0] as unknown as { familyId: string };

    // Who sponsored what is the shul's to announce, so another family's claim never reaches the
    // portal at all: not their name, not their id, not what they wrote in their dedication.
    const asBeta = await seen(beta, s.id);
    expect(asBeta?.claims).toHaveLength(0);
    expect(JSON.stringify(asBeta)).not.toContain('Portal Alpha');
    expect(JSON.stringify(asBeta)).not.toContain(alphaClaim.familyId);
    expect(asBeta?.mine).toBe(false);
    // The count still has to be honest, or Beta cannot tell a place is left.
    expect(asBeta?.remaining).toBe(1);

    const summary = await office<Array<{ id: string; claims: Array<{ familyName?: string }> }>>('get', '/api/sponsorships/summary');
    expect(summary.find((row) => row.id === s.id)?.claims[0].familyName).toBe('Portal Alpha');
  });

  it('gives a claim back, and the pledge it created goes with it', async () => {
    const s = await sponsorship({ title: 'Given Back', suggestedAmount: 120, maxSponsors: 1 });
    const claim = (await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).body;
    expect((await pledgesOf(famA.id)).map((p) => p.id)).toContain(claim.pledgeId);

    expect((await api.delete(`/api/portal/claims/${claim.id}`).set('Cookie', alpha)).status).toBe(204);
    // A family that has given a sponsorship back does not owe for it any more.
    expect((await pledgesOf(famA.id)).map((p) => p.id)).not.toContain(claim.pledgeId);
    expect(await seen(alpha, s.id)).toMatchObject({ remaining: 1, mine: false });
  });

  it('answers 404 when releasing another family’s claim by id', async () => {
    const s = await sponsorship({ title: 'Not Yours To Give Back', suggestedAmount: 60, maxSponsors: 2 });
    const claim = (await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).body;

    // 404 rather than 403, for the same reason as the cross-family edits: a 403 would confirm
    // that this claim id is real, and with it that some family has taken this sponsorship on.
    const res = await api.delete(`/api/portal/claims/${claim.id}`).set('Cookie', beta);
    expect(res.status).toBe(404);
    expect((await seen(alpha, s.id))?.mine).toBe(true);
  });

  it('refuses to release a claim that has already been paid towards (409)', async () => {
    const s = await sponsorship({ title: 'Already Paid', suggestedAmount: 200, maxSponsors: 1 });
    const claim = (await api.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', alpha).send({})).body;
    await office('post', '/api/donations', {
      fund: 'Kiddush',
      familyId: famA.id,
      pledgeId: claim.pledgeId,
      amount: 200,
      currency: 'GBP',
      date: '2026-04-01',
      method: 'transfer',
    });

    // Dropping the pledge now would leave a receipted gift pointing at nothing, so the office has to sort it out.
    const res = await api.delete(`/api/portal/claims/${claim.id}`).set('Cookie', alpha);
    expect(res.status).toBe(409);
    expect((await pledgesOf(famA.id)).map((p) => p.id)).toContain(claim.pledgeId);
  });
});

describe('undoing what a family changed', () => {
  it('puts a phone number back', async () => {
    const original = (await office('get', `/api/families/${famA.id}`)).phone as string;
    const changed = await api.patch('/api/portal/family').set('Cookie', alpha).send({ phone: '+44 20 7111 2222' });
    expect(changed.status).toBe(200);
    expect(changed.body.phone).toBe('+44 20 7111 2222');

    const entry = await auditEntry((e) => e.action === 'portal.update' && e.entity === 'families' && e.entityId === famA.id);
    const undone = await api.post(`/api/audit/${entry.id}/undo`).set('Cookie', ownerCookie);
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    expect(undone.body).toEqual({ action: 'portal.update', entity: 'families' });
    expect((await office('get', `/api/families/${famA.id}`)).phone).toBe(original);
  });

  it('removes a date the family added', async () => {
    const added = await api.post('/api/portal/dates').set('Cookie', alpha).send({ memberId: memA1.id, type: 'anniversary', date: '2010-08-08' });
    expect(added.status).toBe(201);

    const entry = await auditEntry((e) => e.action === 'portal.create' && e.entity === 'importantDates' && e.entityId === added.body.id);
    expect((await api.post(`/api/audit/${entry.id}/undo`).set('Cookie', ownerCookie)).status).toBe(200);
    expect(await storedDate(added.body.id)).toBeUndefined();
  });

  it('restores a deleted date with the same id, so anything pointing at it still does', async () => {
    const added = await api.post('/api/portal/dates').set('Cookie', alpha).send({ memberId: memA1.id, type: 'birthday', date: '1975-09-09' });
    expect(added.status).toBe(201);
    expect((await api.delete(`/api/portal/dates/${added.body.id}`).set('Cookie', alpha)).status).toBe(204);

    const entry = await auditEntry((e) => e.action === 'portal.delete' && e.entity === 'importantDates' && e.entityId === added.body.id);
    const undone = await api.post(`/api/audit/${entry.id}/undo`).set('Cookie', ownerCookie);
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    expect(await storedDate(added.body.id)).toMatchObject({ id: added.body.id, memberId: memA1.id, type: 'birthday', date: '1975-09-09' });
  });

  it('refuses to undo a change the office made', async () => {
    await office('patch', `/api/families/${famB.id}`, { city: 'Brooklyn' });
    const entry = await auditEntry((e) => e.action === 'update' && e.entity === 'families' && e.entityId === famB.id);
    const res = await api.post(`/api/audit/${entry.id}/undo`).set('Cookie', ownerCookie);
    // Undo exists to let staff reverse what a family did about itself, not as a general time machine
    // over the office's own work, where a blind field-by-field revert could undo somebody else's edit.
    expect(res.status).toBe(400);
    expect((await office('get', `/api/families/${famB.id}`)).city).toBe('Brooklyn');
  });

  it('does not let a member reach the undo route at all', async () => {
    const changed = await api.patch('/api/portal/family').set('Cookie', alpha).send({ city: 'Golders Green' });
    expect(changed.status).toBe(200);
    const entry = await auditEntry((e) => e.action === 'portal.update' && e.entity === 'families' && e.entityId === famA.id);

    const res = await api.post(`/api/audit/${entry.id}/undo`).set('Cookie', alpha);
    expect(res.status).toBe(403);
    expect((await office('get', `/api/families/${famA.id}`)).city).toBe('Golders Green');
  });

  it('is not an admin-only door a signed-out caller can push on', async () => {
    const entry = await auditEntry((e) => e.action === 'portal.update');
    expect((await api.post(`/api/audit/${entry.id}/undo`)).status).toBe(401);
  });
});
