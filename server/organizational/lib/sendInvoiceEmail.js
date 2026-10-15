'use strict';

// Emails a sent invoice to the customer with a PDF attached, from the organization's name with its contact email as the reply address.

const { sendPlainEmail } = require('./sendPlainEmail');
const { loadOrgDocInfo } = require('./orgLetterhead');
const { buildInvoicePdf } = require('./invoicePdf');

const money = (cents) => '$' + (Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function sendInvoiceEmail(pool, { orgId, invoice, customerName, customerEmail, lines, totalCents }) {
  if (!customerEmail) return 'no_email';
  const info = await loadOrgDocInfo(pool, orgId);
  if (!info.email) return 'no_org_email';
  const number = invoice.invoice_number || ('#' + invoice.id);
  let built = null;
  try {
    const customer = (await pool.query('SELECT display_name, mailing_address FROM org_constituents WHERE id = $1 AND org_id = $2', [invoice.constituent_id, orgId])).rows[0] || { display_name: customerName };
    built = await buildInvoicePdf(pool, { orgId, invoice, customer, lines });
  } catch (e) { console.error('invoice pdf:', e.message); return 'failed'; }
  const out = [];
  out.push('Hello ' + (customerName || '') + ',', '');
  out.push(info.name + ' sent you invoice ' + number + ' for ' + money(built.remainingCents) + (invoice.due_date ? ', due ' + String(invoice.due_date).slice(0, 10) : '') + '.');
  out.push('The invoice is attached as a PDF.', '', 'Questions? Reply to this email.', '', info.name);
  const ok = await sendPlainEmail({
    to: customerEmail, subject: 'Invoice ' + number + ' from ' + info.name, text: out.join('\n'), attachments: [{ name: 'Invoice-' + number.replace(/[^A-Za-z0-9._-]/g, '') + '.pdf', content: built.pdf, contentType: 'application/pdf' }], fromName: info.name, replyTo: info.email,
  });
  return ok ? 'sent' : 'failed';
}

module.exports = { sendInvoiceEmail };
