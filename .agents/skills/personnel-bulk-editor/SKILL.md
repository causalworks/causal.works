---
name: personnel-bulk-editor
description: Use during budget season — edit multiple personnel at once (salary changes, FTE adjustments, allocations) instead of one-by-one in UI.
user-invocable: true
---

# Personnel Bulk Editor

Use this skill to batch-update personnel records. Much faster than UI edits during budget planning and year-over-year adjustments.

## When to Use

✅ **Use this skill to:**
- Apply salary increases to all employees (e.g., 4% across the board)
- Adjust FTE for multiple employees (e.g., summer staffing changes)
- Update health tier/employment type for groups
- Adjust allocations across programs
- Copy prior year and apply adjustments (+5%, etc.)
- Update custom fringe rates for contractors
- Bulk fix missing fields (salary account mapping)

❌ **Do NOT use for:**
- One-off edits (use UI)
- Adding/removing employees (use import-dry-run + import)
- Changing account mappings (change carefully one-by-one)

## How to Use

### Interactive Mode

```
/personnel-bulk-editor test-org 2026
```

Prompts you through:
1. **Select employees** — all, filter by type, or specific list
2. **Choose what to change** — salary, FTE, allocation, health tier, etc.
3. **How to change it** — absolute, percentage, formula
4. **Preview** — shows before/after for all selected
5. **Apply** — makes the changes

### Command Mode

```
/personnel-bulk-editor test-org 2026 --apply salary --change +4%
```

Apply 4% salary increase to all employees.

### Filter & Apply

```
/personnel-bulk-editor test-org 2026 --filter "type=employee" --apply salary --change +5%
```

Apply 5% increase to employees only (not contractors).

### Copy from Prior Year

```
/personnel-bulk-editor test-org 2026 --copy-from 2025 --adjust salary +4%
```

Copy all 2025 personnel to 2026, increase salaries 4%.

---

## Output

### Interactive Selection

```
=== SELECT EMPLOYEES ===

Total employees: 12 (10 full-time, 2 contractors)

[ ] All employees (12)
[ ] Filter by:
    [ ] Type = Employee (10)
    [ ] Type = Contractor (2)
[ ] Manually select (choose individuals)

You select: Type = Employee (10 employees)

Selected: 10 employees
  • Alice Johnson (FTE: 1.0, $65,000)
  • Bob Smith (FTE: 0.75, $48,000)
  • ... (8 more)
```

### Change Definition

```
=== WHAT TO CHANGE ===

Options:
  1. salary — annual_salary_cents
  2. fte — full-time equivalent (0.0–1.0)
  3. allocation — percentage by program
  4. health_tier — EE / EE+Spouse / Family
  5. employment_type — full-time / part-time / contractor
  6. custom_fringe — custom rates for this employee

You select: salary

How to change:
  A. Absolute — set to $X
  B. Percentage — multiply by X% (e.g., +4%)
  C. Formula — (e.g., salary * 1.04, or 65000 if current < 65000)

You select: Percentage
Amount: +4%
```

### Preview Before/After

```
=== PREVIEW: SALARY INCREASE +4% ===

10 employees, salary changes:

1. Alice Johnson
   Before: $65,000
   After:  $67,600 (+$2,600)
   Annual impact: +$2,600

2. Bob Smith
   Before: $48,000
   After:  $49,920 (+$1,920)
   Annual impact: +$1,920

3. Carol Davis
   Before: $55,000
   After:  $57,200 (+$2,200)
   Annual impact: +$2,200

... (7 more employees)

=== SUMMARY ===
Total payroll before: $485,000
Total payroll after:  $504,400
Increase: +$19,400 (+4.0%)

Monthly increase: +$1,617

This affects:
  ✓ Personnel costs (increase $19,400)
  ⚠ Allocations (need recalculation)
  ⚠ Budget vs actual (will be over budget)

Ready to apply?
```

### Apply Confirmation

