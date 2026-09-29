'use strict';

/**
 * Find & Recode — bulk reclassification of posted General Ledger transactions. This is an
 * Accounting tool, not a Budget tool (an earlier pass of this file also covered
 * org_budget_lines; removed 2026-09-16 after the user clarified scope -- Xero's Find & Recode
 * has no budget concept, it only ever touches posted GL transaction lines, so budget-line bulk
 * editing belongs in a separate future tool, not this one).
 *
 * v1 (programRecode.js, 2026-09-16) is entity-scoped: "move everything belonging to program A
 * to program B" across several planning-data tables. This is a different tool: a filter-based
 * search over individual posted ledger lines (server/organizational/lib/ledgerSearch.js) with a
 * select-and-bulk-recode flow, modeled on Xero's actual Find & Recode -- researched via
 * screenshots and a detailed feature writeup (2026-09-16), not guessed.
 *
 * Real Xero Find & Recode only ever touches *coding* fields (account, tax rate, contact,
 * tracking category) and never the amount, and for already-reported transactions offers two
 * distinct modes: "recode source transactions" (edits the original in place) or "recode with a
 * manual journal" (leaves the original untouched and posts a new balanced adjusting journal
 * instead). This codebase already has an equivalent, stricter rule for the same situation:
 * bill/invoice line fields freeze once a document is approved (`bills.js`'s submit handler),
 * correction requires a credit/debit note, not an in-place edit. So this tool offers only the
 * "manual journal" mode -- never in-place -- reusing `ledgerPosting.js`'s
 * `postLedgerTransaction()` (balance/FY-lock/posting-account triggers already enforced there)
 * and `buildReversingLines()` (already used for transaction voiding) to construct a correcting
 * journal: one reversing line per selected line (same coding, debit/credit swapped, cancels the
 * old classification) plus one applying line (new coding, original debit/credit side). The pair
 * is naturally balanced, so the whole batch balances regardless of how many lines are selected.
 *
 * Recodable fields are Account, Program/Activity, and Grant -- our nearest analogs to Xero's
 * Account and Tracking Category; there's no tax-rate or contact-on-a-ledger-line concept in
 * this codebase's model (Contact recoding is also "source method only" in Xero itself -- not
 * available via the manual-journal mode we're limited to either), so both are out of scope.
 * The correcting journal always posts dated today (the currently-open fiscal year), never
 * backdated into the original's period -- standard correcting-entry practice, and it sidesteps
 * the fiscal-year-lock trigger entirely rather than needing to special-case it.
 *
 * System/control accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims
 * Payable) are excluded from the search step entirely (see ledgerSearch.js) and rejected as a
 * recode target here -- matching Xero's documented restriction that blocks direct recoding of
 * system accounts.
 */

const { buildReversingLines, postLedgerTransaction } = require('./ledgerPosting');

const LEDGER_RECODE_FIELDS = ['account_id', 'program_id', 'grant_id'];

function normalizeLedgerChanges(changes) {
  const out = {};
  for (const f of LEDGER_RECODE_FIELDS) {
    if (changes[f] !== undefined) out[f] = changes[f];
  }
  return out;
}

/**
 * True if the given account_id is a system/control account this tool must never recode into.
 * Mirrors the six flags org_accounts already carries for exactly this kind of restriction
 * elsewhere in the app (posting-account triggers, bill/invoice constituent checks, etc.) --
 * no dedicated "fixed asset account" flag exists in this schema (fixed assets link to regular
 * accounts via org_fixed_assets.asset_account_id/etc., not a boolean tag), so that one Xero
 * restriction (Fixed Assets, Tracked Inventory) has no enforcement here -- a disclosed gap, not
 * a silent one.
 */
async function isSystemAccount(pool, orgId, accountId) {
  const r = await pool.query(
    `SELECT is_cash_account, is_system_ap_account, is_system_ar_account,
            is_system_clearing_account, is_system_contribution_revenue_account,
            is_system_expense_claims_payable_account, is_system_unallocated_receipts_account
     FROM org_accounts WHERE org_id = $1 AND id = $2`,
    [orgId, accountId]
  );
  const a = r.rows[0];
  if (!a) return false;
  return !!(
    a.is_cash_account || a.is_system_ap_account || a.is_system_ar_account ||
    a.is_system_clearing_account || a.is_system_contribution_revenue_account ||
    a.is_system_expense_claims_payable_account || a.is_system_unallocated_receipts_account
  );
}

