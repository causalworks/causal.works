/* contacts-ui.js — standalone Contacts page: the canonical create/edit surface for every
 * org_constituents row and role flag (donor/vendor/customer), shared across Accounting, Funders,
 * and Reports rather than owned by any one module -- unlike donors.js's "Donors"/"Contributions"
 * tab, which is deliberately filtered to people-type constituents only (individual/board/
 * prospect) for its own donor-CRM purpose. See .claude/plans/2026-09-11-contacts-standalone-page-
 * nav-cleanup.md for why this is its own top-level page (not nested in Accounting) and why the
 * field set here is narrower than donors.js's own form: identity + role fields only
 * (display_name, type, email, phone, website, is_donor/is_vendor/is_customer) -- tags and notes
 * are donor-cultivation content owned by the Donors/Contributions tab's fundraising context and
 * stay editable only there, matching the shared-Party-model pattern (module-specific data edited
 * only by the module whose context gives it meaning), the same reasoning org_vendor_compliance
 * already follows for tax data. A contact with is_donor checked links out to the Donors/
 * Contributions tab instead of duplicating that data here.
 *
 * Bootstraps itself (mirrors documents.js) rather than being driven by a workspace coordinator --
 * this is a single-view page, not a multi-tab one, so the heavier accounting-workspace.js/
 * funders-workspace.js coordinator pattern (built to share one org-load across several tabs)
 * would be pure overhead here.
 */
