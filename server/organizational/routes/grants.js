'use strict';

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { recalcGrantBudget } = require('../lib/grantRecalc');
const { syncGrantAllocationCarryforward } = require('../lib/grantCarryforward');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { extractGrantContractFields } = require('../lib/grantContractOcr');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const COOP_GRANT_STATUSES = new Set(['prospect', 'applied', 'awarded', 'declined', 'closed']);

function parseOptionalDate(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const d = new Date(String(raw).trim());
  if (Number.isNaN(d.getTime())) return { error: 'Invalid date' };
  return { value: d.toISOString().slice(0, 10) };
}

/** Dollars (number or string) to integer cents; null if absent. */
function parseAmountCents(body, allowNull = true) {
  if (body.amount_cents !== undefined && body.amount_cents !== null && body.amount_cents !== '') {
    const n = Number(body.amount_cents);
    if (!Number.isInteger(n) || n < 0) return { error: 'amount_cents must be a non-negative integer' };
    return { value: n };
  }
  if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== '') {
    const x = Number(body.amount);
    if (!Number.isFinite(x) || x < 0) return { error: 'amount must be a non-negative number' };
    return { value: Math.round(x * 100) };
  }
  if (allowNull) return { value: null };
  return { error: 'amount is required' };
}

/** Request amount (optional dollars or cents). */
function parseRequestAmountCents(body, allowNull = true) {
  if (body.request_amount_cents !== undefined && body.request_amount_cents !== null && body.request_amount_cents !== '') {
    const n = Number(body.request_amount_cents);
    if (!Number.isInteger(n) || n < 0) return { error: 'request_amount_cents must be a non-negative integer' };
    return { value: n };
  }
  if (body.request_amount !== undefined && body.request_amount !== null && String(body.request_amount).trim() !== '') {
    const x = Number(body.request_amount);
    if (!Number.isFinite(x) || x < 0) return { error: 'request_amount must be a non-negative number' };
    return { value: Math.round(x * 100) };
  }
  if (allowNull) return { value: null };
  return { error: 'request_amount is required' };
}

function parseFyAllocations(body) {
  if (body.fy_allocations === undefined) return { skip: true };
  if (body.fy_allocations === null) return { value: null };
  let raw = body.fy_allocations;
  if (typeof raw === 'string') {
    const t = String(raw).trim();
    if (!t) return { value: null };
    try {
      raw = JSON.parse(t);
    } catch {
      return { error: 'fy_allocations must be valid JSON object' };
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'fy_allocations must be a JSON object' };
  }
  return { value: raw };
}

