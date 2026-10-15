'use strict';

// Conversion balances: what the organization owned and owed when its books start here, kept as one ledger entry that is locked once entered.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { postLedgerTransaction, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { logAudit, reqMeta } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BALANCING_MEMO = 'Balancing amount';

function registerConversionBalancesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);
  const base = '/api/organizational/orgs/:slug/conversion-balances';

  function excludedReason(a) {
    if (a.is_system_ar_account) return 'Enter outstanding invoices dated before the conversion date.';
    if (a.is_system_ap_account) return 'Enter unpaid bills dated before the conversion date.';
    if (a.is_system_expense_claims_payable_account) return 'Comes from expense claims.';
    if (a.is_system_unallocated_receipts_account || a.is_system_clearing_account) return 'Used by Accounting to hold items in transit.';
    return null;
  }

  async function loadAccounts(orgId) {
    const r = await pool.query(
      `SELECT id, code, name, type::text AS type, standard_category, is_cash_account, is_system_ar_account, is_system_ap_account, is_system_clearing_account,
              is_system_expense_claims_payable_account, is_system_unallocated_receipts_account
         FROM org_accounts
        WHERE org_id = $1 AND is_posting AND NOT is_statistical AND type IN ('asset', 'liability', 'equity') AND archived_at IS NULL
        ORDER BY type, code NULLS LAST, name`, [orgId]);
    return r.rows.map((a) => ({ ...a, excluded_reason: excludedReason(a) }));
  }

  async function currentRow(orgId) {
    return (await pool.query('SELECT * FROM org_conversion_balances WHERE org_id = $1', [orgId])).rows[0] || null;
  }

  app.get(base, ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    try {
      const row = await currentRow(orgId);
      const accounts = await loadAccounts(orgId);
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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const date = String(body.conversion_date || '');
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Pick the conversion date.' });
    const programId = Number.parseInt(String(body.program_id), 10);
    if (!Number.isInteger(programId)) return res.status(400).json({ error: 'Pick a program for these lines.' });
    const src = Array.isArray(body.lines) ? body.lines : [];
    try {
      const row = await currentRow(orgId);
      if (row && row.status === 'locked') return res.status(409).json({ error: 'The conversion balances are locked. Unlock them to make changes.', code: 'locked' });
      const prog = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2', [programId, orgId]);
      if (!prog.rows.length) return res.status(400).json({ error: 'That program was not found.' });
      const accounts = new Map((await loadAccounts(orgId)).map((a) => [a.id, a]));
      const lines = [];
      let debits = 0; let credits = 0;
      for (let i = 0; i < src.length; i++) {
        const l = src[i] || {};
        const accountId = Number.parseInt(String(l.account_id), 10);
        const debit = Number.parseInt(String(l.debit_cents || 0), 10);
        const credit = Number.parseInt(String(l.credit_cents || 0), 10);
        if (!debit && !credit) continue;
        const a = accounts.get(accountId);
        if (!a) return res.status(400).json({ error: `Line ${i + 1}: that account cannot hold a conversion balance.` });
        if (a.excluded_reason) return res.status(400).json({ error: `${a.name}: ${a.excluded_reason}` });
        if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
          return res.status(400).json({ error: `${a.name}: enter either a debit or a credit amount.` });
        }
        debits += debit; credits += credit;
        lines.push({ account_id: accountId, program_id: programId, debit_cents: debit, credit_cents: credit });
      }
      if (!lines.length) return res.status(400).json({ error: 'Enter at least one balance.' });
      const diff = debits - credits;
      let balancingId = null;
      if (diff !== 0) {
        balancingId = Number.parseInt(String(body.balancing_account_id), 10);
        const b = accounts.get(balancingId);
        if (!b || b.type !== 'equity') return res.status(400).json({ error: 'The balances differ by ' + (Math.abs(diff) / 100).toFixed(2) + '. Pick the net assets account that takes the difference.' });
        lines.push({ account_id: balancingId, program_id: programId, debit_cents: diff < 0 ? -diff : 0, credit_cents: diff > 0 ? diff : 0, line_memo: BALANCING_MEMO });
      }
      const posted = await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: date, memo: 'Conversion balances as of ' + date, payee: null, referenceNumber: null,
        lines, source: 'conversion_balance', entryType: 'journal', journalReason: 'Conversion balances entered at setup',
      });
      if (posted.httpStatus >= 400) return res.status(posted.httpStatus).json(posted.body);
      if (row && row.ledger_transaction_id) {
        const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: row.ledger_transaction_id, voidReason: 'Conversion balances re-entered' });
        if (v.httpStatus >= 400 && v.body && v.body.code !== 'already_voided') {
          await voidLedgerTransaction(pool, { orgId, userId, transactionId: posted.body.id, voidReason: 'Replacement could not be completed' });
          return res.status(v.httpStatus).json(v.body);
        }
      }
      if (row) {
        await pool.query(
          `UPDATE org_conversion_balances SET conversion_date = $2, program_id = $3, balancing_account_id = $4, ledger_transaction_id = $5, entered_by = $6, updated_at = NOW() WHERE org_id = $1`,
          [orgId, date, programId, balancingId, posted.body.id, userId]);
      } else {
        await pool.query(
          `INSERT INTO org_conversion_balances (org_id, conversion_date, program_id, balancing_account_id, ledger_transaction_id, entered_by) VALUES ($1,$2,$3,$4,$5,$6)`,
          [orgId, date, programId, balancingId, posted.body.id, userId]);
      }
      logAudit(pool, { orgId, userId, action: row ? 'update' : 'create', tableName: 'org_conversion_balances', recordId: orgId,
        fields: [{ fieldName: 'conversion_date', oldValue: row ? String(row.conversion_date).slice(0, 10) : '(none)', newValue: date }],
        metadata: { ...reqMeta(req), ledger_transaction_id: posted.body.id } }).catch(() => {});
      return res.json({ ledger_transaction_id: posted.body.id, status: 'open' });
    } catch (e) {
      console.error('PUT conversion-balances:', e.message);
      return res.status(500).json({ error: 'Could not save the conversion balances' });
    }
  });

  app.post(base + '/lock', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const row = await currentRow(orgId);
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
      const row = await currentRow(orgId);
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
