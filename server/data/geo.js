// Canonical US + DE/GB geo signals for address parsing and rep country detection.

const US_STATE_NAME_TO_ABBREV = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'DC', 'District of Columbia',
];

const US_STATE_ABBREVS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

/** Display name from abbreviation (for UI + search help), e.g. MA -> Massachusetts */
const US_STATE_ABBREV_TO_NAME = {};
for (const [nameLower, abbrev] of Object.entries(US_STATE_NAME_TO_ABBREV)) {
  const title = nameLower.replace(/(^|[\s'-])(\w)/g, (_, sep, ch) => sep + ch.toUpperCase());
  US_STATE_ABBREV_TO_NAME[abbrev] = title;
}
US_STATE_ABBREV_TO_NAME.DC = 'District of Columbia';

/**
 * Standard USPS ZIP-code (first 3 digits) range allocation by state, used to
 * resolve a bare zip like "77001" to a state when no city/state text is
 * present in the input. Ranges are contiguous blocks as allocated by USPS;
 * a handful of boundary zips are routed to a neighboring state in reality,
 * so treat this as best-effort for relevance/sorting use, not authoritative
 * for anything compliance-critical. Territories (PR, VI, GU, AS, military
 * "AA"/"AE"/"AP" codes) are intentionally omitted — not in US_STATE_ABBREVS.
 */
const ZIP3_STATE_RANGES = [
  { min: 5, max: 5, state: 'NY' },
  { min: 10, max: 27, state: 'MA' },
  { min: 28, max: 29, state: 'RI' },
  { min: 30, max: 38, state: 'NH' },
  { min: 39, max: 49, state: 'ME' },
  { min: 50, max: 59, state: 'VT' },
  { min: 60, max: 69, state: 'CT' },
  { min: 70, max: 89, state: 'NJ' },
  { min: 100, max: 149, state: 'NY' },
  { min: 150, max: 196, state: 'PA' },
  { min: 197, max: 199, state: 'DE' },
  { min: 200, max: 205, state: 'DC' },
  { min: 206, max: 219, state: 'MD' },
  { min: 220, max: 246, state: 'VA' },
  { min: 247, max: 268, state: 'WV' },
  { min: 270, max: 289, state: 'NC' },
  { min: 290, max: 299, state: 'SC' },
  { min: 300, max: 319, state: 'GA' },
  { min: 320, max: 339, state: 'FL' },
  { min: 341, max: 349, state: 'FL' },
  { min: 350, max: 369, state: 'AL' },
  { min: 370, max: 385, state: 'TN' },
  { min: 386, max: 397, state: 'MS' },
  { min: 398, max: 399, state: 'GA' },
  { min: 400, max: 427, state: 'KY' },
  { min: 430, max: 459, state: 'OH' },
  { min: 460, max: 479, state: 'IN' },
  { min: 480, max: 499, state: 'MI' },
  { min: 500, max: 528, state: 'IA' },
  { min: 530, max: 549, state: 'WI' },
  { min: 550, max: 567, state: 'MN' },
  { min: 570, max: 577, state: 'SD' },
  { min: 580, max: 588, state: 'ND' },
  { min: 590, max: 599, state: 'MT' },
  { min: 600, max: 629, state: 'IL' },
  { min: 630, max: 658, state: 'MO' },
  { min: 660, max: 679, state: 'KS' },
  { min: 680, max: 693, state: 'NE' },
  { min: 700, max: 714, state: 'LA' },
  { min: 716, max: 729, state: 'AR' },
  { min: 730, max: 731, state: 'OK' },
  { min: 734, max: 741, state: 'OK' },
  { min: 750, max: 799, state: 'TX' },
  { min: 800, max: 816, state: 'CO' },
  { min: 820, max: 831, state: 'WY' },
  { min: 832, max: 838, state: 'ID' },
  { min: 840, max: 847, state: 'UT' },
  { min: 850, max: 865, state: 'AZ' },
  { min: 870, max: 884, state: 'NM' },
  { min: 889, max: 899, state: 'NV' },
  { min: 900, max: 961, state: 'CA' },
  { min: 967, max: 968, state: 'HI' },
  { min: 970, max: 979, state: 'OR' },
  { min: 980, max: 994, state: 'WA' },
  { min: 995, max: 999, state: 'AK' },
];

/** Resolve a bare US zip (5-digit string/number) to a state abbreviation, or null. */
function stateFromZip(zip) {
  const digits = String(zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(digits)) return null;
  const prefix = Number.parseInt(digits.slice(0, 3), 10);
  const hit = ZIP3_STATE_RANGES.find((r) => prefix >= r.min && prefix <= r.max);
  return hit ? hit.state : null;
}

// Richer city/country list from rep-matcher, plus explicit "germany" from legacy server.js signals.
const DE_SIGNALS = [
  'Deutschland', 'Berlin', 'München', 'Munich', 'Hamburg', 'Frankfurt', 'Köln', 'Cologne',
  'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden',
  'Hannover', 'Nürnberg', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal',
  'Bielefeld', 'Bonn', 'Münster', 'Karlsruhe', 'Mannheim', 'Augsburg',
  'germany',
];

const GB_SIGNALS = [
  'UK', 'United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland',
  'London', 'Manchester', 'Birmingham',
  'Glasgow', 'Liverpool', 'Bristol', 'Sheffield', 'Leeds', 'Edinburgh', 'Cardiff',
  'Belfast', 'Newcastle', 'Nottingham', 'Southampton', 'Oxford', 'Cambridge',
];

/**
 * When detectCountry is OTHER, try to infer EU member state (ISO2) from free-text address.
 * Order: first pattern match wins (avoid overlapping city names where possible).
 */
const EU_MEMBER_LOCATION_HINTS = [
  { iso: 'AT', patterns: [/\baustria\b/i, /\bvienna\b/i, /\bwiener\b/i] },
  { iso: 'BE', patterns: [/\bbelgium\b/i, /\bbrussels\b/i, /\bbelgique\b/i] },
  { iso: 'BG', patterns: [/\bbulgaria\b/i, /\bsofia\b/i] },
  { iso: 'HR', patterns: [/\bcroatia\b/i, /\bzagreb\b/i, /\bhrvatska\b/i] },
  { iso: 'CY', patterns: [/\bcyprus\b/i, /\bnicosia\b/i, /\blefkosia\b/i] },
  { iso: 'CZ', patterns: [/\bczechia\b/i, /\bczech republic\b/i, /\bprague\b/i, /\bpraha\b/i] },
  { iso: 'DK', patterns: [/\bdenmark\b/i, /\bcopenhagen\b/i, /\bkøbenhavn\b/i] },
  { iso: 'EE', patterns: [/\bestonia\b/i, /\btallinn\b/i] },
  { iso: 'FI', patterns: [/\bfinland\b/i, /\bhelsinki\b/i] },
  { iso: 'FR', patterns: [/\bfrance\b/i, /\bparis\b/i, /\blyon\b/i, /\bmarseille\b/i, /\btoulouse\b/i] },
  { iso: 'GR', patterns: [/\bgreece\b/i, /\bhellas\b/i, /\bathens\b/i, /\bathína\b/i] },
  { iso: 'HU', patterns: [/\bhungary\b/i, /\bbudapest\b/i] },
  { iso: 'IE', patterns: [/\bireland\b/i, /\bdublin\b/i, /\beire\b/i] },
  { iso: 'IT', patterns: [/\bitaly\b/i, /\bitalia\b/i, /\brome\b/i, /\broma\b/i, /\bmilan\b/i, /\bmilano\b/i] },
  { iso: 'LV', patterns: [/\blatvia\b/i, /\briga\b/i] },
  { iso: 'LT', patterns: [/\blithuania\b/i, /\bvilnius\b/i] },
  { iso: 'LU', patterns: [/\bluxembourg\b/i, /\blëtzebuerg\b/i] },
  { iso: 'MT', patterns: [/\bmalta\b/i, /\bvalletta\b/i] },
  { iso: 'NL', patterns: [/\bnetherlands\b/i, /\bthe netherlands\b/i, /\bholland\b/i, /\bamsterdam\b/i, /\brotterdam\b/i] },
  { iso: 'PL', patterns: [/\bpoland\b/i, /\bwarsaw\b/i, /\bwarszawa\b/i, /\bkrakow\b/i] },
  { iso: 'PT', patterns: [/\bportugal\b/i, /\blisbon\b/i, /\blisboa\b/i, /\bporto\b/i] },
  { iso: 'RO', patterns: [/\bromania\b/i, /\bbucharest\b/i, /\bbucuresti\b/i] },
  { iso: 'SK', patterns: [/\bslovakia\b/i, /\bbratislava\b/i] },
  { iso: 'SI', patterns: [/\bslovenia\b/i, /\bljubljana\b/i] },
  { iso: 'ES', patterns: [/\bspain\b/i, /\bespaña\b/i, /\bespana\b/i, /\bmadrid\b/i, /\bbarcelona\b/i, /\bseville\b/i] },
  { iso: 'SE', patterns: [/\bsweden\b/i, /\bstockholm\b/i, /\bgöteborg\b/i, /\bgothenburg\b/i] },
];

module.exports = {
  US_STATE_NAME_TO_ABBREV,
  US_STATE_ABBREV_TO_NAME,
  US_STATE_ABBREVS,
  US_STATES,
  stateFromZip,
  DE_SIGNALS,
  GB_SIGNALS,
  EU_MEMBER_LOCATION_HINTS,
};
