/**
 * turnarounds.js — Mindset section: three panels
 *   Panel 1: Nine boundaries, seven breached
 *   Panel 2: Five E4A turnarounds (enhanced with boundary cross-reference)
 *   Panel 3: Meadows leverage hierarchy
 */

(function () {
  'use strict';

  // ─── PLANETARY BOUNDARIES DATA ───────────────────────────────────────────────
  // Client-side copy of server/data/planetary-boundaries.js.
  // Update annually when Stockholm Resilience Centre publishes updated assessment.

  const BOUNDARIES_SOURCE_URL = 'https://www.stockholmresilience.org/research/planetary-boundaries.html';
  const EARTH4ALL_SOURCE_URL = 'https://earth4all.life/the-five-extraordinary-turnarounds/';
  const MEADOWS_SOURCE_URL = 'https://donellameadows.org/';

  const PLANETARY_BOUNDARIES_DISPLAY = [
    {
      id: 'climate', name: 'Climate Change', status: 'transgressed', trend: 'worsening',
      transgression_severity: 3, turnaround_ids: ['energy', 'food'],
      description: 'Human greenhouse gas emissions are destabilizing the climate system, driving accelerating warming, extreme weather, and proximity to irreversible tipping points.',
    },
    {
      id: 'biosphere', name: 'Biosphere Integrity', status: 'transgressed', trend: 'worsening',
      transgression_severity: 3, turnaround_ids: ['food', 'empowerment'],
      description: 'The rate of species extinction and ecosystem collapse now far exceeds natural background rates, eroding the living systems that regulate soil, water, air, and food.',
    },
    {
      id: 'land', name: 'Land-System Change', status: 'transgressed', trend: 'worsening',
      transgression_severity: 2, turnaround_ids: ['food'],
      description: 'Conversion of forests, wetlands, and grasslands to agriculture and urban use is removing the land systems that stabilize regional climates and support biodiversity.',
    },
    {
      id: 'freshwater', name: 'Freshwater Change', status: 'transgressed', trend: 'worsening',
      transgression_severity: 2, turnaround_ids: ['food', 'poverty'],
      description: 'Human withdrawals and flow alteration have pushed global freshwater systems beyond the limits that sustain both ecosystems and long-term human water security.',
    },
    {
      id: 'biogeochem', name: 'Biogeochemical Flows', status: 'transgressed', trend: 'stable',
      transgression_severity: 2, turnaround_ids: ['food'],
      description: 'Industrial agriculture has flooded ecosystems with nitrogen and phosphorus far beyond natural cycles, causing dead zones, biodiversity loss, and water contamination.',
    },
    {
      id: 'ocean', name: 'Ocean Acidification', status: 'transgressed', trend: 'worsening',
      transgression_severity: 1, turnaround_ids: ['energy', 'food'],
      description: 'CO₂ absorption is acidifying oceans at a rate that threatens marine ecosystems, particularly shellfish, coral reefs, and the food chains that depend on them.',
    },
    {
      id: 'novel', name: 'Novel Entities', status: 'transgressed', trend: 'worsening',
      transgression_severity: 1, turnaround_ids: ['inequality', 'poverty'],
      description: 'Synthetic chemicals, plastics, and other novel substances are accumulating in the Earth system faster than we can assess their effects on living organisms and ecosystems.',
    },
    {
      id: 'aerosol', name: 'Atmospheric Aerosols', status: 'safe', trend: 'stable',
      transgression_severity: 0, turnaround_ids: ['energy'],
      description: 'Atmospheric particle pollution from combustion and industry affects monsoon patterns and regional precipitation — currently within safe limits but under rising pressure.',
    },
    {
      id: 'ozone', name: 'Stratospheric Ozone', status: 'safe', trend: 'improving',
      transgression_severity: 0, turnaround_ids: ['energy', 'empowerment'],
      description: 'The stratospheric ozone layer, which shields life from ultraviolet radiation, is recovering following the Montreal Protocol — the one planetary boundary showing improvement.',
    },
  ];

  // Cross-reference: turnaround id → boundary names that it primarily addresses
  const TURNAROUND_BOUNDARIES = {};
  PLANETARY_BOUNDARIES_DISPLAY.forEach(b => {
    (b.turnaround_ids || []).forEach(tid => {
      if (!TURNAROUND_BOUNDARIES[tid]) TURNAROUND_BOUNDARIES[tid] = [];
      TURNAROUND_BOUNDARIES[tid].push(b.name);
    });
  });

  // ─── TURNAROUNDS DATA ─────────────────────────────────────────────────────────

  const TURNAROUNDS = [
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

  // ─── MEADOWS HIERARCHY DATA ───────────────────────────────────────────────────
  // 12 levels per Meadows (1999). Numbered 12 (least leverage) → 1 (most leverage).
  // Listed in this order top-to-bottom so the most powerful intervention is last.

  const MEADOWS_LEVELS = [
    {
      level: 12,
      label: 'Numbers',
      description: 'Constants, parameters, and numerical values within a system\'s structure — tax rates, emission limits, subsidies, standards.',
      examples: 'Setting a carbon price at $50/tonne; adjusting a renewable energy subsidy; changing an emissions standard from 30g/km to 25g/km.',
    },
    {
      level: 11,
      label: 'Buffers and stocks',
      description: 'Physical stores that absorb shocks and provide stability — how large they are relative to what flows in and out.',
      examples: 'Grid-scale battery storage capacity; strategic petroleum reserves; aquifer size vs. extraction rate; forest carbon stock vs. deforestation rate.',
    },
    {
      level: 10,
      label: 'Material flow structure',
      description: 'The physical networks through which things move — infrastructure, supply chains, land use patterns.',
      examples: 'Whether a city\'s infrastructure is built for cars or transit; whether a grid connects centralized fossil or distributed renewable generation; land ownership concentration in agriculture.',
    },
    {
      level: 9,
      label: 'Delays',
      description: 'How long it takes a system to register and respond to its own signals — the gap between action and consequence.',
      examples: 'The 20–40 year delay between CO₂ emissions and their full warming effect; regulatory lag behind new technology; the gap between deforestation and regional precipitation change.',
    },
    {
      level: 8,
      label: 'Balancing feedbacks',
      description: 'Self-correcting mechanisms — how strongly and quickly a system counteracts deviations from a target state.',
      examples: 'Carbon pricing that tightens automatically as emissions rise; regulatory penalties that scale with harm; democratic accountability for elected officials.',
    },
    {
      level: 7,
      label: 'Reinforcing feedbacks',
      description: 'Self-amplifying cycles — how fast growth processes compound. Slowing or redirecting a runaway positive loop can be transformative.',
      examples: 'The feedback between wealth and political influence; the speed at which clean energy cost reductions accelerate adoption; the network effects of dominant infrastructure.',
    },
    {
      level: 6,
      label: 'Information flows',
      description: 'Who has access to what information, when — the architecture of who knows what about the system\'s state.',
      examples: 'Whether corporate emissions data is publicly disclosed; whether regulators have real-time access to industry data; whether affected communities know about risks before approvals.',
    },
    {
      level: 5,
      label: 'Rules',
      description: 'Formal and informal constraints, incentives, and enforceable boundaries that govern what system actors can do.',
      examples: 'Whether fossil fuel companies can externalize pollution costs; who has the power to approve or block infrastructure; what corporations are legally required to optimize for.',
    },
    {
      level: 4,
      label: 'Self-organization',
      description: 'A system\'s capacity to restructure itself — to adapt, evolve, innovate, and create new structures in response to changing conditions.',
      examples: 'Whether communities can form new governance institutions; whether a regulatory body can update its own rules from new evidence; whether a technology ecosystem can shift to radically different approaches.',
    },
    {
      level: 3,
      label: 'Goals',
      description: 'What the system is actually designed to optimize for — the purpose it serves in practice, not in theory.',
      examples: 'GDP growth as the primary measure of national success; shareholder returns as the legal purpose of corporations; throughput as the measure of a supply chain\'s performance.',
    },
    {
      level: 2,
      label: 'Paradigm',
      description: 'The shared assumptions, values, and beliefs from which the system\'s goals, structures, and rules emerge — what is considered real, natural, or possible.',
      examples: 'That nature is a resource for extraction. That economic growth and ecological health are fundamentally in tension. That individuals are primarily consumers. That the future is legitimately discountable.',
      note: 'Most of the platform\'s purpose operates here — not adding pressure to an existing system but helping users see the system differently and act from that new understanding.',
    },
    {
      level: 1,
      label: 'Transcending paradigms',
      description: 'Not a lever to pull. The capacity to hold any mental model lightly, including this one — to recognize that no paradigm is the truth, only a map.',
      note: 'Historically, the most durable systemic change has come from people who could operate from this place — not because they had no beliefs, but because they held them loosely enough to act from whatever the situation required. Less a lever than a condition some people arrive at.',
    },
  ];

  // ─── ENTRY POINT ─────────────────────────────────────────────────────────────

  function loadTurnaroundsData() {
    loadBoundariesPanel();
    loadTurnaroundCards();
    loadMeadowsPanel();
  }

  // ─── FRAMEWORK TAB SWITCHING ──────────────────────────────────────────────────

  function switchFrameworkTab(tab) {
    ['overview', 'boundaries', 'turnarounds', 'meadows'].forEach(t => {
      const panel = document.getElementById('framework-tab-' + t);
      const btn = document.getElementById('framework-tab-btn-' + t);
      if (panel) panel.style.display = (t === tab) ? '' : 'none';
      if (btn) btn.classList.toggle('active', t === tab);
    });
  }

  // ─── PANEL 1: NINE BOUNDARIES ─────────────────────────────────────────────────

  function loadBoundariesPanel() {
    const el = document.getElementById('boundaries-panel');
    if (!el) return;

    let html = '<div style="margin-bottom:24px;">';
    html += '<h2 style="font-size:20px; font-weight:700; color:var(--text-primary); margin:0 0 8px;">Nine boundaries, seven breached</h2>';
    html += '<p style="font-size:11px; color:var(--text-tertiary, var(--text-secondary)); margin:0 0 12px; max-width:640px;">';
    html += 'Source: <a href="' + BOUNDARIES_SOURCE_URL + '" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:underline; font-weight:600;">Stockholm Resilience Centre</a> / Potsdam Institute Planetary Health Check, 2023. Updated annually in September.';
    html += '</p>';
    html += '<p style="font-size:14px; color:var(--text-secondary); line-height:1.6; margin:0 0 24px; max-width:640px;">';
    html += 'The Earth system is regulated by nine measurable processes — from climate to biodiversity to freshwater to ocean chemistry. ';
    html += 'Scientists at the Potsdam Institute and Stockholm Resilience Centre have identified safe limits for each one. ';
    html += 'As of 2025, seven of the nine have been crossed. This is not a prediction. It is a current measurement.';
    html += '</p>';
    html += '</div>';

    html += '<div style="display:flex; flex-direction:column; gap:6px; max-width:700px;">';

    PLANETARY_BOUNDARIES_DISPLAY.forEach(b => {
      const isTransgressed = b.status === 'transgressed';
      const dotColor = isTransgressed ? 'var(--error, #d32f2f)' : 'var(--success, #388e3c)';
      const statusLabel = isTransgressed ? 'transgressed' : 'safe';
      const trendArrow = b.trend === 'worsening' ? ' ↑' : b.trend === 'improving' ? ' ↓' : '';

      html += '<div class="turnaround-summary-card" id="boundary-card-' + b.id + '" style="padding:0;">';
      html += '<button type="button" onclick="toggleBoundaryDetail(\'' + b.id + '\', event)" style="background:none; border:none; padding:12px 14px; cursor:pointer; width:100%; text-align:left; display:flex; align-items:center; gap:12px;">';
      html += '<span style="flex-shrink:0; width:10px; height:10px; border-radius:50%; background:' + dotColor + '; display:inline-block;"></span>';
      html += '<span style="flex:1; font-size:13px; font-weight:600; color:var(--text-primary);">' + b.name + '</span>';
      html += '<span style="font-size:11px; font-weight:500; color:' + dotColor + ';">' + statusLabel + trendArrow + '</span>';
      html += '<span class="turnaround-chevron" style="font-size:12px; color:var(--accent);">▾</span>';
      html += '</button>';
      html += '<div id="boundary-detail-' + b.id + '" style="display:none; padding:0 14px 14px 36px;">';
      html += '<div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">' + b.description + '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';

    el.innerHTML = html;
  }

  // ─── PANEL 2: TURNAROUND CARDS ───────────────────────────────────────────────

  function loadTurnaroundCards() {
    const grid = document.getElementById('turnarounds-cards-grid');
    if (!grid) return;

    grid.innerHTML = TURNAROUNDS.map((t) => {
      const boundaryNames = TURNAROUND_BOUNDARIES[t.id] || [];
      const boundarySection = boundaryNames.length > 0
        ? `<div class="turnaround-section">
            <h4 class="turnaround-section-title">Planetary Boundaries Addressed</h4>
            <ul class="turnaround-list">
              ${boundaryNames.map(n => `<li>${n}</li>`).join('')}
            </ul>
          </div>`
        : '';

      return `
      <div class="turnaround-summary-card" id="turnaround-card-${t.id}" style="padding:0;">
        <button type="button" onclick="toggleTurnaroundDetail('${t.id}', event)" style="background:none; border:none; padding:12px 14px; cursor:pointer; width:100%; text-align:left; display:flex; align-items:center; gap:12px;">
          <span style="flex-shrink:0; font-size:18px; line-height:1;">${t.emoji}</span>
          <span style="flex:1;">
            <span style="font-size:13px; font-weight:600; color:var(--text-primary); display:block;">${t.title}</span>
            <span style="font-size:12px; color:var(--text-secondary); display:block; margin-top:2px;">${t.description}</span>
          </span>
          <span class="turnaround-chevron" style="font-size:12px; color:var(--accent); transition:transform 0.2s; flex-shrink:0;">▾</span>
        </button>
        <div id="turnaround-detail-${t.id}" class="turnaround-detail-panel" style="display:none; padding:0 14px 14px 42px;">
          <p style="font-size:12px; margin:0 0 12px;"><a href="${EARTH4ALL_SOURCE_URL}" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:underline; font-weight:600;">Learn more: Earth4All →</a></p>
          <div class="turnaround-section">
            <h4 class="turnaround-section-title">Structural Levers</h4>
            <ul class="turnaround-list">
              ${t.levers.map(l => `<li>${l}</li>`).join('')}
            </ul>
          </div>
          <div class="turnaround-section">
            <h4 class="turnaround-section-title">Civic Actions</h4>
            <ul class="turnaround-list">
              ${t.actions.map(a => `<li>${a}</li>`).join('')}
            </ul>
          </div>
          <div class="turnaround-section">
            <h4 class="turnaround-section-title">Earth4All System Change Policies</h4>
            <ul class="turnaround-list">
              ${t.earth4allPolicies.map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
          ${boundarySection}
          <div class="turnaround-insight">
            <div class="turnaround-insight-title">Why This Matters</div>
            <p>${t.why}</p>
          </div>
        </div>
      </div>
    `;
    }).join('');
  }

  // ─── PANEL 3: MEADOWS HIERARCHY ──────────────────────────────────────────────

  function loadMeadowsPanel() {
    const el = document.getElementById('meadows-panel');
    if (!el) return;

    let html = '<div style="margin-bottom:24px;">';
    html += '<h2 style="font-size:20px; font-weight:700; color:var(--text-primary); margin:0 0 8px;">Where to intervene</h2>';
    html += '<p style="font-size:11px; color:var(--text-tertiary, var(--text-secondary)); margin:0 0 12px; max-width:640px;">';
    html += 'Hierarchy adapted from <a href="' + MEADOWS_SOURCE_URL + '" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:underline; font-weight:600;">Donella Meadows</a>, <em>Thinking in Systems</em> (2008). Examples are illustrative.';
    html += '</p>';
    html += '<p style="font-size:14px; color:var(--text-secondary); line-height:1.6; margin:0 0 8px; max-width:640px;">';
    html += 'Meadows identified a hierarchy of intervention points in complex systems. ';
    html += 'Changing a system\'s rules or feedback loops matters more than changing its outputs. ';
    html += 'Changing what a system is designed to optimize matters more than changing its rules. ';
    html += 'Changing the fundamental assumptions a system is built on — the paradigm — matters most of all.';
    html += '</p>';
    html += '<p style="font-size:14px; color:var(--text-secondary); line-height:1.6; margin:0 0 24px; max-width:640px;">';
    html += 'Actions are ranked partly by where in this hierarchy they intervene. ';
    html += 'Preventing an LNG terminal approval matters more than reducing individual energy consumption — not because one is virtuous and the other isn\'t, but because one happens before 30 years of infrastructure is locked in and the other happens after. ';
    html += 'Timing and structural position are the variables.';
    html += '</p>';
    html += '</div>';

    html += '<div style="display:flex; flex-direction:column; gap:2px; max-width:700px;">';

    const maxLevel = 12;
    MEADOWS_LEVELS.forEach((lvl) => {
      const isHighest = lvl.level === 1;
      // Level 1 = most leverage = full opacity; level 12 = least = 0.4 opacity
      const levelOpacity = 1 - ((lvl.level - 1) / (maxLevel - 1)) * 0.6;
      const borderLeft = isHighest
        ? '3px solid var(--accent)'
        : '3px solid var(--border)';
      const bg = isHighest ? 'var(--bg-secondary)' : 'transparent';
      const detailDisplay = isHighest ? 'block' : 'none';

      html += '<div style="border-left:' + borderLeft + '; border-radius:0 4px 4px 0; margin-bottom:2px; background:' + bg + ';">';
      html += '<button type="button" onclick="toggleMeadowsDetail(' + lvl.level + ', event)" style="background:none; border:none; padding:12px 14px; cursor:pointer; width:100%; text-align:left; display:flex; gap:12px; align-items:center;">';
      html += '<span style="flex-shrink:0; font-size:11px; font-weight:700; color:var(--text-secondary); opacity:' + levelOpacity + '; width:14px; text-align:right;">' + lvl.level + '</span>';
      html += '<span style="flex:1; font-size:13px; font-weight:600; color:var(--text-primary);">' + lvl.label + '</span>';
      html += '<span class="turnaround-chevron" style="font-size:12px; color:var(--accent);">▾</span>';
      html += '</button>';
      html += '<div id="meadows-detail-' + lvl.level + '" style="display:' + detailDisplay + '; padding:0 14px 12px 40px;">';
      html += '<div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">' + lvl.description + '</div>';
      if (lvl.examples) {
        html += '<div style="font-size:11px; color:var(--text-secondary); opacity:0.7; margin-top:4px; line-height:1.4; font-style:italic;">' + lvl.examples + '</div>';
      }
      if (lvl.note) {
        html += '<div style="font-size:12px; color:var(--text-primary); margin-top:8px; padding:10px 12px; background:var(--bg-primary, #fff); border-radius:4px; line-height:1.6;">' + lvl.note + '</div>';
      }
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';

    el.innerHTML = html;
  }

  // ─── EXPORTS ─────────────────────────────────────────────────────────────────

  window.loadTurnaroundsData = loadTurnaroundsData;
  window.switchFrameworkTab = switchFrameworkTab;

  // Shared accordion behavior: opening one row's detail closes every other
  // detail row sharing the same id prefix, within any of the three Framework panels.
  function toggleDetailExclusive(prefix, id, event) {
    if (event) event.preventDefault();
    const targetId = prefix + '-detail-' + id;
    document.querySelectorAll('[id^="' + prefix + '-detail-"]').forEach((elx) => {
      if (elx.id !== targetId && elx.style.display !== 'none') {
        elx.style.display = 'none';
        const chev = elx.previousElementSibling && elx.previousElementSibling.querySelector('.turnaround-chevron');
        if (chev) chev.style.transform = '';
      }
    });
    const detail = document.getElementById(targetId);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    const chev = detail.previousElementSibling && detail.previousElementSibling.querySelector('.turnaround-chevron');
    if (chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
  }

  window.toggleBoundaryDetail = function(id, event) {
    toggleDetailExclusive('boundary', id, event);
  };

  window.toggleMeadowsDetail = function(level, event) {
    toggleDetailExclusive('meadows', level, event);
  };

  window.toggleTurnaroundDetail = function(id, event) {
    toggleDetailExclusive('turnaround', id, event);
  };
})();
