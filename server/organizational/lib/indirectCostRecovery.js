'use strict';

/**
 * Computes and posts indirect cost recovery for federal-award grants electing a de minimis or
 * negotiated (NICRA) rate (migration 249). Same preview-then-confirm, idempotent-via-unique-
 * constraint posture as fixedAssets.js's "Run Depreciation" and pledgeAccretion.js's "Run
 * Pledge Accretion" -- computed automatically from real ledger activity, but only ever posted
 * via an explicit run action inside Accounting, never automatically from Budget/Grants.
 */

const { postLedgerTransaction } = require('./ledgerPosting');

/** Sums a grant's direct-cost ledger activity (expense accounts, excluding is_mtdc_excluded)
 * for one period -- the base the elected rate is applied to. Read-only. */
async function computeMtdcBase(pool, orgId, grantId, periodStartDate, periodEndDate) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0) AS base_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND l.grant_id = $2
       AND a.type = 'expense' AND a.is_mtdc_excluded = false
       AND t.transaction_date >= $3 AND t.transaction_date <= $4`,
    [orgId, grantId, periodStartDate, periodEndDate]
  );
  return Number(r.rows[0].base_cents) || 0;
}

/** Grants eligible for recovery (rate elected) that don't already have a posted entry for this
 * exact period -- read-only preview, mirrors computeDuePeriods()/computeDuePledgeAccretionPeriods(). */
async function previewIndirectRecovery(pool, orgId, periodStartDate, periodEndDate) {
  const grantsR = await pool.query(
    `SELECT id, name, indirect_cost_rate_type, indirect_cost_rate_bps, indirect_cost_base,
            amount_passed_to_subrecipients_cents
     FROM org_grants
     WHERE org_id = $1 AND indirect_cost_rate_type != 'none' AND indirect_cost_rate_bps IS NOT NULL`,
    [orgId]
  );
  const out = [];
  for (const grant of grantsR.rows) {
    const existingR = await pool.query(
      `SELECT 1 FROM org_indirect_cost_recovery_entries WHERE grant_id = $1 AND period_start_date = $2 AND period_end_date = $3`,
      [grant.id, periodStartDate, periodEndDate]
    );
    if (existingR.rows.length) continue; // already posted for this exact period
    const baseCents = await computeMtdcBase(pool, orgId, grant.id, periodStartDate, periodEndDate);
    const rateBps = Number(grant.indirect_cost_rate_bps);
    const recoveryCents = Math.round((baseCents * rateBps) / 10000);
    if (recoveryCents <= 0) continue;
    // Real, targeted signal (not a blanket warning): amount_passed_to_subrecipients_cents
    // (SEFA field, migration 229) means this grant involves subawards, so the subaward-
    // portion-above-$25K/$50K MTDC exclusion applies -- something is_mtdc_excluded structurally
    // cannot express (it excludes a whole account, not a per-subaward dollar threshold). See
    // migration 251.
    const subawardWarning = grant.amount_passed_to_subrecipients_cents != null && Number(grant.amount_passed_to_subrecipients_cents) > 0
      ? 'This grant has subaward activity -- MTDC should exclude the portion of each subaward above $25,000 (awards before Oct 1 2024) or $50,000 (on/after), which this computed base does NOT account for. Adjust manually if any subaward exceeded the threshold.'
      : null;
    out.push({
      grant_id: grant.id, grant_name: grant.name,
      indirect_cost_rate_type: grant.indirect_cost_rate_type, rate_bps: rateBps,
      indirect_cost_base: grant.indirect_cost_base,
      mtdc_base_cents: baseCents, recovery_amount_cents: recoveryCents,
      subaward_warning: subawardWarning,
    });
  }
  return out;
}

async function runIndirectRecovery(pool, { orgId, userId, periodStartDate, periodEndDate, debitAccountId, creditAccountId, programId }) {
  const due = await previewIndirectRecovery(pool, orgId, periodStartDate, periodEndDate);
  const posted = [];
  const failed = [];
  for (const d of due) {
    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: periodEndDate,
      memo: 'Indirect cost recovery: ' + d.grant_name + ' (' + periodStartDate + ' to ' + periodEndDate + ')',
      payee: null, referenceNumber: null,
      lines: [
        { account_id: debitAccountId, program_id: programId, grant_id: d.grant_id, debit_cents: d.recovery_amount_cents, credit_cents: 0 },
        { account_id: creditAccountId, program_id: programId, grant_id: d.grant_id, debit_cents: 0, credit_cents: d.recovery_amount_cents },
      ],
      source: 'indirect_cost_recovery',
      internalApproval: { approvedBy: userId, sourceRefId: d.grant_id, sourceRefType: 'org_grants' },
    });
    if (result.httpStatus >= 400) {
      failed.push({ grant_id: d.grant_id, error: result.body.error || result.body.message });
      continue;
    }
    const insertR = await pool.query(
      `INSERT INTO org_indirect_cost_recovery_entries
         (org_id, grant_id, period_start_date, period_end_date, mtdc_base_cents, rate_bps, recovery_amount_cents, ledger_transaction_id, posted_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (grant_id, period_start_date, period_end_date) DO NOTHING
       RETURNING id`,
      [orgId, d.grant_id, periodStartDate, periodEndDate, d.mtdc_base_cents, d.rate_bps, d.recovery_amount_cents, result.body.id, userId]
    );
    if (!insertR.rows.length) continue;
    posted.push({ grant_id: d.grant_id, recovery_amount_cents: String(d.recovery_amount_cents), ledger_transaction_id: result.body.id });
  }
  return { posted, failed };
}

module.exports = { computeMtdcBase, previewIndirectRecovery, runIndirectRecovery };
