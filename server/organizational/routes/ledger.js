'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { translateLedgerWriteError, postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('../lib/ledgerPosting');
const { previewLedgerRecode, executeLedgerRecode } = require('../lib/findAndRecode');
const { validateConditions, searchLedgerLines, loadFieldOptions } = require('../lib/ledgerSearch');
const { logAudit } = require('../lib/auditLog');

function rowToLedgerDetailRow(row) {
  return {
    line_id: row.line_id,
    transaction_id: row.transaction_id,
    transaction_date: row.transaction_date,
    status: row.status,
    memo: row.memo,
    payee: row.payee,
    reference_number: row.reference_number,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    reverses_transaction_id: row.reverses_transaction_id,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    grant_id: row.grant_id,
    grant_name: row.grant_name,
    donor_restriction_class: row.donor_restriction_class,
    debit_cents: row.debit_cents != null ? String(row.debit_cents) : '0',
    credit_cents: row.credit_cents != null ? String(row.credit_cents) : '0',
    line_memo: row.line_memo,
  };
}

/**
 * Ledger V1 Phase 3: the detail transaction report -- "show me every transaction that touched
 * Grant X" (Ledger_Module_V1_Spec.md Section 4). One row per org_ledger_lines row (not per
 * transaction), since filtering by grant/program/account is fundamentally a line-level match --
 * a transaction "touches" a grant via one of its lines, and a transaction can touch more than
 * one grant/program/account across its lines. Each row carries its parent transaction's context
 * (date, memo, payee, status) alongside the line's own account/program/grant/amounts, matching
 * the shape of a general-ledger detail report.
 *
 * Read-only. There is no POST/create endpoint yet -- Ledger V1 has no write API through the app
 * so far, only the DB-level schema and triggers built in Phases 1-2b. Worth flagging: this
 * report currently has nothing to show for any real org until a posting API exists.
 */
function registerOrganizationalLedgerRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/ledger/transactions', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const grantId = req.query.grant_id != null ? Number.parseInt(String(req.query.grant_id), 10) : null;
    const programId = req.query.program_id != null ? Number.parseInt(String(req.query.program_id), 10) : null;
    const accountId = req.query.account_id != null ? Number.parseInt(String(req.query.account_id), 10) : null;
    const dateFrom = req.query.date_from ? String(req.query.date_from) : null;
    const dateTo = req.query.date_to ? String(req.query.date_to) : null;
    const status = req.query.status != null ? String(req.query.status).toLowerCase() : null;
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(req.query.limit || '200'), 10) || 200));
    // Added for Find & Recode v2's search step (2026-09-16) -- filters on the *line's* combined
    // debit+credit amount, since a line is always exactly one side (org_ledger_lines_exactly_one_side).
    const amountMinCents = req.query.amount_min_cents != null ? Number.parseInt(String(req.query.amount_min_cents), 10) : null;
    const amountMaxCents = req.query.amount_max_cents != null ? Number.parseInt(String(req.query.amount_max_cents), 10) : null;

    if (status != null && !['posted', 'voided', 'pending_approval'].includes(status)) {
      return res.status(400).json({ error: 'status must be posted, voided, or pending_approval' });
    }
    if (dateFrom != null && !DATE_RE.test(dateFrom)) {
      return res.status(400).json({ error: 'date_from must be YYYY-MM-DD' });
    }
    if (dateTo != null && !DATE_RE.test(dateTo)) {
      return res.status(400).json({ error: 'date_to must be YYYY-MM-DD' });
    }

    try {
      const conds = ['t.org_id = $1'];
      const params = [orgId];
      let p = 2;

      const transactionId = req.query.transaction_id != null ? Number.parseInt(String(req.query.transaction_id), 10) : null;
      if (Number.isInteger(transactionId) && transactionId > 0) {
        conds.push(`t.id = $${p}`);
        params.push(transactionId);
        p += 1;
      }
      if (Number.isInteger(grantId) && grantId > 0) {
        conds.push(`l.grant_id = $${p}`);
        params.push(grantId);
        p += 1;
      }
      if (Number.isInteger(programId) && programId > 0) {
        conds.push(`l.program_id = $${p}`);
        params.push(programId);
        p += 1;
      }
      if (Number.isInteger(accountId) && accountId > 0) {
        conds.push(`l.account_id = $${p}`);
        params.push(accountId);
        p += 1;
      }
      if (dateFrom) {
        conds.push(`t.transaction_date >= $${p}`);
        params.push(dateFrom);
        p += 1;
      }
      if (dateTo) {
        conds.push(`t.transaction_date <= $${p}`);
        params.push(dateTo);
        p += 1;
      }
      if (status) {
        conds.push(`t.status = $${p}`);
        params.push(status);
        p += 1;
      }
      if (Number.isInteger(amountMinCents)) {
        conds.push(`(l.debit_cents + l.credit_cents) >= $${p}`);
        params.push(amountMinCents);
        p += 1;
      }
      if (Number.isInteger(amountMaxCents)) {
        conds.push(`(l.debit_cents + l.credit_cents) <= $${p}`);
        params.push(amountMaxCents);
        p += 1;
      }

      params.push(limit);

      const r = await pool.query(
        `SELECT l.id AS line_id, t.id AS transaction_id, t.transaction_date, t.status,
                t.memo, t.payee, t.reference_number, t.voided_at, t.void_reason, t.reverses_transaction_id,
                l.account_id, acc.code AS account_code, acc.name AS account_name,
                l.program_id, pr.name AS program_name,
                l.grant_id, g.name AS grant_name,
                l.donor_restriction_class::text AS donor_restriction_class,
                l.debit_cents, l.credit_cents, l.line_memo
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts acc ON acc.id = l.account_id
         JOIN org_programs pr ON pr.id = l.program_id
         LEFT JOIN org_grants g ON g.id = l.grant_id
         WHERE ${conds.join(' AND ')}
         ORDER BY t.transaction_date DESC, t.id DESC, l.id ASC
         LIMIT $${p}`,
        params
      );
      return res.json({ lines: r.rows.map(rowToLedgerDetailRow) });
    } catch (e) {
      console.error('GET /ledger/transactions:', e.message);
      return res.status(500).json({ error: 'Could not load ledger detail' });
    }
  });

  /**
   * Phase 4: a thin layer over Phases 1-2b. This handler's only jobs are (1) basic input-shape
   * validation that has nothing to do with accounting rules (missing fields, wrong types --
   * things no DB trigger is responsible for), (2) attempting the insert inside one DB
   * transaction so the deferred balance trigger sees every line before it fires at COMMIT, and
   * (3) translating whatever the trigger set rejects into a real HTTP response. It does not
   * re-check balance, posting-account-only, fiscal-year-lock, or org-matching itself -- migration
   * 191/196/197's triggers are the actual source of truth for all of that.
   */
  app.post('/api/organizational/orgs/:slug/ledger/transactions', ...orgAuth, async (req, res) => {
    const body = req.body || {};
    const result = await postLedgerTransaction(pool, {
      orgId: req.orgId,
      userId: req.user.user_id ?? req.user.id,
      transactionDate: body.transaction_date != null ? String(body.transaction_date) : null,
      memo: body.memo != null ? String(body.memo) : null,
      payee: body.payee != null ? String(body.payee) : null,
      referenceNumber: body.reference_number != null ? String(body.reference_number) : null,
      lines: body.lines,
      source: 'manual',
    });
    return res.status(result.httpStatus).json(result.body);
  });

  /**
   * Void, not delete -- the transaction row stays, its lines stay (so the detail report and any
   * already-computed org_actuals aggregation both still reflect history correctly), only
   * status/voided_at/voided_by/void_reason change. This is the real source of truth for void
   * (Ledger_Module_V1_Spec.md Section 3.7); org_audit_log still records the who/when as a
   * secondary trail, same as it does for budget edits, via the same trg_fy_lock_ledger_transactions
   * trigger enforcing that a locked fiscal year blocks voiding too, exactly like every other edit.
   */
  app.post('/api/organizational/orgs/:slug/ledger/transactions/:id/void', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const transactionId = Number.parseInt(String(req.params.id), 10);
    const voidReason = req.body && req.body.void_reason != null ? String(req.body.void_reason).trim() : '';

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      return res.status(400).json({ error: 'invalid transaction id' });
    }
    const result = await voidLedgerTransaction(pool, { orgId, userId, transactionId, voidReason });
    return res.status(result.httpStatus).json(result.body);
  });

  /**
   * Approve a pending_approval transaction (the federal-award gate from the POST handler
   * above). Real-time, not advisory: org_enforce_ledger_approval_separation_of_duties()
   * (migration 199) rejects outright if the approver is the same user who created it -- this
   * handler doesn't re-check that itself, same "thin layer, trust the trigger" rule as posting.
   */
  app.post('/api/organizational/orgs/:slug/ledger/transactions/:id/approve', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const transactionId = Number.parseInt(String(req.params.id), 10);

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      return res.status(400).json({ error: 'invalid transaction id' });
    }

    try {
      const existing = await pool.query(
        `SELECT id, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`,
        [transactionId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      if (existing.rows[0].status !== 'pending_approval') {
        return res.status(409).json({
          error: `Transaction is not awaiting approval (status: ${existing.rows[0].status})`,
          code: 'not_pending_approval',
        });
      }

      await pool.query(
        `UPDATE org_ledger_transactions
         SET status = 'posted', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND org_id = $3`,
        [userId, transactionId, orgId]
      );
      return res.json({ id: transactionId, status: 'posted' });
    } catch (e) {
      const translated = translateLedgerWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST /ledger/transactions/:id/approve:', e.message);
      return res.status(500).json({ error: 'Could not approve transaction' });
    }
  });

  /**
   * Approval-policy record (Ledger_Module_V1_Spec.md Section 5): reviewer role, review
   * cadence, freeform description, and the dollar threshold the flagged-review endpoint below
   * uses. One row per org, same shape as org_settings. This is documentation of an org's stated
   * process, not a gate -- nothing here blocks posting; only the federal-award check above does.
   */
  app.get('/api/organizational/orgs/:slug/ledger/approval-policy', ...orgAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM org_ledger_approval_policies WHERE org_id = $1`, [req.orgId]);
      const row = r.rows[0] || null;
      return res.json({
        reviewer_role: row?.reviewer_role || null,
        review_cadence: row?.review_cadence || null,
        description: row?.description || null,
        flagged_amount_threshold_cents: row ? String(row.flagged_amount_threshold_cents) : '500000',
        updated_at: row?.updated_at || null,
      });
    } catch (e) {
      console.error('GET /ledger/approval-policy:', e.message);
      return res.status(500).json({ error: 'Could not load approval policy' });
    }
  });

  app.put('/api/organizational/orgs/:slug/ledger/approval-policy', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const reviewerRole = body.reviewer_role != null ? String(body.reviewer_role).trim() || null : null;
    const reviewCadence = body.review_cadence != null ? String(body.review_cadence).trim() || null : null;
    const description = body.description != null ? String(body.description).trim() || null : null;
    const thresholdCents = body.flagged_amount_threshold_cents != null
      ? Number.parseInt(String(body.flagged_amount_threshold_cents), 10)
      : 500000;
    if (!Number.isInteger(thresholdCents) || thresholdCents < 0) {
      return res.status(400).json({ error: 'flagged_amount_threshold_cents must be a non-negative integer' });
    }

    try {
      await pool.query(
        `INSERT INTO org_ledger_approval_policies
           (org_id, reviewer_role, review_cadence, description, flagged_amount_threshold_cents, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (org_id) DO UPDATE SET
           reviewer_role = EXCLUDED.reviewer_role,
           review_cadence = EXCLUDED.review_cadence,
           description = EXCLUDED.description,
           flagged_amount_threshold_cents = EXCLUDED.flagged_amount_threshold_cents,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [orgId, reviewerRole, reviewCadence, description, thresholdCents, userId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('PUT /ledger/approval-policy:', e.message);
      return res.status(500).json({ error: 'Could not save approval policy' });
    }
  });

  /** Exportable as a dated document for a CPA/auditor (spec Section 5) -- same HTML-document
   * pattern reports.js already uses for the board report, not a new export mechanism. */
  app.get('/api/organizational/orgs/:slug/ledger/approval-policy/export', ...orgAuth, async (req, res) => {
    try {
      const orgR = await pool.query(`SELECT display_name FROM coop_members WHERE id = $1`, [req.orgId]);
      const orgName = orgR.rows[0]?.display_name || 'Organization';
      const r = await pool.query(`SELECT * FROM org_ledger_approval_policies WHERE org_id = $1`, [req.orgId]);
      const p = r.rows[0] || {};
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
      const usd = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Ledger approval policy — ${esc(orgName)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; max-width: 640px; margin: 40px auto; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 24px; }
  dl { margin: 0; }
  dt { font-weight: 700; margin-top: 14px; }
  dd { margin: 2px 0 0 0; color: #333; }
</style>
</head><body>
  <h1>Ledger approval policy</h1>
  <div class="sub">${esc(orgName)} — generated ${esc(new Date().toISOString().slice(0, 10))}</div>
  <dl>
    <dt>Reviewer role</dt><dd>${esc(p.reviewer_role) || '—'}</dd>
    <dt>Review cadence</dt><dd>${esc(p.review_cadence) || '—'}</dd>
    <dt>Description</dt><dd>${esc(p.description) || '—'}</dd>
    <dt>Flagged-review dollar threshold</dt><dd>${usd(p.flagged_amount_threshold_cents ?? 500000)}</dd>
    <dt>Federal-award transactions</dt><dd>Require real-time sign-off from a user other than whoever created the entry, before posting (2 CFR 200.303).</dd>
    <dt>Last updated</dt><dd>${p.updated_at ? esc(new Date(p.updated_at).toISOString().slice(0, 10)) : 'never'}</dd>
  </dl>
</body></html>`;
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (e) {
      console.error('GET /ledger/approval-policy/export:', e.message);
      return res.status(500).json({ error: 'Could not export approval policy' });
    }
  });

  /**
   * Flagged-transaction review package (spec Section 5): a report, not a gate. Three
   * independent flags per transaction, any of which can apply: over the org's configured
   * dollar threshold, a payee never seen before in a prior transaction for this org, or a
   * manual entry (source='manual' -- every V1 transaction, since there's no other posting path
   * yet; the column exists so this stays meaningful once an import path is added later).
   */
  app.get('/api/organizational/orgs/:slug/ledger/flagged-review', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const policyR = await pool.query(`SELECT flagged_amount_threshold_cents FROM org_ledger_approval_policies WHERE org_id = $1`, [orgId]);
      const thresholdCents = policyR.rows[0] ? Number(policyR.rows[0].flagged_amount_threshold_cents) : 500000;

      const r = await pool.query(
        `WITH txn_totals AS (
           SELECT t.id, t.transaction_date, t.memo, t.payee, t.status, t.source, t.created_by,
                  SUM(l.debit_cents) AS total_debit_cents,
                  MIN(t.created_at) AS created_at
           FROM org_ledger_transactions t
           JOIN org_ledger_lines l ON l.transaction_id = t.id
           WHERE t.org_id = $1 AND t.status <> 'voided'
           GROUP BY t.id
         ),
         first_seen_payee AS (
           SELECT payee, MIN(id) AS first_transaction_id
           FROM org_ledger_transactions
           WHERE org_id = $1 AND payee IS NOT NULL AND payee <> ''
           GROUP BY payee
         )
         SELECT tt.id, tt.transaction_date, tt.memo, tt.payee, tt.status, tt.source,
                tt.total_debit_cents,
                (tt.total_debit_cents >= $2) AS flag_large_amount,
                (fsp.first_transaction_id = tt.id) AS flag_new_payee,
                (tt.source = 'manual') AS flag_manual_entry
         FROM txn_totals tt
         LEFT JOIN first_seen_payee fsp ON fsp.payee = tt.payee
         WHERE tt.total_debit_cents >= $2
            OR fsp.first_transaction_id = tt.id
            OR tt.source = 'manual'
         ORDER BY tt.transaction_date DESC, tt.id DESC
         LIMIT 500`,
        [orgId, thresholdCents]
      );

      return res.json({
        threshold_cents: String(thresholdCents),
        transactions: r.rows.map((row) => ({
          id: row.id,
          transaction_date: row.transaction_date,
          memo: row.memo,
          payee: row.payee,
          status: row.status,
          total_debit_cents: String(row.total_debit_cents),
          flags: {
            large_amount: !!row.flag_large_amount,
            new_payee: !!row.flag_new_payee,
            manual_entry: !!row.flag_manual_entry,
          },
        })),
      });
    } catch (e) {
      console.error('GET /ledger/flagged-review:', e.message);
      return res.status(500).json({ error: 'Could not load flagged-transaction review' });
    }
  });

  // ── Find & Recode: dynamic condition search + posted-ledger correcting journal ─────────────
  // Accounting-only tool (not Budget -- corrected 2026-09-16 after an earlier pass wrongly
  // included org_budget_lines). Search is a real condition builder (field + operator + value,
  // multiple conditions combined by All/Any), modeled on Xero's actual Find & Recode UI --
  // researched via screenshots and a detailed feature writeup, not guessed. See
  // lib/ledgerSearch.js (search/field-registry) and lib/findAndRecode.js (the correcting-
  // journal recode itself, "recode with a manual journal" mode only, matching this codebase's
  // existing bill/invoice edit-lock rule). Admin-gated throughout, since this creates real GL
  // entries and searches financial data across potentially many lines at once.
  app.get('/api/organizational/orgs/:slug/ledger/recode/field-options', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    try {
      const options = await loadFieldOptions(pool, req.orgId);
      return res.json(options);
    } catch (e) {
      console.error('GET /ledger/recode/field-options:', e.message);
      return res.status(500).json({ error: 'Could not load field options' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode/search', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const body = req.body || {};
    const validated = validateConditions(body.conditions, body.match_mode);
    if (validated.error) return res.status(400).json({ error: validated.error });
    try {
      const result = await searchLedgerLines(pool, orgId, validated.conditions, validated.matchMode);
      return res.json(result);
    } catch (e) {
      console.error('POST /ledger/recode/search:', e.message);
      return res.status(500).json({ error: 'Could not search ledger lines' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode/preview', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const body = req.body || {};
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (lineIds.length === 0) return res.status(400).json({ error: 'line_ids is required' });
    const changesRaw = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const changes = {};
    for (const f of ['account_id', 'program_id', 'grant_id']) {
      if (changesRaw[f] === undefined) continue;
      if (changesRaw[f] === null || changesRaw[f] === '') {
        changes[f] = null;
      } else {
        const n = Number.parseInt(String(changesRaw[f]), 10);
        if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: `changes.${f} must be a positive integer or null` });
        changes[f] = n;
      }
    }
    try {
      const preview = await previewLedgerRecode(pool, orgId, lineIds, changes);
      return res.json(preview);
    } catch (e) {
      console.error('POST /ledger/recode/preview:', e.message);
      return res.status(500).json({ error: 'Could not preview recode' });
    }
  });

  app.post('/api/organizational/orgs/:slug/ledger/recode', ...orgAuth, requireOrgRole('admin'), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (lineIds.length === 0) return res.status(400).json({ error: 'line_ids is required' });
    const transactionDate = body.transaction_date != null ? String(body.transaction_date) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(transactionDate)) return res.status(400).json({ error: 'transaction_date must be YYYY-MM-DD' });
    const changesRaw = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const changes = {};
    for (const f of ['account_id', 'program_id', 'grant_id']) {
      if (changesRaw[f] === undefined) continue;
      if (changesRaw[f] === null || changesRaw[f] === '') {
        changes[f] = null;
      } else {
        const n = Number.parseInt(String(changesRaw[f]), 10);
        if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: `changes.${f} must be a positive integer or null` });
        changes[f] = n;
      }
    }
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'changes must include at least one of account_id, program_id, grant_id' });

    try {
      const preview = await previewLedgerRecode(pool, orgId, lineIds, changes);
      if (preview.hasConflicts) {
        const error = preview.targetIsSystemAccount
          ? 'System accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims Payable) cannot be a recode target.'
          : 'Some selected lines are not posted, or nothing was found for the given selection.';
        return res.status(409).json({ error, code: 'recode_conflicts', ...preview });
      }
      const result = await executeLedgerRecode(pool, orgId, userId, lineIds, changes, transactionDate);
      if (result.httpStatus !== 201) return res.status(result.httpStatus).json(result.body);

      logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_ledger_lines', recordId: lineIds[0],
        fields: [{ fieldName: 'recode', oldValue: null, newValue: JSON.stringify(changes) }],
        metadata: { operation: 'recode', line_ids: lineIds, correcting_journal_id: result.body.id },
      }).catch(() => {});
      return res.status(201).json({ ok: true, correcting_journal_id: result.body.id, line_count: lineIds.length });
    } catch (e) {
      console.error('POST /ledger/recode:', e.message);
      return res.status(500).json({ error: 'Could not recode ledger lines' });
    }
  });
}

module.exports = { registerOrganizationalLedgerRoutes };
