/* budget-personnel.js — Personnel tab for the coop budget page.
 * Depends on window.OrganizationalBudget.getState() and window.OrganizationalBudget.getPersonnelPanel().
 * Exposes: window.OrganizationalBudget.personnel.render()
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const pane = document.getElementById('organizational-budget-tab-personnel');

  // Module-level caches
  let personnelData    = null;
  let personnelFY      = null;
  let personnelLoading = false;

  // Panel state
  let panelWorker     = null;
  let panelWorkerType = 'employee';
  let panelFY         = null;

  function esc(s) {
    return (window.escapeHtml || (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])))(s);
  }

  function fmtUsd(cents) {
    const n = Number(cents);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100)
      : '—';
  }

  // ── Panel refs ───────────────────────────────────────────────────────────────
  // Same two-target pattern as budget-schedules.js: the shared sliding panel
  // (Personnel tab) and an inline target (Budget grid's right-rail panel),
  // sharing the same render/wire body functions either way.
  let activeTarget = null;

  function getPanel() { return window.OrganizationalBudget.getPersonnelPanel?.() || {}; }

  function slidingTarget() {
    const refs = getPanel();
    return { panelEl: refs.panel, overlayEl: refs.overlay, titleEl: refs.title, errorEl: refs.error, bodyEl: refs.body };
  }

  function renderIntoTarget(target, title, renderFn, wireFn) {
    activeTarget = target;
    if (target.titleEl) target.titleEl.textContent = title;
    if (target.errorEl) { target.errorEl.hidden = true; target.errorEl.textContent = ''; }
    if (target.bodyEl)  target.bodyEl.innerHTML = renderFn();
    target.panelEl?.classList.add('organizational-panel-is-open');
    target.overlayEl?.classList.add('organizational-panel-is-open');
    if (target.panelEl)  target.panelEl.hidden = false;
    if (target.headerEl) target.headerEl.hidden = false;
    if (wireFn && target.bodyEl) wireFn(target.bodyEl);
    const first = target.bodyEl?.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled])');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function showPanelError(msg) {
    const errorEl = activeTarget?.errorEl || slidingTarget().errorEl;
    if (errorEl) { errorEl.textContent = msg || ''; errorEl.hidden = !msg; }
  }

  function closePanel() {
    const t = activeTarget;
    activeTarget = null;
    panelWorker = null;
    if (t && t.onClose) { t.onClose(); return; }
    window.OrganizationalBudget.panel?.close('personnel');
  }

  // Escape closes whichever panel is currently open -- the sliding Personnel-tab panel or the
  // Budget grid's inline panel, both routed through renderIntoTarget/activeTarget above. Same
  // unconditional convention as grants.js's own Escape handler (no suppression while typing).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (activeTarget && activeTarget.panelEl && !activeTarget.panelEl.hidden) closePanel();
  });

  // ── Row renderer ─────────────────────────────────────────────────────────────
  function renderWorkerRow(w, accounts) {
    const acct = accounts.find(a => a.id === (w.salary_account_id || w.contractor_account_id));
    const isEmployee = w.worker_type === 'employee';
    const allocs  = w.allocations || [];
    const allocLabel = allocs.length === 0 ? '—'
      : allocs.length === 1 ? (allocs[0].program_name || 'Program ' + allocs[0].coop_program_id) + ' (' + (allocs[0].percent_bps / 100).toFixed(0) + '%)'
      : allocs.length + ' programs';
    const startM = w.start_month || 1;
    const period = (startM === 1 && !w.end_month) ? 'Full year'
      : MONTHS_SHORT[startM - 1] + '–' + (w.end_month ? MONTHS_SHORT[w.end_month - 1] : 'Dec');

    let html = '<tr class="organizational-personnel-row" data-worker-id="' + w.id + '" style="cursor:pointer;" title="Click to edit">';
    html += '<td>' + esc(w.full_name) + '</td>';
    html += '<td>' + esc(w.title || '—') + '</td>';
    html += '<td>' + esc(acct ? acct.name : '—') + '</td>';
    if (isEmployee) {
      html += '<td class="organizational-budget-col-num">' + (w.annual_salary_cents != null ? fmtUsd(w.annual_salary_cents) : '—') + '</td>';
      html += '<td class="organizational-budget-col-num">' + (w.fte_bps != null ? (w.fte_bps / 10000).toFixed(2) : '1.00') + '</td>';
      html += '<td>' + esc(w.employment_type || '—') + '</td>';
    } else {
      html += '<td class="organizational-budget-col-num">' + (w.monthly_fee_cents != null ? fmtUsd(w.monthly_fee_cents) : '—') + '</td>';
      html += '<td>' + esc(w.contract_type || '—') + '</td>';
    }
    html += '<td>' + period + '</td>';
    html += '<td>' + esc(allocLabel) + '</td>';
    html += '<td class="organizational-budget-col-num">' + (w.projected_annual_cents ? fmtUsd(w.projected_annual_cents) : '—') + '</td>';
    html += '</tr>';
    return html;
  }

  // ── Fringe settings form ─────────────────────────────────────────────────────
  function renderFringeForm(fs, accounts) {
    const fld = (label, name, val, unit) =>
      '<div class="organizational-fringe-field"><label>' + label + '</label><div class="organizational-fringe-input-wrap"><input type="number" class="organizational-fringe-input" name="' + name + '" value="' + (val ?? '') + '" step="1">' + (unit ? '<span class="organizational-fringe-unit">' + unit + '</span>' : '') + '</div></div>';
    const sel = (label, name, val) => {
      let s = '<div class="organizational-fringe-field"><label>' + label + '</label><select class="organizational-fringe-input" name="' + name + '"><option value="">— Not mapped —</option>';
      accounts.forEach(a => { s += '<option value="' + a.id + '"' + (val === a.id ? ' selected' : '') + '>' + esc(a.code + ' ' + a.name) + '</option>'; });
      return s + '</select></div>';
    };
    let html = '<form class="organizational-fringe-form" id="organizational-fringe-settings-form">';
    html += '<div class="organizational-fringe-section-label">Rates</div><div class="organizational-fringe-grid">';
    html += fld('FICA (employer)',    'fica_rate',             7.65,                              '% (federal — fixed)');
    html += fld('SUTA rate',          'suta_rate_bps',         fs.suta_rate_bps         != null ? fs.suta_rate_bps         / 100 : '', '%');
    html += fld('SUTA wage base',     'suta_wage_base_cents',  fs.suta_wage_base_cents  != null ? fs.suta_wage_base_cents  / 100 : '', '$');
    html += fld("Workers' comp rate", 'workers_comp_rate_bps', fs.workers_comp_rate_bps != null ? fs.workers_comp_rate_bps / 100 : '', '%');
    html += fld('Retirement match',   'retirement_rate_bps',   fs.retirement_rate_bps   != null ? fs.retirement_rate_bps   / 100 : '', '%');
    html += fld('Disability rate',    'disability_rate_bps',   fs.disability_rate_bps   != null ? fs.disability_rate_bps   / 100 : '', '%');
    html += fld('SS wage base',       'ss_wage_base_cents',    fs.ss_wage_base_cents    != null ? fs.ss_wage_base_cents    / 100 : '', '$');
    html += '</div>';
    html += '<div class="organizational-fringe-section-label" style="margin-top:12px;">Health Insurance (monthly per employee)</div><div class="organizational-fringe-grid">';
    html += fld('Employee only',        'health_ee_monthly_cents',        fs.health_ee_monthly_cents        != null ? fs.health_ee_monthly_cents        / 100 : '', '$');
    html += fld('Employee + spouse',    'health_ee_spouse_monthly_cents', fs.health_ee_spouse_monthly_cents != null ? fs.health_ee_spouse_monthly_cents / 100 : '', '$');
    html += fld('Employee + family',    'health_ee_family_monthly_cents', fs.health_ee_family_monthly_cents != null ? fs.health_ee_family_monthly_cents / 100 : '', '$');
    html += fld('Dental/vision (per mo)','dental_vision_monthly_cents',   fs.dental_vision_monthly_cents    != null ? fs.dental_vision_monthly_cents    / 100 : '', '$');
    html += fld('Other fringe (per mo)','other_monthly_cents',            fs.other_monthly_cents            != null ? fs.other_monthly_cents            / 100 : '', '$');
    html += '</div>';
    html += '<div class="organizational-fringe-section-label" style="margin-top:12px;">Expense Account Mapping'
      + '<button type="button" id="organizational-fringe-automap-btn" style="margin-left:10px;font-size:0.75rem;padding:3px 10px;border:1px solid var(--wine-light);border-radius:4px;background:var(--surface-active);color:var(--wine-primary);cursor:pointer;font-weight:500;">Suggest accounts</button>'
      + '</div><div class="organizational-fringe-grid">';
    html += sel('FICA account',           'fica_account_id',          fs.fica_account_id);
    html += sel('SUTA account',           'suta_account_id',          fs.suta_account_id);
    html += sel("Workers' comp account",  'workers_comp_account_id',  fs.workers_comp_account_id);
    html += sel('Retirement account',     'retirement_account_id',    fs.retirement_account_id);
    html += sel('Disability account',     'disability_account_id',    fs.disability_account_id);
    html += sel('Health account',         'health_account_id',        fs.health_account_id);
    html += sel('Dental/vision account',  'dental_vision_account_id', fs.dental_vision_account_id);
    html += sel('Other fringe account',   'other_fringe_account_id',  fs.other_fringe_account_id);
    html += '</div>';
    html += '<div style="margin-top:12px;"><button type="submit" class="organizational-btn app-btn-primary">Save fringe settings</button> <span id="organizational-fringe-save-status" style="margin-left:8px;font-size:0.8125rem;"></span></div>';
    return html + '</form>';
  }

  // ── Personnel pane ────────────────────────────────────────────────────────────
  function renderPersonnelPane(data, fy) {
    if (!pane) return;
    const slug = window.OrganizationalBudget.getState?.()?.slug || '';
    const employees   = data.personnel.filter(w => w.worker_type === 'employee');
    const contractors = data.personnel.filter(w => w.worker_type === 'contractor');
    const fs = data.fringe_settings;

    let html = '<div class="organizational-personnel-wrap">';
    html += '<div class="organizational-personnel-toolbar">';
    html += '<button type="button" class="organizational-btn organizational-btn-primary" id="organizational-personnel-add-emp-btn">+ Add employee</button>';
    html += '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-personnel-add-con-btn">+ Add contractor</button>';
    html += '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-personnel-copy-btn" style="margin-left:auto;">Copy from FY ' + (fy - 1) + '</button>';
    html += '</div>';

    // Employees table
    html += '<div class="organizational-personnel-section"><h3 class="organizational-personnel-section-title">Employees</h3>';
    html += '<div class="organizational-budget-grid-scroll"><table class="organizational-table organizational-personnel-table"><thead><tr>';
    html += '<th>Name</th><th>Title</th><th>Account</th><th class="organizational-budget-col-num">Annual Salary</th><th class="organizational-budget-col-num">FTE</th><th>Type</th><th>Period</th><th>Programs</th><th class="organizational-budget-col-num">Projected</th>';
    html += '</tr></thead><tbody>';
    let empTotal = 0;
    employees.forEach(w => { html += renderWorkerRow(w, data.accounts); empTotal += w.projected_annual_cents || 0; });
    if (!employees.length) html += '<tr><td colspan="9" style="padding:12px;color:var(--text-secondary);text-align:center;">No employees — click "+ Add employee" above</td></tr>';
    html += '<tr class="organizational-personnel-total-row"><td colspan="8"><strong>Total employees</strong></td><td class="organizational-budget-col-num"><strong>' + fmtUsd(empTotal) + '</strong></td></tr>';
    html += '</tbody></table></div></div>';

    // Contractors table
    html += '<div class="organizational-personnel-section"><h3 class="organizational-personnel-section-title">Fee-Based Contractors</h3>';
    html += '<div class="organizational-budget-grid-scroll"><table class="organizational-table organizational-personnel-table"><thead><tr>';
    html += '<th>Name</th><th>Title</th><th>Account</th><th class="organizational-budget-col-num">Monthly Fee</th><th>Contract Type</th><th>Period</th><th>Programs</th><th class="organizational-budget-col-num">Projected</th>';
    html += '</tr></thead><tbody>';
    let conTotal = 0;
    contractors.forEach(w => { html += renderWorkerRow(w, data.accounts); conTotal += w.projected_annual_cents || 0; });
    if (!contractors.length) html += '<tr><td colspan="8" style="padding:12px;color:var(--text-secondary);text-align:center;">No contractors — click "+ Add contractor" above</td></tr>';
    html += '<tr class="organizational-personnel-total-row"><td colspan="7"><strong>Total contractors</strong></td><td class="organizational-budget-col-num"><strong>' + fmtUsd(conTotal) + '</strong></td></tr>';
    html += '</tbody></table></div></div>';

    // Account breakdown
    html += '<div class="organizational-personnel-section"><h3 class="organizational-personnel-section-title">Account Breakdown</h3>';
    html += '<div class="organizational-budget-grid-scroll"><table class="organizational-table organizational-personnel-account-summary"><thead><tr><th>Account</th><th class="organizational-budget-col-num">Projected Total</th></tr></thead>';
    html += '<tbody id="organizational-personnel-account-summary-rows"></tbody></table></div></div>';

    // Fringe settings
    html += '<div class="organizational-personnel-section"><details class="organizational-personnel-fringe-details"><summary class="organizational-personnel-fringe-summary">Fringe Benefit Settings</summary>';
    html += renderFringeForm(fs, data.accounts);
    html += '</details></div>';
    html += '</div>';

    pane.innerHTML = html;

    // Wire row clicks
    pane.querySelectorAll('.organizational-personnel-row').forEach(tr => {
      tr.addEventListener('click', function () {
        const w = data.personnel.find(x => String(x.id) === String(this.dataset.workerId));
        if (w) openPanel(w, null, data, fy);
      });
    });

    pane.querySelector('#organizational-personnel-add-emp-btn')?.addEventListener('click', () => openPanel(null, 'employee', data, fy));
    pane.querySelector('#organizational-personnel-add-con-btn')?.addEventListener('click', () => openPanel(null, 'contractor', data, fy));

    const copyBtn = pane.querySelector('#organizational-personnel-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        if (!confirm('Copy all FY ' + (fy - 1) + ' personnel to FY ' + fy + '? This will not overwrite existing entries.')) return;
        this.disabled = true;
        try {
          const r = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/copy-from-prior-year', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fiscal_year: fy }),
          });
          const json = await r.json();
          if (!r.ok) throw new Error(json.error || 'Copy failed');
          personnelData = null;
          await renderTab();
          alert('Copied ' + json.copied + ' worker(s) from FY ' + (fy - 1) + '.');
        } catch (e) {
          alert('Could not copy: ' + e.message);
        } finally {
          copyBtn.disabled = false;
        }
      });
    }

    const fringeForm = pane.querySelector('#organizational-fringe-settings-form');
    if (fringeForm) {
      fringeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const statusEl = pane.querySelector('#organizational-fringe-save-status');
        if (statusEl) statusEl.textContent = 'Saving…';
        const fd = new FormData(this);
        const bpsF   = ['suta_rate_bps','workers_comp_rate_bps','retirement_rate_bps','disability_rate_bps'];
        const centsF = ['suta_wage_base_cents','ss_wage_base_cents','health_ee_monthly_cents','health_ee_spouse_monthly_cents','health_ee_family_monthly_cents','dental_vision_monthly_cents','other_monthly_cents'];
        const intF   = ['fica_account_id','suta_account_id','workers_comp_account_id','retirement_account_id','disability_account_id','health_account_id','dental_vision_account_id','other_fringe_account_id'];
        const body = {};
        bpsF.forEach(f   => { const v = parseFloat(fd.get(f));   if (!isNaN(v)) body[f] = Math.round(v * 100); });
        centsF.forEach(f => { const v = parseFloat(fd.get(f));   if (!isNaN(v)) body[f] = Math.round(v * 100); });
        intF.forEach(f   => { const v = fd.get(f); body[f] = v ? parseInt(v, 10) : null; });
        try {
          const r = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/fringe-settings?fiscal_year=' + fy, {
            method: 'PATCH', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          const json = await r.json();
          if (!r.ok) throw new Error(json.error || 'Save failed');
          if (personnelData) personnelData.fringe_settings = json.fringe_settings;
          if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500); }
        } catch (e) {
          if (statusEl) statusEl.textContent = 'Error: ' + e.message;
        }
      });
    }

    const automapBtn = pane.querySelector('#organizational-fringe-automap-btn');
    if (automapBtn && fringeForm) {
      const FRINGE_PATTERNS = {
        fica_account_id:          [/payroll\s*tax/i, /employer\s*tax/i, /\bfica\b/i, /social\s*sec/i, /medicare/i],
        suta_account_id:          [/\bsuta\b/i, /\bfuta\b/i, /unemploy/i],
        workers_comp_account_id:  [/workers?\s*['']?\s*comp/i, /workman/i, /work\s*comp/i],
        retirement_account_id:    [/retirement/i, /\b401k\b/i, /\b403b\b/i, /pension/i],
        disability_account_id:    [/disabilit/i],
        health_account_id:        [/\bhealth\b/i, /medical\s*ins/i],
        dental_vision_account_id: [/dental/i, /vision/i, /optical/i],
        other_fringe_account_id:  [/other\s*(emp|fringe|ben)/i],
      };
      automapBtn.addEventListener('click', () => {
        const accts = data.accounts || [];
        let mapped = 0;
        for (const [field, patterns] of Object.entries(FRINGE_PATTERNS)) {
          const sel = fringeForm.querySelector('[name="' + field + '"]');
          if (!sel || sel.value) continue;
          const match = accts.find(a => patterns.some(p => p.test(a.name) || p.test(a.code || '')));
          if (match) { sel.value = String(match.id); mapped++; }
        }
        const statusEl = pane.querySelector('#organizational-fringe-save-status');
        if (statusEl) {
          statusEl.textContent = mapped > 0
            ? mapped + ' account' + (mapped !== 1 ? 's' : '') + ' suggested — review and save'
            : 'No matches found';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
        }
      });
    }

    // Load account summary async
    (async () => {
      try {
        const r = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/account-summary?fiscal_year=' + fy, { credentials: 'same-origin' });
        if (!r.ok) return;
        const json  = await r.json();
        const tbody = pane.querySelector('#organizational-personnel-account-summary-rows');
        if (tbody && json.summary?.length) {
          let rows = ''; let grand = 0;
          for (const row of json.summary) {
            rows += '<tr><td>' + esc(row.account_code + ' ' + row.account_name) + '</td><td class="organizational-budget-col-num">' + fmtUsd(row.total_cents) + '</td></tr>';
            grand += row.total_cents;
          }
          rows += '<tr class="organizational-personnel-total-row"><td><strong>Grand Total</strong></td><td class="organizational-budget-col-num"><strong>' + fmtUsd(grand) + '</strong></td></tr>';
          tbody.innerHTML = rows;
        }
      } catch (_) { /* ignore */ }
    })();
  }

  // ── Worker panel (shared by the sliding panel and the inline target) ────────
  function openPanel(worker, workerType, data, fy) {
    panelWorker     = worker || null;
    panelWorkerType = worker ? worker.worker_type : (workerType || 'employee');
    panelFY         = fy;
    const target = slidingTarget();
    renderIntoTarget(target,
      !worker ? 'Add ' + panelWorkerType : (worker.full_name || 'Edit person'),
      () => renderPanelBody(worker, panelWorkerType, data, fy, null),
      (body) => wirePanelBody(body, data, fy, worker, panelWorkerType, target));
  }

  // Inline target (Budget grid's right-rail panel) — same body/wire functions,
  // rendered into a caller-supplied target instead. `defaultAccountId` pre-fills
  // the account select for a brand-new worker opened from a specific grid row.
  window.OrganizationalBudget.renderWorkerInline = function (target, worker, workerType, data, fy, defaultAccountId) {
    const wt = worker ? worker.worker_type : (workerType || 'employee');
    renderIntoTarget(target,
      !worker ? 'Add ' + wt : (worker.full_name || 'Edit person'),
      () => renderPanelBody(worker, wt, data, fy, defaultAccountId || null),
      (body) => wirePanelBody(body, data, fy, worker, wt, target));
  };

  window.OrganizationalBudget.openWorkerInline = async function (workerId, target, opts) {
    opts = opts || {};
    const state = window.OrganizationalBudget.getState?.() || {};
    const slug  = state.slug;
    const fy    = state.fy;
    try {
      const [wRes, aRes] = await Promise.all([
        fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel?fiscal_year=' + fy, { credentials: 'same-origin' }),
        fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts', { credentials: 'same-origin' }),
      ]);
      const wJson = await wRes.json();
      const aJson = aRes.ok ? await aRes.json() : { accounts: [] };
      const worker = (wJson.personnel || []).find(w => String(w.id) === String(workerId));
      if (!worker) return;
      const data = {
        accounts: (aJson.accounts || []).filter(a => a.is_posting && a.type === 'expense'),
        programs: state.programs || [],
      };
      window.OrganizationalBudget.renderWorkerInline(target, worker, worker.worker_type, data, fy);
    } catch (e) { console.error('openWorkerInline:', e); }
  };

  window.OrganizationalBudget.openWorkerInlineNew = async function (target, params) {
    params = params || {};
    const state = window.OrganizationalBudget.getState?.() || {};
    const slug  = state.slug;
    const fy    = params.fy || state.fy;
    try {
      const accounts = params.accounts || (await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.accounts || []));
      const data = {
        accounts: accounts.filter(a => a.is_posting && a.type === 'expense'),
        programs: state.programs || [],
      };
      window.OrganizationalBudget.renderWorkerInline(target, null, params.workerType || 'employee', data, fy, params.accountId || null);
    } catch (e) { console.error('openWorkerInlineNew:', e); }
  };

  function renderPanelBody(worker, workerType, data, fy, defaultAccountId) {
    const isEmployee = workerType === 'employee';
    const isNew = !worker;
    const f = name => worker ? worker[name] : null;

    const acctSel = (name, val) => {
      const selectedId = val || (isNew ? defaultAccountId : null);
      let s = '<select name="' + name + '" class="organizational-input"><option value="">— Account —</option>';
      data.accounts.forEach(a => { s += '<option value="' + a.id + '"' + (selectedId === a.id ? ' selected' : '') + '>' + esc(a.code + ' ' + a.name) + '</option>'; });
      return s + '</select>';
    };

    let html = '';

    // Worker type toggle (new only)
    if (isNew) {
      html += '<div class="organizational-panel-field-row organizational-panel-field-full" style="margin-bottom:14px;">';
      html += '<span class="organizational-label">Type</span><div class="organizational-seg-toggle" id="cpn-type-toggle" style="margin-top:4px;">';
      html += '<button type="button" class="organizational-seg-btn' + (workerType === 'employee' ? ' active' : '') + '" data-val="employee">Employee</button>';
      html += '<button type="button" class="organizational-seg-btn' + (workerType === 'contractor' ? ' active' : '') + '" data-val="contractor">Contractor</button>';
      html += '</div></div>';
    }

    html += '<div class="organizational-panel-fields">';
    if (!isNew) html += '<div class="organizational-panel-field-row"><span class="organizational-label">Personnel ID</span><span class="cpn-pid-badge" style="margin-top:4px;">P' + worker.id + '</span></div>';

    html += '<div class="organizational-panel-field-row' + (isNew ? ' organizational-panel-field-full' : '') + '">';
    html += '<label class="organizational-label" for="cpn-name">Full name *</label><input id="cpn-name" name="full_name" type="text" class="organizational-input" value="' + esc(f('full_name') || '') + '" autocomplete="off">';
    html += '</div>';

    html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-title">Title</label><input id="cpn-title" name="title" type="text" class="organizational-input" value="' + esc(f('title') || '') + '" autocomplete="off"></div>';

    if (isEmployee) {
      html += '<div class="organizational-panel-field-row organizational-panel-field-full"><span class="organizational-label">Pay type</span>';
      html += '<div class="organizational-seg-toggle" id="cpn-pay-type" style="margin-top:4px;">';
      html += '<button type="button" class="organizational-seg-btn active" data-pay="annual">Annual</button>';
      html += '<button type="button" class="organizational-seg-btn" data-pay="monthly">Monthly</button>';
      html += '<button type="button" class="organizational-seg-btn" data-pay="hourly">Hourly</button>';
      html += '</div></div>';

      const annualVal = f('annual_salary_cents') != null ? (f('annual_salary_cents') / 100).toFixed(2) : '';
      html += '<div class="organizational-panel-field-row" id="cpn-annual-wrap"><label class="organizational-label" for="cpn-annual">Annual salary ($)</label><input id="cpn-annual" name="annual_salary" type="number" class="organizational-input" step="0.01" min="0" value="' + annualVal + '"></div>';

      const monthlyVal = f('annual_salary_cents') != null ? (f('annual_salary_cents') / 1200).toFixed(2) : '';
      html += '<div class="organizational-panel-field-row" id="cpn-monthly-wrap" hidden><label class="organizational-label" for="cpn-monthly-pay">Monthly pay ($)</label><input id="cpn-monthly-pay" name="monthly_pay" type="number" class="organizational-input" step="0.01" min="0" value="' + monthlyVal + '"></div>';
      html += '<div class="organizational-panel-field-row" id="cpn-hourly-wrap" hidden><label class="organizational-label" for="cpn-hourly-rate">Hourly rate ($)</label><input id="cpn-hourly-rate" name="hourly_rate" type="number" class="organizational-input" step="0.01" min="0" value=""></div>';
      html += '<div class="organizational-panel-field-row" id="cpn-hours-wrap" hidden><label class="organizational-label" for="cpn-hours-week">Hours / week</label><input id="cpn-hours-week" name="hours_per_week" type="number" class="organizational-input" step="0.5" min="1" max="80" value="40"></div>';

      const fteVal = f('fte_bps') != null ? (f('fte_bps') / 10000).toFixed(2) : '1.00';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-fte">FTE</label><input id="cpn-fte" name="fte" type="number" class="organizational-input" step="0.01" min="0.01" max="2" value="' + fteVal + '"></div>';

      const avgHoursVal = f('avg_hours_per_week') != null ? f('avg_hours_per_week') : '40';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-avg-hours">Avg hours/week (990 Sched. J)</label><input id="cpn-avg-hours" name="avg_hours_per_week" type="number" class="organizational-input" step="0.5" min="0" max="80" value="' + avgHoursVal + '"></div>';

      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-emp-type">Employment type</label><select id="cpn-emp-type" name="employment_type" class="organizational-input">';
      ['full-time','part-time','seasonal'].forEach(t => { html += '<option value="' + t + '"' + ((f('employment_type') || 'full-time') === t ? ' selected' : '') + '>' + t[0].toUpperCase() + t.slice(1) + '</option>'; });
      html += '</select></div>';

      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-health">Health tier</label><select id="cpn-health" name="health_tier" class="organizational-input">';
      [['none','None'],['employee','Employee only'],['spouse','+ Spouse'],['family','+ Family']].forEach(([v, l]) => { html += '<option value="' + v + '"' + ((f('health_tier') || 'none') === v ? ' selected' : '') + '>' + l + '</option>'; });
      html += '</select></div>';

      html += '<div class="organizational-panel-field-row"><label class="organizational-label">Salary account</label>' + acctSel('salary_account_id', f('salary_account_id')) + '</div>';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-dept">Department code</label><input id="cpn-dept" name="department_code" type="text" class="organizational-input" value="' + esc(f('department_code') || '') + '"></div>';
    } else {
      const feeVal = f('monthly_fee_cents') != null ? (f('monthly_fee_cents') / 100).toFixed(2) : '';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-monthly-fee">Monthly fee ($)</label><input id="cpn-monthly-fee" name="monthly_fee" type="number" class="organizational-input" step="0.01" min="0" value="' + feeVal + '"></div>';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label" for="cpn-contract-type">Contract type</label><select id="cpn-contract-type" name="contract_type" class="organizational-input">';
      [['ongoing','Ongoing'],['project','Project'],['monthly','Monthly'],['annual','Annual']].forEach(([v, l]) => { html += '<option value="' + v + '"' + ((f('contract_type') || 'ongoing') === v ? ' selected' : '') + '>' + l + '</option>'; });
      html += '</select></div>';
      html += '<div class="organizational-panel-field-row"><label class="organizational-label">Account</label>' + acctSel('contractor_account_id', f('contractor_account_id')) + '</div>';
    }
    html += '</div>'; // .organizational-panel-fields

    // Period
    html += '<div class="organizational-panel-section-head">Period</div><div class="organizational-panel-fields">';
    html += '<div class="organizational-panel-field-row"><label class="organizational-label">Start month</label><select name="start_month" class="organizational-input">';
    for (let i = 1; i <= 12; i++) html += '<option value="' + i + '"' + ((f('start_month') || 1) === i ? ' selected' : '') + '>' + MONTHS[i - 1] + '</option>';
    html += '</select></div>';
    html += '<div class="organizational-panel-field-row"><label class="organizational-label">End month</label><select name="end_month" class="organizational-input"><option value="">Year end (December)</option>';
    for (let i = 1; i <= 12; i++) html += '<option value="' + i + '"' + (f('end_month') === i ? ' selected' : '') + '>' + MONTHS[i - 1] + '</option>';
    html += '</select></div></div>';

    // Program allocations
    const progs  = data.programs || [];
    const allocMap = {};
    (worker?.allocations || []).forEach(a => { allocMap[a.coop_program_id] = a.percent_bps / 100; });
    if (progs.length) {
      html += '<div class="organizational-panel-section-head">Program allocations</div><div class="cpn-alloc-list">';
      progs.forEach(p => {
        const pct = allocMap[p.id] || '';
        html += '<div class="cpn-alloc-row"><label>' + esc(p.name) + '</label><input type="number" class="organizational-input cpn-alloc-input" data-program-id="' + p.id + '" value="' + pct + '" min="0" max="100" step="1" placeholder="0"><span style="font-size:0.8125rem;color:var(--text-secondary);">%</span></div>';
      });
      html += '</div><p class="cpn-alloc-total" id="cpn-alloc-total"></p>';
    }

    // Other
    html += '<div class="organizational-panel-section-head">Other</div><div class="organizational-panel-fields">';
    if (isEmployee) html += '<div class="organizational-panel-field-row organizational-panel-field-full"><label class="organizational-label" for="cpn-payroll-id">Payroll system ID</label><input id="cpn-payroll-id" name="payroll_id" type="text" class="organizational-input" value="' + esc(f('payroll_id') || '') + '" placeholder="e.g. EMP-001"></div>';
    html += '<div class="organizational-panel-field-row organizational-panel-field-full"><label class="organizational-label" for="cpn-notes">Notes</label><textarea id="cpn-notes" name="notes" class="organizational-input" rows="2">' + esc(f('notes') || '') + '</textarea></div>';
    html += '</div>';

    // Actions
    html += '<div class="organizational-panel-actions">';
    if (!isNew && worker) html += '<button type="button" class="organizational-btn organizational-btn-danger" id="cpn-delete-btn">Delete</button><span style="flex:1;"></span>';
    html += '<button type="button" class="organizational-btn organizational-btn-outline" id="cpn-cancel-btn">Cancel</button>';
    html += '<button type="button" class="organizational-btn" id="cpn-save-btn">' + (isNew ? 'Create' : 'Save') + '</button>';
    html += '</div>';

    return html;
  }

  function wirePanelBody(body, data, fy, worker, workerType, target) {
    const slug       = window.OrganizationalBudget.getState?.()?.slug || '';
    const isEmployee = (worker ? worker.worker_type : workerType) === 'employee';
    const isNew      = !worker;

    // Type toggle — re-render into the same target (sliding or inline)
    body.querySelector('#cpn-type-toggle')?.querySelectorAll('.organizational-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wt = btn.dataset.val;
        renderIntoTarget(target,
          'Add ' + wt,
          () => renderPanelBody(null, wt, data, fy, null),
          (b) => wirePanelBody(b, data, fy, null, wt, target));
      });
    });

    // Pay type toggle
    if (isEmployee) {
      const payToggle  = body.querySelector('#cpn-pay-type');
      const annualWrap = body.querySelector('#cpn-annual-wrap');
      const mWrap      = body.querySelector('#cpn-monthly-wrap');
      const hWrap      = body.querySelector('#cpn-hourly-wrap');
      const hoWrap     = body.querySelector('#cpn-hours-wrap');
      const annualIn   = body.querySelector('#cpn-annual');
      const monthlyPay = body.querySelector('#cpn-monthly-pay');
      const hourlyRate = body.querySelector('#cpn-hourly-rate');
      const hoursWeek  = body.querySelector('#cpn-hours-week');
      const fteIn      = body.querySelector('#cpn-fte');

      payToggle?.querySelectorAll('.organizational-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          payToggle.querySelectorAll('.organizational-seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.dataset.pay;
          if (annualWrap) annualWrap.hidden = (mode !== 'annual');
          if (mWrap)      mWrap.hidden      = (mode !== 'monthly');
          if (hWrap)      hWrap.hidden      = (mode !== 'hourly');
          if (hoWrap)     hoWrap.hidden     = (mode !== 'hourly');
        });
      });
      monthlyPay?.addEventListener('input', () => { if (annualIn) annualIn.value = ((parseFloat(monthlyPay.value) || 0) * 12).toFixed(2); });
      const recalcHourly = () => {
        const r = parseFloat(hourlyRate?.value || '0') || 0;
        const h = parseFloat(hoursWeek?.value || '40') || 40;
        if (annualIn) annualIn.value = (r * h * 52).toFixed(2);
        if (fteIn)    fteIn.value    = Math.min(1, h / 40).toFixed(2);
      };
      hourlyRate?.addEventListener('input', recalcHourly);
      hoursWeek?.addEventListener('input', recalcHourly);
    }

    // Alloc total
    const updateAllocTotal = () => {
      let total = 0;
      body.querySelectorAll('.cpn-alloc-input').forEach(inp => { total += parseFloat(inp.value || '0') || 0; });
      const el = body.querySelector('#cpn-alloc-total');
      if (el) {
        el.textContent = 'Total: ' + total.toFixed(0) + '%';
        el.className = 'cpn-alloc-total' + (total > 100.05 ? ' over' : Math.abs(total - 100) < 0.1 && total > 0 ? ' ok' : '');
      }
    };
    body.querySelectorAll('.cpn-alloc-input').forEach(inp => inp.addEventListener('input', updateAllocTotal));
    updateAllocTotal();

    function buildPayload() {
      const get = name => { const el = body.querySelector('[name="' + name + '"]'); return el ? el.value : ''; };
      const endM = get('end_month');
      const payload = {
        fiscal_year: fy, worker_type: isEmployee ? 'employee' : 'contractor',
        full_name: get('full_name').trim(), title: get('title').trim() || null,
        notes: get('notes').trim() || null,
        start_month: parseInt(get('start_month') || '1', 10),
        end_month: endM ? parseInt(endM, 10) : null,
        allocations: [],
      };
      body.querySelectorAll('.cpn-alloc-input').forEach(inp => {
        const pct = parseFloat(inp.value || '0') || 0;
        if (pct > 0) payload.allocations.push({ coop_program_id: parseInt(inp.dataset.programId, 10), percent_bps: Math.round(pct * 100) });
      });
      if (isEmployee) {
        payload.salary_account_id   = parseInt(get('salary_account_id') || '0', 10) || null;
        payload.annual_salary_cents = Math.round(parseFloat(get('annual_salary') || '0') * 100);
        payload.fte_bps             = Math.round(parseFloat(get('fte') || '1') * 10000);
        payload.avg_hours_per_week  = get('avg_hours_per_week') !== '' ? parseFloat(get('avg_hours_per_week')) : null;
        payload.employment_type     = get('employment_type') || 'full-time';
        payload.health_tier         = get('health_tier') || 'none';
        payload.flsa_status         = get('flsa_status') || 'exempt';
        payload.department_code     = get('department_code').trim() || null;
        payload.payroll_id          = get('payroll_id').trim() || null;
      } else {
        payload.contractor_account_id = parseInt(get('contractor_account_id') || '0', 10) || null;
        payload.monthly_fee_cents     = Math.round(parseFloat(get('monthly_fee') || '0') * 100);
        payload.contract_type         = get('contract_type') || 'ongoing';
      }
      return payload;
    }

    async function saveWorker() {
      const payload = buildPayload();
      if (!payload.full_name) { body.querySelector('[name="full_name"]')?.focus(); showPanelError('Full name is required.'); return; }
      const saveBtn = body.querySelector('#cpn-save-btn');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
      try {
        const url = worker
          ? '/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/' + worker.id
          : '/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel';
        const res  = await fetch(url, { method: worker ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Save failed');
        personnelData = null;
        window.OrganizationalBudget.grid?.invalidatePersonnelCache?.();
        closePanel();
        if (pane && !pane.hidden) await renderTab();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Create' : 'Save'; }
        showPanelError(e.message);
      }
    }

    async function deleteWorker() {
      if (!worker || !confirm('Delete ' + worker.full_name + '?')) return;
      const delBtn = body.querySelector('#cpn-delete-btn');
      if (delBtn) delBtn.disabled = true;
      try {
        const res  = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/' + worker.id, { method: 'DELETE', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Delete failed');
        personnelData = null;
        window.OrganizationalBudget.grid?.invalidatePersonnelCache?.();
        closePanel();
        if (pane && !pane.hidden) await renderTab();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) {
        if (delBtn) delBtn.disabled = false;
        showPanelError(e.message);
      }
    }

    body.querySelector('#cpn-save-btn')?.addEventListener('click', saveWorker);
    body.querySelector('#cpn-cancel-btn')?.addEventListener('click', closePanel);
    body.querySelector('#cpn-delete-btn')?.addEventListener('click', deleteWorker);
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  async function renderTab() {
    if (!pane) return;
    const state = window.OrganizationalBudget.getState?.() || {};
    const slug  = state.slug;
    const fy    = state.fy;
    if (!fy) { pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Select a fiscal year to view personnel.</p>'; return; }
    if (personnelLoading) return;
    if (personnelData && personnelFY === fy) { renderPersonnelPane(personnelData, fy); return; }

    personnelLoading = true;
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading personnel…</p>';
    try {
      const [wRes, fRes, aRes] = await Promise.all([
        fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel?fiscal_year=' + fy, { credentials: 'same-origin' }),
        fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/fringe-settings', { credentials: 'same-origin' }),
        fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts', { credentials: 'same-origin' }),
      ]);
      if (!wRes.ok || !fRes.ok) throw new Error('Failed to load personnel data');
      const wJson = await wRes.json();
      const fJson = await fRes.json();
      const aJson = aRes.ok ? await aRes.json() : { accounts: [] };
      personnelData = {
        personnel:       wJson.personnel || [],
        fringe_settings: fJson.fringe_settings || {},
        accounts:        (aJson.accounts || []).filter(a => a.is_posting && a.type === 'expense'),
        programs:        state.programs || [],
      };
      personnelFY = fy;
      renderPersonnelPane(personnelData, fy);
    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Could not load personnel: ' + e.message + '</p>';
    } finally {
      personnelLoading = false;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.OrganizationalBudget.personnel = {
    render: renderTab,
    invalidateCache: () => { personnelData = null; personnelFY = null; },
  };
})();
