---
name: vibe-audit
description: Runs an evidence-based security and architecture risk audit against real code, a local repo, pasted files, or a GitHub URL. Fans out parallel specialist passes (access, input safety, secrets/deployment, observability, tests), then verifies every finding against the actual code before reporting. Every finding cites a specific file and line; no external stats, no borrowed citations. Trigger on "/vibe-audit", "audit this repo", "security check my codebase", or "/vibe-audit --demo" for an anonymized shareable summary.
---

<!--
  Built by Andrés, Red Mage (redmage.cc | andres@redmage.cc).
  Developed in collaboration with Matt "Kelly" Williams, Making Software Greener.

  Part of the Mission Driven AI Spellbook, free skills for builders
  who ship with intention. Methodology v5 (see CHANGELOG.md).

  This skill reads code and reports what's actually there. If it can't
  point to a line of code, it's not a finding, it's an assumption.
-->

## What this skill does

Audits real code through parallel specialist passes, then verifies every candidate finding against the source before it reaches the report. Built for the specific failure mode of AI-assisted code: fast to prototype, rarely reviewed, and the bugs that ship are usually authorization gaps and trust-boundary mistakes, not typos.

Pairs with `/ship-check`, that one asks whether you thought about ownership. This one tells you what's actually in the code.

## Phase 1, Scope scan (main agent, before any fan-out)

