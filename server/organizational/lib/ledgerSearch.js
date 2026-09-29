'use strict';

/**
 * Find & Recode's search step: a dynamic condition builder over posted org_ledger_lines,
 * modeled directly on Xero's real Find & Recode UI (multiple conditions, each with its own
 * field + operator + value, combined by a top-level All/Any toggle) -- researched via
 * screenshots and a detailed feature writeup from the user (2026-09-16), not guessed.
 *
 * Kept separate from findAndRecode.js (which owns the recode-execution half -- the correcting
 * journal) since search is a distinct concern with its own field/operator model.
 *
 * FIELDS is a server-side allowlist -- a condition's `field` is checked against
 * Object.prototype.hasOwnProperty.call(FIELDS, field) before anything touches SQL, so no
 * user-supplied identifier is ever interpolated into a query.
 *
 * System/control accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims
 * Payable -- org_accounts already carries these six flags for exactly this kind of
 * restriction elsewhere in the app) are excluded from every search result unconditionally,
 * matching Xero's documented behavior that blocks direct recoding of system accounts. No
 * dedicated "fixed asset account" flag exists in this schema, so that one Xero restriction
 * (Fixed Assets, Tracked Inventory) isn't enforced here -- a disclosed gap.
 */

const MAX_RESULTS = 2000; // matches Xero's documented 2,000-line cap

const FIELDS = {
  account_id: { type: 'select', column: 'l.account_id', label: 'Account' },
  program_id: { type: 'select', column: 'l.program_id', label: 'Program/Activity' },
  grant_id: { type: 'select', column: 'l.grant_id', label: 'Grant', nullable: true },
  transaction_date: { type: 'date', column: 't.transaction_date', label: 'Date' },
  amount_cents: { type: 'number', column: '(l.debit_cents + l.credit_cents)', label: 'Amount' },
  memo: { type: 'text', column: 't.memo', label: 'Memo', nullable: true },
  payee: { type: 'text', column: 't.payee', label: 'Payee', nullable: true },
  reference_number: { type: 'text', column: 't.reference_number', label: 'Reference #', nullable: true },
  source: { type: 'select_text', column: 't.source', label: 'Type' },
  created_by: { type: 'select', column: 't.created_by', label: 'Entered by' },
};

const OPERATORS = {
  select: ['is', 'is_not'],
  select_text: ['is', 'is_not'],
  text: ['contains', 'does_not_contain', 'is', 'is_not'],
  number: ['is', 'is_not', 'greater_than', 'less_than', 'between'],
  date: ['is', 'is_not', 'on_or_after', 'on_or_before', 'between'],
};

function escapeLike(s) {
  return String(s).replace(/[%_\\]/g, '\\$&');
}

/**
 * Builds one condition's SQL fragment, pushing its parameter value(s) onto `params` and
 * returning the fragment string (using $N placeholders computed from params.length), or null
 * if the condition has no usable value.
 */
