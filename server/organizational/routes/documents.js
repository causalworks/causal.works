'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit } = require('../lib/auditLog');
const { resourceUrlFor } = require('../lib/podClient');
const { getAuthenticatedFetchForSyncService } = require('../lib/causalSyncService');

// How long a purged document's pod-fetch is allowed to take before the
// download route gives up and degrades cleanly - "fail fast and clearly,"
// per spec, not an indefinite hang waiting on a possibly-unreachable pod.
const POD_DOWNLOAD_TIMEOUT_MS = 15000;

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));
const DOCUMENTS_ROOT = path.join(UPLOADS_ROOT, 'documents');

const ALLOWED_MIME_EXT = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = req._orgDocDestDir;
      if (!dir) return cb(new Error('Upload destination not resolved'));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = ALLOWED_MIME_EXT[file.mimetype];
      cb(null, `${crypto.randomUUID()}${ext || ''}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_EXT[file.mimetype]) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/** Middleware run before multer to resolve the org and set the disk destination. */
function resolveOrgAndDestination(pool) {
  return async (req, res, next) => {
    try {
      const slug = String(req.params.slug || '').trim();
      const userId = req.user.user_id ?? req.user.id;
      const orgId = req.orgId;
      req._orgId = orgId;
      const year = String(new Date().getUTCFullYear());
      req._orgDocDestDir = path.join(DOCUMENTS_ROOT, String(orgId), year);
      next();
    } catch (e) {
      console.error('resolveOrgAndDestination:', e.message);
      res.status(500).json({ error: 'Could not resolve organization' });
    }
  };
}

async function getRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  return r.rows[0] ? r.rows[0].role : null;
}

function isAdmin(role) {
  return role === 'admin';
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function computeRetentionUntil({ retentionClass, retentionYears, effectiveDate, documentDate }) {
  if (retentionClass !== 'fixed_term' || !retentionYears) return null;
  const base = effectiveDate || documentDate;
  if (!base) return null;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + Number(retentionYears));
  return d.toISOString().slice(0, 10);
}

function retentionState(row) {
  if (row.retention_class === 'permanent') return 'permanent';
  const until = row.expiration_date || row.retention_until;
  if (!until) return 'retain_until';
  const days = Math.floor((new Date(until).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'expired';
  if (days <= 90) return 'expiring_soon';
  return 'retain_until';
}

function fmtDate(v) {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function rowToDocument(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    category: row.category,
    title: row.title,
    description: row.description,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    byte_size: Number(row.byte_size),
    fiscal_year: row.fiscal_year,
    document_date: fmtDate(row.document_date),
    effective_date: fmtDate(row.effective_date),
    expiration_date: fmtDate(row.expiration_date),
    retention_class: row.retention_class,
    retention_years: row.retention_years,
    retention_until: fmtDate(row.retention_until),
    retention_state: retentionState(row),
    version: row.version,
    supersedes_id: row.supersedes_id,
    is_current: row.is_current,
    visibility: row.visibility,
    grant_id: row.grant_id,
    obligation_id: row.obligation_id,
    sponsored_project_id: row.sponsored_project_id,
    source_ref_id: row.source_ref_id,
    source_ref_type: row.source_ref_type,
    uploaded_by_user_id: row.uploaded_by_user_id,
    notes: row.notes,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalDocumentRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const base = '/api/organizational/orgs/:slug/documents';

  // GET / — list, filtered, with viewer-role visibility filtering applied at the query level.
  app.get(base, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);

      const conditions = ['org_id = $1'];
      const params = [orgId];
      if (!isAdmin(role)) {
        conditions.push(`visibility = 'org_all'`);
      }
      if (!('include_archived' in req.query)) {
        conditions.push('archived_at IS NULL');
      }
      if (req.query.category) {
        params.push(String(req.query.category));
        conditions.push(`category = $${params.length}`);
      }
      if (req.query.fiscal_year) {
        params.push(Number(req.query.fiscal_year));
        conditions.push(`fiscal_year = $${params.length}`);
      }
      if (req.query.grant_id) {
        params.push(Number(req.query.grant_id));
        conditions.push(`grant_id = $${params.length}`);
      }
      if (req.query.obligation_id) {
        params.push(Number(req.query.obligation_id));
        conditions.push(`obligation_id = $${params.length}`);
      }
      if (req.query.sponsored_project_id) {
        params.push(Number(req.query.sponsored_project_id));
        conditions.push(`sponsored_project_id = $${params.length}`);
      }
      if (req.query.source_ref_type && req.query.source_ref_id) {
        params.push(String(req.query.source_ref_type));
        conditions.push(`source_ref_type = $${params.length}`);
        params.push(Number(req.query.source_ref_id));
        conditions.push(`source_ref_id = $${params.length}`);
      }

      const r = await pool.query(
        `SELECT * FROM org_documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
        params
      );
      return res.json({ documents: r.rows.map(rowToDocument) });
    } catch (e) {
      console.error('GET /documents:', e.message);
      return res.status(500).json({ error: 'Could not load documents' });
    }
  });

  // GET /retention — expiring-soon / expired / permanent-inventory dashboard.
  app.get(`${base}/retention`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);
      const visClause = isAdmin(role) ? '' : `AND visibility = 'org_all'`;

      const r = await pool.query(
        `SELECT * FROM org_documents WHERE org_id = $1 AND archived_at IS NULL ${visClause} ORDER BY expiration_date NULLS LAST, retention_until NULLS LAST`,
        [orgId]
      );
      const docs = r.rows.map(rowToDocument);
      return res.json({
        expiring_soon: docs.filter((d) => d.retention_state === 'expiring_soon'),
        expired: docs.filter((d) => d.retention_state === 'expired'),
        permanent: docs.filter((d) => d.retention_state === 'permanent'),
      });
    } catch (e) {
      console.error('GET /documents/retention:', e.message);
      return res.status(500).json({ error: 'Could not load retention dashboard' });
    }
  });

  // GET /binder?fiscal_year=YYYY — audit-binder checklist: expected doc types vs. what's uploaded.
  app.get(`${base}/binder`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const fiscalYear = req.query.fiscal_year ? Number(req.query.fiscal_year) : null;
    if (!fiscalYear) return res.status(400).json({ error: 'fiscal_year is required' });
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);
      const visClause = isAdmin(role) ? '' : `AND visibility = 'org_all'`;

      const expectations = await pool.query(
        `SELECT * FROM org_document_expectations WHERE org_id IS NULL OR org_id = $1 ORDER BY display_order`,
        [orgId]
      );

      // Fetch all current docs for the org, filter in JS by fiscal_year for annual items
      // and by presence-of-any for one_time/as_occurs items (see checklist mapping below).
      const allDocsR = await pool.query(
        `SELECT * FROM org_documents WHERE org_id = $1 AND archived_at IS NULL AND is_current = TRUE ${visClause}`,
        [orgId]
      );
      const allDocs = allDocsR.rows.map(rowToDocument);

      const checklist = expectations.rows.map((exp) => {
        const matches = allDocs.filter((d) => d.category === exp.category && (exp.cadence !== 'annual' || d.fiscal_year === fiscalYear));
        let status = 'missing';
        if (matches.length > 0) {
          status = matches.some((d) => d.retention_state === 'expired' || d.retention_state === 'expiring_soon') ? 'expiring' : 'present';
        }
        return {
          category: exp.category,
          label: exp.label,
          cadence: exp.cadence,
          status,
          documents: matches,
        };
      });

      return res.json({ fiscal_year: fiscalYear, checklist });
    } catch (e) {
      console.error('GET /documents/binder:', e.message);
      return res.status(500).json({ error: 'Could not load audit binder' });
    }
  });

  // POST / — upload (staff or admin).
  app.post(
    base,
    ...orgAuth,
    resolveOrgAndDestination(pool),
    (req, res, next) => upload.single('file')(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next())),
    async (req, res) => {
      const userId = req.user.user_id ?? req.user.id;
      const orgId = req._orgId;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required' });

      const cleanup = () => fs.unlink(file.path, () => {});

      try {
        const body = req.body || {};
        const category = String(body.category || '').trim();
        const title = String(body.title || '').trim() || file.originalname;
        if (!category) {
          cleanup();
          return res.status(400).json({ error: 'category is required' });
        }

        const checksum = await sha256File(file.path);
        const retentionClass = body.retention_class || 'fixed_term';
        const retentionYears = body.retention_years ? Number(body.retention_years) : null;
        const documentDate = body.document_date || null;
        const effectiveDate = body.effective_date || null;
        const expirationDate = body.expiration_date || null;
        const retentionUntil = expirationDate || computeRetentionUntil({
          retentionClass,
          retentionYears,
          effectiveDate,
          documentDate,
        });

        const relPath = path.relative(UPLOADS_ROOT, file.path);
        const r = await pool.query(
          `INSERT INTO org_documents
             (org_id, category, title, description, original_filename, stored_path, mime_type, byte_size,
              checksum_sha256, fiscal_year, document_date, effective_date, expiration_date,
              retention_class, retention_years, retention_until, visibility, grant_id, obligation_id,
              sponsored_project_id, source_ref_id, source_ref_type, uploaded_by_user_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           RETURNING *`,
          [
            orgId,
            category,
            title,
            body.description || null,
            file.originalname,
            relPath,
            file.mimetype,
            file.size,
            checksum,
            body.fiscal_year ? Number(body.fiscal_year) : null,
            documentDate,
            effectiveDate,
            expirationDate,
            retentionClass,
            retentionYears,
            retentionUntil,
            body.visibility || 'org_all',
            body.grant_id ? Number(body.grant_id) : null,
            body.obligation_id ? Number(body.obligation_id) : null,
            body.sponsored_project_id ? Number(body.sponsored_project_id) : null,
            body.source_ref_id ? Number(body.source_ref_id) : null,
            body.source_ref_type || null,
            userId,
            body.notes || null,
          ]
        );
        const doc = r.rows[0];
        await logAudit(pool, {
          orgId,
          userId,
          action: 'create',
          tableName: 'org_documents',
          recordId: doc.id,
          metadata: { category: doc.category, title: doc.title },
        });
        // A real receipt showing up later resolves the "outstanding affidavit" state (migration
        // 238) -- best-effort, never blocks the upload response over this.
        if (doc.source_ref_type === 'expense_claim' && doc.source_ref_id) {
          pool.query(
            `UPDATE org_expense_claims SET receipt_resolved_at = NOW() WHERE id = $1 AND org_id = $2 AND receipt_resolved_at IS NULL`,
            [doc.source_ref_id, orgId]
          ).catch((e) => console.error('receipt_resolved_at update failed:', e.message));
        }
        return res.status(201).json({ document: rowToDocument(doc) });
      } catch (e) {
        cleanup();
        if (e.code === '23505') {
          return res.status(409).json({ error: 'An identical file has already been uploaded for this organization' });
        }
        console.error('POST /documents:', e.message);
        return res.status(500).json({ error: 'Could not save document' });
      }
    }
  );

  // GET /:id/download
  app.get(`${base}/:id/download`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);

      const r = await pool.query(`SELECT * FROM org_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
      const doc = r.rows[0];
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (doc.visibility === 'admins_only' && !isAdmin(role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (doc.local_copy_purged_at) {
        return await downloadFromPod(res, pool, orgId, slug, doc);
      }

      const resolved = path.resolve(UPLOADS_ROOT, doc.stored_path);
      if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', doc.mime_type);
      return res.download(resolved, doc.original_filename);
    } catch (e) {
      console.error('GET /documents/:id/download:', e.message);
      return res.status(500).json({ error: 'Could not download document' });
    }
  });

  // Local copy purged (rev 63) - fetch from the pod instead. Buffers the
  // whole response rather than streaming the WHATWG ReadableStream straight
  // into Express's Node response: uploads are capped at 25MB (see the
  // multer config above), so buffering is simple and safe here, not a
  // scaling risk - a real stream-adapter would only earn its complexity if
  // that cap ever grows much further. One attempt, no retry loop, bounded
  // by POD_DOWNLOAD_TIMEOUT_MS - a slow/unreachable pod degrades this one
  // request cleanly instead of hanging it.
  async function downloadFromPod(res, pool, orgId, orgSlug, doc) {
    const resourceUrl = resourceUrlFor(orgSlug, doc);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POD_DOWNLOAD_TIMEOUT_MS);
    try {
      // Fetches as Causal's own service identity, within whatever permission
      // the org has given it on documents/ - never the org's own owned
      // credential (see server/organizational/lib/causalSyncService.js). No
      // fallback: if the service identity isn't provisioned, or this org has
      // never given it access, this throws/403s rather than reaching for a
      // standing credential this model deliberately doesn't use here.
      const authFetch = await getAuthenticatedFetchForSyncService(pool);
      const podRes = await authFetch(resourceUrl, { method: 'GET', signal: controller.signal });
      if (!podRes.ok) {
        console.error(`downloadFromPod: pod returned ${podRes.status} for document ${doc.id} (${resourceUrl})`);
        const permissionIssue = podRes.status === 403;
        return res.status(503).json({
          error: 'Document temporarily unavailable',
          detail: permissionIssue
            ? "This organization has not given Causal's sync service access to its pod, or that access was revoked."
            : 'The stored copy could not be retrieved from the pod right now. Try again shortly.',
          document: { id: doc.id, title: doc.title, category: doc.category },
        });
      }
      const buf = Buffer.from(await podRes.arrayBuffer());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename.replace(/"/g, '')}"`);
      return res.send(buf);
    } catch (err) {
      const timedOut = err.name === 'AbortError';
      console.error(`downloadFromPod: ${timedOut ? 'timed out' : 'failed'} for document ${doc.id} (${resourceUrl}):`, err.message);
      return res.status(503).json({
        error: 'Document temporarily unavailable',
        detail: timedOut
          ? 'The pod did not respond in time. Try again shortly.'
          : 'Could not reach the pod to retrieve this document right now. Try again shortly.',
        document: { id: doc.id, title: doc.title, category: doc.category },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // PATCH /:id — metadata edits only.
  app.patch(`${base}/:id`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);
      if (!isAdmin(role)) return res.status(403).json({ error: 'Insufficient permissions' });

      const existingR = await pool.query(`SELECT * FROM org_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
      const existing = existingR.rows[0];
      if (!existing) return res.status(404).json({ error: 'Document not found' });

      const body = req.body || {};
      const fields = {
        category: body.category !== undefined ? body.category : existing.category,
        title: body.title !== undefined ? body.title : existing.title,
        description: body.description !== undefined ? body.description : existing.description,
        fiscal_year: body.fiscal_year !== undefined ? (body.fiscal_year ? Number(body.fiscal_year) : null) : existing.fiscal_year,
        document_date: body.document_date !== undefined ? body.document_date : existing.document_date,
        effective_date: body.effective_date !== undefined ? body.effective_date : existing.effective_date,
        expiration_date: body.expiration_date !== undefined ? body.expiration_date : existing.expiration_date,
        retention_class: body.retention_class !== undefined ? body.retention_class : existing.retention_class,
        retention_years: body.retention_years !== undefined ? (body.retention_years ? Number(body.retention_years) : null) : existing.retention_years,
        visibility: body.visibility !== undefined ? body.visibility : existing.visibility,
        grant_id: body.grant_id !== undefined ? (body.grant_id ? Number(body.grant_id) : null) : existing.grant_id,
        obligation_id: body.obligation_id !== undefined ? (body.obligation_id ? Number(body.obligation_id) : null) : existing.obligation_id,
        sponsored_project_id: body.sponsored_project_id !== undefined ? (body.sponsored_project_id ? Number(body.sponsored_project_id) : null) : existing.sponsored_project_id,
        source_ref_id: body.source_ref_id !== undefined ? (body.source_ref_id ? Number(body.source_ref_id) : null) : existing.source_ref_id,
        source_ref_type: body.source_ref_type !== undefined ? (body.source_ref_type || null) : existing.source_ref_type,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      };
      fields.retention_until = fields.expiration_date || computeRetentionUntil({
        retentionClass: fields.retention_class,
        retentionYears: fields.retention_years,
        effectiveDate: fields.effective_date,
        documentDate: fields.document_date,
      });

      const r = await pool.query(
        `UPDATE org_documents SET
           category = $1, title = $2, description = $3, fiscal_year = $4, document_date = $5,
           effective_date = $6, expiration_date = $7, retention_class = $8, retention_years = $9,
           retention_until = $10, visibility = $11, grant_id = $12, obligation_id = $13,
           sponsored_project_id = $14, source_ref_id = $15, source_ref_type = $16, notes = $17,
           updated_at = NOW()
         WHERE id = $18 AND org_id = $19
         RETURNING *`,
        [
          fields.category, fields.title, fields.description, fields.fiscal_year, fields.document_date,
          fields.effective_date, fields.expiration_date, fields.retention_class, fields.retention_years,
          fields.retention_until, fields.visibility, fields.grant_id, fields.obligation_id,
          fields.sponsored_project_id, fields.source_ref_id, fields.source_ref_type, fields.notes,
          id, orgId,
        ]
      );
      await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_documents', recordId: id, fields: [] });
      return res.json({ document: rowToDocument(r.rows[0]) });
    } catch (e) {
      console.error('PATCH /documents/:id:', e.message);
      return res.status(500).json({ error: 'Could not update document' });
    }
  });

  // POST /:id/supersede — upload a replacement, link versions, flip old row to not-current.
  app.post(
    `${base}/:id/supersede`,
    ...orgAuth,
    resolveOrgAndDestination(pool),
    (req, res, next) => upload.single('file')(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next())),
    async (req, res) => {
      const userId = req.user.user_id ?? req.user.id;
      const orgId = req._orgId;
      const id = Number(req.params.id);
      const file = req.file;
      const cleanup = () => file && fs.unlink(file.path, () => {});
      if (!file) return res.status(400).json({ error: 'file is required' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const oldR = await client.query(`SELECT * FROM org_documents WHERE id = $1 AND org_id = $2 FOR UPDATE`, [id, orgId]);
        const old = oldR.rows[0];
        if (!old) {
          await client.query('ROLLBACK');
          cleanup();
          return res.status(404).json({ error: 'Document not found' });
        }

        const checksum = await sha256File(file.path);
        const relPath = path.relative(UPLOADS_ROOT, file.path);
        const body = req.body || {};
        const newR = await client.query(
          `INSERT INTO org_documents
             (org_id, category, title, description, original_filename, stored_path, mime_type, byte_size,
              checksum_sha256, fiscal_year, document_date, effective_date, expiration_date,
              retention_class, retention_years, retention_until, version, supersedes_id, visibility,
              grant_id, obligation_id, sponsored_project_id, uploaded_by_user_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           RETURNING *`,
          [
            orgId, old.category, body.title || old.title, body.description !== undefined ? body.description : old.description,
            file.originalname, relPath, file.mimetype, file.size, checksum,
            body.fiscal_year ? Number(body.fiscal_year) : old.fiscal_year,
            body.document_date || old.document_date, body.effective_date || old.effective_date,
            body.expiration_date !== undefined ? body.expiration_date : old.expiration_date,
            old.retention_class, old.retention_years, old.retention_until, old.version + 1, old.id,
            old.visibility, old.grant_id, old.obligation_id, old.sponsored_project_id, userId, body.notes !== undefined ? body.notes : old.notes,
          ]
        );
        await client.query(`UPDATE org_documents SET is_current = FALSE, updated_at = NOW() WHERE id = $1`, [old.id]);
        await client.query('COMMIT');

        await logAudit(pool, {
          orgId,
          userId,
          action: 'update',
          tableName: 'org_documents',
          recordId: old.id,
          metadata: { superseded_by: newR.rows[0].id },
        });
        return res.status(201).json({ document: rowToDocument(newR.rows[0]) });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        cleanup();
        console.error('POST /documents/:id/supersede:', e.message);
        return res.status(500).json({ error: 'Could not supersede document' });
      } finally {
        client.release();
      }
    }
  );

  // DELETE /:id — archive by default; ?hard=true only for admins, and never for permanent/unexpired retention.
  app.delete(`${base}/:id`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    const hard = String(req.query.hard || '') === 'true';
    try {
      const orgId = req.orgId;
      const role = await getRole(pool, orgId, userId);
      if (!isAdmin(role)) return res.status(403).json({ error: 'Insufficient permissions' });

      const r = await pool.query(`SELECT * FROM org_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
      const doc = r.rows[0];
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      if (!hard) {
        await pool.query(`UPDATE org_documents SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
        await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_documents', recordId: id, metadata: { archived: true } });
        return res.json({ ok: true, archived: true });
      }

      if (doc.retention_class === 'permanent') {
        return res.status(409).json({ error: 'Permanent records cannot be hard-deleted' });
      }
      if (doc.retention_until && new Date(doc.retention_until) > new Date()) {
        return res.status(409).json({ error: `Document must be retained until ${fmtDate(doc.retention_until)}` });
      }

      await pool.query(`DELETE FROM org_documents WHERE id = $1`, [id]);
      const resolved = path.resolve(UPLOADS_ROOT, doc.stored_path);
      if (resolved.startsWith(UPLOADS_ROOT + path.sep)) {
        fs.unlink(resolved, () => {});
      }
      await logAudit(pool, { orgId, userId, action: 'delete', tableName: 'org_documents', recordId: id, metadata: { hard: true } });
      return res.json({ ok: true, deleted: true });
    } catch (e) {
      console.error('DELETE /documents/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete document' });
    }
  });
}

module.exports = { registerOrganizationalDocumentRoutes };
