'use strict';

/**
 * Fiscal-year boundary math, generalized from the ad hoc version in
 * donors.js's giving-summary date filter. Convention (matches existing
 * usage throughout the codebase): `fiscal_year` is the calendar year in
 * which the FY ENDS. If fyEndMonth=12 the FY is a plain calendar year;
 * otherwise it starts in (fiscal_year - 1) at (fyEndMonth + 1) and ends in
 * fiscal_year at fyEndMonth.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {number} fiscalYear
 * @param {number|null|undefined} fyEndMonth 1-12; defaults to 12 (calendar year)
 * @returns {{ startDate: string, endDate: string }} ISO date strings (YYYY-MM-DD)
 */
function fyDateRange(fiscalYear, fyEndMonth) {
  const endMonth = Number.isInteger(fyEndMonth) && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  const startYear = endMonth === 12 ? fiscalYear : fiscalYear - 1;
  const startMonth = endMonth === 12 ? 1 : endMonth + 1;
  const endYear = fiscalYear;

  const startDate = `${startYear}-${pad2(startMonth)}-01`;
  const endDate = `${endYear}-${pad2(endMonth)}-${pad2(lastDayOfMonth(endYear, endMonth))}`;
  return { startDate, endDate };
}

/**
 * Which fiscal_year a calendar date falls in, given the org's FY end month.
 * @param {string|Date} date
 * @param {number|null|undefined} fyEndMonth
 * @returns {number}
 */
function fiscalYearForDate(date, fyEndMonth) {
  const endMonth = Number.isInteger(fyEndMonth) && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12

  if (endMonth === 12) return y;
  // FY `y+1` covers (endMonth+1) of year y through endMonth of year y+1.
  return m > endMonth ? y + 1 : y;
}

function nextFiscalYear(fiscalYear) {
  return fiscalYear + 1;
}

/**
 * Shared DB lookup for an org's fiscal_year_end_month, so callers stop each
 * inlining their own `SELECT fiscal_year_end_month FROM org_settings ...`
 * (previously duplicated in grantCarryforward.js and scheduleCarryforward.js
 * against coop_members, pre migration 162).
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {number} orgId
 * @returns {Promise<number|null>}
 */
async function getFiscalYearEndMonth(pool, orgId) {
  const r = await pool.query('SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1', [orgId]);
  return r.rows[0] ? r.rows[0].fiscal_year_end_month : null;
}

module.exports = { fyDateRange, fiscalYearForDate, nextFiscalYear, getFiscalYearEndMonth };
