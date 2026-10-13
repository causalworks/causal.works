/* state-rules.js -- the facts that depend on the organization's state (set in Organization settings, Org basics).
   OrganizationalStateRules.load(slug) fetches them once; renderFringeHints() draws them under the personnel rates in Budget;
   renderAccountingCard() draws the State card in Accounting settings. Figures come from server/data/state-rules.js, each with
   its source and the date it was read. */
(function () {
  'use strict';
  const esc = window.escapeHtml || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  let cache = null;
  let cacheSlug = null;

  function load(slug) {
    if (cache && cacheSlug === slug) return cache;
    cacheSlug = slug;
    cache = fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/state-rules', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { error: true }; })
      .catch(function () { return { error: true }; });
    return cache;
  }
  function reload(slug) { cache = null; return load(slug); }

  function link(url, text) { return url ? ' <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || 'source') + '</a>' : ''; }
  function tag(conf, confirmWith) {
    if (conf === 'secondary') return ' <i>From a secondary source; confirm with ' + esc(confirmWith || 'the state') + '.</i>';
    if (conf === 'unconfirmed') return ' <i>Not confirmed.</i>';
    return '';
  }
  function usd(cents) { return '$' + (Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function setHref(slug) { return '/organizational/o/' + encodeURIComponent(slug) + '/settings/organization'; }

  function missingStateHtml(slug) {
    return 'Your state is not set. <a href="' + setHref(slug) + '">Set it in Organization settings</a> and your state\'s figures show here.';
  }
  function unsupportedHtml(d) {
    return 'We do not have figures for ' + esc(d.state) + ' yet. Federal rules apply; check your state\'s labor and revenue departments for state payroll and tax rules.';
  }

  function fringeHtml(d, slug) {
    const u = d.unemployment || {};
    const wc = d.workers_comp || {};
    let h = '<b>' + esc(d.state_name) + ', ' + esc(d.figure_year) + '</b> <span style="color:var(--text-secondary);">(read from the state\'s pages on ' + esc(d.verified_on) + '; the figures change each January)</span>';
    h += '<ul style="margin:6px 0 0;padding-left:18px;">';
    h += '<li><b>Unemployment (SUTA) wage base:</b> ' + usd(u.wage_base_cents) + ' per employee. <button type="button" class="organizational-btn organizational-btn-outline" id="organizational-fringe-use-wage-base" data-cents="' + esc(u.wage_base_cents) + '" style="font-size:0.75rem;padding:1px 8px;">Use this</button> <span id="organizational-fringe-wage-base-diff"></span>' + link(u.wage_base_source) + '</li>';
    if (u.rate_note) h += '<li><b>Unemployment rate:</b> ' + esc(u.rate_note) + link(u.rate_source) + '</li>';
    if (u.nonprofit_note) h += '<li><b>Nonprofit option:</b> ' + esc(u.nonprofit_note) + link(u.nonprofit_source) + '</li>';
    if (wc.note) h += '<li><b>Workers\' compensation:</b> ' + esc(wc.note) + link(wc.source) + tag(wc.confidence, wc.confirm_with) + '</li>';
    if (d.disability_pfl) h += '<li><b>Disability and Paid Family Leave:</b> ' + esc(d.disability_pfl.note) + link(d.disability_pfl.source) + '</li>';
    h += '</ul>';
    return h;
  }

  function renderFringeHints(el, form, slug) {
    if (!el) return;
    load(slug).then(function (d) {
      if (!d || d.error) { el.innerHTML = ''; return; }
      if (!d.state) { el.innerHTML = missingStateHtml(slug); return; }
      if (d.unsupported) { el.innerHTML = unsupportedHtml(d); return; }
      el.innerHTML = fringeHtml(d, slug);
      const input = form && form.querySelector('[name="suta_wage_base_cents"]');
      const btn = el.querySelector('#organizational-fringe-use-wage-base');
      const diff = el.querySelector('#organizational-fringe-wage-base-diff');
      const stateDollars = d.unemployment.wage_base_cents / 100;
      function refresh() {
        const cur = input && input.value !== '' ? Number(input.value) : null;
        if (diff) diff.textContent = cur == null ? 'Nothing entered yet.' : cur === stateDollars ? 'Matches your setting.' : 'Your setting is ' + usd(cur * 100) + '.';
        if (btn) btn.disabled = cur === stateDollars;
      }
      if (btn && input) {
        btn.addEventListener('click', function () { input.value = String(stateDollars); input.dispatchEvent(new Event('input', { bubbles: true })); refresh(); });
        input.addEventListener('input', refresh);
      }
      refresh();
    });
  }

  function renderAccountingCard(el, slug) {
    if (!el) return;
    load(slug).then(function (d) {
      if (!d || d.error) { el.innerHTML = 'The state notes could not be loaded.'; return; }
      if (!d.state) { el.innerHTML = missingStateHtml(slug); return; }
      if (d.unsupported) { el.innerHTML = unsupportedHtml(d); return; }
      const f = d.form_1099 || {}; const s = d.sales_tax || {};
      let h = '<p style="margin:0 0 8px;"><b>' + esc(d.state_name) + '</b> <span class="organizational-hint">(from the state\'s pages, read ' + esc(d.verified_on) + '; <a href="' + setHref(slug) + '">change your state</a>)</span></p>';
      h += '<p class="organizational-hint" style="margin:0 0 8px;"><b>1099 forms.</b> ' + esc(f.note) + link(f.source) + tag(f.confidence, 'the state') + '</p>';
      h += '<p class="organizational-hint" style="margin:0 0 8px;"><b>Sales and use tax.</b> ' + esc(s.note) + link(s.source) + tag(s.confidence, 'the state') + '</p>';
      h += '<p class="organizational-hint" style="margin:0;"><b>Payroll.</b> The state\'s unemployment wage base, workers\' compensation and disability notes are in Budget, Personnel, Fringe Benefit Settings.</p>';
      el.innerHTML = h;
    });
  }

  window.OrganizationalStateRules = { load: load, reload: reload, renderFringeHints: renderFringeHints, renderAccountingCard: renderAccountingCard };
})();
