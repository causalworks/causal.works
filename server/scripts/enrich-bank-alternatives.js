#!/usr/bin/env node

const axios = require("axios");

const fs = require("fs/promises");
const path = require("path");
const { checkUrl } = require("./validate-bank-urls");

const TRACKER_URL =
  "https://raw.githubusercontent.com/not-a-bank/open-banking-tracker-data/master/data/institutions.json";
const TRACKER_LOCAL_ACCOUNT_PROVIDERS_DIR = path.resolve(
  __dirname,
  "../../tmp/open-banking-tracker-data/data/account-providers"
);

const FOSSIL_FREE_ALLIANCE = new Set([
  "Beneficial State Bank",
  "Walden Mutual",
  "Amalgamated Bank",
  "Climate First Bank",
  "Self-Help Credit Union",
  "Spring Bank",
]);

const MANUAL_OVERRIDES = {
  "Beneficial State Bank": {
    website: "https://beneficialstatebank.com/",
    states: ["CA", "OR", "WA"],
    matched: true,
  },
  "Walden Mutual": {
    website: "https://waldensavings.bank/",
    states: [],
    matched: true,
  },
  "Spring Bank": {
    website: "https://www.spring.bank/",
    states: ["NY"],
    matched: true,
  },
  "Bethpage FCU": {
    website: "https://www.bethpagefcu.com",
    states: ["NY"],
    matched: true,
  },
  "Hill District FCU": {
    website: "https://www.hilldistrictfcu.org",
    states: ["PA"],
    matched: true,
  },
  "Verity CU": {
    website: "https://www.veritycu.com",
    states: ["WA"],
    matched: true,
  },
  "Wildfire CU": {
    website: "https://www.wildfirecreditunion.org",
    states: ["MI"],
    matched: true,
  },
  "Amalgamated Bank": {
    website: "https://www.amalgamatedbank.com",
    states: [],
    matched: true,
  },
  "City First Bank": {
    website: "https://www.cityfirstbank.com",
    states: ["DC", "CA"],
    matched: true,
  },
  "West Community CU": {
    website: "https://www.westcommunitycu.org/",
    states: ["MO"],
    matched: true,
  },
  "Washington Federal Bank": {
    website: "https://www.wafd.com",
    states: ["WA", "OR", "ID", "AZ", "NM", "NV", "UT"],
    matched: true,
  },
};

const VERIFY_BANKS = new Set([
  "Beneficial State Bank",
  "Washington Federal Bank",
  "City First Bank",
  "Amalgamated Bank",
  "Fifth Third Bank",
  "Huntington Bank",
  "Berkshire Bank",
  "Forbright Bank",
  "National Cooperative Bank",
]);

