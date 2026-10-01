/**
 * moves.js — Moves feed, reps, events, volunteering, ledger
 * Rebuilt for individual/index.html design system
 */

// ─── PLANETARY BOUNDARY LABELS (mirrors server/data/planetary-boundaries.js) ───
const BOUNDARY_NAMES = {
  climate: 'Climate Change', biosphere: 'Biosphere Integrity', land: 'Land-System Change',
  freshwater: 'Freshwater Change', biogeochem: 'Biogeochemical Flows', ocean: 'Ocean Acidification',
  novel: 'Novel Entities', aerosol: 'Atmospheric Aerosols', ozone: 'Stratospheric Ozone',
};
const BOUNDARY_STATUS = {
  climate: 'transgressed', biosphere: 'transgressed', land: 'transgressed',
  freshwater: 'transgressed', biogeochem: 'transgressed', ocean: 'transgressed',
  novel: 'transgressed', aerosol: 'safe', ozone: 'safe',
};

// ─── E4A TURNAROUND LABELS ───
const TURNAROUND_DISPLAY = {
  'Energy': 'Energy Transition',
  'Food': 'Food Systems',
  'Inequality': 'Inequality Reduction',
  'Poverty': 'Poverty Elimination',
  'Empowerment': 'Empowerment',
};

// ─── COMMITTEE → TURNAROUND MAPPING (explicit, multi-valued) ───
// Authored against committees-current.json. Update when committees change.
const COMMITTEE_TURNAROUNDS = {
  // ENERGY
  'House Committee on Energy and Commerce': ['Energy'],
  'House Committee on Natural Resources': ['Energy'],
  'House Committee on Science, Space, and Technology': ['Energy'],
  'House Committee on Transportation and Infrastructure': ['Energy'],
  'Senate Committee on Energy and Natural Resources': ['Energy'],
  'Senate Committee on Environment and Public Works': ['Energy'],
  'Senate Committee on Commerce, Science, and Transportation': ['Energy'],

  // FOOD
  'House Committee on Agriculture': ['Food'],
  'Senate Committee on Agriculture, Nutrition, and Forestry': ['Food', 'Poverty'], // SNAP/nutrition sits here

  // INEQUALITY
  'House Committee on Ways and Means': ['Inequality'],
  'House Committee on Financial Services': ['Inequality'],
  'House Committee on Education and Workforce': ['Inequality', 'Empowerment'],
  'Senate Committee on Finance': ['Inequality'],
  'Senate Committee on Banking, Housing, and Urban Affairs': ['Inequality'],
  'Senate Committee on Health, Education, Labor, and Pensions': ['Inequality', 'Empowerment'],
  'Joint Committee on Taxation': ['Inequality'],
  'Joint Economic Committee': ['Inequality'],

  // POVERTY
  'House Committee on Foreign Affairs': ['Poverty'],
  'Senate Committee on Foreign Relations': ['Poverty'],

  // EMPOWERMENT
  'House Committee on the Judiciary': ['Empowerment'],
  'Senate Committee on the Judiciary': ['Empowerment'],

  // CROSS-CUTTING (touches all five turnarounds)
  'House Committee on Appropriations': ['Energy', 'Food', 'Inequality', 'Poverty', 'Empowerment'],
  'Senate Committee on Appropriations': ['Energy', 'Food', 'Inequality', 'Poverty', 'Empowerment'],
  'House Committee on the Budget': ['Inequality'],
  'Senate Committee on the Budget': ['Inequality'],

  // FINANCIAL REPRESENTATIVE COMMITTEES (fund managers, pension boards)
  'Investment Committee': ['Inequality'],
  'Proxy Voting Committee': ['Inequality', 'Energy'],
  'ESG Oversight': ['Energy', 'Inequality', 'Empowerment'],
  'Stewardship Committee': ['Inequality', 'Energy'],
  'Governance & Risk': ['Inequality'],
  'Stewardship & ESG': ['Energy', 'Inequality', 'Empowerment'],
  'Risk Oversight': ['Inequality'],
  'Pension & Health Benefits Committee': ['Inequality', 'Empowerment'],
  'Governance Committee': ['Inequality'],
  'Board of Trustees': ['Inequality'],

  // Committees deliberately not mapped (low E4A relevance, shown under "Other assignments"):
  // Armed Services, Ethics, Homeland Security, House Administration, Oversight, Rules,
  // Small Business, Veterans' Affairs, Indian Affairs, Aging, Intelligence, select committees.
};

// ─── LEVERAGE POINT COPY ───
const TURNAROUND_LEVERAGE_LINES = {
  'Energy': 'Controls energy policy, fossil fuel subsidies, and the regulatory framework for the clean transition.',
  'Food': 'Sets agricultural subsidies, land-use rules, and food safety standards that shape how the country grows food.',
  'Inequality': 'Shapes tax law, labor protections, and budget allocations that determine how income and wealth are distributed.',
  'Poverty': 'Oversees foreign aid, trade agreements, and international development funding that affect growth in low-income countries.',
  'Empowerment': 'Legislates health access, education funding, and civil rights protections that determine opportunity and population outcomes.',
};

// ─── STATE & INITIALIZATION ───
let activeAction = null;
let expandedMovesActionId = null;
let movesActionSnapshot = {};
let proxiesRepsLoaded = false;
let movesFeedAutoRefreshBound = false;
let movesFeedAutoRefreshTimer = null;

// ─── LEDGER & DONATIONS STATE ───
let movesOrgNameById = {};
let movesDonationOrgId = null;
let contribSuggestions = [];
let contribSelectedMatch = null;
let contribSearchTimer = null;

const MOVES_COPY_OPENED_IDS_KEY = 'causal_petition_copy_opened_ids';
const MOVES_ADDRESS_EXPLAINER_SEEN_KEY = 'causal_address_explainer_seen';

// ─── MOVES UNIFIED FEED STATE ───
let movesFullActions = []; // Canonical array of all full "sign" action objects from /api/actions
let movesUnifiedItems = []; // Normalized { id, kind, source, deadline, raw } items across sign/attend/volunteer/vest/notify
let movesCurrentTab = 'vest'; // Assets is first/default, matching the tab order in the DOM
let vestCurrentAssetTab = 'banks'; // Assets' own Banks/Investments/Pension sub-tab, Banks first/default
let movesSignContextMap = new Map(); // action.id -> { tier, matchedReps } — "Targeting: <rep>" enrichment
let movesLocalFeedMeta = {}; // { no_location, international } from /api/local/feed, for empty-state messaging
let movesPledgeReminders = []; // /api/user/pledge-reminders — feeds the Banks card's "promise comes due" alert banners

const MOVES_VEST_SNOOZE_KEY = 'causal_vest_snoozed_until';
const MOVES_VEST_SNOOZE_DAYS = 14;

// ─── ELECTEDS TIER STATE ───
let allRepsData = []; // All reps fetched from API
let repsContactActionsMap = {}; // Map of rep id (string) -> actions the user picked to contact them about

// ─── HELPERS: UNFINISHED TRACKING ───

function movesUnfinishedSet(actionId) {
  const id = String(actionId);
  try {
    const m = movesUnfinishedGetMap();
    m[id] = 1;
    localStorage.setItem(MOVES_COPY_OPENED_IDS_KEY, JSON.stringify(m));
  } catch (_) {}
}

function movesUnfinishedClear(actionId) {
  const id = String(actionId);
  try {
    const m = movesUnfinishedGetMap();
    if (!m[id]) return;
    delete m[id];
    localStorage.setItem(MOVES_COPY_OPENED_IDS_KEY, JSON.stringify(m));
  } catch (_) {}
}

function scrollMovesExpandedRowIntoView(row) {
  if (!row || typeof row.scrollIntoView !== 'function') return;
  requestAnimationFrame(function () {
    row.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ─── HELPER: HTML ESCAPING ───
function escapeCardHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ─── HELPER: DOMAIN EXTRACTION ───
function domainForActionLogo(action) {
  try {
    const url = action.source_url || action.source || '';
    if (!url) return null;
    const u = new URL(url);
    const hostname = u.hostname || '';
    if (!hostname) return null;

    // Extract last two parts of hostname (registrable domain)
    const parts = hostname.split('.');
    const domain = parts.slice(-2).join('.');

    // Reject obviously non-organizational domains (redirect services, etc.)
    const rejectList = ['rs6.net', 'cc.net', 'exacttarget.com'];
    if (rejectList.includes(domain)) return null;

    return domain;
  } catch (_) {
    return null;
  }
}

// ─── HELPER: ORG LOGO HTML ───
// Logo.dev doesn't have (or serves a broken) logo for some orgs — this override
// map points those domains at a local file instead. Shared by causalOrgLogoHtml
// (moves.js) and getGiveOrgLogoHtml (money.js) so every logo slot stays in sync.
const CAUSAL_ORG_LOGO_OVERRIDES = {
  'avaaz.org': '/shared/assets/orgs/avaaz.png',
  '350.org': '/shared/assets/orgs/350.png',
  'eko.org': '/shared/assets/orgs/eko.webp',
};

function causalOrgLogoHtml(domain, fallbackText, size) {
  size = Number(size) || 18;

  // Generate colored background and initials (for fallback)
  const colorKey = domain || fallbackText || '';
  const hue = (colorKey.charCodeAt(0) * 137.508) % 360;
  const bgColor = 'hsl(' + hue + ', 65%, 75%)';

  const initials = (fallbackText || domain || '')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  // If no domain, just show initials fallback
  if (!domain) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:4px;background:' + bgColor + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:' + Math.max(8, Math.floor(size * 0.4)) + 'px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.1);">' + escapeCardHtml(initials) + '</div>';
  }

  // Local override takes priority over Logo.dev; falls back to initials on error either way.
  const logoUrl = CAUSAL_ORG_LOGO_OVERRIDES[domain] || ('https://img.logo.dev/' + escapeCardHtml(domain) + '?token=pk_DhE0fV1ASEK_16pwkKkprQ&size=200');
  const pad = Math.max(2, Math.floor(size * 0.1));

  return '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:4px;background:#f3f4f6;border:1px solid rgba(0,0,0,0.08);overflow:hidden;">' +
    '<img src="' + logoUrl + '" alt="" style="width:calc(100% - ' + (pad*2) + 'px);height:calc(100% - ' + (pad*2) + 'px);margin:' + pad + 'px;object-fit:contain;display:block;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
    '<div style="width:100%;height:100%;background:' + bgColor + ';display:none;align-items:center;justify-content:center;font-size:' + Math.max(8, Math.floor(size * 0.4)) + 'px;font-weight:700;color:#fff;position:absolute;top:0;left:0;text-shadow:0 1px 2px rgba(0,0,0,0.1);">' + escapeCardHtml(initials) + '</div>' +
    '</div>';
}

// ─── ADVOCACY FEED: TIMING BADGE ───
// Only genuinely time-sensitive states (closing soon / closed) get a text
// badge; everything else — no deadline, or a deadline still 8+ days out —
// renders nothing here. No expand chevron anymore — every card in this
// family already opens on click and its hover state is prompt enough.
function timingBadgeForAction(action) {
  const window_date = action.decision_window_date;
  if (!window_date) return { html: '', state: 'individual-timing-open' };

  const now = new Date();
  const date = new Date(window_date);
  const daysLeft = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    const html = '<span class="individual-timing-badge individual-timing-closed">Closed</span>';
    return { html, state: 'individual-timing-closed', daysLeft };
  }
  if (daysLeft <= 3) {
    const label = daysLeft === 1 ? 'Last day' : 'Last ' + daysLeft + ' days';
    const html = '<span class="individual-timing-badge individual-timing-urgent">' + escapeCardHtml(label) + '</span>';
    return { html, state: 'individual-timing-urgent', daysLeft };
  }
  if (daysLeft <= 7) {
    const label = Math.ceil(daysLeft) + ' days left';
    const html = '<span class="individual-timing-badge individual-timing-amber">' + escapeCardHtml(label) + '</span>';
    return { html, state: 'individual-timing-amber', daysLeft };
  }

  return { html: '', state: 'individual-timing-open', daysLeft };
}

// ─── ADVOCACY FEED: RIGHT SLOT HTML ───
// Prefers the human-written timing_display ("Closes Aug 17" / "Active window")
// over the generic day-count label when the action has one — same urgency
// coloring, clearer wording. This is also where "Do Now" used to render;
// that badge was retired since everything posted is meant to be actioned, so
// the timing state owns this slot outright now instead of being a fallback.
function movesPetitionRowRightHtml(action) {
  if (isPetitionActionUnfinished(action)) {
    const idEsc = String(action.id).replace(/'/g, "\\'");
    return '<button type="button" class="app-btn" onclick="event.stopPropagation();openMovesRowToPostopenFromBtn(\'' + idEsc + '\')">Finish this?</button>';
  }
  const timing = timingBadgeForAction(action);
  if (action.timing_display) {
    return '<span class="individual-timing-badge ' + timing.state + '">' + escapeCardHtml(action.timing_display) + '</span>';
  }
  return timing.html || '';
}

// ─── ADVOCACY FEED: CHECK IF UNFINISHED ───
function movesUnfinishedGetMap() {
  try {
    const raw = localStorage.getItem(MOVES_COPY_OPENED_IDS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function isPetitionActionUnfinished(action) {
  if (!action.source_url) return false;
  if (action.completed_at || action.dismissed_at) return false;
  const map = movesUnfinishedGetMap();
  const opened = !!(action.opened_at && String(action.opened_at).trim()) || !!map[String(action.id)];
  return opened;
}

// ─── ADVOCACY FEED: UNIFIED CARD RENDERER ───

// renderActionCard(action, context)
// context = { tier, matchedReps, reason_line } — or empty {} for All/Closing soon
function renderActionCard(action, context) {
  context = context || {};
  const tier = context.tier;
  const matchedReps = context.matchedReps || [];

  // Store snapshot for "Finish this?" tracking
  movesActionSnapshot[action.id] = {
    org_name: action.org_name || '',
    action_ask: action.action_ask || '',
    source_url: action.source_url || '',
    opened_at: action.opened_at || '',
  };

  const deadlinePassed = action.decision_window_date && new Date(action.decision_window_date) < new Date();

  const row = document.createElement('div');
  row.className = 'individual-card individual-action-row';
  row.dataset.actionId = action.id;
  if (deadlinePassed) row.style.opacity = '0.55';

  const header = document.createElement('div');
  header.className = 'individual-action-row-header';
  header.style.cursor = 'pointer';

  // Logo wrap
  const logoWrap = document.createElement('div');
  const domain = domainForActionLogo(action);
  logoWrap.innerHTML = causalOrgLogoHtml(domain, action.org_name, 32);

  // Body: title, org, reason, timing
  const body = document.createElement('div');
  body.style.cssText = 'flex:1; min-width:0;';

  // Org name now leads, bold/larger, right next to the logo — the kind badge
  // that used to sit here moved down into the boundary-tags row (far right).
  const orgNameEl = document.createElement('div');
  orgNameEl.className = 'individual-hint individual-action-org-name';
  orgNameEl.style.cssText = 'font-weight:700; font-size:15px; color:var(--text-primary); margin-bottom:2px;';
  orgNameEl.textContent = action.org_name || '(Organization)';
  body.appendChild(orgNameEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'individual-action-row-title';
  titleEl.style.cssText = 'font-weight:500; font-size:14px; color:var(--text-primary); margin-bottom:4px;';
  titleEl.textContent = action.action_ask || '(Action)';
  body.appendChild(titleEl);

  // Reason line — conditional on tier
  if (tier !== undefined) {
    const reasonEl = document.createElement('div');
    if (tier === 1 && matchedReps.length > 0) {
      reasonEl.style.cssText = 'font-size:12px; color:var(--text-primary); margin-top:4px; font-weight:500; color:var(--brand);';
      reasonEl.textContent = '✓ This action names your representative' + (matchedReps.length > 1 ? 's' : '');
    } else if (tier === 2 && action.reason_line) {
      reasonEl.style.cssText = 'font-size:12px; color:var(--text-secondary); margin-top:4px; font-style:italic;';
      reasonEl.textContent = action.reason_line;
    }
    if (reasonEl.textContent) {
      body.appendChild(reasonEl);
    }
  }

  // Right slot: timing badge — "Closes <date>"/"Active window" (action.timing_display)
  // when available, else the day-count badge, else nothing. This is also where
  // "Do Now" used to render; that badge was retired since everything posted is
  // meant to be actioned, so timing owns this slot outright now.
  const rightSlot = document.createElement('div');
  rightSlot.style.cssText = 'flex-shrink:0; text-align:right;';
  const rightHtml = movesPetitionRowRightHtml(action);
  if (rightHtml) {
    rightSlot.innerHTML = rightHtml;
  }

  header.appendChild(logoWrap);
  header.appendChild(body);
  if (rightSlot.innerHTML || rightSlot.childNodes.length > 0) {
    header.appendChild(rightSlot);
  }

  row.appendChild(header);

  // Planetary boundary tags (at-a-glance; full names + "currently transgressed"
  // detail still live in the expand panel below) + the Sign kind badge share
  // one full-width row below the header, badge pinned flush to the far right —
  // moved down from above the title so it lines up with the boundary tags.
  const tagsRow = document.createElement('div');
  tagsRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px;';
  if (Array.isArray(action.boundary_ids) && action.boundary_ids.length > 0) {
    action.boundary_ids.slice(0, 3).forEach(id => {
      const label = BOUNDARY_NAMES[id] || id;
      const dotColor = BOUNDARY_STATUS[id] === 'transgressed' ? 'var(--error, #d32f2f)' : 'var(--success, #388e3c)';
      const chip = document.createElement('span');
      chip.className = 'individual-timing-badge';
      chip.style.cssText = 'text-transform:none; letter-spacing:normal; font-weight:500;';
      chip.innerHTML = '<span class="individual-turnaround-dot" style="background:' + dotColor + ';"></span>' + escapeCardHtml(label);
      tagsRow.appendChild(chip);
    });
    if (action.boundary_ids.length > 3) {
      const more = document.createElement('span');
      more.className = 'individual-hint';
      more.style.cssText = 'font-size:11px; margin:0;';
      more.textContent = '+' + (action.boundary_ids.length - 3) + ' more';
      tagsRow.appendChild(more);
    }
  }
  const kindBadge = document.createElement('span');
  kindBadge.className = 'moves-kind-badge moves-kind-badge--sign';
  kindBadge.style.cssText = 'margin-left:auto;';
  kindBadge.textContent = 'Sign';
  tagsRow.appendChild(kindBadge);
  row.appendChild(tagsRow);

  // Rep contacts — conditional on tier and matchedReps
  if (tier !== undefined && matchedReps.length > 0) {
    const repContactsDiv = document.createElement('div');
    repContactsDiv.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:12px;';

    matchedReps.forEach(rep => {
      const repLine = document.createElement('div');
      repLine.style.cssText = 'font-size:11px; margin-top:4px;';

      const repNameSpan = document.createElement('span');
      repNameSpan.textContent = rep.name + ': ';
      repLine.appendChild(repNameSpan);

      if (rep.phone) {
        const callLink = document.createElement('a');
        callLink.href = 'tel:' + rep.phone;
        callLink.className = 'app-btn app-btn-small';
        callLink.style.cssText = 'font-size:11px; padding:3px 6px; text-decoration:none;';
        callLink.innerHTML = '📞 Call';
        repLine.appendChild(callLink);
      }

      repContactsDiv.appendChild(repLine);
    });

    row.appendChild(repContactsDiv);
  }

  // Expand slot — always present, hidden
  const expand = document.createElement('div');
  expand.className = 'individual-action-expand';
  expand.hidden = true;
  expand.style.cssText = 'padding:10px 0; border-top:1px solid var(--border); margin-top:12px;';
  row.appendChild(expand);

  // Wire click on header
  header.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    toggleMovesActionRowExpand(row, action);
  });

  return row;
}

// renderActionList(actions, container, contextMap)
// contextMap is a Map from action.id → { tier, matchedReps, reason_line }
function renderActionList(actions, container, contextMap) {
  container.innerHTML = '';
  const visibleActions = Array.isArray(actions) ? actions : [];

  if (!visibleActions.length) {
    container.innerHTML = '<div class="individual-empty">No open actions. Check back for new asks.</div>';
    return;
  }

  movesActionSnapshot = {};
  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

  visibleActions.forEach(action => {
    const context = contextMap.get(action.id) || {};
    const card = renderActionCard(action, context);
    list.appendChild(card);
  });

  container.appendChild(list);
}

// ─── ADVOCACY FEED: OPEN FROM "FINISH THIS?" BUTTON ───
async function openMovesRowToPostopenFromBtn(actionId) {
  const id = String(actionId);
  const row = document.querySelector('.individual-action-row[data-action-id="' + id + '"]');
  if (!row) return;
  const snap = movesActionSnapshot[id] || {};
  const expand = row.querySelector('.individual-action-expand');
  if (!expand) return;

  collapseMovesActionRow();
  expandedMovesActionId = id;
  row.classList.add('is-expanded');
  expand.hidden = false;
  expand.innerHTML = '<div style="padding:12px; color:var(--text-secondary);">Loading…</div>';

  let detail = null;
  try {
    const r = await fetch('/api/actions/' + id, { credentials: 'same-origin' });
    if (r.ok) detail = await r.json();
  } catch (_) {}

  const listAction = {
    id: Number(id),
    org_name: (detail && detail.org_name) || snap.org_name || '',
    action_ask: (detail && detail.action_ask) || snap.action_ask || '',
    source_url: (detail && detail.source_url) || snap.source_url || '',
    source: detail && detail.source,
    action_type: detail && detail.action_type,
    turnaround_category: detail && detail.turnaround_category,
    secondary_turnarounds: detail && detail.secondary_turnarounds,
    leverage_point: detail && detail.leverage_point,
    strategy_text: detail && detail.strategy_text,
    e4a_parameters: detail && detail.e4a_parameters,
    timing_display: detail && detail.timing_display,
    timing_confidence: detail && detail.timing_confidence,
    decision_window_date: detail && detail.decision_window_date,
    do_now: detail && detail.do_now,
    opened_at: (detail && detail.opened_at) || snap.opened_at || new Date().toISOString(),
    completed_at: detail && detail.completed_at,
    dismissed_at: detail && detail.dismissed_at,
    donation_url: (detail && detail.donation_url) || snap.donation_url,
    org_id: (detail && detail.org_id) || snap.org_id,
    boundary_ids: detail && detail.boundary_ids,
  };
  movesUnfinishedSet(id);
  fillMovesActionExpandPanel(expand, listAction, detail || { actors_count: 0 });
  scrollMovesExpandedRowIntoView(row);
}

// ─── ADVOCACY FEED: TOGGLE EXPAND ───
async function toggleMovesActionRowExpand(row, action) {
  const id = String(action.id);
  const expand = row.querySelector('.individual-action-expand');
  if (!expand) return;

  if (row.classList.contains('is-expanded')) {
    collapseMovesActionRow();
    return;
  }

  collapseMovesActionRow();
  expandedMovesActionId = id;
  row.classList.add('is-expanded');
  expand.hidden = false;
  expand.innerHTML = '<div style="padding:12px; color:var(--text-secondary);">Loading…</div>';

  try {
    const r = await fetch('/api/actions/' + id, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('detail');
    const detail = await r.json();
    fillMovesActionExpandPanel(expand, action, detail);
  } catch (_) {
    fillMovesActionExpandPanel(expand, action, { ...action });
  }
}

function collapseMovesActionRow() {
  const expanded = document.querySelector('.individual-action-row.is-expanded');
  if (expanded) {
    expanded.classList.remove('is-expanded');
    const expand = expanded.querySelector('.individual-action-expand');
    if (expand) expand.hidden = true;
  }
  expandedMovesActionId = null;
}

// ─── ADVOCACY FEED: FILL EXPAND PANEL ───
function fillMovesActionExpandPanel(expandEl, action, detail) {
  activeAction = { ...action, ...detail };
  const merged = activeAction;
  const id = String(merged.id);
  const hasUrl = !!(merged.source_url && String(merged.source_url).trim());
  const isDone = !!(merged.completed_at || merged.dismissed_at);

  let html = '';

  // Leverage point (new information, not on collapsed card)
  if (merged.leverage_point) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:16px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Why it matters</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(merged.leverage_point) + '</div>';
    html += '</div>';
  }

  // Strategy text (context and how to approach)
  if (merged.strategy_text) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:16px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Strategy</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(merged.strategy_text) + '</div>';
    html += '</div>';
  }

  // Material stake (personal financial impact, if any)
  if (merged.material_stake) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:16px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Your stake</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(merged.material_stake) + '</div>';
    html += '</div>';
  }

  // Planetary boundaries (expanded card only)
  if (Array.isArray(merged.boundary_ids) && merged.boundary_ids.length > 0) {
    const items = merged.boundary_ids.map(id => {
      const label = BOUNDARY_NAMES[id] || id;
      const s = BOUNDARY_STATUS[id];
      return escapeCardHtml(label) + (s === 'transgressed' ? ' — currently transgressed' : '');
    }).join(', ');
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:16px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Planetary boundary</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + items;
    html += ' — <a href="#turnarounds/boundaries" style="color:var(--accent);">see System</a></div>';
    html += '</div>';
  }

  // Source link
  if (hasUrl) {
    html += '<a href="' + escapeCardHtml(merged.source_url) + '" target="_blank" rel="noopener" class="app-btn app-btn-outline" style="display:inline-block; font-size:12px; margin-bottom:16px; text-decoration:none;">View source →</a>';
  }

  // Buttons
  html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';

  if (!isDone && hasUrl) {
    html += '<button type="button" class="app-btn moves-copy-open-btn" data-action-id="' + escapeCardHtml(id) + '">Copy address & open</button>';
  }

  html += '<button type="button" class="app-btn moves-mark-done-btn" data-action-id="' + escapeCardHtml(id) + '">Mark done</button>';
  html += '<button type="button" class="app-btn app-btn-outline moves-dismiss-btn" data-action-id="' + escapeCardHtml(id) + '">Not this time</button>';
  html += '<button type="button" class="app-btn app-btn-outline moves-contact-rep-btn" data-action-id="' + escapeCardHtml(id) + '">Contact your rep</button>';

  html += '</div>';

  expandEl.innerHTML = html;

  const contactRepBtn = expandEl.querySelector('.moves-contact-rep-btn');
  if (contactRepBtn) {
    contactRepBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openContactRepPicker(id);
    });
  }

  // Attach event listeners to buttons
  const copyBtn = expandEl.querySelector('.moves-copy-open-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      movesCopyOpenLaunch(id);
    });
  }

  const doneBtn = expandEl.querySelector('.moves-mark-done-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      markDoneFromCard(id);
    });
  }

  const dismissBtn = expandEl.querySelector('.moves-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dismissCard(id);
    });
  }
}

