# Shul CRM

A CRM for a synagogue: families and members, pledges and donations, Hebrew dates and yahrzeits,
receipts and statements, events and RSVPs, and a portal where members keep their own details up to
date. One install serves one shul, and everything a shul calls its own — the words it uses, its
funds, its payment methods, its date types — is configuration rather than code.

- `ROADMAP.md` — the ground rules, every phase, and what is left.
- `STATUS.md` — what exists today and where each piece lives.
- `docs/HANDOVER.md` — the briefing for a developer picking the project up.
- `docs/GITHUB_PAGES.md` — optional GitHub Pages UI with the API on Tailscale (mini PC).

## Deploy a new shul

### With Docker (recommended)

```bash
cp .env.example .env     # read it through; PUBLIC_URL and the HTTPS settings matter
docker compose up -d
docker compose logs -f app
```

The first start has no users. Open the app, and the page offers to create the owner account. From
any machine other than the server itself, it also asks for a **setup code**, which that start
printed to the log — the line beginning "No users yet". This is so that an install exposed to the
internet cannot be claimed by whoever reaches it first.

Then work through "What to do first" below: the shul's name and address, its logo, the words it uses
and its lists, importing existing records, and inviting the office.

Everything the shul owns lives in one directory — the SQLite database, its nightly backups and the
logo. In Docker that is the `shulcrm-data` volume, mounted at `/data`. **That volume is the backup.**

### Without Docker

Node 24 or newer is required: the API uses `node:sqlite` and runs TypeScript directly.

```bash
npm ci
npm run build          # builds the web app into apps/web/dist
npm start              # the API serves the API and that build on one port
```

### Put HTTPS in front of it

The app does not terminate TLS. **Before it goes anywhere near the internet**, put a reverse proxy
(Caddy, nginx, Traefik) in front of it and then set, in `.env`:

- `TRUST_PROXY=1` — so the app believes the proxy's `X-Forwarded-*` headers. It also makes the
  first-run setup code mandatory, because requests no longer look local.
- `COOKIE_SECURE=1` — so the session cookie never travels over plain HTTP.
- `PUBLIC_URL=https://…` — the address people type, so invitation and reset links point at it.

`.env.example` documents every setting the app reads.

## What to do first (for the office)

1. **Settings → Organization.** The shul's name, address and logo. These appear on every receipt,
   statement and notice.
2. **Settings → Terminology.** If the shul says households rather than families, or congregants
   rather than members, change it here and the whole app follows.
3. **Settings → Lists.** Funds, payment methods, currencies, date types, member roles, note types.
   Set these before importing, so the import has somewhere to put things.
4. **Import.** Settings → Data takes CSV or Excel for families, members, pledges, donations, notes
   and important dates. It shows you what it will do before it does it. Take a backup first.
5. **Settings → Email.** Your SMTP details. The app starts in **test mode**, which writes messages
   to the log instead of sending them; nothing reaches a member until you turn that off.
6. **Settings → Users.** Invite the office by email, each with a role: an admin can change
   settings, a user can edit records, a viewer can only look.
7. **Settings → Data.** Check that a backup has run. Backups are nightly by default and the last 14
   are kept.

Members get into the portal by invitation from their member record, not by signing themselves up.

## Developing

```bash
npm install
npm run dev        # API on 127.0.0.1:3000, web on localhost:5173
npm run check      # licence check, lint, typecheck, API tests, build — all must pass
```

The local owner and a member-portal test account are written to `apps/api/data/dev-owner.txt` on
first run. That directory holds real local data and is not in git.

Dependencies are **permissive-licence only** — `npm run license:check` enforces it and runs in CI.
Check a new dependency and its transitive dependencies before installing it; `ROADMAP.md` explains
why several obvious choices were not taken.
