'use strict';

// Public, unauthenticated gateway for link shares to external (non-Solid) recipients.
// The recipient proves they control the mailbox the share was created for (emailed 6-digit
// code) before Causal streams the document out of the org's pod. The pod copy itself is
// private; this route is the only way to read it, so revoke/expiry take effect on the very
// next request instead of after the pod copy is deleted.

const crypto = require('crypto');
const { enterOrgContext } = require('../lib/orgContext');
const { getAuthenticatedFetchForOrg } = require('../lib/podCredentialStore');

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const VIEW_TTL_MS = 30 * 60 * 1000;
const INLINE_TYPES = /^(application\/pdf|image\/(png|jpeg|gif|webp))(;|$)/i;

function signingKey() {
  const raw = process.env.POD_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) throw new Error('POD_CREDENTIAL_ENCRYPTION_KEY is not set');
  return crypto.createHmac('sha256', Buffer.from(raw, 'hex')).update('pod-share-v1').digest();
}

function hmac(text) {
  return crypto.createHmac('sha256', signingKey()).update(text).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function codeHash(permissionId, code) {
  return hmac(`code:${permissionId}:${code}`);
}

function viewCookieName(permissionId) {
  return `pod_share_${permissionId}`;
}

function issueViewCookie(res, token, permissionId) {
  const exp = Date.now() + VIEW_TTL_MS;
  const value = `${exp}.${hmac(`view:${permissionId}:${exp}`)}`;
  res.cookie(viewCookieName(permissionId), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/share/${token}`,
    maxAge: VIEW_TTL_MS,
  });
}

function hasValidViewCookie(req, permissionId) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${viewCookieName(permissionId)}=`));
  if (!raw) return false;
  const [expStr, sig] = decodeURIComponent(raw.slice(raw.indexOf('=') + 1)).split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  return safeEqual(sig, hmac(`view:${permissionId}:${exp}`));
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

async function sendCodeEmail(to, code, orgName) {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: to,
      Subject: `Your verification code: ${code}`,
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <p>${orgName} shared a document with you. Enter this code on the page you opened to view it:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px;">${code}</p>
          <p>The code works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
        </div>
      `,
      MessageStream: 'outbound',
    }),
  });
  if (!response.ok) throw new Error(`Postmark responded ${response.status}`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Looks up a live (not revoked, not expired) share by token and enters its org's RLS context
// for the rest of this request. Returns null for anything unusable, deliberately without
// saying why.
async function loadLiveShare(pool, token) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const r = await pool.query('SELECT * FROM resolve_pod_share($1)', [token]);
  const share = r.rows[0];
  if (!share || share.revoked_at) return null;
  if (share.expires_at && new Date(share.expires_at) <= new Date()) return null;
  enterOrgContext(share.org_id);
  return share;
}

function registerPodShareGatewayRoutes(app, pool) {
  const pageFile = require('path').join(__dirname, '../../../public/shared/share-verify.html');

  app.get('/share/:token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.sendFile(pageFile);
  });

  app.get('/share/:token/info', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const share = await loadLiveShare(pool, req.params.token);
      if (!share) return res.status(404).json({ error: 'This link is no longer active.' });
      const org = await pool.query('SELECT display_name FROM coop_members WHERE id = $1', [share.org_id]);
      return res.json({
        org_name: org.rows[0]?.display_name || 'An organization',
        masked_email: maskEmail(share.recipient_label),
        verified: hasValidViewCookie(req, share.permission_id),
      });
    } catch (e) {
      console.error('GET /share/:token/info:', e.message);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  app.post('/api/share/:token/request-code', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const share = await loadLiveShare(pool, req.params.token);
      if (!share) return res.status(404).json({ error: 'This link is no longer active.' });

      const recent = await pool.query(
        `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hourly,
                max(created_at) AS latest
           FROM pod_share_challenges WHERE permission_id = $1`,
        [share.permission_id]
      );
      const { hourly, latest } = recent.rows[0];
      if (latest && Date.now() - new Date(latest).getTime() < CODE_COOLDOWN_MS) {
        return res.status(429).json({ error: 'A code was just sent. Wait a minute before asking for another.' });
      }
      if (hourly >= MAX_CODES_PER_HOUR) {
        return res.status(429).json({ error: 'Too many codes requested. Try again later.' });
      }

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await pool.query(
        `INSERT INTO pod_share_challenges (org_id, permission_id, code_hash, expires_at, requested_ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [share.org_id, share.permission_id, codeHash(share.permission_id, code), new Date(Date.now() + CODE_TTL_MS), req.ip]
      );
      const org = await pool.query('SELECT display_name FROM coop_members WHERE id = $1', [share.org_id]);
      await sendCodeEmail(share.recipient_label, code, escapeHtml(org.rows[0]?.display_name || 'An organization'));
      return res.json({ sent: true });
    } catch (e) {
      console.error('POST /api/share/:token/request-code:', e.message);
      return res.status(500).json({ error: 'Could not send the code. Try again in a moment.' });
    }
  });

  app.post('/api/share/:token/verify', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const share = await loadLiveShare(pool, req.params.token);
      if (!share) return res.status(404).json({ error: 'This link is no longer active.' });

      const code = String((req.body && req.body.code) || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code.' });

      const c = await pool.query(
        `SELECT id, code_hash, attempts FROM pod_share_challenges
          WHERE permission_id = $1 AND verified_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [share.permission_id]
      );
      const challenge = c.rows[0];
      if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
        return res.status(400).json({ error: 'That code has expired. Ask for a new one.' });
      }

      await pool.query('UPDATE pod_share_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
      if (!safeEqual(challenge.code_hash, codeHash(share.permission_id, code))) {
        return res.status(400).json({ error: 'That code is not right.' });
      }

      await pool.query('UPDATE pod_share_challenges SET verified_at = now() WHERE id = $1', [challenge.id]);
      issueViewCookie(res, req.params.token, share.permission_id);
      return res.json({ verified: true });
    } catch (e) {
      console.error('POST /api/share/:token/verify:', e.message);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  app.get('/share/:token/file', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const share = await loadLiveShare(pool, req.params.token);
      if (!share) return res.status(404).send('This link is no longer active.');
      if (!hasValidViewCookie(req, share.permission_id)) {
        return res.redirect(302, `/share/${req.params.token}`);
      }

      const doc = await pool.query(
        `SELECT d.original_filename FROM org_documents d
           JOIN pod_access_permissions p ON p.org_document_id = d.id
          WHERE p.id = $1`,
        [share.permission_id]
      );
      const filename = (doc.rows[0]?.original_filename || 'document').replace(/[^\w.\- ]+/g, '_');

      const authFetch = await getAuthenticatedFetchForOrg(pool, share.org_id, share.org_slug);
      const podRes = await authFetch(share.share_resource_url, { method: 'GET' });
      if (!podRes.ok) return res.status(502).send('The document could not be loaded right now.');

      const type = podRes.headers.get('content-type') || 'application/octet-stream';
      res.set({
        'Content-Type': type,
        'Content-Disposition': `${INLINE_TYPES.test(type) ? 'inline' : 'attachment'}; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      });
      return res.send(Buffer.from(await podRes.arrayBuffer()));
    } catch (e) {
      console.error('GET /share/:token/file:', e.message);
      return res.status(500).send('Something went wrong.');
    }
  });
}

module.exports = { registerPodShareGatewayRoutes };
