'use strict';

// Sponsorship: project balances, fee rules and amendments, sponsorship settings, fee exemptions, and the Accounting fee run.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter, boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { requireWriteAccess, requireReadAccess } = require('../middleware/requireWriteAccess');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { validateRule, isoDate } = require('../lib/sponsorFees');
const { loadProjectBalance, loadSponsorSettings } = require('../lib/sponsorBalance');
const { previewFees, runFees, voidFeePosting } = require('../lib/sponsorFeePosting');
const { createRequest, reviewRequest, placeHold, liftHold, createRecall, postRecall, voidRecall } = require('../lib/sponsorMoneyOut');
const { leadMayTouch } = require('../middleware/requireWriteAccess');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireFiscalSponsor(pool) {
  return async function fiscalSponsorOnly(req, res, next) {
    try {
      const r = await pool.query('SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1', [req.orgId]);
      if (r.rows[0] && r.rows[0].fiscal_sponsorship_mode) return next();
      return res.status(403).json({ code: 'not_fiscal_sponsor', error: 'This workspace is not set up as a fiscal sponsor. Turn on fiscal sponsorship in Settings first.' });
    } catch (e) {
      console.error('requireFiscalSponsor:', e.message);
      return res.status(500).json({ error: 'Could not check the sponsorship setting' });
    }
  };
}

