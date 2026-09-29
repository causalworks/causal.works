const fs = require('fs');
const nodePath = require('path');

const HIGHLIGHTS_PATH = nodePath.join(__dirname, 'data', 'policy-highlights.json');
const FR_BASE = 'https://www.federalregister.gov/api/v1/documents.json';
const FR_USER_AGENT =
  process.env.FEDERAL_REGISTER_USER_AGENT || 'Causal/1.0 (https://causal.works; ops@causal.works)';

/**
 * Federal Register rows that often match broad E4A keywords but are weak “civic actions” for most users.
 */
const FR_EXCLUDE_SUBSTRINGS = [
  'fisheries of',
  'fishery management',
  'fishery;',
  'marine mammal',
  'export-import bank',
  'export import bank',
  'ex-im bank',
  'class d airspace',
  'class e airspace',
  'class g airspace',
  'treasury securities',
  'marketable treasury',
  'postal products',
  'notice of closed meeting',
  'sunshine act meeting',
  'information collection',
  'paperwork reduction',
  'submission for omb',
  'agency information collection',
  'national marine',
  'exclusive economic zone',
  'incidental take',
];

/**
 * New-build/fossil-infrastructure signal — phrase-level, since single words like
 * "new" are too weak alone. Must co-occur with a fuel-type noun (below) to count.
 */
const NEW_BUILD_PHRASES = [
  'proposed terminal',
  'proposed pipeline',
  'proposed facility',
  'proposed plant',
  'notice of intent to construct',
  'application to construct',
  'authorization to site and operate',
  'authorization to construct',
  'export terminal',
  'construct and operate',
];

/**
 * Fuel-type nouns required alongside a NEW_BUILD_PHRASES hit — co-occurrence,
 * not either alone. This is a binary "new fossil infrastructure, yes/no" filter,
 * not a three-way direction classifier: retirement/decommission and
 * renewable-siting notices are never positively detected, they simply fall
 * through this same no-match path along with everything else.
 */
const FUEL_TYPE_NOUNS = [
  'lng',
  'liquefied natural gas',
  'natural gas',
  'gas plant',
  'gas-fired',
  'coal',
  'oil pipeline',
  'petroleum',
  'compressor station',
  'pipeline',
];

/**
 * New-facility siting signal for CAFOs — same co-occurrence shape as
 * NEW_BUILD_PHRASES/FUEL_TYPE_NOUNS above, tuned to CAFO permitting vocabulary.
 */
const CAFO_NEW_BUILD_PHRASES = [
  'proposed facility',
  'proposed operation',
  'notice of intent to construct',
  'application to construct',
  'permit application for',
  'authorization to construct',
  'construct and operate',
  'new construction of',
];

const CAFO_TYPE_NOUNS = [
  'concentrated animal feeding operation',
  'cafo',
  'swine facility',
  'poultry facility',
  'dairy operation',
  'feedlot',
  'hog operation',
  'confined animal feeding',
];

/**
 * Chemical/petrochemical/plastics facility siting signal.
 */
const CHEMICAL_NEW_BUILD_PHRASES = [
  'proposed facility',
  'proposed plant',
  'notice of intent to construct',
  'application to construct',
  'authorization to site and operate',
  'authorization to construct',
  'construct and operate',
];

const CHEMICAL_TYPE_NOUNS = [
  'chemical manufacturing facility',
  'petrochemical facility',
  'petrochemical plant',
  'plastics facility',
  'chemical plant',
  'polymer facility',
  'ethylene facility',
  'chemical processing facility',
];

/**
 * Mining/mineral-extraction siting signal — "construct" doesn't fit mining
 * vocabulary, so this gets its own new-build phrase list rather than reusing
 * NEW_BUILD_PHRASES or CAFO/CHEMICAL's.
 */
const MINING_NEW_BUILD_PHRASES = [
  'proposed mine',
  'proposed mining project',
  'notice of intent to mine',
  'application for mining permit',
  'plan of operations for',
  'authorization to mine',
  'permit application for',
];

