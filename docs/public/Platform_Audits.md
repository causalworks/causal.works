# How we audit the platform

The Organizational app holds financial records, donor details, personnel data and organization documents. We check that it protects them, and that its screens and reports agree with each other, on a regular schedule and after changes. This page describes what we check, how, and what the first full audit covered.

## What we check

**1. Who can see and change what (access and privacy).**
Every API route is listed with the access check it declares. The rule is deny by default: a route that returns organization data must name who may use it, by role or by a specific permission. Where a route is open to every workspace user on purpose (a lookup list, a person's own account data), the reason is written down and reviewed. An automated check fails when a new route is open and its reason has not been recorded, so an unreviewed route cannot be added by accident. The most sensitive areas are also tested role by role: personnel and pay data, donor and contact details, gift receipts, the audit history, expense claims, bank and accounting connections, shared documents, and invitations.

**2. Organization isolation.**
Each organization's data is separated at the database level with row-level security, in addition to the checks in the application. Program leads are further limited to the programs they lead. An automated check lists any organization table that lacks this protection.

**3. Screens, exports and reports agree.**
A list, its CSV export, the reports built from the same records and the dashboard figures use the same filters, labels and rules, defined in one shared place so they cannot drift apart. Each audit compares them.

**4. The books are internally consistent.**
Every ledger entry balances. Bills, invoices, payments, gifts, disbursements and depreciation each match their ledger entries. Payables, receivables and the fixed asset register agree with the ledger. A document and its ledger entry are never allowed to disagree.

## How we audit

- **Automated checks.** A route access report and a set of data checks run against every test organization. They are repeatable, so each run can be compared with the last.
- **Review.** A person reads every item the automated checks cannot decide, such as each route that is open by design.
- **A dated log.** Each run records what was checked, what was found, what was fixed and what is still open.
- **Fix, then verify.** A fix is tested before it is released, and the check that found the problem is run again.
- **When.** On a regular schedule, and after any change that adds a route or table, changes a list or export, or changes how entries post to the ledger.
- **Rules for new work.** New routes, tables, lists and exports follow a written set of rules before they are built, so the same gaps are not recreated.

## The first full audit (October 2026)

- 413 API routes were enumerated. 308 already carried an explicit role or permission check.
- The other 105 were each reviewed. Where a route should not be open to every workspace user, a role or permission check was added. The rest are recorded with the reason they are open.
- Access was tightened for personnel and pay data, the audit history, expense claims, integration status, document sharing, invitations, grant reports and gift receipts.
- One organization table was brought under row-level security.
- Screens and exports were compared, and several were brought into agreement. Payables, receivables and the fixed asset register were reconciled to the ledger.

## Limits

The automated route check can see the checks declared on a route but not checks written inside a route's own code. We are moving those to the shared checks so the audit can see them. Audits reduce risk; they do not remove it.

## Related

- [Settings and permissions](Settings_and_Permissions.md): who can change what, and why.
