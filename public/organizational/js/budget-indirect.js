/* budget-indirect.js — Indirect Costs tab for the coop budget page.
 * Depends on window.OrganizationalBudget.getState() and window.OrganizationalBudget.getItemPanel().
 * Exposes: window.OrganizationalBudget.indirect.render()
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

  function slug() { return window.OrganizationalBudget.getState?.()?.slug || ''; }
  function programs() { return window.OrganizationalBudget.getState?.()?.programs || []; }

  // ── Item panel helpers ────────────────────────────────────────────────────────
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

  function closeItemPanel() {
    window.OrganizationalBudget.panel?.close('item');
  }

  function showItemPanelError(msg) {
    const { error } = getPanelRefs();
    if (error) { error.textContent = msg || ''; error.hidden = !msg; }
  }

  // ── Allocation panel ──────────────────────────────────────────────────────────
  function renderAllocPanelBody(schedule, detail, fy, accounts) {
    const postingA = (accounts || []).filter(a => a.is_posting);
    const progs    = programs();

    const acctOpts = postingA.map(a =>
      '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
    const srcAcctOpts = [{ id: '', name: '— None —' }, ...postingA].map(a =>
      '<option value="' + (a.id || '') + '"' + (schedule && schedule.source_account_id === a.id ? ' selected' : '') + '>' + esc(a.name || a.code || '— None —') + '</option>'
    ).join('');

    const distType   = schedule ? schedule.distribution_type : 'fixed_percent_by_program';
    const monthPat   = schedule ? schedule.monthly_pattern   : 'even';
    const totalDollars = schedule ? (schedule.total_amount_cents / 100).toFixed(2) : '';
    const lines   = (detail && detail.lines)   || [];
    const monthly = (detail && detail.monthly) || [];

    function lineRowHtml(line, dt) {
      const progId    = line ? line.coop_program_id : '';
      const acctId    = line ? line.coop_account_id : '';
      const isPercent = dt === 'fixed_percent_by_program';
      const val = line ? (isPercent ? (line.percent_bps / 100).toFixed(2) : (line.amount_cents / 100).toFixed(2)) : '';
      const progSelect = '<select class="organizational-select alloc-prog-sel"><option value="">— Program —</option>'
        + progs.map(p => '<option value="' + p.id + '"' + (p.id === progId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>';
      const acctSelect = '<select class="organizational-select alloc-acct-sel"><option value="">— Account —</option>'
        + postingA.map(a => '<option value="' + a.id + '"' + (a.id === acctId ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('') + '</select>';
      return '<div class="organizational-alloc-line-row">'
        + progSelect + acctSelect
        + '<input type="number" class="organizational-input alloc-val-input" value="' + val + '" min="0" step="0.01" placeholder="0.00" style="width:80px">'
        + '<span class="alloc-val-unit" style="color:var(--text-secondary);font-size:0.8125rem">' + (isPercent ? '%' : '$') + '</span>'
        + '<button type="button" class="organizational-btn-icon alloc-remove-line" title="Remove">✕</button>'
        + '</div>';
    }

    const linesHtml   = lines.length ? lines.map(l => lineRowHtml(l, distType)).join('') : lineRowHtml(null, distType);
    const monthlyHtml = MONTHS_SHORT.map((n, i) => {
      const row = monthly.find(m => m.period_month === i + 1);
      const pct = row ? (row.percent_bps / 100).toFixed(2) : '';
      return '<label class="organizational-alloc-month-input"><span>' + n + '</span><input type="number" class="organizational-input alloc-month-pct" data-month="' + (i + 1) + '" value="' + pct + '" min="0" max="100" step="0.01" placeholder="0" style="width:56px"></label>';
    }).join('');

    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row"><label class="organizational-label" style="flex:2">Name *<input type="text" id="alloc-name" class="organizational-input" value="' + esc(schedule ? schedule.name : '') + '" placeholder="e.g. Admin overhead" required></label><label class="organizational-label">Total ($) *<input type="number" id="alloc-total" class="organizational-input" value="' + totalDollars + '" min="0" step="0.01" placeholder="0.00" style="width:110px"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Description<textarea id="alloc-desc" rows="2" placeholder="Optional">' + esc(schedule && schedule.description ? schedule.description : '') + '</textarea></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Source account<select id="alloc-source" class="organizational-select"><option value="">— None —</option>' + srcAcctOpts + '</select></label></div>'
      + '<div class="organizational-panel-field-row"><span class="organizational-label" style="margin-bottom:0">Distribution</span><div class="organizational-seg-toggle" id="alloc-dist-toggle"><button type="button" class="organizational-seg-btn' + (distType === 'fixed_percent_by_program' ? ' active' : '') + '" data-dt="fixed_percent_by_program">% by program</button><button type="button" class="organizational-seg-btn' + (distType === 'fixed_amount_by_program' ? ' active' : '') + '" data-dt="fixed_amount_by_program">$ by program</button></div></div>'
      + '<div class="organizational-panel-field-row"><span class="organizational-label" style="margin-bottom:0">Monthly</span><div class="organizational-seg-toggle" id="alloc-month-toggle"><button type="button" class="organizational-seg-btn' + (monthPat === 'even' ? ' active' : '') + '" data-mp="even">Even</button><button type="button" class="organizational-seg-btn' + (monthPat === 'monthly_custom' ? ' active' : '') + '" data-mp="monthly_custom">Custom monthly</button></div></div>'
      + '<div class="organizational-panel-section-head">Program allocations</div>'
      + '<div id="alloc-lines-wrap">' + linesHtml + '</div>'
      + '<div style="display:flex;align-items:center;gap:12px;margin-top:8px"><button type="button" id="alloc-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem">+ Add program</button><span id="alloc-lines-total" style="font-size:0.8125rem;color:var(--text-secondary)"></span></div>'
      + '<div id="alloc-monthly-section" style="' + (monthPat === 'monthly_custom' ? '' : 'display:none') + '"><div class="organizational-panel-section-head" style="margin-top:16px">Monthly distribution (%)</div><div class="organizational-alloc-months-grid">' + monthlyHtml + '</div><div id="alloc-monthly-total" style="font-size:0.8125rem;color:var(--text-secondary);margin-top:6px"></div></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + (schedule ? '<button type="button" id="alloc-delete" class="organizational-btn organizational-btn-danger" style="margin-right:auto">Delete</button>' : '')
      + '<button type="button" id="alloc-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="alloc-save" class="organizational-btn organizational-btn-primary">' + (schedule ? 'Save changes' : 'Create schedule') + '</button>'
      + '</div>';
  }

  function wireAllocPanel(body, schedule, detail, fy, accounts) {
    const sl        = slug();
    const postingA  = (accounts || []).filter(a => a.is_posting);
    const progs     = programs();
    let distType    = schedule ? schedule.distribution_type : 'fixed_percent_by_program';
    let monthPat    = schedule ? schedule.monthly_pattern   : 'even';

    const linesWrap    = body.querySelector('#alloc-lines-wrap');
    const linesTotalEl = body.querySelector('#alloc-lines-total');
    const monthSection = body.querySelector('#alloc-monthly-section');
    const monthTotalEl = body.querySelector('#alloc-monthly-total');
    const totalInput   = body.querySelector('#alloc-total');

    function refreshLinesTotalDisplay() {
      if (!linesTotalEl || !linesWrap) return;
      let sum = 0;
      linesWrap.querySelectorAll('.alloc-val-input').forEach(inp => { sum += parseFloat(inp.value || 0) || 0; });
      if (distType === 'fixed_percent_by_program') {
        const ok = Math.abs(sum - 100) < 0.01;
        linesTotalEl.textContent = 'Total: ' + sum.toFixed(2) + '% (must equal 100%)';
        linesTotalEl.style.color = ok ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
      } else {
        const totalAmt = parseFloat(totalInput?.value || 0) || 0;
        const ok = Math.abs(sum - totalAmt) < 0.01;
        linesTotalEl.textContent = 'Total: $' + sum.toFixed(2) + ' (must equal $' + totalAmt.toFixed(2) + ')';
        linesTotalEl.style.color = ok ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
      }
    }

    function refreshMonthlyTotalDisplay() {
      if (!monthTotalEl) return;
      let sum = 0;
      body.querySelectorAll('.alloc-month-pct').forEach(inp => { sum += parseFloat(inp.value || 0) || 0; });
      const ok = Math.abs(sum - 100) < 0.01;
      monthTotalEl.textContent = 'Total: ' + sum.toFixed(2) + '% (must equal 100%)';
      monthTotalEl.style.color = ok ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
    }

    function makeLineRow(line) {
      const div     = document.createElement('div');
      div.className = 'organizational-alloc-line-row';
      const isPercent = distType === 'fixed_percent_by_program';
      const progSel = document.createElement('select'); progSel.className = 'organizational-select alloc-prog-sel';
      progSel.innerHTML = '<option value="">— Program —</option>' + progs.map(p =>
        '<option value="' + p.id + '"' + (line && line.coop_program_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'
      ).join('');
      const acctSel = document.createElement('select'); acctSel.className = 'organizational-select alloc-acct-sel';
      acctSel.innerHTML = '<option value="">— Account —</option>' + postingA.map(a =>
        '<option value="' + a.id + '"' + (line && line.coop_account_id === a.id ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
      ).join('');
      const valInput = document.createElement('input');
      valInput.type = 'number'; valInput.className = 'organizational-input alloc-val-input';
      valInput.min = '0'; valInput.step = '0.01'; valInput.style.width = '80px'; valInput.placeholder = '0.00';
      if (line) valInput.value = isPercent ? (line.percent_bps / 100).toFixed(2) : (line.amount_cents / 100).toFixed(2);
      const unitSpan = document.createElement('span');
      unitSpan.className = 'alloc-val-unit'; unitSpan.textContent = isPercent ? '%' : '$';
      unitSpan.style.cssText = 'color:var(--text-secondary);font-size:0.8125rem';
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button'; rmBtn.className = 'organizational-btn-icon alloc-remove-line'; rmBtn.title = 'Remove'; rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', () => { div.remove(); refreshLinesTotalDisplay(); });
      valInput.addEventListener('input', refreshLinesTotalDisplay);
      div.append(progSel, acctSel, valInput, unitSpan, rmBtn);
      return div;
    }

    // Wire remove + input on initial rows
    linesWrap?.querySelectorAll('.organizational-alloc-line-row').forEach(row => {
      row.querySelector('.alloc-remove-line')?.addEventListener('click', () => { row.remove(); refreshLinesTotalDisplay(); });
      row.querySelector('.alloc-val-input')?.addEventListener('input', refreshLinesTotalDisplay);
    });

    totalInput?.addEventListener('input', refreshLinesTotalDisplay);

    // Distribution toggle
    body.querySelectorAll('[data-dt]').forEach(btn => {
      btn.addEventListener('click', () => {
        distType = btn.dataset.dt;
        body.querySelectorAll('[data-dt]').forEach(b => b.classList.toggle('active', b === btn));
        const isPercent = distType === 'fixed_percent_by_program';
        linesWrap?.querySelectorAll('.alloc-val-unit').forEach(u => { u.textContent = isPercent ? '%' : '$'; });
        linesWrap?.querySelectorAll('.alloc-val-input').forEach(inp => { inp.value = ''; });
        refreshLinesTotalDisplay();
      });
    });

    // Monthly toggle
    body.querySelectorAll('[data-mp]').forEach(btn => {
      btn.addEventListener('click', () => {
        monthPat = btn.dataset.mp;
        body.querySelectorAll('[data-mp]').forEach(b => b.classList.toggle('active', b === btn));
        if (monthSection) monthSection.style.display = monthPat === 'monthly_custom' ? '' : 'none';
        if (monthPat === 'monthly_custom') refreshMonthlyTotalDisplay();
      });
    });

    body.querySelectorAll('.alloc-month-pct').forEach(inp => inp.addEventListener('input', refreshMonthlyTotalDisplay));

    body.querySelector('#alloc-add-line')?.addEventListener('click', () => {
      if (linesWrap) { linesWrap.appendChild(makeLineRow(null)); refreshLinesTotalDisplay(); }
    });

    refreshLinesTotalDisplay();
    if (monthPat === 'monthly_custom') refreshMonthlyTotalDisplay();

    function buildPayload() {
      const name        = body.querySelector('#alloc-name')?.value?.trim() || '';
      const totalDollars = parseFloat(body.querySelector('#alloc-total')?.value || 0) || 0;
      const srcId       = body.querySelector('#alloc-source')?.value;
      const desc        = body.querySelector('#alloc-desc')?.value?.trim() || null;
      const lineRows    = Array.from(linesWrap?.querySelectorAll('.organizational-alloc-line-row') || []);
      const lines = lineRows.map(row => {
        const progId = Number(row.querySelector('.alloc-prog-sel')?.value) || 0;
        const acctId = Number(row.querySelector('.alloc-acct-sel')?.value) || 0;
        const val    = parseFloat(row.querySelector('.alloc-val-input')?.value || 0) || 0;
        return distType === 'fixed_percent_by_program'
          ? { program_id: progId, account_id: acctId, percent_bps: Math.round(val * 100) }
          : { program_id: progId, account_id: acctId, amount_cents: Math.round(val * 100) };
      });
      let monthlyPayload = [];
      if (monthPat === 'monthly_custom') {
        body.querySelectorAll('.alloc-month-pct').forEach(inp => {
          monthlyPayload.push({ period_month: Number(inp.dataset.month), percent_bps: Math.round((parseFloat(inp.value || 0) || 0) * 100) });
        });
      }
      return {
        name, description: desc, fiscal_year: fy,
        total_amount_cents: Math.round(totalDollars * 100),
        total_amount: totalDollars,
        source_account_id: srcId ? Number(srcId) : null,
        distribution_type: distType,
        monthly_pattern:   monthPat,
        active: true, lines, monthly: monthlyPayload,
      };
    }

    const saveBtn   = body.querySelector('#alloc-save');
    const cancelBtn = body.querySelector('#alloc-cancel');
    const deleteBtn = body.querySelector('#alloc-delete');

    cancelBtn?.addEventListener('click', closeItemPanel);

    saveBtn?.addEventListener('click', async () => {
      const p = buildPayload();
      if (!p.name)               { body.querySelector('#alloc-name')?.focus();  showItemPanelError('Name is required.'); return; }
      if (!p.total_amount_cents) { body.querySelector('#alloc-total')?.focus(); showItemPanelError('Total amount is required.'); return; }
      if (!p.lines.length)       { showItemPanelError('At least one program line is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const method = schedule ? 'PATCH' : 'POST';
        const url    = '/api/organizational/orgs/' + encodeURIComponent(sl) + '/allocation-schedules' + (schedule ? '/' + schedule.id : '');
        const res    = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        const json   = await res.json();
        if (!res.ok) { showItemPanelError(json.error || 'Save failed'); saveBtn.disabled = false; saveBtn.textContent = schedule ? 'Save changes' : 'Create schedule'; return; }
        closeItemPanel();
        await render();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) { showItemPanelError(e.message); saveBtn.disabled = false; saveBtn.textContent = schedule ? 'Save changes' : 'Create schedule'; }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('Delete this allocation schedule? All associated budget lines will be removed.')) return;
      deleteBtn.disabled = true;
      try {
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/allocation-schedules/' + schedule.id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok) { showItemPanelError('Delete failed'); deleteBtn.disabled = false; return; }
        closeItemPanel();
        await render();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) { showItemPanelError(e.message); deleteBtn.disabled = false; }
    });
  }

  function openAllocPanel(schedule, detail, fy, accounts) {
    openItemPanel(
      schedule ? (schedule.name || 'Edit schedule') : 'New allocation schedule',
      () => renderAllocPanelBody(schedule, detail, fy, accounts),
      (body) => wireAllocPanel(body, schedule, detail, fy, accounts)
    );
  }

  // ── Tab render ────────────────────────────────────────────────────────────────
  async function render() {
    const state = window.OrganizationalBudget.getState?.() || {};
    const sl    = state.slug;
    const fy    = state.fy;
    const pane  = document.getElementById('organizational-budget-tab-indirect-costs');
    if (!pane) return;
    if (!sl)   { pane.innerHTML = '<p style="padding:16px;">No workspace loaded.</p>'; return; }
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading…</p>';

    try {
      const [accountsJson, schedulesJson] = await Promise.all([
        fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/allocation-schedules?fiscal_year=' + encodeURIComponent(String(fy)), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { schedules: [] }),
      ]);

      const accounts  = accountsJson.accounts || [];
      const schedules = Array.isArray(schedulesJson.schedules) ? schedulesJson.schedules : [];

      const details = await Promise.all(schedules.map(s =>
        fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/allocation-schedules/' + s.id, { credentials: 'same-origin' })
          .then(r => r.ok ? r.json() : null)
      ));

      const distLabel  = { fixed_percent_by_program: '% by program', fixed_amount_by_program: '$ by program' };
      const monthLabel = { even: 'Even', monthly_custom: 'Custom monthly' };

      let rows = '';
      if (schedules.length === 0) {
        rows = '<tr class="organizational-table-empty"><td colspan="5">No indirect cost allocation schedules for FY ' + fy + '.</td></tr>';
      } else {
        schedules.forEach((s, i) => {
          const d        = details[i];
          const lines    = (d && d.lines) || [];
          const progNames = [...new Set(lines.map(l => l.program_name).filter(Boolean))];
          const progCell  = progNames.length ? esc(progNames.join(', ')) : (lines.length ? lines.length + ' program(s)' : '—');
          rows += '<tr class="organizational-sg-row" data-id="' + s.id + '" style="cursor:pointer" title="Click to edit">'
            + '<td>' + esc(s.name) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtUsd(s.total_amount_cents) + '</td>'
            + '<td>' + esc(distLabel[s.distribution_type] || s.distribution_type) + '</td>'
            + '<td>' + esc(monthLabel[s.monthly_pattern] || s.monthly_pattern) + '</td>'
            + '<td>' + progCell + '</td>'
            + '</tr>';
        });
      }

      pane.innerHTML = '<div class="organizational-schedule-pane">'
        + '<div class="organizational-schedule-toolbar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">'
        + '<h3 class="organizational-schedule-heading">Indirect Cost Allocations — FY ' + fy + '</h3>'
        + '<button type="button" id="alloc-new-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:4px 12px;">+ New schedule</button>'
        + '</div>'
        + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 12px;">Allocation schedules distribute an indirect cost total across programs and months.</p>'
        + '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Indirect cost allocation schedules"><thead><tr><th>Name</th><th class="organizational-budget-col-num">Total amount</th><th>Distribution</th><th>Monthly</th><th>Programs</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        + '</div>';

      pane.querySelectorAll('.organizational-sg-row[data-id]').forEach(tr => {
        const id = Number(tr.dataset.id);
        const s  = schedules.find(x => x.id === id);
        const d  = s ? details[schedules.indexOf(s)] : null;
        if (s) tr.addEventListener('click', () => openAllocPanel(s, d, fy, accounts));
      });

      pane.querySelector('#alloc-new-btn')?.addEventListener('click', () => openAllocPanel(null, null, fy, accounts));

    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Error loading indirect cost schedules: ' + esc(e.message) + '</p>';
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.OrganizationalBudget.indirect = { render };
})();