function conditionSql(def, operator, value, params) {
  const ph = (v) => {
    params.push(v);
    return '$' + params.length;
  };
  const column = def.column;
  const nullGuard = (sql) => (def.nullable ? `(${column} IS NULL OR ${sql})` : sql);

  if (def.type === 'select') {
    const arr = Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n)) : [];
    if (arr.length === 0) return null;
    const placeholder = ph(arr);
    return operator === 'is_not'
      ? nullGuard(`${column} <> ALL(${placeholder}::int[])`)
      : `${column} = ANY(${placeholder}::int[])`;
  }

  if (def.type === 'select_text') {
    const arr = Array.isArray(value) ? value.map(String).filter((s) => s.trim() !== '') : [];
    if (arr.length === 0) return null;
    const placeholder = ph(arr);
    return operator === 'is_not'
      ? nullGuard(`${column} <> ALL(${placeholder}::text[])`)
      : `${column} = ANY(${placeholder}::text[])`;
  }

  if (def.type === 'text') {
    if (operator === 'contains' || operator === 'does_not_contain') {
      const s = String(value || '').trim();
      if (!s) return null;
      const like = ph('%' + escapeLike(s) + '%');
      return operator === 'does_not_contain' ? nullGuard(`${column} NOT ILIKE ${like}`) : `${column} ILIKE ${like}`;
    }
    const s = String(value || '').trim();
    if (!s) return null;
    return operator === 'is_not' ? nullGuard(`${column} <> ${ph(s)}`) : `${column} = ${ph(s)}`;
  }

  if (def.type === 'number') {
    if (operator === 'between') {
      const { min, max } = value || {};
      const parts = [];
      if (Number.isFinite(min)) parts.push(`${column} >= ${ph(min)}`);
      if (Number.isFinite(max)) parts.push(`${column} <= ${ph(max)}`);
      return parts.length ? '(' + parts.join(' AND ') + ')' : null;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (operator === 'is') return `${column} = ${ph(n)}`;
    if (operator === 'is_not') return nullGuard(`${column} <> ${ph(n)}`);
    if (operator === 'greater_than') return `${column} > ${ph(n)}`;
    if (operator === 'less_than') return `${column} < ${ph(n)}`;
    return null;
  }

  if (def.type === 'date') {
    if (operator === 'between') {
      const { start, end } = value || {};
      const parts = [];
      if (start) parts.push(`${column} >= ${ph(start)}`);
      if (end) parts.push(`${column} <= ${ph(end)}`);
      return parts.length ? '(' + parts.join(' AND ') + ')' : null;
    }
    if (!value) return null;
    if (operator === 'is') return `${column} = ${ph(value)}`;
    if (operator === 'is_not') return nullGuard(`${column} <> ${ph(value)}`);
    if (operator === 'on_or_after') return `${column} >= ${ph(value)}`;
    if (operator === 'on_or_before') return `${column} <= ${ph(value)}`;
    return null;
  }

  return null;
}

/**
 * Validates a raw {conditions, matchMode} request body against FIELDS/OPERATORS, coercing
 * values to their expected shape. Returns { error } on any problem, or { conditions, matchMode }
 * with already-typed values ready for buildDynamicWhere/searchLedgerLines.
 */
function validateConditions(rawConditions, rawMatchMode) {
  const matchMode = rawMatchMode === 'any' ? 'any' : 'all';
  if (!Array.isArray(rawConditions) || rawConditions.length === 0) {
    return { error: 'conditions must be a non-empty array' };
  }
  if (rawConditions.length > 20) {
    return { error: 'Too many conditions (max 20)' };
  }
  const conditions = [];
  for (const raw of rawConditions) {
    const field = raw && raw.field;
    if (!Object.prototype.hasOwnProperty.call(FIELDS, field)) {
      return { error: `Unknown field: ${field}` };
    }
    const def = FIELDS[field];
    const operator = raw.operator;
    if (!OPERATORS[def.type].includes(operator)) {
      return { error: `Invalid operator "${operator}" for field ${field}` };
    }
    let value = raw.value;
    if (def.type === 'number' && operator === 'between') {
      const min = value && value.min != null ? Number(value.min) : undefined;
      const max = value && value.max != null ? Number(value.max) : undefined;
      if ((min == null || Number.isNaN(min)) && (max == null || Number.isNaN(max))) {
        return { error: `${field}: between requires min and/or max` };
      }
      if (min != null && max != null && min > max) {
        return { error: `${field}: min must be <= max` };
      }
      value = { min, max };
    } else if (def.type === 'date' && operator === 'between') {
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      const start = value && value.start;
      const end = value && value.end;
      if (start && !DATE_RE.test(start)) return { error: `${field}: start must be YYYY-MM-DD` };
      if (end && !DATE_RE.test(end)) return { error: `${field}: end must be YYYY-MM-DD` };
      if (start && end && start > end) return { error: `${field}: start must be <= end` };
      value = { start, end };
    } else if (def.type === 'date') {
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      if (!DATE_RE.test(String(value))) return { error: `${field}: value must be YYYY-MM-DD` };
    } else if (def.type === 'select' || def.type === 'select_text') {
      if (!Array.isArray(value) || value.length === 0) {
        return { error: `${field}: value must be a non-empty array` };
      }
    } else if (def.type === 'text') {
      if (typeof value !== 'string' || !value.trim()) {
        return { error: `${field}: value must be a non-empty string` };
      }
    } else if (def.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: `${field}: value must be a number` };
      value = n;
    }
    conditions.push({ field, operator, value });
  }
  return { conditions, matchMode };
}

