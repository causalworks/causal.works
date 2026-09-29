/* find-recode.js — Find & Recode: dynamic condition search + bulk recode over posted General
 * Ledger transactions. An Accounting tool, not a Budget tool (corrected 2026-09-16 -- an
 * earlier pass wrongly included org_budget_lines). Modeled on Xero's actual Find & Recode UI:
 * a list of conditions, each with its own field + operator (Is/Is Not/etc.) + value, combined
 * by a top-level All/Any toggle, with add/remove controls per condition -- researched via
 * screenshots and a detailed feature writeup from the user, not guessed. See
 * server/organizational/lib/ledgerSearch.js (search/field registry) and
 * server/organizational/lib/findAndRecode.js (the correcting-journal recode itself) for the
 * backend design.
 *
 * Registers window.OrganizationalAccounting.findRecode.init(slug), called eagerly by
 * accounting-workspace.js alongside every other Accounting tab.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;

  // ── DOM refs ──
  const matchModeSelect = document.getElementById('organizational-recode-match-mode');
  const conditionsEl = document.getElementById('organizational-recode-conditions');
  const addConditionBtn = document.getElementById('organizational-recode-add-condition');
  const searchBtn = document.getElementById('organizational-recode-search-btn');
  const searchHint = document.getElementById('organizational-recode-search-hint');
  const resultsCard = document.getElementById('organizational-recode-results-card');
  const resultsThead = document.getElementById('organizational-recode-results-thead');
  const resultsTbody = document.getElementById('organizational-recode-results-tbody');
  const selectAllCb = document.getElementById('organizational-recode-select-all');
  const selectedCountEl = document.getElementById('organizational-recode-selected-count');
  const actionBar = document.getElementById('organizational-recode-action-bar');
  const changeFieldsEl = document.getElementById('organizational-recode-change-fields');
  const previewBtn = document.getElementById('organizational-recode-preview-btn');
  const confirmBtn = document.getElementById('organizational-recode-confirm-btn');
  const previewResultEl = document.getElementById('organizational-recode-preview-result');
  const errEl = document.getElementById('organizational-recode-error');

  // ── Field registry (mirrors server/organizational/lib/ledgerSearch.js's FIELDS) ──
  const OPERATOR_LABELS = {
    is: 'Is', is_not: 'Is Not',
    contains: 'Contains', does_not_contain: 'Does not contain',
    greater_than: 'Greater than', less_than: 'Less than', between: 'Between',
    on_or_after: 'On or after', on_or_before: 'On or before',
  };
  const OPERATORS_BY_TYPE = {
    select: ['is', 'is_not'],
    select_text: ['is', 'is_not'],
    text: ['contains', 'does_not_contain', 'is', 'is_not'],
    number: ['is', 'is_not', 'greater_than', 'less_than', 'between'],
    date: ['is', 'is_not', 'on_or_after', 'on_or_before', 'between'],
  };
  // FIELD_DEFS.options is filled in after loadFieldOptions(); source uses a fixed enum.
  const FIELD_DEFS = {
    account_id: { label: 'Account', type: 'select', options: [] },
    program_id: { label: 'Program/Activity', type: 'select', options: [] },
    grant_id: { label: 'Grant', type: 'select', options: [] },
    transaction_date: { label: 'Date', type: 'date' },
    amount_cents: { label: 'Amount', type: 'number' },
    memo: { label: 'Memo', type: 'text' },
    payee: { label: 'Payee', type: 'text' },
    reference_number: { label: 'Reference #', type: 'text' },
    source: {
      label: 'Type', type: 'select_text',
      options: [
        { id: 'manual', label: 'Manual' }, { id: 'bank_reconciliation', label: 'Bank reconciliation' },
        { id: 'bill_approval', label: 'Bill approval' }, { id: 'invoice', label: 'Invoice' },
        { id: 'bill_payment', label: 'Bill payment' }, { id: 'invoice_payment', label: 'Invoice payment' },
        { id: 'fixed_asset_depreciation', label: 'Fixed asset depreciation' }, { id: 'fixed_asset_disposal', label: 'Fixed asset disposal' },
        { id: 'expense_claim_approval', label: 'Expense claim approval' }, { id: 'expense_claim_payment', label: 'Expense claim payment' },
        { id: 'recode', label: 'Recode' },
      ],
    },
    created_by: { label: 'Entered by', type: 'select', options: [] },
  };
  const FIELD_ORDER = ['account_id', 'program_id', 'grant_id', 'transaction_date', 'amount_cents', 'memo', 'payee', 'reference_number', 'source', 'created_by'];

  // ── State ──
  let currentSlug = '';
  let conditionRows = []; // [{ uid, field, operator }]
  let uidSeq = 0;
  let resultRows = [];
  let selectedIds = new Set();
  let lastPreview = null;
  let wired = false;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function fmtMoney(cents) {
    const n = Number(cents || 0) / 100;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Condition rows ──
  function addConditionRow() {
    uidSeq += 1;
    conditionRows.push({ uid: uidSeq, field: 'account_id', operator: 'is' });
    renderConditions();
  }

  function removeConditionRow(uid) {
    conditionRows = conditionRows.filter((c) => c.uid !== uid);
    if (conditionRows.length === 0) addConditionRow();
    else renderConditions();
  }

  function fieldOptionsHtml(fieldKey, selectEl) {
    const def = FIELD_DEFS[fieldKey];
    return (def.options || [])
      .map((o) => '<option value="' + esc(String(o.id)) + '">' + esc(o.label) + '</option>')
      .join('');
  }

  function valueInputHtml(row) {
    const def = FIELD_DEFS[row.field];
    const opId = 'organizational-recode-cond-val-' + row.uid;
    if (def.type === 'select' || def.type === 'select_text') {
      return '<select id="' + opId + '" multiple class="organizational-input organizational-recode-cond-value" data-uid="' + row.uid + '" style="width:220px;height:70px;font-size:0.8125rem;">' + fieldOptionsHtml(row.field) + '</select>';
    }
    if (def.type === 'text') {
      return '<input type="text" id="' + opId + '" class="organizational-input organizational-recode-cond-value" data-uid="' + row.uid + '" style="font-size:0.8125rem;padding:4px 6px;">';
    }
    if (def.type === 'number') {
      if (row.operator === 'between') {
        return (
          '<span class="organizational-recode-cond-value" data-uid="' + row.uid + '" data-shape="between">' +
          '<input type="number" class="organizational-input organizational-recode-cond-min" placeholder="Min $" style="width:90px;font-size:0.8125rem;padding:4px 6px;"> ' +
          '<input type="number" class="organizational-input organizational-recode-cond-max" placeholder="Max $" style="width:90px;font-size:0.8125rem;padding:4px 6px;"></span>'
        );
      }
      return '<input type="number" id="' + opId + '" class="organizational-input organizational-recode-cond-value" data-uid="' + row.uid + '" placeholder="$" style="width:110px;font-size:0.8125rem;padding:4px 6px;">';
    }
    if (def.type === 'date') {
      if (row.operator === 'between') {
        return (
          '<span class="organizational-recode-cond-value" data-uid="' + row.uid + '" data-shape="between">' +
          '<input type="date" class="organizational-input organizational-recode-cond-min" style="font-size:0.8125rem;padding:4px 6px;"> ' +
          '<input type="date" class="organizational-input organizational-recode-cond-max" style="font-size:0.8125rem;padding:4px 6px;"></span>'
        );
      }
      return '<input type="date" id="' + opId + '" class="organizational-input organizational-recode-cond-value" data-uid="' + row.uid + '" style="font-size:0.8125rem;padding:4px 6px;">';
    }
    return '';
  }

  function renderConditions() {
    if (!conditionsEl) return;
    conditionsEl.innerHTML = conditionRows
      .map((row) => {
        const def = FIELD_DEFS[row.field];
        const fieldOpts = FIELD_ORDER.map((k) => '<option value="' + k + '"' + (k === row.field ? ' selected' : '') + '>' + esc(FIELD_DEFS[k].label) + '</option>').join('');
        const opOpts = OPERATORS_BY_TYPE[def.type]
          .map((op) => '<option value="' + op + '"' + (op === row.operator ? ' selected' : '') + '>' + esc(OPERATOR_LABELS[op]) + '</option>')
          .join('');
        return (
          '<div class="organizational-recode-condition-row" data-uid="' + row.uid + '" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;flex-wrap:nowrap;">' +
          '<select class="organizational-input organizational-recode-cond-field" data-uid="' + row.uid + '" style="width:160px;font-size:0.8125rem;padding:4px 6px;">' + fieldOpts + '</select>' +
          '<select class="organizational-input organizational-recode-cond-op" data-uid="' + row.uid + '" style="width:150px;font-size:0.8125rem;padding:4px 6px;">' + opOpts + '</select>' +
          valueInputHtml(row) +
          (conditionRows.length > 1
            ? '<button type="button" class="organizational-recode-cond-remove" data-uid="' + row.uid + '" aria-label="Remove condition" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.75rem;padding:2px 4px;line-height:1;">✕</button>'
            : '') +
          '</div>'
        );
      })
      .join('');

    conditionsEl.querySelectorAll('.organizational-recode-cond-field').forEach((sel) => {
      sel.addEventListener('change', () => {
        const uid = Number(sel.getAttribute('data-uid'));
        const row = conditionRows.find((c) => c.uid === uid);
        if (!row) return;
        row.field = sel.value;
        row.operator = OPERATORS_BY_TYPE[FIELD_DEFS[row.field].type][0];
        renderConditions();
      });
    });
    conditionsEl.querySelectorAll('.organizational-recode-cond-op').forEach((sel) => {
      sel.addEventListener('change', () => {
        const uid = Number(sel.getAttribute('data-uid'));
        const row = conditionRows.find((c) => c.uid === uid);
        if (!row) return;
        row.operator = sel.value;
        renderConditions();
      });
    });
    conditionsEl.querySelectorAll('.organizational-recode-cond-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeConditionRow(Number(btn.getAttribute('data-uid'))));
    });
  }

  function gatherConditions() {
    const out = [];
    for (const row of conditionRows) {
      const def = FIELD_DEFS[row.field];
      const rowEl = conditionsEl.querySelector('.organizational-recode-condition-row[data-uid="' + row.uid + '"]');
      if (!rowEl) continue;
      let value;
      if (def.type === 'select' || def.type === 'select_text') {
        const sel = rowEl.querySelector('select.organizational-recode-cond-value');
        value = sel ? Array.from(sel.selectedOptions).map((o) => (def.type === 'select' ? Number(o.value) : o.value)) : [];
        if (!value.length) continue;
      } else if (def.type === 'text') {
        const inp = rowEl.querySelector('input.organizational-recode-cond-value');
        value = inp ? inp.value.trim() : '';
        if (!value) continue;
      } else if (def.type === 'number') {
        if (row.operator === 'between') {
          const minEl = rowEl.querySelector('.organizational-recode-cond-min');
          const maxEl = rowEl.querySelector('.organizational-recode-cond-max');
          const min = minEl && minEl.value !== '' ? Math.round(Number(minEl.value) * 100) : undefined;
          const max = maxEl && maxEl.value !== '' ? Math.round(Number(maxEl.value) * 100) : undefined;
          if (min == null && max == null) continue;
          value = { min, max };
        } else {
          const inp = rowEl.querySelector('input.organizational-recode-cond-value');
          if (!inp || inp.value === '') continue;
          value = Math.round(Number(inp.value) * 100);
        }
      } else if (def.type === 'date') {
        if (row.operator === 'between') {
          const minEl = rowEl.querySelector('.organizational-recode-cond-min');
          const maxEl = rowEl.querySelector('.organizational-recode-cond-max');
          const start = minEl ? minEl.value : '';
          const end = maxEl ? maxEl.value : '';
          if (!start && !end) continue;
          value = { start, end };
        } else {
          const inp = rowEl.querySelector('input.organizational-recode-cond-value');
          if (!inp || !inp.value) continue;
          value = inp.value;
        }
      }
      out.push({ field: row.field, operator: row.operator, value });
    }
    return out;
  }

  // ── Search + results ──
  async function doSearch() {
    showError('');
    if (searchHint) searchHint.textContent = 'Searching…';
    resultRows = [];
    selectedIds = new Set();
    if (actionBar) actionBar.hidden = true;
    if (previewResultEl) previewResultEl.innerHTML = '';
    lastPreview = null;

    const conditions = gatherConditions();
    if (conditions.length === 0) {
      if (searchHint) searchHint.textContent = '';
      showError('Add at least one condition with a value.');
      return;
    }
    const matchMode = matchModeSelect ? matchModeSelect.value : 'all';

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/recode/search', {
      method: 'POST', body: JSON.stringify({ conditions, match_mode: matchMode }),
    });
    if (!out || !out.res.ok) {
      if (searchHint) searchHint.textContent = '';
      showError((out && out.data && out.data.error) || 'Search failed.');
      return;
    }
    resultRows = out.data.rows || [];
    if (searchHint) searchHint.textContent = resultRows.length + ' line' + (resultRows.length === 1 ? '' : 's') + (out.data.truncated ? ' (showing first 2,000)' : '');
    renderResults();
  }

  function renderResults() {
    if (!resultsCard || !resultsThead || !resultsTbody) return;
    resultsCard.hidden = resultRows.length === 0;
    if (resultRows.length === 0) {
      resultsThead.innerHTML = '';
      resultsTbody.innerHTML = '';
      return;
    }
    resultsThead.innerHTML = '<tr><th></th><th>Date</th><th>Memo</th><th>Payee</th><th>Account</th><th>Program</th><th>Grant</th><th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th></tr>';
    resultsTbody.innerHTML = resultRows.map((r) => (
      '<tr>' +
      '<td><input type="checkbox" class="organizational-recode-row-cb" data-id="' + r.line_id + '"></td>' +
      '<td>' + esc(String(r.transaction_date || '').slice(0, 10)) + '</td>' +
      '<td>' + esc(r.memo || '—') + '</td>' +
      '<td>' + esc(r.payee || '—') + '</td>' +
      '<td>' + esc(r.account_code ? r.account_code + ' — ' + r.account_name : r.account_name) + '</td>' +
      '<td>' + esc(r.program_name || '—') + '</td>' +
      '<td>' + esc(r.grant_name || '—') + '</td>' +
      '<td style="text-align:right;">' + (Number(r.debit_cents) > 0 ? fmtMoney(r.debit_cents) : '') + '</td>' +
      '<td style="text-align:right;">' + (Number(r.credit_cents) > 0 ? fmtMoney(r.credit_cents) : '') + '</td>' +
      '</tr>'
    )).join('');
    if (selectAllCb) selectAllCb.checked = false;
    resultsTbody.querySelectorAll('.organizational-recode-row-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = Number(cb.getAttribute('data-id'));
        if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateSelection();
      });
    });
    updateSelection();
  }

  function updateSelection() {
    const n = selectedIds.size;
    if (selectedCountEl) selectedCountEl.textContent = n > 0 ? n + ' selected' : '';
    if (actionBar) actionBar.hidden = n === 0;
    if (n === 0 && previewResultEl) previewResultEl.innerHTML = '';
    if (confirmBtn) confirmBtn.disabled = true;
    lastPreview = null;
  }

  // ── Recode action bar ──
  function renderChangeFields() {
    if (!changeFieldsEl) return;
    const acctOpts = (FIELD_DEFS.account_id.options || []).map((o) => '<option value="' + o.id + '">' + esc(o.label) + '</option>').join('');
    const progOpts = (FIELD_DEFS.program_id.options || []).map((o) => '<option value="' + o.id + '">' + esc(o.label) + '</option>').join('');
    const grantOpts = (FIELD_DEFS.grant_id.options || []).map((o) => '<option value="' + o.id + '">' + esc(o.label) + '</option>').join('');
    changeFieldsEl.innerHTML =
      '<div><label style="display:block;font-size:0.75rem;color:var(--text-secondary);margin-bottom:2px;">New account</label>' +
      '<select id="organizational-recode-c-account" class="organizational-input" style="min-width:180px;font-size:0.8125rem;padding:4px 6px;"><option value="">— No change —</option>' + acctOpts + '</select></div>' +
      '<div><label style="display:block;font-size:0.75rem;color:var(--text-secondary);margin-bottom:2px;">New program/activity</label>' +
      '<select id="organizational-recode-c-program" class="organizational-input" style="min-width:180px;font-size:0.8125rem;padding:4px 6px;"><option value="">— No change —</option>' + progOpts + '</select></div>' +
      '<div><label style="display:block;font-size:0.75rem;color:var(--text-secondary);margin-bottom:2px;">New grant</label>' +
      '<select id="organizational-recode-c-grant" class="organizational-input" style="min-width:180px;font-size:0.8125rem;padding:4px 6px;"><option value="">— No change —</option>' + grantOpts + '</select></div>';
  }

  function gatherChanges() {
    const changes = {};
    const acct = document.getElementById('organizational-recode-c-account');
    const prog = document.getElementById('organizational-recode-c-program');
    const grant = document.getElementById('organizational-recode-c-grant');
    if (acct && acct.value) changes.account_id = Number(acct.value);
    if (prog && prog.value) changes.program_id = Number(prog.value);
    if (grant && grant.value) changes.grant_id = Number(grant.value);
    return changes;
  }

  function renderPreview(preview) {
    if (!previewResultEl) return;
    let html = '<p style="margin:0;">' + preview.rowCount + ' line(s) selected, ' + fmtMoney(preview.totalCents) + ' total.';
    if (preview.notPostedCount > 0) {
      html += ' <strong style="color:var(--organizational-danger,#b91c1c);">' + preview.notPostedCount + ' are not posted and cannot be recoded.</strong>';
    } else if (preview.targetIsSystemAccount) {
      html += ' <strong style="color:var(--organizational-danger,#b91c1c);">The new account is a system account and cannot be a recode target.</strong>';
    } else {
      html += ' A new correcting journal will be posted today, reclassifying this amount to the new coding. The original transaction(s) stay untouched.';
    }
    html += '</p>';
    previewResultEl.innerHTML = html;
    if (confirmBtn) confirmBtn.disabled = !!preview.hasConflicts || preview.rowCount === 0;
    lastPreview = preview;
  }

  async function doPreview() {
    showError('');
    const changes = gatherChanges();
    if (Object.keys(changes).length === 0) {
      showError('Choose at least one field to recode to.');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/recode/preview', {
      method: 'POST', body: JSON.stringify({ line_ids: ids, changes }),
    });
    if (!out || !out.res.ok) { showError((out && out.data && out.data.error) || 'Could not preview.'); return; }
    renderPreview(out.data);
  }

  async function doConfirm() {
    showError('');
    if (!lastPreview || lastPreview.hasConflicts) return;
    const changes = gatherChanges();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (confirmBtn) confirmBtn.disabled = true;

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/recode', {
      method: 'POST', body: JSON.stringify({ line_ids: ids, changes }),
    });
    if (!out || !out.res.ok) {
      showError((out && out.data && out.data.error) || 'Could not recode.');
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }
    if (previewResultEl) previewResultEl.innerHTML = '<p style="margin:0;color:var(--organizational-success,#166534);">Posted a correcting journal (#' + out.data.correcting_journal_id + ') for ' + out.data.line_count + ' line(s).</p>';
    selectedIds = new Set();
    await doSearch();
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    if (addConditionBtn) addConditionBtn.addEventListener('click', addConditionRow);
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (selectAllCb) {
      selectAllCb.addEventListener('change', () => {
        selectedIds = new Set();
        resultsTbody.querySelectorAll('.organizational-recode-row-cb').forEach((cb) => {
          cb.checked = selectAllCb.checked;
          if (selectAllCb.checked) selectedIds.add(Number(cb.getAttribute('data-id')));
        });
        updateSelection();
      });
    }
    if (previewBtn) previewBtn.addEventListener('click', doPreview);
    if (confirmBtn) confirmBtn.addEventListener('click', doConfirm);
  }

  async function loadFieldOptions(slug) {
    // Admin-only endpoint (requireOrgRole('admin') server-side) -- but this init() call runs
    // unconditionally for every Accounting page load (accounting-workspace.js inits every tab's
    // module in parallel, not just the visible one), so a non-admin viewing any other tab was
    // getting utils.js's global 403 handler booting them straight out of the whole page to
    // /app.html?coop=disabled with no explanation. skip403Redirect + the existing !out.res.ok
    // fallback below (empty option lists) means a non-admin just sees an empty Find & Recode tab
    // instead, which is the right degrade for a role-scoped 403 the code's own utils.js comment
    // already describes.
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/ledger/recode/field-options', { method: 'GET', skip403Redirect: true });
    const data = (out && out.res.ok && out.data) || { accounts: [], programs: [], grants: [], users: [] };
    FIELD_DEFS.account_id.options = (data.accounts || []).map((a) => ({ id: a.id, label: a.code ? a.code + ' — ' + a.name : a.name }));
    FIELD_DEFS.program_id.options = (data.programs || []).map((p) => ({ id: p.id, label: (p.parent_id != null ? '— ' : '') + p.name }));
    FIELD_DEFS.grant_id.options = (data.grants || []).map((g) => ({ id: g.id, label: g.name }));
    FIELD_DEFS.created_by.options = (data.users || []).map((u) => ({ id: u.id, label: u.email }));
  }

  window.OrganizationalAccounting.findRecode = {
    init: async function (slug) {
      currentSlug = slug;
      await loadFieldOptions(slug);
      wireOnce();
      if (conditionRows.length === 0) addConditionRow();
      else renderConditions();
      renderChangeFields();
    },
  };
})();
