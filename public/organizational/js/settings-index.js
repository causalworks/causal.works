/* settings-index.js — the list of settings shared by the Settings home and each module's own settings page.
   One definition, so the two always agree. Items are filtered by the signed-in person's role and permissions
   (GET .../my-access): ones they may change are plain links, ones they may only look at say "view only", the rest
   are left out. The server still enforces every rule.
   OrganizationalSettingsIndex.render(el, { slug, access, org, module }) -- module omitted = every setting, grouped;
   module set = only that module's settings, and items that live on the current page scroll to their section. */
(function () {
  'use strict';
  const esc = window.escapeHtml;
  const isAdmin = (a) => a.role === 'admin';
  const canW = (a, area) => !!(a.write && a.write[area]);
  const canR = (a, area) => !!(a.read && a.read[area]);
  const acctMode = (a) => (canW(a, 'finance') ? 'edit' : a.can_read_accounting ? 'view' : null);
  const structureMode = (a) => (canW(a, 'structure') ? 'edit' : a.can_read_accounting || canW(a, 'budget') ? 'view' : null);

  const ITEMS = [
    { group: 'General', name: 'Organization details', desc: 'Name, fiscal year end, tax identity, organization characteristics', href: '/settings/organization', mode: (a) => (isAdmin(a) ? 'edit' : null) },
    { group: 'General', name: 'Workspace users and access', desc: 'Who can sign in, their roles, and extra access person by person', href: '/settings/organization', mode: (a) => (isAdmin(a) || a.can_give_access ? 'edit' : null) },
    { group: 'General', name: 'Connected apps', desc: 'Bank connection and optional accounting integrations', href: '/settings/integrations', mode: (a) => (isAdmin(a) ? 'edit' : canR(a, 'finance_admin') ? 'view' : null) },
    { group: 'General', name: 'Security', desc: 'Sign-out after inactivity', href: '/settings/organization', mode: (a) => (isAdmin(a) ? 'edit' : null) },

    { group: 'Financial', modules: ['accounting', 'budget'], name: 'Financial structure', desc: 'Chart of accounts, programs and activities, projects; how amounts display', href: '/structure', mode: structureMode },
    { group: 'Financial', modules: ['accounting'], name: 'Fiscal years and locking', desc: 'Lock a year once it is closed; reopen it with a reason', href: '/accounting-settings', anchor: 'acct-sec-periods', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Approval policy and entry access', desc: 'Which transactions need a second look; who can enter transactions', href: '/accounting-settings', anchor: 'acct-sec-controls', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Fixed assets', desc: 'Capitalization threshold: what counts as an asset and what is expensed', href: '/accounting-settings', anchor: 'acct-sec-fixed', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Invoice and bill numbers', desc: 'Prefixes, next numbers, default payment terms and mileage rate', href: '/accounting-settings', anchor: 'acct-sec-numbering', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Export for your accountant', desc: 'Trial balance, general ledger and journal by fiscal year', href: '/accounting-settings', anchor: 'acct-sec-export', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Vendors and 1099', desc: 'Whether and at what amount vendor payments are reported', href: '/accounting-settings', anchor: 'acct-sec-1099', mode: acctMode },
    { group: 'Financial', modules: ['accounting', 'budget'], name: 'State requirements', desc: 'What your state means for payroll, 1099s and sales tax', href: '/accounting-settings', anchor: 'acct-sec-state', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Banking', desc: 'Bank accounts, Reconcile Period and reconciliation options', href: '/accounting-settings', anchor: 'acct-sec-banking', mode: acctMode },
    { group: 'Financial', modules: ['accounting'], name: 'Expense claims', desc: 'Who approves claims and when they are posted', href: '/expense-claims', mode: acctMode },
    { group: 'Financial', name: 'Where your books live', desc: 'This workspace\'s ledger or an optional integration', href: '/settings/organization', mode: (a) => (isAdmin(a) ? 'edit' : acctMode(a)) },

    { group: 'Budget', modules: ['budget'], name: 'Account mapping and chart re-import', desc: 'Map accounts to an integration; re-import the chart', href: '/budget', anchor: 'budget-sec-coa', mode: (a) => (canW(a, 'budget') ? 'edit' : a.can_read_accounting || canW(a, 'scenarios') ? 'view' : null) },
    { group: 'Budget', modules: ['budget'], name: 'Imports', desc: 'Bring in prior-year budget, actuals, grants, personnel and balances from files', href: '/budget', anchor: 'budget-sec-imports', mode: (a) => (canW(a, 'budget') ? 'edit' : a.can_read_accounting || canW(a, 'scenarios') ? 'view' : null) },

    { group: 'Funding', modules: ['funding'], name: 'Funding: import and templates', desc: 'Grant and donor CSV templates and imports', href: '/grants', anchor: 'funding-settings', mode: (a) => (canW(a, 'funding') ? 'edit' : a.can_read_contacts ? 'view' : null) },
    { group: 'Sponsorship', modules: ['sponsorship'], name: 'Sponsored projects', desc: 'Sponsorship model, administrative fee defaults, projects', href: '/sponsored-projects', mode: (a, org) => (!org.fiscal_sponsorship_mode ? null : canW(a, 'sponsorship') ? 'edit' : 'view') },
    { group: 'Membership', modules: ['membership'], name: 'Membership', desc: 'Dues tiers and member records', href: '/membership', mode: (a, org) => (!org.membership_enabled ? null : isAdmin(a) || a.role === 'finance' ? 'edit' : 'view') },
    { group: 'Compliance', modules: ['compliance'], name: 'Compliance', desc: 'Obligations, document expectations, Form 990 expense classification', href: '/compliance', mode: (a) => (canW(a, 'compliance') ? 'edit' : 'view') },
  ];
  const GROUP_ORDER = ['General', 'Financial', 'Budget', 'Funding', 'Sponsorship', 'Membership', 'Compliance'];

  function table(items, page, here) {
    return '<section class="organizational-card organizational-card-flush"><table class="organizational-table" style="margin:0;"><tbody>'
      + items.map((x) => {
        const local = here && x.it.anchor;
        const href = local ? '#' + x.it.anchor : page + x.it.href + (x.it.anchor ? '#' + x.it.anchor : '');
        return '<tr><td style="width:34%;font-weight:500;"><a href="' + href + '"' + (local ? ' data-settings-anchor="' + esc(x.it.anchor) + '"' : '') + ' style="color:var(--organizational-accent);">' + esc(x.it.name) + '</a></td>'
          + '<td style="color:var(--text-secondary);">' + esc(x.it.desc) + '</td>'
          + '<td style="width:90px;text-align:right;white-space:nowrap;color:var(--text-muted);font-size:0.8125rem;">' + (x.mode === 'view' ? 'view only' : '') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function render(el, opts) {
    const page = '/organizational/o/' + encodeURIComponent(opts.slug);
    const org = opts.org || {};
    const mine = ITEMS.map((it) => ({ it, mode: it.mode(opts.access, org) })).filter((x) => x.mode && (!opts.module || (x.it.modules || []).includes(opts.module)));
    if (opts.module) {
      el.innerHTML = mine.length ? table(mine, page, true) : '';
      el.hidden = !mine.length;
      el.onclick = function (e) {
        const a = e.target.closest('[data-settings-anchor]');
        if (!a) return;
        const t = document.getElementById(a.getAttribute('data-settings-anchor'));
        if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
      return;
    }
    el.innerHTML = GROUP_ORDER.map((g) => {
      const items = mine.filter((x) => x.it.group === g);
      return items.length ? '<h2 class="organizational-subheading">' + esc(g) + '</h2>' + table(items, page, false) : '';
    }).join('') || '<p class="organizational-hint">There are no settings for your role. Ask an admin if you need access.</p>';
  }

  async function load(slug) {
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    let org = {};
    try {
      const r = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'same-origin' });
      if (r.ok) org = (await r.json()).org || {};
    } catch (e) {  }
    return { access, org };
  }

  window.OrganizationalSettingsIndex = { render, load };
})();