function buildDynamicWhere(conditions, matchMode, params) {
  const parts = [];
  for (const cond of conditions) {
    const def = FIELDS[cond.field];
    const sql = conditionSql(def, cond.operator, cond.value, params);
    if (sql) parts.push(sql);
  }
  if (parts.length === 0) return null;
  const joiner = matchMode === 'any' ? ' OR ' : ' AND ';
  return '(' + parts.join(joiner) + ')';
}

async function searchLedgerLines(pool, orgId, conditions, matchMode) {
  const params = [orgId];
  const baseConds = [
    't.org_id = $1',
    `t.status = 'posted'`,
    'a.is_cash_account = false',
    'a.is_system_ap_account = false',
    'a.is_system_ar_account = false',
    'a.is_system_clearing_account = false',
    'a.is_system_contribution_revenue_account = false',
    'a.is_system_expense_claims_payable_account = false',
    'a.is_system_unallocated_receipts_account = false',
  ];
  const dyn = buildDynamicWhere(conditions, matchMode, params);
  const where = baseConds.concat(dyn ? [dyn] : []).join(' AND ');

  const r = await pool.query(
    `SELECT l.id AS line_id, t.id AS transaction_id, t.transaction_date, t.memo, t.payee,
            t.reference_number, t.source, t.created_by,
            l.account_id, a.code AS account_code, a.name AS account_name,
            l.program_id, p.name AS program_name,
            l.grant_id, g.name AS grant_name,
            l.debit_cents, l.credit_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     JOIN org_programs p ON p.id = l.program_id
     LEFT JOIN org_grants g ON g.id = l.grant_id
     WHERE ${where}
     ORDER BY t.transaction_date DESC, t.id DESC, l.id ASC
     LIMIT ${MAX_RESULTS + 1}`,
    params
  );
  const truncated = r.rows.length > MAX_RESULTS;
  return { rows: r.rows.slice(0, MAX_RESULTS), truncated };
}

/** Option lists for the condition builder's value inputs, scoped to non-system accounts. */
async function loadFieldOptions(pool, orgId) {
  const [accounts, programs, grants, users] = await Promise.all([
    pool.query(
      `SELECT id, code, name FROM org_accounts
       WHERE org_id = $1 AND is_posting = true
         AND is_cash_account = false AND is_system_ap_account = false AND is_system_ar_account = false
         AND is_system_clearing_account = false AND is_system_contribution_revenue_account = false
         AND is_system_expense_claims_payable_account = false AND is_system_unallocated_receipts_account = false
       ORDER BY code`,
      [orgId]
    ),
    pool.query(`SELECT id, name, parent_id FROM org_programs WHERE org_id = $1 ORDER BY parent_id NULLS FIRST, name`, [orgId]),
    pool.query(`SELECT id, name FROM org_grants WHERE org_id = $1 ORDER BY name`, [orgId]),
    pool.query(
      `SELECT DISTINCT u.id, u.email FROM org_ledger_transactions t
       JOIN users u ON u.id = t.created_by WHERE t.org_id = $1 ORDER BY u.email`,
      [orgId]
    ),
  ]);
  return {
    accounts: accounts.rows,
    programs: programs.rows,
    grants: grants.rows,
    users: users.rows,
  };
}

module.exports = { FIELDS, OPERATORS, MAX_RESULTS, validateConditions, searchLedgerLines, loadFieldOptions };
