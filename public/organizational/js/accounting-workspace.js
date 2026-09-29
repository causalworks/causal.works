/* accounting-workspace.js — Coordinator for the merged Accounting page (Transactions tab +
 * Bank Reconciliation tab + Approval Policy tab). Modeled directly on funders-workspace.js
 * (Grants/Donors): owns the single org load and tab switching; sub-modules (ledger.js,
 * bank-reconciliation.js) register their init(slug) under window.OrganizationalAccounting and
 * are called eagerly once org load succeeds, same "load all panes up front, just toggle
 * visibility" approach Funders already uses -- not a new pattern.
 *
 * This was previously two separate top-level sidebar entries ("Ledger" and "Bank
 * Reconciliation") on their own pages; folded into one "Accounting" entry with tabs.
 * Navigation/routing only -- none of ledger.js's or bank-reconciliation.js's actual logic
 * changed, they just no longer bootstrap themselves (org load, loading/dashboard visibility)
 * since the coordinator now owns that, matching how grants.js/donors.js defer to
 * funders-workspace.js instead of each doing their own page-level bootstrap.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  // ── State ──
  let currentSlug = '';
  let currentOrg  = null;
  let activeTab   = 'dashboard'; // 'dashboard' | 'transactions' | 'bank-reconciliation' | 'approval-policy' | 'purchases' | 'sales' | 'fixed-assets'

  // ── DOM refs ──
  const errEl     = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl    = document.getElementById('organizational-org-dashboard');
  const titleEl   = document.getElementById('organizational-org-title');

  const tabButtons = document.querySelectorAll('#organizational-accounting-workspace-tabs .organizational-tab');
  const panes = {
    dashboard: document.getElementById('organizational-accounting-tab-dashboard'),
    transactions: document.getElementById('organizational-accounting-tab-transactions'),
    'bank-reconciliation': document.getElementById('organizational-accounting-tab-bank-reconciliation'),
    'approval-policy': document.getElementById('organizational-accounting-tab-approval-policy'),
    purchases: document.getElementById('organizational-accounting-tab-purchases'),
    sales: document.getElementById('organizational-accounting-tab-sales'),
    'fixed-assets': document.getElementById('organizational-accounting-tab-fixed-assets'),
    'expense-claims': document.getElementById('organizational-accounting-tab-expense-claims'),
    'board-designations': document.getElementById('organizational-accounting-tab-board-designations'),
    'find-recode': document.getElementById('organizational-accounting-tab-find-recode'),
    'gift-postings': document.getElementById('organizational-accounting-tab-gift-postings'),
  };

  // ── Helpers ──
  function showPageError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  // Canonical URL per tab -- 'dashboard' owns the bare /accounting name (the module's landing
  // view); 'transactions' now gets its own /transactions segment; the rest keep the flat sibling
  // URLs they already had before this restructure (bank-reconciliation never had a second name,
  // approval-policy never had its own URL before -- it was a button that opened a sliding panel
  // on the old Ledger page, not a route).
  const TAB_URL_SEGMENT = {
    dashboard: 'accounting',
    transactions: 'transactions',
    'bank-reconciliation': 'bank-reconciliation',
    'approval-policy': 'approval-policy',
    purchases: 'purchases',
    sales: 'sales',
    'fixed-assets': 'fixed-assets',
    'expense-claims': 'expense-claims',
    'board-designations': 'board-designations',
    'find-recode': 'find-recode',
    'gift-postings': 'gift-postings',
  };
  const TAB_TITLES = {
    dashboard: 'Dashboard', transactions: 'Transactions', 'bank-reconciliation': 'Bank Reconciliation', 'approval-policy': 'Approval Policy',
    purchases: 'Purchases', sales: 'Sales', 'fixed-assets': 'Fixed Assets', 'expense-claims': 'Expense Claims',
    'board-designations': 'Board Designations', 'find-recode': 'Find & Recode', 'gift-postings': 'Gift Postings',
  };

  // Accepts /accounting (canonical, now the Dashboard landing view), /ledger and /transactions
  // (Transactions -- /ledger is the legacy alias preserved from before this restructure),
  // /bank-reconciliation, /approval-policy, /purchases, /sales. Contacts moved to its own
  // standalone page/route (contacts.html) -- no longer part of this tab coordinator.
  function parseSlugAndTab() {
    const path = window.location.pathname || '';
    let m = path.match(/^\/organizational\/o\/([^/]+)\/accounting\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'dashboard' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/ledger\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'transactions' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/transactions\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'transactions' };
    m = path.match(/^\/organizational\/o\/([^/]+)\/bank-reconciliation\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'bank-reconciliation' };
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
    m = path.match(/^\/organizational\/o\/([^/]+)\/gift-postings\/?$/);
    if (m) return { slug: decodeURIComponent(m[1]), tab: 'gift-postings' };
    return { slug: '', tab: 'dashboard' };
  }

  function syncUrlState() {
    if (!currentSlug || !window.history || !window.history.replaceState) return;
    const path = '/organizational/o/' + encodeURIComponent(currentSlug) + '/' + TAB_URL_SEGMENT[activeTab];
    if (path !== window.location.pathname) {
      window.history.replaceState(null, '', path + window.location.search);
    }
  }

  // ── Shared state API ──
  window.OrganizationalAccounting.getOrg = function () { return currentOrg; };
  window.OrganizationalAccounting.getSlug = function () { return currentSlug; };

  // ── Tab switching ──
  function switchTab(tab) {
    if (!panes[tab]) return;
    activeTab = tab;
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.section === tab); });
    Object.keys(panes).forEach(function (k) { if (panes[k]) panes[k].hidden = (k !== tab); });
    if (titleEl) titleEl.textContent = 'Accounting | ' + TAB_TITLES[tab];
    syncUrlState();
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (this.dataset.section) switchTab(this.dataset.section);
    });
  });

  // ── Org load ──
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

    // Reflect the tab determined by the URL, then sync the URL to match (handles e.g. legacy
    // /ledger and /bank-reconciliation aliases, trailing slash normalization).
    switchTab(activeTab);

    // Eager init: every pane's data loads up front, same reasoning Funders documents for its
    // own dual-init -- avoids lazy-init re-entry bugs from rapid tab switching.
    const initDashboard = window.OrganizationalAccounting.dashboard
      && typeof window.OrganizationalAccounting.dashboard.init === 'function'
      ? window.OrganizationalAccounting.dashboard.init(slug) : Promise.resolve();
    const initTransactions = window.OrganizationalAccounting.transactions
      && typeof window.OrganizationalAccounting.transactions.init === 'function'
      ? window.OrganizationalAccounting.transactions.init(slug) : Promise.resolve();
    const initBankRecon = window.OrganizationalAccounting.bankReconciliation
      && typeof window.OrganizationalAccounting.bankReconciliation.init === 'function'
      ? window.OrganizationalAccounting.bankReconciliation.init(slug) : Promise.resolve();
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
    await Promise.all([initDashboard, initTransactions, initBankRecon, initApprovalPolicy, initPurchases, initSales, initFixedAssets, initExpenseClaims, initBoardDesignations, initFindRecode, initGiftPostings]);
  }

  // ── Boot ──
  load().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showPageError('Could not load workspace.');
    console.error('Accounting workspace load error:', e);
  });
})();
