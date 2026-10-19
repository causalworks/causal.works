'use strict';

// Sponsored-project reports: the calendar (project quarterly reports, sponsor-to-funder reports and grant reports together),
// marking a report received, reminder emails, and the items the compliance calendar and dashboard show.

const { sendPlainEmail } = require('./sendPlainEmail');
const { projectDocument } = require('./sponsorDocuments');
const { logAudit } = require('./auditLog');
const { isoDate } = require('./sponsorFees');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function reportStatus(r, today) {
  if (r.received_at) return 'received';
  const due = isoDate(r.due_date);
  if (due < today) return 'overdue';
  const in30 = new Date(Date.parse(today + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0, 10);
  return due <= in30 ? 'due_soon' : 'upcoming';
}

async function calendar(pool, orgId, opts) {
  const today = isoDate((opts && opts.today) || new Date());
  const projectFilter = opts && opts.projectId ? ' AND r.sponsored_project_id = $2' : '';
  const params = opts && opts.projectId ? [orgId, opts.projectId] : [orgId];
  const r = await pool.query(
    `SELECT r.id, r.sponsored_project_id, p.name AS project_name, r.kind, r.title, r.period_start::text AS period_start, r.period_end::text AS period_end,
            r.due_date::text AS due_date, r.received_at::text AS received_at, r.document_id, r.notes, c.display_name AS funder_name
       FROM org_sponsor_reports r JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
       LEFT JOIN org_constituents c ON c.id = r.funder_constituent_id
      WHERE r.org_id = $1 ${projectFilter}
      ORDER BY r.due_date, r.id`, params);
  const rows = r.rows.map((x) => ({ ...x, source: 'sponsorship', status: reportStatus(x, today) }));
  if (!(opts && opts.projectId)) {
    const g = await pool.query(
      `SELECT id, name, next_report_due::text AS due_date FROM org_grants WHERE org_id = $1 AND next_report_due IS NOT NULL AND COALESCE(status, '') <> 'closed'`, [orgId]);
    g.rows.forEach((x) => rows.push({ id: 'g' + x.id, grant_id: x.id, source: 'grant', kind: 'grant', title: 'Grant report: ' + x.name, due_date: x.due_date, received_at: null, status: reportStatus(x, today) }));
    rows.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  }
  return rows;
}

async function addFunderReport(pool, { orgId, userId, projectId, input }) {
  const due = input.due_date ? String(input.due_date) : '';
  const title = String(input.title || '').trim();
  if (!DATE_RE.test(due)) return { httpStatus: 400, body: { error: 'Enter the date the report is due.' } };
  if (!title) return { httpStatus: 400, body: { error: 'Give the report a title (for example, the funder and grant).' } };
  let funder = null;
  if (input.funder_constituent_id) {
    const c = await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [Number(input.funder_constituent_id), orgId]);
    if (!c.rows.length) return { httpStatus: 400, body: { error: 'Choose a funder from this workspace\'s contacts.' } };
    funder = c.rows[0].id;
  }
  const r = await pool.query(
    `INSERT INTO org_sponsor_reports (org_id, sponsored_project_id, kind, funder_constituent_id, title, period_start, period_end, due_date, notes)
     VALUES ($1, $2, 'funder', $3, $4, $5, $6, $7, $8) RETURNING id`,
    [orgId, projectId, funder, title, DATE_RE.test(String(input.period_start || '')) ? input.period_start : null,
     DATE_RE.test(String(input.period_end || '')) ? input.period_end : null, due, input.notes ? String(input.notes).slice(0, 1000) : null]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_reports', recordId: r.rows[0].id, metadata: { kind: 'funder', due_date: due } });
  return { httpStatus: 201, body: { id: r.rows[0].id } };
}

async function markReceived(pool, { orgId, userId, reportId, receivedAt, documentId }) {
  const r = await pool.query('SELECT * FROM org_sponsor_reports WHERE id = $1 AND org_id = $2', [reportId, orgId]);
  const rep = r.rows[0];
  if (!rep) return { httpStatus: 404, body: { error: 'Report not found' } };
  const date = receivedAt || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) return { httpStatus: 400, body: { error: 'Enter the date the report was received.' } };
  const doc = await projectDocument(pool, orgId, rep.sponsored_project_id, documentId);
  if (!doc) return { httpStatus: 400, body: { error: 'Attach the report to this project first, then choose it here.' } };
  await pool.query('UPDATE org_sponsor_reports SET received_at = $1, received_by = $2, document_id = $3 WHERE id = $4', [date, userId, doc.id, reportId]);
  await pool.query(`UPDATE org_documents SET sponsor_doc_type = 'report' WHERE id = $1 AND org_id = $2 AND sponsor_doc_type IS NULL`, [doc.id, orgId]);
  if (rep.kind === 'project_quarterly') {
    await pool.query(
      `UPDATE org_sponsored_projects SET last_report_received_at = GREATEST(COALESCE(last_report_received_at, $1::date), $1::date), updated_at = now()
        WHERE id = $2 AND sponsor_org_id = $3`, [date, rep.sponsored_project_id, orgId]);
  }
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_reports', recordId: reportId,
    fields: [{ fieldName: 'received', oldValue: rep.received_at ? isoDate(rep.received_at) : null, newValue: date }], metadata: { document_id: doc.id } });
  return { httpStatus: 200, body: { id: reportId, received_at: date } };
}

