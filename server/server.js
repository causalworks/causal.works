require('dotenv').config();
const { extractAction } = require('./ai/ai-service');
const { scheduleTimingJob } = require('./jobs/timing-job');
const { schedulePermittingJob } = require('./jobs/permitting-job');
const { scheduleEipJob } = require('./jobs/eip-oil-gas-watch-job');
const { scheduleInboundDebugCleanup } = require('./jobs/inbound-debug-cleanup');
const { schedulePurgeDeletedOrgs } = require('./jobs/purge-deleted-orgs');
const { scheduleExpirePodPermissions } = require('./jobs/expire-pod-permissions');
const { scheduleProcessAcrOutbox } = require('./jobs/process-acr-outbox');
const { schedulePurgeSyncedDocuments } = require('./jobs/purge-synced-documents');
const { scheduleRecurringScheduleJob } = require('./jobs/recurring-schedule-job');
const {
  registerUser,
  createMagicToken,
  sendMagicLink,
  sendDigestEmail,
  verifyToken,
  requireAuth,
  requireAuthPage,
  createSessionForUser,
  hashPassword,
  verifyPassword,
  sendPasswordResetEmail,
  normalizeEmail,
  isEmailOnAllowList,
  LOGIN_GENERIC_ERROR,
  CAUSAL_DOMAIN,
  logPageView,
  SESSION_COOKIE,
} = require('./auth');
const { mountOrganizationalRoutes } = require('./organizational');
const { mountIndividualRoutes } = require('./individual');
const { handleOrganizationalXeroCallback } = require('./organizational/xero/callback-handler');
const { handlePlaidWebhook } = require('./organizational/routes/plaid');
const { requireOrganizationalAccessPage } = require('./organizational/middleware/requireOrganizationalAccess');
const { requirePlatformAdminPage } = require('./organizational/middleware/requirePlatformAdmin');
const { requestContextMiddleware } = require('./organizational/lib/orgContext');
const { createInvitedSampleOrg } = require('./organizational/lib/createInvitedSampleOrg');
const { wrapPoolWithOrgScoping } = require('./organizational/lib/scopedPool');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { pickBestUrl, pickTopUrls, pickSourceUrlFromEmailHtml, pickSourceUrlFromText, pickSourceUrlFromEmailPreferringPath, shouldSkipUrl } = require('./utils/link-picker');
const {
  stripDiacritics,
  inferOrgNameFromLocalPart,
  resolveActiveOrgBySenderDomain,
  resolveOrgForInboundUserSource,
  normalizeSenderDomainsInput,
  assertSenderDomainsUnclaimed,
  mergeSenderDomainsForOrg,
  orgDisplayNameFromSenderPool,
  displayLabelFromEmail,
} = require('./org-resolution');
const { activateOrgInCausal, normalizeOrgKey } = require('./individual/utils');
const { computeBoundaryUrgencyScore } = require('./data/planetary-boundaries');
const { clientIp } = require('./utils/clientIp');
const { BANK_FLAG_DATA } = require('./data/bank-flag-data');
const { fetchUSReps, committeesToTurnarounds } = require('./rep/us-reps');
const { matchReps } = require('./rep/rep-matcher');

