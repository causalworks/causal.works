/* membership.js: Membership page. Dues members list and record panel, renewals, summary, tiers and settings. */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const money = (c) => (c == null ? '—' : window.formatMoneyCents(Number(c)));
  const STATUS_LABELS = { active: 'Active', pending: 'Pending', grace: 'Grace', lapsed: 'Lapsed', ended: 'Ended' };
  const KIND_LABELS = { payment: 'Payment', refund: 'Refund', waiver: 'Waiver' };
  const METHODS = [['check', 'Check'], ['transfer', 'Bank transfer'], ['card', 'Card'], ['cash', 'Cash'], ['other', 'Other']];

  const $ = (id) => document.getElementById(id);
  const errEl = $('organizational-org-error');
  const panel = $('membership-panel');
  const overlay = $('membership-panel-overlay');
  const panelBody = $('membership-panel-body');
  const panelTitle = $('membership-panel-title');
  const panelErr = $('membership-panel-error');

  let slug = '';
  let access = { canRead: false, canWrite: false, canAdmin: false };
  let tiers = [];
  let openId = null;

  function api(path, method, body) {
    const opts = { method: method || 'GET', skip403Redirect: true };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/membership' + path, opts);
  }
  function orgApi(path) {
    return window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + path, { method: 'GET', skip403Redirect: true });
  }
  function errorOf(out, fallback) { return (out && out.data && out.data.error) || fallback; }
  function showError(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }
  function showPanelError(msg) { panelErr.textContent = msg || ''; panelErr.hidden = !msg; }
  function badge(status) {
    return status ? '<span class="organizational-badge organizational-badge-' + esc(status) + '">' + esc(STATUS_LABELS[status] || status) + '</span>' : '<span class="organizational-membership-muted">—</span>';
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function tierOptions(selected, includeArchived) {
    return tiers.filter((t) => includeArchived || !t.archived_at).map((t) => '<option value="' + t.id + '"' + (String(t.id) === String(selected) ? ' selected' : '') + '>'
      + esc(t.name) + (t.pay_what_you_can ? ' (pay what you can)' : ' · ' + money(t.price_cents)) + '</option>').join('');
  }

  // --- Tabs ---

  function showTab(name) {
    document.querySelectorAll('[data-membership-tab]').forEach((b) => b.classList.toggle('active', b.dataset.membershipTab === name));
    document.querySelectorAll('.organizational-tab-content').forEach((s) => s.classList.toggle('active', s.id === 'membership-tab-' + name));
    try { sessionStorage.setItem('membership-tab', name); } catch (e) { /* storage unavailable */ }
    if (name === 'members') loadMembers();
    if (name === 'renewals') loadRenewals();
    if (name === 'summary') loadSummary();
    if (name === 'tiers') loadTiers();
    if (name === 'settings') loadSettings();
  }

  // --- Dues members ---

  async function loadJoinRequests() {
    const box = $('membership-join-requests');
    const out = await api('/join-requests');
    const rows = (out && out.res.ok && out.data.join_requests) || [];
    box.hidden = !rows.length;
    $('membership-join-tbody').innerHTML = rows.map((r) => '<tr><td>' + esc(r.display_name || '') + (r.kind === 'organization' ? ' <span class="organizational-badge">Organization</span>' : '') + '<div class="organizational-hint">' + esc(r.email || '') + '</div></td>'
      + '<td>' + esc(r.tier_name || '') + ' · ' + money(r.price_cents) + (r.extra_gift_cents ? '<div class="organizational-hint">plus a gift of ' + money(r.extra_gift_cents) + '</div>' : '') + '</td>'
      + '<td class="organizational-hint">' + esc(String(r.confirmed_at || '').slice(0, 10)) + '</td><td style="white-space:nowrap;">'
      + (access.canWrite ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-join-approve="' + r.id + '">Approve</button> '
        + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-join-decline="' + r.id + '">Decline</button>' : '') + '</td></tr>').join('');
    box.querySelectorAll('[data-join-approve]').forEach((b) => b.addEventListener('click', async () => {
      const r = await api('/join-requests/' + b.dataset.joinApprove + '/approve', 'POST', {});
      if (!r || !r.res.ok) { showError(errorOf(r, 'Could not approve.')); return; }
      showError('');
      loadMembers();
    }));
    box.querySelectorAll('[data-join-decline]').forEach((b) => b.addEventListener('click', async () => {
      const reason = window.prompt('Reason for declining (required):');
      if (!reason || !reason.trim()) return;
      const r = await api('/join-requests/' + b.dataset.joinDecline + '/decline', 'POST', { reason });
      if (!r || !r.res.ok) { showError(errorOf(r, 'Could not decline.')); return; }
      loadMembers();
    }));
  }

  async function loadMembers() {
    loadJoinRequests();
    const tbody = $('membership-members-tbody');
    const q = new URLSearchParams();
    if ($('membership-search').value.trim()) q.set('q', $('membership-search').value.trim());
    if ($('membership-filter-status').value) q.set('status', $('membership-filter-status').value);
    if ($('membership-filter-tier').value) q.set('tier_id', $('membership-filter-tier').value);
    if ($('membership-filter-kind').value) q.set('kind', $('membership-filter-kind').value);
    $('membership-export').href = '/api/organizational/orgs/' + encodeURIComponent(slug) + '/membership/dues-members/export.csv?' + q.toString();
    const out = await api('/dues-members?' + q.toString());
    if (!out || !out.res.ok) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">' + esc(errorOf(out, 'Could not load dues members.')) + '</td></tr>'; return; }
    const rows = out.data.dues_members || [];
    if (!rows.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No dues members match.</td></tr>'; return; }
    tbody.innerHTML = rows.map((r) => '<tr data-id="' + r.id + '" style="cursor:pointer;">'
      + '<td>' + esc(r.display_name) + (r.kind === 'organization' ? ' <span class="organizational-badge">Organization</span>' : '') + '</td>'
      + '<td>' + badge(r.status) + '</td>'
      + '<td>' + esc((r.term && r.term.tier_name) || '—') + '</td>'
      + '<td>' + esc((r.term && r.term.ends_on) || '—') + '</td>'
      + '<td>' + (r.term && r.term.balance_cents ? money(r.term.balance_cents) : '') + '</td>'
      + '<td>' + esc(r.last_contact_on || '') + '</td></tr>').join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openRecord(Number(tr.dataset.id))));
  }

  async function loadRenewals() {
    const tbody = $('membership-renewals-tbody');
    const q = new URLSearchParams({ days: $('renewals-days').value });
    if ($('renewals-tier').value) q.set('tier_id', $('renewals-tier').value);
    if ($('renewals-contact').value) q.set('no_contact_days', $('renewals-contact').value);
    const out = await api('/renewals?' + q.toString());
    if (!out || !out.res.ok) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">' + esc(errorOf(out, 'Could not load renewals.')) + '</td></tr>'; return; }
    const rows = out.data.renewals || [];
    if (!rows.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">No renewals due in this window.</td></tr>'; return; }
    tbody.innerHTML = rows.map((r) => '<tr data-id="' + r.id + '" style="cursor:pointer;">'
      + '<td>' + esc(r.display_name) + '</td><td>' + badge(r.status) + '</td><td>' + esc(r.term.tier_name || '—') + '</td>'
      + '<td>' + esc(r.term.ends_on) + '</td><td>' + r.days_to_expiry + '</td>'
      + '<td>' + (r.renewal ? 'Billed, unpaid' : '') + '</td><td>' + esc(r.last_contact_on || '') + '</td></tr>').join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openRecord(Number(tr.dataset.id))));
  }

  async function loadSummary() {
    const out = await api('/summary');
    const cards = $('membership-summary-cards');
    if (!out || !out.res.ok) { cards.textContent = errorOf(out, 'Could not load the summary.'); return; }
    const d = out.data;
    const card = (label, value) => '<div class="organizational-summary-card"><div class="organizational-summary-label">' + esc(label) + '</div><div class="organizational-summary-value">' + esc(String(value)) + '</div></div>';
    cards.innerHTML = Object.keys(STATUS_LABELS).map((k) => card(STATUS_LABELS[k], d.counts[k] || 0)).join('')
      + card('Dues this fiscal year', money(d.dues_received_fiscal_year_cents))
      + card('Renewals in 30 days', d.renewals_due.d30) + card('Renewals in 90 days', d.renewals_due.d90);
    const tiersRows = Object.entries(d.active_by_tier || {});
    $('membership-summary-tiers').innerHTML = tiersRows.length
      ? tiersRows.map(([name, n]) => '<tr><td>' + esc(name) + '</td><td>' + n + '</td></tr>').join('')
      : '<tr class="organizational-table-empty"><td>No active dues members yet.</td></tr>';
  }

  // --- Record panel ---

  function openPanel() { panel.classList.add('organizational-panel-is-open'); overlay.classList.add('organizational-panel-is-open'); }
  function closePanel() { panel.classList.remove('organizational-panel-is-open'); overlay.classList.remove('organizational-panel-is-open'); openId = null; }

  async function openRecord(id) {
    openId = id;
    showPanelError('');
    const out = await api('/dues-members/' + id);
    if (!out || !out.res.ok) { showError(errorOf(out, 'Could not load this dues member.')); return; }
    const d = out.data;
    panelTitle.textContent = d.dues_member.display_name;
    panelBody.innerHTML = recordHtml(d);
    wireRecord(d);
    openPanel();
  }

  function form(id, title, fields, submit) {
    return '<form class="organizational-membership-form" id="' + id + '" hidden><div class="organizational-membership-section" style="margin-top:0;">' + esc(title) + '</div>'
      + '<div class="organizational-panel-fields">' + fields + '</div>'
      + '<button type="submit" class="organizational-btn organizational-btn-primary organizational-btn-sm">' + esc(submit) + '</button> '
      + '<button type="button" class="organizational-btn organizational-btn-outline organizational-btn-sm" data-cancel>Cancel</button></form>';
  }
  function field(label, html, full) { return '<label class="organizational-label' + (full ? ' organizational-panel-field-full' : '') + '">' + label + html + '</label>'; }
  function methodSelect() { return '<select name="method" class="organizational-select">' + METHODS.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select>'; }

  function recordHtml(d) {
    const c = d.dues_member;
    const cur = d.terms.find((t) => t.id === d.current_term_id) || null;
    const w = access.canWrite;
    let html = '<p>' + badge(d.status) + ' '
      + (c.email ? esc(c.email) + ' · ' : '') + (c.phone ? esc(c.phone) + ' · ' : '')
      + '<a href="/organizational/o/' + encodeURIComponent(slug) + '/contacts?contact=' + c.id + '">Contact record</a></p>';
    if (cur) {
      html += '<p class="organizational-hint">Current term: ' + esc(cur.tier_name || 'No tier') + ', ' + esc(cur.starts_on) + ' to ' + esc(cur.ends_on)
        + ' · price ' + money(cur.price_cents) + (cur.balance_cents ? ' · owed ' + money(cur.balance_cents) : ' · settled')
        + (cur.invoice_id ? ' · <a href="/organizational/o/' + encodeURIComponent(slug) + '/sales?open_invoice=' + cur.invoice_id + '">invoice</a>' : '')
        + (cur.auto_renew ? ' · renews automatically' : '') + (cur.payment_failed_at ? ' · <strong>card payment failed</strong>' : '') + '</p>';
    }
    if (w) {
      html += '<div class="organizational-membership-actions">'
        + (cur && cur.status_override !== 'ended' ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-open="f-pay">Record payment</button>'
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-open="f-waive">Waive dues</button>'
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-open="f-extend">Extend</button>'
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-open="f-end">End membership</button>' : '')
        + (cur && cur.balance_cents && !cur.invoice_id && cur.status_override !== 'ended' ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-invoice="' + cur.id + '">Create invoice</button>' : '')
        + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-open="f-term">' + (d.terms.length ? 'Renew or add a term' : 'Add a term') + '</button>'
        + '</div>';
      if (cur) {
        html += form('f-pay', 'Record payment', field('Amount *', '<input name="amount" class="organizational-input" inputmode="decimal" value="' + (cur.balance_cents ? (cur.balance_cents / 100).toFixed(2) : '') + '">')
          + field('Date', '<input name="payment_date" type="date" class="organizational-input" value="' + today() + '">')
          + field('Method', methodSelect())
          + field('Discount', '<input name="discount" class="organizational-input" inputmode="decimal">')
          + field('Discount reason', '<input name="discount_reason" class="organizational-input">', true)
          + field('Notes', '<input name="notes" class="organizational-input">', true), 'Save payment');
        html += form('f-waive', 'Waive or reduce dues', field('Amount to waive *', '<input name="amount" class="organizational-input" inputmode="decimal" value="' + (cur.balance_cents ? (cur.balance_cents / 100).toFixed(2) : '') + '">')
          + field('Reason *', '<input name="reason" class="organizational-input">')
          + '<p class="organizational-hint organizational-panel-field-full">Someone else with membership access approves it before it counts.</p>', 'Save waiver');
        html += form('f-extend', 'Extend term', field('New end date *', '<input name="ends_on" type="date" class="organizational-input" value="' + esc(cur.ends_on) + '">')
          + field('Reason *', '<input name="reason" class="organizational-input" placeholder="Hardship, gift membership…">'), 'Extend');
        html += form('f-end', 'End membership', field('Reason *', '<input name="reason" class="organizational-input">', true)
          + field('End date', '<input name="ended_on" type="date" class="organizational-input" value="' + today() + '">'), 'End membership');
      }
      html += form('f-term', d.terms.length ? 'Renew or add a term' : 'Add a term', field('Tier', '<select name="tier_id" class="organizational-select">' + tierOptions(cur && cur.tier_id) + '</select>')
        + field('Amount (pay-what-you-can tiers)', '<input name="price" class="organizational-input" inputmode="decimal">')
        + field('Start date (leave blank to follow on)', '<input name="starts_on" type="date" class="organizational-input">')
        + field('Eligibility', '<span><input type="checkbox" name="eligibility_confirmed"> Confirmed, where the tier asks</span>'), 'Add term');
      html += form('f-refund', 'Refund', '<input type="hidden" name="payment_id">' + field('Amount (blank for all that is left)', '<input name="amount" class="organizational-input" inputmode="decimal">')
        + field('Method', methodSelect()) + field('Reason *', '<input name="reason" class="organizational-input">', true), 'Save refund');
    }

    html += '<div class="organizational-membership-section">Terms</div><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Tier</th><th>From</th><th>To</th><th>Price</th><th>Paid</th><th>State</th></tr></thead><tbody>'
      + (d.terms.length ? d.terms.map((t) => '<tr><td>' + esc(t.tier_name || '—') + (t.extension_count ? ' <span class="organizational-hint">extended ' + t.extension_count + '×</span>' : '') + '</td><td>' + esc(t.starts_on) + '</td><td>' + esc(t.ends_on) + '</td><td>' + money(t.price_cents)
        + (t.contribution_cents ? '<div class="organizational-hint">' + money(t.contribution_cents) + ' contribution</div>' : '') + '</td><td>' + money(t.covered_cents) + '</td><td>'
        + esc(t.state === 'upcoming' ? 'Starts later' : (STATUS_LABELS[t.state] || t.state)) + (t.status_reason ? '<div class="organizational-hint">' + esc(t.status_reason) + '</div>' : '') + '</td></tr>').join('')
        : '<tr class="organizational-table-empty"><td colspan="6">No terms yet.</td></tr>')
      + '</tbody></table></div>';

    html += '<div class="organizational-membership-section">Payments</div><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Date</th><th>Kind</th><th>Amount</th><th>Details</th><th></th></tr></thead><tbody>'
      + (d.payments.length ? d.payments.map((p) => {
        const methodLabel = (METHODS.find(([v]) => v === p.method) || [null, p.method])[1];
        const details = [methodLabel, p.discount_cents ? 'discount ' + money(p.discount_cents) + ': ' + p.discount_reason : '', p.reason, p.notes,
          p.kind === 'waiver' ? (p.approved_at ? 'approved by ' + (p.approved_by || 'someone') : 'awaiting approval') : '',
          p.posting_status === 'posted' ? 'posted' : p.posting_status === 'void' ? 'void' : ''].filter(Boolean).map(esc).join(' · ');
        let btn = '';
        if (w && p.kind === 'payment' && p.posting_status !== 'void') btn = '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-refund="' + p.id + '">Refund</button>';
        if (w && p.kind === 'waiver' && !p.approved_at) btn = '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-approve="' + p.id + '">Approve</button>';
        return '<tr><td>' + esc(p.payment_date) + '</td><td>' + esc(KIND_LABELS[p.kind] || p.kind) + '</td><td>' + (p.kind === 'refund' ? '−' : '') + money(p.amount_cents) + '</td><td class="organizational-hint">' + details + '</td><td>' + btn + '</td></tr>';
      }).join('') : '<tr class="organizational-table-empty"><td colspan="5">No payments yet.</td></tr>')
      + '</tbody></table></div>';

    if (d.seats.length) {
      html += '<div class="organizational-membership-section">Seats</div><ul>' + d.seats.map((s) => '<li>' + esc(s.display_name) + (s.label ? ' (' + esc(s.label) + ')' : '') + ', from ' + esc(String(s.starts_on).slice(0, 10)) + (s.ends_on ? ' to ' + esc(String(s.ends_on).slice(0, 10)) : '') + '</li>').join('') + '</ul>';
    }

    html += '<div class="organizational-membership-section">History</div><div class="organizational-table-wrap"><table class="organizational-table"><tbody>'
      + (d.history.length ? d.history.map((hh) => '<tr><td style="white-space:nowrap;">' + esc(String(hh.occurred_at).slice(0, 10)) + '</td><td>' + esc(historyText(hh)) + '</td><td class="organizational-hint">' + esc(hh.by_email || '') + '</td></tr>').join('')
        : '<tr class="organizational-table-empty"><td>No changes yet.</td></tr>')
      + '</tbody></table></div>';
    return html;
  }

  function historyText(hh) {
    const what = hh.table_name === 'org_membership_terms' ? 'Term' : 'Payment';
    let t;
    const kind = hh.metadata && hh.metadata.kind;
    if (hh.action === 'create') t = kind === 'refund' ? 'Refund recorded' : kind === 'waiver' ? 'Waiver entered' : kind === 'payment' ? 'Payment recorded' : what + ' added';
    else if (hh.field_name === 'ends_on') t = 'Term extended from ' + hh.old_value + ' to ' + hh.new_value;
    else if (hh.field_name === 'status') t = 'Membership ended';
    else if (hh.field_name === 'approved') t = 'Waiver approved';
    else t = what + ' changed: ' + (hh.field_name || '');
    return t + (hh.metadata && hh.metadata.reason ? ' (' + hh.metadata.reason + ')' : '');
  }

  function formData(f) {
    const o = {};
    new FormData(f).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    f.querySelectorAll('input[type=checkbox]').forEach((cb) => { o[cb.name] = cb.checked; });
    Object.keys(o).forEach((k) => { if (o[k] === '') delete o[k]; });
    return o;
  }

  function wireRecord(d) {
    const cur = d.terms.find((t) => t.id === d.current_term_id) || null;
    const show = (id) => { panelBody.querySelectorAll('.organizational-membership-form').forEach((f) => { f.hidden = f.id !== id; }); };
    panelBody.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => show(b.dataset.open)));
    panelBody.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => show(null)));
    const submit = (id, fn) => {
      const f = $(id);
      if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        showPanelError('');
        const out = await fn(formData(f));
        if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not save. Try again.')); return; }
        await openRecord(d.dues_member.id);
        refreshLists();
      });
    };
    if (cur) {
      submit('f-pay', (b) => api('/terms/' + cur.id + '/payments', 'POST', b));
      submit('f-waive', (b) => api('/terms/' + cur.id + '/waivers', 'POST', b));
      submit('f-extend', (b) => api('/terms/' + cur.id + '/extend', 'POST', b));
      submit('f-end', (b) => api('/terms/' + cur.id + '/end', 'POST', b));
    }
    submit('f-term', (b) => api('/dues-members/' + d.dues_member.id + '/terms', 'POST', b));
    submit('f-refund', (b) => { const id = b.payment_id; delete b.payment_id; return api('/payments/' + id + '/refund', 'POST', b); });
    panelBody.querySelectorAll('[data-refund]').forEach((b) => b.addEventListener('click', () => {
      $('f-refund').querySelector('[name=payment_id]').value = b.dataset.refund;
      show('f-refund');
    }));
    panelBody.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', async () => {
      showPanelError('');
      const draft = await api('/terms/' + b.dataset.invoice + '/invoice-draft', 'POST', {});
      if (!draft || !draft.res.ok) { showPanelError(errorOf(draft, 'Could not prepare the invoice.')); return; }
      const inv = await window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/invoices', { method: 'POST', body: JSON.stringify(draft.data), skip403Redirect: true });
      if (!inv || !inv.res.ok) { showPanelError(errorOf(inv, 'Could not create the invoice. Creating invoices is for people who can enter transactions in Accounting.')); return; }
      const link = await api('/terms/' + b.dataset.invoice + '/invoice', 'POST', { invoice_id: inv.data.id });
      if (!link || !link.res.ok) { showPanelError(errorOf(link, 'The invoice was created but could not be linked.')); return; }
      await openRecord(d.dues_member.id);
    }));
    panelBody.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      const out = await api('/payments/' + b.dataset.approve + '/approve', 'POST', {});
      if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not approve.')); return; }
      await openRecord(d.dues_member.id);
      refreshLists();
    }));
  }

  function openAdd() {
    openId = null;
    showPanelError('');
    panelTitle.textContent = 'Add dues member';
    panelBody.innerHTML = '<form id="f-add" class="organizational-membership-form">'
      + '<div class="organizational-panel-fields">'
      + field('Person or organization', '<select name="kind" class="organizational-select"><option value="individual">Person</option><option value="organization">Organization</option></select>')
      + field('Name *', '<input name="display_name" class="organizational-input">')
      + field('Email', '<input name="email" type="email" class="organizational-input">')
      + field('Phone', '<input name="phone" class="organizational-input">')
      + field('Tier *', '<select name="tier_id" class="organizational-select">' + tierOptions() + '</select>')
      + field('Amount (pay-what-you-can tiers)', '<input name="price" class="organizational-input" inputmode="decimal">')
      + field('Start date', '<input name="starts_on" type="date" class="organizational-input" value="' + today() + '">')
      + field('Eligibility', '<span><input type="checkbox" name="eligibility_confirmed"> Confirmed, where the tier asks</span>')
      + '</div><p class="organizational-hint">An existing contact with the same email is offered instead of a new one.</p>'
      + '<button type="submit" class="organizational-btn organizational-btn-primary">Add</button></form>';
    const f = $('f-add');
    f.hidden = false;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      showPanelError('');
      const b = formData(f);
      const body = { tier_id: b.tier_id, price: b.price, starts_on: b.starts_on, eligibility_confirmed: !!b.eligibility_confirmed,
        contact: { kind: b.kind, display_name: b.display_name, email: b.email, phone: b.phone } };
      if (f.dataset.existing) { body.constituent_id = Number(f.dataset.existing); delete body.contact; }
      const out = await api('/dues-members', 'POST', body);
      if (out && out.res.status === 409 && out.data.constituent_id && !f.dataset.existing) {
        f.dataset.existing = out.data.constituent_id;
        showPanelError('A contact with that email already exists (' + out.data.display_name + '). Press Add again to use that contact.');
        return;
      }
      if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not add the dues member.')); return; }
      refreshLists();
      openRecord(out.data.constituent_id);
    });
    openPanel();
  }

  function refreshLists() {
    const active = document.querySelector('[data-membership-tab].active');
    if (active) showTab(active.dataset.membershipTab);
  }

  // --- Tiers ---

  async function loadTiersData() {
    const out = await api('/tiers?archived=true');
    tiers = (out && out.res.ok && out.data.tiers) || [];
    const opts = '<option value="">All tiers</option>' + tiers.map((t) => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('');
    ['membership-filter-tier', 'renewals-tier'].forEach((id) => { const keep = $(id).value; $(id).innerHTML = opts; $(id).value = keep; });
  }

  async function loadTiers() {
    await loadTiersData();
    const showArchived = $('tiers-show-archived').checked;
    const rows = tiers.filter((t) => showArchived || !t.archived_at);
    const tbody = $('membership-tiers-tbody');
    if (!rows.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No tiers yet.</td></tr>'; return; }
    const FOR = { individual: 'People', organization: 'Organizations', either: 'Either' };
    tbody.innerHTML = rows.map((t) => '<tr><td>' + esc(t.name) + (t.archived_at ? ' <span class="organizational-badge">Archived</span>' : '') + '</td><td>' + esc(FOR[t.applies_to] || '') + '</td><td>'
      + (t.pay_what_you_can ? 'From ' + money(t.min_price_cents || 0) + (t.suggested_price_cents != null ? ', suggested ' + money(t.suggested_price_cents) : '') : money(t.price_cents))
      + '</td><td>' + (t.seats_included || '') + '</td><td class="organizational-hint">' + esc((t.benefits || []).join(' · ')) + '</td><td>'
      + (access.canAdmin ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-tier="' + t.id + '">Edit</button>' : '') + '</td></tr>').join('');
    tbody.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => openTier(tiers.find((t) => String(t.id) === b.dataset.tier))));
  }

  function openTier(t) {
    showPanelError('');
    openId = null;
    const v = (k) => (t && t[k] != null ? esc(String(t[k])) : '');
    const c = (k) => (t && t[k] != null ? (Number(t[k]) / 100).toFixed(2) : '');
    panelTitle.textContent = t ? 'Tier: ' + t.name : 'New tier';
    panelBody.innerHTML = '<form id="f-tier"><div class="organizational-panel-fields">'
      + field('Name *', '<input name="name" class="organizational-input" value="' + v('name') + '">')
      + field('For', '<select name="applies_to" class="organizational-select">' + [['either', 'Either'], ['individual', 'People'], ['organization', 'Organizations']].map(([k, l]) => '<option value="' + k + '"' + (t && t.applies_to === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>')
      + (t ? field('Price now', '<span>' + money(t.price_cents) + '</span>') : field('Price *', '<input name="price" class="organizational-input" inputmode="decimal" placeholder="0 for a free tier">'))
      + field('Benefit value', '<input name="benefit_value" class="organizational-input" inputmode="decimal" value="' + c('benefit_value_cents') + '" placeholder="Blank means the whole price">')
      + field('Pay what you can', '<span><input type="checkbox" name="pay_what_you_can"' + (t && t.pay_what_you_can ? ' checked' : '') + '> Let people choose the amount</span>')
      + field('Lowest amount', '<input name="min_price" class="organizational-input" inputmode="decimal" value="' + c('min_price_cents') + '">')
      + field('Suggested amount', '<input name="suggested_price" class="organizational-input" inputmode="decimal" value="' + c('suggested_price_cents') + '">')
      + field('Seats included', '<input name="seats_included" type="number" min="0" class="organizational-input" value="' + (t ? t.seats_included : 0) + '">')
      + field('Annual budget from', '<input name="budget_low" class="organizational-input" inputmode="decimal" value="' + c('budget_low_cents') + '">')
      + field('Annual budget to', '<input name="budget_high" class="organizational-input" inputmode="decimal" value="' + c('budget_high_cents') + '">')
      + field('Benefits (one per line)', '<textarea name="benefits" class="organizational-input" rows="3">' + esc(((t && t.benefits) || []).join('\n')) + '</textarea>', true)
      + field('Description', '<textarea name="description" class="organizational-input" rows="2">' + v('description') + '</textarea>', true)
      + field('Eligibility statement', '<input name="eligibility_statement" class="organizational-input" value="' + v('eligibility_statement') + '">', true)
      + field('Eligibility tick', '<span><input type="checkbox" name="eligibility_required"' + (t && t.eligibility_required ? ' checked' : '') + '> People must tick the statement</span>')
      + '</div><button type="submit" class="organizational-btn organizational-btn-primary">Save tier</button></form>'
      + (t ? '<form id="f-price" class="organizational-membership-form" style="margin-top:16px;"><div class="organizational-membership-section" style="margin-top:0;">Change the price from a date</div><div class="organizational-panel-fields">'
        + field('New price *', '<input name="price" class="organizational-input" inputmode="decimal">') + field('From *', '<input name="effective_on" type="date" class="organizational-input">')
        + '</div><p class="organizational-hint">Terms already sold keep their price.</p><button type="submit" class="organizational-btn organizational-btn-primary organizational-btn-sm">Save price</button></form>'
        + '<p class="organizational-hint">Price history: ' + (t.prices || []).map((p) => esc(String(p.effective_on).slice(0, 10)) + ' ' + money(p.price_cents)).join(' · ') + '</p>'
        + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" id="tier-archive">' + (t.archived_at ? 'Restore tier' : 'Archive tier') + '</button>' : '');
    $('f-tier').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = formData($('f-tier'));
      ['benefit_value', 'min_price', 'suggested_price', 'budget_low', 'budget_high', 'description', 'eligibility_statement'].forEach((k) => { if (b[k] === undefined) b[k] = null; });
      b.benefits = String(b.benefits || '').split('\n');
      const out = t ? await api('/tiers/' + t.id, 'PATCH', b) : await api('/tiers', 'POST', b);
      if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not save the tier.')); return; }
      closePanel();
      loadTiers();
    });
    if (t) {
      $('f-price').hidden = false;
      $('f-price').addEventListener('submit', async (e) => {
        e.preventDefault();
        const out = await api('/tiers/' + t.id + '/prices', 'POST', formData($('f-price')));
        if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not save the price.')); return; }
        await loadTiersData();
        openTier(tiers.find((x) => x.id === t.id));
        loadTiers();
      });
      $('tier-archive').addEventListener('click', async () => {
        const out = await api('/tiers/' + t.id + '/' + (t.archived_at ? 'restore' : 'archive'), 'POST', {});
        if (!out || !out.res.ok) { showPanelError(errorOf(out, 'Could not change the tier.')); return; }
        closePanel();
        loadTiers();
      });
    }
    openPanel();
  }

  // --- Settings ---

  let settingsWired = false;
  async function loadSettings() {
    const f = $('membership-settings-form');
    const [s, acc, prog] = await Promise.all([api('/settings'), orgApi('/accounts'), orgApi('/programs')]);
    if (!s || !s.res.ok) { showError(errorOf(s, 'Could not load settings.')); return; }
    const accounts = ((acc && acc.res.ok && acc.data.accounts) || []).filter((a) => a.is_posting);
    const progData = (prog && prog.res.ok && prog.data) || {};
    const programs = progData.programs || (Array.isArray(progData) ? progData : []);
    f.querySelectorAll('[data-accounts]').forEach((sel) => {
      sel.innerHTML = '<option value="">Not set</option>' + accounts.filter((a) => a.type === sel.dataset.accounts)
        .map((a) => '<option value="' + a.id + '">' + esc(a.code ? a.code + ' ' + a.name : a.name) + '</option>').join('');
    });
    f.querySelectorAll('[data-programs]').forEach((sel) => {
      sel.innerHTML = '<option value="">Not set</option>' + programs.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
    });
    const st = s.data.settings;
    Array.from(f.elements).forEach((el) => {
      if (!el.name || !(el.name in st)) return;
      if (el.type === 'checkbox') el.checked = !!st[el.name];
      else el.value = st[el.name] == null ? '' : String(st[el.name]);
    });
    f.querySelectorAll('[data-form-field]').forEach((cb) => { cb.checked = (st.form_fields || []).includes(cb.dataset.formField); });
    const pubBase = location.origin + '/p/' + encodeURIComponent(slug);
    $('membership-public-links').innerHTML = 'Join form: <a href="' + esc(pubBase + '/join') + '" target="_blank" rel="noopener">' + esc(pubBase + '/join') + '</a><br>Dues members sign in at: <a href="' + esc(pubBase + '/account') + '" target="_blank" rel="noopener">' + esc(pubBase + '/account') + '</a>';
    const syncFixed = () => f.querySelectorAll('[data-fixed]').forEach((x) => { x.style.display = f.elements.year_mode.value === 'fixed' ? '' : 'none'; });
    syncFixed();
    Array.from(f.elements).forEach((el) => { el.disabled = !access.canAdmin; });
    loadPaymentAccount();
    if (settingsWired) return;
    settingsWired = true;
    $('membership-payment-account').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pf = $('membership-payment-account');
      const out = await api('/payment-account', 'PUT', { mode: pf.elements.mode.value, secret_key: pf.elements.secret_key.value.trim() || undefined, webhook_secret: pf.elements.webhook_secret.value.trim() || undefined });
      const msg = $('membership-payment-msg');
      msg.hidden = false;
      msg.textContent = out && out.res.ok ? 'Saved. The keys are stored encrypted and are not shown again.' : errorOf(out, 'Could not save the card payment account.');
      if (out && out.res.ok) { pf.elements.secret_key.value = ''; pf.elements.webhook_secret.value = ''; loadPaymentAccount(); }
    });
    f.elements.year_mode.addEventListener('change', syncFixed);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = {};
      b.form_fields = Array.from(f.querySelectorAll('[data-form-field]')).filter((cb) => cb.checked).map((cb) => cb.dataset.formField);
      Array.from(f.elements).forEach((el) => {
        if (!el.name) return;
        if (el.type === 'checkbox') b[el.name] = el.checked;
        else if (el.type === 'number') b[el.name] = Number(el.value);
        else if (/_id$/.test(el.name)) b[el.name] = el.value ? Number(el.value) : null;
        else b[el.name] = el.value;
      });
      const out = await api('/settings', 'PUT', b);
      const msg = $('membership-settings-msg');
      msg.hidden = false;
      msg.textContent = out && out.res.ok ? 'Saved.' : errorOf(out, 'Could not save settings.');
    });
  }

  async function loadPaymentAccount() {
    const pf = $('membership-payment-account');
    pf.hidden = !access.canAdmin;
    if (!access.canAdmin) return;
    const out = await api('/payment-account');
    if (!out || !out.res.ok) return;
    const acc = out.data.accounts || [];
    $('membership-payment-state').textContent = acc.length
      ? acc.map((a) => (a.mode === 'live' ? 'Live' : 'Test') + ': ' + (a.has_secret ? 'secret key saved' : 'no secret key') + ', ' + (a.has_webhook_secret ? 'webhook secret saved' : 'no webhook secret')).join(' · ')
      : 'No card payment account yet.';
    $('membership-webhook-url').textContent = 'Webhook address to enter in the provider: ' + out.data.webhook_url;
  }

  // --- Start ---

  async function init() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)/);
    slug = m ? decodeURIComponent(m[1]) : '';
    if (!slug) { showError('This page address is not valid.'); $('organizational-org-loading').hidden = true; return; }
    const [org, my] = await Promise.all([orgApi(''), orgApi('/my-access')]);
    const o = org && org.res.ok && org.data.org;
    if (o && window.OrganizationalSidebar && window.OrganizationalSidebar.setWorkspaceName) window.OrganizationalSidebar.setWorkspaceName(o.display_name || '—');
    if (o && window.OrganizationalHeader && window.OrganizationalHeader.setOrg) window.OrganizationalHeader.setOrg(o.display_name || '—');
    const a = (my && my.res.ok && my.data) || {};
    access = {
      canRead: !!(a.read && a.read.membership),
      canSummary: !!(a.read && a.read.membership_summary),
      canWrite: !!(a.write && a.write.membership),
      canAdmin: ['admin', 'finance', 'staff'].includes(a.role),
    };
    $('organizational-org-loading').hidden = true;
    if (!access.canSummary) { showError('Membership is for finance, admins, fundraising, board members and the Membership manager. Ask an admin if you need access.'); return; }
    $('organizational-org-dashboard').hidden = false;
    document.querySelectorAll('[data-membership-tab="members"], [data-membership-tab="renewals"]').forEach((b) => { b.hidden = !access.canRead; });
    document.querySelector('[data-membership-tab="settings"]').hidden = !access.canAdmin;
    $('membership-add').hidden = !access.canWrite;
    $('membership-export').hidden = !access.canAdmin;
    $('membership-tier-add').hidden = !access.canAdmin;

    document.querySelectorAll('[data-membership-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.membershipTab)));
    let t = null;
    $('membership-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadMembers, 300); });
    ['membership-filter-status', 'membership-filter-tier', 'membership-filter-kind'].forEach((id) => $(id).addEventListener('change', loadMembers));
    ['renewals-days', 'renewals-tier', 'renewals-contact'].forEach((id) => $(id).addEventListener('change', loadRenewals));
    $('tiers-show-archived').addEventListener('change', loadTiers);
    $('membership-add').addEventListener('click', openAdd);
    $('membership-tier-add').addEventListener('click', () => openTier(null));
    $('membership-panel-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

    await loadTiersData();
    let start = access.canRead ? 'members' : 'summary';
    try { const saved = sessionStorage.getItem('membership-tab'); if (saved && !document.querySelector('[data-membership-tab="' + saved + '"]').hidden) start = saved; } catch (e) { /* storage unavailable */ }
    showTab(start);
    const focus = Number.parseInt(new URLSearchParams(window.location.search).get('focus') || '', 10);
    if (access.canRead && Number.isInteger(focus) && focus > 0) openRecord(focus);
  }

  init().catch((e) => {
    $('organizational-org-loading').hidden = true;
    showError('Could not load membership.');
    console.error('Membership load error:', e);
  });
})();
