'use strict';

// Access Groups — pod-sharing lists, explicitly separate from Platform
// Users/org_users. A group is a named list of external recipients (WebID or
// email, resolved the same way as ad-hoc permissions via
// podPermissions.resolveRecipient).
// Standing rules (pod_access_group_rules) map either a document CATEGORY or
// one specific DOCUMENT to a group; when a matching document is synced to
// the pod, every current group member gets an indefinite (no-expiry)
// permission, tracked back to the group via pod_access_permissions.group_id
// so membership removal can cascade-revoke exactly the permissions that
// membership produced - never touching permissions that happen to land on
// the same person/resource through an ad-hoc share.
//
// A document-level rule is a category rule with cardinality one, not a
// different mechanism: resolveRuleTargetDocuments() is the one seam that
// resolves either rule shape to "which document(s) does this cover", and
// every other function (permission creation, membership cascade, revocation)
// operates on the result of that, identically regardless of rule type.
//
// DB-is-truth, same as podPermissions.js: a resource's .acr can be (and here,
// routinely is) written before the resource itself has ever synced to the
// pod - CSS is fine PUTting an .acr for a not-yet-existing resource, and it
// takes effect the moment the resource shows up. That lets rule/member
// backfill operate purely against Postgres (org_documents), with no need to
// probe the pod over HTTP to ask "is this one already there".

const { resourceUrlFor } = require('./podClient');
const { resolveRecipient } = require('./podPermissions');
const { withTransaction, enqueueAcrRebuild } = require('./podAcrOutbox');

async function listGroups(pool, orgId) {
  const r = await pool.query(
    `SELECT g.id, g.name, g.created_at,
            COUNT(m.id)::int AS member_count
       FROM pod_access_groups g
       LEFT JOIN pod_access_group_members m ON m.group_id = g.id
      WHERE g.org_id = $1
      GROUP BY g.id
      ORDER BY g.name`,
    [orgId]
  );
  return r.rows;
}

async function createGroup(pool, { orgId, name, userId }) {
  const r = await pool.query(
    `INSERT INTO pod_access_groups (org_id, name, created_by_user_id) VALUES ($1, $2, $3) RETURNING *`,
    [orgId, name, userId]
  );
  return r.rows[0];
}

async function deleteGroup(pool, { orgId, orgSlug, groupId }) {
  // Explicitly revoke every permission this group produced before the group
  // row disappears (group_id ON DELETE SET NULL would otherwise silently
  // strip provenance from live, still-active permissions) - the revoke + one
  // outbox row per affected resource commit together, atomically, in one
  // transaction.
  const { revokedPermissions, outboxIds } = await withTransaction(pool, async (client) => {
    const permissionsR = await client.query(
      `UPDATE pod_access_permissions
          SET revoked_at = now(), revoked_reason = 'group_removed'
        WHERE org_id = $1 AND group_id = $2 AND revoked_at IS NULL
        RETURNING resource_url`,
      [orgId, groupId]
    );
    const resourceUrls = [...new Set(permissionsR.rows.map((r) => r.resource_url))];
    const outboxIds = [];
    for (const resourceUrl of resourceUrls) {
      outboxIds.push(await enqueueAcrRebuild(client, { orgId, resourceUrl, reason: 'revoke' }));
    }
    return { revokedPermissions: permissionsR.rows.length, outboxIds };
  });
  // The group row itself has no direct CSS-facing consequence - the actual
  // effect (revocation) is already durably committed above, so this can be
  // a separate statement.
  await pool.query(`DELETE FROM pod_access_groups WHERE id = $1 AND org_id = $2`, [groupId, orgId]);
  return { revokedPermissions, outboxIds };
}

async function listMembers(pool, orgId, groupId) {
  const r = await pool.query(
    `SELECT id, member_label, member_webid, member_profile_url, created_at
       FROM pod_access_group_members
      WHERE org_id = $1 AND group_id = $2
      ORDER BY member_label`,
    [orgId, groupId]
  );
  return r.rows;
}