// ─── MOVES HOME: LOAD DASHBOARD DATA ───
async function loadMovesHomeData() {
  try {
    const [actionsRes, orgsRes, momentumRes, sinceVisitRes] = await Promise.all([
      fetch('/api/actions', { credentials: 'same-origin' }),
      fetch('/api/user/supported-orgs-this-year', { credentials: 'same-origin' }),
      fetch('/api/user/collective-momentum', { credentials: 'same-origin' }).catch(() => null),
      fetch('/api/user/since-last-visit', { credentials: 'same-origin' }).catch(() => null),
    ]);

    const sinceVisitEl = document.getElementById('moves-since-last-visit');
    if (sinceVisitEl) {
      const sinceVisit = sinceVisitRes && sinceVisitRes.ok ? await sinceVisitRes.json().catch(() => null) : null;
      if (sinceVisit && sinceVisit.has_previous_visit) {
        const parts = [];
        if (sinceVisit.signatures_count > 0) parts.push(sinceVisit.signatures_count + ' signature' + (sinceVisit.signatures_count === 1 ? '' : 's'));
        if (sinceVisit.pledges_count > 0) parts.push(sinceVisit.pledges_count + ' bank pledge' + (sinceVisit.pledges_count === 1 ? '' : 's'));
        if (sinceVisit.new_decisions_count > 0) parts.push(sinceVisit.new_decisions_count + ' new decision' + (sinceVisit.new_decisions_count === 1 ? '' : 's') + ' near you');
        if (parts.length) {
          sinceVisitEl.innerHTML = '<div class="individual-card" style="margin-bottom:16px;">' +
            '<div class="individual-hint" style="margin-bottom:2px;">Welcome back</div>' +
            '<div style="font-size:14px; font-weight:500; color:var(--text-primary);">Since your last visit: ' + escapeCardHtml(parts.join(', ')) + '</div>' +
            '</div>';
          sinceVisitEl.style.display = 'block';
        } else {
          sinceVisitEl.style.display = 'none';
        }
      } else {
        sinceVisitEl.style.display = 'none';
      }
    }
    const actions = actionsRes.ok ? await actionsRes.json() : [];
    const pendingCount = Array.isArray(actions) ? actions.length : 0;

    const orgsData = orgsRes.ok ? await orgsRes.json() : [];
    const orgCount = Array.isArray(orgsData) ? orgsData.length : 0;

    const momentum = momentumRes && momentumRes.ok ? await momentumRes.json() : {};
    const othersOnYourActions = Number(momentum.others_on_your_actions) || 0;
    const activeThisWeek = Number(momentum.active_people_7d) || 0;

    const pendingEl = document.getElementById('moves-home-pending');
    const orgsEl = document.getElementById('moves-home-orgs');
    const othersEl = document.getElementById('moves-home-others');
    const activeWeekEl = document.getElementById('moves-home-active-week');
    const dateEl = document.getElementById('individual-home-date');

    if (pendingEl) pendingEl.textContent = String(pendingCount);
    if (orgsEl) orgsEl.textContent = String(orgCount);
    if (othersEl) othersEl.textContent = String(othersOnYourActions);
    if (activeWeekEl) activeWeekEl.textContent = String(activeThisWeek);

    if (dateEl) {
      const now = new Date();
      dateEl.dateTime = now.toISOString();
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    loadHomeNudges(pendingCount);
  } catch (e) {
    console.error('loadMovesHomeData', e);
  }
}

async function loadHomeNudges(pendingCount) {
  const el = document.getElementById('home-nudges');
  if (!el) return;

  const [bankRes, orgsRes] = await Promise.all([
    fetch('/api/user/bank-segments', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/give/orgs', { credentials: 'same-origin' }).catch(() => null),
  ]);

  const banks = bankRes && bankRes.ok ? await bankRes.json() : [];
  const orgs = orgsRes && orgsRes.ok ? await orgsRes.json() : [];

  const nudges = [];

  if (!Array.isArray(banks) || !banks.length) {
    nudges.push({ text: 'Add your bank to see your divestment position', href: '#proxies/financial' });
  }

  if (!Array.isArray(orgs) || !orgs.length) {
    nudges.push({ text: 'Follow an organization to get their actions here', href: '#proxies/advocates' });
  } else {
    const totalGiven = orgs.reduce((sum, o) => sum + (Number(o.given_cents_year) || 0), 0);
    if (totalGiven === 0) {
      nudges.push({ text: "You haven't logged any giving yet", href: '#ledger' });
    }
  }

  const shown = nudges.slice(0, 2);
  if (!shown.length) { el.innerHTML = ''; return; }

  let html = '<div class="home-nudges-block">';
  shown.forEach(n => {
    html += '<div class="home-nudge-row">';
    html += '<span class="home-nudge-text">' + escapeHtml(n.text) + '</span>';
    html += '<a class="home-nudge-link" href="' + escapeHtml(n.href) + '">→</a>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ─── MOVES UNIFIED FEED: LOAD ───
// Merges petitions (sign), local events + attend-type asks (attend), and
// volunteer opportunities + volunteer-type asks (volunteer) into one normalized
// array, then renders via the active tab. Giving lives on Proxies > Advocates
// now, not a Moves tab.
const MOVES_VEST_REMINDER_LEAD_DAYS = 14;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadMovesFeed() {
  const container = document.getElementById('moves-feed-list');
  if (!container) return;
  container.innerHTML = [1, 2, 3].map(() =>
    '<div class="individual-card individual-skeleton" style="height:64px; margin-bottom:12px;"></div>'
  ).join('');

  const [actionsRes, localRes, volunteerRes, repsRes, pledgeRemindersRes, giveRes] = await Promise.all([
    fetch('/api/actions', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/local/feed', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/volunteer/opportunities', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/reps', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/user/pledge-reminders', { credentials: 'same-origin' }).catch(() => null),
    fetch('/api/give/actions', { credentials: 'same-origin' }).catch(() => null),
  ]);

  const actions = actionsRes && actionsRes.ok ? await actionsRes.json().catch(() => []) : [];
  movesFullActions = Array.isArray(actions) ? actions : [];

  const localData = localRes && localRes.ok ? await localRes.json().catch(() => ({})) : {};
  movesLocalFeedMeta = { no_location: !!localData.no_location, international: !!localData.international };
  const events = Array.isArray(localData.events) ? localData.events : [];

  const opportunities = volunteerRes && volunteerRes.ok ? await volunteerRes.json().catch(() => []) : [];

  const userReps = repsRes && repsRes.ok ? await repsRes.json().catch(() => []) : [];
  movesSignContextMap = computeSignContextMap(movesFullActions, Array.isArray(userReps) ? userReps : []);

  // Flagged-bank status now comes solely from fetchBankStatusData()/api/bank/check
  // (money.js), shown inline in the Bank Status card — this used to also be
  // computed here from a second endpoint (/api/home/bank-pledge-summary) for the
  // old separate "X is flagged" banner, which could disagree with the status card
  // for banks flagged without a bocc_2024 figure (see the 2026-08 consolidation
  // note on buildBankStatusCardHtml). One source of truth now.
  movesPledgeReminders = pledgeRemindersRes && pledgeRemindersRes.ok ? await pledgeRemindersRes.json().catch(() => []) : [];

  movesUnifiedItems = [];

  // /api/actions mixes real petitions with organizer asks of several other
  // action_types. Route each to the tab it actually belongs on: petitions to
  // Sign, attend-type asks to Attend (alongside local events), volunteer-type
  // asks to Volunteer (alongside curated opportunities). Whatever's left
  // (boycott/comment/contact) has no dedicated tab yet, so it falls back to
  // the 'notify' kind under Sign — but still gets its own badge text per
  // action_type (see NOTIFY_BADGE_LABELS below) rather than a generic 'Update'.
  //
  // Federal Register / EIP Oil & Gas Watch permitting notices route to the
  // Comments tab instead of Sign/Attend — filtered on the action's DB
  // `source`, covering both action_type: 'comment' and EIP's action_type:
  // 'attend' (Public Meeting) rows. The latter were originally left under
  // the Attend tab (reasoning: they weren't the "comment" cards the first
  // pass of this spec named), but they aren't meaningfully "local" the way
  // real Mobilize civic events are, so they move here too. This is filtered
  // on `source`, not `action_type` alone: real org campaigns also produce
  // action_type: 'comment' asks via the inbound-email pipeline (confirmed
  // live: 14 causal-sourced + 5 user-sourced rows exist today) — those stay
  // under Sign's notify path, since sweeping them into a tab framed as
  // "this is an early, unfinished platform feature" would misrepresent real
  // org content.
  const ACTION_TYPE_TO_KIND = { petition: 'sign', attend: 'attend', volunteer: 'volunteer' };
  const PERMITTING_PIPELINE_SOURCES = new Set(['federal_register', 'eip_oil_gas_watch']);
  movesFullActions.forEach((a) => {
    const isPermittingSourced = PERMITTING_PIPELINE_SOURCES.has(a.source);
    const kind = isPermittingSourced ? 'comments' : (ACTION_TYPE_TO_KIND[a.action_type] || 'notify');
    movesUnifiedItems.push({
      id: kind + '-act-' + a.id,
      kind,
      source: 'action',
      deadline: a.decision_window_date ? new Date(a.decision_window_date) : null,
      raw: a,
    });
  });
  // Donation asks are served by /api/give/actions (feature_target 'purse'), not /api/actions.
  const giveActions = giveRes && giveRes.ok ? await giveRes.json().catch(() => []) : [];
  (Array.isArray(giveActions) ? giveActions : []).forEach((a) => {
    movesUnifiedItems.push({ id: 'give-act-' + a.id, kind: 'give', source: 'action', deadline: null, raw: a });
  });
  events.forEach((ev, i) => movesUnifiedItems.push(buildAttendEventItem(ev, i)));
  opportunities.forEach((opp, i) => {
    movesUnifiedItems.push({
      id: 'volunteer-opp-' + (opp.id || i),
      kind: 'volunteer',
      source: 'opportunity',
      deadline: null,
      raw: opp,
    });
  });
  // Vest: flagged-bank prompt (while unresolved) + dated-pledge "comes due" reminders
  // render as alert banners inside the Banks card itself, not a separate feed card —
  // see renderVestBankAlerts.
  renderVestBankAlerts();
  updateVestSectionMeta();

  applyMovesTab(movesCurrentTab || 'vest');
}

// Build tier-1 "names your rep" context for sign items (renderActionCard reads {tier, matchedReps})
function computeSignContextMap(actions, userReps) {
  const map = new Map();
  if (!Array.isArray(userReps) || !userReps.length) return map;
  actions.forEach((action) => {
    if (!action.rep_targets || !action.rep_targets.length) return;
    const matchedReps = [];
    action.rep_targets.forEach((targetName) => {
      const matchedRep = matchesUserRep(targetName, userReps);
      if (matchedRep) matchedReps.push({ ...matchedRep, targetName });
    });
    if (matchedReps.length > 0) {
      map.set(action.id, { tier: 1, matchedReps });
    }
  });
  return map;
}

const MOVES_TAB_KIND_ORDER = { attend: 0, sign: 1, volunteer: 2, give: 3, notify: 4, comments: 5 };

// Sort dated items first (soonest first, sign items tie-broken by timing_confidence/do_now),
// then undated items after, grouped by kind order (attend → sign → volunteer → notify → comments).
function sortMovesItems(items) {
  return items.slice().sort((a, b) => {
    const aDated = !!a.deadline;
    const bDated = !!b.deadline;
    if (aDated && !bDated) return -1;
    if (!aDated && bDated) return 1;
    if (aDated && bDated) {
      const diff = a.deadline.getTime() - b.deadline.getTime();
      if (diff !== 0) return diff;
      const aConf = (a.raw && a.raw.timing_confidence) || 0;
      const bConf = (b.raw && b.raw.timing_confidence) || 0;
      if (aConf !== bConf) return bConf - aConf;
      if (a.raw && a.raw.do_now && !(b.raw && b.raw.do_now)) return -1;
      if (!(a.raw && a.raw.do_now) && b.raw && b.raw.do_now) return 1;
      return 0;
    }
    return MOVES_TAB_KIND_ORDER[a.kind] - MOVES_TAB_KIND_ORDER[b.kind];
  });
}

// ─── VEST: SNOOZE (not silence) ───
function vestCardKey(item) {
  return 'reminder-' + (item.raw.kind || '') + '-' + (item.raw.institution_key || '');
}

function movesVestSnoozeGetMap() {
  try {
    const raw = localStorage.getItem(MOVES_VEST_SNOOZE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function movesVestSnoozeIsActive(cardKey) {
  const until = movesVestSnoozeGetMap()[cardKey];
  return !!until && new Date(until).getTime() > Date.now();
}

function snoozeVestCard(cardKey) {
  try {
    const m = movesVestSnoozeGetMap();
    m[cardKey] = new Date(Date.now() + MOVES_VEST_SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(MOVES_VEST_SNOOZE_KEY, JSON.stringify(m));
  } catch (_) {}
  renderVestBankAlerts();
}
window.snoozeVestCard = snoozeVestCard;

function applyMovesTab(tab) {
  movesCurrentTab = tab;
  document.querySelectorAll('#moves-tab-bar .proxies-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const attendSearchEl = document.getElementById('moves-attend-search');
  if (attendSearchEl) attendSearchEl.style.display = tab === 'attend' ? 'block' : 'none';

  // Consolidated Banks/Investments/Pension funds sections — everything that used to
  // live under Proxies → Financial now lives here, closed by default.
  const vestSectionsEl = document.getElementById('moves-vest-sections');
  if (vestSectionsEl) {
    vestSectionsEl.style.display = tab === 'vest' ? 'block' : 'none';
    if (tab === 'vest') renderVestTab();
  }

  if (tab === 'vest') {
    // Vest's content lives entirely in the Banks/Investments/Pension accordion above
    // now (including the flagged-bank/pledge-reminder alerts, folded into Banks) —
    // no separate feed-card list for this tab.
    const container = document.getElementById('moves-feed-list');
    const emptyState = document.getElementById('moves-feed-empty-state');
    if (container) container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  let items;
  if (tab === 'attend') {
    items = movesUnifiedItems.filter((i) => i.kind === 'attend');
  } else if (tab === 'sign') {
    items = movesUnifiedItems.filter((i) => i.kind === 'sign' || i.kind === 'notify');
  } else if (tab === 'volunteer') {
    items = movesUnifiedItems.filter((i) => i.kind === 'volunteer');
  } else if (tab === 'give') {
    items = movesUnifiedItems.filter((i) => i.kind === 'give');
  } else if (tab === 'comments') {
    items = movesUnifiedItems.filter((i) => i.kind === 'comments');
  } else {
    items = movesUnifiedItems.slice();
  }

  renderMovesFeed(sortMovesItems(items), tab);
}
window.applyMovesTab = applyMovesTab;

// ─── ATTEND: manual zip search (separate from the profile-location feed) ───
// Lets a user check a different zip than their saved location — traveling,
// or a large city where a few digits changes what Mobilize returns. Only
// replaces the Mobilize-sourced ('event') attend items; any real /api/actions
// row with action_type: 'attend' is untouched by this.
function buildAttendEventItem(ev, i) {
  return {
    id: 'attend-evt-' + (ev.id || i),
    kind: 'attend',
    source: 'event',
    deadline: ev.start_date ? new Date(ev.start_date * 1000) : null,
    raw: ev,
  };
}

async function searchAttendEvents() {
  const input = document.getElementById('moves-attend-search-zip');
  const radiusSelect = document.getElementById('moves-attend-search-radius');
  const statusEl = document.getElementById('moves-attend-search-status');
  const resetBtn = document.getElementById('moves-attend-search-reset');
  const zip = input ? input.value.trim() : '';
  const radius = radiusSelect ? radiusSelect.value : '25';
  if (!/^\d{5}$/.test(zip)) {
    if (statusEl) statusEl.textContent = 'Enter a 5-digit zip code.';
    return;
  }
  if (statusEl) statusEl.textContent = 'Searching…';

  const res = await fetch('/api/local/feed?zip=' + encodeURIComponent(zip) + '&radius=' + encodeURIComponent(radius), { credentials: 'same-origin' }).catch(() => null);
  const data = res && res.ok ? await res.json().catch(() => null) : null;
  if (!data) {
    if (statusEl) statusEl.textContent = 'Search failed — try again.';
    return;
  }

  const newEvents = Array.isArray(data.events) ? data.events : [];
  movesUnifiedItems = movesUnifiedItems.filter((i) => !(i.kind === 'attend' && i.source === 'event'));
  newEvents.forEach((ev, i) => movesUnifiedItems.push(buildAttendEventItem(ev, i)));

  if (statusEl) {
    statusEl.textContent = newEvents.length
      ? 'Showing events within ' + radius + ' mi of ' + zip + '.'
      : 'No events found within ' + radius + ' mi of ' + zip + '.';
  }
  if (resetBtn) resetBtn.style.display = 'inline-flex';

  if (movesCurrentTab === 'attend') applyMovesTab('attend');
}
window.searchAttendEvents = searchAttendEvents;

function resetAttendSearch() {
  const input = document.getElementById('moves-attend-search-zip');
  const radiusSelect = document.getElementById('moves-attend-search-radius');
  const statusEl = document.getElementById('moves-attend-search-status');
  const resetBtn = document.getElementById('moves-attend-search-reset');
  if (input) input.value = '';
  if (radiusSelect) radiusSelect.value = '25';
  if (statusEl) statusEl.textContent = '';
  if (resetBtn) resetBtn.style.display = 'none';
  loadMovesFeed();
}
window.resetAttendSearch = resetAttendSearch;

// ─── VEST TAB: consolidated sections (Banks / Investments / Pension funds / Actions taken) ───
// Everything that used to live under Proxies → Financial now lives here, in
// independently-collapsible sections so it isn't a wall of noise on first look.
const _vestSectionLoaded = {};

// All three sections start closed (see index.html) — each shows a one-line status
// in its header via updateVestSectionMeta so nothing important is hidden just
// because it isn't expanded yet. Called every time the Vest tab activates, so the
// summary line stays fresh even if nothing was ever expanded.
async function renderVestTab() {
  updateVestSectionMeta();
  switchVestAssetTab(vestCurrentAssetTab || 'banks');
}

// Banks / Investments / Pension funds — a horizontal sub-tab sequence, one asset
// type shown at a time (same pattern as switchProxiesTab), replacing the old
// accordion (2026-09-28) so Assets reads as "pick a type, see its content" instead
// of a wall of stacked, independently-collapsible sections.
const VEST_ASSET_TABS = ['banks', 'invest', 'pension'];
function switchVestAssetTab(tab) {
  vestCurrentAssetTab = tab;
  document.querySelectorAll('#vest-asset-tab-bar .proxies-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.vestAssetTab === tab);
  });
  VEST_ASSET_TABS.forEach((t) => {
    const pane = document.getElementById('vest-pane-' + t);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
  });

  if (!_vestSectionLoaded[tab]) {
    _vestSectionLoaded[tab] = true;
    if (tab === 'banks' && typeof loadVestBanksSection === 'function') loadVestBanksSection();
    else if (tab === 'invest' && typeof loadInvestTab === 'function') loadInvestTab(document.getElementById('vest-invest-content'));
    else if (tab === 'pension' && typeof loadFinancialReps === 'function') loadFinancialReps();
  }
}
window.switchVestAssetTab = switchVestAssetTab;

// At-a-glance summary next to the Pension funds sub-tab label — populated regardless
// of which sub-tab is active so switching away never hides its status. Banks and
// Investments dropped their own tab-label summaries (2026-08) — the specific bank
// name/flag reads as an alert sitting in the nav-adjacent tab rather than useful
// context, and it duplicated the Bank Status card just below.
async function updateVestSectionMeta() {
  const pensionMetaEl = document.getElementById('vest-asset-tab-pension-meta');
  if (pensionMetaEl) {
    try {
      await ensureRepsDataLoaded();
      const reps = getRepsByTier('financial');
      pensionMetaEl.textContent = reps.length ? reps.length + ' added' : 'None added yet';
    } catch (_) {
      pensionMetaEl.textContent = '';
    }
  }
}

// Badge text for 'notify' items, keyed by the underlying action_type — so a
// boycott ask reads "Boycott" and a rep-contact ask reads "Contact" instead of
// both showing the same generic "Update" badge. Anything unmapped (or a
// future action_type) still falls back to 'Update' rather than showing blank.
const NOTIFY_BADGE_LABELS = { boycott: 'Boycott', contact: 'Contact', comment: 'Comment' };

// Above the card list on the Comments tab only — same "individual-hint" intro-copy
// pattern used elsewhere (e.g. money.js's bank-alternatives intro), not a new class.
const MOVES_GIVE_TAB_INTRO =
  'Donation asks from the organizations you follow. When you give, log it in Ledger → Giving so it ' +
  'counts toward your history.';

const MOVES_COMMENTS_TAB_INTRO =
  'These are regulatory and permitting notices identified as high-leverage ' +
  "decisions — new infrastructure projects, before they're locked in. This feed is early: " +
  "right now it's a list of comment periods, but the goal is to connect each one directly " +
  'to the elected officials and financial institutions with real influence over the decision, ' +
  'rather than leaving it as a standalone comment ask. Submitting a comment here is still real ' +
  'and still counts — this framing will get sharper over time.';

function renderMovesFeed(items, tab) {
  const container = document.getElementById('moves-feed-list');
  const emptyState = document.getElementById('moves-feed-empty-state');
  if (!container) return;

  if (!items.length) {
    if (tab === 'volunteer') {
      if (emptyState) emptyState.style.display = 'none';
      container.innerHTML = '';
      prependVolunteerSuggestButton(container);
      appendVolunteerPlatformUtility(container);
      return;
    }
    showMovesFeedEmpty(movesFeedEmptyMessageForTab(tab));
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  container.innerHTML = '';
  movesActionSnapshot = {};

  if (tab === 'volunteer') {
    prependVolunteerSuggestButton(container);
  }

  if (tab === 'give') {
    const intro = document.createElement('div');
    intro.className = 'individual-hint';
    intro.style.cssText = 'margin-bottom:16px;';
    intro.textContent = MOVES_GIVE_TAB_INTRO;
    container.appendChild(intro);
  }

  if (tab === 'comments') {
    const intro = document.createElement('div');
    intro.className = 'individual-hint';
    intro.style.cssText = 'margin-bottom:16px;';
    intro.textContent = MOVES_COMMENTS_TAB_INTRO;
    container.appendChild(intro);
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

  items.forEach((item) => {
    let card = null;
    if (item.kind === 'sign') {
      card = renderActionCard(item.raw, movesSignContextMap.get(item.raw.id) || {});
    } else if (item.kind === 'attend') {
      card = item.source === 'event' ? renderAttendEventCard(item) : renderActionUpdateCard(item.raw, 'attend', 'Attend');
    } else if (item.kind === 'volunteer') {
      card = item.source === 'opportunity' ? renderVolunteerCard(item) : renderActionUpdateCard(item.raw, 'volunteer', 'Volunteer');
    } else if (item.kind === 'give') {
      card = renderActionUpdateCard(item.raw, 'notify', 'Donate', true); // Give cards: tag only, no timing badge
    } else if (item.kind === 'notify') {
      card = renderActionUpdateCard(item.raw, 'notify', NOTIFY_BADGE_LABELS[item.raw.action_type] || 'Update');
    } else if (item.kind === 'comments') {
      // Reuses the 'notify' badge/card styling as-is (no new CSS) — just a
      // different badge label and a different tab. Covers both comment-ask
      // and EIP's attend-type (Public Meeting) rows — see the comments-kind
      // filter above.
      card = renderActionUpdateCard(item.raw, 'notify', item.raw.action_type === 'attend' ? 'Attend' : 'Comment');
    }
    if (card) list.appendChild(card);
  });

  container.appendChild(list);

  if (tab === 'volunteer') {
    appendVolunteerPlatformUtility(container);
  }
}

// "+ Suggest" moved to the top of the Volunteer tab (above the card list and
// the "Find volunteer opportunities" search-options block below) — it's the
// action most worth surfacing first, not something to bury under everything else.
function prependVolunteerSuggestButton(container) {
  const suggestRow = document.createElement('div');
  suggestRow.style.cssText = 'margin-bottom:16px;';
  suggestRow.innerHTML = '<button type="button" class="volunteer-submit-btn" onclick="openVolunteerSubmitModal()">+ Suggest an opportunity or local action</button>';
  container.appendChild(suggestRow);
}

function appendVolunteerPlatformUtility(container) {
  const utility = document.createElement('div');
  utility.style.cssText = 'margin-top:24px; padding-top:24px; border-top:1px solid var(--border);';
  utility.innerHTML = '<div class="volunteer-opportunities-heading">Find volunteer opportunities</div>' +
    '<div id="volunteer-platform-links"></div>';
  container.appendChild(utility);
  if (typeof renderVolunteerPlatformLinks === 'function') renderVolunteerPlatformLinks();
}

function movesFeedEmptyMessageForTab(tab) {
  if (tab === 'attend') {
    if (movesLocalFeedMeta.no_location) return 'Set your location in Settings to see nearby events.';
    if (movesLocalFeedMeta.international) return 'Event finder is US-focused. Check local resources in your area.';
    return 'No events near you right now.';
  }
  if (tab === 'sign') return 'No open actions. Check back for new asks.';
  if (tab === 'volunteer') return 'No volunteer opportunities near you right now.';
  if (tab === 'comments') return 'No open comment periods right now. Check back for new notices.';
  if (tab === 'give') return 'No donation asks from your organizations right now.';
  return 'No moves match this filter.';
}

function showMovesFeedEmpty(message) {
  const container = document.getElementById('moves-feed-list');
  const emptyState = document.getElementById('moves-feed-empty-state');
  if (container) container.innerHTML = '';
  if (emptyState) {
    emptyState.innerHTML = '<p>' + message + '</p>';
    emptyState.style.display = 'block';
  }
}

// ─── MOVES FEED: SHARED CARD SHELL ───
// One template for every kind: org name + title in the header, timing in the
// header's right slot, boundary tags + kind badge sharing one full-width row
// below the header (badge pinned flush right). Matches renderActionCard's
// (Sign-kind) layout so every Moves tab reads the same way.
// orgNameTop: bold/larger, next to the logo. bottomRowHtml: the full-width
// boundary-tags-and-badge row — see boundaryTagsWithBadgeRowHtml below.
function renderMovesFeedCard({ kind, badgeLabel, title, metaLine, timingHtml, actionsHtml, className, logoHtml, orgNameTop, bottomRowHtml }) {
  const card = document.createElement('div');
  card.className = 'individual-card moves-feed-card' + (className ? ' ' + className : '');
  const badge = badgeLabel ? '<span class="moves-kind-badge moves-kind-badge--' + kind + '">' + escapeCardHtml(badgeLabel) + '</span>' : '';
  card.innerHTML =
    '<div class="moves-feed-card-header">' +
      (logoHtml || '') +
      '<div style="min-width:0; flex:1;">' +
        (orgNameTop ? '<div class="individual-hint" style="font-weight:700; font-size:15px; color:var(--text-primary); margin-bottom:2px;">' + escapeCardHtml(orgNameTop) + '</div>' : '') +
        (badge ? '<div style="margin-bottom:4px;">' + badge + '</div>' : '') +
        '<div class="moves-feed-card-title">' + escapeCardHtml(title) + '</div>' +
        (metaLine ? '<div class="individual-hint moves-feed-card-meta">' + metaLine + '</div>' : '') +
      '</div>' +
      (timingHtml ? '<div style="flex-shrink:0;">' + timingHtml + '</div>' : '') +
    '</div>' +
    (bottomRowHtml || '') +
    (actionsHtml ? '<div class="moves-feed-card-actions">' + actionsHtml + '</div>' : '');
  return card;
}

// Boundary chips + kind badge share one full-width row below the header,
// chips on the left, kind badge pinned to the far right — matches the row
// renderActionCard builds for Sign-kind cards below its own header.
function boundaryTagsWithBadgeRowHtml(boundaryIds, kind, badgeLabel) {
  let inner = '';
  if (Array.isArray(boundaryIds) && boundaryIds.length > 0) {
    boundaryIds.slice(0, 3).forEach((id) => {
      const label = BOUNDARY_NAMES[id] || id;
      const dotColor = BOUNDARY_STATUS[id] === 'transgressed' ? 'var(--error, #d32f2f)' : 'var(--success, #388e3c)';
      inner += '<span class="individual-timing-badge" style="text-transform:none; letter-spacing:normal; font-weight:500;">' +
        '<span class="individual-turnaround-dot" style="background:' + dotColor + ';"></span>' + escapeCardHtml(label) + '</span>';
    });
    if (boundaryIds.length > 3) {
      inner += '<span class="individual-hint" style="font-size:11px; margin:0;">+' + (boundaryIds.length - 3) + ' more</span>';
    }
  }
  inner += '<span class="moves-kind-badge moves-kind-badge--' + kind + '" style="margin-left:auto;">' + escapeCardHtml(badgeLabel) + '</span>';
  return '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px;">' + inner + '</div>';
}

// Attend-tab equivalent of boundaryTagsWithBadgeRowHtml — the static "Attend"
// kind badge is replaced with a "Did you attend?" Yes/No control (plus a
// Learn more link, since that no longer has a dedicated slot once the header's
// right slot is reserved for timing). Used by both real Mobilize event cards
// and organizer attend-type asks, so both card types on this tab feed Ledger
// the same way. Buttons carry no data/identity of their own — callers wire
// their own click listeners via .moves-attend-yes-btn/.moves-attend-no-btn
// after building the card, since the right handler differs per card type
// (existing Mark-done/dismiss endpoints for asks; a new endpoint for events).
function attendResponseRowHtml(boundaryIds) {
  let inner = '';
  if (Array.isArray(boundaryIds) && boundaryIds.length > 0) {
    boundaryIds.slice(0, 3).forEach((id) => {
      const label = BOUNDARY_NAMES[id] || id;
      const dotColor = BOUNDARY_STATUS[id] === 'transgressed' ? 'var(--error, #d32f2f)' : 'var(--success, #388e3c)';
      inner += '<span class="individual-timing-badge" style="text-transform:none; letter-spacing:normal; font-weight:500;">' +
        '<span class="individual-turnaround-dot" style="background:' + dotColor + ';"></span>' + escapeCardHtml(label) + '</span>';
    });
    if (boundaryIds.length > 3) {
      inner += '<span class="individual-hint" style="font-size:11px; margin:0;">+' + (boundaryIds.length - 3) + ' more</span>';
    }
  }
  inner += '<div style="display:flex; align-items:center; gap:8px; margin-left:auto;">';
  inner += '<span class="individual-hint" style="font-size:11px; margin:0; white-space:nowrap;">Did you attend?</span>';
  inner += '<button type="button" class="app-btn moves-attend-yes-btn" style="font-size:12px; padding:4px 10px;">Yes</button>';
  inner += '<button type="button" class="app-btn app-btn-outline moves-attend-no-btn" style="font-size:12px; padding:4px 10px;">No</button>';
  inner += '</div>';
  return '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px;">' + inner + '</div>';
}

// Learn more link + timing badge share the header's right slot, stacked —
// both are "top right of the card" content, and a card can have either, both,
// or neither (e.g. a real event has no timing; a closing-soon ask may have no
// source_url).
function movesLearnMoreHtml(url) {
  return url ? '<a href="' + escapeCardHtml(url) + '" target="_blank" rel="noopener noreferrer" class="app-btn app-btn-outline" style="font-size:12px; padding:4px 10px; text-decoration:none; white-space:nowrap;">Learn more</a>' : '';
}
function movesTopRightStackHtml(parts) {
  const filtered = parts.filter(Boolean);
  if (!filtered.length) return '';
  return '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">' + filtered.join('') + '</div>';
}

// "Did you attend?" response for a real local event — the Attend-tab
// counterpart to markDoneFromCard/dismissCard for organizer attend-asks.
// These events have no row in `actions`, so they get their own endpoint
// (local_event_attendance) instead; either answer removes the card, and the
// server won't return it again on future feed loads (see
// filterUnansweredEvents in server/individual/routes/local.js).
async function respondEventAttendance(cardEl, event, attended) {
  try {
    await fetch('/api/local/events/attendance', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'mobilize',
        event_key: event.event_key,
        title: event.title,
        org_name: event.organization && event.organization.name,
        event_date: event.start_date,
        boundary_ids: event.boundary_ids || [],
        attended,
      }),
    });
  } catch (e) {
    console.error('respondEventAttendance', e);
  }
  if (cardEl && cardEl.remove) cardEl.remove();
  if (attended) showMovesToast('✓ Marked as attended');
}

// ─── MOVES FEED: ATTEND EVENT CARD (local events feed — rallies, meetings, screenings, etc.) ───
// Same layout as the rest of Moves now: org name bold/larger above the event
// title (next to the logo), date/location as a plain meta line, "Did you
// attend?" control moved down to the bottom row (no boundary tags on real
// events, so that row is usually just the control). Learn more sits in the
// header's top-right slot, same place every other card's link/timing lives.
function renderAttendEventCard(item) {
  const event = item.raw;
  const dateStr = event.start_date ? new Date(event.start_date * 1000).toLocaleDateString() : '';
  const location = event.locality && event.region ? event.locality + ', ' + event.region : event.locality || event.region || 'TBD';
  const orgName = event.organization && event.organization.name ? event.organization.name : 'Event';
  const metaLine = dateStr ? escapeCardHtml(dateStr) + ' • ' + escapeCardHtml(location) : escapeCardHtml(location);

  const card = renderMovesFeedCard({
    kind: 'attend',
    badgeLabel: '',
    title: event.title || '',
    orgNameTop: orgName,
    metaLine,
    bottomRowHtml: attendResponseRowHtml(event.boundary_ids),
    timingHtml: movesTopRightStackHtml([movesLearnMoreHtml(event.browser_url)]),
  });

  const yesBtn = card.querySelector('.moves-attend-yes-btn');
  const noBtn = card.querySelector('.moves-attend-no-btn');
  if (yesBtn) yesBtn.addEventListener('click', (e) => { e.stopPropagation(); respondEventAttendance(card, event, true); });
  if (noBtn) noBtn.addEventListener('click', (e) => { e.stopPropagation(); respondEventAttendance(card, event, false); });

  return card;
}

// ─── MOVES FEED: VOLUNTEER CARD (volunteer opportunities) ───
function renderVolunteerCard(item) {
  const opp = item.raw;
  return renderMovesFeedCard({
    kind: 'volunteer',
    badgeLabel: 'Volunteer',
    title: opp.title || '',
    metaLine: opp.location ? escapeCardHtml(opp.location) : '',
    actionsHtml: opp.url ? '<a href="' + escapeCardHtml(opp.url) + '" target="_blank" rel="noopener noreferrer" class="app-btn app-btn-outline" style="font-size:13px; text-decoration:none;">Learn more</a>' : '',
  });
}

// ─── VEST: BANK ALERTS (dated-pledge "comes due" reminder) ───
// Only dated reminders render here now (2026-08) — the flagged-bank prompt was
// dropped as its own banner and folded directly into the Bank Status card
// (buildBankStatusCardHtml in money.js), since having both a "X is flagged" card
// above and a "Your Bank Status" card below said the same thing twice (and, for
// banks flagged without a bocc_2024 figure like Charles Schwab, contradicted each
// other). A reminder is different — it's a time-sensitive nudge about a specific
// promise, not standing bank status, so it still gets its own banner + snooze.
function renderVestBankAlertHtml(item) {
  const r = item.raw;
  const cardKey = vestCardKey(item).replace(/'/g, "\\'");
  const institution = r.institution_display || 'this institution';
  const days = item.deadline ? Math.round((item.deadline.getTime() - startOfToday().getTime()) / (24 * 60 * 60 * 1000)) : null;
  let title;
  if (days == null) title = 'Your promise to ' + institution + ' comes due';
  else if (days > 1) title = 'Your promise to ' + institution + ' comes due in ' + days + ' days';
  else if (days === 1) title = 'Your promise to ' + institution + ' comes due tomorrow';
  else if (days === 0) title = 'Your promise to ' + institution + ' comes due today';
  else title = 'Your promise to ' + institution + ' came due ' + Math.abs(days) + (Math.abs(days) === 1 ? ' day ago' : ' days ago');
  const metaLine = r.condition_note ? escapeCardHtml(r.condition_note) : 'Review your standing position and decide whether to act or extend.';

  return '<div class="individual-card" style="border-left:4px solid var(--accent); margin-bottom:12px;">' +
    '<div style="font-weight:600; margin-bottom:4px;">' + escapeCardHtml(title) + '</div>' +
    '<div class="individual-hint" style="margin-bottom:10px;">' + metaLine + '</div>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button type="button" class="app-btn" style="font-size:13px;" onclick="document.getElementById(\'vest-bank-status-card\').scrollIntoView({behavior:\'smooth\', block:\'start\'});">Review and decide</button>' +
    '<button type="button" class="app-btn app-btn-outline" style="font-size:13px;" onclick="snoozeVestCard(\'' + cardKey + '\')">Not now</button>' +
    '</div></div>';
}

function renderVestBankAlerts() {
  const container = document.getElementById('vest-bank-alerts');
  if (!container) return;

  const items = [];
  if (Array.isArray(movesPledgeReminders)) {
    const cutoff = new Date(startOfToday().getTime() + MOVES_VEST_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000);
    movesPledgeReminders.forEach((r) => {
      if (!r.condition_deadline) return;
      const deadline = new Date(r.condition_deadline + 'T00:00:00Z');
      if (Number.isNaN(deadline.getTime()) || deadline > cutoff) return;
      items.push({ subtype: 'reminder', raw: r, deadline });
    });
  }

  const visible = items.filter((item) => !movesVestSnoozeIsActive(vestCardKey(item)));
  container.innerHTML = visible.map(renderVestBankAlertHtml).join('');
}

// ─── MOVES FEED: ACTION UPDATE CARD (/api/actions rows without their own richer card) ───
// Same ingestion pipeline enriches these rows with leverage_point/strategy_text/
// material_stake/boundary_ids as real petitions — action_type just isn't 'petition'.
// So the expand panel reuses fillMovesActionExpandPanel/toggleMovesActionRowExpand
// verbatim instead of a separate plain-link version that was throwing that away.
// Shared by the 'notify' (boycott/comment/contact), 'attend', and 'volunteer'
// kinds — kind/badgeLabel just control which tab it sorts into and which badge shows.
function renderActionUpdateCard(action, kind, badgeLabel, hideTiming) {
  const domain = domainForActionLogo(action);

  // Same layout as Sign-kind cards (renderActionCard) across every Moves tab
  // this feeds (Attend/Volunteer/Comments, plus notify's boycott/comment/
  // contact asks on Sign): org name bold/larger next to the logo, kind badge
  // moved down into the boundary-tags row far right, timing_display
  // ("Closes <date>"/"Active window") preferred over the generic day-count
  // badge in the header's right slot.
  const rightHtml = hideTiming ? '' : movesPetitionRowRightHtml(action);

  // Attend-tab cards: an organizer "come to this event" ask isn't a petition —
  // the Sign-style expand panel (Copy address & open/Mark done/Not this
  // time/Contact your rep) assumes a target to pressure, which doesn't apply
  // to "show up somewhere." These get the same "Did you attend?" Yes/No
  // control real Mobilize event cards use on this tab (see
  // renderAttendEventCard) instead of the expand-to-act interaction — Yes
  // reuses the existing Mark-done endpoint (Ledger already counts it), No
  // reuses the existing dismiss endpoint.
  const isAttendAsk = kind === 'attend';
  const hasUrl = !!(action.source_url && String(action.source_url).trim());
  const bottomRowHtml = isAttendAsk
    ? attendResponseRowHtml(action.boundary_ids)
    : boundaryTagsWithBadgeRowHtml(action.boundary_ids, kind, badgeLabel);
  // Learn more stacks with the timing badge in the top-right slot for
  // attend-asks (they can have both); other kinds keep just the timing badge,
  // same as before.
  const timingHtml = isAttendAsk
    ? movesTopRightStackHtml([rightHtml, movesLearnMoreHtml(hasUrl ? action.source_url : '')])
    : rightHtml;

  const card = renderMovesFeedCard({
    kind,
    badgeLabel: '',
    title: action.action_ask || action.org_name || '(' + badgeLabel + ')',
    orgNameTop: action.org_name,
    bottomRowHtml,
    timingHtml,
    logoHtml: causalOrgLogoHtml(domain, action.org_name, 32),
  });
  card.classList.add('individual-action-row');
  card.dataset.actionId = action.id;

  if (isAttendAsk) {
    const yesBtn = card.querySelector('.moves-attend-yes-btn');
    const noBtn = card.querySelector('.moves-attend-no-btn');
    if (yesBtn) yesBtn.addEventListener('click', (e) => { e.stopPropagation(); markDoneFromCard(action.id); });
    if (noBtn) noBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissCard(action.id); });
    return card;
  }

  movesActionSnapshot[action.id] = {
    org_name: action.org_name || '',
    action_ask: action.action_ask || '',
    source_url: action.source_url || '',
    opened_at: action.opened_at || '',
  };

  const expand = document.createElement('div');
  expand.className = 'individual-action-expand';
  expand.hidden = true;
  expand.style.cssText = 'padding:10px 0; border-top:1px solid var(--border); margin-top:12px;';
  card.appendChild(expand);

  const header = card.querySelector('.moves-feed-card-header');
  if (header) {
    header.style.cursor = 'pointer';
    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleMovesActionRowExpand(card, action);
    });
  }

  return card;
}
window.loadMovesFeed = loadMovesFeed;

// ─── REP PROFILE: HELPERS ───

function mapCommitteesToTurnarounds(committees) {
  const result = {};
  if (!Array.isArray(committees)) return result;

  committees.forEach((committee) => {
    const name = String(committee).trim();
    const turnarounds = COMMITTEE_TURNAROUNDS[name];

    if (turnarounds && Array.isArray(turnarounds) && turnarounds.length > 0) {
      // Committee is mapped: add it under each of its turnarounds
      turnarounds.forEach((turnaround) => {
        if (!result[turnaround]) result[turnaround] = [];
        result[turnaround].push(name);
      });
    } else {
      // Committee is not mapped: show under "Other assignments"
      if (!result['Other']) result['Other'] = [];
      result['Other'].push(name);
    }
  });

  return result;
}

// ─── FINANCIAL REP: ASYNC PROFILE HELPERS ───

let _causalFiduciariesCache = null;
let _currentFinancialRepProfile = null; // { rep, relatedActions }

async function loadFiduciariesCached() {
  if (_causalFiduciariesCache) return _causalFiduciariesCache;
  try {
    const res = await fetch('/api/fiduciaries', { credentials: 'same-origin' });
    if (res.ok) _causalFiduciariesCache = await res.json();
  } catch (e) {
    console.error('loadFiduciariesCached', e);
  }
  return _causalFiduciariesCache || [];
}

async function fetchFinancialRepPledgeStats(institutionKey) {
  if (!institutionKey) return null;
  try {
    const res = await fetch('/api/financial-rep/pledge-stats?institution_key=' + encodeURIComponent(institutionKey), {
      credentials: 'same-origin'
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('fetchFinancialRepPledgeStats', e);
  }
  return null;
}

async function openFinancialRepProfileAsync(rep, relatedActions, body) {
  _currentFinancialRepProfile = { rep, relatedActions };
  try {
    const [fiduciaries, pledgeStats] = await Promise.all([
      loadFiduciariesCached(),
      rep.source_id ? fetchFinancialRepPledgeStats(rep.source_id) : Promise.resolve(null)
    ]);
    const fiduciary = fiduciaries.find(function(f) { return f.source_id === rep.source_id; }) || null;
    body.innerHTML = renderRepProfileHtml(rep, relatedActions || [], fiduciary, pledgeStats);
  } catch (e) {
    console.error('openFinancialRepProfileAsync', e);
    body.innerHTML = renderRepProfileHtml(rep, relatedActions || []);
  }
}

async function refreshCurrentFinancialRepProfile() {
  if (!_currentFinancialRepProfile) return;
  const body = document.getElementById('rep-profile-panel-body');
  if (!body) return;
  const { rep, relatedActions } = _currentFinancialRepProfile;
  const [fiduciaries, pledgeStats] = await Promise.all([
    loadFiduciariesCached(),
    rep.source_id ? fetchFinancialRepPledgeStats(rep.source_id) : Promise.resolve(null)
  ]);
  const fiduciary = fiduciaries.find(function(f) { return f.source_id === rep.source_id; }) || null;
  body.innerHTML = renderRepProfileHtml(rep, relatedActions || [], fiduciary, pledgeStats);
}

async function takeFinancialRepPledge(institutionKey, commitmentNote) {
  try {
    const res = await fetch('/api/financial-rep/pledge', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_key: institutionKey, commitment_note: commitmentNote || null })
    });
    if (res.ok) await refreshCurrentFinancialRepProfile();
  } catch (e) {
    console.error('takeFinancialRepPledge', e);
  }
}

async function updateFinancialRepPledge(institutionKey, status) {
  try {
    const res = await fetch('/api/financial-rep/pledge', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_key: institutionKey, status: status })
    });
    if (res.ok) await refreshCurrentFinancialRepProfile();
  } catch (e) {
    console.error('updateFinancialRepPledge', e);
  }
}

async function financialRepPromiseSubmit(institutionKey, domId) {
  const input = document.getElementById('finrep-promise-date-' + domId);
  const dateVal = input && input.value ? input.value : '';
  if (!dateVal) { alert('Choose a date first.'); return; }
  try {
    const res = await fetch('/api/financial-rep/pledge/condition', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_key: institutionKey, condition_deadline: dateVal }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not save promise.');
      return;
    }
    await refreshCurrentFinancialRepProfile();
  } catch (e) {
    alert('Network error.');
  }
}
window.financialRepPromiseSubmit = financialRepPromiseSubmit;

function renderFinancialRepExtras(rep, fiduciary, pledgeStats) {
  let html = '';
  const ww = fiduciary && fiduciary.what_works ? fiduciary.what_works : null;

  // What works section
  if (ww) {
    html += '<div style="margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:6px;">';
    html += '<div style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; color:var(--text-primary);">What actually works</div>';
    html += '<div style="font-size:12px; color:var(--text-secondary); line-height:1.6; margin-bottom:' + (ww.individual_limit_note ? '8px' : '4px') + ';">' + escapeCardHtml(ww.mechanism_note || '') + '</div>';
    if (ww.individual_limit_note) {
      html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px; font-style:italic;">' + escapeCardHtml(ww.individual_limit_note) + '</div>';
    }
    if (Array.isArray(ww.coordinated_campaigns) && ww.coordinated_campaigns.length > 0) {
      html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
      ww.coordinated_campaigns.forEach(function(c) {
        html += '<a href="' + escapeCardHtml(c.url || '') + '" target="_blank" rel="noopener" class="individual-link" style="font-size:11px;">' + escapeCardHtml(c.name || '') + ' →</a>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // Next event
  if (fiduciary && fiduciary.next_event && fiduciary.next_event.label) {
    const ne = fiduciary.next_event;
    html += '<div style="margin-bottom:16px; font-size:12px; color:var(--text-secondary);">';
    html += 'Next: <strong>' + escapeCardHtml(ne.label) + '</strong>';
    if (ne.date) html += ' — ' + escapeCardHtml(ne.date);
    html += '</div>';
  }

  // Standing position section
  if (pledgeStats !== null && rep.source_id) {
    const count = Number((pledgeStats || {}).committed_count) || 0;
    const userStatus = (pledgeStats || {}).user_pledge_status || null;
    const ik = escapeCardHtml(rep.source_id);
    const repName = escapeCardHtml(rep.name || 'this institution');

    html += '<div style="border-top:1px solid var(--border); padding-top:16px; margin-bottom:4px;">';
    html += '<div style="font-weight:600; font-size:13px; margin-bottom:8px;">Standing position</div>';

    if (count > 0) {
      html += '<div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;"><strong>' + count + ' ' + (count === 1 ? 'person' : 'people') + '</strong> have a standing position with ' + repName + '.</div>';
    } else {
      html += '<div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">Be the first to take a standing position with ' + repName + '.</div>';
    }

    if (!userStatus || userStatus === 'withdrawn') {
      html += '<button type="button" class="app-btn" style="font-size:13px;" onclick="takeFinancialRepPledge(\'' + ik + '\')">Take a standing position</button>';
    } else {
      const statusLabel = userStatus === 'acted' ? 'Followed through' : 'Standing position held';
      html += '<div style="font-size:12px; color:var(--green); margin-bottom:10px;">✓ ' + statusLabel + '</div>';
      html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
      if (userStatus === 'committed') {
        html += '<button type="button" class="app-btn app-btn-small" style="font-size:12px;" onclick="updateFinancialRepPledge(\'' + ik + '\', \'acted\')">I followed through</button>';
      }
      html += '<button type="button" class="app-btn app-btn-outline app-btn-small" style="font-size:12px;" onclick="updateFinancialRepPledge(\'' + ik + '\', \'withdrawn\')">Withdraw</button>';
      html += '</div>';
    }

    const finConditionDeadline = (pledgeStats || {}).user_condition_deadline || null;
    if (userStatus !== 'withdrawn' && (window._causalVisitedFinancial || finConditionDeadline)) {
      const domId = ik.replace(/[^a-z0-9]+/gi, '_');
      const conditionDeadline = finConditionDeadline;
      html += '<div style="border-top:1px solid var(--border); margin-top:12px; padding-top:12px;">';
      if (conditionDeadline) {
        html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">You\'ve promised to act if ' + repName + ' hasn\'t changed by <strong>' + escapeCardHtml(conditionDeadline) + '</strong>.</div>';
      } else {
        html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">Not ready? Make it a promise instead:</div>';
      }
      html += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px;">';
      html += '<span>I\'ll act if ' + repName + ' hasn\'t changed by</span>';
      html += '<input type="date" id="finrep-promise-date-' + domId + '" style="padding:5px 8px; border:1px solid var(--border); border-radius:4px; font-size:12px;" value="' + (conditionDeadline || '') + '" min="' + new Date().toISOString().slice(0, 10) + '">';
      html += '<button type="button" class="app-btn app-btn-small" style="font-size:12px;" onclick="financialRepPromiseSubmit(\'' + ik + '\', \'' + domId + '\')">' + (conditionDeadline ? 'Extend' : 'Set reminder') + '</button>';
      html += '</div>';
      html += '</div>';
    }

    html += '<div style="font-size:11px; color:var(--text-secondary); margin-top:8px; line-height:1.5;">Individual contacts to fund managers rarely get direct responses. What matters is getting counted — and joining organized campaigns where they track it.</div>';
    html += '</div>';
  }

  return html;
}

function renderRepProfileHtml(rep, relatedActions, fiduciary, pledgeStats) {
  let html = '';

  html += '<div style="padding:0 16px;">';

  // Header: photo + name + office
  html += '<div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:16px;">';

  if (rep.photo_url) {
    html += '<img src="' + escapeCardHtml(rep.photo_url) + '" alt="' + escapeCardHtml(rep.name || '') + '" style="width:64px; height:64px; border-radius:8px; object-fit:cover; flex-shrink:0;">';
  }

  html += '<div style="flex:1; min-width:0;">';
  html += '<div style="font-weight:700; font-size:16px; color:var(--text-primary); margin-bottom:2px;">' + escapeCardHtml(rep.name || '') + '</div>';
  html += '<div class="individual-hint" style="font-size:13px; margin-bottom:4px;">' + escapeCardHtml(rep.office_name || '') + '</div>';
  html += '</div>';
  html += '</div>';

  // Contact section
  html += '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">';
  if (rep.phone) {
    html += '<a href="tel:' + escapeCardHtml(rep.phone) + '" class="app-btn app-btn-small" style="font-size:12px; padding:4px 8px; display:flex; align-items:center; gap:4px; text-decoration:none;">📞 Call ' + escapeCardHtml(rep.phone) + '</a>';
  }
  if (rep.contact_form) {
    html += '<a href="' + escapeCardHtml(rep.contact_form) + '" target="_blank" rel="noopener" class="app-btn app-btn-small" style="font-size:12px; padding:4px 8px; text-decoration:none;">Message</a>';
  }
  if (rep.website) {
    html += '<a href="' + escapeCardHtml(rep.website) + '" target="_blank" rel="noopener" class="app-btn app-btn-small" style="font-size:12px; padding:4px 8px; text-decoration:none;">Website</a>';
  }
  if (rep.personal_website) {
    html += '<a href="' + escapeCardHtml(rep.personal_website) + '" target="_blank" rel="noopener" class="app-btn app-btn-small" style="font-size:12px; padding:4px 8px; text-decoration:none;">Personal</a>';
  }
  html += '</div>';

  // Committees grouped by turnaround
  const turnaroundMap = mapCommitteesToTurnarounds(rep.committees);
  const sortedTurnarounds = ['Energy', 'Food', 'Inequality', 'Poverty', 'Empowerment'].filter(t => turnaroundMap[t]);

  if (sortedTurnarounds.length > 0) {
    // Identify cross-cutting committees (those appearing in multiple turnarounds)
    const committeeTurnaroundCount = {};
    sortedTurnarounds.forEach((turnaround) => {
      (turnaroundMap[turnaround] || []).forEach((committee) => {
        committeeTurnaroundCount[committee] = (committeeTurnaroundCount[committee] || 0) + 1;
      });
    });

    sortedTurnarounds.forEach((turnaround) => {
      const display = TURNAROUND_DISPLAY[turnaround] || turnaround;
      const committees = turnaroundMap[turnaround] || [];

      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.03em;">' + escapeCardHtml(display) + '</div>';
      html += '<div style="font-size:12px; color:var(--text-secondary); line-height:1.6;">';
      committees.forEach((c, i) => {
        const isCrossCutting = committeeTurnaroundCount[c] > 1;
        html += escapeCardHtml(c);
        if (isCrossCutting) {
          html += ' <span style="color:var(--text-muted); font-size:11px;">(Cross-cutting)</span>';
        }
        if (i < committees.length - 1) html += '<br>';
      });
      html += '</div>';
      html += '</div>';
    });

    if (turnaroundMap['Other'] && turnaroundMap['Other'].length > 0) {
      html += '<div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border);">';
      html += '<div style="font-weight:600; font-size:13px; color:var(--text-primary); margin-bottom:8px;">Other assignments</div>';
      html += '<div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">';
      turnaroundMap['Other'].forEach((c, i) => {
        html += escapeCardHtml(c);
        if (i < turnaroundMap['Other'].length - 1) html += '<br>';
      });
      html += '</div>';
      html += '</div>';
    }
  } else {
    html += '<div class="individual-hint" style="font-size:12px; color:var(--text-secondary); margin-bottom:16px;">Most of this rep\'s assignments fall outside the five turnarounds — but pressure on issue areas they sit on may still matter.</div>';
  }

  // Related actions
  const related = Array.isArray(relatedActions) ? relatedActions : [];
  if (related.length > 0) {
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-weight:600; font-size:13px; color:var(--text-primary); margin-bottom:8px;">Related actions</div>';
    html += '<div style="display:flex; flex-direction:column; gap:8px;">';
    related.forEach((action) => {
      const org = escapeCardHtml(action.org_name || 'Organization');
      const ask = escapeCardHtml(action.action_ask || 'Take action');
      html += '<div style="padding:8px; background:var(--bg-secondary); border-radius:4px; font-size:12px;">';
      html += '<div style="font-weight:500; color:var(--text-primary);">' + ask + '</div>';
      html += '<div style="color:var(--text-secondary); margin-top:2px;">' + org + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // Financial rep extras: what works + standing position
  if (fiduciary !== undefined || pledgeStats !== undefined) {
    html += renderFinancialRepExtras(rep, fiduciary || null, pledgeStats || null);
  }

  html += '</div>';
  return html;
}


function openRepProfile(rep, relatedActions) {
  const panel = document.getElementById('rep-profile-panel');
  const body = document.getElementById('rep-profile-panel-body');
  const title = document.getElementById('rep-profile-panel-title');
  if (!panel || !body || !title) return;

  title.textContent = rep.name || 'Rep';

  if (String(rep.level || '').toLowerCase() === 'financial') {
    body.innerHTML = '<div class="individual-hint" style="padding:16px;">Loading…</div>';
    panel.classList.add('open');
    document.body.style.overflow = 'hidden';
    openFinancialRepProfileAsync(rep, relatedActions, body);
    return;
  }

  body.innerHTML = renderRepProfileHtml(rep, relatedActions || []);
  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeRepProfile() {
  const panel = document.getElementById('rep-profile-panel');
  if (panel) panel.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── GOVERNMENT TAB: RENDER REP CARD ───
// Financial reps (pension funds/fund managers) still open the slide-in profile panel — that
// flow carries pledge/promise management too complex to inline. Elected/local reps show
// everything (contact methods, related actions) directly on the card instead —
// no click-through detail panel. Layout is two compact rows: name, then office+links.
function renderRepCard(rep, index, contactActions) {
  const isFinancial = String(rep.level || '').toLowerCase() === 'financial';

  const card = document.createElement('div');
  card.className = 'individual-card individual-rep-card';
  card.dataset.repId = rep.id;

  const header = document.createElement('div');
  header.style.cssText = isFinancial ? 'cursor:pointer;' : '';

  // Row 1: name
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex; align-items:flex-start; gap:10px;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-weight:600; font-size:15px; color:var(--text-primary); min-width:0;';
  nameEl.textContent = rep.name || '(Rep)';
  topRow.appendChild(nameEl);
  header.appendChild(topRow);

  // Row 2: office (left) + contact links (right) — Call only when a real number is sourced.
  const bottomRow = document.createElement('div');
  bottomRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:2px; flex-wrap:wrap;';

  const roleEl = document.createElement('div');
  roleEl.className = 'individual-hint';
  roleEl.style.cssText = 'font-size:13px;';
  roleEl.textContent = rep.office_name || '';
  bottomRow.appendChild(roleEl);

  const linksRow = document.createElement('div');
  linksRow.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap;';
  const addLink = (label, href) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    a.className = 'individual-link';
    a.style.cssText = 'font-size:12px; font-weight:600;';
    if (!href.startsWith('tel:') && !href.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.addEventListener('click', (e) => e.stopPropagation());
    linksRow.appendChild(a);
  };
  if (rep.phone) addLink('Call ' + rep.phone, 'tel:' + rep.phone);
  if (rep.contact_form) addLink('Message', rep.contact_form);
  if (rep.website) addLink('Website', rep.website);
  if (rep.email) addLink('Email', 'mailto:' + rep.email);
  if (rep.personal_website) addLink('Personal', rep.personal_website);
  if (linksRow.children.length) bottomRow.appendChild(linksRow);

  header.appendChild(bottomRow);
  card.appendChild(header);

  if (isFinancial) {
    header.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('button')) return;
      openRepProfile(rep, contactActions);
    });
    return card;
  }

  // Actions the user explicitly picked to contact this rep about (via the "Contact your
  // rep" button on the action's detail card in Moves) — one compact line each; clicking
  // shows what to say (the ask, why it matters, strategy, your stake) right in context.
  const picked = Array.isArray(contactActions) ? contactActions : [];
  if (picked.length > 0) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border-top:1px solid var(--border); padding-top:10px; margin-top:10px;';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:600; font-size:13px; margin-bottom:6px;';
    heading.textContent = 'Actions to contact them about';
    wrap.appendChild(heading);

    picked.forEach((row) => {
      wrap.appendChild(renderContactActionRow(row));
    });
    card.appendChild(wrap);
  }

  return card;
}

// Compact clickable line for an action the user picked to contact this rep about. Clicking
// it shows a script-style panel: the ask itself as what to say, plus why it matters/strategy/
// your stake if the action has them — so it's available in context while calling or messaging.
function renderContactActionRow(row) {
  const item = document.createElement('div');
  item.dataset.contactActionId = row.id;
  item.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--border);';

  const line = document.createElement('div');
  line.style.cssText = 'font-size:12px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

  const askSpan = document.createElement('span');
  askSpan.style.cssText = 'font-weight:500; color:var(--text-primary);';
  askSpan.textContent = row.action_ask || 'Take action';
  line.appendChild(askSpan);

  const orgSpan = document.createElement('span');
  orgSpan.style.cssText = 'color:var(--text-secondary);';
  orgSpan.textContent = ' — ' + (row.org_name || 'Organization');
  line.appendChild(orgSpan);

  if (row.contacted_at) {
    const doneSpan = document.createElement('span');
    doneSpan.style.cssText = 'color:var(--green); margin-left:4px;';
    doneSpan.textContent = '✓';
    line.appendChild(doneSpan);
  }

  const expand = document.createElement('div');
  expand.className = 'contact-action-expand';
  expand.hidden = true;
  expand.style.cssText = 'padding:10px 0 0;';

  line.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !expand.hidden;
    expand.hidden = isOpen;
    if (!isOpen && !expand.dataset.filled) {
      fillContactActionPanel(expand, row);
      expand.dataset.filled = '1';
    }
  });

  item.appendChild(line);
  item.appendChild(expand);
  return item;
}

function fillContactActionPanel(expandEl, row) {
  let html = '';

  html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:10px;">';
  html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">What to say</div>';
  html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(row.action_ask || '') + '</div>';
  html += '</div>';

  if (row.leverage_point) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:10px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Why it matters</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(row.leverage_point) + '</div>';
    html += '</div>';
  }

  if (row.strategy_text) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:10px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Strategy</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(row.strategy_text) + '</div>';
    html += '</div>';
  }

  if (row.material_stake) {
    html += '<div style="padding:12px; background:var(--bg-secondary); border-radius:4px; margin-bottom:10px;">';
    html += '<div style="font-weight:600; font-size:12px; color:var(--text-primary); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Your stake</div>';
    html += '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + escapeCardHtml(row.material_stake) + '</div>';
    html += '</div>';
  }

  if (row.source_url) {
    html += '<a href="' + escapeCardHtml(row.source_url) + '" target="_blank" rel="noopener" class="app-btn app-btn-outline" style="display:inline-block; font-size:12px; margin-bottom:10px; text-decoration:none;">View source →</a>';
  }

  html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
  if (!row.contacted_at) {
    html += '<button type="button" class="app-btn contact-action-done-btn" data-id="' + escapeCardHtml(String(row.id)) + '">Mark contacted</button>';
  }
  html += '<button type="button" class="app-btn app-btn-outline contact-action-remove-btn" data-id="' + escapeCardHtml(String(row.id)) + '">Remove</button>';
  html += '</div>';

  expandEl.innerHTML = html;

  const doneBtn = expandEl.querySelector('.contact-action-done-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markContactActionDone(row.id);
    });
  }
  const removeBtn = expandEl.querySelector('.contact-action-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeContactAction(row.id);
    });
  }
}

