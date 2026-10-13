'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { logAudit } = require('../lib/auditLog');
const { computePeriod } = require('../lib/bankPeriods');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseAmountToCents(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

function registerBankPeriodRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const reader = requireAccountingAccess(pool, 'accounting_read');
  const writer = requireAccountingWriter(pool);
  const base = '/api/organizational/orgs/:slug/bank-accounts/:accountId/periods';

  async function loadAccount(req, res) {
    const accountId = Number.parseInt(String(req.params.accountId), 10);
    if (!Number.isInteger(accountId) || accountId < 1) { res.status(400).json({ error: 'invalid account id' }); return null; }
    const r = await pool.query(
      `SELECT id, code, name, type::text AS type FROM org_accounts WHERE id = $1 AND org_id = $2 AND is_cash_account IS TRUE`, [accountId, req.orgId]);
    if (!r.rows.length) { res.status(404).json({ error: 'Bank account not found' }); return null; }
    if (r.rows[0].type === 'liability') { res.status(400).json({ error: 'Reconcile Month is for bank accounts. Credit cards are not supported yet.' }); return null; }
    return r.rows[0];
  }
  async function loadPeriod(req, res, acct) {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'invalid period id' }); return null; }
    const r = await pool.query(`SELECT * FROM org_bank_reconciliation_periods WHERE id = $1 AND org_id = $2 AND bank_account_id = $3`, [id, req.orgId, acct.id]);
    if (!r.rows.length) { res.status(404).json({ error: 'Period not found' }); return null; }
    return r.rows[0];
  }
  const brief = (p) => ({
    id: p.id, period_start: String(p.period_start).slice(0, 10), period_end: String(p.period_end).slice(0, 10),
    opening_cents: String(p.opening_balance_cents), closing_cents: String(p.closing_balance_cents), status: p.status,
    closed_at: p.closed_at, reopened_at: p.reopened_at, reopen_reason: p.reopen_reason,
  });
  const lastClosed = async (orgId, accountId) => (await pool.query(
    `SELECT * FROM org_bank_reconciliation_periods WHERE org_id = $1 AND bank_account_id = $2 AND status = 'closed' ORDER BY period_end DESC LIMIT 1`, [orgId, accountId])).rows[0] || null;

  app.get(base, ...orgAuth, reader, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const r = await pool.query(`SELECT * FROM org_bank_reconciliation_periods WHERE org_id = $1 AND bank_account_id = $2 ORDER BY period_end DESC`, [req.orgId, acct.id]);
      const last = await lastClosed(req.orgId, acct.id);
      let next = null;
      if (!r.rows.some((p) => p.status === 'draft')) {
        let startDate;
        if (last) { const d = new Date(String(last.period_end).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); startDate = d.toISOString().slice(0, 10); }
        else {
          const f = await pool.query(`SELECT MIN(statement_date) AS d FROM org_bank_statement_lines WHERE org_id = $1 AND bank_account_id = $2`, [req.orgId, acct.id]);
          startDate = f.rows[0].d ? String(f.rows[0].d).slice(0, 8) + '01' : new Date().toISOString().slice(0, 8) + '01';
        }
        const [y, m] = startDate.split('-').map(Number);
        const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        next = { period_start: startDate, period_end: endDate, opening_cents: last ? String(last.closing_balance_cents) : null, opening_locked: !!last };
      }
      return res.json({ account: acct, periods: r.rows.map(brief), latest_closed_id: last ? last.id : null, next });
    } catch (e) { console.error('GET periods:', e.message); return res.status(500).json({ error: 'Could not load periods' }); }
  });

  app.post(base, ...orgAuth, writer, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const b = req.body || {};
      if (!DATE_RE.test(String(b.period_start)) || !DATE_RE.test(String(b.period_end))) return res.status(400).json({ error: 'period_start and period_end must be YYYY-MM-DD' });
      if (b.period_start > b.period_end) return res.status(400).json({ error: 'The period cannot end before it starts.' });
      const closing = parseAmountToCents(b.closing_balance);
      if (closing == null) return res.status(400).json({ error: 'Enter the statement closing balance.' });
      const last = await lastClosed(req.orgId, acct.id);
      let opening;
      if (last) {
        if (b.period_start <= String(last.period_end).slice(0, 10)) return res.status(409).json({ error: 'This period starts before the last closed period ends (' + String(last.period_end).slice(0, 10) + ').' });
        opening = BigInt(last.closing_balance_cents);
      } else {
        const o = parseAmountToCents(b.opening_balance);
        if (o == null) return res.status(400).json({ error: 'Enter the statement opening balance.' });
        opening = BigInt(o);
      }
      const drafts = await pool.query(`SELECT 1 FROM org_bank_reconciliation_periods WHERE org_id = $1 AND bank_account_id = $2 AND status = 'draft'`, [req.orgId, acct.id]);
      if (drafts.rows.length) return res.status(409).json({ error: 'Finish or discard the draft period first.' });
      const ins = await pool.query(
        `INSERT INTO org_bank_reconciliation_periods (org_id, bank_account_id, period_start, period_end, opening_balance_cents, closing_balance_cents, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.orgId, acct.id, b.period_start, b.period_end, String(opening), closing, req.user.user_id ?? req.user.id]
      );
      return res.status(201).json({ id: ins.rows[0].id });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A period ending that day already exists.' });
      console.error('POST periods:', e.message); return res.status(500).json({ error: 'Could not create the period' });
    }
  });

  app.get(base + '/:id', ...orgAuth, reader, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const p = await loadPeriod(req, res, acct); if (!p) return;
      const last = await lastClosed(req.orgId, acct.id);
      const body = { account: acct, period: brief(p), can_reopen: p.status === 'closed' && !!last && last.id === p.id };
      body.report = p.status === 'closed' && p.report_snapshot ? p.report_snapshot : await computePeriod(pool, req.orgId, p);
      return res.json(body);
    } catch (e) { console.error('GET period:', e.message); return res.status(500).json({ error: 'Could not load the period' }); }
  });

  app.patch(base + '/:id', ...orgAuth, writer, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const p = await loadPeriod(req, res, acct); if (!p) return;
      if (p.status !== 'draft') return res.status(409).json({ error: 'A closed period cannot be edited. Reopen it first.' });
      const b = req.body || {};
      let start = String(p.period_start).slice(0, 10), end = String(p.period_end).slice(0, 10);
      if (b.period_start != null) { if (!DATE_RE.test(String(b.period_start))) return res.status(400).json({ error: 'period_start must be YYYY-MM-DD' }); start = String(b.period_start); }
      if (b.period_end != null) { if (!DATE_RE.test(String(b.period_end))) return res.status(400).json({ error: 'period_end must be YYYY-MM-DD' }); end = String(b.period_end); }
      if (start > end) return res.status(400).json({ error: 'The period cannot end before it starts.' });
      const last = await lastClosed(req.orgId, acct.id);
      if (last && start <= String(last.period_end).slice(0, 10)) return res.status(409).json({ error: 'This period starts before the last closed period ends.' });
      let closing = BigInt(p.closing_balance_cents), opening = BigInt(p.opening_balance_cents);
      if (b.closing_balance != null) { const c = parseAmountToCents(b.closing_balance); if (c == null) return res.status(400).json({ error: 'Closing balance must be an amount.' }); closing = BigInt(c); }
      if (b.opening_balance != null && !last) { const o = parseAmountToCents(b.opening_balance); if (o == null) return res.status(400).json({ error: 'Opening balance must be an amount.' }); opening = BigInt(o); }
      await pool.query(
        `UPDATE org_bank_reconciliation_periods SET period_start = $1, period_end = $2, opening_balance_cents = $3, closing_balance_cents = $4, updated_at = now()
          WHERE id = $5 AND org_id = $6`, [start, end, String(opening), String(closing), p.id, req.orgId]);
      return res.json({ id: p.id });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A period ending that day already exists.' });
      console.error('PATCH period:', e.message); return res.status(500).json({ error: 'Could not save the period' });
    }
  });

  app.delete(base + '/:id', ...orgAuth, writer, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const p = await loadPeriod(req, res, acct); if (!p) return;
      if (p.status !== 'draft') return res.status(409).json({ error: 'Only a draft can be discarded.' });
      await pool.query(`DELETE FROM org_bank_reconciliation_periods WHERE id = $1 AND org_id = $2`, [p.id, req.orgId]);
      return res.json({ id: p.id });
    } catch (e) { console.error('DELETE period:', e.message); return res.status(500).json({ error: 'Could not discard the period' }); }
  });

  app.post(base + '/:id/close', ...orgAuth, writer, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const p = await loadPeriod(req, res, acct); if (!p) return;
      if (p.status !== 'draft') return res.status(409).json({ error: 'This period is already closed.' });
      const userId = req.user.user_id ?? req.user.id;
      const rep = await computePeriod(pool, req.orgId, p);
      if (rep.difference_cents !== '0') return res.status(409).json({ error: 'The balances do not agree yet. The difference must be 0.00 to close the period.', code: 'difference' });
      if (rep.waiting_lines > 0) return res.status(409).json({ error: rep.waiting_lines + ' bank line' + (rep.waiting_lines === 1 ? '' : 's') + ' in this period still need matching or coding in Reconcile.', code: 'waiting_lines' });
      const u = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
      const snapshot = { ...rep, account: { id: acct.id, code: acct.code, name: acct.name }, closed_by: u.rows[0] ? u.rows[0].email : null, closed_on: new Date().toISOString() };
      await pool.query(
        `UPDATE org_bank_reconciliation_periods SET status = 'closed', closed_at = now(), closed_by = $1, report_snapshot = $2::jsonb, updated_at = now()
          WHERE id = $3 AND org_id = $4`, [userId, JSON.stringify(snapshot), p.id, req.orgId]);
      logAudit(pool, { orgId: req.orgId, userId, action: 'update', tableName: 'org_bank_reconciliation_periods', recordId: p.id,
        fields: [{ fieldName: 'status', oldValue: 'draft', newValue: 'closed' }], metadata: { account_id: acct.id, period_end: rep.period_end } }).catch(() => {});
      return res.json({ id: p.id, status: 'closed' });
    } catch (e) { console.error('POST period close:', e.message); return res.status(500).json({ error: 'Could not close the period' }); }
  });

  app.post(base + '/:id/reopen', ...orgAuth, writer, async (req, res) => {
    try {
      const acct = await loadAccount(req, res); if (!acct) return;
      const p = await loadPeriod(req, res, acct); if (!p) return;
      const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required.' });
      if (p.status !== 'closed') return res.status(409).json({ error: 'This period is not closed.' });
      const last = await lastClosed(req.orgId, acct.id);
      if (!last || last.id !== p.id) return res.status(409).json({ error: 'Only the latest closed period can be reopened. Reopen the later ones first.', code: 'not_latest' });
      const drafts = await pool.query(`SELECT 1 FROM org_bank_reconciliation_periods WHERE org_id = $1 AND bank_account_id = $2 AND status = 'draft'`, [req.orgId, acct.id]);
      if (drafts.rows.length) return res.status(409).json({ error: 'Finish or discard the draft period first.' });
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `UPDATE org_bank_reconciliation_periods SET status = 'draft', closed_at = NULL, closed_by = NULL, report_snapshot = NULL,
                reopened_at = now(), reopened_by = $1, reopen_reason = $2, updated_at = now() WHERE id = $3 AND org_id = $4`,
        [userId, reason, p.id, req.orgId]);
      logAudit(pool, { orgId: req.orgId, userId, action: 'update', tableName: 'org_bank_reconciliation_periods', recordId: p.id,
        fields: [{ fieldName: 'status', oldValue: 'closed', newValue: 'draft' }], metadata: { reason, account_id: acct.id } }).catch(() => {});
      return res.json({ id: p.id, status: 'draft' });
    } catch (e) { console.error('POST period reopen:', e.message); return res.status(500).json({ error: 'Could not reopen the period' }); }
  });
}

module.exports = { registerBankPeriodRoutes };