// Both rule shapes in one list - document-typed rows carry the document's
// title so the UI can render "Board Resolution - FY2026 (document)" instead
// of a bare id.
async function listRules(pool, orgId) {
  const r = await pool.query(
    `SELECT r.id, r.category, r.org_document_id, r.group_id, g.name AS group_name, r.created_at,
            d.title AS document_title, d.category AS document_category
       FROM pod_access_group_rules r
       JOIN pod_access_groups g ON g.id = r.group_id
       LEFT JOIN org_documents d ON d.id = r.org_document_id
      WHERE r.org_id = $1
      ORDER BY r.category NULLS LAST, d.title NULLS LAST`,
    [orgId]
  );
  return r.rows;
}

// The one seam: resolves either rule shape ({category} or {org_document_id})
// to the concrete list of documents it currently covers. Every permission-
// side consumer (sync-time trigger, rule backfill, member backfill) goes
// through this instead of hand-rolling its own category lookup or document
// lookup.
async function resolveRuleTargetDocuments(pool, { orgId, orgSlug, rule }) {
  if (rule.org_document_id != null) {
    const docR = await pool.query(
      `SELECT id, category, title, original_filename FROM org_documents
        WHERE id = $1 AND org_id = $2 AND archived_at IS NULL`,
      [rule.org_document_id, orgId]
    );
    return docR.rows.map((doc) => ({ id: doc.id, resourceUrl: resourceUrlFor(orgSlug, doc) }));
  }
  const docsR = await pool.query(
    `SELECT id, category, title, original_filename FROM org_documents
      WHERE org_id = $1 AND category = $2 AND archived_at IS NULL`,
    [orgId, rule.category]
  );
  return docsR.rows.map((doc) => ({ id: doc.id, resourceUrl: resourceUrlFor(orgSlug, doc) }));
}

// Backfill: give every current member of a rule's group permission on every
// document that rule currently covers (category -> possibly many; document
// -> exactly one). Used both when a rule is created (new rule, existing
// members) and when a member is added (existing rules, new member).
async function applyRuleToTargetDocuments(pool, { orgId, orgSlug, rule, groupId }) {
  const [docs, membersR] = await Promise.all([
    resolveRuleTargetDocuments(pool, { orgId, orgSlug, rule }),
    pool.query(`SELECT member_webid, member_label FROM pod_access_group_members WHERE org_id = $1 AND group_id = $2`, [orgId, groupId]),
  ]);
  const outboxIds = [];
  for (const doc of docs) {
    for (const member of membersR.rows) {
      const result = await ensureGroupPermission(pool, {
        orgId, orgDocumentId: doc.id, resourceUrl: doc.resourceUrl,
        groupId, memberWebId: member.member_webid, memberLabel: member.member_label,
      });
      if (result.outboxId) outboxIds.push(result.outboxId);
    }
  }
  return outboxIds;
}

// Bulk-sets a group's CATEGORY rule coverage to exactly the given list in
// one call: diffs against current coverage, deletes what's no longer
// checked and adds what's newly checked, all in one transaction, then
// backfills permissions for the newly-added rules. This is what the Standing
// Rules checklist UI calls, whether creating a group's coverage for the
// first time or editing it later - both are just "the new desired list."
// Document-level rules (see createDocumentRule) are a separate, single-rule
// flow (Share-with-Group) and untouched by this function.
async function setGroupCategoryRules(pool, { orgId, orgSlug, groupId, categories, userId }) {
  const desired = new Set(categories);

  const { added, removed } = await withTransaction(pool, async (client) => {
    const currentR = await client.query(
      `SELECT id, category FROM pod_access_group_rules WHERE org_id = $1 AND group_id = $2 AND category IS NOT NULL`,
      [orgId, groupId]
    );
    const current = new Map(currentR.rows.map((r) => [r.category, r.id]));

    const toRemoveIds = [...current.entries()].filter(([cat]) => !desired.has(cat)).map(([, id]) => id);
    if (toRemoveIds.length > 0) {
      await client.query(`DELETE FROM pod_access_group_rules WHERE id = ANY($1::int[])`, [toRemoveIds]);
    }

    const toAdd = [...desired].filter((cat) => !current.has(cat));
    const added = [];
    for (const category of toAdd) {
      const r = await client.query(
        `INSERT INTO pod_access_group_rules (org_id, category, group_id, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, category, group_id) WHERE category IS NOT NULL DO NOTHING
         RETURNING *`,
        [orgId, category, groupId, userId]
      );
      if (r.rows[0]) added.push(r.rows[0]);
    }
    return { added, removed: toRemoveIds.length };
  });

  const outboxIds = [];
  for (const rule of added) {
    outboxIds.push(...(await applyRuleToTargetDocuments(pool, { orgId, orgSlug, rule, groupId })));
  }
  return { added: added.length, removed, outboxIds };
}