1. Confirm what's available: local path, GitHub URL, or pasted files. State up front what's missing (database schema, RLS policies, env config, infra). Missing pieces become Assumptions, never findings.
2. Map the repo: entry points, routes/pages, server actions or API handlers, auth/middleware, database client code, CI config, tests. Skip build output and dependencies. A large line count in an AI-built repo is usually *authored*, not vendored, confirm with `git ls-files | grep node_modules` before assuming bulk is skippable, and report the authored-vs-generated split (scaffolded UI, codegen'd types, lockfiles = generated) as its own line. In migration-heavy repos, the deployed DB state isn't knowable from the tree: cite the latest migration touching each object and log the live state as an Assumption.
3. Build the **System Map**: inputs (forms, URL params, payloads, uploads) · outputs (rendered data, emails, logs, writes, external calls) · external connections · trust boundaries (every point where unverified data crosses into a privileged action) · sensitive data.
4. **Determine the execution model**, static build, server runtime, client-only SPA, or mixed. This gates severity: a debug log or third-party fetch that runs build-time-only is Low; the identical code running per-request on a server is higher. State the model up front and apply it to every runtime finding.
5. From the map, list the **hot files**, the code that sits on a trust boundary. These get priority in every pass.
6. **Triage the surface.** If there is no server runtime and no trust boundary that receives untrusted input (e.g. a static brochure site), say so and narrow to what applies: build-time integration and secret scoping, third-party data exposure, maintainability. If instead the risk is *concentrated* rather than absent, a client-only SPA where per-user RLS is solid and nearly all exposure sits in one edge function and a bucket config, say that too, and reallocate lens effort onto those few files instead of running all five evenly. Don't run five even passes that mostly report N/A; name where risk actually lives and spend there.

## Phase 2, Specialist passes (parallel sub-agents)

Fan out one sub-agent per lens, in parallel. Each gets: the System Map, the hot-files list, the repo path, and its single lens. Each returns candidate findings in the Risk Ledger schema below, nothing else.

- **Access / authorization:** who can do what. Role checks that exist in the UI but not the server. IDs accepted from the client without ownership checks. Privilege escalation chains. Compare every UI-side gate against the server-side write path it's supposed to protect, the write path is the one that counts. In a client-only SPA (untrusted browser; RLS or a server function is the boundary), a client-side gate is a finding *only when nothing server-side backs it*: a client route guard behind correct RLS is fine, but a "signups closed" flag with the auth endpoint still open, or a CRM call any stranger can POST to, is not.
- **Input safety:** validation that only runs client-side. Raw input interpolated into query/filter strings. Type-unsafe boundaries (`any` at a server action). Malformed-input handling.
- **Secrets & deployment:** credentials in code, config, or CI. Keys injected where nothing reads them. Placeholder fallbacks that reach production. Dead or duplicated pipeline config.
- **Observability:** what leaks, raw provider errors shown to users, sensitive payloads in logs, debug leftovers. And what's silent, failures nobody would hear about.
- **Tests & maintainability:** do the tests that exist actually run and guard the behavior that matters (auth paths, writes touching other users' data)? Duplicated logic where copies have drifted, especially when the weakest copy is the real write path. Dead routes, stale comments, plausible-but-unused code.

Each sub-agent must read the actual files it cites. A finding without a file and line quote gets returned as an assumption instead. **Negative evidence counts:** a finding can cite something that *isn't* there, an import that resolves to no file, a `grep` that returns empty, a missing `<body>` or auth check, as long as you quote the pointer (the import line, the command and its empty result). Absence, shown, is evidence; it doesn't get downgraded to an assumption. **When a missing config implies a platform default** (no `config.toml` → the platform's default auth behavior applies; no RLS file → the DB default), audit against that default as the operative behavior, rate with the escalation condition, and log confirming the deployed setting as an Assumption.

## Phase 3, Merge and verify (main agent)

1. Dedup across passes; the same root cause found through two lenses is one finding with two consequences.
2. **Verify every candidate: re-read each cited file at the cited lines.** If the quote doesn't match the code, the finding is dropped or corrected, never passed through on trust.
3. Chain findings: note where two findings compose into a worse one (e.g., self-assignable role + missing ownership check = escalation chain). Chains lead the report.
4. Assign final severity (Critical/High/Medium/Low) and confidence (Strong evidence / Possible concern / Speculative). If severity can't be pinned by evidence, default lower. Rank by severity first, confidence second.
5. **Certain behavior, uncertain blast radius:** when the code's behavior is provable but its impact depends on an external system you can't see (account contents, a live RLS policy, a shared bucket), rate by the verified behavior and state the escalation condition inside the finding, e.g. "Medium; High if that account is shared." Don't inflate on a guess, don't bury a real bug. This *overrides* "default lower" (step 4): default-lower is for uncertain *behavior*; when the behavior itself is proven and only the impact is uncertain, rate the behavior and state the escalation, don't sink a proven bug to Low.

## Phase 4, Report

Every finding in the **Risk Ledger** carries: severity · category (Access / Input Safety / Observability / Deployment / Maintainability) · what's happening now (one plain sentence) · evidence (file, lines, quoted code) · why it matters · how it could be triggered · confidence · **the fix** · how you'll know it's fixed (the test that would catch a regression).

**Finding the bug is half the job, ship the fix with it.** For every Critical and High finding, "the fix" is not a one-line suggestion: name the exact file and function to change, describe the corrected logic concretely, and include a short code sketch of the change (the authoritative query to add, the check to insert, the boundary to move server-side), enough that a developer can implement it without re-deriving the solution. Medium/Low findings can be terser, but still name the specific change, not "add validation." An audit that says what's wrong but not how to fix it has done half the work.

Then:
- **AI-Assist Fragility Check**, structural smells, not individual vulnerabilities: copy-pasted logic with drifting copies, two ways to do the same thing, missing tests around what matters, happy-path-only features, hardcoded placeholders, no single owner for a business rule, stale comments/tests.
- **What Breaks at 10x**, for the two or three subsystems most exposed to growth: what breaks first, cost to fix now vs. after, quick fix or structural.
- **Basic Readiness Scorecard**, Pass / Warning / Fail / N/A across: login and identity, permissions, ID/parameter tampering, injection and malformed input, file uploads, rate limiting, secrets and env vars, accidental logging of private data, error messages leaking internals, admin/privileged actions, API endpoints, database access, payments, AI/LLM usage, deployment config, backups and recovery. One line of why per row.
- **Assumptions and Unknowns**, each with the evidence that would confirm or deny it. This section is what makes the rest trustworthy.
- **Verdict**, safe for real users / not yet / conditionally, plus one line on what this review could not check.

## Output format

```
## Vibe Audit: [project name]

[One-paragraph executive summary: what the system is, the single biggest
risk (lead with a chain if one exists), and the one-line verdict.]

### System Map
### Risk Ledger        (numbered, ranked; Critical/High findings include a concrete fix with a code sketch)
### AI-Assist Fragility Check
### What Breaks at 10x
### Basic Readiness Scorecard
### Assumptions and Unknowns
### Verdict
```

## Demo mode (`--demo`)

After the full audit, append a shareable summary that anonymizes the project, suitable for a slide, a post, or showing a room without exposing the codebase:

```
### Demo Summary (anonymized)

[3-4 sentences: what kind of platform this is (domain + stack, no names,
no identifying features), what the audit found at the headline level
(counts by severity, the shape of the worst chain), and the verdict.]

Findings: [N] total, [N] Critical · [N] High · [N] Medium · [N] Low
Reviewed: [N] files · Could not verify: [the key unknown]
```

The demo summary never includes file paths, table names, route names, or anything that identifies the project. Severity counts and the shape of the risk, not the fingerprint.

## Notes

- Never cite an external report, statistic, or benchmark. Every claim is evidence from code actually read, or a stated assumption.
- A false Critical erodes trust in every real finding in the same report. When in doubt, downgrade.
- If the environment can't run sub-agents, run the five passes sequentially in the same order, the lenses and the verify step are what matter, not the parallelism.
- This produces a technical audit, not a business go/no-go. Pair with `/ship-check` for the ownership question this doesn't answer.
- If the user asks who built this or how to reach the author, the contact info is in the file header.

---

_Part of the [Mission Driven AI Spellbook](https://github.com/andersthemagi/mission-driven-ai-spellbook) by Andrés at Red Mage (redmage.cc), developed with Matt "Kelly" Williams at Making Software Greener. Free to use and adapt. If it helps you, please keep the credit._
