/* sponsor-records.js — a sponsored project's records (agreement and amendments, documents by type, reports, good standing and
   acknowledgments, approvals) and the workspace-wide lists (applications, approvals queue, reports calendar, agreement templates).
   OrganizationalSponsorRecords.renderProject(el, { slug, projectId, canStaff, canEnter, isAdmin, onChange })
   OrganizationalSponsorRecords.renderWorkspace(el, { slug, canStaff, programs, parts, projectHref, openPanel, closePanel }) */
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
    const [ag, docs, reps, st, apprs, tpls, stm, dl, prop] = await Promise.all([
      api(ctx.slug, base + '/agreements'), api(ctx.slug, base + '/documents'), api(ctx.slug, base + '/reports'),
      api(ctx.slug, base + '/standing'), api(ctx.slug, '/sponsor-approvals'), api(ctx.slug, '/sponsor-agreement-templates'),
      api(ctx.slug, base + '/statements'), api(ctx.slug, base + '/donor-letters'), api(ctx.slug, base + '/property'),
    ]);
    const [lk, proj] = ctx.canStaff ? await Promise.all([api(ctx.slug, base + '/lead-links'), api(ctx.slug, '/sponsored-projects')]) : [null, null];
    const links = (lk && lk.res.ok && lk.data.links) || [];
    const me = ((proj && proj.res.ok && proj.data.sponsored_projects) || []).find((x) => Number(x.id) === Number(ctx.projectId)) || {};
    const statements = (stm && stm.res.ok && stm.data.statements) || [];
    const letters = (dl && dl.res.ok && dl.data.gifts) || [];
    const property = (prop && prop.res.ok && prop.data.items) || [];
    const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
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

    const parts = ctx.parts || ['agreement', 'documents', 'reports', 'standing', 'statements', 'letters', 'property', 'links', 'public', 'approvals'];
    const show = (k) => parts.indexOf(k) !== -1;
    const day = (d) => window.OrganizationalSponsorFund.day(d);
    const chip = (tone, text) => '<span class="organizational-sp-chip' + (tone ? ' organizational-sp-chip-' + tone : '') + '">' + esc(text) + '</span>';
    const head = (t) => '<h3 class="organizational-sp-head">' + esc(t) + '</h3>';
    const line = (html) => '<p class="organizational-sp-rec-line">' + html + '</p>';
    const none = (t) => '<p class="organizational-hint organizational-sp-rec-line">' + esc(t) + '</p>';
    const table = (cols, rows) => '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr>' +
      cols.map((c) => '<th' + (c.num ? ' class="organizational-sp-num"' : '') + '>' + esc(c.label != null ? c.label : c) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div></section>';
    const cell = (text) => '<td class="organizational-sp-name" title="' + esc(text) + '">' + esc(text) + '</td>';
    const td = (html) => '<td>' + html + '</td>';
    const REPORT_TONE = { overdue: 'danger', due_soon: 'warn', upcoming: '', received: 'good' };
    const SEND = { sent: ['good', 'Emailed'], failed: ['danger', 'Email failed'], skipped: ['warn', 'No lead email'], not_sent: ['', 'Not emailed'], pending: ['warn', 'Waiting'] };
    const APPROVAL_TONE = { pending: 'warn', approved: 'good', declined: 'danger' };
    const linkState = (l) => (l.revoked_at ? chip('', 'Turned off') : new Date(l.expires_at) < new Date() ? chip('', 'Expired') : chip('good', 'Works until ' + day(l.expires_at)));

    el.innerHTML =
      // Agreement
      (!show('agreement') ? '' : head('Agreement') +
        (signed ? line('Signed ' + esc(day(signed.signed_at)) + ' · effective ' + esc(day(signed.effective_date)) + ' · ' + docLink(ctx.slug, signed.signed_document_id, 'signed copy')) +
            (amendments.length ? table(['Takes effect', 'What it changes', 'Document'], amendments.map((m) => '<tr>' + td(esc(day(m.effective_date))) + cell(m.summary) + td(docLink(ctx.slug, m.document_id, 'Open')) + '</tr>')) : '') +
            (ctx.canStaff ? line('<a href="#" data-a="amend" data-id="' + signed.id + '">Record an amendment</a>') : '')
          : line(chip('danger', 'No signed agreement')) +
            (draft ? line('Draft generated ' + esc(day(draft.created_at)) + ' · ' + docLink(ctx.slug, draft.generated_document_id, 'open the draft') +
              (ctx.canStaff ? ' · <a href="#" data-a="signed" data-id="' + draft.id + '">Record the signed copy</a>' : '')) : '') +
            (ctx.canStaff ? line('<a href="#" data-a="generate">' + (draft ? 'Generate again' : 'Generate the agreement') + '</a>') : '')) +
        '<div data-box="agreement" hidden></div>') +
      // Documents
      (!show('documents') ? '' : head('Documents') +
        (docList.length ? table(['Type', 'Title', 'Version', 'Added', ''], docList.slice().sort((a, b) => typeLabel(a.sponsor_doc_type).localeCompare(typeLabel(b.sponsor_doc_type))).map((d) => '<tr>' +
            td(d.sponsor_doc_type ? esc(typeLabel(d.sponsor_doc_type)) : (ctx.canEnter ? '<select class="organizational-select organizational-sp-rec-type" data-a="type" data-id="' + d.id + '"><option value="">Set type</option>' +
              types.map((t) => '<option value="' + t.key + '">' + esc(t.label) + '</option>').join('') + '</select>' : 'No type')) +
            '<td class="organizational-sp-name" title="' + esc(d.title) + '">' + docLink(ctx.slug, d.id, d.title) + '</td>' +
            td(d.version > 1 ? 'v' + d.version + (d.is_current ? '' : ', older') : '') + td(esc(day(d.created_at))) +
            td(ctx.canEnter && d.is_current ? '<a href="#" data-a="version" data-id="' + d.id + '">New version</a>' : '') + '</tr>'))
          : none('No documents yet.')) +
        (ctx.canEnter ? '<p class="organizational-sp-rec-line organizational-sp-upload"><select class="organizational-select organizational-sp-rec-type" data-f="up-type" aria-label="Document type">' + types.map((t) => '<option value="' + t.key + '">' + esc(t.label) + '</option>').join('') +
          '</select> <input type="file" data-f="up-file" aria-label="File"> <button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="upload">Upload</button></p>' : '')) +
      // Reports
      (!show('reports') ? '' : head('Reports') +
        (reports.length ? table(['Report', 'Due', 'Status', 'Document', ''], reports.slice().reverse().slice(0, 12).map((r) => '<tr>' +
            cell(r.kind === 'funder' ? (r.title || 'Funder report') + (r.funder_name ? ' (' + r.funder_name + ')' : '') : 'Quarter ' + day(r.period_start) + ' to ' + day(r.period_end)) +
            td(esc(day(r.due_date))) + td(chip(REPORT_TONE[r.status], (STATUS[r.status] || r.status) + (r.received_at ? ' ' + day(r.received_at) : ''))) +
            td(r.document_id ? docLink(ctx.slug, r.document_id, 'Open') : '') +
            td(ctx.canStaff && !r.received_at ? '<a href="#" data-a="received" data-id="' + r.id + '">Mark received</a>' : '') + '</tr>'))
          : none('Quarterly reports appear here once the project is active.')) +
        (ctx.canStaff ? line('<a href="#" data-a="funder-report">Add a report owed to a funder</a>') : '') +
        '<div data-box="report" hidden></div>') +
      // Standing
      (!show('standing') ? '' : (standing ? line(standing.good ? chip('good', 'In good standing') : chip('warn', 'Not in good standing')) +
          (standing.status === 'lapsed' && ctx.canStaff ? line('<a href="#" data-a="reactivate">Reactivate</a>') : '') +
          table(['Condition', 'Met', 'Detail'], standing.items.map((i) => '<tr>' + td(esc(i.label)) + td(i.ok ? chip('good', 'Yes') : chip('danger', 'No')) + cell(String(i.detail || '').replace(/\d{4}-\d{2}-\d{2}/g, (m) => day(m))) + '</tr>')) +
          line('<a href="#" data-a="ack-toggle">Standing terms acknowledged</a>') +
          '<div data-box="acks" hidden>' + table(['Term', 'Acknowledged', ''], standing.acknowledgments.map((a) => '<tr>' + cell(a.label) + td(a.acknowledged_on ? esc(day(a.acknowledged_on)) : chip('', 'Not yet')) +
            td(ctx.canStaff ? '<a href="#" data-a="ack" data-key="' + a.key + '">Record</a>' : '') + '</tr>')) + '</div>' : '')) +
      // Statements
      (!show('statements') ? '' : head('Monthly statements') +
        (statements.length ? table(['Month', { label: 'Closing balance', num: true }, 'Statement', 'Email', ''], statements.slice(0, 6).map((m) => {
            const st = SEND[m.send_status] || ['', m.send_status];
            return '<tr>' + td(esc(new Date(String(m.month).slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }))) + '<td class="organizational-sp-num">' + money(m.closing_cents) + '</td>' +
              td(docLink(ctx.slug, m.generated_document_id, 'PDF')) + '<td title="' + esc(m.sent_to || '') + '">' + chip(st[0], st[1]) + '</td>' +
              td(ctx.canStaff && (m.send_status === 'failed' || m.send_status === 'not_sent') ? '<a href="#" data-a="stmt" data-month="' + esc(String(m.month).slice(0, 7)) + '" data-send="1">Email it</a>' : '') + '</tr>';
          }))
          : none('Statements are made on the statement day each month.')) +
        (ctx.canStaff ? line('Make a statement for <input type="month" class="organizational-input organizational-sp-rec-month" data-f="stmt-month" value="' + lastMonth + '" aria-label="Month"> ' +
          '<a href="#" data-a="stmt" data-send="0">Make PDF</a> · <a href="#" data-a="stmt" data-send="1">Make and email</a>') : '')) +
      // Donor letters
      (!show('letters') ? '' : (letters.length ? head('Donor letters') + table(['Received', 'Donor', { label: 'Amount', num: true }, 'Letter', ''], letters.map((g) => '<tr>' + td(esc(day(g.received_at))) + cell(g.donor_name || 'Donor') +
          '<td class="organizational-sp-num">' + money(g.amount_cents) + '</td>' +
          td(g.missing ? chip('danger', 'Missing') + ' <a href="/api/organizational/orgs/' + encodeURIComponent(ctx.slug) + '/sponsored-projects/' + ctx.projectId + '/gifts/' + g.id + '/donor-letter-template">Template</a>' : docLink(ctx.slug, g.donor_letter_document_id, 'Signed letter')) +
          td(g.missing && ctx.canStaff ? '<a href="#" data-a="letter" data-id="' + g.id + '">Attach signed letter</a>' : '') + '</tr>')) : '') +
        (show('property') ? '' : '<div data-box="gift" hidden></div>')) +
      // Donated property
      (!show('property') ? '' : (property.length ? head('Donated property') + table(['Received', 'Item', { label: 'Value', num: true }, 'Status'], property.map((g) => '<tr>' + td(esc(day(g.received_at))) + cell(g.in_kind_description || 'Donated item') +
          '<td class="organizational-sp-num">' + money(g.amount_cents) + '</td>' +
          td(g.release_id ? chip(g.release_posted ? 'good' : 'warn', 'Released, ' + (g.release_posted ? 'posted' : g.release_status))
            : g.held_as === 'asset' && g.posting_status === 'posted' && ctx.canStaff ? '<a href="#" data-a="release" data-id="' + g.id + '">Release to the project at value</a>'
              : chip('', g.posting_status !== 'posted' ? 'Waiting for Accounting' : 'Booked as an expense')) + '</tr>')) : '') +
        '<div data-box="gift" hidden></div>') +
      // Lead link
      (!show('links') ? '' : (ctx.canStaff ? head('Project lead link') +
        none('The lead opens the project\'s balance and activity, asks for payments, and sends reports and documents. No sign-in; keep links private.') +
        (links.length ? table(['Link', 'Made', 'State', { label: 'Uses', num: true }, ''], links.map((l) => '<tr>' + cell(l.label || 'Link') + td(esc(day(l.created_at))) + td(linkState(l)) +
          '<td class="organizational-sp-num">' + l.uses + '</td>' + td(l.revoked_at || new Date(l.expires_at) < new Date() ? '' : '<a href="#" data-a="revoke" data-id="' + l.id + '">Turn off</a>') + '</tr>')) : '') +
        line('<a href="#" data-a="link" data-send="1">Make a link and email it to the lead</a> · <a href="#" data-a="link" data-send="0">Make a link to copy</a>') +
        '<div data-box="link" hidden></div>' : '')) +
      // Public page
      (!show('public') ? '' : (ctx.canStaff ? head('Public page') +
        line('<label class="organizational-sp-inline-check"><input type="checkbox" data-f="pub-on"' + (me.public_page_enabled ? ' checked' : '') + '> Show a public page for this project</label>' +
          (me.public_page_enabled ? ' · <a href="/p/' + encodeURIComponent(ctx.slug) + '/projects/' + ctx.projectId + '" target="_blank" rel="noopener">Open it</a>' : '')) +
        '<label class="organizational-label organizational-sp-public-summary">What the public page says about the project<textarea class="organizational-input" rows="3" data-f="pub-summary">' + esc(me.public_summary || '') + '</textarea></label>' +
        '<div class="organizational-sp-settings-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-a="pub-save">Save</button></div>' : '')) +
      // Approvals
      (!show('approvals') ? '' : head('Items using the sponsor\'s name') +
        (approvals.length ? table(['What', 'Title', 'Status', 'Draft', ''], approvals.map((a) => '<tr>' + td(esc(APPROVAL_KINDS[a.kind] || a.kind)) + cell(a.title) +
            '<td title="' + esc(a.decision_reason || '') + '">' + chip(APPROVAL_TONE[a.status], a.status.charAt(0).toUpperCase() + a.status.slice(1)) + '</td>' +
            td(a.draft_document_id ? docLink(ctx.slug, a.draft_document_id, 'Open') : '') +
            td(ctx.canStaff && a.status === 'pending' ? '<a href="#" data-a="decide" data-id="' + a.id + '" data-d="approve">Approve</a> · <a href="#" data-a="decide" data-id="' + a.id + '" data-d="decline">Decline</a>' : '') + '</tr>'))
          : none('Nothing waiting for approval.')) +
        (ctx.canEnter ? line('<a href="#" data-a="ask-approval">Ask for approval</a>') : '') +
        '<div data-box="approval" hidden></div>');

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
    on('[data-a="ack-toggle"]', () => { const b = el.querySelector('[data-box="acks"]'); b.hidden = !b.hidden; });
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
    on('[data-a="link"]', async (a) => {
      const data = await post(ctx.slug, base + '/lead-links', { send: a.dataset.send === '1' });
      if (!data) return;
      const box = el.querySelector('[data-box="link"]');
      box.hidden = false;
      box.innerHTML = '<p class="organizational-sp-rec-line">' + (data.emailed ? 'Emailed to the lead. ' : '') + 'This link is shown only now. Copy it if you need it:</p>' +
        '<p class="organizational-sp-rec-line"><input class="organizational-input" readonly value="' + esc(data.url) + '" data-f="link-url"></p>';
      box.querySelector('[data-f="link-url"]').select();
    });
    on('[data-a="revoke"]', async (a) => {
      const reason = window.prompt('Why is this link being turned off? (optional)');
      if (reason === null) return;
      if (await post(ctx.slug, base + '/lead-links/' + a.dataset.id + '/revoke', { reason })) done();
    });
    on('[data-a="pub-save"]', async () => {
      if (await post(ctx.slug, '/sponsored-projects/' + ctx.projectId, { public_page_enabled: el.querySelector('[data-f="pub-on"]').checked, public_summary: el.querySelector('[data-f="pub-summary"]').value }, 'PATCH')) done();
    });
    on('[data-a="stmt"]', async (a) => {
      const month = a.dataset.month || el.querySelector('[data-f="stmt-month"]').value;
      const data = await post(ctx.slug, base + '/statements', { month, send: a.dataset.send === '1' });
      if (data) { if (data.created === false && a.dataset.send !== '1') window.alert('The statement for ' + month + ' already exists.'); done(); }
    });
    on('[data-a="letter"]', (a) => {
      const box = el.querySelector('[data-box="gift"]');
      box.hidden = false;
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Signed letter * ' + docSelect(docList, 'data-f="doc"', 'Upload it under Documents, then choose it') + '</label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Attach</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        if (await post(ctx.slug, base + '/gifts/' + a.dataset.id + '/donor-letter', { document_id: Number(box.querySelector('[data-f="doc"]').value) || null })) done();
      });
    });
    on('[data-a="release"]', async (a) => {
      if (!window.confirm('Release this donated item to the project as a grant at its recorded value? It then needs approval, and Accounting posts it.')) return;
      if (await post(ctx.slug, base + '/property-releases', { gift_id: Number(a.dataset.id), release_date: today() })) done();
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
    const reports = ((cal && cal.res.ok && cal.data.reports) || []).filter((r) => !r.received_at);
    const approvals = (appr && appr.res.ok && appr.data.approvals) || [];
    const templates = (tpls && tpls.res.ok && tpls.data.templates) || [];
    const parts = ctx.parts || ['applications', 'approvals', 'calendar', 'year-end', 'information-returns', 'templates'];
    const show = (k) => parts.indexOf(k) !== -1;
    const day = (d) => window.OrganizationalSponsorFund.day(d);
    const REPORT_TONE = { overdue: 'danger', due_soon: 'warn', upcoming: '', received: 'good' };
    const projectLink = (id, name, view) => (ctx.projectHref && id ? '<a href="' + esc(ctx.projectHref(id, view)) + '">' + esc(name) + '</a>' : esc(name));
    const section = (title, body) => '<h2 class="organizational-subheading">' + esc(title) + '</h2><section class="organizational-card organizational-card-flush">' + body + '</section>';
    const table = (head, rows, empty) => rows.length
      ? '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr>' + head.map((x) => '<th' + (x.num ? ' class="organizational-sp-num"' : '') + '>' + esc(x.label || x) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
      : '<p class="organizational-empty organizational-sp-card-foot">' + esc(empty) + '</p>';
    el.innerHTML =
      (!show('applications') ? '' : section('Applications',
        table(['Project', 'Lead', { label: 'Yearly budget', num: true }, 'Status', ''], applications.map((a) => '<tr><td title="' + esc(a.mission || '') + '">' + esc(a.project_name) + '</td><td>' + esc(a.lead_name || '') + '</td>' +
          '<td class="organizational-sp-num">' + (a.budget_cents != null ? money(a.budget_cents) : '') + '</td><td>' + esc(String(a.status || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())) + (a.decision_reason ? ' <span class="organizational-hint">' + esc(a.decision_reason) + '</span>' : '') + '</td><td>' +
          (ctx.canStaff && (a.status === 'submitted' || a.status === 'in_review') ? '<span class="organizational-sp-mo-actions"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="accept" data-id="' + a.id + '">Accept</button>' +
            '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="decline" data-id="' + a.id + '">Decline</button></span>' : '') + '</td></tr>'), 'No applications yet.') +
        (ctx.canStaff ? '<p class="organizational-sp-rec-line organizational-sp-card-foot"><a href="#" data-a="new-app">Enter an application</a></p>' : '') + '<div data-box="app" hidden></div>')) +
      (!show('approvals') ? '' : section('Waiting for approval',
        table(['Project', 'What', 'Title', 'Asked'], approvals.map((a) => '<tr><td>' + projectLink(a.sponsored_project_id, a.project_name, 'agreement') + '</td><td>' + esc(APPROVAL_KINDS[a.kind] || a.kind) + '</td><td>' + esc(a.title) + '</td><td>' + esc(day(a.requested_at)) + '</td></tr>'), 'Nothing waiting.') +
        '<p class="organizational-hint organizational-sp-card-foot">Approve or decline from the project, under Agreement and documents.</p>')) +
      (!show('calendar') ? '' : section('Reports due',
        table(['Due', 'Project', 'Report', 'Status'], reports.map((r) => '<tr><td>' + esc(day(r.due_date)) + '</td><td>' + (r.source === 'grant' ? '' : projectLink(r.sponsored_project_id, r.project_name, 'reports')) + '</td><td>' +
          esc(r.source === 'grant' ? r.title : (r.kind === 'funder' ? r.title : 'Quarterly report')) + '</td><td><span class="organizational-sp-chip' + (REPORT_TONE[r.status] ? ' organizational-sp-chip-' + REPORT_TONE[r.status] : '') + '">' + esc(STATUS[r.status] || r.status) + '</span></td></tr>'), 'No reports outstanding.'))) +
      (!show('year-end') ? '' : section('Year-end sheet',
        '<p class="organizational-sp-rec-line organizational-sp-card-foot">Fiscal year <input type="number" class="organizational-input organizational-sp-rec-month" data-f="fy" value="' + (new Date().getFullYear() - 1) + '"> ' +
        '<a href="#" data-a="year-end">Show</a> · <a href="#" data-a="year-end-csv">Download CSV</a></p><div data-box="year-end"></div>')) +
      (!show('information-returns') ? '' : section('Grant releases by entity',
        '<p class="organizational-sp-rec-line organizational-sp-card-foot">Calendar year <input type="number" class="organizational-input organizational-sp-rec-month" data-f="iry" value="' + (new Date().getFullYear() - 1) + '"> ' +
        '<a href="#" data-a="ir">Show</a> · <a href="#" data-a="ir-csv">Download CSV</a></p><div data-box="ir"></div>' +
        '<p class="organizational-hint organizational-sp-card-foot">Check the information-return threshold against the IRS instructions each year (Sponsorship settings).</p>')) +
      (!show('templates') ? '' : section('Agreement templates',
        table(['Template', 'Kind', ''], templates.map((t) => '<tr><td>' + esc(t.title) + '</td><td>' + (t.is_default ? 'Shared default' : 'This workspace') + '</td><td>' +
          (ctx.canStaff ? '<a href="#" data-a="tpl-copy" data-id="' + t.id + '">' + (t.is_default ? 'Copy and edit' : 'Edit') + '</a>' : '') + '</td></tr>'), 'No templates.') +
        '<p class="organizational-hint organizational-sp-card-foot">Merge fields: ' + esc(((tpls && tpls.data && tpls.data.merge_fields) || []).map((m) => '{{' + m + '}}').join(' ')) + '</p>' +
        '<div data-box="tpl" hidden></div>'));

    const done = () => renderWorkspace(el, ctx);
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((x) => x.addEventListener('click', (e) => { e.preventDefault(); fn(x); }));
    on('[data-a="decline"]', async (b) => {
      const reason = window.prompt('Why is the application declined? (required)');
      if (!reason || !reason.trim()) return;
      if (await post(ctx.slug, '/sponsor-applications/' + b.dataset.id + '/decide', { decision: 'decline', reason })) done();
    });
    const formBox = (key, title) => {
      if (ctx.openPanel) return ctx.openPanel(title);
      const box = el.querySelector('[data-box="' + key + '"]');
      box.hidden = false;
      return box;
    };
    const closeForm = () => { if (ctx.closePanel) ctx.closePanel(); };
    on('[data-a="accept"]', (b) => {
      const box = formBox('app', 'Accept the application');
      box.innerHTML = '<div class="organizational-sp-fund-form"><label>Program for the project fund <select class="organizational-select" data-f="prog"><option value="">Choose later</option>' +
        (ctx.programs || []).map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
        '<label>Model <select class="organizational-select" data-f="model"><option value="">Workspace default</option><option value="model_a">Comprehensive</option><option value="model_c">Pre-approved grant</option></select></label>' +
        '<label>Reason * <input class="organizational-input" type="text" data-f="reason" placeholder="for example, board decision and date"></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Accept and create the project</button></div></div>';
      const f = (n) => box.querySelector('[data-f="' + n + '"]');
      f('go').addEventListener('click', async () => {
        if (await post(ctx.slug, '/sponsor-applications/' + b.dataset.id + '/decide', { decision: 'accept', reason: f('reason').value, program_id: f('prog').value || null, sponsorship_model: f('model').value || null })) {
          closeForm();
          done();
          if (ctx.onProjectsChanged) ctx.onProjectsChanged();
        }
      });
    });
    on('[data-a="new-app"]', async () => {
      const box = formBox('app', 'Enter an application');
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
        if (await post(ctx.slug, '/sponsor-applications', body)) { closeForm(); done(); }
      });
    });
    on('[data-a="year-end-csv"]', () => {
      window.location.href = '/api/organizational/orgs/' + encodeURIComponent(ctx.slug) + '/sponsor-reports/year-end?format=csv&fiscal_year=' + encodeURIComponent(el.querySelector('[data-f="fy"]').value);
    });
    on('[data-a="year-end"]', async () => {
      const box = el.querySelector('[data-box="year-end"]');
      const out = await api(ctx.slug, '/sponsor-reports/year-end?fiscal_year=' + encodeURIComponent(el.querySelector('[data-f="fy"]').value));
      if (!out || !out.res.ok) { box.textContent = (out && out.data && out.data.error) || 'Could not load the sheet.'; return; }
      const rows = out.data.rows || [];
      const n = (x) => '<th class="organizational-sp-num">' + x + '</th>';
      box.innerHTML = '<p class="organizational-hint organizational-sp-card-foot">' + esc(day(out.data.start_date) + ' to ' + day(out.data.end_date)) + '. The last column compares each project with its program in the books.</p>' +
        (rows.length ? '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Project</th>' + ['Opening', 'Received', 'Noncash', 'Fee', 'Spent', 'Closing', 'Difference'].map(n).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr><td class="organizational-sp-name" title="' + esc(r.project_name) + '">' + esc(r.project_name) + '</td>' + ['opening_cents', 'income_cents', 'noncash_cents', 'fees_cents', 'expenses_cents', 'closing_cents'].map((k) => '<td class="organizational-sp-num">' + money(r[k]) + '</td>').join('') +
          '<td class="organizational-sp-num">' + (r.difference_cents == null ? 'No program' : money(r.difference_cents)) + '</td></tr>').join('') + '</tbody></table></div>'
          : '<p class="organizational-hint organizational-sp-card-foot">No projects in that year.</p>');
    });
    on('[data-a="ir-csv"]', () => {
      window.location.href = '/api/organizational/orgs/' + encodeURIComponent(ctx.slug) + '/sponsor-reports/information-returns?format=csv&year=' + encodeURIComponent(el.querySelector('[data-f="iry"]').value);
    });
    on('[data-a="ir"]', async () => {
      const box = el.querySelector('[data-box="ir"]');
      const out = await api(ctx.slug, '/sponsor-reports/information-returns?year=' + encodeURIComponent(el.querySelector('[data-f="iry"]').value));
      if (!out || !out.res.ok) { box.textContent = (out && out.data && out.data.error) || 'Could not load the sheet.'; return; }
      const rows = out.data.rows || [];
      box.innerHTML = rows.length ? '<p class="organizational-hint organizational-sp-card-foot">Threshold: ' + (out.data.threshold_cents == null ? 'not set for this year' : money(out.data.threshold_cents)) + '</p>' +
        '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Receiving entity</th><th>Projects</th><th class="organizational-sp-num">Cash</th><th class="organizational-sp-num">Property</th><th class="organizational-sp-num">Total</th><th>Information return</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td class="organizational-sp-name" title="' + esc(r.entity_name) + '">' + esc(r.entity_name) + '</td><td class="organizational-sp-name" title="' + esc(r.projects.join(', ')) + '">' + esc(r.projects.join(', ')) + '</td><td class="organizational-sp-num">' + money(r.cash_cents) + '</td><td class="organizational-sp-num">' + money(r.property_cents) + '</td><td class="organizational-sp-num">' + money(r.total_cents) + '</td><td>' +
          (r.needs_information_return ? '<span class="organizational-sp-chip organizational-sp-chip-danger">Needed</span>' : 'Not needed') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="organizational-hint organizational-sp-card-foot">No grant releases posted in that year.</p>';
    });
    on('[data-a="tpl-copy"]', (a) => {
      const t = templates.find((x) => String(x.id) === a.dataset.id);
      const box = formBox('tpl', t.is_default ? 'Copy the template' : 'Edit the template');
      box.innerHTML = '<div class="organizational-sp-fund-form"><label style="grid-column:1/-1;">Title * <input class="organizational-input" type="text" data-f="title" value="' + esc(t.is_default ? t.title + ' (this workspace)' : t.title) + '"></label>' +
        '<label style="grid-column:1/-1;">Text * <textarea class="organizational-input" rows="16" data-f="body">' + esc(t.body) + '</textarea></label>' +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save template</button></div></div>';
      box.querySelector('[data-f="go"]').addEventListener('click', async () => {
        const body = { title: box.querySelector('[data-f="title"]').value, body: box.querySelector('[data-f="body"]').value, model: t.model };
        const ok = t.is_default ? await post(ctx.slug, '/sponsor-agreement-templates', body) : await post(ctx.slug, '/sponsor-agreement-templates/' + t.id, body, 'PUT');
        if (ok) { closeForm(); done(); }
      });
    });
  }

  window.OrganizationalSponsorRecords = { renderProject, renderWorkspace };
})();
