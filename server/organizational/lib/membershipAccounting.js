'use strict';

// Dues accounting. Membership never posts on its own: a person with Accounting write access confirms each dues payment or
// refund, and each month's recognition run, in the Dues postings tab. A payment splits into a contribution part
// (recognised at receipt) and an exchange part. The exchange part sits in the deferred-dues liability and moves to dues
// revenue evenly by day across the term ("spread"), or goes straight to revenue at receipt once the term has started
// ("at receipt"). Reversals post a reversing entry with a reason. Locked fiscal years are refused by the ledger.

const { postLedgerTransaction, buildReversingLines } = require('./ledgerPosting');
const { logAudit } = require('./auditLog');
const M = require('./membership');
const S = require('./membershipStatus');
const { NS, withLock, BUSY } = require('./advisoryLock');

const MONTH_RE = /^\d{4}-\d{2}$/;

// --- Pure rules ---

function splitPayment(amountCents, term, settings, postingDay) {
  const amount = Number(amountCents) || 0;
  const price = Number(term.price_cents) || 0;
  const contribution = price > 0 ? Math.min(amount, Math.round(amount * (Number(term.contribution_cents) || 0) / price)) : 0;
  const exchange = amount - contribution;
  const before = S.toDay(postingDay) < S.toDay(term.starts_on);
  if ((settings.recognition_mode || 'spread') === 'spread' || before) return { contribution, deferred: exchange, revenue: 0 };
  return { contribution, deferred: 0, revenue: exchange };
}

function splitRefund(refundCents, original) {
  const amount = Number(original.amount_cents) || 0;
  const r = Number(refundCents) || 0;
  if (!amount) return { contribution: 0, deferred: 0, revenue: r };
  const contribution = Math.round(r * (Number(original.posted_contribution_cents) || 0) / amount);
  const deferred = Math.round(r * (Number(original.posted_deferred_cents) || 0) / amount);
  return { contribution, deferred, revenue: r - contribution - deferred };
}

function monthEnd(month) {
  return S.addDays(S.addMonths(month + '-01', 1), -1);
}

// How much of a term's deferred dues should have moved to revenue by the end of a month.
function recognitionTarget(term, deferredTotal, endOfMonth, settings) {
  const total = Number(deferredTotal) || 0;
  const starts = S.toDay(term.starts_on);
  const ends = S.toDay(term.ends_on);
  if (endOfMonth < starts) return 0;
  if ((settings.recognition_mode || 'spread') !== 'spread') return total;
  const termDays = S.dayDiff(ends, starts) + 1;
  const elapsed = Math.min(termDays, S.dayDiff(endOfMonth < ends ? endOfMonth : ends, starts) + 1);
  return Math.round(total * elapsed / termDays);
}

// --- Accounts ---

async function accountsFor(pool, orgId, term, settings) {
  const tier = term.tier_id ? (await pool.query('SELECT name, revenue_account_id, program_id FROM org_membership_tiers WHERE id = $1 AND org_id = $2', [term.tier_id, orgId])).rows[0] : null;
  return {
    tierName: tier ? tier.name : null,
    revenue: (tier && tier.revenue_account_id) || settings.dues_revenue_account_id || null,
    program: (tier && tier.program_id) || settings.default_program_id || null,
    deferred: settings.deferred_dues_account_id || null,
    contribution: settings.contribution_account_id || null,
  };
}

function missingAccounts(acc, parts) {
  const need = [];
  if (!acc.program) need.push('a program (on the tier, or the default in Membership settings)');
  if (parts.revenue && !acc.revenue) need.push('a dues revenue account (on the tier, or the default)');
  if (parts.deferred && !acc.deferred) need.push('a deferred dues (liability) account in Membership settings');
  if (parts.contribution && !acc.contribution) need.push('a contribution account in Membership settings');
  return need.length ? 'Set ' + need.join(', ') + ' before posting.' : null;
}

async function checkDeposit(pool, orgId, accountId) {
  const r = await pool.query(`SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND type = 'asset' AND is_posting = true`, [accountId, orgId]);
  return r.rows.length > 0;
}

// --- Posting payments and refunds ---

async function loadPaymentForPosting(pool, orgId, paymentId) {
  const r = await pool.query(
    `SELECT p.*, t.starts_on, t.ends_on, t.price_cents, t.contribution_cents AS term_contribution_cents, t.tier_id, c.display_name
       FROM org_membership_payments p JOIN org_membership_terms t ON t.id = p.term_id JOIN org_constituents c ON c.id = p.constituent_id
      WHERE p.id = $1 AND p.org_id = $2`, [paymentId, orgId]);
  return r.rows[0] || null;
}

