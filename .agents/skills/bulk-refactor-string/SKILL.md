---
name: bulk-refactor-string
description: Use when renaming or replacing strings across the codebase — finds all occurrences, validates dependencies, previews changes, and applies with safety checks to catch common mistakes.
user-invocable: true
---

# Smart Bulk String Refactoring

Use this skill to rename features, nav items, API names, or other strings across the codebase **safely**. Unlike dumb find-and-replace, this skill:
- Groups changes by file type and risk level
- Validates that related references are updated together
- Warns about potential breakage before applying
- Auto-generates verification steps

Examples:
- Rename sidebar nav item (`Ledger` → `Transactions`) — updates HTML, JS router, CSS, and function names together
- Rename feature namespace (`OldBrand` → `NewBrand`) — updates page titles, classes, comments, and docs
- Update API names (`np_task_status` → `coop_task_status`) — ensures all consumers are updated

## When to Use This Skill

✅ **Use this skill for:**
- **Nav item/UI label renames** — "Act" → "Civic Action" (labels only)
- **Branding renames** — "OldBrand" → "NewBrand" (text strings, titles, comments)
- **Config key renames** — "np_mode" → "coop_mode" (across code)
- **Namespace updates** — "--np-accent" → "--accent" (CSS variables)

⚠️ **For comprehensive renames, coordinate with:**
- **Folder/path renames** — Requires moving files AND updating all references
- **URL structure changes** — Requires server route updates + external link updates
- **Database refactoring** — Requires migrations + code changes + testing

❌ **Do NOT use this skill for:**
- Logic changes (use code review instead)
- Partial substring matches (e.g., replacing "NP" could hit unrelated words)
- Generated files or build artifacts (node_modules, dist/)
- Database column renames (use migration strategy)

## Overview

The smart process:
1. **Understand the change** — What type of rename? (nav item, feature, API, etc.)
2. **Find all references** — Grouped by file type and semantic purpose
3. **Validate dependencies** — Warn if related pieces aren't all updated together
4. **Preview changes** — Show before/after side by side
5. **Apply safely** — Apply in stages with validation checks
6. **Generate verification** — Checklist + console commands to verify the change works

## Step 1: Describe the Change (Not Just the Strings)

Instead of just "from X to Y", tell me **what you're renaming and the scope**:

```
I'm renaming the sidebar nav item "Ledger" to "Transactions"
```

Or:

```
I'm updating all references from "OldBrand" to "NewBrand" 
across page titles, CSS variables, and documentation
```

Or (comprehensive):

```
I'm renaming the entire "civic" app to "flow" — including 
folder structure, URLs, and all internal references
```

**Why this matters:** Different scopes have different dependencies and require different verification steps.

### Rename Types & Their Patterns

**Type 1: Sidebar/Nav Item Rename** (cosmetic)
```
Renaming a nav item like "Ledger" to "Transactions" requires updating:
  - HTML: <a href="#action/ledger"> and <div id="ledger-tab">
  - JS Router: subsectionTitle['ledger'] = 'Ledger'
  - JS Router: if (subsection === 'ledger') { ... }
  - JS Functions: loadLedgerTab() function name
  - CSS: .civic-ledger class names
  - Data attributes: data-subsection="ledger"

Scope: Limited to HTML, CSS, and JS references; internal IDs stay the same
```

**Type 2: Feature/Namespace Rename** (moderate scope)
```
Renaming "OldBrand" to "NewBrand" across branding:
  - Page titles: document.title = '... OldBrand'
  - CSS variables: --np-accent, .np-main
  - Comments and docs: /* OldBrand branding */
  - Config keys: np_task_status, np_mode, etc.

Scope: Text strings and config; folders and URLs may stay the same
```

**Type 3: Complete App Rename** (large scope — like civic → flow)
```
Renaming entire "civic" app to "flow" requires:
  - Folder: /public/civic/ → /public/flow/
  - URLs: /civic/* → /flow/*
  - Server routes: all paths updated
  - Links from other apps: /coop/ sidebar link
  - Internal CSS/JS: class names stay (.civic-* is fine), but paths change
  - Config/env: any references to old path

Scope: Folder structure, URL paths, external links; internal styles unchanged
```

