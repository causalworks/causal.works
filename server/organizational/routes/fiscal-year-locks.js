'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { runReconciliationChecks } = require('../lib/reconciliation');

const MIN_REOPEN_REASON_LENGTH = 10;

function parseFy(req, res) {
  const fy = Number(req.params.fy);
  if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
    res.status(400).json({ error: 'Invalid fiscal year' });
    return null;
  }
  return fy;
}

async function getLockRow(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT id, org_id, fiscal_year, locked_at, locked_by_user_id, reopened_at, reopened_by_user_id, reopen_reason
     FROM org_fiscal_year_locks WHERE org_id = $1 AND fiscal_year = $2`,
    [orgId, fy]
  );
  return r.rows[0] || null;
}

function rowToLockStatus(row, fy) {
  if (!row) {
    return { fiscal_year: fy, locked: false, locked_at: null, locked_by_user_id: null, reopened_at: null, reopened_by_user_id: null, reopen_reason: null };
  }
  return {
    fiscal_year: fy,
    locked: row.locked_at != null,
    locked_at: row.locked_at,
    locked_by_user_id: row.locked_by_user_id,
    reopened_at: row.reopened_at,
    reopened_by_user_id: row.reopened_by_user_id,
    reopen_reason: row.reopen_reason,
  };
}

function registerFiscalYearLockRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  // GET -- list the last few FYs (current +/- 3, based on org_budget_lines' distinct years
  // plus the current calendar year) with lock status for each.
  app.get('/api/organizational/orgs/:slug/fiscal-years', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const nowYear = new Date().getFullYear();
      const yearsR = await pool.query(
        `SELECT DISTINCT fiscal_year FROM org_budget_lines WHERE org_id = $1
         UNION SELECT $2::int UNION SELECT $2::int - 1 UNION SELECT $2::int + 1
         ORDER BY fiscal_year DESC`,
        [orgId, nowYear]
      );
      const years = yearsR.rows.map((r) => Number(r.fiscal_year));
      const lockR = await pool.query(
        `SELECT fiscal_year, locked_at, locked_by_user_id, reopened_at, reopened_by_user_id, reopen_reason
         FROM org_fiscal_year_locks WHERE org_id = $1`,
        [orgId]
      );
      const byYear = new Map(lockR.rows.map((r) => [Number(r.fiscal_year), r]));
      const fiscalYears = years.map((fy) => rowToLockStatus(byYear.get(fy) || null, fy));
      return res.json({ fiscal_years: fiscalYears });
    } catch (e) {
      console.error('GET fiscal-years:', e.message);
      return res.status(500).json({ error: 'Could not load fiscal years' });
    }
  });

  // GET -- reconciliation checks + lock status for one FY.
  app.get('/api/organizational/orgs/:slug/fiscal-years/:fy/reconciliation', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy = parseFy(req, res);
    if (fy == null) return;
    try {
      const result = await runReconciliationChecks(pool, orgId, fy);
      const lockRow = await getLockRow(pool, orgId, fy);
      return res.json({ ...result, lock: rowToLockStatus(lockRow, fy) });
    } catch (e) {
      console.error('GET fiscal-years/:fy/reconciliation:', e.message);
      return res.status(500).json({ error: 'Could not run reconciliation checks' });
    }
  });

  // POST -- lock a fiscal year. Advisory-only on reconciliation status by design (see
  // migration 164's header comment) -- an org can lock an imperfect year deliberately.
  app.post('/api/organizational/orgs/:slug/fiscal-years/:fy/lock', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = parseFy(req, res);
    if (fy == null) return;
    try {
      const before = await getLockRow(pool, orgId, fy);
      await pool.query(
        `INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at, locked_by_user_id, reopened_at, reopened_by_user_id, reopen_reason, updated_at)
         VALUES ($1, $2, NOW(), $3, NULL, NULL, NULL, NOW())
         ON CONFLICT (org_id, fiscal_year) DO UPDATE
           SET locked_at = NOW(), locked_by_user_id = $3, reopened_at = NULL, reopened_by_user_id = NULL, reopen_reason = NULL, updated_at = NOW()`,
        [orgId, fy, userId]
      );
      const after = await getLockRow(pool, orgId, fy);
      await logAudit(pool, {
        orgId: orgId, userId, action: before ? 'update' : 'create',
        tableName: 'org_fiscal_year_locks', recordId: after.id,
        fields: diffFields(before || {}, after, ['locked_at', 'locked_by_user_id', 'reopened_at', 'reopened_by_user_id', 'reopen_reason']),
        metadata: reqMeta(req),
      });
      return res.json({ lock: rowToLockStatus(after, fy) });
    } catch (e) {
      console.error('POST fiscal-years/:fy/lock:', e.message);
      return res.status(500).json({ error: 'Could not lock fiscal year' });
    }
  });

  // POST -- reopen a locked fiscal year. Requires a reason (this is the audit trail that
  // makes the "why was this reopened" question answerable later -- see plan context: the
  // named use cases are locking before an audit/tax return is final, and post-close revisions).
  app.post('/api/organizational/orgs/:slug/fiscal-years/:fy/reopen', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = parseFy(req, res);
    if (fy == null) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const reason = String(body.reason ?? '').trim();
    if (reason.length < MIN_REOPEN_REASON_LENGTH) {
      return res.status(400).json({ error: `reason must be at least ${MIN_REOPEN_REASON_LENGTH} characters` });
    }
    try {
      const before = await getLockRow(pool, orgId, fy);
      if (!before || before.locked_at == null) {
        return res.status(409).json({ error: 'Fiscal year is not currently locked' });
      }
      await pool.query(
        `UPDATE org_fiscal_year_locks
         SET locked_at = NULL, reopened_at = NOW(), reopened_by_user_id = $3, reopen_reason = $4, updated_at = NOW()
         WHERE org_id = $1 AND fiscal_year = $2`,
        [orgId, fy, userId, reason]
      );
      const after = await getLockRow(pool, orgId, fy);
      await logAudit(pool, {
        orgId: orgId, userId, action: 'update',
        tableName: 'org_fiscal_year_locks', recordId: after.id,
        fields: diffFields(before, after, ['locked_at', 'reopened_at', 'reopened_by_user_id', 'reopen_reason']),
        metadata: { ...reqMeta(req), reason },
      });
      return res.json({ lock: rowToLockStatus(after, fy) });
    } catch (e) {
      console.error('POST fiscal-years/:fy/reopen:', e.message);
      return res.status(500).json({ error: 'Could not reopen fiscal year' });
    }
  });
}

module.exports = { registerFiscalYearLockRoutes };
