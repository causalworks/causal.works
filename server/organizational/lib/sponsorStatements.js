'use strict';

// Sponsored-project statements: the monthly statement (opening, income, fees, expenses, closing) as a stored PDF emailed to the
// project lead, the scheduled run, and the year-end sheet of income and expenses by project tied to the ledger by fund.

const { loadProjectBalances } = require('./sponsorBalance');
const { storeGeneratedPdf } = require('./sponsorDocuments');
const { loadOrgDocInfo } = require('./orgLetterhead');
const { sendPlainEmail } = require('./sendPlainEmail');
const { logAudit } = require('./auditLog');
const { fyDateRange, getFiscalYearEndMonth } = require('./fiscalYear');
const { isoDate } = require('./sponsorFees');
const { requestContextMiddleware, enterOrgContext, enterProgramScope } = require('./orgContext');
const fs = require('fs');
const path = require('path');
const { UPLOADS_ROOT } = require('./sponsorDocuments');

const MONTH_RE = /^\d{4}-\d{2}$/;

function money(c) {
  const n = Number(c) / 100;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function dayBefore(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = month + '-01';
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

// Money held for the project at a date: received and in the books, less fees charged, money paid out, recalls and other spending.
function heldCents(b) {
  return b.received_posted_cents - Math.max(b.fees_accrued_cents, b.fees_posted_cents) - b.disbursed_posted_cents
    - (b.recalled_posted_cents || 0) - (b.other_spending_cents || 0);
}
function spentCents(b) {
  return b.disbursed_posted_cents + (b.recalled_posted_cents || 0) + (b.other_spending_cents || 0);
}

// Figures for a period from two historical balances (the day before it starts and its last day).
function periodFigures(before, after) {
  return {
    opening_cents: heldCents(before),
    income_cents: after.received_posted_cents - before.received_posted_cents,
    fees_cents: Math.max(after.fees_accrued_cents, after.fees_posted_cents) - Math.max(before.fees_accrued_cents, before.fees_posted_cents),
    expenses_cents: spentCents(after) - spentCents(before),
    closing_cents: heldCents(after),
    committed_cents: after.pending_cents,
  };
}

async function periodForProjects(pool, orgId, projectIds, start, end) {
  const [before, after] = await Promise.all([
    loadProjectBalances(pool, orgId, projectIds, { asOf: dayBefore(start), historical: true }),
    loadProjectBalances(pool, orgId, projectIds, { asOf: end, historical: true }),
  ]);
  const out = new Map();
  for (const [id, a] of after) {
    const b = before.get(id);
    out.set(id, { project: a.project, figures: periodFigures(b.balance, a.balance), after: a.balance, before: b.balance });
  }
  return out;
}

function statementHtml({ orgName, project, month, f, activity }) {
  const rows = [
    ['Opening balance', f.opening_cents], ['Money received', f.income_cents], ['Administrative fee', -f.fees_cents],
    ['Spent and paid out', -f.expenses_cents], ['Closing balance', f.closing_cents],
  ];
  return '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;color:#111;}' +
    'h1{font-size:15pt;margin:0 0 2pt;} .sub{color:#555;margin:0 0 14pt;} table{border-collapse:collapse;width:100%;margin-bottom:14pt;}' +
    'td,th{padding:4pt 6pt;border-bottom:0.5pt solid #ccc;text-align:left;} td.n{text-align:right;font-variant-numeric:tabular-nums;} tr.t td{font-weight:bold;}' +
    '</style></head><body><h1>' + esc(project.name) + ': statement for ' + esc(month) + '</h1>' +
    '<p class="sub">' + esc(orgName) + ' holds these funds as fiscal sponsor for the project.</p>' +
    '<table>' + rows.map((r, i) => '<tr' + (i === 0 || i === rows.length - 1 ? ' class="t"' : '') + '><td>' + esc(r[0]) + '</td><td class="n">' + money(r[1]) + '</td></tr>').join('') + '</table>' +
    (f.committed_cents ? '<p>Approved or requested but not yet paid: ' + money(f.committed_cents) + '.</p>' : '') +
    (activity.length ? '<h2 style="font-size:11pt;">Activity</h2><table><tr><th>Date</th><th>Item</th><th class="n">Amount</th></tr>' +
      activity.map((a) => '<tr><td>' + esc(a.date) + '</td><td>' + esc(a.label) + '</td><td class="n">' + money(a.cents) + '</td></tr>').join('') + '</table>' : '<p>No activity this month.</p>') +
    '<p class="sub">Questions about this statement? Reply to the email it came with.</p></body></html>';
}

async function monthActivity(pool, orgId, projectId, start, end) {
  const r = await pool.query(
    `SELECT received_at::date::text AS date, 'Gift received' AS label, amount_cents AS cents FROM org_gifts
      WHERE org_id = $1 AND sponsored_project_id = $2 AND posting_status = 'posted' AND gift_type <> 'pledge'
        AND payment_method IS DISTINCT FROM 'in_kind' AND received_at::date BETWEEN $3 AND $4
     UNION ALL
     SELECT disbursement_date::text, COALESCE(NULLIF(notes, ''), 'Payment'), -amount_cents FROM org_sponsored_project_disbursements
      WHERE org_id = $1 AND sponsored_project_id = $2 AND status = 'approved' AND kind = 'cash' AND ledger_transaction_id IS NOT NULL AND disbursement_date BETWEEN $3 AND $4
     UNION ALL
     SELECT period_end::text, 'Administrative fee', -amount_cents FROM org_sponsor_fee_postings
      WHERE org_id = $1 AND sponsored_project_id = $2 AND voided_at IS NULL AND period_end BETWEEN $3 AND $4
     UNION ALL
     SELECT recall_date::text, 'Recalled: ' || reason, -amount_cents FROM org_sponsor_recalls
      WHERE org_id = $1 AND sponsored_project_id = $2 AND status = 'posted' AND recall_date BETWEEN $3 AND $4
     ORDER BY 1`, [orgId, projectId, start, end]);
  return r.rows.map((x) => ({ ...x, cents: Number(x.cents) }));
}

async function leadContact(pool, orgId, project) {
  if (project.lead_constituent_id) {
    const c = await pool.query('SELECT display_name, email FROM org_constituents WHERE id = $1 AND org_id = $2', [project.lead_constituent_id, orgId]);
    if (c.rows[0] && c.rows[0].email) return { name: c.rows[0].display_name, email: c.rows[0].email };
  }
  return project.contact_lead_email ? { name: project.contact_lead_name, email: project.contact_lead_email } : null;
}

// Builds the statement for one project and month. The row is unique per project and month: if it already has its document,
// nothing new is made. Sending happens once, unless the earlier send failed.
async function generateStatement(pool, { orgId, userId, projectId, month, send, sendEmail }) {
  if (!MONTH_RE.test(String(month || ''))) return { httpStatus: 400, body: { error: 'Choose the month (YYYY-MM).' } };
  const { start, end } = monthBounds(month);
  if (end >= new Date().toISOString().slice(0, 10)) return { httpStatus: 400, body: { error: 'A statement can be made once the month has ended.' } };
  const p = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  const project = p.rows[0];
  if (!project) return { httpStatus: 404, body: { error: 'Sponsored project not found' } };
  await pool.query(
    `INSERT INTO org_sponsor_statements (org_id, sponsored_project_id, month, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sponsored_project_id, month) DO NOTHING`, [orgId, projectId, start, userId || null]);
  let row = (await pool.query('SELECT * FROM org_sponsor_statements WHERE sponsored_project_id = $1 AND month = $2 AND org_id = $3', [projectId, start, orgId])).rows[0];
  let created = false;
  if (!row.generated_document_id) {
    const per = (await periodForProjects(pool, orgId, [projectId], start, end)).get(Number(projectId));
    const f = per.figures;
    const info = await loadOrgDocInfo(pool, orgId);
    const doc = await storeGeneratedPdf(pool, {
      orgId, userId, projectId, html: statementHtml({ orgName: info.name, project, month, f, activity: await monthActivity(pool, orgId, projectId, start, end) }),
      title: project.name + ' statement ' + month, filename: 'statement-' + project.id + '-' + month + '.pdf', docType: 'correspondence', documentDate: end,
    });
    row = (await pool.query(
      `UPDATE org_sponsor_statements SET opening_cents = $1, income_cents = $2, fees_cents = $3, expenses_cents = $4, closing_cents = $5, generated_document_id = $6
        WHERE id = $7 AND generated_document_id IS NULL RETURNING *`,
      [f.opening_cents, f.income_cents, f.fees_cents, f.expenses_cents, f.closing_cents, doc.id, row.id])).rows[0] || row;
    created = true;
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_statements', recordId: row.id, metadata: { month, document_id: doc.id } });
  }
  let sendStatus = row.send_status;
  if (send && (row.send_status === 'pending' || row.send_status === 'failed' || row.send_status === 'not_sent')) {
    sendStatus = await sendStatement(pool, { orgId, project, row, month, sendEmail });
  } else if (!send && row.send_status === 'pending' && created) {
    await pool.query(`UPDATE org_sponsor_statements SET send_status = 'not_sent' WHERE id = $1`, [row.id]);
    sendStatus = 'not_sent';
  }
  return { httpStatus: created ? 201 : 200, body: { statement: { ...row, month: isoDate(row.month), send_status: sendStatus }, created } };
}

async function sendStatement(pool, { orgId, project, row, month, sendEmail }) {
  const send = sendEmail || sendPlainEmail;
  const lead = await leadContact(pool, orgId, project);
  if (!lead) {
    await pool.query(`UPDATE org_sponsor_statements SET send_status = 'skipped' WHERE id = $1`, [row.id]);
    return 'skipped';
  }
  const info = await loadOrgDocInfo(pool, orgId);
  const d = (await pool.query('SELECT stored_path FROM org_documents WHERE id = $1 AND org_id = $2', [row.generated_document_id, orgId])).rows[0];
  let content = null;
  try { content = fs.readFileSync(path.resolve(UPLOADS_ROOT, d.stored_path)); } catch (e) { content = null; }
  const text = ['Hello' + (lead.name ? ' ' + lead.name : '') + ',', '',
    'The statement for ' + project.name + ' for ' + month + ' is attached.',
    'Closing balance: ' + money(row.closing_cents) + '.', '', 'Reply to this email with any questions.', '', info.name].join('\n');
  let ok = false;
  try {
    ok = await send({ to: lead.email, subject: project.name + ' statement for ' + month, text, fromName: info.name, replyTo: info.replyTo || undefined,
      attachments: content ? [{ name: 'statement-' + month + '.pdf', content, contentType: 'application/pdf' }] : [] });
  } catch (e) { ok = false; }
  const status = ok ? 'sent' : 'failed';
  await pool.query(`UPDATE org_sponsor_statements SET send_status = $1, sent_at = CASE WHEN $1 = 'sent' THEN now() ELSE sent_at END, sent_to = $2 WHERE id = $3`, [status, lead.email, row.id]);
  return status;
}

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware(null, null, () => {
      enterOrgContext(orgId);
      enterProgramScope(null);
      Promise.resolve().then(fn).then(resolve, reject);
    });
  });
}

