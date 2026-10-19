'use strict';

// Default retention for a document, from its category's rule. Callers pass the record date; the clock starts at the end of the fiscal year it falls in.

const FALLBACK = { retention_class: 'fixed_term', retention_years: 7, trigger: 'year_end' };

function pad(n) { return String(n).padStart(2, '0'); }

function fiscalYearEnd(dateStr, endMonth) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const m = Number(endMonth) || 12;
  let y = d.getUTCFullYear();
  if (d.getUTCMonth() + 1 > m) y += 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(last)}`;
}

function addYears(dateStr, years) {
  const y = Number(dateStr.slice(0, 4)) + years;
  return `${y}${dateStr.slice(4)}`;
}

async function resolveRetention(db, orgId, category, recordDate) {
  const rule = await db.query(
    `SELECT retention_class, retention_years, trigger FROM org_document_retention_rules
      WHERE category = $2 AND (org_id = $1 OR org_id IS NULL) ORDER BY org_id NULLS LAST LIMIT 1`, [orgId, category]);
  let r = rule.rows[0];
  if (!r) {
    const ex = await db.query(
      `SELECT default_retention_class AS retention_class, default_retention_years AS retention_years, 'year_end' AS trigger
         FROM org_document_expectations WHERE category = $2 AND (org_id = $1 OR org_id IS NULL) ORDER BY org_id NULLS LAST LIMIT 1`, [orgId, category]);
    r = ex.rows[0] || FALLBACK;
  }
  if (r.retention_class === 'permanent') return { retention_class: 'permanent', retention_years: null, retention_until: null };
  const years = r.retention_years || FALLBACK.retention_years;
  const base = recordDate || new Date().toISOString().slice(0, 10);
  let start = base;
  if (r.trigger === 'year_end') {
    const s = await db.query('SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1', [orgId]);
    start = fiscalYearEnd(base, s.rows[0] && s.rows[0].fiscal_year_end_month);
  }
  return { retention_class: 'fixed_term', retention_years: years, retention_until: addYears(start, years) };
}

module.exports = { resolveRetention, fiscalYearEnd };