async function postDuesPaymentUnlocked(pool, { orgId, userId, paymentId, postingDate, depositAccountId, reference }) {
  const date = M.day(postingDate);
  if (!date) return { httpStatus: 400, body: { error: 'Enter the posting date.' } };
  const p = await loadPaymentForPosting(pool, orgId, paymentId);
  if (!p) return { httpStatus: 404, body: { error: 'That dues payment was not found.' } };
  if (p.kind === 'waiver') return { httpStatus: 400, body: { error: 'A waiver is not posted; it only lowers what is owed.' } };
  if (p.posting_status !== 'unposted') return { httpStatus: 409, body: { error: 'This payment is already ' + p.posting_status + '.', code: 'invalid_posting_status' } };
  if (!depositAccountId || !(await checkDeposit(pool, orgId, depositAccountId))) {
    return { httpStatus: 400, body: { error: 'Choose the bank or clearing account the money went into (or came out of).' } };
  }
  const settings = await M.getSettings(pool, orgId);
  const term = { starts_on: p.starts_on, ends_on: p.ends_on, price_cents: p.price_cents, contribution_cents: p.term_contribution_cents, tier_id: p.tier_id };
  let parts;
  if (p.kind === 'refund') {
    const orig = (await pool.query('SELECT * FROM org_membership_payments WHERE id = $1 AND org_id = $2', [p.refund_of_id, orgId])).rows[0];
    if (!orig) return { httpStatus: 400, body: { error: 'The payment this refund belongs to was not found.' } };
    const base = orig.posting_status === 'posted' ? orig : { ...orig, ...(() => { const s = splitPayment(orig.amount_cents, term, settings, M.day(orig.payment_date)); return { posted_contribution_cents: s.contribution, posted_deferred_cents: s.deferred }; })() };
    parts = splitRefund(p.amount_cents, base);
  } else {
    parts = splitPayment(p.amount_cents, term, settings, date);
  }
  const acc = await accountsFor(pool, orgId, term, settings);
  const missing = missingAccounts(acc, parts);
  if (missing) return { httpStatus: 400, body: { error: missing, code: 'accounts_missing' } };
  const amount = Number(p.amount_cents);
  const sign = p.kind === 'refund' ? -1 : 1;
  const line = (account, cents) => (cents ? [{ account_id: account, program_id: acc.program, grant_id: null, debit_cents: cents * sign > 0 ? Math.abs(cents) : 0, credit_cents: cents * sign < 0 ? Math.abs(cents) : 0, source_line_type: 'org_membership_payments', source_line_id: p.id }] : []);
  const lines = [
    ...line(depositAccountId, amount),
    ...line(acc.contribution, -parts.contribution),
    ...line(acc.deferred, -parts.deferred),
    ...line(acc.revenue, -parts.revenue),
  ];
  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: date,
    memo: (p.kind === 'refund' ? 'Dues refund: ' : 'Membership dues: ') + p.display_name + (acc.tierName ? ' (' + acc.tierName + ')' : ''),
    payee: p.display_name, referenceNumber: reference || p.processor_ref || null, lines, source: 'membership_dues', constituentId: p.constituent_id,
    internalApproval: { approvedBy: userId, sourceRefId: p.id, sourceRefType: 'org_membership_payments' },
  });
  if (result.httpStatus >= 400) return result;
  await pool.query(
    `UPDATE org_membership_payments SET posting_status = 'posted', ledger_transaction_id = $1, posted_contribution_cents = $2, posted_deferred_cents = $3,
            posted_revenue_cents = $4, deposit_account_id = $5, posted_by = $6, posted_at = now() WHERE id = $7`,
    [result.body.id, parts.contribution, parts.deferred, parts.revenue, depositAccountId, userId || null, p.id]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_membership_payments', recordId: p.id,
    fields: [{ fieldName: 'posting_status', oldValue: 'unposted', newValue: 'posted' }], metadata: { ledger_transaction_id: result.body.id, ...parts } });
  return { httpStatus: 200, body: { id: p.id, posting_status: 'posted', ledger_transaction_id: result.body.id, split: parts } };
}

