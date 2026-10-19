/* sponsor-records.js — a sponsored project's records (agreement and amendments, documents by type, reports, good standing and
   acknowledgments, approvals) and the workspace-wide lists (applications, approvals queue, reports calendar, agreement templates).
   OrganizationalSponsorRecords.renderProject(el, { slug, projectId, canStaff, canEnter, isAdmin, onChange })
   OrganizationalSponsorRecords.renderWorkspace(el, { slug, canStaff, programs }) */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const money = (c) => window.formatMoneyCents(Number(c) || 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const STATUS = { overdue: 'Overdue', due_soon: 'Due soon', upcoming: 'Upcoming', received: 'Received' };
  const APPROVAL_KINDS = { letter_of_inquiry: 'Letter of inquiry', proposal: 'Proposal', pledge: 'Pledge', agreement: 'Funder agreement', solicitation: 'Solicitation', publicity: 'Publicity' };

  function api(slug, path, opts) {
    return apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + path, opts || { method: 'GET' });
  }
  async function post(slug, path, body, method) {
    const out = await api(slug, path, { method: method || 'POST', body: JSON.stringify(body || {}) });
    if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'That did not work. Try again.'); return null; }
    return out.data;
  }
  function docLink(slug, id, label) {
    return id ? '<a href="/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + id + '/download">' + esc(label || 'Open') + '</a>' : '';
  }
  function docSelect(docs, attr, placeholder) {
    return '<select class="organizational-select" ' + attr + '><option value="">' + esc(placeholder) + '</option>' +
      docs.filter((d) => d.is_current !== false).map((d) => '<option value="' + d.id + '">' + esc(d.title) + '</option>').join('') + '</select>';
  }

  // Upload a file to the project with a type, through the shared documents upload.
  async function upload(ctx, file, type, types, supersedesId) {
    const fd = new FormData();
    const t = types.find((x) => x.key === type);
    fd.append('file', file);
    fd.append('title', file.name);
    if (supersedesId) {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(ctx.slug) + '/documents/' + supersedesId + '/supersede', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); window.alert(d.error || 'Could not upload the new version.'); return null; }
      return (await res.json()).document;
    }
    fd.append('category', t ? t.category : 'other');
    fd.append('sponsored_project_id', ctx.projectId);
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(ctx.slug) + '/documents', { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); window.alert(d.error || 'Could not upload the document.'); return null; }
    const doc = (await res.json()).document;
    if (doc && type) await post(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/documents/' + doc.id, { sponsor_doc_type: type }, 'PATCH');
    return doc;
  }

  async function renderProject(el, ctx) {
    if (!el) return;
    const base = '/sponsored-projects/' + ctx.projectId;
    const [ag, docs, reps, st, apprs, tpls] = await Promise.all([
      api(ctx.slug, base + '/agreements'), api(ctx.slug, base + '/documents'), api(ctx.slug, base + '/reports'),
      api(ctx.slug, base + '/standing'), api(ctx.slug, '/sponsor-approvals'), api(ctx.slug, '/sponsor-agreement-templates'),
    ]);
    const agreements = (ag && ag.res.ok && ag.data.agreements) || [];
    const amendments = (ag && ag.res.ok && ag.data.amendments) || [];
    const docList = (docs && docs.res.ok && docs.data.documents) || [];
    const types = (docs && docs.res.ok && docs.data.types) || [];
    const reports = (reps && reps.res.ok && reps.data.reports) || [];
    const standing = st && st.res.ok && st.data.standing;
    const approvals = ((apprs && apprs.res.ok && apprs.data.approvals) || []).filter((a) => Number(a.sponsored_project_id) === Number(ctx.projectId));
    const templates = (tpls && tpls.res.ok && tpls.data.templates) || [];
    const signed = agreements.find((a) => a.signed_at);
    const draft = agreements.find((a) => !a.signed_at);
    const typeLabel = (k) => (types.find((t) => t.key === k) || {}).label || 'No type';

    const docsByType = {};
    docList.forEach((d) => { (docsByType[d.sponsor_doc_type || ''] = docsByType[d.sponsor_doc_type || ''] || []).push(d); });

    el.innerHTML =
      // Agreement
      '<div class="organizational-panel-section-head">Agreement</div>' +
      (signed ? '<p class="organizational-sp-rec-line">Signed ' + esc(signed.signed_at) + ' · ' + docLink(ctx.slug, signed.signed_document_id, 'signed copy') +
          ' · effective ' + esc(signed.effective_date) + '</p>' +
          (amendments.length ? '<ul class="organizational-sp-fund-list">' + amendments.map((m) => '<li>Amendment from ' + esc(m.effective_date) + ': ' + esc(m.summary) + ' · ' + docLink(ctx.slug, m.document_id, 'document') + '</li>').join('') + '</ul>' : '') +
          (ctx.canStaff ? '<p class="organizational-sp-rec-line"><a href="#" data-a="amend" data-id="' + signed.id + '">Record an amendment</a></p>' : '')
        : '<p class="organizational-sp-rec-line organizational-sp-mo-hold">No signed agreement on file.</p>' +
          (draft ? '<p class="organizational-sp-rec-line">Draft generated ' + esc(String(draft.created_at).slice(0, 10)) + ' · ' + docLink(ctx.slug, draft.generated_document_id, 'open the draft') +
            (ctx.canStaff ? ' · <a href="#" data-a="signed" data-id="' + draft.id + '">Record the signed copy</a>' : '') + '</p>' : '') +
          (ctx.canStaff ? '<p class="organizational-sp-rec-line"><a href="#" data-a="generate">' + (draft ? 'Generate again' : 'Generate the agreement') + '</a></p>' : '')) +
      '<div data-box="agreement" hidden></div>' +
      // Documents
      '<div class="organizational-panel-section-head">Documents</div>' +
      (docList.length ? '<ul class="organizational-sp-fund-list">' + Object.keys(docsByType).sort().map((k) =>
        '<li><strong>' + esc(k ? typeLabel(k) : 'No type') + '</strong>: ' + docsByType[k].map((d) =>
          docLink(ctx.slug, d.id, d.title) + (d.version > 1 ? ' <span class="organizational-hint">v' + d.version + (d.is_current ? '' : ', older') + '</span>' : '') +
          (ctx.canEnter && d.is_current ? ' <a href="#" class="organizational-hint" data-a="version" data-id="' + d.id + '">new version</a>' : '') +
          (ctx.canEnter && !k ? ' <select class="organizational-select organizational-sp-rec-type" data-a="type" data-id="' + d.id + '"><option value="">Set type</option>' +
            types.map((t) => '<option value="' + t.key + '">' + esc(t.label) + '</option>').join('') + '</select>' : '')).join(' · ') + '</li>').join('') + '</ul>'
        : '<p class="organizational-hint organizational-sp-rec-line">No documents yet.</p>') +
      (ctx.canEnter ? '<p class="organizational-sp-rec-line"><select class="organizational-select organizational-sp-rec-type" data-f="up-type">' + types.map((t) => '<option value="' + t.key + '">' + esc(t.label) + '</option>').join('') +
        '</select> <input type="file" data-f="up-file"> <button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="upload">Upload</button></p>' : '') +
      // Reports
      '<div class="organizational-panel-section-head">Reports</div>' +
      (reports.length ? '<ul class="organizational-sp-fund-list">' + reports.slice().reverse().slice(0, 12).map((r) =>
        '<li>' + esc(r.kind === 'funder' ? (r.title || 'Funder report') + (r.funder_name ? ' (' + r.funder_name + ')' : '') : 'Quarter ' + r.period_start + ' to ' + r.period_end) +
        ' · due ' + esc(r.due_date) + ' · <span class="organizational-sp-rec-' + r.status + '">' + esc(STATUS[r.status] || r.status) + (r.received_at ? ' ' + esc(r.received_at) : '') + '</span>' +
        (r.document_id ? ' · ' + docLink(ctx.slug, r.document_id, 'report') : '') +
        (ctx.canStaff && !r.received_at ? ' · <a href="#" data-a="received" data-id="' + r.id + '">Mark received</a>' : '') + '</li>').join('') + '</ul>'
        : '<p class="organizational-hint organizational-sp-rec-line">Quarterly reports appear here once the project is active.</p>') +
      (ctx.canStaff ? '<p class="organizational-sp-rec-line"><a href="#" data-a="funder-report">Add a report owed to a funder</a></p>' : '') +
      '<div data-box="report" hidden></div>' +
      // Standing
      '<div class="organizational-panel-section-head">Good standing</div>' +
      (standing ? '<p class="organizational-sp-rec-line">' + (standing.good ? 'In good standing.' : '<span class="organizational-sp-mo-hold">Not in good standing.</span>') +
          (standing.status === 'lapsed' && ctx.canStaff ? ' <a href="#" data-a="reactivate">Reactivate</a>' : '') + '</p>' +
        '<ul class="organizational-sp-fund-list">' + standing.items.map((i) => '<li>' + (i.ok ? '✓ ' : '✗ ') + esc(i.label) + ' <span class="organizational-hint">' + esc(i.detail) + '</span></li>').join('') + '</ul>' +
        '<details class="organizational-collapsible"><summary class="organizational-section-heading">Standing terms acknowledged</summary><div class="organizational-section-body"><ul class="organizational-sp-fund-list">' +
        standing.acknowledgments.map((a) => '<li>' + esc(a.label) + ' · ' + (a.acknowledged_on ? esc(a.acknowledged_on) : '<span class="organizational-hint">not yet</span>') +
          (ctx.canStaff ? ' · <a href="#" data-a="ack" data-key="' + a.key + '">Record</a>' : '') + '</li>').join('') + '</ul></div></details>' : '') +
      // Approvals
      '<div class="organizational-panel-section-head">Items using the sponsor\'s name</div>' +
      (approvals.length ? '<ul class="organizational-sp-fund-list">' + approvals.map((a) => '<li>' + esc(APPROVAL_KINDS[a.kind] || a.kind) + ': ' + esc(a.title) + ' · ' + esc(a.status) +
        (a.decision_reason ? ' <span class="organizational-hint">' + esc(a.decision_reason) + '</span>' : '') + (a.draft_document_id ? ' · ' + docLink(ctx.slug, a.draft_document_id, 'draft') : '') +
        (ctx.canStaff && a.status === 'pending' ? ' · <a href="#" data-a="decide" data-id="' + a.id + '" data-d="approve">Approve</a> · <a href="#" data-a="decide" data-id="' + a.id + '" data-d="decline">Decline</a>' : '') + '</li>').join('') + '</ul>'
        : '<p class="organizational-hint organizational-sp-rec-line">Nothing waiting for approval.</p>') +
      (ctx.canEnter ? '<p class="organizational-sp-rec-line"><a href="#" data-a="ask-approval">Ask for approval</a></p>' : '') +
      '<div data-box="approval" hidden></div>';

    const done = () => { renderProject(el, ctx); if (ctx.onChange) ctx.onChange(); };
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((x) => x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'click', (e) => { if (x.tagName === 'A') e.preventDefault(); fn(x); }));

    on('[data-a="generate"]', () => {
      const box = el.querySelector('[data-box="agreement"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form">' +
        '<label>Template <select class="organizational-select" data-f="tpl">' + templates.map((t) => '<option value="' + t.id + '">' + esc(t.title) + (t.is_default ? '' : ' (this workspace)') + '</option>').join('') + '</select></label>' +
        '<label>Takes effect * <input class="organizational-input" type="date" data-f="eff" value="' + today() + '"></label>' +
        '<label>Project purpose <input class="organizational-input" type="text" data-f="purpose"></label>' +
        '<label>Fixed end date (optional) <input class="organizational-input" type="date" data-f="end"></label>' +
        '<label>Days to send each quarterly report <input class="organizational-input" type="number" min="1" data-f="rdays" value="30"></label>' +
        '<label>Days of notice to end <input class="organizational-input" type="number" min="1" data-f="ndays" value="30"></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Generate PDF</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      f('go').addEventListener('click', async () => {
        f('go').disabled = true;
        const data = await post(ctx.slug, base + '/agreements', { template_id: Number(f('tpl').value), effective_date: f('eff').value,
          term_values: { project_purpose: f('purpose').value, term_end: f('end').value, report_days: f('rdays').value, notice_days: f('ndays').value } });
        f('go').disabled = false;
        if (data) done();
      });
    });
    on('[data-a="signed"]', (a) => {
      const box = el.querySelector('[data-box="agreement"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Signed copy * ' + docSelect(docList, 'data-f="doc"', 'Upload it under Documents, then choose it') + '</label>' +
        '<label>Signed on * <input class="organizational-input" type="date" data-f="date" value="' + today() + '"></label>' +
        '<p class="organizational-hint" style="grid-column:1/-1;margin:0;">Once signed, the fee rule is locked and changes become amendments.</p>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        if (await post(ctx.slug, base + '/agreements/' + a.dataset.id + '/signed', { document_id: Number(box.querySelector('[data-f="doc"]').value) || null, signed_at: box.querySelector('[data-f="date"]').value })) done();
      });
    });
    on('[data-a="amend"]', (a) => {
      const box = el.querySelector('[data-box="agreement"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Takes effect * <input class="organizational-input" type="date" data-f="date"></label>' +
        '<label>What it changes * <input class="organizational-input" type="text" data-f="sum"></label>' +
        '<label>Signed amendment * ' + docSelect(docList, 'data-f="doc"', 'Upload it under Documents, then choose it') + '</label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        if (await post(ctx.slug, base + '/agreements/' + a.dataset.id + '/amendments', { effective_date: box.querySelector('[data-f="date"]').value, summary: box.querySelector('[data-f="sum"]').value, document_id: Number(box.querySelector('[data-f="doc"]').value) || null })) done();
      });
    });
    on('[data-a="upload"]', async () => {
      const file = el.querySelector('[data-f="up-file"]').files[0];
      if (!file) { window.alert('Choose a file first.'); return; }
      if (await upload(ctx, file, el.querySelector('[data-f="up-type"]').value, types)) done();
    });
    on('[data-a="version"]', (a) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.addEventListener('change', async () => { if (input.files[0] && await upload(ctx, input.files[0], null, types, a.dataset.id)) done(); });
      input.click();
    });
    on('[data-a="type"]', async (s) => { if (s.value && await post(ctx.slug, base + '/documents/' + s.dataset.id, { sponsor_doc_type: s.value }, 'PATCH')) done(); });
    on('[data-a="received"]', (a) => {
      const box = el.querySelector('[data-box="report"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Report document * ' + docSelect(docList, 'data-f="doc"', 'Upload it under Documents, then choose it') + '</label>' +
        '<label>Received on <input class="organizational-input" type="date" data-f="date" value="' + today() + '"></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Mark received</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        if (await post(ctx.slug, '/sponsor-reports/' + a.dataset.id + '/received', { document_id: Number(box.querySelector('[data-f="doc"]').value) || null, received_at: box.querySelector('[data-f="date"]').value })) done();
      });
    });
    on('[data-a="funder-report"]', () => {
      const box = el.querySelector('[data-box="report"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Title * <input class="organizational-input" type="text" data-f="title"></label>' +
        '<label>Due * <input class="organizational-input" type="date" data-f="due"></label>' +
        '<label>Period from <input class="organizational-input" type="date" data-f="ps"></label><label>to <input class="organizational-input" type="date" data-f="pe"></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Add</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      f('go').addEventListener('click', async () => {
        if (await post(ctx.slug, base + '/reports', { title: f('title').value, due_date: f('due').value, period_start: f('ps').value || null, period_end: f('pe').value || null })) done();
      });
    });
    on('[data-a="ack"]', async (a) => {
      const date = window.prompt('Date the project acknowledged this term (YYYY-MM-DD):', today());
      if (!date) return;
      if (await post(ctx.slug, base + '/acknowledgments', { item_key: a.dataset.key, acknowledged_on: date })) done();
    });
    on('[data-a="reactivate"]', async () => {
      let out = await api(ctx.slug, base + '/reactivate', { method: 'POST', body: '{}' });
      if (out && !out.res.ok && out.data.code === 'not_in_good_standing' && ctx.isAdmin) {
        const reason = window.prompt(out.data.error + '\n\nTo reactivate anyway, enter the reason (required):');
        if (!reason || !reason.trim()) return;
        out = await api(ctx.slug, base + '/reactivate', { method: 'POST', body: JSON.stringify({ reason }) });
      }
      if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'Could not reactivate.'); return; }
      done();
    });
    on('[data-a="ask-approval"]', () => {
      const box = el.querySelector('[data-box="approval"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>What * <select class="organizational-select" data-f="kind">' +
        Object.keys(APPROVAL_KINDS).map((k) => '<option value="' + k + '">' + APPROVAL_KINDS[k] + '</option>').join('') + '</select></label>' +
        '<label>Title * <input class="organizational-input" type="text" data-f="title"></label>' +
        '<label>Draft ' + docSelect(docList, 'data-f="doc"', 'None attached') + '</label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Ask for approval</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      f('go').addEventListener('click', async () => {
        if (await post(ctx.slug, base + '/approvals', { kind: f('kind').value, title: f('title').value, draft_document_id: Number(f('doc').value) || null })) done();
      });
    });
    on('[data-a="decide"]', async (a) => {
      const body = { decision: a.dataset.d };
      if (a.dataset.d === 'decline') {
        const reason = window.prompt('Why is it declined? (required)');
        if (!reason || !reason.trim()) return;
        body.reason = reason;
      }
      if (await post(ctx.slug, '/sponsor-approvals/' + a.dataset.id + '/decide', body)) done();
    });
  }

  async function renderWorkspace(el, ctx) {
    if (!el) return;
    const [apps, cal, appr, tpls] = await Promise.all([
      api(ctx.slug, '/sponsor-applications'), api(ctx.slug, '/sponsor-reports/calendar'),
      api(ctx.slug, '/sponsor-approvals?status=pending'), api(ctx.slug, '/sponsor-agreement-templates'),
    ]);
    const applications = (apps && apps.res.ok && apps.data.applications) || [];
    const reports = ((cal && cal.res.ok && cal.data.reports) || []).filter((r) => !r.received_at && r.status !== 'upcoming');
    const approvals = (appr && appr.res.ok && appr.data.approvals) || [];
    const templates = (tpls && tpls.res.ok && tpls.data.templates) || [];
    const open = applications.filter((a) => a.status === 'submitted' || a.status === 'in_review');
    el.innerHTML =
      '<details class="organizational-collapsible"' + (open.length ? ' open' : '') + '><summary class="organizational-section-heading">Applications' + (open.length ? ' · ' + open.length + ' open' : '') + '</summary><div class="organizational-section-body">' +
        (applications.length ? '<ul class="organizational-sp-fund-list organizational-sp-mo-requests">' + applications.map((a) => '<li><span><strong>' + esc(a.project_name) + '</strong> · ' + esc(a.lead_name || '') +
          (a.budget_cents != null ? ' · budget ' + money(a.budget_cents) : '') + ' · ' + esc(a.status) + (a.decision_reason ? ' <span class="organizational-hint">' + esc(a.decision_reason) + '</span>' : '') + '</span>' +
          (ctx.canStaff && (a.status === 'submitted' || a.status === 'in_review') ? '<span class="organizational-sp-mo-actions"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="accept" data-id="' + a.id + '">Accept</button>' +
            '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="decline" data-id="' + a.id + '">Decline</button></span>' : '') +
          (a.mission ? '<span class="organizational-hint" style="flex-basis:100%;">' + esc(a.mission) + '</span>' : '') + '</li>').join('') + '</ul>' : '<p class="organizational-hint">No applications yet.</p>') +
        (ctx.canStaff ? '<p class="organizational-sp-rec-line"><a href="#" data-a="new-app">Enter an application</a></p><div data-box="app" hidden></div>' : '') +
      '</div></details>' +
      '<details class="organizational-collapsible"' + (reports.length ? ' open' : '') + '><summary class="organizational-section-heading">Reports due' + (reports.length ? ' · ' + reports.length : '') + '</summary><div class="organizational-section-body">' +
        (reports.length ? '<ul class="organizational-sp-fund-list">' + reports.map((r) => '<li>' + esc(r.due_date) + ' · ' + esc(r.source === 'grant' ? r.title : (r.project_name + ': ' + (r.kind === 'funder' ? r.title : 'quarterly report'))) +
          ' · <span class="organizational-sp-rec-' + r.status + '">' + esc(STATUS[r.status] || r.status) + '</span></li>').join('') + '</ul>' : '<p class="organizational-hint">Nothing due in the next 30 days.</p>') +
      '</div></details>' +
      '<details class="organizational-collapsible"' + (approvals.length ? ' open' : '') + '><summary class="organizational-section-heading">Waiting for approval' + (approvals.length ? ' · ' + approvals.length : '') + '</summary><div class="organizational-section-body">' +
        (approvals.length ? '<ul class="organizational-sp-fund-list">' + approvals.map((a) => '<li>' + esc(a.project_name) + ' · ' + esc(APPROVAL_KINDS[a.kind] || a.kind) + ': ' + esc(a.title) + '</li>').join('') + '</ul>' : '<p class="organizational-hint">Nothing waiting.</p>') +
        '<p class="organizational-hint">Approve or decline from the project.</p>' +
      '</div></details>' +
      '<details class="organizational-collapsible"><summary class="organizational-section-heading">Agreement templates</summary><div class="organizational-section-body">' +
        '<ul class="organizational-sp-fund-list">' + templates.map((t) => '<li>' + esc(t.title) + (t.is_default ? ' <span class="organizational-hint">shared default</span>' : '') +
          (ctx.canStaff ? ' · <a href="#" data-a="tpl-copy" data-id="' + t.id + '">' + (t.is_default ? 'Copy and edit' : 'Edit') + '</a>' : '') + '</li>').join('') + '</ul>' +
        '<p class="organizational-hint">Merge fields: ' + esc(((tpls && tpls.data && tpls.data.merge_fields) || []).map((m) => '{{' + m + '}}').join(' ')) + '</p>' +
        '<div data-box="tpl" hidden></div>' +
      '</div></details>';

    const done = () => renderWorkspace(el, ctx);
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((x) => x.addEventListener('click', (e) => { e.preventDefault(); fn(x); }));
    on('[data-a="decline"]', async (b) => {
      const reason = window.prompt('Why is the application declined? (required)');
      if (!reason || !reason.trim()) return;
      if (await post(ctx.slug, '/sponsor-applications/' + b.dataset.id + '/decide', { decision: 'decline', reason })) done();
    });
    on('[data-a="accept"]', (b) => {
      const box = el.querySelector('[data-box="app"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Program for the project fund <select class="organizational-select" data-f="prog"><option value="">Choose later</option>' +
        (ctx.programs || []).map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
        '<label>Model <select class="organizational-select" data-f="model"><option value="">Workspace default</option><option value="model_a">Comprehensive</option><option value="model_c">Pre-approved grant</option></select></label>' +
        '<label>Reason * <input class="organizational-input" type="text" data-f="reason" placeholder="for example, board decision and date"></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Accept and create the project</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      f('go').addEventListener('click', async () => {
        if (await post(ctx.slug, '/sponsor-applications/' + b.dataset.id + '/decide', { decision: 'accept', reason: f('reason').value, program_id: f('prog').value || null, sponsorship_model: f('model').value || null })) {
          done();
          if (ctx.onProjectsChanged) ctx.onProjectsChanged();
        }
      });
    });
    on('[data-a="new-app"]', async () => {
      const box = el.querySelector('[data-box="app"]');
      box.hidden = false;
      const names = await api(ctx.slug, '/constituents/names?active=true', { method: 'GET', skip403Redirect: true });
      const contacts = (names && names.res.ok && Array.isArray(names.data)) ? names.data : [];
      box.innerHTML = '<div class="organizational-sp-fund-form">' +
        '<label>Project name * <input class="organizational-input" type="text" data-f="name"></label>' +
        '<label>Project lead * <span data-f="lead"></span></label>' +
        '<label>Applying organization <span data-f="applicant"></span></label>' +
        '<label>Yearly budget <input class="organizational-input" type="number" min="0" step="0.01" data-f="budget"></label>' +
        ['mission', 'activities', 'leaders', 'expected_funders', 'risks'].map((k) => '<label>' + esc(k.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())) +
          ' <textarea class="organizational-input" rows="2" data-f="' + k + '"></textarea></label>').join('') +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save application</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      if (window.OrganizationalContactPicker) {
        window.OrganizationalContactPicker.mount(f('lead'), { getCache: () => contacts, role: null, label: 'contact', slug: ctx.slug, valueElementId: 'sp-app-lead' });
        window.OrganizationalContactPicker.mount(f('applicant'), { getCache: () => contacts, role: null, label: 'contact', slug: ctx.slug, valueElementId: 'sp-app-applicant' });
      }
      f('go').addEventListener('click', async () => {
        const body = { project_name: f('name').value, lead_constituent_id: Number(document.getElementById('sp-app-lead').value) || null,
          applicant_constituent_id: Number(document.getElementById('sp-app-applicant').value) || null,
          budget_cents: f('budget').value ? Math.round(Number(f('budget').value) * 100) : null };
        ['mission', 'activities', 'leaders', 'expected_funders', 'risks'].forEach((k) => { body[k] = f(k).value; });
        if (await post(ctx.slug, '/sponsor-applications', body)) done();
      });
    });
    on('[data-a="tpl-copy"]', (a) => {
      const t = templates.find((x) => String(x.id) === a.dataset.id);
      const box = el.querySelector('[data-box="tpl"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label style="grid-column:1/-1;">Title * <input class="organizational-input" type="text" data-f="title" value="' + esc(t.is_default ? t.title + ' (this workspace)' : t.title) + '"></label>' +
        '<label style="grid-column:1/-1;">Text * <textarea class="organizational-input" rows="16" data-f="body">' + esc(t.body) + '</textarea></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save template</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        const body = { title: box.querySelector('[data-f="title"]').value, body: box.querySelector('[data-f="body"]').value, model: t.model };
        const ok = t.is_default ? await post(ctx.slug, '/sponsor-agreement-templates', body) : await post(ctx.slug, '/sponsor-agreement-templates/' + t.id, body, 'PUT');
        if (ok) done();
      });
    });
  }

  window.OrganizationalSponsorRecords = { renderProject, renderWorkspace };
})();
