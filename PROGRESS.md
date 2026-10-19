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

## Next
- S5: pre-approved grant model releases and project closing.

## Blocked or needs the owner
- None.

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

## Hooks left for later
- `tests/index.js` lets `node --test tests/` run on Node 22 as well as Node 20.

## After merge (owner actions per pull request)
- S1: apply `db/migrations/360_sponsor_funds_and_fees.sql`; restart. In each fiscal-sponsor workspace set the fee income account, fee expense account and fee income program in sponsorship settings before the first fee run. No new NOT NULL column lacks a default, so the demo snapshot needs no rerun.

- S2: apply `db/migrations/361_sponsor_requests_holds.sql`; restart (the daily hold job starts with the server and runs once at boot). Optionally set recall accounts in Sponsorship settings. No snapshot rerun needed.

- S3: apply `db/migrations/362_sponsor_intake_agreements_reports.sql`; restart. Quarterly report rows start from the later of each project's start date and the date its workspace's sponsorship settings were created (the 360 migration date for existing sponsors), so existing projects are not held for old reports. Set `next_report_due` on a project if an earlier report is still owed. Email reminders need the live email key. No snapshot rerun needed.

- S4: apply `db/migrations/363_sponsor_statements_year_end.sql`; restart. Statement PDFs need Chrome on the server and emails need the live email key. Check the statement day in Sponsorship settings (default the 5th). No snapshot rerun needed.

## Testing
- Pure rules: `node --test tests/`.
- Database tests: build a throwaway database from `build-specs/schema.sql` plus `db/migrations/36*.sql`, then `TEST_DATABASE_URL=postgresql://user@host/test_db node --test tests/`. Without the variable these tests are skipped.
