'use strict';

const { postLedgerTransaction } = require('./ledgerPosting');
const { sponsoredGiftCoding } = require('./giftPosting');

async function recordGrantGiftPayment(pool, { orgId, userId, giftId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query(
    `SELECT g.*, gr.revenue_account_id, gr.primary_program_id, gr.name AS grant_name
     FROM org_gifts g
     JOIN org_grants gr ON gr.id = g.grant_id
     WHERE g.id = $1 AND g.org_id = $2 LIMIT 1`,
    [giftId, orgId]
  );
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Grant gift not found' } };
  const gift = r.rows[0];
  if (gift.gift_type !== 'grant' || gift.payment_method === 'in_kind') {
    return { httpStatus: 400, body: { error: 'This gift is not a matchable cash grant gift' } };
  }
  if (gift.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Gift posting_status is ${gift.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }
  if (!gift.revenue_account_id) {
    return { httpStatus: 400, body: { error: 'This gift\'s grant has no default revenue account set -- set one on the grant before matching.', code: 'no_revenue_account' } };
  }
  const sponsored = await sponsoredGiftCoding(pool, orgId, gift.sponsored_project_id);
  if (sponsored && sponsored.error) return { httpStatus: 400, body: { error: sponsored.error, code: sponsored.code } };
  const programId = sponsored ? sponsored.programId : (gift.program_id || gift.primary_program_id);
  if (!programId) {
    return { httpStatus: 400, body: { error: 'Could not resolve a program for this grant gift (neither the gift nor its grant has one set).' } };
  }
  const restriction = sponsored ? sponsored.restrictionClass : null;

  const postResult = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: paymentDate,
    memo: `Grant payment: ${gift.grant_name}`,
    payee: null,
    referenceNumber: reference || null,
    lines: [
      { account_id: bankAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restriction, debit_cents: amountCents, credit_cents: 0 },
      { account_id: gift.revenue_account_id, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restriction, debit_cents: 0, credit_cents: amountCents },
    ],
    source: 'bank_reconciliation',
    constituentId: gift.constituent_id,
    internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
  });
  if (postResult.httpStatus >= 400) return postResult;

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1, program_id = $2 WHERE id = $3 AND org_id = $4`,
    [postResult.body.id, programId, giftId, orgId]
  );

  return { httpStatus: 200, body: { ledger_transaction_id: postResult.body.id } };
}

async function linkOrReclassifyGrantGiftTransaction(pool, { orgId, userId, giftId, transactionId }) {
  const giftR = await pool.query(
    `SELECT g.*, gr.revenue_account_id, gr.primary_program_id, gr.name AS grant_name
     FROM org_gifts g JOIN org_grants gr ON gr.id = g.grant_id
     WHERE g.id = $1 AND g.org_id = $2 LIMIT 1`,
    [giftId, orgId]
  );
  if (!giftR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
  const gift = giftR.rows[0];
  if (gift.gift_type !== 'grant' || gift.payment_method === 'in_kind') {
    return { httpStatus: 400, body: { error: 'Only cash grant gifts can be linked to an existing transaction' } };
  }
  if (gift.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Gift posting_status is ${gift.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }

  const txnR = await pool.query(`SELECT id, status, transaction_date FROM org_ledger_transactions WHERE id = $1 AND org_id = $2 LIMIT 1`, [transactionId, orgId]);
  if (!txnR.rows.length) return { httpStatus: 404, body: { error: 'Transaction not found' } };
  if (txnR.rows[0].status !== 'posted') return { httpStatus: 400, body: { error: 'Transaction must be posted' } };
  const alreadyLinked = await pool.query('SELECT 1 FROM org_gifts WHERE ledger_transaction_id = $1 AND id != $2', [transactionId, giftId]);
  if (alreadyLinked.rows.length) return { httpStatus: 409, body: { error: 'That transaction is already linked to another gift', code: 'already_linked' } };

  const suspenseR = await pool.query(`SELECT id FROM org_accounts WHERE org_id = $1 AND is_system_unallocated_receipts_account = true LIMIT 1`, [orgId]);
  const suspenseAccountId = suspenseR.rows[0] ? suspenseR.rows[0].id : null;
  const suspenseLineR = suspenseAccountId
    ? await pool.query(
        `SELECT program_id, grant_id, credit_cents FROM org_ledger_lines WHERE transaction_id = $1 AND account_id = $2 AND credit_cents > 0 LIMIT 1`,
        [transactionId, suspenseAccountId]
      )
    : { rows: [] };

  if (suspenseLineR.rows.length) {
    if (!gift.revenue_account_id) {
      return { httpStatus: 400, body: { error: 'This money is sitting in Unallocated Donor Receipts, but this gift\'s grant has no default revenue account set -- set one first (Banking Match tab), then link again.', code: 'no_revenue_account' } };
    }
    const suspenseLine = suspenseLineR.rows[0];
    const reclassifyResult = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: String(txnR.rows[0].transaction_date).slice(0, 10),
      memo: `Reclassify from Unallocated Donor Receipts: ${gift.grant_name}`,
      payee: null, referenceNumber: null,
      lines: [
        { account_id: suspenseAccountId, program_id: suspenseLine.program_id, grant_id: gift.grant_id, debit_cents: Number(suspenseLine.credit_cents), credit_cents: 0 },
        { account_id: gift.revenue_account_id, program_id: suspenseLine.program_id, grant_id: gift.grant_id, debit_cents: 0, credit_cents: Number(suspenseLine.credit_cents) },
      ],
      source: 'gift_reclassify',
      constituentId: gift.constituent_id,
      internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
    });
    if (reclassifyResult.httpStatus >= 400) return reclassifyResult;
    await pool.query(
      `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`,
      [reclassifyResult.body.id, giftId, orgId]
    );
    return { httpStatus: 200, body: { ledger_transaction_id: reclassifyResult.body.id, reclassified: true } };
  }

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`,
    [transactionId, giftId, orgId]
  );
  return { httpStatus: 200, body: { ledger_transaction_id: transactionId, reclassified: false } };
}

module.exports = { recordGrantGiftPayment, linkOrReclassifyGrantGiftTransaction };
