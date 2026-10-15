> **Progress tracker:** see `STATUS.md` — the live record of stage progress, verification results, and gotchas. Stage headings below carry a status snapshot as of 2026-10-05; the plan body is otherwise forward-looking (what to build, in what order).

CRM Rebuild Prompt — Staged Vibe Build
Act as senior product engineer and UI designer. Rebuild a clean, modern Pilzno Synagogue CRM from scratch. Focus on an efficient, coherent product. Work stage-by-stage. At the end of each stage, stop and report: what was completed, what works, what is next, any blockers. Do not continue to next stage unless acceptance criteria are met or I explicitly say continue.

1. Product Intent
family and member management
pledges and donations
important dates (birthdays, yahrzeits, b'nai mitzvah)
notes, events, invitations, email templates
dashboard/reporting
auth and workspace
modern, trustworthy, clean UI
2. Build Modes
Mode A: Full-stack (preferred if environment supports Node, pnpm, Postgres, Docker)
monorepo: apps/api, apps/web, packages/shared
Mode B: Sandbox/frontend (if no backend)
single React app with mock API service, local storage persistence, realistic seed data Choose mode automatically based on environment and state it.
3. Non-negotiable Rules
working app before abstractions
one source of truth for types/schemas
no duplicated frontend/backend types
no hand-rolled fetching; use React Query if web
no multiple Dockerfiles/data sources
no scattered docs
no hardcoded secrets
loading/empty/error states
deterministic seed data
4. Stages
Stage 0 — Foundation — ✅ complete (2026-09-16)
Goal: create a clean runnable skeleton.
Scope:

inspect environment, choose Mode A/B
init project, package manager, lint, format, TS config
create app shell, theme, route scaffold
create basic home/dashboard placeholder
define folder structure Acceptance:
pnpm dev or npm run dev runs without errors
lint and build pass
theme and navigation are clean Out of scope: real CRUD, auth, DB Gate: report and wait for continue.
Stage 1 — Data Model + Seed Data — ✅ complete (2026-09-16)
Goal: make core domain visible.
Scope:

define entities: Workspace, User, Invitation, Family, Member, Pledge, Donation, ImportantDate, Note, Event, EmailTemplate, Report
shared schemas/types
persistence: full API/DB or mock/local storage
deterministic seed data
basic list pages for core entities Acceptance:
seeded families/members/pledges/donations/dates visible
can add/edit/delete at least family and member
dashboard placeholder can read counts Out of scope: auth, RBAC, advanced reports, Docker Gate.
Stage 2 — Core Workflows — 🚧 in progress: API + web wired (2026-10-05); auth/RBAC/notes/duplicate detection pending
Goal: usable by a real synagogue admin.
Scope:

auth: register/login/logout, session
workspace context
RBAC owner/admin/member
family management: create/update/delete, search, duplicate detection
member management: profile, family links, dates
pledge and donation recording
important date tracking: birthdays, yahrzeits, b'nai mitzvah
notes per family/member Acceptance:
user signs in, sees workspace, creates family, adds members, records pledge/donation, logs dates/notes
data persists
loading/empty/error states Out of scope: events, invitations, email templates, reports, deployment Gate.
Stage 3 — Operational Features — ⬜ not started (dashboard KPIs live ahead of stage)
Goal: extend to operational CRM.
Scope:

dashboard with KPIs
calendar view
upcoming dates
events and invitations
email templates
reports Acceptance:
dashboard updates live
calendar shows important dates
user can create event/invitation, choose email template
reports show family/member/pledge/donation stats Gate.
Stage 4 — Hardening — 🚧 partial: zod validation + API error shape done; tests/CI/security middleware pending
Goal: production confidence.
Scope:

validation with Zod
API error shape
pagination/filter/sort
security: helmet, CORS, rate limit, bcrypt, JWT
migrations, tests, CI
logging Acceptance:
lint/typecheck/test/build pass
key workflows have tests
no console errors Gate.
Stage 5 — Packaging — ⬜ not started
Goal: one-command run.
Scope:

single Dockerfile per app
docker-compose with db/api/web
env example
README quickstart Acceptance:
docker compose up --build works
README explains setup Gate.
5. UI/UX Vibe
modern SaaS, clean, calm
sidebar + topbar
cards, tables, drawers
purple/gold optional? If Pilzno, use dignified palette
responsive desktop-first
6. Stage Reporting Format
At each gate, respond:

Stage complete: yes/no
What works
Files changed/created
Acceptance criteria met
Known issues
Next stage
Ask: Continue?
7. Do NOT
do not start with Docker/CI before app works
do not create many variants
do not over-abstract
do not build every feature before core flows
do not leave placeholder pages with no data
do not ignore seed data
Need maybe include "If asked to build all stages, continue autonomously but still respect gates; if I say 'continue', proceed." Good.

Need decide if to include "Pilzno Synagogue" or generic CRM? Since user's pasted prompt is specific to Pilzno. They likely want revised that prompt. Use "Synagogue/Family CRM" but can keep generic? Better to use their domain: families, members, pledges, donations, important dates, notes, events, email templates, invitations, reports. Yes.

Need ensure final answer not too long? User asked "make it revised more with better defined stages". We can provide revised prompt in markdown code block. Could include a short intro: "Here is a revised, stage-gated version." Then code block. Need maybe not include analysis.

Need maybe include "save as PROMPT.md".

Potential issue: The original prompt had many requirements: pnpm, turbo, TypeORM, MUI, React Query, Zod, Hebcal, etc. We need keep those but stage them. The revised prompt should be better defined stages. Need maybe include "Stage 0: Choose stack" but if user wants single prompt, we can specify stack directly. Maybe better to define exact stack to avoid AI choosing. For full stack: pnpm, turbo, Node, Fastify/Express? Original didn't specify API framework? It had TypeORM, pino, helmet. We can choose Node + Fastify? Original maybe had Express? The truncated prompt includes TypeORM, pino, helmet, CORS. It didn't say framework. For simplicity: Node + Express + TypeORM + Postgres. Or Fastify. Need pick one. Maybe "Node.js + Express" is common. But original had apps/api, apps/web, packages/shared. Use Express? The original maybe used Nest? No, likely Express. We can state "API: Node + TypeScript + Express + TypeORM". Need include if sandbox fallback. Good.

Need include "Use @hebcal/core + dayjs for Hebrew calendar" as stage 2 or 3.

Need include "Zod schemas in shared".

Need include "React Query, MUI, react-hook-form".

Need include "Migrations only".

Need include "Deterministic seeds".

Need include "Quality gate" only stage 4/5.

Need maybe include "Stage 1: foundation and design system" not data. Need define stages with "Must stop at each gate". For vibe building, maybe stage gates are useful. Need include "If I say 'go' or 'continue', move to next stage." Good.

Need maybe include "The final product must be usable by a real admin after Stage 2, not just after Stage 5." Nice.

Need maybe include "Do not wait until the end to show UI; every stage should produce something visible." Good.

Let's craft final revised prompt:

md
# Synagogue CRM — Staged Rebuild Prompt

You are... Rebuild a fresh, efficient CRM... Work in stages. Do not skip. At the end of each stage, stop and report using gate format.

## Product
A modern family/synagogue management CRM with:
...

## Primary Goal
Create a clean product that feels better than the old system. Prioritize:
1. usable UI
2. coherent data model
3. simple architecture
4. production hardening only after core flows work

## Stack
Prefer full stack if possible:
- pnpm + turbo monorepo
- web: React 18 + Vite + TypeScript + MUI + React Query + RHF + Zod
- api: Node + TypeScript + Express + TypeORM + Postgres
- shared: Zod schemas/types
- Hebrew calendar: @hebcal/core + dayjs
If sandbox cannot support backend/Postgres, use frontend-only mode:
- single Vite React app
- mock API service
- localStorage persistence
- same data model and UI
State which mode you are using before proceeding.

## Stage 0: Foundation — ✅ complete (2026-09-16)
Goal: clean runnable shell
Do:
- create repo structure
- setup lint/prettier/ts
- create app shell (sidebar, topbar, routes)
- theme
- placeholder pages
Acceptance:
- dev server boots
- build/lint pass
- navigation works
- theme looks modern
Out of scope:
- auth, CRUD, DB
Gate report.

## Stage 1: Core Data Model and Seed Data — ✅ complete (2026-09-16)
Goal: core domain visible in UI
Do:
- define shared schemas/types
- entities: Workspace, User, Invitation, Family, Member, Pledge, Donation, ImportantDate, Note
- persistence (API/DB or mock/local storage)
- seed data
- list pages: families, members, pledges, donations, dates, notes
- basic create/edit/delete for Family and Member
Acceptance:
- app loads with seeded data
- can create/edit/delete family and member
- counts visible
Out of scope:
- auth, reports, events, email templates, Docker
Gate.

## Stage 2: Core Workflows and Auth — 🚧 in progress: API + web wired (2026-10-05); auth/RBAC/notes/duplicate detection pending
Goal: usable by admin
Do:
- auth register/login/logout
- workspace context
- roles owner/admin/member
- family search/filter/duplicate detection
- member profiles and family links
- pledge/donation recording
- important dates: birthdays, yahrzeits, b'nai mitzvah
- notes
Acceptance:
- full happy path works
- data persists
- role permissions work
- loading/empty/error states
Out of scope:
- advanced reports, events, email, deployment
Gate.

## Stage 3: Dashboard, Calendar, and Operational Features — ⬜ not started (dashboard KPIs live ahead of stage)
Goal: day-to-day operational tool
Do:
- dashboard KPIs
- calendar view
- upcoming dates
- events
- invitations
- email templates
- reports
Acceptance:
- dashboard live
- calendar shows dates
- event/invitation/template creation works
- reports useful
Gate.

## Stage 4: Hardening — 🚧 partial: zod validation + API error shape done; tests/CI/security middleware pending
Goal: production confidence
Do:
- validation, error handling
- pagination/filter/sort
- security middleware
- migrations
- tests
- logging
- CI
Acceptance:
- lint/typecheck/test/build pass
- tests cover key flows
- no obvious security gaps
Gate.

## Stage 5: Packaging and Deployment — ⬜ not started
Goal: one command
Do:
- Dockerfiles
- compose
- env
- README
Acceptance:
- docker compose up --build works
- README quickstart accurate
Gate.

## UI/UX
...

## Architecture Rules
...

## Do NOT
...

## Stage Gate Format
...
Need maybe include "If continuing autonomously, after each gate wait for my instruction unless I have said 'continue through all stages'." Good.

Need maybe mention "Do not rebuild the old docs; create one README and docs/ if needed." Good.

Need maybe include "The app should be efficient and not over-engineered".

Need final maybe only the prompt. Since user asks make it revised. We can include brief intro and code block. Need no mention of tool. Ensure no broken formatting.

Let's produce final with a comprehensive prompt. Need maybe not too massive, but enough. We can include "Copy into PROMPT.md".

Need ensure "better defined stages" is central. Use tables? Could use headings. Maybe stage table at top for overview, then detailed stages. That is good.

Let's draft final. Need include "Stage 0-5" with "Entry criteria", "Scope", "Deliverables", "Acceptance", "Stop gate".

Potential final:

md
# Synagogue CRM — Staged Rebuild Prompt

You are a senior product engineer...

## Mission
Rebuild...

## Stage Overview
| Stage | Purpose | Done when |
...

## Global Rules
...

## Stage 0...
...
Need maybe include "Mode selection" in Stage 0. Good.

Let's ensure it's a "single prompt" not multiple prompts. It's one markdown document. Good.

Need maybe include "If you are working in a sandbox, do not claim Docker works unless it actually can." Nice.

Let's final.

md
# Synagogue CRM — Staged Rebuild Prompt

You are a senior product engineer, systems architect, and modern UI designer.

Your job is to rebuild a clean, efficient, production-quality synagogue / family CRM from scratch. This is a **vibe-coded rebuild**: the result should feel modern, coherent, fast, and genuinely usable — not like a patchwork of old screens and legacy docs.

Work in **clear, staged phases**. Do not jump ahead. Do not over-engineer before the core product works. At the end of each stage, stop and report using the **Stage Gate Format**.

If I say **“continue”**, proceed to the next stage.  
If I do not say continue, stop after the stage gate.

---

## Mission

Build a fresh, efficient CRM for managing:

- families
- members
- pledges
- donations
- important dates
  - birthdays
  - yahrzeits
  - b’nai mitzvah dates
- notes
- events
- invitations
- email templates
- dashboard and reporting

The final app should feel like a modern SaaS product:

- clean
- calm
- trustworthy
- easy to navigate
- fast to use
- visually consistent
- data-dense but not cluttered

The priority order is:

1. A usable end-to-end product
2. A clean data model
3. A simple architecture
4. Production hardening

Do **not** let infrastructure or abstraction block the core experience.

---

## Build Mode

Choose one of the following modes based on the environment.

### Mode A — Full-stack

Use this if the environment supports:

- Node.js
- pnpm or npm
- TypeScript
- Postgres
- a real backend server

In Mode A, build:

- a frontend web app
- a backend API
- a shared types / validation package
- a database
- migrations
- seed data

### Mode B — Sandbox / Frontend-only

Use this if the environment does **not** support a real backend or database.

In Mode B, build:

- a single frontend app
- a mock API layer
- local storage or in-memory persistence
- the same data model
- the same UI
- deterministic seed data

Before proceeding, state which mode you are using and why.

---

## Preferred Stack

If available, use:

### Frontend
- React
- Vite
- TypeScript
- MUI
- React Query
- React Hook Form
- Zod
- `@hebcal/core`
- `dayjs`

### Backend
- Node.js
- TypeScript
- Express or Fastify
- TypeORM or Prisma
- Postgres
- Zod
- pino
- helmet
- rate limiting
- JWT auth

### Shared
- one shared source of truth for:
  - types
  - Zod schemas
  - enums
  - validation rules

If TypeScript is not available, still keep the JavaScript explicit, consistent, and well-structured.

---

## Stage Overview

| Stage | Purpose | Done when | Status |
|---|---|---|---|
| 0 | Foundation and app shell | The app boots, navigation works, UI shell looks modern | ✅ complete (2026-09-16) |
| 1 | Core data model and seed data | Core entities exist, seed data works, basic CRUD is visible | ✅ complete (2026-09-16) |
| 2 | Core workflows and auth | A real user can sign in and perform the main CRM workflows | 🚧 in progress (2026-10-05) |
| 3 | Operational features | Dashboard, calendar, events, invitations, email templates, reports work | ⬜ not started |
| 4 | Hardening and quality | Validation, security, tests, migrations, and CI pass | 🚧 partial: validation + error shape done |
| 5 | Packaging and deployment | The app can be run cleanly with one command | ⬜ not started |

---

# Stage 0 — Foundation and App Shell — ✅ complete (2026-09-16)

## Goal
Create a clean, runnable foundation that already looks like a real product.

## Scope
- inspect the environment
- choose Mode A or Mode B
- initialize the project structure
- configure:
  - TypeScript or clean JavaScript
  - linting
  - formatting
  - dev server
  - build
- create the app shell:
  - sidebar navigation
  - top bar
  - user menu placeholder
  - workspace context placeholder
  - route structure
- create a modern MUI or CSS design system:
  - typography
  - spacing
  - cards
  - buttons
  - tables
  - badges
  - drawers
  - modals
  - loading states
  - empty states
  - error states
- create placeholder pages for:
  - dashboard
  - families
  - members
  - pledges
  - donations
  - important dates
  - notes
  - events
  - invitations
  - email templates
  - reports
  - settings

## Acceptance Criteria
- the app starts without errors
- the build succeeds
- linting passes
- navigation works
- the theme looks modern and consistent
- placeholder pages render with proper empty states
- the UI already feels like the start of a real CRM

## Out of Scope
- real authentication
- real data persistence
- full CRUD
- database
- reports
- deployment

## Stage Gate
Stop and report:
- mode chosen
- project structure created
- what works
- what is missing
- whether acceptance criteria are met
- next recommended stage

---

# Stage 1 — Core Data Model and Seed Data — ✅ complete (2026-09-16)

## Goal
Make the core domain visible and usable in the UI.

This stage should produce something that already feels like a working CRM, even if auth and advanced features are not finished.

## Scope

### Data Model
Define and implement the core entities:

- Workspace
- User
- Invitation
- Family
- Member
- Pledge
- Donation
- ImportantDate
- Note

Optional for this stage if useful:
- Event
- EmailTemplate

### Core Relationships
- User belongs to Workspace
- Family belongs to Workspace
- Member belongs to Family
- Pledge belongs to Family
- Donation belongs to Pledge
- ImportantDate belongs to Member or Family
- Note belongs to Family, Member, or Pledge

### Validation
Create shared validation schemas for:
- family creation
- member creation
- pledge creation
- donation creation
- important date creation
- note creation

### Persistence
In Mode A:
- create database migrations
- create repositories/services
- create API endpoints

In Mode B:
- create a mock API layer
- persist to local storage or in-memory state
- make it behave like a real API

### Seed Data
Create deterministic seed data that makes the app feel real immediately:
- 1 workspace
- 3–5 users with roles
- 5–10 families
- 15–30 members
- pledges and donations
- birthdays
- yahrzeits
- b’nai mitzvah dates
- notes

### UI
Build basic list views for:
- families
- members
- pledges
- donations
- important dates
- notes

Implement basic CRUD for at least:
- create family
- edit family
- delete family
- create member
- edit member
- delete member

## Acceptance Criteria
- the app loads with realistic seed data
- families and members are visible
- users can create, edit, and delete a family
- users can create, edit, and delete a member
- pledges and donations are visible
- important dates are visible
- notes are visible
- data changes persist or at least remain consistent during the session
- the UI shows loading, empty, and error states where relevant

## Out of Scope
- full authentication
- role-based access control
- dashboard analytics
- events
- invitations
- email templates
- reports
- tests
- Docker
- CI

## Stage Gate
Stop and report:
- data model created
- entities implemented
- seed data quality
- which CRUD flows work
- which UI screens work
- known issues
- whether acceptance criteria are met
- next recommended stage

---

# Stage 2 — Core Workflows and Authentication — 🚧 in progress: API + web wired (2026-10-05); auth/RBAC/notes/duplicate detection pending

## Goal
Make the app usable by a real synagogue administrator.

By the end of this stage, the core product should be complete enough for daily use.

## Scope

### Authentication
Implement:
- register
- login
- logout
- current user state
- session persistence
- protected routes

### Workspace Context
- current workspace
- workspace switcher if multiple workspaces exist
- all business records scoped to workspace

### Roles
Implement role-based access:

- owner
- admin
- member

Example permissions:
- owner: full access
- admin: manage families, members, pledges, donations, dates, notes, settings
- member: view and limited edit depending on configuration

### Family Management
- create family
- edit family
- delete family
- search families
- filter families
- duplicate detection
- family detail page

### Member Management
- create member
- edit member
- delete member
- member detail page
- link member to family
- track:
  - birthdate
  - yahrzeit
  - b’nai mitzvah date
  - phone
  - email
  - address
  - notes

### Pledges
- create pledge
- edit pledge
- pledge amount
- pledged date
- status
- linked family
- total pledged vs paid

### Donations
- record donation
- link donation to pledge
- donation amount
- donation date
- payment method
- notes

### Important Dates
- birthdays this month
- yahrzeits this month
- b’nai mitzvah upcoming
- list view
- calendar-ready structure
- Hebrew calendar conversion where appropriate

### Notes
- add notes to family
- add notes to member
- add notes to pledge
- note history
- edit/delete notes where appropriate

## Acceptance Criteria
- a user can sign in and access the app
- protected routes work
- roles restrict access where expected
- a user can create a family
- a user can add members to that family
- a user can record a pledge
- a user can record a donation against a pledge
- a user can add important dates
- a user can add notes
- all core data persists
- the main workflow feels coherent and usable
- the UI remains clean and professional

## Out of Scope
- advanced dashboard
- reports
- events
- invitations
- email templates
- full test suite
- Docker
- CI
- production deployment

## Stage Gate
Stop and report:
- auth working
- roles working
- core workflows completed
- seed data still usable
- known edge cases
- whether the app is usable by a real admin
- next recommended stage

---

# Stage 3 — Dashboard, Calendar, and Operational Features — ⬜ not started (dashboard KPIs live ahead of stage)

## Goal
Turn the CRM into a day-to-day operational tool.

## Scope

### Dashboard
Create a useful dashboard with:
- total families
- total members
- total active pledges
- total pledged amount
- total donated amount
- outstanding pledge balance
- birthdays this month
- yahrzeits this month
- upcoming b’nai mitzvah dates
- recent notes
- quick actions:
  - add family
  - add member
  - record donation
  - add note

### Calendar
Implement a calendar view for:
- birthdays
- yahrzeits
- b’nai mitzvah dates
- events

Use the Hebrew calendar where appropriate, alongside Gregorian dates.

### Events
- create event
- edit event
- delete event
- event title
- date
- time
- description
- related family or member

### Invitations
- create invitation
- link invitation to event
- link invitation to family/member
- track sent status
- track RSVP status if useful

### Email Templates
- create template
- edit template
- delete template
- template variables
- subject and body
- select template when creating invitation or notification

### Reports
Implement practical reports:
- families by member count
- members by family
- pledges by status
- donations by month
- outstanding pledges
- birthdays by month
- yahrzeits by month
- b’nai mitzvah by year
- notes activity summary

## Acceptance Criteria
- dashboard shows meaningful, live data
- dashboard updates when data changes
- calendar shows important dates correctly
- events can be created and managed
- invitations can be created and linked
- email templates can be created and selected
- reports provide useful summaries
- the app feels complete for regular synagogue administration

## Out of Scope
- full test suite
- advanced security hardening
- Docker
- CI
- production deployment

## Stage Gate
Stop and report:
- dashboard features completed
- calendar behavior
- events / invitations / email templates status
- reports completed
- UX quality
- known issues
- next recommended stage

---

# Stage 4 — Hardening and Quality — 🚧 partial: zod validation + API error shape done; tests/CI/security middleware pending

## Goal
Make the system reliable, safe, and maintainable.

## Scope

### Validation
- validate all API input
- validate all forms
- use shared Zod schemas
- return structured error messages

### Error Handling
- consistent API error shape
- centralized frontend error handling
- user-friendly error messages
- no unhandled promise rejections

### Data Integrity
- referential integrity
- safe deletes
- cascade behavior where appropriate
- transactional writes for multi-entity operations

### Security
- password hashing
- JWT or equivalent session handling
- role-based access control
- rate limiting
- security headers
- CORS
- no hardcoded secrets
- environment-based configuration

### API Quality
- pagination
- filtering
- sorting
- consistent response shape
- consistent endpoint naming

### Database
- migrations only
- no direct entity edits after migration
- seed script
- reset script

### Testing
Add tests for:
- core utilities
- validation schemas
- key services
- key API endpoints
- important frontend components if practical

### CI
Create a CI workflow for:
- install
- lint
- typecheck
- test
- build

## Acceptance Criteria
- lint passes
- format check passes
- typecheck passes
- tests pass
- build succeeds
- key workflows are tested
- security basics are in place
- environment configuration is clean
- no obvious runtime errors in the console

## Out of Scope
- deployment packaging unless already present
- advanced performance tuning
- complex analytics

## Stage Gate
Stop and report:
- validation completed
- security completed
- tests completed
- CI status
- build status
- known risks
- next recommended stage

---

# Stage 5 — Packaging and Deployment — ⬜ not started

## Goal
Make the app easy to run and maintain.

## Scope

### Documentation
Create or clean up:
- `README.md`
- quick start
- environment variables
- scripts
- architecture overview
- troubleshooting section only if useful

### Environment
- `.env.example`
- no secrets committed
- clear required variables

### Docker
Create one clean Dockerfile per app:
- API Dockerfile
- Web Dockerfile

Create one `docker-compose.yml` with:
- database
- api
- web

Use healthchecks and dependency ordering where appropriate.

### Scripts
Ensure useful scripts exist:
- install
- dev
- build
- lint
- test
- migrate
- seed
- reset

### Final QA
Verify:
- app starts from a clean state
- migrations run
- seed data loads
- login works
- core CRM workflows work
- dashboard works
- reports work
- build succeeds

## Acceptance Criteria
- one-command local development works
- one-command Docker startup works
- README is accurate
- environment setup is clear
- the app feels stable and production-ready
- no unnecessary duplicate files, Dockerfiles, configs, or legacy artifacts remain

## Stage Gate
Stop and report:
- final structure
- commands to run
- deployment status
- remaining risks
- suggested next improvements

---

## Global Architecture Rules

- Prefer a clean modular structure.
- Keep types and schemas in one shared source.
- Do not duplicate frontend/backend types.
- Keep domain logic outside React components.
- Keep API logic outside UI components.
- Use React Query or equivalent for data fetching.
- Use form libraries for forms.
- Use a consistent file structure.
- Do not create multiple variants of the same file.
- Do not leave backup files, broken Dockerfiles, or scattered troubleshooting docs.

---

## Recommended Folder Structure

If full-stack:

```txt
apps/
  api/
  web/
packages/
  shared/
API:

txt
src/
  config/
  db/
  modules/
    auth/
    workspaces/
    families/
    members/
    pledges/
    donations/
    important-dates/
    notes/
    events/
    invitations/
    email-templates/
    reports/
  middleware/
  utils/
Web:

txt
src/
  app/
  components/
    ui/
    layout/
  features/
    auth/
    dashboard/
    families/
    members/
    pledges/
    donations/
    important-dates/
    notes/
    events/
    invitations/
    email-templates/
    reports/
    settings/
  hooks/
  lib/
  pages/
Shared:

txt
src/
  types/
  schemas/
  constants/
  utils/
UI / Vibe Requirements
The app should feel like a modern, trustworthy SaaS product.

Use:

clean layout
sidebar navigation
top bar
cards
tables
tabs
drawers
modals
badges
status indicators
subtle borders
soft shadows
consistent spacing
clear hierarchy
restrained color
professional typography
Avoid:

clutter
too many colors
noisy gradients
cramped tables
inconsistent buttons
placeholder-looking screens
dense admin-panel ugliness
The app should feel calm, organized, and easy to use by non-technical staff.

Data and Product Rules
Every business record belongs to a workspace.
Every record should have createdAt and updatedAt.
Every record should know who created it where relevant.
Families and members are the core domain.
Pledges and donations should be clearly separated.
Important dates should support both Gregorian and Hebrew calendar where practical.
Notes should be attachable to families, members, or pledges.
The dashboard should reflect real data, not fake static numbers.
Seed data should be realistic but deterministic.
Do NOT
Do not:

create multiple Dockerfiles for the same app
create multiple database config files
duplicate types between frontend and backend
hand-roll data fetching with useEffect
build deployment before the core product works
over-abstract before the UI is usable
leave placeholder pages without empty states
scatter troubleshooting docs
commit secrets
commit database backups
copy old legacy scripts without cleaning them
create .backup, .simple, .working, .copy, or similar duplicate files
ignore loading, empty, and error states
let the app look unfinished after Stage 2
Stage Gate Format
At the end of each stage, respond exactly like this:

txt
Stage X complete: yes / no

Mode used:
- Full-stack / Sandbox

What was built:
- ...

What works:
- ...

What does not work yet:
- ...

Acceptance criteria met:
- yes / no

Known issues:
- ...

Next recommended action:
- ...

Awaiting instruction to continue.
If I reply “continue”, proceed to the next stage.

If I reply “stop”, stop and preserve the current state.

If I reply “fix”, fix the current stage before moving forward.