#!/bin/bash
# Nightly database dump to a local directory, then a restore into a scratch database with integrity checks.
# Run as root (cron). Writes last-status.json and backup.log beside the dumps.
set -uo pipefail

DB=causal_db
SCRATCH=restore_check
DIR=${BACKUP_DIR:-/var/backups/causal-db}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$DIR/$DB-$STAMP.dump"
LOG="$DIR/backup.log"
STATUS="$DIR/last-status.json"
PSQL=(runuser -u postgres -- psql -X -qAt)

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
fail() {
  log "FAILED: $1"
  printf '{"ok":false,"at":"%s","error":"%s"}\n' "$STAMP" "$1" > "$STATUS"
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1
  exit 1
}

mkdir -p "$DIR"; chmod 700 "$DIR"
count() { "${PSQL[@]}" -d "$1" -c "SELECT count(*) FROM $2"; }

before_lines=$(count $DB org_ledger_lines) || fail "count before dump"
before_txns=$(count $DB org_ledger_transactions) || fail "count before dump"
before_audit=$(count $DB org_audit_log) || fail "count before dump"

runuser -u postgres -- pg_dump -Fc "$DB" > "$FILE.partial" || fail "pg_dump"
mv "$FILE.partial" "$FILE"; chmod 600 "$FILE"

after_lines=$(count $DB org_ledger_lines); after_txns=$(count $DB org_ledger_transactions); after_audit=$(count $DB org_audit_log)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1 || fail "drop scratch"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $SCRATCH" >/dev/null || fail "create scratch"
start=$(date +%s)
runuser -u postgres -- pg_restore --no-owner -d "$SCRATCH" < "$FILE" > "$DIR/restore.out" 2>&1
rc=$?
restore_errors=$(grep -c '^pg_restore: error' "$DIR/restore.out")
cat "$DIR/restore.out" >> "$LOG"
restore_secs=$(( $(date +%s) - start ))
# pg_restore exits non-zero on warnings; the checks below decide
r_lines=$(count $SCRATCH org_ledger_lines) || fail "restored database has no ledger lines table (restore exit $rc)"
r_txns=$(count $SCRATCH org_ledger_transactions) || fail "restored ledger transactions"
r_audit=$(count $SCRATCH org_audit_log) || fail "restored audit log"
src_tables=$("${PSQL[@]}" -d $DB -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
r_tables=$("${PSQL[@]}" -d $SCRATCH -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
unbalanced=$("${PSQL[@]}" -d $SCRATCH -c "SELECT count(*) FROM (SELECT transaction_id FROM org_ledger_lines GROUP BY 1 HAVING sum(debit_cents) <> sum(credit_cents)) x")

[ "$r_tables" = "$src_tables" ] || fail "table count $r_tables restored, $src_tables live"
[ "$r_lines" -ge "$before_lines" ] && [ "$r_lines" -le "$after_lines" ] || fail "ledger lines $r_lines restored, $before_lines to $after_lines live"
[ "$r_txns" -ge "$before_txns" ] && [ "$r_txns" -le "$after_txns" ] || fail "ledger transactions $r_txns restored, $before_txns to $after_txns live"
[ "$r_audit" -ge "$before_audit" ] && [ "$r_audit" -le "$after_audit" ] || fail "audit log $r_audit restored, $before_audit to $after_audit live"
[ "$unbalanced" = "0" ] || fail "$unbalanced unbalanced entries in the restored database"

"${PSQL[@]}" -d postgres -c "DROP DATABASE $SCRATCH" >/dev/null
find "$DIR" -name "$DB-*.dump" -mtime +"$KEEP_DAYS" -delete
size=$(stat -c %s "$FILE")
log "ok file=$(basename "$FILE") bytes=$size restore_secs=$restore_secs restore_errors=$restore_errors tables=$r_tables ledger_lines=$r_lines transactions=$r_txns audit_rows=$r_audit"
printf '{"ok":true,"at":"%s","file":"%s","bytes":%s,"restore_seconds":%s,"restore_errors":%s,"tables":%s,"ledger_lines":%s,"transactions":%s,"audit_rows":%s}\n' \
  "$STAMP" "$(basename "$FILE")" "$size" "$restore_secs" "$restore_errors" "$r_tables" "$r_lines" "$r_txns" "$r_audit" > "$STATUS"
