'use strict';

// Straight-line depreciation schedule for a fixed asset and the periods still due through a date.

function lastDayOfMonthIso(year, month) {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function depreciationSchedule(asset) {
  const base = Number(asset.cost_cents) - Number(asset.salvage_value_cents);
  const months = asset.useful_life_months;
  const monthlyCents = Math.floor(base / months);
  const acqDate = new Date(asset.acquisition_date + 'T00:00:00');
  let year = acqDate.getFullYear();
  let month = acqDate.getMonth() + 1;
  const periods = [];
  let runningTotal = 0;
  for (let i = 1; i <= months; i++) {
    const amount = i === months ? (base - runningTotal) : monthlyCents;
    runningTotal += amount;
    periods.push({ period_date: lastDayOfMonthIso(year, month), amount_cents: amount });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return periods;
}

async function computeDuePeriods(pool, orgId, throughDate) {
  const assetsR = await pool.query(
    `SELECT * FROM org_fixed_assets WHERE org_id = $1 AND status = 'active' AND acquisition_date <= $2`,
    [orgId, throughDate]
  );
  const due = [];
  for (const asset of assetsR.rows) {
    const schedule = depreciationSchedule(asset);
    const postedR = await pool.query(
      `SELECT period_date::text AS period_date FROM org_fixed_asset_depreciation_entries WHERE fixed_asset_id = $1`,
      [asset.id]
    );
    const postedSet = new Set(postedR.rows.map((r) => r.period_date));
    for (const period of schedule) {
      if (period.period_date > throughDate) break;
      if (postedSet.has(period.period_date)) continue;
      if (asset.prior_depreciation_through && period.period_date <= String(asset.prior_depreciation_through).slice(0, 10)) continue;
      due.push({ asset_id: asset.id, asset_name: asset.name, period_date: period.period_date, amount_cents: period.amount_cents, asset });
    }
  }
  return due;
}

module.exports = { depreciationSchedule, computeDuePeriods };
