/* funders-workspace.js — Coordinator for the merged Coop Funders page
 * (Grants tab + Donors tab). Modeled on budget-workspace.js: owns the single
 * org load, header chrome (account menu / coop dropdown / overlays), and tab
 * switching between the Grants and Donors panes. Sub-modules (grants.js,
 * donors.js) register their init(slug) under window.OrganizationalFunders and are
 * called eagerly once org load succeeds — both panes' data is loaded up
 * front, only the visible pane is toggled.
 */
(function () {
  'use strict';

  window.OrganizationalFunders = window.OrganizationalFunders || {};

  // ── State ──────────────────────────────────────────────────────────────────
  let currentSlug = '';
  let currentOrg  = null;
  let activeTab   = 'grants';

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const errEl     = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl    = document.getElementById('organizational-org-dashboard');
  const titleEl   = document.getElementById('organizational-org-title');

  const tabButtons = document.querySelectorAll('#organizational-funders-workspace-tabs .organizational-tab');
  const panes = {
    grants: document.getElementById('organizational-funders-tab-grants'),
    donors: document.getElementById('organizational-funders-tab-donors'),
    settings: document.getElementById('organizational-funders-tab-settings'),
  };
  const gearBtn = document.getElementById('organizational-funding-settings-btn');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showPageError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlugAndTab() {
    const path = window.location.pathname || '';
    let m = path.match(/^\/organizational\/o\/([^/]+)\/grants\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'grants' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/donors\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'donors' };
    return { slug: '', tab: 'grants' };
  }

  window.OrganizationalFunders.switchTab = function (tab) { switchTab(tab); };

  function syncUrlState() {
    if (!currentSlug || !window.history || !window.history.replaceState) return;
    const path = '/organizational/o/' + encodeURIComponent(currentSlug) + '/' + activeTab;
    if (path !== window.location.pathname) {
      window.history.replaceState(null, '', path + window.location.search);
    }
  }

  // ── Shared state API (mirrors window.OrganizationalBudget.getState) ───────────────────
  window.OrganizationalFunders.getOrg = function () { return currentOrg; };
  window.OrganizationalFunders.getSlug = function () { return currentSlug; };

  // ── Tab switching ─────────────────────────────────────────────────────────
  const TAB_TITLES = { grants: 'Grants', donors: 'Donors', settings: 'Settings' };

  function switchTab(tab) {
    if (!panes[tab]) return;
    activeTab = tab;
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.section === tab); });
    Object.keys(panes).forEach(function (k) { if (panes[k]) panes[k].hidden = (k !== tab); });
    if (gearBtn) gearBtn.classList.toggle('active', tab === 'settings');
    const actionsBar = document.getElementById('organizational-funding-actions');
    if (actionsBar) actionsBar.hidden = tab === 'settings';
    if (titleEl) titleEl.textContent = 'Funding | ' + TAB_TITLES[tab];
    if (tab !== 'settings') syncUrlState();
  }

  let fitQueued = false;
  function fitActivePane() {
    const pane = panes[activeTab];
    if (!pane || pane.hidden) return;
    const regions = Array.prototype.slice.call(pane.querySelectorAll('.organizational-table-wrap, .organizational-grant-panel--wide'));
    regions.forEach(function (r) { r.style.maxHeight = ''; r.style.overflowY = ''; });
    if (window.innerWidth < 900) return;
    const target = regions.filter(function (r) { return r.offsetParent !== null && r.getBoundingClientRect().height > 0; })[0];
    if (!target) return;
    const room = Math.max(200, Math.floor(window.innerHeight - target.getBoundingClientRect().top - 12));
    const keep = target.scrollTop;
    target.style.overflowY = 'auto';
    target.style.maxHeight = room + 'px';
    target.scrollTop = keep;
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0) target.style.maxHeight = Math.max(200, room - over) + 'px';
  }
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    window.requestAnimationFrame(function () { fitQueued = false; fitActivePane(); });
  }
  window.addEventListener('resize', queueFit);
  if (dashEl && window.MutationObserver) {
    new MutationObserver(queueFit).observe(dashEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  if (gearBtn) gearBtn.addEventListener('click', function () { switchTab('settings'); });

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const mod = window.OrganizationalFunders[this.dataset.section];
      if (mod && typeof mod.close === 'function') mod.close();
      if (this.dataset.section) switchTab(this.dataset.section);
    });
  });

  // ── Org load ──────────────────────────────────────────────────────────────
  async function load() {
    const parsed = parseSlugAndTab();
    const slug = parsed.slug;
    if (!slug) {
      showPageError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    activeTab   = parsed.tab;
    showPageError('');

    if (!window.apiJson) { showPageError('Utilities not loaded.'); return; }

    const out = await window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!out || out.res.status === 404) {
      if (loadingEl) loadingEl.hidden = true;
      showPageError((out && out.data && out.data.error) || 'Organization not found.');
      return;
    }
    if (!out.res.ok) {
      if (loadingEl) loadingEl.hidden = true;
      showPageError((out.data && out.data.error) || 'Could not load workspace.');
      return;
    }
    const org = out.data.org;
    if (!org) { if (loadingEl) loadingEl.hidden = true; showPageError('Invalid response.'); return; }
    currentOrg = org;

    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl)    dashEl.hidden    = false;

    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    if (access && access.can_read_contacts === false && !access.can_read_funders) {
      const donorsBtn = document.querySelector('#organizational-funders-workspace-tabs [data-section="donors"]');
      if (donorsBtn) donorsBtn.hidden = true;
      if (activeTab === 'donors') activeTab = 'grants';
    }

    switchTab(window.location.hash === '#funding-settings' ? 'settings' : activeTab);

    const initGrants = window.OrganizationalFunders.grants && typeof window.OrganizationalFunders.grants.init === 'function'
      ? window.OrganizationalFunders.grants.init(slug) : Promise.resolve();
    const initDonors = window.OrganizationalFunders.donors && typeof window.OrganizationalFunders.donors.init === 'function'
      ? window.OrganizationalFunders.donors.init(slug) : Promise.resolve();
    await Promise.all([initGrants, initDonors]);
  }

  // ── Header chrome (account menu / coop dropdown / overlays) ─────────────────
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me       = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    bindOrganizationalDropdownOutsideClick();

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeOrganizationalDropdown();
      closeOrganizationalOverlay();
    });

    document.addEventListener('click', function (e) {
      const overlay = e.target.closest('.organizational-overlay');
      if (overlay && e.target === overlay) closeOrganizationalOverlay();
    });
  })();

  function closeOrganizationalDropdown() {
    const dd   = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (dd)   { dd.hidden = true; dd.setAttribute('aria-hidden', 'true'); }
    if (icon) icon.setAttribute('aria-expanded', 'false');
  }

  function toggleOrganizationalDropdown(ev) {
    if (ev) ev.stopPropagation();
    const dd   = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (!dd) return;
    const opening = dd.hidden;
    dd.hidden = !opening;
    dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
    if (icon) icon.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }

  let coopDropdownDocClickBound = false;
  function bindOrganizationalDropdownOutsideClick() {
    if (coopDropdownDocClickBound) return;
    coopDropdownDocClickBound = true;
    document.addEventListener('click', function (e) {
      const dd   = document.getElementById('organizational-dropdown');
      const icon = document.getElementById('organizational-icon');
      if (!dd || dd.hidden) return;
      if (icon && icon.contains(e.target)) return;
      if (dd && dd.contains(e.target)) return;
      closeOrganizationalDropdown();
    });
  }

  function coopDropdownOpenMembers()  { closeOrganizationalDropdown(); openOrganizationalOverlay('members');  }
  function coopDropdownOpenLibrary()  { closeOrganizationalDropdown(); openOrganizationalOverlay('library');  }
  function coopDropdownOpenWorkPool() { closeOrganizationalDropdown(); openOrganizationalOverlay('work-pool'); }

  function openOrganizationalOverlay(type) {
    const overlay = document.getElementById('organizational-overlay-' + type);
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      loadOrganizationalOverlayData(type);
    }
  }

  function closeOrganizationalOverlay() {
    document.querySelectorAll('.organizational-overlay').forEach(function (ov) {
      ov.hidden = true;
      ov.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  }

  async function loadOrganizationalOverlayData(type) {
    const listEl = document.getElementById('organizational-overlay-' + type + '-list');
    if (!listEl) return;
    if (type === 'members') {
      listEl.innerHTML = '<p class="organizational-empty">Loading member directory…</p>';
      try {
        const res = await fetch('/api/organizational/cooperative/members', { credentials: 'same-origin' });
        if (res.ok) {
          const data    = await res.json();
          const members = data.members || [];
          if (members.length === 0) {
            listEl.innerHTML = '<p class="organizational-empty">No members yet.</p>';
          } else {
            const escH = window.escapeHtml || function (s) { return String(s || ''); };
            listEl.innerHTML = members.map(function (m) {
              return '<div class="organizational-list-item"><div class="organizational-list-item-main"><div class="organizational-list-item-title">' +
                escH(m.display_name || m.slug || '—') + '</div></div></div>';
            }).join('');
          }
        } else {
          listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
        }
      } catch (_) {
        listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
      }
    } else if (type === 'library') {
      listEl.innerHTML = '<p class="organizational-empty">Library coming soon.</p>';
    } else if (type === 'work-pool') {
      listEl.innerHTML = '<p class="organizational-empty">Work pool coming soon.</p>';
    }
  }

  window.toggleOrganizationalDropdown       = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown        = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers  = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary  = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay          = openOrganizationalOverlay;
  window.closeOrganizationalOverlay         = closeOrganizationalOverlay;

  // ── Boot ──────────────────────────────────────────────────────────────────
  load().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showPageError('Could not load workspace.');
    console.error('Funders workspace load error:', e);
  });
})();
