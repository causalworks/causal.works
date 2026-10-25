'use strict';

const { requireAuth } = require('../../auth');
const { requireReadAccess } = require('../middleware/requireWriteAccess');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { csvCell } = require('../lib/csvCell');

const TABLE_RE = /^org_[a-z0-9_]+$/;
const ALLOWED_ACTIONS = new Set(['create', 'update', 'delete']);
const SHOWN_ACTIONS = "('create','update','delete','db_insert','db_update','db_delete')";
const SKIP_FIELDS = new Set(['id', 'org_id', 'transaction_id', 'created_at', 'updated_at', 'created_by', 'approved_by', 'approved_at', 'source_line_type', 'source_line_id', 'fiscal_year']);
const ID_FIELDS = { account_id: 'account', program_id: 'program', grant_id: 'grant' };
const MAX_EXPORT = 5000;

function parseJson(text) {
  if (text == null) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch (_) { return null; }
}


function registerOrganizationalAuditLogRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  async function nameLookups(orgId, rows) {
    const ids = { account: new Set(), program: new Set(), grant: new Set() };
    for (const r of rows) {
      if (r.action !== 'db_update' && r.action !== 'db_delete') continue;
      for (const side of [parseJson(r.old_value), parseJson(r.new_value)]) {
        if (!side) continue;
        for (const [field, kind] of Object.entries(ID_FIELDS)) {
          if (side[field] != null) ids[kind].add(Number(side[field]));
        }
      }
    }
    const names = { account: new Map(), program: new Map(), grant: new Map() };
    const run = async (kind, sql) => {
      if (!ids[kind].size) return;
      const r = await pool.query(sql, [orgId, [...ids[kind]]]);
      r.rows.forEach((x) => names[kind].set(x.id, x.label));
    };
    await Promise.all([
      run('account', "SELECT id, code || ' ' || name AS label FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])"),
      run('program', 'SELECT id, name AS label FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])'),
      run('grant', 'SELECT id, name AS label FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])'),
    ]);
    return names;
  }

  function expand(rows, names) {
    const out = [];
    const shown = (field, v) => {
      if (v == null || v === '') return null;
      const kind = ID_FIELDS[field];
      return kind ? (names[kind].get(Number(v)) || '#' + v) : v;
    };
    for (const r of rows) {
      const base = { id: r.id, table_name: r.table_name, record_id: r.record_id, occurred_at: r.occurred_at, user_email: r.user_email };
      if (r.action === 'db_insert') {
        out.push({ ...base, action: 'create', field_name: null, old_value: null, new_value: null });
      } else if (r.action === 'db_delete') {
        out.push({ ...base, action: 'delete', field_name: null, old_value: null, new_value: null });
      } else if (r.action === 'db_update') {
        const before = parseJson(r.old_value) || {};
        const after = parseJson(r.new_value) || {};
        for (const field of Object.keys(after)) {
          if (SKIP_FIELDS.has(field) || JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
          out.push({ ...base, action: 'update', field_name: field, old_value: shown(field, before[field]), new_value: shown(field, after[field]) });
        }
      } else {
        out.push({ ...base, action: r.action, field_name: r.field_name, old_value: r.old_value, new_value: r.new_value });
      }
    }
    return out;
  }

  app.get('/api/organizational/orgs/:slug/audit-log', ...orgAuth, requireReadAccess('audit_log'), async (req, res) => {
    const orgId = req.orgId;
    const isCsv = req.query.format === 'csv';

    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);

    const tableFilter = req.query.table_name && TABLE_RE.test(String(req.query.table_name)) ? String(req.query.table_name) : null;
    const actionFilter = req.query.action && ALLOWED_ACTIONS.has(req.query.action) ? req.query.action : null;
    const userFilter = Number.parseInt(String(req.query.user_id || ''), 10);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = dateRe.test(String(req.query.from || '')) ? String(req.query.from) : null;
    const to = dateRe.test(String(req.query.to || '')) ? String(req.query.to) : null;
    const q = String(req.query.q || '').trim().slice(0, 100);

    try {
      const conds = ['al.org_id = $1', `al.action IN ${SHOWN_ACTIONS}`,
        "NOT (al.action = 'db_insert' AND al.table_name IN ('org_ledger_transactions', 'org_ledger_lines'))",
        `NOT (al.action = 'db_update' AND al.table_name IN ('org_ledger_transactions', 'org_ledger_lines') AND EXISTS (
           SELECT 1 FROM org_audit_log a2 WHERE a2.org_id = al.org_id AND a2.table_name = 'org_ledger_transactions'
              AND a2.record_id = CASE WHEN al.table_name = 'org_ledger_lines' THEN (al.new_value::jsonb ->> 'transaction_id')::bigint ELSE al.record_id END
              AND a2.action IN ('create','update','delete') AND abs(extract(epoch FROM a2.occurred_at - al.occurred_at)) < 10))`];
      const params = [orgId];
      let p = 2;

      if (tableFilter) { conds.push(`al.table_name = $${p++}`); params.push(tableFilter); }
      if (actionFilter) {
        conds.push(actionFilter === 'update' ? "al.action IN ('update','db_update')" : actionFilter === 'delete' ? "al.action IN ('delete','db_delete')" : "al.action IN ('create','db_insert')");
      }
      if (Number.isInteger(userFilter) && userFilter > 0) { conds.push(`al.user_id = $${p++}`); params.push(userFilter); }
      if (from) { conds.push(`al.occurred_at >= $${p++}::date`); params.push(from); }
      if (to) { conds.push(`al.occurred_at < ($${p++}::date + 1)`); params.push(to); }
      if (q) {
        conds.push(`(al.table_name ILIKE $${p} OR al.record_id::text = $${p + 1} OR al.field_name ILIKE $${p} OR al.old_value ILIKE $${p} OR al.new_value ILIKE $${p} OR u.email ILIKE $${p})`);
        params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%', q);
        p += 2;
      }
      const where = conds.join(' AND ');

      const select = `SELECT al.id, al.action, al.table_name, al.record_id, al.field_name, al.old_value, al.new_value, al.occurred_at, u.email AS user_email
                        FROM org_audit_log al LEFT JOIN users u ON u.id = al.user_id
                       WHERE ${where} ORDER BY al.occurred_at DESC, al.id DESC`;

      if (isCsv) {
        const rowsRes = await pool.query(`${select} LIMIT ${MAX_EXPORT}`, params);
        const entries = expand(rowsRes.rows, await nameLookups(orgId, rowsRes.rows));
        const lines = [['When', 'User', 'Record', 'Event', 'Field', 'Before', 'After'].join(',')];
        for (const e of entries) {
          lines.push([new Date(e.occurred_at).toISOString(), e.user_email || '', e.table_name + ' #' + e.record_id, e.action, e.field_name || '', e.old_value, e.new_value].map(csvCell).join(','));
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-trail.csv"');
        return res.send(lines.join('\n'));
      }

      const [rowsRes, countRes, usersRes] = await Promise.all([
        pool.query(`${select} LIMIT $${p} OFFSET $${p + 1}`, [...params, limit, offset]),
        pool.query(`SELECT COUNT(*)::int AS total FROM org_audit_log al LEFT JOIN users u ON u.id = al.user_id WHERE ${where}`, params),
        pool.query('SELECT DISTINCT u.id, u.email FROM org_audit_log al JOIN users u ON u.id = al.user_id WHERE al.org_id = $1 ORDER BY u.email', [orgId]),
      ]);

      res.json({
        entries: expand(rowsRes.rows, await nameLookups(orgId, rowsRes.rows)),
        total: countRes.rows[0]?.total || 0,
        users: usersRes.rows,
      });
    } catch (e) {
      console.error('GET /audit-log:', e.message);
      res.status(500).json({ error: 'Could not load audit log' });
    }
  });
}

module.exports = { registerOrganizationalAuditLogRoutes };
