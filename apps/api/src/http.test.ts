import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

// The whole HTTP app, against a throwaway database (set before db.ts loads; see repo.test.ts).
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'crm-http-test-'));
process.env.CRM_DATA_DIR = TEST_DATA_DIR;

// A stand-in for the built web app, so the static handler is exercised whether or not
// apps/web/dist has been built (CI runs the tests before the build).
const TEST_WEB_DIR = mkdtempSync(join(tmpdir(), 'crm-web-test-'));
process.env.WEB_DIST_DIR = TEST_WEB_DIR;
writeFileSync(join(TEST_WEB_DIR, 'index.html'), '<!doctype html><title>Shul CRM</title>');
mkdirSync(join(TEST_WEB_DIR, 'assets'));
writeFileSync(join(TEST_WEB_DIR, 'assets', 'index-abc123.js'), 'export default 1;\n');

const { app, prepareData } = await import('./app.ts');
const { db } = await import('./db.ts');
// Every /api route needs a signed-in user, so the agent keeps the session cookie for all of them.
const api = request.agent(app);

beforeAll(async () => {
  await prepareData(); // seeds the demo data
  // First run has no users: setup makes the owner and signs this agent in.
  const res = await api.post('/api/auth/setup').send({ name: 'Owner', email: 'owner@example.test', password: 'correct horse battery' });
  expect(res.status).toBe(200);
});

