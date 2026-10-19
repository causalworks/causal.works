'use strict';

// Delivery and open reports from the email provider for membership messages. The provider sends them with a shared token
// header; without the token set on the server, nothing is accepted. Listed in route-access-allowlist.json.

const crypto = require('crypto');
const { publicRateLimit } = require('../lib/rateLimit');

const KINDS = { Delivery: 'delivered', Open: 'opened', Bounce: 'bounced' };

function tokenOk(req) {
  const want = process.env.POSTMARK_WEBHOOK_TOKEN || '';
  const got = String((req.headers && req.headers['x-webhook-token']) || '');
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function registerEmailWebhookRoutes(app, pool, opts) {
  const o = opts || {};
  const limit = publicRateLimit({ ipCapacity: 300, ipPerMinute: 300, workspaceCapacity: 1000, workspacePerMinute: 1000, now: o.now });

  app.post('/api/public/email/postmark/webhook', limit, async (req, res) => {
    if (!tokenOk(req)) return res.status(401).json({ error: 'Not accepted.' });
    try {
      const b = req.body || {};
      const kind = KINDS[b.RecordType];
      if (!kind || !b.MessageID) return res.json({ received: true, used: false });
      const at = b.DeliveredAt || b.ReceivedAt || b.BouncedAt || new Date().toISOString();
      const r = await pool.query('SELECT org_membership_message_event($1, $2, $3) AS n', [String(b.MessageID), kind, at]);
      return res.json({ received: true, used: Number(r.rows[0].n) > 0 });
    } catch (e) {
      console.error('POST email webhook:', e.message);
      return res.status(500).json({ error: 'The report could not be stored.' });
    }
  });
}

module.exports = { registerEmailWebhookRoutes };
