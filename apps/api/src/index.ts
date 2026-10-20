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
  IMPORT_ENTITIES,
  REPORTS,
  eventInputSchema,
  rsvpInputSchema,
  type EventInput,
  type ReportKey,
  IMPORT_SPECS,
  LOOKUP_KINDS,
  type ImportEntity,
  type ImportRequest,
  daysBetweenISO,
  type LookupKind,
} from '@shulcrm/shared';
import type {
  DonationInput,
  FamilyInput,
  ImportantDateInput,
  MemberInput,
  NoteInput,
  PledgeInput,
} from '@shulcrm/shared';
import * as repo from './repo.ts';
import * as settings from './settings.ts';
import * as importExport from './importExport.ts';
import * as events from './events.ts';
import * as documents from './documents.ts';
import * as email from './email.ts';
import * as reports from './reports.ts';
import { readTable, writeCsv, writeXlsx } from './spreadsheet.ts';

// ---------------------------------------------------------------------------
// Shul CRM — API server (Express 4 + SQLite via repo.ts)
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
  entity: string,
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
    const data = input.parse(req.body);
    settings.checkLookups(entity, data);
    res.status(201).json(e.create(data as I));
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
    const patch = parsePatch(input, req.body);
    settings.checkLookups(entity, patch);
    res.json(e.update(req.params.id, patch as Partial<I>));
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

// Shul settings: org profile, features, terms, lists, and the logo.
app.get('/api/settings', (_req, res) => {
  res.json(settings.getSettings());
});
app.put('/api/settings/org', (req, res) => {
  res.json(settings.saveOrg(req.body));
});
app.put('/api/settings/features', (req, res) => {
  res.json(settings.saveFeatures(req.body));
});
app.put('/api/settings/terms', (req, res) => {
  res.json(settings.saveTerms(req.body));
});
app.get('/api/settings/lookups/:kind/usage', (req, res) => {
  if (!(LOOKUP_KINDS as readonly string[]).includes(req.params.kind)) throw new repo.NotFound('Unknown list');
  res.json(settings.lookupUsage(req.params.kind as LookupKind));
});
app.put('/api/settings/lookups/:kind', (req, res) => {
  res.json(settings.saveLookup(req.params.kind, req.body));
});
app.get('/api/org/logo', (_req, res) => {
  const logo = settings.getLogo();
  if (!logo) throw new repo.NotFound('No logo has been uploaded');
  res.setHeader('Content-Type', logo.contentType);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Last-Modified', new Date(logo.updatedAt).toUTCString());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(logo.data));
});
app.put(
  '/api/org/logo',
  express.raw({ type: () => true, limit: settings.LOGO_MAX_BYTES + 1024 }),
  (req, res) => {
    settings.saveLogo(new Uint8Array(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)));
    res.json(settings.getSettings());
  },
);
app.delete('/api/org/logo', (_req, res) => {
  settings.removeLogo();
  res.status(204).end();
});

// Events and RSVPs. /summary is registered before the resource router so it isn't read as an id.
app.get('/api/events/summary', (req, res) => {
  const { from, to } = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).parse(req.query);
  res.json(events.eventSummaries(from, to));
});
app.get('/api/events/:id/detail', (req, res) => {
  res.json(events.eventDetail(req.params.id));
});
app.use('/api/events', resourceRoutes<EventInput>('events', eventInputSchema, events.events));
app.put('/api/rsvps', (req, res) => {
  res.json(events.saveRsvp(rsvpInputSchema.parse(req.body)));
});
app.delete('/api/rsvps/:id', (req, res) => {
  if (!events.removeRsvp(req.params.id)) throw new repo.NotFound('RSVP not found');
  res.status(204).end();
});

// Printable documents (the web prints them; Save as PDF gives a PDF).
const yearSchema = z.coerce.number().int().min(1900).max(2200);
app.get('/api/documents/receipt/:donationId', (req, res) => {
  res.json(documents.receipt(req.params.donationId));
});
app.get('/api/documents/statement/:familyId', (req, res) => {
  res.json(documents.statement(req.params.familyId, yearSchema.parse(req.query.year)));
});
app.get('/api/documents/statements', (req, res) => {
  res.json(documents.statements(yearSchema.parse(req.query.year)));
});
app.get('/api/documents/yahrzeits', (req, res) => {
  const { from, to } = z.object({ from: isoDateSchema, to: isoDateSchema }).parse(req.query);
  if (to < from || daysBetweenISO(from, to) > 400) throw new settings.BadRequest('Choose a range of at most 400 days');
  res.json(documents.yahrzeitNotices(from, to));
});