// Single document-level rule - used by "Share with Group" (an ongoing,
// cascading rule, not a one-off permission like sharing with an individual).
async function createDocumentRule(pool, { orgId, orgSlug, documentId, groupId, userId }) {
  const r = await pool.query(
    `INSERT INTO pod_access_group_rules (org_id, org_document_id, group_id, created_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, org_document_id, group_id) WHERE org_document_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [orgId, documentId, groupId, userId]
  );
  const rule = r.rows[0];
  if (!rule) return null; // group already has a rule for this exact document
  const outboxIds = await applyRuleToTargetDocuments(pool, { orgId, orgSlug, rule, groupId });
  return { ...rule, outboxIds };
}

// Works for either rule type - a rule is just a row, deletion doesn't branch.
async function deleteRule(pool, { orgId, ruleId }) {
  const r = await pool.query(
    `DELETE FROM pod_access_group_rules WHERE id = $1 AND org_id = $2 RETURNING *`,
    [ruleId, orgId]
  );
  return r.rows[0] || null;
  // Deliberately does not revoke already-issued permissions: removing the
  // standing rule stops it from applying to new/future documents, but access
  // already given on existing documents is unaffected unless a member is
  // removed from the group or the permission is revoked individually.
  // Matches "permissions are tied to membership", not to the rule's
  // continued existence.
}

// Idempotent: only inserts (permission + its outbox row, atomically) if this
// (resource, recipient) pair doesn't already have a live permission. The
// pre-check SELECT runs outside the transaction as a fast-path only - a
// benign, pre-existing TOCTOU tolerance (worst case: two rows for the same
// resource/recipient land in the outbox, both processed, both converge to
// the same correct rebuilt .acr - see the "reason is observability-only"
// note in podAcrOutbox.js).
async function ensureGroupPermission(pool, { orgId, resourceUrl, orgDocumentId, groupId, memberWebId, memberLabel }) {
  const existing = await pool.query(
    `SELECT id FROM pod_access_permissions
      WHERE org_id = $1 AND resource_url = $2 AND recipient_webid = $3 AND revoked_at IS NULL`,
    [orgId, resourceUrl, memberWebId]
  );
  if (existing.rows.length > 0) return { created: false };

  const outboxId = await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO pod_access_permissions
         (org_id, org_document_id, resource_url, recipient_label, recipient_webid, recipient_profile_url, expires_at, group_id, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,NULL)`,
      [orgId, orgDocumentId, resourceUrl, memberLabel, memberWebId, groupId]
    );
    return enqueueAcrRebuild(client, { orgId, resourceUrl, reason: 'permission', recipientWebId: memberWebId });
  });
  return { created: true, outboxId };
}

// Triggered from podSync.js for the one document that was just synced -
// checks both category rules AND any document-specific rule for this exact
// document.
async function applyRulesOnDocumentSynced(pool, { orgId, orgSlug, orgDocumentId, resourceUrl, category }) {
  const rulesR = await pool.query(
    `SELECT group_id FROM pod_access_group_rules WHERE org_id = $1 AND (category = $2 OR org_document_id = $3)`,
    [orgId, category, orgDocumentId]
  );
  if (rulesR.rows.length === 0) return [];

  const outboxIds = [];
  for (const rule of rulesR.rows) {
    const membersR = await pool.query(
      `SELECT member_webid, member_label FROM pod_access_group_members WHERE org_id = $1 AND group_id = $2`,
      [orgId, rule.group_id]
    );
    for (const member of membersR.rows) {
      const result = await ensureGroupPermission(pool, {
        orgId, orgDocumentId, resourceUrl,
        groupId: rule.group_id, memberWebId: member.member_webid, memberLabel: member.member_label,
      });
      if (result.outboxId) outboxIds.push(result.outboxId);
    }
  }
  return outboxIds;
}

