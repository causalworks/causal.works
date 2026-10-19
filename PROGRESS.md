# PROGRESS: Sponsorship build

Branch `build/sponsorship` (cut from `main`). One pull request per milestone, each from a branch `build/sponsorship-sN` pointing at the end of that milestone.

## Done
- S1 server: migration 360 (sponsorship settings, fee rules, posted fee periods, gift fee-exemption and review flags, ledger source `sponsor_fee`, helper `org_allow_ledger_source`), `lib/sponsorFees.js`, `lib/sponsorBalance.js`, `lib/sponsorFeePosting.js`, routes in `routes/sponsorship.js`, gift coding to the project fund in the existing posting paths, untagged-gift flag in Gift Postings, tests in `tests/sponsorship/`.

- S1 screens: project balance panel with fee line and tie-out, fee rule change and amendment form, fee exemptions on gifts, sponsorship settings section (Sponsored Projects page), "Run sponsorship fees" with posted entries and reversal, and the "No project?" review rows (Gift Postings). Checked in a browser at desktop and phone width.
- S1 pull request opened from `build/sponsorship-s1`.

## Next
- S2: payment requests, approvals, holds and recalls, overdue-report hold job, dashboard flag.

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

## Hooks left for later
- `loadRequests` in `lib/sponsorBalance.js` reads `org_sponsor_payment_requests` once S2 creates it.
- `tests/index.js` lets `node --test tests/` run on Node 22 as well as Node 20.

## After merge (owner actions per pull request)
- S1: apply `db/migrations/360_sponsor_funds_and_fees.sql`; restart. In each fiscal-sponsor workspace set the fee income account, fee expense account and fee income program in sponsorship settings before the first fee run. No new NOT NULL column lacks a default, so the demo snapshot needs no rerun.

## Testing
- Pure rules: `node --test tests/`.
- Database tests: build a throwaway database from `build-specs/schema.sql` plus `db/migrations/36*.sql`, then `TEST_DATABASE_URL=postgresql://user@host/test_db node --test tests/`. Without the variable these tests are skipped.
