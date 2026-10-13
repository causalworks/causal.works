# /vibe-audit, Test Data

Reference runs for calibrating the audit and improving finding quality. Add new runs here as the skill gets used in the wild.

---

## Run 001, Two-sided events marketplace (local repo, anonymized)

**Date:** 2026-07-15
**Input type:** Full local repository, read directly from disk
**Source:** A Next.js + Supabase two-sided marketplace connecting independent artists with event coordinators. Solo-built, pre-alpha, ~2 weeks of active build history.

**Scope note:** No `supabase/` migrations directory existed in the repo, so Row-Level Security policies could not be verified, every access-control finding below assumes the application layer is the only enforcement point until proven otherwise.

**Verdict:** Not ready to expose to real coordinators/vendors as-is.

**Risk Ledger (11 findings):**

| # | Finding | Severity | Category | Confidence |
|---|---|---|---|---|
| 1 | Event creation trusts client-supplied `group_id`, no ownership check before insert | High | Access | Strong evidence |
| 2 | Onboarding role assignment validated only in the UI (disabled radio button), not the server action | High | Access | Strong evidence |
| 3 | No server-side input validation on event creation, zod schema exists client-side only, server action types input as `any` | High | Input Safety | Strong evidence |
| 4 | Support tickets page fetches the current user but never uses it to filter, returns every open ticket to any logged-in user | Medium | Access | Possible concern (RLS unverified) |
| 5 | Unescaped search query interpolated into a PostgREST `.or()` filter string | Medium | Input Safety | Possible concern |
| 6 | Middleware's public-path allow-list is missing `/check-email` and `/error`, unauthenticated users get bounced back to `/login` before seeing either | Medium | Observability | Strong evidence |
| 7 | Raw Supabase error message passed to client on login failure, while the sibling password-reset flow explicitly avoids this for enumeration reasons | Medium | Observability | Strong evidence |
| 8 | Duplicate CI workflow files (one dead); the live one injects an unused `SUPABASE_SERVICE_ROLE_KEY` into a running process with no code that reads it | Medium | Deployment | Strong evidence |
| 9 | The only E2E auth test targets `/dashboard`, which doesn't exist in the app; Playwright config has no `baseURL` | Low | Maintainability | Strong evidence |
| 10 | Unguarded `console.log` of full `User` objects and submitted form payloads (contrasts with one correctly-guarded example elsewhere in the same codebase) | Low | Observability | Strong evidence |
| 11 | Identical profile-fetch query duplicated across three files instead of memoized once per request | Low | Maintainability | Strong evidence |

**Highest-value finding:** #1 and #2 chain together, a brand-new signup can self-assign `active_role: 'coordinator'` (finding #2), then immediately create events under groups they don't own (finding #1), because neither check exists at the server-action layer that actually writes to the database. Both fixes are narrow, mechanical diffs against files already fully read.

**Calibration notes:**
- The audit correctly declined to escalate findings #4 and #5 to Critical/Strong-evidence despite plausible severity, because the missing piece (live RLS policy, live PostgREST behavior) wasn't available to verify, logged as "Possible concern" instead. This is the intended behavior: confidence tracks what was actually checked, not what seems likely.
- AI-Assist Fragility Check surfaced a useful pattern the Risk Ledger alone wouldn't have: the same "is this user a coordinator for this group" logic is implemented three times with drifting completeness, and the one implementation that matters most (the actual database write) is the incomplete one. Worth watching whether this "duplicated-logic-where-the-real-write-path-is-the-weak-copy" shape recurs across future runs, if it does, it may be worth promoting to its own named finding pattern rather than living inside the general fragility check.

---

## Run 002, Static fine-arts portfolio site (demo mode)

**Date:** 2026-07-15
**Input type:** Full local repository, read directly from disk (~1,887 tracked LOC, ~22 files examined)
**Source:** A static portfolio site (file-based static-site framework) pulling its gallery from a third-party media CDN at build time. No login, no database, no server runtime.

