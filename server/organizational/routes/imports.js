'use strict';

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { parseCsvRecords } = require('../lib/csvParse');
const { invalidateOrganizationalSummaryCache } = require('../lib/OrganizationalSummaryService');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const {
  validateCoaRows,
  validateProgramsRows,
  validateGrantsRows,
  validatePersonnelRows,
  validateBudgetLinesRows,
  validateActualsRows,
  validateBalanceSheetRows,
  mapCoaCsvTypeToNp,
} = require('../lib/importValidators');
const { calculatePersonnelProjections } = require('../lib/personnelCalculator');
const { recalcPersonnelBudget } = require('../lib/personnelRecalc');
const { requireImportedActuals } = require('../lib/requireImportedActuals');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function jsonSummary(inserted, updated, skipped, errors) {
  return { inserted, updated, skipped, errors: errors || [] };
}

async function loadAccountCodeMap(client, orgId) {
  const r = await client.query(`SELECT id, code, type::text AS type FROM org_accounts WHERE org_id = $1`, [orgId]);
  const m = new Map();
  for (const row of r.rows) {
    m.set(String(row.code || '').trim().toLowerCase(), row);
  }
  return m;
}

async function loadProgramCodeMap(client, orgId) {
  const r = await client.query(
    `SELECT id, code, parent_id, name FROM org_programs WHERE org_id = $1`,
    [orgId]
  );
  const m = new Map();
  for (const row of r.rows) {
    if (row.code != null && String(row.code).trim() !== '') {
      m.set(String(row.code).trim().toLowerCase(), row);
    }
  }
  return m;
}

async function loadGrantCodeMap(client, orgId) {
  const r = await client.query(
    `SELECT id, grant_code FROM org_grants WHERE org_id = $1 AND grant_code IS NOT NULL`,
    [orgId]
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(String(row.grant_code || '').trim().toLowerCase(), row);
  }
  return m;
}

