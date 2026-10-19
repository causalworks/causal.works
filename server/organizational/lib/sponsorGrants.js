'use strict';

// Pre-approved grant model and closing: the release history a project can see, the year-end sheet of releases by receiving
// entity with the information-return flag, and closing a project with a recorded transfer of the remaining balance.

const { loadProjectBalance, loadSponsorSettings, RESTRICTED_CLASS } = require('./sponsorBalance');
const { postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('./ledgerPosting');
const { projectDocumentId } = require('./sponsorMoneyOut');
const { logAudit } = require('./auditLog');
const { isoDate } = require('./sponsorFees');

const DESTINATIONS = { project_charity: 'The project, now its own charity', new_sponsor: 'A new fiscal sponsor', sponsor_decides: 'As the sponsor decides under the agreement' };

async function releaseHistory(pool, orgId, projectId) {
  const r = await pool.query(
    `SELECT d.id, d.disbursement_date::text AS date, d.amount_cents, d.kind, d.status, d.notes, d.ledger_transaction_id IS NOT NULL AS posted,
            d.grant_agreement_document_id, d.payee_constituent_id, c.display_name AS payee_name, g.in_kind_description
       FROM org_sponsored_project_disbursements d
       LEFT JOIN org_constituents c ON c.id = d.payee_constituent_id
       LEFT JOIN org_gifts g ON g.id = d.property_gift_id
      WHERE d.org_id = $1 AND d.sponsored_project_id = $2 AND d.status <> 'void'
      ORDER BY d.disbursement_date DESC, d.id DESC`, [orgId, projectId]);
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) }));
}

function thresholdForYear(thresholds, year) {
  const t = thresholds || {};
  if (t[String(year)] != null) return Number(t[String(year)]);
  const years = Object.keys(t).map(Number).filter((y) => y <= year).sort((a, b) => a - b);
  return years.length ? Number(t[String(years[years.length - 1])]) : null;
}

// Calendar-year totals of posted releases to each receiving entity (cash, and property at value), flagged at the threshold.
async function informationReturnSheet(pool, orgId, year) {
  const settings = await loadSponsorSettings(pool, orgId);
  const threshold = thresholdForYear(settings && settings.information_return_thresholds, year);
  const r = await pool.query(
    `SELECT d.payee_constituent_id AS entity_id, c.display_name AS entity_name, p.name AS project_name,
            SUM(CASE WHEN d.kind = 'cash' THEN d.amount_cents ELSE 0 END)::bigint AS cash_cents,
            SUM(CASE WHEN d.kind = 'property' THEN d.amount_cents ELSE 0 END)::bigint AS property_cents,
            COUNT(*)::int AS releases
       FROM org_sponsored_project_disbursements d
       JOIN org_ledger_transactions t ON t.id = d.ledger_transaction_id AND t.status = 'posted'
       JOIN org_sponsored_projects p ON p.id = d.sponsored_project_id
       LEFT JOIN org_constituents c ON c.id = d.payee_constituent_id
      WHERE d.org_id = $1 AND d.status = 'approved' AND d.payee_constituent_id IS NOT NULL
        AND extract(year FROM t.transaction_date) = $2
      GROUP BY d.payee_constituent_id, c.display_name, p.name
      ORDER BY c.display_name, p.name`, [orgId, year]);
  const byEntity = new Map();
  for (const x of r.rows) {
    const e = byEntity.get(x.entity_id) || { entity_id: x.entity_id, entity_name: x.entity_name, projects: [], cash_cents: 0, property_cents: 0, releases: 0 };
    e.projects.push(x.project_name);
    e.cash_cents += Number(x.cash_cents);
    e.property_cents += Number(x.property_cents);
    e.releases += x.releases;
    byEntity.set(x.entity_id, e);
  }
  const rows = [...byEntity.values()].map((e) => {
    const total = e.cash_cents + e.property_cents;
    return { ...e, total_cents: total, needs_information_return: threshold != null && total >= threshold };
  });
  return { year, threshold_cents: threshold, rows };
}

function informationReturnCsv(sheet) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const d = (c) => (Number(c) / 100).toFixed(2);
  return ['Receiving entity,Projects,Cash released,Property released at value,Total,Releases,Information return needed']
    .concat(sheet.rows.map((r) => [q(r.entity_name), q(r.projects.join('; ')), d(r.cash_cents), d(r.property_cents), d(r.total_cents), r.releases, r.needs_information_return ? 'yes' : 'no'].join(',')))
    .join('\n') + '\n';
}

