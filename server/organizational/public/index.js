'use strict';

// Public routes (no sign-in). Each resolves the workspace from the slug, enters its context, does one job, returns only what
// its page needs and never lists records. Guards: rate limit by IP and workspace, a scoped link token for lead pages, and the
// honeypot and timing checks on every form. Every route here is listed in route-access-allowlist.json.

const path = require('path');
const multer = require('multer');
const { publicRateLimit } = require('../lib/rateLimit');
const { enterWorkspace, checkLink, recordUse, presentedToken, issueFormToken, guardForm } = require('../lib/publicLinks');
const { loadProjectBalance } = require('../lib/sponsorBalance');
const { createRequest, REQUEST_METHODS } = require('../lib/sponsorMoneyOut');
const { markReceived } = require('../lib/sponsorReports');
const { storeUploadedFile, DOC_TYPES, UPLOAD_TYPES } = require('../lib/sponsorDocuments');
const { isoDate } = require('../lib/sponsorFees');
const { logAudit } = require('../lib/auditLog');
const { keepContext } = require('../lib/orgContext');

const PAGES = path.join(__dirname, '..', '..', '..', 'public', 'p');
const LEAD = 'project_lead';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const LEAD_DOC_TYPES = ['insurance', 'report', 'correspondence', 'tax_form', 'donor_letter'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 30 },
  fileFilter: (req, file, cb) => cb(null, !!UPLOAD_TYPES[file.mimetype]),
});

const keptUpload = keepContext(upload.single('file'));

