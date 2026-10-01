  'use strict';

const crypto = require('crypto');
const { requireAuth, sendOrgInviteEmail } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { provisionPodForOrg } = require('../lib/podProvision');
const { createStarterWorkshopForOrg } = require('../lib/starterWorkshop');
const { seedSampleOrgContent } = require('../lib/seedSampleOrgContent');
const { enterOrgContext } = require('../lib/orgContext');

const DISPLAY_NAME_MAX = 200;
const SLUG_MAX = 128;

/** Escape `%` and `_` for PostgreSQL ILIKE with ESCAPE '\\'. */
function escapeIlikePattern(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

// Org identity/roster fields (coop_members, alias o) joined with org-private financial/
// compliance/onboarding config (org_settings, alias s) -- see migration 162's header comment
// for why these live in two tables now. Response field names are kept identical to before
// the split (e.g. `cooperative_profile`) so the frontend needs no changes.
const ORG_SELECT_FIELDS = `o.id,
           o.causal_org_id,
           o.display_name,
           o.slug,
           s.ein,
           s.fiscal_year_end_month,
           s.xero_tenant_id,
           o.member_since,
           o.membership_status,
           s.org_profile_data AS cooperative_profile,
           s.onboarding_step,
           s.onboarding_completed_at,
           s.onboarding_target_fiscal_year,
           s.onboarding_conversion_date,
           s.onboarding_has_prior_data,
           s.onboarding_blank_coa_chosen,
           s.fiscal_sponsorship_mode,
           s.sponsorship_model,
           s.default_admin_rate,
           s.entity_classification,
           s.federal_grant_recipient,
           s.state_charitable_solicitation_registrations,
           s.has_lobbying_activity,
           s.has_political_electoral_activity,
           s.membership_enabled,
           s.reply_to_email,
           s.session_timeout_minutes,
           o.is_platform_demo,
           o.created_at,
           o.updated_at,
           m.role::text AS role,
           m.last_dashboard_visit_at,
           (SELECT MAX(a.created_at) FROM org_actuals a WHERE a.org_id = o.id) AS actuals_last_sync_at,
           (SELECT COUNT(*)::int FROM org_actuals a2 WHERE a2.org_id = o.id) AS actuals_row_count`;

/** Lowercase URL slug: letters, digits, hyphens; empty if nothing valid remains. */
function normalizeSlugInput(raw) {
  const de = String(raw || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let s = de
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > SLUG_MAX) s = s.slice(0, SLUG_MAX).replace(/-+$/g, '');
  return s;
}

function slugFromDisplayName(displayName) {
  const base = normalizeSlugInput(displayName);
  if (base.length >= 3) return base.slice(0, 96);
  return `org-${crypto.randomBytes(4).toString('hex')}`;
}

async function slugTaken(client, slug) {
  const r = await client.query('SELECT 1 FROM coop_members WHERE slug = $1 LIMIT 1', [slug]);
  return r.rows.length > 0;
}

/** Reserve a slug: if explicitSlugSet, slug must be free or conflict; else pick base, base-2, … */
async function reserveSlug(client, displayName, requestedSlug, explicitSlugSet) {
  if (explicitSlugSet) {
    const slug = normalizeSlugInput(requestedSlug);
    if (slug.length < 3) {
      return { ok: false, error: 'slug must be at least 3 characters after normalization' };
    }
    if (await slugTaken(client, slug)) {
      return { ok: false, conflict: true };
    }
    return { ok: true, slug };
  }

  const base = slugFromDisplayName(displayName);
  for (let i = 0; i < 200; i += 1) {
    let candidate = i === 0 ? base : `${base}-${i}`;
    if (candidate.length > SLUG_MAX) {
      candidate = `${base.slice(0, Math.max(3, SLUG_MAX - 8))}-${crypto.randomBytes(3).toString('hex')}`;
    }
    if (candidate.length < 3) continue;
    if (!(await slugTaken(client, candidate))) {
      return { ok: true, slug: candidate };
    }
  }
  const fallback = `org-${crypto.randomBytes(12).toString('hex')}`;
  return { ok: true, slug: fallback.slice(0, SLUG_MAX) };
}

function registerOrganizationalOrgRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess];
  const orgMember = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const orgAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/search-civic', ...orgAuth, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ orgs: [] });
    }
    try {
      const safe = escapeIlikePattern(q);
      const pattern = `%${safe}%`;
      const r = await pool.query(
        `SELECT id, name FROM orgs
         WHERE name ILIKE $1 ESCAPE '\\'
         ORDER BY name ASC
         LIMIT 20`,
        [pattern]
      );
      return res.json({ orgs: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/orgs/search-civic:', e.message);
      return res.status(500).json({ error: 'Search failed' });
    }
  });

  app.get('/api/organizational/orgs', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT ${ORG_SELECT_FIELDS}
         FROM org_users m
         INNER JOIN coop_members o ON o.id = m.org_id
         LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE m.user_id = $1 AND o.deleted_at IS NULL
         ORDER BY o.display_name ASC`,
        [userId]
      );
      return res.json({ orgs: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/orgs:', e.message);
      return res.status(500).json({ error: 'Could not load organizations' });
    }
  });

  // Uses orgMember (requireOrgMembership), not the bare orgAuth every other route on this
  // path used to use -- org_settings has FORCE RLS, and the old orgAuth chain never entered
  // org context, so this LEFT JOIN silently returned NULL for every org_settings column
  // (fiscal_sponsorship_mode, membership_enabled, ein, xero_tenant_id, onboarding fields,
  // everything) for every org, every user -- fail-closed RLS doing exactly what it's
  // designed to do, just against a route that never told it which org it was reading. Found
  // live 2026-09-14: a real save to org_settings succeeded and was visible via a superuser
  // connection, but this endpoint kept serving null back to the browser that made the save.
  app.get('/api/organizational/orgs/:slug', ...orgMember, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT ${ORG_SELECT_FIELDS}
         FROM org_users m
         INNER JOIN coop_members o ON o.id = m.org_id
         LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE m.user_id = $1 AND o.id = $2 AND o.deleted_at IS NULL
         LIMIT 1`,
        [userId, req.orgId]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      return res.json({ org: r.rows[0] });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug:', e.message);
      return res.status(500).json({ error: 'Could not load organization' });
    }
  });

  app.patch('/api/organizational/orgs/:slug', ...orgAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      const cur = await pool.query(
        `SELECT o.id, o.display_name, s.ein, s.fiscal_year_end_month, s.org_profile_data AS cooperative_profile,
                s.fiscal_sponsorship_mode, s.sponsorship_model, s.default_admin_rate,
                s.entity_classification, s.federal_grant_recipient, s.state_charitable_solicitation_registrations,
                s.has_lobbying_activity, s.has_political_electoral_activity, s.membership_enabled,
                s.reply_to_email, s.onboarding_target_fiscal_year, s.onboarding_conversion_date,
                s.onboarding_has_prior_data, s.session_timeout_minutes
         FROM org_users m
         INNER JOIN coop_members o ON o.id = m.org_id
         LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE m.user_id = $1 AND o.slug = $2 AND o.deleted_at IS NULL
         LIMIT 1`,
        [userId, slug]
      );
      if (cur.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      const row = cur.rows[0];
      let displayName = row.display_name;
      if (body.display_name !== undefined) {
        const dn = String(body.display_name ?? '').trim();
        if (!dn) return res.status(400).json({ error: 'display_name cannot be empty' });
        if (dn.length > DISPLAY_NAME_MAX) {
          return res.status(400).json({ error: `display_name must be at most ${DISPLAY_NAME_MAX} characters` });
        }
        displayName = dn;
      }

      // Generate slug from display name
      const newSlug = slugFromDisplayName(displayName);

      let ein = row.ein;
      if (body.ein !== undefined) {
        if (body.ein === null || String(body.ein).trim() === '') ein = null;
        else {
          ein = String(body.ein).trim();
          if (ein.length > 32) return res.status(400).json({ error: 'ein is too long' });
        }
      }

      let fiscalMonth = row.fiscal_year_end_month;
      if (body.fiscal_year_end_month !== undefined && body.fiscal_year_end_month !== null) {
        const m = Number(body.fiscal_year_end_month);
        if (!Number.isInteger(m) || m < 1 || m > 12) {
          return res.status(400).json({ error: 'fiscal_year_end_month must be 1–12' });
        }
        fiscalMonth = m;
      }

      let profile = row.cooperative_profile;
      if (profile && typeof profile === 'string') {
        try {
          profile = JSON.parse(profile);
        } catch (_) {
          profile = {};
        }
      }
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = {};

      if (body.cooperative_profile !== undefined && body.cooperative_profile !== null) {
        if (typeof body.cooperative_profile !== 'object' || Array.isArray(body.cooperative_profile)) {
          return res.status(400).json({ error: 'cooperative_profile must be a JSON object' });
        }
        const incoming = body.cooperative_profile;
        const keys = ['mission', 'program_areas', 'region', 'website'];
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(incoming, k)) {
            const v = incoming[k];
            if (v === null || v === '') {
              delete profile[k];
            } else if (k === 'program_areas' && Array.isArray(v)) {
              profile.program_areas = v.map((x) => String(x).trim()).filter(Boolean);
            } else if (k === 'program_areas' && typeof v === 'string') {
              profile.program_areas = v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            } else {
              profile[k] = String(v).trim();
            }
          }
        }
      }

      // Handle fiscal sponsorship fields
      let fiscalSponsorshipMode = row.fiscal_sponsorship_mode;
      let sponsorshipModel = row.sponsorship_model;
      let defaultAdminRate = row.default_admin_rate;

      if (body.fiscal_sponsorship_mode !== undefined) {
        fiscalSponsorshipMode = body.fiscal_sponsorship_mode === true;
      }

      if (body.sponsorship_model !== undefined) {
        const validModels = ['model_a', 'model_c', 'other'];
        if (!validModels.includes(body.sponsorship_model)) {
          return res.status(400).json({ error: 'Invalid sponsorship_model' });
        }
        sponsorshipModel = body.sponsorship_model;
      }

      if (body.default_admin_rate !== undefined) {
        const rate = Number(body.default_admin_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return res.status(400).json({ error: 'default_admin_rate must be between 0 and 100' });
        }
        defaultAdminRate = rate;
      }

      // Handle org characteristics fields
      let entityClassification = row.entity_classification;
      if (body.entity_classification !== undefined) {
        const validClassifications = ['501(c)(3)', '501(c)(4)', 'other'];
        const ec = String(body.entity_classification || '').trim();
        if (ec && !validClassifications.includes(ec)) {
          return res.status(400).json({ error: 'Invalid entity_classification' });
        }
        entityClassification = ec || null;
      }

      let federalGrantRecipient = row.federal_grant_recipient;
      if (body.federal_grant_recipient !== undefined) {
        federalGrantRecipient = body.federal_grant_recipient === true;
      }

      let stateRegistrations = row.state_charitable_solicitation_registrations;
      if (body.state_charitable_solicitation_registrations !== undefined) {
        if (body.state_charitable_solicitation_registrations === null) {
          stateRegistrations = null;
        } else if (Array.isArray(body.state_charitable_solicitation_registrations)) {
          stateRegistrations = body.state_charitable_solicitation_registrations;
        }
      }

      let lobbyingActivity = row.has_lobbying_activity;
      if (body.has_lobbying_activity !== undefined) {
        lobbyingActivity = body.has_lobbying_activity === true;
      }

      let politicalActivity = row.has_political_electoral_activity;
      if (body.has_political_electoral_activity !== undefined) {
        politicalActivity = body.has_political_electoral_activity === true;
      }

      let membershipEnabled = row.membership_enabled;
      if (body.membership_enabled !== undefined) {
        membershipEnabled = body.membership_enabled === true;
      }

      let replyToEmail = row.reply_to_email;
      if (body.reply_to_email !== undefined) {
        replyToEmail = body.reply_to_email === null || String(body.reply_to_email).trim() === ''
          ? null
          : String(body.reply_to_email).trim();
      }

      // Onboarding fiscal-year-timeline answers (basics step: which FY, conversion date, prior data)
      let onboardingTargetFY = row.onboarding_target_fiscal_year;
      if (body.onboarding_target_fiscal_year !== undefined) {
        if (body.onboarding_target_fiscal_year === null) {
          onboardingTargetFY = null;
        } else {
          const y = Number(body.onboarding_target_fiscal_year);
          if (!Number.isInteger(y) || y < 1900 || y > 2200) {
            return res.status(400).json({ error: 'onboarding_target_fiscal_year must be a valid year' });
          }
          onboardingTargetFY = y;
        }
      }

      let onboardingConversionDate = row.onboarding_conversion_date;
      if (body.onboarding_conversion_date !== undefined) {
        onboardingConversionDate = body.onboarding_conversion_date === null || String(body.onboarding_conversion_date).trim() === ''
          ? null
          : String(body.onboarding_conversion_date).trim();
      }

      let onboardingHasPriorData = row.onboarding_has_prior_data;
      if (body.onboarding_has_prior_data !== undefined) {
        onboardingHasPriorData = body.onboarding_has_prior_data === null ? null : body.onboarding_has_prior_data === true;
      }

      // How long a session survives ordinary gaps between page loads/API calls inside this
      // org's workspace before requiring a fresh login -- independent of, and does not relax,
      // the fixed 15-minute unattended-inactivity client-side auto-logout (see idle-logout.js).
      const SESSION_TIMEOUT_OPTIONS = [15, 30, 60, 120, 240, 480];
      let sessionTimeoutMinutes = row.session_timeout_minutes;
      if (body.session_timeout_minutes !== undefined) {
        if (body.session_timeout_minutes === null) {
          sessionTimeoutMinutes = null;
        } else {
          const m = Number(body.session_timeout_minutes);
          if (!SESSION_TIMEOUT_OPTIONS.includes(m)) {
            return res.status(400).json({ error: `session_timeout_minutes must be one of ${SESSION_TIMEOUT_OPTIONS.join(', ')}` });
          }
          sessionTimeoutMinutes = m;
        }
      }

      // Split across two tables now (migration 162) -- identity/roster fields on coop_members,
      // financial/compliance/onboarding config on org_settings. Both writes need to succeed
      // together, so this wraps a transaction where a single UPDATE previously sufficed.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE coop_members SET display_name = $2, slug = $3, updated_at = NOW() WHERE id = $1`,
          [row.id, displayName, newSlug]
        );
        await client.query(
          `UPDATE org_settings
           SET ein = $2,
               fiscal_year_end_month = $3,
               org_profile_data = $4::jsonb,
               fiscal_sponsorship_mode = $5,
               sponsorship_model = $6::sponsorship_model_enum,
               default_admin_rate = $7,
               entity_classification = $8,
               federal_grant_recipient = $9,
               state_charitable_solicitation_registrations = $10,
               has_lobbying_activity = $11,
               has_political_electoral_activity = $12,
               membership_enabled = $13,
               reply_to_email = $14,
               onboarding_target_fiscal_year = $15,
               onboarding_conversion_date = $16::date,
               onboarding_has_prior_data = $17,
               session_timeout_minutes = $18,
               updated_at = NOW()
           WHERE org_id = $1`,
          [row.id, ein, fiscalMonth, JSON.stringify(profile), fiscalSponsorshipMode, sponsorshipModel, defaultAdminRate, entityClassification, federalGrantRecipient, stateRegistrations, lobbyingActivity, politicalActivity, membershipEnabled, replyToEmail, onboardingTargetFY, onboardingConversionDate, onboardingHasPriorData, sessionTimeoutMinutes]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const refetch = await pool.query(
        `SELECT ${ORG_SELECT_FIELDS}
         FROM org_users m
         INNER JOIN coop_members o ON o.id = m.org_id
         LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE m.user_id = $1 AND o.id = $2
         LIMIT 1`,
        [userId, row.id]
      );
      const orgRow = refetch.rows[0];
      return res.json({ org: orgRow });
    } catch (e) {
      console.error('PATCH /api/organizational/orgs/:slug:', e.message);
      return res.status(500).json({ error: 'Could not update organization' });
    }
  });

  // Soft delete: hides the org immediately (via the deleted_at IS NULL filters in
  // GET /orgs, GET/PATCH /orgs/:slug, and requireOrgMembership). The underlying rows +
  // uploaded files are only hard-deleted 30 days later by the scheduled purge job
  // (server/jobs/purge-deleted-orgs.js), so this is recoverable by an operator until then.
  app.delete('/api/organizational/orgs/:slug', ...orgAdmin, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const confirmName = String(body.confirm_name ?? '').trim();

    try {
      const orgR = await pool.query(
        `SELECT display_name, is_platform_demo FROM coop_members WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [orgId]
      );
      if (orgR.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      const { display_name: displayName, is_platform_demo: isPlatformDemo } = orgR.rows[0];
      if (isPlatformDemo) {
        return res.status(403).json({ error: 'This organization is managed by the platform and cannot be deleted.' });
      }
      if (!confirmName || confirmName !== displayName) {
        return res.status(400).json({ error: 'Organization name did not match' });
      }

      await pool.query(
        `UPDATE coop_members SET deleted_at = NOW(), deleted_by_user_id = $1 WHERE id = $2`,
        [userId, orgId]
      );

      console.log(
        `[org-delete] org_id=${orgId} slug=${req.params.slug} name=${JSON.stringify(displayName)} ` +
        `deleted_by_user_id=${userId} at=${new Date().toISOString()} — recoverable for 30 days`
      );

      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/orgs/:slug:', e.message);
      return res.status(500).json({ error: 'Could not delete organization' });
    }
  });

  app.post('/api/organizational/orgs', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const displayName = String(body.display_name ?? '').trim();
    if (!displayName) {
      return res.status(400).json({ error: 'display_name is required' });
    }
    if (displayName.length > DISPLAY_NAME_MAX) {
      return res.status(400).json({ error: `display_name must be at most ${DISPLAY_NAME_MAX} characters` });
    }

    const explicitSlug =
      body.slug !== undefined && body.slug !== null && String(body.slug).trim() !== '';

    let causalOrgId = null;
    if (body.causal_org_id !== undefined && body.causal_org_id !== null && body.causal_org_id !== '') {
      const n = Number(body.causal_org_id);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: 'causal_org_id must be a positive integer' });
      }
      const orgCheck = await pool.query('SELECT id FROM orgs WHERE id = $1 LIMIT 1', [n]);
      if (orgCheck.rows.length === 0) {
        return res.status(400).json({ error: 'causal_org_id does not match an existing org' });
      }
      causalOrgId = n;
    }

    let ein = null;
    if (body.ein !== undefined && body.ein !== null && String(body.ein).trim() !== '') {
      ein = String(body.ein).trim();
      if (ein.length > 32) {
        return res.status(400).json({ error: 'ein is too long' });
      }
    }

    let fiscalYearEndMonth = Number(body.fiscal_year_end_month);
    if (!Number.isInteger(fiscalYearEndMonth) || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
      return res.status(400).json({ error: 'fiscal_year_end_month is required (1–12, month fiscal year ends)' });
    }

    let memberSince = null;
    if (body.member_since !== undefined && body.member_since !== null && String(body.member_since).trim() !== '') {
      const d = new Date(String(body.member_since).trim());
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'member_since must be a valid date' });
      }
      memberSince = d.toISOString();
    }

    let cooperativeProfile = null;
    if (body.cooperative_profile !== undefined && body.cooperative_profile !== null) {
      if (typeof body.cooperative_profile !== 'object' || Array.isArray(body.cooperative_profile)) {
        return res.status(400).json({ error: 'cooperative_profile must be a JSON object' });
      }
      cooperativeProfile = body.cooperative_profile;
    }

    // Opt-in: populates the new org with representative sample content (documents,
    // access groups/permissions, a grant, personnel) instead of leaving it empty --
    // for invited people trying the platform, not a real org building from scratch.
    // See .claude/plans/archive/2026-09-28-seeded-sample-org-creation.md.
    const seedSampleData = body.seed_sample_data === true;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const slugRes = await reserveSlug(
        client,
        displayName,
        explicitSlug ? String(body.slug) : '',
        explicitSlug
      );
      const slugTakenHint =
        'This workspace may already exist. Refresh this page (you may have just been added as a member). You can also try a different organization name to get a new URL slug, or ask a workspace admin to invite you.';

      if (!slugRes.ok) {
        await client.query('ROLLBACK');
        if (slugRes.conflict) {
          return res.status(409).json({
            error: 'That slug is already in use',
            hint: slugTakenHint,
          });
        }
        return res.status(400).json({ error: slugRes.error || 'Invalid slug' });
      }
      const { slug } = slugRes;

      let orgRow;
      try {
        const ins = await client.query(
          `INSERT INTO coop_members (
            causal_org_id,
            display_name,
            slug,
            member_since,
            created_via
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id,
            causal_org_id,
            display_name,
            slug,
            member_since,
            membership_status,
            created_at,
            updated_at`,
          [causalOrgId, displayName, slug, memberSince, seedSampleData ? 'invited_sample' : null]
        );
        orgRow = ins.rows[0];

        // This transaction's client was checked out (pool.connect() -> scopedConnect())
        // before this org existed, so the automatic app.current_org_id injection at BEGIN
        // captured null -- org_settings/org_users/org_programs all carry FORCE RLS org-
        // isolation policies (org_id = current_setting('app.current_org_id')), and a null
        // GUC never matches, so every INSERT below would be rejected outright now that the
        // app connects as the non-superuser causal_app role (RLS cutover; this route was
        // never updated for it). Set it explicitly, now that the org's own id is known --
        // set_config(..., true) scopes to this already-open transaction, same mechanism
        // scopedPool.js uses automatically everywhere else.
        await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgRow.id)]);

        const settingsIns = await client.query(
          `INSERT INTO org_settings (org_id, ein, fiscal_year_end_month, org_profile_data)
           VALUES ($1, $2, $3, $4::jsonb)
           RETURNING ein, fiscal_year_end_month, xero_tenant_id, org_profile_data AS cooperative_profile,
                     onboarding_step, onboarding_completed_at`,
          [
            orgRow.id,
            ein,
            fiscalYearEndMonth,
            cooperativeProfile != null ? JSON.stringify(cooperativeProfile) : null,
          ]
        );
        Object.assign(orgRow, settingsIns.rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e && e.code === '23505') {
          const d = String(e.detail || '');
          if (d.includes('causal_org_id')) {
            return res.status(409).json({
              error: 'A workspace is already linked to that civic org',
              hint: 'Remove the civic directory link below, or use the existing workspace that is already connected to that org.',
            });
          }
          if (!explicitSlug) {
            return res.status(409).json({
              error: 'Could not allocate a unique slug; try again',
              hint: slugTakenHint,
            });
          }
          return res.status(409).json({
            error: 'That slug is already in use',
            hint: slugTakenHint,
          });
        }
        throw e;
      }

      await client.query(
        `INSERT INTO org_users (org_id, user_id, role)
         VALUES ($1, $2, 'admin'::org_member_role)`,
        [orgRow.id, userId]
      );

      await client.query(
        `INSERT INTO org_programs (org_id, code, name, description, active, parent_id, is_default)
         VALUES
           ($1, 'GEN', 'General', '', TRUE, NULL, TRUE),
           ($1, 'FR', 'Fundraising', '', TRUE, NULL, TRUE)
         ON CONFLICT DO NOTHING`,
        [orgRow.id]
      );

      await client.query('COMMIT');

      // Pod provisioning is best-effort and strictly after commit - a failure here
      // must never fail org creation. provisionPodForOrg() always resolves (never
      // throws) and records success/failure on org_settings itself.
      //
      // This request never called requireOrgMembership (there was no org to be a
      // member of yet), so the org-scoped pool has no app.current_org_id GUC set
      // for this async context - without entering it explicitly here, org_settings'
      // FORCE RLS policy would silently make the pod_provisioned UPDATE affect 0
      // rows even after a successful pod creation.
      enterOrgContext(orgRow.id);
      try {
        await provisionPodForOrg(pool, orgRow.id, orgRow.slug);
      } catch (podErr) {
        console.error('POST /api/organizational/orgs: unexpected pod provisioning error:', podErr.message);
      }

      // Baseline Getting Started workshop for the new org; best-effort, never fails creation.
      await createStarterWorkshopForOrg(pool, {
        orgId: orgRow.id,
        orgName: orgRow.display_name,
        userId: req.user.user_id ?? req.user.id,
      });

      if (seedSampleData) {
        const seedResult = await seedSampleOrgContent(pool, orgRow.id, orgRow.slug, {
          userId: req.user.user_id ?? req.user.id,
        });
        if (!seedResult.ok) {
          console.error(`POST /api/organizational/orgs: sample content seeding incomplete for org ${orgRow.id}:`, seedResult.errors);
        }
      }

      const redirectPath = `/organizational/o/${encodeURIComponent(orgRow.slug)}/onboarding`;
      return res.status(201).json({
        org: orgRow,
        redirect: redirectPath,
        redirect_onboarding: redirectPath,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      console.error('POST /api/organizational/orgs:', e && e.message, e && e.code, e && e.detail);
      if (e && e.code === '42703') {
        return res.status(503).json({
          error: 'Database is missing newer Organizational columns (e.g. onboarding).',
          hint: 'On the server, apply any pending migrations under db/migrations/, then restart the app.',
        });
      }
      const hint =
        e && e.code === '23505'
          ? 'A record may already exist for this workspace or link. Refresh the page or clear the civic org link and try again.'
          : 'Refresh the page in case you were just added to an existing workspace. If it keeps failing, check server logs or apply pending migrations.';
      return res.status(500).json({
        error: 'Could not create organization',
        hint,
      });
    } finally {
      client.release();
    }
  });

  // Members API
  app.get('/api/organizational/orgs/:slug/members', ...orgMember, async (req, res) => {
    const orgId = req.orgId;
    try {
      // Demo Company is a shared sandbox every platform user gets auto-enrolled into
      // (see bootstrap_demo_org_membership in migration 155) — its "members" are unrelated
      // real accounts, not teammates, so never expose their emails to each other here.
      const demoR = await pool.query(`SELECT is_platform_demo FROM coop_members WHERE id = $1`, [orgId]);
      if (demoR.rows[0] && demoR.rows[0].is_platform_demo) {
        return res.json({ members: [], masked: true });
      }
      // m.id (org_users.id), not u.id (users.id), is returned as "id" -- PATCH/DELETE
      // /members/:id both filter on org_users.id (and org_program_grants.org_user_id FKs to
      // it), so sending users.id back to the client here was a real bug: the two id spaces
      // aren't the same, and mismatches silently no-op'd role changes and member removal (see
      // .claude/plans/archive/2026-09-19-inviteaccept-rls-fix.md's follow-up note for how this surfaced).
      const r = await pool.query(
        `SELECT m.id, u.email, m.role, m.created_at,
                COALESCE(
                  (SELECT array_agg(g.program_id ORDER BY g.program_id) FROM org_program_grants g WHERE g.org_user_id = m.id),
                  ARRAY[]::integer[]
                ) AS program_ids
         FROM org_users m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
         ORDER BY m.created_at ASC`,
        [orgId]
      );
      return res.json({ members: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/members:', e.message);
      return res.status(500).json({ error: 'Could not load members' });
    }
  });

  // Invites API
  app.get('/api/organizational/orgs/:slug/invites', ...orgMember, async (req, res) => {
    const orgId = req.orgId;
    try {
      const demoR = await pool.query(`SELECT is_platform_demo FROM coop_members WHERE id = $1`, [orgId]);
      if (demoR.rows[0] && demoR.rows[0].is_platform_demo) {
        return res.json({ invites: [], masked: true });
      }
      const r = await pool.query(
        `SELECT id, email, role, expires_at, created_at, program_ids
         FROM org_invites
         WHERE org_id = $1 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [orgId]
      );
      return res.json({ invites: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/invites:', e.message);
      return res.status(500).json({ error: 'Could not load invites' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invites', ...orgAdmin, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || 'finance').toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    // 'staff' is retired from new assignment as of the org-level permission system
    // (.claude/plans/2026-09-19-solid-odi-demo-readiness.md) -- existing 'staff' rows
    // remain valid (see FINANCE_ROLES) until Step C's data cutover, but new invites use
    // 'finance' instead. 'program' is invitable as of migration 258 -- org_invites carries
    // program_ids (the intended grants), materialized into real org_program_grants rows by
    // inviteAccept.js once the org_users row exists at acceptance. 'fundraising' is invitable
    // as of migration 263 -- org-wide (donor/gift data has no program dimension), no program_ids.
    if (!['admin', 'finance', 'program', 'fundraising'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, finance, program, or fundraising' });
    }
    const programIds = Array.isArray(body.program_ids) ? [...new Set(body.program_ids.map(Number))] : [];
    if (role === 'program' && programIds.length === 0) {
      return res.status(400).json({ error: 'program_ids is required (at least one) when role is program' });
    }

    try {
      if (role === 'program') {
        const validR = await pool.query(
          `SELECT id FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`,
          [orgId, programIds]
        );
        if (validR.rows.length !== programIds.length) {
          return res.status(400).json({ error: 'One or more program_ids do not belong to this organization' });
        }
      }
      // Check if user is already a member
      const existingMemberR = await pool.query(
        `SELECT u.id FROM org_users m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND u.email = $2 LIMIT 1`,
        [orgId, email]
      );
      if (existingMemberR.rows.length > 0) {
        return res.status(400).json({ error: 'User is already a member' });
      }

      // Check for pending invite
      const existingInviteR = await pool.query(
        `SELECT id FROM org_invites
         WHERE org_id = $1 AND email = $2 AND used = FALSE AND expires_at > NOW()
         LIMIT 1`,
        [orgId, email]
      );
      if (existingInviteR.rows.length > 0) {
        return res.status(400).json({ error: 'Invite already pending' });
      }

      // Generate token
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const r = await pool.query(
        `INSERT INTO org_invites (org_id, email, token_hash, role, invited_by, expires_at, program_ids)
         VALUES ($1, $2, $3, $4::org_member_role, $5, $6, $7)
         RETURNING id, email, role, expires_at, program_ids`,
        [orgId, email, tokenHash, role, userId, expiresAt, role === 'program' ? programIds : []]
      );

      const orgR = await pool.query('SELECT display_name FROM coop_members WHERE id = $1', [orgId]);
      try {
        await sendOrgInviteEmail(email, token, orgR.rows[0].display_name, role);
      } catch (mailErr) {
        console.error('Could not send invite email:', mailErr.message);
      }

      return res.json({ invite: r.rows[0] });
    } catch (e) {
      console.error('POST /api/organizational/orgs/:slug/invites:', e.message);
      return res.status(500).json({ error: 'Could not create invite' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/invites/:id', ...orgAdmin, async (req, res) => {
    const inviteId = Number(req.params.id);
    const orgId = req.orgId;

    try {
      await pool.query(
        `DELETE FROM org_invites WHERE id = $1 AND org_id = $2`,
        [inviteId, orgId]
      );

      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/orgs/:slug/invites/:id:', e.message);
      return res.status(500).json({ error: 'Could not cancel invite' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/members/:id', ...orgAdmin, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const memberId = Number(req.params.id);
    const orgId = req.orgId;

    try {
      // Prevent removing the last admin
      const adminCountR = await pool.query(
        `SELECT COUNT(*) as count FROM org_users WHERE org_id = $1 AND role = 'admin'`,
        [orgId]
      );
      const adminCount = Number(adminCountR.rows[0].count);
      const memberRoleR = await pool.query(
        `SELECT role FROM org_users WHERE id = $1 AND org_id = $2`,
        [memberId, orgId]
      );
      if (memberRoleR.rows.length > 0 && memberRoleR.rows[0].role === 'admin' && adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }

      // Prevent removing yourself
      const selfR = await pool.query(
        `SELECT id FROM org_users WHERE id = $1 AND user_id = $2`,
        [memberId, userId]
      );
      if (selfR.rows.length > 0) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
      }

      await pool.query(
        `DELETE FROM org_users WHERE id = $1 AND org_id = $2`,
        [memberId, orgId]
      );

      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/orgs/:slug/members/:id:', e.message);
      return res.status(500).json({ error: 'Could not remove member' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/members/:id', ...orgAdmin, async (req, res) => {
    const memberId = Number(req.params.id);
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const role = String(body.role || '').toLowerCase();

    if (!['admin', 'finance', 'program', 'fundraising'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, finance, program, or fundraising' });
    }
    // Required only for 'program' -- a program-scoped person with zero grants would see
    // nothing anywhere program-scoped applies, which is never the intent of setting this role.
    const programIds = Array.isArray(body.program_ids) ? [...new Set(body.program_ids.map(Number))] : [];
    if (role === 'program' && programIds.length === 0) {
      return res.status(400).json({ error: 'program_ids is required (at least one) when role is program' });
    }

    try {
      // Prevent demoting the last admin
      const adminCountR = await pool.query(
        `SELECT COUNT(*) as count FROM org_users WHERE org_id = $1 AND role = 'admin'`,
        [orgId]
      );
      const adminCount = Number(adminCountR.rows[0].count);
      const memberRoleR = await pool.query(
        `SELECT role FROM org_users WHERE id = $1 AND org_id = $2`,
        [memberId, orgId]
      );
      if (memberRoleR.rows.length > 0 && memberRoleR.rows[0].role === 'admin' && role !== 'admin' && adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin' });
      }

      if (role === 'program') {
        // Confirm every program_id actually belongs to this org before granting it --
        // otherwise a typo'd or cross-org id would silently grant nothing (the FK would
        // reject it) or, worse if that check were skipped, leak which ids exist elsewhere.
        const validR = await pool.query(
          `SELECT id FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`,
          [orgId, programIds]
        );
        if (validR.rows.length !== programIds.length) {
          return res.status(400).json({ error: 'One or more program_ids do not belong to this organization' });
        }
      }

      const client = await pool.connect();
      let member;
      try {
        await client.query('BEGIN');
        const r = await client.query(
          `UPDATE org_users SET role = $1::org_member_role WHERE id = $2 AND org_id = $3
           RETURNING id, role`,
          [role, memberId, orgId]
        );
        member = r.rows[0];
        // Grants only ever mean something for the 'program' role -- clear any stale ones
        // outright on every role change (moving out of 'program' should leave none behind;
        // moving into it, or re-granting while already in it, replaces the set wholesale
        // rather than diffing, since this endpoint always receives the complete desired list).
        await client.query(`DELETE FROM org_program_grants WHERE org_user_id = $1`, [memberId]);
        if (role === 'program') {
          const userId = req.user.user_id ?? req.user.id;
          for (const programId of programIds) {
            await client.query(
              `INSERT INTO org_program_grants (org_id, org_user_id, program_id, created_by_user_id)
               VALUES ($1, $2, $3, $4)`,
              [orgId, memberId, programId, userId]
            );
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      return res.json({ member, program_ids: role === 'program' ? programIds : [] });
    } catch (e) {
      console.error('PATCH /api/organizational/orgs/:slug/members/:id:', e.message);
      return res.status(500).json({ error: 'Could not update member role' });
    }
  });
}

module.exports = { registerOrganizationalOrgRoutes, reserveSlug };
