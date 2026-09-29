'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');

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
  const base = '/api/organizational/orgs/:slug/recurring-schedules';

  app.get(base, ...orgAuth, async (req, res) => {
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

  app.post(base, ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};

    const scheduleType = String(body.schedule_type || '').trim();
    if (!['bill', 'invoice'].includes(scheduleType)) return res.status(400).json({ error: 'schedule_type must be bill or invoice' });
    const frequency = String(body.frequency || '').trim();
    if (!FREQUENCIES.has(frequency)) return res.status(400).json({ error: 'frequency must be monthly, quarterly, annual, or custom_months' });
    const activeMonths = Array.isArray(body.active_months) ? body.active_months.map(Number) : null;
    if (frequency === 'custom_months' && (!activeMonths || !activeMonths.length)) {
      return res.status(400).json({ error: 'active_months is required when frequency is custom_months' });
    }
    const nextOccurrenceDate = body.next_occurrence_date != null ? String(body.next_occurrence_date) : null;
    if (!nextOccurrenceDate || !DATE_RE.test(nextOccurrenceDate)) return res.status(400).json({ error: 'next_occurrence_date is required and must be YYYY-MM-DD' });
    const endDate = body.end_date != null && body.end_date !== '' ? String(body.end_date) : null;
    if (endDate && !DATE_RE.test(endDate)) return res.status(400).json({ error: 'end_date must be YYYY-MM-DD' });

    const template = body.template && typeof body.template === 'object' ? body.template : null;
    if (!template || !template.constituent_id || !Array.isArray(template.lines) || !template.lines.length) {
      return res.status(400).json({ error: 'template must include constituent_id and at least one line' });
    }

    try {
      const r = await pool.query(
        `INSERT INTO org_recurring_schedules (org_id, schedule_type, frequency, active_months, next_occurrence_date, end_date, template, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [orgId, scheduleType, frequency, activeMonths, nextOccurrenceDate, endDate, JSON.stringify(template), userId]
      );
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST recurring-schedules:', e.message);
      return res.status(500).json({ error: 'Could not create recurring schedule' });
    }
  });

  app.post(base + '/:id/deactivate', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(`UPDATE org_recurring_schedules SET active = false, updated_at = NOW() WHERE id = $1 AND org_id = $2 RETURNING id`, [id, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Schedule not found' });
      return res.json({ id, active: false });
    } catch (e) {
      console.error('POST recurring-schedules/deactivate:', e.message);
      return res.status(500).json({ error: 'Could not deactivate schedule' });
    }
  });
}

module.exports = { registerRecurringSchedulesRoutes };
