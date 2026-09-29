/* budget-scenarios.js — Scenarios tab for the coop budget page.
 * "What if" exploration: draft an alternate budget, see the bottom-line and per-program effect,
 * then optionally push the parts that can be pushed to live. Two tiers:
 *   - Quick Overlay: dollar overrides directly on budget cells (org_budget_scenario_lines).
 *   - Detailed: forks the live personnel roster + grant allocations into the scenario's own
 *     scope, so payroll/allocation math recalculates for real instead of guessing a number.
 * See .claude/plans/2026-09-14-scenario-budgeting-spec.md and
 * .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md.
 * Depends on window.OrganizationalBudget.getState() and window.OrganizationalBudget.getItemPanel().
 * Exposes: window.OrganizationalBudget.scenarios.render()
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  }

  function fmtUsd(cents) {
    const n = Number(cents);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100)
      : '—';
  }
  function fmtSigned(cents) {
    const n = Number(cents) || 0;
    return (n >= 0 ? '+' : '') + fmtUsd(n);
  }
  function varianceClass(cents) {
    const n = Number(cents) || 0;
    return n > 0 ? 'organizational-stat-warn' : n < 0 ? 'organizational-stat-danger' : '';
  }

  function slug()    { return window.OrganizationalBudget.getState?.()?.slug || ''; }
  function isAdmin()  { return !!window.OrganizationalBudget.getState?.()?.isOrgAdmin; }
  function programs() { return window.OrganizationalBudget.getState?.()?.programs || []; }
  function grants()   { return window.OrganizationalBudget.getState?.()?.grants || []; }

  function api(path, opts) {
    return fetch('/api/organizational/orgs/' + encodeURIComponent(slug()) + path, { credentials: 'same-origin', ...opts });
  }
  function apiJson(path, opts) {
    return api(path, opts).then(r => r.json().then(data => ({ res: r, data })));
  }

  let currentDetailScenarioId = null; // which scenario the detail view is showing, if any

  // ── Item panel helpers (shared modal, same pattern as budget-indirect.js) ──────
  function getPanelRefs() { return window.OrganizationalBudget.getItemPanel?.() || {}; }

  function openItemPanel(title, renderFn, wireFn) {
    const { panel, overlay, title: titleEl, error, body } = getPanelRefs();
    if (titleEl) titleEl.textContent = title;
    if (error)   { error.hidden = true; error.textContent = ''; }
    if (body)    body.innerHTML = renderFn();
    panel?.classList.add('organizational-panel-is-open');
    overlay?.classList.add('organizational-panel-is-open');
    if (wireFn && body) wireFn(body);
    const first = body?.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled])');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeItemPanel() { window.OrganizationalBudget.panel?.close('item'); }
  function showItemPanelError(msg) {
    const { error } = getPanelRefs();
    if (error) { error.textContent = msg || ''; error.hidden = !msg; }
  }

  // ── Badges ───────────────────────────────────────────────────────────────────
  function statusBadge(status) {
    if (status === 'archived') {
      return '<span class="organizational-badge organizational-badge-doc-retain_until">Archived</span>';
    }
    return '<span class="organizational-badge organizational-badge-pending_first_payment">Draft</span>';
  }
  function typeBadge(scenarioType) {
    return scenarioType === 'detailed'
      ? '<span class="organizational-badge organizational-badge-active">Detailed</span>'
      : '<span class="organizational-badge organizational-badge-doc-retain_until">Quick Overlay</span>';
  }

  // ── New scenario panel ──────────────────────────────────────────────────────
  function renderNewScenarioPanelBody(defaultFy) {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="scenario-name" class="organizational-input" placeholder="e.g. Growth — new grant lands" required></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Fiscal year *<input type="number" id="scenario-fy" class="organizational-input" value="' + esc(String(defaultFy)) + '" min="1900" max="2200" style="width:110px"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Description<textarea id="scenario-desc" rows="3" placeholder="Optional"></textarea></label></div>'
      + '<div class="organizational-panel-field-full">'
      + '<span class="organizational-label" style="display:block;margin-bottom:6px;">Type</span>'
      + '<label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;cursor:pointer;">'
      + '<input type="radio" name="scenario-type" value="overlay" checked style="margin-top:3px;">'
      + '<span><strong>Quick Overlay</strong><br><span style="font-size:0.8125rem;color:var(--text-secondary);">Override budget totals directly — good for top-down what-ifs like "cut travel 15%."</span></span>'
      + '</label>'
      + '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">'
      + '<input type="radio" name="scenario-type" value="detailed" style="margin-top:3px;">'
      + '<span><strong>Detailed</strong><br><span style="font-size:0.8125rem;color:var(--text-secondary);">Fork the personnel roster and grant allocations so payroll math recalculates for real — good for "what if we hired 2 more staff."</span></span>'
      + '</label>'
      + '</div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="scenario-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="scenario-save" class="organizational-btn organizational-btn-primary">Create scenario</button>'
      + '</div>';
  }

  function wireNewScenarioPanel(body) {
    body.querySelector('#scenario-cancel')?.addEventListener('click', closeItemPanel);
    const saveBtn = body.querySelector('#scenario-save');
    saveBtn?.addEventListener('click', async () => {
      const name = body.querySelector('#scenario-name')?.value?.trim() || '';
      const fy   = Number.parseInt(body.querySelector('#scenario-fy')?.value || '', 10);
      const desc = body.querySelector('#scenario-desc')?.value?.trim() || null;
      const scenarioType = body.querySelector('input[name="scenario-type"]:checked')?.value || 'overlay';
      if (!name) { body.querySelector('#scenario-name')?.focus(); showItemPanelError('Name is required.'); return; }
      if (!Number.isInteger(fy)) { showItemPanelError('Fiscal year is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Creating…';
      const { res, data: json } = await apiJson('/budget-scenarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, fiscal_year: fy, description: desc, scenario_type: scenarioType }),
      });
      if (!res.ok) { showItemPanelError(json.error || 'Could not create scenario'); saveBtn.disabled = false; saveBtn.textContent = 'Create scenario'; return; }
      closeItemPanel();
      await renderList();
    });
  }

  function openNewScenarioPanel() {
    const fy = window.OrganizationalBudget.getState?.()?.fy || new Date().getFullYear();
    openItemPanel('New scenario', () => renderNewScenarioPanelBody(fy), wireNewScenarioPanel);
  }

  // ── Add-line panel (Quick Overlay: introduce a cell override, possibly a new combo) ─
  function renderAddLinePanelBody(accounts) {
    const postingA = (accounts || []).filter(a => a.is_posting);
    const progs    = programs();
    const gr       = grants();
    const acctOpts = postingA.map(a => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    const progOpts = progs.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
    const grantOpts = '<option value="">— No grant —</option>' + gr.map(g => '<option value="' + g.id + '">' + esc(g.name || 'Grant') + '</option>').join('');
    const monthOpts = MONTHS_SHORT.map((n, i) => '<option value="' + (i + 1) + '">' + n + '</option>').join('');

    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Account *<select id="line-account" class="organizational-select">' + acctOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Program *<select id="line-program" class="organizational-select">' + progOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Grant<select id="line-grant" class="organizational-select">' + grantOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Month *<select id="line-month" class="organizational-select">' + monthOpts + '</select></label>'
      + '<label class="organizational-label">Amount ($) *<input type="number" id="line-amount" class="organizational-input" min="0" step="0.01" placeholder="0.00" style="width:110px"></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="line-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="line-save" class="organizational-btn organizational-btn-primary">Add line</button>'
      + '</div>';
  }

  function wireAddLinePanel(body, scenarioId, onSaved) {
    body.querySelector('#line-cancel')?.addEventListener('click', closeItemPanel);
    const saveBtn = body.querySelector('#line-save');
    saveBtn?.addEventListener('click', async () => {
      const accountId = Number(body.querySelector('#line-account')?.value || 0);
      const programId = Number(body.querySelector('#line-program')?.value || 0);
      const grantVal   = body.querySelector('#line-grant')?.value || '';
      const month      = Number(body.querySelector('#line-month')?.value || 0);
      const amount     = parseFloat(body.querySelector('#line-amount')?.value || '');
      if (!accountId)  { showItemPanelError('Account is required.'); return; }
      if (!programId)  { showItemPanelError('Program is required.'); return; }
      if (!month)       { showItemPanelError('Month is required.'); return; }
      if (!Number.isFinite(amount) || amount < 0) { showItemPanelError('Amount is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const { res, data: json } = await apiJson('/budget-scenarios/' + scenarioId + '/lines', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, program_id: programId, grant_id: grantVal || null, month, amount }),
      });
      if (!res.ok) { showItemPanelError(json.error || 'Could not add line'); saveBtn.disabled = false; saveBtn.textContent = 'Add line'; return; }
      closeItemPanel();
      await onSaved();
    });
  }

  async function openAddLinePanel(scenarioId, onSaved) {
    const { data: accountsJson } = await apiJson('/accounts');
    const accounts = accountsJson.accounts || [];
    openItemPanel('Add scenario line', () => renderAddLinePanelBody(accounts), (body) => wireAddLinePanel(body, scenarioId, onSaved));
  }

  // ── Add-worker panel (Detailed: add a hypothetical hire) ────────────────────
  function renderAddWorkerPanelBody(accounts) {
    const salaryAccts = (accounts || []).filter(a => a.is_posting);
    const progs = programs();
    const acctOpts = salaryAccts.map(a => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    const progOpts = progs.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="worker-name" class="organizational-input" placeholder="e.g. New Program Coordinator" required></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Annual salary ($) *<input type="number" id="worker-salary" class="organizational-input" min="0" step="0.01" style="width:130px"></label>'
      + '<label class="organizational-label">FTE % *<input type="number" id="worker-fte" class="organizational-input" min="1" max="100" value="100" style="width:80px"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Salary account *<select id="worker-account" class="organizational-select">' + acctOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Program (100% allocation) *<select id="worker-program" class="organizational-select">' + progOpts + '</select></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="worker-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="worker-save" class="organizational-btn organizational-btn-primary">Add worker</button>'
      + '</div>';
  }

  function wireAddWorkerPanel(body, scenarioId, onSaved) {
    body.querySelector('#worker-cancel')?.addEventListener('click', closeItemPanel);
    const saveBtn = body.querySelector('#worker-save');
    saveBtn?.addEventListener('click', async () => {
      const fullName = body.querySelector('#worker-name')?.value?.trim() || '';
      const salary   = parseFloat(body.querySelector('#worker-salary')?.value || '');
      const fte      = Number(body.querySelector('#worker-fte')?.value || 0);
      const accountId = Number(body.querySelector('#worker-account')?.value || 0);
      const programId = Number(body.querySelector('#worker-program')?.value || 0);
      if (!fullName) { showItemPanelError('Name is required.'); return; }
      if (!Number.isFinite(salary) || salary < 0) { showItemPanelError('Annual salary is required.'); return; }
      if (!accountId) { showItemPanelError('Salary account is required.'); return; }
      if (!programId) { showItemPanelError('Program is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const { res, data: json } = await apiJson('/budget-scenarios/' + scenarioId + '/personnel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName, worker_type: 'employee',
          salary_account_id: accountId, annual_salary_cents: Math.round(salary * 100),
          fte_bps: Math.round(fte * 100), start_month: 1, end_month: 12,
          allocations: [{ program_id: programId, percent_bps: 10000 }],
        }),
      });
      if (!res.ok) { showItemPanelError(json.error || 'Could not add worker'); saveBtn.disabled = false; saveBtn.textContent = 'Add worker'; return; }
      closeItemPanel();
      await onSaved();
    });
  }

  async function openAddWorkerPanel(scenarioId, onSaved) {
    const { data: accountsJson } = await apiJson('/accounts');
    openItemPanel('Add hypothetical worker', () => renderAddWorkerPanelBody(accountsJson.accounts || []), (body) => wireAddWorkerPanel(body, scenarioId, onSaved));
  }

  // ── Add-schedule-item panel (Detailed: add a hypothetical schedule line) ───
  function renderAddScheduleItemPanelBody(accounts) {
    const postingAccts = (accounts || []).filter(a => a.is_posting);
    const progs = programs();
    const acctOpts = postingAccts.map(a => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    const progOpts = '<option value="">Unrestricted</option>' + progs.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Label *<input type="text" id="sched-label" class="organizational-input" placeholder="e.g. New equipment lease" required></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Account *<select id="sched-account" class="organizational-select">' + acctOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Program<select id="sched-program" class="organizational-select">' + progOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Quantity *<input type="number" id="sched-quantity" class="organizational-input" min="0" step="1" value="1" style="width:90px"></label>'
      + '<label class="organizational-label">Unit amount ($) *<input type="number" id="sched-amount" class="organizational-input" min="0" step="0.01" style="width:130px"></label>'
      + '<label class="organizational-label">Frequency<select id="sched-frequency" class="organizational-select" style="width:130px">'
      + '<option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="one_time">One time</option>'
      + '</select></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="sched-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="sched-save" class="organizational-btn organizational-btn-primary">Add schedule item</button>'
      + '</div>';
  }

  function wireAddScheduleItemPanel(body, scenarioId, onSaved) {
    body.querySelector('#sched-cancel')?.addEventListener('click', closeItemPanel);
    const saveBtn = body.querySelector('#sched-save');
    saveBtn?.addEventListener('click', async () => {
      const label = body.querySelector('#sched-label')?.value?.trim() || '';
      const accountId = Number(body.querySelector('#sched-account')?.value || 0);
      const programId = Number(body.querySelector('#sched-program')?.value || 0) || null;
      const quantity = Number(body.querySelector('#sched-quantity')?.value || 0);
      const amount = parseFloat(body.querySelector('#sched-amount')?.value || '');
      const frequency = body.querySelector('#sched-frequency')?.value || 'monthly';
      if (!label) { showItemPanelError('Label is required.'); return; }
      if (!accountId) { showItemPanelError('Account is required.'); return; }
      if (!Number.isFinite(quantity) || quantity < 0) { showItemPanelError('Quantity is required.'); return; }
      if (!Number.isFinite(amount) || amount < 0) { showItemPanelError('Unit amount is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const { res, data: json } = await apiJson('/budget-scenarios/' + scenarioId + '/schedule-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label, account_id: accountId, program_id: programId,
          quantity, unit_amount_cents: Math.round(amount * 100), frequency,
          start_month: 1, end_month: 12,
        }),
      });
      if (!res.ok) { showItemPanelError(json.error || 'Could not add schedule item'); saveBtn.disabled = false; saveBtn.textContent = 'Add schedule item'; return; }
      closeItemPanel();
      await onSaved();
    });
  }

  async function openAddScheduleItemPanel(scenarioId, onSaved) {
    const { data: accountsJson } = await apiJson('/accounts');
    openItemPanel('Add hypothetical schedule item', () => renderAddScheduleItemPanelBody(accountsJson.accounts || []), (body) => wireAddScheduleItemPanel(body, scenarioId, onSaved));
  }

  // ── List view ────────────────────────────────────────────────────────────────
  async function renderList() {
    currentDetailScenarioId = null;
    const state = window.OrganizationalBudget.getState?.() || {};
    const sl = state.slug;
    const pane = document.getElementById('organizational-budget-tab-scenarios');
    if (!pane) return;
    if (!sl) { pane.innerHTML = '<p style="padding:16px;">No workspace loaded.</p>'; return; }
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading…</p>';

    try {
      const { data: json } = await apiJson('/budget-scenarios');
      const scenarios = Array.isArray(json.scenarios) ? json.scenarios : [];

      let rows = '';
      if (scenarios.length === 0) {
        rows = '<tr class="organizational-table-empty"><td colspan="6">No scenarios yet. Create one to start exploring a "what if."</td></tr>';
      } else {
        scenarios.forEach(s => {
          rows += '<tr class="organizational-sg-row" data-id="' + s.id + '" style="cursor:pointer" title="Click to open">'
            + '<td>' + esc(s.name) + (s.description ? '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">' + esc(s.description) + '</div>' : '') + '</td>'
            + '<td>FY ' + esc(String(s.fiscal_year)) + '</td>'
            + '<td>' + typeBadge(s.scenario_type) + '</td>'
            + '<td>' + statusBadge(s.status) + '</td>'
            + '<td>' + esc(new Date(s.created_at).toLocaleDateString()) + '</td>'
            + '<td><button type="button" class="organizational-btn organizational-btn-outline scenario-open-btn" data-id="' + s.id + '" style="font-size:0.75rem;padding:2px 10px;">Open</button></td>'
            + '</tr>';
        });
      }

      pane.innerHTML = '<div class="organizational-schedule-pane">'
        + '<div class="organizational-schedule-toolbar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">'
        + '<h3 class="organizational-schedule-heading">Budget Scenarios</h3>'
        + '<button type="button" id="scenario-new-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">+ New scenario</button>'
        + '</div>'
        + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 12px;">Explore a "what if," see the effect on totals and programs, then push the parts you can to the real budget.</p>'
        + '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Budget scenarios"><thead><tr><th>Name</th><th>Fiscal year</th><th>Type</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        + '</div>';

      pane.querySelectorAll('.organizational-sg-row[data-id], .scenario-open-btn[data-id]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(el.dataset.id);
          const s = scenarios.find(x => x.id === id);
          if (s) renderDetail(s);
        });
      });
      pane.querySelector('#scenario-new-btn')?.addEventListener('click', openNewScenarioPanel);
    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Error loading scenarios: ' + esc(e.message) + '</p>';
    }
  }

  // ── Summary cards + program table ───────────────────────────────────────────
  function renderSummaryCards(totals) {
    const card = (label, baseline, scenario, variance) =>
      '<div class="organizational-budget-stat-item">'
      + '<div class="organizational-budget-stat-label">' + esc(label) + '</div>'
      + '<div class="organizational-budget-stat-value">' + fmtUsd(scenario) + '</div>'
      + '<div class="organizational-budget-stat-secondary ' + varianceClass(variance) + '">'
      + 'Baseline ' + fmtUsd(baseline) + ' · ' + fmtSigned(variance)
      + '</div></div>';
    return '<div class="organizational-budget-stat-strip" style="margin-bottom:16px;">'
      + card('Revenue', totals.baseline_revenue_cents, totals.scenario_revenue_cents, totals.revenue_variance_cents)
      + card('Expenses', totals.baseline_expense_cents, totals.scenario_expense_cents, totals.expense_variance_cents)
      + card('Net Position', totals.baseline_net_cents, totals.scenario_net_cents, totals.net_variance_cents)
      + '</div>';
  }

  function renderProgramTable(programsData) {
    if (!programsData || programsData.length === 0) {
      return '<p style="font-size:0.8125rem;color:var(--text-secondary);">No program-level activity yet.</p>';
    }
    const rows = programsData.map(p =>
      '<tr>'
      + '<td>' + esc(p.program_name) + '</td>'
      + '<td class="organizational-budget-col-num">' + fmtUsd(p.baseline_net_cents) + '</td>'
      + '<td class="organizational-budget-col-num">' + fmtUsd(p.scenario_net_cents) + '</td>'
      + '<td class="organizational-budget-col-num ' + varianceClass(p.variance_cents) + '">' + fmtSigned(p.variance_cents) + '</td>'
      + '</tr>'
    ).join('');
    return '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Program effect">'
      + '<thead><tr><th>Program</th><th class="organizational-budget-col-num">Baseline net</th><th class="organizational-budget-col-num">Scenario net</th><th class="organizational-budget-col-num">Variance</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  // ── Detailed scenario: personnel roster ─────────────────────────────────────
  function renderPersonnelSection(workers) {
    if (!workers || workers.length === 0) {
      return '<p style="font-size:0.8125rem;color:var(--text-secondary);">No personnel in this scenario\'s fork.</p>';
    }
    const rows = workers.map(w => {
      const progNames = (w.allocations || []).map(a => a.program_name).filter(Boolean).join(', ') || '—';
      return '<tr data-worker-id="' + w.id + '">'
        + '<td><input type="text" class="organizational-input worker-name-input" value="' + esc(w.full_name) + '" style="width:100%;"></td>'
        + '<td>' + esc(progNames) + '</td>'
        + '<td class="organizational-budget-col-num"><input type="number" class="organizational-input worker-salary-input" min="0" step="0.01" style="width:110px;text-align:right;" value="' + ((w.annual_salary_cents || 0) / 100).toFixed(2) + '"></td>'
        + '<td><button type="button" class="organizational-btn-icon worker-delete-btn" title="Remove">✕</button></td>'
        + '</tr>';
    }).join('');
    return '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Scenario personnel">'
      + '<thead><tr><th>Name</th><th>Program</th><th class="organizational-budget-col-num">Annual salary</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  // ── Detailed scenario: schedule items ───────────────────────────────────────
  function renderScheduleItemsSection(items) {
    if (!items || items.length === 0) {
      return '<p style="font-size:0.8125rem;color:var(--text-secondary);">No schedule items in this scenario\'s fork.</p>';
    }
    const rows = items.map(it => {
      const progNames = (it.allocations || []).map(a => a.program_name).filter(Boolean).join(', ') || it.program_name || '—';
      return '<tr data-sched-id="' + it.id + '">'
        + '<td><input type="text" class="organizational-input sched-label-input" value="' + esc(it.label) + '" style="width:100%;"></td>'
        + '<td>' + esc(it.account_name || '—') + '</td>'
        + '<td>' + esc(progNames) + '</td>'
        + '<td class="organizational-budget-col-num"><input type="number" class="organizational-input sched-quantity-input" min="0" step="1" style="width:70px;text-align:right;" value="' + it.quantity + '"></td>'
        + '<td class="organizational-budget-col-num"><input type="number" class="organizational-input sched-amount-input" min="0" step="0.01" style="width:110px;text-align:right;" value="' + (it.unit_amount_cents / 100).toFixed(2) + '"></td>'
        + '<td><button type="button" class="organizational-btn-icon sched-delete-btn" title="Remove">✕</button></td>'
        + '</tr>';
    }).join('');
    return '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Scenario schedule items">'
      + '<thead><tr><th>Label</th><th>Account</th><th>Program</th><th class="organizational-budget-col-num">Qty</th><th class="organizational-budget-col-num">Unit amount</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  // ── Detailed scenario: grant allocations ────────────────────────────────────
  function renderGrantAllocationsSection(allocations) {
    if (!allocations || allocations.length === 0) {
      return '<p style="font-size:0.8125rem;color:var(--text-secondary);">No grant allocations in this scenario\'s fork.</p>';
    }
    const rows = allocations.map(a =>
      '<tr data-alloc-id="' + a.id + '" data-grant-id="' + a.grant_id + '" data-program-id="' + a.program_id + '">'
      + '<td>' + esc(a.grant_name) + '</td>'
      + '<td>' + esc(a.program_name || '—') + '</td>'
      + '<td class="organizational-budget-col-num"><input type="number" class="organizational-input grant-alloc-input" min="0" step="0.01" style="width:110px;text-align:right;" value="' + (a.amount_cents / 100).toFixed(2) + '"></td>'
      + '</tr>'
    ).join('');
    return '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Scenario grant allocations">'
      + '<thead><tr><th>Grant</th><th>Program</th><th class="organizational-budget-col-num">FY amount</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  // ── Line-item detail (collapsible) ──────────────────────────────────────────
  function renderLineDetailTable(rows, accountsById, programsById, grantsById, fiscalYear) {
    const acctName = (id) => { const a = accountsById.get(id); return a ? (a.code ? a.code + ' — ' + a.name : a.name) : ('#' + id); };
    const progName = (id) => { const p = programsById.get(id); return p ? p.name : (id == null ? '—' : '#' + id); };
    const grantName = (id) => { if (id == null) return '—'; const g = grantsById.get(id); return g ? (g.name || 'Grant') : ('#' + id); };

    const sortedRows = rows.slice().sort((a, b) => {
      const an = acctName(a.account_id), bn = acctName(b.account_id);
      if (an !== bn) return an < bn ? -1 : 1;
      return a.month - b.month;
    });

    let bodyRows = '';
    if (sortedRows.length === 0) {
      bodyRows = '<tr class="organizational-table-empty"><td colspan="8">No budget lines yet for FY ' + fiscalYear + '.</td></tr>';
    } else {
      sortedRows.forEach(r => {
        const key = r.account_id + '|' + r.program_id + '|' + (r.grant_id ?? '') + '|' + r.month;
        bodyRows += '<tr data-key="' + esc(key) + '" data-account-id="' + r.account_id + '" data-program-id="' + r.program_id + '" data-grant-id="' + (r.grant_id ?? '') + '" data-month="' + r.month + '">'
          + '<td>' + esc(acctName(r.account_id)) + '</td>'
          + '<td>' + esc(progName(r.program_id)) + '</td>'
          + '<td>' + esc(grantName(r.grant_id)) + '</td>'
          + '<td>' + MONTHS_SHORT[r.month - 1] + '</td>'
          + '<td class="organizational-budget-col-num">' + fmtUsd(r.baseline_amount_cents) + '</td>'
          + '<td class="organizational-budget-col-num"><input type="number" class="organizational-input scenario-cell-input" min="0" step="0.01" style="width:100px;text-align:right;" value="' + (r.scenario_amount_cents / 100).toFixed(2) + '"></td>'
          + '<td class="organizational-budget-col-num ' + varianceClass(r.variance_cents) + '">' + fmtSigned(r.variance_cents) + '</td>'
          + '<td>' + (r.overridden ? '<button type="button" class="organizational-btn-icon scenario-reset-btn" title="Reset to baseline">↺</button>' : '') + '</td>'
          + '</tr>';
      });
    }
    return '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Scenario line-item detail"><thead><tr>'
      + '<th>Account</th><th>Program</th><th>Grant</th><th>Month</th>'
      + '<th class="organizational-budget-col-num">Baseline</th><th class="organizational-budget-col-num">Scenario</th>'
      + '<th class="organizational-budget-col-num">Variance</th><th></th>'
      + '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>';
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  async function renderDetail(scenario) {
    currentDetailScenarioId = scenario.id;
    const sl = slug();
    const pane = document.getElementById('organizational-budget-tab-scenarios');
    if (!pane) return;
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading…</p>';

    try {
      const [summaryResult, compareResult, accountsResult] = await Promise.all([
        apiJson('/budget-scenarios/' + scenario.id + '/summary'),
        apiJson('/budget-scenarios/' + scenario.id + '/compare'),
        apiJson('/accounts'),
      ]);
      if (currentDetailScenarioId !== scenario.id) return; // user navigated away while loading
      if (!summaryResult.res.ok || !compareResult.res.ok) {
        const msg = (!summaryResult.res.ok ? summaryResult.data?.error : compareResult.data?.error) || 'This scenario could not be loaded.';
        pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">' + esc(msg) + '</p>'
          + '<button type="button" id="scenario-back-btn-err" class="organizational-nav-link" style="background:none;border:none;cursor:pointer;padding:16px;font-size:0.8125rem;">← All scenarios</button>';
        pane.querySelector('#scenario-back-btn-err')?.addEventListener('click', renderList);
        return;
      }
      const { data: summaryJson } = summaryResult;
      const { data: compareJson } = compareResult;
      const { data: accountsJson } = accountsResult;

      const s = summaryJson.scenario || scenario;
      const isDetailed = s.scenario_type === 'detailed';
      let forked = false;
      let workers = [];
      let grantAllocs = [];
      let scheduleItems = [];
      if (isDetailed) {
        const [{ data: pJson }, { data: gJson }, { data: schJson }] = await Promise.all([
          apiJson('/budget-scenarios/' + scenario.id + '/personnel'),
          apiJson('/budget-scenarios/' + scenario.id + '/grant-allocations'),
          apiJson('/budget-scenarios/' + scenario.id + '/schedule-items'),
        ]);
        workers = pJson.personnel || [];
        grantAllocs = gJson.grant_allocations || [];
        scheduleItems = schJson.schedule_items || [];
        forked = workers.length > 0 || grantAllocs.length > 0 || scheduleItems.length > 0;
      }
      if (currentDetailScenarioId !== scenario.id) return;

      const accountsById = new Map((accountsJson.accounts || []).map(a => [a.id, a]));
      const programsById = new Map(programs().map(p => [p.id, p]));
      const grantsById = new Map(grants().map(g => [g.id, g]));

      const canPromote = isAdmin() && s.status !== 'archived';
      const archiveLabel = s.status === 'archived' ? 'Restore' : 'Archive';

      let actionsHtml = '<button type="button" id="scenario-archive-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">' + archiveLabel + '</button>'
        + '<button type="button" id="scenario-delete-btn" class="organizational-btn organizational-btn-danger" style="font-size:0.8125rem;padding:4px 12px;">Delete</button>';
      if (isDetailed) {
        if (!forked) {
          actionsHtml = '<button type="button" id="scenario-fork-btn" class="organizational-btn organizational-btn-primary" style="font-size:0.8125rem;padding:4px 12px;">Fork live inputs</button>' + actionsHtml;
        } else {
          actionsHtml = '<button type="button" id="scenario-add-worker-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">+ Add worker</button>'
            + '<button type="button" id="scenario-add-schedule-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">+ Add schedule item</button>'
            + '<button type="button" id="scenario-recalc-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">Recalculate</button>'
            + (canPromote ? '<button type="button" id="scenario-promote-btn" class="organizational-btn organizational-btn-primary" style="font-size:0.8125rem;padding:4px 12px;">Push to live</button>' : '')
            + actionsHtml;
        }
      } else {
        actionsHtml = '<button type="button" id="scenario-add-line-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">+ Add line</button>'
          + (canPromote ? '<button type="button" id="scenario-promote-btn" class="organizational-btn organizational-btn-primary" style="font-size:0.8125rem;padding:4px 12px;">Push to live</button>' : '')
          + actionsHtml;
      }

      let detailedSectionsHtml = '';
      if (isDetailed && forked) {
        detailedSectionsHtml =
          '<h4 class="organizational-schedule-heading" style="font-size:0.9375rem;margin-top:20px;">Personnel</h4>'
          + renderPersonnelSection(workers)
          + '<h4 class="organizational-schedule-heading" style="font-size:0.9375rem;margin-top:20px;">Schedule items</h4>'
          + renderScheduleItemsSection(scheduleItems)
          + '<h4 class="organizational-schedule-heading" style="font-size:0.9375rem;margin-top:20px;">Grant allocations</h4>'
          + renderGrantAllocationsSection(grantAllocs);
      } else if (isDetailed && !forked) {
        detailedSectionsHtml = '<p style="font-size:0.8125rem;color:var(--text-secondary);margin-top:16px;">'
          + 'This detailed scenario hasn\'t forked the live personnel roster, schedule items, and grant allocations yet. Fork to start editing them independently of the live budget.</p>';
      }

      pane.innerHTML = '<div class="organizational-schedule-pane">'
        + '<button type="button" id="scenario-back-btn" class="organizational-nav-link" style="background:none;border:none;cursor:pointer;padding:0;margin-bottom:10px;font-size:0.8125rem;">← All scenarios</button>'
        + '<div class="organizational-schedule-toolbar" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px;flex-wrap:wrap;">'
        + '<div><h3 class="organizational-schedule-heading" style="margin-bottom:2px;">' + esc(s.name) + ' ' + typeBadge(s.scenario_type) + ' ' + statusBadge(s.status) + '</h3>'
        + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0;">FY ' + s.fiscal_year + (s.description ? ' — ' + esc(s.description) : '') + '</p></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + actionsHtml + '</div></div>'
        + '<p id="scenario-detail-msg" style="font-size:0.8125rem;margin:8px 0 0;" hidden></p>'
        + renderSummaryCards(summaryJson.totals)
        + '<h4 class="organizational-schedule-heading" style="font-size:0.9375rem;">Program effect</h4>'
        + renderProgramTable(summaryJson.programs)
        + detailedSectionsHtml
        + '<details style="margin-top:20px;">'
        + '<summary style="cursor:pointer;font-size:0.9375rem;font-weight:600;color:var(--text-primary);padding:4px 0;">Line-item detail</summary>'
        + '<div style="margin-top:10px;">' + renderLineDetailTable(compareJson.rows || [], accountsById, programsById, grantsById, s.fiscal_year) + '</div>'
        + '</details>'
        + '</div>';

      wireDetailActions(pane, s, sl);
    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Error loading scenario: ' + esc(e.message) + '</p>';
    }
  }

  function showDetailMsg(pane, msg, isError) {
    const el = pane.querySelector('#scenario-detail-msg');
    if (!el) return;
    el.hidden = false;
    el.style.color = isError ? 'var(--color-error)' : 'var(--organizational-status-success,#16a34a)';
    el.textContent = msg;
  }

  function wireDetailActions(pane, s, sl) {
    pane.querySelector('#scenario-back-btn')?.addEventListener('click', renderList);

    pane.querySelector('#scenario-add-line-btn')?.addEventListener('click', () => openAddLinePanel(s.id, () => renderDetail(s)));
    pane.querySelector('#scenario-add-worker-btn')?.addEventListener('click', () => openAddWorkerPanel(s.id, () => renderDetail(s)));
    pane.querySelector('#scenario-add-schedule-btn')?.addEventListener('click', () => openAddScheduleItemPanel(s.id, () => renderDetail(s)));

    pane.querySelector('#scenario-archive-btn')?.addEventListener('click', async () => {
      const newStatus = s.status === 'archived' ? 'draft' : 'archived';
      const { res } = await apiJson('/budget-scenarios/' + s.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) { s.status = newStatus; renderDetail(s); }
    });

    pane.querySelector('#scenario-delete-btn')?.addEventListener('click', async () => {
      if (!confirm('Delete this scenario? This cannot be undone.')) return;
      const { res } = await apiJson('/budget-scenarios/' + s.id, { method: 'DELETE' });
      if (res.ok) renderList();
    });

    pane.querySelector('#scenario-fork-btn')?.addEventListener('click', async () => {
      const btn = pane.querySelector('#scenario-fork-btn');
      btn.disabled = true; btn.textContent = 'Forking…';
      const { res, data } = await apiJson('/budget-scenarios/' + s.id + '/fork-inputs', { method: 'POST' });
      if (!res.ok) { showDetailMsg(pane, data.error || 'Fork failed.', true); btn.disabled = false; btn.textContent = 'Fork live inputs'; return; }
      renderDetail(s);
    });

    pane.querySelector('#scenario-recalc-btn')?.addEventListener('click', async () => {
      const btn = pane.querySelector('#scenario-recalc-btn');
      btn.disabled = true; btn.textContent = 'Recalculating…';
      const { res, data } = await apiJson('/budget-scenarios/' + s.id + '/recalc', { method: 'POST' });
      if (!res.ok) { showDetailMsg(pane, data.error || 'Recalculate failed.', true); btn.disabled = false; btn.textContent = 'Recalculate'; return; }
      renderDetail(s);
    });

    pane.querySelector('#scenario-promote-btn')?.addEventListener('click', async () => {
      if (!confirm('Push this scenario\'s promotable changes into the live budget for FY ' + s.fiscal_year + '?')) return;
      const btn = pane.querySelector('#scenario-promote-btn');
      btn.disabled = true; btn.textContent = 'Pushing…';
      const { res, data } = await apiJson('/budget-scenarios/' + s.id + '/promote', { method: 'POST' });
      if (!res.ok) { showDetailMsg(pane, data.error || 'Push failed.', true); btn.disabled = false; btn.textContent = 'Push to live'; return; }
      const parts = [];
      if (data.manual_promoted != null) parts.push(data.manual_promoted + ' manual cell(s) pushed');
      if (data.manual_skipped && data.manual_skipped.length) parts.push(data.manual_skipped.length + ' cell(s) need manual follow-up (managed by Personnel/Schedules/Grants)');
      if (data.inputs_promoted) {
        const ip = data.inputs_promoted;
        parts.push(ip.personnel + ' worker(s), ' + ip.schedule + ' schedule item(s), and ' + ip.grant_allocation + ' grant allocation(s) pushed to live');
      }
      showDetailMsg(pane, parts.join('; ') + '.', false);
      window.OrganizationalBudget.reloadGrid?.();
    });

    // Personnel roster: inline edit name/salary, delete.
    pane.querySelectorAll('tr[data-worker-id]').forEach(tr => {
      const workerId = Number(tr.dataset.workerId);
      const nameInput = tr.querySelector('.worker-name-input');
      const salaryInput = tr.querySelector('.worker-salary-input');
      const deleteBtn = tr.querySelector('.worker-delete-btn');

      async function saveWorker() {
        const fullName = nameInput?.value?.trim();
        const salary = parseFloat(salaryInput?.value || '');
        if (!fullName || !Number.isFinite(salary) || salary < 0) return;
        await apiJson('/budget-scenarios/' + s.id + '/personnel/' + workerId, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: fullName, annual_salary_cents: Math.round(salary * 100) }),
        });
      }
      nameInput?.addEventListener('blur', saveWorker);
      salaryInput?.addEventListener('blur', saveWorker);
      [nameInput, salaryInput].forEach(inp => inp?.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); }));

      deleteBtn?.addEventListener('click', async () => {
        if (!confirm('Remove this worker from the scenario?')) return;
        const { res } = await apiJson('/budget-scenarios/' + s.id + '/personnel/' + workerId, { method: 'DELETE' });
        if (res.ok) renderDetail(s);
      });
    });

    // Schedule items: inline edit label/quantity/unit amount, delete.
    pane.querySelectorAll('tr[data-sched-id]').forEach(tr => {
      const itemId = Number(tr.dataset.schedId);
      const labelInput = tr.querySelector('.sched-label-input');
      const quantityInput = tr.querySelector('.sched-quantity-input');
      const amountInput = tr.querySelector('.sched-amount-input');
      const deleteBtn = tr.querySelector('.sched-delete-btn');

      async function saveScheduleItem() {
        const label = labelInput?.value?.trim();
        const quantity = Number(quantityInput?.value || '');
        const amount = parseFloat(amountInput?.value || '');
        if (!label || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(amount) || amount < 0) return;
        await apiJson('/budget-scenarios/' + s.id + '/schedule-items/' + itemId, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, quantity, unit_amount_cents: Math.round(amount * 100) }),
        });
      }
      [labelInput, quantityInput, amountInput].forEach(inp => {
        inp?.addEventListener('blur', saveScheduleItem);
        inp?.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });

      deleteBtn?.addEventListener('click', async () => {
        if (!confirm('Remove this schedule item from the scenario?')) return;
        const { res } = await apiJson('/budget-scenarios/' + s.id + '/schedule-items/' + itemId, { method: 'DELETE' });
        if (res.ok) renderDetail(s);
      });
    });

    // Grant allocations: inline edit amount.
    pane.querySelectorAll('tr[data-alloc-id]').forEach(tr => {
      const grantId = Number(tr.dataset.grantId);
      const programId = Number(tr.dataset.programId);
      const input = tr.querySelector('.grant-alloc-input');
      input?.addEventListener('blur', async () => {
        const amount = parseFloat(input.value || '');
        if (!Number.isFinite(amount) || amount < 0) return;
        await apiJson('/budget-scenarios/' + s.id + '/grant-allocations', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_id: grantId, program_id: programId, amount_cents: Math.round(amount * 100) }),
        });
      });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });

    // Line-item detail: inline cell editing + reset-to-baseline.
    pane.querySelectorAll('tr[data-key]').forEach(tr => {
      const input = tr.querySelector('.scenario-cell-input');
      const resetBtn = tr.querySelector('.scenario-reset-btn');
      const accountId = Number(tr.dataset.accountId);
      const programId = Number(tr.dataset.programId);
      const grantId = tr.dataset.grantId ? Number(tr.dataset.grantId) : null;
      const month = Number(tr.dataset.month);

      async function saveCell() {
        const amount = parseFloat(input.value || '');
        if (!Number.isFinite(amount) || amount < 0) return;
        input.disabled = true;
        try {
          const { res } = await apiJson('/budget-scenarios/' + s.id + '/lines', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, program_id: programId, grant_id: grantId, month, amount }),
          });
          if (res.ok) renderDetail(s);
        } finally { input.disabled = false; }
      }
      input?.addEventListener('blur', saveCell);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      resetBtn?.addEventListener('click', async () => {
        const params = new URLSearchParams({ account_id: String(accountId), program_id: String(programId), month: String(month) });
        if (grantId != null) params.set('grant_id', String(grantId));
        const { res } = await apiJson('/budget-scenarios/' + s.id + '/lines?' + params.toString(), { method: 'DELETE' });
        if (res.ok) renderDetail(s);
      });
    });
  }

  // ── Tab render ────────────────────────────────────────────────────────────────
  async function render() {
    if (currentDetailScenarioId != null) return; // stay on detail view across other-tab round trips
    await renderList();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.OrganizationalBudget.scenarios = { render };
})();
