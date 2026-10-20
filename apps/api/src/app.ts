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
  ROLES,
  acceptInviteSchema,
  can,
  changePasswordSchema,
  inviteSchema,
  loginSchema,
  setupSchema,
  type Permission,
  type Session,
  type User,
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
import * as paging from './paging.ts';
import * as backups from './backups.ts';
import { readTable, writeCsv, writeXlsx } from './spreadsheet.ts';
import { log } from './log.ts';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as auth from './auth.ts';
import { currentUser, runWithUser } from './context.ts';
import { audit, auditLog, describe, diff } from './audit.ts';

// ---------------------------------------------------------------------------
// Shul CRM — the API app (Express 4 + SQLite via repo.ts): routes, validation,
// and the error shape. index.ts starts it; tests load it directly (supertest).
// Web talks to /api/* (Vite dev proxy -> http://localhost:3000).
// ---------------------------------------------------------------------------

const app = express();

// Express builds its router on the first app.use, so this has to be set before any of them:
// otherwise the router keeps the default, and "/api/RESET" would reach the reset route.
app.set('case sensitive routing', true);

app.use(express.json());

// One log line per request: method, route pattern (ids and search text stay out), status, time.
app.use((req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    // The path without its query string, with ids and backup names replaced by placeholders.
    const route = req.originalUrl
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/crm-[\w-]+\.sqlite/g, ':name');
    const entry = { method: req.method, route, status: res.statusCode, ms: Math.round(performance.now() - start) };
    if (res.statusCode >= 500) log.error(entry, 'request');
    else log.info(entry, 'request');
  });
  next();
});

// ---------------------------------------------------------------------------
// Security: headers, same-origin only, sessions, and who may do what.
// ---------------------------------------------------------------------------

// Behind an HTTPS proxy (Phase 7), trust its X-Forwarded-* so cookies get Secure.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet());

// No CORS headers: only pages served from this app (or the dev server) may call it. Changes must
// also come from one of those pages: browsers send Origin on every non-GET request.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean),
);
app.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // not a browser (scripts, tests)
  const sameHost = (() => {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  })();
  if (sameHost || ALLOWED_ORIGINS.has(origin)) return next();
  next(new auth.AuthError(403, 'Requests from other sites are not allowed'));
});

// Who is signed in (from the session cookie), for the rest of the request.
app.use((req, _res, next) => {
  runWithUser(auth.sessionUser(auth.readSessionCookie(req)), next);
});

// Every API route needs a permission, a signed-in user, or is public. First match wins.
type Rule = [methods: string[] | '*', prefix: string, need: Permission | 'public' | 'signed-in'];
const RULES: Rule[] = [
  ['*', '/api/health', 'public'],
  ['*', '/api/auth/', 'public'], // each auth route checks for itself
  [['GET'], '/api/settings/public', 'public'],
  [['GET'], '/api/org/logo', 'public'],
  [['GET'], '/api/settings', 'signed-in'],
  ['*', '/api/settings', 'settings.write'],
  ['*', '/api/org/logo', 'settings.write'],
  ['*', '/api/email/settings', 'settings.write'],
  [['PUT'], '/api/email/templates', 'settings.write'],
  ['*', '/api/email/', 'email.send'],
  ['*', '/api/users', 'users.manage'],
  ['*', '/api/audit', 'audit.read'],
  ['*', '/api/backups', 'backups'],
  ['*', '/api/reset', 'data.reset'],
  ['*', '/api/import', 'data.import'],
  ['*', '/api/portal', 'portal'],
  [['GET'], '/api/', 'records.read'],
  ['*', '/api/', 'records.write'],
];
/** "/api/settings" covers /api/settings and /api/settings/…, but not /api/settingsX. */
const under = (path: string, prefix: string) => {
  const base = prefix.replace(/\/$/, '');
  return path === base || path.startsWith(`${base}/`);
};
app.use('/api', (req, _res, next) => {
  // Matched lower-case so a rule cannot be dodged by spelling the path differently. Express is
  // also set to route case-sensitively above; neither guard relies on the other.
  const path = req.originalUrl.split('?')[0].toLowerCase();
  const rule = RULES.find(([methods, prefix]) => (methods === '*' || methods.includes(req.method)) && under(path, prefix));
  // Nothing matched: refuse rather than guess. The last two rules cover every /api path, so this
  // only happens for a path that reached us looking like something else.
  if (!rule) return next(new auth.AuthError(403, 'Not allowed'));
  const need = rule[2];
  if (need === 'public') return next();
  const user = currentUser();
  if (!user) return next(new auth.AuthError(401, 'Please sign in'));
  if (need === 'signed-in' || can(user.role, need)) return next();
  next(new auth.AuthError(403, 'Your role does not allow this'));
});

