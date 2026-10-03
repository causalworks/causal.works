'use strict';

// Trial Balance and General Ledger detail reports. Both read the posted ledger directly, so unlike the
// four statements they work for any org with ledger entries, whatever its actuals_source is. They are
// the proof behind the Accounting dashboard and the statements: the trial balance must foot, and each
// account's General Ledger closing balance is its trial balance line.
//
// Conventions: only status = 'posted' transactions; statistical accounts are excluded (they are counts,
// not dollars). Balance-sheet accounts (asset/liability/equity) are cumulative from the start of the
// books; income/expense accounts start fresh at the beginning of the fiscal year. Because the books are
// not closed at year end, prior years' results are shown as one computed equity line so the trial
// balance still foots (same idea as Xero's "retained earnings").

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('../lib/fiscalYear');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GL_JSON_LINE_CAP = 5000;
const GL_CSV_LINE_CAP = 50000;
const DEBIT_NORMAL = new Set(['asset', 'expense']);

function csvCell(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}
function csvMoney(cents) {
  return (Number(cents) / 100).toFixed(2);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function registerLedgerReportRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  async function fiscalContext(orgId, fyParam) {
    const endMonth = await getFiscalYearEndMonth(pool, orgId);
    const fy = Number.isInteger(fyParam) ? fyParam : fiscalYearForDate(new Date(), endMonth);
    const { startDate, endDate } = fyDateRange(fy, endMonth);
    return { endMonth, fy, startDate, endDate };
  }

  // GET .../reports/trial-balance?fiscal_year=&as_of=&include_zero=1&format=csv
  app.get('/api/organizational/orgs/:slug/reports/trial-balance', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fyParam = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (req.query.fiscal_year && !(fyParam >= 1900 && fyParam <= 2200)) {
      return res.status(400).json({ error: 'fiscal_year must be a four-digit year' });
    }
    const asOfParam = req.query.as_of ? String(req.query.as_of) : null;
    if (asOfParam && !DATE_RE.test(asOfParam)) return res.status(400).json({ error: 'as_of must be YYYY-MM-DD' });
    const includeZero = req.query.include_zero === '1';

    try {
      const { fy, startDate, endDate } = await fiscalContext(orgId, fyParam);
      let asOf = asOfParam || (todayIso() < endDate ? todayIso() : endDate);
      if (asOf < startDate) asOf = startDate;
      if (asOf > endDate) asOf = endDate;

      const r = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name, a.type::text AS type,
                COALESCE(SUM(l.debit_cents), 0)::bigint AS debit_cents,
                COALESCE(SUM(l.credit_cents), 0)::bigint AS credit_cents
           FROM org_accounts a
           JOIN org_ledger_lines l ON l.account_id = a.id
           JOIN org_ledger_transactions t ON t.id = l.transaction_id
          WHERE a.org_id = $1 AND t.org_id = $1 AND t.status = 'posted' AND a.is_statistical IS NOT TRUE
            AND t.transaction_date <= $3
            AND (a.type IN ('asset', 'liability', 'equity') OR t.transaction_date >= $2)
          GROUP BY a.id, a.code, a.name, a.type
          ORDER BY a.code`,
        [orgId, startDate, asOf]
      );
      let lines = r.rows.map((row) => {
        const net = BigInt(row.debit_cents) - BigInt(row.credit_cents);
        return {
          account_id: row.account_id, code: row.code, name: row.name, type: row.type,
          debit_cents: net > 0n ? String(net) : '0',
          credit_cents: net < 0n ? String(-net) : '0',
        };
      });
      if (!includeZero) lines = lines.filter((l) => l.debit_cents !== '0' || l.credit_cents !== '0');

      // Prior years' income and expenses, not yet closed into net assets.
      const pr = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS net_credit_cents
           FROM org_ledger_lines l
           JOIN org_ledger_transactions t ON t.id = l.transaction_id
           JOIN org_accounts a ON a.id = l.account_id
          WHERE t.org_id = $1 AND t.status = 'posted' AND a.type IN ('income', 'expense')
            AND a.is_statistical IS NOT TRUE AND t.transaction_date < $2`,
        [orgId, startDate]
      );
      const priorNet = BigInt(pr.rows[0].net_credit_cents);
      let priorYearResult = null;
      if (priorNet !== 0n) {
        priorYearResult = {
          name: 'Surplus (deficit) from prior years, not yet closed to net assets (computed)',
          debit_cents: priorNet < 0n ? String(-priorNet) : '0',
          credit_cents: priorNet > 0n ? String(priorNet) : '0',
        };
      }

      let totalDebit = 0n, totalCredit = 0n;
      for (const l of lines) { totalDebit += BigInt(l.debit_cents); totalCredit += BigInt(l.credit_cents); }
      if (priorYearResult) { totalDebit += BigInt(priorYearResult.debit_cents); totalCredit += BigInt(priorYearResult.credit_cents); }
      const body = {
        fiscal_year: fy, start_date: startDate, end_date: endDate, as_of: asOf,
        lines, prior_year_result: priorYearResult,
        totals: { debit_cents: String(totalDebit), credit_cents: String(totalCredit) },
        in_balance: totalDebit === totalCredit,
      };

      if (req.query.format === 'csv') {
        const rows = [['Code', 'Account', 'Type', 'Debit', 'Credit']];
        for (const l of lines) rows.push([l.code, l.name, l.type, l.debit_cents === '0' ? '' : csvMoney(l.debit_cents), l.credit_cents === '0' ? '' : csvMoney(l.credit_cents)]);
        if (priorYearResult) rows.push(['', priorYearResult.name, 'equity', priorYearResult.debit_cents === '0' ? '' : csvMoney(priorYearResult.debit_cents), priorYearResult.credit_cents === '0' ? '' : csvMoney(priorYearResult.credit_cents)]);
        rows.push(['', 'Total', '', csvMoney(totalDebit), csvMoney(totalCredit)]);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="trial-balance-${asOf}.csv"`);
        return res.send(rows.map((x) => x.map(csvCell).join(',')).join('\r\n'));
      }
      return res.json(body);
    } catch (e) {
      console.error('GET /reports/trial-balance:', e.message);
      return res.status(500).json({ error: 'Could not build the trial balance' });
    }
  });

  // GET .../reports/general-ledger?from=&to=&account_id=&format=csv  (defaults: this fiscal year to today)
  app.get('/api/organizational/orgs/:slug/reports/general-ledger', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const accountId = req.query.account_id ? Number.parseInt(String(req.query.account_id), 10) : null;
    if (req.query.account_id && !(accountId > 0)) return res.status(400).json({ error: 'account_id must be a number' });
    const fromParam = req.query.from ? String(req.query.from) : null;
    const toParam = req.query.to ? String(req.query.to) : null;
    if ((fromParam && !DATE_RE.test(fromParam)) || (toParam && !DATE_RE.test(toParam))) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    }
    const isCsv = req.query.format === 'csv';
    const cap = isCsv ? GL_CSV_LINE_CAP : GL_JSON_LINE_CAP;

    try {
      const { startDate, endMonth } = await fiscalContext(orgId, null);
      const from = fromParam || startDate;
      const to = toParam || todayIso();
      if (from > to) return res.status(400).json({ error: 'from must not be after to' });

      const accountFilter = accountId ? 'AND a.id = $4' : '';
      const params = [orgId, from, to];
      if (accountId) params.push(accountId);

      // Opening balance per account: balance-sheet accounts carry everything before `from`; income and
      // expense accounts only what's in the same fiscal year as `from` (they start fresh each year).
      const fromFy = await fiscalContext(orgId, fiscalYearForDate(new Date(from + 'T00:00:00Z'), endMonth));
      const openR = await pool.query(
        `SELECT a.id AS account_id, (COALESCE(SUM(l.debit_cents), 0) - COALESCE(SUM(l.credit_cents), 0))::bigint AS net_cents
           FROM org_accounts a
           JOIN org_ledger_lines l ON l.account_id = a.id
           JOIN org_ledger_transactions t ON t.id = l.transaction_id
          WHERE a.org_id = $1 AND t.org_id = $1 AND t.status = 'posted' AND a.is_statistical IS NOT TRUE
            AND t.transaction_date < $2
            AND (a.type IN ('asset', 'liability', 'equity') OR t.transaction_date >= $3)
            ${accountId ? 'AND a.id = $4' : ''}
          GROUP BY a.id`,
        accountId ? [orgId, from, fromFy.startDate, accountId] : [orgId, from, fromFy.startDate]
      );
      const opening = new Map(openR.rows.map((x) => [x.account_id, BigInt(x.net_cents)]));

      const linesR = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name, a.type::text AS type,
                t.id AS transaction_id, t.transaction_date, t.memo, t.payee, t.reference_number, t.source,
                l.id AS line_id, l.line_memo, l.debit_cents, l.credit_cents,
                p.name AS program_name, g.name AS grant_name
           FROM org_ledger_lines l
           JOIN org_ledger_transactions t ON t.id = l.transaction_id
           JOIN org_accounts a ON a.id = l.account_id
           LEFT JOIN org_programs p ON p.id = l.program_id
           LEFT JOIN org_grants g ON g.id = l.grant_id
          WHERE a.org_id = $1 AND t.org_id = $1 AND t.status = 'posted' AND a.is_statistical IS NOT TRUE
            AND t.transaction_date BETWEEN $2 AND $3 ${accountFilter}
          ORDER BY a.code, t.transaction_date, t.id, l.id
          LIMIT ${cap + 1}`,
        params
      );
      const truncated = linesR.rows.length > cap;
      const rows = truncated ? linesR.rows.slice(0, cap) : linesR.rows;

      // Group by account; accounts with an opening balance but no activity still appear.
      const accounts = new Map();
      const meta = await pool.query(
        `SELECT id, code, name, type::text AS type FROM org_accounts WHERE org_id = $1 AND is_statistical IS NOT TRUE ${accountId ? 'AND id = $2' : ''}`,
        accountId ? [orgId, accountId] : [orgId]);
      const metaById = new Map(meta.rows.map((m) => [m.id, m]));
      function ensure(id) {
        if (!accounts.has(id)) {
          const m = metaById.get(id);
          accounts.set(id, { account_id: id, code: m.code, name: m.name, type: m.type,
            natural_side: DEBIT_NORMAL.has(m.type) ? 'debit' : 'credit',
            open: opening.get(id) || 0n, running: opening.get(id) || 0n, debit: 0n, credit: 0n, lines: [] });
        }
        return accounts.get(id);
      }
      for (const id of opening.keys()) if (metaById.has(id) && opening.get(id) !== 0n) ensure(id);
      for (const row of rows) {
        const acc = ensure(row.account_id);
        const d = BigInt(row.debit_cents), c = BigInt(row.credit_cents);
        acc.running += d - c; acc.debit += d; acc.credit += c;
        const sign = acc.natural_side === 'debit' ? 1n : -1n;
        acc.lines.push({
          transaction_id: row.transaction_id, date: String(row.transaction_date).slice(0, 10),
          memo: row.memo, payee: row.payee, reference: row.reference_number, line_memo: row.line_memo,
          source: row.source, program: row.program_name, grant: row.grant_name,
          debit_cents: String(d), credit_cents: String(c), balance_cents: String(acc.running * sign),
        });
      }
      const sorted = [...accounts.values()].sort((x, y) => String(x.code).localeCompare(String(y.code), undefined, { numeric: true }));
      const out = sorted.map((a) => {
        const sign = a.natural_side === 'debit' ? 1n : -1n;
        return { account_id: a.account_id, code: a.code, name: a.name, type: a.type, natural_side: a.natural_side,
          opening_cents: String(a.open * sign), total_debit_cents: String(a.debit), total_credit_cents: String(a.credit),
          closing_cents: String(a.running * sign), lines: a.lines };
      });

      if (isCsv) {
        const csv = [['Account code', 'Account', 'Date', 'Transaction', 'Payee', 'Memo', 'Program', 'Grant', 'Reference', 'Debit', 'Credit', 'Balance']];
        for (const a of out) {
          csv.push([a.code, a.name, '', '', '', 'Opening balance', '', '', '', '', '', csvMoney(a.opening_cents)]);
          for (const l of a.lines) {
            csv.push([a.code, a.name, l.date, l.transaction_id, l.payee || '', l.line_memo || l.memo || '', l.program || '', l.grant || '', l.reference || '',
              l.debit_cents === '0' ? '' : csvMoney(l.debit_cents), l.credit_cents === '0' ? '' : csvMoney(l.credit_cents), csvMoney(l.balance_cents)]);
          }
          csv.push([a.code, a.name, '', '', '', 'Closing balance', '', '', '', csvMoney(a.total_debit_cents), csvMoney(a.total_credit_cents), csvMoney(a.closing_cents)]);
        }
        if (truncated) csv.push(['', '', '', '', '', `Export stopped at ${cap} lines. Narrow the dates or pick one account.`]);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="general-ledger-${from}-to-${to}.csv"`);
        return res.send(csv.map((x) => x.map(csvCell).join(',')).join('\r\n'));
      }
      return res.json({
        from, to, accounts: out, line_count: rows.length, truncated, line_cap: cap,
        notes: 'Balances are shown in each account\'s natural direction (debit for assets and expenses, credit for the rest). Income and expense balances start at zero at the beginning of each fiscal year.',
      });
    } catch (e) {
      console.error('GET /reports/general-ledger:', e.message);
      return res.status(500).json({ error: 'Could not build the general ledger' });
    }
  });
}

module.exports = { registerLedgerReportRoutes };
