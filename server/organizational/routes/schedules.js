'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');

function rowToSchedule(row) {
  return {
    id:            Number(row.id),
    org_id:   row.org_id,
    fiscal_year:   row.fiscal_year,
    name:          row.name,
    schedule_type: row.schedule_type,
    status:        row.status,
    notes:         row.notes,
    sort_order:    row.sort_order,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
  };
}

function registerOrganizationalScheduleRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // GET — list named schedules for org + fiscal year
  app.get('/api/organizational/orgs/:slug/schedules', ...orgAuth, async (req, res) => {
    const orgId  = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy     = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });

    try {
      const { rows } = await pool.query(
        `SELECT * FROM org_schedules
         WHERE org_id=$1 AND fiscal_year=$2
         ORDER BY sort_order, name`,
        [orgId, fy]
      );
      res.json({ schedules: rows.map(rowToSchedule) });
    } catch (e) {
      console.error('GET /schedules:', e.message);
      res.status(500).json({ error: 'Could not load schedules' });
    }
  });

  // POST — create named schedule
  app.post('/api/organizational/orgs/:slug/schedules', ...orgAuth, async (req, res) => {
    const orgId  = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const { fiscal_year, name, schedule_type = 'custom', notes = null, sort_order = 0 } = req.body;

    if (!fiscal_year) return res.status(400).json({ error: 'fiscal_year required' });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });

    try {
      const { rows } = await pool.query(
        `INSERT INTO org_schedules
           (org_id, fiscal_year, name, schedule_type, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [orgId, fiscal_year, String(name).trim(), schedule_type, notes, sort_order]
      );
      const created = rows[0];
      await logAudit(pool, {
        orgId: orgId, userId, action: 'create',
        tableName: 'org_schedules', recordId: created.id,
        metadata: reqMeta(req),
      });
      res.status(201).json({ schedule: rowToSchedule(created) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A schedule with this name already exists for this year' });
      console.error('POST /schedules:', e.message);
      res.status(500).json({ error: 'Could not create schedule' });
    }
  });

  // PATCH — rename or update schedule metadata
  app.patch('/api/organizational/orgs/:slug/schedules/:id', ...orgAuth, async (req, res) => {
    const orgId   = req.orgId;
    const userId  = req.user.user_id ?? req.user.id;
    const schedId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(schedId)) return res.status(400).json({ error: 'Invalid id' });

    const allowed = ['name', 'schedule_type', 'status', 'notes', 'sort_order'];
    const updates = [];
    const vals    = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field}=$${vals.length + 3}`);
        vals.push(req.body[field]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    try {
      const beforeR = await pool.query(
        `SELECT * FROM org_schedules WHERE id=$1 AND org_id=$2`,
        [schedId, orgId]
      );
      if (!beforeR.rows.length) return res.status(404).json({ error: 'Schedule not found' });
      const beforeRow = beforeR.rows[0];

      updates.push('updated_at=NOW()');
      const { rows } = await pool.query(
        `UPDATE org_schedules SET ${updates.join(',')}
         WHERE id=$1 AND org_id=$2 RETURNING *`,
        [schedId, orgId, ...vals]
      );
      if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });
      await logAudit(pool, {
        orgId: orgId, userId, action: 'update',
        tableName: 'org_schedules', recordId: schedId,
        fields: diffFields(beforeRow, rows[0], allowed),
        metadata: reqMeta(req),
      });
      res.json({ schedule: rowToSchedule(rows[0]) });
    } catch (e) {
      console.error('PATCH /schedules:', e.message);
      res.status(500).json({ error: 'Could not update schedule' });
    }
  });

  // DELETE — remove schedule (items cascade via FK)
  app.delete('/api/organizational/orgs/:slug/schedules/:id', ...orgAuth, async (req, res) => {
    const orgId   = req.orgId;
    const userId  = req.user.user_id ?? req.user.id;
    const schedId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(schedId)) return res.status(400).json({ error: 'Invalid id' });

    try {
      const { rowCount } = await pool.query(
        `DELETE FROM org_schedules WHERE id=$1 AND org_id=$2`,
        [schedId, orgId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Schedule not found' });
      await logAudit(pool, {
        orgId: orgId, userId, action: 'delete',
        tableName: 'org_schedules', recordId: schedId,
        metadata: reqMeta(req),
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /schedules:', e.message);
      res.status(500).json({ error: 'Could not delete schedule' });
    }
  });
}

module.exports = { registerOrganizationalScheduleRoutes };
