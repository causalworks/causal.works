'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { parse } = require('csv-parse/sync');

const SYN = {
  date: ['date', 'posting date', 'post date', 'posted date', 'transaction date', 'trans date', 'statement date', 'effective date', 'value date'],
  amount: ['amount', 'transaction amount', 'amt'],
  debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'payments', 'payment', 'money out', 'paid out', 'debit amount'],
  credit: ['credit', 'credits', 'deposit', 'deposits', 'money in', 'paid in', 'credit amount'],
  description: ['description', 'memo', 'details', 'narrative', 'transaction description', 'particulars', 'remarks', 'transaction details'],
  payee: ['payee', 'name', 'merchant', 'counterparty'],
  fitid: ['fitid', 'transaction id', 'reference', 'reference number'],
  type: ['type', 'transaction type', 'dr/cr', 'debit/credit', 'cr/dr'],
};

function norm(h) { return String(h || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function mapColumns(headers) {
  const idx = {};
  const lower = headers.map(norm);
  for (const [key, names] of Object.entries(SYN)) {
    for (const n of names) {
      const i = lower.indexOf(n);
      if (i >= 0) { idx[key] = i; break; }
    }
  }
  return idx;
}

function moneyToCents(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (/^-/.test(s)) { neg = true; s = s.slice(1); } else if (/^\+/.test(s)) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const c = Math.round(Number.parseFloat(s) * 100);
  return neg ? -c : c;
}

function centsToDecimal(c) { return (c / 100).toFixed(2); }

// ───────────────────────── CSV ─────────────────────────

function readCsv(buffer) {
  const text = buffer.toString('utf8');
  let rows;
  try {
    rows = parse(text, { skip_empty_lines: true, relax_column_count: true, trim: true, bom: true });
  } catch (e) {
    throw new Error('Could not read this CSV: ' + e.message);
  }
  let h = -1; let cols = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const c = mapColumns(rows[i]);
    if (c.date != null && (c.amount != null || c.debit != null || c.credit != null)) { h = i; cols = c; break; }
  }
  if (h < 0) {
    const first = (rows[0] || []).filter(Boolean).slice(0, 12).join(', ');
    throw new Error('Could not find a date column and an amount (or debit and credit) column in this CSV. The columns I see are: ' + (first || 'none') + '.');
  }
  const out = []; const errors = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k) => (cols[k] != null ? r[cols[k]] : undefined);
    const dateRaw = get('date');
    let cents = null;
    if (cols.amount != null) {
      cents = moneyToCents(get('amount'));
      const t = norm(get('type'));
      if (cents != null && t) {
        if (/^(debit|dr|withdrawal|payment|purchase|check)/.test(t) && cents > 0) cents = -cents;
        else if (/^(credit|cr|deposit)/.test(t) && cents < 0) cents = -cents;
      }
    } else {
      const d = moneyToCents(get('debit')); const c = moneyToCents(get('credit'));
      if (d != null || c != null) cents = (c || 0) - Math.abs(d || 0);
    }
    if (!String(dateRaw || '').trim() && cents == null) continue;
    out.push({
      row: i - h,
      date: dateRaw, amountCents: cents,
      description: get('description') || '', payee: get('payee') || '', fitid: get('fitid') || '',
    });
  }
  return { kind: 'csv', rows: out, errors, opening_cents: null, closing_cents: null, warnings: [] };
}

// ───────────────────────── PDF ─────────────────────────

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const MONEY = /(?<![\w.])\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:\s?(?:CR|DR)\b)?(?![\w.])|(?<![\w.])-?\$?\d+\.\d{2}(?![\w.])/gi;

function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function leadingDate(line, yearHint) {
  let m;
  if ((m = line.match(/^\s*(\d{4})-(\d{2})-(\d{2})\b/))) return { iso: iso(+m[1], +m[2], +m[3]), len: m[0].length };
  if ((m = line.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return { iso: iso(y, +m[1], +m[2]), len: m[0].length }; }
  if ((m = line.match(new RegExp('^\\s*' + MON + '\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b', 'i')))) return { iso: iso(m[3] ? +m[3] : yearHint, MONTHS[m[1].toLowerCase()], +m[2]), len: m[0].length };
  if ((m = line.match(new RegExp('^\\s*(\\d{1,2})\\s+' + MON + '(?:\\s+(\\d{4}))?\\b', 'i')))) return { iso: iso(m[3] ? +m[3] : yearHint, MONTHS[m[2].toLowerCase()], +m[1]), len: m[0].length };
  if ((m = line.match(/^\s*(\d{1,2})\/(\d{1,2})(?![/\d-])/))) return { iso: iso(yearHint, +m[1], +m[2]), len: m[0].length };
  return null;
}

function execPdftotext(buffer) {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), 'stmt-'), (err, dir) => {
      if (err) return reject(err);
      const file = path.join(dir, 'in.pdf');
      const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
      fs.writeFile(file, buffer, (e2) => {
        if (e2) { cleanup(); return reject(e2); }
        execFile('pdftotext', ['-layout', file, '-'], { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }, (e3, stdout) => {
          cleanup();
          if (e3) return reject(new Error('Could not read this PDF.'));
          resolve(stdout);
        });
      });
    });
  });
}

