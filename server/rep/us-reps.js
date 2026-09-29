const fs = require('fs');
const path = require('path');
const { httpsGetText, httpsGetJson } = require('./http-get');
const { appendStaticStateExecutiveIfMissing } = require('./governors-static');

// ── Committee → Turnaround mapping (U.S. Congress) ───────────────────────────

const COMMITTEE_TURNAROUND_MAP = [
  { keywords: ['energy', 'environment', 'climate', 'natural resources', 'public works'], turnaround: 'Energy' },
  { keywords: ['agriculture', 'food', 'nutrition', 'forestry', 'rural'], turnaround: 'Food' },
  { keywords: ['finance', 'ways and means', 'banking', 'financial services', 'budget', 'taxation', 'labor', 'workforce', 'pension', 'appropriations'], turnaround: 'Inequality' },
  { keywords: ['foreign relations', 'foreign affairs', 'international development', 'global health'], turnaround: 'Poverty' },
  { keywords: ['health', 'education', 'women', 'civil rights', 'judiciary'], turnaround: 'Empowerment' },
];

// Chamber leaders (Speaker, Majority/Minority Leader) traditionally hold few or no standing
// committee seats, so the committee->turnaround mapping alone under-tags them even though they
// shape the floor agenda across every committee's bills. legislators-current.json already
// tracks a leadership_roles history per member — the current entry is the one with no `end`
// date, or an `end` date still in the future.
function currentLeadershipTitle(leg) {
  const roles = Array.isArray(leg.leadership_roles) ? leg.leadership_roles : [];
  const now = new Date();
  const current = roles.find((r) => !r.end || new Date(r.end) > now);
  return current ? current.title : null;
}

function committeesToTurnarounds(committees = []) {
  const turnarounds = new Set();
  for (const committee of committees) {
    const lower = committee.toLowerCase();
    for (const { keywords, turnaround } of COMMITTEE_TURNAROUND_MAP) {
      if (keywords.some((k) => lower.includes(k))) {
        turnarounds.add(turnaround);
        break;
      }
    }
  }
  return [...turnarounds];
}

// ── Google Civic API — OCD division IDs for address ─────────────────────────

async function fetchCivicDivisions(location) {
  const url = `https://civicinfo.googleapis.com/civicinfo/v2/divisionsByAddress?address=${encodeURIComponent(location)}&key=${process.env.GOOGLE_CIVIC_API_KEY}`;
  console.log('🌐 Civic divisions API:', url.replace(process.env.GOOGLE_CIVIC_API_KEY, '[KEY]'));

  const json = await httpsGetJson(url);
  if (json.error) {
    console.error('❌ Civic API error:', json.error.message);
    return {};
  }

  return json.divisions || {};
}

// ── Congress legislators JSON — cached in memory ───────────────────────────

const LEGISLATORS_PATH = path.join(__dirname, 'data', 'legislators-current.json');
const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';

const COMMITTEES_PATH = path.join(__dirname, 'data', 'committees-current.json');
const COMMITTEES_URL = 'https://unitedstates.github.io/congress-legislators/committees-current.json';

const COMMITTEE_MEMBERSHIP_PATH = path.join(__dirname, 'data', 'committee-membership-current.json');
const COMMITTEE_MEMBERSHIP_URL = 'https://unitedstates.github.io/congress-legislators/committee-membership-current.json';

let legislatorsCache = null;
let legislatorsCacheTime = 0;

let committeesCache = null;
let committeesCacheTime = 0;

let committeeMembershipCache = null;
let committeeMembershipCacheTime = 0;