const BANK_GREEN_NAMES = [
  "Beneficial State Bank",
  "Walden Mutual",
  "Amalgamated Bank",
  "Climate First Bank",
  "Self-Help Credit Union",
  "Spring Bank",
  "Alliant CU",
  "Berkshire Bank",
  "Bethpage FCU",
  "Brooklyn Coop FCU",
  "Carver Federal Savings",
  "Cencap FCU",
  "Centinel Bank of Taos",
  "City First Bank",
  "Clean Energy CU",
  "Decorah Bank and Trust",
  "EastRise CU",
  "Fifth Third Bank",
  "First Community CU",
  "Forbright Bank",
  "Hill District FCU",
  "Hope FCU",
  "Huntington Bank",
  "Lake Michigan CU",
  "Latino Community CU",
  "Lower East Side People's CU",
  "MariSol FCU",
  "Middlesex Federal",
  "Mission City FCU",
  "National Cooperative Bank",
  "Neighborhood Trust FCU",
  "Optus Bank",
  "Piscataqua Savings Bank",
  "Ponce Bank",
  "Prime Meridian Bank",
  "Randolph-Brooks FCU",
  "Rivermark",
  "SchoolsFirst FCU",
  "Self-Help Federal CU",
  "Sound CU",
  "Unitus Community CU",
  "US Eagle FCU",
  "USC CU",
  "Verity CU",
  "Washington Federal Bank",
  "Webster Financial",
  "West Community CU",
  "Wildfire CU",
  "Wintrust Bank",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b'federal\b/g, " federal ")
    .replace(/\bfcu\b/g, " federal credit union ")
    .replace(/\bcu\b/g, " credit union ")
    .replace(/\bco[-\s]?op\b/g, " cooperative ")
    .replace(/\bfinancial\b/g, " bank ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(/\s+/).filter(Boolean));
}

function jaccardScore(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let intersection = 0;
  for (const item of aSet) {
    if (bSet.has(item)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function stringSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const aTokens = Array.from(tokenSet(na));
  const bTokens = Array.from(tokenSet(nb));
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  const tokenScore = jaccardScore(aSet, bSet);

  const minSubstringLen = 6;
  const canUseSubstring =
    na.length >= minSubstringLen && nb.length >= minSubstringLen;
  const substringScore =
    canUseSubstring && (na.includes(nb) || nb.includes(na)) ? 0.86 : 0;

  const longATokens = aTokens.filter((token) => token.length >= 4);
  const longBSet = new Set(bTokens.filter((token) => token.length >= 4));
  let longOverlap = 0;
  for (const token of longATokens) {
    if (longBSet.has(token)) longOverlap += 1;
  }
  const longTokenBoost =
    longATokens.length > 0 ? longOverlap / longATokens.length : 0;

  return Math.max(tokenScore, substringScore, Math.min(0.98, longTokenBoost));
}

function firstPresent(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }
  return "";
}

function pickWebsite(institution) {
  return firstPresent(institution, [
    "websiteUrl",
    "developerPortalUrl",
    "website",
    "web",
    "url",
    "homepage",
    "homePage",
    "site",
    "institution_url",
    "bank_website",
  ]);
}

function pickCountry(institution) {
  const direct = firstPresent(institution, [
    "country",
    "countryHQ",
    "countryCode",
    "country_code",
  ]);
  if (direct) return direct;
  if (Array.isArray(institution?.countries) && institution.countries.length) {
    return String(institution.countries[0] || "").trim();
  }
  return "";
}

function pickRegion(institution) {
  return firstPresent(institution, [
    "state",
    "region",
    "province",
    "territory",
    "stateCode",
    "state_code",
    "regionCode",
    "region_code",
    "stateHQ",
    "regionHQ",
  ]);
}

function pickName(institution) {
  return firstPresent(institution, ["name", "institutionName", "institution_name", "displayName"]);
}

function inferType(name) {
  const n = normalize(name);
  if (
    n.includes("credit union") ||
    n.includes(" fcu ") ||
    n.endsWith(" fcu") ||
    n.includes(" cu ") ||
    n.endsWith(" cu")
  ) {
    return "credit_union";
  }
  return "bank";
}

function uniqueStates(states) {
  return Array.from(new Set((states || []).map((s) => String(s || "").trim()).filter(Boolean)));
}

function findBestMatch(targetName, institutions) {
  const scored = [];

  for (const inst of institutions) {
    const candidateName = pickName(inst);
    if (!candidateName) continue;
    const score = stringSimilarity(targetName, candidateName);
    scored.push({ inst, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10);

  let best = null;
  let bestScore = -1;
  for (const row of top) {
    const country = pickCountry(row.inst).toUpperCase();
    const usBonus = country === "US" ? 0.03 : 0;
    const weighted = row.score + usBonus;
    if (weighted > bestScore) {
      bestScore = weighted;
      best = row.inst;
    }
  }

  return { best, score: bestScore, rawTopScore: top[0]?.score ?? 0 };
}

async function enrichBankFromFdic(entry) {
  const url = "https://banks.data.fdic.gov/api/institutions";
  const params = {
    search: `NAME:"${entry.name}"`,
    fields: "NAME,STALP,CITY,WEBADDR",
    limit: 10,
  };

  try {
    const response = await axios.get(url, { params, timeout: 25000 });
    const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
    const matches = rows
      .map((row) => (row && row.data ? row.data : row))
      .filter((row) => {
        const candidate = String(row?.NAME || "");
        const score = stringSimilarity(entry.name, candidate);
        return score >= 0.6 || normalize(candidate).includes(normalize(entry.name));
      });

    const fdicStates = Array.from(
      new Set(matches.map((row) => String(row?.STALP || "").trim()).filter(Boolean))
    );
    const fdicWebsite = matches.find((row) => String(row?.WEBADDR || "").trim())?.WEBADDR || "";

    return {
      ...entry,
      states: uniqueStates(fdicStates),
      website: entry.website || String(fdicWebsite || "").trim(),
      matched: entry.matched || matches.length > 0,
    };
  } catch (error) {
    return {
      ...entry,
      states: [],
      matched: entry.matched,
    };
  }
}

async function fetchFdicRowsByName(name) {
  const url = "https://banks.data.fdic.gov/api/institutions";
  const params = {
    search: `NAME:"${name}"`,
    fields: "NAME,STALP,CITY,WEBADDR",
    limit: 10,
  };
  const response = await axios.get(url, { params, timeout: 25000 });
  const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
  return rows.map((row) => (row && row.data ? row.data : row));
}

async function runVerifyMode() {
  for (const bankName of VERIFY_BANKS) {
    console.log(`=== ${bankName} ===`);
    let rows = [];
    try {
      rows = await fetchFdicRowsByName(bankName);
    } catch (error) {
      console.log(`  FDIC query error: ${error.response?.status || error.message}`);
      console.log("");
      continue;
    }

    if (!rows.length) {
      console.log("  No FDIC candidates returned.");
      console.log("");
      continue;
    }

    for (const row of rows) {
      const candidateName = String(row?.NAME || "").trim() || "(unnamed)";
      const state = String(row?.STALP || "").trim();
      const score = stringSimilarity(bankName, candidateName);
      const matched =
        score >= 0.6 || normalize(candidateName).includes(normalize(bankName));
      if (matched) {
        console.log(
          `  FDIC candidate: "${candidateName}" [MATCHED]${state ? ` -> ${state}` : ""}`
        );
      } else {
        console.log(`  FDIC candidate: "${candidateName}" [SKIPPED]`);
      }
    }
    console.log("");
  }
}

async function loadInstitutionsFromLocalRepo() {
  const entries = await fs.readdir(TRACKER_LOCAL_ACCOUNT_PROVIDERS_DIR);
  const institutions = [];

  for (const filename of entries) {
    if (!filename.endsWith(".json")) continue;
    const filePath = path.join(TRACKER_LOCAL_ACCOUNT_PROVIDERS_DIR, filename);
    const raw = await fs.readFile(filePath, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") institutions.push(parsed);
    } catch (error) {
    }
  }

  return institutions;
}

async function loadTrackerInstitutions() {
  try {
    const response = await axios.get(TRACKER_URL, { timeout: 30000 });
    if (Array.isArray(response.data)) {
      console.log(`Loaded institutions from raw URL: ${TRACKER_URL}`);
      return response.data;
    }
  } catch (error) {
    console.log(
      `Raw URL unavailable (${TRACKER_URL}): ${error.response?.status || error.message}`
    );
  }

  console.log(
    `Falling back to local tracker files at: ${TRACKER_LOCAL_ACCOUNT_PROVIDERS_DIR}`
  );
  return loadInstitutionsFromLocalRepo();
}

async function main() {
  const verifyMode = process.argv.includes("--verify");
  if (verifyMode) {
    await runVerifyMode();
    return;
  }

  const institutions = await loadTrackerInstitutions();

  console.log(
    `Loaded tracker institutions: ${institutions.length}; bank.green names: ${BANK_GREEN_NAMES.length}`
  );

  const output = [];
  const skippedUnverified = [];
  const skippedDeadUrl = [];
  for (const name of BANK_GREEN_NAMES) {
    const type = inferType(name);
    const override = MANUAL_OVERRIDES[name];
    const fossilFreeAlliance = FOSSIL_FREE_ALLIANCE.has(name);
    let row = {
      name,
      type,
      fossilFreeAlliance,
      website: "",
      states: [],
      matched: false,
      country: "US",
    };

    if (override) {
      row = {
        ...row,
        website: override.website || "",
        states: Array.isArray(override.states) ? override.states.slice() : [],
        matched: Boolean(override.matched),
      };
    } else {
      const { best } = findBestMatch(name, institutions);
      row = {
        ...row,
        website: best ? pickWebsite(best) : "",
        matched: Boolean(best),
      };
    }

    if (row.type === "bank" && (!Array.isArray(row.states) || row.states.length === 0)) {
      row = await enrichBankFromFdic(row);
    }

    row.states = uniqueStates(row.states);

    if (!row.fossilFreeAlliance && row.states.length === 0) {
      skippedUnverified.push(name);
      continue;
    }

    if (row.website) {
      const urlCheck = await checkUrl(row.website);
      if (!urlCheck.ok) {
        skippedDeadUrl.push(`${name} (${row.website} — ${urlCheck.reason})`);
        continue;
      }
    } else {
      skippedDeadUrl.push(`${name} (no website found)`);
      continue;
    }

    output.push({
      name: row.name,
      type: row.type,
      fossilFreeAlliance: row.fossilFreeAlliance,
      website: row.website,
      states: row.states,
      matched: Boolean(row.matched),
      country: "US",
    });
  }

  if (skippedUnverified.length) {
    console.log(
      `\nSkipped ${skippedUnverified.length} unverified entries (no real state match, not Fossil Free Alliance) — ` +
      `add a MANUAL_OVERRIDES entry with real states (or FOSSIL_FREE_ALLIANCE membership) to include them:\n  ` +
      skippedUnverified.join("\n  ")
    );
  }
  if (skippedDeadUrl.length) {
    console.log(
      `\nSkipped ${skippedDeadUrl.length} entries with a dead/unreachable URL — fix the website before re-adding:\n  ` +
      skippedDeadUrl.join("\n  ")
    );
  }

  const finalJson = JSON.stringify(output, null, 2);
  await fs.writeFile(
    path.resolve(__dirname, "../../tmp/enrich-bank-alternatives-final.json"),
    finalJson
  );
  console.log(finalJson);
}

main().catch((error) => {
  console.error(`Script failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
