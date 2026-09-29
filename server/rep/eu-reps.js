const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { httpsGetText, httpsGetJson } = require('./http-get');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Official full-list XML (JSON /full-list/json returns 404 as of 2026). */
const EUROPARL_MEPS_XML_URL = 'https://www.europarl.europa.eu/meps/en/full-list/xml';
const EU_MEPS_CACHE_PATH = path.join(__dirname, 'data', 'eu-meps.json');

const EP_COMMITTEES = [
  {
    slug: 'ENVI',
    committeeName: 'Environment, Public Health and Food Safety',
    turnarounds: ['Energy', 'Food'],
  },
  { slug: 'ITRE', committeeName: 'Industry, Research and Energy', turnarounds: ['Energy'] },
  { slug: 'ECON', committeeName: 'Economic and Monetary Affairs', turnarounds: ['Inequality'] },
  { slug: 'AGRI', committeeName: 'Agriculture and Rural Development', turnarounds: ['Food'] },
  { slug: 'DEVE', committeeName: 'Development', turnarounds: ['Poverty'] },
  { slug: 'FEMM', committeeName: "Women's Rights and Gender Equality", turnarounds: ['Empowerment'] },
];

const EP_CHAIRS_CACHE_PATH = path.join(__dirname, 'data', 'eu-ep-committee-chairs.json');

const COUNTRY_ISO_TO_EUROPARL = {
  DE: 'Germany',
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  GR: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
};

function readJsonCache(filePath, maxAgeMs) {
  try {
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs >= maxAgeMs) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJsonCache(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function parseEuroparlMepsXml(xml) {
  const list = [];
  const re = /<mep>([\s\S]*?)<\/mep>/g;
  let m;
  const pick = (block, tag) => {
    const x = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
    return x ? x[1].trim() : '';
  };
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const id = pick(block, 'id');
    const fullName = pick(block, 'fullName');
    const country = pick(block, 'country');
    const politicalGroup = pick(block, 'politicalGroup');
    if (!id || !fullName) continue;
    list.push({
      id,
      fullName,
      country,
      politicalGroup,
      nationalPoliticalGroup: pick(block, 'nationalPoliticalGroup'),
    });
  }
  return list;
}

let mepsMemoryCache = null;
let mepsMemoryTime = 0;

async function loadEuroparlMepsMasterList() {
  const now = Date.now();
  if (mepsMemoryCache && now - mepsMemoryTime < ONE_DAY_MS) return mepsMemoryCache;

  const disk = readJsonCache(EU_MEPS_CACHE_PATH, ONE_DAY_MS);
  if (disk && Array.isArray(disk.meps)) {
    mepsMemoryCache = disk.meps;
    mepsMemoryTime = now;
    return mepsMemoryCache;
  }

  console.log('📥 Fetching Europarl MEP full list (XML)...');
  const xml = await httpsGetText(EUROPARL_MEPS_XML_URL);
  const meps = parseEuroparlMepsXml(xml);
  mepsMemoryCache = meps;
  mepsMemoryTime = now;
  writeJsonCache(EU_MEPS_CACHE_PATH, { fetchedAt: new Date().toISOString(), meps });
  console.log(`✅ Parsed ${meps.length} MEPs from Europarl XML`);
  return meps;
}

function mepRowsToReps(rows, countryIso) {
  const epCountry = COUNTRY_ISO_TO_EUROPARL[countryIso];
  if (!epCountry) return [];
  return rows
    .filter((r) => r.country === epCountry)
    .map((r) => ({
      name: r.fullName,
      office_name: `Member of European Parliament (${countryIso})`,
      party: r.politicalGroup || r.nationalPoliticalGroup || null,
      photo_url: `https://www.europarl.europa.eu/mepphoto/${r.id}.jpg`,
      website: `https://www.europarl.europa.eu/meps/en/${r.id}`,
      phone: null,
      role: 'mep',
      level: 'supranational',
      country: countryIso,
      source: 'europarl',
      source_id: `europarl:${r.id}`,
      committees: [],
      bioguide_id: null,
    }));
}

let chairsMemory = null;
let chairsMemoryTime = 0;

function parseCommitteeChairFromHtml(html, committee) {
  const $ = cheerio.load(html);
  const items = $('.es_member-list-item');
  for (let i = 0; i < items.length; i++) {
    const el = items.eq(i);
    const roleSpan = el.find('.sln-additional-info').first().text().trim();
    if (roleSpan !== 'Chair') continue;
    const link = el.find('a.es_member-list-item-content').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/\/meps\/en\/(\d+)/);
    if (!idMatch) continue;
    const mepId = idMatch[1];
    const name = el.find('.es_title-h4.t-item').first().text().trim();
    if (!name) continue;
    return {
      name,
      office_name: `Chair, EP Committee on ${committee.committeeName}`,
      party: null,
      photo_url: `https://www.europarl.europa.eu/mepphoto/${mepId}.jpg`,
      website: `https://www.europarl.europa.eu/meps/en/${mepId}`,
      phone: null,
      role: 'ep_committee_chair',
      level: 'supranational',
      country: null,
      source: 'europarl',
      source_id: `europarl_chair:${committee.slug}:${mepId}`,
      committees: [committee.committeeName],
      bioguide_id: null,
    };
  }
  return null;
}

