/* accounting-workspace.js — Coordinator for the merged Accounting page (Transactions tab +
 * Banking tab + Approval Policy tab). Modeled directly on funders-workspace.js
 * (Grants/Donors): owns the single org load and tab switching; sub-modules (ledger.js,
 * banking.js) register their init(slug) under window.OrganizationalAccounting and
 * are called eagerly once org load succeeds, same "load all panes up front, just toggle
 * visibility" approach Funders already uses -- not a new pattern.
 *
 * This was previously two separate top-level sidebar entries ("Ledger" and "Bank
 * Reconciliation") on their own pages; folded into one "Accounting" entry with tabs.
 * Navigation/routing only -- none of ledger.js's or banking.js's actual logic
 * changed, they just no longer bootstrap themselves (org load, loading/dashboard visibility)
 * since the coordinator now owns that, matching how grants.js/donors.js defer to
 * funders-workspace.js instead of each doing their own page-level bootstrap.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  let currentSlug = '';
  let currentOrg  = null;
  let activeTab   = 'dashboard';

  const errEl     = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl    = document.getElementById('organizational-org-dashboard');
  const titleEl   = document.getElementById('organizational-org-title');

  const tabButtons = document.querySelectorAll('#organizational-accounting-workspace-tabs [data-section]');
  const moreBtn  = document.getElementById('organizational-accounting-more-btn');
  const moreMenu = document.getElementById('organizational-accounting-more-menu');
  const MORE_TABS = ['fixed-assets', 'find-recode', 'expense-claims', 'board-designations', 'approval-policy'];
  const panes = {
    dashboard: document.getElementById('organizational-accounting-tab-dashboard'),
    transactions: document.getElementById('organizational-accounting-tab-transactions'),
    'banking': document.getElementById('organizational-accounting-tab-banking'),
    'approval-policy': document.getElementById('organizational-accounting-tab-approval-policy'),
    purchases: document.getElementById('organizational-accounting-tab-purchases'),
    sales: document.getElementById('organizational-accounting-tab-sales'),
    'fixed-assets': document.getElementById('organizational-accounting-tab-fixed-assets'),
    'expense-claims': document.getElementById('organizational-accounting-tab-expense-claims'),
    'board-designations': document.getElementById('organizational-accounting-tab-board-designations'),
    'find-recode': document.getElementById('organizational-accounting-tab-find-recode'),
    'gift-postings': document.getElementById('organizational-accounting-tab-gift-postings'),
    'dues-postings': document.getElementById('organizational-accounting-tab-dues-postings'),
    settings: document.getElementById('organizational-accounting-tab-settings'),
  };

  function showPageError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  const TAB_URL_SEGMENT = {
    dashboard: 'accounting',
    transactions: 'transactions',
    banking: 'banking',
    'approval-policy': 'approval-policy',
    purchases: 'purchases',
    sales: 'sales',
    'fixed-assets': 'fixed-assets',
    'expense-claims': 'expense-claims',
    'board-designations': 'board-designations',
    'find-recode': 'find-recode',
    'gift-postings': 'gift-postings',
    'dues-postings': 'dues-postings',
    settings: 'accounting-settings',
  };
  const TAB_TITLES = {
    dashboard: 'Dashboard', transactions: 'Transactions', banking: 'Banking', 'approval-policy': 'Flagged Review',
    purchases: 'Purchases', sales: 'Sales', 'fixed-assets': 'Fixed Assets', 'expense-claims': 'Expense Claims',
    'board-designations': 'Board Designations', 'find-recode': 'Recode', 'gift-postings': 'Gift Postings', 'dues-postings': 'Dues Postings', settings: 'Settings',
  };

  function parseSlugAndTab() {
    const path = window.location.pathname || '';
    let m = path.match(/^\/organizational\/o\/([^/]+)\/accounting\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'dashboard' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/ledger\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'transactions' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/transactions\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'transactions' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/banking\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'banking' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/approval-policy\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'approval-policy' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/purchases\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'purchases' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/sales\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'sales' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/fixed-assets\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'fixed-assets' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/expense-claims\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'expense-claims' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/board-designations\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'board-designations' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/find-recode\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'find-recode' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/accounting-settings\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'settings' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/gift-postings\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'gift-postings' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/dues-postings\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'dues-postings' };
    return { slug: '', tab: 'dashboard' };
  }

  function syncUrlState() {
    if (!currentSlug || !window.history || !window.history.replaceState) return;
    const path = '/organizational/o/' + encodeURIComponent(currentSlug) + '/' + TAB_URL_SEGMENT[activeTab];
    if (path !== window.location.pathname) {
      const sp = new URLSearchParams(window.location.search);
      sp.delete('bill');
      sp.delete('invoice');
      sp.delete('new');
      sp.delete('txn');
      sp.delete('filter');
      sp.delete('status');
      const qs = sp.toString();
      window.history.replaceState(null, '', path + (qs ? '?' + qs : ''));
    }
  }

  window.OrganizationalAccounting.getOrg = function () { return currentOrg; };
  window.OrganizationalAccounting.getSlug = function () { return currentSlug; };

  const FIT_SKIP = { transactions: true };
  const LIST_REGIONS = '.organizational-table-wrap, #organizational-banking-cards';
  let fitQueued = false;

  function fitActivePane() {
    if (FIT_SKIP[activeTab]) return;
    const pane = panes[activeTab];
    if (!pane || pane.hidden) return;
    const regions = Array.prototype.slice.call(pane.querySelectorAll(LIST_REGIONS));
    const keep = [pane].concat(regions).map(function (el) { return [el, el.scrollTop]; });
    pane.style.overflowY = '';
    pane.style.maxHeight = '';
    regions.forEach(function (r) { r.style.maxHeight = ''; r.style.overflowY = ''; });
    if (window.innerWidth >= 900) {
      const room = function (el) { return Math.max(200, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 12)); };
      const lists = regions.filter(function (r) { return r.offsetParent !== null && r.getBoundingClientRect().height > 0; });
      if (lists.length === 1 && room(lists[0]) >= 260) {
        lists[0].style.overflowY = 'auto';
        lists[0].style.maxHeight = room(lists[0]) + 'px';
        const over = document.documentElement.scrollHeight - window.innerHeight;
        if (over > 0) lists[0].style.maxHeight = Math.max(200, room(lists[0]) - over) + 'px';
      } else {
        pane.style.overflowY = 'auto';
        pane.style.maxHeight = room(pane) + 'px';
        if (lists.length > 1) {
          lists[0].style.overflowY = 'auto';
          lists[0].style.maxHeight = Math.max(200, Math.floor(room(pane) * 0.55)) + 'px';
        }
      }
    }
    keep.forEach(function (k) { k[0].scrollTop = k[1]; });
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

  function switchTab(tab) {
    if (!panes[tab]) return;
    if (tab === activeTab) {
      const same = window.OrganizationalAccounting[{ purchases: 'purchases', sales: 'sales', transactions: 'transactions' }[tab]];
      if (same && same.closePage) same.closePage();
    }
    const pu = window.OrganizationalAccounting.purchases;
    if (activeTab === 'purchases' && tab !== 'purchases' && pu && pu.closePage) pu.closePage({ silent: true });
    const tr = window.OrganizationalAccounting.transactions;
    if (activeTab === 'transactions' && tab !== 'transactions' && tr && tr.closePage) tr.closePage({ silent: true });
    const sa = window.OrganizationalAccounting.sales;
    if (activeTab === 'sales' && tab !== 'sales' && sa && sa.closePage) sa.closePage({ silent: true });
    activeTab = tab;
    tabButtons.forEach(function (b) {
      const on = b.dataset.section === tab;
      if (b.classList.contains('organizational-tab') || b.classList.contains('organizational-budget-settings-btn')) b.classList.toggle('active', on);
      else b.style.fontWeight = on ? '600' : '';
    });
    if (moreBtn) {
      const inMore = MORE_TABS.indexOf(tab) >= 0;
      moreBtn.classList.toggle('active', inMore);
      moreBtn.textContent = (inMore ? TAB_TITLES[tab] : 'More') + ' ▾';
    }
    closeMoreMenu();
    Object.keys(panes).forEach(function (k) { if (panes[k]) panes[k].hidden = (k !== tab); });
    if (titleEl) titleEl.textContent = 'Accounting | ' + TAB_TITLES[tab];
    syncUrlState();
    queueFit();
    const tx = window.OrganizationalAccounting.transactions;
    if (tab === 'transactions' && tx && typeof tx.fit === 'function') window.requestAnimationFrame(tx.fit);
  }

  window.OrganizationalAccounting.switchTab = switchTab;
  window.addEventListener('popstate', function () {
    const t = parseSlugAndTab().tab;
    if (t && t !== activeTab && panes[t]) switchTab(t);
  });

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (this.dataset.section) switchTab(this.dataset.section);
    });
  });

  function closeMoreMenu() {
    if (!moreMenu) return;
    moreMenu.hidden = true;
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
  }
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!moreMenu.contains(e.target)) closeMoreMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMoreMenu(); });
  }

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

    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    if (access && !access.can_read_accounting) {
      if (loadingEl) loadingEl.hidden = true;
      const who = (access.admins && access.admins.length) ? ' Ask ' + access.admins.join(' or ') + '.' : ' Ask an admin of this workspace.';
      showPageError('You do not have access to Accounting in this workspace.' + who);
      return;
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl)    dashEl.hidden    = false;

    switchTab(activeTab);

    const initDashboard = window.OrganizationalAccounting.dashboard
      && typeof window.OrganizationalAccounting.dashboard.init === 'function'
      ? window.OrganizationalAccounting.dashboard.init(slug) : Promise.resolve();
    const initTransactions = window.OrganizationalAccounting.transactions
      && typeof window.OrganizationalAccounting.transactions.init === 'function'
      ? window.OrganizationalAccounting.transactions.init(slug) : Promise.resolve();
    const initBankRecon = window.OrganizationalAccounting.banking
      && typeof window.OrganizationalAccounting.banking.init === 'function'
      ? window.OrganizationalAccounting.banking.init(slug) : Promise.resolve();
    const initApprovalPolicy = window.OrganizationalAccounting.approvalPolicy
      && typeof window.OrganizationalAccounting.approvalPolicy.init === 'function'
      ? window.OrganizationalAccounting.approvalPolicy.init(slug) : Promise.resolve();
    const initPurchases = window.OrganizationalAccounting.purchases
      && typeof window.OrganizationalAccounting.purchases.init === 'function'
      ? window.OrganizationalAccounting.purchases.init(slug) : Promise.resolve();
    const initSales = window.OrganizationalAccounting.sales
      && typeof window.OrganizationalAccounting.sales.init === 'function'
      ? window.OrganizationalAccounting.sales.init(slug) : Promise.resolve();
    const initFixedAssets = window.OrganizationalAccounting.fixedAssets
      && typeof window.OrganizationalAccounting.fixedAssets.init === 'function'
      ? window.OrganizationalAccounting.fixedAssets.init(slug) : Promise.resolve();
    const initExpenseClaims = window.OrganizationalAccounting.expenseClaims
      && typeof window.OrganizationalAccounting.expenseClaims.init === 'function'
      ? window.OrganizationalAccounting.expenseClaims.init(slug) : Promise.resolve();
    const initBoardDesignations = window.OrganizationalAccounting.boardDesignations
      && typeof window.OrganizationalAccounting.boardDesignations.init === 'function'
      ? window.OrganizationalAccounting.boardDesignations.init(slug) : Promise.resolve();
    const initFindRecode = window.OrganizationalAccounting.findRecode
      && typeof window.OrganizationalAccounting.findRecode.init === 'function'
      ? window.OrganizationalAccounting.findRecode.init(slug) : Promise.resolve();
    const initGiftPostings = window.OrganizationalAccounting.giftPostings
      && typeof window.OrganizationalAccounting.giftPostings.init === 'function'
      ? window.OrganizationalAccounting.giftPostings.init(slug) : Promise.resolve();
    const duesTab = document.getElementById('organizational-accounting-dues-tab');
    if (duesTab) duesTab.hidden = !(currentOrg && currentOrg.membership_enabled);
    const initDuesPostings = window.OrganizationalAccounting.duesPostings && currentOrg && currentOrg.membership_enabled
      ? window.OrganizationalAccounting.duesPostings.init(slug) : Promise.resolve();
    const initSettings = window.OrganizationalAccounting.settings
      && typeof window.OrganizationalAccounting.settings.init === 'function'
      ? window.OrganizationalAccounting.settings.init(slug) : Promise.resolve();
    await Promise.all([initDashboard, initTransactions, initBankRecon, initApprovalPolicy, initPurchases, initSales, initFixedAssets, initExpenseClaims, initBoardDesignations, initFindRecode, initGiftPostings, initDuesPostings, initSettings]);
  }

  load().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showPageError('Could not load workspace.');
    console.error('Accounting workspace load error:', e);
  });
})();
