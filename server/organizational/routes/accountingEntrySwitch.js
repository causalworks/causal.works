'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { adminEntryState } = require('../middleware/requireAccountingAccess');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { sendPlainEmail } = require('../lib/sendPlainEmail');

const SHARED_DEMO_EMAIL = 'demo@causal.works';
const URL_BASE = '/api/organizational/orgs/:slug/my-accounting-entry';

function registerAccountingEntrySwitchRoutes(app, pool) {
  const adminOnly = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  async function details(req) {
    const st = await adminEntryState(pool, req.coopOrgUserId);
    const r = await pool.query(
      `SELECT ou.accounting_entry_enabled_at AS enabled_at, o.display_name, o.is_platform_demo
         FROM org_users ou JOIN coop_members o ON o.id = ou.org_id WHERE ou.id = $1`, [req.coopOrgUserId]);
    const row = r.rows[0] || {};
    const days = row.enabled_at ? Math.floor((Date.now() - new Date(row.enabled_at).getTime()) / 86400000) : null;
    return {
      enabled: st.entryOn, has_finance_members: st.hasFinance, can_enter_now: st.canEnter,
      enabled_at: row.enabled_at || null, days_on: st.entryOn ? days : null, review_due: st.entryOn && days != null && days >= 30,
      org_name: row.display_name,
      locked: !!row.is_platform_demo && String(req.user.email || '').toLowerCase() === SHARED_DEMO_EMAIL,
    };
  }

  async function notifyFinance(req, d, on, reason) {
    const fin = await pool.query(
      `SELECT u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.role IN ('finance', 'staff') ORDER BY u.email`, [req.orgId]);
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const subject = `${d.org_name}: ${req.user.email} switched ${on ? 'ON' : 'OFF'} accounting entry access`;
    const text = [
      `${req.user.email} (an admin of ${d.org_name}) switched ${on ? 'ON' : 'OFF'} their own access to enter and edit accounting transactions, at ${when}.`,
      on && reason ? `Reason given: ${reason}` : '',
      '',
      on ? 'While it is on, this admin can post, change and void accounting entries like a finance member. It is logged in the Activity Log.' : 'This admin can no longer enter or change accounting transactions.',
      'If this is not expected, please check with them.',
    ].filter((l, i) => l !== '' || i > 0).join('\n');
    const results = await Promise.all(fin.rows.map((r) => sendPlainEmail({ to: r.email, subject, text, fromName: d.org_name })));
    return { notified: fin.rows.length, sent: results.filter(Boolean).length };
  }

  app.get(URL_BASE, ...adminOnly, async (req, res) => {
    try { return res.json(await details(req)); }
    catch (e) { console.error('GET my-accounting-entry:', e.message); return res.status(500).json({ error: 'Could not load the setting' }); }
  });

  app.put(URL_BASE, ...adminOnly, async (req, res) => {
    const on = !!(req.body && req.body.enabled === true);
    const reason = req.body && req.body.reason ? String(req.body.reason).trim().slice(0, 300) : '';
    try {
      const before = await details(req);
      if (before.locked) return res.status(403).json({ error: 'This shared demo account keeps accounting entry on.' });
      if (before.enabled === on) return res.json(before);
      await pool.query(
        `UPDATE org_users SET accounting_entry_enabled = $2,
                accounting_entry_enabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
                accounting_entry_reminded_at = NULL
          WHERE id = $1`, [req.coopOrgUserId, on]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_users', recordId: req.coopOrgUserId,
        fields: diffFields({ accounting_entry_enabled: before.enabled }, { accounting_entry_enabled: on }, ['accounting_entry_enabled']),
        metadata: { ...reqMeta(req), reason: reason || null },
      });
      const after = await details(req);
      const note = before.has_finance_members ? await notifyFinance(req, after, on, reason) : { notified: 0, sent: 0 };
      return res.json({ ...after, notified: note.notified, emails_sent: note.sent });
    } catch (e) {
      console.error('PUT my-accounting-entry:', e.message);
      return res.status(500).json({ error: 'Could not change the setting' });
    }
  });

  app.post(`${URL_BASE}/keep`, ...adminOnly, async (req, res) => {
    try {
      const before = await details(req);
      if (!before.enabled) return res.status(400).json({ error: 'It is switched off.' });
      await pool.query(`UPDATE org_users SET accounting_entry_enabled_at = now(), accounting_entry_reminded_at = NULL WHERE id = $1`, [req.coopOrgUserId]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_users', recordId: req.coopOrgUserId,
        fields: diffFields({ accounting_entry_kept: false }, { accounting_entry_kept: true }, ['accounting_entry_kept']), metadata: reqMeta(req),
      });
      return res.json(await details(req));
    } catch (e) {
      console.error('POST my-accounting-entry/keep:', e.message);
      return res.status(500).json({ error: 'Could not renew' });
    }
  });
}

module.exports = { registerAccountingEntrySwitchRoutes };
