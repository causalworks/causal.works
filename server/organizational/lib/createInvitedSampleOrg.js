'use strict';

// Creates a real, single-tenant, seeded org for someone approved through an invited
// signup flow (ODI access-request auto-approve, and any future flow with the same
// need) -- instead of the universal registerUser() default of auto-enrolling them into
// the shared Demo Company sandbox as 'staff'. See
// .claude/plans/2026-09-28-seeded-sample-org-creation.md for why: that shared sandbox
// permanently masks Members/Danger Zone and under-grants roles for everyone in it.
//
// Deliberately a separate, minimal function rather than a bigger refactor of
// POST /api/organizational/orgs (orgs.js) -- that route's own validation (explicit
// slug, EIN, causal_org_id linking, cooperative_profile) doesn't apply here; this
// reuses its core building blocks (reserveSlug, provisionPodForOrg,
// createStarterWorkshopForOrg, seedSampleOrgContent) instead of duplicating them.
//
// registerUser()'s own Demo Company auto-enrollment (migration 155) is intentionally
// left untouched for every other signup path -- this is scoped to the invited-sample
// flow only, not a platform-wide default change.

const { reserveSlug } = require('../routes/orgs');
const { provisionPodForOrg } = require('./podProvision');
const { createStarterWorkshopForOrg } = require('./starterWorkshop');
const { seedSampleOrgContent } = require('./seedSampleOrgContent');
const { enterOrgContext } = require('./orgContext');

const DEFAULT_FISCAL_YEAR_END_MONTH = 12;

async function createInvitedSampleOrg(pool, { userId, displayName }) {
  const client = await pool.connect();
  let orgRow;
  try {
    await client.query('BEGIN');

    const slugRes = await reserveSlug(client, displayName, '', false);
    if (!slugRes.ok) {
      await client.query('ROLLBACK');
      throw new Error(slugRes.error || 'Could not reserve a slug for this organization');
    }

    const ins = await client.query(
      `INSERT INTO coop_members (display_name, slug, created_via)
       VALUES ($1, $2, 'invited_sample')
       RETURNING id, display_name, slug`,
      [displayName, slugRes.slug]
    );
    orgRow = ins.rows[0];

    // Same RLS-context reasoning as orgs.js's POST /orgs -- this client had no
    // app.current_org_id until the org existed, needed explicitly now for the
    // org_settings/org_users/org_programs inserts below (FORCE RLS).
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgRow.id)]);

    await client.query(
      `INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, $2)`,
      [orgRow.id, DEFAULT_FISCAL_YEAR_END_MONTH]
    );

    await client.query(
      `INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, 'admin'::org_member_role)`,
      [orgRow.id, userId]
    );

    await client.query(
      `INSERT INTO org_programs (org_id, code, name, description, active, is_default)
       VALUES ($1, 'GEN', 'General', '', TRUE, TRUE),
              ($1, 'FR', 'Fundraising', '', TRUE, TRUE)`,
      [orgRow.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }

  // Everything below is best-effort, post-commit, same contract as orgs.js's POST
  // /orgs route -- a failure here must never undo the org that already exists.
  enterOrgContext(orgRow.id);
  try {
    await provisionPodForOrg(pool, orgRow.id, orgRow.slug);
  } catch (err) {
    console.error(`createInvitedSampleOrg: pod provisioning failed for org ${orgRow.id}:`, err.message);
  }

  try {
    await createStarterWorkshopForOrg(pool, { orgId: orgRow.id, orgName: orgRow.display_name, userId });
  } catch (err) {
    console.error(`createInvitedSampleOrg: starter workshop failed for org ${orgRow.id}:`, err.message);
  }

  const seedResult = await seedSampleOrgContent(pool, orgRow.id, orgRow.slug, { userId });
  if (!seedResult.ok) {
    console.error(`createInvitedSampleOrg: sample content seeding incomplete for org ${orgRow.id}:`, seedResult.errors);
  }

  return orgRow;
}

module.exports = { createInvitedSampleOrg };