**Type 4: API or Config Rename** (high complexity)
```
Renaming "np_task_status" to "coop_task_status" requires:
  - All API calls: /api/np/... → /api/coop/...
  - Database column aliases in queries
  - Variable names that store these
  - Error messages that reference the old name
  - Enum/constant definitions

Scope: Database, API contracts, backend code; frontend may be unaffected
```

## Step 2: Find All References (Smart Grouping)

I'll search for all occurrences and group them by:
- **File type** (HTML, JS, CSS, markdown, SQL)
- **Semantic category** (identifiers, strings, comments, config keys)
- **Risk level** (safe to change, requires review, potentially dangerous)

**Example output for "Ledger" → "Transactions":**

```
=== CRITICAL (must change all together) ===
public/civic/js/app-router.js:206
  subsectionTitle['ledger'] = 'Ledger';
  → subsectionTitle['transactions'] = 'Transactions';

public/civic/js/app-act-civic.js:670
  async function loadLedgerTab() {
  → async function loadTransactionsTab() {

public/app.html:47
  <a href="#action/ledger">Ledger</a>
  → <a href="#action/transactions">Transactions</a>

=== SHOULD CHANGE (CSS and minor refs) ===
public/civic/css/civic.css:412
  .civic-ledger { ... }
  → .civic-transactions { ... }

public/app.html:161
  <div id="ledger-tab">
  → <div id="transactions-tab">

=== OPTIONAL (comments and docs) ===
public/civic/js/app-act-civic.js:668
  // Load the Ledger tab when user clicks Money
  → // Load the Transactions tab when user clicks Money
```

This grouping shows you exactly what's dependent on what.

## Step 3: Validate Dependencies

Before applying, I check:

✅ **Completeness:** Are all related pieces being updated?
```
PASS: All 'ledger' references in HTML, JS, CSS being updated
PASS: Function names (loadLedgerTab) being renamed
```

⚠️ **Consistency:** Will the change break internal references?
```
WARN: Router rule uses subsection='ledger' but subsectionTitle map uses 'ledger'
      Both are being updated — SAFE
```

❌ **False Positives:** Will the change hit unrelated code?
```
FAIL: Found "ledger" in variable name "ledgerEntries"
      This is NOT the nav item name — need to exclude this
```

## Step 4: Preview Changes

Show the **before and after** side by side:

```diff
--- public/app.html (before)
+++ public/app.html (after)
@@ -45,7 +45,7 @@
  <nav class="app-nav">
    <a href="#action/money">Money</a>
-   <a href="#action/ledger">Ledger</a>
+   <a href="#action/transactions">Transactions</a>
  </nav>

--- public/civic/js/app-router.js (before)
+++ public/civic/js/app-router.js (after)
@@ -204,7 +204,7 @@
  const subsectionTitle = {
    action: 'Overview',
-   ledger: 'Ledger',
+   transactions: 'Transactions',
    money: 'Money'
  };

-   if (subsection === 'ledger') { loadLedgerTab(); }
+   if (subsection === 'transactions') { loadTransactionsTab(); }
```

You review this and confirm: **"Yes, these changes look right"**

## Step 5: Apply Changes (Staged & Validated)

Instead of a blind sed command, apply in stages with checks:

**Stage 1: Replace in non-critical files (CSS, comments)**
```bash
sed -i 's/Ledger/Transactions/g; s/ledger/transactions/g' public/civic/css/civic.css
```
✓ Applied safely (CSS is isolated)

**Stage 2: Replace in HTML (structure is critical)**
```bash
sed -i 's/ledger/transactions/g' public/app.html
```
✓ Applied — verify HTML syntax is still valid

