(function () {
  'use strict';

  const errEl             = document.getElementById('organizational-org-error');
  const loadingEl         = document.getElementById('organizational-org-loading');
  const grantsTbody       = document.getElementById('organizational-grants-tbody');
  const grantsFreshnessEl = document.getElementById('organizational-grants-freshness');
  const filterSearchEl    = document.getElementById('organizational-filter-search');
  const filterStatusEl    = document.getElementById('organizational-filter-status');
  const filterTypeEl      = document.getElementById('organizational-filter-type');
  const filterInstEl      = document.getElementById('organizational-filter-inst');
  const grantsTable       = document.querySelector('.organizational-grants-table');
  const addBtn            = document.getElementById('organizational-grant-add');
  const panel             = document.getElementById('organizational-grant-panel');
  const grantsList        = document.getElementById('organizational-grants-list');
  const panelTitle        = document.getElementById('organizational-grants-panel-title');
  const panelBody         = document.getElementById('organizational-grants-panel-body');
  const panelClose        = document.getElementById('organizational-grants-panel-close');
  const panelErrEl        = document.getElementById('organizational-grants-panel-error');

  let currentSlug          = '';
  let grantsCache          = [];
  let programsCache        = [];
  let revenueAccountsCache = [];
  let institutionFundersCache = [];
  let allAllocations       = [];
  let orgFyEndMonth  = 12;
  let panelGrant     = null;
  let panelActivity  = { gifts: [], interactions: [], failed: false };
  let interactionFormOpen = false;
  const grantsSort = { key: null, dir: null };
  let filterState    = { search: '', status: '', type: '', institution: '' };

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function showPanelError(msg) {
    if (!panelErrEl) return;
    panelErrEl.textContent = msg || '';
    panelErrEl.hidden = !msg;
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
    if (res.status === 401) { window.location.href = '/login.html'; return null; }
        const roleRefusal = data && (data.code === 'no_access' || /requires one of these roles/.test(String(data.error || '')));
        if (res.status === 403 && !roleRefusal && String(url || '').indexOf('/api/organizational/') !== -1) {
      window.location.href = '/app.html?coop=disabled'; return null;
    }
    return { res, data };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatUsdFromCents(cents) {
    if (cents == null || cents === '') return '—';
    const n = Number(cents);
    if (!Number.isFinite(n)) return '—';
    return window.formatMoneyCents(n);
  }

  function formatPeriod(start, end) {
    const a = start || '—';
    const b = end   || '—';
    if (a === '—' && b === '—') return '—';
    return escapeHtml(a) + ' → ' + escapeHtml(b);
  }

  function parseAmountInput(raw) {
    const t = String(raw || '').trim().replace(/,/g, '');
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return n;
  }

  function programLabel(programId) {
    if (programId == null || programId === '') return '—';
    const p = programsCache.find(function (x) { return Number(x.id) === Number(programId); });
    if (!p) return '—';
    return (p.code ? String(p.code) + ' — ' : '') + (p.name || '');
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return escapeHtml(String(iso).slice(0, 10));
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function centsToInput(cents) {
    if (cents == null) return '';
    const d = Number(cents) / 100;
    if (!Number.isFinite(d)) return '';
    return d % 1 === 0 ? String(Math.round(d)) : d.toFixed(2);
  }

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  function dateToFyYear(dateStr, fyEndMonth) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    return m > (fyEndMonth || 12) ? y + 1 : y;
  }

  function fyStartEnd(fyYear, fyEndMonth) {
    const em = fyEndMonth || 12;
    const startM = (em % 12) + 1;
    const startY = em === 12 ? fyYear : fyYear - 1;
    const daysInEnd = new Date(fyYear, em, 0).getDate();
    return {
      start: startY + '-' + String(startM).padStart(2, '0') + '-01',
      end:   fyYear + '-' + String(em).padStart(2, '0') + '-' + String(daysInEnd).padStart(2, '0'),
    };
  }

  function getAllFysForGrant(g, grantAllocs) {
    const em = orgFyEndMonth;
    const fyYears = new Set();
    if (g.start_date) {
      const fy0 = dateToFyYear(g.start_date, em);
      const fy1 = g.end_date ? dateToFyYear(g.end_date, em) : fy0;
      for (let fy = fy0; fy <= fy1; fy++) fyYears.add(fy);
    }
    grantAllocs.forEach(function (a) { if (a.fiscal_year) fyYears.add(Number(a.fiscal_year)); });
    return Array.from(fyYears).sort().map(function (fy) {
      const se = fyStartEnd(fy, em);
      return { fyYear: fy, label: 'FY' + fy, start: se.start, end: se.end };
    });
  }

  async function loadPrograms(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program');
    programsCache = (out && out.res.ok && Array.isArray(out.data.programs)) ? out.data.programs : [];
  }

  async function loadRevenueAccounts(slug) {
    // Was filtered to budget_source === 'grant_allocation' -- a narrow Budget-forecast tag that
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    const all = (out && out.res.ok && Array.isArray(out.data.accounts)) ? out.data.accounts : [];
    revenueAccountsCache = all.filter(function (a) {
      return a.type === 'income' && a.is_posting && !a.is_system_contribution_revenue_account;
    });
  }

  async function loadInstitutionFunders(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents?tab=institutions&active=all');
    institutionFundersCache = (out && out.res.ok && Array.isArray(out.data)) ? out.data : [];
  }

  function mkCell(grantId, field, html, extraClass) {
    var cls = 'organizational-grant-cell' + (extraClass ? ' ' + extraClass : '');
    return '<td class="' + cls + '" data-grant-id="' + grantId + '" data-field="' + field + '">' + html + '</td>';
  }

  function grantCellText(g, field) {
    switch (field) {
      case 'name':               return escapeHtml(g.name || '');
      case 'grant_code':         return escapeHtml(g.grant_code || '—');
      case 'funder':             return escapeHtml(g.funder || '—');
      case 'institution_type':   return escapeHtml(optionLabel(INSTITUTION_OPTIONS, g.institution_type) || '—');
      case 'forecast_amount':    return formatUsdFromCents(g.forecast_amount_cents);
      case 'amount':             return formatUsdFromCents(g.amount_cents);
      case 'request_amount':     return formatUsdFromCents(g.request_amount_cents);
      case 'primary_program_id': return escapeHtml(programLabel(g.primary_program_id));
      case 'grant_type':         return escapeHtml(optionLabel(GRANT_TYPE_OPTIONS, g.grant_type) || '—');
      case 'period':             return formatPeriod(g.start_date, g.end_date);
      case 'status':             return escapeHtml(g.status || '—');
      case 'next_report_due':    return formatDateShort(g.next_report_due);
      default:                   return escapeHtml(String(g[field] || '—'));
    }
  }

  function allocBtnLabel(g) {
    const award = g.amount_cents || 0;
    if (!award) return 'Allocate';
    const alloc = Number(g.allocated_cents) || 0;
    const pct = Math.round(alloc / award * 100);
    return pct + '% allocated';
  }

  function applyFiltersAndSort() {
    var list = grantsCache.slice();
    var search = filterState.search.toLowerCase();
    if (search) {
      list = list.filter(function (g) {
        return (g.funder || '').toLowerCase().indexOf(search) !== -1 ||
               (g.name || '').toLowerCase().indexOf(search) !== -1 ||
               (g.grant_code || '').toLowerCase().indexOf(search) !== -1;
      });
    }
    if (filterState.status)      list = list.filter(function (g) { return g.status === filterState.status; });
    if (filterState.type)        list = list.filter(function (g) { return g.grant_type === filterState.type; });
    if (filterState.institution) list = list.filter(function (g) { return instKey(g.institution_type) === filterState.institution; });
    list = window.OrganizationalTableSort
      ? window.OrganizationalTableSort.sortArray(list, { type: 'text', get: function (g) { return g.institution_type; } }, 'asc')
      : list;
    var sortCol = grantsSort.key && grantColumns().find(function (c) { return c.key === grantsSort.key; });
    if (sortCol && sortCol.sort && window.OrganizationalTableSort) {
      return window.OrganizationalTableSort.sortArray(list, sortCol.sort, grantsSort.dir);
    }
    return list;
  }

  var INSTITUTION_OPTIONS = [
    { value: 'foundation',           label: 'Foundation' },
    { value: 'community_foundation', label: 'Community foundation' },
    { value: 'government',           label: 'Government' },
    { value: 'corporate',            label: 'Corporate' },
    { value: 'individual',           label: 'Individual' },
  ];
  var GRANT_TYPE_OPTIONS = [
    { value: 'unrestricted',            label: 'Unrestricted' },
    { value: 'restricted',              label: 'Restricted' },
    { value: 'temporarily_restricted',  label: 'Temporarily restricted' },
  ];
  function instKey(v) {
    var t = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (t === 'private_foundation') return 'foundation';
    if (t === 'corporation') return 'corporate';
    return t;
  }
  function optionLabel(opts, v) {
    var k = instKey(v);
    var o = opts.find(function (x) { return x.value === k; });
    return o ? o.label : (v || '');
  }

  function updateInstitutionFilter() {
    if (!filterInstEl) return;
    var known = new Set(INSTITUTION_OPTIONS.map(function (o) { return o.value; }));
    var extra = Array.from(new Set(grantsCache.map(function (g) { return instKey(g.institution_type); }).filter(function (k) { return k && !known.has(k); })));
    var cur = filterInstEl.value;
    filterInstEl.innerHTML = '<option value="">All institution types</option>';
    INSTITUTION_OPTIONS.concat(extra.map(function (k) { return { value: k, label: k }; })).forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.value; o.textContent = t.label;
      if (cur === t.value) o.selected = true;
      filterInstEl.appendChild(o);
    });
  }

  function renderGrants(list) {
    grantsCache = Array.isArray(list) ? list : [];
    updateInstitutionFilter();
    renderFilteredGrants();
  }

  function grantColumns() {
    return [
      { key: 'funder', label: 'Funder', sort: { type: 'text', get: function (g) { return g.funder; } },
        cell: function (g, id) { return mkCell(id, 'funder', escapeHtml(g.funder || '—')); } },
      { key: 'institution_type', label: 'Institution', secondary: true, sort: { type: 'text', get: function (g) { return g.institution_type; } },
        cell: function (g, id, x) { return mkCell(id, 'institution_type', escapeHtml(optionLabel(INSTITUTION_OPTIONS, g.institution_type) || '—'), x); } },
      { key: 'name', label: 'Grant', sort: { type: 'text', get: function (g) { return g.name; } },
        cell: function (g, id) {
          var n = Number(g.document_count) || 0;
          return mkCell(id, 'name', escapeHtml(g.name) + (n > 0 ? '<span class="organizational-badge" style="margin-left:6px;">' + n + '</span>' : ''));
        } },
      { key: 'amount', label: 'Award', sort: { type: 'number', get: function (g) { return g.amount_cents || 0; } },
        cell: function (g, id) { return mkCell(id, 'amount', formatUsdFromCents(g.amount_cents)); } },
      { key: 'request_amount', label: 'Requested', secondary: true, sort: { type: 'number', get: function (g) { return g.request_amount_cents || 0; } },
        cell: function (g, id, x) { return mkCell(id, 'request_amount', formatUsdFromCents(g.request_amount_cents), x); } },
      { key: 'forecast_amount', label: 'Forecast', secondary: true, sort: { type: 'number', get: function (g) { return g.forecast_amount_cents || 0; } },
        cell: function (g, id, x) { return mkCell(id, 'forecast_amount', formatUsdFromCents(g.forecast_amount_cents), x); } },
      { key: 'primary_program_id', label: 'Program', secondary: true, sort: { type: 'text', get: function (g) { return programLabel(g.primary_program_id); } },
        cell: function (g, id, x) { return mkCell(id, 'primary_program_id', escapeHtml(programLabel(g.primary_program_id)), x); } },
      { key: 'grant_type', label: 'Type', secondary: true, sort: { type: 'text', get: function (g) { return g.grant_type; } },
        cell: function (g, id, x) { return mkCell(id, 'grant_type', escapeHtml(optionLabel(GRANT_TYPE_OPTIONS, g.grant_type) || '—'), x); } },
      { key: 'period', label: 'Period', secondary: true, sort: { type: 'date', get: function (g) { return g.start_date; } },
        cell: function (g, id, x) { return mkCell(id, 'period', formatPeriod(g.start_date, g.end_date), x); } },
      { key: 'status', label: 'Status', sort: { type: 'text', get: function (g) { return g.status; } },
        cell: function (g, id) { return mkCell(id, 'status', escapeHtml(g.status || '—')); } },
      { key: 'next_report_due', label: 'Next report', sort: { type: 'date', get: function (g) { return g.next_report_due; } },
        cell: function (g, id) { return mkCell(id, 'next_report_due', formatDateShort(g.next_report_due)); } },
      { key: 'report', label: 'Report', secondary: true, sort: null,
        cell: function (g, id, x) {
          var href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/grants/' + encodeURIComponent(String(id)) +
            '?fiscal_year=' + encodeURIComponent(String(new Date().getFullYear()));
          return '<td class="' + x + '"><a class="organizational-nav-link" href="' + href.replace(/"/g, '&quot;') + '" download style="font-weight:600;">PDF</a></td>';
        } },
    ];
  }

  function columnLayoutKey() { return 'organizational-grants-columns:' + currentSlug; }

  function readColumnLayout() {
    var all = grantColumns().map(function (c) { return c.key; });
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(columnLayoutKey()) || 'null'); } catch (_) { saved = null; }
    var order = saved && Array.isArray(saved.order) ? saved.order.filter(function (k) { return all.indexOf(k) !== -1; }) : [];
    all.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
    var hidden = saved && Array.isArray(saved.hidden) ? saved.hidden.filter(function (k) { return all.indexOf(k) !== -1; }) : [];
    return { order: order, hidden: hidden };
  }

  function writeColumnLayout(layout) {
    try { localStorage.setItem(columnLayoutKey(), JSON.stringify(layout)); } catch (_) { /* layout is a per-browser convenience */ }
  }

  function visibleColumns() {
    var layout = readColumnLayout();
    var byKey = {};
    grantColumns().forEach(function (c) { byKey[c.key] = c; });
    return layout.order.filter(function (k) { return layout.hidden.indexOf(k) === -1; }).map(function (k) { return byKey[k]; });
  }

  function renderGrantsHead() {
    var headRow = grantsTable && grantsTable.tHead && grantsTable.tHead.rows[0];
    if (!headRow) return;
    headRow.innerHTML = visibleColumns().map(function (c) {
      var cls = (c.secondary ? 'organizational-grants-col-secondary ' : '') + (c.sort ? 'organizational-th-sortable' : '');
      var aria = grantsSort.key === c.key ? (grantsSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return '<th class="' + cls + '" data-col="' + c.key + '"' + (c.sort ? ' tabindex="0" aria-sort="' + aria + '"' : '') + '>' + escapeHtml(c.label) + '</th>';
    }).join('');
  }

  function activateGrantSort(key) {
    if (grantsSort.key !== key) { grantsSort.key = key; grantsSort.dir = 'asc'; }
    else if (grantsSort.dir === 'asc') grantsSort.dir = 'desc';
    else { grantsSort.key = null; grantsSort.dir = null; }
    renderFilteredGrants();
  }

  if (grantsTable && grantsTable.tHead) {
    grantsTable.tHead.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-col]');
      if (th && th.classList.contains('organizational-th-sortable')) activateGrantSort(th.getAttribute('data-col'));
    });
    grantsTable.tHead.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var th = e.target.closest('th[data-col]');
      if (th && th.classList.contains('organizational-th-sortable')) { e.preventDefault(); activateGrantSort(th.getAttribute('data-col')); }
    });
  }

  function renderColumnMenu() {
    var menu = document.getElementById('organizational-grants-columns-menu');
    if (!menu) return;
    var layout = readColumnLayout();
    var byKey = {};
    grantColumns().forEach(function (c) { byKey[c.key] = c; });
    menu.innerHTML = layout.order.map(function (k, i) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">' +
        '<label style="flex:1;font-size:0.8125rem;display:flex;gap:6px;align-items:center;"><input type="checkbox" data-col-toggle="' + k + '"' +
        (layout.hidden.indexOf(k) === -1 ? ' checked' : '') + '> ' + escapeHtml(byKey[k].label) + '</label>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" data-col-move="' + k + '" data-dir="-1" aria-label="Move ' + escapeHtml(byKey[k].label) + ' left"' + (i === 0 ? ' disabled' : '') + ' style="padding:0 6px;font-size:0.75rem;">&uarr;</button>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" data-col-move="' + k + '" data-dir="1" aria-label="Move ' + escapeHtml(byKey[k].label) + ' right"' + (i === layout.order.length - 1 ? ' disabled' : '') + ' style="padding:0 6px;font-size:0.75rem;">&darr;</button>' +
        '</div>';
    }).join('') +
      '<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;"><button type="button" class="organizational-btn organizational-btn-outline" data-col-reset style="font-size:0.8125rem;">Reset columns</button></div>';
  }

  (function wireColumnMenu() {
    var btn = document.getElementById('organizational-grants-columns-btn');
    var menu = document.getElementById('organizational-grants-columns-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      if (!menu.hidden) renderColumnMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      var layout = readColumnLayout();
      var t = e.target.closest('[data-col-toggle],[data-col-move],[data-col-reset]');
      if (!t) return;
      if (t.hasAttribute('data-col-reset')) {
        try { localStorage.removeItem(columnLayoutKey()); } catch (_) { /* nothing stored */ }
      } else if (t.hasAttribute('data-col-toggle')) {
        var k = t.getAttribute('data-col-toggle');
        var at = layout.hidden.indexOf(k);
        if (at === -1) {
          if (layout.order.length - layout.hidden.length <= 1) { t.checked = true; return; }
          layout.hidden.push(k);
        } else layout.hidden.splice(at, 1);
        writeColumnLayout(layout);
      } else {
        var key = t.getAttribute('data-col-move');
        var from = layout.order.indexOf(key);
        var to = from + Number(t.getAttribute('data-dir'));
        if (from < 0 || to < 0 || to >= layout.order.length) return;
        layout.order.splice(to, 0, layout.order.splice(from, 1)[0]);
        writeColumnLayout(layout);
      }
      renderColumnMenu();
      renderFilteredGrants();
    });
  })();

  function renderFilteredGrants() {
    if (!grantsTbody) return;
    renderGrantsHead();
    var cols = visibleColumns();
    var view = applyFiltersAndSort();
    if (view.length === 0) {
      var msg = grantsCache.length === 0
        ? 'No grants yet. Add a grant or sync from your accounting tool when available.'
        : 'No grants match the current filters.';
      grantsTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + cols.length + '">' + msg + '</td></tr>';
      return;
    }
    grantsTbody.innerHTML = view.map(function (g) {
      var id = Number(g.id);
      return '<tr class="organizational-grants-row" data-grant-id="' + id + '" style="cursor:pointer;">' +
        cols.map(function (c) { return c.cell(g, id, c.secondary ? 'organizational-grants-col-secondary' : ''); }).join('') + '</tr>';
    }).join('');
  }

  if (grantsTbody) {
    grantsTbody.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      const row = e.target.closest('.organizational-grants-row');
      if (!row) return;
      const grantId = Number(row.getAttribute('data-grant-id'));
      const g = grantsCache.find(function (x) { return Number(x.id) === grantId; });
      if (g) openPanel(g);
    });
  }

  function openPanel(grant) {
    panelGrant = grant;
    showPanelError('');
    if (panelTitle) panelTitle.textContent = grant ? (grant.name || 'Grant') : 'New grant';
    if (panelBody) {
      if (grant) {
        panelBody.innerHTML = '<p class="organizational-panel-loading">Loading…</p>';
        interactionFormOpen = false;
        Promise.all([loadAllocationsForPanel(grant), loadActivityForPanel(grant)]).then(function () {
          if (panelGrant === grant) renderPanelEdit(grant);
        });
      } else {
        renderPanelNew();
      }
    }
    if (panel)        { panel.hidden = false; panel.classList.add('organizational-panel-is-open'); }
    if (grantsList)   grantsList.hidden = true;
    window.scrollTo(0, 0);
  }

  function closePanel() {
    if (panel)        { panel.hidden = true; panel.classList.remove('organizational-panel-is-open'); }
    if (grantsList)   grantsList.hidden = false;
    panelGrant     = null;
    allAllocations = [];
    showPanelError('');
  }

  async function loadActivityForPanel(grant) {
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grant.id + '/activity'
    );
    panelActivity = (out && out.res.ok)
      ? { gifts: out.data.gifts || [], interactions: out.data.interactions || [], failed: false }
      : { gifts: [], interactions: [], failed: true };
  }

  async function loadAllocationsForPanel(grant) {
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grant.id + '/allocations'
    );
    allAllocations = (out && out.res.ok && Array.isArray(out.data.allocations))
      ? out.data.allocations.map(function (a) { return Object.assign({}, a, { grant_id: Number(grant.id) }); })
      : [];
  }

  function renderPanelNew() {
    panelBody.innerHTML =
      '<div class="organizational-panel-edit">' +
        '<div class="organizational-panel-section-head">Scan a grant agreement <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">optional</span></div>' +
        '<div class="organizational-panel-fields">' +
          '<div class="organizational-panel-field-row organizational-panel-field-full">' +
            '<input type="file" id="cpf-ocr-file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf">' +
            '<p class="organizational-hint" style="margin-top:6px;">Upload the award letter or grant agreement to prefill the fields below — always review before creating.</p>' +
            '<div id="cpf-ocr-status" style="margin-top:6px;font-size:0.8125rem;color:var(--text-secondary);"></div>' +
          '</div>' +
        '</div>' +
        '<div class="organizational-panel-section-head" style="margin-top:16px;">Grant details</div>' +
        '<div class="organizational-panel-fields">' +
          pfRow('name',            'Grant name *',  'text', '') +
          pfGrantCodeRow({}) +
          pfRow('funder_grant_id', 'Funder ref #',  'text', '') +
          pfFunderRow({}) +
          pfRow('funder',          'Funder (text)', 'text', '') +
          pfListRow('institution_type', 'Institution type', INSTITUTION_OPTIONS, '', instKey) +
          pfSelectRow('status', 'Status', [
            { value: 'prospect', label: 'Prospect' },
            { value: 'applied',  label: 'Applied' },
            { value: 'awarded',  label: 'Awarded' },
            { value: 'declined', label: 'Declined' },
            { value: 'closed',   label: 'Closed' },
          ], 'prospect') +
          pfRow('amount',           'Award amount',              'text', '') +
          pfRow('request_amount',   'Requested',                'text', '') +
          pfRow('forecast_amount',  'Forecast (budget basis)',  'text', '') +
          pfListRow('grant_type', 'Grant type', GRANT_TYPE_OPTIONS, '') +
          pfProgRow({}) +
        '</div>' +
        '<div class="organizational-panel-section-head" style="margin-top:16px;">Lifecycle dates</div>' +
        '<div class="organizational-panel-fields">' +
          pfRow('loi_submitted_at',         'LOI submitted',    'date', '') +
          pfRow('application_submitted_at', 'App. submitted',   'date', '') +
          pfRow('award_date',               'Award date',       'date', '') +
          pfRow('period_start_date',        'Period start',     'date', '') +
          pfRow('period_end_date',          'Period end',       'date', '') +
          pfRow('start_date',               'Grant start',      'date', '') +
          pfRow('end_date',                 'Grant end',        'date', '') +
          pfRow('next_report_due',          'Next report due',  'date', '') +
          pfRow('final_report_submitted',   'Final submitted',  'date', '') +
          pfRow('renewal_application_due',  'Renewal due',      'date', '') +
        '</div>' +
        '<div class="organizational-panel-section-head" style="margin-top:16px;">Federal award (2 CFR 200)</div>' +
        '<div class="organizational-panel-fields">' +
          pfCheckboxRow('is_federal_award', 'This is a federal award (or passed through from one)', false) +
          pfRow('federal_awarding_agency', 'Federal awarding agency', 'text', '') +
          pfRow('aln',                     'ALN (Assistance Listing #)', 'text', '') +
          pfRow('pass_through_entity_name', 'Received via pass-through entity (if not direct from the federal agency)', 'text', '') +
          pfRow('pass_through_identifying_number', 'Pass-through entity’s identifying number', 'text', '') +
          pfRow('amount_passed_to_subrecipients_cents', 'Amount passed to this org’s own subrecipients', 'text', '') +
        '</div>' +
        '<div class="organizational-panel-field-row organizational-panel-field-full" style="margin-top:8px;">' +
          '<label class="organizational-label">Restrictions</label>' +
          '<textarea class="organizational-textarea" data-field="restrictions" rows="2" maxlength="8000"></textarea>' +
        '</div>' +
        '<div class="organizational-panel-field-row organizational-panel-field-full" style="margin-top:8px;">' +
          '<label class="organizational-label">Notes</label>' +
          '<textarea class="organizational-textarea" data-field="notes" rows="3" maxlength="4000"></textarea>' +
        '</div>' +
        '<div class="organizational-panel-actions" style="margin:20px 0 0;padding:14px 0;bottom:0;background:none;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="cpf-cancel">Cancel</button>' +
          '<button type="button" class="organizational-btn" id="cpf-create">Create grant</button>' +
        '</div>' +
      '</div>';

    document.getElementById('cpf-cancel').addEventListener('click', closePanel);
    const nameField = panelBody.querySelector('[data-field="name"]');
    if (nameField) nameField.focus();

    const ocrFileInput = document.getElementById('cpf-ocr-file');
    const ocrStatus = document.getElementById('cpf-ocr-status');
    const OCR_FIELD_MAP = {
      funder: 'funder', institution_type: 'institution_type', funder_grant_id: 'funder_grant_id',
      grant_type: 'grant_type', start_date: 'start_date', end_date: 'end_date',
      next_report_due: 'next_report_due', restrictions: 'restrictions',
      federal_awarding_agency: 'federal_awarding_agency', aln: 'aln',
      pass_through_entity_name: 'pass_through_entity_name',
    };
    if (ocrFileInput) {
      ocrFileInput.addEventListener('change', async function () {
        const file = ocrFileInput.files[0];
        if (!file) return;
        ocrStatus.textContent = 'Scanning…';
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/ocr-preview', {
            method: 'POST', credentials: 'include', body: fd,
          });
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.extracted) {
            ocrStatus.textContent = data.error || 'Could not read this document.';
            return;
          }
          const ex = data.extracted;
          Object.keys(OCR_FIELD_MAP).forEach(function (exKey) {
            const field = OCR_FIELD_MAP[exKey];
            if (ex[exKey] == null) return;
            const el = panelBody.querySelector('[data-field="' + field + '"]');
            if (el && !el.value) {
              if (el.tagName === 'SELECT') {
                var want = exKey === 'institution_type' ? instKey(ex[exKey]) : String(ex[exKey]).trim().toLowerCase().replace(/[\s-]+/g, '_');
                if (!Array.from(el.options).some(function (o) { return o.value === want; })) el.add(new Option(String(ex[exKey]), want));
                el.value = want;
              } else {
                el.value = ex[exKey];
              }
            }
          });
          const nameEl = panelBody.querySelector('[data-field="name"]');
          if (nameEl && !nameEl.value && ex.grant_name) nameEl.value = ex.grant_name;
          const amountEl = panelBody.querySelector('[data-field="amount"]');
          if (amountEl && !amountEl.value && ex.amount_cents != null) amountEl.value = centsToInput(ex.amount_cents);
          const fedEl = panelBody.querySelector('[data-field="is_federal_award"]');
          if (fedEl && ex.is_federal_award === true) fedEl.checked = true;

          let matchedFunderId = null;
          if (ex.funder) {
            const needle = String(ex.funder).trim().toLowerCase();
            const matches = institutionFundersCache.filter(function (c) {
              const hay = String(c.display_name || '').trim().toLowerCase();
              return hay === needle || hay.includes(needle) || needle.includes(hay);
            });
            const funderEl = panelBody.querySelector('[data-field="constituent_id"]');
            if (matches.length === 1) {
              matchedFunderId = matches[0].id;
              if (funderEl) funderEl.value = String(matchedFunderId);
              ocrStatus.textContent = 'Prefilled from document, linked to funder "' + matches[0].display_name + '" — review everything below before creating.';
            } else {
              ocrStatus.textContent = 'Prefilled from document — read funder as "' + ex.funder + '", but ' +
                (matches.length === 0 ? 'no matching funder found' : 'more than one funder matched') +
                '; please link one below.';
            }
          } else {
            ocrStatus.textContent = 'Prefilled from document — review everything below before creating.';
          }

          if (matchedFunderId != null) {
            const progEl = panelBody.querySelector('[data-field="primary_program_id"]');
            if (progEl && !progEl.value) {
              const priorGrants = grantsCache
                .filter(function (g) { return Number(g.constituent_id) === Number(matchedFunderId) && g.primary_program_id != null; })
                .sort(function (a, b) {
                  const da = a.award_date || a.start_date || '';
                  const db = b.award_date || b.start_date || '';
                  return db.localeCompare(da);
                });
              if (priorGrants.length) progEl.value = String(priorGrants[0].primary_program_id);
            }
          }
        } catch (err) {
          ocrStatus.textContent = 'Could not scan this document right now.';
        }
      });
    }

    document.getElementById('cpf-create').addEventListener('click', async function () {
      const nameEl = panelBody.querySelector('[data-field="name"]');
      const name = nameEl ? nameEl.value.trim() : '';
      if (!name) { showPanelError('Grant name is required.'); if (nameEl) nameEl.focus(); return; }
      showPanelError('');

      const body = {};
      panelBody.querySelectorAll('[data-field]').forEach(function (el) {
        const field = el.getAttribute('data-field');
        if (!field) return;
        body[field] = el.type === 'checkbox' ? el.checked : el.value;
      });

      const btn = document.getElementById('cpf-create');
      btn.disabled = true;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants', {
        method: 'POST', body: JSON.stringify(body),
      });
      btn.disabled = false;
      if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not create grant.'); return; }
      showPanelError('');
      await loadGrants(currentSlug);
      const created = out.data && out.data.grant;
      if (created) {
        openPanel(created);
      } else {
        closePanel();
      }
    });
  }

  function pfRow(field, label, type, value) {
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">' + escapeHtml(label) + '</label>' +
      '<input class="organizational-input organizational-panel-autosave" type="' + type + '" data-field="' + field + '" value="' + escapeHtml(value || '') + '">' +
      '</div>';
  }

  function pfCheckboxRow(field, label, checked) {
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
      '<input class="organizational-panel-autosave" type="checkbox" data-field="' + field + '"' + (checked ? ' checked' : '') + '> ' + escapeHtml(label) +
      '</label></div>';
  }

  function pfSelectRow(field, label, opts, currentVal) {
    let options = '';
    opts.forEach(function (o) {
      const sel = String(currentVal || '') === String(o.value) ? ' selected' : '';
      options += '<option value="' + escapeHtml(String(o.value)) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
    });
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">' + escapeHtml(label) + '</label>' +
      '<select class="organizational-input organizational-panel-autosave" data-field="' + field + '">' + options + '</select>' +
      '</div>';
  }

  function pfListRow(field, label, opts, currentVal, normalize) {
    var cur = normalize ? normalize(currentVal) : String(currentVal || '');
    var list = opts.slice();
    if (cur && !list.some(function (o) { return o.value === cur; })) list.push({ value: String(currentVal), label: String(currentVal) });
    var html = '<option value="">—</option>' + list.map(function (o) {
      var v = (o.value === cur || o.value === String(currentVal)) ? ' selected' : '';
      return '<option value="' + escapeHtml(o.value) + '"' + v + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">' + escapeHtml(label) + '</label>' +
      '<select class="organizational-input organizational-panel-autosave" data-field="' + field + '">' + html + '</select>' +
      '</div>';
  }

  function pfProgRow(g) {
    let opts = '<option value="">— None —</option>';
    programsCache.forEach(function (p) {
      const sel = Number(g.primary_program_id) === Number(p.id) ? ' selected' : '';
      opts += '<option value="' + p.id + '"' + sel + '>' + escapeHtml((p.code ? p.code + ' — ' : '') + p.name) + '</option>';
    });
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">Primary program</label>' +
      '<select class="organizational-input organizational-panel-autosave" data-field="primary_program_id">' + opts + '</select>' +
      '</div>';
  }

  function pfRevAccRow(g) {
    const acct = revenueAccountsCache.find(function (a) { return Number(a.id) === Number(g.revenue_account_id); });
    const display = acct ? escapeHtml((acct.code ? acct.code + ' — ' : '') + acct.name) : 'Not yet set — will be set in Accounting the first time this grant\'s payment is coded';
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">Default revenue account</label>' +
      '<p style="margin:0;font-size:0.875rem;">' + display + '</p>' +
      '<p class="organizational-hint" style="margin:4px 0 0;">Set from Accounting (Banking or Gift Postings), not here — it\'s the GL account this grant\'s payments post to.</p>' +
      '</div>';
  }

  // Read-only: grant_code is auto-assigned server-side (G-### sequence) whenever a grant is
  function pfGrantCodeRow(g) {
    const code = g && g.grant_code;
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">Internal code</label>' +
      '<p style="margin:0;font-size:0.875rem;">' + (code ? escapeHtml(code) : 'Assigned automatically when the grant is created') + '</p>' +
      '</div>';
  }

  function pfFunderRow(g) {
    let opts = '<option value="">— Not linked —</option>';
    institutionFundersCache.forEach(function (c) {
      const sel = Number(g.constituent_id) === Number(c.id) ? ' selected' : '';
      opts += '<option value="' + c.id + '"' + sel + '>' + escapeHtml(c.display_name) + '</option>';
    });
    return '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label">Linked funder</label>' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
      '<select class="organizational-input organizational-panel-autosave" data-field="constituent_id" style="flex:1;">' + opts + '</select>' +
      (g && g.id ? '<button type="button" class="organizational-btn organizational-btn-outline organizational-grant-quicklink-funder" data-grant-id="' + g.id + '" style="font-size:0.75rem;padding:4px 8px;white-space:nowrap;">+ New funder contact</button>' : '') +
      '</div>' +
      '<p class="organizational-hint" style="margin:4px 0 0;">Links this grant to a contact so a payment from them can be matched to it in Banking. Only organizations with the donor role are listed; use “+ New funder contact” if there is none yet.</p>' +
      '</div>';
  }

  function renderFyCoverageIndicator(g, fys) {
    if (!g.period_start_date || !g.period_end_date) return '';
    const em = orgFyEndMonth;
    const fy0 = dateToFyYear(g.period_start_date, em);
    const fy1 = dateToFyYear(g.period_end_date, em);
    if (!fy0 || !fy1 || fy1 < fy0) return '';
    const allocatedFys = new Set(fys.map(function (f) { return f.fyYear; }));
    const parts = [];
    for (let fy = fy0; fy <= fy1; fy++) {
      parts.push(allocatedFys.has(fy) ? ('FY' + fy + ' ✓') : ('<span style="color:var(--text-secondary)">FY' + fy + ' —</span>'));
    }
    return '<div style="font-size:0.8125rem;padding:6px 0;color:var(--text-primary);">Coverage: ' + parts.join(' · ') + '</div>';
  }

  async function loadGrantDocuments(grantId) {
    const el = document.getElementById('organizational-grant-documents');
    if (!el || !currentSlug) return;
    try {
      const out = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents?grant_id=' + encodeURIComponent(grantId)
      );
      const docs = (out && out.res.ok && Array.isArray(out.data.documents)) ? out.data.documents : [];
      el.innerHTML = docs.length
        ? '<ul style="margin:0;padding-left:20px;">' + docs.map(function (d) {
            return '<li><a href="/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents/' + d.id + '/download">' + escapeHtml(d.title) + '</a></li>';
          }).join('') + '</ul>'
        : '<p class="organizational-empty">No documents attached yet.</p>';
    } catch (e) {
      console.error('loadGrantDocuments:', e);
      el.innerHTML = '<p class="organizational-empty">Could not load documents.</p>';
    }
  }

  function wireGrantAttachForm(grantId) {
    const form = document.getElementById('organizational-grant-attach-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const categorySelect = document.getElementById('organizational-grant-attach-category');
      const fileInput = document.getElementById('organizational-grant-attach-file');
      if (!fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('category', categorySelect.value);
      fd.append('grant_id', grantId);
      fd.append('title', fileInput.files[0].name);
      fd.append('file', fileInput.files[0]);
      try {
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(function () { return {}; });
          throw new Error(data.error || 'Could not attach document');
        }
        form.reset();
        await loadGrantDocuments(grantId);
      } catch (err) {
        alert(err.message || 'Could not attach document');
      }
    });
  }

  const MILESTONES = [
    ['loi_submitted_at', 'Letter of intent submitted'], ['application_submitted_at', 'Application submitted'],
    ['award_date', 'Award date'], ['start_date', 'Grant starts'], ['end_date', 'Grant ends'],
    ['next_report_due', 'Report due'], ['final_report_submitted', 'Final report submitted'], ['renewal_application_due', 'Renewal application due'],
  ];
  const INTERACTION_LABELS = { meeting: 'Meeting', call: 'Call', email: 'Email', note: 'Note', site_visit: 'Site visit' };
  const GIFT_LABELS = { grant: 'Grant payment', donation: 'Gift', pledge: 'Pledge', in_kind: 'In-kind' };

  function renderGrantHeader(g) {
    const sub = panelBody.querySelector('#grant-subline');
    if (sub) {
      const linked = g.constituent_id ? institutionFundersCache.find(function (c) { return Number(c.id) === Number(g.constituent_id); }) : null;
      const bits = [linked ? linked.display_name : g.funder, optionLabel(INSTITUTION_OPTIONS, g.institution_type), optionLabel(GRANT_TYPE_OPTIONS, g.grant_type), g.grant_code].filter(Boolean).map(escapeHtml);
      const donorsBtn = document.querySelector('#organizational-funders-workspace-tabs [data-section="donors"]');
      if (linked && bits.length && donorsBtn && !donorsBtn.hidden) {
        bits[0] = '<a href="#" class="organizational-link" data-open-funder="' + linked.id + '">' + bits[0] + '</a>';
      }
      sub.innerHTML = bits.length ? bits.join(' · ') : 'No funder yet';
      const fl = sub.querySelector('[data-open-funder]');
      if (fl) fl.addEventListener('click', function (e) {
        e.preventDefault();
        window.OrganizationalFunders.switchTab('donors');
        window.OrganizationalFunders.donors.open(Number(fl.getAttribute('data-open-funder')));
      });
    }
    const el = panelBody.querySelector('#grant-summary');
    if (!el) return;
    const received = panelActivity.gifts
      .filter(function (x) { return x.posting_status !== 'void' && x.review_status !== 'dismissed' && x.gift_type !== 'pledge'; })
      .reduce(function (n, x) { return n + Number(x.amount_cents || 0); }, 0);
    const tile = function (label, value) {
      return '<div style="flex:1 1 150px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;background:var(--surface-1,#fff);">' +
        '<div style="font-size:var(--text-xs);color:var(--text-secondary);">' + label + '</div>' +
        '<div style="font-size:1.125rem;font-weight:600;">' + value + '</div></div>';
    };
    const status = g.status ? g.status.charAt(0).toUpperCase() + g.status.slice(1) : '—';
    el.innerHTML = tile('Status', escapeHtml(status))
      + tile('Award', g.amount_cents ? formatUsdFromCents(g.amount_cents) : '—')
      + tile('Received', panelActivity.failed ? '—' : (received ? formatUsdFromCents(received) : '—'))
      + tile('Allocated', g.amount_cents ? allocBtnLabel(g).replace(' allocated', '') : '—')
      + tile('Next report due', g.next_report_due ? formatDateShort(g.next_report_due) : '—');
  }

  function renderGrantTimeline(g) {
    const root = panelBody && panelBody.querySelector('#grant-timeline');
    if (!root) return;
    const items = [];
    panelActivity.gifts.forEach(function (x) {
      if (x.review_status === 'dismissed') return;
      const voided = x.posting_status === 'void';
      const amt = x.gift_type === 'pledge' && x.total_pledged_cents != null ? x.total_pledged_cents : x.amount_cents;
      items.push({ when: String(x.received_at || '').slice(0, 10), html:
        '<span class="organizational-badge">' + escapeHtml(GIFT_LABELS[x.gift_type] || x.gift_type) + '</span>' +
        '<strong' + (voided ? ' style="text-decoration:line-through;"' : '') + '>' + formatUsdFromCents(amt) + '</strong>' +
        (voided ? '<span style="font-size:var(--text-xs);color:var(--text-secondary);">Voided</span>' : '') +
        (x.constituent_name ? '<span style="font-size:var(--text-xs);color:var(--text-secondary);">from ' + escapeHtml(x.constituent_name) + '</span>' : '') });
    });
    panelActivity.interactions.forEach(function (x) {
      items.push({ when: String(x.interaction_date || '').slice(0, 10), interactionId: x.id, html:
        '<div style="flex:1;"><div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;">' +
        '<span class="organizational-badge">' + escapeHtml(INTERACTION_LABELS[x.interaction_type] || x.interaction_type) + '</span>' +
        (x.constituent_name ? '<span style="font-size:var(--text-xs);color:var(--text-secondary);">with ' + escapeHtml(x.constituent_name) + '</span>' : '') + '</div>' +
        '<div style="font-size:var(--text-sm);white-space:pre-wrap;">' + escapeHtml(x.description) + '</div></div>' });
    });
    MILESTONES.forEach(function (m) {
      if (!g[m[0]]) return;
      items.push({ when: String(g[m[0]]).slice(0, 10), muted: true, html: '<span style="font-size:var(--text-sm);color:var(--text-secondary);">' + escapeHtml(m[1]) + '</span>' });
    });
    items.sort(function (a, b) { return b.when.localeCompare(a.when); });

    const cid = g.constituent_id;
    const formHtml = !interactionFormOpen ? '' :
      '<div id="grant-interaction-form" style="margin-bottom:10px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;background:var(--surface-2);">' +
      (cid
        ? '<p style="font-size:var(--text-sm);font-weight:600;margin:0 0 8px;">Log an interaction</p>' +
          '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<select class="organizational-input" id="grant-int-type" style="width:auto;">' +
              Object.keys(INTERACTION_LABELS).map(function (k) { return '<option value="' + k + '">' + INTERACTION_LABELS[k] + '</option>'; }).join('') +
            '</select>' +
            '<input type="date" class="organizational-input" id="grant-int-date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:auto;">' +
          '</div>' +
          '<textarea class="organizational-textarea" id="grant-int-desc" rows="3" maxlength="4000" placeholder="What happened" style="width:100%;margin-bottom:8px;"></textarea>' +
          '<button type="button" class="organizational-btn" id="grant-int-save">Save</button>'
        : '<p style="font-size:var(--text-sm);margin:0;">Link a funder under Details first. Interactions are logged against the funder contact.</p>') +
      '</div>';

    root.innerHTML = formHtml + (items.length
      ? items.map(function (it) {
          return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px ' + (it.muted ? 'dashed' : 'solid') + ' var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;">' +
            '<span style="font-size:var(--text-xs);color:var(--text-secondary);min-width:84px;">' + formatDateShort(it.when) + '</span>' + it.html +
            (it.interactionId ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-int-delete="' + it.interactionId + '" title="Delete" style="margin-left:auto;padding:2px 6px;">✕</button>' : '') +
            '</div>';
        }).join('')
      : '<p style="color:var(--text-secondary);font-size:var(--text-sm);margin:0 0 8px;">' +
        (panelActivity.failed ? 'Could not load payments and interactions.' : 'Nothing yet. Payments appear here once they are recorded against this grant in Banking or Gift Postings.') + '</p>');

    const save = root.querySelector('#grant-int-save');
    if (save) save.addEventListener('click', async function () {
      const desc = root.querySelector('#grant-int-desc').value.trim();
      if (!desc) { root.querySelector('#grant-int-desc').focus(); return; }
      save.disabled = true;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + cid + '/interactions', {
        method: 'POST', body: JSON.stringify({ grant_id: g.id, interaction_type: root.querySelector('#grant-int-type').value,
          interaction_date: root.querySelector('#grant-int-date').value, description: desc }),
      });
      save.disabled = false;
      if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not save.'); return; }
      showPanelError('');
      interactionFormOpen = false;
      await loadActivityForPanel(g);
      renderGrantTimeline(g);
    });
    root.querySelectorAll('[data-int-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Delete this interaction?')) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/interactions/' + btn.getAttribute('data-int-delete'), { method: 'DELETE' });
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not delete.'); return; }
        showPanelError('');
        await loadActivityForPanel(g);
        renderGrantTimeline(g);
      });
    });
  }

  function renderPanelEdit(g) {
    if (!panelBody) return;
    if (panelTitle) panelTitle.textContent = g.name || 'Grant';

    const grantAllocs = allAllocations.filter(function (a) { return Number(a.grant_id) === Number(g.id); });
    const fys = getAllFysForGrant(g, grantAllocs);

    const dt = function (v) { return v ? String(v).slice(0, 10) : ''; };
    const rowsEssential =
      pfRow('name',            'Grant name',    'text', g.name) +
      pfFunderRow(g) +
      pfSelectRow('status', 'Status', [
        { value: 'prospect', label: 'Prospect' },
        { value: 'applied',  label: 'Applied' },
        { value: 'awarded',  label: 'Awarded' },
        { value: 'declined', label: 'Declined' },
        { value: 'closed',   label: 'Closed' },
      ], g.status) +
      pfRow('amount',           'Award amount',  'text', centsToInput(g.amount_cents)) +
      pfRow('start_date',       'Grant start',   'date', dt(g.start_date)) +
      pfRow('end_date',         'Grant end',     'date', dt(g.end_date)) +
      pfRow('next_report_due',  'Next report due', 'date', dt(g.next_report_due)) +
      pfProgRow(g) +
      pfListRow('institution_type', 'Institution type', INSTITUTION_OPTIONS, g.institution_type, instKey) +
      pfListRow('grant_type', 'Grant type', GRANT_TYPE_OPTIONS, g.grant_type);

    const rowsMore =
      pfGrantCodeRow(g) +
      pfRow('funder_grant_id', 'Funder ref #',  'text', g.funder_grant_id) +
      (g.constituent_id ? '' : pfRow('funder', 'Funder (text)', 'text', g.funder)) +
      pfRow('request_amount',   'Requested',                'text', centsToInput(g.request_amount_cents)) +
      pfRow('forecast_amount',  'Forecast (budget basis)',  'text', centsToInput(g.forecast_amount_cents)) +
      pfRevAccRow(g) +
      pfRow('loi_submitted_at',         'LOI submitted',    'date', dt(g.loi_submitted_at)) +
      pfRow('application_submitted_at', 'App. submitted',   'date', dt(g.application_submitted_at)) +
      pfRow('award_date',               'Award date',       'date', dt(g.award_date)) +
      pfRow('period_start_date',        'Period start',     'date', dt(g.period_start_date)) +
      pfRow('period_end_date',          'Period end',       'date', dt(g.period_end_date)) +
      pfRow('final_report_submitted',   'Final submitted',  'date', dt(g.final_report_submitted)) +
      pfRow('renewal_application_due',  'Renewal due',      'date', dt(g.renewal_application_due));

    panelBody.innerHTML =
      '<div class="organizational-panel-edit">' +
        '<p id="grant-subline" style="margin:0 0 10px;font-size:var(--text-sm);color:var(--text-secondary);"></p>' +
        '<div id="grant-summary" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
          '<button type="button" class="organizational-btn" data-grant-open="interaction" style="background:var(--organizational-accent-tint);color:var(--organizational-accent);">Log an interaction</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-grant-open="details" style="margin-left:auto;">Details</button>' +
        '</div>' +
        '<div id="grant-details" hidden style="margin-bottom:14px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;background:var(--surface-1,#fff);">' +
          '<div class="organizational-panel-fields">' + rowsEssential + '</div>' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-grant-open="more" style="margin-top:12px;">More fields</button>' +
          '<div id="grant-more" hidden>' +
            '<div class="organizational-panel-fields" style="margin-top:12px;">' + rowsMore + '</div>' +
            '<div class="organizational-panel-section-head" style="margin-top:16px;">Federal award (2 CFR 200)</div>' +
            '<div class="organizational-panel-fields">' +
              pfCheckboxRow('is_federal_award', 'This is a federal award (or passed through from one)', !!g.is_federal_award) +
              pfRow('federal_awarding_agency', 'Federal awarding agency', 'text', g.federal_awarding_agency) +
              pfRow('aln',                     'ALN (Assistance Listing #)', 'text', g.aln) +
              pfRow('pass_through_entity_name', 'Received via pass-through entity (if not direct from the federal agency)', 'text', g.pass_through_entity_name) +
              pfRow('pass_through_identifying_number', 'Pass-through entity’s identifying number', 'text', g.pass_through_identifying_number) +
              pfRow('amount_passed_to_subrecipients_cents', 'Amount passed to this org’s own subrecipients', 'text', centsToInput(g.amount_passed_to_subrecipients_cents)) +
            '</div>' +
            '<div class="organizational-panel-field-row organizational-panel-field-full" style="margin-top:8px;">' +
              '<label class="organizational-label">Restrictions</label>' +
              '<textarea class="organizational-textarea organizational-panel-autosave" data-field="restrictions" rows="2" maxlength="8000">' + escapeHtml(g.restrictions || '') + '</textarea>' +
            '</div>' +
            '<div class="organizational-panel-field-row organizational-panel-field-full" style="margin-top:8px;">' +
              '<label class="organizational-label">Notes</label>' +
              '<textarea class="organizational-textarea organizational-panel-autosave" data-field="notes" rows="3" maxlength="4000">' + escapeHtml(g.notes || '') + '</textarea>' +
            '</div>' +
            (g.extra_data && Object.keys(g.extra_data).length
          ? '<div class="organizational-panel-section-head" style="margin-top:16px;">Custom fields <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">from import</span></div>' +
            '<div class="organizational-panel-fields">' +
            Object.entries(g.extra_data).map(function (kv) {
              return '<div class="organizational-panel-field-row organizational-panel-field-full">' +
                '<label class="organizational-label">' + escapeHtml(kv[0]) + '</label>' +
                '<input class="organizational-input organizational-panel-autosave-extra" type="text" data-extra-key="' + escapeHtml(kv[0]) + '" value="' + escapeHtml(String(kv[1] || '')) + '">' +
              '</div>';
            }).join('') +
            '</div>'
          : '') +
          '</div>' +
          '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">' +
            '<button type="button" class="organizational-btn organizational-btn-outline organizational-grant-archive-btn" data-grant-id="' + g.id + '" style="font-size:0.8125rem;color:var(--text-secondary);">Archive grant</button>' +
          '</div>' +
        '</div>' +
        '<div id="grant-timeline" style="display:flex;flex-direction:column;margin-bottom:8px;"></div>' +
        '<div class="organizational-panel-section-head" style="margin-top:20px;">Allocations by fiscal year</div>' +
        renderFyCoverageIndicator(g, fys) +
        '<div class="organizational-panel-alloc-mode-bar">' +
          '<span class="organizational-label" style="font-size:0.8125rem;color:var(--text-secondary);">Input as</span>' +
          '<div class="organizational-seg-toggle" id="organizational-alloc-mode-toggle">' +
            '<button class="organizational-seg-btn' + (g.allocation_mode !== 'percent' ? ' active' : '') + '" data-mode="amount">$ Amount</button>' +
            '<button class="organizational-seg-btn' + (g.allocation_mode === 'percent' ? ' active' : '') + '" data-mode="percent">% of award</button>' +
          '</div>' +
        '</div>' +
        '<div id="organizational-panel-alloc-sections">' + renderAllocSections(g, fys) + '</div>' +
        '<div style="margin-top:10px;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline organizational-add-fy-btn" data-grant-id="' + g.id + '" style="font-size:0.8125rem;">+ Add fiscal year</button>' +
        '</div>' +
        '<div id="organizational-add-fy-form" hidden style="margin-top:8px;gap:8px;align-items:center;">' +
          '<input type="number" class="organizational-input" id="organizational-add-fy-input" style="width:80px;" placeholder="Year" min="2000" max="2200">' +
          '<button type="button" class="organizational-btn organizational-btn-sm" id="organizational-add-fy-confirm" data-grant-id="' + g.id + '">Add FY</button>' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" id="organizational-add-fy-cancel">Cancel</button>' +
        '</div>' +
        '<div class="organizational-panel-section-head" style="margin-top:20px;">Documents <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">agreements, award letters, funder correspondence</span></div>' +
        '<div id="organizational-grant-documents"><p class="organizational-empty">Loading…</p></div>' +
        '<form id="organizational-grant-attach-form" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<select id="organizational-grant-attach-category" class="organizational-input" style="max-width:200px;">' +
            '<option value="grant_agreement" selected>Grant Agreement</option>' +
            '<option value="award_letter">Award Letter</option>' +
            '<option value="funder_report">Funder Report</option>' +
            '<option value="other">Other</option>' +
          '</select>' +
          '<input type="file" id="organizational-grant-attach-file" required>' +
          '<button type="submit" class="organizational-btn organizational-btn-outline" style="padding:4px 12px;font-size:0.8125rem;">Attach</button>' +
        '</form>' +
      '</div>';

    renderGrantHeader(g);
    renderGrantTimeline(g);
    panelBody.querySelectorAll('[data-grant-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const k = btn.dataset.grantOpen;
        if (k === 'interaction') {
          interactionFormOpen = !interactionFormOpen;
          renderGrantTimeline(g);
          const f = panelBody.querySelector('#grant-interaction-form');
          if (f && interactionFormOpen) f.scrollIntoView({ block: 'nearest' });
          return;
        }
        const target = panelBody.querySelector(k === 'details' ? '#grant-details' : '#grant-more');
        if (target) target.hidden = !target.hidden;
      });
    });

    panelBody.querySelectorAll('.organizational-panel-autosave').forEach(function (el) {
      if (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'checkbox') {
        el.addEventListener('change', function () { panelAutoSave(el, g); });
      } else {
        el.addEventListener('blur', function () { panelAutoSave(el, g); });
      }
    });

    const quickLinkFunderBtn = panelBody.querySelector('.organizational-grant-quicklink-funder');
    if (quickLinkFunderBtn) {
      quickLinkFunderBtn.addEventListener('click', async function () {
        const defaultName = (g.funder || '').trim();
        const name = window.prompt('New funder contact name:', defaultName);
        if (!name || !name.trim()) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents', {
          method: 'POST', body: JSON.stringify({ display_name: name.trim(), kind: 'organization', org_type: 'foundation', roles: ['donor'] }),
        });
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not create funder contact.'); return; }
        institutionFundersCache.push(out.data);
        const sel = panelBody.querySelector('[data-field="constituent_id"]');
        if (sel) {
          sel.insertAdjacentHTML('beforeend', '<option value="' + out.data.id + '">' + escapeHtml(out.data.display_name) + '</option>');
          sel.value = String(out.data.id);
          await panelAutoSave(sel, g);
        }
      });
    }

    panelBody.querySelectorAll('.organizational-panel-autosave-extra').forEach(function (el) {
      el.addEventListener('blur', async function () {
        var key = el.getAttribute('data-extra-key');
        if (!key) return;
        var patch = {};
        patch[key] = el.value.trim() || null;
        await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + g.id,
          { method: 'PATCH', body: JSON.stringify({ extra_data: patch }) });
        if (g.extra_data) g.extra_data[key] = el.value.trim() || null;
      });
    });

    loadGrantDocuments(g.id);
    wireGrantAttachForm(g.id);

    const addFyBtn    = panelBody.querySelector('.organizational-add-fy-btn');
    const addFyForm   = panelBody.querySelector('#organizational-add-fy-form');
    const addFyInput  = panelBody.querySelector('#organizational-add-fy-input');
    const addFyConfirm = panelBody.querySelector('#organizational-add-fy-confirm');
    const addFyCancel = panelBody.querySelector('#organizational-add-fy-cancel');
    if (addFyBtn && addFyForm) {
      addFyBtn.addEventListener('click', function () {
        addFyForm.hidden = false;
        if (addFyInput) addFyInput.focus();
      });
      if (addFyCancel) addFyCancel.addEventListener('click', function () { addFyForm.hidden = true; });
      if (addFyConfirm) {
        addFyConfirm.addEventListener('click', async function () {
          const fy = addFyInput ? Number(addFyInput.value) : null;
          if (!fy || fy < 2000 || fy > 2200) { showPanelError('Enter a valid year (e.g. 2026).'); return; }
          const grantId = Number(addFyConfirm.dataset.grantId);
          const existingFy = allAllocations.find(function (a) { return Number(a.grant_id) === grantId && Number(a.fiscal_year) === fy; });
          if (existingFy) { showPanelError('FY' + fy + ' already has allocations for this grant.'); return; }
          addFyForm.hidden = true;
          const grantAllocs = allAllocations.filter(function (a) { return Number(a.grant_id) === Number(g.id); });
          const currentFys = getAllFysForGrant(g, grantAllocs);
          const allFyYears = new Set(currentFys.map(function (f) { return f.fyYear; }));
          allFyYears.add(fy);
          const newFys = Array.from(allFyYears).sort().map(function (y) {
            const se = fyStartEnd(y, orgFyEndMonth);
            return { fyYear: y, label: 'FY' + y, start: se.start, end: se.end };
          });
          const sectionsEl = document.getElementById('organizational-panel-alloc-sections');
          if (sectionsEl) {
            sectionsEl.innerHTML = renderAllocSections(g, newFys);
            wireAllocSections(g);
          }
          const newAllocRow = document.getElementById('organizational-new-alloc-' + fy);
          if (newAllocRow) {
            newAllocRow.hidden = false;
            const progSel = newAllocRow.querySelector('.organizational-new-alloc-prog');
            if (progSel) progSel.focus();
          }
        });
      }
    }

    const modeToggle = panelBody.querySelector('#organizational-alloc-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('click', async function (e) {
        const btn = e.target.closest('.organizational-seg-btn');
        if (!btn) return;
        const mode = btn.dataset.mode;
        if (mode === g.allocation_mode) return;
        if (mode === 'percent' && !g.amount_cents) {
          showPanelError('Set an award amount before switching to percentage mode.');
          return;
        }
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + g.id,
          { method: 'PATCH', body: JSON.stringify({ allocation_mode: mode }) }
        );
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not save.'); return; }
        showPanelError('');
        g.allocation_mode = mode;
        const idx = grantsCache.findIndex(function (x) { return Number(x.id) === Number(g.id); });
        if (idx >= 0) grantsCache[idx].allocation_mode = mode;
        modeToggle.querySelectorAll('.organizational-seg-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.mode === mode);
        });
        refreshAllocSections(g);
      });
    }

    const archiveBtn = panelBody.querySelector('.organizational-grant-archive-btn');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', async function () {
        if (!currentSlug) return;
        const id = Number(archiveBtn.getAttribute('data-grant-id'));
        if (!Number.isInteger(id) || id < 1) return;
        if (!confirm('Archive this grant? It will be removed from the active view.')) return;
        archiveBtn.disabled = true;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + id, { method: 'DELETE' });
        archiveBtn.disabled = false;
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not archive grant.'); return; }
        closePanel();
        await loadGrants(currentSlug);
      });
    }

    wireAllocSections(g);
    renderAllocRequests(g);
  }

  function arFmt(c) { return '$' + (Number(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  async function renderAllocRequests(g) {
    const old = panelBody.querySelector('.organizational-alloc-requests');
    if (old) old.remove();
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(currentSlug) : null;
    if (!access || !panelGrant || Number(panelGrant.id) !== Number(g.id)) return;
    const isLead = access.role === 'program';
    const canDecide = !!(access.write && access.write.allocations);
    const url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + g.id + '/allocation-requests';
    const out = await apiJson(url);
    const list = out && out.res.ok ? (out.data.requests || []) : [];
    if (!isLead && !list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'organizational-alloc-requests';
    wrap.setAttribute('data-ro-keep', '');
    wrap.style.cssText = 'margin-top:20px;padding-top:12px;border-top:1px solid var(--border);';
    let html = '<h3 style="font-size:0.9375rem;font-weight:600;margin:0 0 8px;">Allocation requests</h3>';
    html += list.length ? list.map(function (r) {
      const state = r.status === 'pending' ? 'Waiting' : (r.status === 'accepted' ? 'Accepted' : 'Declined' + (r.decision_note ? ': ' + escapeHtml(r.decision_note) : ''));
      return '<div style="margin-bottom:6px;font-size:0.8125rem;"><strong>' + escapeHtml(r.program_name) + '</strong> · FY' + r.fiscal_year + ' · ' + arFmt(r.amount_cents)
        + (r.note ? ' · ' + escapeHtml(r.note) : '') + ' · <span style="color:var(--text-secondary);">' + state + '</span>'
        + (canDecide && r.status === 'pending'
          ? ' <button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-ar-accept="' + r.id + '">Accept</button>'
            + ' <button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-ar-decline="' + r.id + '">Decline</button>'
          : '') + '</div>';
    }).join('') : '<p class="organizational-hint" style="margin:0 0 8px;">No requests yet.</p>';
    if (isLead) {
      html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
        + '<select class="organizational-input" data-ar-program style="width:auto;">' + programsCache.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }).join('') + '</select>'
        + '<input type="number" class="organizational-input" data-ar-fy placeholder="Year" min="2000" max="2200" style="width:80px;">'
        + '<input type="number" class="organizational-input" data-ar-amount placeholder="New amount ($)" min="0" style="width:130px;">'
        + '<input type="text" class="organizational-input" data-ar-note placeholder="Why" maxlength="300" style="flex:1;min-width:120px;">'
        + '<button type="button" class="organizational-btn" data-ar-send>Ask for this change</button></div>'
        + '<p class="organizational-hint" style="margin:6px 0 0;">The change takes effect when someone who manages Funding accepts it.</p>';
    }
    html += '<p class="organizational-error" data-ar-error hidden></p>';
    wrap.innerHTML = html;
    panelBody.appendChild(wrap);
    const err = function (m) { const e = wrap.querySelector('[data-ar-error]'); e.textContent = m || ''; e.hidden = !m; };
    wrap.addEventListener('click', async function (e) {
      const send = e.target.closest('[data-ar-send]');
      const acc = e.target.closest('[data-ar-accept]');
      const dec = e.target.closest('[data-ar-decline]');
      let res;
      if (send) {
        res = await apiJson(url, { method: 'POST', body: JSON.stringify({
          program_id: wrap.querySelector('[data-ar-program]').value, fiscal_year: wrap.querySelector('[data-ar-fy]').value,
          amount: wrap.querySelector('[data-ar-amount]').value, note: wrap.querySelector('[data-ar-note]').value }) });
      } else if (acc) {
        res = await apiJson(url + '/' + acc.getAttribute('data-ar-accept') + '/accept', { method: 'POST', body: '{}' });
      } else if (dec) {
        const why = window.prompt('Why is this declined? The lead will see it.');
        if (!why) return;
        res = await apiJson(url + '/' + dec.getAttribute('data-ar-decline') + '/decline', { method: 'POST', body: JSON.stringify({ note: why }) });
      } else return;
      if (!res || !res.res.ok) { err((res && res.data && res.data.error) || 'Could not save.'); return; }
      if (acc) { await loadAllocationsForPanel(g); renderPanelEdit(g); return; }
      renderAllocRequests(g);
    });
  }

  async function panelAutoSave(el, g) {
    const field = el.getAttribute('data-field');
    if (!field) return;
    const body = {};
    if (field === 'amount' || field === 'request_amount' || field === 'forecast_amount') {
      const cents = inputToCents(el.value);
      if (el.value.trim() && cents === null) { showPanelError('Amount must be a valid number.'); return; }
      body[field] = cents !== null ? cents / 100 : null;
    } else if (field === 'primary_program_id') {
      body.primary_program_id = el.value ? Number(el.value) : null;
    } else if (field === 'revenue_account_id') {
      body.revenue_account_id = el.value ? Number(el.value) : null;
    } else if (field === 'constituent_id') {
      body.constituent_id = el.value ? Number(el.value) : null;
    } else if (field === 'is_federal_award') {
      body.is_federal_award = !!el.checked;
    } else if (field === 'amount_passed_to_subrecipients_cents') {
      const cents = inputToCents(el.value);
      if (el.value.trim() && cents === null) { showPanelError('Amount must be a valid number.'); return; }
      body.amount_passed_to_subrecipients_cents = cents;
    } else {
      body[field] = el.value.trim() || null;
    }
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + g.id,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
    if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not save.'); return; }
    showPanelError('');
    const idx = grantsCache.findIndex(function (x) { return Number(x.id) === Number(g.id); });
    if (idx >= 0) {
      if (field === 'amount') {
        const c = inputToCents(el.value);
        grantsCache[idx].amount_cents = c; grantsCache[idx].amount_dollars = c != null ? c / 100 : null;
      } else if (field === 'request_amount') {
        const c = inputToCents(el.value);
        grantsCache[idx].request_amount_cents = c; grantsCache[idx].request_amount_dollars = c != null ? c / 100 : null;
      } else if (field === 'forecast_amount') {
        const c = inputToCents(el.value);
        grantsCache[idx].forecast_amount_cents = c; grantsCache[idx].forecast_amount_dollars = c != null ? c / 100 : null;
      } else if (field === 'primary_program_id') {
        grantsCache[idx].primary_program_id = el.value ? Number(el.value) : null;
      } else if (field === 'revenue_account_id') {
        grantsCache[idx].revenue_account_id = el.value ? Number(el.value) : null;
      } else if (field === 'is_federal_award') {
        grantsCache[idx].is_federal_award = !!el.checked;
      } else if (field === 'amount_passed_to_subrecipients_cents') {
        const c = inputToCents(el.value);
        grantsCache[idx].amount_passed_to_subrecipients_cents = c;
      } else {
        grantsCache[idx][field] = el.value.trim() || null;
      }
      if (field === 'name' && panelTitle) panelTitle.textContent = grantsCache[idx].name || 'Grant';
      Object.assign(g, grantsCache[idx]);
      const tr = grantsTbody && grantsTbody.querySelector('[data-grant-id="' + g.id + '"]');
      if (tr) {
        const td = tr.querySelector('[data-field="' + field + '"]');
        if (td && !td.querySelector('input, select')) td.innerHTML = grantCellText(grantsCache[idx], field);
      }
      if (panelGrant && Number(panelGrant.id) === Number(g.id) && panelBody.querySelector('#grant-summary')) { renderGrantHeader(g); renderGrantTimeline(g); }
      if (field === 'start_date' || field === 'end_date' || field === 'amount') refreshAllocSections(g);
    }
  }

  function renderAllocSections(g, fys) {
    const grantAllocs = allAllocations.filter(function (a) { return Number(a.grant_id) === Number(g.id); });
    if (fys.length === 0) {
      const total = grantAllocs.reduce(function (s, a) { return s + (a.amount_cents || 0); }, 0);
      return renderSingleAllocSection(g, null, grantAllocs, total);
    }
    let runningTotal = 0;
    return fys.map(function (fy) {
      const fyAllocs = grantAllocs.filter(function (a) { return Number(a.fiscal_year) === fy.fyYear; });
      runningTotal += fyAllocs.reduce(function (s, a) { return s + (a.amount_cents || 0); }, 0);
      return renderSingleAllocSection(g, fy, fyAllocs, runningTotal);
    }).join('');
  }

  function renderSingleAllocSection(g, fy, allocRows, cumulativeTotal) {
    const fyYear   = fy ? fy.fyYear : null;
    const fyLbl    = fy ? fy.label : 'Allocations';
    const fyPeriod = fy ? fy.start.slice(0, 7) + ' – ' + fy.end.slice(0, 7) : '';
    const awardCents     = g.amount_cents || 0;
    const allocMode      = g.allocation_mode === 'percent' ? 'percent' : 'amount';
    const allocatedCents = allocRows.reduce(function (s, a) { return s + (a.amount_cents || 0); }, 0);
    const remainingCents = awardCents - (cumulativeTotal != null ? cumulativeTotal : allocatedCents);
    const over = awardCents > 0 && remainingCents < 0;
    const fyId = fyYear ? String(fyYear) : 'na';

    let rows = '';
    allocRows.forEach(function (a) {
      const progName = a.program_name || ('Program ' + a.program_id);
      let inputVal, secondaryText;
      if (allocMode === 'percent') {
        const pct = awardCents ? (((a.amount_cents || 0) / awardCents) * 100) : null;
        inputVal = pct !== null ? pct.toFixed(2) : '';
        secondaryText = formatUsdFromCents(a.amount_cents);
      } else {
        inputVal = centsToInput(a.amount_cents);
        secondaryText = awardCents ? (((a.amount_cents || 0) / awardCents) * 100).toFixed(1) + '%' : '—';
      }
      rows +=
        '<tr data-alloc-id="' + a.id + '">' +
          '<td class="organizational-alloc-prog-label">' + escapeHtml(progName) + '</td>' +
          '<td><input type="text" class="organizational-input organizational-alloc-val-input" style="width:88px;" value="' + escapeHtml(inputVal) + '" data-alloc-id="' + a.id + '" data-grant-id="' + g.id + '" data-award-cents="' + awardCents + '" data-mode="' + allocMode + '"></td>' +
          '<td class="organizational-alloc-secondary" data-alloc-id="' + a.id + '">' + escapeHtml(secondaryText) + '</td>' +
          '<td><input type="text" class="organizational-input organizational-alloc-notes-input" value="' + escapeHtml(a.notes || '') + '" placeholder="Notes" data-alloc-id="' + a.id + '" data-grant-id="' + g.id + '"></td>' +
          '<td><button type="button" class="organizational-alloc-delete" data-alloc-id="' + a.id + '" data-grant-id="' + g.id + '" title="Remove">×</button></td>' +
        '</tr>';
    });

    let totalHtml;
    if (awardCents > 0) {
      const remStr = (over ? 'Over by ' : 'Remaining ') + formatUsdFromCents(Math.abs(remainingCents));
      totalHtml = 'FY allocated ' + formatUsdFromCents(allocatedCents) +
        ' · <span class="' + (over ? 'organizational-alloc-over' : 'organizational-alloc-remaining') + '">' + escapeHtml(remStr) + ' on ' + formatUsdFromCents(awardCents) + ' grant</span>';
    } else if (allocatedCents > 0) {
      totalHtml = 'Allocated ' + formatUsdFromCents(allocatedCents);
    } else {
      totalHtml = 'No allocations yet';
    }

    const col2Head  = allocMode === 'percent' ? '% of award' : 'Amount';
    const col3Head  = allocMode === 'percent' ? 'Amount'     : '%';
    const newValPh  = allocMode === 'percent' ? 'e.g. 45.5' : 'Amount';

    const fyInputHtml = fy ? '' :
      '<input type="number" class="organizational-input organizational-new-alloc-fy-input" style="width:72px;" placeholder="Year" min="2000" max="2200">';

    let progOpts = '<option value="">— Program —</option>';
    programsCache.forEach(function (p) {
      progOpts += '<option value="' + p.id + '">' + escapeHtml((p.code ? p.code + ' — ' : '') + p.name) + '</option>';
    });

    return '<div class="organizational-panel-fy-section" data-fy-section="' + fyId + '">' +
      '<div class="organizational-panel-fy-head">' +
        '<span class="organizational-panel-fy-label">' + escapeHtml(fyLbl) + '</span>' +
        (fyPeriod ? '<span class="organizational-panel-fy-period">' + escapeHtml(fyPeriod) + '</span>' : '') +
      '</div>' +
      '<table class="organizational-table organizational-table-compact">' +
        '<thead><tr><th>Program</th><th>' + col2Head + '</th><th>' + col3Head + '</th><th>Notes</th><th></th></tr></thead>' +
        '<tbody id="organizational-alloc-body-' + fyId + '">' + rows + '</tbody>' +
      '</table>' +
      '<div class="organizational-panel-fy-footer">' +
        '<span class="organizational-panel-fy-total">' + totalHtml + '</span>' +
        '<button type="button" class="organizational-btn organizational-btn-outline organizational-panel-add-alloc-btn" data-fy="' + (fyYear || '') + '" data-grant-id="' + g.id + '" style="padding:5px 12px;font-size:0.8125rem;">+ Add program</button>' +
      '</div>' +
      '<div class="organizational-panel-new-alloc-row" id="organizational-new-alloc-' + fyId + '" hidden>' +
        '<select class="organizational-input organizational-new-alloc-prog" aria-label="Program" style="min-width:140px;">' + progOpts + '</select>' +
        fyInputHtml +
        '<input type="text" class="organizational-input organizational-new-alloc-val" style="width:88px;" placeholder="' + newValPh + '" data-mode="' + allocMode + '" data-award-cents="' + awardCents + '">' +
        '<input type="text" class="organizational-input organizational-new-alloc-notes" placeholder="Notes" style="min-width:90px;flex:1;">' +
        '<button type="button" class="organizational-btn organizational-new-alloc-save" data-fy="' + (fyYear || '') + '" data-grant-id="' + g.id + '" style="padding:6px 12px;font-size:0.8125rem;">Add</button>' +
        '<button type="button" class="organizational-btn-ghost organizational-new-alloc-cancel" data-fy="' + (fyYear || '') + '">Cancel</button>' +
      '</div>' +
    '</div>';
  }

  function refreshAllocSections(g) {
    const sectionsEl = document.getElementById('organizational-panel-alloc-sections');
    if (!sectionsEl) return;
    const grantAllocs = allAllocations.filter(function (a) { return Number(a.grant_id) === Number(g.id); });
    const fys = getAllFysForGrant(g, grantAllocs);
    sectionsEl.innerHTML = renderAllocSections(g, fys);
    wireAllocSections(g);
    const total = grantAllocs.reduce(function (s, a) { return s + (a.amount_cents || 0); }, 0);
    const idx = grantsCache.findIndex(function (x) { return Number(x.id) === Number(g.id); });
    if (idx >= 0) grantsCache[idx].allocated_cents = total;
  }

  function wireAllocSections(g) {
    const root = document.getElementById('organizational-panel-alloc-sections');
    if (!root) return;

    root.querySelectorAll('.organizational-alloc-val-input').forEach(function (valEl) {
      const allocId    = Number(valEl.dataset.allocId);
      const grantId    = Number(valEl.dataset.grantId);
      const awardCents = Number(valEl.dataset.awardCents);
      const mode       = valEl.dataset.mode || 'amount';
      const secCell    = root.querySelector('.organizational-alloc-secondary[data-alloc-id="' + allocId + '"]');

      valEl.addEventListener('input', function () {
        if (!secCell) return;
        if (mode === 'percent') {
          const pct = parseFloat(valEl.value);
          const derived = (!isNaN(pct) && awardCents) ? Math.round(pct / 100 * awardCents) : null;
          secCell.textContent = derived !== null ? formatUsdFromCents(derived) : '—';
        } else {
          const cents = inputToCents(valEl.value);
          secCell.textContent = (cents !== null && awardCents)
            ? (cents / awardCents * 100).toFixed(1) + '%' : '—';
        }
      });

      valEl.addEventListener('blur', async function () {
        let cents;
        if (mode === 'percent') {
          const pct = parseFloat(valEl.value);
          if (valEl.value.trim() && isNaN(pct)) { showPanelError('Enter a valid percentage (e.g. 45.5).'); return; }
          cents = (!isNaN(pct) && awardCents) ? Math.round(pct / 100 * awardCents) : null;
        } else {
          cents = inputToCents(valEl.value);
          if (valEl.value.trim() && cents === null) { showPanelError('Amount must be a valid number.'); return; }
        }
        const body = cents !== null ? { amount_cents: cents } : { amount: null };
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grantId + '/allocations/' + allocId,
          { method: 'PATCH', body: JSON.stringify(body) }
        );
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not save.'); return; }
        showPanelError('');
        const idx = allAllocations.findIndex(function (a) { return a.id === allocId; });
        if (idx >= 0) allAllocations[idx].amount_cents = cents;
        refreshAllocSections(g);
      });
    });

    root.querySelectorAll('.organizational-alloc-notes-input').forEach(function (notesEl) {
      const allocId = Number(notesEl.dataset.allocId);
      const grantId = Number(notesEl.dataset.grantId);
      notesEl.addEventListener('blur', async function () {
        const notes = notesEl.value.trim() || null;
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grantId + '/allocations/' + allocId,
          { method: 'PATCH', body: JSON.stringify({ notes }) }
        );
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not save.'); return; }
        showPanelError('');
        const idx = allAllocations.findIndex(function (a) { return a.id === allocId; });
        if (idx >= 0) allAllocations[idx].notes = notes;
      });
    });

    root.querySelectorAll('.organizational-alloc-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const allocId = Number(btn.dataset.allocId);
        const grantId = Number(btn.dataset.grantId);
        if (!confirm('Remove this allocation?')) return;
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grantId + '/allocations/' + allocId,
          { method: 'DELETE' }
        );
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not remove.'); return; }
        showPanelError('');
        allAllocations = allAllocations.filter(function (a) { return a.id !== allocId; });
        refreshAllocSections(g);
      });
    });

    root.querySelectorAll('.organizational-panel-add-alloc-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const fyId   = btn.dataset.fy ? String(btn.dataset.fy) : 'na';
        const newRow = document.getElementById('organizational-new-alloc-' + fyId);
        if (newRow) {
          newRow.hidden = false;
          const prog = newRow.querySelector('.organizational-new-alloc-prog');
          if (prog) prog.focus();
        }
      });
    });

    root.querySelectorAll('.organizational-new-alloc-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const fyId   = btn.dataset.fy ? String(btn.dataset.fy) : 'na';
        const newRow = document.getElementById('organizational-new-alloc-' + fyId);
        if (newRow) newRow.hidden = true;
      });
    });

    root.querySelectorAll('.organizational-new-alloc-save').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const fyVal   = btn.dataset.fy;
        const grantId = Number(btn.dataset.grantId);
        const fyId    = fyVal ? String(fyVal) : 'na';
        const newRow  = document.getElementById('organizational-new-alloc-' + fyId);
        if (!newRow) return;

        const progSel    = newRow.querySelector('.organizational-new-alloc-prog');
        const fyInput    = newRow.querySelector('.organizational-new-alloc-fy-input');
        const valInput   = newRow.querySelector('.organizational-new-alloc-val');
        const notesInput = newRow.querySelector('.organizational-new-alloc-notes');

        const programId = progSel && progSel.value ? Number(progSel.value) : null;
        if (!programId) { showPanelError('Select a program.'); return; }

        let fiscalYear = fyVal ? Number(fyVal) : null;
        if (!fiscalYear && fyInput) fiscalYear = fyInput.value ? Number(fyInput.value) : null;
        if (!fiscalYear) { showPanelError('Fiscal year is required.'); return; }

        const valMode   = (valInput && valInput.dataset.mode) || 'amount';
        const awardCts  = Number(valInput && valInput.dataset.awardCents || 0);
        let amtCents;
        if (valMode === 'percent') {
          const pct = parseFloat(valInput && valInput.value);
          if (valInput && valInput.value.trim() && isNaN(pct)) { showPanelError('Enter a valid percentage (e.g. 45.5).'); return; }
          amtCents = (!isNaN(pct) && awardCts) ? Math.round(pct / 100 * awardCts) : null;
        } else {
          amtCents = inputToCents(valInput && valInput.value);
          if (valInput && valInput.value.trim() && amtCents === null) { showPanelError('Amount must be a valid number.'); return; }
        }
        const notes = notesInput && notesInput.value.trim() ? notesInput.value.trim() : null;

        btn.disabled = true;
        const body = { program_id: programId, fiscal_year: fiscalYear, notes };
        if (amtCents !== null) body.amount_cents = amtCents;

        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grantId + '/allocations',
          { method: 'POST', body: JSON.stringify(body) }
        );
        btn.disabled = false;
        if (!out || !out.res.ok) { showPanelError((out && out.data && out.data.error) || 'Could not add.'); return; }
        showPanelError('');

        const prog = programsCache.find(function (p) { return Number(p.id) === programId; });
        const newAlloc = Object.assign({}, out.data.allocation, {
          grant_id:     grantId,
          program_name: prog ? ((prog.code ? prog.code + ' — ' : '') + prog.name) : ('Program ' + programId),
        });
        const existing = allAllocations.findIndex(function (a) { return a.id === newAlloc.id; });
        if (existing >= 0) allAllocations[existing] = newAlloc;
        else allAllocations.push(newAlloc);
        refreshAllocSections(g);
      });
    });
  }

  async function loadGrants(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants', { method: 'GET' });
    if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
    if (!out.res.ok) {
      renderGrants([]);
      if (grantsFreshnessEl) { grantsFreshnessEl.textContent = ''; grantsFreshnessEl.hidden = true; }
      return;
    }
    renderGrants(out.data.grants || []);
    if (grantsFreshnessEl) {
      const iso = out.data.grants_last_updated_at;
      if (iso && typeof window.formatFreshnessLine === 'function') {
        grantsFreshnessEl.textContent = window.formatFreshnessLine(iso, 'updated');
        grantsFreshnessEl.hidden = false;
      } else {
        grantsFreshnessEl.textContent = '';
        grantsFreshnessEl.hidden = true;
      }
    }
  }

  (function () {
    var helpBtn = document.getElementById('organizational-template-help-btn');
    var helpBox = document.getElementById('organizational-template-help');
    if (!helpBtn || !helpBox) return;
    helpBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      helpBox.style.display = helpBox.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function () { helpBox.style.display = 'none'; });
  }());

  if (filterSearchEl) filterSearchEl.addEventListener('input', function () { filterState.search = this.value.trim(); renderFilteredGrants(); });
  if (filterStatusEl) filterStatusEl.addEventListener('change', function () { filterState.status = this.value; renderFilteredGrants(); });
  if (filterTypeEl)   filterTypeEl.addEventListener('change', function () { filterState.type = this.value; renderFilteredGrants(); });
  if (filterInstEl)   filterInstEl.addEventListener('change', function () { filterState.institution = this.value; renderFilteredGrants(); });

  if (panelClose)   panelClose.addEventListener('click', function (e) { e.preventDefault(); closePanel(); });
  if (addBtn)       addBtn.addEventListener('click', function () { window.OrganizationalFunders.switchTab('grants'); openPanel(null); });

  (function () {
    var OUR_FIELDS = [
      { key: 'funder',                   label: 'Funder *',               patterns: [/funder/i, /grantor/i, /foundation/i, /donor.?org/i, /organization/i, /sponsor/i] },
      { key: 'grant_name',               label: 'Grant name *',           patterns: [/grant.?name/i, /project.?name/i, /project.?title/i, /title/i, /program.?name/i] },
      { key: 'status',                   label: 'Status *',               patterns: [/\bstatus\b/i, /\bstage\b/i, /\bphase\b/i] },
      { key: 'grant_amount',             label: 'Award amount',           patterns: [/award.?amount/i, /grant.?amount/i, /amount.?award/i, /total.?fund/i, /total.?award/i, /funded/i, /award.?total/i] },
      { key: 'request_amount',           label: 'Requested amount',       patterns: [/request.?amount/i, /amount.?request/i, /\bask\b/i, /\brequested\b/i, /amount.?sought/i] },
      { key: 'funder_grant_id',          label: 'Funder ref #',           patterns: [/funder.?ref/i, /funder.?grant.?id/i, /funder.?id/i, /reference.?#/i, /ref.?#/i, /grant.?num/i, /grant.?ref/i, /external.?id/i] },
      { key: 'start_date',               label: 'Start date',             patterns: [/start.?date/i, /project.?start/i, /begin.?date/i, /from.?date/i, /period.?start/i] },
      { key: 'end_date',                 label: 'End date',               patterns: [/end.?date/i, /project.?end/i, /expir/i, /close.?date/i, /period.?end/i] },
      { key: 'type',                     label: 'Grant type',             patterns: [/grant.?type/i, /grant.?cat/i, /\btype\b/i, /\bcategory\b/i, /restriction.?type/i] },
      { key: 'next_report_due',          label: 'Next report due',        patterns: [/report.?due/i, /next.?report/i, /reporting.?date/i, /report.?date/i] },
      { key: 'final_report_submitted',   label: 'Final report submitted', patterns: [/final.?report/i, /report.?submit/i] },
      { key: 'renewal_application_due',  label: 'Renewal due',            patterns: [/renewal/i, /re.?apply/i] },
      { key: 'loi_submitted_at',         label: 'LOI submitted',          patterns: [/\bloi\b/i, /letter.?of.?intent/i] },
      { key: 'application_submitted_at', label: 'Application submitted',  patterns: [/application.?date/i, /application.?submit/i, /app.?submit/i, /submitted/i, /submit.?date/i] },
      { key: 'award_date',               label: 'Award / decision date',  patterns: [/award.?date/i, /decision.?date/i, /\bawarded\b/i] },
      { key: 'restrictions',             label: 'Restrictions',           patterns: [/\brestrict/i, /\bcondition/i] },
      { key: 'notes',            label: 'Notes',             patterns: [/\bnotes?\b/i, /\bcomments?\b/i, /\bdescription\b/i, /\bnarrative\b/i, /internal/i] },
      { key: 'institution_type', label: 'Institution type',  patterns: [/institution.?type/i, /funder.?type/i, /org.?type/i, /organization.?type/i, /donor.?type/i] },
      { key: 'forecast_amount',  label: 'Forecast amount',   patterns: [/forecast/i, /projected.?amount/i, /estimated.?amount/i, /likelihood/i, /probability/i] },
    ];
    var TEMPLATE_HEADERS = new Set(OUR_FIELDS.map(function (f) { return f.key; }).concat(['grant_code', 'funder_grant_id']));
    var STATUS_MAP = {
      'active': 'awarded', 'funded': 'awarded', 'awarded': 'awarded',
      'under review': 'applied', 'in review': 'applied', 'pending': 'applied', 'applied': 'applied', 'submitted': 'applied',
      'prospect': 'prospect', 'identified': 'prospect', 'new': 'prospect',
      'closed': 'closed', 'complete': 'closed', 'completed': 'closed', 'finished': 'closed', 'expired': 'closed',
      'declined': 'declined', 'rejected': 'declined', 'denied': 'declined', 'not funded': 'declined',
    };

    function normalizeStatus(raw) {
      var s = String(raw || '').trim().toLowerCase();
      return STATUS_MAP[s] || s;
    }

    function parseCSVText(text) {
      var rows = [], row = [], field = '', inQ = false;
      var t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      for (var i = 0; i < t.length; i++) {
        var c = t[i];
        if (inQ) {
          if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
          else if (c === '"') inQ = false;
          else field += c;
        } else if (c === '"') {
          inQ = true;
        } else if (c === ',') {
          row.push(field); field = '';
        } else if (c === '\n') {
          row.push(field); field = '';
          if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
          row = [];
        } else {
          field += c;
        }
      }
      if (field || row.length) { row.push(field); if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row); }
      return rows;
    }

    function isTemplateCsv(headers) {
      var h = headers.map(function (x) { return x.trim().toLowerCase(); });
      return h.indexOf('funder') !== -1 && h.indexOf('grant_name') !== -1 && h.indexOf('status') !== -1;
    }

    function suggestField(header) {
      var h = String(header || '').trim();
      for (var i = 0; i < OUR_FIELDS.length; i++) {
        for (var j = 0; j < OUR_FIELDS[i].patterns.length; j++) {
          if (OUR_FIELDS[i].patterns[j].test(h)) return OUR_FIELDS[i].key;
        }
      }
      return '';
    }

    var importBtn  = document.getElementById('organizational-grant-import-btn');
    var importFile = document.getElementById('organizational-grant-import-file');
    var backdrop   = document.getElementById('organizational-automap-backdrop');
    var tableWrap  = document.getElementById('organizational-automap-table-wrap');
    var statusEl   = document.getElementById('organizational-automap-status');
    var confirmBtn = document.getElementById('organizational-automap-confirm');
    var cancelBtn  = document.getElementById('organizational-automap-cancel');
    var closeBtn   = document.getElementById('organizational-automap-close');
    var pendingHeaders = [], pendingData = [];

    function openBackdrop() { if (backdrop) backdrop.style.display = 'block'; }
    function closeBackdrop() { if (backdrop) backdrop.style.display = 'none'; pendingHeaders = []; pendingData = []; }

    async function doDirectImport(file, btn) {
      btn.disabled = true; btn.textContent = 'Importing…';
      try {
        var fd = new FormData(); fd.append('file', file);
        var res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/import/grants',
          { method: 'POST', credentials: 'include', body: fd });
        var json = await res.json();
        if (!res.ok) {
          var msg = (json.errors && json.errors.length)
            ? json.errors.map(function (e) { return 'Row ' + e.row + ': ' + e.message; }).join('\n')
            : (json.error || 'Import failed');
          alert('Import errors:\n' + msg);
        } else {
          var parts = [];
          if (json.inserted) parts.push(json.inserted + ' added');
          if (json.updated)  parts.push(json.updated  + ' updated');
          if (!parts.length) parts.push('No changes');
          alert('Import complete — ' + parts.join(', ') + '.');
          await loadGrants(currentSlug);
        }
      } catch (e) { alert('Import failed: ' + e.message); }
      finally { btn.disabled = false; btn.textContent = 'Import CSV'; }
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', function () { importFile.click(); });
      importFile.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        this.value = '';
        var reader = new FileReader();
        reader.onload = function (e) {
          var rows = parseCSVText(e.target.result || '');
          if (!rows.length) { alert('Could not read CSV — file appears empty.'); return; }
          var headers = rows[0];
          var data = rows.slice(1).filter(function (r) { return !String(r[0] || '').trimStart().startsWith('#'); });
          if (isTemplateCsv(headers)) {
            doDirectImport(file, importBtn);
          } else {
            pendingHeaders = headers;
            pendingData = data;
            showMappingModal(headers, data);
          }
        };
        reader.readAsText(file);
      });
    }

    function showMappingModal(headers, data) {
      var suggestions = headers.map(function (h) { return suggestField(h); });
      var sample = data[0] || [];
      var fieldOpts = '<option value="">— Skip —</option>' +
        '<option value="__extra__">⊕ Keep as custom field</option>' +
        '<optgroup label="Standard fields">' +
        OUR_FIELDS.map(function (f) { return '<option value="' + f.key + '">' + f.label + '</option>'; }).join('') +
        '</optgroup>';

      var tableHtml = '<table style="width:100%;border-collapse:collapse;font-size:0.8125rem;">' +
        '<thead><tr style="border-bottom:2px solid var(--border);">' +
        '<th style="text-align:left;padding:6px 10px;color:var(--text-secondary);">Your column</th>' +
        '<th style="text-align:left;padding:6px 10px;color:var(--text-secondary);">Sample value</th>' +
        '<th style="text-align:left;padding:6px 10px;color:var(--text-secondary);">→ Maps to</th>' +
        '</tr></thead><tbody>';

      headers.forEach(function (h, i) {
        var sug = suggestions[i];
        var isUnmatched = !sug;
        var rowStyle = isUnmatched
          ? 'border-bottom:1px solid var(--border);background:var(--surface-hover);'
          : 'border-bottom:1px solid var(--border);';
        tableHtml += '<tr style="' + rowStyle + '">' +
          '<td style="padding:6px 10px;font-weight:500;">' + escapeHtml(h) + '</td>' +
          '<td style="padding:6px 10px;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(sample[i] || '') + '">' + escapeHtml(sample[i] || '') + '</td>' +
          '<td style="padding:4px 10px;">' +
            '<select class="organizational-input organizational-automap-sel" data-col-idx="' + i + '" data-col-name="' + escapeHtml(h) + '" style="font-size:0.8rem;padding:4px 6px;">' +
              fieldOpts +
            '</select>' +
            (isUnmatched ? ' <button type="button" class="organizational-automap-keep-btn" data-col-idx="' + i + '" style="font-size:0.75rem;padding:2px 7px;border:1px solid var(--wine-light);border-radius:4px;background:var(--surface-active);color:var(--wine-primary);cursor:pointer;white-space:nowrap;">Keep</button>' : '') +
          '</td>' +
        '</tr>';
      });
      tableHtml += '</tbody></table>';
      if (tableWrap) tableWrap.innerHTML = tableHtml;

      var sels = tableWrap ? tableWrap.querySelectorAll('.organizational-automap-sel') : [];
      sels.forEach(function (sel, i) { if (suggestions[i]) sel.value = suggestions[i]; });

      if (tableWrap) {
        tableWrap.querySelectorAll('.organizational-automap-keep-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var idx = this.getAttribute('data-col-idx');
            var sel = tableWrap.querySelector('.organizational-automap-sel[data-col-idx="' + idx + '"]');
            if (sel) { sel.value = '__extra__'; }
            this.textContent = '✓ Custom';
            this.style.background = 'var(--green-bg)';
            this.style.borderColor = 'var(--accent, #2d7a4f)';
            this.style.color = 'inherit';
            this.disabled = true;
          });
        });
      }

      var matched = suggestions.filter(Boolean).length;
      if (statusEl) statusEl.textContent = matched + ' of ' + headers.length + ' columns auto-matched. Unmatched columns (shaded) can be kept as custom fields.';
      openBackdrop();
    }

    function buildJsonPayload(headers, dataRows, mapping) {
      var grants = [];
      for (var r = 0; r < dataRows.length; r++) {
        var inRow = dataRows[r];
        var g = {};
        var extra = {};
        headers.forEach(function (h, i) {
          var dest = mapping[i] || '';
          var val = (inRow[i] || '').trim();
          if (!val) return;
          if (dest === '__extra__') {
            extra[h] = val;
          } else if (dest === 'status') {
            g.status = normalizeStatus(val);
          } else if (dest) {
            g[dest] = val;
          }
        });
        if (Object.keys(extra).length) g.extra_data = extra;
        grants.push(g);
      }
      return grants;
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        var mapping = {};
        if (tableWrap) {
          tableWrap.querySelectorAll('.organizational-automap-sel').forEach(function (sel) {
            mapping[Number(sel.getAttribute('data-col-idx'))] = sel.value || '';
          });
        }
        var grants = buildJsonPayload(pendingHeaders, pendingData, mapping);
        confirmBtn.disabled = true; confirmBtn.textContent = 'Importing…';
        try {
          var res = await fetch(
            '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/import/grants/json',
            { method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ grants: grants }) }
          );
          var json = await res.json();
          if (!res.ok) {
            var msg = (json.errors && json.errors.length)
              ? json.errors.map(function (e) { return 'Row ' + e.row + ': ' + e.message; }).join('\n')
              : (json.error || 'Import failed');
            alert('Import errors:\n' + msg);
          } else {
            var parts = [];
            if (json.inserted) parts.push(json.inserted + ' added');
            if (json.updated)  parts.push(json.updated  + ' updated');
            if (!parts.length) parts.push('No changes');
            closeBackdrop();
            alert('Import complete — ' + parts.join(', ') + '.');
            await loadGrants(currentSlug);
          }
        } catch (e) { alert('Import failed: ' + e.message); }
        finally { confirmBtn.disabled = false; confirmBtn.textContent = 'Import mapped data'; }
      });
    }

    if (cancelBtn) cancelBtn.addEventListener('click', closeBackdrop);
    if (closeBtn)  closeBtn.addEventListener('click', closeBackdrop);
    if (backdrop)  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeBackdrop(); });
  }());

  async function init(slug) {
    currentSlug = slug;
    showError('');
    const org = window.OrganizationalFunders && typeof window.OrganizationalFunders.getOrg === 'function'
      ? window.OrganizationalFunders.getOrg() : null;
    orgFyEndMonth = Number(org && org.fiscal_year_end_month) || 12;

    await loadPrograms(slug);
    await loadRevenueAccounts(slug);
    await loadInstitutionFunders(slug);
    await loadGrants(slug);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (panel && panel.classList.contains('organizational-panel-is-open')) closePanel();
  });

  window.OrganizationalFunders = window.OrganizationalFunders || {};
  window.OrganizationalFunders.grants = {
    init: init,
    grantsFor: function (constituentId) { return grantsCache.filter(function (g) { return Number(g.constituent_id) === Number(constituentId); }); },
    openGrant: function (id) { const g = grantsCache.find(function (x) { return Number(x.id) === Number(id); }); if (g) openPanel(g); },
    programs: function () { return programsCache; },
    reload: function () { return loadGrants(currentSlug); },
    close: closePanel,
  };
})();