async function fetchEpCommitteeChairs() {
  const now = Date.now();
  if (chairsMemory && now - chairsMemoryTime < ONE_DAY_MS) return chairsMemory;

  const disk = readJsonCache(EP_CHAIRS_CACHE_PATH, ONE_DAY_MS);
  if (disk && Array.isArray(disk.chairs)) {
    chairsMemory = disk.chairs;
    chairsMemoryTime = now;
    return chairsMemory;
  }

  const chairs = [];
  for (const spec of EP_COMMITTEES) {
    const url = `https://www.europarl.europa.eu/committees/en/${spec.slug}/home/members`;
    try {
      const html = await httpsGetText(url);
      const row = parseCommitteeChairFromHtml(html, spec);
      if (row) chairs.push(row);
    } catch (e) {
      console.warn(`⚠️  EP committee ${spec.slug} members fetch failed:`, e.message);
    }
  }

  chairsMemory = chairs;
  chairsMemoryTime = now;
  writeJsonCache(EP_CHAIRS_CACHE_PATH, { fetchedAt: new Date().toISOString(), chairs });
  return chairs;
}

function extractGermanPostcode(address) {
  if (!address) return null;
  const m = String(address).match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function extractUkPostcode(address) {
  if (!address) return null;
  const m = String(address).match(/([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i);
  return m ? m[1].replace(/\s+/, ' ').trim().toUpperCase() : null;
}

async function getCurrentBundestagPeriodId() {
  const url = 'https://www.abgeordnetenwatch.de/api/v2/parliament-periods?parliament=5';
  const json = await httpsGetJson(url);
  const rows = json.data || [];
  const legislatures = rows.filter((p) => p.type === 'legislature');
  legislatures.sort((a, b) => (b.start_date_period || '').localeCompare(a.start_date_period || ''));
  const id = legislatures[0]?.id;
  if (id == null) throw new Error('No Bundestag legislature period in API');
  return id;
}

function municipalitySearchTerms(localityRow) {
  const m = localityRow.municipality;
  const name = (m && m.name) || localityRow.name || '';
  const cleaned = name.replace(/,\s*Stadt$/i, '').replace(/,\s*Gemeinde$/i, '').trim();
  const out = new Set();
  if (cleaned) out.add(cleaned);
  if (name && name !== cleaned) out.add(name);
  return [...out];
}

async function fetchConstituenciesForTerm(nameSubstring, parliamentPeriodId) {
  const params = new URLSearchParams({
    parliament_period: String(parliamentPeriodId),
    'name[cn]': nameSubstring,
    range_end: '100',
  });
  const url = `https://www.abgeordnetenwatch.de/api/v2/constituencies?${params}`;
  const json = await httpsGetJson(url);
  return json.data || [];
}

function scoreConstituencyAgainstAddress(addrLower, constituency) {
  const name = (constituency.name || '').toLowerCase();
  const parts = name.split(/[^a-zäöüß]+/).filter((p) => p.length > 2);
  let s = 0;
  for (const p of parts) {
    if (addrLower.includes(p)) s += 3;
  }
  return s;
}

/** Abgeordnetenwatch API may return profile URLs with a /contact suffix; cards should use the base profile only. */
function normalizeAbgeordnetenwatchProfileUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim().replace(/\/+$/, '');
  if (/\/contact$/i.test(u)) {
    u = u.replace(/\/contact$/i, '').replace(/\/+$/, '');
  }
  return u || url.trim();
}

function pickConstituency(candidates, fullAddress) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const addrLower = fullAddress.toLowerCase();
  let best = candidates[0];
  let bestScore = scoreConstituencyAgainstAddress(addrLower, best);
  for (let i = 1; i < candidates.length; i++) {
    const sc = scoreConstituencyAgainstAddress(addrLower, candidates[i]);
    if (sc > bestScore) {
      bestScore = sc;
      best = candidates[i];
    }
  }
  if (bestScore < 1) {
    const plzOnly = /^\d{5}\s*$/.test(String(fullAddress || '').trim());
    if (plzOnly && candidates.length) {
      if (candidates.length > 1) {
        console.warn('⚠️  Multiple Wahlkreise for PLZ; using first match (postal code only).');
      }
      return candidates[0];
    }
    console.warn('⚠️  Ambiguous Bundestag Wahlkreis for address; skipping direct mandate.');
    return null;
  }
  return best;
}

async function openPlzLocalities(postcode) {
  const url = `https://openplzapi.org/de/Localities?postalCode=${encodeURIComponent(postcode)}`;
  return httpsGetJson(url);
}

/** Ortsteil / Stadtteil from first street row (Localities omit borough for Berlin). */
async function openPlzStreetDistrictHint(postcode) {
  const url = `https://openplzapi.org/de/Streets?postalCode=${encodeURIComponent(postcode)}&pageSize=50`;
  try {
    const rows = await httpsGetJson(url);
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const row = rows[0];
    return String(row.borough || row.suburb || '').trim();
  } catch (_) {
    return '';
  }
}

async function fetchBundestagDirectMandate(location) {
  const plz = extractGermanPostcode(location);
  if (!plz) {
    console.warn('⚠️  No German postcode (5 digits) in address — skipping Bundestag lookup');
    return [];
  }

  let localities;
  try {
    localities = await openPlzLocalities(plz);
  } catch (e) {
    console.warn('⚠️  OpenPLZ lookup failed:', e.message);
    return [];
  }
  if (!Array.isArray(localities) || localities.length === 0) {
    console.warn('⚠️  OpenPLZ returned no localities for PLZ', plz);
    return [];
  }

  const primaryLocality = localities[0];
  const localityName =
    primaryLocality?.municipality?.name || primaryLocality?.name || '';
  const cleanLocalityName = localityName.replace(/,\s*(Stadt|Gemeinde|Kreis)$/i, '').trim();
  const ortsteil = await openPlzStreetDistrictHint(plz);
  const addressParts = [location];
  if (ortsteil) addressParts.push(ortsteil);
  if (cleanLocalityName) addressParts.push(cleanLocalityName);
  const enrichedAddress = addressParts.length > 1 ? addressParts.join(' ') : location;

  let periodId;
  try {
    periodId = await getCurrentBundestagPeriodId();
  } catch (e) {
    console.warn('⚠️  Bundestag period resolve failed:', e.message);
    return [];
  }

  let candidates = [];
  for (const loc of localities) {
    for (const term of municipalitySearchTerms(loc)) {
      try {
        const found = await fetchConstituenciesForTerm(term, periodId);
        if (found.length) {
          candidates = found;
          break;
        }
      } catch (e) {
        console.warn('⚠️  Abgeordnetenwatch constituencies search failed:', e.message);
      }
    }
    if (candidates.length) break;
  }

  const constituency = pickConstituency(candidates, enrichedAddress);
  if (!constituency) return [];

  const mandateUrl =
    `https://www.abgeordnetenwatch.de/api/v2/candidacies-mandates?` +
    `parliament_period=${periodId}&constituency=${constituency.id}&current_on=now&` +
    `electoral_data[entity.mandate_won]=constituency&range_end=5`;

  let list;
  try {
    const j = await httpsGetJson(mandateUrl);
    list = j.data || [];
  } catch (e) {
    console.warn('⚠️  Bundestag mandate lookup failed:', e.message);
    return [];
  }
  const mandate = list.find((row) => row.type === 'mandate');
  if (!mandate || !mandate.politician) return [];

  const polId = mandate.politician.id;
  let polDetail;
  try {
    polDetail = await httpsGetJson(`https://www.abgeordnetenwatch.de/api/v2/politicians/${polId}`);
  } catch (e) {
    console.warn('⚠️  Politician detail fetch failed:', e.message);
    return [];
  }
  const p = polDetail.data || polDetail;
  const firstName = p.first_name || '';
  const lastName = p.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || mandate.politician.label || 'Unknown';

  let partyAbbr = null;
  if (mandate.fraction_membership?.[0]?.label) {
    partyAbbr = mandate.fraction_membership[0].label;
  }
  if (!partyAbbr && p.party && p.party.label) partyAbbr = p.party.label;

  const photo = p.picture || p.photo || null;
  const rawProfileUrl = p.abgeordnetenwatch_url || mandate.politician.abgeordnetenwatch_url || null;
  const profileUrl = normalizeAbgeordnetenwatchProfileUrl(rawProfileUrl);

  const bundestagSlugPart = (part) =>
    String(part || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
  const firstNameSlug = bundestagSlugPart(firstName);
  const lastNameSlug = bundestagSlugPart(lastName);
  const nameInitial = bundestagSlugPart(lastName).charAt(0).toUpperCase();
  const letterDir = /^[A-Z]$/.test(nameInitial) ? nameInitial : 'M';
  const bundestagNumericId = (p.ext_id_bundestagsverwaltung && String(p.ext_id_bundestagsverwaltung).trim()) || String(polId);
  const personal_website = `https://www.bundestag.de/abgeordnete/biografien/${letterDir}/${lastNameSlug}_${firstNameSlug}-${bundestagNumericId}`;

  return [
    {
      name: fullName,
      office_name: `MdB, Wahlkreis ${constituency.name || constituency.label || ''}`,
      party: partyAbbr,
      photo_url: photo,
      website: profileUrl,
      personal_website,
      phone: null,
      role: 'bundestag_member',
      level: 'national',
      country: 'DE',
      source: 'abgeordnetenwatch',
      source_id: `abgeordnetenwatch:${polId}`,
      committees: [],
      bioguide_id: null,
    },
  ];
}

async function fetchUkMp(location) {
  const key = process.env.THEYWORKFORTYOU_API_KEY;
  if (!key || !String(key).trim()) {
    console.warn('⚠️  THEYWORKFORYOU_API_KEY not set — skipping UK MP lookup');
    return [];
  }
  const pc = extractUkPostcode(location);
  if (!pc) {
    console.warn('⚠️  No UK postcode found in address — skipping TheyWorkForYou lookup');
    return [];
  }
  const params = new URLSearchParams({
    postcode: pc.replace(/\s+/g, ''),
    key: key.trim(),
    output: 'json',
  });
  const url = `https://www.theyworkforyou.com/api/getMP?${params}`;
  let json;
  try {
    json = await httpsGetJson(url);
  } catch (e) {
    console.warn('⚠️  TheyWorkForYou getMP failed:', e.message);
    return [];
  }
  if (json.error) {
    console.warn('⚠️  TheyWorkForYou:', json.error);
    return [];
  }

  const rows = Array.isArray(json) ? json : [json];
  const active =
    rows.find((r) => r.left_house === '9999-12-31' || r.left_reason === 'still_in_office') || rows[0];
  if (!active) return [];

  const fullName = active.full_name || active.name;
  if (!fullName) return [];

  const memberId = active.member_id;
  const constituency = active.constituency || 'constituency';
  let website = active.url || null;
  if (website && website.startsWith('/')) {
    website = `https://www.theyworkforyou.com${website}`;
  }

  return [
    {
      name: fullName,
      office_name: `MP for ${constituency}`,
      party: active.party || null,
      photo_url: memberId ? `https://www.theyworkforyou.com/images/mpsL/${memberId}.jpg` : null,
      website,
      phone: null,
      role: 'mp',
      level: 'national',
      country: 'GB',
      source: 'theyworkforyou',
      source_id: memberId != null ? `theyworkforyou:${memberId}` : `theyworkforyou:${fullName}`,
      committees: [],
      bioguide_id: null,
    },
  ];
}

function isEuMepDelegationCountry(iso) {
  return !!COUNTRY_ISO_TO_EUROPARL[String(iso || '').toUpperCase()];
}

/**
 * National MEPs for an EU member state (from Europarl cache) plus EP committee chairs.
 * For non-delegation ISO (e.g. GB post-Brexit), returns chairs only so UK users still see EP context.
 */
async function fetchMepRepsAndChairsForEuMember(countryIso) {
  const iso = String(countryIso || '').toUpperCase();
  const out = [];
  if (COUNTRY_ISO_TO_EUROPARL[iso]) {
    try {
      const all = await loadEuroparlMepsMasterList();
      out.push(...mepRowsToReps(all, iso));
    } catch (e) {
      console.warn('⚠️  Europarl MEP list failed:', e.message);
    }
  }
  try {
    out.push(...(await fetchEpCommitteeChairs()));
  } catch (e) {
    console.warn('⚠️  EP committee chairs load failed:', e.message);
  }
  return out;
}

/**
 * @param {'DE'|'GB'} country
 * @param {string} location user location / full address string
 */
async function fetchEUReps(country, location) {
  const out = [];

  if (country === 'DE') {
    let bt = [];
    try {
      bt = await fetchBundestagDirectMandate(location);
    } catch (e) {
      console.warn('⚠️  Bundestag lookup failed:', e.message);
    }
    out.push(...bt);
    out.push(...(await fetchMepRepsAndChairsForEuMember('DE')));
    return out;
  }

  if (country === 'GB') {
    let mp = [];
    try {
      mp = await fetchUkMp(location);
    } catch (e) {
      console.warn('⚠️  UK MP lookup failed:', e.message);
    }
    out.push(...mp);
    out.push(...(await fetchMepRepsAndChairsForEuMember('GB')));
    return out;
  }

  return out;
}

module.exports = {
  fetchEUReps,
  fetchMepRepsAndChairsForEuMember,
  fetchBundestagDirectMandate,
  fetchUkMp,
  isEuMepDelegationCountry,
  COUNTRY_ISO_TO_EUROPARL,
  extractGermanPostcode,
  extractUkPostcode,
  EP_COMMITTEES,
};
