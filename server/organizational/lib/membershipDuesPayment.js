'use strict';

const { postDuesPayment } = require('./membershipAccounting');

async function recordMembershipDuesPayment(pool, { orgId, userId, paymentId, bankAccountId, paymentDate, reference }) {
  const result = await postDuesPayment(pool, { orgId, userId, paymentId, postingDate: paymentDate, depositAccountId: bankAccountId, reference });
  if (result.httpStatus >= 400) return result;
  return { httpStatus: 200, body: { ledger_transaction_id: result.body.ledger_transaction_id } };
}

module.exports = { recordMembershipDuesPayment };