async function logImport(pool, orgId, kind, inserted, updated, skipped, errSummary) {
  await pool.query(
    `INSERT INTO org_import_history (org_id, import_kind, inserted, updated, skipped, error_summary)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, kind, inserted, updated, skipped, errSummary]
  );
}

async function runCoaImport(client, orgId, rows) {
  let inserted = 0;
  let updated = 0;
  const accMap = await loadAccountCodeMap(client, orgId);

  // Determine account hierarchy from code pattern
  function classifyAccount(code) {
    const c = String(code || '').trim();
    if (c.startsWith('_H1_')) return { level: 1, isPosting: false };
    if (c.startsWith('_H2_')) return { level: 2, isPosting: false };
    return { level: 3, isPosting: true };
  }

  // First pass: create/update all accounts
  const accById = new Map(); // code -> { id, level }
  for (const row of rows) {
    const code = row.account_code;
    const key = code.trim().toLowerCase();
    const accountType = mapCoaCsvTypeToNp(row.account_type);
    const { level, isPosting } = classifyAccount(code);
    const ex = accMap.get(key);

    if (ex) {
      await client.query(
        `UPDATE org_accounts SET
           name = $1,
           type = $2::org_account_type,
           qb_xero_code = $3,
           import_category = $4,
           import_subcategory = $5,
           import_description = $6,
           import_active = $7,
           level = $8,
           is_posting = $9,
           updated_at = NOW()
         WHERE id = $10 AND org_id = $11`,
        [
          row.account_name,
          accountType,
          row.qb_xero_code,
          row.category,
          row.subcategory,
          row.description,
          row.active,
          level,
          isPosting,
          ex.id,
          orgId,
        ]
      );
      accById.set(code, { id: ex.id, level });
      updated += 1;
    } else {
      const ins = await client.query(
        `INSERT INTO org_accounts (
           org_id, code, name, type, parent_id, is_posting, level,
           qb_xero_code, import_category, import_subcategory, import_description, import_active
         ) VALUES ($1, $2, $3, $4::org_account_type, NULL, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, code`,
        [
          orgId,
          code,
          row.account_name,
          accountType,
          isPosting,
          level,
          row.qb_xero_code,
          row.category,
          row.subcategory,
          row.description,
          row.active,
        ]
      );
      const nr = ins.rows[0];
      accById.set(code, { id: nr.id, level });
      accMap.set(key, { id: nr.id, code: nr.code, type: accountType });
      inserted += 1;
    }
  }

  // Second pass: set parent_id relationships
  // Pattern: _H2_* accounts should have parent = the matching _H1_* account
  // Posting accounts should have parent = their _H2_* subsection
  for (const row of rows) {
    const code = row.account_code;
    const { level } = classifyAccount(code);
    let parentCode = null;

    if (level === 2) {
      // _H2_EARNED -> _H1_REV, _H2_PROGRAM -> _H1_EXP, etc.
      const firstChar = code.substring(3); // Get the part after _H2_
      const sectionPrefix = code.substring(0, 3).replace('2', '1'); // Replace _H2_ with _H1_
      // Find matching section by scanning all rows to infer the mapping
      // For now, use heuristic: EARNED/CONTRIB belong to REV, PROGRAM/OPERATING belong to EXP
      if (code === '_H2_EARNED' || code === '_H2_CONTRIB') {
        parentCode = '_H1_REV';
      } else if (code === '_H2_PROGRAM' || code === '_H2_OPERATING') {
        parentCode = '_H1_EXP';
      }
    } else if (level === 3) {
      // Posting account - find its parent section from category or subcategory
      const category = String(row.category || row.subcategory || '').trim().toLowerCase();
      if (category.includes('earned') || category.includes('contributed')) {
        parentCode = category.includes('earned') ? '_H2_EARNED' : '_H2_CONTRIB';
      } else if (category.includes('program')) {
        parentCode = '_H2_PROGRAM';
      } else if (category.includes('operating')) {
        parentCode = '_H2_OPERATING';
      } else if (category.includes('in-kind')) {
        parentCode = '_H1_INC';
      }
    }

    if (parentCode && accById.get(parentCode)) {
      const parentId = accById.get(parentCode).id;
      const accId = accById.get(code).id;
      await client.query(
        `UPDATE org_accounts SET parent_id = $1 WHERE id = $2 AND org_id = $3`,
        [parentId, accId, orgId]
      );
    }
  }

  return { inserted, updated, skipped: 0 };
}

async function runProgramsImport(client, orgId, programs, activities) {
  let inserted = 0;
  let updated = 0;
  const pmap = await loadProgramCodeMap(client, orgId);

  async function upsertProgramRow(row, parentId) {
    const key = row.code.trim().toLowerCase();
    const ex = pmap.get(key);
    if (ex) {
      await client.query(
        `UPDATE org_programs SET
           name = $1,
           description = $2,
           active = $3,
           parent_id = $4,
           program_kind = $5,
           fiscal_year_start_mmdd = $6,
           fiscal_year_end_mmdd = $7,
           program_manager = $8,
           updated_at = NOW()
         WHERE id = $9 AND org_id = $10`,
        [
          row.name,
          row.description || '',
          row.active,
          parentId,
          row.type,
          row.fiscal_year_start,
          row.fiscal_year_end,
          row.program_manager,
          ex.id,
          orgId,
        ]
      );
      updated += 1;
      return ex.id;
    }
    const ins = await client.query(
      `INSERT INTO org_programs (
         org_id, code, name, description, active, parent_id, program_kind,
         fiscal_year_start_mmdd, fiscal_year_end_mmdd, program_manager, is_default
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)
       RETURNING id, code`,
      [
        orgId,
        row.code,
        row.name,
        row.description || '',
        row.active,
        parentId,
        row.type,
        row.fiscal_year_start,
        row.fiscal_year_end,
        row.program_manager,
      ]
    );
    const nr = ins.rows[0];
    pmap.set(String(nr.code).trim().toLowerCase(), { id: nr.id, code: nr.code, parent_id: parentId });
    inserted += 1;
    return nr.id;
  }

  for (const row of programs) {
    await upsertProgramRow(row, null);
  }
  for (const row of activities) {
    const pk = String(row.parent_code || '').trim().toLowerCase();
    const parent = pmap.get(pk);
    if (!parent) {
      throw new Error(`programs import: parent program code not found: ${row.parent_code}`);
    }
    await upsertProgramRow(row, parent.id);
  }
  return { inserted, updated, skipped: 0 };
}

async function runGrantsImport(client, orgId, rows, programMap) {
  let inserted = 0;
  let updated = 0;
  const gmap = await loadGrantCodeMap(client, orgId);

  // Find the next auto-code number (for rows with no grant_code)
  const autoRes = await client.query(
    `SELECT MAX(CAST(SUBSTRING(grant_code FROM 3) AS INTEGER)) AS maxn
     FROM org_grants
     WHERE org_id = $1 AND grant_code ~ '^G-[0-9]+$'`,
    [orgId]
  );
  let nextAutoNum = (autoRes.rows[0]?.maxn ?? 0) + 1;

  for (let row of rows) {
    let primaryProgramId = null;
    if (row.primary_program_code) {
      const pr = programMap.get(row.primary_program_code.trim().toLowerCase());
      if (!pr) throw new Error(`grants import: unknown primary_program_code ${row.primary_program_code}`);
      primaryProgramId = pr.id;
    }

    // Auto-generate grant_code if not provided
    if (!row.grant_code) {
      let candidate;
      do {
        candidate = 'G-' + String(nextAutoNum++).padStart(3, '0');
      } while (gmap.has(candidate.toLowerCase()));
      row = { ...row, grant_code: candidate };
    }

    const key = row.grant_code.trim().toLowerCase();
    const ex = gmap.get(key);
    const fyJson = row.fy_allocations != null ? JSON.stringify(row.fy_allocations) : null;

    if (ex) {
      await client.query(
        `UPDATE org_grants SET
           funder = $1,
           funder_grant_id = $2,
           name = $3,
           request_amount_cents = $4,
           amount_cents = $5,
           status = $6,
           start_date = $7,
           end_date = $8,
           grant_type = $9,
           primary_program_id = $10,
           fy_allocations = $11::jsonb,
           next_report_due = $12,
           final_report_submitted = $13,
           renewal_application_due = $14,
           restrictions = $15,
           notes = $16,
           loi_submitted_at = $17,
           application_submitted_at = $18,
           award_date = $19,
           period_start_date = $20,
           period_end_date = $21,
           institution_type = $22,
           forecast_amount_cents = $23,
           updated_at = NOW()
         WHERE id = $24 AND org_id = $25`,
        [
          row.funder,
          row.funder_grant_id ?? null,
          row.grant_name,
          row.request_amount_cents,
          row.grant_amount_cents,
          row.status,
          row.start_date,
          row.end_date,
          row.grant_type,
          primaryProgramId,
          fyJson,
          row.next_report_due,
          row.final_report_submitted,
          row.renewal_application_due,
          row.restrictions,
          row.notes,
          row.loi_submitted_at,
          row.application_submitted_at,
          row.award_date,
          row.period_start_date,
          row.period_end_date,
          row.institution_type ?? null,
          row.forecast_amount_cents ?? null,
          ex.id,
          orgId,
        ]
      );
      updated += 1;
    } else {
      const ins = await client.query(
        `INSERT INTO org_grants (
           org_id, grant_code, funder_grant_id, funder, name,
           request_amount_cents, amount_cents, status,
           start_date, end_date, grant_type, primary_program_id, fy_allocations,
           next_report_due, final_report_submitted, renewal_application_due, restrictions, notes,
           loi_submitted_at, application_submitted_at, award_date, period_start_date, period_end_date,
           institution_type,
           forecast_amount_cents
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING id, grant_code`,
        [
          orgId,
          row.grant_code,
          row.funder_grant_id ?? null,
          row.funder,
          row.grant_name,
          row.request_amount_cents,
          row.grant_amount_cents,
          row.status,
          row.start_date,
          row.end_date,
          row.grant_type,
          primaryProgramId,
          fyJson,
          row.next_report_due,
          row.final_report_submitted,
          row.renewal_application_due,
          row.restrictions,
          row.notes,
          row.loi_submitted_at,
          row.application_submitted_at,
          row.award_date,
          row.period_start_date,
          row.period_end_date,
          row.institution_type ?? null,
          row.forecast_amount_cents ?? null,
        ]
      );
      const nr = ins.rows[0];
      gmap.set(String(nr.grant_code).trim().toLowerCase(), { id: nr.id, grant_code: nr.grant_code });
      inserted += 1;
    }
  }
  return { inserted, updated, skipped: 0 };
}

/**
 * Match key for upsert: payroll_id when present (stable across a name change), else
 * fiscal_year + lower(full_name) — the same "natural key, re-runnable" posture as the other
 * importers (grant_code, account_code, account+program+month), so importing the same file
 * twice updates in place instead of duplicating rows.
 */
function personnelMatchKey(fiscalYear, payrollId, fullName) {
  return payrollId
    ? `${fiscalYear}|pid:${String(payrollId).trim().toLowerCase()}`
    : `${fiscalYear}|name:${String(fullName).trim().toLowerCase()}`;
}

async function runPersonnelImport(client, orgId, userId, rows, accMap, progMap) {
  let inserted = 0;
  let updated = 0;
  const fiscalYears = [...new Set(rows.map(r => r.fiscal_year))];

  const existingRes = await client.query(
    `SELECT id, fiscal_year, full_name, payroll_id FROM org_personnel WHERE org_id = $1 AND fiscal_year = ANY($2::int[])`,
    [orgId, fiscalYears]
  );
  const existingMap = new Map();
  for (const row of existingRes.rows) {
    existingMap.set(personnelMatchKey(row.fiscal_year, row.payroll_id, row.full_name), row.id);
  }

  for (const row of rows) {
    let salaryAccountId = null;
    if (row.salary_account_code) {
      const a = accMap.get(row.salary_account_code.trim().toLowerCase());
      if (!a) throw new Error(`personnel import: unknown salary_account_code ${row.salary_account_code}`);
      salaryAccountId = a.id;
    }
    let contractorAccountId = null;
    if (row.contractor_account_code) {
      const a = accMap.get(row.contractor_account_code.trim().toLowerCase());
      if (!a) throw new Error(`personnel import: unknown contractor_account_code ${row.contractor_account_code}`);
      contractorAccountId = a.id;
    }

    const key = personnelMatchKey(row.fiscal_year, row.payroll_id, row.full_name);
    const existingId = existingMap.get(key);
    let workerId;

    if (existingId) {
      await client.query(
        `UPDATE org_personnel SET
           worker_type = $1, full_name = $2, title = $3,
           salary_account_id = $4, annual_salary_cents = $5, fte_bps = $6,
           start_month = $7, end_month = $8, avg_hours_per_week = $9, health_tier = $10,
           employment_type = $11, contract_type = $12, payroll_id = $13, department_code = $14,
           flsa_status = $15, contractor_account_id = $16, monthly_fee_cents = $17, notes = $18,
           updated_by = $19, updated_at = NOW()
         WHERE id = $20 AND org_id = $21`,
        [
          row.worker_type, row.full_name, row.title,
          salaryAccountId, row.annual_salary_cents, row.fte_bps,
          row.start_month, row.end_month, row.avg_hours_per_week, row.health_tier,
          row.employment_type, row.contract_type, row.payroll_id, row.department_code,
          row.flsa_status, contractorAccountId, row.monthly_fee_cents, row.notes,
          userId, existingId, orgId,
        ]
      );
      workerId = existingId;
      updated += 1;
    } else {
      const ins = await client.query(
        `INSERT INTO org_personnel (
           org_id, fiscal_year, worker_type, full_name, title,
           salary_account_id, annual_salary_cents, fte_bps, start_month, end_month, avg_hours_per_week, health_tier,
           employment_type, contract_type, payroll_id, department_code, flsa_status,
           contractor_account_id, monthly_fee_cents, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)
         RETURNING id`,
        [
          orgId, row.fiscal_year, row.worker_type, row.full_name, row.title,
          salaryAccountId, row.annual_salary_cents, row.fte_bps, row.start_month, row.end_month, row.avg_hours_per_week, row.health_tier,
          row.employment_type, row.contract_type, row.payroll_id, row.department_code, row.flsa_status,
          contractorAccountId, row.monthly_fee_cents, row.notes, userId,
        ]
      );
      workerId = ins.rows[0].id;
      inserted += 1;
    }

    if (row.program_allocations) {
      await client.query(`DELETE FROM org_personnel_allocations WHERE coop_personnel_id = $1`, [workerId]);
      for (const [progCode, pct] of Object.entries(row.program_allocations)) {
        const pr = progMap.get(String(progCode).trim().toLowerCase());
        if (!pr) throw new Error(`personnel import: unknown program_allocations program_code ${progCode}`);
        const bps = Math.round(Number(pct) * 100);
        if (!Number.isFinite(bps) || bps <= 0) continue;
        await client.query(
          `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [workerId, orgId, pr.id, bps]
        );
      }
    }
  }

  // Projections/budget-line recalc happens after commit, in the route handler below, using
  // `pool` rather than this transaction's `client` -- calculatePersonnelProjections opens its
  // own internal pool.connect()'d transaction and cannot be handed an already-connected Client
  // (matches how personnel.js's own POST/PATCH worker routes call it: always with `pool`,
  // never wrapped in the same transaction as the row write itself).
  return { inserted, updated, skipped: 0, fiscalYears };
}

