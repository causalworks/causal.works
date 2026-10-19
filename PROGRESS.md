# PROGRESS: Sponsorship build

Branch `build/sponsorship` (cut from `main`). One pull request per milestone, each from a branch `build/sponsorship-sN` pointing at the end of that milestone.

## Done
- S1 server: migration 360 (sponsorship settings, fee rules, posted fee periods, gift fee-exemption and review flags, ledger source `sponsor_fee`, helper `org_allow_ledger_source`), `lib/sponsorFees.js`, `lib/sponsorBalance.js`, `lib/sponsorFeePosting.js`, routes in `routes/sponsorship.js`, gift coding to the project fund in the existing posting paths, untagged-gift flag in Gift Postings, tests in `tests/sponsorship/`.

- S1 screens: project balance panel with fee line and tie-out, fee rule change and amendment form, fee exemptions on gifts, sponsorship settings section (Sponsored Projects page), "Run sponsorship fees" with posted entries and reversal, and the "No project?" review rows (Gift Postings). Checked in a browser at desktop and phone width.
- S1 pull request opened from `build/sponsorship-s1`.

- S2: migration 361 (payment requests, recalls, hold fields, second approval and override fields on disbursements, new project statuses, ledger source `sponsor_recall`, function `org_apply_sponsor_report_holds()`), `lib/sponsorMoneyOut.js` (every money-out rule and refusal), routes for requests, review, hold, lift, recalls and recall posting, daily job `server/jobs/sponsor-report-hold-job.js`, dashboard flag for negative or held projects, screens on the project page and in Gift Postings, tests in `tests/sponsorship/moneyout.db.test.js`. Pull request from `build/sponsorship-s2`.

## Next
- S3: intake, agreements, documents, reports calendar, acknowledgments, approvals queue, good standing.

## Blocked or needs the owner
- None.

## Decisions to review
- Available balance counts only money that is in the books (posted). Money recorded in Funding but not yet posted is shown on its own line.
- Fees are worked out per fiscal quarter. Tiered rates are marginal over the fiscal year. The quarterly minimum and a flat fee apply only to complete quarters.
- Pledges count as received when an installment is collected, not when the pledge is booked; the tie-out line names open pledges as a known difference.
- In-kind gifts are not counted as money received (noncash items are S4/S5).
- The workspace default fee rate and default model stay in `org_settings` (no second copy); `org_sponsor_settings` holds the rest.
- The old per-disbursement "admin fee retained" field is no longer counted in the balance; fees now come from the fee rule.
- The project list stays readable to every workspace user (Funding uses it to tag gifts). Balances, fee rules and tracking need sponsorship read access.

- S2: a request approval creates the disbursement and counts as its first approval; above the second-approval threshold a different person approves the disbursement. The person who entered a request or disbursement can never approve it.
- S2: the budget check compares this fiscal year's payments plus the request with the project's annual budget estimate (a warning only). `budget_line` is free text until projects have budget lines.
- S2: recalls post as an expense on the project's program (restricted) and income on the fee income program (unrestricted), using the recall accounts if set, otherwise the fee accounts.
- S2: program leads cannot load the contact list, so staff enter requests for now; lead links come in S6.

## Hooks left for later
- `tests/index.js` lets `node --test tests/` run on Node 22 as well as Node 20.

## After merge (owner actions per pull request)
- S1: apply `db/migrations/360_sponsor_funds_and_fees.sql`; restart. In each fiscal-sponsor workspace set the fee income account, fee expense account and fee income program in sponsorship settings before the first fee run. No new NOT NULL column lacks a default, so the demo snapshot needs no rerun.

- S2: apply `db/migrations/361_sponsor_requests_holds.sql`; restart (the daily hold job starts with the server and runs once at boot). Optionally set recall accounts in Sponsorship settings. No snapshot rerun needed.

## Testing
- Pure rules: `node --test tests/`.
- Database tests: build a throwaway database from `build-specs/schema.sql` plus `db/migrations/36*.sql`, then `TEST_DATABASE_URL=postgresql://user@host/test_db node --test tests/`. Without the variable these tests are skipped.
