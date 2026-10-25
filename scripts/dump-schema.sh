#!/bin/bash
# Regenerate db/schema.sql from the live database. The first line records the highest migration number it includes.
set -euo pipefail
cd "$(dirname "$0")/.."
last=$(ls db/migrations | grep -E '^[0-9]{3}_.*\.sql$' | sort | tail -1 | cut -c1-3)
{ echo "-- Includes migrations through $last"; runuser -u postgres -- pg_dump -s --no-owner causal_db; } > db/schema.sql.new
mv db/schema.sql.new db/schema.sql
echo "db/schema.sql written through migration $last"
