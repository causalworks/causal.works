/* accounting-settings.js — the Accounting settings page (the gear in the Accounting tab row).
   Groups: Periods and closing, Controls, Vendors and 1099, Banking, Assistant, Where your books live.
   People who cannot change a setting still see it, greyed, with who can (see docs/public/Settings_and_Permissions.md).
   The approval policy form is drawn by ledger.js and the 1099 card by settings-1099.js; this file draws the rest. */
(function () {
  'use strict';
  window.OrganizationalAccounting = window.OrganizationalAccounting || {};
  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const $ = (id) => document.getElementById(id);

  let slug = '';
  let wired = false;
  let wiredThreshold = false;

  function base() { return '/api/organizational/orgs/' + encodeURIComponent(slug); }
  function orgRole() {
    const org = window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    return String((org && org.role) || '').toLowerCase();
  }
  function canManage() { return ['admin', 'finance', 'staff'].includes(orgRole()); }
  function fmtDate(v) { return v ? String(v).slice(0, 10) : ''; }

  async function loadYears() {
    const body = $('organizational-acctset-years-body');
    const out = await apiJson(base() + '/fiscal-years');
    if (!out || !out.res.ok) { body.textContent = 'Fiscal years could not be loaded.'; return; }
    const years = out.data.fiscal_years || [];
    const manage = canManage();
    body.innerHTML = '<table class="organizational-table"><thead><tr><th>Fiscal year</th><th>Status</th><th>Detail</th><th></th></tr></thead><tbody>'
      + years.map((y) => '<tr>'
        + '<td>FY' + esc(y.fiscal_year) + '</td>'
        + '<td>' + (y.locked ? '<span class="organizational-badge">Locked</span>' : 'Open') + '</td>'
        + '<td style="color:var(--text-secondary);font-size:0.8125rem;">'
          + (y.locked ? 'Locked ' + esc(fmtDate(y.locked_at)) : (y.reopened_at ? 'Reopened ' + esc(fmtDate(y.reopened_at)) + (y.reopen_reason ? ': ' + esc(y.reopen_reason) : '') : ''))
        + '</td>'
        + '<td style="text-align:right;">' + (manage
          ? '<button type="button" class="organizational-btn organizational-btn-outline" style="height:28px;font-size:0.8125rem;padding:0 10px;" data-fy="' + esc(y.fiscal_year) + '" data-act="' + (y.locked ? 'reopen' : 'lock') + '">' + (y.locked ? 'Reopen' : 'Lock') + '</button>'
          : '') + '</td></tr>').join('')
      + '</tbody></table>';
    const note = $('organizational-acctset-years-note');
    note.hidden = manage;
    note.textContent = manage ? '' : 'Changed by finance or an admin.';
    if (!manage) body.style.opacity = '0.7';
  }

  function showYearsError(msg) { const el = $('organizational-acctset-years-error'); el.textContent = msg || ''; el.hidden = !msg; }

  function askYear(fy, act) {
    const bar = $('organizational-acctset-years-bar');
    showYearsError('');
    const reopen = act === 'reopen';
    bar.hidden = false;
    bar.style.cssText = 'margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm,6px);background:var(--surface-hover,#f8f8f8);';
    bar.innerHTML = '<p class="organizational-hint" style="margin:0 0 6px;">' + (reopen
      ? 'Reopen FY' + esc(fy) + '. Say why (at least 10 characters, for example "Audit adjustment to grant revenue"). The reason is kept in the history.'
      : 'Lock FY' + esc(fy) + '. Budget, schedule, personnel, grant, actuals and balance sheet data for this year become read-only until it is reopened.') + '</p>'
      + (reopen ? '<input type="text" id="acctset-year-reason" class="organizational-input" maxlength="300" aria-label="Reason" style="width:100%;margin-bottom:8px;">' : '')
      + '<div style="display:flex;gap:8px;"><button type="button" class="organizational-btn organizational-btn-primary" id="acctset-year-ok" style="height:30px;font-size:0.8125rem;padding:0 12px;">' + (reopen ? 'Reopen FY' : 'Lock FY') + esc(fy) + '</button>'
      + '<button type="button" class="organizational-btn organizational-btn-outline" id="acctset-year-cancel" style="height:30px;font-size:0.8125rem;padding:0 12px;">Cancel</button></div>';
    const input = $('acctset-year-reason');
    if (input) input.focus();
    $('acctset-year-cancel').addEventListener('click', () => { bar.hidden = true; bar.innerHTML = ''; });
    $('acctset-year-ok').addEventListener('click', async () => {
      const reason = input ? input.value.trim() : '';
      if (reopen && reason.length < 10) { showYearsError('Give a reason of at least 10 characters.'); return; }
      const out = await apiJson(base() + '/fiscal-years/' + encodeURIComponent(fy) + '/' + act, { method: 'POST', body: JSON.stringify(reopen ? { reason } : {}) });
      if (out && out.res.ok) { bar.hidden = true; bar.innerHTML = ''; showYearsError(''); await loadYears(); }
      else showYearsError((out && out.data && out.data.error) || 'Could not change the fiscal year.');
    });
  }

  async function loadThreshold() {
    const input = $('organizational-fa-threshold'), save = $('organizational-fa-threshold-save');
    const out = await apiJson(base() + '/fixed-assets/settings');
    if (!out || !out.res.ok) return;
    input.value = (out.data.capitalization_threshold_cents / 100).toFixed(2);
    const can = out.data.can_change !== false;
    input.disabled = !can; save.hidden = !can;
    $('organizational-fa-threshold-note').hidden = can;
    if (wiredThreshold) return;
    wiredThreshold = true;
    save.addEventListener('click', async () => {
      const err = $('organizational-fa-threshold-error');
      const n = Number(input.value.trim().replace(/[$,]/g, ''));
      if (!Number.isFinite(n) || n < 0) { err.textContent = 'Enter the amount in dollars, for example 5000.'; err.hidden = false; return; }
      err.hidden = true;
      save.disabled = true;
      const r = await apiJson(base() + '/fixed-assets/settings', { method: 'PUT', body: JSON.stringify({ capitalization_threshold_cents: Math.round(n * 100) }) });
      save.disabled = false;
      if (r && r.res.ok) { save.textContent = 'Saved'; setTimeout(() => { save.textContent = 'Save'; }, 1500); }
      else { err.textContent = (r && r.data && r.data.error) || 'Could not save.'; err.hidden = false; }
    });
  }

  async function loadExport() {
    const sel = $('organizational-acctset-export-year');
    if (!sel) return;
    const out = await apiJson(base() + '/fiscal-years');
    if (!out || !out.res.ok) { $('organizational-acctset-export-card').hidden = true; return; }
    const years = out.data.fiscal_years || [];
    sel.innerHTML = years.map((y) => '<option value="' + esc(y.fiscal_year) + '" data-from="' + esc(y.start_date) + '" data-to="' + esc(y.end_date) + '">FY' + esc(y.fiscal_year) + ' (' + esc(y.start_date) + ' to ' + esc(y.end_date) + ')</option>').join('');
    const nowYear = new Date().getFullYear();
    if (years.some((y) => Number(y.fiscal_year) === nowYear)) sel.value = String(nowYear);
    const setLinks = () => {
      const o = sel.options[sel.selectedIndex];
      if (!o) return;
      const from = o.getAttribute('data-from'), to = o.getAttribute('data-to');
      $('organizational-acctset-export-tb').href = base() + '/reports/trial-balance?format=csv&fiscal_year=' + encodeURIComponent(sel.value) + '&as_of=' + encodeURIComponent(to) + '&include_zero=1';
      $('organizational-acctset-export-gl').href = base() + '/reports/general-ledger?format=csv&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
      $('organizational-acctset-export-journal').href = base() + '/ledger/transaction-list/export?date_from=' + encodeURIComponent(from) + '&date_to=' + encodeURIComponent(to) + '&include_voided=1';
      $('organizational-acctset-export-coa').href = '/organizational/o/' + encodeURIComponent(slug) + '/structure';
    };
    if (!sel.dataset.wired) { sel.dataset.wired = '1'; sel.addEventListener('change', setLinks); }
    setLinks();
  }

  async function loadEntryLine() {
    const el = $('organizational-acctset-entry-line');
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    const role = orgRole();
    if (access && access.can_write_accounting) el.textContent = role === 'admin' ? 'Your admin account can enter and change transactions.' : 'You can enter and change transactions.';
    else if (role === 'admin') el.textContent = 'Your admin account cannot enter transactions right now. You can switch it on under Organization settings, Your accounting entry access.';
    else el.textContent = 'You can read Accounting. Entering and changing transactions is for finance and admin.';
  }
  async function loadBooksLine() {
    const el = $('organizational-acctset-books-line');
    const out = await apiJson(base() + '/actuals-source');
    const src = out && out.res.ok ? out.data.actuals_source : null;
    const where = '/organizational/o/' + encodeURIComponent(slug) + '/settings/organization';
    el.innerHTML = (src === 'xero' ? 'Your books live in Xero; the workspace shows what it imports.' : src === 'ledger' ? 'Your books live in this workspace\'s ledger.' : 'The books source could not be loaded.')
      + ' This affects Budget and Accounting together, so it is changed in <a href="' + where + '">Organization settings</a> by an admin.';
  }

  async function loadDefaults() {
    const pledgeSel = $('organizational-acctset-pledge-account');
    const bankSel = $('organizational-acctset-bank-account');
    const giftSel = $('organizational-acctset-gift-account');
    const note = $('organizational-acctset-defaults-note');
    if (!pledgeSel || !bankSel || !giftSel) return;
    const out = await apiJson(base() + '/accounts');
    if (!out || !out.res.ok) { pledgeSel.innerHTML = bankSel.innerHTML = giftSel.innerHTML = '<option value="">Could not load accounts</option>'; return; }
    const defaults = out.data.defaults || {};
    const assets = (out.data.accounts || []).filter((a) => a.type === 'asset' && a.is_posting);
    const opts = (list, cur, none) => '<option value="">' + none + '</option>' + list.map((a) =>
      '<option value="' + esc(a.id) + '"' + (Number(a.id) === cur ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    pledgeSel.innerHTML = opts(assets, defaults.pledge_receivable_account_id, 'None');
    bankSel.innerHTML = opts(assets.filter((a) => a.is_cash_account), defaults.bank_account_id, 'None (use the only account, or the last one used)');
    giftSel.innerHTML = opts((out.data.accounts || []).filter((a) => a.type === 'income' && a.is_posting), defaults.individual_gift_account_id, 'None');
    const manage = canManage();
    pledgeSel.disabled = bankSel.disabled = giftSel.disabled = !manage;
    note.hidden = manage;
    note.textContent = manage ? '' : 'Changed by finance or an admin.';
    [[pledgeSel, 'pledge_receivable_account_id'], [bankSel, 'bank_account_id'], [giftSel, 'individual_gift_account_id']].forEach(([sel, key]) => {
      if (sel.dataset.wired) return;
      sel.dataset.wired = '1';
      sel.addEventListener('change', async () => {
        const res = await apiJson(base() + '/account-defaults', { method: 'PUT', body: JSON.stringify({ [key]: sel.value ? Number(sel.value) : null }) });
        note.hidden = false;
        note.textContent = res && res.res.ok ? 'Saved.' : ((res && res.data && res.data.error) || 'Could not save.');
      });
    });
  }

  async function loadNumbering() {
    const ids = { invoice_number_prefix: 'inv-prefix', invoice_next_number: 'inv-next', default_invoice_terms_days: 'inv-terms', bill_number_prefix: 'bill-prefix', bill_next_number: 'bill-next', default_bill_terms_days: 'bill-terms', mileage_rate_cents_per_mile: 'mileage-rate' };
    const save = $('organizational-acctset-numbering-save');
    const note = $('organizational-acctset-numbering-note');
    if (!save) return;
    const out = await apiJson(base() + '/accounts');
    const n = out && out.res.ok ? out.data.numbering : null;
    if (!n) { note.hidden = false; note.textContent = 'Could not load these settings.'; return; }
    const manage = canManage();
    Object.keys(ids).forEach((k) => { const el = $('organizational-acctset-' + ids[k]); el.value = n[k] == null ? '' : n[k]; el.disabled = !manage; });
    save.hidden = !manage;
    note.hidden = manage;
    note.textContent = manage ? '' : 'Changed by finance or an admin.';
    if (save.dataset.wired) return;
    save.dataset.wired = '1';
    save.addEventListener('click', async () => {
      const body = {};
      Object.keys(ids).forEach((k) => { const v = $('organizational-acctset-' + ids[k]).value.trim(); body[k] = /terms|mileage/.test(k) ? (v === '' ? null : Number(v)) : (/next/.test(k) ? Number(v) : v); });
      const res = await apiJson(base() + '/document-numbering', { method: 'PUT', body: JSON.stringify(body) });
      note.hidden = false;
      note.textContent = res && res.res.ok ? 'Saved.' : ((res && res.data && res.data.error) || 'Could not save.');
    });
  }

  function wire() {
    if (wired) return;
    wired = true;
    const pane = $('organizational-accounting-tab-settings');
    pane.addEventListener('click', (e) => {
      const yearBtn = e.target.closest('[data-fy]');
      if (yearBtn) { askYear(yearBtn.getAttribute('data-fy'), yearBtn.getAttribute('data-act')); return; }
      const go = e.target.closest('[data-acctset-go]');
      if (go) {
        e.preventDefault();
        const sw = window.OrganizationalAccounting.switchTab;
        if (sw) sw(go.getAttribute('data-acctset-go'));
        const view = go.getAttribute('data-acctset-view');
        const clickId = go.getAttribute('data-acctset-click');
        if (view) setTimeout(() => { const b = document.querySelector('[data-view="' + view + '"]'); if (b) b.click(); }, 50);
        if (clickId) setTimeout(() => { const b = $(clickId); if (b) b.click(); }, 150);
      }
    });
  }

  // Conversion balances
  let conv = null;
  const cents = (raw) => { const n = Number(String(raw || '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const money = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amt = (c) => (Number(c) ? (Number(c) / 100).toFixed(2) : '');

  function convTotals() {
    let debits = 0; let credits = 0;
    document.querySelectorAll('#organizational-acctset-conv-grid input[data-side]').forEach((el) => {
      const v = cents(el.value);
      if (!v || Number.isNaN(v)) return;
      if (el.getAttribute('data-side') === 'd') debits += v; else credits += v;
    });
    return { debits, credits, diff: debits - credits };
  }

  function refreshConvSum() {
    const t = convTotals();
    const eq = $('organizational-acctset-conv-equity');
    const label = eq.options[eq.selectedIndex] ? eq.options[eq.selectedIndex].textContent : 'the net assets account';
    $('organizational-acctset-conv-sum').textContent = 'Debits ' + money(t.debits) + ' · Credits ' + money(t.credits)
      + (t.diff ? ' · Difference ' + money(Math.abs(t.diff)) + ' goes to ' + label + ' as a ' + (t.diff > 0 ? 'credit' : 'debit') : ' · Balanced');
  }

  function convMessage(m) { const n = $('organizational-acctset-conv-note'); n.hidden = !m; n.textContent = m || ''; }

  function renderConv(data) {
    conv = data;
    const c = data.conversion;
    const locked = !!c && c.status === 'locked';
    const manage = canManage();
    const grid = $('organizational-acctset-conv-grid');
    $('organizational-acctset-conv-program').innerHTML = data.programs.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
    const general = data.programs.find((p) => /management|general|admin/i.test(p.name));
    const equities = data.accounts.filter((a) => a.type === 'equity' && !a.excluded_reason);
    $('organizational-acctset-conv-equity').innerHTML = equities.map((a) => '<option value="' + esc(a.id) + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    const unres = equities.find((a) => /without donor|unrestricted/i.test(a.name));
    if (general) $('organizational-acctset-conv-program').value = String(general.id);
    if (unres) $('organizational-acctset-conv-equity').value = String(unres.id);
    if (c) {
      $('organizational-acctset-conv-date').value = c.conversion_date;
      if (c.program_id) $('organizational-acctset-conv-program').value = String(c.program_id);
      if (c.balancing_account_id) $('organizational-acctset-conv-equity').value = String(c.balancing_account_id);
    }
    const groups = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Net assets']];
    grid.innerHTML = '<div style="display:flex;gap:12px;font-size:0.75rem;color:var(--text-secondary);padding-bottom:4px;"><span style="flex:1;">Account</span><span style="width:130px;text-align:right;">Debit</span><span style="width:130px;text-align:right;">Credit</span></div>'
      + groups.map(([type, label]) => '<div class="organizational-panel-section-head">' + label + '</div>'
        + data.accounts.filter((a) => a.type === type).map((a) => {
          const name = esc(a.code ? a.code + ' — ' + a.name : a.name);
          if (a.excluded_reason) return '<div style="display:flex;gap:12px;align-items:center;padding:3px 0;color:var(--text-secondary);"><span style="flex:1;">' + name + '<br><span class="organizational-hint">' + esc(a.excluded_reason) + '</span></span></div>';
          const l = data.lines[a.id] || {};
          return '<div style="display:flex;gap:12px;align-items:center;padding:3px 0;"><span style="flex:1;">' + name + '</span>'
            + '<input type="text" inputmode="decimal" class="organizational-input" style="width:130px;text-align:right;" data-acct="' + esc(a.id) + '" data-side="d" placeholder="0.00" value="' + amt(l.debit_cents) + '">'
            + '<input type="text" inputmode="decimal" class="organizational-input" style="width:130px;text-align:right;" data-acct="' + esc(a.id) + '" data-side="c" placeholder="0.00" value="' + amt(l.credit_cents) + '"></div>';
        }).join('')).join('');
    const editable = manage && !locked;
    grid.querySelectorAll('input').forEach((el) => { el.disabled = !editable; });
    ['organizational-acctset-conv-date', 'organizational-acctset-conv-program', 'organizational-acctset-conv-equity'].forEach((id) => { $(id).disabled = !editable; });
    $('organizational-acctset-conv-status').textContent = !c ? 'Not entered yet.'
      : locked ? 'Locked. Entered as of ' + c.conversion_date + '.' : 'Entered as of ' + c.conversion_date + '. Open for changes: lock it once the balances are right.';
    $('organizational-acctset-conv-save').hidden = !editable;
    $('organizational-acctset-conv-lock').hidden = !(manage && c && !locked);
    $('organizational-acctset-conv-unlock').hidden = !(['admin', 'finance'].includes(orgRole()) && locked);
    $('organizational-acctset-conv-confirm').hidden = true;
    const warn = $('organizational-acctset-conv-warn');
    warn.hidden = !(data.earlier_entries > 0);
    warn.textContent = data.earlier_entries > 0 ? data.earlier_entries + ' other entries are dated on or before the conversion date. Conversion balances replace everything before the first transaction recorded here, so check those dates.' : '';
    refreshConvSum();
  }

  async function loadConversion() {
    if (!$('organizational-acctset-conv-grid')) return;
    const out = await apiJson(base() + '/conversion-balances');
    if (!out || !out.res.ok) { $('organizational-acctset-conv-status').textContent = 'Conversion balances could not be loaded.'; return; }
    renderConv(out.data);
    wireConversion();
  }

  function askConvConfirm(text, withReason, label, onConfirm) {
    const box = $('organizational-acctset-conv-confirm');
    box.hidden = false;
    box.innerHTML = '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:6px;"><p style="margin:0 0 8px;">' + esc(text) + '</p>'
      + (withReason ? '<label class="organizational-label">Reason<input type="text" id="organizational-acctset-conv-reason" class="organizational-input" maxlength="300"></label>' : '')
      + '<div style="display:flex;gap:8px;margin-top:8px;"><button type="button" class="organizational-btn" data-conv-yes>' + esc(label) + '</button><button type="button" class="organizational-btn organizational-btn-outline" data-conv-no>Cancel</button></div></div>';
    box.querySelector('[data-conv-no]').addEventListener('click', () => { box.hidden = true; });
    box.querySelector('[data-conv-yes]').addEventListener('click', () => {
      const reason = withReason ? $('organizational-acctset-conv-reason').value.trim() : '';
      if (withReason && reason.length < 10) { convMessage('Give a reason of at least 10 characters.'); return; }
      onConfirm(reason);
    });
  }

  function wireConversion() {
    const save = $('organizational-acctset-conv-save');
    if (save.dataset.wired) return;
    save.dataset.wired = '1';
    $('organizational-acctset-conv-grid').addEventListener('input', refreshConvSum);
    $('organizational-acctset-conv-equity').addEventListener('change', refreshConvSum);
    save.addEventListener('click', async () => {
      convMessage('');
      const date = $('organizational-acctset-conv-date').value;
      if (!date) { convMessage('Pick the conversion date.'); return; }
      const byAcct = {};
      let bad = false;
      document.querySelectorAll('#organizational-acctset-conv-grid input[data-acct]').forEach((el) => {
        if (!el.value.trim()) return;
        const v = cents(el.value);
        if (Number.isNaN(v) || v < 0) { bad = true; return; }
        const id = el.getAttribute('data-acct');
        byAcct[id] = byAcct[id] || { account_id: Number(id), debit_cents: 0, credit_cents: 0 };
        byAcct[id][el.getAttribute('data-side') === 'd' ? 'debit_cents' : 'credit_cents'] = v;
      });
      if (bad) { convMessage('Check the amounts: each must be a positive number.'); return; }
      save.disabled = true;
      const res = await apiJson(base() + '/conversion-balances', { method: 'PUT', body: JSON.stringify({
        conversion_date: date, program_id: Number($('organizational-acctset-conv-program').value),
        balancing_account_id: Number($('organizational-acctset-conv-equity').value), lines: Object.values(byAcct) }) });
      save.disabled = false;
      if (res && res.res.ok) { await loadConversion(); convMessage('Saved.'); }
      else convMessage((res && res.data && (res.data.message || res.data.error)) || 'Could not save the conversion balances.');
    });
    $('organizational-acctset-conv-lock').addEventListener('click', () => askConvConfirm('Lock the conversion balances? They can only be changed again by unlocking them with a reason, which is recorded.', false, 'Lock', async () => {
      const res = await apiJson(base() + '/conversion-balances/lock', { method: 'POST' });
      if (res && res.res.ok) { await loadConversion(); convMessage('Locked.'); } else convMessage((res && res.data && res.data.error) || 'Could not lock.');
    }));
    $('organizational-acctset-conv-unlock').addEventListener('click', () => askConvConfirm('Unlock the conversion balances to change them? Your reason is recorded. Lock them again when the changes are done.', true, 'Unlock', async (reason) => {
      const res = await apiJson(base() + '/conversion-balances/unlock', { method: 'POST', body: JSON.stringify({ reason }) });
      if (res && res.res.ok) { await loadConversion(); convMessage('Unlocked. Change the balances, save, and lock again.'); } else convMessage((res && res.data && res.data.error) || 'Could not unlock.');
    }));
  }

  const MODE_LABELS = { off: 'Off', background: 'Background suggestions', assistant: 'Assistant' };

  function modeOptions(current, withFollow) {
    const keys = ['off', 'background'];
    if (current === 'assistant') keys.push('assistant');
    return (withFollow ? '<option value=""' + (current ? '' : ' selected') + '>Follow the workspace</option>' : '')
      + keys.map((k) => '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' + MODE_LABELS[k] + '</option>').join('');
  }

  function assistantError(msg) { const el = $('organizational-acctset-assistant-error'); if (el) { el.textContent = msg || ''; el.hidden = !msg; } }

  function resultsTable(title, firstCol, rows) {
    if (!rows.length) return '';
    const pct = (r) => Math.round(r.override_rate * 100) + '%';
    return '<p style="margin:12px 0 4px;"><b>' + esc(title) + '</b></p><table class="organizational-table"><thead><tr><th>' + esc(firstCol) + '</th><th style="text-align:right;">Agreed</th><th style="text-align:right;">Changed</th><th style="text-align:right;">Dismissed</th><th style="text-align:right;">Overridden</th></tr></thead><tbody>'
      + rows.map((r) => '<tr><td>' + esc(r.key) + '</td><td style="text-align:right;">' + r.agreed + '</td><td style="text-align:right;">' + r.changed + '</td><td style="text-align:right;">' + r.dismissed + '</td><td style="text-align:right;">' + pct(r) + '</td></tr>').join('')
      + '</tbody></table>';
  }

  async function loadAssistantResults(body) {
    const out = await apiJson(base() + '/tool-proposals/measurement');
    if (!out || !out.res.ok) return;
    const d = out.data;
    const holder = document.createElement('div');
    holder.innerHTML = '<hr style="border:0;border-top:1px solid var(--border);margin:14px 0;"><p style="margin:0;"><b>How suggestions did</b></p>'
      + (d.by_month.length
        ? '<p class="organizational-hint" style="margin:2px 0 0;">Agreed counts suggestions you accepted, plus lines you coded yourself the same way. ' + d.open + ' waiting.</p>'
          + resultsTable('By month', 'Month', d.by_month) + resultsTable('By source', 'Source', (d.by_source || []).map((r) => ({ ...r, key: ({ bank_rule: 'Bank rule', payee_history: 'Earlier coding of the payee', model: 'Loopy (language model)' })[r.key] || r.key }))) + resultsTable('Payees overridden most', 'Payee', d.by_payee) + resultsTable('Accounts overridden most', 'Account', d.by_category)
        : '<p class="organizational-hint" style="margin:2px 0 0;">No suggestions have been decided yet.</p>');
    body.appendChild(holder);
  }

  async function loadAssistant() {
    const body = $('organizational-acctset-assistant-body');
    if (!body) return;
    const url = base() + '/assistant';
    const out = await apiJson(url);
    if (!out || !out.res.ok) { body.textContent = 'Assistant settings could not be loaded.'; return; }
    const d = out.data;
    const admin = orgRole() === 'admin';
    const seat = d.seat;
    const seatLine = seat
      ? 'The assistant has a seat: it can propose, it cannot post, until ' + esc(fmtDate(seat.ends_at)) + '. Reason: ' + esc(seat.reason)
      : 'The assistant has no seat. Without one, it only uses your bank rules and earlier coding, and nothing goes to a language model.';
    const small = 'height:30px;font-size:0.8125rem;padding:0 12px;';
    body.innerHTML = '<div style="display:grid;grid-template-columns:200px 1fr;gap:10px 14px;align-items:center;max-width:620px;">'
      + '<label for="acctset-assistant-ws"><b>This workspace</b></label>'
      + '<select id="acctset-assistant-ws" class="organizational-select" style="max-width:260px;"' + (admin ? '' : ' disabled') + '>' + modeOptions(d.workspace_mode, false) + '</select>'
      + '<label for="acctset-assistant-me"><b>Just for me</b></label>'
      + '<select id="acctset-assistant-me" class="organizational-select" style="max-width:260px;">' + modeOptions(d.my_setting || '', true) + '</select>'
      + '</div>'
      + (admin ? '' : '<p class="organizational-hint" style="margin:8px 0 0;">The workspace setting and the seat are changed by an admin.</p>')
      + '<hr style="border:0;border-top:1px solid var(--border);margin:14px 0;">'
      + '<p style="margin:0 0 8px;">' + seatLine + '</p>'
      + (admin ? (seat
        ? '<div style="display:flex;gap:8px;"><button type="button" class="organizational-btn organizational-btn-outline" id="acctset-assistant-renew" style="' + small + '">Renew for 30 days</button>'
          + '<button type="button" class="organizational-btn organizational-btn-outline" id="acctset-assistant-revoke" style="' + small + '">Revoke</button></div>'
        : '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><input type="text" id="acctset-assistant-reason" class="organizational-input" maxlength="200" placeholder="Why (for example: try bank line suggestions)" aria-label="Reason" style="width:300px;">'
          + '<select id="acctset-assistant-days" class="organizational-select" aria-label="Length" style="width:110px;"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select>'
          + '<button type="button" class="organizational-btn organizational-btn-primary" id="acctset-assistant-grant" style="' + small + '">Give a seat</button></div>') : '');
    loadAssistantResults(body);
    const send = async (path, method, payload) => {
      assistantError('');
      const r = await apiJson(url + path, { method, body: payload ? JSON.stringify(payload) : undefined });
      if (!r || !r.res.ok) { assistantError((r && r.data && r.data.error) || 'Could not save.'); return false; }
      return true;
    };
    $('acctset-assistant-ws').addEventListener('change', async (e) => { if (await send('/mode', 'PUT', { mode: e.target.value })) loadAssistant(); else loadAssistant(); });
    $('acctset-assistant-me').addEventListener('change', async (e) => { await send('/my-mode', 'PUT', { mode: e.target.value || null }); loadAssistant(); });
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    on('acctset-assistant-grant', async () => { if (await send('/seat', 'POST', { reason: $('acctset-assistant-reason').value, days: Number($('acctset-assistant-days').value) })) loadAssistant(); });
    on('acctset-assistant-renew', async () => { if (await send('/seat/renew', 'POST', { days: 30 })) loadAssistant(); });
    on('acctset-assistant-revoke', async () => { if (await send('/seat', 'DELETE')) loadAssistant(); });
  }

  async function init(s) {
    slug = s;
    const contacts = document.querySelector('[data-acctset-contacts]');
    if (contacts) contacts.href = '/organizational/o/' + encodeURIComponent(slug) + '/contacts?role=vendor&from=accounting';
    const csv = $('organizational-acctset-1099-csv');
    if (csv) {
      csv.innerHTML = 'The totals are in the <a href="/organizational/o/' + encodeURIComponent(slug) + '/reports?report=1099">1099 report</a> under Reports, Taxes.';
    }
    const structure = $('organizational-acctset-structure-link');
    if (structure) structure.href = '/organizational/o/' + encodeURIComponent(slug) + '/structure';
    wire();
    if (window.OrganizationalStateRules) window.OrganizationalStateRules.renderAccountingCard($('organizational-acctset-state'), slug);
    await Promise.all([loadYears(), loadEntryLine(), loadBooksLine(), loadThreshold(), loadExport(), loadDefaults(), loadNumbering(), loadConversion(), loadAssistant()]);
    const idx = $('organizational-acctset-index');
    if (idx && window.OrganizationalSettingsIndex) {
      const r = await window.OrganizationalSettingsIndex.load(slug);
      if (r.access) window.OrganizationalSettingsIndex.render(idx, { slug, access: r.access, org: r.org, module: 'accounting' });
    }
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target && /^#acct-sec-/.test(window.location.hash)) target.scrollIntoView({ block: 'start' });
  }

  window.OrganizationalAccounting.settings = { init };
})();
