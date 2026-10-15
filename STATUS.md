# Pilzno Synagogue CRM — Task Status

> Last updated: 2026-10-14
> Working directory: `C:\Users\binya\Documents\CRM 3\CRM 3`
> Build mode: **Mode C — Monorepo** (api + web + shared; real API over SQLite, web is a thin client)

## Current Stage

**Stage 2 — API + Web wiring: COMPLETE** (real Express + SQLite API; web is a thin client over HTTP).

The app migrated from the Mode B sandbox (single React app, localStorage mock) to a three-workspace
monorepo with a real Express + SQLite API. Since the last status update the core CRUD surface is built
end-to-end and verified: **Families, Members, Pledges, Donations, Notes, Important Dates**, an aggregate upcoming-dates page, and a **Calendar** view (month grid with date highlights), plus dashboard stats
splitting, and MUI confirm dialogs.

### Architecture

```
pilzno-crm/
├── apps/
│   ├── api/                  # @pilzno/api — Express 4 + node:sqlite (zero native deps)
│   │   └── src/
│   │       ├── index.ts      # HTTP server: routes, validation, error shape, CORS, first-boot seed
│   │       ├── repo.ts       # data access: CRUD for all six entities + dashboardStats() + reseed()
│   │       └── db.ts         # SQLite schema (WAL, FK cascades) — data/crm.sqlite
│   └── web/                  # @pilzno/web — React 18 + MUI 5 + React Query
│       └── src/features/core/
│           └── service.ts    # thin fetch client for /api/* (same public functions as the old mock)
├── packages/
│   └── shared/               # @pilzno/shared — single source of truth
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

- Request bodies validated with `@pilzno/shared` input schemas (zod); errors use the shared error shape
  `{ "error": { "message": string, "issues"?: [{path, message}] } }` — 400 validation, 404 not found, 400 malformed JSON, 500 otherwise.
- Cascades via DDL FKs: family → members/pledges/donations; member → important dates; pledge delete → donations keep history (`pledgeId` → NULL via `ON DELETE SET NULL`).
- First boot seeds demo data if the DB is empty; `POST /api/reset` reseeds anytime.
- Runs under Node's native TypeScript type-stripping — needs **Node ≥ 23.6** (developed on v24.19.0). No build step for api (`build`/`typecheck` = `tsc -b --noEmit`).

### Web

- `service.ts` is a ~200-line fetch client (`/api/*`, JSON, `ApiError` with status + server message).
  Public function names are unchanged from the mock era, so pages are untouched.
- Vite dev + preview proxy `/api` → `http://localhost:3000` (same-origin in dev/preview).
- **Real pages:** Dashboard (live KPIs + upcoming-dates widget), Families, Members, **Pledges & Donations** (list + record per family, link to pledge), **Important Dates** (aggregate upcoming view, 30/60/90-day or 1-year window), Settings (reset).
- **Detail modals** (per family / per member) with tabs: Overview, Pledges & Donations, **Dates**, **Notes** — full add / edit / delete per tab.
- **Placeholder:** Calendar (`/calendar`) only. Important Dates (`/dates`) is now a real aggregate page; per-entity dates are also editable in the modals.
- **Real pages:** Dashboard (live KPIs + upcoming-dates widget), Families, Members, **Pledges & Donations** (list + record per family, link to pledge), **Important Dates** (aggregate upcoming view, 30/60/90-day or 1-year window), **Calendar** (month grid with date type indicators), Settings (reset).
- All pages are lazy-loaded (route-level code splitting).

### Hebrew date converter

Important Dates now carry a Hebrew date derived from the Gregorian date (e.g. "6 Tishrei, 5787").

- **Shared schema** (`@pilzno/shared`): `ImportantDate` / `ImportantDateInput` include optional `hebrewDay`, `hebrewMonth`, `hebrewYear`. The legacy free-text `hebrewDate` field was removed from the schema **and dropped as a SQLite column** (guarded `ALTER TABLE … DROP COLUMN` migration in `db.ts`; existing rows keep their `hebrewDay/Month/Year`).
- **Converter** (`web/src/features/core/hebrewDate.ts`, via `@hebcal/core`): `gregorianToHebrew(iso)`, `hebrewToGregorianISO(d,m,y)`, `formatHebrew(d,m,y)`. Uses a local-noon reference so the result is deterministic across timezones; the value is computed at save time and stored — display reads the stored value, never recomputes live.
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

## Not yet done

- [ ] Auth: register/login/logout, session, workspace context
- [ ] RBAC: owner/admin/member
- [ ] Family duplicate detection (name/phone match)
- [ ] Git: local repo initialized + `.gitignore` in place; **no commit yet** (no git identity / remote configured)

## Commands

```bash
npm install                 # from repo root (workspaces)
npm run dev                 # api (:3000) + web (:5173) together
npm run dev:api | dev:web   # individually
npm run typecheck | lint    # all workspaces
npm test -w @pilzno/api     # Vitest suite (api data-access)
npm run build               # api typecheck + web production build
```