async function fetchLegislators() {
  const now = Date.now();
  if (legislatorsCache && now - legislatorsCacheTime < 24 * 60 * 60 * 1000) {
    return legislatorsCache;
  }

  try {
    const stat = fs.statSync(LEGISLATORS_PATH);
    const ageMs = now - stat.mtimeMs;
    if (ageMs < 24 * 60 * 60 * 1000) {
      console.log('📂 Loading legislators from disk cache...');
      legislatorsCache = JSON.parse(fs.readFileSync(LEGISLATORS_PATH, 'utf8'));
      legislatorsCacheTime = now;
      console.log(`✅ Loaded ${legislatorsCache.length} legislators from disk`);
      return legislatorsCache;
    }
  } catch (_) {}

  console.log('📥 Fetching legislators-current.json from GitHub...');
  const json = await httpsGetJson(LEGISLATORS_URL);

  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(LEGISLATORS_PATH, JSON.stringify(json));

  legislatorsCache = json;
  legislatorsCacheTime = now;
  console.log(`✅ Loaded ${json.length} legislators`);
  return json;
}

async function fetchCommittees() {
  const now = Date.now();
  if (committeesCache && now - committeesCacheTime < 24 * 60 * 60 * 1000) return committeesCache;
  try {
    const stat = fs.statSync(COMMITTEES_PATH);
    if (now - stat.mtimeMs < 24 * 60 * 60 * 1000) {
      committeesCache = JSON.parse(fs.readFileSync(COMMITTEES_PATH, 'utf8'));
      committeesCacheTime = now;
      return committeesCache;
    }
  } catch (_) {}
  console.log('📥 Fetching committees-current.json from GitHub...');
  const json = await httpsGetJson(COMMITTEES_URL);
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(COMMITTEES_PATH, JSON.stringify(json));
  committeesCache = json;
  committeesCacheTime = now;
  console.log(`✅ Loaded ${json.length} committees`);
  return json;
}

async function fetchCommitteeMembership() {
  const now = Date.now();
  if (committeeMembershipCache && now - committeeMembershipCacheTime < 24 * 60 * 60 * 1000) {
    return committeeMembershipCache;
  }
  try {
    const stat = fs.statSync(COMMITTEE_MEMBERSHIP_PATH);
    if (now - stat.mtimeMs < 24 * 60 * 60 * 1000) {
      committeeMembershipCache = JSON.parse(fs.readFileSync(COMMITTEE_MEMBERSHIP_PATH, 'utf8'));
      committeeMembershipCacheTime = now;
      return committeeMembershipCache;
    }
  } catch (_) {}
  console.log('📥 Fetching committee-membership-current.json from GitHub...');
  const json = await httpsGetJson(COMMITTEE_MEMBERSHIP_URL);
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(COMMITTEE_MEMBERSHIP_PATH, JSON.stringify(json));
  committeeMembershipCache = json;
  committeeMembershipCacheTime = now;
  console.log(`✅ Loaded committee membership for ${Object.keys(json).length} committees`);
  return json;
}

function parseOcdId(ocdId) {
  const stateMatch = ocdId.match(/state:([a-z]+)/);
  const districtMatch = ocdId.match(/cd:(\d+)/);
  return {
    state: stateMatch ? stateMatch[1].toUpperCase() : null,
    district: districtMatch ? parseInt(districtMatch[1], 10) : null,
  };
}

