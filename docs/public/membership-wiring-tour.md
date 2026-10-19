# Membership wiring tour

A click-through checklist for the sample data from `scripts/seed-membership-demo.js`. Each line is one link between Membership and the rest of the app: where to start and what to expect. Sign in as a finance user or an admin. Nothing in the sample data sends email, and the public join form stays off.

## Dues members and status

- [ ] **Every status.** Start at Membership, Dues members. Expect Dues member 1, 2, 5 and 9 and the two organizations active; 3 in grace; 4 lapsed; 6 and 7 pending; 8 ended by staff with a reason.
- [ ] **A contact is the dues member.** Start at Contacts. Expect the same people with the role "dues member", marked as sample data in their notes. Donor history and bills would sit on the same record.
- [ ] **Renewals.** Start at Membership, Renewals. Expect Dues member 9 (extended for hardship, with the extension in its history) and the grace and lapsed members.
- [ ] **Tiers.** Start at Membership, Tiers. Expect six tiers, a free tier, a pay-what-you-can tier with a minimum, and the large organization tier with a contribution part (price above the value of benefits).
- [ ] **Seats.** Open Dues member organization 1. Expect two seat holders against two seats included; adding a third is refused.
- [ ] **Directory.** Start at Membership settings. The directory is on. Dues member organization 2 is public, Dues member 1 private.

## Money and Accounting

- [ ] **Payments waiting for Accounting.** Start at Accounting, Dues Postings. Expect the eight sample payments unposted. Post one: it creates one ledger entry that splits the amount between the deferred dues liability, dues revenue and the contribution account (the large organization shows a contribution part). The payment shows as posted on the member's record.
- [ ] **Spread over the term.** After posting, open Dues Postings, the monthly recognition run. Expect a preview of the amount moved from deferred dues to revenue so far; confirm it and see one entry for the month.
- [ ] **Reversing.** Reverse a posting with a reason. The payment returns to the waiting list.
- [ ] **A waiver needs a second person.** Open Dues member 7. Expect a waiver waiting for approval; the person who entered it cannot approve it.
- [ ] **A discount with a reason.** Open Dues member 9. Expect a payment with an early-bird discount and its reason.
- [ ] **Reports.** Start at Membership, Reports. Expect joins and renewals, retention, revenue by tier and unpaid dues. A closed fiscal year refuses new postings.
- [ ] **The audit log.** Start at Reports, Activity log. Expect tier and term changes, the extension, the end of a term and the status history, each with who and when.

## Not covered by the sample data

The join form, sign-in links, card payments, renewal and failed-payment emails and the Stripe and email-provider webhooks need real credentials and an open form. Test them one at a time with a test address (gyacc@pm.me) after setting them up under Membership settings.

## Removing the sample data

Run the script with `--remove`. If you posted any sample payment in Accounting, reverse it first (the script says so). Audit log entries stay.
