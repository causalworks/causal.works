'use strict';

// Emails a sent invoice to the customer as plain text, from the organization's name with its contact email as the reply address.

const { sendPlainEmail } = require('./sendPlainEmail');
const { loadOrgDocInfo, detailLines } = require('./orgLetterhead');

const money = (cents) => '$' + (Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function sendInvoiceEmail(pool, { orgId, invoice, customerName, customerEmail, lines, totalCents }) {
  if (!customerEmail) return 'no_email';
  const info = await loadOrgDocInfo(pool, orgId);
  if (!info.email) return 'no_org_email';
  const s = (await pool.query('SELECT payment_instructions FROM org_settings WHERE org_id = $1', [orgId])).rows[0] || {};
  const number = invoice.invoice_number || ('#' + invoice.id);
  const out = [];
  out.push('Hello ' + (customerName || '') + ',', '');
  out.push(info.name + ' sent you invoice ' + number + '.', '');
  out.push('Amount due: ' + money(totalCents));
  if (invoice.due_date) out.push('Due: ' + String(invoice.due_date).slice(0, 10));
  out.push('Invoice date: ' + String(invoice.invoice_date).slice(0, 10));
  if (invoice.reference) out.push('Reference: ' + invoice.reference);
  out.push('');
  for (const l of lines) {
    out.push('- ' + (l.description || l.line_memo || 'Item') + ': ' + money(Math.round(Number(l.quantity) * Number(l.unit_amount_cents))));
  }
  if (s.payment_instructions) out.push('', 'How to pay', s.payment_instructions);
  out.push('', 'Questions? Reply to this email.', '', info.name, ...detailLines(info));
  const ok = await sendPlainEmail({
    to: customerEmail, subject: 'Invoice ' + number + ' from ' + info.name, text: out.join('\n'), fromName: info.name, replyTo: info.email,
  });
  return ok ? 'sent' : 'failed';
}

module.exports = { sendInvoiceEmail };
