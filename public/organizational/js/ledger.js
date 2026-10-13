(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const errEl        = document.getElementById('organizational-org-error');
  const tbody         = document.getElementById('organizational-ledger-tbody');
  const filterFrom    = document.getElementById('organizational-ledger-filter-from');
  const filterTo      = document.getElementById('organizational-ledger-filter-to');
  const filterStatus  = document.getElementById('organizational-ledger-filter-status');
  const filterGrant   = document.getElementById('organizational-ledger-filter-grant');
  const filterQ       = document.getElementById('organizational-ledger-filter-q');
  const filterVoided  = document.getElementById('organizational-ledger-filter-voided');
  const exportLink    = document.getElementById('organizational-ledger-export');
  const pageSizeSel   = document.getElementById('organizational-ledger-page-size');
  const rangeEl       = document.getElementById('organizational-ledger-range');
  const prevBtn       = document.getElementById('organizational-ledger-prev');
  const nextBtn       = document.getElementById('organizational-ledger-next');
  const addBtn        = document.getElementById('organizational-ledger-add');

  const panel        = document.getElementById('organizational-ledger-panel');
  const panelBody     = document.getElementById('organizational-ledger-panel-body');
  const detailBack     = document.getElementById('organizational-ledger-page-back');
  const detailNotesEl  = document.getElementById('organizational-ledger-page-notes');
  const panelErrEl     = document.getElementById('organizational-ledger-panel-error');
  const txnListEl      = document.getElementById('organizational-txn-list');
  const txnPage        = document.getElementById('organizational-txn-page');
  const txnPageBody    = document.getElementById('organizational-txn-page-body');
  const txnPageErrEl   = document.getElementById('organizational-txn-page-error');
  const txnPageBack    = document.getElementById('organizational-txn-page-back');

  const policyErrEl = document.getElementById('organizational-approval-policy-error');
  const policyBodyEl = document.getElementById('organizational-approval-policy-body');
  const policyExportLink = document.getElementById('organizational-approval-policy-export-link');
  const flaggedBodyEl = document.getElementById('organizational-flagged-review-body');

  let currentSlug   = '';
  let contactsCache = [];
  let accountsCache = [];
  let programsCache = [];
  let grantsCache   = [];
  let boardDesignationsCache = [];
  let wired         = false;

  const esc         = window.escapeHtml;
  const apiJson      = window.apiJson;
  const fmtMoney      = window.formatMoneyCents;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  let postMode = false;
  let postPushed = false;
  let detailPushed = false;
  function showPanelError(msg) {
    const el = postMode ? txnPageErrEl : panelErrEl;
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
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
    return window.OrganizationalStatusHtml(status, label);
  }

  async function loadAccounts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    savedDefaultBankId = out && out.data && out.data.defaults && out.data.defaults.bank_account_id || null;
    savedGiftAccountId = out && out.data && out.data.defaults && out.data.defaults.individual_gift_account_id || null;
    accountsCache = (out && out.data && (out.data.accounts || out.data)) || [];
    if (!Array.isArray(accountsCache)) accountsCache = [];
    accountsCache = accountsCache.filter((a) => a.is_posting);
  }

  async function loadContacts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents/names?active=true');
    contactsCache = (out && out.res && out.res.ok && Array.isArray(out.data)) ? out.data : [];
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

  function sizeTableArea() {
    const wrap = document.getElementById('organizational-ledger-table-wrap');
    if (!wrap || wrap.offsetParent === null) return;
    const top = wrap.getBoundingClientRect().top;
    let h = Math.max(220, Math.floor(window.innerHeight - top - 16));
    wrap.style.maxHeight = h + 'px';
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0) { h = Math.max(220, h - over); wrap.style.maxHeight = h + 'px'; }
  }

  let pageOffset = 0;
  let pageTotal = 0;
  let listCache = [];
  const expandedIds = new Set();
  let searchTimer = null;

  const SOURCE_LABELS = {
    manual: 'Manual', bank_reconciliation: 'Bank', bill_approval: 'Bill', invoice: 'Invoice', bill_payment: 'Bill payment',
    invoice_payment: 'Invoice payment', fixed_asset_depreciation: 'Depreciation', fixed_asset_disposal: 'Asset disposal',
    recode: 'Recode', gift_posting: 'Gift',
  };
  const ENTRY_LABELS = { receive: 'Receive', spend: 'Spend', transfer: 'Transfer', journal: 'Journal' };
  function sourceLabel(src, entryType) {
    if (src === 'manual' && ENTRY_LABELS[entryType]) return ENTRY_LABELS[entryType];
    if (SOURCE_LABELS[src]) return SOURCE_LABELS[src];
    const t = String(src || '').replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function pageSize() {
    return pageSizeSel ? Number(pageSizeSel.value) || 50 : 50;
  }

  function filterParams() {
    const params = new URLSearchParams();
    if (filterQ && filterQ.value.trim()) params.set('q', filterQ.value.trim());
    if (filterFrom && filterFrom.value) params.set('date_from', filterFrom.value);
    if (filterTo && filterTo.value) params.set('date_to', filterTo.value);
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    if (filterGrant && filterGrant.value) params.set('grant_id', filterGrant.value);
    if (filterVoided && filterVoided.checked) params.set('include_voided', '1');
    return params;
  }

  function base() { return '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger'; }

  const SERVER_SORT_READY = true;
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    enabled: SERVER_SORT_READY,
    server: true,
    columns: [
      null,
      { key: 'date', type: 'date' },
      { key: 'payee', type: 'text' },
      { key: 'source', type: 'text' },
      { key: 'amount', type: 'currency' },
      { key: 'status', type: 'text' },
    ],
    onChange: () => loadTransactions(true),
  }) : null;

  async function loadTransactions(resetPage) {
    if (resetPage === true) pageOffset = 0;
    const params = filterParams();
    if (exportLink) exportLink.href = base() + '/transaction-list/export?' + params.toString();
    params.set('limit', String(pageSize()));
    params.set('offset', String(pageOffset));
    if (sorter) {
      const s = sorter.params();
      if (s.sort) { params.set('sort', s.sort); params.set('dir', s.dir); }
    }
    const out = await apiJson(base() + '/transaction-list?' + params.toString());
    if (!out) return;
    if (!out.res.ok) { showError((out.data && out.data.error) || 'Could not load transactions.'); return; }
    showError('');
    pageTotal = out.data.total || 0;
    listCache = out.data.transactions || [];
    if (!listCache.length && pageOffset > 0 && pageTotal > 0) {
      pageOffset = Math.max(0, Math.floor((pageTotal - 1) / pageSize()) * pageSize());
      return loadTransactions();
    }
    renderRows(listCache);
    renderPager();
    sizeTableArea();
  }

  function renderPager() {
    const size = pageSize();
    const from = pageTotal === 0 ? 0 : pageOffset + 1;
    const to = Math.min(pageOffset + size, pageTotal);
    if (rangeEl) rangeEl.textContent = pageTotal === 0 ? '0 transactions' : from + '–' + to + ' of ' + pageTotal;
    if (prevBtn) prevBtn.disabled = pageOffset <= 0;
    if (nextBtn) nextBtn.disabled = pageOffset + size >= pageTotal;
  }

  function lineRowsHtml(lines) {
    return '<table class="organizational-table" style="margin:0;" aria-label="Transaction lines"><thead><tr><th>Account</th><th>Program</th><th>Grant</th>'
      + '<th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th></tr></thead><tbody>'
      + lines.map((l) => '<tr><td>' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + '</td>'
        + '<td>' + esc(l.program || '') + '</td><td>' + esc(l.grant || '') + '</td>'
        + '<td style="text-align:right;">' + (Number(l.debit_cents) > 0 ? fmtMoney(l.debit_cents) : '') + '</td>'
        + '<td style="text-align:right;">' + (Number(l.credit_cents) > 0 ? fmtMoney(l.credit_cents) : '') + '</td></tr>').join('')
      + '</tbody></table>';
  }

  function renderRows(txns) {
    if (!tbody) return;
    if (!txns.length) {
      const filtered = filterParams().toString() !== '';
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">'
        + (filtered ? 'No transactions match these filters.' : 'No transactions yet. Post a transaction to get started.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = txns.map((t) => {
      const actions = [];
      if (canWrite() && t.status === 'pending_approval') {
        actions.push('<button type="button" class="organizational-btn-icon ledger-approve-btn" data-id="' + t.id + '" title="Approve">✓</button>');
      }
      if (canWrite() && t.status !== 'voided') {
        actions.push('<button type="button" class="organizational-btn-icon ledger-void-btn" data-id="' + t.id + '" title="Void">✕</button>');
      }
      const open = expandedIds.has(t.id);
      const desc = [t.contact_name || t.payee, t.memo].filter(Boolean).join(' — ') || '(no memo)';
      const row = '<tr class="ledger-txn-row" data-id="' + t.id + '">'
        + '<td><button type="button" class="organizational-btn-icon ledger-expand-btn" data-id="' + t.id + '" aria-expanded="' + open + '" title="Show lines" style="font-size:1.125rem;padding:2px 8px;color:var(--organizational-accent, var(--brand-primary));">' + (open ? '▾' : '▸') + '</button></td>'
        + '<td style="white-space:nowrap;">' + esc(t.date) + '</td>'
        + '<td><a href="#" class="ledger-open-link" data-id="' + t.id + '" style="color:var(--organizational-accent, var(--brand-primary));font-weight:500;">' + esc(desc) + '</a>'
        + (t.reference ? ' <span style="color:var(--text-secondary);font-size:0.75rem;">' + esc(t.reference) + '</span>' : '') + '</td>'
        + '<td>' + esc(t.source_label || sourceLabel(t.source, t.entry_type)) + '</td>'
        + (t.status === 'voided'
          ? '<td style="text-align:right;white-space:nowrap;color:var(--text-secondary);" title="Original amount ' + esc(fmtMoney(t.original_total_cents != null ? t.original_total_cents : 0)) + '">' + fmtMoney(0) + '</td>'
          : '<td style="text-align:right;white-space:nowrap;">' + fmtMoney(t.total_cents) + '</td>')
        + '<td>' + statusBadge(t.status) + ' ' + actions.join(' ') + '</td>'
        + '</tr>';
      const lines = open ? '<tr class="ledger-lines-row"><td></td><td colspan="5" style="padding:4px 8px 12px;">' + lineRowsHtml(t.lines) + '<p style="margin:8px 0 0;"><a href="#" class="ledger-open-link" data-id="' + t.id + '" style="font-weight:600;color:var(--organizational-accent, var(--brand-primary));">' + (canWrite() && t.status !== 'voided' ? 'Edit or Void' : 'Open') + '</a></p></td></tr>' : '';
      return row + lines;
    }).join('');
  }

  function sourceHref(link) {
    const root = '/organizational/o/' + encodeURIComponent(currentSlug);
    if (link.type === 'bill') return root + '/purchases?open_bill=' + encodeURIComponent(link.id);
    if (link.type === 'invoice') return root + '/sales?open_invoice=' + encodeURIComponent(link.id);
    if (link.type === 'bank_line') return root + '/banking';
    if (link.type === 'expense_claim') return root + '/expense-claims';
    if (link.type === 'gift') return root + '/gift-postings';
    if (link.type === 'fixed_asset') return root + '/fixed-assets';
    return root + '/accounting';
  }

  function whenText(iso) {
    return iso ? String(iso).slice(0, 10) : '';
  }

  function txnDetailUrl(id) {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('txn', String(id)); else u.searchParams.delete('txn');
    return u.pathname + u.search;
  }
  async function openDetailPanel(id, opts) {
    showPanelError('');
    const titleEl = document.getElementById('organizational-ledger-panel-title');
    if (titleEl) titleEl.textContent = 'Transaction #' + id;
    if (detailBack) detailBack.textContent = detailFromBank ? 'Banking' : 'Transactions';
    try {
      if (opts && opts.push) { window.history.pushState({ txn: id }, '', txnDetailUrl(id)); detailPushed = true; }
      else window.history.replaceState(window.history.state, '', txnDetailUrl(id));
    } catch (_) {}
    panelBody.innerHTML = '<p class="organizational-empty">Loading…</p>';
    panel.classList.add('organizational-panel-is-open');
    panel.hidden = false;
    txnListEl.hidden = true;
    const out = await apiJson(base() + '/transactions/' + encodeURIComponent(id));
    if (!out || !out.res.ok) {
      panelBody.innerHTML = '<p class="organizational-empty">' + esc((out && out.data && out.data.error) || 'Could not load this transaction.') + '</p>';
      return;
    }
    const t = out.data.transaction;
    const rows = [];
    function kv(label, value) { if (value) rows.push('<div style="display:flex;gap:12px;margin-bottom:4px;"><span style="width:110px;color:var(--text-secondary);">' + esc(label) + '</span><span>' + value + '</span></div>'); }
    kv('Date', esc(t.date) + ' (FY' + esc(String(t.fiscal_year)) + ')');
    kv('Status', statusBadge(t.status));
    kv('Source', esc(sourceLabel(t.source, t.entry_type)));
    kv('Journal reason', esc(t.journal_reason));
    if (t.constituent_id) {
      const contactHref = '/organizational/o/' + encodeURIComponent(currentSlug) + '/contacts?contact=' + encodeURIComponent(t.constituent_id) + '&from=transactions';
      kv('Contact', '<a href="' + esc(contactHref) + '">' + esc(t.contact_name) + '</a>');
      if (t.payee && t.payee.trim().toLowerCase() !== String(t.contact_name || '').trim().toLowerCase()) kv('Payee as entered', esc(t.payee));
    } else {
      kv('Payee', esc(t.payee));
    }
    kv('Memo', esc(t.memo));
    kv('Reference', esc(t.reference));
    const links = (out.data.source_links || []).map((l) => '<a href="' + esc(sourceHref(l)) + '">' + esc(l.label) + '</a>');
    kv('Came from', links.join(', '));
    if (t.reverses_transaction_id) kv('Reverses', '<a href="#" class="ledger-open-link" data-id="' + t.reverses_transaction_id + '">#' + esc(String(t.reverses_transaction_id)) + '</a>');
    if ((t.reversed_by || []).length) kv('Reversed by', t.reversed_by.map((x) => '<a href="#" class="ledger-open-link" data-id="' + x + '">#' + esc(String(x)) + '</a>').join(', '));
    const trail = [];
    trail.push('Entered ' + whenText(t.created_at) + (t.created_by ? ' by ' + esc(t.created_by) : ''));
    if (t.approved_at) trail.push('Approved ' + whenText(t.approved_at) + (t.approved_by ? ' by ' + esc(t.approved_by) : ''));
    if (t.voided_at) trail.push('Voided ' + whenText(t.voided_at) + (t.voided_by ? ' by ' + esc(t.voided_by) : '') + (t.void_reason ? ': ' + esc(t.void_reason) : ''));
    const actions = [];
    if (canWrite() && t.status === 'pending_approval') actions.push('<button type="button" class="organizational-btn organizational-btn-primary ledger-approve-btn" data-id="' + t.id + '">Approve</button>');
    const ed = out.data.edit || {};
    lastDetail = out.data;
    if (canWrite() && ed.allowed) actions.push('<button type="button" class="organizational-btn organizational-btn-outline ledger-edit-btn" data-id="' + t.id + '">Edit</button>');
    const rc = out.data.reconciliation || {};
    lastDetail.statementLineIds = rc.statement_line_ids || [];
    const isPayment = t.source === 'bill_payment' || t.source === 'invoice_payment';
    const bankOnly = isPayment && !detailFromBank;
    if (canWrite() && t.status !== 'voided' && !bankOnly) {
      if (rc.reconciled) {
        actions.push('<button type="button" class="organizational-btn organizational-btn-outline ledger-unrec-btn" data-id="' + t.id + '">Unreconcile</button>');
        actions.push('<button type="button" class="organizational-btn organizational-btn-outline ledger-voidreturn-btn" data-id="' + t.id + '">Void and return</button>');
      } else {
        actions.push('<button type="button" class="organizational-btn organizational-btn-outline ledger-void-btn" data-id="' + t.id + '">Void</button>');
      }
    }
    for (const g of (out.data.edits || [])) {
      trail.push('Edited ' + whenText(g.at) + (g.by ? ' by ' + esc(g.by) : '') + ': '
        + g.changes.map((c) => esc(c.field) + ' ' + esc(c.from == null ? '(none)' : c.from) + ' → ' + esc(c.to == null ? '(none)' : c.to)).join('; ')
        + (g.reason ? ' (reason: ' + esc(g.reason) + ')' : ''));
    }
    const bankOnlyNote = canWrite() && t.status !== 'voided' && bankOnly
      ? '<p class="organizational-hint" style="margin-top:12px;">A payment is unreconciled or voided in Banking, in the Register.</p>' : '';
    const recNote = bankOnlyNote + (canWrite() && t.status !== 'voided' && rc.reconciled && !bankOnly
      ? '<p class="organizational-hint" style="margin-top:12px;">Matched to a bank line. Unreconcile keeps this entry and sends the bank line back to Reconcile. Void and return voids this entry and sends the bank line back.</p>' : '');
    const editNote = recNote + (canWrite() && t.status !== 'voided' && ed.allowed === false && ed.reason
      ? '<p class="organizational-hint" style="margin-top:12px;">' + esc(ed.reason) + '</p>' : '');
    panelBody.innerHTML = '<div class="organizational-panel-fields">' + rows.join('')
      + '<div class="organizational-panel-section-head">Line items</div>' + lineRowsHtml(out.data.lines)
      + '<div class="organizational-panel-section-head">History</div><p class="organizational-hint">' + trail.join('<br>') + '</p></div>'
      + editNote
      + '<div id="ledger-detail-docs" style="margin-top:16px;">' + (window.OrganizationalDocumentAttach
        ? window.OrganizationalDocumentAttach.html('ledger_transaction', ['expense_receipt', 'vendor_bill', 'customer_invoice', 'bank_statement', 'contract_lease', 'other'], { readOnly: !canWrite() }) : '') + '</div>'
      + (actions.length ? '<div class="organizational-panel-actions" style="margin:16px 0 0;padding:14px 0;bottom:0;">' + actions.join(' ') + '</div>' : '');
    const docsEl = document.getElementById('ledger-detail-docs');
    if (docsEl && window.OrganizationalDocumentAttach) window.OrganizationalDocumentAttach.wire(docsEl, { slug: currentSlug, sourceRefType: 'ledger_transaction', sourceRefId: id, readOnly: !canWrite() });
    if (detailNotesEl && window.OrganizationalRecordNotes) window.OrganizationalRecordNotes.mount(detailNotesEl, { slug: currentSlug, type: 'ledger_transaction', id, historyLink: false });
  }

  let lastDetail = null;
  let detailFromBank = false;

  function renderEditForm() {
    const data = lastDetail;
    if (!data) return;
    const t = data.transaction;
    const ed = data.edit || {};
    const titleEl = document.getElementById('organizational-ledger-panel-title');
    if (titleEl) titleEl.textContent = 'Edit transaction #' + t.id;
    const locked = new Set(ed.locked_account_ids || []);
    const limited = !!ed.limited;
    const memoOnly = !!ed.memo_only;
    const canEditAmounts = !memoOnly && !limited && !ed.reconciled;
    const lineRows = memoOnly ? '' : data.lines.map((l, i) => {
      const fixedLine = limited && !l.limited_editable;
      const bankSide = (ed.reconciled && locked.has(l.account_id)) || fixedLine;
      const amt = Number(l.debit_cents) > 0 ? 'Debit ' + fmtMoney(l.debit_cents) : 'Credit ' + fmtMoney(l.credit_cents);
      return '<div class="ledger-edit-line" data-line="' + l.id + '" style="border-top:1px solid var(--border-subtle);padding:8px 0;">'
        + '<div style="display:flex;justify-content:space-between;font-size:0.8125rem;color:var(--text-secondary);margin-bottom:4px;"><span>Line ' + (i + 1) + (fixedLine ? ' (set by the ' + esc(ed.source_label || 'source record') + ', not changed here)' : bankSide ? ' (bank side, account fixed while reconciled)' : '') + '</span><span>' + esc(amt) + '</span></div>'
        + '<div class="organizational-alloc-line-row">'
        + '<select class="organizational-select ledger-edit-account"' + (bankSide ? ' disabled' : '') + ' aria-label="Account">' + accountOptions(l.account_id, limited && !fixedLine ? l.account_type : null) + '</select>'
        + '<select class="organizational-select ledger-edit-program"' + (fixedLine ? ' disabled' : '') + ' aria-label="Program">' + programOptions(l.program_id) + '</select>'
        + '<select class="organizational-select ledger-edit-grant"' + (fixedLine ? ' disabled' : '') + ' aria-label="Grant">' + grantOptions(l.grant_id) + '</select>'
        + (canEditAmounts ? '<label class="organizational-label" style="flex:1 1 100%;">' + (Number(l.debit_cents) > 0 ? 'Debit' : 'Credit') + ' amount<input type="number" step="0.01" min="0.01" class="organizational-input ledger-edit-amount" data-side="' + (Number(l.debit_cents) > 0 ? 'debit' : 'credit') + '" value="' + (Number(Number(l.debit_cents) > 0 ? l.debit_cents : l.credit_cents) / 100).toFixed(2) + '"></label>' : '')
        + '<input type="text" class="organizational-input ledger-edit-linememo" maxlength="300" placeholder="Line description (optional)" value="' + esc(l.memo || '') + '" style="flex:1 1 100%;">'
        + '</div></div>';
    }).join('');
    panelBody.innerHTML = '<div class="organizational-panel-fields">'
      + '<p class="organizational-hint" style="margin-top:0;">'
      + (memoOnly ? 'This entry is voided, so its numbers are fixed. You can still correct its memo and reference. ' : '')
      + (memoOnly ? '' : limited ? 'This entry was created by ' + esc(ed.source_label || 'another part of Accounting') + '. You can correct the account, program and grant on its income and expense lines, and every description, its memo and its reference. The date, amounts and contact are changed there; the source record keeps its own account. '
        : (ed.reconciled ? 'This entry is matched to a bank line, so its date and the bank-side account stay as they are. Unreconcile it first to change those. ' : ''))
      + (memoOnly || canEditAmounts ? '' : 'Amounts do not change here; void the entry and enter the corrected one for that.') + '</p>'
      + '<div class="organizational-panel-field-row">'
      + (memoOnly ? '' : '<label class="organizational-label" style="flex:1">Date<input type="date" id="ledger-edit-date" class="organizational-input" value="' + esc(t.date) + '"' + (ed.reconciled || limited ? ' disabled' : '') + '></label>')
      + '<label class="organizational-label" style="flex:1">Reference #<input type="text" id="ledger-edit-ref" class="organizational-input" maxlength="100" value="' + esc(t.reference || '') + '"></label>'
      + '</div>'
      + (limited || memoOnly ? '' : '<div class="organizational-panel-field-full"><label class="organizational-label">Contact<div id="ledger-edit-contact-field" class="organizational-contact-picker-mount"></div></label></div>'
        + '<div class="organizational-panel-field-full"><label class="organizational-label">Payee as entered<input type="text" id="ledger-edit-payee" class="organizational-input" maxlength="300" value="' + esc(t.payee || '') + '"></label></div>')
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Memo<input type="text" id="ledger-edit-memo" class="organizational-input" maxlength="500" value="' + esc(t.memo || '') + '"></label></div>'
      + (memoOnly ? '' : '<div class="organizational-panel-section-head">Line items</div>' + lineRows)
      + '<div class="organizational-panel-field-full" style="margin-top:12px;"><label class="organizational-label">Reason for the change (optional) <span class="organizational-hint">(needed if the date changes)</span><input type="text" id="ledger-edit-reason" class="organizational-input" maxlength="300" value="Correction"></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions" style="margin:16px 0 0;padding:14px 0;bottom:0;">'
      + '<button type="button" class="organizational-btn organizational-btn-primary ledger-edit-save" data-id="' + t.id + '">Save changes</button> '
      + '<button type="button" class="organizational-btn organizational-btn-outline ledger-edit-cancel" data-id="' + t.id + '">Cancel</button></div>';
    if (window.OrganizationalSelectSearch) window.OrganizationalSelectSearch.enhanceIn(panelBody, 'select.ledger-edit-account, select.ledger-edit-program, select.ledger-edit-grant');
    const amountInputs = panelBody.querySelectorAll('.ledger-edit-amount');
    if (amountInputs.length === 2) {
      amountInputs.forEach((el, i) => el.addEventListener('input', () => { amountInputs[1 - i].value = el.value; }));
    }
    const field = document.getElementById('ledger-edit-contact-field');
    if (field && window.OrganizationalContactPicker) {
      window.OrganizationalContactPicker.mount(field, {
        getCache: () => contactsCache, role: 'vendor', label: 'contact', slug: currentSlug,
        valueElementId: 'ledger-edit-contact', selectedId: t.constituent_id,
      });
    }
  }

  async function saveEdit(id) {
    showPanelError('');
    const val = (elId) => { const el = document.getElementById(elId); return el ? el.value : ''; };
    const reason = val('ledger-edit-reason').trim();
    const body = {
      reason, memo: val('ledger-edit-memo'), reference: val('ledger-edit-ref'),
      lines: [...panelBody.querySelectorAll('.ledger-edit-line')].map((row) => {
        const acct = row.querySelector('.ledger-edit-account');
        if (row.querySelector('.ledger-edit-program').disabled) {
          return { id: Number(row.getAttribute('data-line')), line_memo: row.querySelector('.ledger-edit-linememo').value };
        }
        const amtEl = row.querySelector('.ledger-edit-amount');
        const cents = amtEl ? Math.round(Number(amtEl.value) * 100) : null;
        return {
          id: Number(row.getAttribute('data-line')),
          ...(amtEl ? (amtEl.getAttribute('data-side') === 'debit' ? { debit_cents: cents } : { credit_cents: cents }) : {}),
          account_id: acct && !acct.disabled ? Number(acct.value) : undefined,
          program_id: Number(row.querySelector('.ledger-edit-program').value),
          grant_id: row.querySelector('.ledger-edit-grant').value || null,
          line_memo: row.querySelector('.ledger-edit-linememo').value,
        };
      }),
    };
    const dateEl = document.getElementById('ledger-edit-date');
    if (dateEl && !dateEl.disabled) body.date = dateEl.value;
    if (document.getElementById('ledger-edit-payee')) { body.payee = val('ledger-edit-payee'); body.constituent_id = val('ledger-edit-contact') || null; }
    const out = await apiJson(base() + '/transactions/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) });
    if (!out) return;
    if (out.res.ok) {
      await loadTransactions();
      document.dispatchEvent(new CustomEvent('ledger:changed'));
      await openDetailPanel(id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save the change.');
    }
  }

  async function approveTransaction(id) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions/' + id + '/approve', { method: 'POST' });
    if (!out) return;
    if (out.res.ok) {
      await loadTransactions();
      document.dispatchEvent(new CustomEvent('ledger:changed'));
      if (panel.classList.contains('organizational-panel-is-open')) await openDetailPanel(id);
    } else {
      showError((out.data && out.data.message) || (out.data && out.data.error) || 'Could not approve transaction.');
    }
  }

  function askPanelReason(text, onConfirm) {
    const old = document.getElementById('ledger-reason-bar');
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = 'ledger-reason-bar';
    bar.style.cssText = 'margin-top:12px;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--surface-page);';
    bar.innerHTML = '<p class="organizational-hint" style="margin:0 0 6px;">' + esc(text) + '</p>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '<input type="text" id="ledger-reason-input" class="organizational-input" maxlength="300" placeholder="Reason (required)" aria-label="Reason" style="flex:1;min-width:200px;">'
      + '<button type="button" id="ledger-reason-ok" class="organizational-btn organizational-btn-primary">Confirm</button>'
      + '<button type="button" id="ledger-reason-cancel" class="organizational-btn organizational-btn-outline">Cancel</button></div>';
    panelBody.appendChild(bar);
    const input = document.getElementById('ledger-reason-input');
    input.focus();
    const go = async () => {
      const reason = input.value.trim();
      if (!reason) { input.style.borderColor = 'var(--red)'; input.focus(); return; }
      document.getElementById('ledger-reason-ok').disabled = true;
      await onConfirm(reason);
    };
    document.getElementById('ledger-reason-ok').addEventListener('click', go);
    document.getElementById('ledger-reason-cancel').addEventListener('click', () => bar.remove());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') bar.remove(); });
  }

  async function afterEntryChange(id) {
    await loadTransactions();
    document.dispatchEvent(new CustomEvent('ledger:changed'));
    if (panel.classList.contains('organizational-panel-is-open')) await openDetailPanel(id);
  }

  async function voidTransaction(id) {
    id = Number(id);
    if (!(lastDetail && lastDetail.transaction && lastDetail.transaction.id === id && panel.classList.contains('organizational-panel-is-open'))) {
      await openDetailPanel(id);
    }
    if (lastDetail && lastDetail.reconciliation && lastDetail.reconciliation.reconciled) return;
    if (lastDetail && lastDetail.transaction && (lastDetail.transaction.source === 'bill_payment' || lastDetail.transaction.source === 'invoice_payment') && !detailFromBank) return;
    askPanelReason('Void this entry. It stays in the history and drops out of balances.', async (reason) => {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions/' + id + '/void', {
        method: 'POST', body: JSON.stringify({ void_reason: reason }),
      });
      if (!out) return;
      if (out.res.ok) await afterEntryChange(id);
      else showPanelError((out.data && out.data.message) || (out.data && out.data.error) || 'Could not void transaction.');
    });
  }

  function unreconcileFromPanel(id, keepEntry) {
    const lineIds = (lastDetail && lastDetail.statementLineIds) || [];
    if (!lineIds.length) return;
    askPanelReason(keepEntry
      ? 'Unreconcile. This entry stays in the books as not reconciled and the bank line goes back to Reconcile, where this entry is offered as a match.'
      : 'Void and return. This entry is voided (or reversed, if its fiscal year is locked) and the bank line goes back to Reconcile to be coded again.',
    async (reason) => {
      let failed = '';
      for (const lid of lineIds) {
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bank-statement-lines/' + lid + '/unreconcile', {
          method: 'POST', body: JSON.stringify(keepEntry ? { reason, keep_entry: true } : { reason }),
        });
        if (!out || !out.res.ok) { failed = (out && out.data && (out.data.message || out.data.error)) || 'Could not unreconcile.'; break; }
      }
      if (failed) showPanelError(failed); else await afterEntryChange(id);
    });
  }

  function accountOptions(selectedId, onlyType) {
    return '<option value="">— Account —</option>' + accountsCache.filter((a) => !onlyType
      || Number(a.id) === Number(selectedId)
      || (a.type === onlyType && a.is_posting !== false && !a.is_cash_account && !a.is_system_clearing_account && !a.is_system_ar_account && !a.is_system_ap_account)
    ).map((a) =>
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

  let canWriteFlag = null;
  function canWrite() {
    if (canWriteFlag !== null) return canWriteFlag;
    const org = window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    const role = String((org && org.role) || '').toLowerCase();
    return role === 'admin' || role === 'finance' || role === 'staff';
  }

  const ENTRY_TYPES = [
    { key: 'receive', label: 'Receive money' },
    { key: 'spend', label: 'Spend money' },
    { key: 'transfer', label: 'Transfer' },
    { key: 'journal', label: 'Journal' },
  ];
  let entryType = 'receive';

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function lastDateKey() { return 'ledger-last-date:' + currentSlug; }
  function defaultEntryDate() {
    try { return sessionStorage.getItem(lastDateKey()) || todayIso(); } catch (_) { return todayIso(); }
  }
  async function suggestReference() {
    const refEl = document.getElementById('ledger-txn-ref');
    const bank = val('ledger-bank-account');
    if (entryType !== 'spend' || !refEl || !bank || refEl.dataset.touched) return;
    const out = await apiJson(base() + '/next-reference?bank_account_id=' + encodeURIComponent(bank));
    if (out && out.res.ok && !refEl.dataset.touched && document.getElementById('ledger-bank-account').value === bank) refEl.value = out.data.reference || '';
  }
  function rememberDate(date) {
    try { if (date) sessionStorage.setItem(lastDateKey(), date); } catch (_) {}
  }

  function lastBankKey() { return 'ledger-last-bank:' + currentSlug; }
  let savedDefaultBankId = null;
  let savedGiftAccountId = null;
  function suggestGiftAccount(contact) {
    if (entryType !== 'receive' || !savedGiftAccountId || !contact || contact.kind !== 'individual') return;
    const sel = document.querySelector('#ledger-lines-wrap [data-post-line] .ledger-line-account');
    if (!sel || sel.value) return;
    if (accountsCache.some((a) => Number(a.id) === savedGiftAccountId)) sel.value = String(savedGiftAccountId);
  }
  function defaultBankId() {
    const cash = accountsCache.filter((a) => a.is_cash_account);
    if (savedDefaultBankId && cash.some((a) => Number(a.id) === savedDefaultBankId)) return savedDefaultBankId;
    if (cash.length === 1) return Number(cash[0].id);
    try {
      const last = Number(localStorage.getItem(lastBankKey()));
      if (cash.some((a) => Number(a.id) === last)) return last;
    } catch (_) {}
    return null;
  }
  function rememberBank(id) {
    try { if (id) localStorage.setItem(lastBankKey(), String(id)); } catch (_) {}
  }
  function cashAccountOptions(selectedId) {
    return '<option value="">— Bank account —</option>' + accountsCache.filter((a) => a.is_cash_account).map((a) =>
      '<option value="' + a.id + '"' + (selectedId && Number(a.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
  }
  let showAllAccounts = false;
  function detailAccountOptions(selectedId) {
    const wanted = entryType === 'receive' ? 'income' : entryType === 'spend' ? 'expense' : null;
    return '<option value="">— Account —</option>' + accountsCache
      .filter((a) => !a.is_cash_account && (showAllAccounts || !wanted || a.type === wanted || Number(a.id) === Number(selectedId)))
      .map((a) => '<option value="' + a.id + '"' + (Number(a.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>').join('');
  }
  function defaultProgramId() {
    const g = programsCache.find((p) => /general|admin/i.test(p.name || ''));
    return (g || programsCache[0] || {}).id;
  }

  const SIMPLE_GRID = 'minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.2fr) 130px 28px';
  const JOURNAL_GRID = 'minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) 110px 110px 28px';
  function lineHeadHtml(cols, grid) {
    return '<div style="display:grid;grid-template-columns:' + grid + ';gap:12px;align-items:center;font-size:0.75rem;color:var(--text-secondary);font-weight:600;padding-bottom:2px;border-bottom:1px solid var(--border);">'
      + cols.map((c) => '<span' + (c.right ? ' style="text-align:right;"' : '') + '>' + c.t + '</span>').join('') + '</div>';
  }
  function simpleLineRowHtml() {
    return '<div data-post-line style="display:grid;grid-template-columns:' + SIMPLE_GRID + ';gap:12px;align-items:center;padding:3px 0;">'
      + '<select class="organizational-select ledger-line-account">' + detailAccountOptions() + '</select>'
      + '<select class="organizational-select ledger-line-program">' + programOptions() + '</select>'
      + '<select class="organizational-select ledger-line-grant">' + grantOptions() + '</select>'
      + '<input type="number" class="organizational-input ledger-line-amount" placeholder="0.00" min="0" step="0.01" style="text-align:right;">'
      + '<button type="button" class="organizational-btn-icon ledger-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function journalLineRowHtml() {
    return '<div data-post-line style="padding:3px 0;">'
      + '<div style="display:grid;grid-template-columns:' + JOURNAL_GRID + ';gap:12px;align-items:center;">'
      + '<select class="organizational-select ledger-line-account">' + accountOptions() + '</select>'
      + '<select class="organizational-select ledger-line-program">' + programOptions() + '</select>'
      + '<select class="organizational-select ledger-line-grant">' + grantOptions() + '</select>'
      + '<select class="organizational-select ledger-line-board-designation" title="Board designation">' + boardDesignationOptions() + '</select>'
      + '<input type="number" class="organizational-input ledger-line-debit" placeholder="0.00" min="0" step="0.01" style="text-align:right;">'
      + '<input type="number" class="organizational-input ledger-line-credit" placeholder="0.00" min="0" step="0.01" style="text-align:right;">'
      + '<button type="button" class="organizational-btn-icon ledger-remove-line" title="Remove">✕</button>'
      + '</div>'
      + '<input type="text" class="organizational-input ledger-line-memo" placeholder="Line description (optional)" maxlength="300" style="margin-top:4px;width:100%;">'
      + '</div>';
  }

  function commonFieldsHtml(payeeLabel, payeeHtml, memoLabel) {
    return '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Date *<input type="date" id="ledger-txn-date" class="organizational-input" value="' + defaultEntryDate() + '" required></label>'
      + '<label class="organizational-label" style="flex:1">Reference #<input type="text" id="ledger-txn-ref" class="organizational-input" maxlength="100"></label>'
      + '</div>'
      + (payeeHtml ? payeeHtml : payeeLabel ? '<div class="organizational-panel-field-full"><label class="organizational-label">' + payeeLabel + '<input type="text" id="ledger-txn-payee" class="organizational-input" maxlength="300"></label></div>' : '')
      + '<div class="organizational-panel-field-full"><label class="organizational-label">' + (memoLabel || 'Memo') + '<input type="text" id="ledger-txn-memo" class="organizational-input" maxlength="500"></label></div>';
  }

  function entryFormHtml() {
    if (entryType === 'receive' || entryType === 'spend') {
      const rec = entryType === 'receive';
      return '<div class="organizational-panel-fields">'
        + '<div class="organizational-panel-field-full"><label class="organizational-label">' + (rec ? 'Deposit to *' : 'Paid from *')
        + '<select id="ledger-bank-account" class="organizational-select">' + cashAccountOptions(defaultBankId()) + '</select></label></div>'
        + commonFieldsHtml('', '<div class="organizational-panel-field-full"><label class="organizational-label">' + (rec ? 'Received from' : 'Paid to')
          + '<div id="ledger-contact-field" class="organizational-contact-picker-mount"></div></label></div>')
        + '<div class="organizational-panel-section-head">' + (rec ? 'What it was for' : 'What it was spent on')
        + ' <label style="font-weight:400;font-size:0.8125rem;margin-left:12px;"><input type="checkbox" id="ledger-show-all-accounts"' + (showAllAccounts ? ' checked' : '') + '> Show all accounts</label></div>'
        + lineHeadHtml([{ t: 'Account' }, { t: 'Program' }, { t: 'Grant' }, { t: 'Amount', right: true }, { t: '' }], SIMPLE_GRID)
        + '<div id="ledger-lines-wrap">' + simpleLineRowHtml() + '</div>'
        + '<div style="display:flex;align-items:center;gap:12px;margin-top:8px">'
        + '<button type="button" id="ledger-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem">+ Add line</button>'
        + '<span id="ledger-lines-total" style="font-size:0.8125rem;color:var(--text-secondary)"></span></div>'
        + (rec ? '<div id="ledger-expected" hidden style="margin-top:14px;padding:10px 12px;border:1px solid var(--border);border-left:3px solid var(--organizational-accent);border-radius:var(--radius-sm);background:var(--surface-page);"></div>' : '')
        + '</div>';
    }
    if (entryType === 'transfer') {
      return '<div class="organizational-panel-fields">'
        + '<div class="organizational-panel-field-row">'
        + '<label class="organizational-label" style="flex:1">From *<select id="ledger-from-account" class="organizational-select">' + cashAccountOptions(defaultBankId()) + '</select></label>'
        + '<label class="organizational-label" style="flex:1">To *<select id="ledger-to-account" class="organizational-select">' + cashAccountOptions() + '</select></label>'
        + '</div>'
        + commonFieldsHtml('')
        + '<div class="organizational-panel-field-full">'
        + '<label class="organizational-label">Amount *<input type="number" id="ledger-transfer-amount" class="organizational-input" min="0" step="0.01"></label>'
        + '</div></div>';
    }
    return '<div class="organizational-panel-fields">'
      + '<p class="organizational-hint" style="margin-top:0;">A journal posts raw debits and credits and skips the bill, invoice and bank flows. Use Receive, Spend or Transfer when you can. Every journal needs a reason and shows up in the flagged review.</p>'
      + commonFieldsHtml('', '', 'Description')
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Reason for this journal * <span class="organizational-hint">(at least 10 characters)</span>'
      + '<textarea id="ledger-journal-reason" class="organizational-input" rows="2" maxlength="1000"></textarea></label></div>'
      + '<div style="border-top:1px solid var(--border);margin:12px 0 8px;"></div>'
      + lineHeadHtml([{ t: 'Account' }, { t: 'Program' }, { t: 'Grant' }, { t: 'Board designation' }, { t: 'Debit', right: true }, { t: 'Credit', right: true }, { t: '' }], JOURNAL_GRID)
      + '<div id="ledger-lines-wrap">' + journalLineRowHtml() + journalLineRowHtml() + '</div>'
      + '<div style="display:flex;align-items:center;gap:12px;margin-top:8px">'
      + '<button type="button" id="ledger-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem">+ Add line</button>'
      + '<span id="ledger-lines-total" style="font-size:0.8125rem;color:var(--text-secondary)"></span></div>'
      + '</div>';
  }

  function renderPostPanelBody() {
    return '<div id="ledger-entry-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'
      + ENTRY_TYPES.map((t) => '<button type="button" class="organizational-btn ' + (t.key === entryType ? '' : 'organizational-btn-outline') + ' ledger-entry-tab" data-type="' + t.key + '" aria-pressed="' + (t.key === entryType) + '" style="font-size:0.8125rem;">' + t.label + '</button>').join('')
      + '</div>'
      + '<div id="ledger-entry-form">' + entryFormHtml() + '</div>'
      + '<div class="organizational-panel-actions" style="margin:16px 0 0;padding:14px 0;bottom:0;">'
      + '<button type="button" id="ledger-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>'
      + '<button type="button" id="ledger-save" class="organizational-btn organizational-btn-primary">' + (entryType === 'journal' ? 'Post journal' : 'Save') + '</button>'
      + '</div>';
  }

  function refreshLinesTotal() {
    const total = document.getElementById('ledger-lines-total');
    if (!total) return;
    if (entryType === 'journal') {
      let debitSum = 0, creditSum = 0;
      document.querySelectorAll('.ledger-line-debit').forEach((i) => { debitSum += parseFloat(i.value || 0) || 0; });
      document.querySelectorAll('.ledger-line-credit').forEach((i) => { creditSum += parseFloat(i.value || 0) || 0; });
      const ok = Math.abs(debitSum - creditSum) < 0.005;
      total.textContent = 'Debits: $' + debitSum.toFixed(2) + '  Credits: $' + creditSum.toFixed(2) + (ok ? '  ✓ balanced' : '  — does not balance yet');
      total.style.color = ok ? 'var(--organizational-status-success,#16a34a)' : 'var(--organizational-status-danger,#dc2626)';
    } else {
      let sum = 0;
      document.querySelectorAll('.ledger-line-amount').forEach((i) => { sum += parseFloat(i.value || 0) || 0; });
      total.textContent = 'Total: $' + sum.toFixed(2);
      total.style.color = '';
    }
  }

  function switchEntryType(type) {
    entryType = type;
    showAllAccounts = false;
    showPanelError('');
    (postMode ? txnPageBody : panelBody).innerHTML = renderPostPanelBody();
    wirePostPanel();
    if (postMode) { try { window.history.replaceState(window.history.state, '', newTxnUrl(type)); } catch (_) {} }
  }

  let appliedExpected = null;
  let expectedTimer = null;
  let expectedSeq = 0;

  function receiveAmountCents() {
    return Array.from(document.querySelectorAll('#ledger-lines-wrap .ledger-line-amount')).reduce((t, el) => {
      const c = inputToCents(el.value);
      return t + (Number.isFinite(c) ? c : 0);
    }, 0);
  }

  function scheduleExpectedLookup() {
    if (entryType !== 'receive') return;
    clearTimeout(expectedTimer);
    expectedTimer = setTimeout(() => lookupExpected(''), 450);
  }

  async function lookupExpected(q) {
    const box = document.getElementById('ledger-expected');
    if (!box || entryType !== 'receive') return;
    const amount = receiveAmountCents();
    if (!amount && !q) { box.hidden = true; box.innerHTML = ''; appliedExpected = null; return; }
    const seq = ++expectedSeq;
    const params = new URLSearchParams({ amount_cents: String(amount), date: val('ledger-txn-date') || '', text: (val('ledger-contact-input') + ' ' + val('ledger-txn-memo')).trim(), q: q || '' });
    const out = await apiJson(base() + '/expected-gifts?' + params.toString());
    if (seq !== expectedSeq || !out || !out.res.ok) return;
    renderExpected(box, out.data.candidates || [], q || '');
  }

  function renderExpected(box, cands, q) {
    const keep = appliedExpected && cands.some((c) => c.kind === appliedExpected.kind && c.id === appliedExpected.id) ? appliedExpected : null;
    appliedExpected = keep;
    if (!cands.length && !q) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const radio = (value, label, sub, checked) => '<label style="display:flex;gap:8px;align-items:flex-start;margin:4px 0;font-size:0.875rem;"><input type="radio" name="ledger-expected-choice" value="' + esc(value) + '"' + (checked ? ' checked' : '') + ' style="width:auto;margin-top:3px;"><span>' + label + (sub ? '<br><span class="organizational-hint">' + sub + '</span>' : '') + '</span></label>';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">' + (cands.length ? 'This looks like something Funding expects' : 'Nothing found for that donor') + '</div>'
      + cands.map((c) => radio(c.kind + ':' + c.id,
        esc(c.label) + ' &middot; <b>' + fmtMoney(c.amount_cents) + '</b>',
        esc(c.reasons.join(', ')) + (c.kind === 'pledge_installment' ? ' &middot; the receipt reduces the pledge receivable; it is not new revenue' : ''),
        keep && keep.kind === c.kind && keep.id === c.id)).join('')
      + radio('none', 'No, this is a new gift', '', !keep)
      + '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;"><input type="text" id="ledger-expected-q" class="organizational-input" placeholder="Search by donor name (for example the pledge of someone an estate is paying for)" value="' + esc(q) + '" style="flex:1;">'
      + '<button type="button" id="ledger-expected-search" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;">Search</button></div>';
    box.querySelectorAll('input[name="ledger-expected-choice"]').forEach((r) => r.addEventListener('change', () => {
      const v = box.querySelector('input[name="ledger-expected-choice"]:checked').value;
      const c = cands.find((x) => x.kind + ':' + x.id === v);
      appliedExpected = c ? { kind: c.kind, id: c.id, amount_cents: c.amount_cents } : null;
      const wrap = document.getElementById('ledger-lines-wrap');
      if (wrap) { const inst = !!(c && c.kind === 'pledge_installment'); wrap.style.opacity = inst ? '0.45' : ''; wrap.style.pointerEvents = inst ? 'none' : ''; }
    }));
    const search = box.querySelector('#ledger-expected-search');
    const qEl = box.querySelector('#ledger-expected-q');
    if (search) search.addEventListener('click', () => lookupExpected(qEl.value.trim()));
    if (qEl) qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookupExpected(qEl.value.trim()); } });
  }

  function wirePostPanel() {
    const linesWrap = document.getElementById('ledger-lines-wrap');
    const addLineBtn = document.getElementById('ledger-add-line');
    const cancelBtn = document.getElementById('ledger-cancel');
    const saveBtn = document.getElementById('ledger-save');
    const tabs = document.getElementById('ledger-entry-tabs');
    const minLines = entryType === 'journal' ? 2 : 1;
    const refEl = document.getElementById('ledger-txn-ref');
    const bankEl = document.getElementById('ledger-bank-account');
    if (refEl && bankEl && entryType === 'spend') {
      refEl.addEventListener('input', () => { refEl.dataset.touched = '1'; });
      bankEl.addEventListener('change', suggestReference);
      suggestReference();
    }

    if (tabs) tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.ledger-entry-tab');
      if (b && b.getAttribute('data-type') !== entryType) switchEntryType(b.getAttribute('data-type'));
    });
    const searchable = (root) => { if (window.OrganizationalSelectSearch) window.OrganizationalSelectSearch.enhanceIn(root, 'select.ledger-line-account, select.ledger-line-program, select.ledger-line-grant'); };
    searchable(linesWrap);
    if (addLineBtn) addLineBtn.addEventListener('click', () => {
      linesWrap.insertAdjacentHTML('beforeend', entryType === 'journal' ? journalLineRowHtml() : simpleLineRowHtml());
      searchable(linesWrap);
      refreshLinesTotal();
    });
    if (linesWrap) {
      linesWrap.addEventListener('click', (e) => {
        const rm = e.target.closest('.ledger-remove-line');
        if (rm && linesWrap.children.length > minLines) { rm.closest('[data-post-line]').remove(); refreshLinesTotal(); }
      });
      linesWrap.addEventListener('input', (e) => {
        if (/ledger-line-(debit|credit|amount)/.test(e.target.className)) refreshLinesTotal();
      });
    }
    const showAllBox = document.getElementById('ledger-show-all-accounts');
    if (showAllBox) showAllBox.addEventListener('change', () => {
      showAllAccounts = showAllBox.checked;
      document.querySelectorAll('#ledger-lines-wrap .ledger-line-account').forEach((sel) => {
        const current = sel.value;
        sel.innerHTML = detailAccountOptions(current);
        sel.value = current;
      });
    });
    const contactField = document.getElementById('ledger-contact-field');
    if (contactField && window.OrganizationalContactPicker) {
      window.OrganizationalContactPicker.mount(contactField, {
        getCache: () => contactsCache, role: entryType === 'receive' ? 'donor' : 'vendor', label: 'contact',
        slug: currentSlug, valueElementId: 'ledger-contact', onSelect: suggestGiftAccount,
      });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', () => (postMode ? leavePostPage() : closePostPanel()));
    if (saveBtn) saveBtn.addEventListener('click', savePostTransaction);
    appliedExpected = null;
    const formEl = document.getElementById('ledger-entry-form');
    if (formEl && entryType === 'receive') {
      const onChange = (e) => { if (!e.target.closest('#ledger-expected')) scheduleExpectedLookup(); };
      formEl.addEventListener('input', onChange);
      formEl.addEventListener('change', onChange);
      formEl.addEventListener('focusout', onChange);
    }
    refreshLinesTotal();
  }

  function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  async function savePostTransaction() {
    showPanelError('');
    if (!val('ledger-txn-date')) { showPanelError('Date is required.'); return; }
    const body = {
      entry_type: entryType,
      transaction_date: val('ledger-txn-date'),
      memo: val('ledger-txn-memo').trim() || null,
      payee: val('ledger-txn-payee').trim() || val('ledger-contact-input').trim() || null,
      constituent_id: val('ledger-contact') ? Number(val('ledger-contact')) : null,
      reference_number: val('ledger-txn-ref').trim() || null,
    };

    if (entryType === 'transfer') {
      const amount = inputToCents(val('ledger-transfer-amount'));
      if (!val('ledger-from-account') || !val('ledger-to-account')) { showPanelError('Pick the two bank accounts to transfer between.'); return; }
      if (!amount || Number.isNaN(amount)) { showPanelError('Enter an amount greater than zero.'); return; }
      Object.assign(body, { from_account_id: Number(val('ledger-from-account')), to_account_id: Number(val('ledger-to-account')),
        amount_cents: amount });
    } else {
      const rows = Array.from(document.querySelectorAll('#ledger-lines-wrap [data-post-line]'));
      const lines = [];
      const isInstallment = entryType === 'receive' && appliedExpected && appliedExpected.kind === 'pledge_installment';
      for (const row of (isInstallment ? [] : rows)) {
        const accountId = row.querySelector('.ledger-line-account').value;
        const programId = row.querySelector('.ledger-line-program').value;
        const grantId = row.querySelector('.ledger-line-grant').value;
        if (entryType === 'journal') {
          const boardDesignationId = row.querySelector('.ledger-line-board-designation').value;
          const debitCents = inputToCents(row.querySelector('.ledger-line-debit').value);
          const creditCents = inputToCents(row.querySelector('.ledger-line-credit').value);
          if (!accountId && !programId && !debitCents && !creditCents) continue;
          if (!accountId || !programId) { showPanelError('Every line needs an account and a program.'); return; }
          if (Number.isNaN(debitCents) || Number.isNaN(creditCents)) { showPanelError('Debit and credit amounts must be numbers.'); return; }
          lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null,
            board_designation_id: boardDesignationId ? Number(boardDesignationId) : null, debit_cents: debitCents, credit_cents: creditCents,
            line_memo: row.querySelector('.ledger-line-memo').value.trim() || null });
        } else {
          const amount = inputToCents(row.querySelector('.ledger-line-amount').value);
          if (!accountId && !programId && !amount) continue;
          if (!accountId || !programId) { showPanelError('Every line needs an account and a program.'); return; }
          if (!amount || Number.isNaN(amount)) { showPanelError('Every line needs an amount greater than zero.'); return; }
          lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null, amount_cents: amount });
        }
      }
      if (entryType === 'journal') {
        if (lines.length < 2) { showPanelError('A journal needs at least two lines.'); return; }
        body.reason = val('ledger-journal-reason').trim();
        if (body.reason.length < 10) { showPanelError('Give a reason of at least 10 characters.'); return; }
      } else {
        if (!lines.length && !isInstallment) { showPanelError('Add at least one line.'); return; }
        if (!val('ledger-bank-account')) { showPanelError(entryType === 'receive' ? 'Pick the bank account the money went into.' : 'Pick the bank account the money came out of.'); return; }
        body.bank_account_id = Number(val('ledger-bank-account'));
      }
      body.lines = lines;
      if (entryType === 'receive' && appliedExpected) body.apply = { kind: appliedExpected.kind, id: appliedExpected.id };
    }

    const out = await apiJson(base() + '/entries', { method: 'POST', body: JSON.stringify(body) });
    if (!out) return;
    if (out.res.ok) {
      rememberBank(body.bank_account_id || body.from_account_id);
      rememberDate(body.transaction_date);
      closePostPanel();
      await loadTransactions(true);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not post transaction.');
    }
  }

  function newTxnUrl(type) {
    const u = new URL(window.location.href);
    if (type) u.searchParams.set('new', type); else u.searchParams.delete('new');
    return u.pathname + u.search;
  }
  function openPostPanel(opts) {
    const type = opts && ENTRY_TYPES.some((t) => t.key === opts.type) ? opts.type : 'receive';
    postMode = true;
    showPanelError('');
    entryType = type;
    showAllAccounts = false;
    try {
      if (opts && opts.push) { window.history.pushState({ newTxn: type }, '', newTxnUrl(type)); postPushed = true; }
      else window.history.replaceState(window.history.state, '', newTxnUrl(type));
    } catch (_) {}
    txnPageBody.innerHTML = renderPostPanelBody();
    wirePostPanel();
    txnListEl.hidden = true;
    txnPage.hidden = false;
  }
  function closePostPanel(opts) {
    if (postMode) {
      postMode = false;
      txnPage.hidden = true;
      txnListEl.hidden = false;
      if (!(opts && opts.silent)) { try { window.history.replaceState(window.history.state, '', newTxnUrl(null)); } catch (_) {} postPushed = false; }
      if (typeof sizeTableArea === 'function') window.requestAnimationFrame(sizeTableArea);
      return;
    }
    detailFromBank = false;
    panel.classList.remove('organizational-panel-is-open');
    panel.hidden = true;
    txnListEl.hidden = false;
    if (!(opts && opts.silent)) { try { window.history.replaceState(window.history.state, '', txnDetailUrl(null)); } catch (_) {} detailPushed = false; }
    if (typeof sizeTableArea === 'function') window.requestAnimationFrame(sizeTableArea);
  }
  function leavePostPage() {
    if (postMode ? postPushed : detailPushed) { window.history.back(); return; }
    closePostPanel();
  }
  window.addEventListener('popstate', function () {
    if (!txnPage || !currentSlug) return;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('new');
    const d = Number(sp.get('txn'));
    if (t !== null) { postPushed = false; openPostPanel({ type: t }); return; }
    if (Number.isInteger(d) && d > 0) { detailPushed = false; openDetailPanel(d); return; }
    postPushed = false; detailPushed = false;
    if (postMode || (panel && !panel.hidden)) closePostPanel({ silent: true });
  });

  function wireOnce() {
    if (wired) return;
    wired = true;
    function handleRowClicks(e) {
      const approveBtn = e.target.closest('.ledger-approve-btn');
      if (approveBtn) { approveTransaction(approveBtn.getAttribute('data-id')); return true; }
      const voidBtn = e.target.closest('.ledger-void-btn');
      if (voidBtn) { voidTransaction(voidBtn.getAttribute('data-id')); return true; }
      const unrecBtn = e.target.closest('.ledger-unrec-btn');
      if (unrecBtn) { unreconcileFromPanel(Number(unrecBtn.getAttribute('data-id')), true); return true; }
      const voidReturnBtn = e.target.closest('.ledger-voidreturn-btn');
      if (voidReturnBtn) { unreconcileFromPanel(Number(voidReturnBtn.getAttribute('data-id')), false); return true; }
      const editBtn = e.target.closest('.ledger-edit-btn');
      if (editBtn) { renderEditForm(); return true; }
      const editSave = e.target.closest('.ledger-edit-save');
      if (editSave) { saveEdit(editSave.getAttribute('data-id')); return true; }
      const editCancel = e.target.closest('.ledger-edit-cancel');
      if (editCancel) { openDetailPanel(Number(editCancel.getAttribute('data-id'))); return true; }
      const expandBtn = e.target.closest('.ledger-expand-btn');
      if (expandBtn) {
        const id = Number(expandBtn.getAttribute('data-id'));
        if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
        renderRows(listCache);
        return true;
      }
      const openLink = e.target.closest('.ledger-open-link');
      if (openLink) { e.preventDefault(); openDetailPanel(Number(openLink.getAttribute('data-id')), { push: true }); return true; }
      return false;
    }
    if (tbody) tbody.addEventListener('click', handleRowClicks);
    if (panelBody) panelBody.addEventListener('click', handleRowClicks);
    [filterFrom, filterTo, filterStatus, filterGrant, filterVoided].forEach((el) => {
      if (el) el.addEventListener('change', () => loadTransactions(true));
    });
    if (filterQ) filterQ.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadTransactions(true), 300);
    });
    if (pageSizeSel) pageSizeSel.addEventListener('change', () => loadTransactions(true));
    window.addEventListener('resize', sizeTableArea);
    if (prevBtn) prevBtn.addEventListener('click', () => { pageOffset = Math.max(0, pageOffset - pageSize()); loadTransactions(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { pageOffset += pageSize(); loadTransactions(); });
    if (addBtn) addBtn.addEventListener('click', () => openPostPanel({ push: true }));
    if (txnPageBack) txnPageBack.addEventListener('click', (e) => { e.preventDefault(); leavePostPage(); });
    if (detailBack) detailBack.addEventListener('click', (e) => { e.preventDefault(); leavePostPage(); });
  }

  async function initTransactions(slug) {
    currentSlug = slug;
    wireOnce();
    const txnParam = Number(new URLSearchParams(window.location.search).get('txn'));
    const openTxn = Number.isInteger(txnParam) && txnParam > 0 ? txnParam : null;
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug), loadBoardDesignations(slug), loadContacts(slug)]);
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    if (access && typeof access.can_write_accounting === 'boolean') canWriteFlag = access.can_write_accounting;
    if (addBtn) addBtn.hidden = !canWrite();
    const statusParam = new URLSearchParams(window.location.search).get('status');
    if (statusParam && filterStatus && Array.from(filterStatus.options).some((o) => o.value === statusParam)) filterStatus.value = statusParam;
    await loadTransactions(true);
    const wantEdit = !!new URLSearchParams(window.location.search).get('edit');
    if (openTxn) await openDetailPanel(openTxn);
    if (openTxn && wantEdit && lastDetail && lastDetail.edit && lastDetail.edit.allowed && canWrite()) {
      renderEditForm();
      const incomeLine = lastDetail.lines.find((l) => l.account_type === 'income' && Number(l.credit_cents) > 0);
      const row = incomeLine && panelBody.querySelector('.ledger-edit-line[data-line="' + incomeLine.id + '"] .ledger-edit-account');
      if (row) { row.scrollIntoView({ block: 'center' }); row.focus(); }
    }
    const newType = new URLSearchParams(window.location.search).get('new');
    if (newType && canWrite()) openPostPanel({ type: newType });
  }

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
    if (saveBtn && !['admin', 'finance', 'staff'].includes(String((window.OrganizationalAccounting.getOrg() || {}).role || '').toLowerCase())) {
      policyBodyEl.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
      saveBtn.hidden = true;
      policyBodyEl.insertAdjacentHTML('beforeend', '<p class="organizational-hint" style="margin:8px 0 0;">Changed by finance or an admin.</p>');
    }
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

  window.OrganizationalAccounting.transactions = { init: initTransactions, fit: sizeTableArea, closePage: (o) => { if (postMode || (panel && !panel.hidden)) closePostPanel(o); },
    openDetail: (id, opts) => {
      detailFromBank = !!(opts && opts.fromBank);
      if (detailFromBank) {
        try {
          const u = new URL(window.location.href);
          u.pathname = u.pathname.replace(/\/[^/]+\/?$/, '/transactions');
          u.search = '?txn=' + encodeURIComponent(id);
          window.history.pushState({ txn: id }, '', u.pathname + u.search);
          detailPushed = true;
        } catch (_) {}
        if (window.OrganizationalAccounting.switchTab) window.OrganizationalAccounting.switchTab('transactions');
        return openDetailPanel(id);
      }
      return openDetailPanel(id, { push: true });
    } };
  window.OrganizationalAccounting.approvalPolicy = { init: initApprovalPolicy };
})();
