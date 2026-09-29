const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const { TURNAROUND_ALIASES, VALID_PARAMETERS } = require('../data/turnarounds');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
});

// ------------------------------------------------------------
// E4A FRAMEWORK — 5 TURNAROUNDS
// ------------------------------------------------------------
const E4A_FRAMEWORK = `
EARTH4ALL FRAMEWORK — 5 TURNAROUNDS (use these definitions to classify):

1. ENERGY — Reducing GHG emissions from energy production: electrification, renewables, efficiency, phasing out fossil fuels. Includes: fossil fuel infrastructure, utility regulation, pipeline opposition, clean energy policy, carbon pricing, corporate emissions targets.

2. FOOD — Reducing the crop burden needed to feed everyone: less food waste, less red meat, regenerative agriculture, food system efficiency. Includes: agricultural subsidies, factory farming, land use, food labelling, supply chain reform.

3. INEQUALITY — Redistributing wealth from owners to the working majority: progressive taxation, stronger unions, universal basic dividend, closing wage gaps. Includes: tax justice, union rights, executive pay, wealth taxes, housing affordability when linked to wealth concentration.

4. POVERTY — Accelerating GDP growth in low-income countries via new development models: debt cancellation, infant industry protection, trade reform. Includes: global south development, debt relief, IMF/World Bank reform, trade reregionalisation.

5. EMPOWERMENT — Improving quality of life for women to reduce population pressure: education, healthcare, contraception access, female leadership, pensions. Includes: reproductive rights, girls' education, gender pay gap, maternal health, women in governance.
`;

// ------------------------------------------------------------
// E4A 21 PARAMETERS — PLAIN ENGLISH
// These are the specific policy levers within each turnaround.
// Use these to populate e4a_parameters in the response.
// Prioritise the three highest-leverage parameters:
//   Worker income share, Green tech transfer, Direct air capture
// ------------------------------------------------------------
const E4A_PARAMETERS = `
EARTH4ALL 21 PARAMETERS — match actions to these specific policy levers:

ENERGY:
- Renewable grid share — grid policy, utility regulation, renewable energy mandates
- Fossil fuel phase-out speed — EV policy, building codes, fossil fuel subsidy reform
- Carbon capture scale — industrial policy, corporate emissions targets
- Energy efficiency rate — efficiency standards, corporate energy targets
- Direct air capture — R&D funding, climate tech policy [HIGHEST LEVERAGE]

FOOD:
- Meat reduction rate — food labelling, subsidy reform, supply chain reform
- Regenerative farming share — land use policy, agricultural subsidies
- Food waste reduction — supply chain reform, retail policy

INEQUALITY:
- Worker income share — union rights, minimum wage, worker dividend [HIGHEST LEVERAGE]
- Wealth tax rate — wealth tax, progressive capital taxation
- Tax progressivity — tax reform, tax justice campaigns
- Commons income — UBI campaigns, commons governance

POVERTY:
- Global debt relief — debt cancellation, IMF/World Bank reform
- Green tech transfer — trade policy, IP reform, green technology licensing [HIGHEST LEVERAGE]
- Private development finance — development finance institutions
- Public development finance — public investment banks, aid reform

EMPOWERMENT:
- Gender equity funding — gender budget campaigns
- Women's pension equity — pension reform, gender pay gap
- Reproductive health access — reproductive rights, girls' education, maternal health
`;

// ------------------------------------------------------------
// ACTION TYPES
// ------------------------------------------------------------
const ACTION_TYPES = `
ACTION TYPES — classify the primary ask into exactly one:
- petition — sign a petition or open letter
- donate — financial contribution requested
- boycott — stop buying from or using a product/service
- divest — move money away from a financial institution or fund
- volunteer — give time or skills
- attend — show up in person (rally, hearing, meeting)
- comment — submit a formal public comment to a regulator or government body
- contact — write or call an elected official or decision-maker
- newsletter — no specific action, informational content only
`;

// ------------------------------------------------------------
// TIMING CONFIDENCE GUIDANCE
// ------------------------------------------------------------
const TIMING_GUIDANCE = `
TIMING CONFIDENCE — score 1-10 based on specificity of timing window in the content:
- 8-10: Named deadline, scheduled vote, open comment period, regulatory window with specific date mentioned
- 4-7: General urgency language ("act now", "this month", "before it's too late") without specific date
- 1-3: No timing signals — evergreen ask, no deadline, no decision window referenced
Be conservative — only score 8+ if a specific date, deadline, or vote is explicitly mentioned.

DECISION WINDOW DATE — if a specific deadline, vote date, or comment period close date is explicitly stated in the content (not inferred), extract it as an ISO 8601 date string (YYYY-MM-DD). If no specific date is mentioned, return null. When extracting decision_window_date, use the current year (2026) if only a month and day are mentioned in the content. Never default to a past year.
`;