function singleFile(req, res, next) {
  keptUpload(req, res, (err) => {
    if (err) return res.status(400).json({ code: 'bad_file', error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB. Send a smaller file.' : 'The file could not be read. Try again.' });
    return next();
  });
}

function registerPublicRoutes(app, pool, opts) {
  const o = opts || {};
  const readLimit = publicRateLimit({ ipCapacity: 60, ipPerMinute: 30, now: o.now });
  const writeLimit = publicRateLimit({ ipCapacity: 10, ipPerMinute: 4, workspaceCapacity: 100, workspacePerMinute: 30, now: o.now });

  // Workspace from the slug, then the lead link for that workspace. Sets req.workspace and req.leadLink.
  async function leadContext(req, res, next) {
    try {
      const ws = await enterWorkspace(pool, req.params.slug);
      if (!ws) return res.status(404).json({ error: 'This page is not available.' });
      const checked = await checkLink(pool, { orgId: ws.id, token: presentedToken(req), purpose: LEAD });
      if (checked.refusal) return res.status(checked.refusal.httpStatus).json(checked.refusal.body);
      const p = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [checked.link.sponsored_project_id, ws.id]);
      if (!p.rows.length) return res.status(404).json({ error: 'This page is not available.' });
      req.workspace = ws;
      req.leadLink = checked.link;
      req.project = p.rows[0];
      return next();
    } catch (e) {
      console.error('public lead context:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  }

  async function formGuard(req, res, next) {
    try {
      const refusal = await guardForm(pool, req, req.workspace.id, { now: o.now && o.now(), fetch: o.fetch });
      if (refusal) return res.status(refusal.httpStatus).json(refusal.body);
      return next();
    } catch (e) {
      console.error('public form guard:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  }

  // Pages (the link token stays in the URL fragment, which the browser never sends here)
  app.get('/p/:slug/lead', readLimit, (req, res) => res.sendFile(path.join(PAGES, 'lead.html')));
  app.get('/p/:slug/projects/:projectId', readLimit, (req, res) => res.sendFile(path.join(PAGES, 'project.html')));

  // Lead view: one project's balance, activity, requests, reports due
  app.get('/api/public/:slug/lead/project', readLimit, leadContext, async (req, res) => {
    try {
      const { workspace: ws, project } = req;
      await recordUse(pool, req, req.leadLink, 'view');
      const b = (await loadProjectBalance(pool, ws.id, project.id)).balance;
      const [act, reqs, reps] = await Promise.all([
        pool.query(
          `SELECT * FROM (
             SELECT received_at::date AS date, 'Money received' AS label, amount_cents AS cents FROM org_gifts
              WHERE org_id = $1 AND sponsored_project_id = $2 AND posting_status = 'posted' AND gift_type <> 'pledge' AND payment_method IS DISTINCT FROM 'in_kind'
             UNION ALL
             SELECT disbursement_date, CASE WHEN kind = 'property' THEN 'Donated property released' ELSE 'Paid out' END, -amount_cents FROM org_sponsored_project_disbursements
              WHERE org_id = $1 AND sponsored_project_id = $2 AND status = 'approved' AND ledger_transaction_id IS NOT NULL
             UNION ALL
             SELECT period_end, 'Administrative fee', -amount_cents FROM org_sponsor_fee_postings
              WHERE org_id = $1 AND sponsored_project_id = $2 AND voided_at IS NULL AND ledger_transaction_id IS NOT NULL) a
           ORDER BY date DESC LIMIT 50`, [ws.id, project.id]),
        pool.query(
          `SELECT r.id, r.created_at::date AS date, c.display_name AS payee, r.amount_cents, r.purpose, r.status, r.decision_reason
             FROM org_sponsor_payment_requests r LEFT JOIN org_constituents c ON c.id = r.payee_constituent_id
            WHERE r.org_id = $1 AND r.sponsored_project_id = $2 ORDER BY r.created_at DESC LIMIT 30`, [ws.id, project.id]),
        pool.query(
          `SELECT id, period_start, period_end, due_date, received_at FROM org_sponsor_reports
            WHERE org_id = $1 AND sponsored_project_id = $2 AND kind = 'project_quarterly' AND (received_at IS NULL OR received_at > CURRENT_DATE - 120)
            ORDER BY due_date LIMIT 8`, [ws.id, project.id]),
      ]);
      return res.json({
        workspace_name: ws.display_name,
        project: { name: project.name, status: project.status, hold_reason: project.status === 'on_hold' ? project.hold_reason : null },
        balance: {
          received_cents: b.received_posted_cents, fees_cents: Math.max(b.fees_accrued_cents, b.fees_posted_cents),
          paid_cents: b.disbursed_posted_cents + b.recalled_posted_cents + b.other_spending_cents, committed_cents: b.pending_cents, available_cents: b.available_cents,
        },
        activity: act.rows.map((x) => ({ date: isoDate(x.date), label: x.label, cents: Number(x.cents) })),
        requests: reqs.rows.map((x) => ({ id: x.id, date: isoDate(x.date), payee: x.payee, amount_cents: Number(x.amount_cents), purpose: x.purpose, status: x.status, note: x.decision_reason })),
        reports: reps.rows.map((x) => ({ id: x.id, period_start: isoDate(x.period_start), period_end: isoDate(x.period_end), due_date: isoDate(x.due_date), received_at: isoDate(x.received_at) })),
        document_types: LEAD_DOC_TYPES.map((k) => ({ key: k, label: DOC_TYPES[k].label })),
        methods: REQUEST_METHODS,
        form_token: issueFormToken(ws.id, o.now && o.now()),
      });
    } catch (e) {
      console.error('GET /api/public/:slug/lead/project:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  });

  // Lead: payment request (with an optional invoice or receipt)
  app.post('/api/public/:slug/lead/payment-requests', writeLimit, singleFile, leadContext, formGuard, async (req, res) => {
    try {
      const { workspace: ws, project } = req;
      const b = req.body || {};
      const payeeName = String(b.payee_name || '').trim().slice(0, 200);
      if (!payeeName) return res.status(400).json({ code: 'payee_required', error: 'Enter who is being paid.' });
      const kind = b.payee_kind === 'individual' ? 'individual' : 'organization';
      const email = b.payee_email ? String(b.payee_email).trim().slice(0, 200) : null;
      const found = await pool.query('SELECT id FROM org_constituents WHERE org_id = $1 AND lower(btrim(display_name)) = lower($2) AND kind = $3 ORDER BY id LIMIT 1', [ws.id, payeeName, kind]);
      let payeeId = found.rows[0] ? found.rows[0].id : null;
      if (!payeeId) {
        const ins = await pool.query(`INSERT INTO org_constituents (org_id, display_name, kind, email) VALUES ($1, $2, $3, $4) RETURNING id`, [ws.id, payeeName, kind, email]);
        payeeId = ins.rows[0].id;
        await logAudit(pool, { orgId: ws.id, userId: null, action: 'create', tableName: 'org_constituents', recordId: payeeId, metadata: { via: 'project lead link', sponsored_project_id: project.id } });
      }
      let documentId = null;
      if (req.file) {
        const doc = await storeUploadedFile(pool, { orgId: ws.id, projectId: project.id, buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype, title: 'Invoice or receipt: ' + payeeName, docType: 'correspondence' });
        if (doc.error) return res.status(400).json({ code: 'bad_file', error: doc.error });
        documentId = doc.id;
      }
      const out = await createRequest(pool, {
        orgId: ws.id, userId: null, projectId: project.id, linkRef: 'link:' + req.leadLink.id,
        input: { payee_constituent_id: payeeId, amount_cents: b.amount_cents, purpose: b.purpose, method: b.method || 'check', needed_by: b.needed_by, budget_line: b.budget_line, document_id: documentId },
      });
      if (out.httpStatus < 400) await recordUse(pool, req, req.leadLink, 'payment_request');
      return res.status(out.httpStatus).json(out.httpStatus < 400 ? { id: out.body.request.id, status: out.body.request.status, budget_warning: out.body.budget_warning || null } : out.body);
    } catch (e) {
      console.error('POST /api/public/:slug/lead/payment-requests:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  });

  // Lead: send a quarterly report
  app.post('/api/public/:slug/lead/reports/:reportId', writeLimit, singleFile, leadContext, formGuard, async (req, res) => {
    try {
      const { workspace: ws, project } = req;
      const r = await pool.query(`SELECT id, received_at, period_end FROM org_sponsor_reports WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3 AND kind = 'project_quarterly'`,
        [Number.parseInt(String(req.params.reportId), 10) || 0, ws.id, project.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'That report is not on this project.' });
      if (r.rows[0].received_at) return res.status(409).json({ error: 'This report has already been received.' });
      if (!req.file) return res.status(400).json({ code: 'file_required', error: 'Attach the report file.' });
      const doc = await storeUploadedFile(pool, { orgId: ws.id, projectId: project.id, buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype,
        title: 'Quarterly report to ' + isoDate(r.rows[0].period_end), docType: 'report' });
      if (doc.error) return res.status(400).json({ code: 'bad_file', error: doc.error });
      const out = await markReceived(pool, { orgId: ws.id, userId: null, reportId: r.rows[0].id, documentId: doc.id });
      if (out.httpStatus < 400) await recordUse(pool, req, req.leadLink, 'report');
      return res.status(out.httpStatus).json(out.httpStatus < 400 ? { id: r.rows[0].id, received_at: out.body.received_at } : out.body);
    } catch (e) {
      console.error('POST /api/public/:slug/lead/reports/:reportId:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  });

  // Lead: upload a document
  app.post('/api/public/:slug/lead/documents', writeLimit, singleFile, leadContext, formGuard, async (req, res) => {
    try {
      const { workspace: ws, project } = req;
      const type = String((req.body && req.body.doc_type) || 'correspondence');
      if (!LEAD_DOC_TYPES.includes(type)) return res.status(400).json({ error: 'Choose a document type from the list.' });
      if (!req.file) return res.status(400).json({ code: 'file_required', error: 'Choose a file to send.' });
      const doc = await storeUploadedFile(pool, { orgId: ws.id, projectId: project.id, buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype,
        title: String((req.body && req.body.title) || req.file.originalname).slice(0, 300), docType: type });
      if (doc.error) return res.status(400).json({ code: 'bad_file', error: doc.error });
      await recordUse(pool, req, req.leadLink, 'document');
      return res.status(201).json({ received: true });
    } catch (e) {
      console.error('POST /api/public/:slug/lead/documents:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  });

  // Public project page (only when the workspace turned it on for the project)
  app.get('/api/public/:slug/projects/:projectId', readLimit, async (req, res) => {
    try {
      const ws = await enterWorkspace(pool, req.params.slug);
      if (!ws) return res.status(404).json({ error: 'This page is not available.' });
      const p = await pool.query(
        `SELECT p.name, p.public_summary, p.description FROM org_sponsored_projects p JOIN org_settings s ON s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
          WHERE p.id = $1 AND p.sponsor_org_id = $2 AND p.public_page_enabled AND p.status IN ('active', 'on_hold', 'winding_down')`,
        [Number.parseInt(String(req.params.projectId), 10) || 0, ws.id]);
      if (!p.rows.length) return res.status(404).json({ error: 'This page is not available.' });
      return res.json({ workspace_name: ws.display_name, name: p.rows[0].name, summary: p.rows[0].public_summary || p.rows[0].description || '', donate_url: null });
    } catch (e) {
      console.error('GET /api/public/:slug/projects/:projectId:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Try again later.' });
    }
  });
}

module.exports = { registerPublicRoutes, LEAD };