async function runBudgetLinesImport(client, orgId, rows, accMap, progMap, grantMap) {
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const row of rows) {
    const acc = accMap.get(row.account_code.trim().toLowerCase());
    if (!acc) throw new Error(`budget_lines: unknown account_code ${row.account_code}`);
    const prog = progMap.get(row.program_code.trim().toLowerCase());
    if (!prog) throw new Error(`budget_lines: unknown program_code ${row.program_code}`);
    if (prog.parent_id != null) {
      throw new Error(`budget_lines: program_code must be a top-level program: ${row.program_code}`);
    }

    let activityId = null;
    if (row.activity_code) {
      const act = progMap.get(row.activity_code.trim().toLowerCase());
      if (!act || act.parent_id == null) {
        throw new Error(`budget_lines: activity_code must be an activity row: ${row.activity_code}`);
      }
      if (Number(act.parent_id) !== Number(prog.id)) {
        throw new Error(
          `budget_lines: activity ${row.activity_code} does not belong under program ${row.program_code}`
        );
      }
      activityId = act.id;
    }

    let grantId = null;
    if (row.grant_code) {
      const g = grantMap.get(row.grant_code.trim().toLowerCase());
      if (!g) throw new Error(`budget_lines: unknown grant_code ${row.grant_code}`);
      grantId = g.id;
    }

    const ex = await client.query(
      `SELECT id FROM org_budget_lines
       WHERE org_id = $1 AND account_id = $2 AND program_id = $3
         AND COALESCE(activity_id, -1) = COALESCE($4, -1)
         AND fiscal_year = $5 AND month = $6
         AND COALESCE(grant_id, -1) = COALESCE($7, -1)
       LIMIT 1`,
      [orgId, acc.id, prog.id, activityId, row.fiscal_year, row.month, grantId]
    );

    if (row.delete) {
      if (ex.rows.length) {
        await client.query(`DELETE FROM org_budget_lines WHERE id = $1`, [ex.rows[0].id]);
        deleted += 1;
      }
      continue;
    }

    if (ex.rows.length) {
      await client.query(
        `UPDATE org_budget_lines SET amount_cents = $1, updated_at = NOW() WHERE id = $2`,
        [row.amount_cents, ex.rows[0].id]
      );
      updated += 1;
    } else {
      await client.query(
        `INSERT INTO org_budget_lines (
           org_id, account_id, program_id, activity_id, grant_id, fiscal_year, month, amount_cents
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orgId, acc.id, prog.id, activityId, grantId, row.fiscal_year, row.month, row.amount_cents]
      );
      inserted += 1;
    }
  }
  if (inserted > 0 || updated > 0 || deleted > 0) {
    await invalidateOrganizationalSummaryCache(client, orgId);
  }
  return { inserted, updated, skipped: deleted };
}

async function runActualsImport(client, orgId, rows, accMap, progMap, grantMap) {
  let inserted = 0;
  let skipped = 0;
  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const acc = accMap.get(row.account_code.trim().toLowerCase());
    if (!acc) throw new Error(`actuals: unknown account_code ${row.account_code}`);
    const prog = progMap.get(row.program_code.trim().toLowerCase());
    if (!prog) throw new Error(`actuals: unknown program_code ${row.program_code}`);
    if (prog.parent_id != null) {
      throw new Error(`actuals: program_code must be a top-level program: ${row.program_code}`);
    }

    let programId = prog.id;
    let activityId = null;
    if (row.activity_code) {
      const act = progMap.get(row.activity_code.trim().toLowerCase());
      if (!act || act.parent_id == null) {
        throw new Error(`actuals: activity_code must reference an activity: ${row.activity_code}`);
      }
      if (Number(act.parent_id) !== Number(prog.id)) {
        throw new Error(
          `actuals: activity ${row.activity_code} does not belong under program ${row.program_code}`
        );
      }
      activityId = act.id;
      programId = act.parent_id;
    }

    let grantId = null;
    if (row.grant_code) {
      const g = grantMap.get(row.grant_code.trim().toLowerCase());
      if (!g) throw new Error(`actuals: unknown grant_code ${row.grant_code}`);
      grantId = g.id;
    }

    const d = new Date(row.date + 'T12:00:00Z');
    const period_year = d.getUTCFullYear();
    const period_month = d.getUTCMonth() + 1;

    const refSuffix =
      row.reference && String(row.reference).trim() !== ''
        ? String(row.reference).trim()
        : `noref-${period_year}-${period_month}-${acc.id}-${programId}-${idx}`;
    const dedupeKey = `csv:${refSuffix}`;
    const trackKey = `csv:${refSuffix}`.slice(0, 200);

    const dup = await client.query(
      `SELECT 1 FROM org_actuals WHERE org_id = $1 AND dedupe_key = $2 LIMIT 1`,
      [orgId, dedupeKey]
    );
    if (dup.rows.length) {
      skipped += 1;
      continue;
    }

    await client.query(
      `INSERT INTO org_actuals (
         org_id, status, source, dedupe_key, period_year, period_month,
         description, currency_code, amount_cents, xero_tracking_option_id,
         org_account_id, org_program_id, org_activity_id, grant_id,
         auto_matched_account, auto_matched_program, auto_matched_activity
       ) VALUES (
         $1, 'confirmed'::org_actual_status, 'csv', $2, $3, $4,
         $5, 'USD', $6, $7,
         $8, $9, $10, $11,
         TRUE, TRUE, TRUE
       )`,
      [
        orgId,
        dedupeKey,
        period_year,
        period_month,
        row.description,
        row.amount_cents,
        trackKey,
        acc.id,
        programId,
        activityId,
        grantId,
      ]
    );
    inserted += 1;
  }
  if (inserted > 0) {
    await invalidateOrganizationalSummaryCache(client, orgId);
  }
  return { inserted, updated: 0, skipped };
}

async function runBalanceSheetImport(client, orgId, rows, accMap) {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  const asOf = rows[0].as_of_date;
  await client.query(`DELETE FROM org_balance_sheet_snapshots WHERE org_id = $1 AND as_of_date = $2`, [
    orgId,
    asOf,
  ]);
  let inserted = 0;
  for (const row of rows) {
    const acc = accMap.get(row.account_code.trim().toLowerCase());
    if (!acc) throw new Error(`balance_sheet: unknown account_code ${row.account_code}`);
    const t = String(acc.type || '').toLowerCase();
    if (!['asset', 'liability', 'equity'].includes(t)) {
      throw new Error(`balance_sheet: account ${row.account_code} must be asset, liability, or equity (got ${t})`);
    }
    await client.query(
      `INSERT INTO org_balance_sheet_snapshots (
         org_id, as_of_date, coop_account_id, balance_cents, restriction_class, notes
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, asOf, acc.id, row.balance_cents, row.restriction_class, row.notes]
    );
    inserted += 1;
  }
  return { inserted, updated: 0, skipped: 0 };
}

