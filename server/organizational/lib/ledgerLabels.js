'use strict';

const SOURCE_LABELS = {
  manual: 'Manual', bank_reconciliation: 'Bank', bill_approval: 'Bill', invoice: 'Invoice', bill_payment: 'Bill payment',
  invoice_payment: 'Invoice payment', fixed_asset_depreciation: 'Depreciation', fixed_asset_disposal: 'Asset disposal',
  recode: 'Recode', gift_posting: 'Gift',
};
const ENTRY_LABELS = { receive: 'Receive', spend: 'Spend', transfer: 'Transfer', journal: 'Journal' };

function sourceLabel(src, entryType) {
  if (src === 'manual' && ENTRY_LABELS[entryType]) return ENTRY_LABELS[entryType];
  if (SOURCE_LABELS[src]) return SOURCE_LABELS[src];
  const t = String(src || '').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function statusLabel(status) {
  return status === 'pending_approval' ? 'Pending approval' : (status === 'voided' ? 'Voided' : 'Posted');
}

module.exports = { sourceLabel, statusLabel };
