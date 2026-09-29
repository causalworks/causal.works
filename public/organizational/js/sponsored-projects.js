  (function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');

  const spList = document.getElementById('organizational-sp-list');
  const spAddBtn = document.getElementById('organizational-sp-add-btn');
  const spModal = document.getElementById('organizational-sp-modal');
  const spForm = document.getElementById('organizational-sp-form');
  const spEditId = document.getElementById('organizational-sp-edit-id');
  const spName = document.getElementById('organizational-sp-name');
  const spDescription = document.getElementById('organizational-sp-description');
  const spStartDate = document.getElementById('organizational-sp-start-date');
  const spEndDate = document.getElementById('organizational-sp-end-date');
  const spContactName = document.getElementById('organizational-sp-contact-name');
  const spContactEmail = document.getElementById('organizational-sp-contact-email');
  const spBudget = document.getElementById('organizational-sp-budget');
  const spSponsorshipModel = document.getElementById('organizational-sp-sponsorship-model');
  const spProgram = document.getElementById('organizational-sp-program');
  const spAdminRate = document.getElementById('organizational-sp-admin-rate');
  const spNextReportDue = document.getElementById('organizational-sp-next-report-due');
  const spStatus = document.getElementById('organizational-sp-status');
  const spCancel = document.getElementById('organizational-sp-cancel');
  const spSave = document.getElementById('organizational-sp-save');

  let programsCache = [];

  const spDetailModal = document.getElementById('organizational-sp-detail-modal');
  const spDetailTitle = document.getElementById('organizational-sp-detail-title');
  const spDetailContent = document.getElementById('organizational-sp-detail-content');
  const spDetailClose = document.getElementById('organizational-sp-detail-close');

  let currentSlug = '';
  let orgDefaultModel = '';

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSponsoredProjectsPath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/sponsored-projects\/?$/);
    if (!m) return { slug: '' };
    const slug = decodeURIComponent(m[1]);
    return { slug };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function sponsorshipModelLabel(model) {
    const labels = { model_c: 'Standard (pass-through)', model_a: 'Managed (comprehensive)', other: 'Other' };
    return labels[model] || 'Not set';
  }

  function programName(programId) {
    if (!programId) return 'Not linked';
    const p = programsCache.find((x) => Number(x.id) === Number(programId));
    return p ? (p.name || 'Program ' + programId) : 'Not linked';
  }

  async function loadSponsoredProjects() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects', {
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        spList.innerHTML = '<p class="organizational-empty">Could not load sponsored projects.</p>';
        return;
      }
      const projects = Array.isArray(data.sponsored_projects) ? data.sponsored_projects : [];
      if (projects.length === 0) {
        spList.innerHTML = '<p class="organizational-empty">No sponsored projects yet. Add one to get started.</p>';
        return;
      }
      const rows = projects.map(function (p) {
        return '<div class="organizational-card" style="padding: 16px; margin-bottom: 12px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">' +
          '<div style="font-weight: 600; font-size: 1.0625rem;">' + escapeHtml(p.name) + '</div>' +
          '<span class="organizational-badge">' + escapeHtml(p.status) + '</span>' +
          '</div>' +
          '<div style="font-size: 0.9375rem; margin-bottom: 8px;">' + escapeHtml(p.description || '') + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;">' +
          (p.start_date ? 'Start: ' + formatDate(p.start_date) : '') +
          (p.start_date && p.end_date ? ' · ' : '') +
          (p.end_date ? 'End: ' + formatDate(p.end_date) : '') +
          '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">' +
          'Contact: ' + escapeHtml(p.contact_lead_name || '') +
          (p.contact_lead_name && p.contact_lead_email ? ' · ' : '') +
          (p.contact_lead_email ? '<a href="mailto:' + escapeHtml(p.contact_lead_email) + '">' + escapeHtml(p.contact_lead_email) + '</a>' : '') +
          '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">' +
          'Budget: ' + formatCurrency(p.annual_budget_estimate) +
          '</div>' +
          '<div style="margin-top: 12px;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline organizational-sp-view-btn" data-sp-id="' + p.id + '" style="padding: 4px 12px; font-size: 0.8125rem; margin-right: 8px;">View</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline organizational-sp-edit-btn" data-sp-id="' + p.id + '" style="padding: 4px 12px; font-size: 0.8125rem; margin-right: 8px;">Edit</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline organizational-sp-delete-btn" data-sp-id="' + p.id + '" style="padding: 4px 12px; font-size: 0.8125rem;">Delete</button>' +
          '</div></div>';
      }).join('');
      spList.innerHTML = rows;

      // Wire view buttons
      spList.querySelectorAll('.organizational-sp-view-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-sp-id');
          const project = projects.find(function (p) { return Number(p.id) === Number(id); });
          if (project) viewProjectDetail(project);
        });
      });

      // Wire edit buttons
      spList.querySelectorAll('.organizational-sp-edit-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-sp-id');
          const project = projects.find(function (p) { return Number(p.id) === Number(id); });
          if (project) openSpModal(project);
        });
      });

      // Wire delete buttons
      spList.querySelectorAll('.organizational-sp-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-sp-id');
          if (confirm('Delete this sponsored project?')) {
            deleteSponsoredProject(id);
          }
        });
      });
    } catch (e) {
      console.error('loadSponsoredProjects:', e);
      spList.innerHTML = '<p class="organizational-empty">Could not load sponsored projects.</p>';
    }
  }

  function viewProjectDetail(project) {
    if (!spDetailModal) return;
    if (spDetailTitle) spDetailTitle.textContent = project.name;
    if (spDetailContent) {
      spDetailContent.innerHTML = '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Description</h4>' +
        '<p style="margin: 0;">' + escapeHtml(project.description || 'No description') + '</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Timeline</h4>' +
        '<p style="margin: 0;">Start: ' + formatDate(project.start_date) + '<br>' +
        'End: ' + (project.end_date ? formatDate(project.end_date) : 'Ongoing') + '</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Contact</h4>' +
        '<p style="margin: 0;">' + escapeHtml(project.contact_lead_name || '') + '<br>' +
        (project.contact_lead_email ? '<a href="mailto:' + escapeHtml(project.contact_lead_email) + '">' + escapeHtml(project.contact_lead_email) + '</a>' : '') + '</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Budget</h4>' +
        '<p style="margin: 0;">' + formatCurrency(project.annual_budget_estimate) + ' annually</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Status</h4>' +
        '<p style="margin: 0;">' + escapeHtml(project.status) + '</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Fiscal sponsorship</h4>' +
        '<p style="margin: 0;">Model: ' + escapeHtml(sponsorshipModelLabel(project.effective_sponsorship_model)) +
        (project.sponsorship_model ? '' : ' <span class="organizational-hint">(organization default)</span>') + '<br>' +
        'Admin rate: ' + (project.effective_admin_rate != null ? Number(project.effective_admin_rate) + '%' : 'Not set') +
        (project.admin_rate != null ? '' : ' <span class="organizational-hint">(organization default)</span>') + '<br>' +
        'Budget program: ' + escapeHtml(programName(project.program_id)) + '</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Project finances &amp; reports</h4>' +
        '<div id="organizational-sp-view-summary"><p class="organizational-hint" style="margin: 0;"><em>Loading…</em></p></div>' +
        '<div id="organizational-sp-view-documents" style="margin-top:8px;"><p class="organizational-hint" style="margin:0;"><em>Loading reports…</em></p></div>' +
        '<p class="organizational-hint" style="margin: 4px 0 0 0;">Open Edit to record a disbursement, approve one, or attach a new sponsee report.</p></div>' +
        '<div style="margin-bottom: 16px;">' +
        '<h4 style="margin: 0 0 8px 0;">Project notes</h4>' +
        '<p style="margin: 0;">' + escapeHtml(project.notes_markdown || 'No notes') + '</p></div>';
      loadViewSummary(project);
      loadProjectDocuments(project.id, 'organizational-sp-view-documents');
    }
    spDetailModal.hidden = false;
    spDetailModal.classList.add('organizational-modal-open');
  }

  // View is read-only by this page's own design (separate View/Edit buttons per row) --
  // plain figures here, no write actions. Recording/approving a disbursement or attaching a
  // report are edits, so they live in the Edit modal instead (see openSpModal).
  async function loadViewSummary(project) {
    const el = document.getElementById('organizational-sp-view-summary');
    if (!el) return;
    if (project.effective_sponsorship_model === 'model_a') {
      el.innerHTML = '<p style="margin:0;">Managed projects post through the sponsor\'s own regular expense accounts, coded to the linked program/activity above.</p>';
      return;
    }
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + project.id + '/tracking', { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      const s = data && data.summary;
      el.innerHTML = s
        ? '<p style="margin:0;">Received: <strong>' + formatCurrency(s.total_received_cents / 100) + '</strong> · ' +
          'Disbursed: <strong>' + formatCurrency(s.total_disbursed_cents / 100) + '</strong> · ' +
          'Balance: <strong>' + formatCurrency(s.balance_cents / 100) + '</strong><br>' +
          'Next report due: <strong>' + (project.next_report_due ? formatDate(project.next_report_due) : 'Not set') + '</strong></p>'
        : '<p class="organizational-error" style="margin:0;">Could not load tracking data.</p>';
    } catch (e) {
      console.error('loadViewSummary:', e);
      el.innerHTML = '<p class="organizational-error" style="margin:0;">Could not load tracking data.</p>';
    }
  }

  async function loadProjectDocuments(projectId, targetElId) {
    const el = document.getElementById(targetElId || 'organizational-sp-documents');
    if (!el) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents?sponsored_project_id=' + encodeURIComponent(projectId), { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      const docs = data && Array.isArray(data.documents) ? data.documents : [];
      el.innerHTML = docs.length
        ? '<ul style="margin:0;padding-left:20px;">' + docs.map(function (d) {
            return '<li><a href="/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents/' + d.id + '/download">' + escapeHtml(d.title) + '</a></li>';
          }).join('') + '</ul>'
        : '<p class="organizational-hint" style="margin:0;">No reports attached yet.</p>';
    } catch (e) {
      console.error('loadProjectDocuments:', e);
      el.innerHTML = '<p class="organizational-error">Could not load reports.</p>';
    }
  }

  // Plain button, not a <form> submit -- this lives inside the outer Edit modal's own
  // <form>, and a nested <form> is invalid HTML (its submit would also trigger the whole
  // project-save flow instead of just the attach action).
  function wireReportAttachForm(projectId) {
    const staleBtn = document.getElementById('organizational-sp-attach-btn');
    if (!staleBtn) return;
    // The button is static HTML, not rebuilt per open like the finances panel -- clone it to
    // strip any listener from a previous openSpModal call before adding a fresh one, so
    // reopening the Edit modal for a different project doesn't stack duplicate uploads.
    const btn = staleBtn.cloneNode(true);
    staleBtn.parentNode.replaceChild(btn, staleBtn);
    btn.addEventListener('click', async function () {
      const fileInput = document.getElementById('organizational-sp-attach-file');
      if (!fileInput || !fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('category', 'sponsee_report');
      fd.append('sponsored_project_id', projectId);
      fd.append('title', fileInput.files[0].name);
      fd.append('file', fileInput.files[0]);
      btn.disabled = true;
      try {
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/documents', {
          method: 'POST', credentials: 'include', body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(function () { return {}; });
          throw new Error(data.error || 'Could not attach report');
        }
        fileInput.value = '';
        await loadProjectDocuments(projectId);
      } catch (err) {
        alert(err.message || 'Could not attach report');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Standard (pass-through) projects: revenue received + net disbursed, per the 2026-09-14
  // fiscal-sponsorship research -- NOT the sponsee's own itemized expenses, those stay in
  // the sponsee's own books (see Documents for their reports). Managed (comprehensive)
  // projects flow through the org's own program/activity accounting instead (bills coded to
  // the linked program/activity, existing draft->submit->approve workflow) -- that ledger
  // integration is still a later pass, so Managed shows a pointer to its program/activity
  // rather than this revenue/disbursement view, which would be the wrong shape for it.
  async function loadProjectFinances(project) {
    const el = document.getElementById('organizational-sp-finances');
    if (!el) return;
    const effectiveModel = project.effective_sponsorship_model;
    if (effectiveModel === 'model_a') {
      const progLabel = project.program_id ? escapeHtml(programName(project.program_id)) : null;
      el.innerHTML = '<p class="organizational-hint" style="margin: 0;"><em>Managed projects post through the sponsor\'s own regular expense accounts -- ' +
        (progLabel ? 'code bills and other expenses to <strong>' + progLabel + '</strong> (the linked program/activity above)' : 'link a program or activity above, then code bills to it') +
        ', same as any other program. See Budget → By Program for this project\'s figures; no separate view here.</em></p>';
      return;
    }
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + project.id + '/tracking', { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      if (!data) { el.innerHTML = '<p class="organizational-error">Could not load tracking data.</p>'; return; }
      const s = data.summary;
      const disbursements = Array.isArray(data.disbursements) ? data.disbursements : [];
      const pendingNote = s.pending_disbursed_cents > 0
        ? ' <span class="organizational-hint">(+ ' + formatCurrency(s.pending_disbursed_cents / 100) + ' awaiting approval, not yet counted)</span>'
        : '';
      const disbursementRows = disbursements.length
        ? disbursements.map(function (d) {
            const isPending = d.status === 'pending_approval';
            return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.8125rem;">' +
              '<span>' + formatDate(d.disbursement_date) + ' — ' + formatCurrency(d.amount_cents / 100) +
              (d.admin_fee_cents ? ' (fee ' + formatCurrency(d.admin_fee_cents / 100) + ')' : '') + '</span>' +
              '<span class="organizational-badge">' + escapeHtml(d.status) + '</span>' +
              (isPending ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-sp-approve-disb" data-disb-id="' + d.id + '">Approve</button>' : '') +
              '</div>';
          }).join('')
        : '<p class="organizational-hint" style="margin:4px 0;">No disbursements recorded yet.</p>';
      el.innerHTML =
        '<p style="margin: 0 0 8px 0;">' +
        'Received: <strong>' + formatCurrency(s.total_received_cents / 100) + '</strong><br>' +
        'Disbursed: <strong>' + formatCurrency(s.total_disbursed_cents / 100) + '</strong>' + pendingNote + '<br>' +
        'Admin fee retained: <strong>' + formatCurrency(s.total_admin_fee_cents / 100) + '</strong><br>' +
        'Balance held: <strong>' + formatCurrency(s.balance_cents / 100) + '</strong></p>' +
        disbursementRows +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-sp-record-disbursement" style="font-size:0.8125rem;margin-top:6px;">Record disbursement</button>' +
        '<div id="organizational-sp-disbursement-form" hidden style="margin-top:10px;"></div>';
      const btn = document.getElementById('organizational-sp-record-disbursement');
      if (btn) btn.addEventListener('click', function () { openDisbursementForm(project); });
      el.querySelectorAll('.organizational-sp-approve-disb').forEach(function (approveBtn) {
        approveBtn.addEventListener('click', async function () {
          const disbId = approveBtn.getAttribute('data-disb-id');
          approveBtn.disabled = true;
          try {
            const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + project.id + '/disbursements/' + disbId + '/approve', {
              method: 'POST', credentials: 'include',
            });
            if (!res.ok) { approveBtn.disabled = false; return; }
            loadProjectFinances(project);
          } catch (e) {
            approveBtn.disabled = false;
          }
        });
      });
    } catch (e) {
      console.error('loadProjectFinances:', e);
      el.innerHTML = '<p class="organizational-error">Could not load tracking data.</p>';
    }
  }

  function openDisbursementForm(project) {
    const formEl = document.getElementById('organizational-sp-disbursement-form');
    if (!formEl) return;
    formEl.hidden = false;
    formEl.innerHTML =
      '<label>Disbursement date <input type="date" id="organizational-sp-disb-date"></label><br>' +
      '<label>Amount paid to sponsee <input type="number" min="0" step="0.01" id="organizational-sp-disb-amount"></label><br>' +
      '<label>Admin fee retained (optional) <input type="number" min="0" step="0.01" id="organizational-sp-disb-fee"></label><br>' +
      '<label>Notes <input type="text" id="organizational-sp-disb-notes"></label><br>' +
      '<button type="button" class="organizational-btn" id="organizational-sp-disb-save" style="margin-top:6px;">Save</button>' +
      '<span id="organizational-sp-disb-error" class="organizational-error" style="display:none;margin-left:8px;"></span>';

    const saveBtn = document.getElementById('organizational-sp-disb-save');
    if (saveBtn) saveBtn.addEventListener('click', async function () {
      const dateEl = document.getElementById('organizational-sp-disb-date');
      const amountEl = document.getElementById('organizational-sp-disb-amount');
      const feeEl = document.getElementById('organizational-sp-disb-fee');
      const notesEl = document.getElementById('organizational-sp-disb-notes');
      const errEl = document.getElementById('organizational-sp-disb-error');
      const body = {
        disbursement_date: dateEl && dateEl.value ? dateEl.value : null,
        amount_cents: amountEl && amountEl.value ? Math.round(Number(amountEl.value) * 100) : null,
        admin_fee_cents: feeEl && feeEl.value ? Math.round(Number(feeEl.value) * 100) : null,
        notes: notesEl && notesEl.value ? notesEl.value : null,
      };
      try {
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + project.id + '/disbursements', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = res.ok ? await res.json() : await res.json().catch(() => ({}));
        if (!res.ok) {
          if (errEl) { errEl.textContent = data.error || 'Could not save disbursement.'; errEl.style.display = ''; }
          return;
        }
        loadProjectFinances(project);
      } catch (e) {
        if (errEl) { errEl.textContent = 'Could not save disbursement.'; errEl.style.display = ''; }
      }
    });
  }

  function closeSpDetailModal() {
    if (!spDetailModal) return;
    spDetailModal.classList.remove('organizational-modal-open');
    spDetailModal.hidden = true;
  }

  function openSpModal(project) {
    if (!spModal) return;
    const editing = project && project.id;
    if (spEditId) spEditId.value = editing ? String(project.id) : '';
    if (spName) spName.value = project ? project.name : '';
    if (spDescription) spDescription.value = project ? project.description || '' : '';
    if (spStartDate) spStartDate.value = project && project.start_date ? project.start_date.slice(0, 10) : '';
    if (spEndDate) spEndDate.value = project && project.end_date ? project.end_date.slice(0, 10) : '';
    if (spContactName) spContactName.value = project ? project.contact_lead_name || '' : '';
    if (spContactEmail) spContactEmail.value = project ? project.contact_lead_email || '' : '';
    if (spBudget) spBudget.value = project && project.annual_budget_estimate !== null ? project.annual_budget_estimate : '';
    if (spSponsorshipModel) spSponsorshipModel.value = project && project.sponsorship_model ? project.sponsorship_model : '';
    if (spProgram) spProgram.value = project && project.program_id ? String(project.program_id) : '';
    if (spAdminRate) spAdminRate.value = project && project.admin_rate !== null && project.admin_rate !== undefined ? project.admin_rate : '';
    if (spNextReportDue) spNextReportDue.value = project && project.next_report_due ? project.next_report_due.slice(0, 10) : '';
    if (spStatus) spStatus.value = project ? project.status : 'active';
    updateProgramHint();

    // Finances/reports need a real project id to fetch against -- hidden entirely when
    // creating a new project, shown and populated only when editing an existing one.
    const financesSection = document.getElementById('organizational-sp-edit-finances-section');
    const reportsSection = document.getElementById('organizational-sp-edit-reports-section');
    if (financesSection) financesSection.hidden = !editing;
    if (reportsSection) reportsSection.hidden = !editing;
    if (editing) {
      const summaryEl = document.getElementById('organizational-sp-reports-summary');
      if (summaryEl) {
        summaryEl.innerHTML = '<p style="margin:0 0 8px 0;">Next report due: <strong>' +
          (project.next_report_due ? formatDate(project.next_report_due) : 'Not set') + '</strong>' +
          (project.last_report_received_at ? ' · Last received: ' + formatDate(project.last_report_received_at) : '') + '</p>';
      }
      loadProjectFinances(project);
      loadProjectDocuments(project.id);
      wireReportAttachForm(project.id);
    }

    spModal.hidden = false;
    spModal.classList.add('organizational-modal-open');
    if (spName) spName.focus();
  }

  function updateProgramHint() {
    const hintEl = document.getElementById('organizational-sp-program-hint');
    if (!hintEl || !spSponsorshipModel) return;
    const effectiveModel = spSponsorshipModel.value || orgDefaultModel;
    hintEl.hidden = effectiveModel !== 'model_a';
  }

  function closeSpModal() {
    if (!spModal) return;
    spModal.classList.remove('organizational-modal-open');
    spModal.hidden = true;
    if (spForm) spForm.reset();
    if (spEditId) spEditId.value = '';
  }

  async function saveSponsoredProject(e) {
    e.preventDefault();
    const editId = spEditId && spEditId.value ? Number(spEditId.value) : 0;
    const isEdit = Number.isInteger(editId) && editId > 0;

    const body = {
      name: spName ? spName.value : '',
      description: spDescription ? spDescription.value : '',
      start_date: spStartDate && spStartDate.value ? spStartDate.value : null,
      end_date: spEndDate && spEndDate.value ? spEndDate.value : null,
      contact_lead_name: spContactName ? spContactName.value : '',
      contact_lead_email: spContactEmail ? spContactEmail.value : '',
      annual_budget_estimate: spBudget && spBudget.value ? Number(spBudget.value) : null,
      sponsorship_model: spSponsorshipModel && spSponsorshipModel.value ? spSponsorshipModel.value : null,
      program_id: spProgram && spProgram.value ? Number(spProgram.value) : null,
      admin_rate: spAdminRate && spAdminRate.value ? Number(spAdminRate.value) : null,
      next_report_due: spNextReportDue && spNextReportDue.value ? spNextReportDue.value : null,
      status: spStatus ? spStatus.value : 'active'
    };

    if (spSave) spSave.disabled = true;
    try {
      const base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects';
      const url = isEdit ? base + '/' + editId : base;
      const method = isEdit ? 'PATCH' : 'POST';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError(data.error || 'Could not save sponsored project.');
        return;
      }
      showError('');
      closeSpModal();
      await loadSponsoredProjects();
    } catch (e) {
      console.error('saveSponsoredProject:', e);
      showError('Could not save sponsored project.');
    } finally {
      if (spSave) spSave.disabled = false;
    }
  }

  async function deleteSponsoredProject(id) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects/' + id, {
        method: 'DELETE',
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        showError('Could not delete sponsored project.');
        return;
      }
      showError('');
      await loadSponsoredProjects();
    } catch (e) {
      console.error('deleteSponsoredProject:', e);
      showError('Could not delete sponsored project.');
    }
  }

  function wireSpModal() {
    if (spModal) {
      spModal.addEventListener('click', function (e) {
        if (e.target === spModal) closeSpModal();
      });
    }
    if (spCancel) spCancel.addEventListener('click', closeSpModal);
    if (spAddBtn) spAddBtn.addEventListener('click', function () { openSpModal(null); });
    if (spForm) spForm.addEventListener('submit', saveSponsoredProject);
    if (spSponsorshipModel) spSponsorshipModel.addEventListener('change', updateProgramHint);
    if (spDetailClose) spDetailClose.addEventListener('click', closeSpDetailModal);
    if (spDetailModal) {
      spDetailModal.addEventListener('click', function (e) {
        if (e.target === spDetailModal) closeSpDetailModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (spModal && spModal.classList.contains('organizational-modal-open')) closeSpModal();
      if (spDetailModal && spDetailModal.classList.contains('organizational-modal-open')) closeSpDetailModal();
    });
  }

  async function loadPrograms(slug) {
    try {
      // No dimension filter -- fetch programs AND activities, so a Managed project can link
      // to its own activity under a program (each project should get its own activity, kept
      // separable from that program's other activity), not just the top-level program.
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      programsCache = Array.isArray(data.programs) ? data.programs : [];
      if (spProgram) {
        const prev = spProgram.value;
        spProgram.innerHTML = '<option value="">No program linked</option>';
        const topLevel = programsCache.filter((p) => p.parent_id == null);
        topLevel.forEach((p) => {
          const activities = programsCache.filter((a) => a.parent_id === p.id);
          const group = document.createElement('optgroup');
          group.label = p.name || 'Program ' + p.id;
          const programOpt = document.createElement('option');
          programOpt.value = String(p.id);
          programOpt.textContent = '(the program itself, no specific activity)';
          group.appendChild(programOpt);
          activities.forEach((a) => {
            const o = document.createElement('option');
            o.value = String(a.id);
            o.textContent = a.name || 'Activity ' + a.id;
            group.appendChild(o);
          });
          spProgram.appendChild(group);
        });
        if (prev) spProgram.value = prev;
      }
    } catch (e) {
      console.error('loadPrograms:', e);
    }
  }

  async function loadOrgInfo(slug) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { 
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError('Could not load organization.');
        return;
      }
      const org = data.org;
      orgDefaultModel = org && org.sponsorship_model ? org.sponsorship_model : '';
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }

      // Check if fiscal sponsorship mode is enabled
      if (!org.fiscal_sponsorship_mode) {
        showError('Fiscal sponsorship mode is not enabled for this organization. Enable it in Settings to manage sponsored projects.');
        spAddBtn.hidden = true;
      }
    } catch (e) {
      console.error('loadOrgInfo:', e);
    }
  }

  async function init() {
    const { slug } = parseSponsoredProjectsPath();
    currentSlug = slug;
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }

    wireSpModal();
    await Promise.all([loadOrgInfo(slug), loadPrograms(slug)]);

    loadingEl.hidden = true;
    dashEl.hidden = false;

    await loadSponsoredProjects();
  }

  // Self-invoking on script load -- not a named function in this scope (that's just this
  // expression's own internal name), so the `initHeader();` call this used to have inside
  // init() above was a ReferenceError on every page load. Header/coop-icon setup here needs no
  // explicit trigger; it already runs once on its own.
  (async function initHeader() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/me', { 
        credentials: 'same-origin',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        // Show coop icon for workers, hide for public users
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    // Bind outside click handlers
    bindOrganizationalDropdownOutsideClick();

    // Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeOrganizationalDropdown();
      closeOrganizationalOverlay();
    });

    document.addEventListener('click', (e) => {
      const overlay = e.target.closest('.organizational-overlay');
      if (overlay && e.target === overlay) {
        closeOrganizationalOverlay();
      }
    });
  })();

  function closeOrganizationalDropdown() {
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (icon) icon.setAttribute('aria-expanded', 'false');
  }

  function toggleOrganizationalDropdown(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (!dd) return;
    const opening = dd.hidden;
    dd.hidden = !opening;
    dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
    if (icon) icon.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }

  let coopDropdownDocClickBound = false;
  function bindOrganizationalDropdownOutsideClick() {
    if (coopDropdownDocClickBound) return;
    coopDropdownDocClickBound = true;
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('organizational-dropdown');
      const icon = document.getElementById('organizational-icon');
      if (!dd || dd.hidden) return;
      if (icon && icon.contains(e.target)) return;
      if (dd && dd.contains(e.target)) return;
      closeOrganizationalDropdown();
    });
  }

  function coopDropdownOpenMembers() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('members');
  }

  function coopDropdownOpenLibrary() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('library');
  }

  function coopDropdownOpenWorkPool() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('work-pool');
  }

  function openOrganizationalOverlay(type) {
    const overlay = document.getElementById('organizational-overlay-' + type);
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      loadOrganizationalOverlayData(type);
    }
  }

  function closeOrganizationalOverlay() {
    document.querySelectorAll('.organizational-overlay').forEach(overlay => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  }

  async function loadOrganizationalOverlayData(type) {
    const listEl = document.getElementById('organizational-overlay-' + type + '-list');
    if (!listEl) return;

    if (type === 'members') {
      listEl.innerHTML = '<p class="organizational-empty">Loading member directory…</p>';
      try {
        const res = await fetch('/api/organizational/cooperative/members', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          const members = data.members || [];
          if (members.length === 0) {
            listEl.innerHTML = '<p class="organizational-empty">No members yet.</p>';
          } else {
            listEl.innerHTML = members.map(m => `
              <div class="organizational-list-item">
                <div class="organizational-list-item-main">
                  <div class="organizational-list-item-title">${escapeHtml(m.display_name || m.slug || '—')}</div>
                </div>
              </div>
            `).join('');
          }
        } else {
          listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
        }
      } catch (e) {
        listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
      }
    } else if (type === 'library') {
      listEl.innerHTML = '<p class="organizational-empty">Library coming soon.</p>';
    } else if (type === 'work-pool') {
      listEl.innerHTML = '<p class="organizational-empty">Work pool coming soon.</p>';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  document.addEventListener("DOMContentLoaded", function() {
  init().catch(function(e) {
    const loadingEl = document.getElementById("organizational-org-loading");
    if (loadingEl) loadingEl.hidden = true;
    console.error("Sponsored projects load error:", e);
  });
});
})();
