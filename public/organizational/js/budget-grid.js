/* budget-grid.js — Budget tab: COA setup wizard + monthly grid rendering.
 *
 * Depends on:
 *   - window.OrganizationalBudget.getState()  — shared state from budget-workspace.js
 *   - window.OrganizationalBudget.reloadGrid() — triggers a grid reload
 *   - window.OrganizationalBudget.renderStatStrip(data)
 *   - window.apiJson, window.escapeHtml  — from utils.js
 *
 * Exposes:
 *   window.OrganizationalBudget.grid.load()
 *   window.OrganizationalBudget.grid.invalidateScheduleCache()
 *   window.OrganizationalBudget.grid.updateScrollHeight()
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const TOTAL_COLS         = 14; // monthly view: account + annual + 12 months
  const TOTAL_COLS_TOTALS  = 5;  // totals view: account + budget + actual + forecast + variance

  // ── Last-loaded grid data (so the view-mode toggle can re-render without a refetch) ──
  let lastGridData       = null;
  let lastGridSchedItems = null;
  let lastGridPersonnel  = null;

  // ── Schedule item cache ──────────────────────────────────────────────────────
  let scheduleItemsCache = null;
  let scheduleItemsFY    = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const budgetTbody = document.getElementById('organizational-budget-grid-tbody');

  // ── Inline right-rail panel (row-click line-item editing; no overlay) ────────
  const inlinePanelEl     = document.getElementById('organizational-budget-inline-panel');
  const inlinePanelHeader = document.getElementById('organizational-budget-inline-panel-header');
  const inlinePanelTitle  = document.getElementById('organizational-budget-inline-panel-title');
  const inlinePanelError  = document.getElementById('organizational-budget-inline-panel-error');
  const inlinePanelBody   = document.getElementById('organizational-budget-inline-panel-body');

  function closeInlinePanel() {
    if (inlinePanelEl)     inlinePanelEl.hidden = true;
    if (inlinePanelHeader) inlinePanelHeader.hidden = true;
    if (inlinePanelBody)   inlinePanelBody.innerHTML = '';
    if (inlinePanelError)  { inlinePanelError.hidden = true; inlinePanelError.textContent = ''; }
  }

  function inlineTarget() {
    return {
      panelEl: inlinePanelEl,
      titleEl: inlinePanelTitle,
      errorEl: inlinePanelError,
      bodyEl:  inlinePanelBody,
      headerEl: inlinePanelHeader,
      onClose:  closeInlinePanel,
    };
  }

  document.getElementById('organizational-budget-inline-panel-close')?.addEventListener('click', closeInlinePanel);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const escH = () => window.escapeHtml || (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]));
  const esc  = s => (window.escapeHtml || (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])))(s);

  function parseCents(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function fmtCents(cents) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const n = Number(cents);
    if (!Number.isFinite(n) || n === 0) return '0';
    const opts = {};
    if (!state.showCents) { opts.minimumFractionDigits = 0; opts.maximumFractionDigits = 0; }
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', ...opts }).formatToParts(n / 100);
    return parts.filter(p => p.type !== 'currency').map(p => p.value).join('');
  }

  function fmtTotal(cents) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const n = Number(cents);
    if (!Number.isFinite(n)) return '—';
    const opts = {};
    if (!state.showCents) { opts.minimumFractionDigits = 0; opts.maximumFractionDigits = 0; }
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', ...opts }).format(n / 100);
  }

  // Variance = approved budget minus FY projected: positive means under
  // budget (projected to come in under what was approved), negative means
  // over. No color when there's no budget to compare against.
  function varianceCell(appr, proj, bold) {
    const v = appr - proj;
    const cls = !appr ? '' : v >= 0 ? ' organizational-stat-good' : ' organizational-stat-danger';
    const text = fmtTotal(v);
    return '<td class="organizational-budget-col-num organizational-budget-col-variance' + cls + '">' + (bold ? '<strong>' + text + '</strong>' : text) + '</td>';
  }

  // Returns 0-based month indices in fiscal-year order.
  // E.g. fiscalStartMonth=7 → [6,7,8,9,10,11,0,1,2,3,4,5]
  function fyMonthOrder(fiscalStartMonth) {
    const start = (fiscalStartMonth - 1 + 12) % 12;
    return Array.from({ length: 12 }, (_, i) => (start + i) % 12);
  }

  function scheduleUrl(slug) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy    = state.fy || new Date().getFullYear();
    const pid   = state.programId;
    const gid   = state.grantId;
    let qs = 'fiscal_year=' + fy;
    if (pid) qs += '&program_id=' + pid;
    if (gid) qs += '&grant_id=' + gid;
    return '/api/organizational/orgs/' + encodeURIComponent(slug) + '/schedule-items?' + qs;
  }

  function budgetVsActualUrl(slug) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const fy    = state.fy;
    const pid   = state.programId;
    const gid   = state.grantId;
    let qs = 'fiscal_year=' + encodeURIComponent(String(fy));
    qs += '&program_id=' + encodeURIComponent(pid ? String(pid) : 'all');
    if (gid) qs += '&grant_id=' + encodeURIComponent(String(gid));
    return '/api/organizational/orgs/' + encodeURIComponent(slug) + '/reports/budget-vs-actual?' + qs;
  }

  // ── Personnel (for personnel-sourced accounts' worker sub-rows) ──────────────
  // Experimental: lets the grid show workers as clickable sub-rows, same
  // pattern as schedule items, instead of only a read-only "→ Personnel"
  // badge. Personnel tab stays untouched — this is an additional surface.
  let personnelCache = null;
  let personnelFY    = null;
  async function loadPersonnelForGrid(forceReload) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const slug  = state.slug;
    const fy    = state.fy;
    if (!slug || !fy) return [];
    if (!forceReload && personnelCache && personnelFY === fy) return personnelCache;
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel?fiscal_year=' + fy, { credentials: 'same-origin' });
    if (!res.ok) return [];
    const json = await res.json();
    personnelCache = json.personnel || [];
    personnelFY    = fy;
    return personnelCache;
  }

  // ── Schedule items ────────────────────────────────────────────────────────────
  async function loadScheduleItems(forceReload) {
    const state = window.OrganizationalBudget.getState?.() || {};
    const slug  = state.slug;
    const fy    = state.fy;
    if (!slug) return [];
    if (!forceReload && scheduleItemsCache && scheduleItemsFY === fy) return scheduleItemsCache;
    const res = await fetch(scheduleUrl(slug), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load schedule items');
    const json = await res.json();
    scheduleItemsCache = json.items || [];
    scheduleItemsFY    = fy;
    return scheduleItemsCache;
  }

  // ── Math warning ──────────────────────────────────────────────────────────────
  const mathWarningEl     = document.getElementById('organizational-budget-math-warning');
  const mathWarningTextEl = document.getElementById('organizational-budget-math-warning-text');
  const fixMathBtn        = document.getElementById('organizational-budget-fix-math-btn');
  const mathDismissBtn    = document.getElementById('organizational-budget-math-warning-dismiss');

  if (mathDismissBtn) {
    mathDismissBtn.addEventListener('click', () => {
      if (mathWarningEl) mathWarningEl.hidden = true;
    });
  }
  if (fixMathBtn) {
    fixMathBtn.addEventListener('click', async () => {
      const state = window.OrganizationalBudget.getState?.() || {};
      if (!state.slug || !state.fy) return;
      fixMathBtn.disabled = true; fixMathBtn.textContent = 'Fixing…';
      try {
        await window.apiJson?.(
          '/api/organizational/orgs/' + encodeURIComponent(state.slug) + '/schedule-items/recalc',
          { method: 'POST', body: JSON.stringify({ fiscal_year: state.fy }) }
        );
        scheduleItemsCache = null;
        await window.OrganizationalBudget.grid.load();
      } finally {
        if (fixMathBtn) { fixMathBtn.textContent = 'Fix math'; fixMathBtn.disabled = false; }
      }
    });
  }

  function showMathWarnings(warnings) {
    if (!mathWarningEl || !mathWarningTextEl) return;
    if (!warnings?.length) { mathWarningEl.hidden = true; return; }
    mathWarningTextEl.textContent = warnings.map(w => w.message || w).join(' · ');
    mathWarningEl.hidden = false;
    if (fixMathBtn) { fixMathBtn.textContent = 'Fix math'; fixMathBtn.disabled = false; }
  }

  // ── Top scroll sync ───────────────────────────────────────────────────────────
  let topScrollSyncing   = false;
  let topScrollWired     = false;

  function wireTopScrollSync() {
    if (topScrollWired) return;
    topScrollWired = true;
    const topScroll  = document.getElementById('organizational-budget-top-scroll');
    const gridScroll = document.querySelector('.organizational-budget-grid-with-chevrons .organizational-budget-grid-scroll');
    if (!topScroll || !gridScroll) return;
    topScroll.addEventListener('scroll', () => {
      if (topScrollSyncing) return;
      topScrollSyncing = true; gridScroll.scrollLeft = topScroll.scrollLeft; topScrollSyncing = false;
    });
    gridScroll.addEventListener('scroll', () => {
      if (topScrollSyncing) return;
      topScrollSyncing = true; topScroll.scrollLeft = gridScroll.scrollLeft; topScrollSyncing = false;
    });
  }

  function syncTopScrollWidth() {
    const topScrollInner = document.getElementById('organizational-budget-top-scroll-inner');
    const gridScroll = document.querySelector('.organizational-budget-grid-with-chevrons .organizational-budget-grid-scroll');
    if (!topScrollInner || !gridScroll) return;
    const table = gridScroll.querySelector('table');
    if (table) topScrollInner.style.width = table.scrollWidth + 'px';
    updateScrollHeight();
    updateTheadRowHeight();
    updateTopScrollVisibility();
  }

  // The top scrollbar+chevrons are only useful when the grid actually
  // overflows horizontally — no reason to show a scroll affordance for a
  // table that already fits (this is why Totals' narrow columns should
  // never show it, while Monthly's 12+ columns usually will).
  function updateTopScrollVisibility() {
    const topScrollRow = document.getElementById('organizational-budget-top-scroll-row');
    const gridScroll = document.querySelector('.organizational-budget-grid-with-chevrons .organizational-budget-grid-scroll');
    if (!topScrollRow || !gridScroll) return;
    const table = gridScroll.querySelector('table');
    const overflowing = !!table && table.scrollWidth > gridScroll.clientWidth + 1;
    topScrollRow.hidden = !overflowing;
  }

  function updateScrollHeight() {
    const stickyHeader = document.querySelector('.organizational-budget-sticky-header');
    const gridScroll   = document.querySelector('.organizational-budget-grid-with-chevrons .organizational-budget-grid-scroll');
    if (!stickyHeader || !gridScroll) return;
    // Use the sticky header's bottom edge in viewport coords: accounts for any
    // padding above the header in .organizational-main without hardcoding magic numbers.
    const headerBottom = stickyHeader.getBoundingClientRect().bottom;
    const h = window.innerHeight - headerBottom - 4;
    gridScroll.style.height    = Math.max(h, 200) + 'px';
    gridScroll.style.overflowY = 'auto';
  }

  function updateTheadRowHeight() {
    const table = document.querySelector('.organizational-budget-grid');
    if (!table) return;
    const firstRow = table.querySelector('thead tr');
    if (firstRow) table.style.setProperty('--budget-thead-row1-h', firstRow.offsetHeight + 'px');
  }

  // ── COA setup wizard ──────────────────────────────────────────────────────────
  async function renderCOASetup(slug) {
    if (!budgetTbody) return;

    // Replace the table with a full-width setup panel
    const table = budgetTbody.closest('table');
    const wrap  = table?.closest('.organizational-budget-grid-scroll');
    if (!wrap) return;

    const setupDiv = document.createElement('div');
    setupDiv.id = 'organizational-budget-setup';
    setupDiv.style.cssText = 'padding:32px 24px;max-width:680px;';
    setupDiv.innerHTML = '<h2 style="font-size:1.1rem;font-weight:600;margin:0 0 8px;">Set up your chart of accounts</h2>'
      + '<p style="font-size:0.875rem;color:var(--text-secondary);margin:0 0 24px;">Choose a starting template or import from Xero. You can customize accounts after setup.</p>'
      + '<div id="organizational-coa-paths" style="display:flex;flex-direction:column;gap:12px;">'
      + '<p style="font-size:0.875rem;color:var(--text-secondary);">Loading templates…</p>'
      + '</div>';
    if (table) table.hidden = true;
    wrap.appendChild(setupDiv);

    // Load templates from server
    const out = await window.apiJson?.('/api/organizational/orgs/' + encodeURIComponent(slug) + '/account-templates', { method: 'GET' });
    const templates = out?.res.ok && Array.isArray(out.data.templates) ? out.data.templates : [];

    const pathsDiv = setupDiv.querySelector('#organizational-coa-paths');
    if (!templates.length) {
      pathsDiv.innerHTML = '<p style="color:var(--color-error);">Could not load templates.</p>';
      return;
    }

    // Build template cards
    let html = '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;">';
    templates.forEach((t, idx) => {
      const isFirst = idx === 0;
      html += '<div class="organizational-coa-template-card' + (isFirst ? ' organizational-coa-template-card--selected' : '') + '"'
        + ' data-template-idx="' + idx + '" style="border:2px solid ' + (isFirst ? 'var(--accent,#800020)' : 'var(--border,#ddd)') + ';border-radius:8px;padding:14px 18px;cursor:pointer;min-width:180px;flex:1;">'
        + '<div style="font-weight:600;font-size:0.9rem;">' + esc(t.name) + (isFirst ? ' <span style="font-size:0.75rem;color:var(--accent,#800020);">recommended</span>' : '') + '</div>'
        + '<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">' + esc(t.description || '') + '</div>'
        + '</div>';
    });
    html += '</div>';

    // Account preview (collapsible)
    html += '<details style="font-size:0.8125rem;margin-bottom:20px;"><summary style="cursor:pointer;font-weight:500;padding:4px 0;">Preview accounts</summary>'
      + '<div id="organizational-coa-preview" style="margin-top:8px;padding:12px;background:var(--bg-secondary,#f9f9f9);border-radius:6px;max-height:240px;overflow-y:auto;">'
      + renderTemplatePreview(templates[0]) + '</div></details>';

    // Path B — Xero
    html += '<div style="border-top:1px solid var(--border,#ddd);padding-top:16px;margin-top:4px;">'
      + '<p style="font-size:0.875rem;font-weight:500;margin:0 0 8px;">Or import from another source</p>'
      + '<div style="display:flex;gap:10px;">'
      + '<button type="button" id="organizational-coa-xero-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:6px 14px;">Import from Xero</button>'
      + '<a href="/organizational/data/templates/coa.template.csv" download class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:6px 14px;text-decoration:none;">Download CSV template</a>'
      + '</div>'
      + '<div id="organizational-coa-xero-status" style="margin-top:8px;font-size:0.8125rem;color:var(--text-secondary);"></div>'
      + '</div>';

    html += '<div style="margin-top:20px;">'
      + '<button type="button" id="organizational-coa-confirm-btn" class="organizational-btn app-btn-primary" style="padding:8px 24px;">Start with this template</button>'
      + '<p id="organizational-coa-error" style="color:var(--color-error);font-size:0.8125rem;margin-top:8px;display:none;"></p>'
      + '</div>';

    pathsDiv.innerHTML = html;

    let selectedIdx = 0;

    // Template card selection
    pathsDiv.querySelectorAll('.organizational-coa-template-card').forEach(card => {
      card.addEventListener('click', () => {
        pathsDiv.querySelectorAll('.organizational-coa-template-card').forEach(c => {
          c.style.border = '2px solid var(--border,#ddd)';
        });
        card.style.border = '2px solid var(--accent,#800020)';
        selectedIdx = Number(card.dataset.templateIdx);
        const preview = pathsDiv.querySelector('#organizational-coa-preview');
        if (preview) preview.innerHTML = renderTemplatePreview(templates[selectedIdx]);
      });
    });

    // Xero import button
    const xeroBtn = pathsDiv.querySelector('#organizational-coa-xero-btn');
    if (xeroBtn) {
      xeroBtn.addEventListener('click', async () => {
        const statusEl = pathsDiv.querySelector('#organizational-coa-xero-status');
        xeroBtn.disabled = true; xeroBtn.textContent = 'Connecting…';
        if (statusEl) statusEl.textContent = '';
        try {
          const xOut = await window.apiJson?.('/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/accounts', { method: 'GET' });
          if (!xOut?.res.ok) {
            if (statusEl) statusEl.textContent = xOut?.data?.error || 'Xero not connected. Connect Xero from Settings first.';
            xeroBtn.disabled = false; xeroBtn.textContent = 'Import from Xero';
            return;
          }
          const xeroAccounts = (xOut.data.accounts || []).filter(a => ['REVENUE', 'EXPENSE'].includes(a.Type));
          if (!xeroAccounts.length) {
            if (statusEl) statusEl.textContent = 'No revenue or expense accounts found in Xero.';
            xeroBtn.disabled = false; xeroBtn.textContent = 'Import from Xero';
            return;
          }
          // Map Xero accounts to our format
          const accounts = xeroAccounts.map(a => ({
            code: a.Code || ('X' + a.AccountID.slice(0, 6)),
            name: a.Name,
            type: a.Type === 'REVENUE' ? 'income' : 'expense',
            level: 3,
            is_posting: true,
            standard_category: a.Type === 'REVENUE' ? 'REV_EARNED' : 'EXP_OPERATING',
            rollup_parent_code: a.Type === 'REVENUE' ? '_H2_REV_EARNED' : '_H2_EXP_OPS',
            xero_account_id: a.AccountID,
          }));
          const baseHierarchy = [
            { code: '_H1_REV', name: 'REVENUE',   type: 'income',  level: 1, is_posting: false, standard_category: 'REV_EARNED',    rollup_parent_code: '' },
            { code: '_H2_REV_EARNED', name: 'Earned Revenue',  type: 'income',  level: 2, is_posting: false, standard_category: 'REV_EARNED',  rollup_parent_code: '_H1_REV' },
            { code: '_H1_EXP', name: 'EXPENSES',  type: 'expense', level: 1, is_posting: false, standard_category: 'EXP_OPERATING',  rollup_parent_code: '' },
            { code: '_H2_EXP_OPS',  name: 'Operating Expenses', type: 'expense', level: 2, is_posting: false, standard_category: 'EXP_OPERATING', rollup_parent_code: '_H1_EXP' },
          ];
          await applyBulkAccounts(slug, [...baseHierarchy, ...accounts], setupDiv, table);
        } catch (e) {
          if (statusEl) statusEl.textContent = 'Error: ' + (e.message || 'Import failed');
          xeroBtn.disabled = false; xeroBtn.textContent = 'Import from Xero';
        }
      });
    }

    // Confirm button: post selected template
    const confirmBtn = pathsDiv.querySelector('#organizational-coa-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const t = templates[selectedIdx];
        if (!t) return;
        const accounts = [...(t.hierarchy || []), ...(t.postings || [])];
        await applyBulkAccounts(slug, accounts, setupDiv, table);
      });
    }
  }

  function renderTemplatePreview(template) {
    if (!template) return '';
    const items = [...(template.hierarchy || []), ...(template.postings || [])];
    const incomeItems  = items.filter(a => a.type === 'income');
    const expenseItems = items.filter(a => a.type === 'expense');
    let html = '';
    if (incomeItems.length) {
      html += '<div style="font-weight:600;font-size:0.75rem;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:4px;">Revenue</div>';
      incomeItems.forEach(a => {
        const indent = (a.level === 1 ? 0 : a.level === 2 ? 12 : 24);
        html += '<div style="padding-left:' + indent + 'px;font-size:0.8125rem;color:' + (a.is_posting ? 'var(--text-primary)' : 'var(--text-secondary)') + ';font-weight:' + (a.level <= 2 ? '500' : '400') + ';">'
          + (a.code && a.is_posting ? '<span style="color:var(--text-tertiary);margin-right:6px;font-size:0.75rem;">' + esc(a.code) + '</span>' : '')
          + esc(a.name) + '</div>';
      });
    }
    if (expenseItems.length) {
      html += '<div style="font-weight:600;font-size:0.75rem;text-transform:uppercase;color:var(--text-tertiary);margin:10px 0 4px;">Expenses</div>';
      expenseItems.forEach(a => {
        const indent = (a.level === 1 ? 0 : a.level === 2 ? 12 : 24);
        html += '<div style="padding-left:' + indent + 'px;font-size:0.8125rem;color:' + (a.is_posting ? 'var(--text-primary)' : 'var(--text-secondary)') + ';font-weight:' + (a.level <= 2 ? '500' : '400') + ';">'
          + (a.code && a.is_posting ? '<span style="color:var(--text-tertiary);margin-right:6px;font-size:0.75rem;">' + esc(a.code) + '</span>' : '')
          + esc(a.name) + '</div>';
      });
    }
    return html;
  }

  async function applyBulkAccounts(slug, accounts, setupDiv, table) {
    const errEl  = setupDiv.querySelector('#organizational-coa-error');
    const btnEl  = setupDiv.querySelector('#organizational-coa-confirm-btn');
    if (errEl) errEl.style.display = 'none';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Setting up…'; }

    try {
      const out = await window.apiJson?.(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts/bulk',
        { method: 'POST', body: JSON.stringify({ accounts }) }
      );
      if (!out?.res.ok) {
        const msg = out?.data?.error || 'Could not save accounts.';
        if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Start with this template'; }
        return;
      }
      // Success: remove setup panel and reload grid
      setupDiv.remove();
      if (table) table.hidden = false;
      scheduleItemsCache = null;
      await window.OrganizationalBudget.grid.load();
    } catch (e) {
      if (errEl) { errEl.textContent = 'Error: ' + (e.message || 'Unknown error'); errEl.style.display = ''; }
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Start with this template'; }
    }
  }

  // ── Account tree helpers ──────────────────────────────────────────────────────
  function orderAccountTree(accounts) {
    const byParent = {};
    accounts.forEach(a => {
      const pid = a.parent_id == null ? 'root' : String(a.parent_id);
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(a);
    });
    Object.keys(byParent).forEach(k => {
      byParent[k].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')) || Number(a.id) - Number(b.id));
    });

    const roots = (byParent.root || []).filter(a => !a.is_posting && (a.type === 'income' || a.type === 'expense'));
    roots.sort((a, b) => {
      const order = { income: 0, expense: 1 };
      const diff  = (order[a.type] ?? 2) - (order[b.type] ?? 2);
      return diff !== 0 ? diff : String(a.code || '').localeCompare(String(b.code || ''));
    });

    // Flat org without L1 hierarchy: just show posting accounts
    if (roots.length === 0) {
      return accounts
        .filter(a => a.is_posting && (a.type === 'income' || a.type === 'expense'))
        .map(a => ({ kind: 'posting', account: a, parentSubtotalId: null, rootCode: a.type === 'income' ? 'income' : 'expense' }));
    }

    const out = [];
    roots.forEach(root => {
      const subs = (byParent[String(root.id)] || []).filter(s => !s.is_posting && Number(s.level) === 2);
      // Suppress L2 subtotal header when there is only one L2 child (makes Expenses appear flat)
      const suppressL2 = subs.length === 1;

      out.push({ kind: 'summary', account: root });

      subs.forEach(sub => {
        if (!suppressL2) out.push({ kind: 'subtotal', account: sub });
        (byParent[String(sub.id)] || []).forEach(leaf => {
          if (leaf.is_posting) {
            out.push({ kind: 'posting', account: leaf, parentSubtotalId: sub.id, rootCode: root.code });
          }
        });
        if (!suppressL2) out.push({ kind: 'subtotal_sum', label: 'Total ' + (sub.name || sub.code), parentSubtotalId: sub.id });
      });

      out.push({ kind: 'section_sum', label: 'TOTAL ' + String(root.name || root.code).toUpperCase(), rootCode: root.code });
    });
    return out;
  }

  function attachRollups(ordered, linesByAccId) {
    const emptyB = () => ({ appr: 0, ytd: 0, proj: 0, mb: new Array(12).fill(0), ma: new Array(12).fill(0) });
    const addL   = (b, L) => {
      if (!L) return;
      b.appr += parseCents(L.approved_cents);
      b.ytd  += parseCents(L.ytd_actual_cents);
      b.proj += parseCents(L.projected_cents);
      (L.monthly_budget_cents || []).forEach((v, i) => { b.mb[i] += parseCents(v); });
      (L.monthly_actual_cents || []).forEach((v, i) => { b.ma[i] += parseCents(v); });
    };
    const rootBva = {};
    let subBva = null;
    return ordered.map(row => {
      const r = Object.assign({}, row);
      if      (row.kind === 'subtotal')     { subBva = emptyB(); }
      else if (row.kind === 'posting')      { const L = linesByAccId[row.account.id]; if (subBva) addL(subBva, L); if (row.rootCode) { rootBva[row.rootCode] = rootBva[row.rootCode] || emptyB(); addL(rootBva[row.rootCode], L); } }
      else if (row.kind === 'subtotal_sum') { r._rollup = subBva || emptyB(); subBva = null; }
      else if (row.kind === 'section_sum' && row.rootCode) { r._rollup = rootBva[row.rootCode] || emptyB(); }
      return r;
    });
  }

  // ── Schedule item amount distribution ────────────────────────────────────────
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
      const oStart = pStart > mStart ? pStart : mStart;
      const oEnd   = pEnd   < mEnd   ? pEnd   : mEnd;
      if (oEnd < oStart) continue;
      amounts[m] = Math.round(premiumCents * (Math.round((oEnd - oStart) / 86400000) + 1) / totalDays);
    }
    const diff = premiumCents - amounts.reduce((s, a) => s + a, 0);
    if (diff) { for (let m = 11; m >= 0; m--) { if (amounts[m] > 0) { amounts[m] += diff; break; } } }
    return amounts;
  }

  function scheduleItemMonthlyAmounts(item, fy) {
    if (item.schedule_type === 'insurance') {
      return insuranceProrateByDay(item.policy_start_date, item.policy_end_date, item.unit_amount_cents, fy);
    }
    const total = Math.round(Number(item.quantity || 1) * Number(item.unit_amount_cents || 0));
    const months = new Array(12).fill(0);
    const freq   = item.frequency || 'annual';
    const s      = Math.max(0, (Number(item.start_month) || 1) - 1);
    const e      = Math.min(11, (Number(item.end_month) || 12) - 1);

    if (freq === 'annual' || freq === 'one_time') {
      months[s] = total;
    } else if (freq === 'monthly') {
      const count = Math.max(1, e - s + 1);
      const perM  = Math.round(total / count);
      for (let m = s; m <= e; m++) months[m] = perM;
      months[s] += total - months.reduce((a, b) => a + b, 0);
    } else if (freq === 'quarterly') {
      const qMs = [s, s + 3, s + 6, s + 9].filter(m => m <= 11);
      if (qMs.length) {
        const perQ = Math.round(total / qMs.length);
        qMs.forEach(m => { months[m] = perQ; });
        months[qMs[0]] += total - months.reduce((a, b) => a + b, 0);
      }
    } else if (freq === 'custom_months' && Array.isArray(item.active_months) && item.active_months.length) {
      const active = item.active_months.map(m => m - 1).filter(m => m >= 0 && m <= 11);
      if (active.length) {
        const perM = Math.round(total / active.length);
        active.forEach(m => { months[m] = perM; });
        months[active[0]] += total - months.reduce((a, b) => a + b, 0);
      }
    } else {
      months[s] = total;
    }
    return months;
  }

  // ── Sub-row renderers ─────────────────────────────────────────────────────────
  // Sub-rows are click-to-edit — the sole entry point is the shared sliding
  // panel (window.OrganizationalBudget.openScheduleItemPanel/-New), same as Insurance
  // and Other Schedules. No inline distribute/notes/upload icons here.
  function renderScheduleSubRow(item, fy, parentAccountId) {
    const amounts = scheduleItemMonthlyAmounts(item, fy);
    const annual  = amounts.reduce((s, a) => s + a, 0);
    const state   = window.OrganizationalBudget.getState?.() || {};
    const mOrder  = fyMonthOrder(state.fiscalStartMonth || 1);
    const fmt     = c => c > 0 ? fmtCents(c) : '—';

    let html = '<tr class="organizational-budget-row-schedule-item" data-sub-of="' + parentAccountId + '" data-item-id="' + item.id + '" hidden title="Click to edit">';
    html += '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label">'
      + '<span class="organizational-budget-subrow-name">' + esc(item.label || '(unnamed)') + '</span>'
      + '</td>';
    html += '<td class="organizational-budget-sticky-col organizational-budget-col-num organizational-budget-annual-data">' + fmt(annual) + '</td>';
    for (const mIdx of mOrder) {
      html += '<td class="organizational-budget-col-num">' + fmt(amounts[mIdx]) + '</td>';
    }
    html += '</tr>';
    return html;
  }

  // ── Grid render ───────────────────────────────────────────────────────────────
  // Dispatches to the totals view (default) or the full monthly-entry grid.
  function renderBudgetGrid(data, schedItems, personnel) {
    lastGridData       = data;
    lastGridSchedItems = schedItems;
    lastGridPersonnel  = personnel;
    const state = window.OrganizationalBudget.getState?.() || {};
    if (state.viewMode === 'monthly') renderBudgetGridMonthly(data, schedItems);
    else                              renderBudgetGridTotals(data, schedItems, personnel);
  }

  // ── Totals view (default): Account | Budget | Actual | Forecast ─────────────
  // Sub-rows (schedule items) still expand under a chevron for visibility, but
  // only carry a Budget total — actual/forecast aren't tracked at item grain.
  // Editing always happens in the slide-out panels (⊞ distribution popover,
  // Personnel/Insurance/Indirect panels) — there is no inline cell entry here.
  function renderBudgetGridTotals(data, schedItems, personnel) {
    if (!budgetTbody) return;

    document.getElementById('organizational-budget-setup')?.remove();
    const table = budgetTbody.closest('table');
    if (table) table.hidden = false;

    const state = window.OrganizationalBudget.getState?.() || {};
    const accounts     = Array.isArray(data.accounts) ? data.accounts : [];
    const linesByAccId = {};
    (data.lines || []).forEach(L => { linesByAccId[L.account_id] = L; });

    const schedByAccId = {};
    for (const si of (schedItems || [])) {
      if (!si.account_id) continue;
      if (!schedByAccId[si.account_id]) schedByAccId[si.account_id] = [];
      schedByAccId[si.account_id].push(si);
    }

    const workersByAccId = {};
    for (const w of (personnel || [])) {
      const accId = w.salary_account_id || w.contractor_account_id;
      if (!accId) continue;
      if (!workersByAccId[accId]) workersByAccId[accId] = [];
      workersByAccId[accId].push(w);
    }

    const grantId    = state.grantId;
    const programId  = state.programId;
    const fiscalYear = state.fy;
    const canEdit    = !!programId && !!fiscalYear;

    showMathWarnings(data.data_warnings || []);

    if (table) {
      const thead = table.querySelector('thead');
      if (thead) {
        thead.innerHTML =
          '<tr class="organizational-budget-monthly-header-1">'
          + '<th class="organizational-budget-sticky-col organizational-budget-col-account">Account name</th>'
          + '<th class="organizational-budget-col-num">Approved budget</th>'
          + '<th class="organizational-budget-col-num">YTD actual</th>'
          + '<th class="organizational-budget-col-num">FY projected</th>'
          + '<th class="organizational-budget-col-num">Variance</th>'
          + '</tr>';
      }
    }

    if (accounts.length === 0) {
      budgetTbody.innerHTML = '';
      if (window.OrganizationalBudget.renderStatStrip) window.OrganizationalBudget.renderStatStrip(data);
      renderCOASetup(state.slug);
      return;
    }

    const ordered = orderAccountTree(accounts);
    const rows    = attachRollups(ordered, linesByAccId);

    const blankRow = () => '<td></td><td></td><td></td><td></td>';

    let html = '';
    for (const row of rows) {
      if (row.kind === 'summary') {
        html += '<tr class="organizational-budget-row-summary">'
          + '<td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>' + esc(row.account.name || row.account.code || '') + '</strong></td>'
          + blankRow() + '</tr>';

      } else if (row.kind === 'subtotal') {
        html += '<tr class="organizational-budget-row-subtotal">'
          + '<td class="organizational-budget-col-account organizational-budget-sticky-col">' + esc(row.account.name || row.account.code || '') + '</td>'
          + blankRow() + '</tr>';

      } else if (row.kind === 'posting') {
        const L        = linesByAccId[row.account.id];
        const appr     = parseCents(L?.approved_cents);
        const ytd      = parseCents(L?.ytd_actual_cents);
        const proj     = parseCents(L?.projected_cents);
        const subItems = schedByAccId[row.account.id] || [];
        const src      = row.account.budget_source || 'schedule';

        if (src === 'grant_allocation' || src === 'insurance') {
          const tabSection = src === 'insurance' ? 'insurance' : null;
          const tabLabel   = src === 'insurance' ? 'Insurance' : 'Grants';
          const slug       = state.slug || '';
          const badgeAttr  = tabSection
            ? 'data-goto-tab="' + tabSection + '"'
            : 'data-goto-grants-page="1" data-slug="' + esc(slug) + '"';
          html += '<tr class="organizational-budget-row-posting" data-account-id="' + row.account.id + '">'
            + '<td class="organizational-budget-col-account organizational-budget-sticky-col"><div class="organizational-budget-posting-name">'
            + '<span class="organizational-budget-acct-name">' + esc(row.account.name || row.account.code || '') + '</span>'
            + '<button type="button" class="organizational-budget-source-badge" ' + badgeAttr
            + ' title="Managed in ' + tabLabel + '">→ ' + tabLabel + '</button>'
            + '</div></td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(appr) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(ytd) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(proj) + '</td>'
            + varianceCell(appr, proj, false)
            + '</tr>';

        } else if (src === 'personnel') {
          // Experimental: workers render as click-to-edit sub-rows (same
          // pattern as schedule items) instead of a read-only badge that
          // navigates to the Personnel tab. Personnel tab is untouched —
          // this is an additional way to reach the same data.
          const acctName = esc(row.account.name || row.account.code || '');
          const workers  = workersByAccId[row.account.id] || [];
          html += '<tr class="organizational-budget-row-posting organizational-budget-row-has-subs" data-account-id="' + row.account.id + '">'
            + '<td class="organizational-budget-col-account organizational-budget-sticky-col" title="' + acctName + '"><div class="organizational-budget-posting-name">'
            + '<span class="organizational-budget-acct-name">' + acctName + '</span>'
            + '<button type="button" class="organizational-budget-chevron organizational-budget-chevron--collapsed" data-account-id="' + row.account.id + '" aria-label="Toggle sub-rows" title="Expand">▸</button>'
            + '</div></td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(appr) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(ytd) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(proj) + '</td>'
            + varianceCell(appr, proj, false)
            + '</tr>';

          for (const w of workers) {
            const total = parseCents(w.projected_annual_cents);
            html += '<tr class="organizational-budget-row-schedule-item" data-sub-of="' + row.account.id + '" data-worker-id="' + w.id + '" hidden title="Click to edit">'
              + '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label">'
              + '<span class="organizational-budget-subrow-name">' + esc(w.full_name || '(unnamed)') + '</span>'
              + '</td>'
              + '<td class="organizational-budget-col-num">' + (total > 0 ? fmtCents(total) : '—') + '</td>'
              + '<td class="organizational-budget-col-num">—</td>'
              + '<td class="organizational-budget-col-num">—</td>'
              + '<td class="organizational-budget-col-num">—</td>'
              + '</tr>';
          }
          html += '<tr class="organizational-budget-row-add-item" data-sub-of="' + row.account.id + '" hidden>'
            + '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label" style="padding-left:54px">'
            + '<button type="button" class="organizational-budget-add-worker-btn"'
            + ' data-account-id="' + row.account.id + '"'
            + ' data-worker-type="' + (workers[0]?.worker_type || 'employee') + '"'
            + '>+ Add worker</button></td>'
            + blankRow() + '</tr>';

        } else {
          const acctName = esc(row.account.name || row.account.code || '');
          html += '<tr class="organizational-budget-row-posting organizational-budget-row-has-subs" data-account-id="' + row.account.id + '">'
            + '<td class="organizational-budget-col-account organizational-budget-sticky-col" title="' + acctName + '"><div class="organizational-budget-posting-name">'
            + '<span class="organizational-budget-acct-name">' + acctName + '</span>'
            + '<button type="button" class="organizational-budget-chevron organizational-budget-chevron--collapsed" data-account-id="' + row.account.id + '" aria-label="Toggle sub-rows" title="Expand">▸</button>'
            + '</div></td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(appr) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(ytd) + '</td>'
            + '<td class="organizational-budget-col-num">' + fmtCents(proj) + '</td>'
            + varianceCell(appr, proj, false)
            + '</tr>';

          for (const si of subItems) {
            html += renderScheduleSubRowTotals(si, fiscalYear, row.account.id);
          }
          // No separate "convert this" row — if the account already has an
          // amount but no schedule item (e.g. from a CSV import or a prior-
          // year copy), "+ Add item" carries that amount forward as the
          // starting value instead of showing a second, redundant row.
          const existingCents = subItems.length === 0
            ? (L?.monthly_budget_cents || []).reduce((s, v) => s + parseCents(v), 0)
            : 0;
          html += '<tr class="organizational-budget-row-add-item" data-sub-of="' + row.account.id + '" hidden>'
            + '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label" style="padding-left:54px">'
            + '<button type="button" class="organizational-budget-add-subrow-btn"'
            + ' data-account-id="' + row.account.id + '"'
            + ' data-account-name="' + esc(row.account.name || row.account.code || '') + '"'
            + ' data-fiscal-year="' + fiscalYear + '"'
            + ' data-program-id="' + (programId || '') + '"'
            + (existingCents ? ' data-existing-cents="' + existingCents + '"' : '')
            + (grantId ? ' data-grant-id="' + grantId + '"' : '')
            + '>+ Add item</button></td>'
            + blankRow() + '</tr>';
        }

      } else if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
        const bva = row._rollup || { appr: 0, ytd: 0, proj: 0 };
        const cls = row.kind === 'section_sum' ? 'organizational-budget-row-section-sum' : 'organizational-budget-row-subtotal-sum';
        html += '<tr class="' + cls + '">'
          + '<td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>' + esc(row.label || '') + '</strong></td>'
          + '<td class="organizational-budget-col-num"><strong>' + fmtTotal(bva.appr) + '</strong></td>'
          + '<td class="organizational-budget-col-num"><strong>' + fmtTotal(bva.ytd) + '</strong></td>'
          + '<td class="organizational-budget-col-num"><strong>' + fmtTotal(bva.proj) + '</strong></td>'
          + varianceCell(bva.appr, bva.proj, true)
          + '</tr>';
      }
    }

    if (!html) {
      html = '<tr class="organizational-table-empty"><td colspan="' + TOTAL_COLS_TOTALS + '">No income or expense accounts found.</td></tr>';
    }

    budgetTbody.innerHTML = html;
    if (window.OrganizationalBudget.renderStatStrip) window.OrganizationalBudget.renderStatStrip(data);
    wireTopScrollSync();
    syncTopScrollWidth();
  }

  function renderScheduleSubRowTotals(item, fy, parentAccountId) {
    const amounts = scheduleItemMonthlyAmounts(item, fy);
    const annual  = amounts.reduce((s, a) => s + a, 0);

    return '<tr class="organizational-budget-row-schedule-item" data-sub-of="' + parentAccountId + '" data-item-id="' + item.id + '" hidden title="Click to edit">'
      + '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label">'
      + '<span class="organizational-budget-subrow-name">' + esc(item.label || '(unnamed)') + '</span>'
      + '</td>'
      + '<td class="organizational-budget-col-num">' + (annual > 0 ? fmtCents(annual) : '—') + '</td>'
      + '<td class="organizational-budget-col-num">—</td>'
      + '<td class="organizational-budget-col-num">—</td>'
      + '<td class="organizational-budget-col-num">—</td>'
      + '</tr>';
  }

  // ── Monthly entry grid (secondary view) ──────────────────────────────────────
  function renderBudgetGridMonthly(data, schedItems) {
    if (!budgetTbody) return;

    // Remove any leftover setup wizard
    document.getElementById('organizational-budget-setup')?.remove();
    const table = budgetTbody.closest('table');
    if (table) table.hidden = false;

    const state       = window.OrganizationalBudget.getState?.() || {};
    const fiscalStart = state.fiscalStartMonth || 1;
    const mOrder      = fyMonthOrder(fiscalStart);

    const accounts    = Array.isArray(data.accounts) ? data.accounts : [];
    const linesByAccId = {};
    (data.lines || []).forEach(L => { linesByAccId[L.account_id] = L; });

    const schedByAccId = {};
    for (const si of (schedItems || [])) {
      if (!si.account_id) continue;
      if (!schedByAccId[si.account_id]) schedByAccId[si.account_id] = [];
      schedByAccId[si.account_id].push(si);
    }

    const grantId   = state.grantId;
    const programId = state.programId;
    const fiscalYear = state.fy;
    const canEdit   = !!programId && !!fiscalYear;

    showMathWarnings(data.data_warnings || []);

    // Build thead with FY-ordered month columns
    if (table) {
      const thead = table.querySelector('thead');
      if (thead) {
        let h = '<tr class="organizational-budget-monthly-header-1">';
        h += '<th class="organizational-budget-sticky-col organizational-budget-col-account">Account</th>';
        h += '<th class="organizational-budget-sticky-col organizational-budget-annual-header">FY' + fiscalYear + '</th>';
        mOrder.forEach(mIdx => {
          h += '<th class="organizational-budget-month-header">' + MONTHS_SHORT[mIdx] + '</th>';
        });
        h += '</tr>';
        thead.innerHTML = h;
      }
    }

    // COA setup wizard when no accounts
    if (accounts.length === 0) {
      budgetTbody.innerHTML = '';
      if (window.OrganizationalBudget.renderStatStrip) window.OrganizationalBudget.renderStatStrip(data);
      renderCOASetup(state.slug);
      return;
    }

    const ordered = orderAccountTree(accounts);
    const rows    = attachRollups(ordered, linesByAccId);

    let html = '';
    for (const row of rows) {
      if (row.kind === 'summary') {
        html += '<tr class="organizational-budget-row-summary">';
        html += '<td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>' + esc(row.account.name || row.account.code || '') + '</strong></td>';
        html += '<td class="organizational-budget-sticky-col"></td>';
        for (let m = 0; m < 12; m++) html += '<td></td>';
        html += '</tr>';

      } else if (row.kind === 'subtotal') {
        html += '<tr class="organizational-budget-row-subtotal">';
        html += '<td class="organizational-budget-col-account organizational-budget-sticky-col">' + esc(row.account.name || row.account.code || '') + '</td>';
        html += '<td class="organizational-budget-sticky-col"></td>';
        for (let m = 0; m < 12; m++) html += '<td></td>';
        html += '</tr>';

      } else if (row.kind === 'posting') {
        const L          = linesByAccId[row.account.id];
        const mb         = L?.monthly_budget_cents || new Array(12).fill('0');
        const cellState  = L?.monthly_cell_state   || [];
        const appr       = parseCents(L?.approved_cents);
        const subItems   = schedByAccId[row.account.id] || [];
        const src        = row.account.budget_source || 'schedule';

        if (src === 'personnel' || src === 'grant_allocation' || src === 'insurance') {
          // Module-owned: read-only cells, badge links to owning tab or page
          const tabSection = src === 'personnel' ? 'personnel' : src === 'insurance' ? 'insurance' : null;
          const tabLabel   = src === 'personnel' ? 'Personnel' : src === 'insurance' ? 'Insurance' : 'Grants';
          const slug       = state.slug || '';
          const badgeAttr  = tabSection
            ? 'data-goto-tab="' + tabSection + '"'
            : 'data-goto-grants-page="1" data-slug="' + esc(slug) + '"';
          html += '<tr class="organizational-budget-row-posting" data-account-id="' + row.account.id + '">';
          html += '<td class="organizational-budget-col-account organizational-budget-sticky-col"><div class="organizational-budget-posting-name">'
            + '<span class="organizational-budget-acct-name">' + esc(row.account.name || row.account.code || '') + '</span>'
            + '<button type="button" class="organizational-budget-source-badge" ' + badgeAttr
            + ' title="Managed in ' + tabLabel + '">→ ' + tabLabel + '</button>'
            + '</div></td>';
          html += '<td class="organizational-budget-sticky-col organizational-budget-col-num organizational-budget-annual-data">'
            + fmtCents(appr) + '</td>';
          for (const mIdx of mOrder) {
            const v = parseCents(mb[mIdx]);
            html += '<td class="organizational-budget-col-num organizational-budget-col-budget organizational-budget-readonly">' + (v ? fmtCents(v) : '') + '</td>';
          }
          html += '</tr>';

        } else {
          // Schedule accounts always expand: chevron + real sub-rows + "+ Add item".
          // The parent-level ⊞ is gone entirely — the sub-row is the sole entry point,
          // so a schedule total and an ad-hoc parent override can never coexist.
          const acctName = esc(row.account.name || row.account.code || '');

          html += '<tr class="organizational-budget-row-posting organizational-budget-row-has-subs" data-account-id="' + row.account.id + '">';
          html += '<td class="organizational-budget-col-account organizational-budget-sticky-col" title="' + acctName + '"><div class="organizational-budget-posting-name">'
            + '<span class="organizational-budget-acct-name">' + acctName + '</span>'
            + '<button type="button" class="organizational-budget-chevron organizational-budget-chevron--collapsed" data-account-id="' + row.account.id + '" aria-label="Toggle sub-rows" title="Expand to edit">▸</button>'
            + '</div></td>';
          html += '<td class="organizational-budget-sticky-col organizational-budget-col-num organizational-budget-annual-data">' + fmtCents(appr) + '</td>';
          for (const mIdx of mOrder) {
            const cs      = cellState[mIdx];
            const lineSrc = cs?.source_type;
            const owned   = lineSrc === 'personnel' || lineSrc === 'grant_allocation';
            const owner   = lineSrc === 'personnel' ? 'Personnel' : 'Grants';
            const cls     = owned ? ' organizational-budget-readonly--lineage' : '';
            const tip     = owned ? ' title="Managed by ' + owner + '"' : '';
            html += '<td class="organizational-budget-col-num organizational-budget-col-budget organizational-budget-readonly' + cls + '"' + tip + '>'
              + fmtCents(parseCents(mb[mIdx])) + '</td>';
          }
          html += '</tr>';

          // Real schedule item sub-rows.
          for (const si of subItems) {
            html += renderScheduleSubRow(si, fiscalYear, row.account.id);
          }
          // No separate "convert this" row — if the account already has an
          // amount but no schedule item (e.g. from a CSV import or a prior-
          // year copy), "+ Add item" carries that amount forward as the
          // starting value instead of showing a second, redundant row.
          const existingCents = subItems.length === 0
            ? (L?.monthly_budget_cents || []).reduce((s, v) => s + parseCents(v), 0)
            : 0;
          // "+ Add item" always present (revealed when chevron is expanded).
          html += '<tr class="organizational-budget-row-add-item" data-sub-of="' + row.account.id + '" hidden>';
          html += '<td class="organizational-budget-col-account organizational-budget-sticky-col organizational-budget-subrow-label" style="padding-left:54px">';
          html += '<button type="button" class="organizational-budget-add-subrow-btn"'
            + ' data-account-id="' + row.account.id + '"'
            + ' data-account-name="' + esc(row.account.name || row.account.code || '') + '"'
            + ' data-fiscal-year="' + fiscalYear + '"'
            + ' data-program-id="' + (programId || '') + '"'
            + (existingCents ? ' data-existing-cents="' + existingCents + '"' : '')
            + (grantId ? ' data-grant-id="' + grantId + '"' : '')
            + '>+ Add item</button></td>';
          html += '<td class="organizational-budget-sticky-col"></td>';
          for (let m = 0; m < 12; m++) html += '<td></td>';
          html += '</tr>';
        }

      } else if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
        const bva = row._rollup || { appr: 0, mb: new Array(12).fill(0) };
        const cls = row.kind === 'section_sum' ? 'organizational-budget-row-section-sum' : 'organizational-budget-row-subtotal-sum';
        html += '<tr class="' + cls + '">';
        html += '<td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>' + esc(row.label || '') + '</strong></td>';
        html += '<td class="organizational-budget-sticky-col organizational-budget-col-num organizational-budget-annual-data"><strong>' + fmtTotal(bva.appr) + '</strong></td>';
        for (const mIdx of mOrder) {
          html += '<td class="organizational-budget-col-num organizational-budget-col-budget"><strong>' + fmtTotal(bva.mb[mIdx]) + '</strong></td>';
        }
        html += '</tr>';
      }
    }

    if (!html) {
      html = '<tr class="organizational-table-empty"><td colspan="' + TOTAL_COLS + '">No income or expense accounts found.</td></tr>';
    }

    budgetTbody.innerHTML = html;
    if (window.OrganizationalBudget.renderStatStrip) window.OrganizationalBudget.renderStatStrip(data);
    wireTopScrollSync();
    syncTopScrollWidth();
  }

  // ── Toggle sub-rows ───────────────────────────────────────────────────────────
  function toggleSubRows(accountId, chevronBtn) {
    const subs = budgetTbody?.querySelectorAll('tr[data-sub-of="' + accountId + '"]');
    const isCollapsed = chevronBtn.classList.contains('organizational-budget-chevron--collapsed');
    subs?.forEach(tr => { tr.hidden = !isCollapsed; });
    chevronBtn.classList.toggle('organizational-budget-chevron--collapsed', !isCollapsed);
    chevronBtn.textContent = isCollapsed ? '▾' : '▸';
    chevronBtn.title = isCollapsed ? 'Collapse' : 'Expand to edit';
  }

  // ── Open the inline right-rail panel for a new item, anchored to the
  // account the click came from — data attributes carry account/program/
  // grant/existing-amount context set by the row renderers above.
  function openNewItemPanelFromBtn(btn) {
    const state = window.OrganizationalBudget.getState?.() || {};
    window.OrganizationalBudget.openScheduleItemInlineNew?.(inlineTarget(), {
      accountId:     Number(btn.dataset.accountId),
      accountName:   btn.dataset.accountName || null,
      programId:     btn.dataset.programId ? Number(btn.dataset.programId) : null,
      grantId:       btn.dataset.grantId ? Number(btn.dataset.grantId) : null,
      fy:            Number(btn.dataset.fiscalYear) || state.fy,
      existingCents: Number(btn.dataset.existingCents) || 0,
      accounts:      lastGridData?.accounts || [],
    });
  }

  // ── Cell click delegation ────────────────────────────────────────────────────
  let cellClickWired = false;
  function wireCellClicks() {
    if (cellClickWired || !budgetTbody) return;
    cellClickWired = true;
    budgetTbody.addEventListener('click', e => {
      const chevron = e.target.closest('.organizational-budget-chevron');
      if (chevron) { toggleSubRows(chevron.dataset.accountId, chevron); return; }

      const addBtn = e.target.closest('.organizational-budget-add-subrow-btn');
      if (addBtn) { openNewItemPanelFromBtn(addBtn); return; }

      const addWorkerBtn = e.target.closest('.organizational-budget-add-worker-btn');
      if (addWorkerBtn) {
        const state = window.OrganizationalBudget.getState?.() || {};
        window.OrganizationalBudget.openWorkerInlineNew?.(inlineTarget(), {
          accountId:  Number(addWorkerBtn.dataset.accountId),
          workerType: addWorkerBtn.dataset.workerType || 'employee',
          fy:         state.fy,
          accounts:   lastGridData?.accounts || [],
        });
        return;
      }

      const itemRow = e.target.closest('.organizational-budget-row-schedule-item[data-item-id]');
      if (itemRow) { window.OrganizationalBudget.openScheduleItemInline?.(itemRow.dataset.itemId, inlineTarget(), { lockAccount: true }); return; }

      const workerRow = e.target.closest('tr[data-worker-id]');
      if (workerRow) { window.OrganizationalBudget.openWorkerInline?.(workerRow.dataset.workerId, inlineTarget()); return; }

      const badge = e.target.closest('.organizational-budget-source-badge');
      if (badge) {
        const tab = badge.dataset.gotoTab;
        if (tab) {
          const tabBtn = document.querySelector('.organizational-tab[data-section="' + tab + '"]');
          tabBtn?.click();
        } else if (badge.dataset.gotoGrantsPage) {
          const slug = badge.dataset.slug || (window.OrganizationalBudget.getState?.()?.slug || '');
          if (slug) window.location.href = '/organizational/o/' + encodeURIComponent(slug) + '/grants';
        }
        return;
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.OrganizationalBudget.grid = {
    load: async function () {
      const state = window.OrganizationalBudget.getState?.();
      if (!state?.slug || !budgetTbody) return;

      closeInlinePanel();
      const loadingCols = state.viewMode === 'monthly' ? TOTAL_COLS : TOTAL_COLS_TOTALS;
      budgetTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + loadingCols + '">Loading…</td></tr>';

      const [out, schedItems, personnel] = await Promise.all([
        window.apiJson?.(budgetVsActualUrl(state.slug)),
        loadScheduleItems().catch(() => []),
        loadPersonnelForGrid().catch(() => []),
      ]);

      if (!out?.res.ok) {
        budgetTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + loadingCols + '">'
          + esc((out?.data?.error) || 'Could not load budget.') + '</td></tr>';
        return;
      }

      wireCellClicks();
      renderBudgetGrid(out.data, schedItems || [], personnel || []);
    },

    // Re-renders the last-fetched data under the current view mode — used by
    // the Totals/Monthly toggle so switching views doesn't need a refetch.
    render: function () {
      if (!lastGridData) return;
      wireCellClicks();
      renderBudgetGrid(lastGridData, lastGridSchedItems || [], lastGridPersonnel || []);
    },

    invalidateScheduleCache: function () {
      scheduleItemsCache = null;
      scheduleItemsFY    = null;
    },

    invalidatePersonnelCache: function () {
      personnelCache = null;
      personnelFY    = null;
    },

    closeInlinePanel: closeInlinePanel,
    updateTopScrollVisibility: updateTopScrollVisibility,
    updateScrollHeight: updateScrollHeight,
  };
})();
