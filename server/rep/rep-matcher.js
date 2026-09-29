const {
  committeesToTurnarounds,
  fetchUSReps,
  enrichWithCongress,
  fetchElections,
  fetchVoterInfo,
  fetchVoterInfoWithError,
  fetchRacesForAddress,
} = require('./us-reps');
const {
  fetchEUReps,
  fetchMepRepsAndChairsForEuMember,
  COUNTRY_ISO_TO_EUROPARL,
} = require('./eu-reps');
const { US_STATES, US_STATE_ABBREVS, DE_SIGNALS, GB_SIGNALS } = require('../data/geo');

/** Onboarding/settings primary_region pill values → ISO2 for rep matching (skips eu/global/us/other). */
const PRIMARY_REGION_SLUG_TO_ISO = {
  de: 'DE',
  fr: 'FR',
  uk: 'GB',
  gb: 'GB',
  nl: 'NL',
  netherlands: 'NL',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
  pt: 'PT',
  at: 'AT',
  be: 'BE',
  bg: 'BG',
  hr: 'HR',
  cy: 'CY',
  cz: 'CZ',
  dk: 'DK',
  ee: 'EE',
  fi: 'FI',
  gr: 'GR',
  hu: 'HU',
  ie: 'IE',
  lv: 'LV',
  lt: 'LT',
  lu: 'LU',
  mt: 'MT',
  ro: 'RO',
  sk: 'SK',
  si: 'SI',
  se: 'SE',
};

// ── Country detection (exported for callers that still parse free text) ───────

function detectCountry(location) {
  if (!location) return 'US';
  const loc = location.trim();
  const locLower = loc.toLowerCase();
  const cityStZip = loc.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?\b/);
  if (cityStZip && US_STATE_ABBREVS.includes(cityStZip[1])) return 'US';

  for (const signal of DE_SIGNALS) {
    if (locLower.includes(signal.toLowerCase())) return 'DE';
  }
  for (const signal of GB_SIGNALS) {
    if (locLower.includes(signal.toLowerCase())) return 'GB';
  }
  if (/\b(germany|deutschland)\b/i.test(loc)) return 'DE';
  if (/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i.test(loc)) return 'GB';
  for (const abbrev of US_STATE_ABBREVS) {
    if (new RegExp(`\\b${abbrev}\\b`).test(loc)) return 'US';
  }
  for (const state of US_STATES) {
    if (locLower.includes(state.toLowerCase())) return 'US';
  }
  if (/\b\d{5}(-\d{4})?\b/.test(loc)) return 'OTHER';
  return 'OTHER';
}

function primaryRegionToRepIso(primaryRegion) {
  if (!Array.isArray(primaryRegion) || primaryRegion.length === 0) return null;
  for (const raw of primaryRegion) {
    const slug = String(raw || '').trim().toLowerCase();
    if (!slug) continue;
    if (slug === 'eu' || slug === 'global' || slug === 'other' || slug === 'us') continue;
    const iso = PRIMARY_REGION_SLUG_TO_ISO[slug];
    if (iso) return iso;
  }
  return null;
}

function primaryRegionHasUs(primaryRegion) {
  if (!Array.isArray(primaryRegion) || primaryRegion.length === 0) return false;
  return primaryRegion.some((raw) => String(raw || '').trim().toLowerCase() === 'us');
}

/**
 * When `location_country` is not set, derive a rep country hint from primary_region only
 * (legacy / edge cases).
 */
function resolveRepsCountry(explicitCountryIso, primaryRegion) {
  const c = String(explicitCountryIso || '').trim().toUpperCase();
  if (c) return c;
  return primaryRegionToRepIso(primaryRegion) || (primaryRegionHasUs(primaryRegion) ? 'US' : 'OTHER');
}

