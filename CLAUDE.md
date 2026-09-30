# Causal — Claude Code Instructions

## Before starting any task — mandatory

**1. Codebase questions → graphify, not grep.**
Use `graphify query` for anything about relationships, callers, architecture, or "where is X". Reserve `grep` only for confirming a known string in a known file or verifying a rename landed. Never `grep -r` as a substitute for understanding.

**2. Task matches a skill → read the SKILL.md first, then work.**
Skills live at `/root/causal-app/.agents/skills/`. Read the SKILL.md before touching any code when the task matches a trigger. Do not skip this step.

| Task type | Skill to read first |
|-----------|-------------------|
| Renaming strings, variables, routes, identifiers across files | `bulk-refactor-string` |
| Bulk salary/personnel edits, copy-from-prior-year | `personnel-bulk-editor` |
| Importing CSV or bulk-updating data | `import-dry-run` |
| Budget/account/allocation edits + "is this correct?" | `budget-data-validator` |
| Xero sync, balance mismatch, account mapping | `xero-sync-audit` |
| "Form won't save", "changes don't persist", "stuck on loading" | `form-state-debugger` |
| Need test data, reset fixtures | `test-fixture-generator` |
| Applying a DB migration | `db-migration-apply` |
| Debugging an async flow or tracing a request | `async-trace-debug` |
| Security/architecture risk audit of a repo or diff | `vibe-audit` |
| Ownership/accountability readiness check before shipping | `ship-check` |

**3. After applying any migration → run `/graphify . --update`.**
The graph does not update itself from SQL changes. Always re-sync after any `psql` migration.

---

## General behavior
- Commit completed, verified units of work automatically (see "Git rules"); do not push unless told to
- Do not restart the server unless explicitly asked
- Read any file fully before editing it
- **Read actual files for current state; use git log only for history** (what changed when, what a file looked like before)
- **Check the live system before stating how anything behaves now.** Before saying how an account, role, route, or setting works today, run a read-only query against the live DB and read the current working-tree file (uncommitted changes included). Do not answer from earlier in the conversation, from a seed or migration file, or from git history: other sessions edit this same working tree and change seeds, routes, and DB rows underneath you. If you didn't re-check this turn, say "as of when I last looked." Separate "I read the code" from "I ran it," and when the user reports what they observed, re-check instead of defending your reading. (2026-09-25: I said the demo account had no Cooperative access, from a seed I'd read earlier. It had been changed.)
- Make one change at a time and report what you did before proceeding
- Do not create new CSS classes — use existing tokens in app.css
- When in doubt, ask rather than guess
- **Don't make unconfirmed changes while doing something else the user asked for — including "fixing" something you noticed along the way.** A request like "commit what's open" is scoped to that action; it is not standing permission to also change data, code, or config you happened to notice looked wrong during it. If something looks wrong, say so and ask, or at most stage the question for the user — don't act on your own read of it first. This applies especially to shared state other sessions may have set deliberately (DB rows, seed data, config) — a value that looks like a bug may be intentional work from another session; check `.claude/plans/` and git history for a rationale before changing it, not just your own read of "this looks wrong." (2026-09-28: asked to commit, I instead "fixed" a demo org's name back to what I assumed was correct — it was a deliberate rename from an earlier session, documented in that session's own plan file, which I hadn't checked.)
- **Don't reach for the Chrome DevTools tool unless it's genuinely needed, and keep usage light even then.** Prefer `curl`/API calls and direct DB queries to verify server-side behavior — they're cheaper and usually sufficient. Reserve the browser tool for things that can only be seen client-side (rendered layout, JS console errors, a click-through flow). When you do use it, prefer `evaluate_script` reads over `take_snapshot`/`take_screenshot`, and don't reload the same page repeatedly to re-check something curl could confirm. (established 2026-09-28 after unnecessary use ran up avoidable cost.)

## Plan storage: keep plans in the project, not the global home directory

Claude Code's plan mode defaults to writing plan files to `~/.claude/plans/` — a system location outside this repo, invisible to the user browsing the project, and not version-controlled with the rest of the work. Project-specific material must live in the project.

