(function () {
  'use strict';

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const loadingEl = document.getElementById('organizational-org-loading');
  const errEl     = document.getElementById('organizational-org-error');
  const dashEl    = document.getElementById('organizational-org-dashboard');
  const monthsSel = document.getElementById('cf-months-ahead');
  const backLink  = document.getElementById('cf-back-link');
  const syncNote  = document.getElementById('cf-sync-note');

  let currentSlug = '';

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/reports\/cash-forecast\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function apiJson(url, options) {
    const res = await fetch(url, { credentials: 'include', ...(options || {}) });
    if (res.status === 401) { window.location.href = '/shared/login.html'; return null; }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { res, data };
  }

  function fmtCF(cents) {
    const n = Math.round(Number(cents) || 0);
    const abs = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    return sign + '$' + Math.round(abs / 100).toLocaleString('en-US');
  }

  // ── Account tree ordering (mirrors budget-grid.js / reports.js orderAccountTree) ──
  function orderAccountTree(accounts) {
    const byParent = {};
    accounts.forEach(function (a) {
      const pid = a.parent_id == null ? 'root' : String(a.parent_id);
      (byParent[pid] = byParent[pid] || []).push(a);
    });
    Object.keys(byParent).forEach(function (k) {
      byParent[k].sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || '')) || (Number(a.id) - Number(b.id));
      });
    });
    const roots = (byParent.root || []).filter(function (a) {
      return !a.is_posting && (a.type === 'income' || a.type === 'expense');
    });
    roots.sort(function (a, b) {
      const order = { income: 0, expense: 1 };
      return ((order[a.type] != null ? order[a.type] : 2) - (order[b.type] != null ? order[b.type] : 2)) ||
        String(a.code || '').localeCompare(String(b.code || ''));
    });
    if (roots.length === 0) {
      return accounts
        .filter(function (a) { return a.is_posting && (a.type === 'income' || a.type === 'expense'); })
        .map(function (a) { return { kind: 'posting', account: a, rootCode: a.type }; });
    }
    const out = [];
    roots.forEach(function (root) {
      const subs = (byParent[String(root.id)] || []).filter(function (s) { return !s.is_posting && Number(s.level) === 2; });
      const suppressL2 = subs.length === 1;
      out.push({ kind: 'summary', account: root });
      subs.forEach(function (sub) {
        if (!suppressL2) out.push({ kind: 'subtotal', account: sub });
        (byParent[String(sub.id)] || []).forEach(function (leaf) {
          if (leaf.is_posting) out.push({ kind: 'posting', account: leaf, rootCode: root.code });
        });
        if (!suppressL2) out.push({ kind: 'subtotal_sum', label: 'Total ' + (sub.name || sub.code), rootCode: root.code });
      });
      out.push({ kind: 'section_sum', label: 'TOTAL ' + String(root.name || root.code).toUpperCase(), rootCode: root.code });
    });
    return out;
  }

  // Attaches per-month {amount_cents, kind} rollups to subtotal_sum/section_sum
  // rows by summing the posting-account cells beneath them. Rollup kind is
  // 'forecast' if any contributing cell for that month is forecast — a
  // rollup only reads as fully "actual" once everything under it is.
  function attachCellRollups(ordered, cellsByAccId, monthCount) {
    const emptyRollup = function () {
      return Array.from({ length: monthCount }, function () { return { amount_cents: 0, kind: 'actual', touched: false }; });
    };
    const addCells = function (rollup, cells) {
      if (!cells) return;
      cells.forEach(function (c, i) {
        rollup[i].amount_cents += c.amount_cents;
        rollup[i].touched = true;
        if (c.kind === 'forecast') rollup[i].kind = 'forecast';
      });
    };
    const rootRollups = {};
    let subRollup = null;
    return ordered.map(function (row) {
      const r = Object.assign({}, row);
      if (row.kind === 'subtotal') {
        subRollup = emptyRollup();
      } else if (row.kind === 'posting') {
        const cells = cellsByAccId[row.account.id];
        if (subRollup) addCells(subRollup, cells);
        if (row.rootCode) {
          rootRollups[row.rootCode] = rootRollups[row.rootCode] || emptyRollup();
          addCells(rootRollups[row.rootCode], cells);
        }
      } else if (row.kind === 'subtotal_sum') {
        r._rollup = subRollup || emptyRollup();
        subRollup = null;
      } else if (row.kind === 'section_sum' && row.rootCode) {
        r._rollup = rootRollups[row.rootCode] || emptyRollup();
      }
      return r;
    });
  }

  function renderGridThead(theadEl, months) {
    if (!theadEl) return;
    let h = '<tr class="organizational-budget-monthly-header-1">';
    h += '<th class="organizational-budget-sticky-col organizational-budget-col-account">Account</th>';
    months.forEach(function (m) {
      h += '<th class="organizational-budget-month-header">' + MONTHS_SHORT[m.month - 1] + " '" + String(m.year).slice(2) + '</th>';
    });
    h += '</tr>';
    theadEl.innerHTML = h;
  }

  function cellTd(cell) {
    const cls = 'organizational-budget-col-num ' + (cell.kind === 'actual' ? 'organizational-bv-actl' : 'organizational-bv-fcst');
    const v = cell.amount_cents;
    return '<td class="' + cls + '">' + (v ? fmtCF(v) : '<span style="color:var(--text-secondary)">—</span>') + '</td>';
  }

  function renderAccountGrid(grid) {
    const theadEl = document.getElementById('cf-grid-thead');
    const tbodyEl = document.getElementById('cf-grid-tbody');
    if (!tbodyEl) return;

    renderGridThead(theadEl, grid.months);

    const accounts = Array.isArray(grid.accounts) ? grid.accounts : [];
    if (!accounts.length) {
      tbodyEl.innerHTML = '<tr class="organizational-table-empty"><td colspan="' + (grid.months.length + 1) + '">No income or expense accounts found.</td></tr>';
      return;
    }

    const cellsByAccId = {};
    accounts.forEach(function (a) { cellsByAccId[a.id] = a.cells; });

    const ordered = orderAccountTree(accounts);
    const rows = attachCellRollups(ordered, cellsByAccId, grid.months.length);

    const blankRow = function () { return grid.months.map(function () { return '<td></td>'; }).join(''); };

    let html = '';
    rows.forEach(function (row) {
      if (row.kind === 'summary') {
        html += '<tr class="organizational-budget-row-summary"><td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>'
          + escapeHtml(row.account.name || row.account.code || '') + '</strong></td>' + blankRow() + '</tr>';
      } else if (row.kind === 'subtotal') {
        html += '<tr class="organizational-budget-row-subtotal"><td class="organizational-budget-col-account organizational-budget-sticky-col">'
          + escapeHtml(row.account.name || row.account.code || '') + '</td>' + blankRow() + '</tr>';
      } else if (row.kind === 'posting') {
        const cells = cellsByAccId[row.account.id] || [];
        html += '<tr class="organizational-budget-row-posting"><td class="organizational-budget-col-account organizational-budget-sticky-col">'
          + '<span class="organizational-budget-acct-name">' + escapeHtml(row.account.name || row.account.code || '') + '</span></td>'
          + cells.map(cellTd).join('') + '</tr>';
      } else if (row.kind === 'subtotal_sum' || row.kind === 'section_sum') {
        const cls = row.kind === 'section_sum' ? 'organizational-budget-row-section-sum' : 'organizational-budget-row-subtotal-sum';
        const rollup = row._rollup || [];
        html += '<tr class="' + cls + '"><td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>'
          + escapeHtml(row.label || '') + '</strong></td>'
          + rollup.map(function (c) { return '<td class="organizational-budget-col-num"><strong>' + fmtCF(c.amount_cents) + '</strong></td>'; }).join('')
          + '</tr>';
      }
    });

    tbodyEl.innerHTML = html || '<tr class="organizational-table-empty"><td colspan="' + (grid.months.length + 1) + '">No data.</td></tr>';
  }

  function renderCashTable(grid) {
    const theadEl = document.getElementById('cf-cash-thead');
    const tbodyEl = document.getElementById('cf-cash-tbody');
    if (!tbodyEl) return;

    renderGridThead(theadEl, grid.months);

    const cash = grid.cash || {};
    if (!cash.cash_account_count) {
      const openingNote = 'No accounts are flagged as cash yet — mark bank accounts as cash accounts (Xero sync does this automatically once connected) to see an opening balance and running cash position here.';
      tbodyEl.innerHTML = '<tr><td class="organizational-budget-col-account organizational-budget-sticky-col">Opening balance</td>'
        + grid.months.map(function () { return '<td class="organizational-budget-col-num">—</td>'; }).join('') + '</tr>'
        + '<tr class="organizational-table-empty"><td colspan="' + (grid.months.length + 1) + '" style="color:var(--text-secondary);">' + escapeHtml(openingNote) + '</td></tr>';
      return;
    }

    const rows = cash.rows || [];
    let html = '';
    html += '<tr class="organizational-budget-row-subtotal"><td class="organizational-budget-col-account organizational-budget-sticky-col">Opening balance</td>'
      + rows.map(function (r) { return '<td class="organizational-budget-col-num">' + fmtCF(r.opening_cents) + '</td>'; }).join('') + '</tr>';
    html += '<tr><td class="organizational-budget-col-account organizational-budget-sticky-col">Net change</td>'
      + rows.map(function (r) {
          const cls = r.net_change_cents < 0 ? ' style="color:var(--negative,#b3261e);"' : '';
          return '<td class="organizational-budget-col-num"' + cls + '>' + fmtCF(r.net_change_cents) + '</td>';
        }).join('') + '</tr>';
    html += '<tr class="organizational-budget-row-section-sum"><td class="organizational-budget-col-account organizational-budget-sticky-col"><strong>Closing balance</strong></td>'
      + rows.map(function (r) {
          const cls = r.closing_cents < 0 ? ' style="color:var(--negative,#b3261e);"' : '';
          return '<td class="organizational-budget-col-num"' + cls + '><strong>' + fmtCF(r.closing_cents) + '</strong></td>';
        }).join('') + '</tr>';
    tbodyEl.innerHTML = html;

    if (cash.opening_as_of_date) {
      syncNote.textContent = 'Opening balance as of ' + cash.opening_as_of_date;
    }
  }

  async function loadGrid() {
    const monthsAhead = parseInt(monthsSel && monthsSel.value, 10) || 12;
    const out = await apiJson(
      '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/reports/cash-forecast?months_ahead=' + monthsAhead,
      { method: 'GET' }
    );
    if (!out || !out.res.ok) {
      showError((out && out.data && out.data.error) || 'Could not load cash forecast.');
      return;
    }
    renderCashTable(out.data);
    renderAccountGrid(out.data);
  }

  async function load() {
    const slug = parseSlug();
    if (!slug) {
      showError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    showError('');

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
    if (!out.res.ok) {
      if (loadingEl) loadingEl.hidden = true;
      showError((out.data && out.data.error) || 'Could not load workspace.');
      return;
    }
    const org = out.data.org;
    if (!org) {
      if (loadingEl) loadingEl.hidden = true;
      showError('Invalid response.');
      return;
    }

    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }
    if (backLink) backLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/reports';

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;

    await loadGrid();
  }

  if (monthsSel) monthsSel.addEventListener('change', loadGrid);

  load().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load cash forecast.');
    console.error('Cash forecast load error:', e);
  });
})();