**Demo summary (anonymized, the shareable block):**

> A static fine-arts portfolio site built on a modern file-based static-site framework, pulling its gallery from a third-party media CDN at build time. No login, no database, no server runtime, and no user input reaching privileged code, so the usual authorization and injection surface is essentially absent. The headline issue is an integration-scoping bug: the media-fetch call has its folder filter commented out, so the public gallery can render every asset in the connected media account rather than the one intended folder, a data-exposure that turns real only if that account is shared with private or draft assets. The rest is maintainability drift typical of AI-scaffolded code: a dead duplicate component importing a nonexistent module, debug logging left in against its own "remove in production" note, and comments describing behavior the code doesn't implement.
>
> Findings: 6 total, 0 Critical · 0 High · 2 Medium · 4 Low
> Reviewed: ~22 files · Could not verify: the contents of the connected media account and the production build mode

**Findings summary:**

| # | Finding | Severity | Category |
|---|---|---|---|
| 1 | Media-CDN fetch has its folder filter commented out, public gallery can render the entire connected account | Medium (High if account is shared) | Access / Observability |
| 2 | Dead duplicate gallery component imports a module that doesn't exist, latent build-breaker | Medium | Maintainability |
| 3 | Debug logging left in against its own "remove in production" comment | Low | Observability |
| 4 | Sort comment ("newest first") contradicts the code (ascending) | Low | Maintainability |
| 5 | Layout has a closing `</body>` with no opening tag | Low | Maintainability |
| 6 | README is unmodified starter boilerplate; required env vars documented nowhere | Low | Deployment |

**What this run taught the skill (applied to v3):**
- **Low-surface triage**, running five full lenses on a static brochure site mostly produces "N/A." The skill now triages in Phase 1: no server runtime + no untrusted input → narrow to build-time integration/secret scoping, third-party data exposure, and maintainability, and say why.
- **Execution model as a severity gate**, the same debug-log and external-fetch findings are Low at build time but higher per-request under SSR. The skill now requires determining static-vs-server-vs-client up front.
- **Negative evidence is valid**, two of the strongest findings here were about things that *aren't there* (a missing file behind a live import, a missing `<body>`). The skill now explicitly blesses absence-as-evidence rather than forcing it down to an assumption.
- **Certain-behavior / uncertain-blast-radius**, finding #1's behavior is provable but its impact depends on unseen account contents. The skill now rates by verified behavior and states the escalation condition in the finding.

---

## Run 003, Trading journal SPA (demo mode)

**Date:** 2026-07-15
**Input type:** Full local repository (~9,879 tracked LOC, ~20 files examined)
**Source:** A trading-journal SPA on React + Vite talking directly to a hosted Postgres/auth/storage backend with the public anon key. Client-only, static-hosted. Row-Level Security is the only real enforcement boundary.

**Demo summary (anonymized):**

> A trading-journal SPA built on React + a hosted Postgres/auth/storage backend, running entirely in the browser against a public API key, so row-level authorization is the only real defense. The audit found the per-user data isolation solid and consistent, with no data-breach chain; the real risks sit at the two seams that step outside that model: a serverless function that writes to a third-party CRM with no effective authentication and a wildcard CORS policy, and an account-signup "lockout" enforced only in client code and trivially bypassable against the auth endpoint. Supporting issues: a confidential-image store left world-readable, production console logging of user records, and a test suite that cannot run because no test runner is installed.
>
> Findings: 6 total, 0 Critical · 0 High · 4 Medium · 2 Low
> Reviewed: ~20 files · Could not verify: the live database's RLS policies and the deployed function's auth config

**Findings summary:**

