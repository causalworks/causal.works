'use strict';

const { stripDiacritics } = require('../org-resolution');
const { US_STATE_ABBREVS, US_STATE_NAME_TO_ABBREV, stateFromZip } = require('../data/geo');

function envTrue(name) {
  const v = String(process.env[name] || '').toLowerCase();
  return v === 'true' || v === '1';
}

function inferUserRegion(locationCountry) {
  const c = String(locationCountry || '').trim().toUpperCase();
  return c === 'US' ? 'US' : null;
}

function extractUsZipFromUserLocation(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{5}(-\d{4})?$/.test(s)) return s.slice(0, 5);
  const m = s.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function normalizeLocalPart(input) {
  return stripDiacritics(String(input || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function validLocalPart(local) {
  return /^[a-z0-9]{3,30}$/.test(String(local || ''));
}

function normalizeOrgKey(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(org|com|net)$/, '');
}

// Flips an org from pending_subscription (inbound_auto/admin-suggested) to active,
// filling in a generated causal_address if one wasn't already set. Shared by the
// /admin/validate-org and /admin/suggestions/:id/approve-* flows in server.js and
// the picklist activation path in routes/orgs.js — single implementation so both
// stay in sync (this used to be a private closure in orgs.js that server.js called
// without ever importing, silently throwing ReferenceError whenever hit).
async function activateOrgInCausal(pool, orgId) {
  const activated = await pool.query(
    `WITH target AS (
       SELECT id, name, causal_address
       FROM orgs
       WHERE id = $1
       FOR UPDATE
     ),
     candidate AS (
       SELECT
         id,
         name,
         causal_address,
         CASE
           WHEN regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = '' THEN NULL
           ELSE regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') || '@causal.works'
         END AS generated_address
       FROM target
     )
     UPDATE orgs o
     SET
       subscription_status = 'active',
       validated_via = 'admin',
       causal_address = CASE
         WHEN NULLIF(TRIM(c.causal_address), '') IS NOT NULL THEN c.causal_address
         WHEN c.generated_address IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM orgs x
           WHERE x.id <> o.id
             AND LOWER(COALESCE(x.causal_address, '')) = LOWER(c.generated_address)
         ) THEN c.generated_address
         ELSE o.causal_address
       END
     FROM candidate c
     WHERE o.id = c.id
     RETURNING o.id, o.name, o.causal_address`,
    [orgId]
  );
  if (activated.rows.length) {
    const orgKey = normalizeOrgKey(activated.rows[0].name);
    if (orgKey) {
      await pool.query(
        `UPDATE org_suggestions
         SET status = 'activated'
         WHERE regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = $1
           AND COALESCE(status, 'pending') IN ('pending', 'pending_subscription')`,
        [orgKey]
      );
    }
  }
  return activated;
}

function normalizeInvestTickers(tickers) {
  if (!Array.isArray(tickers)) return { error: 'tickers must be an array' };
  if (tickers.length > 20) return { error: 'Maximum 20 tickers' };
  const seen = new Set();
  const out = [];
  for (let i = 0; i < tickers.length; i += 1) {
    const item = tickers[i];
    if (typeof item !== 'string') return { error: 'Each ticker must be a string' };
    const u = item.trim().toUpperCase().slice(0, 10);
    if (u.length === 0 || u.length > 10 || !/^[A-Z0-9]+$/.test(u)) return { error: 'Invalid ticker' };
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return { tickers: out };
}

const ALLOWED_USER_PRIMARY_REGION = new Set(['global', 'us', 'eu', 'uk', 'de', 'fr', 'other']);

function normalizeUserPrimaryRegion(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    const k = String(x).toLowerCase().trim();
    if (ALLOWED_USER_PRIMARY_REGION.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

function extractUsStateFromAddress(address) {
  const loc = String(address || '').trim();
  if (!loc) return null;
  const cityStZip = loc.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?\b/);
  if (cityStZip && US_STATE_ABBREVS.includes(cityStZip[1])) return cityStZip[1];
  for (const abbr of US_STATE_ABBREVS) {
    if (new RegExp(`\\b${abbr}\\b`).test(loc)) return abbr;
  }
  const lower = loc.toLowerCase();
  for (const [name, abbr] of Object.entries(US_STATE_NAME_TO_ABBREV)) {
    if (lower.includes(name)) return abbr;
  }
  const zipMatch = loc.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    const stateFromZipCode = stateFromZip(zipMatch[1]);
    if (stateFromZipCode) return stateFromZipCode;
  }
  return null;
}

function parseUserBankList(bankField) {
  if (bankField == null || bankField === '') return [];
  return String(bankField)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeBankCsv(current, appendDisplayName) {
  const parts = parseUserBankList(current);
  const add = String(appendDisplayName || '').trim();
  if (!add) return parts.length ? parts.join(', ') : '';
  const seen = new Set();
  const next = [];
  for (const p of parts) {
    const low = p.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      next.push(p);
    }
  }
  const lowAdd = add.toLowerCase();
  if (!seen.has(lowAdd)) next.push(add);
  return next.join(', ');
}

function removeBankSegmentFromCsv(current, segment) {
  const rm = String(segment || '').trim().toLowerCase();
  if (!rm) return String(current || '').trim() || null;
  const parts = parseUserBankList(current).filter((p) => p.toLowerCase() !== rm);
  return parts.length ? parts.join(', ') : null;
}

module.exports = {
  envTrue,
  inferUserRegion,
  extractUsZipFromUserLocation,
  normalizeLocalPart,
  validLocalPart,
  normalizeOrgKey,
  activateOrgInCausal,
  normalizeInvestTickers,
  ALLOWED_USER_PRIMARY_REGION,
  normalizeUserPrimaryRegion,
  extractUsStateFromAddress,
  parseUserBankList,
  mergeBankCsv,
  removeBankSegmentFromCsv,
};
