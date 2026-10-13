// auth.js — Causal authentication layer
// Password login + optional legacy magic verify (disabled by default).

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { enterUserContext } = require('./organizational/lib/orgContext');

const SESSION_COOKIE = 'causal_session';
const DEMO_SESSION_COOKIE = 'causal_demo_session';

let demoOrgSlug = 'demo-company';
async function refreshDemoOrgSlug(pool) {
  try {
    const r = await pool.query('SELECT slug FROM coop_members WHERE is_platform_demo = true LIMIT 1');
    if (r.rows[0] && r.rows[0].slug) demoOrgSlug = r.rows[0].slug;
  } catch (e) {  }
}

function inDemoContext(req) {
  const esc = demoOrgSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('/(?:o|orgs)/' + esc + '(?:[/?#]|$)');
  if (rx.test(String(req.originalUrl || req.url || ''))) return true;
  const ref = String(req.headers && req.headers.referer || '');
  try { return rx.test(new URL(ref).pathname); } catch (e) { return false; }
}

function sessionCookieNameFor(req) {
  const c = req.cookies || {};
  if (c[SESSION_COOKIE] && c[DEMO_SESSION_COOKIE]) return inDemoContext(req) ? DEMO_SESSION_COOKIE : SESSION_COOKIE;
  if (c[SESSION_COOKIE]) return SESSION_COOKIE;
  if (c[DEMO_SESSION_COOKIE]) return DEMO_SESSION_COOKIE;
  return SESSION_COOKIE;
}
function sessionTokenFor(req) {
  return (req.cookies || {})[sessionCookieNameFor(req)] || null;
}
const MAGIC_LINK_EXPIRY_MINUTES = 24 * 60;

const SESSION_IDLE_TIMEOUT_MINUTES = 30;
const SESSION_TOUCH_DEBOUNCE_MINUTES = 5;
const SESSION_UNATTENDED_TIMEOUT_MINUTES = 15;
const SESSION_COOKIE_MAX_AGE_DAYS = 30;

const PERSISTENT_SESSION_MINUTES = 30 * 24 * 60;

function persistentSessionEmails() {
  return String(process.env.PERSISTENT_SESSION_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function sessionExpiryFromNow() {
  return new Date(Date.now() + SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000);
}

function cookieExpiryFromNow() {
  return new Date(Date.now() + SESSION_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
}

function touchSession(pool, token, timeoutMinutes) {
  const minutes = Number(timeoutMinutes) > 0 ? Number(timeoutMinutes) : SESSION_IDLE_TIMEOUT_MINUTES;
  const debounce = Math.min(SESSION_TOUCH_DEBOUNCE_MINUTES, Math.floor(minutes / 2));
  const persistentDebounce = Math.max(SESSION_TOUCH_DEBOUNCE_MINUTES, 60);
  pool.query(
    `UPDATE sessions s
        SET expires_at = NOW() + ((CASE WHEN p.persistent THEN $5::text ELSE $2::text END) || ' minutes')::interval
       FROM (SELECT s2.token, (LOWER(u.email) = ANY($4::text[])) AS persistent
               FROM sessions s2 JOIN users u ON u.id = s2.user_id
              WHERE s2.token = $1) p
      WHERE s.token = p.token AND s.used = FALSE AND s.expires_at > NOW()
        AND s.expires_at <= NOW() + ((CASE WHEN p.persistent THEN $6::text ELSE $3::text END) || ' minutes')::interval`,
    [token, String(minutes), String(minutes - debounce), persistentSessionEmails(),
     String(PERSISTENT_SESSION_MINUTES), String(PERSISTENT_SESSION_MINUTES - persistentDebounce)]
  ).catch((err) => console.error('touchSession failed:', err.message));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function isEmailOnAllowList(pool, email) {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM allowed_emails) = 0
       OR EXISTS (SELECT 1 FROM allowed_emails WHERE LOWER(email) = LOWER($1))
       AS allowed`,
    [normalizeEmail(email)]
  );
  return !!(r.rows[0] && r.rows[0].allowed);
}

const LOGIN_GENERIC_ERROR = 'No account found for that email.';

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain || ''), BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash || !plain) return false;
  return bcrypt.compare(String(plain), String(hash));
}

async function markFirstLoginIfNeeded(pool, userId) {
  const firstLogin = await pool.query(
    `UPDATE users SET first_login_at = NOW() WHERE id = $1 AND first_login_at IS NULL RETURNING email`,
    [userId]
  );
  if (firstLogin.rows.length > 0) {
    sendFirstLoginAlertEmail(firstLogin.rows[0].email).catch((err) =>
      console.error('❌ first-login alert email failed:', err.message)
    );
  }
}

async function createSessionForUser(pool, userId, res) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`, [
    userId,
    sessionToken,
    sessionExpiryFromNow(),
  ]);
  const ut = await pool.query('SELECT user_type FROM users WHERE id = $1', [userId]);
  const cookieName = ut.rows[0] && ut.rows[0].user_type === 'demo' ? DEMO_SESSION_COOKIE : SESSION_COOKIE;
  res.cookie(cookieName, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: cookieExpiryFromNow(),
    sameSite: 'lax',
    path: '/',
  });

  await markFirstLoginIfNeeded(pool, userId);
}

async function sendFirstLoginAlertEmail(userEmail) {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: 'gyacc@pm.me',
      Subject: `First login: ${userEmail}`,
      TextBody: `${userEmail} just logged in for the first time.`,
      MessageStream: 'outbound',
    }),
  });
  const result = await response.json().catch(() => ({}));
  console.log('📧 Postmark first-login alert:', JSON.stringify(result));
}

