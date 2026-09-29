---
name: budget-data-validator
description: Use when auditing budget data integrity — validates personnel costs, account mappings, allocations, and detects inconsistencies without changing data.
user-invocable: true
---

# Budget Data Validator

Use this skill to audit budget data for consistency, completeness, and correctness.

## When to Use

✅ **Use this skill to:**
- Verify personnel costs sum correctly to account allocations
- Check account mappings are complete for all personnel
- Detect missing fringe settings for a fiscal year
- Find orphaned budget lines (accounts that don't exist)
- Audit allocation totals match personnel costs
- Validate fiscal year data is complete (no gaps)
- Spot duplicate or conflicting personnel records

❌ **Do NOT use for:**
- Correcting data (this is read-only; fixes are manual or via migration)
- Updating personnel records (use budget UI)
- Editing account mappings (use Integrations)

## How to Use

### Basic Validation (Current Org)

```
/budget-data-validator
```

Prompts for org slug, then runs full validation.

### With Specific Org and Fiscal Year

```
/budget-data-validator test-org 2026
```

Validates test-org's 2026 budget.

### With Focus Area

```
/budget-data-validator test-org 2026 --personnel
/budget-data-validator test-org 2026 --accounts
/budget-data-validator test-org 2026 --allocations
/budget-data-validator test-org 2026 --all
```

---

## Output

### Summary

```
=== BUDGET VALIDATION SUMMARY (2026) ===

Personnel: ✓ 8 employees, ✗ 1 issue
Accounts: ✓ 42 valid, ⚠ 2 orphaned
Allocations: ✓ $450,000, ⚠ rounding
Fringe: ✓ Fully configured
Overall: ⚠ 3 issues found
```

### Personnel Issues

```
=== PERSONNEL VALIDATION ===
✓ 8 total employees
  • 6 full-time employees
  • 2 contractors

⚠ ISSUES FOUND:

1. Missing salary account mapping
   Name: John Doe (ID: 123)
   Status: annual_salary_cents = $65,000 but salary_account_id = NULL
   → Account mapping needed for budget allocation
   → Fix: Map to account via budget UI

2. Fractional FTE (may be intentional)
   Name: Jane Smith (ID: 456)
   FTE: 0.60 (60% time)
   Annual salary: $40,000
   → Verify intentional; check contract details

3. Incomplete date range
   Name: Bob Johnson (ID: 789)
   Start month: NULL, End month: NULL
   Annual salary: $50,000
   → Assumes full-year employment; verify if correct
   → If mid-year hire, set start_month: 3 (March)

4. Duplicate entries (possible)
   Names: "John Smith" appears 2x
   ID: 111 (full-time) and ID: 222 (contractor)
   → Check if intentional (same person, diff roles) or duplicate
```

### Account Validation

```
=== ACCOUNT VALIDATION ===
✓ 42 accounts configured
  • 15 revenue accounts
  • 20 expense accounts
  • 4 asset accounts
  • 3 liability accounts

⚠ ORPHANED ACCOUNTS (have budget lines but account is missing):
1. Account ID: 9999 (code: old-marketing)
   Budget lines: 12 entries totaling $5,000
   Status: Account deleted from chart of accounts
   → Re-create account or void budget lines

✓ Account mappings
  • All expense accounts have Xero mapping
  • Revenue accounts: 14/15 mapped to Xero
  → 1 account (misc-income) not mapped

✓ Account hierarchy
  • Parent/child relationships valid
  • No circular references
  • No orphaned child accounts
```

### Allocation Validation

```
=== ALLOCATION VALIDATION ===
Personnel costs → Account allocations

✓ Total personnel cost: $385,000
  Breakdown:
  • Salaries: $300,000
  • Fringe: $85,000

✓ Allocations total: $385,000
  • Program A: $150,000 (39%)
  • Program B: $120,000 (31%)
  • Admin: $115,000 (30%)

✓ Month-by-month allocations
  Jan: $32,000 / $32,000 ✓
  Feb: $32,000 / $32,000 ✓
  Mar: $32,000 / $32,100 ⚠ $100 rounding difference
  ...

⚠ Rounding tolerance: 0.3% variation acceptable
   If larger differences exist: Check for unallocated costs
```

### Fringe Validation

```
=== FRINGE SETTINGS VALIDATION (2026) ===

✓ Organization-wide settings configured
  FICA rate: 7.65%
  SUTA rate: 3.1%
  Workers comp rate: 2.5%
  Health insurance (EE): $450/month
  Retirement: 5.0%

✓ All employees use standard fringe (no custom overrides)

⚠ ISSUES:

1. Missing custom fringe for contractor
   Name: Bob Johnson (ID: 789)
   Use custom fringe: true
   But all custom rates are NULL
   → Either set use_custom_fringe = false OR fill in custom rates
   → Suggestion: Set use_custom_fringe = false (use standard rates)
```

### Fiscal Year Completeness

```
=== FISCAL YEAR COMPLETENESS ===
Fiscal year: 2026
Period: Jan 1 – Dec 31

✓ All 12 months have budget data
  Jan: 30 budget lines, $32,000
  Feb: 30 budget lines, $32,000
  ...
  Dec: 30 budget lines, $32,000

⚠ Month gap in actual data
  Actuals through June 2026
  July–Dec have budgets but no actuals
  → Expected (current month is June)
  → When July closes, re-run to verify actuals are loaded
```

---

## What Gets Checked

### 1. Personnel Data

- ✓ All employees have salary or contractor fee
- ✓ Salary accounts are mapped
- ✓ FTE is reasonable (0.0–2.0)
- ✓ Start/end months (if set) are valid
- ✓ Health tier matches policy (if tracked)
- ✓ No duplicate names (unless intentional)
- ✓ Custom fringe either fully set or disabled

### 2. Account Structure

- ✓ All accounts in chart of accounts exist
- ✓ Parent account references are valid
- ✓ No circular account hierarchies
- ✓ Account types are recognized
- ✓ Xero mappings (if set) point to valid accounts

### 3. Allocations

- ✓ Total allocations equal total personnel cost
- ✓ All employees have at least one allocation
- ✓ Monthly allocations match annual totals
- ✓ Allocations only to valid accounts
- ✓ No negative allocations

### 4. Budget Lines

- ✓ All budget lines have valid accounts
- ✓ Amounts are non-negative
- ✓ Fiscal year is current or recent
- ✓ Months are 1–12
- ✓ No orphaned budget lines (account deleted)

### 5. Fringe Settings

- ✓ Organization fringe settings configured
- ✓ Fringe rates are reasonable (0–100% for % rates)
- ✓ Monthly costs are reasonable
- ✓ Fringe accounts are mapped
- ✓ Custom fringe (if used) is complete

---

## Interpreting Results

### Critical Issues 🚨

| Finding | Impact | Action |
|---------|--------|--------|
| ❌ Missing salary account | Personnel can't be allocated | Map account in budget UI |
| ❌ Orphaned account in budget | Budget line won't save | Re-create account or void line |
| ❌ Allocation totals don't match | Budget out of balance | Check for rounding or missing costs |
| ❌ Circular account hierarchy | Report generation fails | Fix parent/child relationship |

### Warnings ⚠️

| Finding | Impact | Action |
|---------|--------|--------|
| ⚠️ Incomplete custom fringe | Fringe calculation may be wrong | Complete or disable custom rates |
| ⚠️ Unallocated personnel cost | Budget hidden/untracked | Add allocation or check calculation |
| ⚠️ Month gaps in actuals | Actuals incomplete | Manually import or wait for auto-sync |
| ⚠️ Duplicate employee names | Easy to confuse | Rename or add middle initial |

### Green Status ✓

- ✓ All personnel have salary accounts
- ✓ All accounts are valid (no orphans)
- ✓ Allocations balance to personnel cost (within 0.3%)
- ✓ Fringe fully configured
- ✓ No duplicate names
- ✓ All 12 months populated

---

## Examples

### Full Validation

```
You: /budget-data-validator test-org 2026

Skill: Running full budget validation for test-org, fiscal year 2026...

=== SUMMARY ===
Personnel: ✓ 8 employees
Accounts: ✓ 42 valid, 0 orphaned
Allocations: ✓ $385,000 balanced
Fringe: ✓ Configured
Overall: ✓ All checks passed

(Detailed output above)
```

### With Issues Found

```
You: /budget-data-validator test-org 2026 --personnel

⚠ Personnel validation found issues:
  1 missing salary account mapping
  1 incomplete custom fringe
  1 possible duplicate name

Review details above. Fix via budget UI or database migration.
```

---

## Adaptive Design

This skill gracefully handles:
- ✓ Missing fringe_settings table (reports "not configured")
- ✓ Missing allocation table (audits budget lines instead)
- ✓ Missing custom fringe columns (only checks standard rates)
- ✓ Different fiscal year structures
- ✓ Partial data (validates what's available)

If tables are missing, you'll see:
```
⚠ Cannot validate fringe (fringe_settings table not found)
  Suggestion: Run migration or fringe data not yet integrated
```

---

## Common Issues

### "Allocation totals don't match personnel cost"

**Causes:**
1. Missing allocations for some employees
2. Unequal monthly allocation (e.g., seasonal projects)
3. Rounding differences (acceptable ±0.3%)
4. Mid-year hire/termination (check start/end months)

**Fix:**
1. Verify all employees have allocations
2. Check monthly totals are equal (or intentionally varied)
3. If rounding only, no action needed

### "Missing salary account mapping"

**Cause:** Personnel record has salary_account_id = NULL

**Fix:**
1. Go to budget UI
2. Edit employee
3. Set "Salary Account" dropdown
4. Save

### "Orphaned account in budget"

**Cause:** Budget line references account that was deleted

**Fix:**
1. Re-create the account in chart of accounts, OR
2. Delete the orphaned budget line via SQL

---

## Notes

- Validation is read-only — no changes made
- Tolerance for rounding differences: ±0.3% (±$100 on $35k budget)
- FTE normal range: 0.0 to 1.0 (up to 2.0 allowed for edge cases)
- Custom fringe must be complete (all fields or all disabled)
- Personnel costs = base salary + fringe taxes/benefits
- Allocation totals must equal personnel cost per month
