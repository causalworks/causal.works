// Usage:
//   node server/utils/pull-postmark-inbound.js --recipient you@domain.com --from reply@emails.sierraclub.org --count 20
//
// Fetches recent inbound messages from Postmark and prints URL extraction results.
// This does NOT store bodies in DB; it's meant for debugging.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { pickBestUrl, pickTopUrls } = require('./link-picker');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function numArg(flag, fallback) {
  const v = Number(getArg(flag));
  return Number.isFinite(v) ? v : fallback;
}

async function postmarkGet(path, query) {
  const base = 'https://api.postmarkapp.com';
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === null || v === undefined || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  const token = process.env.POSTMARK_API_KEY;
  if (!token) throw new Error('Missing POSTMARK_API_KEY in .env');

  const res = await fetch(url.toString(), {
    headers: {
      'X-Postmark-Server-Token': token,
      'Accept': 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Postmark ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  const recipient = getArg('--recipient') || null;
  const fromemail = getArg('--from') || null;
  const subject = getArg('--subject') || null;
  const count = Math.max(1, Math.min(50, numArg('--count', 20)));

  const list = await postmarkGet('/messages/inbound', {
    count,
    offset: 0,
    recipient,
    fromemail,
    subject,
  });

  const messages = list?.InboundMessages || list?.Messages || list?.inboundmessages || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    console.log('No inbound messages matched.');
    return;
  }

  for (const m of messages) {
    const messageId =
      m.MessageID ||
      m.MessageId ||
      m.messageID ||
      m.messageId ||
      m.ID ||
      m.Id;
    const subj = m.Subject || '';
    const from = m.From || '';
    const to = m.To || '';

    let details = null;
    try {
      details = await postmarkGet(`/messages/inbound/${encodeURIComponent(messageId)}/details`, {});
    } catch (e) {
      console.log(`\nMessage ${messageId}: failed to fetch details (${e.message})`);
      continue;
    }

    const textBody = details.TextBody || details.text || '';
    const htmlBody = details.HtmlBody || details.html || '';

    const best = pickBestUrl(textBody, htmlBody);
    const top = pickTopUrls(textBody, htmlBody, 8);

    console.log('\n---');
    console.log(`MessageID: ${messageId}`);
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subj}`);
    console.log(`Best URL: ${best || '(none)'}`);
    console.log('Top URLs:');
    for (const t of top) {
      console.log(`- ${t.url}${t.text ? `  (text: ${t.text})` : ''}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});

