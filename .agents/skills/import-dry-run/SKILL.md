---
name: import-dry-run
description: Use before running imports — preview what will be created/updated/deleted without making changes.
user-invocable: true
---

# Import Dry-Run

Use this skill to preview CSV imports before applying them. Shows exactly what will change without destructive operations.

## When to Use

✅ **Use this skill before:**
- Importing chart of accounts (COA)
- Importing personnel
- Importing programs/grants
- Importing budget lines
- Importing actuals from Xero
- Any bulk data import

❌ **Do NOT use for:**
- One-off manual edits (use UI)
- Production data changes (use migrations)
- Emergency data fixes (use direct SQL)

## How to Use

### Basic Dry-Run

```
/import-dry-run test-org coa.csv
```

Previews COA import without applying.

### With Type Specified

```
/import-dry-run test-org --type coa --file coa.csv
/import-dry-run test-org --type personnel --file staff.csv
/import-dry-run test-org --type budget-lines --file budget.csv
```

Supported types:
- `coa` — Chart of accounts
- `personnel` — Employees and contractors
- `programs` — Program definitions
- `grants` — Grant definitions
- `budget-lines` — Monthly budget allocations
- `actuals` — P&L actuals from Xero

### Detailed Report

```
/import-dry-run test-org coa.csv --detailed
```

Shows before/after values for each row.

### CSV Validation Only

```
/import-dry-run test-org coa.csv --validate-only
```

Checks CSV format without database comparison.

---

## Output

### Summary Report

```
=== IMPORT DRY-RUN REPORT ===
File: coa.csv
Organization: test-org
Type: Chart of Accounts
Fiscal year: (all)

=== SUMMARY ===
Rows to process: 42
  • New accounts: 8
  • Update existing: 12
  • No change needed: 18
  • Skipped (invalid): 4

Total cost: $0 (this is a dry-run)

=== NEW ACCOUNTS (8) ===
1. Account code: 70000
   Name: Fundraising Expenses
   Type: Expense
   Parent code: _H1_EXP
   → Action: CREATE new account

2. Account code: 71000
   Name: Donor Stewardship
   Type: Expense
   Parent code: 70000
   → Action: CREATE new account

... (more new accounts)

=== UPDATED ACCOUNTS (12) ===
1. Account code: 61000 (Salaries)
   Current name: Salary Expense
   New name: Personnel - Salaries
   Current type: Expense
   New type: Expense (no change)
   Xero mapping: 400 → 401 (CHANGED)
   → Action: UPDATE name and Xero mapping

2. Account code: 62000 (Fringe)
   Current parent: _H1_EXP
   New parent: 61000 (CHANGED)
   → Action: UPDATE parent hierarchy

... (more updates)

=== NO CHANGE (18) ===
62100, 63000, 64000, ...
→ Rows match existing data exactly; no action needed

=== SKIPPED (4) ===
1. Row 18: Missing required field 'code'
   → Skipped (invalid)

2. Row 25: Code 'foo-bar' is invalid format
   → Skipped (invalid format)

... (more skipped rows)

=== BEFORE/AFTER COMPARISON ===

Account 61000 (Salaries):
  Before:
    {
      "name": "Salary Expense",
      "xero_mapping": "400"
    }
  
  After:
    {
      "name": "Personnel - Salaries",
      "xero_mapping": "401"
    }
  
  Changes: 2 fields

(More detailed comparisons for each changed account)

=== RECOMMENDATIONS ===

✓ No data loss risk (no deletions)
✓ Xero mapping changes safe (old mapping preserved)
⚠ 4 rows skipped — review and correct before importing
✓ Account hierarchy valid (no circular refs)

READY TO IMPORT? Run:
  /import-run test-org coa.csv
```

---

### Detailed Report Example

```
=== DETAILED PERSONNEL IMPORT ===

Row 1: Alice Johnson
  Existing employee: NO
  → Will CREATE:
    {
      "full_name": "Alice Johnson",
      "worker_type": "employee",
      "annual_salary_cents": 6500000,
      "fte_bps": 10000,
      "salary_account_id": 123 (61000 - Salaries)
    }

Row 2: Bob Smith
  Existing employee: YES (ID: 456)
  Current values:
    {
      "full_name": "Bob Smith",
      "annual_salary_cents": 4800000
    }
  New values:
    {
      "full_name": "Robert J. Smith",
      "annual_salary_cents": 5040000  ← CHANGED (+5%)
    }
  → Will UPDATE: full_name, annual_salary_cents
  → Salary change: $48,000 → $50,400

... (each row detailed)
```

---

## What Gets Checked

### CSV Format

- ✓ File is valid CSV (not corrupted)
- ✓ Column headers match expected (code, name, type, etc.)
- ✓ Required columns present
- ✓ Data types correct (numbers are numbers, dates are dates)
- ✓ Encoding is UTF-8 (no weird characters)

### Data Validation

- ✓ Account codes match pattern (e.g., 5xxxx or _H1_)
- ✓ Account types valid (income, expense, asset, liability)
- ✓ Salary amounts are non-negative
- ✓ FTE values 0.0–2.0
- ✓ Start/end months 1–12 (if specified)
- ✓ Foreign key references exist (parent account, salary account, etc.)

### Conflict Detection

- ✓ Duplicate codes in import (error)
- ✓ Duplicate codes vs. existing data (update detected)
- ✓ Circular account hierarchy (error)
- ✓ Xero mapping conflicts (warns)
- ✓ Date overlaps (for fiscal year data)

### Data Loss Risk

- ✓ Detects if import would delete existing data
- ✓ Warns if changing account type (may break allocations)
- ✓ Flags if removing Xero mappings
- ✓ Checks if archived accounts would be unarchived

---

## Safety Checks

