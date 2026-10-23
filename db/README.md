Database layout
================

- `schema.sql`: Canonical snapshot of the current PostgreSQL schema (regenerated 2026-10-23 from the live database with `sudo -u postgres pg_dump -s --no-owner causal_db`). The role `causal_app` must exist before loading it. CI builds its test database from this file. Migrations cannot build a database from nothing (001 expects tables that already exist), so regenerate this file after any migration.
- `reference-data.sql`: the system rows a fresh database needs (document expectations, retention rules, agreement templates). Load it right after `schema.sql`; regenerate it with `pg_dump -a --column-inserts` on those three tables when they change.
- `migrations/`: Incremental schema changes applied over time.
  - `001_initial_schema.sql`: Initial tables (users, sessions, actions, user_actions, parsed_emails, etc.).

Applying the schema
-------------------

For a brand‑new database:

- Run `schema.sql`:

  ```bash
  psql -U postgres -h localhost -d causal_db -f db/schema.sql
  ```

For subsequent changes:

- Add a new migration file under `db/migrations/` with an incremented number, e.g.:
  - `002_add_rep_targets.sql`
  - `003_add_orgs_tables.sql`
- Apply in order:

  ```bash
  psql -U postgres -h localhost -d causal_db -f db/migrations/002_add_rep_targets.sql
  ```