async function sendPasswordResetEmail(email, rawToken) {
  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  const link = `${baseUrl}/auth/reset?token=${encodeURIComponent(rawToken)}`;
  const plain = `Click the link below to set your password. It expires in 1 hour.\n\n${link}\n`;
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: email,
      Subject: 'Set your Causal password',
      TextBody: plain,
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
          <p style="margin: 0 0 16px; line-height: 1.5;">Click the link below to set your password. It expires in 1 hour.</p>
          <p style="margin: 0; word-break: break-all;"><a href="${link}">${link}</a></p>
        </div>
      `,
      MessageStream: 'outbound',
    }),
  });
  const result = await response.json().catch(() => ({}));
  console.log('📧 Postmark reset:', JSON.stringify(result));
}

async function sendOrgInviteEmail(email, rawToken, orgDisplayName, role) {
  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  const link = `${baseUrl}/invite?token=${encodeURIComponent(rawToken)}`;
  const plain = `You've been invited to join ${orgDisplayName} as ${role}. This link expires in 7 days.\n\n${link}\n`;
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: email,
      Subject: `You've been invited to join ${orgDisplayName}`,
      TextBody: plain,
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
          <p style="margin: 0 0 16px; line-height: 1.5;">You've been invited to join <strong>${orgDisplayName}</strong> as <strong>${role}</strong>. This link expires in 7 days.</p>
          <p style="margin: 0; word-break: break-all;"><a href="${link}">${link}</a></p>
        </div>
      `,
      MessageStream: 'outbound',
    }),
  });
  const result = await response.json().catch(() => ({}));
  console.log('📧 Postmark org invite:', JSON.stringify(result));
}

function attachUserOptional(pool) {
  const query = `SELECT s.user_id, u.email, u.coop_access
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  return async (req, res, next) => {
    const token = sessionTokenFor(req);
    if (!token) {
      req.user = null;
      return next();
    }
    try {
      const r = await pool.query(query, [token]);
      if (r.rows.length === 0) {
        req.user = null;
        return next();
      }
      req.user = r.rows[0];
      req.user.id = req.user.user_id;
      req.user.coop_access = !!req.user.coop_access;
      enterUserContext(req.user.user_id);
      touchSession(pool, token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAuthPage(pool) {
  const fullQuery = `SELECT s.user_id, u.email, u.forwarding_address, u.causal_address, u.location_country, u.location_zip, u.location_city, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs,
              u.user_type, u.digest_frequency, u.primary_region, u.invest_tickers, u.coop_access,
              u.fund_holdings_flag, u.bank_payoff_seen_at, u.visited_financial_at, u.last_visit_at,
              u.onboarding_step, u.onboarding_completed_at, u.is_platform_admin
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fullQueryNoPrimary = `SELECT s.user_id, u.email, u.forwarding_address, u.causal_address, u.location_country, u.location_zip, u.location_city, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs,
              u.user_type, u.digest_frequency, u.invest_tickers, u.coop_access
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fallbackQuery = `SELECT s.user_id, u.email, u.forwarding_address, u.location_country, u.location_zip, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs, u.coop_access
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fallbackQueryNoCoopAccess = `SELECT s.user_id, u.email, u.forwarding_address, u.location_country, u.location_zip, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;

  return async (req, res, next) => {
    const token = sessionTokenFor(req);
    if (!token) return res.redirect('/login.html');

    const queries = [fullQuery, fullQueryNoPrimary, fallbackQuery, fallbackQueryNoCoopAccess];
    let sessionResult;
    let lastErr;
    for (const q of queries) {
      try {
        sessionResult = await pool.query(q, [token]);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const missingColumn = err.message && /column.*does not exist/i.test(err.message);
        if (!missingColumn) throw err;
      }
    }
    if (!sessionResult) {
      console.error('requireAuthPage: query failed:', lastErr && lastErr.message);
      return res.redirect('/login.html');
    }
    if (sessionResult.rows.length === 0) return res.redirect('/login.html');

    req.user = sessionResult.rows[0];
    req.user.id = req.user.id ?? req.user.user_id;
    req.user.user_id = req.user.user_id ?? req.user.id;
    if (req.user.user_type === undefined) req.user.user_type = 'individual_basic';
    if (req.user.digest_frequency === undefined) req.user.digest_frequency = 'off';
    if (!Array.isArray(req.user.primary_region)) req.user.primary_region = [];
    req.user.coop_access = !!req.user.coop_access;
    enterUserContext(req.user.user_id);
    touchSession(pool, token);
    logPageView(pool, req.user.user_id, req.path);
    next();
  };
}

function logPageView(pool, userId, path) {
  pool
    .query(`INSERT INTO page_views (user_id, path) VALUES ($1, $2)`, [userId, path])
    .catch((err) => console.warn('⚠️ page_views insert failed:', err.message));
}

// ── Generate a unique forwarding address ────────────────────────────────────
function generateForwardingAddress() {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `push-${suffix}@${CAUSAL_DOMAIN}`;
}

const CAUSAL_DOMAIN = 'inbound.causal.works';

function normalizeFriendlyLocalPart(input) {
  const raw = (input || '').toString().trim().toLowerCase();
  const deAccented = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return deAccented.replace(/[^a-z0-9]/g, '');
}

async function generateFriendlyAddress(pool, name) {
  const base = normalizeFriendlyLocalPart(name);
  if (base.length < 3) return null;
  for (let i = 0; i <= 99; i += 1) {
    const local = i === 0 ? base : `${base}${i}`;
    const address = `${local}@${CAUSAL_DOMAIN}`;
    const exists = await pool.query('SELECT 1 FROM user_addresses WHERE address = $1 LIMIT 1', [address]);
    if (exists.rows.length === 0) return address;
  }
  return null;
}

function isValidLocalPart(local) {
  return /^[a-z0-9]{3,30}$/.test(String(local || ''));
}

function isValidCausalAddress(address) {
  const s = String(address || '').toLowerCase().trim();
  const [local, domain] = s.split('@');
  if (domain !== CAUSAL_DOMAIN) return false;
  return isValidLocalPart(local);
}

function deriveHandle(email) {
  const prefix = (email || '').split('@')[0] || '';
  const handle = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
  return handle || 'user';
}

async function uniqueCausalAddress(pool, baseHandle) {
  let handle = baseHandle;
  let n = 0;
  for (;;) {
    const addr = `${handle}@${CAUSAL_DOMAIN}`;
    const r = await pool.query(
      'SELECT 1 FROM users WHERE causal_address = $1',
      [addr]
    );
    if (r.rows.length === 0) return addr;
    n += 1;
    handle = `${baseHandle}${n}`;
  }
}

// ── Register new user ────────────────────────────────────────────────────────
async function registerUser(pool, email, location, name, preferredForwardingAddress) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    if (user.forwarding_address) {
      await pool.query(
        `INSERT INTO user_addresses (user_id, address, is_primary)
         VALUES ($1, $2, true)
         ON CONFLICT (address) DO NOTHING`,
        [user.id, user.forwarding_address]
      ).catch(() => {});
    }
    if (!user.causal_address) {
      try {
        const baseHandle = deriveHandle(normalizedEmail);
        const causal_address = await uniqueCausalAddress(pool, baseHandle);
        await pool.query('UPDATE users SET causal_address = $1 WHERE id = $2', [causal_address, user.id]);
        user.causal_address = causal_address;
      } catch (err) {
        console.warn('⚠️ causal_address backfill failed:', err.message);
      }
    }
    return user;
  }

  let forwarding_address = null;
  const preferred = String(preferredForwardingAddress || '').toLowerCase().trim();
  if (isValidCausalAddress(preferred)) {
    const taken = await pool.query('SELECT 1 FROM user_addresses WHERE address = $1 LIMIT 1', [preferred]);
    if (taken.rows.length === 0) forwarding_address = preferred;
  }
  if (!forwarding_address) {
    const friendly = await generateFriendlyAddress(pool, name || deriveHandle(normalizedEmail));
    forwarding_address = friendly || generateForwardingAddress();
  }
  const result = await pool.query(
    `INSERT INTO users (email, forwarding_address, coop_access)
     VALUES ($1, $2, true) RETURNING *`,
    [normalizedEmail, forwarding_address]
  );
  const user = result.rows[0];

  await pool.query(`SELECT bootstrap_demo_org_membership($1)`, [user.id]).catch((err) => {
    console.warn('⚠️ Demo org bootstrap failed:', err.message);
  });

  try {
    await pool.query(
      `INSERT INTO user_addresses (user_id, address, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (address) DO NOTHING`,
      [user.id, forwarding_address]
    );
  } catch (err) {
    console.warn('⚠️ user_addresses insert failed:', err.message);
  }

  try {
    const baseHandle = deriveHandle(normalizedEmail);
    const causal_address = await uniqueCausalAddress(pool, baseHandle);
    await pool.query(
      'UPDATE users SET causal_address = $1 WHERE id = $2',
      [causal_address, user.id]
    );
    user.causal_address = causal_address;
  } catch (err) {
    console.warn('⚠️ causal_address assignment failed:', err.message);
  }

  return user;
}

// ── Create a magic link token ─────────────────────────────────────────────
async function createMagicToken(pool, user_id) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user_id, token, expires_at]
  );
  return token;
}