- **All plans belong in `/root/causal-app/.claude/plans/`** (already git-ignored via the standard `.claude/` pattern, but present on disk where the user can find it inside the repo).
- If plan mode's tooling writes to `~/.claude/plans/` first (a harness constraint, not optional), copy the finished plan file into `/root/causal-app/.claude/plans/` before ending the turn — do not leave the only copy outside the repo.
- Do not put plans, research write-ups, or other working documents in `docs/` — that directory is for durable project documentation (see `docs/Causal_Development_Path.md`), not planning scratch material.
- For research/analysis tasks that aren't pre-approval implementation plans (e.g. "review X and tell me what's missing"), skip plan mode's forced external location entirely and write the output straight into `/root/causal-app/.claude/plans/` (or elsewhere in the repo if the user wants a durable doc, e.g. `docs/`).

## Codebase exploration: graphify FIRST, grep NEVER

**Always use `graphify query` for architecture and relationship questions — do NOT use grep/Bash searches or spawn Explore agents for codebase exploration.**

**There is ONE graph for the entire repo** at `/root/causal-app/.graphify/graph.json` (covers all of `server/`, `public/`, `db/`). Never run graphify from a subdirectory — always run it from `/root/causal-app/`. If a `.graphify/` folder appears inside `public/` or any subdirectory, delete it.

Query the graph:
```
graphify query "where is X defined?"
graphify query "what calls the budget save flow?"
graphify explain "scheduleRecalc"
graphify path "budget.js" "org_budget_lines"
```

Reserve `grep` only for: finding a specific string on a known file, or verifying a rename was complete. Never use grep as a substitute for architectural understanding.

If `.graphify/needs_update` exists, run `/graphify . --update` before querying.

## Project skills: `.agents/skills/` — read with the Read tool

Skills live at `/root/causal-app/.agents/skills/`. There are 14:

`bulk-refactor-string` · `budget-data-validator` · `form-state-debugger` · `import-dry-run` · `personnel-bulk-editor` · `test-fixture-generator` · `xero-sync-audit` · `db-migration-apply` · `pm2-restart-health-check` · `postmark` · `rest-api-scaffold` · `async-trace-debug` · `vibe-audit` · `ship-check`