async function reverseDuesPostingUnlocked(pool, { orgId, userId, paymentId, reason }) {
  const why = M.text(reason);
  if (!why) return { httpStatus: 400, body: { error: 'Give the reason for reversing this posting.' } };
  const p = (await pool.query('SELECT * FROM org_membership_payments WHERE id = $1 AND org_id = $2', [paymentId, orgId])).rows[0];
  if (!p) return { httpStatus: 404, body: { error: 'That dues payment was not found.' } };
  if (p.posting_status !== 'posted' || !p.ledger_transaction_id) return { httpStatus: 409, body: { error: 'This payment is not posted.', code: 'not_posted' } };
  const lines = await pool.query(
    `SELECT account_id, program_id, grant_id, donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo FROM org_ledger_lines WHERE transaction_id = $1`, [p.ledger_transaction_id]);
  const txn = (await pool.query(`SELECT transaction_date::text AS d FROM org_ledger_transactions WHERE id = $1`, [p.ledger_transaction_id])).rows[0];
  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: M.day(txn.d), memo: 'Reversal (' + why + '): dues payment #' + p.id, payee: null, referenceNumber: null,
    lines: buildReversingLines(lines.rows), source: 'membership_dues', reversesTransactionId: p.ledger_transaction_id,
    internalApproval: { approvedBy: userId, sourceRefId: p.id, sourceRefType: 'org_membership_payments' },
  });
  if (result.httpStatus >= 400) return result;
  await pool.query(
    `UPDATE org_membership_payments SET posting_status = 'unposted', ledger_transaction_id = NULL, posted_contribution_cents = NULL, posted_deferred_cents = NULL,
            posted_revenue_cents = NULL, deposit_account_id = NULL, posted_by = NULL, posted_at = NULL WHERE id = $1`, [p.id]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_membership_payments', recordId: p.id,
    fields: [{ fieldName: 'posting_status', oldValue: 'posted', newValue: 'unposted' }],
    metadata: { reason: why, reversed_transaction_id: p.ledger_transaction_id, reversal_transaction_id: result.body.id } });
  return { httpStatus: 200, body: { id: p.id, posting_status: 'unposted', reversal_transaction_id: result.body.id } };
}

// --- Recognition ---

async function recognitionPreview(pool, orgId, month) {
  if (!MONTH_RE.test(String(month || ''))) return { error: 'Choose a month.' };
  const end = monthEnd(month);
  if (month > M.today().slice(0, 7)) return { error: 'Recognition can only be run for this month or earlier.' };
  const settings = await M.getSettings(pool, orgId);
  const r = await pool.query(
    `SELECT t.id, t.starts_on, t.ends_on, t.tier_id, c.display_name,
            COALESCE((SELECT SUM(CASE WHEN p.kind = 'refund' THEN -COALESCE(p.posted_deferred_cents, 0) ELSE COALESCE(p.posted_deferred_cents, 0) END)
                        FROM org_membership_payments p WHERE p.term_id = t.id AND p.posting_status = 'posted'), 0)::int AS deferred_total,
            COALESCE((SELECT SUM(amount_cents) FROM org_membership_recognition r WHERE r.term_id = t.id), 0)::int AS recognized,
            EXISTS (SELECT 1 FROM org_membership_recognition r WHERE r.term_id = t.id AND r.month = $2::date) AS done
       FROM org_membership_terms t JOIN org_constituents c ON c.id = t.constituent_id
      WHERE t.org_id = $1`, [orgId, month + '-01']);
  const rows = [];
  for (const t of r.rows) {
    if (t.done) continue;
    const target = recognitionTarget(t, t.deferred_total, end, settings);
    const amount = target - Number(t.recognized);
    if (!amount) continue;
    const acc = await accountsFor(pool, orgId, t, settings);
    rows.push({ term_id: t.id, display_name: t.display_name, tier_name: acc.tierName, starts_on: S.toDay(t.starts_on), ends_on: S.toDay(t.ends_on),
      amount_cents: amount, revenue_account_id: acc.revenue, program_id: acc.program, deferred_account_id: acc.deferred });
  }
  const posted = await pool.query(
    `SELECT r.ledger_transaction_id, SUM(r.amount_cents)::int AS cents, COUNT(*)::int AS terms FROM org_membership_recognition r
      WHERE r.org_id = $1 AND r.month = $2::date GROUP BY r.ledger_transaction_id`, [orgId, month + '-01']);
  return { month, posting_date: end, rows, total_cents: rows.reduce((a, x) => a + x.amount_cents, 0), posted: posted.rows };
}

