'use strict';

// Seeds a newly created org with representative sample content, so an invited person
// (ODI reviewer or otherwise) gets a real, demonstrable workspace instead of an empty
// one. General capability, not ODI-specific -- see
// .claude/plans/2026-09-28-seeded-sample-org-creation.md for the scope decision
// ("something in between" full Demo Company replica and Solid-only).
//
// Deliberately reuses the real library functions everywhere one exists (createGroup/
// addMember/createDocumentRule -- the same code the Data Pod UI calls, including the
// real WebID-minting and pod ACR writes) rather than inserting rows that only look
// right. Documents are the one place with no existing non-HTTP helper to reuse, so
// this writes real files to disk the same way the upload route does (see
// server/organizational/routes/documents.js) and inserts matching org_documents rows
// directly.
//
// Called once, right after provisionPodForOrg() succeeds, from the org-creation route.
// Never called for /demo or /demo-coop -- those keep using the shared Demo Company
// sandbox as-is.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createGroup, addMember, createDocumentRule } = require('./podAccessGroups');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));
const DOCUMENTS_ROOT = path.join(UPLOADS_ROOT, 'documents');

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const SAMPLE_DOCUMENTS = [
  {
    category: 'irs_determination_letter',
    title: 'IRS 501(c)(3) Determination Letter',
    filename: 'irs-determination-letter.txt',
    content:
      'Internal Revenue Service\nDetermination Letter (sample)\n\n' +
      'This letter confirms tax-exempt status under Section 501(c)(3) of the ' +
      'Internal Revenue Code. Sample content seeded for demonstration purposes.\n',
  },
  {
    category: 'board_resolution',
    title: 'Board Resolution - Annual Budget Approval',
    filename: 'board-resolution.txt',
    content:
      'Board Resolution (sample)\n\n' +
      'RESOLVED, that the Board of Directors approves the annual operating budget ' +
      'as presented. Sample content seeded for demonstration purposes.\n',
  },
  {
    category: 'grant_agreement',
    title: 'Grant Agreement - Sample Foundation',
    filename: 'grant-agreement.txt',
    content:
      'Grant Agreement (sample)\n\n' +
      'This agreement sets out the terms of a grant award between Sample Foundation ' +
      'and the recipient organization. Sample content seeded for demonstration purposes.\n',
  },
];

async function seedDocuments(pool, orgId, userId) {
  const year = String(new Date().getUTCFullYear());
  const destDir = path.join(DOCUMENTS_ROOT, String(orgId), year);
  fs.mkdirSync(destDir, { recursive: true });

  const docs = [];
  for (const sample of SAMPLE_DOCUMENTS) {
    const buf = Buffer.from(sample.content, 'utf8');
    const checksum = sha256Buffer(buf);
    const storedFilename = `${crypto.randomUUID()}.txt`;
    const filePath = path.join(destDir, storedFilename);
    fs.writeFileSync(filePath, buf);
    const relPath = path.relative(UPLOADS_ROOT, filePath);

    const r = await pool.query(
      `INSERT INTO org_documents
         (org_id, category, title, original_filename, stored_path, mime_type, byte_size,
          checksum_sha256, visibility, uploaded_by_user_id, notes)
       VALUES ($1,$2,$3,$4,$5,'text/plain',$6,$7,'org_all',$8,$9)
       ON CONFLICT (org_id, checksum_sha256) WHERE archived_at IS NULL DO NOTHING
       RETURNING *`,
      [orgId, sample.category, sample.title, sample.filename, relPath, buf.length, checksum, userId,
       'Sample document seeded for demonstration.']
    );
    if (r.rows[0]) docs.push(r.rows[0]);
  }
  return docs;
}

async function seedAccessGroupsAndPermissions(pool, orgId, orgSlug, userId, docs) {
  const docByCategory = Object.fromEntries(docs.map((d) => [d.category, d]));

  const board = await createGroup(pool, { orgId, name: 'Board of Directors', userId });
  const finance = await createGroup(pool, { orgId, name: 'Finance', userId });

  // Rule before member, same order the real UI follows -- addMember()'s own cascade
  // then grants the new member permission on every document the rule already covers.
  if (docByCategory.board_resolution) {
    await createDocumentRule(pool, {
      orgId, orgSlug, documentId: docByCategory.board_resolution.id, groupId: board.id, userId,
    });
  }
  if (docByCategory.grant_agreement) {
    await createDocumentRule(pool, {
      orgId, orgSlug, documentId: docByCategory.grant_agreement.id, groupId: finance.id, userId,
    });
  }

  await addMember(pool, { orgId, orgSlug, groupId: board.id, recipient: 'board-chair@example.org', userId });
  await addMember(pool, { orgId, orgSlug, groupId: finance.id, recipient: 'finance-lead@example.org', userId });
}

async function seedProgramsGrantsPersonnel(pool, orgId) {
  const fiscalYear = new Date().getUTCFullYear();

  // Org creation (orgs.js) already inserts a default 'General' program for every new
  // org -- reuse it instead of adding a redundant second one.
  const programR = await pool.query(
    `SELECT id FROM org_programs WHERE org_id = $1 AND is_default = true ORDER BY id LIMIT 1`,
    [orgId]
  );
  const programId = programR.rows[0] ? programR.rows[0].id : null;

  await pool.query(
    `INSERT INTO org_grants (org_id, funder, name, amount_cents, status, primary_program_id)
     VALUES ($1, 'Sample Foundation', 'General Operating Support', 5000000, 'awarded', $2)`,
    [orgId, programId]
  );

  await pool.query(
    `INSERT INTO org_personnel (org_id, fiscal_year, worker_type, full_name)
     VALUES ($1, $2, 'employee', 'Sample Executive Director'),
            ($1, $2, 'employee', 'Sample Program Manager')`,
    [orgId, fiscalYear]
  );
}

/**
 * Seeds representative sample content into a freshly created org. Best-effort per
 * section -- a failure partway through (e.g. pod not reachable) is logged and
 * returned, never thrown, so it can't take down org creation itself (same contract
 * as provisionPodForOrg).
 */
async function seedSampleOrgContent(pool, orgId, orgSlug, { userId }) {
  const result = { ok: true, errors: [] };
  let docs = [];
  try {
    docs = await seedDocuments(pool, orgId, userId);
  } catch (err) {
    console.error(`seedSampleOrgContent: documents failed for org ${orgId}:`, err.message);
    result.errors.push(`documents: ${err.message}`);
  }

  try {
    await seedAccessGroupsAndPermissions(pool, orgId, orgSlug, userId, docs);
  } catch (err) {
    console.error(`seedSampleOrgContent: access groups failed for org ${orgId}:`, err.message);
    result.errors.push(`access groups: ${err.message}`);
  }

  try {
    await seedProgramsGrantsPersonnel(pool, orgId);
  } catch (err) {
    console.error(`seedSampleOrgContent: programs/grants/personnel failed for org ${orgId}:`, err.message);
    result.errors.push(`programs/grants/personnel: ${err.message}`);
  }

  result.ok = result.errors.length === 0;
  return result;
}

module.exports = { seedSampleOrgContent };
