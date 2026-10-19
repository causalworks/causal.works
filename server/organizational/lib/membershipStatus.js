'use strict';

// Membership rules: dues-member status, term dates, renewal window and proration.

const STATUSES = ['pending', 'active', 'grace', 'lapsed', 'ended'];

// --- Dates (plain YYYY-MM-DD strings, computed in UTC) ---

function toDay(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parts(day) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

function fromParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(day, n) {
  const { y, m, d } = parts(day);
  return fromParts(y, m, d + n);
}

function addMonths(day, n) {
  const { y, m, d } = parts(day);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return fromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

function dayDiff(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

// --- Settings ---

const DEFAULT_SETTINGS = {
  year_mode: 'rolling',
  fixed_start_month: 1,
  fixed_start_day: 1,
  renewal_window_days: 60,
  proration_mode: 'none',
  grace_days: 30,
};

function normalizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s) for (const k of Object.keys(DEFAULT_SETTINGS)) if (s[k] != null) out[k] = s[k];
  out.fixed_start_month = Number(out.fixed_start_month);
  out.fixed_start_day = Number(out.fixed_start_day);
  out.renewal_window_days = Number(out.renewal_window_days);
  out.grace_days = Number(out.grace_days);
  return out;
}

// --- Term dates ---

function fixedYearStartOnOrBefore(day, settings) {
  const { y } = parts(day);
  const m = settings.fixed_start_month;
  const d = Math.min(settings.fixed_start_day, daysInMonth(y, m));
  const thisYear = fromParts(y, m, d);
  if (thisYear <= day) return thisYear;
  return fromParts(y - 1, m, Math.min(settings.fixed_start_day, daysInMonth(y - 1, m)));
}

function nextFixedYearStart(day, settings) {
  const start = fixedYearStartOnOrBefore(day, settings);
  const { y } = parts(start);
  const m = settings.fixed_start_month;
  return fromParts(y + 1, m, Math.min(settings.fixed_start_day, daysInMonth(y + 1, m)));
}

// A new join: the term starts on the join date and runs to the end of the membership year.
// In fixed-year mode a join inside the renewal window before the next year starts on that year.
function joinTermDates(joinDay, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const join = toDay(joinDay);
  if (settings.year_mode === 'fixed') {
    const next = nextFixedYearStart(join, settings);
    if (dayDiff(next, join) <= settings.renewal_window_days) {
      return { starts_on: next, ends_on: addDays(addMonths(next, 12), -1), year_start: next };
    }
    const yearStart = fixedYearStartOnOrBefore(join, settings);
    return { starts_on: join, ends_on: addDays(next, -1), year_start: yearStart };
  }
  return { starts_on: join, ends_on: addDays(addMonths(join, 12), -1), year_start: join };
}

// A renewal follows on from the previous term without a gap; a renewal after a lapse starts
// as a new join on the given day.
function renewalTermDates(previousEndsOn, onDay, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const prevEnd = toDay(previousEndsOn);
  const day = toDay(onDay);
  const followOn = addDays(prevEnd, 1);
  if (prevEnd && dayDiff(day, prevEnd) <= settings.grace_days) {
    if (settings.year_mode === 'fixed') {
      const yearStart = fixedYearStartOnOrBefore(followOn, settings);
      return { starts_on: followOn, ends_on: addDays(nextFixedYearStart(yearStart, settings), -1), year_start: yearStart };
    }
    return { starts_on: followOn, ends_on: addDays(addMonths(followOn, 12), -1), year_start: followOn };
  }
  return joinTermDates(day, settings);
}

// Renewals are accepted from renewal_window_days before the next term starts.
function renewalOpen(previousEndsOn, onDay, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const followOn = addDays(toDay(previousEndsOn), 1);
  return dayDiff(followOn, toDay(onDay)) <= settings.renewal_window_days;
}

// --- Proration ---

// Monthly proration charges for whole months left in the membership year, counting the
// month the term starts in. A term that starts on the year start pays the full price.
function proratedPriceCents(fullCents, startsOn, yearStart, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const full = Number(fullCents) || 0;
  if (settings.proration_mode !== 'monthly' || settings.year_mode !== 'fixed') return full;
  const s = parts(toDay(startsOn));
  const y = parts(toDay(yearStart));
  const monthsIn = (s.y - y.y) * 12 + (s.m - y.m);
  const monthsLeft = Math.max(1, Math.min(12, 12 - monthsIn));
  return Math.round(full * monthsLeft / 12);
}

// --- Status ---

// Money settled against a term: payments less refunds, plus approved waivers.
function coveredCents(payments) {
  let total = 0;
  for (const p of payments || []) {
    if (p.posting_status === 'void') continue;
    const amt = Number(p.amount_cents) || 0;
    if (p.kind === 'refund') total -= amt;
    else if (p.kind === 'waiver') { if (p.approved_at) total += amt; }
    else total += amt + (Number(p.discount_cents) || 0);
  }
  return total;
}

// Days a monthly instalment plan stays in good standing after a failed payment while the provider retries.
const INSTALMENT_FAILURE_DAYS = 14;

// A term is settled when it is free, paid in full, or on a monthly instalment plan with at least one instalment
// paid and no failed payment older than INSTALMENT_FAILURE_DAYS.
function isSettled(term, today) {
  const price = Number(term.price_cents) || 0;
  if (price === 0) return true;
  const covered = term.covered_cents != null ? Number(term.covered_cents) : coveredCents(term.payments);
  if (covered >= price) return true;
  if (term.instalment_plan === 'monthly' && covered > 0) {
    if (!term.payment_failed_at) return true;
    const day = toDay(today);
    return !!day && dayDiff(day, toDay(term.payment_failed_at)) <= INSTALMENT_FAILURE_DAYS;
  }
  return false;
}

// The state of one term on a given day. 'upcoming' is a settled term that has not started.
function termState(term, today, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const day = toDay(today);
  if (term.status_override === 'ended') return 'ended';
  const starts = toDay(term.starts_on);
  const ends = toDay(term.ends_on);
  if (!isSettled(term, day)) return day > ends ? 'lapsed' : 'pending';
  if (day < starts) return 'upcoming';
  if (day <= ends) return 'active';
  return dayDiff(day, ends) <= settings.grace_days ? 'grace' : 'lapsed';
}

function sortTermsNewestFirst(terms) {
  return [...(terms || [])].sort((a, b) => {
    const s = String(toDay(b.starts_on)).localeCompare(String(toDay(a.starts_on)));
    return s !== 0 ? s : (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

// The status of a dues member from all of their terms. Returns null with no terms.
function memberStatus(terms, today, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const day = toDay(today);
  const sorted = sortTermsNewestFirst(terms);
  if (!sorted.length) return null;
  const states = sorted.map((t) => ({ term: t, state: termState(t, day, settings) }));
  const current = states.find((s) => s.state === 'active');
  if (current) return { status: 'active', term: current.term };
  const latest = states[0];
  if (latest.state === 'ended') return { status: 'ended', term: latest.term };
  const lastSettled = states.find((s) => s.state === 'grace' || (s.state === 'lapsed' && isSettled(s.term, day)));
  if (lastSettled && lastSettled.state === 'grace') return { status: 'grace', term: lastSettled.term };
  if (latest.state === 'pending' || latest.state === 'upcoming') return { status: 'pending', term: latest.term };
  return { status: 'lapsed', term: (lastSettled || latest).term };
}

// The term a renewal follows from: the newest term that is not ended.
function renewalBase(terms) {
  return sortTermsNewestFirst(terms).find((t) => t.status_override !== 'ended') || null;
}

module.exports = {
  STATUSES, DEFAULT_SETTINGS, INSTALMENT_FAILURE_DAYS,
  toDay, addDays, addMonths, dayDiff, normalizeSettings,
  joinTermDates, renewalTermDates, renewalOpen, proratedPriceCents,
  coveredCents, isSettled, termState, memberStatus, renewalBase, sortTermsNewestFirst,
};
