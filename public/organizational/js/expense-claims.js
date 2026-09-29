/* expense-claims.js — Expense Claims (Accounting build order item 4/5). Staff/board
 * reimbursement, deliberately separate from Bills (see the spec's "why this isn't just a
 * bill" section). Two approval-timing modes per org_settings.expense_claim_approval_mode:
 * pre_approval (approve before paying) or post_payout (pay immediately, confirm after --
 * for small orgs where pre-payment board approval is impractically slow). Receipt upload
 * triggers a best-effort OCR prefill; the human always reviews before anything posts.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  let currentSlug = '';
  let currentUserEmail = '';
  let currentRole = '';
  let approvalMode = 'pre_approval';
  let receiptThresholdCents = 0;
  let expenseAccountsCache = [];
  let programsCache = [];
  let grantsCache = [];
  let cashAccountsCache = [];
  let claimsCache = [];

  function inputToCents(raw) {
    const t = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }

  async function loadReferenceData(slug) {
    const [acctOut, progOut, grantOut, meOut] = await Promise.all([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts'),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program'),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants'),
      fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const all = (acctOut && acctOut.data && acctOut.data.accounts) || [];
    expenseAccountsCache = all.filter((a) => a.type === 'expense' && a.is_posting);
    cashAccountsCache = all.filter((a) => a.is_cash_account);
    programsCache = (progOut && progOut.data && progOut.data.programs) || [];
    grantsCache = (grantOut && grantOut.data && grantOut.data.grants) || [];
    currentUserEmail = (meOut && meOut.email) || '';

    const org = window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    currentRole = (org && org.role) || '';

    const modeOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/settings/expense-claim-approval-mode');
    approvalMode = (modeOut && modeOut.data && modeOut.data.expense_claim_approval_mode) || 'pre_approval';
    receiptThresholdCents = Number((modeOut && modeOut.data && modeOut.data.expense_claim_receipt_required_threshold_cents) || 0);
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

  const STATUS_LABELS = {
    draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved',
    paid_pending_confirmation: 'Paid — pending confirmation', paid: 'Paid',
    confirmed: 'Confirmed', disputed: 'Disputed', void: 'Void',
  };

  // ── List ──
  const tbody = document.getElementById('organizational-expenseclaims-tbody');
  const errEl = document.getElementById('organizational-org-error');
  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }

  function renderClaims() {
    if (!tbody) return;
    if (!claimsCache.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No expense claims yet.</td></tr>';
      return;
    }
    tbody.innerHTML = claimsCache.map((c) => (
      '<tr>'
      + '<td>' + esc(c.submitted_by_name || '') + '</td>'
      + '<td>' + esc(String(c.claim_date || '').slice(0, 10)) + '</td>'
      + '<td>' + esc(c.description || '') + '</td>'
      + '<td>' + fmtMoney(Number(c.total_cents)) + '</td>'
      + '<td>' + esc(STATUS_LABELS[c.status] || c.status) + '</td>'
      + '<td><button type="button" class="organizational-btn organizational-btn-outline expenseclaims-view-btn" data-id="' + c.id + '" style="font-size:0.75rem;">View</button></td>'
      + '</tr>'
    )).join('');
  }

  const mineOnlyCb = document.getElementById('organizational-expenseclaims-mine-only');
  async function loadClaims() {
    const params = mineOnlyCb && mineOnlyCb.checked ? '?mine=true' : '';
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims' + params);
    claimsCache = (out && out.data && out.data.claims) || [];
    renderClaims();
  }
  if (mineOnlyCb) mineOnlyCb.addEventListener('change', loadClaims);

  // ── Approval-mode settings panel ──
  const settingsBtn = document.getElementById('organizational-expenseclaims-settings-btn');
  const settingsPanel = document.getElementById('organizational-expenseclaims-settings-panel');
  function renderSettingsPanel() {
    if (!settingsPanel) return;
    settingsPanel.innerHTML = '<h4 style="margin:0 0 8px;">Approval timing</h4>'
      + '<div class="organizational-panel-fields">'
      + '<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;"><input type="radio" name="expenseclaims-mode" value="pre_approval"' + (approvalMode === 'pre_approval' ? ' checked' : '') + ' style="margin-top:3px;"><span><strong>Approve before paying</strong> (default, stronger control) — a non-submitter must approve before reimbursement is paid.</span></label>'
      + '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="radio" name="expenseclaims-mode" value="post_payout"' + (approvalMode === 'post_payout' ? ' checked' : '') + ' style="margin-top:3px;"><span><strong>Pay now, confirm after</strong> — reimbursement pays out as soon as it\'s submitted; a non-submitter reviews and confirms afterward. Use this if getting a board member to pre-approve every claim is impractically slow for your org. The same rule (never the submitter) still applies to who confirms.</span></label>'
      + '</div>'
      + '<h4 style="margin:16px 0 4px;">Receipt requirement threshold</h4>'
      + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 8px;">Claims under this amount can submit with no receipt and no affidavit. Federal (IRS) accountable-plan rules require documentary evidence only for lodging and any single expense of $75 or more — but state law varies, so this is your call, not a platform default. Claims at or above this amount still need either a receipt or a filed missing-receipt affidavit.</p>'
      + '<label class="organizational-label" style="max-width:200px;">Threshold ($)<input type="number" id="expenseclaims-settings-threshold" class="organizational-input" min="0" step="0.01" value="' + (receiptThresholdCents / 100).toFixed(2) + '"></label>'
      + '<div id="organizational-expenseclaims-settings-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="expenseclaims-settings-save" class="organizational-btn organizational-btn-primary">Save</button>'
      + '<button type="button" id="expenseclaims-settings-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div>';
    document.getElementById('expenseclaims-settings-cancel').addEventListener('click', () => { settingsPanel.hidden = true; });
    document.getElementById('expenseclaims-settings-save').addEventListener('click', async () => {
      const errEl2 = document.getElementById('organizational-expenseclaims-settings-error');
      if (errEl2) errEl2.hidden = true;
      const checked = settingsPanel.querySelector('input[name="expenseclaims-mode"]:checked');
      const mode = checked ? checked.value : 'pre_approval';
      const thresholdCents = inputToCents(document.getElementById('expenseclaims-settings-threshold').value);
      if (Number.isNaN(thresholdCents)) { errEl2.textContent = 'Threshold must be a non-negative amount.'; errEl2.hidden = false; return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/settings/expense-claim-approval-mode', {
        method: 'PATCH', body: JSON.stringify({ expense_claim_approval_mode: mode, expense_claim_receipt_required_threshold_cents: thresholdCents }),
      });
      if (out && out.res.ok) {
        approvalMode = mode;
        receiptThresholdCents = thresholdCents;
        settingsPanel.hidden = true;
      } else if (errEl2) {
        errEl2.textContent = (out && out.data && out.data.error) || 'Could not save this setting.';
        errEl2.hidden = false;
      }
    });
  }
  if (settingsBtn) settingsBtn.addEventListener('click', () => { renderSettingsPanel(); settingsPanel.hidden = false; });

  // ── New claim form, with receipt OCR prefill ──
  const formEl = document.getElementById('organizational-expenseclaims-form');
  const addBtn = document.getElementById('organizational-expenseclaims-add');

  function lineRowHtml(idx, line) {
    const l = line || {};
    return '<div class="expenseclaims-line-row" data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">'
      + '<input type="date" class="organizational-input expenseclaims-line-date" style="width:130px;" value="' + esc(l.expense_date || '') + '">'
      + '<input type="text" class="organizational-input expenseclaims-line-description" placeholder="Description" style="width:180px;" value="' + esc(l.description || '') + '">'
      + '<select class="organizational-select expenseclaims-line-account" style="width:170px;">' + accountOptions(expenseAccountsCache, l.account_id) + '</select>'
      + '<select class="organizational-select expenseclaims-line-program" style="width:120px;">' + programOptions(l.program_id) + '</select>'
      + '<select class="organizational-select expenseclaims-line-grant" style="width:110px;">' + grantOptions(l.grant_id) + '</select>'
      + '<input type="text" inputmode="decimal" class="organizational-input organizational-formula-amount expenseclaims-line-amount" placeholder="Amount" style="width:90px;" value="' + (l.amount_cents != null ? Number(l.amount_cents) / 100 : '') + '">'
      + '<button type="button" class="organizational-btn-icon expenseclaims-line-remove" title="Remove line" style="font-size:0.75rem;">✕</button>'
      + '</div>';
  }

  function openClaimForm(existingClaim) {
    if (!formEl) return;
    formEl.hidden = false;
    const isEdit = !!existingClaim;
    const today = new Date().toISOString().slice(0, 10);
    let ocrFile = null;
    let receiptPreviewUrl = null; // object URL for the chosen file's preview -- revoked on re-pick/close to avoid leaking memory
    const receiptSectionHtml = isEdit ? '' : (
      '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Receipt (optional — attaches on save, and we\'ll try to pre-fill the fields below)</label>'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<input type="file" id="expenseclaims-receipt-file" class="organizational-input" accept="image/*,application/pdf" style="flex:1;">'
      + '<div id="expenseclaims-receipt-preview" style="flex:0 0 auto;" hidden></div>'
      + '</div>'
      + '<p id="expenseclaims-ocr-status" style="font-size:0.75rem;color:var(--text-secondary);margin:2px 0 0;" hidden></p>'
      + '</div>'
    );
    formEl.innerHTML = '<h4 style="margin:0 0 8px;">' + (isEdit ? 'Edit expense claim' : 'New expense claim') + '</h4>'
      + (isEdit ? '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 8px;">To attach or replace the receipt, use the claim detail view after saving.</p>' : '')
      + '<div class="organizational-panel-fields">'
      + receiptSectionHtml
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Claim date *<input type="date" id="expenseclaims-form-date" class="organizational-input" value="' + esc(isEdit ? String(existingClaim.claim_date || today).slice(0, 10) : today) + '"></label>'
      + '<label class="organizational-label" style="flex:2">Description *<input type="text" id="expenseclaims-form-description" class="organizational-input" value="' + esc(isEdit ? (existingClaim.description || '') : '') + '"></label>'
      + '</div>'
      + '</div>'
      + '<div class="organizational-panel-section-head" style="margin-top:8px;">Line items</div>'
      + '<div id="expenseclaims-lines-wrap">' + (
          isEdit && existingClaim.lines && existingClaim.lines.length
            ? existingClaim.lines.map((l, i) => lineRowHtml(i, l)).join('')
            : lineRowHtml(0)
        ) + '</div>'
      + '<button type="button" id="expenseclaims-add-line" class="organizational-sg-add-btn" style="font-size:0.75rem;margin-top:4px;">+ Add line</button>'
      + '<div id="organizational-expenseclaims-form-error" class="organizational-panel-error" hidden style="margin-top:8px;"></div>'
      + '<div class="organizational-panel-actions">'
      + '<button type="button" id="expenseclaims-form-save" class="organizational-btn organizational-btn-primary">' + (isEdit ? 'Save changes' : 'Create claim') + '</button>'
      + '<button type="button" id="expenseclaims-form-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div>';

    document.getElementById('expenseclaims-form-cancel').addEventListener('click', () => {
      formEl.hidden = true;
      if (receiptPreviewUrl) { URL.revokeObjectURL(receiptPreviewUrl); receiptPreviewUrl = null; }
    });
    document.getElementById('expenseclaims-add-line').addEventListener('click', () => {
      const wrap = document.getElementById('expenseclaims-lines-wrap');
      const idx = wrap.querySelectorAll('.expenseclaims-line-row').length;
      wrap.insertAdjacentHTML('beforeend', lineRowHtml(idx));
    });
    document.getElementById('expenseclaims-lines-wrap').addEventListener('click', (e) => {
      const btn = e.target.closest('.expenseclaims-line-remove');
      if (!btn) return;
      const rows = document.querySelectorAll('.expenseclaims-line-row');
      if (rows.length > 1) btn.closest('.expenseclaims-line-row').remove();
    });

    // Receipt OCR prefill -- read-only, best-effort. Never blocks the form; a failed or
    // unclear scan just leaves the fields for manual entry. Not present in edit mode (the
    // receipt section is omitted there -- see receiptSectionHtml above).
    const fileInput = document.getElementById('expenseclaims-receipt-file');
    const ocrStatus = document.getElementById('expenseclaims-ocr-status');
    const previewEl = document.getElementById('expenseclaims-receipt-preview');
    if (fileInput) fileInput.addEventListener('change', async () => {
      ocrFile = fileInput.files && fileInput.files[0];
      if (!ocrFile) return;

      // Show the file itself alongside the form -- so anything handwritten on it (or read
      // wrong by OCR) can be checked and typed in directly, not just trusted from the scan.
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
      receiptPreviewUrl = URL.createObjectURL(ocrFile);
      if (previewEl) {
        previewEl.hidden = false;
        previewEl.innerHTML = ocrFile.type === 'application/pdf'
          ? '<a href="' + receiptPreviewUrl + '" target="_blank" rel="noopener" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:4px 8px;">View PDF ↗</a>'
          : '<a href="' + receiptPreviewUrl + '" target="_blank" rel="noopener"><img src="' + receiptPreviewUrl + '" alt="Receipt preview" style="max-height:140px;max-width:180px;border:1px solid var(--border);border-radius:4px;object-fit:contain;display:block;"></a>';
      }

      ocrStatus.hidden = false;
      ocrStatus.textContent = 'Scanning receipt…';
      const form = new FormData();
      form.append('file', ocrFile);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/ocr-preview', {
        method: 'POST', body: form, credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.extracted) {
        ocrStatus.textContent = data.error || 'Could not read this receipt — fill in the fields manually.';
        return;
      }
      const ext = data.extracted;
      if (ext.expense_date) document.getElementById('expenseclaims-form-date').value = ext.expense_date;
      const firstRow = document.querySelector('.expenseclaims-line-row[data-idx="0"]');
      if (firstRow) {
        if (ext.expense_date) firstRow.querySelector('.expenseclaims-line-date').value = ext.expense_date;
        if (ext.suggested_description || ext.vendor) {
          firstRow.querySelector('.expenseclaims-line-description').value = ext.suggested_description || ('Receipt: ' + ext.vendor);
        }
        if (ext.amount_cents) firstRow.querySelector('.expenseclaims-line-amount').value = (ext.amount_cents / 100).toFixed(2);
        // Best-effort fuzzy match against this org's own expense accounts -- the model has
        // no visibility into this org's chart of accounts, so it only ever suggests a
        // category word; a confident account pick still requires a real name match here,
        // otherwise the dropdown is left blank for a human to choose.
        if (ext.suggested_category) {
          const cat = ext.suggested_category.toLowerCase();
          const match = expenseAccountsCache.find((a) => a.name.toLowerCase().includes(cat));
          if (match) firstRow.querySelector('.expenseclaims-line-account').value = String(match.id);
        }
      }
      ocrStatus.textContent = 'Pre-filled from the receipt — review before saving.' + (ext.vendor ? ' (' + ext.vendor + ')' : '');
    });

    document.getElementById('expenseclaims-form-save').addEventListener('click', async () => {
      const errEl2 = document.getElementById('organizational-expenseclaims-form-error');
      if (errEl2) errEl2.hidden = true;
      const claimDate = document.getElementById('expenseclaims-form-date').value;
      if (!claimDate) { errEl2.textContent = 'Claim date is required.'; errEl2.hidden = false; return; }
      const claimDescription = document.getElementById('expenseclaims-form-description').value.trim();
      if (!claimDescription) { errEl2.textContent = 'Description is required.'; errEl2.hidden = false; return; }
      const lineRows = Array.from(document.querySelectorAll('.expenseclaims-line-row'));
      const lines = lineRows.map((row) => ({
        expense_date: row.querySelector('.expenseclaims-line-date').value || claimDate,
        description: row.querySelector('.expenseclaims-line-description').value.trim(),
        account_id: row.querySelector('.expenseclaims-line-account').value || null,
        program_id: row.querySelector('.expenseclaims-line-program').value || null,
        grant_id: row.querySelector('.expenseclaims-line-grant').value || null,
        amount_cents: inputToCents(row.querySelector('.expenseclaims-line-amount').value),
      }));
      if (lines.some((l) => !l.account_id || !l.program_id || !l.description || !l.amount_cents)) {
        errEl2.textContent = 'Every line needs a description, account, program, and a positive amount.';
        errEl2.hidden = false;
        return;
      }

      const url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims' + (isEdit ? '/' + existingClaim.id : '');
      const out = await apiJson(url, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          claim_date: claimDate,
          description: claimDescription,
          lines,
        }),
      });
      if (!out || !out.res.ok) {
        errEl2.textContent = (out && out.data && out.data.error) || ('Could not ' + (isEdit ? 'save changes to' : 'create') + ' this claim.');
        errEl2.hidden = false;
        return;
      }
      const claimId = isEdit ? existingClaim.id : out.data.id;

      // Attach the same file the OCR scan already read, now against the real claim id --
      // the OCR endpoint itself persists nothing, so this is the actual receipt record.
      // (Not applicable in edit mode -- no OCR/receipt section there, see above.)
      if (ocrFile) {
        const uploadForm = new FormData();
        uploadForm.append('file', ocrFile);
        uploadForm.append('category', 'expense_receipt');
        uploadForm.append('source_ref_type', 'expense_claim');
        uploadForm.append('source_ref_id', String(claimId));
        await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents', {
          method: 'POST', body: uploadForm, credentials: 'same-origin',
        }).catch(() => {});
      }

      formEl.hidden = true;
      await loadClaims();
      openClaimDetail(claimId);
    });
  }
  if (addBtn) addBtn.addEventListener('click', () => openClaimForm(null));

  // ── Claim detail panel: receipts, submit/approve/pay/confirm/void ──
  const detailPanel = document.getElementById('organizational-expenseclaims-detail-panel');

  function actionButtonsHtml(claim) {
    const isMine = claim.submitted_by_name === currentUserEmail;
    const canApproveRole = ['admin', 'board'].includes(currentRole);
    const btns = [];
    if (claim.status === 'draft' && isMine) {
      btns.push('<button type="button" class="organizational-btn organizational-btn-outline expenseclaims-edit-btn" data-id="' + claim.id + '">Edit</button>');
      btns.push('<button type="button" class="organizational-btn organizational-btn-primary expenseclaims-submit-btn" data-id="' + claim.id + '">Submit</button>');
    }
    if (claim.status === 'pending_approval' && canApproveRole && !isMine) {
      btns.push('<button type="button" class="organizational-btn organizational-btn-primary expenseclaims-approve-btn" data-id="' + claim.id + '">Approve</button>');
    }
    if (claim.status === 'approved') {
      btns.push('<button type="button" class="organizational-btn organizational-btn-primary expenseclaims-pay-btn" data-id="' + claim.id + '">Record payment</button>');
    }
    if (claim.status === 'paid_pending_confirmation' && canApproveRole && !isMine) {
      btns.push('<button type="button" class="organizational-btn organizational-btn-primary expenseclaims-confirm-btn" data-id="' + claim.id + '">Confirm</button>');
    }
    if (!['void', 'disputed', 'confirmed'].includes(claim.status)) {
      const label = ['paid', 'paid_pending_confirmation'].includes(claim.status) ? 'Dispute / reverse' : 'Void';
      btns.push('<button type="button" class="organizational-btn organizational-btn-outline expenseclaims-void-btn" data-id="' + claim.id + '" data-label="' + label + '">' + label + '</button>');
    }
    return btns.join(' ');
  }

  async function openClaimDetail(claimId) {
    if (!detailPanel) return;
    detailPanel.hidden = false;
    detailPanel.innerHTML = '<p class="organizational-empty">Loading…</p>';
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claimId);
    if (!out || !out.res.ok) { detailPanel.innerHTML = '<p class="organizational-error">Could not load this claim.</p>'; return; }
    const claim = out.data.claim;

    const linesHtml = claim.lines.map((l) => (
      '<tr><td>' + esc(String(l.expense_date || '').slice(0, 10)) + '</td><td>' + esc(l.description) + '</td>'
      + '<td>' + esc(l.account_code ? l.account_code + ' — ' + l.account_name : l.account_name) + '</td>'
      + '<td>' + esc(l.program_name || '') + '</td><td>' + fmtMoney(Number(l.amount_cents)) + '</td></tr>'
    )).join('');

    detailPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<h4 style="margin:0 0 4px;">Claim #' + claim.id + ' — ' + esc(claim.submitted_by_name) + '</h4>'
      + '<button type="button" id="expenseclaims-detail-close" class="organizational-btn-icon" title="Close">✕</button>'
      + '</div>'
      + '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 8px;">' + esc(STATUS_LABELS[claim.status] || claim.status)
      + (claim.disputed_reason ? ' — ' + esc(claim.disputed_reason) : '') + '</p>'
      + '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Program</th><th>Amount</th></tr></thead>'
      + '<tbody>' + linesHtml + '</tbody>'
      + '<tfoot><tr style="font-weight:600;"><td colspan="4">Total</td><td>' + fmtMoney(Number(claim.total_cents)) + '</td></tr></tfoot></table></div>'
      + '<div id="expenseclaims-detail-docs" style="margin-top:12px;"></div>'
      + (claim.receipt_affidavit_at
          ? '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:8px 0 0;">Missing-receipt affidavit filed'
            + (claim.receipt_follow_up_due ? ' — receipt still owed by ' + esc(String(claim.receipt_follow_up_due).slice(0, 10)) : '')
            + (claim.receipt_resolved_at ? ' (receipt since attached)' : '') + '</p>'
          : '')
      + '<div id="expenseclaims-detail-affidavit" style="margin-top:8px;"></div>'
      + '<div id="expenseclaims-detail-error" class="organizational-panel-error" hidden style="margin-top:8px;"></div>'
      + '<div class="organizational-panel-actions" style="margin-top:12px;">' + actionButtonsHtml(claim) + '</div>'
      + '<div class="organizational-panel-section-head" style="margin-top:16px;">Messages</div>'
      + '<div id="expenseclaims-detail-messages"></div>'
      + '<div style="display:flex;gap:6px;margin-top:6px;">'
      + '<input type="text" id="expenseclaims-message-input" class="organizational-input" placeholder="Message the claimant/admin about this claim…" style="flex:1;">'
      + '<button type="button" id="expenseclaims-message-send" class="organizational-btn organizational-btn-outline">Send</button>'
      + '</div>';

    document.getElementById('expenseclaims-detail-close').addEventListener('click', () => { detailPanel.hidden = true; });

    if (window.OrganizationalDocumentAttach) {
      const docsEl = document.getElementById('expenseclaims-detail-docs');
      docsEl.innerHTML = window.OrganizationalDocumentAttach.html('expense_claim', ['expense_receipt', 'other']);
      window.OrganizationalDocumentAttach.wire(docsEl, { slug: currentSlug, sourceRefType: 'expense_claim', sourceRefId: claim.id });
    }

    wireDetailActions(claim);
    loadMessages(claim.id);
    const sendBtn = document.getElementById('expenseclaims-message-send');
    if (sendBtn) sendBtn.addEventListener('click', () => sendMessage(claim.id));
  }

  // ── Missing-receipt affidavit (structured, not a freeform note -- see migration 238) ──
  function renderAffidavitForm(claim) {
    const el = document.getElementById('expenseclaims-detail-affidavit');
    if (!el) return;
    el.innerHTML = '<div class="organizational-card" style="padding:10px 12px;">'
      + '<p style="margin:0 0 6px;font-size:0.875rem;font-weight:600;">Missing-receipt affidavit</p>'
      + '<p style="margin:0 0 8px;font-size:0.8125rem;color:var(--text-secondary);">This claim is at or above the org\'s receipt threshold and has no receipt attached. File this to submit anyway — a real receipt is still expected within 60 days.</p>'
      + '<label class="organizational-label">Reason the receipt is missing<textarea id="expenseclaims-affidavit-reason" class="organizational-input" rows="2"></textarea></label>'
      + '<label style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-size:0.8125rem;"><input type="checkbox" id="expenseclaims-affidavit-certify" style="margin-top:2px;">'
      + '<span>I certify that the vendor, date, amount, and business purpose already entered on this claim are accurate, and I will provide the actual receipt if it becomes available.</span></label>'
      + '<div id="expenseclaims-affidavit-error" class="organizational-panel-error" hidden style="margin-top:6px;"></div>'
      + '<div style="margin-top:8px;">'
      + '<button type="button" id="expenseclaims-affidavit-submit" class="organizational-btn organizational-btn-primary">File affidavit &amp; submit</button>'
      + '<button type="button" id="expenseclaims-affidavit-cancel" class="organizational-btn organizational-btn-outline" style="margin-left:8px;">Cancel</button>'
      + '</div></div>';

    document.getElementById('expenseclaims-affidavit-cancel').addEventListener('click', () => { el.innerHTML = ''; });
    document.getElementById('expenseclaims-affidavit-submit').addEventListener('click', async () => {
      const errEl = document.getElementById('expenseclaims-affidavit-error');
      errEl.hidden = true;
      const reason = document.getElementById('expenseclaims-affidavit-reason').value.trim();
      const certified = document.getElementById('expenseclaims-affidavit-certify').checked;
      if (!reason) { errEl.textContent = 'A reason is required.'; errEl.hidden = false; return; }
      if (!certified) { errEl.textContent = 'The certification checkbox is required.'; errEl.hidden = false; return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/receipt-affidavit', {
        method: 'POST', body: JSON.stringify({ reason, certified: true }),
      });
      if (!out || !out.res.ok) { errEl.textContent = (out && out.data && out.data.error) || 'Could not file this affidavit.'; errEl.hidden = false; return; }
      el.innerHTML = '';
      // Retry submit now that the affidavit is on file.
      const submitBtn = detailPanel.querySelector('.expenseclaims-submit-btn');
      if (submitBtn) submitBtn.click();
    });
  }

  // ── Message thread ──
  async function loadMessages(claimId) {
    const el = document.getElementById('expenseclaims-detail-messages');
    if (!el) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claimId + '/messages');
    const messages = (out && out.data && out.data.messages) || [];
    if (!messages.length) {
      el.innerHTML = '<p style="font-size:0.8125rem;color:var(--text-secondary);margin:4px 0;">No messages yet.</p>';
      return;
    }
    el.innerHTML = messages.map((m) => (
      '<div style="padding:6px 0;border-bottom:1px solid var(--border);">'
      + '<div style="font-size:0.75rem;color:var(--text-secondary);">' + esc(m.author_email) + ' — ' + esc(new Date(m.created_at).toLocaleString()) + '</div>'
      + '<div style="font-size:0.875rem;white-space:pre-wrap;">' + esc(m.body) + '</div>'
      + '</div>'
    )).join('');
  }

  async function sendMessage(claimId) {
    const input = document.getElementById('expenseclaims-message-input');
    const body = input.value.trim();
    if (!body) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claimId + '/messages', {
      method: 'POST', body: JSON.stringify({ body }),
    });
    if (out && out.res.ok) {
      input.value = '';
      await loadMessages(claimId);
    }
  }

  function wireDetailActions(claim) {
    const errEl2 = document.getElementById('expenseclaims-detail-error');
    const showDetailError = (msg) => { if (errEl2) { errEl2.textContent = msg || ''; errEl2.hidden = !msg; } };

    const editBtn = detailPanel.querySelector('.expenseclaims-edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => { openClaimForm(claim); });

    const submitBtn = detailPanel.querySelector('.expenseclaims-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', async () => {
      showDetailError('');
      let bankAccountId = null;
      if (approvalMode === 'post_payout') {
        if (!cashAccountsCache.length) { showDetailError('No bank account configured for this org.'); return; }
        bankAccountId = window.prompt(
          'Pay from which account?\n' + cashAccountsCache.map((a, i) => (i + 1) + '. ' + (a.code ? a.code + ' — ' + a.name : a.name)).join('\n') + '\nEnter a number:'
        );
        const idx = Number(bankAccountId) - 1;
        if (!Number.isInteger(idx) || !cashAccountsCache[idx]) { showDetailError('Cancelled — no bank account selected.'); return; }
        bankAccountId = cashAccountsCache[idx].id;
      }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/submit', {
        method: 'POST', body: JSON.stringify({ bank_account_id: bankAccountId }),
      });
      if (out && out.res.ok) { await loadClaims(); await openClaimDetail(claim.id); return; }
      if (out && out.data && out.data.code === 'receipt_or_affidavit_required') {
        renderAffidavitForm(claim);
        return;
      }
      showDetailError((out && out.data && out.data.error) || 'Could not submit this claim.');
    });

    const approveBtn = detailPanel.querySelector('.expenseclaims-approve-btn');
    if (approveBtn) approveBtn.addEventListener('click', async () => {
      showDetailError('');
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/approve', { method: 'POST' });
      if (out && out.res.ok) { await loadClaims(); await openClaimDetail(claim.id); }
      else showDetailError((out && out.data && out.data.error) || 'Could not approve this claim.');
    });

    const payBtn = detailPanel.querySelector('.expenseclaims-pay-btn');
    if (payBtn) payBtn.addEventListener('click', async () => {
      showDetailError('');
      if (!cashAccountsCache.length) { showDetailError('No bank account configured for this org.'); return; }
      const idxRaw = window.prompt(
        'Pay from which account?\n' + cashAccountsCache.map((a, i) => (i + 1) + '. ' + (a.code ? a.code + ' — ' + a.name : a.name)).join('\n') + '\nEnter a number:'
      );
      const idx = Number(idxRaw) - 1;
      if (!Number.isInteger(idx) || !cashAccountsCache[idx]) { showDetailError('Cancelled — no bank account selected.'); return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/pay', {
        method: 'POST',
        body: JSON.stringify({ bank_account_id: cashAccountsCache[idx].id, payment_date: new Date().toISOString().slice(0, 10) }),
      });
      if (out && out.res.ok) { await loadClaims(); await openClaimDetail(claim.id); }
      else showDetailError((out && out.data && out.data.error) || 'Could not record this payment.');
    });

    const confirmBtn = detailPanel.querySelector('.expenseclaims-confirm-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', async () => {
      showDetailError('');
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/confirm', { method: 'POST' });
      if (out && out.res.ok) { await loadClaims(); await openClaimDetail(claim.id); }
      else showDetailError((out && out.data && out.data.error) || 'Could not confirm this claim.');
    });

    const voidBtn = detailPanel.querySelector('.expenseclaims-void-btn');
    if (voidBtn) voidBtn.addEventListener('click', async () => {
      showDetailError('');
      const label = voidBtn.getAttribute('data-label') || 'Void';
      const reason = window.prompt(label + ' this claim -- reason:');
      if (!reason) return;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/expense-claims/' + claim.id + '/void', {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      if (out && out.res.ok) { await loadClaims(); await openClaimDetail(claim.id); }
      else showDetailError((out && out.data && out.data.error) || 'Could not void this claim.');
    });
  }

  if (tbody) tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.expenseclaims-view-btn');
    if (btn) openClaimDetail(Number(btn.getAttribute('data-id')));
  });

  // ── Escape closes whichever expense-claims panel is currently open ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (detailPanel && !detailPanel.hidden) { detailPanel.hidden = true; return; }
    if (formEl && !formEl.hidden) { formEl.hidden = true; return; }
    if (settingsPanel && !settingsPanel.hidden) { settingsPanel.hidden = true; return; }
  });

  // ── Entry point, called by the accounting-workspace coordinator ──
  async function initExpenseClaims(slug) {
    currentSlug = slug;
    await loadReferenceData(slug);
    await loadClaims();
  }

  window.OrganizationalAccounting.expenseClaims = { init: initExpenseClaims };
})();
