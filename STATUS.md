# Shul CRM — Task Status (reference install: Pilzno)

> Last updated: 2026-10-20 · Plan: see `ROADMAP.md` (old plans in `docs/archive/`)
> Working directory: `C:\Users\binya\Documents\CRM 3\CRM 3`
> Build mode: **Mode C — Monorepo** (api + web + shared; real API over SQLite, web is a thin client)

## Current Stage

**Stage 2 — API + Web wiring: COMPLETE** (real Express + SQLite API; web is a thin client over HTTP).

The app migrated from the Mode B sandbox (single React app, localStorage mock) to a three-workspace
monorepo with a real Express + SQLite API. Since the last status update the core CRUD surface is built
end-to-end and verified: **Families** (with duplicate detection), **Members**, **Pledges & Donations**, **Notes**, **Important Dates**, an aggregate upcoming-dates page, and a **Calendar** view (month grid with date highlights), plus dashboard stats

### Architecture

```
pilzno-crm/
├── apps/
│   ├── api/                  # @shulcrm/api — Express 4 + node:sqlite (zero native deps)
│   │   └── src/
│   │       ├── index.ts      # HTTP server: routes, validation, error shape, CORS, first-boot seed
│   │       ├── repo.ts       # data access: CRUD for all six entities + dashboardStats() + reseed()
│   │       └── db.ts         # SQLite schema (WAL, FK cascades) — data/crm.sqlite
│   └── web/                  # @shulcrm/web — React 18 + MUI 5 + React Query
│       └── src/features/core/
│           └── service.ts    # thin fetch client for /api/* (same public functions as the old mock)
├── packages/
│   └── shared/               # @shulcrm/shared — single source of truth
│       └── src/
│           ├── schemas.ts    # zod schemas, entity/input types, api input schemas, error shape
│           ├── seed.ts       # deterministic seed data (6 families, 12 members, 6 pledges, 8 donations, 7 dates, 3 notes)
│           └── index.ts      # exports schemas
├── .gitignore                # node_modules, dist, apps/api/data, *.tsbuildinfo, *.log
└── package.json              # npm workspaces: apps/* + packages/*
```

### API surface (`http://localhost:3000`)

| Route | Methods | Notes |
|---|---|---|
| `/api/health` | GET | liveness |
| `/api/families` | GET, POST | |
| `/api/families/:id` | GET, PATCH, DELETE | DELETE → 204 |
| `/api/members` | GET, POST | |
| `/api/members/:id` | GET, PATCH, DELETE | |
| `/api/pledges`, `/api/donations`, `/api/notes` | GET, POST, PATCH `/:id`, DELETE `/:id` | no GET `/:id` |
| `/api/important-dates` | GET, POST, PATCH `/:id`, DELETE `/:id` | |
| `/api/important-dates/upcoming?days=N` | GET | aggregate upcoming view across families (next occurrence computed, windowed, sorted) |
| `/api/dashboard/stats` | GET | `max(0, pledge − paid)` per pledge; sums current-year donations |
| `/api/reset` | POST | reseed deterministic demo data |

- Request bodies validated with `@shulcrm/shared` input schemas (zod); errors use the shared error shape
  `{ "error": { "message": string, "issues"?: [{path, message}] } }` — 400 validation, 404 not found, 400 malformed JSON, 500 otherwise.
- Cascades via DDL FKs: family → members/pledges/donations; member → important dates; pledge delete → donations keep history (`pledgeId` → NULL via `ON DELETE SET NULL`).
- First boot seeds demo data if the DB is empty; `POST /api/reset` reseeds anytime.
- Runs under Node's native TypeScript type-stripping — needs **Node ≥ 23.6** (developed on v24.19.0). No build step for api (`build`/`typecheck` = `tsc -b --noEmit`).

### Web
- `service.ts` is a ~200-line fetch client (`/api/*`, JSON, `ApiError` with status + server message).
  Public function names are unchanged from the mock era, so pages are untouched.
- Vite dev + preview proxy `/api` → `http://localhost:3000` (same-origin in dev/preview).
- **Real pages:** Dashboard (live KPIs + upcoming-dates widget), Families (with duplicate name/phone detection), Members, **Pledges & Donations** (list + record per family, link to pledge), **Important Dates** (aggregate upcoming view, 30/60-90-day or 1-year window), **Calendar** (month grid with date type indicators), Settings (reset).
- **Detail modals** (per family / per member) with tabs: Overview, Pledges & Donations, **Dates**, **Notes** — full add / edit / delete per tab.
- All pages are lazy-loaded (route-level code splitting).