function posInt(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function uid(req) { return req.user.user_id ?? req.user.id; }

function ruleOut(r) {
  return {
    id: r.id, kind: r.kind, rate: r.rate != null ? Number(r.rate) : null, tiers: r.tiers || null,
    flat_cents: r.flat_cents != null ? Number(r.flat_cents) : null, minimum_quarter_cents: Number(r.minimum_quarter_cents || 0),
    effective_from: isoDate(r.effective_from), amendment_document_id: r.amendment_document_id, amendment_reason: r.amendment_reason || null,
    created_at: r.created_at,
  };
}

const SETTINGS_FIELDS = {
  default_fee_minimum_cents: 'cents',
  second_approval_threshold_cents: 'cents',
  overdue_report_hold_days: 'days',
  donor_letter_threshold_cents: 'cents',
  statement_day_of_month: 'day',
  fee_income_account_id: 'account',
  fee_expense_account_id: 'account',
  fee_income_program_id: 'program',
  recall_expense_account_id: 'account',
  recall_income_account_id: 'account',
  information_return_thresholds: 'years',
};

function settingsOut(s, orgId) {
  const d = s || { org_id: orgId };
  return {
    default_fee_minimum_cents: Number(d.default_fee_minimum_cents || 0),
    second_approval_threshold_cents: d.second_approval_threshold_cents != null ? Number(d.second_approval_threshold_cents) : 500000,
    overdue_report_hold_days: d.overdue_report_hold_days != null ? Number(d.overdue_report_hold_days) : 30,
    donor_letter_threshold_cents: d.donor_letter_threshold_cents != null ? Number(d.donor_letter_threshold_cents) : 500000,
    information_return_thresholds: d.information_return_thresholds || { 2026: 200000 },
    statement_day_of_month: d.statement_day_of_month != null ? Number(d.statement_day_of_month) : 5,
    fee_income_account_id: d.fee_income_account_id || null,
    fee_expense_account_id: d.fee_expense_account_id || null,
    fee_income_program_id: d.fee_income_program_id || null,
    recall_expense_account_id: d.recall_expense_account_id || null,
    recall_income_account_id: d.recall_income_account_id || null,
  };
}

function registerSponsorshipRoutes(app, pool) {
  const auth = requireAuth(pool);
  const base = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireFiscalSponsor(pool)];
  const read = [...base, requireReadAccess('sponsorship'), boardSeesAllPrograms];
  const moneyWrite = [...base, requireWriteAccess('finance')];
  const P = '/api/organizational/orgs/:slug';

  async function projectOr404(req, res) {
    const id = posInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid sponsored project ID' }); return null; }
    const r = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [id, req.orgId]);
    if (!r.rows.length) { res.status(404).json({ error: 'Sponsored project not found' }); return null; }
    return r.rows[0];
  }

  // Balance
  app.get(P + '/sponsored-projects/:id/balance', ...read, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const b = await loadProjectBalance(pool, req.orgId, project.id);
      const ov = await pool.query(
        `SELECT 'disbursement' AS kind, d.id, d.amount_cents, d.override_reason AS reason, d.override_at AS at, u.email AS by_email
           FROM org_sponsored_project_disbursements d LEFT JOIN users u ON u.id = d.override_by
          WHERE d.org_id = $1 AND d.sponsored_project_id = $2 AND d.override_reason IS NOT NULL
         UNION ALL
         SELECT 'request', r.id, r.amount_cents, r.override_reason, r.override_at, u.email
           FROM org_sponsor_payment_requests r LEFT JOIN users u ON u.id = r.override_by
          WHERE r.org_id = $1 AND r.sponsored_project_id = $2 AND r.override_reason IS NOT NULL AND r.disbursement_id IS NULL
          ORDER BY at DESC`, [req.orgId, project.id]);
      return res.json({
        project: { id: project.id, status: project.status, hold_reason: project.hold_reason, hold_kind: project.hold_kind, hold_set_at: project.hold_set_at },
        overrides: ov.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        balance: b.balance,
        fee_periods: b.feePeriods,
        fee_postings: b.feePostings.map((p) => ({ id: p.id, period_start: p.period_start, period_end: p.period_end, amount_cents: p.amount_cents, live: p.live, voided_at: p.voided_at, void_reason: p.void_reason, ledger_transaction_id: p.ledger_transaction_id })),
      });
    } catch (e) {
      console.error('GET .../sponsored-projects/:id/balance:', e.message);
      return res.status(500).json({ error: 'Could not load the project balance' });
    }
  });

  // Fee rules
  app.get(P + '/sponsored-projects/:id/fee-rules', ...read, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const r = await pool.query('SELECT * FROM org_sponsor_fee_rules WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY effective_from, id', [req.orgId, project.id]);
      return res.json({ rules: r.rows.map(ruleOut), locked: !!project.agreement_signed_at, agreement_signed_at: isoDate(project.agreement_signed_at) });
    } catch (e) {
      console.error('GET .../fee-rules:', e.message);
      return res.status(500).json({ error: 'Could not load the fee rule' });
    }
  });

  app.post(P + '/sponsored-projects/:id/fee-rules', ...moneyWrite, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const v = validateRule(body);
      if (v.error) return res.status(400).json({ error: v.error });
      const rules = (await pool.query('SELECT * FROM org_sponsor_fee_rules WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY effective_from DESC, id DESC', [req.orgId, project.id])).rows;
      const latest = rules[0] || null;
      const locked = !!project.agreement_signed_at;
      const userId = uid(req);

      if (!locked && latest) {
        const effective = body.effective_from ? String(body.effective_from) : isoDate(latest.effective_from);
        if (!DATE_RE.test(effective)) return res.status(400).json({ error: 'The effective date must be a date.' });
        if (rules[1] && effective <= isoDate(rules[1].effective_from)) return res.status(400).json({ error: 'The effective date must be after the previous rule\'s date.' });
        const u = await pool.query(
          `UPDATE org_sponsor_fee_rules SET kind = $1, rate = $2, tiers = $3, flat_cents = $4, minimum_quarter_cents = $5, effective_from = $6
            WHERE id = $7 AND org_id = $8 RETURNING *`,
          [v.rule.kind, v.rule.rate, v.rule.tiers ? JSON.stringify(v.rule.tiers) : null, v.rule.flat_cents, v.rule.minimum_quarter_cents, effective, latest.id, req.orgId]);
        const before = ruleOut(latest), after = ruleOut(u.rows[0]);
        const fields = ['kind', 'rate', 'flat_cents', 'minimum_quarter_cents', 'effective_from']
          .filter((k) => String(before[k]) !== String(after[k])).map((k) => ({ fieldName: 'fee ' + k, oldValue: before[k], newValue: after[k] }));
        if (JSON.stringify(before.tiers) !== JSON.stringify(after.tiers)) fields.push({ fieldName: 'fee tiers', oldValue: JSON.stringify(before.tiers), newValue: JSON.stringify(after.tiers) });
        if (fields.length) await logAudit(pool, { orgId: req.orgId, userId, action: 'update', tableName: 'org_sponsor_fee_rules', recordId: latest.id, fields, metadata: { ...reqMeta(req), sponsored_project_id: project.id } });
        return res.json({ rule: after });
      }

      let effective = body.effective_from ? String(body.effective_from) : null;
      let documentId = null;
      let reason = null;
      if (locked) {
        reason = String(body.reason || '').trim();
        documentId = posInt(body.amendment_document_id);
        if (!effective || !DATE_RE.test(effective)) return res.status(400).json({ error: 'The agreement is signed, so a fee change is an amendment. Enter the date the amendment takes effect.', code: 'amendment_date_required' });
        if (!documentId) return res.status(400).json({ error: 'The agreement is signed, so a fee change is an amendment. Attach the signed amendment document.', code: 'amendment_document_required' });
        if (!reason) return res.status(400).json({ error: 'Enter the reason for the amendment.', code: 'reason_required' });
        const doc = await pool.query('SELECT id FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [documentId, req.orgId, project.id]);
        if (!doc.rows.length) return res.status(400).json({ error: 'Attach the amendment to this project first, then choose it here.' });
        if (latest && effective <= isoDate(latest.effective_from)) return res.status(400).json({ error: 'An amendment must take effect after the current rule (from ' + isoDate(latest.effective_from) + ').' });
      } else {
        effective = effective || isoDate(project.start_date) || new Date().toISOString().slice(0, 10);
        if (!DATE_RE.test(effective)) return res.status(400).json({ error: 'The effective date must be a date.' });
      }
      const ins = await pool.query(
        `INSERT INTO org_sponsor_fee_rules
           (org_id, sponsored_project_id, kind, rate, tiers, flat_cents, minimum_quarter_cents, effective_from, amendment_document_id, amendment_reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [req.orgId, project.id, v.rule.kind, v.rule.rate, v.rule.tiers ? JSON.stringify(v.rule.tiers) : null, v.rule.flat_cents,
         v.rule.minimum_quarter_cents, effective, documentId, reason, userId]);
      await logAudit(pool, {
        orgId: req.orgId, userId, action: 'create', tableName: 'org_sponsor_fee_rules', recordId: ins.rows[0].id,
        metadata: { ...reqMeta(req), sponsored_project_id: project.id, amendment: locked, rule: ruleOut(ins.rows[0]), reason },
      });
      return res.status(201).json({ rule: ruleOut(ins.rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A fee rule already starts on that date. Choose another date.' });
      console.error('POST .../fee-rules:', e.message);
      return res.status(500).json({ error: 'Could not save the fee rule' });
    }
  });

  // Fee exemption on a gift (for funders that cap overhead)
  app.patch(P + '/sponsored-projects/:id/gifts/:giftId/fee-exempt', ...moneyWrite, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const giftId = posInt(req.params.giftId);
    if (!giftId) return res.status(400).json({ error: 'Invalid gift ID' });
    const exempt = !!body.exempt;
    const reason = String(body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Enter the reason (for example, the funder caps overhead).', code: 'reason_required' });
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const g = await pool.query('SELECT id, sponsor_fee_exempt FROM org_gifts WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [giftId, req.orgId, project.id]);
      if (!g.rows.length) return res.status(404).json({ error: 'That gift is not tagged to this project.' });
      await pool.query('UPDATE org_gifts SET sponsor_fee_exempt = $1, sponsor_fee_exempt_reason = $2 WHERE id = $3 AND org_id = $4', [exempt, reason, giftId, req.orgId]);
      await logAudit(pool, {
        orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'fee exempt', oldValue: g.rows[0].sponsor_fee_exempt ? 'yes' : 'no', newValue: exempt ? 'yes' : 'no' }],
        metadata: { ...reqMeta(req), reason, sponsored_project_id: project.id },
      });
      return res.json({ id: giftId, sponsor_fee_exempt: exempt });
    } catch (e) {
      console.error('PATCH .../fee-exempt:', e.message);
      return res.status(500).json({ error: 'Could not change the fee exemption' });
    }
  });

  // Sponsorship settings
  app.get(P + '/sponsor-settings', ...read, async (req, res) => {
    try {
      return res.json({ settings: settingsOut(await loadSponsorSettings(pool, req.orgId), req.orgId) });
    } catch (e) {
      console.error('GET /sponsor-settings:', e.message);
      return res.status(500).json({ error: 'Could not load sponsorship settings' });
    }
  });

  app.put(P + '/sponsor-settings', ...moneyWrite, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const current = settingsOut(await loadSponsorSettings(pool, req.orgId), req.orgId);
      const next = { ...current };
      for (const [key, type] of Object.entries(SETTINGS_FIELDS)) {
        if (body[key] === undefined) continue;
        const v = body[key];
        if (type === 'cents' || type === 'days') {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: key.replace(/_/g, ' ') + ' must be zero or more.' });
          next[key] = n;
        } else if (type === 'day') {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 28) return res.status(400).json({ error: 'The statement day must be between 1 and 28.' });
          next[key] = n;
        } else if (type === 'account' || type === 'program') {
          if (v === null || v === '') { next[key] = null; continue; }
          const id = posInt(v);
          if (!id) return res.status(400).json({ error: 'Choose an account or program from the list.' });
          if (type === 'account') {
            const want = /income/.test(key) ? 'income' : 'expense';
            const a = await pool.query('SELECT type::text AS type, is_posting FROM org_accounts WHERE id = $1 AND org_id = $2', [id, req.orgId]);
            if (!a.rows.length || !a.rows[0].is_posting || a.rows[0].type !== want) {
              return res.status(400).json({ error: want === 'income' ? 'Choose an income account here.' : 'Choose an expense account here.' });
            }
          } else {
            const p = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2', [id, req.orgId]);
            if (!p.rows.length) return res.status(400).json({ error: 'Choose a program from this workspace.' });
          }
          next[key] = id;
        } else if (type === 'years') {
          if (!v || typeof v !== 'object' || Array.isArray(v)) return res.status(400).json({ error: 'Enter a threshold for each year.' });
          const clean = {};
          for (const [y, c] of Object.entries(v)) {
            const n = Number(c);
            if (!/^\d{4}$/.test(y) || !Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Each year needs a threshold of zero or more.' });
            clean[y] = n;
          }
          next[key] = clean;
        }
      }
      await pool.query(
        `INSERT INTO org_sponsor_settings (org_id, default_fee_minimum_cents, second_approval_threshold_cents, overdue_report_hold_days,
            donor_letter_threshold_cents, information_return_thresholds, statement_day_of_month, fee_income_account_id, fee_expense_account_id, fee_income_program_id,
            recall_expense_account_id, recall_income_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (org_id) DO UPDATE SET
           default_fee_minimum_cents = EXCLUDED.default_fee_minimum_cents, second_approval_threshold_cents = EXCLUDED.second_approval_threshold_cents,
           overdue_report_hold_days = EXCLUDED.overdue_report_hold_days, donor_letter_threshold_cents = EXCLUDED.donor_letter_threshold_cents,
           information_return_thresholds = EXCLUDED.information_return_thresholds, statement_day_of_month = EXCLUDED.statement_day_of_month,
           fee_income_account_id = EXCLUDED.fee_income_account_id, fee_expense_account_id = EXCLUDED.fee_expense_account_id,
           fee_income_program_id = EXCLUDED.fee_income_program_id, recall_expense_account_id = EXCLUDED.recall_expense_account_id,
           recall_income_account_id = EXCLUDED.recall_income_account_id, updated_at = now()`,
        [req.orgId, next.default_fee_minimum_cents, next.second_approval_threshold_cents, next.overdue_report_hold_days, next.donor_letter_threshold_cents,
         JSON.stringify(next.information_return_thresholds), next.statement_day_of_month, next.fee_income_account_id, next.fee_expense_account_id, next.fee_income_program_id,
         next.recall_expense_account_id, next.recall_income_account_id]);
      const fields = Object.keys(SETTINGS_FIELDS)
        .filter((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]))
        .map((k) => ({ fieldName: k, oldValue: typeof current[k] === 'object' ? JSON.stringify(current[k]) : current[k], newValue: typeof next[k] === 'object' ? JSON.stringify(next[k]) : next[k] }));
      if (fields.length) await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_sponsor_settings', recordId: req.orgId, fields, metadata: reqMeta(req) });
      return res.json({ settings: next });
    } catch (e) {
      console.error('PUT /sponsor-settings:', e.message);
      return res.status(500).json({ error: 'Could not save sponsorship settings' });
    }
  });

  // Payment requests (staff entry)
  app.get(P + '/sponsored-projects/:id/payment-requests', ...read, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const r = await pool.query(
        `SELECT r.id, r.payee_constituent_id, c.display_name AS payee_name, r.amount_cents, r.purpose, r.method, r.document_id, r.budget_line, r.needed_by,
                r.status, r.created_at, r.reviewed_at, r.decision_reason, r.override_reason, r.disbursement_id, r.requester_link_ref IS NOT NULL AS from_lead_link,
                cu.email AS created_by_email, ru.email AS reviewer_email
           FROM org_sponsor_payment_requests r
           LEFT JOIN org_constituents c ON c.id = r.payee_constituent_id
           LEFT JOIN users cu ON cu.id = r.created_by
           LEFT JOIN users ru ON ru.id = r.reviewer_id
          WHERE r.org_id = $1 AND r.sponsored_project_id = $2 ORDER BY r.created_at DESC, r.id DESC`, [req.orgId, project.id]);
      return res.json({ requests: r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })) });
    } catch (e) {
      console.error('GET .../payment-requests:', e.message);
      return res.status(500).json({ error: 'Could not load payment requests' });
    }
  });

  app.post(P + '/sponsored-projects/:id/payment-requests', ...base, requireWriteAccess('sponsorship'), async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      if (!leadMayTouch(req, [project.program_id])) {
        return res.status(403).json({ code: 'program_scope', error: 'Program leads can enter a request only for a project under their own programs.' });
      }
      const out = await createRequest(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, input: req.body || {} });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST .../payment-requests:', e.message);
      return res.status(500).json({ error: 'Could not save the payment request' });
    }
  });

  app.post(P + '/sponsored-projects/:id/payment-requests/:requestId/review', ...moneyWrite, async (req, res) => {
    const requestId = posInt(req.params.requestId);
    if (!requestId) return res.status(400).json({ error: 'Invalid request ID' });
    const body = req.body || {};
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const out = await reviewRequest(pool, {
        orgId: req.orgId, userId: uid(req), role: req.coopOrgRole, projectId: project.id, requestId,
        action: String(body.action || ''), reason: body.reason, override: body.override ? { requested: true, reason: body.override_reason } : null,
      });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST .../payment-requests/:id/review:', e.message);
      return res.status(500).json({ error: 'Could not save the decision' });
    }
  });

  // Holds
  app.post(P + '/sponsored-projects/:id/hold', ...moneyWrite, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const out = await placeHold(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, reason: req.body && req.body.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST .../hold:', e.message);
      return res.status(500).json({ error: 'Could not put the project on hold' });
    }
  });

  app.post(P + '/sponsored-projects/:id/lift-hold', ...moneyWrite, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const out = await liftHold(pool, { orgId: req.orgId, userId: uid(req), role: req.coopOrgRole, projectId: project.id, reason: req.body && req.body.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST .../lift-hold:', e.message);
      return res.status(500).json({ error: 'Could not lift the hold' });
    }
  });

  // Recalls
  app.get(P + '/sponsored-projects/:id/recalls', ...read, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const r = await pool.query(
        `SELECT id, amount_cents, recall_date::text AS recall_date, reason, status, ledger_transaction_id, void_reason, created_at
           FROM org_sponsor_recalls WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY recall_date DESC, id DESC`, [req.orgId, project.id]);
      return res.json({ recalls: r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })) });
    } catch (e) {
      console.error('GET .../recalls:', e.message);
      return res.status(500).json({ error: 'Could not load recalls' });
    }
  });

  app.post(P + '/sponsored-projects/:id/recalls', ...moneyWrite, async (req, res) => {
    try {
      const project = await projectOr404(req, res);
      if (!project) return;
      const out = await createRecall(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, input: req.body || {} });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST .../recalls:', e.message);
      return res.status(500).json({ error: 'Could not record the recall' });
    }
  });

  // Accounting: fee run
  const acctRead = [...base, requireAccountingAccess(pool, 'accounting_read')];
  const acctWrite = [...base, requireWriteAccess('finance'), requireAccountingWriter(pool)];

  app.post(P + '/sponsor-recalls/:recallId/post', ...acctWrite, async (req, res) => {
    const recallId = posInt(req.params.recallId);
    if (!recallId) return res.status(400).json({ error: 'Invalid recall ID' });
    try {
      const out = await postRecall(pool, { orgId: req.orgId, userId: uid(req), recallId, postingDate: req.body && req.body.posting_date ? String(req.body.posting_date) : null });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /sponsor-recalls/:id/post:', e.message);
      return res.status(500).json({ error: 'Could not post the recall' });
    }
  });

  app.post(P + '/sponsor-recalls/:recallId/void', ...acctWrite, async (req, res) => {
    const recallId = posInt(req.params.recallId);
    if (!recallId) return res.status(400).json({ error: 'Invalid recall ID' });
    try {
      const out = await voidRecall(pool, { orgId: req.orgId, userId: uid(req), recallId, reason: req.body && req.body.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /sponsor-recalls/:id/void:', e.message);
      return res.status(500).json({ error: 'Could not cancel the recall' });
    }
  });

  app.get(P + '/sponsor-fees/preview', ...acctRead, async (req, res) => {
    const through = req.query.through_date != null ? String(req.query.through_date) : '';
    if (!DATE_RE.test(through)) return res.status(400).json({ error: 'Choose the date to run fees through.' });
    try {
      return res.json(await previewFees(pool, req.orgId, through));
    } catch (e) {
      console.error('GET /sponsor-fees/preview:', e.message);
      return res.status(500).json({ error: 'Could not work out the fees due' });
    }
  });

  app.post(P + '/sponsor-fees/run', ...acctWrite, async (req, res) => {
    try {
      const out = await runFees(pool, { orgId: req.orgId, userId: uid(req), throughDate: req.body && req.body.through_date != null ? String(req.body.through_date) : null });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /sponsor-fees/run:', e.message);
      return res.status(500).json({ error: 'Could not run fees' });
    }
  });

  app.get(P + '/sponsor-fees/postings', ...acctRead, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT f.id, f.sponsored_project_id, p.name AS project_name, f.period_start::text AS period_start, f.period_end::text AS period_end,
                f.amount_cents, f.ledger_transaction_id, f.voided_at, f.void_reason, t.status AS ledger_status
           FROM org_sponsor_fee_postings f
           JOIN org_sponsored_projects p ON p.id = f.sponsored_project_id
           LEFT JOIN org_ledger_transactions t ON t.id = f.ledger_transaction_id
          WHERE f.org_id = $1 ORDER BY f.period_end DESC, f.id DESC LIMIT 200`, [req.orgId]);
      return res.json({ postings: r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), live: !x.voided_at && x.ledger_status === 'posted' })) });
    } catch (e) {
      console.error('GET /sponsor-fees/postings:', e.message);
      return res.status(500).json({ error: 'Could not load fee entries' });
    }
  });

  app.post(P + '/sponsor-fees/postings/:postingId/void', ...acctWrite, async (req, res) => {
    const postingId = posInt(req.params.postingId);
    if (!postingId) return res.status(400).json({ error: 'Invalid fee entry ID' });
    try {
      const out = await voidFeePosting(pool, { orgId: req.orgId, userId: uid(req), postingId, reason: req.body && req.body.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /sponsor-fees/postings/:id/void:', e.message);
      return res.status(500).json({ error: 'Could not reverse the fee entry' });
    }
  });
}

module.exports = { registerSponsorshipRoutes, requireFiscalSponsor };
