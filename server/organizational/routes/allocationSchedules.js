'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');

async function canWrite(pool, orgId, userId) {
  const r = await pool.query(`SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`, [orgId, userId]);
  const role = String(r.rows[0] && r.rows[0].role ? r.rows[0].role : '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function toSchedule(row) {
  return {
    id: Number(row.id),
    org_id: Number(row.org_id),
    name: row.name,
    description: row.description || null,
    fiscal_year: Number(row.fiscal_year),
    total_amount_cents: Number(row.total_amount_cents) || 0,
    total_amount_dollars: (Number(row.total_amount_cents) || 0) / 100,
    source_account_id: row.source_account_id == null ? null : Number(row.source_account_id),
    distribution_type: row.distribution_type,
    monthly_pattern: row.monthly_pattern,
    active: !!row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizePayload(body) {
  const distributionType = String(body.distribution_type || '').trim();
  const monthlyPattern = String(body.monthly_pattern || 'even').trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const monthly = Array.isArray(body.monthly) ? body.monthly : [];
  const totalAmt = body.total_amount_cents != null ? Number(body.total_amount_cents) : Math.round(Number(body.total_amount || 0) * 100);
  return {
    name: String(body.name || '').trim(),
    description: body.description == null ? null : String(body.description),
    fiscalYear: Number.parseInt(String(body.fiscal_year || ''), 10),
    totalAmountCents: Number.isFinite(totalAmt) ? Math.round(totalAmt) : NaN,
    sourceAccountId: body.source_account_id == null || body.source_account_id === '' ? null : Number.parseInt(String(body.source_account_id), 10),
    distributionType,
    monthlyPattern,
    active: body.active === undefined ? true : !!body.active,
    lines,
    monthly,
  };
}

function validatePayload(p) {
  if (!p.name) return 'name is required';
  if (!Number.isInteger(p.fiscalYear) || p.fiscalYear < 1900 || p.fiscalYear > 2200) return 'fiscal_year invalid';
  if (!Number.isInteger(p.totalAmountCents)) return 'total_amount invalid';
  if (!['fixed_percent_by_program', 'fixed_amount_by_program'].includes(p.distributionType)) return 'distribution_type invalid';
  if (!['even', 'monthly_custom'].includes(p.monthlyPattern)) return 'monthly_pattern invalid';
  if (!Array.isArray(p.lines) || p.lines.length === 0) return 'lines required';
  let sum = 0;
  for (const l of p.lines) {
    if (!Number.isInteger(Number(l.program_id)) || !Number.isInteger(Number(l.account_id))) return 'line program_id/account_id invalid';
    if (p.distributionType === 'fixed_percent_by_program') sum += Number(l.percent_bps) || 0;
    else sum += Number(l.amount_cents != null ? l.amount_cents : Math.round(Number(l.amount || 0) * 100)) || 0;
  }
  if (p.distributionType === 'fixed_percent_by_program' && sum !== 10000) return 'line percents must sum to 10000 bps';
  if (p.distributionType === 'fixed_amount_by_program' && sum !== p.totalAmountCents) return 'line amounts must sum to total_amount';
  if (p.monthlyPattern === 'monthly_custom') {
    if (!Array.isArray(p.monthly) || p.monthly.length !== 12) return 'monthly pattern requires 12 rows';
    const msum = p.monthly.reduce((s, m) => s + (Number(m.percent_bps) || 0), 0);
    if (msum !== 10000) return 'monthly percentages must sum to 10000 bps';
  }
  return null;
}

async function loadScheduleDetail(pool, orgId, id) {
  const s = await pool.query(`SELECT * FROM org_allocation_schedules WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
  if (!s.rows[0]) return null;
  const lines = await pool.query(
    `SELECT al.*, p.name AS program_name, a.name AS account_name
     FROM org_allocation_lines al
     LEFT JOIN org_programs p ON p.id = al.coop_program_id
     LEFT JOIN org_accounts a ON a.id = al.coop_account_id
     WHERE al.coop_allocation_schedule_id = $1
     ORDER BY al.id ASC`,
    [id]
  );
  const monthly = await pool.query(`SELECT * FROM org_allocation_monthly WHERE coop_allocation_schedule_id = $1 ORDER BY period_month ASC`, [id]);
  return { schedule: toSchedule(s.rows[0]), lines: lines.rows, monthly: monthly.rows };
}

function registerOrganizationalAllocationScheduleRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/allocation-schedules', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    const activeQ = req.query.active;
    try {
      const conds = ['org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (Number.isInteger(fy)) {
        conds.push(`fiscal_year = $${p}`);
        params.push(fy);
        p += 1;
      }
      if (activeQ !== undefined) {
        conds.push(`active = $${p}`);
        params.push(String(activeQ) === 'true' || String(activeQ) === '1');
      }
      const r = await pool.query(`SELECT * FROM org_allocation_schedules WHERE ${conds.join(' AND ')} ORDER BY fiscal_year DESC, id DESC`, params);
      return res.json({ schedules: r.rows.map(toSchedule) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /allocation-schedules:', e.message);
      return res.status(500).json({ error: 'Could not load schedules' });
    }
  });

  app.get('/api/organizational/orgs/:slug/allocation-schedules/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalid' });
    try {
      const d = await loadScheduleDetail(pool, orgId, id);
      if (!d) return res.status(404).json({ error: 'Schedule not found' });
      return res.json(d);
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /allocation-schedules/:id:', e.message);
      return res.status(500).json({ error: 'Could not load schedule' });
    }
  });

  app.post('/api/organizational/orgs/:slug/allocation-schedules', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const payload = normalizePayload(req.body || {});
    const bad = validatePayload(payload);
    if (bad) return res.status(400).json({ error: bad });
    const client = await pool.connect();
    try {
      if (!(await canWrite(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });
      await client.query('BEGIN');
      const s = await client.query(
        `INSERT INTO org_allocation_schedules (
           org_id, name, description, fiscal_year, total_amount_cents, source_account_id,
           distribution_type, monthly_pattern, active, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
        [orgId, payload.name, payload.description, payload.fiscalYear, payload.totalAmountCents, payload.sourceAccountId, payload.distributionType, payload.monthlyPattern, payload.active, userId]
      );
      const sid = Number(s.rows[0].id);
      for (const l of payload.lines) {
        const amt = l.amount_cents != null ? Number(l.amount_cents) : Math.round(Number(l.amount || 0) * 100);
        await client.query(
          `INSERT INTO org_allocation_lines (
             coop_allocation_schedule_id, coop_program_id, coop_account_id, percent_bps, amount_cents
           ) VALUES ($1,$2,$3,$4,$5)`,
          [sid, Number(l.program_id), Number(l.account_id), payload.distributionType === 'fixed_percent_by_program' ? Number(l.percent_bps) : null, payload.distributionType === 'fixed_amount_by_program' ? Math.round(amt) : null]
        );
      }
      if (payload.monthlyPattern === 'monthly_custom') {
        for (const m of payload.monthly) {
          await client.query(
            `INSERT INTO org_allocation_monthly (coop_allocation_schedule_id, period_month, percent_bps) VALUES ($1,$2,$3)`,
            [sid, Number(m.period_month), Number(m.percent_bps)]
          );
        }
      }
      await client.query('COMMIT');
      logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_allocation_schedules', recordId: sid, metadata: reqMeta(req) });
      const d = await loadScheduleDetail(pool, orgId, sid);
      return res.status(201).json(d);
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('POST /allocation-schedules:', e.message);
      return res.status(500).json({ error: 'Could not create schedule' });
    } finally {
      client.release();
    }
  });

  app.patch('/api/organizational/orgs/:slug/allocation-schedules/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalid' });
    const payload = normalizePayload(req.body || {});
    const bad = validatePayload(payload);
    if (bad) return res.status(400).json({ error: bad });
    const client = await pool.connect();
    try {
      if (!(await canWrite(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });
      await client.query('BEGIN');
      const u = await client.query(
        `UPDATE org_allocation_schedules
         SET name = $1, description = $2, fiscal_year = $3, total_amount_cents = $4, source_account_id = $5,
             distribution_type = $6, monthly_pattern = $7, active = $8, updated_by = $9, updated_at = NOW()
         WHERE id = $10 AND org_id = $11 RETURNING *`,
        [payload.name, payload.description, payload.fiscalYear, payload.totalAmountCents, payload.sourceAccountId, payload.distributionType, payload.monthlyPattern, payload.active, userId, id, orgId]
      );
      if (!u.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Schedule not found' });
      }
      await client.query(`DELETE FROM org_allocation_lines WHERE coop_allocation_schedule_id = $1`, [id]);
      await client.query(`DELETE FROM org_allocation_monthly WHERE coop_allocation_schedule_id = $1`, [id]);
      for (const l of payload.lines) {
        const amt = l.amount_cents != null ? Number(l.amount_cents) : Math.round(Number(l.amount || 0) * 100);
        await client.query(
          `INSERT INTO org_allocation_lines (
             coop_allocation_schedule_id, coop_program_id, coop_account_id, percent_bps, amount_cents
           ) VALUES ($1,$2,$3,$4,$5)`,
          [id, Number(l.program_id), Number(l.account_id), payload.distributionType === 'fixed_percent_by_program' ? Number(l.percent_bps) : null, payload.distributionType === 'fixed_amount_by_program' ? Math.round(amt) : null]
        );
      }
      if (payload.monthlyPattern === 'monthly_custom') {
        for (const m of payload.monthly) {
          await client.query(
            `INSERT INTO org_allocation_monthly (coop_allocation_schedule_id, period_month, percent_bps) VALUES ($1,$2,$3)`,
            [id, Number(m.period_month), Number(m.percent_bps)]
          );
        }
      }
      await client.query('COMMIT');
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_allocation_schedules', recordId: id, metadata: reqMeta(req) });
      const d = await loadScheduleDetail(pool, orgId, id);
      return res.json(d);
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('PATCH /allocation-schedules/:id:', e.message);
      return res.status(500).json({ error: 'Could not update schedule' });
    } finally {
      client.release();
    }
  });

  app.delete('/api/organizational/orgs/:slug/allocation-schedules/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalid' });
    try {
      if (!(await canWrite(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });
      const del = await pool.query(`DELETE FROM org_allocation_schedules WHERE id = $1 AND org_id = $2 RETURNING id`, [id, orgId]);
      if (del.rowCount > 0) {
        logAudit(pool, { orgId, userId, action: 'delete', tableName: 'org_allocation_schedules', recordId: id, metadata: reqMeta(req) });
      }
      return res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /allocation-schedules/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete schedule' });
    }
  });
}

module.exports = { registerOrganizationalAllocationScheduleRoutes };
