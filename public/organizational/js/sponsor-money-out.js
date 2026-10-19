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
  async function sendWithOverride(ctx, path, body) {
    let out = await api(ctx.slug, path, { method: 'POST', body: JSON.stringify(body) });
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
    const [bal, reqs, recalls] = await Promise.all([api(ctx.slug, base + '/balance'), api(ctx.slug, base + '/payment-requests'), api(ctx.slug, base + '/recalls')]);
    const project = (bal && bal.res.ok && bal.data.project) || {};
    const overrides = (bal && bal.res.ok && bal.data.overrides) || [];
    const requests = (reqs && reqs.res.ok && reqs.data.requests) || [];
    const recallList = (recalls && recalls.res.ok && recalls.data.recalls) || [];
    const held = project.status === 'on_hold';

    el.innerHTML =
      (held ? '<p class="organizational-sp-mo-hold"><strong>On hold</strong>: ' + esc(project.hold_reason || '') +
        '. Payments and requests are blocked.' + (project.hold_kind === 'report_overdue' ? ' Lifts by itself when the report is received.' : '') + '</p>' : '') +
      (ctx.canMoney ? '<p class="organizational-sp-mo-links"><a href="#" data-a="hold">' + (held ? 'Lift hold' : 'Put on hold') + '</a> · <a href="#" data-a="recall">Recall funds</a></p>' : '') +
      '<div class="organizational-panel-section-head">Payment requests</div>' +
      (requests.length ? '<ul class="organizational-sp-fund-list organizational-sp-mo-requests">' +
        requests.map((r) => '<li><span>' + esc(String(r.created_at || '').slice(0, 10)) + ' · ' + esc(r.payee_name || '') + ' · <strong>' + money(r.amount_cents) + '</strong> · ' + esc(r.purpose) +
          ' <span class="organizational-hint">' + esc(METHOD_LABELS[r.method] || r.method) + (r.needed_by ? ', by ' + esc(String(r.needed_by).slice(0, 10)) : '') + '</span> · ' +
          esc(STATUS_LABELS[r.status] || r.status) + (r.decision_reason ? ' <span class="organizational-hint">' + esc(r.decision_reason) + '</span>' : '') + '</span>' +
          (ctx.canMoney && ['submitted', 'in_review', 'needs_info'].includes(r.status)
            ? '<span class="organizational-sp-mo-actions"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="approve" data-id="' + r.id + '">Approve</button>' +
              '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="needs_info" data-id="' + r.id + '">Ask</button>' +
              '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-rq="reject" data-id="' + r.id + '">Reject</button></span>' : '') +
          '</li>').join('') + '</ul>'
        : '<p class="organizational-hint" style="margin:4px 0;">No payment requests yet.</p>') +
      (ctx.canEnter && !held ? '<p style="margin:6px 0 0;"><a href="#" data-a="new-request">Enter a payment request</a></p>' : '') +
      '<div data-box="request" hidden></div>' +
      (recallList.length ? '<div class="organizational-panel-section-head">Recalls</div><ul class="organizational-sp-fund-list">' +
        recallList.map((r) => '<li>' + esc(r.recall_date) + ' · ' + money(r.amount_cents) + ' · ' + esc(r.reason) + ' <span class="organizational-hint">' +
          ({ pending: 'waiting for Accounting', posted: 'posted', void: 'cancelled' })[r.status] + '</span></li>').join('') + '</ul>' : '') +
      '<div data-box="recall" hidden></div>' +
      (overrides.length ? '<div class="organizational-panel-section-head">Approved over the available balance</div><ul class="organizational-sp-fund-list">' +
        overrides.map((o) => '<li>' + money(o.amount_cents) + ' · ' + esc(o.reason) + ' <span class="organizational-hint">' + esc(o.by_email || '') + ', ' + esc(String(o.at || '').slice(0, 10)) + '</span></li>').join('') + '</ul>' : '');

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