`vibe-audit` and `ship-check` are imported from [mission-driven-ai-spellbook](https://github.com/andersthemagi/mission-driven-ai-spellbook) (2026-08-14) — process/governance skills, not codebase-technical ones. `vibe-audit` runs an evidence-based security/architecture risk audit with file-line citations; `ship-check` scores ownership/responsibility/accountability readiness (0–100) before shipping AI-assisted work.

**How to use them:** Read the SKILL.md file directly and follow it as a methodology guide:
```
Read /root/causal-app/.agents/skills/<skill-name>/SKILL.md
```

These are NOT invocable via the Skill tool (that only works for `~/.claude/skills/`). When a task matches a skill trigger, read the SKILL.md and execute its methodology manually.

**The global Skill tool** (`~/.claude/skills/graphify/`) is invoked with `Skill tool: skill="graphify"` — this is separate from the `.agents/skills/` directory.

## Project structure

**Frontend** (`/public/`):
- **Individual app** (`/public/individual/`) — Consumer SPA, internal codename `individual`, display name "agency"
  - Entry: `/public/individual/index.html`, served at URL `/individual/`
  - CSS: `/public/individual/css/individual.css` (imports shared tokens)
  - JS: `/public/individual/js/router.js`, `moves.js`, `money.js`, `settings.js`, `turnarounds.js`, `gtag.js`
  - Header: `/public/individual/header.html`
  - Info panel: `/public/individual/info-panel.html`

- **Organizational app** (`/public/organizational/`) — Nonprofit workspace multi-page app, internal codename `organizational`, display name "cooperative"
  - 17 HTML pages (dashboard, budget, grants, settings, etc.)
  - CSS: `/public/organizational/css/organizational.css` (imports shared tokens)
  - JS: 20 files (dashboard.js, budget.js, utils.js, sidebar.js, etc.)
  - Header: `/public/organizational/header.html`
  - Partials: `/public/organizational/partials/` (sidebar.html, modals.html)
  - Data: `/public/organizational/data/samples/`, `/public/organizational/data/templates/`

- **Shared infrastructure** (`/public/shared/`)
  - CSS: `/shared/css/tokens.css` (design system — colors, spacing, tokens)
  - Auth: `/shared/login.html`, `/shared/reset.html`
  - Pages: `/shared/onboarding.html`, `/shared/privacy.html`, `/shared/about.html`
  - PWA: `/shared/manifest.json`, `/shared/sw.js`, `/shared/footer.html`
  - Assets: `/shared/assets/` (icons, logos, branding)

### Internal codenames vs. display names

App identifiers in code (folder names, CSS class prefixes, server routes) are stable codenames, decoupled from the marketing display name shown in the UI. This is intentional — display names have changed multiple times ("with"→"loop"→"movement"→"push"→"turnaround"→"agency", "cooperative"→"pool"→"cooperative") and codenames should not need to change with them. **When a display-name rename happens, grep every doc and HTML file that names the app (about.html, landing.html, CLAUDE.md's own table above, session memory) — not just the header.html files — or this table drifts out of sync again.**

The "causalworks" brand (logo + browser tab `<title>`) is separate from this — it's the shared product/company name shown on both apps regardless of the current in-header display name, and does not change with these renames.

**Codename === URL prefix (as of 2026-07-22 rename):** folders, CSS classes, JS globals, and public URL routes were all renamed together to `individual`/`organizational` — there is no split between codename and URL segment for these two apps. (Prior to this, the folders were briefly renamed while routes stayed at the old `/pers/`/`/coop/` prefixes; that split caused confusion and was collapsed same-day. No redirects were added from the old `/pers/`/`/coop/` paths — any existing bookmarks/links to those URLs will now 404.)

| Codename (code) | URL prefix | Display name (UI, as of this rename) | Header file |
|---|---|---|---|
| `individual` | `/individual/` | "agency" | `public/individual/header.html` |
| `organizational` | `/organizational/` | "cooperative" | `public/organizational/header.html` |

To rename a display name in the future: edit the text in the relevant `header.html` (and any other surfaced display text) only — do not rename folders, CSS classes, or routes.

### Data models: check origin era before extending for a newer module

The Organizational workspace's data models were not all designed for the module that uses them today — several were built for an earlier, narrower purpose (fundraising/donor CRM, budget forecasting) and later reused or extended by a subsequent module (Accounting) without re-examining whether the original shape actually fits the new use case. This has caused real, shipped bugs — not hypothetical risk. Example (2026-09-11): `org_constituents.type` (migration 095, `foundation`/`individual`/`board`/`prospect`/`member_org`) was built purely as a donor-CRM segmentation ("Constituent CRM parent record — covers foundations, individual donors, board members, prospects, member orgs"). Migration 204 later bolted `is_vendor`/`is_customer` role flags onto the same row for the Accounting module without ever revisiting `type` — so every new vendor/customer contact is still forced through a donor-shaped dropdown with no option that means "a business we pay" or "a company we invoice." Caught only because a human asked "does this actually make sense" after the UI shipped, not because it was checked before building.

**Before extending an existing table/endpoint/UI pattern for a new module, check what the model was originally *for*** — read its origin migration's own comment, not just its current column list — and verify that fit against real practice for the *new* module's domain (see [[feedback-check-best-practices-before-plans]] on researching before finalizing a plan). Don't assume "it's already there and roughly shaped right" is the same as "it's the right foundation." This applies most to `org_constituents` (donor-CRM-origin, now also Accounting's contact list) and anything under Budget (`org_schedules`/`org_schedule_items`, fiscal-year-bound) that a future module might be tempted to reuse for a non-budget purpose.

## Stack

Node.js / Express 5 / PostgreSQL on a VPS. PM2 process manager (`causal-app`).
Frontend: vanilla JS SPA (`individual`, served at `/individual/`) + multi-page app (`organizational`, served at `/organizational/`) under `public/organizational/`.

## Architecture: one integrated app, not a connector stack

Causal is a single integrated enterprise app. Donors, Grants, Budget, and Accounting are UI
surfaces over **one shared schema**, not separate systems that need to stay in sync. When
connecting two modules, do not reach for third-party-integration patterns (typical CRM/
accounting SaaS connectors: mapping tables, sync jobs, two independently-writable sources
of truth reconciled after the fact) — that's the architecture of two systems that don't share a
database, which isn't the situation here. Reserve actual mapping tables (e.g.
`org_xero_program_track_map`) for genuinely external systems, where they're correct.

