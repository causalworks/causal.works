'use strict';
const { addFileInfo } = require('../lib/recordFiles');

const { findExpectedGifts, loadExpected } = require('../lib/giftMatch');
const { pledgeReceiptLines, markInstallmentCollected } = require('../lib/pledgeReceipt');
const { suggestGiftForTransaction, voidGiftsForTransaction } = require('../lib/giftIntake');
const { sponsoredGiftCoding } = require('../lib/giftPosting');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole, FINANCE_ROLES } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { translateLedgerWriteError, postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('../lib/ledgerPosting');
const { previewLedgerRecode } = require('../lib/findAndRecode');
const { validateConditions, searchLedgerLines, loadFieldOptions } = require('../lib/ledgerSearch');
const { logAudit, diffFields } = require('../lib/auditLog');
const { displayAmountSql, displayCents } = require('../lib/voidedDisplay');
const { sourceLabel, statusLabel } = require('../lib/ledgerLabels');
const { runTool, ctxForUser, ctxFromReq } = require('../tools');
const { csvCell } = require('../lib/csvCell');
const entryEdit = require('../lib/ledgerEntryEdit');

function rowToLedgerDetailRow(row) {
  return {
    line_id: row.line_id,
    transaction_id: row.transaction_id,
    transaction_date: row.transaction_date,
    status: row.status,
    memo: row.memo,
    payee: row.payee,
    reference_number: row.reference_number,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    reverses_transaction_id: row.reverses_transaction_id,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    grant_id: row.grant_id,
    grant_name: row.grant_name,
    donor_restriction_class: row.donor_restriction_class,
    debit_cents: row.debit_cents != null ? String(row.debit_cents) : '0',
    credit_cents: row.credit_cents != null ? String(row.credit_cents) : '0',
    line_memo: row.line_memo,
  };
}

function registerOrganizationalLedgerRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  app.get('/api/organizational/orgs/:slug/ledger/next-reference', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const bank = Number.parseInt(String(req.query.bank_account_id), 10);
    if (!Number.isInteger(bank)) return res.status(400).json({ error: 'bank_account_id is required' });
    try {
      const r = await pool.query(
        `SELECT t.reference_number FROM org_ledger_transactions t
          WHERE t.org_id = $1 AND t.entry_type = 'spend' AND t.source = 'manual' AND t.status <> 'voided'
            AND COALESCE(btrim(t.reference_number), '') <> ''
            AND EXISTS (SELECT 1 FROM org_ledger_lines l WHERE l.transaction_id = t.id AND l.account_id = $2)
          ORDER BY t.id DESC LIMIT 1`, [req.orgId, bank]);
      const last = r.rows[0] && r.rows[0].reference_number.trim();
      const m = last && last.match(/^(.*?)(\d+)$/);
      return res.json({ reference: m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : null });
    } catch (e) {
      console.error('GET /ledger/next-reference:', e.message);
      return res.status(500).json({ error: 'Could not suggest a reference' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/contact-defaults', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const contact = Number.parseInt(String(req.query.constituent_id), 10);
    const entryType = String(req.query.entry_type || '');
    if (!Number.isInteger(contact) || !['receive', 'spend'].includes(entryType)) return res.status(400).json({ error: 'constituent_id and entry_type (receive or spend) are required' });
    try {
      const t = await pool.query(
        `SELECT t.id, t.memo FROM org_ledger_transactions t
          WHERE t.org_id = $1 AND t.constituent_id = $2 AND t.entry_type = $3 AND t.status = 'posted'
            AND t.source IN ('manual', 'bank_reconciliation')
          ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1`, [req.orgId, contact, entryType]);
      if (!t.rows.length) return res.json({ found: false });
      const side = entryType === 'spend' ? 'l.debit_cents > 0' : 'l.credit_cents > 0';
      const l = await pool.query(
        `SELECT l.account_id, l.program_id, l.grant_id FROM org_ledger_lines l
           JOIN org_accounts a ON a.id = l.account_id
          WHERE l.transaction_id = $1 AND ${side} AND NOT a.is_cash_account
          ORDER BY l.id LIMIT 1`, [t.rows[0].id]);
      if (!l.rows.length) return res.json({ found: false });
      const row = l.rows[0];
      return res.json({ found: true, memo: t.rows[0].memo || null, account_id: row.account_id, program_id: row.program_id, grant_id: row.grant_id });
    } catch (e) {
      console.error('GET /ledger/contact-defaults:', e.message);
      return res.status(500).json({ error: 'Could not load the contact\'s usual coding' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/transactions', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const grantId = req.query.grant_id != null ? Number.parseInt(String(req.query.grant_id), 10) : null;
    const programId = req.query.program_id != null ? Number.parseInt(String(req.query.program_id), 10) : null;
    const accountId = req.query.account_id != null ? Number.parseInt(String(req.query.account_id), 10) : null;
    const dateFrom = req.query.date_from ? String(req.query.date_from) : null;
    const dateTo = req.query.date_to ? String(req.query.date_to) : null;
    const status = req.query.status != null ? String(req.query.status).toLowerCase() : null;
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(req.query.limit || '200'), 10) || 200));
    const amountMinCents = req.query.amount_min_cents != null ? Number.parseInt(String(req.query.amount_min_cents), 10) : null;
    const amountMaxCents = req.query.amount_max_cents != null ? Number.parseInt(String(req.query.amount_max_cents), 10) : null;

    if (status != null && !['posted', 'voided', 'pending_approval'].includes(status)) {
      return res.status(400).json({ error: 'status must be posted, voided, or pending_approval' });
    }
    if (dateFrom != null && !DATE_RE.test(dateFrom)) {
      return res.status(400).json({ error: 'date_from must be YYYY-MM-DD' });
    }
    if (dateTo != null && !DATE_RE.test(dateTo)) {
      return res.status(400).json({ error: 'date_to must be YYYY-MM-DD' });
    }

    try {
      const conds = ['t.org_id = $1'];
      const params = [orgId];
      let p = 2;

      const transactionId = req.query.transaction_id != null ? Number.parseInt(String(req.query.transaction_id), 10) : null;
      if (Number.isInteger(transactionId) && transactionId > 0) {
        conds.push(`t.id = $${p}`);
        params.push(transactionId);
        p += 1;
      }
      if (Number.isInteger(grantId) && grantId > 0) {
        conds.push(`l.grant_id = $${p}`);
        params.push(grantId);
        p += 1;
      }
      if (Number.isInteger(programId) && programId > 0) {
        conds.push(`l.program_id = $${p}`);
        params.push(programId);
        p += 1;
      }
      if (Number.isInteger(accountId) && accountId > 0) {
        conds.push(`l.account_id = $${p}`);
        params.push(accountId);
        p += 1;
      }
      if (dateFrom) {
        conds.push(`t.transaction_date >= $${p}`);
        params.push(dateFrom);
        p += 1;
      }
      if (dateTo) {
        conds.push(`t.transaction_date <= $${p}`);
        params.push(dateTo);
        p += 1;
      }
      if (status) {
        conds.push(`t.status = $${p}`);
        params.push(status);
        p += 1;
      }
      if (Number.isInteger(amountMinCents)) {
        conds.push(`(l.debit_cents + l.credit_cents) >= $${p}`);
        params.push(amountMinCents);
        p += 1;
      }
      if (Number.isInteger(amountMaxCents)) {
        conds.push(`(l.debit_cents + l.credit_cents) <= $${p}`);
        params.push(amountMaxCents);
        p += 1;
      }

      params.push(limit);

      const r = await pool.query(
        `SELECT l.id AS line_id, t.id AS transaction_id, t.transaction_date, t.status,
                t.memo, t.payee, t.reference_number, t.voided_at, t.void_reason, t.reverses_transaction_id,
                l.account_id, acc.code AS account_code, acc.name AS account_name,
                l.program_id, pr.name AS program_name,
                l.grant_id, g.name AS grant_name,
                l.donor_restriction_class::text AS donor_restriction_class,
                l.debit_cents, l.credit_cents, l.line_memo
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts acc ON acc.id = l.account_id
         JOIN org_programs pr ON pr.id = l.program_id
         LEFT JOIN org_grants g ON g.id = l.grant_id
         WHERE ${conds.join(' AND ')}
         ORDER BY t.transaction_date DESC, t.id DESC, l.id ASC
         LIMIT $${p}`,
        params
      );
      return res.json({ lines: r.rows.map(rowToLedgerDetailRow) });
    } catch (e) {
      console.error('GET /ledger/transactions:', e.message);
      return res.status(500).json({ error: 'Could not load ledger detail' });
    }
  });

  const TXN_LIST_MAX = 5000;
  const TXN_CSV_MAX_LINES = 50000;

  function txnFilter(req, params) {
    const conds = ['t.org_id = $1'];
    let p = params.length + 1;
    const q = req.query;
    const addLineFilter = (col, val) => {
      const n = Number.parseInt(String(val), 10);
      if (Number.isInteger(n) && n > 0) {
        conds.push(`EXISTS (SELECT 1 FROM org_ledger_lines fl WHERE fl.transaction_id = t.id AND fl.${col} = $${p})`);
        params.push(n); p += 1;
      }
    };
    if (q.grant_id) addLineFilter('grant_id', q.grant_id);
    if (q.program_id) addLineFilter('program_id', q.program_id);
    if (q.account_id) addLineFilter('account_id', q.account_id);
    if (q.date_from && DATE_RE.test(String(q.date_from))) { conds.push(`t.transaction_date >= $${p}`); params.push(String(q.date_from)); p += 1; }
    if (q.date_to && DATE_RE.test(String(q.date_to))) { conds.push(`t.transaction_date <= $${p}`); params.push(String(q.date_to)); p += 1; }
    const status = q.status ? String(q.status).toLowerCase() : '';
    if (['posted', 'voided', 'pending_approval'].includes(status)) { conds.push(`t.status = $${p}`); params.push(status); p += 1; }
    else if (q.include_voided !== '1') conds.push(`t.status <> 'voided'`);
    if (q.source) { conds.push(`t.source = $${p}`); params.push(String(q.source)); p += 1; }
    const contactId = Number.parseInt(String(q.constituent_id || ''), 10);
    if (Number.isInteger(contactId) && contactId > 0) { conds.push(`t.constituent_id = $${p}`); params.push(contactId); p += 1; }
    const search = q.q ? String(q.q).trim().slice(0, 100) : '';
    if (search) {
      const like = '%' + search.replace(/[%_\\]/g, (c) => '\\' + c) + '%';
      const idMatch = /^#?(\d{1,9})$/.exec(search);
      conds.push(`(t.memo ILIKE $${p} OR t.payee ILIKE $${p} OR t.reference_number ILIKE $${p}` +
        (idMatch ? ` OR t.id = $${p + 1}` : '') +
        ` OR EXISTS (SELECT 1 FROM org_ledger_lines sl WHERE sl.transaction_id = t.id AND sl.line_memo ILIKE $${p}))`);
      params.push(like); p += 1;
      if (idMatch) { params.push(Number(idMatch[1])); p += 1; }
    }
    conds.push('EXISTS (SELECT 1 FROM org_ledger_lines vl WHERE vl.transaction_id = t.id)');
    return conds.join(' AND ');
  }

  const TXN_SORT_COLUMNS = {
    date: 't.transaction_date',
    source: 't.source',
    status: 't.status',
    payee: "NULLIF(LOWER(COALESCE(ct.display_name, t.payee, '')), '')",
    amount: 'total_cents',
  };
  function txnOrderBy(req) {
    const col = TXN_SORT_COLUMNS[String(req.query.sort || '')];
    if (!col) return 't.transaction_date DESC, t.id DESC';
    const dir = String(req.query.dir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return `${col} ${dir} NULLS LAST, t.id ${dir}`;
  }

  app.get('/api/organizational/orgs/:slug/ledger/transaction-list', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const limit = Math.min(TXN_LIST_MAX, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
    try {
      const params = [req.orgId];
      const where = txnFilter(req, params);
      const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM org_ledger_transactions t WHERE ${where}`, params)).rows[0].n;
      const listParams = params.slice();
      listParams.push(limit, offset);
      const r = await pool.query(
        `SELECT t.id, t.transaction_date, t.status, t.memo, t.payee, t.reference_number, t.source, t.reverses_transaction_id,
                t.void_reason, t.entry_type, t.constituent_id, ct.display_name AS contact_name,
                ${displayAmountSql('t.status', 'SELECT COALESCE(SUM(l.debit_cents), 0) FROM org_ledger_lines l WHERE l.transaction_id = t.id')}::bigint AS total_cents,
                (SELECT COALESCE(SUM(l.debit_cents), 0) FROM org_ledger_lines l WHERE l.transaction_id = t.id)::bigint AS original_total_cents,
                (SELECT json_agg(json_build_object(
                    'account_code', a.code, 'account_name', a.name, 'program', pr.name, 'grant', g.name,
                    'debit_cents', l.debit_cents, 'credit_cents', l.credit_cents, 'memo', l.line_memo,
                    'restriction', l.donor_restriction_class::text) ORDER BY l.id)
                   FROM org_ledger_lines l
                   JOIN org_accounts a ON a.id = l.account_id
                   LEFT JOIN org_programs pr ON pr.id = l.program_id
                   LEFT JOIN org_grants g ON g.id = l.grant_id
                  WHERE l.transaction_id = t.id) AS lines
           FROM org_ledger_transactions t
           LEFT JOIN org_constituents ct ON ct.id = t.constituent_id
          WHERE ${where}
          ORDER BY ${txnOrderBy(req)}
          LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      const transactions = r.rows.map((row) => ({
          id: row.id, date: String(row.transaction_date).slice(0, 10), status: row.status, memo: row.memo, payee: row.payee,
          reference: row.reference_number, source: row.source, entry_type: row.entry_type, reverses_transaction_id: row.reverses_transaction_id,
          constituent_id: row.constituent_id, contact_name: row.contact_name, void_reason: row.void_reason,
          source_label: sourceLabel(row.source, row.entry_type), status_label: statusLabel(row.status), total_cents: String(row.total_cents), original_total_cents: String(row.original_total_cents), lines: row.lines || [],
        }));
      await addFileInfo(pool, req.orgId, transactions, 'ledger_transaction');
      return res.json({ total, limit, offset, transactions });
    } catch (e) {
      console.error('GET /ledger/transaction-list:', e.message);
      return res.status(500).json({ error: 'Could not load transactions' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/transaction-list/export', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const params = [req.orgId];
      const where = txnFilter(req, params);
      const r = await pool.query(
        `SELECT t.id, t.transaction_date, t.status, t.source, t.entry_type, t.payee, ct.display_name AS contact_name, t.memo, t.reference_number,
                a.code AS account_code, a.name AS account_name, pr.name AS program, g.name AS grant_name,
                l.line_memo, l.debit_cents, l.credit_cents
           FROM org_ledger_transactions t
           JOIN org_ledger_lines l ON l.transaction_id = t.id
           LEFT JOIN org_constituents ct ON ct.id = t.constituent_id
           JOIN org_accounts a ON a.id = l.account_id
           LEFT JOIN org_programs pr ON pr.id = l.program_id
           LEFT JOIN org_grants g ON g.id = l.grant_id
          WHERE ${where}
          ORDER BY t.transaction_date DESC, t.id DESC, l.id
          LIMIT ${TXN_CSV_MAX_LINES + 1}`,
        params
      );
      const truncated = r.rows.length > TXN_CSV_MAX_LINES;
      const rows = truncated ? r.rows.slice(0, TXN_CSV_MAX_LINES) : r.rows;
      const cell = csvCell;
      const money = (c) => (Number(c) === 0 ? '' : (Number(c) / 100).toFixed(2));
      const out = [['Date', 'Transaction', 'Status', 'Source', 'Payee', 'Memo', 'Reference', 'Account code', 'Account', 'Program', 'Grant', 'Line memo', 'Debit', 'Credit']];
      for (const x of rows) {
        out.push([String(x.transaction_date).slice(0, 10), x.id, statusLabel(x.status), sourceLabel(x.source, x.entry_type), x.contact_name || x.payee || '', x.memo || '', x.reference_number || '',
          x.account_code, x.account_name, x.program || '', x.grant_name || '', x.line_memo || '', money(displayCents(x.status, x.debit_cents)), money(displayCents(x.status, x.credit_cents))]);
      }
      if (truncated) out.push(['', '', '', '', '', `Export stopped at ${TXN_CSV_MAX_LINES} lines. Narrow the filters.`]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(out.map((row) => row.map(cell).join(',')).join('\r\n'));
    } catch (e) {
      console.error('GET /ledger/transaction-list/export:', e.message);
      return res.status(500).json({ error: 'Could not export transactions' });
    }
  });

  const { EDITABLE_SOURCES, LINKED_SOURCES, SOURCE_NOUN, isSystemAccount, isClassificationLine, isGiftAssetSide } = require('../lib/ledgerEntryEdit');
  const editEligibility = (orgId, txnId, source, status, fiscalYear, sourceLabels) => entryEdit.editEligibility(pool, orgId, txnId, source, status, fiscalYear, sourceLabels);

  async function loadEditHistory(orgId, txnId) {
    const r = await pool.query(
      `SELECT a.occurred_at, a.field_name, a.old_value, a.new_value, a.metadata, u.email AS by_email
         FROM org_audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.org_id = $1 AND a.table_name = 'org_ledger_transactions' AND a.record_id = $2 AND a.action = 'update'
        ORDER BY a.occurred_at, a.id`,
      [orgId, txnId]
    );
    const groups = [];
    for (const row of r.rows) {
      const key = String(row.occurred_at.toISOString ? row.occurred_at.toISOString() : row.occurred_at) + '|' + (row.by_email || '');
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, at: row.occurred_at, by: row.by_email, reason: row.metadata && row.metadata.reason ? row.metadata.reason : null, changes: [] };
        groups.push(g);
      }
      g.changes.push({ field: row.field_name, from: row.old_value, to: row.new_value });
    }
    return groups.map(({ at, by, reason, changes }) => ({ at, by, reason, changes }));
  }

  app.get('/api/organizational/orgs/:slug/ledger/transactions/:id', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid transaction id' });
    try {
      const orgId = req.orgId;
      const t = await pool.query(
        `SELECT t.id, t.transaction_date, t.fiscal_year, t.status, t.memo, t.payee, t.reference_number, t.source,
                t.created_at, t.approved_at, t.voided_at, t.void_reason, t.reverses_transaction_id, t.entry_type, t.journal_reason,
                t.constituent_id, ct.display_name AS contact_name,
                cu.email AS created_by_email, au.email AS approved_by_email, vu.email AS voided_by_email
           FROM org_ledger_transactions t
           LEFT JOIN org_constituents ct ON ct.id = t.constituent_id
           LEFT JOIN users cu ON cu.id = t.created_by
           LEFT JOIN users au ON au.id = t.approved_by
           LEFT JOIN users vu ON vu.id = t.voided_by
          WHERE t.org_id = $1 AND t.id = $2`, [orgId, id]);
      if (!t.rows.length) return res.status(404).json({ error: 'Transaction not found' });
      const lines = await pool.query(
        `SELECT l.id, l.account_id, l.program_id, l.grant_id, a.code AS account_code, a.name AS account_name, pr.name AS program_name, g.name AS grant_name,
                a.type::text AS account_type, a.is_cash_account, a.is_system_ap_account, a.is_system_ar_account, a.is_system_clearing_account,
                a.is_system_expense_claims_payable_account, a.is_system_unallocated_receipts_account,
                l.donor_restriction_class::text AS restriction, l.debit_cents, l.credit_cents, l.line_memo
           FROM org_ledger_lines l
           JOIN org_accounts a ON a.id = l.account_id
           LEFT JOIN org_programs pr ON pr.id = l.program_id
           LEFT JOIN org_grants g ON g.id = l.grant_id
          WHERE l.transaction_id = $1 ORDER BY l.id`, [id]);
      if (!lines.rows.length) return res.status(404).json({ error: 'Transaction not found' });
      const reversedBy = await pool.query(
        `SELECT id FROM org_ledger_transactions WHERE org_id = $1 AND reverses_transaction_id = $2 ORDER BY id`, [orgId, id]);
      const src = await pool.query(
        `SELECT 'bill' AS type, b.id AS ref_id, 'Bill #' || b.id AS label FROM org_bills b WHERE b.org_id = $1 AND b.ledger_transaction_id = $2
         UNION ALL SELECT 'bill', p.bill_id, 'Payment on bill #' || p.bill_id FROM org_bill_payments p WHERE p.org_id = $1 AND p.ledger_transaction_id = $2
         UNION ALL SELECT 'invoice', i.id, 'Invoice #' || i.id FROM org_invoices i WHERE i.org_id = $1 AND i.ledger_transaction_id = $2
         UNION ALL SELECT 'invoice', p.invoice_id, 'Payment on invoice #' || p.invoice_id FROM org_invoice_payments p WHERE p.org_id = $1 AND p.ledger_transaction_id = $2
         UNION ALL SELECT 'bank_line', s.id, 'Bank line #' || s.id || ' (' || COALESCE(s.description_raw, 'bank feed') || ')' FROM org_bank_statement_lines s WHERE s.org_id = $1 AND s.ledger_transaction_id = $2
         UNION ALL SELECT 'expense_claim', e.id, 'Expense claim #' || e.id FROM org_expense_claims e WHERE e.org_id = $1 AND e.ledger_transaction_id = $2
         UNION ALL SELECT 'gift', gf.id, 'Gift #' || gf.id FROM org_gifts gf WHERE gf.org_id = $1 AND gf.ledger_transaction_id = $2
         UNION ALL SELECT 'fixed_asset', d.id, 'Depreciation entry #' || d.id FROM org_fixed_asset_depreciation_entries d WHERE d.org_id = $1 AND d.ledger_transaction_id = $2`,
        [orgId, id]);
      const row = t.rows[0];
      return res.json({
        transaction: {
          id: row.id, date: String(row.transaction_date).slice(0, 10), fiscal_year: row.fiscal_year, status: row.status,
          memo: row.memo, payee: row.payee, reference: row.reference_number, source: row.source,
          constituent_id: row.constituent_id, contact_name: row.contact_name,
          entry_type: row.entry_type, journal_reason: row.journal_reason,
          created_at: row.created_at, created_by: row.created_by_email, approved_at: row.approved_at, approved_by: row.approved_by_email,
          voided_at: row.voided_at, voided_by: row.voided_by_email, void_reason: row.void_reason,
          reverses_transaction_id: row.reverses_transaction_id, reversed_by: reversedBy.rows.map((x) => x.id),
        },
        reconciliation: await (async () => {
          const rr = await pool.query(
            `SELECT s.id FROM org_bank_statement_lines s WHERE s.org_id = $1 AND (s.ledger_transaction_id = $2
               OR s.id IN (SELECT statement_line_id FROM org_bank_statement_line_postings WHERE ledger_transaction_id = $2))`, [orgId, row.id]);
          return { reconciled: rr.rows.length > 0, statement_line_ids: rr.rows.map((x) => x.id) };
        })(),
        edit: await editEligibility(orgId, row.id, row.source, row.status, row.fiscal_year, src.rows.map((x) => x.label)),
        edits: await loadEditHistory(orgId, row.id),
        lines: lines.rows.map((l) => ({
          id: l.id, account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id, account_type: l.account_type,
          limited_editable: isGiftAssetSide(row.source, { type: l.account_type, is_cash_account: l.is_cash_account, is_system_ap_account: l.is_system_ap_account,
            is_system_ar_account: l.is_system_ar_account, is_system_clearing_account: l.is_system_clearing_account,
            is_system_expense_claims_payable_account: l.is_system_expense_claims_payable_account, is_system_unallocated_receipts_account: l.is_system_unallocated_receipts_account }, l.debit_cents)
            || isClassificationLine({ type: l.account_type, is_cash_account: l.is_cash_account, is_system_ap_account: l.is_system_ap_account,
            is_system_ar_account: l.is_system_ar_account, is_system_clearing_account: l.is_system_clearing_account,
            is_system_expense_claims_payable_account: l.is_system_expense_claims_payable_account, is_system_unallocated_receipts_account: l.is_system_unallocated_receipts_account }),
          account_code: l.account_code, account_name: l.account_name, program: l.program_name, grant: l.grant_name,
          restriction: l.restriction, memo: l.line_memo, debit_cents: String(l.debit_cents), credit_cents: String(l.credit_cents),
        })),
        source_links: src.rows.map((x) => ({ type: x.type, id: x.ref_id, label: x.label })),
      });
    } catch (e) {
      console.error('GET /ledger/transactions/:id:', e.message);
      return res.status(500).json({ error: 'Could not load the transaction' });
    }
  });

  const MIN_JOURNAL_REASON = 10;
  const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n > 0 ? n : null; };

  async function buildSimpleEntryLines(orgId, entryType, body) {
    const cashIds = new Set((await pool.query(
      `SELECT id FROM org_accounts WHERE org_id = $1 AND is_cash_account = true AND is_posting = true`, [orgId])).rows.map((r) => r.id));
    if (entryType === 'transfer') {
      const from = posInt(body.from_account_id), to = posInt(body.to_account_id);
      const program = posInt(body.program_id)
        || (await pool.query('SELECT org_get_or_create_internal_transfer_program($1) AS id', [orgId])).rows[0].id;
      const amount = Number.parseInt(String(body.amount_cents), 10);
      if (!from || !to || !cashIds.has(from) || !cashIds.has(to)) return { error: 'Pick two bank or cash accounts to transfer between.' };
      if (from === to) return { error: 'A transfer needs two different accounts.' };
      if (!Number.isInteger(amount) || amount < 1) return { error: 'amount must be greater than zero' };
      return { lines: [
        { account_id: to, program_id: program, debit_cents: amount, credit_cents: 0 },
        { account_id: from, program_id: program, debit_cents: 0, credit_cents: amount },
      ] };
    }
    const bank = posInt(body.bank_account_id);
    if (!bank || !cashIds.has(bank)) return { error: entryType === 'receive' ? 'Pick the bank account the money went into.' : 'Pick the bank account the money came out of.' };
    const src = Array.isArray(body.lines) ? body.lines : [];
    if (!src.length) return { error: 'Add at least one line.' };
    const detail = [];
    let total = 0;
    for (let i = 0; i < src.length; i++) {
      const l = src[i] || {};
      const account = posInt(l.account_id), program = posInt(l.program_id);
      const amount = Number.parseInt(String(l.amount_cents), 10);
      if (!account) return { error: `line ${i + 1}: pick an account` };
      if (cashIds.has(account)) return { error: `line ${i + 1}: that is a bank account. To move money between bank accounts use Transfer.` };
      if (!program) return { error: `line ${i + 1}: pick a program` };
      if (!Number.isInteger(amount) || amount < 1) return { error: `line ${i + 1}: amount must be greater than zero` };
      total += amount;
      detail.push({ account_id: account, program_id: program, grant_id: l.grant_id || null, line_memo: l.line_memo || null,
        board_designation_id: l.board_designation_id || null,
        debit_cents: entryType === 'spend' ? amount : 0, credit_cents: entryType === 'receive' ? amount : 0 });
    }
    const bankLine = { account_id: bank, program_id: detail[0].program_id, debit_cents: entryType === 'receive' ? total : 0, credit_cents: entryType === 'spend' ? total : 0 };
    return { lines: entryType === 'receive' ? [bankLine, ...detail] : [...detail, bankLine] };
  }

  async function postEntry(req, res, entryType) {
    const body = req.body || {};
    let lines = body.lines;
    let journalReason = null;
    let applied = null;
    if (entryType === 'journal') {
      journalReason = body.reason != null ? String(body.reason).trim() : '';
      if (journalReason.length < MIN_JOURNAL_REASON) {
        return res.status(400).json({ error: `A journal entry needs a reason (at least ${MIN_JOURNAL_REASON} characters) so it can be explained later.` });
      }
    } else if (entryType === 'receive' && body.apply && body.apply.kind && body.apply.id) {
      applied = await loadExpected(pool, req.orgId, String(body.apply.kind), Number.parseInt(String(body.apply.id), 10));
      if (!applied) return res.status(409).json({ error: 'That expected gift is no longer open. Choose again, or save this as a new gift.', code: 'expected_gone' });
      if (applied.kind === 'pledge_installment') {
        const bank = Number.parseInt(String(body.bank_account_id), 10);
        const okBank = await pool.query('SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND is_cash_account = true AND is_posting = true', [bank, req.orgId]);
        if (!okBank.rows.length) return res.status(400).json({ error: 'Pick the bank account the money went into.' });
        const receipt = pledgeReceiptLines(applied, bank);
        if (receipt.error) return res.status(400).json({ error: receipt.error });
        lines = receipt.lines;
      } else {
        const built = await buildSimpleEntryLines(req.orgId, entryType, body);
        if (built.error) return res.status(400).json({ error: built.error });
        lines = built.lines;
        const cats = await pool.query(`SELECT id FROM org_accounts WHERE org_id = $1 AND standard_category = 'REV_CONTRIB' AND id = ANY($2::int[])`, [req.orgId, lines.map((l) => l.account_id)]);
        const contribIds = new Set(cats.rows.map((r) => r.id));
        const contribTotal = lines.filter((l) => contribIds.has(l.account_id)).reduce((t, l) => t + Number(l.credit_cents || 0), 0);
        if (contribTotal !== Number(applied.amount_cents)) {
          return res.status(400).json({ error: 'The contribution lines add up to ' + (contribTotal / 100).toFixed(2) + ', but the gift Funding expects is ' + (Number(applied.amount_cents) / 100).toFixed(2) + '. Make them agree, or save this as a new gift.' });
        }
        const sponsored = await sponsoredGiftCoding(pool, req.orgId, applied.sponsored_project_id);
        if (sponsored && sponsored.error) return res.status(400).json({ error: sponsored.error, code: sponsored.code });
        if (sponsored) {
          lines = lines.map((l) => (contribIds.has(l.account_id)
            ? { ...l, program_id: sponsored.programId, donor_restriction_class: sponsored.restrictionClass } : l));
        }
      }
    } else {
      const built = await buildSimpleEntryLines(req.orgId, entryType, body);
      if (built.error) return res.status(400).json({ error: built.error });
      lines = built.lines;
    }
    let constituentId = null;
    let payee = body.payee != null ? String(body.payee) : null;
    if (body.constituent_id != null && body.constituent_id !== '') {
      constituentId = Number.parseInt(String(body.constituent_id), 10);
      if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id must be a positive integer' });
      const c = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, req.orgId]);
      if (!c.rows.length) return res.status(400).json({ error: 'That contact was not found in this organization' });
      if (!payee || !payee.trim()) payee = c.rows[0].display_name;
    } else if (applied && applied.constituent_id) {
      constituentId = Number(applied.constituent_id);
      const c = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, req.orgId]);
      if (c.rows.length && (!payee || !payee.trim())) payee = c.rows[0].display_name;
    }
    const result = await postLedgerTransaction(pool, {
      orgId: req.orgId,
      userId: req.user.user_id ?? req.user.id,
      transactionDate: body.transaction_date != null ? String(body.transaction_date) : null,
      memo: body.memo != null ? String(body.memo) : null,
      payee,
      constituentId,
      referenceNumber: body.reference_number != null ? String(body.reference_number) : null,
      lines,
      source: 'manual',
      entryType,
      journalReason,
    });
    if (result.httpStatus < 400 && applied && result.body && result.body.id) {
      try {
        if (applied.kind === 'pledge_installment') {
          const collected = await markInstallmentCollected(pool, { orgId: req.orgId, installmentId: applied.id, ledgerTransactionId: result.body.id, date: body.transaction_date });
          if (!collected) console.error('apply installment: it was no longer expected after posting', applied.id);
        } else {
          await pool.query(
            `UPDATE org_gifts SET ledger_transaction_id = $1, posting_status = 'posted'
              WHERE id = $2 AND org_id = $3 AND ledger_transaction_id IS NULL`, [result.body.id, applied.id, req.orgId]);
        }
        result.body.matched = { kind: applied.kind, id: applied.id };
      } catch (e) { console.error('apply expected gift:', e.message); }
    }
    if (result.httpStatus < 400 && entryType === 'receive' && result.body && result.body.id) {
      try {
        const g = await suggestGiftForTransaction(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, transactionId: result.body.id });
        if (g.created) result.body.gift_suggested = true;
      } catch (e) { console.error('suggest gift for entry:', e.message); }
    }
    return res.status(result.httpStatus).json(result.body);
  }

  app.patch('/api/organizational/orgs/:slug/ledger/transactions/:id', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const out = await runTool('ledger_entry.update', ctxFromReq(pool, req), { ...(req.body || {}), id: req.params.id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('PATCH /ledger/transactions/:id:', e.message);
      return res.status(500).json({ error: 'Could not save the change' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/expected-gifts', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const amount = Number.parseInt(String(req.query.amount_cents || '0'), 10) || 0;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : null;
      if (!amount && !req.query.q) return res.json({ candidates: [] });
      const candidates = await findExpectedGifts(pool, { orgId: req.orgId, amountCents: amount, date, text: String(req.query.text || ''), q: req.query.q ? String(req.query.q) : '' });
      return res.json({ candidates });
    } catch (e) {
      console.error('GET ledger/expected-gifts:', e.message);
      return res.status(500).json({ error: 'Could not look up expected gifts' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/entries', ...orgAuth, financeWriter, async (req, res) => {
    const entryType = String((req.body && req.body.entry_type) || '');
    if (!['receive', 'spend', 'transfer', 'journal'].includes(entryType)) {
      return res.status(400).json({ error: 'entry_type must be receive, spend, transfer or journal' });
    }
    return postEntry(req, res, entryType);
  });

  app.post('/api/organizational/orgs/:slug/ledger/transactions', ...orgAuth, financeWriter, async (req, res) => postEntry(req, res, 'journal'));

  app.post('/api/organizational/orgs/:slug/ledger/transactions/:id/void', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const transactionId = Number.parseInt(String(req.params.id), 10);
    const voidReason = req.body && req.body.void_reason != null ? String(req.body.void_reason).trim() : '';

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      return res.status(400).json({ error: 'invalid transaction id' });
    }
    if (!voidReason) return res.status(400).json({ error: 'A reason is required to void an entry.', code: 'reason_required' });
    const rec = await pool.query(
      `SELECT 1 FROM org_bank_statement_lines WHERE org_id = $1 AND ledger_transaction_id = $2
       UNION ALL SELECT 1 FROM org_bank_statement_line_postings WHERE ledger_transaction_id = $2 LIMIT 1`, [orgId, transactionId]);
    if (rec.rows.length) {
      return res.status(409).json({ error: 'This entry is reconciled to a bank line. Unreconcile it first, or use Void and return.', code: 'reconciled' });
    }
    if (voidReason) {
      const bp = await pool.query(`SELECT id, bill_id FROM org_bill_payments WHERE ledger_transaction_id = $1 AND org_id = $2 AND status = 'posted'`, [transactionId, orgId]);
      if (bp.rows.length) {
        const r = await runTool('bill.void_payment', ctxForUser(pool, orgId, userId), { id: bp.rows[0].bill_id, payment_id: bp.rows[0].id, reason: voidReason });
        return res.status(r.httpStatus).json(r.body);
      }
      const ip = await pool.query(`SELECT id, invoice_id FROM org_invoice_payments WHERE ledger_transaction_id = $1 AND org_id = $2 AND status = 'posted'`, [transactionId, orgId]);
      if (ip.rows.length) {
        const r = await runTool('invoice.void_payment', ctxForUser(pool, orgId, userId), { id: ip.rows[0].invoice_id, payment_id: ip.rows[0].id, reason: voidReason });
        return res.status(r.httpStatus).json(r.body);
      }
    }
    const owner = await pool.query(
      `SELECT 'bill' AS kind, id FROM org_bills WHERE org_id = $1 AND ledger_transaction_id = $2 AND status NOT IN ('draft', 'void')
       UNION ALL
       SELECT 'invoice', id FROM org_invoices WHERE org_id = $1 AND ledger_transaction_id = $2 AND status NOT IN ('draft', 'void')
       UNION ALL
       SELECT 'disbursement', id FROM org_sponsored_project_disbursements WHERE org_id = $1 AND ledger_transaction_id = $2
       UNION ALL
       SELECT 'conversion', id FROM org_conversion_balances WHERE org_id = $1 AND ledger_transaction_id = $2 LIMIT 1`,
      [orgId, transactionId]);
    if (owner.rows.length && owner.rows[0].kind === 'conversion') {
      return res.status(409).json({ error: 'This entry holds the conversion balances. Unlock and change them in Accounting settings, Conversion balances.', code: 'owned_by_document' });
    }
    if (owner.rows.length) {
      const o = owner.rows[0];
      return res.status(409).json({
        error: o.kind === 'disbursement'
          ? `This entry belongs to sponsored-project disbursement #${o.id}. Use Unpost on that disbursement, so Sponsorship and the books stay together.`
          : `This entry belongs to ${o.kind} #${o.id}. Use Revert to draft or Void ${o.kind} on that ${o.kind}'s page, so the ${o.kind} and its entry stay together.`,
        code: 'owned_by_document',
      });
    }
    const result = await voidLedgerTransaction(pool, { orgId, userId, transactionId, voidReason });
    if (result.httpStatus < 400) {
      try { await voidGiftsForTransaction(pool, { orgId, transactionId }); } catch (e) { console.error('void gifts for entry:', e.message); }
    }
    return res.status(result.httpStatus).json(result.body);
  });

  app.post('/api/organizational/orgs/:slug/ledger/transactions/:id/approve', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const out = await runTool('ledger_entry.approve', ctxFromReq(pool, req), { id: req.params.id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /ledger/transactions/:id/approve:', e.message);
      return res.status(500).json({ error: 'Could not approve transaction' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/approval-policy', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM org_ledger_approval_policies WHERE org_id = $1`, [req.orgId]);
      const row = r.rows[0] || null;
      return res.json({
        reviewer_role: row?.reviewer_role || null,
        review_cadence: row?.review_cadence || null,
        description: row?.description || null,
        flagged_amount_threshold_cents: row ? String(row.flagged_amount_threshold_cents) : '500000',
        updated_at: row?.updated_at || null,
      });
    } catch (e) {
      console.error('GET /ledger/approval-policy:', e.message);
      return res.status(500).json({ error: 'Could not load approval policy' });
    }
  });

  app.put('/api/organizational/orgs/:slug/ledger/approval-policy', ...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES]), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const reviewerRole = body.reviewer_role != null ? String(body.reviewer_role).trim() || null : null;
    const reviewCadence = body.review_cadence != null ? String(body.review_cadence).trim() || null : null;
    const description = body.description != null ? String(body.description).trim() || null : null;
    const thresholdCents = body.flagged_amount_threshold_cents != null
      ? Number.parseInt(String(body.flagged_amount_threshold_cents), 10)
      : 500000;
    if (!Number.isInteger(thresholdCents) || thresholdCents < 0) {
      return res.status(400).json({ error: 'flagged_amount_threshold_cents must be a non-negative integer' });
    }

    try {
      const beforeR = await pool.query('SELECT reviewer_role, review_cadence, description, flagged_amount_threshold_cents FROM org_ledger_approval_policies WHERE org_id = $1', [orgId]);
      await pool.query(
        `INSERT INTO org_ledger_approval_policies
           (org_id, reviewer_role, review_cadence, description, flagged_amount_threshold_cents, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (org_id) DO UPDATE SET
           reviewer_role = EXCLUDED.reviewer_role,
           review_cadence = EXCLUDED.review_cadence,
           description = EXCLUDED.description,
           flagged_amount_threshold_cents = EXCLUDED.flagged_amount_threshold_cents,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [orgId, reviewerRole, reviewCadence, description, thresholdCents, userId]
      );
      const before = beforeR.rows[0] || { flagged_amount_threshold_cents: 500000 };
      const after = { reviewer_role: reviewerRole, review_cadence: reviewCadence, description, flagged_amount_threshold_cents: thresholdCents };
      await logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_ledger_approval_policies', recordId: orgId,
        fields: diffFields(before, after, ['reviewer_role', 'review_cadence', 'description', 'flagged_amount_threshold_cents']),
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('PUT /ledger/approval-policy:', e.message);
      return res.status(500).json({ error: 'Could not save approval policy' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/approval-policy/export', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const orgR = await pool.query(`SELECT display_name FROM coop_members WHERE id = $1`, [req.orgId]);
      const orgName = orgR.rows[0]?.display_name || 'Organization';
      const r = await pool.query(`SELECT * FROM org_ledger_approval_policies WHERE org_id = $1`, [req.orgId]);
      const p = r.rows[0] || {};
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
      const usd = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Ledger approval policy — ${esc(orgName)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; max-width: 640px; margin: 40px auto; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 24px; }
  dl { margin: 0; }
  dt { font-weight: 700; margin-top: 14px; }
  dd { margin: 2px 0 0 0; color: #333; }
</style>
</head><body>
  <h1>Ledger approval policy</h1>
  <div class="sub">${esc(orgName)} — generated ${esc(new Date().toISOString().slice(0, 10))}</div>
  <dl>
    <dt>Reviewer role</dt><dd>${esc(p.reviewer_role) || '—'}</dd>
    <dt>Review cadence</dt><dd>${esc(p.review_cadence) || '—'}</dd>
    <dt>Description</dt><dd>${esc(p.description) || '—'}</dd>
    <dt>Flagged-review dollar threshold</dt><dd>${usd(p.flagged_amount_threshold_cents ?? 500000)}</dd>
    <dt>Federal-award transactions</dt><dd>Require real-time sign-off from a user other than whoever created the entry, before posting (2 CFR 200.303).</dd>
    <dt>Last updated</dt><dd>${p.updated_at ? esc(new Date(p.updated_at).toISOString().slice(0, 10)) : 'never'}</dd>
  </dl>
</body></html>`;
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (e) {
      console.error('GET /ledger/approval-policy/export:', e.message);
      return res.status(500).json({ error: 'Could not export approval policy' });
    }
  });

  app.get('/api/organizational/orgs/:slug/ledger/flagged-review', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    try {
      const policyR = await pool.query(`SELECT flagged_amount_threshold_cents FROM org_ledger_approval_policies WHERE org_id = $1`, [orgId]);
      const thresholdCents = policyR.rows[0] ? Number(policyR.rows[0].flagged_amount_threshold_cents) : 500000;

      const r = await pool.query(
        `WITH txn_totals AS (
           SELECT t.id, t.transaction_date, t.memo, t.payee, t.status, t.source, t.created_by,
                  SUM(l.debit_cents) AS total_debit_cents,
                  MIN(t.created_at) AS created_at
           FROM org_ledger_transactions t
           JOIN org_ledger_lines l ON l.transaction_id = t.id
           WHERE t.org_id = $1 AND t.status <> 'voided'
           GROUP BY t.id
         ),
         first_seen_payee AS (
           SELECT payee, MIN(id) AS first_transaction_id
           FROM org_ledger_transactions
           WHERE org_id = $1 AND payee IS NOT NULL AND payee <> ''
           GROUP BY payee
         )
         SELECT tt.id, tt.transaction_date, tt.memo, tt.payee, tt.status, tt.source,
                tt.total_debit_cents,
                (tt.total_debit_cents >= $2) AS flag_large_amount,
                (fsp.first_transaction_id = tt.id) AS flag_new_payee,
                (tt.source = 'manual') AS flag_manual_entry
         FROM txn_totals tt
         LEFT JOIN first_seen_payee fsp ON fsp.payee = tt.payee
         WHERE tt.total_debit_cents >= $2
            OR fsp.first_transaction_id = tt.id
            OR tt.source = 'manual'
         ORDER BY tt.transaction_date DESC, tt.id DESC
         LIMIT 500`,
        [orgId, thresholdCents]
      );

      return res.json({
        threshold_cents: String(thresholdCents),
        transactions: r.rows.map((row) => ({
          id: row.id,
          transaction_date: row.transaction_date,
          memo: row.memo,
          payee: row.payee,
          status: row.status,
          total_debit_cents: String(row.total_debit_cents),
          flags: {
            large_amount: !!row.flag_large_amount,
            new_payee: !!row.flag_new_payee,
            manual_entry: !!row.flag_manual_entry,
          },
        })),
      });
    } catch (e) {
      console.error('GET /ledger/flagged-review:', e.message);
      return res.status(500).json({ error: 'Could not load flagged-transaction review' });
    }
  });

  // ── Find & Recode: dynamic condition search + posted-ledger correcting journal ─────────────
  app.get('/api/organizational/orgs/:slug/ledger/recode/field-options', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    try {
      const options = await loadFieldOptions(pool, req.orgId);
      return res.json(options);
    } catch (e) {
      console.error('GET /ledger/recode/field-options:', e.message);
      return res.status(500).json({ error: 'Could not load field options' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode/search', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const body = req.body || {};
    const validated = validateConditions(body.conditions, body.match_mode);
    if (validated.error) return res.status(400).json({ error: validated.error });
    try {
      const result = await searchLedgerLines(pool, orgId, validated.conditions, validated.matchMode);
      return res.json(result);
    } catch (e) {
      console.error('POST /ledger/recode/search:', e.message);
      return res.status(500).json({ error: 'Could not search ledger lines' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode/preview', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const body = req.body || {};
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (lineIds.length === 0) return res.status(400).json({ error: 'line_ids is required' });
    const changesRaw = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const changes = {};
    for (const f of ['account_id', 'program_id', 'grant_id']) {
      if (changesRaw[f] === undefined) continue;
      if (changesRaw[f] === null || changesRaw[f] === '') {
        changes[f] = null;
      } else {
        const n = Number.parseInt(String(changesRaw[f]), 10);
        if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: `changes.${f} must be a positive integer or null` });
        changes[f] = n;
      }
    }
    try {
      const preview = await previewLedgerRecode(pool, orgId, lineIds, changes);
      return res.json(preview);
    } catch (e) {
      console.error('POST /ledger/recode/preview:', e.message);
      return res.status(500).json({ error: 'Could not preview recode' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode', ...orgAuth, requireOrgRole('admin'), financeWriter, async (req, res) => {
    try {
      const out = await runTool('ledger.recode', ctxFromReq(pool, req), req.body || {});
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /ledger/recode:', e.message);
      return res.status(500).json({ error: 'Could not recode ledger lines' });
    }
  });
}

module.exports = { registerOrganizationalLedgerRoutes };
