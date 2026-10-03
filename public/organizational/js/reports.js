(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const slugLineEl = document.getElementById('organizational-org-slug-line');
  const roleBadgeEl = document.getElementById('organizational-org-role-badge');
  const reportsFy = document.getElementById('organizational-reports-fy');
  const boardReportA = document.getElementById('organizational-report-board');
  const grantReportsTbody = document.getElementById('organizational-grant-reports-tbody');

  // Panel IDs
  const INDEX_PANEL = 'reports-index';
  const DETAIL_PANELS = [
    'report-detail-board', 'report-detail-990', 'report-detail-activity',
    'report-detail-budget', 'report-detail-giving-summary', 'report-detail-balance-sheet',
    'report-detail-reconciliation',
    'report-detail-financial-position', 'report-detail-statement-of-activities',
    'report-detail-stmt-functional-expenses', 'report-detail-cash-flows',
    'report-detail-trial-balance', 'report-detail-general-ledger',
  ];

  let currentSlug = '';
  let currentRole = '';
  let grantsCache = [];
  let fiscalEndMonth = 12;
  let programsCache = null;

  // ── Panel navigation ───────────────────────────────────────────────────
  function showReport(name) {
    const indexEl = document.getElementById(INDEX_PANEL);
    if (indexEl) indexEl.hidden = true;
    DETAIL_PANELS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = (id !== 'report-detail-' + name);
    });
    // Lazy-load detail content on first open
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
    if (name === 'trial-balance') loadTrialBalance();
    if (name === 'general-ledger') loadGeneralLedger();
  }

  function showReportsIndex() {
    const indexEl = document.getElementById(INDEX_PANEL);
    if (indexEl) indexEl.hidden = false;
    DETAIL_PANELS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
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

  function goToCashForecast() {
    const slug = currentSlug || parseSlug();
    if (!slug) return;
    window.location.href = '/organizational/o/' + encodeURIComponent(slug) + '/reports/cash-forecast';
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
    if (res.status === 403 && String(url || '').indexOf('/api/organizational/') !== -1) {
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
    grantReportsTbody.innerHTML = grantsCache
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
        syncBoardReportLink();
        renderGrantReports();
        // Refresh active detail if open
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

    // Wire Settings › 990 link (appears in both 990 Part IX and Stmt of Functional Expenses panels)
    const s990link = document.getElementById('organizational-990-settings-link');
    if (s990link) s990link.href = '/organizational/o/' + encodeURIComponent(slug) + '/settings/990';
    const sfeLink = document.getElementById('organizational-sfe-settings-link');
    if (sfeLink) sfeLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/settings/990';

    await loadGrants(slug);
    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;
    // Detail panels load lazily when opened. A link such as /reports?report=trial-balance opens one directly
    // (the Accounting dashboard uses this to point at the report that proves its numbers).
    const wantReport = new URLSearchParams(window.location.search).get('report');
    if (wantReport && DETAIL_PANELS.indexOf('report-detail-' + wantReport) >= 0) showReport(wantReport);
  }

  // ── 990 Part IX ────────────────────────────────────────────────────────
  function fmtDollars(cents) {
    const n = Number(cents) / 100;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

    // Cross-link to the live Statement of Financial Position for ledger-sourced orgs, where
    // this snapshot-based view is not the org's authoritative source anymore.
    if (ledgerNotice) {
      const fpCheck = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/financial-position?fiscal_year=' + fiscalYearForReports(),
        { method: 'GET' }
      );
      ledgerNotice.style.display = (fpCheck && fpCheck.res.ok && !fpCheck.data.not_available) ? 'block' : 'none';
    }

    const params = new URLSearchParams();
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

    const order = { asset: 0, liability: 1, equity: 2 };
    const sorted = snapshots.slice().sort(function (a, b) {
      return ((order[a.type] != null ? order[a.type] : 9) - (order[b.type] != null ? order[b.type] : 9))
        || String(a.code || '').localeCompare(String(b.code || ''));
    });

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
    if (meta) meta.textContent = sorted.length + ' accounts · as of ' + activeAsOf;
  }
  // ── End balance sheet ──────────────────────────────────────────────────

  // Initialize header elements
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        // Show coop icon for workers, hide for public users
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    // Bind outside click handlers
    bindOrganizationalDropdownOutsideClick();

    // Escape key handler
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

  // Was stale from before the coop_->org_ table rename and Budget-only (2026-09-16 fix, prompted
  // by a direct question about whether Accounting had an audit trail at all -- it did, via the
  // same shared org_audit_log/logAudit() every module already writes to, but this page's own
  // filter dropdown never got Accounting's tables added and still listed table names nothing
  // writes anymore, making it look emptier than the underlying trail actually is).
  const TABLE_LABELS  = {
    org_budget_lines: 'Budget line', org_schedule_items: 'Schedule item', org_schedules: 'Schedule',
    org_budget_scenarios: 'Scenario', org_budget_scenario_lines: 'Scenario line',
    org_programs: 'Program/activity', org_grant_allocations: 'Grant allocation', org_personnel: 'Personnel',
    org_allocation_schedules: 'Indirect cost schedule',
    org_bills: 'Bill', org_invoices: 'Invoice',
    org_ledger_transactions: 'Ledger transaction', org_ledger_lines: 'Ledger line',
    org_expense_claims: 'Expense claim', org_documents: 'Document',
    org_fiscal_year_locks: 'Fiscal year lock', org_sponsored_project_disbursements: 'Sponsored project disbursement',
  };
  const FIELD_LABELS  = {
    amount_cents: 'Amount', unit_amount_cents: 'Unit amount', label: 'Label',
    notes: 'Notes', frequency: 'Frequency', quantity: 'Quantity',
    start_month: 'Start month', end_month: 'End month', status: 'Status',
    name: 'Name', schedule_type: 'Type', sort_order: 'Sort order',
    is_override: 'Override?', source_type: 'Source',
  };
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtAuditValue(field, val) {
    if (val === null || val === undefined || val === '') return '—';
    if (String(field).endsWith('_cents')) {
      const n = Number(val);
      if (!Number.isNaN(n)) return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  // ── End audit log ──────────────────────────────────────────────────────

  // ── Financial views ────────────────────────────────────────────────────
  //
  // mode='summary'  → Account | Budget | YTD Actual | Forecast | Variance (5 cols)
  // mode='monthly'  → Account | Jan(Bgt/Actl/Fcst) | … | Dec(B/A/F) | Total(B/A/F) (40 cols)

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function parseCents(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function fyMonthIndices(endMonth) {
    const start = endMonth % 12;
    return Array.from({ length: 12 }, function (_, i) { return (start + i) % 12; });
  }

  // ── Programs ──

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

  // ── Account tree ──

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

  // ── Budget view state ──

  const budgetState = { mode: 'summary', programId: '', showZeroRows: false, showCents: false, showAccountCodes: false };
  let budgetData = null;

  // ── Format helpers ──

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
    if (d < 0) return '−$' + abs.toLocaleString('en-US', opts);
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
    return budgetState.mode === 'summary' ? 5 : 40; // 40 = 1 account + 12×3 months + 3 total
  }

  // ── Data fetch ──

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

  // ── Thead ──

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
      // Monthly: B.7 layout — Account + Annual B/A/F frozen left, months scroll right
      // Row 1: Account | FY Total (colspan=3) | Jan | … | Dec  (each colspan=3)
      // Row 2: (blank) | Budget | Actual | Forecast | Bgt | Actl | Fcst × 12
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

  // ── Summary (annual) row rendering ──

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

  // ── Monthly detail row rendering (B.7 layout) ──
  // Col 1: Account (frozen) | Col 2: Annual Budget (frozen) | Col 3: Annual Actual (frozen)
  // Col 4: Annual Forecast (frozen, separator) | Cols 5+: Jan→Dec each B/A/F (scroll)

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
    const s = d > 0 ? '+$' : d < 0 ? '−$' : '$';
    const clr = n < 0 ? 'color:var(--organizational-status-warning);' : '';
    const clsAttr = cls ? ' class="' + cls + '"' : '';
    return '<td' + clsAttr + ' style="' + MR + bdr + clr + '">' + s + abs.toLocaleString('en-US', opts) + '</td>';
  }

  // B.7 layout: col1=Account (frozen) | col2=AnnualBudget (frozen) | col3=AnnualActual (frozen)
  //             col4=AnnualForecast (frozen, separator) | Jan B|A|F … Dec B|A|F (scroll)
  // NCOLS = 1 + 3 + 12×3 = 40
  const MONTHLY_NCOLS = 40;

  // isTotal=true → show $; false → posting row (no $ sign)
  function mColAnnual(cents, cls, isTotal) {
    const val = isTotal ? fmtBR(cents) : fmtBRNum(cents);
    return '<td class="organizational-budget-col-num ' + cls + '">' + val + '</td>';
  }

  // Posting monthly cells — no $ sign
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

  // ── Main render ──

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
      const netVarStyle = netVar < 0 ? 'color:var(--organizational-status-warning);' : '';
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
      // Monthly net position row — B.7 layout: annual totals frozen (cols 2-4), months scrolling
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
    // Defer scroll setup one tick so DOM measurements are accurate
    setTimeout(syncBrScroll, 0);
  }

  // ── Load ──

  async function loadBudgetReport() {
    const tbody = document.getElementById('organizational-br-tbody');
    if (!tbody || !currentSlug) return;

    await loadReportsPrograms();
    fillProgramSelect(document.getElementById('organizational-br-program'));

    tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + totalCols() + '">Loading…</td></tr>';
    const data = await fetchBudgetData();
    if (!data) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + totalCols() + '">Could not load data. Check Xero connection and budget entries.</td></tr>';
      return;
    }
    renderBudgetReport(data);
  }

  // ── Toggles ──

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

  // ── Top scrollbar + sticky header scroll setup ──

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

    // Set top-scrollbar inner width to match full table width
    const topScrollInner = document.getElementById('organizational-br-top-scroll-inner');
    const table = grid.querySelector('table');
    if (topScrollInner && table) {
      topScrollInner.style.width = table.scrollWidth + 'px';
    }

    // Set grid max-height to fill viewport below the sticky header
    const stickyHeader = document.querySelector('.organizational-br-sticky-header');
    if (stickyHeader) {
      const bottom = stickyHeader.getBoundingClientRect().bottom;
      grid.style.maxHeight = Math.max(window.innerHeight - bottom - 4, 200) + 'px';
    }

    // Store row-1 height so CSS can offset row-2 sticky top
    const row1 = grid.querySelector('.organizational-budget-monthly-header-1');
    if (row1 && table) {
      table.style.setProperty('--br-thead-r1-h', row1.offsetHeight + 'px');
    }

    wireBrTopScroll();
  }

  // ── Wire filters ──

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

  // ── CSV export ──

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
      const current = sel.value;
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

  // Wire campaign filter change
  var givingSummaryCampaignFilter = document.getElementById('organizational-giving-campaign-filter');
  if (givingSummaryCampaignFilter) {
    givingSummaryCampaignFilter.addEventListener('change', loadGivingSummary);
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

  // Statement of Financial Position
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

    var d = out.data;
    var html = '';

    function sectionHeader(label) {
      return '<tr style="background:var(--surface-active);"><td colspan="3" style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">' + escapeHtml(label) + '</td></tr>';
    }
    function totalRow(label, cents) {
      return '<tr style="font-weight:600;border-top:1px solid var(--border);"><td colspan="2">' + escapeHtml(label) + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(cents) + '</td></tr>';
    }
    function accountRow(code, name, cents) {
      return '<tr><td>' + escapeHtml(name) + '</td><td style="color:var(--text-secondary);">' + escapeHtml(code || '') + '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(cents) + '</td></tr>';
    }

    html += sectionHeader('Assets');
    (d.assets || []).forEach(function(r) { html += accountRow(r.code, r.name, r.balance_cents); });
    html += totalRow('Total assets', d.total_assets_cents);

    html += sectionHeader('Liabilities');
    (d.liabilities || []).forEach(function(r) { html += accountRow(r.code, r.name, r.balance_cents); });
    html += totalRow('Total liabilities', d.total_liabilities_cents);

    html += sectionHeader('Net Assets');
    var na = d.net_assets || {};
    html += accountRow('', 'Without donor restrictions', na.without_restrictions_cents || 0);
    if (na.board_designated_cents) {
      html += '<tr><td style="padding-left:28px;color:var(--text-secondary);">of which: board-designated</td><td></td><td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary);">' + fmtDollars(na.board_designated_cents) + '</td></tr>';
    }
    html += accountRow('', 'With donor restrictions', na.with_restrictions_cents || 0);
    html += totalRow('Total net assets', na.total_cents || 0);

    html += '<tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="2">Total liabilities and net assets</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(d.total_liabilities_and_net_assets_cents) + '</td></tr>';

    tbody.innerHTML = html;
    if (meta) meta.textContent = 'As of end of FY' + fy + ' · Ledger-sourced';

    // Footnote: temp/perm split
    var rd = d.restriction_detail || {};
    var tempCents = rd.temporarily_restricted_cents || 0;
    var permCents = rd.permanently_restricted_cents || 0;
    if ((tempCents || permCents) && footnote) {
      footnote.innerHTML = '<strong>Restriction detail (with donor restrictions):</strong> ' +
        'Temporarily restricted ' + fmtDollars(tempCents) + ' · ' +
        'Permanently restricted ' + fmtDollars(permCents);
    }
  }

  // Statement of Activities
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

    var d = out.data;
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
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(woCents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(wCents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(totalCents) + '</td></tr>';
    }
    function accountRow(code, name, woCents, wCents) {
      return '<tr>' +
        '<td>' + escapeHtml(name) + '</td>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(code || '') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + (woCents != null ? fmtDollars(woCents) : '—') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + (wCents != null ? fmtDollars(wCents) : '—') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars((woCents || 0) + (wCents || 0)) + '</td></tr>';
    }

    // Revenue section
    html += sectionHeader('Revenue');
    var revByAccount = {};
    (d.revenue || []).forEach(function(r) {
      if (!revByAccount[r.account_id]) revByAccount[r.account_id] = { code: r.code, name: r.name, without: 0, with: 0 };
      if (r.restriction_bucket === 'with_restrictions') revByAccount[r.account_id].with += Number(r.amount_cents);
      else revByAccount[r.account_id].without += Number(r.amount_cents);
    });
    Object.values(revByAccount).forEach(function(r) {
      html += accountRow(r.code, r.name, r.without || null, r.with || null);
    });
    html += totalRow('Total revenue', t.revenue_without_restrictions_cents || 0, t.revenue_with_restrictions_cents || 0, t.total_revenue_cents || 0, false);

    // Expenses section
    html += sectionHeader('Expenses');
    (d.expenses || []).forEach(function(r) {
      html += accountRow(r.code, r.name, Number(r.amount_cents), null);
    });
    html += totalRow('Total expenses', t.total_expenses_cents || 0, 0, t.total_expenses_cents || 0, false);

    // Change in net assets
    html += sectionHeader('Change in Net Assets');
    html += totalRow('Change in net assets', t.change_without_restrictions_cents || 0, t.change_with_restrictions_cents || 0, t.total_change_in_net_assets_cents || 0, false);

    // Net assets rollforward
    html += sectionHeader('Net Assets');
    html += '<tr><td>Beginning of year</td><td></td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(beg.without_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(beg.with_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(beg.total_cents || 0) + '</td></tr>';
    html += '<tr style="font-weight:700;border-top:2px solid var(--border);"><td>End of year</td><td></td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(end.without_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(end.with_restrictions_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(end.total_cents || 0) + '</td></tr>';

    tbody.innerHTML = html;
    if (meta) meta.textContent = 'FY' + fy + ' · Ledger-sourced';
  }

  // Statement of Functional Expenses
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
    var totals = d.totals || {};

    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No expense accounts with posted activity for FY' + fy + '.</td></tr>';
      if (meta) meta.textContent = 'No data for FY' + fy;
      return;
    }

    var html = lines.map(function(l) {
      return '<tr>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(l.code || '—') + '</td>' +
        '<td>' + escapeHtml(l.name || '—') + (l.missing_classification ? ' <span style="color:var(--organizational-status-warning);font-size:11px;" title="Allocations not set">⚠</span>' : '') + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(l.total_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(l.program_services_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(l.mgmt_general_cents) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(l.fundraising_cents) + '</td>' +
        '</tr>';
    }).join('');

    html += '<tr style="font-weight:600;border-top:2px solid var(--border);">' +
      '<td colspan="2">Total</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(totals.total_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(totals.program_services_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(totals.mgmt_general_cents || 0) + '</td>' +
      '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + fmtDollars(totals.fundraising_cents || 0) + '</td>' +
      '</tr>';

    tbody.innerHTML = html;
    if (meta) meta.textContent = lines.length + ' expense accounts · FY' + fy;
  }


  // ── Trial Balance and General Ledger (ledger-sourced, work for every org) ──
  function money2(cents) {
    var n = Number(cents) / 100;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dollarCell(cents, zeroDash) {
    if (zeroDash && Number(cents) === 0) return '';
    return '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + escapeHtml(money2(cents)) + '</td>';
  }

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
    if (!d.lines.length && !d.prior_year_result) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">No posted ledger activity through ' + escapeHtml(d.as_of) + '.</td></tr>';
      if (meta) meta.textContent = '';
      return;
    }
    var html = d.lines.map(function (l) {
      return '<tr><td style="color:var(--text-secondary);">' + escapeHtml(l.code) + '</td><td>' + escapeHtml(l.name) + '</td>' +
        '<td style="color:var(--text-secondary);">' + escapeHtml(l.type) + '</td>' + (Number(l.debit_cents) ? dollarCell(l.debit_cents) : '<td></td>') +
        (Number(l.credit_cents) ? dollarCell(l.credit_cents) : '<td></td>') + '</tr>';
    }).join('');
    if (d.prior_year_result) {
      var p = d.prior_year_result;
      html += '<tr><td></td><td colspan="2" style="font-style:italic;">' + escapeHtml(p.name) + '</td>' +
        (Number(p.debit_cents) ? dollarCell(p.debit_cents) : '<td></td>') + (Number(p.credit_cents) ? dollarCell(p.credit_cents) : '<td></td>') + '</tr>';
    }
    html += '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="3">Total</td>' + dollarCell(d.totals.debit_cents) + dollarCell(d.totals.credit_cents) + '</tr>';
    tbody.innerHTML = html;
    if (meta) meta.textContent = (d.in_balance ? '✓ In balance' : '✗ OUT OF BALANCE by $' + money2(Math.abs(Number(d.totals.debit_cents) - Number(d.totals.credit_cents)))) + ' · as of ' + d.as_of + ' · FY' + d.fiscal_year;
  }

  var glAccountsLoaded = false;
  async function loadGeneralLedgerAccounts() {
    if (glAccountsLoaded || !currentSlug) return;
    var sel = document.getElementById('organizational-gl-account');
    if (!sel) return;
    var out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/accounts', { method: 'GET' });
    var list = out && out.res.ok && Array.isArray(out.data.accounts) ? out.data.accounts : (out && out.res.ok && Array.isArray(out.data) ? out.data : []);
    list.filter(function (a) { return a.is_posting && !a.is_statistical; }).forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.code + ' — ' + a.name;
      sel.appendChild(o);
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
    if (!d.accounts.length) {
      body.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">No posted activity in this range.</p>';
      if (meta) meta.textContent = '';
      return;
    }
    var slugBase = '/organizational/o/' + encodeURIComponent(currentSlug);
    body.innerHTML = d.accounts.map(function (a) {
      var rows = '<tr style="background:var(--surface-hover);font-weight:600;"><td colspan="7">Opening balance</td>' + dollarCell(a.opening_cents) + '</tr>';
      rows += a.lines.map(function (l) {
        return '<tr><td style="white-space:nowrap;">' + escapeHtml(l.date) + '</td>' +
          '<td><a href="' + slugBase + '/transactions?txn=' + encodeURIComponent(l.transaction_id) + '">#' + escapeHtml(l.transaction_id) + '</a></td>' +
          '<td>' + escapeHtml(l.payee || '') + (l.payee && (l.line_memo || l.memo) ? ' — ' : '') + escapeHtml(l.line_memo || l.memo || '') + '</td>' +
          '<td>' + escapeHtml(l.program || '') + '</td><td>' + escapeHtml(l.grant || '') + '</td>' +
          (Number(l.debit_cents) ? dollarCell(l.debit_cents) : '<td></td>') + (Number(l.credit_cents) ? dollarCell(l.credit_cents) : '<td></td>') +
          dollarCell(l.balance_cents) + '</tr>';
      }).join('');
      rows += '<tr style="font-weight:600;border-top:2px solid var(--border);"><td colspan="5">Closing balance</td>' + dollarCell(a.total_debit_cents) + dollarCell(a.total_credit_cents) + dollarCell(a.closing_cents) + '</tr>';
      return '<div style="padding:12px 16px 4px;font-weight:600;">' + escapeHtml(a.code) + ' — ' + escapeHtml(a.name) +
        ' <span class="organizational-hint" style="font-weight:400;">(' + escapeHtml(a.natural_side) + ' account)</span></div>' +
        '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="' + escapeHtml(a.name) + '"><thead><tr><th>Date</th><th>Txn</th><th>Payee / memo</th><th>Program</th><th>Grant</th>' +
        '<th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('');
    if (meta) meta.textContent = d.accounts.length + ' account' + (d.accounts.length === 1 ? '' : 's') + ' · ' + d.line_count + ' lines' + (d.truncated ? ' · stopped at ' + d.line_cap + ' lines, narrow the dates or pick one account' : '');
  }

  // Statement of Cash Flows
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

  // Expose functions globally
  window.showReport = showReport;
  window.showReportsIndex = showReportsIndex;
  window.goToCashForecast = goToCashForecast;
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
  window.loadGeneralLedger = loadGeneralLedger;

  load().catch(function(e) {
    if (loadingEl) loadingEl.hidden = true;
    showError("Could not load reports.");
    console.error("Reports load error:", e);
  });
})();
