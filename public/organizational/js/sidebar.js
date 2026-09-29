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
        a.href = base + '/settings/organization';
      } else {
        a.href = base + '/' + route.split('/').map(encodeURIComponent).join('/');
      }
    });
    // "My account" (in the profile dropdown, not the main nav loop above) keeps you inside this
    // org's own framed URL so the sidebar it links to can resolve slug-based nav the same way --
    // account.html has no org of its own, so without this it fell back to the un-scoped
    // /organizational/account, whose sidebar links (fillNavHrefs bailing out with no slug) went
    // nowhere. Falls back to the old un-scoped URL only when there's truly no slug to frame it in
    // (reached some other way than from inside a workspace).
    const accountLink = document.getElementById('organizational-account-dropdown-my-account');
    if (accountLink) accountLink.href = base + '/account';
    // account.html's own "+ Create a new organization" button and "Manage organizations" link
    // (index.html) -- same reasoning, kept org-framed rather than dropping to the un-scoped URL.
    const createOrgLink = document.getElementById('organizational-account-create-org-link');
    if (createOrgLink) createOrgLink.href = base + '/new?create=1';
    const manageOrgLink = document.getElementById('organizational-landing-manage-link');
    if (manageOrgLink) manageOrgLink.href = base + '/account';
    // solid-pod.html's "Log in with your own Solid identity" link.
    const solidLoginLink = document.getElementById('organizational-solid-login-link');
    if (solidLoginLink) solidLoginLink.href = base + '/solid-login';
  }

  // Shared by setCollapsed() (tooltip swap) and wireCollapsedExpandIcons() (click wiring) \u2014
  // one selector, so the two can't silently drift apart.
  const EXPAND_TRIGGER_SELECTOR =
    '.organizational-sidebar__link-with-toggle--top > .organizational-sidebar__link, ' +
    '.organizational-sidebar__link-with-toggle:not(.organizational-sidebar__link-with-toggle--top) > .organizational-sidebar__link';

  // Collapsed mode removed the dedicated toggle button in favor of letting the Organization/
  // Cooperative icons themselves expand the sidebar (see wireCollapsedExpandIcons below), but
  // their tooltips still just said "Organization"/"Cooperative" \u2014 implying navigation, not the
  // actual click behavior in this state. Swap the tooltip while collapsed so hovering tells the
  // user what the click actually does; restore the original once expanded, since then the icon
  // really does behave like an ordinary nav link again.
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
      // Icon itself is static (a panel-left glyph, distinct from the nav-dropdown chevrons
      // by design \u2014 see the sidebar.html comment) \u2014 only the tooltip/aria state changes.
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
    updateExpandIconTitles(sidebar, collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch (_) {}
  }

  // Organization defaults open, Cooperative defaults closed. Each group's open/closed state
  // persists independently in localStorage (same pattern as the whole-sidebar collapse
  // state above) — this is a multi-page app, so sidebar.html is re-fetched fresh on every
  // navigation; without persistence, a closed group would silently reopen on the very next
  // click of any link in the *other* group, which looked like "clicking an Organization item
  // re-opens Cooperative" but was really just the lack of any saved state at all.
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

  /** Accordion behavior: opening one group (Organization or Cooperative) closes the other. */
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

  // Both the chevron button AND the "Organization"/"Cooperative" name link toggle the group
  // — the chevron alone was too small a target. The name link still has a real href (its
  // dashboard), but that destination isn't a meaningful click target here (see
  // applyActiveFromBody's comment: these are header links, not real leaf items), so toggling
  // wins over navigating whenever the sidebar is expanded. When the whole sidebar is
  // collapsed, wireCollapsedExpandIcons already owns this same link's click (expand the rail
  // instead) — skip here so the two handlers don't fight over one click.
  function initGroupToggle(name, fallbackDefault) {
    const cfg = SIDEBAR_GROUPS[name];
    if (!cfg) return;
    // Applied on every page load, not just first-ever visit: restores the persisted
    // open/closed state (or the default) since the HTML itself always ships in its default
    // shape regardless of what the user previously chose.
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
    // "dashboard" (Organization) and "cooperative" are group-header links with a chevron
    // toggle, not real leaf menu items — never highlight them as "selected" themselves.
    // Only actual leaf items (Budget/Funders/…, Workshop/Engagement/…, Settings, etc.)
    // should show the active state.
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
      }
    } catch (e) {
      console.error('organizational-sidebar: could not check optional features', e);
    }
  }

  // Dashboard defaults Cooperative open (see isDashboard below), but it sits second in the
  // markup after Organization's row+group — visually that reads as "buried" even though it's
  // expanded. Physically move Cooperative's row+group above Organization's on this one page,
  // including the sidebar-collapse toggle button (normally nested in whichever row is first)
  // and the --top modifier that keys its collapsed-mode/tooltip behavior, so the reordered
  // row picks up the same wiring the top row always gets. Must run before setCollapsed/
  // wireCollapsedExpandIcons below, since those key off the --top class at call time.
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

  function initSidebarDom(sidebar) {
    if (!sidebar) return;
    const slug = slugFromPath();
    fillNavHrefs(slug);
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

    // Dashboard already restates Organization's own financial summary in its cards, so
    // Organization-open-by-default there just repeats what's on the page while burying
    // Cooperative. Flip the *default* (not the persisted-preference logic) on this one page;
    // any group the user has explicitly toggled still wins via getGroupOpenPref's stored check.
    const isDashboard = (document.body && document.body.getAttribute('data-organizational-active')) === 'dashboard';
    initGroupToggle('org', isDashboard ? false : undefined);
    initGroupToggle('cooperative', isDashboard ? true : undefined);
    ensureActiveLinkGroupVisible();
    wireCollapsedExpandIcons(sidebar);
  }

  // Collapsed rail has no dedicated toggle button — clicking the Organization or
  // Cooperative icon expands the sidebar instead of navigating, since collapsed mode
  // hides their chevron (the real way to reveal sub-pages) and they're group-header
  // links, not standalone destinations.
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

  // If the current page's active nav item lives inside a group that's closed (per the
  // user's persisted preference), force that one group open for this view so the active
  // item isn't hidden — without touching the persisted preference itself, so navigating
  // away and back to a page outside that group still respects the user's actual choice.
  function ensureActiveLinkGroupVisible() {
    const activeLink = document.querySelector('.organizational-sidebar__link--active');
    if (!activeLink) return;
    const group = activeLink.closest('.organizational-sidebar__group');
    if (group && group.hidden) {
      const name = group.id === 'organizational-sidebar-cooperative-group' ? 'cooperative' : 'org';
      setGroupOpen(name, true, false);
      // Same accordion invariant as the click handler -- forcing the active page's group
      // open shouldn't leave the other group visibly open too.
      Object.keys(SIDEBAR_GROUPS).forEach(function (otherName) {
        if (otherName !== name) setGroupOpen(otherName, false, false);
      });
    }
  }

  function setWorkspaceName() {
    // No-op: the sidebar's top item is a static "Organization" label now — org identity
    // lives in the header org switcher only. Kept as a function so existing page-JS callers
    // (window.OrganizationalSidebar.setWorkspaceName(org.display_name)) don't need updating.
  }

  function setHeaderOrg(name) {
    // Demo Company is the only org the shared demo user has; the org-picker/setup page at
    // /organizational/ is meaningless there, so the header goes to its dashboard instead.
    const demoMatch = window.location.pathname.match(/^\/organizational\/o\/(demo-company)(\/|$)/);
    const nameEl = document.getElementById('organizational-header-name');
    if (nameEl) nameEl.textContent = name || '—';
    // No avatar bubble here -- an org name like "CommunityOrg" produced a 4-letter initials
    // block ("COMM") that crowded this header. The account-menu avatar (sidebar footer) is
    // the one place initials render now, matching the Individual app's account-circle pattern.
    const chevronEl = document.getElementById('organizational-header-org-chevron');
    if (chevronEl) chevronEl.hidden = false;
    const signatureEl = document.getElementById('organizational-header-signature-product');
    if (signatureEl) signatureEl.hidden = false;
    const switcherEl = document.getElementById('organizational-org-switcher');
    if (switcherEl) {
      switcherEl.title = 'Switch organization';
      if (demoMatch) switcherEl.href = '/organizational/o/demo-company/dashboard';
    }
    // The left-side name above (nameEl) is always the real org's own name ("CommunityOrg" for
    // Demo Company). This right-side brand-logo override is separate: it names the Cooperative
    // itself, "Turning Tide" -- demo-company-only, replacing the generic "causalworks" logo.
    // The demo cooperative's own workshop content (CP2 LNG Terminal Expansion coalition) is
    // set in Cameron Parish, Louisiana -- coalition member orgs are Lake Charles/Cameron
    // Parish/New Orleans/Baton Rouge, LA and Port Arthur/Houston, TX (see coop_members rows
    // 107-113). This is unrelated to the Individual app's own demo persona, which is Portland,
    // OR -- the two demos aren't the same fictional place.
    const logoCausalEl = document.getElementById('organizational-header-logo-causal');
    const logoWorksEl = document.getElementById('organizational-header-logo-works');
    if (demoMatch && logoCausalEl && logoWorksEl) {
      logoCausalEl.textContent = 'Turning Tide';
      logoWorksEl.textContent = '';
    }
  }

  // Account menu: trigger + dropdown live in the sidebar footer (partials/sidebar.html),
  // shared across every organizational page via this one file rather than the page-specific
  // copies that used to exist (settings.js/dashboard.js/org.js/compliance.js/
  // sponsored-projects.js/projections.js each had their own dead accountMenuOpenSettings/
  // settingsSignOut stubs from an earlier header design that no longer renders that markup --
  // removed in favor of this single live implementation).
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

  // Same pattern as the Individual app's account-circle avatar (public/individual/js/router.js
  // emailToInitials): a small colored circle with the user's initials, derived from the email
  // local-part, instead of a generic person glyph.
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
      avatarEl.textContent = String.fromCodePoint(0x1F464); // fallback person glyph
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

        // "Switch to Agency" assumes the current session already works on the individual
        // side. For a real account that's always true (same session, one account). For the
        // shared demo account it can dead-end at login if this session has quietly expired
        // since the visitor arrived (e.g. via the workspace splash's Cooperative card) --
        // /demo re-establishes a fresh session before landing in Agency, same fix as the
        // splash page's own demo cards (see /demo-coop in server.js).
        const switchToAgencyLink = document.querySelector('#organizational-account-dropdown a[href="/individual/"]');
        if (switchToAgencyLink && me.user_type === 'demo') switchToAgencyLink.href = '/demo';
      }
    } catch (_) {
      // leave blank -- not worth surfacing an error for a label
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
      // fall through to redirect regardless -- an unreachable logout endpoint shouldn't strand
      // the user on the page they were trying to leave
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

    // Don't await these - let them run in background so page doesn't hang
    refreshLastSyncFromApi().catch(() => {});
    checkOptionalFeatures().catch(() => {});
  });

  window.OrganizationalSidebar = {
    setWorkspaceName: setWorkspaceName,
    setLastSyncLine: setLastSyncLine,
    /** Re-read data-organizational-active on body and highlight nav. */
    setActiveFromBody: applyActiveFromBody,
    refreshLastSyncFromApi: refreshLastSyncFromApi,
    slugFromPath: slugFromPath,
    checkOptionalFeatures: checkOptionalFeatures,
  };

  window.OrganizationalHeader = {
    setOrg: setHeaderOrg,
  };
})();
