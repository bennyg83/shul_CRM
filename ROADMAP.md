# Roadmap — Shul CRM (reference install: Pilzno)

> Written 2026-10-20, revised the same day with feedback: login moved later, logo upload,
> UUIDs, and a permissive-license-only policy; then the member portal (Phase 6).
> Supersedes the forward-looking parts of `plan.md`, `plan2.md`, `crm3-plan.md`.
> `STATUS.md` remains the record of what is done; this file is what is left and in what order.

**Goal:** a CRM built on Pilzno that can be stood up for another shul with configuration
rather than code changes, and later adapted for small businesses (households → accounts,
pledges → invoices, and so on).

**Deployment model:** one instance per shul (its own server, SQLite file, and settings). Each
org still gets a UUID (`orgId`), so exports and backups say where they came from and a move to
multi-tenant later stays possible.

---

## Ground rules (apply to every phase)

### 1. Licenses: permissive only, no copyleft

| Status | Licenses |
|---|---|
| ✅ Allowed | MIT (preferred), ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, MIT-0, Apache-2.0, Unlicense, CC0 |
| ❌ Not allowed | GPL, LGPL, AGPL, MPL, EPL, CDDL, SSPL, CC-BY-SA, "Commons Clause", any share-alike / source-release clause |

- Every new dependency gets its license checked **before** install; add it to the table below.
- Phase 0 adds `npm run license:check`, a small in-repo script that reads `package-lock.json` and fails on any license outside the allowlist. It runs in CI later. (This is our own script; most third-party license checkers are fine too, but this one has no dependencies.)
- Never copy code from a copyleft project, even a snippet. Implement from published algorithms or specs instead.
- Our own packages declare `"license": "UNLICENSED"` (private and proprietary) until you choose a license for the product.

**Audit of what is installed today (2026-10-20, from `package-lock.json`, 535 packages):**

| Result | Packages | Action |
|---|---|---|
| ✅ 462 MIT, 26 ISC, 15 BSD, 9 Apache-2.0, 1 0BSD | everything else | none |
| ❌ **GPL-2.0** (runtime, shipped to browser) | `@hebcal/core`, `@hebcal/hdate` | ✅ Removed in Phase 0; replaced by our own module |
| ❌ **LGPL-2.1** | `@hebcal/noaa` (pulled in by hebcal) | ✅ Removed with hebcal |
| ⚠️ MPL-2.0 (dev only, build tool) | `lightningcss` (+ platform binaries) | ✅ Removed in Phase 0 (vitest pinned to 3.x) |
| ⚠️ CC-BY-4.0 (dev only, data) | `caniuse-lite` | Attribution-only data used by build tooling; not share-alike, not shipped. Accept |
| ⚠️ Python-2.0 (dev only) | `argparse` (via eslint) | Permissive, not copyleft. Accept |
| ⚠️ none declared | `@pilzno/api`, `@pilzno/web`, `@pilzno/shared` (ours) | ✅ `"UNLICENSED"` added |

**Libraries planned for later phases (all checked as permissive):**

| Need | Library | License |
|---|---|---|
| UUIDs | none needed; built into Node and browsers (`crypto`) | — |
| Hebrew calendar | none needed; our own module (see Phase 0) | ours |
| Password hashing | none needed; `crypto.scrypt` built into Node | — |
| CSV import/export | `papaparse` | MIT |
| Excel import | `exceljs` | MIT |
| PDF receipts/letters | `pdf-lib` or `pdfkit` | MIT |
| Email sending | `nodemailer` | MIT-0 |
| Security headers / rate limit | `helmet`, `express-rate-limit` | MIT |
| Logging | `pino` | MIT |
| API tests | `supertest` | MIT |
| Image upload | none needed; `express.raw()` (built into Express) | — |

Avoid: SheetJS `xlsx` (the npm copy is outdated and newer builds are off-registry), `kosher-zmanim` (LGPL-3.0), all `@hebcal/*` (GPL), and `hebcal` (GPL-3.0).

### 2. IDs: UUIDs everywhere

- **Every** record gets a UUID primary key: org, families, members, pledges, donations, important dates, notes, and later users, events, and uploads.
- **Generator built in, no dependency:** `newId()` in `@pilzno/shared` produces **UUIDv7** (time-ordered, which keeps SQLite indexes compact and makes IDs sort by creation time). It is about 15 lines on top of `crypto.getRandomValues`, which works in Node and the browser. `crypto.randomUUID()` (v4) is the fallback.
- zod: `id: z.string().uuid()`, and foreign keys (`familyId`, `memberId`, `pledgeId`) are validated as UUIDs too.
- Seed data uses **fixed UUID literals**, so the seed stays deterministic and tests can reference known IDs.
- Today's IDs (`fam-001`, `fam-lx3k…`) are replaced: a one-time migration rewrites every ID and foreign key inside one transaction. The current DB holds demo data, so a reseed works too, but the migration is the pattern real shuls will need.
- `GET /api/org` returns the `orgId`; exports and backups carry it.

