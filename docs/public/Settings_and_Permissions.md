# Settings and permissions

How the Organizational app decides where a setting lives and who may change it. Decided 2026-10-09. Parts marked **Built** exist today; parts marked **Planned** are the agreed design and are being built in the order at the end.

## Where settings live

A setting is about one of five things. It lives at the narrowest level that owns the data it changes.

| About | Examples | Home |
|---|---|---|
| A person | Notifications, session, a person's own accounting-entry switch | My account |
| The organization | Name, EIN, fiscal year end, characteristics, who has access, security, integration credentials, which modules are switched on, delete | Organization settings |
| A module | Approval policy, bank rules, 1099 rules, grant tracker options, dues tiers | That module's settings |
| Structure shared by modules | Chart of accounts, programs, funds and restriction classes, fiscal years | Financial settings, Structure group |
| One program, sponsored project, bank account or grant | A sponsored project's fee and access | On that item |

Rules:

1. **The module that owns the behavior owns the setting.** Organization settings hold only what is true whichever modules are switched on. A credential such as a bank or accounting connection belongs to the organization, not to the first module that used it. **Built** for Budget and Accounting.
2. **Reach it from where you work.** Each module has the same gear icon in the same place, always visible, labeled with its scope (for example "Accounting settings"). Organization settings open from the organization name in the header as well as the sidebar, so they can be reached with the sidebar closed. **Built** for the Budget and Accounting gears and the header menu.
3. **A rule also links from the screen it changes.** The 1099 report links to the 1099 rules; Cash Coding links to bank rules; a report that depends on a mapping links to that mapping.
4. **Settings open as a page** with a breadcrumb, not a drawer, and are grouped in cards.
5. **Defaults flow down and overrides show where they come from.** Organization default, then module, then program or sponsored project. A value that is inherited says so.
6. **Everyone who can see a module can see its settings.** People who cannot change a setting see its value, greyed, with who can change it. This differs from buttons on a record, which are hidden when you cannot use them. **Planned**.
7. **Every settings change is logged** with who and when, and shown as history on the settings page. **Built** for 1099 settings; **Planned** elsewhere.
8. **Which settings appear follows the organization.** Switching on Membership or Sponsorship, or marking the organization a federal grant recipient, adds the matching settings; small organizations see few cards.
9. **Guidance is documentation, not a settings search.** If settings are in the right place a search is not needed; explanation goes in platform documentation and an FAQ (not written yet).

### Financial settings
All financial settings share one neutral home with its own groups: Structure, Accounting, Budget, Funding, Compliance. A module's gear opens it on that module's group. Groups you do not manage are visible but greyed, with who can change them. Someone working in Budget changes Budget settings only. **Planned.**

### Settings added 2026-10-11
- **Default accounts** (Accounting settings): the pledge receivable account a new pledge in Funding starts with, and the bank account new Receive, Spend and Transfer entries start on (with none chosen, the only bank account, or the one last used in the browser). Each entry can change them. Changed by finance or an admin; others see it greyed. **Built.**
- **Number display** (Financial structure, Display): negative amounts always show in brackets; an optional switch colors positive amounts green and negative amounts red (off by default). Changed by whoever may change the structure. **Built.**
- **State** (Organization settings, basics): required; drives the state notes shown beside personnel costs in Budget and beside 1099 and sales tax in Accounting. **Built** for the notes; state-driven setup of compliance is **Planned**.

### 1099 as an example
- The **report** is under Reports, Taxes, with year, per-vendor totals, a missing W-9 or tax ID check, CSV export and a link to the rules. **Built.**
- The **rules** (reporting on or off, a lower reporting amount than the legal one, what is counted and left out) are in Accounting settings, Vendors and 1099. **Built.**
- The **vendor facts** (W-9 received, tax ID, 1099 eligible, entity type) stay on the contact, under Edit compliance, open to admin and finance. **Built.**

## Who can change what

Roles today: admin, finance, program, fundraising, board. Extra read-only access can be given to a person (reports, all of Accounting, donor details), and an admin can make a person the manager of one area, ongoing or for 30 days, renewable. An admin posts accounting entries only while their own switch is on.

Rules:

- **Finance counts as admin for all financial areas, including fundraising.** Organization admin is broader (people, security, characteristics, integrations, module switches, delete). One person may hold both. **Built** for vendor compliance and posting; **Planned** for settings.
- **Managers.** A person can be made a manager of one area, for example Accounting settings, Funding settings or Membership settings, on top of their role. Same model as extra read-only access: per person, ongoing or 30 days renewable, logged, ends on its own. An outside bookkeeper can manage Accounting settings for a month without being finance; a membership coordinator can manage Membership settings without being admin. **Built for Budget, Personnel, Funding, Donors, Compliance and Sponsorship; Structure is planned.**
- **Funding and Donors are separate managers.** The Funding manager changes grants, grant allocations and funder organizations (contacts that are organizations) with their gifts and interactions. The Donors manager changes individual donors with their gifts and interactions, and can read them. A Funding manager without donor access sees funder organizations only, never individual donors. Fundraising, finance and admin change both. **Built.**
- **Shared structure has its own manager permission**, held by finance and admin by default. Changing it affects every module, so it is separate from managing any one module.
- **Program and project leads** work only within their own programs and projects. They can create and edit grants and scenarios for them, and manage a sponsored project they lead, including requesting a disbursement. A lead's edit to a budget line goes through a scenario and takes effect when a Budget manager accepts it. A lead can request a change to a grant's allocation; the Funding manager accepts it.
- **Personnel** (salary data) is admin and finance only. A Budget manager can be given the extra Personnel permission.
- **Compliance** is owned by finance by default.
- **Disbursements** are approved by admin or finance and never by the person who created them. A small organization can allow a board member to approve.
- **Board members** read; they do not change settings or records. In an organization of one or two people, a setting lets a board member act as an approver. (Design intent; the write checks that enforce it are being finished module by module.)
- **Two admins.** An organization with more than one person is encouraged, not required, to have two admins, so an emergency never depends on one login.
  Why: spreading admin control across two people removes a single point of failure. Common administrator guidance is two to four admins, because only an admin can reset another admin's password, so a second one covers a lockout, and no more than four because each extra admin widens the exposure. Nonprofit guidance gives the reason in people terms: no single point of dependency on one leader, and never one shared login, which also leaves no record of who changed what. We did not find a formal nonprofit standard that names key-person dependency as a control, so this rests on that guidance and on common administrator practice.

