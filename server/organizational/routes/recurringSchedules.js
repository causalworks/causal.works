'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = new Set(['monthly', 'quarterly', 'annual', 'custom_months']);

function rowToSchedule(row) {
  return {
    id: row.id, org_id: row.org_id, schedule_type: row.schedule_type, frequency: row.frequency,
    active_months: row.active_months, next_occurrence_date: row.next_occurrence_date, end_date: row.end_date,
    template: row.template, active: row.active, created_at: row.created_at, updated_at: row.updated_at,
    contact_name: row.contact_name || null,
  };
}

function registerRecurringSchedulesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);
  const base = '/api/organizational/orgs/:slug/recurring-schedules';

  app.get(base, ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const kind = req.query.schedule_type != null ? String(req.query.schedule_type) : null;
    try {
      const conds = ['s.org_id = $1'];
      const params = [orgId];
      if (kind) { conds.push('s.schedule_type = $2'); params.push(kind); }
      const r = await pool.query(
        `SELECT s.*, c.display_name AS contact_name
         FROM org_recurring_schedules s
         LEFT JOIN org_constituents c ON c.id = (s.template->>'constituent_id')::integer
         WHERE ${conds.join(' AND ')}
         ORDER BY s.active DESC, s.next_occurrence_date ASC`,
        params
      );
      return res.json({ schedules: r.rows.map(rowToSchedule) });
    } catch (e) {
      console.error('GET recurring-schedules:', e.message);
      return res.status(500).json({ error: 'Could not load recurring schedules' });
    }
  });

  function parseSchedule(body) {
    const frequency = String(body.frequency || '').trim();
    if (!FREQUENCIES.has(frequency)) return { error: 'frequency must be monthly, quarterly, annual, or custom_months' };
    const activeMonths = Array.isArray(body.active_months) ? body.active_months.map(Number) : null;
    if (frequency === 'custom_months' && (!activeMonths || !activeMonths.length)) return { error: 'active_months is required when frequency is custom_months' };
    const nextOccurrenceDate = body.next_occurrence_date != null ? String(body.next_occurrence_date) : null;
    if (!nextOccurrenceDate || !DATE_RE.test(nextOccurrenceDate)) return { error: 'next_occurrence_date is required and must be YYYY-MM-DD' };
    const endDate = body.end_date != null && body.end_date !== '' ? String(body.end_date) : null;
    if (endDate && !DATE_RE.test(endDate)) return { error: 'end_date must be YYYY-MM-DD' };
    const template = body.template && typeof body.template === 'object' ? body.template : null;
    if (!template || !template.constituent_id || !Array.isArray(template.lines) || !template.lines.length) return { error: 'template must include constituent_id and at least one line' };
    if (template.due_days != null && !(Number.isInteger(template.due_days) && template.due_days >= 0 && template.due_days <= 365)) return { error: 'due_days must be a whole number of days, 0 to 365' };
    return { frequency, activeMonths: frequency === 'custom_months' ? activeMonths : null, nextOccurrenceDate, endDate, template };
  }

  app.post(base, ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const scheduleType = String(body.schedule_type || '').trim();
    if (!['bill', 'invoice'].includes(scheduleType)) return res.status(400).json({ error: 'schedule_type must be bill or invoice' });
    const p = parseSchedule(body);
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const r = await pool.query(
        `INSERT INTO org_recurring_schedules (org_id, schedule_type, frequency, active_months, next_occurrence_date, end_date, template, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [orgId, scheduleType, p.frequency, p.activeMonths, p.nextOccurrenceDate, p.endDate, JSON.stringify(p.template), userId]
      );
      await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_recurring_schedules', recordId: r.rows[0].id, metadata: { ...reqMeta(req), schedule_type: scheduleType, frequency: p.frequency } });
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST recurring-schedules:', e.message);
      return res.status(500).json({ error: 'Could not create recurring schedule' });
    }
  });

  app.patch(base + '/:id', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const p = parseSchedule(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const before = (await pool.query(`SELECT * FROM org_recurring_schedules WHERE id = $1 AND org_id = $2`, [id, orgId])).rows[0] || {};
      const r = await pool.query(
        `UPDATE org_recurring_schedules SET frequency = $3, active_months = $4, next_occurrence_date = $5, end_date = $6, template = $7, updated_at = NOW()
          WHERE id = $1 AND org_id = $2 AND active RETURNING *`,
        [id, orgId, p.frequency, p.activeMonths, p.nextOccurrenceDate, p.endDate, JSON.stringify(p.template)]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Active schedule not found' });
      const after = { ...r.rows[0], template: JSON.stringify(r.rows[0].template), active_months: JSON.stringify(r.rows[0].active_months) };
      const prev = { ...before, template: JSON.stringify(before.template), active_months: JSON.stringify(before.active_months) };
      await logAudit(pool, { orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_recurring_schedules', recordId: id, fields: diffFields(prev, after, ['frequency', 'active_months', 'next_occurrence_date', 'end_date', 'template']), metadata: reqMeta(req) });
      return res.json({ id });
    } catch (e) {
      console.error('PATCH recurring-schedules:', e.message);
      return res.status(500).json({ error: 'Could not update recurring schedule' });
    }
  });

  app.post(base + '/:id/deactivate', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(`UPDATE org_recurring_schedules SET active = false, updated_at = NOW() WHERE id = $1 AND org_id = $2 RETURNING id`, [id, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Schedule not found' });
      await logAudit(pool, { orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_recurring_schedules', recordId: id, fields: [{ fieldName: 'active', oldValue: 'true', newValue: 'false' }], metadata: reqMeta(req) });
      return res.json({ id, active: false });
    } catch (e) {
      console.error('POST recurring-schedules/deactivate:', e.message);
      return res.status(500).json({ error: 'Could not deactivate schedule' });
    }
  });
}

module.exports = { registerRecurringSchedulesRoutes };
