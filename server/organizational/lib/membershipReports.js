'use strict';

// Membership reports: joins and renewals by month, retention, revenue by tier, aging of unpaid dues, growth, and lapse
// reasons. All read the same terms, payments and status rules as the lists.

const M = require('./membership');
const S = require('./membershipStatus');
const { csvCell } = require('./csvCell');

const REPORTS = ['joins', 'retention', 'revenue', 'aging', 'growth', 'lapses'];

function months(from, to) {
  const out = [];
  let m = S.toDay(from).slice(0, 7) + '-01';
  const last = S.toDay(to).slice(0, 7) + '-01';
  while (m <= last && out.length < 240) { out.push(m.slice(0, 7)); m = S.addMonths(m, 1); }
  return out;
}

function range(q) {
  const today = M.today();
  const to = M.day(q && q.to) || today;
  const from = M.day(q && q.from) || S.addDays(S.addMonths(to, -12), 1);
  return from > to ? { error: 'The start date must be on or before the end date.' } : { from, to };
}

async function allTerms(pool, orgId) {
  return M.loadTerms(pool, orgId, null);
}

function byContact(terms) {
  const map = new Map();
  for (const t of terms) {
    if (!map.has(t.constituent_id)) map.set(t.constituent_id, []);
    map.get(t.constituent_id).push(t);
  }
  return map;
}

async function joinsAndRenewals(pool, orgId, { from, to }) {
  const terms = await allTerms(pool, orgId);
  const first = new Map();
  for (const t of terms) {
    const f = first.get(t.constituent_id);
    if (!f || t.starts_on < f.starts_on || (t.starts_on === f.starts_on && t.id < f.id)) first.set(t.constituent_id, t);
  }
  const rows = months(from, to).map((m) => ({ month: m, joins: 0, renewals: 0 }));
  const at = new Map(rows.map((r) => [r.month, r]));
  for (const t of terms) {
    if (t.starts_on < from || t.starts_on > to) continue;
    const r = at.get(t.starts_on.slice(0, 7));
    if (!r) continue;
    if (first.get(t.constituent_id).id === t.id) r.joins++;
    else if (t.renews_term_id || t.source === 'renewal') r.renewals++;
  }
  return { columns: ['month', 'joins', 'renewals'], rows };
}

async function retention(pool, orgId, { from, to }) {
  const settings = await M.getSettings(pool, orgId);
  const terms = await allTerms(pool, orgId);
  const grouped = byContact(terms);
  let due = 0;
  let renewed = 0;
  const today = M.today();
  for (const list of grouped.values()) {
    for (const t of list) {
      if (t.ends_on < from || t.ends_on > to || t.status_override === 'ended' || !S.isSettled(t, today)) continue;
      due++;
      if (list.some((x) => x.starts_on > t.ends_on && x.status_override !== 'ended' && S.isSettled(x, today) && S.dayDiff(x.starts_on, t.ends_on) <= Math.max(1, settings.grace_days + 1))) renewed++;
    }
  }
  return { columns: ['terms_ending', 'renewed', 'retention_rate'], rows: [{ terms_ending: due, renewed, retention_rate: due ? Math.round((renewed / due) * 1000) / 10 : null }] };
}

async function revenueByTier(pool, orgId, { from, to }) {
  const r = await pool.query(
    `SELECT COALESCE(tr.name, 'No tier') AS tier,
            COALESCE(SUM(CASE WHEN p.kind = 'payment' THEN p.amount_cents WHEN p.kind = 'refund' THEN -p.amount_cents ELSE 0 END)
                       FILTER (WHERE p.payment_date::date BETWEEN $2 AND $3 AND p.posting_status <> 'void'), 0)::bigint AS received_cents,
            COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -COALESCE(p.posted_contribution_cents, 0) ELSE COALESCE(p.posted_contribution_cents, 0) END)
                       FILTER (WHERE p.posting_status = 'posted' AND p.payment_date::date BETWEEN $2 AND $3), 0)::bigint AS contribution_cents,
            COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -COALESCE(p.posted_revenue_cents, 0) ELSE COALESCE(p.posted_revenue_cents, 0) END)
                       FILTER (WHERE p.posting_status = 'posted' AND p.payment_date::date BETWEEN $2 AND $3), 0)::bigint AS revenue_at_receipt_cents,
            COALESCE(SUM(CASE WHEN p.kind = 'waiver' THEN p.amount_cents ELSE 0 END) FILTER (WHERE p.approved_at IS NOT NULL AND p.payment_date::date BETWEEN $2 AND $3), 0)::bigint AS waived_cents
       FROM org_membership_payments p JOIN org_membership_terms t ON t.id = p.term_id LEFT JOIN org_membership_tiers tr ON tr.id = t.tier_id
      WHERE p.org_id = $1 GROUP BY 1`, [orgId, from, to]);
  const rec = await pool.query(
    `SELECT COALESCE(tr.name, 'No tier') AS tier, COALESCE(SUM(r.amount_cents), 0)::bigint AS cents
       FROM org_membership_recognition r JOIN org_membership_terms t ON t.id = r.term_id LEFT JOIN org_membership_tiers tr ON tr.id = t.tier_id
      WHERE r.org_id = $1 AND r.month BETWEEN date_trunc('month', $2::date) AND $3::date GROUP BY 1`, [orgId, from, to]);
  const recMap = new Map(rec.rows.map((x) => [x.tier, Number(x.cents)]));
  const tiers = new Set([...r.rows.map((x) => x.tier), ...recMap.keys()]);
  const rows = [...tiers].sort().map((tier) => {
    const x = r.rows.find((y) => y.tier === tier) || {};
    return {
      tier, received_cents: Number(x.received_cents || 0), waived_cents: Number(x.waived_cents || 0), contribution_cents: Number(x.contribution_cents || 0),
      dues_revenue_cents: Number(x.revenue_at_receipt_cents || 0) + (recMap.get(tier) || 0),
    };
  });
  return { columns: ['tier', 'received_cents', 'waived_cents', 'contribution_cents', 'dues_revenue_cents'], rows };
}

