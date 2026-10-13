/* module-reports-link.js -- a "Reports" tab on Budget, Accounting, Funding and Membership (a button on Sponsored Projects).
   It opens that module's reports inside the module: a list of the module's reports under the tab row, and the chosen report
   below it, in place of the module's own content until another tab is chosen. The report itself is the Reports page shown
   in embedded mode (?embed=1: no header, sidebar or title), so the reports exist in one place only (js/reports.js).
   Loaded after each page's own workspace script so it does not take part in that script's tab switching. */
(function () {
  'use strict';
  var m = /^\/organizational\/o\/([^/]+)\//.exec(window.location.pathname || '');
  if (!m) return;
  var slug = decodeURIComponent(m[1]);
  var active = document.body.getAttribute('data-organizational-active');

  var BOARD = ['board', 'Board report'];
  var CASH = ['cash-forecast', 'Cash forecast'];
  var ACTIVITY = ['activity', 'Activity log'];
  var PAGES = {
    budget: {
      row: '#organizational-budget-workspace-tabs', after: '[data-section="scenarios"]',
      anchor: '.organizational-budget-sticky-header',
      hideInside: ['#organizational-budget-stat-strip', '#organizational-budget-filter-bar', '#organizational-budget-top-scroll-row'],
      reports: [['budget', 'Budget views'], BOARD, CASH, ['990', '990 Part IX: functional expenses'], ACTIVITY],
    },
    accounting: {
      row: '#organizational-accounting-workspace-tabs', after: '[data-section="gift-postings"]',
      reports: [['financial-position', 'Statement of Financial Position'], ['statement-of-activities', 'Statement of Activities'], ['stmt-functional-expenses', 'Statement of Functional Expenses'], ['cash-flows', 'Statement of Cash Flows'], ['balance-sheet', 'Balance sheet'], ['trial-balance', 'Trial Balance'], ['general-ledger', 'General Ledger'], ['account-transactions', 'Account Transactions'], ['reconciliation', 'Reconciliation and close'], CASH, ['1099', '1099 Report']],
    },
    grants: {
      row: '#organizational-funders-workspace-tabs', after: '[data-section="donors"]',
      reports: [['giving-summary', 'Giving summary'], BOARD, ACTIVITY, ['grant-reports', 'Grant reports (per grant)']],
    },
    membership: { row: '.organizational-tabs', after: '[data-membership-tab="payments"]', reports: [], label: 'Membership' },
    'sponsored-projects': { button: '#organizational-sp-add-btn', reports: [], label: 'Sponsorship' },
  };
  var cfg = PAGES[active];
  if (!cfg) return;

  var base = '/organizational/o/' + encodeURIComponent(slug);
  var allReportsHref = base + '/reports';
  var anchorEl = null, row = null, tabBtn = null, pane = null, frame = null, sel = null, prevActive = null, open = false;
  var hidden = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function srcFor(key) {
    if (key === 'cash-forecast') return base + '/reports/cash-forecast?embed=1';
    if (key === 'grant-reports') return allReportsHref + '?only=grant-reports&embed=1';
    return allReportsHref + '?report=' + encodeURIComponent(key) + '&embed=1';
  }
  function store(k, v) { try { if (v === undefined) return window.sessionStorage.getItem('orgRpt-' + active + k); window.sessionStorage.setItem('orgRpt-' + active + k, v); } catch (e) {  } return null; }

  function buildPane() {
    pane = document.createElement('div');
    pane.id = 'organizational-module-reports-pane';
    pane.hidden = true;
    pane.style.cssText = 'padding:12px 0;';
    if (!cfg.reports.length) {
      pane.innerHTML = '<p class="organizational-hint" style="margin:0;">There are no reports for ' + esc(cfg.label || 'this module') + ' yet. <a href="' + allReportsHref + '">See all reports</a>.</p>';
      return;
    }
    pane.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">'
      + '<label class="organizational-hint" for="organizational-module-reports-select">Report</label>'
      + '<select id="organizational-module-reports-select" class="organizational-select" style="width:auto;min-width:280px;"><option value="">Choose a report…</option>'
      + cfg.reports.map(function (r) { return '<option value="' + esc(r[0]) + '">' + esc(r[1]) + '</option>'; }).join('')
      + '</select><a class="organizational-hint" href="' + allReportsHref + '">All reports</a></div>'
      + '<iframe id="organizational-module-reports-frame" title="Report" style="width:100%;border:0;min-height:60vh;display:none;"></iframe>';
    sel = pane.querySelector('select');
    frame = pane.querySelector('iframe');
    sel.addEventListener('change', function () { show(sel.value); });
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== 'organizational-embed-height' || !frame) return;
      if (frame.contentWindow !== e.source) return;
      frame.style.height = Math.max(Number(e.data.height) || 0, 300) + 'px';
    });
  }

  function show(key) {
    if (!frame) return;
    if (!key) { frame.style.display = 'none'; frame.removeAttribute('src'); return; }
    frame.style.height = '70vh';
    frame.style.display = 'block';
    frame.src = srcFor(key);
    store('last', key);
  }

  function hideFollowing() {
    hidden = [];
    var list = [];
    (cfg.hideInside || []).forEach(function (s) { var el = document.querySelector(s); if (el) list.push(el); });
    for (var n = anchorEl.nextElementSibling; n; n = n.nextElementSibling) if (n !== pane) list.push(n);
    list.forEach(function (el) { hidden.push([el, el.style.display]); el.style.display = 'none'; });
  }
  function restore() { hidden.forEach(function (h) { h[0].style.display = h[1]; }); hidden = []; }

  function openPane() {
    if (open) return;
    open = true;
    if (row) {
      prevActive = row.querySelector('.organizational-tab.active');
      row.querySelectorAll('.organizational-tab.active').forEach(function (b) { b.classList.remove('active'); });
    }
    if (tabBtn) tabBtn.classList.add('active');
    hideFollowing();
    pane.hidden = false;
    if (sel && !sel.value) {
      var last = store('last');
      if (last && cfg.reports.some(function (r) { return r[0] === last; })) { sel.value = last; show(last); }
    }
  }
  function closePane() {
    if (!open) return;
    open = false;
    pane.hidden = true;
    restore();
    if (tabBtn) tabBtn.classList.remove('active');
    if (row && !row.querySelector('.organizational-tab.active') && prevActive) prevActive.classList.add('active');
  }

  function init() {
    if (document.getElementById('organizational-module-reports-tab')) return;
    tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.id = 'organizational-module-reports-tab';
    tabBtn.textContent = 'Reports';
    if (cfg.button) {
      var add = document.querySelector(cfg.button);
      if (!add) return;
      tabBtn.className = 'organizational-btn organizational-btn-outline';
      tabBtn.style.cssText = 'margin-right:8px;';
      add.parentNode.insertBefore(tabBtn, add);
      anchorEl = add.parentNode;
    } else {
      row = document.querySelector(cfg.row);
      var after = row && row.querySelector(cfg.after);
      if (!row || !after) return;
      tabBtn.className = 'organizational-tab';
      after.parentNode.insertBefore(tabBtn, after.nextSibling);
      anchorEl = cfg.anchor ? row.closest(cfg.anchor) : row;
      if (!anchorEl) return;
      row.addEventListener('click', function (e) { if (open && !e.target.closest('#organizational-module-reports-tab')) closePane(); }, true);
    }
    buildPane();
    anchorEl.parentNode.insertBefore(pane, anchorEl.nextSibling);
    tabBtn.addEventListener('click', function () { if (open && cfg.button) closePane(); else openPane(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