const app = express();
// Must be first: gives every request its own isolated AsyncLocalStorage
// store for RLS org/user context (server/organizational/lib/orgContext.js)
// before any other middleware or route can call enterOrgContext()/
// enterUserContext(). See that file for why this replaced an earlier
// enterWith()-based design that leaked context between concurrent requests.
app.use(requestContextMiddleware);
app.use(cookieParser());
// Postmark inbound payloads can be large (HTML bodies, headers). Increase limits.
// verify: stashes the exact raw request bytes on req.rawBody alongside the parsed body --
// passive observer, doesn't change parsing for any existing route. Needed by the Plaid webhook
// handler, which must hash-check the raw body against a signed claim (Plaid's own documented
// webhook verification algorithm) -- JSON.stringify(req.body) is not guaranteed byte-identical
// to what was actually sent.
app.use(express.json({ limit: '25mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function envTrue(name) {
  const v = String(process.env[name] || '').toLowerCase();
  return v === 'true' || v === '1';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Infer user region for org filtering from saved country (ISO2). */
function inferUserRegion(locationCountry) {
  const c = String(locationCountry || '').trim().toUpperCase();
  return c === 'US' ? 'US' : null;
}

/** Pull a 5-digit US ZIP from saved location (ZIP-only or embedded in an address). */
function extractUsZipFromUserLocation(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{5}(-\d{4})?$/.test(s)) return s.slice(0, 5);
  const m = s.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function extractEmailAddress(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

function extractDisplayName(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/^"?([^"<]+)"?\s*</);
  if (m && m[1]) return m[1].trim();
  if (!s.includes('@')) return s.replace(/^"|"$/g, '').trim();
  return '';
}

function normalizeLocalPart(input) {
  return stripDiacritics(String(input || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function validLocalPart(local) {
  return /^[a-z0-9]{3,30}$/.test(String(local || ''));
}

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'loopy@causal.works').trim().toLowerCase();

function isAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

function makeSuggestPicklistToken(orgName, ein, expiresAt) {
  const secret = process.env.ADMIN_VALIDATE_SECRET || process.env.SESSION_SECRET || 'change-me';
  const payload = `${String(orgName || '').trim()}|${String(ein || '').trim()}|${String(expiresAt || '').trim()}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function verifySuggestPicklistToken(orgName, ein, expiresAt, token) {
  const now = Date.now();
  const exp = Number.parseInt(String(expiresAt || ''), 10);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = makeSuggestPicklistToken(orgName, ein, exp);
  return String(token || '') === expected;
}

function firstMatchingUrl(text, predicate) {
  const body = String(text || '');
  const re = /(https?:\/\/[^\s"'<>]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const url = m[1];
    if (!predicate || predicate(url)) return url;
  }
  return null;
}

function detectConfirmationEmail(subject, bodyText) {
  console.log('🔍 detectConfirmationEmail subject:', subject);
  const s = String(subject || '').toLowerCase();
  const b = String(bodyText || '').toLowerCase();
  const subjPhrases = [
    'confirm',
    'verify',
    'activate',
    'please confirm',
    'validate your',
    'complete your signup',
    'thank you for signing',
    'thank you for joining',
    'please activate',
  ];
  const hasSubject = subjPhrases.some((p) => s.includes(p));
  if (!hasSubject) return null;
  const url = firstMatchingUrl(bodyText, (u) => /(confirm|verify|activate|validate|click)/i.test(u));
  if (!url) return null;
  // Ignore synthetic/test URLs that generate dead confirmation cards in the action feed.
  if (/\babc123\b/i.test(url) || /\bexample(?:\d+)?\b/i.test(url)) return null;
  return { confirmation_url: url };
}

function detectReceiptEmail(subject, bodyText) {
  const s = String(subject || '').toLowerCase();
  const subjPhrases = [
    'receipt',
    'thank you for your donation',
    'your contribution',
    'your gift',
    'donation confirmation',
    'your donation',
    'donation receipt',
    'gift receipt',
  ];
  if (!subjPhrases.some((p) => s.includes(p))) return null;

  const body = String(bodyText || '');
  const patterns = [
    { re: /([$€£])\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/, currencyFromSymbol: true },
    { re: /\b(USD|EUR|GBP)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i, codeFirst: true },
    { re: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?(USD|EUR|GBP)\b/i, codeLast: true },
  ];

  let amountCents = null;
  let currency = 'USD';
  for (const p of patterns) {
    const m = body.match(p.re);
    if (!m) continue;
    let numRaw = null;
    if (p.currencyFromSymbol) {
      numRaw = m[2];
      currency = m[1] === '$' ? 'USD' : (m[1] === '€' ? 'EUR' : 'GBP');
    } else if (p.codeFirst) {
      currency = String(m[1]).toUpperCase();
      numRaw = m[2];
    } else if (p.codeLast) {
      numRaw = m[1];
      currency = String(m[2]).toUpperCase();
    }
    const normalized = String(numRaw || '').replace(/,/g, '');
    const value = Number.parseFloat(normalized);
    if (!Number.isNaN(value)) amountCents = Math.round(value * 100);
    break;
  }
  return { amount_cents: amountCents, currency: currency || 'USD' };
}

// Return PostgreSQL date columns as YYYY-MM-DD strings, not JavaScript Date objects.
// Without this, pg parses DATE as a Date object which JSON-serializes to a full UTC ISO timestamp,
// causing off-by-one-day errors and breaking <input type="date"> value binding.
const pg = require('pg');
pg.types.setTypeParser(1082, val => val); // date → "YYYY-MM-DD"

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'causal_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  statementTimeout: 30000,
  connectionTimeoutMillis: 10000,
});

mountOrganizationalRoutes(app, pool);
mountIndividualRoutes(app, pool);

// mountOrganizationalRoutes() wraps `pool` with org-scoping internally, but that scoped pool is
// local to that function -- any handler server.js registers directly on `app` (rather than
// through a route file it mounts) gets the raw, unscoped pool otherwise, whose .query() never
// consults the AsyncLocalStorage org context even after enterOrgContext() runs upstream. Two
// handlers registered here need it directly: the Xero callback and the Plaid webhook.
const orgScopedPool = wrapPoolWithOrgScoping(pool);

app.get('/organizational/xero/callback', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  handleOrganizationalXeroCallback(orgScopedPool, req, res).catch((err) => {
    console.error('np xero callback', err);
    res.status(500).send('Could not complete Xero connection.');
  });
});

// ── Public preview endpoints (no auth) ────────────────────────────────────────

// Entry-point view logging for static, unauthenticated pages (select-workspace.html has no
// server route of its own to hook into -- it's served by express.static below). Aggregate-only:
// no viewer identity, no session, no cookie read. Path is whitelisted, not taken from the
// client, so this can't be used to pollute page_views with arbitrary strings.
const PUBLIC_LOGGABLE_PATHS = new Set(['/shared/select-workspace.html']);
app.post('/api/public/log-view', (req, res) => {
  const path = String(req.body?.path || '');
  if (PUBLIC_LOGGABLE_PATHS.has(path)) logPageView(pool, null, path);
  res.status(204).end();
});

app.get('/api/public/bank-preview', (req, res) => {
  const name = String(req.query.name || '').toLowerCase().trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  let matched = null;
  for (const [key, data] of Object.entries(BANK_FLAG_DATA)) {
    if (name.includes(key) || key.includes(name)) {
      matched = { key, ...data };
      break;
    }
  }

  if (!matched) return res.status(404).json({ flagged: false });

  res.json({
    flagged: true,
    display: matched.display,
    bocc_2024: matched.bocc_2024,
    bankgreen_action_url: matched.pressure?.bankgreen_action_url || null,
    c4cj_url: matched.pressure?.c4cj_url || null,
    third_act_url: matched.pressure?.third_act_url || null,
  });
});

const repPreviewRateLimit = new Map();
const REP_PREVIEW_MAX = 5;
const REP_PREVIEW_WINDOW_MS = 60_000;

app.get('/api/public/rep-preview', async (req, res) => {
  const zip = String(req.query.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'ZIP must be 5 digits' });

  const ip = req.ip;
  const now = Date.now();
  const bucket = repPreviewRateLimit.get(ip) || { count: 0, resetAt: now + REP_PREVIEW_WINDOW_MS };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + REP_PREVIEW_WINDOW_MS; }
  bucket.count++;
  repPreviewRateLimit.set(ip, bucket);
  if (bucket.count > REP_PREVIEW_MAX) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }

  try {
    const reps = await fetchUSReps(zip);
    const preview = reps.slice(0, 3).map((r) => ({
      name: r.name,
      title: r.office_name,
      party: r.party,
      turnarounds: committeesToTurnarounds(r.committees || []),
    }));
    res.json({ reps: preview });
  } catch (e) {
    console.error('/api/public/rep-preview error:', e.message);
    res.status(502).json({ error: 'Could not fetch representatives — try again shortly' });
  }
});

// ── Demo config ──────────────────────────────────────────────────────────────
// Change these when the demo persona, bank, or org subscriptions need updating.
// feed_org_ids: org IDs that have live causal-source actions (drives feed + ledger).
// To find candidate orgs: SELECT DISTINCT org_id FROM actions WHERE source='causal'.
// Demo Company enrollment (every signup gets full-edit access, no invite) now happens
// inside registerUser() itself via bootstrap_demo_org_membership() — see migration 155.
// (Formerly a separate enrollInDemoCooperative() call here, which broke silently after
// the RLS cutover to causal_app: its raw INSERT INTO org_users was rejected by RLS
// instead of going through a SECURITY DEFINER function like this app's other
// cross-context org_users writes. Removed 2026-08-21 rather than fixed in place, since
// registerUser() already covers the same signups and duplicating the enroll call here
// just re-triggers the same RLS violation on every request.)

const DEMO_CONFIG = {
  bank: 'wells fargo',
  location_zip: '97201',
  location_city: 'Portland',
  location_country: 'US',
  turnaround_priorities: ['Energy', 'Inequality'],
  action_type_prefs: ['contact', 'petition', 'comment'],
  feed_org_ids: [13, 14, 17, 21],   // Avaaz, Greenpeace, Sierra Club, NRDC
  ledger_action_count: 8,            // how many recent actions to show as "completed"
};

// Real signups get their elected officials matched at the end of onboarding (user.js), but the
// demo user is seeded already-onboarded and each entry point below only resets profile fields,
// so a re-seeded demo user (new id) never got reps. This runs the same matchReps call when the
// demo user has none. Waits up to 10s so a slow lookup can't block entry; matchReps keeps
// running in the background and the next visit finds the rows.
async function ensureDemoReps(uid) {
  try {
    const has = await pool.query(`SELECT 1 FROM user_representatives WHERE user_id = $1 LIMIT 1`, [uid]);
    if (has.rowCount > 0) return;
    const match = matchReps(pool, uid, DEMO_CONFIG.location_country, DEMO_CONFIG.location_zip);
    match.catch(() => {});
    await Promise.race([match, new Promise((resolve) => setTimeout(resolve, 10000))]);
  } catch (err) {
    console.warn('ensureDemoReps failed:', err.message);
  }
}

// Time-boxed visitor log for the demo entry points (migration 286). The demo is one shared
// account, so this is the only way to tell visitors apart: a keyed one-way hash of IP + browser
// (never the address), with referrer host and a bot flag. Stops by itself after
// DEMO_VISIT_TRACKING_UNTIL; rows older than 30 days are deleted (privacy policy: server logs
// are kept up to 30 days). Drop demo_visit_log / demo_visit_key when the review period ends.
const DEMO_VISIT_TRACKING_UNTIL = Date.parse('2026-10-14T00:00:00Z');
// The last four alternatives catch scanners that fake very old browsers (e.g. 'Android 2.3.6',
// 'Mozilla/4.0 (compatible; MSIE ...)') while sweeping for .env and PHP files; no real visitor uses them.
const DEMO_VISIT_BOT_RX = /bot|crawl|spider|scan|curl|python|go-http|headless|monitor|preview|facebookexternal|slurp|wget|okhttp|android [1-4]\.|msie|mozilla\/4\.0|windows nt [3-5]\./i;
let demoVisitKey = null;
let lastDemoVisitPurge = 0;

async function getDemoVisitKey() {
  if (demoVisitKey) return demoVisitKey;
  await pool.query(
    `INSERT INTO demo_visit_key (id, key) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
    [crypto.randomBytes(32).toString('hex')]
  );
  const r = await pool.query(`SELECT key FROM demo_visit_key WHERE id = 1`);
  demoVisitKey = r.rows[0].key;
  return demoVisitKey;
}

function demoVisitorHash(req, key) {
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '');
  return crypto.createHmac('sha256', key).update(ip + '|' + ua).digest('hex').slice(0, 16);
}

// Staff accounts whose visits are left out of the counts (migration 287). The log holds no
// emails, so staff are excluded by device: when one of these accounts is signed in and opens a
// demo link or /admin, that browser's hash is saved to demo_visit_excluded, and the summary then
// leaves out every visit with that hash (including ones logged earlier).
const DEMO_VISIT_EXCLUDED_EMAILS = new Set(['gyacc@pm.me', 'loopy@causal.works', 'guy@causal.works']);
const knownStaffHashes = new Set();

async function noteStaffDevice(req, email) {
  if (!DEMO_VISIT_EXCLUDED_EMAILS.has(String(email || '').trim().toLowerCase())) return;
  const hash = demoVisitorHash(req, await getDemoVisitKey());
  if (knownStaffHashes.has(hash)) return;
  await pool.query(`INSERT INTO demo_visit_excluded (visitor_hash) VALUES ($1) ON CONFLICT DO NOTHING`, [hash]);
  knownStaffHashes.add(hash);
}

function logDemoVisit(req, entry) {
  if (Date.now() > DEMO_VISIT_TRACKING_UNTIL) return;
  (async () => {
    const key = await getDemoVisitKey();
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (token) {
      const u = await pool.query(
        `SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = $1 AND s.used = FALSE AND s.expires_at > NOW()`,
        [token]
      );
      if (u.rows[0]) await noteStaffDevice(req, u.rows[0].email);
    }
    let referrerHost = null;
    try { if (req.headers.referer) referrerHost = new URL(req.headers.referer).host.slice(0, 100); } catch (_) {}
    await pool.query(
      `INSERT INTO demo_visit_log (entry, visitor_hash, referrer_host, is_bot) VALUES ($1, $2, $3, $4)`,
      [entry, demoVisitorHash(req, key), referrerHost, DEMO_VISIT_BOT_RX.test(String(req.headers['user-agent'] || ''))]
    );
    if (Date.now() - lastDemoVisitPurge > 3600000) {
      lastDemoVisitPurge = Date.now();
      await pool.query(`DELETE FROM demo_visit_log WHERE visited_at < now() - interval '30 days'`);
    }
  })().catch((err) => console.warn('⚠️ demo_visit_log insert failed:', err.message));
}

// Demo account — public route; creates a session for the pre-seeded demo user and redirects.
// On each visit: resets profile fields, org subscriptions, and completed-action ledger so the
// demo always reflects the current state of the platform (no stale action IDs to maintain).
app.get('/demo', async (req, res) => {
  logDemoVisit(req, 'demo');
  logPageView(pool, null, '/demo'); // anonymous entry-point hit, aggregate-only (no viewer identity)
  try {
    const result = await pool.query(
      `SELECT id FROM users WHERE user_type = 'demo' LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.status(503).send('Demo account not configured. Run db/seeds/demo_individual.sql.');
    }
    const demoUser = result.rows[0];
    const uid = demoUser.id;

    await pool.query(
      `UPDATE users
       SET bank = $2, location_zip = $3, location_city = $4,
           location_country = $5, turnaround_priorities = $6, action_type_prefs = $7
       WHERE id = $1`,
      [uid, DEMO_CONFIG.bank, DEMO_CONFIG.location_zip, DEMO_CONFIG.location_city,
       DEMO_CONFIG.location_country, DEMO_CONFIG.turnaround_priorities, DEMO_CONFIG.action_type_prefs]
    );

    // Demo user can open the Cooperative (Demo Company workspace) from the account menu,
    // same access every real signup gets. Enrollment is a SECURITY DEFINER function because
    // a raw org_users insert is rejected by RLS (see the note above DEMO_CONFIG).
    await pool.query(`UPDATE users SET coop_access = true WHERE id = $1`, [uid]);
    await pool.query(`SELECT bootstrap_demo_org_membership($1)`, [uid]).catch((err) => {
      console.warn('/demo: bootstrap_demo_org_membership failed:', err.message);
    });

    // Restore org subscriptions (visitor may have removed one during a session)
    await pool.query(
      `INSERT INTO user_org_preferences (user_id, org_id, followed)
       SELECT $1, unnest($2::int[]), true
       ON CONFLICT (user_id, org_id) DO UPDATE SET followed = true`,
      [uid, DEMO_CONFIG.feed_org_ids]
    );

    // Refresh completed-action ledger: always use the N most recent causal-source
    // actions from the subscribed orgs, spread across the past several weeks.
    // Deleting and re-inserting seeded rows means the ledger automatically reflects
    // the current action library — no hardcoded IDs to maintain.
    await pool.query(`DELETE FROM user_actions WHERE user_id = $1 AND seeded = true`, [uid]);
    await pool.query(
      `INSERT INTO user_actions (user_id, action_id, completed_at, seeded)
       SELECT $1, a.id,
         NOW() - ((ROW_NUMBER() OVER (ORDER BY a.created_at DESC)) * 7 || ' days')::interval,
         true
       FROM (
         SELECT id, created_at FROM actions
         WHERE org_id = ANY($2::int[]) AND source = 'causal'
         ORDER BY created_at DESC
         LIMIT $3
       ) a
       ON CONFLICT (user_id, action_id) DO UPDATE
         SET completed_at = EXCLUDED.completed_at, seeded = true`,
      [uid, DEMO_CONFIG.feed_org_ids, DEMO_CONFIG.ledger_action_count]
    );

    // Org responses (Ledger → Responses): thank-you receipts for the seeded donations plus
    // acknowledgements for recent completed actions. Rewritten on every visit, with dates
    // relative to now, so the log never looks stale. message_id 'demo-*' marks these rows.
    await pool.query(`DELETE FROM user_inbound_emails WHERE user_id = $1 AND message_id LIKE 'demo-%'`, [uid]);
    await pool.query(
      `INSERT INTO user_inbound_emails (user_id, action_id, message_id, received_at, from_address, from_name, subject, preview)
       SELECT $1, NULL, 'demo-gift-' || c.id, c.contributed_at + interval '1 hour',
              'thanks@' || lower(regexp_replace(c.org_name, '[^a-zA-Z0-9]+', '', 'g')) || '.org',
              c.org_name,
              'Thank you for your gift of $' || to_char(c.amount_cents / 100.0, 'FM999,990.00'),
              'Thank you for your generous gift of $' || to_char(c.amount_cents / 100.0, 'FM999,990.00') ||
              ' to ' || c.org_name || '. Your support helps fund the work ahead. This message serves as your receipt.'
       FROM contributions c WHERE c.user_id = $1
       ON CONFLICT (message_id) DO NOTHING`,
      [uid]
    );
    await pool.query(
      `INSERT INTO user_inbound_emails (user_id, action_id, message_id, received_at, from_address, from_name, subject, preview)
       SELECT $1, r.action_id, 'demo-action-' || r.action_id, COALESCE(r.completed_at, NOW() - interval '3 days') + interval '2 hours',
              'action@' || lower(regexp_replace(r.org_name, '[^a-zA-Z0-9]+', '', 'g')) || '.org',
              r.org_name,
              'You took action — thank you',
              'Thanks for taking action with ' || r.org_name || '. Your message was counted with thousands of others, and we will update you as this campaign moves.'
       FROM (
         SELECT DISTINCT ON (a.org_id) ua.action_id, ua.completed_at, o.name AS org_name
         FROM user_actions ua
         JOIN actions a ON a.id = ua.action_id
         JOIN orgs o ON o.id = a.org_id
         WHERE ua.user_id = $1
         ORDER BY a.org_id, ua.completed_at DESC
       ) r
       ON CONFLICT (message_id) DO NOTHING`,
      [uid]
    );

    await ensureDemoReps(demoUser.id);
    await createSessionForUser(pool, demoUser.id, res);
    res.redirect(302, '/individual/');
  } catch (e) {
    console.error('/demo error:', e);
    res.status(500).send('Demo unavailable');
  }
});

// Cooperative counterpart to /demo above, for the "Enter Cooperative (demo)" card on the
// workspace splash: that card links straight to the org dashboard, which 404s into a login
// redirect for a visitor with no session yet (select-workspace.html is a static file, reachable
// directly without going through the authenticated /app.html flow first). This mirrors /odi's
// session bootstrap but lands on the demo org's dashboard instead of the splash page.
app.get('/demo-coop', async (req, res) => {
  logDemoVisit(req, 'demo-coop');
  logPageView(pool, null, '/demo-coop'); // anonymous entry-point hit, aggregate-only (no viewer identity)
  try {
    const r = await pool.query(`SELECT id FROM users WHERE user_type = 'demo' LIMIT 1`);
    if (r.rows.length === 0) return res.redirect(302, '/login.html');
    const uid = r.rows[0].id;
    await pool.query(`UPDATE users SET coop_access = true WHERE id = $1`, [uid]);
    await pool.query(`SELECT bootstrap_demo_org_membership($1)`, [uid]).catch((err) => {
      console.warn('/demo-coop: bootstrap_demo_org_membership failed:', err.message);
    });
    await ensureDemoReps(uid);
    await createSessionForUser(pool, uid, res);
    const orgR = await pool.query(`SELECT slug FROM coop_members WHERE is_platform_demo = true LIMIT 1`);
    const slug = orgR.rows[0] ? orgR.rows[0].slug : 'demo-company';
    return res.redirect(302, `/organizational/o/${slug}/dashboard`);
  } catch (err) {
    console.error('❌ GET /demo-coop:', err.message);
    return res.redirect(302, '/login.html');
  }
});

// Individual app — hash-based routing; only the root needs a server route
// All other /individual/* requests (CSS, JS, HTML partials) are served by express.static below
app.get(['/individual', '/individual/', '/individual/index.html'], requireAuthPage(pool), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'individual', 'index.html'));
});

// ODI-demo change (2026-09-23, see .claude/plans/2026-09-23-odi-workspace-splash.md):
// /app.html now lands everyone on a workspace-choice splash instead of redirecting straight
// into one app. Shown to every account regardless of coop_access -- a no-access account
// simply hits the Organizational app's own existing access-required flow if they pick
// Cooperative, same as before this change, just one click later. This also means
// requireOrganizationalAccessPage's own redirect back to /app.html can no longer loop (this
// route renders/redirects to a static page now, not back into an app).
app.get('/app.html', requireAuthPage(pool), (req, res) => {
  res.redirect(302, '/shared/select-workspace.html');
});
app.get('/app2.html', requireAuthPage(pool), (req, res) => {
  res.redirect(302, '/individual/index.html');
});
app.get('/organizational/index.html', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'index.html'));
});
app.get('/organizational/account', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'account.html'));
});
// Org-framed alias of the above -- account.html's own content is cross-org (lists every
// workspace the user belongs to), but its sidebar needs a slug in the URL to resolve nav links
// (sidebar.js's fillNavHrefs) the same way every other page under /o/:slug/ does. "My account"
// links here now instead of the bare route above so navigating there doesn't drop out of the
// workspace's own chrome.
app.get('/organizational/o/:slug/account', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'account.html'));
});
// Org-framed alias of /organizational/ (the workspace list + create-workspace form), same
// reasoning as /o/:slug/account above -- reached today from inside Turning Tide via "My account"
// -> "+ Create a new organization", so it should keep that workspace's sidebar chrome rather
// than dropping back to the un-scoped page's dead nav links.
app.get('/organizational/o/:slug/new', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'index.html'));
});
// Org-framed alias of /organizational/solid-login.html -- same reasoning as /account and /new
// above. Linked from that org's own Solid Pod page, so it should keep that org's sidebar chrome.
app.get('/organizational/o/:slug/solid-login', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'solid-login.html'));
});
app.get('/organizational/o/:slug/onboarding', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'onboarding.html'));
});
app.get('/organizational/o/:slug/dashboard', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'dashboard.html'));
});
app.get('/organizational/o/:slug', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/dashboard');
});
app.get('/organizational/o/:slug/budget', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'budget.html'));
});
app.get('/organizational/o/:slug/projections', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'projections.html'));
});
app.get('/organizational/o/:slug/projections/allocations/new', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'projections-allocation-edit.html'));
});
app.get('/organizational/o/:slug/projections/allocations/:id', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'projections-allocation-edit.html'));
});
app.get('/organizational/o/:slug/reports', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'reports.html'));
});
app.get('/organizational/o/:slug/grants', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'funders.html'));
});
// Accounting: one page (Transactions / Bank Reconciliation / Approval Policy tabs) served at
// four URLs -- /accounting is canonical; /ledger and /bank-reconciliation are preserved as
// aliases to their respective tabs (they were separate top-level pages before this restructure,
// same "keep every old URL alive" approach as /grants + /donors both serving funders.html);
// /approval-policy is new, since that tab never had its own URL (it was a sliding panel opened
// from a button on the old Ledger page).
const organizationalAccountingHtml = path.join(__dirname, '..', 'public', 'organizational', 'accounting.html');
app.get('/organizational/o/:slug/accounting', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/ledger', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/transactions', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/bank-reconciliation', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/approval-policy', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/board-designations', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/find-recode', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/gift-postings', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/purchases', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/sales', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/fixed-assets', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
app.get('/organizational/o/:slug/expense-claims', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalAccountingHtml);
});
const organizationalContactsHtml = path.join(__dirname, '..', 'public', 'organizational', 'contacts.html');
app.get('/organizational/o/:slug/contacts', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(organizationalContactsHtml);
});
app.get('/organizational/o/:slug/donors', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'funders.html'));
});
app.get('/organizational/o/:slug/compliance', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'compliance.html'));
});
app.get('/organizational/o/:slug/sponsored-projects', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'sponsored-projects.html'));
});
app.get('/organizational/o/:slug/membership', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'membership.html'));
});
const coopCooperativeHtml = path.join(__dirname, '..', 'public', 'organizational', 'cooperative.html');
app.get('/organizational/o/:slug/cooperative', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/workshop', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/activities', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/library', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/members', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/work-pool', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/cooperative/systems', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopCooperativeHtml);
});
app.get('/organizational/o/:slug/library', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'library.html'));
});
app.get('/organizational/o/:slug/documents', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'documents.html'));
});
app.get('/organizational/o/:slug/solid-pod', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'solid-pod.html'));
});
app.get('/organizational/cooperative/pod-management', requireAuthPage(pool), requireOrganizationalAccessPage, requirePlatformAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'pod-management.html'));
});
const coopSettingsHtml = path.join(__dirname, '..', 'public', 'organizational', 'settings.html');
app.get('/organizational/o/:slug/settings', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/settings/organization');
});
app.get('/organizational/o/:slug/settings/organization', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopSettingsHtml);
});
app.get('/organizational/o/:slug/settings/integrations', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(coopSettingsHtml);
});
// Chart of accounts ("structure") and Imports moved to Budget's own Settings tab
// (2026-09-11) — they're Budget-module config, not org-wide config (Organization is an
// enterprise app; each module may own its own settings). Redirect rather than 404, matching
// this app's "never break a bookmark" convention (see /settings and /ledger).
//
// Integrations (Xero/QuickBooks) briefly moved to Budget too on 2026-09-11, but moved back
// here on 2026-09-12: an OAuth credential belongs to the whole org, not to whichever module
// happened to consume it first (this was also the originally-approved plan for the reorg;
// the Budget move was an implementation slip, caught by an independent review). Other
// consumers (e.g. Compliance's 990 Expense classification, which reads the same chart of
// accounts) depend on this connection too, not just Budget.
app.get('/organizational/o/:slug/settings/structure', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/budget');
});
app.get('/organizational/o/:slug/settings/imports', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/budget');
});
// Review Imports was a dead stub (no logic behind it, confirmed 2026-09-11) — removed rather
// than kept as inert UI. 990 Expense classification editing moved into Compliance's "IRS Form
// 990" tab the same day, next to the Part IX card it feeds.
app.get('/organizational/o/:slug/settings/review-imports', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/settings/organization');
});
app.get('/organizational/o/:slug/settings/990', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.redirect(302, '/organizational/o/' + encodeURIComponent(String(req.params.slug || '')) + '/compliance');
});
app.get('/organizational/o/:slug/reports/cash-forecast', requireAuthPage(pool), requireOrganizationalAccessPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'organizational', 'reports-cash-forecast.html'));
});
/** Admin UI is generated at GET /admin (no static admin.html). Redirect common typo/bookmark. */
app.get('/admin.html', (req, res) => {
  res.redirect(302, '/admin');
});
app.get(['/login', '/signin'], (req, res) => {
  const i = req.originalUrl.indexOf('?');
  res.redirect(302, i === -1 ? '/login.html' : '/login.html' + req.originalUrl.slice(i));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'login.html'));
});
app.get('/reset.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'reset.html'));
});
// Invite link admins send by hand — same causal.works content as the root landing page
// (app descriptions + sign-in), just a URL worth putting in an invite email.
app.get(['/welcome', '/welcome.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'landing.html'));
});
app.get('/invite', (req, res) => {
  const i = req.originalUrl.indexOf('?');
  res.redirect(302, i === -1 ? '/accept-invite.html' : '/accept-invite.html' + req.originalUrl.slice(i));
});
app.get('/accept-invite.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'accept-invite.html'));
});
app.get(['/onboarding', '/onboarding.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'onboarding.html'));
});
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// Guard direct requests to /np/*.html files — force through authenticated page routes
// Excludes /partials/ paths (used by fetch) and allows authenticated users through
app.use('/np', (req, res, next) => {
  if (req.path.endsWith('.html') && !req.path.startsWith('/partials/')) {
    const token = req.cookies?.['causal_session'];
    if (!token) return res.redirect(302, '/login.html');
  }
  next();
});

// Guard direct access to app.html — must go through /app.html route (with auth check)
app.use('/', (req, res, next) => {
  if (req.path === '/app.html') {
    const token = req.cookies?.['causal_session'];
    if (!token) return res.redirect(302, '/login.html');
  }
  next();
});

// Guard direct requests to /organizational/*.html files — the auth-gated slug routes above
// (e.g. /organizational/o/:slug/dashboard) sendFile these same files, but the raw filenames
// (e.g. /organizational/dashboard.html) have no registered route and were falling straight
// through to express.static below, unauthenticated. Excludes /partials/ (fetched via JS).
app.use('/organizational', (req, res, next) => {
  if (req.path.endsWith('.html') && !req.path.startsWith('/partials/')) {
    const token = req.cookies?.['causal_session'];
    if (!token) return res.redirect(302, '/login.html');
  }
  next();
});

// Set Cache-Control headers for static assets
app.use((req, res, next) => {
  if (req.path.endsWith('.css') || req.path.endsWith('.js')) {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', 'shared', 'private.html'));
});
app.get('/groundwork', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'landing.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shared', 'privacy.html'));
});

// ── Click-tracking URL detection ─────────────────────────────────────────────────
/** True when URL looks like a click-tracker (host or encoded query); skip resolve + scrape. */
function isTrackingUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const trackingHostParts = ['click', 'links', 'email', 'go', 'track', 'redirect'];
    if (trackingHostParts.some(p => host.includes(p))) return true;
    const qs = u.searchParams;
    const encodedParamNames = ['qs', 'r', 'c'];
    for (const name of encodedParamNames) {
      const val = qs.get(name);
      if (val && val.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(val)) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ── Resolve redirects (tracking URLs → final destination) ──────────────────────
/** Follow redirects via HEAD then GET on 405; return final URL or original on error. */
async function resolveFinalUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const timeoutMs = 10000;
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Causal-Inbound/1.0' },
    });
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Causal-Inbound/1.0' },
      });
    }
    const final = res.url || url;
    if (final !== url) console.log(`🔀 Resolved redirect: ${url.slice(0, 60)}… → ${final.slice(0, 80)}…`);
    return final;
  } catch (e) {
    console.warn(`⚠️ resolveFinalUrl failed for ${url.slice(0, 60)}…: ${e.message}`);
    return url;
  }
}

/** Extract a destination URL from a tracking link's query string (e.g. redirect=, url=). Returns decoded URL or null. */
function extractRedirectFromTrackingUrl(trackingUrl) {
  if (!trackingUrl || typeof trackingUrl !== 'string') return null;
  try {
    const u = new URL(trackingUrl);
    const paramNames = ['redirect', 'url', 'destination', 'target', 'link'];
    for (const name of paramNames) {
      const val = u.searchParams.get(name);
      if (!val) continue;
      const decoded = decodeURIComponent(val);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** Follow tracking URL redirects (max 5s) to get final destination. Returns final URL or null on timeout/error. */
async function resolveTrackingUrl(trackingUrl) {
  if (!trackingUrl || typeof trackingUrl !== 'string') return null;
  const timeoutMs = 5000;
  try {
    let res = await fetch(trackingUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Causal-Inbound/1.0' },
    });
    if (res.status === 405) {
      res = await fetch(trackingUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Causal-Inbound/1.0' },
      });
    }
    return res.url || trackingUrl;
  } catch (e) {
    console.warn(`⚠️ redirect follow failed: ${e.message}`);
    return null;
  }
}

// ── Puppeteer scraper ────────────────────────────────────────────────────────
async function scrapeUrl(url) {
  console.log(`🌐 Agent scraping: ${url}`);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const data = await page.evaluate(() => ({
      title: document.title,
      body: document.body.innerText.substring(0, 5000)
    }));
    await browser.close();
    return `PAGE TITLE: ${data.title}\n\nCONTENT:\n${data.body}`;
  } catch (e) {
    console.error(`❌ Scrape failed for ${url}: ${e.message}`);
    if (browser) await browser.close();
    return null;
  }
}

// ── Auth routes ──────────────────────────────────────────────────────────────

/** Same token path as /auth/request-reset — works when magic-link verify is disabled. */
async function issuePasswordSetupLinkEmail(pool, email) {
  const addr = normalizeEmail(email);
  if (!addr) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO password_reset_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [addr, tokenHash, expiresAt]
  );
  await sendPasswordResetEmail(addr, rawToken);
}

app.post('/auth/signup', async (req, res) => {
  const { email, location, name, forwarding_address } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!(await isEmailOnAllowList(pool, normalizedEmail))) {
    return res.status(403).json({ error: 'invite_only' });
  }

  try {
    const user = await registerUser(pool, normalizedEmail, location, name, forwarding_address);
    if (process.env.ENABLE_MAGIC_VERIFY === 'true') {
      const token = await createMagicToken(pool, user.id);
      await sendMagicLink(normalizedEmail, token);
      return res.json({ status: 'ok', channel: 'magic_link' });
    }
    await issuePasswordSetupLinkEmail(pool, normalizedEmail);
    return res.json({ status: 'ok', channel: 'password_email' });
  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ error: 'Signup failed' });
  }
});

/** Email-first login step: tells the client whether to show a password field or send a magic link.
 * Returns hasPassword=false for unknown/disallowed emails too, so the response never reveals
 * whether an account exists — the client just falls through to /request-access either way,
 * which already guards enumeration with a generic message. */
app.post('/auth/check-email', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email required.' });
  try {
    if (!(await isEmailOnAllowList(pool, email))) {
      return res.json({ hasPassword: false });
    }
    const existing = await pool.query(
      'SELECT password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    const hasPassword = !!(existing.rows[0] && existing.rows[0].password_hash);
    return res.json({ hasPassword });
  } catch (err) {
    console.error('❌ POST /auth/check-email:', err.message);
    return res.json({ hasPassword: false });
  }
});

app.get('/auth/verify', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.redirect(302, '/login.html?error=expired');
  try {
    const session = await verifyToken(pool, token, res);
    if (!session) return res.redirect(302, '/login.html?error=expired');
    return res.redirect(302, '/app.html');
  } catch (err) {
    console.error('❌ GET /auth/verify:', err.message);
    return res.redirect(302, '/login.html?error=expired');
  }
});

// Short vanity path for the ODI review panel: signs them in as the shared demo user (the same
// account /demo uses, already enrolled in Demo Company) and lands on the workspace splash.
// No separate reviewer account -- reviewers who want their own login are added to
// allowed_emails and sign up normally.
app.get('/odi', async (req, res) => {
  logDemoVisit(req, 'odi');
  logPageView(pool, null, '/odi'); // anonymous entry-point hit, aggregate-only (no viewer identity)
  try {
    const r = await pool.query(`SELECT id FROM users WHERE user_type = 'demo' LIMIT 1`);
    if (r.rows.length === 0) return res.redirect(302, '/login.html');
    // Same enrollment /demo does, so the Cooperative card works even if the reviewer never visits /demo.
    await pool.query(`UPDATE users SET coop_access = true WHERE id = $1`, [r.rows[0].id]);
    await pool.query(`SELECT bootstrap_demo_org_membership($1)`, [r.rows[0].id]).catch((err) => {
      console.warn('/odi: bootstrap_demo_org_membership failed:', err.message);
    });
    await ensureDemoReps(r.rows[0].id);
    await createSessionForUser(pool, r.rows[0].id, res);
    return res.redirect(302, '/app.html');
  } catch (err) {
    console.error('❌ GET /odi:', err.message);
    return res.redirect(302, '/login.html');
  }
});

// Access requests from the workspace splash page (ODI review panel and others). Addresses at
// AUTO_APPROVE_DOMAINS are added to allowed_emails and sent the normal password-setup link right
// away (ownership of the address is proven by that link, same as /auth/signup); anything else
// only emails the admin. To stop auto-approving, empty AUTO_APPROVE_DOMAINS -- requests then all go to the manual path. Added 2026-09-25 for the ODI
// Solid open call; review after ~2 weeks.
// causal.works removed 2026-09-27 (end-to-end testing done, per ODI-review-experience cleanup
// list) -- only theodi.org auto-approves now; everything else goes to the manual admin-review path.
const AUTO_APPROVE_DOMAINS = ['theodi.org'];
const ACCESS_REQUEST_NOTIFY = 'guy@causal.works';
const accessRequestHits = new Map(); // ip -> [timestamps]
let accessRequestGlobal = [];

async function sendAccessRequestNotice(subject, text) {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: 'Causal <noreply@causal.works>',
      To: ACCESS_REQUEST_NOTIFY,
      Subject: subject,
      TextBody: text,
      MessageStream: 'outbound',
    }),
  });
  const result = await response.json().catch(() => ({}));
  console.log('📧 Postmark access-request notice:', JSON.stringify(result));
}

app.post('/api/access-request', requireAuth(pool), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const now = Date.now();
  // Per-client limit keyed on the real address (see utils/clientIp.js for why not X-Forwarded-For).
  const ip = clientIp(req);
  const recent = (accessRequestHits.get(ip) || []).filter((t) => now - t < 3600000);
  accessRequestGlobal = accessRequestGlobal.filter((t) => now - t < 3600000);
  if (recent.length >= 5 || accessRequestGlobal.length >= 40) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  recent.push(now);
  accessRequestHits.set(ip, recent);
  accessRequestGlobal.push(now);

  try {
    const domain = email.split('@')[1];
    if (AUTO_APPROVE_DOMAINS.includes(domain)) {
      await pool.query(
        `INSERT INTO allowed_emails (email, invited_by, note) VALUES ($1, 'auto-approve', $2)
         ON CONFLICT (email) DO NOTHING`,
        [email, `Auto-approved via splash page (@${domain})`]
      );
      const newUser = await registerUser(pool, email);
      // Auto-approved signups get a real, seeded org of their own instead of just the
      // universal Demo Company auto-enrollment registerUser() already gave them (staff,
      // permanently masked Members/Danger Zone there) -- see
      // .claude/plans/2026-09-28-seeded-sample-org-creation.md. Best-effort: a failure
      // here still leaves them with a working account (and Demo Company access).
      try {
        // Must be the org-scoped pool, not the raw one -- createInvitedSampleOrg's
        // post-commit inserts rely on enterOrgContext() + AsyncLocalStorage for FORCE
        // RLS, which the raw pool never consults (same class of bug as the Xero/Plaid
        // handlers below, which needed orgScopedPool for the same reason).
        const orgDisplayName = `${email.split('@')[0]}'s Organization`;
        await createInvitedSampleOrg(orgScopedPool, { userId: newUser.id, displayName: orgDisplayName });
      } catch (orgErr) {
        console.error('❌ POST /api/access-request: createInvitedSampleOrg failed:', orgErr.message);
      }
      await issuePasswordSetupLinkEmail(pool, email);
      await sendAccessRequestNotice(
        `Access auto-approved: ${email}`,
        `${email} requested access from the splash page and was added to allowed_emails automatically (@${domain}). A password-setup link was emailed to them.\n\nTo revoke: /admin -> remove from allowlist.`
      );
      return res.json({ status: 'approved' });
    }
    await sendAccessRequestNotice(
      `Access request: ${email}`,
      `${email} requested access from the splash page.\n\nTo approve, add them at https://causal.works/admin (allowlist), or run:\nsudo -u postgres psql causal_db -c "insert into allowed_emails (email, invited_by, note) values ('${email}','guy','Splash request')"\n\nThen send them https://causal.works/welcome.`
    );
    return res.json({ status: 'requested' });
  } catch (err) {
    console.error('❌ POST /api/access-request:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Reusable, non-consuming login link for external reviewers (ODI Solid open call demo) --
// see migration 267's comment for why this is a separate mechanism from magic links, not a
// modification to them. Deliberately not a magic link: this token is never marked used, so
// multiple people can each click it independently and get their own real session, at any time
// before it expires or is revoked.
app.get('/auth/reviewer', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.redirect(302, '/login.html?error=expired');
  try {
    const r = await pool.query(
      `SELECT user_id FROM reviewer_access_links
        WHERE token = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [token]
    );
    if (r.rows.length === 0) return res.redirect(302, '/login.html?error=expired');
    await createSessionForUser(pool, r.rows[0].user_id, res);
    return res.redirect(302, '/app.html');
  } catch (err) {
    console.error('❌ GET /auth/reviewer:', err.message);
    return res.redirect(302, '/login.html?error=expired');
  }
});

app.post('/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || password === undefined || password === '') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!(await isEmailOnAllowList(pool, email))) {
    return res.status(401).json({ error: LOGIN_GENERIC_ERROR });
  }
  try {
    const existing = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (existing.rows.length === 0) {
      return res.status(401).json({ error: LOGIN_GENERIC_ERROR });
    }
    const user = existing.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({
        error: "No password set yet. Use 'Set or reset your password' below.",
      });
    }
    const match = await verifyPassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }
    await createSessionForUser(pool, user.id, res);
    return res.redirect(302, '/app.html');
  } catch (err) {
    console.error('❌ Login error:', err.message);
    return res.status(500).json({ error: 'Sign-in failed.' });
  }
});

app.post('/auth/request-reset', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const msg = "If that address is on our list, you'll receive an email shortly.";
  if (!email) {
    return res.status(400).json({ error: 'Email required.' });
  }
  try {
    if (!(await isEmailOnAllowList(pool, email))) {
      return res.json({ message: msg });
    }
    const existing = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (existing.rows.length === 0) {
      return res.json({ message: msg });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO password_reset_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [email, tokenHash, expiresAt]
    );
    await sendPasswordResetEmail(email, rawToken);
    return res.json({ message: msg });
  } catch (err) {
    console.error('❌ POST /auth/request-reset:', err.message);
    return res.json({ message: msg });
  }
});

app.get('/auth/reset', async (req, res) => {
  const raw = String(req.query.token || '').trim();
  if (!raw) {
    return res.redirect(302, '/shared/reset.html?error=expired');
  }
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  try {
    const r = await pool.query(
      `SELECT id FROM password_reset_tokens
       WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    if (r.rows.length === 0) {
      return res.redirect(302, '/shared/reset.html?error=expired');
    }
  } catch (e) {
    console.error('❌ GET /auth/reset:', e.message);
    return res.redirect(302, '/shared/reset.html?error=expired');
  }
  return res.redirect(302, `/reset.html?token=${encodeURIComponent(raw)}`);
});

app.post('/auth/reset', async (req, res) => {
  const raw = String(req.body.token || '').trim();
  const password = req.body.password;
  const confirm = req.body.password_confirm;

  const redirectReset = (query) => {
    const sp = new URLSearchParams(query);
    if (raw) sp.set('token', raw);
    return res.redirect(302, `/reset.html?${sp.toString()}`);
  };

  if (!raw || password === undefined || confirm === undefined) {
    return res.redirect(302, '/shared/reset.html?error=expired');
  }
  if (password !== confirm) {
    return redirectReset({ error: 'mismatch' });
  }
  if (String(password).length < 8) {
    return redirectReset({ error: 'short' });
  }

  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  try {
    const r = await pool.query(
      `SELECT id, email FROM password_reset_tokens
       WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    if (r.rows.length === 0) {
      return res.redirect(302, '/shared/reset.html?error=expired');
    }
    const row = r.rows[0];
    const pwHash = await hashPassword(password);
    await pool.query('UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2)', [
      pwHash,
      row.email,
    ]);
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [row.id]);
    const userRes = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [
      row.email,
    ]);
    const userId = userRes.rows[0]?.id;
    if (!userId) {
      console.error('❌ POST /auth/reset: user missing after update');
      return res.redirect(302, '/shared/reset.html?error=expired');
    }
    await createSessionForUser(pool, userId, res);
    return res.redirect(302, '/app.html');
  } catch (e) {
    console.error('❌ POST /auth/reset:', e.message);
    return res.redirect(302, '/shared/reset.html?error=expired');
  }
});

app.post('/request-access', async (req, res) => {
  const rawEmail = req.body?.email;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "We're not accepting new accounts at this time." });

  if (!(await isEmailOnAllowList(pool, email))) {
    return res.json({ message: "We're not accepting new accounts at this time." });
  }

  try {
    const user = await registerUser(pool, email, null, null, null);
    const token = await createMagicToken(pool, user.id);
    await sendMagicLink(user.email, token);
    return res.json({ message: 'Check your email for a sign-in link.' });
  } catch (err) {
    console.error('❌ POST /request-access:', err.message);
    return res.status(500).json({ message: "We're not accepting new accounts at this time." });
  }
});

app.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.causal_session;
  if (token) {
    try {
      await pool.query('UPDATE sessions SET used = TRUE WHERE token = $1', [token]);
    } catch (e) {
      console.error('❌ Logout session update:', e.message);
    }
  }
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  res.clearCookie('causal_session', cookieOpts);
  res.status(200).json({ ok: true });
});

// ── Timing display helper ─────────────────────────────────────────────────────
function deriveTimingDisplay(aiResult) {
  if (aiResult.decision_window_label) return aiResult.decision_window_label;
  if (aiResult.decision_window_date) {
    const d = new Date(aiResult.decision_window_date + 'T12:00:00Z');
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate();
    return `Closes ${month} ${day}`;
  }
  if (aiResult.timing_confidence >= 8) return 'This week';
  return 'Active window';
}

function inboundMailHeader(headers, nameLc) {
  if (!Array.isArray(headers)) return '';
  const want = String(nameLc || '').toLowerCase();
  const h = headers.find((x) => String(x.Name || '').toLowerCase() === want);
  return h ? String(h.Value || '').trim() : '';
}

function userInboundPreviewFromBodies(plain, html) {
  let t = String(plain || '').replace(/\r\n/g, '\n').trim().replace(/\s+/g, ' ');
  if (!t && html) {
    t = String(html)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return t.length > 200 ? t.slice(0, 200) : t;
}

// ── Inbound webhook from Plaid ────────────────────────────────────────────────
// Platform-level, not per-org, since Plaid's webhook payload carries item_id (mapped to an org
// via org_plaid_items), not an org slug. Signature-verified (handlePlaidWebhook), unlike the
// Postmark webhook below -- a forged Plaid webhook could otherwise trigger a sync against an
// arbitrary item_id.
app.post('/api/plaid/webhook', handlePlaidWebhook(orgScopedPool));

// ── Inbound webhook from Postmark ────────────────────────────────────────────
app.post('/inbound', async (req, res) => {
  res.status(200).json({ status: 'received' });

  // Parse from/to/subject first so transactional check can run before generic skip list
  const rawFrom =
    req.body.FromFull?.Email ||
    req.body.FromFull?.[0]?.Email ||
    req.body.From ||
    '';
  const fromAddress = extractEmailAddress(rawFrom).toLowerCase();
  const fromName = extractDisplayName(rawFrom);
  const rawReplyTo = req.body.ReplyTo || req.body.ReplyToEmail || '';
  const replyToAddress = extractEmailAddress(rawReplyTo).toLowerCase();
  const subject = String(req.body.Subject || '');

  const rawTo =
    req.body.ToFull?.[0]?.Email ||
    req.body.ToFull?.Email ||
    req.body.To ||
    '';
  const toAddress = extractEmailAddress(rawTo).toLowerCase().trim();
  const originalText = req.body.text || req.body.TextBody || '';
  const rawHtmlBody = req.body.HtmlBody || req.body.html || '';

  // Loopy inbox is a normal admin mailbox target.
  // Do not auto-forward loopy mail to any other address.

  if (!toAddress) return;

  // Digits-only @causal.works → user forwarding_address: check if sender is followed org before deciding.
  // A miss here (e.g. a legacy alias only present in user_addresses) falls through to the general
  // recipient resolution below instead of being discarded.
  if (/^\d+@causal\.works$/i.test(toAddress)) {
    try {
      const fu = await pool.query(
        `SELECT id FROM users WHERE LOWER(TRIM(forwarding_address)) = LOWER($1) LIMIT 1`,
        [toAddress]
      );
      if (fu.rows.length) {
        const uid = fu.rows[0].id;

        // Check if sender matches a followed org - if yes, let it through the pipeline
        const orgMatch = await resolveActiveOrgBySenderDomain(pool, fromAddress);
        if (orgMatch && orgMatch.id) {
          const followCheck = await pool.query(
            `SELECT 1 FROM user_org_preferences WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
            [uid, orgMatch.id]
          );
          if (followCheck.rows.length > 0) {
            console.log(`📬 Numeric alias ${toAddress} from followed org ${orgMatch.name} - allowing through pipeline`);
            // Continue to pipeline (don't archive only)
          } else {
            // Archive only (original behavior for non-followed senders)
            const hdrs = req.body.Headers;
            let messageId = (req.body.MessageID && String(req.body.MessageID).trim()) || null;
            if (!messageId) {
              const mid = inboundMailHeader(hdrs, 'message-id');
              if (mid) messageId = mid.replace(/^<|>$/g, '').trim() || null;
            }
            if (messageId) {
              const dup = await pool.query(
                'SELECT 1 FROM user_inbound_emails WHERE message_id = $1 LIMIT 1',
                [messageId]
              );
              if (dup.rows.length) return;
            }

            let sentAt = null;
            const dateRaw = inboundMailHeader(hdrs, 'date') || req.body.Date || '';
            if (dateRaw) {
              const d = new Date(dateRaw);
              if (!Number.isNaN(d.getTime())) sentAt = d;
            }

            const preview = userInboundPreviewFromBodies(originalText, rawHtmlBody);
            let actionId = null;
            if (orgMatch && orgMatch.id) {
              const ar = await pool.query(
                `SELECT id FROM actions WHERE org_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
                [orgMatch.id]
              );
              if (ar.rows[0]) actionId = ar.rows[0].id;
            }

            await pool.query(
              `INSERT INTO user_inbound_emails
                 (user_id, action_id, message_id, sent_at, from_address, from_name, to_address, subject, preview)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                uid,
                actionId,
                messageId,
                sentAt,
                fromAddress || null,
                fromName ? String(fromName).slice(0, 500) : null,
                toAddress,
                subject.slice(0, 2000),
                preview ? preview.slice(0, 500) : null,
              ]
            );
            console.log(`📬 User inbound: ${toAddress} from ${fromAddress} — ${subject}`);
            return;
          }
        } else {
          // No org match - archive only (original behavior)
          const hdrs = req.body.Headers;
          let messageId = (req.body.MessageID && String(req.body.MessageID).trim()) || null;
          if (!messageId) {
            const mid = inboundMailHeader(hdrs, 'message-id');
            if (mid) messageId = mid.replace(/^<|$/g, '').trim() || null;
          }
          if (messageId) {
            const dup = await pool.query(
              'SELECT 1 FROM user_inbound_emails WHERE message_id = $1 LIMIT 1',
              [messageId]
            );
            if (dup.rows.length) return;
          }

          let sentAt = null;
          const dateRaw = inboundMailHeader(hdrs, 'date') || req.body.Date || '';
          if (dateRaw) {
            const d = new Date(dateRaw);
            if (!Number.isNaN(d.getTime())) sentAt = d;
          }

          const preview = userInboundPreviewFromBodies(originalText, rawHtmlBody);
          let actionId = null;
          const orgMatchForArchive = await resolveActiveOrgBySenderDomain(pool, fromAddress);
          if (orgMatchForArchive && orgMatchForArchive.id) {
            const ar = await pool.query(
              `SELECT id FROM actions WHERE org_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
              [orgMatchForArchive.id]
            );
            if (ar.rows[0]) actionId = ar.rows[0].id;
          }

          await pool.query(
            `INSERT INTO user_inbound_emails
               (user_id, action_id, message_id, sent_at, from_address, from_name, to_address, subject, preview)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              uid,
              actionId,
              messageId,
              sentAt,
              fromAddress || null,
              fromName ? String(fromName).slice(0, 500) : null,
              toAddress,
              subject.slice(0, 2000),
              preview ? preview.slice(0, 500) : null,
            ]
          );
          console.log(`📬 User inbound: ${toAddress} from ${fromAddress} — ${subject}`);
          return;
        }
        return;
      }
      // No user matched via forwarding_address — fall through to user_addresses/org resolution below.
    } catch (e) {
      if (e.code !== '23505') console.warn('⚠️ user_inbound_emails:', e.message);
      return;
    }
  }

  // 1) Resolve recipient: user_addresses first, then org causal_address fallback.
  let user_id = null;
  /** 'causal' = mail to org causal_address (shared); 'user' = mail to user forwarding/email */
  let actionSource = 'user';
  /** When actionSource === 'causal', org_id from this match (email was to this org's address). */
  let org_id_from_to = null;
  try {
    const aliasMatch = await pool.query(
      'SELECT user_id FROM user_addresses WHERE address = $1 LIMIT 1',
      [toAddress]
    );
    if (aliasMatch.rows.length > 0) {
      user_id = aliasMatch.rows[0].user_id;
      actionSource = 'user';
      console.log(`👤 Matched inbound recipient via user_addresses: ${toAddress} -> user_id=${user_id}`);
    } else {
      const orgResult = await pool.query('SELECT id FROM orgs WHERE causal_address = $1 LIMIT 1', [toAddress]);
      if (orgResult.rows.length > 0) {
        actionSource = 'causal';
        org_id_from_to = orgResult.rows[0].id;
        console.log(`📬 Matched inbound recipient via org causal_address: ${toAddress} -> org_id=${org_id_from_to}`);
      } else {
        // Option 1: unknown inbound org address can auto-provision a pending org for admin review.
        const [toLocal = '', toDomain = ''] = String(toAddress).toLowerCase().split('@');
        const senderDomain = (String(fromAddress).split('@')[1] || '').toLowerCase();
        const reservedLocalParts = new Set(['noreply', 'loopy', 'guy', 'admin', 'support', 'info', 'hello', 'postmaster', 'mailer-daemon']);
        const allowlist = String(process.env.ORG_AUTO_PROVISION_SENDER_DOMAINS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const senderAllowed = allowlist.length === 0 || allowlist.includes(senderDomain);
        const localLooksValid = /^[a-z0-9][a-z0-9._-]{1,63}$/.test(toLocal) && !reservedLocalParts.has(toLocal);
        const senderLooksValid = !!senderDomain
          && !fromAddress.includes('causal.works')
          && !['postmarkapp.com', 'postmark.com'].some((d) => senderDomain.includes(d));

        if (toDomain === CAUSAL_DOMAIN && localLooksValid && senderLooksValid && senderAllowed) {
          try {
            const matchBySender = await resolveActiveOrgBySenderDomain(pool, fromAddress);
            if (matchBySender) {
              await pool.query(
                `UPDATE orgs SET causal_address = COALESCE(causal_address, $1) WHERE id = $2`,
                [toAddress, matchBySender.id]
              );
              try {
                if (senderDomain) await mergeSenderDomainsForOrg(pool, matchBySender.id, [senderDomain]);
              } catch (mergeErr) {
                console.warn('⚠️ sender_domains merge skipped:', mergeErr.message);
              }
              console.log(
                `📬 Unknown causal address ${toAddress} linked to existing org by sender domain → ${matchBySender.name} (id=${matchBySender.id})`
              );
              return;
            }

            const generatedOrgName =
              inferOrgNameFromLocalPart(toLocal) || displayLabelFromEmail(fromAddress) || toLocal;
            const normalizedGenerated = String(generatedOrgName).toLowerCase().replace(/[^a-z0-9]/g, '');
            const initialDomains = senderDomain ? [senderDomain] : [];
            let orgRow = null;
            const existing = await pool.query(
              `SELECT id, name, subscription_status, validated_via, causal_address
               FROM orgs
               WHERE LOWER(COALESCE(causal_address, '')) = LOWER($1)
                  OR regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = $2
               ORDER BY
                 CASE WHEN COALESCE(subscription_status, 'active') = 'active' THEN 0
                      WHEN COALESCE(subscription_status, 'active') = 'pending_subscription' THEN 1
                      ELSE 2 END,
                 id ASC
               LIMIT 1`,
              [toAddress, normalizedGenerated]
            );

            if (existing.rows.length > 0) {
              orgRow = existing.rows[0];
              if (!orgRow.causal_address) {
                const up = await pool.query(
                  `UPDATE orgs
                   SET causal_address = COALESCE(causal_address, $1)
                   WHERE id = $2
                   RETURNING id, name, subscription_status, validated_via, causal_address`,
                  [toAddress, orgRow.id]
                );
                if (up.rows.length > 0) orgRow = up.rows[0];
              }
            } else {
              try {
                let inserted;
                try {
                  inserted = await pool.query(
                    `INSERT INTO orgs (name, subscription_status, validated_via, causal_address, sender_domains)
                     VALUES ($1, 'pending_subscription', 'inbound_auto', $2, $3::text[])
                     RETURNING id, name, subscription_status, validated_via, causal_address`,
                    [generatedOrgName, toAddress, initialDomains]
                  );
                } catch (domColErr) {
                  if (domColErr.message && /sender_domains|column .* does not exist/i.test(domColErr.message)) {
                    inserted = await pool.query(
                      `INSERT INTO orgs (name, subscription_status, validated_via, causal_address)
                       VALUES ($1, 'pending_subscription', 'inbound_auto', $2)
                       RETURNING id, name, subscription_status, validated_via, causal_address`,
                      [generatedOrgName, toAddress]
                    );
                  } else {
                    throw domColErr;
                  }
                }
                orgRow = inserted.rows[0];
              } catch (insertErr) {
                if (insertErr.code === '23505') {
                  const race = await pool.query(
                    `SELECT id, name, subscription_status, validated_via, causal_address
                     FROM orgs
                     WHERE LOWER(COALESCE(causal_address, '')) = LOWER($1)
                        OR regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = $2
                     LIMIT 1`,
                    [toAddress, normalizedGenerated]
                  );
                  orgRow = race.rows[0] || null;
                } else if (insertErr.message && /column.*validated_via.*does not exist/i.test(insertErr.message)) {
                  const inserted = await pool.query(
                    `INSERT INTO orgs (name, subscription_status, causal_address)
                     VALUES ($1, 'pending_subscription', $2)
                     RETURNING id, name, subscription_status, NULL::text AS validated_via, causal_address`,
                    [generatedOrgName, toAddress]
                  );
                  orgRow = inserted.rows[0];
                } else {
                  throw insertErr;
                }
              }
            }

            if (orgRow && process.env.POSTMARK_API_KEY) {
              const baseUrl = process.env.BASE_URL || 'https://causal.works';
              const secret = process.env.ADMIN_VALIDATE_SECRET || process.env.SESSION_SECRET || 'change-me';
              const token = crypto.createHmac('sha256', secret).update(String(orgRow.id)).digest('hex');
              const link = `${baseUrl}/admin/validate-org?org_id=${orgRow.id}&token=${encodeURIComponent(token)}`;
              const inboundSummary =
                `Unknown inbound org address auto-provisioned for review.\n\n` +
                `To address: ${toAddress}\n` +
                `Auto-generated org name: ${generatedOrgName}\n` +
                `Sender email: ${fromAddress || '(unknown)'}\n` +
                `Sender domain: ${senderDomain || '(unknown)'}\n` +
                `Subject: ${subject || '(no subject)'}\n\n` +
                `Org row: id=${orgRow.id}, name=${orgRow.name}, status=${orgRow.subscription_status}\n` +
                `Validate: ${link}\n`;
              await fetch('https://api.postmarkapp.com/email', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
                },
                body: JSON.stringify({
                  From: 'Causal <noreply@causal.works>',
                  To: 'loopy@causal.works',
                  Subject: `Inbound org review: ${orgRow.name}`,
                  TextBody: inboundSummary.slice(0, 100000),
                  MessageStream: 'outbound',
                }),
              }).catch((mailErr) => {
                console.warn('⚠️ Inbound auto-provision admin email failed:', mailErr.message);
              });
            }

            if (orgRow?.id) {
              console.log(`🆕 Auto-provisioned inbound org for review: ${toAddress} -> org_id=${orgRow.id} (${orgRow.name})`);
              return;
            }
          } catch (autoErr) {
            console.warn(`⚠️ Inbound auto-provision failed for ${toAddress}:`, autoErr.message);
          }
        }

        console.warn(`⚠️ Inbound discarded (no matching user address/org): ${toAddress}`);
        return;
      }
    }
  } catch (err) {
    console.error('❌ Inbound lookup failed:', err.message);
    return;
  }

  // 2) Confirmation/receipt detection before any non-action skip guards (user-address path only).
  const confirmation = user_id ? detectConfirmationEmail(subject, originalText + '\n' + (rawHtmlBody || '')) : null;
  if (confirmation && user_id) {
    try {
      const orgName = await orgDisplayNameFromSenderPool(pool, fromAddress);
      await pool.query(
        `INSERT INTO pending_confirmations (user_id, org_name, confirmation_url, email_subject)
         VALUES ($1, $2, $3, $4)`,
        [user_id, orgName, confirmation.confirmation_url, (subject || '').slice(0, 1000)]
      );
      console.log(`✅ Stored pending confirmation for user ${user_id}: ${orgName}`);
    } catch (e) {
      console.error('❌ pending_confirmations insert failed:', e.message);
    }
    return;
  }

  const receipt = user_id ? detectReceiptEmail(subject, originalText + '\n' + (rawHtmlBody || '')) : null;
  if (receipt && user_id) {
    try {
      const orgName = await orgDisplayNameFromSenderPool(pool, fromAddress);
      await pool.query(
        `INSERT INTO contributions (user_id, org_name, amount_cents, currency, contributed_at, source)
         VALUES ($1, $2, $3, $4, NOW(), 'receipt')`,
        [user_id, orgName, receipt.amount_cents, receipt.currency || 'USD']
      );
      console.log(`✅ Stored contribution receipt for user ${user_id}: ${orgName}`);
    } catch (e) {
      console.error('❌ contributions insert failed:', e.message);
    }
    return;
  }

  // 3) Skip system/non-action senders after confirmation/receipt checks.
  if (fromAddress.includes('causal.works')) {
    console.log(`⏭️  Skipping transactional email from our domain: ${fromAddress}`);
    return;
  }
  const skipSenders = ['postmarkapp.com', 'postmark.com', 'noreply', 'no-reply', 'actblue.com'];
  if (skipSenders.some(skip => fromAddress.includes(skip))) {
    console.log(`⏭️  Skipping non-action email from: ${fromAddress}`);
    return;
  }
  // Legacy digest subject wording ("causal push") — keep matching old mail still in inboxes.
  if (/actions waiting in causal push/i.test(subject) || /magic link/i.test(subject)) {
    console.log(`⏭️  Skipping system email: from=${fromAddress}, subject="${subject}"`);
    return;
  }

  // Causal-address path: skip scrape + AI if no users follow this org yet
  if (org_id_from_to != null) {
    try {
      const fol = await pool.query(
        'SELECT COUNT(*)::int AS c FROM user_org_preferences WHERE org_id = $1',
        [org_id_from_to]
      );
      const n = fol.rows[0]?.c ?? 0;
      if (n === 0) {
        console.log(`⏭️ Skipping pipeline — no followers for org_id ${org_id_from_to}`);
        return;
      }
    } catch (e) {
      console.warn('⚠️ Follower count check failed, proceeding:', e.message);
    }
  }

  const htmlBody = rawHtmlBody;
  let foundUrl = pickBestUrl(originalText, htmlBody);
  // Never scrape our own magic-link URL — that would consume the token before the user clicks
  const baseUrl = (process.env.BASE_URL || 'https://causal.works').replace(/\/$/, '');
  if (foundUrl && (foundUrl.startsWith(baseUrl + '/auth/verify') || foundUrl.includes('/auth/verify?'))) {
    foundUrl = null;
  }
  let sourceUrlFromEmailOnly = false;
  if (foundUrl && isTrackingUrl(foundUrl)) {
    const trackingUrl = foundUrl;
    console.log(`⏭️ Skipping scrape (tracking URL): ${trackingUrl.slice(0, 70)}…`);
    foundUrl = null;
    // 1) Prefer destination from tracking URL's query (e.g. redirect=https://act.commoncause.org/petitions/...)
    const fromQuery = extractRedirectFromTrackingUrl(trackingUrl);
    if (fromQuery && !shouldSkipUrl(fromQuery, '') && !isTrackingUrl(fromQuery)) {
      foundUrl = fromQuery;
      sourceUrlFromEmailOnly = true;
      console.log(`🔗 source_url from tracking query: ${foundUrl}`);
    }
    if (!foundUrl) {
      // 2) Follow redirects to get final URL
      const resolved = await resolveTrackingUrl(trackingUrl);
      if (resolved && !shouldSkipUrl(resolved, '')) {
        let resolvedHost = '';
        const resolvedPath = (() => { try { const u = new URL(resolved); resolvedHost = u.hostname.toLowerCase(); return u.pathname; } catch (_) { return ''; } })();
        const resolvedIsActionPage = resolvedPath.includes('/petitions/') || resolvedHost === 'act.commoncause.org';
        // If redirect landed on a generic page (e.g. PBS), prefer a /petitions/ link from the email
        const specificFromEmail = (!resolvedIsActionPage && (htmlBody || originalText))
          ? pickSourceUrlFromEmailPreferringPath(htmlBody, originalText, fromAddress, '/petitions/')
          : null;
        if (specificFromEmail && !shouldSkipUrl(specificFromEmail, '')) {
          foundUrl = specificFromEmail;
          console.log(`🔗 source_url from email (prefer /petitions/): ${foundUrl}`);
        } else if (resolvedIsActionPage) {
          foundUrl = resolved;
          console.log(`🔗 source_url from redirect chain: ${foundUrl}`);
        } else {
          // Redirect landed on a non-action page (e.g. PBS footnote); keep tracking URL so user gets correct flow when they click
          foundUrl = trackingUrl;
          console.log(`🔗 source_url using tracking URL (redirect was non-action): ${foundUrl.slice(0, 70)}…`);
        }
        sourceUrlFromEmailOnly = true;
      } else {
        let fromEmail = pickSourceUrlFromEmailHtml(htmlBody, fromAddress);
        if (!fromEmail && originalText) fromEmail = pickSourceUrlFromText(originalText, fromAddress);
        if (fromEmail) {
          foundUrl = fromEmail;
          sourceUrlFromEmailOnly = true;
          console.log(`🔗 source_url from email: ${foundUrl}`);
        } else {
          // No usable resolved URL and no link from email; use tracking URL so click still works
          foundUrl = trackingUrl;
          console.log(`🔗 source_url using tracking URL (fallback): ${foundUrl.slice(0, 70)}…`);
        }
      }
    }
  } else if (!foundUrl && (htmlBody || originalText)) {
    // No URL yet (e.g. all links filtered by pickBestUrl) — try email HTML/text extraction
    let fromEmail = pickSourceUrlFromEmailHtml(htmlBody, fromAddress);
    if (!fromEmail && originalText) fromEmail = pickSourceUrlFromText(originalText, fromAddress);
    if (fromEmail) {
      foundUrl = fromEmail;
      sourceUrlFromEmailOnly = true;
      console.log(`🔗 source_url from email: ${foundUrl}`);
    }
  }
  if (foundUrl && !sourceUrlFromEmailOnly) {
    foundUrl = await resolveFinalUrl(foundUrl);
  }
  const debugInboundEnabled = envTrue('DEBUG_INBOUND_STORE');

  // Was never computed on this path before — only the numeric-alias/
  // user-forwarding branch above extracted it. That's the reason
  // postmark_message_id is null on ~all causal-source actions and the
  // exact-resend dedupe never engages. Same extraction pattern as that
  // branch (body field first, header fallback, strip angle brackets).
  let messageId = (req.body.MessageID && String(req.body.MessageID).trim()) || null;
  if (!messageId) {
    const mid = inboundMailHeader(req.body.Headers, 'message-id');
    if (mid) messageId = mid.replace(/^<|>$/g, '').trim() || null;
  }

  if (debugInboundEnabled) {
    const cap = (s, max) => (typeof s === 'string' ? s.slice(0, max) : null);
    const topUrls = pickTopUrls(originalText, htmlBody, 8);
    const subjectForDebug = subject || null;

    pool
      .query(
        `INSERT INTO inbound_debug_emails
         (user_id, message_id, from_email, to_email, subject, best_url, top_urls, text_body, html_body)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          user_id,
          messageId,
          rawFrom || null,
          rawTo || null,
          subjectForDebug,
          foundUrl || null,
          JSON.stringify(topUrls || []),
          cap(originalText, 50000),
          cap(htmlBody, 200000),
        ]
      )
      .catch((e) => console.warn('⚠️ inbound_debug_emails insert failed:', e.message));
  }

  let contentToAnalyze = originalText;
  let sourceType = "activist email";
  const source_url = foundUrl;

  if (foundUrl) {
    console.log(`🔗 URL found in email: ${foundUrl}`);
    if (!sourceUrlFromEmailOnly) {
      const scraped = await scrapeUrl(foundUrl);
      if (scraped) {
        contentToAnalyze = `EMAIL CONTEXT:\n${originalText}\n\nSCRAPED PAGE:\n${scraped}`;
        sourceType = "activist email with scraped action page";
      } else {
        console.log("⚠️ Scrape failed — falling back to raw email text");
      }
    }
  }

  let suggestedOrgFromSender = '';
  if (fromAddress) {
    try {
      const domRow = await resolveActiveOrgBySenderDomain(pool, fromAddress);
      suggestedOrgFromSender = domRow?.name || displayLabelFromEmail(fromAddress);
    } catch (e) {
      suggestedOrgFromSender = displayLabelFromEmail(fromAddress);
    }
  }

  const aiResult = await extractAction(contentToAnalyze, sourceType, {
    senderEmail: fromAddress,
    fromName,
    replyTo: replyToAddress,
    suggestedOrgFromSender,
  });

  if (!aiResult.action_type || aiResult.action_type === 'newsletter') {
    console.log(`⏭️  Discarding — action_type: "${aiResult.action_type || 'null'}" from: ${fromAddress}`);
    return;
  }

  const do_now = aiResult.timing_confidence >= 6;
  const timing_display = do_now ? deriveTimingDisplay(aiResult) : null;
  if (do_now) console.log(`⏱  Do Now — timing_confidence ${aiResult.timing_confidence}, display: "${timing_display}"`);

  // Compute scenario_label based on timing_confidence and action characteristics
  // Tipping Point is special: timing_confidence >= 8 triggers it
  // Other labels should eventually come from Gemini, defaulting to "Business as Usual" for now
  let scenario_label = 'Business as Usual';
  if (aiResult.timing_confidence >= 8) {
    scenario_label = 'Tipping Point';
  }
  console.log(`📊 scenario_label: ${scenario_label}`);

  const boundary_ids = aiResult.boundary_ids || [];
  const boundary_urgency_score = computeBoundaryUrgencyScore(boundary_ids);
  if (boundary_ids.length > 0) {
    console.log(`🌍 boundary_ids: ${JSON.stringify(boundary_ids)}, urgency_score: ${boundary_urgency_score}`);
  }

  // DB enum (legacy names): 'push' = Petition/action feed; 'purse' = Give / financial asks. Do not rename without migration.
  const feature_target = ['donate', 'divest'].includes(aiResult.action_type) ? 'purse' : 'push';
  console.log(`🎯 feature_target: ${feature_target} (action_type: ${aiResult.action_type})`);

  try {
    let org_id = null;
    let storedOrgName = String(aiResult.org_name || '').trim() || 'Unknown Organization';
    let orgMatchMeta = { matchedVia: 'unresolved', matchedEmail: null };

    if (actionSource === 'causal' && org_id_from_to != null) {
      org_id = org_id_from_to;
      const canon = await pool.query('SELECT name FROM orgs WHERE id = $1', [org_id]);
      if (canon.rows[0]?.name) storedOrgName = canon.rows[0].name;
      orgMatchMeta = { matchedVia: 'causal_to_address', matchedEmail: null };
    } else {
      const resolved = await resolveOrgForInboundUserSource(pool, fromAddress, replyToAddress, aiResult.org_name);
      org_id = resolved.org_id;
      storedOrgName = resolved.org_name;
      orgMatchMeta = { matchedVia: resolved.matchedVia, matchedEmail: resolved.matchedEmail };
    }

    if (org_id) {
      console.log(
        `🏢 Org_id: ${org_id} (${orgMatchMeta.matchedVia}${orgMatchMeta.matchedEmail ? `; ${orgMatchMeta.matchedEmail}` : ''}) → "${storedOrgName}"`
      );
    } else {
      console.log(`🏢 Org unresolved — storing org_name="${storedOrgName}" (AI/Gemini; no sender-domain match)`);
    }

    // Dedupe: same org + same or similar source/ask within 14 days, or same org+action_type → update existing
    const normalizeUrl = (u) => (u || '').replace(/\/#.*$/, '').replace(/\/\?/, '?').replace(/\/+$/, '').trim();
    const normalizedSource = source_url ? normalizeUrl(source_url) : null;
    const askSlice = (aiResult.action_ask || '').trim().slice(0, 80);
    let action_id = null;
    let existingActionId = null;

    // Exact-resend match first: postmark_message_id is the unambiguous signal
    // (an actual repeat delivery of the same message), stronger than and
    // independent of the fuzzy org/source/ask heuristic below — not bounded
    // by the 14-day window since it's not a "similar campaign" guess.
    if (messageId) {
      const exactResult = await pool
        .query(`SELECT id FROM actions WHERE postmark_message_id = $1 LIMIT 1`, [messageId])
        .catch(() => ({ rows: [] }));
      existingActionId = exactResult.rows[0]?.id || null;
    }

    if (!existingActionId && (normalizedSource || askSlice || (org_id && aiResult.action_type))) {
      const dupResult = await pool.query(
        `SELECT id FROM actions
         WHERE created_at > NOW() - INTERVAL '14 days'
           AND (
             (org_id IS NOT NULL AND org_id = $1)
             OR (org_id IS NULL AND LOWER(org_name) = LOWER($4))
           )
           AND (
             (source_url IS NOT NULL AND $2 IS NOT NULL AND TRIM(TRAILING '/' FROM split_part(source_url, '#', 1)) = $2)
             OR (action_ask IS NOT NULL AND $3 <> '' AND length(TRIM(action_ask)) >= 20 AND (LEFT(TRIM(action_ask), 80) = $3 OR action_ask LIKE $3 || '%'))
             OR (action_type = $5 AND (org_id = $1 OR (org_id IS NULL AND LOWER(org_name) = LOWER($4))))
           )
         ORDER BY created_at DESC LIMIT 1`,
        [org_id || null, normalizedSource || null, askSlice || null, storedOrgName || '', aiResult.action_type || '']
      ).catch(() => ({ rows: [] }));
      existingActionId = dupResult.rows[0]?.id || null;
    }

    // Org-wide user-sourced mail: do not store forwarder on actions.user_id (shared org content only).
    const actionUserIdForDb =
      actionSource === 'user' && org_id != null ? null : user_id;

    // Full email text is kept only for platform-subscribed org mail (source 'causal'): organization emails, not personal mail.
    // Mail sent to a user's personal Causal address (source 'user') is read but its text is not stored.
    const rawContentForDb = actionSource === 'causal' ? contentToAnalyze.substring(0, 10000) : null;

    if (existingActionId) {
      await pool.query(
        `UPDATE actions SET
           action_ask = $1, turnaround_category = $2, leverage_point = $3, strategy_text = $4,
           source_url = $5, raw_content = COALESCE($6, actions.raw_content), secondary_turnarounds = $7, e4a_parameters = $8,
           action_type = $9, timing_confidence = $10, do_now = $11, timing_display = $12,
           feature_target = $13, decision_window_date = $14, rep_targets = $15,
           material_stake = $16,
           boundary_ids = $23,
           boundary_urgency_score = $24,
           postmark_message_id = COALESCE(actions.postmark_message_id, $25),
           org_id = COALESCE(actions.org_id, $18::int),
           org_name = CASE WHEN actions.org_id IS NULL AND $18::int IS NOT NULL THEN $19 ELSE actions.org_name END,
           sender_email = COALESCE(actions.sender_email, $20),
           reply_to_email = COALESCE(actions.reply_to_email, $21),
           user_id = CASE
             WHEN $22 = 'user' AND COALESCE(actions.org_id, $18::int) IS NOT NULL THEN NULL
             ELSE actions.user_id
           END,
           created_at = NOW()
         WHERE id = $17`,
        [
          aiResult.action_ask,
          aiResult.turnaround_category,
          aiResult.leverage_point,
          aiResult.strategy_text,
          source_url,
          rawContentForDb,
          aiResult.secondary_turnarounds,
          aiResult.e4a_parameters,
          aiResult.action_type,
          aiResult.timing_confidence,
          do_now,
          timing_display,
          feature_target,
          aiResult.decision_window_date || null,
          aiResult.rep_targets || [],
          aiResult.material_stake || null,
          existingActionId,
          org_id,
          storedOrgName,
          fromAddress || null,
          replyToAddress || null,
          actionSource,
          boundary_ids,
          boundary_urgency_score,
          messageId,
        ]
      );
      action_id = existingActionId;
      console.log(`🔄 Dedupe: updated existing action id ${action_id} (same org/source or ask${messageId ? ', exact message_id match' : ''})`);
    } else {
      const actionResult = await pool.query(
        `INSERT INTO actions (org_name, action_ask, turnaround_category, leverage_point, strategy_text, source_url, raw_content, sender_email, reply_to_email, user_id, secondary_turnarounds, e4a_parameters, action_type, scenario_label, timing_confidence, org_id, do_now, timing_display, feature_target, decision_window_date, rep_targets, material_stake, source, boundary_ids, boundary_urgency_score, postmark_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
         RETURNING id`,
        [
          storedOrgName,
          aiResult.action_ask,
          aiResult.turnaround_category,
          aiResult.leverage_point,
          aiResult.strategy_text,
          source_url,
          rawContentForDb,
          fromAddress || null,
          replyToAddress || null,
          actionUserIdForDb,
          aiResult.secondary_turnarounds,
          aiResult.e4a_parameters,
          aiResult.action_type,
          scenario_label,
          aiResult.timing_confidence,
          org_id,
          do_now,
          timing_display,
          feature_target,
          aiResult.decision_window_date || null,
          aiResult.rep_targets || [],
          aiResult.material_stake || null,
          actionSource,
          boundary_ids,
          boundary_urgency_score,
          messageId,
        ]
      );
      action_id = actionResult.rows[0].id;
      console.log(
        `✅ Action saved to DB with id: ${action_id}, source: ${actionSource}, actions.user_id: ${actionUserIdForDb ?? 'null'} (forwarder ${user_id ?? 'n/a'})`
      );
    }

    // source='user' + resolved org: fan-out user_actions to every org follower (and forwarder if not already following).
    // source='causal': no fan-out at ingest (lazy / backfill).
    if (actionSource === 'user') {
      if (org_id) {
        const subscribers = await pool.query(
          `SELECT user_id FROM user_org_preferences WHERE org_id = $1`,
          [org_id]
        );
        const fanOutIds = subscribers.rows.map((r) => r.user_id);
        if (user_id != null && !fanOutIds.includes(user_id)) fanOutIds.push(user_id);

        if (fanOutIds.length > 0) {
          await pool.query(
            `INSERT INTO user_actions (user_id, action_id)
             SELECT u, $2::int FROM unnest($1::int[]) AS u
             ON CONFLICT (user_id, action_id) DO NOTHING`,
            [fanOutIds, action_id]
          );
        }
        console.log(`📤 Fanned out user-sourced action to ${fanOutIds.length} user(s) (org_id=${org_id})`);
      } else if (user_id) {
        await pool.query(
          `INSERT INTO user_actions (user_id, action_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user_id, action_id]
        );
      }
    }
  } catch (dbError) {
    console.error("❌ DB Insert Error:", dbError.message);
  }
});

