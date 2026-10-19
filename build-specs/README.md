# Build specs: Membership and Sponsorship

Read this file first, then the spec for your module (`membership.md` or `sponsorship.md`). This branch is temporary and is deleted after the work is merged. Do not merge it.

## Rules for the work

1. **Branch and pull requests.** Work on a branch named `build/membership` or `build/sponsorship`, cut from `main` (not from this branch). Open one pull request per milestone listed in your spec, each against `main`, each small enough to review and each safe to merge alone. Do not push to `main`. Do not touch files outside your module except where the spec says so.
2. **Commit and push after every finished piece**, and keep `PROGRESS.md` in the repository root of your branch current: what is done, what is next, anything blocked. If your session stops early, another session continues from that file.
3. **You have no live database and no keys.** Build and test against a throwaway local Postgres (section "Test database"). Payment code goes behind a provider interface and is tested with a fake provider. Real payment-provider and email testing happen after merge, by the owner.
4. **Migrations.** Files go in `db/migrations/`, numbered inside your reserved range (Membership 344-359, Sponsorship 360-379), plain SQL, safe to run once, no data loss. Do not apply anything to a live database.
5. **Code comments:** only a short header per file saying what it is for, and section labels in long files. No comments that explain a change, give a reason, record history or cite research.
6. **Wording:** user-visible text says "this workspace" or the organization's own name. Never "Causal" as an actor. Never name another product or vendor in code, docs, tests, commit messages or UI text. The only product names allowed are integrations the app wires up: Stripe (payments) and Postmark (email). No invented personal names in sample or test data; use roles or numbers.
7. **Vocabulary.** Never the bare word "member". Use: *dues member* (a person or organization in an organization's own membership program), *cooperative org* (an organization belonging to the platform cooperative), *staff* and *board member*, *workspace user* (anyone who logs in to a workspace).
8. **Commit messages:** one short factual line; a body only when a future maintainer would need it. End with the co-author line your tool adds.

## How the platform is built (rules every route, table, list and export follows)

The system is one application and one database. Modules are screens and routes over shared tables, not separate systems. Node 20, Express 5, PostgreSQL, a vanilla JavaScript front end under `public/organizational/`.

- **Deny by default; every route declares who may use it.** Use the shared guards in `server/organizational/middleware/` (`requireOrgRole`, `requireWriteAccess(area)`, `requireReadAccess(area)`, `requireAccountingAccess`, `requireAccountingWriter`, donor access in `requireAccountingAccess.js`). A route open to every workspace user must be written down with its reason in `server/organizational/route-access-allowlist.json`. Run `npm run audit:routes` before every commit that touches routes; it must pass. Routes defined through an Express `Router` with one `router.use(...)` guard are not seen by the audit and are not acceptable for new work.
- **Data classes decide who may read.** Contact and donor details, giving and receipts: admin, finance, fundraising, and read-only holders of the `donor_details` permission. Ledger, bills, invoices, bank: Accounting access. Documents: by visibility. Board members are read-only. Program leads (role `program`) are limited to their programs.
- **Row-level security on every new `org_*` table** (the first migration of your range shows the pattern to copy from any recent `org_*` table: `ENABLE` and `FORCE ROW LEVEL SECURITY`, a policy using `current_setting('app.current_org_id')`, and a second program policy where the table has a program). The app connects as role `causal_app`; grant it only what it needs. Functions that run with owner rights: fixed `search_path`, execute granted to `causal_app` explicitly.
- **The module that owns a record owns changes to it, and only Accounting posts to the ledger.** Other modules create a pending or unposted record; a person confirms it inside Accounting. Follow the existing gift-posting and disbursement-posting code (`server/organizational/lib/giftPosting.js`, `disbursementPosting.js`, `ledgerPosting.js`, route `giftPostings.js`). Never post automatically from the originating module. Never keep two writable copies of one fact: use a foreign key and a status on the originating row.
- **Lists, their CSV exports, reports and dashboard figures read the same filters and helpers.** Put each derived rule (membership status, project balance) in one shared library file and use it everywhere. Voided amounts show zero via `lib/voidedDisplay.js`.
- **Reasons.** Anything that changes or reverses a posted or approved record requires a reason, marked with a star on the screen and enforced by the server. A field the screen calls required is required by the server too.
- **Audit log.** Settings changes, status changes, access grants, posting, voiding and contact changes call `logAudit` (`lib/auditLog.js`) with who and what changed.
- **Fiscal-year locks:** writes into a locked fiscal year are refused by the ledger; do not work around it.
- **Contacts.** People and organizations are one record each in `org_constituents`, with roles as rows in `org_contact_roles` (`lib/contactRoles.js`). Donor status is read from gifts, not stored. Do not keep a second copy of a name, email or phone in a module table.
- **Email.** Use `lib/sendPlainEmail.js` (Postmark). Reply-to is the workspace's configured reply address or contact email. Wording uses the organization's name. Every automated send is written to a log table first with a unique key so a rerun never sends twice.
- **Scheduled work** follows `server/jobs/recurring-schedule-job.js`: a `node-cron` job that calls an idempotent SQL function or library function, registered in `server/server.js`.
- **Design.** Use existing CSS tokens and classes in `public/organizational/css/organizational.css`; new classes use the `organizational-` prefix; never put component classes in `tokens.css`. Phone-width usability is required, and especially for public forms.
- **Dense, quiet screens.** Click-to-edit cells, closed search panels, no chatty counters, rare fields behind a link, uniform text size.
- **Demo snapshot rule.** A new NOT NULL column without a default on a table that the demo reset covers breaks the nightly reset. Give new columns defaults, or tell the owner in `PROGRESS.md` so the snapshot is rerun after merge.

## Public pages and links (new to the platform; build once, carefully)

No route yet accepts anonymous writes into workspace tables. Both modules need a few. Build them as one small shared module, `server/organizational/public/` (routes) plus `server/organizational/lib/publicLinks.js` and `lib/rateLimit.js`, in the Sponsorship milestone that needs it (S6), or in the first Membership milestone that needs it if that comes first. The other module reuses it; check `main` before writing your own.

- **Narrow routes.** Each public route resolves the workspace from the slug in the path, enters the organization context, and does exactly one job. It returns no internal ids beyond what the page needs and never lists records.
- **Allowlist.** Every public route is written in `route-access-allowlist.json` with its reason and the audit must pass.
- **Abuse limits.** A token-bucket rate limiter keyed by IP and by workspace (in-process memory is acceptable; there is no limiter today, so add one), a hidden honeypot field placed off-screen, a minimum time between page load and submit, and an optional server-verified challenge token when a workspace has configured one. For joining, the record is created as pending until the email address is confirmed by a link.
- **Links and tokens.** Random 32-byte tokens, only a hash stored, single use for sign-in links with a short expiry (30 minutes), longer-lived scoped links (to one project or one dues member) that can be revoked, every use logged. Never put a token in a log line.
- **Payment pages** use the payment provider's hosted checkout page, so card data never reaches this server (the simplest card-data compliance level). Confirmation comes only from the provider's signed webhook; verify the signature, deduplicate on the event id, and treat the browser return page as informational.

## Test database

There is no way to replay all migrations from an empty database (early migrations assume tables that no longer exist). Use the schema file:

```
createdb test_db
psql -q -v ON_ERROR_STOP=1 test_db < build-specs/schema.sql
for f in db/migrations/3[4-9]*.sql; do psql -q -v ON_ERROR_STOP=1 test_db < "$f"; done   # only your own new files
```

`schema.sql` is the live schema as of the date in the file's first line (structure only, no data; it includes migrations up to 343). Create the application role if it is missing: `CREATE ROLE causal_app LOGIN`. Run the application role's queries with `SET app.current_org_id = '<id>'` and `SET app.current_program_ids = '*'` the way the app does. Seed the rows your tests need yourself in the test (an organization in `coop_members`, a user, accounts, a program, a bank account).

Testing style: Node's built-in test runner (`node --test tests/<module>/`), no new test framework. Test the pure rules (status, balances, proration, fee calculation, deferral schedule) as plain functions. Test routes by loading the route module with a fake `app` that records handlers, a pool wrapper that sets the organization context, and a transaction that is rolled back at the end. Add a test script entry `"test": "node --test tests/"` in `package.json` in your first pull request if it is not there.

## What the owner does after merge (do not attempt)

Apply migrations to the live database, restart the app, rerun the demo snapshot if needed, connect real payment and email credentials, test on the real workspace with real data, and update the knowledge graph. List anything the owner must do for each pull request in the pull request description under "After merge".

## Checks required on every pull request

- `npm run audit:routes` passes; paste the summary line in the description.
- `node --test tests/` passes.
- Every new `org_*` table has row-level security (show the `\d` output or the policy list in the description).
- Grep your added lines for: the word "Causal" in user-visible text, vendor or product names, personal names, bare "member". Fix before opening the pull request.
- Wording of errors is plain and says what to do.