function formatUsdFromCents(cents) {
  const n = Number(cents) || 0;
  return '$' + (n / 100).toFixed(2);
}

function escapeCSV(str) {
  if (!str) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowToCSV(row) {
  return Object.values(row).map(escapeCSV).join(',');
}

function buildCSVContent(headers, rows) {
  const lines = [headers.map(escapeCSV).join(',')];
  rows.forEach(row => {
    lines.push(rowToCSV(row));
  });
  return lines.join('\n');
}

function sendCSVDownload(res, filename, csvContent) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
}

function registerOrganizationalImportRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  // Only this page's own kinds -- org_import_history is a shared table (Bank Reconciliation's
  // CSV import logs a 'bank_statement' row here too), and this endpoint's one caller
  // (budget-settings.js's Imports panel) only has cards for the kinds below. Showing another
  // module's import status here read as confusing/out-of-place rather than useful (caught in
  // a 2026-09-15 layout review) -- filter at the source instead of leaking it to the client.
  const BUDGET_IMPORT_KINDS = ['coa', 'programs', 'grants', 'budget_lines', 'actuals', 'balance_sheet', 'personnel'];

  app.get('/api/organizational/orgs/:slug/import/history', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT DISTINCT ON (import_kind)
           import_kind, finished_at, inserted, updated, skipped, error_summary
         FROM org_import_history
         WHERE org_id = $1 AND import_kind = ANY($2::text[])
         ORDER BY import_kind, finished_at DESC`,
        [orgId, BUDGET_IMPORT_KINDS]
      );
      return res.json({ history: r.rows });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET import/history', e);
      return res.status(500).json({ error: 'Could not load import history' });
    }
  });

  function makeHandler(kind, validateFn, runFn) {
    return async (req, res) => {
      const orgId = req.orgId;
      if (!req.file || !req.file.buffer) {
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: 'Missing file field (CSV)' }]));
      }
      let parsed;
      try {
        parsed = parseCsvRecords(req.file.buffer);
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: 'Could not parse CSV: ' + e.message }]));
      }

      const v = validateFn(parsed.rows);
      if (v.errors && v.errors.length) {
        return res.status(400).json(jsonSummary(0, 0, 0, v.errors));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await runFn(client, orgId, v, parsed.rows);
        await client.query('COMMIT');
        await logImport(
          pool,
          orgId,
          kind,
          result.inserted,
          result.updated,
          result.skipped,
          null
        ).catch(() => {});
        return res.json(jsonSummary(result.inserted, result.updated, result.skipped, []));
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
        console.error(`POST import/${kind}`, e);
        const msg = e.message || 'Import failed';
        if (orgId) {
          await logImport(pool, orgId, kind, 0, 0, 0, msg).catch(() => {});
        }
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: msg }]));
      } finally {
        client.release();
      }
    };
  }

  app.post(
    '/api/organizational/orgs/:slug/import/coa',
    ...npAdmin,
    upload.single('file'),
    makeHandler('coa', (rows) => validateCoaRows(rows), async (client, orgId, v) =>
      runCoaImport(client, orgId, v.normalized)
    )
  );

  app.post(
    '/api/organizational/orgs/:slug/import/programs',
    ...npAdmin,
    upload.single('file'),
    makeHandler('programs', (rows) => validateProgramsRows(rows), async (client, orgId, v) =>
      runProgramsImport(client, orgId, v.programs, v.activities)
    )
  );

  app.post(
    '/api/organizational/orgs/:slug/import/grants',
    ...npAdmin,
    upload.single('file'),
    makeHandler('grants', (rows) => validateGrantsRows(rows), async (client, orgId, v) => {
      const programMap = await loadProgramCodeMap(client, orgId);
      return runGrantsImport(client, orgId, v.normalized, programMap);
    })
  );

  // Bespoke handler, not makeHandler -- unlike the other import kinds, Personnel needs a
  // post-commit recalc step (calculatePersonnelProjections opens its own pool.connect()'d
  // transaction and cannot run inside the row-write transaction; see runPersonnelImport).
  app.post(
    '/api/organizational/orgs/:slug/import/personnel',
    ...npAdmin,
    upload.single('file'),
    async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      if (!req.file || !req.file.buffer) {
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: 'Missing file field (CSV)' }]));
      }
      let parsed;
      try {
        parsed = parseCsvRecords(req.file.buffer);
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: 'Could not parse CSV: ' + e.message }]));
      }

      const v = validatePersonnelRows(parsed.rows);
      if (v.errors && v.errors.length) {
        return res.status(400).json(jsonSummary(0, 0, 0, v.errors));
      }

      const client = await pool.connect();
      let result;
      try {
        await client.query('BEGIN');
        const accMap = await loadAccountCodeMap(client, orgId);
        const progMap = await loadProgramCodeMap(client, orgId);
        result = await runPersonnelImport(client, orgId, userId, v.normalized, accMap, progMap);
        await client.query('COMMIT');
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('POST import/personnel', e);
        const msg = e.message || 'Import failed';
        await logImport(pool, orgId, 'personnel', 0, 0, 0, msg).catch(() => {});
        return res.status(400).json(jsonSummary(0, 0, 0, [{ row: 0, message: msg }]));
      } finally {
        client.release();
      }

      // Same auto-recalculate-after-write posture as the manual Personnel form endpoints
      // (personnel.js POST/PATCH) -- an import with no recalc would leave budget lines showing
      // pre-import numbers until someone happens to hit Recalculate by hand.
      for (const fy of result.fiscalYears || []) {
        try {
          await calculatePersonnelProjections(pool, orgId, fy, userId);
          await recalcPersonnelBudget(pool, orgId, fy);
        } catch (e) {
          console.error('personnel import recalc FY', fy, e.message);
        }
      }

      await logImport(pool, orgId, 'personnel', result.inserted, result.updated, result.skipped, null).catch(() => {});
      return res.json(jsonSummary(result.inserted, result.updated, result.skipped, []));
    }
  );

  app.post(
    '/api/organizational/orgs/:slug/import/budget-lines',
    ...npAdmin,
    upload.single('file'),
    makeHandler('budget_lines', (rows) => validateBudgetLinesRows(rows), async (client, orgId, v) => {
      const accMap = await loadAccountCodeMap(client, orgId);
      const progMap = await loadProgramCodeMap(client, orgId);
      const grantMap = await loadGrantCodeMap(client, orgId);
      return runBudgetLinesImport(client, orgId, v.normalized, accMap, progMap, grantMap);
    })
  );

  app.post(
    '/api/organizational/orgs/:slug/import/actuals',
    ...npAdmin,
    requireImportedActuals(pool),
    upload.single('file'),
    makeHandler('actuals', (rows) => validateActualsRows(rows), async (client, orgId, v) => {
      const accMap = await loadAccountCodeMap(client, orgId);
      const progMap = await loadProgramCodeMap(client, orgId);
      const grantMap = await loadGrantCodeMap(client, orgId);
      return runActualsImport(client, orgId, v.normalized, accMap, progMap, grantMap);
    })
  );

  app.post(
    '/api/organizational/orgs/:slug/import/balance-sheet',
    ...npAdmin,
    upload.single('file'),
    makeHandler('balance_sheet', (rows) => validateBalanceSheetRows(rows), async (client, orgId, v) => {
      const accMap = await loadAccountCodeMap(client, orgId);
      return runBalanceSheetImport(client, orgId, v.normalized, accMap);
    })
  );

  // Export and delete routes
  app.post('/api/organizational/orgs/:slug/export-and-delete/actuals', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = req.body && req.body.fiscal_year ? Number.parseInt(String(req.body.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required (1900-2200)' });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const rows = await client.query(
          `SELECT id, transaction_date, period_year, period_month, description, amount_cents, xero_account_code, xero_account_id
           FROM org_actuals WHERE org_id = $1 AND period_year = $2 ORDER BY transaction_date`,
          [orgId, fy]
        );
        const csvContent = buildCSVContent(
          ['ID', 'Transaction Date', 'Period Year', 'Period Month', 'Description', 'Amount (cents)', 'Account Code', 'Account ID'],
          rows.rows.map(r => ({
            id: r.id,
            transaction_date: r.transaction_date,
            period_year: r.period_year,
            period_month: r.period_month,
            description: r.description || '',
            amount_cents: r.amount_cents,
            account_code: r.xero_account_code || '',
            account_id: r.xero_account_id || ''
          }))
        );
        const d = await client.query(
          `DELETE FROM org_actuals WHERE org_id = $1 AND period_year = $2`,
          [orgId, fy]
        );
        await client.query('COMMIT');
        await logImport(pool, orgId, 'export_delete_actuals', 0, 0, d.rowCount || 0, null).catch(() => {});
        sendCSVDownload(res, `actuals_fy${fy}.csv`, csvContent);
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST export-and-delete/actuals:', e.message);
      return res.status(500).json({ error: 'Could not export and delete actuals' });
    }
  });

  app.post('/api/organizational/orgs/:slug/export-and-delete/budget-lines', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = req.body && req.body.fiscal_year ? Number.parseInt(String(req.body.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required (1900-2200)' });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const rows = await client.query(
          `SELECT b.id, acc.code AS account_code, acc.name AS account_name, p.code AS program_code,
                  b.month, b.amount_cents
           FROM org_budget_lines b
           LEFT JOIN org_accounts acc ON b.account_id = acc.id
           LEFT JOIN org_programs p ON b.program_id = p.id
           WHERE b.org_id = $1 AND b.fiscal_year = $2 ORDER BY acc.code, b.month`,
          [orgId, fy]
        );
        const csvContent = buildCSVContent(
          ['ID', 'Account Code', 'Account Name', 'Program Code', 'Month', 'Amount (cents)'],
          rows.rows.map(r => ({
            id: r.id,
            account_code: r.account_code || '',
            account_name: r.account_name || '',
            program_code: r.program_code || '',
            month: r.month,
            amount_cents: r.amount_cents
          }))
        );
        const d = await client.query(
          `DELETE FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = $2`,
          [orgId, fy]
        );
        await client.query('COMMIT');
        await logImport(pool, orgId, 'export_delete_budget_lines', 0, 0, d.rowCount || 0, null).catch(() => {});
        sendCSVDownload(res, `budget_lines_fy${fy}.csv`, csvContent);
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST export-and-delete/budget-lines:', e.message);
      return res.status(500).json({ error: 'Could not export and delete budget lines' });
    }
  });

  app.post('/api/organizational/orgs/:slug/export-and-delete/grants', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const rows = await client.query(
          `SELECT id, grant_code, name, funder, status, amount_cents FROM org_grants
           WHERE org_id = $1 ORDER BY grant_code`,
          [orgId]
        );
        const csvContent = buildCSVContent(
          ['ID', 'Grant Code', 'Name', 'Funder', 'Status', 'Amount (cents)'],
          rows.rows.map(r => ({
            id: r.id,
            grant_code: r.grant_code || '',
            name: r.name || '',
            funder: r.funder || '',
            status: r.status || '',
            amount_cents: r.amount_cents || 0
          }))
        );
        await client.query(`DELETE FROM org_grant_allocations WHERE grant_id IN (SELECT id FROM org_grants WHERE org_id = $1)`, [orgId]);
        const d = await client.query(`DELETE FROM org_grants WHERE org_id = $1`, [orgId]);
        await client.query('COMMIT');
        await logImport(pool, orgId, 'export_delete_grants', 0, 0, d.rowCount || 0, null).catch(() => {});
        sendCSVDownload(res, 'grants.csv', csvContent);
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST export-and-delete/grants:', e.message);
      return res.status(500).json({ error: 'Could not export and delete grants' });
    }
  });

  app.post('/api/organizational/orgs/:slug/export-and-delete/structure', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const progRows = await client.query(
          `SELECT id, code, name, program_kind FROM org_programs WHERE org_id = $1 ORDER BY code`,
          [orgId]
        );
        const coaRows = await client.query(
          `SELECT id, code, name, type FROM org_accounts WHERE org_id = $1 ORDER BY code`,
          [orgId]
        );
        const progCSV = buildCSVContent(
          ['ID', 'Code', 'Name', 'Kind'],
          progRows.rows.map(r => ({ id: r.id, code: r.code || '', name: r.name || '', kind: r.program_kind || '' }))
        );
        const coaCSV = buildCSVContent(
          ['ID', 'Code', 'Name', 'Type'],
          coaRows.rows.map(r => ({ id: r.id, code: r.code || '', name: r.name || '', type: r.type || '' }))
        );
        // Delete with cascades (order matters for foreign keys)
        await client.query(`DELETE FROM org_budget_lines WHERE org_id = $1`, [orgId]);
        await client.query(`DELETE FROM org_actuals WHERE org_id = $1`, [orgId]);
        await client.query(`DELETE FROM org_grant_allocations WHERE org_id = $1`, [orgId]);
        await client.query(`DELETE FROM org_grants WHERE org_id = $1`, [orgId]);
        await client.query(`DELETE FROM org_personnel_allocations WHERE org_id = $1`, [orgId]);
        await client.query(`DELETE FROM org_personnel WHERE org_id = $1`, [orgId]);
        const dProg = await client.query(`DELETE FROM org_programs WHERE org_id = $1`, [orgId]);
        const dCoa = await client.query(`DELETE FROM org_accounts WHERE org_id = $1`, [orgId]);
        await client.query('COMMIT');
        const totalDeleted = (dProg.rowCount || 0) + (dCoa.rowCount || 0);
        await logImport(pool, orgId, 'export_delete_structure', 0, 0, totalDeleted, null).catch(() => {});
        res.setHeader('Content-Type', 'application/json');
        res.json({
          deleted_programs: dProg.rowCount || 0,
          deleted_accounts: dCoa.rowCount || 0,
          programs_csv: progCSV,
          coa_csv: coaCSV,
          note: 'All budget lines, actuals, grants, and personnel also deleted. Use the CSVs to verify what was removed.'
        });
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST export-and-delete/structure:', e.message);
      return res.status(500).json({ error: 'Could not export and delete structure' });
    }
  });

  // Utility route to preview what would be deleted without deleting
  app.post('/api/organizational/orgs/:slug/export-and-delete/preview', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const kind = req.body && req.body.kind ? String(req.body.kind).trim() : '';
    const fy = req.body && req.body.fiscal_year ? Number.parseInt(String(req.body.fiscal_year), 10) : null;
    try {
      let count = 0;
      if (kind === 'actuals' && fy) {
        const r = await pool.query(`SELECT COUNT(*) as cnt FROM org_actuals WHERE org_id = $1 AND period_year = $2`, [orgId, fy]);
        count = r.rows[0]?.cnt || 0;
      } else if (kind === 'budget_lines' && fy) {
        const r = await pool.query(`SELECT COUNT(*) as cnt FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = $2`, [orgId, fy]);
        count = r.rows[0]?.cnt || 0;
      } else if (kind === 'grants') {
        const r = await pool.query(`SELECT COUNT(*) as cnt FROM org_grants WHERE org_id = $1`, [orgId]);
        count = r.rows[0]?.cnt || 0;
      } else if (kind === 'structure') {
        const p = await pool.query(`SELECT COUNT(*) as cnt FROM org_programs WHERE org_id = $1`, [orgId]);
        const c = await pool.query(`SELECT COUNT(*) as cnt FROM org_accounts WHERE org_id = $1`, [orgId]);
        count = (p.rows[0]?.cnt || 0) + (c.rows[0]?.cnt || 0);
      }
      return res.json({ kind, count, fiscal_year: fy });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST export-and-delete/preview:', e.message);
      return res.status(500).json({ error: 'Could not preview delete' });
    }
  });
}

module.exports = { registerOrganizationalImportRoutes };
