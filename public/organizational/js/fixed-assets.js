/* fixed-assets.js — Fixed Assets & Depreciation (Accounting build order item 3). Per-asset
 * register replacing the old Schedule D compliance card's balance-sheet-snapshot guessing.
 * Run Depreciation is preview-then-confirm, same posture as Bank Rules' Cash Coding "Apply
 * rules" action -- nothing posts to the ledger without a human reviewing it first.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  let currentSlug = '';
  let assetAccountsCache = [];
  let expenseAccountsCache = [];
  let gainLossAccountsCache = [];
  let cashAccountsCache = [];
  let programsCache = [];
  let assetsCache = [];

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  async function loadReferenceData(slug) {
    const [acctOut, progOut] = await Promise.all([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts'),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program'),
    ]);
    const all = (acctOut && acctOut.data && acctOut.data.accounts) || [];
    assetAccountsCache = all.filter((a) => a.type === 'asset' && a.is_posting && !a.is_cash_account);
    expenseAccountsCache = all.filter((a) => a.type === 'expense' && a.is_posting);
    // A gain on disposal is revenue-side, a loss is expense-side -- the org may use one
    // combined "Gain/Loss on Disposal" account of either type, so both are offered.
    gainLossAccountsCache = all.filter((a) => (a.type === 'expense' || a.type === 'income') && a.is_posting);
    cashAccountsCache = all.filter((a) => a.is_cash_account);
    programsCache = (progOut && progOut.data && progOut.data.programs) || [];
  }

  function accountOptions(list, selectedId) {
    return '<option value="">— Account —</option>' + list.map((a) =>
      '<option value="' + a.id + '"' + (Number(a.id) === Number(selectedId) ? ' selected' : '') + '>'
      + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
  }
  function programOptions(selectedId) {
    return '<option value="">— Program —</option>' + programsCache.map((p) =>
      '<option value="' + p.id + '"' + (Number(p.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(p.name) + '</option>'
    ).join('');
  }

  // ── List ──
  const tbody = document.getElementById('organizational-fixedassets-tbody');
  const errEl = document.getElementById('organizational-org-error');
  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }

  function statusLabel(s) { return s === 'fully_depreciated' ? 'Fully depreciated' : s === 'disposed' ? 'Disposed' : 'Active'; }

  function renderAssets() {
    if (!tbody) return;
    if (!assetsCache.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">No fixed assets yet.</td></tr>';
      return;
    }
    tbody.innerHTML = assetsCache.map((a) => (
      '<tr>'
      + '<td>' + esc(a.name) + '</td>'
      + '<td>' + esc(String(a.acquisition_date || '').slice(0, 10)) + '</td>'
      + '<td>' + fmtMoney(Number(a.cost_cents)) + '</td>'
      + '<td>' + fmtMoney(Number(a.accumulated_depreciation_cents)) + '</td>'
      + '<td>' + fmtMoney(Number(a.net_book_value_cents)) + '</td>'
      + '<td>' + esc(statusLabel(a.status)) + '</td>'
      + '<td>'
      + '<button type="button" class="organizational-btn organizational-btn-outline fixedassets-edit-btn" data-id="' + a.id + '" style="font-size:0.75rem;">Edit</button> '
      + (a.status !== 'disposed'
          ? '<button type="button" class="organizational-btn organizational-btn-outline fixedassets-dispose-btn" data-id="' + a.id + '" style="font-size:0.75rem;">Dispose</button> '
          : '')
      + (a.status === 'active' && Number(a.accumulated_depreciation_cents) === 0
          ? '<button type="button" class="organizational-btn organizational-btn-outline fixedassets-delete-btn" data-id="' + a.id + '" style="font-size:0.75rem;">Delete</button>'
          : '')
      + '</td>'
      + '</tr>'
    )).join('');
  }

  async function loadAssets() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets');
    assetsCache = (out && out.data && out.data.fixed_assets) || [];
    renderAssets();
  }

  // ── Add/Edit form ──
  const formEl = document.getElementById('organizational-fixedassets-form');
  const addBtn = document.getElementById('organizational-fixedassets-add');

  function assetFormHtml(asset) {
    const a = asset || {};
    const locked = !!(asset && Number(asset.accumulated_depreciation_cents) > 0);
    const lockedNote = locked ? '<p style="font-size:0.75rem;color:var(--text-secondary);margin:-6px 0 4px;">Depreciation has already posted for this asset -- cost, accounts, dates, and useful life can no longer be changed. Only name, description, and program are editable.</p>' : '';
    const dis = locked ? ' disabled' : '';
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="fixedassets-form-name" class="organizational-input" value="' + esc(a.name || '') + '"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Description<input type="text" id="fixedassets-form-description" class="organizational-input" value="' + esc(a.description || '') + '"></label></div>'
      + lockedNote
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Acquisition date *<input type="date" id="fixedassets-form-acquisition-date" class="organizational-input" value="' + esc(String(a.acquisition_date || '').slice(0, 10)) + '"' + dis + '></label>'
      + '<label class="organizational-label" style="flex:1">Program *<select id="fixedassets-form-program" class="organizational-select">' + programOptions(a.program_id) + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Cost *<input type="number" id="fixedassets-form-cost" class="organizational-input" min="0" step="0.01" value="' + (a.cost_cents != null ? Number(a.cost_cents) / 100 : '') + '"' + dis + '></label>'
      + '<label class="organizational-label" style="flex:1">Salvage value<input type="number" id="fixedassets-form-salvage" class="organizational-input" min="0" step="0.01" value="' + (a.salvage_value_cents != null ? Number(a.salvage_value_cents) / 100 : 0) + '"' + dis + '></label>'
      + '<label class="organizational-label" style="flex:1">Useful life (months) *<input type="number" id="fixedassets-form-life" class="organizational-input" min="1" step="1" value="' + (a.useful_life_months || '') + '"' + dis + '></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><strong style="font-size:0.8125rem;">Accounts</strong></div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Asset account *<select id="fixedassets-form-asset-account" class="organizational-select"' + dis + '>' + accountOptions(assetAccountsCache, a.asset_account_id) + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Accumulated depreciation account *<select id="fixedassets-form-accum-account" class="organizational-select"' + dis + '>' + accountOptions(assetAccountsCache, a.accumulated_depreciation_account_id) + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Depreciation expense account *<select id="fixedassets-form-expense-account" class="organizational-select"' + dis + '>' + accountOptions(expenseAccountsCache, a.depreciation_expense_account_id) + '</select></label>'
      + '</div>'
      + '</div>'
      + '<div id="organizational-fixedassets-form-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="fixedassets-form-save" class="organizational-btn organizational-btn-primary">' + (a.id ? 'Save changes' : 'Create asset') + '</button>'
      + '<button type="button" id="fixedassets-form-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div>';
  }

  function openAssetForm(asset) {
    if (!formEl) return;
    formEl.hidden = false;
    formEl.innerHTML = assetFormHtml(asset);
    const errEl2 = document.getElementById('organizational-fixedassets-form-error');
    document.getElementById('fixedassets-form-cancel').addEventListener('click', () => { formEl.hidden = true; });
    document.getElementById('fixedassets-form-save').addEventListener('click', async () => {
      if (errEl2) errEl2.hidden = true;
      const locked = !!(asset && Number(asset.accumulated_depreciation_cents) > 0);
      const body = {
        name: document.getElementById('fixedassets-form-name').value.trim(),
        description: document.getElementById('fixedassets-form-description').value.trim() || null,
        program_id: document.getElementById('fixedassets-form-program').value || null,
      };
      if (!locked) {
        body.acquisition_date = document.getElementById('fixedassets-form-acquisition-date').value || null;
        body.cost_cents = inputToCents(document.getElementById('fixedassets-form-cost').value);
        body.salvage_value_cents = inputToCents(document.getElementById('fixedassets-form-salvage').value);
        body.useful_life_months = Number(document.getElementById('fixedassets-form-life').value) || null;
        body.asset_account_id = document.getElementById('fixedassets-form-asset-account').value || null;
        body.accumulated_depreciation_account_id = document.getElementById('fixedassets-form-accum-account').value || null;
        body.depreciation_expense_account_id = document.getElementById('fixedassets-form-expense-account').value || null;
      }
      const url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets' + (asset && asset.id ? '/' + asset.id : '');
      const out = await apiJson(url, { method: asset && asset.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (out && out.res.ok) {
        formEl.hidden = true;
        await loadAssets();
      } else if (errEl2) {
        errEl2.textContent = (out && out.data && out.data.error) || 'Could not save this asset.';
        errEl2.hidden = false;
      }
    });
  }

  if (addBtn) addBtn.addEventListener('click', () => openAssetForm(null));

  // ── Dispose panel ──
  const disposePanel = document.getElementById('organizational-fixedassets-dispose-panel');
  function openDisposeForm(asset) {
    if (!disposePanel) return;
    disposePanel.hidden = false;
    disposePanel.innerHTML = '<h4 style="margin:0 0 8px;">Dispose: ' + esc(asset.name) + '</h4>'
      + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 8px;">Net book value: ' + fmtMoney(Number(asset.net_book_value_cents)) + '</p>'
      + '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Disposal date *<input type="date" id="fixedassets-dispose-date" class="organizational-input"></label>'
      + '<label class="organizational-label" style="flex:1">Proceeds received<input type="number" id="fixedassets-dispose-proceeds" class="organizational-input" min="0" step="0.01" value="0"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Deposit to<select id="fixedassets-dispose-bank" class="organizational-select">' + accountOptions(cashAccountsCache) + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Gain/loss account (if proceeds ≠ book value)<select id="fixedassets-dispose-gainloss" class="organizational-select">' + accountOptions(gainLossAccountsCache) + '</select></label>'
      + '</div>'
      + '</div>'
      + '<div id="organizational-fixedassets-dispose-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="fixedassets-dispose-confirm" class="organizational-btn organizational-btn-primary">Confirm disposal</button>'
      + '<button type="button" id="fixedassets-dispose-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div>';
    const errEl2 = document.getElementById('organizational-fixedassets-dispose-error');
    document.getElementById('fixedassets-dispose-cancel').addEventListener('click', () => { disposePanel.hidden = true; });
    document.getElementById('fixedassets-dispose-confirm').addEventListener('click', async () => {
      if (errEl2) errEl2.hidden = true;
      const disposalDate = document.getElementById('fixedassets-dispose-date').value;
      if (!disposalDate) { errEl2.textContent = 'Disposal date is required.'; errEl2.hidden = false; return; }
      const proceedsCents = inputToCents(document.getElementById('fixedassets-dispose-proceeds').value);
      const bankAccountId = document.getElementById('fixedassets-dispose-bank').value || null;
      const gainLossAccountId = document.getElementById('fixedassets-dispose-gainloss').value || null;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets/' + asset.id + '/dispose', {
        method: 'POST',
        body: JSON.stringify({ disposal_date: disposalDate, disposal_proceeds_cents: proceedsCents, bank_account_id: bankAccountId, gain_loss_account_id: gainLossAccountId }),
      });
      if (out && out.res.ok) {
        disposePanel.hidden = true;
        await loadAssets();
      } else if (errEl2) {
        errEl2.textContent = (out && out.data && out.data.error) || 'Could not dispose of this asset.';
        errEl2.hidden = false;
      }
    });
  }

  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.fixedassets-edit-btn');
      if (editBtn) {
        const asset = assetsCache.find((a) => a.id === Number(editBtn.getAttribute('data-id')));
        if (asset) openAssetForm(asset);
        return;
      }
      const disposeBtn = e.target.closest('.fixedassets-dispose-btn');
      if (disposeBtn) {
        const asset = assetsCache.find((a) => a.id === Number(disposeBtn.getAttribute('data-id')));
        if (asset) openDisposeForm(asset);
        return;
      }
      const delBtn = e.target.closest('.fixedassets-delete-btn');
      if (delBtn) {
        if (!window.confirm('Delete this asset? It has no posted depreciation yet, so this is safe.')) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets/' + delBtn.getAttribute('data-id'), { method: 'DELETE' });
        if (out && out.res.ok) await loadAssets();
        else showError((out && out.data && out.data.error) || 'Could not delete this asset.');
      }
    });
  }

  // ── Run depreciation: preview, then confirm ──
  const runDeprBtn = document.getElementById('organizational-fixedassets-run-depreciation-btn');
  const deprPanel = document.getElementById('organizational-fixedassets-depr-panel');

  function openRunDepreciationForm() {
    if (!deprPanel) return;
    deprPanel.hidden = false;
    const today = new Date().toISOString().slice(0, 10);
    deprPanel.innerHTML = '<h4 style="margin:0 0 8px;">Run depreciation</h4>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Through date<input type="date" id="fixedassets-depr-through" class="organizational-input" value="' + today + '"></label>'
      + '<button type="button" id="fixedassets-depr-preview-btn" class="organizational-btn organizational-btn-outline" style="align-self:flex-end;">Preview</button>'
      + '</div>'
      + '<div id="fixedassets-depr-preview-body"></div>'
      + '<div id="organizational-fixedassets-depr-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="fixedassets-depr-cancel" class="organizational-btn organizational-btn-outline">Close</button>'
      + '</div>';
    document.getElementById('fixedassets-depr-cancel').addEventListener('click', () => { deprPanel.hidden = true; });
    document.getElementById('fixedassets-depr-preview-btn').addEventListener('click', runPreview);
  }

  async function runPreview() {
    const errEl2 = document.getElementById('organizational-fixedassets-depr-error');
    if (errEl2) errEl2.hidden = true;
    const throughDate = document.getElementById('fixedassets-depr-through').value;
    if (!throughDate) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets/run-depreciation-preview?through_date=' + encodeURIComponent(throughDate));
    const bodyEl = document.getElementById('fixedassets-depr-preview-body');
    if (!out || !out.res.ok) {
      if (errEl2) { errEl2.textContent = (out && out.data && out.data.error) || 'Could not compute preview.'; errEl2.hidden = false; }
      return;
    }
    const periods = out.data.periods || [];
    if (!periods.length) {
      bodyEl.innerHTML = '<p class="organizational-empty" style="margin-top:8px;">Nothing due through ' + esc(throughDate) + '.</p>';
      return;
    }
    bodyEl.innerHTML = '<div class="organizational-table-wrap" style="margin-top:8px;">'
      + '<table class="organizational-table"><thead><tr><th>Asset</th><th>Period</th><th>Amount</th></tr></thead><tbody>'
      + periods.map((p) => '<tr><td>' + esc(p.asset_name) + '</td><td>' + esc(p.period_date) + '</td><td>' + fmtMoney(Number(p.amount_cents)) + '</td></tr>').join('')
      + '</tbody></table></div>'
      + '<p style="font-weight:600;margin:8px 0;">Total: ' + fmtMoney(Number(out.data.total_cents)) + '</p>'
      + '<button type="button" id="fixedassets-depr-confirm-btn" class="organizational-btn organizational-btn-primary">Post ' + periods.length + ' entr' + (periods.length === 1 ? 'y' : 'ies') + '</button>';
    document.getElementById('fixedassets-depr-confirm-btn').addEventListener('click', async () => {
      const out2 = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/fixed-assets/run-depreciation', {
        method: 'POST', body: JSON.stringify({ through_date: throughDate }),
      });
      if (out2 && out2.res.ok) {
        bodyEl.innerHTML = '<p class="organizational-empty" style="margin-top:8px;">Posted ' + out2.data.posted_count + ' entries' + (out2.data.failed_count ? ', ' + out2.data.failed_count + ' failed' : '') + '.</p>';
        await loadAssets();
      } else if (errEl2) {
        errEl2.textContent = (out2 && out2.data && out2.data.error) || 'Could not post depreciation.';
        errEl2.hidden = false;
      }
    });
  }

  if (runDeprBtn) runDeprBtn.addEventListener('click', openRunDepreciationForm);

  // ── Escape closes whichever fixed-assets panel is currently open ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (deprPanel && !deprPanel.hidden) { deprPanel.hidden = true; return; }
    if (disposePanel && !disposePanel.hidden) { disposePanel.hidden = true; return; }
    if (formEl && !formEl.hidden) { formEl.hidden = true; return; }
  });

  // ── Entry point, called by the accounting-workspace coordinator ──
  async function initFixedAssets(slug) {
    currentSlug = slug;
    await loadReferenceData(slug);
    await loadAssets();
  }

  window.OrganizationalAccounting.fixedAssets = { init: initFixedAssets };
})();
