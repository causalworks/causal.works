'use strict';

const { requireAuth } = require('../../auth');
const { envTrue } = require('../utils');
const {
  matchReps,
  resolveRepsCountry,
  fetchRacesForAddress,
  fetchElections,
  fetchVoterInfoWithError,
} = require('../../rep/rep-matcher');
const { fetchCivicDivisions, parseOcdId } = require('../../rep/us-reps');
const { getGovernorHint } = require('../../rep/governors-static');
const { US_STATE_ABBREVS } = require('../../data/geo');

function registerRepRoutes(app, pool) {

  app.get('/api/reps', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.id, r.name, r.office_name, r.role, r.level, r.party, r.source,
                r.photo_url, r.website, r.personal_website, r.phone, r.contact_form, r.leadership_role, r.bioguide_id, r.committees
         FROM representatives r
         JOIN user_representatives ur ON ur.rep_id = r.id
         WHERE ur.user_id = $1
         ORDER BY (r.level = 'federal') DESC, r.name ASC`,
        [req.user.user_id]
      );
      res.json(result.rows);
    } catch (e) {
      console.error('❌ Reps query error:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Which action a user picked to contact a specific rep about — set explicitly from the
  // Moves detail card's "Contact your rep" button. Replaces every prior attempt at inferring
  // this automatically (committee/turnaround mapping, rep_targets name-matching, keyword
  // guessing of which chamber a generic ask meant) — all of which produced wrong or missing
  // matches. The user's own choice is the only signal now.

  app.post('/api/reps/:repId/contact-actions', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const repId = Number.parseInt(req.params.repId, 10);
      const actionId = Number.parseInt(req.body && req.body.action_id, 10);
      if (!Number.isInteger(repId) || !Number.isInteger(actionId)) {
        return res.status(400).json({ error: 'Invalid rep or action id' });
      }

      const repCheck = await pool.query(
        `SELECT 1 FROM user_representatives WHERE user_id = $1 AND rep_id = $2`,
        [userId, repId]
      );
      if (repCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Rep not found for this user' });
      }

      const inserted = await pool.query(
        `INSERT INTO user_rep_contact_actions (user_id, rep_id, action_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, rep_id, action_id) DO NOTHING
         RETURNING id, rep_id, action_id, created_at, contacted_at, dismissed_at`,
        [userId, repId, actionId]
      );

      if (inserted.rowCount > 0) {
        return res.json({ ...inserted.rows[0], already_added: false });
      }

      const existing = await pool.query(
        `SELECT id, rep_id, action_id, created_at, contacted_at, dismissed_at
         FROM user_rep_contact_actions
         WHERE user_id = $1 AND rep_id = $2 AND action_id = $3`,
        [userId, repId, actionId]
      );
      return res.json({ ...existing.rows[0], already_added: true });
    } catch (e) {
      console.error('❌ POST /api/reps/:repId/contact-actions:', e.message);
      return res.status(500).json({ error: 'Could not add contact action' });
    }
  });

  app.get('/api/reps/contact-actions', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const result = await pool.query(
        `SELECT
           urca.id,
           urca.rep_id,
           urca.contacted_at,
           r.name AS rep_name,
           r.role AS rep_role,
           a.id AS action_id,
           COALESCE(a.org_name, o.name, 'Organization') AS org_name,
           a.action_ask,
           a.leverage_point,
           a.strategy_text,
           a.material_stake,
           a.source_url,
           a.boundary_ids
         FROM user_rep_contact_actions urca
         JOIN representatives r ON r.id = urca.rep_id
         JOIN actions a ON a.id = urca.action_id
         LEFT JOIN orgs o ON o.id = a.org_id
         WHERE urca.user_id = $1 AND urca.dismissed_at IS NULL
         ORDER BY urca.created_at DESC`,
        [userId]
      );
      return res.json(result.rows);
    } catch (e) {
      console.error('❌ GET /api/reps/contact-actions:', e.message);
      return res.status(500).json({ error: 'Could not load contact actions' });
    }
  });

  app.post('/api/reps/contact-actions/:id/contacted', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
      await pool.query(
        `UPDATE user_rep_contact_actions SET contacted_at = now() WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ POST /api/reps/contact-actions/:id/contacted:', e.message);
      return res.status(500).json({ error: 'Could not mark contacted' });
    }
  });

  app.post('/api/reps/contact-actions/:id/dismiss', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
      await pool.query(
        `UPDATE user_rep_contact_actions SET dismissed_at = now() WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return res.json({ status: 'ok' });
    } catch (e) {
      console.error('❌ POST /api/reps/contact-actions/:id/dismiss:', e.message);
      return res.status(500).json({ error: 'Could not remove contact action' });
    }
  });

  app.get('/api/reps/governor-hint', requireAuth(pool), async (req, res) => {
    try {
      const st = String(req.query.state || '').trim().toUpperCase();
      if (!st || !US_STATE_ABBREVS.includes(st)) {
        return res.status(400).json({ error: 'Invalid or missing state' });
      }
      return res.json(getGovernorHint(st));
    } catch (e) {
      console.error('❌ GET /api/reps/governor-hint:', e.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/reps/refresh', requireAuth(pool), async (req, res) => {
    const cc = String(req.user.location_country || '').trim().toUpperCase();
    const zip = String(req.user.location_zip || '').trim();
    if (!cc) return res.status(400).json({ error: 'No country set' });
    try {
      const reps = await matchReps(pool, req.user.user_id, cc, zip);
      res.json({ status: 'ok', count: reps.length });
    } catch (e) {
      console.error('❌ Reps refresh error:', e.message);
      res.status(500).json({ error: 'Refresh failed' });
    }
  });

  app.get('/api/reps/bills-rationale', requireAuth(pool), async (req, res) => {
    try {
      const sql = `
        SELECT
          bill_id,
          title,
          turnarounds,
          classification_rationale
        FROM bills_cache
        WHERE turnarounds IS NOT NULL
        AND array_length(turnarounds, 1) > 0
        ORDER BY classified_at DESC
        LIMIT 200;
      `;
      const result = await pool.query(sql);
      res.json(result.rows);
    } catch (error) {
      console.error('❌ GET /api/reps/bills-rationale:', error.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/fiduciaries', requireAuth(pool), async (req, res) => {
    try {
      const { FIDUCIARIES } = require('../../data/fiduciaries');
      res.json(FIDUCIARIES);
    } catch (error) {
      console.error('❌ GET /api/fiduciaries:', error.message);
      res.status(500).json({ error: 'Failed to load fiduciaries' });
    }
  });

  app.post('/api/representatives', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const {
        name, role, level, jurisdiction, country, committees, phone,
        website, personal_website, source, source_id, photo_url,
      } = req.body;

      if (!name || !role || !level) {
        return res.status(400).json({ error: 'Missing required fields: name, role, level' });
      }

      const repResult = await pool.query(
        `INSERT INTO representatives
         (name, role, level, jurisdiction, country, committees, phone, website,
          personal_website, source, source_id, photo_url, user_contributed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [name, role, level, jurisdiction, country || 'US', committees || [], phone || null,
         website || null, personal_website || null, source || 'causal_fiduciaries',
         source_id || `fiduciary:${String(name).toLowerCase().replace(/\s+/g, '-')}`,
         photo_url || null, false]
      );

      const repId = repResult.rows[0].id;

      await pool.query(
        `INSERT INTO user_representatives (user_id, rep_id) VALUES ($1, $2)
         ON CONFLICT (user_id, rep_id) DO NOTHING`,
        [userId, repId]
      );

      res.status(201).json({ id: repId, name, role, level });
    } catch (error) {
      console.error('❌ POST /api/representatives:', error.message);
      res.status(500).json({ error: 'Failed to add representative' });
    }
  });

  app.get('/api/elections/debug', (req, res) => {
    const allow = envTrue('DEBUG_CIVIC') || req.query.debug === '1';
    if (!allow) return res.status(404).json({ error: 'Not found' });
    const address = (req.query.address && String(req.query.address).trim()) ||
      '1600 Amphitheatre Parkway, Mountain View, CA 94043';
    const keyPresent = !!(process.env.GOOGLE_CIVIC_API_KEY && String(process.env.GOOGLE_CIVIC_API_KEY).trim());
    fetchVoterInfoWithError(address, null)
      .then(({ voterInfo, error }) => fetchElections().then((elections) => ({ voterInfo, error, elections })))
      .then(({ voterInfo, error, elections }) => fetchRacesForAddress(address).then((races) => ({ voterInfo, error, elections, races })))
      .then(({ voterInfo, error, elections, races }) => {
        const contestCount = voterInfo && voterInfo.contests ? voterInfo.contests.length : 0;
        const candidateContests = voterInfo && voterInfo.contests
          ? voterInfo.contests.filter((c) => c.type !== 'Referendum' && !c.referendumTitle).length
          : 0;
        res.json({
          address,
          keyPresent,
          voterInfoError: error || null,
          electionsCount: elections.length,
          election: voterInfo?.election || null,
          otherElectionsCount: (voterInfo?.otherElections || []).length,
          contestsTotal: contestCount,
          candidateContests,
          raw: { election: voterInfo?.election, otherElections: voterInfo?.otherElections, contests: voterInfo?.contests },
          racesApi: races ? { election: races.election, contestsCount: races.contests.length, contests: races.contests } : null,
        });
      })
      .catch((e) => {
        console.error('Civic debug error:', e.message);
        res.status(500).json({ error: e.message });
      });
  });

  app.get('/api/elections/races', requireAuth(pool), async (req, res) => {
    const cc = String(req.user.location_country || '').trim().toUpperCase();
    const zip = String(req.user.location_zip || '').trim();
    const city = String(req.user.location_city || '').trim();
    if (cc !== 'US' || !zip) {
      return res.json({
        election: null,
        contests: [],
        needLocation: cc === 'US' && !zip,
      });
    }
    const address = city ? `${city}, ${zip}` : zip;
    try {
      const data = await fetchRacesForAddress(address);
      if (!data) {
        return res.json({ election: null, contests: [], needLocation: false });
      }
      res.json({ election: data.election, contests: data.contests, needLocation: false });
    } catch (e) {
      console.error('❌ Elections races error:', e.message);
      res.status(500).json({ error: 'Could not load races' });
    }
  });

  app.get('/api/elections/fec-races', requireAuth(pool), async (req, res) => {
    const cc = String(req.user.location_country || '').trim().toUpperCase();
    const zip = String(req.user.location_zip || '').trim();
    const city = String(req.user.location_city || '').trim();
    if (cc !== 'US' || !zip) return res.json({ races: [], needLocation: cc !== 'US' ? false : !zip });

    try {
      const divisions = await fetchCivicDivisions(zip);
      let state = null;
      let district = null;
      for (const ocdId of Object.keys(divisions)) {
        const parsed = parseOcdId(ocdId);
        if (parsed.state) state = parsed.state;
        if (parsed.district !== null) district = parsed.district;
      }
      if (!state) return res.json({ races: [], needLocation: false });

      const fecKey = process.env.FEC_API_KEY || 'DEMO_KEY';
      const districtPadded = district !== null ? String(district).padStart(2, '0') : null;

      const [houseRes, senateRes] = await Promise.all([
        districtPadded
          ? fetch(`https://api.open.fec.gov/v1/elections/?state=${state}&office=house&district=${districtPadded}&cycle=2026&per_page=20&api_key=${fecKey}`)
              .then((r) => r.json()).catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] }),
        fetch(`https://api.open.fec.gov/v1/elections/?state=${state}&office=senate&cycle=2026&per_page=10&api_key=${fecKey}`)
          .then((r) => r.json()).catch(() => ({ results: [] })),
      ]);

      function viableCandidates(results) {
        return (results || []).filter(
          (c) => (c.total_receipts && c.total_receipts > 0) || c.incumbent_challenge_full === 'Incumbent',
        );
      }

      function formatCandidates(candidates) {
        return candidates.map((c) => ({
          name: c.candidate_name ? c.candidate_name.split(', ').reverse().map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' ') : '',
          party: c.party_full ? c.party_full.replace(' PARTY', '').charAt(0) + c.party_full.replace(' PARTY', '').slice(1).toLowerCase() : '',
          incumbent: c.incumbent_challenge_full === 'Incumbent',
        }));
      }

      const races = [];
      const houseCandidates = viableCandidates(houseRes.results);
      if (houseCandidates.length) {
        races.push({
          office: `U.S. House · ${state}-${parseInt(district, 10)}`,
          source: 'fec',
          candidates: formatCandidates(houseCandidates),
        });
      }
      const senateCandidates = viableCandidates(senateRes.results);
      if (senateCandidates.length) {
        races.push({
          office: `U.S. Senate · ${state}`,
          source: 'fec',
          candidates: formatCandidates(senateCandidates),
        });
      }

      res.json({ state, district, races, needLocation: false });
    } catch (e) {
      console.error('❌ FEC races error:', e.message);
      res.status(500).json({ error: 'Could not load races' });
    }
  });

  app.post('/api/contributions', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const orgId = Number.parseInt(req.body?.org_id, 10);
    const amountCents = Number.parseInt(req.body?.amount_cents, 10);
    const currency = String(req.body?.currency || 'USD').trim().toUpperCase() || 'USD';
    const source = String(req.body?.source || 'manual').trim().toLowerCase() || 'manual';
    const contributedAtRaw = req.body?.contributed_at;
    const contributedAt = contributedAtRaw ? new Date(contributedAtRaw) : new Date();

    if (!Number.isInteger(orgId) || orgId < 1) return res.status(400).json({ error: 'Invalid org_id' });
    if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'Invalid amount_cents' });
    if (!['USD', 'EUR', 'GBP'].includes(currency)) return res.status(400).json({ error: 'Unsupported currency' });
    if (Number.isNaN(contributedAt.getTime())) return res.status(400).json({ error: 'Invalid contributed_at' });
    if (source.length > 50) return res.status(400).json({ error: 'Invalid source' });

    try {
      const pref = await pool.query(
        `SELECT o.name
         FROM user_org_preferences uop
         JOIN orgs o ON o.id = uop.org_id
         WHERE uop.user_id = $1 AND uop.org_id = $2`,
        [userId, orgId]
      );
      if (pref.rows.length === 0) return res.status(404).json({ error: 'Not following this org' });
      const orgName = pref.rows[0].name;

      const inserted = await pool.query(
        `INSERT INTO contributions (user_id, org_name, amount_cents, currency, contributed_at, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, org_name, amount_cents, currency, contributed_at, source`,
        [userId, orgName, amountCents, currency, contributedAt.toISOString(), source]
      );
      res.status(201).json(inserted.rows[0]);
    } catch (e) {
      console.error('❌ POST /api/contributions:', e.message);
      res.status(500).json({ error: 'Database error' });
    }
  });

}

module.exports = { registerRepRoutes };
