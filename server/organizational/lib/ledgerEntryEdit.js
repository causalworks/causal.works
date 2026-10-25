'use strict';

// Rules for editing a posted ledger entry: which entries can change, what a reconciled or system-created entry keeps fixed, and the account facts those rules read.

const { isFiscalYearLocked } = require('./ledgerPosting');

const EDITABLE_SOURCES = new Set(['manual', 'bank_reconciliation']);
const LINKED_SOURCES = { bill_approval: 'bill', invoice: 'invoice', expense_claim_approval: 'expense claim', gift_in_kind: 'gift', pledge_commitment: 'gift' };

const SOURCE_NOUN = {
  bill_approval: 'a bill', bill_payment: 'a bill payment', invoice: 'an invoice', invoice_payment: 'an invoice payment',
  expense_claim_approval: 'an expense claim', expense_claim_payment: 'an expense claim payment',
  gift_in_kind: 'a gift', gift_reclassify: 'a gift', pledge_commitment: 'a pledge', pledge_accretion: 'a pledge',
  fixed_asset_depreciation: 'fixed assets', fixed_asset_disposal: 'fixed assets', recode: 'Find and recode',
  indirect_cost_recovery: 'indirect cost recovery', conversion_balance: 'Conversion balances',
};

async function editEligibility(pool, orgId, txnId, source, status, fiscalYear, sourceLabels) {
  const memoOnly = status === 'voided';
  if (status === 'pending_approval') return { allowed: false, reason: 'This entry is waiting for approval. Approve or void it first.' };
  const limited = !EDITABLE_SOURCES.has(source);
  const sourceLabel = (sourceLabels && sourceLabels.length ? sourceLabels.join(', ') : (SOURCE_NOUN[source] || 'another part of Accounting'));
  if (await isFiscalYearLocked(pool, orgId, fiscalYear)) {
    return { allowed: false, reason: 'Fiscal year ' + fiscalYear + ' is locked. Void this entry (a reversing entry is posted) and enter the corrected one.' };
  }
  const rec = await pool.query(
    `SELECT DISTINCT s.id, s.bank_account_id FROM org_bank_statement_lines s
      WHERE s.org_id = $1 AND (s.ledger_transaction_id = $2
         OR s.id IN (SELECT statement_line_id FROM org_bank_statement_line_postings WHERE ledger_transaction_id = $2))`,
    [orgId, txnId]
  );
  return {
    allowed: true, reconciled: rec.rows.length > 0, memo_only: memoOnly,
    limited, source_label: limited ? sourceLabel : null,
    locked_account_ids: [...new Set(rec.rows.map((r) => r.bank_account_id))],
    statement_line_ids: rec.rows.map((r) => r.id),
  };
}

async function accountFacts(pool, orgId, ids) {
  const r = await pool.query(
    `SELECT id, type::text AS type, is_posting, is_cash_account, is_system_ap_account, is_system_ar_account, is_system_clearing_account,
            is_system_expense_claims_payable_account, is_system_unallocated_receipts_account
       FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
  return new Map(r.rows.map((a) => [a.id, a]));
}
const isSystemAccount = (a) => a.is_cash_account || a.is_system_ap_account || a.is_system_ar_account || a.is_system_clearing_account
  || a.is_system_expense_claims_payable_account || a.is_system_unallocated_receipts_account;
const isClassificationLine = (a) => !!a && (a.type === 'income' || a.type === 'expense') && !isSystemAccount(a);
const isGiftAssetSide = (source, a, debitCents) => source === 'gift_in_kind' && !!a && a.type === 'asset' && !isSystemAccount(a) && Number(debitCents) > 0;

module.exports = { EDITABLE_SOURCES, LINKED_SOURCES, SOURCE_NOUN, editEligibility, accountFacts, isSystemAccount, isClassificationLine, isGiftAssetSide };
