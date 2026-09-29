'use strict';
const { evaluateProjectionFormula } = require('./OrganizationalFormulaEvaluator');

function ytdCalendarMonthForFiscalYear(fiscalYear) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (fiscalYear < y) return 12;
  if (fiscalYear > y) return 0;
  return m;
}

function toCents(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function monthlyFromAnnual(annualCents) {
  const total = toCents(annualCents);
  const base = total >= 0 ? Math.floor(total / 12) : Math.ceil(total / 12);
  const arr = new Array(12).fill(base);
  arr[11] += total - base * 12;
  return arr;
}

function monthPatternFromBps(monthlyRows) {
  const out = new Array(12).fill(0);
  if (!Array.isArray(monthlyRows) || monthlyRows.length === 0) return { values: out, hasCustom: false };
  monthlyRows.forEach((r) => {
    const m = Number(r.period_month);
    if (m >= 1 && m <= 12) out[m - 1] = Number(r.percent_bps) || 0;
  });
  return { values: out, hasCustom: true };
}

function allocateByBps(totalCents, bpsByMonth) {
  const total = toCents(totalCents);
  const raw = bpsByMonth.map((b) => Math.trunc((total * (Number(b) || 0)) / 10000));
  let used = raw.reduce((s, n) => s + n, 0);
  raw[11] += total - used;
  return raw;
}

/**
 * Resolve per-month projected cents + source for account/program cells.
 * Keys: `${account_id}:${program_id}:${month}` => { value_cents, source, schedule_name? }
 */
async function resolveProjected(pool, params) {
  const orgId = Number(params.orgId);
  const fiscalYear = Number(params.fiscalYear);
  const accountIds = Array.isArray(params.accountIds) && params.accountIds.length ? params.accountIds.map(Number) : null;
  const programIds = Array.isArray(params.programIds) && params.programIds.length ? params.programIds.map(Number) : null;
  if (!Number.isInteger(orgId) || !Number.isInteger(fiscalYear)) {
    throw new Error('resolveProjected requires orgId and fiscalYear');
  }

  const whereAcc = accountIds ? ' AND x.account_id = ANY($3::int[])' : '';
  const whereProg = programIds ? ` AND x.program_id = ANY($${accountIds ? 4 : 3}::int[])` : '';
  const p = [orgId, fiscalYear];
  if (accountIds) p.push(accountIds);
  if (programIds) p.push(programIds);

  const ytd = ytdCalendarMonthForFiscalYear(fiscalYear);
  const out = new Map();
  const formulaErrorByCell = new Map();

  // 4) Derived fallback base
  const derivedR = await pool.query(
    `WITH budget AS (
       SELECT bl.account_id, bl.program_id, bl.month, SUM(bl.amount_cents)::bigint AS c
       FROM org_budget_lines bl
       WHERE bl.org_id = $1 AND bl.fiscal_year = $2 ${accountIds ? 'AND bl.account_id = ANY($3::int[])' : ''} ${programIds ? `AND bl.program_id = ANY($${accountIds ? 4 : 3}::int[])` : ''}
       GROUP BY bl.account_id, bl.program_id, bl.month
     ),
     actual AS (
       SELECT a.org_account_id AS account_id, a.org_program_id AS program_id, a.period_month AS month, SUM(a.amount_cents)::bigint AS c
       FROM org_actuals a
       WHERE a.org_id = $1 AND a.period_year = $2
         AND a.status = 'confirmed'::org_actual_status
         AND a.org_account_id IS NOT NULL AND a.org_program_id IS NOT NULL
         ${accountIds ? 'AND a.org_account_id = ANY($3::int[])' : ''} ${programIds ? `AND a.org_program_id = ANY($${accountIds ? 4 : 3}::int[])` : ''}
       GROUP BY a.org_account_id, a.org_program_id, a.period_month
     )
     SELECT COALESCE(b.account_id, a.account_id) AS account_id,
            COALESCE(b.program_id, a.program_id) AS program_id,
            COALESCE(b.month, a.month) AS month,
            COALESCE(b.c, 0)::bigint AS budget_cents,
            COALESCE(a.c, 0)::bigint AS actual_cents
     FROM budget b
     FULL OUTER JOIN actual a
       ON b.account_id = a.account_id AND b.program_id = a.program_id AND b.month = a.month`,
    p
  );
  for (const r of derivedR.rows) {
    const k = `${r.account_id}:${r.program_id}:${r.month}`;
    const v = Number(r.month) <= ytd ? toCents(r.actual_cents) : toCents(r.budget_cents);
    out.set(k, { value_cents: v, source: 'derived' });
  }

  // 3) Allocation additive over derived only where no manual exists later
  const schParams = [orgId, fiscalYear];
  const schR = await pool.query(
    `SELECT s.id, s.name, s.distribution_type, s.monthly_pattern, s.total_amount_cents
     FROM org_allocation_schedules s
     WHERE s.org_id = $1 AND s.fiscal_year = $2 AND s.active = TRUE
     ORDER BY s.id ASC`,
    schParams
  );
  for (const s of schR.rows) {
    const linesR = await pool.query(
      `SELECT l.coop_program_id AS program_id, l.coop_account_id AS account_id, l.percent_bps, l.amount_cents
       FROM org_allocation_lines l
       WHERE l.coop_allocation_schedule_id = $1`,
      [s.id]
    );
    const monthlyR =
      String(s.monthly_pattern) === 'monthly_custom'
        ? await pool.query(
            `SELECT period_month, percent_bps
             FROM org_allocation_monthly
             WHERE coop_allocation_schedule_id = $1
             ORDER BY period_month ASC`,
            [s.id]
          )
        : { rows: [] };
    for (const l of linesR.rows) {
      if (accountIds && !accountIds.includes(Number(l.account_id))) continue;
      if (programIds && !programIds.includes(Number(l.program_id))) continue;
      const lineTotal =
        String(s.distribution_type) === 'fixed_percent_by_program'
          ? Math.trunc((toCents(s.total_amount_cents) * (Number(l.percent_bps) || 0)) / 10000)
          : toCents(l.amount_cents);
      const byMonth =
        String(s.monthly_pattern) === 'monthly_custom'
          ? allocateByBps(lineTotal, monthPatternFromBps(monthlyR.rows).values)
          : monthlyFromAnnual(lineTotal);
      for (let m = 1; m <= 12; m += 1) {
        const k = `${l.account_id}:${l.program_id}:${m}`;
        const prev = out.get(k) || { value_cents: 0, source: 'derived' };
        out.set(k, {
          value_cents: toCents(prev.value_cents) + toCents(byMonth[m - 1]),
          source: 'allocation',
          schedule_name: s.name || null,
        });
      }
    }
  }

  const formulaRowsR = await pool.query(
    `SELECT p.coop_account_id AS account_id, p.coop_program_id AS program_id, p.period_month, p.formula
     FROM org_projections p
     WHERE p.org_id = $1 AND p.fiscal_year = $2 AND p.formula IS NOT NULL AND trim(p.formula) <> ''
       ${accountIds ? 'AND p.coop_account_id = ANY($3::int[])' : ''} ${programIds ? `AND p.coop_program_id = ANY($${accountIds ? 4 : 3}::int[])` : ''}`,
    p
  );
  for (const f of formulaRowsR.rows) {
    try {
      await evaluateProjectionFormula(pool, {
        orgId,
        fiscalYear,
        programId: Number(f.program_id),
        formula: String(f.formula || ''),
      });
      const key = `${Number(f.account_id)}:${Number(f.program_id)}:${f.period_month == null ? 'annual' : Number(f.period_month)}`;
      formulaErrorByCell.set(key, null);
    } catch (e) {
      const key = `${Number(f.account_id)}:${Number(f.program_id)}:${f.period_month == null ? 'annual' : Number(f.period_month)}`;
      formulaErrorByCell.set(key, String(e.message || 'Formula error'));
    }
  }

  // 2) Manual annual overrides replace month values for missing monthly
  const annR = await pool.query(
    `SELECT p.id, p.coop_account_id AS account_id, p.coop_program_id AS program_id, p.amount_cents
     FROM org_projections p
     WHERE p.org_id = $1 AND p.fiscal_year = $2 AND p.period_month IS NULL
       ${accountIds ? 'AND p.coop_account_id = ANY($3::int[])' : ''} ${programIds ? `AND p.coop_program_id = ANY($${accountIds ? 4 : 3}::int[])` : ''}`,
    p
  );
  for (const a of annR.rows) {
    const spread = monthlyFromAnnual(a.amount_cents);
    const fk = `${Number(a.account_id)}:${Number(a.program_id)}:annual`;
    const ferr = formulaErrorByCell.get(fk);
    for (let m = 1; m <= 12; m += 1) {
      const k = `${a.account_id}:${a.program_id}:${m}`;
      out.set(k, {
        value_cents: spread[m - 1],
        source: ferr ? 'formula_error' : formulaErrorByCell.has(fk) ? 'formula' : 'manual_annual',
        error: ferr || null,
      });
    }
  }

  // 1) Manual monthly overrides win
  const monR = await pool.query(
    `SELECT p.coop_account_id AS account_id, p.coop_program_id AS program_id, p.period_month, p.amount_cents
     FROM org_projections p
     WHERE p.org_id = $1 AND p.fiscal_year = $2 AND p.period_month IS NOT NULL
       ${accountIds ? 'AND p.coop_account_id = ANY($3::int[])' : ''} ${programIds ? `AND p.coop_program_id = ANY($${accountIds ? 4 : 3}::int[])` : ''}`,
    p
  );
  for (const m of monR.rows) {
    const k = `${m.account_id}:${m.program_id}:${m.period_month}`;
    const fk = `${Number(m.account_id)}:${Number(m.program_id)}:${Number(m.period_month)}`;
    const ferr = formulaErrorByCell.get(fk);
    out.set(k, {
      value_cents: toCents(m.amount_cents),
      source: ferr ? 'formula_error' : formulaErrorByCell.has(fk) ? 'formula' : 'manual_monthly',
      error: ferr || null,
    });
  }

  return out;
}

module.exports = { resolveProjected, ytdCalendarMonthForFiscalYear };
