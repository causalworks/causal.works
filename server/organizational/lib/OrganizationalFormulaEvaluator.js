'use strict';

const { Parser } = require('expr-eval');

const parser = new Parser({
  operators: {
    logical: false,
    comparison: false,
    in: false,
    assignment: false,
  },
});

async function evaluateProjectionFormula(pool, ctx) {
  const orgId = Number(ctx.orgId);
  const fiscalYear = Number(ctx.fiscalYear);
  const programId = Number(ctx.programId);
  const formula = String(ctx.formula || '').trim();
  if (!formula) throw new Error('formula required');

  let expr;
  try {
    expr = parser.parse(formula);
  } catch (e) {
    throw new Error('Invalid formula syntax');
  }

  const allowed = new Set(['actual_ytd', 'budget', 'prior_year_actual']);
  for (const m of formula.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const fn = String(m[1] || '');
    if (!allowed.has(fn)) throw new Error(`Unsupported function: ${fn}`);
  }

  async function byAccountCode(accountCode, sql, vals) {
    const acc = await pool.query(
      `SELECT id FROM org_accounts WHERE org_id = $1 AND code = $2 LIMIT 1`,
      [orgId, String(accountCode)]
    );
    if (!acc.rows[0]) return 0;
    const aid = Number(acc.rows[0].id);
    const r = await pool.query(sql, [orgId, fiscalYear, programId, aid, ...vals]);
    return Number(r.rows[0] && r.rows[0].c) || 0;
  }

  const scope = {
    actual_ytd: async (accountCode) =>
      byAccountCode(
        accountCode,
        `SELECT COALESCE(SUM(a.amount_cents),0)::bigint AS c
         FROM org_actuals a
         WHERE a.org_id = $1 AND a.period_year = $2 AND a.org_program_id = $3 AND a.org_account_id = $4
           AND a.status = 'confirmed'::org_actual_status
           AND a.period_month <= EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'UTC'))::int`,
        []
      ),
    budget: async (accountCode) =>
      byAccountCode(
        accountCode,
        `SELECT COALESCE(SUM(bl.amount_cents),0)::bigint AS c
         FROM org_budget_lines bl
         WHERE bl.org_id = $1 AND bl.fiscal_year = $2 AND bl.program_id = $3 AND bl.account_id = $4`,
        []
      ),
    prior_year_actual: async (accountCode) =>
      byAccountCode(
        accountCode,
        `SELECT COALESCE(SUM(a.amount_cents),0)::bigint AS c
         FROM org_actuals a
         WHERE a.org_id = $1 AND a.period_year = ($2 - 1) AND a.org_program_id = $3 AND a.org_account_id = $4
           AND a.status = 'confirmed'::org_actual_status`,
        []
      ),
  };

  // Replace whitelist function calls with numeric literals before evaluating.
  let resolved = formula;
  const re = /(actual_ytd|budget|prior_year_actual)\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;
  const replacements = [];
  let match;
  while ((match = re.exec(formula)) !== null) {
    replacements.push({ raw: match[0], fn: match[1], arg: match[2] });
  }
  for (const r of replacements) {
    if (!scope[r.fn]) throw new Error(`Unsupported function: ${r.fn}`);
    const v = await scope[r.fn](r.arg);
    // Replace every exact occurrence to keep repeated references deterministic.
    resolved = resolved.split(r.raw).join(String(v / 100));
  }

  let resultDollars = 0;
  try {
    resultDollars = Number(parser.evaluate(resolved));
  } catch (_) {
    throw new Error('Formula could not be evaluated');
  }
  if (!Number.isFinite(resultDollars)) throw new Error('Formula result is not finite');
  return { amount_cents: Math.round(resultDollars * 100), formula };
}

module.exports = { evaluateProjectionFormula };
