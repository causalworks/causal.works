(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const errEl        = document.getElementById('organizational-org-error');
  const tbody         = document.getElementById('organizational-bills-tbody');
  const filterStatus  = document.getElementById('organizational-bills-filter-status');
  const addBtn        = document.getElementById('organizational-bills-add');
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    columns: [
      { key: 'vendor', type: 'text', get: (b) => b.vendor_name },
      { key: 'bill_date', type: 'date', get: (b) => b.bill_date },
      { key: 'due_date', type: 'date', get: (b) => b.due_date },
      { key: 'reference', type: 'text', get: (b) => b.reference },
      { key: 'total', type: 'currency', get: (b) => b.display_total_cents != null ? b.display_total_cents : b.total_cents },
      { key: 'status', type: 'text', get: (b) => b.status },
    ],
    onChange: () => renderRows(shownBills()),
  }) : null;

  const listEl        = document.getElementById('organizational-purchases-list');
  const page          = document.getElementById('organizational-bill-page');
  const panelBody     = document.getElementById('organizational-bill-page-body');
  const panelTitle    = document.getElementById('organizational-bill-page-title');
  const pageBack      = document.getElementById('organizational-bill-page-back');
  const pageBackBills = document.getElementById('organizational-bill-page-back-bills');
  const panelErrEl    = document.getElementById('organizational-bill-page-error');

  const agingBtn        = document.getElementById('organizational-bills-aging-btn');
  const agingPanel       = document.getElementById('organizational-bills-aging-panel');
  const agingPanelOverlay = document.getElementById('organizational-bills-aging-panel-overlay');
  const agingPanelBody    = document.getElementById('organizational-bills-aging-panel-body');
  const agingPanelClose   = document.getElementById('organizational-bills-aging-panel-close');

  const cnAddBtn  = document.getElementById('organizational-billcreditnotes-add');
  const cnFormEl  = document.getElementById('organizational-billcreditnotes-form');
  const cnTbody   = document.getElementById('organizational-billcreditnotes-tbody');

  const vcPanel        = document.getElementById('organizational-vendorcompliance-panel');
  const vcPanelOverlay = document.getElementById('organizational-vendorcompliance-panel-overlay');
  const vcPanelBody    = document.getElementById('organizational-vendorcompliance-panel-body');
  const vcPanelTitle   = document.getElementById('organizational-vendorcompliance-panel-title');
  const vcPanelClose   = document.getElementById('organizational-vendorcompliance-panel-close');
  const vcPanelErrEl   = document.getElementById('organizational-vendorcompliance-panel-error');

  const schedAddBtn = document.getElementById('organizational-billschedules-add');
  const schedFormEl = document.getElementById('organizational-billschedules-form');
  const schedTbody  = document.getElementById('organizational-billschedules-tbody');

  let currentSlug   = '';
  let accountsCache = [];
  let programsCache = [];
  let grantsCache   = [];
  let vendorsCache  = [];
  let wired         = false;
  let currentBillId = null;
  let canWrite = true;
  let canCompliance = true;
  let billData = null;
  let editingPosted = false;
  let pagePushed = false;
  let billsCache    = [];
  let currentVendorComplianceConstituentId = null;
  let ocrFile = null;
  let ocrPreviewUrl = null;
  let ocrExpectedTotalCents = null;

  const esc     = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  function todayLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }
  function showPanelError(msg) { if (panelErrEl) { panelErrEl.textContent = msg || ''; panelErrEl.hidden = !msg; } }

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return NaN;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  const STATUS_LABELS = {
    draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved',
    scheduled: 'Scheduled', partially_paid: 'Partially paid', paid: 'Paid', void: 'Void',
  };
  function statusBadge(status) {
    return window.OrganizationalStatusHtml(status, STATUS_LABELS[status] || status);
  }

  async function loadAccounts(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts');
    accountsCache = ((out && out.data && (out.data.accounts || out.data)) || []).filter((a) => a.is_posting);
  }
  async function loadPrograms(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program');
    programsCache = (out && out.data && (out.data.programs || out.data)) || [];
  }
  async function loadGrants(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants');
    grantsCache = (out && out.data && (out.data.grants || out.data)) || [];
  }
  async function loadVendors(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents/names?role=vendor&active=true');
    vendorsCache = (out && Array.isArray(out.data)) ? out.data : [];
  }

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
      '<option value="' + g.id + '"' + (Number(g.id) === Number(selectedId) ? ' selected' : '') + '>' + esc(g.name) + (g.is_federal_award ? ' (federal award)' : '') + '</option>'
    ).join('');
  }
  function cashAccountOptions() {
    const cash = accountsCache.filter((a) => a.is_cash_account);
    if (!cash.length) return '<option value="">No cash accounts configured</option>';
    return '<option value="">— Bank account —</option>' + cash.map((a) =>
      '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
  }

  async function loadBills() {
    const params = new URLSearchParams();
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills?' + params.toString());
    if (!out) return;
    billsCache = (out.data && out.data.bills) || [];
    renderRows(shownBills());
  }

  const BILL_FILTERS = { pending_approval: 'waiting for approval', overdue: 'overdue', due_week: 'due this week' };
  let listFilter = null;
  function shownBills() {
    if (!listFilter) return billsCache;
    const today = todayLocal();
    const week = new Date(); week.setDate(week.getDate() + 7);
    const weekEnd = week.getFullYear() + '-' + String(week.getMonth() + 1).padStart(2, '0') + '-' + String(week.getDate()).padStart(2, '0');
    const open = (b) => ['approved', 'scheduled', 'partially_paid'].includes(b.status);
    const due = (b) => String(b.due_date || b.bill_date || '').slice(0, 10);
    return billsCache.filter((b) => (listFilter === 'pending_approval' ? b.status === 'pending_approval'
      : listFilter === 'overdue' ? open(b) && due(b) < today
      : open(b) && due(b) >= today && due(b) <= weekEnd));
  }
  function showFilterNote() {
    let note = document.getElementById('organizational-bills-filter-note');
    const wrap = tbody && tbody.closest('.organizational-table-wrap');
    if (!listFilter) { if (note) note.remove(); return; }
    if (!note && wrap) {
      note = document.createElement('p');
      note.id = 'organizational-bills-filter-note';
      note.className = 'organizational-hint';
      note.style.margin = '8px 0';
      wrap.parentNode.insertBefore(note, wrap);
    }
    if (note) {
      note.innerHTML = 'Showing bills ' + esc(BILL_FILTERS[listFilter]) + '. <a href="#" id="organizational-bills-filter-clear">Show all</a>';
      note.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        listFilter = null;
        const u = new URL(window.location.href); u.searchParams.delete('filter');
        try { window.history.replaceState(window.history.state, '', u.pathname + u.search); } catch (_) {}
        showFilterNote(); renderRows(shownBills());
      });
    }
  }

  function renderRows(bills) {
    if (!tbody) return;
    if (!bills.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No bills yet.</td></tr>';
      return;
    }
    tbody.innerHTML = (sorter ? sorter.sortRows(bills) : bills).map((b) => (
      '<tr class="organizational-bills-row" data-id="' + b.id + '" style="cursor:pointer;">'
      + '<td>' + esc(b.vendor_name) + '</td>'
      + '<td>' + esc(String(b.bill_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(String(b.due_date || '').slice(0, 10) || '—') + '</td>'
      + '<td>' + esc(b.reference || '—') + '</td>'
      + '<td>' + fmtMoney((b.display_total_cents != null ? b.display_total_cents : b.total_cents) || 0) + '</td>'
      + '<td>' + statusBadge(b.status) + '</td>'
      + '</tr>'
    )).join('');
  }

  const LINE_GRID = 'minmax(0,1.9fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1.5fr) 120px';
  function lineRowHtml(l) {
    l = l || {};
    return '<div data-line style="display:grid;grid-template-columns:' + LINE_GRID + ' 28px;gap:12px;align-items:center;padding:3px 0;">'
      + '<select class="organizational-select bill-line-account">' + accountOptions(l.account_id) + '</select>'
      + '<select class="organizational-select bill-line-program">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select bill-line-grant">' + grantOptions(l.grant_id) + '</select>'
      + '<input type="text" class="organizational-input bill-line-memo" maxlength="300" placeholder="Description" value="' + esc(l.line_memo || '') + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount bill-line-amount" placeholder="0.00" title="Type an amount, or a sum such as =192+268.50" style="text-align:right;" value="' + (l.amount_cents != null ? (Number(l.amount_cents) / 100) : '') + '">'
      + '<button type="button" class="organizational-btn-icon bill-remove-line" title="Remove">✕</button>'
      + '</div>';
  }
  function linesHeadHtml(withRemoveCol) {
    return '<div style="display:grid;grid-template-columns:' + LINE_GRID + (withRemoveCol ? ' 28px' : '') + ';gap:12px;align-items:center;font-size:0.75rem;color:var(--text-secondary);font-weight:600;padding-bottom:2px;border-bottom:1px solid var(--border);"><span>Account</span><span>Program</span><span>Grant</span><span>Description</span><span style="text-align:right;">Amount</span>' + (withRemoveCol ? '<span></span>' : '') + '</div>';
  }

  function readOnlyLineHtml(l) {
    return '<div style="display:grid;grid-template-columns:' + LINE_GRID + ';gap:12px;align-items:center; font-size:0.85rem;padding:4px 0;border-bottom:1px solid var(--border);">'
      + '<span>' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + '</span>'
      + '<span>' + esc(l.program_name) + '</span>'
      + '<span>' + esc(l.grant_name || '—') + '</span>'
      + '<span>' + esc(l.line_memo || '') + '</span>'
      + '<span style="text-align:right;">' + fmtMoney(l.amount_cents) + '</span>'
      + '</div>';
  }

  function postedLineRowHtml(l) {
    return '<div data-line data-line-id="' + l.id + '" style="display:grid;grid-template-columns:' + LINE_GRID + ';gap:12px;align-items:center;padding:3px 0;">'
      + '<select class="organizational-select bill-line-account">' + accountOptions(l.account_id) + '</select>'
      + '<select class="organizational-select bill-line-program">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select bill-line-grant">' + grantOptions(l.grant_id) + '</select>'
      + '<input type="text" class="organizational-input bill-line-memo" maxlength="300" placeholder="Description" value="' + esc(l.line_memo || '') + '">'
      + '<span style="text-align:right;font-size:0.85rem;">' + fmtMoney(l.amount_cents) + '</span>'
      + '</div>';
  }

  function paymentHtml(p) {
    return '<div style="display:grid;grid-template-columns:90px minmax(0,1.5fr) minmax(0,1fr) 100px auto;gap:12px;align-items:center; font-size:0.8125rem;padding:4px 0;border-bottom:1px solid var(--border);">'
      + '<span>' + esc(String(p.payment_date).slice(0, 10)) + '</span>'
      + '<span>' + esc(p.bank_account_code ? p.bank_account_code + ' — ' + p.bank_account_name : p.bank_account_name) + '</span>'
      + '<span>' + esc(p.reference || '—') + '</span>'
      + '<span style="text-align:right;">' + fmtMoney(p.amount_cents) + '</span>'
      + (p.status === 'posted'
        ? '<span style="display:flex;gap:10px;align-items:center;"><a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/banking?account=' + encodeURIComponent(p.bank_account_id) + '&view=register" style="flex:0 0 auto;font-size:0.75rem;">Bank register</a>'
          + (canWrite ? '<button type="button" class="organizational-btn organizational-btn-outline bill-payment-redo" data-payment="' + p.id + '" data-line="' + (p.statement_line_id || '') + '" style="font-size:0.75rem;padding:2px 8px;">Remove &amp; redo</button>' : '') + '</span>'
        : '<span style="flex:0 0 auto;color:var(--text-secondary);">Voided</span>')
      + '</div>';
  }

  function headerBarHtml(bill, postedEditing) {
    const items = [];
    const add = (id, label) => items.push('<button type="button" role="menuitem" class="organizational-account-dropdown-item" id="' + id + '">' + label + '</button>');
    if (canWrite) {
      add('bill-copy', 'Copy bill');
      if (['approved', 'scheduled', 'partially_paid', 'paid'].includes(bill.status)) add('bill-edit', 'Edit bill');
      if (bill.status === 'approved') add('bill-schedule-toggle', 'Schedule payment');
      if (['approved', 'scheduled'].includes(bill.status)) add('bill-revert', 'Revert to draft');
      if (['draft', 'pending_approval', 'approved', 'scheduled'].includes(bill.status)) add('bill-void', 'Void bill');
    }
    return '<div class="organizational-panel-field-full" style="display:flex;align-items:center;gap:8px;">' + statusBadge(bill.status) + '<span style="flex:1;"></span>'
      + '<button type="button" id="bill-print" class="organizational-btn organizational-btn-outline" style="height:30px;font-size:0.8125rem;padding:0 12px;">Print PDF</button>'
      + (items.length && !postedEditing
        ? '<span style="position:relative;display:inline-block;"><button type="button" id="bill-menu-btn" class="organizational-btn organizational-btn-outline" aria-haspopup="true" aria-expanded="false" style="height:30px;font-size:0.8125rem;padding:0 12px;">Bill options ▾</button>'
          + '<div class="organizational-account-dropdown" id="bill-menu" role="menu" hidden style="bottom:auto;top:100%;left:auto;right:0;margin:2px 0 0;min-width:180px;">' + items.join('') + '</div></span>'
        : '')
      + '</div>';
  }

  function printBill() {
    if (!billData || !billData.bill) return;
    const { bill, lines, payments } = billData;
    const P = window.OrganizationalDocPrint;
    const org = window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    const vendorInput = document.getElementById('bill-vendor-input');
    const vendor = bill.vendor_name || (vendorInput && vendorInput.value) || '';
    const total = (lines || []).reduce((n, l) => n + Number(l.amount_cents), 0);
    const paid = (payments || []).filter((p) => p.status === 'posted').reduce((n, p) => n + Number(p.amount_cents), 0);
    const credited = Number(bill.credited_cents || 0);
    const due = total - paid - credited;
    const d = (v) => (v ? esc(String(v).slice(0, 10)) : '');
    const rows = (lines || []).map((l) => '<tr><td>' + esc(l.account_code ? l.account_code + ' ' + l.account_name : l.account_name) + '</td><td>' + esc(l.program_name || '') + '</td><td>' + esc(l.grant_name || '') + '</td><td>' + esc(l.line_memo || '') + '</td><td class="r">' + fmtMoney(l.amount_cents) + '</td></tr>').join('');
    const payRows = (payments || []).filter((p) => p.status === 'posted').map((p) => '<tr><td colspan="4">Payment ' + d(p.payment_date) + (p.bank_account_name ? ' · ' + esc(p.bank_account_name) : '') + (p.reference ? ' · ' + esc(p.reference) : '') + '</td><td class="r">-' + fmtMoney(p.amount_cents) + '</td></tr>').join('');
    P.open('Bill #' + bill.id,
      '<div class="top"><div><h2>Bill to</h2>' + P.letterheadHtml(org) + '</div>'
      + '<div style="text-align:right"><h1>BILL</h1><table class="facts" style="width:auto;margin:6px 0 0 auto"><tr><td>Bill no.</td><td>' + esc(bill.id) + '</td></tr>'
      + (bill.reference ? '<tr><td>Vendor reference</td><td>' + esc(bill.reference) + '</td></tr>' : '')
      + '<tr><td>Bill date</td><td>' + d(bill.bill_date) + '</td></tr><tr><td>Status</td><td>' + esc(String(bill.status).replace('_', ' ')) + '</td></tr></table></div></div>'
      + '<div class="band"><div>' + P.contactHtml('From (vendor)', vendor, bill) + '</div>'
      + '<div><h2>Due date</h2><div class="due" style="font-size:18px">' + (d(bill.due_date) || 'Not set') + '</div></div>'
      + '<div style="text-align:right"><h2>Amount due</h2><div class="due">' + fmtMoney(due) + '</div></div></div>'
      + '<table><tr><th>Account</th><th>Program</th><th>Grant</th><th>Description</th><th class="r">Amount</th></tr>' + rows
      + '<tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>' + fmtMoney(total) + '</b></td></tr>'
      + (credited ? '<tr><td colspan="4">Credit notes applied</td><td class="r">-' + fmtMoney(credited) + '</td></tr>' : '')
      + payRows
      + '<tr><td colspan="4" class="r"><b>Amount due</b></td><td class="r"><b>' + fmtMoney(due) + '</b></td></tr></table>'
      + '<p class="small" style="margin-top:24px">Printed ' + d(todayLocal()) + '</p>',
      () => showPanelError('Allow pop-ups to print the bill.'));
  }

  function renderPanelBody(bill, lines, payments) {
    const isDraft = !bill || bill.status === 'draft';
    const postedEditing = editingPosted && !isDraft && !!bill && bill.status !== 'void' && bill.status !== 'pending_approval';
    const linesHtml = postedEditing
      ? linesHeadHtml(false) + '<div id="bill-posted-lines">' + (lines || []).map(postedLineRowHtml).join('') + '</div>'
      : isDraft
      ? linesHeadHtml(true) + '<div id="bill-lines-wrap">' + (lines && lines.length ? lines.map(lineRowHtml).join('') : lineRowHtml()) + '</div>'
        + '<button type="button" id="bill-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem;margin-top:6px;">+ Add line</button>'
        + '<div id="bill-lines-total" style="font-size:0.8125rem;color:var(--text-secondary);margin-top:6px;text-align:right;"></div>'
      : '<div style="margin-top:6px;">'
        + linesHeadHtml(false)
        + (lines || []).map(readOnlyLineHtml).join('')
        + '</div>';
    const totalCents = (lines || []).reduce((s, l) => s + Number(l.amount_cents), 0);
    const paidCents = (payments || []).filter((p) => p.status === 'posted').reduce((s, p) => s + Number(p.amount_cents), 0);
    const creditedCents = Number((bill && bill.credited_cents) || 0);
    const remainingCents = totalCents - paidCents - creditedCents;
    const totalsHtml = (bill && !isDraft && bill.status !== 'void')
      ? '<div style="margin:10px 0 0 auto;width:260px;font-size:0.875rem;">'
        + '<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>Total</span><span>' + fmtMoney(totalCents) + '</span></div>'
        + (paidCents ? '<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-secondary);"><span>Less payments</span><span>' + fmtMoney(paidCents) + '</span></div>' : '')
        + (creditedCents ? '<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-secondary);"><span>Less credit notes</span><span>' + fmtMoney(creditedCents) + '</span></div>' : '')
        + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border);font-weight:600;"><span>Amount due</span><span>' + fmtMoney(remainingCents) + '</span></div></div>'
      : '';
    const lockedNote = (bill && !isDraft && bill.status !== 'void')
      ? (postedEditing
        ? '<div class="organizational-panel-field-full"><label class="organizational-label">Reason for the change *<input type="text" id="bill-edit-reason" class="organizational-input" maxlength="500" placeholder="Why this is being corrected"></label>'
          + '</div>'
        : '<p class="organizational-hint" style="margin:0;">To change an amount, the vendor or the bill date, enter a vendor credit note.</p>') : '';

    const actions = [];
    if (postedEditing) {
      actions.push('<button type="button" id="bill-edit-cancel" class="organizational-btn organizational-btn-outline">Cancel</button>');
      actions.push('<button type="button" id="bill-edit-save" class="organizational-btn organizational-btn-primary">Save changes</button>');
    } else if (!bill) {
      actions.push('<button type="button" id="bill-save" class="organizational-btn organizational-btn-primary">Create bill</button>');
    } else if (bill.status === 'draft') {
      actions.push('<button type="button" id="bill-save" class="organizational-btn organizational-btn-outline">Save changes</button>');
      actions.push('<button type="button" id="bill-submit" class="organizational-btn organizational-btn-primary">Submit for approval</button>');
    } else if (bill.status === 'pending_approval') {
      actions.push('<button type="button" id="bill-approve" class="organizational-btn organizational-btn-primary">Approve</button>');
    } else if (bill.status === 'scheduled') {
      actions.push('<button type="button" id="bill-record-payment" class="organizational-btn organizational-btn-primary">Record payment</button>');
      actions.push('<button type="button" id="bill-unschedule" class="organizational-btn organizational-btn-outline">Cancel scheduling</button>');
    } else if (['approved', 'partially_paid'].includes(bill.status)) {
      actions.push('<button type="button" id="bill-record-payment" class="organizational-btn organizational-btn-primary">Record payment</button>');
    }

    let scheduleSection = '';
    if (bill && bill.status === 'scheduled') {
      scheduleSection = '<div class="organizational-panel-field-full" style="font-size:0.8125rem;color:var(--text-secondary);">Scheduled to pay on <b>' + esc(String(bill.scheduled_payment_date || '').slice(0, 10)) + '</b> — can still be paid early below.</div>';
    } else if (bill && bill.status === 'approved') {
      scheduleSection = '<div id="bill-schedule-form" hidden style="display:none;">'
        + '<div style="display:flex;gap:12px;align-items:flex-end;">'
        + '<label class="organizational-label" style="flex:0 0 220px">Payment date<input type="date" id="bill-schedule-date" class="organizational-input" value="' + esc((bill.due_date ? String(bill.due_date).slice(0, 10) : '') || todayLocal()) + '"></label>'
        + '<button type="button" id="bill-schedule-save" class="organizational-btn organizational-btn-outline">Save schedule</button>'
        + '</div></div>';
    }

    let paymentSection = '';
    if (bill && !isDraft && bill.status !== 'pending_approval') {
      const historyHtml = payments && payments.length
        ? '<div class="organizational-panel-section-head">Payments</div>'
          + payments.map(paymentHtml).join('')
        : '';
      const canRecordPayment = ['approved', 'scheduled', 'partially_paid'].includes(bill.status) && remainingCents > 0;
      const formHtml = canRecordPayment
        ? '<div class="organizational-panel-section-head">Record payment</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Payment date<input type="date" id="bill-payment-date" class="organizational-input" value="' + todayLocal() + '"></label>'
          + '<label class="organizational-label" style="flex:1">Bank account *<select id="bill-payment-account" class="organizational-select">' + cashAccountOptions() + '</select></label>'
          + '</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="bill-payment-reference" class="organizational-input"></label>'
          + '<label class="organizational-label" style="flex:1">Amount *<input type="text" inputmode="decimal" id="bill-payment-amount" class="organizational-input organizational-formula-amount" value="' + (remainingCents / 100).toFixed(2) + '"></label>'
          + '</div>'
        : '';
      paymentSection = historyHtml + formHtml;
    }

    const ocrSectionHtml = bill ? '' : (
      '<div class="organizational-panel-field-full" style="margin-bottom:4px;">'
      + '<a href="#" id="bill-ocr-toggle" style="font-size:0.8125rem;">Upload the vendor\'s bill to pre-fill</a>'
      + '<div id="bill-ocr-box" hidden style="margin-top:6px;">'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<input type="file" id="bill-ocr-file" class="organizational-input" accept="image/*,application/pdf" style="flex:1;">'
      + '<div id="bill-ocr-preview" style="flex:0 0 auto;" hidden></div>'
      + '</div>'
      + '<p id="bill-ocr-status" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div></div>'
    );

    const rationaleText = bill && bill.procurement_rationale ? bill.procurement_rationale : '';
    const rationaleHtml = (isDraft || rationaleText)
      ? '<div class="organizational-panel-field-full" id="bill-rationale-wrap">'
        + (isDraft ? '<a href="#" id="bill-rationale-add" style="font-size:0.8125rem;" hidden>Add procurement rationale</a>' : '')
        + '<div id="bill-rationale-box"' + (rationaleText ? '' : ' hidden') + '>'
        + '<label class="organizational-label">Procurement rationale <span id="bill-rationale-hint" style="font-weight:400;color:var(--text-secondary);"></span>'
        + '<textarea id="bill-rationale" rows="2" ' + (isDraft || postedEditing ? '' : 'disabled') + '>' + esc(rationaleText) + '</textarea></label></div></div>'
      : '<textarea id="bill-rationale" hidden disabled></textarea>';

    return '<div class="organizational-panel-fields">'
      + (bill ? headerBarHtml(bill, postedEditing) : '')
      + ocrSectionHtml
      + '<div class="organizational-panel-field-row" style="align-items:flex-start;">'
      + '<div style="flex:2;min-width:0;"><label class="organizational-label">Vendor *<div id="bill-vendor-field" class="organizational-contact-picker-mount"></div></label>'
      + (canCompliance ? '<a href="#" id="bill-vendor-compliance-btn" style="font-size:0.75rem;">Edit compliance</a>' : '') + '</div>'
      + '<label class="organizational-label" style="flex:1">Bill date *<input type="date" id="bill-date" class="organizational-input" value="' + esc((bill && bill.bill_date) ? String(bill.bill_date).slice(0, 10) : '') + '" ' + (isDraft ? '' : 'disabled') + '></label>'
      + '<label class="organizational-label" style="flex:1">Due date<input type="date" id="bill-due-date" class="organizational-input" value="' + esc((bill && bill.due_date) ? String(bill.due_date).slice(0, 10) : '') + '" ' + (isDraft || postedEditing ? '' : 'disabled') + '></label>'
      + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="bill-reference" class="organizational-input" value="' + esc(bill ? bill.reference : '') + '" ' + (isDraft || postedEditing ? '' : 'disabled') + '></label>'
      + '</div>'
      + rationaleHtml
      + scheduleSection
      + '<div style="border-top:1px solid var(--border);margin:12px 0 8px;"></div>'
      + (postedEditing ? '' : lockedNote)
      + linesHtml
      + (postedEditing ? lockedNote : '')
      + totalsHtml
      + (postedEditing ? '' : paymentSection)
      + (bill ? window.OrganizationalDocumentAttach.html('bill', ['procurement_quote', 'procurement_solicitation', 'vendor_bill', 'other'], { defaultCategory: 'vendor_bill' }) : '')
      + '</div>'
      + (canWrite ? '<div class="organizational-panel-actions" style="margin:16px 0 0;padding:14px 0;bottom:0;">' + actions.join('') + '</div>' : '');
  }

  function updateRationale() {
    const add = document.getElementById('bill-rationale-add');
    const box = document.getElementById('bill-rationale-box');
    const ta = document.getElementById('bill-rationale');
    const hint = document.getElementById('bill-rationale-hint');
    if (!add || !box || !ta) return;
    let total = 0, federal = false;
    document.querySelectorAll('#bill-lines-wrap [data-line]').forEach((row) => {
      const c = inputToCents(row.querySelector('.bill-line-amount').value);
      if (!Number.isNaN(c)) total += c;
      const g = grantsCache.find((x) => String(x.id) === String(row.querySelector('.bill-line-grant').value));
      if (g && g.is_federal_award) federal = true;
    });
    const needed = federal && total >= 1500000;
    const big = federal && total >= 35000000;
    if (hint) hint.textContent = needed ? '(required: federal-award grant, $15,000 or more' + (big ? '; at $350,000 or more also attach a solicitation package or 3 quotes under Documents' : '') + ')' : '';
    if (needed || ta.value.trim() || box.dataset.opened) { box.hidden = false; add.hidden = true; }
    else { box.hidden = true; add.hidden = false; }
  }

  function updateBillLinesTotal() {
    updateRationale();
    const totalEl = document.getElementById('bill-lines-total');
    if (!totalEl) return;
    const amounts = Array.from(document.querySelectorAll('#bill-lines-wrap .bill-line-amount'))
      .map((inp) => inputToCents(inp.value))
      .filter((n) => !Number.isNaN(n));
    const sumCents = amounts.reduce((s, n) => s + n, 0);
    let text = 'Lines total: ' + fmtMoney(sumCents);
    if (ocrExpectedTotalCents != null) {
      if (sumCents === ocrExpectedTotalCents) {
        text += ' — matches the bill total read from the file (' + fmtMoney(ocrExpectedTotalCents) + ').';
      } else {
        text += ' — bill was read as ' + fmtMoney(ocrExpectedTotalCents) + ', off by ' + fmtMoney(Math.abs(sumCents - ocrExpectedTotalCents)) + '.';
      }
    }
    totalEl.textContent = text;
  }

  function collectLines() {
    const rows = Array.from(document.querySelectorAll('#bill-lines-wrap [data-line]'));
    const lines = [];
    for (const row of rows) {
      const accountId = row.querySelector('.bill-line-account').value;
      const programId = row.querySelector('.bill-line-program').value;
      const grantId = row.querySelector('.bill-line-grant').value;
      const amountCents = inputToCents(row.querySelector('.bill-line-amount').value);
      if (!accountId && !programId && !amountCents) continue;
      if (!accountId || !programId) { showPanelError('Every line needs an account and a program.'); return null; }
      if (Number.isNaN(amountCents) || amountCents <= 0) { showPanelError('Every line needs a positive amount.'); return null; }
      lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null, amount_cents: amountCents, line_memo: row.querySelector('.bill-line-memo').value.trim() || null });
    }
    if (!lines.length) { showPanelError('At least one line is required.'); return null; }
    return lines;
  }

  function wirePanelBody(bill) {
    const isDraft = !bill || bill.status === 'draft';
    const vendorField = document.getElementById('bill-vendor-field');
    if (vendorField) {
      window.OrganizationalContactPicker.mount(vendorField, {
        getCache: () => vendorsCache, role: 'vendor', slug: currentSlug,
        selectedId: bill && bill.constituent_id, disabled: !isDraft, valueElementId: 'bill-vendor',
      });
    }

    const linesWrap = document.getElementById('bill-lines-wrap');
    const addLineBtn = document.getElementById('bill-add-line');
    if (addLineBtn) addLineBtn.addEventListener('click', () => { linesWrap.insertAdjacentHTML('beforeend', lineRowHtml()); updateBillLinesTotal(); });
    if (linesWrap) linesWrap.addEventListener('click', (e) => {
      const rm = e.target.closest('.bill-remove-line');
      if (rm && linesWrap.children.length > 1) { rm.closest('[data-line]').remove(); updateBillLinesTotal(); }
    });
    if (linesWrap) linesWrap.addEventListener('input', (e) => {
      if (e.target.classList.contains('bill-line-amount')) updateBillLinesTotal();
    });
    if (linesWrap) linesWrap.addEventListener('change', (e) => {
      if (e.target.classList.contains('bill-line-grant')) updateRationale();
    });
    const rationaleAdd = document.getElementById('bill-rationale-add');
    if (rationaleAdd) rationaleAdd.addEventListener('click', (e) => {
      e.preventDefault();
      const box = document.getElementById('bill-rationale-box');
      box.dataset.opened = '1'; box.hidden = false; rationaleAdd.hidden = true;
      document.getElementById('bill-rationale').focus();
    });
    const ocrToggle = document.getElementById('bill-ocr-toggle');
    if (ocrToggle) ocrToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const ocrBox = document.getElementById('bill-ocr-box');
      ocrBox.hidden = !ocrBox.hidden;
    });
    updateBillLinesTotal();

    const ocrInput = document.getElementById('bill-ocr-file');
    const ocrStatus = document.getElementById('bill-ocr-status');
    const ocrPreviewEl = document.getElementById('bill-ocr-preview');
    if (ocrInput) ocrInput.addEventListener('change', async () => {
      ocrFile = ocrInput.files && ocrInput.files[0];
      if (!ocrFile) return;

      if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
      ocrPreviewUrl = URL.createObjectURL(ocrFile);
      if (ocrPreviewEl) {
        ocrPreviewEl.hidden = false;
        ocrPreviewEl.innerHTML = ocrFile.type === 'application/pdf'
          ? '<a href="' + ocrPreviewUrl + '" target="_blank" rel="noopener" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:4px 8px;">View PDF ↗</a>'
          : '<a href="' + ocrPreviewUrl + '" target="_blank" rel="noopener"><img src="' + ocrPreviewUrl + '" alt="Bill preview" style="max-height:140px;max-width:180px;border:1px solid var(--border);border-radius:4px;object-fit:contain;display:block;"></a>';
      }

      ocrStatus.hidden = false;
      ocrStatus.textContent = 'Scanning bill…';
      const form = new FormData();
      form.append('file', ocrFile);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/ocr-preview', {
        method: 'POST', body: form, credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.extracted) {
        ocrStatus.textContent = data.error || 'Could not read this bill — fill in the fields manually.';
        return;
      }
      const ext = data.extracted;
      if (ext.document_date) document.getElementById('bill-date').value = ext.document_date;
      if (ext.due_date) document.getElementById('bill-due-date').value = ext.due_date;
      if (ext.reference) document.getElementById('bill-reference').value = ext.reference;
      const firstAmountInput = document.querySelector('#bill-lines-wrap .bill-line-amount');
      if (firstAmountInput && !firstAmountInput.value && ext.total_amount_cents) {
        firstAmountInput.value = (ext.total_amount_cents / 100).toFixed(2);
      }
      if (ext.total_amount_cents) ocrExpectedTotalCents = ext.total_amount_cents;
      updateBillLinesTotal();
      let vendorMatchNote = '';
      if (ext.counterparty_name) {
        const nameLc = ext.counterparty_name.toLowerCase();
        const match = vendorsCache.find((v) => (v.display_name || '').toLowerCase() === nameLc)
          || vendorsCache.find((v) => (v.display_name || '').toLowerCase().includes(nameLc) || nameLc.includes((v.display_name || '').toLowerCase()));
        const hidden = document.getElementById('bill-vendor');
        const visible = document.getElementById('bill-vendor-input');
        if (match) {
          if (hidden) hidden.value = match.id;
          if (visible) visible.value = match.display_name;
          vendorMatchNote = ' Matched to vendor "' + match.display_name + '".';
        } else {
          if (visible) visible.value = ext.counterparty_name;
          vendorMatchNote = ' No matching vendor found for "' + ext.counterparty_name + '" — pick one or add a new vendor above.';
        }
      }
      ocrStatus.textContent = 'Pre-filled from the bill — review before saving.' + vendorMatchNote;
    });

    const vcBtn = document.getElementById('bill-vendor-compliance-btn');
    if (vcBtn) vcBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const vendorSelect = document.getElementById('bill-vendor');
      const vendorId = vendorSelect ? vendorSelect.value : '';
      if (!vendorId) { showPanelError('Select a vendor first.'); return; }
      openVendorCompliancePanel(Number(vendorId));
    });

    const saveBtn = document.getElementById('bill-save');
    if (saveBtn) saveBtn.addEventListener('click', saveBill);
    const printBtn = document.getElementById('bill-print');
    if (printBtn) printBtn.addEventListener('click', printBill);
    const menuBtn = document.getElementById('bill-menu-btn');
    const menu = document.getElementById('bill-menu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
      menu.addEventListener('click', () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); });
      document.addEventListener('click', function close(e) {
        if (!document.body.contains(menu)) { document.removeEventListener('click', close); return; }
        if (!menu.contains(e.target)) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
      });
    }
    const copyBtn = document.getElementById('bill-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => openBillPanel(null, { copy: { bill: billData.bill, lines: billData.lines } }));
    const editBtn = document.getElementById('bill-edit');
    if (editBtn) editBtn.addEventListener('click', () => openBillPanel(currentBillId, { editing: true }));
    const editCancelBtn = document.getElementById('bill-edit-cancel');
    if (editCancelBtn) editCancelBtn.addEventListener('click', () => openBillPanel(currentBillId));
    const editSaveBtn = document.getElementById('bill-edit-save');
    if (editSaveBtn) editSaveBtn.addEventListener('click', savePostedEdit);
    const submitBtn = document.getElementById('bill-submit');
    if (submitBtn) submitBtn.addEventListener('click', () => transitionBill(currentBillId, 'submit'));
    const approveBtn = document.getElementById('bill-approve');
    if (approveBtn) approveBtn.addEventListener('click', () => transitionBill(currentBillId, 'approve'));
    const voidBtn = document.getElementById('bill-void');
    if (voidBtn) voidBtn.addEventListener('click', () => {
      const posted = bill && ['approved', 'scheduled'].includes(bill.status);
      askReason({
        title: posted ? 'Reason for voiding this bill *' : 'Reason for voiding (optional)',
        hint: posted ? 'The bill\'s ledger entry is voided too, and the bill stays on record as void. Payments must be voided first, in the bank Register.' : '',
        confirmLabel: 'Void bill', required: posted,
        onSubmit: (r) => transitionBill(currentBillId, 'void', r),
      });
    });
    const revertBtn = document.getElementById('bill-revert');
    if (revertBtn) revertBtn.addEventListener('click', () => askReason({
      title: 'Reason for reverting to draft *',
      hint: 'The bill\'s ledger entry is voided and the bill returns to draft, where everything can be changed. Submit and approve it again afterwards.',
      confirmLabel: 'Revert to draft', required: true,
      onSubmit: (r) => transitionBill(currentBillId, 'revert-to-draft', r),
    }));
    const recordPaymentBtn = document.getElementById('bill-record-payment');
    if (recordPaymentBtn) recordPaymentBtn.addEventListener('click', recordBillPayment);
    panelBody.querySelectorAll('.bill-payment-redo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paymentId = btn.getAttribute('data-payment');
        const lineId = btn.getAttribute('data-line');
        askReason({
          title: 'Remove this payment and redo it. Why?',
          hint: lineId
            ? 'The payment is voided and its bank line goes back to Reconcile so you can match or code it again. The bill goes back to unpaid. If that bank line was matched to several bills, all of those payments are removed. A bank month already closed in Reconcile Period must be reopened first.'
            : 'The payment is voided and the bill goes back to unpaid. Record the payment again afterwards.',
          required: true,
          onSubmit: async (reason) => {
            const base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug);
            const out = lineId
              ? await apiJson(base + '/bank-statement-lines/' + lineId + '/unreconcile', { method: 'POST', body: JSON.stringify({ reason }) })
              : await apiJson(base + '/bills/' + currentBillId + '/payments/' + paymentId + '/void', { method: 'POST', body: JSON.stringify({ reason }) });
            if (!out) return;
            if (!out.res.ok) { showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not remove the payment.'); return; }
            await loadBills();
            await openBillPanel(currentBillId);
          },
        });
      });
    });

    const scheduleToggleBtn = document.getElementById('bill-schedule-toggle');
    if (scheduleToggleBtn) scheduleToggleBtn.addEventListener('click', () => {
      const form = document.getElementById('bill-schedule-form');
      if (form) { form.hidden = !form.hidden; form.style.display = form.hidden ? 'none' : 'block'; }
    });
    const scheduleSaveBtn = document.getElementById('bill-schedule-save');
    if (scheduleSaveBtn) scheduleSaveBtn.addEventListener('click', scheduleBillPayment);
    const unscheduleBtn = document.getElementById('bill-unschedule');
    if (unscheduleBtn) unscheduleBtn.addEventListener('click', () => transitionBill(currentBillId, 'unschedule'));
  }

  async function savePostedEdit() {
    showPanelError('');
    const reason = (document.getElementById('bill-edit-reason').value || '').trim();
    const lines = Array.from(document.querySelectorAll('#bill-posted-lines [data-line]')).map((row) => {
      const account = row.querySelector('.bill-line-account').value;
      const program = row.querySelector('.bill-line-program').value;
      const grant = row.querySelector('.bill-line-grant').value;
      return { id: Number(row.getAttribute('data-line-id')), account_id: Number(account), program_id: Number(program), grant_id: grant ? Number(grant) : null, line_memo: row.querySelector('.bill-line-memo').value.trim() || null };
    });
    if (lines.some((l) => !l.account_id || !l.program_id)) { showPanelError('Every line needs an account and a program.'); return; }
    if (!reason) { showPanelError('Give a reason for the change.'); return; }
    const body = {
      reason, lines,
      due_date: document.getElementById('bill-due-date').value || null,
      reference: document.getElementById('bill-reference').value.trim() || null,
    };
    const rationale = document.getElementById('bill-rationale');
    if (rationale && !rationale.hidden) body.procurement_rationale = rationale.value.trim() || null;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + currentBillId, { method: 'PATCH', body: JSON.stringify(body) });
    if (!out) return;
    if (out.res.ok) {
      await loadBills();
      await openBillPanel(currentBillId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save the change.');
    }
  }

  async function scheduleBillPayment() {
    showPanelError('');
    const date = document.getElementById('bill-schedule-date').value;
    if (!date) { showPanelError('Payment date is required.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + currentBillId + '/schedule', {
      method: 'POST', body: JSON.stringify({ scheduled_payment_date: date }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadBills();
      await openBillPanel(currentBillId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not schedule this bill.');
    }
  }

  async function recordBillPayment() {
    showPanelError('');
    const paymentDate = document.getElementById('bill-payment-date').value;
    const bankAccountId = document.getElementById('bill-payment-account').value;
    const reference = document.getElementById('bill-payment-reference').value.trim() || null;
    const amountCents = inputToCents(document.getElementById('bill-payment-amount').value);
    if (!paymentDate) { showPanelError('Payment date is required.'); return; }
    if (!bankAccountId) { showPanelError('A bank account is required.'); return; }
    if (Number.isNaN(amountCents) || amountCents <= 0) { showPanelError('Amount must be a positive number.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + currentBillId + '/payments', {
      method: 'POST',
      body: JSON.stringify({ bank_account_id: Number(bankAccountId), payment_date: paymentDate, amount_cents: amountCents, reference }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadBills();
      await openBillPanel(currentBillId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not record payment.');
    }
  }

  async function saveBill() {
    showPanelError('');
    const vendorId = document.getElementById('bill-vendor').value;
    const billDate = document.getElementById('bill-date').value;
    const dueDate = document.getElementById('bill-due-date').value;
    const reference = document.getElementById('bill-reference').value.trim() || null;
    const rationale = document.getElementById('bill-rationale').value.trim() || null;
    if (!vendorId) { showPanelError('A vendor is required.'); return; }
    if (!billDate) { showPanelError('Bill date is required.'); return; }
    const lines = collectLines();
    if (!lines) return;

    let out;
    if (currentBillId == null) {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills', {
        method: 'POST',
        body: JSON.stringify({ constituent_id: Number(vendorId), bill_date: billDate, due_date: dueDate || null, reference, lines }),
      });
    } else {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + currentBillId, {
        method: 'PATCH',
        body: JSON.stringify({ constituent_id: Number(vendorId), due_date: dueDate || null, reference, procurement_rationale: rationale, lines }),
      });
    }
    if (!out) return;
    if (out.res.ok) {
      const fileToAttach = ocrFile;
      ocrFile = null;
      if (fileToAttach && currentBillId == null) {
        const uploadForm = new FormData();
        uploadForm.append('file', fileToAttach);
        uploadForm.append('category', 'vendor_bill');
        uploadForm.append('source_ref_type', 'bill');
        uploadForm.append('source_ref_id', String(out.data.id));
        await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents', {
          method: 'POST', body: uploadForm, credentials: 'same-origin',
        }).catch(() => {});
      }
      await loadBills();
      await openBillPanel(out.data.id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save bill.');
    }
  }

  function askReason(opts) {
    const old = document.getElementById('bill-reason-bar');
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = 'bill-reason-bar';
    bar.style.cssText = 'margin:0 0 12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm,6px);background:var(--surface-hover,#f8f8f8);';
    bar.innerHTML = '<label class="organizational-label">' + esc(opts.title) + '<input type="text" id="bill-reason-input" class="organizational-input" maxlength="500"></label>'
      + (opts.hint ? '<p class="organizational-hint" style="margin:4px 0 0;">' + esc(opts.hint) + '</p>' : '')
      + '<div style="display:flex;gap:8px;margin-top:8px;"><button type="button" id="bill-reason-ok" class="organizational-btn organizational-btn-primary" style="height:30px;font-size:0.8125rem;padding:0 12px;">' + esc(opts.confirmLabel) + '</button>'
      + '<button type="button" id="bill-reason-cancel" class="organizational-btn organizational-btn-outline" style="height:30px;font-size:0.8125rem;padding:0 12px;">Cancel</button></div>';
    panelBody.insertBefore(bar, panelBody.firstChild);
    const input = bar.querySelector('#bill-reason-input');
    input.focus();
    const submit = () => {
      const v = input.value.trim();
      if (opts.required && !v) { showPanelError('Say why.'); input.focus(); return; }
      showPanelError('');
      bar.remove();
      opts.onSubmit(v);
    };
    bar.querySelector('#bill-reason-ok').addEventListener('click', submit);
    bar.querySelector('#bill-reason-cancel').addEventListener('click', () => { bar.remove(); showPanelError(''); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  async function transitionBill(id, action, reason) {
    showPanelError('');
    const body = reason ? { reason } : undefined;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + id + '/' + action, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    if (!out) return;
    if (out.res.ok) {
      await loadBills();
      await openBillPanel(id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || ('Could not ' + action + ' bill.'));
    }
  }

  function billUrl(id) {
    const u = new URL(window.location.href);
    u.searchParams.delete('open_bill');
    if (id === undefined) u.searchParams.delete('bill'); else u.searchParams.set('bill', id === null ? 'new' : String(id));
    return u.pathname + u.search;
  }
  async function openBillPanel(id, opts) {
    showPanelError('');
    editingPosted = !!(opts && opts.editing);
    try {
      if (opts && opts.push) { window.history.pushState({ bill: id }, '', billUrl(id)); pagePushed = true; }
      else window.history.replaceState(window.history.state, '', billUrl(id));
    } catch (_) {}
    currentBillId = id || null;
    ocrFile = null;
    ocrExpectedTotalCents = null;
    if (ocrPreviewUrl) { URL.revokeObjectURL(ocrPreviewUrl); ocrPreviewUrl = null; }
    if (id) {
      panelTitle.textContent = 'Bill #' + id;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + id);
      if (!out || !out.res.ok) { showPanelError('Could not load bill.'); return; }
      let payments = null;
      if (out.data.bill && out.data.bill.status !== 'draft' && out.data.bill.status !== 'pending_approval') {
        const payOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + id + '/payments');
        payments = payOut && payOut.res.ok ? payOut.data.payments : [];
      }
      billData = { bill: out.data.bill, lines: out.data.lines, payments };
      panelBody.innerHTML = renderPanelBody(out.data.bill, out.data.lines, payments);
      window.OrganizationalDocumentAttach.wire(panelBody, { slug: currentSlug, sourceRefType: 'bill', sourceRefId: id });
      wirePanelBody(out.data.bill);
      const notesEl = document.getElementById('organizational-bill-page-notes');
      if (notesEl) window.OrganizationalRecordNotes.mount(notesEl, { slug: currentSlug, type: 'bill', id });
    } else {
      panelTitle.textContent = 'New bill';
      const copy = opts && opts.copy;
      panelBody.innerHTML = renderPanelBody(null, copy && copy.lines && copy.lines.length ? copy.lines : null);
      wirePanelBody(null);
      if (copy && copy.bill) {
        const vend = document.getElementById('bill-vendor');
        const vendInput = document.getElementById('bill-vendor-input');
        if (vend) vend.value = copy.bill.constituent_id ? String(copy.bill.constituent_id) : '';
        if (vendInput) vendInput.value = copy.bill.vendor_name || copy.bill.contact_name || '';
      }
      const notesNew = document.getElementById('organizational-bill-page-notes');
      if (notesNew) notesNew.innerHTML = '';
    }
    if (!canWrite) {
      panelBody.querySelectorAll('input, select, textarea, .bill-remove-line, .doc-attach-upload-btn').forEach((el) => { el.disabled = true; });
      panelBody.querySelectorAll('#bill-add-line, #bill-ocr-toggle').forEach((el) => { el.hidden = true; });
    }
    listEl.hidden = true;
    page.hidden = false;
  }
  function closeBillPanel(opts) {
    if (ocrPreviewUrl) { URL.revokeObjectURL(ocrPreviewUrl); ocrPreviewUrl = null; }
    page.hidden = true;
    listEl.hidden = false;
    if (opts && opts.silent) return;
    try { window.history.replaceState(window.history.state, '', billUrl(undefined)); } catch (_) {}
    pagePushed = false;
  }
  function leaveBillPage() {
    if (pagePushed) { window.history.back(); return; }
    closeBillPanel();
  }
  window.addEventListener('popstate', function () {
    if (!page || !currentSlug) return;
    const b = new URLSearchParams(window.location.search).get('bill');
    if (b === null) { pagePushed = false; closeBillPanel({ silent: true }); return; }
    pagePushed = false;
    openBillPanel(b === 'new' ? null : Number(b));
  });

  const agingSortState = { index: -1, dir: null };
  let agingData = null;
  const AGING_LABELS = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': '90+ days' };
  const AGING_COLUMNS = [
    { key: 'name', type: 'text', get: (e) => e.vendor_name },
    { key: 'reference', type: 'text', get: (e) => e.reference },
    { key: 'total', type: 'number', get: (e) => e.total_cents },
  ];

  function renderAgingRows() {
    const body = agingPanelBody.querySelector('tbody');
    if (!body || !agingData) return;
    const sort = (entries) => {
      const i = agingSortState.index;
      return i >= 0 && agingSortState.dir && window.OrganizationalTableSort
        ? window.OrganizationalTableSort.sortArray(entries, AGING_COLUMNS[i], agingSortState.dir)
        : entries;
    };
    body.innerHTML = Object.keys(AGING_LABELS).map((key) => {
      const entries = (agingData.buckets && agingData.buckets[key]) || [];
      const total = (agingData.totals && agingData.totals[key]) || 0;
      return '<tr style="background:var(--surface-active);"><td colspan="3" style="font-weight:700;font-size:0.6875rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);padding:8px 14px;">' + AGING_LABELS[key] + ' — ' + fmtMoney(total) + '</td></tr>'
        + (entries.length
          ? sort(entries).map((e) => (
              '<tr style="font-size:0.8125rem;">'
              + '<td>' + esc(e.vendor_name) + '</td>'
              + '<td>' + esc(e.reference || '—') + '</td>'
              + '<td style="text-align:right;">' + fmtMoney(e.total_cents) + '</td>'
              + '</tr>'
            )).join('')
          : '<tr><td colspan="3" class="organizational-empty" style="font-size:0.8125rem;">None</td></tr>');
    }).join('');
  }

  function renderAgingPanel(data) {
    agingData = data;
    agingPanelBody.innerHTML = '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="AP aging report"><thead><tr><th>Vendor</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead><tbody></tbody></table></div>';
    if (window.OrganizationalTableSort) {
      window.OrganizationalTableSort.attach(agingPanelBody.querySelector('table'), { columns: AGING_COLUMNS, state: agingSortState, onChange: renderAgingRows });
    }
    renderAgingRows();
  }

  async function openBillsAgingPanel() {
    agingPanelBody.innerHTML = '<p class="organizational-empty">Loading…</p>';
    agingPanel.classList.add('organizational-panel-is-open');
    agingPanelOverlay.classList.add('organizational-panel-is-open');
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/aging-report');
    if (!out || !out.res.ok) { agingPanelBody.innerHTML = '<p class="organizational-panel-error">Could not load the AP aging report.</p>'; return; }
    renderAgingPanel(out.data);
  }
  function closeBillsAgingPanel() {
    agingPanel.classList.remove('organizational-panel-is-open');
    agingPanelOverlay.classList.remove('organizational-panel-is-open');
  }

  const CN_STATUS_LABELS = { draft: 'Draft', applied: 'Applied', void: 'Void' };
  function cnFormHtml() {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Vendor *<div id="cn-vendor-field" class="organizational-contact-picker-mount"></div></label>'
      + '<label class="organizational-label" style="flex:1">Original bill (optional)<select id="cn-bill" class="organizational-select"><option value="">— None —</option></select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Account *<select id="cn-account" class="organizational-select">' + accountOptions() + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Program *<select id="cn-program" class="organizational-select">' + programOptions() + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Date *<input type="date" id="cn-date" class="organizational-input"></label>'
      + '<label class="organizational-label" style="flex:1">Amount *<input type="text" inputmode="decimal" id="cn-amount" class="organizational-input organizational-formula-amount" placeholder="0.00"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Reason<input type="text" id="cn-reason" class="organizational-input"></label></div>'
      + '</div>'
      + '<p id="cn-error" class="organizational-panel-error" hidden></p>'
      + '<div class="organizational-panel-actions"><button type="button" id="cn-save" class="organizational-btn organizational-btn-primary">Create credit note</button></div>';
  }
  async function toggleCreditNoteForm() {
    const willOpen = cnFormEl.hidden;
    cnFormEl.hidden = !willOpen;
    if (!willOpen) return;
    cnFormEl.innerHTML = cnFormHtml();
    const cnVendorField = document.getElementById('cn-vendor-field');
    if (cnVendorField) {
      window.OrganizationalContactPicker.mount(cnVendorField, {
        getCache: () => vendorsCache, role: 'vendor', slug: currentSlug, valueElementId: 'cn-vendor',
      });
    }
    const billSelect = document.getElementById('cn-bill');
    if (billSelect && billsCache.length) {
      billSelect.innerHTML = '<option value="">— None —</option>' + billsCache.map((b) =>
        '<option value="' + b.id + '">#' + b.id + ' — ' + esc(b.vendor_name) + ' (' + fmtMoney(b.total_cents || 0) + ')</option>'
      ).join('');
    }
    document.getElementById('cn-save').addEventListener('click', createBillCreditNote);
  }
  async function createBillCreditNote() {
    const errEl2 = document.getElementById('cn-error');
    const show = (m) => { errEl2.textContent = m || ''; errEl2.hidden = !m; };
    const vendorId = document.getElementById('cn-vendor').value;
    const billId = document.getElementById('cn-bill').value;
    const accountId = document.getElementById('cn-account').value;
    const programId = document.getElementById('cn-program').value;
    const date = document.getElementById('cn-date').value;
    const amountCents = inputToCents(document.getElementById('cn-amount').value);
    const reason = document.getElementById('cn-reason').value.trim() || null;
    if (!vendorId || !accountId || !programId || !date) { show('Vendor, account, program, and date are required.'); return; }
    if (Number.isNaN(amountCents) || amountCents <= 0) { show('A positive amount is required.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bill-credit-notes', {
      method: 'POST',
      body: JSON.stringify({ constituent_id: Number(vendorId), original_bill_id: billId ? Number(billId) : null, account_id: Number(accountId), program_id: Number(programId), date, amount_cents: amountCents, reason }),
    });
    if (!out) return;
    if (out.res.ok) {
      cnFormEl.hidden = true;
      await loadBillCreditNotes();
    } else {
      show((out.data && out.data.error) || 'Could not create credit note.');
    }
  }
  let creditNotesCache = [];
  const creditNotesSorter = cnTbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(cnTbody.closest('table'), {
    columns: [
      { key: 'contact', type: 'text', get: (n) => n.contact_name },
      { key: 'original', type: 'number', get: (n) => n.original_bill_id },
      { key: 'amount', type: 'number', get: (n) => n.display_amount_cents != null ? n.display_amount_cents : n.amount_cents },
      { key: 'reason', type: 'text', get: (n) => n.reason },
      { key: 'status', type: 'text', get: (n) => CN_STATUS_LABELS[n.status] || n.status },
      null,
    ],
    onChange: () => renderCreditNotes(),
  }) : null;
  async function loadBillCreditNotes() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bill-credit-notes');
    creditNotesCache = (out && out.data && out.data.credit_notes) || [];
    renderCreditNotes();
  }

  function renderCreditNotes() {
    const notes = creditNotesCache;
    if (!cnTbody) return;
    cnTbody.innerHTML = notes.length ? (creditNotesSorter ? creditNotesSorter.sortRows(notes) : notes).map((n) => (
      '<tr>'
      + '<td>' + esc(n.contact_name) + '</td>'
      + '<td>' + (n.original_bill_id ? '#' + n.original_bill_id : '—') + '</td>'
      + '<td>' + fmtMoney(n.display_amount_cents != null ? n.display_amount_cents : n.amount_cents) + '</td>'
      + '<td>' + esc(n.reason || '—') + '</td>'
      + '<td>' + esc(CN_STATUS_LABELS[n.status] || n.status) + '</td>'
      + '<td>' + (n.status === 'draft' && canWrite
          ? '<button type="button" class="organizational-btn organizational-btn-outline cn-apply-btn" data-id="' + n.id + '" style="font-size:0.75rem;">Apply</button> '
            + '<button type="button" class="organizational-btn organizational-btn-outline cn-void-btn" data-id="' + n.id + '" style="font-size:0.75rem;">Void</button>'
          : n.status === 'applied' && canWrite
            ? '<button type="button" class="organizational-btn organizational-btn-outline cn-void-btn" data-id="' + n.id + '" data-applied="1" style="font-size:0.75rem;">Void</button>'
            : '')
      + '</td>'
      + '</tr>'
    )).join('') : '<tr class="organizational-table-empty"><td colspan="6">No credit notes yet.</td></tr>';
  }
  async function applyOrVoidBillCreditNote(id, action, reason) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bill-credit-notes/' + id + '/' + action, { method: 'POST', body: reason ? JSON.stringify({ reason }) : undefined });
    if (out && out.res.ok) await loadBillCreditNotes();
    else showError((out && out.data && out.data.error) || ('Could not ' + action + ' credit note.'));
  }

  function showVcPanelError(msg) { if (vcPanelErrEl) { vcPanelErrEl.textContent = msg || ''; vcPanelErrEl.hidden = !msg; } }

  function vendorComplianceBodyHtml(vc) {
    vc = vc || {};
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">TIN type<select id="vc-tin-type" class="organizational-select">'
      + '<option value="">— None —</option>'
      + '<option value="ein"' + (vc.tin_type === 'ein' ? ' selected' : '') + '>EIN</option>'
      + '<option value="ssn"' + (vc.tin_type === 'ssn' ? ' selected' : '') + '>SSN</option>'
      + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Tax entity type<input type="text" id="vc-tax-entity-type" class="organizational-input" value="' + esc(vc.tax_entity_type || '') + '"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Tax ID <span style="font-weight:400;color:var(--text-secondary);">(' + (vc.has_tax_id ? 'on file — leave blank to keep it unchanged' : 'not on file') + ')</span>'
      + '<input type="text" id="vc-tax-id" class="organizational-input" autocomplete="off" spellcheck="false" placeholder="' + (vc.has_tax_id ? 'Enter a new value to replace it' : 'Enter tax ID') + '"></label>'
      + (vc.has_tax_id ? '<label class="organizational-label" style="font-weight:400;font-size:0.8125rem;margin-top:4px;display:block;"><input type="checkbox" id="vc-clear-tax-id"> Clear stored tax ID</label>' : '')
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1;font-weight:400;"><input type="checkbox" id="vc-1099-eligible"' + (vc.is_1099_eligible ? ' checked' : '') + '> 1099 eligible</label>'
      + '<label class="organizational-label" style="flex:1;font-weight:400;"><input type="checkbox" id="vc-w9-received"' + (vc.w9_received ? ' checked' : '') + '> W-9 received</label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">W-9 received date<input type="date" id="vc-w9-received-at" class="organizational-input" value="' + esc(vc.w9_received_at ? String(vc.w9_received_at).slice(0, 10) : '') + '" ' + (vc.w9_received ? '' : 'disabled') + '></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Payment terms<input type="text" id="vc-payment-terms" class="organizational-input" value="' + esc(vc.payment_terms || '') + '"></label></div>'
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="vc-save" class="organizational-btn organizational-btn-primary">Save compliance data</button></div>';
  }

  function wireVendorCompliancePanel() {
    const w9Checkbox = document.getElementById('vc-w9-received');
    const w9Date = document.getElementById('vc-w9-received-at');
    if (w9Checkbox && w9Date) w9Checkbox.addEventListener('change', () => { w9Date.disabled = !w9Checkbox.checked; });
    const saveBtn = document.getElementById('vc-save');
    if (saveBtn) saveBtn.addEventListener('click', saveVendorCompliance);
  }

  async function openVendorCompliancePanel(constituentId) {
    showVcPanelError('');
    currentVendorComplianceConstituentId = constituentId;
    vcPanelTitle.textContent = 'Vendor compliance';
    vcPanelBody.innerHTML = '<p class="organizational-empty">Loading…</p>';
    vcPanel.classList.add('organizational-panel-is-open');
    vcPanelOverlay.classList.add('organizational-panel-is-open');
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + constituentId + '/vendor-compliance', { skip403Redirect: true });
    if (!out || !out.res.ok) {
      vcPanelBody.innerHTML = '';
      showVcPanelError(out && out.res && out.res.status === 403 ? 'Only admin and finance can view or edit vendor compliance data.' : 'Could not load vendor compliance data.');
      return;
    }
    vcPanelBody.innerHTML = vendorComplianceBodyHtml(out.data.vendor_compliance);
    wireVendorCompliancePanel();
  }
  function closeVendorCompliancePanel() {
    vcPanel.classList.remove('organizational-panel-is-open');
    vcPanelOverlay.classList.remove('organizational-panel-is-open');
  }

  async function saveVendorCompliance() {
    showVcPanelError('');
    const tinType = document.getElementById('vc-tin-type').value || null;
    const taxEntityType = document.getElementById('vc-tax-entity-type').value.trim() || null;
    const taxIdInput = document.getElementById('vc-tax-id').value;
    const clearCheckbox = document.getElementById('vc-clear-tax-id');
    const is1099Eligible = document.getElementById('vc-1099-eligible').checked;
    const w9Received = document.getElementById('vc-w9-received').checked;
    const w9ReceivedAt = document.getElementById('vc-w9-received-at').value || null;
    const paymentTerms = document.getElementById('vc-payment-terms').value.trim() || null;

    const body = {
      tin_type: tinType, tax_entity_type: taxEntityType, is_1099_eligible: is1099Eligible,
      w9_received: w9Received, w9_received_at: w9ReceivedAt, payment_terms: paymentTerms,
    };
    if (taxIdInput) body.tax_id = taxIdInput;
    else if (clearCheckbox && clearCheckbox.checked) body.tax_id = '';

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + currentVendorComplianceConstituentId + '/vendor-compliance', {
      method: 'PUT', body: JSON.stringify(body), skip403Redirect: true,
    });
    if (!out) return;
    if (out.res.ok) {
      vcPanelBody.innerHTML = vendorComplianceBodyHtml(out.data.vendor_compliance);
      wireVendorCompliancePanel();
    } else {
      showVcPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save vendor compliance data.');
    }
  }

  const SCHED_FREQ_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom_months: 'Custom months' };

  function scheduleLineRowHtml(l) {
    l = l || {};
    return '<div class="organizational-alloc-line-row" data-sched-line style="flex-wrap:wrap;row-gap:4px;">'
      + '<select class="organizational-select sched-line-account" style="min-width:150px;">' + accountOptions(l.account_id) + '</select>'
      + '<select class="organizational-select sched-line-program" style="min-width:110px;">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select sched-line-grant" style="min-width:110px;">' + grantOptions(l.grant_id) + '</select>'
      + '<input type="text" class="organizational-input sched-line-desc" placeholder="Description" maxlength="300" style="width:130px" value="' + esc(l.description) + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount sched-line-amount" placeholder="Amount" style="width:100px" value="' + (l.amount_cents != null ? (Number(l.amount_cents) / 100) : '') + '">'
      + '<button type="button" class="organizational-btn-icon sched-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function showScheduleFormError(msg) {
    const el = document.getElementById('billsched-error');
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }

  function collectScheduleLines() {
    const rows = Array.from(document.querySelectorAll('#billsched-lines-wrap [data-sched-line]'));
    const lines = [];
    for (const row of rows) {
      const accountId = row.querySelector('.sched-line-account').value;
      const programId = row.querySelector('.sched-line-program').value;
      const grantId = row.querySelector('.sched-line-grant').value;
      const amountCents = inputToCents(row.querySelector('.sched-line-amount').value);
      if (!accountId && !programId && !amountCents) continue;
      if (!accountId || !programId) { showScheduleFormError('Every line needs an account and a program.'); return null; }
      if (Number.isNaN(amountCents) || amountCents <= 0) { showScheduleFormError('Every line needs a positive amount.'); return null; }
      lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null, description: row.querySelector('.sched-line-desc').value.trim() || null, amount_cents: amountCents });
    }
    if (!lines.length) { showScheduleFormError('At least one line is required.'); return null; }
    return lines;
  }

  function scheduleFormHtml() {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Vendor *<div id="billsched-vendor-field" class="organizational-contact-picker-mount"></div></label>'
      + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="billsched-reference" class="organizational-input"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Frequency *<select id="billsched-frequency" class="organizational-select">'
      + Object.keys(SCHED_FREQ_LABELS).map((k) => '<option value="' + k + '">' + SCHED_FREQ_LABELS[k] + '</option>').join('')
      + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Next occurrence date *<input type="date" id="billsched-next-date" class="organizational-input"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row" id="billsched-months-row" hidden>'
      + '<label class="organizational-label" style="flex:1">Active months * <span style="font-weight:400;color:var(--text-secondary);">(comma-separated, 1–12)</span><input type="text" id="billsched-months" class="organizational-input" placeholder="e.g. 1,4,7,10"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">End date <span style="font-weight:400;color:var(--text-secondary);">(optional)</span><input type="date" id="billsched-end-date" class="organizational-input"></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Payment terms, days <span style="font-weight:400;color:var(--text-secondary);">(optional; the due date is this many days after each date)</span><input type="number" id="billsched-due-days" class="organizational-input" min="0" max="365" step="1" placeholder="e.g. 30"></label></div>'
      + '<div class="organizational-panel-section-head">Line items</div>'
      + '<div id="billsched-lines-wrap">' + scheduleLineRowHtml() + '</div>'
      + '<button type="button" id="billsched-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem;margin-top:6px;">+ Add line</button>'
      + '</div>'
      + '<p id="billsched-error" class="organizational-panel-error" hidden></p>'
      + '<div class="organizational-panel-actions"><button type="button" id="billsched-save" class="organizational-btn organizational-btn-primary">Create schedule</button></div>';
  }

  async function toggleBillScheduleForm() {
    const willOpen = schedFormEl.hidden;
    schedFormEl.hidden = !willOpen;
    if (!willOpen) return;
    schedFormEl.innerHTML = scheduleFormHtml();
    const schedVendorField = document.getElementById('billsched-vendor-field');
    if (schedVendorField) {
      window.OrganizationalContactPicker.mount(schedVendorField, {
        getCache: () => vendorsCache, role: 'vendor', slug: currentSlug, valueElementId: 'billsched-vendor',
      });
    }
    const linesWrap = document.getElementById('billsched-lines-wrap');
    const addLineBtn = document.getElementById('billsched-add-line');
    if (addLineBtn) addLineBtn.addEventListener('click', () => linesWrap.insertAdjacentHTML('beforeend', scheduleLineRowHtml()));
    if (linesWrap) linesWrap.addEventListener('click', (e) => {
      const rm = e.target.closest('.sched-remove-line');
      if (rm && linesWrap.children.length > 1) rm.closest('[data-sched-line]').remove();
    });
    const freqSelect = document.getElementById('billsched-frequency');
    const monthsRow = document.getElementById('billsched-months-row');
    if (freqSelect && monthsRow) freqSelect.addEventListener('change', () => { monthsRow.hidden = freqSelect.value !== 'custom_months'; });
    document.getElementById('billsched-save').addEventListener('click', createBillSchedule);
  }

  async function createBillSchedule() {
    showScheduleFormError('');
    const vendorId = document.getElementById('billsched-vendor').value;
    const reference = document.getElementById('billsched-reference').value.trim() || null;
    const frequency = document.getElementById('billsched-frequency').value;
    const nextDate = document.getElementById('billsched-next-date').value;
    const endDate = document.getElementById('billsched-end-date').value || null;
    const dueDaysRaw = document.getElementById('billsched-due-days').value.trim();
    const dueDays = dueDaysRaw === '' ? null : Number(dueDaysRaw);
    if (dueDays != null && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365)) { showScheduleFormError('Payment terms must be a whole number of days, 0 to 365.'); return; }
    const monthsRaw = document.getElementById('billsched-months').value.trim();
    if (!vendorId) { showScheduleFormError('A vendor is required.'); return; }
    if (!nextDate) { showScheduleFormError('Next occurrence date is required.'); return; }
    let activeMonths = null;
    if (frequency === 'custom_months') {
      activeMonths = monthsRaw.split(',').map((m) => Number(m.trim())).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
      if (!activeMonths.length) { showScheduleFormError('Active months are required for custom_months frequency.'); return; }
    }
    const lines = collectScheduleLines();
    if (!lines) return;

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules', {
      method: 'POST',
      body: JSON.stringify({
        schedule_type: 'bill', frequency, active_months: activeMonths, next_occurrence_date: nextDate, end_date: endDate,
        template: { constituent_id: Number(vendorId), reference, due_days: dueDays, lines },
      }),
    });
    if (!out) return;
    if (out.res.ok) {
      schedFormEl.hidden = true;
      await loadBillSchedules();
    } else {
      showScheduleFormError((out.data && (out.data.message || out.data.error)) || 'Could not create recurring schedule.');
    }
  }

  let schedulesCache = [];
  const schedulesSorter = schedTbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(schedTbody.closest('table'), {
    columns: [
      { key: 'contact', type: 'text', get: (s) => s.contact_name },
      { key: 'frequency', type: 'text', get: (s) => SCHED_FREQ_LABELS[s.frequency] || s.frequency },
      { key: 'next', type: 'date', get: (s) => s.next_occurrence_date },
      { key: 'end', type: 'date', get: (s) => s.end_date },
      { key: 'status', type: 'text', get: (s) => (s.active ? 'Active' : 'Inactive') },
      null,
    ],
    onChange: () => renderSchedules(),
  }) : null;

  async function loadBillSchedules() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules?schedule_type=bill');
    schedulesCache = (out && out.data && out.data.schedules) || [];
    renderSchedules();
  }

  function renderSchedules() {
    const schedules = schedulesCache;
    if (!schedTbody) return;
    schedTbody.innerHTML = schedules.length ? (schedulesSorter ? schedulesSorter.sortRows(schedules) : schedules).map((s) => (
      '<tr>'
      + '<td>' + esc(s.contact_name || '—') + '</td>'
      + '<td>' + esc(SCHED_FREQ_LABELS[s.frequency] || s.frequency) + '</td>'
      + '<td>' + esc(String(s.next_occurrence_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(s.end_date ? String(s.end_date).slice(0, 10) : '—') + '</td>'
      + '<td>' + (s.active ? '<span class="organizational-badge">Active</span>' : '<span class="organizational-badge">Inactive</span>') + '</td>'
      + '<td>' + (s.active && canWrite ? '<button type="button" class="organizational-btn organizational-btn-outline billsched-deactivate-btn" data-id="' + s.id + '" style="font-size:0.75rem;">Deactivate</button>' : '') + '</td>'
      + '</tr>'
    )).join('') : '<tr class="organizational-table-empty"><td colspan="6">No recurring schedules yet.</td></tr>';
  }

  async function deactivateBillSchedule(id) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules/' + id + '/deactivate', { method: 'POST' });
    if (out && out.res.ok) await loadBillSchedules();
    else showError((out && out.data && out.data.error) || 'Could not deactivate schedule.');
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    if (tbody) tbody.addEventListener('click', (e) => {
      const row = e.target.closest('.organizational-bills-row');
      if (row) openBillPanel(Number(row.getAttribute('data-id')), { push: true });
    });
    if (addBtn) addBtn.addEventListener('click', () => openBillPanel(null, { push: true }));
    [pageBack, pageBackBills].forEach((a) => { if (a) a.addEventListener('click', (e) => { e.preventDefault(); leaveBillPage(); }); });
    if (filterStatus) filterStatus.addEventListener('change', loadBills);
    if (agingBtn) agingBtn.addEventListener('click', openBillsAgingPanel);
    if (agingPanelClose) agingPanelClose.addEventListener('click', closeBillsAgingPanel);
    if (agingPanelOverlay) agingPanelOverlay.addEventListener('click', closeBillsAgingPanel);
    if (cnAddBtn) cnAddBtn.addEventListener('click', toggleCreditNoteForm);
    if (cnTbody) cnTbody.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('.cn-apply-btn');
      if (applyBtn) { applyOrVoidBillCreditNote(Number(applyBtn.getAttribute('data-id')), 'apply'); return; }
      const voidBtn = e.target.closest('.cn-void-btn');
      if (voidBtn) {
        let reason;
        if (voidBtn.getAttribute('data-applied')) {
          reason = (window.prompt('Why is this applied credit note being voided? Its ledger entry will be voided.') || '').trim();
          if (!reason) return;
        }
        applyOrVoidBillCreditNote(Number(voidBtn.getAttribute('data-id')), 'void', reason);
      }
    });
    if (vcPanelClose) vcPanelClose.addEventListener('click', closeVendorCompliancePanel);
    if (vcPanelOverlay) vcPanelOverlay.addEventListener('click', closeVendorCompliancePanel);
    if (schedAddBtn) schedAddBtn.addEventListener('click', toggleBillScheduleForm);
    if (schedTbody) schedTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.billsched-deactivate-btn');
      if (btn) deactivateBillSchedule(Number(btn.getAttribute('data-id')));
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (agingPanel && agingPanel.classList.contains('organizational-panel-is-open')) { closeBillsAgingPanel(); return; }
    if (vcPanel && vcPanel.classList.contains('organizational-panel-is-open')) { closeVendorCompliancePanel(); return; }
  });

  async function initPurchases(slug) {
    currentSlug = slug;
    const manageVendorsLink = document.getElementById('organizational-bills-manage-vendors-link');
    if (manageVendorsLink) manageVendorsLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/contacts?role=vendor&from=purchases';
    wireOnce();
    const wantedFilter = new URLSearchParams(window.location.search).get('filter');
    if (BILL_FILTERS[wantedFilter]) listFilter = wantedFilter;
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    canWrite = !access || access.can_write_accounting !== false;
    const org = window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    canCompliance = ['admin', 'finance', 'staff'].includes(String((org && org.role) || '').toLowerCase());
    [addBtn, cnAddBtn, schedAddBtn].forEach((b) => { if (b) b.hidden = !canWrite; });
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug), loadVendors(slug)]);
    await loadBills();
    showFilterNote();
    await loadBillCreditNotes();
    await loadBillSchedules();
    const sp = new URLSearchParams(window.location.search);
    const wanted = sp.get('bill') || sp.get('open_bill');
    if (wanted === 'new') await openBillPanel(null);
    else if (Number.isInteger(Number(wanted)) && Number(wanted) > 0) await openBillPanel(Number(wanted));
  }

  window.OrganizationalAccounting.purchases = { init: initPurchases, closePage: closeBillPanel };
})();
