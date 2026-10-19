'use strict';

async function sendPlainEmail({ to, subject, text, fromName, replyTo, attachments, trackOpens, details }) {
  if (!to || !process.env.POSTMARK_API_KEY) {
    console.warn('sendPlainEmail: skipped (no recipient or POSTMARK_API_KEY not set):', subject);
    return details ? { ok: false, messageId: null } : false;
  }
  try {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY },
      body: JSON.stringify({ From: (fromName ? '"' + String(fromName).replace(/["\r\n]/g, '') + '" ' : '') + '<noreply@causal.works>', ...(replyTo ? { ReplyTo: replyTo } : {}), To: to, Subject: subject, TextBody: text, ...(attachments && attachments.length ? { Attachments: attachments.map((a) => ({ Name: a.name, Content: a.content.toString('base64'), ContentType: a.contentType })) } : {}), ...(trackOpens ? { TrackOpens: true } : {}), MessageStream: 'outbound' }),
    });
    if (!response.ok) {
      console.error('sendPlainEmail: Postmark refused:', response.status, (await response.text()).slice(0, 200));
      return details ? { ok: false, messageId: null } : false;
    }
    if (!details) return true;
    const data = await response.json().catch(() => ({}));
    return { ok: true, messageId: data.MessageID || null };
  } catch (e) {
    console.error('sendPlainEmail failed:', e.message);
    return details ? { ok: false, messageId: null } : false;
  }
}

module.exports = { sendPlainEmail };