(function () {
  'use strict';

  // ── DOM refs ──
  const errEl         = document.getElementById('organizational-org-error');
  const loadingEl      = document.getElementById('organizational-org-loading');
  const dashEl         = document.getElementById('organizational-org-dashboard');
  const tbody         = document.getElementById('organizational-contacts-tbody');
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

  // ── State ──
  let currentSlug   = '';
  let currentContactId = null; // null while the panel is in "new contact" mode
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
    currentIsOrgAdmin = !!(org && window.isAdminRole && window.isAdminRole(org.role));
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

  const TYPE_LABELS = { foundation: 'Foundation', individual: 'Individual', board: 'Board', prospect: 'Prospect', member_org: 'Member org' };
  function typeBadge(type) {
    return '<span class="organizational-badge">' + esc(TYPE_LABELS[type] || type) + '</span>';
  }
  function roleBadges(c) {
    const roles = [];
    if (c.is_donor) roles.push('Donor');
    if (c.is_vendor) roles.push('Vendor');
    if (c.is_customer) roles.push('Customer');
    return roles.length ? roles.map((r) => '<span class="organizational-badge">' + r + '</span>').join(' ') : '<span style="color:var(--text-secondary);">—</span>';
  }

  // ── List ──
  async function loadContacts() {
    const params = new URLSearchParams();
    params.set('active', 'all');
    if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
    if (filterType && filterType.value) params.set('type', filterType.value);
    if (filterRole && filterRole.value) params.set('role', filterRole.value);
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents?' + params.toString());
    if (!out || !out.res.ok) return;
    renderRows(Array.isArray(out.data) ? out.data : []);
  }

  function renderRows(contacts) {
    if (!tbody) return;
    if (!contacts.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No contacts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = contacts.map((c) => (
      '<tr class="organizational-contacts-row" data-id="' + c.id + '" style="cursor:pointer;">'
      + '<td>' + esc(c.display_name) + '</td>'
      + '<td>' + typeBadge(c.type) + '</td>'
      + '<td>' + roleBadges(c) + '</td>'
      + '<td>' + esc(c.email || '—') + '</td>'
      + '<td>' + (c.is_active ? '<span class="organizational-badge">Active</span>' : '<span class="organizational-badge">Archived</span>') + '</td>'
      + '<td>' + (c.is_active ? '<button type="button" class="organizational-btn organizational-btn-outline contacts-archive-btn" data-id="' + c.id + '" style="font-size:0.75rem;">Archive</button>' : '') + '</td>'
      + '</tr>'
    )).join('');
  }

  // ── Panel (create/edit) ──
  function panelBodyHtml(c) {
    c = c || {};
    const donorLink = c.is_donor
      ? '<div class="organizational-panel-field-full"><a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/donors" class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;">Full donor profile (giving history, notes) →</a></div>'
      : '';
    return '<div class="organizational-panel-fields">'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Name *<input type="text" id="contact-name" class="organizational-input" value="' + esc(c.display_name || '') + '"></label></div>'
      + '<div class="organizational-panel-field-row">'
      + '<label class="organizational-label" style="flex:1">Email<input type="email" id="contact-email" class="organizational-input" value="' + esc(c.email || '') + '"></label>'
      + '<label class="organizational-label" style="flex:1">Phone<input type="text" id="contact-phone" class="organizational-input" value="' + esc(c.phone || '') + '"></label>'
      + '</div>'
      + '<div class="organizational-panel-field-full"><label class="organizational-label">Website<input type="url" id="contact-website" class="organizational-input" value="' + esc(c.website || '') + '"></label></div>'
      + '<div class="organizational-panel-field-full">'
      + '<label class="organizational-label">Roles</label>'
      + '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:0.875rem;font-weight:400;"><input type="checkbox" id="contact-is-donor"' + (c.is_donor ? ' checked' : '') + '> Donor</label>'
      + '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:0.875rem;font-weight:400;"><input type="checkbox" id="contact-is-vendor"' + (c.is_vendor ? ' checked' : '') + '> Vendor <span style="color:var(--text-secondary);">(can be billed via Purchases)</span></label>'
      + '<label style="display:inline-flex;align-items:center;gap:5px;font-size:0.875rem;font-weight:400;"><input type="checkbox" id="contact-is-customer"' + (c.is_customer ? ' checked' : '') + '> Customer <span style="color:var(--text-secondary);">(can be invoiced via Sales)</span></label>'
      + '</div>'
      // Donor category (the field the schema calls "type") only means anything for a donor --
      // its five values are a fundraising segmentation (foundation/board/prospect/member_org/
      // individual), not a general contact classification. Shown/sent only when Donor is
      // checked; a vendor/customer-only contact never sees it and the backend's own default
      // ('individual') applies untouched. See CLAUDE.md "Data models: check origin era before
      // extending for a newer module" for why this isn't just a labeling choice.
      + '<div class="organizational-panel-field-full" id="contact-donor-category-row"' + (c.is_donor ? '' : ' hidden') + '>'
      + '<label class="organizational-label">Donor category<select id="contact-type" class="organizational-select">'
      + Object.keys(TYPE_LABELS).map((t) => '<option value="' + t + '"' + (c.type === t ? ' selected' : '') + '>' + TYPE_LABELS[t] + '</option>').join('')
      + '</select></label>'
      + '</div>'
      + donorLink
      + '</div>'
      + '<div class="organizational-panel-actions"><button type="button" id="contact-save" class="organizational-btn organizational-btn-primary">' + (c.id ? 'Save changes' : 'Create contact') + '</button></div>';
  }

  function wirePanelBody() {
    const saveBtn = document.getElementById('contact-save');
    if (saveBtn) saveBtn.addEventListener('click', saveContact);
    const donorCheckbox = document.getElementById('contact-is-donor');
    const categoryRow = document.getElementById('contact-donor-category-row');
    if (donorCheckbox && categoryRow) donorCheckbox.addEventListener('change', () => { categoryRow.hidden = !donorCheckbox.checked; });
  }

  async function openContactPanel(id) {
    showPanelError('');
    currentContactId = id || null;
    if (id) {
      panelTitle.textContent = 'Edit contact';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/' + id);
      if (!out || !out.res.ok) { showPanelError('Could not load contact.'); return; }
      panelBody.innerHTML = panelBodyHtml(out.data);
    } else {
      panelTitle.textContent = 'New contact';
      panelBody.innerHTML = panelBodyHtml(null);
    }
    wirePanelBody();
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
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
    const isDonor = document.getElementById('contact-is-donor').checked;
    const isVendor = document.getElementById('contact-is-vendor').checked;
    const isCustomer = document.getElementById('contact-is-customer').checked;
    if (!displayName) { showPanelError('Name is required.'); return; }

    const body = { display_name: displayName, website, email, phone, is_donor: isDonor, is_vendor: isVendor, is_customer: isCustomer };
    // Donor category ("type") only has a meaningful value when Donor is checked -- omit it
    // otherwise rather than send a stale/meaningless selection from a hidden field.
    if (isDonor) body.type = document.getElementById('contact-type').value;
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
    if (filterRole) filterRole.addEventListener('change', () => {
      const showType = filterRole.value === 'donor';
      if (filterType) {
        filterType.hidden = !showType;
        if (!showType && filterType.value) filterType.value = '';
      }
      loadContacts();
    });
  }

  // ── Escape closes the contact panel ──
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
      // Vendor compliance data is admin-only server-side (vendorCompliance.js) -- hide
      // rather than let a non-admin click through to a 403 JSON body downloaded as if it
      // were a CSV.
      if (currentIsOrgAdmin) {
        // Calendar year, not fiscal year -- 1099 reporting always follows Jan-Dec
        // regardless of the org's own fiscal_year_end_month.
        const calendarYear = new Date().getFullYear();
        exportLink.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug)
          + '/vendor-compliance/1099-summary?year=' + calendarYear + '&format=csv';
        exportLink.hidden = false;
      }
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;

    await loadContacts();
  }

  init().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load contacts.');
    console.error('Contacts load error:', e);
  });
})();
