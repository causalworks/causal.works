'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { evaluateProjectionFormula } = require('../lib/OrganizationalFormulaEvaluator');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');

function parseAmountCents(body, allowNull) {
  if (body.amount_cents !== undefined && body.amount_cents !== null && body.amount_cents !== '') {
    const n = Number(body.amount_cents);
    if (!Number.isFinite(n)) return { error: 'amount_cents must be numeric' };
    return { value: Math.round(n) };
  }
  if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== '') {
    const x = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isFinite(x)) return { error: 'amount must be numeric' };
    return { value: Math.round(x * 100) };
  }
  if (allowNull) return { value: null };
  return { error: 'amount is required' };
}

async function requireProjectionWriteRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  const role = String(r.rows[0] && r.rows[0].role ? r.rows[0].role : '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function rowToProjection(row) {
  return {
    id: Number(row.id),
    org_id: Number(row.org_id),
    coop_account_id: Number(row.coop_account_id),
    coop_program_id: Number(row.coop_program_id),
    fiscal_year: Number(row.fiscal_year),
    period_month: row.period_month == null ? null : Number(row.period_month),
    amount_cents: Number(row.amount_cents) || 0,
    amount_dollars: (Number(row.amount_cents) || 0) / 100,
    formula: row.formula || null,
    notes: row.notes || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    account_code: row.account_code || null,
    account_name: row.account_name || null,
    program_name: row.program_name || null,
  };
}

function registerOrganizationalProjectionsRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/projections', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) return res.status(400).json({ error: 'fiscal_year invalid' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT p.*, a.code AS account_code, a.name AS account_name, pr.name AS program_name
         FROM org_projections p
         LEFT JOIN org_accounts a ON a.id = p.coop_account_id
         LEFT JOIN org_programs pr ON pr.id = p.coop_program_id
         WHERE p.org_id = $1 AND p.fiscal_year = $2
         ORDER BY p.coop_account_id ASC, p.coop_program_id ASC, p.period_month NULLS FIRST, p.id ASC`,
        [orgId, fy]
      );
      return res.json({ projections: r.rows.map(rowToProjection) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /projections:', e.message);
      return res.status(500).json({ error: 'Could not load projections' });
    }
  });

  app.post('/api/organizational/orgs/:slug/projections', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const accountId = Number.parseInt(String(body.account_id || ''), 10);
    const programId = Number.parseInt(String(body.program_id || ''), 10);
    const fy = Number.parseInt(String(body.fiscal_year || ''), 10);
    const pm = body.period_month === null || body.period_month === '' || body.period_month === undefined ? null : Number.parseInt(String(body.period_month), 10);
    if (!Number.isInteger(accountId) || !Number.isInteger(programId) || !Number.isInteger(fy)) return res.status(400).json({ error: 'account_id, program_id, fiscal_year are required' });
    if (pm != null && (!Number.isInteger(pm) || pm < 1 || pm > 12)) return res.status(400).json({ error: 'period_month must be null or 1..12' });
    const hasFormula = body.formula != null && String(body.formula).trim() !== '';
    const hasAmount = (body.amount != null && String(body.amount).trim() !== '') || (body.amount_cents != null && String(body.amount_cents).trim() !== '');
    if (hasFormula === hasAmount) return res.status(400).json({ error: 'Provide either amount or formula' });
    try {
      const orgId = req.orgId;
      const canWrite = await requireProjectionWriteRole(pool, orgId, userId);
      if (!canWrite) return res.status(403).json({ error: 'Insufficient permissions' });
      let amountCents = 0;
      let formula = null;
      if (hasFormula) {
        const evalOut = await evaluateProjectionFormula(pool, {
          orgId: orgId,
          fiscalYear: fy,
          programId,
          formula: String(body.formula || ''),
        });
        amountCents = evalOut.amount_cents;
        formula = evalOut.formula;
      } else {
        const amt = parseAmountCents(body, false);
        if (amt.error) return res.status(400).json({ error: amt.error });
        amountCents = amt.value;
      }
      const r = await pool.query(
        `INSERT INTO org_projections (
          org_id, coop_account_id, coop_program_id, fiscal_year, period_month, amount_cents, formula, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING *`,
        [orgId, accountId, programId, fy, pm, amountCents, formula, body.notes ? String(body.notes) : null, userId]
      );
      return res.status(201).json({ projection: rowToProjection(r.rows[0]) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      const msg = String(e && e.message ? e.message : '');
      if (msg && (msg.includes('Unsupported function') || msg.includes('Invalid formula') || msg.includes('Formula'))) {
        return res.status(400).json({ error: msg });
      }
      if (String(e.message || '').includes('duplicate key')) return res.status(409).json({ error: 'Projection already exists for that cell/grain' });
      console.error('POST /projections:', e.message);
      return res.status(500).json({ error: 'Could not create projection' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/projections/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalid' });
    try {
      const orgId = req.orgId;
      const canWrite = await requireProjectionWriteRole(pool, orgId, userId);
      if (!canWrite) return res.status(403).json({ error: 'Insufficient permissions' });
      const cur = await pool.query(`SELECT * FROM org_projections WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
      if (!cur.rows[0]) return res.status(404).json({ error: 'Projection not found' });
      const row = cur.rows[0];
      let amountCents = Number(row.amount_cents) || 0;
      let formula = row.formula || null;
      const hasFormula = Object.prototype.hasOwnProperty.call(body, 'formula') && String(body.formula || '').trim() !== '';
      const hasAmount = Object.prototype.hasOwnProperty.call(body, 'amount') || Object.prototype.hasOwnProperty.call(body, 'amount_cents');
      if (hasFormula && hasAmount) return res.status(400).json({ error: 'Provide amount or formula, not both' });
      if (hasFormula) {
        const evalOut = await evaluateProjectionFormula(pool, {
          orgId: orgId,
          fiscalYear: Number(row.fiscal_year),
          programId: Number(row.coop_program_id),
          formula: String(body.formula || ''),
        });
        amountCents = evalOut.amount_cents;
        formula = evalOut.formula;
      } else if (hasAmount) {
        const amt = parseAmountCents(body, false);
        if (amt.error) return res.status(400).json({ error: amt.error });
        amountCents = amt.value;
        formula = null;
      }
      const notes = Object.prototype.hasOwnProperty.call(body, 'notes') ? (body.notes == null ? null : String(body.notes)) : row.notes;
      const upd = await pool.query(
        `UPDATE org_projections
         SET amount_cents = $1, formula = $2, notes = $3, updated_by = $4, updated_at = NOW()
         WHERE id = $5 AND org_id = $6
         RETURNING *`,
        [amountCents, formula, notes, userId, id, orgId]
      );
      return res.json({ projection: rowToProjection(upd.rows[0]) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      const msg = String(e && e.message ? e.message : '');
      if (msg && (msg.includes('Unsupported function') || msg.includes('Invalid formula') || msg.includes('Formula'))) {
        return res.status(400).json({ error: msg });
      }
      console.error('PATCH /projections/:id:', e.message);
      return res.status(500).json({ error: 'Could not update projection' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/projections/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalid' });
    try {
      const orgId = req.orgId;
      const canWrite = await requireProjectionWriteRole(pool, orgId, userId);
      if (!canWrite) return res.status(403).json({ error: 'Insufficient permissions' });
      await pool.query(`DELETE FROM org_projections WHERE id = $1 AND org_id = $2`, [id, orgId]);
      return res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /projections/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete projection' });
    }
  });

  app.post('/api/organizational/orgs/:slug/projections/recalculate', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) return res.status(400).json({ error: 'fiscal_year invalid' });
    try {
      const orgId = req.orgId;
      const canWrite = await requireProjectionWriteRole(pool, orgId, userId);
      if (!canWrite) return res.status(403).json({ error: 'Insufficient permissions' });
      const rows = await pool.query(
        `SELECT id, coop_program_id, formula FROM org_projections
         WHERE org_id = $1 AND fiscal_year = $2 AND formula IS NOT NULL AND trim(formula) <> ''`,
        [orgId, fy]
      );
      let updated = 0;
      for (const r of rows.rows) {
        const evalOut = await evaluateProjectionFormula(pool, {
          orgId: orgId,
          fiscalYear: fy,
          programId: Number(r.coop_program_id),
          formula: String(r.formula),
        });
        await pool.query(
          `UPDATE org_projections SET amount_cents = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
          [evalOut.amount_cents, userId, r.id]
        );
        updated += 1;
      }
      return res.json({ ok: true, updated });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      const msg = String(e && e.message ? e.message : '');
      if (msg && (msg.includes('Unsupported function') || msg.includes('Invalid formula') || msg.includes('Formula'))) {
        return res.status(400).json({ error: msg });
      }
      console.error('POST /projections/recalculate:', e.message);
      return res.status(500).json({ error: 'Could not recalculate formulas' });
    }
  });

  app.post('/api/organizational/orgs/:slug/projections/validate-formula', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fy = Number.parseInt(String(body.fiscal_year || req.query.fiscal_year || ''), 10);
    const programId = Number.parseInt(String(body.program_id || ''), 10);
    const formula = String(body.formula || '').trim();
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) return res.status(400).json({ error: 'fiscal_year invalid' });
    if (!Number.isInteger(programId) || programId < 1) return res.status(400).json({ error: 'program_id invalid' });
    if (!formula) return res.status(400).json({ error: 'formula required' });
    try {
      const orgId = req.orgId;
      const evalOut = await evaluateProjectionFormula(pool, {
        orgId: orgId,
        fiscalYear: fy,
        programId,
        formula,
      });
      return res.json({ valid: true, preview_cents: evalOut.amount_cents });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      return res.status(400).json({ valid: false, error: String(e && e.message ? e.message : 'Formula invalid') });
    }
  });
}

module.exports = { registerOrganizationalProjectionsRoutes };