// Slow down password guessing: a few tries per address per quarter hour.
const tooMany = rateLimit({
  windowMs: 15 * 60_000,
  limit: process.env.VITEST ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Wait a few minutes and try again.' } },
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
    const created = e.create(data as I) as Record<string, unknown>;
    audit('create', { entity, entityId: String(created.id), summary: describe(entity, created), changes: created });
    res.status(201).json(created);
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
    const before = repo.get<Record<string, unknown>>(entity, req.params.id);
    const after = e.update(req.params.id, patch as Partial<I>) as Record<string, unknown>;
    const changes = before ? diff(before, after) : {};
    if (Object.keys(changes).length > 0) {
      audit('update', { entity, entityId: req.params.id, summary: describe(entity, after), changes });
    }
    res.json(after);
  });
  router.delete('/:id', (req, res) => {
    const before = repo.get<Record<string, unknown>>(entity, req.params.id);
    if (!e.remove(req.params.id)) throw new repo.NotFound(`${req.originalUrl}: not found`);
    if (before) audit('delete', { entity, entityId: req.params.id, summary: describe(entity, before), changes: before });
    res.status(204).end();
  });
  return router;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sign-in, setup, invitations, users, audit log
// ---------------------------------------------------------------------------

const asyncRoute =
  (fn: (req: express.Request, res: express.Response) => Promise<void>): express.RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Start a session for `user` and answer with it. */
function signIn(req: express.Request, res: express.Response, user: User): void {
  auth.setSessionCookie(req, res, auth.startSession(user.id));
  res.json({ user, needsSetup: false, setupNeedsCode: false } satisfies Session);
}

app.get('/api/auth/session', (req, res) => {
  const needsSetup = auth.userCount() === 0;
  res.json({ user: currentUser() ?? null, needsSetup, setupNeedsCode: needsSetup && auth.setupRequiresCode(req) } satisfies Session);
});
app.post(
  '/api/auth/login',
  tooMany,
  asyncRoute(async (req, res) => {
    const { email: address, password } = loginSchema.parse(req.body);
    try {
      const user = await auth.login(address, password);
      runWithUser(user, () => audit('login'));
      signIn(req, res, user);
    } catch (err) {
      audit('login.failed', { summary: address.toLowerCase() });
      throw err;
    }
  }),
);
app.post('/api/auth/logout', (req, res) => {
  if (currentUser()) audit('logout');
  auth.endSession(auth.readSessionCookie(req));
  auth.setSessionCookie(req, res, null);
  res.status(204).end();
});
app.post(
  '/api/auth/setup',
  tooMany,
  asyncRoute(async (req, res) => {
    const user = await auth.setupOwner(req, setupSchema.parse(req.body));
    runWithUser(user, () => audit('setup', { entity: 'users', entityId: user.id, summary: user.name }));
    signIn(req, res, user);
  }),
);
app.get('/api/auth/token/:token', tooMany, (req, res) => {
  res.json(auth.describeToken(req.params.token));
});
app.post(
  '/api/auth/token/:token',
  tooMany,
  asyncRoute(async (req, res) => {
    const { password } = acceptInviteSchema.parse(req.body);
    const user = await auth.useToken(req.params.token, password);
    runWithUser(user, () => audit('password.set', { entity: 'users', entityId: user.id, summary: user.name }));
    signIn(req, res, user);
  }),
);
app.post(
  '/api/auth/password',
  asyncRoute(async (req, res) => {
    const user = currentUser();
    if (!user) throw new auth.AuthError(401, 'Please sign in');
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await auth.changePassword(user, currentPassword, newPassword);
    // Other devices sign in again; this one stays signed in.
    auth.endSessionsFor(user.id, auth.readSessionCookie(req));
    audit('password.changed', { entity: 'users', entityId: user.id, summary: user.name });
    res.status(204).end();
  }),
);

const actor = () => currentUser() as User; // the access rules guarantee a user on these routes
const inviteLink = (req: express.Request, token: string) =>
  `${process.env.PUBLIC_URL?.replace(/\/$/, '') ?? `${req.protocol}://${req.headers.host ?? 'localhost'}`}/welcome/${token}`;

app.get('/api/users', (_req, res) => {
  res.json(auth.listUsers());
});
app.post('/api/users', (req, res) => {
  const { user, token } = auth.invite(actor(), inviteSchema.parse(req.body));
  audit('user.invited', { entity: 'users', entityId: user.id, summary: `${user.name} as ${user.role}` });
  res.status(201).json({ user, link: inviteLink(req, token) });
});
app.patch('/api/users/:id', (req, res) => {
  const patch = z
    .object({ role: z.enum(ROLES).optional(), status: z.enum(['active', 'disabled']).optional(), name: z.string().trim().min(1).optional() })
    .parse(req.body);
  const before = auth.getUser(req.params.id);
  const user = auth.updateUser(actor(), req.params.id, patch);
  if (before) audit('user.changed', { entity: 'users', entityId: user.id, summary: user.name, changes: diff(before, user) });
  res.json(user);
});
app.post('/api/users/:id/link', (req, res) => {
  const { user, token, purpose } = auth.newLinkFor(actor(), req.params.id);
  audit(purpose === 'invite' ? 'user.reinvited' : 'user.reset-link', { entity: 'users', entityId: user.id, summary: user.name });
  res.json({ user, link: inviteLink(req, token), purpose });
});
app.get('/api/audit', (req, res) => {
  const q = z
    .object({ entity: z.string().optional(), entityId: z.string().optional(), before: z.string().optional(), limit: z.coerce.number().optional() })
    .parse(req.query);
  res.json(auditLog(q));
});