async function markContactActionDone(id) {
  try {
    await fetch('/api/reps/contact-actions/' + Number(id) + '/contacted', { method: 'POST', credentials: 'same-origin' });
    showMovesToast('✓ Marked contacted');
    loadReps();
  } catch (e) {
    console.error('markContactActionDone', e);
    alert('Could not mark as contacted');
  }
}

async function removeContactAction(id) {
  try {
    await fetch('/api/reps/contact-actions/' + Number(id) + '/dismiss', { method: 'POST', credentials: 'same-origin' });
    loadReps();
  } catch (e) {
    console.error('removeContactAction', e);
    alert('Could not remove');
  }
}

// ─── GOVERNMENT TAB: TIER HELPERS ───
function getRepTier(rep) {
  const level = String(rep.level || '').toLowerCase();
  if (level === 'financial') {
    return 'financial';
  } else if (['federal', 'national', 'supranational'].includes(level)) {
    return 'national';
  } else if (level === 'state') {
    return 'regional';
  }
  return 'local';
}

function getRepsByTier(tier) {
  if (!Array.isArray(allRepsData)) return [];
  return allRepsData.filter(rep => getRepTier(rep) === tier);
}

// National/Regional/Local/Bills-and-Races are an exclusive accordion — opening one closes the rest.
const GOV_REPS_SECTIONS = ['national', 'regional', 'local', 'bills'];
function toggleGovRepsSection(tier, forceOpen) {
  const wrap = document.getElementById('gov-reps-section-' + tier);
  const body = document.getElementById('gov-reps-section-' + tier + '-body');
  if (!wrap || !body) return;
  const isOpen = wrap.classList.contains('expanded');
  const open = forceOpen === true ? true : forceOpen === false ? false : !isOpen;

  GOV_REPS_SECTIONS.forEach((t) => {
    const w = document.getElementById('gov-reps-section-' + t);
    const b = document.getElementById('gov-reps-section-' + t + '-body');
    if (!w || !b) return;
    const thisOpen = t === tier ? open : false;
    w.classList.toggle('expanded', thisOpen);
    b.style.display = thisOpen ? 'flex' : 'none';
  });
}
window.toggleGovRepsSection = toggleGovRepsSection;

