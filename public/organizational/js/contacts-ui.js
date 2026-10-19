/* contacts-ui.js — standalone Contacts page: the canonical create/edit surface for every
 * org_constituents row and its roles (donor, vendor, customer, board member), shared across
 * Accounting, Funders, and Reports rather than owned by any one module -- unlike donors.js's
 * "Donors" tab, which is deliberately filtered to individuals with the donor
 * role for its own donor-CRM purpose. See .claude/plans/2026-09-11-contacts-standalone-page-
 * nav-cleanup.md for why this is its own top-level page (not nested in Accounting) and why the
 * field set here is narrower than donors.js's own form: identity + role fields only
 * (display_name, kind, organization type, email, phone, website, roles) -- tags and notes
 * are donor-cultivation content owned by the Donors tab's fundraising context and
 * stay editable only there, matching the shared-Party-model pattern (module-specific data edited
 * only by the module whose context gives it meaning), the same reasoning org_vendor_compliance
 * already follows for tax data. A contact with the donor role links out to the Donors
 * tab instead of duplicating that data here.
 *
 * Bootstraps itself (mirrors documents.js) rather than being driven by a workspace coordinator --
 * this is a single-view page, not a multi-tab one, so the heavier accounting-workspace.js/
 * funders-workspace.js coordinator pattern (built to share one org-load across several tabs)
 * would be pure overhead here.
 */
