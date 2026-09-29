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
  let activeTab   = 'grants'; // 'grants' | 'donors'

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const errEl     = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl    = document.getElementById('organizational-org-dashboard');
  const titleEl   = document.getElementById('organizational-org-title');

  const tabButtons = document.querySelectorAll('#organizational-funders-workspace-tabs .organizational-tab');
  const panes = {
    grants: document.getElementById('organizational-funders-tab-grants'),
    donors: document.getElementById('organizational-funders-tab-donors'),
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showPageError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  // Accept both /organizational/o/:slug/grants and /organizational/o/:slug/donors deep links.
  // Whichever path matched determines the default active tab.
  function parseSlugAndTab() {
    const path = window.location.pathname || '';
    let m = path.match(/^\/organizational\/o\/([^/]+)\/grants\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'grants' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/donors\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'donors' };
    return { slug: '', tab: 'grants' };
  }

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
  const TAB_TITLES = { grants: 'Grants', donors: 'Contributions' };

  function switchTab(tab) {
    if (!panes[tab]) return;
    activeTab = tab;
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.section === tab); });
    Object.keys(panes).forEach(function (k) { if (panes[k]) panes[k].hidden = (k !== tab); });
    if (titleEl) titleEl.textContent = 'Funders | ' + TAB_TITLES[tab];
    syncUrlState();
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
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

    // Reflect the tab determined by the URL, then sync the URL to match
    // (handles e.g. trailing slash normalization).
    switchTab(activeTab);

    // Eager dual-init: both panes' data load up front (matches today's
    // behavior of two independent page loads), avoiding lazy-init re-entry
    // bugs from rapid tab switching.
    const initGrants = window.OrganizationalFunders.grants && typeof window.OrganizationalFunders.grants.init === 'function'
      ? window.OrganizationalFunders.grants.init(slug) : Promise.resolve();
    const initDonors = window.OrganizationalFunders.donors && typeof window.OrganizationalFunders.donors.init === 'function'
      ? window.OrganizationalFunders.donors.init(slug) : Promise.resolve();
    await Promise.all([initGrants, initDonors]);
  }

  // ── Header chrome (account menu / coop dropdown / overlays) ─────────────────
  // Single shared copy — previously duplicated in grants.js, absent from
  // donors.js. Both grants.js and donors.js now defer this to the coordinator.
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


  // Expose functions called from HTML chrome
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
