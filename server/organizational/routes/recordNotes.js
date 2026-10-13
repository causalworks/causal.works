'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter, hasDonorAccess, hasFunderAccess } = require('../middleware/requireAccountingAccess');
const { logAudit } = require('../lib/auditLog');

const TYPES = {
  bill: { table: 'org_bills' },
  invoice: { table: 'org_invoices' },
  ledger_transaction: { table: 'org_ledger_transactions' },
  contact: { table: 'org_constituents' },
};

function registerRecordNotesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const writer = requireAccountingWriter(pool);

  async function resolve(req, res) {
    const type = TYPES[req.params.type];
    const id = Number.parseInt(String(req.params.id), 10);
    if (!type || !Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'Invalid record' }); return null; }
    const r = await pool.query(`SELECT id${req.params.type === 'contact' ? ', kind' : ''} FROM ${type.table} WHERE id = $1 AND org_id = $2`, [id, req.orgId]);
    if (!r.rows.length) { res.status(404).json({ error: 'Record not found' }); return null; }
    if (req.params.type === 'contact' && !(r.rows[0].kind === 'organization' ? hasFunderAccess(req) : hasDonorAccess(req))) {
      res.status(403).json({ code: 'no_access', error: 'Notes and history on contacts are for people with access to donor details.' });
      return null;
    }
    return { type: req.params.type, table: type.table, id };
  }

  app.get('/api/organizational/orgs/:slug/record-notes/:type/:id', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const rec = await resolve(req, res);
      if (!rec) return;
      const notes = await pool.query(
        `SELECT n.id, n.body, n.created_at, u.email AS by_email
           FROM org_record_notes n LEFT JOIN users u ON u.id = n.created_by
          WHERE n.org_id = $1 AND n.record_type = $2 AND n.record_id = $3 ORDER BY n.created_at, n.id`,
        [req.orgId, rec.type, rec.id]);
      const a = await pool.query(
        `SELECT a.occurred_at, a.action, a.field_name, a.old_value, a.new_value, a.metadata, u.email AS by_email
           FROM org_audit_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.org_id = $1 AND a.table_name = $2 AND a.record_id = $3 ORDER BY a.occurred_at, a.id`,
        [req.orgId, rec.table, rec.id]);
      const history = [];
      for (const row of a.rows) {
        const key = new Date(row.occurred_at).toISOString() + '|' + (row.by_email || '');
        let g = history[history.length - 1];
        if (!g || g.key !== key) {
          g = { key, at: row.occurred_at, by: row.by_email, reason: row.metadata && row.metadata.reason ? row.metadata.reason : null, created: false, changes: [] };
          history.push(g);
        }
        if (row.action === 'create') g.created = true;
        else if (row.field_name) g.changes.push({ field: row.field_name, from: row.old_value, to: row.new_value });
      }
      return res.json({
        notes: notes.rows.map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: n.by_email })),
        history: history.map(({ at, by, reason, created, changes }) => ({ at, by, reason, created, changes })),
      });
    } catch (e) {
      console.error('GET record-notes:', e.message);
      return res.status(500).json({ error: 'Could not load history and notes' });
    }
  });

  app.post('/api/organizational/orgs/:slug/record-notes/:type/:id', ...orgAuth, writer, async (req, res) => {
    const body = req.body && req.body.body != null ? String(req.body.body).trim() : '';
    if (!body) return res.status(400).json({ error: 'The note is empty.' });
    if (body.length > 4000) return res.status(400).json({ error: 'The note is too long (4,000 characters at most).' });
    try {
      const rec = await resolve(req, res);
      if (!rec) return;
      const userId = req.user.user_id ?? req.user.id;
      const r = await pool.query(
        `INSERT INTO org_record_notes (org_id, record_type, record_id, body, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.orgId, rec.type, rec.id, body, userId]);
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST record-notes:', e.message);
      return res.status(500).json({ error: 'Could not save the note' });
    }
  });
}

module.exports = { registerRecordNotesRoutes };
