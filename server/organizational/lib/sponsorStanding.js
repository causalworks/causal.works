'use strict';

// Sponsored-project good standing: the standing terms each project acknowledges, the conditions to stay active,
// and reactivating a lapsed project. One rule set used by the project page, the list, the compliance calendar and reactivation.

const { loadProjectBalance } = require('./sponsorBalance');
const { logAudit } = require('./auditLog');
const { isoDate } = require('./sponsorFees');

const ACK_ITEMS = [
  { key: 'no_unapproved_spending', label: 'No spending before approval is reimbursed' },
  { key: 'no_name_or_tax_number_use', label: 'No use of the sponsor\'s tax number or name for outside accounts' },
  { key: 'fundraising_limits', label: 'Limits on fundraising methods (auctions, social-media drives)' },
  { key: 'work_abroad', label: 'Rules for work abroad' },
  { key: 'lobbying_political', label: 'Lobbying and political activity limits' },
  { key: 'conflict_of_interest', label: 'Conflict of interest' },
  { key: 'insurance', label: 'Insurance in place' },
  { key: 'annual_review', label: 'Annual review' },
];
const ACK_KEYS = new Set(ACK_ITEMS.map((i) => i.key));
const YEAR_DAYS = 365;
const FEE_GRACE_DAYS = 45;

function daysBetween(a, b) {
  return Math.round((new Date(isoDate(b) + 'T00:00:00Z') - new Date(isoDate(a) + 'T00:00:00Z')) / 86400000);
}

// facts: { today, startDate, agreementSignedAt, lastReportReceivedAt, lastLobbyingAckOn, negative, unpostedFeePeriodEnds: [iso] }
function computeStanding(facts) {
  const today = isoDate(facts.today);
  const young = facts.startDate && daysBetween(facts.startDate, today) < YEAR_DAYS;
  const items = [];
  items.push({ key: 'agreement', label: 'Signed agreement', ok: !!facts.agreementSignedAt,
    detail: facts.agreementSignedAt ? 'Signed ' + isoDate(facts.agreementSignedAt) : 'No signed agreement on file' });
  const reportOk = young || (facts.lastReportReceivedAt && daysBetween(facts.lastReportReceivedAt, today) <= YEAR_DAYS);
  items.push({ key: 'annual_report', label: 'Report received in the last year', ok: !!reportOk,
    detail: facts.lastReportReceivedAt ? 'Last received ' + isoDate(facts.lastReportReceivedAt) : (young ? 'Project is less than a year old' : 'No report received') });
  const lateFees = (facts.unpostedFeePeriodEnds || []).filter((d) => daysBetween(d, today) > FEE_GRACE_DAYS);
  const feesOk = !facts.negative && lateFees.length === 0;
  items.push({ key: 'fees_current', label: 'Fees current', ok: feesOk,
    detail: facts.negative ? 'The project balance is negative' : lateFees.length ? 'Fees for the quarter ending ' + lateFees[0] + ' are not posted' : 'Up to date' });
  const lobbyOk = facts.lastLobbyingAckOn && daysBetween(facts.lastLobbyingAckOn, today) <= YEAR_DAYS;
  items.push({ key: 'lobbying_ack', label: 'Lobbying acknowledgment in the last year', ok: !!lobbyOk,
    detail: facts.lastLobbyingAckOn ? 'Acknowledged ' + isoDate(facts.lastLobbyingAckOn) : 'Not acknowledged' });
  return { good: items.every((i) => i.ok), items };
}

