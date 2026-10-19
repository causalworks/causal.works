'use strict';

// Sponsored-project balance: the one place that adds up money received, fees, money paid out and money committed.
// Used by the project page, statements, request checks, the dashboard flag and reports.

const { computeQuarterFees, fallbackRule, isoDate } = require('./sponsorFees');
const { getFiscalYearEndMonth } = require('./fiscalYear');

const RESTRICTED_CLASS = 'temporarily_restricted';

function sum(rows, pick) { return rows.reduce((s, r) => s + Number(pick(r) || 0), 0); }

// facts: { receipts, feePeriods, feePostings, disbursements, requests, ledgerNetCents, openPledgeCents }
function computeBalance(facts) {
  const receipts = facts.receipts || [];
  const disbursements = facts.disbursements || [];
  const requests = facts.requests || [];
  const postings = (facts.feePostings || []).filter((p) => p.live);

  const receivedPosted = sum(receipts.filter((r) => r.posted), (r) => r.cents);
  const receivedUnposted = sum(receipts.filter((r) => !r.posted), (r) => r.cents);
  const feesAccrued = sum(facts.feePeriods || [], (p) => p.fee_cents);
  const feesPosted = sum(postings, (p) => p.amount_cents);
  const feesCharged = Math.max(feesAccrued, feesPosted);
  const disbursedPosted = sum(disbursements.filter((d) => d.status === 'approved' && d.posted), (d) => d.amount_cents);
  const disbursementsPending = sum(disbursements.filter((d) => d.status === 'pending_approval' || (d.status === 'approved' && !d.posted)), (d) => d.amount_cents);
  const requestsPending = sum(requests.filter((r) => ['submitted', 'in_review', 'needs_info', 'approved'].includes(r.status) && !r.disbursement_id), (r) => r.amount_cents);
  const pending = disbursementsPending + requestsPending;
  const available = receivedPosted - feesCharged - disbursedPosted - pending;

  const expectedLedgerNet = receivedPosted - feesPosted - disbursedPosted;
  const ledgerNet = facts.ledgerNetCents == null ? null : Number(facts.ledgerNetCents);
  const openPledge = Number(facts.openPledgeCents || 0);
  const difference = ledgerNet == null ? null : ledgerNet - expectedLedgerNet;
  const unexplained = difference == null ? null : difference - openPledge;

  return {
    received_posted_cents: receivedPosted,
    received_unposted_cents: receivedUnposted,
    fees_accrued_cents: feesAccrued,
    fees_posted_cents: feesPosted,
    fees_unposted_cents: Math.max(0, feesAccrued - feesPosted),
    disbursed_posted_cents: disbursedPosted,
    pending_cents: pending,
    pending_disbursements_cents: disbursementsPending,
    pending_requests_cents: requestsPending,
    available_cents: available,
    negative: available < 0,
    tie_out: {
      ledger_net_cents: ledgerNet,
      expected_cents: expectedLedgerNet,
      difference_cents: difference,
      open_pledge_cents: openPledge,
      unexplained_cents: unexplained,
    },
  };
}

function explainTieOut(t, opts) {
  if (t.ledger_net_cents == null) return 'Link this project to a program to compare it with the books.';
  if (t.difference_cents === 0) return 'Agrees with the books.';
  const parts = [];
  if (t.open_pledge_cents) parts.push('pledges booked but not yet collected');
  if (t.unexplained_cents) parts.push('entries coded to the project\'s program that are not this project\'s gifts, fees or payments' + (opts && opts.sharedProgram ? ' (another project uses the same program)' : ''));
  return 'Differs from the books by the amount shown: ' + parts.join('; ') + '.';
}

async function loadProject(pool, orgId, projectId) {
  const r = await pool.query(
    `SELECT p.*, s.default_admin_rate
       FROM org_sponsored_projects p LEFT JOIN org_settings s ON s.org_id = p.sponsor_org_id
      WHERE p.id = $1 AND p.sponsor_org_id = $2`, [projectId, orgId]);
  return r.rows[0] || null;
}

async function loadSponsorSettings(pool, orgId) {
  const r = await pool.query('SELECT * FROM org_sponsor_settings WHERE org_id = $1', [orgId]);
  return r.rows[0] || null;
}

