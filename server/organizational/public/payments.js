'use strict';

// Payment provider webhooks. The provider calls this address with signed events; the signature is checked against the
// workspace's stored webhook secret, each event id is handled once, and only confirmed events change records.
// Listed in route-access-allowlist.json.

const { publicRateLimit } = require('../lib/rateLimit');
const { enterWorkspace } = require('../lib/publicLinks');
const { getProvider } = require('../lib/payments');
const P = require('../lib/membershipPayments');
const M = require('../lib/membership');
const crypto = require('crypto');
const { NS, withLock } = require('../lib/advisoryLock');

function registerPaymentWebhookRoutes(app, pool, opts) {
  const o = opts || {};
  const limit = publicRateLimit({ ipCapacity: 200, ipPerMinute: 120, workspaceCapacity: 600, workspacePerMinute: 300, now: o.now });

  app.post('/api/public/:slug/payments/:provider/webhook', limit, async (req, res) => {
    try {
      const ws = await enterWorkspace(pool, req.params.slug);
      if (!ws) return res.status(404).json({ error: 'Not found.' });
      let provider;
      try { provider = getProvider(req.params.provider); } catch (e) { return res.status(404).json({ error: 'Not found.' }); }
      const mode = (await M.getSettings(pool, ws.id)).payment_mode === 'live' ? 'live' : 'test';
      const accounts = (await P.loadAccounts(pool, ws.id, req.params.provider)).filter((a) => a.mode === mode);
      const payload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      let event = null;
      for (const a of accounts) {
        const secret = P.reveal(a, 'webhook_secret');
        if (!secret) continue;
        try { event = provider.verifyWebhook({ payload, headers: req.headers || {}, secret, now: o.now && o.now() }); break; } catch (e) { /* try the next secret */ }
      }
      if (!event) return res.status(400).json({ error: 'The signature check failed.' });
      const ev = provider.normalize(event);
      if (!ev.id) return res.status(400).json({ error: 'The event has no id.' });
      if (ev.livemode !== undefined && ev.livemode !== (mode === 'live')) return res.json({ received: true, ignored: true });
      const key = parseInt(crypto.createHash('sha256').update(req.params.provider + ':' + ev.id).digest('hex').slice(0, 7), 16);
      const out = await withLock(pool, NS.paymentEvent, key, async () => {
        const row = (await pool.query(
          `INSERT INTO payment_provider_events (provider, event_id, org_id, event_type) VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider, event_id) DO UPDATE SET provider = EXCLUDED.provider RETURNING id, processed_at`,
          [req.params.provider, ev.id, ws.id, ev.kind])).rows[0];
        if (row.processed_at) return { duplicate: true };
        const result = await P.handleEvent(pool, ws.id, ev);
        await pool.query('UPDATE payment_provider_events SET processed_at = now(), result = $1 WHERE id = $2', [String(result).slice(0, 500), row.id]);
        return {};
      }, null);
      if (!out) return res.status(503).json({ error: 'The event is being handled. The provider will send it again.' });
      return res.json({ received: true, ...(out.duplicate ? { duplicate: true } : {}) });
    } catch (e) {
      console.error('POST payment webhook:', e.message);
      return res.status(500).json({ error: 'The event could not be handled. The provider will send it again.' });
    }
  });
}

module.exports = { registerPaymentWebhookRoutes };