function normalizeGrantCode(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

function fmtDateCol(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function rowToGrant(row) {
  if (!row) return null;
  const cents = row.amount_cents != null ? Number(row.amount_cents) : null;
  const reqCents = row.request_amount_cents != null ? Number(row.request_amount_cents) : null;
  return {
    id: row.id,
    org_id: row.org_id,
    grant_code: row.grant_code || null,
    funder_grant_id: row.funder_grant_id || null,
    funder: row.funder,
    name: row.name,
    amount_cents: cents,
    amount_dollars: cents == null ? null : Math.round(cents) / 100,
    request_amount_cents: reqCents,
    request_amount_dollars: reqCents == null ? null : Math.round(reqCents) / 100,
    forecast_amount_cents: row.forecast_amount_cents != null ? Number(row.forecast_amount_cents) : null,
    forecast_amount_dollars: row.forecast_amount_cents != null ? Math.round(Number(row.forecast_amount_cents)) / 100 : null,
    start_date: fmtDateCol(row.start_date),
    end_date: fmtDateCol(row.end_date),
    restrictions: row.restrictions,
    reporting_schedule: row.reporting_schedule,
    status: row.status,
    grant_type: row.grant_type || null,
    primary_program_id: row.primary_program_id != null ? Number(row.primary_program_id) : null,
    fy_allocations: row.fy_allocations || null,
    next_report_due: fmtDateCol(row.next_report_due),
    final_report_submitted: fmtDateCol(row.final_report_submitted),
    renewal_application_due: fmtDateCol(row.renewal_application_due),
    allocation_mode: row.allocation_mode || 'amount',
    allocated_cents: Number(row.allocated_cents) || 0,
    revenue_account_id: row.revenue_account_id != null ? Number(row.revenue_account_id) : null,
    constituent_id: row.constituent_id != null ? Number(row.constituent_id) : null,
    constituent_name: row.constituent_name || null,
    loi_submitted_at: fmtDateCol(row.loi_submitted_at),
    application_submitted_at: fmtDateCol(row.application_submitted_at),
    award_date: fmtDateCol(row.award_date),
    period_start_date: fmtDateCol(row.period_start_date),
    period_end_date: fmtDateCol(row.period_end_date),
    institution_type: row.institution_type || null,
    extra_data: row.extra_data && Object.keys(row.extra_data).length ? row.extra_data : null,
    is_federal_award: !!row.is_federal_award,
    federal_awarding_agency: row.federal_awarding_agency || null,
    aln: row.aln || null,
    pass_through_entity_name: row.pass_through_entity_name || null,
    pass_through_identifying_number: row.pass_through_identifying_number || null,
    amount_passed_to_subrecipients_cents: row.amount_passed_to_subrecipients_cents != null ? Number(row.amount_passed_to_subrecipients_cents) : null,
    indirect_cost_rate_type: row.indirect_cost_rate_type || 'none',
    indirect_cost_rate_bps: row.indirect_cost_rate_bps != null ? Number(row.indirect_cost_rate_bps) : null,
    indirect_cost_base: row.indirect_cost_base || 'mtdc',
    nicra_expiration_date: row.nicra_expiration_date != null ? fmtDateCol(row.nicra_expiration_date) : null,
    nicra_document_id: row.nicra_document_id != null ? Number(row.nicra_document_id) : null,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    document_count: row.document_count != null ? Number(row.document_count) : 0,
  };
}

function registerOrganizationalGrantRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/grants', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT
           g.id,
           g.org_id,
           g.grant_code,
           g.funder_grant_id,
           g.funder,
           g.name,
           g.amount_cents,
           g.request_amount_cents,
           g.start_date::text AS start_date,
           g.end_date::text AS end_date,
           g.restrictions,
           g.reporting_schedule,
           g.status,
           g.grant_type,
           g.primary_program_id,
           g.fy_allocations,
           g.next_report_due::text AS next_report_due,
           g.final_report_submitted::text AS final_report_submitted,
           g.renewal_application_due::text AS renewal_application_due,
           g.allocation_mode,
           g.revenue_account_id,
           g.constituent_id,
           c.display_name AS constituent_name,
           g.loi_submitted_at::text AS loi_submitted_at,
           g.application_submitted_at::text AS application_submitted_at,
           g.award_date::text AS award_date,
           g.period_start_date::text AS period_start_date,
           g.period_end_date::text AS period_end_date,
           g.institution_type,
           g.forecast_amount_cents,
           g.extra_data,
           g.notes,
           g.is_federal_award,
           g.federal_awarding_agency,
           g.aln,
           g.pass_through_entity_name,
           g.pass_through_identifying_number,
           g.amount_passed_to_subrecipients_cents,
           g.indirect_cost_rate_type,
           g.indirect_cost_rate_bps,
           g.indirect_cost_base,
           g.nicra_expiration_date::text AS nicra_expiration_date,
           g.nicra_document_id,
           g.created_at,
           g.updated_at,
           COALESCE((
             SELECT SUM(ga.amount_cents)
             FROM org_grant_allocations ga
             WHERE ga.grant_id = g.id
           ), 0) AS allocated_cents,
           (SELECT COUNT(*)::int FROM org_documents d WHERE d.grant_id = g.id AND d.archived_at IS NULL) AS document_count
         FROM org_grants g
         LEFT JOIN org_constituents c ON c.id = g.constituent_id
         WHERE g.org_id = $1
         ORDER BY g.start_date DESC NULLS LAST, g.id DESC`,
        [orgId]
      );
      const meta = await pool.query(
        `SELECT MAX(g2.updated_at) AS grants_last_updated_at
         FROM org_grants g2
         WHERE g2.org_id = $1`,
        [orgId]
      );
      return res.json({
        grants: r.rows.map(rowToGrant),
        grants_last_updated_at: meta.rows[0] && meta.rows[0].grants_last_updated_at,
      });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /api/organizational/orgs/:slug/grants:', e.message);
      return res.status(500).json({ error: 'Could not load grants' });
    }
  });

  /** Read-only contract OCR prefill -- posts nothing, creates no row. Mirrors expense-claims'
   * ocr-preview (server/organizational/lib/receiptOcr.js) exactly: pre-fills the New Grant
   * form, a human reviews/corrects everything before it's ever POSTed to org_grants. */
  app.post('/api/organizational/orgs/:slug/grants/ocr-preview', ...orgAuth, upload.single('file'), async (req, res) => {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Missing file field' });
    try {
      const { extracted, error } = await extractGrantContractFields(req.file.buffer, req.file.mimetype);
      return res.json({ extracted, error });
    } catch (e) {
      console.error('POST /grants/ocr-preview:', e.message);
      return res.status(500).json({ error: 'Could not scan this document' });
    }
  });

  app.post('/api/organizational/orgs/:slug/grants', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const name = String(body.name ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const funder = String(body.funder ?? '').trim();
    const grant_code = normalizeGrantCode(body.grant_code);
    const ac = parseAmountCents(body, true);
    if (ac.error) return res.status(400).json({ error: ac.error });
    const rac = parseRequestAmountCents(body, true);
    if (rac.error) return res.status(400).json({ error: rac.error });

    const grant_type =
      body.grant_type !== undefined && body.grant_type !== null
        ? String(body.grant_type).trim() || null
        : null;

    let primary_program_id = null;
    if (body.primary_program_id !== undefined && body.primary_program_id !== null && String(body.primary_program_id).trim() !== '') {
      const pid = Number.parseInt(String(body.primary_program_id), 10);
      if (!Number.isInteger(pid) || pid < 1) {
        return res.status(400).json({ error: 'primary_program_id must be a positive integer or null' });
      }
      primary_program_id = pid;
    }

    let revenue_account_id = null;
    if (body.revenue_account_id !== undefined && body.revenue_account_id !== null && String(body.revenue_account_id).trim() !== '') {
      const rid = Number.parseInt(String(body.revenue_account_id), 10);
      if (!Number.isInteger(rid) || rid < 1) {
        return res.status(400).json({ error: 'revenue_account_id must be a positive integer or null' });
      }
      revenue_account_id = rid;
    }

    let constituent_id = null;
    if (body.constituent_id !== undefined && body.constituent_id !== null && String(body.constituent_id).trim() !== '') {
      const cid = Number.parseInt(String(body.constituent_id), 10);
      if (!Number.isInteger(cid) || cid < 1) {
        return res.status(400).json({ error: 'constituent_id must be a positive integer or null' });
      }
      constituent_id = cid;
    }

    const loiDate = body.loi_submitted_at !== undefined && body.loi_submitted_at !== null && String(body.loi_submitted_at).trim() !== ''
      ? parseOptionalDate(body.loi_submitted_at) : { value: null };
    if (loiDate.error) return res.status(400).json({ error: loiDate.error });
    const appDate = body.application_submitted_at !== undefined && body.application_submitted_at !== null && String(body.application_submitted_at).trim() !== ''
      ? parseOptionalDate(body.application_submitted_at) : { value: null };
    if (appDate.error) return res.status(400).json({ error: appDate.error });
    const awardDate = body.award_date !== undefined && body.award_date !== null && String(body.award_date).trim() !== ''
      ? parseOptionalDate(body.award_date) : { value: null };
    if (awardDate.error) return res.status(400).json({ error: awardDate.error });
    const periodStart = body.period_start_date !== undefined && body.period_start_date !== null && String(body.period_start_date).trim() !== ''
      ? parseOptionalDate(body.period_start_date) : { value: null };
    if (periodStart.error) return res.status(400).json({ error: periodStart.error });
    const periodEnd = body.period_end_date !== undefined && body.period_end_date !== null && String(body.period_end_date).trim() !== ''
      ? parseOptionalDate(body.period_end_date) : { value: null };
    if (periodEnd.error) return res.status(400).json({ error: periodEnd.error });

    const fa = parseFyAllocations(body);
    if (fa.error) return res.status(400).json({ error: fa.error });
    const fyJson =
      fa.skip === true ? null : fa.value == null ? null : JSON.stringify(fa.value);

    const sd = parseOptionalDate(body.start_date);
    if (sd.error) return res.status(400).json({ error: sd.error });
    const ed = parseOptionalDate(body.end_date);
    if (ed.error) return res.status(400).json({ error: ed.error });

    const nrd =
      body.next_report_due !== undefined && body.next_report_due !== null && String(body.next_report_due).trim() !== ''
        ? parseOptionalDate(body.next_report_due)
        : { value: null };
    if (nrd.error) return res.status(400).json({ error: nrd.error });
    const frs =
      body.final_report_submitted !== undefined &&
      body.final_report_submitted !== null &&
      String(body.final_report_submitted).trim() !== ''
        ? parseOptionalDate(body.final_report_submitted)
        : { value: null };
    if (frs.error) return res.status(400).json({ error: frs.error });
    const rad =
      body.renewal_application_due !== undefined &&
      body.renewal_application_due !== null &&
      String(body.renewal_application_due).trim() !== ''
        ? parseOptionalDate(body.renewal_application_due)
        : { value: null };
    if (rad.error) return res.status(400).json({ error: rad.error });

    const status = String(body.status || 'applied').toLowerCase();
    if (!COOP_GRANT_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'status must be prospect, applied, awarded, declined, or closed',
      });
    }

    let reporting_schedule = null;
    if (body.reporting_schedule !== undefined && body.reporting_schedule !== null) {
      if (typeof body.reporting_schedule !== 'object' || Array.isArray(body.reporting_schedule)) {
        return res.status(400).json({ error: 'reporting_schedule must be a JSON object' });
      }
      reporting_schedule = body.reporting_schedule;
    }

    const restrictions =
      body.restrictions !== undefined && body.restrictions !== null
        ? String(body.restrictions).trim() || null
        : null;
    const notes =
      body.notes !== undefined && body.notes !== null ? String(body.notes).trim() || null : null;
    const funder_grant_id =
      body.funder_grant_id !== undefined && body.funder_grant_id !== null
        ? String(body.funder_grant_id).trim() || null
        : null;
    let extra_data_post = null;
    if (body.extra_data !== undefined && body.extra_data !== null && typeof body.extra_data === 'object' && !Array.isArray(body.extra_data)) {
      extra_data_post = body.extra_data;
    }
    const institution_type_post =
      body.institution_type !== undefined && body.institution_type !== null
        ? String(body.institution_type).trim() || null
        : null;
    let forecast_amount_cents_post = null;
    if (body.forecast_amount_cents !== undefined && body.forecast_amount_cents !== null && body.forecast_amount_cents !== '') {
      const n = Number(body.forecast_amount_cents);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'forecast_amount_cents must be a non-negative integer' });
      forecast_amount_cents_post = n;
    } else if (body.forecast_amount !== undefined && body.forecast_amount !== null && String(body.forecast_amount).trim() !== '') {
      const x = Number(body.forecast_amount);
      if (!Number.isFinite(x) || x < 0) return res.status(400).json({ error: 'forecast_amount must be a non-negative number' });
      forecast_amount_cents_post = Math.round(x * 100);
    }

    // is_federal_award gates the ledger's real-time second-approver requirement (2 CFR
    // 200.303) -- was previously unreachable from any create/update path, permanently false
    // for every grant regardless of the checkbox this same pass adds to the UI. SEFA fields
    // (2 CFR 200.510(b)) only mean anything once this can actually be set.
    const is_federal_award_post = body.is_federal_award === true || body.is_federal_award === 'true';
    const federal_awarding_agency_post =
      body.federal_awarding_agency !== undefined && body.federal_awarding_agency !== null
        ? String(body.federal_awarding_agency).trim() || null
        : null;
    const aln_post =
      body.aln !== undefined && body.aln !== null ? String(body.aln).trim() || null : null;
    const pass_through_entity_name_post =
      body.pass_through_entity_name !== undefined && body.pass_through_entity_name !== null
        ? String(body.pass_through_entity_name).trim() || null
        : null;
    const pass_through_identifying_number_post =
      body.pass_through_identifying_number !== undefined && body.pass_through_identifying_number !== null
        ? String(body.pass_through_identifying_number).trim() || null
        : null;
    let amount_passed_to_subrecipients_cents_post = null;
    if (body.amount_passed_to_subrecipients_cents !== undefined && body.amount_passed_to_subrecipients_cents !== null && body.amount_passed_to_subrecipients_cents !== '') {
      const n = Number(body.amount_passed_to_subrecipients_cents);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'amount_passed_to_subrecipients_cents must be a non-negative integer' });
      amount_passed_to_subrecipients_cents_post = n;
    }

    try {
      const orgId = req.orgId;

      if (primary_program_id != null) {
        const ok = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1', [
          primary_program_id,
          orgId,
        ]);
        if (ok.rows.length === 0) {
          return res.status(400).json({ error: 'primary_program_id not found for this organization' });
        }
      }

      // Auto-assign an internal code when none was given -- the field is display-only in the
      // UI (see grants.js's pfRow('grant_code', ...)), so this route is the only place a code
      // is ever produced for a single-create grant. Same G-### scheme and collision handling
      // as the bulk importer's auto-code path above; this route previously had no equivalent,
      // so a grant created here just kept grant_code permanently null (2026-09-17 fix).
      let final_grant_code = grant_code;
      if (!final_grant_code) {
        const autoRes = await pool.query(
          `SELECT MAX(CAST(SUBSTRING(grant_code FROM 3) AS INTEGER)) AS maxn FROM org_grants WHERE org_id = $1 AND grant_code ~ '^G-[0-9]+$'`,
          [orgId]
        );
        let nextNum = (autoRes.rows[0]?.maxn ?? 0) + 1;
        let candidate;
        do {
          candidate = 'G-' + String(nextNum++).padStart(3, '0');
          const exists = await pool.query('SELECT 1 FROM org_grants WHERE org_id = $1 AND grant_code = $2 LIMIT 1', [orgId, candidate]);
          if (exists.rows.length === 0) break;
        } while (true);
        final_grant_code = candidate;
      }

      const ins = await pool.query(
        `INSERT INTO org_grants (
          org_id, grant_code, funder_grant_id, funder, name,
          amount_cents, request_amount_cents,
          grant_type, primary_program_id, fy_allocations,
          start_date, end_date,
          next_report_due, final_report_submitted, renewal_application_due,
          restrictions, reporting_schedule, status, revenue_account_id,
          constituent_id,
          loi_submitted_at, application_submitted_at, award_date,
          period_start_date, period_end_date,
          extra_data, institution_type, forecast_amount_cents, notes,
          is_federal_award, federal_awarding_agency, aln,
          pass_through_entity_name, pass_through_identifying_number,
          amount_passed_to_subrecipients_cents
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10::jsonb,
          $11, $12,
          $13, $14, $15,
          $16, $17::jsonb, $18, $19,
          $20,
          $21, $22, $23,
          $24, $25,
          $26::jsonb, $27, $28, $29,
          $30, $31, $32,
          $33, $34,
          $35
        )
        RETURNING
          id,
          org_id,
          grant_code,
          funder_grant_id,
          funder,
          name,
          amount_cents,
          request_amount_cents,
          start_date::text AS start_date,
          end_date::text AS end_date,
          restrictions,
          reporting_schedule,
          status,
          grant_type,
          primary_program_id,
          fy_allocations,
          next_report_due::text AS next_report_due,
          final_report_submitted::text AS final_report_submitted,
          renewal_application_due::text AS renewal_application_due,
          revenue_account_id,
          constituent_id,
          loi_submitted_at::text AS loi_submitted_at,
          application_submitted_at::text AS application_submitted_at,
          award_date::text AS award_date,
          period_start_date::text AS period_start_date,
          period_end_date::text AS period_end_date,
          notes,
          is_federal_award,
          federal_awarding_agency,
          aln,
          pass_through_entity_name,
          pass_through_identifying_number,
          amount_passed_to_subrecipients_cents,
          created_at,
          updated_at`,
        [
          orgId,
          final_grant_code,
          funder_grant_id,
          funder,
          name,
          ac.value,
          rac.value,
          grant_type,
          primary_program_id,
          fyJson,
          sd.value,
          ed.value,
          nrd.value,
          frs.value,
          rad.value,
          restrictions,
          reporting_schedule != null ? JSON.stringify(reporting_schedule) : null,
          status,
          revenue_account_id,
          constituent_id,
          loiDate.value,
          appDate.value,
          awardDate.value,
          periodStart.value,
          periodEnd.value,
          extra_data_post != null ? JSON.stringify(extra_data_post) : '{}',
          institution_type_post,
          forecast_amount_cents_post,
          notes,
          is_federal_award_post,
          federal_awarding_agency_post,
          aln_post,
          pass_through_entity_name_post,
          pass_through_identifying_number_post,
          amount_passed_to_subrecipients_cents_post,
        ]
      );
      res.status(201).json({ grant: rowToGrant(ins.rows[0]) });
      // Fire-and-forget: fill any missing FY within the award period the
      // grant is already committed to (see grantCarryforward.js).
      syncGrantAllocationCarryforward(pool, orgId, ins.rows[0]).catch(e =>
        console.error('grantCarryforward after POST grant:', e.message)
      );
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'Grant code already in use for this organization' });
      }
      console.error('POST /api/organizational/orgs/:slug/grants:', e.message);
      return res.status(500).json({ error: 'Could not create grant' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/grants/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      const orgId = req.orgId;

      const existing = await pool.query(
        `SELECT
           g.id,
           g.org_id,
           g.grant_code,
           g.funder_grant_id,
           g.funder,
           g.name,
           g.amount_cents,
           g.request_amount_cents,
           g.start_date::text AS start_date,
           g.end_date::text AS end_date,
           g.restrictions,
           g.reporting_schedule,
           g.status,
           g.grant_type,
           g.primary_program_id,
           g.fy_allocations,
           g.next_report_due::text AS next_report_due,
           g.final_report_submitted::text AS final_report_submitted,
           g.renewal_application_due::text AS renewal_application_due,
           g.allocation_mode,
           g.revenue_account_id,
           g.constituent_id,
           g.loi_submitted_at::text AS loi_submitted_at,
           g.application_submitted_at::text AS application_submitted_at,
           g.award_date::text AS award_date,
           g.period_start_date::text AS period_start_date,
           g.period_end_date::text AS period_end_date,
           g.institution_type,
           g.forecast_amount_cents,
           g.extra_data,
           g.notes,
           g.is_federal_award,
           g.federal_awarding_agency,
           g.aln,
           g.pass_through_entity_name,
           g.pass_through_identifying_number,
           g.amount_passed_to_subrecipients_cents,
           g.created_at,
           g.updated_at
         FROM org_grants g
         WHERE g.id = $1 AND g.org_id = $2
         LIMIT 1`,
        [grantId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Grant not found' });
      }

      const cur = existing.rows[0];
      const next = { ...cur };

      if (body.name !== undefined) {
        const v = String(body.name ?? '').trim();
        if (!v) return res.status(400).json({ error: 'name cannot be empty' });
        next.name = v;
      }
      if (body.extra_data !== undefined && body.extra_data !== null && typeof body.extra_data === 'object' && !Array.isArray(body.extra_data)) {
        next.extra_data = { ...(cur.extra_data || {}), ...body.extra_data };
      }
      if (body.institution_type !== undefined) {
        next.institution_type = body.institution_type === null ? null : String(body.institution_type ?? '').trim() || null;
      }
      if (body.is_federal_award !== undefined) {
        next.is_federal_award = body.is_federal_award === true || body.is_federal_award === 'true';
      }
      if (body.federal_awarding_agency !== undefined) {
        next.federal_awarding_agency = body.federal_awarding_agency === null ? null : String(body.federal_awarding_agency ?? '').trim() || null;
      }
      if (body.aln !== undefined) {
        next.aln = body.aln === null ? null : String(body.aln ?? '').trim() || null;
      }
      if (body.pass_through_entity_name !== undefined) {
        next.pass_through_entity_name = body.pass_through_entity_name === null ? null : String(body.pass_through_entity_name ?? '').trim() || null;
      }
      if (body.pass_through_identifying_number !== undefined) {
        next.pass_through_identifying_number = body.pass_through_identifying_number === null ? null : String(body.pass_through_identifying_number ?? '').trim() || null;
      }
      if (body.amount_passed_to_subrecipients_cents !== undefined) {
        if (body.amount_passed_to_subrecipients_cents === null || body.amount_passed_to_subrecipients_cents === '') {
          next.amount_passed_to_subrecipients_cents = null;
        } else {
          const n = Number(body.amount_passed_to_subrecipients_cents);
          if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'amount_passed_to_subrecipients_cents must be a non-negative integer' });
          next.amount_passed_to_subrecipients_cents = n;
        }
      }
      if (body.forecast_amount !== undefined || body.forecast_amount_cents !== undefined) {
        if ((body.forecast_amount === null || body.forecast_amount === '') && (body.forecast_amount_cents === null || body.forecast_amount_cents === '')) {
          next.forecast_amount_cents = null;
        } else if (body.forecast_amount_cents !== undefined && body.forecast_amount_cents !== null && body.forecast_amount_cents !== '') {
          const n = Number(body.forecast_amount_cents);
          if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'forecast_amount_cents must be a non-negative integer' });
          next.forecast_amount_cents = n;
        } else if (body.forecast_amount !== undefined && body.forecast_amount !== null && String(body.forecast_amount).trim() !== '') {
          const x = Number(body.forecast_amount);
          if (!Number.isFinite(x) || x < 0) return res.status(400).json({ error: 'forecast_amount must be a non-negative number' });
          next.forecast_amount_cents = Math.round(x * 100);
        }
      }
      if (body.funder !== undefined) next.funder = String(body.funder ?? '').trim();
      if (body.funder_grant_id !== undefined) {
        next.funder_grant_id = body.funder_grant_id === null ? null : String(body.funder_grant_id).trim() || null;
      }
      if (body.grant_code !== undefined) {
        next.grant_code = normalizeGrantCode(body.grant_code);
      }
      if (body.amount !== undefined || body.amount_cents !== undefined) {
        const ac = parseAmountCents(
          {
            amount: body.amount !== undefined ? body.amount : undefined,
            amount_cents: body.amount_cents !== undefined ? body.amount_cents : undefined,
          },
          true
        );
        if (ac.error) return res.status(400).json({ error: ac.error });
        next.amount_cents = ac.value;
      }
      if (body.request_amount !== undefined || body.request_amount_cents !== undefined) {
        const rac = parseRequestAmountCents(
          {
            request_amount: body.request_amount !== undefined ? body.request_amount : undefined,
            request_amount_cents:
              body.request_amount_cents !== undefined ? body.request_amount_cents : undefined,
          },
          true
        );
        if (rac.error) return res.status(400).json({ error: rac.error });
        next.request_amount_cents = rac.value;
      }
      if (body.grant_type !== undefined) {
        next.grant_type =
          body.grant_type === null ? null : String(body.grant_type ?? '').trim() || null;
      }
      if (body.primary_program_id !== undefined) {
        if (body.primary_program_id === null || String(body.primary_program_id).trim() === '') {
          next.primary_program_id = null;
        } else {
          const pid = Number.parseInt(String(body.primary_program_id), 10);
          if (!Number.isInteger(pid) || pid < 1) {
            return res.status(400).json({ error: 'primary_program_id must be a positive integer or null' });
          }
          next.primary_program_id = pid;
        }
      }
      if (body.fy_allocations !== undefined) {
        const fa = parseFyAllocations(body);
        if (fa.error) return res.status(400).json({ error: fa.error });
        if (!fa.skip) {
          next.fy_allocations = fa.value;
        }
      }
      if (body.start_date !== undefined) {
        if (body.start_date === null || String(body.start_date).trim() === '') {
          next.start_date = null;
        } else {
          const sd = parseOptionalDate(body.start_date);
          if (sd.error) return res.status(400).json({ error: sd.error });
          next.start_date = sd.value;
        }
      }
      if (body.end_date !== undefined) {
        if (body.end_date === null || String(body.end_date).trim() === '') {
          next.end_date = null;
        } else {
          const ed = parseOptionalDate(body.end_date);
          if (ed.error) return res.status(400).json({ error: ed.error });
          next.end_date = ed.value;
        }
      }
      if (body.next_report_due !== undefined) {
        if (body.next_report_due === null || String(body.next_report_due).trim() === '') {
          next.next_report_due = null;
        } else {
          const d = parseOptionalDate(body.next_report_due);
          if (d.error) return res.status(400).json({ error: d.error });
          next.next_report_due = d.value;
        }
      }
      if (body.final_report_submitted !== undefined) {
        if (body.final_report_submitted === null || String(body.final_report_submitted).trim() === '') {
          next.final_report_submitted = null;
        } else {
          const d = parseOptionalDate(body.final_report_submitted);
          if (d.error) return res.status(400).json({ error: d.error });
          next.final_report_submitted = d.value;
        }
      }
      if (body.renewal_application_due !== undefined) {
        if (body.renewal_application_due === null || String(body.renewal_application_due).trim() === '') {
          next.renewal_application_due = null;
        } else {
          const d = parseOptionalDate(body.renewal_application_due);
          if (d.error) return res.status(400).json({ error: d.error });
          next.renewal_application_due = d.value;
        }
      }
      if (body.restrictions !== undefined) {
        next.restrictions =
          body.restrictions === null ? null : String(body.restrictions).trim() || null;
      }
      if (body.reporting_schedule !== undefined) {
        if (body.reporting_schedule === null) {
          next.reporting_schedule = null;
        } else if (typeof body.reporting_schedule === 'object' && !Array.isArray(body.reporting_schedule)) {
          next.reporting_schedule = body.reporting_schedule;
        } else {
          return res.status(400).json({ error: 'reporting_schedule must be a JSON object or null' });
        }
      }
      if (body.status !== undefined) {
        const st = String(body.status || '').toLowerCase();
        if (!COOP_GRANT_STATUSES.has(st)) {
          return res.status(400).json({
            error: 'status must be prospect, applied, awarded, declined, or closed',
          });
        }
        next.status = st;
      }
      if (body.allocation_mode !== undefined) {
        const m = String(body.allocation_mode || '').toLowerCase();
        if (m !== 'amount' && m !== 'percent') {
          return res.status(400).json({ error: 'allocation_mode must be amount or percent' });
        }
        next.allocation_mode = m;
      }
      if (body.notes !== undefined) {
        next.notes = body.notes === null ? null : String(body.notes).trim() || null;
      }
      if (body.revenue_account_id !== undefined) {
        if (body.revenue_account_id === null || String(body.revenue_account_id).trim() === '') {
          next.revenue_account_id = null;
        } else {
          const rid = Number.parseInt(String(body.revenue_account_id), 10);
          if (!Number.isInteger(rid) || rid < 1) {
            return res.status(400).json({ error: 'revenue_account_id must be a positive integer or null' });
          }
          next.revenue_account_id = rid;
        }
      }
      if (body.constituent_id !== undefined) {
        if (body.constituent_id === null || String(body.constituent_id).trim() === '') {
          next.constituent_id = null;
        } else {
          const cid = Number.parseInt(String(body.constituent_id), 10);
          if (!Number.isInteger(cid) || cid < 1) {
            return res.status(400).json({ error: 'constituent_id must be a positive integer or null' });
          }
          next.constituent_id = cid;
        }
      }
      for (const [bodyKey, nextKey] of [
        ['loi_submitted_at', 'loi_submitted_at'],
        ['application_submitted_at', 'application_submitted_at'],
        ['award_date', 'award_date'],
        ['period_start_date', 'period_start_date'],
        ['period_end_date', 'period_end_date'],
      ]) {
        if (body[bodyKey] !== undefined) {
          if (body[bodyKey] === null || String(body[bodyKey]).trim() === '') {
            next[nextKey] = null;
          } else {
            const d = parseOptionalDate(body[bodyKey]);
            if (d.error) return res.status(400).json({ error: d.error });
            next[nextKey] = d.value;
          }
        }
      }

      if (next.primary_program_id != null) {
        const ok = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1', [
          next.primary_program_id,
          orgId,
        ]);
        if (ok.rows.length === 0) {
          return res.status(400).json({ error: 'primary_program_id not found for this organization' });
        }
      }

      const rsJson =
        next.reporting_schedule != null ? JSON.stringify(next.reporting_schedule) : null;
      const fyStore = next.fy_allocations == null ? null : JSON.stringify(next.fy_allocations);

      const up = await pool.query(
        `UPDATE org_grants SET
          grant_code = $1,
          funder_grant_id = $2,
          funder = $3,
          name = $4,
          amount_cents = $5,
          request_amount_cents = $6,
          grant_type = $7,
          primary_program_id = $8,
          fy_allocations = $9::jsonb,
          start_date = $10,
          end_date = $11,
          next_report_due = $12,
          final_report_submitted = $13,
          renewal_application_due = $14,
          restrictions = $15,
          reporting_schedule = $16::jsonb,
          status = $17,
          allocation_mode = $18,
          revenue_account_id = $19,
          notes = $20,
          constituent_id = $21,
          loi_submitted_at = $22,
          application_submitted_at = $23,
          award_date = $24,
          period_start_date = $25,
          period_end_date = $26,
          institution_type = $30,
          forecast_amount_cents = $31,
          extra_data = $29::jsonb,
          is_federal_award = $32,
          federal_awarding_agency = $33,
          aln = $34,
          pass_through_entity_name = $35,
          pass_through_identifying_number = $36,
          amount_passed_to_subrecipients_cents = $37,
          updated_at = NOW()
        WHERE id = $27 AND org_id = $28
        RETURNING
          id,
          org_id,
          grant_code,
          funder_grant_id,
          funder,
          name,
          amount_cents,
          request_amount_cents,
          start_date::text AS start_date,
          end_date::text AS end_date,
          restrictions,
          reporting_schedule,
          status,
          grant_type,
          primary_program_id,
          fy_allocations,
          next_report_due::text AS next_report_due,
          final_report_submitted::text AS final_report_submitted,
          renewal_application_due::text AS renewal_application_due,
          allocation_mode,
          revenue_account_id,
          constituent_id,
          loi_submitted_at::text AS loi_submitted_at,
          application_submitted_at::text AS application_submitted_at,
          award_date::text AS award_date,
          period_start_date::text AS period_start_date,
          period_end_date::text AS period_end_date,
          institution_type,
          forecast_amount_cents,
          notes,
          is_federal_award,
          federal_awarding_agency,
          aln,
          pass_through_entity_name,
          pass_through_identifying_number,
          amount_passed_to_subrecipients_cents,
          created_at,
          updated_at`,
        [
          next.grant_code,
          next.funder_grant_id ?? null,
          next.funder,
          next.name,
          next.amount_cents,
          next.request_amount_cents,
          next.grant_type,
          next.primary_program_id,
          fyStore,
          next.start_date,
          next.end_date,
          next.next_report_due,
          next.final_report_submitted,
          next.renewal_application_due,
          next.restrictions,
          rsJson,
          next.status,
          next.allocation_mode || 'amount',
          next.revenue_account_id ?? null,
          next.notes,
          next.constituent_id ?? null,
          next.loi_submitted_at ?? null,
          next.application_submitted_at ?? null,
          next.award_date ?? null,
          next.period_start_date ?? null,
          next.period_end_date ?? null,
          grantId,
          orgId,
          JSON.stringify(next.extra_data || {}),
          next.institution_type ?? null,
          next.forecast_amount_cents ?? null,
          !!next.is_federal_award,
          next.federal_awarding_agency ?? null,
          next.aln ?? null,
          next.pass_through_entity_name ?? null,
          next.pass_through_identifying_number ?? null,
          next.amount_passed_to_subrecipients_cents ?? null,
        ]
      );

      // If revenue_account_id, status, or constituent_id changed, recalc budget lines for all FYs with allocations
      const revenueChanged    = next.revenue_account_id !== cur.revenue_account_id;
      const statusChanged     = next.status !== cur.status;
      const constituentChanged = next.constituent_id !== cur.constituent_id;
      if (revenueChanged || statusChanged || constituentChanged) {
        const fysRes = await pool.query(
          `SELECT DISTINCT fiscal_year FROM org_grant_allocations WHERE grant_id = $1`,
          [grantId]
        );
        for (const row of fysRes.rows) {
          await recalcGrantBudget(pool, orgId, row.fiscal_year).catch(e =>
            console.error('grantRecalc after PATCH:', e.message)
          );
        }
      }

      res.json({ grant: rowToGrant(up.rows[0]) });
      // Fire-and-forget: re-sync auto-filled FY allocations against the
      // grant's (possibly just-changed) award amount/period/program/status.
      syncGrantAllocationCarryforward(pool, orgId, up.rows[0]).catch(e =>
        console.error('grantCarryforward after PATCH grant:', e.message)
      );
      return;
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'Grant code already in use for this organization' });
      }
      console.error('PATCH /api/organizational/orgs/:slug/grants/:id:', e.message);
      return res.status(500).json({ error: 'Could not update grant' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/grants/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      // Capture affected FYs before delete so we can recalc after
      const fysRes = await pool.query(
        `SELECT DISTINCT fiscal_year FROM org_grant_allocations WHERE grant_id = $1`,
        [grantId]
      );
      const affectedFys = fysRes.rows.map(r => r.fiscal_year);

      const del = await pool.query('DELETE FROM org_grants WHERE id = $1 AND org_id = $2 RETURNING id', [
        grantId,
        orgId,
      ]);
      if (del.rowCount === 0) {
        return res.status(404).json({ error: 'Grant not found' });
      }
      for (const fy of affectedFys) {
        recalcGrantBudget(pool, orgId, fy).catch(e =>
          console.error('grantRecalc after DELETE grant:', e.message)
        );
      }
      return res.status(204).end();
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /api/organizational/orgs/:slug/grants/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete grant' });
    }
  });

  // --- INDIRECT COST RATE ELECTION (Accounting item #6, part 3) ---
  // Kept as its own sub-resource rather than threaded into the main POST/PATCH grant column
  // lists above, same reasoning as /grants/:grantId/allocations below: a distinct concern with
  // its own validation, edited far less often than the grant's core fields.
  app.patch('/api/organizational/orgs/:slug/grants/:id/indirect-cost-rate', ...orgAuth, async (req, res) => {
    const grantId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(grantId) || grantId < 1) return res.status(400).json({ error: 'invalid grant id' });
    const body = req.body || {};
    const orgId = req.orgId;

    const rateType = String(body.indirect_cost_rate_type || 'none').trim();
    if (!['none', 'de_minimis', 'negotiated'].includes(rateType)) {
      return res.status(400).json({ error: 'indirect_cost_rate_type must be none, de_minimis, or negotiated' });
    }
    let rateBps = null;
    if (rateType === 'de_minimis') {
      rateBps = Number.parseInt(String(body.indirect_cost_rate_bps), 10);
      if (![1000, 1500].includes(rateBps)) {
        return res.status(400).json({ error: 'de_minimis indirect_cost_rate_bps must be 1000 (10%, pre-Oct-2024 awards) or 1500 (15%, current 2 CFR 200 rate)' });
      }
    } else if (rateType === 'negotiated') {
      rateBps = Number.parseInt(String(body.indirect_cost_rate_bps), 10);
      if (!Number.isInteger(rateBps) || rateBps <= 0 || rateBps > 10000) {
        return res.status(400).json({ error: 'negotiated indirect_cost_rate_bps must be a positive integer up to 10000 (100%)' });
      }
    }
    const base = String(body.indirect_cost_base || 'mtdc').trim();
    if (!['mtdc', 'total_direct_costs', 'salaries_wages'].includes(base)) {
      return res.status(400).json({ error: 'indirect_cost_base must be mtdc, total_direct_costs, or salaries_wages' });
    }
    const nicraExpiration = body.nicra_expiration_date ? parseOptionalDate(body.nicra_expiration_date) : { value: null };
    if (nicraExpiration.error) return res.status(400).json({ error: nicraExpiration.error });
    let nicraDocumentId = null;
    if (body.nicra_document_id != null && body.nicra_document_id !== '') {
      nicraDocumentId = Number.parseInt(String(body.nicra_document_id), 10);
      if (!Number.isInteger(nicraDocumentId) || nicraDocumentId < 1) {
        return res.status(400).json({ error: 'nicra_document_id must be a positive integer if provided' });
      }
      const docR = await pool.query('SELECT 1 FROM org_documents WHERE id = $1 AND org_id = $2 LIMIT 1', [nicraDocumentId, orgId]);
      if (!docR.rows.length) return res.status(400).json({ error: 'nicra_document_id does not belong to this organization' });
    }

    try {
      const r = await pool.query(
        `UPDATE org_grants
         SET indirect_cost_rate_type = $1::org_indirect_cost_rate_type, indirect_cost_rate_bps = $2,
             indirect_cost_base = $3::org_indirect_cost_base, nicra_expiration_date = $4, nicra_document_id = $5
         WHERE id = $6 AND org_id = $7
         RETURNING id`,
        [rateType, rateBps, base, nicraExpiration.value, nicraDocumentId, grantId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Grant not found' });
      return res.json({ id: grantId });
    } catch (e) {
      console.error('PATCH /grants/:id/indirect-cost-rate:', e.message);
      return res.status(500).json({ error: 'Could not update indirect cost rate' });
    }
  });

  // Grant Allocations (multi-year)
  app.get('/api/organizational/orgs/:slug/grants/:grantId/allocations', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.grantId || ''), 10);
    const userId = req.user.user_id ?? req.user.id;

    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }

    try {
      const orgId = req.orgId;

      const r = await pool.query(
        `SELECT
           ga.id, ga.grant_id, ga.coop_program_id, ga.fiscal_year, ga.amount_cents, ga.notes, ga.created_at,
           p.name AS program_name
         FROM org_grant_allocations ga
         LEFT JOIN org_programs p ON p.id = ga.coop_program_id
         WHERE ga.grant_id = $1 AND ga.org_id = $2
         ORDER BY ga.fiscal_year DESC, p.name ASC`,
        [grantId, orgId]
      );

      res.json({ allocations: (r.rows || []).map(row => ({
        id: row.id,
        grant_id: row.grant_id,
        program_id: row.coop_program_id,
        program_name: row.program_name,
        fiscal_year: row.fiscal_year,
        amount_cents: Number(row.amount_cents),
        amount_dollars: Math.round(Number(row.amount_cents)) / 100,
        notes: row.notes,
        created_at: row.created_at,
      })) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /api/organizational/orgs/:slug/grants/:grantId/allocations:', e.message);
      return res.status(500).json({ error: 'Could not load allocations', allocations: [] });
    }
  });

  app.post('/api/organizational/orgs/:slug/grants/:grantId/allocations', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.grantId || ''), 10);
    const programId = Number.parseInt(String(req.body?.program_id || ''), 10);
    const fy = Number.parseInt(String(req.body?.fiscal_year || ''), 10);
    const userId = req.user.user_id ?? req.user.id;

    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'Invalid program id' });
    }
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'Invalid fiscal year' });
    }

    const amountParsed = parseAmountCents(req.body, false);
    if (amountParsed.error) return res.status(400).json({ error: amountParsed.error });

    try {
      const orgId = req.orgId;

      // Verify grant belongs to org (and fetch revenue_account_id for recalc)
      const gRes = await pool.query('SELECT id, revenue_account_id FROM org_grants WHERE id = $1 AND org_id = $2 LIMIT 1', [grantId, orgId]);
      if (!gRes.rows.length) return res.status(404).json({ error: 'Grant not found' });

      // Verify program belongs to org
      const pRes = await pool.query('SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1', [programId, orgId]);
      if (!pRes.rows.length) return res.status(404).json({ error: 'Program not found' });

      const notes = String(req.body?.notes || '').trim() || null;

      const r = await pool.query(
        `INSERT INTO org_grant_allocations (org_id, grant_id, coop_program_id, fiscal_year, amount_cents, notes, auto_generated)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)
         ON CONFLICT (grant_id, coop_program_id, fiscal_year) DO UPDATE SET amount_cents = $5, notes = $6, auto_generated = FALSE, updated_at = NOW()
         RETURNING id, grant_id, coop_program_id AS program_id, fiscal_year, amount_cents, notes, created_at`,
        [orgId, grantId, programId, fy, amountParsed.value, notes]
      );

      const row = r.rows[0];
      res.status(201).json({ allocation: {
        id: row.id,
        grant_id: row.grant_id,
        program_id: row.program_id,
        fiscal_year: row.fiscal_year,
        amount_cents: Number(row.amount_cents),
        amount_dollars: Math.round(Number(row.amount_cents)) / 100,
        notes: row.notes,
        created_at: row.created_at,
      } });
      if (gRes.rows[0].revenue_account_id) {
        recalcGrantBudget(pool, orgId, fy).catch(e =>
          console.error('grantRecalc after POST allocation:', e.message)
        );
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /api/organizational/orgs/:slug/grants/:grantId/allocations:', e.message);
      return res.status(500).json({ error: 'Could not create allocation' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/grants/:grantId/allocations/:allocId', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.grantId || ''), 10);
    const allocId = Number.parseInt(String(req.params.allocId || ''), 10);
    const userId = req.user.user_id ?? req.user.id;

    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }
    if (!Number.isInteger(allocId) || allocId < 1) {
      return res.status(400).json({ error: 'Invalid allocation id' });
    }

    const amountParsed = parseAmountCents(req.body, true);
    if (amountParsed.error) return res.status(400).json({ error: amountParsed.error });

    try {
      const orgId = req.orgId;

      const updates = [];
      const params = [orgId, allocId];
      let paramIdx = 3;

      if (amountParsed.value != null) {
        updates.push(`amount_cents = $${paramIdx++}`);
        params.push(amountParsed.value);
      }

      if (req.body?.notes !== undefined) {
        const notes = String(req.body.notes || '').trim() || null;
        updates.push(`notes = $${paramIdx++}`);
        params.push(notes);
      }

      if (!updates.length) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // A human editing this allocation directly claims it — the carryforward
      // engine will not overwrite or remove it again after this.
      updates.push(`auto_generated = FALSE`);
      updates.push(`updated_at = NOW()`);

      const r = await pool.query(
        `UPDATE org_grant_allocations
         SET ${updates.join(', ')}
         WHERE org_id = $1 AND id = $2
         RETURNING id, grant_id, coop_program_id AS program_id, fiscal_year, amount_cents, notes`,
        params
      );

      if (!r.rows.length) return res.status(404).json({ error: 'Allocation not found' });

      const row = r.rows[0];
      res.json({ allocation: {
        id: row.id,
        grant_id: row.grant_id,
        program_id: row.program_id,
        fiscal_year: row.fiscal_year,
        amount_cents: Number(row.amount_cents),
        amount_dollars: Math.round(Number(row.amount_cents)) / 100,
        notes: row.notes,
      } });
      // Fire-and-forget recalc if grant has a revenue account
      pool.query('SELECT revenue_account_id FROM org_grants WHERE id = $1 LIMIT 1', [grantId]).then(gr => {
        if (gr.rows[0]?.revenue_account_id) {
          recalcGrantBudget(pool, orgId, row.fiscal_year).catch(e =>
            console.error('grantRecalc after PATCH allocation:', e.message)
          );
        }
      }).catch(() => {});
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('PATCH /api/organizational/orgs/:slug/grants/:grantId/allocations/:allocId:', e.message);
      return res.status(500).json({ error: 'Could not update allocation' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/grants/:grantId/allocations/:allocId', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const grantId = Number.parseInt(String(req.params.grantId || ''), 10);
    const allocId = Number.parseInt(String(req.params.allocId || ''), 10);
    const userId = req.user.user_id ?? req.user.id;

    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).json({ error: 'Invalid grant id' });
    }
    if (!Number.isInteger(allocId) || allocId < 1) {
      return res.status(400).json({ error: 'Invalid allocation id' });
    }

    try {
      const orgId = req.orgId;

      const r = await pool.query(
        'DELETE FROM org_grant_allocations WHERE id = $1 AND grant_id = $2 AND org_id = $3 RETURNING id, fiscal_year',
        [allocId, grantId, orgId]
      );

      if (!r.rows.length) return res.status(404).json({ error: 'Allocation not found' });
      res.status(204).end();
      // Fire-and-forget recalc if grant has a revenue account
      pool.query('SELECT revenue_account_id FROM org_grants WHERE id = $1 LIMIT 1', [grantId]).then(gr => {
        if (gr.rows[0]?.revenue_account_id) {
          recalcGrantBudget(pool, orgId, r.rows[0].fiscal_year).catch(e =>
            console.error('grantRecalc after DELETE allocation:', e.message)
          );
        }
      }).catch(() => {});
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /api/organizational/orgs/:slug/grants/:grantId/allocations/:allocId:', e.message);
      return res.status(500).json({ error: 'Could not delete allocation' });
    }
  });
  // ── JSON batch import (used by auto-mapper with custom/extra_data fields) ──
  app.post('/api/organizational/orgs/:slug/import/grants/json', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const grants = Array.isArray(body.grants) ? body.grants : [];
    if (!grants.length) return res.status(400).json({ error: 'grants array is required' });

    try {
      const orgId = req.orgId;

      // Load program and grant code maps
      const progRes = await pool.query(`SELECT id, code FROM org_programs WHERE org_id = $1`, [orgId]);
      const programMap = new Map(progRes.rows.filter(r => r.code).map(r => [r.code.toLowerCase(), r.id]));
      const gcRes = await pool.query(`SELECT id, grant_code FROM org_grants WHERE org_id = $1 AND grant_code IS NOT NULL`, [orgId]);
      const grantCodeMap = new Map(gcRes.rows.map(r => [r.grant_code.toLowerCase(), r.id]));

      // Next auto-code number
      const autoRes = await pool.query(
        `SELECT MAX(CAST(SUBSTRING(grant_code FROM 3) AS INTEGER)) AS maxn FROM org_grants WHERE org_id = $1 AND grant_code ~ '^G-[0-9]+$'`,
        [orgId]
      );
      let nextNum = (autoRes.rows[0]?.maxn ?? 0) + 1;

      const STATUSES = new Set(['prospect', 'applied', 'awarded', 'declined', 'closed']);
      const client = await pool.connect();
      let inserted = 0, updated = 0;
      const errors = [];

      try {
        await client.query('BEGIN');
        for (let i = 0; i < grants.length; i++) {
          const g = grants[i];
          const rowNum = i + 1;
          const funder = String(g.funder ?? '').trim();
          const name   = String(g.grant_name ?? g.name ?? '').trim();
          const status = String(g.status ?? '').trim().toLowerCase();
          if (!funder) { errors.push({ row: rowNum, message: 'funder is required' }); continue; }
          if (!name)   { errors.push({ row: rowNum, message: 'grant_name is required' }); continue; }
          if (!STATUSES.has(status)) { errors.push({ row: rowNum, message: `status must be prospect/applied/awarded/declined/closed (got "${g.status}")` }); continue; }

          let grant_code = String(g.grant_code ?? '').trim() || null;
          if (!grant_code) {
            let candidate;
            do { candidate = 'G-' + String(nextNum++).padStart(3, '0'); } while (grantCodeMap.has(candidate.toLowerCase()));
            grant_code = candidate;
          }

          const amtCents = g.grant_amount != null ? Math.round(Number(g.grant_amount) * 100) || null : null;
          const reqCents = g.request_amount != null ? Math.round(Number(g.request_amount) * 100) || null : null;
          const fcCents  = g.forecast_amount != null ? Math.round(Number(g.forecast_amount) * 100) || null : null;

          const toDate = (v) => {
            if (!v) return null;
            const s = String(v).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const d = new Date(s);
            if (isNaN(d.getTime())) return null;
            return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          };

          const extraData = g.extra_data && typeof g.extra_data === 'object' ? g.extra_data : {};
          const existingId = grantCodeMap.get(grant_code.toLowerCase());

          if (existingId) {
            await client.query(
              `UPDATE org_grants SET funder=$1,funder_grant_id=$2,name=$3,status=$4,amount_cents=$5,request_amount_cents=$6,
               start_date=$7,end_date=$8,grant_type=$9,next_report_due=$10,final_report_submitted=$11,renewal_application_due=$12,
               loi_submitted_at=$13,application_submitted_at=$14,award_date=$15,period_start_date=$16,period_end_date=$17,
               restrictions=$18,notes=$19,extra_data=org_grants.extra_data||$20::jsonb,institution_type=$21,forecast_amount_cents=$22,updated_at=NOW()
               WHERE id=$23 AND org_id=$24`,
              [funder, g.funder_grant_id||null, name, status, amtCents, reqCents,
               toDate(g.start_date), toDate(g.end_date), g.type||null,
               toDate(g.next_report_due), toDate(g.final_report_submitted), toDate(g.renewal_application_due),
               toDate(g.loi_submitted_at), toDate(g.application_submitted_at), toDate(g.award_date),
               toDate(g.period_start_date), toDate(g.period_end_date),
               g.restrictions||null, g.notes||null, JSON.stringify(extraData),
               g.institution_type||null, fcCents, existingId, orgId]
            );
            updated++;
          } else {
            await client.query(
              `INSERT INTO org_grants (org_id,grant_code,funder_grant_id,funder,name,status,amount_cents,request_amount_cents,
               start_date,end_date,grant_type,next_report_due,final_report_submitted,renewal_application_due,
               loi_submitted_at,application_submitted_at,award_date,period_start_date,period_end_date,
               restrictions,notes,extra_data,institution_type,forecast_amount_cents)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24)`,
              [orgId, grant_code, g.funder_grant_id||null, funder, name, status, amtCents, reqCents,
               toDate(g.start_date), toDate(g.end_date), g.type||null,
               toDate(g.next_report_due), toDate(g.final_report_submitted), toDate(g.renewal_application_due),
               toDate(g.loi_submitted_at), toDate(g.application_submitted_at), toDate(g.award_date),
               toDate(g.period_start_date), toDate(g.period_end_date),
               g.restrictions||null, g.notes||null, JSON.stringify(extraData), g.institution_type||null, fcCents]
            );
            grantCodeMap.set(grant_code.toLowerCase(), true);
            inserted++;
          }
        }
        if (errors.length) { await client.query('ROLLBACK'); return res.status(400).json({ inserted: 0, updated: 0, errors }); }
        await client.query('COMMIT');
        return res.json({ inserted, updated, skipped: 0, errors: [] });
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST import/grants/json:', e.message);
      return res.status(500).json({ error: 'Import failed: ' + e.message });
    }
  });
}

module.exports = { registerOrganizationalGrantRoutes };