// National/Regional/Local render as always-visible sections (not switchable tabs) into their own containers.
function renderAllTiers() {
  ['national', 'regional', 'local'].forEach((tier) => {
    if (tier === 'local') {
      renderLocalTier();
      return;
    }

    const reps = getRepsByTier(tier);
    const container = document.getElementById('gov-reps-' + tier);
    if (!container) return;
    if (!reps.length) {
      const label = { national: 'National', regional: 'Regional' }[tier] || tier;
      container.innerHTML = '<div class="individual-empty" style="padding:32px 20px;">' + label + ' rep data is coming soon.</div>';
      return;
    }
    renderRepsForTier(tier);
  });
}

// ─── GOVERNMENT TAB: LOCAL TIER (manual add — no automatic local-official data source) ───
function renderLocalTier() {
  const container = document.getElementById('gov-reps-local');
  if (!container) return;

  const zip = String(window._causalUserLocationRaw || '').trim();
  const lookupLine = zip
    ? 'Look up officials for ZIP ' + escapeHtml(zip) + ' at '
    : 'Look up your local officials at ';

  const header = document.createElement('div');
  header.className = 'individual-card';
  header.style.marginBottom = '12px';
  header.innerHTML =
    '<div style="font-weight:600; margin-bottom:6px;">Find your local officials</div>' +
    '<div class="individual-hint" style="margin-bottom:10px;">' + lookupLine +
    '<a href="https://www.usa.gov/elected-officials" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600;">USA.gov elected officials search ↗</a></div>' +
    '<button type="button" class="app-btn app-btn-outline" onclick="openAddLocalOfficial()">+ Add a local official</button>';

  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:12px; margin-top:12px;';

  const reps = getRepsByTier('local');
  reps.forEach((rep, idx) => {
    const contactActions = repsContactActionsMap[String(rep.id)] || [];
    list.appendChild(renderRepCard(rep, idx, contactActions));
  });

  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(list);
}

