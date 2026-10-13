'use strict';

async function waitingForAnAsset(pool, orgId) {
  const th = await pool.query('SELECT capitalization_threshold_cents FROM org_settings WHERE org_id = $1', [orgId]);
  const threshold = th.rows.length ? Number(th.rows[0].capitalization_threshold_cents) : 500000;
  const cost = await pool.query(
    `WITH accum AS (
       SELECT id FROM org_accounts WHERE org_id = $1 AND (lower(name) LIKE 'accumulated%' OR id IN (SELECT accumulated_depreciation_account_id FROM org_fixed_assets WHERE org_id = $1))
     ), costs AS (
       SELECT id, code, name FROM org_accounts WHERE org_id = $1 AND standard_category = 'ASSET_FIXED' AND is_posting AND id NOT IN (SELECT id FROM accum)
     )
     SELECT t.id AS transaction_id, t.transaction_date::text AS date, COALESCE(NULLIF(t.memo, ''), t.payee, '') AS description, t.payee,
            c.id AS account_id, c.code AS account_code, c.name AS account_name,
            SUM(l.debit_cents - l.credit_cents)::bigint AS amount_cents,
            (SELECT fa.id FROM org_fixed_assets fa WHERE fa.org_id = $1 AND fa.acquisition_ledger_transaction_id IS NULL AND fa.asset_account_id = c.id
                AND fa.cost_cents = SUM(l.debit_cents - l.credit_cents) AND ABS(fa.acquisition_date - t.transaction_date) <= 60 ORDER BY fa.id LIMIT 1) AS suggested_asset_id,
            (SELECT fa.name FROM org_fixed_assets fa WHERE fa.org_id = $1 AND fa.acquisition_ledger_transaction_id IS NULL AND fa.asset_account_id = c.id
                AND fa.cost_cents = SUM(l.debit_cents - l.credit_cents) AND ABS(fa.acquisition_date - t.transaction_date) <= 60 ORDER BY fa.id LIMIT 1) AS suggested_asset_name
       FROM org_ledger_transactions t
       JOIN org_ledger_lines l ON l.transaction_id = t.id
       JOIN costs c ON c.id = l.account_id
      WHERE t.org_id = $1 AND t.status = 'posted'
        AND t.source NOT IN ('fixed_asset_disposal', 'fixed_asset_depreciation')
        AND NOT EXISTS (SELECT 1 FROM org_fixed_assets fa WHERE fa.acquisition_ledger_transaction_id = t.id)
      GROUP BY t.id, t.transaction_date, t.memo, t.payee, c.id, c.code, c.name
     HAVING SUM(l.debit_cents - l.credit_cents) > 0 AND SUM(l.debit_cents - l.credit_cents) >= $2
      ORDER BY t.transaction_date, t.id`, [orgId, threshold]);
  const dep = await pool.query(
    `SELECT COALESCE((SELECT SUM(l.credit_cents - l.debit_cents) FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
                       WHERE t.org_id = $1 AND t.status = 'posted'
                         AND l.account_id IN (SELECT id FROM org_accounts WHERE org_id = $1 AND standard_category = 'ASSET_FIXED'
                                               AND (lower(name) LIKE 'accumulated%' OR id IN (SELECT accumulated_depreciation_account_id FROM org_fixed_assets WHERE org_id = $1)))), 0)::bigint AS books_cents,
            COALESCE((SELECT SUM(e.amount_cents) FROM org_fixed_asset_depreciation_entries e JOIN org_fixed_assets fa ON fa.id = e.fixed_asset_id
                       WHERE fa.org_id = $1 AND fa.status <> 'disposed'), 0)::bigint
          + COALESCE((SELECT SUM(prior_depreciation_cents) FROM org_fixed_assets WHERE org_id = $1 AND status <> 'disposed'), 0)::bigint AS register_cents`, [orgId]);
  const unassigned = BigInt(dep.rows[0].books_cents) - BigInt(dep.rows[0].register_cents);
  return {
    cost_entries: cost.rows.map((r) => ({ ...r, amount_cents: String(r.amount_cents) })),
    capitalization_threshold_cents: threshold,
    depreciation_unassigned_cents: String(unassigned > 0n ? unassigned : 0n),
  };
}

module.exports = { waitingForAnAsset };