### 3. Until login exists (now Phase 5), the app is local-only

The API binds to `127.0.0.1` by default. Don't put real member data on a public URL until
Phase 5 is done.

---

## Where things stand (audited 2026-10-20)

**Committed and working (last commit 2026-10-15):** families, members, pledges, donations,
important dates, notes, duplicate detection, dashboard, the upcoming-dates page, the calendar,
Hebrew dates, and multi-currency.

**Uncommitted work in progress (auth / RBAC / users / family portal):** it requires login on
every page, but the API has no login routes, so the app is unusable. `auth.ts` also has
several bugs: unsalted SHA-256 passwords, NULL inserts into a `NOT NULL` column, a missing
column, mis-bound updates, and a broken family lookup. typecheck shows 11 errors, lint 21,
and 1 test fails.

**Bugs on `master`:**

1. The important-date `CHECK` allows only `birthday | yahrzeit | brit_mitzvah`, so saving bar/bat mitzvah, anniversary, or seuda hoda'a fails.
2. Yahrzeits recur on the Gregorian date instead of the Hebrew date.
3. `STATUS.md` is stale.

---

## Phase 0 — Clean base: park login, UUIDs, licenses — ✅ done 2026-10-20

- [x] Auth work parked on branch `wip/auth` (commit 181685a); `master` has no login gate.
- [x] Important-date `CHECK` dropped via a guarded table rebuild; all six date types now save.
- [x] UUIDv7 `newId()` in shared; every id and foreign key validated as a UUID; seed uses fixed UUIDs; existing DB migrated (43 ids, foreign keys verified).
- [x] `@hebcal/*` removed. Our own `packages/shared/src/hebrewCalendar.ts` matched hebcal on every day 1900–2240 (124,182 days) before removal; known-date tests kept in `apps/api/src/shared.test.ts`.
- [x] **Before/after nightfall** (pulled forward from Phase 1): `afterNightfall` on important dates; the form requires the answer and shows the Hebrew date each choice gives.
- [x] `license` fields + `npm run license:check` (552 packages, all permissive). `lightningcss` (MPL) removed by pinning vitest 3.
- [x] API binds to `127.0.0.1` by default (`HOST` env to override) until login exists.
- [x] typecheck + lint + test (21) + build green; old plans moved to `docs/archive/`.
- [x] Pushed to `origin` 2026-10-20 (master at 7f4481b).

- [x] **Found during Phase 0, fixed 2026-10-20:** every MUI `<Select>` wired with `{...register()}` never showed its selected value. All 21 (the six forms plus the Families and Members page drawers) now use `Controller`. Also restored the Edit family dialog, which opened blank since 25be7f4.

## Phase 1 — Domain correctness (shul-critical)