function openAddLocalOfficial() {
  const overlay = document.getElementById('add-local-official-overlay');
  if (!overlay) return;
  ['local-official-name', 'local-official-role', 'local-official-phone', 'local-official-website'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  overlay.style.display = 'flex';
}

function closeAddLocalOfficial() {
  const overlay = document.getElementById('add-local-official-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitAddLocalOfficial() {
  const nameEl = document.getElementById('local-official-name');
  const roleEl = document.getElementById('local-official-role');
  const phoneEl = document.getElementById('local-official-phone');
  const websiteEl = document.getElementById('local-official-website');

  const name = nameEl ? nameEl.value.trim() : '';
  const role = roleEl ? roleEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const website = websiteEl ? websiteEl.value.trim() : '';

  if (!name || !role) {
    alert('Name and role are required.');
    return;
  }

  try {
    const res = await fetch('/api/representatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        role,
        level: 'local',
        jurisdiction: null,
        country: window._causalUserCountry || 'US',
        committees: [],
        phone: phone || null,
        website: website || null,
        source: 'user',
        source_id: 'local-manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      }),
    });
    if (!res.ok) throw new Error('Failed to add official');

    closeAddLocalOfficial();
    allRepsData = [];
    await loadReps();
    renderLocalTier();
  } catch (e) {
    console.error('submitAddLocalOfficial', e);
    alert('Could not add this official. Please try again.');
  }
}
window.openAddLocalOfficial = openAddLocalOfficial;
window.closeAddLocalOfficial = closeAddLocalOfficial;
window.submitAddLocalOfficial = submitAddLocalOfficial;

function renderRepsForTier(tier) {
  const container = document.getElementById('gov-reps-' + tier);
  if (!container) return;

  const reps = getRepsByTier(tier);

  if (!reps.length) {
    container.innerHTML = '<div class="individual-empty">No reps at this level.</div>';
    return;
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

  reps.forEach((rep, idx) => {
    const contactActions = repsContactActionsMap[String(rep.id)] || [];
    list.appendChild(renderRepCard(rep, idx, contactActions));
  });

  container.innerHTML = '';
  container.appendChild(list);
}

// ─── GOVERNMENT TAB: LOAD REPS ───
async function loadReps() {
  const containers = ['national', 'regional', 'local'].map((tier) => document.getElementById('gov-reps-' + tier));
  if (!containers.some(Boolean)) return;

  proxiesRepsLoaded = true;
  containers.forEach((container) => {
    if (container) container.innerHTML = '<div style="padding:12px; text-align:center; color:var(--text-secondary);">Loading reps…</div>';
  });

  try {
    const res = await fetch('/api/reps?t=' + Date.now(), { credentials: 'same-origin' });
    if (!res.ok) {
      containers.forEach((container) => { if (container) container.innerHTML = '<div class="individual-empty">Could not load reps</div>'; });
      return;
    }
    const reps = await res.json();
    if (!Array.isArray(reps) || !reps.length) {
      containers.forEach((container) => { if (container) container.innerHTML = '<div class="individual-empty">No reps found. Update your location in Settings.</div>'; });
      return;
    }

    // Store all reps for tier grouping
    allRepsData = reps;

    // Fetch actions the user has explicitly picked to contact each rep about
    // (via the "Contact your rep" button in Moves — see openContactRepPicker).
    repsContactActionsMap = {};
    try {
      const contactRes = await fetch('/api/reps/contact-actions', { credentials: 'same-origin' });
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        if (Array.isArray(contactData)) {
          contactData.forEach((row) => {
            const repId = String(row.rep_id);
            if (!repsContactActionsMap[repId]) repsContactActionsMap[repId] = [];
            repsContactActionsMap[repId].push(row);
          });
        }
      }
    } catch (e) {
      console.error('Could not load contact actions:', e);
    }

    // Render National/Regional/Local as always-visible sections
    renderAllTiers();
  } catch (e) {
    console.error('loadReps', e);
    containers.forEach((container) => { if (container) container.innerHTML = '<div class="individual-empty">Error loading reps</div>'; });
  }
}

// ─── REPRESENTATION › FINANCIAL TAB: PENSION FUNDS & FUND MANAGERS ───
async function ensureRepsDataLoaded() {
  if (allRepsData && allRepsData.length) return allRepsData;
  try {
    const res = await fetch('/api/reps?t=' + Date.now(), { credentials: 'same-origin' });
    if (res.ok) {
      const reps = await res.json();
      if (Array.isArray(reps)) allRepsData = reps;
    }
  } catch (e) {
    console.error('ensureRepsDataLoaded', e);
  }
  return allRepsData;
}

async function loadFinancialReps() {
  const container = document.getElementById('financial-reps-container');
  if (!container) return;
  container.innerHTML = '<div class="individual-empty">Loading financial reps…</div>';

  await ensureRepsDataLoaded();
  const reps = getRepsByTier('financial');
  if (!reps.length) {
    container.innerHTML = '<div class="individual-empty">No pension funds or fund managers added yet.</div>';
    return;
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
  reps.forEach((rep, i) => {
    list.appendChild(renderRepCard(rep, i, repsContactActionsMap[String(rep.id)] || []));
  });
  container.innerHTML = '';
  container.appendChild(list);
}

// ─── PROXIES › FINANCIAL TAB: read-only tracking summary ───
// Everything actionable (add/change bank, pledge, promise, pressure actions, pension
// fund pledges) lives on Assets now — this is just a status check with a link over.
async function loadFinancialTrackingSummary() {
  const container = document.getElementById('financial-tracking-summary');
  if (!container) return;
  container.innerHTML = '<div class="individual-hint">Loading…</div>';

  const manageLink = '<a href="#" onclick="movesCurrentTab=\'vest\'; vestCurrentAssetTab=\'banks\'; showIndividualSection(\'moves\', \'feed\'); return false;" style="color:var(--accent); font-weight:600; font-size:12px; white-space:nowrap;">Manage in Assets →</a>';

  try {
    // Same flag check the Assets tab's bank card uses (money.js fetchBankStatusData), so a
    // flagged bank reads as a problem here too instead of only showing pledge status.
    const { userBank, flagData } = await fetchBankStatusData();

    let bankStatusLine = '<div class="individual-empty">No bank added yet.</div>';
    if (userBank) {
      let statusLabel = '';
      const bankInfo = (typeof COMMON_BANKS !== 'undefined' ? COMMON_BANKS : []).find((b) => b.name.toLowerCase() === userBank.toLowerCase());
      if (bankInfo && bankInfo.key) {
        try {
          const statsRes = await fetch('/api/bank/pledge-stats?institution=' + encodeURIComponent(bankInfo.key), { credentials: 'same-origin' });
          if (statsRes.ok) {
            const stats = await statsRes.json();
            if (stats.user_pledge_status) statusLabel = BANK_PLEDGE_STATUS_LABELS[stats.user_pledge_status] || stats.user_pledge_status;
          }
        } catch (_) {}
      }
      let flagHtml = '';
      if (flagData) {
        const detail = flagData.bocc_2024 ? ' — ' + escapeHtml(flagData.bocc_2024) + ' (2024)' : '';
        flagHtml = '<div style="font-size:12px; color:var(--red, #b91c1c); font-weight:600; margin-top:2px;">⚠ Flagged for fossil fuel financing' + detail + '</div>';
      }
      bankStatusLine = '<div class="individual-card" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
        '<div><span style="font-size:13px;">' + escapeHtml(userBank) + (statusLabel ? ' <span class="individual-hint">— ' + escapeHtml(statusLabel) + '</span>' : '') + '</span>' + flagHtml + '</div>' +
        manageLink + '</div>';
    }

    await ensureRepsDataLoaded();
    const reps = getRepsByTier('financial');
    const repsHtml = reps.length
      ? '<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">' +
        reps.map((r) => '<div class="individual-card" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
          '<span style="font-size:13px;">' + escapeHtml(r.name) + '</span>' + manageLink + '</div>').join('') +
        '</div>'
      : '<div class="individual-empty">No pension funds or fund managers added yet.</div>';

    // ASPIRATIONAL:PURSE — financial reps as a coordinated-leverage tier, same idea as the
    // elected-rep pressure model. See docs/Causal_Development_Path.md "Purse — coordinated
    // financial leverage".
    const financialRepAspirationalHint =
      '<!-- ASPIRATIONAL:PURSE -->' +
      '<div class="individual-hint" data-aspirational="purse" style="margin-top:8px;">Pooled-resolution tracking — coming soon: coordinate with everyone else naming the same fund manager or trustee, the same way Assets already pools bank pledges.</div>' +
      '<!-- /ASPIRATIONAL -->';

    container.innerHTML =
      '<div class="individual-section-title">Bank</div>' + bankStatusLine +
      '<div class="individual-section-title" style="margin-top:20px;">Pension funds &amp; fund managers</div>' + repsHtml + financialRepAspirationalHint;
  } catch (e) {
    console.error('loadFinancialTrackingSummary', e);
    container.innerHTML = '<div class="individual-empty">Could not load status</div>';
  }
}
window.loadFinancialTrackingSummary = loadFinancialTrackingSummary;

// ─── BILLS AND RACES ───
// Links out to an external sample-ballot lookup rather than fetching live race data —
// FEC/Google Civic race feeds were unreliable and often empty outside election season.
function loadRaces() {
  const container = document.getElementById('gov-races-container');
  if (!container) return;

  container.innerHTML =
    '<a class="app-btn app-btn-outline" href="https://ballotpedia.org/Sample_Ballot_Lookup" target="_blank" rel="noopener" style="display:inline-block; text-decoration:none;">Ballotpedia Sample Ballot Lookup ↗</a>';
}

// ─── ACTION CLICKS: MARK DONE ───
function showMovesToast(message) {
  let toast = document.getElementById('moves-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'moves-toast';
    toast.className = 'moves-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('moves-toast--visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('moves-toast--visible'), 2200);
}

async function markDoneFromCard(actionId) {
  const id = String(actionId);
  try {
    await fetch('/api/actions/' + id + '/done', { method: 'POST', credentials: 'same-origin' });
    collapseMovesActionRow();
    showMovesToast('✓ Marked as done');
    loadMovesFeed();
  } catch (e) {
    console.error('markDoneFromCard', e);
    alert('Could not mark as done');
  }
}

// ─── ACTION CLICKS: DISCARD ───
async function dismissCard(actionId) {
  const id = String(actionId);
  try {
    const res = await fetch('/api/actions/' + id + '/dismiss', { method: 'POST', credentials: 'same-origin' });
    if (!res.ok) throw new Error('dismiss ' + res.status);
    collapseMovesActionRow();
    loadMovesFeed();
  } catch (e) {
    console.error('dismissCard', e);
    alert('Could not discard');
  }
}

// ─── ACTION CLICKS: COPY & OPEN ───
async function movesCopyOpenLaunch(actionId) {
  const id = String(actionId);
  const addr = String(window.CAUSAL_ADDRESS || '').trim();

  if (!addr) {
    alert('Add your Causal address in Settings to use this.');
    return;
  }

  if (!localStorage.getItem(MOVES_ADDRESS_EXPLAINER_SEEN_KEY)) {
    openAddressExplainerModal(addr, function () {
      movesCopyOpenPerform(id, addr);
    });
    return;
  }

  movesCopyOpenPerform(id, addr);
}

async function movesCopyOpenPerform(id, addr) {
  try {
    await navigator.clipboard.writeText(addr);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = addr;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  try {
    await fetch('/api/actions/' + id + '/opened', { method: 'POST', credentials: 'same-origin' });
  } catch (_) {}

  // Open the action's source URL if available
  if (activeAction && activeAction.source_url) {
    window.open(activeAction.source_url, '_blank', 'noopener,noreferrer');
  }
}

// ─── ADDRESS EXPLAINER MODAL: shown once before the first Copy address & open,
// explains what the copied Causal address is for (see settings.js copyAddress
// for the same address surfaced in Settings). ───
let addressExplainerContinueCb = null;

function openAddressExplainerModal(addr, onContinue) {
  addressExplainerContinueCb = onContinue;
  const overlay = document.getElementById('address-explainer-modal-overlay');
  if (!overlay) {
    createAddressExplainerModal();
    openAddressExplainerModal(addr, onContinue);
    return;
  }
  const addrEl = document.getElementById('address-explainer-addr');
  if (addrEl) addrEl.textContent = addr;
  const skipInput = document.getElementById('address-explainer-skip-future');
  if (skipInput) skipInput.checked = true;
  overlay.classList.add('open');
}

function createAddressExplainerModal() {
  const modalHtml = `
    <div id="address-explainer-modal-overlay" class="volunteer-modal-overlay">
      <div class="volunteer-modal">
        <div class="volunteer-modal-header">
          <h3 class="volunteer-modal-title">Your Causal address</h3>
          <button type="button" class="volunteer-modal-close" onclick="closeAddressExplainerModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0 0 4px;">This button just copied your personal forwarding address to your clipboard:</p>
        <p id="address-explainer-addr" style="font-family:monospace; font-size:15px; color:var(--accent); font-weight:700; margin:8px 0;"></p>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0;">Use it wherever the petition or form asks for your email — replies and confirmations will show up in your action feed here instead of your inbox. Forward activist emails to this address any time and they'll appear the same way.</p>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-secondary); margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="address-explainer-skip-future" checked> Don't show this again
        </label>
        <div class="volunteer-modal-buttons">
          <button type="button" class="volunteer-modal-button primary" onclick="continueFromAddressExplainer()" style="flex:none; width:100%;">Continue</button>
        </div>
      </div>
    </div>
  `;

  if (!document.getElementById('address-explainer-modal-overlay')) {
    const temp = document.createElement('div');
    temp.innerHTML = modalHtml;
    document.body.appendChild(temp.firstElementChild);
  }

  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') closeAddressExplainerModal();
  });

  const overlay = document.getElementById('address-explainer-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeAddressExplainerModal();
    });
  }
}

