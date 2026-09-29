'use strict';

const { requireAuth } = require('../../auth');

function registerEveryorgRoutes(app, pool) {

  app.post('/webhooks/everyorg', async (req, res) => {
    try {
      const expectedAuth = String(process.env.EVERYORG_WEBHOOK_AUTH || '').trim();
      const authHeader = String(req.get('Authorization') || '').trim();
      if (!expectedAuth || authHeader !== expectedAuth) {
        console.warn('⚠️ Every.org webhook unauthorized attempt');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const body = req.body || {};
      const chargeId = String(body.chargeId || '').trim();
      const toNonprofit = body.toNonprofit || {};
      const amountRaw = String(body.amount || '').trim();
      const currency = String(body.currency || 'USD').trim().toUpperCase();
      const donationDate = body.donationDate ? new Date(body.donationDate) : new Date();
      const partnerDonationId = String(body.partnerDonationId || '').trim();

      const partnerMatch = partnerDonationId.match(/^causal_user_(\d+)_org_(\d+|null)$/);
      if (!partnerMatch) {
        console.warn(`⚠️ Every.org webhook: unrecognised partnerDonationId: ${partnerDonationId}`);
        return res.status(200).json({ ok: true });
      }

      const userId = Number.parseInt(partnerMatch[1], 10);
      let orgId = partnerMatch[2] === 'null' ? null : Number.parseInt(partnerMatch[2], 10);
      if (orgId !== null && (!Number.isInteger(orgId) || orgId < 1)) orgId = null;

      if (!Number.isInteger(userId) || userId < 1) {
        console.warn(`⚠️ Every.org webhook: unrecognised partnerDonationId: ${partnerDonationId}`);
        return res.status(200).json({ ok: true });
      }

      const userExists = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
      if (!userExists.rows.length) {
        console.warn(`⚠️ Every.org webhook: user not found for partnerDonationId: ${partnerDonationId}`);
        return res.status(200).json({ ok: true });
      }

      const parsedAmount = Number.parseFloat(amountRaw);
      const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : null;
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        console.warn(`⚠️ Every.org webhook: invalid amount: ${amountRaw}`);
        return res.status(200).json({ ok: true });
      }

      const nonprofitName = String(toNonprofit.name || '').trim() || 'Unknown nonprofit';
      const nonprofitEin = String(toNonprofit.ein || '').trim() || null;
      const contributedAtIso = Number.isNaN(donationDate.getTime()) ? new Date().toISOString() : donationDate.toISOString();
      let orgIdForInsert = orgId;
      if (orgIdForInsert !== null) {
        const orgExists = await pool.query('SELECT id FROM orgs WHERE id = $1 LIMIT 1', [orgIdForInsert]);
        if (!orgExists.rows.length) {
          console.warn(`⚠️ Every.org webhook: org_id ${orgIdForInsert} not found in orgs table, inserting with org_id=null`);
          orgIdForInsert = null;
        }
      }

      try {
        await pool.query(
          `INSERT INTO contributions
            (user_id, org_id, org_name, ein, amount_cents, currency, source, everyorg_charge_id, contributed_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'everyorg', $7, $8)`,
          [userId, orgIdForInsert, nonprofitName, nonprofitEin, amountCents, currency, chargeId || null, contributedAtIso]
        );
      } catch (e) {
        if (e && e.code === '23505') {
          return res.status(200).json({ ok: true });
        }
        throw e;
      }

      console.log(`🎁 Every.org webhook: $${amountRaw} → ${nonprofitName} for user ${userId}`);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('❌ /webhooks/everyorg error:', e.message);
      return res.status(200).json({ ok: true });
    }
  });

  app.get('/api/everyorg/donate-link', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const orgIdRaw = req.query.org_id;
      const orgSlugParam = String(req.query.org_slug || '').trim();
      const amountCentsRaw = req.query.amount_cents;

      const orgId = Number.parseInt(String(orgIdRaw || ''), 10);
      if (!Number.isInteger(orgId) || orgId < 1) return res.status(400).json({ error: 'Invalid org_id' });
      let orgSlug = orgSlugParam;

      const orgRowRes = await pool.query(
        `SELECT id, name, ein, everyorg_slug FROM orgs WHERE id = $1 LIMIT 1`,
        [orgId]
      );
      if (!orgRowRes.rows.length) return res.status(404).json({ error: 'org_not_found' });
      const org = orgRowRes.rows[0];
      if (!orgSlug) orgSlug = String(org.everyorg_slug || '').trim();

      if (!orgSlug) {
        const publicKey = String(process.env.EVERYORG_PUBLIC_KEY || '').trim();
        if (!publicKey) return res.status(404).json({ error: 'org_not_found_on_everyorg' });
        const searchTerms = [];
        if (org.ein) searchTerms.push(String(org.ein).trim());
        searchTerms.push(String(org.name || '').trim());

        for (const term of searchTerms) {
          if (!term) continue;
          try {
            const sr = await fetch(
              `https://partners.every.org/v0.2/search/${encodeURIComponent(term)}?apiKey=${encodeURIComponent(publicKey)}&take=1`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (!sr.ok) continue;
            const searchData = await sr.json().catch(() => null);
            const first = searchData?.nonprofits?.[0] || searchData?.results?.[0] || null;
            const slugFound = String(first?.slug || '').trim();
            if (slugFound) {
              orgSlug = slugFound;
              await pool.query(`UPDATE orgs SET everyorg_slug = COALESCE(NULLIF(everyorg_slug, ''), $1) WHERE id = $2`, [slugFound, orgId]);
              break;
            }
          } catch (_) {
            // Continue to next term.
          }
        }
      }

      if (!orgSlug) return res.status(404).json({ error: 'org_not_found_on_everyorg' });

      const webhookToken = String(process.env.EVERYORG_WEBHOOK_TOKEN || '').trim();
      const url = new URL(`https://www.every.org/${encodeURIComponent(orgSlug)}`);
      url.hash = 'donate';
      url.searchParams.set('partnerDonationId', `causal_user_${userId}_org_${orgId}`);
      url.searchParams.set('webhook_token', webhookToken);
      url.searchParams.set('theme_color', '004343');
      url.searchParams.set('success_url', 'https://causal.works/app.html#assets/bank');

      if (amountCentsRaw !== undefined && amountCentsRaw !== null && String(amountCentsRaw).trim() !== '') {
        const amountCents = Number.parseInt(String(amountCentsRaw), 10);
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          return res.status(400).json({ error: 'Invalid amount_cents' });
        }
        url.searchParams.set('amount', String(amountCents / 100));
      }

      return res.json({ url: url.toString() });
    } catch (e) {
      console.error('❌ /api/everyorg/donate-link error:', e.message);
      return res.status(500).json({ error: 'Could not build donate link' });
    }
  });

}

module.exports = { registerEveryorgRoutes };