app.get('/api/dashboard/stats', (_req, res) => {
  res.json(repo.dashboardStats());
});

// Shul settings: org profile, features, terms, lists, and the logo.
app.get('/api/settings', (_req, res) => {
  res.json(settings.getSettings());
});
// What the sign-in page needs: the shul's name, colors and logo. Nothing else is public.
app.get('/api/settings/public', (_req, res) => {
  const { org, hasLogo, logoVersion } = settings.getSettings();
  res.json({ name: org.name, shortName: org.shortName, primaryColor: org.primaryColor, secondaryColor: org.secondaryColor, locale: org.locale, hasLogo, logoVersion });
});
app.put('/api/settings/org', (req, res) => {
  const org = settings.saveOrg(req.body);
  audit('settings.org', { summary: org.name });
  res.json(org);
});
app.put('/api/settings/features', (req, res) => {
  const features = settings.saveFeatures(req.body);
  audit('settings.features', { changes: features });
  res.json(features);
});
app.put('/api/settings/terms', (req, res) => {
  const terms = settings.saveTerms(req.body);
  audit('settings.terms', { changes: terms });
  res.json(terms);
});
app.get('/api/settings/lookups/:kind/usage', (req, res) => {
  if (!(LOOKUP_KINDS as readonly string[]).includes(req.params.kind)) throw new repo.NotFound('Unknown list');
  res.json(settings.lookupUsage(req.params.kind as LookupKind));
});
app.put('/api/settings/lookups/:kind', (req, res) => {
  const lookups = settings.saveLookup(req.params.kind, req.body);
  audit('settings.list', { entity: req.params.kind, summary: `${req.params.kind} list saved` });
  res.json(lookups);
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
    audit('settings.logo', { summary: 'logo uploaded' });
    res.json(settings.getSettings());
  },
);
app.delete('/api/org/logo', (_req, res) => {
  settings.removeLogo();
  audit('settings.logo', { summary: 'logo removed' });
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
  const rsvp = events.saveRsvp(rsvpInputSchema.parse(req.body));
  audit('rsvp', { entity: 'events', entityId: rsvp.eventId, summary: `${rsvp.status}: ${rsvp.adults} adults, ${rsvp.children} children` });
  res.json(rsvp);
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
  const view = email.saveEmailSettings(req.body);
  audit('settings.email', { summary: view.testMode ? 'test mode' : 'live' });
  res.json(view);
});
app.get('/api/email/templates', (_req, res) => {
  res.json(email.getTemplates());
});
app.put('/api/email/templates', (req, res) => {
  const templates = email.saveTemplates(req.body);
  audit('settings.templates');
  res.json(templates);
});
app.post('/api/email/send', async (req, res, next) => {
  try {
    const result = await email.sendEmails(req.body);
    const body = req.body as { template?: string; dryRun?: boolean };
    if (!body.dryRun) audit('email.sent', { summary: `${body.template}: ${result.sent} sent, ${result.failed} failed` });
    res.json(result);
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
  const result = importExport.commitImport(importEntity(req.params.entity), req.body as ImportRequest);
  audit('import', { entity: req.params.entity, summary: `${result.created} imported, ${result.skipped} skipped` });
  res.json(result);
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

// Backups: snapshots of the whole database (one file), listed, made on demand, downloaded.
app.get('/api/backups', (_req, res) => {
  res.json(backups.listBackups());
});
app.post('/api/backups', (_req, res) => {
  const b = backups.snapshot('manual');
  audit('backup.made', { summary: b.name });
  res.status(201).json(b);
});
app.get('/api/backups/:name/download', (req, res, next) => {
  res.download(backups.backupPath(req.params.name), req.params.name, (err) => {
    if (err && !res.headersSent) next(err);
  });
});
app.delete('/api/backups/:name', (req, res) => {
  backups.deleteBackup(req.params.name);
  audit('backup.deleted', { summary: req.params.name });
  res.status(204).end();
});

app.post('/api/reset', (_req, res) => {
  // A reset deletes every record, so keep a copy of what was there first.
  backups.snapshot('reset');
  repo.reseed();
  audit('data.reset');
  res.json({ ok: true });
});

// Paged, searchable, sortable lists. Registered before the resource routers so /page isn't read as an id.
for (const list of paging.PAGED_LISTS) {
  app.get(`/api/${list}/page`, (req, res) => {
    res.json(paging.page(list, req.query as Record<string, unknown>));
  });
}
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
  if (err instanceof auth.AuthError) {
    res.status(err.status).json({ error: { message: err.message } });
    return;
  }
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
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { message: 'Internal server error' } });
};
app.use(errorHandler);

/** First boot: seed the demo data (the database starts empty); then align the lists with the data. */
export async function prepareData(): Promise<void> {
  if (repo.families.list().length === 0) {
    repo.reseed();
    log.info('seeded demo data');
  }
  settings.reconcileLookups();
  await auth.ownerFromEnv();
  auth.prepareSetup();
}

export { app };
