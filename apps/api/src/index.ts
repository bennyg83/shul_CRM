import express, { type ErrorRequestHandler } from 'express';
import { ZodError, z } from 'zod';
import type { ZodObject, ZodRawShape } from 'zod';
import {
  donationInputSchema,
  familyInputSchema,
  importantDateInputSchema,
  memberInputSchema,
  noteInputSchema,
  pledgeInputSchema,
  daysBetweenISO,
} from '@pilzno/shared';
import type {
  DonationInput,
  FamilyInput,
  ImportantDateInput,
  MemberInput,
  NoteInput,
  PledgeInput,
} from '@pilzno/shared';
import * as repo from './repo.ts';

// ---------------------------------------------------------------------------
// Pilzno Synagogue CRM — API server (Express 4 + SQLite via repo.ts)
// Dev: `npm run dev:api` from the repo root (node --watch, port 3000)
// Web talks to /api/* (Vite dev proxy -> http://localhost:3000).
// ---------------------------------------------------------------------------

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Local single-user app: allow any origin + handle preflight.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

/**
 * Validate a PATCH body. Fields left out are unchanged; `null` clears an optional field
 * (JSON has no `undefined`, so without this a cleared phone number could never be removed).
 */
function parsePatch(input: ZodObject<ZodRawShape>, body: unknown): Record<string, unknown> {
  const fields = z.record(z.unknown()).parse(body);
  const cleared: Record<string, null> = {};
  const issues: z.ZodIssue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null || !(key in input.shape)) continue;
    if (input.shape[key] instanceof z.ZodOptional) cleared[key] = null;
    else issues.push({ code: 'custom', path: [key], message: 'Required; it cannot be cleared' });
    delete fields[key];
  }
  if (issues.length > 0) throw new ZodError(issues);
  return { ...input.partial().parse(fields), ...cleared };
}

// Standard REST routes for one entity (list/create on /, get/patch/delete on /:id).
// Entities without a `get` (pledges, donations, ...) simply skip GET /:id.
function resourceRoutes<I>(
  input: ZodObject<ZodRawShape>,
  e: {
    list(): unknown[];
    get?(id: string): unknown | undefined;
    create(i: I): unknown;
    update(id: string, patch: Partial<I>): unknown;
    remove(id: string): boolean;
  },
) {
  const router = express.Router();
  router.get('/', (_req, res) => {
    res.json(e.list());
  });
  router.post('/', (req, res) => {
    res.status(201).json(e.create(input.parse(req.body) as I));
  });
  if (e.get) {
    const get = e.get;
    router.get('/:id', (req, res) => {
      const row = get(req.params.id);
      if (row === undefined) throw new repo.NotFound(`${req.originalUrl}: not found`);
      res.json(row);
    });
  }
  router.patch('/:id', (req, res) => {
    res.json(e.update(req.params.id, parsePatch(input, req.body) as Partial<I>));
  });
  router.delete('/:id', (req, res) => {
    if (!e.remove(req.params.id)) throw new repo.NotFound(`${req.originalUrl}: not found`);
    res.status(204).end();
  });
  return router;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/dashboard/stats', (_req, res) => {
  res.json(repo.dashboardStats());
});

app.post('/api/reset', (_req, res) => {
  repo.reseed();
  res.json({ ok: true });
});

app.use('/api/families', resourceRoutes<FamilyInput>(familyInputSchema, repo.families));
app.use('/api/members', resourceRoutes<MemberInput>(memberInputSchema, repo.members));
app.use('/api/pledges', resourceRoutes<PledgeInput>(pledgeInputSchema, repo.pledges));
app.use('/api/donations', resourceRoutes<DonationInput>(donationInputSchema, repo.donations));

// Aggregate "upcoming" view across families. Registered before the resource
// router so GET /upcoming is never captured by a /:id handler.
app.get('/api/important-dates/upcoming', (req, res) => {
  const days = Number(req.query.days ?? 90);
  res.json(repo.upcomingImportantDates(Number.isFinite(days) && days > 0 ? Math.floor(days) : 90));
});
// Every occurrence in a date range (the calendar). At most about 13 months per request.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
app.get('/api/important-dates/occurrences', (req, res) => {
  const { from, to } = z.object({ from: isoDateSchema, to: isoDateSchema }).parse(req.query);
  if (to < from || daysBetweenISO(from, to) > 400) {
    res.status(400).json({ error: { message: '`to` must be on or after `from`, at most 400 days later' } });
    return;
  }
  res.json(repo.dateOccurrences(from, to));
});
app.use(
  '/api/important-dates',
  resourceRoutes<ImportantDateInput>(importantDateInputSchema, repo.importantDates),
);
app.use('/api/notes', resourceRoutes<NoteInput>(noteInputSchema, repo.notes));

// Composed detail views (one entity + its related records, for the detail modals).
// Registered after the resource routes; the two-segment path does not match GET /:id.
app.get('/api/families/:id/detail', (req, res) => {
  res.json(repo.familyDetail(req.params.id));
});

app.get('/api/members/:id/detail', (req, res) => {
  res.json(repo.memberDetail(req.params.id));
});

// 404 for unmatched routes.
app.use((req, res) => {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.originalUrl}` } });
});

// Single error shape for all non-2xx JSON responses (@pilzno/shared apiErrorSchema).
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof repo.NotFound) {
    res.status(404).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Invalid input',
        issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: { message: 'Malformed JSON body' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
app.use(errorHandler);

// First boot: seed deterministic demo data (the SQLite db starts empty).
if (repo.families.list().length === 0) {
  repo.reseed();
  console.log('[api] seeded demo data');
}

// There is no login yet (ROADMAP Phase 5), so only this machine may connect.
// Set HOST=0.0.0.0 to expose it on the network once auth exists.
const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});