const MINING_TYPE_NOUNS = [
  'mining operation',
  'surface mine',
  'open-pit mine',
  'open pit mine',
  'coal mine',
  'mineral extraction',
  'strip mine',
  'ore extraction',
  'quarry',
];

/**
 * Large industrial/agricultural water withdrawal siting signal. Narrower
 * federal footprint than the other categories (most water-rights permitting
 * is state-level, not Federal Register) — expect fewer matches, not a bug.
 */
const WATER_WITHDRAWAL_NEW_PHRASES = [
  'proposed withdrawal',
  'application for water withdrawal',
  'permit application for withdrawal',
  'authorization to withdraw',
  'new withdrawal permit',
  'application to appropriate',
];

const WATER_WITHDRAWAL_TYPE_NOUNS = [
  'water withdrawal',
  'groundwater withdrawal',
  'surface water withdrawal',
  'water diversion',
  'water appropriation',
];

/**
 * Higher-confidence terms: Federal Register row must hit this OR match ≥2 E4A buckets (after exclusions).
 */
const FR_STRONG_SUBSTRINGS = [
  'climate',
  'carbon',
  'greenhouse',
  'methane',
  'fossil fuel',
  'renewable energy',
  'clean air',
  'environmental justice',
  'tsca',
  'toxic ',
  'pollution',
  'epa',
  'emission',
  'wotus',
  'civil rights',
  ' voting ',
  'voting rights',
  'fair housing',
  'medicare',
  'medicaid',
  'snap',
  ' wic',
  'school meals',
  'title ix',
  'reproductive',
  'labor relations',
  'nlrb',
  'osha',
  'refugee',
  'asylum',
  'pesticide',
  'usda',
  'organic certification',
  'worker ',
  'union ',
];

/** Keywords per E4A turnaround — used for tagging + bucket-count signal (not for broad single-hit FR passes). */
const E4A_KEYWORD_BUCKETS = {
  Energy: [
    'energy',
    'electric',
    'climate',
    'carbon',
    'emission',
    'fossil',
    'fuel',
    'clean air',
    'renewable',
    'solar',
    'wind',
    'methane',
    'greenhouse',
    'ghg',
    'toxic',
    'tsca',
    'chemical',
    'pollution',
    'environmental protection',
    'conservation',
    'wildlife',
    'offshore',
    'drilling',
    'mining',
    'nuclear',
    'efficiency',
    'fuel economy',
    'federal lands',
    'water quality',
    'air quality',
    'superfund',
    'environment',
    'epa',
  ],
  Food: [
    'agricultur',
    'farm',
    'crop',
    'livestock',
    'fsis',
    'nutrition',
    'snap',
    'wic',
    'rural',
    'forest',
    'pesticide',
    'usda',
    'grain',
    'dairy',
    'meat',
  ],
  Inequality: [
    'labor',
    'worker',
    'wage',
    'fair housing',
    'discrimination',
    'financial institution',
    'banking',
    'consumer protection',
    'cftc',
    'antitrust',
    'olrf',
    'monetary policy',
    ' nlrb',
  ],
  Poverty: [
    'foreign assist',
    'usaid',
    'immigration',
    'refugee',
    'global health',
    'peace corps',
    'debt relief',
  ],
  Empowerment: [
    'medicare',
    'medicaid',
    'education',
    'school',
    'women',
    'gender',
    'reproductive',
    'title ix',
    'disability',
    'human services',
    'cdc',
    'fda',
    'nih',
    'mental health',
    'public health',
    'medical device',
  ],
};

const TAG_TO_BUCKETS = {
  environment: ['Energy'],
  energy: ['Energy'],
  climate: ['Energy'],
  food: ['Food'],
  agriculture: ['Food'],
  inequality: ['Inequality'],
  poverty: ['Poverty'],
  empowerment: ['Empowerment'],
};

