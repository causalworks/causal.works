(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const errEl = document.getElementById('organizational-org-error');
  const tbody = document.getElementById('organizational-banking-tbody');
  const acctSelect = document.getElementById('organizational-banking-account');
  const importBtn = document.getElementById('organizational-banking-import-btn');
  const importFile = document.getElementById('organizational-banking-import-file');
  const acctDropdown = document.getElementById('organizational-banking-account-dropdown');
  const connectBtn = document.getElementById('organizational-banking-connect-btn');

  const plaidMapPanel = document.getElementById('organizational-plaid-map-panel');
  const plaidMapOverlay = document.getElementById('organizational-plaid-map-panel-overlay');
  const plaidMapBody = document.getElementById('organizational-plaid-map-panel-body');
  const plaidMapClose = document.getElementById('organizational-plaid-map-panel-close');
  const plaidMapErrEl = document.getElementById('organizational-plaid-map-panel-error');

  const importPanel = document.getElementById('organizational-banking-import-panel');
  const importOverlay = document.getElementById('organizational-banking-import-panel-overlay');
  const importBody = document.getElementById('organizational-banking-import-panel-body');
  const importClose = document.getElementById('organizational-banking-import-panel-close');
  const importErrEl = document.getElementById('organizational-banking-import-panel-error');

  const cardsContainer = document.getElementById('organizational-banking-cards');
  const tableWrap = document.getElementById('organizational-banking-table-wrap');
  let tableLines = [];
  let tableStatus = '';
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    columns: [
      { key: 'statement_date', type: 'date', get: (l) => l.statement_date },
      null,
      { key: 'payee', type: 'text', get: (l) => l.payee_raw },
      { key: 'amount', type: 'currency', get: (l) => lineSignedCents(l) },
      null,
      null,
    ],
    onChange: () => renderRows(tableLines, tableStatus),
  }) : null;

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  function lineSignedCents(l) {
    return l.credit_debit_indicator === 'debit' ? -Number(l.amount_cents) : Number(l.amount_cents);
  }

  let currentSlug = '';
  let cashAccountsCache = [];
  let codingAccountsCache = [];
  let programsCache = [];
  let grantsCache = [];
  let plaidStatusByAccount = {};
  const rowActiveTab = new Map();
  const rowMatchCandidates = new Map();
  const rowFindMatchOpen = new Map();
  const rowCodingSuggestion = new Map();
  const rowRuleMatch = new Map();
  const rowMultiSelected = new Map();

  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }
  function showImportError(msg) { if (importErrEl) { importErrEl.textContent = msg || ''; importErrEl.hidden = !msg; } }
  function showPlaidMapError(msg) { if (plaidMapErrEl) { plaidMapErrEl.textContent = msg || ''; plaidMapErrEl.hidden = !msg; } }
  function showRowError(lineId, msg) {
    const el = document.getElementById('banking-row-error-' + lineId);
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  async function loadAccounts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    const all = (out && out.data && out.data.accounts) || [];
    cashAccountsCache = all.filter((a) => a.is_cash_account);
    codingAccountsCache = all.filter((a) => a.is_posting && !a.is_cash_account && !a.is_system_clearing_account && !a.is_system_ap_account && !a.is_system_ar_account);
    if (acctSelect) {
      acctSelect.innerHTML = cashAccountsCache.map((a) =>
        '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
      ).join('');
    }
  }
  async function loadPrograms(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program');
    programsCache = (out && out.data && out.data.programs) || [];
  }
  async function loadGrants(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants');
    grantsCache = (out && out.data && out.data.grants) || [];
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
  function grantOptions(selectedId) {
    return '<option value="">— None —</option>' + grantsCache.map((g) =>
      '<option value="' + g.id + '"' + (Number(g.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(g.name) + '</option>'
    ).join('');
  }

  const statusFilter = document.getElementById('organizational-banking-status-filter');

  async function loadLines() {
    const bankAccountId = acctSelect && acctSelect.value;
    if (!bankAccountId) { renderRows([]); return; }
    const status = (statusFilter && statusFilter.value) || 'unconfirmed';
    const params = new URLSearchParams({ status, bank_account_id: bankAccountId });
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines?' + params.toString());
    renderRows((out && out.data && out.data.lines) || [], status);
  }

  let currentUnconfirmedLines = [];

  function setBankingTabCounts(n) {
    [['reconcile', 'Reconcile'], ['cash-coding', 'Cash Coding']].forEach(([view, text]) => {
      const b = document.querySelector('#organizational-banking-view-tabs [data-view="' + view + '"]');
      if (b) b.textContent = text + (n ? ' (' + n + ')' : '');
    });
  }

  function renderRows(lines, status) {
    const isUnconfirmed = (status || 'unconfirmed') === 'unconfirmed';
    if (cardsContainer) cardsContainer.hidden = !isUnconfirmed;
    if (tableWrap) tableWrap.hidden = isUnconfirmed;

    if (isUnconfirmed) {
      currentUnconfirmedLines = lines;
      setBankingTabCounts(lines.length);
      renderUnconfirmedCards(lines);
      return;
    }
    if (!tbody) return;
    tableLines = lines;
    tableStatus = status;
    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No ' + (status || '').replace('_', ' ') + ' lines.</td></tr>';
      return;
    }
    tbody.innerHTML = (sorter ? sorter.sortRows(lines) : lines).map((l) => (
      '<tr>'
      + '<td>' + esc(String(l.statement_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(l.description_raw) + '</td>'
      + '<td>' + esc(l.payee_raw) + '</td>'
      + '<td>' + fmtMoney(lineSignedCents(l)) + '</td>'
      + '<td></td>'
      + '<td><button type="button" class="organizational-btn organizational-btn-outline banking-unreconcile-btn" data-id="' + l.id + '" style="font-size:0.8125rem;">Unreconcile</button></td>'
      + '</tr>'
    )).join('');
  }

  function cardHtml(l) {
    const signed = lineSignedCents(l);
    const spent = signed < 0 ? fmtMoney(Math.abs(signed)) : '—';
    const received = signed > 0 ? fmtMoney(signed) : '—';
    const pendingBadge = l.pending ? '<span class="organizational-badge" style="margin-left:6px;">Pending</span>' : '';
    if (!rowActiveTab.has(l.id)) rowActiveTab.set(l.id, 'match');
    const activeTab = rowActiveTab.get(l.id);
    const discussLabel = l.discuss_note ? 'Discuss *' : 'Discuss';
    const tabBtn = (tab, label) => '<button type="button" class="organizational-tab banking-row-tab' + (activeTab === tab ? ' active' : '') + '" data-line="' + l.id + '" data-tab="' + tab + '" style="font-size:0.8125rem;">' + label + '</button>';

    return '<div class="organizational-card" style="display:grid;grid-template-columns:1fr 1.4fr;gap:0;margin-bottom:10px;padding:0;overflow:hidden;" data-line-id="' + l.id + '">'
      + '<div style="padding:12px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:0.8125rem;color:var(--text-secondary);">' + esc(String(l.statement_date || '').slice(0, 10)) + pendingBadge + '</div>'
      + '<div style="font-weight:600;margin:2px 0;">' + esc(l.payee_raw || l.description_raw || 'Unknown') + '</div>'
      + (l.payee_raw && l.description_raw ? '<div style="font-size:0.8125rem;color:var(--text-secondary);">' + esc(l.description_raw) + '</div>' : '')
      + '<div style="display:flex;gap:20px;margin-top:8px;">'
      + '<div><div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;">Spent</div><div>' + spent + '</div></div>'
      + '<div><div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;">Received</div><div>' + received + '</div></div>'
      + '</div>'
      + '</div>'
      + '<div style="padding:12px 16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">'
      + '<div class="organizational-tabs" style="border-bottom:none;">' + tabBtn('match', 'Match') + tabBtn('create', 'Create') + tabBtn('transfer', 'Transfer') + tabBtn('discuss', discussLabel) + '</div>'
      + '<button type="button" class="banking-findmatch-link" data-line="' + l.id + '" style="background:none;border:none;color:var(--organizational-accent);font-size:0.8125rem;cursor:pointer;padding:0;">' + (rowFindMatchOpen.get(l.id) ? 'Hide full list' : 'Find &amp; Match') + '</button>'
      + '</div>'
      + '<p class="organizational-panel-error" id="banking-row-error-' + l.id + '" hidden></p>'
      + '<div class="banking-row-tab-content" id="banking-row-content-' + l.id + '" style="margin-top:8px;"></div>'
      + '</div>'
      + '</div>';
  }

  function renderUnconfirmedCards(lines) {
    if (!cardsContainer) return;
    if (!lines.length) {
      cardsContainer.innerHTML = '<p class="organizational-empty">No unconfirmed lines. Import a statement or connect a bank to get started.</p>';
      return;
    }
    cardsContainer.innerHTML = lines.map(cardHtml).join('');
    lines.forEach((l) => renderRowTabContent(l));
  }

  function renderRowTabContent(line) {
    const tab = rowActiveTab.get(line.id) || 'match';
    if (tab === 'match') renderMatchTab(line);
    else if (tab === 'create') renderCreateTab(line);
    else if (tab === 'transfer') renderTransferTab(line);
    else renderDiscussTab(line);
  }

  if (cardsContainer) {
    cardsContainer.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.banking-row-tab');
      if (tabBtn) {
        const lineId = Number(tabBtn.getAttribute('data-line'));
        rowActiveTab.set(lineId, tabBtn.getAttribute('data-tab'));
        tabBtn.parentElement.querySelectorAll('.banking-row-tab').forEach((b) => b.classList.toggle('active', b === tabBtn));
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderRowTabContent(line);
        return;
      }
      const findMatchBtn = e.target.closest('.banking-findmatch-link');
      if (findMatchBtn) {
        const lineId = Number(findMatchBtn.getAttribute('data-line'));
        const nowOpen = !rowFindMatchOpen.get(lineId);
        rowFindMatchOpen.set(lineId, nowOpen);
        findMatchBtn.innerHTML = nowOpen ? 'Hide full list' : 'Find &amp; Match';
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line && (rowActiveTab.get(lineId) || 'match') === 'match') renderMatchTab(line);
        return;
      }
      const addDetailsBtn = e.target.closest('.reconcile-add-details');
      if (addDetailsBtn) {
        const lineId = Number(addDetailsBtn.getAttribute('data-line'));
        reconcileMultiSplit.add(lineId);
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderCreateTab(line);
        return;
      }
      const removeDetailsBtn = e.target.closest('.reconcile-remove-details');
      if (removeDetailsBtn) {
        const lineId = Number(removeDetailsBtn.getAttribute('data-line'));
        reconcileMultiSplit.delete(lineId);
        reconcileSplits.delete(lineId);
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderCreateTab(line);
        return;
      }
      const addSplitBtn = e.target.closest('.reconcile-add-split');
      if (addSplitBtn) {
        const lineId = Number(addSplitBtn.getAttribute('data-line'));
        syncSplitsFromDom(lineId);
        reconcileSplits.get(lineId).push({ accountId: '', programId: '', grantId: '', restrictionClass: 'unrestricted', amountCents: null });
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderCreateTab(line);
      }
    });
  }

  function unreconcileLine(lineId) {
    const views = window.OrganizationalAccounting.bankViews;
    if (!views) return;
    views.unreconcileWithReason(lineId, 'organizational-banking-view-reconcile', async (r) => {
      showError('');
      await loadLines();
    });
  }

  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const unrecBtn = e.target.closest('.banking-unreconcile-btn');
      if (unrecBtn) unreconcileLine(Number(unrecBtn.getAttribute('data-id')));
    });
  }
  if (acctSelect) acctSelect.addEventListener('change', () => { loadLines(); if (currentView === 'cash-coding') loadCashCodingGrid(); });
  if (statusFilter) statusFilter.addEventListener('change', loadLines);

  let currentView = 'reconcile';
  const viewTabs = document.querySelectorAll('#organizational-banking-view-tabs .organizational-tab');
  viewTabs.forEach((b) => b.addEventListener('click', () => {
    currentView = b.getAttribute('data-view');
    viewTabs.forEach((t) => t.classList.toggle('active', t === b));
    document.querySelectorAll('section[id^="organizational-banking-view-"]').forEach((sec) => {
      sec.classList.toggle('active', sec.id === 'organizational-banking-view-' + currentView);
    });
    document.dispatchEvent(new CustomEvent('banking:view', { detail: { view: currentView } }));
    if (currentView === 'cash-coding') loadCashCodingGrid();
    if (currentView === 'rules') loadBankRules();
  }));

  const cashCodingSplits = new Map();
  const cashCodingTransfers = new Map();
  const cashCodingMatchRows = new Map();
  const cashCodingChecked = new Set();
  const cashCodingRuleApplied = new Map();
  let cashCodingLines = [];
  let cashCodingEdit = null;
  let cashCodingShowMatches = false;
  let cashCodingLoadToken = 0;

  function blankSplit() { return { accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null }; }

  async function loadCashCodingGrid() {
    const token = ++cashCodingLoadToken;
    const bankAccountId = acctSelect && acctSelect.value;
    cashCodingSplits.clear(); cashCodingTransfers.clear(); cashCodingMatchRows.clear();
    cashCodingChecked.clear(); cashCodingRuleApplied.clear(); cashCodingEdit = null;
    setCashCodingStatus('');
    if (!bankAccountId) { cashCodingLines = []; renderCashCodingGrid(); return; }
    const params = new URLSearchParams({ status: 'unconfirmed', bank_account_id: bankAccountId });
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines?' + params.toString());
    if (token !== cashCodingLoadToken) return;
    cashCodingLines = (out && out.data && out.data.lines) || [];
    cashCodingLines.forEach((l) => cashCodingSplits.set(l.id, [blankSplit()]));
    renderCashCodingGrid();
    loadCashCodingMatchFlags(cashCodingLines.slice(), token);
  }

  async function loadCashCodingMatchFlags(queue, token) {
    const worker = async () => {
      while (queue.length) {
        const l = queue.shift();
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + l.id + '/match-candidates');
        if (token !== cashCodingLoadToken) return;
        cashCodingMatchRows.set(l.id, (out && out.res.ok) ? candidateRows(out.data) : []);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (token !== cashCodingLoadToken) return;
    if (cashCodingEdit) { setTimeout(() => loadCashCodingMatchFlags([], token).then(() => { if (!cashCodingEdit) renderCashCodingGrid(); }), 1500); return; }
    renderCashCodingGrid();
  }

  function setCashCodingStatus(msg) {
    const el = document.getElementById('organizational-cashcoding-status');
    if (el) el.textContent = msg || '';
  }

  function splitRowHtml(lineId, idx, split, showAmount) {
    const acct = '<select class="organizational-select cashcoding-account" style="' + (showAmount ? 'width:100%;' : 'width:150px;') + '">' + accountOptions(codingAccountsCache, split.accountId) + '</select>';
    const prog = '<select class="organizational-select cashcoding-program" style="' + (showAmount ? 'flex:1 1 0;min-width:0;' : 'width:110px;') + '">' + programOptions(split.programId) + '</select>';
    const grant = '<select class="organizational-select cashcoding-grant" style="' + (showAmount ? 'flex:1 1 0;min-width:0;' : 'width:110px;') + '">' + grantOptions(split.grantId) + '</select>';
    const restr = '<select class="organizational-select cashcoding-restriction" style="' + (showAmount ? 'flex:1 1 0;min-width:0;' : 'width:110px;') + '">'
      + '<option value=""' + (split.restrictionClass ? '' : ' selected') + '>— None —</option>'
      + '<option value="unrestricted"' + (split.restrictionClass === 'unrestricted' ? ' selected' : '') + '>Unrestricted</option>'
      + '<option value="temporarily_restricted"' + (split.restrictionClass === 'temporarily_restricted' ? ' selected' : '') + '>Temp. restricted</option>'
      + '<option value="permanently_restricted"' + (split.restrictionClass === 'permanently_restricted' ? ' selected' : '') + '>Perm. restricted</option>'
      + '</select>';
    const amount = showAmount ? '<input type="number" class="organizational-input cashcoding-split-amount" placeholder="Amount" min="0" step="0.01" value="' + (split.amountCents != null ? (split.amountCents / 100).toFixed(2) : '') + '" style="width:110px;flex:none;">' : '';
    if (showAmount) {
      return '<div class="cashcoding-split-row" data-line="' + lineId + '" data-idx="' + idx + '" style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle);">'
        + '<div style="margin-bottom:4px;">' + acct + '</div>'
        + '<div style="display:flex;gap:4px;align-items:center;">' + prog + grant + restr + amount + '</div></div>';
    }
    return '<div class="cashcoding-split-row" data-line="' + lineId + '" data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;margin-bottom:2px;">'
      + acct + prog + grant + restr + amount + '</div>';
  }

  const cashCodingTbodyEl = document.getElementById('organizational-cashcoding-tbody');
  const cashCodingSorter = cashCodingTbodyEl && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(cashCodingTbodyEl.closest('table'), {
    columns: [
      null,
      { key: 'date', type: 'date', get: (l) => l.statement_date },
      { key: 'payee', type: 'text', get: (l) => l.payee_raw },
      { key: 'description', type: 'text', get: (l) => l.description_raw },
      { key: 'account', type: 'text', get: (l) => accountLabelFor((cashCodingSplits.get(l.id) || [])[0] && cashCodingSplits.get(l.id)[0].accountId) },
      { key: 'program', type: 'text', get: (l) => programLabelFor((cashCodingSplits.get(l.id) || [])[0] && cashCodingSplits.get(l.id)[0].programId) },
      { key: 'grant', type: 'text', get: (l) => grantLabelFor((cashCodingSplits.get(l.id) || [])[0] && cashCodingSplits.get(l.id)[0].grantId) },
      null,
      { key: 'spent', type: 'currency', get: (l) => (lineSignedCents(l) < 0 ? Math.abs(lineSignedCents(l)) : null) },
      { key: 'received', type: 'currency', get: (l) => (lineSignedCents(l) > 0 ? lineSignedCents(l) : null) },
      null, null,
    ],
    onChange: () => renderCashCodingGrid(),
  }) : null;
  function sortedCashCodingLines(lines) { return cashCodingSorter ? cashCodingSorter.sortRows(lines) : lines; }

  function accountLabelFor(id) {
    const a = codingAccountsCache.find((x) => Number(x.id) === Number(id));
    return a ? (a.code ? a.code + ' — ' + a.name : a.name) : '';
  }
  function cashAccountLabelFor(id) {
    const a = cashAccountsCache.find((x) => Number(x.id) === Number(id));
    return a ? (a.code ? a.code + ' — ' + a.name : a.name) : '';
  }
  function programLabelFor(id) { const p = programsCache.find((x) => Number(x.id) === Number(id)); return p ? p.name : ''; }
  function grantLabelFor(id) { const g = grantsCache.find((x) => Number(x.id) === Number(id)); return g ? g.name : ''; }
  const RESTRICTION_LABELS = { unrestricted: 'Unrestricted', temporarily_restricted: 'Temp. restricted', permanently_restricted: 'Perm. restricted' };

  function ccCell(line, idx, field, text) {
    const editing = cashCodingEdit && cashCodingEdit.lineId === line.id && cashCodingEdit.idx === idx && cashCodingEdit.field === field;
    if (editing) {
      return '<td class="cc-cell" style="padding:0 2px;"><input type="text" class="organizational-input cc-combo" autocomplete="off" data-line="' + line.id + '" data-idx="' + idx + '" data-field="' + field + '" placeholder="' + esc(text || 'Type to search') + '" style="width:100%;"></td>';
    }
    return '<td class="cc-cell" data-line="' + line.id + '" data-idx="' + idx + '" data-field="' + field + '" title="' + esc(text || 'Click to choose') + '" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(text) + '</td>';
  }

  function ccChoices(lineId, idx, field) {
    const line = cashCodingLines.find((l) => l.id === lineId);
    const split = (cashCodingSplits.get(lineId) || [])[idx] || blankSplit();
    const lab = (a) => (a.code ? a.code + ' — ' + a.name : a.name);
    let list, current;
    if (field === 'account') { list = codingAccountsCache.map((a) => ({ value: String(a.id), label: lab(a) })); current = split.accountId; }
    else if (field === 'transfer') { list = cashAccountsCache.filter((a) => a.id !== line.bank_account_id).map((a) => ({ value: String(a.id), label: lab(a) })); current = cashCodingTransfers.get(lineId); }
    else if (field === 'program') { list = programsCache.map((p) => ({ value: String(p.id), label: p.name })); current = split.programId; }
    else if (field === 'grant') { list = grantsCache.map((g) => ({ value: String(g.id), label: g.name })); current = split.grantId; }
    else { list = Object.keys(RESTRICTION_LABELS).map((k) => ({ value: k, label: RESTRICTION_LABELS[k] })); current = split.restrictionClass; }
    if (current) list = [{ value: '', label: '— none —' }].concat(list);
    return { list, current: current == null ? '' : String(current) };
  }

  function closeCcPopup() { const el = document.getElementById('cc-combo-pop'); if (el) el.remove(); }

  function openCcCombo(input) {
    closeCcPopup();
    const lineId = Number(input.getAttribute('data-line')), idx = Number(input.getAttribute('data-idx')), field = input.getAttribute('data-field');
    const { list, current } = ccChoices(lineId, idx, field);
    const pop = document.createElement('div');
    pop.id = 'cc-combo-pop';
    const r = input.getBoundingClientRect();
    const width = Math.max(r.width, 300);
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const up = spaceBelow < 180 && r.top > spaceBelow;
    pop.style.cssText = 'position:fixed;z-index:1000;left:' + Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px;width:' + width + 'px;max-height:' + Math.max(140, Math.min(280, (up ? r.top : spaceBelow) - 8)) + 'px;overflow-y:auto;'
      + (up ? 'bottom:' + (window.innerHeight - r.top + 2) + 'px;' : 'top:' + (r.bottom + 2) + 'px;')
      + 'background:var(--surface-card);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-lg);padding:2px 0;font-size:0.8125rem;';
    document.body.appendChild(pop);
    let shown = list, active = Math.max(0, list.findIndex((c) => c.value === current));
    const paint = () => {
      pop.innerHTML = shown.length
        ? shown.map((c, i) => '<div class="cc-opt" data-value="' + esc(c.value) + '" style="padding:5px 10px;cursor:pointer;' + (i === active ? 'background:var(--surface-active);' : '') + (c.value === current ? 'font-weight:600;' : '') + '">' + esc(c.label) + '</div>').join('')
        : '<div style="padding:6px 10px;color:var(--text-secondary);">No matches</div>';
      const act = pop.children[active]; if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    };
    paint();
    const pick = (value) => { closeCcPopup(); commitCashCodingEdit(lineId, idx, field, value); };
    pop.addEventListener('mousedown', (e) => { const o = e.target.closest('.cc-opt'); if (o) { e.preventDefault(); pick(o.getAttribute('data-value')); } });
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      shown = q ? list.filter((c) => c.label.toLowerCase().includes(q)) : list;
      active = 0; paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active].value); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelCcEdit(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (cashCodingEdit && document.activeElement !== input) cancelCcEdit(); }, 120));
    input.focus();
  }

  function cancelCcEdit() { closeCcPopup(); cashCodingEdit = null; renderCashCodingGrid(); }

  function commitCashCodingEdit(lineId, idx, field, value) {
    const sp = (cashCodingSplits.get(lineId) || [])[idx];
    if (field === 'transfer') cashCodingTransfers.set(lineId, value ? Number(value) : '');
    else if (sp) {
      if (field === 'account') {
        sp.accountId = value;
        const rule = cashCodingRuleApplied.get(lineId);
        if (rule && Number(rule.account_id) !== Number(value)) cashCodingRuleApplied.delete(lineId);
      } else if (field === 'program') sp.programId = value;
      else if (field === 'grant') sp.grantId = value;
      else sp.restrictionClass = value;
    }
    if (field !== 'transfer' || value) cashCodingChecked.add(lineId);
    cashCodingEdit = null;
    renderCashCodingGrid();
  }

  function cashCodingRowsHtml(l) {
    const splits = cashCodingSplits.get(l.id) || [blankSplit()];
    const isTransfer = cashCodingTransfers.has(l.id);
    const suggested = cashCodingMatchRows.get(l.id) || [];
    const signed = lineSignedCents(l);
    const spent = signed < 0, magnitude = Math.abs(signed);
    const multi = splits.length > 1;
    return splits.map((sp, i) => {
      const first = i === 0;
      const lead = first
        ? '<td><input type="checkbox" class="cc-check" data-line="' + l.id + '"' + (cashCodingChecked.has(l.id) ? ' checked' : '') + ' aria-label="Select line"></td>'
          + '<td style="white-space:nowrap;">' + esc(String(l.statement_date || '').slice(0, 10)) + '</td>'
          + '<td title="' + esc(l.payee_raw || '') + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(l.payee_raw || '') + '</td>'
          + '<td title="' + esc(l.description_raw || '') + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(l.description_raw || '') + (multi ? ' <span style="color:var(--text-secondary);">(total ' + fmtMoney(magnitude) + ')</span>' : '') + '</td>'
        : '<td></td><td colspan="3" style="text-align:right;color:var(--text-secondary);">split ' + (i + 1) + '</td>';
      let coding;
      if (suggested.length && first) {
        coding = '<td colspan="4" style="color:var(--text-secondary);">Possible match: ' + esc(suggested[0].label) + (suggested.length > 1 ? ' (+' + (suggested.length - 1) + ')' : '') + '</td>';
      } else if (isTransfer) {
        coding = ccCell(l, i, 'transfer', cashAccountLabelFor(cashCodingTransfers.get(l.id)) || 'Transfer to…')
          + '<td colspan="3" style="color:var(--text-secondary);">Transfer</td>';
      } else {
        const ruleTitle = cashCodingRuleApplied.get(l.id);
        coding = ccCell(l, i, 'account', accountLabelFor(sp.accountId))
          + ccCell(l, i, 'program', programLabelFor(sp.programId))
          + ccCell(l, i, 'grant', grantLabelFor(sp.grantId))
          + ccCell(l, i, 'restriction', RESTRICTION_LABELS[sp.restrictionClass] || '');
        if (ruleTitle && first) coding = coding.replace('title="Click to choose"', 'title="Filled by rule: ' + esc(ruleTitle.rule_name) + '"');
      }
      const amountText = multi
        ? '<input type="number" class="organizational-input cc-amount" data-line="' + l.id + '" data-idx="' + i + '" min="0" step="0.01" value="' + (sp.amountCents != null ? sp.amountCents / 100 : '') + '" style="width:90px;text-align:right;">'
        : fmtMoney(magnitude);
      const amounts = '<td style="text-align:right;">' + (spent ? amountText : '') + '</td><td style="text-align:right;">' + (spent ? '' : amountText) + '</td>';
      const flag = suggested.length && first
        ? '<td><button type="button" class="cc-match" title="Possible match found — open Reconcile" style="background:none;border:none;color:var(--green);cursor:pointer;font-size:1rem;padding:0;">&#10003;</button></td>' : '<td></td>';
      const menu = '<td><button type="button" class="cc-menu" data-line="' + l.id + '" data-idx="' + i + '" aria-label="Row actions" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:0 4px;">&#9662;</button></td>';
      return '<tr data-line-row="' + l.id + '"' + (first ? '' : ' style="background:var(--surface-page);"') + '>' + lead + coding + amounts + flag + menu + '</tr>';
    }).join('');
  }

  function renderCashCodingGrid() {
    const tbody = document.getElementById('organizational-cashcoding-tbody');
    if (!tbody) return;
    const visible = cashCodingLines.filter((l) => cashCodingShowMatches || !(cashCodingMatchRows.get(l.id) || []).length);
    const hidden = cashCodingLines.length - visible.length;
    const showLbl = document.getElementById('organizational-cashcoding-show-label');
    if (showLbl) showLbl.textContent = 'Show lines with suggested matches' + (hidden ? ' (' + hidden + ')' : '');
    if (!visible.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="12">' + (cashCodingLines.length ? 'No lines without a suggested match.' : 'No unconfirmed lines.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = sortedCashCodingLines(visible).map(cashCodingRowsHtml).join('');
    closeCcPopup();
    const combo = tbody.querySelector('input.cc-combo');
    if (combo) openCcCombo(combo);
    const all = document.getElementById('organizational-cashcoding-select-all');
    if (all) all.checked = visible.length > 0 && visible.every((l) => cashCodingChecked.has(l.id));
  }

  function closeCashCodingMenu() { const m = document.getElementById('cc-menu'); if (m) m.remove(); }

  function openCashCodingMenu(btn) {
    closeCashCodingMenu();
    const lineId = Number(btn.getAttribute('data-line')), idx = Number(btn.getAttribute('data-idx'));
    const splits = cashCodingSplits.get(lineId) || [];
    const items = [];
    if (cashCodingTransfers.has(lineId)) items.push(['code', 'Code as income or expense instead']);
    else {
      items.push(['split', 'Split']);
      if (idx > 0) items.push(['removesplit', 'Remove this split']);
      if (idx === 0) { items.push(['createrule', 'Create bank rule from this line']); items.push(['transfer', 'Code as a transfer']); items.push(['copyabove', 'Copy coding from the line above']); items.push(['clear', 'Clear coding']); }
    }
    const menu = document.createElement('div');
    menu.id = 'cc-menu';
    const r = btn.getBoundingClientRect();
    menu.style.cssText = 'position:fixed;z-index:1000;top:' + (r.bottom + 2) + 'px;left:' + Math.max(8, r.right - 230) + 'px;width:230px;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-lg);padding:4px 0;';
    menu.innerHTML = items.map(([k, t]) => '<button type="button" class="cc-menu-item" data-act="' + k + '" data-line="' + lineId + '" data-idx="' + idx + '" style="display:block;width:100%;text-align:left;background:none;border:none;padding:6px 12px;font-size:0.8125rem;cursor:pointer;">' + esc(t) + '</button>').join('');
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeCashCodingMenu, { once: true }), 0);
  }

  function cashCodingMenuAction(act, lineId, idx) {
    const line = cashCodingLines.find((l) => l.id === lineId);
    const splits = cashCodingSplits.get(lineId) || [blankSplit()];
    if (act === 'split') {
      if (splits.length === 1) splits[0].amountCents = Math.abs(lineSignedCents(line));
      splits.push(blankSplit());
      cashCodingSplits.set(lineId, splits);
    } else if (act === 'removesplit') {
      splits.splice(idx, 1);
      if (splits.length === 1) splits[0].amountCents = null;
    } else if (act === 'transfer') {
      cashCodingTransfers.set(lineId, '');
      cashCodingEdit = { lineId, idx: 0, field: 'transfer' };
    } else if (act === 'code') {
      cashCodingTransfers.delete(lineId);
    } else if (act === 'clear') {
      cashCodingSplits.set(lineId, [blankSplit()]);
      cashCodingTransfers.delete(lineId);
      cashCodingRuleApplied.delete(lineId);
      cashCodingChecked.delete(lineId);
    } else if (act === 'createrule') {
      const sp = splits[0] || blankSplit();
      const rulesTab = document.querySelector('#organizational-banking-view-tabs [data-view="rules"]');
      if (rulesTab) rulesTab.click();
      openRuleForm({
        name: line.payee_raw ? 'Rule: ' + line.payee_raw : '',
        payee_contains: line.payee_raw || '', description_contains: line.payee_raw ? '' : (line.description_raw || ''),
        direction: line.credit_debit_indicator,
        action_account_id: sp.accountId || '', action_program_id: sp.programId || '', action_grant_id: sp.grantId || '', action_donor_restriction_class: sp.restrictionClass || '',
      });
      return;
    } else if (act === 'copyabove') {
      const order = sortedCashCodingLines(cashCodingLines.filter((l) => cashCodingShowMatches || !(cashCodingMatchRows.get(l.id) || []).length));
      const at = order.findIndex((l) => l.id === lineId);
      const above = at > 0 ? (cashCodingSplits.get(order[at - 1].id) || [])[0] : null;
      if (above) { splits[0] = { ...splits[0], accountId: above.accountId, programId: above.programId, grantId: above.grantId, restrictionClass: above.restrictionClass }; cashCodingChecked.add(lineId); }
    }
    renderCashCodingGrid();
  }

  if (cashCodingTbodyEl) {
    let cashCodingShiftDown = false;
    let cashCodingLastTicked = null;
    const cashCodingDisplayedIds = () => sortedCashCodingLines(cashCodingLines.filter((l) => cashCodingShowMatches || !(cashCodingMatchRows.get(l.id) || []).length)).map((l) => l.id);
    cashCodingTbodyEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'd') {
        const holder = e.target.closest('[data-line]');
        if (!holder) return;
        e.preventDefault();
        cashCodingMenuAction('copyabove', Number(holder.getAttribute('data-line')), 0);
      }
    });
    cashCodingTbodyEl.addEventListener('click', (e) => {
      if (e.target.classList && e.target.classList.contains('cc-check')) cashCodingShiftDown = e.shiftKey;
      if (e.target.closest('.cc-match')) {
        const tab = document.querySelector('#organizational-banking-view-tabs [data-view="reconcile"]');
        if (tab) tab.click();
        return;
      }
      const menuBtn = e.target.closest('.cc-menu');
      if (menuBtn) { e.stopPropagation(); openCashCodingMenu(menuBtn); return; }
      const cell = e.target.closest('td.cc-cell[data-field]');
      if (cell && !e.target.closest('input')) {
        cashCodingEdit = { lineId: Number(cell.getAttribute('data-line')), idx: Number(cell.getAttribute('data-idx')), field: cell.getAttribute('data-field') };
        renderCashCodingGrid();
      }
    });
    cashCodingTbodyEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t.classList.contains('cc-check')) {
        const id = Number(t.getAttribute('data-line'));
        if (t.checked) cashCodingChecked.add(id); else cashCodingChecked.delete(id);
        if (t.checked && cashCodingShiftDown && cashCodingLastTicked != null) {
          const order = cashCodingDisplayedIds();
          const a = order.indexOf(cashCodingLastTicked), b = order.indexOf(id);
          if (a >= 0 && b >= 0) { order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => cashCodingChecked.add(x)); renderCashCodingGrid(); }
        }
        if (t.checked) cashCodingLastTicked = id;
        cashCodingShiftDown = false;
        const all = document.getElementById('organizational-cashcoding-select-all');
        if (all && !t.checked) all.checked = false;
        return;
      }
      if (t.classList.contains('cc-amount')) {
        const id = Number(t.getAttribute('data-line')), idx = Number(t.getAttribute('data-idx'));
        const sp = (cashCodingSplits.get(id) || [])[idx];
        if (sp) sp.amountCents = inputToCents(t.value);
        cashCodingChecked.add(id);
        return;
      }
    });
    document.addEventListener('click', (e) => {
      const it = e.target.closest('.cc-menu-item');
      if (it) cashCodingMenuAction(it.getAttribute('data-act'), Number(it.getAttribute('data-line')), Number(it.getAttribute('data-idx')));
    });
  }

  const selectAllCb = document.getElementById('organizational-cashcoding-select-all');
  if (selectAllCb) selectAllCb.addEventListener('change', () => {
    cashCodingLines.filter((l) => cashCodingShowMatches || !(cashCodingMatchRows.get(l.id) || []).length).forEach((l) => {
      if (selectAllCb.checked) cashCodingChecked.add(l.id); else cashCodingChecked.delete(l.id);
    });
    renderCashCodingGrid();
  });
  const showMatchesCb = document.getElementById('organizational-cashcoding-show-matches');
  if (showMatchesCb) showMatchesCb.addEventListener('change', () => { cashCodingShowMatches = showMatchesCb.checked; renderCashCodingGrid(); });
  const uncheckBtn = document.getElementById('organizational-cashcoding-uncheck');
  if (uncheckBtn) uncheckBtn.addEventListener('click', () => { cashCodingChecked.clear(); renderCashCodingGrid(); });
  const discardBtn = document.getElementById('organizational-cashcoding-discard');
  if (discardBtn) discardBtn.addEventListener('click', () => {
    cashCodingLines.forEach((l) => cashCodingSplits.set(l.id, [blankSplit()]));
    cashCodingTransfers.clear(); cashCodingRuleApplied.clear(); cashCodingChecked.clear(); cashCodingEdit = null;
    setCashCodingStatus('');
    renderCashCodingGrid();
  });

  function readSplitsFromRow(lineId) {
    const wrap = document.querySelector('.cashcoding-splits-wrap[data-line="' + lineId + '"]');
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('.cashcoding-split-row')).map((row) => {
      const amountInput = row.querySelector('.cashcoding-split-amount');
      return {
        account_id: row.querySelector('.cashcoding-account').value ? Number(row.querySelector('.cashcoding-account').value) : null,
        program_id: row.querySelector('.cashcoding-program').value ? Number(row.querySelector('.cashcoding-program').value) : null,
        grant_id: row.querySelector('.cashcoding-grant').value ? Number(row.querySelector('.cashcoding-grant').value) : null,
        donor_restriction_class: row.querySelector('.cashcoding-restriction').value || null,
        amount_cents: amountInput ? inputToCents(amountInput.value) : null,
      };
    });
  }

  const saveAllBtn = document.getElementById('organizational-cashcoding-save-all');
  if (saveAllBtn) saveAllBtn.addEventListener('click', async () => {
    const selected = cashCodingLines.filter((l) => cashCodingChecked.has(l.id));
    if (!selected.length) { showError('Tick at least one line to reconcile.'); return; }
    showError('');

    const codings = [];
    const incomplete = [];
    for (const l of selected) {
      if (cashCodingTransfers.has(l.id)) {
        const dest = cashCodingTransfers.get(l.id);
        if (!dest) { incomplete.push(l); continue; }
        codings.push({ line_id: l.id, is_transfer: true, destination_account_id: Number(dest) });
        continue;
      }
      const splits = (cashCodingSplits.get(l.id) || []).map((sp) => ({
        account_id: sp.accountId ? Number(sp.accountId) : null,
        program_id: sp.programId ? Number(sp.programId) : null,
        grant_id: sp.grantId ? Number(sp.grantId) : null,
        donor_restriction_class: sp.restrictionClass || null,
        amount_cents: sp.amountCents,
      }));
      if (splits.some((sp) => !sp.account_id || !sp.program_id)) { incomplete.push(l); continue; }
      const ruleApplied = cashCodingRuleApplied.get(l.id);
      const stillRuleSourced = ruleApplied && splits.length === 1 && Number(splits[0].account_id) === Number(ruleApplied.account_id);
      codings.push({
        line_id: l.id, splits,
        coding_source: stillRuleSourced ? 'rule' : 'manual',
        applied_rule_id: stillRuleSourced ? ruleApplied.rule_id : null,
      });
    }
    if (incomplete.length) {
      showError(incomplete.length + ' ticked line' + (incomplete.length === 1 ? ' needs' : 's need') + ' an account and a program (or a transfer destination) before it can be reconciled: '
        + incomplete.slice(0, 3).map((l) => (l.payee_raw || l.description_raw || 'line ' + l.id)).join(', ') + (incomplete.length > 3 ? '…' : '') + '. Nothing was saved.');
      return;
    }

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/bulk-code', {
      method: 'POST', body: JSON.stringify({ codings }),
    });
    if (!out) return;
    const failed = (out.data.results || []).filter((r) => !r.ok);
    if (failed.length) {
      showError(failed.length + ' of ' + out.data.total + ' line(s) could not be reconciled: ' + failed.map((f) => 'line ' + f.line_id + ': ' + f.error).join('; '));
    }
    await loadCashCodingGrid();
    if (!failed.length) setCashCodingStatus(codings.length + ' reconciled.');
    await loadLines();
  });

  const applyRulesBtn = document.getElementById('organizational-cashcoding-apply-rules');

  async function applyRulesToTicked(ruleId) {
    const selected = cashCodingLines.filter((l) => cashCodingChecked.has(l.id)).map((l) => l.id);
    if (!selected.length) { showError('Tick the lines to apply a rule to first.'); return; }
    showError('');
    const eligible = selected.filter((id) => !cashCodingTransfers.has(id) && !(cashCodingMatchRows.get(id) || []).length);
    if (!eligible.length) { showError('None of the ticked lines can take a rule (transfers and lines with a suggested match are skipped).'); return; }

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/match-rules', {
      method: 'POST', body: JSON.stringify(ruleId ? { line_ids: eligible, rule_id: ruleId } : { line_ids: eligible }),
    });
    if (!out || !out.res.ok) { showError('Could not check rules.'); return; }

    let matchedCount = 0;
    for (const lineId of eligible) {
      const m = out.data.matches[lineId];
      if (!m) continue;
      matchedCount += 1;
      cashCodingSplits.set(lineId, [{
        accountId: m.account_id, programId: m.program_id, grantId: m.grant_id || '',
        restrictionClass: m.donor_restriction_class || '', amountCents: null,
      }]);
      cashCodingRuleApplied.set(lineId, { rule_id: m.rule_id, rule_name: m.rule_name, account_id: m.account_id });
    }
    renderCashCodingGrid();
    setCashCodingStatus(matchedCount
      ? matchedCount + ' of ' + eligible.length + (ruleId ? ' matched that rule.' : ' matched a rule.')
      : (ruleId ? 'None of the ticked lines match that rule.' : 'No rule matched.'));
  }

  function closeRuleMenu() { const el = document.getElementById('cc-rule-menu'); if (el) el.remove(); }

  async function openRuleMenu(btn) {
    closeRuleMenu();
    if (!bankRulesCache.length) await loadBankRules();
    const active = bankRulesCache.filter((r) => r.is_active);
    const group = (title, list) => '<div style="padding:6px 12px 2px;font-size:0.75rem;font-weight:600;color:var(--text-secondary);">' + title + '</div>'
      + (list.length ? list.map((r) => '<button type="button" class="cc-rule-item" data-rule="' + r.id + '" style="display:block;width:100%;text-align:left;background:none;border:none;padding:6px 12px;font-size:0.8125rem;cursor:pointer;">' + esc(r.name) + '</button>').join('')
        : '<div style="padding:4px 12px 6px;font-size:0.8125rem;color:var(--text-secondary);">None</div>');
    const menu = document.createElement('div');
    menu.id = 'cc-rule-menu';
    const r = btn.getBoundingClientRect();
    menu.style.cssText = 'position:fixed;z-index:1000;top:' + (r.bottom + 2) + 'px;left:' + r.left + 'px;min-width:260px;max-height:340px;overflow-y:auto;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-lg);padding:4px 0;';
    menu.innerHTML = '<button type="button" class="cc-rule-item" data-rule="" style="display:block;width:100%;text-align:left;background:none;border:none;padding:6px 12px;font-size:0.8125rem;cursor:pointer;font-weight:600;">All rules, in priority order</button>'
      + group('Money out rules', active.filter((x) => x.direction !== 'credit'))
      + group('Money in rules', active.filter((x) => x.direction !== 'debit'));
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
      const it = e.target.closest('.cc-rule-item');
      if (!it) return;
      closeRuleMenu();
      applyRulesToTicked(it.getAttribute('data-rule') ? Number(it.getAttribute('data-rule')) : null);
    });
    setTimeout(() => document.addEventListener('click', closeRuleMenu, { once: true }), 0);
  }

  if (applyRulesBtn) applyRulesBtn.addEventListener('click', (e) => { e.stopPropagation(); openRuleMenu(applyRulesBtn); });

  const shortcutsBtn = document.getElementById('organizational-cashcoding-shortcuts');
  const shortcutsHint = document.getElementById('organizational-cashcoding-shortcuts-hint');
  if (shortcutsBtn && shortcutsHint) shortcutsBtn.addEventListener('click', () => { shortcutsHint.hidden = !shortcutsHint.hidden; });

  const reconcileMultiSplit = new Set();
  const reconcileSplits = new Map();

  function syncSplitsFromDom(lineId) {
    const rows = readSplitsFromRow(lineId);
    if (!rows.length) return;
    reconcileSplits.set(lineId, rows.map((r) => ({
      accountId: r.account_id || '', programId: r.program_id || '', grantId: r.grant_id || '',
      restrictionClass: r.donor_restriction_class || '', amountCents: Number.isFinite(r.amount_cents) && r.amount_cents > 0 ? r.amount_cents : null,
    })));
  }

  function updateSplitTotal(lineId, totalCents) {
    const rows = readSplitsFromRow(lineId);
    const sum = rows.reduce((t, r) => t + (Number.isFinite(r.amount_cents) ? r.amount_cents : 0), 0);
    const left = totalCents - sum;
    const complete = rows.length > 0 && rows.every((r) => r.account_id && r.program_id && Number.isFinite(r.amount_cents) && r.amount_cents > 0);
    const label = document.getElementById('reconcile-split-total-' + lineId);
    if (label) {
      label.textContent = 'Entered ' + fmtMoney(sum) + ' of ' + fmtMoney(totalCents)
        + (left === 0 ? ' \u2013 the lines add up' : left > 0 ? ' \u2013 ' + fmtMoney(left) + ' left' : ' \u2013 ' + fmtMoney(-left) + ' over');
      label.style.color = left === 0 ? 'var(--green)' : 'var(--text-secondary)';
    }
    const btn = document.getElementById('banking-create-save-' + lineId);
    if (btn) btn.disabled = !(left === 0 && complete);
  }

  function renderCreateTab(line) {
    const el = document.getElementById('banking-row-content-' + line.id);
    if (!el) return;

    if (reconcileMultiSplit.has(line.id)) {
      if (!reconcileSplits.has(line.id)) {
        reconcileSplits.set(line.id, [
          { accountId: '', programId: '', grantId: '', restrictionClass: 'unrestricted', amountCents: null },
          { accountId: '', programId: '', grantId: '', restrictionClass: 'unrestricted', amountCents: null },
        ]);
      }
      const splits = reconcileSplits.get(line.id);
      const totalCents = Math.abs(lineSignedCents(line));
      el.innerHTML = '<div class="cashcoding-splits-wrap" data-line="' + line.id + '">' + splits.map((s, i) => splitRowHtml(line.id, i, s, true)).join('') + '</div>'
        + '<button type="button" class="organizational-sg-add-btn reconcile-add-split" data-line="' + line.id + '" style="font-size:0.75rem;margin-top:6px;">+ Add another line</button>'
        + '<p id="reconcile-split-total-' + line.id + '" style="font-size:0.8125rem;margin-top:8px;"></p>'
        + '<div class="organizational-panel-actions">'
        + '<button type="button" id="banking-create-save-' + line.id + '" class="organizational-btn organizational-btn-primary" disabled>Create &amp; confirm</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline reconcile-remove-details" data-line="' + line.id + '" style="margin-left:8px;">Single line instead</button>'
        + '</div>';

      const splitWrap = el.querySelector('.cashcoding-splits-wrap');
      if (window.OrganizationalSelectSearch) window.OrganizationalSelectSearch.enhanceIn(splitWrap, 'select.cashcoding-account, select.cashcoding-program, select.cashcoding-grant');
      const refreshTotal = () => updateSplitTotal(line.id, totalCents);
      splitWrap.addEventListener('input', refreshTotal);
      splitWrap.addEventListener('change', refreshTotal);
      refreshTotal();

      document.getElementById('banking-create-save-' + line.id).addEventListener('click', async () => {
        showRowError(line.id, '');
        const rows = readSplitsFromRow(line.id);
        if (rows.some((r) => !r.account_id || !r.program_id || !r.amount_cents || r.amount_cents <= 0)) {
          showRowError(line.id, 'Every line needs an account, program, and a positive amount.');
          return;
        }
        const sum = rows.reduce((s, r) => s + r.amount_cents, 0);
        if (sum !== totalCents) {
          showRowError(line.id, 'Lines add up to ' + fmtMoney(sum) + ', not ' + fmtMoney(totalCents) + '.');
          return;
        }
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/create', {
          method: 'POST',
          body: JSON.stringify({ splits: rows }),
        });
        if (out && out.res.ok) { reconcileMultiSplit.delete(line.id); reconcileSplits.delete(line.id); await loadLines(); }
        else showRowError(line.id, (out && out.data && (out.data.message || out.data.error)) || 'Could not code this line.');
      });
      return;
    }

    el.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Account *<select id="banking-create-account-' + line.id + '" class="organizational-select">' + accountOptions(codingAccountsCache) + '</select></label>'
      + '<p id="banking-create-suggestion-' + line.id + '" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Program *<select id="banking-create-program-' + line.id + '" class="organizational-select">' + programOptions() + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Grant<select id="banking-create-grant-' + line.id + '" class="organizational-select">' + grantOptions() + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Restriction<select id="banking-create-restriction-' + line.id + '" class="organizational-select">'
      + '<option value="">— None —</option><option value="unrestricted" selected>Unrestricted</option>'
      + '<option value="temporarily_restricted">Temporarily restricted</option><option value="permanently_restricted">Permanently restricted</option>'
      + '</select></label>'
      + '</div>'
      + '</div>'
      + '<button type="button" class="reconcile-add-details" data-line="' + line.id + '" style="background:none;border:none;color:var(--organizational-accent);font-size:0.75rem;cursor:pointer;padding:0;margin-bottom:8px;">Add details — split across multiple accounts</button>'
      + '<div class="organizational-panel-actions"><button type="button" id="banking-create-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Create &amp; confirm</button></div>';

    if (window.OrganizationalSelectSearch) {
      window.OrganizationalSelectSearch.enhance(document.getElementById('banking-create-account-' + line.id));
      window.OrganizationalSelectSearch.enhance(document.getElementById('banking-create-program-' + line.id));
      window.OrganizationalSelectSearch.enhance(document.getElementById('banking-create-grant-' + line.id));
    }
    document.getElementById('banking-create-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const accountId = document.getElementById('banking-create-account-' + line.id).value;
      const programId = document.getElementById('banking-create-program-' + line.id).value;
      const grantId = document.getElementById('banking-create-grant-' + line.id).value;
      const restriction = document.getElementById('banking-create-restriction-' + line.id).value;
      if (!accountId || !programId) { showRowError(line.id, 'Account and program are required.'); return; }
      const ruleMatch = rowRuleMatch.get(line.id);
      const stillRuleSourced = ruleMatch && Number(accountId) === Number(ruleMatch.account_id);
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/create', {
        method: 'POST',
        body: JSON.stringify({
          account_id: Number(accountId), program_id: Number(programId),
          grant_id: grantId ? Number(grantId) : null,
          donor_restriction_class: restriction || null,
          coding_source: stillRuleSourced ? 'rule' : 'manual',
          applied_rule_id: stillRuleSourced ? ruleMatch.rule_id : null,
        }),
      });
      if (out && out.res.ok) await loadLines();
      else showRowError(line.id, (out && out.data && (out.data.message || out.data.error)) || 'Could not code this line.');
    });

    applyRuleSuggestion(line).then(() => applyCodingSuggestion(line));
  }

  async function applyRuleSuggestion(line) {
    let cached = rowRuleMatch.get(line.id);
    if (cached === undefined) {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/match-rules', {
        method: 'POST', body: JSON.stringify({ line_ids: [line.id] }),
      });
      cached = (out && out.res.ok && out.data.matches) ? (out.data.matches[line.id] || null) : null;
      rowRuleMatch.set(line.id, cached);
    }
    if (!cached) return;
    const accountEl = document.getElementById('banking-create-account-' + line.id);
    if (!accountEl || accountEl.value) return;
    accountEl.value = String(cached.account_id);
    const programEl = document.getElementById('banking-create-program-' + line.id);
    if (programEl && !programEl.value) programEl.value = String(cached.program_id);
    if (cached.grant_id) {
      const grantEl = document.getElementById('banking-create-grant-' + line.id);
      if (grantEl && !grantEl.value) grantEl.value = String(cached.grant_id);
    }
    if (cached.donor_restriction_class) {
      const restrictionEl = document.getElementById('banking-create-restriction-' + line.id);
      if (restrictionEl && (!restrictionEl.value || restrictionEl.value === 'unrestricted')) restrictionEl.value = cached.donor_restriction_class;
    }
    const hint = document.getElementById('banking-create-suggestion-' + line.id);
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Rule: ' + cached.rule_name + ' — change it if this one is different.';
    }
  }

  async function applyCodingSuggestion(line) {
    if (!line.payee_raw) return;
    let cached = rowCodingSuggestion.get(line.id);
    if (cached === undefined) {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/coding-suggestion');
      cached = (out && out.res.ok) ? out.data.suggestion : null;
      rowCodingSuggestion.set(line.id, cached);
    }
    if (!cached) return;
    const accountEl = document.getElementById('banking-create-account-' + line.id);
    if (!accountEl || accountEl.value) return;
    accountEl.value = String(cached.account_id);
    const programEl = document.getElementById('banking-create-program-' + line.id);
    if (programEl && !programEl.value) programEl.value = String(cached.program_id);
    if (cached.grant_id) {
      const grantEl = document.getElementById('banking-create-grant-' + line.id);
      if (grantEl && !grantEl.value) grantEl.value = String(cached.grant_id);
    }
    if (cached.donor_restriction_class) {
      const restrictionEl = document.getElementById('banking-create-restriction-' + line.id);
      if (restrictionEl && (!restrictionEl.value || restrictionEl.value === 'unrestricted')) restrictionEl.value = cached.donor_restriction_class;
    }
    const hint = document.getElementById('banking-create-suggestion-' + line.id);
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Suggested from the last time you coded ' + line.payee_raw + ' — change it if this one is different.';
    }
  }

  function renderTransferTab(line) {
    const el = document.getElementById('banking-row-content-' + line.id);
    if (!el) return;
    const otherAccounts = cashAccountsCache.filter((a) => a.id !== line.bank_account_id);
    const accountRadios = otherAccounts.length
      ? otherAccounts.map((a, i) => (
          '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-weight:400;">'
          + '<input type="radio" name="banking-transfer-account-' + line.id + '" value="' + a.id + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(a.name)
          + '</label>'
        )).join('')
      : '<p style="font-size:0.8125rem;color:var(--text-secondary);">No other bank accounts to transfer to yet -- this will post to an internal clearing account instead.</p>';

    el.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<div style="flex:1;"><div class="organizational-label" style="margin-bottom:4px;">Select a bank account</div>' + accountRadios + '</div>'
      + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="banking-transfer-reference-' + line.id + '" class="organizational-input"></label>'
      + '</div>'
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="banking-transfer-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Code as transfer</button></div>';

    document.getElementById('banking-transfer-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const checked = el.querySelector('input[name="banking-transfer-account-' + line.id + '"]:checked');
      const reference = document.getElementById('banking-transfer-reference-' + line.id).value.trim();
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/transfer', {
        method: 'POST',
        body: JSON.stringify({ destination_account_id: checked ? Number(checked.value) : null, reference: reference || null }),
      });
      if (out && out.res.ok) await loadLines();
      else showRowError(line.id, (out && out.data && (out.data.message || out.data.error)) || 'Could not code this line as a transfer.');
    });
  }

  function renderDiscussTab(line) {
    const el = document.getElementById('banking-row-content-' + line.id);
    if (!el) return;
    el.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Note<textarea id="banking-discuss-note-' + line.id + '" rows="3" placeholder="Not sure where to code this…">' + esc(line.discuss_note) + '</textarea></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="banking-discuss-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Save note</button></div>';

    document.getElementById('banking-discuss-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const note = document.getElementById('banking-discuss-note-' + line.id).value.trim();
      if (!note) { showRowError(line.id, 'Note is required.'); return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/discuss', {
        method: 'POST', body: JSON.stringify({ note }),
      });
      if (out && out.res.ok) await loadLines();
      else showRowError(line.id, (out && out.data && out.data.error) || 'Could not save note.');
    });
  }

  function openImportPanel() {
    showImportError('');
    importBody.innerHTML = '<p class="organizational-empty">Choose the statement from your bank, as a PDF or a CSV, to preview.</p>'
      + '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">A PDF is the easiest: use the statement your bank sends or lets you download (a scan of paper will not work). A CSV works with the columns your bank gives (one amount column, or separate debit and credit columns). The preview shows what was read and whether it adds up to the statement balances, before anything is imported.</p>';
    importPanel.classList.add('organizational-panel-is-open');
    importOverlay.classList.add('organizational-panel-is-open');
  }
  function closeImportPanel() {
    importPanel.classList.remove('organizational-panel-is-open');
    importOverlay.classList.remove('organizational-panel-is-open');
    importFile.value = '';
  }
  if (importBtn) importBtn.addEventListener('click', () => importFile.click());
  if (importClose) importClose.addEventListener('click', closeImportPanel);
  if (importOverlay) importOverlay.addEventListener('click', closeImportPanel);

  if (importFile) importFile.addEventListener('change', async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    openImportPanel();
    await runPreview(file);
  });

  let pdfPreviewUrl = null;

  async function runPreview(file) {
    showImportError('');
    const bankAccountId = acctSelect && acctSelect.value;
    if (!bankAccountId) { showImportError('Choose a bank account first.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('bank_account_id', bankAccountId);
    fd.append('mode', 'preview');
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/import', {
      method: 'POST', credentials: 'include', body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showImportError(data.error || 'Could not preview import.'); return; }

    const fmt = (c) => (c == null ? '' : fmtMoney(c));
    const bal = (data.opening_cents != null || data.closing_cents != null)
      ? '<p style="font-size:0.8125rem;">Statement balances: opening ' + esc(fmt(data.opening_cents) || '—') + ', closing ' + esc(fmt(data.closing_cents) || '—')
        + (data.balance_check ? (data.balance_check.ok ? ' <span style="color:var(--green);">— the lines add up to the statement.</span>' : ' <span style="color:var(--red);">— the lines do not add up to the statement.</span>') : '') + '</p>'
      : '';
    const warn = (data.warnings || []).map((w) => '<p style="font-size:0.8125rem;color:var(--text-secondary);">' + esc(w) + '</p>').join('');
    if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); pdfPreviewUrl = null; }
    if (data.kind === 'pdf') pdfPreviewUrl = URL.createObjectURL(file);
    const openPdf = pdfPreviewUrl ? '<p style="font-size:0.8125rem;"><a href="' + pdfPreviewUrl + '" target="_blank" rel="noopener">Open the PDF</a> to check it against the list below.</p>' : '';
    importBody.innerHTML = openPdf + '<p>' + (data.kind === 'pdf' ? 'Read from the PDF: ' : '') + data.total + ' transactions found — ' + data.new + ' new, ' + data.duplicates + ' already on this account.</p>' + bal + warn
      + (data.errors && data.errors.length ? '<p style="color:var(--organizational-status-danger,#dc2626);">' + data.errors.length + ' row(s) had errors and will be skipped.</p>' : '')
      + '<label style="display:flex;align-items:center;gap:6px;font-size:0.8125rem;"><input type="checkbox" id="banking-import-dupes"> Import duplicates anyway</label>'
      + '<div class="organizational-panel-actions"><button type="button" id="banking-import-confirm" class="organizational-btn organizational-btn-primary">Import</button></div>';

    document.getElementById('banking-import-confirm').addEventListener('click', async () => {
      const includeDupes = document.getElementById('banking-import-dupes').checked;
      const fd2 = new FormData();
      fd2.append('file', file);
      fd2.append('bank_account_id', bankAccountId);
      fd2.append('mode', 'commit');
      fd2.append('include_duplicates', includeDupes ? 'true' : 'false');
      const res2 = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/import', {
        method: 'POST', credentials: 'include', body: fd2,
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) { showImportError(data2.error || 'Could not import.'); return; }
      closeImportPanel();
      await loadLines();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (importPanel && importPanel.classList.contains('organizational-panel-is-open')) closeImportPanel();
    if (reportPanel && reportPanel.classList.contains('organizational-panel-is-open')) closeReportPanel();
  });

  const reportBtn = document.getElementById('organizational-banking-report-btn');
  const reportPanel = document.getElementById('organizational-banking-report-panel');
  const reportOverlay = document.getElementById('organizational-banking-report-panel-overlay');
  const reportBody = document.getElementById('organizational-banking-report-panel-body');
  const reportClose = document.getElementById('organizational-banking-report-panel-close');
  const reportErrEl = document.getElementById('organizational-banking-report-panel-error');

  function showReportError(msg) { if (reportErrEl) { reportErrEl.textContent = msg || ''; reportErrEl.hidden = !msg; } }

  function renderReportForm() {
    reportBody.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Statement ending date *<input type="date" id="banking-report-date" class="organizational-input"></label>'
      + '<label class="organizational-label" style="flex:1">Ending balance ($) *<input type="number" id="banking-report-balance" class="organizational-input" step="0.01"></label>'
      + '</div></div>'
      + '<div class="organizational-panel-actions"><button type="button" id="banking-report-run" class="organizational-btn organizational-btn-primary">Run</button></div>'
      + '<div id="banking-report-result" style="margin-top:16px;"></div>';

    document.getElementById('banking-report-run').addEventListener('click', async () => {
      showReportError('');
      const date = document.getElementById('banking-report-date').value;
      const balanceCents = inputToCents(document.getElementById('banking-report-balance').value);
      const bankAccountId = acctSelect && acctSelect.value;
      if (!date) { showReportError('Statement ending date is required.'); return; }
      if (!bankAccountId) { showReportError('Choose a bank account first.'); return; }

      const params = new URLSearchParams({ bank_account_id: bankAccountId, statement_date: date, ending_balance_cents: String(balanceCents) });
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/reconciliation-report?' + params.toString());
      if (!out || !out.res.ok) { showReportError((out && out.data && out.data.error) || 'Could not run report.'); return; }
      const d = out.data;
      const statusColor = d.matches ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
      document.getElementById('banking-report-result').innerHTML =
        '<dl>'
        + '<dt style="font-weight:700;">Ending bank statement balance</dt><dd>' + fmtMoney(d.ending_bank_statement_balance_cents) + '</dd>'
        + '<dt style="font-weight:700;margin-top:8px;">+ Deposits in transit</dt><dd>' + fmtMoney(d.deposits_in_transit_cents) + '</dd>'
        + '<dt style="font-weight:700;margin-top:8px;">− Outstanding unconfirmed lines</dt><dd>' + fmtMoney(d.outstanding_unconfirmed_cents) + '</dd>'
        + '<dt style="font-weight:700;margin-top:8px;">= Computed GL cash balance</dt><dd>' + fmtMoney(d.computed_gl_cash_balance_cents) + '</dd>'
        + '<dt style="font-weight:700;margin-top:8px;">Actual GL cash balance</dt><dd>' + fmtMoney(d.actual_gl_cash_balance_cents) + '</dd>'
        + '</dl>'
        + '<p style="margin-top:12px;font-weight:700;color:' + statusColor + ';">'
        + (d.matches ? '✓ Ties out — difference $0.00' : '✗ Does not tie — difference ' + fmtMoney(d.difference_cents))
        + '</p>';
    });
  }

  function openReportPanel() {
    showReportError('');
    renderReportForm();
    reportPanel.classList.add('organizational-panel-is-open');
    reportOverlay.classList.add('organizational-panel-is-open');
  }
  function closeReportPanel() {
    reportPanel.classList.remove('organizational-panel-is-open');
    reportOverlay.classList.remove('organizational-panel-is-open');
  }
  if (reportBtn) reportBtn.addEventListener('click', openReportPanel);
  if (reportClose) reportClose.addEventListener('click', closeReportPanel);
  if (reportOverlay) reportOverlay.addEventListener('click', closeReportPanel);

  let acctDropdownOpen = false;

  function acctSummaryLine(a) {
    const plaid = plaidStatusByAccount[a.id];
    return plaid
      ? '<span style="color:var(--organizational-accent);">● Connected</span>' + (plaid.last_synced_at ? ' · synced ' + timeAgo(plaid.last_synced_at) : '')
      : '';
  }

  function renderAccountDropdown(counts) {
    if (!acctDropdown) return;
    if (!cashAccountsCache.length) {
      acctDropdown.innerHTML = '<p class="organizational-empty">No cash accounts configured yet.</p>';
      return;
    }
    const selectedId = acctSelect && acctSelect.value;
    const selected = cashAccountsCache.find((a) => String(a.id) === String(selectedId)) || cashAccountsCache[0];
    const selectedCount = counts[selected.id] || 0;

    acctDropdown.innerHTML = '<button type="button" id="organizational-banking-account-toggle" class="organizational-card" style="text-align:left;padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;margin:0;">'
      + '<span><div style="font-weight:600;font-size:0.875rem;">' + esc(selected.name) + '</div><div style="font-size:0.75rem;">' + acctSummaryLine(selected) + (selectedCount > 0 ? ' · <span style="color:var(--organizational-accent);">' + selectedCount + ' to reconcile</span>' : '') + '</div></span>'
      + '<span aria-hidden="true">' + (acctDropdownOpen ? '▲' : '▼') + '</span>'
      + '</button>'
      + '<div id="organizational-banking-account-list" class="organizational-card" style="position:absolute;top:100%;left:0;z-index:20;min-width:260px;margin-top:4px;padding:6px;' + (acctDropdownOpen ? '' : 'display:none;') + '">'
      + cashAccountsCache.map((a) => {
          const count = counts[a.id] || 0;
          const isActive = String(a.id) === String(selectedId);
          return '<button type="button" class="organizational-banking-acct-option" data-account-id="' + a.id + '" '
            + 'style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:6px;cursor:pointer;background:' + (isActive ? 'color-mix(in srgb, var(--organizational-accent) 10%, transparent)' : 'none') + ';">'
            + '<div style="font-weight:600;font-size:0.8125rem;">' + esc(a.name) + '</div>'
            + '<div style="font-size:0.75rem;">' + acctSummaryLine(a) + (count > 0 ? ' · <span style="color:var(--organizational-accent);">' + count + ' to reconcile</span>' : '') + '</div>'
            + '</button>';
        }).join('')
      + '</div>';

    const toggleBtn = document.getElementById('organizational-banking-account-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      acctDropdownOpen = !acctDropdownOpen;
      renderAccountDropdown(counts);
    });
    acctDropdown.querySelectorAll('.organizational-banking-acct-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        acctSelect.value = opt.getAttribute('data-account-id');
        acctSelect.dispatchEvent(new Event('change'));
        acctDropdownOpen = false;
        renderAccountDropdown(counts);
      });
    });
  }

  let acctDropdownOutsideClickBound = false;
  function bindAccountDropdownOutsideClick() {
    if (acctDropdownOutsideClickBound) return;
    acctDropdownOutsideClickBound = true;
    document.addEventListener('click', (e) => {
      if (!acctDropdownOpen || !acctDropdown || acctDropdown.contains(e.target)) return;
      acctDropdownOpen = false;
      renderAccountDropdown(lastAccountCounts);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && acctDropdownOpen) { acctDropdownOpen = false; renderAccountDropdown(lastAccountCounts); }
    });
  }

  let lastAccountCounts = {};
  async function loadAccountStrip() {
    const [statusOut, countsOut] = await Promise.all([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/plaid/status'),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/unconfirmed-counts'),
    ]);
    plaidStatusByAccount = {};
    ((statusOut && statusOut.data && statusOut.data.accounts) || []).forEach((a) => { plaidStatusByAccount[a.org_account_id] = a; });
    lastAccountCounts = (countsOut && countsOut.data && countsOut.data.counts) || {};
    renderAccountDropdown(lastAccountCounts);
    bindAccountDropdownOutsideClick();
  }
  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return mins + 'm ago';
    if (mins < 1440) return Math.round(mins / 60) + 'h ago';
    return Math.round(mins / 1440) + 'd ago';
  }

  async function connectBankViaPlaid() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/plaid/link-token', { method: 'POST' });
    if (!out || !out.res.ok) { showError((out && out.data && out.data.error) || 'Could not start bank connection.'); return; }
    if (!window.Plaid) { showError('Plaid could not load.'); return; }
    const handler = window.Plaid.create({
      token: out.data.link_token,
      onSuccess: async (publicToken) => {
        const exOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/plaid/exchange-public-token', {
          method: 'POST', body: JSON.stringify({ public_token: publicToken }),
        });
        if (!exOut || !exOut.res.ok) { showError((exOut && exOut.data && exOut.data.error) || 'Could not connect this bank.'); return; }
        openPlaidMapPanel(exOut.data);
      },
    });
    handler.open();
  }
  if (connectBtn) connectBtn.addEventListener('click', connectBankViaPlaid);

  const CREATE_NEW_VALUE = '__create_new__';

  function openPlaidMapPanel(data) {
    showPlaidMapError('');
    plaidMapBody.innerHTML = '<p style="font-size:0.8125rem;color:var(--text-secondary);">Connected to ' + esc(data.institution_name || 'your bank') + '. Map each account Plaid returned to one of this org\'s existing cash accounts, or create a new one, to start syncing it.</p>'
      + data.accounts.map((a, i) => (
        '<div data-plaid-row="' + i + '">'
        + '<div class="organizational-panel-field-row" style="align-items:center;">'
        + '<span style="flex:1;font-size:0.8125rem;">' + esc(a.name) + (a.mask ? ' ••' + esc(a.mask) : '') + ' (' + esc(a.subtype || a.type) + ')</span>'
        + '<select class="organizational-select plaid-map-select" data-idx="' + i + '" style="flex:1;">'
        + '<option value="">— Don\'t sync —</option>'
        + cashAccountsCache.map((oa) => '<option value="' + oa.id + '">' + esc(oa.code ? oa.code + ' — ' + oa.name : oa.name) + '</option>').join('')
        + '<option value="' + CREATE_NEW_VALUE + '">+ Create new account…</option>'
        + '</select></div>'
        + '<div class="plaid-map-new-fields" data-idx="' + i + '" hidden style="display:flex;gap:8px;margin:4px 0 8px;padding-left:0;">'
        + '<input type="text" class="organizational-input plaid-map-new-code" placeholder="Code" style="width:90px;">'
        + '<input type="text" class="organizational-input plaid-map-new-name" placeholder="Account name" value="' + esc(a.name) + '" style="flex:1;">'
        + '</div>'
        + '</div>'
      )).join('')
      + '<div class="organizational-panel-actions"><button type="button" id="plaid-map-save" class="organizational-btn organizational-btn-primary">Save mapping</button></div>';

    plaidMapBody.querySelectorAll('.plaid-map-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = sel.getAttribute('data-idx');
        const fields = plaidMapBody.querySelector('.plaid-map-new-fields[data-idx="' + idx + '"]');
        if (fields) fields.hidden = sel.value !== CREATE_NEW_VALUE;
      });
    });

    document.getElementById('plaid-map-save').addEventListener('click', async () => {
      showPlaidMapError('');
      const selects = Array.from(plaidMapBody.querySelectorAll('.plaid-map-select'));
      const toMap = selects.filter((s) => s.value).map((s) => ({ select: s, idx: Number(s.getAttribute('data-idx')), value: s.value, plaidAccount: data.accounts[Number(s.getAttribute('data-idx'))] }));
      if (!toMap.length) { showPlaidMapError('Map at least one account, or close this panel to skip.'); return; }
      for (const m of toMap) {
        let orgAccountId = Number(m.value);
        if (m.value === CREATE_NEW_VALUE) {
          const codeInput = plaidMapBody.querySelector('.plaid-map-new-code[data-idx="' + m.idx + '"]');
          const nameInput = plaidMapBody.querySelector('.plaid-map-new-name[data-idx="' + m.idx + '"]');
          const code = codeInput.value.trim();
          const name = nameInput.value.trim();
          if (!code || !name) { showPlaidMapError('New account for ' + m.plaidAccount.name + ' needs both a code and a name.'); return; }
          const createOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/accounts', {
            method: 'POST',
            body: JSON.stringify({ code, name, type: 'asset', is_cash_account: true }),
          });
          if (!createOut || !createOut.res.ok) { showPlaidMapError((createOut && createOut.data && createOut.data.error) || 'Could not create the account for ' + m.plaidAccount.name + '.'); return; }
          orgAccountId = createOut.data.account.id;
          cashAccountsCache.push(createOut.data.account);
        }
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/plaid/accounts/map', {
          method: 'POST',
          body: JSON.stringify({ plaid_item_id: data.plaid_item_id, plaid_account_id: m.plaidAccount.plaid_account_id, org_account_id: orgAccountId }),
        });
        if (!out || !out.res.ok) { showPlaidMapError((out && out.data && out.data.error) || 'Could not map ' + m.plaidAccount.name + '.'); return; }
      }
      closePlaidMapPanel();
      await loadAccountStrip();
      await loadLines();
    });

    plaidMapPanel.classList.add('organizational-panel-is-open');
    plaidMapOverlay.classList.add('organizational-panel-is-open');
  }
  function closePlaidMapPanel() {
    plaidMapPanel.classList.remove('organizational-panel-is-open');
    plaidMapOverlay.classList.remove('organizational-panel-is-open');
  }
  if (plaidMapClose) plaidMapClose.addEventListener('click', closePlaidMapPanel);
  if (plaidMapOverlay) plaidMapOverlay.addEventListener('click', closePlaidMapPanel);

  function withScore(c, row) {
    row.score = c.match_score; row.suggest = c.match_suggest;
    if (c.match_reasons && c.match_reasons.length) row.sub += ' \u00b7 ' + c.match_reasons.join(' \u00b7 ');
    return row;
  }

  function candidateRows(d) {
    const rows = [];
    (d.outstanding_transfers || []).forEach((t) => rows.push(withScore(t, { label: 'Internal transfer from ' + (t.source_account_name || 'another account'), sub: String(t.transaction_date).slice(0, 10) + ' · ' + fmtMoney(t.amount_cents) + ' · pairs with that transfer, posts nothing new', match_type: 'outstanding_transfer', target_id: t.id })));
    (d.existing_entries || []).forEach((e) => rows.push(withScore(e, { label: 'Entry already in the books: ' + (e.payee || e.memo || '#' + e.id), sub: String(e.transaction_date).slice(0, 10) + ' · ' + fmtMoney(e.amount_cents) + ' · links to that entry, posts nothing new', match_type: 'ledger_entry', target_id: e.id })));
    d.outstanding_bill_payments.forEach((p) => rows.push(withScore(p, { label: 'Already recorded: ' + (p.vendor_name || 'Vendor') + ' — Bill ' + (p.reference || '#' + p.bill_id), sub: p.payment_date + ' · ' + fmtMoney(p.amount_cents) + ' · links to the existing payment, posts nothing new', match_type: 'outstanding_bill_payment', target_id: p.id })));
    d.outstanding_invoice_payments.forEach((p) => rows.push(withScore(p, { label: 'Already recorded: ' + (p.customer_name || 'Customer') + ' — Invoice ' + (p.reference || '#' + p.invoice_id), sub: p.payment_date + ' · ' + fmtMoney(p.amount_cents) + ' · links to the existing payment, posts nothing new', match_type: 'outstanding_invoice_payment', target_id: p.id })));
    d.bills.forEach((b) => rows.push(withScore(b, { label: (b.vendor_name || 'Vendor') + ' — Bill ' + (b.reference || '#' + b.id), sub: b.bill_date + ' · ' + fmtMoney(b.remaining_cents) + ' remaining' + (b.name_match ? ' · name match' : ''), match_type: 'bill', target_id: b.id, remaining_cents: Number(b.remaining_cents), nameMatch: !!b.name_match, multiSelectable: true })));
    d.invoices.forEach((i) => rows.push(withScore(i, { label: (i.customer_name || 'Customer') + ' — Invoice ' + (i.reference || '#' + i.id), sub: i.invoice_date + ' · ' + fmtMoney(i.remaining_cents) + ' remaining' + (i.name_match ? ' · name match' : ''), match_type: 'invoice', target_id: i.id, remaining_cents: Number(i.remaining_cents), nameMatch: !!i.name_match, multiSelectable: true })));
    (d.grant_gifts || []).forEach((g) => rows.push(withScore(g, { label: 'Grant: ' + (g.grant_name || 'Untitled') + (g.funder ? ' — ' + g.funder : ''), sub: String(g.received_at).slice(0, 10) + ' · ' + fmtMoney(g.amount_cents) + ' · ' + (g.constituent_name || 'expected') + ' · posts to the grant\'s default revenue account', match_type: 'grant_gift', target_id: g.id })));
    (d.pledge_installments || []).forEach((p) => rows.push(withScore(p, { label: 'Pledge installment: ' + (p.donor_name || 'a donor'), sub: 'due ' + String(p.due_date).slice(0, 10) + ' · ' + fmtMoney(p.amount_cents) + ' · credits the pledge receivable, no new revenue', match_type: 'pledge_installment', target_id: p.id })));
    (d.membership_dues || []).forEach((m) => rows.push(withScore(m, { label: 'Dues: ' + m.member_name + (m.tier_name ? ' — ' + m.tier_name : ''), sub: String(m.payment_date).slice(0, 10) + ' · ' + fmtMoney(m.amount_cents) + ' · posts to the tier\'s default revenue account', match_type: 'membership_dues', target_id: m.id })));
    (d.sponsored_project_disbursements || []).forEach((p) => rows.push(withScore(p, { label: 'Disbursement: ' + p.project_name, sub: String(p.disbursement_date).slice(0, 10) + ' · ' + fmtMoney(p.amount_cents) + ' · posts to the project\'s default expense account', match_type: 'sponsored_project_disbursement', target_id: p.id })));
    rows.sort((a, b) => (b.score || 0) - (a.score || 0));
    return rows;
  }

  function isCloseCandidate(r, lineMagnitude) {
    if (r.suggest !== undefined) return !!r.suggest;
    if (!r.multiSelectable) return true;
    return r.nameMatch || Math.abs(r.remaining_cents - lineMagnitude) <= lineMagnitude * 0.02;
  }

  function candidateKey(r) { return r.match_type + ':' + r.target_id; }

  function candidateRowHtml(r, lineId, idx, highlighted, lineMagnitude, hideSelect) {
    const selMap = rowMultiSelected.get(lineId);
    const selected = selMap && selMap.has(candidateKey(r));
    const checkbox = (r.multiSelectable && !hideSelect)
      ? '<input type="checkbox" class="match-multi-checkbox" data-line="' + lineId + '" data-idx="' + idx + '"' + (selected ? ' checked' : '') + ' style="margin-right:10px;">'
      : '<span style="display:inline-block;width:24px;"></span>';
    const amountInput = (r.multiSelectable && selected && !hideSelect)
      ? '<input type="number" class="organizational-input match-multi-amount" data-line="' + lineId + '" data-idx="' + idx + '" min="0.01" max="' + (r.remaining_cents / 100) + '" step="0.01" value="' + (selMap.get(candidateKey(r)).amountCents / 100).toFixed(2) + '" style="width:90px;margin-right:8px;" title="Amount to apply (up to the remaining balance)">'
      : '';
    return '<div class="organizational-panel-field-row" style="align-items:center;padding:8px;border-bottom:1px solid var(--border);'
      + (highlighted ? 'background:color-mix(in srgb, var(--organizational-accent) 10%, transparent);border-radius:6px;' : '') + '">'
      + checkbox
      + '<span style="flex:1;">'
      + '<div style="font-size:0.8125rem;font-weight:600;">' + esc(r.label) + '</div>'
      + '<div style="font-size:0.75rem;color:var(--text-secondary);">' + esc(r.sub) + '</div>'
      + '</span>'
      + amountInput
      + '<button type="button" class="' + (highlighted ? 'organizational-btn organizational-btn-primary' : 'organizational-btn organizational-btn-outline') + ' match-confirm-btn" data-line="' + lineId + '" data-idx="' + idx + '" style="font-size:0.75rem;">' + (highlighted ? 'Confirm match' : 'Match') + '</button>'
      + '</div>';
  }

  function multiSelectFooterHtml(line, rows) {
    const selMap = rowMultiSelected.get(line.id);
    if (!selMap || selMap.size === 0) return '';
    const lineMagnitude = Math.abs(lineSignedCents(line));
    const sumCents = Array.from(selMap.values()).reduce((s, v) => s + v.amountCents, 0);
    const matches = sumCents === lineMagnitude;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;margin-top:6px;border-top:2px solid var(--border);">'
      + '<span style="font-size:0.8125rem;' + (matches ? 'color:var(--organizational-accent);font-weight:600;' : '') + '">'
      + selMap.size + ' selected — ' + fmtMoney(sumCents) + ' of ' + fmtMoney(lineMagnitude) + ' needed'
      + (matches ? '' : (sumCents > lineMagnitude ? ' (over by ' + fmtMoney(sumCents - lineMagnitude) + ')' : ' (' + fmtMoney(lineMagnitude - sumCents) + ' short)'))
      + '</span>'
      + '<button type="button" id="banking-multimatch-confirm-' + line.id + '" class="organizational-btn organizational-btn-primary" ' + (matches && selMap.size >= 2 ? '' : 'disabled') + '>Confirm ' + selMap.size + ' matches</button>'
      + '</div>';
  }

  async function renderMatchTab(line) {
    const el = document.getElementById('banking-row-content-' + line.id);
    if (!el) return;
    let d = rowMatchCandidates.get(line.id);
    if (!d) {
      el.innerHTML = '<p class="organizational-empty">Loading candidates…</p>';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/match-candidates');
      if (!out || !out.res.ok) { el.innerHTML = '<p class="organizational-panel-error">Could not load match candidates.</p>'; return; }
      d = out.data;
      rowMatchCandidates.set(line.id, d);
    }
    if ((rowActiveTab.get(line.id) || 'match') !== 'match') return;

    const rows = candidateRows(d);
    const findMatchOpen = !!rowFindMatchOpen.get(line.id);
    const lineMagnitude = Math.abs(lineSignedCents(line));

    let html;
    if (findMatchOpen) {
      html = rows.length
        ? '<div class="organizational-panel-section-head" style="margin-top:0;">All candidates</div>'
          + '<p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 4px;">Tick multiple bills or multiple invoices to split this line across them -- selected amounts must add up to ' + fmtMoney(lineMagnitude) + ' exactly.</p>'
          + rows.map((r, i) => candidateRowHtml(r, line.id, i, i === 0, lineMagnitude)).join('')
          + '<div id="banking-multimatch-footer-' + line.id + '">' + multiSelectFooterHtml(line, rows) + '</div>'
        : '<p class="organizational-empty">No open bills, invoices or recorded payments found within 15 days of this line. Use Create instead, or check the amount and date.</p>';
    } else if (rows.some((r) => isCloseCandidate(r, lineMagnitude))) {
      const best = rows.findIndex((r) => isCloseCandidate(r, lineMagnitude));
      html = '<div class="organizational-panel-section-head" style="margin-top:0;">Suggested match</div>' + candidateRowHtml(rows[best], line.id, best, true, lineMagnitude, true)
        + '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:6px;">Not this one, or need to split across several bills/invoices? Use <b>Find &amp; Match</b> above.</p>';
    } else {
      html = '<p class="organizational-empty">No close match.' + (rows.length ? ' <b>Find &amp; Match</b> above lists ' + rows.length + ' open bill' + (rows.length === 1 ? '' : 's') + ' or invoice' + (rows.length === 1 ? '' : 's') + ' of smaller amounts, for a split.' : ' Use <b>Find &amp; Match</b> above to search,') + ' Or code it directly with Create.</p>';
    }
    if ((d.grant_gifts_excluded_no_account || []).length) {
      const incomeOpts = codingAccountsCache.filter((a) => a.type === 'income');
      html += d.grant_gifts_excluded_no_account.map((g) =>
        '<div style="margin-top:8px;padding:8px;border:1px solid var(--organizational-error);border-radius:6px;">' +
          '<p style="font-size:0.75rem;margin:0 0 6px;">"' + esc(g.grant_name) + '" has no default revenue account set yet -- pick one to match this and future payments against it.</p>' +
          '<select class="organizational-input grant-default-account-select" data-grant-id="' + g.grant_id + '" style="font-size:0.75rem;">' +
            '<option value="">— select account —</option>' +
            incomeOpts.map((a) => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('') +
          '</select> ' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline grant-default-account-save-btn" data-grant-id="' + g.grant_id + '" data-line-id="' + line.id + '" style="font-size:0.75rem;">Save</button>' +
        '</div>'
      ).join('');
    }
    if ((d.membership_dues_excluded_no_account || []).length) {
      const incomeOpts = codingAccountsCache.filter((a) => a.type === 'income');
      html += d.membership_dues_excluded_no_account.filter((m) => m.tier_id != null).map((m) =>
        '<div style="margin-top:8px;padding:8px;border:1px solid var(--organizational-error);border-radius:6px;">' +
          '<p style="font-size:0.75rem;margin:0 0 6px;">"' + esc(m.tier_name || 'This tier') + '" has no default revenue account set yet -- pick one to match this and future dues payments against it.</p>' +
          '<select class="organizational-input dues-default-account-select" data-tier-id="' + m.tier_id + '" style="font-size:0.75rem;">' +
            '<option value="">— select account —</option>' +
            incomeOpts.map((a) => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('') +
          '</select> ' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline dues-default-account-save-btn" data-tier-id="' + m.tier_id + '" data-line-id="' + line.id + '" style="font-size:0.75rem;">Save</button>' +
        '</div>'
      ).join('');
      html += d.membership_dues_excluded_no_account.filter((m) => m.tier_id == null).map((m) =>
        '<div style="margin-top:8px;padding:8px;border:1px solid var(--organizational-error);border-radius:6px;">' +
          '<p style="font-size:0.75rem;margin:0;">' + esc(m.member_name) + '\'s dues payment has no membership tier assigned -- assign one on the Members page before it can be matched.</p>' +
        '</div>'
      ).join('');
    }
    if ((d.sponsored_project_disbursements_excluded_no_account || []).length) {
      const expenseOpts = codingAccountsCache.filter((a) => a.type === 'expense');
      html += d.sponsored_project_disbursements_excluded_no_account.map((p) =>
        '<div style="margin-top:8px;padding:8px;border:1px solid var(--organizational-error);border-radius:6px;">' +
          '<p style="font-size:0.75rem;margin:0 0 6px;">"' + esc(p.project_name) + '" has no default disbursement expense account set yet -- pick one to match this and future disbursements against it.</p>' +
          '<select class="organizational-input disbursement-default-account-select" data-project-id="' + p.project_id + '" style="font-size:0.75rem;">' +
            '<option value="">— select account —</option>' +
            expenseOpts.map((a) => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('') +
          '</select> ' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline disbursement-default-account-save-btn" data-project-id="' + p.project_id + '" data-line-id="' + line.id + '" style="font-size:0.75rem;">Save</button>' +
        '</div>'
      ).join('');
    }
    el.innerHTML = html;

    el.querySelectorAll('.grant-default-account-save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const grantId = btn.getAttribute('data-grant-id');
        const select = el.querySelector('.grant-default-account-select[data-grant-id="' + grantId + '"]');
        if (!select || !select.value) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/grants/' + grantId, {
          method: 'PATCH', body: JSON.stringify({ revenue_account_id: Number(select.value) }),
        });
        if (out && out.res.ok) {
          rowMatchCandidates.delete(line.id);
          await renderMatchTab(line);
        } else {
          showRowError(line.id, (out && out.data && out.data.error) || 'Could not set default account');
        }
      });
    });

    el.querySelectorAll('.dues-default-account-save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tierId = btn.getAttribute('data-tier-id');
        const select = el.querySelector('.dues-default-account-select[data-tier-id="' + tierId + '"]');
        if (!select || !select.value) return;
        const out = await apiJson('/api/organizational/' + encodeURIComponent(currentSlug) + '/membership/tiers/' + tierId, {
          method: 'PATCH', body: JSON.stringify({ revenue_account_id: Number(select.value) }),
        });
        if (out && out.res.ok) {
          rowMatchCandidates.delete(line.id);
          await renderMatchTab(line);
        } else {
          showRowError(line.id, (out && out.data && out.data.error) || 'Could not set default account');
        }
      });
    });

    el.querySelectorAll('.disbursement-default-account-save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const projectId = btn.getAttribute('data-project-id');
        const select = el.querySelector('.disbursement-default-account-select[data-project-id="' + projectId + '"]');
        if (!select || !select.value) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + projectId, {
          method: 'PATCH', body: JSON.stringify({ disbursement_expense_account_id: Number(select.value) }),
        });
        if (out && out.res.ok) {
          rowMatchCandidates.delete(line.id);
          await renderMatchTab(line);
        } else {
          showRowError(line.id, (out && out.data && out.data.error) || 'Could not set default account');
        }
      });
    });

    el.querySelectorAll('.match-confirm-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = rows[Number(btn.getAttribute('data-idx'))];
        showRowError(line.id, '');
        const out2 = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/match', {
          method: 'POST', body: JSON.stringify({ match_type: r.match_type, target_id: r.target_id }),
        });
        if (out2 && out2.res.ok) await loadLines();
        else showRowError(line.id, (out2 && out2.data && (out2.data.message || out2.data.error)) || 'Could not match this line.');
      });
    });

    el.querySelectorAll('.match-multi-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const r = rows[Number(cb.getAttribute('data-idx'))];
        if (!rowMultiSelected.has(line.id)) rowMultiSelected.set(line.id, new Map());
        const selMap = rowMultiSelected.get(line.id);
        const key = candidateKey(r);
        if (cb.checked) {
          const sumSoFar = Array.from(selMap.values()).reduce((s, v) => s + v.amountCents, 0);
          const defaultAmount = Math.max(1, Math.min(r.remaining_cents, lineMagnitude - sumSoFar));
          selMap.set(key, { matchType: r.match_type, targetId: r.target_id, amountCents: defaultAmount });
        } else {
          selMap.delete(key);
        }
        renderMatchTab(line);
      });
    });

    el.querySelectorAll('.match-multi-amount').forEach((inp) => {
      inp.addEventListener('change', () => {
        const r = rows[Number(inp.getAttribute('data-idx'))];
        const selMap = rowMultiSelected.get(line.id);
        if (!selMap || !selMap.has(candidateKey(r))) return;
        const cents = inputToCents(inp.value);
        if (Number.isNaN(cents) || cents <= 0 || cents > r.remaining_cents) { renderMatchTab(line); return; }
        selMap.get(candidateKey(r)).amountCents = cents;
        renderMatchTab(line);
      });
    });

    const confirmBtn = document.getElementById('banking-multimatch-confirm-' + line.id);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const selMap = rowMultiSelected.get(line.id);
        if (!selMap || selMap.size < 2) return;
        showRowError(line.id, '');
        const items = Array.from(selMap.values()).map((v) => ({ match_type: v.matchType, target_id: v.targetId, amount_cents: v.amountCents }));
        const out2 = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/match-multi', {
          method: 'POST', body: JSON.stringify({ items }),
        });
        if (out2 && out2.res.ok) { rowMultiSelected.delete(line.id); await loadLines(); }
        else showRowError(line.id, (out2 && out2.data && (out2.data.message || out2.data.error)) || 'Could not match this line.');
      });
    }
  }

  let bankRulesCache = [];
  const rulesTbody = document.getElementById('organizational-bankrules-tbody');
  const rulesForm = document.getElementById('organizational-bankrules-form');
  const addRuleBtn = document.getElementById('organizational-bankrules-add');
  const rulesSorter = rulesTbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(rulesTbody.closest('table'), {
    columns: [
      { key: 'priority', type: 'number', get: (r) => r.priority },
      { key: 'name', type: 'text', get: (r) => r.name },
      null,
      { key: 'action_account', type: 'text', get: (r) => (r.action_account_code ? r.action_account_code + ' ' : '') + (r.action_account_name || '') },
      null,
      null,
    ],
    onChange: () => renderBankRules(),
  }) : null;

  function directionLabel(d) { return d === 'debit' ? 'Money out' : d === 'credit' ? 'Money in' : 'Either direction'; }

  function conditionsSummary(r) {
    const parts = [];
    if (r.payee_contains) parts.push('payee contains "' + r.payee_contains + '"');
    if (r.description_contains) parts.push('description contains "' + r.description_contains + '"');
    if (r.amount_min_cents != null || r.amount_max_cents != null) {
      parts.push('amount ' + (r.amount_min_cents != null ? fmtMoney(Number(r.amount_min_cents)) : 'any') + '–' + (r.amount_max_cents != null ? fmtMoney(Number(r.amount_max_cents)) : 'any'));
    }
    if (r.direction) parts.push(directionLabel(r.direction));
    if (r.bank_account_name) parts.push('on ' + r.bank_account_name);
    return parts.join(', ');
  }

  function renderBankRules() {
    if (!rulesTbody) return;
    if (!bankRulesCache.length) {
      rulesTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No rules yet.</td></tr>';
      return;
    }
    rulesTbody.innerHTML = (rulesSorter ? rulesSorter.sortRows(bankRulesCache) : bankRulesCache).map((r) => (
      '<tr>'
      + '<td>' + r.priority + '</td>'
      + '<td>' + esc(r.name) + '</td>'
      + '<td style="font-size:0.8125rem;color:var(--text-secondary);">' + esc(conditionsSummary(r)) + '</td>'
      + '<td>' + esc(r.action_account_code ? r.action_account_code + ' — ' + r.action_account_name : r.action_account_name) + ' / ' + esc(r.action_program_name) + '</td>'
      + '<td><input type="checkbox" class="bankrules-active-toggle" data-id="' + r.id + '"' + (r.is_active ? ' checked' : '') + '></td>'
      + '<td>'
      + '<button type="button" class="organizational-btn organizational-btn-outline bankrules-edit-btn" data-id="' + r.id + '" style="font-size:0.75rem;">Edit</button> '
      + '<button type="button" class="organizational-btn organizational-btn-outline bankrules-delete-btn" data-id="' + r.id + '" style="font-size:0.75rem;">Delete</button>'
      + '</td>'
      + '</tr>'
    )).join('');
  }

  async function loadBankRules() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-rules');
    bankRulesCache = (out && out.data && out.data.rules) || [];
    renderBankRules();
  }

  function ruleFormHtml(rule) {
    const r = rule || {};
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="bankrules-form-name" class="organizational-input" value="' + esc(r.name || '') + '"></label></div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Priority (lower runs first)<input type="number" id="bankrules-form-priority" class="organizational-input" value="' + (r.priority != null ? r.priority : 100) + '"></label>'
      + '<label class="organizational-label" style="flex:1">Only on account<select id="bankrules-form-bank-account" class="organizational-select">' + accountOptions(cashAccountsCache, r.bank_account_id) + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Payee contains<input type="text" id="bankrules-form-payee" class="organizational-input" value="' + esc(r.payee_contains || '') + '"></label>'
      + '<label class="organizational-label" style="flex:1">Description contains<input type="text" id="bankrules-form-description" class="organizational-input" value="' + esc(r.description_contains || '') + '"></label>'
      + '</div>'
      + '<p style="font-size:0.75rem;color:var(--text-secondary);margin:-6px 0 4px;">At least one of payee/description contains is required.</p>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Amount min<input type="number" id="bankrules-form-amount-min" class="organizational-input" min="0" step="0.01" value="' + (r.amount_min_cents != null ? Number(r.amount_min_cents) / 100 : '') + '"></label>'
      + '<label class="organizational-label" style="flex:1">Amount max<input type="number" id="bankrules-form-amount-max" class="organizational-input" min="0" step="0.01" value="' + (r.amount_max_cents != null ? Number(r.amount_max_cents) / 100 : '') + '"></label>'
      + '<label class="organizational-label" style="flex:1">Direction<select id="bankrules-form-direction" class="organizational-select">'
      + '<option value=""' + (!r.direction ? ' selected' : '') + '>Either</option>'
      + '<option value="debit"' + (r.direction === 'debit' ? ' selected' : '') + '>Money out (debit)</option>'
      + '<option value="credit"' + (r.direction === 'credit' ? ' selected' : '') + '>Money in (credit)</option>'
      + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><strong style="font-size:0.8125rem;">Codes the line to:</strong></div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Account *<select id="bankrules-form-account" class="organizational-select">' + accountOptions(codingAccountsCache, r.action_account_id) + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Program *<select id="bankrules-form-program" class="organizational-select">' + programOptions(r.action_program_id) + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Grant<select id="bankrules-form-grant" class="organizational-select">' + grantOptions(r.action_grant_id) + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Restriction<select id="bankrules-form-restriction" class="organizational-select">'
      + '<option value=""' + (!r.action_donor_restriction_class ? ' selected' : '') + '>— None —</option>'
      + '<option value="unrestricted"' + (r.action_donor_restriction_class === 'unrestricted' ? ' selected' : '') + '>Unrestricted</option>'
      + '<option value="temporarily_restricted"' + (r.action_donor_restriction_class === 'temporarily_restricted' ? ' selected' : '') + '>Temp. restricted</option>'
      + '<option value="permanently_restricted"' + (r.action_donor_restriction_class === 'permanently_restricted' ? ' selected' : '') + '>Perm. restricted</option>'
      + '</select></label>'
      + '</div>'
      + '</div>'
      + '<div id="organizational-bankrules-form-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="bankrules-form-save" class="organizational-btn organizational-btn-primary">' + (r.id ? 'Save changes' : 'Create rule') + '</button>'
      + '<button type="button" id="bankrules-form-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div>';
  }

  function openRuleForm(rule) {
    if (!rulesForm) return;
    rulesForm.hidden = false;
    rulesForm.innerHTML = ruleFormHtml(rule);
    const errEl2 = document.getElementById('organizational-bankrules-form-error');
    document.getElementById('bankrules-form-cancel').addEventListener('click', () => { rulesForm.hidden = true; });
    document.getElementById('bankrules-form-save').addEventListener('click', async () => {
      if (errEl2) errEl2.hidden = true;
      const body = {
        name: document.getElementById('bankrules-form-name').value.trim(),
        priority: Number(document.getElementById('bankrules-form-priority').value) || 100,
        bank_account_id: document.getElementById('bankrules-form-bank-account').value || null,
        payee_contains: document.getElementById('bankrules-form-payee').value.trim() || null,
        description_contains: document.getElementById('bankrules-form-description').value.trim() || null,
        amount_min_cents: inputToCents(document.getElementById('bankrules-form-amount-min').value) || null,
        amount_max_cents: inputToCents(document.getElementById('bankrules-form-amount-max').value) || null,
        direction: document.getElementById('bankrules-form-direction').value || null,
        action_account_id: document.getElementById('bankrules-form-account').value || null,
        action_program_id: document.getElementById('bankrules-form-program').value || null,
        action_grant_id: document.getElementById('bankrules-form-grant').value || null,
        action_donor_restriction_class: document.getElementById('bankrules-form-restriction').value || null,
      };
      if (!document.getElementById('bankrules-form-amount-min').value) body.amount_min_cents = null;
      if (!document.getElementById('bankrules-form-amount-max').value) body.amount_max_cents = null;

      const url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-rules' + (rule && rule.id ? '/' + rule.id : '');
      const out = await apiJson(url, { method: rule && rule.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (out && out.res.ok) {
        rulesForm.hidden = true;
        await loadBankRules();
      } else if (errEl2) {
        errEl2.textContent = (out && out.data && out.data.error) || 'Could not save this rule.';
        errEl2.hidden = false;
      }
    });
  }

  if (addRuleBtn) addRuleBtn.addEventListener('click', () => openRuleForm(null));

  if (rulesTbody) {
    rulesTbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.bankrules-edit-btn');
      if (editBtn) {
        const rule = bankRulesCache.find((r) => r.id === Number(editBtn.getAttribute('data-id')));
        if (rule) openRuleForm(rule);
        return;
      }
      const delBtn = e.target.closest('.bankrules-delete-btn');
      if (delBtn) {
        if (!window.confirm('Delete this rule? Lines it already coded keep their coding.')) return;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-rules/' + delBtn.getAttribute('data-id'), { method: 'DELETE' });
        if (out && out.res.ok) await loadBankRules();
      }
    });
    rulesTbody.addEventListener('change', async (e) => {
      if (e.target.classList.contains('bankrules-active-toggle')) {
        const id = e.target.getAttribute('data-id');
        await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-rules/' + id, {
          method: 'PATCH', body: JSON.stringify({ is_active: e.target.checked }),
        });
      }
    });
  }

  async function initBanking(slug) {
    currentSlug = slug;
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug)]);
    await loadAccountStrip();
    await loadLines();
    if (window.OrganizationalAccounting.bankViews) window.OrganizationalAccounting.bankViews.init(slug);
  }

  window.OrganizationalAccounting.banking = { init: initBanking };
})();
