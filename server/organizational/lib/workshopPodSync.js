'use strict';

// Manual-trigger sync of Workshop content (Intervention Modeler + Systems Map
// only, per product decision - proposals/decisions/documents-as-governance are
// deferred to the Work Pool design work) into the owning org's own pod.
//
// Workshop projects have no org_id column of their own - workshop_space_members
// carries an optional per-member org_id instead (a project's members can in
// principle span orgs), but in practice every workshop is created with
// space_type='org_internal' and its first 'convener' row's org_id is the real
// owner (see registerCooperativeRoutes' POST /workshops handler). That convener
// lookup is how "owning org" is resolved here - there is no separate shared
// "cooperative pod" for this content; it goes into the creating org's own pod,
// same one org_documents already syncs into.
//
// Scope is deliberately narrow: workshop_documents rows with doc_type IN
// ('systems_map_loop', 'systems_map_cascade') only - plain 'note' documents and
// workshop_proposals (governance/decision content) are out of scope for this pass.

const { podBaseForOrg, slugify } = require('./podClient');
const { getAuthenticatedFetchForOrg } = require('./podCredentialStore');
const { enterOrgContext } = require('./orgContext');

async function resolveWorkshopOwningOrg(pool, workshopProjectId) {
  const r = await pool.query(
    `SELECT m.org_id, o.slug
       FROM workshop_space_members m
       JOIN workshop_workspaces w ON w.id = m.space_id
       JOIN coop_members o ON o.id = m.org_id
      WHERE w.project_id = $1 AND m.role = 'convener' AND m.org_id IS NOT NULL
      ORDER BY m.joined_at ASC
      LIMIT 1`,
    [workshopProjectId]
  );
  return r.rows[0] || null;
}

async function ensureContainer(authFetch, containerUrl) {
  const res = await authFetch(containerUrl, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: '' });
  if (!res.ok && res.status !== 409 && res.status !== 205) {
    const text = await res.text();
    throw new Error(`Failed to create container ${containerUrl}: ${res.status} ${text}`);
  }
}

function interventionToMarkdown(iv) {
  return [
    `# ${iv.title}`,
    '',
    `**Leverage level:** ${iv.leverage_level}`,
    `**Turnarounds:** ${(iv.turnaround_ids || []).join(', ') || '—'}`,
    '',
    iv.description || '',
    '',
    iv.effect_estimate ? `**Estimated effect:** ${iv.effect_estimate}` : '',
  ].join('\n');
}

async function syncWorkshopToPod(pool, workshopProjectId) {
  const owner = await resolveWorkshopOwningOrg(pool, workshopProjectId);
  if (!owner) {
    throw new Error('Could not determine an owning org for this workshop (no convener with an org found).');
  }

  // cooperative.js's routes resolve org via a ?org= query param, not the
  // :slug-based middleware that normally calls this - so the org-scoped pool
  // has no app.current_org_id GUC set yet for this request. Without entering it
  // here, org_settings' FORCE RLS policy would make the very next query return
  // 0 rows regardless of the real pod_provisioned value (same bug class as the
  // org-creation auto-provisioning fix).
  enterOrgContext(owner.org_id);

  const settingsR = await pool.query(`SELECT pod_provisioned FROM org_settings WHERE org_id = $1`, [owner.org_id]);
  if (!settingsR.rows[0]?.pod_provisioned) {
    throw new Error('The owning organization does not have a pod provisioned yet.');
  }

  const projectR = await pool.query(`SELECT slug FROM workshop_projects WHERE id = $1`, [workshopProjectId]);
  if (projectR.rows.length === 0) throw new Error('Workshop project not found.');
  const workshopSlug = projectR.rows[0].slug;

  const interventionsR = await pool.query(
    `SELECT id, title, description, leverage_level, turnaround_ids, effect_estimate
       FROM workshop_interventions WHERE workshop_project_id = $1 ORDER BY id`,
    [workshopProjectId]
  );

  const documentsR = await pool.query(
    `SELECT d.id, d.title, d.content, d.doc_type
       FROM workshop_documents d
       JOIN workshop_workspaces w ON w.id = d.workspace_id
      WHERE w.project_id = $1 AND d.doc_type IN ('systems_map_loop', 'systems_map_cascade')
      ORDER BY d.id`,
    [workshopProjectId]
  );

  const authFetch = await getAuthenticatedFetchForOrg(pool, owner.org_id, owner.slug);
  const podBase = podBaseForOrg(owner.slug);
  const interventionsDir = `${podBase}workshop/${workshopSlug}/interventions/`;
  const systemsMapDir = `${podBase}workshop/${workshopSlug}/systems-map/`;

  const results = [];

  if (interventionsR.rows.length > 0) {
    await ensureContainer(authFetch, interventionsDir);
    for (const iv of interventionsR.rows) {
      const url = `${interventionsDir}${iv.id}-${slugify(iv.title)}.md`;
      const res = await authFetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'text/markdown' },
        body: interventionToMarkdown(iv),
      });
      results.push({ type: 'intervention', id: iv.id, title: iv.title, url, status: res.ok ? 'synced' : 'failed' });
    }
  }

  if (documentsR.rows.length > 0) {
    await ensureContainer(authFetch, systemsMapDir);
    for (const doc of documentsR.rows) {
      const url = `${systemsMapDir}${doc.id}-${slugify(doc.title)}.md`;
      const res = await authFetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'text/markdown' },
        body: doc.content || '',
      });
      results.push({ type: 'systems_map_document', id: doc.id, title: doc.title, url, status: res.ok ? 'synced' : 'failed' });
    }
  }

  return {
    workshopProjectId,
    ownerOrgId: owner.org_id,
    timestamp: new Date().toISOString(),
    total: results.length,
    synced: results.filter((r) => r.status === 'synced').length,
    failed: results.filter((r) => r.status !== 'synced'),
    results,
  };
}

module.exports = { resolveWorkshopOwningOrg, syncWorkshopToPod };