function yearOf(text) {
  const counts = {};
  (text.match(/\b20\d{2}\b/g) || []).forEach((y) => { counts[y] = (counts[y] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? +best[0] : new Date().getFullYear();
}

function balanceFrom(text, words) {
  const re = new RegExp('(?:' + words + ')\\s+balance[^\\d$()\\-]*([\\-]?\\$?\\(?-?[\\d,]+\\.\\d{2}\\)?)', 'i');
  const m = text.match(re);
  return m ? moneyToCents(m[1]) : null;
}

async function readPdf(buffer) {
  const text = await execPdftotext(buffer);
  if (text.replace(/\s/g, '').length < 80) {
    throw new Error('This PDF has no readable text, so it is probably a scan. Reading scanned statements is not available yet; use your bank\'s CSV download instead.');
  }
  const lines = text.split(/\r?\n/);
  const yearHint = yearOf(text);
  const opening = balanceFrom(text, 'opening|beginning|previous|starting');
  const closing = balanceFrom(text, 'closing|ending|new');

  let colDebit = null; let colCredit = null;
  for (const l of lines) {
    const dm = l.match(/(payments?|debits?|withdrawals?|money out)/i); const cm = l.match(/(deposits?|credits?|money in)/i);
    if (dm && cm && /date/i.test(l)) { colDebit = dm.index + dm[0].length; colCredit = cm.index + cm[0].length; break; }
  }

  const rows = []; const errors = []; const warnings = [];
  let prevBalance = opening; let last = null; let n = 0;
  for (const line of lines) {
    const d = leadingDate(line, yearHint);
    const rest = d ? line.slice(d.len) : line;
    const tokens = [];
    let mt; MONEY.lastIndex = 0;
    while ((mt = MONEY.exec(rest)) !== null) tokens.push({ raw: mt[0], at: (d ? d.len : 0) + mt.index + mt[0].length });
    const desc = rest.replace(MONEY, ' ').replace(/\s+/g, ' ').trim();

    if (d && d.iso && tokens.length && !/\b(opening|beginning|closing|ending|previous|brought forward|carried forward)\b.*\bbalance\b/i.test(desc)) {
      n += 1;
      let cents = null;
      let amountTok = tokens[0]; let balTok = null;
      if (tokens.length >= 2) { amountTok = tokens[tokens.length - 2]; balTok = tokens[tokens.length - 1]; }
      const mag = Math.abs(moneyToCents(amountTok.raw.replace(/\s?(CR|DR)$/i, '')) || 0);
      const bal = balTok ? moneyToCents(balTok.raw) : null;
      if (bal != null && prevBalance != null) {
        const delta = bal - prevBalance;
        if (Math.abs(delta) === mag) cents = delta > 0 ? mag : -mag;
      }
      if (cents == null) {
        const suffix = (amountTok.raw.match(/(CR|DR)$/i) || [])[1];
        if (suffix) cents = suffix.toUpperCase() === 'CR' ? mag : -mag;
        else if (colDebit != null && colCredit != null) cents = Math.abs(amountTok.at - colDebit) <= Math.abs(amountTok.at - colCredit) ? -mag : mag;
        else if (/^\(|-$|^-/.test(amountTok.raw.replace(/[$\s]/g, ''))) cents = -mag;
        else if (/\b(deposit|credit|refund|interest|transfer from)\b/i.test(desc)) cents = mag;
        else if (/\b(withdrawal|debit|payment|purchase|fee|check|transfer to)\b/i.test(desc)) cents = -mag;
      }
      if (bal != null) prevBalance = bal;
      if (cents == null) { errors.push({ row: n, message: 'Could not tell whether this line is money in or out: ' + desc.slice(0, 60) }); last = null; continue; }
      last = { row: n, date: d.iso, amountCents: cents, description: desc, payee: '', fitid: '' };
      rows.push(last);
    } else if (!d && last && !tokens.length && /^\s{2,}\S/.test(line) && desc && desc.length < 80 && !/page \d|statement|balance/i.test(desc)) {
      last.description = (last.description + ' ' + desc).trim();
    } else if (!tokens.length) {
      last = d ? null : last;
    }
  }
  if (!rows.length) throw new Error('I could not find transaction lines in this PDF. Use your bank\'s CSV download instead, or tell us the bank so we can add it.');

  let balanceCheck = null;
  if (opening != null && closing != null) {
    const sum = rows.reduce((t, r) => t + r.amountCents, 0);
    balanceCheck = { expected_cents: closing - opening, actual_cents: sum, ok: closing - opening === sum };
    if (!balanceCheck.ok) warnings.push('The lines read from the PDF add up to ' + centsToDecimal(sum) + ' but the statement balances differ by ' + centsToDecimal(closing - opening) + '. Check the preview before importing.');
  } else {
    warnings.push('No opening and closing balance found, so the lines could not be checked against the statement.');
  }
  return { kind: 'pdf', rows, errors, opening_cents: opening, closing_cents: closing, balance_check: balanceCheck, warnings };
}

async function readStatementFile(buffer, filename, mimetype) {
  const name = String(filename || '').toLowerCase();
  const isPdf = /\.pdf$/.test(name) || mimetype === 'application/pdf' || buffer.slice(0, 5).toString() === '%PDF-';
  const result = isPdf ? await readPdf(buffer) : readCsv(buffer);
  result.records = result.rows.map((r) => ({
    date: r.date, amount: r.amountCents == null ? '' : centsToDecimal(r.amountCents),
    description: r.description, payee: r.payee, fitid: r.fitid,
  }));
  return result;
}

module.exports = { readStatementFile, moneyToCents };
