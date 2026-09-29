(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const errEl = document.getElementById('organizational-org-error');
  const tbody = document.getElementById('organizational-bankrecon-tbody');
  const acctSelect = document.getElementById('organizational-bankrecon-account');
  const importBtn = document.getElementById('organizational-bankrecon-import-btn');
  const importFile = document.getElementById('organizational-bankrecon-import-file');
  const acctDropdown = document.getElementById('organizational-bankrecon-account-dropdown');
  const connectBtn = document.getElementById('organizational-bankrecon-connect-btn');

  const plaidMapPanel = document.getElementById('organizational-plaid-map-panel');
  const plaidMapOverlay = document.getElementById('organizational-plaid-map-panel-overlay');
  const plaidMapBody = document.getElementById('organizational-plaid-map-panel-body');
  const plaidMapClose = document.getElementById('organizational-plaid-map-panel-close');
  const plaidMapErrEl = document.getElementById('organizational-plaid-map-panel-error');

  const importPanel = document.getElementById('organizational-bankrecon-import-panel');
  const importOverlay = document.getElementById('organizational-bankrecon-import-panel-overlay');
  const importBody = document.getElementById('organizational-bankrecon-import-panel-body');
  const importClose = document.getElementById('organizational-bankrecon-import-panel-close');
  const importErrEl = document.getElementById('organizational-bankrecon-import-panel-error');

  const cardsContainer = document.getElementById('organizational-bankrecon-cards');
  const tableWrap = document.getElementById('organizational-bankrecon-table-wrap');

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  // amount_cents on a statement line is unsigned (server migration 218); credit_debit_indicator
  // carries the direction. fmtMoney expects a signed value to render the +/- correctly.
  function lineSignedCents(l) {
    return l.credit_debit_indicator === 'debit' ? -Number(l.amount_cents) : Number(l.amount_cents);
  }

  let currentSlug = '';
  let cashAccountsCache = [];
  let codingAccountsCache = [];
  let programsCache = [];
  let grantsCache = [];
  let plaidStatusByAccount = {};
  // Every unconfirmed line renders its own always-visible tab set now (no shared panel to open
  // one at a time) -- these three maps hold each row's independent state.
  const rowActiveTab = new Map();       // lineId -> 'match'|'create'|'transfer'|'discuss'
  const rowMatchCandidates = new Map(); // lineId -> candidates response, fetched once per row
  const rowFindMatchOpen = new Map();   // lineId -> boolean, whether the full candidate list is expanded
  const rowCodingSuggestion = new Map(); // lineId -> coding-suggestion response ({suggestion} or null), fetched once per row
  const rowRuleMatch = new Map();        // lineId -> match-rules result for this line ({rule_id, rule_name, account_id, ...} or null), fetched once per row
  const rowMultiSelected = new Map();    // lineId -> Map(candidateKey -> {matchType, targetId, amountCents}), Find & Match multi-select state

  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }
  function showImportError(msg) { if (importErrEl) { importErrEl.textContent = msg || ''; importErrEl.hidden = !msg; } }
  function showPlaidMapError(msg) { if (plaidMapErrEl) { plaidMapErrEl.textContent = msg || ''; plaidMapErrEl.hidden = !msg; } }
  function showRowError(lineId, msg) {
    const el = document.getElementById('bankrecon-row-error-' + lineId);
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  // ── Reference data ──
  async function loadAccounts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    const all = (out && out.data && out.data.accounts) || [];
    cashAccountsCache = all.filter((a) => a.is_cash_account);
    // Real Xero behavior, confirmed rather than assumed: the bank feed CAN post to balance-sheet
    // accounts (a loan payment against a Loan Payable liability, a fixed-asset purchase, an
    // equity draw, a sales-tax remittance) -- there's no other entry path for those here, no
    // loan schedule or fixed-asset register module. What must stay excluded is specifically the
    // AP/AR control accounts (is_system_ap_account/is_system_ar_account) -- those already have
    // a real sub-ledger (Purchases/Sales) and coding a bank line straight to them is exactly the
    // duplicate-entry failure mode Xero's own docs warn about (Bank_Reconciliation_V1_Spec.md's
    // Match rework exists specifically to route payments through that sub-ledger instead).
    // Cash/clearing accounts are excluded for the unrelated reason that they're the other side
    // of every entry already (this account) or Transfer's own dedicated path.
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

  // ── Queue list ──
  const statusFilter = document.getElementById('organizational-bankrecon-status-filter');

  async function loadLines() {
    const bankAccountId = acctSelect && acctSelect.value;
    if (!bankAccountId) { renderRows([]); return; }
    const status = (statusFilter && statusFilter.value) || 'unconfirmed';
    const params = new URLSearchParams({ status, bank_account_id: bankAccountId });
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines?' + params.toString());
    renderRows((out && out.data && out.data.lines) || [], status);
  }

  // Lines currently rendered as unconfirmed cards -- looked up by id from the delegated click
  // handler below, since that handler has no per-row closure the way one-listener-per-row would.
  let currentUnconfirmedLines = [];

  function renderRows(lines, status) {
    const isUnconfirmed = (status || 'unconfirmed') === 'unconfirmed';
    if (cardsContainer) cardsContainer.hidden = !isUnconfirmed;
    if (tableWrap) tableWrap.hidden = isUnconfirmed;

    if (isUnconfirmed) {
      currentUnconfirmedLines = lines;
      renderUnconfirmedCards(lines);
      return;
    }
    if (!tbody) return;
    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No ' + (status || '').replace('_', ' ') + ' lines.</td></tr>';
      return;
    }
    tbody.innerHTML = lines.map((l) => (
      '<tr>'
      + '<td>' + esc(String(l.statement_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(l.description_raw) + '</td>'
      + '<td>' + esc(l.payee_raw) + '</td>'
      + '<td>' + fmtMoney(lineSignedCents(l)) + '</td>'
      + '<td></td>'
      + '<td><button type="button" class="organizational-btn organizational-btn-outline bankrecon-unreconcile-btn" data-id="' + l.id + '" style="font-size:0.8125rem;">Unreconcile</button></td>'
      + '</tr>'
    )).join('');
  }

  // ── Unconfirmed queue: always-expanded two-column cards, one per line, each carrying its own
  // live Match/Create/Transfer/Discuss tab set -- no shared side panel opened one row at a time. ──
  function cardHtml(l) {
    const signed = lineSignedCents(l);
    const spent = signed < 0 ? fmtMoney(Math.abs(signed)) : '—';
    const received = signed > 0 ? fmtMoney(signed) : '—';
    const pendingBadge = l.pending ? '<span class="organizational-badge" style="margin-left:6px;">Pending</span>' : '';
    // A note stays visible via the "Discuss *" tab label until it's resolved (coding the line
    // auto-resolves it -- see the discuss_resolved_at CASE in each confirm path below), but
    // having one doesn't change which tab opens by default -- that used to force Discuss to the
    // front, burying Match's own "no suggested match, try Find & Match or Create" guidance right
    // when someone's trying to actually resolve the line. The asterisk alone is enough signal.
    if (!rowActiveTab.has(l.id)) rowActiveTab.set(l.id, 'match');
    const activeTab = rowActiveTab.get(l.id);
    const discussLabel = l.discuss_note ? 'Discuss *' : 'Discuss';
    const tabBtn = (tab, label) => '<button type="button" class="organizational-tab bankrecon-row-tab' + (activeTab === tab ? ' active' : '') + '" data-line="' + l.id + '" data-tab="' + tab + '" style="font-size:0.8125rem;">' + label + '</button>';

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
      + '<button type="button" class="bankrecon-findmatch-link" data-line="' + l.id + '" style="background:none;border:none;color:var(--organizational-accent);font-size:0.8125rem;cursor:pointer;padding:0;">' + (rowFindMatchOpen.get(l.id) ? 'Hide full list' : 'Find &amp; Match') + '</button>'
      + '</div>'
      + '<p class="organizational-panel-error" id="bankrecon-row-error-' + l.id + '" hidden></p>'
      + '<div class="bankrecon-row-tab-content" id="bankrecon-row-content-' + l.id + '" style="margin-top:8px;"></div>'
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
      const tabBtn = e.target.closest('.bankrecon-row-tab');
      if (tabBtn) {
        const lineId = Number(tabBtn.getAttribute('data-line'));
        rowActiveTab.set(lineId, tabBtn.getAttribute('data-tab'));
        tabBtn.parentElement.querySelectorAll('.bankrecon-row-tab').forEach((b) => b.classList.toggle('active', b === tabBtn));
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderRowTabContent(line);
        return;
      }
      const findMatchBtn = e.target.closest('.bankrecon-findmatch-link');
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
        reconcileSplits.get(lineId).push({ accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null });
        const line = currentUnconfirmedLines.find((l) => l.id === lineId);
        if (line) renderCreateTab(line);
      }
    });
  }

  async function unreconcileLine(lineId) {
    const reason = window.prompt('Reason for unreconciling this line:');
    if (reason == null) return;
    if (!reason.trim()) { showError('A reason is required.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + lineId + '/unreconcile', {
      method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!out) return;
    if (out.res.ok) {
      const modeMsg = out.data.mode === 'reversed'
        ? 'Original transaction was in a locked period — left untouched, reversed by a new entry. Line flagged for re-coding.'
        : 'Reconciliation undone.';
      showError(''); // clear any prior error
      window.alert(modeMsg);
      await loadLines();
    } else {
      showError((out.data && out.data.error) || 'Could not unreconcile this line.');
    }
  }

  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const unrecBtn = e.target.closest('.bankrecon-unreconcile-btn');
      if (unrecBtn) unreconcileLine(Number(unrecBtn.getAttribute('data-id')));
    });
  }
  if (acctSelect) acctSelect.addEventListener('change', () => { loadLines(); if (currentView === 'cash-coding') loadCashCodingGrid(); });
  if (statusFilter) statusFilter.addEventListener('change', loadLines);

  // ── View toggle (Reconcile / Cash Coding) ──
  let currentView = 'reconcile';
  const viewTabs = document.querySelectorAll('#organizational-bankrecon-view-tabs .organizational-tab');
  const reconcileSection = document.getElementById('organizational-bankrecon-view-reconcile');
  const cashCodingSection = document.getElementById('organizational-bankrecon-view-cash-coding');
  const rulesSection = document.getElementById('organizational-bankrecon-view-rules');
  viewTabs.forEach((b) => b.addEventListener('click', () => {
    currentView = b.getAttribute('data-view');
    viewTabs.forEach((t) => t.classList.toggle('active', t === b));
    // These sections carry the shared .organizational-tab-content class (same as the
    // Match/Create/Transfer/Discuss panes), which gates visibility via .active in CSS
    // (display:none by default, display:block on .active) -- that class selector has higher
    // specificity than the `hidden` attribute's UA-stylesheet rule, so toggling `.hidden` alone
    // does nothing here. Found by screenshotting the actual page: the Cash Coding tab visually
    // activated but the Reconcile table kept rendering underneath, because .active was still
    // set on the Reconcile section and this code was only ever toggling `hidden`, never the
    // class CSS actually keys on.
    reconcileSection.classList.toggle('active', currentView === 'reconcile');
    cashCodingSection.classList.toggle('active', currentView === 'cash-coding');
    if (rulesSection) rulesSection.classList.toggle('active', currentView === 'rules');
    if (currentView === 'cash-coding') loadCashCodingGrid();
    if (currentView === 'rules') loadBankRules();
  }));

  // ── Cash Coding grid ──
  // Per-line split state: lineId -> array of { accountId, programId, grantId, restrictionClass,
  // amountCents (only meaningful once split into >1 row) }. Starts as one implicit full-amount
  // split until "+ Split" adds another.
  const cashCodingSplits = new Map();
  const cashCodingTransfers = new Map(); // lineId -> boolean
  // Match-awareness (added 2026-09-11): Cash Coding was Create-only, meaning a bulk-coded line
  // that actually corresponded to an open bill/invoice got double-entered instead of matched --
  // the same duplicate-entry failure mode Reconcile's own Match tab exists to close, just never
  // extended to the bulk grid. Mutually exclusive with Transfer (checking one unchecks the other).
  const cashCodingMatches = new Map();          // lineId -> boolean
  const cashCodingMatchCandidates = new Map();  // lineId -> match-candidates response, fetched once per row
  const cashCodingMatchSelection = new Map();   // lineId -> index into that row's candidateRows() list
  let cashCodingLines = [];

  async function loadCashCodingGrid() {
    const bankAccountId = acctSelect && acctSelect.value;
    if (!bankAccountId) { renderCashCodingGrid([]); return; }
    const params = new URLSearchParams({ status: 'unconfirmed', bank_account_id: bankAccountId });
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines?' + params.toString());
    cashCodingLines = (out && out.data && out.data.lines) || [];
    cashCodingSplits.clear();
    cashCodingTransfers.clear();
    cashCodingMatches.clear();
    cashCodingMatchCandidates.clear();
    cashCodingMatchSelection.clear();
    cashCodingRuleApplied.clear();
    cashCodingLines.forEach((l) => cashCodingSplits.set(l.id, [{ accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null }]));
    renderCashCodingGrid(cashCodingLines);
  }

  function splitRowHtml(lineId, idx, split, showAmount) {
    return '<div class="cashcoding-split-row" data-line="' + lineId + '" data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;margin-bottom:2px;">'
      + '<select class="organizational-select cashcoding-account" style="width:150px;">' + accountOptions(codingAccountsCache, split.accountId) + '</select>'
      + '<select class="organizational-select cashcoding-program" style="width:110px;">' + programOptions(split.programId) + '</select>'
      + '<select class="organizational-select cashcoding-grant" style="width:110px;">' + grantOptions(split.grantId) + '</select>'
      + '<select class="organizational-select cashcoding-restriction" style="width:110px;">'
      + '<option value=""' + (split.restrictionClass ? '' : ' selected') + '>— None —</option>'
      + '<option value="unrestricted"' + (split.restrictionClass === 'unrestricted' ? ' selected' : '') + '>Unrestricted</option>'
      + '<option value="temporarily_restricted"' + (split.restrictionClass === 'temporarily_restricted' ? ' selected' : '') + '>Temp. restricted</option>'
      + '<option value="permanently_restricted"' + (split.restrictionClass === 'permanently_restricted' ? ' selected' : '') + '>Perm. restricted</option>'
      + '</select>'
      + (showAmount ? '<input type="number" class="organizational-input cashcoding-split-amount" placeholder="Amount" min="0" step="0.01" value="' + (split.amountCents != null ? (split.amountCents / 100) : '') + '" style="width:80px;">' : '')
      + '</div>';
  }

  function renderCashCodingGrid(lines) {
    const tbody = document.getElementById('organizational-cashcoding-tbody');
    if (!tbody) return;
    if (!lines.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="10">No unconfirmed lines.</td></tr>';
      return;
    }
    tbody.innerHTML = lines.map((l) => {
      const splits = cashCodingSplits.get(l.id) || [];
      const isTransfer = !!cashCodingTransfers.get(l.id);
      const isMatch = !!cashCodingMatches.get(l.id);
      const showAmount = splits.length > 1;
      let codingCellsHtml;
      if (isMatch) {
        const d = cashCodingMatchCandidates.get(l.id);
        if (!d) {
          codingCellsHtml = '<span style="font-size:0.75rem;color:var(--text-secondary);">Loading candidates…</span>';
        } else {
          const rows = candidateRows(d);
          if (!rows.length) {
            codingCellsHtml = '<span style="font-size:0.75rem;color:var(--text-secondary);">No matching bills/invoices found -- uncheck Match to code it directly.</span>';
          } else {
            const selIdx = cashCodingMatchSelection.has(l.id) ? cashCodingMatchSelection.get(l.id) : 0;
            codingCellsHtml = '<select class="organizational-select cashcoding-match-select" data-line="' + l.id + '" style="width:280px;">'
              + rows.map((r, i) => '<option value="' + i + '"' + (i === selIdx ? ' selected' : '') + '>' + esc(r.label) + ' — ' + esc(r.sub) + '</option>').join('')
              + '</select>';
          }
        }
      } else if (isTransfer) {
        codingCellsHtml = '<div style="display:flex;gap:4px;align-items:center;"><select class="organizational-select cashcoding-transfer-account" style="width:170px;">' + accountOptions(cashAccountsCache.filter((a) => a.id !== l.bank_account_id)) + '</select><span style="font-size:0.75rem;color:var(--text-secondary);">destination account</span></div>';
      } else {
        codingCellsHtml = '<div class="cashcoding-splits-wrap" data-line="' + l.id + '">' + splits.map((s, i) => splitRowHtml(l.id, i, s, showAmount)).join('') + '</div>'
          + '<button type="button" class="organizational-sg-add-btn cashcoding-add-split" data-line="' + l.id + '" style="font-size:0.75rem;">+ Split</button>';
      }
      return '<tr data-line-row="' + l.id + '">'
        + '<td><input type="checkbox" class="cashcoding-select" data-line="' + l.id + '"></td>'
        + '<td>' + esc(String(l.statement_date || '').slice(0, 10)) + '</td>'
        + '<td>' + esc(l.description_raw) + '</td>'
        + '<td>' + fmtMoney(lineSignedCents(l)) + '</td>'
        + '<td style="white-space:nowrap;">'
        + '<label style="font-size:0.75rem;font-weight:400;margin-right:8px;"><input type="checkbox" class="cashcoding-match-toggle" data-line="' + l.id + '"' + (isMatch ? ' checked' : '') + '> Match</label>'
        + '<label style="font-size:0.75rem;font-weight:400;"><input type="checkbox" class="cashcoding-transfer-toggle" data-line="' + l.id + '"' + (isTransfer ? ' checked' : '') + '> Transfer</label>'
        + '</td>'
        + '<td colspan="4">' + codingCellsHtml + '</td>'
        + '<td></td>'
        + '</tr>';
    }).join('');
  }

  const cashCodingTbody = document.getElementById('organizational-cashcoding-tbody');
  if (cashCodingTbody) {
    cashCodingTbody.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.cashcoding-add-split');
      if (addBtn) {
        const lineId = Number(addBtn.getAttribute('data-line'));
        const splits = cashCodingSplits.get(lineId) || [];
        splits.push({ accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null });
        cashCodingSplits.set(lineId, splits);
        renderCashCodingGrid(cashCodingLines);
      }
    });
    cashCodingTbody.addEventListener('change', async (e) => {
      if (e.target.classList.contains('cashcoding-transfer-toggle')) {
        const lineId = Number(e.target.getAttribute('data-line'));
        cashCodingTransfers.set(lineId, e.target.checked);
        if (e.target.checked) cashCodingMatches.set(lineId, false);
        renderCashCodingGrid(cashCodingLines);
        return;
      }
      if (e.target.classList.contains('cashcoding-match-toggle')) {
        const lineId = Number(e.target.getAttribute('data-line'));
        const checked = e.target.checked;
        cashCodingMatches.set(lineId, checked);
        if (checked) {
          cashCodingTransfers.set(lineId, false);
          if (!cashCodingMatchCandidates.has(lineId)) {
            renderCashCodingGrid(cashCodingLines); // show "Loading…" immediately
            const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + lineId + '/match-candidates');
            cashCodingMatchCandidates.set(lineId, (out && out.res.ok) ? out.data : { bills: [], invoices: [], outstanding_bill_payments: [], outstanding_invoice_payments: [], outstanding_transfers: [] });
          }
        }
        renderCashCodingGrid(cashCodingLines);
        return;
      }
      if (e.target.classList.contains('cashcoding-match-select')) {
        const lineId = Number(e.target.getAttribute('data-line'));
        cashCodingMatchSelection.set(lineId, Number(e.target.value));
      }
    });
  }

  const selectAllCb = document.getElementById('organizational-cashcoding-select-all');
  if (selectAllCb) selectAllCb.addEventListener('change', () => {
    document.querySelectorAll('.cashcoding-select').forEach((cb) => { cb.checked = selectAllCb.checked; });
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
    const selected = Array.from(document.querySelectorAll('.cashcoding-select:checked')).map((cb) => Number(cb.getAttribute('data-line')));
    if (!selected.length) { showError('Select at least one line to reconcile.'); return; }
    showError('');

    const codings = [];
    for (const lineId of selected) {
      if (cashCodingMatches.get(lineId)) {
        const d = cashCodingMatchCandidates.get(lineId);
        const rows = d ? candidateRows(d) : [];
        const selIdx = cashCodingMatchSelection.has(lineId) ? cashCodingMatchSelection.get(lineId) : 0;
        const r = rows[selIdx];
        if (!r) { showError('Line ' + lineId + ' is set to Match but has no candidate selected -- uncheck Match or wait for candidates to load.'); return; }
        codings.push({ line_id: lineId, is_match: true, match_type: r.match_type, target_id: r.target_id });
        continue;
      }
      if (cashCodingTransfers.get(lineId)) {
        const row = document.querySelector('tr[data-line-row="' + lineId + '"]');
        const accountId = row.querySelector('.cashcoding-transfer-account').value;
        codings.push({ line_id: lineId, is_transfer: true, destination_account_id: accountId ? Number(accountId) : null });
        continue;
      }
      const splits = readSplitsFromRow(lineId);
      const ruleApplied = cashCodingRuleApplied.get(lineId);
      const stillRuleSourced = ruleApplied && splits.length === 1 && Number(splits[0].account_id) === Number(ruleApplied.account_id);
      codings.push({
        line_id: lineId, splits,
        coding_source: stillRuleSourced ? 'rule' : 'manual',
        applied_rule_id: stillRuleSourced ? ruleApplied.rule_id : null,
      });
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
    await loadLines();
  });

  // Cash Coding rows that a rule filled -- lineId -> { rule_id, account_id } -- so
  // Save & Reconcile All can tag coding_source='rule' for exactly the rows whose fields still
  // match what the rule set, same "still matches" guard the Reconcile Create tab uses.
  const cashCodingRuleApplied = new Map();

  const applyRulesBtn = document.getElementById('organizational-cashcoding-apply-rules');
  if (applyRulesBtn) applyRulesBtn.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.cashcoding-select:checked')).map((cb) => Number(cb.getAttribute('data-line')));
    if (!selected.length) { showError('Select at least one line first.'); return; }
    // Only plain (not Match/Transfer) rows are eligible -- a rule fills a single Create-tab
    // coding, the same shape Match/Transfer already don't use this grid's split fields for.
    const eligible = selected.filter((id) => !cashCodingMatches.get(id) && !cashCodingTransfers.get(id));
    if (!eligible.length) { showError('None of the selected lines are eligible (Match/Transfer rows are skipped).'); return; }

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/match-rules', {
      method: 'POST', body: JSON.stringify({ line_ids: eligible }),
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
      cashCodingRuleApplied.set(lineId, { rule_id: m.rule_id, account_id: m.account_id });
    }
    renderCashCodingGrid(cashCodingLines);
    showError(matchedCount + ' of ' + eligible.length + ' selected line(s) matched a rule and were pre-filled. Review before saving.');
  });

  // ── Per-row Create/Transfer/Discuss tabs -- same fields and POST calls as before, just
  // rendered into that row's own content div (#bankrecon-row-content-<lineId>) with
  // per-line-suffixed element ids, since every row now renders simultaneously instead of one
  // panel at a time. ──
  //
  // "Add details" (Create tab) reuses Cash Coding's own split-row UI verbatim -- splitRowHtml()/
  // readSplitsFromRow() already key everything off a lineId, not off being inside the Cash
  // Coding grid specifically, and the /create endpoint already accepts a `splits` array (the
  // same shape Cash Coding posts) alongside the single account/program/grant shape Reconcile's
  // plain Create sends -- both normalize to the same buildSplitLines() call server-side. A
  // separate map (not cashCodingSplits) avoids the Cash Coding grid's own load clearing this
  // state out from under Reconcile whenever the other tab is opened.
  const reconcileMultiSplit = new Set(); // lineId -> in multi-line mode
  const reconcileSplits = new Map();     // lineId -> array of split objects, same shape as cashCodingSplits'

  function renderCreateTab(line) {
    const el = document.getElementById('bankrecon-row-content-' + line.id);
    if (!el) return;

    if (reconcileMultiSplit.has(line.id)) {
      if (!reconcileSplits.has(line.id)) {
        reconcileSplits.set(line.id, [
          { accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null },
          { accountId: '', programId: '', grantId: '', restrictionClass: '', amountCents: null },
        ]);
      }
      const splits = reconcileSplits.get(line.id);
      const totalCents = Math.abs(lineSignedCents(line));
      el.innerHTML = '<div class="cashcoding-splits-wrap" data-line="' + line.id + '">' + splits.map((s, i) => splitRowHtml(line.id, i, s, true)).join('') + '</div>'
        + '<button type="button" class="organizational-sg-add-btn reconcile-add-split" data-line="' + line.id + '" style="font-size:0.75rem;margin-top:6px;">+ Add another line</button>'
        + '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px;">Lines must add up to ' + fmtMoney(totalCents) + '.</p>'
        + '<div class="organizational-panel-actions">'
        + '<button type="button" id="bankrecon-create-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Create &amp; confirm</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline reconcile-remove-details" data-line="' + line.id + '" style="margin-left:8px;">Single line instead</button>'
        + '</div>';

      document.getElementById('bankrecon-create-save-' + line.id).addEventListener('click', async () => {
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
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Account *<select id="bankrecon-create-account-' + line.id + '" class="organizational-select">' + accountOptions(codingAccountsCache) + '</select></label>'
      + '<p id="bankrecon-create-suggestion-' + line.id + '" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Program *<select id="bankrecon-create-program-' + line.id + '" class="organizational-select">' + programOptions() + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Grant<select id="bankrecon-create-grant-' + line.id + '" class="organizational-select">' + grantOptions() + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Restriction<select id="bankrecon-create-restriction-' + line.id + '" class="organizational-select">'
      + '<option value="">— None —</option><option value="unrestricted">Unrestricted</option>'
      + '<option value="temporarily_restricted">Temporarily restricted</option><option value="permanently_restricted">Permanently restricted</option>'
      + '</select></label>'
      + '</div>'
      + '</div>'
      + '<button type="button" class="reconcile-add-details" data-line="' + line.id + '" style="background:none;border:none;color:var(--organizational-accent);font-size:0.75rem;cursor:pointer;padding:0;margin-bottom:8px;">Add details — split across multiple accounts</button>'
      + '<div class="organizational-panel-actions"><button type="button" id="bankrecon-create-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Create &amp; confirm</button></div>';

    document.getElementById('bankrecon-create-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const accountId = document.getElementById('bankrecon-create-account-' + line.id).value;
      const programId = document.getElementById('bankrecon-create-program-' + line.id).value;
      const grantId = document.getElementById('bankrecon-create-grant-' + line.id).value;
      const restriction = document.getElementById('bankrecon-create-restriction-' + line.id).value;
      if (!accountId || !programId) { showRowError(line.id, 'Account and program are required.'); return; }
      // A rule's fill only counts as coding_source='rule' if the account field still matches
      // what the rule set -- if the user changed it, this coding is manual, not rule-sourced,
      // even though a rule ran earlier in this row's lifecycle.
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

  // ── Bank Rules: pre-fill the Create tab from the first active rule (lowest priority number)
  // that matches this line, same deterministic first-match-wins evaluation the bulk Cash Coding
  // "Apply rules" action uses server-side (POST .../match-rules, shared logic). Takes precedence
  // over the coding-memory suggestion below (checked first; memory only fills fields a rule left
  // empty, via the same "only fill if still blank" guard both functions already share). ──
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
    const accountEl = document.getElementById('bankrecon-create-account-' + line.id);
    if (!accountEl || accountEl.value) return; // row moved on, or user already picked something
    accountEl.value = String(cached.account_id);
    const programEl = document.getElementById('bankrecon-create-program-' + line.id);
    if (programEl && !programEl.value) programEl.value = String(cached.program_id);
    if (cached.grant_id) {
      const grantEl = document.getElementById('bankrecon-create-grant-' + line.id);
      if (grantEl && !grantEl.value) grantEl.value = String(cached.grant_id);
    }
    if (cached.donor_restriction_class) {
      const restrictionEl = document.getElementById('bankrecon-create-restriction-' + line.id);
      if (restrictionEl && !restrictionEl.value) restrictionEl.value = cached.donor_restriction_class;
    }
    const hint = document.getElementById('bankrecon-create-suggestion-' + line.id);
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Rule: ' + cached.rule_name + ' — change it if this one is different.';
    }
  }

  // ── Coding memory: pre-fill the Create tab's account/program/grant/restriction from the most
  // recent time this org coded a Create-tab line for the same payee (server does the actual
  // lookup; see the coding-suggestion endpoint's own comment for why it's scoped to single-split
  // Create codings only). Fetched once per row and cached, same pattern as rowMatchCandidates --
  // async, so it only fills fields still at their default '' value when the response lands (the
  // user may have already chosen something, or switched tabs, while this was in flight). Only
  // reaches fields a rule (above) didn't already fill -- same "only fill if still blank" guard. ──
  async function applyCodingSuggestion(line) {
    if (!line.payee_raw) return;
    let cached = rowCodingSuggestion.get(line.id);
    if (cached === undefined) {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/coding-suggestion');
      cached = (out && out.res.ok) ? out.data.suggestion : null;
      rowCodingSuggestion.set(line.id, cached);
    }
    if (!cached) return;
    const accountEl = document.getElementById('bankrecon-create-account-' + line.id);
    if (!accountEl || accountEl.value) return; // row moved on, or user already picked something
    accountEl.value = String(cached.account_id);
    const programEl = document.getElementById('bankrecon-create-program-' + line.id);
    if (programEl && !programEl.value) programEl.value = String(cached.program_id);
    if (cached.grant_id) {
      const grantEl = document.getElementById('bankrecon-create-grant-' + line.id);
      if (grantEl && !grantEl.value) grantEl.value = String(cached.grant_id);
    }
    if (cached.donor_restriction_class) {
      const restrictionEl = document.getElementById('bankrecon-create-restriction-' + line.id);
      if (restrictionEl && !restrictionEl.value) restrictionEl.value = cached.donor_restriction_class;
    }
    const hint = document.getElementById('bankrecon-create-suggestion-' + line.id);
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Suggested from the last time you coded ' + line.payee_raw + ' — change it if this one is different.';
    }
  }

  // No Program field -- a transfer between the org's own bank accounts has no P&L impact
  // (confirmed against Xero's real Transfer UI, which only ever asks for a destination account
  // and a reference), so this posts against the system Internal Transfers program automatically
  // server-side. "Select a bank account" lists every OTHER cash account the org has; leaving
  // none selected falls back to the clearing-account path for a transfer to an account this org
  // doesn't track here.
  function renderTransferTab(line) {
    const el = document.getElementById('bankrecon-row-content-' + line.id);
    if (!el) return;
    const otherAccounts = cashAccountsCache.filter((a) => a.id !== line.bank_account_id);
    const accountRadios = otherAccounts.length
      ? otherAccounts.map((a, i) => (
          '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-weight:400;">'
          + '<input type="radio" name="bankrecon-transfer-account-' + line.id + '" value="' + a.id + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(a.name)
          + '</label>'
        )).join('')
      : '<p style="font-size:0.8125rem;color:var(--text-secondary);">No other bank accounts to transfer to yet -- this will post to an internal clearing account instead.</p>';

    el.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<div style="flex:1;"><div class="organizational-label" style="margin-bottom:4px;">Select a bank account</div>' + accountRadios + '</div>'
      + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="bankrecon-transfer-reference-' + line.id + '" class="organizational-input"></label>'
      + '</div>'
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="bankrecon-transfer-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Code as transfer</button></div>';

    document.getElementById('bankrecon-transfer-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const checked = el.querySelector('input[name="bankrecon-transfer-account-' + line.id + '"]:checked');
      const reference = document.getElementById('bankrecon-transfer-reference-' + line.id).value.trim();
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/transfer', {
        method: 'POST',
        body: JSON.stringify({ destination_account_id: checked ? Number(checked.value) : null, reference: reference || null }),
      });
      if (out && out.res.ok) await loadLines();
      else showRowError(line.id, (out && out.data && (out.data.message || out.data.error)) || 'Could not code this line as a transfer.');
    });
  }

  function renderDiscussTab(line) {
    const el = document.getElementById('bankrecon-row-content-' + line.id);
    if (!el) return;
    el.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Note<textarea id="bankrecon-discuss-note-' + line.id + '" rows="3" placeholder="Not sure where to code this…">' + esc(line.discuss_note) + '</textarea></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="bankrecon-discuss-save-' + line.id + '" class="organizational-btn organizational-btn-primary">Save note</button></div>';

    document.getElementById('bankrecon-discuss-save-' + line.id).addEventListener('click', async () => {
      showRowError(line.id, '');
      const note = document.getElementById('bankrecon-discuss-note-' + line.id).value.trim();
      if (!note) { showRowError(line.id, 'Note is required.'); return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/discuss', {
        method: 'POST', body: JSON.stringify({ note }),
      });
      if (out && out.res.ok) await loadLines();
      else showRowError(line.id, (out && out.data && out.data.error) || 'Could not save note.');
    });
  }

  // ── Import panel ──
  function openImportPanel() {
    showImportError('');
    importBody.innerHTML = '<p class="organizational-empty">Choose a CSV file to preview.</p>'
      + '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">Columns: date, amount (signed -- negative for money out, positive for money in), payee, description. Amount only -- a bank export with separate debit/credit columns needs to be combined into one signed amount column first, that shape isn\'t auto-detected yet.</p>';
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

    importBody.innerHTML = '<p>' + data.total + ' transactions found — ' + data.new + ' new, ' + data.duplicates + ' duplicates.</p>'
      + (data.errors && data.errors.length ? '<p style="color:var(--organizational-status-danger,#dc2626);">' + data.errors.length + ' row(s) had errors and will be skipped.</p>' : '')
      + '<label style="display:flex;align-items:center;gap:6px;font-size:0.8125rem;"><input type="checkbox" id="bankrecon-import-dupes"> Import duplicates anyway</label>'
      + '<div class="organizational-panel-actions"><button type="button" id="bankrecon-import-confirm" class="organizational-btn organizational-btn-primary">Import</button></div>';

    document.getElementById('bankrecon-import-confirm').addEventListener('click', async () => {
      const includeDupes = document.getElementById('bankrecon-import-dupes').checked;
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

  // ── Reconciliation report ──
  const reportBtn = document.getElementById('organizational-bankrecon-report-btn');
  const reportPanel = document.getElementById('organizational-bankrecon-report-panel');
  const reportOverlay = document.getElementById('organizational-bankrecon-report-panel-overlay');
  const reportBody = document.getElementById('organizational-bankrecon-report-panel-body');
  const reportClose = document.getElementById('organizational-bankrecon-report-panel-close');
  const reportErrEl = document.getElementById('organizational-bankrecon-report-panel-error');

  function showReportError(msg) { if (reportErrEl) { reportErrEl.textContent = msg || ''; reportErrEl.hidden = !msg; } }

  function renderReportForm() {
    reportBody.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Statement ending date *<input type="date" id="bankrecon-report-date" class="organizational-input"></label>'
      + '<label class="organizational-label" style="flex:1">Ending balance ($) *<input type="number" id="bankrecon-report-balance" class="organizational-input" step="0.01"></label>'
      + '</div></div>'
      + '<div class="organizational-panel-actions"><button type="button" id="bankrecon-report-run" class="organizational-btn organizational-btn-primary">Run</button></div>'
      + '<div id="bankrecon-report-result" style="margin-top:16px;"></div>';

    document.getElementById('bankrecon-report-run').addEventListener('click', async () => {
      showReportError('');
      const date = document.getElementById('bankrecon-report-date').value;
      const balanceCents = inputToCents(document.getElementById('bankrecon-report-balance').value);
      const bankAccountId = acctSelect && acctSelect.value;
      if (!date) { showReportError('Statement ending date is required.'); return; }
      if (!bankAccountId) { showReportError('Choose a bank account first.'); return; }

      const params = new URLSearchParams({ bank_account_id: bankAccountId, statement_date: date, ending_balance_cents: String(balanceCents) });
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/reconciliation-report?' + params.toString());
      if (!out || !out.res.ok) { showReportError((out && out.data && out.data.error) || 'Could not run report.'); return; }
      const d = out.data;
      const statusColor = d.matches ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
      document.getElementById('bankrecon-report-result').innerHTML =
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

  // ── Account strip: one card per cash/card account, click sets acctSelect.value (the single
  // source of truth every existing query already reads from) and dispatches 'change' so the
  // existing loadLines()/loadCashCodingGrid() listener fires unchanged. ──
  let acctDropdownOpen = false;

  function acctSummaryLine(a) {
    const plaid = plaidStatusByAccount[a.id];
    return plaid
      ? '<span style="color:var(--organizational-accent);">● Connected</span>' + (plaid.last_synced_at ? ' · synced ' + timeAgo(plaid.last_synced_at) : '')
      : '<span style="color:var(--text-secondary);">CSV only</span>';
  }

  // A card per account doesn't scale to orgs with several banks/cards -- this is a single
  // compact control instead: a button showing the selected account's own summary, opening a
  // dropdown list (closes on outside click / Escape, same convention as the header's own
  // dropdowns elsewhere in this app) to switch. The underlying <select> stays the source of
  // truth every existing query already reads from -- this only ever drives it.
  function renderAccountDropdown(counts) {
    if (!acctDropdown) return;
    if (!cashAccountsCache.length) {
      acctDropdown.innerHTML = '<p class="organizational-empty">No cash accounts configured yet.</p>';
      return;
    }
    const selectedId = acctSelect && acctSelect.value;
    const selected = cashAccountsCache.find((a) => String(a.id) === String(selectedId)) || cashAccountsCache[0];
    const selectedCount = counts[selected.id] || 0;

    acctDropdown.innerHTML = '<button type="button" id="organizational-bankrecon-account-toggle" class="organizational-card" style="text-align:left;padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;margin:0;">'
      + '<span><div style="font-weight:600;font-size:0.875rem;">' + esc(selected.name) + '</div><div style="font-size:0.75rem;">' + acctSummaryLine(selected) + (selectedCount > 0 ? ' · <span style="color:var(--organizational-accent);">' + selectedCount + ' to reconcile</span>' : '') + '</div></span>'
      + '<span aria-hidden="true">' + (acctDropdownOpen ? '▲' : '▼') + '</span>'
      + '</button>'
      + '<div id="organizational-bankrecon-account-list" class="organizational-card" style="position:absolute;top:100%;left:0;z-index:20;min-width:260px;margin-top:4px;padding:6px;' + (acctDropdownOpen ? '' : 'display:none;') + '">'
      + cashAccountsCache.map((a) => {
          const count = counts[a.id] || 0;
          const isActive = String(a.id) === String(selectedId);
          return '<button type="button" class="organizational-bankrecon-acct-option" data-account-id="' + a.id + '" '
            + 'style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:6px;cursor:pointer;background:' + (isActive ? 'color-mix(in srgb, var(--organizational-accent) 10%, transparent)' : 'none') + ';">'
            + '<div style="font-weight:600;font-size:0.8125rem;">' + esc(a.name) + '</div>'
            + '<div style="font-size:0.75rem;">' + acctSummaryLine(a) + (count > 0 ? ' · <span style="color:var(--organizational-accent);">' + count + ' to reconcile</span>' : '') + '</div>'
            + '</button>';
        }).join('')
      + '</div>';

    const toggleBtn = document.getElementById('organizational-bankrecon-account-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      acctDropdownOpen = !acctDropdownOpen;
      renderAccountDropdown(counts);
    });
    acctDropdown.querySelectorAll('.organizational-bankrecon-acct-option').forEach((opt) => {
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

  // ── Plaid Link ──
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

  // ── Match tab: search unpaid bills/invoices + already-recorded-but-unlinked payments,
  // confirming either posts through the exact same recordBillPayment/recordInvoicePayment path
  // the bill/invoice panel itself uses (server-side), or just links to an existing payment --
  // never a second Create for money that's already accounted for. ──
  // Flattens the /match-candidates response into one ranked list -- an outstanding (already
  // recorded) payment ranks first, since that's an exact "this already happened" hit rather
  // than a guess; everything else keeps the API's own date-proximity ordering.
  function candidateRows(d) {
    const rows = [];
    (d.outstanding_transfers || []).forEach((t) => rows.push({ label: 'Internal transfer from ' + (t.source_account_name || 'another account'), sub: String(t.transaction_date).slice(0, 10) + ' · ' + fmtMoney(t.amount_cents) + ' · pairs with that transfer, posts nothing new', match_type: 'outstanding_transfer', target_id: t.id }));
    d.outstanding_bill_payments.forEach((p) => rows.push({ label: 'Already recorded: ' + (p.vendor_name || 'Vendor') + ' — Bill ' + (p.reference || '#' + p.bill_id), sub: p.payment_date + ' · ' + fmtMoney(p.amount_cents) + ' · links to the existing payment, posts nothing new', match_type: 'outstanding_bill_payment', target_id: p.id }));
    d.outstanding_invoice_payments.forEach((p) => rows.push({ label: 'Already recorded: ' + (p.customer_name || 'Customer') + ' — Invoice ' + (p.reference || '#' + p.invoice_id), sub: p.payment_date + ' · ' + fmtMoney(p.amount_cents) + ' · links to the existing payment, posts nothing new', match_type: 'outstanding_invoice_payment', target_id: p.id }));
    // multiSelectable: only open bills/invoices can be ticked into a multi-select match -- Xero's
    // own Find & Match limits multi-select to open invoices/bills for the same reason (an
    // "already recorded" payment or a transfer pairing is already an exact, single, fixed-amount
    // link, not something a running total needs to add up against).
    d.bills.forEach((b) => rows.push({ label: (b.vendor_name || 'Vendor') + ' — Bill ' + (b.reference || '#' + b.id), sub: b.bill_date + ' · ' + fmtMoney(b.remaining_cents) + ' remaining' + (b.name_match ? ' · name match' : ''), match_type: 'bill', target_id: b.id, remaining_cents: Number(b.remaining_cents), multiSelectable: true }));
    d.invoices.forEach((i) => rows.push({ label: (i.customer_name || 'Customer') + ' — Invoice ' + (i.reference || '#' + i.id), sub: i.invoice_date + ' · ' + fmtMoney(i.remaining_cents) + ' remaining' + (i.name_match ? ' · name match' : ''), match_type: 'invoice', target_id: i.id, remaining_cents: Number(i.remaining_cents), multiSelectable: true }));
    // Cash grant gifts recorded in Donors, awaiting the deposit -- confirming posts a new
    // transaction to the grant's default revenue account (see grantGiftPayment.js).
    (d.grant_gifts || []).forEach((g) => rows.push({ label: 'Grant: ' + (g.grant_name || 'Untitled') + (g.funder ? ' — ' + g.funder : ''), sub: String(g.received_at).slice(0, 10) + ' · ' + fmtMoney(g.amount_cents) + ' · ' + (g.constituent_name || 'expected') + ' · posts to the grant\'s default revenue account', match_type: 'grant_gift', target_id: g.id }));
    // Membership dues awaiting the real deposit -- confirming posts to the member's tier's
    // default revenue account (see membershipDuesPayment.js).
    (d.membership_dues || []).forEach((m) => rows.push({ label: 'Dues: ' + m.member_name + (m.tier_name ? ' — ' + m.tier_name : ''), sub: String(m.payment_date).slice(0, 10) + ' · ' + fmtMoney(m.amount_cents) + ' · posts to the tier\'s default revenue account', match_type: 'membership_dues', target_id: m.id }));
    // Approved sponsored-project disbursements awaiting the actual outgoing payment (see
    // sponsoredProjectDisbursementPayment.js).
    (d.sponsored_project_disbursements || []).forEach((p) => rows.push({ label: 'Disbursement: ' + p.project_name, sub: String(p.disbursement_date).slice(0, 10) + ' · ' + fmtMoney(p.amount_cents) + ' · posts to the project\'s default expense account', match_type: 'sponsored_project_disbursement', target_id: p.id }));
    return rows;
  }

  function candidateKey(r) { return r.match_type + ':' + r.target_id; }

  function candidateRowHtml(r, lineId, idx, highlighted, lineMagnitude) {
    const selMap = rowMultiSelected.get(lineId);
    const selected = selMap && selMap.has(candidateKey(r));
    const checkbox = r.multiSelectable
      ? '<input type="checkbox" class="match-multi-checkbox" data-line="' + lineId + '" data-idx="' + idx + '"' + (selected ? ' checked' : '') + ' style="margin-right:10px;">'
      : '<span style="display:inline-block;width:24px;"></span>';
    const amountInput = (r.multiSelectable && selected)
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
      + '<button type="button" id="bankrecon-multimatch-confirm-' + line.id + '" class="organizational-btn organizational-btn-primary" ' + (matches && selMap.size >= 2 ? '' : 'disabled') + '>Confirm ' + selMap.size + ' matches</button>'
      + '</div>';
  }

  async function renderMatchTab(line) {
    const el = document.getElementById('bankrecon-row-content-' + line.id);
    if (!el) return;
    let d = rowMatchCandidates.get(line.id);
    if (!d) {
      el.innerHTML = '<p class="organizational-empty">Loading candidates…</p>';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + line.id + '/match-candidates');
      if (!out || !out.res.ok) { el.innerHTML = '<p class="organizational-panel-error">Could not load match candidates.</p>'; return; }
      d = out.data;
      rowMatchCandidates.set(line.id, d);
    }
    // A row may have re-rendered (tab switched away and back) while this fetch was in flight --
    // bail if the Match tab isn't the one currently showing for this line.
    if ((rowActiveTab.get(line.id) || 'match') !== 'match') return;

    // rowFindMatchOpen is toggled by the card header's own "Find & Match" link (wired in the
    // cardsContainer delegated click handler) -- this tab just reflects that state, no second
    // toggle control duplicated in here.
    const rows = candidateRows(d);
    const findMatchOpen = !!rowFindMatchOpen.get(line.id);
    const lineMagnitude = Math.abs(lineSignedCents(line));

    let html;
    if (findMatchOpen) {
      html = rows.length
        ? '<div class="organizational-panel-section-head" style="margin-top:0;">All candidates</div>'
          + '<p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 4px;">Tick multiple bills or multiple invoices to split this line across them -- selected amounts must add up to ' + fmtMoney(lineMagnitude) + ' exactly.</p>'
          + rows.map((r, i) => candidateRowHtml(r, line.id, i, i === 0, lineMagnitude)).join('')
          + '<div id="bankrecon-multimatch-footer-' + line.id + '">' + multiSelectFooterHtml(line, rows) + '</div>'
        : '<p class="organizational-empty">No matching bills, invoices, or recorded payments found within 15 days and 2% of the amount. Use Create instead, or check the amount/date.</p>';
    } else if (rows.length) {
      html = '<div class="organizational-panel-section-head" style="margin-top:0;">Suggested match</div>' + candidateRowHtml(rows[0], line.id, 0, true, lineMagnitude)
        + '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:6px;">Not this one, or need to split across several bills/invoices? Use <b>Find &amp; Match</b> above.</p>';
    } else {
      html = '<p class="organizational-empty">No suggested match. Use <b>Find &amp; Match</b> above to search, or code it directly with Create.</p>';
    }
    // Grant gifts near this amount/date exist but were left out because their grant has no
    // default revenue account set yet. Which GL account a grant posts to is an Accounting
    // decision, not a Funders/Grants one -- so the fix lives right here, not in the grant's
    // Settings panel (which shows this read-only). Setting it here reuses the ordinary grant
    // PATCH endpoint; this is the only place that ever writes it.
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
    // Same reasoning as grant_gifts_excluded_no_account above -- GL coding is set here, in
    // Accounting, never from Membership/Sponsorship directly.
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
          rowMatchCandidates.delete(line.id); // force a fresh candidate fetch, now that the account exists
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

    const confirmBtn = document.getElementById('bankrecon-multimatch-confirm-' + line.id);
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

  // ── Rules view: deterministic, org-defined coding rules (CRUD + list). Posts nothing on its
  // own -- a rule only changes what Reconcile/Cash Coding pre-fill (see applyRuleSuggestion and
  // the Cash Coding "Apply rules to selected" handler above). ──
  let bankRulesCache = [];
  const rulesTbody = document.getElementById('organizational-bankrules-tbody');
  const rulesForm = document.getElementById('organizational-bankrules-form');
  const addRuleBtn = document.getElementById('organizational-bankrules-add');

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
    rulesTbody.innerHTML = bankRulesCache.map((r) => (
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

  // ── Bank Reconciliation tab entry point, called by the accounting-workspace coordinator ──
  async function initBankReconciliation(slug) {
    currentSlug = slug;
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug)]);
    await loadAccountStrip();
    await loadLines();
  }

  window.OrganizationalAccounting.bankReconciliation = { init: initBankReconciliation };
})();
