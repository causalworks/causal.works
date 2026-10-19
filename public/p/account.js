/* account.js: a dues member's own page. Sign in by emailed link, then see the membership and receipts, update details, renew. */
(function () {
  'use strict';
  const { slug, esc, money, fragmentToken, call, formBody, tierChoices, wireTierExtras } = window.MembershipPub;
  const $ = (id) => document.getElementById(id);
  const KEY = 'membership-session:' + slug;
  const STATUS = { active: 'Active', pending: 'Waiting for payment', grace: 'Ended recently; renew to keep your membership', lapsed: 'Lapsed', ended: 'Ended' };
  const METHODS = { check: 'check', transfer: 'bank transfer', card: 'card', cash: 'cash', other: 'other' };
  let session = null;
  let formToken = '';
  let wired = false;
  try { session = sessionStorage.getItem(KEY); } catch (e) { /* storage off */ }

  function fail(msg) { $('pub-error').textContent = msg; $('pub-error').hidden = !msg; }
  function keep(t) { session = t; try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) { /* storage off */ } }

  async function showSignIn(message) {
    keep(null);
    $('pub-body').hidden = true;
    const out = await call('/sign-in');
    if (!out.ok) { fail(out.data.error || 'This page is not available.'); return; }
    $('pub-org').textContent = out.data.workspace_name;
    formToken = out.data.form_token;
    $('pub-signin').hidden = false;
    if (message) fail(message);
  }

  async function load() {
    const out = await call('/me', {}, session);
    if (!out.ok) { await showSignIn(session ? 'Your sign-in has ended. Ask for a new link.' : ''); return; }
    const d = out.data;
    fail('');
    formToken = d.form_token;
    $('pub-org').textContent = d.workspace_name;
    $('pub-title').textContent = d.contact.display_name;
    const t = d.current_term;
    $('pub-status').innerHTML = '<strong>' + esc(STATUS[d.status] || 'No membership yet') + '</strong>'
      + (t ? '<br>' + esc(t.tier_name || '') + ', ' + esc(t.starts_on) + ' to ' + esc(t.ends_on) + (t.owed_cents ? ' · ' + money(t.owed_cents) + ' to pay' : '') : '');
    $('pub-renewal-note').textContent = d.renewal
      ? 'Your renewal from ' + d.renewal.starts_on + ' is on file' + (d.renewal.owed_cents ? '; ' + money(d.renewal.owed_cents) + ' to pay. ' + d.payment_note : '.')
      : (!d.renewal_open && d.renewal_opens_on ? 'You can renew from ' + d.renewal_opens_on + '.' : '');
    const renew = $('pub-renew');
    renew.hidden = !d.renewal_open;
    $('pub-tiers').innerHTML = tierChoices(d.tiers, d.contact.kind, t && t.tier_id);
    $('pub-pay-note').textContent = d.payment_note;
    if (!wired) wireTierExtras(renew, d.tiers, $('pub-price-wrap'), $('pub-elig-wrap'), $('pub-elig-text'));
    const f = $('pub-details');
    f.querySelectorAll('[data-for]').forEach((x) => { x.hidden = x.dataset.for !== d.contact.kind; x.querySelectorAll('input').forEach((i) => { i.disabled = x.hidden; }); });
    ['first_name', 'last_name', 'display_name', 'phone', 'mailing_address'].forEach((k) => { if (f.elements[k]) f.elements[k].value = d.contact[k] || ''; });
    f.elements.email_shown.value = d.contact.email || '';
    $('pub-receipts').innerHTML = d.receipts.length
      ? d.receipts.map((r) => '<li>' + esc(r.date) + ' · ' + (r.kind === 'refund' ? 'Refund ' : 'Payment ') + money(r.amount_cents) + (r.method ? ' by ' + esc(METHODS[r.method] || r.method) : '') + '</li>').join('')
      : '<li class="organizational-hint">No payments yet.</li>';
    if (d.seat) {
      $('pub-status').innerHTML += '<br>Seat on ' + esc(d.seat.holder_name) + '\'s ' + esc(d.seat.tier_name || '') + ' membership, until ' + esc(d.seat.ends_on);
      if (!d.status) $('pub-status').querySelector('strong').textContent = 'Active through a seat';
    }
    $('pub-benefits-card').hidden = !(d.benefits && d.benefits.length) || !(d.status === 'active' || d.seat);
    $('pub-benefits').innerHTML = (d.benefits || []).map((b) => '<li>' + esc(b) + '</li>').join('');
    $('pub-docs-card').hidden = !d.documents.length;
    $('pub-docs').innerHTML = d.documents.map((x) => '<li><a href="#" data-doc="' + x.id + '">' + esc(x.title) + '</a>' + (x.description ? ' <span class="organizational-hint">' + esc(x.description) + '</span>' : '') + '</li>').join('');
    $('pub-docs').querySelectorAll('[data-doc]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); download(a.dataset.doc, a.textContent); }));
    const dir = $('pub-dir');
    dir.hidden = !d.directory;
    if (d.directory) {
      const labels = { name: 'Name', tier: 'Tier', kind: 'Person or organization', website: 'Website', mailing_address: 'Address', email: 'Email', phone: 'Phone' };
      dir.elements.listed.checked = d.directory.mine.listed;
      dir.elements.visibility.value = d.directory.mine.visibility;
      $('pub-dir-fields').innerHTML = d.directory.allowed.filter((f) => f !== 'name').map((f) => '<label class="organizational-pub-inline"><input type="checkbox" data-field="' + f + '"' + (d.directory.mine.fields.includes(f) ? ' checked' : '') + '> Show my ' + esc(labels[f].toLowerCase()) + '</label>').join('');
      $('pub-dir-view').hidden = !d.directory.open;
    }
    const owedNow = t && t.owed_cents ? 'current' : (d.renewal && d.renewal.owed_cents ? 'renewal' : null);
    $('pub-pay').hidden = !(d.card_payments && owedNow);
    $('pub-pay').dataset.which = owedNow || '';
    $('pub-pay').querySelector('[data-plan="monthly"]').hidden = !d.monthly_offered;
    $('pub-card').hidden = !(d.card_payments && d.can_update_card);
    $('pub-signin').hidden = true;
    $('pub-body').hidden = false;
    wired = true;
  }

  async function submit(form, path) {
    const msg = form.querySelector('[data-msg]');
    msg.textContent = 'Sending…';
    const out = await call(path, { method: 'POST', body: { ...formBody(form), form_token: formToken } }, session);
    if (out.status === 401) { await showSignIn('Your sign-in has ended. Ask for a new link.'); return null; }
    msg.textContent = out.ok ? 'Saved.' : (out.data.error || 'That did not go through. Try again.');
    return out;
  }

  $('pub-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = e.target.querySelector('[data-msg]');
    msg.textContent = 'Sending…';
    const out = await call('/sign-in', { method: 'POST', body: { ...formBody(e.target), form_token: formToken } });
    msg.textContent = out.ok ? out.data.message : (out.data.error || 'That did not go through. Try again.');
  });
  $('pub-details').addEventListener('submit', async (e) => { e.preventDefault(); const out = await submit(e.target, '/me/details'); if (out && out.ok) load(); });
  $('pub-renew').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = await submit(e.target, '/me/renew');
    if (out && out.ok) { await load(); $('pub-renewal-note').textContent = 'Renewed: ' + out.data.starts_on + ' to ' + out.data.ends_on + '. ' + (out.data.payment_note || ''); }
  });

  async function download(id, name) {
    const res = await fetch('/api/public/' + encodeURIComponent(slug) + '/membership/me/documents/' + id, { headers: { 'X-Link-Token': session || '' } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); window.alert(d.error || 'The document could not be opened.'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('pub-dir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const fields = Array.from(f.querySelectorAll('[data-field]')).filter((x) => x.checked).map((x) => x.dataset.field);
    const msg = f.querySelector('[data-msg]');
    const out = await call('/me/directory', { method: 'POST', body: { listed: f.elements.listed.checked, fields, visibility: f.elements.visibility.value, website: f.elements.website.value, form_token: formToken } }, session);
    msg.textContent = out.ok ? (out.data.directory.listed ? 'Saved. You are listed.' : 'Saved. You are not listed.') : (out.data.error || 'That did not go through.');
  });
  $('pub-dir-view').addEventListener('click', async () => {
    const out = await call('/me/directory', {}, session);
    $('pub-dir-list').innerHTML = out.ok ? (out.data.entries.length ? out.data.entries.map((x) => '<li><strong>' + esc(x.name) + '</strong>'
      + ['tier', 'kind', 'website', 'mailing_address', 'email', 'phone'].filter((k) => x[k]).map((k) => ' · ' + esc(x[k])).join('') + '</li>').join('') : '<li class="organizational-hint">No one is listed yet.</li>')
      : '<li class="organizational-hint">' + esc(out.data.error || 'The directory could not be loaded.') + '</li>';
  });

  async function goTo(path, body) {
    $('pub-pay-msg').textContent = 'Opening the payment page…';
    const out = await call(path, { method: 'POST', body: body || {} }, session);
    if (out.status === 401) { await showSignIn('Your sign-in has ended. Ask for a new link.'); return; }
    if (!out.ok) { $('pub-pay-msg').textContent = out.data.error || 'That did not work. Try again later.'; return; }
    window.location.href = out.data.url;
  }
  $('pub-pay').querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => goTo('/me/checkout', { plan: b.dataset.plan, which: $('pub-pay').dataset.which })));
  $('pub-card').addEventListener('click', () => goTo('/me/card'));

  async function start() {
    const paid = /(^|[#&])paid=1/.test(location.hash);
    if (paid) history.replaceState(null, '', location.pathname);
    const token = fragmentToken();
    if (token) {
      const out = await call('/session', { method: 'POST' }, token);
      if (!out.ok) { await showSignIn(out.data.error || 'This link is not working. Ask for a new one.'); return; }
      keep(out.data.session);
    }
    if (!session) { await showSignIn(''); return; }
    await load();
    if (paid) $('pub-pay-msg').textContent = 'Thank you. Your payment shows here once the payment provider confirms it, usually within a minute.';
  }

  start().catch(() => fail('Something went wrong. Reload the page and try again.'));
})();
