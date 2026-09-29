/* budget-schedules.js — Insurance + Other Schedules tabs for the coop budget page.
 * Depends on window.OrganizationalBudget.getState() and window.OrganizationalBudget.getItemPanel().
 * Exposes: window.OrganizationalBudget.schedules.renderInsurance(), .renderSchedules()
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const FREQ_LABELS = {
    monthly:       'Evenly across months',
    quarterly:     'Quarterly',
    annual:        'Annual (one-time)',
    one_time:      'One-time',
    custom_months: 'Custom months',
  };
  // UI-only pseudo-frequency: day-accurate proration by policy/period dates.
  // Not a stored `frequency` value — selecting it sets schedule_type='insurance'
  // (frequency stored as 'monthly') so scheduleItemMonthlyAmounts() in
  // budget-grid.js prorates by day instead of by calendar frequency. This is
  // the audit-required day-accurate allocation method, available on any
  // schedule item, not just Insurance-tab policies.
  const DAILY_FREQ_LABEL = 'Day-accurate (dates)';

  // ── Caches ───────────────────────────────────────────────────────────────────
  let scheduleItemsCache  = null;
  let scheduleItemsFY     = null;
  let namedSchedulesCache = null;
  let namedSchedulesFY    = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  }

  function fmtUsd(cents) {
    const n = Number(cents);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100)
      : '—';
  }

  function fmtUnitAmount(cents) {
    const d = cents / 100;
    return '$' + d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return String(iso).slice(0, 10);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtInsAmt(cents) {
    if (!cents || cents <= 0) return '—';
    return '$' + Math.round(cents / 100).toLocaleString('en-US');
  }

  function slug() { return window.OrganizationalBudget.getState?.()?.slug || ''; }

  // ── Item panel helpers ────────────────────────────────────────────────────────
  // Two render targets share the same body/wire functions: the shared sliding
  // overlay panel (Personnel/Insurance/Other Schedules) and an inline target
  // (Budget grid's right-rail panel — same shape, no panel/overlay elements
  // to slide, and a caller-supplied onClose instead of the shared overlay
  // close). `activeTarget` tracks which one is live so closeItemPanel() and
  // showItemPanelError() — called from inside the shared wire function — know
  // where to act without every call site needing to pass it through.
  let activeTarget = null;

  function getPanelRefs() { return window.OrganizationalBudget.getItemPanel?.() || {}; }

  function slidingTarget() {
    const refs = getPanelRefs();
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

  function openItemPanel(title, renderFn, wireFn) {
    renderIntoTarget(slidingTarget(), title, renderFn, wireFn);
  }

  function closeItemPanel() {
    const t = activeTarget;
    activeTarget = null;
    if (t && t.onClose) { t.onClose(); return; }
    window.OrganizationalBudget.panel?.close('item');
  }

  // Escape closes whichever panel is currently open -- see budget-personnel.js's identical
  // handler for rationale (same renderIntoTarget/activeTarget shape, same convention).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (activeTarget && activeTarget.panelEl && !activeTarget.panelEl.hidden) closeItemPanel();
  });

  function showItemPanelError(msg) {
    const errorEl = activeTarget?.errorEl || slidingTarget().errorEl;
    if (errorEl) { errorEl.textContent = msg || ''; errorEl.hidden = !msg; }
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
  async function loadScheduleItems(forceReload) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy    = state.fy;
    const sl    = state.slug;
    if (!forceReload && scheduleItemsCache && scheduleItemsFY === fy) return scheduleItemsCache;
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/schedule-items?fiscal_year=' + fy, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load schedule items');
    const json = await res.json();
    scheduleItemsCache = json.items || [];
    scheduleItemsFY    = fy;
    return scheduleItemsCache;
  }

  async function loadNamedSchedules(forceReload) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy    = state.fy;
    const sl    = state.slug;
    if (!forceReload && namedSchedulesCache && namedSchedulesFY === fy) return namedSchedulesCache;
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/schedules?fiscal_year=' + fy, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load schedules');
    const json = await res.json();
    namedSchedulesCache = json.schedules || [];
    namedSchedulesFY    = fy;
    return namedSchedulesCache;
  }

  function bustCaches() {
    scheduleItemsCache = null;
    scheduleItemsFY    = null;
    window.OrganizationalBudget.grid?.invalidateScheduleCache?.();
  }

  // ── Insurance proration ───────────────────────────────────────────────────────
  function insuranceProrateByDay(startStr, endStr, premiumCents, fiscalYear) {
    if (!startStr || !endStr || !premiumCents || !fiscalYear) return new Array(12).fill(0);
    const pStart = new Date(startStr + 'T00:00:00');
    const pEnd   = new Date(endStr   + 'T00:00:00');
    if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime()) || pEnd < pStart) return new Array(12).fill(0);

    const totalDays = Math.round((pEnd - pStart) / 86400000) + 1;
    const amounts   = new Array(12).fill(0);

    for (let m = 0; m < 12; m++) {
      const mStart = new Date(fiscalYear, m, 1);
      const mEnd   = new Date(fiscalYear, m + 1, 0);
      const overlapStart = new Date(Math.max(pStart, mStart));
      const overlapEnd   = new Date(Math.min(pEnd, mEnd));
      if (overlapEnd < overlapStart) continue;
      const overlapDays = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
      amounts[m] = Math.round((overlapDays / totalDays) * premiumCents);
    }
    return amounts;
  }

  // Same summary rule as the Personnel worker list: none / single (name + %) / count.
  function programAllocLabel(item) {
    const allocs = item.allocations || [];
    if (allocs.length === 0) return item.program_name || 'All';
    if (allocs.length === 1) return (allocs[0].program_name || 'Program ' + allocs[0].coop_program_id) + ' (' + (allocs[0].percent_bps / 100).toFixed(0) + '%)';
    return allocs.length + ' programs';
  }

  // ── Insurance grid ────────────────────────────────────────────────────────────
  function insuranceDisplayCells(item, fy) {
    const amounts  = insuranceProrateByDay(item.policy_start_date, item.policy_end_date, item.unit_amount_cents, fy);
    const fyTotal  = amounts.reduce((s, a) => s + a, 0);
    const acctText = (item.account_code ? item.account_code + ' ' : '') + (item.account_name || '—');
    const monthCells = amounts.map(a => '<td class="organizational-sg-num organizational-sg-month-col">' + fmtInsAmt(a) + '</td>').join('');
    return '<td class="organizational-sg-label">' + esc(item.label) + '</td>'
      + '<td class="organizational-sg-account">' + esc(acctText) + '</td>'
      + '<td class="organizational-sg-program">' + esc(programAllocLabel(item)) + '</td>'
      + '<td class="organizational-sg-num">' + fmtUnitAmount(item.unit_amount_cents) + '</td>'
      + '<td class="organizational-sg-date">' + fmtDate(item.policy_start_date) + '</td>'
      + '<td class="organizational-sg-date">' + fmtDate(item.policy_end_date) + '</td>'
      + monthCells
      + '<td class="organizational-sg-num organizational-sg-total"><strong>' + fmtInsAmt(fyTotal) + '</strong></td>';
  }

  function renderInsuranceGrid(container, items, fy, accounts) {
    const monthHeaders = MONTHS_SHORT.map(n => '<th class="organizational-sg-num organizational-sg-month-col">' + n + '</th>').join('');
    let html = '<table class="organizational-table organizational-sg-table organizational-sg-ins-table"><thead><tr>'
      + '<th>Policy name</th><th>Account</th><th>Program</th>'
      + '<th class="organizational-sg-num">Premium</th><th>Start date</th><th>End date</th>'
      + monthHeaders
      + '<th class="organizational-sg-num">FY Total</th>'
      + '</tr></thead><tbody>';

    for (const item of items) {
      html += '<tr class="organizational-sg-row" data-id="' + item.id + '" style="cursor:pointer" title="Click to edit">' + insuranceDisplayCells(item, fy) + '</tr>';
    }
    if (!items.length) {
      html += '<tr class="organizational-table-empty"><td colspan="20">No insurance policies yet. Click <strong>+ Add policy</strong> to start.</td></tr>';
    }
    html += '<tr class="organizational-sg-add-row"><td colspan="20"><button type="button" class="organizational-sg-add-btn">+ Add policy</button></td></tr>';
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.organizational-sg-row').forEach(tr => {
      const id   = Number(tr.dataset.id);
      const item = items.find(i => i.id === id);
      if (item) tr.addEventListener('click', () => openScheduleItemPanel(item, fy, accounts, { lockAccount: false, afterSave: renderInsurance }));
    });
    container.querySelector('.organizational-sg-add-btn').addEventListener('click', () => openScheduleItemPanel(null, fy, accounts, { lockAccount: false, defaultFrequency: 'daily', afterSave: renderInsurance }));
  }

  // ── Schedule grid ─────────────────────────────────────────────────────────────
  function scheduleMonthSummary(item) {
    if (item.frequency === 'custom_months' && Array.isArray(item.active_months)) {
      return item.active_months.map(m => MONTHS_SHORT[m - 1]).join(', ');
    }
    if (item.frequency === 'monthly')   return 'Months ' + item.start_month + '–' + item.end_month;
    if (item.frequency === 'quarterly') return 'Quarterly from month ' + item.start_month;
    if (item.frequency === 'annual' || item.frequency === 'one_time') return 'Month ' + item.start_month;
    return FREQ_LABELS[item.frequency] || item.frequency;
  }

  function scheduleGridDisplayCells(item) {
    const acctText   = (item.account_code ? item.account_code + ' ' : '') + (item.account_name || '—');
    const totalCents = Math.round(Number(item.quantity) * Number(item.unit_amount_cents));
    const totalText  = '$' + (totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const qtyText    = Number(item.quantity) !== 1 ? Number(item.quantity).toLocaleString() : '';
    return '<td class="organizational-sg-label">'    + esc(item.label)                              + '</td>'
      + '<td class="organizational-sg-account">'     + esc(acctText)                                + '</td>'
      + '<td class="organizational-sg-program">'     + esc(programAllocLabel(item))                 + '</td>'
      + '<td class="organizational-sg-num">'         + qtyText                                      + '</td>'
      + '<td class="organizational-sg-num">'         + fmtUnitAmount(item.unit_amount_cents)         + '</td>'
      + '<td class="organizational-sg-freq">'        + (FREQ_LABELS[item.frequency] || item.frequency) + '</td>'
      + '<td class="organizational-sg-months">'      + scheduleMonthSummary(item)                   + '</td>'
      + '<td class="organizational-sg-num organizational-sg-total"><strong>' + totalText + '</strong></td>';
  }

  function renderScheduleGrid(container, items, _filterType, _defaultType, fy, accounts, namedScheduleId) {
    let html = '<table class="organizational-table organizational-sg-table"><thead><tr>'
      + '<th>Label</th><th>Account</th><th>Program</th>'
      + '<th class="organizational-sg-num">Qty</th><th class="organizational-sg-num">Unit $</th>'
      + '<th>Frequency</th><th>Months</th>'
      + '<th class="organizational-sg-num">Annual</th>'
      + '</tr></thead><tbody>';
    for (const item of items) {
      html += '<tr class="organizational-sg-row" data-id="' + item.id + '" style="cursor:pointer" title="Click to edit">' + scheduleGridDisplayCells(item) + '</tr>';
    }
    if (!items.length) {
      html += '<tr class="organizational-table-empty"><td colspan="8">No items yet. Click <strong>+ Add item</strong> to start.</td></tr>';
    }
    html += '<tr class="organizational-sg-add-row"><td colspan="8"><button type="button" class="organizational-sg-add-btn">+ Add item</button></td></tr>';
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.organizational-sg-row').forEach(tr => {
      const id   = Number(tr.dataset.id);
      const item = items.find(i => i.id === id);
      if (item) tr.addEventListener('click', () => openScheduleItemPanel(item, fy, accounts, { lockAccount: false, namedScheduleId: namedScheduleId || (item.named_schedule_id || null), afterSave: renderSchedules }));
    });
    container.querySelector('.organizational-sg-add-btn').addEventListener('click', () => openScheduleItemPanel(null, fy, accounts, { lockAccount: false, defaultFrequency: 'monthly', namedScheduleId: namedScheduleId || null, afterSave: renderSchedules }));
  }

  // ── Shared schedule-item panel ────────────────────────────────────────────────
  // Backs Insurance, Other Schedules, AND the Budget grid's sub-rows — one
  // implementation, one look, one place for allocation + notes per line item.
  // `opts`:
  //   lockAccount      — true from a Budget-grid row: account shown read-only
  //                      (re-pointing an account is a COA/Xero-sync admin task,
  //                      not a line-item edit)
  //   defaultFrequency — preselected Frequency for a brand-new item
  //   namedScheduleId  — Other Schedules grouping
  //   afterSave(item)  — extra refresh to run after a successful save/delete
  //                      (e.g. re-render the Insurance/Schedules tab list)
  function renderScheduleItemPanelBody(item, fy, accounts, opts) {
    opts = opts || {};
    const isNew     = !item || !item.id;
    const programs  = window.OrganizationalBudget.getState?.()?.programs || [];
    const postingA  = (accounts || []).filter(a => a.is_posting);

    const acctField = opts.lockAccount
      ? '<span class="organizational-panel-derived" id="sched-account-fixed">'
        + esc((item && item.account_code ? item.account_code + ' — ' : '') + (item && item.account_name ? item.account_name : '—'))
        + '</span><input type="hidden" id="sched-account" value="' + (item && item.account_id ? item.account_id : '') + '">'
      : '<select id="sched-account" class="organizational-select"><option value="">— Select account —</option>'
        + postingA.map(a => '<option value="' + a.id + '"' + (item && item.account_id === a.id ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('')
        + '</select>';
    // Program allocations — same multi-program % split as the Personnel panel
    // (org_schedule_item_allocations mirrors org_personnel_allocations).
    // A brand-new item opened with a single default program (opts.defaultProgramId,
    // e.g. the grid's active program filter) is pre-filled at 100%.
    const allocMap = {};
    (item && item.allocations || []).forEach(a => { allocMap[a.coop_program_id] = a.percent_bps / 100; });
    if (isNew && opts.defaultProgramId && !Object.keys(allocMap).length) {
      allocMap[opts.defaultProgramId] = 100;
    }
    const allocRowsHtml = programs.map(p => {
      const pct = allocMap[p.id] || '';
      return '<div class="cpn-alloc-row"><label>' + esc(p.name) + '</label>'
        + '<input type="number" class="organizational-input cpn-alloc-input" data-program-id="' + p.id + '" value="' + pct + '" min="0" max="100" step="1" placeholder="0">'
        + '<span style="font-size:0.8125rem;color:var(--text-secondary);">%</span></div>';
    }).join('');

    const freq      = isNew ? (opts.defaultFrequency || 'monthly') : (item.schedule_type === 'insurance' ? 'daily' : (item.frequency || 'monthly'));
    const isDaily   = freq === 'daily';
    const freqOpts  = Object.entries(FREQ_LABELS).map(([v, l]) => '<option value="' + v + '"' + (freq === v ? ' selected' : '') + '>' + l + '</option>').join('')
      + '<option value="daily"' + (isDaily ? ' selected' : '') + '>' + DAILY_FREQ_LABEL + '</option>';

    const startM    = item ? item.start_month : 1;
    const endM      = item ? item.end_month   : 12;
    const monthOpts = (sel) => MONTHS.map((n, i) => '<option value="' + (i + 1) + '"' + (sel === i + 1 ? ' selected' : '') + '>' + n + '</option>').join('');
    const customMonths = item && item.active_months ? item.active_months : [];
    const qty        = item ? item.quantity : 1;
    const unitAmt    = item && item.unit_amount_cents ? (item.unit_amount_cents / 100).toFixed(2) : '';
    const totalCents = item ? Math.round(Number(item.quantity || 1) * Number(item.unit_amount_cents || 0)) : 0;

    const startDate = item && item.policy_start_date ? String(item.policy_start_date).slice(0, 10) : '';
    const endDate   = item && item.policy_end_date   ? String(item.policy_end_date).slice(0, 10)   : '';
    const initAmounts = (item && item.unit_amount_cents && startDate && endDate)
      ? insuranceProrateByDay(startDate, endDate, item.unit_amount_cents, fy) : new Array(12).fill(0);
    const monthTiles = MONTHS_SHORT.map((n, i) =>
      '<div class="organizational-ins-tile"><div class="organizational-ins-tile-label">' + n + '</div>'
      + '<div class="organizational-ins-tile-amt" data-m="' + i + '">' + (initAmounts[i] > 0 ? '$' + Math.round(initAmounts[i] / 100).toLocaleString('en-US') : '—') + '</div></div>'
    ).join('');

    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="sched-label" class="organizational-input" value="' + esc(item ? item.label : '') + '" placeholder="e.g. General liability, Staff retreat" required></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Account' + (opts.lockAccount ? '' : ' *') + acctField + '</label></div>'
      + (programs.length
        ? '<div class="organizational-panel-field-full"><div class="organizational-panel-section-head">Program allocations</div><div class="cpn-alloc-list">' + allocRowsHtml + '</div><p class="cpn-alloc-total" id="sched-alloc-total"></p></div>'
        : '')
      + '<div class="organizational-panel-field-full" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 14px;">'
      + '<label class="organizational-label" id="sched-qty-wrap">Quantity<input type="number" id="sched-qty" class="organizational-input" value="' + qty + '" min="0" step="any" placeholder="1"></label>'
      + '<label class="organizational-label"><span id="sched-unit-label-text">' + (isDaily ? 'Total amount ($) *' : 'Unit amount ($)') + '</span><input type="number" id="sched-unit" class="organizational-input" value="' + unitAmt + '" min="0" step="0.01" placeholder="0.00"></label>'
      + '<label class="organizational-label">Annual total<span class="organizational-panel-derived" id="sched-total">' + (totalCents ? '$' + (totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '—') + '</span></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Frequency<select id="sched-freq" class="organizational-select">' + freqOpts + '</select></label></div>'
      + '<div id="sched-range-row" class="organizational-panel-field-row" style="display:' + (isDaily ? 'none' : '') + '"><label class="organizational-label">Start month<select id="sched-start" class="organizational-select">' + monthOpts(startM) + '</select></label><label id="sched-end-label" class="organizational-label">End month<select id="sched-end" class="organizational-select">' + monthOpts(endM) + '</select></label></div>'
      + '<div id="sched-custom-row" class="organizational-panel-field-full" style="display:none"><span class="organizational-label" style="margin-bottom:6px;display:block">Active months</span><div class="organizational-month-checks">'
      + MONTHS_SHORT.map((n, i) => '<label class="organizational-month-check"><input type="checkbox" name="active_months" value="' + (i + 1) + '"' + (customMonths.includes(i + 1) ? ' checked' : '') + '><span>' + n + '</span></label>').join('')
      + '</div></div>'
      + '<div id="sched-dates-row" class="organizational-panel-field-row" style="display:' + (isDaily ? '' : 'none') + '"><label class="organizational-label">Start date<input type="date" id="sched-start-date" class="organizational-input" value="' + startDate + '"></label><label class="organizational-label">End date<input type="date" id="sched-end-date" class="organizational-input" value="' + endDate + '"></label></div>'
      + '<div id="sched-tiles-wrap" class="organizational-panel-field-full" style="display:' + (isDaily ? '' : 'none') + '">'
      + '<div class="organizational-panel-section-head">Monthly breakdown (auto-calculated by day)</div>'
      + '<div class="organizational-ins-tiles">' + monthTiles + '</div>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Notes<textarea id="sched-notes" rows="2" placeholder="Optional">' + esc(item && item.notes ? item.notes : '') + '</textarea></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + (item && item.id ? '<button type="button" id="sched-delete" class="organizational-btn organizational-btn-danger" style="margin-right:auto">Delete</button>' : '')
      + '<button type="button" id="sched-attach" class="organizational-btn organizational-btn-outline" disabled title="Coming soon">Attach file (coming soon)</button>'
      + '<button type="button" id="sched-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="sched-save" class="organizational-btn organizational-btn-primary">' + (item && item.id ? 'Save changes' : 'Add item') + '</button>'
      + '</div>';
  }

  function wireScheduleItemPanelBody(body, item, fy, accounts, opts) {
    opts = opts || {};
    const sl        = slug();
    const freqSel   = body.querySelector('#sched-freq');
    const qtyWrap   = body.querySelector('#sched-qty-wrap');
    const rangeRow  = body.querySelector('#sched-range-row');
    const customRow = body.querySelector('#sched-custom-row');
    const datesRow  = body.querySelector('#sched-dates-row');
    const tilesWrap = body.querySelector('#sched-tiles-wrap');
    const endLabel  = body.querySelector('#sched-end-label');
    const unitLabelText  = body.querySelector('#sched-unit-label-text');
    const qtyInput  = body.querySelector('#sched-qty');
    const unitInput = body.querySelector('#sched-unit');
    const totalEl   = body.querySelector('#sched-total');
    const startDateInput = body.querySelector('#sched-start-date');
    const endDateInput   = body.querySelector('#sched-end-date');

    function refreshTotal() {
      if (!totalEl) return;
      const qty  = parseFloat(qtyInput?.value  || 1) || 0;
      const unit = parseFloat(unitInput?.value || 0) || 0;
      const tot  = Math.round(qty * unit * 100);
      totalEl.textContent = tot ? '$' + (tot / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
    }

    function refreshTiles() {
      if (!tilesWrap) return;
      const premCents = Math.round((parseFloat(unitInput?.value || 0) || 0) * 100);
      const amounts   = insuranceProrateByDay(startDateInput?.value || '', endDateInput?.value || '', premCents, fy);
      body.querySelectorAll('.organizational-ins-tile-amt').forEach(el => {
        const m = parseInt(el.dataset.m, 10);
        el.textContent = amounts[m] > 0 ? '$' + Math.round(amounts[m] / 100).toLocaleString('en-US') : '—';
      });
    }

    function updateFreqControls() {
      if (!freqSel) return;
      const freq      = freqSel.value;
      const isCustom  = freq === 'custom_months';
      const isMonthly = freq === 'monthly';
      const isDaily   = freq === 'daily';
      if (qtyWrap)   qtyWrap.style.display   = isDaily ? 'none' : '';
      if (customRow) customRow.style.display = isCustom ? '' : 'none';
      if (rangeRow)  rangeRow.style.display  = (isCustom || isDaily) ? 'none' : '';
      if (datesRow)  datesRow.style.display  = isDaily ? '' : 'none';
      if (tilesWrap) tilesWrap.style.display = isDaily ? '' : 'none';
      if (endLabel)  endLabel.style.display  = isMonthly ? '' : 'none';
      if (unitLabelText) unitLabelText.textContent = isDaily ? 'Total amount ($) *' : 'Unit amount ($)';
      if (isDaily) refreshTiles(); else refreshTotal();
    }
    if (freqSel) { freqSel.addEventListener('change', updateFreqControls); updateFreqControls(); }

    qtyInput?.addEventListener('input', refreshTotal);
    unitInput?.addEventListener('input', () => { freqSel?.value === 'daily' ? refreshTiles() : refreshTotal(); });
    startDateInput?.addEventListener('input', refreshTiles);
    endDateInput?.addEventListener('input', refreshTiles);

    // Program allocation running total — same pattern as the Personnel panel.
    const updateAllocTotal = () => {
      let total = 0;
      body.querySelectorAll('.cpn-alloc-input').forEach(inp => { total += parseFloat(inp.value || '0') || 0; });
      const el = body.querySelector('#sched-alloc-total');
      if (el) {
        el.textContent = 'Total: ' + total.toFixed(0) + '%';
        el.className = 'cpn-alloc-total' + (total > 100.05 ? ' over' : Math.abs(total - 100) < 0.1 && total > 0 ? ' ok' : '');
      }
    };
    body.querySelectorAll('.cpn-alloc-input').forEach(inp => inp.addEventListener('input', updateAllocTotal));
    updateAllocTotal();

    function payload() {
      const freq = freqSel ? freqSel.value : 'monthly';
      const isDailyNow = freq === 'daily';
      const activeMonths = freq === 'custom_months'
        ? Array.from(body.querySelectorAll('[name="active_months"]:checked')).map(cb => Number(cb.value))
        : null;
      const accountId = opts.lockAccount
        ? (item ? item.account_id : null)
        : (Number(body.querySelector('#sched-account')?.value) || null);
      return {
        fiscal_year:       fy,
        label:             body.querySelector('#sched-label')?.value?.trim() || '',
        schedule_type:     isDailyNow ? 'insurance' : 'custom',
        account_id:        accountId,
        allocations:       Array.from(body.querySelectorAll('.cpn-alloc-input')).reduce((acc, inp) => {
          const pct = parseFloat(inp.value || '0') || 0;
          if (pct > 0) acc.push({ coop_program_id: Number(inp.dataset.programId), percent_bps: Math.round(pct * 100) });
          return acc;
        }, []),
        grant_id:          item && item.grant_id ? item.grant_id : null,
        named_schedule_id: opts.namedScheduleId || (item && item.named_schedule_id) || null,
        quantity:          isDailyNow ? 1 : (parseFloat(body.querySelector('#sched-qty')?.value || 1) || 1),
        unit_amount_cents: Math.round((parseFloat(body.querySelector('#sched-unit')?.value || 0) || 0) * 100),
        frequency:         isDailyNow ? 'monthly' : freq,
        active_months:     activeMonths,
        start_month:       isDailyNow ? 1  : (Number(body.querySelector('#sched-start')?.value) || 1),
        end_month:         isDailyNow ? 12 : (Number(body.querySelector('#sched-end')?.value || body.querySelector('#sched-start')?.value) || 12),
        policy_start_date: isDailyNow ? (body.querySelector('#sched-start-date')?.value || null) : null,
        policy_end_date:   isDailyNow ? (body.querySelector('#sched-end-date')?.value   || null) : null,
        notes:             body.querySelector('#sched-notes')?.value?.trim() || null,
      };
    }

    const saveBtn   = body.querySelector('#sched-save');
    const cancelBtn = body.querySelector('#sched-cancel');
    const deleteBtn = body.querySelector('#sched-delete');

    cancelBtn?.addEventListener('click', closeItemPanel);

    saveBtn?.addEventListener('click', async () => {
      const p = payload();
      const isEdit = !!(item && item.id);
      if (!p.label)      { body.querySelector('#sched-label')?.focus(); showItemPanelError('Name is required.'); return; }
      if (!p.account_id) { body.querySelector('#sched-account')?.focus?.(); showItemPanelError('Account is required.'); return; }
      showItemPanelError('');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const method = isEdit ? 'PATCH' : 'POST';
        const url    = '/api/organizational/orgs/' + encodeURIComponent(sl) + '/schedule-items' + (isEdit ? '/' + item.id : '');
        const res    = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        const json   = await res.json();
        if (!res.ok) { showItemPanelError(json.error || 'Save failed'); saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save changes' : 'Add item'; return; }
        closeItemPanel();
        bustCaches();
        if (opts.afterSave) await opts.afterSave();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) { showItemPanelError(e.message); saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save changes' : 'Add item'; }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!item || !item.id) return;
      if (!confirm('Delete this item? Its budget lines will be removed.')) return;
      deleteBtn.disabled = true;
      try {
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/schedule-items/' + item.id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok) { showItemPanelError('Delete failed'); deleteBtn.disabled = false; return; }
        closeItemPanel();
        bustCaches();
        if (opts.afterSave) await opts.afterSave();
        window.OrganizationalBudget.reloadGrid?.();
      } catch (e) { showItemPanelError(e.message); deleteBtn.disabled = false; }
    });
  }

  function openScheduleItemPanel(item, fy, accounts, opts) {
    opts = opts || {};
    const isNew = !item || !item.id;
    openItemPanel(
      isNew ? 'Add item' : (item.label || 'Edit item'),
      () => renderScheduleItemPanelBody(item, fy, accounts, opts),
      (body) => wireScheduleItemPanelBody(body, item, fy, accounts, opts)
    );
  }

  // ── Tab renders ───────────────────────────────────────────────────────────────
  async function renderInsurance() {
    const state  = window.OrganizationalBudget.getState?.() || {};
    const sl     = state.slug;
    const fy     = state.fy;
    const pane   = document.getElementById('organizational-budget-tab-insurance');
    if (!pane) return;
    if (!sl)   { pane.innerHTML = '<p style="padding:16px;">No workspace loaded.</p>'; return; }
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading…</p>';
    try {
      const [items, accounts] = await Promise.all([
        loadScheduleItems(true),
        fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.accounts || []),
      ]);
      const insuranceItems = items.filter(i => i.schedule_type === 'insurance');
      pane.innerHTML = '<div class="organizational-schedule-pane">'
        + '<div class="organizational-schedule-toolbar"><h3 class="organizational-schedule-heading">Insurance Schedules — FY ' + fy + '</h3>'
        + '<p class="organizational-schedule-hint">Enter total premium and policy dates. Monthly amounts are calculated automatically by day.</p></div>'
        + '<div class="organizational-sg-container organizational-sg-ins-container"></div>'
        + '</div>';
      renderInsuranceGrid(pane.querySelector('.organizational-sg-ins-container'), insuranceItems, fy, accounts);
    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Could not load insurance schedules: ' + esc(e.message) + '</p>';
    }
  }

  async function renderSchedules() {
    const state = window.OrganizationalBudget.getState?.() || {};
    const sl    = state.slug;
    const fy    = state.fy;
    const pane  = document.getElementById('organizational-budget-tab-schedules');
    if (!pane) return;
    if (!sl)   { pane.innerHTML = '<p style="padding:16px;">No workspace loaded.</p>'; return; }
    pane.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Loading…</p>';
    try {
      const [allItems, accounts, namedSchedules] = await Promise.all([
        loadScheduleItems(true),
        fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.accounts || []),
        loadNamedSchedules(true),
      ]);

      const nonInsurance = allItems.filter(i => i.schedule_type !== 'insurance' && i.schedule_type !== 'personnel');
      let selectedScheduleId   = namedSchedules.length ? namedSchedules[0].id : null;
      let selectedScheduleType = namedSchedules.length ? namedSchedules[0].schedule_type : 'custom';

      function buildScheduleOpts() {
        const ungrouped = '<option value=""' + (!selectedScheduleId ? ' selected' : '') + '>Ungrouped items</option>';
        const opts = namedSchedules.map(s => '<option value="' + s.id + '"' + (selectedScheduleId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
        return ungrouped + opts;
      }
      function getFilteredItems() {
        return selectedScheduleId
          ? nonInsurance.filter(i => i.named_schedule_id === selectedScheduleId)
          : nonInsurance.filter(i => !i.named_schedule_id);
      }

      pane.innerHTML = '<div class="organizational-schedule-pane">'
        + '<div class="organizational-schedule-toolbar"><h3 class="organizational-schedule-heading">Other Schedules — FY ' + fy + '</h3></div>'
        + '<div class="organizational-named-schedule-toolbar"><select class="organizational-named-schedule-sel" id="organizational-named-schedule-sel">' + buildScheduleOpts() + '</select><button type="button" class="organizational-sg-add-btn organizational-named-schedule-new-btn" id="organizational-named-schedule-new">+ New schedule</button></div>'
        + '<div id="organizational-named-schedule-form" class="organizational-named-schedule-form" hidden>'
        + '<input type="text" id="organizational-named-schedule-name" class="organizational-sg-input" placeholder="Schedule name" style="min-width:200px">'
        + '<select id="organizational-named-schedule-type" class="organizational-sg-sel"><option value="custom">Custom</option><option value="event">Event / Project</option><option value="depreciation">Depreciation</option><option value="amortization">Amortization</option></select>'
        + '<button type="button" class="organizational-btn-sm organizational-btn-primary" id="organizational-named-schedule-create">Create</button>'
        + '<button type="button" class="organizational-btn-sm" id="organizational-named-schedule-cancel">Cancel</button>'
        + '</div>'
        + '<div class="organizational-sg-container" id="organizational-schedules-grid-container"></div>'
        + '</div>';

      const gridContainer = pane.querySelector('#organizational-schedules-grid-container');
      function refreshGrid() {
        renderScheduleGrid(gridContainer, getFilteredItems(), null, selectedScheduleType, fy, accounts, selectedScheduleId);
      }
      refreshGrid();

      pane.querySelector('#organizational-named-schedule-sel').addEventListener('change', (ev) => {
        const val = ev.target.value;
        selectedScheduleId   = val ? Number(val) : null;
        const found = namedSchedules.find(s => s.id === selectedScheduleId);
        selectedScheduleType = found ? found.schedule_type : 'custom';
        refreshGrid();
      });

      const newBtn    = pane.querySelector('#organizational-named-schedule-new');
      const newForm   = pane.querySelector('#organizational-named-schedule-form');
      const nameInp   = pane.querySelector('#organizational-named-schedule-name');
      const typeSel   = pane.querySelector('#organizational-named-schedule-type');
      const createBtn = pane.querySelector('#organizational-named-schedule-create');
      const cancelBtn = pane.querySelector('#organizational-named-schedule-cancel');

      newBtn.addEventListener('click', () => { newForm.hidden = false; nameInp.value = ''; nameInp.focus(); });
      cancelBtn.addEventListener('click', () => { newForm.hidden = true; });

      createBtn.addEventListener('click', async () => {
        const name = (nameInp.value || '').trim();
        if (!name) { nameInp.focus(); return; }
        createBtn.disabled = true;
        try {
          const res  = await fetch('/api/organizational/orgs/' + encodeURIComponent(sl) + '/schedules',
            { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fiscal_year: fy, name, schedule_type: typeSel.value }) });
          const json = await res.json();
          if (!res.ok) { alert(json.error || 'Could not create schedule'); createBtn.disabled = false; return; }

          namedSchedulesCache = null;
          const freshSchedules = await loadNamedSchedules(true);
          namedSchedules.length = 0;
          freshSchedules.forEach(s => namedSchedules.push(s));

          selectedScheduleId   = json.schedule.id;
          selectedScheduleType = json.schedule.schedule_type;

          const sel = pane.querySelector('#organizational-named-schedule-sel');
          sel.innerHTML = buildScheduleOpts();
          sel.value = String(selectedScheduleId);
          newForm.hidden = true;
          refreshGrid();
        } catch (e) { alert('Error: ' + e.message); createBtn.disabled = false; }
      });

    } catch (e) {
      pane.innerHTML = '<p style="padding:16px;color:var(--color-error);">Could not load schedules: ' + esc(e.message) + '</p>';
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.OrganizationalBudget.schedules = {
    renderInsurance:  renderInsurance,
    renderSchedules:  renderSchedules,
    invalidateCache:  () => { scheduleItemsCache = null; scheduleItemsFY = null; namedSchedulesCache = null; namedSchedulesFY = null; },
  };

  // Let the Budget grid open the shared panel for an existing item by ID
  // (clicking a sub-row). `opts` forwarded as-is — the grid passes
  // { lockAccount: true }.
  window.OrganizationalBudget.openScheduleItemPanel = async function (itemId, opts) {
    const state = window.OrganizationalBudget.getState?.() || {};
    try {
      const items = await loadScheduleItems();
      const item  = items.find(i => i.id === Number(itemId));
      if (!item) return;
      const accounts = await fetch('/api/organizational/orgs/' + encodeURIComponent(state.slug) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.accounts || []);
      openScheduleItemPanel(item, state.fy, accounts, opts);
    } catch (e) { console.error('openScheduleItemPanel:', e); }
  };

  // Let the Budget grid open the shared panel for a brand-new item anchored
  // to a specific account (virtual sub-row / "+ Add item"). `accounts` is
  // passed in from the grid's already-loaded data — no extra fetch needed.
  window.OrganizationalBudget.openScheduleItemPanelNew = function (params) {
    params = params || {};
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy = params.fy || state.fy;
    const fakeItem = {
      account_id:   params.accountId,
      account_name: params.accountName || null,
      grant_id:     params.grantId || null,
      quantity:     1,
      unit_amount_cents: params.existingCents || 0,
      label:        '',
    };
    openScheduleItemPanel(fakeItem, fy, params.accounts || [], {
      lockAccount:       true,
      defaultProgramId:  params.programId || null,
      defaultFrequency: params.defaultFrequency || 'monthly',
    });
  };

  // ── Inline target (Budget grid's right-rail panel) ───────────────────────────
  // Same body/wire functions as the sliding panel, rendered into a caller-
  // supplied target instead — no overlay, no slide, row-click-driven.
  // `target`: { titleEl, errorEl, bodyEl, headerEl, emptyEl, onClose }.
  window.OrganizationalBudget.renderScheduleItemInline = function (target, item, fy, accounts, opts) {
    opts = opts || {};
    const isNew = !item || !item.id;
    renderIntoTarget(target,
      isNew ? 'Add item' : (item.label || 'Edit item'),
      () => renderScheduleItemPanelBody(item, fy, accounts, opts),
      (body) => wireScheduleItemPanelBody(body, item, fy, accounts, opts));
  };

  window.OrganizationalBudget.openScheduleItemInline = async function (itemId, target, opts) {
    const state = window.OrganizationalBudget.getState?.() || {};
    try {
      const items = await loadScheduleItems();
      const item  = items.find(i => i.id === Number(itemId));
      if (!item) return;
      const accounts = await fetch('/api/organizational/orgs/' + encodeURIComponent(state.slug) + '/accounts', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.accounts || []);
      window.OrganizationalBudget.renderScheduleItemInline(target, item, state.fy, accounts, opts);
    } catch (e) { console.error('openScheduleItemInline:', e); }
  };

  window.OrganizationalBudget.openScheduleItemInlineNew = function (target, params) {
    params = params || {};
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy = params.fy || state.fy;
    const fakeItem = {
      account_id:   params.accountId,
      account_name: params.accountName || null,
      grant_id:     params.grantId || null,
      quantity:     1,
      unit_amount_cents: params.existingCents || 0,
      label:        '',
    };
    window.OrganizationalBudget.renderScheduleItemInline(target, fakeItem, fy, params.accounts || [], {
      lockAccount:      true,
      defaultProgramId: params.programId || null,
      defaultFrequency: params.defaultFrequency || 'monthly',
      afterSave:        params.afterSave,
    });
  };
})();
