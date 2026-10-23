'use strict';

// Workspace settings for public pages: the optional challenge check (verify address, site key, secret stored encrypted).

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { encryptCredential } = require('../lib/podCredentialCrypto');
const { logAudit } = require('../lib/auditLog');
const { publicHttpsProblem } = require('../lib/publicHost');

function registerPublicSettingsRoutes(app, pool) {
  const auth = requireAuth(pool);
  const admin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole(['admin'])];
  const P = '/api/organizational/orgs/:slug/public-settings';

  app.get(P, ...admin, async (req, res) => {
    try {
      const r = await pool.query('SELECT challenge_verify_url, challenge_site_key, challenge_secret_enc IS NOT NULL AS has_secret, updated_at FROM org_public_settings WHERE org_id = $1', [req.orgId]);
      return res.json({ settings: r.rows[0] || { challenge_verify_url: null, challenge_site_key: null, has_secret: false } });
    } catch (e) {
      console.error('GET /public-settings:', e.message);
      return res.status(500).json({ error: 'Could not load the public page settings' });
    }
  });

  app.put(P, ...admin, async (req, res) => {
    const b = req.body || {};
    const url = b.challenge_verify_url ? String(b.challenge_verify_url).trim() : null;
    if (url && !/^https:\/\/[^\s]+$/.test(url)) return res.status(400).json({ error: 'The verify address must start with https://.' });
    const hostProblem = url ? await publicHttpsProblem(url) : null;
    if (hostProblem) return res.status(400).json({ error: hostProblem });
    try {
      const cur = (await pool.query('SELECT * FROM org_public_settings WHERE org_id = $1', [req.orgId])).rows[0] || {};
      let enc = { encrypted: cur.challenge_secret_enc || null, iv: cur.challenge_secret_iv || null, authTag: cur.challenge_secret_tag || null };
      if (b.challenge_secret !== undefined) enc = b.challenge_secret ? encryptCredential(String(b.challenge_secret)) : { encrypted: null, iv: null, authTag: null };
      if (url && !enc.encrypted) return res.status(400).json({ error: 'Enter the secret that goes with the verify address.' });
      await pool.query(
        `INSERT INTO org_public_settings (org_id, challenge_verify_url, challenge_site_key, challenge_secret_enc, challenge_secret_iv, challenge_secret_tag, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (org_id) DO UPDATE SET challenge_verify_url = EXCLUDED.challenge_verify_url, challenge_site_key = EXCLUDED.challenge_site_key,
           challenge_secret_enc = EXCLUDED.challenge_secret_enc, challenge_secret_iv = EXCLUDED.challenge_secret_iv, challenge_secret_tag = EXCLUDED.challenge_secret_tag,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [req.orgId, url, b.challenge_site_key ? String(b.challenge_site_key).trim() : null, enc.encrypted, enc.iv, enc.authTag, req.user.user_id ?? req.user.id]);
      await logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_public_settings', recordId: req.orgId,
        fields: [{ fieldName: 'challenge check', oldValue: cur.challenge_verify_url ? 'on' : 'off', newValue: url ? 'on' : 'off' }] });
      return res.json({ saved: true, has_secret: !!enc.encrypted });
    } catch (e) {
      console.error('PUT /public-settings:', e.message);
      return res.status(500).json({ error: 'Could not save the public page settings' });
    }
  });
}

module.exports = { registerPublicSettingsRoutes };