// Closing

async function createClosing(pool, { orgId, userId, projectId, input }) {
  const kind = String(input.destination_kind || '');
  const reason = String(input.reason || '').trim();
  const date = input.closing_date ? String(input.closing_date) : '';
  const amount = Number.parseInt(String(input.amount_cents), 10);
  if (!DESTINATIONS[kind]) return { httpStatus: 400, body: { error: 'Choose where the remaining balance goes.' } };
  if (!reason) return { httpStatus: 400, body: { code: 'reason_required', error: 'Enter the reason for closing the project.' } };
  if (!DATE_RE.test(date)) return { httpStatus: 400, body: { error: 'Enter the transfer date.' } };
  if (!Number.isInteger(amount) || amount < 0) return { httpStatus: 400, body: { error: 'Enter the amount to transfer (zero if nothing is left).' } };
  const p = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  const project = p.rows[0];
  if (!project) return { httpStatus: 404, body: { error: 'Sponsored project not found' } };
  if (!['winding_down', 'on_hold'].includes(project.status)) {
    return { httpStatus: 409, body: { code: 'not_winding_down', error: 'Set the project to winding down first. That stops new income; then pay the final bills and record the transfer.' } };
  }
  const existing = await pool.query(`SELECT 1 FROM org_sponsor_closings WHERE sponsored_project_id = $1 AND org_id = $2 AND status <> 'void'`, [projectId, orgId]);
  if (existing.rows.length) return { httpStatus: 409, body: { error: 'A closing transfer is already recorded for this project.' } };
  let dest = null;
  if (kind !== 'sponsor_decides' || input.destination_constituent_id) {
    dest = Number.parseInt(String(input.destination_constituent_id), 10);
    const c = Number.isInteger(dest) ? await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [dest, orgId]) : { rows: [] };
    if (!c.rows.length) return { httpStatus: 400, body: { error: 'Choose the organization receiving the balance from this workspace\'s contacts.' } };
  }
  const doc = input.document_id ? await projectDocumentId(pool, orgId, projectId, input.document_id) : null;
  if (input.document_id && !doc) return { httpStatus: 400, body: { error: 'Attach the document to this project first, then choose it here.' } };
  if (kind === 'new_sponsor' && !doc) return { httpStatus: 400, body: { code: 'document_required', error: 'A transfer to a new sponsor needs the written agreement with that sponsor. Attach it to the project first.' } };
  const b = (await loadProjectBalance(pool, orgId, projectId)).balance;
  if (b.pending_cents > 0) {
    return { httpStatus: 409, body: { code: 'pending_items', error: 'Pay or cancel the remaining requests and payments first (' + (b.pending_cents / 100).toFixed(2) + ' still committed).' } };
  }
  if (amount > b.available_cents) {
    return { httpStatus: 409, body: { code: 'over_balance', error: 'The project has ' + (b.available_cents / 100).toFixed(2) + ' available after its liabilities, so the transfer cannot be more than that.' } };
  }
  const r = await pool.query(
    `INSERT INTO org_sponsor_closings (org_id, sponsored_project_id, destination_kind, destination_constituent_id, amount_cents, closing_date, reason, document_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [orgId, projectId, kind, dest, amount, date, reason, doc, userId]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_closings', recordId: r.rows[0].id, metadata: { destination_kind: kind, amount_cents: amount, reason } });
  return { httpStatus: 201, body: { closing: { ...r.rows[0], amount_cents: Number(r.rows[0].amount_cents), closing_date: isoDate(r.rows[0].closing_date) } } };
}

async function finishProject(pool, { orgId, userId, projectId, closingId }) {
  const p = await pool.query('SELECT status FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  await pool.query(`UPDATE org_sponsored_projects SET status = 'ended', status_before_hold = NULL, hold_kind = NULL, hold_reason = NULL, end_date = COALESCE(end_date, CURRENT_DATE), updated_at = now() WHERE id = $1 AND sponsor_org_id = $2`, [projectId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_projects', recordId: projectId,
    fields: [{ fieldName: 'status', oldValue: p.rows[0] ? p.rows[0].status : null, newValue: 'ended' }], metadata: { closing_id: closingId } });
}

async function postClosing(pool, { orgId, userId, closingId, postingDate, bankAccountId, expenseAccountId }) {
  const r = await pool.query(
    `SELECT c.*, p.name AS project_name, p.program_id, p.disbursement_expense_account_id, k.display_name AS destination_name
       FROM org_sponsor_closings c JOIN org_sponsored_projects p ON p.id = c.sponsored_project_id
       LEFT JOIN org_constituents k ON k.id = c.destination_constituent_id
      WHERE c.id = $1 AND c.org_id = $2`, [closingId, orgId]);
  const c = r.rows[0];
  if (!c) return { httpStatus: 404, body: { error: 'Closing not found' } };
  if (c.status !== 'pending') return { httpStatus: 409, body: { error: 'This closing is already ' + c.status + '.' } };
  const date = postingDate || isoDate(c.closing_date);
  const amount = Number(c.amount_cents);
  let ledgerId = null;
  if (amount > 0) {
    const expense = expenseAccountId || c.disbursement_expense_account_id;
    if (!expense || !bankAccountId || !c.program_id) return { httpStatus: 400, body: { error: 'An expense account, the bank account the money leaves from and the project\'s program are needed.' } };
    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: date,
      memo: 'Closing transfer from ' + c.project_name + (c.destination_name ? ' to ' + c.destination_name : '') + ': ' + c.reason,
      payee: c.destination_name || null, constituentId: c.destination_constituent_id || null, referenceNumber: null,
      lines: [
        { account_id: expense, program_id: c.program_id, donor_restriction_class: RESTRICTED_CLASS, debit_cents: amount, credit_cents: 0 },
        { account_id: bankAccountId, program_id: c.program_id, debit_cents: 0, credit_cents: amount },
      ],
      source: 'sponsor_closing',
      internalApproval: { approvedBy: userId, sourceRefId: closingId, sourceRefType: 'org_sponsor_closings' },
    });
    if (result.httpStatus >= 400) return result;
    ledgerId = result.body.id;
  }
  await pool.query(`UPDATE org_sponsor_closings SET status = 'posted', ledger_transaction_id = $1 WHERE id = $2`, [ledgerId, closingId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_closings', recordId: closingId, fields: [{ fieldName: 'status', oldValue: 'pending', newValue: 'posted' }], metadata: { ledger_transaction_id: ledgerId } });
  await finishProject(pool, { orgId, userId, projectId: c.sponsored_project_id, closingId });
  return { httpStatus: 200, body: { id: closingId, status: 'posted', ledger_transaction_id: ledgerId } };
}

async function voidClosing(pool, { orgId, userId, closingId, reason }) {
  const why = String(reason || '').trim();
  if (!why) return { httpStatus: 400, body: { code: 'reason_required', error: 'Enter the reason for cancelling the closing.' } };
  const r = await pool.query('SELECT * FROM org_sponsor_closings WHERE id = $1 AND org_id = $2', [closingId, orgId]);
  const c = r.rows[0];
  if (!c) return { httpStatus: 404, body: { error: 'Closing not found' } };
  if (c.status === 'void') return { httpStatus: 409, body: { error: 'This closing is already cancelled.' } };
  if (c.ledger_transaction_id) {
    const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: c.ledger_transaction_id, voidReason: why });
    if (v.httpStatus >= 400 && v.body.code !== 'already_voided') return v;
  }
  await pool.query(`UPDATE org_sponsor_closings SET status = 'void', void_reason = $1 WHERE id = $2`, [why, closingId]);
  if (c.status === 'posted') {
    await pool.query(`UPDATE org_sponsored_projects SET status = 'winding_down', updated_at = now() WHERE id = $1 AND sponsor_org_id = $2 AND status = 'ended'`, [c.sponsored_project_id, orgId]);
  }
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_closings', recordId: closingId, fields: [{ fieldName: 'status', oldValue: c.status, newValue: 'void' }], metadata: { reason: why } });
  return { httpStatus: 200, body: { id: closingId, status: 'void' } };
}

module.exports = { DESTINATIONS, releaseHistory, thresholdForYear, informationReturnSheet, informationReturnCsv, createClosing, postClosing, voidClosing };
