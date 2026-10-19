'use strict';

// Sponsorship overview: one row per project for the Projects grid (held, available, fee, next report, flags), the four
// numbers at the top of the Sponsorship screen, the workspace money-out queue, and a project's history from the audit log.

const { loadProjectBalances } = require('./sponsorBalance');
const { heldCents } = require('./sponsorStatements');
const { feesDue, isoDate } = require('./sponsorFees');
const { calendar } = require('./sponsorReports');
const { loadStandings } = require('./sponsorStanding');

const AGREEMENT_STATUSES = ['accepted', 'active', 'on_hold', 'winding_down'];
const STANDING_STATUSES = ['active', 'on_hold', 'winding_down', 'lapsed'];

function needsAgreement(project) {
  return !project.agreement_signed_at && AGREEMENT_STATUSES.includes(project.status);
}

// facts: { project, balance, reports (this project's calendar rows), standing }
function projectFlags(facts) {
  const reports = facts.reports || [];
  return {
    hold: facts.project.status === 'on_hold',
    negative: !!(facts.balance && facts.balance.negative),
    agreement_missing: needsAgreement(facts.project),
    report_overdue: reports.some((r) => r.status === 'overdue'),
    good_standing: facts.standing ? facts.standing.good : null,
  };
}

function needsAttention(flags) {
  return !!(flags.hold || flags.negative || flags.agreement_missing || flags.report_overdue);
}

function feeOut(rule, project, defaultRate) {
  if (rule) {
    return {
      kind: rule.kind, rate: rule.rate != null ? Number(rule.rate) : null, flat_cents: rule.flat_cents != null ? Number(rule.flat_cents) : null,
      minimum_quarter_cents: Number(rule.minimum_quarter_cents || 0), from_rule: true,
    };
  }
  const rate = project.admin_rate != null ? project.admin_rate : defaultRate;
  return { kind: 'percent', rate: rate != null ? Number(rate) : null, flat_cents: null, minimum_quarter_cents: 0, from_rule: false };
}

function totalsOf(rows) {
  return {
    held_cents: rows.reduce((s, r) => s + r.held_cents, 0),
    available_cents: rows.reduce((s, r) => s + r.available_cents, 0),
    fees_due_cents: rows.reduce((s, r) => s + r.fees_due_cents, 0),
    attention_count: rows.filter((r) => r.attention).length,
    project_count: rows.length,
  };
}

async function loadOverview(pool, orgId, opts) {
  const today = isoDate((opts && opts.today) || new Date());
  const pr = await pool.query(
    `SELECT p.id, p.name, p.status, p.sponsorship_model::text AS sponsorship_model, p.admin_rate, p.agreement_signed_at, p.program_id,
            p.lead_constituent_id, c.display_name AS lead_name, p.contact_lead_name, p.start_date::text AS start_date, p.end_date::text AS end_date,
            s.sponsorship_model::text AS default_model, s.default_admin_rate
       FROM org_sponsored_projects p
       LEFT JOIN org_constituents c ON c.id = p.lead_constituent_id
       LEFT JOIN org_settings s ON s.org_id = p.sponsor_org_id
      WHERE p.sponsor_org_id = $1
      ORDER BY lower(p.name), p.id`, [orgId]);
  const ids = pr.rows.map((p) => Number(p.id));
  if (!ids.length) return { today, totals: totalsOf([]), projects: [] };
  const [balances, reports, rules] = await Promise.all([
    loadProjectBalances(pool, orgId, ids, { asOf: today }),
    calendar(pool, orgId, { today }),
    pool.query(
      `SELECT DISTINCT ON (sponsored_project_id) sponsored_project_id, kind, rate, flat_cents, minimum_quarter_cents
         FROM org_sponsor_fee_rules WHERE org_id = $1 AND effective_from <= $2::date
        ORDER BY sponsored_project_id, effective_from DESC, id DESC`, [orgId, today]),
  ]);
  const standingIds = pr.rows.filter((p) => STANDING_STATUSES.includes(p.status)).map((p) => Number(p.id));
  const standings = await loadStandings(pool, orgId, standingIds, { today, balances });
  const ruleBy = new Map(rules.rows.map((r) => [Number(r.sponsored_project_id), r]));

  const projects = pr.rows.map((p) => {
    const pid = Number(p.id);
    const bal = balances.get(pid);
    const b = bal ? bal.balance : null;
    const own = reports.filter((r) => r.source === 'sponsorship' && Number(r.sponsored_project_id) === pid && !r.received_at);
    const next = own[0] || null;
    const flags = projectFlags({ project: p, balance: b, reports: own, standing: standings.get(pid) || null });
    const due = bal ? feesDue(bal.feePeriods, bal.feePostings.filter((x) => x.live), today) : [];
    return {
      id: pid, name: p.name, status: p.status, model: p.sponsorship_model || p.default_model || null, model_is_default: !p.sponsorship_model,
      lead_name: p.lead_name || p.contact_lead_name || null, program_id: p.program_id,
      held_cents: b ? heldCents(b) : 0, available_cents: b ? b.available_cents : 0, pending_cents: b ? b.pending_cents : 0,
      fees_due_cents: due.reduce((s, d) => s + d.due_cents, 0),
      fee: feeOut(ruleBy.get(pid), p, p.default_admin_rate),
      next_report_due: next ? next.due_date : null, next_report_status: next ? next.status : null,
      flags, attention: needsAttention(flags),
    };
  });
  return { today, totals: totalsOf(projects), projects };
}

