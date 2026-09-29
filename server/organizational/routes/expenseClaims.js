'use strict';

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const {
  postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, buildReversingLines,
} = require('../lib/ledgerPosting');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { extractReceiptFields } = require('../lib/receiptOcr');
const { sendExpenseClaimMessageEmail } = require('../lib/sendExpenseClaimMessageEmail');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function rowToClaim(row) {
  return {
    id: row.id,
    submitted_by: row.submitted_by,
    submitted_by_name: row.submitted_by_name,
    claim_date: row.claim_date,
    description: row.description,
    status: row.status,
    approved_by: row.approved_by,
    approved_by_name: row.approved_by_name,
    approved_at: row.approved_at,
    confirmed_by: row.confirmed_by,
    confirmed_by_name: row.confirmed_by_name,
    confirmed_at: row.confirmed_at,
    disputed_reason: row.disputed_reason,
    ledger_transaction_id: row.ledger_transaction_id,
    payment_ledger_transaction_id: row.payment_ledger_transaction_id,
    total_cents: row.total_cents != null ? String(row.total_cents) : '0',
    fiscal_year: row.fiscal_year,
    created_at: row.created_at,
    receipt_affidavit_reason: row.receipt_affidavit_reason,
    receipt_affidavit_at: row.receipt_affidavit_at,
    receipt_follow_up_due: row.receipt_follow_up_due,
    receipt_resolved_at: row.receipt_resolved_at,
  };
}

function rowToLine(row) {
  return {
    id: row.id,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    grant_id: row.grant_id,
    expense_date: row.expense_date,
    description: row.description,
    miles: row.miles != null ? String(row.miles) : null,
    rate_cents_per_mile: row.rate_cents_per_mile,
    amount_cents: String(row.amount_cents),
    line_memo: row.line_memo,
  };
}

