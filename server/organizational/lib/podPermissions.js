'use strict';

const crypto = require('crypto');
const path = require('path');
const { podBaseForOrg, resourceUrlFor } = require('./podClient');
const { getAuthenticatedFetchForOrg } = require('./podCredentialStore');
const { withTransaction, enqueueAcrRebuild } = require('./podAcrOutbox');

const OWNER_WEBID = (orgSlug) => `${podBaseForOrg(orgSlug)}profile/card#me`;

function isLikelyEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function acrUrlFor(resourceUrl) {
  return `${resourceUrl}.acr`;
}

function buildAcrTurtle(resourceUrl, ownerWebId, permissions) {
  const documentPermissions = permissions.filter((p) => !p.is_container);
  const containerPermissions = permissions.filter((p) => p.is_container);

  const accessControls = ['<#ownerAccess>', ...permissions.map((p) => `<#permission-${p.id}>`)];
  const rootLines = [
    '<#root>',
    '    a acp:AccessControlResource;',
    `    acp:resource <${resourceUrl}>;`,
    `    acp:accessControl ${accessControls.join(', ')}${containerPermissions.length === 0 ? '.' : ';'}`,
  ];
  if (containerPermissions.length > 0) {
    rootLines.push(`    acp:memberAccessControl ${containerPermissions.map((p) => `<#permission-${p.id}>`).join(', ')}.`);
  }

  const lines = [
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '',
    ...rootLines,
    '',
    '<#ownerAccess>',
    '    a acp:AccessControl;',
    '    acp:apply [',
    '        a acp:Policy;',
    '        acp:allow acl:Read, acl:Write, acl:Control;',
    '        acp:anyOf [ a acp:Matcher; acp:agent <' + ownerWebId + '> ]',
    '    ].',
  ];
  for (const p of [...documentPermissions, ...containerPermissions]) {
    const modes = p.can_write ? 'acl:Read, acl:Write' : 'acl:Read';
    lines.push(
      '',
      `<#permission-${p.id}>`,
      '    a acp:AccessControl;',
      `    # Permission ${p.id}: ${p.recipient_label}, ${p.expires_at ? `expires ${p.expires_at}` : 'indefinite'}${p.is_container ? ' (container permission)' : ''}`,
      '    acp:apply [',
      '        a acp:Policy;',
      `        acp:allow ${modes};`,
      `        acp:anyOf [ a acp:Matcher; acp:agent <${p.recipient_webid}> ]`,
      '    ].'
    );
  }
  return lines.join('\n') + '\n';
}

async function rebuildResourceAcr(pool, orgId, orgSlug, resourceUrl) {
  const { rows } = await pool.query(
    `SELECT id, recipient_label, recipient_webid, expires_at, is_container, can_write
       FROM pod_access_permissions
      WHERE org_id = $1 AND resource_url = $2 AND revoked_at IS NULL AND share_resource_url IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY id`,
    [orgId, resourceUrl]
  );

  const turtle = buildAcrTurtle(resourceUrl, OWNER_WEBID(orgSlug), rows);
  const authFetch = await getAuthenticatedFetchForOrg(pool, orgId, orgSlug);
  const res = await authFetch(acrUrlFor(resourceUrl), {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: turtle,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to write ACR for ${resourceUrl}: ${res.status} ${text}`);
  }
}

async function mintThrowawayWebId(pool, orgId, orgSlug, email) {
  const authFetch = await getAuthenticatedFetchForOrg(pool, orgId, orgSlug);
  const podBase = podBaseForOrg(orgSlug);
  const permissionId = crypto.randomUUID();
  const profileUrl = `${podBase}permissions/${permissionId}/profile.ttl`;
  const webId = `${profileUrl}#me`;

  const profileTurtle = [
    '@prefix foaf: <http://xmlns.com/foaf/0.1/>.',
    '',
    `<#me> a foaf:Person;`,
    `    foaf:mbox <mailto:${email}>;`,
    `    foaf:name "${email}" .`,
  ].join('\n') + '\n';

  const putRes = await authFetch(profileUrl, {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: profileTurtle,
  });
  if (!putRes.ok) throw new Error(`Failed to create throwaway WebID profile: ${putRes.status}`);

  const acrTurtle = [
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '',
    '<#root>',
    '    a acp:AccessControlResource;',
    `    acp:resource <${profileUrl}>;`,
    '    acp:accessControl <#publicRead>.',
    '',
    '<#publicRead>',
    '    a acp:AccessControl;',
    '    acp:apply [',
    '        a acp:Policy;',
    '        acp:allow acl:Read;',
    '        acp:anyOf [ a acp:Matcher; acp:agent acp:PublicAgent ]',
    '    ].',
  ].join('\n') + '\n';

  const acrRes = await authFetch(acrUrlFor(profileUrl), {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: acrTurtle,
  });
  if (!acrRes.ok) throw new Error(`Failed to set throwaway WebID profile ACR: ${acrRes.status}`);

  return { webId, profileUrl };
}

async function createLinkShareCopy(pool, orgId, orgSlug, doc, resourceUrl) {
  const authFetch = await getAuthenticatedFetchForOrg(pool, orgId, orgSlug);

  const getRes = await authFetch(resourceUrl, { method: 'GET' });
  if (getRes.status === 404) {
    throw new Error('This document has not synced to the pod yet - sync it before sharing a link.');
  }
  if (!getRes.ok) throw new Error(`Failed to read document from pod for sharing: ${getRes.status}`);
  const contentType = getRes.headers.get('content-type') || 'application/octet-stream';
  const bytes = Buffer.from(await getRes.arrayBuffer());

  const ext = path.extname(doc.original_filename || '') || '';
  const shareResourceUrl = `${podBaseForOrg(orgSlug)}shares/${crypto.randomBytes(24).toString('base64url')}${ext}`;

  const putRes = await authFetch(shareResourceUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
  if (!putRes.ok) throw new Error(`Failed to create share copy: ${putRes.status}`);

  const acrTurtle = buildAcrTurtle(shareResourceUrl, OWNER_WEBID(orgSlug), []);
  const acrRes = await authFetch(acrUrlFor(shareResourceUrl), {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: acrTurtle,
  });
  if (!acrRes.ok) throw new Error(`Failed to set share copy ACR: ${acrRes.status}`);

  return shareResourceUrl;
}

async function deleteShareResource(pool, orgId, orgSlug, shareResourceUrl) {
  const authFetch = await getAuthenticatedFetchForOrg(pool, orgId, orgSlug);

  const delRes = await authFetch(shareResourceUrl, { method: 'DELETE' });
  if (!delRes.ok && delRes.status !== 404 && delRes.status !== 409) {
    throw new Error(`Failed to delete share resource: ${delRes.status}`);
  }
  const acrRes = await authFetch(acrUrlFor(shareResourceUrl), { method: 'DELETE' });
  if (!acrRes.ok && acrRes.status !== 404 && acrRes.status !== 409) {
    throw new Error(`Failed to delete share resource ACR: ${acrRes.status}`);
  }
}

async function resolveRecipient(pool, orgId, orgSlug, recipient) {
  if (isLikelyEmail(recipient)) {
    const minted = await mintThrowawayWebId(pool, orgId, orgSlug, recipient);
    return { webId: minted.webId, profileUrl: minted.profileUrl };
  }
  if (/^https?:\/\//i.test(recipient)) {
    return { webId: recipient, profileUrl: null };
  }
  throw new Error('Must be a WebID (https://...) or an email address.');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendShareLinkEmail(to, token, orgName, docTitle, expiresAt) {
  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  const link = `${baseUrl}/share/${token}`;
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: `"${String(orgName).replace(/["\r\n]/g, '')}" <noreply@causal.works>`,
      To: to,
      Subject: `${orgName} shared a document with you`,
      HtmlBody: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <p>${escapeHtml(orgName)} shared "${escapeHtml(docTitle)}" with you.</p>
          <p>To open it, you will be asked to confirm this email address with a short code. Access ends ${escapeHtml(new Date(expiresAt).toUTCString())}.</p>
          <a href="${link}" style="display:inline-block; margin: 24px 0; background:#800020; color:white; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:700;">
            Open the document
          </a>
        </div>
      `,
      MessageStream: 'outbound',
    }),
  });
  if (!response.ok) throw new Error(`Postmark responded ${response.status}`);
}

async function createPermission(pool, { orgId, orgSlug, orgDocumentId, recipient, expiresAt, userId }) {
  const docR = await pool.query(
    `SELECT id, category, title, original_filename FROM org_documents WHERE id = $1 AND org_id = $2`,
    [orgDocumentId, orgId]
  );
  if (docR.rows.length === 0) throw new Error('Document not found for this organization.');
  const doc = docR.rows[0];
  const resourceUrl = resourceUrlFor(orgSlug, doc);

  if (isLikelyEmail(recipient)) {
    const shareResourceUrl = await createLinkShareCopy(pool, orgId, orgSlug, doc, resourceUrl);
    const shareToken = crypto.randomBytes(24).toString('base64url');

    const { permission } = await withTransaction(pool, async (client) => {
      const insertR = await client.query(
        `INSERT INTO pod_access_permissions
           (org_id, org_document_id, resource_url, recipient_label, recipient_webid, share_resource_url, share_token, expires_at, created_by_user_id)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
         RETURNING *`,
        [orgId, orgDocumentId, resourceUrl, recipient, shareResourceUrl, shareToken, expiresAt, userId]
      );
      return { permission: insertR.rows[0] };
    });

    let linkEmailed = false;
    try {
      const orgR = await pool.query('SELECT display_name FROM coop_members WHERE id = $1', [orgId]);
      await sendShareLinkEmail(recipient, shareToken, orgR.rows[0]?.display_name || 'An organization', doc.title, expiresAt);
      linkEmailed = true;
    } catch (e) {
      console.error('share link email failed:', e.message);
    }
    return { ...permission, outboxId: null, link_emailed: linkEmailed };
  }

  const { webId: recipientWebId, profileUrl: recipientProfileUrl } = await resolveRecipient(pool, orgId, orgSlug, recipient);

  const { permission, outboxId } = await withTransaction(pool, async (client) => {
    const insertR = await client.query(
      `INSERT INTO pod_access_permissions
         (org_id, org_document_id, resource_url, recipient_label, recipient_webid, recipient_profile_url, expires_at, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [orgId, orgDocumentId, resourceUrl, recipient, recipientWebId, recipientProfileUrl, expiresAt, userId]
    );
    const outboxId = await enqueueAcrRebuild(client, { orgId, resourceUrl, reason: 'permission', recipientWebId });
    return { permission: insertR.rows[0], outboxId };
  });

  return { ...permission, outboxId };
}

async function revokePermission(pool, { orgId, orgSlug, permissionId, reason }) {
  return withTransaction(pool, async (client) => {
    const r = await client.query(
      `UPDATE pod_access_permissions
          SET revoked_at = now(), revoked_reason = $3
        WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL
        RETURNING *`,
      [permissionId, orgId, reason]
    );
    if (r.rows.length === 0) return null;
    const permission = r.rows[0];
    const outboxId = permission.share_resource_url
      ? await enqueueAcrRebuild(client, { orgId, resourceUrl: permission.share_resource_url, reason: 'delete_share' })
      : await enqueueAcrRebuild(client, { orgId, resourceUrl: permission.resource_url, reason: 'revoke', recipientWebId: permission.recipient_webid });
    return { ...permission, outboxId };
  });
}

module.exports = { createPermission, revokePermission, rebuildResourceAcr, deleteShareResource, acrUrlFor, resolveRecipient };
