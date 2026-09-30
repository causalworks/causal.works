'use strict';

// Per-org Solid pod status check + one-way sync (Postgres org_documents -> pod).
// Used by both the per-org Data Pod panel and the coop-wide Pod Management
// "sync all" action. Originally wrapped standalone scripts/pod-demo/*.js CLI
// scripts scoped to the pod-pilot pilot org (org 57); those scripts and that
// org were both decommissioned once this generalized in-process version shipped
// and superseded them (org 57 was scratch/disposable by design from the start).

const fs = require('fs');
const path = require('path');
const { podBaseForOrg, resourceUrlFor } = require('./podClient');
const { applyRulesOnDocumentSynced } = require('./podAccessGroups');
const { getAuthenticatedFetchForSyncService } = require('./causalSyncService');

// Sync and fetch-on-download authenticate as Causal's own stable service
// identity, acting within whatever the org has explicitly given it on
// documents/ (a container-scoped ACP permission, migration 187) - never the
// org's own owned credential. No fallback: if the service identity has no
// credential yet, or this org has never given (or has revoked) its
// access, this throws/fails rather than silently reaching for a standing
// credential that, under this model, deliberately does not get used here.
async function authFetchForSync(pool) {
  return getAuthenticatedFetchForSyncService(pool);
}

// A 403 here means "the permission is missing or was revoked," a
// structurally different condition from a network blip or CSS being down -
// worth surfacing distinctly rather than lumping it in with ordinary
// failures (this was the real gap flagged when Part 2 was scoped: a wall of
// generic failures with no actionable explanation for why sync stopped
// working).
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
      // Service identity not provisioned at all - every document fails the
      // same clear way, no per-document loop needed.
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
        // A missing local file is only a real problem if this document was never
        // confirmed synced (or a since-purged copy is expected to be gone -
        // documentPurge.js/purge-synced-documents.js deliberately delete the local
        // file once pod_synced_at is set, on the hourly sweep). Re-clicking "Sync
        // now" after that legitimate purge must not report a false failure for
        // every document that already reached the pod - it has nothing left to do
        // for this row, which is success, not "skipped".
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

      // Per-document confirmation, set immediately - the only reliable
      // "did THIS document reach the pod" fact (org_settings.pod_last_synced_at
      // is org-wide and fires below regardless of per-document outcome).
      // Deliberately its own statement, not folded into the cascade call
      // below: a cascade failure must never retroactively make this sync
      // look unconfirmed, and a confirmation failure here shouldn't be
      // conflated with a cascade failure either - two different facts.
      await pool.query(`UPDATE org_documents SET pod_synced_at = now() WHERE id = $1`, [row.id]);

      try {
        await applyRulesOnDocumentSynced(pool, {
          orgId, orgSlug, orgDocumentId: row.id, resourceUrl, category: row.category,
        });
      } catch (err) {
        // A permission-cascade failure shouldn't undo or hide the successful file sync -
        // the document is now on the pod either way; log and keep going.
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
