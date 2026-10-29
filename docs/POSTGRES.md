# PostgreSQL

Shul CRM uses **PostgreSQL** for all data (families, pledges, settings, logos as `BYTEA`, users, org memberships, audit, and so on).

## Connection

Set **`DATABASE_URL`** to a standard PostgreSQL URL:

```env
DATABASE_URL=postgresql://user:password@host:5432/shulcrm
```

On startup the API runs **schema version 8** migrations (`apps/api/src/database/postgres-schema.ts`). There is no SQLite migration path; demo/local installs can be wiped and re-seeded.

## Local development

**Docker (recommended):**

```bash
docker compose up -d
```

The app service waits for Postgres and uses `DATABASE_URL=postgresql://shulcrm:shulcrm@db:5432/shulcrm`.

**Without Docker:** run Postgres 16+ locally, create a database, set `DATABASE_URL`, then from the repo root:

```bash
npm run dev
```

**Tests** use **PGlite** (embedded Postgres) via `DATABASE_URL=pglite://…` — see `apps/api/src/testing/test-env.ts`. No separate server is required for `npm test`.

## Backups

- **Real Postgres:** automatic/manual snapshots call **`pg_dump`** (PostgreSQL client tools must be on `PATH`).
- **PGlite:** a small placeholder `.sql` marker file is written under `CRM_DATA_DIR/backups` (use `pg_dump` against a real server for production backups).

Restore: stop the app, restore the dump into Postgres, start the app.

## Legacy SQLite

Older installs used a single `crm.sqlite` file. That path has been removed from the runtime; export anything you need before upgrading, then point `DATABASE_URL` at a fresh Postgres database and let the app seed demo data or import.