afterAll(() => {
  try {
    db.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    rmSync(TEST_WEB_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

describe('basics', () => {
  it('answers health and gives JSON 404s', async () => {
    expect((await api.get('/api/health')).body).toEqual({ ok: true });
    const res = await api.get('/api/nowhere');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/Not found/);
  });

  it('serves the built web app and leaves /api alone', async () => {
    const index = await api.get('/');
    expect(index.status).toBe(200);
    expect(index.text).toContain('Shul CRM');
    expect(index.headers['cache-control']).toBe('no-cache');

    // A client route is not a file: the web app resolves it, so it gets index.html.
    const route = await api.get('/families/not-a-file').set('accept', 'text/html');
    expect(route.status).toBe(200);
    expect(route.text).toContain('Shul CRM');

    // Hashed assets may be cached forever.
    const asset = await api.get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    // An unknown API path stays a JSON 404 however it is spelled — a browser must never be
    // handed the web app in place of a 401 or 404 from the API.
    for (const path of ['/api/nowhere', '/API/nowhere', '/Api/Settings/nope']) {
      const res = await api.get(path).set('accept', 'text/html');
      expect(res.status, path).toBe(404);
      expect(res.text, path).not.toContain('Shul CRM');
    }

    // A missing file that is not a page is a 404, not the web app.
    expect((await api.get('/assets/gone.js')).status).toBe(404);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await api.post('/api/families').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });
});

describe('families CRUD', () => {
  let id = '';

  it('creates, reads, and validates', async () => {
    const bad = await api.post('/api/families').send({ name: '', status: 'active' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.issues[0].path).toBe('name');

    const res = await api.post('/api/families').send({ name: 'Test', status: 'active', phone: '+1 555 0100', city: 'Springfield' });
    expect(res.status).toBe(201);
    id = res.body.id;
    expect((await api.get(`/api/families/${id}`)).body.name).toBe('Test');
  });

  it('PATCH: omitted fields stay, null clears an optional field, required fields cannot be cleared', async () => {
    const res = await api.patch(`/api/families/${id}`).send({ phone: null });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBeUndefined();
    expect(res.body.city).toBe('Springfield');
    const bad = await api.patch(`/api/families/${id}`).send({ name: null });
    expect(bad.status).toBe(400);
  });

  it('deletes, then 404s', async () => {
    expect((await api.delete(`/api/families/${id}`)).status).toBe(204);
    expect((await api.get(`/api/families/${id}`)).status).toBe(404);
  });
});

describe('lists and settings', () => {
  it('rejects a value that is not in a list', async () => {
    const family = (await api.get('/api/families')).body[0];
    const res = await api
      .post('/api/donations')
      .send({ fund: 'General', familyId: family.id, amount: 5, date: '2026-01-01', method: 'bitcoin', currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/paymentMethods/);
  });

  it('refuses to delete a list item in use (409)', async () => {
    const res = await api.put('/api/settings/lookups/paymentMethods').send([{ key: 'cash', label: 'Cash', active: true }]);
    expect(res.status).toBe(409);
  });

  it('keeps the install id when the profile is saved', async () => {
    const { org } = (await api.get('/api/settings')).body;
    const res = await api.put('/api/settings/org').send({ ...org, name: 'Renamed', orgId: '00000000-0000-7000-8000-000000000001' });
    expect(res.body).toMatchObject({ name: 'Renamed', orgId: org.orgId });
  });

  it('takes a PNG logo, refuses anything else, and serves it back', async () => {
    const bad = await api.put('/api/org/logo').set('content-type', 'image/svg+xml').send('<svg/>');
    expect(bad.status).toBe(400);
    const ok = await api.put('/api/org/logo').set('content-type', 'image/png').send(Buffer.from(PNG));
    expect(ok.status).toBe(200);
    expect(ok.body.hasLogo).toBe(true);
    const logo = await api.get('/api/org/logo');
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    expect((await api.delete('/api/org/logo')).status).toBe(204);
    expect((await api.get('/api/org/logo')).status).toBe(404);
  });
});

describe('paged lists', () => {
  it('searches, sorts, pages and totals', async () => {
    const res = await api.get('/api/members/page').query({ q: 'cohen', sort: 'name', limit: 1 });
    expect(res.body.total).toBeGreaterThan(1);
    expect(res.body.items).toHaveLength(1);
    const all = await api.get('/api/donations/page').query({ year: '2026', limit: 500 });
    const sum: Record<string, number> = {};
    for (const d of all.body.items) sum[d.currency] = (sum[d.currency] ?? 0) + d.amount;
    expect(all.body.totals).toEqual(sum);
    const byAmount = (await api.get('/api/donations/page').query({ sort: 'amount', order: 'desc', limit: 3 })).body.items;
    expect(byAmount.map((d: { amount: number }) => d.amount)).toEqual([...byAmount.map((d: { amount: number }) => d.amount)].sort((a, b) => b - a));
  });

  it('treats search text literally (no SQL wildcards)', async () => {
    expect((await api.get('/api/families/page').query({ q: '%' })).body.total).toBe(0);
  });
});

describe('import and export', () => {
  it('parses a CSV upload, previews, and commits', async () => {
    const csv = 'Family,Phone\nImported Family,+1 555 0199\n';
    const parsed = await api.post('/api/import/parse').set('content-type', 'application/octet-stream').send(Buffer.from(csv));
    expect(parsed.body).toEqual({ headers: ['Family', 'Phone'], rows: [['Imported Family', '+1 555 0199']] });
    const req = { rows: parsed.body.rows, mapping: { name: 0, phone: 1 } };
    expect((await api.post('/api/import/families/preview').send(req)).body.counts).toEqual({ ok: 1, duplicate: 0, error: 0 });
    expect((await api.post('/api/import/families/commit').send(req)).body.created).toBe(1);
    expect((await api.post('/api/import/families/preview').send(req)).body.counts.duplicate).toBe(1);
  });

  it('exports CSV and Excel with the install id', async () => {
    const csv = await api.get('/api/export/families').query({ format: 'csv' });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['x-org-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(csv.text).toContain('Name,Hebrew name');
    const xlsx = await api.get('/api/export/members').query({ format: 'xlsx' }).buffer(true);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
  });
});

describe('events, email, reports', () => {
  it('enforces event capacity with 409', async () => {
    const family = (await api.get('/api/families')).body[0];
    const event = (await api.post('/api/events').send({ title: 'Kiddush', date: '2026-11-07', capacity: 2 })).body;
    expect((await api.put('/api/rsvps').send({ eventId: event.id, familyId: family.id, status: 'yes', adults: 3, children: 0 })).status).toBe(409);
    expect((await api.put('/api/rsvps').send({ eventId: event.id, familyId: family.id, status: 'yes', adults: 2, children: 0 })).status).toBe(200);
    expect((await api.get(`/api/events/${event.id}/detail`)).body.attending).toBe(2);
  });

  it('previews an email without sending', async () => {
    const family = (await api.get('/api/families')).body.find((f: { email?: string }) => f.email);
    const res = await api.post('/api/email/send').send({ template: 'statement', recipients: [{ familyId: family.id, year: 2026 }], dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.messages[0].to).toBe(family.email);
    expect((await api.get('/api/email/log')).body).toHaveLength(0);
  });

  it('never returns the mail password', async () => {
    const saved = await api.put('/api/email/settings').send({ port: 587, secure: false, testMode: true, password: 'hunter2' });
    expect(saved.body.hasPassword).toBe(true);
    expect(JSON.stringify((await api.get('/api/email/settings')).body)).not.toContain('hunter2');
  });

  it('serves reports as JSON and CSV', async () => {
    expect((await api.get('/api/reports/donors').query({ year: 2026 })).body.columns[0]).toBe('Family');
    const csv = await api.get('/api/reports/donationsByFund').query({ year: 2026, format: 'csv' });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect((await api.get('/api/reports/nope')).status).toBe(404);
  });
});