Important Dates now carry a Hebrew date derived from the Gregorian date (e.g. "6 Tishrei, 5787").

- **Shared schema** (`@shulcrm/shared`): `ImportantDate` / `ImportantDateInput` include optional `hebrewDay`, `hebrewMonth`, `hebrewYear`. The legacy free-text `hebrewDate` field was removed from the schema **and dropped as a SQLite column** (guarded `ALTER TABLE … DROP COLUMN` migration in `db.ts`; existing rows keep their `hebrewDay/Month/Year`).
- **Converter** (`@shulcrm/shared/hebrewCalendar.ts`, our own code since Phase 0): `gregorianToHebrew(iso, { afterNightfall })`, `hebrewToGregorianISO(d,m,y)`, `formatHebrew(d,m,y)`. The value is computed at save time and stored; display reads the stored value and never recomputes live.
- **Form** (`ImportantDateFormDialog`): auto-computes the Hebrew date from the Gregorian date (live preview) and stores it on save; the user can still override.
- **Display**: `FamilyDetailModal` / `MemberDetailModal` render the Hebrew date in the Dates table via `formatHebrew()` (falls back to "—" when unset).

### Verification (all passing, 2026-10-14)

- [x] `npm run typecheck` — clean (api + web)
- [x] `npm run lint` — clean (`--max-warnings 0`, both workspaces)
- [x] `npm run build` — clean (api `tsc -b` + web `tsc -b && vite build`, per-page chunks)
- [x] UI smoke (real Chromium): dashboard KPIs from `/api/dashboard/stats`; families/members tables from API; create + delete via forms/modals (confirm dialog); Hebrew date auto-compute on the Important Date form + display in modals; `dates` and `calendar` pages render with data

### Fixed along the way

- `repo.ts` SQL param binding: values normalized to `SQLInputValue` (`toParam`); booleans stored as 0/1
- `apps/api/tsconfig.json`: added `esModuleInterop` (express default import)
- Deleted junk: `apps/api/src/probe.txt`, `apps/api/src/scratch.txt`, `apps/web/npm-install.log`
- Dropped the dead `hebrewDate` column (superseded by `hebrewDay/Month/Year`)

## Phase 0 — Clean base (2026-10-20)

- **IDs are UUIDv7** everywhere (`newId()` in `@shulcrm/shared/ids.ts`, no dependency). Schemas validate ids and
  foreign keys as UUIDs. Seed uses fixed UUIDs (`00000000-0000-7000-8000-KKKK0000NNNN`). A one-time migration in
  `db.ts` rewrites legacy prefixed ids (`fam-001`) and their foreign keys in one transaction.
- **Own Hebrew calendar** (`@shulcrm/shared/hebrewCalendar.ts`) replaces GPL `@hebcal/core`. Pure day arithmetic,
  so no timezone drift. It matched hebcal on every day from 1900 to 2240 before hebcal was removed.
- **Before/after nightfall**: important dates store `afterNightfall`; the form requires the answer and previews
  the Hebrew date for each choice. After nightfall = next Hebrew day.
- **Important-date types**: the old `CHECK` (birthday/yahrzeit/brit_mitzvah only) is gone, so bar/bat mitzvah,
  anniversary and seuda hoda'a save. Types are validated by zod.
- **Licenses**: `npm run license:check` fails on anything outside MIT/ISC/BSD/Apache-2.0/etc. (552 packages pass).
  vitest pinned to 3.x to drop MPL `lightningcss`.
- **Local-only by default**: the API binds to `127.0.0.1`; set `HOST=0.0.0.0` to put it on the network now that login exists.
- **Auth work** (login, RBAC, users, family portal) is parked on branch `wip/auth` until ROADMAP Phase 5 (login) and Phase 6 (member portal).

## Phase 1 — Hebrew recurrence (2026-10-20)

- **Recurrence rules** live in `@shulcrm/shared/recurrence.ts`: `occurrencesBetween`, `nextOccurrence`,
  `yahrzeitInYear`, `hebrewAnniversaryInYear`. A date's `recurBy` (`hebrew | gregorian`) defaults by type
  (`DEFAULT_RECUR_BY` in `dateTypes.ts`). A Hebrew occurrence is the daytime date; it begins the evening before.
