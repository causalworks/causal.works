(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const titleEl = document.getElementById('organizational-org-title');
  const metricRunway = document.getElementById('organizational-m-runway');
  const metricRevenue = document.getElementById('organizational-m-revenue');
  const metricExpenses = document.getElementById('organizational-m-expenses');
  const metricGrants = document.getElementById('organizational-m-grants');

  let currentSlug = '';

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function updateSubnavLinks(slug) {
    const base = '/organizational/o/' + encodeURIComponent(slug);
    const links = [
      ['organizational-nav-dashboard', base + '/dashboard'],
      ['organizational-nav-budget', base + '/budget'],
      ['organizational-nav-grants', base + '/grants'],
      ['organizational-nav-reports', base + '/reports'],
      ['organizational-nav-settings', base + '/settings'],
    ];
    links.forEach(function (pair) {
      const el = document.getElementById(pair[0]);
      if (el) el.href = pair[1];
    });
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }
    if (res.status === 403 && String(url || '').indexOf('/api/organizational/') !== -1) {
      window.location.href = '/app.html?coop=disabled';
      return null;
    }
    return { res, data };
  }

  function formatUsdFromCents(cents) {
    if (cents == null || cents === '') return '$0';
    const n = Number(cents);
    if (!Number.isFinite(n)) return '$0';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100);
  }

  function formatRunway(org) {
    const p = org && org.cooperative_profile && typeof org.cooperative_profile === 'object'
      ? org.cooperative_profile
      : {};
    const direct = p.runway_months != null ? Number(p.runway_months) : p.cash_runway_months != null ? Number(p.cash_runway_months) : NaN;
    if (Number.isFinite(direct) && direct >= 0) {
      return String(Math.round(direct * 10) / 10) + ' mo';
    }
    return '0 mo';
  }

  function renderOverviewMetrics(org) {
    if (metricRunway) metricRunway.textContent = formatRunway(org);
    if (metricRevenue) metricRevenue.textContent = formatUsdFromCents(org && org.revenue_ytd_cents);
    if (metricExpenses) metricExpenses.textContent = formatUsdFromCents(org && org.expenses_ytd_cents);
    if (metricGrants) {
      const active = Number(org && org.active_grants_count);
      metricGrants.textContent = Number.isFinite(active) && active >= 0 ? String(active) : '0';
    }
  }

  async function load() {
    const slug = parseSlug();
    if (!slug) {
      showError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    updateSubnavLinks(slug);
    showError('');

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
    if (out.res.status === 404) {
      if (loadingEl) loadingEl.hidden = true;
      showError(out.data.error || 'Organization not found.');
      return;
    }
    if (!out.res.ok) {
      if (loadingEl) loadingEl.hidden = true;
      showError(out.data.error || 'Could not load workspace.');
      return;
    }

    const org = out.data.org;
    if (!org) {
      if (loadingEl) loadingEl.hidden = true;
      showError('Invalid response.');
      return;
    }

    if (titleEl) titleEl.textContent = org.display_name || '—';
    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }

    const onbBanner = document.getElementById('organizational-onboarding-banner');
    const onbLink = document.getElementById('organizational-onboarding-banner-link');
    const onbStep = String(org.onboarding_step || 'complete');
    if (onbBanner && onbLink) {
      if (onbStep !== 'complete') {
        onbBanner.hidden = false;
        onbLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/onboarding';
      } else {
        onbBanner.hidden = true;
      }
    }

    renderOverviewMetrics(org);
    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;
  }

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

  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  load().catch(function(e) {
    if (loadingEl) loadingEl.hidden = true;
    showError("Could not load org.");
    console.error("Org load error:", e);
  });
})();
