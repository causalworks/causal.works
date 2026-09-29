'use strict';

const { buildOrganizationalFinanceSnapshot } = require('./OrganizationalFinanceSnapshot');

const CACHE_MS = 24 * 60 * 60 * 1000;

function hasMeaningfulData(snapshot) {
  const bva = snapshot.budget_vs_actual_unscoped || {};
  if (Number(bva.total_budget_cents) > 0 || Number(bva.total_actual_cents) > 0) return true;
  if (Array.isArray(snapshot.grants) && snapshot.grants.length > 0) return true;
  const cash = snapshot.cash_runway || {};
  if (cash.months_reported != null || cash.cash_balance_cents != null) return true;
  return false;
}

function formatDollars(cents) {
  return Math.round(Number(cents) / 100).toLocaleString('en-US');
}

function fallbackSummary(snapshot) {
  const name = snapshot.org_display_name || 'Your organization';
  if (!hasMeaningfulData(snapshot)) {
    return `${name}: Add grants, budget lines, and (optionally) Xero actuals to unlock a tailored summary. You can set cash runway hints in cooperative_profile (runway_months or cash_balance_cents) when ready.`;
  }
  const bva = snapshot.budget_vs_actual_unscoped || {};
  const v = Number(bva.variance_cents) || 0;
  const parts = [];
  parts.push(
    `Expenses year to date (${snapshot.fiscal_year}): $${formatDollars(bva.total_actual_cents)} actual vs $${formatDollars(bva.total_budget_cents)} budgeted (${v >= 0 ? 'under' : 'over'} budget by $${formatDollars(Math.abs(v))}).`
  );
  const active = (snapshot.grants || []).filter((g) => {
    const st = String(g.status || '').toLowerCase();
    if (st !== 'awarded') return false;
    if (!g.end_date) return true;
    const t = new Date(String(g.end_date).slice(0, 10)).getTime();
    return !Number.isNaN(t) && t >= new Date(new Date().toISOString().slice(0, 10)).getTime();
  }).length;
  if (active) parts.push(`${active} active grant(s) — review utilization vs award amounts in the grant tracker.`);
  const rw = snapshot.cash_runway || {};
  if (rw.estimated_runway_months_from_cash != null) {
    parts.push(`Estimated runway ~${rw.estimated_runway_months_from_cash} mo from recorded cash vs recent expense pace.`);
  }
  return parts.join(' ');
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {number} fiscalYear
 * @param {{ refresh?: boolean }} [opts]
 * @returns {Promise<{ summary: string, source: string, cached: boolean, generated_at?: Date }>}
 */
async function getOrganizationalExecutiveSummaryText(pool, orgId, fiscalYear, opts = {}) {
  const refresh = !!opts.refresh;

  const cacheR = await pool.query(
    `SELECT ai_summary_text, ai_summary_generated_at, ai_summary_fiscal_year
     FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  const cr = cacheR.rows[0] || {};
  const cachedText = cr.ai_summary_text;
  const cachedAt = cr.ai_summary_generated_at;
  const cachedFy = cr.ai_summary_fiscal_year != null ? Number(cr.ai_summary_fiscal_year) : null;

  if (!refresh && cachedText && cachedAt && cachedFy === fiscalYear) {
    const age = Date.now() - new Date(cachedAt).getTime();
    if (age >= 0 && age < CACHE_MS) {
      return {
        summary: cachedText,
        source: 'cache',
        cached: true,
        generated_at: cachedAt,
      };
    }
  }

  const snapshot = await buildOrganizationalFinanceSnapshot(pool, orgId, fiscalYear);
  const summary = fallbackSummary(snapshot);
  const source = 'fallback';

  await pool.query(
    `UPDATE org_settings SET ai_summary_text = $2, ai_summary_generated_at = NOW(),
        ai_summary_fiscal_year = $3::smallint, updated_at = NOW() WHERE org_id = $1`,
    [orgId, summary, fiscalYear]
  );

  const genR = await pool.query(`SELECT ai_summary_generated_at FROM org_settings WHERE org_id = $1 LIMIT 1`, [orgId]);
  const generatedAt = genR.rows[0] && genR.rows[0].ai_summary_generated_at;

  return {
    summary,
    source,
    cached: false,
    generated_at: generatedAt,
  };
}

/**
 * Clears the cached executive-summary text so the dashboard header recomputes
 * from live budget/actuals data on next load, instead of serving a stale
 * pre-edit snapshot for up to CACHE_MS.
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 */
async function invalidateOrganizationalSummaryCache(pool, orgId) {
  await pool.query(
    `UPDATE org_settings SET ai_summary_text = NULL, ai_summary_generated_at = NULL,
        ai_summary_fiscal_year = NULL WHERE org_id = $1`,
    [orgId]
  );
}

module.exports = {
  getOrganizationalExecutiveSummaryText,
  hasMeaningfulData,
  fallbackSummary,
  invalidateOrganizationalSummaryCache,
  CACHE_MS,
};