- **API**: `GET /api/important-dates/occurrences?from=&to=` (calendar, max 400 days) and `/upcoming` share
  `repo.dateOccurrences`. `PATCH` bodies may send `null` to clear an optional field.
- **Checked** against Hebcal's yahrzeit calculator: 1,680 yahrzeits for 84 test deaths, no differences.
- **Calendar** shows each month's occurrences with Hebrew day numbers; a click opens the member.

## Phase 2 — Configurability (2026-10-20)

- **Settings** live in `apps/api/src/settings.ts` (`/api/settings`, `/api/settings/{org,features,terms,lookups/:kind}`,
  `/api/org/logo`), shapes and defaults in `@shulcrm/shared/settings.ts`. The web reads them through
  `useSettings()` (labels, dropdown options, `money()`, `t()` terms, recurrence options) and `LookupSelect`.
- **Migrations**: `apps/api/src/migrations.ts` with a `schema_version` table. 1 = the old baseline, 2 = settings,
  files (logo), and donations without the payment-method CHECK.
- **Import/export**: `apps/api/src/importExport.ts` (field specs in `@shulcrm/shared/importSpecs.ts`),
  `spreadsheet.ts` (CSV via papaparse, XLSX via fflate). Routes: `/api/import/parse`, `/api/import/:entity/{preview,commit}`,
  `/api/export/:entity?format=csv|xlsx`.
- **Tests**: 63 (recurrence, calendar, import/export, settings).

## Phase 3 — Operations (2026-10-20)

- **Documents** (`apps/api/src/documents.ts`, web `features/print`): receipts, statements, yahrzeit letters and lists as
  printable pages under `/print/*` (outside the app layout). Yahrzeit letters use the "yahrzeit" email template.
- **Email** (`apps/api/src/email.ts`, Settings → Email): nodemailer; test mode (JSON transport, nothing leaves the machine)
  is the default; templates with `{{variables}}`; `emailLog` table. Send dialog: `features/email/SendEmailDialog.tsx`.
- **Events** (`events.ts`, `/events`): events + RSVPs (migration 3), shown on the calendar.
- **Reports** (`reports.ts`, `/reports`): six reports, JSON or CSV.
- **Tests**: 74.

## Phase 4 — Hardening (2026-10-20)

- **App/server split**: `apps/api/src/app.ts` builds the Express app; `index.ts` prepares data, starts backups, listens.
- **Paged lists**: `apps/api/src/paging.ts`; web hook `features/core/usePaged.ts` (`usePaged`, `useDebounced`, `useSort`).
- **Backups**: `apps/api/src/backups.ts` → `apps/api/data/backups/`. **Logging**: `apps/api/src/log.ts` (`LOG_LEVEL`).
- **Checks**: `npm run check` (licenses, lint, types, 91 tests, build); CI does the same plus `npm audit`.

## Phase 5 — Login, users and roles (2026-10-20)

- **API**: `apps/api/src/auth.ts` (scrypt, sessions, invites, setup), `context.ts` (who is asking, via AsyncLocalStorage),
  `audit.ts` (the log and field diffs). The `RULES` table at the top of `app.ts` maps route prefixes to permissions and
  denies anything it does not recognise; paths are matched lower-cased and Express routes case-sensitively.
- **Shared**: `packages/shared/src/auth.ts` — roles, `ROLE_PERMISSIONS`, `can()`, `canAssignRole()`, and the form schemas.
- **Web**: `features/auth/` (AuthGate, Login, Setup, Welcome, UserMenu, ChangePassword), `features/users/UsersPage.tsx`,
  `features/settings/AuditLog.tsx`. `useAuth()` gives the user and `can()`; a 401 anywhere returns to the sign-in page.
- **Migration 4** adds users, sessions, userTokens and auditLog, and drops the empty tables the abandoned `wip/auth`
  branch left behind.
- **Dev login**: the local owner account's details are in `apps/api/data/dev-owner.txt` (that folder is gitignored).
- **Tests**: 110.

## Not yet done

See `ROADMAP.md`. Next: Phase 6 (member portal), then Phase 7 (packaging).

## Commands

```bash
npm install                 # from repo root (workspaces)
npm run dev                 # api (:3000) + web (:5173) together
npm run dev:api | dev:web   # individually
npm run typecheck | lint    # all workspaces
npm test -w @shulcrm/api     # Vitest suite (data access, Hebrew calendar, UUIDs)
npm run license:check       # fail on any non-permissive dependency license
npm run build               # api typecheck + web production build
```
