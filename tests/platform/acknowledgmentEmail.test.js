'use strict';
// Names in the gift acknowledgment email are escaped.

const test = require('node:test');
const assert = require('node:assert');
const { buildAcknowledgmentHtml } = require('../../server/organizational/lib/sendGiftAcknowledgment');

test('donor and organization names are escaped in the email body', () => {
  const html = buildAcknowledgmentHtml({
    gift: { amount_cents: 5000, received_at: new Date('2026-01-05T12:00:00Z') },
    constituent: { display_name: 'A <b>"x"</b>' },
    org: { display_name: 'Org <script>alert(1)</script>' },
    info: null,
    sponsored: null,
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('Org &lt;script&gt;'));
});
