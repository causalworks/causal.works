'use strict';

const { requireAuth } = require('../../auth');
const { inferUserRegion, envTrue, extractUsStateFromAddress } = require('../utils');
const { ensureOrgActivitySummary } = require('../lib/orgActivitySummary');
const { findRepByTurnaroundCommittee } = require('../../rep/rep-matcher');

// Three-way, not a match/no-match binary: an action with no location data at
// all (e.g. every federal_register row — Federal Register has no location
// field of any kind) is a distinct, legitimate state from an action that has
// location data but doesn't match the user's state. Collapsing "unknown"
// into "no match" would present a false-confident signal the same way an
// unreliable county-regex guess would have.
function computeLocationRelevance(actionState, userState) {
  if (!actionState) return 'no_data';
  if (!userState) return 'no_match'; // action has state data; we just can't resolve the user's
  const states = String(actionState).split(',').map((s) => s.trim().toUpperCase());
  return states.includes(userState) ? 'match' : 'no_match';
}
const LOCATION_RELEVANCE_SORT_PRIORITY = { match: 0, no_match: 1, no_data: 1 };

function registerActionRoutes(app, pool) {

  app.get('/api/debug/inbound-recent', requireAuth(pool), async (req, res) => {
    if (!envTrue('DEBUG_INBOUND_STORE') || !envTrue('DEBUG_INBOUND_API')) {
      return res.status(404).json({ error: 'Not found' });
    }

    const allow = String(process.env.DEBUG_INBOUND_ALLOW_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (allow.length > 0 && !allow.includes(String(req.user.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 25;

    const includeBodies = envTrue('DEBUG_INBOUND_INCLUDE_BODIES') || req.query.include_bodies === '1';
    const includeAll = envTrue('DEBUG_INBOUND_INCLUDE_ALL') && req.query.all === '1';

    const fields = [
      'id',
      'created_at',
      'user_id',
      'message_id',
      'from_email',
      'to_email',
      'subject',
      'best_url',
      'top_urls',
    ];
    if (includeBodies) fields.push('text_body', 'html_body');

    const values = [];
    const conditions = [];
    if (!includeAll) {
      values.push(req.user.user_id);
      conditions.push(`user_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await pool.query(
        `SELECT ${fields.join(', ')}
         FROM inbound_debug_emails
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        values
      );
      res.json({ items: result.rows });
    } catch (e) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/actions', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const userRegion = inferUserRegion(req.user.location_country);
      const values = [userId];
      const conditions = [
        `(a.feature_target = 'push' OR a.feature_target IS NULL)`,
        `(COALESCE(a.action_ask, '') <> 'Manual review required')`,
        `(ua.id IS NULL OR (ua.dismissed_at IS NULL AND ua.completed_at IS NULL))`,
        `(o.id IS NULL OR COALESCE(o.subscription_status, 'active') = 'active')`,
        `(
          (COALESCE(a.source, 'user') = 'causal' AND a.org_id IN (SELECT org_id FROM user_org_preferences WHERE user_id = $1))
          OR
          (COALESCE(a.source, 'user') = 'user' AND EXISTS (SELECT 1 FROM user_actions ua2 WHERE ua2.action_id = a.id AND ua2.user_id = $1))
          OR
          (a.source IN ('federal_register', 'eip_oil_gas_watch'))
        )`,
        // Auto-discard, 7-day grace period after any deadline — gives the user
        // time to notice a card that just closed instead of yanking it same-day,
        // while still stopping indefinite accumulation. Two cases:
        // (1) dated asks: hidden 7 days after decision_window_date passes, not
        //     the instant it passes.
        // (2) undated asks (comment/contact/boycott/attend/"Active window"
        //     cards the classifier found no specific date for): previously
        //     never expired at all — now age out 7 days after ingestion
        //     (created_at) instead, same grace length as the dated case.
        `(a.decision_window_date IS NULL OR (a.decision_window_date AT TIME ZONE 'UTC')::date >= ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 7))`,
        `(a.decision_window_date IS NOT NULL OR a.created_at >= NOW() - INTERVAL '7 days')`,
      ];

      if (req.query.rep) {
        values.push(req.query.rep);
        conditions.push(`EXISTS (
          SELECT 1 FROM unnest(a.rep_targets) t
          WHERE t ILIKE '%' || $${values.length} || '%'
        )`);
      }

      const joinOrg = `LEFT JOIN orgs o ON o.id = a.org_id`;
      if (userRegion) {
        values.push(userRegion);
        conditions.push(`(o.id IS NULL OR o.region IS NULL OR o.region = 'global' OR o.region = $${values.length})`);
      }

      const sql = `WITH visible_actions AS (
         SELECT a.*, ua.opened_at AS opened_at, ua.completed_at AS completed_at, ua.dismissed_at AS dismissed_at,
           o.donation_url AS donation_url
         FROM actions a
         LEFT JOIN user_actions ua ON ua.action_id = a.id AND ua.user_id = $1
         ${joinOrg}
         WHERE ${conditions.join(' AND ')}
       ),
       ranked_actions AS (
         SELECT visible_actions.*,
           ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at DESC) AS org_rank
         FROM visible_actions
         WHERE org_id IS NOT NULL
         UNION ALL
         SELECT visible_actions.*, 1 AS org_rank
         FROM visible_actions
         WHERE org_id IS NULL
       )
       SELECT * FROM ranked_actions
       WHERE org_rank <= 3
       ORDER BY do_now DESC, material_stake IS NOT NULL DESC,
                (COALESCE(timing_confidence, 0) + COALESCE(boundary_urgency_score, 0)) DESC,
                created_at DESC
       LIMIT 20`;
      if (process.env.DEBUG_ACTIONS_QUERY === '1') {
        console.log('GET /api/actions userId=', userId, 'userRegion=', userRegion ?? '(none)', 'values=', JSON.stringify(values));
        console.log('GET /api/actions query:', sql);
      }
      const result = await pool.query(sql, values);
      const rows = result.rows;

      // State-based relevance: match-first, then no_match/no_data interleaved
      // in their existing timing-urgency order (stable sort — doesn't disturb
      // the SQL-provided ordering within either group). Only eip_oil_gas_watch
      // rows can ever be a "match" (only source with eip_affected_state
      // populated), so this naturally only reorders where there's real signal.
      const userState = userRegion === 'US' ? extractUsStateFromAddress(req.user.location_zip) : null;
      for (const r of rows) {
        r.location_relevance = computeLocationRelevance(r.eip_affected_state, userState);
      }
      rows.sort(
        (a, b) => LOCATION_RELEVANCE_SORT_PRIORITY[a.location_relevance] - LOCATION_RELEVANCE_SORT_PRIORITY[b.location_relevance]
      );

      // Permitting actions (federal or state-tier) tagged Energy: surface the
      // user's committee-assigned rep alongside the action (one lookup per
      // turnaround actually present, not per row).
      const frEnergyRows = rows.filter(
        (r) => ['federal_register', 'eip_oil_gas_watch'].includes(r.source) && r.turnaround_category === 'Energy'
      );
      if (frEnergyRows.length) {
        const committeeRep = await findRepByTurnaroundCommittee(pool, userId, 'Energy');
        if (committeeRep) {
          for (const r of frEnergyRows) r.committee_rep = committeeRep;
        }
      }

      res.json(rows);
    } catch (e) {
      console.error("❌ DB Query Error:", e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/actions/:id', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const actionId = parseInt(req.params.id, 10);
      if (!Number.isInteger(actionId) || actionId < 1) {
        return res.status(400).json({ error: 'Invalid action id' });
      }
      const userRegion = inferUserRegion(req.user.location_country);
      const values = [userId, actionId];
      const visibility = [
        `(o.id IS NULL OR COALESCE(o.subscription_status, 'active') = 'active')`,
        `(
          (COALESCE(a.source, 'user') = 'causal' AND a.org_id IN (SELECT org_id FROM user_org_preferences WHERE user_id = $1))
          OR
          (COALESCE(a.source, 'user') = 'user' AND EXISTS (SELECT 1 FROM user_actions ua2 WHERE ua2.action_id = a.id AND ua2.user_id = $1))
          OR
          (a.source IN ('federal_register', 'eip_oil_gas_watch'))
        )`,
      ];
      if (userRegion) {
        values.push(userRegion);
        visibility.push(`(o.id IS NULL OR o.region IS NULL OR o.region = 'global' OR o.region = $${values.length})`);
      }
      const sql = `SELECT a.*,
         o.website_url AS org_website,
         o.donation_url AS donation_url,
         ua_row.opened_at AS opened_at,
         ua_row.completed_at AS completed_at,
         ua_row.dismissed_at AS dismissed_at,
         (SELECT COUNT(DISTINCT user_id)::int FROM user_actions ua_all WHERE ua_all.action_id = a.id) AS actors_count
         FROM actions a
         LEFT JOIN orgs o ON o.id = a.org_id
         LEFT JOIN user_actions ua_row ON ua_row.action_id = a.id AND ua_row.user_id = $1
         WHERE a.id = $2 AND ${visibility.join(' AND ')}
         LIMIT 1`;
      const result = await pool.query(sql, values);
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Not found' });
      }
      const row = result.rows[0];
      const userState = userRegion === 'US' ? extractUsStateFromAddress(req.user.location_zip) : null;
      row.location_relevance = computeLocationRelevance(row.eip_affected_state, userState);
      if (['federal_register', 'eip_oil_gas_watch'].includes(row.source) && row.turnaround_category === 'Energy') {
        row.committee_rep = await findRepByTurnaroundCommittee(pool, userId, 'Energy');
      }
      return res.json(row);
    } catch (e) {
      console.error('❌ GET /api/actions/:id:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/actions/:id/done', requireAuth(pool), async (req, res) => {
    try {
      const [userId, actionId] = [req.user.user_id, req.params.id];
      await pool.query(
        `INSERT INTO user_actions (user_id, action_id, completed_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, action_id) DO UPDATE SET completed_at = NOW()`,
        [userId, actionId]
      );
      res.json({ status: 'success' });
    } catch (e) {
      console.error("❌ Mark Done Error:", e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/actions/:id/opened', requireAuth(pool), async (req, res) => {
    try {
      const [userId, actionId] = [req.user.user_id, req.params.id];
      await pool.query(
        `INSERT INTO user_actions (user_id, action_id, opened_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, action_id) DO UPDATE SET opened_at = COALESCE(user_actions.opened_at, EXCLUDED.opened_at)`,
        [userId, actionId]
      );
      res.json({ status: 'success' });
    } catch (e) {
      console.error("❌ Opened Error:", e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/actions/:id/status', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const actionId = parseInt(req.params.id, 10);
      if (!Number.isInteger(actionId) || actionId < 1) {
        return res.status(400).json({ error: 'Invalid action id' });
      }
      const st = String(req.body?.status || '').toLowerCase().trim();
      if (st === 'opened') {
        await pool.query(
          `INSERT INTO user_actions (user_id, action_id, opened_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id, action_id) DO UPDATE SET opened_at = NOW()`,
          [userId, actionId]
        );
        return res.json({ ok: true, status: 'opened' });
      }
      if (st === 'done') {
        await pool.query(
          `INSERT INTO user_actions (user_id, action_id, completed_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id, action_id) DO UPDATE SET completed_at = NOW()`,
          [userId, actionId]
        );
        return res.json({ ok: true, status: 'done' });
      }
      if (st === 'dismissed') {
        const u = await pool.query(
          `UPDATE user_actions SET dismissed_at = NOW() WHERE user_id = $1 AND action_id = $2`,
          [userId, actionId]
        );
        if (u.rowCount === 0) {
          await pool.query(
            `INSERT INTO user_actions (user_id, action_id, dismissed_at) VALUES ($1, $2, NOW())`,
            [userId, actionId]
          );
        }
        return res.json({ ok: true, status: 'dismissed' });
      }
      return res.status(400).json({ error: 'Invalid status; supported: opened, done, dismissed' });
    } catch (e) {
      console.error('❌ PATCH /api/actions/:id/status:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/actions/:id/dismiss', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const actionId = parseInt(req.params.id, 10);
      if (!Number.isInteger(actionId)) return res.status(400).json({ error: 'Invalid action id' });
      const u = await pool.query(
        `UPDATE user_actions SET dismissed_at = NOW() WHERE user_id = $1 AND action_id = $2`,
        [userId, actionId]
      );
      if (u.rowCount === 0) {
        await pool.query(
          `INSERT INTO user_actions (user_id, action_id, dismissed_at) VALUES ($1, $2, NOW())`,
          [userId, actionId]
        );
      }
      res.json({ status: 'success' });
    } catch (e) {
      console.error("❌ Dismiss Error:", e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  async function handleGiveActions(req, res) {
    try {
      const result = await pool.query(
        `SELECT a.*, ua.opened_at AS opened_at, ua.completed_at AS completed_at, ua.dismissed_at AS dismissed_at,
                     EXISTS (
                  SELECT 1
                  FROM contributions c
                  WHERE c.user_id = $1
                    AND c.contributed_at >= date_trunc('year', NOW())
                    AND (
                      (a.org_id IS NOT NULL AND c.org_id = a.org_id)
                      OR (
                        a.org_id IS NULL
                        AND lower(trim(c.org_name)) = lower(trim(COALESCE(a.org_name, o.name, '')))
                      )
                    )
                ) AS is_repeat_ask
         FROM actions a
         LEFT JOIN user_actions ua ON ua.action_id = a.id AND ua.user_id = $1
         LEFT JOIN orgs o ON o.id = a.org_id
         WHERE (ua.id IS NULL OR (ua.dismissed_at IS NULL AND ua.completed_at IS NULL))
           AND (a.feature_target = 'purse' OR a.action_type IN ('donate', 'divest'))
           AND (
             (COALESCE(a.source, 'user') = 'causal'
              AND a.org_id IN (SELECT org_id FROM user_org_preferences WHERE user_id = $1 AND followed = TRUE))
             OR
             (COALESCE(a.source, 'user') = 'user'
              AND EXISTS (SELECT 1 FROM user_actions ua2 WHERE ua2.action_id = a.id AND ua2.user_id = $1))
           )
         ORDER BY a.do_now DESC, a.timing_confidence DESC NULLS LAST, a.created_at DESC
         LIMIT 20`,
        [req.user.user_id]
      );
      res.json(result.rows);
    } catch (e) {
      console.error('❌ /api/give-actions query error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  }

  app.get('/api/give/actions', requireAuth(pool), handleGiveActions);

  app.get('/api/give/orgs', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const result = await pool.query(
        `SELECT
           o.id,
           o.name,
           o.website_url,
           o.donation_url,
           -- Global signal, same as Settings: an org anyone added reads as 'user_contributed'
           -- here too, so "Your orgs" vs "Platform subscriptions" agrees everywhere the org
           -- shows up — not just for whichever user happened to add it.
           CASE WHEN o.added_by_user_id IS NOT NULL THEN 'user_contributed' ELSE COALESCE(o.subscription_status, 'active') END AS subscription_status,
           FALSE AS is_private_only,
           COALESCE(
             SUM(c.amount_cents) FILTER (
               WHERE EXTRACT(YEAR FROM c.contributed_at) = EXTRACT(YEAR FROM NOW())
             ),
             0
           )::bigint AS given_cents_year,
           COUNT(c.id) FILTER (
             WHERE EXTRACT(YEAR FROM c.contributed_at) = EXTRACT(YEAR FROM NOW())
           )::int AS gift_count_year,
           COALESCE(tag.turnarounds, ARRAY[]::text[]) AS turnaround_tags
         FROM orgs o
         JOIN user_org_preferences uop ON uop.org_id = o.id
         LEFT JOIN contributions c ON c.org_id = o.id AND c.user_id = $1
         LEFT JOIN LATERAL (
           SELECT ARRAY_AGG(DISTINCT t) AS turnarounds
           FROM actions a
           CROSS JOIN LATERAL unnest(
             ARRAY[a.turnaround_category] || COALESCE(a.secondary_turnarounds, ARRAY[]::text[])
           ) AS t
           WHERE a.org_id = o.id
             AND t IS NOT NULL
         ) tag ON TRUE
         WHERE uop.user_id = $1 AND uop.followed = TRUE
         GROUP BY o.id, o.name, o.website_url, o.donation_url, o.subscription_status, o.added_by_user_id, tag.turnarounds

        UNION ALL

        SELECT
          uco.id,
          uco.org_name AS name,
          uco.website_url,
          NULL AS donation_url,
          'user_contributed' AS subscription_status,
          TRUE AS is_private_only,
          0::bigint AS given_cents_year,
          0::int AS gift_count_year,
          ARRAY[]::text[] AS turnaround_tags
        FROM user_contributed_orgs uco
        WHERE uco.user_id = $1

        ORDER BY name ASC`,
        [userId]
      );

      const rows = result.rows;
      // Cache-first (one SELECT) per org, Gemini call only when stale/missing —
      // run in parallel so a stale org doesn't serialize the whole list.
      // user_contributed_orgs rows share the `id` column but aren't real orgs
      // rows, so skip them (their id could collide with an unrelated org's id).
      await Promise.all(rows.map(async (org) => {
        if (org.is_private_only) return;
        try {
          org.activity_summary_text = await ensureOrgActivitySummary(pool, org.id, org.name, { websiteUrl: org.website_url || org.donation_url });
        } catch (e) {
          console.error('❌ activity summary for org', org.id, e.message);
        }
      }));

      res.json(rows);
    } catch (e) {
      console.error('❌ GET /api/give/orgs:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/user/supported-orgs-this-year', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const r = await pool.query(
        `WITH yearly AS (
           SELECT
             c.org_id,
             lower(regexp_replace(trim(c.org_name), '\s+', ' ', 'g')) AS org_name_key,
             max(c.org_name) AS org_name_fallback,
             COALESCE(SUM(c.amount_cents), 0)::bigint AS given_this_year_cents,
             MAX(c.contributed_at) AS last_donated_at,
             COUNT(*)::int AS donations_count
           FROM contributions c
           WHERE c.user_id = $1
             AND c.contributed_at >= date_trunc('year', NOW())
           GROUP BY c.org_id, lower(regexp_replace(trim(c.org_name), '\s+', ' ', 'g'))
         )
         SELECT
           y.org_id,
           COALESCE(o.name, y.org_name_fallback) AS org_name,
           y.given_this_year_cents,
           y.last_donated_at,
           y.donations_count
         FROM yearly y
         LEFT JOIN orgs o ON o.id = y.org_id
         ORDER BY y.given_this_year_cents DESC, y.last_donated_at DESC`,
        [userId]
      );
      res.json(r.rows);
    } catch (e) {
      console.error('❌ /api/user/supported-orgs-this-year:', e.message);
      res.status(500).json({ error: 'Could not load supported orgs' });
    }
  });

  app.get('/api/give/history', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id;
      const r = await pool.query(
        `SELECT
           c.id,
           c.org_id,
           COALESCE(o.name, c.org_name) AS org_name,
           c.amount_cents,
           c.currency,
           c.contributed_at,
           c.source
         FROM contributions c
         LEFT JOIN orgs o ON o.id = c.org_id
         WHERE c.user_id = $1
         ORDER BY c.contributed_at DESC
         LIMIT 200`,
        [userId]
      );
      res.json(r.rows);
    } catch (e) {
      console.error('❌ GET /api/give/history:', e.message);
      res.status(500).json({ error: 'Could not load giving history' });
    }
  });

  app.delete('/api/contributions/:id', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });

    try {
      const result = await pool.query(
        `DELETE FROM contributions WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ DELETE /api/contributions/:id:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/give/log-donation', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const orgId = Number.parseInt(req.body?.org_id, 10);
    const amountCents = Number.parseInt(req.body?.amount_cents, 10);
    const currency = String(req.body?.currency || 'USD').trim().toUpperCase();

    if (!Number.isInteger(orgId) || orgId < 1) {
      return res.status(400).json({ error: 'Invalid org_id' });
    }
    if (!Number.isInteger(amountCents) || amountCents < 1) {
      return res.status(400).json({ error: 'Invalid amount_cents (must be positive integer)' });
    }

    try {
      const org = await pool.query('SELECT id, name FROM orgs WHERE id = $1', [orgId]);
      if (!org.rows.length) {
        return res.status(404).json({ error: 'Org not found' });
      }

      await pool.query(
        `INSERT INTO contributions (user_id, org_id, org_name, amount_cents, currency, contributed_at, source)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'manual')`,
        [userId, orgId, org.rows[0].name, amountCents, currency]
      );

      return res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ POST /api/give/log-donation:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

}

module.exports = { registerActionRoutes };
