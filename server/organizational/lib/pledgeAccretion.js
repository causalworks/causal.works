'use strict';

/**
 * Periodic discount accretion for multi-year pledges, mirroring fixedAssets.js's straight-line
 * depreciation schedule/run-action shape exactly (same "preview read, explicit confirm write,
 * idempotent via a unique (gift_id, period_date) constraint" posture). A multi-year pledge is
 * posted at its discounted present value (ASC 958-605); each period afterward recognizes part
 * of the discount as income until the receivable reaches face value at the final installment.
 * Simplified from a textbook contra-asset "Discount on Pledges Receivable" account: this posts
 * straight to the receivable account (debit) against an org-chosen accretion/interest income
 * account (credit) -- still a separate line from contribution revenue, without requiring the
 * org to set up an extra contra-asset account for what's usually a small amount.
 */

const { postLedgerTransaction } = require('./ledgerPosting');

function lastDayOfMonthIso(year, month) {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** One row per month from the pledge's commitment date through its final installment due date. */
function accretionSchedule(gift, finalDueDate) {
  const totalDiscount = Number(gift.total_pledged_cents) - Number(gift.discounted_present_value_cents);
  if (totalDiscount <= 0) return [];
  const commitDate = new Date(String(gift.commitment_date).slice(0, 10) + 'T00:00:00');
  const endDate = new Date(String(finalDueDate).slice(0, 10) + 'T00:00:00');
  let year = commitDate.getFullYear();
  let month = commitDate.getMonth() + 1;
  const periods = [];
  let cursor = lastDayOfMonthIso(year, month);
  while (cursor <= String(finalDueDate).slice(0, 10)) {
    periods.push(cursor);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    cursor = lastDayOfMonthIso(year, month);
  }
  if (periods.length === 0) return [];
  const monthlyCents = Math.floor(totalDiscount / periods.length);
  let runningTotal = 0;
  return periods.map((period_date, i) => {
    const amount = i === periods.length - 1 ? (totalDiscount - runningTotal) : monthlyCents;
    runningTotal += amount;
    return { period_date, amount_cents: amount };
  });
}

/** Which periods, for which active multi-year pledges, would post if Run Pledge Accretion ran
 * through through_date. Read-only. */
async function computeDuePledgeAccretionPeriods(pool, orgId, throughDate) {
  const pledgesR = await pool.query(
    `SELECT g.*, t.transaction_date::text AS commitment_date
     FROM org_gifts g
     JOIN org_ledger_transactions t ON t.id = g.ledger_transaction_id
     WHERE g.org_id = $1 AND g.gift_type = 'pledge' AND g.is_multi_year_pledge = true
       AND g.posting_status = 'posted' AND g.discounted_present_value_cents IS NOT NULL`,
    [orgId]
  );
  const due = [];
  for (const gift of pledgesR.rows) {
    const finalR = await pool.query(
      `SELECT MAX(due_date)::text AS final_due_date FROM org_gift_pledge_installments WHERE gift_id = $1`,
      [gift.id]
    );
    const finalDueDate = finalR.rows[0] && finalR.rows[0].final_due_date;
    if (!finalDueDate) continue; // no installment schedule recorded -- nothing to accrete against
    const schedule = accretionSchedule(gift, finalDueDate);
    const postedR = await pool.query(
      `SELECT period_date::text AS period_date FROM org_pledge_accretion_entries WHERE gift_id = $1`,
      [gift.id]
    );
    const postedSet = new Set(postedR.rows.map((r) => r.period_date));
    for (const period of schedule) {
      if (period.period_date > throughDate) break;
      if (postedSet.has(period.period_date)) continue;
      due.push({ gift_id: gift.id, period_date: period.period_date, amount_cents: period.amount_cents, gift });
    }
  }
  return due;
}

async function runPledgeAccretion(pool, { orgId, userId, throughDate, incomeAccountId }) {
  const due = await computeDuePledgeAccretionPeriods(pool, orgId, throughDate);
  const posted = [];
  const failed = [];
  for (const d of due) {
    const gift = d.gift;
    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: d.period_date,
      memo: 'Pledge discount accretion: gift #' + gift.id + ' (' + d.period_date + ')',
      payee: null, referenceNumber: null,
      lines: [
        { account_id: gift.receivable_account_id, program_id: gift.program_id, grant_id: gift.grant_id, debit_cents: d.amount_cents, credit_cents: 0 },
        { account_id: incomeAccountId, program_id: gift.program_id, grant_id: gift.grant_id, debit_cents: 0, credit_cents: d.amount_cents },
      ],
      source: 'pledge_accretion',
      internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
    });
    if (result.httpStatus >= 400) {
      failed.push({ gift_id: d.gift_id, period_date: d.period_date, error: result.body.error || result.body.message });
      continue;
    }
    const insertR = await pool.query(
      `INSERT INTO org_pledge_accretion_entries (org_id, gift_id, period_date, amount_cents, ledger_transaction_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (gift_id, period_date) DO NOTHING
       RETURNING id`,
      [orgId, d.gift_id, d.period_date, d.amount_cents, result.body.id]
    );
    if (!insertR.rows.length) continue;
    posted.push({ gift_id: d.gift_id, period_date: d.period_date, amount_cents: String(d.amount_cents), ledger_transaction_id: result.body.id });
  }
  return { posted, failed };
}

module.exports = { computeDuePledgeAccretionPeriods, runPledgeAccretion };
