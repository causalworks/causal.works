/* sponsor-money-out.js — money out on a sponsored project: hold and lift, payment requests and their review,
   recalls, and the list of balance overrides. Server rules decide every refusal; this screen shows the message.
   OrganizationalSponsorMoneyOut.render(el, { slug, projectId, canMoney, canEnter, isAdmin, onChange }) */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const money = (c) => window.formatMoneyCents(Number(c) || 0);
  const toCents = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100));
  const STATUS_LABELS = { submitted: 'Submitted', in_review: 'In review', needs_info: 'Needs information', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };
  const METHOD_LABELS = { check: 'Check', bank_transfer: 'Bank transfer', wire: 'Wire', card: 'Card', other: 'Other' };

  function api(slug, path, opts) {
    return apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + path, opts || { method: 'GET' });
  }

  // Sends a money action; when the server refuses for balance and the person is an admin, offers the override.
  async function chooseProjectDocument(ctx, message) {
    const docs = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/documents');
    const list = ((docs && docs.res.ok && docs.data.documents) || []).filter((d) => d.is_current);
    if (!list.length) { window.alert(message + '\n\nUpload it under the project\'s Documents first.'); return null; }
    const pick = window.prompt(message + '\n\nType the number of the document:\n' + list.map((d, i) => (i + 1) + '. ' + d.title).join('\n'));
    const n = Number(pick);
    return Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1].id : null;
  }

  async function sendWithOverride(ctx, path, body) {
    let out = await api(ctx.slug, path, { method: 'POST', body: JSON.stringify(body) });
    if (out && !out.res.ok && out.data && out.data.code === 'grant_agreement_missing') {
      const docId = await chooseProjectDocument(ctx, out.data.error);
      if (!docId) return null;
      const m = path.match(/\/disbursements\/(\d+)\/approve$/);
      if (m) {
        const att = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/disbursements/' + m[1] + '/grant-agreement', { method: 'POST', body: JSON.stringify({ document_id: docId }) });
        if (!att || !att.res.ok) { window.alert((att && att.data && att.data.error) || 'Could not attach the grant agreement.'); return null; }
      } else {
        body = { ...body, grant_agreement_document_id: docId };
      }
      out = await api(ctx.slug, path, { method: 'POST', body: JSON.stringify(body) });
    }
    if (out && !out.res.ok && out.data && out.data.code === 'over_balance' && ctx.isAdmin) {
      const reason = window.prompt(out.data.error + '\n\nTo approve it anyway, enter the reason (required):');
      if (!reason || !reason.trim()) return null;
      out = await api(ctx.slug, path, { method: 'POST', body: JSON.stringify({ ...body, override: true, override_reason: reason }) });
    }
    if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'That did not work. Try again.'); return null; }
    return out.data;
  }

  async function render(el, ctx) {
    if (!el) return;
    const base = '/sponsored-projects/' + ctx.projectId;
    const [bal, reqs, recalls, rel, clo] = await Promise.all([api(ctx.slug, base + '/balance'), api(ctx.slug, base + '/payment-requests'), api(ctx.slug, base + '/recalls'),
      api(ctx.slug, base + '/releases'), api(ctx.slug, base + '/closing')]);
    const grant = (rel && rel.res.ok && rel.data) || {};
    const isGrant = grant.model === 'model_c';
    const closings = ((clo && clo.res.ok && clo.data.closings) || []).filter((c) => c.status !== 'void');
    const destinations = (clo && clo.res.ok && clo.data.destinations) || {};
    const available = bal && bal.res.ok ? bal.data.balance.available_cents : 0;
    const project = (bal && bal.res.ok && bal.data.project) || {};
    const overrides = (bal && bal.res.ok && bal.data.overrides) || [];
    const requests = (reqs && reqs.res.ok && reqs.data.requests) || [];
    const recallList = (recalls && recalls.res.ok && recalls.data.recalls) || [];
    const held = project.status === 'on_hold';

    const day = (d) => window.OrganizationalSponsorFund.day(d);
    const chip = (tone, text) => '<span class="organizational-sp-chip' + (tone ? ' organizational-sp-chip-' + tone : '') + '">' + esc(text) + '</span>';
    const REQ_TONE = { submitted: 'warn', in_review: 'warn', needs_info: 'warn', approved: 'good', rejected: 'danger', withdrawn: '' };
    const head = (t) => '<h3 class="organizational-sp-head">' + esc(t) + '</h3>';
    const table = (cols, rows) => '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr>' +
      cols.map((c) => '<th' + (c.num ? ' class="organizational-sp-num"' : '') + '>' + esc(c.label || c) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div></section>';
    const cell = (text, title) => '<td class="organizational-sp-name" title="' + esc(title != null ? title : text) + '">' + esc(text) + '</td>';
    const amount = (c) => '<td class="organizational-sp-num">' + money(c) + '</td>';

    el.innerHTML =
      (held ? '<p class="organizational-sp-mo-hold"><strong>On hold</strong>: ' + esc(project.hold_reason || '') +
        '. Payments and requests are blocked.' + (project.hold_kind === 'report_overdue' ? ' Lifts by itself when the report is received.' : '') + '</p>' : '') +
      (ctx.canMoney ? '<p class="organizational-sp-mo-links"><a href="#" data-a="hold">' + (held ? 'Lift hold' : 'Put on hold') + '</a> · <a href="#" data-a="recall">Recall funds</a>' +
        (!closings.length && (project.status === 'winding_down' || project.status === 'on_hold') ? ' · <a href="#" data-a="close">Close the project</a>' : '') + '</p>'
        : '<p class="organizational-hint organizational-sp-mo-links">Holds, recalls and closing are for finance and admins.</p>') +
      (closings.length ? head('Closing') + '<p class="organizational-sp-rec-line">' + money(closings[0].amount_cents) + ' to ' + esc(closings[0].destination_name || destinations[closings[0].destination_kind] || '') +
        ' on ' + esc(day(closings[0].closing_date)) + ' · ' + esc(closings[0].reason) + ' ' + (closings[0].status === 'posted' ? chip('good', 'Posted, project ended') : chip('warn', 'Waiting for Accounting')) + '</p>' : '') +
      '<div data-box="close" hidden></div>' +
      (isGrant ? head('Pre-approved grant') +
        '<p class="organizational-sp-rec-line">Receiving entity: ' + (grant.receiving_entity ? esc(grant.receiving_entity.display_name) : chip('danger', 'Not named')) +
          ' · W-9: ' + (grant.w9_on_file ? 'on file' + (grant.w9_received_at ? ' since ' + esc(day(grant.w9_received_at)) : '') : chip('danger', 'Missing')) +
          (ctx.canMoney ? ' · <a href="#" data-a="entity">Change</a>' : '') + '</p><div data-box="entity" hidden></div>' +
        ((grant.releases || []).length ? table(['Date', 'Kind', { label: 'Amount', num: true }, 'Status', 'Grant agreement'], grant.releases.map((r) => '<tr><td>' + esc(day(r.date)) + '</td>' +
          cell(r.kind === 'property' ? 'Property: ' + (r.in_kind_description || 'donated item') : 'Grant') + amount(r.amount_cents) + '<td>' +
          (r.status === 'approved' ? (r.posted ? chip('good', 'Paid') : chip('warn', 'Approved')) : chip('warn', 'Waiting for approval')) + '</td><td>' +
          (r.grant_agreement_document_id ? 'Attached' : chip('danger', 'Missing')) + '</td></tr>'))
          : '<p class="organizational-hint organizational-sp-rec-line">No releases yet.</p>') : '') +
      head('Payment requests') +
      (requests.length ? table(['Asked', 'Payee', 'For', { label: 'Amount', num: true }, 'How', 'Needed by', 'Status', ''], requests.map((r) => '<tr><td>' + esc(day(r.created_at)) + '</td>' +
          cell(r.payee_name || '') + cell(r.purpose) + amount(r.amount_cents) + '<td>' + esc(METHOD_LABELS[r.method] || r.method) + '</td><td>' + esc(day(r.needed_by)) + '</td>' +
          '<td title="' + esc(r.decision_reason || '') + '">' + chip(REQ_TONE[r.status], STATUS_LABELS[r.status] || r.status) + '</td><td>' +
          (ctx.canMoney && ['submitted', 'in_review', 'needs_info'].includes(r.status)
            ? '<span class="organizational-sp-mo-actions"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="approve" data-id="' + r.id + '">Approve</button>' +
              '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="needs_info" data-id="' + r.id + '">Ask</button>' +
              '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="reject" data-id="' + r.id + '">Reject</button></span>' : '') +
          '</td></tr>'))
        : '<p class="organizational-hint organizational-sp-rec-line">No payment requests yet.</p>') +
      (ctx.canEnter && !held ? '<p class="organizational-sp-rec-line"><a href="#" data-a="new-request">Enter a payment request</a></p>' : '') +
      '<div data-box="request" hidden></div>' +
      (recallList.length ? head('Recalls') + table(['Date', 'Reason', { label: 'Amount', num: true }, 'Status'], recallList.map((r) => '<tr><td>' + esc(day(r.recall_date)) + '</td>' + cell(r.reason) + amount(r.amount_cents) + '<td>' +
          ({ pending: chip('warn', 'Waiting for Accounting'), posted: chip('good', 'Posted'), void: chip('', 'Cancelled') })[r.status] + '</td></tr>')) : '') +
      '<div data-box="recall" hidden></div>' +
      (overrides.length ? head('Approved over the available balance') + table(['When', 'Who', 'Reason', { label: 'Amount', num: true }], overrides.map((o) => '<tr><td>' + esc(day(o.at)) + '</td>' + cell(o.by_email || '') + cell(o.reason) + amount(o.amount_cents) + '</tr>')) : '');

    const done = () => { render(el, ctx); if (ctx.onChange) ctx.onChange(); };
    const holdLink = el.querySelector('[data-a="hold"]');
    if (holdLink) holdLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const reason = window.prompt(held ? 'Why is the hold being lifted? (required)' : 'Why is the project going on hold? Payments and requests will be blocked. (required)');
      if (!reason || !reason.trim()) return;
      const out = await api(ctx.slug, base + (held ? '/lift-hold' : '/hold'), { method: 'POST', body: JSON.stringify({ reason }) });
      if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'That did not work.'); return; }
      done();
    });
    el.querySelectorAll('[data-rq]').forEach((b) => b.addEventListener('click', async () => {
      const action = b.getAttribute('data-rq');
      const body = { action };
      if (action !== 'approve') {
        const reason = window.prompt(action === 'reject' ? 'Why is the request rejected? (required)' : 'What more information is needed? (required)');
        if (!reason || !reason.trim()) return;
        body.reason = reason;
      }
      const data = await sendWithOverride(ctx, base + '/payment-requests/' + b.getAttribute('data-id') + '/review', body);
      if (!data) return;
      if (data.disbursement && data.disbursement.needs_second_approval) window.alert(data.disbursement.message);
      done();
    }));
    const newReq = el.querySelector('[data-a="new-request"]');
    if (newReq) newReq.addEventListener('click', (e) => { e.preventDefault(); openRequestForm(el, ctx, done); });
    const closeLink = el.querySelector('[data-a="close"]');
    if (closeLink) closeLink.addEventListener('click', (e) => { e.preventDefault(); openClosingForm(el, ctx, destinations, available, done); });
    const entityLink = el.querySelector('[data-a="entity"]');
    if (entityLink) entityLink.addEventListener('click', (e) => { e.preventDefault(); openEntityForm(el, ctx, grant, done); });
    const recallLink = el.querySelector('[data-a="recall"]');
    if (recallLink) recallLink.addEventListener('click', (e) => { e.preventDefault(); openRecallForm(el, ctx, done); });
  }

  async function openRequestForm(el, ctx, done) {
    const box = el.querySelector('[data-box="request"]');
    box.hidden = false;
    const [names, docs] = await Promise.all([
      api(ctx.slug, '/constituents/names?active=true', { method: 'GET', skip403Redirect: true }),
      api(ctx.slug, '/documents?sponsored_project_id=' + encodeURIComponent(ctx.projectId)),
    ]);
    const contacts = (names && names.res.ok && Array.isArray(names.data)) ? names.data : [];
    const docList = (docs && docs.res.ok && docs.data.documents) || [];
    box.innerHTML = '<div class="organizational-sp-fund-form">' +
      '<label>Payee * <span data-f="payee"></span></label>' +
      '<label>Amount * <input class="organizational-input" type="number" min="0.01" step="0.01" data-f="amount"></label>' +
      '<label>What it is for * <input class="organizational-input" type="text" maxlength="500" data-f="purpose"></label>' +
      '<label>How to pay <select class="organizational-select" data-f="method">' + Object.keys(METHOD_LABELS).map((k) => '<option value="' + k + '">' + METHOD_LABELS[k] + '</option>').join('') + '</select></label>' +
      '<label>Needed by <input class="organizational-input" type="date" data-f="needed"></label>' +
      '<label>Invoice or receipt <select class="organizational-select" data-f="doc"><option value="">None attached</option>' +
        docList.map((d) => '<option value="' + d.id + '">' + esc(d.title) + '</option>').join('') + '</select></label>' +
      '<label>Budget line <input class="organizational-input" type="text" maxlength="200" data-f="budget"></label>' +
      '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-a="save">Save request</button>' +
      '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="cancel">Cancel</button><span class="organizational-error" data-a="err"></span></div></div>';
    const f = (n) => box.querySelector('[data-f="' + n + '"]');
    if (window.OrganizationalContactPicker) {
      window.OrganizationalContactPicker.mount(f('payee'), { getCache: () => contacts, role: 'vendor', label: 'payee', slug: ctx.slug, valueElementId: 'sp-request-payee-' + ctx.projectId });
    }
    box.querySelector('[data-a="cancel"]').addEventListener('click', () => { box.hidden = true; });
    box.querySelector('[data-a="save"]').addEventListener('click', async () => {
      const err = box.querySelector('[data-a="err"]');
      const payeeEl = document.getElementById('sp-request-payee-' + ctx.projectId);
      const body = {
        payee_constituent_id: payeeEl && payeeEl.value ? Number(payeeEl.value) : null,
        amount_cents: toCents(f('amount').value), purpose: f('purpose').value, method: f('method').value,
        needed_by: f('needed').value || null, document_id: f('doc').value || null, budget_line: f('budget').value || null,
      };
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/payment-requests', { method: 'POST', body: JSON.stringify(body) });
      if (!out || !out.res.ok) { err.textContent = (out && out.data && out.data.error) || 'Could not save the request.'; return; }
      if (out.data.budget_warning) window.alert(out.data.budget_warning);
      done();
    });
  }

  async function openEntityForm(el, ctx, grant, done) {
    const box = el.querySelector('[data-box="entity"]');
    box.hidden = false;
    const [names, docs] = await Promise.all([api(ctx.slug, '/constituents/names?active=true', { method: 'GET', skip403Redirect: true }), api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/documents')]);
    const contacts = (names && names.res.ok && Array.isArray(names.data)) ? names.data.filter((c) => c.kind === 'organization') : [];
    const docList = ((docs && docs.res.ok && docs.data.documents) || []).filter((d) => d.is_current);
    box.innerHTML = '<div class="organizational-sp-fund-form"><label>Receiving entity <span data-f="entity"></span></label>' +
      '<label>W-9 <select class="organizational-select" data-f="w9"><option value="">Not on file</option>' + docList.map((d) => '<option value="' + d.id + '"' + (Number(grant.w9_document_id) === Number(d.id) ? ' selected' : '') + '>' + esc(d.title) + '</option>').join('') + '</select></label>' +
      '<label>W-9 received <input class="organizational-input" type="date" data-f="w9date" value="' + esc(grant.w9_received_at || new Date().toISOString().slice(0, 10)) + '"></label>' +
      '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Save</button></div></div>';
    if (window.OrganizationalContactPicker) {
      window.OrganizationalContactPicker.mount(box.querySelector('[data-f="entity"]'), { getCache: () => contacts, role: null, label: 'organization', slug: ctx.slug,
        selectedId: grant.receiving_entity && grant.receiving_entity.id, valueElementId: 'sp-entity-' + ctx.projectId });
    }
    box.querySelector('[data-f="go"]').addEventListener('click', async () => {
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/grant-entity', { method: 'POST', body: JSON.stringify({
        receiving_constituent_id: Number(document.getElementById('sp-entity-' + ctx.projectId).value) || null,
        w9_document_id: Number(box.querySelector('[data-f="w9"]').value) || null, w9_received_at: box.querySelector('[data-f="w9date"]').value }) });
      if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'Could not save.'); return; }
      done();
    });
  }

  async function openClosingForm(el, ctx, destinations, available, done) {
    const box = el.querySelector('[data-box="close"]');
    box.hidden = false;
    const [names, docs] = await Promise.all([api(ctx.slug, '/constituents/names?active=true', { method: 'GET', skip403Redirect: true }), api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/documents')]);
    const contacts = (names && names.res.ok && Array.isArray(names.data)) ? names.data.filter((c) => c.kind === 'organization') : [];
    const docList = ((docs && docs.res.ok && docs.data.documents) || []).filter((d) => d.is_current);
    box.innerHTML = '<div class="organizational-sp-fund-form">' +
      '<label>Remaining balance goes to * <select class="organizational-select" data-f="kind">' + Object.keys(destinations).map((k) => '<option value="' + k + '">' + esc(destinations[k]) + '</option>').join('') + '</select></label>' +
      '<label>Receiving organization <span data-f="dest"></span></label>' +
      '<label>Amount * <input class="organizational-input" type="number" min="0" step="0.01" data-f="amount" value="' + (Math.max(0, available) / 100).toFixed(2) + '"></label>' +
      '<label>Transfer date * <input class="organizational-input" type="date" data-f="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<label>Reason * <input class="organizational-input" type="text" maxlength="500" data-f="reason"></label>' +
      '<label>Document (needed for a new sponsor) <select class="organizational-select" data-f="doc"><option value="">None</option>' + docList.map((d) => '<option value="' + d.id + '">' + esc(d.title) + '</option>').join('') + '</select></label>' +
      '<p class="organizational-hint" style="grid-column:1/-1;margin:0;">Pay the final bills first. The amount cannot be more than the project has available after its liabilities. Accounting posts the transfer, and the project then ends.</p>' +
      '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-f="go">Record the closing transfer</button><span class="organizational-error" data-f="err"></span></div></div>';
    if (window.OrganizationalContactPicker) {
      window.OrganizationalContactPicker.mount(box.querySelector('[data-f="dest"]'), { getCache: () => contacts, role: null, label: 'organization', slug: ctx.slug, valueElementId: 'sp-close-dest-' + ctx.projectId });
    }
    const f = (n) => box.querySelector('[data-f="' + n + '"]');
    f('go').addEventListener('click', async () => {
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/closing', { method: 'POST', body: JSON.stringify({
        destination_kind: f('kind').value, destination_constituent_id: Number(document.getElementById('sp-close-dest-' + ctx.projectId).value) || null,
        amount_cents: toCents(f('amount').value), closing_date: f('date').value, reason: f('reason').value, document_id: Number(f('doc').value) || null }) });
      if (!out || !out.res.ok) { f('err').textContent = (out && out.data && out.data.error) || 'Could not record the closing.'; return; }
      done();
    });
  }

  function openRecallForm(el, ctx, done) {
    const box = el.querySelector('[data-box="recall"]');
    box.hidden = false;
    box.innerHTML = '<div class="organizational-sp-fund-form">' +
      '<label>Amount * <input class="organizational-input" type="number" min="0.01" step="0.01" data-f="amount"></label>' +
      '<label>Date <input class="organizational-input" type="date" data-f="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<label>Reason * <input class="organizational-input" type="text" maxlength="500" data-f="reason"></label>' +
      '<p class="organizational-hint" style="margin:0;grid-column:1/-1;">The recall is posted to the books by Accounting from Gift Postings.</p>' +
      '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-a="save">Record recall</button>' +
      '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="cancel">Cancel</button><span class="organizational-error" data-a="err"></span></div></div>';
    const f = (n) => box.querySelector('[data-f="' + n + '"]');
    box.querySelector('[data-a="cancel"]').addEventListener('click', () => { box.hidden = true; });
    box.querySelector('[data-a="save"]').addEventListener('click', async () => {
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/recalls', { method: 'POST',
        body: JSON.stringify({ amount_cents: toCents(f('amount').value), recall_date: f('date').value, reason: f('reason').value }) });
      if (!out || !out.res.ok) { box.querySelector('[data-a="err"]').textContent = (out && out.data && out.data.error) || 'Could not record the recall.'; return; }
      done();
    });
  }

  window.OrganizationalSponsorMoneyOut = { render, sendWithOverride };
})();