// Scheduled: claims this month's statement rows (owner function) and builds and sends each inside its workspace's context.
async function runStatementJob(rawPool, scopedPool, opts) {
  const claimed = await rawPool.query('SELECT * FROM org_claim_sponsor_statements()');
  const out = { made: 0, failed: 0 };
  for (const row of claimed.rows) {
    const month = isoDate(row.month).slice(0, 7);
    try {
      await inOrg(row.org_id, () => generateStatement(scopedPool, { orgId: row.org_id, userId: null, projectId: row.sponsored_project_id, month, send: true, sendEmail: opts && opts.sendEmail }));
      out.made++;
    } catch (e) {
      console.error('[sponsor statements] project ' + row.sponsored_project_id + ' ' + month + ':', e.message);
      out.failed++;
    }
  }
  return out;
}

// Year-end sheet: per project, income, fees, expenses and closing balance for the fiscal year, and the ledger net for the
// project's program in the same year, so the sheet ties to the books by fund.
async function yearEndSheet(pool, orgId, fiscalYear) {
  const fyEnd = (await getFiscalYearEndMonth(pool, orgId)) || 12;
  const { startDate, endDate } = fyDateRange(fiscalYear, fyEnd);
  const pr = await pool.query('SELECT id FROM org_sponsored_projects WHERE sponsor_org_id = $1 ORDER BY name, id', [orgId]);
  const per = await periodForProjects(pool, orgId, pr.rows.map((r) => r.id), startDate, endDate);
  const nc = await pool.query(
    `SELECT sponsored_project_id, COALESCE(SUM(amount_cents), 0)::bigint AS cents FROM org_gifts
      WHERE org_id = $1 AND payment_method = 'in_kind' AND posting_status = 'posted' AND sponsored_project_id IS NOT NULL
        AND received_at::date BETWEEN $2 AND $3 GROUP BY sponsored_project_id`, [orgId, startDate, endDate]);
  const noncash = new Map(nc.rows.map((x) => [Number(x.sponsored_project_id), Number(x.cents)]));
  const rows = [];
  for (const { project, figures, after, before } of per.values()) {
    const ledgerYear = after.tie_out.ledger_net_cents == null ? null : after.tie_out.ledger_net_cents - before.tie_out.ledger_net_cents;
    const expected = (after.tie_out.expected_cents - before.tie_out.expected_cents);
    rows.push({
      project_id: Number(project.id), project_name: project.name, program_id: project.program_id,
      opening_cents: figures.opening_cents, income_cents: figures.income_cents, noncash_cents: noncash.get(Number(project.id)) || 0,
      fees_cents: figures.fees_cents, expenses_cents: figures.expenses_cents, closing_cents: figures.closing_cents,
      ledger_net_cents: ledgerYear, books_expected_cents: expected, difference_cents: ledgerYear == null ? null : ledgerYear - expected,
    });
  }
  return { fiscal_year: fiscalYear, start_date: startDate, end_date: endDate, rows };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function yearEndCsv(sheet) {
  const cols = [['project_name', 'Project'], ['opening_cents', 'Opening'], ['income_cents', 'Money received'], ['noncash_cents', 'Noncash gifts at value'],
    ['fees_cents', 'Administrative fee'], ['expenses_cents', 'Spent and paid out'], ['closing_cents', 'Closing'], ['ledger_net_cents', 'Books, program net for the year'],
    ['difference_cents', 'Difference from the books']];
  const money2 = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2));
  return [cols.map((c) => c[1]).join(',')].concat(sheet.rows.map((r) => cols.map(([k]) => csvCell(k === 'project_name' ? r[k] : money2(r[k]))).join(','))).join('\n') + '\n';
}

module.exports = { monthBounds, periodFigures, heldCents, generateStatement, runStatementJob, yearEndSheet, yearEndCsv, statementHtml, inOrg };
