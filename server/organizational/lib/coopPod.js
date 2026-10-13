'use strict';

const { podBaseForOrg, slugify, registerNewPodAccount } = require('./podClient');
const { storeCoopCredential, resolveCoopCredential, getAuthenticatedFetchForCoop } = require('./podCredentialStore');

const COOP_SLUG = 'coop';

function coopPodBase() {
  return podBaseForOrg(COOP_SLUG);
}

async function provisionCoopPod(pool) {
  const existing = await resolveCoopCredential(pool);
  if (existing) return { ok: true, alreadyProvisioned: true };

  try {
    const { email, password, webId, podUrl } = await registerNewPodAccount(COOP_SLUG, 'pod-coop');
    await storeCoopCredential(pool, { email, password, webId });
    return { ok: true, podUrl };
  } catch (err) {
    console.error('coopPod: provisioning failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function ensureContainer(authFetch, containerUrl) {
  const res = await authFetch(containerUrl, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: '' });
  if (!res.ok && res.status !== 409 && res.status !== 205) {
    const text = await res.text();
    throw new Error(`Failed to create container ${containerUrl}: ${res.status} ${text}`);
  }
}

function libraryItemToMarkdown(item) {
  return [
    `# ${item.title}`,
    '',
    item.description || '',
    '',
    item.body_markdown || '',
  ].join('\n');
}

async function syncCoopLibraryToPod(pool) {
  const { rows } = await pool.query(
    `SELECT id, category, title, description, body_markdown
       FROM cooperative_library_items
      ORDER BY id`
  );

  const results = [];
  if (rows.length > 0) {
    const authFetch = await getAuthenticatedFetchForCoop(pool);
    const podBase = coopPodBase();
    const categoryDirsSeen = new Set();

    for (const item of rows) {
      const categoryDir = `${podBase}library/${item.category}/`;
      if (!categoryDirsSeen.has(categoryDir)) {
        await ensureContainer(authFetch, categoryDir);
        categoryDirsSeen.add(categoryDir);
      }

      const url = `${categoryDir}${item.id}-${slugify(item.title)}.md`;
      const res = await authFetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'text/markdown' },
        body: libraryItemToMarkdown(item),
      });
      results.push({ id: item.id, title: item.title, url, status: res.ok ? 'synced' : 'failed' });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    total: rows.length,
    synced: results.filter((r) => r.status === 'synced').length,
    failed: results.filter((r) => r.status !== 'synced'),
    results,
  };
}

module.exports = { COOP_SLUG, coopPodBase, provisionCoopPod, syncCoopLibraryToPod };
