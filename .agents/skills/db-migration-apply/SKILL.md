---
name: db-migration-apply
description: Use when applying database migrations — runs the SQL file, verifies schema changes, and confirms columns exist before code tries to use them.
user-invocable: true
---

# Apply Database Migration & Verify Schema

Use this skill to safely apply a migration file and verify the schema changed as expected.

**Typical usage:**
```
/db-migration-apply path/to/migration/NNN_description.sql
```

## What This Skill Does

1. **Apply the migration** via `sudo -u postgres psql causal_db -f <file.sql>`
2. **Verify each table** affected by the migration using `\d <table_name>` 
3. **Check column existence** — confirm all expected columns exist
4. **Compare expected vs. actual** — warn if columns are missing or types mismatch
5. **Report results** with a schema diff
6. **If the migration added a table or a foreign key**, run
   `sudo -u postgres psql causal_db -f scripts/rls-coverage-audit.sql` and check the new table/
   column doesn't show up as `MISSING`/`GAP`. This is schema-driven (walks the actual FK graph
   into `coop_members`/`org_programs`, not a hardcoded table list) specifically so a new table
   gets caught automatically instead of relying on someone remembering to add RLS by hand — see
   `.claude/plans/2026-09-19-solid-odi-demo-readiness.md`'s "RLS coverage tooling" section for
   why this exists (migration 259 shipped with real gaps for exactly that reason). If the audit
   flags something and you're not sure whether it's a real gap or an intentional exclusion
   (e.g. `cooperative_*` tables are deliberately cross-org, some FKs are data lineage not access
   control), don't guess — check the table's actual data/usage or ask before writing a policy.

## When to Use

✅ **Use this skill:**
- After creating a new migration file
- Before merging a branch with schema changes
- When code is about to write to new columns

❌ **Do NOT use for:**
- Exploratory queries (use psql directly)
- Data backfills (handle separately after schema is verified)
- Rollback operations (migrations are one-way; create a new migration to undo)

## How to Call It

### Basic usage:
```bash
/db-migration-apply db/migrations/0042_add_timing_confidence.sql
```

### What to provide:
- **Exact path** to the migration file (relative or absolute)
- Skill will verify the file exists before running

## Output

Example output for a successful migration:

```
=== Applying Migration ===
$ sudo -u postgres psql causal_db -f db/migrations/0042_add_timing_confidence.sql
✓ Migration applied successfully

=== Verifying Schema ===
Table: actions
  Expected columns: [id, title, scenario_label, timing_confidence, e4a_parameters]
  ✓ id (integer)
  ✓ title (text)
  ✓ scenario_label (text)
  ✓ timing_confidence (integer)
  ✓ e4a_parameters (text[])

✓ All columns verified
```

### If there's a problem:

```
=== Verifying Schema ===
Table: actions
  ✗ timing_confidence column MISSING
  ✗ e4a_parameters column MISSING

Suggestion: Check migration file syntax or re-run with verbose output
```

## Important Notes

- **schema.sql lags the live DB** — Always verify after applying a migration, don't trust schema.sql
- **One migration per call** — Apply migrations one at a time, verify each
- **Reversible?** No — migrations are applied forward only. Create a new migration to undo.
- **Permissions** — Runs via `postgres` user; requires sudo access
- **Safe to re-run** — If migration fails partway, some tables may be partially updated. Check the skill output carefully.

## Common Workflow

1. **Create migration** with new columns/tables
2. **Run this skill** to apply and verify
3. **Update code** to use new columns (e.g., in `ai-service.js`, `index.js`)
4. **Restart server** (`/pm2-restart-health-check`)
5. **Test the feature** end-to-end

## Example: Adding a Column

**Step 1: Create migration file** `db/migrations/0042_add_timing_confidence.sql`:
```sql
ALTER TABLE actions ADD COLUMN timing_confidence INT DEFAULT 0;
ALTER TABLE actions ADD COLUMN e4a_parameters TEXT[] DEFAULT '{}';
```

**Step 2: Apply and verify:**
```bash
/db-migration-apply db/migrations/0042_add_timing_confidence.sql
```

**Step 3: Update code** to write to these columns in `index.js`:
```javascript
const result = await db.query(
  `INSERT INTO actions (..., timing_confidence, e4a_parameters) 
   VALUES (..., $n, $m)`,
  [..., timingConfidence, e4aParams]
);
```

**Step 4: Restart and test:**
```bash
/pm2-restart-health-check
# Then test in browser or with curl
```

## What's Verified

The skill checks:
- ✓ Migration file exists and is readable
- ✓ SQL syntax is valid (runs without error)
- ✓ All expected columns exist
- ✓ Column types match expectations (for common types)
- ✓ No unexpected columns were created
- ✓ Indexes/constraints applied correctly (if in migration)

## Debugging Failed Migrations

If the migration fails:
1. Check the error message — SQL syntax or constraint violation?
2. Read the migration file carefully — are there typos?
3. Verify the table already exists (can't ALTER a table that doesn't exist)
4. If a column already exists, use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
5. Check for foreign key conflicts or unique constraint violations

The skill will report exactly which step failed and suggest fixes.
