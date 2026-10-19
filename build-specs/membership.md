# Membership: build spec

Branch `build/membership`. Migration range 344-359. Budget guide: about half of the available cloud credit; stop at the end of a milestone rather than start one you cannot finish. Read `README.md` first.

## Purpose

A workspace runs its own membership program: people and organizations pay dues for a term, hold a tier, receive benefits, renew. In this app the member is a **dues member**: a contact in `org_constituents` that holds the role `dues_member`. Organizations and individuals are both dues members. The same contact can also be a donor, vendor or customer: one record, several roles.

## What exists today (replace; do not extend)

`server/organizational/routes/membership.js` (15 routes through a Router with one workspace-member guard and no data-class guard), tables `org_members` (own name, email, phone, address, tier, one period; unique email per workspace; 0 rows live), `org_membership_tiers`, `org_membership_payments`, `org_membership_reminders` (a log only), `lib/membershipDuesPayment.js` (posts to the ledger when a bank line is matched), the front end under `public/organizational/` for membership, and the contact role `dues_member` which exists in `lib/contactRoles.js` but is not yet writable.

Replace the old routes and `org_members` with the model below. A migration copies any existing `org_members` rows to contacts and terms, then drops `org_members`. There are no live rows, so keep the copy simple and tested.

## Decided rules

1. A dues member is one contact record; no module table keeps a second copy of name, email, phone or address. Several emails per contact are allowed (`additional_emails`).
2. A **term** is its own row: contact, tier, start date, end date, source, amounts. History is kept; the current term is derived.
3. **Status is derived by one helper** (`lib/membershipStatus.js`) and used by every list, export, report and the daily job: *pending* (term created, nothing paid, tier not free), *active* (paid, waived or free, and today inside the term), *grace* (term ended, a grace period set in settings still running, no renewal paid), *lapsed* (after grace), *ended* (a person with permission ended it, reason required). Staff may extend a term with a reason (hardship, gift membership); every extension is logged.
4. **Tiers** have: name, description, applies to (individual, organization, either), price, a lowest price and a suggested price for pay-what-you-can tiers, optional annual-budget bracket for organization tiers (suggested by the budget size the organization states), a free tier (price 0), seats included (organization tiers), benefits list, eligibility statement (a self-affirmation tick, not an approval), dated price changes (a price row with an effective date; terms keep the price they were sold at), archive instead of delete. All benefits are the same at every level unless a workspace lists otherwise.
5. **Year mode** is a workspace setting: rolling (term runs 12 months from the start date) or fixed year (for example 1 July to 30 June) with an open renewal window (renewals accepted from N days before the year starts, signup window setting) and proration for joining mid-year (none, monthly). One setting; both modes tested.
6. **Revenue recognition.** A tier has a *benefit value*; the rest of any dues payment is a contribution. Default: the whole payment is exchange revenue (benefit value = price). The exchange part is recognised evenly by day across the term; the contribution part at receipt. A workspace setting chooses *spread over the term* (default) or *at receipt*. Dues received before the term starts sit in a liability account until the term begins. **Billed but unpaid renewals create no ledger entry and no receivable.** The owner gets an accountant check before launch; leave the setting visible and the default easy to change. Receipts for payments with a contribution part state the portion that exceeds the value of benefits received.
7. **Posting is done in Accounting, never automatically.** A dues payment is an unposted record. A new Accounting screen (a "Dues postings" tab, built like the existing gift-postings queue) lists unposted payments and recognition entries; a person with Accounting write access reviews and confirms; that creates the ledger entry with source `membership_dues`, linked by `ledger_transaction_id`. Recognition entries are a computed preview ("Run recognition", like fixed-asset depreciation) and are posted only on confirmation. Reversals go through the ledger void with a reason.
8. **Waiving or reducing dues** is a payment row of kind `waiver` with an amount, a reason and an approver (not the person who created it). A refund is a payment row of kind `refund`, entered with a reason, linked to the original, and reversed in the ledger the same way as any posted record.
9. **Access.** Add write area `membership` to `requireWriteAccess` (admin, finance, fundraising) and manager permission `manage_membership` to `accessPermissions.js`; read follows the donor-and-contact class (`donor_details` holders read). Board members see the summary and the aggregate reports only, not contact details. Tier and settings changes: admin and finance. These are the only edits allowed to shared files outside the module besides the allowlist, sidebar link and the contact role list.
10. **Contact privacy.** Dues-member lists and exports use the same contact filters and guards as Donors. Exports exclude contacts the viewer may not read.

## Data model (create exactly these tables; adjust column details to fit the code)

