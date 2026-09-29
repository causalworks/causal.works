'use strict';

// Outbound-only notification for the expense claim message thread (see migration 238) --
// there is no inbound-email parsing, so the email is explicit that replying to it does
// nothing. Structurally mirrors sendGiftAcknowledgment.js (same Postmark call shape, same
// per-secret env var convention).

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildMessageHtml({ orgName, authorEmail, messageBody, appLink }) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827;">
      <p style="margin:0 0 16px;font-size:17px;font-weight:600;">${escapeHtml(orgName)} — Expense claim message</p>
      <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(authorEmail || 'A user')} wrote:</p>
      <blockquote style="margin:0 0 20px;padding:12px 16px;background:#f3f4f6;border-left:3px solid #d1d5db;white-space:pre-wrap;">${escapeHtml(messageBody)}</blockquote>
      <p style="margin:0 0 16px;line-height:1.6;">
        <a href="${escapeHtml(appLink)}" style="color:#2563eb;">Open this claim</a> to reply.
      </p>
      <p style="margin:0;line-height:1.6;font-size:13px;color:#6b7280;">
        This is a one-way notification — replying to this email will not reach ${escapeHtml(authorEmail || 'the sender')}.
      </p>
    </div>
  `.trim();
}

async function sendExpenseClaimMessageEmail(pool, { recipients, claimId, orgName, authorEmail, messageBody, slug }) {
  if (!process.env.POSTMARK_API_KEY) throw new Error('POSTMARK_API_KEY not set');
  if (!recipients || !recipients.length) return;

  const appLink = `https://causal.works/organizational/o/${encodeURIComponent(slug)}/expense-claims?focus=${claimId}`;
  const html = buildMessageHtml({ orgName, authorEmail, messageBody, appLink });
  const text = [
    `${orgName} — Expense claim message`,
    '',
    `${authorEmail || 'A user'} wrote:`,
    '',
    messageBody,
    '',
    `Open this claim to reply: ${appLink}`,
    '',
    `This is a one-way notification — replying to this email will not reach ${authorEmail || 'the sender'}.`,
  ].join('\n');

  for (const to of recipients) {
    const payload = {
      From: `${orgName} via Causal <noreply@causal.works>`,
      To: to,
      Subject: `New message on expense claim #${claimId}`,
      TextBody: text,
      HtmlBody: html,
      MessageStream: 'outbound',
    };
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Postmark error ${response.status}: ${result.Message || JSON.stringify(result)}`);
    }
  }
}

module.exports = { sendExpenseClaimMessageEmail };
