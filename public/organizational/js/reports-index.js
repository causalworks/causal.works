/* reports-index.js — every report once, with the module that owns it. The Reports page lists them all by group;
   each module's Reports tab lists the ones it owns or shares (see module-reports-link.js). Access rules live here. */
(function () {
  'use strict';
  const FIN = 'finance';
  const GIVING = 'giving';
  // key = panel on the Reports page; owner = module that shows it first; also = other modules that list it
  const REPORTS = [
    { group: 'Financial statements', key: 'financial-position', name: 'Statement of Financial Position', desc: 'Assets, liabilities and net assets (without and with donor restrictions) at fiscal year-end', owner: 'accounting', need: FIN },
    { group: 'Financial statements', key: 'statement-of-activities', name: 'Statement of Activities', desc: 'Revenue and expenses by net asset class, and change in net assets for the year', owner: 'accounting', need: FIN },
    { group: 'Financial statements', key: 'stmt-functional-expenses', name: 'Statement of Functional Expenses', desc: 'Expenses by natural category and function, from your allocations', owner: 'accounting', need: FIN },
    { group: 'Financial statements', key: 'cash-flows', name: 'Statement of Cash Flows', desc: 'Change in net assets to net change in cash: operating, investing and financing', owner: 'accounting', need: FIN },
    { group: 'Financial statements', key: 'balance-sheet', name: 'Balance sheet', desc: 'Assets, liabilities and net assets from the latest snapshot', owner: 'accounting', need: FIN },

    { group: 'Ledger and accounts', key: 'trial-balance', name: 'Trial Balance', desc: 'Every account balance as of a date; debits must equal credits', owner: 'accounting', need: FIN },
    { group: 'Ledger and accounts', key: 'general-ledger', name: 'General Ledger', desc: 'Every posted line by account with opening, running and closing balances', owner: 'accounting', need: FIN },
    { group: 'Ledger and accounts', key: 'account-transactions', name: 'Account Transactions', desc: 'The entries behind one account total for a period', owner: 'accounting', need: FIN },
    { group: 'Ledger and accounts', key: 'receivables-schedule', name: 'Receivables Schedule', desc: 'Open invoices and pledge installments by contact, aged, checked against the ledger', owner: 'accounting', need: FIN },
    { group: 'Ledger and accounts', key: 'payables-schedule', name: 'Payables Schedule', desc: 'Approved bills and expense claims by contact, aged, checked against the ledger', owner: 'accounting', need: FIN },
    { group: 'Ledger and accounts', key: 'reconciliation', name: 'Reconciliation and close', desc: 'Tie-out checks for the year, and lock or reopen the year', owner: 'accounting', need: FIN },

    { group: 'Budget and planning', key: 'budget', name: 'Budget views', desc: 'Annual and monthly budget, actuals and forecast by program and column set', owner: 'budget' },
    { group: 'Budget and planning', key: 'cash-forecast', name: 'Cash forecast', desc: 'Rolling 12-month cash position: actual where posted, budget where not', owner: 'budget', also: ['accounting'], need: FIN, href: '/reports/cash-forecast' },

    { group: 'Board, tax and compliance', key: 'board', name: 'Board report', desc: 'Budget against actuals, grant pipeline and program snapshot (PDF)', owner: 'budget', also: ['funding'] },
    { group: 'Board, tax and compliance', key: '990', name: '990 Part IX: functional expenses', desc: 'Expenses across program services, management and general, and fundraising', owner: 'budget', also: ['accounting'] },
    { group: 'Board, tax and compliance', key: '1099', name: '1099 Report', desc: 'What each 1099-eligible vendor was paid in a calendar year, and who is missing a W-9', owner: 'accounting', need: FIN },
    { group: 'Board, tax and compliance', key: 'activity', name: 'Activity log', desc: 'Audit trail of budget, schedule and grant changes with before and after values', owner: 'budget', also: ['funding'] },

    { group: 'Giving and grants', key: 'giving-summary', name: 'Giving summary', desc: 'Gifts by type, average gift and top donors; filter by year and campaign', owner: 'funding', need: GIVING },
    { group: 'Giving and grants', key: 'grant-reports', name: 'Grant reports', desc: 'Per-grant financial summaries for funders (PDF)', owner: 'funding', hubHref: '#organizational-grant-reports-section' },
  ];
  const MODULE_LABEL = { accounting: 'Accounting', budget: 'Budget', funding: 'Funding' };
  const GROUP_ORDER = ['Financial statements', 'Ledger and accounts', 'Budget and planning', 'Board, tax and compliance', 'Giving and grants'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function allowed(r, access) {
    if (!access) return true;
    if (r.need === FIN) return access.can_read_reports !== false;
    if (r.need === GIVING) return access.can_read_contacts !== false;
    return true;
  }
  function forModule(module) {
    return REPORTS.filter((r) => r.owner === module || (r.also || []).indexOf(module) >= 0);
  }
  function hrefFor(r, base) {
    if (r.href) return base + r.href;
    return base + '/reports?report=' + encodeURIComponent(r.key);
  }

  // opts: { slug, access, module (omit for every report), linkAttrs: fn(report) -> attribute string }
  function render(el, opts) {
    const base = '/organizational/o/' + encodeURIComponent(opts.slug);
    const list = (opts.module ? forModule(opts.module) : REPORTS).filter((r) => allowed(r, opts.access));
    el.innerHTML = GROUP_ORDER.map((g) => {
      const items = list.filter((r) => r.group === g);
      if (!items.length) return '';
      return '<h2 class="organizational-subheading">' + esc(g) + '</h2>'
        + '<section class="organizational-card organizational-card-flush"><table class="organizational-table" style="margin:0;"><tbody>'
        + items.map((r) => {
          const href = opts.module ? '#' : (r.hubHref || hrefFor(r, base));
          const attrs = opts.module ? ' data-report-key="' + esc(r.key) + '"' : (r.hubHref || r.href ? '' : ' data-report-link');
          return '<tr><td style="width:34%;font-weight:500;"><a href="' + esc(href) + '"' + attrs + ' style="color:var(--organizational-accent);text-decoration:underline;">' + esc(r.name) + '</a></td>'
            + '<td style="color:var(--text-secondary);">' + esc(r.desc) + '</td>'
            + (opts.module ? '' : '<td style="width:110px;text-align:right;white-space:nowrap;color:var(--text-muted);font-size:0.8125rem;">' + esc(MODULE_LABEL[r.owner] || '') + '</td>')
            + '</tr>';
        }).join('') + '</tbody></table></section>';
    }).join('') || '<p class="organizational-hint">There are no reports for your role. Ask an admin if you need access.</p>';
    return list;
  }

  window.OrganizationalReportsIndex = { render, forModule, allowed, all: REPORTS };
})();
