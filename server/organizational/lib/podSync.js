'use strict';

const fs = require('fs');
const path = require('path');
const { podBaseForOrg, resourceUrlFor } = require('./podClient');
const { applyRulesOnDocumentSynced } = require('./podAccessGroups');
const { getAuthenticatedFetchForSyncService } = require('./causalSyncService');

async function authFetchForSync(pool) {
  return getAuthenticatedFetchForSyncService(pool);
}

function classifyFetchFailure(status, text) {
  if (status === 403) {
    return "This organization has not given the platform's sync service access to its pod, or that access was revoked.";
  }
  return `${status} ${text}`;
}

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));

async function checkOrgPodStatus(pool, orgId, orgSlug) {
  const { rows } = await pool.query(
    `SELECT id, category, title, document_date, original_filename, stored_path, mime_type
       FROM org_documents
      WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY id`,
    [orgId]
  );

  let connected = false;
  let authFetch = null;
  try {
    authFetch = await authFetchForSync(pool);
    const rootRes = await authFetch(podBaseForOrg(orgSlug), { method: 'HEAD' });
    connected = rootRes.status < 500;
  } catch (err) {
    console.error(`podSync: connectivity check failed for org ${orgId}:`, err.message);
    connected = false;
  }

  const documents = [];
  for (const row of rows) {
    const podUrl = resourceUrlFor(orgSlug, row);
    let podStatus = 'error';
    if (authFetch) {
      try {
        const res = await authFetch(podUrl, { method: 'HEAD' });
        podStatus = res.ok ? 'present' : res.status === 404 ? 'missing' : 'error';
      } catch (err) {
        console.error(`podSync: presence check failed for doc ${row.id}:`, err.message);
        podStatus = 'error';
      }
    } else {
      podStatus = 'unknown';
    }
    documents.push({
      id: row.id,
      category: row.category,
      title: row.title,
      document_date: row.document_date,
      podUrl,
      podStatus,
    });
  }

  return { connected, documents };
}

async function syncOrgToPod(pool, orgId, orgSlug) {
  const { rows } = await pool.query(
    `SELECT id, category, title, original_filename, stored_path, mime_type, pod_synced_at, local_copy_purged_at
       FROM org_documents
      WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY id`,
    [orgId]
  );

  const results = [];

  if (rows.length > 0) {
    let authFetch;
    try {
      authFetch = await authFetchForSync(pool);
    } catch (err) {
      return {
        orgId,
        timestamp: new Date().toISOString(),
        total: rows.length,
        synced: 0,
        failed: rows.map((row) => ({ id: row.id, title: row.title, status: 'failed', error: err.message })),
        results: rows.map((row) => ({ id: row.id, title: row.title, status: 'failed', error: err.message })),
      };
    }
    const categoryDirsSeen = new Set();

    for (const row of rows) {
      const filePath = path.resolve(UPLOADS_ROOT, row.stored_path);
      if (!fs.existsSync(filePath)) {
        if (row.pod_synced_at && row.local_copy_purged_at) {
          results.push({ id: row.id, title: row.title, url: resourceUrlFor(orgSlug, row), status: 'synced' });
        } else {
          results.push({ id: row.id, title: row.title, status: 'skipped', error: 'file missing on disk' });
        }
        continue;
      }

      const categoryDir = `${podBaseForOrg(orgSlug)}documents/${row.category}/`;
      if (!categoryDirsSeen.has(categoryDir)) {
        const containerRes = await authFetch(categoryDir, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: '' });
        if (!containerRes.ok && containerRes.status !== 409 && containerRes.status !== 205) {
          const text = await containerRes.text();
          results.push({ id: row.id, title: row.title, status: 'failed', error: classifyFetchFailure(containerRes.status, text) });
          continue;
        }
        categoryDirsSeen.add(categoryDir);
      }

      const resourceUrl = resourceUrlFor(orgSlug, row);
      const content = fs.readFileSync(filePath);
      const res = await authFetch(resourceUrl, {
        method: 'PUT',
        headers: { 'content-type': row.mime_type || 'application/octet-stream' },
        body: content,
      });

      if (!res.ok) {
        const text = await res.text();
        results.push({ id: row.id, title: row.title, url: resourceUrl, status: 'failed', error: classifyFetchFailure(res.status, text) });
        continue;
      }

      await pool.query(`UPDATE org_documents SET pod_synced_at = now() WHERE id = $1`, [row.id]);

      try {
        await applyRulesOnDocumentSynced(pool, {
          orgId, orgSlug, orgDocumentId: row.id, resourceUrl, category: row.category,
        });
      } catch (err) {
        console.error(`podSync: access-group cascade failed for doc ${row.id}:`, err.message);
      }

      results.push({ id: row.id, title: row.title, url: resourceUrl, status: 'synced' });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  await pool.query(`UPDATE org_settings SET pod_last_synced_at = now() WHERE org_id = $1`, [orgId]);

  return {
    orgId,
    timestamp: new Date().toISOString(),
    total: rows.length,
    synced,
    failed: results.filter((r) => r.status !== 'synced'),
    results,
  };
}

module.exports = { checkOrgPodStatus, syncOrgToPod };
