'use strict';

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