/**
 * Loads the selected posted ledger lines and summarizes what a correcting journal would move --
 * no unique-constraint conflicts are possible here (org_ledger_lines has none), so this is
 * purely informational: totals, line count, and a hard check that nothing outside `status =
 * 'posted'` slipped into the selection (a voided or pending-approval line has no "coding" worth
 * correcting via a new journal).
 */
async function previewLedgerRecode(pool, orgId, lineIds, changes) {
  const norm = normalizeLedgerChanges(changes);
  const r = await pool.query(
    `SELECT l.id, l.account_id, a.code AS account_code, a.name AS account_name,
            l.program_id, p.name AS program_name, l.grant_id, g.name AS grant_name,
            l.debit_cents, l.credit_cents, t.status, t.transaction_date
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     JOIN org_programs p ON p.id = l.program_id
     LEFT JOIN org_grants g ON g.id = l.grant_id
     WHERE t.org_id = $1 AND l.id = ANY($2::int[])`,
    [orgId, lineIds]
  );
  const rows = r.rows;
  const notPosted = rows.filter((row) => row.status !== 'posted');

  let targetIsSystemAccount = false;
  if (norm.account_id) {
    targetIsSystemAccount = await isSystemAccount(pool, orgId, norm.account_id);
  }

  const totalCents = rows.reduce((s, row) => s + Number(row.debit_cents || 0) + Number(row.credit_cents || 0), 0);
  return {
    rows,
    rowCount: rows.length,
    totalCents,
    notPostedCount: notPosted.length,
    notPostedIds: notPosted.map((row) => row.id),
    targetIsSystemAccount,
    hasConflicts: notPosted.length > 0 || rows.length === 0 || targetIsSystemAccount,
    fieldsChanged: Object.keys(norm),
  };
}

/**
 * Posts a correcting journal for the selected lines: a reversing line (old coding, swapped
 * debit/credit) plus an applying line (new coding, original side) per selected line. Never
 * touches the original org_ledger_lines rows. Delegates balance/FY-lock/posting-account
 * validation entirely to `postLedgerTransaction()` -- this function only shapes the two line
 * arrays and describes the change in the memo.
 */
async function executeLedgerRecode(pool, orgId, userId, lineIds, changes, transactionDate) {
  const norm = normalizeLedgerChanges(changes);
  if (norm.account_id && (await isSystemAccount(pool, orgId, norm.account_id))) {
    return {
      httpStatus: 400,
      body: { error: 'System accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims Payable) cannot be a recode target.' },
    };
  }

  const r = await pool.query(
    `SELECT l.id, l.account_id, l.program_id, l.grant_id, l.donor_restriction_class::text AS donor_restriction_class,
            l.board_designation_id, l.debit_cents, l.credit_cents, l.line_memo
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     WHERE t.org_id = $1 AND l.id = ANY($2::int[]) AND t.status = 'posted'`,
    [orgId, lineIds]
  );
  const originalLines = r.rows;
  if (originalLines.length === 0) return { httpStatus: 400, body: { error: 'No postable lines selected' } };

  const reversingLines = buildReversingLines(originalLines);
  const applyingLines = originalLines.map((l) => ({
    account_id: 'account_id' in norm ? norm.account_id : l.account_id,
    program_id: 'program_id' in norm ? norm.program_id : l.program_id,
    grant_id: 'grant_id' in norm ? norm.grant_id : l.grant_id,
    donor_restriction_class: l.donor_restriction_class,
    board_designation_id: l.board_designation_id,
    debit_cents: l.debit_cents,
    credit_cents: l.credit_cents,
    line_memo: l.line_memo,
  }));

  const changeDesc = Object.keys(norm)
    .map((f) => f.replace('_id', ''))
    .join('/');
  const result = await postLedgerTransaction(pool, {
    orgId,
    userId,
    transactionDate,
    memo: `Recode: ${changeDesc} correction for ${originalLines.length} line${originalLines.length === 1 ? '' : 's'}`,
    payee: null,
    referenceNumber: null,
    source: 'recode',
    lines: reversingLines.concat(applyingLines),
  });
  return result;
}

module.exports = { previewLedgerRecode, executeLedgerRecode, isSystemAccount };
