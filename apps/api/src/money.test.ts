import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import request from 'supertest';
import { pledgePayments } from '@shulcrm/shared';

// ---------------------------------------------------------------------------
// Money across currencies.
//
// A pledge is promised in one currency; a donation against it may be recorded
// in another. There is no exchange rate anywhere in this app, so adding the
// numbers together would understate what a family owes: a £200 payment against
// a $1,000 pledge would leave a "balance" of $800 that nobody owes in any
// currency. Money paid in the pledge's own currency counts against it; anything
// else is reported beside it and never netted off.
//
// These tests pin that rule in the one place it is computed (pledgePayments)
// and in every place the office or a family reads a balance, because a single
// screen that still adds the two together is a wrong number on a letter.
// ---------------------------------------------------------------------------

// A throwaway database, set before db.ts loads (see repo.test.ts).
import { freshTestDatabase } from './testing/test-env.ts';

const TEST_DATA_DIR = await freshTestDatabase('crm-money-test-');

const { app, prepareData } = await import('./app.ts');
const { closeDatabase } = await import('./db.ts');

// Staff calls go through an agent that keeps the owner's session cookie; the portal
// calls send a member's cookie explicitly, so a member can never ride on staff rights.
const office = request.agent(app);
const plain = request(app);

// The dashboard and the portal both work in "this year", so the fixtures live there too.
const YEAR = new Date().getFullYear();
const DATE = `${YEAR}-02-01`;

type Row = Record<string, unknown> & { id: string };

