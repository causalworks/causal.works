'use strict';

const { buildReversingLines, postLedgerTransaction } = require('./ledgerPosting');

const LEDGER_RECODE_FIELDS = ['account_id', 'program_id', 'grant_id'];

function normalizeLedgerChanges(changes) {
  const out = {};
  for (const f of LEDGER_RECODE_FIELDS) {
    if (changes[f] !== undefined) out[f] = changes[f];
  }
  return out;
}

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
