'use strict';

const crypto = require('crypto');
const { registerUser, hashPassword, createSessionForUser, attachUserOptional, requireAuth } = require('../../auth');
const { enterOrgContext } = require('../lib/orgContext');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Loads a pending (unused, unexpired) invite by raw token, joined to its org.
 * org_invites has FORCE RLS keyed on app.current_org_id, which isn't known yet at this point
 * (that's what this lookup exists to resolve) -- routed through a SECURITY DEFINER function
 * for the same bootstrapping reason as resolve_member_org_id_and_role() (migration 150). Safe
 * because the raw token is the credential, same trust model as a password-reset token.
 */
async function loadPendingInvite(pool, rawToken) {
  const tokenHash = hashToken(rawToken);
  const r = await pool.query(`SELECT * FROM resolve_invite_by_token($1)`, [tokenHash]);
  return r.rows[0] || null;
}

/**
 * Inserts the accepting user's org_users row (or finds the existing one, if they were already
 * a member) and, for a 'program'-role invite, materializes org_invites.program_ids -- the
 * intended grants captured at invite time (migration 258) -- into real org_program_grants rows
 * now that an org_user_id exists to attach them to. Caller must enterOrgContext(orgId) first.
 */
async function acceptInviteMembership(pool, invite, userId) {
  const memberR = await pool.query(
    `INSERT INTO org_users (org_id, user_id, role, invited_by)
     VALUES ($1, $2, $3::org_member_role, (SELECT invited_by FROM org_invites WHERE id = $4))
     ON CONFLICT (org_id, user_id) DO UPDATE SET org_id = EXCLUDED.org_id
     RETURNING id`,
    [invite.org_id, userId, invite.role, invite.id]
  );
  const orgUserId = memberR.rows[0].id;

  if (invite.role === 'program' && Array.isArray(invite.program_ids) && invite.program_ids.length > 0) {
    await pool.query(
      `INSERT INTO org_program_grants (org_id, org_user_id, program_id)
       SELECT $1, $2, pid FROM UNNEST($3::int[]) AS pid
       ON CONFLICT (org_user_id, program_id) DO NOTHING`,
      [invite.org_id, orgUserId, invite.program_ids]
    );
  }
}

function registerOrgInviteAcceptRoutes(app, pool) {
  const optionalAuth = attachUserOptional(pool);
  const auth = requireAuth(pool);

  // GET /api/organizational/invites/mine — pending invites for the logged-in user's own
  // email. Exists for the landing page's org list (each pending invite renders as a row
  // there, "Review invite →") -- separate from GET /invites/:token above because there is no
  // raw token to hand the browser here (only token_hash is ever stored); this is the
  // authenticated-by-id counterpart, safe because session auth already proves identity.
  app.get('/api/organizational/invites/mine', auth, async (req, res) => {
    try {
      // Bootstrapping lookup (no org id known yet across potentially multiple pending invites
      // for different orgs) -- see resolve_invite_by_token's comment above.
      const r = await pool.query(`SELECT * FROM resolve_pending_invites_for_email($1)`, [req.user.email]);
      return res.json({ invites: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/invites/mine:', e.message);
      return res.status(500).json({ error: 'Could not load your invites' });
    }
  });

  // POST /api/organizational/invites/mine/:id/accept — same effect as the token-based
  // POST /invites/:token/accept above for the "logged in, matching email" case (no password
  // needed, no account created), just reached by invite id instead of a raw token.
  app.post('/api/organizational/invites/mine/:id/accept', auth, async (req, res) => {
    const inviteId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(inviteId) || inviteId < 1) return res.status(400).json({ error: 'invalid invite id' });
    try {
      const r = await pool.query(`SELECT * FROM resolve_invite_by_id($1)`, [inviteId]);
      if (!r.rows.length) return res.status(404).json({ error: 'This invite is invalid, expired, or already used.' });
      const invite = r.rows[0];
      if (String(req.user.email).toLowerCase() !== String(invite.email).toLowerCase()) {
        return res.status(403).json({ error: 'This invite is for a different email address than the one you\'re logged in as.' });
      }

      enterOrgContext(invite.org_id);
      await acceptInviteMembership(pool, invite, req.user.user_id ?? req.user.id);
      await pool.query('UPDATE users SET coop_access = TRUE WHERE id = $1', [req.user.user_id ?? req.user.id]);
      await pool.query('UPDATE org_invites SET used = TRUE WHERE id = $1', [invite.id]);

      return res.json({ ok: true, org_slug: invite.org_slug });
    } catch (e) {
      console.error('POST /api/organizational/invites/mine/:id/accept:', e.message);
      return res.status(500).json({ error: 'Could not accept invite' });
    }
  });

  // GET /api/organizational/invites/:token — public. Token is the credential (same pattern as password reset).
  app.get('/api/organizational/invites/:token', async (req, res) => {
    const rawToken = String(req.params.token || '').trim();
    try {
      const invite = await loadPendingInvite(pool, rawToken);
      if (!invite) {
        return res.status(404).json({ valid: false, error: 'This invite link is invalid, expired, or already used.' });
      }
      const existingR = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [invite.email]);
      return res.json({
        valid: true,
        email: invite.email,
        role: invite.role,
        program_ids: invite.program_ids || [],
        org_slug: invite.org_slug,
        org_display_name: invite.org_display_name,
        account_exists: existingR.rows.length > 0,
      });
    } catch (e) {
      console.error('GET /api/organizational/invites/:token:', e.message);
      return res.status(500).json({ valid: false, error: 'Could not load invite' });
    }
  });

  // POST /api/organizational/invites/:token/accept — soft auth.
  // Logged in + matching email -> just adds membership. Not logged in + new email -> creates account + session. Not logged in + existing email -> 409, ask them to log in first.
  app.post('/api/organizational/invites/:token/accept', optionalAuth, async (req, res) => {
    const rawToken = String(req.params.token || '').trim();
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';

    try {
      const invite = await loadPendingInvite(pool, rawToken);
      if (!invite) {
        return res.status(404).json({ error: 'This invite link is invalid, expired, or already used.' });
      }

      let userId;

      if (req.user) {
        if (String(req.user.email).toLowerCase() !== String(invite.email).toLowerCase()) {
          return res.status(403).json({
            error: 'account_mismatch',
            message: `This invite is for ${invite.email}, but you're logged in as ${req.user.email}. Log out and try again.`,
          });
        }
        userId = req.user.id;
      } else {
        const existingR = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [invite.email]);
        if (existingR.rows.length > 0) {
          return res.status(409).json({
            error: 'account_exists',
            message: 'An account already exists for this email. Log in, then reopen this invite link to finish joining.',
          });
        }
        if (!password || password.length < 8) {
          return res.status(400).json({ error: 'A password of at least 8 characters is required.' });
        }
        const newUser = await registerUser(pool, invite.email, null, null, null);
        const passwordHash = await hashPassword(password);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, newUser.id]);
        userId = newUser.id;
        await createSessionForUser(pool, userId, res);
      }

      enterOrgContext(invite.org_id);
      await acceptInviteMembership(pool, invite, userId);
      await pool.query('UPDATE users SET coop_access = TRUE WHERE id = $1', [userId]);
      await pool.query('UPDATE org_invites SET used = TRUE WHERE id = $1', [invite.id]);

      return res.json({ ok: true, org_slug: invite.org_slug });
    } catch (e) {
      console.error('POST /api/organizational/invites/:token/accept:', e.message);
      return res.status(500).json({ error: 'Could not accept invite' });
    }
  });
}

module.exports = { registerOrgInviteAcceptRoutes };