// ── Send magic link email ────────────────────────────────────────────────────
async function sendMagicLink(email, token) {
  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  const link = `${baseUrl}/auth/verify?token=${token}`;

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: email,
      Subject: 'Your Causal login link',
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #800020;">Welcome to Causal</h2>
          <p>Click below to log in. This link is good for ${MAGIC_LINK_EXPIRY_MINUTES % 60 === 0 ? MAGIC_LINK_EXPIRY_MINUTES / 60 + ' hours' : MAGIC_LINK_EXPIRY_MINUTES + ' minutes'}.</p>
          <a href="${link}" style="display:inline-block; margin: 24px 0; background:#800020; color:white; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:700;">
            Log in to Causal →
          </a>
        </div>
      `,
      MessageStream: 'outbound'
    })
  });

  const result = await response.json();
  console.log('📧 Postmark response:', JSON.stringify(result));
}

// ── Verify token, set session cookie ────────────────────────────────────────
async function verifyToken(pool, token, res) {
  const result = await pool.query(
    `SELECT s.*, u.email, u.forwarding_address
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) {
    const diag = await pool.query(
      `SELECT id, used, expires_at FROM sessions WHERE token = $1`,
      [token]
    ).catch(() => ({ rows: [] }));
    if (diag.rows.length === 0) {
      console.log('🔐 Magic link fail: token not found (len=' + (token && token.length) + ')');
    } else {
      const r = diag.rows[0];
      console.log('🔐 Magic link fail: token exists but used=' + r.used + ', expires_at=' + r.expires_at);
    }
    return null;
  }

  const session = result.rows[0];

  await pool.query('UPDATE sessions SET used = TRUE WHERE id = $1', [session.id]);

  const sessionToken = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [session.user_id, sessionToken, sessionExpiryFromNow()]
  );

  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: cookieExpiryFromNow(),
    sameSite: 'lax',
    path: '/'
  });

  await markFirstLoginIfNeeded(pool, session.user_id);

  return session;
}

