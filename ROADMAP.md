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
| ⚠️ none declared | `@shulcrm/api`, `@shulcrm/web`, `@shulcrm/shared` (ours) | ✅ `"UNLICENSED"` added |

**Libraries planned for later phases (all checked as permissive):**

| Need | Library | License |
|---|---|---|
| UUIDs | none needed; built into Node and browsers (`crypto`) | — |
| Hebrew calendar | none needed; our own module (see Phase 0) | ours |
| Password hashing | none needed; `crypto.scrypt` built into Node | — |
| CSV import/export | `papaparse` | MIT |
| Excel import | own reader/writer over `fflate` (MIT); `exceljs` rejected (unlicensed dependency) | MIT |
| PDF receipts/letters | browser print (Save as PDF); `pdf-lib` would bring `pako` (Zlib) | — |
| Email sending | `nodemailer` | MIT-0 |
| Security headers / rate limit | `helmet`, `express-rate-limit` (in use) | MIT |
| Logging | `pino` (in use) | MIT |
| API tests | `supertest` (in use) | MIT |
| Image upload | none needed; `express.raw()` (built into Express) | — |

Avoid: SheetJS `xlsx` (the npm copy is outdated and newer builds are off-registry), `kosher-zmanim` (LGPL-3.0), all `@hebcal/*` (GPL), and `hebcal` (GPL-3.0).

### 2. IDs: UUIDs everywhere

- **Every** record gets a UUID primary key: org, families, members, pledges, donations, important dates, notes, and later users, events, and uploads.
- **Generator built in, no dependency:** `newId()` in `@shulcrm/shared` produces **UUIDv7** (time-ordered, which keeps SQLite indexes compact and makes IDs sort by creation time). It is about 15 lines on top of `crypto.getRandomValues`, which works in Node and the browser. `crypto.randomUUID()` (v4) is the fallback.
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

## Phase 1 — Domain correctness (shul-critical) — ✅ done 2026-10-20

- [x] **Hebrew-date recurrence** (`packages/shared/src/recurrence.ts`): each date has `recurBy` (`hebrew | gregorian`); unset means the type's default (Hebrew for yahrzeits, bar/bat mitzvah and seuda hoda'a; English for birthdays and anniversaries). The form asks "Repeats on" and previews the next occurrence. The upcoming list, the dashboard and the calendar all use it.
- [x] Yahrzeit rules, each with unit tests: Adar of a regular year kept in Adar I in a leap year (Adar II available as an option; becomes a shul setting in Phase 2), Adar II deaths always in the last Adar, 30 Adar I → 30 Sh'vat, and 30 Cheshvan/Kislev decided by the first anniversary. Hebrew birthdays use the matching "last month of the year" rule.
- [x] **Checkpoint:** 1,680 yahrzeits (84 test deaths, every edge case, before and after nightfall, 20 years each) match Hebcal's yahrzeit calculator exactly.
- [x] Date-type labels and colors in one place (`packages/shared/src/dateTypes.ts`).
- [x] Seeded important dates have an after-nightfall answer; a test checks each seeded Hebrew date.
- [x] Edit Note can change or remove the linked member.
- [x] **Also fixed:** the Calendar page never received any dates (it now loads `/api/important-dates/occurrences`); the "Repeats annually" checkbox never showed as ticked on edit; a new Birthday was prefilled with the 13th birthday (now the birth date; bar/bat mitzvah get the Hebrew 13th/12th birthday); and clearing an optional field on edit (phone, note member, …) never saved. `PATCH` now treats `null` as "clear", for optional fields only.

## Phase 2 — Configurability layer (what makes "another shul" possible) — ✅ done 2026-10-20

