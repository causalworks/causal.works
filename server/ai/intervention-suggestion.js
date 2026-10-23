'use strict';

require('dotenv').config();
const { generate } = require('./llmClient');
const { MEADOWS_LEVELS } = require('../data/meadows-leverage');

const GENERATION_OPTS = { json: true, temperature: 0.2 };

const LEVELS_TEXT = MEADOWS_LEVELS.map(lvl =>
  `${lvl.level}. ${lvl.label} — ${lvl.description}${lvl.examples ? ' Examples: ' + lvl.examples : ''}`
).join('\n');

const TURNAROUNDS_TEXT = `
- energy — Reducing GHG emissions from energy production: electrification, renewables, efficiency, phasing out fossil fuels.
- food — Reducing the crop burden needed to feed everyone: less food waste, less red meat, regenerative agriculture.
- inequality — Redistributing wealth from owners to the working majority: progressive taxation, stronger unions, closing wage gaps.
- poverty — Accelerating development in low-income countries/regions: debt relief, trade reform, infrastructure investment.
- empowerment — Improving quality of life for women: education, healthcare, reproductive access, women in leadership.
`;

async function suggestInterventionFields({ title, description, targetContext }) {
  const prompt = `You are an expert in Donella Meadows' 12-level hierarchy of leverage points for intervening in complex systems (from "Leverage Points: Places to Intervene in a System," 1999), and in the Earth4All framework's five systemic turnarounds.

MEADOWS LEVERAGE HIERARCHY, from least leverage (12) to most leverage (1):

${LEVELS_TEXT}

EARTH4ALL TURNAROUNDS:
${TURNAROUNDS_TEXT}

A coalition member has proposed the following intervention aimed at influencing a real decision${targetContext ? ' about: ' + targetContext : ''}:

Title: ${title}
Description: ${description || '(no description given)'}

TASK 1 — Leverage level: identify which ONE of the 12 levels this intervention is actually working at RIGHT NOW, as described. Judge by what the intervention DOES — what it changes or tries to change about the system — not by how ambitious or well-intentioned it sounds. Most real-world advocacy tactics (petitions, comment campaigns, single-decision lobbying) sit at levels 12-8; tactics that change ongoing feedback loops, information access, or enforceable rules sit at levels 7-5; tactics that change who has decision-making power, what a system optimizes for, or its underlying assumptions sit at levels 4-1. Be honest and specific rather than generous — most proposed interventions are lower-leverage than their proposers assume, and that gap is the point of this tool.

Also consider TRAJECTORY: some interventions shift leverage level as they grow in scale or participation — e.g. a small pressure campaign that merely exercises an existing feedback channel (a higher-numbered level) can, at sufficient scale, force the target to adopt a new formal policy in response, which functionally rewrites a rule (a lower-numbered level). If this intervention has that kind of growth trajectory, name the level it's AT NOW as described, and note in the rationale what scale or condition would shift it to a different (typically lower-numbered, higher-leverage) level.

TASK 2 — Turnarounds: identify which of the 5 turnarounds above this intervention genuinely advances (not just touches thematically). Empty array if none clearly apply. Most interventions genuinely serve 1-2 turnarounds, not all 5 — do not select a turnaround just because the topic is adjacent to it.

TASK 3 — Effect estimate: draft a short, honest 1-2 sentence estimate of what this intervention could realistically achieve and what's uncertain about it. Do not oversell — name a specific, concrete plausible outcome AND a specific real limitation or uncertainty (e.g. no formal weight in a decision process, indirect/slow effect, depends on scale not yet reached). This is a draft for the proposer to edit, not a final claim.

Return a JSON object with exactly these fields:
{
  "suggested_level": <integer 1-12>,
  "rationale": "2-3 sentences: what this intervention changes and why that places it at this level now, plus a trajectory note per TASK 1 if applicable.",
  "suggested_turnaround_ids": ["array of 0-5 values from: energy, food, inequality, poverty, empowerment"],
  "effect_estimate": "1-2 sentence draft per TASK 3"
}`;

  const textResponse = await generate('intervention_suggest', prompt, GENERATION_OPTS);
  if (!textResponse) throw new Error('Empty AI response');

  const parsed = JSON.parse(textResponse.trim());
  const level = Number(parsed.suggested_level);
  if (!Number.isInteger(level) || level < 1 || level > 12) {
    throw new Error(`AI returned invalid suggested_level: ${parsed.suggested_level}`);
  }

  const VALID_TURNAROUNDS = new Set(['energy', 'food', 'inequality', 'poverty', 'empowerment']);
  const turnaroundIds = Array.isArray(parsed.suggested_turnaround_ids)
    ? parsed.suggested_turnaround_ids.filter(t => VALID_TURNAROUNDS.has(t))
    : [];

  return {
    suggested_level: level,
    rationale: String(parsed.rationale || '').trim(),
    suggested_turnaround_ids: turnaroundIds,
    effect_estimate: String(parsed.effect_estimate || '').trim()
  };
}

module.exports = { suggestInterventionFields };
