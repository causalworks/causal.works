# Sponsorship wiring tour

A click-through checklist for the sample data from `scripts/seed-sponsorship-demo.js`. Each line is one link between Sponsorship and the rest of the app: where to start, and what you should see. Work top to bottom; some steps change what later steps show.

Before you start: run the script with `--apply` for the workspace, and sign in as a finance user or an admin. The sample projects are "Sample project 1" (comprehensive, active), "Sample project 2" (pre-approved grant), "Sample project 3" (winding down) and "Sample project 4" (an application in Intake).

## Money in

- [ ] **A gift tagged to a project, waiting for Accounting.** Start at Accounting, Gift Postings. Expect the $10,000 grant to Sample project 1 ("Grant (cash), awaiting deposit") and the donated garden tools (in-kind). Post the tools; the $600 then shows on Sample project 1, Money in, as "In the books".
- [ ] **A gift in Funding before the deposit.** Start at Sponsorship, Sample project 1, Money in. Expect the $1,500 card gift as "Not posted" and, on the Overview, "Received, not yet in the books". Record the deposit in Accounting, Transactions (Receive, apply the expected gift). The gift moves into "Received, in the books" and the available balance goes up by $1,500.
- [ ] **Restricted income in the books.** Start at Reports, Statement of activities, current year. Expect the posted gifts to the sample projects as restricted income on each project's own program ("Sample project 1: community garden fund" and so on).
- [ ] **A gift with no project.** Start at Accounting, Gift Postings. Expect a "No project?" row for Donor 3's $500 check. Choose a project, or mark it as the workspace's own gift.
- [ ] **The Funding gift tag.** Start at Funding, Donor 2. Expect the $8,000 bank transfer tagged to Sample project 1 and the $4,000 wire tagged to Sample project 2.
- [ ] **Fee exemption and the fee run.** Start at Sponsorship, Sample project 1, Money in. Expect the 7% fee, the $8,000 gift marked "Exempt", and the fee history behind its link. Then open Accounting, Gift Postings, "Run sponsorship fees": the preview lists each project and each quarter that has ended. Run it. The entries appear in Accounting, Transactions, and the "Fees due to run" number at the top of Sponsorship drops to zero.
- [ ] **A quarterly minimum fee.** Start at Sponsorship, Sample project 2, Money in. Expect "5% of money received, minimum $250.00 a quarter".
- [ ] **Donor letters.** Start at Sample project 1, Money in. Expect a missing letter for Donor 1's $25,000 check (with the template link) and a signed letter on file for Donor 2's transfer.

## Money out

- [ ] **Payment requests in every state.** Start at Sponsorship, Money out (the tab). Expect the submitted and "needs information" requests on Sample project 1. Open the project's Money out tab to see the approved, rejected and paid ones.
- [ ] **Second approval.** On Sample project 1, Money out, the $7,500 greenhouse kit waits for approval. It is above the second-approval threshold, so a different person from the one who approved the request must approve it.
- [ ] **An approved payment goes to Accounting.** Start at Accounting, Gift Postings. Expect the $2,500 tools payment for Sample project 1 and the $3,000 grant release for Sample project 2. Post one. It appears in Accounting, Banking (the bank register) and Transactions, and on the project its line changes to "Posted"; "Paid out" goes up.
- [ ] **A recall.** Start at Accounting, Gift Postings. Expect the $1,000 recall from Sample project 1. Post it. The project's available balance stays the same (the recall was already committed) and the fee income program gains $1,000 in the books.
- [ ] **Donated property released.** Start at Sample project 2, Money out. Expect the $2,400 donated laptop as a release waiting for approval, paid to Receiving entity 1 (W-9 on file).
- [ ] **A closing in preparation.** Start at Sponsorship, Money out. Expect the closing for Sample project 3 under Closings. Posting it in Gift Postings ends the project.

## Holds, reports and compliance

- [ ] **The report-overdue hold.** Start at Sponsorship, Projects. Expect Sample project 2 on hold with "Report overdue" (its report was due 45 days ago). The daily job adds quarterly report rows. When it adds this quarter's row, the hold lifts the next morning, because a new sponsorship setup has no earlier quarterly reports.
- [ ] **A hold with a reason.** Sample project 3 is on hold: "Final report and receipts under review". Payment requests are refused while it is on hold.
- [ ] **The compliance calendar.** Start at Compliance, Obligations. Expect "No signed agreement: Sample project 3" and the funder report for Sample project 1 due in 20 days. Each item opens the project on the right tab.
- [ ] **Reports and the statement.** Start at Sample project 1, Reports. Expect the funder report, last month's statement as a PDF, and "Make a statement" for any ended month.
- [ ] **The year-end sheet against the ledger.** Start at Sponsorship, Reports, Year-end sheet, this fiscal year. Expect one row per project; the Difference column compares each project with its program in the books (zero when they agree).

## Records and people

- [ ] **Agreements.** Start at Sponsorship, Agreements. Expect Sample project 3 listed without a signed agreement. Sample projects 1 and 2 show their signed copy under Agreement and documents.
- [ ] **Documents in the Document Vault.** Start at Document Vault. Expect the sample project documents (agreements, insurance, W-9, correspondence, donor letter) grouped under Sponsorship. Each one links back to its project.
- [ ] **Approvals queue.** Start at Sponsorship, Intake. Expect "Proposal to Funder 1" waiting for approval, and the Sample project 4 application in review.
- [ ] **Standing.** Start at Sample project 1, Overview. Expect "Not in good standing" until the lobbying acknowledgment is recorded and the fees are run. Four of the eight standing terms are acknowledged; the rest are behind "Standing terms acknowledged".
- [ ] **Contacts for a lead and an entity.** Start at Contacts. Expect "Project lead 1" to "Project lead 4", "Receiving entity 1" (vendor role) and the donors and funder, all marked as sample data in their notes.
- [ ] **Lead link.** Start at Sample project 1, Lead link and public page. Expect one active link. Open the link the script printed: the project lead sees the balance and can send a payment request.
- [ ] **The dashboard.** Start at the workspace dashboard. Expect items for Sample project 3 (on hold, no signed agreement) and Sample project 2 (on hold), each opening the project.
- [ ] **The audit log.** Start at Sample project 1, History, or Reports, Activity log. Expect the project's creation, fee rule, requests, approvals and hold changes, each with who and when.

## Removing the sample data

Run the script with `--remove`, using the database owner account (the one used for migrations). Everything the script made is deleted, including ledger entries. Audit log entries stay, because the audit log cannot be changed.