- [x] **Settings** (`/api/settings`, stored as one JSON value per part in a `settings` table) with five tabs: Organization, Lists, Terms, Features, Data.
- [x] **Org profile:** name, short name, `orgId` (UUID, set on first start, never editable), address, phone, email, website, default currency, locale, time zone, two colors (the theme is built from them), and the Adar yahrzeit custom. The browser tab title follows the short name.
- [x] **Shul logo:** PNG, JPEG or WebP up to 2 MB, checked by its first bytes on the server (SVG refused); preview, Replace and Remove; stored as one BLOB row in a `files` table. Shown in the sidebar and as the favicon; without one, the shul's initials on its color.
- [x] **Lookup lists** editable in Settings: date types (label, color, Hebrew/English recurrence, yahrzeit or birthday rules), funds, payment methods, currencies (symbol, number format), member roles, note types. Records store a key; an item in use can be retired but not deleted; the API rejects values not in a list. Values found on old records but missing from a list are added at startup as retired items (e.g. an old `brit_mitzvah` date type).
- [x] **Terms** (Family → Household, …) through `useSettings().t()`, used in the nav, page titles, dialogs and import.
- [x] **Feature switches:** Hebrew calendar (off: no nightfall question, English-date recurrence), yahrzeits, pledges (off: donations only); events and portal switches are in place for Phases 3 and 6.
- [x] **Seed split:** a fresh install is the generic "Beth Shalom" demo (profile and Springfield demo data). This install keeps its records and is named Pilzno.
- [x] **CSV/Excel import + export:** pick a kind (families, members, pledges, donations, important dates), upload, columns are matched from the headers (editable), preview shows ready / duplicate / problem rows, then one transaction writes them with new UUIDs. Families can be created by name; missing funds and methods are added to the lists. Exports use the import headers, so a file round-trips. `papaparse` for CSV; Excel is read and written by our own small module over `fflate` (MIT). `exceljs` was rejected: a dependency of it (`buffers`) has no license at all.
- [x] Packages renamed `@pilzno/*` → `@shulcrm/*` (root: `shul-crm`).
- [x] **Also:** the sidebar links did a full page reload (now client-side), and on a phone there was no way to open the menu (now a menu button).
- [ ] **Checkpoint, part 2:** import Pilzno's real data. The import is ready; it needs the files from Pilzno's current records.

## Phase 3 — Operational features (Stage 3) — ✅ done 2026-10-20 (checkpoint: Pilzno to try it)

1. [x] **Receipts and year-end statements** with the logo and org details (plus a tax/charity number and receipt footer in Settings). One family's statement, or every family that gave in a year, one per page.
   - Built as print-ready pages (`/print/receipt/:id`, `/print/statement/:familyId`, `/print/statements`); the browser's Print → Save as PDF makes the PDF. Not `pdf-lib`: it needs `pako` (MIT AND **Zlib**, not on our list), and any server-made PDF with Hebrew names needs an embedded Hebrew font, and the free ones are SIL OFL (also not on our list). Both would be license-policy decisions; see "Open questions" below.
2. [x] **Yahrzeit notices:** pick a month on the Important Dates page → print the list, print one letter per family, or email reminders. Dates now record who is remembered ("In memory of": name, Hebrew name, relationship); the panel warns when a yahrzeit doesn't say.
3. [x] **Email:** SMTP settings in Settings → Email (password write-only), **test mode on by default** (messages are rendered and logged, never sent), test message, editable templates with `{{variables}}` (receipt, yahrzeit reminder, statement, event invitation), preview before sending, and an email log. `nodemailer` (MIT-0). Sending from a receipt, a statement, the yahrzeit panel, and an event.
4. [x] **Reports** with CSV export: donations by fund and month, donors, pledge status, lapsed donors, directory, yahrzeits by month.
5. [x] **Events and RSVPs:** events page, RSVPs per family (adults/children, capacity enforced), invitations by email, and events on the calendar. Switched off with the Events feature.
6. [ ] Later, optional: seats, aliyot/kibbudim, and dues schedules. (Not started; dues would build on pledges.)
- [ ] **Checkpoint:** Pilzno uses it for real on a local/office machine. Needs the Pilzno data import (Phase 2) and a real mail server (then turn test mode off).