function repsTabHint(country) {
  const c = String(country || '').trim().toUpperCase();
  if (c === 'US') {
    return 'Federal representatives based on the address you entered. Add other officials below.';
  }
  if (c === 'DE') {
    return 'Your Bundestag member and EU Parliament representatives based on your address.';
  }
  if (c === 'GB') {
    return 'Your MP based on your address.';
  }
  return 'Representatives based on your address.';
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertRep(pool, rep) {
  const existing = await pool.query(`SELECT id FROM representatives WHERE source_id = $1`, [rep.source_id]);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE representatives SET
         name = $1, party = $2, photo_url = $3, bioguide_id = $4,
         website = $5, phone = $6, office_name = $7, committees = $8,
         personal_website = $9, contact_form = $10, leadership_role = $11
       WHERE source_id = $12`,
      [
        rep.name,
        rep.party,
        rep.photo_url,
        rep.bioguide_id,
        rep.website,
        rep.phone,
        rep.office_name,
        rep.committees || [],
        rep.personal_website || null,
        rep.contact_form || null,
        rep.leadership_role || null,
        rep.source_id,
      ]
    );
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO representatives
       (name, role, level, jurisdiction, country, source, source_id,
        party, photo_url, bioguide_id, website, personal_website, phone, office_name, committees, contact_form, leadership_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      rep.name,
      rep.role,
      rep.level,
      rep.source_id,
      rep.country,
      rep.source,
      rep.source_id,
      rep.party,
      rep.photo_url,
      rep.bioguide_id || null,
      rep.website,
      rep.personal_website || null,
      rep.phone,
      rep.office_name,
      rep.committees || [],
      rep.contact_form || null,
      rep.leadership_role || null,
    ]
  );
  return result.rows[0].id;
}

// ── Main export ───────────────────────────────────────────────────────────────

async function matchReps(pool, userId, country, zip) {
  const cc = String(country || '').trim().toUpperCase();
  const z = String(zip || '').trim();

  if (!cc) {
    console.log('⏭  Rep matching skipped: no country');
    return [];
  }

  let officials = [];

  if (cc === 'US') {
    officials = await fetchUSReps(z);
    if (officials.length === 0) return [];
    officials = await enrichWithCongress(officials);
  } else if (cc === 'DE') {
    try {
      officials = await fetchEUReps('DE', z);
    } catch (e) {
      console.warn('⚠️  fetchEUReps failed for DE:', e.message);
      officials = [];
    }
  } else if (cc === 'GB') {
    try {
      officials = await fetchEUReps('GB', z);
    } catch (e) {
      console.warn('⚠️  fetchEUReps failed for GB:', e.message);
      officials = [];
    }
  } else if (COUNTRY_ISO_TO_EUROPARL[cc]) {
    try {
      officials = await fetchMepRepsAndChairsForEuMember(cc);
    } catch (e) {
      console.warn(`⚠️  EU MEP fetch failed for ${cc}:`, e.message);
      officials = [];
    }
  } else {
    console.log(`⏭  Rep matching not yet implemented for ${cc}`);
    return [];
  }

  if (officials.length === 0) return [];

  await pool.query(`DELETE FROM user_representatives WHERE user_id = $1`, [userId]);

  for (const rep of officials) {
    const repId = await upsertRep(pool, rep);
    await pool.query(
      `INSERT INTO user_representatives (user_id, rep_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, repId]
    );
  }

  console.log(`👤 Matched ${officials.length} officials for user ${userId} (${cc})`);
  return officials;
}

// Surfaces the user's rep whose committee assignments map to a given E4A
// turnaround (via committeesToTurnarounds) — used to attach a "your rep on
// this" reference to Energy-tagged federal_register actions at feed-render
// time. Per-user, so this can't be precomputed/stored on the action row
// itself (one action, many users, each with different reps).
async function findRepByTurnaroundCommittee(pool, userId, turnaround) {
  const result = await pool.query(
    `SELECT r.id, r.name, r.role, r.party, r.committees, r.photo_url
     FROM user_representatives ur
     JOIN representatives r ON r.id = ur.rep_id
     WHERE ur.user_id = $1 AND r.committees IS NOT NULL`,
    [userId]
  );
  for (const rep of result.rows) {
    if (committeesToTurnarounds(rep.committees || []).includes(turnaround)) {
      return {
        id: rep.id,
        name: rep.name,
        role: rep.role,
        party: rep.party,
        photo_url: rep.photo_url,
      };
    }
  }
  return null;
}

module.exports = {
  matchReps,
  detectCountry,
  resolveRepsCountry,
  repsTabHint,
  committeesToTurnarounds,
  findRepByTurnaroundCommittee,
  fetchRacesForAddress,
  fetchElections,
  fetchVoterInfo,
  fetchVoterInfoWithError,
};
