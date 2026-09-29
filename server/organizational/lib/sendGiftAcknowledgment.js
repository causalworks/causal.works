'use strict';

function formatDollars(amountCents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountCents / 100);
}

function formatDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildAcknowledgmentHtml({ gift, constituent, org }) {
  const donorName = constituent.display_name ||
    [constituent.first_name, constituent.last_name].filter(Boolean).join(' ') ||
    constituent.email;
  const amount = formatDollars(Number(gift.amount_cents));
  const date = formatDate(gift.received_at);
  const orgName = org.display_name;
  const ein = org.ein ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">EIN: ${org.ein}</p>` : '';

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827;">
      <p style="margin:0 0 20px;font-size:17px;font-weight:600;">${orgName}</p>
      <p style="margin:0 0 16px;line-height:1.6;">Dear ${donorName},</p>
      <p style="margin:0 0 16px;line-height:1.6;">
        Thank you for your generous gift of <strong>${amount}</strong> received on ${date}.
        Your support makes our work possible.
      </p>
      <p style="margin:0 0 16px;line-height:1.6;color:#374151;font-size:14px;">
        No goods or services were provided in exchange for this contribution.
        Your contribution is tax-deductible to the extent allowed by law.
      </p>
      ${ein}
      <p style="margin:0;line-height:1.6;">With gratitude,</p>
      <p style="margin:4px 0 0;font-weight:600;">${orgName}</p>
    </div>
  `.trim();
}

async function sendGiftAcknowledgment(pool, gift, constituent, org) {
  if (!constituent.email) throw new Error('Constituent has no email address');
  if (!process.env.POSTMARK_API_KEY) throw new Error('POSTMARK_API_KEY not set');

  const orgName = org.display_name;
  const html = buildAcknowledgmentHtml({ gift, constituent, org });
  const text = [
    `Dear ${constituent.display_name || constituent.email},`,
    '',
    `Thank you for your generous gift of ${formatDollars(Number(gift.amount_cents))} received on ${formatDate(gift.received_at)}.`,
    '',
    'No goods or services were provided in exchange for this contribution.',
    'Your contribution is tax-deductible to the extent allowed by law.',
    org.ein ? `EIN: ${org.ein}` : '',
    '',
    `With gratitude,`,
    orgName,
  ].filter(line => line !== undefined).join('\n');

  const payload = {
    From: `${orgName} via Causal <noreply@causal.works>`,
    To: constituent.email,
    Subject: `Thank you for your gift to ${orgName}`,
    TextBody: text,
    HtmlBody: html,
    MessageStream: 'outbound',
  };

  if (org.reply_to_email) {
    payload.ReplyTo = org.reply_to_email;
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

module.exports = { sendGiftAcknowledgment };
