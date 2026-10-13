// Usage:
//   node server/utils/test-link-picker.js path/to/postmark-payload.json
//
// Prints the best URL and the top scored candidates.

const fs = require('fs');
const path = require('path');
const { pickBestUrl, pickTopUrls } = require('./link-picker');

function main() {
  const [,, payloadPathArg] = process.argv;
  if (!payloadPathArg) {
    console.error('Usage: node server/utils/test-link-picker.js path/to/postmark-payload.json');
    process.exit(1);
  }

  const payloadPath = path.resolve(process.cwd(), payloadPathArg);
  const raw = fs.readFileSync(payloadPath, 'utf8');
  const payload = JSON.parse(raw);

  const text = payload.text || payload.TextBody || '';
  const html = payload.HtmlBody || payload.html || '';

  const best = pickBestUrl(text, html);
  const top = pickTopUrls(text, html, 8);

  console.log('Best URL:\n', best);
  console.log('\nTop candidates:');
  top.forEach((l, i) => {
    console.log(`\n${i + 1}. ${l.url}`);
    if (l.text) console.log(`   text: ${l.text}`);
  });
}

main();

