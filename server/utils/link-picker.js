const cheerio = require('cheerio');

/** Query parameter names to strip from picked action URLs (case-insensitive). */
const TRACKING_QUERY_PARAMS = new Set([
  'akid',
  't',
  'amount',
  'currency',
  'one_click',
  'rd',
  'recurring_default',
  'source',
  'contactdata',
  'bcprtpb',
  'cid',
  '_checksum',
  'cl',
  'lang',
  'v',
  'nvep',
  'hmac',
  'emci',
  'emdi',
  'ceid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);

/**
 * Remove known tracking / ESP query parameters from a URL; drop bare params with no value;
 * trim stray trailing ? or &. On parse error, returns the original string.
 * @param {string} url
 * @returns {string}
 */
function stripTrackingParams(url) {
  if (url == null || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    const keys = [...new Set(u.searchParams.keys())];
    const toRemove = new Set();
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (TRACKING_QUERY_PARAMS.has(lower)) {
        toRemove.add(key);
        continue;
      }
      const vals = u.searchParams.getAll(key);
      if (vals.length > 0 && vals.every((v) => v === '')) {
        toRemove.add(key);
      }
    }
    for (const key of toRemove) {
      u.searchParams.delete(key);
    }
    let out = u.toString().replace(/[?&]+$/, '');
    return out;
  } catch (_) {
    return url;
  }
}

function normalizeUrl(u) {
  if (!u) return null;
  return u.trim().replace(/[),.;]+$/, '');
}

function extractLinksFromText(text) {
  const urlRegex = /https?:\/\/[^\s"'<>)]+/g;
  const all = (text || '').match(urlRegex) || [];
  return all
    .map(u => ({ url: normalizeUrl(u), text: '' }))
    .filter(x => x.url);
}

function extractLinksFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  try {
    const $ = cheerio.load(html);
    const out = [];
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      const text = ($(a).text() || '').replace(/\s+/g, ' ').trim();
      const url = normalizeUrl(href);
      if (!url) return;
      out.push({ url, text });
    });
    return out;
  } catch (_) {
    return [];
  }
}

function shouldSkipUrl(url, text = '') {
  const u = (url || '').toLowerCase();
  const t = (text || '').toLowerCase();

  const skipDomains = ['proton.me', 'protonmail.com', 'postmarkapp.com'];
  if (skipDomains.some(d => u.includes(d))) return true;

  const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'];
  if (skipExtensions.some(ext => u.endsWith(ext))) return true;

  // Tracking pixels / low-signal destinations (not CTA redirectors).
  const skipUrlPatterns = ['cloudfront.net', 'view.emails.', '/open.aspx', 'r20.rs6.net'];
  if (skipUrlPatterns.some(p => u.includes(p))) return true;
  // Skip open-tracking *hosts* only (e.g. open.constantcontact.com), not paths like /open/...
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.startsWith('open.') || host.includes('.open.')) return true;
  } catch (_) { /* ignore */ }

  const skipTextPatterns = ['unsubscribe', 'manage preferences', 'view as web page'];
  if (skipTextPatterns.some(p => t.includes(p))) return true;

  // Skip social/share intent links — we want the primary action (petition, donate, etc.), not share buttons
  const shareUrlPatterns = ['wa.me', 'whatsapp.com', 'api.whatsapp.com', 'facebook.com/sharer', 'twitter.com/intent', 'linkedin.com/share', 'web.whatsapp.com'];
  if (shareUrlPatterns.some(p => u.includes(p))) return true;

  if (u.startsWith('mailto:') || u.startsWith('tel:')) return true;

  return false;
}

function scoreLink(url, text = '') {
  const u = (url || '').toLowerCase();
  const t = (text || '').toLowerCase();
  let score = 0;

  // Prefer explicit action CTAs
  const positive = [
    'rsvp', 'join', 'sign', 'take action', 'tell', 'call', 'comment', 'register',
    'petition', 'donate', 'take a look', 'recording'
  ];
  for (const p of positive) {
    if (t.includes(p)) score += 6;
  }

  // Prefer readable anchor text over empty anchors
  if (t.length > 4) score += 2;

  // Strongly de-prioritize footer links
  if (u.includes('unsubscribe') || u.includes('preferences')) score -= 50;

  // De-prioritize social/share links (in case they slip through shouldSkipUrl)
  if (u.includes('wa.me') || u.includes('whatsapp.com') || u.includes('facebook.com/sharer') || u.includes('twitter.com/intent') || u.includes('linkedin.com/share')) score -= 40;

  // Mild preference for https
  if (u.startsWith('https://')) score += 1;

  return score;
}

