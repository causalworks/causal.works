'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { postLedgerTransaction } = require('../lib/ledgerPosting');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { netAssetsByClass, netAssetBuckets } = require('../lib/restrictedNetAssets');

const STATUSES = new Set(['active', 'closed']);

function rowToDesignation(row) {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    board_approved_date: row.board_approved_date,
    board_resolution_ref: row.board_resolution_ref,
    status: row.status,
    balance_cents: String(row.balance_cents || 0),
    created_at: row.created_at,
  };
}

function parseDesignationBody(body, { partial } = { partial: false }) {
  const out = {};
  const err = (msg) => ({ error: msg });

  if (body.name != null) out.name = String(body.name).trim();
  if (!partial && !out.name) return err('name is required');

  if (body.purpose != null) out.purpose = String(body.purpose).trim() || null;
  if (body.board_resolution_ref != null) out.board_resolution_ref = String(body.board_resolution_ref).trim() || null;

  if (body.board_approved_date != null && body.board_approved_date !== '') {
    const d = new Date(String(body.board_approved_date));
    if (Number.isNaN(d.getTime())) return err('board_approved_date is invalid');
    out.board_approved_date = String(body.board_approved_date).slice(0, 10);
  } else if (body.board_approved_date === '' || body.board_approved_date === null) {
    out.board_approved_date = null;
  }

  if (body.status != null) {
    const s = String(body.status);
    if (!STATUSES.has(s)) return err('status must be active or closed');
    out.status = s;
  } else if (!partial) {
    out.status = 'active';
  }

  return { fields: out };
}

function registerBoardDesignationRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  app.get('/api/organizational/orgs/:slug/board-designations', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT d.*,
                COALESCE((SELECT SUM(l.credit_cents - l.debit_cents) FROM org_ledger_lines l
                          JOIN org_ledger_transactions t ON t.id = l.transaction_id
                          WHERE l.board_designation_id = d.id AND t.status = 'posted'), 0) AS balance_cents
         FROM org_board_designations d
         WHERE d.org_id = $1
         ORDER BY d.status ASC, d.name ASC`,
        [req.orgId]
      );
      return res.json({ designations: r.rows.map(rowToDesignation) });
    } catch (e) {
      console.error('GET /board-designations:', e.message);
      return res.status(500).json({ error: 'Could not load board designations' });
    }
  });

  app.post('/api/organizational/orgs/:slug/board-designations', ...orgAuth, financeWriter, async (req, res) => {
    const { error, fields } = parseDesignationBody(req.body || {});
    if (error) return res.status(400).json({ error });
    try {
      const userId = req.user.user_id ?? req.user.id;
      const r = await pool.query(
        `INSERT INTO org_board_designations
           (org_id, name, purpose, board_approved_date, board_resolution_ref, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [req.orgId, fields.name, fields.purpose || null, fields.board_approved_date || null,
          fields.board_resolution_ref || null, fields.status, userId]
      );
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST /board-designations:', e.message);
      return res.status(500).json({ error: 'Could not create board designation' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/board-designations/:id', ...orgAuth, financeWriter, async (req, res) => {
    const designationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(designationId) || designationId < 1) return res.status(400).json({ error: 'invalid designation id' });
    const { error, fields } = parseDesignationBody(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
      const setClauses = ['updated_at = NOW()'];
      const params = [];
      let p = 1;
      for (const [key, val] of Object.entries(fields)) {
        setClauses.push(`${key} = $${p}`);
        params.push(val);
        p += 1;
      }
      params.push(designationId, req.orgId);
      const r = await pool.query(
        `UPDATE org_board_designations SET ${setClauses.join(', ')} WHERE id = $${p} AND org_id = $${p + 1} RETURNING id`,
        params
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Board designation not found' });
      return res.json({ id: r.rows[0].id });
    } catch (e) {
      console.error('PATCH /board-designations/:id:', e.message);
      return res.status(500).json({ error: 'Could not update board designation' });
    }
  });

  app.post('/api/organizational/orgs/:slug/board-designations/:id/transfer', ...orgAuth, financeWriter, async (req, res) => {
    const designationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(designationId) || designationId < 1) return res.status(400).json({ error: 'invalid designation id' });
    const b = req.body || {};
    const direction = String(b.direction || '');
    const amountCents = Number.parseInt(String(b.amount_cents), 10);
    const fromId = Number.parseInt(String(b.undesignated_account_id), 10);
    const toId = Number.parseInt(String(b.designated_account_id), 10);
    const date = String(b.transaction_date || '');
    if (!['designate', 'release'].includes(direction)) return res.status(400).json({ error: 'direction must be designate or release' });
    if (!Number.isInteger(amountCents) || amountCents < 1) return res.status(400).json({ error: 'amount_cents must be a positive integer' });
    if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId) return res.status(400).json({ error: 'Choose one undesignated and one designated net assets account' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'transaction_date must be YYYY-MM-DD' });

    try {
      const d = await pool.query('SELECT id, name FROM org_board_designations WHERE id = $1 AND org_id = $2', [designationId, req.orgId]);
      if (!d.rows.length) return res.status(404).json({ error: 'Board designation not found' });
      const accts = await pool.query(
        `SELECT id FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[]) AND type = 'equity' AND is_posting = true`, [req.orgId, [fromId, toId]]);
      if (accts.rows.length !== 2) return res.status(400).json({ error: 'Both accounts must be net assets (equity) accounts you can post to' });
      const prog = await pool.query(`SELECT id FROM org_programs WHERE org_id = $1 AND active = true ORDER BY is_default DESC, id LIMIT 1`, [req.orgId]);
      if (!prog.rows.length) return res.status(400).json({ error: 'The workspace has no program to post this entry to' });

      const fy = fiscalYearForDate(date, await getFiscalYearEndMonth(pool, req.orgId));
      const designated = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents
         FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2 AND l.board_designation_id IS NOT NULL`, [req.orgId, fy]);
      const mine = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents
         FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2 AND l.board_designation_id = $3`, [req.orgId, fy, designationId]);
      if (direction === 'release' && amountCents > Number(mine.rows[0].cents)) {
        return res.status(422).json({ error: 'The release is larger than this designation\'s balance', code: 'release_exceeds_balance' });
      }
      if (direction === 'designate') {
        const buckets = netAssetBuckets(await netAssetsByClass(pool, req.orgId, { throughFiscalYear: fy }));
        const available = buckets.without_restrictions - Number(designated.rows[0].cents);
        if (amountCents > available) {
          return res.status(422).json({ error: 'The amount is larger than the undesignated net assets without donor restrictions available', code: 'designation_exceeds_available', available_cents: available });
        }
      }

      const userId = req.user.user_id ?? req.user.id;
      const programId = prog.rows[0].id;
      const designate = direction === 'designate';
      const out = await postLedgerTransaction(pool, {
        orgId: req.orgId, userId, transactionDate: date,
        memo: String(b.memo || '').trim() || ((designate ? 'Designate net assets: ' : 'Release designated net assets: ') + d.rows[0].name),
        source: 'manual', entryType: 'transfer', internalApproval: null,
        lines: [
          { account_id: fromId, program_id: programId, ...(designate ? { debit_cents: amountCents } : { credit_cents: amountCents }) },
          { account_id: toId, program_id: programId, board_designation_id: designationId, ...(designate ? { credit_cents: amountCents } : { debit_cents: amountCents }) },
        ],
      });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /board-designations/:id/transfer:', e.message);
      return res.status(500).json({ error: 'Could not post the transfer' });
    }
  });
}

module.exports = { registerBoardDesignationRoutes };
