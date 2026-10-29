import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import request from 'supertest';
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-host-test-');
process.env.HOST_EMAIL = 'host@platform.test';
process.env.HOST_PASSWORD = 'correct horse battery';

const { app, prepareData } = await import('./app.ts');
const { closeDatabase } = await import('./db.ts');
const api = request(app);

beforeAll(async () => {
  await prepareData();
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

describe('host multi-tenant', () => {
  let hostCookie = '';

  it('creates the host user from env and blocks CRM routes', async () => {
    const login = await api.post('/api/auth/login').send({
      email: 'host@platform.test',
      password: 'correct horse battery',
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('host');
    hostCookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await api.get('/api/families').set('Cookie', hostCookie)).status).toBe(403);
  });

  it('creates a second shul and scopes data', async () => {
    const created = await api
      .post('/api/host/organizations')
      .set('Cookie', hostCookie)
      .send({
        name: 'Second Shul',
        slug: 'second-shul',
        owner: { name: 'Second Owner', email: 'owner2@shul.test', password: 'correct horse battery' },
      });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe('second-shul');

    const ownerLogin = await api.post('/api/auth/login').send({
      email: 'owner2@shul.test',
      password: 'correct horse battery',
      orgSlug: 'second-shul',
    });
    expect(ownerLogin.status).toBe(200);
    const ownerCookie = ownerLogin.headers['set-cookie'][0].split(';')[0];
    expect((await api.get('/api/families').set('Cookie', ownerCookie)).body).toEqual([]);

    const demoOwner = await api.post('/api/auth/login').send({
      email: 'host@platform.test',
      password: 'correct horse battery',
    });
    expect(demoOwner.status).toBe(200);
  });

  it('requires org slug when the same email exists in two shuls', async () => {
    const ownerLogin = await api.post('/api/auth/login').send({
      email: 'owner2@shul.test',
      password: 'correct horse battery',
      orgSlug: 'second-shul',
    });
    expect(ownerLogin.status).toBe(200);
    const ownerCookie = ownerLogin.headers['set-cookie'][0].split(';')[0];
    const dup = await api
      .post('/api/users')
      .set('Cookie', ownerCookie)
      .send({ name: 'Also Host', email: 'host@platform.test', role: 'staff' });
    expect(dup.status).toBe(201);
    const token = String(dup.body.link).split('/welcome/')[1];
    const accepted = await api.post(`/api/auth/token/${token}`).send({ password: 'another long passphrase' });
    expect(accepted.status).toBe(200);

    const ambiguous = await api.post('/api/auth/login').send({
      email: 'host@platform.test',
      password: 'another long passphrase',
    });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error.code).toBe('choose_org');
    expect(ambiguous.body.error.organizations.length).toBe(2);
  });
});
