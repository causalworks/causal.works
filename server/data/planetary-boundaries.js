const BOUNDARIES_SOURCE_URL = 'https://www.stockholmresilience.org/research/planetary-boundaries.html';

const PLANETARY_BOUNDARIES = [
  {
    id: 'climate',
    name: 'Climate Change',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 3,
    turnaround_ids: ['energy', 'food'],
    description: 'Human greenhouse gas emissions are destabilizing the climate system, driving accelerating warming, extreme weather, and proximity to irreversible tipping points.',
  },
  {
    id: 'biosphere',
    name: 'Biosphere Integrity',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 3,
    turnaround_ids: ['food', 'empowerment'],
    description: 'The rate of species extinction and ecosystem collapse now far exceeds natural background rates, eroding the living systems that regulate soil, water, air, and food.',
    mapping_note: "empowerment included because women's land rights and indigenous community stewardship are among the strongest documented protections for biodiversity (IPBES 2022); connection is structural governance, not direct policy.",
  },
  {
    id: 'land',
    name: 'Land-System Change',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 2,
    turnaround_ids: ['food'],
    description: 'Conversion of forests, wetlands, and grasslands to agriculture and urban use is removing the land systems that stabilize regional climates and support biodiversity.',
  },
  {
    id: 'freshwater',
    name: 'Freshwater Change',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 2,
    turnaround_ids: ['food', 'poverty'],
    description: 'Human withdrawals and flow alteration have pushed global freshwater systems beyond the limits that sustain both ecosystems and long-term human water security.',
  },
  {
    id: 'biogeochem',
    name: 'Biogeochemical Flows',
    status: 'transgressed',
    trend: 'stable',
    transgression_severity: 2,
    turnaround_ids: ['food'],
    description: 'Industrial agriculture has flooded ecosystems with nitrogen and phosphorus far beyond natural cycles, causing dead zones, biodiversity loss, and water contamination.',
  },
  {
    id: 'ocean',
    name: 'Ocean Acidification',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 1,
    turnaround_ids: ['energy', 'food'],
    description: 'CO₂ absorption is acidifying oceans at a rate that threatens marine ecosystems, particularly shellfish, coral reefs, and the food chains that depend on them.',
  },
  {
    id: 'novel',
    name: 'Novel Entities',
    status: 'transgressed',
    trend: 'worsening',
    transgression_severity: 1,
    turnaround_ids: ['inequality', 'poverty'],
    description: 'Synthetic chemicals, plastics, and other novel substances are accumulating in the Earth system faster than we can assess their effects on living organisms and ecosystems.',
    mapping_note: 'inequality and poverty included on environmental justice grounds — chemical and plastic pollution concentrates in low-income and marginalized communities; the connection is distributional (who bears the burden) rather than causal (what produces the pollution).',
  },
  {
    id: 'aerosol',
    name: 'Atmospheric Aerosols',
    status: 'safe',
    trend: 'stable',
    transgression_severity: 0,
    turnaround_ids: ['energy'],
    description: 'Atmospheric particle pollution from combustion and industry affects monsoon patterns and regional precipitation — currently within safe limits but under rising pressure.',
  },
  {
    id: 'ozone',
    name: 'Stratospheric Ozone',
    status: 'safe',
    trend: 'improving',
    transgression_severity: 0,
    turnaround_ids: ['energy', 'empowerment'],
    description: 'The stratospheric ozone layer, which shields life from ultraviolet radiation, is recovering following the Montreal Protocol — the one planetary boundary showing improvement.',
    mapping_note: 'empowerment included because UV exposure and ozone-related health impacts fall disproportionately on women and children in high-UV regions; connection is public health equity.',
  },
];

function computeBoundaryUrgencyScore(boundaryIds) {
  if (!Array.isArray(boundaryIds) || !boundaryIds.length) return 0;
  const map = Object.fromEntries(PLANETARY_BOUNDARIES.map(b => [b.id, b.transgression_severity]));
  return Math.max(0, ...boundaryIds.map(id => map[id] ?? 0));
}

module.exports = { PLANETARY_BOUNDARIES, BOUNDARIES_SOURCE_URL, computeBoundaryUrgencyScore };
