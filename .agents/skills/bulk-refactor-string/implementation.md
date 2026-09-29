# Bulk Refactor String — Implementation Guide

This guide shows how to use the bulk-refactor-string skill in practice.

## Quick Usage

```bash
/bulk-refactor-string

# Then describe your change:
# "Rename nav item 'Ledger' to 'Transactions' in the Civic app"
```

The skill will:
1. Find all references to the old string
2. Group by file type and risk level
3. Show you a preview of changes
4. Apply in stages with validation
5. Generate a verification checklist

---

## When to Use (Types of Renames)

### Type 1: Simple Nav Label Rename

**Example:**
```
"Rename sidebar nav item 'Settings' to 'Account Settings' in Civic app"
```

**What it changes:**
- HTML labels and links
- JS router maps
- CSS class names (if any)
- Data attributes

**Scope:** Limited to frontend code, no database changes

**Step 1: Describe the change**
```
Rename sidebar nav item 'Settings' to 'Account Settings' in the Civic app
(label only, no URL structure change)
```

**Step 2: Review the grouped findings**

The skill shows:
```
=== CRITICAL (must change together) ===
public/app.html:152
  <a href="#action/settings">Settings</a>

public/civic/js/router.js:84
  subsectionTitle['settings'] = 'Settings';

=== SHOULD CHANGE ===
public/civic/css/civic.css:203
  .civic-settings { ... }

=== OPTIONAL (comments) ===
public/civic/js/router.js:79
  // Settings tab for user preferences
```

**Step 3: Confirm the preview**

```
The skill shows before/after side-by-side and you confirm it looks right
```

**Step 4: Apply and verify**

Skill applies in stages, then runs verification checklist:
- [ ] Click 'Account Settings' in nav — content loads
- [ ] Direct URL navigation works: `#action/settings`
- [ ] No "Settings" text remains in code

---

### Type 2: Feature/Branding Rename

**Example:**
```
"Rename 'OldBrand' to 'NewBrand' across all branding and labels"
```

**What it changes:**
- Page titles
- Comments
- Variable names with the old brand
- Config keys
- Displayed text

**Step 1: Describe (be explicit about scope)**
```
Rename 'OldBrand' to 'NewBrand' across:
- Page titles (document.title)
- CSS variable names (--np-accent → --coop-accent)
- Comments and doc strings
- Configuration keys (np_mode, np_task_status)
```

**Step 2: Review findings (grouped by file type)**

```
=== CRITICAL (logic-bearing changes) ===
server/index.js:120
  const mode = config.np_mode;
  → const mode = config.coop_mode;

public/civic/js/settings.js:45
  if (branding === 'NP') { ... }
  → if (branding === 'Coop') { ... }

=== SHOULD CHANGE ===
public/shared/css/tokens.css:12
  --np-accent: #0066cc;
  → --coop-accent: #0066cc;

public/coop/header.html:8
  <title>OldBrand Workspace</title>
  → <title>NewBrand Workspace</title>

=== OPTIONAL ===
[Comments with 'OldBrand' text]
```

**Step 3: Apply and verify**

Skill applies each file type stage-by-stage, then verification:
- [ ] Config keys match usage throughout code
- [ ] CSS tokens are referenced correctly
- [ ] No stray 'NP' references remain
- [ ] Pages display correct branding on reload

---

### Type 3: API/Config Key Rename

**Example:**
```
"Rename API route from /api/np/actions to /api/coop/actions and all consumers"
```

**Critical:** This touches both backend and frontend.

**Step 1: Describe**
```
Rename API endpoint /api/np/actions to /api/coop/actions
including:
- Server routes in server/index.js
- Frontend API calls in public/civic/js/api.js
- Test endpoints
- Documentation
```

**Step 2: Review findings**

```
=== CRITICAL (API contract) ===
server/server.js:456
  app.get('/api/np/actions', async (req, res) => { ... })
  → app.get('/api/coop/actions', async (req, res) => { ... })

public/civic/js/api.js:23
  fetch('/api/np/actions')
  → fetch('/api/coop/actions')

=== MUST UPDATE TOGETHER ===
All fetch calls must match the new route name
Database queries may reference 'np' columns (depends on your schema)
```

**Step 3: Apply and verify**

- [ ] API endpoint `/api/coop/actions` returns 200 (curl test)
- [ ] Frontend calls work without 404
- [ ] Database queries still return correct data

---

## How to Invoke

### Standard Pattern

```bash
/bulk-refactor-string

# Skill prompts: "What would you like to rename?"

Your response: "Rename sidebar nav item 'Ledger' to 'Transactions' in Civic app"
```

### With Explicit Scope (Recommended)

For larger refactors, be explicit:

```
I'm renaming the entire 'np' namespace to 'coop' across:
- HTML class names and IDs
- CSS selectors and variables
- JavaScript variable names and route maps
- Comments (update to mention 'Coop')

Scope: public/civic/, public/shared/css/tokens.css, avoid database
```

This tells the skill exactly what to look for and validate.

---

## What the Skill Does (Step by Step)

### Step 1: Parse the Request

Skill reads your description and identifies:
- What's being renamed (old string, new string)
- Type of rename (nav label, branding, API, etc.)
- Scope (which files/folders)

### Step 2: Find All References

Skill runs targeted `grep` and `find` commands:

```bash
# For "Ledger" → "Transactions"
grep -r "Ledger" public/civic/ --include="*.js" --include="*.html" --include="*.css"
grep -r "ledger" public/civic/ --include="*.js" --include="*.html" --include="*.css"
```

Groups results by:
- **File type** (HTML, JS, CSS, SQL, etc.)
- **Semantic category** (strings vs. identifiers vs. comments)
- **Risk level** (safe to change vs. requires review)

