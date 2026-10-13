'use strict';

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
