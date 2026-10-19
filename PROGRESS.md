# PROGRESS: Sponsorship build

Branch `build/sponsorship` (cut from `main`). One pull request per milestone, each from a branch `build/sponsorship-sN` pointing at the end of that milestone.

## Done
- S1 server: migration 360 (sponsorship settings, fee rules, posted fee periods, gift fee-exemption and review flags, ledger source `sponsor_fee`, helper `org_allow_ledger_source`), `lib/sponsorFees.js`, `lib/sponsorBalance.js`, `lib/sponsorFeePosting.js`, routes in `routes/sponsorship.js`, gift coding to the project fund in the existing posting paths, untagged-gift flag in Gift Postings, tests in `tests/sponsorship/`.

- S1 screens: project balance panel with fee line and tie-out, fee rule change and amendment form, fee exemptions on gifts, sponsorship settings section (Sponsored Projects page), "Run sponsorship fees" with posted entries and reversal, and the "No project?" review rows (Gift Postings). Checked in a browser at desktop and phone width.
- S1 pull request opened from `build/sponsorship-s1`.

- S2: migration 361 (payment requests, recalls, hold fields, second approval and override fields on disbursements, new project statuses, ledger source `sponsor_recall`, function `org_apply_sponsor_report_holds()`), `lib/sponsorMoneyOut.js` (every money-out rule and refusal), routes for requests, review, hold, lift, recalls and recall posting, daily job `server/jobs/sponsor-report-hold-job.js`, dashboard flag for negative or held projects, screens on the project page and in Gift Postings, tests in `tests/sponsorship/moneyout.db.test.js`. Pull request from `build/sponsorship-s2`.

- S3: migration 362 (applications, agreement templates with two shared defaults, agreements and amendments, `org_documents.sponsor_doc_type` kept across versions by a trigger, reports calendar and reminder log, acknowledgments, approvals queue, project lead and receiving entity as contacts, report-driven holds, functions for quarterly report rows and reminders), libraries `sponsorDocuments`, `sponsorAgreements`, `sponsorReports`, `sponsorStanding`, `sponsorIntake`, routes in `routes/sponsorshipRecords.js`, daily job renamed `server/jobs/sponsor-daily-job.js` (report rows, holds, reminders), compliance calendar and dashboard items, screens. Pull request from `build/sponsorship-s3`.

- S4: migration 363 (statements log, donor letter on gifts, property releases on disbursements, statement claim function), `lib/sponsorStatements.js` (monthly statement PDF and email, scheduled run, year-end sheet and CSV), `lib/sponsorGifts.js` (donor letters, receipt wording, property releases), as-of-date filtering in the balance helper, property posting in `disbursementPosting.js`, sponsor wording in gift acknowledgments, statement step in the daily job, screens. Pull request from `build/sponsorship-s4`.
- Fees now accrue on posted receipts only; the fix was also pushed to the S1, S2 and S3 branches.

- S5: migration 364 (W-9 fields and receiving entity on projects, payee and grant agreement on disbursements, `org_sponsor_closings`, ledger source `sponsor_closing`), grant-model rules in `lib/sponsorMoneyOut.js`, `lib/sponsorGrants.js` (release history, information-return sheet, closing), closing in the balance helper and statements, ended projects take no new income, routes, Gift Postings rows for closings, screens; model labels now read "Comprehensive" and "Pre-approved grant". Pull request from `build/sponsorship-s5`.

- S6: the shared public module was not on `main` (or on `build/membership`), so it is built here: migration 365 (`org_public_links`, `org_public_link_uses`, `org_public_settings`, public page fields on projects), `lib/rateLimit.js`, `lib/publicLinks.js`, routes in `server/organizational/public/index.js` (the route audit now also scans that folder; every public route is in the allowlist), admin settings route `routes/publicSettings.js`, staff routes for lead links, pages `public/p/lead.html` and `public/p/project.html`. Pull request from `build/sponsorship-s6`.
- All six milestones are built. Pull requests: S1 #1, S2 #2, S3 #3, S4 #4, S5 #5, S6 #6 (stacked; merge in order).

## Next
- Nothing planned. Review feedback on the pull requests.

## Blocked or needs the owner
- Public rate limits key on `req.ip`. If the app runs behind a proxy, set Express `trust proxy` in `server/server.js`, or every visitor will share one limit.
- The optional challenge check is enforced by the server once a workspace saves a verify address and secret (`PUT .../public-settings`), but the lead page does not yet load a challenge widget. Add the widget for the chosen service before turning the check on, or lead forms will be refused.
- Set `BASE_URL` so lead links carry the full address.