function reminderText(row) {
  const period = row.period_start && row.period_end ? isoDate(row.period_start) + ' to ' + isoDate(row.period_end) : 'the last quarter';
  const lines = ['Hello' + (row.lead_name ? ' ' + row.lead_name : '') + ',', ''];
  if (row.reminder_kind === 'overdue') {
    lines.push('The quarterly report for ' + row.project_name + ' covering ' + period + ' was due on ' + isoDate(row.due_date) + ' and has not been received yet.');
    lines.push('Please send it as soon as you can. A project with a late report can be put on hold, which stops payments.');
  } else {
    lines.push('The quarterly report for ' + row.project_name + ' covering ' + period + ' is due on ' + isoDate(row.due_date) + '.');
  }
  lines.push('', 'Reply to this email with any questions.', '', row.org_name);
  return lines.join('\n');
}

// Daily: write the log rows first (one per report and reminder kind), then send. A rerun finds nothing new to send.
async function sendReportReminders(pool, opts) {
  const send = (opts && opts.send) || sendPlainEmail;
  const claimed = await pool.query('SELECT * FROM org_claim_sponsor_report_reminders()');
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const row of claimed.rows) {
    if (!row.lead_email) {
      await pool.query('SELECT org_mark_sponsor_report_reminder($1, $2)', [row.reminder_id, 'skipped']);
      out.skipped++;
      continue;
    }
    let ok = false;
    try {
      ok = await send({
        to: row.lead_email, fromName: row.org_name, replyTo: row.reply_to || undefined,
        subject: (row.reminder_kind === 'overdue' ? 'Report overdue: ' : 'Report due soon: ') + row.project_name,
        text: reminderText(row),
      });
    } catch (e) { ok = false; }
    await pool.query('SELECT org_mark_sponsor_report_reminder($1, $2)', [row.reminder_id, ok ? 'sent' : 'failed']);
    if (ok) out.sent++; else out.failed++;
  }
  return out;
}

// Items for the compliance calendar: project reports and funder reports due within 90 days or overdue, and missing agreements.
async function complianceItems(pool, orgId, slug, opts) {
  const today = isoDate((opts && opts.today) || new Date());
  const base = '/organizational/o/' + encodeURIComponent(slug) + '/sponsored-projects';
  const in90 = new Date(Date.parse(today + 'T00:00:00Z') + 90 * 86400000).toISOString().slice(0, 10);
  const reports = (await calendar(pool, orgId, { today })).filter((r) => r.source === 'sponsorship' && !r.received_at && r.due_date <= in90);
  const items = reports.map((r) => ({
    id: null, source: 'sponsorship', category: 'sponsorship', title: (r.kind === 'funder' ? r.title : 'Quarterly report') + ': ' + r.project_name,
    next_due_date: r.due_date, status: r.status, href: base + '?focus=' + r.sponsored_project_id,
  }));
  const missing = await pool.query(
    `SELECT id, name FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND status IN ('accepted', 'active', 'on_hold', 'winding_down') AND agreement_signed_at IS NULL`, [orgId]);
  missing.rows.forEach((p) => items.push({
    id: null, source: 'sponsorship', category: 'sponsorship', title: 'No signed agreement: ' + p.name, next_due_date: null, status: 'overdue', href: base + '?focus=' + p.id,
  }));
  return items;
}

module.exports = { reportStatus, calendar, addFunderReport, markReceived, reminderText, sendReportReminders, complianceItems };
