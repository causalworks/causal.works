(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  // ── DOM refs ──
  const errEl        = document.getElementById('organizational-org-error');
  const tbody         = document.getElementById('organizational-ledger-tbody');
  const filterFrom    = document.getElementById('organizational-ledger-filter-from');
  const filterTo      = document.getElementById('organizational-ledger-filter-to');
  const filterStatus  = document.getElementById('organizational-ledger-filter-status');
  const filterGrant   = document.getElementById('organizational-ledger-filter-grant');
  const filterApplyBtn = document.getElementById('organizational-ledger-filter-apply');
  const addBtn        = document.getElementById('organizational-ledger-add');

  const panel        = document.getElementById('organizational-ledger-panel');
  const panelOverlay = document.getElementById('organizational-ledger-panel-overlay');
  const panelBody     = document.getElementById('organizational-ledger-panel-body');
  const panelClose     = document.getElementById('organizational-ledger-panel-close');
  const panelErrEl     = document.getElementById('organizational-ledger-panel-error');

  const policyErrEl = document.getElementById('organizational-approval-policy-error');
  const policyBodyEl = document.getElementById('organizational-approval-policy-body');
  const policyExportLink = document.getElementById('organizational-approval-policy-export-link');
  const flaggedBodyEl = document.getElementById('organizational-flagged-review-body');

  // ── State ──
  let currentSlug   = '';
  let accountsCache = [];
  let programsCache = [];
  let grantsCache   = [];
  let boardDesignationsCache = [];
  let wired         = false; // event listeners attach once; init(slug) can be called again on tab re-entry

  // ── Utilities (shared globals from utils.js) ──
  const esc         = window.escapeHtml;
  const apiJson      = window.apiJson;
  const fmtMoney      = window.formatMoneyCents;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function showPanelError(msg) {
    if (!panelErrEl) return;
    panelErrEl.textContent = msg || '';
    panelErrEl.hidden = !msg;
  }

  function showPolicyError(msg) {
    if (!policyErrEl) return;
    policyErrEl.textContent = msg || '';
    policyErrEl.hidden = !msg;
  }

  function centsToInput(cents) {
    if (cents == null) return '';
    const d = Number(cents) / 100;
    return Number.isFinite(d) ? (d % 1 === 0 ? String(Math.round(d)) : d.toFixed(2)) : '';
  }

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  function statusBadge(status) {
    const label = status === 'pending_approval' ? 'Pending approval' : (status === 'voided' ? 'Voided' : 'Posted');
    return esc(label);
  }

  // ── Reference data ──
  async function loadAccounts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    accountsCache = (out && out.data && (out.data.accounts || out.data)) || [];
    if (!Array.isArray(accountsCache)) accountsCache = [];
    accountsCache = accountsCache.filter((a) => a.is_posting);
  }

  async function loadPrograms(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program');
    programsCache = (out && out.data && (out.data.programs || out.data)) || [];
    if (!Array.isArray(programsCache)) programsCache = [];
  }

  async function loadGrants(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants');
    grantsCache = (out && out.data && (out.data.grants || out.data)) || [];
    if (!Array.isArray(grantsCache)) grantsCache = [];
    if (filterGrant) {
      filterGrant.innerHTML = '<option value="">All grants</option>'
        + grantsCache.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
    }
  }

  async function loadBoardDesignations(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/board-designations');
    const all = (out && out.data && out.data.designations) || [];
    boardDesignationsCache = Array.isArray(all) ? all.filter((d) => d.status === 'active') : [];
  }

  // ── List ──
  // Set by a Dashboard "Open" link (?txn=<id>): show only that transaction until the user clears it.
  let focusTxnId = null;

  function syncFocusNote() {
    let note = document.getElementById('organizational-ledger-focus-note');
    if (!focusTxnId) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.id = 'organizational-ledger-focus-note';
      note.style.cssText = 'padding:8px 16px;font-size:0.8125rem;border-bottom:1px solid var(--border);';
      const bar = document.getElementById('organizational-ledger-filter-bar');
      if (bar && bar.parentNode) bar.parentNode.insertBefore(note, bar.nextSibling);
    }
    note.innerHTML = 'Showing transaction #' + esc(String(focusTxnId)) + ' only. <a href="#" id="organizational-ledger-focus-clear">Show all transactions</a>';
    document.getElementById('organizational-ledger-focus-clear').addEventListener('click', function (e) {
      e.preventDefault();
      focusTxnId = null;
      loadTransactions();
    });
  }

  async function loadTransactions() {
    const params = new URLSearchParams();
    if (focusTxnId) params.set('transaction_id', String(focusTxnId));
    syncFocusNote();
    if (filterFrom && filterFrom.value) params.set('date_from', filterFrom.value);
    if (filterTo && filterTo.value) params.set('date_to', filterTo.value);
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    if (filterGrant && filterGrant.value) params.set('grant_id', filterGrant.value);

    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions?' + params.toString()
    );
    if (!out) return;
    const lines = (out.data && out.data.lines) || [];
    renderRows(lines);
  }

  function renderRows(lines) {
    if (!tbody) return;
    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="9">No transactions yet. Post a transaction to get started.</td></tr>';
      return;
    }
    tbody.innerHTML = lines.map((l) => {
      const actions = [];
      if (l.status === 'pending_approval') {
        actions.push('<button type="button" class="organizational-btn-icon ledger-approve-btn" data-id="' + l.transaction_id + '" title="Approve">✓</button>');
      }
      if (l.status !== 'voided') {
        actions.push('<button type="button" class="organizational-btn-icon ledger-void-btn" data-id="' + l.transaction_id + '" title="Void">✕</button>');
      }
      return '<tr>'
        + '<td>' + esc(String(l.transaction_date || '').slice(0, 10)) + '</td>'
        + '<td>' + esc(l.memo) + '</td>'
        + '<td>' + esc(l.payee) + '</td>'
        + '<td>' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + '</td>'
        + '<td>' + esc(l.program_name) + '</td>'
        + '<td>' + esc(l.grant_name || '—') + '</td>'
        + '<td>' + (Number(l.debit_cents) > 0 ? fmtMoney(l.debit_cents) : '—') + '</td>'
        + '<td>' + (Number(l.credit_cents) > 0 ? fmtMoney(l.credit_cents) : '—') + '</td>'
        + '<td>' + statusBadge(l.status) + ' ' + actions.join(' ') + '</td>'
        + '</tr>';
    }).join('');
  }

  async function approveTransaction(id) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions/' + id + '/approve', { method: 'POST' });
    if (!out) return;
    if (out.res.ok) {
      await loadTransactions();
    } else {
      showError((out.data && out.data.message) || (out.data && out.data.error) || 'Could not approve transaction.');
    }
  }

  async function voidTransaction(id) {
    const reason = window.prompt('Reason for voiding this transaction:');
    if (reason == null) return; // cancelled
    if (!reason.trim()) { showError('A void reason is required.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions/' + id + '/void', {
      method: 'POST',
      body: JSON.stringify({ void_reason: reason.trim() }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadTransactions();
    } else {
      showError((out.data && out.data.message) || (out.data && out.data.error) || 'Could not void transaction.');
    }
  }

  // ── Post transaction panel ──
  function accountOptions(selectedId) {
    return '<option value="">— Account —</option>' + accountsCache.map((a) =>
      '<option value="' + a.id + '"' + (Number(a.id) === Number(selectedId) ? ' selected' : '') + '>'
      + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
  }
  function programOptions(selectedId) {
    return '<option value="">— Program —</option>' + programsCache.map((p) =>
      '<option value="' + p.id + '"' + (Number(p.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(p.name) + '</option>'
    ).join('');
  }
  function grantOptions(selectedId) {
    return '<option value="">— None —</option>' + grantsCache.map((g) =>
      '<option value="' + g.id + '"' + (Number(g.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(g.name) + '</option>'
    ).join('');
  }
  function boardDesignationOptions(selectedId) {
    return '<option value="">— No designation —</option>' + boardDesignationsCache.map((d) =>
      '<option value="' + d.id + '"' + (Number(d.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(d.name) + '</option>'
    ).join('');
  }

  function lineRowHtml() {
    return '<div class="organizational-alloc-line-row">'
      + '<select class="organizational-select ledger-line-account">' + accountOptions() + '</select>'
      + '<select class="organizational-select ledger-line-program">' + programOptions() + '</select>'
      + '<select class="organizational-select ledger-line-grant">' + grantOptions() + '</select>'
      + '<select class="organizational-select ledger-line-board-designation" title="Board designation">' + boardDesignationOptions() + '</select>'
      + '<input type="number" class="organizational-input ledger-line-debit" placeholder="Debit" min="0" step="0.01" style="width:90px">'
      + '<input type="number" class="organizational-input ledger-line-credit" placeholder="Credit" min="0" step="0.01" style="width:90px">'
      + '<button type="button" class="organizational-btn-icon ledger-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function renderPostPanelBody() {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Date *<input type="date" id="ledger-txn-date" class="organizational-input" required></label>'
      + '<label class="organizational-label" style="flex:1">Reference #<input type="text" id="ledger-txn-ref" class="organizational-input" maxlength="100"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Memo<input type="text" id="ledger-txn-memo" class="organizational-input" maxlength="500"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Payee<input type="text" id="ledger-txn-payee" class="organizational-input" maxlength="300"></label></div>'
      + '<div class="organizational-panel-section-head">Lines</div>'
      + '<div id="ledger-lines-wrap">' + lineRowHtml() + lineRowHtml() + '</div>'
      + '<div style="display:flex;align-items:center;gap:12px;margin-top:8px">'
      + '<button type="button" id="ledger-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem">+ Add line</button>'
      + '<span id="ledger-lines-total" style="font-size:0.8125rem;color:var(--text-secondary)"></span>'
      + '</div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="ledger-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="ledger-save" class="organizational-btn organizational-btn-primary">Post transaction</button>'
      + '</div>';
  }

  function refreshLinesTotal() {
    const total = document.getElementById('ledger-lines-total');
    if (!total) return;
    let debitSum = 0, creditSum = 0;
    document.querySelectorAll('.ledger-line-debit').forEach((i) => { debitSum += parseFloat(i.value || 0) || 0; });
    document.querySelectorAll('.ledger-line-credit').forEach((i) => { creditSum += parseFloat(i.value || 0) || 0; });
    const ok = Math.abs(debitSum - creditSum) < 0.005;
    total.textContent = 'Debits: $' + debitSum.toFixed(2) + '  Credits: $' + creditSum.toFixed(2) + (ok ? '  ✓ balanced' : '  — does not balance yet');
    total.style.color = ok ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
  }

  function wirePostPanel() {
    const linesWrap = document.getElementById('ledger-lines-wrap');
    const addLineBtn = document.getElementById('ledger-add-line');
    const cancelBtn = document.getElementById('ledger-cancel');
    const saveBtn = document.getElementById('ledger-save');

    if (addLineBtn) addLineBtn.addEventListener('click', () => {
      linesWrap.insertAdjacentHTML('beforeend', lineRowHtml());
      refreshLinesTotal();
    });
    if (linesWrap) {
      linesWrap.addEventListener('click', (e) => {
        const rm = e.target.closest('.ledger-remove-line');
        if (rm && linesWrap.children.length > 2) { rm.closest('.organizational-alloc-line-row').remove(); refreshLinesTotal(); }
      });
      linesWrap.addEventListener('input', (e) => {
        if (e.target.classList.contains('ledger-line-debit') || e.target.classList.contains('ledger-line-credit')) refreshLinesTotal();
      });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closePostPanel);
    if (saveBtn) saveBtn.addEventListener('click', savePostTransaction);
    refreshLinesTotal();
  }

  async function savePostTransaction() {
    showPanelError('');
    const dateInput = document.getElementById('ledger-txn-date');
    const memo = document.getElementById('ledger-txn-memo').value.trim() || null;
    const payee = document.getElementById('ledger-txn-payee').value.trim() || null;
    const referenceNumber = document.getElementById('ledger-txn-ref').value.trim() || null;

    if (!dateInput.value) { showPanelError('Date is required.'); return; }

    const rows = Array.from(document.querySelectorAll('#ledger-lines-wrap .organizational-alloc-line-row'));
    const lines = [];
    for (const row of rows) {
      const accountId = row.querySelector('.ledger-line-account').value;
      const programId = row.querySelector('.ledger-line-program').value;
      const grantId = row.querySelector('.ledger-line-grant').value;
      const boardDesignationId = row.querySelector('.ledger-line-board-designation').value;
      const debitCents = inputToCents(row.querySelector('.ledger-line-debit').value);
      const creditCents = inputToCents(row.querySelector('.ledger-line-credit').value);
      if (!accountId && !programId && !debitCents && !creditCents) continue; // skip fully-blank rows
      if (!accountId || !programId) { showPanelError('Every line needs an account and a program.'); return; }
      if (Number.isNaN(debitCents) || Number.isNaN(creditCents)) { showPanelError('Debit and credit amounts must be numbers.'); return; }
      lines.push({
        account_id: Number(accountId),
        program_id: Number(programId),
        grant_id: grantId ? Number(grantId) : null,
        board_designation_id: boardDesignationId ? Number(boardDesignationId) : null,
        debit_cents: debitCents,
        credit_cents: creditCents,
      });
    }
    if (lines.length < 2) { showPanelError('A transaction needs at least two lines.'); return; }

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions', {
      method: 'POST',
      body: JSON.stringify({ transaction_date: dateInput.value, memo, payee, reference_number: referenceNumber, lines }),
    });
    if (!out) return;
    if (out.res.ok) {
      closePostPanel();
      await loadTransactions();
    } else {
      // Phase 4's translateLedgerWriteError() always sends a human `message`; fall back to
      // `error`/a generic string for the plain input-shape 400s, which only send `error`.
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not post transaction.');
    }
  }

  function openPostPanel() {
    showPanelError('');
    panelBody.innerHTML = renderPostPanelBody();
    wirePostPanel();
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
  }
  function closePostPanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.ledger-approve-btn');
        if (approveBtn) { approveTransaction(approveBtn.getAttribute('data-id')); return; }
        const voidBtn = e.target.closest('.ledger-void-btn');
        if (voidBtn) { voidTransaction(voidBtn.getAttribute('data-id')); return; }
      });
    }
    if (addBtn) addBtn.addEventListener('click', openPostPanel);
    if (panelClose) panelClose.addEventListener('click', closePostPanel);
    if (panelOverlay) panelOverlay.addEventListener('click', closePostPanel);
    if (filterApplyBtn) filterApplyBtn.addEventListener('click', loadTransactions);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel && panel.classList.contains('organizational-panel-is-open')) closePostPanel();
    });
  }

  // ── Transactions tab entry point, called by the accounting-workspace coordinator ──
  async function initTransactions(slug) {
    currentSlug = slug;
    wireOnce();
    const txnParam = Number(new URLSearchParams(window.location.search).get('txn'));
    if (Number.isInteger(txnParam) && txnParam > 0) {
      focusTxnId = txnParam;
      const u = new URL(window.location.href);
      u.searchParams.delete('txn');
      window.history.replaceState(null, '', u.pathname + u.search);
    }
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug), loadBoardDesignations(slug)]);
    await loadTransactions();
  }

  // ── Approval Policy tab (Phase 5) -- rendered inline into the tab section now that it has
  // its own navigational home, not a sliding panel triggered by a button on the Transactions
  // tab the way it was before this restructure. ──
  async function loadApprovalPolicy(slug) {
    if (!policyBodyEl) return;
    showPolicyError('');
    policyBodyEl.innerHTML = '<p class="organizational-empty">Loading…</p>';
    if (policyExportLink) {
      policyExportLink.href = '/api/organizational/orgs/' + encodeURIComponent(slug) + '/ledger/approval-policy/export';
    }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/ledger/approval-policy');
    if (!out) return;
    const p = out.data || {};
    policyBodyEl.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Reviewer role<input type="text" id="ledger-policy-role" class="organizational-input" value="' + esc(p.reviewer_role) + '" placeholder="e.g. Board Treasurer"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Review cadence<input type="text" id="ledger-policy-cadence" class="organizational-input" value="' + esc(p.review_cadence) + '" placeholder="e.g. Monthly"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Description<textarea id="ledger-policy-desc" rows="3">' + esc(p.description) + '</textarea></label></div>'
      + '<div class="organizational-panel-field-row"><label class="organizational-label">Flagged-review threshold ($)<input type="number" id="ledger-policy-threshold" class="organizational-input" min="0" step="0.01" value="' + centsToInput(p.flagged_amount_threshold_cents) + '" style="width:120px"></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="ledger-policy-save" class="organizational-btn organizational-btn-primary">Save</button>'
      + '</div>';
    const saveBtn = document.getElementById('ledger-policy-save');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      showPolicyError('');
      const body = {
        reviewer_role: document.getElementById('ledger-policy-role').value.trim() || null,
        review_cadence: document.getElementById('ledger-policy-cadence').value.trim() || null,
        description: document.getElementById('ledger-policy-desc').value.trim() || null,
        flagged_amount_threshold_cents: inputToCents(document.getElementById('ledger-policy-threshold').value),
      };
      const out2 = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/ledger/approval-policy', {
        method: 'PUT', body: JSON.stringify(body),
      });
      if (!out2 || !out2.res.ok) showPolicyError((out2 && out2.data && out2.data.error) || 'Could not save approval policy.');
    });
  }

  async function loadFlaggedReview(slug) {
    if (!flaggedBodyEl) return;
    flaggedBodyEl.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Loading…</p>';
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/ledger/flagged-review');
    if (!out) return;
    const txns = (out.data && out.data.transactions) || [];
    if (!txns.length) {
      flaggedBodyEl.innerHTML = '<p class="organizational-empty" style="padding:16px 20px;">Nothing flagged.</p>';
      return;
    }
    flaggedBodyEl.innerHTML = '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Date</th><th>Payee</th><th>Amount</th><th>Flags</th></tr></thead><tbody>'
      + txns.map((t) => {
        const flags = [];
        if (t.flags.large_amount) flags.push('Large amount');
        if (t.flags.new_payee) flags.push('New payee');
        if (t.flags.manual_entry) flags.push('Manual entry');
        return '<tr><td>' + esc(String(t.transaction_date || '').slice(0, 10)) + '</td><td>' + esc(t.payee) + '</td><td>' + fmtMoney(t.total_debit_cents) + '</td><td>' + esc(flags.join(', ')) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  async function initApprovalPolicy(slug) {
    await Promise.all([loadApprovalPolicy(slug), loadFlaggedReview(slug)]);
  }

  window.OrganizationalAccounting.transactions = { init: initTransactions };
  window.OrganizationalAccounting.approvalPolicy = { init: initApprovalPolicy };
})();
