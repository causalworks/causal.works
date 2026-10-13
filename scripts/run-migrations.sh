#!/usr/bin/env bash
# Run pending DB migrations. Use on the server after deploy.
# Usage: from repo root, ./scripts/run-migrations.sh
# Requires: .env with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found. Create from .env.example and set DB_* then run again."
  exit 1
fi

# Load .env (no export of other vars)
set -a
source .env
set +a

# Run all migrations in numeric order (001, 002, ...) so none are ever skipped
for f in db/migrations/*.sql; do
  [ -f "$f" ] || continue
  echo "Running $f ..."
  PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -f "$f"
done
echo "Done."