async function loadReceipts(pool, orgId, projectIds) {
  const gifts = await pool.query(
    `SELECT g.id, g.sponsored_project_id, g.received_at::date::text AS date, g.amount_cents, g.sponsor_fee_exempt,
            (g.ledger_transaction_id IS NOT NULL AND t.status = 'posted') AS posted
       FROM org_gifts g LEFT JOIN org_ledger_transactions t ON t.id = g.ledger_transaction_id
      WHERE g.org_id = $1 AND g.sponsored_project_id = ANY($2::int[])
        AND g.posting_status <> 'void' AND g.review_status <> 'dismissed'
        AND g.gift_type <> 'pledge' AND g.payment_method IS DISTINCT FROM 'in_kind'`, [orgId, projectIds]);
  const inst = await pool.query(
    `SELECT i.id, g.sponsored_project_id, i.collected_at::text AS date, i.amount_cents, g.sponsor_fee_exempt,
            (t.status = 'posted') AS posted
       FROM org_gift_pledge_installments i
       JOIN org_gifts g ON g.id = i.gift_id
       LEFT JOIN org_ledger_transactions t ON t.id = i.ledger_transaction_id
      WHERE i.org_id = $1 AND g.sponsored_project_id = ANY($2::int[]) AND i.status = 'collected' AND i.collected_at IS NOT NULL
        AND g.posting_status <> 'void'`, [orgId, projectIds]);
  return [
    ...gifts.rows.map((r) => ({ kind: 'gift', id: r.id, project_id: r.sponsored_project_id, date: r.date, cents: Number(r.amount_cents), exempt: !!r.sponsor_fee_exempt, posted: !!r.posted })),
    ...inst.rows.map((r) => ({ kind: 'pledge_installment', id: r.id, project_id: r.sponsored_project_id, date: r.date, cents: Number(r.amount_cents), exempt: !!r.sponsor_fee_exempt, posted: !!r.posted })),
  ];
}

async function loadFeeRules(pool, orgId, projectIds) {
  const r = await pool.query(
    `SELECT * FROM org_sponsor_fee_rules WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[]) ORDER BY effective_from, id`,
    [orgId, projectIds]);
  return r.rows;
}

async function loadFeePostings(pool, orgId, projectIds) {
  const r = await pool.query(
    `SELECT f.id, f.sponsored_project_id, f.period_start::text AS period_start, f.period_end::text AS period_end, f.amount_cents,
            f.ledger_transaction_id, f.voided_at, f.void_reason, f.created_at,
            (f.voided_at IS NULL AND f.ledger_transaction_id IS NOT NULL AND t.status = 'posted') AS live
       FROM org_sponsor_fee_postings f LEFT JOIN org_ledger_transactions t ON t.id = f.ledger_transaction_id
      WHERE f.org_id = $1 AND f.sponsored_project_id = ANY($2::int[])
      ORDER BY f.period_end, f.id`, [orgId, projectIds]);
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), live: !!x.live }));
}

async function loadDisbursements(pool, orgId, projectIds) {
  const r = await pool.query(
    `SELECT d.id, d.sponsored_project_id, d.status, d.amount_cents,
            (d.ledger_transaction_id IS NOT NULL AND t.status = 'posted') AS posted
       FROM org_sponsored_project_disbursements d LEFT JOIN org_ledger_transactions t ON t.id = d.ledger_transaction_id
      WHERE d.org_id = $1 AND d.sponsored_project_id = ANY($2::int[]) AND d.status <> 'void'`, [orgId, projectIds]);
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), posted: !!x.posted }));
}