## Decisions to review
- Available balance counts only money that is in the books (posted). Money recorded in Funding but not yet posted is shown on its own line.
- Fees accrue on money that is in the books (posted receipts), the same basis as the available balance and statements. Fees are worked out per fiscal quarter. Tiered rates are marginal over the fiscal year. The quarterly minimum and a flat fee apply only to complete quarters.
- Pledges count as received when an installment is collected, not when the pledge is booked; the tie-out line names open pledges as a known difference.
- In-kind gifts are not counted as money received (noncash items are S4/S5).
- The workspace default fee rate and default model stay in `org_settings` (no second copy); `org_sponsor_settings` holds the rest.
- The old per-disbursement "admin fee retained" field is no longer counted in the balance; fees now come from the fee rule.
- The project list stays readable to every workspace user (Funding uses it to tag gifts). Balances, fee rules and tracking need sponsorship read access.

- S2: a request approval creates the disbursement and counts as its first approval; above the second-approval threshold a different person approves the disbursement. The person who entered a request or disbursement can never approve it.
- S2: the budget check compares this fiscal year's payments plus the request with the project's annual budget estimate (a warning only). `budget_line` is free text until projects have budget lines.
- S2: recalls post as an expense on the project's program (restricted) and income on the fee income program (unrestricted), using the recall accounts if set, otherwise the fee accounts.
- S2: program leads cannot load the contact list, so staff enter requests for now; lead links come in S6.

- S3: quarterly reports follow the workspace's fiscal quarters and are due 30 days after each quarter ends. Reminders go to the project lead 7 days before the due date and once when overdue; a lead with no email is logged as skipped.
- S3: good standing is worked out, not stored: signed agreement, a report received in the last year (not needed in the first year), fees current (balance not negative and no fee quarter more than 45 days past its end left unposted), and a lobbying acknowledgment in the last year. Reactivating a lapsed project needs good standing, or an admin with a reason.
- S3: deciding applications, generating and recording agreements, marking reports received and deciding approvals are for the sponsor's staff (sponsorship writers who are not program leads). The person who asked for an approval cannot decide it.
- S3: agreement PDFs use the existing PDF code (needs Chrome on the server, as invoices do).

- S4: a statement shows money held: received and in the books, less fees charged, payments, recalls and other spending; amounts approved but not yet paid are a separate line. The statement email goes to the project lead (contact email, else the older lead email field) with replies to the workspace's reply address. Scheduled statements start from the month the workspace's sponsorship settings were created, on or after the statement day.
- S4: a donor letter is required above the threshold for checks, bank transfers and wires to a project. The template is a plain-text letter to download; the signed copy is uploaded and attached to the gift.
- S4: donated property can be released to its project only if it was booked as an asset; posting debits the project's expense account and credits that asset. Property releases are not counted as cash.
- S4: statements are stored as project documents of type correspondence.

- S5: under the pre-approved grant model every release (cash or property) goes to the project's receiving entity, needs the entity's W-9 on file, and needs a signed grant agreement attached before approval. Changing the receiving entity clears the W-9 unless a new one is given.
- S5: the information-return sheet groups posted releases by receiving entity for a calendar year (by posting date), cash plus property at value, and flags totals at or above that year's threshold (the latest earlier year's threshold if the year has none).
- S5: closing needs the project in winding down (or on hold), no pending payments, an amount no more than what is available, a reason, a destination, and for a new sponsor the written agreement. Accounting posts it; the project then ends. Cancelling a posted closing voids the entry and sets the project back to winding down.

- S6: lead links last 180 days by default (1 to 730), are scoped to one project and revocable; staff can email the link to the lead or copy it. The token is shown once and stays in the URL fragment; the page keeps it for the tab only and sends it in a header, so it never reaches server logs. Every use is logged with a hashed IP.
- S6: a payee typed by a lead becomes a contact (matched by exact name and kind first). Lead requests still need staff approval; the person-approval rules apply to staff only.
- S6: the public project page shows the name and public summary only, and only when turned on. The donate button is left out because the Membership payment provider code is not on `main`.

## Notes for the Membership build
- Reuse `lib/publicLinks.js` (`createLink`, `createSignInLink` for 30-minute single-use sign-in links, `checkLink`, `recordUse`, `revokeLink`, `guardForm`, `issueFormToken`, `enterWorkspace`), `lib/rateLimit.js` (`publicRateLimit`) and the `org_public_links` table (purpose key, `constituent_id` for dues members). Add Membership's public routes as another file in `server/organizational/public/`; the audit scans that folder.
- `org_public_settings` holds the optional challenge check, so Membership can use the same setting.
- Migration 360 adds `org_allow_ledger_source(text)`, which adds a ledger source without dropping the others; use it for `membership_dues` instead of rewriting the constraint.

## Hooks left for later
- Recurring gifts to a project: when Membership's provider supports subscriptions, a recurring gift should arrive as an ordinary gift tagged to the project (`org_gifts.sponsored_project_id`), so balances, fees and statements pick it up with no change here. The donate button belongs on `public/p/project.html` (it already shows a `donate_url` when the API returns one).
- `tests/index.js` lets `node --test tests/` run on Node 22 as well as Node 20.

