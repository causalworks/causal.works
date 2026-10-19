/* module-reports-link.js -- a "Reports" tab on Budget, Accounting, Funding and Membership.
   It opens that module's reports inside the module: the module's reports as grouped links (list in reports-index.js), and the
   chosen report in place of the list, in place of the module's own content until another tab is chosen. The report itself is the Reports page shown
   in embedded mode (?embed=1: no header, sidebar or title), so the reports exist in one place only (js/reports.js).
   Loaded after each page's own workspace script so it does not take part in that script's tab switching. */
(function () {
  'use strict';
  var m = /^\/organizational\/o\/([^/]+)\//.exec(window.location.pathname || '');
  if (!m) return;
  var slug = decodeURIComponent(m[1]);
  var active = document.body.getAttribute('data-organizational-active');

  var PAGES = {
    budget: { row: '#organizational-budget-workspace-tabs', after: '[data-section="scenarios"]', anchor: '.organizational-budget-sticky-header',
      hideInside: ['#organizational-budget-stat-strip', '#organizational-budget-filter-bar', '#organizational-budget-top-scroll-row'] },
    accounting: { row: '#organizational-accounting-workspace-tabs', after: '[data-section="gift-postings"]' },
    funding: { row: '#organizational-funders-workspace-tabs', after: '[data-section="donors"]' },
    membership: { row: '.organizational-tabs', after: '[data-membership-tab="payments"]', label: 'Membership' },
  };
  var MODULE_OF = { grants: 'funding' };
  var cfg = PAGES[MODULE_OF[active] || active];
  var moduleKey = MODULE_OF[active] || active;
  if (!cfg) return;

  var base = '/organizational/o/' + encodeURIComponent(slug);
  var allReportsHref = base + '/reports';
  var anchorEl = null, row = null, tabBtn = null, pane = null, frame = null, prevActive = null, open = false;
  var hidden = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function srcFor(key) {
    if (key === 'cash-forecast') return base + '/reports/cash-forecast?embed=1';
    if (key === 'grant-reports') return allReportsHref + '?only=grant-reports&embed=1';
    return allReportsHref + '?report=' + encodeURIComponent(key) + '&embed=1';
  }

  var IDX = window.OrganizationalReportsIndex;
  var listEl = null, viewEl = null, titleEl = null, reports = [];

  function buildPane() {
    pane = document.createElement('div');
    pane.id = 'organizational-module-reports-pane';
    pane.hidden = true;
    pane.style.cssText = 'padding:12px 0;';
    if (!IDX || !IDX.forModule(moduleKey).length) {
      pane.innerHTML = '<p class="organizational-hint" style="margin:0;">There are no reports for ' + esc(cfg.label || 'this module') + ' yet. <a href="' + allReportsHref + '">See all reports</a>.</p>';
      return;
    }
    pane.innerHTML = '<div id="organizational-module-reports-list"></div>'
      + '<div id="organizational-module-reports-view" hidden><div style="display:flex;gap:12px;align-items:baseline;margin-bottom:8px;">'
      + '<a href="#" data-reports-back style="color:var(--organizational-accent);text-decoration:underline;">All reports</a>'
      + '<b id="organizational-module-reports-title"></b></div>'
      + '<iframe id="organizational-module-reports-frame" title="Report" style="width:100%;border:0;min-height:60vh;"></iframe></div>'
      + '<p class="organizational-hint" style="margin:12px 0 0;"><a href="' + allReportsHref + '">All reports across modules</a></p>';
    listEl = pane.querySelector('#organizational-module-reports-list');
    viewEl = pane.querySelector('#organizational-module-reports-view');
    titleEl = pane.querySelector('#organizational-module-reports-title');
    frame = pane.querySelector('iframe');
    pane.addEventListener('click', function (e) {
      var back = e.target.closest('[data-reports-back]');
      if (back) { e.preventDefault(); show(''); return; }
      var a = e.target.closest('[data-report-key]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      show(a.getAttribute('data-report-key'));
    });
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== 'organizational-embed-height' || !frame) return;
      if (frame.contentWindow !== e.source) return;
      frame.style.height = Math.max(Number(e.data.height) || 0, 300) + 'px';
    });
    var loadAccess = window.OrganizationalMyAccess ? window.OrganizationalMyAccess(slug) : Promise.resolve(null);
    loadAccess.catch(function () { return null; }).then(function (access) {
      reports = IDX.render(listEl, { slug: slug, access: access, module: moduleKey });
    });
  }

  function show(key) {
    if (!frame) return;
    if (!key) { viewEl.hidden = true; listEl.hidden = false; frame.removeAttribute('src'); return; }
    var r = null;
    for (var i = 0; i < reports.length; i++) if (reports[i].key === key) r = reports[i];
    titleEl.textContent = r ? r.name : '';
    listEl.hidden = true;
    viewEl.hidden = false;
    frame.style.height = '70vh';
    frame.src = srcFor(key);
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
    if (frame && viewEl && !viewEl.hidden) show('');
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