async function loadRequests(pool, orgId, projectIds) {
  const t = await pool.query(`SELECT to_regclass('org_sponsor_payment_requests') AS t`);
  if (!t.rows[0].t) return [];
  const r = await pool.query(
    `SELECT id, sponsored_project_id, status, amount_cents, disbursement_id
       FROM org_sponsor_payment_requests WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projectIds]);
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) }));
}

async function loadLedgerNet(pool, orgId, programIds) {
  if (!programIds.length) return new Map();
  const r = await pool.query(
    `SELECT l.program_id, COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS net
       FROM org_ledger_lines l
       JOIN org_ledger_transactions t ON t.id = l.transaction_id
       JOIN org_accounts a ON a.id = l.account_id
      WHERE t.org_id = $1 AND t.status = 'posted' AND l.program_id = ANY($2::int[]) AND a.type IN ('income', 'expense')
      GROUP BY l.program_id`, [orgId, programIds]);
  return new Map(r.rows.map((x) => [Number(x.program_id), Number(x.net)]));
}

async function loadOpenPledges(pool, orgId, projectIds) {
  const r = await pool.query(
    `SELECT g.sponsored_project_id,
            SUM(g.amount_cents - COALESCE((SELECT SUM(i.amount_cents) FROM org_gift_pledge_installments i
                                            WHERE i.gift_id = g.id AND i.status = 'collected'), 0))::bigint AS open
       FROM org_gifts g
      WHERE g.org_id = $1 AND g.sponsored_project_id = ANY($2::int[]) AND g.gift_type = 'pledge' AND g.posting_status = 'posted'
      GROUP BY g.sponsored_project_id`, [orgId, projectIds]);
  return new Map(r.rows.map((x) => [Number(x.sponsored_project_id), Number(x.open)]));
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// Balances for many projects in one pass. Returns Map(projectId -> { project, balance, feePeriods, receipts, feePostings }).
async function loadProjectBalances(pool, orgId, projectIds, opts) {
  const ids = [...new Set((projectIds || []).map(Number).filter((n) => n > 0))];
  const out = new Map();
  if (!ids.length) return out;
  const asOf = isoDate((opts && opts.asOf) || todayIso());
  const projR = await pool.query(
    `SELECT p.*, s.default_admin_rate FROM org_sponsored_projects p LEFT JOIN org_settings s ON s.org_id = p.sponsor_org_id
      WHERE p.sponsor_org_id = $1 AND p.id = ANY($2::int[])`, [orgId, ids]);
  const [settings, fyEndMonth, receipts, rules, postings, disb, requests, openPledges] = await Promise.all([
    loadSponsorSettings(pool, orgId), getFiscalYearEndMonth(pool, orgId), loadReceipts(pool, orgId, ids), loadFeeRules(pool, orgId, ids),
    loadFeePostings(pool, orgId, ids), loadDisbursements(pool, orgId, ids), loadRequests(pool, orgId, ids), loadOpenPledges(pool, orgId, ids),
  ]);
  const programIds = [...new Set(projR.rows.map((p) => p.program_id).filter((x) => x != null).map(Number))];
  const ledgerNet = await loadLedgerNet(pool, orgId, programIds);
  const programCount = new Map();
  if (programIds.length) {
    const pc = await pool.query(
      `SELECT program_id, COUNT(*)::int AS n FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND program_id = ANY($2::int[]) GROUP BY program_id`,
      [orgId, programIds]);
    pc.rows.forEach((x) => programCount.set(Number(x.program_id), x.n));
  }
  for (const p of projR.rows) {
    const pid = Number(p.id);
    const pr = receipts.filter((r) => Number(r.project_id) === pid);
    const feePeriods = computeQuarterFees({
      receipts: pr, rules: rules.filter((r) => Number(r.sponsored_project_id) === pid),
      fallback: fallbackRule(p, p, settings), fyEndMonth: fyEndMonth || 12,
      startDate: p.start_date, endDate: p.end_date, throughDate: asOf,
    });
    const fp = postings.filter((x) => Number(x.sponsored_project_id) === pid);
    const balance = computeBalance({
      receipts: pr, feePeriods, feePostings: fp,
      disbursements: disb.filter((d) => Number(d.sponsored_project_id) === pid),
      requests: requests.filter((r) => Number(r.sponsored_project_id) === pid),
      ledgerNetCents: p.program_id != null ? (ledgerNet.get(Number(p.program_id)) || 0) : null,
      openPledgeCents: openPledges.get(pid) || 0,
    });
    balance.tie_out.explanation = explainTieOut(balance.tie_out, { sharedProgram: p.program_id != null && (programCount.get(Number(p.program_id)) || 0) > 1 });
    out.set(pid, { project: p, balance, feePeriods, receipts: pr, feePostings: fp });
  }
  return out;
}

async function loadProjectBalance(pool, orgId, projectId, opts) {
  const m = await loadProjectBalances(pool, orgId, [projectId], opts);
  return m.get(Number(projectId)) || null;
}

module.exports = {
  RESTRICTED_CLASS, computeBalance, explainTieOut, loadProjectBalance, loadProjectBalances, loadProject, loadSponsorSettings,
};