async function loadStanding(pool, orgId, projectId, opts) {
  const today = isoDate((opts && opts.today) || new Date());
  const p = await pool.query('SELECT id, start_date, created_at, agreement_signed_at, last_report_received_at, status FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  const project = p.rows[0];
  if (!project) return null;
  const [rep, ack, acks, bal] = await Promise.all([
    pool.query(`SELECT max(received_at)::text AS last FROM org_sponsor_reports WHERE org_id = $1 AND sponsored_project_id = $2 AND kind = 'project_quarterly'`, [orgId, projectId]),
    pool.query(`SELECT max(acknowledged_on)::text AS last FROM org_sponsor_acknowledgments WHERE org_id = $1 AND sponsored_project_id = $2 AND item_key = 'lobbying_political'`, [orgId, projectId]),
    pool.query(`SELECT DISTINCT ON (item_key) item_key, acknowledged_on::text AS acknowledged_on, note FROM org_sponsor_acknowledgments
                 WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY item_key, acknowledged_on DESC, id DESC`, [orgId, projectId]),
    loadProjectBalance(pool, orgId, projectId, { asOf: today }),
  ]);
  const postedEnds = new Map();
  bal.feePostings.filter((f) => f.live).forEach((f) => postedEnds.set(f.period_end, (postedEnds.get(f.period_end) || 0) + f.amount_cents));
  const unposted = bal.feePeriods.filter((q) => q.complete && q.fee_cents !== (postedEnds.get(q.period_end) || 0)).map((q) => q.period_end);
  const lastReport = [rep.rows[0].last, project.last_report_received_at ? isoDate(project.last_report_received_at) : null].filter(Boolean).sort().pop() || null;
  const standing = computeStanding({
    today, startDate: project.start_date || project.created_at, agreementSignedAt: project.agreement_signed_at,
    lastReportReceivedAt: lastReport, lastLobbyingAckOn: ack.rows[0].last, negative: bal.balance.negative, unpostedFeePeriodEnds: unposted,
  });
  const byKey = new Map(acks.rows.map((r) => [r.item_key, r]));
  standing.acknowledgments = ACK_ITEMS.map((i) => ({ ...i, acknowledged_on: byKey.get(i.key) ? byKey.get(i.key).acknowledged_on : null }));
  standing.status = project.status;
  return standing;
}

async function recordAcknowledgment(pool, { orgId, userId, projectId, itemKey, acknowledgedOn, documentId, note }) {
  if (!ACK_KEYS.has(itemKey)) return { httpStatus: 400, body: { error: 'Choose one of the standing terms.' } };
  if (!acknowledgedOn || !/^\d{4}-\d{2}-\d{2}$/.test(acknowledgedOn)) return { httpStatus: 400, body: { error: 'Enter the date it was acknowledged.' } };
  const r = await pool.query(
    `INSERT INTO org_sponsor_acknowledgments (org_id, sponsored_project_id, item_key, acknowledged_on, document_id, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, projectId, itemKey, acknowledgedOn, documentId || null, note ? String(note).slice(0, 1000) : null, userId]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_acknowledgments', recordId: r.rows[0].id, metadata: { item_key: itemKey, acknowledged_on: acknowledgedOn } });
  return { httpStatus: 201, body: { id: r.rows[0].id } };
}

async function reactivate(pool, { orgId, userId, role, projectId, reason }) {
  const p = await pool.query('SELECT status FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  if (!p.rows.length) return { httpStatus: 404, body: { error: 'Sponsored project not found' } };
  if (p.rows[0].status !== 'lapsed') return { httpStatus: 409, body: { code: 'not_lapsed', error: 'Only a lapsed project can be reactivated.' } };
  const standing = await loadStanding(pool, orgId, projectId);
  const why = String(reason || '').trim();
  if (!standing.good) {
    const missing = standing.items.filter((i) => !i.ok).map((i) => i.label.toLowerCase());
    if (role !== 'admin' || !why) {
      return { httpStatus: 409, body: { code: 'not_in_good_standing', missing,
        error: 'The project is not in good standing yet: ' + missing.join('; ') + '. Fix these first, or an admin can reactivate it with a reason.' } };
    }
  }
  await pool.query(`UPDATE org_sponsored_projects SET status = 'active', updated_at = now() WHERE id = $1 AND sponsor_org_id = $2`, [projectId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_projects', recordId: projectId,
    fields: [{ fieldName: 'status', oldValue: 'lapsed', newValue: 'active' }], metadata: { reason: why || null, good_standing: standing.good } });
  return { httpStatus: 200, body: { id: projectId, status: 'active' } };
}

module.exports = { ACK_ITEMS, computeStanding, loadStanding, recordAcknowledgment, reactivate };
