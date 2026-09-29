'use strict';

const COA_TYPES = new Set([
  'Bank',
  'Current Asset',
  'Fixed Asset',
  'Other Asset',
  'Current Liability',
  'Long-Term Liability',
  'Net Assets',
  'Income',
  'Expense',
  'Other Income',
  'Other Expense',
]);

const PROGRAM_TYPES = new Set(['program', 'activity']);

const GRANT_STATUSES = new Set(['prospect', 'applied', 'awarded', 'declined', 'closed']);

const GRANT_TYPES = new Set(['restricted', 'unrestricted', 'temporarily_restricted']);

const RESTRICTION_CLASSES = new Set(['unrestricted', 'temporarily_restricted', 'permanently_restricted']);

function pushErr(errors, row, msg) {
  errors.push({ row, message: msg });
}

function parseBool(raw, defaultVal = true) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultVal;
  const s = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return defaultVal;
}

function parseDecimal(raw, field, errors, row) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false };
  }
  const s = String(raw).trim().replace(/\s+/g, '');
  if (/[,$]/.test(s)) {
    pushErr(errors, row, `${field}: must be a plain decimal (no commas or currency symbols)`);
    return { ok: false };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    pushErr(errors, row, `${field}: invalid number`);
    return { ok: false };
  }
  return { ok: true, value: n };
}

function parseIsoDate(raw, field, errors, row, required) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (required) pushErr(errors, row, `${field} is required`);
    return null;
  }
  const s = String(raw).trim();
  // Strict ISO format first
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) { pushErr(errors, row, `${field}: invalid date`); return null; }
    return iso;
  }
  // Flexible fallback: M/D/YYYY, MM-DD-YYYY, etc.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  pushErr(errors, row, `${field}: use YYYY-MM-DD (got "${s}")`);
  return null;
}

function dollarsToCents(n) {
  return Math.round(Number(n) * 100);
}

function validateCoaRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const account_code = String(rec.account_code ?? '').trim();
    const account_name = String(rec.account_name ?? '').trim();
    const account_type = String(rec.account_type ?? '').trim();
    if (!account_code) pushErr(errors, i, 'account_code is required');
    if (!account_name) pushErr(errors, i, 'account_name is required');
    if (!account_type) pushErr(errors, i, 'account_type is required');
    else if (!COA_TYPES.has(account_type)) {
      pushErr(errors, i, `account_type must be one of: ${[...COA_TYPES].join(', ')}`);
    }
    normalized.push({
      account_code,
      account_name,
      account_type,
      category: String(rec.category ?? '').trim() || null,
      subcategory: String(rec.subcategory ?? '').trim() || null,
      description: String(rec.description ?? '').trim() || null,
      qb_xero_code: String(rec.qb_xero_code ?? '').trim() || null,
      active: parseBool(rec.active, true),
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

function validateProgramsRows(rows) {
  const errors = [];
  const programs = [];
  const activities = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const code = String(rec.code ?? '').trim();
    const name = String(rec.name ?? '').trim();
    const type = String(rec.type ?? '').trim().toLowerCase();
    if (!code) pushErr(errors, i, 'code is required');
    if (!name) pushErr(errors, i, 'name is required');
    if (!type || !PROGRAM_TYPES.has(type)) {
      pushErr(errors, i, 'type must be program or activity');
    }
    const parent_code = String(rec.parent_code ?? '').trim() || null;
    if (type === 'activity' && !parent_code) {
      pushErr(errors, i, 'parent_code is required when type is activity');
    }
    if (type === 'program' && parent_code) {
      pushErr(errors, i, 'parent_code must be blank when type is program');
    }
    const row = {
      code,
      name,
      type,
      parent_code,
      fiscal_year_start: String(rec.fiscal_year_start ?? '').trim() || null,
      fiscal_year_end: String(rec.fiscal_year_end ?? '').trim() || null,
      program_manager: String(rec.program_manager ?? '').trim() || null,
      description: String(rec.description ?? '').trim() || '',
      active: parseBool(rec.active, true),
    };
    if (type === 'activity') activities.push(row);
    else programs.push(row);
  }
  if (errors.length) return { errors, programs: [], activities: [] };
  return { errors, programs, activities };
}

function validateGrantsRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const grant_code = String(rec.grant_code ?? '').trim() || null;
    const funder_grant_id = String(rec.funder_grant_id ?? '').trim() || null;
    const funder = String(rec.funder ?? '').trim();
    const grant_name = String(rec.grant_name ?? '').trim();
    const status = String(rec.status ?? '').trim().toLowerCase();
    // grant_code is optional — auto-assigned by importer if blank
    if (!funder) pushErr(errors, i, 'funder is required');
    if (!grant_name) pushErr(errors, i, 'grant_name is required');
    if (!status || !GRANT_STATUSES.has(status)) {
      pushErr(errors, i, `status must be one of: ${[...GRANT_STATUSES].join(', ')}`);
    }

    let request_amount_cents = null;
    if (rec.request_amount !== undefined && rec.request_amount !== null && String(rec.request_amount).trim() !== '') {
      const p = parseDecimal(rec.request_amount, 'request_amount', errors, i);
      if (p.ok) request_amount_cents = dollarsToCents(p.value);
    }

    let forecast_amount_cents = null;
    if (rec.forecast_amount !== undefined && rec.forecast_amount !== null && String(rec.forecast_amount).trim() !== '') {
      const p = parseDecimal(rec.forecast_amount, 'forecast_amount', errors, i);
      if (p.ok) forecast_amount_cents = dollarsToCents(p.value);
    }

    let grant_amount_cents = null;
    if (rec.grant_amount !== undefined && rec.grant_amount !== null && String(rec.grant_amount).trim() !== '') {
      const p = parseDecimal(rec.grant_amount, 'grant_amount', errors, i);
      if (p.ok) grant_amount_cents = dollarsToCents(p.value);
    }

    let start_date = null;
    let end_date = null;
    if (status === 'awarded') {
      if (grant_amount_cents == null) pushErr(errors, i, 'grant_amount is required when status is awarded');
      start_date = parseIsoDate(rec.start_date, 'start_date', errors, i, true);
      end_date = parseIsoDate(rec.end_date, 'end_date', errors, i, true);
    } else {
      start_date = parseIsoDate(rec.start_date, 'start_date', errors, i, false);
      end_date = parseIsoDate(rec.end_date, 'end_date', errors, i, false);
    }

    let grant_type = null;
    if (rec.type !== undefined && rec.type !== null && String(rec.type).trim() !== '') {
      const t = String(rec.type).trim().toLowerCase();
      if (!GRANT_TYPES.has(t)) {
        pushErr(errors, i, 'type must be restricted, unrestricted, or temporarily_restricted');
      } else grant_type = t === 'unrestricted' ? 'unrestricted' : t;
    }

    let fy_allocations = null;
    if (rec.fy_allocations !== undefined && rec.fy_allocations != null && String(rec.fy_allocations).trim() !== '') {
      try {
        fy_allocations = JSON.parse(String(rec.fy_allocations).trim());
        if (fy_allocations !== null && (typeof fy_allocations !== 'object' || Array.isArray(fy_allocations))) {
          pushErr(errors, i, 'fy_allocations must be a JSON object');
          fy_allocations = null;
        }
      } catch (_) {
        pushErr(errors, i, 'fy_allocations must be valid JSON');
      }
    }

    const primary_program_code = String(rec.primary_program_code ?? '').trim() || null;

    const next_report_due = parseIsoDate(rec.next_report_due, 'next_report_due', errors, i, false);
    const final_report_submitted = parseIsoDate(
      rec.final_report_submitted,
      'final_report_submitted',
      errors,
      i,
      false
    );
    const renewal_application_due = parseIsoDate(
      rec.renewal_application_due,
      'renewal_application_due',
      errors,
      i,
      false
    );

    const loi_submitted_at       = parseIsoDate(rec.loi_submitted_at,       'loi_submitted_at',       errors, i, false);
    const application_submitted_at = parseIsoDate(rec.application_submitted_at, 'application_submitted_at', errors, i, false);
    const award_date             = parseIsoDate(rec.award_date,             'award_date',             errors, i, false);
    const period_start_date      = parseIsoDate(rec.period_start_date,      'period_start_date',      errors, i, false);
    const period_end_date        = parseIsoDate(rec.period_end_date,        'period_end_date',        errors, i, false);

    const notes = String(rec.notes ?? '').trim() || null;
    const institution_type = String(rec.institution_type ?? '').trim() || null;

    normalized.push({
      grant_code,
      funder_grant_id,
      funder,
      grant_name,
      request_amount_cents,
      grant_amount_cents,
      status,
      start_date,
      end_date,
      grant_type,
      primary_program_code,
      fy_allocations,
      next_report_due,
      final_report_submitted,
      renewal_application_due,
      loi_submitted_at,
      application_submitted_at,
      award_date,
      period_start_date,
      period_end_date,
      restrictions: String(rec.restrictions ?? '').trim() || null,
      institution_type,
      forecast_amount_cents,
      notes,
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

const WORKER_TYPES = new Set(['employee', 'contractor']);
const EMPLOYMENT_TYPES = new Set(['full-time', 'part-time', 'hourly', 'contract', 'seasonal']);
const CONTRACT_TYPES = new Set(['hourly', 'monthly', 'annual', 'project', 'ongoing']);
const HEALTH_TIERS = new Set(['employee', 'spouse', 'family', 'none']);
const FLSA_STATUSES = new Set(['exempt', 'non-exempt', 'hourly-non-exempt']);

/**
 * Personnel's one-to-many program-allocation shape (org_personnel_allocations, a real FK
 * child table -- distinct from Grants' fy_allocations, which is just a jsonb scalar column
 * with no child table behind it) is handled the same way Grants handles its own JSON-shaped
 * column: one CSV cell, `program_allocations`, holding a JSON object of
 * {"program_code": percent, ...}. Kept as a single cell rather than one row per allocation so
 * a bulk personnel roster stays one row per person, matching how the per-record form already
 * presents allocations (see budget-personnel.js's Program allocations section).
 */
function validatePersonnelRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const fy = Number.parseInt(String(rec.fiscal_year ?? '').trim(), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) pushErr(errors, i, 'fiscal_year must be a year 1900–2200');

    const full_name = String(rec.full_name ?? '').trim();
    if (!full_name) pushErr(errors, i, 'full_name is required');

    const worker_type = String(rec.worker_type ?? 'employee').trim().toLowerCase() || 'employee';
    if (!WORKER_TYPES.has(worker_type)) pushErr(errors, i, 'worker_type must be employee or contractor');
    const isEmployee = worker_type === 'employee';

    const title = String(rec.title ?? '').trim() || null;

    let fte_bps = 10000;
    if (rec.fte !== undefined && rec.fte !== null && String(rec.fte).trim() !== '') {
      const p = parseDecimal(rec.fte, 'fte', errors, i);
      if (p.ok) {
        if (p.value <= 0 || p.value > 2) pushErr(errors, i, 'fte must be between 0.01 and 2.0');
        else fte_bps = Math.round(p.value * 10000);
      }
    }

    let avg_hours_per_week = null;
    if (rec.avg_hours_per_week !== undefined && rec.avg_hours_per_week !== null && String(rec.avg_hours_per_week).trim() !== '') {
      const p = parseDecimal(rec.avg_hours_per_week, 'avg_hours_per_week', errors, i);
      if (p.ok) {
        if (p.value < 0 || p.value > 80) pushErr(errors, i, 'avg_hours_per_week must be between 0 and 80');
        else avg_hours_per_week = Math.round(p.value * 10) / 10;
      }
    }

    let start_month = 1;
    if (rec.start_month !== undefined && rec.start_month !== null && String(rec.start_month).trim() !== '') {
      const m = Number.parseInt(String(rec.start_month).trim(), 10);
      if (!Number.isInteger(m) || m < 1 || m > 12) pushErr(errors, i, 'start_month must be 1–12');
      else start_month = m;
    }
    let end_month = null;
    if (rec.end_month !== undefined && rec.end_month !== null && String(rec.end_month).trim() !== '') {
      const m = Number.parseInt(String(rec.end_month).trim(), 10);
      if (!Number.isInteger(m) || m < 1 || m > 12) pushErr(errors, i, 'end_month must be 1–12');
      else end_month = m;
    }

    const salary_account_code = String(rec.salary_account_code ?? '').trim() || null;
    const contractor_account_code = String(rec.contractor_account_code ?? '').trim() || null;

    let annual_salary_cents = null;
    let monthly_fee_cents = null;
    let employment_type = null;
    let contract_type = null;
    let health_tier = null;
    let flsa_status = null;

    if (isEmployee) {
      if (rec.annual_salary !== undefined && rec.annual_salary !== null && String(rec.annual_salary).trim() !== '') {
        const p = parseDecimal(rec.annual_salary, 'annual_salary', errors, i);
        if (p.ok) annual_salary_cents = dollarsToCents(p.value);
      }
      employment_type = String(rec.employment_type ?? 'full-time').trim().toLowerCase() || 'full-time';
      if (!EMPLOYMENT_TYPES.has(employment_type)) pushErr(errors, i, `employment_type must be one of: ${[...EMPLOYMENT_TYPES].join(', ')}`);
      health_tier = String(rec.health_tier ?? 'none').trim().toLowerCase() || 'none';
      if (!HEALTH_TIERS.has(health_tier)) pushErr(errors, i, `health_tier must be one of: ${[...HEALTH_TIERS].join(', ')}`);
      flsa_status = String(rec.flsa_status ?? 'exempt').trim().toLowerCase() || 'exempt';
      if (!FLSA_STATUSES.has(flsa_status)) pushErr(errors, i, `flsa_status must be one of: ${[...FLSA_STATUSES].join(', ')}`);
    } else {
      if (rec.monthly_fee !== undefined && rec.monthly_fee !== null && String(rec.monthly_fee).trim() !== '') {
        const p = parseDecimal(rec.monthly_fee, 'monthly_fee', errors, i);
        if (p.ok) monthly_fee_cents = dollarsToCents(p.value);
      }
      contract_type = String(rec.contract_type ?? 'ongoing').trim().toLowerCase() || 'ongoing';
      if (!CONTRACT_TYPES.has(contract_type)) pushErr(errors, i, `contract_type must be one of: ${[...CONTRACT_TYPES].join(', ')}`);
    }

    let program_allocations = null;
    if (rec.program_allocations !== undefined && rec.program_allocations != null && String(rec.program_allocations).trim() !== '') {
      try {
        program_allocations = JSON.parse(String(rec.program_allocations).trim());
        if (typeof program_allocations !== 'object' || Array.isArray(program_allocations) || program_allocations === null) {
          pushErr(errors, i, 'program_allocations must be a JSON object of {"program_code": percent}');
          program_allocations = null;
        }
      } catch (_) {
        pushErr(errors, i, 'program_allocations must be valid JSON');
      }
    }

    normalized.push({
      fiscal_year: fy,
      full_name,
      worker_type,
      title,
      fte_bps,
      avg_hours_per_week,
      start_month,
      end_month,
      salary_account_code,
      contractor_account_code,
      annual_salary_cents,
      monthly_fee_cents,
      employment_type,
      contract_type,
      health_tier,
      flsa_status,
      payroll_id: String(rec.payroll_id ?? '').trim() || null,
      department_code: String(rec.department_code ?? '').trim() || null,
      notes: String(rec.notes ?? '').trim() || null,
      program_allocations,
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

function validateBudgetLinesRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const fy = Number.parseInt(String(rec.fiscal_year ?? '').trim(), 10);
    const month = Number.parseInt(String(rec.month ?? '').trim(), 10);
    const account_code = String(rec.account_code ?? '').trim();
    const program_code = String(rec.program_code ?? '').trim();
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) pushErr(errors, i, 'fiscal_year must be a year 1900–2200');
    if (!Number.isInteger(month) || month < 1 || month > 12) pushErr(errors, i, 'month must be 1–12');
    if (!account_code) pushErr(errors, i, 'account_code is required');
    if (!program_code) pushErr(errors, i, 'program_code is required');

    let amountCents = null;
    let deleteRow = false;
    if (rec.amount === undefined || rec.amount === null || String(rec.amount).trim() === '') {
      deleteRow = true;
    } else {
      const p = parseDecimal(rec.amount, 'amount', errors, i);
      if (p.ok) amountCents = dollarsToCents(p.value);
    }

    normalized.push({
      fiscal_year: fy,
      month,
      account_code,
      program_code,
      activity_code: String(rec.activity_code ?? '').trim() || null,
      grant_code: String(rec.grant_code ?? '').trim() || null,
      amount_cents: amountCents,
      delete: deleteRow,
      notes: String(rec.notes ?? '').trim() || null,
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

function validateActualsRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const dateStr = parseIsoDate(rec.date, 'date', errors, i, true);
    if (!dateStr) continue;
    const account_code = String(rec.account_code ?? '').trim();
    const program_code = String(rec.program_code ?? '').trim();
    if (!account_code) pushErr(errors, i, 'account_code is required');
    if (!program_code) pushErr(errors, i, 'program_code is required');
    const p = parseDecimal(rec.amount, 'amount', errors, i);
    if (!p.ok) continue;
    if (p.value < 0) {
      pushErr(errors, i, 'amount must be non-negative; use account type for direction');
    }
    normalized.push({
      date: dateStr,
      account_code,
      program_code,
      activity_code: String(rec.activity_code ?? '').trim() || null,
      grant_code: String(rec.grant_code ?? '').trim() || null,
      amount_cents: dollarsToCents(Math.abs(p.value)),
      description: String(rec.description ?? '').trim() || null,
      reference: String(rec.reference ?? '').trim() || null,
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

function validateBalanceSheetRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  let asOf = null;
  const seenCodes = new Set();
  for (const rec of rows) {
    i += 1;
    const ad = parseIsoDate(rec.as_of_date, 'as_of_date', errors, i, true);
    if (ad) {
      if (asOf == null) asOf = ad;
      else if (asOf !== ad) {
        pushErr(errors, i, 'as_of_date must be identical for all rows in one import');
      }
    }
    const account_code = String(rec.account_code ?? '').trim();
    if (!account_code) pushErr(errors, i, 'account_code is required');
    else {
      const ck = account_code.toLowerCase();
      if (seenCodes.has(ck)) pushErr(errors, i, `duplicate account_code in file: ${account_code}`);
      seenCodes.add(ck);
    }
    const p = parseDecimal(rec.balance, 'balance', errors, i);
    if (!p.ok) continue;
    let restriction_class = null;
    if (rec.restriction_class !== undefined && rec.restriction_class != null && String(rec.restriction_class).trim() !== '') {
      const rc = String(rec.restriction_class).trim().toLowerCase();
      if (!RESTRICTION_CLASSES.has(rc)) {
        pushErr(errors, i, 'restriction_class must be unrestricted, temporarily_restricted, or permanently_restricted');
      } else restriction_class = rc;
    }
    normalized.push({
      as_of_date: ad,
      account_code,
      balance_cents: dollarsToCents(p.value),
      restriction_class,
      notes: String(rec.notes ?? '').trim() || null,
    });
  }
  if (errors.length) return { errors, normalized: [] };
  return { errors, normalized };
}

function mapCoaCsvTypeToNp(csvType) {
  const t = String(csvType || '').trim();
  switch (t) {
    case 'Bank':
    case 'Current Asset':
    case 'Fixed Asset':
    case 'Other Asset':
      return 'asset';
    case 'Current Liability':
    case 'Long-Term Liability':
      return 'liability';
    case 'Net Assets':
      return 'equity';
    case 'Income':
    case 'Other Income':
      return 'income';
    case 'Expense':
    case 'Other Expense':
      return 'expense';
    default:
      return 'expense';
  }
}

const CONSTITUENT_TYPES_SET = new Set(['foundation', 'individual', 'board', 'prospect', 'member_org']);

function validateConstituentsRows(rows) {
  const errors = [];
  const normalized = [];
  let i = 0;
  for (const rec of rows) {
    i += 1;
    const display_name = String(rec.display_name ?? '').trim();
    if (!display_name) { pushErr(errors, i, 'display_name is required'); continue; }

    let type = String(rec.type ?? 'individual').trim().toLowerCase();
    if (!CONSTITUENT_TYPES_SET.has(type)) type = 'individual';

    const email = String(rec.email ?? '').trim() || null;
    const phone = String(rec.phone ?? '').trim() || null;
    const mailing_address = String(rec.mailing_address ?? '').trim() || null;
    const website = String(rec.website ?? '').trim() || null;
    const notes = String(rec.notes ?? '').trim() || null;

    // tags: comma-separated string → array
    let tags = null;
    if (rec.tags && String(rec.tags).trim()) {
      const arr = String(rec.tags).split(',').map(t => t.trim()).filter(Boolean);
      if (arr.length) tags = arr;
    }

    normalized.push({ display_name, type, email, phone, mailing_address, website, notes, tags });
  }
  return { errors, normalized };
}

module.exports = {
  validateCoaRows,
  validateProgramsRows,
  validateGrantsRows,
  validatePersonnelRows,
  validateConstituentsRows,
  validateBudgetLinesRows,
  validateActualsRows,
  validateBalanceSheetRows,
  mapCoaCsvTypeToNp,
  COA_TYPES,
  GRANT_STATUSES,
};
