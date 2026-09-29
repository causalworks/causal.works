Database layout
================

- `schema.sql`: Canonical snapshot of the current PostgreSQL schema. Use this to create a fresh database in one step when bootstrapping a new environment.
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

