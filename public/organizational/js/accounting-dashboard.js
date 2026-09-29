/* accounting-dashboard.js — Dashboard tab of the Accounting workspace (Nonprofit_Dashboard_V1_Spec.md,
 * accounting-scoped V1). One-shot load on tab init, same pattern every other Accounting sub-module
 * (ledger.js, bank-reconciliation.js) already uses -- no polling.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const cashTilesEl     = document.getElementById('organizational-accounting-dash-cash-tiles');
  const apBarsEl        = document.getElementById('organizational-accounting-dash-ap-bars');
  const arBarsEl        = document.getElementById('organizational-accounting-dash-ar-bars');
  const attentionListEl = document.getElementById('organizational-accounting-dash-attention-list');
  const attentionEmptyEl= document.getElementById('organizational-accounting-dash-attention-empty');
  const activityListEl  = document.getElementById('organizational-accounting-dash-activity-list');
  const activityEmptyEl = document.getElementById('organizational-accounting-dash-activity-empty');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function money(cents) {
    return typeof window.formatMoneyCents === 'function' ? window.formatMoneyCents(cents) : '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function renderCashTiles(summary) {
    if (!cashTilesEl) return;
    const rc = (summary && summary.restricted_cash) || {};
    const unconfirmed = Number(summary && summary.unconfirmed_bank_lines_count) || 0;
    const base = window.OrganizationalAccounting.getSlug ? '/organizational/o/' + encodeURIComponent(window.OrganizationalAccounting.getSlug()) : '';

    function tile(label, cents, context) {
      return '<div class="organizational-dash-metric-tile">'
        + '<div class="organizational-dash-metric-label">' + escapeHtml(label) + '</div>'
        + '<div class="organizational-dash-metric-value">' + escapeHtml(money(cents)) + '</div>'
        + '<div class="organizational-dash-metric-context">' + context + '</div></div>';
    }

    const reconcileLine = unconfirmed > 0
      ? '<a href="' + escapeHtml(base + '/bank-reconciliation') + '">' + unconfirmed + ' item' + (unconfirmed === 1 ? '' : 's') + ' to reconcile</a>'
      : 'All bank lines reconciled';

    cashTilesEl.innerHTML =
      tile('Unrestricted cash', rc.unrestricted_cents, reconcileLine) +
      tile('Temporarily restricted', rc.temporarily_restricted_cents, '') +
      tile('Permanently restricted', rc.permanently_restricted_cents, '');
  }

  const BUCKET_LABELS = { current: 'Current', '1_30': '1-30', '31_60': '31-60', '61_90': '61-90', '90_plus': '90+' };
  const BUCKET_ORDER = ['current', '1_30', '31_60', '61_90', '90_plus'];

  function renderBars(el, totals) {
    if (!el) return;
    const values = BUCKET_ORDER.map((k) => Number((totals && totals[k]) || 0));
    const max = Math.max(1, ...values);
    el.innerHTML = '<div style="display:flex;align-items:flex-end;gap:10px;height:110px;">' +
      BUCKET_ORDER.map((k, i) => {
        const v = values[i];
        const h = Math.round((v / max) * 90) + 4;
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">' +
          '<div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:4px;">' + (v > 0 ? escapeHtml(money(v)) : '') + '</div>' +
          '<div style="width:100%;background:var(--organizational-accent);border-radius:3px 3px 0 0;height:' + h + 'px;"></div>' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">' + BUCKET_LABELS[k] + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderAttention(summary) {
    if (!attentionListEl || !attentionEmptyEl) return;
    const rows = [];
    const base = window.OrganizationalAccounting.getSlug ? '/organizational/o/' + encodeURIComponent(window.OrganizationalAccounting.getSlug()) : '';

    (summary.pending_federal_approvals || []).forEach(function (t) {
      rows.push({
        tone: 'amber',
        href: base + '/transactions',
        title: 'Federal-award transaction awaiting sign-off',
        context: escapeHtml(t.payee || t.memo || 'Transaction #' + t.id) + ' — ' + escapeHtml(t.transaction_date),
        aside: money(t.amount_cents),
      });
    });
    if (summary.fy_unlocked) {
      rows.push({
        tone: 'danger',
        href: base + '/transactions',
        title: 'FY' + summary.fy_unlocked.fiscal_year + ' is not yet closed',
        context: 'Fiscal year ended ' + escapeHtml(summary.fy_unlocked.fy_end_date) + ', more than 60 days ago',
        aside: 'Review',
      });
    }

    if (rows.length === 0) {
      attentionListEl.innerHTML = '';
      attentionEmptyEl.hidden = false;
      return;
    }
    attentionEmptyEl.hidden = true;
    attentionListEl.innerHTML = rows.map(function (r) {
      return '<a class="organizational-dash-attn-row organizational-dash-attn-row--' + r.tone + '" href="' + escapeHtml(r.href) + '">' +
        '<span class="organizational-dash-attn-accent" aria-hidden="true"></span>' +
        '<span class="organizational-dash-attn-body">' +
        '<span class="organizational-dash-attn-title">' + escapeHtml(r.title) + '</span>' +
        '<span class="organizational-dash-attn-context">' + r.context + '</span></span>' +
        '<span class="organizational-dash-attn-aside">' + escapeHtml(r.aside) + '</span></a>';
    }).join('');
  }

  function renderActivity(items) {
    if (!activityListEl || !activityEmptyEl) return;
    if (!Array.isArray(items) || items.length === 0) {
      activityListEl.innerHTML = '';
      activityEmptyEl.hidden = false;
      return;
    }
    activityEmptyEl.hidden = true;
    activityListEl.innerHTML = '<table class="organizational-table" aria-label="Recent activity"><tbody>' +
      items.map(function (it) {
        return '<tr><td>' + escapeHtml(it.date) + '</td>' +
          '<td>' + escapeHtml(it.title) + '</td>' +
          '<td style="text-align:right;">' + escapeHtml(money(it.amount_cents)) + '</td>' +
          '<td><a href="' + escapeHtml(it.href) + '">Open</a></td></tr>';
      }).join('') +
    '</tbody></table>';
  }

  async function init(slug) {
    if (!window.apiJson) return;
    const [summaryOut, activityOut, apOut, arOut] = await Promise.all([
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounting/dashboard-summary', { method: 'GET' }),
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounting/dashboard-activity?limit=15', { method: 'GET' }),
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/bills/aging-report', { method: 'GET' }),
      window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/invoices/aging-report', { method: 'GET' }),
    ]);

    const summary = summaryOut && summaryOut.res && summaryOut.res.ok ? summaryOut.data : {
      restricted_cash: {}, unconfirmed_bank_lines_count: 0, pending_federal_approvals: [], fy_unlocked: null,
    };
    renderCashTiles(summary);
    renderAttention(summary);

    const activity = activityOut && activityOut.res && activityOut.res.ok && Array.isArray(activityOut.data.items) ? activityOut.data.items : [];
    renderActivity(activity);

    renderBars(apBarsEl, apOut && apOut.res && apOut.res.ok ? apOut.data.totals : null);
    renderBars(arBarsEl, arOut && arOut.res && arOut.res.ok ? arOut.data.totals : null);
  }

  window.OrganizationalAccounting.dashboard = { init: init };
})();