function pickBestUrl(text, html) {
  const links = [
    ...extractLinksFromText(text),
    ...extractLinksFromHtml(html),
  ].filter(l => l.url && !shouldSkipUrl(l.url, l.text));

  if (links.length === 0) return null;

  // Deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const l of links) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push(l);
  }

  unique.sort((a, b) => scoreLink(b.url, b.text) - scoreLink(a.url, a.text));
  const result = unique[0]?.url || null;
  return result ? stripTrackingParams(result) : null;
}

function pickTopUrls(text, html, limit = 5) {
  const links = [
    ...extractLinksFromText(text),
    ...extractLinksFromHtml(html),
  ].filter(l => l.url && !shouldSkipUrl(l.url, l.text));

  const seen = new Set();
  const unique = [];
  for (const l of links) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push(l);
  }

  unique.sort((a, b) => scoreLink(b.url, b.text) - scoreLink(a.url, a.text));
  return unique.slice(0, limit).map((l) => ({
    ...l,
    url: l.url ? stripTrackingParams(l.url) : l.url,
  }));
}

/** Action-relevant anchor phrases for preferring CTA links when scrape was skipped. */
const ACTION_ANCHOR_PHRASES = [
  'sign', 'petition', 'act', 'take action', 'join', 'rsvp', 'donate', 'call', 'contact', 'submit'
];

/**
 * True if URL is a tracking/redirect host and should be filtered out.
 * Exception: click.actionnetwork.org is allowed when anchorText contains action keywords
 * (sign, petition, act, take action, join, rsvp, donate, call, contact, submit).
 * @param {string} url
 * @param {string} [anchorText] - Link anchor text (for Action Network exception)
 */
function isTrackingOrRedirectHost(url, anchorText = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Allow Action Network petition CTAs: host is click.actionnetwork.org and anchor has action keywords
    if (host === 'click.actionnetwork.org' && hasActionAnchor(anchorText || '')) return false;
    const trackingParts = ['click.', 'emltrk.', 'store.', 'email.', 'links.', 't.', 'go.', 'track.'];
    if (trackingParts.some(p => host.includes(p))) return true;
    if (host.includes('actionnetwork') || host.includes('action network')) return true;
    return false;
  } catch (_) {
    return true;
  }
}

function isUnsubscribeOrManage(url, text) {
  const u = (url || '').toLowerCase();
  const t = (text || '').toLowerCase();
  const combined = u + ' ' + t;
  return /unsubscribe|manage|optout|preferences/i.test(combined);
}

function isSocialOrGeneric(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'youtube.com'].some(d => host === d || host.endsWith('.' + d));
  } catch (_) {
    return true;
  }
}

function isSenderHomepage(url, senderEmail) {
  if (!url || !senderEmail) return false;
  try {
    const domain = (senderEmail || '').split('@')[1];
    if (!domain) return false;
    const u = new URL(url);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '';
    return u.hostname.toLowerCase() === domain.toLowerCase() && (path === '' || path === '/');
  } catch (_) {
    return false;
  }
}

function hasActionAnchor(text) {
  const t = (text || '').toLowerCase();
  return ACTION_ANCHOR_PHRASES.some(p => t.includes(p));
}

/**
 * When scrape is skipped (e.g. tracking URL), pick a usable source_url from email HTML only.
 * Filters tracking, unsubscribe, social, sender homepage; prefers links with action-like anchor text.
 * @param {string} html - Email HTML (e.g. req.body.HtmlBody)
 * @param {string} senderEmail - Sender address (e.g. fromAddress) for filtering org homepage
 * @returns {string|null} - Best candidate URL or null
 */
function pickSourceUrlFromEmailHtml(html, senderEmail) {
  const links = extractLinksFromHtml(html).filter(l => l.url && l.url.startsWith('http'));
  console.log(`🔍 link-picker: total links found: ${links.length}`);

  const afterTracking = links.filter(l => !isTrackingOrRedirectHost(l.url, l.text));
  const afterUnsub = afterTracking.filter(l => !isUnsubscribeOrManage(l.url, l.text));
  const afterSocial = afterUnsub.filter(l => !isSocialOrGeneric(l.url));
  const afterHomepage = afterSocial.filter(l => !isSenderHomepage(l.url, senderEmail));
  const candidates = afterHomepage.filter(l => !shouldSkipUrl(l.url, l.text));

  console.log(`🔍 link-picker: after filtering: ${candidates.length} candidates (tracking:-${links.length - afterTracking.length} unsub:-${afterTracking.length - afterUnsub.length} social:-${afterUnsub.length - afterSocial.length} homepage:-${afterSocial.length - afterHomepage.length} shouldSkip:-${afterHomepage.length - candidates.length})`);

  const seen = new Set();
  const unique = [];
  for (const l of candidates) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push(l);
  }

  const preferred = unique.filter(l => hasActionAnchor(l.text));
  console.log(`🔍 link-picker: preferred candidates: ${preferred.length} (of ${unique.length} unique)`);
  if (unique.length > 0) {
    const urls = unique.slice(0, 5).map(l => l.url);
    console.log(`🔍 link-picker: final candidates (up to 5): ${urls.join(' | ')}`);
  }

  const chosen = (preferred.length ? preferred[0] : unique[0]) || null;
  const result = chosen ? chosen.url : null;
  const finalUrl = result ? stripTrackingParams(result) : null;
  console.log(`🔍 link-picker: result: ${finalUrl == null ? 'null' : finalUrl}`);
  return finalUrl;
}

