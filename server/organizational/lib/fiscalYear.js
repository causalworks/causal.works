'use strict';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function fyDateRange(fiscalYear, fyEndMonth) {
  const endMonth = Number.isInteger(fyEndMonth) && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  const startYear = endMonth === 12 ? fiscalYear : fiscalYear - 1;
  const startMonth = endMonth === 12 ? 1 : endMonth + 1;
  const endYear = fiscalYear;

  const startDate = `${startYear}-${pad2(startMonth)}-01`;
  const endDate = `${endYear}-${pad2(endMonth)}-${pad2(lastDayOfMonth(endYear, endMonth))}`;
  return { startDate, endDate };
}

function fiscalYearForDate(date, fyEndMonth) {
  const endMonth = Number.isInteger(fyEndMonth) && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;

  if (endMonth === 12) return y;
  return m > endMonth ? y + 1 : y;
}

function nextFiscalYear(fiscalYear) {
  return fiscalYear + 1;
}

async function getFiscalYearEndMonth(pool, orgId) {
  const r = await pool.query('SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1', [orgId]);
  return r.rows[0] ? r.rows[0].fiscal_year_end_month : null;
}

module.exports = { fyDateRange, fiscalYearForDate, nextFiscalYear, getFiscalYearEndMonth };