## After merge (owner actions per pull request)
- S1: apply `db/migrations/360_sponsor_funds_and_fees.sql`; restart. In each fiscal-sponsor workspace set the fee income account, fee expense account and fee income program in sponsorship settings before the first fee run. No new NOT NULL column lacks a default, so the demo snapshot needs no rerun.

- S2: apply `db/migrations/361_sponsor_requests_holds.sql`; restart (the daily hold job starts with the server and runs once at boot). Optionally set recall accounts in Sponsorship settings. No snapshot rerun needed.

- S3: apply `db/migrations/362_sponsor_intake_agreements_reports.sql`; restart. Quarterly report rows start from the later of each project's start date and the date its workspace's sponsorship settings were created (the 360 migration date for existing sponsors), so existing projects are not held for old reports. Set `next_report_due` on a project if an earlier report is still owed. Email reminders need the live email key. No snapshot rerun needed.

- S4: apply `db/migrations/363_sponsor_statements_year_end.sql`; restart. Statement PDFs need Chrome on the server and emails need the live email key. Check the statement day in Sponsorship settings (default the 5th). No snapshot rerun needed.

- S5: apply `db/migrations/364_sponsor_grant_model_closing.sql`; restart. For each pre-approved grant project, name the receiving entity and attach its W-9 before the next release. No snapshot rerun needed.

- S6: apply `db/migrations/365_public_links.sql`; restart. Set `BASE_URL`, and `trust proxy` if behind a proxy. Test a lead link end to end on the real workspace. No snapshot rerun needed.

## Testing
- Pure rules: `node --test tests/`.
- Database tests: build a throwaway database from `build-specs/schema.sql` plus `db/migrations/36*.sql`, then `TEST_DATABASE_URL=postgresql://user@host/test_db node --test tests/`. Without the variable these tests are skipped.

---

# PROGRESS: Membership build

Branch `build/membership`, cut from `main`. Spec: `build-specs/membership.md` on branch `cloud-specs`.

## Done
- M1: status helper `server/organizational/lib/membershipStatus.js` (status, term dates in both year modes, renewal window, proration) with table-driven tests in `tests/membership/status.test.js`.
- Tests run with `node --test tests/` (`tests/index.js` from the Sponsorship build loads every test file).

## Next
- M1, not started yet: migration `db/migrations/344_membership_core.sql`, new routes, screens. Nothing of it is written.
- Plan worked out while reading the code (use or change freely):
  - Migration 344: `org_membership_settings` (one row per workspace, every column with a default); extend `org_membership_tiers` (applies_to, min/suggested price, budget bracket, benefit value, seats included, benefits list, eligibility statement and tick, archived_at) plus `org_membership_tier_prices`; `org_membership_terms`; `org_membership_seats`; reshape `org_membership_payments` (add org_id, term_id, constituent_id, kind, method, discount and reason, processor ref unique, approver, refund_of; replace the policy that joins `org_members` with an org_id policy); `org_membership_templates`, `org_membership_messages`; add `manage_membership` to the `org_access_permissions` permission check; copy `org_members` rows to contacts (match by email) with the `dues_member` role, terms and payments; then drop `org_membership_reminders`, `org_members`, their trigger functions and the unused types `membership_status` and `reminder_type`. RLS plus `GRANT ... TO causal_app` on each new table (pattern: migration 343).
  - Status history and extensions go to `org_audit_log` through `logAudit` (no extra table).
  - Waiver: created unapproved; a different person with membership write approves it; only approved waivers count (already how `coveredCents` works).
  - Guards: write area `membership` in `requireWriteAccess.js` (admin, finance, staff, fundraising, manager `manage_membership`); read areas `membership` (those plus `donor_details` and `manage_donors` holders; needs a small `permissions` list on the read-area rule) and `membership_summary` (adds board). Tiers and settings: `requireOrgRole(['admin', ...FINANCE_ROLES])`. CSV export: same as Donors export (admin and finance).
  - Files outside the module that read `org_members` and must move to terms when it is dropped: `routes/banking.js` (dues match candidates), `lib/membershipDuesPayment.js`, `routes/donors.js` (giving history), `lib/OrganizationalAttentionFeed.js` (renewals due).
  - Front end: `public/organizational/js/apiJson` redirects on 403 unless the code is `no_access`; pass `skip403Redirect` for write refusals (`no_write_access`).
  - Test database: run the schema as superuser; tests that check RLS must grant table rights to `causal_app` and `SET ROLE causal_app`, because `schema.sql` carries no grants.

## Blocked or needs the owner

## After merge (owner actions per pull request)
- M1 (when built): apply migration 344; rerun the demo snapshot, because the demo restore inserts snapshot rows as-is and new columns on covered tables would be null.
