/* budget-workspace.js — Coordinator for the coop budget page.
 * Handles org loading, filter bar (FY / program / grant), tab switching,
 * stat strip, and panel management. Exposes shared state via window.OrganizationalBudget.
 *
 * Program selector is a single-select: one program at a time for budget entry.
 * Grant selector is a single-select: filters budget to one grant at a time.
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  // ── State ────────────────────────────────────────────────────────────────────
  let currentSlug      = '';
  let currentIsOrgAdmin = false; // exposed via getState().isOrgAdmin, read by budget-settings.js
  let fiscalStartMonth = 1;   // 1=Jan; derived from org.fiscal_year_end_month
  let programsCache    = [];
  let grantsCache      = [];
  let selectedProgramId = null;  // single program (null = all / no filter)
  let workspaceSection = 'budget';
  let budgetUiWired    = false;
  let showCents        = false;
  let viewMode         = 'totals'; // 'totals' (default) | 'monthly'

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const errEl      = document.getElementById('organizational-org-error');
  const loadingEl  = document.getElementById('organizational-org-loading');
  const dashEl     = document.getElementById('organizational-org-dashboard');
  const budgetFyEl = document.getElementById('organizational-budget-fy');
  const programEl  = document.getElementById('organizational-budget-program');  // <select>
  const grantEl    = document.getElementById('organizational-budget-grant');     // <select>
  const statStrip  = document.getElementById('organizational-budget-stat-strip');

  const tabButtons = document.querySelectorAll('.organizational-budget-workspace-tabs .organizational-tab');
  // Settings lives outside the tab row as a gear icon (moved 2026-09-15) -- tracked separately
  // since it isn't matched by the `.organizational-tab` selector above, but still needs the
  // same active-state toggle and click-to-switchTab wiring as its former tab-button self.
  const settingsIconBtn = document.getElementById('organizational-budget-settings-btn');
  const filterBar = document.getElementById('organizational-budget-filter-bar');
  const panes = {
    budget:           document.getElementById('organizational-budget-tab-budget'),
    personnel:        document.getElementById('organizational-budget-tab-personnel'),
    insurance:        document.getElementById('organizational-budget-tab-insurance'),
    schedules:        document.getElementById('organizational-budget-tab-schedules'),
    'indirect-costs': document.getElementById('organizational-budget-tab-indirect-costs'),
    scenarios:        document.getElementById('organizational-budget-tab-scenarios'),
    settings:         document.getElementById('organizational-budget-tab-settings'),
  };

  // Sliding panels shared by insurance / schedules / indirect / personnel
  const itemPanel        = document.getElementById('organizational-item-panel');
  const itemPanelOverlay = document.getElementById('organizational-item-panel-overlay');
  const itemPanelTitle   = document.getElementById('organizational-item-panel-title');
  const itemPanelError   = document.getElementById('organizational-item-panel-error');
  const itemPanelBody    = document.getElementById('organizational-item-panel-body');

  const personnelPanel        = document.getElementById('organizational-personnel-panel');
  const personnelPanelOverlay = document.getElementById('organizational-personnel-panel-overlay');
  const personnelPanelTitle   = document.getElementById('organizational-personnel-panel-title');
  const personnelPanelError   = document.getElementById('organizational-personnel-panel-error');
  const personnelPanelBody    = document.getElementById('organizational-personnel-panel-body');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function currentFY() {
    const n = Number.parseInt(budgetFyEl ? budgetFyEl.value : '', 10);
    return Number.isInteger(n) ? n : new Date().getFullYear();
  }

  function currentGrantId() {
    return grantEl?.value ? Number(grantEl.value) : null;
  }

  function showPageError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function updateFyLabel() {
    const label = document.getElementById('organizational-budget-fy-label');
    if (label && budgetFyEl) {
      const n = Number.parseInt(budgetFyEl.value, 10);
      if (Number.isInteger(n)) label.textContent = 'FY ' + n;
    }
  }

  function applyFyFromQuery() {
    const sp  = new URLSearchParams(window.location.search);
    const raw = sp.get('fy') || sp.get('fiscal_year');
    if (raw && budgetFyEl) {
      const n = Number.parseInt(raw, 10);
      if (Number.isInteger(n) && n >= 1900 && n <= 2200) budgetFyEl.value = String(n);
    }
  }

  function syncUrlState() {
    if (!currentSlug || !window.history?.replaceState) return;
    const sp = new URLSearchParams(window.location.search);
    ['fy', 'fiscal_year', 'view', 'programs'].forEach(k => sp.delete(k));
    const fy = currentFY();
    if (fy >= 1900 && fy <= 2200) sp.set('fy', String(fy));
    const qs   = sp.toString();
    const path = '/organizational/o/' + encodeURIComponent(currentSlug) + '/budget' + (qs ? '?' + qs : '');
    if (path !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', path);
    }
  }

  // ── Shared state API ─────────────────────────────────────────────────────────
  // Other modules (grid, personnel, schedules) read state here instead of
  // duplicating DOM lookups.
  window.OrganizationalBudget.getState = function () {
    return {
      slug:             currentSlug,
      isOrgAdmin:       currentIsOrgAdmin,
      fy:               currentFY(),
      programId:        selectedProgramId,
      grantId:          currentGrantId(),
      programs:         programsCache,
      grants:           grantsCache,
      fiscalStartMonth: fiscalStartMonth,
      showCents:        showCents,
      viewMode:         viewMode,
    };
  };

  window.OrganizationalBudget.reloadGrid      = () => loadBudgetVsActualGrid();
  window.OrganizationalBudget.renderStatStrip = renderStatStrip;

  window.OrganizationalBudget.getItemPanel = () =>
    ({ panel: itemPanel, overlay: itemPanelOverlay, title: itemPanelTitle, error: itemPanelError, body: itemPanelBody });

  window.OrganizationalBudget.getPersonnelPanel = () =>
    ({ panel: personnelPanel, overlay: personnelPanelOverlay, title: personnelPanelTitle, error: personnelPanelError, body: personnelPanelBody });

  // ── Sliding panels ───────────────────────────────────────────────────────────
  // Single source of truth for closing panels: always clears the class from
  // BOTH the panel and its overlay. (Previously this only cleared the panel,
  // leaving the overlay's dim/click-block active forever — the page-shaded-
  // until-reload bug.)
  const PANELS = {
    item:      { panel: () => itemPanel,      overlay: () => itemPanelOverlay },
    personnel: { panel: () => personnelPanel, overlay: () => personnelPanelOverlay },
  };

  function closePanel(key) {
    const p = PANELS[key];
    if (!p) return;
    p.panel()?.classList.remove('organizational-panel-is-open');
    p.overlay()?.classList.remove('organizational-panel-is-open');
  }
  function closeAllPanels() {
    Object.keys(PANELS).forEach(closePanel);
  }

  function closeItemPanel()      { closePanel('item'); }
  function closePersonnelPanel() { closePanel('personnel'); }

  window.OrganizationalBudget.panel = { close: closePanel, closeAll: closeAllPanels };

  document.getElementById('organizational-item-panel-close')?.addEventListener('click', closeItemPanel);
  document.getElementById('organizational-personnel-panel-close')?.addEventListener('click', closePersonnelPanel);
  itemPanelOverlay?.addEventListener('click', closeItemPanel);
  personnelPanelOverlay?.addEventListener('click', closePersonnelPanel);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (itemPanel?.classList.contains('organizational-panel-is-open'))      { closeItemPanel();      return; }
    if (personnelPanel?.classList.contains('organizational-panel-is-open')) { closePersonnelPanel(); return; }
  });

  // ── Program select ────────────────────────────────────────────────────────────
  // Single-select: budget entry works one program at a time.
  function buildProgramSelect() {
    if (!programEl) return;
    const escH = window.escapeHtml || (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]));
    const prev = programEl.value;
    programEl.innerHTML = '<option value="">All programs</option>';
    programsCache.forEach(p => {
      const o = document.createElement('option');
      o.value = String(p.id);
      o.textContent = escH(p.name || 'Program ' + p.id);
      programEl.appendChild(o);
    });
    if (prev && [...programEl.options].some(o => o.value === prev)) {
      programEl.value = prev;
    } else if (programsCache.length === 1) {
      programEl.value = String(programsCache[0].id);
    }
    selectedProgramId = programEl.value ? Number(programEl.value) : null;
  }

  // ── Grant select ──────────────────────────────────────────────────────────────
  function buildGrantSelect() {
    if (!grantEl) return;
    const escH = window.escapeHtml || (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]));
    const prev = grantEl.value;
    grantEl.innerHTML = '<option value="">No grant</option>';
    grantsCache.forEach(g => {
      const o = document.createElement('option');
      o.value = String(g.id);
      o.textContent = escH((g.name || 'Grant') + (g.funder ? ' — ' + g.funder : ''));
      grantEl.appendChild(o);
    });
    if (prev && [...grantEl.options].some(o => o.value === prev)) grantEl.value = prev;
  }

  async function loadPrograms(slug) {
    const out = await window.apiJson?.('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs', { method: 'GET' });
    programsCache = (out?.res.ok && Array.isArray(out.data.programs)) ? out.data.programs : [];
    buildProgramSelect();
  }

  async function loadGrants(slug) {
    const out = await window.apiJson?.('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants', { method: 'GET' });
    grantsCache = (out?.res.ok && Array.isArray(out.data.grants)) ? out.data.grants : [];
    buildGrantSelect();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────────
  function switchTab(section) {
    closeAllPanels();
    if (section !== 'budget') window.OrganizationalBudget.grid?.closeInlinePanel?.();
    if (!panes[section]) return;
    workspaceSection = section;
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.section === section));
    settingsIconBtn?.classList.toggle('active', section === 'settings');
    if (filterBar) filterBar.hidden = (section === 'settings');
    Object.values(panes).forEach(p => { if (p) p.hidden = true; });
    panes[section].hidden = false;

    // Visible only while the grid actually overflows horizontally — see
    // updateTopScrollVisibility() in budget-grid.js, run after every render.
    const topScrollRow = document.getElementById('organizational-budget-top-scroll-row');
    if (topScrollRow && section !== 'budget') topScrollRow.hidden = true;
    else window.OrganizationalBudget.grid?.updateTopScrollVisibility?.();

    if (section === 'personnel'      && window.OrganizationalBudget.personnel) window.OrganizationalBudget.personnel.render();
    else if (section === 'schedules'      && window.OrganizationalBudget.schedules) window.OrganizationalBudget.schedules.renderSchedules();
    else if (section === 'insurance'      && window.OrganizationalBudget.schedules) window.OrganizationalBudget.schedules.renderInsurance();
    else if (section === 'indirect-costs' && window.OrganizationalBudget.indirect)  window.OrganizationalBudget.indirect.render();
    else if (section === 'scenarios'      && window.OrganizationalBudget.scenarios) window.OrganizationalBudget.scenarios.render();
    else if (section === 'settings'       && window.OrganizationalBudget.settings)  window.OrganizationalBudget.settings.render();
  }

  // ── Budget grid load ──────────────────────────────────────────────────────────
  async function loadBudgetVsActualGrid() {
    if (!currentSlug || !window.OrganizationalBudget.grid) return;
    await window.OrganizationalBudget.grid.load();
    syncUrlState();
  }

  // ── Stat strip ────────────────────────────────────────────────────────────────
  function renderStatStrip(data) {
    if (!statStrip) return;
    const fmtUsd = cents => {
      const n = Number(cents);
      return Number.isFinite(n)
        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100)
        : '—';
    };
    const escH = window.escapeHtml || (s => String(s || ''));
    let revB = 0, revA = 0, expB = 0, expA = 0;
    (data.lines || []).forEach(L => {
      const t = String(L.type || '').toLowerCase();
      const b = Number(L.approved_cents) || 0;
      const a = Number(L.ytd_actual_cents) || 0;
      if (t === 'income')  { revB += b; revA += a; }
      if (t === 'expense') { expB += b; expA += a; }
    });
    const netB    = revB - expB;
    const netA    = revA - expA;
    const expPct  = expB > 0 ? Math.round((expA / expB) * 100) : 0;
    const expPace = Math.round(((new Date().getMonth() + 1) / 12) * 100);

    const card = (label, val, sub, status) =>
      '<div class="organizational-budget-stat-item">'
      + '<div class="organizational-budget-stat-label">' + escH(label) + '</div>'
      + '<div class="organizational-budget-stat-value">'  + escH(val)   + '</div>'
      + '<div class="organizational-budget-stat-secondary organizational-stat-' + status + '">' + escH(sub) + '</div>'
      + '</div>';

    statStrip.innerHTML = [
      card('Total Revenue',   fmtUsd(revB),  'Collected: ' + fmtUsd(revA), revA >= revB * 0.9 ? 'good' : revA < revB * 0.5 ? 'danger' : 'warn'),
      card('Total Expenses',  fmtUsd(expB),  'Spent: '     + fmtUsd(expA), expA <= expB ? 'good' : 'danger'),
      card('Net Position',    fmtUsd(netB),  'YTD: '       + fmtUsd(netA), netA >= 0 ? 'good' : 'danger'),
      card('Budget Consumed', expPct + '%',  'Expected: '  + expPace + '%', Math.abs(expPct - expPace) <= 10 ? 'good' : expPct > expPace ? 'warn' : 'good'),
    ].join('');
  }

  // ── Wire UI once ──────────────────────────────────────────────────────────────
  function wireBudgetUiOnce() {
    if (budgetUiWired) return;
    budgetUiWired = true;

    // FY nav
    document.getElementById('organizational-budget-fy-prev')?.addEventListener('click', () => {
      const n = currentFY();
      if (n > 1900 && budgetFyEl) { budgetFyEl.value = String(n - 1); updateFyLabel(); syncUrlState(); loadBudgetVsActualGrid(); }
    });
    document.getElementById('organizational-budget-fy-next')?.addEventListener('click', () => {
      const n = currentFY();
      if (n < 2200 && budgetFyEl) { budgetFyEl.value = String(n + 1); updateFyLabel(); syncUrlState(); loadBudgetVsActualGrid(); }
    });

    // Program select change
    if (programEl) {
      programEl.addEventListener('change', () => {
        selectedProgramId = programEl.value ? Number(programEl.value) : null;
        if (window.OrganizationalBudget.grid) window.OrganizationalBudget.grid.invalidateScheduleCache();
        loadBudgetVsActualGrid();
      });
    }

    // Grant select change: auto-select the grant's primary program
    if (grantEl) {
      grantEl.addEventListener('change', () => {
        const gid = parseInt(grantEl.value, 10);
        if (gid && !Number.isNaN(gid)) {
          const g = grantsCache.find(g => g.id === gid);
          if (g?.primary_program_id && programEl) {
            programEl.value  = String(g.primary_program_id);
            selectedProgramId = g.primary_program_id;
          }
        }
        if (window.OrganizationalBudget.grid) window.OrganizationalBudget.grid.invalidateScheduleCache();
        loadBudgetVsActualGrid();
      });
    }

    // Tab buttons
    tabButtons.forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.dataset.section) switchTab(this.dataset.section);
      });
    });
    settingsIconBtn?.addEventListener('click', () => switchTab('settings'));

    // View mode toggle: Totals (default) vs Monthly grid
    const viewModeToggle = document.getElementById('organizational-budget-view-mode-toggle');
    if (viewModeToggle) {
      viewModeToggle.addEventListener('click', e => {
        const btn = e.target.closest('[data-view-mode]');
        if (!btn || btn.classList.contains('active')) return;
        viewMode = btn.dataset.viewMode;
        viewModeToggle.querySelectorAll('.organizational-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        window.OrganizationalBudget.grid?.render?.();
      });
    }

    // Show/hide cents toggle
    const centsBtn = document.getElementById('organizational-budget-toggle-cents');
    if (centsBtn) {
      centsBtn.addEventListener('click', () => {
        showCents = !showCents;
        centsBtn.textContent = showCents ? 'Hide decimals' : 'Show decimals';
        centsBtn.classList.toggle('active', showCents);
        loadBudgetVsActualGrid();
      });
    }

    // Resize → recalculate scroll height + whether the top scrollbar is needed
    window.addEventListener('resize', () => {
      window.OrganizationalBudget.grid?.updateScrollHeight?.();
      window.OrganizationalBudget.grid?.updateTopScrollVisibility?.();
    });

    // Scroll chevrons (left/right)
    const gs = document.querySelector('.organizational-budget-grid-with-chevrons .organizational-budget-grid-scroll');
    const lb = document.getElementById('organizational-budget-scroll-left');
    const rb = document.getElementById('organizational-budget-scroll-right');
    if (gs) {
      let scrollTimer = null;
      const startScroll = dir => {
        gs.scrollLeft += dir * 300;
        scrollTimer = setInterval(() => { gs.scrollLeft += dir * 60; }, 40);
      };
      const stopScroll = () => { if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; } };
      [lb, rb].forEach(btn => {
        if (!btn) return;
        const dir = btn.id === 'organizational-budget-scroll-left' ? -1 : 1;
        btn.addEventListener('mousedown', e => { e.preventDefault(); stopScroll(); startScroll(dir); });
        btn.addEventListener('mouseleave', stopScroll);
      });
      document.addEventListener('mouseup', stopScroll);
    }

    // Escape: close popovers / dropdowns
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeOrganizationalDropdown(); }
    });

    // Click outside overlays
    document.addEventListener('click', e => {
      if (e.target.classList.contains('organizational-overlay')) closeOrganizationalOverlay();
    });
  }

  // ── Org load ──────────────────────────────────────────────────────────────────
  async function load() {
    const match = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/budget\/?$/);
    const slug  = match ? decodeURIComponent(match[1]) : '';
    if (!slug) {
      showPageError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    showPageError('');

    if (!window.apiJson) { showPageError('Utilities not loaded.'); return; }

    const out = await window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!out || out.res.status === 404) {
      if (loadingEl) loadingEl.hidden = true;
      showPageError(out?.data?.error || 'Organization not found.');
      return;
    }
    if (!out.res.ok) {
      if (loadingEl) loadingEl.hidden = true;
      showPageError(out.data?.error || 'Could not load workspace.');
      return;
    }
    const org = out.data.org;
    if (!org) { if (loadingEl) loadingEl.hidden = true; showPageError('Invalid response.'); return; }
    currentIsOrgAdmin = isAdminRole(org.role);

    // Fiscal year start month from org settings
    if (org.fiscal_year_end_month) {
      fiscalStartMonth = (Number(org.fiscal_year_end_month) % 12) + 1;
    }

    window.OrganizationalSidebar?.setWorkspaceName?.(org.display_name || '—');
    window.OrganizationalHeader?.setOrg?.(org.display_name || '—');

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl)    dashEl.hidden    = false;

    await Promise.all([loadPrograms(slug), loadGrants(slug)]);
    wireBudgetUiOnce();

    if (budgetFyEl && !budgetFyEl.value) budgetFyEl.value = String(new Date().getFullYear());
    applyFyFromQuery();
    updateFyLabel();

    await loadBudgetVsActualGrid();
  }

  // ── Header chrome ─────────────────────────────────────────────────────────────
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me       = await res.json();
        const isWorker = ['independent_worker', 'org_worker'].includes(me.user_type || '');
        const icon     = document.getElementById('organizational-icon');
        if (icon) icon.style.display = isWorker ? 'flex' : 'none';

      }
    } catch (_) { /* non-critical */ }

    bindOrganizationalDropdownOutsideClick();
  })();

  // ── Dropdown / overlay helpers (called from HTML onclick attrs) ───────────────
  function closeOrganizationalDropdown() {
    const dd = document.getElementById('organizational-dropdown');
    const ic = document.getElementById('organizational-icon');
    if (dd) { dd.hidden = true; dd.setAttribute('aria-hidden', 'true'); }
    if (ic) ic.setAttribute('aria-expanded', 'false');
  }
  function toggleOrganizationalDropdown(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('organizational-dropdown');
    const ic = document.getElementById('organizational-icon');
    if (!dd) return;
    const open = dd.hidden;
    dd.hidden = !open;
    dd.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (ic) ic.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  let ddBound = false;
  function bindOrganizationalDropdownOutsideClick() {
    if (ddBound) return; ddBound = true;
    document.addEventListener('click', e => {
      const dd = document.getElementById('organizational-dropdown');
      const ic = document.getElementById('organizational-icon');
      if (!dd || dd.hidden || ic?.contains(e.target) || dd.contains(e.target)) return;
      closeOrganizationalDropdown();
    });
  }

  function openOrganizationalOverlay(type) {
    const el = document.getElementById('organizational-overlay-' + type);
    if (el) {
      el.hidden = false; el.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (typeof loadOrganizationalOverlayData === 'function') loadOrganizationalOverlayData(type);
    }
  }
  function closeOrganizationalOverlay() {
    document.querySelectorAll('.organizational-overlay').forEach(el => {
      el.hidden = true; el.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  }

  function coopDropdownOpenMembers()  { closeOrganizationalDropdown(); openOrganizationalOverlay('members'); }
  function coopDropdownOpenLibrary()  { closeOrganizationalDropdown(); openOrganizationalOverlay('library'); }
  function coopDropdownOpenWorkPool() { closeOrganizationalDropdown(); openOrganizationalOverlay('work-pool'); }

  window.toggleOrganizationalDropdown       = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown        = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers  = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary  = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay          = openOrganizationalOverlay;
  window.closeOrganizationalOverlay         = closeOrganizationalOverlay;

  // ── Boot ──────────────────────────────────────────────────────────────────────
  load().catch(e => {
    if (loadingEl) loadingEl.hidden = true;
    showPageError('Could not load workspace.');
    console.error('Budget workspace load error:', e);
  });
})();