**Open questions (yours to decide):** server-made PDF attachments for emailed receipts would need `pako` (Zlib license) and an OFL-licensed Hebrew font approved; until then emails carry the receipt in the message body.

## Phase 4 — Hardening (core) — ✅ done 2026-10-20 (checkpoint: CI goes green on the first push)

- [x] Real numbered migrations plus a `schema_version` table (`apps/api/src/migrations.ts`; done early, in Phase 2).
- [x] **Pagination, search, and sort:** `GET /api/{families,members,pledges,donations}/page?q=&sort=&order=&limit=&offset=` plus filters (family, year, status, …), done in SQL with whitelisted sort keys; money lists also return per-currency totals of the whole filtered set. The Families, Members and Pledges & Donations pages use it (search, sortable columns, paging, year filter). The donation form now offers only the chosen family's pledges.
- [x] **API integration tests** (`supertest`, `apps/api/src/http.test.ts`) over the whole app, which moved to `app.ts` so tests load it without a port. 91 tests in all.
- [x] **CI:** `.github/workflows/ci.yml` (Node 24): `npm ci` → license:check → lint → typecheck → test → build → `npm audit --audit-level=high`. `npm run check` runs the same locally.
- [x] **Backups:** a `VACUUM INTO` snapshot at start-up and then daily (`BACKUP_INTERVAL_HOURS`, newest `BACKUP_KEEP`=14 kept), "Back up now and download" and a list with downloads in Settings → Data, and a snapshot before every demo reset. Restore = replace `data/crm.sqlite`.
- [x] **Logging** (`pino`, JSON lines): one line per request with the path (ids and backup names replaced by placeholders, no query strings), status and time; no bodies, names or emails; silent in tests.
- [x] **Dependencies:** `npm audit` from 19 findings to **0**: react-router 7, Vite 7, Vitest 4, typescript-eslint 8. Vite 8 / Vitest 5 avoided because they need MPL-2.0 `lightningcss`.

## Phase 5 — Login, users and roles — ✅ done 2026-10-20

Written fresh rather than from `wip/auth`: that branch never built, and its empty tables are dropped by migration 4.

- [x] `/api/auth/{session,login,logout,setup,password,token/:token}`, an `httpOnly` `SameSite=Lax` session cookie (only the token's SHA-256 is stored), and a permission check in front of every `/api/*` route.
- [x] `crypto.scrypt` with a per-user salt and `timingSafeEqual`; the cost is recorded in the hash so it can be raised later. A wrong password and an unknown address take the same work and give the same message.
- [x] First-run owner setup: a setup screen on this machine, a one-time code (printed in the log) from anywhere else, or `OWNER_EMAIL`/`OWNER_PASSWORD` for Docker. Behind a proxy the code is always required, since every visitor then arrives from loopback.
- [x] Roles `owner | admin | staff | viewer | member` with the permission map in `packages/shared/src/auth.ts`, enforced by a route-prefix table on the API and used by the web app to hide what you cannot do. A `member` user is tied to one member record, ready for Phase 6.
- [x] Users page: invite (the link is shown once to copy by hand, since email may not be set up), change role, disable and re-enable, and new invite/reset links. The last active owner cannot be demoted or disabled; only an owner may make or change an owner.
- [x] `helmet`, same-origin-only requests (no CORS headers; an Origin check on every write), and rate limiting on the sign-in, setup and link routes.
- [x] `createdBy` on records plus an audit log (who, when, and the fields that changed), shown under Settings → Activity.
- [x] **Found and fixed while testing:** Express matches routes case-insensitively and builds its router on the first `app.use`, so `POST /api/RESET` reached the reset route past a permission table written in lower case. Fixed in two independent ways — the setting now precedes every `app.use`, and the permission check lower-cases the path — with the rule table also denying by default. A regression test covers five spellings.
- [x] 110 API tests, including the whole permission matrix per role.

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
