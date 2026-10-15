'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireWriteAccess } = require('../middleware/requireWriteAccess');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');

const CODE_MAX = 64;
const NAME_MAX = 500;

const NP_ACCOUNT_TYPES = new Set(['income', 'expense', 'asset', 'liability', 'equity']);

const BUDGET_SCOPE_ROOT_CODES = `('_H1_REV', '_H1_INC', '_H1_EXP')`;

function rowToAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code,
    name: row.name,
    type: row.type,
    xero_account_id: row.xero_account_id || null,
    parent_id: row.parent_id != null ? Number(row.parent_id) : null,
    rollup_parent_id: row.rollup_parent_id != null ? Number(row.rollup_parent_id) : null,
    is_posting: row.is_posting != null ? !!row.is_posting : true,
    level: row.level != null ? Number(row.level) : 3,
    standard_category: row.standard_category != null ? String(row.standard_category) : null,
    budget_source: row.budget_source || 'schedule',
    is_cash_account: !!row.is_cash_account,
    is_system_clearing_account: !!row.is_system_clearing_account,
    is_system_ap_account: !!row.is_system_ap_account,
    is_system_ar_account: !!row.is_system_ar_account,
    is_system_contribution_revenue_account: !!row.is_system_contribution_revenue_account,
    is_non_cash: !!row.is_non_cash,
    is_mtdc_excluded: !!row.is_mtdc_excluded,
    is_system_unallocated_receipts_account: !!row.is_system_unallocated_receipts_account,
    description: row.description || null,
    archived: row.archived_at != null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalAccountRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/accounts', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const budgetScope =
      req.query.budget_scope === '1' ||
      req.query.budget_scope === 'true' ||
      String(req.query.budget_scope || '').toLowerCase() === 'yes';

    const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
    try {
      let sql;
      let params;
      if (budgetScope) {
        sql = `
          WITH RECURSIVE roots AS (
            SELECT id FROM org_accounts
            WHERE org_id = $1 AND code IN ${BUDGET_SCOPE_ROOT_CODES}
          ),
          tr AS (
            SELECT id FROM roots
            UNION ALL
            SELECT a.id FROM org_accounts a
            INNER JOIN tr ON a.parent_id = tr.id
            WHERE a.org_id = $1
          )
          SELECT a.id, a.org_id, a.code, a.name, a.type::text AS type, a.xero_account_id,
                 a.parent_id, a.rollup_parent_id, a.is_posting, a.level,
                 a.standard_category, a.budget_source, a.is_cash_account, a.is_system_clearing_account,
                 a.is_system_ap_account, a.is_system_ar_account, a.is_system_contribution_revenue_account,
                 a.is_non_cash, a.is_mtdc_excluded, a.is_system_unallocated_receipts_account,
                 a.description, a.archived_at, a.created_at, a.updated_at
          FROM org_accounts a
          WHERE a.org_id = $1 AND (a.archived_at IS NULL OR $2::boolean)
            AND (
              (EXISTS (SELECT 1 FROM roots) AND a.id IN (SELECT id FROM tr))
              OR (NOT EXISTS (SELECT 1 FROM roots) AND a.type IN ('income'::org_account_type, 'expense'::org_account_type))
            )
          ORDER BY lower(a.code) ASC, a.id ASC`;
        params = [orgId, includeArchived];
      } else {
        sql = `
          SELECT id, org_id, code, name, type::text AS type, xero_account_id,
                 parent_id, rollup_parent_id, is_posting, level,
                 standard_category, budget_source, is_cash_account, is_system_clearing_account,
                 is_system_ap_account, is_system_ar_account, is_system_contribution_revenue_account,
                 is_non_cash, is_mtdc_excluded, is_system_unallocated_receipts_account,
                 description, archived_at, created_at, updated_at
          FROM org_accounts
          WHERE org_id = $1 AND (archived_at IS NULL OR $2::boolean)
          ORDER BY lower(code) ASC, id ASC`;
        params = [orgId, includeArchived];
      }

      const r = await pool.query(sql, params);
      const d = (await pool.query('SELECT default_pledge_receivable_account_id, default_bank_account_id, default_individual_gift_account_id, invoice_number_prefix, invoice_next_number, bill_number_prefix, bill_next_number, default_invoice_terms_days, default_bill_terms_days, mileage_rate_cents_per_mile FROM org_settings WHERE org_id = $1', [orgId])).rows[0];
      return res.json({
        accounts: r.rows.map(rowToAccount),
        defaults: {
          pledge_receivable_account_id: d && d.default_pledge_receivable_account_id != null ? Number(d.default_pledge_receivable_account_id) : null,
          bank_account_id: d && d.default_bank_account_id != null ? Number(d.default_bank_account_id) : null,
          individual_gift_account_id: d && d.default_individual_gift_account_id != null ? Number(d.default_individual_gift_account_id) : null,
        },
        numbering: d ? {
          invoice_number_prefix: d.invoice_number_prefix, invoice_next_number: d.invoice_next_number,
          bill_number_prefix: d.bill_number_prefix, bill_next_number: d.bill_next_number,
          default_invoice_terms_days: d.default_invoice_terms_days, default_bill_terms_days: d.default_bill_terms_days,
          mileage_rate_cents_per_mile: d.mileage_rate_cents_per_mile == null ? null : Number(d.mileage_rate_cents_per_mile),
        } : null,
      });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/accounts:', e.message);
      return res.status(500).json({ error: 'Could not load accounts' });
    }
  });

  app.put('/api/organizational/orgs/:slug/display-settings', ...orgAuth, requireWriteAccess('structure'), async (req, res) => {
    const want = req.body && req.body.show_number_colors;
    if (typeof want !== 'boolean') return res.status(400).json({ error: 'show_number_colors must be true or false' });
    try {
      const before = (await pool.query('SELECT show_number_colors FROM org_settings WHERE org_id = $1', [req.orgId])).rows[0];
      if (!before) return res.status(404).json({ error: 'Settings not found' });
      await pool.query('UPDATE org_settings SET show_number_colors = $2, updated_at = NOW() WHERE org_id = $1', [req.orgId, want]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_settings', recordId: req.orgId,
        fields: diffFields({ show_number_colors: before.show_number_colors }, { show_number_colors: want }, ['show_number_colors']),
        metadata: reqMeta(req),
      });
      return res.json({ show_number_colors: want });
    } catch (e) {
      console.error('PUT /display-settings:', e.message);
      return res.status(500).json({ error: 'Could not save this setting' });
    }
  });

  app.put('/api/organizational/orgs/:slug/document-numbering', ...orgAuth, requireWriteAccess('structure'), async (req, res) => {
    const body = req.body || {};
    const sets = [];
    const vals = [];
    const cols = [];
    const add = (col, v) => { cols.push(col); vals.push(v); sets.push(col + ' = $' + (vals.length + 1)); };
    for (const col of ['invoice_number_prefix', 'bill_number_prefix']) {
      if (!(col in body)) continue;
      const v = String(body[col] == null ? '' : body[col]).trim();
      if (v.length > 12 || /[^A-Za-z0-9._\-\/ ]/.test(v)) return res.status(400).json({ error: 'A prefix is up to 12 letters, numbers or - . / characters.' });
      add(col, v);
    }
    for (const col of ['invoice_next_number', 'bill_next_number']) {
      if (!(col in body)) continue;
      const n = Number(body[col]);
      if (!Number.isInteger(n) || n < 1 || n > 99999999) return res.status(400).json({ error: 'The next number must be a whole number, 1 or more.' });
      add(col, n);
    }
    for (const col of ['default_invoice_terms_days', 'default_bill_terms_days']) {
      if (!(col in body)) continue;
      const raw = body[col];
      const n = raw === null || raw === '' ? null : Number(raw);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > 365)) return res.status(400).json({ error: 'Payment terms are a whole number of days, 0 to 365.' });
      add(col, n);
    }
    if ('mileage_rate_cents_per_mile' in body) {
      const raw = body.mileage_rate_cents_per_mile;
      const n = raw === null || raw === '' ? null : Number(raw);
      if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 9999)) return res.status(400).json({ error: 'The mileage rate is cents per mile, more than 0 and up to 9999.' });
      add('mileage_rate_cents_per_mile', n);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to save' });
    try {
      const before = (await pool.query('SELECT ' + cols.join(', ') + ' FROM org_settings WHERE org_id = $1', [req.orgId])).rows[0];
      if (!before) return res.status(404).json({ error: 'Settings not found' });
      await pool.query('UPDATE org_settings SET ' + sets.join(', ') + ', updated_at = NOW() WHERE org_id = $1', [req.orgId, ...vals]);
      const after = {};
      cols.forEach((c, i) => { after[c] = vals[i]; });
      await logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_settings', recordId: req.orgId,
        fields: diffFields(before, after, cols), metadata: reqMeta(req) });
      return res.json(after);
    } catch (e) {
      console.error('PUT /document-numbering:', e.message);
      return res.status(500).json({ error: 'Could not save this setting' });
    }
  });

  app.put('/api/organizational/orgs/:slug/account-defaults', ...orgAuth, requireWriteAccess('structure'), async (req, res) => {
    const body = req.body || {};
    const FIELDS = [
      { key: 'pledge_receivable_account_id', col: 'default_pledge_receivable_account_id', cash: false, type: 'asset', msg: 'Choose an asset account that accepts postings' },
      { key: 'bank_account_id', col: 'default_bank_account_id', cash: true, type: 'asset', msg: 'Choose a bank account from the list' },
      { key: 'individual_gift_account_id', col: 'default_individual_gift_account_id', cash: false, type: 'income', msg: 'Choose an income account that accepts postings' },
    ];
    const changes = [];
    for (const f of FIELDS) {
      if (!(f.key in body)) continue;
      const raw = body[f.key];
      const want = raw === null || raw === '' ? null : Number(raw);
      if (want !== null && !Number.isInteger(want)) return res.status(400).json({ error: 'Choose an account from the list' });
      changes.push({ ...f, want });
    }
    if (!changes.length) return res.status(400).json({ error: 'Nothing to save' });
    try {
      for (const c of changes) {
        if (c.want === null) continue;
        const a = await pool.query(
          `SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND type = '${c.type}' AND is_posting AND archived_at IS NULL` + (c.cash ? ' AND is_cash_account' : ''),
          [c.want, req.orgId]);
        if (!a.rows.length) return res.status(400).json({ error: c.msg });
      }
      const cols = changes.map((c) => c.col);
      const before = (await pool.query('SELECT ' + cols.join(', ') + ' FROM org_settings WHERE org_id = $1', [req.orgId])).rows[0];
      if (!before) return res.status(404).json({ error: 'Settings not found' });
      const after = {};
      changes.forEach((c) => { after[c.col] = c.want; });
      await pool.query('UPDATE org_settings SET ' + cols.map((c, i) => c + ' = $' + (i + 2)).join(', ') + ', updated_at = NOW() WHERE org_id = $1',
        [req.orgId, ...changes.map((c) => c.want)]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_settings', recordId: req.orgId,
        fields: diffFields(before, after, cols),
        metadata: reqMeta(req),
      });
      const out = {};
      changes.forEach((c) => { out[c.key] = c.want; });
      return res.json(out);
    } catch (e) {
      console.error('PUT /account-defaults:', e.message);
      return res.status(500).json({ error: 'Could not save this setting' });
    }
  });

  app.post('/api/organizational/orgs/:slug/accounts', ...orgAuth, requireWriteAccess('structure'), async (req, res) => {
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const code = String(body.code ?? '').trim();
    const name = String(body.name ?? '').trim();
    const type = String(body.type ?? '').trim().toLowerCase();
    let standardCategory = null;
    if (body.standard_category !== undefined && body.standard_category !== null && String(body.standard_category).trim() !== '') {
      standardCategory = String(body.standard_category).trim();
      if (standardCategory.length > 32) {
        return res.status(400).json({ error: 'standard_category is too long' });
      }
    }

    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!NP_ACCOUNT_TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be income, expense, asset, liability, or equity' });
    }
    if (code.length > CODE_MAX) {
      return res.status(400).json({ error: `code must be at most ${CODE_MAX} characters` });
    }
    if (name.length > NAME_MAX) {
      return res.status(400).json({ error: `name must be at most ${NAME_MAX} characters` });
    }
    const isCashAccount = !!body.is_cash_account;
    if (isCashAccount && type !== 'asset') {
      return res.status(400).json({ error: 'is_cash_account can only be set on an asset account' });
    }

    try {
      const ins = await pool.query(
        `INSERT INTO org_accounts (org_id, code, name, type, standard_category, is_cash_account, description)
         VALUES ($1, $2, $3, $4::org_account_type, $5, $6, $7)
         RETURNING id, org_id, code, name, type::text AS type, xero_account_id,
                   parent_id, rollup_parent_id, is_posting, level,
                   standard_category, is_cash_account, description, archived_at, created_at, updated_at`,
        [orgId, code, name, type, standardCategory, isCashAccount, body.description ? String(body.description).trim().slice(0, 500) || null : null]
      );
      return res.status(201).json({ account: rowToAccount(ins.rows[0]) });
    } catch (e) {
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'An account with that code already exists' });
      }
      console.error('POST /api/organizational/orgs/:slug/accounts:', e.message);
      return res.status(500).json({ error: 'Could not create account' });
    }
  });

  app.get('/api/organizational/orgs/:slug/structure/accounts', ...orgAuth, async (req, res) => {
    try {
      const fyEndMonth = (await pool.query('SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1', [req.orgId])).rows[0]?.fiscal_year_end_month || 12;
      const now = new Date();
      const startYear = (now.getUTCMonth() + 1) > fyEndMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const fyStart = fyEndMonth === 12 ? `${now.getUTCFullYear()}-01-01` : `${startYear}-${String(fyEndMonth + 1).padStart(2, '0')}-01`;
      const r = await pool.query(
        `SELECT a.id, a.code, a.name, a.type::text AS type, a.description, a.archived_at, a.level, a.is_posting, a.parent_id, a.standard_category,
                a.is_cash_account, a.is_system_clearing_account, a.is_system_ap_account, a.is_system_ar_account, a.is_system_contribution_revenue_account,
                a.is_system_expense_claims_payable_account, a.is_system_unallocated_receipts_account, a.is_non_cash, a.is_statistical,
                COALESCE(u.n, 0) AS posted_lines, COALESCE(u.balance, 0) AS balance_cents, COALESCE(y.ytd, 0) AS ytd_cents,
                EXISTS (SELECT 1 FROM org_budget_lines b WHERE b.account_id = a.id) AS in_budget
           FROM org_accounts a
           LEFT JOIN (SELECT l.account_id, COUNT(*) AS n, SUM(l.debit_cents - l.credit_cents) AS balance
                        FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
                       WHERE t.org_id = $1 AND t.status = 'posted' GROUP BY l.account_id) u ON u.account_id = a.id
           LEFT JOIN (SELECT l.account_id, SUM(l.debit_cents - l.credit_cents) AS ytd
                        FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
                       WHERE t.org_id = $1 AND t.status = 'posted' AND t.transaction_date >= $2 GROUP BY l.account_id) y ON y.account_id = a.id
          WHERE a.org_id = $1
          ORDER BY lower(a.code), a.id`, [req.orgId, fyStart]);
      const systemRole = (x) => x.is_cash_account ? 'Bank and cash' : x.is_system_ap_account ? 'Accounts payable (bills)' : x.is_system_ar_account ? 'Accounts receivable (invoices)'
        : x.is_system_clearing_account ? 'Clearing' : x.is_system_contribution_revenue_account ? 'Contribution revenue (gifts)'
        : x.is_system_expense_claims_payable_account ? 'Expense claims payable' : x.is_system_unallocated_receipts_account ? 'Unallocated receipts' : null;
      return res.json({
        fiscal_year_start: fyStart,
        accounts: r.rows.map((x) => ({
          id: x.id, code: x.code, name: x.name, type: x.type, description: x.description || '', archived: x.archived_at != null, level: x.level,
          is_posting: x.is_posting, parent_id: x.parent_id, category: x.standard_category,
          system_role: systemRole(x), is_fixed_asset: x.standard_category === 'ASSET_FIXED', is_statistical: !!x.is_statistical,
          posted_lines: Number(x.posted_lines), balance_cents: String(x.balance_cents), ytd_cents: String(x.ytd_cents), in_budget: !!x.in_budget,
        })),
      });
    } catch (e) {
      console.error('GET /structure/accounts:', e.message);
      return res.status(500).json({ error: 'Could not load the chart of accounts' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/accounts/:id', ...orgAuth, requireWriteAccess('structure'), async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid account id' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sets = [], params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (body.name !== undefined) { const n = String(body.name).trim(); if (!n || n.length > NAME_MAX) return res.status(400).json({ error: 'name is required' }); add('name', n); }
    if (body.code !== undefined) { const c = String(body.code).trim(); if (!c || c.length > CODE_MAX) return res.status(400).json({ error: 'code is required' }); add('code', c); }
    if (body.description !== undefined) add('description', String(body.description || '').trim().slice(0, 500) || null);
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
    try {
      const before = await pool.query('SELECT code, name, description FROM org_accounts WHERE id = $1 AND org_id = $2', [id, req.orgId]);
      if (!before.rows.length) return res.status(404).json({ error: 'Account not found' });
      params.push(id, req.orgId);
      await pool.query(`UPDATE org_accounts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length - 1} AND org_id = $${params.length}`, params);
      const after = await pool.query('SELECT code, name, description FROM org_accounts WHERE id = $1', [id]);
      await logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_accounts', recordId: id,
        fields: diffFields(before.rows[0], after.rows[0], ['code', 'name', 'description']), metadata: reqMeta(req) });
      return res.json({ id, updated: true });
    } catch (e) {
      if (e && e.code === '23505') return res.status(409).json({ error: 'An account with that code already exists' });
      console.error('PATCH /accounts/:id:', e.message);
      return res.status(500).json({ error: 'Could not update the account' });
    }
  });

  const archiveHandler = (archive) => async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid account id' });
    try {
      const a = (await pool.query('SELECT * FROM org_accounts WHERE id = $1 AND org_id = $2', [id, req.orgId])).rows[0];
      if (!a) return res.status(404).json({ error: 'Account not found' });
      if (archive) {
        if (a.is_cash_account || a.is_system_clearing_account || a.is_system_ap_account || a.is_system_ar_account || a.is_system_contribution_revenue_account
            || a.is_system_expense_claims_payable_account || a.is_system_unallocated_receipts_account) {
          return res.status(409).json({ error: 'The system uses this account, so it cannot be archived.', code: 'system_account' });
        }
        const bal = await pool.query(`SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS b FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id WHERE t.org_id = $1 AND t.status = 'posted' AND l.account_id = $2`, [req.orgId, id]);
        if (BigInt(bal.rows[0].b) !== 0n) return res.status(409).json({ error: 'This account still has a balance. Move it to another account first.', code: 'has_balance' });
        const open = await pool.query(
          `SELECT (SELECT COUNT(*) FROM org_bill_lines bl JOIN org_bills b ON b.id = bl.bill_id WHERE b.org_id = $1 AND bl.account_id = $2 AND b.status IN ('draft','pending_approval','approved','scheduled','partially_paid'))
                + (SELECT COUNT(*) FROM org_invoice_lines il JOIN org_invoices i ON i.id = il.invoice_id WHERE i.org_id = $1 AND il.account_id = $2 AND i.status IN ('draft','sent','overdue','partially_paid'))
                + (SELECT COUNT(*) FROM org_expense_claim_lines cl JOIN org_expense_claims c ON c.id = cl.claim_id WHERE c.org_id = $1 AND cl.account_id = $2 AND c.status IN ('draft','pending_approval','approved'))::bigint AS n`, [req.orgId, id]);
        if (Number(open.rows[0].n) > 0) return res.status(409).json({ error: 'A draft or open bill, invoice or expense claim still uses this account.', code: 'in_use' });
      }
      await pool.query('UPDATE org_accounts SET archived_at = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3', [archive ? new Date() : null, id, req.orgId]);
      await logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_accounts', recordId: id,
        fields: [{ fieldName: 'archived', oldValue: archive ? 'no' : 'yes', newValue: archive ? 'yes' : 'no' }], metadata: reqMeta(req) });
      return res.json({ id, archived: archive });
    } catch (e) {
      console.error('archive account:', e.message);
      return res.status(500).json({ error: 'Could not change the account' });
    }
  };
  app.post('/api/organizational/orgs/:slug/accounts/:id/archive', ...orgAuth, requireWriteAccess('structure'), archiveHandler(true));
  app.post('/api/organizational/orgs/:slug/accounts/:id/unarchive', ...orgAuth, requireWriteAccess('structure'), archiveHandler(false));
}

module.exports = { registerOrganizationalAccountRoutes };
