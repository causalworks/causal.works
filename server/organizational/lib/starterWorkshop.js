'use strict';

// Baseline "Getting Started" workshop every new org gets its own copy of, so a new cooperative
// opens the Workshop tab to a working space (what to decide first, and where) instead of an empty
// list or someone else's conversation. Generic on purpose: no named orgs, no fake participants.
// The org's own members are the participants; the creator is the convener. Demo Company's
// "Getting Started" (project 8, migration 272) is the fully populated example of the same shape.
// Naming convention for any seeded/example participants: label by ROLE only ("Governance Lead"),
// never an invented org or person name, since an invented name can match a real one. Real
// members carry their org via workshop_space_members.org_id.
//
// Called after org creation commits (routes/orgs.js). Best-effort like pod provisioning: always
// resolves, never throws, and is idempotent per org (slug getting-started-<orgId>).

function starterContent(orgName) {
  const name = orgName || 'your organization';
  return {
    projectName: 'Getting Started',
    projectDescription: `The first decisions and habits ${name} needs in place: how decisions get made, how members are onboarded, and how the team stays in touch.`,
    documents: [
      {
        title: 'What This Workshop Is For',
        content:
`- One place for decisions that need more than one person
- Start a **thread** for a question
- Write a **proposal** when you're ready to decide
- Keep **notes** so the reasoning is findable later
- Invite colleagues from Settings > Workspace users`,
      },
      {
        title: 'First Workstreams',
        content:
`- **Decision-making:** who decides what
- **Onboarding:** a short checklist for new people
- **Communication:** where you talk, and how often
- **Shared resources:** what you could share with other cooperatives`,
      },
    ],
    threads: [
      { title: 'How should we make decisions?' },
      { title: 'What belongs on the onboarding checklist?' },
    ],
  };
}

async function createStarterWorkshopForOrg(pool, { orgId, orgName, userId }) {
  try {
    const slug = `getting-started-${orgId}`;
    const existing = await pool.query(`SELECT id FROM workshop_projects WHERE slug = $1`, [slug]);
    if (existing.rows.length > 0) return { ok: true, alreadyExists: true };

    const c = starterContent(orgName);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = await client.query(
        `INSERT INTO workshop_projects (slug, name, description, phase) VALUES ($1, $2, $3, 'research') RETURNING id`,
        [slug, c.projectName, c.projectDescription]
      );
      const w = await client.query(
        `INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, access_scope)
         VALUES ($1, 'main', $2, $3, 'org_internal', 'members_only') RETURNING id`,
        [p.rows[0].id, c.projectName, c.projectDescription]
      );
      const spaceId = w.rows[0].id;
      await client.query(
        `INSERT INTO workshop_space_members (space_id, user_id, org_id, role) VALUES ($1, $2, $3, 'convener')`,
        [spaceId, userId, orgId]
      );
      for (const d of c.documents) {
        await client.query(
          `INSERT INTO workshop_documents (workspace_id, title, content, created_by_user_id, updated_by_user_id, doc_type)
           VALUES ($1, $2, $3, $4, $4, 'note')`,
          [spaceId, d.title, d.content, userId]
        );
      }
      // Threads start empty: a new org's workshop holds no invented conversation or authors.
      for (const t of c.threads) {
        await client.query(
          `INSERT INTO workshop_threads (workspace_id, title, created_by_user_id) VALUES ($1, $2, $3)`,
          [spaceId, t.title, userId]
        );
      }
      await client.query('COMMIT');
      return { ok: true, projectId: p.rows[0].id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`starterWorkshop: failed for org ${orgId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { createStarterWorkshopForOrg };
