(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  // ── DOM refs ──
  const errEl        = document.getElementById('organizational-org-error');
  const tbody         = document.getElementById('organizational-invoices-tbody');
  const filterStatus  = document.getElementById('organizational-invoices-filter-status');
  const addBtn        = document.getElementById('organizational-invoices-add');

  const panel        = document.getElementById('organizational-invoices-panel');
  const panelOverlay = document.getElementById('organizational-invoices-panel-overlay');
  const panelBody     = document.getElementById('organizational-invoices-panel-body');
  const panelTitle    = document.getElementById('organizational-invoices-panel-title');
  const panelClose     = document.getElementById('organizational-invoices-panel-close');
  const panelErrEl     = document.getElementById('organizational-invoices-panel-error');

  const agingBtn        = document.getElementById('organizational-invoices-aging-btn');
  const agingPanel       = document.getElementById('organizational-invoices-aging-panel');
  const agingPanelOverlay = document.getElementById('organizational-invoices-aging-panel-overlay');
  const agingPanelBody    = document.getElementById('organizational-invoices-aging-panel-body');
  const agingPanelClose   = document.getElementById('organizational-invoices-aging-panel-close');

  const cnAddBtn  = document.getElementById('organizational-invoicecreditnotes-add');
  const cnFormEl  = document.getElementById('organizational-invoicecreditnotes-form');
  const cnTbody   = document.getElementById('organizational-invoicecreditnotes-tbody');

  const schedAddBtn = document.getElementById('organizational-invoiceschedules-add');
  const schedFormEl = document.getElementById('organizational-invoiceschedules-form');
  const schedTbody  = document.getElementById('organizational-invoiceschedules-tbody');

  // ── State ──
  let currentSlug    = '';
  let accountsCache  = [];
  let programsCache  = [];
  let customersCache = [];
  let invoicesCache  = []; // last-loaded invoices list, reused by the credit-note form's "original invoice" picker
  let wired          = false;
  let currentInvoiceId = null;
  let ocrFile = null; // the file the OCR scan just read, held until the invoice is actually created (see saveInvoice)
  let ocrPreviewUrl = null; // object URL for the chosen file's inline preview -- revoked on re-pick/panel-close
  let ocrExpectedTotalCents = null; // total_amount_cents read off the scanned invoice, if any -- compared against the running line-sum so a line breakdown that doesn't add up to the invoice is visible immediately, not discovered on submit

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
    draft: 'Draft', sent: 'Sent', partially_paid: 'Partially paid', paid: 'Paid',
    overdue: 'Overdue', void: 'Void', written_off: 'Written off',
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
  async function loadCustomers(slug) {
    // GET /constituents responds with a bare array, not { constituents: [...] }.
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents?role=customer&active=true');
    customersCache = (out && Array.isArray(out.data)) ? out.data : [];
  }

  function accountOptions(selectedId, incomeOnly) {
    const list = incomeOnly ? accountsCache.filter((a) => a.type === 'income') : accountsCache.filter((a) => a.type === 'expense');
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
  function cashAccountOptions() {
    const cash = accountsCache.filter((a) => a.is_cash_account);
    if (!cash.length) return '<option value="">No cash accounts configured</option>';
    return '<option value="">— Bank account —</option>' + cash.map((a) =>
      '<option value="' + a.id + '">' + esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
  }

  // ── List ──
  async function loadInvoices() {
    const params = new URLSearchParams();
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices?' + params.toString());
    if (!out) return;
    invoicesCache = (out.data && out.data.invoices) || [];
    renderRows(invoicesCache);
  }

  function renderRows(invoices) {
    if (!tbody) return;
    if (!invoices.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No invoices yet.</td></tr>';
      return;
    }
    tbody.innerHTML = invoices.map((i) => (
      '<tr class="organizational-invoices-row" data-id="' + i.id + '" style="cursor:pointer;">'
      + '<td>' + esc(i.customer_name) + '</td>'
      + '<td>' + esc(String(i.invoice_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(String(i.due_date || '').slice(0, 10) || '—') + '</td>'
      + '<td>' + esc(i.reference || '—') + '</td>'
      + '<td>' + fmtMoney(i.total_cents || 0) + '</td>'
      + '<td>' + statusBadge(i.status) + '</td>'
      + '</tr>'
    )).join('');
  }

  // ── Line rows (create/edit, draft only) ──
  function lineRowHtml(l) {
    l = l || {};
    return '<div class="organizational-alloc-line-row" data-line style="flex-wrap:wrap;row-gap:4px;">'
      + '<select class="organizational-select invoice-line-account" style="min-width:130px;">' + accountOptions(l.account_id, true) + '</select>'
      + '<select class="organizational-select invoice-line-program" style="min-width:100px;">' + programOptions(l.program_id) + '</select>'
      + '<input type="text" class="organizational-input invoice-line-desc" placeholder="Description" style="width:130px" value="' + esc(l.description) + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount invoice-line-amount" placeholder="Amount" style="width:90px" value="' + (l.unit_amount_cents != null ? (Number(l.unit_amount_cents) / 100) : '') + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount invoice-line-fmv" placeholder="FMV (optional)" style="width:110px" value="' + (l.fair_market_value_cents != null ? (Number(l.fair_market_value_cents) / 100) : '') + '" title="Fair market value -- set only for a quid-pro-quo sale (e.g. gala ticket); the remainder posts as contribution revenue">'
      + '<button type="button" class="organizational-btn-icon invoice-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function readOnlyLineHtml(l) {
    return '<div class="organizational-panel-field-row" style="font-size:0.85rem;padding:4px 0;border-bottom:1px solid var(--border);">'
      + '<span style="flex:2;">' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + (l.description ? ' (' + esc(l.description) + ')' : '') + '</span>'
      + '<span style="flex:1;">' + esc(l.program_name) + '</span>'
      + '<span style="flex:1;text-align:right;">' + fmtMoney(l.line_total_cents) + (l.fair_market_value_cents != null ? ' <span title="Quid pro quo split">*</span>' : '') + '</span>'
      + '</div>';
  }

  function paymentHtml(p) {
    return '<div class="organizational-panel-field-row" style="font-size:0.8125rem;padding:4px 0;border-bottom:1px solid var(--border);align-items:center;">'
      + '<span style="flex:1;">' + esc(String(p.payment_date).slice(0, 10)) + '</span>'
      + '<span style="flex:1;">' + esc(p.bank_account_code ? p.bank_account_code + ' — ' + p.bank_account_name : p.bank_account_name) + '</span>'
      + '<span style="flex:1;">' + esc(p.reference || '—') + '</span>'
      + '<span style="flex:1;text-align:right;">' + fmtMoney(p.amount_cents) + '</span>'
      + (p.status === 'posted'
        ? '<button type="button" class="organizational-btn organizational-btn-outline invoice-payment-void" data-payment-id="' + p.id + '" style="font-size:0.75rem;padding:2px 8px;margin-left:8px;">Void</button>'
        : '<span style="flex:0 0 auto;margin-left:8px;color:var(--text-secondary);">Voided</span>')
      + '</div>';
  }

  function renderPanelBody(invoice, lines, payments) {
    const isDraft = !invoice || invoice.status === 'draft';
    const linesHtml = isDraft
      ? '<div id="invoice-lines-wrap">' + (lines && lines.length ? lines.map(lineRowHtml).join('') : lineRowHtml()) + '</div>'
        + '<button type="button" id="invoice-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem;margin-top:6px;">+ Add line</button>'
        + '<div id="invoice-lines-total" style="font-size:0.8125rem;color:var(--text-secondary);margin-top:6px;text-align:right;"></div>'
      : '<div style="margin-top:6px;">'
        + '<div class="organizational-panel-field-row" style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;"><span style="flex:2;">Account</span><span style="flex:1;">Program</span><span style="flex:1;text-align:right;">Amount</span></div>'
        + (lines || []).map(readOnlyLineHtml).join('')
        + ((lines || []).some((l) => l.fair_market_value_cents != null) ? '<p style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">* quid pro quo split -- part posted as contribution revenue</p>' : '')
        + '</div>';
    const totalCents = (lines || []).reduce((s, l) => s + Number(l.line_total_cents), 0);
    const paidCents = (payments || []).filter((p) => p.status === 'posted').reduce((s, p) => s + Number(p.amount_cents), 0);
    const remainingCents = totalCents - paidCents;

    const actions = [];
    if (!invoice) {
      actions.push('<button type="button" id="invoice-save" class="organizational-btn organizational-btn-primary">Create invoice</button>');
    } else if (invoice.status === 'draft') {
      actions.push('<button type="button" id="invoice-save" class="organizational-btn organizational-btn-outline">Save changes</button>');
      actions.push('<button type="button" id="invoice-send" class="organizational-btn organizational-btn-primary">Send</button>');
      actions.push('<button type="button" id="invoice-void" class="organizational-btn organizational-btn-outline">Void</button>');
    } else if (['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
      actions.push('<button type="button" id="invoice-record-payment" class="organizational-btn organizational-btn-primary">Record payment</button>');
      actions.push(
        '<span style="display:flex;align-items:center;gap:6px;">'
        + '<select id="invoice-writeoff-account" class="organizational-select" style="width:170px;">' + accountOptions(null, false) + '</select>'
        + '<button type="button" id="invoice-writeoff" class="organizational-btn organizational-btn-outline">Write off</button>'
        + '</span>'
      );
    }

    // Unlike a bill (pay in full, one shot), an invoice can carry more than one payment over
    // time -- the payment history list and the "record another one" form coexist here whenever
    // there's a balance left, rather than one replacing the other the way bills.js's approved/
    // paid split works.
    let paymentSection = '';
    if (invoice && !isDraft) {
      const historyHtml = payments && payments.length
        ? '<div class="organizational-panel-section-head">Payments — ' + fmtMoney(paidCents) + ' of ' + fmtMoney(totalCents) + (remainingCents > 0 ? ', ' + fmtMoney(remainingCents) + ' remaining' : '') + '</div>'
          + payments.map(paymentHtml).join('')
        : '';
      const canRecordPayment = ['sent', 'partially_paid', 'overdue'].includes(invoice.status) && remainingCents > 0;
      const formHtml = canRecordPayment
        ? '<div class="organizational-panel-section-head">Record payment</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Payment date *<input type="date" id="invoice-payment-date" class="organizational-input"></label>'
          + '<label class="organizational-label" style="flex:1">Bank account *<select id="invoice-payment-account" class="organizational-select">' + cashAccountOptions() + '</select></label>'
          + '</div>'
          + '<div class="organizational-panel-field-row">'
          + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="invoice-payment-reference" class="organizational-input"></label>'
          + '<label class="organizational-label" style="flex:1">Amount * <span style="font-weight:400;color:var(--text-secondary);">(up to ' + fmtMoney(remainingCents) + ')</span><input type="text" inputmode="decimal" id="invoice-payment-amount" class="organizational-input organizational-formula-amount" value="' + (remainingCents / 100).toFixed(2) + '"></label>'
          + '</div>'
        : '';
      paymentSection = historyHtml + formHtml;
    }

    const ocrSectionHtml = invoice ? '' : (
      '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Customer invoice file (optional — we\'ll try to pre-fill the fields below; attaches once the invoice is created)</label>'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<input type="file" id="invoice-ocr-file" class="organizational-input" accept="image/*,application/pdf" style="flex:1;">'
      + '<div id="invoice-ocr-preview" style="flex:0 0 auto;" hidden></div>'
      + '</div>'
      + '<p id="invoice-ocr-status" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div>'
    );

    return '<div class="organizational-panel-fields">'
      + (invoice ? '<div class="organizational-panel-field-full">' + statusBadge(invoice.status) + '</div>' : '')
      + ocrSectionHtml
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Customer *<div id="invoice-customer-field" class="organizational-contact-picker-mount"></div></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Invoice date *<input type="date" id="invoice-date" class="organizational-input" value="' + esc((invoice && invoice.invoice_date) ? String(invoice.invoice_date).slice(0, 10) : '') + '" ' + (isDraft ? '' : 'disabled') + '></label>'
      + '<label class="organizational-label" style="flex:1">Due date<input type="date" id="invoice-due-date" class="organizational-input" value="' + esc((invoice && invoice.due_date) ? String(invoice.due_date).slice(0, 10) : '') + '" ' + (isDraft ? '' : 'disabled') + '></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Reference<input type="text" id="invoice-reference" class="organizational-input" value="' + esc(invoice ? invoice.reference : '') + '" ' + (isDraft ? '' : 'disabled') + '></label></div>'
      + '<div class="organizational-panel-section-head">Lines</div>'
      + linesHtml
      + paymentSection
      + (invoice ? window.OrganizationalDocumentAttach.html('invoice', ['customer_invoice', 'other']) : '')
      + '</div>'
      + '<div class="organizational-panel-actions">' + actions.join('') + '</div>';
  }

  function collectLines() {
    const rows = Array.from(document.querySelectorAll('#invoice-lines-wrap [data-line]'));
    const lines = [];
    for (const row of rows) {
      const accountId = row.querySelector('.invoice-line-account').value;
      const programId = row.querySelector('.invoice-line-program').value;
      const description = row.querySelector('.invoice-line-desc').value.trim() || null;
      const unitAmountCents = inputToCents(row.querySelector('.invoice-line-amount').value);
      const fmvRaw = row.querySelector('.invoice-line-fmv').value;
      const fmvCents = fmvRaw.trim() ? inputToCents(fmvRaw) : null;
      if (!accountId && !programId && Number.isNaN(unitAmountCents)) continue;
      if (!accountId || !programId) { showPanelError('Every line needs an account and a program.'); return null; }
      if (Number.isNaN(unitAmountCents) || unitAmountCents <= 0) { showPanelError('Every line needs a positive amount.'); return null; }
      if (fmvCents != null && (Number.isNaN(fmvCents) || fmvCents > unitAmountCents)) { showPanelError('Fair market value cannot exceed the line amount.'); return null; }
      lines.push({ account_id: Number(accountId), program_id: Number(programId), description, unit_amount_cents: unitAmountCents, fair_market_value_cents: fmvCents });
    }
    if (!lines.length) { showPanelError('At least one line is required.'); return null; }
    return lines;
  }

  function updateInvoiceLinesTotal() {
    const totalEl = document.getElementById('invoice-lines-total');
    if (!totalEl) return;
    const amounts = Array.from(document.querySelectorAll('#invoice-lines-wrap .invoice-line-amount'))
      .map((inp) => inputToCents(inp.value))
      .filter((n) => !Number.isNaN(n));
    const sumCents = amounts.reduce((s, n) => s + n, 0);
    let text = 'Lines total: ' + fmtMoney(sumCents);
    if (ocrExpectedTotalCents != null) {
      if (sumCents === ocrExpectedTotalCents) {
        text += ' — matches the invoice total read from the file (' + fmtMoney(ocrExpectedTotalCents) + ').';
      } else {
        text += ' — invoice was read as ' + fmtMoney(ocrExpectedTotalCents) + ', off by ' + fmtMoney(Math.abs(sumCents - ocrExpectedTotalCents)) + '.';
      }
    }
    totalEl.textContent = text;
  }

  function wirePanelBody(invoice) {
    const isDraft = !invoice || invoice.status === 'draft';
    const customerField = document.getElementById('invoice-customer-field');
    if (customerField) {
      window.OrganizationalContactPicker.mount(customerField, {
        getCache: () => customersCache, role: 'customer', slug: currentSlug,
        selectedId: invoice && invoice.constituent_id, disabled: !isDraft, valueElementId: 'invoice-customer',
      });
    }

    const linesWrap = document.getElementById('invoice-lines-wrap');
    const addLineBtn = document.getElementById('invoice-add-line');
    if (addLineBtn) addLineBtn.addEventListener('click', () => { linesWrap.insertAdjacentHTML('beforeend', lineRowHtml()); updateInvoiceLinesTotal(); });
    if (linesWrap) linesWrap.addEventListener('click', (e) => {
      const rm = e.target.closest('.invoice-remove-line');
      if (rm && linesWrap.children.length > 1) { rm.closest('[data-line]').remove(); updateInvoiceLinesTotal(); }
    });
    // Running total of the line breakdown, live as amounts change -- same fix as Bills
    // (bills-ui.js): a line split across several account/program lines had no visible check
    // that the split adds back up to the invoice.
    if (linesWrap) linesWrap.addEventListener('input', (e) => {
      if (e.target.classList.contains('invoice-line-amount')) updateInvoiceLinesTotal();
    });
    updateInvoiceLinesTotal();

    // Invoice OCR prefill -- read-only, best-effort, same discipline as Expense Claims' receipt
    // scan (expense-claims.js) and Bills' bill scan (bills-ui.js): never blocks the form, a
    // failed/unclear read just leaves the fields for manual entry. Header fields only (customer,
    // dates, reference, first line's amount/description) -- no scanned document can know this
    // org's chart of accounts, so line account_id/program_id are never touched. Not present in
    // edit mode (see ocrSectionHtml).
    const ocrInput = document.getElementById('invoice-ocr-file');
    const ocrStatus = document.getElementById('invoice-ocr-status');
    const ocrPreviewEl = document.getElementById('invoice-ocr-preview');
    if (ocrInput) ocrInput.addEventListener('change', async () => {
      ocrFile = ocrInput.files && ocrInput.files[0];
      if (!ocrFile) return;

      // Show the file itself alongside the form so a value OCR misread can be checked and
      // typed in directly.
      if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
      ocrPreviewUrl = URL.createObjectURL(ocrFile);
      if (ocrPreviewEl) {
        ocrPreviewEl.hidden = false;
        ocrPreviewEl.innerHTML = ocrFile.type === 'application/pdf'
          ? '<a href="' + ocrPreviewUrl + '" target="_blank" rel="noopener" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:4px 8px;">View PDF ↗</a>'
          : '<a href="' + ocrPreviewUrl + '" target="_blank" rel="noopener"><img src="' + ocrPreviewUrl + '" alt="Invoice preview" style="max-height:140px;max-width:180px;border:1px solid var(--border);border-radius:4px;object-fit:contain;display:block;"></a>';
      }

      ocrStatus.hidden = false;
      ocrStatus.textContent = 'Scanning invoice…';
      const form = new FormData();
      form.append('file', ocrFile);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/ocr-preview', {
        method: 'POST', body: form, credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.extracted) {
        ocrStatus.textContent = data.error || 'Could not read this invoice — fill in the fields manually.';
        return;
      }
      const ext = data.extracted;
      if (ext.document_date) document.getElementById('invoice-date').value = ext.document_date;
      if (ext.due_date) document.getElementById('invoice-due-date').value = ext.due_date;
      if (ext.reference) document.getElementById('invoice-reference').value = ext.reference;
      const firstRow = document.querySelector('#invoice-lines-wrap [data-line]');
      if (firstRow) {
        const amountInput = firstRow.querySelector('.invoice-line-amount');
        if (amountInput && !amountInput.value && ext.total_amount_cents) amountInput.value = (ext.total_amount_cents / 100).toFixed(2);
        const descInput = firstRow.querySelector('.invoice-line-desc');
        if (descInput && !descInput.value && ext.suggested_description) descInput.value = ext.suggested_description;
      }
      if (ext.total_amount_cents) ocrExpectedTotalCents = ext.total_amount_cents;
      updateInvoiceLinesTotal();
      // The model has no visibility into this org's customer list, so it only ever returns a
      // name string -- a confident pick still requires a real name match here, otherwise the
      // picker is left as-is for a human to search/select.
      let customerMatchNote = '';
      if (ext.counterparty_name) {
        const nameLc = ext.counterparty_name.toLowerCase();
        const match = customersCache.find((c) => (c.display_name || '').toLowerCase() === nameLc)
          || customersCache.find((c) => (c.display_name || '').toLowerCase().includes(nameLc) || nameLc.includes((c.display_name || '').toLowerCase()));
        const hidden = document.getElementById('invoice-customer');
        const visible = document.getElementById('invoice-customer-input');
        if (match) {
          if (hidden) hidden.value = match.id;
          if (visible) visible.value = match.display_name;
          customerMatchNote = ' Matched to customer "' + match.display_name + '".';
        } else {
          // No confident match -- pre-fill the search box with the read name so it's ready to
          // either pick a close match or use "+ Add new customer" without retyping, but leave
          // the hidden id blank so nothing gets silently selected.
          if (visible) visible.value = ext.counterparty_name;
          customerMatchNote = ' No matching customer found for "' + ext.counterparty_name + '" — pick one or add a new customer above.';
        }
      }
      ocrStatus.textContent = 'Pre-filled from the invoice — review before saving.' + customerMatchNote;
    });

    const saveBtn = document.getElementById('invoice-save');
    if (saveBtn) saveBtn.addEventListener('click', saveInvoice);
    const sendBtn = document.getElementById('invoice-send');
    if (sendBtn) sendBtn.addEventListener('click', () => transitionInvoice(currentInvoiceId, 'send'));
    const voidBtn = document.getElementById('invoice-void');
    if (voidBtn) voidBtn.addEventListener('click', () => transitionInvoice(currentInvoiceId, 'void'));
    const writeoffBtn = document.getElementById('invoice-writeoff');
    if (writeoffBtn) writeoffBtn.addEventListener('click', writeOffInvoice);
    const recordPaymentBtn = document.getElementById('invoice-record-payment');
    if (recordPaymentBtn) recordPaymentBtn.addEventListener('click', recordInvoicePayment);
    panelBody.querySelectorAll('.invoice-payment-void').forEach((btn) => {
      btn.addEventListener('click', () => voidInvoicePayment(Number(btn.getAttribute('data-payment-id'))));
    });
  }

  async function recordInvoicePayment() {
    showPanelError('');
    const paymentDate = document.getElementById('invoice-payment-date').value;
    const bankAccountId = document.getElementById('invoice-payment-account').value;
    const reference = document.getElementById('invoice-payment-reference').value.trim() || null;
    const amountCents = inputToCents(document.getElementById('invoice-payment-amount').value);
    if (!paymentDate) { showPanelError('Payment date is required.'); return; }
    if (!bankAccountId) { showPanelError('A bank account is required.'); return; }
    if (Number.isNaN(amountCents) || amountCents <= 0) { showPanelError('Amount must be a positive number.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + currentInvoiceId + '/payments', {
      method: 'POST',
      body: JSON.stringify({ bank_account_id: Number(bankAccountId), payment_date: paymentDate, amount_cents: amountCents, reference }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadInvoices();
      await openInvoicePanel(currentInvoiceId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not record payment.');
    }
  }

  async function voidInvoicePayment(paymentId) {
    showPanelError('');
    const reason = window.prompt('This will void the payment. Reason?');
    if (reason == null) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + currentInvoiceId + '/payments/' + paymentId + '/void', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!out) return;
    if (out.res.ok) {
      await loadInvoices();
      await openInvoicePanel(currentInvoiceId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not void payment.');
    }
  }

  async function saveInvoice() {
    showPanelError('');
    const customerId = document.getElementById('invoice-customer').value;
    const invoiceDate = document.getElementById('invoice-date').value;
    const dueDate = document.getElementById('invoice-due-date').value;
    const reference = document.getElementById('invoice-reference').value.trim() || null;
    if (!customerId) { showPanelError('A customer is required.'); return; }
    if (!invoiceDate) { showPanelError('Invoice date is required.'); return; }
    const lines = collectLines();
    if (!lines) return;

    let out;
    if (currentInvoiceId == null) {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices', {
        method: 'POST',
        body: JSON.stringify({ constituent_id: Number(customerId), invoice_date: invoiceDate, due_date: dueDate || null, reference, lines }),
      });
    } else {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + currentInvoiceId, {
        method: 'PATCH',
        body: JSON.stringify({ constituent_id: Number(customerId), due_date: dueDate || null, reference, lines }),
      });
    }
    if (!out) return;
    if (out.res.ok) {
      // Attach the same file the OCR scan already read, now against the real invoice id -- the
      // OCR endpoint itself persists nothing, so this is the actual invoice document (same
      // pattern as expense-claims.js/bills-ui.js's post-creation upload). Only applies on
      // create; ocrFile is null on an edit (no OCR section there, see ocrSectionHtml above).
      const fileToAttach = ocrFile;
      ocrFile = null;
      if (fileToAttach && currentInvoiceId == null) {
        const uploadForm = new FormData();
        uploadForm.append('file', fileToAttach);
        uploadForm.append('category', 'customer_invoice');
        uploadForm.append('source_ref_type', 'invoice');
        uploadForm.append('source_ref_id', String(out.data.id));
        await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents', {
          method: 'POST', body: uploadForm, credentials: 'same-origin',
        }).catch(() => {});
      }
      // Sequential, deliberately not parallel: racing this against openInvoicePanel's own
      // fetch (via Promise.all, or by firing loadInvoices() unawaited) caused real collisions --
      // an aborted fetch once, a full 10s timeout another time. The list refresh is cheap; not
      // worth reintroducing that risk to save ~200ms.
      await loadInvoices();
      await openInvoicePanel(out.data.id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save invoice.');
    }
  }

  async function transitionInvoice(id, action) {
    showPanelError('');
    if (action === 'void') {
      const ok = window.confirm('Void this draft invoice?');
      if (!ok) return;
    }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + id + '/' + action, { method: 'POST' });
    if (!out) return;
    if (out.res.ok) {
      // Sequential, deliberately not parallel -- see saveInvoice()'s comment above.
      await loadInvoices();
      await openInvoicePanel(id);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || ('Could not ' + action + ' invoice.'));
    }
  }

  async function writeOffInvoice() {
    showPanelError('');
    const accountId = document.getElementById('invoice-writeoff-account').value;
    if (!accountId) { showPanelError('Choose a bad-debt expense account first.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + currentInvoiceId + '/write-off', {
      method: 'POST', body: JSON.stringify({ bad_debt_expense_account_id: Number(accountId) }),
    });
    if (!out) return;
    if (out.res.ok) {
      // Sequential, deliberately not parallel -- see saveInvoice()'s comment above.
      await loadInvoices();
      await openInvoicePanel(currentInvoiceId);
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not write off invoice.');
    }
  }

  async function openInvoicePanel(id) {
    showPanelError('');
    currentInvoiceId = id || null;
    ocrFile = null;
    ocrExpectedTotalCents = null;
    if (ocrPreviewUrl) { URL.revokeObjectURL(ocrPreviewUrl); ocrPreviewUrl = null; }
    if (id) {
      panelTitle.textContent = 'Invoice #' + id;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + id);
      if (!out || !out.res.ok) { showPanelError('Could not load invoice.'); return; }
      let payments = null;
      if (out.data.invoice && out.data.invoice.status !== 'draft') {
        const payOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/' + id + '/payments');
        payments = payOut && payOut.res.ok ? payOut.data.payments : [];
      }
      panelBody.innerHTML = renderPanelBody(out.data.invoice, out.data.lines, payments);
      window.OrganizationalDocumentAttach.wire(panelBody, { slug: currentSlug, sourceRefType: 'invoice', sourceRefId: id });
      wirePanelBody(out.data.invoice);
    } else {
      panelTitle.textContent = 'New invoice';
      panelBody.innerHTML = renderPanelBody(null, null);
      wirePanelBody(null);
    }
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
  }
  function closeInvoicePanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
  }

  // ── AR Aging report (spec 4.7) ──
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

  async function openInvoicesAgingPanel() {
    agingPanelBody.innerHTML = '<p class="organizational-empty">Loading…</p>';
    agingPanel.classList.add('organizational-panel-is-open');
    agingPanelOverlay.classList.add('organizational-panel-is-open');
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoices/aging-report');
    if (!out || !out.res.ok) { agingPanelBody.innerHTML = '<p class="organizational-panel-error">Could not load the AR aging report.</p>'; return; }
    agingPanelBody.innerHTML = agingBucketsHtml(out.data, 'customer_name');
  }
  function closeInvoicesAgingPanel() {
    agingPanel.classList.remove('organizational-panel-is-open');
    agingPanelOverlay.classList.remove('organizational-panel-is-open');
  }

  // ── Customer credit notes (spec 4.7) ──
  const CN_STATUS_LABELS = { draft: 'Draft', applied: 'Applied', void: 'Void' };
  function cnFormHtml() {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Customer *<div id="cn-customer-field" class="organizational-contact-picker-mount"></div></label>'
      + '<label class="organizational-label" style="flex:1">Original invoice (optional)<select id="cn-invoice" class="organizational-select"><option value="">— None —</option></select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Revenue account *<select id="cn-account" class="organizational-select">' + accountOptions(null, true) + '</select></label>'
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
    const cnCustomerField = document.getElementById('cn-customer-field');
    if (cnCustomerField) {
      window.OrganizationalContactPicker.mount(cnCustomerField, {
        getCache: () => customersCache, role: 'customer', slug: currentSlug, valueElementId: 'cn-customer',
      });
    }
    const invoiceSelect = document.getElementById('cn-invoice');
    if (invoiceSelect && invoicesCache.length) {
      invoiceSelect.innerHTML = '<option value="">— None —</option>' + invoicesCache.map((i) =>
        '<option value="' + i.id + '">#' + i.id + ' — ' + esc(i.customer_name) + ' (' + fmtMoney(i.total_cents || 0) + ')</option>'
      ).join('');
    }
    document.getElementById('cn-save').addEventListener('click', createInvoiceCreditNote);
  }
  async function createInvoiceCreditNote() {
    const errEl2 = document.getElementById('cn-error');
    const show = (m) => { errEl2.textContent = m || ''; errEl2.hidden = !m; };
    const customerId = document.getElementById('cn-customer').value;
    const invoiceId = document.getElementById('cn-invoice').value;
    const accountId = document.getElementById('cn-account').value;
    const programId = document.getElementById('cn-program').value;
    const date = document.getElementById('cn-date').value;
    const amountCents = inputToCents(document.getElementById('cn-amount').value);
    const reason = document.getElementById('cn-reason').value.trim() || null;
    if (!customerId || !accountId || !programId || !date) { show('Customer, account, program, and date are required.'); return; }
    if (Number.isNaN(amountCents) || amountCents <= 0) { show('A positive amount is required.'); return; }
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoice-credit-notes', {
      method: 'POST',
      body: JSON.stringify({ constituent_id: Number(customerId), original_invoice_id: invoiceId ? Number(invoiceId) : null, account_id: Number(accountId), program_id: Number(programId), date, amount_cents: amountCents, reason }),
    });
    if (!out) return;
    if (out.res.ok) {
      cnFormEl.hidden = true;
      await loadInvoiceCreditNotes();
    } else {
      show((out.data && out.data.error) || 'Could not create credit note.');
    }
  }
  async function loadInvoiceCreditNotes() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoice-credit-notes');
    const notes = (out && out.data && out.data.credit_notes) || [];
    if (!cnTbody) return;
    cnTbody.innerHTML = notes.length ? notes.map((n) => (
      '<tr>'
      + '<td>' + esc(n.contact_name) + '</td>'
      + '<td>' + (n.original_invoice_id ? '#' + n.original_invoice_id : '—') + '</td>'
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
  async function applyOrVoidInvoiceCreditNote(id, action) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invoice-credit-notes/' + id + '/' + action, { method: 'POST' });
    if (out && out.res.ok) await loadInvoiceCreditNotes();
    else showError((out && out.data && out.data.error) || ('Could not ' + action + ' credit note.'));
  }

  // ── Recurring invoice schedules ──
  const SCHED_FREQ_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom_months: 'Custom months' };

  function scheduleLineRowHtml(l) {
    l = l || {};
    return '<div class="organizational-alloc-line-row" data-sched-line style="flex-wrap:wrap;row-gap:4px;">'
      + '<select class="organizational-select sched-line-account" style="min-width:130px;">' + accountOptions(l.account_id, true) + '</select>'
      + '<select class="organizational-select sched-line-program" style="min-width:100px;">' + programOptions(l.program_id) + '</select>'
      + '<input type="text" class="organizational-input sched-line-desc" placeholder="Description" style="width:130px" value="' + esc(l.description) + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount sched-line-amount" placeholder="Amount" style="width:90px" value="' + (l.unit_amount_cents != null ? (Number(l.unit_amount_cents) / 100) : '') + '">'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount sched-line-fmv" placeholder="FMV (optional)" style="width:110px" value="' + (l.fair_market_value_cents != null ? (Number(l.fair_market_value_cents) / 100) : '') + '">'
      + '<button type="button" class="organizational-btn-icon sched-remove-line" title="Remove">✕</button>'
      + '</div>';
  }

  function showScheduleFormError(msg) {
    const el = document.getElementById('invoicesched-error');
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }

  function collectScheduleLines() {
    const rows = Array.from(document.querySelectorAll('#invoicesched-lines-wrap [data-sched-line]'));
    const lines = [];
    for (const row of rows) {
      const accountId = row.querySelector('.sched-line-account').value;
      const programId = row.querySelector('.sched-line-program').value;
      const description = row.querySelector('.sched-line-desc').value.trim() || null;
      const unitAmountCents = inputToCents(row.querySelector('.sched-line-amount').value);
      const fmvRaw = row.querySelector('.sched-line-fmv').value;
      const fmvCents = fmvRaw.trim() ? inputToCents(fmvRaw) : null;
      if (!accountId && !programId && Number.isNaN(unitAmountCents)) continue;
      if (!accountId || !programId) { showScheduleFormError('Every line needs an account and a program.'); return null; }
      if (Number.isNaN(unitAmountCents) || unitAmountCents <= 0) { showScheduleFormError('Every line needs a positive amount.'); return null; }
      if (fmvCents != null && (Number.isNaN(fmvCents) || fmvCents > unitAmountCents)) { showScheduleFormError('Fair market value cannot exceed the line amount.'); return null; }
      lines.push({ account_id: Number(accountId), program_id: Number(programId), description, unit_amount_cents: unitAmountCents, fair_market_value_cents: fmvCents });
    }
    if (!lines.length) { showScheduleFormError('At least one line is required.'); return null; }
    return lines;
  }

  function scheduleFormHtml() {
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Customer *<div id="invoicesched-customer-field" class="organizational-contact-picker-mount"></div></label>'
      + '<label class="organizational-label" style="flex:1">Reference<input type="text" id="invoicesched-reference" class="organizational-input"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Frequency *<select id="invoicesched-frequency" class="organizational-select">'
      + Object.keys(SCHED_FREQ_LABELS).map((k) => '<option value="' + k + '">' + SCHED_FREQ_LABELS[k] + '</option>').join('')
      + '</select></label>'
      + '<label class="organizational-label" style="flex:1">Next occurrence date *<input type="date" id="invoicesched-next-date" class="organizational-input"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row" id="invoicesched-months-row" hidden>'
      + '<label class="organizational-label" style="flex:1">Active months * <span style="font-weight:400;color:var(--text-secondary);">(comma-separated, 1–12)</span><input type="text" id="invoicesched-months" class="organizational-input" placeholder="e.g. 1,4,7,10"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">End date <span style="font-weight:400;color:var(--text-secondary);">(optional)</span><input type="date" id="invoicesched-end-date" class="organizational-input"></label></div>'
      + '<div class="organizational-panel-section-head">Lines</div>'
      + '<div id="invoicesched-lines-wrap">' + scheduleLineRowHtml() + '</div>'
      + '<button type="button" id="invoicesched-add-line" class="organizational-sg-add-btn" style="font-size:0.8rem;margin-top:6px;">+ Add line</button>'
      + '</div>'
      + '<p id="invoicesched-error" class="organizational-panel-error" hidden></p>'
      + '<div class="organizational-panel-actions"><button type="button" id="invoicesched-save" class="organizational-btn organizational-btn-primary">Create schedule</button></div>';
  }

  async function toggleInvoiceScheduleForm() {
    const willOpen = schedFormEl.hidden;
    schedFormEl.hidden = !willOpen;
    if (!willOpen) return;
    schedFormEl.innerHTML = scheduleFormHtml();
    const schedCustomerField = document.getElementById('invoicesched-customer-field');
    if (schedCustomerField) {
      window.OrganizationalContactPicker.mount(schedCustomerField, {
        getCache: () => customersCache, role: 'customer', slug: currentSlug, valueElementId: 'invoicesched-customer',
      });
    }
    const linesWrap = document.getElementById('invoicesched-lines-wrap');
    const addLineBtn = document.getElementById('invoicesched-add-line');
    if (addLineBtn) addLineBtn.addEventListener('click', () => linesWrap.insertAdjacentHTML('beforeend', scheduleLineRowHtml()));
    if (linesWrap) linesWrap.addEventListener('click', (e) => {
      const rm = e.target.closest('.sched-remove-line');
      if (rm && linesWrap.children.length > 1) rm.closest('[data-sched-line]').remove();
    });
    const freqSelect = document.getElementById('invoicesched-frequency');
    const monthsRow = document.getElementById('invoicesched-months-row');
    if (freqSelect && monthsRow) freqSelect.addEventListener('change', () => { monthsRow.hidden = freqSelect.value !== 'custom_months'; });
    document.getElementById('invoicesched-save').addEventListener('click', createInvoiceSchedule);
  }

  async function createInvoiceSchedule() {
    showScheduleFormError('');
    const customerId = document.getElementById('invoicesched-customer').value;
    const reference = document.getElementById('invoicesched-reference').value.trim() || null;
    const frequency = document.getElementById('invoicesched-frequency').value;
    const nextDate = document.getElementById('invoicesched-next-date').value;
    const endDate = document.getElementById('invoicesched-end-date').value || null;
    const monthsRaw = document.getElementById('invoicesched-months').value.trim();
    if (!customerId) { showScheduleFormError('A customer is required.'); return; }
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
        schedule_type: 'invoice', frequency, active_months: activeMonths, next_occurrence_date: nextDate, end_date: endDate,
        template: { constituent_id: Number(customerId), reference, lines },
      }),
    });
    if (!out) return;
    if (out.res.ok) {
      schedFormEl.hidden = true;
      await loadInvoiceSchedules();
    } else {
      showScheduleFormError((out.data && (out.data.message || out.data.error)) || 'Could not create recurring schedule.');
    }
  }

  async function loadInvoiceSchedules() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules?schedule_type=invoice');
    const schedules = (out && out.data && out.data.schedules) || [];
    if (!schedTbody) return;
    schedTbody.innerHTML = schedules.length ? schedules.map((s) => (
      '<tr>'
      + '<td>' + esc(s.contact_name || '—') + '</td>'
      + '<td>' + esc(SCHED_FREQ_LABELS[s.frequency] || s.frequency) + '</td>'
      + '<td>' + esc(String(s.next_occurrence_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(s.end_date ? String(s.end_date).slice(0, 10) : '—') + '</td>'
      + '<td>' + (s.active ? '<span class="organizational-badge">Active</span>' : '<span class="organizational-badge">Inactive</span>') + '</td>'
      + '<td>' + (s.active ? '<button type="button" class="organizational-btn organizational-btn-outline invoicesched-deactivate-btn" data-id="' + s.id + '" style="font-size:0.75rem;">Deactivate</button>' : '') + '</td>'
      + '</tr>'
    )).join('') : '<tr class="organizational-table-empty"><td colspan="6">No recurring schedules yet.</td></tr>';
  }

  async function deactivateInvoiceSchedule(id) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/recurring-schedules/' + id + '/deactivate', { method: 'POST' });
    if (out && out.res.ok) await loadInvoiceSchedules();
    else showError((out && out.data && out.data.error) || 'Could not deactivate schedule.');
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    if (tbody) tbody.addEventListener('click', (e) => {
      const row = e.target.closest('.organizational-invoices-row');
      if (row) openInvoicePanel(Number(row.getAttribute('data-id')));
    });
    if (addBtn) addBtn.addEventListener('click', () => openInvoicePanel(null));
    if (panelClose) panelClose.addEventListener('click', closeInvoicePanel);
    if (panelOverlay) panelOverlay.addEventListener('click', closeInvoicePanel);
    if (filterStatus) filterStatus.addEventListener('change', loadInvoices);
    if (agingBtn) agingBtn.addEventListener('click', openInvoicesAgingPanel);
    if (agingPanelClose) agingPanelClose.addEventListener('click', closeInvoicesAgingPanel);
    if (agingPanelOverlay) agingPanelOverlay.addEventListener('click', closeInvoicesAgingPanel);
    if (cnAddBtn) cnAddBtn.addEventListener('click', toggleCreditNoteForm);
    if (cnTbody) cnTbody.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('.cn-apply-btn');
      if (applyBtn) { applyOrVoidInvoiceCreditNote(Number(applyBtn.getAttribute('data-id')), 'apply'); return; }
      const voidBtn = e.target.closest('.cn-void-btn');
      if (voidBtn) { applyOrVoidInvoiceCreditNote(Number(voidBtn.getAttribute('data-id')), 'void'); }
    });
    if (schedAddBtn) schedAddBtn.addEventListener('click', toggleInvoiceScheduleForm);
    if (schedTbody) schedTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.invoicesched-deactivate-btn');
      if (btn) deactivateInvoiceSchedule(Number(btn.getAttribute('data-id')));
    });
  }

  // ── Escape closes whichever invoices-related panel is currently open ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (panel && panel.classList.contains('organizational-panel-is-open')) { closeInvoicePanel(); return; }
    if (agingPanel && agingPanel.classList.contains('organizational-panel-is-open')) { closeInvoicesAgingPanel(); return; }
  });

  async function initSales(slug) {
    currentSlug = slug;
    const manageCustomersLink = document.getElementById('organizational-invoices-manage-customers-link');
    if (manageCustomersLink) manageCustomersLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/contacts';
    wireOnce();
    await Promise.all([loadAccounts(slug), loadPrograms(slug), loadCustomers(slug)]);
    await loadInvoices();
    await loadInvoiceCreditNotes();
    await loadInvoiceSchedules();
  }

  window.OrganizationalAccounting.sales = { init: initSales };
})();
