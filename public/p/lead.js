/* lead.js — the project lead's page: one project's balance and activity, a payment request form, report and document upload.
   The link token arrives in the URL fragment, is kept for this tab only, and is sent to the server in a header. */
(function () {
  'use strict';

  const slug = decodeURIComponent((location.pathname.match(/^\/p\/([^/]+)\/lead/) || [])[1] || '');
  const KEY = 'lead-link:' + slug;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.get('t')) {
    try { sessionStorage.setItem(KEY, hash.get('t')); } catch (e) { /* storage off */ }
    window.__leadToken = hash.get('t');
    history.replaceState(null, '', location.pathname);
  }
  let token = window.__leadToken || null;
  try { token = token || sessionStorage.getItem(KEY); } catch (e) { /* storage off */ }
  let formToken = '';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = (c) => { const n = Number(c) / 100; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const STATUS = { submitted: 'Sent', in_review: 'Being reviewed', needs_info: 'More information needed', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn' };

  function fail(msg) {
    $('pub-title').textContent = 'Project';
    $('pub-error').textContent = msg;
    $('pub-error').hidden = false;
    $('pub-body').hidden = true;
  }

  async function call(path, opts) {
    const res = await fetch('/api/public/' + encodeURIComponent(slug) + path, { ...(opts || {}), headers: { ...((opts && opts.headers) || {}), 'X-Link-Token': token || '' } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function load() {
    if (!token) { fail('This page needs the link the workspace sent you. Open that link again.'); return; }
    const out = await call('/lead/project');
    if (!out.ok) { fail(out.data.error || 'This link is not working. Ask the workspace for a new one.'); return; }
    const d = out.data;
    formToken = d.form_token;
    document.title = d.project.name;
    $('pub-org').textContent = d.workspace_name;
    $('pub-title').textContent = d.project.name;
    $('pub-hold').hidden = !d.project.hold_reason;
    $('pub-hold').textContent = d.project.hold_reason ? 'On hold: ' + d.project.hold_reason + '. Payments are paused until the workspace lifts the hold.' : '';
    const b = d.balance;
    $('pub-balance').innerHTML = [['Received', b.received_cents], ['Administrative fee', -b.fees_cents], ['Paid out', -b.paid_cents], ['Committed, not yet paid', -b.committed_cents]]
      .map((r) => '<tr><th scope="row">' + r[0] + '</th><td class="organizational-sp-fund-amount">' + money(r[1]) + '</td></tr>').join('') +
      '<tr class="organizational-sp-fund-total"><th scope="row">Available</th><td class="organizational-sp-fund-amount">' + money(b.available_cents) + '</td></tr>';
    $('pub-doc-type').innerHTML = d.document_types.map((t) => '<option value="' + esc(t.key) + '">' + esc(t.label) + '</option>').join('');
    $('pub-reports').innerHTML = d.reports.length ? '<ul class="organizational-sp-fund-list">' + d.reports.map((r) => '<li>Quarter ' + esc(r.period_start) + ' to ' + esc(r.period_end) + ', due ' + esc(r.due_date) + ': ' +
      (r.received_at ? 'received ' + esc(r.received_at) : '<label class="organizational-pub-inline">send it <input type="file" data-report="' + r.id + '" accept=".pdf,.doc,.docx,.xls,.xlsx"></label>') + '</li>').join('') + '</ul>'
      : '<p class="organizational-hint">No reports due.</p>';
    $('pub-requests').innerHTML = d.requests.length ? d.requests.map((r) => '<li>' + esc(r.date) + ' · ' + esc(r.payee || '') + ' · ' + money(r.amount_cents) + ' · ' + esc(r.purpose) + ' · <strong>' + esc(STATUS[r.status] || r.status) + '</strong>' +
      (r.note ? ' <span class="organizational-hint">' + esc(r.note) + '</span>' : '') + '</li>').join('') : '<li class="organizational-hint">No requests yet.</li>';
    $('pub-activity').innerHTML = d.activity.length ? d.activity.map((a) => '<li>' + esc(a.date) + ' · ' + esc(a.label) + ' · ' + money(a.cents) + '</li>').join('') : '<li class="organizational-hint">No activity yet.</li>';
    document.querySelectorAll('input[data-report]').forEach((inp) => inp.addEventListener('change', () => sendReport(inp)));
    $('pub-body').hidden = false;
  }

  async function sendForm(form, path, extra) {
    const msg = form.querySelector('[data-msg]');
    msg.textContent = 'Sending…';
    const fd = new FormData(form);
    fd.append('form_token', formToken);
    Object.entries(extra || {}).forEach(([k, v]) => fd.set(k, v));
    const out = await call(path, { method: 'POST', body: fd });
    msg.textContent = out.ok ? 'Sent. Thank you.' : (out.data.error || 'That did not go through. Try again.');
    if (out.ok) { form.reset(); load(); }
    return out;
  }

  $('pub-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = Math.round(Number(form.elements.amount.value) * 100);
    const out = await sendForm(form, '/lead/payment-requests', { amount_cents: String(amount) });
    if (out.ok && out.data.budget_warning) form.querySelector('[data-msg]').textContent = 'Sent. Note: ' + out.data.budget_warning;
  });
  $('pub-doc').addEventListener('submit', (e) => { e.preventDefault(); sendForm(e.target, '/lead/documents'); });

  async function sendReport(input) {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    fd.append('form_token', formToken);
    const out = await call('/lead/reports/' + input.dataset.report, { method: 'POST', body: fd });
    if (!out.ok) { window.alert(out.data.error || 'The report did not go through. Try again.'); return; }
    load();
  }

  load();
})();
