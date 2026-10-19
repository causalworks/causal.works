/* sponsored-projects.js — the Sponsorship screen: four numbers at the top, tabs (Projects, Money out, Intake, Reports,
   Agreements), the settings gear, and the project page with its sub-tabs. Every tab and sub-tab has its own address:
   ?tab=<tab>, ?project=<id>&view=<view>. The money, records and settings pieces come from sponsor-fund.js,
   sponsor-money-out.js and sponsor-records.js. */
(function () {
  'use strict';

  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const stripEl = document.getElementById('organizational-sp-strip');
  const tabsEl = document.getElementById('organizational-sp-tabs');
  const listEl = document.getElementById('organizational-sp-list');
  const addBtn = document.getElementById('organizational-sp-add-btn');
  const projectEl = document.getElementById('organizational-sp-project');
  const viewEl = document.getElementById('organizational-sp-view');
  const panel = document.getElementById('organizational-sp-panel');
  const panelOverlay = document.getElementById('organizational-sp-panel-overlay');
  const panelTitle = document.getElementById('organizational-sp-panel-title');
  const panelBody = document.getElementById('organizational-sp-panel-body');

  const TABS = ['projects', 'money-out', 'intake', 'reports', 'agreements', 'settings'];
  const TAB_TITLES = { projects: 'Projects', 'money-out': 'Money out', intake: 'Intake', reports: 'Reports', agreements: 'Agreements', settings: 'Settings' };
  const VIEWS = ['overview', 'money-in', 'money-out', 'agreement', 'reports', 'lead-link', 'history'];
  const STATUS_LABELS = { applicant: 'Applicant', accepted: 'Accepted', active: 'Active', on_hold: 'On hold', winding_down: 'Winding down', ended: 'Ended', lapsed: 'Lapsed', paused: 'Paused', completed: 'Completed' };
  const MODEL_LABELS = { model_c: 'Pre-approved grant', model_a: 'Comprehensive', other: 'Other' };
  const OPEN_STATUSES = ['applicant', 'accepted', 'active', 'on_hold', 'winding_down', 'lapsed', 'paused'];

  const esc = (s) => window.escapeHtml(s);
  const money = (c) => window.formatMoneyCents(Number(c) || 0);

  let slug = '';
  let org = null;
  let myAccess = { write: {}, read: {} };
  let programs = [];
  let projects = [];
  let overview = null;
  let state = { tab: 'projects', project: null, view: 'overview' };

  const canMoney = () => !!(myAccess.write && myAccess.write.finance);
  const canEnter = () => !!(myAccess.write && myAccess.write.sponsorship);
  const canReadFund = () => !!(myAccess.read && myAccess.read.sponsorship);
  const isLead = () => myAccess.role === 'program';
  const canStaff = () => canEnter() && !isLead();
  const whoWrites = (area) => (myAccess.write_who && myAccess.write_who[area]) || 'someone with access';
  const whoReads = (area) => (area === 'sponsorship' ? 'finance, admins, board members, the Sponsorship manager and the project\'s program lead' : 'finance and admins');

  function api(path, opts) {
    return window.apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + path, opts || { method: 'GET' });
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function statusLabel(s) { return STATUS_LABELS[s] || s || ''; }
  function modelLabel(m) { return MODEL_LABELS[m] || 'Not set'; }

  function feeLabel(f) {
    if (!f) return '';
    if (f.kind === 'flat') return money(f.flat_cents) + ' a quarter';
    if (f.kind === 'tiered') return 'Tiered';
    return f.rate != null ? Number(f.rate) + '%' : 'Not set';
  }

  function projectHref(id, view) {
    return '/organizational/o/' + encodeURIComponent(slug) + '/sponsored-projects?project=' + id + (view && view !== 'overview' ? '&view=' + view : '');
  }

  // ---------- Address ----------
  function readUrl() {
    const sp = new URLSearchParams(window.location.search);
    const id = Number(sp.get('project') || sp.get('focus'));
    const tab = sp.get('tab');
    const view = sp.get('view');
    return {
      tab: TABS.indexOf(tab) !== -1 ? tab : 'projects',
      project: Number.isInteger(id) && id > 0 ? id : null,
      view: VIEWS.indexOf(view) !== -1 ? view : 'overview',
    };
  }

  function writeUrl(push) {
    const sp = new URLSearchParams();
    if (state.project) {
      sp.set('project', String(state.project));
      if (state.view !== 'overview') sp.set('view', state.view);
    } else if (state.tab !== 'projects') {
      sp.set('tab', state.tab);
    }
    const qs = sp.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    if (url === window.location.pathname + window.location.search) return;
    if (push) window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
  }

  function go(next, push) {
    state = { ...state, ...next };
    writeUrl(push !== false);
    render();
  }

  // ---------- Slide-in panel ----------
  function openPanel(title) {
    panelTitle.textContent = title;
    panelBody.innerHTML = '';
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
    return panelBody;
  }

  function closePanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
    panelBody.innerHTML = '';
  }

  // ---------- Data ----------
  async function loadProjects() {
    const out = await api('/sponsored-projects');
    projects = (out && out.res.ok && out.data.sponsored_projects) || [];
    if (canReadFund()) {
      const ov = await api('/sponsorship/overview');
      overview = ov && ov.res.ok ? ov.data : null;
    }
  }

  function rowFor(id) {
    return overview ? overview.projects.find((p) => p.id === Number(id)) || null : null;
  }

  // ---------- Top strip ----------
  function statItem(label, value, sub, href) {
    const inner = '<div class="organizational-budget-stat-label">' + esc(label) + '</div>' +
      '<div class="organizational-budget-stat-value">' + esc(value) + '</div>' +
      '<div class="organizational-budget-stat-secondary">' + esc(sub || '') + '</div>';
    return '<div class="organizational-budget-stat-item">' + (href ? '<a class="organizational-sp-stat-link" href="' + esc(href) + '">' + inner + '</a>' : inner) + '</div>';
  }

  function renderStrip() {
    if (!overview) { stripEl.hidden = true; return; }
    const t = overview.totals;
    stripEl.hidden = false;
    stripEl.innerHTML =
      statItem('Held for projects', money(t.held_cents), 'in the books') +
      statItem('Available to spend', money(t.available_cents), 'after money committed') +
      statItem('Fees due to run', money(t.fees_due_cents), 'quarters ended', myAccess.can_read_accounting ? '/organizational/o/' + encodeURIComponent(slug) + '/gift-postings' : null) +
      statItem('Need attention', String(t.attention_count), 'hold, negative, report, agreement', '?tab=projects&attention=1');
    const att = stripEl.querySelectorAll('.organizational-sp-stat-link')[myAccess.can_read_accounting ? 1 : 0];
    if (att) att.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('organizational-sp-filter-attention').checked = true;
      setFiltersOpen(true);
      go({ tab: 'projects', project: null });
    });
  }

  // ---------- Tabs ----------
  function render() {
    const inProject = !!state.project;
    const active = inProject ? 'projects' : state.tab;
    tabsEl.querySelectorAll('[data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === active));
    TABS.forEach((t) => {
      const pane = document.getElementById('organizational-sp-tab-' + t);
      if (pane) pane.hidden = inProject || t !== active;
    });
    projectEl.hidden = !inProject;
    stripEl.hidden = inProject || !overview;
    const title = document.getElementById('organizational-org-title');
    if (title) title.textContent = inProject ? 'Sponsorship' : 'Sponsorship | ' + TAB_TITLES[active];
    if (inProject) return renderProject();
    if (active === 'projects') return renderGrid();
    if (active === 'money-out') return renderMoneyOut();
    if (active === 'intake') return renderWorkspacePart('intake', ['applications', 'approvals']);
    if (active === 'reports') return renderWorkspacePart('reports', ['calendar', 'year-end', 'information-returns'], '<p class="organizational-hint organizational-sp-intro"><a href="/organizational/o/' + encodeURIComponent(slug) + '/reports">All reports across modules</a></p>');
    if (active === 'agreements') return renderAgreements();
    if (active === 'settings') return renderSettings();
    return null;
  }

  function wireTabs() {
    tabsEl.querySelectorAll('[data-section]').forEach((b) => b.addEventListener('click', () => go({ tab: b.dataset.section, project: null })));
    document.getElementById('organizational-sp-subtabs').querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => go({ view: b.dataset.view })));
    document.getElementById('organizational-sp-back').addEventListener('click', (e) => { e.preventDefault(); go({ project: null, tab: 'projects' }); });
    window.addEventListener('popstate', () => { state = readUrl(); render(); });
    panelOverlay.addEventListener('click', closePanel);
    document.getElementById('organizational-sp-panel-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('organizational-panel-is-open')) closePanel(); });
  }

  function applyTabAccess() {
    const hide = (section, yes) => { const b = tabsEl.querySelector('[data-section="' + section + '"]'); if (b) b.hidden = yes; };
    const staffView = canReadFund() && !isLead();
    hide('money-out', !canReadFund());
    hide('intake', !staffView);
    hide('reports', !staffView);
    hide('agreements', !staffView);
    hide('settings', !staffView);
    if (!canReadFund() || (isLead() && state.tab !== 'money-out')) state.tab = state.tab === 'money-out' && canReadFund() ? state.tab : 'projects';
    const hist = document.querySelector('#organizational-sp-subtabs [data-view="history"]');
    if (hist) hist.hidden = !(myAccess.read && myAccess.read.audit_log);
    document.querySelectorAll('#organizational-sp-subtabs [data-view]').forEach((b) => { if (b.dataset.view !== 'overview' && !canReadFund()) b.hidden = true; });
    const ll = document.querySelector('#organizational-sp-subtabs [data-view="lead-link"]');
    if (ll && isLead()) ll.hidden = true;
  }

  // ---------- Projects tab ----------
  function setFiltersOpen(open) {
    const box = document.getElementById('organizational-sp-filters');
    const btn = document.getElementById('organizational-sp-filter-btn');
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  function filterValues() {
    return {
      q: document.getElementById('organizational-sp-filter-q').value.trim().toLowerCase(),
      status: document.getElementById('organizational-sp-filter-status').value,
      model: document.getElementById('organizational-sp-filter-model').value,
      attention: document.getElementById('organizational-sp-filter-attention').checked,
    };
  }

  function flagChips(row, skipHold) {
    if (!row) return '';
    const f = row.flags;
    const chips = [];
    if (f.hold && !skipHold) chips.push(['danger', 'On hold']);
    if (f.negative) chips.push(['danger', 'Negative']);
    if (f.report_overdue) chips.push(['danger', 'Report overdue']);
    if (f.agreement_missing) chips.push(['warn', 'No agreement']);
    if (f.good_standing === false) chips.push(['warn', 'Not in good standing']);
    return chips.map((c) => '<span class="organizational-sp-chip organizational-sp-chip-' + c[0] + '">' + esc(c[1]) + '</span>').join('');
  }

  function renderGrid() {
    const showMoney = !!overview;
    const filterBtn = document.getElementById('organizational-sp-filter-btn');
    if (!projects.length) {
      filterBtn.hidden = true;
      setFiltersOpen(false);
      listEl.innerHTML = '<p class="organizational-empty organizational-sp-empty-line">No sponsored projects yet.</p>';
      return;
    }
    filterBtn.hidden = false;
    const f = filterValues();
    const rows = projects.filter((p) => {
      const r = rowFor(p.id);
      if (f.status === 'open' && OPEN_STATUSES.indexOf(p.status) === -1) return false;
      if (f.status && f.status !== 'open' && p.status !== f.status) return false;
      if (f.model && p.effective_sponsorship_model !== f.model) return false;
      if (f.attention && !(r && r.attention)) return false;
      if (f.q) {
        const hay = (p.name + ' ' + ((r && r.lead_name) || p.contact_lead_name || '')).toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const head = '<tr><th>Project</th><th>Model</th><th>Status</th><th>Lead</th>' +
      (showMoney ? '<th class="organizational-sp-num">Held</th><th class="organizational-sp-num">Available</th><th class="organizational-sp-num">Fee</th>' : '') +
      '<th>Next report</th>' + (showMoney ? '<th>Flags</th>' : '') + '</tr>';
    const body = rows.map((p) => {
      const r = rowFor(p.id);
      return '<tr class="organizational-sp-row" data-id="' + p.id + '" tabindex="0">' +
        '<td class="organizational-sp-name" title="' + esc(p.name) + '"><a href="' + esc(projectHref(p.id)) + '">' + esc(p.name) + '</a></td>' +
        '<td>' + esc(modelLabel(p.effective_sponsorship_model)) + '</td>' +
        '<td>' + esc(statusLabel(p.status)) + '</td>' +
        '<td class="organizational-sp-name" title="' + esc((r && r.lead_name) || p.contact_lead_name || '') + '">' + esc((r && r.lead_name) || p.contact_lead_name || '') + '</td>' +
        (showMoney ? '<td class="organizational-sp-num">' + (r ? money(r.held_cents) : '') + '</td>' +
          '<td class="organizational-sp-num' + (r && r.available_cents < 0 ? ' organizational-sp-fund-negative' : '') + '">' + (r ? money(r.available_cents) : '') + '</td>' +
          '<td class="organizational-sp-num">' + (r ? esc(feeLabel(r.fee)) : '') + '</td>' : '') +
        '<td>' + esc(fmtDate(r ? r.next_report_due : p.next_report_due)) + '</td>' +
        (showMoney ? '<td class="organizational-sp-flags">' + flagChips(r) + '</td>' : '') + '</tr>';
    }).join('');
    listEl.innerHTML = '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table organizational-sp-grid" aria-label="Sponsored projects"><thead>' + head + '</thead><tbody>' +
      (body || '<tr class="organizational-table-empty"><td colspan="9">No projects match the filters.</td></tr>') + '</tbody></table></div></section>';
    listEl.querySelectorAll('.organizational-sp-row').forEach((tr) => {
      const open = (e) => {
        if (e && (e.metaKey || e.ctrlKey)) return;
        if (e) e.preventDefault();
        go({ project: Number(tr.dataset.id), view: 'overview' });
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    });
  }

  function wireFilters() {
    document.getElementById('organizational-sp-filter-btn').addEventListener('click', () => setFiltersOpen(document.getElementById('organizational-sp-filters').hidden));
    ['organizational-sp-filter-q', 'organizational-sp-filter-status', 'organizational-sp-filter-model', 'organizational-sp-filter-attention'].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change', renderGrid);
    });
    if (new URLSearchParams(window.location.search).get('attention') === '1') {
      document.getElementById('organizational-sp-filter-attention').checked = true;
      setFiltersOpen(true);
    }
  }

  // ---------- Money out tab ----------
  async function renderMoneyOut() {
    const el = document.getElementById('organizational-sp-tab-money-out');
    el.innerHTML = '<p class="organizational-empty">Loading…</p>';
    const out = await api('/sponsorship/money-out');
    if (!out || !out.res.ok) { el.innerHTML = '<p class="organizational-error">' + esc((out && out.data && out.data.error) || 'Could not load money out.') + '</p>'; return; }
    const d = out.data;
    const link = (r) => '<a href="' + esc(projectHref(r.sponsored_project_id, 'money-out')) + '">' + esc(r.project_name) + '</a>';
    const table = (title, head, rows, empty, foot) => '<h2 class="organizational-subheading">' + esc(title) + '</h2><section class="organizational-card organizational-card-flush">' +
      (rows.length ? '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr>' + head.map((x) => '<th' + (x.num ? ' class="organizational-sp-num"' : '') + '>' + esc(x.label || x) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : '<p class="organizational-empty organizational-sp-card-foot">' + esc(empty) + '</p>') + (foot ? '<p class="organizational-hint organizational-sp-card-foot">' + foot + '</p>' : '') + '</section>';
    const REQ = { submitted: 'Submitted', in_review: 'In review', needs_info: 'Needs information' };
    const gp = myAccess.can_read_accounting ? ' <a href="/organizational/o/' + encodeURIComponent(slug) + '/gift-postings">Open Gift Postings</a>.' : '';
    el.innerHTML =
      table('Payment requests', ['Asked', 'Project', 'Payee', 'For', { label: 'Amount', num: true }, 'Status'], d.requests.map((r) => '<tr><td>' + esc(fmtDate(r.created_at)) + '</td><td>' + link(r) + '</td><td>' + esc(r.payee_name || '') + '</td><td class="organizational-sp-name" title="' + esc(r.purpose) + '">' + esc(r.purpose) + '</td><td class="organizational-sp-num">' + money(r.amount_cents) + '</td><td>' + esc(REQ[r.status] || r.status) + '</td></tr>'),
        'No payment requests waiting.', 'Approve, ask for more or reject on the project\'s Money out tab.') +
      table('Disbursements waiting', ['Date', 'Project', 'Notes', { label: 'Amount', num: true }, 'Waiting for'], d.disbursements.map((r) => '<tr><td>' + esc(fmtDate(r.disbursement_date)) + '</td><td>' + link(r) + '</td><td class="organizational-sp-name" title="' + esc(r.notes || '') + '">' + esc(r.notes || '') + '</td><td class="organizational-sp-num">' + money(r.amount_cents) + '</td><td>' + (r.status === 'pending_approval' ? 'Approval' : 'Accounting to post') + '</td></tr>'),
        'No disbursements waiting.', 'Accounting posts approved payments from Gift Postings.' + gp) +
      table('Recalls', ['Date', 'Project', 'Reason', { label: 'Amount', num: true }, 'Status'], d.recalls.map((r) => '<tr><td>' + esc(fmtDate(r.recall_date)) + '</td><td>' + link(r) + '</td><td class="organizational-sp-name" title="' + esc(r.reason) + '">' + esc(r.reason) + '</td><td class="organizational-sp-num">' + money(r.amount_cents) + '</td><td>' + esc(({ pending: 'Waiting for Accounting', posted: 'Posted', void: 'Cancelled' })[r.status] || r.status) + '</td></tr>'),
        'No recalls in the last 90 days.') +
      (d.closings.length ? table('Closings', ['Date', 'Project', { label: 'Amount', num: true }, 'Status'], d.closings.map((r) => '<tr><td>' + esc(fmtDate(r.closing_date)) + '</td><td>' + link(r) + '</td><td class="organizational-sp-num">' + money(r.amount_cents) + '</td><td>Waiting for Accounting</td></tr>'), '') : '');
  }

  // ---------- Intake, Reports, Agreements ----------
  function renderWorkspacePart(tab, parts, footHtml) {
    const pane = document.getElementById('organizational-sp-tab-' + tab);
    if (!window.OrganizationalSponsorRecords) return;
    pane.innerHTML = '<div></div>' + (footHtml || '');
    const el = pane.firstChild;
    window.OrganizationalSponsorRecords.renderWorkspace(el, {
      slug, canStaff: canStaff(), programs: programs.filter((p) => !p.parent_id), parts, projectHref, openPanel, closePanel,
      onProjectsChanged: async () => { await loadProjects(); renderStrip(); },
    });
  }

  function renderAgreements() {
    const missing = overview ? overview.projects.filter((p) => p.flags.agreement_missing) : [];
    const el = document.getElementById('organizational-sp-agreements-missing');
    el.innerHTML = '<h2 class="organizational-subheading">Projects without a signed agreement</h2><section class="organizational-card organizational-card-flush">' +
      (missing.length ? '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Project</th><th>Status</th><th>Lead</th></tr></thead><tbody>' +
        missing.map((p) => '<tr><td><a href="' + esc(projectHref(p.id, 'agreement')) + '">' + esc(p.name) + '</a></td><td>' + esc(statusLabel(p.status)) + '</td><td>' + esc(p.lead_name || '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="organizational-empty organizational-sp-card-foot">Every accepted project has a signed agreement.</p>') + '</section>';
    if (window.OrganizationalSponsorRecords) {
      window.OrganizationalSponsorRecords.renderWorkspace(document.getElementById('organizational-sp-agreements-templates'), {
        slug, canStaff: canStaff(), programs: [], parts: ['templates'], projectHref, openPanel, closePanel,
      });
    }
  }

  // ---------- Settings ----------
  async function renderSettings() {
    const el = document.getElementById('organizational-sp-settings');
    if (window.OrganizationalSponsorFund) window.OrganizationalSponsorFund.renderSettings(el, { slug, canMoney: canMoney(), who: whoWrites('finance') });
    renderPublicSettings(document.getElementById('organizational-sp-public-settings'));
  }

  async function renderPublicSettings(el) {
    const isAdmin = myAccess.role === 'admin';
    const head = '<h2 class="organizational-subheading">Public pages and lead links</h2>';
    const leadLine = '<p class="organizational-hint organizational-sp-card-foot">Lead links last 180 days and can be turned off on the project. Each project\'s public page is turned on under its Lead link and public page tab.</p>';
    if (!isAdmin) {
      el.innerHTML = head + '<section class="organizational-card">' + leadLine + '<p class="organizational-hint organizational-sp-card-foot">The optional spam check on public forms is set by admins.</p></section>';
      return;
    }
    const out = await api('/public-settings');
    const s = (out && out.res.ok && out.data.settings) || {};
    el.innerHTML = head + '<section class="organizational-card">' + leadLine +
      '<p class="organizational-hint organizational-sp-card-foot">Optional spam check on public forms: when a verify address and secret are saved, every public form must pass the check. Leave empty to turn it off.</p>' +
      '<div class="organizational-sp-fund-form">' +
      '<label>Verify address <input class="organizational-input" type="url" data-p="url" placeholder="https://" value="' + esc(s.challenge_verify_url || '') + '"></label>' +
      '<label>Site key <input class="organizational-input" type="text" data-p="key" value="' + esc(s.challenge_site_key || '') + '"></label>' +
      '<label>Secret <input class="organizational-input" type="password" data-p="secret" autocomplete="new-password" placeholder="' + (s.has_secret ? 'saved; type to replace' : '') + '"></label>' +
      '<div class="organizational-sp-fund-actions"><button type="button" class="organizational-btn organizational-btn-sm" data-p="save">Save</button><span class="organizational-hint" data-p="msg"></span></div></div></section>';
    el.querySelector('[data-p="save"]').addEventListener('click', async () => {
      const body = { challenge_verify_url: el.querySelector('[data-p="url"]').value.trim() || null, challenge_site_key: el.querySelector('[data-p="key"]').value.trim() || null };
      const secret = el.querySelector('[data-p="secret"]').value;
      if (secret) body.challenge_secret = secret;
      if (!body.challenge_verify_url) body.challenge_secret = '';
      const r = await api('/public-settings', { method: 'PUT', body: JSON.stringify(body) });
      el.querySelector('[data-p="msg"]').textContent = r && r.res.ok ? 'Saved.' : ((r && r.data && r.data.error) || 'Could not save.');
    });
  }

  // ---------- Project page ----------
  async function renderProject() {
    const id = state.project;
    const p = projects.find((x) => Number(x.id) === Number(id));
    if (!p) {
      document.getElementById('organizational-sp-project-name').textContent = 'Project not found';
      document.getElementById('organizational-sp-project-meta').textContent = '';
      document.getElementById('organizational-sp-project-available').textContent = '';
      document.getElementById('organizational-sp-project-strip').innerHTML = '';
      viewEl.innerHTML = '<p class="organizational-empty">This project does not exist in this workspace, or you cannot see it.</p>';
      return;
    }
    const r = rowFor(id);
    document.getElementById('organizational-sp-project-name').textContent = p.name;
    document.getElementById('organizational-sp-project-name').title = p.name;
    document.getElementById('organizational-sp-project-meta').innerHTML =
      '<span class="organizational-sp-chip">' + esc(statusLabel(p.status)) + '</span> ' + esc(modelLabel(p.effective_sponsorship_model)) +
      ((r && r.lead_name) || p.contact_lead_name ? ' · Lead: ' + esc((r && r.lead_name) || p.contact_lead_name) : '') + ' ' + flagChips(r, true);
    document.querySelectorAll('#organizational-sp-subtabs [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    const availEl = document.getElementById('organizational-sp-project-available');
    const strip = document.getElementById('organizational-sp-project-strip');
    availEl.textContent = '';
    strip.innerHTML = '';
    if (canReadFund()) {
      const bal = await api('/sponsored-projects/' + id + '/balance');
      const b = bal && bal.res.ok ? bal.data.balance : null;
      if (b && state.project === id) {
        availEl.textContent = money(b.available_cents);
        availEl.classList.toggle('organizational-sp-fund-negative', b.negative);
        strip.innerHTML =
          statItem('Received', money(b.received_posted_cents), b.received_unposted_cents ? money(b.received_unposted_cents) + ' not yet in the books' : 'in the books') +
          statItem('Fees', money(Math.max(b.fees_accrued_cents, b.fees_posted_cents)), b.fees_unposted_cents ? money(b.fees_unposted_cents) + ' not yet run' : 'all posted') +
          statItem('Paid out', money(b.disbursed_posted_cents + b.recalled_posted_cents + b.closing_transferred_cents + b.other_spending_cents), b.pending_cents ? money(b.pending_cents) + ' committed' : 'nothing committed') +
          statItem('Available', money(b.available_cents), b.negative ? 'negative' : 'to spend');
      }
    }
    if (state.project !== id) return;
    const ctx = { slug, projectId: p.id, canMoney: canMoney(), canEnter: canEnter(), isAdmin: myAccess.role === 'admin', canStaff: canStaff() };
    const refresh = async () => { await loadProjects(); renderStrip(); renderProject(); };
    const box = (key) => '<div class="organizational-sp-view-block" data-v="' + key + '"></div>';
    const at = (key) => viewEl.querySelector('[data-v="' + key + '"]');
    const view = state.view;
    if (view !== 'overview' && !canReadFund()) { go({ view: 'overview' }, false); return; }

    if (view === 'overview') {
      viewEl.innerHTML = box('facts') + (canReadFund() ? '<h3 class="organizational-sp-head">Balance</h3>' + box('balance') + '<h3 class="organizational-sp-head">Hold and standing</h3>' + box('hold') + box('standing')
        : '<p class="organizational-hint">The balance and records are for ' + esc(whoReads('sponsorship')) + '.</p>');
      renderFacts(at('facts'), p);
      if (canReadFund()) {
        window.OrganizationalSponsorFund.renderBalance(at('balance'), { ...ctx, parts: ['balance'] });
        at('hold').innerHTML = p.status === 'on_hold'
          ? '<p class="organizational-sp-mo-hold"><strong>On hold</strong>: ' + esc(p.hold_reason || '') + '. Payments and requests are blocked.' + (p.hold_kind === 'report_overdue' ? ' Lifts by itself when the report is received.' : '') + '</p>'
          : '<p class="organizational-sp-rec-line">Not on hold.' + (canMoney() ? ' Holds are placed and lifted under <a href="' + esc(projectHref(p.id, 'money-out')) + '">Money out</a>.' : '') + '</p>';
        window.OrganizationalSponsorRecords.renderProject(at('standing'), { ...ctx, parts: ['standing'], onChange: refresh });
      }
    } else if (view === 'money-in') {
      viewEl.innerHTML = '<h3 class="organizational-sp-head">Gifts to this project</h3>' + box('gifts') + '<h3 class="organizational-sp-head">Fee</h3>' + box('fee') + box('letters');
      renderGifts(at('gifts'), p);
      window.OrganizationalSponsorFund.renderBalance(at('fee'), { ...ctx, parts: ['fee'] });
      window.OrganizationalSponsorRecords.renderProject(at('letters'), { ...ctx, parts: ['letters', 'property'], onChange: refresh });
    } else if (view === 'money-out') {
      viewEl.innerHTML = box('disbursements') + box('moneyout');
      renderDisbursements(at('disbursements'), p, refresh);
      window.OrganizationalSponsorMoneyOut.render(at('moneyout'), { ...ctx, onChange: refresh });
    } else if (view === 'agreement') {
      viewEl.innerHTML = box('records');
      window.OrganizationalSponsorRecords.renderProject(at('records'), { ...ctx, parts: ['agreement', 'documents', 'approvals'], onChange: refresh });
    } else if (view === 'reports') {
      viewEl.innerHTML = box('records');
      window.OrganizationalSponsorRecords.renderProject(at('records'), { ...ctx, parts: ['reports', 'statements'], onChange: refresh });
    } else if (view === 'lead-link') {
      viewEl.innerHTML = box('records');
      if (!canStaff()) { at('records').innerHTML = '<p class="organizational-hint">Lead links and the public page are managed by ' + esc(whoWrites('sponsorship')) + ', not program leads.</p>'; return; }
      window.OrganizationalSponsorRecords.renderProject(at('records'), { ...ctx, parts: ['links', 'public'], onChange: refresh });
    } else if (view === 'history') {
      viewEl.innerHTML = box('history');
      renderHistory(at('history'), p);
    }
  }

  function renderFacts(el, p) {
    const fact = (label, value) => '<div class="organizational-sp-fact"><span class="organizational-sp-fact-label">' + esc(label) + '</span><span>' + value + '</span></div>';
    const prog = programs.find((x) => Number(x.id) === Number(p.program_id));
    el.innerHTML = '<div class="organizational-sp-facts">' +
      fact('Started', esc(fmtDate(p.start_date) || 'Not set')) +
      fact('Ends', esc(p.end_date ? fmtDate(p.end_date) : 'Ongoing')) +
      fact('Program', esc(prog ? prog.name : 'Not linked')) +
      fact('Yearly budget', p.annual_budget_estimate != null ? esc(money(Math.round(Number(p.annual_budget_estimate) * 100))) : 'Not set') +
      fact('Next report due', esc(fmtDate(p.next_report_due) || 'Not set')) +
      fact('Documents', String(p.document_count || 0)) +
      '</div>' +
      (p.description ? '<p class="organizational-sp-rec-line organizational-sp-description">' + esc(p.description) + '</p>' : '') +
      (canEnter() ? '<p class="organizational-sp-rec-line"><a href="#" data-a="edit">Edit details</a></p>' : '<p class="organizational-hint">Details are changed by ' + esc(whoWrites('sponsorship')) + '.</p>');
    const edit = el.querySelector('[data-a="edit"]');
    if (edit) edit.addEventListener('click', (e) => { e.preventDefault(); openProjectForm(p); });
  }

  async function renderGifts(el, p) {
    const out = await api('/sponsored-projects/' + p.id + '/tracking');
    const gifts = (out && out.res.ok && out.data.gifts) || [];
    const POSTING = { posted: 'In the books', unposted: 'Waiting for Accounting', not_applicable: 'Not posted', void: 'Voided' };
    el.innerHTML = gifts.length
      ? '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Received</th><th>Type</th><th>Campaign</th><th class="organizational-sp-num">Amount</th><th>Fee</th><th>Books</th></tr></thead><tbody>' +
        gifts.map((g) => '<tr><td>' + esc(fmtDate(g.received_at)) + '</td><td>' + esc(String(g.gift_type || '').replace(/_/g, ' ')) + '</td><td>' + esc(g.campaign || '') + '</td><td class="organizational-sp-num">' + money(g.amount_cents) + '</td><td>' +
          (g.sponsor_fee_exempt ? '<span title="' + esc(g.sponsor_fee_exempt_reason || '') + '">Exempt</span>' : '') + '</td><td>' + esc(POSTING[g.posting_status] || g.posting_status) + '</td></tr>').join('') +
        '</tbody></table></div></section>'
      : '<p class="organizational-empty">No gifts tagged to this project yet. Gifts are tagged to a project when they are recorded in Funding.</p>';
  }

  async function renderDisbursements(el, p, refresh) {
    const out = await api('/sponsored-projects/' + p.id + '/tracking');
    if (!out || !out.res.ok) { el.innerHTML = '<p class="organizational-error">Could not load disbursements.</p>'; return; }
    const list = out.data.disbursements || [];
    const legacy = p.effective_sponsorship_model !== 'model_a';
    const ctx = { slug, projectId: p.id, canMoney: canMoney(), canEnter: canEnter(), isAdmin: myAccess.role === 'admin' };
    el.innerHTML = '<h3 class="organizational-sp-head">Disbursements</h3>' + (list.length
      ? '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Date</th><th>Notes</th><th class="organizational-sp-num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map((d) => '<tr><td>' + esc(fmtDate(d.disbursement_date)) + '</td><td class="organizational-sp-name" title="' + esc(d.notes || '') + '">' + esc(d.notes || '') + '</td><td class="organizational-sp-num">' + money(d.amount_cents) + '</td><td>' +
          (d.status === 'approved' ? (d.ledger_transaction_id ? 'Posted' : 'Waiting for Accounting') : d.status === 'pending_approval' ? 'Waiting for approval' : esc(d.status)) + '</td><td>' +
          (d.status === 'pending_approval' && canEnter() ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-approve="' + d.id + '">Approve</button>' : '') +
          (d.status === 'approved' && d.ledger_transaction_id && myAccess.can_write_accounting ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline" data-unpost="' + d.id + '">Unpost</button>' : '') + '</td></tr>').join('') +
        '</tbody></table></div></section>'
      : '<p class="organizational-empty">No disbursements yet.</p>') +
      (legacy && canEnter() ? '<p class="organizational-sp-rec-line"><a href="#" data-a="record">Record a disbursement</a></p>' : '');
    el.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const data = await window.OrganizationalSponsorMoneyOut.sendWithOverride(ctx, '/sponsored-projects/' + p.id + '/disbursements/' + b.dataset.approve + '/approve', {});
      if (!data) { b.disabled = false; return; }
      if (data.needs_second_approval) window.alert(data.message);
      refresh();
    }));
    el.querySelectorAll('[data-unpost]').forEach((b) => b.addEventListener('click', async () => {
      const reason = window.prompt('Why is this disbursement being unposted? The entry in the books is reversed and the disbursement goes back to Accounting. (required)');
      if (!reason || !reason.trim()) return;
      b.disabled = true;
      const r = await api('/gift-postings/disbursement/' + b.dataset.unpost + '/unpost', { method: 'POST', body: JSON.stringify({ reason }) });
      if (!r || !r.res.ok) { window.alert((r && r.data && r.data.error) || 'Could not unpost.'); b.disabled = false; return; }
      refresh();
    }));
    const rec = el.querySelector('[data-a="record"]');
    if (rec) rec.addEventListener('click', (e) => { e.preventDefault(); openDisbursementForm(p, ctx, refresh); });
  }

  function openDisbursementForm(p, ctx, refresh) {
    const body = openPanel('Record a disbursement');
    body.innerHTML = '<div class="organizational-panel-fields">' +
      '<label class="organizational-label">Date * <input class="organizational-input" type="date" data-f="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<label class="organizational-label">Amount paid * <input class="organizational-input" type="number" min="0" step="0.01" data-f="amount"></label>' +
      '<label class="organizational-label organizational-panel-field-full">Notes <input class="organizational-input" type="text" data-f="notes"></label></div>' +
      '<p class="organizational-panel-error" data-f="err" hidden></p>' +
      '<div class="organizational-panel-actions"><button type="button" class="organizational-btn organizational-btn-outline" data-f="cancel">Cancel</button><button type="button" class="organizational-btn" data-f="save">Save</button></div>';
    const f = (n) => body.querySelector('[data-f="' + n + '"]');
    f('cancel').addEventListener('click', closePanel);
    f('save').addEventListener('click', async () => {
      const data = await window.OrganizationalSponsorMoneyOut.sendWithOverride(ctx, '/sponsored-projects/' + p.id + '/disbursements', {
        disbursement_date: f('date').value || null, amount_cents: f('amount').value ? Math.round(Number(f('amount').value) * 100) : null, notes: f('notes').value || null,
      });
      if (!data) return;
      closePanel();
      refresh();
    });
  }

  async function renderHistory(el, p) {
    const out = await api('/sponsored-projects/' + p.id + '/history', { method: 'GET', skip403Redirect: true });
    if (!out || !out.res.ok) { el.innerHTML = '<p class="organizational-hint">' + esc((out && out.data && out.data.error) || 'Could not load the history.') + '</p>'; return; }
    const rows = out.data.entries || [];
    const what = (e) => {
      const t = String(e.table_name || '').replace(/^org_sponsor(ed_project)?_?/, '').replace(/_/g, ' ').replace(/s$/, '') || 'project';
      const m = e.metadata || {};
      if (e.field_name) return t + ': ' + e.field_name.replace(/_/g, ' ') + (e.old_value != null || e.new_value != null ? ' from ' + (e.old_value == null ? 'empty' : e.old_value) + ' to ' + (e.new_value == null ? 'empty' : e.new_value) : '');
      return t + ' ' + ({ create: 'added', update: 'changed', delete: 'removed' })[e.action] + (m.reason ? ': ' + m.reason : m.summary ? ': ' + m.summary : '');
    };
    el.innerHTML = rows.length
      ? '<section class="organizational-card organizational-card-flush"><div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>' +
        rows.map((e) => '<tr><td>' + esc(fmtDate(e.occurred_at)) + '</td><td>' + esc(e.user_email || 'This workspace') + '</td><td class="organizational-sp-name" title="' + esc(what(e)) + '">' + esc(what(e)) + '</td></tr>').join('') +
        '</tbody></table></div></section>'
      : '<p class="organizational-empty">No history recorded yet.</p>';
  }

  // ---------- Add and edit project ----------
  function openProjectForm(project) {
    const body = openPanel(project ? 'Edit project' : 'Add project');
    body.appendChild(document.getElementById('organizational-sp-form-template').content.cloneNode(true));
    const $ = (id) => document.getElementById('organizational-sp-' + id);
    const progSel = $('program');
    programs.filter((x) => x.parent_id == null).forEach((pg) => {
      const group = document.createElement('optgroup');
      group.label = pg.name || 'Program ' + pg.id;
      const own = document.createElement('option');
      own.value = String(pg.id);
      own.textContent = '(the program itself)';
      group.appendChild(own);
      programs.filter((a) => a.parent_id === pg.id).forEach((a) => {
        const o = document.createElement('option');
        o.value = String(a.id);
        o.textContent = a.name || 'Activity ' + a.id;
        group.appendChild(o);
      });
      progSel.appendChild(group);
    });
    const p = project || {};
    $('edit-id').value = p.id ? String(p.id) : '';
    $('name').value = p.name || '';
    $('description').value = p.description || '';
    $('start-date').value = p.start_date ? String(p.start_date).slice(0, 10) : '';
    $('end-date').value = p.end_date ? String(p.end_date).slice(0, 10) : '';
    $('contact-name').value = p.contact_lead_name || '';
    $('contact-email').value = p.contact_lead_email || '';
    $('budget').value = p.annual_budget_estimate != null ? p.annual_budget_estimate : '';
    $('sponsorship-model').value = p.sponsorship_model || '';
    progSel.value = p.program_id ? String(p.program_id) : '';
    $('admin-rate').value = p.admin_rate != null ? p.admin_rate : '';
    if (p.current_fee_kind) { $('admin-rate').disabled = true; $('admin-rate').title = 'This project has a fee rule. Change the fee under Money in.'; }
    $('next-report-due').value = p.next_report_due ? String(p.next_report_due).slice(0, 10) : '';
    $('status').value = p.status || 'active';
    const hint = () => { $('program-hint').hidden = ($('sponsorship-model').value || (org && org.sponsorship_model) || '') !== 'model_a'; };
    hint();
    $('sponsorship-model').addEventListener('change', hint);
    $('more-link').addEventListener('click', (e) => { e.preventDefault(); $('more-fields').hidden = !$('more-fields').hidden; });
    $('cancel').addEventListener('click', closePanel);
    if (p.id && canMoney()) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'organizational-btn organizational-btn-outline organizational-sp-delete';
      del.textContent = 'Delete project';
      del.addEventListener('click', () => deleteProject(p));
      $('cancel').parentNode.insertBefore(del, $('cancel'));
    }
    $('form').addEventListener('submit', (e) => saveProject(e, p));
    $('name').focus();
  }

  async function saveProject(e, p) {
    e.preventDefault();
    const $ = (id) => document.getElementById('organizational-sp-' + id);
    const errBox = $('form-error');
    const body = {
      name: $('name').value, description: $('description').value,
      start_date: $('start-date').value || null, end_date: $('end-date').value || null,
      contact_lead_name: $('contact-name').value, contact_lead_email: $('contact-email').value,
      annual_budget_estimate: $('budget').value ? Number($('budget').value) : null,
      sponsorship_model: $('sponsorship-model').value || null,
      program_id: $('program').value ? Number($('program').value) : null,
      admin_rate: $('admin-rate').value && !$('admin-rate').disabled ? Number($('admin-rate').value) : (p.admin_rate != null ? Number(p.admin_rate) : null),
      next_report_due: $('next-report-due').value || null,
      status: $('status').value,
    };
    $('save').disabled = true;
    const out = await api('/sponsored-projects' + (p.id ? '/' + p.id : ''), { method: p.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    $('save').disabled = false;
    if (!out || !out.res.ok) {
      errBox.textContent = (out && out.data && out.data.error) || 'Could not save the project. Check the fields and try again.';
      errBox.hidden = false;
      return;
    }
    closePanel();
    await loadProjects();
    renderStrip();
    const newId = !p.id && out.data.sponsored_project ? out.data.sponsored_project.id : null;
    if (newId) go({ project: newId, view: 'overview' }); else render();
  }

  async function deleteProject(p) {
    if (!window.confirm('Delete "' + p.name + '"? This cannot be undone.')) return;
    const out = await api('/sponsored-projects/' + p.id, { method: 'DELETE' });
    if (!out || !out.res.ok) { window.alert((out && out.data && out.data.error) || 'Could not delete the project.'); return; }
    closePanel();
    await loadProjects();
    renderStrip();
    go({ project: null, tab: 'projects' });
  }

  // ---------- Start ----------
  async function init() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/sponsored-projects\/?$/);
    slug = m ? decodeURIComponent(m[1]) : '';
    if (!slug) { showError('This address does not name a workspace.'); loadingEl.hidden = true; return; }
    const [o, prog, acc] = await Promise.all([
      api(''), api('/programs'), api('/my-access'),
    ]);
    if (!o || !o.res.ok) { showError((o && o.data && o.data.error) || 'Could not load the workspace.'); loadingEl.hidden = true; return; }
    org = o.data.org;
    programs = (prog && prog.res.ok && (prog.data.programs || [])) || [];
    if (acc && acc.res.ok) myAccess = acc.data.access || acc.data;
    if (window.OrganizationalSidebar && window.OrganizationalSidebar.setWorkspaceName) window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    if (window.OrganizationalHeader && window.OrganizationalHeader.setOrg) window.OrganizationalHeader.setOrg(org.display_name || '—');
    if (!org.fiscal_sponsorship_mode) {
      showError('This workspace is not set up as a fiscal sponsor. Turn on fiscal sponsorship in Settings to manage sponsored projects.');
      loadingEl.hidden = true;
      return;
    }
    if (!canEnter()) addBtn.hidden = true;
    addBtn.addEventListener('click', () => openProjectForm(null));
    state = readUrl();
    applyTabAccess();
    wireTabs();
    wireFilters();
    await loadProjects();
    loadingEl.hidden = true;
    dashEl.hidden = false;
    renderStrip();
    writeUrl(false);
    render();
  }

  (async function initHeader() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/me', { 
        credentials: 'same-origin',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    bindOrganizationalDropdownOutsideClick();

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeOrganizationalDropdown();
      closeOrganizationalOverlay();
    });

    document.addEventListener('click', (e) => {
      const overlay = e.target.closest('.organizational-overlay');
      if (overlay && e.target === overlay) {
        closeOrganizationalOverlay();
      }
    });
  })();

  function closeOrganizationalDropdown() {
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (dd) {
      dd.hidden = true;
      dd.setAttribute('aria-hidden', 'true');
    }
    if (icon) icon.setAttribute('aria-expanded', 'false');
  }

  function toggleOrganizationalDropdown(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (!dd) return;
    const opening = dd.hidden;
    dd.hidden = !opening;
    dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
    if (icon) icon.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }

  let coopDropdownDocClickBound = false;
  function bindOrganizationalDropdownOutsideClick() {
    if (coopDropdownDocClickBound) return;
    coopDropdownDocClickBound = true;
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('organizational-dropdown');
      const icon = document.getElementById('organizational-icon');
      if (!dd || dd.hidden) return;
      if (icon && icon.contains(e.target)) return;
      if (dd && dd.contains(e.target)) return;
      closeOrganizationalDropdown();
    });
  }

  function coopDropdownOpenMembers() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('members');
  }

  function coopDropdownOpenLibrary() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('library');
  }

  function coopDropdownOpenWorkPool() {
    closeOrganizationalDropdown();
    openOrganizationalOverlay('work-pool');
  }

  function openOrganizationalOverlay(type) {
    const overlay = document.getElementById('organizational-overlay-' + type);
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      loadOrganizationalOverlayData(type);
    }
  }

  function closeOrganizationalOverlay() {
    document.querySelectorAll('.organizational-overlay').forEach(overlay => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  }

  async function loadOrganizationalOverlayData(type) {
    const listEl = document.getElementById('organizational-overlay-' + type + '-list');
    if (!listEl) return;

    if (type === 'members') {
      listEl.innerHTML = '<p class="organizational-empty">Loading member directory…</p>';
      try {
        const res = await fetch('/api/organizational/cooperative/members', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          const members = data.members || [];
          if (members.length === 0) {
            listEl.innerHTML = '<p class="organizational-empty">No members yet.</p>';
          } else {
            listEl.innerHTML = members.map(m => `
              <div class="organizational-list-item">
                <div class="organizational-list-item-main">
                  <div class="organizational-list-item-title">${escapeHtml(m.display_name || m.slug || '—')}</div>
                </div>
              </div>
            `).join('');
          }
        } else {
          listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
        }
      } catch (e) {
        listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
      }
    } else if (type === 'library') {
      listEl.innerHTML = '<p class="organizational-empty">Library coming soon.</p>';
    } else if (type === 'work-pool') {
      listEl.innerHTML = '<p class="organizational-empty">Work pool coming soon.</p>';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  document.addEventListener("DOMContentLoaded", function() {
  init().catch(function(e) {
    const loadingEl = document.getElementById("organizational-org-loading");
    if (loadingEl) loadingEl.hidden = true;
    console.error("Sponsored projects load error:", e);
  });
});
})();
