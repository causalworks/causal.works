'use strict';

const STOP = new Set([
  'ach', 'pmt', 'payment', 'pymt', 'pay', 'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'the', 'and', 'of',
  'bill', 'invoice', 'inv', 'check', 'chk', 'debit', 'credit', 'card', 'purchase', 'pos', 'web', 'online', 'transfer',
  'deposit', 'ref', 'id', 'for', 'to', 'from', 'org', 'foundation', 'fund', 'services', 'service', 'svcs', 'svc',
]);

function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

function tokenFound(tok, bankTokens) {
  return bankTokens.some((b) => b === tok || (tok.length >= 4 && b.length >= 4 && (tok.startsWith(b) || b.startsWith(tok))));
}

function alnum(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function dayDiff(a, b) {
  const x = new Date(String(a).slice(0, 10) + 'T00:00:00Z').getTime();
  const y = new Date(String(b).slice(0, 10) + 'T00:00:00Z').getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.abs(Math.round((x - y) / 86400000));
}

function scoreCandidate(line, cand, opt = {}) {
  const reasons = [];
  let score = 0;
  let nameOrRef = false;

  const bankTokens = tokens(line.text);
  const nameTokens = [...new Set((cand.names || []).flatMap(tokens))];
  if (nameTokens.length) {
    const hit = nameTokens.filter((t) => tokenFound(t, bankTokens)).length;
    if (hit) {
      score += Math.round(20 * (hit / nameTokens.length));
      nameOrRef = true;
      reasons.push(hit === nameTokens.length ? 'name matches' : 'part of the name matches');
    }
  }
  const ref = alnum(cand.reference);
  if (ref.length >= 3 && alnum(line.text).includes(ref)) { score += 15; nameOrRef = true; reasons.push('reference in the bank text'); }

  const diff = Math.abs(Number(cand.cents) - Number(line.cents));
  let amountClose = false;
  if (diff === 0) { score += 60; amountClose = true; reasons.push('exact amount'); }
  else if (diff <= Number(line.cents) * 0.02) { score += 40; amountClose = true; reasons.push('amount within 2%'); }
  else if (cand.partial) { score += 5; reasons.push('part of the amount'); }

  const dd = dayDiff(cand.date, line.date);
  if (dd != null) {
    if (dd <= 3) { score += 10; reasons.push('within 3 days'); }
    else if (dd <= 7) score += 6;
    else if (dd <= 15) score += 2;
  }

  const suggest = amountClose && ((dd != null && dd <= 7) || nameOrRef);
  return { score, suggest, reasons };
}

module.exports = { scoreCandidate, tokens };
