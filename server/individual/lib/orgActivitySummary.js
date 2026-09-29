'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = 'gemini-2.5-flash';
const CACHE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — action content changes faster than nonprofit financials
const ACTION_LIMIT = 15;

function getModel() {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: MODEL });
}

async function generateActivitySummary(orgName, actions) {
  const model = getModel();
  if (!model) return null;

  const payload = actions.map((a) => ({
    action_type: a.action_type,
    turnaround_category: a.turnaround_category,
    action_ask: a.action_ask,
    leverage_point: a.leverage_point,
    strategy_text: a.strategy_text,
  }));

  const prompt = `You are summarizing a nonprofit/advocacy organization's recent activity for a supporter who wants to understand what the org actually does, at a glance. Given these recent actions from "${orgName}" (JSON below), write exactly 1-2 sentences (max ~40 words) describing what they're working on right now. If their activity goes beyond petitions (e.g. boycotts, comment periods, lobbying, direct contact campaigns, litigation, volunteering), call that out specifically — that's the most useful signal for a supporter deciding how deep this org's work goes. Do not invent facts not in the data. Do not use the word "petition" if all they do is petitions — just describe the topic focus instead. Data: ${JSON.stringify(payload)}`;

  try {
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 15000)),
    ]);
    let t = result.response && result.response.text ? result.response.text() : '';
    t = String(t || '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    if (t.length > 300) t = `${t.slice(0, 297)}...`;
    return t;
  } catch (e) {
    console.error('org activity summary Gemini:', e.message);
    return null;
  }
}

// Cheap, no-AI fallback: breadth of tactics used, derived straight from action_type.
function fallbackSummary(actions) {
  if (!actions.length) return null;
  const types = Array.from(new Set(actions.map((a) => a.action_type).filter(Boolean)));
  if (!types.length) return null;
  const nonPetition = types.filter((t) => t !== 'petition');
  if (!nonPetition.length) return `${actions.length} action${actions.length === 1 ? '' : 's'} this year, all petitions.`;
  return `${actions.length} action${actions.length === 1 ? '' : 's'} this year, including ${nonPetition.join(', ')}.`;
}

// Plain fetch + crude tag-strip — good enough for a summarization prompt, and avoids
// a Puppeteer launch (server.js's scrapeUrl) for what's usually static homepage markup.
async function fetchWebsiteText(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html', 'User-Agent': 'causal-app/1.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 4000) || null;
  } catch (e) {
    console.error('org website fetch:', e.message);
    return null;
  }
}

function domainFromUrlOrEmail(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  try {
    if (v.includes('@')) return v.split('@').pop().toLowerCase().trim() || null;
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return (u.hostname || '').toLowerCase().replace(/^www\./, '') || null;
  } catch (_) {
    return null;
  }
}

// Fallback source for orgs whose first contact with a user wasn't a tracked action
// (e.g. a welcome/newsletter email, not a petition) — match by sender domain against
// sender_domains or the org's own website domain, take the earliest, summarize that.
async function generateFirstEmailSummary(pool, orgId, orgName) {
  const model = getModel();
  if (!model) return null;

  const orgR = await pool.query(`SELECT sender_domains, website_url FROM orgs WHERE id = $1`, [orgId]);
  const org = orgR.rows[0];
  if (!org) return null;
  const domains = new Set((org.sender_domains || []).map((d) => String(d).toLowerCase()));
  const siteDomain = domainFromUrlOrEmail(org.website_url);
  if (siteDomain) domains.add(siteDomain);
  if (!domains.size) return null;

  const emailR = await pool.query(
    `SELECT subject, preview, from_address
     FROM user_inbound_emails
     WHERE from_address IS NOT NULL
     ORDER BY received_at ASC
     LIMIT 500`
  );
  const first = emailR.rows.find((r) => domains.has(domainFromUrlOrEmail(r.from_address) || ''));
  if (!first) return null;

  const prompt = `You are summarizing a nonprofit/advocacy organization's work for a supporter who wants to understand what the org actually does, at a glance. This is the earliest email we have on file from "${orgName}" (subject + preview, not a formal petition/ask). Write exactly 1-2 sentences (max ~40 words) describing what they do, based only on this text — if it doesn't clearly describe a mission, say so briefly rather than guessing. Subject: ${first.subject || ''}\nPreview: ${first.preview || ''}`;

  try {
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 15000)),
    ]);
    let t = result.response && result.response.text ? result.response.text() : '';
    t = String(t || '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    if (t.length > 300) t = `${t.slice(0, 297)}...`;
    return t;
  } catch (e) {
    console.error('org first-email summary Gemini:', e.message);
    return null;
  }
}

// Fallback source for orgs with no petitions/asks on file yet — summarize their own
// homepage instead of asking Gemini to describe an empty action list.
async function generateWebsiteSummary(orgName, websiteUrl) {
  const model = getModel();
  if (!model || !websiteUrl) return null;
  const url = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  const pageText = await fetchWebsiteText(url);
  if (!pageText) return null;

  const prompt = `You are summarizing a nonprofit/advocacy organization's work for a supporter who wants to understand what the org actually does, at a glance. Given this raw text scraped from "${orgName}"'s homepage, write exactly 1-2 sentences (max ~40 words) describing what they do. Do not invent facts not present in the text — if the text doesn't clearly describe a mission, say so briefly rather than guessing. Homepage text: ${pageText}`;

  try {
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 15000)),
    ]);
    let t = result.response && result.response.text ? result.response.text() : '';
    t = String(t || '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    if (t.length > 300) t = `${t.slice(0, 297)}...`;
    return t;
  } catch (e) {
    console.error('org website summary Gemini:', e.message);
    return null;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {string} orgName
 * @param {{ refresh?: boolean, websiteUrl?: string }} [opts]
 * @returns {Promise<string|null>}
 */
async function ensureOrgActivitySummary(pool, orgId, orgName, opts = {}) {
  const refresh = !!opts.refresh;

  const cacheR = await pool.query(
    `SELECT activity_summary_text, activity_summary_generated_at FROM orgs WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  const cr = cacheR.rows[0] || {};
  if (!refresh && cr.activity_summary_text && cr.activity_summary_generated_at) {
    const age = Date.now() - new Date(cr.activity_summary_generated_at).getTime();
    if (age >= 0 && age < CACHE_MS) return cr.activity_summary_text;
  }

  const actionsR = await pool.query(
    `SELECT action_type, turnaround_category, action_ask, leverage_point, strategy_text
     FROM actions
     WHERE org_id = $1 AND COALESCE(action_ask, '') <> 'Manual review required'
     ORDER BY created_at DESC
     LIMIT $2`,
    [orgId, ACTION_LIMIT]
  );
  const actions = actionsR.rows;

  let summary = null;
  if (actions.length > 0) {
    summary = await generateActivitySummary(orgName, actions);
    if (!summary) summary = fallbackSummary(actions);
  } else {
    // No petitions/asks on file — try the earliest email we've seen from them,
    // then their own homepage, before giving up.
    summary = await generateFirstEmailSummary(pool, orgId, orgName);
    if (!summary) summary = await generateWebsiteSummary(orgName, opts.websiteUrl);
  }
  if (!summary) summary = `No activity data available yet for ${orgName}.`;

  await pool.query(
    `UPDATE orgs SET activity_summary_text = $2, activity_summary_generated_at = NOW() WHERE id = $1`,
    [orgId, summary]
  );

  return summary;
}

module.exports = { ensureOrgActivitySummary, fallbackSummary, CACHE_MS };