// ── Admin: validate org (collect sender_domains if missing, then activate) ──
function validateOrgToken(orgId, token) {
  const secret = process.env.ADMIN_VALIDATE_SECRET || process.env.SESSION_SECRET || 'change-me';
  const expected = crypto.createHmac('sha256', secret).update(String(orgId)).digest('hex');
  return token === expected;
}

app.get('/admin/validate-org', async (req, res) => {
  const orgId = parseInt(req.query.org_id, 10);
  const token = (req.query.token || '').trim();
  if (!orgId || !token) {
    res.status(400).set('Content-Type', 'text/html').send('<html><body><p>Missing org_id or token.</p></body></html>');
    return;
  }
  if (!validateOrgToken(orgId, token)) {
    res.status(403).set('Content-Type', 'text/html').send('<html><body><p>Invalid token.</p></body></html>');
    return;
  }
  try {
    const orgRes = await pool.query(
      `SELECT id, name, COALESCE(sender_domains, '{}'::text[]) AS sender_domains FROM orgs WHERE id = $1`,
      [orgId]
    );
    if (!orgRes.rows.length) {
      res.status(404).set('Content-Type', 'text/html').send('<html><body><p>Org not found.</p></body></html>');
      return;
    }
    const org = orgRes.rows[0];
    const needsDomains = !org.sender_domains || org.sender_domains.length === 0;

    if (needsDomains) {
      res.set('Content-Type', 'text/html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Activate organisation</title></head>
<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.45;">
  <h1 style="font-size:1.25rem;">Activate: ${escapeHtml(org.name)}</h1>
  <p>Add <strong>sender domains</strong> (hostnames from campaign <code>From:</code> addresses). One per line or comma-separated.<br/>
  Example: <code>aclu.org</code> and <code>actionnetwork.org</code>. Subdomains like <code>mail.aclu.org</code> match when you list <code>aclu.org</code>.</p>
  <form method="post" action="/admin/validate-org">
    <input type="hidden" name="org_id" value="${orgId}"/>
    <input type="hidden" name="token" value="${escapeHtml(token)}"/>
    <textarea name="sender_domains" rows="5" style="width:100%;box-sizing:border-box;font-family:monospace;" required placeholder="aclu.org&#10;actionnetwork.org"></textarea>
    <p><button type="submit">Save domains &amp; activate</button></p>
  </form>
</body></html>`);
      return;
    }

    const activated = await activateOrgInCausal(pool, orgId);
    if (!activated.rows.length) {
      res.status(404).set('Content-Type', 'text/html').send('<html><body><p>Org not found.</p></body></html>');
      return;
    }
    res.set('Content-Type', 'text/html').send(
      '<html><body><p>Org validated. You can close this tab.</p></body></html>'
    );
  } catch (e) {
    if (e.message && /sender_domains|column .* does not exist/i.test(e.message)) {
      try {
        const activated = await activateOrgInCausal(pool, orgId);
        if (!activated.rows.length) {
          res.status(404).set('Content-Type', 'text/html').send('<html><body><p>Org not found.</p></body></html>');
          return;
        }
        res.set('Content-Type', 'text/html').send(
          '<html><body><p>Org validated (sender_domains column missing — run db/migrations/019_org_sender_domains.sql). You can close this tab.</p></body></html>'
        );
      } catch (e2) {
        console.error('❌ Admin validate-org error:', e2.message);
        res.status(500).set('Content-Type', 'text/html').send('<html><body><p>Database error.</p></body></html>');
      }
      return;
    }
    console.error('❌ Admin validate-org error:', e.message);
    res.status(500).set('Content-Type', 'text/html').send('<html><body><p>Database error.</p></body></html>');
  }
});

app.post('/admin/validate-org', async (req, res) => {
  const orgId = parseInt(req.body.org_id, 10);
  const token = (req.body.token || '').trim();
  const rawDomains = req.body.sender_domains;
  if (!orgId || !token) {
    res.status(400).set('Content-Type', 'text/html').send('<html><body><p>Missing org_id or token.</p></body></html>');
    return;
  }
  if (!validateOrgToken(orgId, token)) {
    res.status(403).set('Content-Type', 'text/html').send('<html><body><p>Invalid token.</p></body></html>');
    return;
  }
  const domains = normalizeSenderDomainsInput(rawDomains);
  if (!domains.length) {
    res.status(400).set('Content-Type', 'text/html').send('<html><body><p>At least one sender domain is required.</p></body></html>');
    return;
  }
  try {
    const domChk = await assertSenderDomainsUnclaimed(pool, orgId, domains);
    if (!domChk.ok) {
      res.status(409).set('Content-Type', 'text/html').send(
        `<html><body><p>Conflict: domain already used by <strong>${escapeHtml(domChk.conflict.name)}</strong>. Use the back button and edit.</p></body></html>`
      );
      return;
    }
    await pool.query(`UPDATE orgs SET sender_domains = $1::text[] WHERE id = $2`, [domains, orgId]);
    const activated = await activateOrgInCausal(pool, orgId);
    if (!activated.rows.length) {
      res.status(404).set('Content-Type', 'text/html').send('<html><body><p>Org not found.</p></body></html>');
      return;
    }
    res.set('Content-Type', 'text/html').send(
      '<html><body><p>Domains saved and org activated. You can close this tab.</p></body></html>'
    );
  } catch (e) {
    if (e.message && /sender_domains|column .* does not exist/i.test(e.message)) {
      res.status(500).set('Content-Type', 'text/html').send(
        '<html><body><p>Database missing sender_domains column — run migration 019_org_sender_domains.sql</p></body></html>'
      );
      return;
    }
    console.error('❌ Admin validate-org POST error:', e.message);
    res.status(500).set('Content-Type', 'text/html').send('<html><body><p>Database error.</p></body></html>');
  }
});

function requireAdmin(req, res, next) {
  return requireAuth(pool)(req, res, () => {
    // ADMIN_EMAIL (single address, also the admin mail recipient) or any account flagged users.is_platform_admin.
    if (!isAdminEmail(req.user.email) && !req.user.is_platform_admin) {
      return res.status(401).send('Unauthorized');
    }
    noteStaffDevice(req, req.user.email).catch((err) => console.warn('⚠️ demo_visit_excluded insert failed:', err.message));
    return next();
  });
}

// Demo visitor summary (migration 286). Shared by GET /admin/demo-visits (JSON) and the /admin
// page. `me` is the requester's own visitor hash to leave out, or null.
async function loadDemoVisitSummary(me) {
  const base = `FROM demo_visit_log WHERE is_bot = false AND ($1::text IS NULL OR visitor_hash <> $1)
    AND visitor_hash NOT IN (SELECT visitor_hash FROM demo_visit_excluded)`;
  const [totals, perDay, byEntry, referrers, bots, staff] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS hits, MIN(visited_at) AS since,
              (SELECT COUNT(*)::int FROM (SELECT visitor_hash ${base} GROUP BY visitor_hash
                 HAVING COUNT(DISTINCT (visited_at AT TIME ZONE 'UTC')::date) > 1) r) AS returning_visitors
       ${base}`, [me]),
    pool.query(
      `SELECT to_char((visited_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS hits
       ${base} GROUP BY 1 ORDER BY 1`, [me]),
    pool.query(
      `SELECT entry, COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS hits
       ${base} GROUP BY entry ORDER BY visitors DESC`, [me]),
    pool.query(
      `SELECT COALESCE(referrer_host, '(none)') AS referrer, COUNT(DISTINCT visitor_hash)::int AS visitors
       ${base} GROUP BY 1 ORDER BY visitors DESC LIMIT 10`, [me]),
    pool.query(`SELECT COUNT(*)::int AS bot_hits FROM demo_visit_log WHERE is_bot = true`),
    pool.query(`SELECT COUNT(*)::int AS n FROM demo_visit_excluded`),
  ]);
  return {
    tracking_until: new Date(DEMO_VISIT_TRACKING_UNTIL).toISOString().slice(0, 10),
    excluding_requester: !!me,
    ...totals.rows[0],
    bot_hits_excluded: bots.rows[0].bot_hits,
    staff_devices_excluded: staff.rows[0].n,
    per_day: perDay.rows,
    by_entry: byEntry.rows,
    top_referrers: referrers.rows,
  };
}

function renderDemoVisitsSection(v, excludeMe) {
  if (!v) {
    return '<p style="font-size:12px;color:#6b7280;">Demo visit log unavailable (run db/migrations/286_demo_visit_log.sql).</p>';
  }
  const table = (heads, rows) =>
    `<table style="max-width:520px;"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    (rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}">No visits logged yet</td></tr>`) +
    '</tbody></table>';
  const since = v.since ? new Date(v.since).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
  const toggle = excludeMe
    ? '<a href="/admin">Include my visits</a>'
    : '<a href="/admin?exclude_me=1">Exclude my visits</a>';
  return `<p style="font-size:12px;color:#6b7280;max-width:900px;">Distinct visitors to /demo, /demo-coop and /odi (migration 286). The demo is one shared account, so visitors are counted by a one-way hash of IP + browser; no addresses are stored. Crawlers are left out (${v.bot_hits_excluded} hits), and so are staff devices (${v.staff_devices_excluded} known: a staff account signed in while opening a demo link or this page). Logging stops ${escapeHtml(v.tracking_until)}. ${toggle} &middot; <a href="/admin/demo-visits">JSON</a></p>
<p style="font-size:14px;"><strong>${v.visitors}</strong> distinct visitors &middot; ${v.hits} entries &middot; ${v.returning_visitors} came back on another day &middot; since ${escapeHtml(since)}${excludeMe ? ' &middot; <em>your own visits excluded (this browser and network)</em>' : ''}</p>
${table(['Day (UTC)', 'Visitors', 'Entries'], v.per_day.map((r) => [r.day, r.visitors, r.hits]))}
${table(['Entry point', 'Visitors', 'Entries'], v.by_entry.map((r) => [r.entry, r.visitors, r.hits]))}
${table(['Referrer', 'Visitors'], v.top_referrers.map((r) => [r.referrer, r.visitors]))}`;
}