- [ ] **Hebrew-date recurrence** for recurring dates, with a per-date "recur by Hebrew / Gregorian" option (Hebrew is the default for yahrzeits).
- [ ] Yahrzeit rules (the after-nightfall flag is done in Phase 0): Adar in leap and non-leap years, and 30 Cheshvan/Kislev. Each rule gets unit tests.
- [ ] Centralize date-type labels and colors (currently copied in 5 files).
- [ ] Seed important dates with an after-nightfall answer (seeded dates can't be saved from Edit until one is chosen).
- [ ] Let Edit Note change the linked member (the member dropdown only appears on New).

## Phase 2 — Configurability layer (what makes "another shul" possible)

- [ ] **Org profile in Settings:** name, short name, `orgId` (UUID, read-only), address, default currency, locale, timezone, and palette.
- [ ] **Shul logo upload in Settings:**
  - Formats: PNG, JPEG, and WebP, max 2 MB. No SVG, because SVG can carry scripts.
  - Preview before saving, plus "Replace" and "Remove" buttons.
  - API: `PUT /api/org/logo` (raw image body, type and size checked server-side), `GET /api/org/logo` (served with cache headers), and `DELETE /api/org/logo`. The image is stored in the DB (one BLOB row), so a backup is still one file.
  - Used in: the sidebar header (replacing the hard-coded "Pilzno" text), the browser-tab favicon, and later receipts, letters, emails, and the login page.
  - When no logo is set, show the org's initials in the palette color.
- [ ] **Lookup lists** (editable in Settings): important-date types, funds, note types, member roles, payment methods, and currencies.
- [ ] **Terminology map** (Family → Household, etc.) with a `useTerms()` hook.
- [ ] **Feature modules on/off:** Hebrew calendar, yahrzeits, pledges, and later events and the portal.
- [ ] **Seed split:** a generic demo org ("Beth Shalom"); Pilzno's real data arrives by import.
- [ ] **CSV/Excel import + export** (`papaparse`, `exceljs`), with column mapping, preview, duplicate detection, and UUIDs assigned on import.
- [ ] Rename packages `@pilzno/*` to a neutral name.

## Phase 3 — Operational features (Stage 3)

1. [ ] Donation receipts and year-end statements as PDFs (`pdf-lib`), with the logo and org details from Settings.
2. [ ] Yahrzeit notices: a monthly list and printable letters ahead of each yahrzeit.
3. [ ] Email templates with variables; sending through SMTP (`nodemailer`) set up in Settings.
4. [ ] Reports, with CSV export.
5. [ ] Events and RSVPs on the calendar.
6. [ ] Later, optional: seats, aliyot/kibbudim, and dues schedules.

## Phase 4 — Hardening (core)

- [ ] Real numbered migrations plus a `schema_version` table (replacing `ensureColumn`).
- [ ] Pagination, search, and sort on the list endpoints.
- [ ] API integration tests (`supertest`); CI (install → license:check → lint → typecheck → test → build).
- [ ] Backups: scheduled `VACUUM INTO` snapshots, plus a "download backup" button.
- [ ] Logging (`pino`) with no PII in the logs.

## Phase 5 — Login, users and roles (moved here by request)

Starts from the `wip/auth` branch, with its bugs fixed:

- [ ] `/api/auth/login|logout|session`, an `httpOnly` session cookie, and `requireAuth` on all `/api/*`.
- [ ] `crypto.scrypt` + salt + `timingSafeEqual`; user IDs are UUIDs.
- [ ] First-run owner setup (env vars or a setup screen).
- [ ] Fixed roles `owner | admin | staff | viewer | member` with a permission map in `shared`, enforced on the API and in the UI. A `member` user is linked to one member record and can only reach their own family (used by Phase 6).
- [ ] Users page: invite (copyable link, or email once Phase 3 email exists), deactivate, change role.
- [ ] `helmet`, a CORS lock-down, and login rate limiting (`express-rate-limit`).
- [ ] `createdBy` on records plus an audit log.

## Phase 6 — Member portal

Decided 2026-10-20: one login per adult member, edits go live, and payments happen in another system.

- [ ] **Logins:** staff invite an adult member (any member with an email can be invited; staff decide who counts as adult) from the member's page. Each login is a `member` user tied to that one member record. Spouses get separate logins and see the same family.
- [ ] **Portal app:** a separate, simple layout at `/portal` (not the staff sidebar). Members never see other families, staff notes, or Settings. The API scopes every portal route to the user's own `familyId` on the server; the UI hiding things is not the protection.
- [ ] **My family:** edit the family's contact details (address, phone, WhatsApp, email) and its members (add and edit). Edits save immediately. Status, internal notes, and family merging stay staff-only.
- [ ] **My dates:** add, edit, and remove the family's important dates, including the before/after-nightfall question and the Hebrew date preview.
- [ ] **Audit trail:** every portal edit is written to the Phase 5 audit log (who, when, old → new). Staff get a "Recent member changes" list with a per-change undo.
- [ ] **My account:** open pledges with the amount still owed, the donation history, and receipts once Phase 3 receipts exist. Read-only.
- [ ] **Pay button:** a payment link set in Settings (the shul's own page at a processor such as a bank, PayPal, or Nedarim Plus). The link opens in a new tab; card details never reach this app. The URL template may add the amount and an opaque pledge reference, never names or emails. Staff record the payment as a donation when it arrives (a later import from the processor is optional).
- [ ] **Sponsorships:** staff set up sponsorable items with dates and suggested amounts (Shabbat kiddush, seudah shlishit, a shiur, etc.). Members see open slots, claim one with an optional dedication ("l'ilui nishmat …"), and the claim creates a pledge for their family and appears on the calendar. One sponsor per slot unless staff allow co-sponsors; staff can release a claim.
- [ ] Turned on or off with the Phase 2 feature-module switch.

## Phase 7 — Packaging per shul

- [ ] One Dockerfile (the API serves the built web app), with a volume for `data/`. Use the official `node` image; the OS packages inside it don't affect our code's license.
- [ ] `.env.example`, a new-org setup wizard (org profile → logo → owner → import), and a README with a "deploy a new shul" guide.

---

## Order and checkpoints

| # | Phase | Checkpoint |
|---|---|---|
| 0 | Clean base | App works without login; all IDs are UUIDs; `license:check` passes with zero copyleft; pushed |
| 1 | Hebrew recurrence | Yahrzeit list matches a luach for a test set |
| 2 | Configurability + logo + import | Demo "Beth Shalom" runs from Settings alone with its own logo; Pilzno data imported |
| 3 | Receipts, notices, email, reports | Pilzno uses it for real (on a local/office machine) |
| 4 | Hardening | CI green; backups running |
| 5 | Login and roles | Owner invites an admin; a viewer can't edit; safe to put online |
| 6 | Member portal | A member logs in, fixes their address, adds a yahrzeit, sees what they owe, follows the pay link, and sponsors a kiddush; staff see each change in the audit log |
| 7 | Packaging | A fresh shul is up in minutes |