The correct internal pattern is a direct foreign key plus a status field on the originating row
— one row that becomes the ledger transaction when posted, not two rows kept in sync. Examples
already in the codebase: `org_gifts.posting_status`/`ledger_transaction_id` (in-kind gifts,
pledges, grant cash gifts — see `giftPosting.js`/`grantGiftPayment.js`), `org_bank_rules`
pre-filling Cash Coding (never posts automatically), `org_grants.revenue_account_id` reused as
a single default rather than duplicated into a second "GL account" field.

**Accounting posts within the Accounting module, never automatically from the originating
module.** A record from Donors/Grants/Budget lands as a pending/unposted item (or a computed
preview, e.g. Fixed Assets' "Run Depreciation") and only gets a ledger transaction once someone
explicitly reviews and confirms inside Accounting — mirroring how a bank feed brings in
transactions but they get posted in Cash Coding/Reconcile, not by the sync itself. This applies
even when the money's path is unpredictable: a grant payment can land in the bank feed before
the grant is even entered in Funders (see the three "cash-first vs. grant-first" orderings
Bank Reconciliation's `grant_gift` match type and Gift Postings' `link-transaction` action
handle) — design for that ordering explicitly, don't assume the tidy sequence.

## Follow Instructions Precisely

- "Build from scratch" means complete new modules, not partial rebuilds or patches.
- "Don't patch" means don't revert to old code — create new implementations.
- "Use main only" means never suggest or use other branches.
- If you find yourself reverting to old code, stop and rebuild properly instead.
- If you're about to do something that contradicts explicit instructions, stop and re-read what was actually asked.

## Git rules

- **Default branch is `main`.** Work from `main` unless the user explicitly names another branch.
- Before committing, confirm you are on the branch the user intends (`git branch --show-current`). If it does not match the task, stop and ask — do not switch branches unless told to.
- Never switch branches on your own.
- **Commit after each completed, verified unit of work** — a feature works, a sweep is finished, a migration is applied and verified, a doc edit is done. Not after every keystroke, and not one giant batch at the end. Several sessions share this one working tree, so uncommitted work is where they collide (changed 2026-09-30; the old rule was "commit infrequently" to save cost, but commits themselves cost almost nothing).
- Build and test BEFORE committing.

## Commits: automatic, with guardrails

Commits need no approval. The user has never declined one, so asking first guarded nothing. Commit on your own when a unit of work is done and verified, then report it in one line (hash + what it covers).

- **Stage an explicit file list — never `git add -u`, `git add -A`, or `git commit -a`.** Run `git status` first. If any changed file was not touched by this session (another session's work), leave it out and say so.
- **Stop and ask instead of committing** if: the branch isn't the one intended, `git status` shows `.env` or other sensitive files, tests or checks for the change are failing, or the diff contains something unrelated to the task.
- Commit message: short summary line, then a few lines on what and why.
- After committing, run `git status` to confirm only the files you meant to commit left the tree.
- **Push is separate and needs the user to say so** — the repo is public, so a push publishes. At a real milestone, offer it in one line ("push?"). Don't mention commit or push status otherwise; it isn't news.
- If push fails, report the error and stop — do not force-push unless explicitly asked.

## Planetary Boundaries reference data

- `server/data/planetary-boundaries.js` holds the nine SRC boundary definitions (severity, status, turnaround mappings, descriptions).
- The client-side copy in `public/individual/js/turnarounds.js` (`PLANETARY_BOUNDARIES_DISPLAY`) must stay in sync with the server file.
- **Annual review**: after each Stockholm Resilience Centre Planetary Health Check publication (typically September), update `status`, `trend`, and `transgression_severity` fields in both files to match the latest assessment. Manual refresh, same pattern as representative data files.

## Secrets

- `.env`, `.env.local`, `.env.save` are in `.gitignore` — never commit them.
- If `git status` shows env files or other sensitive material, stop and ask before committing.

## CSS: Which file to edit

The app has two separate frontend UIs with separate stylesheets. Choose carefully:

**Shared design tokens** (used by both apps):
- File: `public/shared/css/tokens.css`
- Contains: `:root` CSS variables (colors, spacing, typography, shadows, borders, radii)
- Examples: `--text-primary`, `--accent`, `--border`, `--radius-md`, `--shadow-lg`
- Rules: **Add tokens here, ONLY tokens.** No component classes.

**For Individual SPA** (served at `/individual/`):
- Component file: `public/individual/css/individual.css`
- Imports: `public/shared/css/tokens.css` (automatically loaded first)
- Classes: Use `.individual-*` prefix to avoid collisions
- What goes here: Individual sidebar, nav, cards, sections, modals, etc.

**For Organizational workspace** (served at `/organizational/`):
- Component file: `public/organizational/css/organizational.css`
- Imports: `public/shared/css/tokens.css` (automatically loaded first)
- Classes: Use `.organizational-*` prefix to avoid collisions
- What goes here: Organizational dashboard, budget, settings, tables, overlays, etc.

**Rules:**
- Never add component classes to `tokens.css` — tokens only
- Never define the same class in multiple CSS files — reuse or rename
- When creating new component styles, use CSS tokens instead of hardcoded values
- If you see a class used in both apps, it belongs in an app-specific file (not shared)

## Server restart after backend changes

After editing any file under `server/` (routes, middleware, jobs, etc.):

1. Restart: `pm2 restart causal-app`
2. Confirm it is running: `pm2 status`
3. State that the server was restarted and is running.

**If `.env` changed, use `pm2 restart causal-app --update-env` instead — a plain `restart` is not reliable for picking up `.env` changes on this box.** Confirmed empirically (2026-08-31, see DevPath rev 53/54): a plain `restart` was observed to silently lose env vars that an earlier `--update-env` restart had successfully picked up, with no code change in between — do not assume a plain restart is equivalent once `.env` itself has been touched. When in doubt after touching `.env`, verify with a real functional check (not just `pm2 status`), since a missing env var here fails silently in application code rather than crashing the process.

Do **not** restart for frontend-only changes (editing anything under `public/individual/`, `public/organizational/`, or `public/shared/`).

## Automatic Skill Usage (Pattern-Based Option B — As of 2026-06-11)

Claude automatically invokes skills when conversation patterns are detected. This is a **per-session contract** — when you mention specific triggers, I will automatically run the associated skill and report results.

### Skill Triggers

| Skill | Trigger Phrases | Action |
|-------|-----------------|--------|
| **graphify** | After migrations, "update graph", applied SQL changes, refreshing codebase map | Run `/graphify . --update` to keep knowledge graph in sync with code + schema changes |
| **form-state-debugger** | "form won't save", "changes don't persist", "edit doesn't work", "stuck on loading", "just edited [field] but it didn't save" | Instrument form, trace network requests, detect unsaved changes |
| **budget-data-validator** | Editing personnel/accounts/allocations, "is this correct?", "about to commit", "let me validate this", after bulk import | Validate data integrity, report inconsistencies, flag orphaned accounts |
| **xero-sync-audit** | "Xero", "sync", "balance mismatch", "account mapping", "is Xero up to date?", after editing Xero code | Audit connection, verify mappings, check balance freshness, P&L actuals |
| **import-dry-run** | "import" + file mention, "bulk update" + file, "before I apply this", uploading CSV | Preview creates/updates/deletes, flag conflicts, show data loss risks |
| **personnel-bulk-editor** | "salary increase" + number (e.g., "+4%"), "year-over-year", "copy from 2025", "bulk update salaries", "budget season" | Set up bulk edit, show before/after preview |
| **test-fixture-generator** | "need test data", "fresh test setup", "test-org" + want data, "reset fixtures", "after Xero demo reset" | Generate realistic test data (8–35 employees, accounts, allocations) |

### Chrome Browser Tool (Active as of 2026-06-13)

The `mcp__claude-in-chrome__*` tools are available via the Claude in Chrome extension installed in user's browser. Use proactively for UI analysis and debugging.

**When to use:** UI layout issues, save/fetch flow not working, JS console errors, end-to-end testing, verifying totals after edits.

**Load pattern** (batch all needed tools in one ToolSearch call):
```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests
```
Always call `tabs_context_mcp` first to get current tab context before any other browser action.

**Trigger:** Any mention of "check the browser", "look at the UI", "what does it look like", "test it live", "check the console", "network request", or when verifying a frontend fix.

### Skill Design Philosophy

All skills follow this approach:
- **Defensive:** Graceful degradation if tables/columns missing
- **Adaptive:** Auto-detect schema changes
- **Safe:** Read-only audits (no destructive operations)
- **Clear:** Layered output (summary → detailed → before/after)
- **Actionable:** Reports issues + suggests fixes

### Persistence

This contract is recorded in:
- **CLAUDE.md** (this file) — team-visible, git-tracked
- **Auto-memory** (`~/.claude/projects/-root-causal-app/memory/`) — Claude reads at session start

## Migrations

Apply via direct `psql` — no runner script. Pipe via stdin, do not use `-f <path>`:

```
sudo -u postgres psql causal_db < db/migrations/NNN_name.sql
```

`-f /root/causal-app/db/migrations/...` fails with "Permission denied" — `/root` (mode `700`) isn't traversable by the `postgres` OS user, so it can't open the path itself even though the file's own permissions are fine. Piping via stdin avoids the problem entirely (the shell, running as root, opens the file; `psql` just reads its stdin).

After any migration:
1. Verify with `\d <table>` for every affected table
2. **If the migration adds a NOT NULL column (no default that survives `jsonb_populate_recordset`, or any column at all) to a table covered by `demo_org_reset_tables()`, re-run `SELECT snapshot_demo_org();` immediately.** `restore_demo_org()` replays rows from a JSON snapshot (`org_demo_snapshot`) taken at some earlier point; a stale snapshot missing a newly-added NOT NULL column makes every future demo-company reset fail outright the next time the nightly reset job runs — this has actually happened (see DevPath rev 51). Check what's currently covered with `SELECT demo_org_reset_tables();` if unsure whether the table you touched is in scope.
3. **Keep graphify graph in sync:** Run `/graphify . --update` to re-extract schema changes. This ensures the knowledge graph reflects new tables/columns/relationships.

The git hook auto-updates the graph for code changes on commit; migrations require manual `--update` because they're SQL, not code.

## Current status and priorities

**For "what's next" — read `.claude/plans/CURRENT_PRIORITIES.md` first.** It's a short, actively-maintained backlog; update it in the same pass as any work that starts, finishes, or gets newly identified. Don't let it go stale the way the old `## Priorities` section in `Causal_Development_Path.md` did — that section is now historical only, superseded by this file.

**Engineering-state snapshot: `docs/Causal_Development_Path.md`** — architecture/current-state
reference plus a terse Update Log (2026-09-16: rewritten to 2-5 line entries pointing at a
`.claude/plans/` dated file for full detail, not full narratives inline — the old convention was
why this file grew back to ~91K tokens after already being trimmed once). **This file and its
`docs/devpath-archive/` are gitignored — present on disk but not pushed to the public repo.** If
you're working from a fresh clone without it, this section won't apply; ask for the file directly.
Update it (not this file) when work is completed, and if the live Update Log passes ~20 entries,
archive the oldest into `docs/devpath-archive/rev-<first>-<last>.md` in the same pass (see that
section's own header in the doc). **Never read this file in full as routine practice** — grep or
targeted `Read`/offset for the section or rev number you actually need; same for the archive files.
Read it at all only when `CURRENT_PRIORITIES.md` isn't enough context.

**Plans directory (`.claude/plans/`) convention**: see `.claude/plans/README.md`. Top level = active/unresolved plans, `archive/` = shipped or superseded. Every plan file is named `YYYY-MM-DD-short-description.md`.

This file (`CLAUDE.md`) contains only stable behavior instructions — not project state.

---

## Test environment

Current test org: `demo-company` slug (Demo Company), accessible at `/organizational/o/demo-company/`. The org's `PATCH` rename endpoint regenerates the slug from the display name, so renaming it again changes this URL too — verify against the DB rather than trusting this line, and update it here if it drifts.
- Use this workspace to test Coop UI changes
- Xero integration (if configured): Xero Demo Company data source resets every 28 days — re-seed from `Xero_Demo_Setup.md` each cycle.
