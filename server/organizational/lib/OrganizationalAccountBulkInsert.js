'use strict';

const CODE_MAX = 64;
const NAME_MAX = 500;
const CAT_MAX = 32;
const NP_ACCOUNT_TYPES = new Set(['income', 'expense', 'asset', 'liability']);

const XERO_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates payload rows for POST /accounts/bulk. Returns normalized rows or row-level errors.
 * @param {unknown[]} accountsIn
 * @returns {{ rows: object[], row_errors: object[] } | { error: string }}
 */
function normalizeAndValidateBulkAccounts(accountsIn) {
  const rowErrors = [];
  const rows = [];

  for (let i = 0; i < accountsIn.length; i += 1) {
    const a = accountsIn[i];
    const code = String(a.code ?? '').trim();
    const name = String(a.name ?? '').trim();
    const type = String(a.type ?? '').trim().toLowerCase();
    const standard_category = String(a.standard_category ?? '').trim();
    const rollup_parent_code = a.rollup_parent_code ? String(a.rollup_parent_code).trim() : '';
    const VALID_BUDGET_SOURCES = new Set(['schedule','personnel','grant_allocation','insurance','input']);
    const budget_source_raw = a.budget_source ? String(a.budget_source).trim() : 'schedule';
    const budget_source = VALID_BUDGET_SOURCES.has(budget_source_raw) ? budget_source_raw : 'schedule';
    let xero_account_id =
      a.xero_account_id != null && String(a.xero_account_id).trim() !== ''
        ? String(a.xero_account_id).trim().toLowerCase()
        : '';

    const err = { index: i, code, errors: [] };
    if (!code) err.errors.push('code required');
    if (!name) err.errors.push('name required');
    if (!NP_ACCOUNT_TYPES.has(type)) err.errors.push('invalid type');
    if (!standard_category) err.errors.push('standard_category required');
    if (code.length > CODE_MAX) err.errors.push('code too long');
    if (name.length > NAME_MAX) err.errors.push('name too long');
    if (standard_category.length > CAT_MAX) err.errors.push('standard_category too long');
    if (xero_account_id && !XERO_GUID.test(xero_account_id)) err.errors.push('invalid xero_account_id');

    let levelRaw = a.level;
    let level = null;
    if (levelRaw !== undefined && levelRaw !== null && levelRaw !== '') {
      level = Number(levelRaw);
      if (!Number.isInteger(level) || level < 1 || level > 3) {
        err.errors.push('level must be 1, 2, or 3');
      }
    }

    let isPostingRaw = a.is_posting;
    let isPosting = null;
    if (isPostingRaw !== undefined && isPostingRaw !== null && isPostingRaw !== '') {
      isPosting = Boolean(isPostingRaw);
    }

    if (level === null && isPosting === null) {
      level = 3;
      isPosting = true;
    } else if (level === null && isPosting !== null) {
      if (isPosting === false) {
        err.errors.push('level is required when is_posting is false');
      } else {
        level = 3;
      }
    } else if (level !== null && isPosting === null) {
      isPosting = level === 3;
    }

    if (level !== null && isPosting !== null) {
      if (!isPosting && level === 3) {
        err.errors.push('non-posting rows cannot use level 3');
      }
      if (isPosting && level !== 3) {
        err.errors.push('posting rows must use level 3');
      }
    }

    if (level === 1 && rollup_parent_code) {
      err.errors.push('level 1 rows must not have rollup_parent_code');
    }
    if (level !== null && level > 1 && !rollup_parent_code) {
      err.errors.push('rollup_parent_code required for level 2 and 3');
    }

    if (err.errors.length) {
      rowErrors.push(err);
      continue;
    }

    rows.push({
      code,
      name,
      type,
      standard_category,
      rollup_parent_code,
      xero_account_id,
      is_posting: isPosting,
      level,
      budget_source,
    });
  }

  if (rowErrors.length) {
    return { row_errors: rowErrors };
  }

  const codes = new Set();
  const xeroIds = new Set();
  for (const r of rows) {
    if (codes.has(r.code)) {
      return { error: `Duplicate code in payload: ${r.code}` };
    }
    codes.add(r.code);
    if (r.xero_account_id) {
      if (xeroIds.has(r.xero_account_id)) {
        return { error: 'Duplicate xero_account_id in payload' };
      }
      xeroIds.add(r.xero_account_id);
    }
  }

  const byCode = new Map(rows.map((r) => [r.code, r]));
  for (const r of rows) {
    const p = r.rollup_parent_code;
    if (!p) continue;
    if (p === r.code) {
      return { error: `Account ${r.code} cannot be its own parent` };
    }
    if (!byCode.has(p)) {
      return { error: `Unknown parent code: ${p}` };
    }
  }

  return { rows };
}

/**
 * Inserts accounts in two passes (all rows with null parents, then parent_id / rollup_parent_id).
 * Caller must not have started a transaction unless this is the only work in it.
 * @param {import('pg').PoolClient} client
 * @param {number} orgId
 * @param {object[]} rows normalized rows from normalizeAndValidateBulkAccounts
 */
async function applyOrganizationalAccountBulkInsert(client, orgId, rows) {
  const codeToId = new Map();

  for (const r of rows) {
    const ins = await client.query(
      `INSERT INTO org_accounts (
         org_id, code, name, type, standard_category,
         parent_id, rollup_parent_id, is_posting, level, xero_account_id, budget_source
       )
       VALUES ($1, $2, $3, $4::org_account_type, $5, NULL, NULL, $6, $7, $8, $9)
       RETURNING id, code`,
      [
        orgId,
        r.code,
        r.name,
        r.type,
        r.standard_category,
        r.is_posting,
        r.level,
        r.xero_account_id || null,
        r.budget_source || 'schedule',
      ]
    );
    codeToId.set(ins.rows[0].code, ins.rows[0].id);
  }

  for (const r of rows) {
    if (!r.rollup_parent_code) continue;
    const parentId = codeToId.get(r.rollup_parent_code);
    if (parentId == null) {
      const err = new Error(`Parent not found for code ${r.code}`);
      err.code = 'PARENT_MAP';
      throw err;
    }
    await client.query(
      `UPDATE org_accounts
       SET parent_id = $1, rollup_parent_id = $1
       WHERE org_id = $2 AND code = $3`,
      [parentId, orgId, r.code]
    );
  }

  const list = await client.query(
    `SELECT id, org_id, code, name, type::text AS type, xero_account_id,
            parent_id, rollup_parent_id, standard_category, is_posting, level,
            budget_source, created_at, updated_at
     FROM org_accounts WHERE org_id = $1 ORDER BY lower(code)`,
    [orgId]
  );
  return list.rows;
}

module.exports = {
  CODE_MAX,
  NAME_MAX,
  CAT_MAX,
  NP_ACCOUNT_TYPES,
  XERO_GUID,
  normalizeAndValidateBulkAccounts,
  applyOrganizationalAccountBulkInsert,
};
