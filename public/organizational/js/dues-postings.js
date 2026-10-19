/* dues-postings.js: Accounting > Dues Postings. Dues payments and refunds recorded in Membership wait here unposted until a
 * person posts them; the monthly recognition run is previewed and confirmed here; posted items can be reversed with a reason.
 * Registers window.OrganizationalAccounting.duesPostings.init(slug), called by accounting-workspace.js.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};
  const esc = window.escapeHtml;
  const money = (c) => window.formatMoneyCents(Number(c));
  const $ = (id) => document.getElementById(id);
  let slug = '';
  let accounts = [];
  let data = null;
  let wired = false;

  function api(path, method, body) {
    const o = { method: method || 'GET', skip403Redirect: true };
    if (body !== undefined) o.body = JSON.stringify(body);
    return window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dues-postings' + path, o);
  }
  const errorOf = (out, fb) => (out && out.data && out.data.error) || fb;

  function accountOptions(selected) {
    return accounts.map((a) => '<option value="' + a.id + '"' + (String(a.id) === String(selected) ? ' selected' : '') + '>' + esc(a.code ? a.code + ' ' + a.name : a.name) + '</option>').join('');
  }

  async function load() {
    const month = $('organizational-duespostings-month').value;
    const out = await api(month ? '?month=' + encodeURIComponent(month) : '');
    if (!out || !out.res.ok) {
      $('organizational-duespostings-tbody').innerHTML = '<tr class="organizational-table-empty"><td colspan="6">' + esc(errorOf(out, 'Could not load dues postings.')) + '</td></tr>';
      return;
    }
    data = out.data;
    if (!month) $('organizational-duespostings-month').value = data.recognition.month;
    const tb = $('organizational-duespostings-tbody');
    tb.innerHTML = data.pending.length ? data.pending.map((p) => '<tr><td>' + esc(p.payment_date) + '</td><td>' + esc(p.display_name) + '</td><td>' + (p.kind === 'refund' ? 'Refund' : 'Payment') + (p.method ? ' · ' + esc(p.method) : '') + '</td>'
      + '<td>' + (p.kind === 'refund' ? '−' : '') + money(p.amount_cents) + '</td><td class="organizational-hint">' + esc(p.tier_name || '') + ' ' + esc(p.starts_on) + ' to ' + esc(p.ends_on) + '</td>'
      + '<td><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-post="' + p.id + '">Post…</button></td></tr>').join('')
      : '<tr class="organizational-table-empty"><td colspan="6">Nothing is waiting to be posted.</td></tr>';
    tb.querySelectorAll('[data-post]').forEach((b) => b.addEventListener('click', () => openPost(data.pending.find((p) => String(p.id) === b.dataset.post))));

    const rec = data.recognition;
    $('organizational-duespostings-recognition-tbody').innerHTML = rec.error ? '<tr class="organizational-table-empty"><td colspan="4">' + esc(rec.error) + '</td></tr>'
      : rec.rows.length ? rec.rows.map((r) => '<tr><td>' + esc(r.display_name) + '</td><td>' + esc(r.tier_name || '') + '</td><td class="organizational-hint">' + esc(r.starts_on) + ' to ' + esc(r.ends_on) + '</td><td>' + money(r.amount_cents) + '</td></tr>').join('')
        + '<tr><td colspan="3"><strong>Total, posted on ' + esc(rec.posting_date) + '</strong></td><td><strong>' + money(rec.total_cents) + '</strong></td></tr>'
        : '<tr class="organizational-table-empty"><td colspan="4">' + (rec.posted && rec.posted.length ? 'This month has been posted.' : 'Nothing to recognise for this month.') + '</td></tr>';
    $('organizational-duespostings-run-btn').disabled = !(rec.rows && rec.rows.length);
    $('organizational-duespostings-run-msg').textContent = 'Recognition: ' + (data.recognition_mode === 'spread' ? 'spread evenly over each term' : 'at receipt (only dues paid before a term starts wait in the liability)') + '. Change this in Membership settings.';

    const pt = $('organizational-duespostings-posted-tbody');
    pt.innerHTML = data.posted.length ? data.posted.map((p) => '<tr><td>' + esc(p.payment_date) + '</td><td>' + esc(p.display_name) + '</td><td>' + (p.kind === 'refund' ? 'Refund' : 'Payment') + '</td><td>' + money(p.amount_cents) + '</td>'
      + '<td class="organizational-hint">contribution ' + money(p.posted_contribution_cents || 0) + ' · deferred ' + money(p.posted_deferred_cents || 0) + ' · revenue ' + money(p.posted_revenue_cents || 0)
      + (p.ledger_transaction_id ? ' · <a href="/organizational/o/' + encodeURIComponent(slug) + '/transactions?txn=' + p.ledger_transaction_id + '">entry</a>' : '') + '</td>'
      + '<td><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-reverse="' + p.id + '">Reverse…</button></td></tr>').join('')
      : '<tr class="organizational-table-empty"><td colspan="6">Nothing posted yet.</td></tr>';
    pt.querySelectorAll('[data-reverse]').forEach((b) => b.addEventListener('click', async () => {
      const reason = window.prompt('Reason for reversing this posting (required):');
      if (!reason || !reason.trim()) return;
      const r = await api('/' + b.dataset.reverse + '/reverse', 'POST', { reason });
      if (!r || !r.res.ok) { window.alert(errorOf(r, 'Could not reverse.')); return; }
      load();
    }));
    const runs = data.runs || [];
    const runsEl = $('organizational-duespostings-runs');
    runsEl.innerHTML = runs.length ? 'Recognition posted: ' + runs.map((r, i) => esc(r.month) + ' ' + money(r.cents) + (i === 0 ? ' <a href="#" data-undo-run="' + esc(r.month) + '">reverse</a>' : '')).join(' · ') : '';
    const undo = runsEl.querySelector('[data-undo-run]');
    if (undo) undo.addEventListener('click', async (e) => {
      e.preventDefault();
      const reason = window.prompt('Reason for reversing the recognition for ' + undo.dataset.undoRun + ' (required):');
      if (!reason || !reason.trim()) return;
      const r = await api('/recognition/reverse', 'POST', { month: undo.dataset.undoRun, reason });
      if (!r || !r.res.ok) { window.alert(errorOf(r, 'Could not reverse.')); return; }
      load();
    });
  }

  function openPost(p) {
    const panel = $('organizational-duespostings-post-panel');
    panel.hidden = false;
    panel.innerHTML = '<strong>Post ' + (p.kind === 'refund' ? 'refund to ' : 'dues from ') + esc(p.display_name) + ', ' + money(p.amount_cents) + '</strong>'
      + '<div class="organizational-panel-fields" style="margin-top:8px;">'
      + '<label class="organizational-label">Posting date<input type="date" class="organizational-input" id="dp-date" value="' + esc(p.payment_date) + '"></label>'
      + '<label class="organizational-label">' + (p.kind === 'refund' ? 'Paid out of' : 'Deposited to') + '<select class="organizational-select" id="dp-account">' + accountOptions(data.default_deposit_account_id) + '</select></label></div>'
      + '<p class="organizational-error" id="dp-error" hidden></p>'
      + '<button type="button" class="organizational-btn organizational-btn-primary" id="dp-go">Post</button> <button type="button" class="organizational-btn organizational-btn-outline" id="dp-cancel">Cancel</button>';
    $('dp-cancel').addEventListener('click', () => { panel.hidden = true; });
    $('dp-go').addEventListener('click', async () => {
      const r = await api('/' + p.id + '/post', 'POST', { posting_date: $('dp-date').value, deposit_account_id: Number($('dp-account').value) });
      if (!r || !r.res.ok) { $('dp-error').textContent = errorOf(r, 'Could not post.'); $('dp-error').hidden = false; return; }
      panel.hidden = true;
      load();
    });
  }

  window.OrganizationalAccounting.duesPostings = {
    async init(s) {
      slug = s;
      const a = await window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts', { method: 'GET', skip403Redirect: true });
      accounts = ((a && a.res.ok && a.data && a.data.accounts) || []).filter((x) => x.is_posting && x.type === 'asset');
      if (!wired) {
        wired = true;
        $('organizational-duespostings-month').addEventListener('change', load);
        $('organizational-duespostings-run-btn').addEventListener('click', async () => {
          const month = $('organizational-duespostings-month').value;
          if (!window.confirm('Post the recognition entry for ' + month + '?')) return;
          const r = await api('/recognition', 'POST', { month });
          await load();
          $('organizational-duespostings-run-msg').textContent = r && r.res.ok ? 'Posted ' + money(r.data.total_cents) + ' for ' + r.data.terms + ' term(s).' : errorOf(r, 'Could not post the recognition run.');
        });
      }
      await load();
    },
  };
})();