```
✓ Previewed 10 changes
✓ No conflicts detected (all salary accounts mapped)
✓ No validation errors

Apply these changes? (y/n)

You: y

Applying...
✓ Updated 10 employees
  • 10 salary_cents updated
  • 10 updated_at timestamps set

Changes saved!

Next steps:
1. Recalculate allocations: /personnel-bulk-editor --recalc-allocations
2. Validate data: /budget-data-validator test-org 2026
3. Review final budget: Go to /coop/o/test-org/budget
```

---

## Use Cases

### Case 1: Annual Salary Increase (Budget Season)

```
You: /personnel-bulk-editor test-org 2026

Skill: Select employees
You: Type = Employee (10)

Skill: What to change?
You: salary

Skill: How?
You: Percentage, +4%

Skill: (Shows 10 before/after)
       Total payroll: $485k → $504k

You: Apply

✓ Done! All 10 employees updated +4%
```

### Case 2: Summer Staffing (Reduce FTE)

```
You: /personnel-bulk-editor test-org 2026 --filter "title contains intern"

Skill: Found 3 interns. What to change?
You: FTE

Skill: How?
You: Absolute, 0.5 (50%)

Skill: (Shows 3 before/after)
       FTE: 1.0 → 0.5, 1.0 → 0.5, 1.0 → 0.5
       Payroll impact: -$12,000/month Jun-Aug

You: Apply

✓ Done! Interns set to 50% FTE for summer
```

### Case 3: Copy Year-Over-Year with Adjustments

```
You: /personnel-bulk-editor test-org 2026 --copy-from 2025

Skill: Found 12 employees in 2025
       Copy all to 2026? (y/n)

You: y

Skill: Apply adjustments?
       A. Salary increase (%)
       B. FTE changes (specific)
       C. Terminations (remove these)
       D. No adjustments

You: A (salary increase)
     +3.5%

Skill: (Shows 12 before/after)
       2025 total: $485,000
       2026 total: $501,975 (+3.5%)
       Also copied:
         • Health tier
         • Employment type
         • Allocation percentages
         • Custom fringe

You: Apply

✓ Done! 12 employees copied to 2026, salaries +3.5%
```

### Case 4: Fix Missing Mappings

```
You: /personnel-bulk-editor test-org 2026 --fix-missing-mappings

Skill: Found 3 employees with NULL salary_account_id
       These employees:
         1. Carol Davis ($55,000)
         2. David Evans ($48,000)
         3. Emma Foster ($52,000)

       Map all to account 61000 (Salaries)?
       Or select different accounts?

You: Map all to 61000

Skill: (Shows 3 employees)
       salary_account_id: NULL → 123 (61000)

You: Apply

✓ Done! 3 employees now have salary account mapping
```

### Case 5: Update Health Tiers (Benefit Changes)

```
You: /personnel-bulk-editor test-org 2026 --filter "health_tier=Employee" --apply health_tier --change "Employee+Spouse"

Skill: Found 5 employees with health_tier = Employee
       Change all to Employee+Spouse?
       
       Impact:
         • Health insurance cost increase: ~$450/month per employee
         • Total fringe increase: +$2,250/month
         • Annual fringe increase: +$27,000

You: Apply

✓ Done! 5 employees updated
   Health tier: Employee → Employee+Spouse
   Fringe cost impact: +$27,000/year
```

---

## Advanced Features

### Conditional Updates

Apply changes only to employees matching criteria:

```
/personnel-bulk-editor test-org 2026 \
  --filter "salary < 50000" \
  --apply salary \
  --change "50000"
```

Raises anyone below $50k to exactly $50k (equity adjustment).

### Formula-Based Changes

```
/personnel-bulk-editor test-org 2026 \
  --filter "type=employee" \
  --apply salary \
  --formula "salary * 1.04" (4% increase)
```

Or more complex:
```
--formula "if(salary < 60000, 60000, salary * 1.03)"
```

Everyone below $60k → $60k. Others → +3%.

### Multi-Field Updates

