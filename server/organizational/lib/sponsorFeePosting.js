'use strict';

// Posting sponsored-project fees to the ledger: the "Run fees" preview, the confirmed run, and reversal.

const { postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('./ledgerPosting');
const { feesDue } = require('./sponsorFees');
const { loadProjectBalances, loadSponsorSettings, RESTRICTED_CLASS } = require('./sponsorBalance');
const { logAudit } = require('./auditLog');

const FEE_RUN_LOCK = 360001;

async function previewFees(pool, orgId, throughDate) {
  const settings = await loadSponsorSettings(pool, orgId);
  const pr = await pool.query('SELECT id FROM org_sponsored_projects WHERE sponsor_org_id = $1 ORDER BY name, id', [orgId]);
  const balances = await loadProjectBalances(pool, orgId, pr.rows.map((r) => r.id), { asOf: throughDate });
  const rows = [];
  for (const { project, feePeriods, feePostings } of balances.values()) {
    const due = feesDue(feePeriods, feePostings.filter((p) => p.live), throughDate);
    for (const d of due) {
      rows.push({
        project_id: Number(project.id), project_name: project.name, program_id: project.program_id != null ? Number(project.program_id) : null,
        period_start: d.period_start, period_end: d.period_end, gross_cents: d.gross_cents, exempt_cents: d.exempt_cents,
        fee_cents: d.fee_cents, posted_cents: d.posted_cents, due_cents: d.due_cents, minimum_applied: d.minimum_applied,
        problem: problemFor(project, settings),
      });
    }
  }
  return { rows, total_cents: rows.reduce((s, r) => s + r.due_cents, 0), settings_ready: !problemFor({ program_id: 1 }, settings) };
}

function problemFor(project, settings) {
  if (!settings || !settings.fee_income_account_id || !settings.fee_expense_account_id || !settings.fee_income_program_id) {
    return 'Set the fee income account, fee expense account and fee income program in sponsorship settings.';
  }
  if (project.program_id == null) return 'Link this project to a program first.';
  if (Number(project.program_id) === Number(settings.fee_income_program_id)) {
    return 'This project uses the fee income program. Give the project its own program.';
  }
  return null;
}

function feeLines(row, settings) {
  const amount = Math.abs(row.due_cents);
  const charge = row.due_cents > 0;
  const projectLine = {
    account_id: settings.fee_expense_account_id, program_id: row.program_id, donor_restriction_class: RESTRICTED_CLASS,
    debit_cents: charge ? amount : 0, credit_cents: charge ? 0 : amount,
  };
  const incomeLine = {
    account_id: settings.fee_income_account_id, program_id: settings.fee_income_program_id, donor_restriction_class: 'unrestricted',
    debit_cents: charge ? 0 : amount, credit_cents: charge ? amount : 0,
  };
  return [projectLine, incomeLine];
}

async function runFees(pool, { orgId, userId, throughDate }) {
  if (!throughDate || !DATE_RE.test(throughDate)) return { httpStatus: 400, body: { error: 'Choose the date to run fees through.' } };
  const lock = await pool.connect();
  try {
    const got = await lock.query('SELECT pg_try_advisory_lock($1, $2) AS ok', [FEE_RUN_LOCK, orgId]);
    if (!got.rows[0].ok) return { httpStatus: 409, body: { error: 'A fee run is already in progress for this workspace. Try again in a minute.', code: 'fee_run_busy' } };
    try {
      const settings = await loadSponsorSettings(pool, orgId);
      const preview = await previewFees(pool, orgId, throughDate);
      const posted = [];
      const failed = [];
      for (const row of preview.rows) {
        if (row.problem) { failed.push({ ...row, error: row.problem }); continue; }
        const claim = await pool.query(
          `INSERT INTO org_sponsor_fee_postings (org_id, sponsored_project_id, period_start, period_end, amount_cents, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [orgId, row.project_id, row.period_start, row.period_end, row.due_cents, userId]);
        const postingId = claim.rows[0].id;
        const result = await postLedgerTransaction(pool, {
          orgId, userId, transactionDate: row.period_end,
          memo: (row.due_cents > 0 ? 'Administrative fee: ' : 'Administrative fee adjustment: ') + row.project_name + ' (' + row.period_start + ' to ' + row.period_end + ')',
          payee: null, referenceNumber: null,
          lines: feeLines(row, settings),
          source: 'sponsor_fee',
          internalApproval: { approvedBy: userId, sourceRefId: postingId, sourceRefType: 'org_sponsor_fee_postings' },
        });
        if (result.httpStatus >= 400) {
          await pool.query('DELETE FROM org_sponsor_fee_postings WHERE id = $1 AND org_id = $2', [postingId, orgId]);
          failed.push({ ...row, error: result.body.error || result.body.message, code: result.body.code || null });
          continue;
        }
        await pool.query('UPDATE org_sponsor_fee_postings SET ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3', [result.body.id, postingId, orgId]);
        await logAudit(pool, {
          orgId, userId, action: 'create', tableName: 'org_sponsor_fee_postings', recordId: postingId,
          metadata: { operation: 'sponsor_fee_run', sponsored_project_id: row.project_id, period_end: row.period_end, amount_cents: row.due_cents, ledger_transaction_id: result.body.id },
        }).catch(() => {});
        posted.push({ ...row, id: postingId, ledger_transaction_id: result.body.id });
      }
      return { httpStatus: 200, body: { posted, failed, posted_count: posted.length, failed_count: failed.length } };
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1, $2)', [FEE_RUN_LOCK, orgId]).catch(() => {});
    }
  } finally {
    lock.release();
  }
}

async function voidFeePosting(pool, { orgId, userId, postingId, reason }) {
  const why = String(reason || '').trim();
  if (!why) return { httpStatus: 400, body: { error: 'A reason is required to reverse a fee.', code: 'reason_required' } };
  const r = await pool.query('SELECT * FROM org_sponsor_fee_postings WHERE id = $1 AND org_id = $2', [postingId, orgId]);
  const p = r.rows[0];
  if (!p) return { httpStatus: 404, body: { error: 'Fee entry not found' } };
  if (p.voided_at) return { httpStatus: 409, body: { error: 'This fee entry is already reversed.', code: 'already_voided' } };
  if (p.ledger_transaction_id) {
    const t = await pool.query('SELECT status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [p.ledger_transaction_id, orgId]);
    if (t.rows[0] && t.rows[0].status !== 'voided') {
      const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: p.ledger_transaction_id, voidReason: why });
      if (v.httpStatus >= 400) return v;
    }
  }
  await pool.query('UPDATE org_sponsor_fee_postings SET voided_at = now(), void_reason = $1 WHERE id = $2 AND org_id = $3', [why, postingId, orgId]);
  await logAudit(pool, {
    orgId, userId, action: 'update', tableName: 'org_sponsor_fee_postings', recordId: postingId,
    fields: [{ fieldName: 'status', oldValue: 'posted', newValue: 'reversed' }], metadata: { reason: why },
  }).catch(() => {});
  return { httpStatus: 200, body: { id: postingId, voided: true } };
}

module.exports = { previewFees, runFees, voidFeePosting, feeLines, problemFor };
