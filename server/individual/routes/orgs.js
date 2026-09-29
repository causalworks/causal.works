'use strict';

const crypto = require('crypto');
const { requireAuth } = require('../../auth');
const { normalizeOrgKey, normalizeUserPrimaryRegion, ALLOWED_USER_PRIMARY_REGION } = require('../utils');
const {
  normalizeSenderDomainsInput,
  assertSenderDomainsUnclaimed,
  mergeSenderDomainsForOrg,
} = require('../../org-resolution');
const { ensureOrgActivitySummary } = require('../lib/orgActivitySummary');

function registerOrgRoutes(app, pool) {

  app.get('/api/propublica/search-orgs', requireAuth(pool), async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    try {
      const ppRes = await fetch(
        'https://projects.propublica.org/nonprofits/api/v2/search.json?q=' + encodeURIComponent(q) + '&page=0',
        { headers: { Accept: 'application/json' } }
      );
      if (!ppRes.ok) return res.json({ results: [] });
      const data = await ppRes.json();
      const orgs = Array.isArray(data.organizations) ? data.organizations : [];
      const results = orgs.slice(0, 3).map((org) => ({
        name: org.name || '',
        city: org.city || '',
        state: org.state || '',
        ein: org.strein || (org.ein != null ? String(org.ein) : null),
        ntee_code: org.ntee_code || null,
        website_url: org.website || org.url || org.www || null,
      }));
      return res.json({ results });
    } catch (e) {
      console.warn('⚠️ ProPublica search failed:', e.message);
      return res.json({ results: [] });
    }
  });

  app.get('/api/orgs', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const search = (req.query.search || '').trim();
    const listable = ['active', 'pending_subscription'];
    const likeEscape = (s) => s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = search.length >= 2 ? '%' + likeEscape(search) + '%' : null;

    const tieredSql = `
      SELECT * FROM (
        SELECT o.id, o.name, o.category, o.region,
          COALESCE(o.subscription_status, 'active') AS subscription_status,
          COALESCE(o.primary_region, '{}'::text[]) AS primary_region,
          (o.added_by_user_id IS NOT NULL) AS is_user_added,
          o.website_url,
          o.activity_summary_text,
          (CASE
            WHEN 'global' = ANY(COALESCE(o.primary_region, '{}'::text[])) OR COALESCE(o.primary_region, '{}'::text[]) = '{}'::text[] THEN 0
            WHEN COALESCE(o.primary_region, '{}'::text[]) && (SELECT COALESCE(u.primary_region, '{}'::text[]) FROM users u WHERE u.id = $1) THEN 1
            ELSE 2
          END) AS org_list_tier
        FROM orgs o
        WHERE COALESCE(o.subscription_status, 'active') = ANY($2::text[])
        AND ($3::text IS NULL OR o.name ILIKE $3 ESCAPE '\\')

        UNION ALL

        SELECT
          uco.id,
          uco.org_name AS name,
          NULL AS category,
          NULL AS region,
          'user_contributed' AS subscription_status,
          '{}'::text[] AS primary_region,
          TRUE AS is_user_added,
          uco.website_url,
          NULL AS activity_summary_text,
          0 AS org_list_tier
        FROM user_contributed_orgs uco
        WHERE uco.user_id = $1
        AND ($3::text IS NULL OR uco.org_name ILIKE $3 ESCAPE '\\')
        AND NOT EXISTS (
          SELECT 1 FROM orgs o
          WHERE o.name ILIKE uco.org_name
        )
      ) ranked
      ORDER BY ranked.org_list_tier,
        CASE WHEN ranked.subscription_status = 'active' THEN 0 WHEN ranked.subscription_status = 'pending_subscription' THEN 1 ELSE 2 END,
        ranked.name`;

    try {
      const result = await pool.query(tieredSql, [userId, listable, pattern]);
      const rows = result.rows;
      // On-demand, cached: only backfill missing descriptions for the (smaller)
      // user-added set — not the whole platform picklist on every keystroke.
      await Promise.all(rows.map(async (org) => {
        if (!org.is_user_added || org.subscription_status === 'user_contributed' || org.activity_summary_text) return;
        try {
          org.activity_summary_text = await ensureOrgActivitySummary(pool, org.id, org.name, { websiteUrl: org.website_url });
        } catch (e) {
          console.error('❌ activity summary for org', org.id, e.message);
        }
      }));
      return res.json(rows);
    } catch (e) {
      if (e.message && /column.*primary_region/i.test(e.message)) {
        try {
          let legacy;
          if (pattern) {
            legacy = await pool.query(
              `SELECT id, name, category, region, COALESCE(subscription_status, 'active') AS subscription_status
               FROM orgs WHERE COALESCE(subscription_status, 'active') = ANY($1::text[])
               AND name ILIKE $2 ESCAPE '\\'
               ORDER BY CASE WHEN COALESCE(subscription_status, 'active') = 'active' THEN 0 WHEN COALESCE(subscription_status, 'active') = 'pending_subscription' THEN 1 ELSE 2 END, name`,
              [listable, pattern]
            );
          } else {
            legacy = await pool.query(
              `SELECT id, name, category, region, COALESCE(subscription_status, 'active') AS subscription_status
               FROM orgs WHERE COALESCE(subscription_status, 'active') = ANY($1::text[])
               ORDER BY CASE WHEN COALESCE(subscription_status, 'active') = 'active' THEN 0 WHEN COALESCE(subscription_status, 'active') = 'pending_subscription' THEN 1 ELSE 2 END, name`,
              [listable]
            );
          }
          return res.json(legacy.rows.map((r) => ({ ...r, primary_region: [], org_list_tier: 0, is_user_added: false, website_url: null, activity_summary_text: null })));
        } catch (e2) {
          console.error('❌ Orgs legacy query error:', e2.message);
          return res.status(500).json({ error: 'Database error' });
        }
      }
      if (e.message && /column.*(region|subscription_status)/i.test(e.message)) {
        const fallback = await pool.query(`SELECT id, name, category FROM orgs ORDER BY name LIMIT 200`);
        return res.json(
          fallback.rows.map((r) => ({ ...r, region: null, subscription_status: 'active', primary_region: [], org_list_tier: 0, is_user_added: false, website_url: null, activity_summary_text: null }))
        );
      }
      console.error('❌ Orgs query error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/orgs/suggest', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    let org_name = String(req.body.org_name || '').trim();
    if (!org_name) return res.status(400).json({ error: 'org_name required' });
    console.log(`📝 Org suggestion: user_id=${userId} name="${org_name.slice(0, 80)}${org_name.length > 80 ? '…' : ''}"`);
    if (org_name.length > 500) org_name = org_name.slice(0, 500);
    try {
      await pool.query(
        'INSERT INTO org_suggestions (user_id, org_name) VALUES ($1, $2)',
        [userId, org_name]
      );
      const ts = new Date().toISOString();
      if (process.env.POSTMARK_API_KEY) {
        try {
          const suggestPayload = {
            From: 'Causal <noreply@causal.works>',
            To: 'loopy@causal.works',
            Subject: `Org suggestion: ${org_name}`,
            TextBody: `Org name: ${org_name}\nUser ID: ${userId}\nTimestamp: ${ts}`,
            MessageStream: 'outbound',
          };
          const suggestReply = (req.user.email && String(req.user.email).trim()) || '';
          if (suggestReply) suggestPayload.ReplyTo = suggestReply;
          await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
            },
            body: JSON.stringify(suggestPayload),
          });
        } catch (mailErr) {
          console.warn('⚠️ Org suggestion admin email failed:', mailErr.message);
        }
      }
      return res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ POST /api/orgs/suggest:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/orgs/:id/suggest-donation-url', requireAuth(pool), async (req, res) => {
    const orgId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orgId) || orgId < 1) {
      return res.status(400).json({ error: 'Invalid org id' });
    }
    const url = String(req.body?.url || '').trim().slice(0, 500);
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Valid http(s) URL required' });
    }
    const userId = req.user.user_id;
    try {
      const pref = await pool.query(
        `SELECT 1 FROM user_org_preferences WHERE user_id = $1 AND org_id = $2 AND followed = TRUE`,
        [userId, orgId]
      );
      if (!pref.rows.length) {
        return res.status(403).json({ error: 'Not following this org' });
      }
      await pool.query(
        `INSERT INTO org_donation_url_suggestions (org_id, user_id, suggested_url) VALUES ($1, $2, $3)`,
        [orgId, userId, url]
      );
      return res.json({ ok: true });
    } catch (e) {
      if (e.message && /org_donation_url_suggestions/i.test(e.message)) {
        console.error('❌ POST suggest-donation-url (missing table?):', e.message);
        return res.status(503).json({ error: 'Suggestions not available yet — run db/migrations/031_orgs_donation_url.sql' });
      }
      console.error('❌ POST /api/orgs/:id/suggest-donation-url:', e.message);
      return res.status(500).json({ error: 'Could not save suggestion' });
    }
  });

  app.get('/api/user/contributed-orgs', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    try {
      const rows = await pool.query(
        `SELECT id, org_name, ein, propublica_verified, city, state, ntee_code, website_url, added_at
         FROM user_contributed_orgs
         WHERE user_id = $1
         ORDER BY added_at DESC`,
        [userId]
      );
      return res.json(rows.rows);
    } catch (e) {
      console.error('❌ GET /api/user/contributed-orgs:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/user/contributed-orgs', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const orgName = String(req.body?.org_name || '').trim().slice(0, 500);
    if (!orgName) return res.status(400).json({ error: 'org_name required' });

    const selected = req.body?.selected_match || null;
    const fromSelected = selected && String(selected.name || '').trim();
    const finalName = fromSelected || orgName;
    const finalKey = normalizeOrgKey(finalName);
    if (!finalKey) return res.status(400).json({ error: 'org_name required' });

    const propublicaVerified = !!(selected && selected.ein);
    const ein = propublicaVerified ? String(selected.ein || '').trim().slice(0, 30) : null;
    const city = propublicaVerified ? String(selected.city || '').trim().slice(0, 120) : null;
    const state = propublicaVerified ? String(selected.state || '').trim().slice(0, 50) : null;
    const nteeCode = propublicaVerified ? String(selected.ntee_code || '').trim().slice(0, 30) : null;
    const websiteUrl = propublicaVerified ? String(selected.website_url || '').trim().slice(0, 500) : null;

    try {
      const existing = await pool.query(
        `SELECT id FROM user_contributed_orgs
         WHERE user_id = $1
           AND regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = $2
         LIMIT 1`,
        [userId, finalKey]
      );
      if (existing.rows.length) {
        return res.status(409).json({ error: 'Org already added to your Contributing to list' });
      }

      const inserted = await pool.query(
        `INSERT INTO user_contributed_orgs
           (user_id, org_name, ein, propublica_verified, city, state, ntee_code, website_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, org_name, ein, propublica_verified, city, state, ntee_code, website_url, added_at`,
        [userId, finalName, ein, propublicaVerified, city, state, nteeCode, websiteUrl]
      );
      return res.status(201).json(inserted.rows[0]);
    } catch (e) {
      console.error('❌ POST /api/user/contributed-orgs:', e.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/user/contributed-orgs/:id', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) return res.status(400).json({ error: 'Invalid id' });
    try {
      const result = await pool.query(
        `DELETE FROM user_contributed_orgs WHERE id = $1 AND user_id = $2`,
        [orgId, userId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('❌ DELETE /api/user/contributed-orgs/:id:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  function propublicaResultMatches(first, userInput) {
    const score = first && (first.score != null) ? Number(first.score) : NaN;
    if (!Number.isNaN(score) && score > 50) return true;
    const apiName = ((first && (first.name || '')) + (first && first.sub_name ? ' ' + first.sub_name : '')).replace(/\s+/g, ' ').trim().toLowerCase();
    const b = (userInput || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!apiName || !b) return false;
    return apiName.includes(b) || b.includes(apiName);
  }

  app.post('/api/orgs', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id;
    const name = (req.body.name || '').trim().slice(0, 500);
    if (!name) return res.status(400).json({ error: 'Org name required' });
    const normalizedName = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalizedName) return res.status(400).json({ error: 'Org name required' });
    const senderDomains = normalizeSenderDomainsInput(req.body.sender_domains);
    if (senderDomains.length) {
      const domChk = await assertSenderDomainsUnclaimed(pool, null, senderDomains);
      if (!domChk.ok) {
        return res.status(409).json({
          error: `Sender domain "${domChk.conflict.domain}" is already used by ${domChk.conflict.name}.`,
        });
      }
    }

    let subscription_status = 'pending';
    let validated_via = null;
    let ein = null;
    let propublicaMatch = false;

    try {
      const ppRes = await fetch(
        'https://projects.propublica.org/nonprofits/api/v2/search.json?q=' + encodeURIComponent(name) + '&page=0',
        { headers: { 'Accept': 'application/json' } }
      );
      if (ppRes.ok) {
        const data = await ppRes.json();
        const orgs = data.organizations || [];
        if (orgs.length > 0) {
          const first = orgs[0];
          if (propublicaResultMatches(first, name)) {
            propublicaMatch = true;
            subscription_status = 'pending_subscription';
            validated_via = 'propublica';
            ein = first.strein || (first.ein != null ? String(first.ein) : null);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ ProPublica lookup failed:', e.message);
    }

    try {
      let existingResult;
      try {
        existingResult = await pool.query(
          `SELECT o.id, o.name, COALESCE(o.subscription_status, 'active') AS subscription_status, o.validated_via
           FROM orgs o
           LEFT JOIN org_aliases oa ON oa.org_id = o.id
           WHERE regexp_replace(regexp_replace(lower(o.name), '\\([^)]*\\)', '', 'g'), '[^a-z0-9]+', '', 'g') = $1
              OR oa.alias_key = $1
           ORDER BY
             CASE WHEN COALESCE(o.subscription_status, 'active') = 'active' THEN 0
                  WHEN COALESCE(o.subscription_status, 'active') = 'pending_subscription' THEN 1
                  ELSE 2 END,
             CASE WHEN oa.alias_key = $1 THEN 0 ELSE 1 END,
             o.id ASC
           LIMIT 1`,
          [normalizedName]
        );
      } catch (e) {
        existingResult = await pool.query(
          `SELECT id, name, COALESCE(subscription_status, 'active') AS subscription_status, validated_via
           FROM orgs
           WHERE regexp_replace(regexp_replace(lower(name), '\\([^)]*\\)', '', 'g'), '[^a-z0-9]+', '', 'g') = $1
           ORDER BY
             CASE WHEN COALESCE(subscription_status, 'active') = 'active' THEN 0
                  WHEN COALESCE(subscription_status, 'active') = 'pending_subscription' THEN 1
                  ELSE 2 END,
             id ASC
           LIMIT 1`,
          [normalizedName]
        );
      }
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        if (senderDomains.length) {
          const domChk2 = await assertSenderDomainsUnclaimed(pool, existing.id, senderDomains);
          if (!domChk2.ok) {
            return res.status(409).json({
              error: `Sender domain "${domChk2.conflict.domain}" is already used by ${domChk2.conflict.name}.`,
            });
          }
          try {
            await mergeSenderDomainsForOrg(pool, existing.id, senderDomains);
          } catch (mergeE) {
            console.warn('⚠️ merge sender_domains on existing org:', mergeE.message);
          }
        }
        await pool.query(
          'INSERT INTO user_org_preferences (user_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, existing.id]
        );
        return res.status(200).json({
          id: existing.id,
          name: existing.name,
          subscription_status: existing.subscription_status,
          validated_via: existing.validated_via,
          message: 'Using existing organization entry.',
        });
      }

      let insertResult;
      try {
        insertResult = await pool.query(
          `INSERT INTO orgs (name, subscription_status, added_by_user_id, validated_via, ein, sender_domains)
           VALUES ($1, $2, $3, $4, $5, $6::text[])
           RETURNING id, name, subscription_status, validated_via`,
          [name, subscription_status, userId, validated_via, ein, senderDomains]
        );
      } catch (insE) {
        if (insE.message && /sender_domains|column .* does not exist/i.test(insE.message)) {
          insertResult = await pool.query(
            `INSERT INTO orgs (name, subscription_status, added_by_user_id, validated_via, ein)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, subscription_status, validated_via`,
            [name, subscription_status, userId, validated_via, ein]
          );
        } else {
          throw insE;
        }
      }
      const org = insertResult.rows[0];
      await pool.query(
        'INSERT INTO user_org_preferences (user_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, org.id]
      );

      if (!propublicaMatch && process.env.POSTMARK_API_KEY) {
        const baseUrl = process.env.BASE_URL || 'https://causal.works';
        const secret = process.env.ADMIN_VALIDATE_SECRET || process.env.SESSION_SECRET || 'change-me';
        const token = crypto.createHmac('sha256', secret).update(String(org.id)).digest('hex');
        const link = `${baseUrl}/admin/validate-org?org_id=${org.id}&token=${encodeURIComponent(token)}`;
        try {
          const adminPayload = {
            From: 'Causal <noreply@causal.works>',
            To: 'loopy@causal.works',
            Subject: `New unlisted org: ${name}`,
            TextBody: `Org: ${name}\nAdded by user ID: ${userId}\nTime: ${new Date().toISOString()}\nValidate: ${link}`,
            MessageStream: 'outbound',
          };
          const adminReply = (req.user.email && String(req.user.email).trim()) || '';
          if (adminReply) adminPayload.ReplyTo = adminReply;
          await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
            },
            body: JSON.stringify(adminPayload),
          });
        } catch (mailErr) {
          console.warn('⚠️ Admin notification email failed:', mailErr.message);
        }
      }

      res.status(201).json({
        id: org.id,
        name: org.name,
        subscription_status: org.subscription_status,
        validated_via: org.validated_via,
        message: propublicaMatch ? 'Verified nonprofit' : "Added — we'll review this org shortly.",
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'An org with this name may already exist.' });
      console.error('❌ POST /api/orgs error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

}

module.exports = { registerOrgRoutes };
