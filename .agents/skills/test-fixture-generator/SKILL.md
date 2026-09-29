---
name: test-fixture-generator
description: Use when you need realistic budget test data — generates employees, accounts, allocations, and Xero-aligned fixtures for testing without manual setup.
user-invocable: true
---

# Test Fixture Generator

Use this skill to create realistic budget data for testing without manual UI entry.

## When to Use

✅ **Use this skill to:**
- Generate sample personnel (employees, contractors)
- Create realistic account chart of accounts
- Pre-populate programs and grants
- Generate monthly budget allocations
- Create Xero-aligned test data (matches Demo Company)
- Reset test data for a new test cycle
- Create year-over-year budget scenarios

❌ **Do NOT use for:**
- Production data (use real data entry)
- One-time manual tweaks (edit in UI)
- Testing error conditions (create edge cases manually)

## How to Use

### Generate Full Test Org

```
/test-fixture-generator test-org 2026
```

Creates a complete budget scenario:
- 8 sample employees (mix of FTE, contractors)
- 15 accounts (revenue, expense, asset, liability)
- 3 programs (education, operations, fundraising)
- 2 grants
- 12 months of allocations
- All Xero mappings configured

### Generate Specific Type

```
/test-fixture-generator test-org 2026 --personnel
/test-fixture-generator test-org 2026 --accounts
/test-fixture-generator test-org 2026 --allocations
/test-fixture-generator test-org 2026 --xero
```

### Create Year-Over-Year Scenario

```
/test-fixture-generator test-org 2026 --copy-from-2025 --adjust +5%
```

Copy 2025 data to 2026 with 5% salary increase.

### Reset Test Data (Dangerous)

```
/test-fixture-generator test-org 2026 --reset --confirm
```

Deletes existing data and regenerates from scratch.

---

## Output

### Generation Summary

```
=== FIXTURE GENERATION SUMMARY ===
Organization: test-org
Fiscal year: 2026

✓ Personnel (8 created)
  • 5 full-time employees
  • 2 part-time employees
  • 1 contractor

✓ Accounts (15 created)
  • 4 revenue accounts
  • 6 expense accounts
  • 3 asset accounts
  • 2 liability accounts

✓ Programs (3 created)
  • Education (code: prog-ed)
  • Operations (code: prog-ops)
  • Fundraising (code: prog-fund)

✓ Grants (2 created)
  • Gates Foundation Grant
  • Community Development Grant

✓ Allocations (96 month-entries created)
  • Jan-Dec allocation monthly
  • Total personnel cost: $380,000
  • Allocation breakdown by program included

✓ Xero Mappings
  • 12/15 accounts mapped to Demo Company accounts
  • Ready for balance import

Ready to test? Check test.html or /coop/o/test-org/budget
```

### Generated Data Details

```
=== PERSONNEL CREATED ===

1. Alice Johnson (ID: generated)
   Type: Employee
   FTE: 1.0 (full-time)
   Annual salary: $65,000
   Salary account: 61000 (Salaries)
   Start month: 1 (Jan)
   End month: 12 (Dec)
   Health tier: Employee+Spouse
   Allocations:
     • Program A: 70% ($45,500)
     • Program B: 30% ($19,500)

2. Bob Smith (ID: generated)
   Type: Employee
   FTE: 0.75 (part-time)
   Annual salary: $48,000
   ... (more employees listed)

9. Contractor - Dev Work (ID: generated)
   Type: Contractor
   Monthly fee: $5,000
   Allocation: 100% to Program A

=== ACCOUNTS CREATED ===

Revenue:
  4000 - Membership Dues ($50,000 budgeted)
  4010 - Grants & Donations ($200,000 budgeted)
  4020 - Service Revenue ($30,000 budgeted)
  4030 - Other Revenue ($10,000 budgeted)

Expenses:
  61000 - Salaries ($280,000)
  61100 - Contractor Fees ($5,000)
  62000 - Fringe (FICA, Health, Retirement) ($85,000)
  63000 - Office Expenses ($20,000)
  64000 - Programs & Services ($40,000)
  65000 - Technology ($10,000)

Assets:
  11000 - Checking Account
  12000 - Savings Account
  13000 - Accounts Receivable

Liabilities:
  21000 - Accounts Payable
  22000 - Payroll Liabilities

=== ALLOCATIONS CREATED ===

All personnel allocated across programs by month:
  Jan: $31,667 total allocation
  Feb: $31,667 total allocation
  ...
  Dec: $31,667 total allocation

Total annual: $380,000 (matches total personnel cost)

=== XERO MAPPINGS ===

Account mappings to Xero Demo Company:
  4000 → Xero: 200 (Sales)
  4010 → Xero: 201 (Service)
  61000 → Xero: 400 (Salaries)
  62000 → Xero: 401 (Payroll Liabilities)
  ... (12 mapped, 3 unmapped – OK)
```

---

## Preset Scenarios

### Scenario 1: Small NGO

```
/test-fixture-generator test-org 2026 --scenario small-ngo
```

**Data:**
- 5 employees (2 FT, 2 PT, 1 contractor)
- $150,000 annual budget
- 2 programs
- 1 grant
- Minimal fringe (basic health)

**Use for:** Testing with small org data

### Scenario 2: Mid-size Nonprofit

```
/test-fixture-generator test-org 2026 --scenario mid-size
```

**Data:**
- 15 employees (10 FT, 4 PT, 1 contractor)
- $600,000 annual budget
- 5 programs
- 3 grants
- Full fringe benefits