async function addMember(pool, { orgId, orgSlug, groupId, recipient, userId }) {
  const { webId, profileUrl } = await resolveRecipient(pool, orgId, orgSlug, recipient);

  const insertR = await pool.query(
    `INSERT INTO pod_access_group_members (org_id, group_id, member_label, member_webid, member_profile_url, added_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (group_id, member_webid) DO NOTHING
     RETURNING *`,
    [orgId, groupId, recipient, webId, profileUrl, userId]
  );
  if (insertR.rows.length === 0) {
    // Already a member - nothing new to give permission to.
    const existing = await pool.query(
      `SELECT * FROM pod_access_group_members WHERE org_id = $1 AND group_id = $2 AND member_webid = $3`,
      [orgId, groupId, webId]
    );
    return existing.rows[0];
  }
  const member = insertR.rows[0];

  // The real cascade test: give this new member access to every document
  // already covered by ANY standing rule for this group - category or
  // document-scoped, same resolution path either way.
  const rulesR = await pool.query(
    `SELECT category, org_document_id FROM pod_access_group_rules WHERE org_id = $1 AND group_id = $2`,
    [orgId, groupId]
  );
  const outboxIds = [];
  for (const rule of rulesR.rows) {
    const docs = await resolveRuleTargetDocuments(pool, { orgId, orgSlug, rule });
    for (const doc of docs) {
      const result = await ensureGroupPermission(pool, {
        orgId, orgDocumentId: doc.id, resourceUrl: doc.resourceUrl,
        groupId, memberWebId: member.member_webid, memberLabel: member.member_label,
      });
      if (result.outboxId) outboxIds.push(result.outboxId);
    }
  }

  return { ...member, outboxIds };
}

// The atomic unit that actually closes the revocation race window: member
// removal, permission revocation, and the outbox row(s) that guarantee CSS
// will be told, all commit together in ONE transaction. If anything after
// this commits fails, Postgres and "what CSS needs to hear" can never
// disagree - there's no window where the DB says removed but nothing
// durably records that CSS still needs telling. Doesn't touch the rules
// table at all - revocation cascades purely off
// pod_access_permissions.group_id, identically regardless of what rule type
// originally produced the permission.
async function removeMember(pool, { orgId, orgSlug, groupId, memberId }) {
  const result = await withTransaction(pool, async (client) => {
    const memberR = await client.query(
      `DELETE FROM pod_access_group_members WHERE id = $1 AND org_id = $2 AND group_id = $3 RETURNING *`,
      [memberId, orgId, groupId]
    );
    const member = memberR.rows[0];
    if (!member) return null;

    const permissionsR = await client.query(
      `UPDATE pod_access_permissions
          SET revoked_at = now(), revoked_reason = 'group_removed'
        WHERE org_id = $1 AND group_id = $2 AND recipient_webid = $3 AND revoked_at IS NULL
        RETURNING resource_url`,
      [orgId, groupId, member.member_webid]
    );
    const resourceUrls = [...new Set(permissionsR.rows.map((r) => r.resource_url))];
    const outboxIds = [];
    for (const resourceUrl of resourceUrls) {
      outboxIds.push(await enqueueAcrRebuild(client, { orgId, resourceUrl, reason: 'revoke', recipientWebId: member.member_webid }));
    }
    return { member, revokedPermissions: permissionsR.rows.length, outboxIds };
  });
  return result;
}

module.exports = {
  listGroups,
  createGroup,
  deleteGroup,
  listMembers,
  addMember,
  removeMember,
  listRules,
  setGroupCategoryRules,
  createDocumentRule,
  deleteRule,
  applyRulesOnDocumentSynced,
};
