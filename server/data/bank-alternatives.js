// Curated by server/scripts/enrich-bank-alternatives.js from a hand-picked name
// list, cross-checked against FDIC (banks) and manual overrides, then live-checked
// against real HTTP responses (server/scripts/validate-bank-urls.js). Rules this
// file depends on (see 2026-08 reviews — Locus/GreenFi, the mistagged-national
// bug, and broken URLs for Walden Mutual/Spring Bank/West Community CU/Thrivent):
//
// 1. Every entry here must be an actual deposit-taking bank or credit union —
//    not an investment app, nonprofit, or other fintech that merely partners
//    with a bank. `type` records which kind it is.
// 2. Every `website` must be a live, currently-resolving URL — verified via
//    validate-bank-urls.js, not carried over from an unverified source list.
//    Three entries were found dead this way (Walden Mutual, Spring Bank, West
//    Community CU had wrong domains entirely) and a fourth (Thrivent FCU) was
//    dropped outright — its site is unreachable and nothing in this data ever
//    established any fossil-fuel/climate alignment for it; it had only ever
//    been marked "national" by an unverified guess, not a real check.
// 3. `states` must be a real, verified service area — no "national" default.
//    `fossilFreeAlliance: true` (an actual, externally-vetted Bank.Green Fossil
//    Free Alliance membership — see https://bank.green/certification/)
//    is the only thing that makes an entry visible regardless of the user's
//    state; that's a real independent signal, not a location guess. Everything
//    else only shows when the user's real state matches `states` — this matters
//    especially for credit unions, which have genuine membership-eligibility
//    restrictions tied to geography (see server/individual/routes/bank.js).
const BANK_ALTERNATIVES = [
  { "name": "Beneficial State Bank", "type": "bank", "fossilFreeAlliance": true, "website": "https://beneficialstatebank.com/", "states": ["CA", "OR", "WA"], "matched": true, "country": "US" },
  { "name": "Walden Mutual", "type": "bank", "fossilFreeAlliance": true, "website": "https://waldensavings.bank/", "states": [], "matched": true, "country": "US" },
  { "name": "Amalgamated Bank", "type": "bank", "fossilFreeAlliance": true, "website": "https://www.amalgamatedbank.com", "states": ["NY", "IL"], "matched": true, "country": "US" },
  { "name": "Climate First Bank", "type": "bank", "fossilFreeAlliance": true, "website": "https://www.climatefirstbank.com", "states": ["FL"], "matched": true, "country": "US" },
  { "name": "Spring Bank", "type": "bank", "fossilFreeAlliance": true, "website": "https://www.spring.bank/", "states": ["NY"], "matched": true, "country": "US" },
  { "name": "Berkshire Bank", "type": "bank", "fossilFreeAlliance": false, "website": "http://www.berkbank.com", "states": ["MA", "NY", "PA"], "matched": true, "country": "US" },
  { "name": "Bethpage FCU", "type": "credit_union", "fossilFreeAlliance": false, "website": "https://www.bethpagefcu.com", "states": ["NY"], "matched": true, "country": "US" },
  { "name": "Carver Federal Savings", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.carverbank.com/", "states": ["NY"], "matched": true, "country": "US" },
  { "name": "Centinel Bank of Taos", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.centinelbank.com/", "states": ["NM"], "matched": true, "country": "US" },
  { "name": "City First Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.cityfirstbank.com", "states": ["DC", "CA"], "matched": true, "country": "US" },
  { "name": "Decorah Bank and Trust", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.decorahbank.com/", "states": ["IA"], "matched": true, "country": "US" },
  { "name": "Fifth Third Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.53.com/", "states": ["OH", "IN", "FL", "KY", "MI"], "matched": true, "country": "US" },
  { "name": "Forbright Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.forbrightbank.com/", "states": ["MD"], "matched": true, "country": "US" },
  { "name": "Hill District FCU", "type": "credit_union", "fossilFreeAlliance": false, "website": "https://www.hilldistrictfcu.org", "states": ["PA"], "matched": true, "country": "US" },
  { "name": "Huntington Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.huntington.com/", "states": ["OH", "WV", "IN", "KY"], "matched": true, "country": "US" },
  { "name": "Middlesex Federal", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.middlesexfederal.com/", "states": ["MA"], "matched": true, "country": "US" },
  { "name": "National Cooperative Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.ncb.coop/", "states": ["OH"], "matched": true, "country": "US" },
  { "name": "Optus Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://optus.bank/", "states": ["SC"], "matched": true, "country": "US" },
  { "name": "Piscataqua Savings Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.piscataqua.com", "states": ["NH"], "matched": true, "country": "US" },
  { "name": "Ponce Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.poncebank.com", "states": ["NY"], "matched": true, "country": "US" },
  { "name": "Prime Meridian Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.primemeridianbank.com/", "states": ["FL"], "matched": true, "country": "US" },
  { "name": "Verity CU", "type": "credit_union", "fossilFreeAlliance": false, "website": "https://www.veritycu.com", "states": ["WA"], "matched": true, "country": "US" },
  { "name": "Washington Federal Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.wafd.com", "states": ["WA", "OR", "ID", "AZ", "NM", "NV", "UT"], "matched": true, "country": "US" },
  { "name": "West Community CU", "type": "credit_union", "fossilFreeAlliance": false, "website": "https://www.westcommunitycu.org/", "states": ["MO"], "matched": true, "country": "US" },
  { "name": "Wildfire CU", "type": "credit_union", "fossilFreeAlliance": false, "website": "https://www.wildfirecreditunion.org", "states": ["MI"], "matched": true, "country": "US" },
  { "name": "Wintrust Bank", "type": "bank", "fossilFreeAlliance": false, "website": "https://www.wintrustbank.com", "states": ["IL"], "matched": true, "country": "US" }
];

module.exports = { BANK_ALTERNATIVES };
