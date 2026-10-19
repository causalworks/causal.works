'use strict';

// Sponsored-project administrative fees: rule lookup, quarterly fee calculation, and what a fee run still has to post.

const DEFAULT_FEE_RATE = 6;
const FEE_KINDS = ['percent', 'flat', 'tiered'];

function pad2(n) { return String(n).padStart(2, '0'); }

function lastDay(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function isoDate(d) {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function fyStartMonth(fyEndMonth) {
  const end = Number.isInteger(fyEndMonth) && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  return (end % 12) + 1;
}

function quarterOf(date, fyEndMonth) {
  const iso = isoDate(date);
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = fyStartMonth(fyEndMonth);
  const qIndex = Math.floor(((m - start + 12) % 12) / 3);
  const sm = ((start - 1 + qIndex * 3) % 12) + 1;
  const sy = sm > m ? y - 1 : y;
  const em = ((sm + 1) % 12) + 1;
  const ey = em < sm ? sy + 1 : sy;
  return { start: `${sy}-${pad2(sm)}-01`, end: `${ey}-${pad2(em)}-${pad2(lastDay(ey, em))}` };
}

function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function quartersBetween(fromDate, throughDate, fyEndMonth) {
  const out = [];
  if (!fromDate || !throughDate || isoDate(fromDate) > isoDate(throughDate)) return out;
  let q = quarterOf(fromDate, fyEndMonth);
  const last = quarterOf(throughDate, fyEndMonth).end;
  while (q.end <= last) {
    out.push(q);
    q = quarterOf(nextDay(q.end), fyEndMonth);
  }
  return out;
}

function fiscalYearStart(date, fyEndMonth) {
  const iso = isoDate(date);
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = fyStartMonth(fyEndMonth);
  const sy = start === 1 ? y : (m >= start ? y : y - 1);
  return `${sy}-${pad2(start)}-01`;
}

function normalizeRule(r) {
  if (!r) return null;
  return {
    id: r.id != null ? Number(r.id) : null,
    kind: FEE_KINDS.includes(r.kind) ? r.kind : 'percent',
    rate: r.rate != null ? Number(r.rate) : null,
    tiers: Array.isArray(r.tiers) ? r.tiers.map((t) => ({
      up_to_cents: t.up_to_cents == null ? null : Number(t.up_to_cents), rate: Number(t.rate),
    })) : null,
    flat_cents: r.flat_cents != null ? Number(r.flat_cents) : null,
    minimum_quarter_cents: Number(r.minimum_quarter_cents || 0),
    effective_from: isoDate(r.effective_from),
  };
}

function ruleAt(rules, date, fallback) {
  const iso = isoDate(date);
  let found = null;
  for (const r of rules) {
    if (r.effective_from <= iso && (!found || r.effective_from > found.effective_from)) found = r;
  }
  return found || fallback || null;
}

function validateRule(input) {
  const kind = String(input.kind || 'percent');
  if (!FEE_KINDS.includes(kind)) return { error: 'Choose a fee type: percent, flat or tiered.' };
  const minimum = input.minimum_quarter_cents == null || input.minimum_quarter_cents === '' ? 0 : Number(input.minimum_quarter_cents);
  if (!Number.isInteger(minimum) || minimum < 0) return { error: 'The quarterly minimum must be zero or more.' };
  const out = { kind, rate: null, tiers: null, flat_cents: null, minimum_quarter_cents: minimum };
  if (kind === 'percent') {
    const rate = Number(input.rate);
    if (input.rate == null || input.rate === '' || !Number.isFinite(rate) || rate < 0) return { error: 'Enter the fee as a percent of money received (for example 6).' };
    out.rate = rate;
  } else if (kind === 'flat') {
    const flat = Number(input.flat_cents);
    if (!Number.isInteger(flat) || flat < 0) return { error: 'Enter the flat fee charged each quarter.' };
    out.flat_cents = flat;
  } else {
    const tiers = Array.isArray(input.tiers) ? input.tiers : null;
    if (!tiers || !tiers.length) return { error: 'Add at least one tier: a rate, and the yearly amount it applies up to.' };
    let prev = 0;
    const clean = [];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i] || {};
      const rate = Number(t.rate);
      if (!Number.isFinite(rate) || rate < 0) return { error: `Tier ${i + 1}: enter a rate of zero or more.` };
      const last = i === tiers.length - 1;
      if (t.up_to_cents == null || t.up_to_cents === '') {
        if (!last) return { error: `Tier ${i + 1}: only the last tier can have no upper amount.` };
        clean.push({ up_to_cents: null, rate });
      } else {
        const up = Number(t.up_to_cents);
        if (!Number.isInteger(up) || up <= prev) return { error: `Tier ${i + 1}: each upper amount must be larger than the one before.` };
        clean.push({ up_to_cents: up, rate });
        prev = up;
      }
    }
    if (clean[clean.length - 1].up_to_cents != null) clean.push({ up_to_cents: null, rate: clean[clean.length - 1].rate });
    out.tiers = clean;
  }
  return { rule: out };
}

