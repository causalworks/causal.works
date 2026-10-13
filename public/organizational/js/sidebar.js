/**
 * Coop workspace sidebar: slug-based hrefs, collapse + localStorage, org name + last-sync line.
 * Expects <aside id="organizational-sidebar">…</aside> (e.g. from /organizational/partials/sidebar.html fetch+inject or inline).
 */
(function () {
  const STORAGE_KEY = 'organizational-sidebar-collapsed';

  function slugFromPath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function fillNavHrefs(slug) {
    if (!slug) return;
    const base = '/organizational/o/' + encodeURIComponent(slug);
    document.querySelectorAll('.organizational-sidebar__link[data-organizational-route]').forEach(function (a) {
      const route = a.getAttribute('data-organizational-href-route') || a.getAttribute('data-organizational-route');
      if (!route) return;
      if (route === 'settings') {
        a.href = base + '/settings';
      } else {
        a.href = base + '/' + route.split('/').map(encodeURIComponent).join('/');
      }
    });
    const accountLink = document.getElementById('organizational-account-dropdown-my-account');
    if (accountLink) accountLink.href = base + '/account';
    const createOrgLink = document.getElementById('organizational-account-create-org-link');
    if (createOrgLink) createOrgLink.href = base + '/new?create=1';
    const manageOrgLink = document.getElementById('organizational-landing-manage-link');
    if (manageOrgLink) manageOrgLink.href = base + '/account';
    const solidLoginLink = document.getElementById('organizational-solid-login-link');
    if (solidLoginLink) solidLoginLink.href = base + '/solid-login';
  }

  const EXPAND_TRIGGER_SELECTOR =
    '.organizational-sidebar__link-with-toggle--top > .organizational-sidebar__link, ' +
    '.organizational-sidebar__link-with-toggle:not(.organizational-sidebar__link-with-toggle--top) > .organizational-sidebar__link';

  function updateExpandIconTitles(sidebar, collapsed) {
    sidebar.querySelectorAll(EXPAND_TRIGGER_SELECTOR).forEach(function (link) {
      if (link.dataset.coopOriginalTitle === undefined) {
        link.dataset.coopOriginalTitle = link.getAttribute('title') || '';
      }
      link.title = collapsed
        ? 'Expand sidebar (' + link.dataset.coopOriginalTitle + ')'
        : link.dataset.coopOriginalTitle;
    });
  }

  function setCollapsed(sidebar, collapsed) {
    if (!sidebar) return;
    sidebar.classList.toggle('organizational-sidebar--collapsed', collapsed);
    const btn = document.getElementById('organizational-sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
    updateExpandIconTitles(sidebar, collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch (_) {}
  }

  const GROUP_STORAGE_PREFIX = 'organizational-sidebar-group-open-';
  const SIDEBAR_GROUPS = {
    org: { toggleId: 'organizational-sidebar-group-toggle', groupId: 'organizational-sidebar-group', defaultOpen: true },
    cooperative: { toggleId: 'organizational-sidebar-cooperative-toggle', groupId: 'organizational-sidebar-cooperative-group', defaultOpen: false },
  };

  function getGroupOpenPref(name, cfg, fallbackDefault) {
    try {
      const v = localStorage.getItem(GROUP_STORAGE_PREFIX + name);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return fallbackDefault !== undefined ? fallbackDefault : cfg.defaultOpen;
  }

  function setGroupOpen(name, open, persist) {
    const cfg = SIDEBAR_GROUPS[name];
    if (!cfg) return;
    const group = document.getElementById(cfg.groupId);
    const toggle = document.getElementById(cfg.toggleId);
    if (group) group.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (persist) {
      try { localStorage.setItem(GROUP_STORAGE_PREFIX + name, open ? '1' : '0'); } catch (_) {}
    }
  }

  function toggleGroup(name) {
    const cfg = SIDEBAR_GROUPS[name];
    if (!cfg) return;
    const group = document.getElementById(cfg.groupId);
    const isOpen = group ? !group.hidden : false;
    const next = !isOpen;
    setGroupOpen(name, next, true);
    if (next) {
      Object.keys(SIDEBAR_GROUPS).forEach(function (otherName) {
        if (otherName !== name) setGroupOpen(otherName, false, true);
      });
    }
  }

  function initGroupToggle(name, fallbackDefault) {
    const cfg = SIDEBAR_GROUPS[name];
    if (!cfg) return;
    setGroupOpen(name, getGroupOpenPref(name, cfg, fallbackDefault), false);
    const toggle = document.getElementById(cfg.toggleId);
    const sidebar = document.getElementById('organizational-sidebar');
    if (toggle && !toggle.dataset.coopGroupWired) {
      toggle.dataset.coopGroupWired = '1';
      toggle.addEventListener('click', function () { toggleGroup(name); });
    }
    const nameLink = toggle && toggle.closest('.organizational-sidebar__link-with-toggle')
      ? toggle.closest('.organizational-sidebar__link-with-toggle').querySelector('.organizational-sidebar__link')
      : null;
    if (nameLink && !nameLink.dataset.coopGroupNameWired) {
      nameLink.dataset.coopGroupNameWired = '1';
      nameLink.addEventListener('click', function (e) {
        if (sidebar && sidebar.classList.contains('organizational-sidebar--collapsed')) return;
        e.preventDefault();
        toggleGroup(name);
      });
    }
  }

  function applyActiveFromBody() {
    const active = (document.body && document.body.getAttribute('data-organizational-active')) || '';
    document.querySelectorAll('.organizational-sidebar__link').forEach(function (a) {
      a.classList.remove('organizational-sidebar__link--active');
    });
    if (!active) return;
    if (active === 'cooperative') {
      const m = (window.location.pathname || '').match(/\/cooperative\/([a-z-]+)/);
      const tab = m ? m[1] : 'workshop';
      const subLink = document.querySelector('[data-organizational-route="cooperative/' + tab + '"]');
      if (subLink) subLink.classList.add('organizational-sidebar__link--active');
      return;
    }
    if (active === 'dashboard') return;
    const route = active === 'settings' ? 'settings' : active;
    const link = document.querySelector('[data-organizational-route="' + route + '"]');
    if (link) link.classList.add('organizational-sidebar__link--active');
  }

  async function injectSidebarIfNeeded() {
    const mount = document.getElementById('organizational-sidebar-mount');
    if (!mount) return null;
    try {
      const res = await fetch('/organizational/partials/sidebar.html', { credentials: 'same-origin' });
      const html = await res.text();
      mount.outerHTML = html.trim();
    } catch (e) {
      console.error('organizational-sidebar: could not load partial', e);
      return null;
    }
    return document.getElementById('organizational-sidebar');
  }

  function applyOptionalFeaturesVisibility(orgMembership, orgSponsoredProjects) {
    const membershipLink = document.getElementById('organizational-sidebar-membership');
    const spLink = document.getElementById('organizational-sidebar-sponsored-projects');

    if (membershipLink) {
      membershipLink.hidden = !orgMembership;
    }
    if (spLink) {
      spLink.hidden = !orgSponsoredProjects;
    }
  }

  window.OrganizationalApplyNumberColors = function (on) {
    function go() { if (window.OrganizationalNumberColors) (on ? window.OrganizationalNumberColors.enable() : window.OrganizationalNumberColors.disable()); }
    if (window.OrganizationalNumberColors || !on) { go(); return; }
    var s = document.createElement('script');
    s.src = '/organizational/js/number-colors.js';
    s.onload = go;
    document.head.appendChild(s);
  };

  async function checkOptionalFeatures() {
    const slug = slugFromPath();
    if (!slug) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'include', signal: controller.signal });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (res.ok && data.org) {
        applyOptionalFeaturesVisibility(!!data.org.membership_enabled, !!data.org.fiscal_sponsorship_mode);
        window.OrganizationalApplyNumberColors(!!data.org.show_number_colors);
        setHeaderOrg(data.org.display_name || '—');
      }
    } catch (e) {
      console.error('organizational-sidebar: could not check optional features', e);
    }
  }

  function reorderForDashboardLanding(sidebar) {
    const isDashboard = (document.body && document.body.getAttribute('data-organizational-active')) === 'dashboard';
    if (!isDashboard) return;
    const nav = sidebar.querySelector('.organizational-sidebar__nav');
    const coopToggleBtn = document.getElementById('organizational-sidebar-cooperative-toggle');
    const orgToggleBtn = document.getElementById('organizational-sidebar-group-toggle');
    const coopRow = coopToggleBtn && coopToggleBtn.closest('.organizational-sidebar__link-with-toggle');
    const orgRow = orgToggleBtn && orgToggleBtn.closest('.organizational-sidebar__link-with-toggle');
    const coopGroup = document.getElementById('organizational-sidebar-cooperative-group');
    const orgGroup = document.getElementById('organizational-sidebar-group');
    const collapseToggleBtn = document.getElementById('organizational-sidebar-toggle');
    if (!nav || !coopRow || !orgRow || !coopGroup || !orgGroup) return;

    if (collapseToggleBtn) coopRow.appendChild(collapseToggleBtn);
    orgRow.classList.remove('organizational-sidebar__link-with-toggle--top');
    coopRow.classList.add('organizational-sidebar__link-with-toggle--top');

    nav.insertBefore(coopRow, orgRow);
    nav.insertBefore(coopGroup, orgRow);
  }

  const myAccessCache = {};
  window.OrganizationalMyAccess = function (slug) {
    if (!slug) return Promise.resolve(null);
    if (!myAccessCache[slug]) {
      myAccessCache[slug] = fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/my-access', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return myAccessCache[slug];
  };

  function hideAccountingIfNoAccess(slug) {
    window.OrganizationalMyAccess(slug).then(function (a) {
      if (!a) return;
      const hide = function (route) {
        document.querySelectorAll('.organizational-sidebar__link[data-organizational-route="' + route + '"]').forEach(function (l) { l.hidden = true; });
      };
      if (!a.can_read_accounting) hide('accounting');
      if (a.can_read_contacts === false) hide('contacts');
    });
  }

  const READ_ONLY_PAGES = {
    budget: [
      { area: 'budget', roots: ['main'], skip: ['#organizational-budget-tab-personnel', '#organizational-budget-tab-scenarios'], note: true },
      { area: 'personnel', roots: ['#organizational-budget-tab-personnel'] },
      { area: 'scenarios', roots: ['#organizational-budget-tab-scenarios'] },
    ],
    compliance: [{ area: 'compliance', roots: ['main'], note: true }],
    funders: [
      { area: 'funding', roots: ['#organizational-grants-panel-body'], hide: ['#organizational-grant-add', '#organizational-grant-import-btn'] },
      { area: 'allocations', roots: ['#organizational-grants-panel-body'], only: '[class*="alloc"]' },
      { area: 'donors', roots: ['#organizational-funding-actions'], hide: ['#organizational-gift-add-donation', '#organizational-gift-add-pledge'] },
      { allAreas: ['donors', 'funder_records'], roots: ['#organizational-funding-actions'], hide: ['#organizational-funder-add'] },
    ],
    'sponsored-projects': [{ area: 'sponsorship', roots: ['main', '#organizational-sp-modal'], hide: ['#organizational-sp-add-btn'], note: true }],
  };
  const RO_WRITE_TEXT = /^(\+|add\b|new\b|save\b|delete\b|remove\b|import\b|create\b|edit\b|copy\b|recalc|promote|fork\b|approve|archive|void\b|apply\b|fix math|run\b|rename|duplicate|upload|attach|reset|revert)/i;
  const RO_FIELD_HOME = 'form, table, .organizational-panel, .organizational-panel-body, .organizational-modal-overlay';

  function lockRoot(root, cfg) {
    const skipped = function (el) {
      return !!el.closest('[data-ro-keep]') || (cfg.skip || []).some(function (sel) { return el.closest(sel); });
    };
    const apply = function () {
      root.querySelectorAll('input, select, textarea').forEach(function (el) {
        if (el.type === 'hidden' || el.type === 'search' || skipped(el) || !el.closest(RO_FIELD_HOME)) return;
        if (cfg.only && !el.closest(cfg.only)) return;
        el.disabled = true;
      });
      root.querySelectorAll('button').forEach(function (b) {
        if (skipped(b) || b.classList.contains('organizational-panel-close')) return;
        if (cfg.only && !b.closest(cfg.only)) return;
        const text = (b.textContent || '').trim();
        if (/^(cancel|close)$/i.test(text)) return;
        if (b.type === 'submit' || RO_WRITE_TEXT.test(text) || /delete|remove/i.test(b.className)) b.hidden = true;
      });
      (cfg.hide || []).forEach(function (sel) { root.ownerDocument.querySelectorAll(sel).forEach(function (el) { el.hidden = true; }); });
    };
    let queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; apply(); });
    }).observe(root, { childList: true, subtree: true });
    apply();
  }

  async function hideUnreadableAreas(slug) {
    if (!window.OrganizationalMyAccess) return;
    const access = await window.OrganizationalMyAccess(slug);
    if (!access || !access.read) return;
    if (access.read.personnel_pay === false) {
      document.querySelectorAll('.organizational-tab[data-section="personnel"]').forEach(function (el) { el.hidden = true; });
    }
  }

  async function applyReadOnlyForPage(slug) {
    const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    const rules = READ_ONLY_PAGES[page];
    if (!rules || !window.OrganizationalMyAccess) return;
    const access = await window.OrganizationalMyAccess(slug);
    if (!access || !access.write) return;
    rules.forEach(function (cfg) {
      if (!(cfg.allAreas || [cfg.area]).every(function (a) { return access.write[a] === false; })) return;
      cfg.roots.forEach(function (sel) {
        const root = document.querySelector(sel);
        if (!root) return;
        lockRoot(root, cfg);
        if (cfg.note && !root.querySelector('[data-ro-note]')) {
          const who = (access.write_who && access.write_who[cfg.area]) || 'someone with access';
          const p = document.createElement('p');
          p.className = 'organizational-hint';
          p.setAttribute('data-ro-note', '');
          p.textContent = 'You can view this. Changes are made by ' + who + '.';
          root.insertBefore(p, root.firstChild);
        }
      });
    });
  }

  function initSidebarDom(sidebar) {
    if (!sidebar) return;
    const slug = slugFromPath();
    fillNavHrefs(slug);
    hideAccountingIfNoAccess(slug);
    applyReadOnlyForPage(slug);
    hideUnreadableAreas(slug);
    applyActiveFromBody();
    reorderForDashboardLanding(sidebar);

    let collapsed = false;
    try {
      collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {}
    setCollapsed(sidebar, collapsed);

    const btn = document.getElementById('organizational-sidebar-toggle');
    if (btn && !btn.dataset.coopWired) {
      btn.dataset.coopWired = '1';
      btn.addEventListener('click', function () {
        const next = !sidebar.classList.contains('organizational-sidebar--collapsed');
        setCollapsed(sidebar, next);
      });
    }

    const isDashboard = (document.body && document.body.getAttribute('data-organizational-active')) === 'dashboard';
    initGroupToggle('org', isDashboard ? false : undefined);
    initGroupToggle('cooperative', isDashboard ? true : undefined);
    ensureActiveLinkGroupVisible();
    wireCollapsedExpandIcons(sidebar);
  }

  function wireCollapsedExpandIcons(sidebar) {
    const links = sidebar.querySelectorAll(EXPAND_TRIGGER_SELECTOR);
    links.forEach(function (link) {
      if (link.dataset.coopExpandWired) return;
      link.dataset.coopExpandWired = '1';
      link.addEventListener('click', function (e) {
        if (sidebar.classList.contains('organizational-sidebar--collapsed')) {
          e.preventDefault();
          setCollapsed(sidebar, false);
        }
      });
    });
  }

  function ensureActiveLinkGroupVisible() {
    const activeLink = document.querySelector('.organizational-sidebar__link--active');
    if (!activeLink) return;
    const group = activeLink.closest('.organizational-sidebar__group');
    if (group && group.hidden) {
      const name = group.id === 'organizational-sidebar-cooperative-group' ? 'cooperative' : 'org';
      setGroupOpen(name, true, false);
      Object.keys(SIDEBAR_GROUPS).forEach(function (otherName) {
        if (otherName !== name) setGroupOpen(otherName, false, false);
      });
    }
  }

  function orgNameToInitials(name) {
    const words = String(name || '').trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
    if (!words.length) return '';
    const letters = words.slice(0, 2).map((w) => (w.match(/[A-Za-z0-9]/) || [''])[0]);
    return letters.join('').toUpperCase();
  }

  function setWorkspaceName(name) {
    const avatarEl = document.getElementById('organizational-sidebar-org-avatar');
    const homeEl = document.getElementById('organizational-sidebar-home-icon');
    if (!avatarEl || !homeEl) return;
    const initials = orgNameToInitials(name);
    avatarEl.textContent = initials;
    avatarEl.hidden = !initials;
    homeEl.style.display = initials ? 'none' : '';
  }

  let orgMenuWired = false;
  function wireOrgMenu(switcherEl, isDemo) {
    const menu = document.getElementById('organizational-org-menu');
    const m = window.location.pathname.match(/^\/organizational\/o\/([^/]+)(\/|$)/);
    if (!switcherEl || !menu || !m) return;
    const base = '/organizational/o/' + m[1];
    document.getElementById('organizational-org-menu-settings').href = base + '/settings';
    const structureLink = document.getElementById('organizational-org-menu-structure');
    if (structureLink) structureLink.href = base + '/structure';
    document.getElementById('organizational-org-menu-home').href = base + '/dashboard';
    const sw = document.getElementById('organizational-org-menu-switch');
    sw.hidden = !!isDemo;
    if (orgMenuWired) return;
    orgMenuWired = true;
    const close = () => { menu.hidden = true; switcherEl.setAttribute('aria-expanded', 'false'); };
    switcherEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      switcherEl.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  let headerOrgObserver = null;
  function setHeaderOrg(name) {
    if (!document.getElementById('organizational-header-name')) {
      if (headerOrgObserver) headerOrgObserver.disconnect();
      headerOrgObserver = new MutationObserver(function () {
        if (!document.getElementById('organizational-header-name')) return;
        headerOrgObserver.disconnect();
        headerOrgObserver = null;
        setHeaderOrg(name);
      });
      headerOrgObserver.observe(document.body, { childList: true, subtree: true });
      return;
    }
    const demoMatch = window.location.pathname.match(/^\/organizational\/o\/(demo-company)(\/|$)/);
    const nameEl = document.getElementById('organizational-header-name');
    if (nameEl) nameEl.textContent = name || '—';
    setWorkspaceName(name);
    const chevronEl = document.getElementById('organizational-header-org-chevron');
    if (chevronEl) chevronEl.hidden = false;
    const signatureEl = document.getElementById('organizational-header-signature-product');
    if (signatureEl) signatureEl.hidden = false;
    const switcherEl = document.getElementById('organizational-org-switcher');
    if (switcherEl) {
      switcherEl.title = 'Organization menu';
      if (demoMatch) switcherEl.href = '/organizational/o/demo-company/dashboard';
    }
    wireOrgMenu(switcherEl, demoMatch);
    const logoCausalEl = document.getElementById('organizational-header-logo-causal');
    const logoWorksEl = document.getElementById('organizational-header-logo-works');
    if (demoMatch && logoCausalEl && logoWorksEl) {
      logoCausalEl.textContent = 'Turning Tide';
      logoWorksEl.textContent = '';
    }
  }

  let accountMenuEmailFetched = false;

  function closeOrganizationalAccountMenu() {
    const dd = document.getElementById('organizational-account-dropdown');
    const trig = document.getElementById('organizational-account-menu-trigger');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (trig) trig.setAttribute('aria-expanded', 'false');
  }

  function emailToInitials(email) {
    const local = String(email || '').split('@')[0] || '';
    if (!local) return '';
    const parts = local.split(/[._+-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  function setAccountAvatarInitials(email) {
    const avatarEl = document.getElementById('organizational-account-menu-trigger-avatar');
    if (!avatarEl) return;
    const initials = emailToInitials(email);
    if (initials) {
      avatarEl.textContent = initials;
      avatarEl.classList.remove('organizational-profile-avatar--glyph');
    } else {
      avatarEl.textContent = String.fromCodePoint(0x1F464);
      avatarEl.classList.add('organizational-profile-avatar--glyph');
    }
  }

  async function fetchAccountMenuEmail() {
    if (accountMenuEmailFetched) return;
    accountMenuEmailFetched = true;
    const emailEl = document.getElementById('organizational-account-dropdown-email');
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        if (emailEl) emailEl.textContent = me.email || '';
        setAccountAvatarInitials(me.email || '');

        const switchToAgencyLink = document.querySelector('#organizational-account-dropdown a[href="/individual/"]');
        if (switchToAgencyLink && me.user_type === 'demo') switchToAgencyLink.href = '/demo';
      }
    } catch (_) {
    }
  }

  function toggleOrganizationalAccountMenu(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('organizational-account-dropdown');
    const trig = document.getElementById('organizational-account-menu-trigger');
    if (!dd) return;
    const opening = dd.hidden;
    if (opening) fetchAccountMenuEmail();
    dd.hidden = !opening;
    dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
    if (trig) trig.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }

  async function organizationalSignOut() {
    closeOrganizationalAccountMenu();
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {
    }
    window.location.href = '/login';
  }

  function bindAccountMenuOutsideClick() {
    document.addEventListener('click', function (e) {
      const wrap = document.querySelector('.organizational-sidebar-profile');
      const dd = document.getElementById('organizational-account-dropdown');
      if (!dd || dd.hidden) return;
      if (wrap && wrap.contains(e.target)) return;
      closeOrganizationalAccountMenu();
    });
  }

  window.toggleOrganizationalAccountMenu = toggleOrganizationalAccountMenu;
  window.closeOrganizationalAccountMenu = closeOrganizationalAccountMenu;
  window.organizationalSignOut = organizationalSignOut;

  function setLastSyncLine(text, hidden) {
    const el = document.getElementById('organizational-sidebar-last-sync');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !!hidden || !text;
  }

  async function refreshLastSyncFromApi() {
    const slug = slugFromPath();
    if (!slug) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/actuals/last-sync', {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      const iso = data.last_sync_at;
      const n = data.row_count != null ? Number(data.row_count) : 0;
      if (iso && typeof window.formatFreshnessLine === 'function') {
        setLastSyncLine(window.formatFreshnessLine(iso, 'imported') + (n ? ' · ' + n + ' rows' : ''), false);
      } else if (n) {
        setLastSyncLine('No import timestamp · ' + n + ' rows', false);
      } else {
        setLastSyncLine('', true);
      }
    } catch (_) {
      setLastSyncLine('', true);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    let sidebar = document.getElementById('organizational-sidebar');
    if (!sidebar) {
      await injectSidebarIfNeeded();
      sidebar = document.getElementById('organizational-sidebar');
    }
    initSidebarDom(sidebar);
    if (typeof applyOrganizationalSidebarStrings === 'function') applyOrganizationalSidebarStrings();
    bindAccountMenuOutsideClick();
    fetchAccountMenuEmail().catch(function () {});

    refreshLastSyncFromApi().catch(() => {});
    checkOptionalFeatures().catch(() => {});
  });

  window.OrganizationalSidebar = {
    setWorkspaceName: setWorkspaceName,
    setLastSyncLine: setLastSyncLine,
    setActiveFromBody: applyActiveFromBody,
    refreshLastSyncFromApi: refreshLastSyncFromApi,
    slugFromPath: slugFromPath,
    checkOptionalFeatures: checkOptionalFeatures,
  };

  window.OrganizationalHeader = {
    setOrg: setHeaderOrg,
  };
})();
