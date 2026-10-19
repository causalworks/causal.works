# Audit of the Sponsorship and Membership builds (report only)

Read `README.md` in this folder first for how the platform is built; its rules are the standard you audit against. Then read `.agents/skills/vibe-audit/SKILL.md` on `main` and follow its method: evidence only, every finding cites a file and line, nothing is claimed that you did not read.

## Scope

Everything merged between commit `6921983` and the current `main`: `git diff --stat 6921983..origin/main -- server public scripts db` (about 14,000 added lines in 109 files): the Sponsorship build, its screen rework and sample-data script, and the Membership build. You have limited budget, so work in this order and stop when it runs low; say where you stopped.

1. **Public routes** (`server/organizational/public/`, `lib/publicLinks.js`, `lib/rateLimit.js`, the pages under `public/p/`): anonymous writes and reads; token creation, storage (hashed?), single use, expiry, revocation; whether any response reveals another contact, project or workspace; enumeration (does an unknown email or slug answer differently?); rate limit key and the `trust proxy` setting; honeypot and timing checks; CSRF on any state-changing public route; HTML or script injection from user-supplied text into pages and emails (merge fields, project and contact names, directory entries); open redirects; token appearing in a log line or a URL sent to a third party.
2. **Webhook routes** (payments and email provider): signature verification before parsing, replay and duplicate handling, what an unauthenticated caller can cause.
3. **Database access**: every new table has row-level security that actually isolates workspaces (and programs where relevant); the owner-rights SQL functions (`org_membership_workspaces`, `org_membership_message_event`, `org_allow_ledger_source`, `org_apply_sponsor_report_holds`, `org_generate_sponsor_quarterly_reports` and any others in migrations 344 to 365): `search_path`, who may execute them, whether a workspace user could reach another workspace through them.
4. **Money paths**: balance and fee rules, payment requests, two-person approval, overrides, recalls, closings, releases to a receiving entity; dues postings, recognition runs and reversals; double posting, posting into a locked fiscal year, debits not equal to credits, a refused rule bypassed by calling a route directly, an amount, status or id the client can set that the server should decide, negative or fractional cents, amounts above the balance by a race (two requests at once).
5. **Access guards**: every new staff route declares the right guard for its data class (README); program leads and board members cannot read or change what they should not; contact details and exports obey the same guards as Donors; the CSV exports and the year-end and statement outputs use the same filters as the screens.
6. **Documents and files**: download and delete paths for project and dues-member documents (path traversal, access by visibility, who can fetch a document of another workspace by id), uploaded file type and size limits, the PDF generation inputs (HTML injection into the PDF renderer).
7. **Privacy**: the public and private directory, statements, lead pages, and the audit log entries written by the new code (is anything sensitive stored in a log field or metadata, such as a token, a secret key or an email body?).
8. **Configuration**: secrets and keys read from the environment only, never logged, never returned by a route; the payment account credentials stored encrypted; test-mode and live-mode separation.

Also run `node scripts/audit-route-access.js` and confirm that every public and open route in `server/organizational/route-access-allowlist.json` added since `6921983` has a reason that is true when you read the handler.

## How to work

Use a throwaway test database as described in `README.md` (schema plus migrations 360 to 365, then 344 to 349 in that order). Run the existing tests (`TEST_DATABASE_URL=... node --test tests/`) and write short throwaway checks to confirm any finding you can reproduce; label each finding Confirmed (you reproduced it), Likely (read in the code, not reproduced) or Question. Do not change any file in the repository. Do not open pull requests. Do not push anything.

## Output (important)

The repository is public, so do not commit the report, do not write it to a file in the repository, and do not put it in a pull request or branch. Put the whole report in your final message in this session. Format: a short summary with counts by severity; then findings in severity order, each with a title, severity (critical, high, medium, low), status (Confirmed, Likely, Question), the file and line, what an attacker or a mistake could do in plain words, how to reproduce it in two or three lines, and the smallest fix. End with what you did not get to. Never include a real token, secret or personal email address in the report.