function closeAddressExplainerModal() {
  const overlay = document.getElementById('address-explainer-modal-overlay');
  if (overlay) overlay.classList.remove('open');
  addressExplainerContinueCb = null;
}

function continueFromAddressExplainer() {
  const skipInput = document.getElementById('address-explainer-skip-future');
  if (skipInput && skipInput.checked) {
    localStorage.setItem(MOVES_ADDRESS_EXPLAINER_SEEN_KEY, '1');
  }
  const cb = addressExplainerContinueCb;
  closeAddressExplainerModal();
  if (cb) cb();
}

// ─── VOLUNTEER: DETECT REGION ───
function getVolunteerUserRegion() {
  const cc = String(window._causalUserCountry || '').trim().toUpperCase();
  const euCountries = ['DE', 'AT', 'CH', 'FR', 'NL', 'BE', 'LU', 'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'ES', 'IT', 'PT', 'GR', 'IE'];
  return euCountries.includes(cc) ? 'EU' : 'US';
}

// ─── VOLUNTEER: RENDER PLATFORM LINKS ───
function renderVolunteerPlatformLinks() {
  const container = document.getElementById('volunteer-platform-links');
  if (!container) return;

  const region = getVolunteerUserRegion();
  const country = String(window._causalUserCountry || '').trim().toUpperCase();
  const location = String(window._causalUserLocationRaw || '').trim();

  // Build platform list with order based on region
  let platforms = [];

  if (region === 'EU') {
    platforms = [
      { name: 'GoVolunteer', url: 'https://www.govolunteer.com', desc: 'Local projects across Germany and DACH' },
      { name: 'Idealist', url: buildIdealistUrl(location, country), desc: 'Volunteer roles near you, filtered by cause' },
      { name: 'Catchafire', url: 'https://www.catchafire.org/volunteer-explore/', desc: 'Skills-based volunteering, mostly remote' },
      { name: 'All for Good', url: 'https://www.allforgood.org/search#q=&type=vol', desc: 'US-focused community opportunities' }
    ];
  } else {
    // US/Unknown default
    platforms = [
      { name: 'Idealist', url: buildIdealistUrl(location, country), desc: 'Volunteer roles near you, filtered by cause' },
      { name: 'All for Good', url: 'https://www.allforgood.org/search#q=&type=vol', desc: 'US-focused community opportunities' },
      { name: 'Catchafire', url: 'https://www.catchafire.org/volunteer-explore/', desc: 'Skills-based volunteering, mostly remote' },
      { name: 'GoVolunteer', url: 'https://www.govolunteer.com', desc: 'Local projects across Germany and DACH' }
    ];
  }

  let html = '';
  platforms.forEach(p => {
    html += '<a href="' + escapeCardHtml(p.url) + '" target="_blank" rel="noopener noreferrer" class="volunteer-link-row" style="text-decoration:none;">';
    html += '<div>';
    html += '<div class="volunteer-link-platform">' + escapeCardHtml(p.name) + '</div>';
    html += '<div class="volunteer-link-description">' + escapeCardHtml(p.desc) + '</div>';
    html += '</div>';
    html += '<span class="volunteer-link-arrow">→</span>';
    html += '</a>';
  });

  container.innerHTML = html;
}

// ─── VOLUNTEER: BUILD IDEALIST URL ───
function buildIdealistUrl(location, country) {
  const base = 'https://www.idealist.org/en/volunteer-opportunities';
  if (!location) return base;
  const locStr = String(location).trim();
  if (!locStr) return base;
  return base + '?q=&location=' + encodeURIComponent(locStr + (country ? ', ' + country : ''));
}

// ─── VOLUNTEER MODAL: OPEN ───
function openVolunteerSubmitModal() {
  const overlay = document.getElementById('volunteer-submit-modal-overlay');
  if (!overlay) {
    createVolunteerSubmitModal();
    openVolunteerSubmitModal();
    return;
  }

  // Reset form
  const titleInput = document.getElementById('volunteer-modal-title-input');
  const urlInput = document.getElementById('volunteer-modal-url-input');
  const locationInput = document.getElementById('volunteer-modal-location-input');
  const descInput = document.getElementById('volunteer-modal-desc-input');
  const kindVolunteerRadio = document.getElementById('volunteer-modal-kind-volunteer');

  if (titleInput) titleInput.value = '';
  if (urlInput) urlInput.value = '';
  if (locationInput) locationInput.value = '';
  if (descInput) descInput.value = '';
  if (kindVolunteerRadio) kindVolunteerRadio.checked = true;

  overlay.classList.add('open');
  if (titleInput) setTimeout(() => titleInput.focus(), 100);
}

// ─── VOLUNTEER MODAL: CREATE ───
function createVolunteerSubmitModal() {
  const modalHtml = `
    <div id="volunteer-submit-modal-overlay" class="volunteer-modal-overlay">
      <div class="volunteer-modal">
        <div class="volunteer-modal-header">
          <h3 class="volunteer-modal-title">Suggest an opportunity or local action</h3>
          <button type="button" class="volunteer-modal-close" onclick="closeVolunteerSubmitModal()">×</button>
        </div>
        <form class="volunteer-modal-form" id="volunteer-submit-form">
          <div class="volunteer-modal-field">
            <label class="volunteer-modal-label">Type</label>
            <div style="display:flex; gap:16px; font-size:13px;">
              <label style="display:flex; align-items:center; gap:6px; font-weight:400; cursor:pointer;"><input type="radio" name="volunteer-modal-kind" id="volunteer-modal-kind-volunteer" value="volunteer" checked> Volunteer opportunity</label>
              <label style="display:flex; align-items:center; gap:6px; font-weight:400; cursor:pointer;"><input type="radio" name="volunteer-modal-kind" id="volunteer-modal-kind-local-action" value="local_action"> Local action</label>
            </div>
          </div>
          <div class="volunteer-modal-field">
            <label class="volunteer-modal-label">Title *</label>
            <input type="text" id="volunteer-modal-title-input" class="volunteer-modal-input" placeholder="e.g. Beach cleanup day" required>
          </div>
          <div class="volunteer-modal-field">
            <label class="volunteer-modal-label">URL *</label>
            <input type="url" id="volunteer-modal-url-input" class="volunteer-modal-input" placeholder="https://example.com" required>
          </div>
          <div class="volunteer-modal-field">
            <label class="volunteer-modal-label">Location</label>
            <input type="text" id="volunteer-modal-location-input" class="volunteer-modal-input" placeholder="e.g. San Francisco, CA">
          </div>
          <div class="volunteer-modal-field">
            <label class="volunteer-modal-label">Description</label>
            <textarea id="volunteer-modal-desc-input" class="volunteer-modal-textarea" placeholder="Brief description of the opportunity…"></textarea>
          </div>
          <div class="volunteer-modal-buttons">
            <button type="button" class="volunteer-modal-button secondary" onclick="closeVolunteerSubmitModal()">Cancel</button>
            <button type="button" class="volunteer-modal-button primary" onclick="submitVolunteerOpportunity()">Submit for review</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Insert modal into page if not already there
  if (!document.getElementById('volunteer-submit-modal-overlay')) {
    const temp = document.createElement('div');
    temp.innerHTML = modalHtml;
    document.body.appendChild(temp.firstElementChild);
  }

  // Close on Escape key
  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') closeVolunteerSubmitModal();
  });

  // Close on overlay click
  const overlay = document.getElementById('volunteer-submit-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeVolunteerSubmitModal();
    });
  }
}

// ─── VOLUNTEER MODAL: CLOSE ───
function closeVolunteerSubmitModal() {
  const overlay = document.getElementById('volunteer-submit-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ─── VOLUNTEER MODAL: SUBMIT ───
async function submitVolunteerOpportunity() {
  const titleInput = document.getElementById('volunteer-modal-title-input');
  const urlInput = document.getElementById('volunteer-modal-url-input');
  const locationInput = document.getElementById('volunteer-modal-location-input');
  const descInput = document.getElementById('volunteer-modal-desc-input');
  const kindLocalActionRadio = document.getElementById('volunteer-modal-kind-local-action');

  const title = titleInput ? titleInput.value.trim() : '';
  const url = urlInput ? urlInput.value.trim() : '';
  const location = locationInput ? locationInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const kind = kindLocalActionRadio && kindLocalActionRadio.checked ? 'local_action' : 'volunteer';

  if (!title) {
    if (titleInput) titleInput.focus();
    return;
  }
  if (!url) {
    if (urlInput) urlInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/volunteer/suggest', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, url, location: location || null, description: description || null, kind })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not submit. Please try again.');
      return;
    }

    // Show success message
    const modal = document.querySelector('.volunteer-modal');
    if (modal) {
      modal.innerHTML = `
        <div class="volunteer-modal-success">
          <div class="volunteer-modal-success-icon">✓</div>
          <div class="volunteer-modal-success-title">Submission received</div>
          <div class="volunteer-modal-success-message">Thanks for sharing! We'll review and add it to our community list soon.</div>
        </div>
      `;

      setTimeout(() => {
        closeVolunteerSubmitModal();
        if (typeof loadMovesFeed === 'function') loadMovesFeed();
      }, 1500);
    }
  } catch (e) {
    console.error('submitVolunteerOpportunity', e);
    alert('Network error. Please try again.');
  }
}

// ─── LEDGER: LOAD ORGS ───
async function loadOrgs() {
  const container = document.getElementById('org-list-container');
  if (!container) return;

  container.innerHTML = '';

  try {
    const res = await fetch('/api/user/contributed-orgs', { credentials: 'same-origin' });
    if (!res.ok) {
      container.innerHTML = '<div class="individual-empty">Could not load organizations</div>';
      return;
    }
    const orgs = await res.json();
    if (!Array.isArray(orgs) || !orgs.length) {
      container.innerHTML = '<div class="individual-hint" style="padding:16px; text-align:center;">No organizations added yet</div>';
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

    orgs.forEach((org) => {
      const card = document.createElement('div');
      card.className = 'individual-card individual-org-card';
      card.dataset.orgId = org.id;

      const header = document.createElement('div');
      header.style.cssText = 'cursor:pointer; font-weight:600;';
      header.textContent = escapeCardHtml(org.org_name || '(Organization)');

      const detail = document.createElement('div');
      detail.className = 'individual-org-detail';
      detail.hidden = true;
      detail.style.cssText = 'border-top:1px solid var(--border); padding-top:12px; margin-top:12px; font-size:13px;';
      let detailHtml = '<div class="individual-hint">';
      if (org.city || org.state) {
        detailHtml += escapeCardHtml((org.city || '') + (org.city && org.state ? ', ' : '') + (org.state || ''));
      }
      if (org.website_url) {
        detailHtml += '<div style="margin-top:8px;"><a href="' + escapeCardHtml(org.website_url) + '" target="_blank" class="individual-link" style="font-size:12px;">Visit website →</a></div>';
      }
      detailHtml += '</div>';
      detail.innerHTML = detailHtml;

      card.appendChild(header);
      card.appendChild(detail);

      header.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
      });

      list.appendChild(card);
    });
    container.appendChild(list);
  } catch (e) {
    console.error('loadOrgs', e);
    container.innerHTML = '<div class="individual-empty">Error loading organizations</div>';
  }
}

// ─── ADD PENSION FUND / FINANCIAL REPRESENTATIVE ───
async function openAddPensionFund() {
  const overlay = document.getElementById('contribute-overlay');
  if (!overlay) return;

  const modal = overlay.querySelector('.app-modal');
  if (!modal) return;

  modal.innerHTML = '';

  const title = document.createElement('h3');
  title.textContent = 'Add your pension fund or fund manager';
  modal.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'individual-hint';
  desc.textContent = 'Select a major fund manager or pension system you use or participate in. They control voting on shares you own, directly or through a fund.';
  modal.appendChild(desc);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  try {
    const response = await fetch('/api/fiduciaries');
    if (!response.ok) throw new Error('Failed to load fiduciaries');
    const fiduciaries = await response.json();

    fiduciaries.forEach(fid => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'app-btn app-btn-outline';
      card.style.textAlign = 'left';
      card.style.padding = '12px';
      card.textContent = fid.name + (fid.jurisdiction && fid.jurisdiction !== 'US' ? ` (${fid.jurisdiction})` : '');
      card.onclick = async (e) => {
        e.preventDefault();
        await addFinancialRep(fid);
      };
      list.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading fiduciaries:', error);
    list.innerHTML = '<div class="individual-empty">Error loading pension funds and fund managers</div>';
  }

  modal.appendChild(list);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'app-btn app-btn-outline';
  closeBtn.textContent = 'Cancel';
  closeBtn.style.marginTop = '16px';
  closeBtn.onclick = () => {
    overlay.style.display = 'none';
  };
  modal.appendChild(closeBtn);

  overlay.style.display = 'flex';
}

async function addFinancialRep(fid) {
  try {
    const response = await fetch('/api/representatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fid.name,
        role: fid.role,
        level: fid.level,
        jurisdiction: fid.jurisdiction,
        country: fid.country,
        committees: fid.committees,
        phone: fid.phone,
        website: fid.website,
        source: fid.source,
        source_id: fid.source_id,
      }),
    });

    if (!response.ok) throw new Error('Failed to add financial representative');

    const overlay = document.getElementById('contribute-overlay');
    if (overlay) overlay.style.display = 'none';

    // Force a fresh /api/reps fetch and re-render the Financial tab's rep list
    allRepsData = [];
    await loadFinancialReps();
    updateVestSectionMeta();
  } catch (error) {
    console.error('Error adding financial representative:', error);
    alert('Could not add pension fund. Please try again.');
  }
}

// ─── CONTRIBUTED ORGS (LEDGER) ───
function openContributedOrgSheet() {
  contribSelectedMatch = null;
  if (contribSearchTimer) clearTimeout(contribSearchTimer);
  const overlay = document.getElementById('contributed-org-overlay');
  const input = document.getElementById('contrib-org-name');
  const list = document.getElementById('contrib-org-suggestions');
  const tipEl = document.getElementById('contrib-org-tip');
  if (!overlay || !input || !list) return;
  input.value = '';
  list.innerHTML = '';

  // Update tip with actual Causal address
  if (tipEl) {
    const causalAddr = String(window.CAUSAL_ADDRESS || '').trim();
    if (causalAddr) {
      tipEl.textContent = 'Tip: give orgs your ' + escapeHtml(causalAddr) + ' address to auto-log donations and actions in your Ledger.';
    }
  }
  input.oninput = function () {
    contribSelectedMatch = null;
    if (contribSearchTimer) clearTimeout(contribSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      list.innerHTML = '';
      return;
    }
    contribSearchTimer = setTimeout(async function () {
      try {
        const r = await fetch('/api/propublica/search-orgs?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
        const data = await r.json().catch(function () { return { results: [] }; });
        const items = Array.isArray(data.results) ? data.results : [];
        list.innerHTML = items.map(function (it, idx) {
          const where = [it.city, it.state].filter(Boolean).join(', ');
          return `<button type="button" class="app-btn app-btn-outline" style="width:100%; text-align:left; margin-bottom:8px; display:block;" onclick="selectContribSuggestion(${idx}, this)">
            <div style="font-weight:600;">${escapeHtml(it.name || '')}</div>
            <div style="font-size:12px;color:#6b7280;">${escapeHtml(where || 'Location unavailable')}</div>
          </button>`;
        }).join('');
        contribSuggestions = items;
      } catch (e) {
        list.innerHTML = '';
      }
    }, 400);
  };
  overlay.classList.add('active');
  setTimeout(function () { input.focus(); }, 20);
}

function selectContribSuggestion(idx, el) {
  const items = Array.isArray(contribSuggestions) ? contribSuggestions : [];
  const pick = items[idx];
  if (!pick) return;
  contribSelectedMatch = pick;
  const input = document.getElementById('contrib-org-name');
  const list = document.getElementById('contrib-org-suggestions');
  if (input) input.value = pick.name || '';
  if (list) {
    list.querySelectorAll('.app-btn').forEach((b) => b.style.borderColor = '#e5e7eb');
    if (el) el.style.borderColor = 'var(--accent)';
  }
}

function closeContributedOrgSheet() {
  const overlay = document.getElementById('contributed-org-overlay');
  if (overlay) overlay.classList.remove('active');
}

async function submitContributedOrg() {
  const input = document.getElementById('contrib-org-name');
  if (!input) return;
  const orgName = (input.value || '').trim();
  if (!orgName) {
    alert('Please enter an org name.');
    return;
  }
  try {
    const r = await fetch('/api/user/contributed-orgs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_name: orgName,
        selected_match: contribSelectedMatch || null,
      }),
    });
    const body = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      alert(body.error || 'Could not add org.');
      return;
    }
    closeContributedOrgSheet();
    if (typeof loadGiveFeed === 'function') loadGiveFeed();
    if (typeof loadMovesFeed === 'function') loadMovesFeed();
  } catch (e) {
    alert('Network error. Please try again.');
  }
}

// ─── DONATION LOGGING ───
function openOrgDonationSheet(orgId) {
  const id = Number(orgId);
  if (!Number.isInteger(id) || id < 1) return;
  movesDonationOrgId = id;
  const orgName = movesOrgNameById[id] || 'this organization';
  const desc = document.getElementById('org-donation-desc');
  const amountEl = document.getElementById('org-donation-amount');
  const dateEl = document.getElementById('org-donation-date');
  if (desc) desc.textContent = 'Record a donation for ' + orgName + '.';
  if (amountEl) amountEl.value = '';
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  const overlay = document.getElementById('org-donation-overlay');
  if (overlay) overlay.classList.add('active');
  if (amountEl) setTimeout(function () { amountEl.focus(); }, 40);
}

function closeOrgDonationSheet() {
  const overlay = document.getElementById('org-donation-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  const modal = overlay.querySelector('.app-modal');
  if (modal) modal.innerHTML = `
    <h3>Log a donation</h3>
    <p class="individual-hint" id="org-donation-desc">Record a donation for this organization.</p>
    <label>Amount</label>
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      <span style="padding:8px 12px; background:var(--surface-page); border:1px solid var(--border); border-radius:6px;">$</span>
      <input type="number" id="org-donation-amount" class="individual-form-input" min="0.01" step="0.01" inputmode="decimal" placeholder="25.00">
    </div>
    <label>Date</label>
    <input type="date" id="org-donation-date" class="individual-form-input" style="margin-bottom:16px;">
    <div class="individual-actions">
      <button type="button" class="app-btn-outline" onclick="closeOrgDonationSheet()">Cancel</button>
      <button type="button" class="app-btn" onclick="submitOrgDonation()">Submit</button>
    </div>
  `;
}

async function submitOrgDonation() {
  if (!movesDonationOrgId) return;
  const amountEl = document.getElementById('org-donation-amount');
  const dateEl = document.getElementById('org-donation-date');
  const amountNum = Number.parseFloat((amountEl && amountEl.value) ? String(amountEl.value).trim() : '');
  const dateVal = (dateEl && dateEl.value) ? String(dateEl.value) : new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    if (amountEl) amountEl.focus();
    return;
  }
  const amountCents = Math.round(amountNum * 100);
  try {
    const res = await fetch('/api/contributions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: movesDonationOrgId,
        amount_cents: amountCents,
        currency: 'USD',
        contributed_at: dateVal,
        source: 'manual'
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(function () { return {}; });
      alert(err.error || 'Could not save donation.');
      return;
    }
    const orgName = movesOrgNameById[movesDonationOrgId] || 'this organization';
    const amountLabel = '$' + amountNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    showDonationPrompt(orgName, amountLabel);
    // Giving list refresh happens on dismissal (donationPromptDone/Remind), not here —
    // showing the update while the success modal is still covering it read as premature.
  } catch (e) {
    alert('Network error. Please try again.');
  }
}

function showDonationPrompt(orgName, amountLabel) {
  const overlay = document.getElementById('org-donation-overlay');
  if (!overlay) return;
  const modal = overlay.querySelector('.app-modal');
  if (!modal) return;
  modal.innerHTML = `
    <div style="text-align:center; padding:8px 0 16px;">
      <div style="font-size:28px; margin-bottom:8px;">✓</div>
      <div style="font-weight:700; font-size:15px; margin-bottom:4px;">${escapeHtml(amountLabel)} logged</div>
      <div style="font-size:13px; color:var(--text-secondary);">for ${escapeHtml(orgName)}</div>
    </div>
    <div style="padding:16px; background:var(--surface-page); border-radius:8px; border:1px solid var(--border); margin-bottom:16px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:6px;">Make it a habit?</div>
      <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">Monthly donors stay active at 3× the rate of one-time givers.</div>
      <button type="button" class="app-btn" style="width:100%; margin-bottom:8px;" onclick="donationPromptRemind()">Set a monthly reminder</button>
      <button type="button" class="app-btn-outline" style="width:100%;" onclick="donationPromptDone()">Done</button>
    </div>
  `;
  overlay.classList.add('active');
}

function donationPromptRemind() {
  const orgId = movesDonationOrgId;
  const orgName = movesOrgNameById[orgId] || '';
  const existing = JSON.parse(localStorage.getItem('causal_giving_reminders') || '[]');
  const updated = existing.filter(function (r) { return r.orgId !== orgId; });
  updated.push({ orgId: orgId, orgName: orgName, setAt: new Date().toISOString() });
  localStorage.setItem('causal_giving_reminders', JSON.stringify(updated));
  const overlay = document.getElementById('org-donation-overlay');
  const modal = overlay && overlay.querySelector('.app-modal');
  if (modal) {
    modal.innerHTML = `
      <div style="text-align:center; padding:24px 0;">
        <div style="font-size:28px; margin-bottom:12px;">🗓</div>
        <div style="font-weight:700; font-size:15px; margin-bottom:6px;">Reminder set</div>
        <div style="font-size:13px; color:var(--text-secondary);">We'll prompt you next month for ${escapeHtml(orgName)}.</div>
      </div>
    `;
  }
  setTimeout(function () { closeOrgDonationSheet(); loadGivingHistory(); }, 1800);
}

function donationPromptDone() {
  closeOrgDonationSheet();
  loadGivingHistory();
}

async function openSubscribedOrgDonationPicker() {
  let rows = [];
  try {
    const r = await fetch('/api/give/orgs', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('orgs');
    const text = await r.text();
    rows = text ? JSON.parse(text) : [];
  } catch (_) {
    alert('Could not load your organizations.');
    return;
  }
  const filtered = Array.isArray(rows) ? rows.filter((o) => Number.isInteger(Number(o.id))) : [];
  const orgs = typeof dedupeGiveOrgs === 'function' ? dedupeGiveOrgs(filtered) : filtered;
  if (!orgs.length) {
    alert('Add an organization first.');
    return;
  }
  const list = document.getElementById('org-donation-picker-list');
  const overlay = document.getElementById('org-donation-picker-overlay');
  if (!list || !overlay) return;
  list.innerHTML = orgs.map(function (o) {
    const id = Number(o.id);
    const name = escapeHtml(String(o.name || 'Organization'));
    return '<button type="button" class="app-btn app-btn-outline" style="width:100%; text-align:left; margin-bottom:8px; display:block;" onclick="pickSubscribedOrgDonation(' + id + ', \'' + String(o.name || '').replace(/'/g, "\\'") + '\')">' + name + '</button>';
  }).join('');
  overlay.classList.add('active');
}

function closeSubscribedOrgDonationPicker() {
  const overlay = document.getElementById('org-donation-picker-overlay');
  const list = document.getElementById('org-donation-picker-list');
  if (overlay) overlay.classList.remove('active');
  if (list) list.innerHTML = '';
}

// ─── CONTACT-YOUR-REP PICKER ───
// Lets the user explicitly pick which rep an action is for, instead of trying to auto-match
// (every prior attempt at that — committee/turnaround mapping, rep_targets name-matching,
// keyword-guessing the chamber — produced wrong or missing matches).
let contactRepPickerActionId = null;

async function openContactRepPicker(actionId) {
  contactRepPickerActionId = String(actionId);
  const reps = await ensureRepsDataLoaded();
  const elected = Array.isArray(reps) ? reps.filter((r) => String(r.level || '').toLowerCase() !== 'financial') : [];
  if (!elected.length) {
    alert('No reps found. Add your location in Settings, or add reps under Elected.');
    return;
  }
  const list = document.getElementById('contact-rep-picker-list');
  const overlay = document.getElementById('contact-rep-picker-overlay');
  if (!list || !overlay) return;
  list.innerHTML = elected.map(function (r) {
    const name = escapeHtml(String(r.name || '(Rep)'));
    const office = escapeHtml(String(r.office_name || ''));
    return '<button type="button" class="app-btn app-btn-outline" style="width:100%; text-align:left; margin-bottom:8px; display:block;" onclick="pickContactRep(' + Number(r.id) + ', \'' + String(r.name || '').replace(/'/g, "\\'") + '\')">' +
      name + (office ? ' <span class="individual-hint" style="font-size:12px;">— ' + office + '</span>' : '') +
      '</button>';
  }).join('');
  overlay.classList.add('active');
}

function closeContactRepPicker() {
  const overlay = document.getElementById('contact-rep-picker-overlay');
  const list = document.getElementById('contact-rep-picker-list');
  if (overlay) overlay.classList.remove('active');
  if (list) list.innerHTML = '';
  contactRepPickerActionId = null;
}

async function pickContactRep(repId, repName) {
  const actionId = contactRepPickerActionId;
  closeContactRepPicker();
  if (!actionId) return;
  try {
    const res = await fetch('/api/reps/' + Number(repId) + '/contact-actions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: Number(actionId) }),
    });
    if (!res.ok) throw new Error('contact-actions ' + res.status);
    const data = await res.json();
    showMovesToast(data.already_added ? 'Already added for ' + repName : 'Added — see it under ' + repName + ' in Elected');
  } catch (e) {
    console.error('pickContactRep', e);
    alert('Could not add this action for ' + repName + '.');
  }
}

function pickSubscribedOrgDonation(orgId, orgName) {
  const id = Number(orgId);
  if (!Number.isInteger(id) || id < 1) return;
  movesOrgNameById[id] = String(orgName || '');
  closeSubscribedOrgDonationPicker();
  openOrgDonationSheet(id);
}

// ─── CALL POPUP ───
function openCallPopup(name, phone) {
  document.getElementById('call-popup-name').textContent = name;
  document.getElementById('call-popup-number').textContent = phone;
  document.getElementById('call-popup-dial').href = 'tel:' + phone.replace(/[^0-9+]/g, '');
  document.getElementById('call-popup-overlay').classList.add('active');
}

function closeCallPopup() {
  document.getElementById('call-popup-overlay').classList.remove('active');
}

// ─── LEDGER PANEL ───
function toggleLedgerOrgResponses() {
  const panel = document.getElementById('ledger-inbound-panel');
  const toggle = document.getElementById('ledger-inbound-toggle');
  if (!panel || !toggle) return;
  const open = panel.hasAttribute('hidden');
  if (open) {
    panel.removeAttribute('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    loadLedgerInboundEmails();
  } else {
    panel.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
  }
}

function loadLedgerData() {
  if (typeof loadLedgerPosition === 'function') loadLedgerPosition();
  if (typeof loadLedgerImpact === 'function') loadLedgerImpact();
  if (typeof loadPersonalBalanceSheet === 'function') loadPersonalBalanceSheet();
  loadCompletedActions();
  loadLedgerInboundEmails();
  loadGivingHistory();
}

function formatCentsAsCurrency(cents, currency) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency || 'USD' });
}

async function loadGivingHistory() {
  const list = document.getElementById('giving-history-list');
  if (!list) return;
  list.innerHTML = '<div class="individual-hint">Loading…</div>';
  try {
    const r = await fetch('/api/give/history', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('bad response');
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = '<div class="individual-empty" style="padding:24px 0;">No donations logged yet — give or log one from Proxies &gt; Advocates.</div>';
      return;
    }

    // Default sort: by org (alphabetical), then within each org by calendar year
    // (newest first) with a year subtotal, then by date (newest first) within year.
    const byOrg = new Map();
    rows.forEach((row) => {
      const orgKey = row.org_id != null ? 'id:' + row.org_id : 'name:' + (row.org_name || '').trim().toLowerCase();
      const orgName = (row.org_name || '').trim() || 'Unknown organization';
      if (!byOrg.has(orgKey)) byOrg.set(orgKey, { name: orgName, rows: [] });
      byOrg.get(orgKey).rows.push(row);
    });
    const orgs = Array.from(byOrg.values()).sort((a, b) => a.name.localeCompare(b.name));

    let html = '';
    orgs.forEach((org) => {
      const byYear = new Map();
      org.rows.forEach((row) => {
        const d = row.contributed_at ? new Date(row.contributed_at) : null;
        const year = d && !isNaN(d.getTime()) ? d.getFullYear() : 'Undated';
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(row);
      });
      const years = Array.from(byYear.keys()).sort((a, b) => {
        if (a === 'Undated') return 1;
        if (b === 'Undated') return -1;
        return b - a;
      });

      html += '<div style="margin-bottom:20px;">';
      html += '<div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">' + escapeHtml(org.name) + '</div>';

      years.forEach((year) => {
        const yearRows = byYear.get(year).slice().sort((a, b) => new Date(b.contributed_at || 0) - new Date(a.contributed_at || 0));
        const yearTotalCents = yearRows.reduce((sum, row) => sum + (Number.parseInt(row.amount_cents, 10) || 0), 0);

        html += '<div class="volunteer-opportunities-heading" style="margin-top:10px; margin-bottom:2px; display:flex; justify-content:space-between;">';
        html += '<span>' + year + '</span>';
        html += '<span>' + formatCentsAsCurrency(yearTotalCents, yearRows[0].currency) + '</span>';
        html += '</div>';

        yearRows.forEach((row) => {
          const d = row.contributed_at ? new Date(row.contributed_at) : null;
          const dateStr = d && !isNaN(d.getTime())
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          const cents = Number.parseInt(row.amount_cents, 10) || 0;
          const amountLabel = formatCentsAsCurrency(cents, row.currency);
          const escapedAmount = amountLabel.replace(/'/g, "\\'");
          const escapedOrgName = org.name.replace(/'/g, "\\'");
          html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-subtle);">' +
            '<div style="font-size:12px; color:var(--text-secondary);">' + dateStr + '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<div style="font-size:13px; color:var(--text-primary);">' + amountLabel + '</div>' +
              '<button type="button" onclick="deleteContribution(' + row.id + ', \'' + escapedAmount + '\', \'' + escapedOrgName + '\')" title="Remove this donation" style="background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:14px; padding:2px 4px; line-height:1;">×</button>' +
            '</div>' +
            '</div>';
        });
      });

      html += '</div>';
    });

    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = '<div class="individual-error"><span>⚠ Could not load giving history.</span><button onclick="loadGivingHistory()">Retry</button></div>';
  }
}

async function deleteContribution(id, amountLabel, orgName) {
  const contributionId = Number(id);
  if (!Number.isInteger(contributionId) || contributionId < 1) return;
  const label = amountLabel && orgName ? (amountLabel + ' to ' + orgName) : 'this donation';
  if (!confirm('Remove ' + label + '? This cannot be undone.')) return;
  try {
    const r = await fetch('/api/contributions/' + contributionId, { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) throw new Error('delete failed');
    loadGivingHistory();
  } catch (e) {
    alert('Could not remove this donation. Please try again.');
  }
}

async function loadCompletedActions() {
  const list = document.getElementById('completed-actions-list');
  if (!list) return;
  list.innerHTML = '<div class="individual-hint">Loading…</div>';
  try {
    const r = await fetch('/api/user/completed-actions', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('bad response');
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = '<div class="individual-empty" style="padding:24px 0;">No completed actions yet. Mark actions done in the Action tab.</div>';
      return;
    }
    list.innerHTML = rows.map(function (row) {
      const d = row.completed_at ? new Date(row.completed_at) : null;
      const dateStr = d && !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const org = escapeHtml((row.org_name || '').trim());
      const ask = escapeHtml((row.action_ask || '').trim() || 'Action completed');
      return '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--border-subtle);">' +
        '<div style="flex:1; min-width:0; padding-right:12px;">' +
        '<div style="font-size:13px; color:var(--text-primary); line-height:1.4;">' + ask + '</div>' +
        (org ? '<div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">' + org + '</div>' : '') +
        '</div>' +
        '<div style="font-size:11px; color:var(--text-secondary); flex-shrink:0; white-space:nowrap;">' + dateStr + '</div>' +
        '</div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="individual-error"><span>⚠ Could not load completed actions.</span><button onclick="loadCompletedActions()">Retry</button></div>';
  }
}

async function loadLedgerInboundEmails() {
  const list = document.getElementById('ledger-inbound-list');
  if (!list) return;
  list.innerHTML = '<div class="individual-hint">Loading…</div>';
  try {
    const r = await fetch('/api/user/inbound-emails', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('bad response');
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = '<div class="individual-empty">No organization responses logged yet.</div>';
      return;
    }
    list.innerHTML = rows
      .map(function (row) {
        const d = row.received_at ? new Date(row.received_at) : null;
        const dateStr =
          d && !isNaN(d.getTime())
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
        const fromName = escapeHtml((row.from_name || '').trim() || row.from_address || '—');
        const subj = escapeHtml((row.subject || '').trim() || '(no subject)');
        const prevRaw = (row.preview || '').trim();
        const previewEsc = escapeHtml(prevRaw);
        return (
          '<div style="padding:10px 0; border-bottom:1px solid var(--border-subtle); cursor:pointer;" onclick="this.querySelector(\'.ledger-inbound-preview\')?.toggleAttribute(\'hidden\')">' +
          '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px;">' +
          '<div style="font-size:13px; font-weight:500; color:var(--text-primary);">' + fromName + '</div>' +
          '<div style="font-size:11px; color:var(--text-secondary); flex-shrink:0; margin-left:12px;">' + escapeHtml(dateStr) + '</div>' +
          '</div>' +
          '<div style="font-size:12px; color:var(--text-secondary);">' + subj + '</div>' +
          (prevRaw ? '<div class="ledger-inbound-preview individual-hint" hidden style="border-top:1px solid var(--border); padding-top:6px; margin-top:6px; font-size:12px;">' + previewEsc + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  } catch (e) {
    list.innerHTML = '<div class="individual-empty">Could not load the response log.</div>';
  }
}

// Normalize name for matching: lowercase, extract last name
function normalizeRepName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

// Check if rep_target name matches a user rep (case-fold, last-name match with first-name/nickname variants)
function matchesUserRep(targetName, userReps) {
  if (!targetName) return null;
  const targetLower = targetName.trim().toLowerCase();
  const targetParts = targetLower.split(/\s+/);
  const targetLastName = targetParts[targetParts.length - 1];
  const targetFirstName = targetParts[0] || '';

  for (const rep of userReps) {
    const repLower = rep.name.trim().toLowerCase();
    const repParts = repLower.split(/\s+/);
    const repLastName = repParts[repParts.length - 1];
    const repFirstName = repParts[0] || '';

    // Match on last name + first name/initial
    if (repLastName === targetLastName) {
      // Check first name match or initial match
      if (targetFirstName === repFirstName ||
          targetFirstName.charAt(0) === repFirstName.charAt(0) ||
          repFirstName.startsWith(targetFirstName)) {
        return rep;
      }
    }
  }
  return null;
}

// ─── EXPORT TO WINDOW ───
window.loadMovesHomeData = loadMovesHomeData;
window.loadMovesFeedData = loadMovesFeed;
window.loadReps = loadReps;
window.loadRaces = loadRaces;
window.loadFinancialReps = loadFinancialReps;
window.openRepProfile = openRepProfile;
window.closeRepProfile = closeRepProfile;
window.takeFinancialRepPledge = takeFinancialRepPledge;
window.updateFinancialRepPledge = updateFinancialRepPledge;
window.renderVolunteerPlatformLinks = renderVolunteerPlatformLinks;
window.buildIdealistUrl = buildIdealistUrl;
window.openVolunteerSubmitModal = openVolunteerSubmitModal;
window.closeVolunteerSubmitModal = closeVolunteerSubmitModal;
window.createVolunteerSubmitModal = createVolunteerSubmitModal;
window.submitVolunteerOpportunity = submitVolunteerOpportunity;
window.getVolunteerUserRegion = getVolunteerUserRegion;
window.loadOrgs = loadOrgs;
window.markDoneFromCard = markDoneFromCard;
window.dismissCard = dismissCard;
window.movesCopyOpenLaunch = movesCopyOpenLaunch;
window.closeAddressExplainerModal = closeAddressExplainerModal;
window.continueFromAddressExplainer = continueFromAddressExplainer;
window.openMovesRowToPostopenFromBtn = openMovesRowToPostopenFromBtn;
window.openContributedOrgSheet = openContributedOrgSheet;
window.closeContributedOrgSheet = closeContributedOrgSheet;
window.submitContributedOrg = submitContributedOrg;
window.selectContribSuggestion = selectContribSuggestion;
window.openOrgDonationSheet = openOrgDonationSheet;
window.closeOrgDonationSheet = closeOrgDonationSheet;
window.submitOrgDonation = submitOrgDonation;
window.donationPromptRemind = donationPromptRemind;
window.donationPromptDone = donationPromptDone;
window.openSubscribedOrgDonationPicker = openSubscribedOrgDonationPicker;
window.closeSubscribedOrgDonationPicker = closeSubscribedOrgDonationPicker;
window.pickSubscribedOrgDonation = pickSubscribedOrgDonation;
window.openContactRepPicker = openContactRepPicker;
window.closeContactRepPicker = closeContactRepPicker;
window.pickContactRep = pickContactRep;
window.openCallPopup = openCallPopup;
window.closeCallPopup = closeCallPopup;
window.toggleLedgerOrgResponses = toggleLedgerOrgResponses;
window.loadCompletedActions = loadCompletedActions;
window.loadLedgerData = loadLedgerData;
window.loadGivingHistory = loadGivingHistory;
window.deleteContribution = deleteContribution;
window.loadLedgerInboundEmails = loadLedgerInboundEmails;