// JSON form of the summary. ?exclude_me=1 leaves out the requester's own visits (works when this
// is opened from the same browser and network used to visit the demo).
require('./admin/accountingReview').registerAccountingReview(app, { pool, requireAdmin });

app.get('/admin/demo-visits', requireAdmin, async (req, res) => {
  try {
    const key = await getDemoVisitKey();
    const me = req.query.exclude_me === '1' ? demoVisitorHash(req, key) : null;
    return res.json(await loadDemoVisitSummary(me));
  } catch (e) {
    console.error('GET /admin/demo-visits:', e.message);
    return res.status(500).json({ error: 'Could not load demo visits' });
  }
});

app.post('/admin/np-orgs/:id/delete', requireAdmin, async (req, res) => {
  const id = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid np org id' });
  }
  try {
    // Cross-org hard delete -- see migration 149 for why this must go
    // through a SECURITY DEFINER function once causal_app/RLS is enforced.
    const r = await pool.query(`SELECT * FROM admin_delete_org($1)`, [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'NP workspace not found' });
    }
    return res.json({ ok: true, deleted: r.rows[0] });
  } catch (e) {
    console.error('POST /admin/np-orgs/:id/delete:', e.message);
    return res.status(500).json({ error: 'Delete failed (check DB constraints / migrations)' });
  }
});