let highlightsCache = null;
let highlightsMtime = null;

function loadHighlights() {
  try {
    const st = fs.statSync(HIGHLIGHTS_PATH);
    if (highlightsCache && highlightsMtime === st.mtimeMs) return highlightsCache;
    const raw = fs.readFileSync(HIGHLIGHTS_PATH, 'utf8');
    highlightsCache = JSON.parse(raw);
    highlightsMtime = st.mtimeMs;
    return highlightsCache;
  } catch (e) {
    console.warn('policy-feed: highlights not loaded:', e.message);
    return { items: [] };
  }
}

function toHttps(url) {
  if (!url || typeof url !== 'string') return null;
  return url.replace(/^http:\/\/www\.regulations\.gov\//i, 'https://www.regulations.gov/');
}

function itemHaystack(item) {
  return [item.title, item.abstract, item.agency_summary, item.doc_type, item.document_number]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function frHayExcluded(hay) {
  return FR_EXCLUDE_SUBSTRINGS.some((ex) => hay.includes(ex));
}

function frHasStrongSignal(hay) {
  return FR_STRONG_SUBSTRINGS.some((s) => hay.includes(s));
}

/**
 * Does this notice look like a new fossil-fuel infrastructure project being
 * proposed/authorized (LNG terminal, gas plant, pipeline, etc.)? Binary filter,
 * not a direction classifier — see NEW_BUILD_PHRASES/FUEL_TYPE_NOUNS comments.
 * Not yet wired into buildPolicyFeed()/attachBucketsAndQuality(): those serve
 * the general policy feed across all E4A topics, and gating on this here would
 * incorrectly exclude legitimate non-infrastructure Energy notices that were
 * never expected to mention a terminal/pipeline. This is exported standalone
 * for the infra keyword-bucket expansion and/or the permitting scheduled job
 * to call once those exist.
 */
function isNewFossilInfrastructureNotice(item) {
  const hay = itemHaystack(item);
  if (!NEW_BUILD_PHRASES.some((p) => hay.includes(p))) return false;
  return FUEL_TYPE_NOUNS.some((f) => hay.includes(f));
}

/**
 * Does this notice look like a new CAFO (concentrated animal feeding
 * operation) being sited? Same binary co-occurrence shape as
 * isNewFossilInfrastructureNotice() — no retirement/closure detection.
 */
function isNewCAFONotice(item) {
  const hay = itemHaystack(item);
  if (!CAFO_NEW_BUILD_PHRASES.some((p) => hay.includes(p))) return false;
  return CAFO_TYPE_NOUNS.some((t) => hay.includes(t));
}

/**
 * Does this notice look like a new chemical/petrochemical/plastics facility
 * being sited? Same binary co-occurrence shape as
 * isNewFossilInfrastructureNotice().
 */
function isNewChemicalFacilityNotice(item) {
  const hay = itemHaystack(item);
  if (!CHEMICAL_NEW_BUILD_PHRASES.some((p) => hay.includes(p))) return false;
  return CHEMICAL_TYPE_NOUNS.some((t) => hay.includes(t));
}

/**
 * Does this notice look like a new mining/mineral-extraction project being
 * sited? Own new-build phrase list — "construct" language doesn't fit mining
 * permitting vocabulary the way it does for facilities.
 */
function isNewMiningNotice(item) {
  const hay = itemHaystack(item);
  if (!MINING_NEW_BUILD_PHRASES.some((p) => hay.includes(p))) return false;
  return MINING_TYPE_NOUNS.some((t) => hay.includes(t));
}

/**
 * Does this notice look like a new large industrial/agricultural water
 * withdrawal permit? Narrower federal footprint than the other categories
 * (most water-rights permitting is state-level) — expect this to fire rarely.
 */
function isNewLargeWaterWithdrawalNotice(item) {
  const hay = itemHaystack(item);
  if (!WATER_WITHDRAWAL_NEW_PHRASES.some((p) => hay.includes(p))) return false;
  return WATER_WITHDRAWAL_TYPE_NOUNS.some((t) => hay.includes(t));
}

// isNewDataCenterNotice() intentionally not built — see docs/Causal_Development_Path.md's
// permitting-pipeline entry for the framing decision (topic-only flag vs. gated on
// co-occurrence with new fossil generation). Federal Register text alone doesn't carry
// enough signal to know if a given data center notice is high-leverage.

/**
 * Ordered registry of siting-notice categories the permitting job checks, each
 * with its own binary test + the boundary/turnaround tags to apply on a match.
 * First match wins (checked in this order) — a notice is tagged with one
 * category, not a union, matching the one-leverage-point-template-per-notice
 * pattern the job already uses. Add new categories here, not by hand-wiring
 * another if/else into permitting-job.js.
 */
const INFRASTRUCTURE_CATEGORIES = [
  {
    id: 'fossil',
    test: isNewFossilInfrastructureNotice,
    turnaround_category: 'Energy',
    boundary_ids: ['climate'],
  },
  {
    id: 'cafo',
    test: isNewCAFONotice,
    turnaround_category: 'Food',
    // Codebase precedent (ai-service.js PLANETARY_BOUNDARIES_GUIDANCE): "agricultural
    // runoff → freshwater, biogeochem, land" — biogeochem, not novel, is the boundary
    // nutrient runoff maps to. Using that over a literal "novel entities" reading.
    boundary_ids: ['freshwater', 'biosphere', 'biogeochem'],
  },
  {
    id: 'chemical',
    test: isNewChemicalFacilityNotice,
    turnaround_category: 'Energy',
    boundary_ids: ['novel'],
  },
  {
    id: 'mining',
    test: isNewMiningNotice,
    turnaround_category: 'Energy',
    boundary_ids: ['land', 'biosphere', 'freshwater'],
  },
  {
    id: 'water_withdrawal',
    test: isNewLargeWaterWithdrawalNotice,
    turnaround_category: 'Food',
    boundary_ids: ['freshwater'],
  },
];

/**
 * Live Federal Register: exclude noise, require strong civic-relevance signal.
 */
function passesFrQualityGate(item, e4aBuckets) {
  const hay = itemHaystack(item);
  if (frHayExcluded(hay)) return false;
  if (frHasStrongSignal(hay)) return true;
  if (e4aBuckets.length >= 2) return true;
  return false;
}

function inferE4ABuckets(item) {
  const buckets = new Set();
  const tag = String(item.turnaround_tag || '')
    .trim()
    .toLowerCase();
  if (tag && TAG_TO_BUCKETS[tag]) {
    for (const b of TAG_TO_BUCKETS[tag]) buckets.add(b);
  }
  const hay = itemHaystack(item);
  for (const [bucket, keywords] of Object.entries(E4A_KEYWORD_BUCKETS)) {
    for (const kw of keywords) {
      if (hay.includes(kw)) {
        buckets.add(bucket);
        break;
      }
    }
  }
  return [...buckets].sort();
}

function attachBucketsAndQuality(item) {
  const e4a_buckets = inferE4ABuckets(item);
  if (!e4a_buckets.length) return null;
  if (item.source === 'curated') {
    return { ...item, e4a_buckets };
  }
  if (!passesFrQualityGate(item, e4a_buckets)) return null;
  return { ...item, e4a_buckets };
}

function normalizeCurated(row) {
  const close = row.comment_close_on ? String(row.comment_close_on).slice(0, 10) : null;
  return {
    id: String(row.id || `curated-${row.document_number || Math.random()}`),
    source: 'curated',
    title: String(row.title || '').trim(),
    agency_summary: String(row.agency_summary || '').trim(),
    abstract: row.abstract ? String(row.abstract).trim() : null,
    comment_close_on: close,
    comment_url: toHttps(row.comment_url) || null,
    federal_register_url: row.federal_register_url ? String(row.federal_register_url).trim() : null,
    document_number: row.document_number ? String(row.document_number) : null,
    turnaround_tag: row.turnaround_tag ? String(row.turnaround_tag) : null,
    why_it_matters: row.why_it_matters ? String(row.why_it_matters).trim() : null,
    documented_links: Array.isArray(row.documented_links) ? row.documented_links : undefined,
  };
}

async function fetchFederalRegisterOpenComments() {
  const fields = [
    'title',
    'abstract',
    'html_url',
    'document_number',
    'publication_date',
    'agencies',
    'comments_close_on',
    'comment_url',
    'type',
  ];
  const params = new URLSearchParams();
  params.set('per_page', '100');
  params.set('order', '-publication_date');
  for (const f of fields) {
    params.append('fields[]', f);
  }
  const url = `${FR_BASE}?${params.toString()}`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': FR_USER_AGENT },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(tid);
  }
  if (!res.ok) {
    console.error('policy-feed: Federal Register HTTP', res.status);
    return [];
  }
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (const r of results) {
    const closeRaw = r.comments_close_on;
    if (!closeRaw) continue;
    const close = new Date(`${String(closeRaw).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(close.getTime()) || close < today) continue;
    const agencies = Array.isArray(r.agencies) ? r.agencies : [];
    const parts = [];
    for (const ag of agencies) {
      if (ag.name) parts.push(ag.name);
      else if (ag.raw_name) parts.push(ag.raw_name);
    }
    const agency_summary = parts.join(' · ') || '';
    out.push({
      id: `fr-${r.document_number}`,
      source: 'federal_register',
      title: String(r.title || '').trim(),
      agency_summary: String(agency_summary).trim(),
      abstract: r.abstract ? String(r.abstract).trim() : null,
      comment_close_on: String(closeRaw).slice(0, 10),
      comment_url: toHttps(r.comment_url) || null,
      federal_register_url: r.html_url ? String(r.html_url).trim() : null,
      document_number: r.document_number ? String(r.document_number) : null,
      doc_type: r.type ? String(r.type) : null,
    });
  }
  return out;
}

async function buildPolicyFeed(/* options = {} */) {
  // Federal Register feed — preserved for future use in Levers/Policy timing layer.
  /*
  const hl = loadHighlights();
  const curatedRaw = (hl.items || []).map(normalizeCurated).filter((x) => x.title);
  const curated = [];
  for (const row of curatedRaw) {
    const filtered = attachBucketsAndQuality(row);
    if (filtered) curated.push(filtered);
  }

  const liveRaw = await fetchFederalRegisterOpenComments();
  const seen = new Set(curated.map((c) => c.document_number).filter(Boolean));
  const merged = [...curated];
  for (const row of liveRaw) {
    if (row.document_number && seen.has(row.document_number)) continue;
    const filtered = attachBucketsAndQuality(row);
    if (!filtered) continue;
    merged.push(filtered);
    if (row.document_number) seen.add(row.document_number);
  }

  merged.sort((a, b) => {
    const da = a.comment_close_on || '9999';
    const db = b.comment_close_on || '9999';
    return da.localeCompare(db);
  });

  const cap = options.maxItems ?? 25;
  const items = merged.slice(0, cap);

  return {
    items,
    meta: {
      e4a_filtered: true,
      fr_quality_gate: true,
      federal_register_attribution: 'Federal Register API (public data); live rows pass an extra relevance gate.',
      highlights_path: 'server/data/policy-highlights.json',
    },
  };
  */
  return { items: [], meta: null };
}

module.exports = {
  buildPolicyFeed,
  loadHighlights,
  fetchFederalRegisterOpenComments,
  inferE4ABuckets,
  isNewFossilInfrastructureNotice,
  isNewCAFONotice,
  isNewChemicalFacilityNotice,
  isNewMiningNotice,
  isNewLargeWaterWithdrawalNotice,
  INFRASTRUCTURE_CATEGORIES,
  passesFrQualityGate,
};
