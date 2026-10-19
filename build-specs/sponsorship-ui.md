# Sponsorship: screen structure, layout and sample data

Branch `build/sponsorship-ui`, cut from `main` (which already contains the whole Sponsorship build, S1 to S6). Read `README.md` in this folder first; its rules still apply. Migration numbers, if you need any: 366 to 369. One pull request per milestone (U1, U2, U3).

## Why

The Sponsorship screens work but sit on one long page: collapsible sections stacked in a column (applications, reports due, approvals, year-end sheet, grant releases, agreement templates) with settings at the very bottom, and a project list that is empty until a project exists. Nobody can see how the module is wired to the rest of the app. Two jobs: give the module a proper page and tab structure and a consistent layout, and add sample data that exercises the wiring so the owner can click through everything.

## Rules for the screens (the owner's standing preferences)

- Dense, quiet grids: click-to-edit cells, closed search panels, no chatty counters, rare fields behind a link, one text size. No column reordering. Plain lists.
- Use existing tokens and classes in `public/organizational/css/organizational.css`; new classes use the `organizational-` prefix; never put component classes in `tokens.css`; no one-off inline styles for layout.
- Follow the way Accounting and Budget already structure a module: a four-number strip at the top, a row of tabs under it, a gear at the right end of the tab row that opens the module's settings (settings are not a tab and not a section at the bottom of a page). Read `public/organizational/accounting.html` and its JS to copy the pattern rather than invent one.
- Every tab and every project sub-tab is addressable by URL (`?tab=` and `?project=<id>&view=`), so links from the dashboard, the compliance calendar and Gift Postings land in the right place.
- Controls a person cannot use are hidden and say who can change them (the `my-access` read and write maps already exist). The server still refuses.
- Works at phone width (16 px gutter, no horizontal page scroll, tables scroll inside their container).
- Wording: plain, "this workspace" or the organization's own name, never "Causal" as an actor; dues member, staff, board member vocabulary where relevant. No person names in sample data: roles or numbers.
- Do not rewrite working logic. Move and recompose the existing components; keep every route as it is unless a screen needs a small read route added.

## U1: page and tab structure

Top strip (four numbers, same style as the Budget and Accounting strips): money held for projects (sum of project balances), available to spend, fees due to be run, projects needing attention (on hold, negative, overdue report, agreement missing).

Tabs: **Projects**, **Money out** (payment requests and approved disbursements waiting, recalls), **Intake** (applications, approvals queue), **Reports** (calendar of reports due, year-end sheet, information returns), **Agreements** (templates, which projects lack a signed agreement). Gear at the right opens **Sponsorship settings** (fee accounts, thresholds, hold rules, statement day, public page and lead link defaults) in the module's settings pattern.

**Projects tab:** a dense grid, one row per project: name, model, status, lead, held, available, fee rate, next report due, flags (hold, negative, agreement, standing). Filters in a closed panel. A row opens the project page. An empty workspace shows one short line and the add button, not a stack of empty sections.

**Project page** (`?project=<id>`): header with name, status, model, lead, and the available balance; the same four-number idea for that project (received, fees, paid out, available). Sub-tabs: Overview (balance parts, the tie-out line, hold and standing), Money in (gifts tagged to the project, fee rule and fees, exemptions), Money out (requests, disbursements, releases, recalls, closing), Agreement and documents, Reports (calendar for this project, statements), Lead link and public page, History (audit log entries for this project). Actions that change money stay where they are today, behind the same guards.

Keep the add-project and intake forms as slide-in panels like the rest of the app.

## U2: layout polish

Make the module read as one piece: consistent headers, spacing, grid density, empty states, button placement, status chips, number alignment (money right-aligned, tabular figures), the same date format everywhere, long names truncated with a title. Fix anything that looks unfinished on the screens: a settings form of twelve fields in a stack should be grouped (fee accounts, approval thresholds, holds and reports, statements, tax thresholds) with plain labels and an unset account shown as a clear call to set it, not a field showing "Search not set…". Compare against the Accounting and Budget screens and match them.

## U3: sample data and a wiring tour

Write `scripts/seed-sponsorship-demo.js`:

- `node scripts/seed-sponsorship-demo.js --org <id>` prints what it would create (dry run). `--apply` creates it. `--remove` deletes only what the script created. It is safe to run twice. Every row it creates carries a marker (for example `seed:sponsorship-demo` in a notes or reference field) so removal is exact. It refuses to run if the workspace has no program, no bank account or no fee accounts, and says what to set first.
- It sets the workspace up as a fiscal sponsor (settings, fee accounts and programs from existing accounts; create the few accounts it needs, marked, if missing).
- It creates, through the same library functions the screens use (not by writing rows around them), a small realistic set: four projects at different stages (an applicant, an active comprehensive project, an active pre-approved-grant project with a receiving entity, one winding down); fee rules (percent, a tiered or minimum case, one exempt gift); gifts and a grant tagged to projects, some posted and some left unposted in Gift Postings, one untagged to trigger the review row; payment requests in every state (submitted, needs information, approved, rejected, paid), a disbursement above the second-approval threshold half approved, a recall, a hold with a reason, an overdue report that triggers the automatic hold, a signed agreement and one missing, documents of several types, an acknowledgment list partly done, an approvals-queue item, a closing in preparation, one monthly statement generated, a donor letter required and missing, a noncash gift released as property, a lead link (the token printed once to the console). Leave several things unposted on purpose so the owner can post them in Accounting and see the effect.
- No person names. Leads and entities are roles or numbers ("Project lead 1", "Receiving entity 2"). Emails use a test address passed on the command line (`--email`), default none; nothing is sent.
- Money amounts are plausible and round-ish; dates relative to today so the calendar, holds and statements make sense whenever it is run.
- Test it against a throwaway database built from `schema.sql` plus all migrations: apply, check counts, apply again (no change), remove (back to the start), and assert that the balance helper, the Accounting fee preview and the dashboard flags reflect the seeded rows.

Also write `docs/public/sponsorship-wiring-tour.md`: a one-page checklist for a person clicking through, one line per link between modules, saying where to start and what to expect: a gift tagged to a project appears in Gift Postings and, once posted in Accounting, in the project balance and the statement of activities as restricted income; the fee run preview in Accounting and its entry; a disbursement approved in Sponsorship appears in Accounting for posting and then in the bank register and the project balance; a recall; the compliance calendar items and the report-overdue hold; documents on the project in the Document Vault; the dashboard flags; the Funding gift tag; the contact record of a lead and an entity; the year-end sheet against the ledger by fund; the audit log. Plain words, no vendor names.

## Acceptance

`npm run audit:routes` and `node --test tests/` pass; every new route is guarded and allowlisted if needed; screens checked in a browser at desktop and phone width; no console errors; each pull request description lists screens changed and what to check; U3's description lists exactly what the owner runs after merge (the seed command for the chosen workspace, and how to remove it).

## Out of scope

New sponsorship features, new payment or email behaviour, changes to posting rules, the Membership build.
