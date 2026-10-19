'use strict';
const { addFileInfo } = require('../lib/recordFiles');

const { findExpectedGifts, loadExpected } = require('../lib/giftMatch');
const { pledgeReceiptLines, markInstallmentCollected } = require('../lib/pledgeReceipt');
const { suggestGiftForTransaction, voidGiftsForTransaction, syncGiftAfterRecode } = require('../lib/giftIntake');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole, FINANCE_ROLES } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { translateLedgerWriteError, postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, DATE_RE, RESTRICTION_CLASSES } = require('../lib/ledgerPosting');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { previewLedgerRecode, executeLedgerRecode } = require('../lib/findAndRecode');
const { validateConditions, searchLedgerLines, loadFieldOptions } = require('../lib/ledgerSearch');
const { logAudit, diffFields } = require('../lib/auditLog');
const { displayAmountSql, displayCents } = require('../lib/voidedDisplay');
const { sourceLabel, statusLabel } = require('../lib/ledgerLabels');
const { voidBillPayment, voidInvoicePayment } = require('../lib/billInvoicePayments');

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
      const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
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

  const EDITABLE_SOURCES = new Set(['manual', 'bank_reconciliation']);
  const LINKED_SOURCES = { bill_approval: 'bill', invoice: 'invoice', expense_claim_approval: 'expense claim', gift_in_kind: 'gift', pledge_commitment: 'gift' };

  const SOURCE_NOUN = {
    bill_approval: 'a bill', bill_payment: 'a bill payment', invoice: 'an invoice', invoice_payment: 'an invoice payment',
    expense_claim_approval: 'an expense claim', expense_claim_payment: 'an expense claim payment',
    gift_in_kind: 'a gift', gift_reclassify: 'a gift', pledge_commitment: 'a pledge', pledge_accretion: 'a pledge',
    fixed_asset_depreciation: 'fixed assets', fixed_asset_disposal: 'fixed assets', recode: 'Find and recode',
    indirect_cost_recovery: 'indirect cost recovery', conversion_balance: 'Conversion balances',
  };

  async function editEligibility(orgId, txnId, source, status, fiscalYear, sourceLabels) {
    const memoOnly = status === 'voided';
    if (status === 'pending_approval') return { allowed: false, reason: 'This entry is waiting for approval. Approve or void it first.' };
    const limited = !EDITABLE_SOURCES.has(source);
    const sourceLabel = (sourceLabels && sourceLabels.length ? sourceLabels.join(', ') : (SOURCE_NOUN[source] || 'another part of Accounting'));
    if (await isFiscalYearLocked(pool, orgId, fiscalYear)) {
      return { allowed: false, reason: 'Fiscal year ' + fiscalYear + ' is locked. Void this entry (a reversing entry is posted) and enter the corrected one.' };
    }
    const rec = await pool.query(
      `SELECT DISTINCT s.id, s.bank_account_id FROM org_bank_statement_lines s
        WHERE s.org_id = $1 AND (s.ledger_transaction_id = $2
           OR s.id IN (SELECT statement_line_id FROM org_bank_statement_line_postings WHERE ledger_transaction_id = $2))`,
      [orgId, txnId]
    );
    return {
      allowed: true, reconciled: rec.rows.length > 0, memo_only: memoOnly,
      limited, source_label: limited ? sourceLabel : null,
      locked_account_ids: [...new Set(rec.rows.map((r) => r.bank_account_id))],
      statement_line_ids: rec.rows.map((r) => r.id),
    };
  }

  async function accountFacts(orgId, ids) {
    const r = await pool.query(
      `SELECT id, type::text AS type, is_posting, is_cash_account, is_system_ap_account, is_system_ar_account, is_system_clearing_account,
              is_system_expense_claims_payable_account, is_system_unallocated_receipts_account
         FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
    return new Map(r.rows.map((a) => [a.id, a]));
  }
  const isSystemAccount = (a) => a.is_cash_account || a.is_system_ap_account || a.is_system_ar_account || a.is_system_clearing_account
    || a.is_system_expense_claims_payable_account || a.is_system_unallocated_receipts_account;
  const isClassificationLine = (a) => !!a && (a.type === 'income' || a.type === 'expense') && !isSystemAccount(a);
  const isGiftAssetSide = (source, a, debitCents) => source === 'gift_in_kind' && !!a && a.type === 'asset' && !isSystemAccount(a) && Number(debitCents) > 0;

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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid transaction id' });
    const body = req.body || {};
    const reason = body.reason != null ? String(body.reason).trim() : '';
    if (body.date != null && !DATE_RE.test(String(body.date))) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    try {
      const tR = await pool.query(
        `SELECT t.id, t.transaction_date, t.fiscal_year, t.status, t.memo, t.payee, t.reference_number, t.source, t.constituent_id
           FROM org_ledger_transactions t WHERE t.org_id = $1 AND t.id = $2`, [orgId, id]);
      const t = tR.rows[0];
      if (!t) return res.status(404).json({ error: 'Transaction not found' });
      if (!reason) return res.status(400).json({ error: 'A reason is required to change an entry.', code: 'reason_required' });
      const linesR = await pool.query(
        `SELECT id, account_id, program_id, grant_id, donor_restriction_class::text AS restriction, line_memo, source_line_type, source_line_id, debit_cents, credit_cents
           FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [id]);
      const oldLines = new Map(linesR.rows.map((l) => [l.id, l]));

      const elig = await editEligibility(orgId, id, t.source, t.status, t.fiscal_year, []);
      if (!elig.allowed) return res.status(409).json({ error: elig.reason, code: 'not_editable' });
      if (elig.memo_only) {
        const lineSent = Array.isArray(body.lines) && body.lines.length > 0;
        const dateSent = body.date != null && String(body.date) !== String(t.transaction_date).slice(0, 10);
        const payeeSent = body.payee !== undefined && (body.payee == null ? null : String(body.payee).trim() || null) !== t.payee;
        const contactSent = body.constituent_id !== undefined && ((body.constituent_id == null || body.constituent_id === '') ? null : Number(body.constituent_id)) !== (t.constituent_id == null ? null : Number(t.constituent_id));
        if (lineSent || dateSent || payeeSent || contactSent) {
          return res.status(409).json({ error: 'This entry is voided. Only its memo and reference can change.', code: 'memo_only' });
        }
      }
      let acctFacts = new Map();
      if (elig.limited) {
        const wantedIds = new Set(linesR.rows.map((l) => l.account_id));
        for (const raw of Array.isArray(body.lines) ? body.lines : []) {
          const n = Number.parseInt(String(raw && raw.account_id), 10);
          if (n > 0) wantedIds.add(n);
        }
        acctFacts = await accountFacts(orgId, [...wantedIds]);
        const stay = (what) => res.status(409).json({
          error: 'This entry was created by ' + elig.source_label + ', so the date, payee and contact are changed there (' + what + ' was sent). You can correct the account, program and grant on its income and expense lines, and every description, its memo and its reference.',
          code: 'limited_edit' });
        if (body.date != null && String(body.date) !== String(t.transaction_date).slice(0, 10)) return stay('date');
        if (body.payee !== undefined && (body.payee == null ? null : String(body.payee).trim() || null) !== t.payee) return stay('payee');
        if (body.constituent_id !== undefined && ((body.constituent_id == null || body.constituent_id === '') ? null : Number(body.constituent_id)) !== (t.constituent_id == null ? null : Number(t.constituent_id))) return stay('contact');
      }

      const oldDate = String(t.transaction_date).slice(0, 10);
      const newDate = body.date != null ? String(body.date) : oldDate;
      const str = (k, cur) => (body[k] !== undefined ? (body[k] == null ? null : String(body[k]).trim() || null) : cur);
      const newPayee = str('payee', t.payee);
      const newMemo = str('memo', t.memo);
      const newRef = str('reference', t.reference_number);
      let newContact = t.constituent_id;
      if (body.constituent_id !== undefined) {
        newContact = body.constituent_id == null || body.constituent_id === '' ? null : Number.parseInt(String(body.constituent_id), 10);
        if (newContact != null && !(newContact > 0)) return res.status(400).json({ error: 'constituent_id must be a number' });
      }

      let newFy = t.fiscal_year;
      if (newDate !== oldDate) {
        if (elig.reconciled) return res.status(409).json({ error: 'This entry is reconciled to a bank line, so its date cannot change. Unreconcile it first.', code: 'reconciled_date' });
        newFy = fiscalYearForDate(newDate, await getFiscalYearEndMonth(pool, orgId));
        if (newFy !== t.fiscal_year && await isFiscalYearLocked(pool, orgId, newFy)) {
          return res.status(409).json({ error: 'Fiscal year ' + newFy + ' is locked.', code: 'fiscal_year_locked' });
        }
      }

      const lineEdits = [];
      for (const raw of Array.isArray(body.lines) ? body.lines : []) {
        const lineId = Number.parseInt(String(raw && raw.id), 10);
        const old = oldLines.get(lineId);
        if (!old) return res.status(400).json({ error: 'line ' + raw.id + ' is not on this entry' });
        const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
        const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
        const grantId = raw.grant_id !== undefined ? (raw.grant_id == null || raw.grant_id === '' ? null : Number.parseInt(String(raw.grant_id), 10)) : old.grant_id;
        if (!(accountId > 0) || !(programId > 0) || (grantId != null && !(grantId > 0))) return res.status(400).json({ error: 'account, program and grant must be ids' });
        if (raw.donor_restriction_class != null && raw.donor_restriction_class !== '' && !RESTRICTION_CLASSES.has(String(raw.donor_restriction_class))) {
          return res.status(400).json({ error: 'donor_restriction_class is not valid' });
        }
        const lineMemo = raw.line_memo !== undefined ? (raw.line_memo == null ? null : String(raw.line_memo).trim() || null) : old.line_memo;
        if (elig.reconciled && elig.locked_account_ids.includes(old.account_id) && accountId !== old.account_id) {
          return res.status(409).json({ error: 'The bank-side account on a reconciled entry cannot change. Unreconcile it first.', code: 'reconciled_account' });
        }
        if (elig.limited) {
          const oldFacts = acctFacts.get(old.account_id);
          const newFacts = acctFacts.get(accountId);
          const changesLine = accountId !== old.account_id || programId !== old.program_id || grantId !== old.grant_id
            || (raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '' && raw.donor_restriction_class !== old.restriction);
          if (changesLine && !isClassificationLine(oldFacts) && !isGiftAssetSide(t.source, oldFacts, old.debit_cents)) {
            return res.status(409).json({ error: 'Line ' + (linesR.rows.findIndex((l) => l.id === lineId) + 1) + ' is a receivable, payable or bank line set by ' + elig.source_label + ' and cannot be changed here.', code: 'limited_edit' });
          }
          if (changesLine && LINKED_SOURCES[t.source] && !old.source_line_id) {
            return res.status(409).json({ error: 'This line is not linked to its record on the ' + LINKED_SOURCES[t.source] + '. Change it there.', code: 'limited_edit' });
          }
          if (accountId !== old.account_id && old.source_line_type === 'org_gifts' && t.source !== 'gift_in_kind') {
            return res.status(409).json({ error: 'The accounts on a gift entry are set on the gift. Program and grant can change here.', code: 'limited_edit' });
          }
          if (accountId !== old.account_id) {
            const giftCostSide = t.source === 'gift_in_kind' && Number(old.debit_cents) > 0;
            const typeOk = newFacts && (giftCostSide ? (newFacts.type === 'expense' || newFacts.type === 'asset') : newFacts.type === oldFacts.type);
            if (!newFacts || !newFacts.is_posting || isSystemAccount(newFacts) || !typeOk) {
              return res.status(409).json({ error: giftCostSide ? 'An in-kind gift can be recorded as an expense or an asset (not cash, receivable or payable).' : 'An income line can change to another income account and an expense line to another expense account.', code: 'limited_edit' });
            }
          }
        }
        let debit = Number(old.debit_cents);
        let credit = Number(old.credit_cents);
        if (raw.debit_cents !== undefined || raw.credit_cents !== undefined) {
          debit = raw.debit_cents !== undefined ? Number(raw.debit_cents) : debit;
          credit = raw.credit_cents !== undefined ? Number(raw.credit_cents) : credit;
          if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
            return res.status(400).json({ error: 'Each line needs one positive amount, in cents.' });
          }
          if (debit !== Number(old.debit_cents) || credit !== Number(old.credit_cents)) {
            if (elig.limited || old.source_line_type) return res.status(409).json({ error: 'Amounts on this entry are set by the record it came from. Change them there.', code: 'limited_edit' });
            if (elig.reconciled) return res.status(409).json({ error: 'This entry is matched to a bank line, so its amounts stay as they are. Unreconcile it first.', code: 'reconciled_amount' });
          }
        }
        let restriction = old.restriction;
        if (raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '') restriction = raw.donor_restriction_class;
        lineEdits.push({ lineId, old, debit, credit, accountId, programId, grantId, lineMemo, restriction, grantChanged: grantId !== old.grant_id, restrictionGiven: raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '' });
      }

      if (lineEdits.some((e) => e.debit !== Number(e.old.debit_cents) || e.credit !== Number(e.old.credit_cents))) {
        const amt = new Map(linesR.rows.map((l) => [l.id, [Number(l.debit_cents), Number(l.credit_cents)]]));
        lineEdits.forEach((e) => amt.set(e.lineId, [e.debit, e.credit]));
        let d = 0; let c = 0;
        amt.forEach((v) => { d += v[0]; c += v[1]; });
        if (d !== c) return res.status(400).json({ error: 'Debits and credits must be equal after the change.' });
      }

      const finalGrantIds = new Set(linesR.rows.map((l) => (lineEdits.find((e) => e.lineId === l.id) || { grantId: l.grant_id }).grantId).filter((g) => g != null));
      if (lineEdits.some((e) => e.grantChanged) && finalGrantIds.size) {
        const gR = await pool.query(`SELECT id, is_federal_award, donor_restriction_class::text AS donor_restriction_class FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, [...finalGrantIds]]);
        const gById = new Map(gR.rows.map((g) => [g.id, g]));
        for (const e of lineEdits) {
          if (!e.grantChanged || e.grantId == null) continue;
          const g = gById.get(e.grantId);
          if (!g) return res.status(422).json({ error: 'That grant was not found.', code: 'cross_org_reference' });
          if (g.is_federal_award) return res.status(422).json({ error: 'A federal-award grant needs sign-off from a second person. Void this entry and enter the corrected one.', code: 'federal_award_needs_new_entry' });
          if (!e.restrictionGiven && g.donor_restriction_class) e.restriction = g.donor_restriction_class;
        }
      }

      const ids = (k) => [...new Set(lineEdits.flatMap((e) => [e.old[k], e[k === 'account_id' ? 'accountId' : k === 'program_id' ? 'programId' : 'grantId']]).filter((v) => v != null))];
      const [aR, pR, gR2, cR] = await Promise.all([
        pool.query(`SELECT id, code || ' ' || name AS label FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('account_id')]),
        pool.query(`SELECT id, name AS label FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('program_id')]),
        pool.query(`SELECT id, name AS label FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('grant_id')]),
        pool.query(`SELECT id, display_name AS label FROM org_constituents WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, [t.constituent_id, newContact].filter((v) => v != null)]),
      ]);
      const lab = (r, id) => (id == null ? '(none)' : ((r.rows.find((x) => x.id === id) || {}).label || '#' + id));

      const fields = [];
      const addField = (fieldName, o, n) => { if ((o == null ? null : String(o)) !== (n == null ? null : String(n))) fields.push({ fieldName, oldValue: o == null ? '(none)' : o, newValue: n == null ? '(none)' : n }); };
      addField('Date', oldDate, newDate);
      addField('Payee', t.payee, newPayee);
      addField('Memo', t.memo, newMemo);
      addField('Reference', t.reference_number, newRef);
      if (newContact !== t.constituent_id) fields.push({ fieldName: 'Contact', oldValue: lab(cR, t.constituent_id), newValue: lab(cR, newContact) });
      const lineNo = new Map(linesR.rows.map((l, i) => [l.id, i + 1]));
      for (const e of lineEdits) {
        const n = 'Line ' + lineNo.get(e.lineId) + ' ';
        if (e.accountId !== e.old.account_id) fields.push({ fieldName: n + 'account', oldValue: lab(aR, e.old.account_id), newValue: lab(aR, e.accountId) });
        if (e.programId !== e.old.program_id) fields.push({ fieldName: n + 'program', oldValue: lab(pR, e.old.program_id), newValue: lab(pR, e.programId) });
        if (e.grantId !== e.old.grant_id) fields.push({ fieldName: n + 'grant', oldValue: lab(gR2, e.old.grant_id), newValue: lab(gR2, e.grantId) });
        if ((e.restriction || null) !== (e.old.restriction || null)) fields.push({ fieldName: n + 'restriction', oldValue: e.old.restriction || '(none)', newValue: e.restriction || '(none)' });
        addField(n + 'memo', e.old.line_memo, e.lineMemo);
        if (e.debit !== Number(e.old.debit_cents)) fields.push({ fieldName: n + 'debit', oldValue: (Number(e.old.debit_cents) / 100).toFixed(2), newValue: (e.debit / 100).toFixed(2) });
        if (e.credit !== Number(e.old.credit_cents)) fields.push({ fieldName: n + 'credit', oldValue: (Number(e.old.credit_cents) / 100).toFixed(2), newValue: (e.credit / 100).toFixed(2) });
      }
      if (!fields.length) return res.status(400).json({ error: 'Nothing was changed.' });

      const sourceDocs = new Set();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE org_ledger_transactions SET transaction_date = $1, fiscal_year = $2, payee = $3, memo = $4, reference_number = $5, constituent_id = $6
            WHERE id = $7 AND org_id = $8`,
          [newDate, newFy, newPayee, newMemo, newRef, newContact, id, orgId]
        );
        for (const e of lineEdits) {
          await client.query(
            `UPDATE org_ledger_lines SET account_id = $1, program_id = $2, grant_id = $3, donor_restriction_class = $4::org_restriction_class, line_memo = $5,
                    debit_cents = $8, credit_cents = $9
              WHERE id = $6 AND transaction_id = $7`,
            [e.accountId, e.programId, e.grantId, e.restriction || null, e.lineMemo, e.lineId, id, e.debit, e.credit]
          );
          const changed = e.accountId !== e.old.account_id || e.programId !== e.old.program_id || e.grantId !== e.old.grant_id || e.lineMemo !== e.old.line_memo;
          if (changed && e.old.source_line_type === 'org_bill_lines') {
            const w = await client.query(
              'UPDATE org_bill_lines SET account_id = $1, program_id = $2, grant_id = $3, line_memo = $4 WHERE id = $5 RETURNING bill_id',
              [e.accountId, e.programId, e.grantId, e.lineMemo, e.old.source_line_id]);
            if (w.rows[0]) sourceDocs.add('org_bills:' + w.rows[0].bill_id);
          } else if (changed && e.old.source_line_type === 'org_expense_claim_lines') {
            const w = await client.query(
              'UPDATE org_expense_claim_lines SET account_id = $1, program_id = $2, grant_id = $3, line_memo = $4 WHERE id = $5 RETURNING claim_id',
              [e.accountId, e.programId, e.grantId, e.lineMemo, e.old.source_line_id]);
            if (w.rows[0]) sourceDocs.add('org_expense_claims:' + w.rows[0].claim_id);
          } else if (changed && e.old.source_line_type === 'org_gifts') {
            const w = await client.query(
              'UPDATE org_gifts SET program_id = $1, grant_id = $2 WHERE id = $3 AND org_id = $4 RETURNING id',
              [e.programId, e.grantId, e.old.source_line_id, orgId]);
            if (t.source === 'gift_in_kind' && e.accountId !== e.old.account_id) {
              await client.query(
                `UPDATE org_gifts SET ${Number(e.old.debit_cents) > 0 ? 'in_kind_expense_account_id' : 'in_kind_revenue_account_id'} = $1 WHERE id = $2 AND org_id = $3`,
                [e.accountId, e.old.source_line_id, orgId]);
            }
            await client.query(
              'UPDATE org_ledger_lines SET program_id = $1, grant_id = $2 WHERE transaction_id = $3 AND source_line_type = $4 AND source_line_id = $5',
              [e.programId, e.grantId, id, 'org_gifts', e.old.source_line_id]);
            if (w.rows[0]) sourceDocs.add('org_gifts:' + w.rows[0].id);
          } else if (changed && e.old.source_line_type === 'org_invoice_lines') {
            const w = await client.query(
              'UPDATE org_invoice_lines SET account_id = $1, program_id = $2 WHERE id = $3 RETURNING invoice_id',
              [e.accountId, e.programId, e.old.source_line_id]);
            if (w.rows[0]) sourceDocs.add('org_invoices:' + w.rows[0].invoice_id);
          }
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        const translated = translateLedgerWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        throw e;
      } finally {
        client.release();
      }
      if (lineEdits.some((e) => e.accountId !== e.old.account_id)) {
        try { await syncGiftAfterRecode(pool, { orgId, userId, transactionId: id }); } catch (e) { console.error('gift sync after recode:', e.message); }
      }
      await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: id, fields, metadata: { reason } });
      for (const key of sourceDocs) {
        const [tableName, docId] = key.split(':');
        logAudit(pool, { orgId, userId, action: 'update', tableName, recordId: Number(docId), fields: [], metadata: { recoded_from_ledger_entry: id, reason } }).catch(() => {});
      }
      return res.json({ id, changed: fields.length });
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
        const r = await voidBillPayment(pool, { orgId, userId, billId: bp.rows[0].bill_id, paymentId: bp.rows[0].id, reason: voidReason });
        return res.status(r.httpStatus).json(r.body);
      }
      const ip = await pool.query(`SELECT id, invoice_id FROM org_invoice_payments WHERE ledger_transaction_id = $1 AND org_id = $2 AND status = 'posted'`, [transactionId, orgId]);
      if (ip.rows.length) {
        const r = await voidInvoicePayment(pool, { orgId, userId, invoiceId: ip.rows[0].invoice_id, paymentId: ip.rows[0].id, reason: voidReason });
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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const transactionId = Number.parseInt(String(req.params.id), 10);

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      return res.status(400).json({ error: 'invalid transaction id' });
    }

    try {
      const existing = await pool.query(
        `SELECT id, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`,
        [transactionId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      if (existing.rows[0].status !== 'pending_approval') {
        return res.status(409).json({
          error: `Transaction is not awaiting approval (status: ${existing.rows[0].status})`,
          code: 'not_pending_approval',
        });
      }

      await pool.query(
        `UPDATE org_ledger_transactions
         SET status = 'posted', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND org_id = $3`,
        [userId, transactionId, orgId]
      );
      try { await suggestGiftForTransaction(pool, { orgId, userId, transactionId }); } catch (e) { console.error('suggest gift after approval:', e.message); }
      return res.json({ id: transactionId, status: 'posted' });
    } catch (e) {
      const translated = translateLedgerWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (lineIds.length === 0) return res.status(400).json({ error: 'line_ids is required' });
    const transactionDate = body.transaction_date != null ? String(body.transaction_date) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(transactionDate)) return res.status(400).json({ error: 'transaction_date must be YYYY-MM-DD' });
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
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'changes must include at least one of account_id, program_id, grant_id' });

    try {
      const preview = await previewLedgerRecode(pool, orgId, lineIds, changes);
      if (preview.hasConflicts) {
        const error = preview.targetIsSystemAccount
          ? 'System accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims Payable) cannot be a recode target.'
          : 'Some selected lines are not posted, or nothing was found for the given selection.';
        return res.status(409).json({ error, code: 'recode_conflicts', ...preview });
      }
      const result = await executeLedgerRecode(pool, orgId, userId, lineIds, changes, transactionDate);
      if (result.httpStatus !== 201) return res.status(result.httpStatus).json(result.body);

      logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_ledger_lines', recordId: lineIds[0],
        fields: [{ fieldName: 'recode', oldValue: null, newValue: JSON.stringify(changes) }],
        metadata: { operation: 'recode', line_ids: lineIds, correcting_journal_id: result.body.id },
      }).catch(() => {});
      return res.status(201).json({ ok: true, correcting_journal_id: result.body.id, line_count: lineIds.length });
    } catch (e) {
      console.error('POST /ledger/recode:', e.message);
      return res.status(500).json({ error: 'Could not recode ledger lines' });
    }
  });
}

module.exports = { registerOrganizationalLedgerRoutes };
