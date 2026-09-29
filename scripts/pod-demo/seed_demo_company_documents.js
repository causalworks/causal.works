#!/usr/bin/env node
'use strict';

// One-off seed for the ACP scoped-grant demo: writes real files under
// uploads/documents/42/ and inserts matching org_documents rows for org_id=42
// (demo-company). Same categories/style as pod-pilot's seed script, per
// decision to keep this consistent with how demo-company already represents
// itself elsewhere on the platform (seeded, realistic, clearly fictional).
// Not part of the app's regular import/upload flow - run manually, once.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');

const ORG_ID = 42;
const YEAR = 2026;
const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../uploads'));
const DOC_DIR = path.join(UPLOADS_ROOT, 'documents', String(ORG_ID), String(YEAR));

const DOCS = [
  {
    category: 'irs_determination_letter',
    title: 'IRS 501(c)(3) Determination Letter',
    description: 'Original IRS determination letter confirming tax-exempt status.',
    document_date: '2018-06-22',
    retention_class: 'permanent',
    content: `INTERNAL REVENUE SERVICE
Department of the Treasury

Date: June 22, 2018

Demo Company
EIN: 84-5551234

We are pleased to inform you that upon review of your application for
tax exempt status we have determined that you are exempt from Federal
income tax under section 501(c)(3) of the Internal Revenue Code.

(Synthetic demo document - Causal platform demo organization)
`,
  },
  {
    category: 'grant_agreement',
    title: 'Grant Agreement - Meridian Family Foundation FY26',
    description: 'Executed grant agreement for the FY26 general operating grant.',
    document_date: '2026-02-03',
    effective_date: '2026-03-01',
    expiration_date: '2027-02-28',
    retention_class: 'fixed_term',
    retention_years: 7,
    content: `GRANT AGREEMENT

Funder: Meridian Family Foundation
Grantee: Demo Company
Amount: $120,000
Period: 2026-03-01 to 2027-02-28

This agreement sets forth the terms under which the Funder will provide
general operating support to the Grantee.

(Synthetic demo document - Causal platform demo organization)
`,
  },
  {
    category: 'board_resolution',
    title: 'Board Resolution - FY2026 Budget Approval',
    description: 'Resolution approving the FY2026 annual operating budget.',
    document_date: '2025-12-08',
    retention_class: 'permanent',
    content: `RESOLUTION OF THE BOARD OF DIRECTORS
Demo Company

RESOLVED, that the Board of Directors hereby approves the FY2026
annual operating budget as presented at the December 8, 2025 meeting.

(Synthetic demo document - Causal platform demo organization)
`,
  },
  {
    category: 'insurance_certificate',
    title: 'General Liability Insurance Certificate',
    description: 'Certificate of insurance for general liability coverage, policy year 2026.',
    document_date: '2026-01-01',
    effective_date: '2026-01-01',
    expiration_date: '2027-01-01',
    retention_class: 'fixed_term',
    retention_years: 3,
    content: `CERTIFICATE OF LIABILITY INSURANCE

Insured: Demo Company
Policy Period: 2026-01-01 to 2027-01-01
General Aggregate: $2,000,000
Each Occurrence: $1,000,000

(Synthetic demo document - Causal platform demo organization)
`,
  },
];

async function main() {
  fs.mkdirSync(DOC_DIR, { recursive: true });

  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'causal_db',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
  });

  for (const doc of DOCS) {
    const filename = `${randomUUID()}.txt`;
    const filePath = path.join(DOC_DIR, filename);
    const content = Buffer.from(doc.content, 'utf8');
    fs.writeFileSync(filePath, content);

    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const storedPath = path.relative(UPLOADS_ROOT, filePath);
    const originalFilename = `${doc.title.replace(/[\s/]+/g, '_')}.txt`;

    const r = await pool.query(
      `INSERT INTO org_documents
         (org_id, category, title, description, original_filename, stored_path,
          mime_type, byte_size, checksum_sha256, document_date, effective_date,
          expiration_date, retention_class, retention_years, visibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'org_all')
       RETURNING id, title, stored_path`,
      [
        ORG_ID,
        doc.category,
        doc.title,
        doc.description || null,
        originalFilename,
        storedPath,
        'text/plain',
        content.length,
        checksum,
        doc.document_date || null,
        doc.effective_date || null,
        doc.expiration_date || null,
        doc.retention_class,
        doc.retention_years || null,
      ]
    );
    console.log(`Seeded org_documents row ${r.rows[0].id}: ${r.rows[0].title} -> ${r.rows[0].stored_path}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
