(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const slugLineEl = document.getElementById('organizational-org-slug-line');
  const roleBadgeEl = document.getElementById('organizational-org-role-badge');
  const fyEl = document.getElementById('organizational-proj-fy');
  const loadBtn = document.getElementById('organizational-proj-load');
  const manualTbody = document.getElementById('organizational-proj-manual-tbody');
  const allocTbody = document.getElementById('organizational-proj-alloc-tbody');
  const addManualBtn = document.getElementById('organizational-proj-add-manual');
  const addAllocBtn = document.getElementById('organizational-proj-add-allocation');
  const recalcBtn = document.getElementById('organizational-proj-recalc');
  const manualFreshEl = document.getElementById('organizational-proj-manual-fresh');
  const allocFreshEl = document.getElementById('organizational-proj-alloc-fresh');
  let currentSlug = '';

  function showError(msg) { if (!errEl) return; errEl.textContent = msg || ''; errEl.hidden = !msg; }
  function parseSlug() { const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/projections\/?$/); return m ? decodeURIComponent(m[1]) : ''; }
  function fy() { const n = Number.parseInt(String(fyEl && fyEl.value), 10); return Number.isInteger(n) ? n : new Date().getFullYear(); }
  function usd(c) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format((Number(c) || 0) / 100); }

  function setFresh(el, text) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
  }

  async function loadTables() {
    const y = fy();
    const projOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/projections?fiscal_year=' + encodeURIComponent(String(y)));
    manualTbody.innerHTML = '';
    if (!projOut || !projOut.res.ok) {
      manualTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">Could not load manual overrides.</td></tr>';
    } else {
      const rows = Array.isArray(projOut.data.projections) ? projOut.data.projections.slice() : [];
      rows.sort(function (a, b) {
        return String(a.account_code || '').localeCompare(String(b.account_code || '')) || Number(a.coop_program_id) - Number(b.coop_program_id) || Number(a.period_month || 0) - Number(b.period_month || 0);
      });
      manualTbody.innerHTML = rows.length
        ? rows.map(function (r) {
            const scope = r.formula ? 'Formula' : r.period_month ? 'Monthly (' + r.period_month + ')' : 'Annual';
            const source = r.formula ? 'Formula' : r.period_month ? 'Manual monthly' : 'Manual annual';
            const value = r.formula ? '<code>' + (r.formula || '') + '</code> <span class="organizational-hint">= ' + usd(r.amount_cents) + '</span>' : usd(r.amount_cents);
            return '<tr><td>' + (r.account_code || '') + ' ' + (r.account_name || '') + '</td><td>' + (r.program_name || r.coop_program_id) + '</td><td>' + scope + '</td><td>' + value + '</td><td>' + source + '</td><td>' + (r.notes || '—') + '</td><td><button class="organizational-btn organizational-btn-outline" data-edit-proj="' + r.id + '" data-account="' + r.coop_account_id + '" data-program="' + r.coop_program_id + '">Edit</button> <button class="organizational-btn organizational-btn-outline" data-del-proj="' + r.id + '">Clear</button></td></tr>';
          }).join('')
        : '<tr class="organizational-table-empty"><td colspan="7">No planned amount overrides yet. Projected values are calculated from actuals and budget. Click any projected cell on Budget to add an override.</td></tr>';
      const freshest = rows.reduce(function (max, r) {
        return !max || String(r.updated_at || '') > String(max) ? String(r.updated_at || '') : max;
      }, '');
      if (freshest && typeof window.formatFreshnessLine === 'function') setFresh(manualFreshEl, window.formatFreshnessLine(freshest, 'updated'));
      else setFresh(manualFreshEl, '');
      manualTbody.querySelectorAll('[data-edit-proj]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!window.OrganizationalProjectionEditor) return;
          await window.OrganizationalProjectionEditor.open({
            slug: currentSlug,
            fiscalYear: y,
            accountId: Number(b.getAttribute('data-account')),
            programId: Number(b.getAttribute('data-program')),
            showContextPickers: false,
            onSaved: loadTables,
            onError: function (e) { showError((e && e.message) || 'Could not edit projection'); },
          });
        });
      });
      manualTbody.querySelectorAll('[data-del-proj]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!window.confirm('Clear this projection override?')) return;
          await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/projections/' + encodeURIComponent(b.getAttribute('data-del-proj')), { method: 'DELETE' });
          await loadTables();
        });
      });
    }

    const allocOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/allocation-schedules?fiscal_year=' + encodeURIComponent(String(y)));
    allocTbody.innerHTML = '';
    if (!allocOut || !allocOut.res.ok) {
      allocTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">Could not load distribution schedules.</td></tr>';
      return;
    }
    const sr = Array.isArray(allocOut.data.schedules) ? allocOut.data.schedules : [];
    if (sr.length) {
      const detailRows = await Promise.all(
        sr.map(async function (s) {
          const dOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/allocation-schedules/' + encodeURIComponent(String(s.id)));
          const lines = dOut && dOut.res && dOut.res.ok && Array.isArray(dOut.data.lines) ? dOut.data.lines : [];
          const programsCovered = new Set(lines.map(function (l) { return Number(l.coop_program_id); })).size;
          const accountsCovered = new Set(lines.map(function (l) { return Number(l.coop_account_id); })).size;
          return '<tr><td>' + s.name + '</td><td>' + s.fiscal_year + '</td><td>' + usd(s.total_amount_cents) + '</td><td>' + programsCovered + '</td><td>' + accountsCovered + '</td><td>' + (s.active ? 'Active' : 'Inactive') + '</td><td><a class="organizational-nav-link" href="/organizational/o/' + encodeURIComponent(currentSlug) + '/projections/allocations/' + encodeURIComponent(String(s.id)) + '">Edit</a></td></tr>';
        })
      );
      allocTbody.innerHTML = detailRows.join('');
    } else {
      allocTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="7">No distribution schedules. Schedules distribute one total across programs, accounts, and months. <a class="organizational-nav-link" href="/organizational/o/' + encodeURIComponent(currentSlug) + '/projections/allocations/new">+ New schedule</a></td></tr>';
    }
    const allocFresh = sr.reduce(function (max, r) {
      return !max || String(r.updated_at || '') > String(max) ? String(r.updated_at || '') : max;
    }, '');
    if (allocFresh && typeof window.formatFreshnessLine === 'function') setFresh(allocFreshEl, window.formatFreshnessLine(allocFresh, 'updated'));
    else setFresh(allocFreshEl, '');
  }

  async function addManual() {
    if (!window.OrganizationalProjectionEditor) return;
    await window.OrganizationalProjectionEditor.open({
      slug: currentSlug,
      fiscalYear: fy(),
      showContextPickers: true,
      onSaved: loadTables,
      onError: function (e) {
        showError((e && e.message) || 'Could not save planned amount');
      },
    });
  }

  async function load() {
    currentSlug = parseSlug();
    if (!currentSlug) return showError('Invalid workspace URL.');
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), { method: 'GET' });
    if (!out || !out.res.ok) return showError((out && out.data && out.data.error) || 'Could not load workspace.');
    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;
    const org = out.data.org || {};
    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }
    if (slugLineEl) slugLineEl.textContent = 'Slug ' + (org.slug || '');
    if (roleBadgeEl) { roleBadgeEl.textContent = org.role || ''; roleBadgeEl.hidden = !org.role; }
    fyEl.value = String(new Date().getFullYear());
    await loadTables();
  }

  loadBtn && loadBtn.addEventListener('click', loadTables);
  addManualBtn && addManualBtn.addEventListener('click', addManual);
  addAllocBtn && addAllocBtn.addEventListener('click', function () { window.location.href = '/organizational/o/' + encodeURIComponent(currentSlug) + '/projections/allocations/new'; });
  recalcBtn && recalcBtn.addEventListener('click', async function () {
    await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/projections/recalculate?fiscal_year=' + encodeURIComponent(String(fy())), { method: 'POST' });
    await loadTables();
  });
  load();

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


  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;
})();
