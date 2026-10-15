'use strict';

async function sendPlainEmail({ to, subject, text, fromName, replyTo }) {
  if (!to || !process.env.POSTMARK_API_KEY) {
    console.warn('sendPlainEmail: skipped (no recipient or POSTMARK_API_KEY not set):', subject);
    return false;
  }
  try {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY },
      body: JSON.stringify({ From: (fromName ? '"' + String(fromName).replace(/["\r\n]/g, '') + '" ' : 'Causal ') + '<noreply@causal.works>', ...(replyTo ? { ReplyTo: replyTo } : {}), To: to, Subject: subject, TextBody: text, MessageStream: 'outbound' }),
    });
    if (!response.ok) {
      console.error('sendPlainEmail: Postmark refused:', response.status, (await response.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendPlainEmail failed:', e.message);
    return false;
  }
}

module.exports = { sendPlainEmail };
