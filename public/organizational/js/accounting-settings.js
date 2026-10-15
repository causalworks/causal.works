/* accounting-settings.js — the Accounting settings page (the gear in the Accounting tab row).
   Groups: Periods and closing, Controls, Vendors and 1099, Banking, Where your books live.
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

  // Opening balances
  let openAccounts = [];
  const cents = (raw) => { const n = Number(String(raw || '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const money = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function openingTotals() {
    let assets = 0; let liabilities = 0; let equity = 0;
    document.querySelectorAll('#organizational-acctset-open-grid [data-open-acct]').forEach((el) => {
      const v = cents(el.value);
      if (!v || Number.isNaN(v)) return;
      const t = el.getAttribute('data-type');
      if (t === 'asset') assets += v; else if (t === 'liability') liabilities += v; else equity += v;
    });
    return { assets, liabilities, equity, balancing: assets - liabilities - equity };
  }

  function refreshOpeningSum() {
    const t = openingTotals();
    $('organizational-acctset-open-sum').textContent = 'Assets ' + money(t.assets) + ' · Liabilities ' + money(t.liabilities) + ' · Net assets entered ' + money(t.equity)
      + ' · Balancing amount to the net assets account ' + money(t.balancing);
  }

  async function loadOpening() {
    const grid = $('organizational-acctset-open-grid');
    const post = $('organizational-acctset-open-post');
    if (!grid) return;
    const [acctOut, progOut] = await Promise.all([apiJson(base() + '/accounts'), apiJson(base() + '/programs?dimension=program')]);
    if (!acctOut || !acctOut.res.ok) { grid.textContent = 'Accounts could not be loaded.'; return; }
    openAccounts = (acctOut.data.accounts || []).filter((a) => ['asset', 'liability', 'equity'].includes(a.type) && a.is_posting !== false
      && !a.is_system_clearing_account && !a.is_system_unallocated_receipts_account && !a.is_system_expense_claims_payable_account);
    const programs = (progOut && progOut.data && progOut.data.programs) || [];
    $('organizational-acctset-open-program').innerHTML = programs.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
    const general = programs.find((p) => /management|general|admin/i.test(p.name));
    if (general) $('organizational-acctset-open-program').value = String(general.id);
    const equities = openAccounts.filter((a) => a.type === 'equity');
    $('organizational-acctset-open-equity').innerHTML = equities.map((a) => '<option value="' + esc(a.id) + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
    const unres = equities.find((a) => /without donor|unrestricted/i.test(a.name));
    if (unres) $('organizational-acctset-open-equity').value = String(unres.id);
    const groups = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Net assets']];
    grid.innerHTML = groups.map(([type, label]) => '<div class="organizational-panel-section-head">' + label + '</div>'
      + openAccounts.filter((a) => a.type === type).map((a) => '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;">'
        + '<span>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</span>'
        + '<input type="text" inputmode="decimal" class="organizational-input" style="width:140px;text-align:right;" data-open-acct="' + esc(a.id) + '" data-type="' + type + '" placeholder="0.00"></div>').join('')).join('');
    const manage = canManage();
    grid.querySelectorAll('input').forEach((el) => { el.disabled = !manage; });
    ['organizational-acctset-open-date', 'organizational-acctset-open-program', 'organizational-acctset-open-equity'].forEach((id) => { $(id).disabled = !manage; });
    post.hidden = !manage;
    refreshOpeningSum();
    if (post.dataset.wired) return;
    post.dataset.wired = '1';
    grid.addEventListener('input', refreshOpeningSum);
    post.addEventListener('click', async () => {
      const note = $('organizational-acctset-open-note');
      const say = (m) => { note.hidden = false; note.textContent = m; };
      const date = $('organizational-acctset-open-date').value;
      if (!date) { say('Pick the date the books start.'); return; }
      const programId = Number($('organizational-acctset-open-program').value);
      const equityId = Number($('organizational-acctset-open-equity').value);
      if (!programId || !equityId) { say('Pick a program and a net assets account.'); return; }
      const lines = [];
      let bad = false;
      grid.querySelectorAll('[data-open-acct]').forEach((el) => {
        if (!el.value.trim()) return;
        const v = cents(el.value);
        if (Number.isNaN(v)) { bad = true; return; }
        if (!v) return;
        const debitNormal = el.getAttribute('data-type') === 'asset';
        const debit = debitNormal ? v > 0 : v < 0;
        lines.push({ account_id: Number(el.getAttribute('data-open-acct')), program_id: programId, debit_cents: debit ? Math.abs(v) : 0, credit_cents: debit ? 0 : Math.abs(v) });
      });
      if (bad) { say('Check the amounts: each must be a number.'); return; }
      const t = openingTotals();
      if (t.balancing) {
        const debit = t.balancing < 0;
        const existing = lines.find((l) => l.account_id === equityId);
        if (existing) {
          const net = existing.credit_cents - existing.debit_cents + Math.abs(t.balancing) * (debit ? -1 : 1);
          existing.debit_cents = net < 0 ? -net : 0; existing.credit_cents = net > 0 ? net : 0;
        } else {
          lines.push({ account_id: equityId, program_id: programId, debit_cents: debit ? Math.abs(t.balancing) : 0, credit_cents: debit ? 0 : Math.abs(t.balancing) });
        }
      }
      if (lines.length < 2) { say('Enter at least one balance.'); return; }
      post.disabled = true;
      const res = await apiJson(base() + '/ledger/entries', { method: 'POST', body: JSON.stringify({
        entry_type: 'journal', transaction_date: date, memo: 'Opening balances as of ' + date, reason: 'Opening balances carried over from the previous books', lines } ) });
      post.disabled = false;
      if (res && res.res.ok) {
        say('Posted as entry #' + (res.data && res.data.id) + '. To correct it, void that entry in Transactions and enter it again.');
        grid.querySelectorAll('input').forEach((el) => { el.value = ''; });
        refreshOpeningSum();
      } else {
        say((res && res.data && (res.data.message || res.data.error)) || 'Could not post the opening balances.');
      }
    });
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
    await Promise.all([loadYears(), loadEntryLine(), loadBooksLine(), loadThreshold(), loadExport(), loadDefaults(), loadNumbering(), loadOpening()]);
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
