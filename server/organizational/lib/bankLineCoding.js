'use strict';

// Coding one bank statement line to an account, program, grant and restriction (one or more splits), posting its ledger entry.

const { closedPeriodCovering, periodLockBody } = require('./bankPeriods');
const { postLedgerTransaction, RESTRICTION_CLASSES } = require('./ledgerPosting');

function signedAmountCents(line) {
  const magnitude = Number(line.amount_cents);
  return line.credit_debit_indicator === 'debit' ? -magnitude : magnitude;
}

function buildSplitLines({ bankAccountId, splits, totalAmountCents }) {
  const inflow = totalAmountCents >= 0;
  const magnitude = Math.abs(totalAmountCents);
  const bankLine = {
    account_id: bankAccountId,
    program_id: splits[0].programId,
    debit_cents: inflow ? magnitude : 0,
    credit_cents: inflow ? 0 : magnitude,
  };
  const codedLines = splits.map((s) => ({
    account_id: s.accountId,
    program_id: s.programId,
    grant_id: s.grantId,
    donor_restriction_class: s.restrictionClass,
    debit_cents: inflow ? 0 : s.amountCents,
    credit_cents: inflow ? s.amountCents : 0,
  }));
  return [bankLine, ...codedLines];
}

function parseSplits(body) {
  const rawSplits = Array.isArray(body.splits) && body.splits.length > 0
    ? body.splits
    : [{ account_id: body.account_id, program_id: body.program_id, grant_id: body.grant_id, donor_restriction_class: body.donor_restriction_class, amount_cents: body.amount_cents }];

  const splits = [];
  for (let i = 0; i < rawSplits.length; i++) {
    const s = rawSplits[i] || {};
    const accountId = Number.parseInt(String(s.account_id), 10);
    const programId = Number.parseInt(String(s.program_id), 10);
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `split ${i + 1}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `split ${i + 1}: program_id is required` };
    let grantId = null;
    if (s.grant_id != null && s.grant_id !== '') {
      grantId = Number.parseInt(String(s.grant_id), 10);
      if (!Number.isInteger(grantId) || grantId < 1) return { error: `split ${i + 1}: grant_id must be a positive integer if provided` };
    }
    let restrictionClass = null;
    if (s.donor_restriction_class != null && s.donor_restriction_class !== '') {
      restrictionClass = String(s.donor_restriction_class);
      if (!RESTRICTION_CLASSES.has(restrictionClass)) {
        return { error: `split ${i + 1}: donor_restriction_class must be one of unrestricted, temporarily_restricted, permanently_restricted` };
      }
    }
    splits.push({ accountId, programId, grantId, restrictionClass, amountCents: s.amount_cents });
  }
  return { splits };
}


async function codeLineAsCreate(pool, orgId, userId, lineId, { splits, memo, payee, referenceNumber, codingSource, appliedRuleId }) {
  const line = (await pool.query('SELECT * FROM org_bank_statement_lines WHERE id = $1 AND org_id = $2', [lineId, orgId])).rows[0];
  if (!line) return { httpStatus: 404, body: { error: 'Statement line not found' } };
  { const lock = await closedPeriodCovering(pool, orgId, line.bank_account_id, line.statement_date); if (lock) return { httpStatus: 409, body: periodLockBody(lock) }; }
  if (line.status !== 'unconfirmed') {
    return { httpStatus: 409, body: { error: `Line is already ${line.status}`, code: 'already_coded' } };
  }

  const totalAmountCents = signedAmountCents(line);
  const magnitude = Math.abs(totalAmountCents);
  const filledSplits = splits.map((s, i) => ({
    ...s,
    amountCents: s.amountCents != null ? Number.parseInt(String(s.amountCents), 10)
      : (splits.length === 1 ? magnitude : NaN),
  }));
  if (filledSplits.some((s) => !Number.isInteger(s.amountCents) || s.amountCents <= 0)) {
    return { httpStatus: 400, body: { error: 'Each split needs a positive amount_cents' } };
  }
  const splitSum = filledSplits.reduce((sum, s) => sum + s.amountCents, 0);
  if (splitSum !== magnitude) {
    return { httpStatus: 400, body: { error: `Split amounts (${splitSum}) must sum to the line's total (${magnitude})` } };
  }

  const lines = buildSplitLines({ bankAccountId: line.bank_account_id, splits: filledSplits, totalAmountCents });
  const result = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: String(line.statement_date).slice(0, 10),
    memo: memo != null ? memo : line.description_raw,
    payee: payee != null ? payee : line.payee_raw,
    referenceNumber: referenceNumber != null ? referenceNumber : null,
    lines, source: 'bank_reconciliation',
  });
  if (result.httpStatus >= 400) return result;

  await pool.query(
    `UPDATE org_bank_statement_lines
     SET status = 'confirmed', ledger_transaction_id = $1, coding_source = $4, applied_rule_id = $5,
         discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
     WHERE id = $2 AND org_id = $3`,
    [result.body.id, lineId, orgId, codingSource === 'rule' ? 'rule' : 'manual', codingSource === 'rule' ? (appliedRuleId || null) : null]
  );
  return { httpStatus: 201, body: { id: lineId, status: 'confirmed', ledger_transaction_id: result.body.id, ledger_status: result.body.status } };
}


module.exports = { signedAmountCents, buildSplitLines, parseSplits, codeLineAsCreate };
