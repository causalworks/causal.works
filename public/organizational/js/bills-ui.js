(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  // ── DOM refs ──
  const errEl        = document.getElementById('organizational-org-error');
  const tbody         = document.getElementById('organizational-bills-tbody');
  const filterStatus  = document.getElementById('organizational-bills-filter-status');
  const addBtn        = document.getElementById('organizational-bills-add');

  const panel        = document.getElementById('organizational-bills-panel');
  const panelOverlay = document.getElementById('organizational-bills-panel-overlay');
  const panelBody     = document.getElementById('organizational-bills-panel-body');
  const panelTitle    = document.getElementById('organizational-bills-panel-title');
  const panelClose     = document.getElementById('organizational-bills-panel-close');
  const panelErrEl     = document.getElementById('organizational-bills-panel-error');

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

  // ── State ──
  let currentSlug   = '';
  let accountsCache = [];
  let programsCache = [];
  let grantsCache   = [];
  let vendorsCache  = [];
  let wired         = false;
  let currentBillId = null; // null while the panel is in "new bill" mode
  let billsCache    = []; // last-loaded bills list, reused by the credit-note form's "original bill" picker
  let currentVendorComplianceConstituentId = null;
  let ocrFile = null; // the file the OCR scan just read, held until the bill is actually created (see saveBill)
  let ocrPreviewUrl = null; // object URL for the chosen file's inline preview -- revoked on re-pick/panel-close
  let ocrExpectedTotalCents = null; // total_amount_cents read off the scanned bill, if any -- compared against the running line-sum so a line breakdown that doesn't add up to the bill is visible immediately, not discovered on submit

  const esc     = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

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
    return '<span class="organizational-badge">' + esc(STATUS_LABELS[status] || status) + '</span>';
  }

  // ── Reference data ──
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
    // GET /constituents responds with a bare array, not { constituents: [...] }.
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents?role=vendor&active=true');
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

  // ── List ──
  async function loadBills() {
    const params = new URLSearchParams();
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills?' + params.toString());
    if (!out) return;
    billsCache = (out.data && out.data.bills) || [];
    renderRows(billsCache);
  }

  function renderRows(bills) {
    if (!tbody) return;
    if (!bills.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No bills yet.</td></tr>';
      return;
    }
    tbody.innerHTML = bills.map((b) => (
      '<tr class="organizational-bills-row" data-id="' + b.id + '" style="cursor:pointer;">'
      + '<td>' + esc(b.vendor_name) + '</td>'
      + '<td>' + esc(String(b.bill_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(String(b.due_date || '').slice(0, 10) || '—') + '</td>'
      + '<td>' + esc(b.reference || '—') + '</td>'
      + '<td>' + fmtMoney(b.total_cents || 0) + '</td>'
      + '<td>' + statusBadge(b.status) + '</td>'
      + '</tr>'
    )).join('');
  }

  // ── Line rows (create/edit, draft only) ──
  function lineRowHtml(l) {
    l = l || {};
    return '<div class="organizational-alloc-line-row" data-line style="flex-wrap:wrap;row-gap:4px;">'
      + '<select class="organizational-select bill-line-account" style="min-width:150px;">' + accountOptions(l.account_id) + '</select>'
      + '<select class="organizational-select bill-line-program" style="min-width:110px;">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select bill-line-grant" style="min-width:110px;">' + grantOptions(l.grant_id) + '</select>'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount bill-line-amount" placeholder="Amount (or =192+268.50)" style="width:140px" value="' + (l.amount_cents != null ? (Number(l.amount_cents) / 100) : '') + '">'
      + '<button type="button" class="organizational-btn-icon bill-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function readOnlyLineHtml(l) {
    return '<div class="organizational-panel-field-row" style="font-size:0.85rem;padding:4px 0;border-bottom:1px solid var(--border);">'
      + '<span style="flex:2;">' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + '</span>'
      + '<span style="flex:1;">' + esc(l.program_name) + '</span>'
      + '<span style="flex:1;">' + esc(l.grant_name || '—') + '</span>'
      + '<span style="flex:1;text-align:right;">' + fmtMoney(l.amount_cents) + '</span>'
      + '</div>';
  }

  function paymentHtml(p) {
    return '<div class="organizational-panel-field-row" style="font-size:0.8125rem;padding:4px 0;border-bottom:1px solid var(--border);align-items:center;">'
      + '<span style="flex:1;">' + esc(String(p.payment_date).slice(0, 10)) + '</span>'
      + '<span style="flex:1;">' + esc(p.bank_account_code ? p.bank_account_code + ' — ' + p.bank_account_name : p.bank_account_name) + '</span>'
      + '<span style="flex:1;">' + esc(p.reference || '—') + '</span>'
      + '<span style="flex:1;text-align:right;">' + fmtMoney(p.amount_cents) + '</span>'
      + (p.status === 'posted'
        ? '<button type="button" class="organizational-btn organizational-btn-outline bill-payment-void" data-payment-id="' + p.id + '" style="font-size:0.75rem;padding:2px 8px;margin-left:8px;">Void</button>'
        : '<span style="flex:0 0 auto;margin-left:8px;color:var(--text-secondary);">Voided</span>')
      + '</div>';
  }

  function renderPanelBody(bill, lines, payments) {
    const isDraft = !bill || bill.status === 'draft';
    const linesHtml = isDraft
      ? '<div id="bill-lines-wrap">' + (lines && lines.length ? lines.map(lineRowHtml).join('') : lineRowHtml()) + '</div>'
        + '<button type="button" id="bill-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem;margin-top:6px;">+ Add line</button>'
        + '<div id="bill-lines-total" style="font-size:0.8125rem;color:var(--text-secondary);margin-top:6px;text-align:right;"></div>'
      : '<div style="margin-top:6px;">'
        + '<div class="organizational-panel-field-row" style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;"><span style="flex:2;">Account</span><span style="flex:1;">Program</span><span style="flex:1;">Grant</span><span style="flex:1;text-align:right;">Amount</span></div>'
        + (lines || []).map(readOnlyLineHtml).join('')
        + '</div>';
    const totalCents = (lines || []).reduce((s, l) => s + Number(l.amount_cents), 0);
    const paidCents = (payments || []).filter((p) => p.status === 'posted').reduce((s, p) => s + Number(p.amount_cents), 0);
    const remainingCents = totalCents - paidCents;

    const actions = [];
    if (!bill) {
      actions.push('<button type="button" id="bill-save" class="organizational-btn organizational-btn-primary">Create bill</button>');
    } else if (bill.status === 'draft') {
      actions.push('<button type="button" id="bill-save" class="organizational-btn organizational-btn-outline">Save changes</button>');
      actions.push('<button type="button" id="bill-submit" class="organizational-btn organizational-btn-primary">Submit for approval</button>');
      actions.push('<button type="button" id="bill-void" class="organizational-btn organizational-btn-outline">Void</button>');
    } else if (bill.status === 'pending_approval') {
      actions.push('<button type="button" id="bill-approve" class="organizational-btn organizational-btn-primary">Approve</button>');
      actions.push('<button type="button" id="bill-void" class="organizational-btn organizational-btn-outline">Void</button>');
    } else if (bill.status === 'scheduled') {
      actions.push('<button type="button" id="bill-record-payment" class="organizational-btn organizational-btn-primary">Record payment</button>');
      actions.push('<button type="button" id="bill-unschedule" class="organizational-btn organizational-btn-outline">Cancel scheduling</button>');
    } else if (['approved', 'partially_paid'].includes(bill.status)) {
      actions.push('<button type="button" id="bill-record-payment" class="organizational-btn organizational-btn-primary">Record payment</button>');
      if (bill.status === 'approved') actions.push('<button type="button" id="bill-schedule-toggle" class="organizational-btn organizational-btn-outline">Schedule payment…</button>');
    }

    // Scheduling (spec's `scheduled` status, unreachable until now) -- deliberately manual on
    // both ends: this just records an intended date, nothing pays itself automatically. Shown as
    // a collapsed mini-form under Approved (toggled by "Schedule payment…") and as a plain date
    // display once actually scheduled.
    let scheduleSection = '';
    if (bill && bill.status === 'scheduled') {
      scheduleSection = '<div class="organizational-panel-field-full" style="font-size:0.8125rem;color:var(--text-secondary);">Scheduled to pay on <b>' + esc(String(bill.scheduled_payment_date || '').slice(0, 10)) + '</b> — can still be paid early below.</div>';
    } else if (bill && bill.status === 'approved') {
      scheduleSection = '<div class="organizational-panel-field-row" id="bill-schedule-form" hidden>'
        + '<label class="organizational-label" style="flex:1">Payment date *<input type="date" id="bill-schedule-date" class="organizational-input"></label>'
        + '<div style="flex:1;align-self:flex-end;"><button type="button" id="bill-schedule-save" class="organizational-btn organizational-btn-outline">Save schedule</button></div>'
        + '</div>';
    }

    // Bills now carry more than one payment over time, same as invoices -- the payment history
    // list and the "record another one" form coexist here whenever there's a balance left,
    // rather than one replacing the other the way the old approved/paid binary split worked.
    let paymentSection = '';
    if (bill && !isDraft && bill.status !== 'pending_approval') {
      const historyHtml = payments && payments.length
        ? '<div class="organizational-panel-section-head">Payments — ' + fmtMoney(paidCents) + ' of ' + fmtMoney(totalCents) + (remainingCents > 0 ? ', ' + fmtMoney(remainingCents) + ' remaining' : '') + '</div>'
          + payments.map(paymentHtml).join('')
        : '';
      const canRecordPayment = ['approved', 'scheduled', 'partially_paid'].includes(bill.status) && remainingCents > 0;
      const formHtml = canRecordPayment
        ? '<div class="organizational-panel-section-head">Record payment</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Payment date *<input type="date" id="bill-payment-date" class="organizational-input"></label>'
          + '<label class="organizational-label" style="flex:1">Bank account *<select id="bill-payment-account" class="organizational-select">' + cashAccountOptions() + '</select></label>'
          + '</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="bill-payment-reference" class="organizational-input"></label>'
          + '<label class="organizational-label" style="flex:1">Amount * <span style="font-weight:400;color:var(--text-secondary);">(up to ' + fmtMoney(remainingCents) + ')</span><input type="text" inputmode="decimal" id="bill-payment-amount" class="organizational-input organizational-formula-amount" value="' + (remainingCents / 100).toFixed(2) + '"></label>'
          + '</div>'
        : '';
      paymentSection = historyHtml + formHtml;
    }

    const ocrSectionHtml = bill ? '' : (
      '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Vendor bill file (optional — we\'ll try to pre-fill the fields below; attaches once the bill is created)</label>'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<input type="file" id="bill-ocr-file" class="organizational-input" accept="image/*,application/pdf" style="flex:1;">'
      + '<div id="bill-ocr-preview" style="flex:0 0 auto;" hidden></div>'
      + '</div>'
      + '<p id="bill-ocr-status" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div>'
    );

    return '<div class="organizational-panel-fields">'
      + (bill ? '<div class="organizational-panel-field-full">' + statusBadge(bill.status) + '</div>' : '')
      + ocrSectionHtml
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Vendor *<div id="bill-vendor-field" class="organizational-contact-picker-mount"></div></label>'
      + '<div style="flex:0 0 auto;align-self:flex-end;"><button type="button" id="bill-vendor-compliance-btn" class="organizational-btn organizational-btn-outline" style="font-size:0.8rem;">Edit compliance</button></div>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Bill date *<input type="date" id="bill-date" class="organizational-input" value="' + esc((bill && bill.bill_date) ? String(bill.bill_date).slice(0, 10) : '') + '" ' + (isDraft ? '' : 'disabled') + '></label>'
      + '<label class="organizational-label" style="flex:1">Due date<input type="date" id="bill-due-date" class="organizational-input" value="' + esc((bill && bill.due_date) ? String(bill.due_date).slice(0, 10) : '') + '" ' + (isDraft ? '' : 'disabled') + '></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Reference<input type="text" id="bill-reference" class="organizational-input" value="' + esc(bill ? bill.reference : '') + '" ' + (isDraft ? '' : 'disabled') + '></label></div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Procurement rationale <span style="font-weight:400;color:var(--text-secondary);">(required if this bill crosses $15,000 on a federal-award grant; at/above $250,000 also attach a solicitation package or 3+ quotes below)</span><textarea id="bill-rationale" rows="2" ' + (isDraft ? '' : 'disabled') + '>' + esc(bill ? bill.procurement_rationale : '') + '</textarea></label></div>'
      + scheduleSection
      + '<div class="organizational-panel-section-head">Lines</div>'
      + linesHtml
      + paymentSection
      + (bill ? window.OrganizationalDocumentAttach.html('bill', ['procurement_quote', 'procurement_solicitation', 'vendor_bill', 'other']) : '')
      + '</div>'
      + '<div class="organizational-panel-actions">' + actions.join('') + '</div>';
  }

  function updateBillLinesTotal() {
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
      lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null, amount_cents: amountCents });
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
    // Running total of the line breakdown, live as amounts change -- surfaced because a bill
    // split across several account/program lines had no visible check that the split actually
    // adds back up to the bill (found in testing: nothing showed the lines summing to the total).
    if (linesWrap) linesWrap.addEventListener('input', (e) => {
      if (e.target.classList.contains('bill-line-amount')) updateBillLinesTotal();
    });
    updateBillLinesTotal();

    // Bill OCR prefill -- read-only, best-effort, same discipline as Expense Claims' receipt
    // scan (expense-claims.js): never blocks the form, a failed/unclear read just leaves the
    // fields for manual entry. Header fields only (vendor, dates, reference, first line's
    // amount) -- no scanned document can know this org's chart of accounts, so line
    // account_id/program_id are never touched. Not present in edit mode (see ocrSectionHtml).
    const ocrInput = document.getElementById('bill-ocr-file');
    const ocrStatus = document.getElementById('bill-ocr-status');
    const ocrPreviewEl = document.getElementById('bill-ocr-preview');
    if (ocrInput) ocrInput.addEventListener('change', async () => {
      ocrFile = ocrInput.files && ocrInput.files[0];
      if (!ocrFile) return;

      // Show the file itself alongside the form so a value OCR misread (or anything
      // handwritten, e.g. a procurement note) can be checked and typed in directly.
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
      // The model has no visibility into this org's vendor list, so it only ever returns a
      // name string -- a confident pick still requires a real name match here, otherwise the
      // picker is left as-is for a human to search/select.
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
          // No confident match -- pre-fill the search box with the read name so it's ready to
          // either pick a close match or use "+ Add new vendor" without retyping, but leave
          // the hidden id blank so nothing gets silently selected.
          if (visible) visible.value = ext.counterparty_name;
          vendorMatchNote = ' No matching vendor found for "' + ext.counterparty_name + '" — pick one or add a new vendor above.';
        }
      }
      ocrStatus.textContent = 'Pre-filled from the bill — review before saving.' + vendorMatchNote;
    });

    const vcBtn = document.getElementById('bill-vendor-compliance-btn');
    if (vcBtn) vcBtn.addEventListener('click', () => {
      const vendorSelect = document.getElementById('bill-vendor');
      const vendorId = vendorSelect ? vendorSelect.value : '';
      if (!vendorId) { showPanelError('Select a vendor first.'); return; }
      openVendorCompliancePanel(Number(vendorId));
    });

    const saveBtn = document.getElementById('bill-save');
    if (saveBtn) saveBtn.addEventListener('click', saveBill);
    const submitBtn = document.getElementById('bill-submit');
    if (submitBtn) submitBtn.addEventListener('click', () => transitionBill(currentBillId, 'submit'));
    const approveBtn = document.getElementById('bill-approve');
    if (approveBtn) approveBtn.addEventListener('click', () => transitionBill(currentBillId, 'approve'));
    const voidBtn = document.getElementById('bill-void');
    if (voidBtn) voidBtn.addEventListener('click', () => transitionBill(currentBillId, 'void'));
    const recordPaymentBtn = document.getElementById('bill-record-payment');
    if (recordPaymentBtn) recordPaymentBtn.addEventListener('click', recordBillPayment);
    panelBody.querySelectorAll('.bill-payment-void').forEach((btn) => {
      btn.addEventListener('click', () => voidBillPayment(Number(btn.getAttribute('data-payment-id'))));
    });

    const scheduleToggleBtn = document.getElementById('bill-schedule-toggle');
    if (scheduleToggleBtn) scheduleToggleBtn.addEventListener('click', () => {
      const form = document.getElementById('bill-schedule-form');
      if (form) form.hidden = !form.hidden;
    });
    const scheduleSaveBtn = document.getElementById('bill-schedule-save');
    if (scheduleSaveBtn) scheduleSaveBtn.addEventListener('click', scheduleBillPayment);
    const unscheduleBtn = document.getElementById('bill-unschedule');
    if (unscheduleBtn) unscheduleBtn.addEventListener('click', () => transitionBill(currentBillId, 'unschedule'));
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

  async function voidBillPayment(paymentId) {
    showPanelError('');
    const reason = window.prompt('This will void the payment and reopen the bill for payment. Reason?');
    if (reason == null) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + currentBillId + '/payments/' + paymentId + '/void', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadBills();
      await openBillPanel(currentBillId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not void payment.');
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
      // Attach the same file the OCR scan already read, now against the real bill id -- the
      // OCR endpoint itself persists nothing, so this is the actual bill document (same
      // pattern as expense-claims.js's post-creation receipt upload). Only applies on create;
      // ocrFile is null on an edit (no OCR/receipt section there, see ocrSectionHtml above).
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
      // Sequential, deliberately not parallel: racing this against openBillPanel's own fetch
      // (via Promise.all, or by firing loadBills() unawaited) caused real collisions -- an
      // aborted fetch once, a full 10s timeout another time. The list refresh is cheap; not
      // worth reintroducing that risk to save ~200ms.
      await loadBills();
      await openBillPanel(out.data.id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save bill.');
    }
  }

  async function transitionBill(id, action) {
    showPanelError('');
    let body;
    if (action === 'void') {
      const reason = window.prompt('This will void the bill. Continue?');
      if (reason == null) return;
    }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/' + id + '/' + action, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    if (!out) return;
    if (out.res.ok) {
      // Sequential, deliberately not parallel -- see saveBill()'s comment above.
      await loadBills();
      await openBillPanel(id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || ('Could not ' + action + ' bill.'));
    }
  }

  async function openBillPanel(id) {
    showPanelError('');
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
      panelBody.innerHTML = renderPanelBody(out.data.bill, out.data.lines, payments);
      window.OrganizationalDocumentAttach.wire(panelBody, { slug: currentSlug, sourceRefType: 'bill', sourceRefId: id });
      wirePanelBody(out.data.bill);
    } else {
      panelTitle.textContent = 'New bill';
      panelBody.innerHTML = renderPanelBody(null, null);
      wirePanelBody(null);
    }
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
  }
  function closeBillPanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
  }

  // ── AP Aging report (spec 3.7) ──
  function agingBucketsHtml(data, nameKey) {
    const labels = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': '90+ days' };
    return Object.keys(labels).map((key) => {
      const entries = (data.buckets && data.buckets[key]) || [];
      const total = (data.totals && data.totals[key]) || 0;
      return '<div class="organizational-panel-section-head">' + labels[key] + ' — ' + fmtMoney(total) + '</div>'
        + (entries.length
          ? entries.map((e) => (
              '<div class="organizational-panel-field-row" style="font-size:0.8125rem;padding:3px 0;border-bottom:1px solid var(--border);">'
              + '<span style="flex:2;">' + esc(e[nameKey]) + '</span>'
              + '<span style="flex:1;">' + esc(e.reference || '—') + '</span>'
              + '<span style="flex:1;text-align:right;">' + fmtMoney(e.total_cents) + '</span>'
              + '</div>'
            )).join('')
          : '<p class="organizational-empty" style="padding:4px 0;font-size:0.8125rem;">None</p>');
    }).join('');
  }

  async function openBillsAgingPanel() {
    agingPanelBody.innerHTML = '<p class="organizational-empty">Loading…</p>';
    agingPanel.classList.add('organizational-panel-is-open');
    agingPanelOverlay.classList.add('organizational-panel-is-open');
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bills/aging-report');
    if (!out || !out.res.ok) { agingPanelBody.innerHTML = '<p class="organizational-panel-error">Could not load the AP aging report.</p>'; return; }
    agingPanelBody.innerHTML = agingBucketsHtml(out.data, 'vendor_name');
  }
  function closeBillsAgingPanel() {
    agingPanel.classList.remove('organizational-panel-is-open');
    agingPanelOverlay.classList.remove('organizational-panel-is-open');
  }

  // ── Vendor credit notes (spec 3.6) ──
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
  async function loadBillCreditNotes() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bill-credit-notes');
    const notes = (out && out.data && out.data.credit_notes) || [];
    if (!cnTbody) return;
    cnTbody.innerHTML = notes.length ? notes.map((n) => (
      '<tr>'
      + '<td>' + esc(n.contact_name) + '</td>'
      + '<td>' + (n.original_bill_id ? '#' + n.original_bill_id : '—') + '</td>'
      + '<td>' + fmtMoney(n.amount_cents) + '</td>'
      + '<td>' + esc(n.reason || '—') + '</td>'
      + '<td>' + esc(CN_STATUS_LABELS[n.status] || n.status) + '</td>'
      + '<td>' + (n.status === 'draft'
          ? '<button type="button" class="organizational-btn organizational-btn-outline cn-apply-btn" data-id="' + n.id + '" style="font-size:0.75rem;">Apply</button> '
            + '<button type="button" class="organizational-btn organizational-btn-outline cn-void-btn" data-id="' + n.id + '" style="font-size:0.75rem;">Void</button>'
          : '')
      + '</td>'
      + '</tr>'
    )).join('') : '<tr class="organizational-table-empty"><td colspan="6">No credit notes yet.</td></tr>';
  }
  async function applyOrVoidBillCreditNote(id, action) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/bill-credit-notes/' + id + '/' + action, { method: 'POST' });
    if (out && out.res.ok) await loadBillCreditNotes();
    else showError((out && out.data && out.data.error) || ('Could not ' + action + ' credit note.'));
  }

  // ── Vendor compliance (1099/W-9 data) ──
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
      showVcPanelError(out && out.res && out.res.status === 403 ? 'Admins only — you don’t have permission to view or edit vendor compliance data.' : 'Could not load vendor compliance data.');
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
    // tax_id is write-only and "omitted" means "leave unchanged" server-side -- only send it if
    // the admin typed a replacement value or explicitly asked to clear the stored one.
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

  // ── Recurring bill schedules ──
  const SCHED_FREQ_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom_months: 'Custom months' };

  function scheduleLineRowHtml(l) {
    l = l || {};
    return '<div class="organizational-alloc-line-row" data-sched-line style="flex-wrap:wrap;row-gap:4px;">'
      + '<select class="organizational-select sched-line-account" style="min-width:150px;">' + accountOptions(l.account_id) + '</select>'
      + '<select class="organizational-select sched-line-program" style="min-width:110px;">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select sched-line-grant" style="min-width:110px;">' + grantOptions(l.grant_id) + '</select>'
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
      lines.push({ account_id: Number(accountId), program_id: Number(programId), grant_id: grantId ? Number(grantId) : null, amount_cents: amountCents });
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
      + '<div class="organizational-panel-section-head">Lines</div>'
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
        template: { constituent_id: Number(vendorId), reference, lines },
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

  async function loadBillSchedules() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules?schedule_type=bill');
    const schedules = (out && out.data && out.data.schedules) || [];
    if (!schedTbody) return;
    schedTbody.innerHTML = schedules.length ? schedules.map((s) => (
      '<tr>'
      + '<td>' + esc(s.contact_name || '—') + '</td>'
      + '<td>' + esc(SCHED_FREQ_LABELS[s.frequency] || s.frequency) + '</td>'
      + '<td>' + esc(String(s.next_occurrence_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(s.end_date ? String(s.end_date).slice(0, 10) : '—') + '</td>'
      + '<td>' + (s.active ? '<span class="organizational-badge">Active</span>' : '<span class="organizational-badge">Inactive</span>') + '</td>'
      + '<td>' + (s.active ? '<button type="button" class="organizational-btn organizational-btn-outline billsched-deactivate-btn" data-id="' + s.id + '" style="font-size:0.75rem;">Deactivate</button>' : '') + '</td>'
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
      if (row) openBillPanel(Number(row.getAttribute('data-id')));
    });
    if (addBtn) addBtn.addEventListener('click', () => openBillPanel(null));
    if (panelClose) panelClose.addEventListener('click', closeBillPanel);
    if (panelOverlay) panelOverlay.addEventListener('click', closeBillPanel);
    if (filterStatus) filterStatus.addEventListener('change', loadBills);
    if (agingBtn) agingBtn.addEventListener('click', openBillsAgingPanel);
    if (agingPanelClose) agingPanelClose.addEventListener('click', closeBillsAgingPanel);
    if (agingPanelOverlay) agingPanelOverlay.addEventListener('click', closeBillsAgingPanel);
    if (cnAddBtn) cnAddBtn.addEventListener('click', toggleCreditNoteForm);
    if (cnTbody) cnTbody.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('.cn-apply-btn');
      if (applyBtn) { applyOrVoidBillCreditNote(Number(applyBtn.getAttribute('data-id')), 'apply'); return; }
      const voidBtn = e.target.closest('.cn-void-btn');
      if (voidBtn) { applyOrVoidBillCreditNote(Number(voidBtn.getAttribute('data-id')), 'void'); }
    });
    if (vcPanelClose) vcPanelClose.addEventListener('click', closeVendorCompliancePanel);
    if (vcPanelOverlay) vcPanelOverlay.addEventListener('click', closeVendorCompliancePanel);
    if (schedAddBtn) schedAddBtn.addEventListener('click', toggleBillScheduleForm);
    if (schedTbody) schedTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.billsched-deactivate-btn');
      if (btn) deactivateBillSchedule(Number(btn.getAttribute('data-id')));
    });
  }

  // ── Escape closes whichever bills-related panel is currently open ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (panel && panel.classList.contains('organizational-panel-is-open')) { closeBillPanel(); return; }
    if (agingPanel && agingPanel.classList.contains('organizational-panel-is-open')) { closeBillsAgingPanel(); return; }
    if (vcPanel && vcPanel.classList.contains('organizational-panel-is-open')) { closeVendorCompliancePanel(); return; }
  });

  async function initPurchases(slug) {
    currentSlug = slug;
    const manageVendorsLink = document.getElementById('organizational-bills-manage-vendors-link');
    if (manageVendorsLink) manageVendorsLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/contacts';
    wireOnce();
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadGrants(slug), loadVendors(slug)]);
    await loadBills();
    await loadBillCreditNotes();
    await loadBillSchedules();
    // Deep link from the Dashboard's recent-activity feed: ?open_bill=<id> opens that bill's panel.
    const openBill = Number(new URLSearchParams(window.location.search).get('open_bill'));
    if (Number.isInteger(openBill) && openBill > 0) {
      const u = new URL(window.location.href);
      u.searchParams.delete('open_bill');
      window.history.replaceState(null, '', u.pathname + u.search);
      await openBillPanel(openBill);
    }
  }

  window.OrganizationalAccounting.purchases = { init: initPurchases };
})();
