# CRM 3 — Stage 0 Review & Plan

## Overall impression

It's a solid, well-scoped Stage 0. The choices are sensible — Vite + React + TS + MUI, feature-based folders (`app/` vs `features/`), a centralized theme that matches the Pilzno identity, clean providers, and a realistic staged plan (plan2.md) with honest status tracking in STATUS.md. The "Mode B sandbox" decision is the right call for this environment.

## Main gaps and improvements, in priority order

### 1. Verify the baseline (biggest gap)

`node_modules` doesn't exist and build/lint/dev have never been run. Before writing any more code: `npm install` → `npm run build` → `npm run lint` → `npm run dev`. That's your Stage 0 gate, and it's currently unproven.

### 2. Small issues in the current code

- The dashboard's "New Family" / "New Member" buttons have no `onClick` — dead buttons look worse than no buttons. Either route them or hide them until Stage 2.
- `AppShell.tsx`: on mobile the drawer is `temporary` but there's no hamburger button to open it, so nav is unreachable on small screens.
- No 404 route and no error boundary — both are cheap to add now and painful to forget.
- `@hookform/resolvers` is in `devDependencies` but it's a runtime import — move it to `dependencies`.
- STATUS.md mentions `pnpm` while everything is npm — pick one and keep the docs consistent. A short README with the quickstart commands would help too.

### 3. Architecture advice before Stage 1 (the important one)

- Define the data model as **Zod schemas first**, derive TypeScript types from them. That gives you validation, types, and future API contracts from one source.
- Put all data access in a small **mock API service layer** (async functions with a small artificial delay), not raw `localStorage` calls inside components. React Query already fits this perfectly, and you can swap in a real backend later without touching UI code.
- Version your localStorage key (e.g. `pilzno-crm:v1`) so seed-data migrations don't corrupt existing data.
- Add `dayjs` + `@hebcal/core` **now**, not later. Yahrzeits, birthdays, and b'nai mitzvah dates depend on the Hebrew calendar — retrofitting date logic into an existing data model is much harder than building it in from the start.

### 4. Domain-specific things worth planning early

- This is PII (members, birthdays, yahrzeits, contact info). Even in sandbox mode: keep it local-only, add "export data" and "erase all data" to Settings, and never log personal data.
- Pledge/donation math (pledged vs. paid, balances) is the kind of logic that deserves a few pure functions + unit tests (vitest) — test the calculations, not the UI.
- Format money with `Intl.NumberFormat` once real numbers replace the static KPI strings.

## Suggested order

1. Verify build/lint/dev
2. Fix the dead buttons + mobile drawer + 404
3. Zod schemas + service layer + seed data (Stage 1)
4. Families/members CRUD (Stage 2)

## Open question

Start with the verification pass, or go straight into the Stage 1 data model?
