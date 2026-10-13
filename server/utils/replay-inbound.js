// Usage:
//   node server/utils/replay-inbound.js path/to/postmark-payload.json [http://localhost:3000/inbound]
//
// Replays a saved Postmark inbound payload to the local /inbound endpoint.

const fs = require('fs');
const path = require('path');

async function main() {
  const [,, payloadPathArg, urlArg] = process.argv;
  if (!payloadPathArg) {
    console.error('Usage: node server/utils/replay-inbound.js path/to/postmark-payload.json [http://localhost:3000/inbound]');
    process.exit(1);
  }

  const payloadPath = path.resolve(process.cwd(), payloadPathArg);
  const raw = fs.readFileSync(payloadPath, 'utf8');
  const payload = JSON.parse(raw);

  const url = urlArg || 'http://localhost:3000/inbound';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => '');
  console.log(`POST ${url} → ${res.status}`);
  if (text) console.log(text);
}

main().catch((err) => {
  console.error('Replay failed:', err && err.message ? err.message : err);
  process.exit(1);
});