### Account Import Safety

```
⚠ WARNING: Changing account type
   Account 62000 is currently 'Expense'
   Import wants to change to 'Asset'
   This may break existing allocations!
   
   Action: Either update the import or update the account separately.
```

### Personnel Import Safety

```
⚠ WARNING: Salary decrease detected
   Employee: Bob Smith
   Current salary: $48,000
   New salary: $45,000 (-6.25%)
   
   This will affect:
     • Personnel costs (decreases by $3,000/year)
     • Allocations (will need recalculation)
   
   Confirm this is intentional.
```

### Hierarchy Safety

```
✓ Account hierarchy is valid
  _H1_EXP
    → 61000 (Salaries)
      → 61100 (Wages)
    → 62000 (Fringe)
  No circular references detected.
```

---

## Interpreting Results

### Green Status ✓

```
✓ No conflicts detected
✓ All rows valid
✓ No data loss risk
✓ Account hierarchy valid
→ Safe to import! Run: /import-run test-org coa.csv
```

### Yellow Warnings ⚠️

```
⚠ 4 rows skipped (invalid)
⚠ Xero mapping changes (5 accounts)
⚠ Account type changes (1 account)
→ Review warnings above before importing
→ Can still proceed, but understand the impacts
```

### Red Errors ❌

```
❌ Duplicate account codes in import (rows 5, 12, 18)
❌ Circular account hierarchy detected
❌ Invalid fiscal year values
→ Fix these errors in CSV before importing
```

---

## Common Scenarios

### Scenario 1: Fresh COA Import

```
You: /import-dry-run test-org coa.csv

Skill: ✓ 42 rows will be created
       ✓ No existing accounts to update
       ✓ Xero mappings will be created
       ✓ Hierarchy is valid
       
Ready to import? No conflicts.
```

### Scenario 2: Salary Update

```
You: /import-dry-run test-org personnel.csv

Skill: ⚠ 12 rows will be updated (salary increases)
       ✓ 3 new employees will be created
       ⚠ Average salary increase: 4.2%
       
   Alice Johnson: $65k → $67.7k (+4%)
   Bob Smith: $48k → $49.9k (+4%)
   ... (all employees listed with changes)

Personnel costs increase: $380k → $396k (+4.2%)
Allocations will need recalculation.

Proceed? (This will increase annual budget)
```

### Scenario 3: Danger: Account Type Change

```
You: /import-dry-run test-org coa.csv

Skill: ❌ DANGEROUS CHANGE DETECTED
   Account 62000 type change: Expense → Asset
   
   This will break:
     • 45 allocation entries
     • Fringe cost calculations
     • Budget balance checks
   
   CANCEL and fix the import, or use a migration to change type safely.
```

---

## Comparison with Full Import

**Dry-run:**
- ✓ Shows what will change
- ✓ Validates data
- ✓ Checks for conflicts
- ✓ NO changes made
- ✓ Can run multiple times

**Full import:**
- ✓ Applies all changes
- ✓ Updates database
- ✓ Logs import history
- ✗ Cannot undo easily
- ✗ Use only after dry-run confirms safe

**Workflow:**
```
1. Run dry-run → review output
2. If OK → run full import
3. If issues → fix CSV → repeat step 1
```

---

## Adaptive Design

This skill gracefully handles:
- ✓ Missing validation rules (reports "check skipped")
- ✓ Different import types (adapts to schema)
- ✓ Partial fields (shows what's changing)
- ✓ Schema changes (detects new/missing columns)
- ✓ Custom account structures

If import type isn't recognized:
```
⚠ Import type 'custom-data' not recognized
  Known types: coa, personnel, programs, grants, budget-lines, actuals
  Suggestion: Specify --type or check import handler
```

---

## Examples

### Fast Safety Check

```bash
/import-dry-run test-org accounts.csv
# Shows summary in 5 seconds
# "✓ 42 creates, 8 updates, 0 conflicts"
```

### Detailed Review

```bash
/import-dry-run test-org accounts.csv --detailed
# Shows before/after for each row
# Useful for spotting specific changes
```

### Save Report to File

```bash
/import-dry-run test-org accounts.csv > import-review.txt
# Review in editor before running actual import
```

---

## Best Practices

1. **Always dry-run first**
   ```
   Never skip this step. 2 minutes now saves hours later.
   ```

2. **Review all warnings**
   ```
   ⚠ warnings are not errors, but worth understanding.
   ```

3. **Check the summary**
   ```
   Focus on total creates/updates/deletes to get a feel.
   ```

4. **If in doubt, ask**
   ```
   If output is unclear, run with --detailed flag.
   ```

5. **Keep the report**
   ```
   Save the dry-run output. Compare with actual import results.
   ```

---

## Troubleshooting

### "Column headers don't match"

**Problem:** CSV has columns that don't match expected format.

**Fix:**
1. Check which columns are required for this import type
2. Ensure column names match exactly (case-sensitive)
3. Re-run dry-run

### "4 rows skipped (invalid)"

**Problem:** Some rows have bad data.

**Fix:**
1. Look at the "SKIPPED" section in report
2. Find the issue (missing field, wrong format, etc.)
3. Fix in CSV
4. Re-run dry-run
5. Repeat until all rows pass

### "Salary decrease detected"

**Problem:** Import shows salary going down.

**Fix:**
1. Verify this is intentional (layoff? cut hours? different role?)
2. Understand that allocations will need recalculation
3. Proceed only if you meant to do this
4. Document the reason in commit message

---

## Notes

- Dry-run is completely safe (read-only)
- Can run unlimited times on same file
- Results cached for 1 minute (re-run with --no-cache for fresh check)
- Report includes exact SQL that will be executed
- Import history is logged (you can see what was imported and when)