app.post('/admin/users/:userId/delete', requireAdmin, async (req, res) => {
  const userId = Number.parseInt(String(req.params.userId || ''), 10);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    // The shared demo account backs /odi and /demo; deleting it breaks both (happened twice on 2026-09-25).
    const target = await pool.query(`SELECT user_type FROM users WHERE id = $1`, [userId]);
    if (target.rows[0] && target.rows[0].user_type === 'demo') {
      return res.status(400).json({ error: 'This is the shared demo account used by /odi and /demo. It cannot be deleted here.' });
    }
    // Cross-user hard delete -- see migration 154 for why this must go
    // through a SECURITY DEFINER function once causal_app/RLS is enforced.
    const r = await pool.query(`SELECT * FROM admin_delete_user($1)`, [userId]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ ok: true, deleted: r.rows[0] });
  } catch (e) {
    console.error('POST /admin/users/:userId/delete:', e.message);
    return res.status(500).json({ error: 'Delete failed (check DB constraints / migrations)' });
  }
});

// Adds an email to the invite allowlist. Sends no email unless send_invite is true (the admin
// page's "Invite" button), which also creates the account and emails a password-setup link.
app.post('/admin/allowed-emails', requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    await pool.query(
      `INSERT INTO allowed_emails (email, invited_by, note) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET invited_by = EXCLUDED.invited_by, note = COALESCE(EXCLUDED.note, allowed_emails.note)`,
      [email, req.user.email, note]
    );
    // "Invite" button: also create the account and email the password-setup link (same path as /auth/signup).
    if (req.body?.send_invite === true) {
      await registerUser(pool, email);
      await issuePasswordSetupLinkEmail(pool, email);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /admin/allowed-emails:', e.message);
    return res.status(500).json({ error: 'Add failed' });
  }
});