async function postRecognitionUnlocked(pool, { orgId, userId, month }) {
  const pv = await recognitionPreview(pool, orgId, month);
  if (pv.error) return { httpStatus: 400, body: { error: pv.error } };
  if (!pv.rows.length) return { httpStatus: 409, body: { error: 'Nothing to recognise for ' + month + '.' } };
  const missing = pv.rows.find((x) => !x.revenue_account_id || !x.program_id || !x.deferred_account_id);
  if (missing) return { httpStatus: 400, body: { error: 'Set the deferred dues account, a dues revenue account and a program (on the tier or the defaults in Membership settings) before running recognition.', code: 'accounts_missing' } };
  const groups = new Map();
  for (const x of pv.rows) {
    const k = x.deferred_account_id + ':' + x.revenue_account_id + ':' + x.program_id;
    const g = groups.get(k) || { ...x, amount_cents: 0 };
    g.amount_cents += x.amount_cents;
    groups.set(k, g);
  }
  const lines = [];
  for (const g of groups.values()) {
    if (!g.amount_cents) continue;
    const a = Math.abs(g.amount_cents);
    const up = g.amount_cents > 0;
    lines.push({ account_id: g.deferred_account_id, program_id: g.program_id, grant_id: null, debit_cents: up ? a : 0, credit_cents: up ? 0 : a });
    lines.push({ account_id: g.revenue_account_id, program_id: g.program_id, grant_id: null, debit_cents: up ? 0 : a, credit_cents: up ? a : 0 });
  }
  let txnId = null;
  if (lines.length) {
    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: pv.posting_date, memo: 'Membership dues recognised for ' + month, payee: null, referenceNumber: null,
      lines, source: 'membership_dues', internalApproval: { approvedBy: userId, sourceRefId: null, sourceRefType: 'org_membership_recognition' },
    });
    if (result.httpStatus >= 400) return result;
    txnId = result.body.id;
  }
  for (const x of pv.rows) {
    await pool.query(
      `INSERT INTO org_membership_recognition (org_id, term_id, month, amount_cents, ledger_transaction_id, posted_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, x.term_id, month + '-01', x.amount_cents, txnId, userId || null]);
  }
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_membership_recognition', recordId: txnId || orgId,
    metadata: { month, terms: pv.rows.length, total_cents: pv.total_cents, ledger_transaction_id: txnId } });
  return { httpStatus: 200, body: { month, ledger_transaction_id: txnId, terms: pv.rows.length, total_cents: pv.total_cents } };
}

async function reverseRecognitionUnlocked(pool, { orgId, userId, month, reason }) {
  const why = M.text(reason);
  if (!why) return { httpStatus: 400, body: { error: 'Give the reason for reversing this recognition run.' } };
  if (!MONTH_RE.test(String(month || ''))) return { httpStatus: 400, body: { error: 'Choose a month.' } };
  const later = await pool.query(`SELECT 1 FROM org_membership_recognition WHERE org_id = $1 AND month > $2::date LIMIT 1`, [orgId, month + '-01']);
  if (later.rows.length) return { httpStatus: 409, body: { error: 'A later month has been run. Reverse the later months first.' } };
  const rows = await pool.query(`SELECT DISTINCT ledger_transaction_id FROM org_membership_recognition WHERE org_id = $1 AND month = $2::date`, [orgId, month + '-01']);
  if (!rows.rows.length) return { httpStatus: 404, body: { error: 'No recognition was posted for ' + month + '.' } };
  for (const r of rows.rows) {
    if (!r.ledger_transaction_id) continue;
    const lines = await pool.query(
      `SELECT account_id, program_id, grant_id, donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo FROM org_ledger_lines WHERE transaction_id = $1`, [r.ledger_transaction_id]);
    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: monthEnd(month), memo: 'Reversal (' + why + '): membership dues recognised for ' + month, payee: null, referenceNumber: null,
      lines: buildReversingLines(lines.rows), source: 'membership_dues', reversesTransactionId: r.ledger_transaction_id,
      internalApproval: { approvedBy: userId, sourceRefId: null, sourceRefType: 'org_membership_recognition' },
    });
    if (result.httpStatus >= 400) return result;
  }
  await pool.query(`DELETE FROM org_membership_recognition WHERE org_id = $1 AND month = $2::date`, [orgId, month + '-01']);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_membership_recognition', recordId: orgId,
    fields: [{ fieldName: 'month_' + month, oldValue: 'posted', newValue: 'reversed' }], metadata: { reason: why } });
  return { httpStatus: 200, body: { month, reversed: true } };
}

const postDuesPayment = (pool, a) => withLock(pool, NS.duesPayment, a.paymentId, () => postDuesPaymentUnlocked(pool, a), BUSY);
const reverseDuesPosting = (pool, a) => withLock(pool, NS.duesPayment, a.paymentId, () => reverseDuesPostingUnlocked(pool, a), BUSY);
const postRecognition = (pool, a) => withLock(pool, NS.duesRecognition, a.orgId, () => postRecognitionUnlocked(pool, a), BUSY);
const reverseRecognition = (pool, a) => withLock(pool, NS.duesRecognition, a.orgId, () => reverseRecognitionUnlocked(pool, a), BUSY);

module.exports = {
  splitPayment, splitRefund, monthEnd, recognitionTarget, accountsFor,
  postDuesPayment, reverseDuesPosting, recognitionPreview, postRecognition, reverseRecognition,
};
