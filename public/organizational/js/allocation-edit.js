(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const nameEl = document.getElementById('organizational-alloc-name');
  const fyEl = document.getElementById('organizational-alloc-fy');
  const totalEl = document.getElementById('organizational-alloc-total');
  const srcAccEl = document.getElementById('organizational-alloc-source-account-id');
  const descEl = document.getElementById('organizational-alloc-description');
  const linesTbody = document.getElementById('organizational-alloc-lines-tbody');
  const addLineBtn = document.getElementById('organizational-alloc-add-line');
  const linesSumEl = document.getElementById('organizational-alloc-lines-sum');
  const monthlyWrap = document.getElementById('organizational-alloc-monthly-wrap');
  const monthlyTbody = document.getElementById('organizational-alloc-monthly-tbody');
  const monthlySumEl = document.getElementById('organizational-alloc-monthly-sum');
  const saveBtn = document.getElementById('organizational-alloc-save');
  const deleteBtn = document.getElementById('organizational-alloc-delete');
  const backA = document.getElementById('organizational-alloc-back');
  let slug = '';
  let scheduleId = null;
  let programs = [];
  let accounts = [];
  let lineRows = [];
  let monthlyRows = [];
  function showError(msg) { if (!errEl) return; errEl.hidden = !msg; errEl.textContent = msg || ''; }
  function parsePath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/projections\/allocations\/([^/]+)\/?$/);
    if (!m) return null;
    return { slug: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) };
  }
  async function apiJson(url, options) {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    return { res, data };
  }
  async function loadExisting() {
    if (!scheduleId) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/allocation-schedules/' + encodeURIComponent(String(scheduleId)));
    if (!out || !out.res.ok) return;
    const s = out.data.schedule || {};
    nameEl.value = s.name || '';
    fyEl.value = s.fiscal_year || '';
    totalEl.value = s.total_amount_dollars || 0;
    srcAccEl.value = s.source_account_id || '';
    descEl.value = s.description || '';
    const dist = document.querySelector('input[name="organizational-alloc-dist"][value="' + s.distribution_type + '"]');
    if (dist) dist.checked = true;
    const mon = document.querySelector('input[name="organizational-alloc-month"][value="' + s.monthly_pattern + '"]');
    if (mon) mon.checked = true;
    lineRows = (out.data.lines || []).map(function (l) {
      return {
        program_id: Number(l.coop_program_id),
        account_id: Number(l.coop_account_id),
        percent_bps: Number(l.percent_bps || 0),
        amount_cents: Number(l.amount_cents || 0),
      };
    });
    monthlyRows = out.data.monthly && out.data.monthly.length
      ? out.data.monthly.map(function (m) {
          return { period_month: Number(m.period_month), percent_bps: Number(m.percent_bps || 0) };
        })
      : new Array(12).fill(0).map(function (_, i) { return { period_month: i + 1, percent_bps: 0 }; });
    if (!lineRows.length) lineRows = [{ program_id: null, account_id: null, percent_bps: 0, amount_cents: 0 }];
    renderLines();
    renderMonthly();
  }

  async function loadPickers() {
    const [progOut, accOut] = await Promise.all([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program'),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts?budget_scope=true'),
    ]);
    programs = progOut && progOut.res && progOut.res.ok && Array.isArray(progOut.data.programs) ? progOut.data.programs : [];
    accounts = accOut && accOut.res && accOut.res.ok && Array.isArray(accOut.data.accounts) ? accOut.data.accounts : [];
  }

  function pctTextFromBps(bps) {
    return ((Number(bps) || 0) / 100).toFixed(2);
  }

  function bpsFromPctText(v) {
    const n = Number(String(v || '').trim());
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }

  function renderLines() {
    if (!linesTbody) return;
    const distType = document.querySelector('input[name="organizational-alloc-dist"]:checked').value;
    const totalCents = Math.round((Number(totalEl.value) || 0) * 100);
    linesTbody.innerHTML = lineRows
      .map(function (r, idx) {
        const pOpts = programs
          .map(function (p) {
            return '<option value="' + p.id + '"' + (Number(r.program_id) === Number(p.id) ? ' selected' : '') + '>' + p.name + '</option>';
          })
          .join('');
        const aOpts = accounts
          .map(function (a) {
            return '<option value="' + a.id + '"' + (Number(r.account_id) === Number(a.id) ? ' selected' : '') + '>' + (a.code || '') + ' — ' + (a.name || '') + '</option>';
          })
          .join('');
        const amountCents = distType === 'fixed_amount_by_program'
          ? Number(r.amount_cents || 0)
          : Math.round((totalCents * (Number(r.percent_bps) || 0)) / 10000);
        const percentBps = distType === 'fixed_amount_by_program'
          ? (totalCents > 0 ? Math.round((amountCents / totalCents) * 10000) : 0)
          : Number(r.percent_bps || 0);
        return '<tr>' +
          '<td><select data-line-program="' + idx + '"><option value="">Select</option>' + pOpts + '</select></td>' +
          '<td><select data-line-account="' + idx + '"><option value="">Select</option>' + aOpts + '</select></td>' +
          '<td>' +
            (distType === 'fixed_amount_by_program'
              ? '<span class="organizational-hint">' + pctTextFromBps(percentBps) + '%</span>'
              : '<input type="number" step="0.01" min="0" max="100" data-line-percent="' + idx + '" value="' + pctTextFromBps(r.percent_bps) + '">') +
          '</td>' +
          '<td>' +
            (distType === 'fixed_amount_by_program'
              ? '<input type="number" step="0.01" min="0" data-line-amount="' + idx + '" value="' + (amountCents / 100).toFixed(2) + '">'
              : (amountCents / 100).toFixed(2)) +
          '</td>' +
          '<td><button class="organizational-btn organizational-btn-outline" type="button" data-line-del="' + idx + '">Remove</button></td>' +
        '</tr>';
      })
      .join('');
    const sumBps = lineRows.reduce(function (s, r) { return s + (Number(r.percent_bps) || 0); }, 0);
    const sumAmountCents = lineRows.reduce(function (s, r) { return s + (Number(r.amount_cents) || 0); }, 0);
    if (distType === 'fixed_amount_by_program') {
      linesSumEl.textContent = 'Sum: $' + (sumAmountCents / 100).toFixed(2) + ' of $' + (totalCents / 100).toFixed(2);
      linesSumEl.classList.toggle('organizational-bva-var-warn', sumAmountCents !== totalCents);
    } else {
      linesSumEl.textContent = 'Sum: ' + (sumBps / 100).toFixed(2) + '%';
      linesSumEl.classList.toggle('organizational-bva-var-warn', sumBps !== 10000);
    }

    linesTbody.querySelectorAll('[data-line-program]').forEach(function (el) {
      el.addEventListener('change', function () {
        const i = Number(el.getAttribute('data-line-program'));
        lineRows[i].program_id = el.value ? Number(el.value) : null;
      });
    });
    linesTbody.querySelectorAll('[data-line-account]').forEach(function (el) {
      el.addEventListener('change', function () {
        const i = Number(el.getAttribute('data-line-account'));
        lineRows[i].account_id = el.value ? Number(el.value) : null;
      });
    });
    linesTbody.querySelectorAll('[data-line-percent]').forEach(function (el) {
      el.addEventListener('input', function () {
        const i = Number(el.getAttribute('data-line-percent'));
        lineRows[i].percent_bps = bpsFromPctText(el.value);
        lineRows[i].amount_cents = Math.round((totalCents * lineRows[i].percent_bps) / 10000);
        renderLines();
        renderSaveState();
      });
    });
    linesTbody.querySelectorAll('[data-line-amount]').forEach(function (el) {
      el.addEventListener('input', function () {
        const i = Number(el.getAttribute('data-line-amount'));
        const cents = Math.max(0, Math.round((Number(el.value) || 0) * 100));
        lineRows[i].amount_cents = cents;
        lineRows[i].percent_bps = totalCents > 0 ? Math.round((cents / totalCents) * 10000) : 0;
        renderLines();
        renderSaveState();
      });
    });
    linesTbody.querySelectorAll('[data-line-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        const i = Number(el.getAttribute('data-line-del'));
        lineRows.splice(i, 1);
        if (!lineRows.length) lineRows.push({ program_id: null, account_id: null, percent_bps: 0, amount_cents: 0 });
        renderLines();
        renderSaveState();
      });
    });
    renderSaveState();
  }

  function renderMonthly() {
    const mode = document.querySelector('input[name="organizational-alloc-month"]:checked').value;
    if (!monthlyWrap) return;
    monthlyWrap.hidden = mode !== 'monthly_custom';
    if (mode !== 'monthly_custom') return renderSaveState();
    monthlyTbody.innerHTML = monthlyRows
      .map(function (m, idx) {
        const amount = (Math.round((Number(totalEl.value || 0) * 100) * (Number(m.percent_bps) || 0) / 10000) / 100).toFixed(2);
        const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return '<tr><td>' + labels[idx] + '</td><td><input type="number" step="0.01" min="0" max="100" data-mon-percent="' + idx + '" value="' + pctTextFromBps(m.percent_bps) + '"></td><td>' + amount + '</td></tr>';
      })
      .join('');
    const s = monthlyRows.reduce(function (sum, m) { return sum + (Number(m.percent_bps) || 0); }, 0);
    monthlySumEl.textContent = 'Sum: ' + (s / 100).toFixed(2) + '%';
    monthlySumEl.classList.toggle('organizational-bva-var-warn', s !== 10000);
    monthlyTbody.querySelectorAll('[data-mon-percent]').forEach(function (el) {
      el.addEventListener('input', function () {
        const i = Number(el.getAttribute('data-mon-percent'));
        monthlyRows[i].percent_bps = bpsFromPctText(el.value);
        renderMonthly();
        renderSaveState();
      });
    });
    renderSaveState();
  }

  function renderSaveState() {
    const distType = document.querySelector('input[name="organizational-alloc-dist"]:checked').value;
    const sumBps = lineRows.reduce(function (s, r) { return s + (Number(r.percent_bps) || 0); }, 0);
    const totalCents = Math.round((Number(totalEl.value) || 0) * 100);
    const sumAmountCents = lineRows.reduce(function (s, r) { return s + (Number(r.amount_cents) || 0); }, 0);
    const uniqueCheck = new Set();
    let dup = false;
    let missing = false;
    lineRows.forEach(function (r) {
      if (!r.program_id || !r.account_id) missing = true;
      const k = String(r.program_id) + ':' + String(r.account_id);
      if (uniqueCheck.has(k)) dup = true;
      uniqueCheck.add(k);
    });
    const mode = document.querySelector('input[name="organizational-alloc-month"]:checked').value;
    const monSum = monthlyRows.reduce(function (s, m) { return s + (Number(m.percent_bps) || 0); }, 0);
    const monBad = mode === 'monthly_custom' && monSum !== 10000;
    const distBad = distType === 'fixed_amount_by_program' ? sumAmountCents !== totalCents : sumBps !== 10000;
    const bad = distBad || dup || missing || monBad;
    saveBtn.disabled = bad;
    saveBtn.title = bad ? 'Fix totals, duplicates, and required fields to save.' : '';
  }
  async function save() {
    try {
      const distType = document.querySelector('input[name="organizational-alloc-dist"]:checked').value;
      const body = {
        name: nameEl.value.trim(),
        fiscal_year: Number(fyEl.value),
        total_amount: Number(totalEl.value),
        source_account_id: srcAccEl.value ? Number(srcAccEl.value) : null,
        description: descEl.value || null,
        distribution_type: distType,
        monthly_pattern: document.querySelector('input[name="organizational-alloc-month"]:checked').value,
        lines: lineRows.map(function (r) {
          return {
            program_id: Number(r.program_id),
            account_id: Number(r.account_id),
            percent_bps: distType === 'fixed_percent_by_program' ? Number(r.percent_bps || 0) : undefined,
            amount: distType === 'fixed_amount_by_program' ? (Number(r.amount_cents || 0) / 100) : undefined,
          };
        }),
        monthly: document.querySelector('input[name="organizational-alloc-month"]:checked').value === 'monthly_custom'
          ? monthlyRows.map(function (m) { return { period_month: Number(m.period_month), percent_bps: Number(m.percent_bps || 0) }; })
          : [],
      };
      const url = '/api/organizational/orgs/' + encodeURIComponent(slug) + '/allocation-schedules' + (scheduleId ? '/' + encodeURIComponent(String(scheduleId)) : '');
      const out = await apiJson(url, { method: scheduleId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!out || !out.res.ok) throw new Error((out && out.data && out.data.error) || 'Save failed');
      window.location.href = '/organizational/o/' + encodeURIComponent(slug) + '/projections';
    } catch (e) {
      showError(e.message || 'Invalid schedule payload');
    }
  }
  (async function () {
    const p = parsePath();
    if (!p) return showError('Invalid URL');
    slug = p.slug;
    scheduleId = p.id === 'new' ? null : Number(p.id);
    if (backA) backA.href = '/organizational/o/' + encodeURIComponent(slug) + '/projections';
    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;
    fyEl.value = String(new Date().getFullYear());
    await loadPickers();
    lineRows = [{ program_id: null, account_id: null, percent_bps: 10000, amount_cents: 0 }];
    monthlyRows = new Array(12).fill(0).map(function (_, i) { return { period_month: i + 1, percent_bps: i === 0 ? 10000 : 0 }; });
    await loadExisting();
    renderLines();
    renderMonthly();
  })();
  addLineBtn && addLineBtn.addEventListener('click', function () {
    lineRows.push({ program_id: null, account_id: null, percent_bps: 0, amount_cents: 0 });
    renderLines();
  });
  totalEl && totalEl.addEventListener('input', function () {
    renderLines();
    renderMonthly();
  });
  document.querySelectorAll('input[name="organizational-alloc-month"]').forEach(function (r) {
    r.addEventListener('change', renderMonthly);
  });
  document.querySelectorAll('input[name="organizational-alloc-dist"]').forEach(function (r) {
    r.addEventListener('change', function () {
      renderLines();
      renderSaveState();
    });
  });
  deleteBtn && deleteBtn.addEventListener('click', async function () {
    if (!scheduleId) return;
    if (!window.confirm('Delete this distribution schedule?')) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/allocation-schedules/' + encodeURIComponent(String(scheduleId)), { method: 'DELETE' });
    if (!out || !out.res || !out.res.ok) return showError((out && out.data && out.data.error) || 'Could not delete schedule');
    window.location.href = '/organizational/o/' + encodeURIComponent(slug) + '/projections';
  });
  saveBtn && saveBtn.addEventListener('click', save);
})();
