/* sponsor-fund.js — a sponsored project's fund on the project page: balance parts, the fee line, the tie-out with the books,
   fee rule changes (amendments once the agreement is signed), fee exemptions on gifts; and the sponsorship settings section.
   OrganizationalSponsorFund.renderBalance(el, { slug, projectId, canMoney })
   OrganizationalSponsorFund.renderSettings(el, { slug, canMoney }) */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const money = (c) => window.formatMoneyCents(Number(c) || 0);
  const dollarsToCents = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100));
  const centsToDollars = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2));

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
    return t + ', from ' + r.effective_from;
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

    el.innerHTML =
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
          (t.difference_cents ? ' · difference ' + money(t.difference_cents) : '') + '. ' + esc(t.explanation || '')) + '</p>' +
      '<p style="margin:8px 0 0;">Fee: ' + esc(ruleText(current)) +
        (locked ? ' <span class="organizational-hint">(agreement signed ' + esc(rules.data.agreement_signed_at || '') + '; changes are amendments)</span>' : '') +
        (ctx.canMoney ? ' · <a href="#" class="organizational-sp-fee-change">Change</a>' : '') +
        (gifts.length && ctx.canMoney ? ' · <a href="#" class="organizational-sp-fee-exempt-link">Fee exemptions</a>' : '') + '</p>' +
      (ruleList.length > 1 ? '<details class="organizational-collapsible"><summary class="organizational-section-heading">Fee history</summary><div class="organizational-section-body"><ul style="margin:0;padding-left:18px;">' +
        ruleList.map((r) => '<li>' + esc(ruleText(r)) + (r.amendment_reason ? ' · ' + esc(r.amendment_reason) : '') + '</li>').join('') + '</ul></div></details>' : '') +
      '<div class="organizational-sp-fee-form" hidden></div>' +
      '<div class="organizational-sp-fee-exempt" hidden></div>';

    const changeLink = el.querySelector('.organizational-sp-fee-change');
    if (changeLink) changeLink.addEventListener('click', (e) => { e.preventDefault(); openFeeForm(el, ctx, current, locked); });
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
        esc(String(g.received_at || '').slice(0, 10)) + ' · ' + money(g.amount_cents) + (g.sponsor_fee_exempt_reason ? ' <span class="organizational-hint">' + esc(g.sponsor_fee_exempt_reason) + '</span>' : '') + '</label></li>').join('') + '</ul>';
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
    const acctSel = (key, type) => '<select class="organizational-select" data-s="' + key + '"' + (ctx.canMoney ? '' : ' disabled') + '><option value="">Not set</option>' +
      accounts.filter((a) => a.type === type).map((a) => '<option value="' + a.id + '"' + (Number(v[key]) === Number(a.id) ? ' selected' : '') + '>' + esc((a.code ? a.code + ' ' : '') + a.name) + '</option>').join('') + '</select>';
    const progSel = '<select class="organizational-select" data-s="fee_income_program_id"' + (ctx.canMoney ? '' : ' disabled') + '><option value="">Not set</option>' +
      (Array.isArray(programs) ? programs : []).map((p) => '<option value="' + p.id + '"' + (Number(v.fee_income_program_id) === Number(p.id) ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>';
    const num = (key, dollars, attrs) => '<input class="organizational-input" type="number" data-s="' + key + '"' + (dollars ? ' step="0.01" data-dollars="1"' : '') + ' ' + (attrs || '') +
      ' value="' + (dollars ? centsToDollars(v[key]) : v[key]) + '"' + (ctx.canMoney ? '' : ' disabled') + '>';
    const years = Object.keys(v.information_return_thresholds || {}).sort();
    el.innerHTML = '<div class="organizational-sp-fund-form">' +
      '<label>Fee income account ' + acctSel('fee_income_account_id', 'income') + '</label>' +
      '<label>Fee charged to projects (expense account) ' + acctSel('fee_expense_account_id', 'expense') + '</label>' +
      '<label>Program for fee income ' + progSel + '</label>' +
      '<label>Default minimum fee a quarter ' + num('default_fee_minimum_cents', true, 'min="0"') + '</label>' +
      '<label>Second approval needed above ' + num('second_approval_threshold_cents', true, 'min="0"') + '</label>' +
      '<label>Hold a project when its report is overdue by (days) ' + num('overdue_report_hold_days', false, 'min="0"') + '</label>' +
      '<label>Donor letter needed above ' + num('donor_letter_threshold_cents', true, 'min="0"') + '</label>' +
      '<label>Statement day of the month ' + num('statement_day_of_month', false, 'min="1" max="28"') + '</label>' +
      '<label>Information-return threshold, ' + esc(years.join(', ') || 'this year') + ' <input class="organizational-input" type="number" step="0.01" min="0" data-s="ir"' +
        ' value="' + centsToDollars(years.length ? v.information_return_thresholds[years[years.length - 1]] : 200000) + '"' + (ctx.canMoney ? '' : ' disabled') + '></label>' +
      '<p class="organizational-hint" style="margin:0;">Check the information-return threshold against the IRS instructions each year.</p>' +
      (ctx.canMoney ? '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-a="save">Save settings</button><span class="organizational-hint" data-a="msg"></span></div>' : '') +
      '</div>';
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
      msg.textContent = out && out.res.ok ? 'Saved.' : ((out && out.data && out.data.error) || 'Could not save.');
    });
  }

  window.OrganizationalSponsorFund = { renderBalance, renderSettings };
})();