(function () {
  'use strict';

  const errEl         = document.getElementById('organizational-org-error');
  const loadingEl      = document.getElementById('organizational-org-loading');
  const dashEl         = document.getElementById('organizational-org-dashboard');
  const tbody         = document.getElementById('organizational-contacts-tbody');
  let contactsCache = [];
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    columns: [
      { key: 'display_name', type: 'text', get: (c) => c.display_name },
      { key: 'kind', type: 'text', get: (c) => c.kind },
      null,
      { key: 'email', type: 'text', get: (c) => c.email },
      { key: 'is_active', type: 'text', get: (c) => (c.is_active ? 'Active' : 'Archived') },
      null,
    ],
    onChange: () => renderRows(contactsCache),
  }) : null;
  const searchInput   = document.getElementById('organizational-contacts-search');
  const filterType     = document.getElementById('organizational-contacts-filter-type');
  const filterRole     = document.getElementById('organizational-contacts-filter-role');
  const addBtn         = document.getElementById('organizational-contacts-add');

  const panel        = document.getElementById('organizational-contacts-panel');
  const panelOverlay = document.getElementById('organizational-contacts-panel-overlay');
  const panelBody     = document.getElementById('organizational-contacts-panel-body');
  const panelTitle    = document.getElementById('organizational-contacts-panel-title');
  const panelClose     = document.getElementById('organizational-contacts-panel-close');
  const panelErrEl     = document.getElementById('organizational-contacts-panel-error');

  let currentSlug   = '';
  let currentContactId = null;
  let searchDebounceTimer = null;

  function showError(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }
  function slugFromPath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/contacts\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  let currentIsOrgAdmin = false;

  async function loadOrgInfo() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug));
    if (!out || !out.res.ok) { showError('Could not load organization.'); return; }
    const org = out.data.org;
    currentIsOrgAdmin = !!(org && ['admin', 'finance', 'staff'].includes(String(org.role || '').toLowerCase()));
    if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }
  }

  const esc     = window.escapeHtml;
  const apiJson = window.apiJson;

  function showPanelError(msg) { if (panelErrEl) { panelErrEl.textContent = msg || ''; panelErrEl.hidden = !msg; } }

  const ORG_TYPE_LABELS = { foundation: 'Foundation', corporate: 'Corporate', government: 'Government', nonprofit: 'Nonprofit', member_organization: 'Member organization' };
  const ROLE_LABELS = { donor: 'Donor', vendor: 'Vendor', customer: 'Customer', board_member: 'Board member', dues_member: 'Dues member' };
  function kindBadge(c) {
    const label = c.kind === 'organization'
      ? 'Organization' + (c.org_type ? ' · ' + (ORG_TYPE_LABELS[c.org_type] || c.org_type) : '')
      : 'Individual';
    return '<span class="organizational-badge">' + esc(label) + '</span>';
  }
  function roleBadges(c) {
    const roles = (c.roles || []).map((r) => ROLE_LABELS[r] || r);
    return roles.length ? roles.map((r) => '<span class="organizational-badge">' + esc(r) + '</span>').join(' ') : '<span style="color:var(--text-secondary);">—</span>';
  }

  async function loadContacts() {
    const params = new URLSearchParams();
    params.set('active', 'all');
    if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
    if (filterType && filterType.value) params.set('kind', filterType.value);
    if (filterRole && filterRole.value) params.set('role', filterRole.value);
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents?' + params.toString());
    if (!out || !out.res.ok) return;
    contactsCache = Array.isArray(out.data) ? out.data : [];
    renderRows(contactsCache);
  }

  function renderRows(contacts) {
    if (!tbody) return;
    if (!contacts.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No contacts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = (sorter ? sorter.sortRows(contacts) : contacts).map((c) => (
      '<tr class="organizational-contacts-row" data-id="' + c.id + '" style="cursor:pointer;">'
      + '<td>' + esc(c.display_name) + '</td>'
      + '<td>' + kindBadge(c) + '</td>'
      + '<td>' + roleBadges(c) + '</td>'
      + '<td>' + esc(c.email || '—') + '</td>'
      + '<td>' + (c.is_active ? '<span class="organizational-badge">Active</span>' : '<span class="organizational-badge">Archived</span>') + '</td>'
      + '<td>' + (c.is_active ? '<button type="button" class="organizational-btn organizational-btn-outline contacts-archive-btn" data-id="' + c.id + '" style="font-size:0.75rem;">Archive</button>' : '') + '</td>'
      + '</tr>'
    )).join('');
  }

  function panelBodyHtml(c) {
    c = c || {};
    const hasRole = (r) => (c.roles || []).includes(r);
    const donorLink = hasRole('donor')
      ? '<div class="organizational-panel-field-full"><a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/donors" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;">Full donor profile (giving history, notes) →</a></div>'
      : '';
    const kind = c.kind || 'organization';
    const roleBox = (key, hint) => '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:0.875rem;font-weight:400;"><input type="checkbox" class="contact-role" value="' + key + '"' + (hasRole(key) ? ' checked' : '') + '> ' + ROLE_LABELS[key]
      + (hint ? ' <span style="color:var(--text-secondary);">(' + hint + ')</span>' : '') + '</label>';
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="contact-name" class="organizational-input" value="' + esc(c.display_name || '') + '"></label></div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Individual or organization<select id="contact-kind" class="organizational-select">'
      + '<option value="individual"' + (kind === 'individual' ? ' selected' : '') + '>Individual</option>'
      + '<option value="organization"' + (kind === 'organization' ? ' selected' : '') + '>Organization</option>'
      + '</select></label>'
      + '<label class="organizational-label" style="flex:1" id="contact-org-type-row"' + (kind === 'organization' ? '' : ' hidden') + '>Organization type<select id="contact-org-type" class="organizational-select">'
      + '<option value="">—</option>'
      + Object.keys(ORG_TYPE_LABELS).map((t) => '<option value="' + t + '"' + (c.org_type === t ? ' selected' : '') + '>' + ORG_TYPE_LABELS[t] + '</option>').join('')
      + '</select></label>'
      + '</div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Email<input type="email" id="contact-email" class="organizational-input" value="' + esc(c.email || '') + '"></label>'
      + '<label class="organizational-label" style="flex:1">Phone<input type="text" id="contact-phone" class="organizational-input" value="' + esc(c.phone || '') + '"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Website<input type="url" id="contact-website" class="organizational-input" value="' + esc(c.website || '') + '"></label></div>'
      + '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Roles</label>'
      + roleBox('donor') + roleBox('vendor', 'can be billed via Purchases') + roleBox('customer', 'can be invoiced via Sales') + roleBox('board_member') + roleBox('dues_member', 'terms are kept in Membership')
      + '</div>'
      + donorLink
      + '</div>'
      + (c.id ? '<div id="contact-transactions"></div><div id="contact-notes"></div>' : '')
      + '<div class="organizational-panel-actions"><button type="button" id="contact-save" class="organizational-btn organizational-btn-primary">' + (c.id ? 'Save changes' : 'Create contact') + '</button></div>';
  }

  function wirePanelBody() {
    const saveBtn = document.getElementById('contact-save');
    if (saveBtn) saveBtn.addEventListener('click', saveContact);
    const kindSelect = document.getElementById('contact-kind');
    const orgTypeRow = document.getElementById('contact-org-type-row');
    if (kindSelect && orgTypeRow) kindSelect.addEventListener('change', () => { orgTypeRow.hidden = kindSelect.value !== 'organization'; });
  }

  async function openContactPanel(id) {
    showPanelError('');
    currentContactId = id || null;
    if (id) {
      panelTitle.textContent = 'Edit contact';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + id);
      if (!out || !out.res.ok) { showPanelError('Could not load contact.'); return; }
      panelBody.innerHTML = panelBodyHtml(out.data);
      loadContactTransactions(id);
      const notesHost = document.getElementById('contact-notes');
      if (notesHost && window.OrganizationalRecordNotes) window.OrganizationalRecordNotes.mount(notesHost, { slug: currentSlug, type: 'contact', id, canWrite: currentIsOrgAdmin });
    } else {
      panelTitle.textContent = 'New contact';
      panelBody.innerHTML = panelBodyHtml(null);
    }
    wirePanelBody();
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
  }
  async function loadContactTransactions(id) {
    const host = document.getElementById('contact-transactions');
    if (!host) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transaction-list?limit=10&constituent_id=' + id);
    if (!out || !out.res.ok || currentContactId !== id) return;
    const txns = (out.data && out.data.transactions) || [];
    const base = '/organizational/o/' + encodeURIComponent(currentSlug) + '/transactions';
    host.innerHTML = '<div class="organizational-panel-fields"><div class="organizational-panel-field-full"><label class="organizational-label">Transactions' + (out.data.total ? ' (' + out.data.total + ')' : '') + '</label>'
      + (txns.length
        ? '<table class="organizational-table"><tbody>' + txns.map((t) => '<tr><td style="white-space:nowrap;">' + esc(t.date) + '</td><td><a href="' + base + '?txn=' + encodeURIComponent(t.id) + '">' + esc(t.memo || '(no memo)') + '</a></td><td style="text-align:right;white-space:nowrap;">' + esc(window.formatMoneyCents ? window.formatMoneyCents(Number(t.total_cents)) : String(Number(t.total_cents) / 100)) + '</td></tr>').join('') + '</tbody></table>'
        : '<span style="color:var(--text-secondary);">No transactions with this contact yet.</span>')
      + '</div></div>';
  }
  function closeContactPanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
  }

  async function saveContact() {
    showPanelError('');
    const displayName = document.getElementById('contact-name').value.trim();
    const website = document.getElementById('contact-website').value.trim() || null;
    const email = document.getElementById('contact-email').value.trim() || null;
    const phone = document.getElementById('contact-phone').value.trim() || null;
    const kind = document.getElementById('contact-kind').value;
    const orgType = kind === 'organization' ? (document.getElementById('contact-org-type').value || null) : null;
    const roles = Array.from(document.querySelectorAll('.contact-role:checked')).map((el) => el.value);
    if (!displayName) { showPanelError('Name is required.'); return; }

    const body = { display_name: displayName, website, email, phone, kind, org_type: orgType, roles };
    let out;
    if (currentContactId == null) {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents', {
        method: 'POST', body: JSON.stringify(body),
      });
    } else {
      out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + currentContactId, {
        method: 'PATCH', body: JSON.stringify(body),
      });
    }
    if (!out) return;
    if (out.res.ok) {
      await loadContacts();
      closeContactPanel();
    } else {
      showPanelError((out.data && (out.data.message || out.data.error)) || 'Could not save contact.');
    }
  }

  async function archiveContact(id) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + id, { method: 'DELETE' });
    if (out && out.res.ok) await loadContacts();
  }

  function wireEventListeners() {
    if (tbody) tbody.addEventListener('click', (e) => {
      const archiveBtn = e.target.closest('.contacts-archive-btn');
      if (archiveBtn) { archiveContact(Number(archiveBtn.getAttribute('data-id'))); return; }
      const row = e.target.closest('.organizational-contacts-row');
      if (row) openContactPanel(Number(row.getAttribute('data-id')));
    });
    if (addBtn) addBtn.addEventListener('click', () => openContactPanel(null));
    if (panelClose) panelClose.addEventListener('click', closeContactPanel);
    if (panelOverlay) panelOverlay.addEventListener('click', closeContactPanel);
    if (searchInput) searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(loadContacts, 300);
    });
    if (filterType) filterType.addEventListener('change', loadContacts);
    if (filterRole) filterRole.addEventListener('change', loadContacts);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (panel && panel.classList.contains('organizational-panel-is-open')) closeContactPanel();
  });

  async function init() {
    currentSlug = slugFromPath();
    if (!currentSlug) {
      showError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }

    wireEventListeners();
    await loadOrgInfo();

    const exportLink = document.getElementById('organizational-contacts-1099-export');
    if (exportLink) {
      const st1099 = currentIsOrgAdmin ? await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/settings-1099') : null;
      if (currentIsOrgAdmin && !(st1099 && st1099.res.ok && st1099.data.reports_1099 === false)) {
        const calendarYear = new Date().getFullYear();
        exportLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug)
          + '/vendor-compliance/1099-summary?year=' + calendarYear + '&format=csv';
        exportLink.hidden = false;
      }
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;

    const fromParam = new URLSearchParams(window.location.search).get('from');
    const FROM = { purchases: ['Purchases', 'purchases'], sales: ['Sales', 'sales'], transactions: ['Transactions', 'transactions'], accounting: ['Accounting settings', 'accounting-settings'], reports: ['Reports', 'reports'] };
    const crumb = document.getElementById('organizational-contacts-crumb');
    if (crumb && FROM[fromParam]) {
      crumb.innerHTML = '<a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/' + FROM[fromParam][1] + '">' + FROM[fromParam][0] + '</a>';
      crumb.hidden = false;
    }
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (filterRole && roleParam && Array.from(filterRole.options).some((o) => o.value === roleParam)) filterRole.value = roleParam;
    await loadContacts();

    const linked = Number.parseInt(new URLSearchParams(window.location.search).get('contact') || '', 10);
    if (Number.isInteger(linked) && linked > 0) openContactPanel(linked);
  }

  init().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load contacts.');
    console.error('Contacts load error:', e);
  });
})();
