/**
 * Canonical org resolution: sender_domains (DB), aliases, normalized names.
 * Used by inbound pipeline and optional maintenance scripts.
 */

function stripDiacritics(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeOrgLookupKey(input) {
  return stripDiacritics(String(input || '').toLowerCase())
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function extractHostFromEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  const host = s.split('@')[1];
  return (host || '').trim();
}

/**
 * Human-readable fallback when no org row matches (e.g. Gemini context, receipts).
 * Not used for authoritative org_id resolution.
 */
function displayLabelFromEmail(email) {
  const host = extractHostFromEmail(email);
  if (!host) return '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length >= 2) {
    const registrable = parts.slice(-2).join('.');
    if (registrable === '350.org') return '350.org';
    const leaf = parts[parts.length - 2];
    return leaf.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return host;
}

/** @deprecated Use displayLabelFromEmail — kept for call sites that expected old name */
function inferOrgNameFromDomain(senderEmail) {
  return displayLabelFromEmail(senderEmail);
}

function normalizeSenderDomainsInput(raw) {
  if (raw == null || raw === '') return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\s,;\n]+/);
  return [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function inferOrgNameFromLocalPart(localPart) {
  const base = String(localPart || '')
    .split('+')[0]
    .replace(/[^a-z0-9._-]/gi, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!base) return null;
  return base
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .slice(0, 120);
}

/**
 * Match active org by sender_domains: exact host match or host is subdomain of listed domain.
 */
async function resolveActiveOrgBySenderDomain(pool, senderEmail) {
  const host = extractHostFromEmail(senderEmail);
  if (!host) return null;
  try {
    const r = await pool.query(
      `SELECT o.id, o.name
       FROM orgs o
       CROSS JOIN LATERAL unnest(COALESCE(o.sender_domains, '{}'::text[])) AS sd(domain)
       WHERE COALESCE(o.subscription_status, 'active') = 'active'
         AND cardinality(COALESCE(o.sender_domains, '{}'::text[])) > 0
         AND length(trim(sd.domain)) > 0
         AND (
           lower($1::text) = lower(trim(sd.domain))
           OR lower($1::text) LIKE '%.' || lower(trim(sd.domain))
         )
       ORDER BY length(trim(sd.domain)) DESC, o.id ASC
       LIMIT 1`,
      [host]
    );
    return r.rows[0] || null;
  } catch (e) {
    if (e.message && /sender_domains|column .* does not exist/i.test(e.message)) return null;
    throw e;
  }
}

async function resolveActiveOrgByName(pool, rawName) {
  const exact = await pool.query(
    `SELECT id, name
     FROM orgs
     WHERE LOWER(name) = LOWER($1)
       AND COALESCE(subscription_status, 'active') = 'active'
     LIMIT 1`,
    [rawName]
  );
  if (exact.rows[0]) return exact.rows[0];

  const orgKey = normalizeOrgLookupKey(rawName);
  if (!orgKey) return null;

  try {
    const aliased = await pool.query(
      `SELECT o.id, o.name
       FROM orgs o
       LEFT JOIN org_aliases oa ON oa.org_id = o.id
       WHERE COALESCE(o.subscription_status, 'active') = 'active'
         AND (
           regexp_replace(regexp_replace(lower(o.name), '\\([^)]*\\)', '', 'g'), '[^a-z0-9]+', '', 'g') = $1
           OR oa.alias_key = $1
         )
       ORDER BY CASE WHEN oa.alias_key = $1 THEN 0 ELSE 1 END, o.id ASC
       LIMIT 1`,
      [orgKey]
    );
    return aliased.rows[0] || null;
  } catch (e) {
    const fallback = await pool.query(
      `SELECT id, name
       FROM orgs
       WHERE COALESCE(subscription_status, 'active') = 'active'
         AND regexp_replace(regexp_replace(lower(name), '\\([^)]*\\)', '', 'g'), '[^a-z0-9]+', '', 'g') = $1
       ORDER BY id ASC
       LIMIT 1`,
      [orgKey]
    );
    return fallback.rows[0] || null;
  }
}

async function resolveOrgForInboundUserSource(pool, fromAddress, replyToAddress, aiOrgName) {
  const skip = (e) => !e || String(e).includes('causal.works');
  for (const em of [fromAddress, replyToAddress]) {
    if (skip(em)) continue;
    const byDom = await resolveActiveOrgBySenderDomain(pool, em);
    if (byDom) {
      return {
        org_id: byDom.id,
        org_name: byDom.name,
        matchedVia: 'sender_domain',
        matchedEmail: em,
      };
    }
  }
  const fromAi = await resolveActiveOrgByName(pool, aiOrgName);
  if (fromAi) {
    return {
      org_id: fromAi.id,
      org_name: fromAi.name,
      matchedVia: 'ai_org_name',
      matchedEmail: null,
    };
  }
  const fallbackName = String(aiOrgName || '').trim() || 'Unknown Organization';
  return { org_id: null, org_name: fallbackName, matchedVia: 'unresolved', matchedEmail: null };
}

/**
 * Exact duplicate check on stored domain tokens (not suffix overlap).
 * excludeOrgId: null when inserting a new org row.
 */
async function assertSenderDomainsUnclaimed(pool, excludeOrgId, domains) {
  const norm = normalizeSenderDomainsInput(domains);
  if (!norm.length) return { ok: true };
  try {
    const r = await pool.query(
      `SELECT o.id, o.name, trim(d.domain) AS domain
       FROM orgs o
       CROSS JOIN LATERAL unnest(COALESCE(o.sender_domains, '{}'::text[])) AS d(domain)
       WHERE ($1::int IS NULL OR o.id <> $1::int)
         AND lower(trim(d.domain)) = ANY($2::text[])`,
      [excludeOrgId, norm]
    );
    if (r.rows.length) return { ok: false, conflict: r.rows[0] };
    return { ok: true };
  } catch (e) {
    if (e.message && /sender_domains|column .* does not exist/i.test(e.message)) return { ok: true };
    throw e;
  }
}

/** Merge new domains into existing array (lowercase, distinct). */
async function mergeSenderDomainsForOrg(pool, orgId, newDomains) {
  const norm = normalizeSenderDomainsInput(newDomains);
  if (!norm.length) return;
  try {
    const cur = await pool.query('SELECT sender_domains FROM orgs WHERE id = $1', [orgId]);
    const existing = cur.rows[0]?.sender_domains || [];
    const merged = normalizeSenderDomainsInput([...existing, ...norm]);
    await pool.query('UPDATE orgs SET sender_domains = $1::text[] WHERE id = $2', [merged, orgId]);
  } catch (e) {
    if (e.message && /sender_domains|column .* does not exist/i.test(e.message)) return;
    throw e;
  }
}

/** Best-effort extract first email from a From: line in stored raw_content. */
function extractSenderEmailFromRawContent(raw) {
  const s = String(raw || '');
  const m = s.match(/From:\s*[^\n]*<([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>/i);
  if (m) return m[1].trim().toLowerCase();
  const m2 = s.match(/From:\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (m2) return m2[1].trim().toLowerCase();
  return null;
}

async function orgDisplayNameFromSenderPool(pool, fromAddress) {
  if (!fromAddress) return '';
  const row = await resolveActiveOrgBySenderDomain(pool, fromAddress);
  return row?.name || displayLabelFromEmail(fromAddress);
}

module.exports = {
  stripDiacritics,
  normalizeOrgLookupKey,
  extractHostFromEmail,
  displayLabelFromEmail,
  inferOrgNameFromDomain,
  normalizeSenderDomainsInput,
  inferOrgNameFromLocalPart,
  resolveActiveOrgBySenderDomain,
  resolveActiveOrgByName,
  resolveOrgForInboundUserSource,
  assertSenderDomainsUnclaimed,
  mergeSenderDomainsForOrg,
  extractSenderEmailFromRawContent,
  orgDisplayNameFromSenderPool,
};
