(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const titleEl = document.getElementById('organizational-org-title');

  const comingUpEl = document.getElementById('organizational-compliance-coming-up');
  const overdueEl = document.getElementById('organizational-compliance-overdue');
  const allObligationsEl = document.getElementById('organizational-compliance-all');
  const addObligationBtn = document.getElementById('organizational-compliance-add-obligation');

  const filterCategory = document.getElementById('organizational-compliance-filter-category');
  const filterSource = document.getElementById('organizational-compliance-filter-source');
  const filterStatus = document.getElementById('organizational-compliance-filter-status');

  const modal = document.getElementById('organizational-compliance-modal');
  const form = document.getElementById('organizational-compliance-form');
  const editId = document.getElementById('organizational-compliance-edit-id');
  const title = document.getElementById('organizational-compliance-title');
  const description = document.getElementById('organizational-compliance-description');
  const category = document.getElementById('organizational-compliance-category');
  const frequency = document.getElementById('organizational-compliance-frequency');
  const dueDate = document.getElementById('organizational-compliance-due-date');
  const notes = document.getElementById('organizational-compliance-notes');
  const cancelBtn = document.getElementById('organizational-compliance-cancel');
  const saveBtn = document.getElementById('organizational-compliance-save');

  const detailModal = document.getElementById('organizational-compliance-detail-modal');
  const detailTitle = document.getElementById('organizational-compliance-detail-title');
  const detailContent = document.getElementById('organizational-compliance-detail-content');
  const detailClose = document.getElementById('organizational-compliance-detail-close');

  const proposalModal = document.getElementById('organizational-compliance-proposal-modal');
  const proposalYes = document.getElementById('organizational-compliance-proposal-yes');
  const proposalNo = document.getElementById('organizational-compliance-proposal-no');

  // 990 elements
  const fy990Select = document.getElementById('organizational-990-fy');
  const partIXEl = document.getElementById('organizational-990-part-ix');
  const scheduleDEl = document.getElementById('organizational-990-schedule-d');
  const scheduleJEl = document.getElementById('organizational-990-schedule-j');
  // Meter slots live in each card's always-visible header, not the collapsible body, so
  // completeness shows in the closed/summary state (2026-09-11).
  const partIXMeterEl = document.getElementById('organizational-990-part-ix-meter');
  const scheduleDMeterEl = document.getElementById('organizational-990-schedule-d-meter');
  const scheduleJMeterEl = document.getElementById('organizational-990-schedule-j-meter');
  const partIXCsvLink = document.getElementById('organizational-990-part-ix-csv');

  let currentSlug = '';
  let currentIsOrgAdmin = false;
  let allObligationsData = [];
  let pendingProposalObligationId = null;
  let activeTab = 'tab-990';

  // 990 functional-expense classification editor — moved from Settings' "990 Expense" tab
  // (2026-09-11) to sit next to the Part IX card it feeds. FY input renamed to
  // organizational-990-classify-fy to avoid colliding with this page's own organizational-990-fy
  // (the shared Part IX/Schedule D/J fiscal-year selector).
  let _990data = [];
  let _990tbody = null;
  let _990saveBtn = null;
  let _990statusEl = null;
  let _990csvLink = null;
  let _990fyEl = null;

  // ─── Utilities ─────────────────────────────────────────────────────────────

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/compliance\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDollars(cents) {
    if (cents == null) return '—';
    const abs = Math.abs(Number(cents));
    const sign = Number(cents) < 0 ? '-' : '';
    return sign + '$' + (abs / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function pct(bps) {
    return ((Number(bps) || 0) / 100).toFixed(0) + '%';
  }

  function getStatusLabel(status) {
    const labels = {
      upcoming: 'Upcoming',
      due_soon: 'Due soon',
      overdue: 'Overdue',
      completed_this_cycle: 'Completed this cycle',
      not_applicable: 'Not applicable'
    };
    return labels[status] || status;
  }

  function getStatusColor(status) {
    const colors = {
      upcoming: '#10b981',
      due_soon: '#f59e0b',
      overdue: '#ef4444',
      completed_this_cycle: '#6b7280',
      not_applicable: '#9ca3af'
    };
    return colors[status] || '#6b7280';
  }

  function getSourceLabel(source) {
    return source === 'base_template' ? 'From cooperative' : 'Org-specific';
  }

  // ─── Tab switching ──────────────────────────────────────────────────────────

  const TAB_TITLES = { 'tab-990': 'IRS Form 990', 'tab-obligations': 'Obligations' };

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.organizational-tab-panel').forEach(panel => {
      panel.hidden = panel.id !== tabId;
    });
    document.querySelectorAll('.organizational-tab-trigger').forEach(btn => {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isActive);
    });
    if (titleEl && TAB_TITLES[tabId]) titleEl.textContent = 'Compliance | ' + TAB_TITLES[tabId];

    if (tabId === 'tab-990' && currentSlug) {
      const fy = Number(fy990Select ? fy990Select.value : 2025);
      load990(currentSlug, fy);
    }
  }

  // ─── 990 data loading ───────────────────────────────────────────────────────

  async function load990(slug, fy) {
    if (!slug || !fy) return;
    if (partIXEl) partIXEl.innerHTML = '<p class="organizational-empty">Loading…</p>';
    if (scheduleDEl) scheduleDEl.innerHTML = '<p class="organizational-empty">Loading…</p>';
    if (scheduleJEl) scheduleJEl.innerHTML = '<p class="organizational-empty">Loading…</p>';

    if (partIXCsvLink) {
      partIXCsvLink.href = `/api/organizational/orgs/${encodeURIComponent(slug)}/reports/990-part-ix?fiscal_year=${fy}&format=csv`;
    }

    try {
      const [partIXRes, scheduleDRes, personnelRes] = await Promise.all([
        fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/reports/990-part-ix?fiscal_year=${fy}`, { credentials: 'include' }),
        fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/fixed-assets/schedule-d?fiscal_year=${fy}`, { credentials: 'include' }),
        fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/personnel?fiscal_year=${fy}`, { credentials: 'include' }),
      ]);

      const partIXData = partIXRes.ok ? await partIXRes.json() : null;
      const scheduleDData = scheduleDRes.ok ? await scheduleDRes.json() : null;
      const personnelData = personnelRes.ok ? await personnelRes.json() : null;

      renderPartIX(partIXData);
      renderScheduleD(scheduleDData);
      renderScheduleJ(personnelData, fy);
    } catch (e) {
      console.error('load990:', e);
      if (partIXEl) partIXEl.innerHTML = '<p class="organizational-error">Could not load 990 data.</p>';
    }
  }

  function renderComplianceMeter(pct, detail) {
    const color = pct >= 100 ? 'var(--green, #1a7a4a)' : pct >= 75 ? 'var(--amber, #e07b00)' : 'var(--red, #c0392b)';
    return `
      <div class="organizational-compliance-meter">
        <div class="organizational-compliance-meter-pct" style="color: ${color};">${pct}%</div>
        <div class="organizational-compliance-meter-body">
          <div class="organizational-compliance-meter-bar"><div class="organizational-compliance-meter-fill" style="width: ${pct}%; background: ${color};"></div></div>
          <div class="organizational-compliance-meter-detail">${detail}</div>
        </div>
      </div>`;
  }

  function renderPartIX(data) {
    if (!partIXEl) return;
    if (!data || !data.lines || !data.lines.length) {
      partIXEl.innerHTML = '<p class="organizational-empty">No expense data for this fiscal year. Enter budget lines or actuals first.</p>';
      if (partIXMeterEl) partIXMeterEl.innerHTML = '';
      return;
    }

    const lines = data.lines;
    const totals = data.totals || {};

    const unclassifiedCount = lines.filter(l => (l.program_services_bps + l.mgmt_general_bps + l.fundraising_bps) !== 10000).length;
    const classifiedPct = Math.round(((lines.length - unclassifiedCount) / lines.length) * 100);
    const meterDetail = unclassifiedCount
      ? `${lines.length - unclassifiedCount} of ${lines.length} accounts fully classified — ${unclassifiedCount} don't sum to 100% <a href="#" onclick="event.stopPropagation(); event.preventDefault(); toggle990Accordion('classify');" style="color: var(--organizational-accent);">Fix →</a>`
      : `All ${lines.length} accounts fully classified`;
    if (partIXMeterEl) partIXMeterEl.innerHTML = renderComplianceMeter(classifiedPct, meterDetail);

    const rows = lines.map(l => {
      const unclassified = (l.program_services_bps + l.mgmt_general_bps + l.fundraising_bps) !== 10000;
      return `<tr${unclassified ? ' style="background: #fff8f0;"' : ''}>
        <td style="font-size: 0.8125rem; color: var(--text-secondary);">${escapeHtml(l.code || '')}</td>
        <td>${escapeHtml(l.name)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(l.total_cents)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(l.program_services_cents)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(l.mgmt_general_cents)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(l.fundraising_cents)}</td>
        <td style="text-align: center; font-size: 0.8125rem;">${unclassified ? '<span style="color:#ef4444;" title="Allocation bps do not sum to 100%">⚠</span>' : ''}</td>
      </tr>`;
    }).join('');

    partIXEl.innerHTML = `
      <div style="overflow-x: auto;">
        <table class="organizational-table" style="min-width: 640px;">
          <thead>
            <tr>
              <th style="width: 70px;">Code</th>
              <th>Expense account</th>
              <th style="text-align: right; width: 110px;">Total</th>
              <th style="text-align: right; width: 130px;">Program Services</th>
              <th style="text-align: right; width: 130px;">Mgmt &amp; General</th>
              <th style="text-align: right; width: 110px;">Fundraising</th>
              <th style="width: 36px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="font-weight: 700; background: var(--bg-subtle);">
              <td colspan="2">Total</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.total_cents)}</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.program_services_cents)}</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.mgmt_general_cents)}</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.fundraising_cents)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="organizational-hint" style="margin-top: 8px;">⚠ = classification basis points do not sum to 100%. <a href="#" onclick="event.preventDefault(); toggle990Accordion('classify');" style="color: var(--organizational-accent);">Edit classifications →</a></p>`;
  }

  // Reads the real per-asset register (org_fixed_assets + org_fixed_asset_depreciation_entries)
  // via server/organizational/routes/fixedAssets.js's schedule-d endpoint -- replaces the old
  // balance-sheet-snapshot guess (hardcoded 1400-1499 account-code range + a name-string check
  // for "depreciation"), which had no register behind it at all. See
  // .claude/plans/2026-09-14-fixed-assets-depreciation-spec.md.
  function renderScheduleD(data) {
    if (!scheduleDEl) return;
    if (!data || !data.assets || !data.assets.length) {
      scheduleDEl.innerHTML = '<p class="organizational-empty">No fixed assets registered yet as of this fiscal year-end. Add one in Accounting → Fixed Assets.</p>';
      if (scheduleDMeterEl) scheduleDMeterEl.innerHTML = '';
      return;
    }

    const asOf = data.as_of_date ? new Date(data.as_of_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    if (scheduleDMeterEl) scheduleDMeterEl.innerHTML = renderComplianceMeter(100, `${data.assets.length} asset${data.assets.length === 1 ? '' : 's'}, as of ${escapeHtml(asOf)}`);

    const rows = data.assets.map(a => `<tr>
        <td style="font-size: 0.8125rem; color: var(--text-secondary);">${escapeHtml(a.asset_account_code || '')}</td>
        <td>${escapeHtml(a.name)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(a.cost_cents)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(a.accumulated_depreciation_cents)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(a.net_book_value_cents)}</td>
      </tr>`).join('');

    const totals = data.totals || {};
    scheduleDEl.innerHTML = `
      <div style="overflow-x: auto;">
        <table class="organizational-table">
          <thead>
            <tr>
              <th style="width: 70px;">Code</th>
              <th>Asset</th>
              <th style="text-align: right; width: 130px;">Cost Basis</th>
              <th style="text-align: right; width: 130px;">Accum. Depr.</th>
              <th style="text-align: right; width: 130px;">Book Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr style="font-weight: 700; background: var(--bg-subtle);">
              <td colspan="2">Total</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.cost_cents)}</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.accumulated_depreciation_cents)}</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totals.net_book_value_cents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="organizational-hint" style="margin-top: 8px;">Cost basis and accumulated depreciation from the fixed asset register (Accounting → Fixed Assets), not a balance-sheet estimate. Assets acquired before this register existed won't appear here until re-entered there.</p>`;
  }

  function renderScheduleJ(data, fy) {
    if (!scheduleJEl) return;
    if (!data || !data.personnel || !data.personnel.length) {
      scheduleJEl.innerHTML = '<p class="organizational-empty">No personnel records for this fiscal year.</p>';
      if (scheduleJMeterEl) scheduleJMeterEl.innerHTML = '';
      return;
    }

    const employees = data.personnel.filter(p => p.worker_type === 'employee');
    if (!employees.length) {
      scheduleJEl.innerHTML = '<p class="organizational-empty">No employee records for this fiscal year.</p>';
      if (scheduleJMeterEl) scheduleJMeterEl.innerHTML = '';
      return;
    }

    // Sort by projected total compensation descending
    employees.sort((a, b) => (b.projected_annual_cents || 0) - (a.projected_annual_cents || 0));

    const threshold990J = 15000000; // $150,000 in cents — 990-J reportable threshold

    const rows = employees.map(p => {
      const baseSalary = p.annual_salary_cents || 0;
      const totalComp = p.projected_annual_cents || 0;
      const fringe = totalComp - baseSalary;
      const reportable = totalComp >= threshold990J;
      const hours = p.avg_hours_per_week != null ? p.avg_hours_per_week : null;
      return `<tr${reportable ? '' : ' style="color: var(--text-secondary);"'}>
        <td>${escapeHtml(p.full_name || '—')}</td>
        <td>${escapeHtml(p.title || '—')}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${hours != null ? hours : '<span title="No avg hours/week on file for this position — required for Schedule J Part I line 1a">—</span>'}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(baseSalary)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(fringe > 0 ? fringe : 0)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: ${reportable ? '600' : '400'};">${fmtDollars(totalComp)}</td>
        <td style="text-align: center; font-size: 0.8125rem;">${reportable ? '<span style="color: var(--text-secondary);">✓</span>' : ''}</td>
      </tr>`;
    }).join('');

    const totalComp = employees.reduce((sum, p) => sum + (p.projected_annual_cents || 0), 0);
    const reportableCount = employees.filter(p => (p.projected_annual_cents || 0) >= threshold990J).length;
    if (scheduleJMeterEl) scheduleJMeterEl.innerHTML = renderComplianceMeter(100, `${employees.length} employee${employees.length === 1 ? '' : 's'}, ${reportableCount} flagged 990-J`);

    scheduleJEl.innerHTML = `
      <div style="overflow-x: auto;">
        <table class="organizational-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th style="text-align: right; width: 90px;">Avg Hrs/Wk</th>
              <th style="text-align: right; width: 120px;">Base Salary</th>
              <th style="text-align: right; width: 110px;">Benefits &amp; Fringe</th>
              <th style="text-align: right; width: 120px;">Total Comp (est.)</th>
              <th style="width: 60px; text-align: center;">990-J</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="font-weight: 700; background: var(--bg-subtle);">
              <td colspan="5">Total employee compensation</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">${fmtDollars(totalComp)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="organizational-hint" style="margin-top: 8px;">990-J ✓ = estimated total compensation exceeds $150,000 (the reportable threshold). Avg Hrs/Wk feeds Schedule J Part I line 1a ("average hours per week devoted to position") — set per employee in Personnel. Amounts are projections based on budget-year salary and fringe settings.</p>`;
  }

  // ─── Obligations ────────────────────────────────────────────────────────────

  function renderObligationCard(obligation, showCompleteCheckbox = false) {
    const sourceColor = obligation.source === 'base_template' ? '#3b82f6' : '#8b5cf6';
    const sourceBadge = `<span class="organizational-badge organizational-badge--tag" style="font-size: 0.8125rem;"><span class="organizational-badge-dot" style="background:${sourceColor};"></span>${escapeHtml(getSourceLabel(obligation.source))}</span>`;
    const statusColor = getStatusColor(obligation.status);
    const statusBadge = `<span class="organizational-badge organizational-badge--tag" style="font-size: 0.8125rem;"><span class="organizational-badge-dot" style="background:${statusColor};"></span>${escapeHtml(getStatusLabel(obligation.status))}</span>`;
    const docCount = Number(obligation.document_count) || 0;
    const docBadge = docCount > 0 ? `<span class="organizational-badge">${docCount} document${docCount === 1 ? '' : 's'}</span>` : '';

    return `<div class="organizational-card" style="padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div style="font-weight: 600; font-size: 1.0625rem;">${escapeHtml(obligation.title)}</div>
        <div style="display: flex; gap: 8px;">${sourceBadge}${statusBadge}${docBadge}</div>
      </div>
      <div style="font-size: 0.9375rem; margin-bottom: 8px;">${escapeHtml(obligation.description || '')}</div>
      <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;">
        ${obligation.next_due_date ? `Due: ${formatDate(obligation.next_due_date)} (${escapeHtml(obligation.relative_due_date || '')})` : 'No due date'}
      </div>
      <div style="margin-top: 12px;">
        <button type="button" class="organizational-btn organizational-btn-outline organizational-compliance-view-btn" data-obligation-id="${obligation.id}" style="padding: 4px 12px; font-size: 0.8125rem; margin-right: 8px;">View details</button>
        ${showCompleteCheckbox ? `<button type="button" class="organizational-btn organizational-compliance-complete-btn" data-obligation-id="${obligation.id}" style="padding: 4px 12px; font-size: 0.8125rem;">Mark complete</button>` : ''}
        ${obligation.source === 'org_extension' ? `<button type="button" class="organizational-btn organizational-btn-outline organizational-compliance-delete-btn" data-obligation-id="${obligation.id}" style="padding: 4px 12px; font-size: 0.8125rem; margin-left: 8px;">Delete</button>` : ''}
      </div>
    </div>`;
  }

  async function loadDashboard() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/dashboard`, {
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError('Could not load compliance dashboard.');
        return;
      }

      allObligationsData = data.all_obligations || [];

      const comingUp = data.coming_up || [];
      if (comingUpEl) {
        comingUpEl.innerHTML = comingUp.length === 0
          ? '<p class="organizational-empty">No upcoming obligations in the next 90 days.</p>'
          : comingUp.map(o => renderObligationCard(o, true)).join('');
      }

      const overdue = data.overdue || [];
      if (overdueEl) {
        overdueEl.innerHTML = overdue.length === 0
          ? '<p class="organizational-empty">No overdue obligations.</p>'
          : overdue.map(o => renderObligationCard(o, true)).join('');
      }

      renderAllObligations(allObligationsData);
      wireViewButtons();
      wireCompleteButtons();
      wireDeleteButtons();
    } catch (e) {
      console.error('loadDashboard:', e);
      showError('Could not load compliance dashboard.');
    }
  }

  function renderAllObligations(obligations) {
    const categoryFilter = filterCategory ? filterCategory.value : '';
    const sourceFilter = filterSource ? filterSource.value : '';
    const statusFilter = filterStatus ? filterStatus.value : '';

    const filtered = obligations.filter(o => {
      if (categoryFilter && o.category !== categoryFilter) return false;
      if (sourceFilter && o.source !== sourceFilter) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      return true;
    });

    if (allObligationsEl) {
      allObligationsEl.innerHTML = filtered.length === 0
        ? '<p class="organizational-empty">No obligations match the current filters.</p>'
        : filtered.map(o => renderObligationCard(o, true)).join('');
    }

    wireViewButtons();
    wireCompleteButtons();
    wireDeleteButtons();
  }

  function wireViewButtons() {
    document.querySelectorAll('.organizational-compliance-view-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        viewObligationDetail(this.getAttribute('data-obligation-id'));
      });
    });
  }

  function wireCompleteButtons() {
    document.querySelectorAll('.organizational-compliance-complete-btn').forEach(btn => {
      btn.addEventListener('click', async function () {
        await markComplete(this.getAttribute('data-obligation-id'));
      });
    });
  }

  function wireDeleteButtons() {
    document.querySelectorAll('.organizational-compliance-delete-btn').forEach(btn => {
      btn.addEventListener('click', async function () {
        if (confirm('Delete this obligation?')) {
          await deleteObligation(this.getAttribute('data-obligation-id'));
        }
      });
    });
  }

  async function viewObligationDetail(id) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/obligations/${id}`, {
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError('Could not load obligation detail.');
        return;
      }

      const obligation = data.obligation;
      const history = data.completion_history || [];

      if (detailTitle) detailTitle.textContent = obligation.title;
      if (detailContent) {
        let html = `<div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Description</h4>
          <p style="margin: 0;">${escapeHtml(obligation.description || 'No description')}</p>
        </div>`;

        if (obligation.template_content) {
          html += `<div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">Guidance from cooperative</h4>
            <div style="background: var(--bg-subtle); padding: 12px; border-radius: 8px; font-size: 0.9375rem; line-height: 1.6;">
              ${escapeHtml(obligation.template_content.guidance_markdown || 'No guidance available')}
            </div>
          </div>`;
        }

        html += `<div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Your notes</h4>
          <p style="margin: 0;">${escapeHtml(obligation.notes_markdown || 'No notes')}</p>
        </div>`;

        html += `<div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Due date</h4>
          <p style="margin: 0;">${obligation.next_due_date ? formatDate(obligation.next_due_date) : 'No due date'}</p>
        </div>`;

        html += `<div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Frequency</h4>
          <p style="margin: 0;">${escapeHtml(obligation.frequency || '')}</p>
        </div>`;

        if (history.length > 0) {
          html += `<div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">Completion history</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${history.map(h => `<li>${formatDate(h.last_completed_date)}</li>`).join('')}
            </ul>
          </div>`;
        }

        html += `<div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Attached documents</h4>
          <div id="organizational-compliance-detail-documents"><p class="organizational-empty">Loading…</p></div>
          <form id="organizational-compliance-detail-attach-form" style="margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <select id="organizational-compliance-detail-attach-category" style="max-width: 220px;">
              <option value="form_990">Form 990</option>
              <option value="audited_financials">Audited Financial Statements</option>
              <option value="management_letter">Auditor Management Letter</option>
              <option value="board_resolution">Board Resolution</option>
              <option value="irs_determination_letter">IRS Determination Letter</option>
              <option value="state_registration">State Registration</option>
              <option value="payroll_tax_filing">Payroll Tax Filing</option>
              <option value="other" selected>Other</option>
            </select>
            <input type="file" id="organizational-compliance-detail-attach-file" required>
            <button type="submit" class="organizational-btn organizational-btn-outline" style="padding: 4px 12px; font-size: 0.8125rem;">Attach</button>
          </form>
        </div>`;

        if (obligation.source === 'org_extension') {
          html += `<div style="margin-top: 16px;">
            <button type="button" class="organizational-btn organizational-compliance-propose-btn" data-obligation-id="${obligation.id}">Propose for cooperative review</button>
          </div>`;
        }

        detailContent.innerHTML = html;
        loadObligationDocuments(obligation.id);
        wireAttachForm(obligation.id);
      }

      detailModal.hidden = false;
      detailModal.classList.add('organizational-modal-open');

      const proposeBtn = detailContent.querySelector('.organizational-compliance-propose-btn');
      if (proposeBtn) {
        proposeBtn.addEventListener('click', function () {
          showProposalPrompt(this.getAttribute('data-obligation-id'));
        });
      }
    } catch (e) {
      console.error('viewObligationDetail:', e);
      showError('Could not load obligation detail.');
    }
  }

  async function loadObligationDocuments(obligationId) {
    const el = document.getElementById('organizational-compliance-detail-documents');
    if (!el || !currentSlug) return;
    try {
      const res = await fetch(
        `/api/organizational/orgs/${encodeURIComponent(currentSlug)}/documents?obligation_id=${encodeURIComponent(obligationId)}`,
        { credentials: 'include' }
      );
      const data = res.ok ? await res.json() : {};
      const docs = data.documents || [];
      el.innerHTML = docs.length
        ? '<ul style="margin:0; padding-left:20px;">' + docs.map(d =>
            `<li><a href="/api/organizational/orgs/${encodeURIComponent(currentSlug)}/documents/${d.id}/download">${escapeHtml(d.title)}</a></li>`
          ).join('') + '</ul>'
        : '<p class="organizational-empty">No documents attached yet.</p>';
    } catch (e) {
      console.error('loadObligationDocuments:', e);
      el.innerHTML = '<p class="organizational-empty">Could not load documents.</p>';
    }
  }

  function wireAttachForm(obligationId) {
    const form = document.getElementById('organizational-compliance-detail-attach-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const categorySelect = document.getElementById('organizational-compliance-detail-attach-category');
      const fileInput = document.getElementById('organizational-compliance-detail-attach-file');
      if (!fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('category', categorySelect.value);
      fd.append('obligation_id', obligationId);
      fd.append('title', fileInput.files[0].name);
      fd.append('file', fileInput.files[0]);
      try {
        const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not attach document');
        }
        form.reset();
        await loadObligationDocuments(obligationId);
        await loadDashboard();
      } catch (err) {
        alert(err.message || 'Could not attach document');
      }
    });
  }

  function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.remove('organizational-modal-open');
    detailModal.hidden = true;
  }

  async function markComplete(id) {
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/obligations/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed_this_cycle' })
      });
      if (!res.ok) { showError('Could not mark obligation as complete.'); return; }
      showError('');
      await loadDashboard();
    } catch (e) {
      console.error('markComplete:', e);
      showError('Could not mark obligation as complete.');
    }
  }

  async function deleteObligation(id) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/obligations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) { showError('Could not delete obligation.'); return; }
      showError('');
      await loadDashboard();
    } catch (e) {
      console.error('deleteObligation:', e);
      showError('Could not delete obligation.');
    }
  }

  function openModal() {
    if (!modal) return;
    form.reset();
    editId.value = '';
    modal.hidden = false;
    modal.classList.add('organizational-modal-open');
    if (title) title.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('organizational-modal-open');
    modal.hidden = true;
    form.reset();
    editId.value = '';
  }

  async function saveObligation(e) {
    e.preventDefault();
    const body = {
      title: title ? title.value : '',
      description: description ? description.value : '',
      category: category ? category.value : '',
      frequency: frequency ? frequency.value : '',
      next_due_date: dueDate ? dueDate.value : null,
      notes_markdown: notes ? notes.value : null
    };

    saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/obligations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) { showError(data.error || 'Could not save obligation.'); return; }
      showError('');
      closeModal();
      await loadDashboard();

      if (data.obligation) {
        pendingProposalObligationId = data.obligation.id;
        proposalModal.hidden = false;
        proposalModal.classList.add('organizational-modal-open');
      }
    } catch (e) {
      console.error('saveObligation:', e);
      showError('Could not save obligation.');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function showProposalPrompt(obligationId) {
    pendingProposalObligationId = obligationId;
    proposalModal.hidden = false;
    proposalModal.classList.add('organizational-modal-open');
  }

  function closeProposalModal() {
    if (!proposalModal) return;
    proposalModal.classList.remove('organizational-modal-open');
    proposalModal.hidden = true;
    pendingProposalObligationId = null;
  }

  async function submitProposal() {
    if (!pendingProposalObligationId) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/compliance/obligations/${pendingProposalObligationId}/propose-for-cooperative`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) { showError('Could not submit proposal.'); return; }
      showError('');
      closeProposalModal();
    } catch (e) {
      console.error('submitProposal:', e);
      showError('Could not submit proposal.');
    }
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  async function load() {
    const slug = parseSlug();
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    showError('');

    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError(data.error || 'Could not load organization.');
        loadingEl.hidden = true;
        return;
      }
      const org = data.org;
      currentIsOrgAdmin = isAdminRole(org && org.role);
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (e) {
      console.error('load:', e);
    }

    loadingEl.hidden = true;
    dashEl.hidden = false;

    // Load obligations (background — obligations tab is hidden by default)
    loadDashboard();

    // Load 990 data for the default FY (990 tab is active by default)
    const fy = Number(fy990Select ? fy990Select.value : 2025);
    load990(slug, fy);
    load990Classifications();
    wire990AccordionOnce();
  }

  function wireEventListeners() {
    // Tab switching
    document.querySelectorAll('.organizational-tab-trigger').forEach(btn => {
      btn.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
      });
    });

    // 990 FY selector
    if (fy990Select) {
      fy990Select.addEventListener('change', function () {
        if (currentSlug) load990(currentSlug, Number(this.value));
      });
    }

    // Obligations
    if (addObligationBtn) addObligationBtn.addEventListener('click', openModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (form) form.addEventListener('submit', saveObligation);
    if (detailClose) detailClose.addEventListener('click', closeDetailModal);
    if (proposalNo) proposalNo.addEventListener('click', closeProposalModal);
    if (proposalYes) proposalYes.addEventListener('click', submitProposal);

    if (filterCategory) filterCategory.addEventListener('change', () => renderAllObligations(allObligationsData));
    if (filterSource) filterSource.addEventListener('change', () => renderAllObligations(allObligationsData));
    if (filterStatus) filterStatus.addEventListener('change', () => renderAllObligations(allObligationsData));

    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeDetailModal(); });
    if (proposalModal) proposalModal.addEventListener('click', e => { if (e.target === proposalModal) closeProposalModal(); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (modal && modal.classList.contains('organizational-modal-open')) closeModal();
      if (detailModal && detailModal.classList.contains('organizational-modal-open')) closeDetailModal();
      if (proposalModal && proposalModal.classList.contains('organizational-modal-open')) closeProposalModal();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    wireEventListeners();
    initHeader();
  });

  // ─── Header chrome (unchanged) ──────────────────────────────────────────────

  async function initHeader() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/me', {
        credentials: 'same-origin',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
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
      if (overlay && e.target === overlay) closeOrganizationalOverlay();
    });
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

  function closeOrganizationalDropdown() {
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (icon) icon.setAttribute('aria-expanded', 'false');
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

  function coopDropdownOpenMembers() { closeOrganizationalDropdown(); openOrganizationalOverlay('members'); }
  function coopDropdownOpenLibrary() { closeOrganizationalDropdown(); openOrganizationalOverlay('library'); }
  function coopDropdownOpenWorkPool() { closeOrganizationalDropdown(); openOrganizationalOverlay('work-pool'); }

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch('/api/organizational/cooperative/members', {
          credentials: 'same-origin',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const members = data.members || [];
          listEl.innerHTML = members.length === 0
            ? '<p class="organizational-empty">No members yet.</p>'
            : members.map(m => `
              <div class="organizational-list-item">
                <div class="organizational-list-item-main">
                  <div class="organizational-list-item-title">${escapeHtml(m.display_name || m.slug || '—')}</div>
                </div>
              </div>`).join('');
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


  // ─── 990 functional-expense classification editor (moved from Settings) ────
  function init990ClassifyTab() {
    _990fyEl     = _990fyEl     || document.getElementById('organizational-990-classify-fy');
    _990tbody    = _990tbody    || document.getElementById('organizational-990-classify-tbody');
    _990saveBtn  = _990saveBtn  || document.getElementById('organizational-990-save');
    _990statusEl = _990statusEl || document.getElementById('organizational-990-status');
    _990csvLink  = _990csvLink  || document.getElementById('organizational-990-csv-link');

    if (_990fyEl && !_990fyEl.value) {
      _990fyEl.value = String(new Date().getFullYear());
    }
    if (currentSlug && _990csvLink) {
      _990csvLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) +
        '/reports/990-part-ix?format=csv&fiscal_year=' + (_990fyEl ? _990fyEl.value : new Date().getFullYear());
    }
  }

  function get990ClassifyFy() {
    const el = _990fyEl || document.getElementById('organizational-990-classify-fy');
    return Number.parseInt(String(el ? el.value : ''), 10) || new Date().getFullYear();
  }

  async function load990Classifications() {
    init990ClassifyTab();
    if (!currentSlug) return;
    const fy = get990ClassifyFy();
    if (_990tbody) _990tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Loading…</td></tr>';
    if (_990saveBtn) _990saveBtn.disabled = true;
    if (_990statusEl) _990statusEl.textContent = '';

    const res = await fetch(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/functional-classifications?fiscal_year=' + fy,
      { credentials: 'include' }
    );
    if (!res.ok) {
      if (_990tbody) _990tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Could not load classifications.</td></tr>';
      return;
    }
    const data = await res.json();
    _990data = Array.isArray(data.classifications) ? data.classifications : [];
    render990ClassifyTable();

    if (_990csvLink) {
      _990csvLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) +
        '/reports/990-part-ix?format=csv&fiscal_year=' + fy;
    }
  }

  function render990ClassifyTable() {
    if (!_990tbody) return;
    if (!_990data.length) {
      _990tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No expense accounts found.</td></tr>';
      if (_990saveBtn) _990saveBtn.disabled = true;
      return;
    }
    const roLock = currentIsOrgAdmin ? '' : ' disabled';
    _990tbody.innerHTML = _990data.map(function (row, i) {
      const ps  = Math.round(Number(row.program_services_bps) / 100);
      const mg  = Math.round(Number(row.mgmt_general_bps) / 100);
      const fr  = Math.round(Number(row.fundraising_bps) / 100);
      const sum = ps + mg + fr;
      const sumOk = sum === 100;
      return '<tr data-idx="' + i + '">' +
        '<td style="color:var(--text-secondary);white-space:nowrap;">' + escapeHtml990(row.code || '—') + '</td>' +
        '<td>' + escapeHtml990(row.name || '—') + '</td>' +
        '<td><input type="number" class="organizational-input organizational-990-input" data-field="program_services" min="0" max="100" step="1" value="' + ps + '" style="width:72px;" oninput="on990ClassifyInput(this,' + i + ')"' + roLock + '></td>' +
        '<td><input type="number" class="organizational-input organizational-990-input" data-field="mgmt_general" min="0" max="100" step="1" value="' + mg + '" style="width:72px;" oninput="on990ClassifyInput(this,' + i + ')"' + roLock + '></td>' +
        '<td><input type="number" class="organizational-input organizational-990-input" data-field="fundraising" min="0" max="100" step="1" value="' + fr + '" style="width:72px;" oninput="on990ClassifyInput(this,' + i + ')"' + roLock + '></td>' +
        '<td style="text-align:center; font-weight:600; color:' + (sumOk ? 'var(--organizational-status-success)' : 'var(--organizational-status-danger)') + ';" id="organizational-990-sum-' + i + '">' + sum + '%</td>' +
        '</tr>';
    }).join('');
    if (_990saveBtn) _990saveBtn.disabled = !currentIsOrgAdmin;
  }

  function on990ClassifyInput(inputEl, idx) {
    if (!_990data[idx]) return;
    const row = _990tbody && _990tbody.querySelector('tr[data-idx="' + idx + '"]');
    if (!row) return;
    const inputs = row.querySelectorAll('.organizational-990-input');
    const vals   = Array.from(inputs).map(function (el) { return Number.parseInt(el.value, 10) || 0; });
    const sum    = vals.reduce(function (a, b) { return a + b; }, 0);
    const sumEl  = document.getElementById('organizational-990-sum-' + idx);
    if (sumEl) {
      sumEl.textContent = sum + '%';
      sumEl.style.color = sum === 100 ? 'var(--organizational-status-success)' : 'var(--organizational-status-danger)';
    }
    _990data[idx].program_services_bps = vals[0] * 100;
    _990data[idx].mgmt_general_bps     = vals[1] * 100;
    _990data[idx].fundraising_bps      = vals[2] * 100;
  }

  async function save990Classifications() {
    if (!currentIsOrgAdmin || !currentSlug || !_990data.length) return;
    const fy = get990ClassifyFy();
    if (_990statusEl) _990statusEl.textContent = 'Saving…';
    if (_990saveBtn) _990saveBtn.disabled = true;

    const payload = _990data.map(function (row) {
      return {
        account_id:           row.account_id,
        program_services_bps: Number(row.program_services_bps),
        mgmt_general_bps:     Number(row.mgmt_general_bps),
        fundraising_bps:      Number(row.fundraising_bps),
      };
    });

    const res = await fetch(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/functional-classifications',
      { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fiscal_year: fy, rows: payload }) }
    );
    if (_990saveBtn) _990saveBtn.disabled = false;
    if (!res.ok) {
      const data = await res.json().catch(function () { return {}; });
      if (_990statusEl) _990statusEl.textContent = data.error || 'Save failed.';
      return;
    }
    if (_990statusEl) {
      _990statusEl.textContent = 'Saved.';
      setTimeout(function () { if (_990statusEl) _990statusEl.textContent = ''; }, 3000);
    }
    // Re-fetch Part IX so its completeness meter reflects the just-saved classification.
    const fyForPartIX = Number(fy990Select ? fy990Select.value : fy);
    load990(currentSlug, fyForPartIX);
  }

  function escapeHtml990(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Exclusive accordion for the four 990-tab cards ─────────────────────────
  function toggle990Accordion(cardKey) {
    document.querySelectorAll('.organizational-compliance-accordion-item').forEach(function (item) {
      const isTarget = item.getAttribute('data-accordion-card') === cardKey;
      const body = item.querySelector('.organizational-compliance-accordion-body');
      const header = item.querySelector('.organizational-compliance-accordion-header');
      if (!body || !header) return;
      if (isTarget) {
        const wasOpen = !body.hidden;
        body.hidden = wasOpen;
        header.classList.toggle('organizational-compliance-accordion-open', !wasOpen);
      } else {
        body.hidden = true;
        header.classList.remove('organizational-compliance-accordion-open');
      }
    });
  }

  function wire990AccordionOnce() {
    document.querySelectorAll('.organizational-compliance-accordion-header').forEach(function (header) {
      header.addEventListener('click', function () {
        const item = header.closest('.organizational-compliance-accordion-item');
        const key = item && item.getAttribute('data-accordion-card');
        if (key) toggle990Accordion(key);
      });
    });
  }

  window.load990Classifications = load990Classifications;
  window.save990Classifications = save990Classifications;
  window.on990ClassifyInput = on990ClassifyInput;
  window.toggle990Accordion = toggle990Accordion;

  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;
})();