- `org_membership_settings` (one row per workspace): year mode, fixed-year start (month, day), renewal window days, proration mode, grace days, approval required for joining, recognition mode, deferred-dues liability account, contribution revenue account, default dues revenue account, default program, directory fields allowed, join form on/off, form fields, extra-gift on/off, auto-renew default, challenge-token setting.
- Extend `org_membership_tiers`: applies_to, min and suggested price, budget bracket low and high, benefit value, seats included, eligibility statement and required tick, archived_at; add `org_membership_tier_prices` (tier, effective date, price).
- `org_membership_terms`: org, contact, tier, start, end, price sold at, contribution portion, source (staff, join form, renewal, import), status override and reason, extension count, invoice id (nullable), auto-renew flag, processor subscription reference.
- `org_membership_seats`: term, contact (a person), label, start, end.
- Reshape `org_membership_payments`: term and contact in place of member; kind (payment, refund, waiver); method (card, check, transfer, cash, other); amount; discount and reason; processor reference (unique, nullable); approver; posting status and ledger link as today.
- `org_membership_templates` (workspace, key, subject, body with merge fields, offset days, enabled) and `org_membership_messages` (term, contact, template key, offset, sent at, delivered; unique on term plus key plus offset so a rerun cannot send twice).
- `org_contact_email_prefs` (contact, unsubscribed at, scope). Receipts and failed-payment notices are transactional and ignore it.
- `org_membership_directory_optin` (contact, fields shown, public or private).
- `org_membership_recognition` (term, month, amount, ledger link; unique term plus month).
- Shared with Sponsorship, build once in the first migration that needs them: `org_public_links` (purpose, contact or project reference, token hash, expires, used, revoked), `org_payment_accounts` (provider, account reference, encrypted credentials using `lib/podCredentialCrypto.js` or the same method, mode live or test), `payment_provider_events` (provider, event id unique, received at, processed at).

All with row-level security. Do not store card numbers or any payment credential in plain text.

## Milestones (one pull request each)

**M1. Core model and staff screens.** Migrations for settings, tiers, terms, seats, payments, messages, templates; the contact role made writable; `lib/membershipStatus.js` with exhaustive tests; data copy from `org_members`; new guarded routes replacing the old router (tiers, settings, dues members as a filtered contact view, terms, record payment, extend with reason, end with reason, waive, refund, renewals list filtered by days to expiry, tier and last contact, summary); the staff screens (tiers, dues members list and a record page with history and status history, renewals, summary); audit log entries; allowlist and audit pass; tests for each rule above.

**M2. Public module and join, renew, update.** The shared public module from the README; join form (fields the workspace chooses, tier picker with suggested price by budget bracket, pay-what-you-can, optional extra gift routed to Funding as a pending gift through the existing gift intake, eligibility tick, honeypot, rate limit, email confirmation before the term becomes pending); renew form; sign-in link for dues members (single use, 30 minutes) leading to a small page to update details, see receipts and renew. No payment yet: payment shown as "pay by check or invoice" until M3.

**M3. Payments.** Provider interface with a fake provider for tests and a Stripe implementation behind it: hosted one-time checkout, hosted subscription for automatic yearly renewal (and monthly instalments as a setting), card update link, webhook endpoint (signature check, event-id dedupe, idempotent handlers: payment succeeded creates payment row and extends the term; payment failed starts the failed-payment series; subscription cancelled ends auto-renew), refunds from staff, test-mode switch per workspace, credentials entered in Settings and stored encrypted. Organizations pay by invoice or check: a staff action creates the Sales invoice for the term through the existing invoice code (do not duplicate invoice logic; call the existing library function or route handler; if neither can be called, stop and record the gap in `PROGRESS.md`).

**M4. Reminders and email.** Daily job (cron, idempotent) moves statuses forward and sends the scheduled series with defaults: a first renewal notice 60 days before the term ends, then 30, on the end date, and 15 days after (grace); a welcome message at joining; a win-back message about 60 days after expiry; failed-payment notices on day 0, 3 and 7 after a failure. Every offset and text is editable per workspace in a template editor with merge fields and a preview; the message log shows sent, delivered and opened where the email provider reports it; a series stops when a term is paid. Bulk email to a segment (tier, status, location, tag) with unsubscribe link and honour of the unsubscribe flag.

**M5. Accounting, reports, import.** The Dues postings tab and recognition run (rule 7), including the guards (`requireAccountingWriter`, fiscal-year locks) and tests for posting entries, reversal and a term that spans two fiscal years; reports: joins and renewals by period, retention rate, revenue by tier, aging of unpaid dues, member growth, lapse reasons (reason captured when staff end a term); CSV import with preview (counts of new, changed, unchanged, duplicates matched by email; nothing saved until confirmed) built as a reusable pattern.

**M6. Directory, benefits, seats.** Directory (public page per workspace and a private one for signed-in dues members; each contact opts in per field; email and phone never shown unless opted in); per-tier benefits list and gated documents by active status (use the Documents visibility mechanism; add a visibility value if needed); seats for organization tiers (add and end people under a term; seat count enforced).

## Out of scope for this build

Events and registration, ballots and voting, subsidised space booking, loan programs, member-to-member messaging. Do not build them. Note any hooks you left for them in `PROGRESS.md`.

## Acceptance checks per milestone

State in each pull request which of these you ran. Status helper: a table-driven test covering every date and payment combination in both year modes. Public routes: rate limit and honeypot refuse as designed; a token cannot be reused; no response leaks another contact's data. Payments: a replayed webhook changes nothing; a bad signature is refused; a failed payment never extends a term. Posting: debits equal credits, a term across two fiscal years splits correctly, a locked year refuses. Privacy: a board member cannot read contact details; a user without the permission gets the plain no-access message.
