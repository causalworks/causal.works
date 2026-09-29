'use strict';

// Donella Meadows (1999) 12-level leverage hierarchy. Server-side mirror of
// MEADOWS_LEVELS in public/individual/js/turnarounds.js — that's the
// canonical display copy for the Individual app's Framework tab; this copy
// exists so server code (the Intervention Modeler's leverage-level AI
// suggestion, and the cooperative API's leverage_label field) has the full
// descriptions to work with, not just the bare level numbers. Keep in sync
// if the Individual app's copy changes — same duplication pattern already
// used for server/data/planetary-boundaries.js vs. the client copy.

const MEADOWS_LEVELS = [
  { level: 12, label: 'Numbers', description: 'Constants, parameters, and numerical values within a system\'s structure — tax rates, emission limits, subsidies, standards.', examples: 'Setting a carbon price at $50/tonne; adjusting a renewable energy subsidy; changing an emissions standard from 30g/km to 25g/km.' },
  { level: 11, label: 'Buffers and stocks', description: 'Physical stores that absorb shocks and provide stability — how large they are relative to what flows in and out.', examples: 'Grid-scale battery storage capacity; strategic petroleum reserves; aquifer size vs. extraction rate; forest carbon stock vs. deforestation rate.' },
  { level: 10, label: 'Material flow structure', description: 'The physical networks through which things move — infrastructure, supply chains, land use patterns.', examples: 'Whether a city\'s infrastructure is built for cars or transit; whether a grid connects centralized fossil or distributed renewable generation; land ownership concentration in agriculture.' },
  { level: 9, label: 'Delays', description: 'How long it takes a system to register and respond to its own signals — the gap between action and consequence.', examples: 'The 20–40 year delay between CO₂ emissions and their full warming effect; regulatory lag behind new technology; the gap between deforestation and regional precipitation change.' },
  { level: 8, label: 'Balancing feedbacks', description: 'Self-correcting mechanisms — how strongly and quickly a system counteracts deviations from a target state.', examples: 'Carbon pricing that tightens automatically as emissions rise; regulatory penalties that scale with harm; democratic accountability for elected officials.' },
  { level: 7, label: 'Reinforcing feedbacks', description: 'Self-amplifying cycles — how fast growth processes compound. Slowing or redirecting a runaway positive loop can be transformative.', examples: 'The feedback between wealth and political influence; the speed at which clean energy cost reductions accelerate adoption; the network effects of dominant infrastructure.' },
  { level: 6, label: 'Information flows', description: 'Who has access to what information, when — the architecture of who knows what about the system\'s state.', examples: 'Whether corporate emissions data is publicly disclosed; whether regulators have real-time access to industry data; whether affected communities know about risks before approvals.' },
  { level: 5, label: 'Rules', description: 'Formal and informal constraints, incentives, and enforceable boundaries that govern what system actors can do.', examples: 'Whether fossil fuel companies can externalize pollution costs; who has the power to approve or block infrastructure; what corporations are legally required to optimize for.' },
  { level: 4, label: 'Self-organization', description: 'A system\'s capacity to restructure itself — to adapt, evolve, innovate, and create new structures in response to changing conditions.', examples: 'Whether communities can form new governance institutions; whether a regulatory body can update its own rules from new evidence; whether a technology ecosystem can shift to radically different approaches.' },
  { level: 3, label: 'Goals', description: 'What the system is actually designed to optimize for — the purpose it serves in practice, not in theory.', examples: 'GDP growth as the primary measure of national success; shareholder returns as the legal purpose of corporations; throughput as the measure of a supply chain\'s performance.' },
  { level: 2, label: 'Paradigm', description: 'The shared assumptions, values, and beliefs from which the system\'s goals, structures, and rules emerge — what is considered real, natural, or possible.', examples: 'That nature is a resource for extraction. That economic growth and ecological health are fundamentally in tension. That individuals are primarily consumers. That the future is legitimately discountable.' },
  { level: 1, label: 'Transcending paradigms', description: 'Not a lever to pull. The capacity to hold any mental model lightly, including this one — to recognize that no paradigm is the truth, only a map.', examples: null }
];

const MEADOWS_LEVEL_LABELS = MEADOWS_LEVELS.reduce((acc, lvl) => {
  acc[lvl.level] = lvl.label;
  return acc;
}, {});

module.exports = { MEADOWS_LEVELS, MEADOWS_LEVEL_LABELS };
