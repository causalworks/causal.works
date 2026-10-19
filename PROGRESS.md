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
- M5: apply `db/migrations/348_membership_accounting.sql`; restart. In Membership settings set the deferred dues (liability), contribution and dues revenue accounts and the default program; have the accountant confirm the recognition choice before the first posting. Dues payments recorded before this change are listed in Accounting > Dues Postings to be posted.
- M4: apply `db/migrations/347_membership_messages.sql`; restart (the daily job starts with the server and runs at 13:40 UTC; it does not run at boot). Set `POSTMARK_WEBHOOK_TOKEN` and add a delivery and bounce webhook in Postmark to `/api/public/email/postmark/webhook` with the header `X-Webhook-Token` set to the same value. Review the default email texts in Membership > Emails before turning membership on in a live workspace, because the first run sends the notices that are due.
- M3: apply `db/migrations/346_membership_payments.sql`; restart. `POD_CREDENTIAL_ENCRYPTION_KEY` must be set (it already is where pod credentials work). In Stripe, add the webhook address shown in Membership settings for the events checkout.session.completed, invoice.paid, invoice.payment_failed, payment_intent.payment_failed, customer.subscription.deleted and charge.refunded; enter the test secret key and webhook secret, turn card payments on in test mode and try a payment, a renewal, a failure and a refund before switching to live. Turn on Stripe's customer portal for the card-update link.
- M2: apply `db/migrations/345_membership_join_requests.sql`; restart. Set `BASE_URL` so emailed links carry the full address. To open the join form, tick "Accept joins from the public form" in Membership settings; the page is `/p/<workspace>/join` and dues members sign in at `/p/<workspace>/account`. Emails need the live email key.
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

Branch `build/membership`, cut from `main` (rebased onto `main` after the Sponsorship merge). Spec: `build-specs/membership.md` on branch `cloud-specs`.