## Cross-module rule: who may change or post financial records

Other modules use shared structure at four levels. Only the last touches the books.

1. **Choose.** Pick a program, account or fund from a list. Needs only the right to see the list.
2. **Assign inside your own record.** Funding gives a grant a program or a default revenue account. This changes that module's record, not the structure and not posted entries. It does change where future budget lines and postings land, so it belongs to the Funding manager, not to everyone with access.
3. **Change the structure.** Add, rename or retire programs, accounts, funds. Structure managers only. An account or program with activity cannot be deleted.
4. **Post or change financial records.** Accounting only. Other modules create pending items; an accountant reviews and posts. **Built.**

### Gift Postings, the model for level 4
- Funding (Donors, Grants) records a gift. Funding never posts to the ledger.
- In-kind gifts and unconditional pledges appear in Accounting, Gift Postings, as unposted. Intentions and conditional pledges are held in Funding and do not appear until they become unconditional. An accountant checks accounts, program and restriction and posts; only then does a ledger entry exist and link back to the gift.
- A cash grant has no Post button, deliberately, because posting would invent cash. It is matched to the real deposit in Banking, or linked to an entry already coded from the bank when the deposit arrived first.
- Ordinary cash gifts are not in this queue; they reach the books through bank coding.
- **Built:** a Receive entry credited to contribution revenue creates a suggested gift in Funding, to confirm; Receive also recognizes expected pledge installments, grant gifts and gifts recorded in Funding.
- **Not built:** a deposit coded in Banking before the gift is entered in Funding does not yet offer Funding a ready-made gift. Today an accountant links the entry to a gift that already exists.

Write access in other modules (budget, personnel, grants, sponsored projects, compliance) is being finished module by module against a who-may-write-what matrix. Posting to the ledger is already limited to admin and finance.

## Write permissions: status
**Built (2026-10-09, phase A):** every write route in Budget (lines, scenarios, schedules, insurance, indirect costs, actuals), Personnel, Funding (grants and allocations), Compliance, Sponsorship and setup checks the roles above and refuses everyone else with a plain message. Program leads are limited to records under their own programs. A grant with entries, bills, claims or bank rules attached cannot be deleted by anyone; a grant with only gifts, allocations or budget lines can be deleted only by finance or an admin. A disbursement cannot be approved by the person who requested it.
**Built (phase B, step 1):** manager permissions. An admin can make a person the Budget, Funding, Compliance or Sponsorship manager (Personnel is an extra for a Budget manager), ongoing or for 30 days, with a reason; a manager can change that area's records and a Budget manager can promote a scenario.
**Built (phase B, step 2):** a program or project lead can ask for a change to how a grant is split to their program (grant panel, Allocation requests); someone who manages Funding accepts, which applies it, or declines with a reason. Both are logged.
**Built (phase B, step 3):** a program lead can change only the scenarios they created; a Budget manager, finance or an admin accepts a lead's work by promoting the scenario.
**Built (phase B, step 4):** a small organization (two or fewer admin and finance users) can let a board member approve disbursements (Organization settings, Extra access); nobody can approve their own request. When an organization has more than one person but one admin, Organization settings suggests a second admin.
**Built (phase B, step 5):** pages hide the controls a person cannot use (Budget, Personnel, Scenarios, Funding and allocations, Compliance, Sponsorship) and say who can change them, instead of showing a refusal after the click.

## Build order
1. **Built (2026-10-09):** Accounting has the same gear as Budget and a settings page with Periods and closing (fiscal-year lock and reopen), Controls (approval policy, links to expense-claim approval, entry access), Vendors and 1099, Banking (links) and Where your books live. Approval policy and fiscal-year lock are open to admin and finance; everyone with Accounting access sees them, greyed if they cannot change them. Board designations stay under More until the shared Structure page exists.
2. **Built (2026-10-09):** the organization name in the header opens a menu with Organization settings, Organization home and Switch organization.
3. **Built (2026-10-09):** a 1099 report page under Reports, Taxes, linked both ways.
4. Reports index grouped by purpose, with favorites and a find box.
5. Shared Structure page.
6. Manager permissions and greyed read-only settings.
7. Settings history on each settings page.

## References
- Comparable products separate personal, workspace or team, and project settings; project settings are reached from the project, and a higher level either sets a default or enforces a limit on lower levels. (Checked against vendor documentation; not independently verified.)
