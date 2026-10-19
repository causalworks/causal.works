/* sponsor-fund.js — a sponsored project's fund on the project page: balance parts, the fee line, the tie-out with the books,
   fee rule changes (amendments once the agreement is signed), fee exemptions on gifts; and the sponsorship settings section.
   OrganizationalSponsorFund.renderBalance(el, { slug, projectId, canMoney, parts: ['balance', 'fee'] })
   OrganizationalSponsorFund.renderSettings(el, { slug, canMoney }) */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const money = (c) => window.formatMoneyCents(Number(c) || 0);
  const dollarsToCents = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100));
  const centsToDollars = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2));

  // One date format for every Sponsorship screen: "Oct 19, 2026".
  function day(iso) {
    if (!iso) return '';
    const str = String(iso);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T00:00:00' : str);
    if (Number.isNaN(d.getTime())) return str;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function api(slug, path, opts) {
    return apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + path, opts || { method: 'GET' });
  }

  function ruleText(r) {
    if (!r) return 'No fee rule yet';
    let t;
    if (r.kind === 'flat') t = money(r.flat_cents) + ' a quarter';
    else if (r.kind === 'tiered') {
      t = 'Tiered: ' + (r.tiers || []).map((x) => x.rate + '%' + (x.up_to_cents != null ? ' up to ' + money(x.up_to_cents) : ' above that')).join(', ') + ' (yearly totals)';
    } else t = r.rate + '% of money received';
    if (r.minimum_quarter_cents) t += ', minimum ' + money(r.minimum_quarter_cents) + ' a quarter';
    return t + ', from ' + day(r.effective_from);
  }

  function row(label, value, extra) {
    return '<tr><th scope="row">' + esc(label) + '</th><td class="organizational-sp-fund-amount">' + value + '</td><td class="organizational-hint">' + (extra || '') + '</td></tr>';
  }

  async function renderBalance(el, ctx) {
    if (!el) return;
    el.innerHTML = '<p class="organizational-hint" style="margin:0;"><em>Loading…</em></p>';
    const [bal, rules, track] = await Promise.all([
      api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/balance'),
      api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/fee-rules'),
      api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/tracking'),
    ]);
    if (!bal || !bal.res.ok) {
      el.innerHTML = '<p class="organizational-error" style="margin:0;">' + esc((bal && bal.data && bal.data.error) || 'Could not load the balance.') + '</p>';
      return;
    }
    const b = bal.data.balance;
    const t = b.tie_out;
    const ruleList = (rules && rules.res.ok && rules.data.rules) || [];
    const today = new Date().toISOString().slice(0, 10);
    const current = ruleList.filter((r) => r.effective_from <= today).pop() || ruleList[ruleList.length - 1] || null;
    const locked = !!(rules && rules.res.ok && rules.data.locked);
    const gifts = (track && track.res.ok && track.data.gifts) || [];

    const parts = ctx.parts || ['balance', 'fee'];
    const show = (k) => parts.indexOf(k) !== -1;
    el.innerHTML = (!show('balance') ? '' :
      '<table class="organizational-sp-fund-table"><tbody>' +
        row('Received, in the books', money(b.received_posted_cents)) +
        (b.received_unposted_cents ? row('Received, not yet in the books', money(b.received_unposted_cents), 'not counted as available until posted') : '') +
        row('Fees', money(Math.max(b.fees_accrued_cents, b.fees_posted_cents)), b.fees_unposted_cents ? money(b.fees_posted_cents) + ' posted, ' + money(b.fees_unposted_cents) + ' waiting for the fee run' : 'all posted') +
        row('Paid out', money(b.disbursed_posted_cents)) +
        (b.other_spending_cents ? row('Other spending in the books', money(b.other_spending_cents), 'bills and costs coded to the project\'s program') : '') +
        (b.pending_cents ? row('Committed, not yet paid', money(b.pending_cents), 'approved or waiting for approval') : '') +
        '<tr class="organizational-sp-fund-total"><th scope="row">Available</th><td class="organizational-sp-fund-amount' + (b.negative ? ' organizational-sp-fund-negative' : '') + '">' + money(b.available_cents) + '</td><td>' +
          (b.negative ? '<span class="organizational-sp-fund-flag">Negative</span>' : '') + '</td></tr>' +
      '</tbody></table>' +
      '<p class="organizational-hint organizational-sp-fund-tieout">' +
        (t.ledger_net_cents == null ? esc(t.explanation || '') :
          'Books, project program: ' + money(t.ledger_net_cents) + ' · expected ' + money(t.expected_cents) +
          (t.difference_cents ? ' · difference ' + money(t.difference_cents) : '') + '. ' + esc(t.explanation || '')) + '</p>') +
      (!show('fee') ? '' :
      '<p style="margin:8px 0 0;">Fee: ' + esc(ruleText(current)) +
        (locked ? ' <span class="organizational-hint">(agreement signed ' + esc(day(rules.data.agreement_signed_at)) + '; changes are amendments)</span>' : '') +
        (ctx.canMoney ? ' · <a href="#" class="organizational-sp-fee-change">Change</a>' : '') +
        (gifts.length && ctx.canMoney ? ' · <a href="#" class="organizational-sp-fee-exempt-link">Fee exemptions</a>' : '') +
        (ruleList.length > 1 ? ' · <a href="#" class="organizational-sp-fee-history-link">Fee history</a>' : '') + '</p>' +
      (ruleList.length > 1 ? '<ul class="organizational-sp-fund-list organizational-sp-fee-history" hidden>' +
        ruleList.map((r) => '<li>' + esc(ruleText(r)) + (r.amendment_reason ? ' · ' + esc(r.amendment_reason) : '') + '</li>').join('') + '</ul>' : '') +
      '<div class="organizational-sp-fee-form" hidden></div>' +
      '<div class="organizational-sp-fee-exempt" hidden></div>');

    const changeLink = el.querySelector('.organizational-sp-fee-change');
    if (changeLink) changeLink.addEventListener('click', (e) => { e.preventDefault(); openFeeForm(el, ctx, current, locked); });
    const histLink = el.querySelector('.organizational-sp-fee-history-link');
    if (histLink) histLink.addEventListener('click', (e) => { e.preventDefault(); const h = el.querySelector('.organizational-sp-fee-history'); h.hidden = !h.hidden; });
    const exLink = el.querySelector('.organizational-sp-fee-exempt-link');
    if (exLink) exLink.addEventListener('click', (e) => { e.preventDefault(); openExemptions(el, ctx, gifts); });
  }

  async function openFeeForm(el, ctx, current, locked) {
    const box = el.querySelector('.organizational-sp-fee-form');
    box.hidden = false;
    let docOpts = '';
    if (locked) {
      const docs = await api(ctx.slug, '/documents?sponsored_project_id=' + encodeURIComponent(ctx.projectId));
      const list = (docs && docs.res.ok && docs.data.documents) || [];
      docOpts = '<option value="">Choose the signed amendment</option>' + list.map((d) => '<option value="' + d.id + '">' + esc(d.title) + '</option>').join('');
    }
    const c = current || { kind: 'percent', rate: 6, minimum_quarter_cents: 0 };
    const tiersText = (c.tiers || []).map((x) => (x.up_to_cents != null ? centsToDollars(x.up_to_cents) : '') + ' : ' + x.rate).join('\n');
    box.innerHTML =
      '<div class="organizational-sp-fund-form">' +
        '<label>Fee type <select class="organizational-select" data-f="kind">' +
          ['percent', 'flat', 'tiered'].map((k) => '<option value="' + k + '"' + (c.kind === k ? ' selected' : '') + '>' + ({ percent: 'Percent of money received', flat: 'Flat amount a quarter', tiered: 'Tiered percent' })[k] + '</option>').join('') + '</select></label>' +
        '<label data-k="percent">Percent <input class="organizational-input" type="number" min="0" step="0.01" data-f="rate" value="' + (c.rate != null ? c.rate : 6) + '"></label>' +
        '<label data-k="flat">Amount a quarter <input class="organizational-input" type="number" min="0" step="0.01" data-f="flat" value="' + centsToDollars(c.flat_cents) + '"></label>' +
        '<label data-k="tiered">Tiers, one per line: yearly amount up to : percent (leave the amount empty on the last line) <textarea class="organizational-input" rows="3" data-f="tiers">' + esc(tiersText) + '</textarea></label>' +
        '<label>Minimum a quarter <input class="organizational-input" type="number" min="0" step="0.01" data-f="minimum" value="' + centsToDollars(c.minimum_quarter_cents) + '"></label>' +
        '<label>Takes effect' + (locked ? ' *' : '') + ' <input class="organizational-input" type="date" data-f="effective" value="' + (locked ? '' : esc(c.effective_from || '')) + '"></label>' +
        (locked ? '<label>Signed amendment * <select class="organizational-select" data-f="doc">' + docOpts + '</select></label>' +
          '<label>Reason * <input class="organizational-input" type="text" maxlength="500" data-f="reason"></label>' : '') +
        '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-a="save">Save</button>' +
        '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-a="cancel">Cancel</button>' +
        '<span class="organizational-error" data-a="err"></span></div>' +
      '</div>';
    const f = (n) => box.querySelector('[data-f="' + n + '"]');
    const showKind = () => box.querySelectorAll('[data-k]').forEach((x) => { x.hidden = x.getAttribute('data-k') !== f('kind').value; });
    f('kind').addEventListener('change', showKind);
    showKind();
    box.querySelector('[data-a="cancel"]').addEventListener('click', () => { box.hidden = true; });
    box.querySelector('[data-a="save"]').addEventListener('click', async () => {
      const err = box.querySelector('[data-a="err"]');
      err.textContent = '';
      const kind = f('kind').value;
      const body = { kind, minimum_quarter_cents: dollarsToCents(f('minimum').value) || 0 };
      if (kind === 'percent') body.rate = f('rate').value;
      if (kind === 'flat') body.flat_cents = dollarsToCents(f('flat').value);
      if (kind === 'tiered') {
        body.tiers = f('tiers').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [up, rate] = l.split(':').map((x) => x.trim());
          return { up_to_cents: up ? dollarsToCents(up) : null, rate };
        });
      }
      if (f('effective').value) body.effective_from = f('effective').value;
      if (locked) { body.amendment_document_id = f('doc').value || null; body.reason = f('reason').value; }
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/fee-rules', { method: 'POST', body: JSON.stringify(body) });
      if (!out || !out.res.ok) { err.textContent = (out && out.data && out.data.error) || 'Could not save the fee.'; return; }
      renderBalance(el, ctx);
    });
  }

  function openExemptions(el, ctx, gifts) {
    const box = el.querySelector('.organizational-sp-fee-exempt');
    box.hidden = false;
    box.innerHTML = '<p class="organizational-hint" style="margin:8px 0 4px;">Tick a gift whose funder caps overhead. It still counts as money received.</p>' +
      '<ul class="organizational-sp-fund-list">' + gifts.map((g) => '<li><label><input type="checkbox" data-gift="' + g.id + '"' + (g.sponsor_fee_exempt ? ' checked' : '') + '> ' +
        esc(day(g.received_at)) + ' · ' + money(g.amount_cents) + (g.sponsor_fee_exempt_reason ? ' <span class="organizational-hint">' + esc(g.sponsor_fee_exempt_reason) + '</span>' : '') + '</label></li>').join('') + '</ul>';
    box.querySelectorAll('input[data-gift]').forEach((cb) => cb.addEventListener('change', async () => {
      const reason = window.prompt(cb.checked ? 'Why is this gift exempt from the fee? (required)' : 'Why is the exemption being removed? (required)');
      if (!reason || !reason.trim()) { cb.checked = !cb.checked; return; }
      const out = await api(ctx.slug, '/sponsored-projects/' + ctx.projectId + '/gifts/' + cb.getAttribute('data-gift') + '/fee-exempt', {
        method: 'PATCH', body: JSON.stringify({ exempt: cb.checked, reason }),
      });
      if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'Could not save.'); cb.checked = !cb.checked; return; }
      renderBalance(el, ctx);
    }));
  }

  async function renderSettings(el, ctx) {
    if (!el) return;
    const [s, acc, prog] = await Promise.all([
      api(ctx.slug, '/sponsor-settings'),
      ctx.canMoney ? api(ctx.slug, '/accounts') : null,
      ctx.canMoney ? api(ctx.slug, '/programs') : null,
    ]);
    if (!s || !s.res.ok) { el.innerHTML = '<p class="organizational-error" style="margin:0;">' + esc((s && s.data && s.data.error) || 'Could not load sponsorship settings.') + '</p>'; return; }
    const v = s.data.settings;
    const accounts = ((acc && acc.res.ok && acc.data.accounts) || []).filter((a) => a.is_posting);
    const programs = (prog && prog.res.ok && (prog.data.programs || prog.data)) || [];
    const off = ctx.canMoney ? '' : ' disabled';
    const missing = (key, need) => (!v[key] && need ? '<span class="organizational-sp-set-missing">Not set. ' + esc(need) + '</span>' : '');
    const acctSel = (key, type, label, need, hint) => '<label class="organizational-label">' + esc(label) + (need ? ' *' : '') +
      '<select class="organizational-select" data-s="' + key + '"' + off + '><option value="">Choose an account</option>' +
      accounts.filter((a) => a.type === type).map((a) => '<option value="' + a.id + '"' + (Number(v[key]) === Number(a.id) ? ' selected' : '') + '>' + esc((a.code ? a.code + ' ' : '') + a.name) + '</option>').join('') + '</select>' +
      missing(key, need) + (hint ? '<span class="organizational-hint">' + esc(hint) + '</span>' : '') + '</label>';
    const progSel = '<label class="organizational-label">Program for fee income *<select class="organizational-select" data-s="fee_income_program_id"' + off + '><option value="">Choose a program</option>' +
      (Array.isArray(programs) ? programs : []).map((p) => '<option value="' + p.id + '"' + (Number(v.fee_income_program_id) === Number(p.id) ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
      missing('fee_income_program_id', 'The fee run needs it.') + '</label>';
    const num = (key, label, dollars, attrs, hint) => '<label class="organizational-label">' + esc(label) +
      '<input class="organizational-input" type="number" data-s="' + key + '"' + (dollars ? ' step="0.01" data-dollars="1"' : '') + ' ' + (attrs || '') +
      ' value="' + (dollars ? centsToDollars(v[key]) : v[key]) + '"' + off + '>' + (hint ? '<span class="organizational-hint">' + esc(hint) + '</span>' : '') + '</label>';
    const years = Object.keys(v.information_return_thresholds || {}).sort();
    const group = (title, body) => '<h2 class="organizational-subheading">' + esc(title) + '</h2><section class="organizational-card organizational-sp-settings-card"><div class="organizational-panel-fields">' + body + '</div></section>';
    el.innerHTML =
      (ctx.canMoney ? '' : '<p class="organizational-hint organizational-sp-intro">Changed by ' + esc(ctx.who || 'finance and admins') + '.</p>') +
      group('Fee accounts',
        acctSel('fee_income_account_id', 'income', 'Fee income account', 'The fee run needs it.') +
        acctSel('fee_expense_account_id', 'expense', 'Fee charged to projects (expense)', 'The fee run needs it.') +
        progSel +
        num('default_fee_minimum_cents', 'Default minimum fee a quarter', true, 'min="0"') +
        acctSel('recall_expense_account_id', 'expense', 'Recalled funds charged to', null, 'Optional. The fee expense account is used if empty.') +
        acctSel('recall_income_account_id', 'income', 'Recalled funds credited to', null, 'Optional. The fee income account is used if empty.')) +
      group('Approval thresholds',
        num('second_approval_threshold_cents', 'Second approval needed above', true, 'min="0"', 'A different person approves payments above this.') +
        num('donor_letter_threshold_cents', 'Donor letter needed above', true, 'min="0"', 'For checks, bank transfers and wires to a project.')) +
      group('Holds and reports',
        num('overdue_report_hold_days', 'Hold a project when its report is overdue by (days)', false, 'min="0"')) +
      group('Statements',
        num('statement_day_of_month', 'Statement day of the month', false, 'min="1" max="28"', 'Monthly statements are made on this day.')) +
      group('Tax thresholds',
        '<label class="organizational-label">Information-return threshold, ' + esc(years.length ? years[years.length - 1] : String(new Date().getFullYear())) +
          '<input class="organizational-input" type="number" step="0.01" min="0" data-s="ir" value="' + centsToDollars(years.length ? v.information_return_thresholds[years[years.length - 1]] : 200000) + '"' + off + '>' +
          '<span class="organizational-hint">Check it against the IRS instructions each year.</span></label>') +
      (ctx.canMoney ? '<div class="organizational-sp-settings-actions"><span class="organizational-hint" data-a="msg">' + (ctx.saved ? 'Saved.' : '') + '</span><button type="button" class="organizational-btn" data-a="save">Save settings</button></div>' : '');
    const save = el.querySelector('[data-a="save"]');
    if (!save) return;
    save.addEventListener('click', async () => {
      const body = {};
      el.querySelectorAll('[data-s]').forEach((x) => {
        const key = x.getAttribute('data-s');
        if (key === 'ir') return;
        if (x.tagName === 'SELECT') body[key] = x.value ? Number(x.value) : null;
        else body[key] = x.getAttribute('data-dollars') ? dollarsToCents(x.value) : Number(x.value);
      });
      const year = years.length ? years[years.length - 1] : String(new Date().getFullYear());
      body.information_return_thresholds = { ...(v.information_return_thresholds || {}), [year]: dollarsToCents(el.querySelector('[data-s="ir"]').value) || 0 };
      const msg = el.querySelector('[data-a="msg"]');
      const out = await api(ctx.slug, '/sponsor-settings', { method: 'PUT', body: JSON.stringify(body) });
      if (out && out.res.ok) { renderSettings(el, { ...ctx, saved: true }); return; }
      msg.textContent = (out && out.data && out.data.error) || 'Could not save. Check the amounts and try again.';
    });
  }

  window.OrganizationalSponsorFund = { renderBalance, renderSettings, day };
})();