async function aging(pool, orgId, opts) {
  const today = M.today();
  const terms = (await allTerms(pool, orgId)).filter((t) => t.status_override !== 'ended' && !S.isSettled(t, today) && t.price_cents - t.covered_cents > 0 && !t.invoice_id);
  const buckets = [['not_started', -Infinity, -1], ['0_30', 0, 30], ['31_60', 31, 60], ['61_90', 61, 90], ['over_90', 91, Infinity]];
  const rows = buckets.map(([bucket]) => ({ bucket, terms: 0, owed_cents: 0 }));
  const detail = [];
  const names = opts && opts.detail ? new Map((await pool.query('SELECT id, display_name FROM org_constituents WHERE org_id = $1', [orgId])).rows.map((c) => [c.id, c.display_name])) : null;
  for (const t of terms) {
    const age = S.dayDiff(today, t.starts_on);
    const i = buckets.findIndex(([, lo, hi]) => age >= lo && age <= hi);
    const owed = t.price_cents - t.covered_cents;
    rows[i].terms++;
    rows[i].owed_cents += owed;
    if (names) detail.push({ display_name: names.get(t.constituent_id), starts_on: t.starts_on, days: age, owed_cents: owed, bucket: buckets[i][0] });
  }
  return { columns: ['bucket', 'terms', 'owed_cents'], rows, detail: names ? detail.sort((a, b) => b.days - a.days) : undefined };
}

async function growth(pool, orgId, { from, to }) {
  const settings = await M.getSettings(pool, orgId);
  const grouped = byContact(await allTerms(pool, orgId));
  const rows = months(from, to).map((m) => {
    const end = S.addDays(S.addMonths(m + '-01', 1), -1);
    const asOf = end > M.today() ? M.today() : end;
    const counts = { month: m, active: 0, grace: 0, pending: 0 };
    for (const list of grouped.values()) {
      const st = S.memberStatus(list, asOf, settings);
      if (st && counts[st.status] != null) counts[st.status]++;
    }
    return counts;
  });
  return { columns: ['month', 'active', 'grace', 'pending'], rows };
}

async function lapses(pool, orgId, { from, to }) {
  const settings = await M.getSettings(pool, orgId);
  const terms = await allTerms(pool, orgId);
  const grouped = byContact(terms);
  const reasons = new Map();
  for (const t of terms) {
    if (t.status_override !== 'ended' || !t.ended_on || t.ended_on < from || t.ended_on > to) continue;
    const k = t.status_reason || 'No reason given';
    reasons.set(k, (reasons.get(k) || 0) + 1);
  }
  let lapsedNoReason = 0;
  for (const list of grouped.values()) {
    for (const t of list) {
      if (t.status_override === 'ended') continue;
      const lapseDay = S.addDays(t.ends_on, settings.grace_days + 1);
      if (lapseDay < from || lapseDay > to || lapseDay > M.today()) continue;
      if (list.some((x) => x.starts_on > t.ends_on && x.status_override !== 'ended' && S.isSettled(x, lapseDay))) continue;
      if (!S.isSettled(t, lapseDay)) continue;
      lapsedNoReason++;
    }
  }
  const rows = [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));
  if (lapsedNoReason) rows.push({ reason: 'Did not renew', count: lapsedNoReason });
  return { columns: ['reason', 'count'], rows };
}

async function runReport(pool, orgId, name, q, opts) {
  if (!REPORTS.includes(name)) return { error: 'That report was not found.', status: 404 };
  if (name === 'aging') return aging(pool, orgId, opts);
  const r = range(q);
  if (r.error) return { error: r.error, status: 400 };
  const fn = { joins: joinsAndRenewals, retention, revenue: revenueByTier, growth, lapses }[name];
  return { from: r.from, to: r.to, ...(await fn(pool, orgId, r)) };
}

function toCsv(report) {
  const cell = csvCell;
  const cols = report.columns;
  const fmt = (k, v) => (k.endsWith('_cents') ? (Number(v || 0) / 100).toFixed(2) : v);
  return [cols.map((c) => c.replace(/_cents$/, '')).join(','), ...report.rows.map((r) => cols.map((c) => cell(fmt(c, r[c]))).join(','))].join('\r\n') + '\r\n';
}

module.exports = { REPORTS, months, runReport, toCsv };