**Stage 3: Replace in JavaScript (most critical — must validate logic)**
```bash
sed -i 's/Ledger/Transactions/g; s/ledger/transactions/g' public/civic/js/app-router.js
```
✓ Applied — verify router object keys still match references

**Validation check after Stage 3:**
```bash
# Verify the router map and usage match:
grep -A2 "subsectionTitle\[" public/civic/js/app-router.js | grep "transactions"
grep "subsection === 'transactions'" public/civic/js/app-router.js
# Both must exist and be consistent
```

If validation fails, **roll back and report the issue** before continuing.

## Step 6: Auto-Generate Verification Checklist

After applying, I provide a checklist to confirm the change works:

```
=== Testing Checklist ===

[ ] 1. Browser Test: Click "Transactions" in sidebar nav
  Expected: Content loads, no errors in console
  Command: Open DevTools (F12), click nav item, check console

[ ] 2. Router Test: Navigate directly to URL
  Expected: Page loads correctly
  URL: http://localhost:3000/civic/index.html#action/transactions

[ ] 3. CSS Test: Element styling is correct
  Command: Inspect element in DevTools, verify class="civic-transactions" exists

[ ] 4. Console Sanity Check
  Command: grep -r "ledger" public/ --include="*.js" --include="*.html" | grep -v node_modules
  Expected: ZERO matches (old name is completely gone)

[ ] 5. Git Diff Review
  Command: git diff --stat
  Expected: Only the expected files changed (app.html, app-router.js, civic.css, etc.)

[ ] 6. Search for Orphaned References
  Command: grep -r "Ledger" public/ --include="*.js" --include="*.html" | grep -v "Transactions"
  Expected: ZERO matches (no stray old references)
```

I run these checks **with you** before you commit.

## Step 7: Commit with Context

Once verified, create a commit with a detailed message:

```bash
git commit -m "Rename nav item 'Ledger' to 'Transactions'

Changes:
- Updated HTML: nav link and tab id in app.html
- Updated JS router: subsectionTitle map and conditional in app-router.js
- Updated JS: function name from loadLedgerTab to loadTransactionsTab
- Updated CSS: class names from .civic-ledger to .civic-transactions
- Updated all related data attributes and element ids

Verification:
- Nav click loads correct content
- Direct URL navigation works
- CSS classes match element selectors
- No stray 'ledger' references remain in codebase"
```

## Common Mistakes (Caught Automatically)

| Mistake | How Skill Prevents It |
|---------|----------------------|
| Missing a reference | Validation shows ALL occurrences grouped; if subsectionTitle isn't updated, it's flagged |
| Inconsistent updates | Staged validation checks that router keys match conditional checks |
| Accidentally renaming unrelated code | Pre-flight shows false positives; asks for confirmation on each |
| Breaking HTML/CSS syntax | Applied in stages; each stage validates syntax before moving on |
| Stray old references left behind | Final verification grep checks that old name is completely gone |
| Case sensitivity issues | Applies multiple patterns (Ledger, ledger, LEDGER) and shows what matched |

## Advanced: Regex for Complex Patterns

If your change has variations (camelCase, snake_case, etc.):

```bash
# Rename ledger_balance to transaction_balance (and ledgerBalance to transactionBalance)
find /root/causal-app -type f -name "*.js" \
  -exec sed -i 's/ledger_balance/transaction_balance/g; s/ledgerBalance/transactionBalance/g' {} \;
```

The skill will show you all patterns it's applying and let you confirm each one.

## Large-Scope Renames (App Folder / URL Restructuring)

If you're renaming something that involves **folder paths or URLs**, be explicit:

**Example — Don't:**
```
"Rename civic to flow"
```

**Example — Do:**
```
"Rename the entire civic app to flow — including:
- Folder structure: /public/civic/ → /public/flow/
- URLs: /civic/* → /flow/*
- Server routes: all paths
- External links: sidebar links from other apps"
```

**What this triggers:**
1. Find all folder/path references (not just text strings)
2. Plan the sequence (usually: folder move → server routes → external links)
3. Validate at each step that broken links are caught
4. Verification includes testing URL navigation + link integrity

