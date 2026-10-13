/* accounting-dashboard.js — Dashboard tab of the Accounting workspace. A to-do strip (what is waiting, each
 * count linking to the list behind it), four money tiles, and recent activity. One-shot load on tab init,
 * same pattern every other Accounting sub-module uses -- no polling. Age buckets live in the aging reports.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const todoEl          = document.getElementById('organizational-accounting-dash-todo');
  const todoEmptyEl     = document.getElementById('organizational-accounting-dash-todo-empty');
  const cashTilesEl     = document.getElementById('organizational-accounting-dash-cash-tiles');
  const activityListEl  = document.getElementById('organizational-accounting-dash-activity-list');
  const activityEmptyEl = document.getElementById('organizational-accounting-dash-activity-empty');
  const todoSummaryEl   = document.getElementById('organizational-accounting-dash-todo-summary');
  const activitySummaryEl = document.getElementById('organizational-accounting-dash-activity-summary');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function money(cents) {
    return typeof window.formatMoneyCents === 'function' ? window.formatMoneyCents(cents) : '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function baseUrl() {
    return window.OrganizationalAccounting.getSlug ? '/organizational/o/' + encodeURIComponent(window.OrganizationalAccounting.getSlug()) : '';
  }

  function rowHtml(tone, title, context, count, href) {
    return '<a class="organizational-dash-attn-row organizational-dash-attn-row--' + tone + '" href="' + escapeHtml(href) + '" style="padding-top:8px;padding-bottom:8px;">'
      + '<span class="organizational-dash-attn-accent" aria-hidden="true"></span>'
      + '<span class="organizational-dash-attn-body" style="flex-direction:row;align-items:baseline;gap:12px;"><span class="organizational-dash-attn-title">' + escapeHtml(title) + '</span>'
      + '<span class="organizational-dash-attn-context">' + context + '</span></span>'
      + '<span class="organizational-dash-attn-aside">' + escapeHtml(count) + '</span></a>';
  }

  function renderTodo(summary) {
    if (!todoEl) return;
    const base = baseUrl();
    const t = summary.todo || {};
    const n = (v) => Number(v) || 0;
    const items = [];
    const labels = [];
    const add = (tone, label, count, context, href) => { if (count > 0) { items.push(rowHtml(tone, label, context, String(count), href)); labels.push(label + ' ' + count); } };
    add('danger', 'Bills overdue', n(t.bills_overdue && t.bills_overdue.count), escapeHtml(money(t.bills_overdue && t.bills_overdue.cents)) + ' unpaid', base + '/purchases?filter=overdue');
    add('danger', 'Invoices overdue', n(t.invoices_overdue && t.invoices_overdue.count), escapeHtml(money(t.invoices_overdue && t.invoices_overdue.cents)) + ' owed to you', base + '/sales?filter=overdue');
    add('neutral', 'Bank lines to reconcile', n(summary.unconfirmed_bank_lines_count), 'Code or match them', base + '/banking');
    add('neutral', 'Bills waiting for approval', n(t.bills_pending_approval), 'Review and approve', base + '/purchases?filter=pending_approval');
    add('neutral', 'Bills due this week', n(t.bills_due_week && t.bills_due_week.count), escapeHtml(money(t.bills_due_week && t.bills_due_week.cents)) + ' to pay', base + '/purchases?filter=due_week');
    add('neutral', 'Expense claims to approve', n(t.claims_to_approve), 'Review and approve', base + '/expense-claims');
    add('neutral', 'Expense claims to pay', n(t.claims_to_pay), 'Approved, not yet paid', base + '/expense-claims');
    add('neutral', 'Gifts waiting to post', n(t.gift_postings_waiting), 'In-kind gifts, pledges and grant gifts', base + '/gift-postings');
    add('neutral', 'Fixed asset entries waiting', n(t.fixed_assets_waiting), 'In the books, not yet in the register', base + '/fixed-assets');
    add('amber', 'Federal-award sign-offs', (summary.pending_federal_approvals || []).length, 'A second person must approve', base + '/transactions?status=pending_approval');
    if (summary.fy_unlocked) {
      items.push(rowHtml('amber', 'FY' + summary.fy_unlocked.fiscal_year + ' is not closed', 'Ended ' + escapeHtml(summary.fy_unlocked.fy_end_date) + ', over 60 days ago', 'Close', base + '/accounting-settings'));
      labels.push('FY' + summary.fy_unlocked.fiscal_year + ' not closed');
    }
    if (todoSummaryEl) todoSummaryEl.textContent = items.length ? labels.slice(0, 3).join(' · ') + (labels.length > 3 ? ' · +' + (labels.length - 3) + ' more' : '') : 'Nothing is waiting for you';
    todoEl.innerHTML = items.join('');
    todoEl.hidden = items.length === 0;
    if (todoEmptyEl) todoEmptyEl.hidden = items.length > 0;
  }

  function renderMoney(summary) {
    if (!cashTilesEl) return;
    const rc = summary.restricted_cash || {};
    const t = summary.todo || {};
    const restricted = Number(rc.temporarily_restricted_cents || 0) + Number(rc.permanently_restricted_cents || 0);
    const overdueBills = Number(t.bills_overdue && t.bills_overdue.cents || 0);
    const reportsBase = '/organizational/o/' + encodeURIComponent(window.OrganizationalAccounting && window.OrganizationalAccounting.getSlug ? window.OrganizationalAccounting.getSlug() : '') + '/reports';
    function item(label, cents, sub, tone, href) {
      const inner = '<div class="organizational-budget-stat-label">' + escapeHtml(label) + '</div>'
        + '<div class="organizational-budget-stat-value">' + escapeHtml(money(cents)) + '</div>'
        + '<div class="organizational-budget-stat-secondary' + (tone ? ' organizational-stat-' + tone : '') + '">' + sub + '</div>';
      return '<div class="organizational-budget-stat-item">' + (href ? '<a href="' + escapeHtml(href) + '" style="color:inherit;text-decoration:none;display:block;" title="Open the schedule">' + inner + '</a>' : inner) + '</div>';
    }
    const owedOverdue = Number(t.owed_to_you_overdue_cents || 0);
    cashTilesEl.innerHTML =
      item('Unrestricted cash', rc.unrestricted_cents, Number(rc.unrestricted_cents) < 0 ? 'Below zero' : 'Available for any purpose', Number(rc.unrestricted_cents) < 0 ? 'danger' : '') +
      item('Restricted cash', restricted, 'Held for donor-restricted purposes', '') +
      item('Bills to pay in 30 days', t.bills_due_30_cents, overdueBills > 0 ? escapeHtml(money(overdueBills)) + ' overdue' : 'None overdue', overdueBills > 0 ? 'danger' : '', reportsBase + '?report=payables-schedule') +
      item('Owed to you', t.owed_to_you_cents != null ? t.owed_to_you_cents : t.invoices_open_cents, owedOverdue > 0 ? escapeHtml(money(owedOverdue)) + ' overdue' : 'None overdue', owedOverdue > 0 ? 'danger' : '', reportsBase + '?report=receivables-schedule');
  }

  function recordHref(it) {
    const base = it.href.replace(/\/[^/]+$/, '');
    if (it.type === 'bill' && it.id) return base + '/purchases?open_bill=' + encodeURIComponent(it.id);
    if (it.type === 'invoice' && it.id) return base + '/sales?open_invoice=' + encodeURIComponent(it.id);
    if (it.type === 'transaction' && it.id) return base + '/transactions?txn=' + encodeURIComponent(it.id);
    return it.href;
  }

  function renderActivity(items) {
    if (!activityListEl || !activityEmptyEl) return;
    if (!Array.isArray(items) || items.length === 0) {
      activityListEl.innerHTML = '';
      activityEmptyEl.hidden = false;
      if (activitySummaryEl) activitySummaryEl.textContent = 'No recent activity';
      return;
    }
    activityEmptyEl.hidden = true;
    if (activitySummaryEl) {
      const first = items[0];
      activitySummaryEl.textContent = 'Latest: ' + (first.title || 'Entry') + ' · ' + money(first.amount_cents) + ' · ' + String(first.date || '').slice(0, 10);
    }
    activityListEl.innerHTML = '<table class="organizational-table" aria-label="Recent activity"><tbody>' +
      items.map(function (it) {
        return '<tr><td>' + escapeHtml(String(it.date || '').slice(0, 10)) + '</td>' +
          '<td>' + escapeHtml(it.title) + '</td>' +
          '<td style="text-align:right;">' + escapeHtml(money(it.amount_cents)) + '</td>' +
          '<td><a href="' + escapeHtml(recordHref(it)) + '">Open</a></td></tr>';
      }).join('') +
    '</tbody></table>';
  }

  const VISIBLE_ROWS = 5;
  function limitRows(card) {
    const scroller = card.querySelector('[data-acc-scroll]');
    if (!scroller) return;
    const row = scroller.querySelector('a.organizational-dash-attn-row, tbody tr');
    scroller.style.maxHeight = '';
    scroller.style.overflowY = '';
    if (!row) return;
    const h = row.getBoundingClientRect().height;
    if (!h) return;
    scroller.style.maxHeight = Math.round(h * VISIBLE_ROWS) + 'px';
    scroller.style.overflowY = 'auto';
  }

  let accordionsWired = false;
  function wireAccordions() {
    if (accordionsWired) return;
    accordionsWired = true;
    document.querySelectorAll('#organizational-accounting-tab-dashboard [data-acc-card]').forEach(function (card) {
      const head = card.querySelector('[data-acc-head]');
      const body = card.querySelector('[data-acc-body]');
      const chev = card.querySelector('[data-acc-chevron]');
      function setOpen(open) {
        body.hidden = !open;
        if (open) limitRows(card);
        head.setAttribute('aria-expanded', String(open));
        chev.style.transform = open ? 'rotate(90deg)' : '';
        card.style.cursor = open ? 'auto' : 'pointer';
      }
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        const open = !body.hidden;
        if (open && !e.target.closest('[data-acc-head]')) return;
        setOpen(!open);
      });
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(body.hidden); }
      });
      card._setOpen = setOpen;
    });
  }

  async function init(slug) {
    if (!window.apiJson) return;
    wireAccordions();
    const [summaryOut, activityOut] = await Promise.all([
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounting/dashboard-summary', { method: 'GET' }),
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounting/dashboard-activity?limit=20', { method: 'GET' }),
    ]);

    const summary = summaryOut && summaryOut.res && summaryOut.res.ok ? summaryOut.data : {
      restricted_cash: {}, unconfirmed_bank_lines_count: 0, pending_federal_approvals: [], fy_unlocked: null, todo: {},
    };
    renderTodo(summary);
    renderMoney(summary);

    const activity = activityOut && activityOut.res && activityOut.res.ok && Array.isArray(activityOut.data.items) ? activityOut.data.items : [];
    renderActivity(activity);
    document.querySelectorAll('#organizational-accounting-tab-dashboard [data-acc-card]').forEach(function (card) { if (card._setOpen) card._setOpen(true); });
  }

  window.OrganizationalAccounting.dashboard = { init: init };
})();
