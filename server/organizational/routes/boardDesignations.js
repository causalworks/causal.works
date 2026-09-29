'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');

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

  // Balance is derived, not stored -- same as a donor-restricted grant's per-fund balance,
  // just tagged by board_designation_id instead of grant_id (see migration 237).
  app.get('/api/organizational/orgs/:slug/board-designations', ...orgAuth, async (req, res) => {
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

  app.post('/api/organizational/orgs/:slug/board-designations', ...orgAuth, async (req, res) => {
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

  app.patch('/api/organizational/orgs/:slug/board-designations/:id', ...orgAuth, async (req, res) => {
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
}

module.exports = { registerBoardDesignationRoutes };