## Done
- M1 status rules: `server/organizational/lib/membershipStatus.js` (status, term dates in both year modes, renewal window, proration), table-driven tests in `tests/membership/status.test.js`.
- M1 migration `db/migrations/344_membership_core.sql` (in one transaction): settings, tier columns and `org_membership_tier_prices` (the tier's old single price moves there and the column is dropped), terms, seats, reshaped payments (kind, method, discount, approver, refund link, processor ref), templates, message log, `manage_membership` permission, copy of `org_members` to contacts (matched by email), the `dues_member` role, terms and payments; reminders move to the message log; old tables and types dropped. Tested by `tests/membership/migration.db.test.js`.
- M1 server: `lib/membership.js` (settings, prices, terms with payments, status for every dues member, the dues-member list, renewals), new guarded routes in `routes/membership.js` (old Router removed), write area and read areas in `requireWriteAccess.js`, `manage_membership` in `accessPermissions.js` and its label in Settings, `dues_member` writable and shown on the Contacts page; `banking.js`, `membershipDuesPayment.js`, `donors.js` and the attention feed read terms instead of `org_members`. Tests in `tests/membership/routes.db.test.js`.

- M1 screens: `public/organizational/membership.html` and `js/membership.js` rewritten (dues members list with filters and CSV export, record panel with terms, payments, seats and history and the actions, renewals, summary, tiers with dated prices and archive, settings). Board members see Summary and Tiers only. Checked in a browser at desktop and phone width. New badge and form classes in `organizational.css`.
- M1 pull request #10 from `build/membership-m1`.

- M2: migration 345 (`org_membership_join_requests`), `lib/membershipJoin.js`, public routes in `server/organizational/public/membership.js` (reusing `lib/publicLinks.js` and `lib/rateLimit.js`; all in the allowlist), staff join-request queue (approve, decline with reason), join form settings, pages `public/p/join.html`, `public/p/account.html` with `join.js`, `account.js`, `membership-pub.js`. Tests in `tests/membership/public.db.test.js`. Checked in a browser at phone and desktop width. Pull request #11 from `build/membership-m2` (stacked on #10).

- M3: migration 346 (`org_payment_accounts` with credentials encrypted the same way as pod credentials, `payment_provider_events`, payment settings, term fields for subscriptions and failed payments), provider interface in `lib/payments/` (Stripe over its HTTPS API, a fake provider for tests, shared signature check), `lib/membershipPayments.js` (account, checkout, card update, refunds, event handlers), webhook route `server/organizational/public/payments.js`, account-page checkout and card update, staff refunds through the provider, staff "Create invoice" through the existing Sales invoice route, settings screens. Tests in `tests/membership/payments.db.test.js`. Checked in a browser with the fake provider. Pull request #12 from `build/membership-m3` (stacked on #11).

- M4: migration 347 (`org_contact_email_prefs`, message subject, owner functions `org_membership_workspaces()` and `org_membership_message_event()`), `lib/membershipMessages.js` (default templates and edits, merge fields, which messages are due, sending through the log first, status history, bulk email), daily job `server/jobs/membership-daily-job.js` registered in `server/server.js` (13:40 UTC), staff routes for templates, preview, reset, message log and bulk email, public unsubscribe page and route, email provider delivery and open reports (`server/organizational/public/email.js`), Emails tab and record-page email list. `lib/sendPlainEmail.js` gained two optional arguments (open tracking, and returning the provider's message id); existing callers are unchanged. Tests in `tests/membership/messages.test.js` and `messages.db.test.js`. Checked in a browser. Pull request #13 from `build/membership-m4` (stacked on #12).

- M5: migration 348 (posting split columns on payments, `org_membership_recognition`, ledger source `membership_dues`), `lib/membershipAccounting.js` (split rules, posting, refund posting, reversal with a reason, recognition preview, run and reversal), routes `routes/duesPostings.js` (Accounting read to see, Accounting writer to post), Dues Postings tab in Accounting (shown when membership is on; page route `/organizational/o/:slug/dues-postings`), Banking's dues match now posts through the same split, `lib/membershipReports.js` (joins and renewals, retention, revenue by tier, unpaid dues by age, growth, why memberships ended; CSV), `lib/importPreview.js` (reusable new / changed / unchanged / duplicate / error preview) and `lib/membershipImport.js`, Reports and Import tabs. Status rule: a term ended by staff counts as ended from its end date. Tests in `tests/membership/accounting.test.js`, `accounting.db.test.js`, `reports.db.test.js`. Checked in a browser. Pull request #14 from `build/membership-m5` (stacked on #13).

## Next
- M6: directory (public and private, per-field opt-in), benefits and gated documents by active status, seats for organization tiers.

## Blocked or needs the owner

## Decisions to review
- A waiver is entered unapproved and counts only once a different person with membership write access approves it. Waivers create no ledger entry.
- A partly paid term stays pending. An unpaid term whose end date has passed shows as lapsed.
- A paid term that has not started yet (a new joiner paying ahead) shows as pending until it starts.
- Monthly proration applies only in fixed-year mode and only to joins, not to renewals that follow on.
- Status history and extensions are read from the audit log, not a separate table.
- The dues-member CSV export is limited to admins and finance, as the Donors export is.
- A refund is entered against one payment, up to what is left of it, and waits unposted for Accounting (M5).
- Matching a dues payment to a bank line in Banking still posts it, as before; the Dues postings tab (M5) replaces that.
- M2: a join is held in `org_membership_join_requests` until the email is confirmed, so an unconfirmed form never creates a contact. The submitted details are cleared once the contact and term exist (or the request is declined). Unconfirmed requests older than the two-day link are left for the M4 daily job to clear.
- M2: a confirmed email that matches a contact (main or additional email) joins that contact; only blank phone and address are filled in. If that contact already has a current term, the request is declined and the person is told to sign in.
- M2: the extra gift becomes a gift to confirm in Funding (`review_status = 'to_confirm'`, not posted, noted as not received yet). There is no gift intake function for a form, so it uses the same row shape as Funding's own queue.
- M2: sign-in answers the same for any email. The emailed link is single use for 30 minutes and is exchanged for a one-hour link scoped to that dues member; every use is logged. A dues member cannot change their email address on the page.
- M5: a payment's contribution part is its share of the term's contribution (price above the benefit value), split pro rata for part payments; it goes to the contribution account at receipt. The exchange part goes to the deferred dues liability in "spread" mode (and in "at receipt" mode when paid before the term starts), otherwise straight to dues revenue.
- M5: recognition is cumulative: each run moves (exchange posted so far × days elapsed ÷ term days) less what was already moved, so late payments and refunds catch up in the next run. Runs are one ledger entry per month (dated the month end), grouped by account and program; a run can only be reversed newest first.
- M5: reversing a dues posting posts a reversing entry and puts the payment back in the queue to be posted again.
- M5: the dues-member CSV import is for admins and finance, like the contacts import. Rows with errors block the whole import until fixed.
- M5: the growth report counts each month-end status from today's terms and payments (payments dated later are not removed).
- M4: status is worked out, not stored, so the daily job "moves statuses forward" by writing each change of a dues member's status into the audit log (table name `org_membership_status`), which is the status history.
- M4: messages are due inside a 7-day catch-up window after their date, so a missed day still sends but old notices do not. Renewal notices stop once the renewal is paid, and are not sent to terms renewing automatically by card; failed-payment notices stop when a payment succeeds. Welcome, renewal, grace and win-back emails honour unsubscribe; failed-payment notices do not.
- M4: changing a template's days can send that notice again for a term that already had it at the old days (the log key includes the days).
- M4: messages are plain text, so the email provider cannot report opens; delivery is reported. Opens would need an HTML version.
- M4: a bulk email is sent once per term per send key (the page makes a new key on each load), so a double click does not send twice.
- M3: the invoice code lives only in the Sales invoice route handler, so Membership prepares the lines (`POST .../terms/:id/invoice-draft`, which also adds the customer role the invoice route requires), the screen calls the existing `POST .../invoices`, then links the invoice to the term. Only people who can enter transactions in Accounting can create it. Payments on a linked invoice count toward the term; no Membership payment row is made for them. Note for the accountant check: a sent invoice posts a receivable, which rule 6 says billed renewals should not; invoices are only made when staff choose to.
- M3: a yearly card subscription charges on the anniversary of the first payment, not on the term's end date. The renewal term always follows on from the previous one; if the charge comes after the grace period, the dues member shows as lapsed until it arrives. Check this with real Stripe testing; anchoring the billing date to the term end may be wanted.
- M3: a monthly instalment term counts as paid while at least one instalment is in and no failed payment is older than 14 days.
- M3: refunds made in the provider's own dashboard arrive by webhook and are recorded with the reason "Refunded through the payment provider".
- M2: the optional challenge check is the shared one in public settings (`PUT .../public-settings`); like the lead page, the join and sign-in pages do not yet load a challenge widget.

## Testing
- `TEST_DATABASE_URL=... node --test tests/` runs everything; add `TEST_SCHEMA_SQL=<path to build-specs/schema.sql>` to run the migration copy test.

## After merge (owner actions per pull request)
- M5: apply `db/migrations/348_membership_accounting.sql`; restart. In Membership settings set the deferred dues (liability), contribution and dues revenue accounts and the default program; have the accountant confirm the recognition choice before the first posting. Dues payments recorded before this change are listed in Accounting > Dues Postings to be posted.
- M4: apply `db/migrations/347_membership_messages.sql`; restart (the daily job starts with the server and runs at 13:40 UTC; it does not run at boot). Set `POSTMARK_WEBHOOK_TOKEN` and add a delivery and bounce webhook in Postmark to `/api/public/email/postmark/webhook` with the header `X-Webhook-Token` set to the same value. Review the default email texts in Membership > Emails before turning membership on in a live workspace, because the first run sends the notices that are due.
- M3: apply `db/migrations/346_membership_payments.sql`; restart. `POD_CREDENTIAL_ENCRYPTION_KEY` must be set (it already is where pod credentials work). In Stripe, add the webhook address shown in Membership settings for the events checkout.session.completed, invoice.paid, invoice.payment_failed, payment_intent.payment_failed, customer.subscription.deleted and charge.refunded; enter the test secret key and webhook secret, turn card payments on in test mode and try a payment, a renewal, a failure and a refund before switching to live. Turn on Stripe's customer portal for the card-update link.
- M2: apply `db/migrations/345_membership_join_requests.sql`; restart. Set `BASE_URL` so emailed links carry the full address. To open the join form, tick "Accept joins from the public form" in Membership settings; the page is `/p/<workspace>/join` and dues members sign in at `/p/<workspace>/account`. Emails need the live email key.
- M1: apply `db/migrations/344_membership_core.sql`; restart. Rerun the demo snapshot: the demo restore inserts snapshot rows as they are, and the payments table now has an org column and new required fields. Each workspace that uses membership should check Membership settings (year mode, grace days) and give each tier a revenue account and program.
