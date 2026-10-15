# Rebuild Prompt — Pilzno Synagogue CRM (v2)

> A self-contained "vibe build" prompt. Feed this whole file to an AI coding agent to rebuild the CRM from scratch as a clean, modern, maintainable product.

## Role & Intent
Act as a senior full-stack architect and product engineer. Rebuild the **"Pilzno Synagogue CRM"** from scratch as a clean, modern, maintainable product. Do **not** copy the old codebase — use it only as a reference for the domain and feature set. Optimize for a small, clear codebase that a new developer can understand in minutes, and that is trivial to run locally and in Docker.

## Product Summary
A **congregational** CRM (not a sales CRM) for a synagogue. It manages:
- **Families** and their **members**
- **Fundraising:** pledges and donations
- **Lifecycle calendar:** birthdays, yahrzeits (memorial dates), b'nai mitzvah, wedding/aliyah anniversaries
- **Notes** with rich types, **events**, **email templates**, **system settings**
- **Auth + roles** (owner/admin/member) and **user invitations**

## Fixed Stack (do not substitute)
- **Monorepo:** pnpm workspaces + Turborepo.
- **Shared package:** `packages/shared` — TypeScript types + **Zod** schemas. This is the **single source of truth** for all frontend/backend data contracts.
- **Backend:** Node 18+, Express, **TypeORM**, **PostgreSQL 15**, `class-validator`/Zod, `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `express-rate-limit`, `pino` (structured logging).
- **Frontend:** React 18 + Vite + TypeScript, **MUI** + `@mui/x-date-pickers`, **TanStack Query (React Query)** for *all* data fetching, `@hebcal/core` + `dayjs` for the Hebrew calendar, `react-hook-form` + Zod for forms, `react-hot-toast` for notifications.
- **Quality:** ESLint + Prettier, Vitest (unit) + Supertest (integration), GitHub Actions CI.

## Domain Model (entities + relationships)
- **User** (id, email, passwordHash, name, role, createdAt)
- **Workspace** (id, name, settingsJson, createdAt) — multi-tenant container; every business record belongs to a workspace.
- **Membership** (userId, workspaceId, role) — join table; roles: owner / admin / member.
- **Family** (id, workspaceId, name, address, phone, email, tier, notes, createdAt)
- **FamilyMember** (id, familyId, firstName, lastName, dateOfBirth, dateOfDeath?, yahrzeitHebrew?, bnaiMitzvahHebrew?, email, phone, notes)
- **Pledge** (id, familyId, type[annual|one-time], amount, currency, dueDate, hebrewDueDate?, description, status[open|paid|partial], createdAt)
- **Donation** (id, familyId, pledgeId?, amount, currency, date, method, reference, note, createdAt)
- **ImportantDate** (id, familyId, memberId?, type[birthday|yahrzeit|bnai-mitzvah|wedding-anniversary|aliyah-anniversary|other], hebrewDate, gregorianDate, description, recurring[bool])
- **Note** (id, workspaceId, type[general|pastoral-care|membership|lifecycle-event|donation|volunteer|committee|board|yahrzeit|shiva|simcha|complaint|compliment|other], priority[low|med|high], subject, body, familyId?, memberId?, authorId, createdAt)
- **Event** (id, workspaceId, title, description, startAt, endAt?, location, familyId?, createdAt)
- **EmailTemplate** (id, workspaceId, name, subject, body, variablesJson, isActive, createdAt)
- **UserInvitation** (id, workspaceId, email, role, token, invitedById, status[pending|accepted|revoked], expiresAt, createdAt)
- **SystemSettings** (workspaceId, key, valueJson, updatedAt)

## Feature Set
### MVP (build first)
1. **Auth:** register, login, logout, token verify; role-based route guards.
2. **Workspace:** create workspace, list, switch, settings.
3. **Families:** CRUD, search/filter, detail view.
4. **Members:** CRUD, detail view, linked to family.
5. **Pledges & Donations:** CRUD, status tracking, simple financial totals per family.
6. **Important Dates:** CRUD, list of upcoming dates, Hebrew/Gregorian conversion.
7. **Dashboard:** KPIs (total pledged, total donated, active families, upcoming dates, recent notes).

### Full
8. **Notes:** rich types, priority, attach to family/member, global feed.
9. **Events:** CRUD, calendar-style list.
10. **Email templates:** manage + variable interpolation.
11. **Invitations:** invite users, accept/expire, role assignment.
12. **Reports:** pledges vs donations by family/tier, win/fulfillment rate, member demographics.
13. **Audit log:** record create/update/delete with actor + timestamp.

## Architecture & Folder Structure
```txt
.
├─ apps/
│  ├─ api/                      # Express + TypeORM backend
│  │  ├─ src/
│  │  │  ├─ index.ts            # bootstrap
│  │  │  ├─ app.ts              # express app factory
│  │  │  ├─ config/             # env, pino, cors, helmet, rate-limit
│  │  │  ├─ db/
│  │  │  │  ├─ data-source.ts   # THE single TypeORM DataSource
│  │  │  │  ├─ entities/        # all TypeORM entities
│  │  │  │  ├─ migrations/      # versioned migrations (auto or hand-written)
│  │  │  │  └─ seeds/           # deterministic local seed data
│  │  │  ├─ modules/            # feature folders (one per domain area)
│  │  │  │  ├─ auth/            # controller, service, dto
│  │  │  │  ├─ workspaces/
│  │  │  │  ├─ families/
│  │  │  │  ├─ members/
│  │  │  │  ├─ pledges/
│  │  │  │  ├─ donations/
│  │  │  │  ├─ important-dates/
│  │  │  │  ├─ notes/
│  │  │  │  ├─ events/
│  │  │  │  ├─ email-templates/
│  │  │  │  ├─ invitations/
│  │  │  │  └─ reports/
│  │  │  ├─ middleware/         # auth, error-handler, request-id, rbac
│  │  │  └─ utils/             # hebrewCalendar, pledgeCalculations, money
│  │  └─ package.json
│  └─ web/                      # React + Vite + MUI frontend
│     ├─ src/
│     │  ├─ main.tsx
│     │  ├─ app/               # providers (QueryClient, MUI theme, router)
│     │  ├─ features/          # one folder per feature (api, components, hooks)
│     │  │  ├─ auth/
│     │  │  ├─ workspaces/
│     │  │  ├─ families/
│     │  │  ├─ members/
│     │  │  ├─ pledges/
│     │  │  ├─ donations/
│     │  │  ├─ important-dates/
│     │  │  ├─ notes/
│     │  │  ├─ events/
│     │  │  ├─ email-templates/
│     │  │  ├─ invitations/
│     │  │  ├─ dashboard/
│     │  │  └─ reports/
│     │  ├─ components/ui/     # shared MUI primitives
│     │  ├─ lib/               # queryClient, apiClient, theme, router
│     │  └─ pages/             # route-level pages
│     └─ package.json
├─ packages/
│  └─ shared/                  # types + Zod schemas (source of truth)
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ types/             # entity + DTO types
│     │  └─ schemas/           # Zod schemas (parse + infer)
│     └─ package.json
├─ docker/
│  ├─ api.Dockerfile           # multi-stage: deps → build → slim runtime
│  ├─ web.Dockerfile           # multi-stage: deps → build → nginx runtime
│  └─ .env.example
├─ .github/workflows/ci.yml
├─ .env.example
├─ .eslintrc.cjs
├─ .prettierrc
├─ pnpm-workspace.yaml
├─ turbo.json
├─ docker-compose.yml
└─ README.md
```

## Data Layer Rules
- **One** TypeORM `DataSource` (`apps/api/src/db/data-source.ts`). No `-sqlite` / `-backup` variants.
- **Migrations only:** never edit entities after creation; always add a migration.
- **Seeds:** deterministic local seed data (families, members, pledges, donations, dates, notes) so the app is usable immediately.
- **Scripts:** `db:migrate`, `db:seed`, `db:reset`, `db:studio`.
- **Transactions** for multi-entity writes (e.g., creating a family + members).

## API Design
- REST, versioned under `/api/v1`.
- Consistent resource shape: `{ data, meta? }`; errors: `{ error: { code, message, details? } }`.
- **Zod** validation on every input (from `@pilzno/shared`).
- Auth via `Authorization: Bearer <jwt>`; RBAC middleware enforces role per route.
- Rate limiting + security headers (helmet) + CORS.
- Structured logging (pino) with request IDs.
- Pagination/filtering/sorting on list endpoints.

## Frontend Rules
- **React Query** for all fetching/mutations — no hand-rolled `useEffect` data fetching.
- **MUI** design system; `@mui/x-date-pickers` for dates.
- **react-hook-form** + Zod (from `@pilzno/shared`) for forms.
- `@hebcal/core` + `dayjs` for Hebrew calendar conversions (single util module).
- Feature-based folder structure; shared UI primitives in `components/ui`.
- Loading / empty / error states on every data view.
- Responsive, desktop-first.

## Auth & Multi-tenancy
- JWT (access) with expiration; bcrypt-hashed passwords.
- Role-based access: owner > admin > member.
- Every business record scoped to a `workspaceId`; middleware resolves current workspace.
- User invitations with token + expiry + role.

## Non-functional Requirements
- **Config:** env-driven only (`.env` + `.env.example`). **No hardcoded secrets/defaults** in compose or code.
- **Single Dockerfile per app** (multi-stage: deps → build → slim runtime). No `.simple` / `.working` variants.
- **One** `docker-compose.yml`: `db` (postgres:15-alpine, healthcheck) → `api` (depends_on healthy) → `web`. One command: `docker compose up --build`.
- **Logging:** pino, request IDs, centralized error handling.
- **Security:** parameterized queries (TypeORM), input validation (Zod), rate limiting, helmet, CORS, HTTPS in production.

## Quality Gate (must pass)
- `pnpm lint` (ESLint) + `pnpm format` (Prettier) clean.
- `pnpm test` green:
  - unit — services, utils, `hebrewCalendar`, `pledgeCalculations`
  - integration — API via Supertest + test DB
  - key FE component tests
- `pnpm build` succeeds for both apps.
- CI (GitHub Actions): install → lint → typecheck → test → build.

## Deliverables & Acceptance
A fresh, runnable monorepo where:
1. `pnpm i && pnpm db:migrate && pnpm db:seed && pnpm dev` boots the whole app.
2. `docker compose up --build` produces a working 3-service stack.
3. A user can sign in, create a workspace, add families/members, record pledges/donations, log important dates and notes, and see a live dashboard.
4. Lint, typecheck, tests, and build all pass in CI.

## Do NOT
- Do **not** create multiple Dockerfiles or multiple DataSource files.
- Do **not** hand-roll data fetching with `useEffect`; use React Query.
- Do **not** duplicate types between frontend and backend; use `@pilzno/shared`.
- Do **not** commit secrets, DB backups, ops scripts, or workspace history dumps.
- Do **not** edit TypeORM entities directly; use migrations.
- Do **not** scatter troubleshooting docs; keep a single `README.md` + a small `docs/` with purposeful pages.