function tieredFee(tiers, priorCents, cents) {
  let fee = 0;
  let pos = priorCents;
  let left = cents;
  let floor = 0;
  for (const t of tiers) {
    const ceil = t.up_to_cents == null ? Infinity : t.up_to_cents;
    if (pos < ceil && left > 0) {
      const room = ceil - Math.max(pos, floor);
      const take = Math.min(room, left);
      fee += take * t.rate / 100;
      left -= take;
      pos += take;
    }
    floor = ceil;
    if (left <= 0) break;
  }
  return fee;
}

// receipts: [{ date, cents, exempt }]. rules: rows from org_sponsor_fee_rules. fallback: rule used before the first row.
// Returns one row per fiscal quarter from the project start (or first receipt) through throughDate.
function computeQuarterFees({ receipts, rules, fallback, fyEndMonth, startDate, endDate, throughDate }) {
  const through = isoDate(throughDate);
  const norm = (rules || []).map(normalizeRule);
  const fb = normalizeRule(fallback);
  const rs = (receipts || [])
    .map((r) => ({ date: isoDate(r.date), cents: Number(r.cents), exempt: !!r.exempt }))
    .filter((r) => r.date && r.date <= through && Number.isFinite(r.cents))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const starts = [isoDate(startDate), rs.length ? rs[0].date : null].filter(Boolean).sort();
  if (!starts.length) return [];
  const projectStart = isoDate(startDate) || starts[0];
  const projectEnd = isoDate(endDate);
  const quarters = quartersBetween(starts[0], through, fyEndMonth);
  const yearToDate = new Map();
  const out = [];
  for (const q of quarters) {
    const complete = q.end <= through;
    let gross = 0, exempt = 0, variable = 0;
    for (const r of rs) {
      if (r.date < q.start || r.date > q.end) continue;
      gross += r.cents;
      if (r.exempt) { exempt += r.cents; continue; }
      const rule = ruleAt(norm, r.date, fb);
      if (!rule) continue;
      const fyKey = fiscalYearStart(r.date, fyEndMonth);
      const prior = yearToDate.get(fyKey) || 0;
      if (rule.kind === 'percent') variable += r.cents * rule.rate / 100;
      else if (rule.kind === 'tiered') variable += tieredFee(rule.tiers, prior, r.cents);
      yearToDate.set(fyKey, prior + r.cents);
    }
    const active = q.end >= projectStart && (!projectEnd || q.start <= projectEnd);
    const periodRule = ruleAt(norm, complete ? q.end : through, fb);
    let fee = variable;
    let minimumApplied = false;
    if (complete && active && periodRule) {
      if (periodRule.kind === 'flat') fee += periodRule.flat_cents || 0;
      if (periodRule.minimum_quarter_cents > 0 && fee < periodRule.minimum_quarter_cents) {
        fee = periodRule.minimum_quarter_cents;
        minimumApplied = true;
      }
    }
    out.push({
      period_start: q.start, period_end: q.end, complete,
      gross_cents: gross, exempt_cents: exempt, feeable_cents: gross - exempt,
      fee_cents: Math.round(fee), minimum_applied: minimumApplied,
      rule_id: periodRule ? periodRule.id : null,
    });
  }
  return out;
}

// periods: output of computeQuarterFees. posted: [{ period_end, amount_cents }] for live (not voided) fee entries.
function feesDue(periods, posted, throughDate) {
  const through = isoDate(throughDate);
  const byEnd = new Map();
  for (const p of posted || []) {
    const k = isoDate(p.period_end);
    byEnd.set(k, (byEnd.get(k) || 0) + Number(p.amount_cents));
  }
  const out = [];
  for (const p of periods) {
    if (!p.complete || p.period_end > through) continue;
    const already = byEnd.get(p.period_end) || 0;
    const due = p.fee_cents - already;
    if (due !== 0) out.push({ ...p, posted_cents: already, due_cents: due });
  }
  return out;
}

function fallbackRule(project, orgDefaults, sponsorSettings) {
  const rate = project && project.admin_rate != null ? Number(project.admin_rate)
    : orgDefaults && orgDefaults.default_admin_rate != null ? Number(orgDefaults.default_admin_rate)
      : DEFAULT_FEE_RATE;
  return {
    id: null, kind: 'percent', rate,
    minimum_quarter_cents: sponsorSettings ? Number(sponsorSettings.default_fee_minimum_cents || 0) : 0,
    effective_from: '1900-01-01',
  };
}

module.exports = {
  DEFAULT_FEE_RATE, FEE_KINDS, quarterOf, quartersBetween, fiscalYearStart, normalizeRule, ruleAt, validateRule,
  tieredFee, computeQuarterFees, feesDue, fallbackRule, isoDate,
};