| # | Finding | Severity | Category |
|---|---|---|---|
| 1 | Serverless CRM-lead function is world-callable with the public key + wildcard CORS; no per-user auth, reflects upstream error text | Medium (High if CRM is metered) | Access / Deployment |
| 2 | "Registration closed" enforced only client-side; auth signup endpoint still open | Medium | Access |
| 3 | Trade-screenshot bucket is public; confidential images served without signed URLs | Medium | Access / Observability |
| 4 | The one test file can't run (no test runner installed); no CI enforces lint/typecheck | Medium | Maintainability |
| 5 | Full trade payload logged to the production console (bypasses the repo's own dev-only logger) | Low | Observability |
| 6 | Live project ref + anon key hardcoded in a root maintenance script | Low | Deployment |

**What this run taught the skill (applied to v4):** The v3 execution-model gating proved decisive, it prevented three false-positive Critical findings (client-side ID filters, a client route guard, client-side validation) that are real bugs in a server app but correct under RLS here. Four refinements followed:
- **Client-side gate rule**, in a client-only SPA, a client-side gate is a finding *only* when nothing server-side backs it. This is the exact line separating the non-finding (a route guard behind correct RLS) from the finding (a signups flag with the auth endpoint still open).
- **Concentrated-risk triage**, the triage step previously only handled "risk absent" (static sites). It now also handles "risk concentrated": when the app body is genuinely low-risk, reallocate lens effort onto the few files that carry the exposure rather than running five even passes.
- **Platform-default absence**, when a missing config file means a platform default applies (no `config.toml` → default auth behavior), audit against that default as the operative behavior and log confirming the deployed setting as an assumption.
- **Blast-radius vs default-lower tiebreak**, the two rules could point opposite ways on the same finding. Clarified: default-lower is for uncertain *behavior*; when behavior is proven and only impact is uncertain, blast-radius framing wins, don't sink a proven bug to Low.

---

## Run 004, Consumer travel-booking platform (demo mode)

**Date:** 2026-07-15
**Input type:** Full local repository, ~113k tracked LOC, ~101k of it genuine (AI-generated) application source, ~14 files read closely + full migration/secret sweeps
**Source:** A consumer travel-booking platform: React SPA + serverless edge functions + Postgres with row-level security, card payments via a hosted gateway, flights via a third-party air API. Mixed execution model (untrusted browser + server functions + RLS).
**This run is the exemplar of the verbose-with-fix standard (v5): Critical/High findings ship a concrete remediation with a code sketch, not a one-liner.**

**Demo summary (anonymized, shareable):**

> A consumer travel-booking platform (React SPA + serverless edge functions + Postgres with row-level security, card payments via a hosted gateway and flights via a third-party air API). The audit found the data layer well-built, RLS enabled and correctly scoped on every sensitive table, no hardcoded secrets, admin actions verified server-side, but the checkout path computes each order's charged total from prices the browser submits rather than from the store's own price tables, and the payment step charges that client-derived total verbatim. A second, simpler variant lets the client name its own discount amount. Net effect: a guest can book real inventory for near-zero.
>
> Findings: 7 total, 1 Critical · 1 High · 1 Medium · 4 Low
> Reviewed: ~14 files closely across ~101k LOC of app source · Could not verify: live database state and whether the flight API runs in live or test mode

**Headline finding (full detail, modeling the verbose-with-fix standard):**

**Finding 1, CRITICAL · Access / Input Safety · Order totals are computed from client-submitted prices**
*Confidence: Strong evidence (verified by reading the code end to end).*

*(Code below is anonymized, generic names, not the real symbols/tables from the audited codebase. The vulnerability and the fix are the real ones.)*

- **What's happening:** The order-creation function prices the cart from values the browser sends, not from the database's own price tables. The payment function then charges that client-derived total verbatim.
- **Evidence:** The order function prices the client's cart items directly; its only catalog lookup fetches the item `id`, never the price. The shared pricing helper returns the client's unit price untouched under one metadata flag, and otherwise applies a markup that defaults to zero. The order's stored total is set from those numbers, and the payment function reads that stored total and charges exactly it. The payment function's amount-match check gives no protection, it only confirms the client's payment amount equals the client's order total; both are attacker-set.
- **Why it matters:** The database *has* authoritative pricing tables, checkout just doesn't consult them. A guest sets any price they like on real inventory.
- **How it's triggered:** POST to the public order endpoint (guest checkout, no auth) with a cart line at `unitPrice: 0.01`, then the payment endpoint with the matching amount. Books a real order for a cent.
- **The fix (server-authoritative pricing):** In the order-creation function, stop trusting the client's `unitPrice`. Look each line item's price up server-side by its catalog id, ignore the client's number and any client-set pricing-basis flag, and compute the total from the DB:
  ```ts
  // BEFORE, the browser's prices flow straight into the order total:
  const items = body.cart.items;                    // includes client-set unitPrice
  const total = sumLineTotals(priceCart(items));    // trusts those prices

  // AFTER, derive each price from the catalog server-side; discard the client's number:
  const ids = [...new Set(items.map(catalogIdOf).filter(Boolean))];
  const { data: rows } = await db
    .from("catalog_items").select("id, price").in("id", ids);   // authoritative prices
  const priceById = new Map(rows.map(r => [r.id, Number(r.price)]));
  const serverItems = items.map(it => {
    const price = priceById.get(catalogIdOf(it));
    if (price == null) throw new Error("Unknown item in cart");
    return { ...it, unitPrice: price };             // server price wins; client price ignored
  });
  const total = sumLineTotals(priceCart(serverItems));
  ```
- **How you'll know it's fixed:** An integration test that submits a cart with a tampered `unitPrice` and asserts the created order's stored total equals the DB-derived price, not the submitted one.

*(Finding 2, HIGH, is the same shape on discounts: the dollar amount is taken from `body.discountAmount` with no lookup against the discount table. Fix: re-validate the code server-side (exists / active / not expired / under max-uses / meets minimum) and compute the discount from the DB row, the platform already has a `validate-discount` function whose logic should be reused inside order creation instead of trusting the client.)*

**Why this run matters for the corpus:** it's the highest-severity finding across all audits, and it's **invisible if you only look at RLS**, the data layer is genuinely locked down, which is exactly why a database-focused review would miss it and call the app safe. The bug lives one layer up, in business logic that computes money from untrusted input. That's the thesis of the whole toolkit in a single finding.

**What this run taught the skill (applied to v5):**
- **Ship the fix, not just the finding**, Critical/High findings now require a concrete remediation with a code sketch specific enough to implement, matching the standard of a good professional audit. Finding the bug is half the job.
- **Large-repo reality check**, the "big repo = mostly vendored" assumption was false here; the bulk was genuine AI-generated app code. Phase 1 now confirms authored-vs-vendored with `git ls-files | grep node_modules` and reports the split rather than assuming.
- **Migration-heavy repos**, with 150+ timestamped migrations, the deployed DB state isn't knowable from the tree. The skill now cites the latest migration per object and logs live state as an assumption.

---

## Run 005, Mature open-source design platform (demo mode)

**Date:** 2026-07-15
**Input type:** Very large mature OSS repo (~420k tracked LOC, almost entirely authored). Scoped to backend trust boundaries: auth/session/tokens, team/project/file/share/comment authorization, media upload+serving, document import, SSRF, error handling, deployment defaults. Render engine, plugins, exporter, and UI internals scoped out and stated as such.
**Precise finding details (file:line exploit paths) are held out of this public record pending responsible disclosure to the project's security team.**

**Demo summary (anonymized):**

> A self-hosted, open-source collaborative design/prototyping platform: a client-side SPA over a single authenticated command-RPC backend on a JVM runtime, with server-side media processing, document import/export, and anonymous share links. The audit of the auth, sharing, upload, and deployment boundaries found a fundamentally strong posture, modern password hashing, authenticated-encryption tokens, parameterized queries, disabled XML external entities, a thorough per-hop SSRF blocklist, with one privilege-escalation gap and a cluster of share-link scope weaknesses. The worst chain: an "owner-protection" business rule is enforced in one place but missing in two sibling code paths, letting a mid-tier admin promote themselves to full owner. No critical, unauthenticated, trivially-exploitable vulnerability was found.
>
> Findings: 15 total, 0 Critical · 1 High · 6 Medium · 8 Low
> Reviewed: ~35 backend files across 5 lenses · Could not verify: the WASM render engine, plugins/exporter, and live per-deployment config

**Why this run matters for the corpus:** it's the honesty test. A mature, well-maintained codebase is exactly where a bad audit tool manufactures severity to justify itself. This run returned **0 Critical**, said the posture was strong in plain terms, and its single High is a real, low-complexity authorization drift whose fix is three lines, made obvious because a sibling code path *already implements the exact guard that's missing*. Same root pattern as the marketplace and travel-platform runs: **one business rule, several copies, the weakest copy is the one that matters.** That the pattern recurs across four unrelated codebases is itself the finding.

**What this run taught the skill (v5 held up; noted for future):**
- **The "downgrade when unsure" guidance actively fired and was correct**, the access pass rated a share-link comment gap "High/anonymous"; Phase-3 re-reading showed the endpoints require authentication, so it was corrected to Medium. The skill pushed toward re-verification rather than passing an inflated severity through. This is the single most important property for the tool's credibility, and it worked on the hardest repo.
- **Mature-OSS scoping**, the authored-vs-vendored split (written for AI-built repos) matters less here; the useful line is trust-boundary-bearing vs. out-of-scope-subsystem. Candidate skill note: "in a large hand-written codebase, scope by subsystem risk, not by authored/generated."
- **"By-design tradeoff" findings** (capability-URL assets, no-RLS-by-design) don't fit cleanly as bug or omission, candidate for an explicit confidence tag so they read as "flagged for confirmation," not as either.
- **Long sub-agent passes** should emit the ledger before deep-diving remaining files, so a truncated pass still returns structured findings.

---

## Run 006, Subscription coaching platform (demo mode)

**Date:** 2026-07-15
**Input type:** Large repo (~368k tracked, ~160k authored code, ~29k of it the server trust surface). No vendored code. Triaged: server surface audited densely, the 112k-LOC client SPA read only along the entitlement/paywall paths.
**Precise finding details are held out of this public record pending responsible handling.**

**Demo summary (anonymized):**

> A subscription mobile+web platform for a niche coaching vertical: a client-rendered SPA over a serverless API, a managed Postgres with row-level security, third-party auth, two payment processors, and a hosted video provider. The audit found the monetization boundary enforced almost entirely in the untrusted client: the premium media library is world-readable to any free account because a privilege-elevated database function and a public video-playback policy sit behind a browser-only paywall, and the checkout flow trusts client-supplied price and discount values. Around that core sit an unauthenticated destructive media endpoint, an unsigned provider webhook that drives privileged writes, and a payment webhook that fails open when a secret is unset. The worst chain is a pure business-logic bypass rather than a data breach.
>
> Findings: 16 total, 0 Critical · 7 High · 6 Medium · 3 Low
> Reviewed: ~45 files across the server trust surface · Could not verify: live RLS policies on the user and content tables, and which webhook/bypass secrets are set in production

**The recurring pattern, now confirmed across four unrelated codebases:** **one business rule, several copies, the weakest copy is the one that matters.** Here: "is this user paid" exists as a client gate, three Stripe-only gates, a SQL directory filter, and the webhook that sets the flag, no single owner, and the copy on the real content-read path is the missing one. This is the same shape as the marketplace's coordinator check, the travel platform's price computation, and the design tool's owner-protection guard. That it recurs everywhere is the single most transferable lesson in the whole corpus, and it's exactly what the AI-Assist Fragility Check is built to surface.

**Skill status:** v5 held up on the largest client repo. Confirmed observations (candidates for a future pass, not yet applied): the crux finding emerged from Phase-1 hot-file triage *before* the fan-out, suggesting client-heavy SPAs deserve more main-agent trust-boundary tracing up front; and the "missing config implies platform default" rule was load-bearing twice (establishing webhooks are publicly reachable, and keeping an RLS-default-deny unknown from being inflated into a false Critical).
