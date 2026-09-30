(function () {
  const listEl = document.getElementById('organizational-org-list');
  const errEl = document.getElementById('organizational-error');
  const form = document.getElementById('organizational-create-org');
  const submitBtn = document.getElementById('organizational-create-submit');
  const createToggle = document.getElementById('organizational-create-toggle');
  const createPanel = document.getElementById('organizational-create-panel');
  const createCancel = document.getElementById('organizational-create-cancel');
  const causalHidden = document.getElementById('organizational-causal-org-id');
  const orgSearch = document.getElementById('organizational-org-search');
  const orgResults = document.getElementById('organizational-org-results');
  const orgChip = document.getElementById('organizational-org-chip');
  const orgChipLabel = document.getElementById('organizational-org-chip-label');
  const orgChipClear = document.getElementById('organizational-org-chip-clear');

  let orgSearchTimer = null;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function clearCivicPick() {
    if (causalHidden) causalHidden.value = '';
    if (orgChip) orgChip.hidden = true;
  }

  function openCreatePanel() {
    if (createPanel) createPanel.hidden = false;
    if (createToggle) createToggle.hidden = true;
    const nameEl = document.getElementById('organizational-display-name');
    if (nameEl) nameEl.focus();
  }

  function closeCreatePanel() {
    if (createPanel) createPanel.hidden = true;
    if (createToggle) createToggle.hidden = false;
  }

  if (createToggle) createToggle.addEventListener('click', openCreatePanel);
  if (createCancel) {
    createCancel.addEventListener('click', function () {
      showError('');
      if (form) form.reset();
      clearCivicPick();
      closeCreatePanel();
    });
  }

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

  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  async function runCivicSearch(q) {
    if (!orgResults) return;
    if (q.length < 2) {
      orgResults.innerHTML = '';
      orgResults.hidden = true;
      return;
    }
    const out = await apiJson('/api/organizational/orgs/search-civic?q=' + encodeURIComponent(q), { method: 'GET' });
    if (!out || !out.res.ok) {
      orgResults.innerHTML = '';
      orgResults.hidden = true;
      return;
    }
    const rows = out.data.orgs || [];
    if (rows.length === 0) {
      orgResults.innerHTML = '';
      orgResults.hidden = true;
      return;
    }
    orgResults.innerHTML = rows
      .map(function (row) {
        const id = Number(row.id);
        const name = String(row.name || '');
        return (
          '<li><button type="button" data-id="' +
          id +
          '">' +
          escapeHtml(name) +
          '</button></li>'
        );
      })
      .join('');
    orgResults.hidden = false;
  }

  if (orgSearch && orgResults) {
    orgSearch.addEventListener('input', function () {
      const q = String(orgSearch.value || '').trim();
      if (orgSearchTimer) clearTimeout(orgSearchTimer);
      orgSearchTimer = setTimeout(function () {
        runCivicSearch(q);
      }, 280);
    });

    orgSearch.addEventListener('blur', function () {
      setTimeout(function () {
        orgResults.hidden = true;
      }, 200);
    });

    orgSearch.addEventListener('focus', function () {
      const q = String(orgSearch.value || '').trim();
      if (q.length >= 2 && orgResults.children.length) orgResults.hidden = false;
    });

    orgResults.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest('button[data-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const name = (btn.textContent || '').trim();
      if (id) setCivicPick(id, name);
    });
  }

  if (orgChipClear) {
    orgChipClear.addEventListener('click', function () {
      clearCivicPick();
    });
  }

  function deriveDisplayNameFromEmail(email) {
    const local = String(email || '').split('@')[0] || '';
    const first = local.split(/[._+-]+/).filter(Boolean)[0] || local;
    return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : '';
  }

  function renderGreeting(name, realOrgs) {
    const eyebrowEl = document.getElementById('organizational-landing-eyebrow');
    const headingEl = document.getElementById('organizational-landing-heading');
    const subheadEl = document.getElementById('organizational-landing-subhead');
    if (!eyebrowEl || !headingEl) return;
    if (realOrgs.length === 0) {
      // First-time surface: this user has no workspace of their own yet (an unaccepted
      // invite doesn't count -- they still haven't set one up), so "Welcome back" and
      // "choose where to pick up" both assume state that doesn't exist for them.
      eyebrowEl.textContent = 'Welcome' + (name ? ', ' + name : '');
      headingEl.textContent = "Let's set up your organization";
      if (subheadEl) {
        subheadEl.textContent = 'Create a workspace below to get started, or explore the Turning Tide demo cooperative first.';
        subheadEl.hidden = false;
      }
      return;
    }
    eyebrowEl.textContent = 'Welcome back' + (name ? ', ' + name : '');
    if (subheadEl) subheadEl.hidden = true;
    headingEl.textContent = realOrgs.length === 1 ? realOrgs[0].display_name : 'Choose where to pick up';
  }

  function orgRowHtml(o) {
    const role = String(o.role || '').toLowerCase();
    const roleLabel = role ? role[0].toUpperCase() + role.slice(1) : '';
    const roleClass = role === 'admin' ? 'role-admin' : '';
    const slug = String(o.slug || '');
    const href = '/organizational/o/' + encodeURIComponent(slug);
    const step = String(o.onboarding_step || 'complete');
    const setupPill = step !== 'complete' ? '<span class="organizational-org-setup-pill">Setup</span>' : '';
    const visitedLine = o.last_dashboard_visit_at
      ? 'Visited ' + formatRelativeTime(o.last_dashboard_visit_at)
      : '';
    return (
      '<a class="organizational-org-card-link" href="' + escapeHtml(href) + '">' +
      '<div class="organizational-landing-org-row" data-org-status-slug="' + escapeHtml(slug) + '">' +
      '<div class="organizational-org-row-main">' +
      '<div class="organizational-org-name">' + escapeHtml(o.display_name) +
      '<span class="organizational-badge ' + roleClass + '">' + escapeHtml(roleLabel) + '</span>' +
      setupPill +
      '</div>' +
      '<div class="organizational-org-status-line" id="organizational-org-status-' + escapeHtml(slug) + '">Checking status…</div>' +
      '</div>' +
      '<div class="organizational-org-row-side">' + escapeHtml(visitedLine) + '</div>' +
      '</div></a>'
    );
  }

  function inviteRowHtml(invite) {
    const role = String(invite.role || '').toLowerCase();
    const roleLabel = role ? role[0].toUpperCase() + role.slice(1) : '';
    const href = '/accept-invite.html?invite_id=' + encodeURIComponent(invite.id);
    return (
      '<a class="organizational-org-card-link" href="' + escapeHtml(href) + '">' +
      '<div class="organizational-landing-org-row organizational-landing-org-row--invited">' +
      '<div class="organizational-org-row-main">' +
      '<div class="organizational-org-name">' + escapeHtml(invite.org_display_name) +
      '<span class="organizational-badge">Invited' + (roleLabel ? ' · ' + escapeHtml(roleLabel) : '') + '</span>' +
      '</div>' +
      '<div class="organizational-org-status-line">Waiting on your response</div>' +
      '</div>' +
      '<div class="organizational-org-row-side organizational-org-row-side--action">Review invite →</div>' +
      '</div></a>'
    );
  }

  async function loadOrgStatusLine(slug) {
    const el = document.getElementById('organizational-org-status-' + slug);
    if (!el) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dashboard/attention', { method: 'GET' });
      if (!out || !out.res.ok) { el.textContent = ''; return; }
      const items = Array.isArray(out.data) ? out.data : (out.data.items || []);
      el.textContent = items.length
        ? items.length + (items.length === 1 ? ' item needs' : ' items need') + ' attention'
        : 'All caught up';
    } catch (_) {
      el.textContent = '';
    }
  }

  function renderOrgs(orgs, invites) {
    if (!listEl) return;
    const realOrgs = (orgs || []).filter(function (o) { return !o.is_platform_demo; });
    const pendingInvites = invites || [];

    renderGreeting(window.organizationalLandingUserName || '', realOrgs);

    if (realOrgs.length === 0 && pendingInvites.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    const sortedOrgs = realOrgs.slice().sort(function (a, b) {
      const av = a.last_dashboard_visit_at ? new Date(a.last_dashboard_visit_at).getTime() : -1;
      const bv = b.last_dashboard_visit_at ? new Date(b.last_dashboard_visit_at).getTime() : -1;
      return bv - av;
    });

    listEl.innerHTML =
      sortedOrgs.map(orgRowHtml).join('') +
      pendingInvites.map(inviteRowHtml).join('');

    sortedOrgs.forEach(function (o) { loadOrgStatusLine(String(o.slug || '')); });
  }

  async function loadOrgs() {
    showError('');
    const [orgsOut, invitesOut] = await Promise.all([
      apiJson('/api/organizational/orgs', { method: 'GET' }),
      apiJson('/api/organizational/invites/mine', { method: 'GET' }),
    ]);
    if (!orgsOut) { return; }
    if (!orgsOut.res.ok) {
      showError(orgsOut.data.error || 'Could not load organizations.');
      renderOrgs([], []);
      return;
    }
    const orgs = orgsOut.data.orgs || [];
    const invites = (invitesOut && invitesOut.res.ok) ? (invitesOut.data.invites || []) : [];

    // This is the Cooperative start page. Someone with no workspace of their own sees the create
    // form and the Sandbox card for the Turning Tide demo cooperative (every signup is already
    // enrolled in it as staff, bootstrap_demo_org_membership, migration 155), and chooses.
    // Until 2026-09-30 this redirected straight into the demo because self-serve org creation
    // was thought not to work; it does (POST /orgs grants admin), so the redirect hid the
    // create option from a first-time user. ?create=1 (account.html's "Create a new
    // organization") still opens the create panel.
    const realOrgs = orgs.filter(function (o) { return !o.is_platform_demo; });
    const openCreate = new URLSearchParams(window.location.search).get('create') === '1';

    // With no workspace yet, every sidebar link would go nowhere (they need an org slug in the
    // URL), so this first-time view shows no sidebar.
    if (realOrgs.length === 0) {
      const sidebarMount = document.getElementById('organizational-sidebar-mount');
      if (sidebarMount) sidebarMount.hidden = true;
    }

    renderOrgs(orgs, invites);
    if (openCreate) openCreatePanel();
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showError('');
      const displayName = (document.getElementById('organizational-display-name') || {}).value;
      const slug = (document.getElementById('organizational-slug') || {}).value;
      const einEl = document.getElementById('organizational-ein');
      const fyEl = document.getElementById('organizational-fy-month');

      const body = { display_name: String(displayName || '').trim() };
      if (!body.display_name) {
        showError('Organization name is required.');
        return;
      }
      const fyRaw = fyEl ? Number.parseInt(String(fyEl.value || '12'), 10) : 12;
      if (!Number.isInteger(fyRaw) || fyRaw < 1 || fyRaw > 12) {
        showError('Choose a valid fiscal year end month.');
        return;
      }
      body.fiscal_year_end_month = fyRaw;
      const einStr = einEl ? String(einEl.value || '').trim() : '';
      if (einStr) body.ein = einStr;
      const s = String(slug || '').trim();
      if (s) body.slug = s;
      const c = causalHidden ? String(causalHidden.value || '').trim() : '';
      if (c) {
        const n = Number(c);
        if (!Number.isInteger(n) || n < 1) {
          showError('Choose a directory org from search, or clear the link.');
          return;
        }
        body.causal_org_id = n;
      }

      submitBtn.disabled = true;
      const out = await apiJson('/api/organizational/orgs', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      submitBtn.disabled = false;
      if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
      if (!out.res.ok) {
        const d = out.data || {};
        const parts = [d.error, d.hint].filter(Boolean);
        showError(parts.length ? parts.join(' ') : 'Could not create organization.');
        return;
      }
      const redir = out.data.redirect || out.data.redirect_onboarding;
      if (redir) {
        window.location.href = redir;
        return;
      }
      form.reset();
      clearCivicPick();
      closeCreatePanel();
      await loadOrgs();
    });
  }

  // When reached via the org-framed route (/o/:slug/new -- "+ Create a new organization" from
  // inside a workspace), the header should show that workspace's own name like every other page
  // under it, not the generic "cooperative"/"causalworks" defaults. The bare /organizational/
  // route has no single org to show here, so this is a no-op there (sidebar.js's own slug parse
  // returns '' and OrganizationalHeader.setOrg is simply never called).
  async function setHeaderOrgIfFramed() {
    const slug = window.OrganizationalSidebar && typeof window.OrganizationalSidebar.slugFromPath === 'function'
      ? window.OrganizationalSidebar.slugFromPath() : '';
    if (!slug) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
      const org = out && out.res.ok && out.data ? out.data.org : null;
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (_) { /* header falls back to the generic defaults */ }
  }

  (async function initLanding() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        window.organizationalLandingUserName = deriveDisplayNameFromEmail(me.email);
      }
    } catch (_) { /* greeting falls back to no name */ }
    await Promise.all([loadOrgs(), setHeaderOrgIfFramed()]);
  })();

  // Initialize header elements
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        // Show coop icon for workers, hide for public users
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    // Bind outside click handlers
    bindOrganizationalDropdownOutsideClick();

    // Escape key handler
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
})();
