(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const listEl = document.getElementById('organizational-documents-list');
  const categoryFilterEl = document.getElementById('organizational-documents-category-filter');
  const uploadBtn = document.getElementById('organizational-documents-upload-btn');
  const binderFySelect = document.getElementById('organizational-documents-binder-fy');
  const binderListEl = document.getElementById('organizational-documents-binder-list');

  const modal = document.getElementById('organizational-documents-modal');
  const modalTitle = document.getElementById('organizational-documents-modal-title');
  const form = document.getElementById('organizational-documents-form');
  const formId = document.getElementById('organizational-documents-form-id');
  const formMode = document.getElementById('organizational-documents-form-mode');
  const formCategory = document.getElementById('organizational-documents-form-category');
  const formTitle = document.getElementById('organizational-documents-form-title');
  const formFile = document.getElementById('organizational-documents-form-file');
  const formFileHint = document.getElementById('organizational-documents-form-file-hint');
  const formFiscalYear = document.getElementById('organizational-documents-form-fiscal-year');
  const formDocumentDate = document.getElementById('organizational-documents-form-document-date');
  const formExpirationDate = document.getElementById('organizational-documents-form-expiration-date');
  const formRetentionClass = document.getElementById('organizational-documents-form-retention-class');
  const formRetentionYearsLabel = document.getElementById('organizational-documents-form-retention-years-label');
  const formRetentionYears = document.getElementById('organizational-documents-form-retention-years');
  const formVisibility = document.getElementById('organizational-documents-form-visibility');
  const formNotes = document.getElementById('organizational-documents-form-notes');
  const formCancel = document.getElementById('organizational-documents-form-cancel');

  const shareModal = document.getElementById('organizational-documents-share-modal');
  const shareDocNameEl = document.getElementById('organizational-documents-share-doc-name');
  const shareForm = document.getElementById('organizational-documents-share-form');
  const shareDocIdInput = document.getElementById('organizational-documents-share-doc-id');
  const shareRecipientInput = document.getElementById('organizational-documents-share-recipient');
  const shareExpiresInput = document.getElementById('organizational-documents-share-expires');
  const shareSubmitBtn = document.getElementById('organizational-documents-share-submit');
  const shareCancelBtn = document.getElementById('organizational-documents-share-cancel');
  const shareResultEl = document.getElementById('organizational-documents-share-result');
  const shareLinkInput = document.getElementById('organizational-documents-share-link');
  const shareCopyBtn = document.getElementById('organizational-documents-share-copy');
  const shareResultLabelEl = document.getElementById('organizational-documents-share-result-label');
  const shareLinkRowEl = document.getElementById('organizational-documents-share-link-row');

  const shareGroupForm = document.getElementById('organizational-documents-share-group-form');
  const shareGroupSelect = document.getElementById('organizational-documents-share-group-select');
  const shareGroupSubmitBtn = document.getElementById('organizational-documents-share-group-submit');
  const shareGroupCancelBtn = document.getElementById('organizational-documents-share-group-cancel');
  let accessGroups = [];

  const CATEGORY_LABELS = {
    irs_determination_letter: 'IRS Determination Letter',
    form_990: 'Form 990',
    audited_financials: 'Audited Financial Statements',
    management_letter: 'Auditor Management Letter',
    board_minutes: 'Board Meeting Minutes',
    board_resolution: 'Board Resolutions',
    bylaws: 'Bylaws',
    articles_of_incorporation: 'Articles of Incorporation',
    conflict_of_interest_policy: 'Conflict of Interest Policy',
    coi_disclosure: 'COI Disclosures',
    financial_policy: 'Financial Policy',
    personnel_policy: 'Personnel Policy',
    grant_agreement: 'Grant Agreement',
    award_letter: 'Award Letter',
    funder_report: 'Funder Report',
    insurance_certificate: 'Insurance Certificate',
    state_registration: 'State Registration',
    vendor_w9: 'Vendor W-9',
    contract_lease: 'Contract / Lease',
    payroll_tax_filing: 'Payroll Tax Filing',
    bank_statement: 'Bank Statement',
    vendor_bill: 'Vendor Bill',
    customer_invoice: 'Customer Invoice',
    procurement_quote: 'Procurement Quote',
    procurement_solicitation: 'Formal Solicitation (Sealed Bid / Competitive Proposal)',
    other: 'Other',
  };

  const RETENTION_LABELS = {
    permanent: 'Permanent',
    retain_until: 'Retain',
    expiring_soon: 'Expiring soon',
    expired: 'Expired',
  };

  let slug = '';
  let documents = [];

  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s || '');
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function slugFromPath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/documents\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function loadOrgInfo() {
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError('Could not load organization.');
        return;
      }
      const org = data.org;
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (e) {
      console.error('loadOrgInfo:', e);
      showError('Could not load organization.');
    }
  }

  function populateCategoryOptions() {
    const opts = Object.keys(CATEGORY_LABELS).map((k) => '<option value="' + k + '">' + esc(CATEGORY_LABELS[k]) + '</option>');
    if (categoryFilterEl) categoryFilterEl.innerHTML = '<option value="">All categories</option>' + opts.join('');
    if (formCategory) formCategory.innerHTML = opts.join('');
  }

  function retentionBadge(doc) {
    const cls = 'organizational-badge organizational-badge-doc-' + doc.retention_state;
    let label = RETENTION_LABELS[doc.retention_state] || doc.retention_state;
    if (doc.retention_state === 'retain_until' && (doc.expiration_date || doc.retention_until)) {
      label = 'Until ' + (doc.expiration_date || doc.retention_until);
    }
    if (doc.retention_state === 'expiring_soon' && (doc.expiration_date || doc.retention_until)) {
      label = 'Expires ' + (doc.expiration_date || doc.retention_until);
    }
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }

  function documentRowHtml(doc) {
    const visBadge = doc.visibility === 'admins_only'
      ? '<span class="organizational-badge">Admins only</span>' : '';
    return (
      '<div class="organizational-card organizational-documents-row" data-doc-id="' + doc.id + '">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">' +
          '<div>' +
            '<div class="organizational-org-name">' + esc(doc.title) + '</div>' +
            '<div class="organizational-org-meta">' + esc(CATEGORY_LABELS[doc.category] || doc.category) +
              (doc.fiscal_year ? ' · FY' + doc.fiscal_year : '') +
              (doc.version > 1 ? ' · v' + doc.version : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right; white-space:nowrap;">' +
            retentionBadge(doc) + visBadge +
          '</div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
          '<a class="organizational-btn organizational-btn-outline" href="/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + doc.id + '/download">Download</a>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-doc-edit="' + doc.id + '">Edit</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-doc-share="' + doc.id + '">Share</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-doc-archive="' + doc.id + '">Archive</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderList() {
    if (!listEl) return;
    const filterCategory = categoryFilterEl ? categoryFilterEl.value : '';
    const filtered = filterCategory ? documents.filter((d) => d.category === filterCategory) : documents;
    if (!filtered.length) {
      listEl.innerHTML = '<p class="organizational-empty">No documents yet.</p>';
      return;
    }
    listEl.innerHTML = filtered.map(documentRowHtml).join('');
  }

  async function loadDocuments() {
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      documents = data.documents || [];
      renderList();
    } catch (e) {
      console.error('loadDocuments:', e);
      if (listEl) listEl.innerHTML = '<p class="organizational-empty">Could not load documents.</p>';
    }
  }

  function populateBinderFyOptions() {
    if (!binderFySelect) return;
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) years.push(y);
    binderFySelect.innerHTML = years.map((y) => '<option value="' + y + '">' + y + '</option>').join('');
    binderFySelect.value = String(currentYear);
  }

  function binderRowHtml(item) {
    const statusBadge = {
      present: '<span class="organizational-badge organizational-badge-doc-permanent">Present</span>',
      missing: '<span class="organizational-badge organizational-badge-doc-expired">Missing</span>',
      expiring: '<span class="organizational-badge organizational-badge-doc-expiring_soon">Needs attention</span>',
    }[item.status] || '';
    const docLinks = (item.documents || []).map((d) =>
      '<a href="/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + d.id + '/download">' + esc(d.title) + '</a>'
    ).join(', ');
    return (
      '<div class="organizational-card" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">' +
        '<div>' +
          '<div class="organizational-org-name">' + esc(item.label) + '</div>' +
          (docLinks ? '<div class="organizational-org-meta">' + docLinks + '</div>' : '') +
        '</div>' +
        statusBadge +
      '</div>'
    );
  }

  async function loadBinder() {
    if (!binderListEl || !binderFySelect) return;
    const fy = binderFySelect.value;
    binderListEl.innerHTML = '<p class="organizational-empty">Loading audit binder…</p>';
    try {
      const res = await fetch(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/binder?fiscal_year=' + encodeURIComponent(fy),
        { credentials: 'include' }
      );
      const data = res.ok ? await res.json() : {};
      const checklist = data.checklist || [];
      binderListEl.innerHTML = checklist.length
        ? checklist.map(binderRowHtml).join('')
        : '<p class="organizational-empty">No expectations configured.</p>';
    } catch (e) {
      console.error('loadBinder:', e);
      binderListEl.innerHTML = '<p class="organizational-empty">Could not load audit binder.</p>';
    }
  }

  function openUploadModal() {
    formMode.value = 'upload';
    formId.value = '';
    if (modalTitle) modalTitle.textContent = 'Upload document';
    form.reset();
    formFile.required = true;
    formFileHint.textContent = '';
    modal.hidden = false;
  }

  function openEditModal(doc) {
    formMode.value = 'edit';
    formId.value = doc.id;
    if (modalTitle) modalTitle.textContent = 'Edit document';
    formCategory.value = doc.category;
    formTitle.value = doc.title;
    formFile.required = false;
    formFileHint.textContent = 'Current file: ' + doc.original_filename + ' (upload a new file via "Replace" instead of editing metadata here)';
    formFiscalYear.value = doc.fiscal_year || '';
    formDocumentDate.value = doc.document_date || '';
    formExpirationDate.value = doc.expiration_date || '';
    formRetentionClass.value = doc.retention_class;
    formRetentionYears.value = doc.retention_years || '';
    formVisibility.value = doc.visibility;
    formNotes.value = doc.notes || '';
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    form.reset();
  }

  async function submitForm(e) {
    e.preventDefault();
    const mode = formMode.value;
    try {
      if (mode === 'upload') {
        const fd = new FormData();
        fd.append('category', formCategory.value);
        if (formTitle.value) fd.append('title', formTitle.value);
        if (formFile.files[0]) fd.append('file', formFile.files[0]);
        if (formFiscalYear.value) fd.append('fiscal_year', formFiscalYear.value);
        if (formDocumentDate.value) fd.append('document_date', formDocumentDate.value);
        if (formExpirationDate.value) fd.append('expiration_date', formExpirationDate.value);
        fd.append('retention_class', formRetentionClass.value);
        if (formRetentionYears.value) fd.append('retention_years', formRetentionYears.value);
        fd.append('visibility', formVisibility.value);
        if (formNotes.value) fd.append('notes', formNotes.value);

        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not upload document');
        }
      } else {
        const id = formId.value;
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + id, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: formCategory.value,
            title: formTitle.value,
            fiscal_year: formFiscalYear.value || null,
            document_date: formDocumentDate.value || null,
            expiration_date: formExpirationDate.value || null,
            retention_class: formRetentionClass.value,
            retention_years: formRetentionYears.value || null,
            visibility: formVisibility.value,
            notes: formNotes.value || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not update document');
        }
      }
      closeModal();
      await loadDocuments();
    } catch (err) {
      alert(err.message || 'Could not save document');
    }
  }

  async function archiveDocument(id) {
    if (!confirm('Archive this document? It stays retrievable but is hidden from the default list.')) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + id, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not archive document');
      }
      await loadDocuments();
    } catch (err) {
      alert(err.message || 'Could not archive document');
    }
  }

  // ─── Ad hoc inline sharing ──────────────────────────────────────────────
  // Same permission mechanism as the Solid Pod page's "Give external access"
  // form (POST /data-pod/permissions) - just entered from the Documents module,
  // at the point where someone already has a specific document in front of
  // them, instead of having to go find it again on a separate page.

  async function loadAccessGroupsForShare() {
    if (!shareGroupSelect) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/access-groups', { credentials: 'include' });
      const data = res.ok ? await res.json() : { groups: [] };
      accessGroups = data.groups || [];
      shareGroupSelect.innerHTML = accessGroups.length
        ? accessGroups.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('')
        : '<option value="">No groups yet — create one on the Solid Pod page</option>';
      shareGroupSelect.disabled = accessGroups.length === 0;
    } catch (e) {
      console.error('loadAccessGroupsForShare:', e);
      shareGroupSelect.innerHTML = '<option value="">Could not load groups</option>';
      shareGroupSelect.disabled = true;
    }
  }

  function setShareMode(mode) {
    document.querySelectorAll('#organizational-documents-share-modal [data-share-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-share-mode') === mode);
    });
    if (shareForm) shareForm.hidden = mode !== 'individual';
    if (shareGroupForm) shareGroupForm.hidden = mode !== 'group';
    if (shareResultEl) shareResultEl.hidden = true;
  }

  function openShareModal(doc) {
    if (!shareModal) return;
    shareDocIdInput.value = doc.id;
    if (shareDocNameEl) shareDocNameEl.textContent = doc.title + ' (' + (CATEGORY_LABELS[doc.category] || doc.category) + ')';
    if (shareForm) shareForm.reset();
    if (shareGroupForm) shareGroupForm.reset();
    shareDocIdInput.value = doc.id;
    setShareMode('individual');
    loadAccessGroupsForShare();
    shareModal.hidden = false;
  }

  function closeShareModal() {
    if (shareModal) shareModal.hidden = true;
  }

  async function submitShareForm(e) {
    e.preventDefault();
    const docId = shareDocIdInput.value;
    const recipient = shareRecipientInput.value.trim();
    const expiresLocal = shareExpiresInput.value;
    if (!docId || !recipient || !expiresLocal) return;

    shareSubmitBtn.disabled = true;
    shareSubmitBtn.textContent = 'Sharing…';
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/data-pod/permissions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_document_id: Number(docId),
          recipient,
          expires_at: new Date(expiresLocal).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not share document');

      if (shareForm) shareForm.hidden = true;
      if (shareResultEl) shareResultEl.hidden = false;
      const verifiedLink = data.permission.share_token
        ? window.location.origin + '/share/' + encodeURIComponent(data.permission.share_token)
        : null;
      if (shareResultLabelEl) {
        shareResultLabelEl.textContent = verifiedLink
          ? (data.permission.link_emailed
              ? 'Access given. We emailed the recipient this link. They confirm their email with a code before the document opens:'
              : 'Access given, but the email could not be sent. Copy this link to the recipient. They confirm their email with a code before the document opens:')
          : 'Access given. Copyable link for the recipient:';
      }
      if (shareLinkRowEl) shareLinkRowEl.hidden = false;
      if (shareLinkInput) shareLinkInput.value = verifiedLink || data.permission.share_resource_url || data.permission.resource_url;
    } catch (err) {
      alert(err.message || 'Could not share document');
    } finally {
      shareSubmitBtn.disabled = false;
      shareSubmitBtn.textContent = 'Share';
    }
  }

  // Sharing with a group creates an ongoing standing rule (document-scoped),
  // not a one-off permission - it stays correct if group membership changes
  // later. Genuinely different behavior from individual sharing, so the
  // modal copy says so explicitly rather than reading like a one-time share.
  async function submitShareGroupForm(e) {
    e.preventDefault();
    const docId = shareDocIdInput.value;
    const groupId = shareGroupSelect ? shareGroupSelect.value : '';
    if (!docId || !groupId) return;
    const groupName = (accessGroups.find((g) => String(g.id) === groupId) || {}).name || 'The group';

    shareGroupSubmitBtn.disabled = true;
    shareGroupSubmitBtn.textContent = 'Sharing…';
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/access-groups/' + encodeURIComponent(groupId) + '/document-rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document_id: Number(docId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not share with group');

      if (shareGroupForm) shareGroupForm.hidden = true;
      if (shareResultEl) shareResultEl.hidden = false;
      if (shareLinkRowEl) shareLinkRowEl.hidden = true;
      const outboxIds = (data.rule && data.rule.outboxIds) || [];
      if (shareResultLabelEl) {
        shareResultLabelEl.textContent = outboxIds.length
          ? groupName + ' will have access to this document, including anyone added to ' + groupName + ' later. Giving access… (0/' + outboxIds.length + ')'
          : groupName + ' will have access to this document, including anyone added to ' + groupName + ' later.';
      }
      if (window.pollOutboxUntilSettled) {
        window.pollOutboxUntilSettled(
          '/api/organizational/orgs/' + encodeURIComponent(slug) + '/access-groups/outbox-status',
          outboxIds,
          function (state) {
            if (!shareResultLabelEl) return;
            const base = groupName + ' will have access to this document, including anyone added to ' + groupName + ' later.';
            if (!state.settled) shareResultLabelEl.textContent = base + ' Giving access… (' + (state.done + state.failed) + '/' + outboxIds.length + ')';
            else if (state.failed > 0) shareResultLabelEl.textContent = base + ' ' + state.failed + ' of ' + outboxIds.length + ' pod update(s) failed and will retry automatically.';
            else shareResultLabelEl.textContent = base;
          }
        );
      }
    } catch (err) {
      alert(err.message || 'Could not share with group');
    } finally {
      shareGroupSubmitBtn.disabled = false;
      shareGroupSubmitBtn.textContent = 'Share with group';
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.organizational-tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== tabId;
    });
    document.querySelectorAll('.organizational-tab-trigger').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    if (tabId === 'tab-doc-binder') loadBinder();
  }

  function wireEventListeners() {
    document.querySelectorAll('.organizational-tab-trigger').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    if (categoryFilterEl) categoryFilterEl.addEventListener('change', renderList);
    if (uploadBtn) uploadBtn.addEventListener('click', openUploadModal);
    if (formCancel) formCancel.addEventListener('click', closeModal);
    if (form) form.addEventListener('submit', submitForm);
    if (binderFySelect) binderFySelect.addEventListener('change', loadBinder);

    if (formRetentionClass) {
      formRetentionClass.addEventListener('change', () => {
        const fixedTerm = formRetentionClass.value === 'fixed_term';
        formRetentionYears.hidden = !fixedTerm;
        formRetentionYearsLabel.hidden = !fixedTerm;
      });
    }

    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-doc-edit]');
        const shareBtn = e.target.closest('[data-doc-share]');
        const archiveBtn = e.target.closest('[data-doc-archive]');
        if (editBtn) {
          const doc = documents.find((d) => String(d.id) === editBtn.getAttribute('data-doc-edit'));
          if (doc) openEditModal(doc);
        } else if (shareBtn) {
          const doc = documents.find((d) => String(d.id) === shareBtn.getAttribute('data-doc-share'));
          if (doc) openShareModal(doc);
        } else if (archiveBtn) {
          archiveDocument(archiveBtn.getAttribute('data-doc-archive'));
        }
      });
    }

    if (shareForm) shareForm.addEventListener('submit', submitShareForm);
    if (shareCancelBtn) shareCancelBtn.addEventListener('click', closeShareModal);
    if (shareGroupForm) shareGroupForm.addEventListener('submit', submitShareGroupForm);
    if (shareGroupCancelBtn) shareGroupCancelBtn.addEventListener('click', closeShareModal);
    document.querySelectorAll('#organizational-documents-share-modal [data-share-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setShareMode(btn.getAttribute('data-share-mode')));
    });
    if (shareCopyBtn) {
      shareCopyBtn.addEventListener('click', () => {
        if (!shareLinkInput) return;
        shareLinkInput.select();
        navigator.clipboard && navigator.clipboard.writeText(shareLinkInput.value).catch(() => {});
      });
    }
  }

  async function init() {
    slug = slugFromPath();
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }

    populateCategoryOptions();
    populateBinderFyOptions();
    wireEventListeners();

    await loadOrgInfo();

    loadingEl.hidden = true;
    dashEl.hidden = false;

    await loadDocuments();
  }

  init().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load documents.');
    console.error('Documents load error:', e);
  });
})();