async function fetchUSReps(location) {
  const divisions = await fetchCivicDivisions(location);

  console.log('🗺️  OCD divisions:', Object.keys(divisions));

  let state = null;
  let district = null;
  for (const ocdId of Object.keys(divisions)) {
    const parsed = parseOcdId(ocdId);
    if (parsed.state) state = parsed.state;
    if (parsed.district !== null) district = parsed.district;
  }

  if (!state) {
    console.warn('⚠️  Could not determine state from OCD divisions');
    return [];
  }

  console.log(`📍 Resolved: state=${state}, district=${district}`);

  const [legislators, committeeList, membershipData] = await Promise.all([
    fetchLegislators(),
    fetchCommittees(),
    fetchCommitteeMembership(),
  ]);

  const parentIds = new Set(committeeList.map((c) => c.thomas_id));
  const committeeNameMap = {};
  for (const c of committeeList) {
    committeeNameMap[c.thomas_id] = c.name;
  }

  const bioguideCommittees = {};
  for (const [committeeId, members] of Object.entries(membershipData)) {
    if (!parentIds.has(committeeId)) continue;
    const name = committeeNameMap[committeeId];
    if (!name) continue;
    for (const member of members) {
      if (!bioguideCommittees[member.bioguide]) bioguideCommittees[member.bioguide] = [];
      bioguideCommittees[member.bioguide].push(name);
    }
  }

  const matched = [];
  for (const leg of legislators) {
    const term = leg.terms[leg.terms.length - 1];
    if (term.state !== state) continue;
    if (term.type === 'sen') {
      matched.push({ leg, term });
    } else if (term.type === 'rep' && district !== null && term.district === district) {
      matched.push({ leg, term });
    }
  }

  console.log(`✅ Matched ${matched.length} legislators for ${state} district ${district}`);

  const federal = matched.map(({ leg, term }) => {
    const committees = bioguideCommittees[leg.id.bioguide] || [];
    if (committees.length) console.log(`📋 ${leg.name.last}: ${committees.join(', ')}`);
    return {
      name: `${leg.name.first} ${leg.name.last}`,
      office_name: term.type === 'sen' ? `U.S. Senator, ${state}` : `U.S. Representative, ${state}-${term.district}`,
      party: leg.party === 'Democrat' ? 'Democrat' : leg.party === 'Republican' ? 'Republican' : leg.party,
      photo_url: `https://bioguide.congress.gov/bioguide/photo/${leg.id.bioguide[0]}/${leg.id.bioguide}.jpg`,
      website: term.url || null,
      phone: term.phone || null,
      contact_form: term.contact_form || null,
      leadership_role: currentLeadershipTitle(leg),
      level: 'federal',
      role: term.type === 'sen' ? 'senator' : 'representative',
      bioguide_id: leg.id.bioguide,
      country: 'US',
      source: 'congress_legislators',
      source_id: `bioguide:${leg.id.bioguide}`,
      committees,
    };
  });
  return appendStaticStateExecutiveIfMissing(federal, state);
}

async function enrichWithCongress(officials) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  CONGRESS_API_KEY not set — skipping enrichment');
    return officials;
  }

  for (const official of officials) {
    if (official.level !== 'federal' || !official.bioguide_id) continue;

    try {
      const url = `https://api.congress.gov/v3/member/${official.bioguide_id}?api_key=${apiKey}`;
      const json = await httpsGetJson(url);
      const m = json.member;
      if (!m) continue;

      const partyHistory = m.partyHistory || [];
      if (partyHistory.length > 0) {
        const latest = partyHistory[partyHistory.length - 1];
        official.party =
          latest.partyAbbreviation === 'D'
            ? 'Democrat'
            : latest.partyAbbreviation === 'R'
              ? 'Republican'
              : latest.partyName || '';
      }

      if (m.depiction?.imageUrl) official.photo_url = m.depiction.imageUrl;
      if (m.officialWebsiteUrl) official.website = m.officialWebsiteUrl;
      if (m.addressInformation?.phoneNumber) official.phone = m.addressInformation.phoneNumber;

      console.log(`✅ Enriched ${official.name}: ${official.party}`);
    } catch (e) {
      console.error(`❌ Congress.gov enrichment failed for ${official.name}:`, e.message);
    }
  }

  return officials;
}

// ── Google Civic API — elections & voter info (2.2b) ─────────────────────────

const CIVIC_BASE = 'https://www.googleapis.com/civicinfo/v2';
const CIVIC_CACHE_MS = 60 * 60 * 1000;
let electionsCache = null;
let electionsCacheTime = 0;

async function fetchElections() {
  const now = Date.now();
  if (electionsCache && now - electionsCacheTime < CIVIC_CACHE_MS) {
    return electionsCache;
  }
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  if (!key) return [];
  const url = `${CIVIC_BASE}/elections?key=${encodeURIComponent(key)}`;
  try {
    const json = await httpsGetJson(url);
    const list = json.elections || [];
    electionsCache = list;
    electionsCacheTime = now;
    return list;
  } catch (e) {
    console.error('❌ Civic elections fetch:', e.message);
    return electionsCache || [];
  }
}

async function fetchVoterInfo(address, electionId = null) {
  const r = await fetchVoterInfoWithError(address, electionId);
  return r.error ? null : r.voterInfo;
}