// Email: settings (password write-only), templates, sending, and the log.
app.get('/api/email/settings', (_req, res) => {
  res.json(email.emailSettingsView());
});
app.put('/api/email/settings', (req, res) => {
  res.json(email.saveEmailSettings(req.body));
});
app.get('/api/email/templates', (_req, res) => {
  res.json(email.getTemplates());
});
app.put('/api/email/templates', (req, res) => {
  res.json(email.saveTemplates(req.body));
});
app.post('/api/email/send', async (req, res, next) => {
  try {
    res.json(await email.sendEmails(req.body));
  } catch (err) {
    next(err);
  }
});
app.post('/api/email/test', async (req, res, next) => {
  try {
    res.json(await email.sendTestEmail((req.body as { to?: unknown })?.to));
  } catch (err) {
    next(err);
  }
});
app.get('/api/email/log', (_req, res) => {
  res.json(email.emailLog());
});

// Reports, as JSON or CSV (?format=csv).
app.get('/api/reports/:key', (req, res) => {
  const key = req.params.key;
  if (!REPORTS.some((r) => r.key === key)) throw new repo.NotFound(`No report "${key}"`);
  const year = req.query.year === undefined ? new Date().getFullYear() : yearSchema.parse(req.query.year);
  const table = reports.report(key as ReportKey, year);
  if (req.query.format === 'csv') {
    const name = `${settings.getOrg().shortName}-${key}-${year}`.replace(/[^\p{L}\p{N}._-]+/gu, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.csv`);
    res.send(writeCsv(table.columns, table.rows));
    return;
  }
  res.json(table);
});

// Import (CSV or Excel): parse the upload, preview with a column mapping, then commit.
// Export: every record of one kind as CSV or Excel, with the same column names.
const importEntity = (name: string): ImportEntity => {
  if (!(IMPORT_ENTITIES as readonly string[]).includes(name)) throw new repo.NotFound(`Cannot import or export "${name}"`);
  return name as ImportEntity;
};
app.post(
  '/api/import/parse',
  express.raw({ type: () => true, limit: '10mb' }),
  (req, res) => {
    const data = new Uint8Array(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    if (data.length === 0) throw new settings.BadRequest('The upload was empty');
    let table: string[][];
    try {
      table = readTable(data);
    } catch (err) {
      throw new settings.BadRequest(err instanceof Error ? err.message : 'Could not read the file');
    }
    if (table.length === 0) throw new settings.BadRequest('The file has no rows');
    const [headers, ...rows] = table;
    if (rows.length > importExport.MAX_IMPORT_ROWS) {
      throw new settings.BadRequest(`At most ${importExport.MAX_IMPORT_ROWS} rows per import`);
    }
    res.json({ headers, rows });
  },
);
app.post('/api/import/:entity/preview', express.json({ limit: '20mb' }), (req, res) => {
  res.json(importExport.previewImport(importEntity(req.params.entity), req.body as ImportRequest));
});
app.post('/api/import/:entity/commit', express.json({ limit: '20mb' }), (req, res) => {
  res.json(importExport.commitImport(importEntity(req.params.entity), req.body as ImportRequest));
});
app.get('/api/export/:entity', (req, res) => {
  const entity = importEntity(req.params.entity);
  const { headers, rows } = importExport.exportTable(entity);
  const org = settings.getOrg();
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${org.shortName}-${entity}-${stamp}`.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  // The install id travels with the export (ROADMAP ground rules: where a file came from).
  res.setHeader('X-Org-Id', org.orgId);
  if (req.query.format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(base)}.xlsx`);
    res.send(Buffer.from(writeXlsx(IMPORT_SPECS[entity].label, headers, rows)));
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(base)}.csv`);
  res.send(writeCsv(headers, rows));
});

app.post('/api/reset', (_req, res) => {
  repo.reseed();
  res.json({ ok: true });
});

app.use('/api/families', resourceRoutes<FamilyInput>('families', familyInputSchema, repo.families));
app.use('/api/members', resourceRoutes<MemberInput>('members', memberInputSchema, repo.members));
app.use('/api/pledges', resourceRoutes<PledgeInput>('pledges', pledgeInputSchema, repo.pledges));
app.use('/api/donations', resourceRoutes<DonationInput>('donations', donationInputSchema, repo.donations));

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
  resourceRoutes<ImportantDateInput>('importantDates', importantDateInputSchema, repo.importantDates),
);
app.use('/api/notes', resourceRoutes<NoteInput>('notes', noteInputSchema, repo.notes));

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

// Single error shape for all non-2xx JSON responses (@shulcrm/shared apiErrorSchema).
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof settings.BadRequest) {
    res.status(400).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof settings.Conflict) {
    res.status(409).json({ error: { message: err.message } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'The upload is too large' } });
    return;
  }
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
settings.reconcileLookups();

// There is no login yet (ROADMAP Phase 5), so only this machine may connect.
// Set HOST=0.0.0.0 to expose it on the network once auth exists.
const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});