```
/personnel-bulk-editor test-org 2026 \
  --filter "employment_type=part-time" \
  --update salary +3% \
  --update fte 0.75 \
  --update health_tier "Employee"
```

Update 3 fields at once for part-time employees.

### Allocation Recalculation

After salary changes, auto-recalculate allocations:

```
/personnel-bulk-editor test-org 2026 --recalc-allocations
```

**Option A: Keep same percentages**
```
If Alice was 70% → Program A, keep at 70%
New allocation: $67,600 * 0.70 = $47,320
```

**Option B: Proportional to total change**
```
If total payroll +4%, each allocation +4%
Keep same program split
```

---

## Safety Features

### Dry-Run (Always First)

```
/personnel-bulk-editor test-org 2026 --apply salary --change +4% --dry-run

(Shows preview but doesn't save)
```

### Validation Before Apply

- ✓ Salary amounts non-negative
- ✓ FTE 0.0–2.0
- ✓ All salary accounts exist
- ✓ No duplicate IDs
- ✓ Health tiers valid
- ✓ Custom fringe complete (if enabled)

### Rollback Available

If something goes wrong:

```bash
git diff HEAD~1 -- coop_employees
# See what changed

git checkout HEAD -- <file>
# Revert (if database allows)
```

Better: keep dry-run output as audit trail.

---

## What Gets Changed

When you update a field:

| Field | What happens |
|-------|--------------|
| `salary` | annual_salary_cents updated |
| `fte` | fte_bps updated |
| `allocation` | Recalculates across programs |
| `health_tier` | health_tier updated, fringe recalculated |
| `custom_fringe` | Custom rates updated for this employee |
| `employment_type` | employment_type updated |

What does NOT change automatically:
- ✗ Salary account mapping (change manually)
- ✗ Department/title (edit manually if needed)
- ✗ Start/end months (edit manually)
- ✗ Contractor account mapping (change manually)

---

## Allocation Recalculation

After salary changes, allocations must be recalculated:

```
Before: $65,000 salary
  70% to Program A: $45,500
  30% to Program B: $19,500

After: $67,600 salary (+4%)
  Option A (Keep %): 70% → $47,320, 30% → $20,280
  Option B (Manual): Specify new amounts manually
```

Skill shows both options; you choose.

---

## Bulk Operations Checklist

Before applying bulk changes:

- [ ] Dry-run looks correct
- [ ] Before/after values match intent
- [ ] Salary accounts are mapped (if changing salary)
- [ ] No negative values
- [ ] FTE values reasonable (0.0–1.0 for most employees)
- [ ] Allocation changes understood (will need recalc)
- [ ] Budget impact acceptable (review total payroll)

---

## Adaptive Design

This skill handles:
- ✓ Different employee counts (1–100+)
- ✓ Missing fields (reports and skips)
- ✓ Partial updates (some fields NULL)
- ✓ Schema changes (detects new columns)
- ✓ Different fiscal year structures

If a field doesn't exist:
```
⚠ Column 'custom_fringe_rates' not found
  This employee doesn't have custom fringe configured
  Skipping this field
```

---

## Notes

- **Dry-run first:** Always preview before applying
- **Allocations need recalc:** Salary changes don't auto-update allocations
- **Validation is strict:** Will warn about unusual values
- **Database logs changes:** All updates logged with timestamps
- **Audit trail:** Save dry-run output as documentation
- **Safe to run multiple times:** Re-applying same change is safe (just updates same fields)

## Examples

```bash
# Simple increase
/personnel-bulk-editor test-org 2026 --apply salary --change +4%

# Copy year-over-year
/personnel-bulk-editor test-org 2026 --copy-from 2025 --adjust salary +3.5%

# Filter and change
/personnel-bulk-editor test-org 2026 --filter "type=employee" --apply fte --change 0.75

# Complex formula
/personnel-bulk-editor test-org 2026 --apply salary --formula "if(salary < 55000, 55000, salary * 1.04)"

# Recalculate after changes
/personnel-bulk-editor test-org 2026 --recalc-allocations
```
