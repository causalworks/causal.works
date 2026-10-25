'use strict';

// Assistant seat and mode settings: admins grant, renew and revoke the seat and set the workspace default; anyone may set their own mode.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const seat = require('../lib/assistantSeat');
const { logAudit, reqMeta } = require('../lib/auditLog');

function registerAssistantSettingsRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const admin = requireOrgRole('admin');
  const uid = (req) => req.user.user_id ?? req.user.id;
  const base = '/api/organizational/orgs/:slug/assistant';

  async function send(req, res, out, label, detail) {
    if (out.httpStatus < 400) {
      logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_assistant_seats', recordId: req.orgId, fields: [{ fieldName: label, oldValue: null, newValue: detail }], metadata: reqMeta(req) }).catch(() => {});
    }
    res.status(out.httpStatus).json(out.body);
  }

  app.get(base, ...orgAuth, async (req, res) => {
    try {
      const live = await seat.liveSeat(pool, req.orgId);
      const s = await pool.query('SELECT assistant_mode FROM org_settings WHERE org_id = $1', [req.orgId]);
      res.json({
        workspace_mode: s.rows[0] ? s.rows[0].assistant_mode : 'off',
        my_mode: await seat.effectiveMode(pool, req.orgId, uid(req)),
        seat: live ? { ends_at: live.ends_at, reason: live.reason, can: 'propose', cannot: 'post' } : null,
      });
    } catch (e) {
      console.error('GET assistant:', e.message);
      res.status(500).json({ error: 'Could not load assistant settings' });
    }
  });

  app.put(`${base}/mode`, ...orgAuth, admin, async (req, res) => {
    try { await send(req, res, await seat.setWorkspaceMode(pool, req.orgId, req.body && req.body.mode), 'Assistant mode', String(req.body && req.body.mode)); }
    catch (e) { console.error('PUT assistant mode:', e.message); res.status(500).json({ error: 'Could not save' }); }
  });

  app.put(`${base}/my-mode`, ...orgAuth, async (req, res) => {
    try {
      const mode = req.body && req.body.mode !== undefined ? req.body.mode : undefined;
      if (mode === undefined) return res.status(400).json({ error: 'mode is required (or null to follow the workspace)' });
      res.status(200).json((await seat.setUserMode(pool, req.orgId, uid(req), mode)).body);
    } catch (e) { console.error('PUT assistant my-mode:', e.message); res.status(500).json({ error: 'Could not save' }); }
  });

  app.post(`${base}/seat`, ...orgAuth, admin, async (req, res) => {
    try { await send(req, res, await seat.grantSeat(pool, { orgId: req.orgId, userId: uid(req), reason: req.body && req.body.reason, days: (req.body && req.body.days) ?? 30 }), 'Assistant seat', 'granted'); }
    catch (e) { console.error('POST assistant seat:', e.message); res.status(500).json({ error: 'Could not grant the seat' }); }
  });

  app.post(`${base}/seat/renew`, ...orgAuth, admin, async (req, res) => {
    try { await send(req, res, await seat.renewSeat(pool, { orgId: req.orgId, days: (req.body && req.body.days) ?? 30 }), 'Assistant seat', 'renewed'); }
    catch (e) { console.error('POST assistant seat renew:', e.message); res.status(500).json({ error: 'Could not renew the seat' }); }
  });

  app.delete(`${base}/seat`, ...orgAuth, admin, async (req, res) => {
    try { await send(req, res, await seat.revokeSeat(pool, { orgId: req.orgId, userId: uid(req) }), 'Assistant seat', 'revoked'); }
    catch (e) { console.error('DELETE assistant seat:', e.message); res.status(500).json({ error: 'Could not revoke the seat' }); }
  });
}

module.exports = { registerAssistantSettingsRoutes };
