'use strict';

const { requireAuth } = require('../../auth');
const { extractUsZipFromUserLocation } = require('../utils');
const { buildPolicyFeed } = require('../../policy-feed');
const { buildCorporatePanel } = require('../../corporate-panel');

function registerLocalRoutes(app, pool) {

  app.get('/api/policy/feed', requireAuth(pool), async (req, res) => {
    try {
      const data = await buildPolicyFeed();
      res.json(data);
    } catch (e) {
      console.error('❌ GET /api/policy/feed:', e.message);
      res.status(500).json({ error: 'Could not load policy feed', items: [], meta: null });
    }
  });

  app.get('/api/policy/turnarounds', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const q = await pool.query(
        `WITH base AS (
           SELECT unnest(ARRAY['Energy','Food','Inequality','Poverty','Empowerment']::text[]) AS turnaround_category
         ),
         completed AS (
           SELECT a.turnaround_category, COUNT(*)::int AS completed_count
           FROM user_actions ua
           JOIN actions a ON a.id = ua.action_id
           WHERE ua.user_id = $1
             AND ua.completed_at IS NOT NULL
             AND a.turnaround_category IN ('Energy','Food','Inequality','Poverty','Empowerment')
           GROUP BY a.turnaround_category
         ),
         open_actions AS (
           SELECT DISTINCT ON (a.turnaround_category)
             a.turnaround_category,
             a.id AS action_id,
             a.action_ask,
             COALESCE(o.name, a.org_name, '') AS org_name
           FROM user_actions ua
           JOIN actions a ON a.id = ua.action_id
           LEFT JOIN orgs o ON o.id = a.org_id
           WHERE ua.user_id = $1
             AND ua.completed_at IS NULL
             AND ua.dismissed_at IS NULL
             AND a.turnaround_category IN ('Energy','Food','Inequality','Poverty','Empowerment')
           ORDER BY a.turnaround_category,
                    COALESCE(ua.opened_at, ua.received_at) DESC NULLS LAST,
                    ua.received_at DESC
         )
         SELECT
           b.turnaround_category,
           COALESCE(c.completed_count, 0)::int AS completed_count,
           oa.action_id,
           oa.action_ask,
           oa.org_name
         FROM base b
         LEFT JOIN completed c ON c.turnaround_category = b.turnaround_category
         LEFT JOIN open_actions oa ON oa.turnaround_category = b.turnaround_category
         ORDER BY CASE b.turnaround_category
           WHEN 'Energy' THEN 1
           WHEN 'Food' THEN 2
           WHEN 'Inequality' THEN 3
           WHEN 'Poverty' THEN 4
           WHEN 'Empowerment' THEN 5
         END`,
        [userId]
      );

      const turnarounds = q.rows.map((row) => {
        const category = String(row.turnaround_category || '');
        const open = row.action_id
          ? {
              id: Number(row.action_id),
              action_ask: row.action_ask != null ? String(row.action_ask) : '',
              org_name: row.org_name != null ? String(row.org_name) : '',
            }
          : null;
        return {
          turnaround_category: category,
          completed_count: Number(row.completed_count) || 0,
          open_action: open,
        };
      });

      return res.json({ turnarounds });
    } catch (e) {
      console.error('❌ GET /api/policy/turnarounds:', e.message);
      res.status(500).json({ error: 'Could not load policy turnarounds', turnarounds: [] });
    }
  });

  app.get('/api/corporate/panel', requireAuth(pool), async (req, res) => {
    try {
      const bank = req.user.bank != null ? String(req.user.bank).trim() : '';
      res.json(buildCorporatePanel(bank));
    } catch (e) {
      console.error('❌ GET /api/corporate/panel:', e.message);
      res.status(500).json({ error: 'Could not load panel', thesis: '', bank_saved: null, cards: [] });
    }
  });

  // ─── LOCAL FEED: BOUNDARY TAGGING ───
  // Real events (Mobilize etc.) never go through the AI classifier that tags
  // organizer-ask actions with boundary_ids (ai-service.js) — these are fetched
  // live on every request, not stored, so a per-event LLM call isn't worth the
  // latency/cost. Same keyword-category pattern policy-feed.js uses for
  // permitting notices instead: cheap, deterministic, conservative by design —
  // most events won't match anything and stay untagged, which is expected, not
  // a bug. First matching category wins; only title + org name are available
  // from Mobilize (no description field is currently captured).
  const LOCAL_EVENT_BOUNDARY_CATEGORIES = [
    {
      id: 'fossil_gas',
      keywords: ['gasfree', 'gas free', 'fossil fuel', 'fracking', 'pipeline', 'oil and gas', 'oil & gas', 'lng ', 'divest'],
      turnaround_category: 'Energy',
      boundary_ids: ['climate'],
    },
    {
      id: 'clean_energy',
      keywords: ['solar', 'wind energy', 'clean energy', 'renewable energy', 'electrify', 'ev charging'],
      turnaround_category: 'Energy',
      boundary_ids: ['climate'],
    },
    {
      id: 'wildlife_habitat',
      keywords: ['wildlife', 'biodiversity', 'habitat', 'endangered species', 'old growth', 'old-growth', 'deforestation', 'rewilding'],
      turnaround_category: 'Food',
      boundary_ids: ['biosphere', 'land'],
    },
    {
      id: 'water',
      keywords: ['clean water', 'drinking water', 'water quality', 'watershed', 'river cleanup', 'wetland'],
      turnaround_category: 'Food',
      boundary_ids: ['freshwater'],
    },
    {
      id: 'ocean_coast',
      keywords: ['beach cleanup', 'coastal', 'coral reef', 'marine life', 'ocean plastic'],
      turnaround_category: 'Food',
      boundary_ids: ['ocean'],
    },
    {
      id: 'toxics_plastic',
      keywords: ['plastic pollution', 'pfas', 'toxic chemical', 'pesticide'],
      turnaround_category: 'Food',
      boundary_ids: ['novel'],
    },
  ];

  // Fallback for when the title alone gives no signal (e.g. an org's generic
  // "Tabling at X" or social event) — a known advocacy org's events still
  // carry its usual cause tag rather than going untagged just because this
  // particular event's title happens to be generic. Matched by substring on
  // the org name, checked after the title/org keyword categories above find
  // nothing, so an org here with a title that matches a category (e.g. Food &
  // Water Watch's own "GasFreeNYC" event) keeps the more specific tag.
  const LOCAL_EVENT_ORG_DEFAULTS = [
    { match: 'food & water watch', boundary_ids: ['freshwater', 'climate'] },
    { match: 'food and water watch', boundary_ids: ['freshwater', 'climate'] },
    { match: '350.org', boundary_ids: ['climate'] },
    { match: 'sunrise movement', boundary_ids: ['climate'] },
    { match: 'extinction rebellion', boundary_ids: ['climate'] },
    { match: 'climate reality', boundary_ids: ['climate'] },
    { match: 'natural resources defense council', boundary_ids: ['climate'] },
    { match: 'nrdc', boundary_ids: ['climate'] },
    { match: 'greenpeace', boundary_ids: ['climate'] },
    { match: 'earthjustice', boundary_ids: ['climate'] },
    { match: 'sierra club', boundary_ids: ['land', 'biosphere'] },
    { match: 'audubon', boundary_ids: ['biosphere'] },
    { match: 'nature conservancy', boundary_ids: ['biosphere', 'land'] },
    { match: 'surfrider', boundary_ids: ['ocean'] },
    { match: 'oceana', boundary_ids: ['ocean'] },
    { match: 'beyond plastics', boundary_ids: ['novel'] },
    { match: 'clean water action', boundary_ids: ['freshwater'] },
  ];

  function classifyLocalEventBoundaries(title, orgName) {
    const hay = `${title || ''} ${orgName || ''}`.toLowerCase();
    const category = LOCAL_EVENT_BOUNDARY_CATEGORIES.find((c) => c.keywords.some((kw) => hay.includes(kw)));
    if (category) return category.boundary_ids;

    const orgHay = (orgName || '').toLowerCase();
    const orgDefault = LOCAL_EVENT_ORG_DEFAULTS.find((o) => orgHay.includes(o.match));
    return orgDefault ? orgDefault.boundary_ids : [];
  }

  // ─── LOCAL FEED: EVENT SOURCES ───
  // Each source takes a US zip and returns a normalized events array (never throws).
  // Add a new source by writing one of these and adding it to EVENT_SOURCES below.

  async function fetchMobilizeEvents(zip, { radius = 25, perPage = 5 } = {}) {
    let mobilizeRes;
    try {
      mobilizeRes = await fetch(
        `https://api.mobilize.us/v1/events?zipcode=${encodeURIComponent(zip)}&timeslot_start=gte_now&radius=${radius}&per_page=${perPage * 4}`,
        {
          signal: AbortSignal.timeout(12000),
          headers: { Accept: 'application/json', 'User-Agent': 'causal-app/1.0' },
        }
      );
    } catch (e) {
      console.warn('⚠️ GET /api/local/feed Mobilize fetch failed:', e.message);
      return [];
    }
    if (!mobilizeRes.ok) return [];
    try {
      const body = await mobilizeRes.json().catch(() => null);
      const data = Array.isArray(body?.data) ? body.data : [];
      // Mobilize lists each occurrence of a recurring event (e.g. a weekly canvass) as its
      // own event with its own id — same title/org, different date. Keep only the first
      // (soonest) occurrence per title+org so the Attend tab doesn't show one event N times.
      const seen = new Set();
      const unique = data.filter((item) => {
        const key = [item?.organization?.name || item?.sponsor?.name || '', item?.title || ''].join('|').trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique.slice(0, perPage).map((item) => {
        const ts = item?.timeslots?.[0]?.start_date;
        const loc = item?.location || {};
        const startUnix = ts != null && Number.isFinite(Number(ts)) ? Number(ts) : null;
        const orgName = String(item?.organization?.name || item?.sponsor?.name || '').trim();
        const title = String(item?.title || '').trim();
        const browserUrl = String(item?.browser_url || '').trim();
        return {
          title,
          browser_url: browserUrl,
          locality: loc.locality != null ? String(loc.locality) : '',
          region: loc.region != null ? String(loc.region) : '',
          start_date: startUnix,
          organization: { name: orgName },
          boundary_ids: classifyLocalEventBoundaries(title, orgName),
          // Stable per-event identity for "Did you attend?" tracking (local_event_attendance.event_key)
          // — browser_url when we have one, else a best-effort fallback so the
          // control still works for the rare event missing one.
          event_key: browserUrl || [title, orgName, startUnix].join('|'),
        };
      });
    } catch (e) {
      console.warn('⚠️ GET /api/local/feed Mobilize parse error:', e.message);
      return [];
    }
  }

  // PLACEHOLDER — Eventbrite Search API requires a paid app key (EVENTBRITE_API_KEY).
  // Not wired up yet. Once we have a key: GET /v3/events/search/?location.address=<zip>,
  // map each result into the same { title, browser_url, locality, region, start_date, organization } shape.
  async function fetchEventbriteEvents(zip) {
    if (!process.env.EVENTBRITE_API_KEY) return [];
    console.warn('⚠️ EVENTBRITE_API_KEY set but Eventbrite source is not implemented yet.');
    return [];
  }

  // PLACEHOLDER — Action Network Events API requires a paid partner key (ACTION_NETWORK_API_KEY).
  // Not wired up yet. Once we have a key: GET https://actionnetwork.org/api/v2/events/,
  // map each result into the same { title, browser_url, locality, region, start_date, organization } shape.
  async function fetchActionNetworkEvents(zip) {
    if (!process.env.ACTION_NETWORK_API_KEY) return [];
    console.warn('⚠️ ACTION_NETWORK_API_KEY set but Action Network source is not implemented yet.');
    return [];
  }

  const EVENT_SOURCES = [fetchMobilizeEvents, fetchEventbriteEvents, fetchActionNetworkEvents];

  // "Did you attend?" (Yes or No) drops the event from future feed loads —
  // same as an organizer attend-ask disappearing from Sign/Attend after Mark
  // done/Not this time. Once a user has responded either way, don't ask again.
  async function filterUnansweredEvents(userId, events) {
    if (!events.length) return events;
    const keys = events.map((e) => e.event_key).filter(Boolean);
    if (!keys.length) return events;
    const { rows } = await pool.query(
      `SELECT event_key FROM local_event_attendance WHERE user_id = $1 AND event_key = ANY($2)`,
      [userId, keys]
    );
    const answered = new Set(rows.map((r) => r.event_key));
    return events.filter((e) => !answered.has(e.event_key));
  }

  app.get('/api/local/feed', requireAuth(pool), async (req, res) => {
    // Optional manual zip search (Attend tab search bar) — lets a user check
    // a different zip than their saved profile location (traveling, or a
    // large city where a few digits' difference changes what Mobilize
    // returns). Bypasses the profile/country gate below entirely since an
    // explicit zip search is always a US-zip lookup by construction.
    const queryZipRaw = req.query.zip != null ? String(req.query.zip).trim() : '';
    if (queryZipRaw) {
      const searchedZip = extractUsZipFromUserLocation(queryZipRaw);
      if (!searchedZip) {
        return res.status(400).json({ error: 'Invalid zip code', events: [] });
      }
      // Widenable radius for the search bar only — a single zip+small-radius
      // lookup misses a lot in a large city with many zip codes (e.g. NYC).
      // No city-name/geocoding lookup added for this — Mobilize's API only
      // takes zip+radius, and there's no geocoding infra in this codebase to
      // add (see the earlier permitting-pipeline feasibility read); widening
      // the radius the user already controls is the simple, honest fix.
      const ALLOWED_RADIUS_MILES = new Set([10, 25, 50, 100]);
      const radiusRaw = Number.parseInt(req.query.radius, 10);
      const radius = ALLOWED_RADIUS_MILES.has(radiusRaw) ? radiusRaw : 25;
      const searchResults = await Promise.all(
        EVENT_SOURCES.map((fn) => fn(searchedZip, { radius, perPage: 10 }))
      );
      const searchUserId = req.user.user_id ?? req.user.id;
      const searchEvents = await filterUnansweredEvents(searchUserId, searchResults.flat());
      return res.json({ events: searchEvents, zip: searchedZip, radius, searched: true });
    }

    const cc = String(req.user.location_country || '').trim().toUpperCase();
    const rawZip = req.user.location_zip != null ? String(req.user.location_zip) : '';
    const zipTrimmed = rawZip.trim();
    if (!cc || !zipTrimmed) {
      return res.json({ no_location: true });
    }
    if (cc !== 'US') {
      return res.json({ events: [], international: true });
    }
    const zip = extractUsZipFromUserLocation(rawZip);
    if (!zip) {
      return res.json({ no_location: true });
    }

    const results = await Promise.all(EVENT_SOURCES.map((fn) => fn(zip)));
    const userId = req.user.user_id ?? req.user.id;
    const events = await filterUnansweredEvents(userId, results.flat());
    return res.json({ events, zip });
  });

  // "Did you attend?" response for a real local event (Mobilize etc.) — the
  // counterpart to POST /api/actions/:id/done for organizer attend-asks,
  // since these events have no row in `actions` to mark complete against.
  // Upserts so re-answering (e.g. a retry) overwrites cleanly rather than
  // erroring on the unique (user_id, source, event_key) constraint.
  app.post('/api/local/events/attendance', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const source = (req.body?.source != null ? String(req.body.source).trim() : '') || 'mobilize';
    const eventKey = req.body?.event_key != null ? String(req.body.event_key).trim() : '';
    if (!eventKey) {
      return res.status(400).json({ error: 'event_key is required' });
    }
    const title = req.body?.title != null ? String(req.body.title).trim() : null;
    const orgName = req.body?.org_name != null ? String(req.body.org_name).trim() : null;
    const attended = !!req.body?.attended;
    const boundaryIds = Array.isArray(req.body?.boundary_ids) ? req.body.boundary_ids.map(String) : [];
    const eventDateUnix = Number(req.body?.event_date);
    const eventDate = Number.isFinite(eventDateUnix) ? new Date(eventDateUnix * 1000) : null;

    try {
      await pool.query(
        `INSERT INTO local_event_attendance (user_id, source, event_key, title, org_name, event_date, boundary_ids, attended, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, source, event_key)
         DO UPDATE SET attended = EXCLUDED.attended, title = EXCLUDED.title, org_name = EXCLUDED.org_name,
           event_date = EXCLUDED.event_date, boundary_ids = EXCLUDED.boundary_ids, responded_at = NOW()`,
        [userId, source, eventKey, title, orgName, eventDate, boundaryIds, attended]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('❌ POST /api/local/events/attendance:', e.message);
      res.status(500).json({ error: 'Could not save response' });
    }
  });

}

module.exports = { registerLocalRoutes };
