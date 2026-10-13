'use strict';

async function closedPeriodCovering(pool, orgId, bankAccountId, dateStr) {
  const r = await pool.query(
    `SELECT id, period_start, period_end FROM org_bank_reconciliation_periods
      WHERE org_id = $1 AND bank_account_id = $2 AND status = 'closed' AND period_start <= $3::date AND period_end >= $3::date
      LIMIT 1`,
    [orgId, bankAccountId, String(dateStr).slice(0, 10)]
  );
  return r.rows[0] || null;
}

function periodLockBody(period) {
  const f = (d) => String(d).slice(0, 10);
  return {
    error: 'This bank line falls in a closed Reconcile Period period (' + f(period.period_start) + ' to ' + f(period.period_end) + '). Reopen that period in Reconcile Period first.',
    code: 'period_closed',
  };
}

async function computePeriod(pool, orgId, p) {
  const start = String(p.period_start).slice(0, 10);
  const end = String(p.period_end).slice(0, 10);
  const acct = p.bank_account_id;

  const linesR = await pool.query(
    `SELECT l.id, l.statement_date, l.amount_cents, l.credit_debit_indicator, l.payee_raw, l.description_raw, l.status, l.ledger_transaction_id,
            (SELECT COUNT(*)::int FROM org_bank_statement_line_postings pp WHERE pp.statement_line_id = l.id) AS posting_count,
            (SELECT string_agg(DISTINCT a2.code || ' ' || a2.name, ', ') FROM org_ledger_lines l2 JOIN org_accounts a2 ON a2.id = l2.account_id
              WHERE l2.transaction_id IN (SELECT l.ledger_transaction_id UNION SELECT pp.ledger_transaction_id FROM org_bank_statement_line_postings pp WHERE pp.statement_line_id = l.id)
                AND l2.account_id <> l.bank_account_id) AS related_accounts
       FROM org_bank_statement_lines l
      WHERE l.org_id = $1 AND l.bank_account_id = $2 AND l.statement_date BETWEEN $3 AND $4
      ORDER BY l.statement_date, l.id`,
    [orgId, acct, start, end]
  );
  let payments = 0n, deposits = 0n, paymentsN = 0, depositsN = 0, waiting = 0;
  const reconciled = [];
  for (const l of linesR.rows) {
    if (l.status !== 'confirmed') { waiting += 1; continue; }
    const amt = BigInt(l.amount_cents);
    if (l.credit_debit_indicator === 'debit') { payments += amt; paymentsN += 1; } else { deposits += amt; depositsN += 1; }
    reconciled.push({
      line_id: l.id, date: String(l.statement_date).slice(0, 10), payee: l.payee_raw || '', description: l.description_raw || '',
      spent_cents: l.credit_debit_indicator === 'debit' ? String(amt) : '0', received_cents: l.credit_debit_indicator === 'credit' ? String(amt) : '0',
      entry_id: l.ledger_transaction_id, entries: l.posting_count || (l.ledger_transaction_id ? 1 : 0), related_accounts: l.related_accounts || '',
    });
  }
  const opening = BigInt(p.opening_balance_cents);
  const closing = BigInt(p.closing_balance_cents);
  const periodBalance = opening + deposits - payments;
  const difference = closing - periodBalance;

  const outR = await pool.query(
    `SELECT t.id, t.transaction_date, COALESCE(NULLIF(t.payee, ''), t.memo, '') AS descr, t.reference_number, ll.debit_cents, ll.credit_cents
       FROM org_ledger_lines ll JOIN org_ledger_transactions t ON t.id = ll.transaction_id
      WHERE ll.account_id = $2 AND t.org_id = $1 AND t.status = 'posted' AND t.transaction_date <= $3
        AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines s WHERE s.org_id = t.org_id AND s.ledger_transaction_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM org_bank_statement_line_postings pp WHERE pp.ledger_transaction_id = t.id)
      ORDER BY t.transaction_date, t.id`,
    [orgId, acct, end]
  );
  const outstandingPayments = [], outstandingDeposits = [];
  let outPay = 0n, outDep = 0n;
  for (const r of outR.rows) {
    const d = BigInt(r.debit_cents), c = BigInt(r.credit_cents);
    const item = { entry_id: r.id, date: String(r.transaction_date).slice(0, 10), description: r.descr, reference: r.reference_number || '' };
    if (c > 0n) { outstandingPayments.push({ ...item, amount_cents: String(c) }); outPay += c; }
    else { outstandingDeposits.push({ ...item, amount_cents: String(d) }); outDep += d; }
  }
  const booksR = await pool.query(
    `SELECT (COALESCE(SUM(ll.debit_cents), 0) - COALESCE(SUM(ll.credit_cents), 0))::bigint AS net
       FROM org_ledger_lines ll JOIN org_ledger_transactions t ON t.id = ll.transaction_id
      WHERE ll.account_id = $2 AND t.org_id = $1 AND t.status = 'posted' AND t.transaction_date <= $3`,
    [orgId, acct, end]
  );
  return {
    period_start: start, period_end: end,
    opening_cents: String(opening), closing_cents: String(closing),
    payments_cents: String(payments), payments_count: paymentsN, deposits_cents: String(deposits), deposits_count: depositsN,
    period_balance_cents: String(periodBalance), difference_cents: String(difference),
    waiting_lines: waiting,
    reconciled, outstanding_payments: outstandingPayments, outstanding_deposits: outstandingDeposits,
    outstanding_payments_cents: String(outPay), outstanding_deposits_cents: String(outDep),
    books_balance_end_cents: String(BigInt(booksR.rows[0].net)),
  };
}

module.exports = { closedPeriodCovering, periodLockBody, computePeriod };