// ── Session middleware ────────────────────────────────────────────────────────
function requireAuth(pool) {
  const fullQuery = `SELECT s.user_id, u.email, u.forwarding_address, u.causal_address, u.location_country, u.location_zip, u.location_city, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs,
              u.user_type, u.digest_frequency, u.primary_region, u.invest_tickers, u.coop_access,
              u.fund_holdings_flag, u.bank_payoff_seen_at, u.visited_financial_at, u.last_visit_at,
              u.onboarding_step, u.onboarding_completed_at, u.is_platform_admin
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fullQueryNoPrimary = `SELECT s.user_id, u.email, u.forwarding_address, u.causal_address, u.location_country, u.location_zip, u.location_city, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs,
              u.user_type, u.digest_frequency, u.invest_tickers, u.coop_access
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fallbackQuery = `SELECT s.user_id, u.email, u.forwarding_address, u.location_country, u.location_zip, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs, u.coop_access
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;
  const fallbackQueryNoCoopAccess = `SELECT s.user_id, u.email, u.forwarding_address, u.location_country, u.location_zip, u.created_at,
              u.brokerage, u.bank, u.turnaround_priorities, u.action_type_prefs
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`;

  return async (req, res, next) => {
    const token = sessionTokenFor(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const queries = [fullQuery, fullQueryNoPrimary, fallbackQuery, fallbackQueryNoCoopAccess];
    let sessionResult;
    let lastErr;
    for (const q of queries) {
      try {
        sessionResult = await pool.query(q, [token]);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const missingColumn = err.message && /column.*does not exist/i.test(err.message);
        if (!missingColumn) return next(err);
      }
    }
    if (!sessionResult) {
      console.error('requireAuth: all query variants failed:', lastErr && lastErr.message);
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (sessionResult.rows.length === 0) return res.status(401).json({ error: 'Unauthorized' });

    req.user = sessionResult.rows[0];
    req.user.id = req.user.id ?? req.user.user_id;
    req.user.user_id = req.user.user_id ?? req.user.id;
    if (req.user.user_type === undefined) req.user.user_type = 'individual_basic';
    if (req.user.digest_frequency === undefined) req.user.digest_frequency = 'off';
    if (req.user.onboarding_step === undefined) req.user.onboarding_step = 'bank';
    if (!Array.isArray(req.user.primary_region)) req.user.primary_region = [];
    req.user.coop_access = !!req.user.coop_access;
    enterUserContext(req.user.user_id);
    touchSession(pool, token);
    next();
  };
}

// ── Send digest email ────────────────────────────────────────────────────────
async function sendDigestEmail(email, count) {
  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  const requestedTo = String(email || '').trim().toLowerCase();
  const loopyDigestRecipient = String(process.env.LOOPY_DIGEST_RECIPIENT || 'gyacc@pm.me').trim();
  const actualTo = requestedTo === 'loopy@causal.works' && loopyDigestRecipient
    ? loopyDigestRecipient
    : String(email || '').trim();
  const gitReminderHtml = requestedTo === 'loopy@causal.works'
    ? `
          <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;">
          <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px;">
            <div style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:8px;">Daily VPS git reminder</div>
            <ol style="margin:0; padding-left:18px; color:#334155; font-size:12px; line-height:1.6;">
              <li><code style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">cd ~/causal-app</code></li>
              <li><code style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">git checkout &lt;default-branch&gt; && git pull origin &lt;default-branch&gt;</code></li>
              <li><code style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">git checkout -b &lt;feature-branch&gt;</code></li>
              <li>After edits: <code style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">git add -A && git commit -m "..." && git push -u origin &lt;feature-branch&gt;</code></li>
              <li>After merge/deploy: follow your runbook to sync branch and restart the app service.</li>
            </ol>
          </div>
      `
    : '';
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: actualTo,
      Subject: `${count} action${count === 1 ? '' : 's'} waiting in Causal`,
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #800020;">Causal</h2>
          <p style="font-size: 16px; color: #1a1a1a;">You have <strong>${count} action${count === 1 ? '' : 's'}</strong> waiting — including any time-sensitive windows closing soon.</p>
          <a href="${baseUrl}/app.html#act" style="display:inline-block; margin: 24px 0; background:#800020; color:white; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:700;">
            Open Actions →
          </a>
          ${gitReminderHtml}
          <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;">
          <p style="color:#9ca3af; font-size:12px;">You're receiving this because you set up a Causal digest. <a href="${baseUrl}/settings.html" style="color:#800020;">Change frequency or turn off →</a></p>
        </div>
      `,
      MessageStream: 'outbound'
    })
  });
  const result = await response.json();
  console.log(`📧 Digest sent to ${actualTo} (requested ${requestedTo}):`, result.Message || result.ErrorCode);
}

module.exports = {
  registerUser,
  createMagicToken,
  sendMagicLink,
  sendDigestEmail,
  verifyToken,
  requireAuth,
  requireAuthPage,
  attachUserOptional,
  createSessionForUser,
  touchSession,
  hashPassword,
  verifyPassword,
  sendPasswordResetEmail,
  sendOrgInviteEmail,
  normalizeEmail,
  isEmailOnAllowList,
  logPageView,
  LOGIN_GENERIC_ERROR,
  SESSION_COOKIE,
  DEMO_SESSION_COOKIE,
  sessionTokenFor,
  sessionCookieNameFor,
  refreshDemoOrgSlug,
  CAUSAL_DOMAIN,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_UNATTENDED_TIMEOUT_MINUTES,
  persistentSessionEmails,
};