This is larger than simple string replacement and requires:
- Folder operations (mv, not sed)
- Server routing changes (more than text replacement)
- Cross-app link verification
- URL testing before and after

## Notes

- **Git safety:** All changes are tracked. `git reset --hard` reverts if needed.
- **Database:** Never modify migrations (they're historical). Only update live code.
- **Staged application:** Changes are applied one category at a time so we can catch issues early.
- **Validation is built in:** Each stage checks that the change is logically consistent before moving to the next.
- **Multiple passes OK:** If you need to rename multiple related things (e.g., `ledger` + `ledgerTab`), do them one at a time and verify after each.
- **For comprehensive renames:** Be explicit about scope (cosmetic labels vs. folder structure vs. URLs) so the skill can guide the full scope of changes needed.

## Example: Real-World Nav Item Rename

Here's what a full "Ledger → Transactions" rename looks like with this skill:

```
You: "Rename the sidebar nav item 'Ledger' to 'Transactions' in the Civic app"

Skill: "Finding all references to 'Ledger' and 'ledger'..."

=== CRITICAL (must update together) ===
public/civic/js/app-router.js:206
  subsectionTitle['ledger'] = 'Ledger';

public/app.html:47
  <a href="#action/ledger">Ledger</a>

public/civic/js/app-act-civic.js:670
  async function loadLedgerTab() {

=== SHOULD CHANGE ===
public/civic/css/civic.css:412
  .civic-ledger { ... }

[Skill shows the diff, you confirm]

Applying Stage 1 (CSS): ✓
Applying Stage 2 (HTML): ✓ 
Applying Stage 3 (JS Router): ✓
Validating: Router keys match conditionals ✓

Verification checklist:
[ ] Click 'Transactions' in nav — content loads
[ ] Direct URL /civic/index.html#action/transactions works
[ ] CSS: inspect element shows class="civic-transactions"
[ ] Grep for stray 'ledger': [zero matches]
[ ] Git diff shows expected files changed

Ready to commit? [yes/no]
```

Much less manual work, and you can't accidentally miss a reference.

## Verification Checklist by Scope

Choose the right checklist based on the type of rename:

### Type 1: Nav Label Rename (Civic Action)
- [ ] HTML label text changed
- [ ] Page title map updated (if visible in page header)
- [ ] No broken selectors or data attributes
- [ ] Nav click still works and shows correct content

### Type 2: Branding Rename (OldBrand → NewBrand)
- [ ] All visible text updated (page titles, labels, comments)
- [ ] CSS variables/tokens updated if applicable
- [ ] No stray old references left behind
- [ ] Functionality unchanged (just text cosmetics)

### Type 3: Folder/URL Rename (civic → flow)
- [ ] Folder renamed on disk
- [ ] All server routes updated
- [ ] All `/old/` URLs changed to `/new/`
- [ ] External links (sidebar, nav) point to new URL
- [ ] Direct URL navigation works (reload doesn't break)
- [ ] No 404 errors on new path
- [ ] No broken imports or path references in code

### Type 4: Config/API Rename (np_status → coop_status)
- [ ] All API endpoints updated
- [ ] Database queries use new names
- [ ] Frontend variables updated
- [ ] Tests/docs updated
- [ ] No version mismatch between frontend and API

## FAQ: Why Is This Better Than sed?

| Question | Answer |
|----------|--------|
| Can't I just use `sed` manually? | Yes, but you risk missing references or breaking logic. This skill catches those. |
| Doesn't it take longer? | No — the upfront validation saves time by catching issues before they break things. |
| What if I need multiple renames? | Do them one at a time. This skill handles each independently and verifies. |
| What if my codebase is different? | Describe the change scope, and the skill adapts. The validation steps scale to the scope. |
| What about large structural changes (folder rename)? | Be explicit about scope in Step 1. The skill will use folder operations, not just sed. |