### Step 3: Validate Dependencies

Checks that related pieces are updated together:

```
✓ All subsectionTitle['ledger'] entries updated to ['transactions']
✓ All loadLedgerTab() calls updated to loadTransactionsTab()
✓ All .civic-ledger classes updated to .civic-transactions
✓ CSS selectors match element IDs
```

**Warnings:**
- If router condition uses 'ledger' but map uses 'Ledger', flag inconsistency
- If a CSS class is used in JS but not updated in both places, warn

### Step 4: Preview Changes

Shows before/after for each file:

```diff
--- public/civic/js/router.js (before)
+++ public/civic/js/router.js (after)
@@ -84,7 +84,7 @@ const subsectionTitle = {
   action: 'Overview',
-  ledger: 'Ledger',
+  transactions: 'Transactions',
   money: 'Money'
 };

-  if (subsection === 'ledger') { loadLedgerTab(); }
+  if (subsection === 'transactions') { loadTransactionsTab(); }
```

You confirm: **"Yes, these look right"**

### Step 5: Apply Staged

Instead of blind replace, apply in risk-order:

**Stage 1:** CSS and data attributes (lowest risk)
```bash
sed -i 's/ledger/transactions/g; s/Ledger/Transactions/g' public/civic/css/civic.css
```
✓ Applied safely

**Stage 2:** HTML structure (moderate risk)
```bash
sed -i 's/ledger/transactions/g' public/app.html
```
✓ Verify HTML syntax valid

**Stage 3:** JavaScript (highest risk — logic-bearing)
```bash
sed -i 's/ledger/transactions/g; s/Ledger/Transactions/g' public/civic/js/router.js
```
✓ Verify router keys match conditionals

### Step 6: Generate Verification Checklist

Provides concrete steps to test:

```
[ ] 1. Browser test — Click new nav item, content loads
  URL: http://localhost:3000/app.html#action/transactions
  Expected: No console errors

[ ] 2. CSS test — Inspect element shows correct class
  Expected: class="civic-transactions"

[ ] 3. Grep for stragglers
  Command: grep -r "ledger" public/ --include="*.js" --include="*.html"
  Expected: Zero matches (or only in comments)

[ ] 4. Git diff review
  Command: git diff --stat
  Expected: Only expected files changed
```

---

## When NOT to Use This Skill

❌ **Don't use for:**
- Renaming database columns (use migrations instead)
- Renaming folder paths (too risky without file movement)
- Partial substring matches (e.g., replacing "NP" everywhere catches "SNAPPY")
- Generated files or node_modules (auto-generated will fail)
- Complex search patterns (Regex with many alternatives)

---

## Handling Special Cases

### Case 1: camelCase vs. snake_case

**Problem:** Renaming "ledgerTab" → "transactionTab" but also "ledger_id" → "transaction_id"

**Solution:** Be explicit in your description:
```
Rename 'ledger' to 'transactions' with these patterns:
- ledgerTab → transactionTab (camelCase in JS)
- ledger_id → transaction_id (snake_case in SQL/CSS)
- .civic-ledger → .civic-transactions (kebab-case in CSS)
```

The skill will apply all patterns and show each one for confirmation.

### Case 2: Avoiding False Positives

**Problem:** "NP" appears in "SNAPPY", "SNAPSHOT", not just "NP Workspace"

**Solution:** Use word boundaries in your request:
```
Rename the brand 'OldBrand' (with spaces) to 'NewBrand',
NOT the abbreviation 'NP' in other contexts like SNAPPY
```

Skill will search for `"OldBrand"` (with spaces/quotes), not just `NP`.

### Case 3: Multiple Related Renames

**Problem:** Need to rename both the nav item AND the route

**Solution:** Do them sequentially with skill:

```
1. First request: "Rename nav item 'Ledger' to 'Transactions'"
   → Applies to HTML, CSS, JS router maps
   → Verify with checklist
   
2. Second request: "Rename API route /api/ledger to /api/transactions"
   → Applies to server routes and fetch calls
   → Verify with checklist
```

Each rename is tested independently, then verify the full integration.

---

## Example: Full Session

```
You: /bulk-refactor-string

Skill: What would you like to rename? (e.g., "Rename 'X' to 'Y' in [scope]")

You: "Rename sidebar nav item 'Money' to 'Finances' in Civic app"

Skill: Searching for all references...

=== CRITICAL (must change together) ===
public/app.html:156
  <a href="#action/money">Money</a>

public/civic/js/router.js:88
  subsectionTitle['money'] = 'Money';

public/civic/js/app-act-civic.js:702
  async function loadMoneyTab() {

=== SHOULD CHANGE ===
public/civic/css/civic.css:418
  .civic-money { ... }

public/app.html:201
  <div id="money-tab">

Proceed with these changes? (showing diff...)

You: Yes

Skill: Applying Stage 1 (CSS)...
Skill: ✓ CSS updated
Skill: Applying Stage 2 (HTML)...
Skill: ✓ HTML updated
Skill: Applying Stage 3 (JS)...
Skill: ✓ JS updated, router keys match conditionals

Verification checklist:
[ ] Click 'Finances' in nav — content loads (URL: #action/finances)
[ ] Inspect element shows class="civic-finances"
[ ] grep for stray 'money' references: zero matches
[ ] git diff shows only expected files changed

Ready to test? Or commit?
```

---

## Rollback

If something goes wrong:

```bash
# The skill tracks all changes in git
git diff                    # See what changed
git checkout -- <file>      # Revert specific file
git reset --hard HEAD       # Revert everything (last resort)
```

The skill never commits — you control when to commit and can easily revert.
