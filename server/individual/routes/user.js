'use strict';

const { requireAuth, CAUSAL_DOMAIN } = require('../../auth');
const { matchReps, resolveRepsCountry, repsTabHint } = require('../../rep/rep-matcher');
const {
  normalizeLocalPart,
  validLocalPart,
  normalizeInvestTickers,
  normalizeUserPrimaryRegion,
  normalizeOrgKey,
  parseUserBankList,
  mergeBankCsv,
  extractUsStateFromAddress,
} = require('../utils');

// Generic first-run onboarding gate for individual users (mirrors coop_orgs.onboarding_step).
// Add new step names here as new onboarding screens are introduced; the client
// gate in router.js only cares whether the current step equals 'complete'.
const ONBOARDING_STEPS = new Set(['bank', 'complete']);

function registerUserRoutes(app, pool) {

  app.get('/api/user/address/available', async (req, res) => {
    try {
      const raw = String(req.query.local_part || '');
      const local = normalizeLocalPart(raw);
      if (!validLocalPart(local)) {
        return res.status(400).json({ available: false, error: 'Invalid format' });
      }
      const address = `${local}@${CAUSAL_DOMAIN}`;
      const taken = await pool.query('SELECT 1 FROM user_addresses WHERE address = $1 LIMIT 1', [address]);
      return res.json({ available: taken.rows.length === 0 });
    } catch (e) {
      console.error('❌ GET /api/user/address/available:', e.message);
      return res.status(500).json({ available: false });
    }
  });

  app.get('/api/me', requireAuth(pool), async (req, res) => {
    let has_forwarding_history = false;
    try {
      const h = await pool.query(
        `SELECT 1 FROM user_actions ua
         JOIN actions a ON a.id = ua.action_id
         WHERE ua.user_id = $1 AND COALESCE(a.source, 'user') = 'user' LIMIT 1`,
        [req.user.user_id]
      );
      has_forwarding_history = h.rows.length > 0;
    } catch (_) {}
    let has_completed_first_action = false;
    try {
      const f = await pool.query(
        `SELECT 1 FROM user_actions WHERE user_id = $1 AND completed_at IS NOT NULL LIMIT 1`,
        [req.user.user_id]
      );
      has_completed_first_action = f.rows.length > 0;
    } catch (_) {}
    const zip = String(req.user.location_zip || '').trim();
    const cc = String(req.user.location_country || '').trim().toUpperCase();
    const userState = cc === 'US' ? extractUsStateFromAddress(zip) : null;
    const reps_country =
      cc ||
      resolveRepsCountry('', Array.isArray(req.user.primary_region) ? req.user.primary_region : []);
    const reps_tab_hint = repsTabHint(cc || reps_country);
    res.json({
      email: req.user.email,
      forwarding_address: req.user.forwarding_address,
      causal_address: req.user.causal_address || null,
      location_country: req.user.location_country || null,
      location_zip: req.user.location_zip || null,
      user_type: req.user.user_type || 'individual_basic',
      digest_frequency: req.user.digest_frequency || 'off',
      brokerage: req.user.brokerage || null,
      bank: req.user.bank || null,
      turnaround_priorities: req.user.turnaround_priorities || [],
      action_type_prefs: req.user.action_type_prefs || [],
      userState: userState || null,
      reps_country,
      reps_tab_hint,
      primary_region: Array.isArray(req.user.primary_region) ? req.user.primary_region : [],
      created_at: req.user.created_at,
      has_forwarding_history: has_forwarding_history,
      coop_access: !!req.user.coop_access,
      fund_holdings_flag: req.user.fund_holdings_flag == null ? null : !!req.user.fund_holdings_flag,
      onboarding_step: req.user.onboarding_step || 'bank',
      onboarding_complete: (req.user.onboarding_step || 'bank') === 'complete',
      has_completed_first_action,
      visited_financial: !!req.user.visited_financial_at,
    });
  });

  app.get('/api/user/ledger-summary', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const row = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM user_actions WHERE user_id = $1 AND completed_at IS NOT NULL)
             + (SELECT COUNT(*)::int FROM local_event_attendance WHERE user_id = $1 AND attended = true) AS actions_taken,
           (SELECT COUNT(*)::int FROM user_actions
              WHERE user_id = $1
                AND completed_at IS NOT NULL
                AND EXTRACT(YEAR FROM completed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC'))
             + (SELECT COUNT(*)::int FROM local_event_attendance
                  WHERE user_id = $1
                    AND attended = true
                    AND EXTRACT(YEAR FROM responded_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS actions_taken_year,
           (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM contributions
              WHERE user_id = $1
                AND EXTRACT(YEAR FROM contributed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS given_cents_year,
           (SELECT COUNT(*)::int FROM user_org_preferences uop
              INNER JOIN orgs o ON o.id = uop.org_id
              WHERE uop.user_id = $1 AND COALESCE(o.subscription_status, 'active') = 'active') AS orgs_followed,
           (SELECT COALESCE(SUM(pledge_amount), 0)::bigint FROM bank_pledges
              WHERE user_id = $1 AND status IN ('pledged', 'partial_divest', 'divested')) AS moved_cents`,
        [userId]
      );
      return res.json(row.rows[0] || { actions_taken: 0, actions_taken_year: 0, given_cents_year: 0, orgs_followed: 0, moved_cents: 0 });
    } catch (e) {
      console.error('❌ GET /api/user/ledger-summary:', e.message);
      return res.status(500).json({ error: 'Could not load summary' });
    }
  });

  app.get('/api/user/ledger-impact', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const stats = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM user_actions
              WHERE user_id = $1
                AND completed_at IS NOT NULL
                AND EXTRACT(YEAR FROM completed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC'))
             + (SELECT COUNT(*)::int FROM local_event_attendance
                  WHERE user_id = $1
                    AND attended = true
                    AND EXTRACT(YEAR FROM responded_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS actions_taken_year,
           (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM contributions
              WHERE user_id = $1
                AND EXTRACT(YEAR FROM contributed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS given_cents_year,
           (SELECT COUNT(DISTINCT COALESCE(org_id::text, org_name)) FROM contributions
              WHERE user_id = $1
                AND EXTRACT(YEAR FROM contributed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS orgs_given_year,
           (SELECT COUNT(*)::int FROM user_inbound_emails
              WHERE user_id = $1
                AND EXTRACT(YEAR FROM received_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS responses_year,
           (SELECT COUNT(DISTINCT a.org_id)::int FROM user_actions ua
              JOIN actions a ON a.id = ua.action_id
              WHERE ua.user_id = $1
                AND ua.completed_at IS NOT NULL
                AND EXTRACT(YEAR FROM ua.completed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS action_orgs_year`,
        [userId]
      );

      const tally = await pool.query(
        `SELECT boundary_id, SUM(actions_count)::int AS actions_count FROM (
           SELECT unnest(a.boundary_ids) AS boundary_id, COUNT(*)::int AS actions_count
           FROM user_actions ua
           JOIN actions a ON a.id = ua.action_id
           WHERE ua.user_id = $1
             AND ua.completed_at IS NOT NULL
             AND EXTRACT(YEAR FROM ua.completed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')
           GROUP BY boundary_id
           UNION ALL
           SELECT unnest(boundary_ids) AS boundary_id, COUNT(*)::int AS actions_count
           FROM local_event_attendance
           WHERE user_id = $1
             AND attended = true
             AND EXTRACT(YEAR FROM responded_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')
           GROUP BY boundary_id
         ) combined
         GROUP BY boundary_id
         ORDER BY actions_count DESC`,
        [userId]
      );

      res.json({
        ...(stats.rows[0] || {
          actions_taken_year: 0, given_cents_year: 0, orgs_given_year: 0,
          responses_year: 0, action_orgs_year: 0,
        }),
        boundary_tally: tally.rows,
      });
    } catch (e) {
      console.error('❌ GET /api/user/ledger-impact:', e.message);
      res.status(500).json({ error: 'Could not load impact summary' });
    }
  });

  app.get('/api/user/completed-actions', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const { rows } = await pool.query(
        `SELECT ua.id, a.action_ask, ua.completed_at, o.name AS org_name
         FROM user_actions ua
         JOIN actions a ON a.id = ua.action_id
         LEFT JOIN orgs o ON o.id = a.org_id
         WHERE ua.user_id = $1 AND ua.completed_at IS NOT NULL
         ORDER BY ua.completed_at DESC
         LIMIT 50`,
        [userId]
      );
      res.json(rows);
    } catch (e) {
      console.error('❌ GET /api/user/completed-actions:', e.message);
      res.status(500).json({ error: 'Could not load completed actions' });
    }
  });

  app.get('/api/user/bank-segments', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const { rows } = await pool.query('SELECT bank FROM users WHERE id = $1', [userId]);
      const names = parseUserBankList(rows[0]?.bank || '');
      const keys = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
      const pledgeByKey = {};
      if (keys.length) {
        const pledges = await pool.query(
          `SELECT institution_name, status FROM bank_pledges WHERE user_id = $1 AND institution_name = ANY($2)`,
          [userId, keys]
        );
        pledges.rows.forEach((p) => { pledgeByKey[p.institution_name] = p.status; });
      }
      res.json(names.map(name => ({
        institution_name: name,
        pledge_status: pledgeByKey[name.trim().toLowerCase()] || null,
      })));
    } catch (e) {
      console.error('❌ GET /api/user/bank-segments:', e.message);
      res.status(500).json({ error: 'Could not load bank data' });
    }
  });

  app.get('/api/user/collective-momentum', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const r = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int
            FROM user_actions ua
            WHERE ua.user_id = $1
              AND ua.completed_at IS NOT NULL
              AND ua.completed_at >= NOW() - INTERVAL '7 days') AS you_completed_7d,
           (SELECT COUNT(*)::int
            FROM user_actions ua
            WHERE ua.user_id = $1
              AND ua.completed_at IS NOT NULL
              AND ua.completed_at >= NOW() - INTERVAL '30 days') AS you_completed_30d,
           (SELECT COUNT(*)::int
            FROM user_actions ua
            WHERE ua.completed_at IS NOT NULL
              AND ua.completed_at >= NOW() - INTERVAL '7 days') AS collective_completed_7d,
           (SELECT COUNT(*)::int
            FROM user_actions ua
            WHERE ua.completed_at IS NOT NULL
              AND EXTRACT(YEAR FROM ua.completed_at AT TIME ZONE 'UTC') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC')) AS collective_completed_year,
           (SELECT COUNT(DISTINCT ua.user_id)::int
            FROM user_actions ua
            WHERE ua.completed_at IS NOT NULL
              AND ua.completed_at >= NOW() - INTERVAL '7 days') AS active_people_7d,
           (SELECT COUNT(DISTINCT ua.user_id)::int
            FROM user_actions ua
            WHERE ua.completed_at IS NOT NULL) AS contributors_total,
           (SELECT COUNT(DISTINCT ua_other.user_id)::int
            FROM user_actions ua_other
            WHERE ua_other.user_id <> $1
              AND ua_other.action_id IN (
                SELECT action_id FROM user_actions
                WHERE user_id = $1 AND completed_at IS NULL AND dismissed_at IS NULL
              )) AS others_on_your_actions`,
        [userId]
      );
      return res.json(r.rows[0] || {
        you_completed_7d: 0,
        you_completed_30d: 0,
        collective_completed_7d: 0,
        active_people_7d: 0,
        collective_completed_year: 0,
        contributors_total: 0,
        others_on_your_actions: 0,
      });
    } catch (e) {
      console.error('❌ GET /api/user/collective-momentum:', e.message);
      return res.status(500).json({ error: 'Could not load momentum' });
    }
  });

  app.get('/api/user/inbound-emails', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT id, received_at, from_name, from_address, subject, preview, action_id
         FROM user_inbound_emails
         WHERE user_id = $1
         ORDER BY received_at DESC NULLS LAST
         LIMIT 100`,
        [userId]
      );
      return res.json(r.rows);
    } catch (e) {
      if (e.message && /user_inbound_emails|does not exist/i.test(e.message)) {
        return res.json([]);
      }
      console.error('❌ GET /api/user/inbound-emails:', e.message);
      return res.status(500).json({ error: 'Could not load archive' });
    }
  });

  app.post('/api/user/petition-signature', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const { org_id, causal_address_used, petition_url } = req.body;

    if (!org_id || !causal_address_used) {
      return res.status(400).json({ error: 'org_id and causal_address_used are required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO user_org_petition_signatures (user_id, org_id, causal_address_used, petition_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, org_id, petition_url) DO UPDATE SET
           causal_address_used = EXCLUDED.causal_address_used,
           signed_at = NOW()
         RETURNING id`,
        [userId, org_id, causal_address_used, petition_url || null]
      );

      console.log(`✅ Recorded petition signature: user_id=${userId}, org_id=${org_id}, address=${causal_address_used}`);
      return res.json({ id: result.rows[0].id, status: 'recorded' });
    } catch (e) {
      if (e.message && /user_org_petition_signatures|does not exist/i.test(e.message)) {
        return res.status(500).json({ error: 'Migration not applied' });
      }
      console.error('❌ POST /api/user/petition-signature:', e.message);
      return res.status(500).json({ error: 'Failed to record signature' });
    }
  });

  app.get('/api/user/petition-signatures', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT ps.id, ps.org_id, ps.causal_address_used, ps.petition_url, ps.signed_at, o.name as org_name
         FROM user_org_petition_signatures ps
         LEFT JOIN orgs o ON o.id = ps.org_id
         WHERE ps.user_id = $1
         ORDER BY ps.signed_at DESC`,
        [userId]
      );
      return res.json(r.rows);
    } catch (e) {
      if (e.message && /user_org_petition_signatures|does not exist/i.test(e.message)) {
        return res.json([]);
      }
      console.error('❌ GET /api/user/petition-signatures:', e.message);
      return res.status(500).json({ error: 'Could not load signatures' });
    }
  });

  app.get('/api/user/donation-split', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const row = await pool.query(`SELECT donation_split FROM users WHERE id = $1 LIMIT 1`, [userId]);
      const splitRaw = row.rows[0]?.donation_split;
      const split = Array.isArray(splitRaw) ? splitRaw : [];
      if (!split.length) return res.json({ split: [] });

      const ids = split
        .map((entry) => Number.parseInt(String(entry?.org_id || ''), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (!ids.length) return res.json({ split: [] });

      const orgs = await pool.query(
        `SELECT id, name, everyorg_slug, ein FROM orgs WHERE id = ANY($1::int[])`,
        [ids]
      );
      const byId = new Map(orgs.rows.map((o) => [o.id, o]));

      const merged = split
        .map((entry) => {
          const orgId = Number.parseInt(String(entry?.org_id || ''), 10);
          const percentage = Number(entry?.percentage || 0);
          const org = byId.get(orgId);
          if (!org || !Number.isFinite(percentage)) return null;
          return {
            org_id: org.id,
            org_name: org.name,
            percentage,
            everyorg_slug: org.everyorg_slug || null,
            ein: org.ein || null,
          };
        })
        .filter(Boolean);

      return res.json({ split: merged });
    } catch (e) {
      console.error('❌ GET /api/user/donation-split:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/user/donation-split', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const split = Array.isArray(req.body?.split) ? req.body.split : null;
      if (!split || !split.length) return res.status(400).json({ error: 'split must be a non-empty array' });

      const normalized = split.map((entry) => ({
        org_id: Number.parseInt(String(entry?.org_id || ''), 10),
        percentage: Number(entry?.percentage || 0),
      }));

      if (normalized.some((entry) => !Number.isInteger(entry.org_id) || entry.org_id < 1 || !Number.isFinite(entry.percentage) || entry.percentage <= 0)) {
        return res.status(400).json({ error: 'Invalid split entries' });
      }

      const total = normalized.reduce((sum, entry) => sum + entry.percentage, 0);
      if (Math.abs(total - 100) > 0.001) {
        return res.status(400).json({ error: 'Percentages must sum to 100' });
      }

      const orgIds = Array.from(new Set(normalized.map((entry) => entry.org_id)));
      const orgRows = await pool.query(`SELECT id FROM orgs WHERE id = ANY($1::int[])`, [orgIds]);
      if (orgRows.rows.length !== orgIds.length) {
        return res.status(400).json({ error: 'All org_ids must exist' });
      }

      await pool.query(`UPDATE users SET donation_split = $1::jsonb WHERE id = $2`, [JSON.stringify(normalized), userId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error('❌ PATCH /api/user/donation-split:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/user/donation-split/ensure-org', requireAuth(pool), async (req, res) => {
    const orgName = String(req.body?.org_name || '').trim().slice(0, 500);
    if (!orgName) return res.status(400).json({ error: 'org_name required' });
    const ein = String(req.body?.ein || '').trim().slice(0, 30) || null;
    const websiteUrl = String(req.body?.website_url || '').trim().slice(0, 500) || null;
    try {
      const key = normalizeOrgKey(orgName);
      const existing = await pool.query(
        `SELECT id, name FROM orgs
         WHERE regexp_replace(regexp_replace(lower(name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = $1
         LIMIT 1`,
        [key]
      );
      if (existing.rows.length) return res.json({ org_id: existing.rows[0].id, org_name: existing.rows[0].name });

      const inserted = await pool.query(
        `INSERT INTO orgs (name, subscription_status, validated_via, ein, website_url)
         VALUES ($1, 'pending_subscription', 'user_contributed', $2, $3)
         RETURNING id, name`,
        [orgName, ein, websiteUrl]
      );
      return res.status(201).json({ org_id: inserted.rows[0].id, org_name: inserted.rows[0].name });
    } catch (e) {
      console.error('❌ POST /api/user/donation-split/ensure-org:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/user/invest-tickers', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const row = await pool.query(`SELECT invest_tickers FROM users WHERE id = $1 LIMIT 1`, [userId]);
      const raw = row.rows[0]?.invest_tickers;
      const tickers = Array.isArray(raw) ? raw.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean) : [];
      return res.json({ tickers });
    } catch (e) {
      console.error('❌ GET /api/user/invest-tickers:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/user/invest-tickers', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const normalized = normalizeInvestTickers(req.body?.tickers);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    try {
      await pool.query(`UPDATE users SET invest_tickers = $1::jsonb WHERE id = $2`, [
        JSON.stringify(normalized.tickers),
        userId,
      ]);
      return res.json({ tickers: normalized.tickers });
    } catch (e) {
      console.error('❌ PATCH /api/user/invest-tickers:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/confirmations', requireAuth(pool), async (req, res) => {
    try {
      const authUserId = Number(req.user.user_id ?? req.user.id ?? req.user.userId);
      if (!Number.isInteger(authUserId) || authUserId < 1) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const rows = await pool.query(
        `SELECT id, org_name, confirmation_url, email_subject, created_at
         FROM pending_confirmations
         WHERE user_id = $1
           AND confirmed_at IS NULL
           AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC`,
        [authUserId]
      );
      res.set('Cache-Control', 'no-store');
      res.json(rows.rows);
    } catch (e) {
      console.error('❌ GET /api/confirmations:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/confirmations/:id/confirmed', requireAuth(pool), async (req, res) => {
    try {
      const authUserId = req.user.user_id ?? req.user.id;
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      const up = await pool.query(
        `UPDATE pending_confirmations
         SET confirmed_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, authUserId]
      );
      if (up.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ POST /api/confirmations/:id/confirmed:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/stats', requireAuth(pool), async (req, res) => {
    try {
      const freq = req.user.digest_frequency || 'off';
      const intervalHours = freq === 'daily' ? 24 : 24 * 7;

      const [result, periodResult] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL) as total_completed,
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL AND a.turnaround_category = 'Energy') as energy,
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL AND a.turnaround_category = 'Food') as food,
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL AND a.turnaround_category = 'Inequality') as inequality,
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL AND a.turnaround_category = 'Poverty') as poverty,
             COUNT(*) FILTER (WHERE ua.completed_at IS NOT NULL AND a.turnaround_category = 'Empowerment') as empowerment
           FROM user_actions ua
           JOIN actions a ON a.id = ua.action_id
           WHERE ua.user_id = $1`,
          [req.user.user_id]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS n
           FROM user_actions ua
           WHERE ua.user_id = $1 AND ua.completed_at >= (NOW() - ($2::text || ' hours')::interval)`,
          [req.user.user_id, intervalHours]
        ),
      ]);

      const stats = result.rows[0];
      const completed_this_period = (periodResult.rows[0]?.n || 0) > 0;
      const period_label = freq === 'daily' ? 'day' : 'week';

      res.json({
        ...stats,
        completed_this_period,
        period_label,
      });
    } catch (e) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/onboard', requireAuth(pool), async (req, res) => {
    const {
      location_country,
      location_zip,
      org_ids,
      turnaround_priorities = [],
      action_type_prefs = [],
      digest_frequency: rawDigest,
      user_type: rawUserType,
      primary_region: rawPrimaryRegion,
    } = req.body;
    const userId = req.user.user_id;
    const orgIdsProvided = Array.isArray(org_ids);
    const primary_region = normalizeUserPrimaryRegion(rawPrimaryRegion);

    const ALLOWED_DIGEST = new Set(['off', 'daily', 'weekly']);
    const digest_frequency = ALLOWED_DIGEST.has(String(rawDigest || '').toLowerCase())
      ? String(rawDigest).toLowerCase()
      : 'off';
    const ALLOWED_USER_TYPE = new Set(['individual_basic', 'individual_advanced', 'org']);
    const user_type = ALLOWED_USER_TYPE.has(String(rawUserType || ''))
      ? String(rawUserType)
      : 'individual_basic';

    try {
      const lc =
        location_country != null && String(location_country).trim()
          ? String(location_country).trim().toUpperCase()
          : null;
      const lz =
        location_zip != null && String(location_zip).trim() ? String(location_zip).trim() : null;
      await pool.query(
        `UPDATE users SET
           location_country = COALESCE($1, location_country),
           location_zip = COALESCE($2, location_zip),
           onboarded = TRUE,
           turnaround_priorities = $3,
           action_type_prefs = $4,
           digest_frequency = $5,
           user_type = $6,
           primary_region = $7::text[]
         WHERE id = $8`,
        [
          lc,
          lz,
          Array.isArray(turnaround_priorities) ? turnaround_priorities : [],
          Array.isArray(action_type_prefs) ? action_type_prefs : [],
          digest_frequency,
          user_type,
          primary_region,
          userId,
        ]
      );

      let cleanOrgIds = [];
      if (orgIdsProvided) {
        cleanOrgIds = org_ids.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isInteger(v));
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM user_org_preferences WHERE user_id = $1', [userId]);
          if (cleanOrgIds.length > 0) {
            // Filter against real orgs — org_ids can include stale/foreign ids
            // (e.g. from user_contributed_orgs) that don't reference this table
            // and would otherwise abort the whole save on the FK constraint.
            await client.query(
              `INSERT INTO user_org_preferences (user_id, org_id)
               SELECT $1, o.id FROM orgs o WHERE o.id = ANY($2::int[])
               ON CONFLICT DO NOTHING`,
              [userId, cleanOrgIds]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }

      if (cleanOrgIds.length > 0) {
        try {
          await pool.query(
            `WITH latest_per_org AS (
               SELECT DISTINCT ON (a.org_id) a.id AS action_id
               FROM actions a
               WHERE a.org_id IS NOT NULL AND a.org_id = ANY($2::int[])
                 AND (a.feature_target = 'push' OR a.feature_target IS NULL)
                 AND (a.decision_window_date IS NULL OR (a.decision_window_date AT TIME ZONE 'UTC')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
               ORDER BY a.org_id, a.created_at DESC
             )
             INSERT INTO user_actions (user_id, action_id, seeded)
             SELECT $1, action_id, true FROM latest_per_org LIMIT 10
             ON CONFLICT (user_id, action_id) DO NOTHING`,
            [userId, cleanOrgIds]
          );
        } catch (seedErr) {
          console.warn('⚠️ Seed after onboard:', seedErr.message);
        }
      }

      if (lc) {
        matchReps(pool, userId, lc, lz || '').catch((err) =>
          console.error('Rep matching failed:', err.message)
        );
      }

      res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ Onboard error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/user', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const allowed = ['brokerage', 'bank'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No valid fields' });
    const fields = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), userId];
    try {
      await pool.query(
        `UPDATE users SET ${fields} WHERE id = $${values.length}`,
        values
      );
      res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ PATCH /api/user error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/user/org-preference', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const orgId = Number.parseInt(req.body?.org_id, 10);
    const followed = !!req.body?.followed;

    if (!Number.isInteger(orgId) || orgId < 1) {
      return res.status(400).json({ error: 'Invalid org_id' });
    }

    try {
      await pool.query(
        `INSERT INTO user_org_preferences (user_id, org_id, followed)
         VALUES ($1, $2, false)
         ON CONFLICT (user_id, org_id)
         DO UPDATE SET followed = $3`,
        [userId, orgId, followed]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('❌ PATCH /api/user/org-preference:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/user/address', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const raw = String(req.body?.local_part || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (raw.length < 3 || raw.length > 30) {
      return res.status(400).json({ error: 'Address must be 3–30 letters/numbers' });
    }
    const address = `${raw}@${CAUSAL_DOMAIN}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const taken = await client.query(
        'SELECT user_id FROM user_addresses WHERE address = $1 LIMIT 1',
        [address]
      );
      if (taken.rows.length > 0 && Number(taken.rows[0].user_id) !== Number(userId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That address is taken — try another' });
      }
      await client.query('UPDATE user_addresses SET is_primary = false WHERE user_id = $1', [userId]);
      await client.query(
        `INSERT INTO user_addresses (user_id, address, is_primary)
         VALUES ($1, $2, true)
         ON CONFLICT (address) DO UPDATE SET is_primary = true`,
        [userId, address]
      );
      await client.query('UPDATE users SET forwarding_address = $1 WHERE id = $2', [address, userId]);
      await client.query('COMMIT');
      res.json({ address });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('❌ POST /api/user/address:', e.message);
      res.status(500).json({ error: 'Database error' });
    } finally {
      client.release();
    }
  });

  app.get('/api/settings', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    try {
      const fullQuery = `SELECT location_country, location_zip, location_city, brokerage, bank, turnaround_priorities, action_type_prefs, digest_frequency, user_type, primary_region FROM users WHERE id = $1`;
      const fullQueryNoPrimary = `SELECT location_country, location_zip, location_city, brokerage, bank, turnaround_priorities, action_type_prefs, digest_frequency, user_type FROM users WHERE id = $1`;
      const fallbackQuery = `SELECT location_country, location_zip, brokerage, bank, turnaround_priorities, action_type_prefs FROM users WHERE id = $1`;

      let userResult;
      for (const q of [fullQuery, fullQueryNoPrimary, fallbackQuery]) {
        try {
          userResult = await pool.query(q, [userId]);
          break;
        } catch (err) {
          if (!(err.message && /column.*does not exist/i.test(err.message))) throw err;
        }
      }
      if (!userResult) userResult = { rows: [{}] };

      const orgsResult = await pool.query(`SELECT org_id FROM user_org_preferences WHERE user_id = $1`, [userId]);
      const user = userResult.rows[0] || {};
      res.json({
        location_country: user.location_country || '',
        location_zip: user.location_zip || '',
        location_city: user.location_city || '',
        brokerage: user.brokerage || '',
        bank: user.bank || '',
        turnaround_priorities: user.turnaround_priorities || [],
        action_type_prefs: user.action_type_prefs || [],
        digest_frequency: user.digest_frequency ?? req.user.digest_frequency ?? 'off',
        user_type: user.user_type ?? req.user.user_type ?? 'individual_basic',
        primary_region: Array.isArray(user.primary_region) ? user.primary_region : [],
        org_ids: orgsResult.rows.map(r => r.org_id),
      });
    } catch (e) {
      console.error('❌ Settings GET error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/settings', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;

    if (req.body && req.body.append_bank != null) {
      const add = String(req.body.append_bank).trim();
      if (!add) return res.status(400).json({ error: 'append_bank required' });
      try {
        const cur = await pool.query('SELECT bank FROM users WHERE id = $1', [userId]);
        const merged = mergeBankCsv(cur.rows[0]?.bank, add);
        await pool.query('UPDATE users SET bank = $1 WHERE id = $2', [merged || null, userId]);
        return res.json({ ok: true, bank: merged });
      } catch (e) {
        console.error('❌ PATCH /api/settings append_bank:', e.message);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    if (req.body && req.body.fund_holdings_flag != null) {
      try {
        await pool.query('UPDATE users SET fund_holdings_flag = $1 WHERE id = $2', [!!req.body.fund_holdings_flag, userId]);
        return res.json({ ok: true, fund_holdings_flag: !!req.body.fund_holdings_flag });
      } catch (e) {
        console.error('❌ PATCH /api/settings fund_holdings_flag:', e.message);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    return res.status(400).json({ error: 'No supported patch fields' });
  });

  // ─── ONBOARDING: bank-first wizard, progressive unlock, return-visit summary ───

  app.post('/api/user/bank-onboarding', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const bank = req.body && req.body.bank != null ? String(req.body.bank).trim() : '';
    if (!bank) return res.status(400).json({ error: 'bank required' });
    const fundHoldingsFlag = req.body && req.body.fund_holdings_flag != null ? !!req.body.fund_holdings_flag : null;
    try {
      const cur = await pool.query('SELECT bank FROM users WHERE id = $1', [userId]);
      const merged = mergeBankCsv(cur.rows[0]?.bank, bank);
      await pool.query(
        `UPDATE users
         SET bank = $1, fund_holdings_flag = $2, bank_payoff_seen_at = NOW(),
             onboarding_step = 'complete', onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
         WHERE id = $3`,
        [merged || null, fundHoldingsFlag, userId]
      );
      return res.json({ ok: true, bank: merged });
    } catch (e) {
      console.error('❌ POST /api/user/bank-onboarding:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  // Generic step advance for future onboarding screens that don't have their
  // own dedicated save endpoint (see ONBOARDING_STEPS above).
  app.patch('/api/user/onboarding-step', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const step = String(req.body && req.body.step || '').trim();
    if (!ONBOARDING_STEPS.has(step)) {
      return res.status(400).json({ error: 'Invalid step' });
    }
    try {
      const r = await pool.query(
        `UPDATE users
         SET onboarding_step = $2::text,
             onboarding_completed_at = CASE WHEN $2::text = 'complete' THEN COALESCE(onboarding_completed_at, NOW()) ELSE onboarding_completed_at END
         WHERE id = $1
         RETURNING onboarding_step, onboarding_completed_at`,
        [userId, step]
      );
      return res.json({
        ok: true,
        onboarding_step: r.rows[0].onboarding_step,
        onboarding_completed_at: r.rows[0].onboarding_completed_at,
      });
    } catch (e) {
      console.error('❌ PATCH /api/user/onboarding-step:', e.message);
      return res.status(500).json({ error: 'Could not update step' });
    }
  });

  app.post('/api/user/mark-visited', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const section = req.body && req.body.section ? String(req.body.section).trim() : '';
    if (section !== 'financial') return res.status(400).json({ error: 'unsupported section' });
    try {
      await pool.query(
        `UPDATE users SET visited_financial_at = NOW() WHERE id = $1 AND visited_financial_at IS NULL`,
        [userId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('❌ POST /api/user/mark-visited:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/user/since-last-visit', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const cur = await pool.query('SELECT last_visit_at FROM users WHERE id = $1', [userId]);
      const lastVisitAt = cur.rows[0] ? cur.rows[0].last_visit_at : null;

      if (!lastVisitAt) {
        await pool.query('UPDATE users SET last_visit_at = NOW() WHERE id = $1', [userId]);
        return res.json({ has_previous_visit: false, signatures_count: 0, pledges_count: 0, new_decisions_count: 0 });
      }

      const [sigRes, bankPledgeRes, finPledgeRes, decisionsRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS c FROM user_org_petition_signatures WHERE user_id = $1 AND signed_at > $2`,
          [userId, lastVisitAt]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM bank_pledges WHERE user_id = $1 AND updated_at > $2`,
          [userId, lastVisitAt]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM financial_rep_pledges WHERE user_id = $1 AND updated_at > $2`,
          [userId, lastVisitAt]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM actions a
           WHERE (a.feature_target = 'push' OR a.feature_target IS NULL)
             AND a.created_at > $2
             AND (
               (COALESCE(a.source, 'user') = 'causal' AND a.org_id IN (SELECT org_id FROM user_org_preferences WHERE user_id = $1))
               OR (COALESCE(a.source, 'user') = 'user' AND EXISTS (SELECT 1 FROM user_actions ua2 WHERE ua2.action_id = a.id AND ua2.user_id = $1))
             )`,
          [userId, lastVisitAt]
        ),
      ]);

      await pool.query('UPDATE users SET last_visit_at = NOW() WHERE id = $1', [userId]);

      return res.json({
        has_previous_visit: true,
        signatures_count: Number(sigRes.rows[0]?.c) || 0,
        pledges_count: (Number(bankPledgeRes.rows[0]?.c) || 0) + (Number(finPledgeRes.rows[0]?.c) || 0),
        new_decisions_count: Number(decisionsRes.rows[0]?.c) || 0,
      });
    } catch (e) {
      console.error('❌ GET /api/user/since-last-visit:', e.message);
      return res.status(500).json({ error: 'Could not load activity summary' });
    }
  });

  app.post('/api/settings', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    console.log('⚙️ Settings save triggered for user:', userId);
    const {
      location_country,
      location_zip,
      location_city,
      brokerage,
      bank,
      turnaround_priorities,
      action_type_prefs,
      org_ids,
      digest_frequency,
      user_type,
      primary_region: rawPrimaryRegion,
    } = req.body;
    const orgIdsProvided = Array.isArray(org_ids);
    const primary_region = normalizeUserPrimaryRegion(rawPrimaryRegion);
    const lc =
      location_country != null && String(location_country).trim()
        ? String(location_country).trim().toUpperCase()
        : null;
    const lz =
      location_zip != null && String(location_zip).trim() ? String(location_zip).trim() : null;
    const lcity =
      location_city != null && String(location_city).trim() ? String(location_city).trim() : null;
    // Fields below only overwrite when the caller actually sends them — a partial save
    // (e.g. onboarding's location-only step, or Settings' zip-only autosave) must not
    // silently null out bank/brokerage/turnaround_priorities/action_type_prefs/etc.
    try {
      await pool.query(
        `UPDATE users SET
           location_country = COALESCE($1, location_country),
           location_zip = COALESCE($2, location_zip),
           location_city = $3,
           brokerage = COALESCE($4, brokerage),
           bank = COALESCE($5, bank),
           turnaround_priorities = COALESCE($6, turnaround_priorities),
           action_type_prefs = COALESCE($7, action_type_prefs),
           digest_frequency = COALESCE($8, digest_frequency),
           user_type = COALESCE($9, user_type),
           primary_region = COALESCE($10::text[], primary_region)
         WHERE id = $11`,
        [
          lc,
          lz,
          lcity,
          brokerage || null,
          bank || null,
          Array.isArray(turnaround_priorities) ? turnaround_priorities : null,
          Array.isArray(action_type_prefs) ? action_type_prefs : null,
          digest_frequency || null,
          user_type || null,
          rawPrimaryRegion !== undefined ? primary_region : null,
          userId,
        ]
      );
      if (orgIdsProvided) {
        const cleanOrgIds = org_ids.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isInteger(v));
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM user_org_preferences WHERE user_id = $1', [userId]);
          if (cleanOrgIds.length > 0) {
            // Filter against real orgs — org_ids can include stale/foreign ids
            // (e.g. from user_contributed_orgs) that don't reference this table
            // and would otherwise abort the whole save on the FK constraint.
            await client.query(
              `INSERT INTO user_org_preferences (user_id, org_id)
               SELECT $1, o.id FROM orgs o WHERE o.id = ANY($2::int[])
               ON CONFLICT DO NOTHING`,
              [userId, cleanOrgIds]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }
      const prevCc = String(req.user.location_country ?? '').trim().toUpperCase();
      const prevZip = String(req.user.location_zip ?? '').trim();
      const prevPrArr = Array.isArray(req.user.primary_region) ? req.user.primary_region : [];
      const prevPr = JSON.stringify([...prevPrArr].map(String).sort());
      const newPr = JSON.stringify([...primary_region].map(String).sort());
      const storedCc = lc != null ? lc : prevCc;
      const storedZip = lz != null ? lz : prevZip;
      const geoChanged = storedCc !== prevCc || storedZip !== prevZip;

      res.json({ status: 'ok', geo_changed: geoChanged });
    } catch (e) {
      console.error('❌ Settings POST error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

}

module.exports = { registerUserRoutes };
