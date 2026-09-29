'use strict';

const { xeroGetJson } = require('./xero-http');

/**
 * Xero balance sheet + bank-balance pull (Phase 2 of multi-year budget
 * planning — see docs/Causal_Development_Path.md). Mirrors the P&L actuals
 * importer's plumbing (xeroGetJson, account-code mapping) but the report
 * itself is much simpler: one date, one column, no tracking-category
 * dimension — org_balance_sheet_snapshots has no program/activity split.
 *
 * Writes into the SAME table the manual CSV importer already writes to
 * (runBalanceSheetImport in imports.js) — Schedule D and any other existing
 * consumer of org_balance_sheet_snapshots get live data for free, no
 * downstream changes needed.
 */

function normText(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function flattenRows(rows, out) {
  const list = Array.isArray(rows) ? rows : [];
  list.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const rowType = String(r.RowType || r.rowType || '').toUpperCase();
    if (rowType === 'ROW' && Array.isArray(r.Cells)) out.push(r);
    if (Array.isArray(r.Rows)) flattenRows(r.Rows, out);
  });
}

function parseAmountCell(cell) {
  if (cell == null) return null;
  const raw = cell.Value != null ? cell.Value : cell.value;
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function deriveAccountCode(accCell, accountName) {
  const codeFromAttr =
    accCell && Array.isArray(accCell.Attributes)
      ? accCell.Attributes.find((a) => String(a.Id || a.id || '').toLowerCase() === 'account')
      : null;
  if (codeFromAttr && codeFromAttr.Value != null) return String(codeFromAttr.Value).trim();
  const m = /^([A-Za-z0-9._-]{2,20})\s*[-:]/.exec(String(accountName || '').trim());
  return m ? m[1] : null;
}

/**
 * Balance Sheet report has one balance column (the requested date) after
 * the account label column — no tracking-category fan-out needed.
 */
function parseBalanceSheetRows(report) {
  const flat = [];
  flattenRows(report && report.Rows, flat);
  const out = [];
  for (const r of flat) {
    const cells = Array.isArray(r.Cells) ? r.Cells : [];
    if (cells.length < 2) continue;
    const accCell = cells[0];
    const accountName =
      accCell && (accCell.Value != null || accCell.value != null)
        ? String(accCell.Value != null ? accCell.Value : accCell.value).trim()
        : null;
    const code = deriveAccountCode(accCell, accountName);
    if (!code && !accountName) continue;
    const dollars = parseAmountCell(cells[1]);
    if (dollars == null) continue;
    out.push({
      xero_account_code: code,
      account_name: accountName,
      balance_cents: Math.round(dollars * 100),
    });
  }
  return out;
}

async function loadAccountMap(pool, orgId) {
  const r = await pool.query(
    `SELECT id, code, type::text AS type, xero_account_id FROM org_accounts WHERE org_id = $1`,
    [orgId]
  );
  const byCode = new Map();
  const byXeroId = new Map();
  for (const row of r.rows) {
    const codeKey = normText(row.code);
    if (codeKey) byCode.set(codeKey, row);
    const xid = normText(row.xero_account_id);
    if (xid) byXeroId.set(xid, row);
  }
  return { byCode, byXeroId };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {string} accessToken
 * @param {string} tenantId
 * @param {string|null} asOfDateStr YYYY-MM-DD; defaults to today
 */
async function importBalanceSheetForOrg(pool, orgId, accessToken, tenantId, asOfDateStr) {
  const asOfDate = asOfDateStr || todayIso();
  const params = new URLSearchParams();
  params.set('date', asOfDate);
  const json = await xeroGetJson(accessToken, tenantId, `/api.xro/2.0/Reports/BalanceSheet?${params.toString()}`);
  const reports = Array.isArray(json && json.Reports) ? json.Reports : [];
  const report = reports[0];
  if (!report) {
    return { inserted: 0, unmapped_accounts: [], as_of_date: asOfDate, debug: { reports_count: reports.length } };
  }

  const rows = parseBalanceSheetRows(report);
  const { byCode, byXeroId } = await loadAccountMap(pool, orgId);

  const unmapped = new Set();
  const toInsert = [];
  for (const row of rows) {
    const codeKey = normText(row.xero_account_code);
    const acc = byCode.get(codeKey) || byXeroId.get(codeKey);
    if (!acc) {
      unmapped.add(row.xero_account_code || row.account_name || 'unknown');
      continue;
    }
    const t = String(acc.type || '').toLowerCase();
    if (!['asset', 'liability', 'equity'].includes(t)) continue; // e.g. rollup/summary rows with no real account
    if (row.balance_cents === 0) continue; // skip zero rows, same convention as the manual importer's dedupe expectations
    toInsert.push({ accountId: acc.id, balanceCents: row.balance_cents });
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const row of toInsert) {
      // Replace any existing row for this exact (org, date, account) — manual
      // import or a prior sync — so re-syncing never double-counts a balance.
      await client.query(
        `DELETE FROM org_balance_sheet_snapshots WHERE org_id = $1 AND as_of_date = $2 AND coop_account_id = $3`,
        [orgId, asOfDate, row.accountId]
      );
      await client.query(
        `INSERT INTO org_balance_sheet_snapshots (org_id, as_of_date, coop_account_id, balance_cents, notes)
         VALUES ($1, $2, $3, $4, 'xero-sync')`,
        [orgId, asOfDate, row.accountId, row.balanceCents]
      );
      inserted += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    inserted,
    as_of_date: asOfDate,
    unmapped_accounts: Array.from(unmapped),
    rows_parsed: rows.length,
  };
}

module.exports = { importBalanceSheetForOrg, parseBalanceSheetRows };