app.post('/admin/allowed-emails/:email/delete', requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.params.email);
  if (!email) return res.status(400).json({ error: 'Invalid email' });
  try {
    const r = await pool.query('DELETE FROM allowed_emails WHERE LOWER(email) = LOWER($1) RETURNING email', [email]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /admin/allowed-emails/:email/delete:', e.message);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

app.post('/admin/users/:userId/np-access', requireAdmin, async (req, res) => {
  const userId = Number.parseInt(String(req.params.userId || ''), 10);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const coop_access =
    body.coop_access === true ||
    body.coop_access === 'true' ||
    body.coop_access === 1 ||
    body.coop_access === '1';
  try {
    const r = await pool.query(`UPDATE users SET coop_access = $1 WHERE id = $2 RETURNING id`, [
      coop_access,
      userId,
    ]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Granting coop_access also grants automatic Demo Company membership — see migration 155.
    if (coop_access) {
      await pool.query(`SELECT bootstrap_demo_org_membership($1)`, [userId]).catch((err) => {
        console.warn('⚠️ Demo org bootstrap failed:', err.message);
      });
    }
    return res.json({ ok: true, id: r.rows[0].id, coop_access });
  } catch (e) {
    if (e.message && /coop_access|column .* does not exist/i.test(e.message)) {
      return res.status(500).json({ error: 'Run migration 040_users_coop_access.sql' });
    }
    console.error('POST /admin/users/:userId/np-access:', e.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

app.get('/admin/suggest-to-picklist', async (req, res) => {
  const orgName = String(req.query.org_name || '').trim().slice(0, 500);
  const ein = String(req.query.ein || '').trim().slice(0, 30) || null;
  const websiteUrl = String(req.query.website_url || '').trim().slice(0, 500) || null;
  const token = String(req.query.token || '').trim();
  const exp = String(req.query.expires || '').trim();
  if (!orgName || !token || !exp) {
    res.status(400).set('Content-Type', 'text/html').send('<html><body><p>Missing parameters.</p></body></html>');
    return;
  }
  if (!verifySuggestPicklistToken(orgName, ein, exp, token)) {
    res.status(403).set('Content-Type', 'text/html').send('<html><body><p>Invalid or expired token.</p></body></html>');
    return;
  }
  try {
    await pool.query(
      `INSERT INTO org_suggestions (user_id, org_name, ein, propublica_verified, website_url, status)
       VALUES (NULL, $1, $2, $3, $4, 'pending')`,
      [orgName, ein, !!ein, websiteUrl]
    );
    res.set('Content-Type', 'text/html').send('<html><body><p>Added to picklist suggestions. You can close this tab.</p></body></html>');
  } catch (e) {
    console.error('❌ /admin/suggest-to-picklist:', e.message);
    res.status(500).set('Content-Type', 'text/html').send('<html><body><p>Database error.</p></body></html>');
  }
});

app.post('/admin/suggestions/:id/approve', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    const sug = await pool.query(`SELECT id, user_id, org_name, ein, website_url, propublica_verified FROM org_suggestions WHERE id = $1`, [suggestionId]);
    if (!sug.rows.length) return res.status(404).json({ error: 'Suggestion not found' });
    const orgName = String(sug.rows[0].org_name || '').trim().slice(0, 500);
    if (!orgName) return res.status(400).json({ error: 'Invalid org_name' });
    const ein = String(sug.rows[0].ein || '').trim().slice(0, 30) || null;
    const websiteUrl = String(sug.rows[0].website_url || '').trim().slice(0, 500) || null;
    const ppVerified = !!sug.rows[0].propublica_verified;
    const suggesterId = sug.rows[0].user_id || null;
    const orgKey = normalizeOrgKey(orgName);

    // orgs.name has no unique constraint, so ON CONFLICT DO NOTHING can't prevent
    // duplicates on its own — look up an existing org by normalized name first,
    // same pattern as POST /api/orgs, and reuse it instead of inserting a second row.
    const existing = orgKey
      ? await pool.query(
          `SELECT id FROM orgs WHERE regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = $1 LIMIT 1`,
          [orgKey]
        )
      : { rows: [] };

    let orgId;
    if (existing.rows.length) {
      orgId = existing.rows[0].id;
      if (suggesterId) {
        await pool.query(`UPDATE orgs SET added_by_user_id = COALESCE(added_by_user_id, $2) WHERE id = $1`, [orgId, suggesterId]);
      }
    } else {
      const inserted = await pool.query(
        `INSERT INTO orgs (name, subscription_status, validated_via, ein, website_url, propublica_verified, added_by_user_id)
         VALUES ($1, 'pending_subscription', 'admin', $2, $3, $4, $5)
         RETURNING id`,
        [orgName, ein, websiteUrl, ppVerified, suggesterId]
      );
      orgId = inserted.rows[0].id;
    }
    // Suggester automatically follows the org they suggested, once it's live.
    if (suggesterId) {
      await pool.query(
        `INSERT INTO user_org_preferences (user_id, org_id, followed) VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, org_id) DO UPDATE SET followed = TRUE`,
        [suggesterId, orgId]
      );
    }
    await pool.query(`UPDATE org_suggestions SET status = 'pending_subscription' WHERE id = $1`, [suggestionId]);
    return res.json({ status: 'ok', org_id: orgId, merged: existing.rows.length > 0 });
  } catch (e) {
    console.error('❌ approve suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/admin/suggestions/:id/edit', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  const orgName = String(req.body?.org_name || '').trim().slice(0, 500);
  const ein = String(req.body?.ein || '').trim().slice(0, 30) || null;
  const websiteUrl = String(req.body?.website_url || '').trim().slice(0, 500) || null;
  const propublicaVerified = !!req.body?.propublica_verified;
  if (!orgName) return res.status(400).json({ error: 'org_name required' });
  try {
    await pool.query(
      `UPDATE org_suggestions
       SET org_name = $1, ein = $2, website_url = $3, propublica_verified = $4
       WHERE id = $5`,
      [orgName, ein, websiteUrl, propublicaVerified, suggestionId]
    );
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ edit suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/admin/suggestions/:id/approve-for-user', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    const sug = await pool.query(`SELECT id, org_name, ein, propublica_verified FROM org_suggestions WHERE id = $1`, [suggestionId]);
    if (!sug.rows.length) return res.status(404).json({ error: 'Suggestion not found' });
    const orgName = String(sug.rows[0].org_name || '').trim().slice(0, 500);
    const ein = String(sug.rows[0].ein || '').trim().slice(0, 30) || null;
    const verified = !!sug.rows[0].propublica_verified;
    const orgKey = normalizeOrgKey(orgName);

    await pool.query(
      `UPDATE user_contributed_orgs
       SET org_name = $1, ein = $2, propublica_verified = $3
       WHERE regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = $4`,
      [orgName, ein, verified, orgKey]
    );
    await pool.query(`UPDATE org_suggestions SET status = 'approved_for_user' WHERE id = $1`, [suggestionId]);
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ approve-for-user suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

const ORG_CAUSAL_ADDRESS_RE = new RegExp(`^[a-z0-9]{3,30}@${CAUSAL_DOMAIN.replace(/\./g, '\\.')}$`);

app.get('/api/admin/org-causal-address-available', requireAdmin, async (req, res) => {
  const raw = String(req.query.causal_address || '').trim().toLowerCase();
  if (!raw || !ORG_CAUSAL_ADDRESS_RE.test(raw)) {
    return res.status(400).json({ available: false, error: 'Invalid address format' });
  }
  try {
    const conflict = await pool.query(
      `SELECT 1 FROM (
         SELECT causal_address AS addr FROM orgs
         UNION ALL
         SELECT causal_address AS addr FROM users
         UNION ALL
         SELECT address AS addr FROM user_addresses
       ) x
       WHERE LOWER(COALESCE(x.addr, '')) = LOWER($1)
       LIMIT 1`,
      [raw]
    );
    return res.json({ available: conflict.rows.length === 0 });
  } catch (e) {
    console.error('❌ org causal address availability:', e.message);
    return res.status(500).json({ available: false });
  }
});

app.post('/admin/suggestions/:id/subscribe-add', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  const causalAddress = String(req.body?.causal_address || '').trim().toLowerCase();
  const websiteUrl = String(req.body?.website_url || '').trim().slice(0, 500) || null;
  if (!ORG_CAUSAL_ADDRESS_RE.test(causalAddress)) return res.status(400).json({ error: 'Invalid causal_address' });
  try {
    const sug = await pool.query(`SELECT id, user_id, org_name, ein, propublica_verified, website_url FROM org_suggestions WHERE id = $1`, [suggestionId]);
    if (!sug.rows.length) return res.status(404).json({ error: 'Suggestion not found' });
    const s = sug.rows[0];
    const orgName = String(s.org_name || '').trim().slice(0, 500);
    const ein = String(s.ein || '').trim().slice(0, 30) || null;
    const verified = !!s.propublica_verified;
    const finalWebsite = websiteUrl || String(s.website_url || '').trim().slice(0, 500) || null;
    const suggesterId = s.user_id || null;

    const conflict = await pool.query(
      `SELECT 1 FROM (
         SELECT causal_address AS addr FROM orgs
         UNION ALL SELECT causal_address AS addr FROM users
         UNION ALL SELECT address AS addr FROM user_addresses
       ) x WHERE LOWER(COALESCE(x.addr, '')) = LOWER($1) LIMIT 1`,
      [causalAddress]
    );
    if (conflict.rows.length) return res.status(409).json({ error: 'Causal address unavailable' });

    // orgs.name has no unique constraint — reuse an existing org by normalized name
    // instead of inserting a duplicate (same fix as /approve above).
    const orgKey = normalizeOrgKey(orgName);
    const existing = orgKey
      ? await pool.query(
          `SELECT id, causal_address FROM orgs WHERE regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = $1 LIMIT 1`,
          [orgKey]
        )
      : { rows: [] };

    let orgId;
    if (existing.rows.length) {
      orgId = existing.rows[0].id;
      await pool.query(
        `UPDATE orgs SET
           causal_address = COALESCE(causal_address, $2),
           website_url = COALESCE(website_url, $3),
           added_by_user_id = COALESCE(added_by_user_id, $4)
         WHERE id = $1`,
        [orgId, causalAddress, finalWebsite, suggesterId]
      );
    } else {
      const inserted = await pool.query(
        `INSERT INTO orgs (name, ein, causal_address, subscription_status, propublica_verified, website_url, validated_via, added_by_user_id)
         VALUES ($1, $2, $3, 'pending_subscription', $4, $5, 'admin', $6)
         RETURNING id`,
        [orgName, ein, causalAddress, verified, finalWebsite, suggesterId]
      );
      orgId = inserted.rows[0].id;
    }
    if (suggesterId) {
      await pool.query(
        `INSERT INTO user_org_preferences (user_id, org_id, followed) VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, org_id) DO UPDATE SET followed = TRUE`,
        [suggesterId, orgId]
      );
    }
    await pool.query(
      `UPDATE org_suggestions
       SET status = 'pending_subscription',
           website_url = COALESCE($2, website_url)
       WHERE id = $1
          OR (
            regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = $3
            AND COALESCE(status, 'pending') = 'pending'
          )`,
      [suggestionId, finalWebsite, orgKey]
    );
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ subscribe-add suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});


app.post('/admin/users/:userId/user-type', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid user ID' });
    const { user_type } = req.body;
    const validTypes = ['individual_basic', 'independent_worker', 'org_worker'];
    if (!validTypes.includes(user_type)) return res.status(400).json({ error: 'Invalid user type' });
    await pool.query('UPDATE users SET user_type = $1 WHERE id = $2', [user_type, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error('POST /admin/users/:userId/user-type:', e.message);
    res.status(500).json({ error: 'Failed to update user type' });
  }
});

app.post('/admin/donation-url-suggestions/:id/approve', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    const sug = await pool.query(
      `SELECT org_id, suggested_url FROM org_donation_url_suggestions WHERE id = $1`,
      [suggestionId]
    );
    if (!sug.rows.length) return res.status(404).json({ error: 'Suggestion not found' });
    const orgId = sug.rows[0].org_id;
    const url = sug.rows[0].suggested_url;
    
    await pool.query(
      `UPDATE orgs SET donation_url = $1 WHERE id = $2`,
      [url, orgId]
    );
    await pool.query(`DELETE FROM org_donation_url_suggestions WHERE id = $1`, [suggestionId]);
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ approve donation url suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/admin/donation-url-suggestions/:id/reject', requireAdmin, async (req, res) => {
  const suggestionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM org_donation_url_suggestions WHERE id = $1`, [suggestionId]);
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ reject donation url suggestion:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/admin/community-opportunities/:id/approve', requireAdmin, async (req, res) => {
  const oppId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(oppId) || oppId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`UPDATE volunteer_opportunities SET approved = true, updated_at = NOW() WHERE id = $1`, [oppId]);
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ approve community opportunity:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/admin/community-opportunities/:id/reject', requireAdmin, async (req, res) => {
  const oppId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(oppId) || oppId < 1) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM volunteer_opportunities WHERE id = $1`, [oppId]);
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('❌ reject community opportunity:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [pendingOrgs, pipelineHealth, coopWorkspaces, donationUrlSuggestions, communityOpportunities, lastPageViews, recentPageViews] = await Promise.all([
      pool.query(
        `SELECT id, name, website_url
         FROM orgs
         WHERE COALESCE(subscription_status, 'active') = 'pending_subscription'
         ORDER BY name`
      ),
      pool.query(
        `WITH recent AS (
           SELECT o.id, o.name, COUNT(a.id)::int AS actions_7d
           FROM orgs o
           LEFT JOIN actions a ON a.org_id = o.id AND a.created_at > NOW() - INTERVAL '7 days'
           WHERE COALESCE(o.subscription_status, 'active') = 'active'
           GROUP BY o.id, o.name
         )
         SELECT * FROM recent ORDER BY actions_7d ASC, name ASC`
      ),
      pool
        // Cross-org read -- see migration 149 for why this must go through
        // a SECURITY DEFINER function once causal_app/RLS is enforced.
        .query(`SELECT * FROM admin_list_orgs_with_member_counts()`)
        .catch((coopErr) => {
          console.warn('⚠️ /admin: coop_members list failed:', coopErr.message);
          return { rows: [] };
        }),
      pool.query(
        `SELECT 
           dus.id,
           dus.org_id,
           dus.suggested_url,
           dus.created_at,
           o.name AS org_name,
           u.email AS user_email
         FROM org_donation_url_suggestions dus
         JOIN orgs o ON o.id = dus.org_id
         JOIN users u ON u.id = dus.user_id
         ORDER BY dus.created_at DESC`
      ).catch((err) => {
        console.warn('⚠️ /admin: donation url suggestions query failed:', err.message);
        return { rows: [] };
      }),
      pool.query(
        `SELECT vo.id, vo.title, vo.url, vo.location, vo.kind, vo.created_at, u.email AS user_email
         FROM volunteer_opportunities vo
         JOIN users u ON u.id = vo.submitted_by_user_id
         WHERE vo.approved = false
         ORDER BY vo.created_at DESC`
      ).catch((err) => {
        console.warn('⚠️ /admin: community opportunities query failed:', err.message);
        return { rows: [] };
      }),
      // Server-side fallback for "last login" (session-based, only updates on a fresh login) --
      // this reflects actual page loads and isn't blocked by client-side ad blockers. See
      // migration 168 + logPageView() in server/auth.js.
      pool.query(`SELECT user_id, MAX(created_at) AS last_page_view_at FROM page_views GROUP BY user_id`)
        .catch((err) => {
          console.warn('⚠️ /admin: page_views aggregate failed (run db/migrations/168_page_views.sql):', err.message);
          return { rows: [] };
        }),
      pool.query(
        `SELECT pv.path, pv.created_at, COALESCE(u.email, '(anonymous)') AS user_email
         FROM page_views pv
         LEFT JOIN users u ON u.id = pv.user_id
         ORDER BY pv.created_at DESC
         LIMIT 100`
      ).catch((err) => {
        console.warn('⚠️ /admin: recent page_views query failed (run db/migrations/168_page_views.sql):', err.message);
        return { rows: [] };
      }),
    ]);

    let users;
    let coopAccessMigrationBanner = '';
    try {
      users = await pool.query(
        `SELECT
           u.id AS user_id,
           COALESCE(u.email, ae.email) AS email,
           ae.invited_by,
           ae.invited_at,
           u.causal_address,
           u.forwarding_address,
           u.created_at AS signed_up_at,
           u.first_login_at,
           COALESCE(u.coop_access, false) AS coop_access,
           COALESCE(u.user_type, 'individual_basic') AS user_type,
           COUNT(DISTINCT uop.org_id)::int AS org_count,
           COUNT(DISTINCT ua.id)::int AS action_count,
           MAX(s.created_at) AS last_login_at
         FROM allowed_emails ae
         FULL OUTER JOIN users u ON LOWER(u.email) = LOWER(ae.email)
         LEFT JOIN user_org_preferences uop ON uop.user_id = u.id
         LEFT JOIN user_actions ua ON ua.user_id = u.id
         LEFT JOIN sessions s ON s.user_id = u.id
         GROUP BY u.id, ae.email, u.email, ae.invited_by, ae.invited_at, u.causal_address, u.forwarding_address, u.created_at, u.first_login_at, u.coop_access, u.user_type
         ORDER BY COALESCE(u.created_at, ae.invited_at) DESC`
      );
    } catch (userListErr) {
      if (userListErr.message && /coop_access|column .* does not exist/i.test(userListErr.message)) {
        console.warn('⚠️ /admin: users.coop_access missing — run db/migrations/040_users_coop_access.sql');
        users = await pool.query(
          `SELECT
             u.id AS user_id,
             COALESCE(u.email, ae.email) AS email,
             ae.invited_by,
             ae.invited_at,
             u.causal_address,
             u.forwarding_address,
             u.created_at AS signed_up_at,
             u.first_login_at,
             FALSE AS coop_access,
             COALESCE(u.user_type, 'individual_basic') AS user_type,
             COUNT(DISTINCT uop.org_id)::int AS org_count,
             COUNT(DISTINCT ua.id)::int AS action_count,
             MAX(s.created_at) AS last_login_at
           FROM allowed_emails ae
           FULL OUTER JOIN users u ON LOWER(u.email) = LOWER(ae.email)
           LEFT JOIN user_org_preferences uop ON uop.user_id = u.id
           LEFT JOIN user_actions ua ON ua.user_id = u.id
           LEFT JOIN sessions s ON s.user_id = u.id
           GROUP BY u.id, ae.email, u.email, ae.invited_by, ae.invited_at, u.causal_address, u.forwarding_address, u.created_at, u.first_login_at, u.user_type
           ORDER BY COALESCE(u.created_at, ae.invited_at) DESC`
        );
        coopAccessMigrationBanner =
          '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px 14px;border-radius:8px;margin:0 0 16px;font-size:13px;max-width:900px;">' +
          '<strong>Database:</strong> column <code>users.coop_access</code> is missing. Apply <code>db/migrations/040_users_coop_access.sql</code> and restart the app. Until then, nonprofit toggles will not persist.</div>';
      } else {
        throw userListErr;
      }
    }
    let suggestions;
    try {
      suggestions = await pool.query(
        `WITH c AS (
           SELECT normalize_org_key.org_key, COUNT(*)::int AS users_count,
                  MAX(CASE WHEN propublica_verified THEN ein ELSE NULL END) AS ein,
                  BOOL_OR(propublica_verified) AS verified
           FROM (
             SELECT regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') AS org_key,
                    propublica_verified, ein
             FROM user_contributed_orgs
           ) normalize_org_key
           GROUP BY normalize_org_key.org_key
         )
         SELECT
           s.id,
           s.org_name,
           COALESCE(NULLIF(TRIM(s.ein), ''), c.ein) AS ein,
           COALESCE(s.propublica_verified, false) OR COALESCE(c.verified, false) AS verified,
           COALESCE(c.users_count, 0) AS users_count,
           s.website_url
         FROM org_suggestions s
         LEFT JOIN c ON c.org_key = regexp_replace(regexp_replace(lower(s.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
         WHERE COALESCE(s.status, 'pending') = 'pending'
           AND NOT EXISTS (
             SELECT 1
             FROM orgs o2
             WHERE regexp_replace(regexp_replace(lower(o2.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
               = regexp_replace(regexp_replace(lower(s.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
               AND COALESCE(o2.subscription_status, 'active') IN ('pending_subscription', 'active')
           )
         ORDER BY s.created_at DESC`
      );
    } catch (e) {
      if (e.message && /column s\.(ein|propublica_verified|status|website_url) does not exist/i.test(e.message)) {
        suggestions = await pool.query(
          `WITH c AS (
             SELECT normalize_org_key.org_key, COUNT(*)::int AS users_count,
                    MAX(CASE WHEN propublica_verified THEN ein ELSE NULL END) AS ein,
                    BOOL_OR(propublica_verified) AS verified
             FROM (
               SELECT regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') AS org_key,
                      propublica_verified, ein
               FROM user_contributed_orgs
             ) normalize_org_key
             GROUP BY normalize_org_key.org_key
           )
           SELECT
             s.id,
             s.org_name,
             c.ein AS ein,
             COALESCE(c.verified, false) AS verified,
             COALESCE(c.users_count, 0) AS users_count,
             NULL::text AS website_url
           FROM org_suggestions s
           LEFT JOIN c ON c.org_key = regexp_replace(regexp_replace(lower(s.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
           WHERE NOT EXISTS (
             SELECT 1
             FROM orgs o2
             WHERE regexp_replace(regexp_replace(lower(o2.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
               = regexp_replace(regexp_replace(lower(s.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
               AND COALESCE(o2.subscription_status, 'active') IN ('pending_subscription', 'active')
           )
           ORDER BY s.created_at DESC`
        );
      } else {
        throw e;
      }
    }

    const rowsPending = pendingOrgs.rows.map((o) =>
      `<tr><td>${escapeHtml(o.name)}</td><td>${escapeHtml(o.website_url || '—')}</td><td>
        <a href="/admin/validate-org?org_id=${Number(o.id)}&token=${encodeURIComponent(crypto.createHmac('sha256', process.env.ADMIN_VALIDATE_SECRET || process.env.SESSION_SECRET || 'change-me').update(String(o.id)).digest('hex'))}">Activate</a>
      </td></tr>`
    ).join('');

    const rowsSuggestions = suggestions.rows.map((s) =>
      `<tr data-suggestion-id="${Number(s.id)}" data-org-name="${escapeHtml(s.org_name)}" data-ein="${escapeHtml(s.ein || '')}" data-website-url="${escapeHtml(s.website_url || '')}" data-verified="${s.verified ? '1' : '0'}">
        <td>${escapeHtml(s.org_name)}</td>
        <td>${s.verified ? (s.ein ? escapeHtml(s.ein) : '—') : '—'}</td>
        <td>${s.verified ? 'Verified nonprofit' : '—'}</td>
        <td>${Number(s.users_count) || 0}</td>
        <td>
          <button onclick="openEditSuggestion(${Number(s.id)})">Edit</button>
          <button onclick="approveForUser(${Number(s.id)})">Approve for User</button>
          <button onclick="openSubscribeAdd(${Number(s.id)})">Subscribe & Add</button>
          <button onclick="rejectSuggestion(${Number(s.id)})">Reject</button>
        </td>
      </tr>`
    ).join('');

    const rowsPipeline = pipelineHealth.rows.map((p) =>
      `<tr><td>${escapeHtml(p.name)}</td><td>${Number(p.actions_7d) || 0}</td><td>${Number(p.actions_7d) === 0 ? '⚠ zero recent activity' : ''}</td></tr>`
    ).join('');

    const coopOrgRows =
      coopWorkspaces && Array.isArray(coopWorkspaces.rows) ? coopWorkspaces.rows : [];
    const rowsCoopWorkspaces = coopOrgRows
      .map((o) => {
        const sid = Number(o.id);
        const slug = String(o.slug || '');
        const created = o.created_at
          ? new Date(o.created_at).toISOString().slice(0, 19).replace('T', ' ')
          : '—';
        return `<tr><td>${sid}</td><td>${escapeHtml(String(o.display_name || ''))}</td><td><code style="font-size:12px;">${escapeHtml(slug || '—')}</code></td><td style="font-size:11px;white-space:nowrap;">${created}</td><td>${Number(o.member_count) || 0}</td><td><button type="button" class="admin-coop-del" data-coop-id="${sid}" data-coop-slug-enc="${Buffer.from(slug, 'utf8').toString('base64')}">Delete</button></td></tr>`;
      })
      .join('');
    const coopWorkspacesTbody =
      coopOrgRows.length === 0
        ? '<tr><td colspan="6">No NP workspaces yet (empty list), or <code>coop_members</code> / <code>org_users</code> missing — apply NP migrations and restart the app.</td></tr>'
        : rowsCoopWorkspaces;

    const fmtLastLogin = (t) => {
      if (!t) return '—';
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };
    const lastPageViewByUserId = new Map(
      lastPageViews.rows.map((r) => [Number(r.user_id), r.last_page_view_at])
    );
    const rowsUsers = users.rows.map((u) => {
      const isRegistered = u.user_id !== null && u.user_id !== undefined;
      const uid = isRegistered ? Number(u.user_id) : null;
      const coopOn = !!u.coop_access;
      const userType = String(u.user_type || 'individual_basic');
      const statusCell = isRegistered
        ? `<span style="color:#16a34a;">✓ signed up</span> <span style="color:#9ca3af;font-size:11px;">${new Date(u.signed_up_at).toISOString().slice(0, 10)}</span>`
        : '<span style="color:#b45309;">pending invite</span>';
      const npCell = isRegistered
        ? `<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;"><input type="checkbox" ${coopOn ? 'checked' : ''} onchange="setUserCoopAccess(${uid}, this.checked)" /> nonprofit</label>`
        : '—';
      const userTypeCell = isRegistered
        ? `<select onchange="setUserType(${uid}, this.value)" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;"><option value="individual_basic"${userType === 'individual_basic' ? ' selected' : ''}>Public</option><option value="independent_worker"${userType === 'independent_worker' ? ' selected' : ''}>Independent worker</option><option value="org_worker"${userType === 'org_worker' ? ' selected' : ''}>Org worker</option></select>`
        : '—';
      const actionCell = isRegistered && userType === 'demo'
        ? '<span style="color:#9ca3af;font-size:11px;">demo account</span>'
        : isRegistered
        ? `<button type="button" class="admin-user-del" data-user-id="${uid}" data-user-email-enc="${Buffer.from(String(u.email || ''), 'utf8').toString('base64')}">Delete</button>`
        : `<button type="button" class="admin-allowed-email-del" data-email="${escapeHtml(u.email)}">Remove invite</button>`;
      const lastPageViewAt = isRegistered ? lastPageViewByUserId.get(uid) : null;
      return `<tr><td>${escapeHtml(u.email)}</td><td>${statusCell}</td><td>${escapeHtml(u.invited_by || '—')}</td><td>${escapeHtml(u.causal_address || '')}</td><td>${escapeHtml(u.forwarding_address || '')}</td><td style="font-size:11px;white-space:nowrap;">${fmtLastLogin(u.first_login_at)}</td><td style="font-size:11px;white-space:nowrap;">${fmtLastLogin(u.last_login_at)}</td><td style="font-size:11px;white-space:nowrap;">${fmtLastLogin(lastPageViewAt)}</td><td>${Number(u.org_count) || 0}</td><td>${Number(u.action_count) || 0}</td><td style="text-align:center">${npCell}</td><td>${userTypeCell}</td><td>${actionCell}</td></tr>`;
    }).join('');
    const rowsRecentPageViews = recentPageViews.rows.map((pv) =>
      `<tr><td>${escapeHtml(pv.user_email)}</td><td><code style="font-size:12px;">${escapeHtml(pv.path)}</code></td><td style="font-size:11px;white-space:nowrap;">${fmtLastLogin(pv.created_at)}</td></tr>`
    ).join('');

    const nRows = (html) => (String(html).match(/<tr/g) || []).length;
    const excludeMeOnPage = req.query.exclude_me === '1';
    let demoVisitsHtml;
    try {
      const visitKey = await getDemoVisitKey();
      demoVisitsHtml = renderDemoVisitsSection(
        await loadDemoVisitSummary(excludeMeOnPage ? demoVisitorHash(req, visitKey) : null),
        excludeMeOnPage
      );
    } catch (visitErr) {
      console.warn('⚠️ /admin: demo visit summary failed (run db/migrations/286_demo_visit_log.sql):', visitErr.message);
      demoVisitsHtml = renderDemoVisitsSection(null, false);
    }

    res.set('Content-Type', 'text/html').set('Cache-Control', 'no-store').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Causal Admin</title>
<style>
body { font-family: system-ui, sans-serif; margin:0; background:#fff; color:#111827; }
header { background:#800020; color:#fff; padding:14px 18px; font-weight:700; }
main { padding:16px; max-width:1100px; margin:0 auto; }
h2 { margin:20px 0 10px; font-size:18px; }
details > summary { margin:20px 0 10px; font-size:18px; font-weight:600; cursor:pointer; }
table { width:100%; border-collapse:collapse; margin-bottom:14px; }
th,td { border:1px solid #e5e7eb; padding:8px; text-align:left; font-size:13px; vertical-align:top; }
th { background:#f9fafb; }
button { padding:6px 10px; border:1px solid #d1d5db; background:#fff; border-radius:6px; cursor:pointer; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: #fff; width: min(560px, 92vw); border-radius: 12px; padding: 14px; }
.modal h3 { margin: 0 0 10px; font-size: 16px; }
.modal label { font-size: 12px; color: #374151; display: block; margin: 8px 0 4px; }
.modal input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; }
.modal-row { display: flex; gap: 8px; align-items: flex-end; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.pp-match { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; margin-top: 8px; cursor: pointer; }
.pp-match:hover { border-color: #9ca3af; background: #f9fafb; }
.admin-coop-del { border-color:#fecaca !important; background:#fef2f2 !important; color:#991b1b !important; }
.admin-user-del { border-color:#fecaca !important; background:#fef2f2 !important; color:#991b1b !important; }
</style></head>
<body><header>Causal Admin</header><main>
<p style="font-size:13px;margin:0 0 14px;"><a href="/admin/accounting-review">Accounting module review →</a> <span style="color:#6b7280;">(what is built, what is planned, ideas, questions)</span></p>
<p style="font-size:13px;margin:0 0 14px;"><a href="/organizational/cooperative/pod-management">Solid Pod Management →</a> <span style="color:#6b7280;">(platform-admin only; pod status/sync across every org)</span></p>
<details open><summary>Demo visitors</summary>
${demoVisitsHtml}
</details>
${coopAccessMigrationBanner}
<details open><summary>Users &amp; invites</summary>
<p style="font-size:12px;color:#6b7280;max-width:720px;">Signup and login are gated by the invite list below. Every row is either a pending invite (no account yet) or a signed-up user &mdash; the <strong>Status</strong> column shows which. Civic app access is the default for all accounts; toggle <strong>nonprofit</strong> to grant <code>/np/</code> and <code>/api/np/*</code> on the same login. <strong>User type</strong> controls cooperative icon visibility (workers only). <strong>Causal address</strong> is the friendly handle@${CAUSAL_DOMAIN} alias for subscribing to orgs; <strong>Forwarding address</strong> is the address the individual app actually hands out for forwarding petition/action emails &mdash; they can differ per user (legacy accounts especially) and both are shown here for that reason. Deleting a signed-up user also removes their invite entry, so they can't sign back up without a new invite.</p>
<form id="invite-form" style="display:flex;gap:8px;max-width:560px;margin-bottom:10px;">
  <input type="email" id="invite-email" placeholder="email@example.com" required style="flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
  <button type="submit">Invite</button>
</form>
<p style="font-size:11px;color:#9ca3af;max-width:560px;margin:-4px 0 10px;">Adds the email to the allowlist, creates the account, and emails them a link to set their password.</p>
<table><thead><tr><th>Email</th><th>Status</th><th>Invited by</th><th>Causal address</th><th>Forwarding address</th><th>First login</th><th>Last login</th><th>Last platform access</th><th>Org count</th><th>Action count</th><th>NP access</th><th>User type</th><th>Action</th></tr></thead><tbody id="users-body">${rowsUsers || '<tr><td colspan="13">No users or invites</td></tr>'}</tbody></table>
</details>
<details><summary id="coop-workspaces-admin">Nonprofit workspaces (<code>coop_members</code>) (${coopOrgRows.length})</summary>
<p style="font-size:12px;color:#6b7280;max-width:900px;">Test cleanup: deleting a row removes the NP workspace and cascades to members, chart of accounts, budgets, programs, grants, Xero connection data, and related rows. Does not delete civic <code>orgs</code> directory records.</p>
<table><thead><tr><th>ID</th><th>Display name</th><th>Slug</th><th>Created</th><th>Members</th><th>Action</th></tr></thead><tbody id="coop-workspaces-body">${coopWorkspacesTbody}</tbody></table>
</details>
<details><summary>Pending org activations (${nRows(rowsPending)})</summary>
<table><thead><tr><th>Org</th><th>Website URL</th><th>Action</th></tr></thead><tbody>${rowsPending || '<tr><td colspan="3">No pending activations</td></tr>'}</tbody></table>
</details>
<details><summary>Pick list suggestions (${nRows(rowsSuggestions)})</summary>
<table><thead><tr><th>Org</th><th>EIN</th><th>Status</th><th>Users</th><th>Actions</th></tr></thead><tbody id="suggestions-body">${rowsSuggestions || '<tr><td colspan="5">No suggestions</td></tr>'}</tbody></table>
</details>
<details><summary>Donation URL suggestions (${donationUrlSuggestions.rows.length})</summary>
<table><thead><tr><th>Org</th><th>Suggested URL</th><th>User</th><th>Actions</th></tr></thead><tbody id="donation-url-suggestions-body">${donationUrlSuggestions.rows.length > 0 ? donationUrlSuggestions.rows.map((d) => `<tr data-donation-suggestion-id="${Number(d.id)}"><td>${escapeHtml(d.org_name)}</td><td><a href="${escapeHtml(d.suggested_url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;max-width:300px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;">${escapeHtml(d.suggested_url)}</a></td><td>${escapeHtml(d.user_email)}</td><td><button onclick="approveDonationUrl(${Number(d.id)})">Approve</button> <button onclick="rejectDonationUrl(${Number(d.id)})">Reject</button></td></tr>`).join('') : '<tr><td colspan="4">No donation URL suggestions</td></tr>'}</tbody></table>
</details>
<details><summary>Community opportunity suggestions (${communityOpportunities.rows.length})</summary>
<table><thead><tr><th>Title</th><th>URL</th><th>Location</th><th>Kind</th><th>User</th><th>Actions</th></tr></thead><tbody id="community-opportunities-body">${communityOpportunities.rows.length > 0 ? communityOpportunities.rows.map((c) => `<tr data-community-opportunity-id="${Number(c.id)}"><td>${escapeHtml(c.title)}</td><td><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;max-width:260px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;">${escapeHtml(c.url)}</a></td><td>${escapeHtml(c.location || '—')}</td><td>${escapeHtml(c.kind)}</td><td>${escapeHtml(c.user_email)}</td><td><button onclick="approveCommunityOpportunity(${Number(c.id)})">Approve</button> <button onclick="rejectCommunityOpportunity(${Number(c.id)})">Reject</button></td></tr>`).join('') : '<tr><td colspan="6">No community opportunity suggestions</td></tr>'}</tbody></table>
</details>
<details><summary>Pipeline health (last 7 days) (${nRows(rowsPipeline)})</summary>
<table><thead><tr><th>Org</th><th>Actions ingested</th><th>Flag</th></tr></thead><tbody>${rowsPipeline || '<tr><td colspan="3">No org data</td></tr>'}</tbody></table>
</details>
<details><summary>Recent page views (${nRows(rowsRecentPageViews)})</summary>
<p style="font-size:12px;color:#6b7280;max-width:900px;">Server-side page load log (migration 168) &mdash; recorded directly by the server, so it isn't affected by ad blockers the way the GA4 tag is. "Last login" above only updates on a fresh sign-in (session cookies last 30 days), while <strong>Last platform access</strong> reflects the most recent real page load. Covers every organizational page and the individual app shell; does not cover in-app tab switches within the individual app (those don't reload the page). Last 100 page loads across all users.</p>
<table><thead><tr><th>User</th><th>Path</th><th>When</th></tr></thead><tbody id="page-views-body">${rowsRecentPageViews || '<tr><td colspan="3">No page views logged yet</td></tr>'}</tbody></table>
</details>
</main>
<div id="edit-suggestion-modal" class="modal-overlay" onclick="if(event.target===this)closeEditSuggestion()">
  <div class="modal">
    <h3>Edit picklist suggestion</h3>
    <label>Org name</label>
    <div class="modal-row">
      <input id="edit-org-name" type="text" />
      <button type="button" onclick="lookupPropublica()">ProPublica lookup</button>
    </div>
    <div id="pp-results"></div>
    <label>EIN</label>
    <input id="edit-org-ein" type="text" />
    <label>Website URL</label>
    <input id="edit-org-website" type="text" />
    <div class="modal-actions">
      <button type="button" onclick="closeEditSuggestion()">Cancel</button>
      <button type="button" onclick="saveEditSuggestion()">Save</button>
    </div>
  </div>
</div>
<div id="subscribe-add-modal" class="modal-overlay" onclick="if(event.target===this)closeSubscribeAdd()">
  <div class="modal">
    <h3>Subscribe & Add org</h3>
    <label>Org name</label>
    <input id="subadd-org-name" type="text" readonly />
    <label>EIN</label>
    <input id="subadd-ein" type="text" readonly />
    <label>Org website URL</label>
    <div class="modal-row">
      <input id="subadd-website" type="text" oninput="updateWebsiteHelperLink()" />
      <button type="button" onclick="openWebsiteSearch()">Search URL</button>
    </div>
    <div id="subadd-website-helper" style="display:none;margin-top:6px;font-size:12px;">
      <a id="subadd-find-website-link" href="#" target="_blank" rel="noopener noreferrer">Find website ↗</a>
      <span style="color:#6b7280;">(helper link, does not auto-fill)</span>
    </div>
    <label>Causal address</label>
    <input id="subadd-causal-address" type="text" placeholder="orghandle@${CAUSAL_DOMAIN}" oninput="checkSubaddAddress()" />
    <div id="subadd-address-status" style="margin-top:6px;font-size:12px;color:#6b7280;"></div>
    <p style="font-size:12px;color:#4b5563;margin-top:10px;">After saving, subscribe <span id="subadd-reminder-address">[causal address]</span> to this org's mailing list at the URL above. The org will activate automatically when the first email arrives.</p>
    <div style="margin-top:12px;padding:10px 12px;border-left:3px solid #94a3b8;background:#f8fafc;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.03em;">Placeholder — follow-up to org (draft for discussion)</p>
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.5;">After setup, send the org a short note that: acknowledges their Causal platform signup; briefly introduces Causal; invites them to claim their org profile on Causal when that is available; and includes a human contact address (not the ingest mailbox). Suggested contact to share: <strong><a href="mailto:${escapeHtml(ADMIN_EMAIL)}">${escapeHtml(ADMIN_EMAIL)}</a></strong> <span style="color:#64748b;">(from <code>ADMIN_EMAIL</code>)</span></p>
    </div>
    <div class="modal-actions">
      <button type="button" onclick="closeSubscribeAdd()">Cancel</button>
      <button id="subadd-save-btn" type="button" onclick="saveSubscribeAdd()" disabled>Save</button>
    </div>
  </div>
</div>
<script>
let editSuggestionId = null;
let editVerified = false;
let subaddSuggestionId = null;
let subaddAddressAvailable = false;
function openEditSuggestion(id) {
  const row = document.querySelector('tr[data-suggestion-id="' + id + '"]');
  if (!row) return;
  editSuggestionId = id;
  editVerified = row.getAttribute('data-verified') === '1';
  document.getElementById('edit-org-name').value = row.getAttribute('data-org-name') || '';
  document.getElementById('edit-org-ein').value = row.getAttribute('data-ein') || '';
  document.getElementById('edit-org-website').value = row.getAttribute('data-website-url') || '';
  document.getElementById('pp-results').innerHTML = '';
  document.getElementById('edit-suggestion-modal').classList.add('active');
}
function closeEditSuggestion() {
  document.getElementById('edit-suggestion-modal').classList.remove('active');
  editSuggestionId = null;
  document.getElementById('edit-org-website').value = '';
}
async function lookupPropublica() {
  const q = (document.getElementById('edit-org-name').value || '').trim();
  if (q.length < 2) return;
  const r = await fetch('/api/propublica/search-orgs?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
  const data = await r.json().catch(() => ({ results: [] }));
  const out = document.getElementById('pp-results');
  const items = Array.isArray(data.results) ? data.results.slice(0, 3) : [];
  out.innerHTML = items.map((it, idx) => {
    const where = [it.city, it.state].filter(Boolean).join(', ');
    return '<div class="pp-match" onclick="selectPpMatch(' + idx + ')"><div style="font-weight:600;">' + (it.name || '') + '</div><div style="font-size:12px;color:#6b7280;">' + (where || 'Location unavailable') + '</div></div>';
  }).join('');
  window.__ppMatches = items;
}
function selectPpMatch(idx) {
  const items = Array.isArray(window.__ppMatches) ? window.__ppMatches : [];
  const pick = items[idx];
  if (!pick) return;
  document.getElementById('edit-org-name').value = pick.name || '';
  document.getElementById('edit-org-ein').value = pick.ein || '';
  document.getElementById('edit-org-website').value = pick.website_url || '';
  editVerified = !!pick.ein;
}
async function saveEditSuggestion() {
  if (!editSuggestionId) return;
  const org_name = (document.getElementById('edit-org-name').value || '').trim();
  const ein = (document.getElementById('edit-org-ein').value || '').trim();
  const website_url = (document.getElementById('edit-org-website').value || '').trim();
  if (!org_name) return;
  const r = await fetch('/admin/suggestions/' + editSuggestionId + '/edit', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_name, ein, website_url, propublica_verified: !!editVerified })
  });
  if (r.ok) location.reload();
}
async function approveForUser(id) {
  const r = await fetch('/admin/suggestions/' + id + '/approve-for-user', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
function openSubscribeAdd(id) {
  const row = document.querySelector('tr[data-suggestion-id="' + id + '"]');
  if (!row) return;
  subaddSuggestionId = id;
  document.getElementById('subadd-org-name').value = row.getAttribute('data-org-name') || '';
  document.getElementById('subadd-ein').value = row.getAttribute('data-ein') || '';
  document.getElementById('subadd-website').value = row.getAttribute('data-website-url') || '';
  updateWebsiteHelperLink();
  maybePrefillWebsiteFromPropublica();
  document.getElementById('subadd-causal-address').value = '';
  document.getElementById('subadd-address-status').textContent = '';
  document.getElementById('subadd-reminder-address').textContent = '[causal address]';
  subaddAddressAvailable = false;
  document.getElementById('subadd-save-btn').disabled = true;
  document.getElementById('subscribe-add-modal').classList.add('active');
}
async function maybePrefillWebsiteFromPropublica() {
  const websiteEl = document.getElementById('subadd-website');
  if (!websiteEl) return;
  const current = (websiteEl.value || '').trim();
  if (current) return;
  const orgName = (document.getElementById('subadd-org-name').value || '').trim();
  if (orgName.length < 2) return;
  try {
    const r = await fetch('/api/propublica/search-orgs?q=' + encodeURIComponent(orgName), { credentials: 'same-origin', cache: 'no-store' });
    const data = await r.json().catch(() => ({ results: [] }));
    const first = Array.isArray(data.results) ? data.results[0] : null;
    const foundWebsite = first && first.website_url ? String(first.website_url).trim() : '';
    if (foundWebsite && !websiteEl.value.trim()) {
      websiteEl.value = foundWebsite;
      updateWebsiteHelperLink();
    }
  } catch (_) {}
}
function updateWebsiteHelperLink() {
  const website = (document.getElementById('subadd-website').value || '').trim();
  const orgName = (document.getElementById('subadd-org-name').value || '').trim();
  const helper = document.getElementById('subadd-website-helper');
  const link = document.getElementById('subadd-find-website-link');
  if (!helper || !link) return;
  if (website) {
    helper.style.display = 'none';
    return;
  }
  const query = orgName ? (orgName + ' nonprofit website') : 'nonprofit website';
  link.href = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  helper.style.display = 'block';
}
function closeSubscribeAdd() {
  document.getElementById('subscribe-add-modal').classList.remove('active');
  subaddSuggestionId = null;
}
function openWebsiteSearch() {
  const orgName = (document.getElementById('subadd-org-name').value || '').trim();
  const query = orgName ? (orgName + ' nonprofit website') : 'nonprofit website';
  window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener');
}
async function checkSubaddAddress() {
  const val = (document.getElementById('subadd-causal-address').value || '').trim().toLowerCase();
  const statusEl = document.getElementById('subadd-address-status');
  document.getElementById('subadd-reminder-address').textContent = val || '[causal address]';
  if (!/^[a-z0-9]{3,30}@${CAUSAL_DOMAIN.replace(/\./g, '\\\\.')}$/.test(val)) {
    statusEl.textContent = 'Use lowercase letters/numbers, 3-30 chars, ending with @${CAUSAL_DOMAIN}';
    subaddAddressAvailable = false;
    document.getElementById('subadd-save-btn').disabled = true;
    return;
  }
  statusEl.textContent = 'Checking...';
  const r = await fetch('/api/admin/org-causal-address-available?causal_address=' + encodeURIComponent(val), { credentials: 'same-origin', cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  subaddAddressAvailable = !!data.available;
  statusEl.textContent = subaddAddressAvailable ? '✓ Available' : '✗ Already taken';
  document.getElementById('subadd-save-btn').disabled = !subaddAddressAvailable;
}
async function saveSubscribeAdd() {
  if (!subaddSuggestionId || !subaddAddressAvailable) return;
  const payload = {
    website_url: (document.getElementById('subadd-website').value || '').trim(),
    causal_address: (document.getElementById('subadd-causal-address').value || '').trim().toLowerCase()
  };
  const r = await fetch('/admin/suggestions/' + subaddSuggestionId + '/subscribe-add', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (r.ok) {
    closeSubscribeAdd();
    location.reload();
    return;
  }
  alert('Save failed');
}
async function rejectSuggestion(id) {
  const r = await fetch('/admin/suggestions/' + id + '/reject', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
async function approveDonationUrl(id) {
  const r = await fetch('/admin/donation-url-suggestions/' + id + '/approve', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
async function rejectDonationUrl(id) {
  const r = await fetch('/admin/donation-url-suggestions/' + id + '/reject', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
async function approveCommunityOpportunity(id) {
  const r = await fetch('/admin/community-opportunities/' + id + '/approve', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
async function rejectCommunityOpportunity(id) {
  const r = await fetch('/admin/community-opportunities/' + id + '/reject', { method: 'POST', credentials: 'same-origin' });
  if (r.ok) location.reload();
}
async function setUserCoopAccess(userId, coop_access) {
  const r = await fetch('/admin/users/' + userId + '/np-access', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coop_access })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    alert(data.error || 'Could not update NP access (run migration 040 if column missing)');
    location.reload();
  }
}
async function setUserType(userId, user_type) {
  const r = await fetch('/admin/users/' + userId + '/user-type', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_type })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    alert(data.error || 'Could not update user type');
    location.reload();
  }
}
function decodeCoopSlugB64(enc) {
  try {
    const bin = atob(String(enc || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
    return new TextDecoder('utf-8').decode(bytes);
  } catch (_) {
    return '';
  }
}
document.addEventListener('click', function (ev) {
  const btn = ev.target && ev.target.closest && ev.target.closest('button.admin-coop-del');
  if (!btn) return;
  const id = Number.parseInt(String(btn.getAttribute('data-coop-id') || ''), 10);
  if (!Number.isInteger(id) || id < 1) return;
  const slug = decodeCoopSlugB64(btn.getAttribute('data-coop-slug-enc'));
  const label = slug ? '"' + slug + '"' : 'id ' + id;
  if (!confirm('Permanently delete NP workspace ' + label + '? Cascades to accounts, budgets, programs, grants, Xero tokens, and memberships.')) return;
  fetch('/admin/np-orgs/' + id + '/delete', { method: 'POST', credentials: 'same-origin' })
    .then(function (r) {
      return r.json().then(function (data) {
        return { r: r, data: data };
      });
    })
    .then(function (x) {
      if (x.r.ok) location.reload();
      else alert((x.data && x.data.error) || 'Delete failed');
    })
    .catch(function () {
      alert('Delete failed');
    });
});
document.addEventListener('click', function (ev) {
  const btn = ev.target && ev.target.closest && ev.target.closest('button.admin-user-del');
  if (!btn) return;
  const id = Number.parseInt(String(btn.getAttribute('data-user-id') || ''), 10);
  if (!Number.isInteger(id) || id < 1) return;
  const email = decodeCoopSlugB64(btn.getAttribute('data-user-email-enc'));
  const label = email ? '"' + email + '"' : 'id ' + id;
  if (!confirm('Permanently delete user ' + label + ' and all their data? This cascades to their org memberships, actions, pledges, signatures, contributions, and every other row keyed to this account. This cannot be undone.')) return;
  fetch('/admin/users/' + id + '/delete', { method: 'POST', credentials: 'same-origin' })
    .then(function (r) {
      return r.json().then(function (data) {
        return { r: r, data: data };
      });
    })
    .then(function (x) {
      if (x.r.ok) location.reload();
      else alert((x.data && x.data.error) || 'Delete failed');
    })
    .catch(function () {
      alert('Delete failed');
    });
});
function submitAllowedEmail(sendInvite) {
  const input = document.getElementById('invite-email');
  const email = input.value.trim();
  if (!email) return;
  fetch('/admin/allowed-emails', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, send_invite: sendInvite }),
  })
    .then(function (r) {
      return r.json().then(function (data) {
        return { r: r, data: data };
      });
    })
    .then(function (x) {
      if (x.r.ok) location.reload();
      else alert((x.data && x.data.error) || 'Add failed');
    })
    .catch(function () {
      alert('Add failed');
    });
}
document.getElementById('invite-form').addEventListener('submit', function (ev) {
  ev.preventDefault();
  submitAllowedEmail(true);
});
document.addEventListener('click', function (ev) {
  const btn = ev.target && ev.target.closest && ev.target.closest('button.admin-allowed-email-del');
  if (!btn) return;
  if (btn.disabled) return;
  const email = btn.getAttribute('data-email') || '';
  if (!email) return;
  if (!confirm('Remove invite for "' + email + '"? They will no longer be able to sign up or log in unless re-invited.')) return;
  btn.disabled = true;
  btn.textContent = 'Removing…';
  fetch('/admin/allowed-emails/' + encodeURIComponent(email) + '/delete', { method: 'POST', credentials: 'same-origin' })
    .then(function (r) {
      return r.json().then(function (data) {
        return { r: r, data: data };
      });
    })
    .then(function (x) {
      if (x.r.ok) {
        const row = btn.closest('tr');
        if (row) row.remove();
      } else {
        alert((x.data && x.data.error) || 'Remove failed');
        btn.disabled = false;
        btn.textContent = 'Remove';
      }
    })
    .catch(function () {
      alert('Remove failed');
      btn.disabled = false;
      btn.textContent = 'Remove';
    });
});
</script>
</body></html>`);
  } catch (e) {
    console.error('❌ /admin:', e.message);
    res.status(500).send('Admin load failed');
  }
});


// ── Digest scheduler ─────────────────────────────────────────────────────────
async function runDigestJob() {
  console.log('📬 Running digest job...');
  try {
    const now = new Date();
    const candidates = await pool.query(`
      SELECT id, email, location_country, digest_frequency, digest_last_sent_at
      FROM users
      WHERE digest_frequency IN ('daily', 'weekly')
    `);

    for (const user of candidates.rows) {
      const last = user.digest_last_sent_at ? new Date(user.digest_last_sent_at) : null;
      const hoursSince = last ? (now - last) / (1000 * 60 * 60) : Infinity;
      const due = user.digest_frequency === 'daily' ? hoursSince >= 24 : hoursSince >= 168;
      if (!due) continue;

      let count;
      try {
        const userRegion = inferUserRegion(user.location_country);
        const countValues = [user.id];
        const countConditions = [
          `(a.feature_target = 'push' OR a.feature_target IS NULL)`,
          `(ua.id IS NULL OR (ua.dismissed_at IS NULL AND ua.completed_at IS NULL))`,
          `(
            (a.source = 'causal' AND a.org_id IN (SELECT org_id FROM user_org_preferences WHERE user_id = $1))
            OR (a.source = 'user' AND EXISTS (SELECT 1 FROM user_actions ua2 WHERE ua2.action_id = a.id AND ua2.user_id = $1))
          )`,
        ];
        if (userRegion) {
          countValues.push(userRegion);
          countConditions.push(`(o.id IS NULL OR o.region IS NULL OR o.region = 'global' OR o.region = $${countValues.length})`);
        }

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM actions a
           LEFT JOIN user_actions ua ON ua.action_id = a.id AND ua.user_id = $1
           LEFT JOIN orgs o ON o.id = a.org_id
           WHERE ${countConditions.join(' AND ')}`,
          countValues
        );
        count = parseInt(countResult.rows[0].count, 10);
      } catch (digestCountErr) {
        if (digestCountErr.message && /column.*source/i.test(digestCountErr.message)) {
          const legacyResult = await pool.query(
            `SELECT COUNT(*) FROM user_actions ua
             JOIN actions a ON a.id = ua.action_id
             WHERE ua.user_id = $1 AND ua.completed_at IS NULL
               AND (a.feature_target = 'push' OR a.feature_target IS NULL)`,
            [user.id]
          );
          count = parseInt(legacyResult.rows[0].count, 10);
        } else {
          throw digestCountErr;
        }
      }
      if (count === 0) continue;

      await sendDigestEmail(user.email, count);
      await pool.query(
        `UPDATE users SET digest_last_sent_at = NOW() WHERE id = $1`,
        [user.id]
      );
    }
  } catch (e) {
    console.error('❌ Digest job error:', e.message);
  }
}

let lastContribDigestDateKey = null;
async function runContributedOrgsDigestJob() {
  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const dateKey = now.toISOString().slice(0, 10);
    if (hour !== 8 || lastContribDigestDateKey === dateKey) return;

    const rows = await pool.query(
      `SELECT
         org_name,
         BOOL_OR(propublica_verified) AS verified,
         MAX(CASE WHEN propublica_verified THEN ein ELSE NULL END) AS ein,
         COUNT(DISTINCT user_id)::int AS users_count
       FROM user_contributed_orgs
       WHERE added_at > NOW() - INTERVAL '24 hours'
       GROUP BY org_name
       ORDER BY users_count DESC, org_name ASC`
    );
    if (!rows.rows.length) {
      lastContribDigestDateKey = dateKey;
      return;
    }
    const baseUrl = process.env.BASE_URL || 'https://causal.works';
    const lines = [
      'Contributed orgs (last 24h)',
      'Org name | verified | EIN | users | Add to picklist',
      '---|---|---|---|---',
    ];
    for (const r of rows.rows) {
      const orgName = String(r.org_name || '').trim();
      const ein = String(r.ein || '').trim();
      const expires = Date.now() + (24 * 60 * 60 * 1000);
      const token = makeSuggestPicklistToken(orgName, ein, expires);
      const link = `${baseUrl}/admin/suggest-to-picklist?org_name=${encodeURIComponent(orgName)}&ein=${encodeURIComponent(ein)}&expires=${encodeURIComponent(String(expires))}&token=${encodeURIComponent(token)}`;
      lines.push(
        `${orgName} | ${r.verified ? 'yes' : 'no'} | ${ein || '—'} | ${Number(r.users_count) || 0} | ${link}`
      );
    }

    if (!rows.rows.length) lines.push('— | — | — | — | —');

    if (process.env.POSTMARK_API_KEY) {
      await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
        },
        body: JSON.stringify({
          From: 'Causal <noreply@causal.works>',
          To: ADMIN_EMAIL,
          Subject: 'Daily org + officials digest',
          TextBody: lines.join('\n'),
          MessageStream: 'outbound',
        }),
      });
    }
    lastContribDigestDateKey = dateKey;
  } catch (e) {
    console.error('❌ Contributed orgs digest job error:', e.message);
  }
}

// Nightly reset of Demo Company's shared demo content back to its baseline
// snapshot (03:00 UTC) -- see migration 156 for why this is a shared-instance
// timer reset rather than per-user isolation, and for what's excluded
// (org_users membership survives so migration 155's auto-access holds).
let lastDemoResetDateKey = null;
async function runDemoOrgResetJob() {
  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const dateKey = now.toISOString().slice(0, 10);
    if (hour !== 3 || lastDemoResetDateKey === dateKey) return;

    const r = await pool.query(`SELECT restore_demo_org() AS restored`);
    console.log(`🧹 Demo Company reset: ${r.rows[0].restored} rows restored to baseline`);
    lastDemoResetDateKey = dateKey;
  } catch (e) {
    console.error('❌ Demo Company reset job error:', e.message);
  }
}

// Run digest check every 12 hours//
runDigestJob();
setInterval(runDigestJob, 12 * 60 * 60 * 1000);
runContributedOrgsDigestJob();
setInterval(runContributedOrgsDigestJob, 60 * 60 * 1000);
runDemoOrgResetJob();
setInterval(runDemoOrgResetJob, 60 * 60 * 1000);
// ── Start ────────────────────────────────────────────────────────────────────
// Bind to localhost only -- nginx (causal.works) is the sole public entry point and
// terminates TLS + redirects http->https. Without this, port 3000 was reachable
// directly over plain HTTP from the internet, bypassing that redirect entirely.
app.listen(3000, '127.0.0.1', () => {
  console.log('🚀 Causal Agent online on port 3000 (localhost only)');
  scheduleTimingJob(pool);
  schedulePermittingJob(pool);
  scheduleEipJob(pool);
  scheduleInboundDebugCleanup(pool);
  schedulePurgeDeletedOrgs(pool);
  scheduleExpirePodPermissions(pool);
  scheduleProcessAcrOutbox(pool);
  schedulePurgeSyncedDocuments(pool);
  scheduleRecurringScheduleJob(pool);
});