// Everything waiting on the way out of project funds, across the workspace.
async function loadMoneyOut(pool, orgId) {
  const [requests, disbursements, recalls, closings] = await Promise.all([
    pool.query(
      `SELECT r.id, r.sponsored_project_id, p.name AS project_name, r.amount_cents, r.purpose, r.method, r.status, r.needed_by::text AS needed_by,
              r.created_at, c.display_name AS payee_name
         FROM org_sponsor_payment_requests r JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
         LEFT JOIN org_constituents c ON c.id = r.payee_constituent_id
        WHERE r.org_id = $1 AND r.status IN ('submitted', 'in_review', 'needs_info')
        ORDER BY r.created_at, r.id`, [orgId]),
    pool.query(
      `SELECT d.id, d.sponsored_project_id, p.name AS project_name, d.amount_cents, d.disbursement_date::text AS disbursement_date, d.status,
              d.ledger_transaction_id IS NOT NULL AS posted, d.notes
         FROM org_sponsored_project_disbursements d JOIN org_sponsored_projects p ON p.id = d.sponsored_project_id
        WHERE d.org_id = $1 AND (d.status = 'pending_approval' OR (d.status = 'approved' AND d.ledger_transaction_id IS NULL))
        ORDER BY d.disbursement_date, d.id`, [orgId]),
    pool.query(
      `SELECT r.id, r.sponsored_project_id, p.name AS project_name, r.amount_cents, r.recall_date::text AS recall_date, r.reason, r.status
         FROM org_sponsor_recalls r JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
        WHERE r.org_id = $1 AND (r.status = 'pending' OR r.recall_date >= CURRENT_DATE - 90)
        ORDER BY r.recall_date DESC, r.id DESC`, [orgId]),
    pool.query(
      `SELECT c.id, c.sponsored_project_id, p.name AS project_name, c.amount_cents, c.closing_date::text AS closing_date, c.status
         FROM org_sponsor_closings c JOIN org_sponsored_projects p ON p.id = c.sponsored_project_id
        WHERE c.org_id = $1 AND c.status = 'pending'
        ORDER BY c.closing_date, c.id`, [orgId]),
  ]);
  const num = (rows) => rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  return { requests: num(requests.rows), disbursements: num(disbursements.rows), recalls: num(recalls.rows), closings: num(closings.rows) };
}

const CHILD_TABLES = [
  'org_sponsor_payment_requests', 'org_sponsored_project_disbursements', 'org_sponsor_recalls', 'org_sponsor_closings', 'org_sponsor_fee_rules',
  'org_sponsor_agreements', 'org_sponsor_reports', 'org_sponsor_approvals', 'org_sponsor_acknowledgments', 'org_sponsor_statements',
];

// Audit log entries about one project: the project row, rows that belong to it, and entries that name it.
async function loadHistory(pool, orgId, projectId, opts) {
  const limit = Math.min(500, Math.max(1, Number((opts && opts.limit) || 200)));
  const children = CHILD_TABLES.map((t) => `(al.table_name = '${t}' AND al.record_id IN (SELECT id FROM ${t} WHERE sponsored_project_id = $2))`).join(' OR ');
  const r = await pool.query(
    `SELECT al.id, al.action, al.table_name, al.record_id, al.field_name, al.old_value, al.new_value, al.metadata, al.occurred_at, u.email AS user_email
       FROM org_audit_log al LEFT JOIN users u ON u.id = al.user_id
      WHERE al.org_id = $1 AND al.action IN ('create', 'update', 'delete')
        AND ((al.table_name = 'org_sponsored_projects' AND al.record_id = $2) OR ${children}
             OR (al.metadata ->> 'sponsored_project_id') = $2::text)
      ORDER BY al.occurred_at DESC, al.id DESC
      LIMIT ${limit}`, [orgId, projectId]);
  return r.rows;
}

module.exports = { AGREEMENT_STATUSES, needsAgreement, projectFlags, needsAttention, feeOut, totalsOf, loadOverview, loadMoneyOut, loadHistory };