/** A staff call that must succeed, with the failing body in the message when it does not. */
async function staff<T = Row>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: object): Promise<T> {
  const req = office[method](path);
  const res = await (body === undefined ? req : req.send(body));
  expect(res.status, `${method.toUpperCase()} ${path} answered ${res.status}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  return res.body as T;
}

const family = (name: string) => staff('post', '/api/families', { name, status: 'active' });

const member = (familyId: string, firstName: string) =>
  staff('post', '/api/members', { familyId, firstName, lastName: 'Money', gender: 'male', role: 'husband', status: 'active' });

const pledge = (familyId: string, amount: number, currency: string, fund = 'General') =>
  staff('post', '/api/pledges', { fund, type: 'annual', familyId, year: YEAR, amount, currency });

const donation = (familyId: string, pledgeId: string | undefined, amount: number, currency: string, fund = 'General') =>
  staff('post', '/api/donations', { fund, familyId, pledgeId, amount, currency, date: DATE, method: 'check' });

/** Invite a member of `familyId` to the portal and hand back their session cookie. */
async function portalLogin(memberId: string, email: string): Promise<string> {
  const sent = await staff<{ link: string }>('post', '/api/users', { name: email, email, role: 'member', memberId });
  const token = String(sent.link).split('/welcome/')[1];
  const accepted = await plain.post(`/api/auth/token/${token}`).send({ password: 'bring your own passphrase' });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  const cookie = [accepted.headers['set-cookie'] ?? []].flat()[0];
  expect(cookie, 'expected a session cookie').toBeTruthy();
  return cookie.split(';')[0];
}

const accountOf = async (cookie: string) => {
  const res = await plain.get('/api/portal/account').set('Cookie', cookie);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { owed: Record<string, number>; pledges: Array<Row & { currency: string }> };
};

const statsOf = async () => (await staff<{ openPledgeBalance: Record<string, number> }>('get', '/api/dashboard/stats')).openPledgeBalance;

// The headline family: $1,000 promised, $300 and £200 paid against it.
let famHead: Row;
let headPledge: Row;
let headCookie = '';

// A family owing in two currencies at once, for the portal's `owed` map.
let famTwo: Row;
let twoCookie = '';

// A family with several pledges on one page, for the paged list's enrich step.
let famPage: Row;
const pagePledges: Record<string, Row> = {};

// A family used only for the sponsorship-release rule.
let famSponsor: Row;
let sponsorCookie = '';

beforeAll(async () => {
  await prepareData(); // seeds the demo data; leaves the user table empty
  const setup = await office
    .post('/api/auth/setup')
    .send({ name: 'Owner', email: 'owner@money.test', password: 'correct horse battery' });
  expect(setup.status).toBe(200);
  const { features } = await staff<{ features: Record<string, boolean> }>('get', '/api/settings');
  await staff('put', '/api/settings/features', { ...features, portal: true });

  // ---- the headline case -------------------------------------------------
  famHead = await family('Money Headline');
  headPledge = await pledge(famHead.id, 1000, 'USD');
  await donation(famHead.id, headPledge.id, 300, 'USD');
  await donation(famHead.id, headPledge.id, 200, 'GBP');
  headCookie = await portalLogin((await member(famHead.id, 'Head')).id, 'head@money.test');

  // ---- two currencies owed at once --------------------------------------
  famTwo = await family('Money Two Currencies');
  const twoUsd = await pledge(famTwo.id, 1000, 'USD');
  const twoGbp = await pledge(famTwo.id, 500, 'GBP', 'Building');
  await donation(famTwo.id, twoUsd.id, 400, 'USD');
  // Paid against the GBP pledge but in AUD, so it may not reduce the GBP figure either.
  await donation(famTwo.id, twoGbp.id, 50, 'AUD', 'Building');
  twoCookie = await portalLogin((await member(famTwo.id, 'Two')).id, 'two@money.test');

  // ---- several pledges on one page --------------------------------------
  famPage = await family('Money Paged');
  pagePledges.mixed = await pledge(famPage.id, 1000, 'USD');
  pagePledges.sameOnly = await pledge(famPage.id, 500, 'USD', 'Building');
  pagePledges.unpaid = await pledge(famPage.id, 800, 'USD', 'Kiddush');
  pagePledges.twoOthers = await pledge(famPage.id, 600, 'GBP', 'Chesed');
  await donation(famPage.id, pagePledges.mixed.id, 300, 'USD');
  await donation(famPage.id, pagePledges.mixed.id, 200, 'GBP');
  await donation(famPage.id, pagePledges.sameOnly.id, 500, 'USD', 'Building');
  await donation(famPage.id, pagePledges.twoOthers.id, 40, 'AUD', 'Chesed');
  await donation(famPage.id, pagePledges.twoOthers.id, 70, 'NIS', 'Chesed');

  // ---- the sponsorship family -------------------------------------------
  famSponsor = await family('Money Sponsor');
  sponsorCookie = await portalLogin((await member(famSponsor.id, 'Sponsor')).id, 'sponsor@money.test');
});

afterAll(async () => {
  try {
    await closeDatabase();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort on Windows.
  }
});

// ---------------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------------

describe('pledgePayments', () => {
  const usd1000 = { amount: 1000, currency: 'USD' };

  it('owes the whole pledge when nothing has been paid', () => {
    expect(pledgePayments(usd1000, [])).toEqual({ paid: 0, balance: 1000, paidOther: {} });
  });

  it('counts payments in the pledge’s own currency against it', () => {
    const r = pledgePayments(usd1000, [
      { amount: 300, currency: 'USD' },
      { amount: 250, currency: 'USD' },
    ]);
    expect(r).toEqual({ paid: 550, balance: 450, paidOther: {} });
  });

  // Without a rate, £200 is not worth any particular number of dollars, so the dollar
  // balance cannot move at all. It is reported separately instead of being guessed at.
  it('leaves the balance untouched when everything was paid in another currency', () => {
    const r = pledgePayments(usd1000, [{ amount: 200, currency: 'GBP' }]);
    expect(r).toEqual({ paid: 0, balance: 1000, paidOther: { GBP: 200 } });
  });

  it('splits a mixed set, totalling each other currency on its own', () => {
    const r = pledgePayments(usd1000, [
      { amount: 300, currency: 'USD' },
      { amount: 200, currency: 'GBP' },
      { amount: 25, currency: 'GBP' },
      { amount: 40, currency: 'AUD' },
    ]);
    expect(r).toEqual({ paid: 300, balance: 700, paidOther: { GBP: 225, AUD: 40 } });
  });

  // A negative balance would print as a negative "still owed" on a statement and would
  // subtract from the shul's open-pledge total, so overpayment floors at zero.
  it('floors the balance at zero when a pledge is overpaid in its own currency', () => {
    const r = pledgePayments(usd1000, [{ amount: 1200, currency: 'USD' }]);
    expect(r).toEqual({ paid: 1200, balance: 0, paidOther: {} });
    expect(r.balance).not.toBeLessThan(0);
  });

  // Callers iterate paidOther and ask whether it has keys; an absent field would throw
  // or read as "unknown" rather than "nothing was paid in another currency".
  it('always returns paidOther, empty rather than missing, when every payment matches', () => {
    const r = pledgePayments(usd1000, [{ amount: 100, currency: 'USD' }]);
    expect(r).toHaveProperty('paidOther');
    expect(r.paidOther).toEqual({});
    expect(Object.keys(r.paidOther)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The headline case, seen five ways
// ---------------------------------------------------------------------------

describe('a $1,000 pledge paid $300 and £200', () => {
  it('reports paid 300, balance 700 and the £200 beside it — not a balance of 500', async () => {
    const page = await staff<{ items: Array<Record<string, unknown>> }>('get', `/api/pledges/page?familyId=${famHead.id}&limit=50`);
    const row = page.items.find((p) => p.id === headPledge.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ amount: 1000, currency: 'USD', paid: 300, balance: 700, paidOther: { GBP: 200 } });
    // 500 is the old bug: 1000 - (300 + 200), adding pounds to dollars at an imaginary
    // rate of 1:1. It understated this family's debt by $200.
    expect(row!.balance, 'the £200 must not reduce a dollar balance').not.toBe(500);
    // And the pounds are not quietly folded into `paid` either.
    expect(row!.paid).toBe(300);
  });

  it('says the same on the year-end statement', async () => {
    const statement = await staff<{ pledges: Array<Record<string, unknown>>; totals: Record<string, number> }>(
      'get',
      `/api/documents/statement/${famHead.id}?year=${YEAR}`,
    );
    const row = statement.pledges.find((p) => p.id === headPledge.id);
    expect(row).toMatchObject({ amount: 1000, paid: 300, balance: 700, paidOther: { GBP: 200 } });
    // The receipts half of the statement still lists both gifts, each in its own currency.
    expect(statement.totals).toMatchObject({ USD: 300, GBP: 200 });
  });

  it('says the same on the family’s own portal page', async () => {
    const account = await accountOf(headCookie);
    const row = account.pledges.find((p) => p.id === headPledge.id);
    expect(row).toMatchObject({ amount: 1000, paid: 300, balance: 700, paidOther: { GBP: 200 } });
    // What the family is told it owes is the same $700 — the £200 is not a dollar discount.
    expect(account.owed).toEqual({ USD: 700 });
  });

  it('says the same on the pledge status report, in its own column', async () => {
    const report = await staff<{ columns: string[]; rows: unknown[][] }>('get', `/api/reports/pledgeStatus?year=${YEAR}`);
    const other = report.columns.indexOf('Paid in other currencies');
    expect(other).toBeGreaterThan(-1);
    const row = report.rows.find((r) => r[0] === 'Money Headline' && r[1] === 'General');
    expect(row).toBeDefined();
    expect(row![2]).toBe('USD');
    expect(row![3]).toBe(1000); // pledged
    expect(row![4]).toBe(300); // paid, in the pledge's currency
    expect(row![5]).toBe(700); // still owed
    expect(row![other]).toBe('200 GBP');
  });
});

// ---------------------------------------------------------------------------
// The shul's own totals
// ---------------------------------------------------------------------------

describe('the dashboard', () => {
  it('does not reduce the open pledge balance by a payment in another currency', async () => {
    const fam = await family('Money Dashboard');
    const p = await pledge(fam.id, 1000, 'USD');
    const before = await statsOf();

    await donation(fam.id, p.id, 200, 'GBP');
    const afterPounds = await statsOf();
    // The dollar figure is the shul's own planning number. Taking £200 off it would say
    // $200 less is expected when not a cent of the dollar pledge has been paid.
    expect(afterPounds.USD).toBe(before.USD);
    // Nor does it come off the GBP figure, which is about pledges promised in pounds.
    expect(afterPounds.GBP).toBe(before.GBP);

    // A payment in the pledge's own currency does reduce it, which is the other half of the rule.
    await donation(fam.id, p.id, 300, 'USD');
    expect((await statsOf()).USD).toBe(before.USD - 300);
  });
});

// ---------------------------------------------------------------------------
// A family owing in more than one currency
// ---------------------------------------------------------------------------

describe('the portal’s owed map', () => {
  it('owes the right amount in each currency, with the AUD payment moving neither', async () => {
    const account = await accountOf(twoCookie);
    // $1,000 pledged less $400 paid; £500 pledged with nothing paid in pounds. The AUD 50
    // recorded against the GBP pledge appears beside it and is not netted off either figure.
    expect(account.owed).toEqual({ USD: 600, GBP: 500 });
    expect(account.pledges.find((p) => p.currency === 'USD')).toMatchObject({ paid: 400, balance: 600, paidOther: {} });
    expect(account.pledges.find((p) => p.currency === 'GBP')).toMatchObject({ paid: 0, balance: 500, paidOther: { AUD: 50 } });
    // No AUD line: nothing was ever *promised* in AUD, so the family owes nothing in it.
    expect(account.owed.AUD).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The paged list's second query
// ---------------------------------------------------------------------------

describe('the paged pledge list with several pledges on the page', () => {
  it('fills paidOther for each row, as an empty object where there is nothing to say', async () => {
    const page = await staff<{ items: Array<Record<string, unknown>> }>('get', `/api/pledges/page?familyId=${famPage.id}&limit=50`);
    expect(page.items).toHaveLength(4);
    const byId = new Map(page.items.map((p) => [p.id, p]));

    expect(byId.get(pagePledges.mixed.id)).toMatchObject({ paid: 300, balance: 700, paidOther: { GBP: 200 } });

    // Paid in full in its own currency. `paidOther` must be present and empty: the enrich
    // step runs one grouped query for the whole page, and a pledge missing from that
    // query's result must still come back with a field the UI can iterate.
    const same = byId.get(pagePledges.sameOnly.id)!;
    expect(same).toMatchObject({ paid: 500, balance: 0 });
    expect(same.paidOther).toEqual({});
    expect(same.paidOther).toBeDefined();

    const unpaid = byId.get(pagePledges.unpaid.id)!;
    expect(unpaid).toMatchObject({ paid: 0, balance: 800 });
    expect(unpaid.paidOther).toEqual({});
    expect(unpaid.paidOther).toBeDefined();

    // Two different other currencies against one pledge: each keeps its own total, and
    // neither touches the balance.
    expect(byId.get(pagePledges.twoOthers.id)).toMatchObject({ paid: 0, balance: 600, paidOther: { AUD: 40, NIS: 70 } });

    // Every row on the page has the field, whatever its payments look like.
    for (const row of page.items) expect(row.paidOther, `pledge ${row.id} has no paidOther`).toBeDefined();
  });

  it('keeps the page’s per-currency totals about what was pledged, not what was paid', async () => {
    const page = await staff<{ totals: Record<string, number> }>('get', `/api/pledges/page?familyId=${famPage.id}&limit=50`);
    expect(page.totals).toEqual({ USD: 2300, GBP: 600 });
  });
});

// ---------------------------------------------------------------------------
// Releasing a sponsorship claim: deliberately NOT currency-filtered
// ---------------------------------------------------------------------------

describe('releasing a sponsorship claim', () => {
  it('is refused once anything has been paid against the pledge, even in another currency', async () => {
    const s = await staff<Row & { id: string }>('post', '/api/sponsorships', {
      title: 'Money Kiddush',
      date: `${YEAR}-12-05`,
      fund: 'Kiddush',
      currency: 'GBP',
      suggestedAmount: 200,
      maxSponsors: 1,
      open: true,
    });
    const claimed = await plain.post(`/api/portal/sponsorships/${s.id}/claim`).set('Cookie', sponsorCookie).send({});
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(201);
    const claim = claimed.body as { id: string; pledgeId: string };

    // A dollar gift against a pledge promised in pounds. It cannot reduce the £200 balance —
    // but the release check is about whether a receipted gift exists at all, not about what
    // it is worth, so it is deliberately not filtered by currency: dropping the pledge would
    // leave that receipt pointing at nothing. The office has to sort it out.
    await donation(famSponsor.id, claim.pledgeId, 50, 'USD', 'Kiddush');

    const released = await plain.delete(`/api/portal/claims/${claim.id}`).set('Cookie', sponsorCookie);
    expect(released.status, JSON.stringify(released.body)).toBe(409);
    // The pledge is still there, and still owed in full in its own currency.
    const page = await staff<{ items: Array<Record<string, unknown>> }>('get', `/api/pledges/page?familyId=${famSponsor.id}&limit=50`);
    const row = page.items.find((p) => p.id === claim.pledgeId);
    expect(row).toMatchObject({ amount: 200, currency: 'GBP', paid: 0, balance: 200, paidOther: { USD: 50 } });
  });
});