function parseLineBody(body, i) {
  const accountId = Number.parseInt(String(body.account_id), 10);
  const programId = Number.parseInt(String(body.program_id), 10);
  if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${i + 1}: account_id is required` };
  if (!Number.isInteger(programId) || programId < 1) return { error: `line ${i + 1}: program_id is required` };
  if (!body.expense_date || !DATE_RE.test(String(body.expense_date))) return { error: `line ${i + 1}: expense_date is required and must be YYYY-MM-DD` };
  if (!body.description || !String(body.description).trim()) return { error: `line ${i + 1}: description is required` };
  const amountCents = Number.parseInt(String(body.amount_cents), 10);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: `line ${i + 1}: amount_cents must be a positive integer` };
  let grantId = null;
  if (body.grant_id != null && body.grant_id !== '') {
    grantId = Number.parseInt(String(body.grant_id), 10);
    if (!Number.isInteger(grantId) || grantId < 1) return { error: `line ${i + 1}: grant_id must be a positive integer if provided` };
  }
  let miles = null;
  let rate = null;
  if (body.miles != null && body.miles !== '') {
    miles = Number.parseFloat(String(body.miles));
    if (!Number.isFinite(miles) || miles <= 0) return { error: `line ${i + 1}: miles must be a positive number if provided` };
    rate = Number.parseInt(String(body.rate_cents_per_mile), 10);
    if (!Number.isInteger(rate) || rate <= 0) return { error: `line ${i + 1}: rate_cents_per_mile is required when miles is set` };
  }
  return {
    fields: {
      accountId, programId, grantId, expenseDate: String(body.expense_date),
      description: String(body.description).trim(), amountCents, miles, rate,
      lineMemo: body.line_memo != null ? String(body.line_memo).trim() || null : null,
    },
  };
}

function registerExpenseClaimRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  // Small, dedicated endpoint rather than folding into orgs.js's existing settings PATCH --
  // that one's already a large single-transaction UPDATE across a dozen unrelated fields;
  // adding a 13th risks an unrelated regression for one boolean-shaped setting.
  app.get('/api/organizational/orgs/:slug/settings/expense-claim-approval-mode', ...orgAuth, async (req, res) => {
    try {
      const mode = await getApprovalMode(req.orgId);
      const r = await pool.query(`SELECT expense_claim_receipt_required_threshold_cents FROM org_settings WHERE org_id = $1`, [req.orgId]);
      const thresholdCents = (r.rows[0] && r.rows[0].expense_claim_receipt_required_threshold_cents) || 0;
      return res.json({ expense_claim_approval_mode: mode, expense_claim_receipt_required_threshold_cents: String(thresholdCents) });
    } catch (e) {
      console.error('GET expense-claim-approval-mode:', e.message);
      return res.status(500).json({ error: 'Could not load setting' });
    }
  });
  app.patch('/api/organizational/orgs/:slug/settings/expense-claim-approval-mode', ...orgAuth, async (req, res) => {
    const body = req.body || {};
    if (!['admin'].includes(String(req.coopOrgRole))) {
      return res.status(403).json({ error: 'Only an admin can change this setting', code: 'role_not_permitted' });
    }
    const setClauses = [];
    const params = [];
    if (body.expense_claim_approval_mode !== undefined) {
      if (!['pre_approval', 'post_payout'].includes(body.expense_claim_approval_mode)) {
        return res.status(400).json({ error: 'expense_claim_approval_mode must be pre_approval or post_payout' });
      }
      params.push(body.expense_claim_approval_mode);
      setClauses.push(`expense_claim_approval_mode = $${params.length}`);
    }
    if (body.expense_claim_receipt_required_threshold_cents !== undefined) {
      const threshold = Number.parseInt(String(body.expense_claim_receipt_required_threshold_cents), 10);
      if (!Number.isInteger(threshold) || threshold < 0) {
        return res.status(400).json({ error: 'expense_claim_receipt_required_threshold_cents must be a non-negative integer' });
      }
      params.push(threshold);
      setClauses.push(`expense_claim_receipt_required_threshold_cents = $${params.length}`);
    }
    if (!setClauses.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.orgId);
    try {
      await pool.query(`UPDATE org_settings SET ${setClauses.join(', ')}, updated_at = NOW() WHERE org_id = $${params.length}`, params);
      const mode = await getApprovalMode(req.orgId);
      const r = await pool.query(`SELECT expense_claim_receipt_required_threshold_cents FROM org_settings WHERE org_id = $1`, [req.orgId]);
      return res.json({
        expense_claim_approval_mode: mode,
        expense_claim_receipt_required_threshold_cents: String((r.rows[0] && r.rows[0].expense_claim_receipt_required_threshold_cents) || 0),
      });
    } catch (e) {
      console.error('PATCH expense-claim-approval-mode:', e.message);
      return res.status(500).json({ error: 'Could not update setting' });
    }
  });

  const LIST_SELECT = `
    SELECT c.*, u1.email AS submitted_by_name, u2.email AS approved_by_name, u3.email AS confirmed_by_name,
           COALESCE((SELECT SUM(amount_cents) FROM org_expense_claim_lines l WHERE l.claim_id = c.id), 0) AS total_cents
    FROM org_expense_claims c
    JOIN users u1 ON u1.id = c.submitted_by
    LEFT JOIN users u2 ON u2.id = c.approved_by
    LEFT JOIN users u3 ON u3.id = c.confirmed_by
    WHERE c.org_id = $1`;

  app.get('/api/organizational/orgs/:slug/expense-claims', ...orgAuth, async (req, res) => {
    try {
      const mineOnly = req.query.mine === 'true';
      const userId = req.user.user_id ?? req.user.id;
      const conds = [];
      const params = [req.orgId];
      if (mineOnly) { params.push(userId); conds.push(`c.submitted_by = $${params.length}`); }
      const scopeClause = appendProgramScopeExistsClause(req, { linesTable: 'org_expense_claim_lines', fkColumn: 'claim_id', parentIdExpr: 'c.id' }, params);
      const r = await pool.query(
        LIST_SELECT + (conds.length ? ' AND ' + conds.join(' AND ') : '') + scopeClause + ' ORDER BY c.created_at DESC',
        params
      );
      return res.json({ claims: r.rows.map(rowToClaim) });
    } catch (e) {
      console.error('GET /expense-claims:', e.message);
      return res.status(500).json({ error: 'Could not load expense claims' });
    }
  });

  app.get('/api/organizational/orgs/:slug/expense-claims/:id', ...orgAuth, async (req, res) => {
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    try {
      const r = await pool.query(LIST_SELECT + ' AND c.id = $2', [req.orgId, claimId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Expense claim not found' });
      const linesR = await pool.query(
        `SELECT l.*, a.code AS account_code, a.name AS account_name, p.name AS program_name
         FROM org_expense_claim_lines l JOIN org_accounts a ON a.id = l.account_id JOIN org_programs p ON p.id = l.program_id
         WHERE l.claim_id = $1 ORDER BY l.id`,
        [claimId]
      );
      if (linesR.rows.length === 0 && programScopeFor(req) !== null) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      const docsR = await pool.query(
        `SELECT id, title, original_filename, created_at FROM org_documents
         WHERE org_id = $1 AND source_ref_type = 'expense_claim' AND source_ref_id = $2 AND archived_at IS NULL
         ORDER BY created_at`,
        [req.orgId, claimId]
      );
      const claim = rowToClaim(r.rows[0]);
      claim.lines = linesR.rows.map(rowToLine);
      claim.receipts = docsR.rows;
      return res.json({ claim });
    } catch (e) {
      console.error('GET /expense-claims/:id:', e.message);
      return res.status(500).json({ error: 'Could not load expense claim' });
    }
  });

  /** Read-only receipt OCR prefill -- posts nothing, creates no row. See spec addendum. */
  app.post('/api/organizational/orgs/:slug/expense-claims/ocr-preview', ...orgAuth, upload.single('file'), async (req, res) => {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Missing file field' });
    try {
      const { extracted, error } = await extractReceiptFields(req.file.buffer, req.file.mimetype);
      return res.json({ extracted, error });
    } catch (e) {
      console.error('POST /expense-claims/ocr-preview:', e.message);
      return res.status(500).json({ error: 'Could not scan this receipt' });
    }
  });

  /**
   * Category coding-history suggestion (2026-09-17) -- same "look at the last real usage"
   * idea as Bank Reconciliation's coding-suggestion / bills.js's vendor-coding-suggestion,
   * adapted for Expense Claims: there's no vendor/constituent concept here (the claimant is a
   * user, not a contact), so this keys off (this submitter, OCR's suggested_category matched
   * against an account name they've actually used before) instead of a constituent_id. Prefers
   * real precedent over the existing blind category->account-name text match, and is the only
   * source of a program_id suggestion for expense claims today (previously never suggested at
   * all). Never applied automatically.
   */
  app.get('/api/organizational/orgs/:slug/expense-claims/category-coding-suggestion', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const category = String(req.query.category || '').trim();
    if (!category) return res.status(400).json({ error: 'category is required' });
    try {
      const r = await pool.query(
        `SELECT l.account_id, a.code AS account_code, a.name AS account_name, l.program_id, p.name AS program_name
         FROM org_expense_claim_lines l
         JOIN org_expense_claims c ON c.id = l.claim_id
         JOIN org_accounts a ON a.id = l.account_id
         JOIN org_programs p ON p.id = l.program_id
         WHERE c.org_id = $1 AND c.submitted_by = $2 AND a.name ILIKE '%' || $3 || '%'
         ORDER BY c.claim_date DESC, l.id DESC
         LIMIT 1`,
        [orgId, userId, category]
      );
      if (!r.rows.length) return res.json({ suggestion: null });
      const row = r.rows[0];
      return res.json({
        suggestion: {
          account_id: row.account_id, account_code: row.account_code, account_name: row.account_name,
          program_id: row.program_id, program_name: row.program_name,
        },
      });
    } catch (e) {
      console.error('GET expense-claims/category-coding-suggestion:', e.message);
      return res.status(500).json({ error: 'Could not load coding suggestion' });
    }
  });

  app.post('/api/organizational/orgs/:slug/expense-claims', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const claimDate = body.claim_date != null ? String(body.claim_date) : null;
    if (!claimDate || !DATE_RE.test(claimDate)) return res.status(400).json({ error: 'claim_date is required and must be YYYY-MM-DD' });
    const description = body.description != null ? String(body.description).trim() : '';
    if (!description) return res.status(400).json({ error: 'description is required' });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) return res.status(400).json({ error: 'At least one line is required' });
    const parsedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const { error, fields } = parseLineBody(lines[i], i);
      if (error) return res.status(400).json({ error });
      parsedLines.push(fields);
    }
    if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
      return res.status(403).json({ error: 'You do not have access to create a claim with lines outside your granted program(s).' });
    }

    try {
      const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
      const fiscalYear = fiscalYearForDate(claimDate, fyEndMonth);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const claimR = await client.query(
          `INSERT INTO org_expense_claims (org_id, submitted_by, claim_date, description, fiscal_year)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [orgId, userId, claimDate, description, fiscalYear]
        );
        const claimId = claimR.rows[0].id;
        for (const l of parsedLines) {
          await client.query(
            `INSERT INTO org_expense_claim_lines (claim_id, account_id, program_id, grant_id, expense_date, description, miles, rate_cents_per_mile, amount_cents, line_memo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [claimId, l.accountId, l.programId, l.grantId, l.expenseDate, l.description, l.miles, l.rate, l.amountCents, l.lineMemo]
          );
        }
        await client.query('COMMIT');
        return res.status(201).json({ id: claimId });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('POST /expense-claims:', e.message);
      return res.status(500).json({ error: 'Could not create expense claim' });
    }
  });

  /**
   * Edit a draft claim -- draft-only, claimant-only (an admin can't edit someone else's claim
   * on their behalf; they can only void it once submitted). Nothing has posted to the ledger
   * yet at draft stage, so a full replace of description/claim_date/lines carries no more risk
   * than the existing draft-only DELETE already does. Lines are replaced wholesale (delete +
   * re-insert) rather than diffed -- same shape as create, reusing parseLineBody so validation
   * can't drift between create and edit.
   */
  app.patch('/api/organizational/orgs/:slug/expense-claims/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    const body = req.body || {};

    const claimDate = body.claim_date != null ? String(body.claim_date) : null;
    if (!claimDate || !DATE_RE.test(claimDate)) return res.status(400).json({ error: 'claim_date is required and must be YYYY-MM-DD' });
    const description = body.description != null ? String(body.description).trim() : '';
    if (!description) return res.status(400).json({ error: 'description is required' });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) return res.status(400).json({ error: 'At least one line is required' });
    const parsedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const { error, fields } = parseLineBody(lines[i], i);
      if (error) return res.status(400).json({ error });
      parsedLines.push(fields);
    }
    if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
      return res.status(403).json({ error: 'You do not have access to set lines outside your granted program(s).' });
    }

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      if (claim.submitted_by !== userId) return res.status(403).json({ error: 'You can only edit your own claim', code: 'not_owner' });
      if (claim.status !== 'draft') return res.status(409).json({ error: 'Only a draft claim can be edited', code: 'not_editable' });
      const existingLinePrograms = (await loadClaimLines(claimId)).map((l) => l.program_id);
      if (!headerProgramsInScope(req, existingLinePrograms)) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }

      const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
      const fiscalYear = fiscalYearForDate(claimDate, fyEndMonth);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE org_expense_claims SET claim_date = $1, description = $2, fiscal_year = $3, updated_at = NOW() WHERE id = $4 AND org_id = $5`,
          [claimDate, description, fiscalYear, claimId, orgId]
        );
        await client.query(`DELETE FROM org_expense_claim_lines WHERE claim_id = $1`, [claimId]);
        for (const l of parsedLines) {
          await client.query(
            `INSERT INTO org_expense_claim_lines (claim_id, account_id, program_id, grant_id, expense_date, description, miles, rate_cents_per_mile, amount_cents, line_memo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [claimId, l.accountId, l.programId, l.grantId, l.expenseDate, l.description, l.miles, l.rate, l.amountCents, l.lineMemo]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'lines', oldValue: null, newValue: null }],
        metadata: { ...reqMeta(req), note: 'draft claim edited (description/lines replaced)' },
      }).catch(() => {});
      return res.json({ id: claimId });
    } catch (e) {
      console.error('PATCH /expense-claims/:id:', e.message);
      return res.status(500).json({ error: 'Could not update expense claim' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/expense-claims/:id', ...orgAuth, async (req, res) => {
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    try {
      const existingLinePrograms = (await pool.query('SELECT program_id FROM org_expense_claim_lines WHERE claim_id = $1', [claimId])).rows.map((row) => row.program_id);
      if (!headerProgramsInScope(req, existingLinePrograms)) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      const r = await pool.query(`DELETE FROM org_expense_claims WHERE id = $1 AND org_id = $2 AND status = 'draft' RETURNING id`, [claimId, req.orgId]);
      if (!r.rows.length) return res.status(409).json({ error: 'Only a draft claim can be deleted' });
      return res.json({ id: claimId, deleted: true });
    } catch (e) {
      console.error('DELETE /expense-claims/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete expense claim' });
    }
  });

  async function loadOwnClaim(orgId, claimId) {
    const r = await pool.query(`SELECT * FROM org_expense_claims WHERE id = $1 AND org_id = $2`, [claimId, orgId]);
    return r.rows[0] || null;
  }
  async function loadClaimLines(claimId) {
    const r = await pool.query(`SELECT * FROM org_expense_claim_lines WHERE claim_id = $1`, [claimId]);
    return r.rows;
  }
  async function requireReceipt(orgId, claimId) {
    const r = await pool.query(
      `SELECT 1 FROM org_documents WHERE org_id = $1 AND source_ref_type = 'expense_claim' AND source_ref_id = $2 AND archived_at IS NULL LIMIT 1`,
      [orgId, claimId]
    );
    return r.rows.length > 0;
  }
  async function getApprovalMode(orgId) {
    const r = await pool.query(`SELECT expense_claim_approval_mode FROM org_settings WHERE org_id = $1`, [orgId]);
    return (r.rows[0] && r.rows[0].expense_claim_approval_mode) || 'pre_approval';
  }

  /**
   * Submit: draft -> pending_approval (pre_approval mode) or draft -> paid_pending_confirmation
   * (post_payout mode, posting both legs immediately -- see spec addendum). A receipt is
   * required before submit in both modes.
   */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/submit', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    const body = req.body || {};

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      const lines = await loadClaimLines(claimId);
      if (!headerProgramsInScope(req, lines.map((l) => l.program_id))) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      if (claim.status !== 'draft') return res.status(409).json({ error: `Claim is not a draft (status: ${claim.status})`, code: 'not_draft' });
      if (!lines.length) return res.status(422).json({ error: 'Claim has no line items' });
      const claimTotalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);

      // Receipt gate: below the org's threshold, no receipt or affidavit is required at all
      // (matches how orgs actually let small expenses through -- see migration 238's research
      // note on IRS accountable-plan rules). At/above it, a receipt or a filed affidavit is
      // required; neither present means submit is blocked until one exists.
      if (!(await requireReceipt(orgId, claimId))) {
        const settingsR = await pool.query(`SELECT expense_claim_receipt_required_threshold_cents FROM org_settings WHERE org_id = $1`, [orgId]);
        const thresholdCents = (settingsR.rows[0] && settingsR.rows[0].expense_claim_receipt_required_threshold_cents) || 0;
        const exempt = claimTotalCents < thresholdCents;
        const hasAffidavit = claim.receipt_affidavit_at != null;
        if (!exempt && !hasAffidavit) {
          return res.status(422).json({
            error: 'A receipt is required before submitting, or file a missing-receipt affidavit',
            code: 'receipt_or_affidavit_required',
            threshold_cents: String(thresholdCents),
            claim_total_cents: String(claimTotalCents),
          });
        }
      }

      const mode = await getApprovalMode(orgId);
      const submitterR = await pool.query(`SELECT email FROM users WHERE id = $1`, [claim.submitted_by]);
      const submitterName = submitterR.rows[0] ? submitterR.rows[0].email : null;

      if (mode === 'pre_approval') {
        await pool.query(`UPDATE org_expense_claims SET status = 'pending_approval', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [claimId, orgId]);
        return res.json({ id: claimId, status: 'pending_approval' });
      }

      // post_payout mode: pay immediately, confirm later.
      const bankAccountId = Number.parseInt(String(body.bank_account_id), 10);
      if (!Number.isInteger(bankAccountId) || bankAccountId < 1) {
        return res.status(400).json({ error: 'bank_account_id is required to pay this claim now (post-payout approval mode)' });
      }
      const totalCents = claimTotalCents;
      const ledgerLines = lines.map((l) => ({
        account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
        debit_cents: Number(l.amount_cents), credit_cents: 0, line_memo: l.line_memo,
      }));
      ledgerLines.push({
        account_id: bankAccountId, program_id: lines[0].program_id, grant_id: null,
        debit_cents: 0, credit_cents: totalCents,
        line_memo: `Reimbursement paid to ${submitterName || 'claimant'} for expense claim #${claimId}`,
      });

      const postResult = await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: claim.claim_date,
        memo: `Expense claim #${claimId} (${submitterName || 'claimant'}) -- paid, confirmation pending`,
        payee: submitterName, referenceNumber: null,
        lines: ledgerLines, source: 'expense_claim_approval',
      });
      if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

      await pool.query(
        `UPDATE org_expense_claims
         SET status = 'paid_pending_confirmation', ledger_transaction_id = $1, payment_ledger_transaction_id = $1, bank_account_id = $2, updated_at = NOW()
         WHERE id = $3 AND org_id = $4`,
        [postResult.body.id, bankAccountId, claimId, orgId]
      );
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'status', oldValue: 'draft', newValue: 'paid_pending_confirmation' }],
        metadata: { ...reqMeta(req), ledger_transaction_id: postResult.body.id, approval_mode: 'post_payout' },
      }).catch(() => {});
      return res.json({ id: claimId, status: 'paid_pending_confirmation', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      console.error('POST /expense-claims/:id/submit:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not submit this expense claim' });
    }
  });

  /**
   * File a missing-receipt affidavit -- draft-only, claimant self-certifies (not an admin on
   * their behalf). Structured, not a freeform note: reason + an explicit certification. Does
   * not change claim status or submit anything; the claimant still calls /submit afterward,
   * which now passes the receipt gate. follow-up due defaults to 60 days from claim_date, the
   * commonly-used "reasonable period" standard for late substantiation.
   */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/receipt-affidavit', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    const body = req.body || {};
    if (body.certified !== true) return res.status(400).json({ error: 'certified must be true -- this is a self-certification, not decorative' });
    const reason = body.reason != null ? String(body.reason).trim() : '';
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      if (claim.submitted_by !== userId) return res.status(403).json({ error: 'You can only file this for your own claim', code: 'not_owner' });
      if (claim.status !== 'draft') return res.status(409).json({ error: 'Only a draft claim can have a receipt affidavit filed', code: 'not_editable' });

      await pool.query(
        `UPDATE org_expense_claims
         SET receipt_affidavit_reason = $1, receipt_affidavit_at = NOW(), receipt_affidavit_by = $2,
             receipt_follow_up_due = claim_date + INTERVAL '60 days', updated_at = NOW()
         WHERE id = $3 AND org_id = $4`,
        [reason, userId, claimId, orgId]
      );
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'receipt_affidavit_at', oldValue: null, newValue: 'filed' }],
        metadata: { ...reqMeta(req), reason },
      }).catch(() => {});
      return res.json({ id: claimId, receipt_affidavit_at: new Date().toISOString() });
    } catch (e) {
      console.error('POST /expense-claims/:id/receipt-affidavit:', e.message);
      return res.status(500).json({ error: 'Could not file this affidavit' });
    }
  });

  /** Per-claim message thread between the claimant and admin/board. GET for anyone who can
   * already view the claim; POST sends a best-effort outbound email notification to the other
   * party (never blocks or fails the request if email send fails). */
  app.get('/api/organizational/orgs/:slug/expense-claims/:id/messages', ...orgAuth, async (req, res) => {
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    try {
      const r = await pool.query(
        `SELECT m.id, m.body, m.created_at, u.email AS author_email
         FROM org_expense_claim_messages m
         JOIN org_expense_claims c ON c.id = m.claim_id
         JOIN users u ON u.id = m.author_user_id
         WHERE m.claim_id = $1 AND c.org_id = $2
         ORDER BY m.created_at ASC`,
        [claimId, req.orgId]
      );
      return res.json({ messages: r.rows });
    } catch (e) {
      console.error('GET /expense-claims/:id/messages:', e.message);
      return res.status(500).json({ error: 'Could not load messages' });
    }
  });

  app.post('/api/organizational/orgs/:slug/expense-claims/:id/messages', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    const body = (req.body && String(req.body.body || '').trim()) || '';
    if (!body) return res.status(400).json({ error: 'body is required' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      const isMine = claim.submitted_by === userId;
      const canApproveRole = ['admin', 'board'].includes(String(req.coopOrgRole));
      if (!isMine && !canApproveRole) return res.status(403).json({ error: 'Not authorized to message on this claim', code: 'role_not_permitted' });

      const r = await pool.query(
        `INSERT INTO org_expense_claim_messages (claim_id, author_user_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
        [claimId, userId, body]
      );

      // Fire-and-forget notification -- never fail the request over email delivery.
      (async () => {
        try {
          const authorR = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
          const authorEmail = authorR.rows[0] ? authorR.rows[0].email : null;
          const orgR = await pool.query(`SELECT display_name FROM coop_members WHERE id = $1`, [orgId]);
          const orgName = orgR.rows[0] ? orgR.rows[0].display_name : 'Your organization';
          let recipients = [];
          if (isMine) {
            const adminR = await pool.query(
              `SELECT u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.role IN ('admin','board')`,
              [orgId]
            );
            recipients = adminR.rows.map((row) => row.email).filter(Boolean);
          } else {
            const submitterR = await pool.query(`SELECT email FROM users WHERE id = $1`, [claim.submitted_by]);
            if (submitterR.rows[0] && submitterR.rows[0].email) recipients = [submitterR.rows[0].email];
          }
          if (recipients.length) {
            await sendExpenseClaimMessageEmail(pool, {
              recipients, claimId, orgName, authorEmail, messageBody: body, slug: req.params.slug,
            });
          }
        } catch (e) {
          console.error('expense claim message notification failed:', e.message);
        }
      })();

      return res.status(201).json({ id: r.rows[0].id, created_at: r.rows[0].created_at });
    } catch (e) {
      console.error('POST /expense-claims/:id/messages:', e.message);
      return res.status(500).json({ error: 'Could not post this message' });
    }
  });

  /** Approve (pre_approval mode only): pending_approval -> approved. Posts Dr expense / Cr
   * Expense Claims Payable. Self-review blocked at the DB trigger level regardless of what
   * this handler checks. */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/approve', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      if (!headerProgramsInScope(req, (await loadClaimLines(claimId)).map((l) => l.program_id))) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      if (claim.status !== 'pending_approval') return res.status(409).json({ error: `Claim is not awaiting approval (status: ${claim.status})`, code: 'not_pending_approval' });
      if (claim.submitted_by === userId) {
        return res.status(403).json({ error: 'You cannot approve your own expense claim', code: 'self_approval_blocked' });
      }
      if (!['admin', 'board'].includes(String(req.coopOrgRole))) {
        return res.status(403).json({ error: 'Only an admin or board member can approve an expense claim', code: 'role_not_permitted' });
      }

      const lines = await loadClaimLines(claimId);
      const submitterR = await pool.query(`SELECT email FROM users WHERE id = $1`, [claim.submitted_by]);
      const submitterName = submitterR.rows[0] ? submitterR.rows[0].email : null;
      const payableAccountR = await pool.query(`SELECT org_get_or_create_expense_claims_payable_account($1) AS id`, [orgId]);
      const payableAccountId = payableAccountR.rows[0].id;
      const totalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);

      // approved_by is set first so the DB trigger (a superset of the app-level check above)
      // gets the final say -- consistent with how org_bills' own approve handler relies on its
      // trigger as the real enforcement point, not just this route's own check.
      await pool.query(`UPDATE org_expense_claims SET approved_by = $1, approved_at = NOW() WHERE id = $2 AND org_id = $3`, [userId, claimId, orgId]);

      const ledgerLines = lines.map((l) => ({
        account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
        debit_cents: Number(l.amount_cents), credit_cents: 0, line_memo: l.line_memo,
      }));
      ledgerLines.push({
        account_id: payableAccountId, program_id: lines[0].program_id, grant_id: null,
        debit_cents: 0, credit_cents: totalCents,
        line_memo: `Expense Claims Payable for claim #${claimId}`,
      });

      const postResult = await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: claim.claim_date,
        memo: `Expense claim #${claimId} (${submitterName || 'claimant'}) -- approved`,
        payee: submitterName, referenceNumber: null,
        lines: ledgerLines, source: 'expense_claim_approval',
        internalApproval: { approvedBy: userId, sourceRefId: claimId, sourceRefType: 'expense_claim' },
      });
      if (postResult.httpStatus >= 400) {
        await pool.query(`UPDATE org_expense_claims SET approved_by = NULL, approved_at = NULL WHERE id = $1 AND org_id = $2`, [claimId, orgId]);
        return res.status(postResult.httpStatus).json(postResult.body);
      }

      await pool.query(`UPDATE org_expense_claims SET status = 'approved', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [postResult.body.id, claimId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'status', oldValue: 'pending_approval', newValue: 'approved' }],
        metadata: { ...reqMeta(req), ledger_transaction_id: postResult.body.id },
      }).catch(() => {});
      return res.json({ id: claimId, status: 'approved', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      console.error('POST /expense-claims/:id/approve:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not approve this expense claim' });
    }
  });

  /** Pay (pre_approval mode only): approved -> paid. Full amount only, v1 (see spec). */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/pay', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    const body = req.body || {};
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    const bankAccountId = Number.parseInt(String(body.bank_account_id), 10);
    if (!Number.isInteger(bankAccountId) || bankAccountId < 1) return res.status(400).json({ error: 'bank_account_id is required' });
    const paymentDate = body.payment_date != null ? String(body.payment_date) : null;
    if (!paymentDate || !DATE_RE.test(paymentDate)) return res.status(400).json({ error: 'payment_date is required and must be YYYY-MM-DD' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      const lines = await loadClaimLines(claimId);
      if (!headerProgramsInScope(req, lines.map((l) => l.program_id))) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      if (claim.status !== 'approved') return res.status(409).json({ error: `Claim is not approved (status: ${claim.status})`, code: 'not_approved' });

      const totalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);
      const payableAccountR = await pool.query(`SELECT org_get_or_create_expense_claims_payable_account($1) AS id`, [orgId]);
      const payableAccountId = payableAccountR.rows[0].id;
      const submitterR = await pool.query(`SELECT email FROM users WHERE id = $1`, [claim.submitted_by]);
      const submitterName = submitterR.rows[0] ? submitterR.rows[0].email : null;

      const postResult = await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: paymentDate,
        memo: `Reimbursement paid: expense claim #${claimId} (${submitterName || 'claimant'})`,
        payee: submitterName, referenceNumber: null,
        lines: [
          { account_id: payableAccountId, program_id: lines[0].program_id, grant_id: null, debit_cents: totalCents, credit_cents: 0 },
          { account_id: bankAccountId, program_id: lines[0].program_id, grant_id: null, debit_cents: 0, credit_cents: totalCents },
        ],
        source: 'expense_claim_payment',
      });
      if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

      await pool.query(
        `INSERT INTO org_expense_claim_payments (org_id, claim_id, payment_date, amount_cents, bank_account_id, ledger_transaction_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orgId, claimId, paymentDate, totalCents, bankAccountId, postResult.body.id, userId]
      );
      await pool.query(
        `UPDATE org_expense_claims SET status = 'paid', payment_ledger_transaction_id = $1, bank_account_id = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4`,
        [postResult.body.id, bankAccountId, claimId, orgId]
      );
      return res.json({ id: claimId, status: 'paid', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      console.error('POST /expense-claims/:id/pay:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment for this expense claim' });
    }
  });

  /** Confirm (post_payout mode only): paid_pending_confirmation -> confirmed. Pure
   * attestation -- no further posting, the money already moved at submit time. */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/confirm', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      if (!headerProgramsInScope(req, (await loadClaimLines(claimId)).map((l) => l.program_id))) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      if (claim.status !== 'paid_pending_confirmation') return res.status(409).json({ error: `Claim is not awaiting confirmation (status: ${claim.status})`, code: 'not_pending_confirmation' });
      if (claim.submitted_by === userId) return res.status(403).json({ error: 'You cannot confirm your own expense claim', code: 'self_review_blocked' });
      if (!['admin', 'board'].includes(String(req.coopOrgRole))) {
        return res.status(403).json({ error: 'Only an admin or board member can confirm an expense claim', code: 'role_not_permitted' });
      }

      await pool.query(`UPDATE org_expense_claims SET confirmed_by = $1, confirmed_at = NOW(), status = 'confirmed', updated_at = NOW() WHERE id = $2 AND org_id = $3`, [userId, claimId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'status', oldValue: 'paid_pending_confirmation', newValue: 'confirmed' }],
        metadata: reqMeta(req),
      }).catch(() => {});
      return res.json({ id: claimId, status: 'confirmed' });
    } catch (e) {
      console.error('POST /expense-claims/:id/confirm:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not confirm this expense claim' });
    }
  });

  /**
   * Void/dispute -- covers every cancellation path in one handler, since the right label
   * (void vs. disputed) and the right ledger action (nothing to reverse / void / reverse)
   * both fall out of the claim's current status rather than needing separate endpoints:
   *   - draft/pending_approval: nothing posted yet, just flip status.
   *   - approved (not yet paid, pre_approval mode): void/reverse the approval-only posting.
   *   - paid (pre_approval mode): void/reverse both the approval and payment postings.
   *   - paid_pending_confirmation/confirmed (post_payout mode): void/reverse the single
   *     combined posting; labeled 'disputed' rather than 'void' since real money already
   *     moved and this is a post-hoc correction, not a pre-payment cancellation.
   * Reuses the void-if-unlocked/reverse-if-locked choice already established by Bank
   * Reconciliation's unreconcile -- same two-path design, not reinvented.
   */
  app.post('/api/organizational/orgs/:slug/expense-claims/:id/void', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const claimId = Number.parseInt(String(req.params.id), 10);
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (!Number.isInteger(claimId) || claimId < 1) return res.status(400).json({ error: 'invalid claim id' });
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    try {
      const claim = await loadOwnClaim(orgId, claimId);
      if (!claim) return res.status(404).json({ error: 'Expense claim not found' });
      if (!headerProgramsInScope(req, (await loadClaimLines(claimId)).map((l) => l.program_id))) {
        return res.status(404).json({ error: 'Expense claim not found' });
      }
      if (['void', 'disputed'].includes(claim.status)) return res.status(409).json({ error: `Claim is already ${claim.status}`, code: 'already_terminal' });

      const wasPaidOut = ['paid', 'paid_pending_confirmation', 'confirmed'].includes(claim.status);
      const newStatus = ['paid_pending_confirmation', 'confirmed'].includes(claim.status) ? 'disputed' : 'void';

      async function voidOrReverse(transactionId) {
        const txnR = await pool.query(`SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`, [transactionId, orgId]);
        const txn = txnR.rows[0];
        if (!txn || txn.status === 'voided') return;
        const locked = await isFiscalYearLocked(pool, orgId, txn.fiscal_year);
        if (!locked) {
          await voidLedgerTransaction(pool, { orgId, userId, transactionId, voidReason: reason });
          return;
        }
        const originalLinesR = await pool.query(
          `SELECT account_id, program_id, grant_id, donor_restriction_class::text AS donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
           FROM org_ledger_lines WHERE transaction_id = $1`,
          [transactionId]
        );
        const reversingLines = buildReversingLines(originalLinesR.rows);
        await postLedgerTransaction(pool, {
          orgId, userId, transactionDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of expense claim #${claimId} transaction ${transactionId} (locked FY${txn.fiscal_year}): ${reason}`,
          payee: null, referenceNumber: null, lines: reversingLines,
          source: txn.source, reversesTransactionId: transactionId,
        });
      }

      if (claim.ledger_transaction_id) await voidOrReverse(claim.ledger_transaction_id);
      if (claim.payment_ledger_transaction_id && claim.payment_ledger_transaction_id !== claim.ledger_transaction_id) {
        await voidOrReverse(claim.payment_ledger_transaction_id);
      }

      await pool.query(
        `UPDATE org_expense_claims SET status = $1, disputed_reason = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4`,
        [newStatus, newStatus === 'disputed' ? reason : null, claimId, orgId]
      );
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
        fields: [{ fieldName: 'status', oldValue: claim.status, newValue: newStatus }],
        metadata: { ...reqMeta(req), reason, was_paid_out: wasPaidOut },
      }).catch(() => {});
      return res.json({ id: claimId, status: newStatus });
    } catch (e) {
      console.error('POST /expense-claims/:id/void:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not void this expense claim' });
    }
  });
}

module.exports = { registerExpenseClaimRoutes };
