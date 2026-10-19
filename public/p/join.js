/* join.js: the public membership join form, and the confirmation step when opened from the emailed link. */
(function () {
  'use strict';
  const { slug, money, fragmentToken, call, formBody, tierChoices, wireTierExtras } = window.MembershipPub;
  const $ = (id) => document.getElementById(id);
  const form = $('pub-join');
  let data = null;
  $('pub-account-link').href = '/p/' + encodeURIComponent(slug) + '/account';

  function fail(msg) { $('pub-error').textContent = msg; $('pub-error').hidden = false; }
  function done(title, text, note) {
    $('pub-title').textContent = title;
    $('pub-done-text').textContent = text;
    $('pub-done-note').textContent = note || '';
    $('pub-done').hidden = false;
    form.hidden = true;
  }

  async function confirm(token) {
    $('pub-title').textContent = 'Confirming…';
    const out = await call('/join/confirm', { method: 'POST' }, token);
    if (out.data.workspace_name) $('pub-org').textContent = out.data.workspace_name;
    if (!out.ok) { $('pub-title').textContent = 'Join'; fail(out.data.error || 'This link is not working. Fill in the form again.'); return; }
    if (out.data.status === 'awaiting_approval') { done('Email confirmed', out.data.message); return; }
    done('Welcome', 'Your membership runs from ' + out.data.starts_on + ' to ' + out.data.ends_on + (out.data.price_cents ? ', for ' + money(out.data.price_cents) + '.' : '.'), out.data.payment_note);
  }

  function renderTiers() {
    const kind = form.elements.kind.value;
    const picked = form.querySelector('input[name=tier_id]:checked');
    $('pub-tiers').innerHTML = tierChoices(data.tiers, kind, picked && picked.value);
    form.querySelectorAll('[data-for]').forEach((d) => { d.hidden = d.dataset.for !== kind; });
  }

  async function load() {
    const token = fragmentToken();
    if (token) return confirm(token);
    const out = await call('/join');
    if (!out.ok) { $('pub-title').textContent = 'Join'; fail(out.data.error || 'This page is not available.'); return; }
    data = out.data;
    document.title = 'Join ' + data.workspace_name;
    $('pub-org').textContent = data.workspace_name;
    $('pub-title').textContent = 'Join ' + data.workspace_name;
    form.querySelectorAll('[data-field]').forEach((el) => { el.hidden = !data.fields.includes(el.dataset.field); });
    $('pub-gift-wrap').hidden = !data.extra_gift;
    $('pub-pay-note').textContent = data.payment_note;
    renderTiers();
    wireTierExtras(form, data.tiers, $('pub-price-wrap'), $('pub-elig-wrap'), $('pub-elig-text'));
    form.elements.kind.addEventListener('change', renderTiers);
    form.elements.annual_budget.addEventListener('input', () => {
      const cents = Math.round(Number(String(form.elements.annual_budget.value).replace(/[$,\s]/g, '')) * 100);
      const t = Number.isFinite(cents) && data.tiers.find((x) => x.applies_to !== 'individual' && (x.budget_low_cents != null || x.budget_high_cents != null)
        && (x.budget_low_cents == null || cents >= x.budget_low_cents) && (x.budget_high_cents == null || cents <= x.budget_high_cents));
      $('pub-budget-hint').textContent = t ? 'Suggested level for this budget: ' + t.name : '';
      if (t) { const r = form.querySelector('input[name=tier_id][value="' + t.id + '"]'); if (r && !form.querySelector('input[name=tier_id]:checked')) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
    });
    form.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('[data-msg]');
    msg.textContent = 'Sending…';
    const out = await call('/join', { method: 'POST', body: { ...formBody(form), form_token: data.form_token } });
    if (!out.ok) { msg.textContent = out.data.error || 'That did not go through. Try again.'; return; }
    done('Check your email', out.data.message, 'If nothing arrives in a few minutes, check your spam folder or fill in the form again.');
  });

  load().catch(() => fail('Something went wrong. Reload the page and try again.'));
})();
