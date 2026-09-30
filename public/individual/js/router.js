/**
 * app-router.js — SPA router for individual side
 */
(function () {
  'use strict';

  function causalAddressForMovesCopy(me) {
    return String(me.causal_address || me.forwarding_address || '').trim();
  }

  function appPath() {
    const p = location.pathname || '';
    return p.endsWith('app.html') ? p : '/app.html';
  }

  async function checkAuth() {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) {
      window.location.href = '/login';
      return false;
    }
    const me = await res.json();
    if (String(me.email || '').trim().toLowerCase() === 'loopy@causal.works') {
      window.location.replace('/admin');
      return false;
    }
    window._causalBrokerage = me.brokerage || null;
    window._causalBank = me.bank || null;
    const cc = String(me.location_country || '').trim().toUpperCase();
    window._causalUserCountry = cc || null;
    window._causalUserLocationRaw = me.location_zip != null ? String(me.location_zip).trim() : '';
    window._causalUserEmail = String(me.email || '').trim();
    window._causalOrganizationalAccess = !!me.coop_access;
    window.CAUSAL_ADDRESS = causalAddressForMovesCopy(me);
    window.USER_TYPE = me.user_type || 'individual_basic';
    window.CAUSAL_IS_DEMO = (window.USER_TYPE === 'demo');
    window.DIGEST_FREQUENCY = me.digest_frequency || 'off';
    window._causalOnboardingComplete = !!me.onboarding_complete;
    window._causalHasFirstAction = !!me.has_completed_first_action;
    window._causalVisitedFinancial = !!me.visited_financial;

    // First-run wizard: demo accounts are pre-seeded and skip onboarding entirely.
    // Gate is purely onboarding_step === 'complete' (server/individual/routes/user.js) —
    // do not re-add field-specific checks here; add new steps to ONBOARDING_STEPS instead.
    if (!window.CAUSAL_IS_DEMO && !window._causalOnboardingComplete) {
      window.location.href = '/onboarding';
      return false;
    }

    document.body.style.visibility = 'visible';
    return true;
  }

  // All nav sections are visible right after onboarding now (removed 2026-08-01) — onboarding
  // itself (location + followed orgs) is enough to seed real content in Proxies/Moves, so there's
  // no reason to hide Ledger/Systems behind a first-action gate. Sections with genuinely no data
  // yet show their own empty-state placeholder instead of being hidden entirely.
  function applyNavUnlockState() {
    document.querySelectorAll('.individual-nav-item[data-section="proxies"], .individual-nav-item[data-section="ledger"], .individual-nav-item[data-section="turnarounds"]').forEach((el) => {
      el.style.display = '';
    });
  }

  function emailToInitials(email) {
    const local = String(email).split('@')[0] || '';
    if (!local) return null;
    const parts = local.split(/[._+-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  function updateAccountCircleLabel() {
    const el = document.getElementById('account-circle-label');
    const trig = document.getElementById('account-menu-trigger');
    const profileName = document.getElementById('ws-profile-name');
    if (!el || !trig) return;
    const initials = emailToInitials(window._causalUserEmail || '');
    if (initials) {
      el.textContent = initials;
      trig.classList.remove('account-circle-glyph');
    } else {
      el.textContent = '👤';
      trig.classList.add('account-circle-glyph');
    }
    if (profileName) {
      profileName.textContent = 'My account';
    }
  }

  function closeAccountMenu() {
    const dd = document.getElementById('account-dropdown');
    const trig = document.getElementById('account-menu-trigger');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (trig) trig.setAttribute('aria-expanded', 'false');
  }

  function toggleAccountMenu(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('account-dropdown');
    const trig = document.getElementById('account-menu-trigger');
    if (!dd) return;
    const opening = dd.hidden;
    if (opening) {
      const ddEmail = document.getElementById('account-dropdown-email');
      if (ddEmail) ddEmail.textContent = window._causalUserEmail || '';
    }
    dd.hidden = !opening;
    dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
    if (trig) trig.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }


  function accountMenuOpenSettings() {
    closeAccountMenu();
    if (typeof openSettings === 'function') openSettings();
  }

  function accountMenuOpenLedger() {
    closeAccountMenu();
    showIndividualSection('ledger');
  }

  function switchLedgerTab(tab) {
    ['position', 'giving', 'actions', 'responses'].forEach(t => {
      const panel = document.getElementById('ledger-tab-' + t);
      const btn = document.getElementById('ledger-tab-btn-' + t);
      if (panel) panel.style.display = (t === tab) ? '' : 'none';
      if (btn) btn.classList.toggle('active', t === tab);
    });
  }

  let accountMenuDocClickBound = false;
  function bindAccountMenuOutsideClick() {
    if (accountMenuDocClickBound) return;
    accountMenuDocClickBound = true;
    document.addEventListener('click', (e) => {
      const wrap = document.querySelector('.account-menu-wrap');
      const dd = document.getElementById('account-dropdown');
      if (!dd || dd.hidden) return;
      if (wrap && wrap.contains(e.target)) return;
      closeAccountMenu();
    });
  }

  // ── App2-specific functions ──

  // Stub: loadHomeDashboard (called on #home, but router redirects home → action/home)
  function loadHomeDashboard() {
    // Placeholder — home now routes to action/home
  }

  function resetLoaderFlags() {
    // Reset loader flags so content reloads when section is revisited
    if (typeof window !== 'undefined') {
      window.repsLoaded = false;
      window.attendLoaded = false;
      window.volunteerLoaded = false;
    }
  }

  function switchProxiesTab(tab) {
    document.querySelectorAll('#proxies-tab-bar .proxies-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.proxiesTab === tab);
    });
    document.querySelectorAll('#section-proxies .individual-section-tab').forEach((el) => {
      const tabId = 'section-proxies-' + tab;
      el.style.display = el.id === tabId ? 'block' : 'none';
    });
    if (tab === 'elected') {
      if (typeof loadReps === 'function') loadReps();
      if (typeof loadRaces === 'function') loadRaces();
    } else if (tab === 'financial') {
      if (typeof loadFinancialTrackingSummary === 'function') loadFinancialTrackingSummary();
      // Dated-pledge "make it a promise" UI unlocks starting the *next* visit — mark now.
      fetch('/api/user/mark-visited', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'financial' }),
      }).catch(() => {});
    } else if (tab === 'advocates') {
      if (typeof loadGiveFeed === 'function') loadGiveFeed(document.getElementById('proxies-give-list'));
    }
  }
  window.switchProxiesTab = switchProxiesTab;

  function showIndividualSection(section, subsection) {
    // Reset loader flags when changing sections
    resetLoaderFlags();

    // Track active moves subsection for auto-refresh logic
    if (section === 'moves' && subsection) {
      window._causalMovesSubTab = subsection;
    }

    // Update nav items
    document.querySelectorAll('.individual-nav-item').forEach((el) => {
      const match = subsection
        ? (el.getAttribute('data-moves-tab') === subsection || el.getAttribute('data-section') === section)
        : el.getAttribute('data-section') === section;
      el.classList.toggle('active', match);
    });

    // Update page title
    const titleMap = INDIVIDUAL_STRINGS.pageTitle;
    const subsectionTitle = INDIVIDUAL_STRINGS.subsectionTitle;
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    if (pageTitle) {
      pageTitle.textContent = titleMap[section] || 'causalworks';
      if (subsection && subsectionTitle[subsection]) {
        pageTitle.textContent += ' • ' + subsectionTitle[subsection];
      }
    }
    if (pageSubtitle) pageSubtitle.textContent = '';

    // Show/hide main sections
    document.querySelectorAll('.individual-section').forEach((el) => {
      const sectionId = 'section-' + section;
      el.classList.toggle('is-active', el.id === sectionId);
      if (el.id === sectionId) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    // Show/hide Moves subsections (home | feed)
    if (section === 'moves' && subsection) {
      document.querySelectorAll('#section-moves .individual-section-tab').forEach((el) => {
        const tabId = 'section-moves-' + subsection;
        el.style.display = el.id === tabId ? 'block' : 'none';
      });
      const stickyHeader = document.getElementById('moves-sticky-header');
      if (stickyHeader) stickyHeader.style.display = subsection === 'feed' ? 'block' : 'none';
    }

    // Show/hide Proxies subsections (elected | advocates | financial) — Elected
    // is first in tab order and the default landing tab.
    if (section === 'proxies') {
      switchProxiesTab(subsection || 'elected');
    }

    // Call section-specific loaders if they exist
    if (section === 'moves') {
      if (subsection === 'feed' && typeof loadMovesFeedData === 'function') {
        loadMovesFeedData();
      } else if (typeof loadMovesHomeData === 'function') {
        loadMovesHomeData();
      }
    } else if (section === 'workshop' && typeof loadWorkshopHome === 'function') {
      loadWorkshopHome();
    } else if (section === 'ledger' && typeof loadLedgerData === 'function') {
      loadLedgerData();
    } else if (section === 'turnarounds' && typeof loadTurnaroundsData === 'function') {
      loadTurnaroundsData();
    }
  }

  function trackHashPageView(hash) {
    if (typeof window.gtag !== 'function') return;
    const path = '/individual/' + (hash || 'home');
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: location.origin + path,
      page_title: document.title,
    });
  }

  function applyRoute() {
    const hash = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    trackHashPageView(hash);
    const parts = hash.split('/').filter(Boolean);
    let section = parts[0] || 'moves';
    const subsection = parts[1] || null;

    // Canonical: 'moves' (nav label) — 'act'/'action' kept as silent legacy aliases, same handler.
    if (section === 'moves' || section === 'act' || section === 'action') {
      // Old Act subsections (petition/showup/give/volunteer/reps) all collapse into the unified feed.
      const feedSubsections = ['petition', 'showup', 'give', 'volunteer'];
      if (subsection === 'reps' || section === 'action' && subsection === 'government') {
        showIndividualSection('proxies', 'elected');
      } else if (subsection === 'home' || !subsection) {
        showIndividualSection('moves', 'home');
      } else if (feedSubsections.includes(subsection) || subsection === 'feed') {
        showIndividualSection('moves', 'feed');
      } else {
        showIndividualSection('moves', 'home');
      }
    } else if (section === 'proxies' || section === 'representation') {
      // Canonical: 'proxies' (nav label) — 'representation' kept as a silent legacy alias.
      showIndividualSection('proxies', subsection || 'elected');
    } else if (section === 'workshop') {
      showIndividualSection('workshop');
    } else if (section === 'home') {
      showIndividualSection('moves', 'home');
    } else if (section === 'money' || section === 'assets') {
      // Legacy Money nav — redirect into Vest (bank/invest/pension all consolidated there),
      // except Give which is now Advocates.
      if (subsection === 'give') {
        showIndividualSection('proxies', 'advocates');
      } else {
        movesCurrentTab = 'vest';
        showIndividualSection('moves', 'feed');
        if (subsection === 'invest' && typeof switchVestAssetTab === 'function') {
          setTimeout(() => switchVestAssetTab('invest'), 0);
        }
      }
    } else if (section === 'organizations') {
      showIndividualSection('proxies', 'advocates');
    } else if (section === 'ledger') {
      showIndividualSection('ledger');
    } else if (section === 'turnarounds') {
      showIndividualSection('turnarounds');
      if (subsection && typeof switchFrameworkTab === 'function') {
        setTimeout(() => switchFrameworkTab(subsection), 0);
      }
    } else if (section === 'representatives' || section === 'levers') {
      showIndividualSection('proxies', 'elected');
    } else if (section === 'dashboard') {
      showIndividualSection('moves', 'home');
    } else {
      showIndividualSection('moves', 'home');
    }
  }

  document.body.style.visibility = 'hidden';

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (typeof closeSettings === 'function') closeSettings();
    if (typeof closeLedgerPanel === 'function') closeLedgerPanel();
    if (typeof closeRepProfile === 'function') closeRepProfile();
    closeAccountMenu();
    if (typeof closeCallPopup === 'function') closeCallPopup();
    if (typeof closeContribute === 'function') closeContribute();
  });

  // ── Demo mode ──────────────────────────────────────────────────────────────

  function initDemoMode() {
    if (!window.CAUSAL_IS_DEMO) return;
    document.body.classList.add('demo-mode');
    const trig = document.getElementById('account-menu-trigger');
    if (trig) trig.textContent = 'DU';
    const profileName = document.getElementById('ws-profile-name');
    if (profileName) profileName.textContent = 'Demo User';
  }

  window.toggleAccountMenu = toggleAccountMenu;
  window.closeAccountMenu = closeAccountMenu;
  window.accountMenuOpenSettings = accountMenuOpenSettings;
  window.accountMenuOpenLedger = accountMenuOpenLedger;
  window.switchLedgerTab = switchLedgerTab;
  window.showIndividualSection = showIndividualSection;

  window.CausalRouter = {
    applyRoute,
    appPath,
  };

  function loadChrome() {
    return Promise.all([
      fetch('/individual/header.html?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.text()).then((html) => {
        document.getElementById('individual-header').innerHTML = html;
        updateAccountCircleLabel();
        const ddEmail = document.getElementById('account-dropdown-email');
        if (ddEmail) ddEmail.textContent = window._causalUserEmail || '';
        const profileName = document.getElementById('ws-profile-name');
        if (profileName) profileName.textContent = 'My account';
        bindAccountMenuOutsideClick();

        const switchLink = document.getElementById('switch-to-cooperative');
        if (switchLink) {
          switchLink.style.display = window._causalOrganizationalAccess ? '' : 'none';
          // The static href in index.html points at the shared demo org, which is only
          // correct for the demo account -- a real account's own org is never
          // "demo-company", so that hardcoded slug sent every real user with coop_access
          // to the wrong workspace. /organizational/ resolves to the signed-in user's own
          // org (same pattern select-workspace.html uses); /demo-coop re-establishes a
          // fresh demo session first, same fix as the splash page's own Cooperative card,
          // since assuming the existing cookie is still valid can dead-end at login.
          switchLink.href = window.CAUSAL_IS_DEMO ? '/demo-coop' : '/organizational/';
        }
      }),
    ]);
  }

  checkAuth().then((ok) => {
    if (!ok) return;
    applyNavUnlockState();
    const h = (location.hash || '').replace(/^#/, '').trim();
    if (!h) {
      history.replaceState(null, '', appPath() + '#home');
    }
    loadChrome().then(() => {
      initDemoMode();
      applyRoute();
    });
  });

  window.addEventListener('hashchange', () => applyRoute());
})();