async function fetchVoterInfoWithError(address, electionId = null) {
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  if (!key || !String(key).trim()) {
    return { voterInfo: null, error: 'GOOGLE_CIVIC_API_KEY is not set or empty in .env' };
  }
  const params = new URLSearchParams({ address: address.trim(), key });
  if (electionId != null) params.set('electionId', String(electionId));
  const url = `${CIVIC_BASE}/voterinfo?${params.toString()}`;
  try {
    const json = await httpsGetJson(url);
    if (json.error) {
      const msg = json.error.message || JSON.stringify(json.error);
      console.warn('Civic voterInfo error:', msg);
      return { voterInfo: null, error: `Civic API error: ${msg}` };
    }
    return { voterInfo: json, error: null };
  } catch (e) {
    console.error('❌ Civic voterInfo fetch:', e.message);
    return { voterInfo: null, error: e.message || String(e) };
  }
}

function normalizeContestsFromVoterInfo(voterInfo) {
  if (!voterInfo || !voterInfo.contests) return [];
  const contests = [];
  for (const c of voterInfo.contests) {
    if (c.type === 'Referendum' || c.referendumTitle) continue;
    const candidates = (c.candidates || [])
      .map((cand) => ({
        name: cand.name || '',
        party: cand.party || null,
        url: cand.candidateUrl || null,
        phone: cand.phone || null,
        photoUrl: cand.photoUrl || null,
      }))
      .filter((cand) => cand.name);
    contests.push({
      office: c.office || c.ballotTitle || 'Office',
      district: c.district ? c.district.name : null,
      candidates,
    });
  }
  return contests;
}

async function fetchRacesForAddress(address) {
  if (!address || !String(address).trim()) return null;
  const trimmed = String(address).trim();

  let voterInfo = await fetchVoterInfo(trimmed, null);
  if (voterInfo && voterInfo.contests) {
    const contested = normalizeContestsFromVoterInfo(voterInfo);
    if (contested.length > 0) {
      return {
        election: {
          id: voterInfo.election?.id,
          name: voterInfo.election?.name,
          electionDay: voterInfo.election?.electionDay,
        },
        contests: contested,
      };
    }
  }

  const others = voterInfo?.otherElections || [];
  for (const other of others) {
    const id = other.id;
    if (id == null) continue;
    const info = await fetchVoterInfo(trimmed, id);
    const contested = normalizeContestsFromVoterInfo(info);
    if (contested.length > 0) {
      return {
        election: {
          id: info?.election?.id ?? id,
          name: info?.election?.name ?? other.name,
          electionDay: info?.election?.electionDay ?? other.electionDay,
        },
        contests: contested,
      };
    }
  }

  const elections = await fetchElections();
  if (elections.length === 0) {
    return voterInfo
      ? {
          election: voterInfo.election
            ? { id: voterInfo.election.id, name: voterInfo.election.name, electionDay: voterInfo.election.electionDay }
            : null,
          contests: [],
        }
      : null;
  }
  const now = new Date().toISOString().slice(0, 10);
  const sorted = (elections || [])
    .filter((e) => e.id != null)
    .sort((a, b) => (a.electionDay || '').localeCompare(b.electionDay || ''));
  const toTry =
    sorted.filter((e) => (e.electionDay || '') >= now).length > 0
      ? sorted.filter((e) => (e.electionDay || '') >= now)
      : sorted;
  for (const election of toTry) {
    const withId = await fetchVoterInfo(trimmed, election.id);
    const contested = normalizeContestsFromVoterInfo(withId);
    if (contested.length > 0) {
      return {
        election: {
          id: withId?.election?.id ?? election.id,
          name: withId?.election?.name ?? election.name,
          electionDay: withId?.election?.electionDay ?? election.electionDay,
        },
        contests: contested,
      };
    }
  }
  return {
    election: null,
    contests: [],
  };
}

module.exports = {
  committeesToTurnarounds,
  fetchUSReps,
  enrichWithCongress,
  fetchElections,
  fetchVoterInfo,
  fetchVoterInfoWithError,
  fetchRacesForAddress,
  fetchCivicDivisions,
  parseOcdId,
};