/**
 * Same filter logic as pickSourceUrlFromEmailHtml but for links extracted from plain text.
 * Use when HTML yields no candidate (e.g. text-only email).
 */
function pickSourceUrlFromText(text, senderEmail) {
  const links = extractLinksFromText(text).filter(l => l.url && l.url.startsWith('http'));
  if (links.length === 0) return null;
  const candidates = links.filter(({ url, text: anchor }) => {
    if (isTrackingOrRedirectHost(url, anchor)) return false;
    if (isUnsubscribeOrManage(url, anchor)) return false;
    if (isSocialOrGeneric(url)) return false;
    if (isSenderHomepage(url, senderEmail)) return false;
    return !shouldSkipUrl(url, anchor);
  });
  const seen = new Set();
  const unique = [];
  for (const l of candidates) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push(l);
  }
  const preferred = unique.filter(l => hasActionAnchor(l.text));
  const chosen = (preferred.length ? preferred[0] : unique[0]) || null;
  const result = chosen ? chosen.url : null;
  return result ? stripTrackingParams(result) : null;
}

/**
 * Get best URL from email (HTML + text), preferring one whose path contains pathSubstring
 * (e.g. '/petitions/'). Use when redirect chain landed on a generic page but the email
 * contains the specific action link.
 */
function pickSourceUrlFromEmailPreferringPath(html, text, senderEmail, pathSubstring) {
  const fromHtml = pathSubstring
    ? getCandidatesFromHtml(html, senderEmail)
    : [];
  const fromText = pathSubstring
    ? getCandidatesFromText(text, senderEmail)
    : [];
  const seen = new Set();
  const unique = [];
  for (const l of [...fromHtml, ...fromText]) {
    if (!l.url || !l.url.startsWith('http')) continue;
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push(l);
  }
  if (unique.length === 0) return null;
  const withPath = pathSubstring
    ? unique.filter(l => {
        try {
          return new URL(l.url).pathname.toLowerCase().includes(pathSubstring.toLowerCase());
        } catch (_) {
          return false;
        }
      })
    : [];
  const preferred = withPath.length ? withPath : unique;
  const actionFirst = preferred.filter(l => hasActionAnchor(l.text));
  const chosen = (actionFirst.length ? actionFirst[0] : preferred[0]) || null;
  const result = chosen ? chosen.url : null;
  return result ? stripTrackingParams(result) : null;
}

function getCandidatesFromHtml(html, senderEmail) {
  const links = extractLinksFromHtml(html).filter(l => l.url && l.url.startsWith('http'));
  return links.filter(({ url, text }) => {
    if (isTrackingOrRedirectHost(url, text)) return false;
    if (isUnsubscribeOrManage(url, text)) return false;
    if (isSocialOrGeneric(url)) return false;
    if (isSenderHomepage(url, senderEmail)) return false;
    return !shouldSkipUrl(url, text);
  });
}

function getCandidatesFromText(text, senderEmail) {
  const links = extractLinksFromText(text).filter(l => l.url && l.url.startsWith('http'));
  return links.filter(({ url, text: anchor }) => {
    if (isTrackingOrRedirectHost(url, anchor)) return false;
    if (isUnsubscribeOrManage(url, anchor)) return false;
    if (isSocialOrGeneric(url)) return false;
    if (isSenderHomepage(url, senderEmail)) return false;
    return !shouldSkipUrl(url, anchor);
  });
}

module.exports = {
  pickBestUrl,
  pickTopUrls,
  pickSourceUrlFromEmailHtml,
  pickSourceUrlFromText,
  pickSourceUrlFromEmailPreferringPath,
  shouldSkipUrl,
  stripTrackingParams,
};

