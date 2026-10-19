/* membership-pub.js: helpers shared by the public join and account pages. */
(function () {
  'use strict';
  const slug = decodeURIComponent((location.pathname.match(/^\/p\/([^/]+)\//) || [])[1] || '');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = (c) => { const n = Number(c) / 100; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // Takes a token from the URL fragment once, keeps it for this tab, and removes it from the address bar.
  function fragmentToken() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const t = hash.get('t');
    if (t) history.replaceState(null, '', location.pathname);
    return t || null;
  }

  async function call(path, opts, token) {
    const o = opts || {};
    const headers = { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Link-Token': token } : {}) };
    const res = await fetch('/api/public/' + encodeURIComponent(slug) + '/membership' + path, { method: o.method || 'GET', headers, body: o.body ? JSON.stringify(o.body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function formBody(form) {
    const b = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') b[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) b[el.name] = el.value; }
      else if (el.value.trim() !== '') b[el.name] = el.value.trim();
    });
    return b;
  }

  function tierLabel(t) {
    return t.pay_what_you_can
      ? 'Pay what you can' + (t.min_price_cents ? ', from ' + money(t.min_price_cents) : '') + (t.suggested_price_cents != null ? ', suggested ' + money(t.suggested_price_cents) : '')
      : (t.price_cents ? money(t.price_cents) + ' a year' : 'Free');
  }

  function tierChoices(tiers, kind, selected) {
    return tiers.filter((t) => t.applies_to === 'either' || t.applies_to === kind).map((t) =>
      '<label class="organizational-pub-inline" style="align-items:flex-start;"><input type="radio" name="tier_id" value="' + t.id + '"' + (String(t.id) === String(selected) ? ' checked' : '') + '>'
      + '<span><strong>' + esc(t.name) + '</strong> · ' + esc(tierLabel(t))
      + (t.description ? '<br><span class="organizational-hint">' + esc(t.description) + '</span>' : '')
      + (t.benefits && t.benefits.length ? '<br><span class="organizational-hint">' + t.benefits.map(esc).join(' · ') + '</span>' : '') + '</span></label>').join('')
      || '<p class="organizational-hint">No membership levels are open for this choice.</p>';
  }

  // Shows the amount box and eligibility tick that the chosen tier needs.
  function wireTierExtras(form, tiers, priceWrap, eligWrap, eligText) {
    const sync = () => {
      const picked = form.querySelector('input[name=tier_id]:checked');
      const t = picked && tiers.find((x) => String(x.id) === picked.value);
      priceWrap.hidden = !(t && t.pay_what_you_can);
      if (t && t.pay_what_you_can && !form.elements.price.value && t.suggested_price_cents != null) form.elements.price.value = (t.suggested_price_cents / 100).toFixed(2);
      eligWrap.hidden = !(t && t.eligibility_required);
      eligText.textContent = t && t.eligibility_statement ? t.eligibility_statement : '';
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'tier_id') sync(); });
    sync();
  }

  window.addEventListener('hashchange', () => { if (/[#&]t=/.test(location.hash)) location.reload(); });

  window.MembershipPub = { slug, esc, money, fragmentToken, call, formBody, tierChoices, wireTierExtras };
})();
