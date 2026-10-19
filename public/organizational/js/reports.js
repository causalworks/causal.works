(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const slugLineEl = document.getElementById('organizational-org-slug-line');
  const roleBadgeEl = document.getElementById('organizational-org-role-badge');
  const reportsFy = document.getElementById('organizational-reports-fy');
  const boardReportA = document.getElementById('organizational-report-board');
  const grantReportsTbody = document.getElementById('organizational-grant-reports-tbody');

  const INDEX_PANEL = 'reports-index';
  const DETAIL_PANELS = [
    'report-detail-board', 'report-detail-990', 'report-detail-activity',
    'report-detail-budget', 'report-detail-giving-summary', 'report-detail-balance-sheet',
    'report-detail-reconciliation',
    'report-detail-financial-position', 'report-detail-statement-of-activities',
    'report-detail-stmt-functional-expenses', 'report-detail-cash-flows',
    'report-detail-trial-balance', 'report-detail-general-ledger', 'report-detail-account-transactions',
    'report-detail-receivables-schedule', 'report-detail-payables-schedule',
    'report-detail-1099',
  ];

  let currentSlug = '';
  let currentRole = '';
  let grantsCache = [];
  const grantReportsSorter = grantReportsTbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(grantReportsTbody.closest('table'), {
    columns: [
      { key: 'name', type: 'text', get: (g) => g.name },
      { key: 'funder', type: 'text', get: (g) => g.funder },
      { key: 'status', type: 'text', get: (g) => g.status },
      null,
    ],
    onChange: () => renderGrantReports(),
  }) : null;
  function reportSorter(tbodyId, columns, onChange) {
    const tb = document.getElementById(tbodyId);
    return tb && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tb.closest('table'), { columns: columns, onChange: onChange }) : null;
  }
  function sortedIn(sorter, rows) { return sorter ? sorter.sortRows(rows) : rows; }
  function centsOrNull(v) { const n = Number(v); return n ? n : null; }
  let sfpCache = null;
  let soaCache = null;
  let sfeCache = null;
  let tbCache = null;
  let bsCache = null;
  const sfpSorter = reportSorter('organizational-sfp-tbody', [
    { key: 'name', type: 'text', get: (r) => r.name },
    { key: 'code', type: 'text', get: (r) => r.code },
    { key: 'balance', type: 'number', get: (r) => r.balance_cents },
  ], function () { renderFinancialPosition(); });
  const soaSorter = reportSorter('organizational-soa-tbody', [
    { key: 'name', type: 'text', get: (r) => r.name },
    { key: 'code', type: 'text', get: (r) => r.code },
    { key: 'without', type: 'number', get: (r) => r.without },
    { key: 'with', type: 'number', get: (r) => r.with },
    { key: 'total', type: 'number', get: (r) => (Number(r.without) || 0) + (Number(r.with) || 0) },
  ], function () { renderStatementOfActivities(); });
  const sfeSorter = reportSorter('organizational-sfe-tbody', [
    { key: 'code', type: 'text', get: (l) => l.code },
    { key: 'name', type: 'text', get: (l) => l.name },
    { key: 'total', type: 'number', get: (l) => l.total_cents },
    { key: 'program', type: 'number', get: (l) => l.program_services_cents },
    { key: 'mgmt', type: 'number', get: (l) => l.mgmt_general_cents },
    { key: 'fundraising', type: 'number', get: (l) => l.fundraising_cents },
  ], function () { renderStmtFunctionalExpenses(); });
  const tbSorter = reportSorter('organizational-tb-tbody', [
    { key: 'code', type: 'text', get: (l) => l.code },
    { key: 'name', type: 'text', get: (l) => l.name },
    { key: 'type', type: 'text', get: (l) => l.type },
    { key: 'debit', type: 'number', get: (l) => centsOrNull(l.debit_cents) },
    { key: 'credit', type: 'number', get: (l) => centsOrNull(l.credit_cents) },
  ], function () { renderTrialBalance(); });
  const bsSorter = reportSorter('organizational-bs-report-tbody', [
    { key: 'name', type: 'text', get: (r) => r.name || r.code },
    { key: 'code', type: 'text', get: (r) => r.code },
    { key: 'balance', type: 'number', get: (r) => r.balance_cents },
    { key: 'restriction', type: 'text', get: (r) => BS_RESTRICTION_LABEL[r.restriction_class] || '' },
  ], function () { renderBalanceSheet(); });
  const glSortState = { index: -1, dir: null };
  let glCache = null;
  let fiscalEndMonth = 12;
  let programsCache = null;

  // ── Panel navigation ───────────────────────────────────────────────────
  let pendingFilters = {};

  function openReportName() {
    for (let i = 0; i < DETAIL_PANELS.length; i += 1) {
      const el = document.getElementById(DETAIL_PANELS[i]);
      if (el && !el.hidden) return DETAIL_PANELS[i].replace('report-detail-', '');
    }
    return '';
  }

  function syncUrl(push) {
    const name = openReportName();
    const params = new URLSearchParams();
    if (name) {
      params.set('report', name);
      params.set('fy', String(fiscalYearForReports()));
      const val = function (id) { const el = document.getElementById(id); return el && el.value ? el.value : ''; };
      const add = function (key, v) { if (v) params.set(key, v); };
      if (name === 'trial-balance') add('as_of', val('organizational-tb-asof'));
      if (name === '1099') add('year', val('organizational-1099-year'));
      if (name === 'balance-sheet') add('as_of', val('organizational-bs-as-of-select'));
      if (name === 'general-ledger') {
        add('from', val('organizational-gl-from'));
        add('to', val('organizational-gl-to'));
        add('account', val('organizational-gl-account'));
      }
      if (name === 'account-transactions') {
        add('from', val('organizational-at-from'));
        add('to', val('organizational-at-to'));
        add('account', val('organizational-at-account'));
      }
      if (name === 'budget') add('program', budgetState.programId);
      if (name === 'giving-summary') add('campaign', val('organizational-giving-campaign-filter'));
    }
    const qs = params.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    if (url === window.location.pathname + window.location.search) return;
    try { window.history[push ? 'pushState' : 'replaceState']({}, '', url); } catch (_) {}
  }

  function applyUrlFilters(params) {
    const fy = Number.parseInt(params.get('fy') || '', 10);
    if (reportsFy && Number.isInteger(fy) && fy >= 1900 && fy <= 2200) reportsFy.value = String(fy);
    const setVal = function (id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('organizational-tb-asof', params.get('as_of') || '');
    fill1099Years();
    if (params.get('year')) setVal('organizational-1099-year', params.get('year'));
    setVal('organizational-gl-from', params.get('from') || '');
    setVal('organizational-gl-to', params.get('to') || '');
    setVal('organizational-at-from', params.get('from') || '');
    setVal('organizational-at-to', params.get('to') || '');
    budgetState.programId = params.get('program') || '';
    pendingFilters = {
      bsAsOf: params.get('as_of') || '',
      glAccount: params.get('report') === 'general-ledger' ? (params.get('account') || '') : '',
      atAccount: params.get('report') === 'account-transactions' ? (params.get('account') || '') : '',
      campaign: params.get('campaign') || '',
    };
  }

  function showReport(name, opts) {
    const indexEl = document.getElementById(INDEX_PANEL);
    if (indexEl) indexEl.hidden = true;
    DETAIL_PANELS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = (id !== 'report-detail-' + name);
    });
    if (name === '990') loadPartIX();
    if (name === 'activity') loadAuditLog(0);
    if (name === 'budget') { wireBudgetReportFilters(); loadBudgetReport(); }
    if (name === 'giving-summary') { loadGivingCampaigns(); loadGivingSummary(); }
    if (name === 'balance-sheet') loadBalanceSheet();
    if (name === 'reconciliation') loadReconciliation();
    if (name === 'financial-position') loadFinancialPosition();
    if (name === 'statement-of-activities') loadStatementOfActivities();
    if (name === 'stmt-functional-expenses') loadStmtFunctionalExpenses();
    if (name === 'cash-flows') loadCashFlows();
    if (name === '1099') load1099Report();
    if (name === 'trial-balance') loadTrialBalance();
    if (name === 'general-ledger') loadGeneralLedger();
    if (name === 'account-transactions') loadAccountTransactions();
    if (name === 'receivables-schedule' || name === 'payables-schedule') loadSchedule(name);
    if (!(opts && opts.fromUrl)) syncUrl(true);
  }

  function showReportsIndex(opts) {
    const indexEl = document.getElementById(INDEX_PANEL);
    if (indexEl) indexEl.hidden = false;
    DETAIL_PANELS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    if (!(opts && opts.fromUrl)) syncUrl(true);
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/reports\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }
        const roleRefusal = data && (data.code === 'no_access' || /requires one of these roles/.test(String(data.error || '')));
        if (res.status === 403 && !roleRefusal && String(url || '').indexOf('/api/organizational/') !== -1) {
      window.location.href = '/app.html?coop=disabled';
      return null;
    }
    return { res, data };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fiscalYearForReports() {
    const raw = reportsFy && reportsFy.value ? Number.parseInt(String(reportsFy.value), 10) : NaN;
    if (Number.isInteger(raw) && raw >= 1900 && raw <= 2200) return raw;
    return new Date().getFullYear();
  }

  function syncBoardReportLink() {
    if (!boardReportA || !currentSlug) return;
    const fy = fiscalYearForReports();
    boardReportA.href =
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/board?fiscal_year=' + encodeURIComponent(String(fy));
  }

  function renderGrantReports() {
    if (!grantReportsTbody) return;
    if (!grantsCache || grantsCache.length === 0) {
      grantReportsTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="4">No grants found yet.</td></tr>';
      return;
    }
    const fy = fiscalYearForReports();
    const grantPdfBase =
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/grants/';
    grantReportsTbody.innerHTML = (grantReportsSorter ? grantReportsSorter.sortRows(grantsCache) : grantsCache)
      .map(function (g) {
        const id = Number(g.id);
        const pdfHref =
          grantPdfBase + encodeURIComponent(String(id)) + '?fiscal_year=' + encodeURIComponent(String(fy));
        return (
          '<tr>' +
          '<td>' + escapeHtml(g.name || '—') + '</td>' +
          '<td>' + escapeHtml(g.funder || '—') + '</td>' +
          '<td>' + escapeHtml(g.status || '—') + '</td>' +
          '<td><a class="organizational-nav-link" href="' + pdfHref.replace(/"/g, '&quot;') + '" download style="font-weight:600;">PDF</a></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function loadGrants(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants', { method: 'GET' });
    if (!out || !out.res.ok) {
      grantsCache = [];
      renderGrantReports();
      return;
    }
    grantsCache = Array.isArray(out.data.grants) ? out.data.grants : [];
    renderGrantReports();
  }

  async function load() {
    const slug = parseSlug();
    if (!slug) {
      showError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    showError('');

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
    if (out.res.status === 404) {
      if (loadingEl) loadingEl.hidden = true;
      showError(out.data.error || 'Organization not found.');
      return;
    }
    if (!out.res.ok) {
      if (loadingEl) loadingEl.hidden = true;
      showError(out.data.error || 'Could not load workspace.');
      return;
    }

    const org = out.data.org;
    if (!org) {
      if (loadingEl) loadingEl.hidden = true;
      showError('Invalid response.');
      return;
    }

    reportDisplay = org.report_display || {};
    fiscalEndMonth = Number(org.fiscal_year_end_month) || 12;
    currentRole = String(org.role || '').toLowerCase();
    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }
    if (slugLineEl) {
      slugLineEl.textContent = '';
      slugLineEl.appendChild(document.createTextNode('Slug '));
      const code = document.createElement('code');
      code.textContent = org.slug || '';
      slugLineEl.appendChild(code);
      slugLineEl.appendChild(document.createTextNode(' · ' + (org.membership_status || '') + ' · '));
      const back = document.createElement('a');
      back.href = '/organizational/';
      back.className = 'organizational-nav-link';
      back.style.color = 'var(--brand-primary)';
      back.style.fontWeight = '600';
      back.textContent = 'All workspaces';
      slugLineEl.appendChild(back);
    }
    if (roleBadgeEl) {
      roleBadgeEl.textContent = org.role || '';
      roleBadgeEl.classList.toggle('role-admin', isAdminRole(org.role));
      roleBadgeEl.hidden = !org.role;
    }

    if (reportsFy && !reportsFy.value) {
      reportsFy.value = String(new Date().getFullYear());
    }
    syncBoardReportLink();
    if (reportsFy) {
      const onFyChange = function () {
        syncUrl(false);
        syncBoardReportLink();
        renderGrantReports();
        if (document.getElementById('report-detail-990') && !document.getElementById('report-detail-990').hidden) loadPartIX();
        if (document.getElementById('report-detail-budget') && !document.getElementById('report-detail-budget').hidden) loadBudgetReport();
        if (document.getElementById('report-detail-reconciliation') && !document.getElementById('report-detail-reconciliation').hidden) loadReconciliation();
        if (document.getElementById('report-detail-financial-position') && !document.getElementById('report-detail-financial-position').hidden) loadFinancialPosition();
        if (document.getElementById('report-detail-statement-of-activities') && !document.getElementById('report-detail-statement-of-activities').hidden) loadStatementOfActivities();
        if (document.getElementById('report-detail-stmt-functional-expenses') && !document.getElementById('report-detail-stmt-functional-expenses').hidden) loadStmtFunctionalExpenses();
        if (document.getElementById('report-detail-cash-flows') && !document.getElementById('report-detail-cash-flows').hidden) loadCashFlows();
        if (document.getElementById('report-detail-trial-balance') && !document.getElementById('report-detail-trial-balance').hidden) {
          const asOf = document.getElementById('organizational-tb-asof');
          if (asOf) asOf.value = '';
          loadTrialBalance();
        }
      };
      reportsFy.addEventListener('change', onFyChange);
      reportsFy.addEventListener('input', onFyChange);
    }

    const s990link = document.getElementById('organizational-990-settings-link');
    if (s990link) s990link.href = '/organizational/o/' + encodeURIComponent(slug) + '/settings/990';
    const sfeLink = document.getElementById('organizational-sfe-settings-link');
    if (sfeLink) sfeLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/settings/990';

    await loadGrants(slug);
    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    const financeOnly = window.OrganizationalReportsIndex.all.filter(function (r) { return r.need === 'finance'; }).map(function (r) { return r.key; });
    const groupsEl = document.getElementById('reports-index-groups');
    if (groupsEl) window.OrganizationalReportsIndex.render(groupsEl, { slug: slug, access: access });
    if (new URLSearchParams(window.location.search).get('only') === 'grant-reports') {
      const index = document.getElementById('reports-index');
      let keep = false;
      Array.prototype.forEach.call(index ? index.children : [], function (el) {
        if (el.classList.contains('organizational-section-title')) keep = el.textContent.trim() === 'Grant reports';
        else if (el.tagName === 'H1') { el.hidden = true; return; }
        if (!keep) el.hidden = true;
      });
    }
    const openFromUrl = function () {
      const params = new URLSearchParams(window.location.search);
      const wantReport = params.get('report');
      if (wantReport && DETAIL_PANELS.indexOf('report-detail-' + wantReport) >= 0 && !(access && !access.can_read_reports && financeOnly.indexOf(wantReport) >= 0)) {
        applyUrlFilters(params);
        showReport(wantReport, { fromUrl: true });
      } else {
        showReportsIndex({ fromUrl: true });
      }
    };
    openFromUrl();
    window.addEventListener('popstate', openFromUrl);
    window.addEventListener('pageshow', function (e) { if (e.persisted) openFromUrl(); });
    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a[data-report-link]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const params = new URL(a.href, window.location.href).searchParams;
      const name = params.get('report');
      if (!name || DETAIL_PANELS.indexOf('report-detail-' + name) < 0) return;
      e.preventDefault();
      syncUrl(false);
      applyUrlFilters(params);
      showReport(name);
    });
  }

  // ── 990 Part IX ────────────────────────────────────────────────────────
  function fmtDollars(cents) {
    return window.formatMoneyCents(Number(cents), { whole: true });
  }
  var reportDisplay = {};
  function fmtStmt(cents) {
    return window.formatMoneyCents(Number(cents), { whole: !reportDisplay.show_cents });
  }
  function rdCode(code) { return reportDisplay.show_account_codes === false ? '' : code; }
  function hideZero(on) { return reportDisplay.hide_zero_balances === true ? on : true; }
  function syncCodeHeader(tbodyId) {
    var tb = document.getElementById(tbodyId);
    var table = tb && tb.closest('table');
    if (!table) return;
    table.querySelectorAll('thead th').forEach(function (th) {
      if (th.textContent.trim() === 'Code' || th.dataset.codeCol) {
        th.dataset.codeCol = '1';
        th.textContent = reportDisplay.show_account_codes === false ? '' : 'Code';
      }
    });
  }

  async function loadPartIX() {
    const tbody  = document.getElementById('organizational-990-report-tbody');
    const meta   = document.getElementById('organizational-990-report-meta');
    const csvLink = document.getElementById('organizational-990-report-csv');
    if (!tbody || !currentSlug) return;

    const fy = fiscalYearForReports();
    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Loading…</td></tr>';
    if (meta) meta.textContent = '';
    if (csvLink) {
      csvLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) +
        '/reports/990-part-ix?format=csv&fiscal_year=' + fy;
    }

    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/990-part-ix?fiscal_year=' + fy,
      { method: 'GET' }
    );
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Could not load Part IX data.</td></tr>';
      return;
    }

    const lines  = Array.isArray(out.data.lines)  ? out.data.lines  : [];
    const totals = out.data.totals || {};

    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No expense accounts with budget data.</td></tr>';
      if (meta) meta.textContent = 'No data for ' + fy;
      return;
    }

    tbody.innerHTML = lines.map(function (l) {
      const unset = (l.program_services_bps + l.mgmt_general_bps + l.fundraising_bps) !== 10000;
      return '<tr>' +
        '<td style="color:var(--text-secondary)">' + escapeHtml(l.code || '—') + '</td>' +
        '<td>' + escapeHtml(l.name || '—') + (unset ? ' <span style="color:var(--organizational-status-warning);font-size:11px;" title="Allocations not set">⚠</span>' : '') + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(l.total_cents) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(l.program_services_cents) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(l.mgmt_general_cents) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(l.fundraising_cents) + '</td>' +
        '</tr>';
    }).join('') +
    '<tr style="font-weight:600; border-top:2px solid var(--border);">' +
      '<td colspan="2">Total</td>' +
      '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(totals.total_cents || 0) + '</td>' +
      '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(totals.program_services_cents || 0) + '</td>' +
      '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(totals.mgmt_general_cents || 0) + '</td>' +
      '<td style="font-variant-numeric:tabular-nums">' + fmtDollars(totals.fundraising_cents || 0) + '</td>' +
    '</tr>';

    if (meta) meta.textContent = lines.length + ' expense accounts · ' + fy;
  }
  // ── End 990 Part IX ────────────────────────────────────────────────────

  // ── Balance sheet ──────────────────────────────────────────────────────
  const BS_TYPE_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity / Net Assets' };
  const BS_RESTRICTION_LABEL = {
    unrestricted: 'Unrestricted',
    temporarily_restricted: 'Temp. restricted',
    permanently_restricted: 'Perm. restricted',
  };

  async function loadBalanceSheet(asOfDate) {
    const tbody = document.getElementById('organizational-bs-report-tbody');
    const meta = document.getElementById('organizational-bs-report-meta');
    const csvLink = document.getElementById('organizational-bs-report-csv');
    const dateSel = document.getElementById('organizational-bs-as-of-select');
    const ledgerNotice = document.getElementById('organizational-bs-ledger-notice');
    if (!tbody || !currentSlug) return;

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Loading…</td></tr>';
    if (meta) meta.textContent = '';

    if (ledgerNotice) {
      const fpCheck = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/financial-position?fiscal_year=' + fiscalYearForReports(),
        { method: 'GET' }
      );
      ledgerNotice.style.display = (fpCheck && fpCheck.res.ok && !fpCheck.data.not_available) ? 'block' : 'none';
    }

    const params = new URLSearchParams();
    if (!asOfDate && pendingFilters.bsAsOf) asOfDate = pendingFilters.bsAsOf;
    pendingFilters.bsAsOf = '';
    if (asOfDate) params.set('as_of_date', asOfDate);
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/balance-sheet?' + params.toString(),
      { method: 'GET' }
    );
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load balance sheet.</td></tr>';
      return;
    }

    const dates = Array.isArray(out.data.dates) ? out.data.dates : [];
    const snapshots = Array.isArray(out.data.snapshots) ? out.data.snapshots : [];
    const activeAsOf = out.data.as_of_date;

    if (dateSel) {
      dateSel.innerHTML = dates.map(function (d) {
        return '<option value="' + escapeHtml(d) + '"' + (d === activeAsOf ? ' selected' : '') + '>' + escapeHtml(d) + '</option>';
      }).join('');
      dateSel.hidden = dates.length <= 1;
    }
    syncUrl(false);
    if (csvLink) {
      csvLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) +
        '/reports/balance-sheet?format=csv' + (activeAsOf ? '&as_of_date=' + encodeURIComponent(activeAsOf) : '');
      csvLink.hidden = !activeAsOf;
    }

    if (!activeAsOf || !snapshots.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">No balance sheet data yet — import a snapshot (Settings) or connect Xero.</td></tr>';
      if (meta) meta.textContent = 'No data';
      return;
    }

    bsCache = snapshots;
    renderBalanceSheet();
    if (meta) meta.textContent = snapshots.length + ' accounts · as of ' + activeAsOf;
  }

  function renderBalanceSheet() {
    const tbody = document.getElementById('organizational-bs-report-tbody');
    if (!tbody || !bsCache) return;
    const order = { asset: 0, liability: 1, equity: 2 };
    const defaultOrder = bsCache.slice().sort(function (a, b) {
      return ((order[a.type] != null ? order[a.type] : 9) - (order[b.type] != null ? order[b.type] : 9))
        || String(a.code || '').localeCompare(String(b.code || ''));
    });

    const sorted = [];
    for (let i = 0; i < defaultOrder.length;) {
      let j = i;
      while (j < defaultOrder.length && defaultOrder[j].type === defaultOrder[i].type) j += 1;
      sortedIn(bsSorter, defaultOrder.slice(i, j)).forEach(function (r) { sorted.push(r); });
      i = j;
    }

    let html = '';
    let currentType = null;
    const totalsByType = { asset: 0, liability: 0, equity: 0 };
    sorted.forEach(function (r) {
      if (r.type !== currentType) {
        currentType = r.type;
        html += '<tr style="background:var(--surface-active);"><td colspan="4" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">'
          + escapeHtml(BS_TYPE_LABEL[r.type] || r.type) + '</td></tr>';
      }
      if (totalsByType[r.type] != null) totalsByType[r.type] += Number(r.balance_cents);
      html += '<tr>'
        + '<td>' + escapeHtml(r.name || r.code || '') + '</td>'
        + '<td style="color:var(--text-secondary);">' + escapeHtml(r.code || '') + '</td>'
        + '<td style="font-variant-numeric:tabular-nums;">' + fmtDollars(r.balance_cents) + '</td>'
        + '<td style="color:var(--text-secondary);">' + escapeHtml(BS_RESTRICTION_LABEL[r.restriction_class] || '') + '</td>'
        + '</tr>';
    });
    ['asset', 'liability', 'equity'].forEach(function (t) {
      if (totalsByType[t] === 0 && !sorted.some(function (r) { return r.type === t; })) return;
      html += '<tr style="font-weight:600; border-top:1px solid var(--border);">'
        + '<td colspan="2">Total ' + BS_TYPE_LABEL[t] + '</td>'
        + '<td style="font-variant-numeric:tabular-nums;">' + fmtDollars(totalsByType[t]) + '</td><td></td></tr>';
    });

    tbody.innerHTML = html;
  }
  // ── End balance sheet ──────────────────────────────────────────────────

  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    bindOrganizationalDropdownOutsideClick();

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeOrganizationalDropdown();
      closeOrganizationalOverlay();
    });

    document.addEventListener('click', (e) => {
      const overlay = e.target.closest('.organizational-overlay');
      if (overlay && e.target === overlay) {
        closeOrganizationalOverlay();
      }
    });
  })();

  function closeOrganizationalDropdown() {
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (icon) icon.setAttribute('aria-expanded', 'false');
  }

  function toggleOrganizationalDropdown(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('organizational-dropdown');
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
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('organizational-dropdown');
      const icon = document.getElementById('organizational-icon');
      if (!dd || dd.hidden) return;
      if (icon && icon.contains(e.target)) return;
      if (dd && dd.contains(e.target)) return;
      closeOrganizationalDropdown();
    });
  }

  function coopDropdownOpenMembers() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('members');
  }

  function coopDropdownOpenLibrary() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('library');
  }

  function coopDropdownOpenWorkPool() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('work-pool');
  }

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
    document.querySelectorAll('.organizational-overlay').forEach(overlay => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
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
          const data = await res.json();
          const members = data.members || [];
          if (members.length === 0) {
            listEl.innerHTML = '<p class="organizational-empty">No members yet.</p>';
          } else {
            listEl.innerHTML = members.map(m => `
              <div class="organizational-list-item">
                <div class="organizational-list-item-main">
                  <div class="organizational-list-item-title">${escapeHtml(m.display_name || m.slug || '—')}</div>
                </div>
              </div>
            `).join('');
          }
        } else {
          listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
        }
      } catch (e) {
        listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
      }
    } else if (type === 'library') {
      listEl.innerHTML = '<p class="organizational-empty">Library coming soon.</p>';
    } else if (type === 'work-pool') {
      listEl.innerHTML = '<p class="organizational-empty">Work pool coming soon.</p>';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Audit log ──────────────────────────────────────────────────────────
  const auditTbody   = document.getElementById('organizational-audit-tbody');
  const auditMeta    = document.getElementById('organizational-audit-meta');
  const auditPager   = document.getElementById('organizational-audit-pagination');
  const auditTableF  = document.getElementById('organizational-audit-table-filter');
  const auditActionF = document.getElementById('organizational-audit-action-filter');
  const auditFromF   = document.getElementById('organizational-audit-from');
  const auditToF     = document.getElementById('organizational-audit-to');
  const auditUserF   = document.getElementById('organizational-audit-user-filter');
  const auditSearchF = document.getElementById('organizational-audit-search');
  const auditExportB = document.getElementById('organizational-audit-export');

  const TABLE_LABELS  = {
    org_budget_lines: 'Budget line', org_schedule_items: 'Schedule item', org_schedules: 'Schedule',
    org_budget_scenarios: 'Scenario', org_budget_scenario_lines: 'Scenario line',
    org_programs: 'Program/activity', org_grant_allocations: 'Grant allocation', org_personnel: 'Personnel',
    org_allocation_schedules: 'Indirect cost schedule',
    org_bills: 'Bill', org_invoices: 'Invoice',
    org_ledger_transactions: 'Ledger transaction', org_ledger_lines: 'Ledger line',
    org_expense_claims: 'Expense claim', org_documents: 'Document', org_gifts: 'Gift',
    org_fiscal_year_locks: 'Fiscal year lock', org_ledger_approval_policies: 'Approval policy', org_sponsored_project_disbursements: 'Sponsored project disbursement',
  };
  const FIELD_LABELS  = {
    amount_cents: 'Amount', unit_amount_cents: 'Unit amount', label: 'Label',
    notes: 'Notes', frequency: 'Frequency', quantity: 'Quantity',
    start_month: 'Start month', end_month: 'End month', status: 'Status',
    name: 'Name', schedule_type: 'Type', sort_order: 'Sort order',
    is_override: 'Override?', source_type: 'Source',
    account_id: 'Account', program_id: 'Program', grant_id: 'Grant', donor_restriction_class: 'Restriction',
    debit_cents: 'Debit', credit_cents: 'Credit', line_memo: 'Line memo', memo: 'Memo', payee: 'Payee',
    reference_number: 'Reference', transaction_date: 'Date', void_reason: 'Void reason', voided_at: 'Voided',
  };
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtAuditValue(field, val) {
    if (val === null || val === undefined || val === '') return '—';
    if (String(field).endsWith('_cents')) {
      const n = Number(val);
      if (!Number.isNaN(n)) return window.formatMoneyCents(n);
    }
    if (String(field).endsWith('_month')) {
      const m = Number(val);
      if (Number.isInteger(m) && m >= 1 && m <= 12) return MONTH_NAMES[m - 1];
    }
    return escapeHtml(String(val));
  }

  function relTime(dateStr) {
    const d = new Date(dateStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
  }

  function auditFilterParams(params) {
    if (auditFromF && auditFromF.value) params.set('from', auditFromF.value);
    if (auditToF && auditToF.value) params.set('to', auditToF.value);
    if (auditUserF && auditUserF.value) params.set('user_id', auditUserF.value);
    if (auditSearchF && auditSearchF.value.trim()) params.set('q', auditSearchF.value.trim());
  }

  let auditOffset = 0;
  const AUDIT_LIMIT = 50;

  async function loadAuditLog(offset) {
    if (!auditTbody || !currentSlug) return;
    auditOffset = offset || 0;
    if (auditTbody) auditTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Loading…</td></tr>';
    if (auditMeta)  auditMeta.textContent = 'Loading…';

    const params = new URLSearchParams({ limit: String(AUDIT_LIMIT), offset: String(auditOffset) });
    if (auditTableF  && auditTableF.value)  params.set('table_name', auditTableF.value);
    if (auditActionF && auditActionF.value) params.set('action',     auditActionF.value);
    auditFilterParams(params);

    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/audit-log?' + params.toString(),
      { method: 'GET' }
    );
    if (!out || !out.res.ok) {
      if (auditTbody) auditTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Could not load activity log.</td></tr>';
      if (auditMeta) auditMeta.textContent = '';
      return;
    }

    const entries = Array.isArray(out.data.entries) ? out.data.entries : [];
    if (auditUserF && Array.isArray(out.data.users) && auditUserF.options.length <= 1) {
      out.data.users.forEach(function (u) { const o = document.createElement('option'); o.value = String(u.id); o.textContent = u.email; auditUserF.appendChild(o); });
    }
    const total   = Number(out.data.total) || 0;

    if (!entries.length) {
      auditTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No activity yet.</td></tr>';
      if (auditMeta) auditMeta.textContent = 'No entries';
      if (auditPager) auditPager.innerHTML = '';
      return;
    }

    auditTbody.innerHTML = entries.map(function (e) {
      const who   = escapeHtml(e.user_email ? e.user_email.split('@')[0] : 'unknown');
      const what  = (TABLE_LABELS[e.table_name] || escapeHtml(e.table_name)) + ' #' + escapeHtml(String(e.record_id || ''));
      const field = escapeHtml(FIELD_LABELS[e.field_name] || e.field_name || '—');
      const before = e.field_name ? fmtAuditValue(e.field_name, e.old_value) : '—';
      const after  = e.field_name ? fmtAuditValue(e.field_name, e.new_value) : '—';
      const actionBadge = '<span class="organizational-status-badge organizational-status-' + escapeHtml(e.action) + '">' + escapeHtml(e.action) + '</span>';
      return '<tr>' +
        '<td title="' + escapeHtml(e.occurred_at) + '">' + relTime(e.occurred_at) + '</td>' +
        '<td>' + who + '</td>' +
        '<td>' + what + ' ' + actionBadge + '</td>' +
        '<td>' + field + '</td>' +
        '<td class="organizational-audit-val">' + before + '</td>' +
        '<td class="organizational-audit-val">' + after  + '</td>' +
        '</tr>';
    }).join('');

    const shown = auditOffset + entries.length;
    if (auditMeta) auditMeta.textContent = 'Showing ' + (auditOffset + 1) + '–' + shown + ' of ' + total;

    if (auditPager) {
      const hasPrev = auditOffset > 0;
      const hasNext = shown < total;
      auditPager.innerHTML =
        (hasPrev ? '<button class="organizational-btn organizational-btn-outline" onclick="loadAuditLogPage(' + (auditOffset - AUDIT_LIMIT) + ')">← Prev</button>' : '') +
        (hasNext ? '<button class="organizational-btn organizational-btn-outline" onclick="loadAuditLogPage(' + shown + ')">Next →</button>' : '');
    }
  }

  function refreshAuditLog() { loadAuditLog(0); }

  if (auditTableF)  auditTableF.addEventListener('change',  function () { loadAuditLog(0); });
  if (auditActionF) auditActionF.addEventListener('change', function () { loadAuditLog(0); });
  [auditFromF, auditToF, auditUserF].forEach(function (el) { if (el) el.addEventListener('change', function () { loadAuditLog(0); }); });
  if (auditSearchF) auditSearchF.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') loadAuditLog(0); });
  if (auditExportB) auditExportB.addEventListener('click', function () {
    const params = new URLSearchParams({ format: 'csv' });
    if (auditTableF && auditTableF.value) params.set('table_name', auditTableF.value);
    if (auditActionF && auditActionF.value) params.set('action', auditActionF.value);
    auditFilterParams(params);
    window.location.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/audit-log?' + params.toString();
  });
  // ── End audit log ──────────────────────────────────────────────────────

  // ── Financial views ────────────────────────────────────────────────────

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function parseCents(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function fyMonthIndices(endMonth) {
    const start = endMonth % 12;
    return Array.from({ length: 12 }, function (_, i) { return (start + i) % 12; });
  }

  async function loadReportsPrograms() {
    if (programsCache !== null) return programsCache;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/programs', { method: 'GET' });
    programsCache = (out && out.res.ok && Array.isArray(out.data.programs)) ? out.data.programs : [];
    return programsCache;
  }

  function fillProgramSelect(selEl) {
    if (!selEl) return;
    const saved = selEl.value;
    const progs = programsCache || [];
    let html = '<option value="">All programs</option>';
    progs.forEach(function (p) {
      html += '<option value="' + p.id + '"' + (String(p.id) === saved ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
    });
    selEl.innerHTML = html;
  }

  function orderAccountTree(accounts) {
    const byParent = {};
    accounts.forEach(function (a) {
      const pid = a.parent_id == null ? 'root' : String(a.parent_id);
      (byParent[pid] = byParent[pid] || []).push(a);
    });
    Object.keys(byParent).forEach(function (k) {
      byParent[k].sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || '')) || (Number(a.id) - Number(b.id));
      });
    });
    const roots = (byParent.root || []).filter(function (a) {
      return !a.is_posting && (a.type === 'income' || a.type === 'expense');
    });
    roots.sort(function (a, b) {
      const order = { income: 0, expense: 1 };
      return ((order[a.type] != null ? order[a.type] : 2) - (order[b.type] != null ? order[b.type] : 2)) ||
        String(a.code || '').localeCompare(String(b.code || ''));
    });
    if (roots.length === 0) {
      return accounts
        .filter(function (a) { return a.is_posting && (a.type === 'income' || a.type === 'expense'); })
        .map(function (a) { return { kind: 'posting', account: a, parentSubtotalId: null, rootCode: a.type, rootType: a.type }; });
    }
    const out = [];
    roots.forEach(function (root) {
      const subs = (byParent[String(root.id)] || []).filter(function (s) { return !s.is_posting && Number(s.level) === 2; });
      const suppressL2 = subs.length === 1;
      out.push({ kind: 'summary', account: root });
      subs.forEach(function (sub) {
        if (!suppressL2) out.push({ kind: 'subtotal', account: sub });
        (byParent[String(sub.id)] || []).forEach(function (leaf) {
          if (leaf.is_posting) out.push({ kind: 'posting', account: leaf, parentSubtotalId: sub.id, rootCode: root.code, rootType: root.type });
        });
        if (!suppressL2) out.push({ kind: 'subtotal_sum', label: 'Total ' + (sub.name || sub.code), parentSubtotalId: sub.id, rootType: root.type });
      });
      out.push({ kind: 'section_sum', label: 'TOTAL ' + String(root.name || root.code).toUpperCase(), rootCode: root.code, rootType: root.type });
    });
    return out;
  }

  function attachRollups(ordered, linesByAccId) {
    const emptyB = function () { return { appr: 0, ytd: 0, proj: 0, mb: new Array(12).fill(0), ma: new Array(12).fill(0) }; };
    const addL = function (b, L) {
      if (!L) return;
      b.appr += parseCents(L.approved_cents);
      b.ytd  += parseCents(L.ytd_actual_cents);
      b.proj += parseCents(L.projected_cents);
      (L.monthly_budget_cents || []).forEach(function (v, i) { b.mb[i] += parseCents(v); });
      (L.monthly_actual_cents || []).forEach(function (v, i) { b.ma[i] += parseCents(v); });
    };
    const rootBva = {};
    let subBva = null;
    return ordered.map(function (row) {
      const r = Object.assign({}, row);
      if      (row.kind === 'subtotal')     { subBva = emptyB(); }
      else if (row.kind === 'posting')      { const L = linesByAccId[row.account.id]; if (subBva) addL(subBva, L); if (row.rootCode) { rootBva[row.rootCode] = rootBva[row.rootCode] || emptyB(); addL(rootBva[row.rootCode], L); } }
      else if (row.kind === 'subtotal_sum') { r._rollup = subBva || emptyB(); subBva = null; }
      else if (row.kind === 'section_sum' && row.rootCode) { r._rollup = rootBva[row.rootCode] || emptyB(); }
      return r;
    });
  }

  const budgetState = { mode: 'summary', programId: '', showZeroRows: false, showCents: false, showAccountCodes: false };
  let budgetData = null;

  function fmtBR(cents) {
    const n = Math.round(Number(cents));
    const d = budgetState.showCents ? n / 100 : Math.round(n / 100);
    const opts = budgetState.showCents
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    return '$' + Math.abs(d).toLocaleString('en-US', opts);
  }

  function fmtBRSigned(cents) {
    const n = Math.round(Number(cents));
    const d = budgetState.showCents ? n / 100 : Math.round(n / 100);
    const abs = Math.abs(d);
    const opts = budgetState.showCents
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    if (d > 0) return '+$' + abs.toLocaleString('en-US', opts);
    if (d < 0) return '($' + abs.toLocaleString('en-US', opts) + ')';
    return '$0';
  }

  function fmtBRNum(cents) {
    const n = Math.round(Number(cents));
    if (n === 0) return '<span style="color:var(--text-secondary)">—</span>';
    const d = budgetState.showCents ? n / 100 : Math.round(n / 100);
    const opts = budgetState.showCents
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    return Math.abs(d).toLocaleString('en-US', opts);
  }

  function fmtBRSpread(cents) {
    const n = Math.round(Number(cents));
    if (n === 0) return '<span style="color:var(--text-secondary)">—</span>';
    return fmtBR(n);
  }

  function isZeroRow(row, linesByAccId) {
    if (budgetState.showZeroRows || row.kind !== 'posting') return false;
    const L = linesByAccId[row.account.id];
    if (!L) return true;
    if (budgetState.mode === 'summary') {
      return parseCents(L.approved_cents) === 0 && parseCents(L.ytd_actual_cents) === 0 && parseCents(L.projected_cents) === 0;
    }
    const mb = L.monthly_budget_cents || [];
    const ma = L.monthly_actual_cents  || [];
    return mb.every(function (v) { return parseCents(v) === 0; }) && ma.every(function (v) { return parseCents(v) === 0; });
  }

  function totalCols() {
    return budgetState.mode === 'summary' ? 5 : 40;
  }

  async function fetchBudgetData() {
    const fy = fiscalYearForReports();
    const params = new URLSearchParams({ fiscal_year: String(fy) });
    if (budgetState.programId) params.set('program_id', String(budgetState.programId));
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/budget-vs-actual?' + params.toString(),
      { method: 'GET' }
    );
    return (out && out.res.ok) ? out.data : null;
  }

  function renderBudgetReportThead(monthIdxs, ytdMonth) {
    const thead = document.getElementById('organizational-br-thead');
    if (!thead) return;
    const fy = fiscalYearForReports();

    if (budgetState.mode === 'summary') {
      thead.innerHTML = '<tr>' +
        '<th style="min-width:240px;">Account</th>' +
        '<th style="text-align:right;min-width:110px;">Budget</th>' +
        '<th style="text-align:right;min-width:110px;">YTD Actual</th>' +
        '<th style="text-align:right;min-width:110px;">Forecast</th>' +
        '<th style="text-align:right;min-width:110px;">Variance</th>' +
        '</tr>';
    } else {
      let h1 = '<tr class="organizational-budget-monthly-header-1 organizational-bv-group-row">';
      h1 += '<th class="organizational-budget-subheader" style="text-align:left;">Account</th>';
      h1 += '<th colspan="3" class="organizational-budget-annual-header">FY' + fy + ' Total</th>';
      monthIdxs.forEach(function (mi) {
        const future = (mi + 1) > ytdMonth;
        h1 += '<th colspan="3" class="organizational-budget-month-header' + (future ? ' organizational-budget-month-header--future' : '') + '">' + MONTHS_SHORT[mi] + '</th>';
      });
      h1 += '</tr>';

      let h2 = '<tr class="organizational-budget-monthly-header-2">';
      h2 += '<th class="organizational-budget-subheader" style="text-align:left;"></th>';
      h2 += '<th class="organizational-budget-subheader organizational-budget-col-num">Budget</th>';
      h2 += '<th class="organizational-budget-subheader organizational-budget-col-num">Actual</th>';
      h2 += '<th class="organizational-budget-subheader organizational-budget-col-num">Forecast</th>';
      monthIdxs.forEach(function (mi) {
        const opacity = (mi + 1) > ytdMonth ? 'opacity:0.6;' : '';
        h2 += '<th class="organizational-budget-subheader organizational-budget-col-num" style="' + opacity + '">Bgt</th>';
        h2 += '<th class="organizational-budget-subheader organizational-budget-col-num" style="' + opacity + '">Actl</th>';
        h2 += '<th class="organizational-budget-subheader organizational-budget-col-num" style="' + opacity + '">Fcst</th>';
      });
      h2 += '</tr>';
      thead.innerHTML = h1 + h2;
    }
  }

  function renderSummaryRow(row, linesByAccId, netAccum) {
    if (row.kind === 'summary') {
      return '<tr style="background:var(--surface-active);">' +
        '<td colspan="5" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:10px 14px;">' +
        escapeHtml(row.account.name || row.account.code) + '</td></tr>';
    }
    if (row.kind === 'subtotal') {
      return '<tr style="background:var(--surface-hover);">' +
        '<td style="padding-left:14px;font-weight:600;color:var(--text-secondary);font-size:0.85rem;">' +
        escapeHtml(row.account.name || row.account.code) + '</td><td colspan="4"></td></tr>';
    }
    if (row.kind === 'posting') {
      if (isZeroRow(row, linesByAccId)) return '';
      const L = linesByAccId[row.account.id];
      const appr = parseCents(L && L.approved_cents);
      const ytd  = parseCents(L && L.ytd_actual_cents);
      const proj = parseCents(L && L.projected_cents);
      const variance = appr - proj;
      const isExpense = row.rootType === 'expense';
      const isBad = isExpense ? variance < 0 : variance > 0;
      const varStyle = isBad ? 'color:var(--organizational-status-warning);' : '';
      const accCell = '<td style="padding-left:24px;">' +
        (budgetState.showAccountCodes && row.account.code ? '<span style="color:var(--text-secondary);font-size:0.7rem;margin-right:6px;">' + escapeHtml(row.account.code) + '</span>' : '') +
        escapeHtml(row.account.name) + '</td>';
      return '<tr>' + accCell +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRNum(appr) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRNum(ytd)  + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRNum(proj) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;' + varStyle + '">' + fmtBRSigned(variance) + '</td>' +
        '</tr>';
    }
    if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
      const b = row._rollup || { appr: 0, ytd: 0, proj: 0 };
      const variance = b.appr - b.proj;
      const isExpense = row.rootType === 'expense';
      const isBad = isExpense ? variance < 0 : variance > 0;
      const varStyle = isBad ? 'color:var(--organizational-status-warning);' : '';
      const isSection = row.kind === 'section_sum';
      const trStyle = isSection
        ? 'font-weight:700;border-top:2px solid var(--border);background:var(--surface-active);'
        : 'font-weight:600;border-top:1px solid var(--border);';
      const indent = isSection ? '' : 'padding-left:14px;';
      if (isSection && netAccum) {
        if (isExpense) { netAccum.budget -= b.appr; netAccum.ytd -= b.ytd; netAccum.proj -= b.proj; }
        else           { netAccum.budget += b.appr; netAccum.ytd += b.ytd; netAccum.proj += b.proj; }
      }
      return '<tr style="' + trStyle + '">' +
        '<td style="' + indent + '">' + escapeHtml(row.label || '') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBR(b.appr) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBR(b.ytd)  + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBR(b.proj) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;' + varStyle + '">' + fmtBRSigned(variance) + '</td>' +
        '</tr>';
    }
    return '';
  }

  const MR = 'font-variant-numeric:tabular-nums;text-align:right;padding:5px 8px;';

  function mCol(cents, borderLeft, muted, cls) {
    const bdr = borderLeft ? 'border-left:1px solid var(--border);' : '';
    const clr = muted ? 'color:var(--text-secondary);' : '';
    const clsAttr = cls ? ' class="' + cls + '"' : '';
    return '<td' + clsAttr + ' style="' + MR + bdr + clr + '">' + fmtBRSpread(cents) + '</td>';
  }

  function mColTotal(cents, borderLeft) {
    const bdr = borderLeft ? 'border-left:2px solid var(--border);' : '';
    return '<td style="' + MR + bdr + '">' + fmtBR(cents) + '</td>';
  }

  function mColNet(cents, borderLeft, cls) {
    const bdr = borderLeft ? 'border-left:1px solid var(--border);' : '';
    const n = Math.round(Number(cents));
    const d = budgetState.showCents ? n / 100 : Math.round(n / 100);
    const abs = Math.abs(d);
    const opts = budgetState.showCents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    const text = d < 0 ? '($' + abs.toLocaleString('en-US', opts) + ')' : (d > 0 ? '+$' : '$') + abs.toLocaleString('en-US', opts);
    const clsAttr = cls ? ' class="' + cls + '"' : '';
    return '<td' + clsAttr + ' style="' + MR + bdr + '">' + text + '</td>';
  }

  const MONTHLY_NCOLS = 40;

  function mColAnnual(cents, cls, isTotal) {
    const val = isTotal ? fmtBR(cents) : fmtBRNum(cents);
    return '<td class="organizational-budget-col-num ' + cls + '">' + val + '</td>';
  }

  function mColNum(cents, cls, muted) {
    const clr = muted ? 'color:var(--text-secondary);' : '';
    const clsAttr = cls ? ' class="' + cls + '"' : '';
    return '<td' + clsAttr + ' style="' + MR + clr + '">' + fmtBRNum(cents) + '</td>';
  }

  function renderMonthlyDetailRow(row, linesByAccId, monthIdxs, ytdMonth, netMonthly) {
    if (row.kind === 'summary') {
      return '<tr class="bv-summary">' +
        '<td colspan="' + MONTHLY_NCOLS + '" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:9px 14px;">' +
        escapeHtml(row.account.name || row.account.code) + '</td></tr>';
    }
    if (row.kind === 'subtotal') {
      return '<tr>' +
        '<td style="padding-left:14px;font-weight:600;color:var(--text-secondary);font-size:0.85rem;">' +
        escapeHtml(row.account.name || row.account.code) + '</td>' +
        '<td colspan="' + (MONTHLY_NCOLS - 1) + '"></td></tr>';
    }
    if (row.kind === 'posting') {
      if (isZeroRow(row, linesByAccId)) return '';
      const L = linesByAccId[row.account.id];
      const mb = L ? (L.monthly_budget_cents || []) : [];
      const ma = L ? (L.monthly_actual_cents  || []) : [];
      const codePrefix = budgetState.showAccountCodes && row.account.code
        ? '<span style="color:var(--text-secondary);font-size:0.7rem;margin-right:6px;">' + escapeHtml(row.account.code) + '</span>'
        : '';
      let html = '<tr><td style="padding-left:24px;">' + codePrefix + escapeHtml(row.account.name) + '</td>';
      html += mColAnnual(parseCents(L && L.approved_cents), 'organizational-bv-bgt', false);
      html += mColAnnual(parseCents(L && L.ytd_actual_cents), 'organizational-bv-actl', false);
      html += mColAnnual(parseCents(L && L.projected_cents), 'organizational-bv-fcst', false);
      monthIdxs.forEach(function (mi) {
        const isPast = (mi + 1) <= ytdMonth;
        const b = parseCents(mb[mi]), a = parseCents(ma[mi]);
        html += mColNum(b, 'organizational-bv-bgt', false);
        html += mColNum(isPast ? a : 0, 'organizational-bv-actl', !isPast);
        html += mColNum(isPast ? a : b, 'organizational-bv-fcst', false);
      });
      html += '</tr>';
      return html;
    }
    if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
      const bv = row._rollup || { appr: 0, ytd: 0, proj: 0, mb: new Array(12).fill(0), ma: new Array(12).fill(0) };
      const isSection = row.kind === 'section_sum';
      const trCls = isSection ? ' class="bv-section"' : '';
      const trStyle = isSection
        ? 'font-weight:700;border-top:2px solid var(--border);background:var(--surface-active);'
        : 'font-weight:600;border-top:1px solid var(--border);';
      const indent = isSection ? '' : 'padding-left:14px;';
      if (isSection && netMonthly) {
        const sign = row.rootType === 'expense' ? -1 : 1;
        bv.mb.forEach(function (v, i) { netMonthly.mb[i] += sign * v; });
        bv.ma.forEach(function (v, i) { netMonthly.ma[i] += sign * v; });
        netMonthly.appr += sign * bv.appr;
        netMonthly.ytd  += sign * bv.ytd;
        netMonthly.proj += sign * bv.proj;
      }
      let html = '<tr' + trCls + ' style="' + trStyle + '"><td style="' + indent + '">' + escapeHtml(row.label || '') + '</td>';
      html += mColAnnual(bv.appr, 'organizational-bv-bgt', true);
      html += mColAnnual(bv.ytd,  'organizational-bv-actl', true);
      html += mColAnnual(bv.proj, 'organizational-bv-fcst', true);
      monthIdxs.forEach(function (mi) {
        const isPast = (mi + 1) <= ytdMonth;
        const b = bv.mb[mi], a = bv.ma[mi];
        html += mCol(b, false, false, 'organizational-bv-bgt');
        html += mCol(isPast ? a : 0, false, !isPast, 'organizational-bv-actl');
        html += mCol(isPast ? a : b, false, false, 'organizational-bv-fcst');
      });
      html += '</tr>';
      return html;
    }
    return '';
  }

  function renderBudgetReport(data) {
    const tbody = document.getElementById('organizational-br-tbody');
    if (!tbody || !data) return;
    budgetData = data;

    const linesByAccId = {};
    (data.lines || []).forEach(function (l) { linesByAccId[l.account_id] = l; });
    const ordered = attachRollups(orderAccountTree(data.accounts || []), linesByAccId);
    const ytdMonth = Number(data.ytd_through_month) || 0;
    const monthIdxs = fyMonthIndices(fiscalEndMonth);

    renderBudgetReportThead(monthIdxs, ytdMonth);

    const netAccum = { budget: 0, ytd: 0, proj: 0 };
    let html = '';

    if (budgetState.mode === 'summary') {
      ordered.forEach(function (row) { html += renderSummaryRow(row, linesByAccId, netAccum); });
      const netVar = netAccum.budget - netAccum.proj;
      const netVarStyle = '';
      html += '<tr style="font-weight:700;border-top:3px double var(--border);background:var(--surface-active);">' +
        '<td>NET POSITION</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRSigned(netAccum.budget) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRSigned(netAccum.ytd)   + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtBRSigned(netAccum.proj)  + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;' + netVarStyle + '">' + fmtBRSigned(netVar) + '</td>' +
        '</tr>';
    } else {
      const netMonthly = { mb: new Array(12).fill(0), ma: new Array(12).fill(0), appr: 0, ytd: 0, proj: 0 };
      ordered.forEach(function (row) { html += renderMonthlyDetailRow(row, linesByAccId, monthIdxs, ytdMonth, netMonthly); });
      let netHtml = '<tr class="bv-net" style="font-weight:700;border-top:3px double var(--border);background:var(--surface-active);">';
      netHtml += '<td>NET POSITION</td>';
      netHtml += mColNet(netMonthly.appr, false, 'organizational-bv-bgt');
      netHtml += mColNet(netMonthly.ytd,  false, 'organizational-bv-actl');
      netHtml += mColNet(netMonthly.proj, false, 'organizational-bv-fcst');
      monthIdxs.forEach(function (mi) {
        const isPast = (mi + 1) <= ytdMonth;
        const b = netMonthly.mb[mi], a = netMonthly.ma[mi];
        netHtml += mColNet(b, false, 'organizational-bv-bgt');
        netHtml += mColNet(isPast ? a : 0, false, 'organizational-bv-actl');
        netHtml += mColNet(isPast ? a : b, false, 'organizational-bv-fcst');
      });
      netHtml += '</tr>';
      html += netHtml;
    }

    tbody.innerHTML = html || '<tr class="organizational-table-empty"><td colspan="' + totalCols() + '">No accounts found.</td></tr>';

    const meta = document.getElementById('organizational-br-meta');
    if (meta) {
      const fy = fiscalYearForReports();
      const ytdLabel = ytdMonth > 0 ? ' · YTD through ' + MONTHS_SHORT[ytdMonth - 1] : '';
      meta.textContent = 'FY' + fy + ytdLabel +
        (budgetState.programId ? ' · program filtered' : '') +
        (data.data_warnings && data.data_warnings.length ? ' · ⚠ warnings' : '');
    }
    syncBudgetToggles();
    setTimeout(syncBrScroll, 0);
  }

  async function loadBudgetReport() {
    const tbody = document.getElementById('organizational-br-tbody');
    if (!tbody || !currentSlug) return;

    await loadReportsPrograms();
    const brProg = document.getElementById('organizational-br-program');
    fillProgramSelect(brProg);
    if (brProg && budgetState.programId) brProg.value = budgetState.programId;
    syncUrl(false);

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + totalCols() + '">Loading…</td></tr>';
    const data = await fetchBudgetData();
    if (!data) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + totalCols() + '">Could not load data. Check Xero connection and budget entries.</td></tr>';
      return;
    }
    renderBudgetReport(data);
  }

  function syncBudgetToggles() {
    const z = document.getElementById('organizational-br-zeros-btn');
    const c = document.getElementById('organizational-br-cents-btn');
    const a = document.getElementById('organizational-br-codes-btn');
    if (z) z.textContent = budgetState.showZeroRows ? '✓ Zero rows' : 'Zero rows';
    if (c) c.textContent = budgetState.showCents ? '✓ Cents' : 'Cents';
    if (a) a.textContent = budgetState.showAccountCodes ? '✓ Acct #s' : 'Acct #s';
  }

  function budgetReportToggle(key) {
    budgetState[key] = !budgetState[key];
    if (budgetData) renderBudgetReport(budgetData);
    else syncBudgetToggles();
  }

  let brTopScrollWired = false;

  function wireBrTopScroll() {
    if (brTopScrollWired) return;
    brTopScrollWired = true;
    const topScroll = document.getElementById('organizational-br-top-scroll');
    const grid = document.querySelector('.organizational-bv-grid');
    if (!topScroll || !grid) return;
    let syncing = false;
    topScroll.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      grid.scrollLeft = topScroll.scrollLeft;
      syncing = false;
    });
    grid.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      topScroll.scrollLeft = grid.scrollLeft;
      syncing = false;
    });
  }

  function syncBrScroll() {
    const grid = document.querySelector('.organizational-bv-grid');
    if (!grid) return;

    const topScrollInner = document.getElementById('organizational-br-top-scroll-inner');
    const table = grid.querySelector('table');
    if (topScrollInner && table) {
      topScrollInner.style.width = table.scrollWidth + 'px';
    }

    const stickyHeader = document.querySelector('.organizational-br-sticky-header');
    if (stickyHeader) {
      const bottom = stickyHeader.getBoundingClientRect().bottom;
      grid.style.maxHeight = Math.max(window.innerHeight - bottom - 4, 200) + 'px';
    }

    const row1 = grid.querySelector('.organizational-budget-monthly-header-1');
    if (row1 && table) {
      table.style.setProperty('--br-thead-r1-h', row1.offsetHeight + 'px');
    }

    wireBrTopScroll();
  }

  function wireBudgetReportFilters() {
    const modeTog = document.getElementById('organizational-br-mode-toggle');
    if (!modeTog || modeTog.dataset.wired) return;
    modeTog.dataset.wired = '1';

    modeTog.addEventListener('click', function (e) {
      const btn = e.target.closest('.organizational-seg-btn');
      if (!btn || !btn.dataset.brMode) return;
      budgetState.mode = btn.dataset.brMode;
      modeTog.querySelectorAll('.organizational-seg-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.brMode === budgetState.mode);
      });
      if (budgetData) renderBudgetReport(budgetData);
    });

    const progSel = document.getElementById('organizational-br-program');
    if (progSel) {
      progSel.addEventListener('change', function () {
        budgetState.programId = progSel.value;
        loadBudgetReport();
      });
    }

    window.addEventListener('resize', syncBrScroll);
  }

  function downloadCsv(filename, rows) {
    function csvCell(v) {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    const csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function fmtCentsRaw(cents) {
    return (Math.round(Number(cents)) / 100).toFixed(2);
  }

  function exportBudgetReportCsv() {
    const data = budgetData;
    if (!data) { alert('Load the budget report first.'); return; }
    const linesByAccId = {};
    (data.lines || []).forEach(function (l) { linesByAccId[l.account_id] = l; });
    const ordered = attachRollups(orderAccountTree(data.accounts || []), linesByAccId);
    const fy = fiscalYearForReports();
    const ytdMonth = Number(data.ytd_through_month) || 0;
    const monthIdxs = fyMonthIndices(fiscalEndMonth);
    let rows = [];

    if (budgetState.mode === 'summary') {
      rows.push(['Code', 'Account', 'Kind', 'Budget', 'YTD Actual', 'Forecast', 'Variance']);
      ordered.forEach(function (row) {
        if (row.kind === 'summary') {
          rows.push([row.account.code || '', row.account.name || '', 'header', '', '', '', '']);
        } else if (row.kind === 'posting') {
          if (isZeroRow(row, linesByAccId)) return;
          const L = linesByAccId[row.account.id];
          const appr = parseCents(L && L.approved_cents), ytd = parseCents(L && L.ytd_actual_cents), proj = parseCents(L && L.projected_cents);
          rows.push([row.account.code || '', row.account.name || '', 'detail',
            fmtCentsRaw(appr), fmtCentsRaw(ytd), fmtCentsRaw(proj), fmtCentsRaw(appr - proj)]);
        } else if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
          const b = row._rollup || { appr: 0, ytd: 0, proj: 0 };
          rows.push(['', row.label || '', row.kind === 'section_sum' ? 'total' : 'subtotal',
            fmtCentsRaw(b.appr), fmtCentsRaw(b.ytd), fmtCentsRaw(b.proj), fmtCentsRaw(b.appr - b.proj)]);
        }
      });
    } else {
      const hdr = ['Code', 'Account', 'Kind'];
      monthIdxs.forEach(function (mi) { hdr.push(MONTHS_SHORT[mi] + ' Budget', MONTHS_SHORT[mi] + ' Actual', MONTHS_SHORT[mi] + ' Forecast'); });
      hdr.push('Total Budget', 'Total Actual', 'Total Forecast');
      rows.push(hdr);
      ordered.forEach(function (row) {
        if (row.kind === 'summary') {
          rows.push([row.account.code || '', row.account.name || '', 'header']
            .concat(monthIdxs.flatMap(function () { return ['', '', '']; })).concat(['', '', '']));
        } else if (row.kind === 'posting') {
          if (isZeroRow(row, linesByAccId)) return;
          const L = linesByAccId[row.account.id];
          const mb = L ? (L.monthly_budget_cents || []) : [];
          const ma = L ? (L.monthly_actual_cents  || []) : [];
          rows.push([row.account.code || '', row.account.name || '', 'detail']
            .concat(monthIdxs.flatMap(function (mi) {
              const isPast = (mi + 1) <= ytdMonth;
              const b = parseCents(mb[mi]), a = parseCents(ma[mi]);
              return [fmtCentsRaw(b), fmtCentsRaw(isPast ? a : 0), fmtCentsRaw(isPast ? a : b)];
            }))
            .concat([fmtCentsRaw(parseCents(L && L.approved_cents)), fmtCentsRaw(parseCents(L && L.ytd_actual_cents)), fmtCentsRaw(parseCents(L && L.projected_cents))]));
        } else if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
          const b = row._rollup || { appr: 0, ytd: 0, proj: 0, mb: new Array(12).fill(0), ma: new Array(12).fill(0) };
          rows.push(['', row.label || '', row.kind === 'section_sum' ? 'total' : 'subtotal']
            .concat(monthIdxs.flatMap(function (mi) {
              const isPast = (mi + 1) <= ytdMonth;
              return [fmtCentsRaw(b.mb[mi]), fmtCentsRaw(isPast ? b.ma[mi] : 0), fmtCentsRaw(isPast ? b.ma[mi] : b.mb[mi])];
            }))
            .concat([fmtCentsRaw(b.appr), fmtCentsRaw(b.ytd), fmtCentsRaw(b.proj)]));
        }
      });
    }

    downloadCsv('budget-report-' + currentSlug + '-' + fy + '-' + budgetState.mode + '.csv', rows);
  }

  // ── Giving summary ──────────────────────────────────────────────────────

  async function loadGivingCampaigns() {
    const sel = document.getElementById('organizational-giving-campaign-filter');
    if (!sel || !currentSlug) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gifts/campaigns', { method: 'GET' });
      if (!out || !out.res.ok) return;
      const campaigns = Array.isArray(out.data) ? out.data : [];
      const current = sel.value || pendingFilters.campaign || '';
      pendingFilters.campaign = '';
      sel.innerHTML = '<option value="">All campaigns</option>' +
        campaigns.map(function (c) { return '<option value="' + escapeHtml(c) + '"' + (c === current ? ' selected' : '') + '>' + escapeHtml(c) + '</option>'; }).join('');
    } catch (_) {}
  }

  async function loadGivingSummary() {
    const totalRaisedEl  = document.getElementById('gs-total-raised');
    const totalGiftsEl   = document.getElementById('gs-total-gifts');
    const avgGiftEl      = document.getElementById('gs-avg-gift');
    const totalDonorsEl  = document.getElementById('gs-total-donors');
    const byTypeEl       = document.getElementById('gs-by-type-tbody');
    const topDonorsEl    = document.getElementById('gs-top-donors-tbody');
    if (!byTypeEl || !currentSlug) return;

    const fy = fiscalYearForReports();
    const campaign = (document.getElementById('organizational-giving-campaign-filter') || {}).value || '';
    byTypeEl.innerHTML  = '<tr class="organizational-table-empty"><td colspan="2">Loading…</td></tr>';
    if (topDonorsEl) topDonorsEl.innerHTML = '<tr class="organizational-table-empty"><td colspan="2">Loading…</td></tr>';

    let url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/giving-summary?fiscal_year=' + fy;
    if (campaign) url += '&campaign=' + encodeURIComponent(campaign);

    const out = await apiJson(url, { method: 'GET' });
    if (!out || !out.res.ok) {
      byTypeEl.innerHTML = '<tr class="organizational-table-empty"><td colspan="2">Could not load data.</td></tr>';
      return;
    }

    const d = out.data;
    const receivedEl = document.getElementById('gs-received');
    const pledgedEl = document.getElementById('gs-pledged');
    if (receivedEl) receivedEl.textContent = fmtDollars(d.received_cents || 0);
    if (pledgedEl) pledgedEl.textContent = fmtDollars(d.pledged_cents || 0);
    if (totalRaisedEl)  totalRaisedEl.textContent  = fmtDollars(d.total_gifts_cents || 0);
    if (totalGiftsEl)   totalGiftsEl.textContent   = d.total_gifts || 0;
    if (avgGiftEl)      avgGiftEl.textContent       = fmtDollars(d.avg_gift_cents || 0);
    if (totalDonorsEl)  totalDonorsEl.textContent   = d.total_donors || 0;

    const typeLabels = { grant: 'Grant', donation: 'Donation', pledge: 'Pledge', membership_dues: 'Dues' };
    const byType = d.gifts_by_type || {};
    byTypeEl.innerHTML = Object.entries(typeLabels)
      .filter(function (e) { return byType[e[0]] > 0; })
      .map(function (e) {
        return '<tr><td>' + e[1] + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(byType[e[0]]) + '</td></tr>';
      }).join('') || '<tr class="organizational-table-empty"><td colspan="2">No gifts recorded yet.</td></tr>';

    const top = Array.isArray(d.top_constituents) ? d.top_constituents : [];
    if (topDonorsEl) {
      topDonorsEl.innerHTML = top.length
        ? top.map(function (c) {
            return '<tr><td>' + escapeHtml(c.display_name) + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(c.total_cents) + '</td></tr>';
          }).join('')
        : '<tr class="organizational-table-empty"><td colspan="2">No donor data.</td></tr>';
    }
  }

  var givingSummaryCampaignFilter = document.getElementById('organizational-giving-campaign-filter');
  if (givingSummaryCampaignFilter) {
    givingSummaryCampaignFilter.addEventListener('change', function () { syncUrl(false); loadGivingSummary(); });
  }

  // ── Reconciliation & Close ─────────────────────────────────────────────

  const CHECK_STATUS_LABEL = { pass: 'Ties', fail: 'Off', info: 'No data' };

  async function loadReconciliation() {
    const checksEl = document.getElementById('organizational-recon-checks');
    const lockStatusEl = document.getElementById('organizational-recon-lock-status');
    const lockBtn = document.getElementById('organizational-recon-lock-btn');
    const reopenBtn = document.getElementById('organizational-recon-reopen-btn');
    if (!checksEl || !currentSlug) return;

    checksEl.innerHTML = '<p class="organizational-hint">Loading…</p>';
    if (lockStatusEl) lockStatusEl.textContent = '';
    if (lockBtn) lockBtn.hidden = true;
    if (reopenBtn) reopenBtn.hidden = true;

    const fy = fiscalYearForReports();
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fiscal-years/' + encodeURIComponent(String(fy)) + '/reconciliation',
      { method: 'GET' }
    );
    if (!out || !out.res.ok) {
      checksEl.innerHTML = '<p class="organizational-hint">Could not load reconciliation checks.</p>';
      return;
    }

    const checks = Array.isArray(out.data.checks) ? out.data.checks : [];
    checksEl.innerHTML = checks.map(function (c) {
      const cls = 'organizational-recon-check organizational-recon-check--' + escapeHtml(c.status || 'info');
      const label = CHECK_STATUS_LABEL[c.status] || c.status || '';
      return '<div class="' + cls + '">' +
        '<div class="organizational-recon-check-head"><strong>' + escapeHtml(c.label || c.id || '') + '</strong>' +
        '<span class="organizational-badge">' + escapeHtml(label) + '</span></div>' +
        '<div class="organizational-hint">' + escapeHtml(c.detail || '') + '</div></div>';
    }).join('') || '<p class="organizational-hint">No checks available.</p>';

    const isAdmin = currentRole === 'admin';
    const lock = out.data.lock || { locked: false };
    if (lock.locked) {
      const who = lock.locked_by_user_id ? ' by user #' + lock.locked_by_user_id : '';
      const when = lock.locked_at ? new Date(lock.locked_at).toLocaleString() : '';
      if (lockStatusEl) lockStatusEl.textContent = 'FY' + fy + ' is locked' + who + (when ? ' on ' + when : '') + '.';
      if (reopenBtn) reopenBtn.hidden = !isAdmin;
    } else {
      if (lockStatusEl) lockStatusEl.textContent = 'FY' + fy + ' is open.';
      if (lockBtn) lockBtn.hidden = !isAdmin;
    }
    if (!isAdmin && lockStatusEl) {
      lockStatusEl.textContent += ' Only an org admin can lock or reopen a fiscal year.';
    }
  }

  async function lockCurrentFiscalYear() {
    const fy = fiscalYearForReports();
    if (!window.confirm('Lock fiscal year ' + fy + '? Budget, schedule, personnel, grant, actuals, and balance sheet data for this year will become read-only until an admin reopens it.')) {
      return;
    }
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fiscal-years/' + encodeURIComponent(String(fy)) + '/lock',
      { method: 'POST', body: JSON.stringify({}) }
    );
    if (!out || !out.res.ok) {
      window.alert((out && out.data && out.data.error) || 'Could not lock fiscal year.');
      return;
    }
    loadReconciliation();
  }

  async function reopenCurrentFiscalYear() {
    const fy = fiscalYearForReports();
    const reason = window.prompt(
      'Reason for reopening FY' + fy + ' (at least 10 characters — e.g. "Audit adjustment to grant revenue recognition"):'
    );
    if (reason == null) return;
    if (String(reason).trim().length < 10) {
      window.alert('Reason must be at least 10 characters.');
      return;
    }
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fiscal-years/' + encodeURIComponent(String(fy)) + '/reopen',
      { method: 'POST', body: JSON.stringify({ reason: reason }) }
    );
    if (!out || !out.res.ok) {
      window.alert((out && out.data && out.data.error) || 'Could not reopen fiscal year.');
      return;
    }
    loadReconciliation();
  }

  // ── GAAP Financial Statements ─────────────────────────────────────────────

  var XERO_UNAVAILABLE_MSG = 'This statement is computed live from the posted ledger and is not available for workspaces using Xero as the actuals source. Switch to the internal ledger in Settings to enable.';

  function renderNotAvailable(tbody, colSpan) {
    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + colSpan + '">' + escapeHtml(XERO_UNAVAILABLE_MSG) + '</td></tr>';
  }

  async function loadFinancialPosition() {
    var tbody = document.getElementById('organizational-sfp-tbody');
    var meta = document.getElementById('organizational-sfp-meta');
    var csvLink = document.getElementById('organizational-sfp-csv');
    var footnote = document.getElementById('organizational-sfp-footnote');
    if (!tbody || !currentSlug) return;

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="3">Loading…</td></tr>';
    if (meta) meta.textContent = '';
    if (footnote) footnote.innerHTML = '';

    var fy = fiscalYearForReports();
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/financial-position?fiscal_year=' + fy;
    if (csvLink) { csvLink.href = base + '&format=csv'; }

    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="3">Could not load statement.</td></tr>';
      return;
    }
    if (out.data.not_available) {
      renderNotAvailable(tbody, 3);
      if (meta) meta.textContent = 'Not available';
      if (csvLink) csvLink.hidden = true;
      return;
    }

    sfpCache = { d: out.data, fy: fy };
    renderFinancialPosition();
    var d = out.data;
    if (meta) meta.textContent = 'As of end of FY' + fy + ' · Ledger-sourced';

    var rd = d.restriction_detail || {};
    var tempCents = rd.temporarily_restricted_cents || 0;
    var permCents = rd.permanently_restricted_cents || 0;
    if ((tempCents || permCents) && footnote) {
      footnote.innerHTML = '<strong>Restriction detail (with donor restrictions):</strong> ' +
        'Temporarily restricted ' + fmtDollars(tempCents) + ' · ' +
        'Permanently restricted ' + fmtDollars(permCents);
    }
  }

  function renderFinancialPosition() {
    var tbody = document.getElementById('organizational-sfp-tbody');
    if (!tbody || !sfpCache) return;
    var d = sfpCache.d;
    var fy = sfpCache.fy;
    var html = '';

    function sectionHeader(label) {
      return '<tr style="background:var(--surface-active);"><td colspan="3" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">' + escapeHtml(label) + '</td></tr>';
    }
    function totalRow(label, cents) {
      return '<tr style="font-weight:600;border-top:1px solid var(--border);"><td colspan="2">' + escapeHtml(label) + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(cents) + '</td></tr>';
    }
    function accountRow(code, name, cents, href) {
      return '<tr><td>' + escapeHtml(name) + '</td><td style="color:var(--text-secondary);">' + escapeHtml(rdCode(code) || '') + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + amountLink(fmtStmt(cents), href) + '</td></tr>';
    }
    function acctHref(r) { return ledgerHref(r.account_id, d.start_date, d.end_date, fy); }

    html += sectionHeader('Assets');
    sortedIn(sfpSorter, (d.assets || []).filter(function(r) { return hideZero(Number(r.balance_cents) !== 0); })).forEach(function(r) { html += accountRow(r.code, r.name, r.balance_cents, acctHref(r)); });
    html += totalRow('Total assets', d.total_assets_cents);

    html += sectionHeader('Liabilities');
    sortedIn(sfpSorter, (d.liabilities || []).filter(function(r) { return hideZero(Number(r.balance_cents) !== 0); })).forEach(function(r) { html += accountRow(r.code, r.name, r.balance_cents, acctHref(r)); });
    html += totalRow('Total liabilities', d.total_liabilities_cents);

    html += sectionHeader('Net Assets');
    var na = d.net_assets || {};
    html += accountRow('', 'Without donor restrictions', na.without_restrictions_cents || 0);
    if (na.board_designated_cents) {
      html += '<tr><td style="padding-left:28px;color:var(--text-secondary);">of which: board-designated</td><td></td><td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary);">' + fmtStmt(na.board_designated_cents) + '</td></tr>';
    }
    html += accountRow('', 'With donor restrictions', na.with_restrictions_cents || 0);
    html += totalRow('Total net assets', na.total_cents || 0);

    html += '<tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="2">Total liabilities and net assets</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(d.total_liabilities_and_net_assets_cents) + '</td></tr>';

    tbody.innerHTML = html;
    syncCodeHeader('organizational-sfp-tbody');
  }

  async function loadStatementOfActivities() {
    var tbody = document.getElementById('organizational-soa-tbody');
    var meta = document.getElementById('organizational-soa-meta');
    var csvLink = document.getElementById('organizational-soa-csv');
    if (!tbody || !currentSlug) return;

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">Loading…</td></tr>';
    if (meta) meta.textContent = '';

    var fy = fiscalYearForReports();
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/statement-of-activities?fiscal_year=' + fy;
    if (csvLink) { csvLink.href = base + '&format=csv'; }

    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">Could not load statement.</td></tr>';
      return;
    }
    if (out.data.not_available) {
      renderNotAvailable(tbody, 5);
      if (meta) meta.textContent = 'Not available';
      if (csvLink) csvLink.hidden = true;
      return;
    }

    soaCache = { d: out.data, fy: fy };
    renderStatementOfActivities();
    if (meta) meta.textContent = 'FY' + fy + ' · Ledger-sourced';
  }

  function renderStatementOfActivities() {
    var tbody = document.getElementById('organizational-soa-tbody');
    if (!tbody || !soaCache) return;
    var d = soaCache.d;
    var fy = soaCache.fy;
    var html = '';
    var t = d.totals || {};
    var na = d.net_assets || {};
    var beg = na.beginning || {};
    var end = na.ending || {};

    function sectionHeader(label) {
      return '<tr style="background:var(--surface-active);"><td colspan="5" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">' + escapeHtml(label) + '</td></tr>';
    }
    function totalRow(label, woCents, wCents, totalCents, bold) {
      var style = bold ? 'font-weight:600;border-top:2px solid var(--border);' : 'font-weight:600;border-top:1px solid var(--border);';
      return '<tr style="' + style + '"><td colspan="2">' + escapeHtml(label) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(woCents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(wCents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(totalCents) + '</td></tr>';
    }
    function accountRow(code, name, woCents, wCents, href) {
      return '<tr>' +
        '<td>' + escapeHtml(name) + '</td>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(rdCode(code) || '') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + (woCents != null ? fmtStmt(woCents) : '—') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + (wCents != null ? fmtStmt(wCents) : '—') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + amountLink(fmtStmt((woCents || 0) + (wCents || 0)), href) + '</td></tr>';
    }
    function acctHref(r) { return ledgerHref(r.account_id, d.start_date, d.end_date, fy); }

    html += sectionHeader('Revenue');
    var revByAccount = {};
    (d.revenue || []).forEach(function(r) {
      if (!revByAccount[r.account_id]) revByAccount[r.account_id] = { account_id: r.account_id, code: r.code, name: r.name, without: 0, with: 0 };
      if (r.restriction_bucket === 'with_restrictions') revByAccount[r.account_id].with += Number(r.amount_cents);
      else revByAccount[r.account_id].without += Number(r.amount_cents);
    });
    sortedIn(soaSorter, Object.values(revByAccount).map(function(r) { return { account_id: r.account_id, code: r.code, name: r.name, without: r.without || null, with: r.with || null }; }).filter(function(r) { return hideZero(!!(r.without || r.with)); })).forEach(function(r) {
      html += accountRow(r.code, r.name, r.without, r.with, acctHref(r));
    });
    html += totalRow('Total revenue', t.revenue_without_restrictions_cents || 0, t.revenue_with_restrictions_cents || 0, t.total_revenue_cents || 0, false);

    html += sectionHeader('Expenses');
    sortedIn(soaSorter, (d.expenses || []).map(function(r) { return { account_id: r.account_id, code: r.code, name: r.name, without: Number(r.amount_cents), with: null }; }).filter(function(r) { return hideZero(!!r.without); })).forEach(function(r) {
      html += accountRow(r.code, r.name, r.without, null, acctHref(r));
    });
    html += totalRow('Total expenses', t.total_expenses_cents || 0, 0, t.total_expenses_cents || 0, false);

    html += sectionHeader('Change in Net Assets');
    html += totalRow('Change in net assets', t.change_without_restrictions_cents || 0, t.change_with_restrictions_cents || 0, t.total_change_in_net_assets_cents || 0, false);

    html += sectionHeader('Net Assets');
    html += '<tr><td>Beginning of year</td><td></td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(beg.without_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(beg.with_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(beg.total_cents || 0) + '</td></tr>';
    html += '<tr style="font-weight:700;border-top:2px solid var(--border);"><td>End of year</td><td></td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(end.without_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(end.with_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(end.total_cents || 0) + '</td></tr>';

    tbody.innerHTML = html;
    syncCodeHeader('organizational-soa-tbody');
  }

  async function loadStmtFunctionalExpenses() {
    var tbody = document.getElementById('organizational-sfe-tbody');
    var meta = document.getElementById('organizational-sfe-meta');
    var csvLink = document.getElementById('organizational-sfe-csv');
    if (!tbody || !currentSlug) return;

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Loading…</td></tr>';
    if (meta) meta.textContent = '';

    var fy = fiscalYearForReports();
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/functional-expenses?fiscal_year=' + fy;
    if (csvLink) { csvLink.href = base + '&format=csv'; }

    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Could not load statement.</td></tr>';
      return;
    }
    if (out.data.not_available) {
      renderNotAvailable(tbody, 6);
      if (meta) meta.textContent = 'Not available';
      if (csvLink) csvLink.hidden = true;
      return;
    }

    var d = out.data;
    var lines = d.lines || [];

    if (!lines.length) {
      sfeCache = null;
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No expense accounts with posted activity for FY' + fy + '.</td></tr>';
      if (meta) meta.textContent = 'No data for FY' + fy;
      return;
    }

    sfeCache = d;
    renderStmtFunctionalExpenses();
    var missing = lines.filter(function (l) { return l.missing_classification; }).length;
    if (meta) {
      meta.textContent = lines.length + ' expense accounts · FY' + fy + (missing ? ' · ' + missing + ' without an allocation (shown as program services), so this is a draft until they are set' : '');
      meta.style.color = missing ? 'var(--organizational-status-warning)' : '';
    }
  }

  function renderStmtFunctionalExpenses() {
    var tbody = document.getElementById('organizational-sfe-tbody');
    if (!tbody || !sfeCache) return;
    var lines = sfeCache.lines || [];
    var totals = sfeCache.totals || {};

    var html = sortedIn(sfeSorter, lines.filter(function(l) { return hideZero(Number(l.total_cents) !== 0); })).map(function(l) {
      return '<tr>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(rdCode(l.code || '—')) + '</td>' +
        '<td>' + escapeHtml(l.name || '—') + (l.missing_classification ? ' <span style="color:var(--organizational-status-warning);font-size:11px;" title="Allocations not set">⚠</span>' : '') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(l.total_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(l.program_services_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(l.mgmt_general_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(l.fundraising_cents) + '</td>' +
        '</tr>';
    }).join('');

    html += '<tr style="font-weight:600;border-top:2px solid var(--border);">' +
      '<td colspan="2">Total</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(totals.total_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(totals.program_services_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(totals.mgmt_general_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtStmt(totals.fundraising_cents || 0) + '</td>' +
      '</tr>';

    tbody.innerHTML = html;
    syncCodeHeader('organizational-sfe-tbody');
  }

  function money2(cents) {
    var n = Number(cents) / 100;
    var t = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 && t !== '0.00' ? '(' + t + ')' : t;
  }
  function dollarCell(cents, zeroDash, href) {
    if (zeroDash && Number(cents) === 0) return '';
    var text = amountLink(escapeHtml(money2(cents)), href);
    return '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + text + '</td>';
  }

  function amountLink(html, href) {
    if (!href) return html;
    return '<a href="' + escapeHtml(href) + '" data-report-link="1" title="See the entries behind this amount" style="color:inherit;text-decoration:none;border-bottom:1px dotted var(--border);">' + html + '</a>';
  }

  function ledgerHref(accountId, from, to, fy) {
    if (!accountId) return '';
    var q = new URLSearchParams({ report: 'account-transactions', fy: String(fy), from: from, to: to, account: String(accountId) });
    return window.location.pathname + '?' + q.toString();
  }

  var r1099Cache = null;
  function fill1099Years() {
    var sel = document.getElementById('organizational-1099-year');
    if (!sel || sel.options.length) return sel;
    var now = new Date();
    for (var y = now.getFullYear(); y >= now.getFullYear() - 4; y--) sel.insertAdjacentHTML('beforeend', '<option value="' + y + '">' + y + '</option>');
    sel.value = String(now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear());
    return sel;
  }
  async function load1099Report() {
    var sel = fill1099Years();
    var tbody = document.getElementById('organizational-1099-tbody');
    var meta = document.getElementById('organizational-1099-meta');
    var csv = document.getElementById('organizational-1099-csv');
    var rules = document.getElementById('organizational-1099-rules-link');
    if (!sel || !tbody || !currentSlug) return;
    if (rules) rules.href = '/organizational/o/' + encodeURIComponent(currentSlug) + '/accounting-settings';
    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Loading…</td></tr>';
    var url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/vendor-compliance/1099-summary?year=' + encodeURIComponent(sel.value);
    if (csv) csv.href = url + '&format=csv';
    var out = await apiJson(url, { method: 'GET' });
    if (!out || !out.res.ok) {
      r1099Cache = null;
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">' + (out && out.res.status === 403 ? 'The 1099 report is for finance and admin.' : 'Could not load the 1099 report.') + '</td></tr>';
      if (meta) meta.textContent = '';
      return;
    }
    r1099Cache = out.data;
    syncUrl(false);
    render1099Report();
  }
  function render1099Report() {
    var tbody = document.getElementById('organizational-1099-tbody');
    var meta = document.getElementById('organizational-1099-meta');
    if (!tbody || !r1099Cache) return;
    var d = r1099Cache;
    if (d.reports_1099 === false) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">1099 reporting is switched off for this organization. Turn it on in Accounting settings.</td></tr>';
      if (meta) meta.textContent = '';
      return;
    }
    var onlyOver = document.getElementById('organizational-1099-over').checked;
    var onlyMissing = document.getElementById('organizational-1099-missing').checked;
    var base = '/organizational/o/' + encodeURIComponent(currentSlug) + '/contacts?from=reports&contact=';
    var rows = d.vendors.filter(function (v) {
      if (onlyOver && !v.over_threshold) return false;
      if (onlyMissing && v.w9_received && v.has_tax_id) return false;
      return true;
    });
    tbody.innerHTML = rows.length ? rows.map(function (v) {
      return '<tr><td><a href="' + escapeHtml(base + v.constituent_id) + '">' + escapeHtml(v.display_name) + '</a></td>'
        + '<td style="text-align:right;">' + dollarsPlain(v.reportable_paid_cents) + '</td>'
        + '<td>' + (v.over_threshold ? 'Yes' : 'No') + '</td>'
        + '<td>' + (v.w9_received ? 'Received' : '<span style="color:var(--organizational-status-danger,#b00020);">Missing</span>') + '</td>'
        + '<td>' + (v.has_tax_id ? 'On file' : '<span style="color:var(--organizational-status-danger,#b00020);">Missing</span>') + '</td>'
        + '<td style="color:var(--text-secondary);">' + escapeHtml(String(v.tax_entity_type || '').replace(/_/g, ' ')) + '</td></tr>';
    }).join('') : '<tr class="organizational-table-empty"><td colspan="6">' + (d.vendors.length ? 'No vendors match.' : 'No 1099-eligible vendors yet. Mark a vendor 1099 eligible under Contacts, Edit compliance.') + '</td></tr>';
    var over = d.vendors.filter(function (v) { return v.over_threshold; }).length;
    var missing = d.vendors.filter(function (v) { return v.over_threshold && !(v.w9_received && v.has_tax_id); }).length;
    if (meta) meta.textContent = 'Reporting amount $' + (Number(d.threshold_cents) / 100).toLocaleString() + (d.threshold_cents !== d.legal_threshold_cents ? ' (legal amount $' + (Number(d.legal_threshold_cents) / 100).toLocaleString() + ')' : '')
      + ' · ' + over + ' vendor' + (over === 1 ? '' : 's') + ' reach it' + (missing ? ', ' + missing + ' missing a W-9 or tax ID' : '');
  }
  function dollarsPlain(cents) { return '$' + (Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function loadTrialBalance() {
    var tbody = document.getElementById('organizational-tb-tbody');
    var meta = document.getElementById('organizational-tb-meta');
    var csvLink = document.getElementById('organizational-tb-csv');
    var asOfEl = document.getElementById('organizational-tb-asof');
    if (!tbody || !currentSlug) return;
    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">Loading…</td></tr>';
    var fy = fiscalYearForReports();
    var q = '?fiscal_year=' + fy + (asOfEl && asOfEl.value ? '&as_of=' + encodeURIComponent(asOfEl.value) : '');
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/trial-balance' + q;
    if (csvLink) csvLink.href = base + '&format=csv';
    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">Could not load the trial balance.</td></tr>';
      return;
    }
    var d = out.data;
    if (asOfEl && !asOfEl.value) asOfEl.value = d.as_of;
    syncUrl(false);
    if (!d.lines.length && !d.prior_year_result) {
      tbCache = null;
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">No posted ledger activity through ' + escapeHtml(d.as_of) + '.</td></tr>';
      if (meta) meta.textContent = '';
      return;
    }
    tbCache = d;
    renderTrialBalance();
    if (meta) meta.textContent = (d.in_balance ? '✓ In balance' : '✗ OUT OF BALANCE by $' + money2(Math.abs(Number(d.totals.debit_cents) - Number(d.totals.credit_cents)))) + ' · as of ' + d.as_of + ' · FY' + d.fiscal_year;
  }

  function renderTrialBalance() {
    var tbody = document.getElementById('organizational-tb-tbody');
    if (!tbody || !tbCache) return;
    var d = tbCache;
    var html = sortedIn(tbSorter, d.lines.filter(function (l) { return hideZero(Number(l.debit_cents) !== 0 || Number(l.credit_cents) !== 0); })).map(function (l) {
      var href = ledgerHref(l.account_id, d.start_date, d.as_of, d.fiscal_year);
      return '<tr><td style="color:var(--text-secondary);">' + escapeHtml(rdCode(l.code)) + '</td><td>' + escapeHtml(l.name) + '</td>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(l.type) + '</td>' + (Number(l.debit_cents) ? dollarCell(l.debit_cents, false, href) : '<td></td>') +
        (Number(l.credit_cents) ? dollarCell(l.credit_cents, false, href) : '<td></td>') + '</tr>';
    }).join('');
    if (d.prior_year_result) {
      var p = d.prior_year_result;
      html += '<tr><td></td><td colspan="2" style="font-style:italic;">' + escapeHtml(p.name) + '</td>' +
        (Number(p.debit_cents) ? dollarCell(p.debit_cents) : '<td></td>') + (Number(p.credit_cents) ? dollarCell(p.credit_cents) : '<td></td>') + '</tr>';
    }
    html += '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="3">Total</td>' + dollarCell(d.totals.debit_cents) + dollarCell(d.totals.credit_cents) + '</tr>';
    tbody.innerHTML = html;
    syncCodeHeader('organizational-tb-tbody');
  }

  var glAccountsLoaded = false;
  async function loadGeneralLedgerAccounts() {
    if (glAccountsLoaded || !currentSlug) return;
    var sels = ['organizational-gl-account', 'organizational-at-account'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!sels.length) return;
    var out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/accounts', { method: 'GET' });
    var list = out && out.res.ok && Array.isArray(out.data.accounts) ? out.data.accounts : (out && out.res.ok && Array.isArray(out.data) ? out.data : []);
    list.filter(function (a) { return a.is_posting && !a.is_statistical; }).forEach(function (a) {
      sels.forEach(function (sel) {
        var o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.code + ' — ' + a.name;
        sel.appendChild(o);
      });
    });
    glAccountsLoaded = true;
  }

  async function loadGeneralLedger() {
    var body = document.getElementById('organizational-gl-body');
    var meta = document.getElementById('organizational-gl-meta');
    var csvLink = document.getElementById('organizational-gl-csv');
    if (!body || !currentSlug) return;
    await loadGeneralLedgerAccounts();
    var from = document.getElementById('organizational-gl-from');
    var to = document.getElementById('organizational-gl-to');
    var acct = document.getElementById('organizational-gl-account');
    if (acct && pendingFilters.glAccount) { acct.value = pendingFilters.glAccount; pendingFilters.glAccount = ''; }
    var params = [];
    if (from && from.value) params.push('from=' + encodeURIComponent(from.value));
    if (to && to.value) params.push('to=' + encodeURIComponent(to.value));
    if (acct && acct.value) params.push('account_id=' + encodeURIComponent(acct.value));
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/general-ledger' + (params.length ? '?' + params.join('&') : '');
    if (csvLink) csvLink.href = base + (params.length ? '&' : '?') + 'format=csv';
    body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Loading…</p>';
    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Could not load the general ledger.</p>';
      return;
    }
    var d = out.data;
    if (from && !from.value) from.value = d.from;
    if (to && !to.value) to.value = d.to;
    syncUrl(false);
    if (!d.accounts.length) {
      glCache = null;
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">No posted activity in this range.</p>';
      if (meta) meta.textContent = '';
      return;
    }
    glCache = d;
    renderGeneralLedger();
    if (meta) meta.textContent = d.accounts.length + ' account' + (d.accounts.length === 1 ? '' : 's') + ' · ' + d.line_count + ' lines' + (d.truncated ? ' · stopped at ' + d.line_cap + ' lines, narrow the dates or pick one account' : '');
  }

  var GL_SORT_COLUMNS = [
    { key: 'date', type: 'date', get: function (l) { return l.date; } },
    { key: 'txn', type: 'number', get: function (l) { return l.transaction_id; } },
    { key: 'contact', type: 'text', get: function (l) { return l.contact_name || l.payee; } },
    { key: 'description', type: 'text', get: function (l) { return l.line_memo || l.memo; } },
    { key: 'reference', type: 'text', get: function (l) { return l.reference; } },
    { key: 'related', type: 'text', get: function (l) { return l.related_account; } },
    { key: 'program', type: 'text', get: function (l) { return l.program; } },
    { key: 'grant', type: 'text', get: function (l) { return l.grant; } },
    { key: 'debit', type: 'number', get: function (l) { return centsOrNull(l.debit_cents); } },
    { key: 'credit', type: 'number', get: function (l) { return centsOrNull(l.credit_cents); } },
    { key: 'balance', type: 'number', get: function (l) { return Number(l.balance_cents); } },
  ];

  function renderGeneralLedger(focusAccountIdx, focusCol) {
    var body = document.getElementById('organizational-gl-body');
    if (!body || !glCache) return;
    var d = glCache;
    var slugBase = '/organizational/o/' + encodeURIComponent(currentSlug);
    body.innerHTML = d.accounts.map(function (a) {
      var rows = '<tr style="background:var(--surface-hover);font-weight:600;"><td colspan="10">Opening balance</td>' + dollarCell(a.opening_cents) + '</tr>';
      var shown = window.OrganizationalTableSort ? sortGlLines(a.lines) : a.lines;
      rows += shown.map(function (l) {
        return '<tr><td style="white-space:nowrap;">' + escapeHtml(l.date) + '</td>' +
          '<td><a href="' + slugBase + '/transactions?txn=' + encodeURIComponent(l.transaction_id) + '">#' + escapeHtml(l.transaction_id) + '</a></td>' +
          '<td>' + escapeHtml(l.contact_name || l.payee || '') + '</td>' +
          '<td>' + escapeHtml(l.line_memo || l.memo || '') + '</td>' +
          '<td>' + escapeHtml(l.reference || '') + '</td>' +
          '<td style="color:var(--text-secondary);">' + escapeHtml(l.related_account || '') + '</td>' +
          '<td>' + escapeHtml(l.program || '') + '</td><td>' + escapeHtml(l.grant || '') + '</td>' +
          (Number(l.debit_cents) ? dollarCell(l.debit_cents) : '<td></td>') + (Number(l.credit_cents) ? dollarCell(l.credit_cents) : '<td></td>') +
          dollarCell(l.balance_cents) + '</tr>';
      }).join('');
      rows += '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="8">Closing balance</td>' + dollarCell(a.total_debit_cents) + dollarCell(a.total_credit_cents) + dollarCell(a.closing_cents) + '</tr>';
      return '<div style="padding:12px 16px 4px;font-weight:600;">' + escapeHtml(a.code) + ' — ' + escapeHtml(a.name) +
        ' <span class="organizational-hint" style="font-weight:400;">(' + escapeHtml(a.natural_side) + ' account)</span></div>' +
        '<div class="organizational-table-wrap"><table class="organizational-table" data-gl-table="1" aria-label="' + escapeHtml(a.name) + '"><thead><tr><th>Date</th><th>Txn</th><th>Contact</th><th>Description</th><th>Reference</th><th>Related account</th><th>Program</th><th>Grant</th>' +
        '<th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('');
    if (!window.OrganizationalTableSort) return;
    body.querySelectorAll('table[data-gl-table]').forEach(function (table, idx) {
      window.OrganizationalTableSort.attach(table, {
        columns: GL_SORT_COLUMNS,
        state: glSortState,
        onChange: function () { var ae = document.activeElement; renderGeneralLedger(idx, ae && ae.tagName === 'TH' ? ae.cellIndex : -1); },
      });
    });
    if (focusAccountIdx != null && focusCol >= 0) {
      var t = body.querySelectorAll('table[data-gl-table]')[focusAccountIdx];
      var th = t && t.tHead.rows[0].cells[focusCol];
      if (th) th.focus();
    }
  }

  function sortGlLines(lines) {
    var i = glSortState.index;
    if (i < 0 || !glSortState.dir) return lines;
    return window.OrganizationalTableSort.sortArray(lines, GL_SORT_COLUMNS[i], glSortState.dir);
  }

  var atCache = null;
  var atSortState = { index: -1, dir: null };
  var AT_SORT_COLUMNS = [
    { key: 'date', type: 'date', get: function (l) { return l.date; } },
    { key: 'contact', type: 'text', get: function (l) { return l.contact_name || l.payee; } },
    { key: 'description', type: 'text', get: function (l) { return l.line_memo || l.memo; } },
    { key: 'reference', type: 'text', get: function (l) { return l.reference; } },
    { key: 'related', type: 'text', get: function (l) { return l.related_account; } },
    { key: 'program', type: 'text', get: function (l) { return l.program; } },
    { key: 'grant', type: 'text', get: function (l) { return l.grant; } },
    { key: 'debit', type: 'number', get: function (l) { return centsOrNull(l.debit_cents); } },
    { key: 'credit', type: 'number', get: function (l) { return centsOrNull(l.credit_cents); } },
    { key: 'balance', type: 'number', get: function (l) { return Number(l.balance_cents); } },
  ];

  var SCHEDULES = {
    'receivables-schedule': { prefix: 'organizational-rs', endpoint: 'receivables-schedule', labels: { invoice: 'Invoice', pledge: 'Pledge' }, ledgerLabel: 'Ledger balance of the receivable accounts' },
    'payables-schedule': { prefix: 'organizational-ps', endpoint: 'payables-schedule', labels: { bill: 'Bill', claim: 'Expense claim' }, ledgerLabel: 'Ledger balance of the payable accounts' },
  };
  var BUCKET_LABELS = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': 'Over 90 days' };
  var scheduleCache = {};
  var scheduleSort = {};
  var SCHEDULE_COLUMNS = [
    { key: 'contact', type: 'text', get: function (i) { return i.contact_name; } },
    { key: 'type', type: 'text', get: function (i) { return i.kind; } },
    { key: 'reference', type: 'text', get: function (i) { return i.reference; } },
    { key: 'date', type: 'date', get: function (i) { return i.date; } },
    { key: 'due', type: 'date', get: function (i) { return i.due_date; } },
    { key: 'balance', type: 'number', get: function (i) { return i.balance_cents; } },
    { key: 'days', type: 'number', get: function (i) { return i.days_past_due; } },
  ];

  async function loadSchedule(name) {
    var cfg = SCHEDULES[name];
    var body = document.getElementById(cfg.prefix + '-body');
    var asOfEl = document.getElementById(cfg.prefix + '-asof');
    var csvLink = document.getElementById(cfg.prefix + '-csv');
    if (!body || !currentSlug) return;
    var q = asOfEl && asOfEl.value ? '?as_of=' + encodeURIComponent(asOfEl.value) : '';
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/' + cfg.endpoint;
    if (csvLink) csvLink.href = base + (q ? q + '&' : '?') + 'format=csv';
    body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Loading…</p>';
    var out = await apiJson(base + q, { method: 'GET' });
    if (!out || !out.res.ok) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Could not load the schedule.</p>';
      return;
    }
    if (asOfEl && !asOfEl.value) asOfEl.value = out.data.as_of;
    scheduleCache[name] = out.data;
    renderSchedule(name);
    loadSavedCopies(name);
  }

  async function loadSavedCopies(name) {
    var cfg = SCHEDULES[name];
    var el = document.getElementById(cfg.prefix + '-saved');
    if (!el) return;
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/';
    var out = await apiJson(base + cfg.endpoint + '/saved', { method: 'GET' });
    var copies = (out && out.res.ok && out.data.copies) || [];
    if (!copies.length) { el.innerHTML = '<div class="organizational-hint" style="margin:0;">No saved copies yet. Save a copy to keep this schedule as of its date.</div>'; return; }
    el.innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:2px;">Saved copies (' + copies.length + ')</div>' + copies.map(function (c) {
      var saved = new Date(c.created_at);
      var when = Number.isNaN(saved.getTime()) ? '' : saved.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8125rem;">' +
        '<a href="' + base + 'saved-copies/' + c.id + '/download" target="_blank" rel="noopener" style="flex:1 1 auto;">' + escapeHtml(c.title) + '</a>' +
        '<span style="color:var(--text-secondary);white-space:nowrap;">saved ' + escapeHtml(when) + (c.saved_by ? ' by ' + escapeHtml(c.saved_by) : '') + '</span>' +
        '<button type="button" class="organizational-btn-icon" data-saved-delete="' + c.id + '" title="Delete this copy" aria-label="Delete this copy">✕</button></div>';
    }).join('');
    el.querySelectorAll('[data-saved-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!window.confirm('Delete this saved copy? The file is removed and cannot be recovered.')) return;
        var r = await apiJson(base + 'saved-copies/' + btn.getAttribute('data-saved-delete'), { method: 'DELETE' });
        if (r && r.res.ok) loadSavedCopies(name);
      });
    });
  }

  async function saveSchedule(name) {
    var cfg = SCHEDULES[name];
    var btn = document.getElementById(cfg.prefix + '-save');
    var asOfEl = document.getElementById(cfg.prefix + '-asof');
    var meta = document.getElementById(cfg.prefix + '-meta');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var q = asOfEl && asOfEl.value ? '?as_of=' + encodeURIComponent(asOfEl.value) : '';
    var out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/' + cfg.endpoint + '/save' + q, { method: 'POST' });
    if (btn) { btn.disabled = false; btn.textContent = 'Save a copy'; }
    if (!out || !out.res.ok) { if (meta) meta.textContent = (out && out.data && out.data.error) || 'Could not save a copy.'; return; }
    loadSavedCopies(name);
  }

  var scheduleView = {};
  var scheduleFilter = {};

  function scheduleControls(name, cfg, d) {
    var id = cfg.prefix + '-controls';
    var el = document.getElementById(id);
    var tiles = document.getElementById(cfg.prefix + '-tiles');
    if (!el && tiles) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:4px 16px 10px;font-size:0.8125rem;';
      tiles.insertAdjacentElement('afterend', el);
      el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-schedule-view]');
        if (!a) return;
        e.preventDefault();
        scheduleView[name] = a.getAttribute('data-schedule-view');
        renderSchedule(name);
      });
      el.addEventListener('input', function (e) {
        var f = scheduleFilter[name] = scheduleFilter[name] || {};
        if (e.target.matches('[data-schedule-q]')) f.q = e.target.value;
        if (e.target.matches('[data-schedule-type]')) f.type = e.target.value;
        if (e.target.matches('[data-schedule-age]')) f.age = e.target.value;
        renderSchedule(name, true);
      });
    }
    return el;
  }

  function renderSchedule(name, keepControls) {
    var cfg = SCHEDULES[name];
    var d = scheduleCache[name];
    var body = document.getElementById(cfg.prefix + '-body');
    var tiles = document.getElementById(cfg.prefix + '-tiles');
    var meta = document.getElementById(cfg.prefix + '-meta');
    var ledgerEl = document.getElementById(cfg.prefix + '-ledger');
    if (!d || !body) return;
    var slugBase = '/organizational/o/' + encodeURIComponent(currentSlug);
    var tile = function (label, cents, strong) {
      return '<div style="flex:1 1 130px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;background:var(--surface-1,#fff);">' +
        '<div style="font-size:var(--text-xs);color:var(--text-secondary);">' + label + '</div>' +
        '<div style="font-size:' + (strong ? '1.125rem;font-weight:600' : '1rem') + ';">' + escapeHtml(money2(cents)) + '</div></div>';
    };
    if (tiles) {
      tiles.innerHTML = tile('Total', d.totals.total, true) + Object.keys(BUCKET_LABELS).map(function (b) { return tile(BUCKET_LABELS[b], d.totals[b]); }).join('');
    }
    if (meta) meta.textContent = d.items.length + ' item' + (d.items.length === 1 ? '' : 's');
    var state = scheduleSort[name] = scheduleSort[name] || { index: -1, dir: null };
    var view = scheduleView[name] || 'items';
    var flt = scheduleFilter[name] = scheduleFilter[name] || {};
    var ctl = scheduleControls(name, cfg, d);
    var linkStyle = 'color:var(--organizational-accent);text-decoration:underline;';
    var viewLink = function (v, label) { return v === view ? '<b>' + label + '</b>' : '<a href="#" data-schedule-view="' + v + '" style="' + linkStyle + '">' + label + '</a>'; };
    if (ctl && !keepControls) {
      var kinds = Object.keys(cfg.labels);
      ctl.innerHTML = viewLink('items', 'Open items') + ' · ' + viewLink('ledger', 'Ledger entries by account') +
        (view === 'items'
          ? '<span style="flex:1 1 20px;"></span><input type="search" data-schedule-q placeholder="Contact or reference" value="' + escapeHtml(flt.q || '') + '" class="organizational-input" style="width:190px;font-size:0.8125rem;padding:4px 7px;">' +
            '<select data-schedule-type class="organizational-input" style="width:auto;font-size:0.8125rem;padding:4px 7px;"><option value="">All types</option>' +
            kinds.map(function (k) { return '<option value="' + k + '"' + (flt.type === k ? ' selected' : '') + '>' + escapeHtml(cfg.labels[k]) + '</option>'; }).join('') + '</select>' +
            '<select data-schedule-age class="organizational-input" style="width:auto;font-size:0.8125rem;padding:4px 7px;"><option value="">All ages</option>' +
            Object.keys(BUCKET_LABELS).map(function (b) { return '<option value="' + b + '"' + (flt.age === b ? ' selected' : '') + '>' + escapeHtml(BUCKET_LABELS[b]) + '</option>'; }).join('') + '</select>'
          : '');
    }
    var needle = String(flt.q || '').trim().toLowerCase();
    var filtered = view !== 'items' ? d.items : d.items.filter(function (i) {
      if (flt.type && i.kind !== flt.type) return false;
      if (flt.age && i.bucket !== flt.age) return false;
      return !needle || (String(i.contact_name || '') + ' ' + String(i.reference || '')).toLowerCase().indexOf(needle) >= 0;
    });
    var shown = window.OrganizationalTableSort && state.index >= 0 && state.dir
      ? window.OrganizationalTableSort.sortArray(filtered, SCHEDULE_COLUMNS[state.index], state.dir) : filtered;
    if (view === 'ledger') {
      var lines = d.ledger.lines || [];
      body.innerHTML = !lines.length ? '<p class="organizational-empty" style="padding:16px 20px;">No ledger entries on these accounts.</p>'
        : '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Account</th><th>Date</th><th>Contact</th><th>Memo</th><th style="text-align:right;">Amount</th><th>Origin</th></tr></thead><tbody>' +
          lines.map(function (l) {
            var href = slugBase + '/transactions?txn=' + encodeURIComponent(l.transaction_id);
            return '<tr data-txn-href="' + escapeHtml(href) + '" style="cursor:pointer;" title="Open this entry"><td>' + escapeHtml(l.account) + '</td><td style="white-space:nowrap;">' + escapeHtml(l.date) + '</td><td>' + escapeHtml(l.contact) + '</td><td>' + escapeHtml(l.memo) + '</td>' +
              dollarCell(l.amount_cents) + '<td>' + (l.direct ? 'Entered directly' : 'From a record') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      body.querySelectorAll('tr[data-txn-href]').forEach(function (tr) {
        tr.addEventListener('click', function () { window.location.href = tr.getAttribute('data-txn-href'); });
      });
    } else if (!shown.length) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Nothing is open.</p>';
    } else {
      body.innerHTML = '<div class="organizational-table-wrap"><table class="organizational-table" data-schedule-table="1" aria-label="' + escapeHtml(name) + '"><thead><tr>' +
        '<th>Contact</th><th>Type</th><th>Reference</th><th>Date</th><th>Due</th><th style="text-align:right;">Balance</th><th style="text-align:right;">Days past due</th><th>Age</th></tr></thead><tbody>' +
        shown.map(function (i) {
          var href = i.ledger_transaction_id ? slugBase + '/transactions?txn=' + encodeURIComponent(i.ledger_transaction_id) : '';
          return '<tr' + (href ? ' data-txn-href="' + escapeHtml(href) + '" style="cursor:pointer;" title="Open this entry"' : '') + '>' +
            '<td>' + escapeHtml(i.contact_name || '') + '</td><td>' + escapeHtml(cfg.labels[i.kind] || i.kind) + '</td><td>' + escapeHtml(i.reference || '') + (window.OrganizationalDocumentAttach ? window.OrganizationalDocumentAttach.clip(i) : '') + '</td>' +
            '<td style="white-space:nowrap;">' + escapeHtml(String(i.date || '').slice(0, 10)) + '</td><td style="white-space:nowrap;">' + escapeHtml(String(i.due_date || '').slice(0, 10)) + '</td>' +
            dollarCell(i.balance_cents) + '<td style="text-align:right;">' + (i.days_past_due > 0 ? i.days_past_due : '') + '</td><td>' + escapeHtml(BUCKET_LABELS[i.bucket] || '') + '</td></tr>';
        }).join('') +
        '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="5">Total' + (filtered.length !== d.items.length ? ' (filtered)' : '') + '</td>' + dollarCell(filtered.reduce(function (n, i) { return n + Number(i.balance_cents); }, 0)) + '<td></td><td></td></tr></tbody></table></div>';
      var table = body.querySelector('table[data-schedule-table]');
      if (window.OrganizationalTableSort && table) {
        window.OrganizationalTableSort.attach(table, { columns: SCHEDULE_COLUMNS.concat([null]), state: state, onChange: function () { renderSchedule(name); } });
      }
      body.querySelectorAll('tr[data-txn-href]').forEach(function (tr) {
        tr.addEventListener('click', function (e) { if (!e.target.closest('a')) window.location.href = tr.getAttribute('data-txn-href'); });
      });
    }
    if (ledgerEl) {
      var accts = d.ledger.accounts.map(function (a) { return escapeHtml(a.code + ' ' + a.name) + ' ' + escapeHtml(money2(a.balance_cents)); }).join(' · ');
      var diff = Number(d.ledger.difference_cents);
      ledgerEl.innerHTML = '<strong>' + escapeHtml(cfg.ledgerLabel) + ': ' + escapeHtml(money2(d.ledger.balance_cents)) + '</strong> (' + accts + '). ' +
        (diff === 0 ? 'It matches this schedule.' : 'Difference from the schedule: ' + escapeHtml(money2(diff)) + '. See Ledger entries by account for the entries made directly.');
    }
  }

  async function loadAccountTransactions() {
    var body = document.getElementById('organizational-at-body');
    var meta = document.getElementById('organizational-at-meta');
    var csvLink = document.getElementById('organizational-at-csv');
    var title = document.getElementById('organizational-at-title');
    if (!body || !currentSlug) return;
    await loadGeneralLedgerAccounts();
    var from = document.getElementById('organizational-at-from');
    var to = document.getElementById('organizational-at-to');
    var acct = document.getElementById('organizational-at-account');
    if (acct && pendingFilters.atAccount) { acct.value = pendingFilters.atAccount; pendingFilters.atAccount = ''; }
    if (!acct || !acct.value) {
      atCache = null;
      if (title) title.textContent = 'Account Transactions';
      if (meta) meta.textContent = '';
      if (csvLink) csvLink.hidden = true;
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Choose an account to see its entries.</p>';
      syncUrl(false);
      return;
    }
    var params = ['account_id=' + encodeURIComponent(acct.value)];
    if (from && from.value) params.push('from=' + encodeURIComponent(from.value));
    if (to && to.value) params.push('to=' + encodeURIComponent(to.value));
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/general-ledger?' + params.join('&');
    if (csvLink) { csvLink.href = base + '&format=csv'; csvLink.hidden = false; }
    body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Loading…</p>';
    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Could not load the entries.</p>';
      return;
    }
    var d = out.data;
    if (from && !from.value) from.value = d.from;
    if (to && !to.value) to.value = d.to;
    syncUrl(false);
    atCache = d;
    renderAccountTransactions();
  }

  function renderAccountTransactions(focusCol) {
    var body = document.getElementById('organizational-at-body');
    var meta = document.getElementById('organizational-at-meta');
    var title = document.getElementById('organizational-at-title');
    if (!body || !atCache) return;
    var d = atCache;
    var a = d.accounts[0];
    if (!a) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">No posted entries in this period.</p>';
      if (meta) meta.textContent = '';
      return;
    }
    if (title) title.textContent = a.code + ' — ' + a.name + ' Transactions';
    var slugBase = '/organizational/o/' + encodeURIComponent(currentSlug);
    var shown = window.OrganizationalTableSort && atSortState.index >= 0 && atSortState.dir
      ? window.OrganizationalTableSort.sortArray(a.lines, AT_SORT_COLUMNS[atSortState.index], atSortState.dir)
      : a.lines;
    var rows = '';
    if (Number(a.opening_cents)) {
      rows += '<tr style="background:var(--surface-hover);font-weight:600;"><td colspan="9">Opening balance</td>' + dollarCell(a.opening_cents) + '</tr>';
    }
    rows += shown.map(function (l) {
      var href = slugBase + '/transactions?txn=' + encodeURIComponent(l.transaction_id);
      return '<tr data-txn-href="' + escapeHtml(href) + '" style="cursor:pointer;" title="Open this entry">' +
        '<td style="white-space:nowrap;"><a href="' + escapeHtml(href) + '" style="color:inherit;">' + escapeHtml(l.date) + '</a></td>' +
        '<td>' + escapeHtml(l.contact_name || l.payee || '') + '</td>' +
        '<td>' + escapeHtml(l.line_memo || l.memo || '') + '</td>' +
        '<td>' + escapeHtml(l.reference || '') + '</td>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(l.related_account || '') + '</td>' +
        '<td>' + escapeHtml(l.program || '') + '</td><td>' + escapeHtml(l.grant || '') + '</td>' +
        (Number(l.debit_cents) ? dollarCell(l.debit_cents) : '<td></td>') + (Number(l.credit_cents) ? dollarCell(l.credit_cents) : '<td></td>') +
        dollarCell(l.balance_cents) + '</tr>';
    }).join('');
    rows += '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="7">Total for the period</td>' +
      dollarCell(a.total_debit_cents) + dollarCell(a.total_credit_cents) + dollarCell(a.closing_cents) + '</tr>';
    body.innerHTML = '<div style="padding:12px 16px 4px;">' + escapeHtml(d.from) + ' to ' + escapeHtml(d.to) +
      ' <span class="organizational-hint">(' + escapeHtml(a.natural_side) + ' account; the last column is the running balance)</span></div>' +
      '<div class="organizational-table-wrap"><table class="organizational-table" data-at-table="1" aria-label="' + escapeHtml(a.name) + ' transactions"><thead><tr>' +
      '<th>Date</th><th>Contact</th><th>Description</th><th>Reference</th><th>Related account</th><th>Program</th><th>Grant</th>' +
      '<th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (meta) meta.textContent = d.line_count + ' line' + (d.line_count === 1 ? '' : 's') + (d.truncated ? ' · stopped at ' + d.line_cap + ' lines, narrow the dates' : '');
    if (window.OrganizationalTableSort) {
      var table = body.querySelector('table[data-at-table]');
      window.OrganizationalTableSort.attach(table, {
        columns: AT_SORT_COLUMNS,
        state: atSortState,
        onChange: function () { var ae = document.activeElement; renderAccountTransactions(ae && ae.tagName === 'TH' ? ae.cellIndex : -1); },
      });
      if (focusCol >= 0) { var th = table.tHead.rows[0].cells[focusCol]; if (th) th.focus(); }
    }
  }

  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('tr[data-txn-href]');
    if (!row || e.target.closest('a')) return;
    (window.top && window.top !== window ? window.top : window).location.href = row.getAttribute('data-txn-href');
  });

  async function loadCashFlows() {
    var tbody = document.getElementById('organizational-scf-tbody');
    var meta = document.getElementById('organizational-scf-meta');
    var csvLink = document.getElementById('organizational-scf-csv');
    if (!tbody || !currentSlug) return;

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="2">Loading…</td></tr>';
    if (meta) meta.textContent = '';

    var fy = fiscalYearForReports();
    var base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/cash-flows?fiscal_year=' + fy;
    if (csvLink) { csvLink.href = base + '&format=csv'; }

    var out = await apiJson(base, { method: 'GET' });
    if (!out || !out.res.ok) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="2">Could not load statement.</td></tr>';
      return;
    }
    if (out.data.not_available) {
      renderNotAvailable(tbody, 2);
      if (meta) meta.textContent = 'Not available';
      if (csvLink) csvLink.hidden = true;
      return;
    }

    var d = out.data;
    var html = '';

    function sectionHeader(label) {
      return '<tr style="background:var(--surface-active);"><td colspan="2" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">' + escapeHtml(label) + '</td></tr>';
    }
    function lineRow(label, cents, indent) {
      return '<tr><td style="' + (indent ? 'padding-left:28px;' : '') + '">' + escapeHtml(label) + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(cents) + '</td></tr>';
    }
    function subtotalRow(label, cents) {
      return '<tr style="font-weight:600;border-top:1px solid var(--border);"><td>' + escapeHtml(label) + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(cents) + '</td></tr>';
    }

    var op = d.operating || {};
    html += sectionHeader('Cash flows from operating activities');
    html += lineRow('Change in net assets', op.change_in_net_assets_cents || 0, false);
    (op.non_cash_adjustments || []).forEach(function(r) {
      html += lineRow('Add: ' + r.name + ' (non-cash)', r.amount_cents, true);
    });
    (op.operating_asset_changes || []).forEach(function(r) {
      html += lineRow((r.cash_impact_cents < 0 ? 'Increase' : 'Decrease') + ' in ' + r.name, r.cash_impact_cents, true);
    });
    (op.operating_liability_changes || []).forEach(function(r) {
      html += lineRow((r.cash_impact_cents >= 0 ? 'Increase' : 'Decrease') + ' in ' + r.name, r.cash_impact_cents, true);
    });
    html += subtotalRow('Net cash from operating activities', op.net_operating_cents || 0);

    var inv = d.investing || {};
    html += sectionHeader('Cash flows from investing activities');
    if ((inv.items || []).length) {
      (inv.items || []).forEach(function(r) { html += lineRow(r.name, r.cash_impact_cents, true); });
    } else {
      html += '<tr><td style="color:var(--text-secondary);padding-left:28px;">No investing activity</td><td style="text-align:right;">—</td></tr>';
    }
    html += subtotalRow('Net cash from investing activities', inv.net_investing_cents || 0);

    var fin = d.financing || {};
    html += sectionHeader('Cash flows from financing activities');
    if ((fin.items || []).length) {
      (fin.items || []).forEach(function(r) { html += lineRow(r.name, r.cash_impact_cents, true); });
    } else {
      html += '<tr><td style="color:var(--text-secondary);padding-left:28px;">No financing activity</td><td style="text-align:right;">—</td></tr>';
    }
    html += subtotalRow('Net cash from financing activities', fin.net_financing_cents || 0);

    html += '<tr style="font-weight:700;border-top:2px solid var(--border);"><td>Net change in cash and cash equivalents</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(d.net_change_in_cash_cents || 0) + '</td></tr>';
    html += lineRow('Cash and cash equivalents, beginning of year', d.beginning_cash_cents || 0, false);
    html += '<tr style="font-weight:700;"><td>Cash and cash equivalents, end of year</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(d.ending_cash_cents || 0) + '</td></tr>';

    tbody.innerHTML = html;
    if (meta) meta.textContent = 'FY' + fy + ' · Indirect method · Ledger-sourced';
  }

  // ── End GAAP Financial Statements ─────────────────────────────────────────

  // ── End financial views ────────────────────────────────────────────────

  window.showReport = showReport;
  window.showReportsIndex = showReportsIndex;
  window.loadPartIX = loadPartIX;
  window.loadBalanceSheet = loadBalanceSheet;
  window.loadReconciliation = loadReconciliation;
  window.lockCurrentFiscalYear = lockCurrentFiscalYear;
  window.reopenCurrentFiscalYear = reopenCurrentFiscalYear;
  window.loadGivingSummary = loadGivingSummary;
  window.refreshAuditLog = refreshAuditLog;
  window.loadAuditLogPage = function (offset) { loadAuditLog(offset); };
  window.budgetReportToggle = budgetReportToggle;
  window.exportBudgetReportCsv = exportBudgetReportCsv;
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;
  window.loadFinancialPosition = loadFinancialPosition;
  window.loadStatementOfActivities = loadStatementOfActivities;
  window.loadStmtFunctionalExpenses = loadStmtFunctionalExpenses;
  window.loadCashFlows = loadCashFlows;
  window.loadTrialBalance = loadTrialBalance;
  window.load1099Report = load1099Report;
  window.render1099Report = render1099Report;
  window.loadGeneralLedger = loadGeneralLedger;
  window.loadAccountTransactions = loadAccountTransactions;
  window.loadSchedule = loadSchedule;
  window.saveSchedule = saveSchedule;

  load().catch(function(e) {
    if (loadingEl) loadingEl.hidden = true;
    showError("Could not load reports.");
    console.error("Reports load error:", e);
  });
})();
