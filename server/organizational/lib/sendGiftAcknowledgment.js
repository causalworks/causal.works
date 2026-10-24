'use strict';

const { loadOrgDocInfo, detailLines } = require('./orgLetterhead');
const { sponsoredReceiptInfo, sponsoredReceiptLines } = require('./sponsorGifts');
const { receiptStatement } = require('./giftBenefit');

function formatDollars(amountCents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountCents / 100);
}

function formatDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function buildAcknowledgmentHtml({ gift, constituent, org, info, sponsored }) {
  const donorName = esc(constituent.display_name ||
    [constituent.first_name, constituent.last_name].filter(Boolean).join(' ') ||
    constituent.email);
  const amount = formatDollars(Number(gift.amount_cents));
  const date = formatDate(gift.received_at);
  const orgName = esc(org.display_name);
  const message = (info && info.acknowledgmentMessage) || 'Your support makes our work possible.';
  const signoff = (info && info.acknowledgmentSignoff) || 'With gratitude,';
  const detail = info ? detailLines(info) : (org.ein ? ['EIN ' + org.ein] : []);
  const ein = detail.length ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">${detail.map(esc).join('<br>')}</p>` : '';
  const sponsorLines = sponsored ? sponsoredReceiptLines({ sponsorName: org.display_name, ...sponsored }) : [];
  const giftText = sponsored && sponsored.inKind ? 'your generous donation' : `your generous gift of <strong>${amount}</strong>`;

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827;">
      <p style="margin:0 0 20px;font-size:17px;font-weight:600;">${orgName}</p>
      <p style="margin:0 0 16px;line-height:1.6;">Dear ${donorName},</p>
      <p style="margin:0 0 16px;line-height:1.6;">
        Thank you for ${giftText} received on ${date}.
        ${esc(message)}
      </p>
      ${sponsorLines.map((l) => `<p style="margin:0 0 16px;line-height:1.6;">${esc(l)}</p>`).join('')}
      <p style="margin:0 0 16px;line-height:1.6;color:#374151;font-size:14px;">
        ${receiptStatement(gift).lines.map(esc).join(' ')}
      </p>
      ${ein}
      <p style="margin:0;line-height:1.6;">${esc(signoff)}</p>
      <p style="margin:4px 0 0;font-weight:600;">${orgName}</p>
    </div>
  `.trim();
}

async function sendGiftAcknowledgment(pool, gift, constituent, org) {
  if (!constituent.email) throw new Error('Constituent has no email address');
  if (!process.env.POSTMARK_API_KEY) throw new Error('POSTMARK_API_KEY not set');

  const orgName = org.display_name;
  const info = await loadOrgDocInfo(pool, gift.org_id);
  const sponsored = await sponsoredReceiptInfo(pool, gift);
  const html = buildAcknowledgmentHtml({ gift, constituent, org, info, sponsored });
  const text = [
    `Dear ${constituent.display_name || constituent.email},`,
    '',
    `Thank you for ${sponsored && sponsored.inKind ? 'your generous donation' : 'your generous gift of ' + formatDollars(Number(gift.amount_cents))} received on ${formatDate(gift.received_at)}. ${(info && info.acknowledgmentMessage) || 'Your support makes our work possible.'}`,
    '',
    ...(sponsored ? sponsoredReceiptLines({ sponsorName: orgName, ...sponsored }).concat(['']) : []),
    ...receiptStatement(gift).lines,
    org.ein ? `EIN: ${org.ein}` : '',
    '',
    (info && info.acknowledgmentSignoff) || 'With gratitude,',
    orgName,
  ].filter(line => line !== undefined).join('\n');

  const payload = {
    From: `"${String(orgName).replace(/["\r\n]/g, '')}" <noreply@causal.works>`,
    To: constituent.email,
    Subject: `Thank you for your gift to ${orgName}`,
    TextBody: text,
    HtmlBody: html,
    MessageStream: 'outbound',
  };

  if (info.replyTo) {
    payload.ReplyTo = info.replyTo;
  }

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
  console.log('Postmark gift acknowledgment sent to', constituent.email, '— Message-ID:', result.MessageID);
  return result;
}

module.exports = { sendGiftAcknowledgment, buildAcknowledgmentHtml };
