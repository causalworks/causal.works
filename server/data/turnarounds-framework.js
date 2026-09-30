'use strict';

// Earth4All five turnarounds — display content for the Systems framework pages.
// Server-side mirror of TURNAROUNDS in public/individual/js/turnarounds.js (the
// Agency app's Systems page still carries its own copy). Served to the
// Cooperative app by GET /api/organizational/cooperative/systems-framework.
// Keep in sync with the Agency copy until Agency is switched to read from here.
// Boundary cross-references come from server/data/planetary-boundaries.js
// (each boundary lists its turnaround_ids), not from this file.

const TURNAROUND_FRAMEWORK = [
  {
    id: 'energy',
    title: 'Energy Transition',
    emoji: '⚡',
    description: 'Shifting from fossil-fuel-dependent energy systems to renewable infrastructure.',
    levers: [
      'Infrastructure approvals (terminals, plants, transmission lines)',
      'Energy policy and standards',
      'Grid modernization and storage',
      'Building efficiency codes'
    ],
    actions: [
      'Prevent LNG terminal approvals and pipeline expansions',
      'Support renewable energy project siting and permitting',
      'Advocate for grid infrastructure upgrades',
      'Push for building energy efficiency standards'
    ],
    why: 'Energy infrastructure built today locks in 30-year pathways. Preventing fossil infrastructure is exponentially more effective than trying to retire it later. Each major decision point—terminal approvals, utility rates, building codes—is a leverage moment.',
    framework: 'Systems operate with inertia. Once infrastructure is built, the economic and political incentives to keep it running are enormous. Prevention at decision points is structural change.',
    earth4allPolicies: [
      'Immediate redesign and phase-out of fossil-based energy systems',
      'Electrify everything: reduce consumption and optimize energy efficiency across all sectors',
      'Triple investments immediately to >$1 trillion/year in renewables, efficiency tech, and storage'
    ]
  },
  {
    id: 'food',
    title: 'Food Systems Transformation',
    emoji: '🌾',
    description: 'Transitioning from industrial monoculture to regenerative systems that restore soil and reduce methane.',
    levers: [
      'Agricultural policy and subsidies',
      'Land use zoning and protection',
      'Soil and carbon credit systems',
      'Supply chain and procurement standards'
    ],
    actions: [
      'Support agricultural subsidy reform',
      'Advocate for farmland preservation and protection',
      'Push for regenerative agriculture procurement standards',
      'Influence food supply chains in institutions'
    ],
    why: 'Food systems are structural. They involve policy, land use, capital allocation, and supply chains. Shifting them requires intervening at the policy and procurement level, not individual consumption.',
    framework: 'Industrial agriculture is locked in by policy subsidies, land use patterns, and supply infrastructure. Structural change means shifting subsidies, zoning, and sourcing—not exhorting individuals to buy organic.',
    earth4allPolicies: [
      'Ensure immediate access to food, reduce overconsumption and end wastefulness in food chains',
      'End agricultural expansion against nature; incentivize regenerative farming and healthier soils',
      'Transform to sustainable diets respecting planetary boundaries (grass-fed livestock, new proteins)'
    ]
  },
  {
    id: 'inequality',
    title: 'Inequality Reduction',
    emoji: '⚖️',
    description: 'Narrowing wealth and income gaps to enable broader political participation and stabilize systems.',
    levers: [
      'Tax policy and wealth taxation',
      'Wage floors and labor standards',
      'Access to capital and business ownership',
      'Governance structures and decision-making'
    ],
    actions: [
      'Support progressive tax reform and wealth taxation',
      'Advocate for minimum wage increases and labor protections',
      'Push for equitable lending and business access',
      'Support democratic participation and voting rights'
    ],
    why: 'Inequality reduction is not separate from energy or food transitions—it\'s prerequisite to them. Political feasibility of major structural change requires broader stake-holding and participation.',
    framework: 'Systemic change requires broad coalition. Systems with high inequality are politically fragile. Reducing inequality broadens participation capacity and makes other transitions politically possible.',
    earth4allPolicies: [
      'Increase taxes on the richest 10% until they take less than 40% of national incomes by 2030',
      'Strengthen worker\'s rights and trade unionization through law; establish citizens\' funds for wealth sharing',
      'Close international tax loopholes and end luxury carbon/biosphere consumption'
    ]
  },
  {
    id: 'poverty',
    title: 'Poverty Elimination',
    emoji: '🏠',
    description: 'Ensuring universal access to basic needs—food, healthcare, shelter, education, transport—without environmental burden.',
    levers: [
      'Universal public programs and safety nets',
      'Public infrastructure (transit, utilities, housing)',
      'Healthcare systems',
      'Education and skills access'
    ],
    actions: [
      'Support universal healthcare and public health infrastructure',
      'Advocate for public housing and transit',
      'Push for education access and skills training',
      'Support public infrastructure investment'
    ],
    why: 'Poverty elimination and environmental sustainability are interdependent. Poverty persists when basic needs aren\'t met publicly; addressing it publicly enables environmental protection.',
    framework: 'Structural change means public goods provision, not individual choice. Universal programs are more efficient and equitable than market-based solutions for basic needs.',
    earth4allPolicies: [
      'IMF to allocate over $1 trillion/year to poor countries for green jobs-creating investments',
      'High-income countries cancel all debt to low-income countries (GDP <$10k per person)',
      'WTO to allow local industry protection and provide IP rights waivers on renewable/health tech'
    ]
  },
  {
    id: 'empowerment',
    title: 'Women\'s Empowerment',
    emoji: '👩',
    description: 'Full political, economic, and social participation of women at all decision levels.',
    levers: [
      'Governance rules and representation',
      'Economic control and business ownership',
      'Political authority and decision-making',
      'Healthcare and reproductive autonomy'
    ],
    actions: [
      'Support women\'s political representation and leadership',
      'Advocate for equal pay and economic opportunity',
      'Push for reproductive autonomy and healthcare access',
      'Support women\'s decision-making authority'
    ],
    why: 'Women\'s empowerment isn\'t separate from other turnarounds—it strengthens all of them. Societies with higher gender equality show better environmental outcomes, lower fertility, more stable governance.',
    framework: 'Systemic exclusion of women from decision-making weakens all systems. Including women proportionally at all levels improves outcomes across energy, food, equality, poverty, and sustainability.',
    earth4allPolicies: [
      'All governments increase education access to all girls and women',
      'All corporations and public bodies achieve gender equality in leadership positions',
      'All governments put adequate pension systems in place for economic security'
    ]
  }
];

module.exports = { TURNAROUND_FRAMEWORK };
