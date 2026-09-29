const fs = require('fs');
const path = require('path');
const { US_STATE_ABBREV_TO_NAME } = require('../data/geo');

const DATA_PATH = path.join(__dirname, 'data', 'us-governors.json');

let cache = null;

function loadRegistry() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    cache = JSON.parse(raw);
    return cache;
  } catch (e) {
    console.warn('⚠️  us-governors.json not loaded:', e.message);
    cache = { _meta: {}, states: {} };
    return cache;
  }
}

function abbrevToDisplayName(abbr) {
  const a = String(abbr || '').toUpperCase();
  return US_STATE_ABBREV_TO_NAME[a] || a;
}

function normalizeParty(p) {
  const s = String(p || '').trim();
  if (/democratic|democrat|dfl|democratic–farmer–labor/i.test(s)) return 'Democrat';
  if (/republican/i.test(s)) return 'Republican';
  return s || null;
}

function getRegistryRow(stateAbbrev) {
  const st = String(stateAbbrev || '').toUpperCase();
  const data = loadRegistry();
  const row = data.states[st];
  if (!row || !row.name) return null;
  return row;
}

/**
 * Public hint for SPA when automation did not return a chief executive.
 */
function getGovernorHint(stateAbbrev) {
  const st = String(stateAbbrev || '').toUpperCase();
  const stateName = abbrevToDisplayName(st);
  const searchQ =
    st === 'DC'
      ? 'Mayor of Washington DC official site'
      : `Governor of ${stateName} official site contact`;
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(searchQ)}`;
  const row = getRegistryRow(st);
  const registry = row
    ? {
        name: row.name,
        party: normalizeParty(row.party),
        website: row.website || null,
        phone: row.phone != null && String(row.phone).trim() ? String(row.phone).trim() : null,
        role: row.role || 'governor',
        office_name: row.office_name || (st === 'DC' ? 'Mayor of the District of Columbia' : `Governor, ${st}`),
      }
    : null;
  return {
    state: st,
    state_name: stateName || null,
    registry,
    search_url: searchUrl,
    registry_source: loadRegistry()._meta?.source || null,
    registry_last_verified: loadRegistry()._meta?.last_verified || null,
  };
}

function rowToOfficial(row, stateAbbrev) {
  const st = String(stateAbbrev || '').toUpperCase();
  const role = row.role || 'governor';
  const officeName =
    row.office_name ||
    (role === 'mayor' && st === 'DC'
      ? 'Mayor of the District of Columbia'
      : `Governor, ${st}`);
  const party = normalizeParty(row.party);
  return {
    name: row.name,
    office_name: officeName,
    party: party || row.party || null,
    photo_url: null,
    website: row.website || null,
    phone: row.phone != null && String(row.phone).trim() ? String(row.phone).trim() : null,
    level: 'state',
    role,
    bioguide_id: null,
    country: 'US',
    source: 'static_governors',
    source_id: `static_state_exec:${st}:${String(row.name).replace(/\s+/g, '_')}`,
    committees: [],
  };
}

function listHasStateExecutive(officials) {
  return officials.some((o) => {
    const role = String(o.role || '').toLowerCase();
    if (role === 'governor' || role === 'mayor') return true;
    const off = String(o.office_name || '');
    if (/lieutenant\s+governor/i.test(off)) return false;
    return /governor/i.test(off);
  });
}

/**
 * Appends curated state chief executive when pipeline returns none (50 states + DC mayor).
 */
function appendStaticStateExecutiveIfMissing(officials, stateAbbrev) {
  const st = String(stateAbbrev || '').toUpperCase();
  if (!st || !officials || !Array.isArray(officials)) return officials;
  if (listHasStateExecutive(officials)) return officials;
  const row = getRegistryRow(st);
  if (!row) return officials;
  return [...officials, rowToOfficial(row, st)];
}

module.exports = {
  loadRegistry,
  getGovernorHint,
  appendStaticStateExecutiveIfMissing,
  listHasStateExecutive,
};
