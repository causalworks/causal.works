#!/usr/bin/env bash
# Apply pending DB migrations, once each, in filename order. Stops at the first error.
# Usage: ./scripts/run-migrations.sh            apply files not yet recorded
#        ./scripts/run-migrations.sh --baseline record every current file as applied without running it (first use on an existing database)
#        ./scripts/run-migrations.sh --list     show pending files
# Requires: .env with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD; the user must be allowed to change the schema.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found. Create from .env.example and set DB_* then run again."
  exit 1
fi

set -a
source .env
set +a

run_psql() {
  PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q "$@"
}

run_psql -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

mode="${1:-apply}"
recorded=$(run_psql -At -c "SELECT filename FROM schema_migrations")

if [ "$mode" = "--baseline" ]; then
  if [ -n "$recorded" ]; then
    echo "schema_migrations already has entries; baseline is only for first use."
    exit 1
  fi
  for f in db/migrations/*.sql; do
    run_psql -c "INSERT INTO schema_migrations (filename) VALUES ('$(basename "$f")')"
  done
  echo "Baseline recorded."
  exit 0
fi

if [ -z "$recorded" ] && [ "$mode" != "--list" ]; then
  echo "schema_migrations is empty. On an existing database run with --baseline first."
  exit 1
fi

pending=0
for f in db/migrations/*.sql; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  if grep -qxF "$name" <<<"$recorded"; then continue; fi
  pending=$((pending + 1))
  if [ "$mode" = "--list" ]; then echo "pending: $name"; continue; fi
  echo "Running $name ..."
  run_psql < "$f"
  run_psql -c "INSERT INTO schema_migrations (filename) VALUES ('$name')"
done
echo "Done. $pending migration(s) $([ "$mode" = "--list" ] && echo pending || echo applied)."
