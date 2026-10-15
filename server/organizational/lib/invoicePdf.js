'use strict';

// Builds the invoice as a PDF for emailing.

const { htmlToPdfBuffer } = require('./OrganizationalHtmlPdf');
const { loadOrgDocInfo, detailLines } = require('./orgLetterhead');
const { invoiceRemainingBalanceCents } = require('./billInvoicePayments');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (cents) => '$' + (Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (v) => (v ? esc(String(v).slice(0, 10)) : '');

async function buildInvoicePdf(pool, { orgId, invoice, customer, lines }) {
  const info = await loadOrgDocInfo(pool, orgId);
  const s = (await pool.query('SELECT payment_instructions FROM org_settings WHERE org_id = $1', [orgId])).rows[0] || {};
  const bal = await invoiceRemainingBalanceCents(pool, invoice.id);
  const number = invoice.invoice_number || ('#' + invoice.id);
  const rows = lines.map((l) => '<tr><td>' + esc(l.description || l.line_memo || '') + '</td><td class="r">' + esc(l.quantity) + '</td><td class="r">' + money(l.unit_amount_cents)
    + '</td><td class="r">' + money(Math.round(Number(l.quantity) * Number(l.unit_amount_cents))) + '</td></tr>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'body{font:13px/1.4 Helvetica,Arial,sans-serif;color:#111;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-start}'
    + 'h1{font-size:22px;margin:0 0 6px}h2{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:0 0 4px}'
    + '.band{display:flex;justify-content:space-between;margin:22px 0;padding:12px 0;border-top:1px solid #ccc;border-bottom:1px solid #ccc}'
    + '.due{font-size:20px;font-weight:600}table{width:100%;border-collapse:collapse}th,td{padding:6px 4px;border-bottom:1px solid #e3e3e3;text-align:left}'
    + '.r{text-align:right}.pay{margin:0 0 18px;white-space:pre-wrap}.facts td{border:0;padding:1px 0 1px 12px}.small{color:#555;font-size:11px}'
    + '</style></head><body><div class="top"><div><b style="font-size:16px">' + esc(info.name) + '</b><br>' + detailLines(info).map(esc).join('<br>') + '</div>'
    + '<div style="text-align:right"><h1>INVOICE</h1><table class="facts" style="width:auto;margin-left:auto"><tr><td>Invoice no.</td><td>' + esc(number) + '</td></tr>'
    + (invoice.reference ? '<tr><td>Reference / PO</td><td>' + esc(invoice.reference) + '</td></tr>' : '')
    + '<tr><td>Invoice date</td><td>' + day(invoice.invoice_date) + '</td></tr></table></div></div>'
    + '<div class="band"><div><h2>Bill to</h2>' + esc(customer.display_name) + (customer.mailing_address ? '<br>' + esc(customer.mailing_address).replace(/\n/g, '<br>') : '') + '</div>'
    + '<div><h2>Due date</h2><div style="font-size:16px">' + (day(invoice.due_date) || 'On receipt') + '</div></div>'
    + '<div style="text-align:right"><h2>Amount due</h2><div class="due">' + money(bal.remainingCents) + '</div></div></div>'
    + (s.payment_instructions ? '<div class="pay"><h2>How to pay</h2>' + esc(s.payment_instructions) + (invoice.reference ? '\nPlease quote ' + esc(invoice.reference) + ' with your payment.' : '') + '</div>' : '')
    + '<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr>' + rows
    + '<tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>' + money(bal.totalCents) + '</b></td></tr>'
    + (bal.creditedCents ? '<tr><td colspan="3">Credit notes applied</td><td class="r">-' + money(bal.creditedCents) + '</td></tr>' : '')
    + (bal.paidCents ? '<tr><td colspan="3">Payments received</td><td class="r">-' + money(bal.paidCents) + '</td></tr>' : '')
    + '<tr><td colspan="3" class="r"><b>Amount due</b></td><td class="r"><b>' + money(bal.remainingCents) + '</b></td></tr></table>'
    + (info.email ? '<p class="small" style="margin-top:24px">Questions about this invoice: ' + esc(info.email) + (info.phone ? ' · ' + esc(info.phone) : '') + '</p>' : '')
    + '</body></html>';
  return { pdf: await htmlToPdfBuffer(html), remainingCents: bal.remainingCents, number };
}

module.exports = { buildInvoicePdf };
