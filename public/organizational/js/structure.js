/* structure.js — the Financial structure page: chart of accounts, programs and activities, and projects.
   Everything here is shared by every module. Anyone with workspace access can read it; changing it is for finance,
   admins and the Structure manager (see docs/public/Settings_and_Permissions.md). */
(function () {
  'use strict';
  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const m = window.location.pathname.match(/^\/organizational\/o\/([^/]+)/);
  const slug = m ? decodeURIComponent(m[1]) : '';
  const base = '/api/organizational/orgs/' + encodeURIComponent(slug);
  const page = '/organizational/o/' + encodeURIComponent(slug);
  const $ = (id) => document.getElementById(id);
  const money = (c) => window.formatMoneyCents(Number(c));

  let canEdit = false;
  let accounts = [];
  let programs = [];
  let typeTab = 'all';
  const TYPE_TABS = [['all', 'All accounts'], ['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Net assets'], ['income', 'Revenue'], ['expense', 'Expenses'], ['archived', 'Archived']];
  const TYPE_LABEL = { asset: 'Asset', liability: 'Liability', equity: 'Net assets', income: 'Revenue', expense: 'Expense' };

  function showError(msg) { const el = $('organizational-structure-error'); el.textContent = msg || ''; el.hidden = !msg; }

  function showTab(name) {
    ['accounts', 'programs', 'projects', 'display'].forEach((t) => { $('structure-pane-' + t).hidden = t !== name; });
    document.querySelectorAll('.organizational-tab-trigger').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === name));
    try { history.replaceState(null, '', page + '/structure' + (name === 'accounts' ? '' : '?tab=' + name)); } catch (e) {  }
  }

  async function loadAccounts() {
    const out = await apiJson(base + '/structure/accounts');
    if (!out || !out.res.ok) { $('structure-accounts-body').innerHTML = '<tr class="organizational-table-empty"><td colspan="6">The chart of accounts could not be loaded.</td></tr>'; return; }
    accounts = out.data.accounts || [];
    renderTypeTabs();
    renderAccounts();
  }
  function renderTypeTabs() {
    $('structure-accounts-types').innerHTML = TYPE_TABS.map(([k, l]) => {
      const n = k === 'archived' ? accounts.filter((a) => a.archived).length : (k === 'all' ? accounts.filter((a) => !a.archived && a.is_posting).length : accounts.filter((a) => !a.archived && a.is_posting && a.type === k).length);
      return '<button type="button" class="organizational-btn organizational-btn-outline" data-type-tab="' + k + '" style="font-size:0.8125rem;padding:4px 10px;' + (k === typeTab ? 'background:var(--organizational-accent-tint);border-color:var(--organizational-accent);font-weight:600;' : '') + '">' + l + ' <span style="color:var(--text-muted);">' + n + '</span></button>';
    }).join('');
  }
  function naturalYtd(a) {
    const v = Number(a.ytd_cents);
    return (a.type === 'income' || a.type === 'liability' || a.type === 'equity') ? -v : v;
  }
  function managedBy(a) {
    if (a.system_role) return '<span title="The system posts to this account, so it cannot be archived" style="color:var(--text-secondary);">System: ' + esc(a.system_role) + '</span>';
    if (a.is_fixed_asset) return '<span style="color:var(--text-secondary);">Fixed assets register</span>';
    if (a.is_statistical) return '<span style="color:var(--text-secondary);">Statistic, not money</span>';
    return '';
  }
  function renderAccounts() {
    const q = $('structure-accounts-q').value.trim().toLowerCase();
    let list = accounts.filter((a) => typeTab === 'archived' ? a.archived : !a.archived);
    if (typeTab !== 'all' && typeTab !== 'archived') list = list.filter((a) => a.type === typeTab);
    if (q) list = list.filter((a) => (a.code + ' ' + a.name + ' ' + a.description).toLowerCase().includes(q));
    const rows = list.map((a) => {
      if (!a.is_posting) {
        return '<tr><td colspan="6" style="font-weight:600;background:var(--surface-active);padding-left:' + (12 + (Math.max(1, a.level) - 1) * 14) + 'px;">' + esc(a.name) + '</td></tr>';
      }
      const actions = canEdit
        ? '<button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-edit-account="' + a.id + '">Edit</button> '
          + (a.system_role || (!a.archived && Number(a.balance_cents) !== 0) ? '' : '<button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-archive-account="' + a.id + '" data-archived="' + (a.archived ? '1' : '') + '">' + (a.archived ? 'Restore' : 'Archive') + '</button>')
        : '';
      const ytd = naturalYtd(a);
      return '<tr><td style="font-variant-numeric:tabular-nums;">' + esc(a.code) + '</td>'
        + '<td><span style="font-weight:500;">' + esc(a.name) + '</span>' + (a.description ? '<br><span style="font-size:0.75rem;color:var(--text-secondary);">' + esc(a.description) + '</span>' : '') + '</td>'
        + '<td>' + esc(TYPE_LABEL[a.type] || a.type) + '</td><td>' + managedBy(a) + '</td>'
        + '<td style="text-align:right;font-variant-numeric:tabular-nums;color:inherit;">' + (ytd === 0 ? '<span style="color:var(--text-muted);">0</span>' : money(ytd)) + '</td>'
        + '<td style="text-align:right;white-space:nowrap;">' + actions + '</td></tr>';
    });
    $('structure-accounts-body').innerHTML = rows.length ? rows.join('') : '<tr class="organizational-table-empty"><td colspan="6">' + (q ? 'No account matches the search.' : 'No accounts here.') + '</td></tr>';
  }

  function accountForm(a) {
    const f = $('structure-account-form');
    const isNew = !a;
    f.hidden = false;
    f.innerHTML = '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:0 0 120px;">Code *<input type="text" id="sf-code" class="organizational-input" maxlength="64" value="' + esc(a ? a.code : '') + '"></label>'
      + '<label class="organizational-label" style="flex:1;">Name *<input type="text" id="sf-name" class="organizational-input" maxlength="200" value="' + esc(a ? a.name : '') + '"></label>'
      + '<label class="organizational-label" style="flex:0 0 160px;">Type' + (isNew ? ' *' : '') + '<select id="sf-type" class="organizational-select"' + (isNew ? '' : ' disabled') + '>'
      + ['asset', 'liability', 'equity', 'income', 'expense'].map((t) => '<option value="' + t + '"' + (a && a.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('') + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Description<input type="text" id="sf-desc" class="organizational-input" maxlength="500" placeholder="What this account is for (shown beside it in the chart)" value="' + esc(a ? a.description : '') + '"></label></div>'
      + (isNew ? '' : '<p class="organizational-hint" style="margin:0;">The type does not change once an account exists. Changing the code or name changes it on every report.</p>')
      + '</div><div id="sf-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions"><button type="button" class="organizational-btn organizational-btn-primary" id="sf-save">' + (isNew ? 'Add account' : 'Save changes') + '</button>'
      + '<button type="button" class="organizational-btn organizational-btn-outline" id="sf-cancel" style="margin-left:8px;">Cancel</button></div>';
    $('sf-cancel').addEventListener('click', () => { f.hidden = true; });
    $('sf-save').addEventListener('click', async () => {
      const body = { code: $('sf-code').value.trim(), name: $('sf-name').value.trim(), description: $('sf-desc').value.trim() };
      if (isNew) body.type = $('sf-type').value;
      const out = await apiJson(base + '/accounts' + (isNew ? '' : '/' + a.id), { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      if (out && out.res.ok) { f.hidden = true; await loadAccounts(); } else { const e = $('sf-error'); e.textContent = (out && out.data && out.data.error) || 'Could not save.'; e.hidden = false; }
    });
    $('sf-code').focus();
  }

  function exportCsv() {
    const rows = [['Code', 'Name', 'Type', 'Description', 'Archived', 'Managed by']].concat(accounts.filter((a) => a.is_posting).map((a) => [a.code, a.name, TYPE_LABEL[a.type] || a.type, a.description, a.archived ? 'Yes' : '', a.system_role || (a.is_fixed_asset ? 'Fixed assets register' : '')]));
    const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    $('structure-accounts-export').href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  }

  async function loadPrograms() {
    const out = await apiJson(base + '/programs');
    programs = (out && out.res.ok && out.data.programs) || [];
    renderPrograms();
  }
  function renderPrograms() {
    const showInactive = $('structure-programs-inactive').checked;
    const list = programs.filter((p) => showInactive || p.is_active);
    const tops = list.filter((p) => p.parent_id == null);
    const rows = [];
    const line = (p, child) => {
      const actions = canEdit
        ? '<button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-edit-program="' + p.id + '">Edit</button> '
          + (p.is_default ? '' : '<button type="button" class="organizational-btn organizational-btn-outline" style="font-size:0.75rem;padding:2px 8px;" data-toggle-program="' + p.id + '">' + (p.is_active ? 'Archive' : 'Restore') + '</button>')
        : '';
      rows.push('<tr><td>' + esc(p.code || '') + '</td><td style="' + (child ? 'padding-left:28px;' : 'font-weight:600;') + '">' + esc(p.name) + '</td>'
        + '<td>' + (p.is_default ? 'Functional category' : child ? 'Activity' : 'Program') + '</td>'
        + '<td style="color:var(--text-secondary);font-size:0.8125rem;">' + esc(p.description || '') + '</td>'
        + '<td>' + window.OrganizationalStatusHtml(p.is_active ? 'posted' : 'void', p.is_active ? 'Active' : 'Archived') + '</td>'
        + '<td style="text-align:right;white-space:nowrap;">' + actions + '</td></tr>');
    };
    tops.forEach((p) => { line(p, false); list.filter((c) => c.parent_id === p.id).forEach((c) => line(c, true)); });
    $('structure-programs-body').innerHTML = rows.length ? rows.join('') : '<tr class="organizational-table-empty"><td colspan="6">No programs yet.</td></tr>';
  }
  function programForm(p, kind) {
    const f = $('structure-program-form');
    f.hidden = false;
    const isNew = !p;
    const k = p ? (p.parent_id ? 'activity' : 'program') : kind;
    f.innerHTML = '<div class="organizational-panel-fields"><div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:0 0 130px;">Code<input type="text" id="pf-code" class="organizational-input" maxlength="32" value="' + esc(p ? p.code || '' : '') + '"></label>'
      + '<label class="organizational-label" style="flex:1;">' + (k === 'activity' ? 'Activity' : 'Program') + ' name *<input type="text" id="pf-name" class="organizational-input" maxlength="200" value="' + esc(p ? p.name : '') + '"></label>'
      + (k === 'activity' && isNew ? '<label class="organizational-label" style="flex:0 0 240px;">Part of program *<select id="pf-parent" class="organizational-select">' + programs.filter((x) => x.parent_id == null && x.is_active && !x.is_default).map((x) => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('') + '</select></label>' : '')
      + '</div><div class="organizational-panel-field-full"><label class="organizational-label">Description<input type="text" id="pf-desc" class="organizational-input" maxlength="500" value="' + esc(p ? p.description || '' : '') + '"></label></div></div>'
      + '<div id="pf-error" class="organizational-panel-error" hidden></div>'
      + '<div class="organizational-panel-actions"><button type="button" class="organizational-btn organizational-btn-primary" id="pf-save">' + (isNew ? 'Add' : 'Save changes') + '</button><button type="button" class="organizational-btn organizational-btn-outline" id="pf-cancel" style="margin-left:8px;">Cancel</button></div>';
    $('pf-cancel').addEventListener('click', () => { f.hidden = true; });
    $('pf-save').addEventListener('click', async () => {
      const body = { code: $('pf-code').value.trim() || null, name: $('pf-name').value.trim(), description: $('pf-desc').value.trim() };
      if (isNew && k === 'activity') body.parent_id = Number($('pf-parent').value);
      const out = await apiJson(base + '/programs' + (isNew ? '' : '/' + p.id), { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      if (out && out.res.ok) { f.hidden = true; await loadPrograms(); } else { const e = $('pf-error'); e.textContent = (out && out.data && out.data.error) || 'Could not save.'; e.hidden = false; }
    });
    $('pf-name').focus();
  }

  async function loadProjects() {
    const out = await apiJson(base + '/sponsored-projects');
    const list = (out && out.res.ok && out.data.sponsored_projects) || [];
    const label = { model_a: 'Managed project', model_c: 'Grant to an independent recipient', other: 'Other' };
    $('structure-projects-body').innerHTML = list.length ? list.map((p) => '<tr><td style="font-weight:500;">' + esc(p.name) + '</td><td>' + esc(label[p.effective_sponsorship_model] || 'Not set') + '</td>'
      + '<td>' + esc((programs.find((x) => x.id === p.program_id) || {}).name || '') + '</td><td>' + window.OrganizationalStatusHtml(p.status === 'active' ? 'posted' : p.status === 'paused' ? 'pending' : 'closed', String(p.status || '').replace(/_/g, ' ')) + '</td></tr>').join('')
      : '<tr class="organizational-table-empty"><td colspan="4">No sponsored projects. Switch on Sponsorship in Organization settings to add them.</td></tr>';
  }

  async function init() {
    if (!slug) return;
    $('structure-crumb-settings').href = page + '/settings';
    $('structure-projects-link').href = page + '/sponsored-projects';
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    canEdit = !!(access && access.write && access.write.structure);
    ['structure-account-add', 'structure-program-add', 'structure-activity-add'].forEach((id) => { $(id).hidden = !canEdit; });
    if (!canEdit) {
      const who = (access && access.write_who && access.write_who.structure) || 'finance and admins';
      const note = document.createElement('p');
      note.className = 'organizational-hint';
      note.textContent = 'You can view this. Changes are made by ' + who + '.';
      document.querySelector('main h1').insertAdjacentElement('afterend', note);
    }
    const cb = $('structure-number-colors');
    const orgOut = await apiJson(base);
    cb.checked = !!(orgOut && orgOut.res.ok && orgOut.data.org && orgOut.data.org.show_number_colors);
    cb.disabled = !canEdit;
    cb.addEventListener('change', async () => {
      const want = cb.checked;
      cb.disabled = true; $('structure-number-colors-error').hidden = true;
      const out = await apiJson(base + '/display-settings', { method: 'PUT', body: JSON.stringify({ show_number_colors: want }) });
      cb.disabled = !canEdit;
      if (!out || !out.res.ok) {
        cb.checked = !want;
        const er = $('structure-number-colors-error'); er.textContent = (out && out.data && out.data.error) || 'Could not save this setting.'; er.hidden = false;
        return;
      }
      if (window.OrganizationalApplyNumberColors) window.OrganizationalApplyNumberColors(want);
    });
    document.querySelector('.organizational-subnav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.getAttribute('data-tab')); });
    $('structure-accounts-types').addEventListener('click', (e) => { const b = e.target.closest('[data-type-tab]'); if (b) { typeTab = b.getAttribute('data-type-tab'); renderTypeTabs(); renderAccounts(); } });
    $('structure-accounts-q').addEventListener('input', renderAccounts);
    $('structure-accounts-export').addEventListener('click', exportCsv);
    $('structure-account-add').addEventListener('click', () => accountForm(null));
    $('structure-program-add').addEventListener('click', () => programForm(null, 'program'));
    $('structure-activity-add').addEventListener('click', () => programForm(null, 'activity'));
    $('structure-programs-inactive').addEventListener('change', renderPrograms);
    $('structure-accounts-body').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit-account]');
      if (ed) { accountForm(accounts.find((a) => a.id === Number(ed.getAttribute('data-edit-account')))); window.scrollTo(0, 0); return; }
      const ar = e.target.closest('[data-archive-account]');
      if (ar) {
        const restore = !!ar.getAttribute('data-archived');
        const out = await apiJson(base + '/accounts/' + ar.getAttribute('data-archive-account') + (restore ? '/unarchive' : '/archive'), { method: 'POST', body: '{}' });
        if (out && out.res.ok) { showError(''); await loadAccounts(); } else showError((out && out.data && out.data.error) || 'Could not change the account.');
      }
    });
    $('structure-programs-body').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit-program]');
      if (ed) { programForm(programs.find((p) => p.id === Number(ed.getAttribute('data-edit-program')))); return; }
      const tg = e.target.closest('[data-toggle-program]');
      if (tg) {
        const p = programs.find((x) => x.id === Number(tg.getAttribute('data-toggle-program')));
        const out = await apiJson(base + '/programs/' + p.id, { method: 'PATCH', body: JSON.stringify({ active: !p.is_active }) });
        if (out && out.res.ok) { showError(''); await loadPrograms(); } else showError((out && out.data && out.data.error) || 'Could not change the program.');
      }
    });
    await Promise.all([loadAccounts(), loadPrograms()]);
    await loadProjects();
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'programs' || t === 'projects') showTab(t);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