// ------------------------------------------------------------
// PLANETARY BOUNDARIES GUIDANCE
// ------------------------------------------------------------
const PLANETARY_BOUNDARIES_GUIDANCE = `
PLANETARY BOUNDARIES — identify which of the nine Stockholm Resilience Centre boundaries this action directly addresses. Use only these exact ids: climate, biosphere, land, freshwater, biogeochem, ocean, novel, aerosol, ozone. Return an empty array if none clearly apply.
Examples: fossil fuel emissions → ["climate"] | agricultural runoff → ["freshwater","biogeochem","land"] | industrial chemicals → ["novel"] | tax reform with no environmental framing → []
`;

// ------------------------------------------------------------
// ALIAS NORMALIZATION
// ------------------------------------------------------------
const VALID_TURNAROUNDS = new Set(["Energy", "Food", "Inequality", "Poverty", "Empowerment"]);

const VALID_ACTION_TYPES = new Set([
  "petition", "donate", "boycott", "divest", "volunteer",
  "attend", "comment", "contact", "newsletter"
]);

function normalizeTurnaround(raw) {
  if (!raw) return "Energy";
  const titleCase = raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
  if (VALID_TURNAROUNDS.has(titleCase)) return titleCase;
  const lower = raw.trim().toLowerCase();
  if (TURNAROUND_ALIASES[lower]) return TURNAROUND_ALIASES[lower];
  for (const valid of VALID_TURNAROUNDS) {
    if (lower.includes(valid.toLowerCase())) return valid;
  }
  for (const [alias, canonical] of Object.entries(TURNAROUND_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  console.warn(`⚠️  Unknown turnaround_category "${raw}" — defaulting to Energy`);
  return "Energy";
}

function normalizeActionType(raw) {
  if (!raw) return "petition";
  const lower = raw.trim().toLowerCase();
  if (VALID_ACTION_TYPES.has(lower)) return lower;
  console.warn(`⚠️  Unknown action_type "${raw}" — defaulting to petition`);
  return "petition";
}

function normalizeParameters(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(p => {
    if (VALID_PARAMETERS.has(p)) return true;
    console.warn(`⚠️  Unknown parameter "${p}" — dropping`);
    return false;
  });
}

function normalizeMaterialStake(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Reject vague language: "may", "could", "might", "could impact", "may affect", etc.
  const vaguePhrases = /\b(may|might|could|may affect|could impact|potentially|possibly|might help)\b/i;
  if (vaguePhrases.test(trimmed)) {
    console.warn(`⚠️  material_stake contains vague language — nulling: "${trimmed}"`);
    return null;
  }
  return trimmed;
}

const VALID_BOUNDARY_IDS = new Set(['climate', 'biosphere', 'land', 'freshwater', 'biogeochem', 'ocean', 'novel', 'aerosol', 'ozone']);

function normalizeBoundaryIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(id => {
    if (VALID_BOUNDARY_IDS.has(id)) return true;
    console.warn(`⚠️  Unknown boundary_id "${id}" — dropping`);
    return false;
  });
}

// ------------------------------------------------------------
// NON-DECISION GATE — action_types with no external decision-maker at all
// (org fundraising copy, informational blasts, pure engagement events).
// leverage_point / strategy_text / decision_window_date should describe why
// a specific external decision is live right now — for donate/newsletter
// asks and event-only "attend" asks (a webinar has no decision-maker
// either), the model was fabricating generic mission-statement filler to
// satisfy "never return null," which read as decision-context but wasn't
// tied to anything real. Same gate as was built and proven this week for
// the (now-removed) decision-pipeline scaffold — enforced here in code
// rather than trusted to the prompt alone, matching this file's existing
// normalize-in-code pattern.
// ------------------------------------------------------------
const NON_DECISION_ACTION_TYPES = new Set(['donate', 'newsletter']);

const NON_DECISION_ATTEND_KEYWORDS = [
  'webinar', 'symposium', 'livestream', 'screening', 'briefing',
  'training', 'launch event', 'launch webinar', 'national call', 'panel discussion',
];

function isNonDecisionAsk(actionType, actionAsk, leveragePoint) {
  if (!actionType) return false;
  if (NON_DECISION_ACTION_TYPES.has(actionType)) return true;
  if (actionType === 'attend') {
    const hay = `${actionAsk || ''} ${leveragePoint || ''}`.toLowerCase();
    return NON_DECISION_ATTEND_KEYWORDS.some(kw => hay.includes(kw));
  }
  return false;
}

// ------------------------------------------------------------
// MAIN EXTRACTION FUNCTION
// ------------------------------------------------------------
async function extractAction(contentToAnalyze, sourceType = "content", context = {}) {
  const senderEmail = String(context.senderEmail || '').trim().toLowerCase();
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';
  const fromName = String(context.fromName || '').trim();
  const replyTo = String(context.replyTo || '').trim().toLowerCase();
  const replyToDomain = replyTo.includes('@') ? replyTo.split('@')[1] : '';
  const suggestedOrgFromSender = String(context.suggestedOrgFromSender || '').trim();
  const senderHints = `Sender metadata (highest-priority org signal):
- sender_email: ${senderEmail || '(unknown)'}
- sender_domain: ${senderDomain || '(unknown)'}
- from_name: ${fromName || '(unknown)'}
- reply_to: ${replyTo || '(unknown)'}
- reply_to_domain: ${replyToDomain || '(unknown)'}`;

  const prompt = `You are an expert analyst of systems change and activist campaigns, trained in the Earth4All framework for global sustainability.

Analyze the following ${sourceType} and classify it using the Earth4All framework defined below.

${E4A_FRAMEWORK}

${E4A_PARAMETERS}

${ACTION_TYPES}

${TIMING_GUIDANCE}

${PLANETARY_BOUNDARIES_GUIDANCE}

${senderHints}

Return a JSON object with EXACTLY these fields:

{
  "org_name": "Name of the organization sending this action alert",
  "action_ask": "What the user should do — written as a direct instruction starting with a verb. Example: 'Donate to support Earthjustice's legal work' not 'The user is being asked to donate'",
  "turnaround_category": "MUST be exactly one of: Energy, Food, Inequality, Poverty, Empowerment",
  "secondary_turnarounds": ["optional array of up to 2 additional turnarounds this action also affects — use same valid values or empty array"],
  "e4a_parameters": ["array of 1-3 parameter names from the 21 parameters list above that this action most directly moves — use exact names from the list"],
  "action_type": "MUST be exactly one of: petition, donate, boycott, divest, volunteer, attend, comment, contact, newsletter",
  "timing_confidence": <integer 1-10 per TIMING CONFIDENCE guidance above>,
  "decision_window_date": "ISO 8601 date string (YYYY-MM-DD) if a specific deadline, vote date, or comment period close date is explicitly mentioned for THIS ask — otherwise null. Do not reuse an org-wide date (e.g. a fiscal-year-end mentioned in a donation footer) as if it were a decision deadline for an unrelated ask.",
  "leverage_point": "A short phrase (under 12 words) naming the specific systemic pressure point this action targets. Return null if this is a donation ask, a newsletter/informational send, or a pure engagement event (webinar, symposium, livestream) — these have no external decision-maker, so there is no real pressure point to name.",
  "strategy_text": "1-2 sentences explaining why acting NOW matters and how this action connects to the Earth4All turnaround. Be specific about timing, targets, or cascade effects where visible. Return null for the same donate/newsletter/pure-engagement-event cases as leverage_point above — do not invent generic mission-statement text to fill this field.",
  "rep_targets": ["array of full names of legislators explicitly named as targets in the action ask — common name form only, e.g. 'Chuck Schumer' not 'Senator Schumer'. Empty array if none explicitly named."],
  "material_stake": "If this action has a quantified personal financial impact for the user, express it as a specific, concrete amount or percentage (e.g. '~$240/yr on your electricity bill', '0.3% of a typical pension fund', 'typical rate increase of $X/month'). Only populate if the personal stake is explicitly calculable or mentioned in the action content — otherwise return null. Never include vague hedge-text like 'may affect' or 'could impact'. If in doubt, return null.",
  "boundary_ids": ["array of 0-4 boundary ids this action directly addresses — use exact ids: climate, biosphere, land, freshwater, biogeochem, ocean, novel, aerosol, ozone. Empty array if unclear."]
}

CLASSIFICATION RULES:
- org_name: MUST be the organization that SENT this email/action alert, identified primarily by sender domain and from/reply-to headers. Do NOT choose organizations merely mentioned in the body text.
- org_name precedence: (1) sender_domain, (2) from_name/reply_to, (3) body content only if sender metadata is missing or ambiguous.
- If sender is campaigns@350.org and body mentions other groups, org_name must be "350.org".
- If sender is info@sierraclub.org and body mentions coalition partners, org_name must be "Sierra Club".
- turnaround_category: pick the PRIMARY turnaround based on the action ask itself, not background context
- secondary_turnarounds: only include if the action genuinely moves those turnarounds directly — empty array is fine
- e4a_parameters: use exact parameter names from the list provided. Prioritise Worker income share, Green tech transfer, Direct air capture when relevant — these have the highest systemic leverage
- timing_confidence: be conservative — only score 8+ if a specific date, deadline, or vote is explicitly mentioned
- rep_targets: only extract when the action explicitly asks the user to contact or pressure a named official. Common name form only. Empty array if none explicitly named — do not infer.
- leverage_point / strategy_text / decision_window_date: null is the correct, expected answer for donate, newsletter, and pure-engagement-event asks (see field descriptions above) — this is not "content unclear," it's "there is no external decision here."
- For every other field: never return null. If content is unclear, use your best inference.

Content to analyze:
${contentToAnalyze}`;

  try {
    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();

    if (!textResponse) throw new Error("Empty AI response");

    const parsed = JSON.parse(textResponse.trim());

    // Normalize all fields
    parsed.turnaround_category = normalizeTurnaround(parsed.turnaround_category);
    parsed.secondary_turnarounds = Array.isArray(parsed.secondary_turnarounds)
      ? parsed.secondary_turnarounds.map(normalizeTurnaround).filter(t => t !== parsed.turnaround_category)
      : [];
    parsed.e4a_parameters = normalizeParameters(parsed.e4a_parameters || []);
    parsed.action_type = normalizeActionType(parsed.action_type);
    parsed.timing_confidence = Number.isInteger(parsed.timing_confidence)
      ? Math.min(10, Math.max(1, parsed.timing_confidence))
      : 3;
    parsed.rep_targets = Array.isArray(parsed.rep_targets) ? parsed.rep_targets : [];
    parsed.material_stake = normalizeMaterialStake(parsed.material_stake);
    parsed.boundary_ids = normalizeBoundaryIds(parsed.boundary_ids || []);
    // Validate decision_window_date is a valid YYYY-MM-DD string or null
    if (parsed.decision_window_date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.decision_window_date)) {
      console.warn(`⚠️  Invalid decision_window_date "${parsed.decision_window_date}" — nulling`);
      parsed.decision_window_date = null;
    }

    // Enforced in code, not just prompted: donate/newsletter/pure-engagement-
    // event asks have no external decision-maker, so leverage_point/
    // strategy_text/decision_window_date get nulled regardless of what the
    // model returned — don't rely on the model to comply with the prompt.
    if (isNonDecisionAsk(parsed.action_type, parsed.action_ask, parsed.leverage_point)) {
      if (parsed.leverage_point || parsed.strategy_text || parsed.decision_window_date) {
        console.log(`ℹ️  Non-decision ask (action_type=${parsed.action_type}) — nulling leverage_point/strategy_text/decision_window_date`);
      }
      parsed.leverage_point = null;
      parsed.strategy_text = null;
      parsed.decision_window_date = null;
    }

    console.log("✅ AI extracted action:", parsed);
    return parsed;

  } catch (error) {
    console.error("❌ AI Service Error:", error.message);
    return {
      org_name: suggestedOrgFromSender || "Unknown Organization",
      action_ask: "Manual review required",
      turnaround_category: "Energy",
      secondary_turnarounds: [],
      e4a_parameters: [],
      action_type: "petition",
      timing_confidence: 1,
      decision_window_date: null,
      leverage_point: "Error during AI parsing",
      strategy_text: "Could not extract strategy. Review raw_content for context.",
      rep_targets: [],
      material_stake: null,
      boundary_ids: []
    };
  }
}

// ─── PHASE 3: PETITION-TO-REP TARGETING ANALYSIS ───
module.exports = { extractAction };