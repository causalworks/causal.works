'use strict';

// Printable HTML for a receivables or payables schedule, used to save a dated PDF copy.

const BUCKET_LABELS = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': 'Over 90 days' };

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(cents) {
  const n = Number(cents) / 100;
  const text = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return n < 0 ? '(' + text + ')' : text;
}

function scheduleReportHtml({ title, orgName, asOf, out, labels, ledgerLabel }) {
  const rows = out.items.map((i) => '<tr><td>' + esc(i.contact_name) + '</td><td>' + esc(labels[i.kind] || i.kind) + '</td><td>' + esc(i.reference) + '</td>'
    + '<td>' + esc(String(i.date || '').slice(0, 10)) + '</td><td>' + esc(String(i.due_date || '').slice(0, 10)) + '</td>'
    + '<td class="r">' + esc(money(i.balance_cents)) + '</td><td class="r">' + (i.days_past_due > 0 ? i.days_past_due : '') + '</td><td>' + esc(BUCKET_LABELS[i.bucket] || '') + '</td></tr>').join('');
  const tiles = ['current', '1_30', '31_60', '61_90', '90_plus'].map((b) => '<td class="r"><div class="k">' + esc(BUCKET_LABELS[b]) + '</div>' + esc(money(out.totals[b])) + '</td>').join('');
  const accounts = out.ledger.accounts.map((a) => esc(a.code + ' ' + a.name) + ' ' + esc(money(a.balance_cents))).join(' · ');
  const diff = Number(out.ledger.difference_cents);
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'body{font-family:Helvetica,Arial,sans-serif;font-size:10.5px;color:#1a1a1a;} h1{font-size:18px;margin:0 0 2px;} .sub{color:#555;margin:0 0 14px;}'
    + 'table{width:100%;border-collapse:collapse;} th,td{padding:5px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;} th{background:#f0eee8;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;}'
    + '.r{text-align:right;} .k{font-size:9px;color:#666;} .tot td{font-weight:700;border-top:2px solid #999;} .strip td{border:1px solid #ddd;padding:6px 8px;} .note{margin-top:12px;color:#444;}'
    + '</style></head><body><h1>' + esc(title) + '</h1><p class="sub">' + esc(orgName) + ' · as of ' + esc(asOf) + ' · ' + out.items.length + ' item' + (out.items.length === 1 ? '' : 's') + '</p>'
    + '<table class="strip"><tr><td class="r"><div class="k">Total</div><strong>' + esc(money(out.totals.total)) + '</strong></td>' + tiles + '</tr></table><br>'
    + '<table><thead><tr><th>Contact</th><th>Type</th><th>Reference</th><th>Date</th><th>Due</th><th class="r">Balance</th><th class="r">Days past due</th><th>Age</th></tr></thead><tbody>'
    + rows + '<tr class="tot"><td colspan="5">Total</td><td class="r">' + esc(money(out.totals.total)) + '</td><td></td><td></td></tr></tbody></table>'
    + '<p class="note"><strong>' + esc(ledgerLabel) + ': ' + esc(money(out.ledger.balance_cents)) + '</strong> (' + accounts + '). '
    + (diff === 0 ? 'It matches this schedule.' : 'Difference from the schedule: ' + esc(money(diff)) + ', from entries made directly in the ledger and the discount on multi-year pledges.') + '</p>'
    + '</body></html>';
}

module.exports = { scheduleReportHtml };
