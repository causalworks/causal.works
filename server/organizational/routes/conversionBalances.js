'use strict';

// Conversion balances: what the organization owned and owed when its books start here, kept as one ledger entry that is locked once entered.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { runTool, ctxFromReq } = require('../tools');
const { loadAccounts, currentRow, BALANCING_MEMO } = require('../lib/conversionBalances');
const { logAudit, reqMeta } = require('../lib/auditLog');


function registerConversionBalancesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);
  const base = '/api/organizational/orgs/:slug/conversion-balances';

  app.get(base, ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    try {
      const row = await currentRow(pool, orgId);
      const accounts = await loadAccounts(pool, orgId);
      const programs = (await pool.query('SELECT id, name FROM org_programs WHERE org_id = $1 ORDER BY name', [orgId])).rows;
      let lines = {};
      let balancing = null;
      let earlierEntries = 0;
      if (row && row.ledger_transaction_id) {
        const l = await pool.query(
          `SELECT account_id, debit_cents, credit_cents, line_memo FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [row.ledger_transaction_id]);
        l.rows.forEach((x) => {
          if (x.line_memo === BALANCING_MEMO) balancing = { account_id: x.account_id, debit_cents: String(x.debit_cents), credit_cents: String(x.credit_cents) };
          else lines[x.account_id] = { debit_cents: String(x.debit_cents), credit_cents: String(x.credit_cents) };
        });
        const e = await pool.query(
          `SELECT count(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND status <> 'voided' AND source <> 'conversion_balance' AND transaction_date <= $2`,
          [orgId, row.conversion_date]);
        earlierEntries = e.rows[0].n;
      }
      return res.json({
        conversion: row ? {
          conversion_date: String(row.conversion_date).slice(0, 10), status: row.status, program_id: row.program_id,
          balancing_account_id: row.balancing_account_id, ledger_transaction_id: row.ledger_transaction_id, locked_at: row.locked_at,
        } : null,
        accounts, programs, lines, balancing, earlier_entries: earlierEntries,
      });
    } catch (e) {
      console.error('GET conversion-balances:', e.message);
      return res.status(500).json({ error: 'Could not load conversion balances' });
    }
  });

  app.put(base, ...orgAuth, financeWriter, async (req, res) => {
    try {
      const result = await runTool('conversion_balances.save', ctxFromReq(pool, req), req.body || {});
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('PUT conversion-balances:', e.message);
      return res.status(500).json({ error: 'Could not save the conversion balances' });
    }
  });

  app.post(base + '/lock', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const row = await currentRow(pool, orgId);
      if (!row || !row.ledger_transaction_id) return res.status(409).json({ error: 'Enter and save the balances first.' });
      if (row.status === 'locked') return res.json({ status: 'locked' });
      await pool.query(`UPDATE org_conversion_balances SET status = 'locked', locked_by = $2, locked_at = NOW(), updated_at = NOW() WHERE org_id = $1`, [orgId, userId]);
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_conversion_balances', recordId: orgId,
        fields: [{ fieldName: 'status', oldValue: 'open', newValue: 'locked' }], metadata: reqMeta(req) }).catch(() => {});
      return res.json({ status: 'locked' });
    } catch (e) {
      console.error('POST conversion-balances/lock:', e.message);
      return res.status(500).json({ error: 'Could not lock the conversion balances' });
    }
  });

  app.post(base + '/unlock', ...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES]), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const reason = String((req.body && req.body.reason) || '').trim();
    if (reason.length < 10) return res.status(400).json({ error: 'Give a reason of at least 10 characters.' });
    try {
      const row = await currentRow(pool, orgId);
      if (!row || row.status !== 'locked') return res.status(409).json({ error: 'The conversion balances are not locked.' });
      await pool.query(`UPDATE org_conversion_balances SET status = 'open', locked_by = NULL, locked_at = NULL, updated_at = NOW() WHERE org_id = $1`, [orgId]);
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_conversion_balances', recordId: orgId,
        fields: [{ fieldName: 'status', oldValue: 'locked', newValue: 'open' }], metadata: { ...reqMeta(req), reason } }).catch(() => {});
      return res.json({ status: 'open' });
    } catch (e) {
      console.error('POST conversion-balances/unlock:', e.message);
      return res.status(500).json({ error: 'Could not unlock the conversion balances' });
    }
  });
}

module.exports = { registerConversionBalancesRoutes };