**Use for:** Most realistic testing (default)

### Scenario 3: Large Organization

```
/test-fixture-generator test-org 2026 --scenario large-org
```

**Data:**
- 35 employees (25 FT, 8 PT, 2 contractors)
- $2,000,000 annual budget
- 10 programs
- 5 grants
- Complex fringe & allocations

**Use for:** Testing performance, large data sets

### Scenario 4: Year-End Close

```
/test-fixture-generator test-org 2026 --scenario year-end
```

**Data:**
- 12 months of actual data populated
- All allocations matched to actuals
- Variances included (some accounts over/under budget)

**Use for:** Testing year-end reporting

---

## Customization

### Custom Personnel Count

```
/test-fixture-generator test-org 2026 --personnel-count 12
```

Generate exactly 12 employees.

### Custom Programs

```
/test-fixture-generator test-org 2026 --programs "Education,Healthcare,Advocacy"
```

Create programs with specified names.

### Budget Variance

```
/test-fixture-generator test-org 2026 --actual-data --variance 10%
```

Generate actual data with ±10% variance from budget.

---

## Data Quality

Generated fixtures are realistic:
- ✓ Personnel names vary (first + last from list)
- ✓ Salaries reasonable for role ($40k–$100k range)
- ✓ FTE values realistic (0.5–1.0 for employees, contractors separate)
- ✓ Allocations total to personnel cost (no gaps)
- ✓ Fringe rates follow US standards (FICA 7.65%, etc.)
- ✓ Account codes follow CoA pattern (_H1_, _H2_, 5xxxx)
- ✓ Xero mappings align with Demo Company

---

## Reset & Regenerate

**Important: Reset is destructive**

```
# Delete existing 2026 data and regenerate
/test-fixture-generator test-org 2026 --reset --confirm

# Prompt before deleting (safer)
/test-fixture-generator test-org 2026 --reset  # (will ask for confirmation)

# Delete only personnel (keep accounts/programs)
/test-fixture-generator test-org 2026 --reset --only-personnel
```

What gets deleted:
- ✓ Personnel records
- ✓ Allocations
- ✓ Budget lines
- ✓ Actuals (if regenerating)
- ✗ Accounts (preserved unless --reset-coa flag)
- ✗ Programs/Grants (preserved unless specified)

---

## Integration with Xero Demo Company

The generator includes Xero Demo Company mappings:

```
/test-fixture-generator test-org 2026 --xero-demo-company
```

This:
- ✓ Maps accounts to Xero Demo Company accounts
- ✓ Sets up correct account types
- ✓ Aligns hierarchy (H1/H2/H3 structure)
- ✓ Ready for balance imports

**Note:** Xero Demo Company resets every 28 days. Regenerate fixtures after reset.

---

## Adaptive Design

This skill gracefully handles:
- ✓ Different org sizes (micro to large)
- ✓ Missing program/grant tables (reports "not configured")
- ✓ Missing fringe settings (uses defaults)
- ✓ Custom account structures (adapts to existing CoA)
- ✓ Partial data (generates missing pieces only)

If tables don't exist, you'll see:
```
⚠ coop_programs table not found
  Fixture will skip program allocations
  Suggestion: Run migration or manually create programs first
```

---

## Examples

### Quick Test Setup

```
You: /test-fixture-generator test-org 2026

Skill: Generating fixtures for test-org...

✓ Created 8 personnel
✓ Created 15 accounts
✓ Created 3 programs
✓ Created 96 allocations
✓ Xero mappings configured

Done! Test data ready. Navigate to /coop/o/test-org/budget
```

### Year-over-Year Scenario

```
You: /test-fixture-generator test-org 2026 --copy-from-2025 --adjust +5%

Skill: Copying 2025 data to 2026 with 5% increase...

✓ Personnel copied (8 records)
  Salaries increased 5%: $65,000 → $68,250
✓ Allocations calculated (new annual total: $399,000)
✓ Programs/grants copied

Done! 2026 budget set up with realistic growth scenario.
```

### Reset for New Cycle

```
You: /test-fixture-generator test-org 2026 --reset --confirm

⚠ This will delete:
   - 8 personnel records
   - 96 allocation entries
   - 36 budget line entries

Continue? (confirm = yes)

You: confirm

Skill: ✓ Deleted existing 2026 data
       ✓ Generated new fixtures
       
Ready to test!
```

---

## Notes

- Fixtures are generated directly in database (no CSV export)
- All IDs are auto-generated (no manual ID mapping needed)
- Fiscal years can be past, present, or future (for scenario testing)
- Personnel start/end months default to full year (Jan–Dec)
- Allocations are monthly equal amounts (can be customized)
- Generated data is production-safe (test org only)
- Regeneration replaces old data completely
- Xero mappings are suggested; actual balances require import

## Common Workflows

1. **Fresh start:**
   ```
   /test-fixture-generator test-org 2026
   → Navigate to budget UI
   → Verify personnel, accounts, allocations load correctly
   ```

2. **Test Xero sync:**
   ```
   /test-fixture-generator test-org 2026 --xero-demo-company
   → Connect Xero
   → Import balances
   → Verify accounts match
   ```

3. **Test year-end:**
   ```
   /test-fixture-generator test-org 2026 --scenario year-end
   → Check actuals vs budget variance reporting
   → Verify closing entries
   ```

4. **Reset after Xero demo reset (every 28 days):**
   ```
   /test-fixture-generator test-org 2026 --reset --xero-demo-company
   → Regenerates with current Xero state
   ```
