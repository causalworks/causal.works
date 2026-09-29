(function () {
  const errEl = document.getElementById('organizational-dash-error');
  const loadingEl = document.getElementById('organizational-dash-loading');
  const rootEl = document.getElementById('organizational-dash-root');
  const orgNameEl = document.getElementById('organizational-dash-narrative-orgname');
  const dateEl = document.getElementById('organizational-dash-date');
  const tilesEl = document.getElementById('organizational-dash-tiles');
  const attentionListEl = document.getElementById('organizational-dash-attention-list');
  const attentionEmptyEl = document.getElementById('organizational-dash-attention-empty');
  const coopSummaryBodyEl = document.getElementById('organizational-dash-coop-summary-body');

  let slug = '';
  let orgData = null;
  let grantsData = [];
  let actualsLastSyncAt = null;
  let pendingActualsCount = 0;
  let xeroConnected = false;
  let xeroConfigured = false;
  let attentionFeed = { items: [], setup: [] };
  let activityFeed = [];
  let coopSummary = null;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/dashboard\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function apiJson(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        console.error('API request timeout:', url);
        return null;
      }
      throw e;
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatHeaderDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function inferSummaryFiscalYear(org) {
    const endM = Number(org && org.fiscal_year_end_month) || 12;
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (endM === 12) return y;
    if (m > endM) return y + 1;
    return y;
  }

  function formatMoneyCents(cents) {
    if (cents == null || cents === '' || Number.isNaN(Number(cents))) return '—';
    const n = Number(cents) / 100;
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  function formatRunway(org) {
    const p =
      org && org.cooperative_profile && typeof org.cooperative_profile === 'object' ? org.cooperative_profile : {};
    const direct =
      p.runway_months != null
        ? Number(p.runway_months)
        : p.cash_runway_months != null
          ? Number(p.cash_runway_months)
          : NaN;
    if (Number.isFinite(direct) && direct >= 0) return String(Math.round(direct * 10) / 10) + ' mo';
    return '—';
  }

  function actualsContextLine() {
    const iso = actualsLastSyncAt || (orgData && orgData.actuals_last_sync_at);
    if (iso && typeof window.formatBasedOnActualsSynced === 'function') {
      return window.formatBasedOnActualsSynced(iso);
    }
    if (iso && typeof window.formatFreshnessLine === 'function') {
      return window.formatFreshnessLine(iso, 'imported');
    }
    return 'Import actuals to populate revenue and expenses';
  }

  function renderHeader() {
    if (!orgData) return;
    if (orgNameEl) {
      orgNameEl.textContent = orgData.display_name || 'your workspace';
    }
    if (dateEl) {
      const now = new Date();
      dateEl.dateTime = now.toISOString();
      dateEl.textContent = formatHeaderDate(now);
    }
    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(orgData.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(orgData.display_name || '—');
    }
  }

  function renderTiles(org, grants) {
    if (!tilesEl) return;
    const activeGrantCount = (grants || []).filter(function (g) {
      const st = String(g.status || '').toLowerCase();
      if (st !== 'awarded') return false;
      if (!g.end_date) return true;
      const t = new Date(String(g.end_date).slice(0, 10)).getTime();
      return !Number.isNaN(t) && t >= new Date(new Date().toISOString().slice(0, 10)).getTime();
    }).length;
    const runway = formatRunway(org);
    const rev = formatMoneyCents(org && org.revenue_ytd_cents);
    const exp = formatMoneyCents(org && org.expenses_ytd_cents);
    const syncNote = actualsContextLine();

    function tile(label, value, context, href, contextTone) {
      const tone = contextTone ? ' ' + contextTone : '';
      return (
        '<a class="organizational-dash-metric-tile" href="' +
        escapeHtml(href) +
        '">' +
        '<div class="organizational-dash-metric-label">' +
        escapeHtml(label) +
        '</div>' +
        '<div class="organizational-dash-metric-value">' +
        escapeHtml(value) +
        '</div>' +
        '<div class="organizational-dash-metric-context' +
        tone +
        '">' +
        escapeHtml(context) +
        '</div></a>'
      );
    }
    const base = '/organizational/o/' + encodeURIComponent(slug);
    // "Since your last visit": one tile in the metric row. Shows how many updates landed and
    // the most recent one; hidden entirely when nothing changed.
    function activityTile(baseUrl) {
      if (!Array.isArray(activityFeed) || activityFeed.length === 0) return '';
      const first = activityFeed[0];
      const more = activityFeed.length > 1 ? ' (+' + (activityFeed.length - 1) + ' more)' : '';
      return tile(
        'Since your last visit',
        activityFeed.length === 1 ? '1 update' : activityFeed.length + ' updates',
        String(first.title || 'Update') + more,
        baseUrl + '/' + String(first.href || 'dashboard'),
        ''
      );
    }
    const cashHint =
      org && org.cooperative_profile && Number(org.cooperative_profile.cash_balance_cents) > 0
        ? 'Based on ' + formatMoneyCents(org.cooperative_profile.cash_balance_cents) + ' cash on hand'
        : 'Set months of cash in Settings → Organization';

    tilesEl.innerHTML =
      tile('Months of cash', runway, runway === '—' ? cashHint : cashHint, base + '/reports/cash-forecast', '') +
      tile('Revenue YTD', rev, rev === '—' ? syncNote : syncNote, base + '/budget?view=actuals-only', '') +
      tile('Expenses YTD', exp, exp === '—' ? syncNote : syncNote, base + '/budget?view=actuals-only', '') +
      activityTile(base) +
      tile(
        'Active grants',
        String(activeGrantCount),
        activeGrantCount === 1 ? '1 active award' : activeGrantCount + ' active awards',
        base + '/grants?status=awarded&active=true',
        ''
      );
  }

  function daysFromNow(isoDate) {
    if (!isoDate) return null;
    const t = new Date(String(isoDate).slice(0, 10)).getTime();
    if (Number.isNaN(t)) return null;
    const dayMs = 86400000;
    return Math.ceil((t - Date.now()) / dayMs);
  }

  // Maps the attention feed's raw items (type/urgency_days/due_date/title/href) to this
  // row's actual render fields. The row template expected mod/context/aside directly on
  // each item, which the API never provided (fetchAttentionFeed only ever returned type/
  // urgency_days/due_date/title/href) -- every row, including the existing grant/task ones,
  // rendered the literal string "undefined" for context and aside, and always fell back to
  // the neutral (unstyled) row class regardless of real urgency. Fixed here rather than by
  // inventing new backend fields, since amber/danger/neutral is purely a display-severity
  // question the CSS already had classes for (organizational-dash-attn-row--amber/--danger/
  // --neutral) with nothing ever driving them.
  const ATTENTION_TYPE_LABELS = {
    grant: 'Grant', task: 'Task', reconciliation: 'Fiscal year',
    membership: 'Membership', document: 'Document', sponsored_project: 'Sponsored project',
  };
  function attentionRowView(r) {
    const days = r.urgency_days != null ? Number(r.urgency_days) : null;
    const mod = days == null ? 'neutral' : days <= 14 ? 'danger' : days <= 60 ? 'amber' : 'neutral';
    const context = ATTENTION_TYPE_LABELS[r.type] || 'Reminder';
    let aside = r.due_date || '';
    if (days != null) {
      aside = days < 0 ? `Overdue by ${Math.abs(days)}d` : days === 0 ? 'Today' : `In ${days}d`;
    }
    return { mod, context, aside };
  }

  function renderNeedsAttention() {
    if (!attentionListEl || !attentionEmptyEl) return;
    const rows = (attentionFeed && Array.isArray(attentionFeed.items) ? attentionFeed.items : []).slice();
    const setupRows = (attentionFeed && Array.isArray(attentionFeed.setup) ? attentionFeed.setup : []).slice();

    if (rows.length === 0 && setupRows.length === 0) {
      attentionListEl.innerHTML = '';
      attentionEmptyEl.hidden = false;
      return;
    }
    attentionEmptyEl.hidden = true;
    attentionListEl.innerHTML =
      rows
      .map(function (r) {
        const v = attentionRowView(r);
        return (
          '<a class="organizational-dash-attn-row organizational-dash-attn-row--' +
          escapeHtml(v.mod) +
          '" href="' +
          escapeHtml(r.href || '#') +
          '">' +
          '<span class="organizational-dash-attn-accent" aria-hidden="true"></span>' +
          '<span class="organizational-dash-attn-body">' +
          '<span class="organizational-dash-attn-title">' +
          escapeHtml(r.title || '') +
          '</span>' +
          '<span class="organizational-dash-attn-context">' +
          escapeHtml(v.context) +
          '</span></span>' +
          '<span class="organizational-dash-attn-aside">' +
          escapeHtml(v.aside) +
          '</span></a>'
        );
      })
      .join('') +
      (setupRows.length
        ? '<div class="organizational-dash-needs-title">Setup</div>' +
          setupRows
            .map(function (r) {
              return (
                '<a class="organizational-dash-attn-row organizational-dash-attn-row--neutral" href="' +
                escapeHtml(r.href || '#') +
                '"><span class="organizational-dash-attn-accent" aria-hidden="true"></span><span class="organizational-dash-attn-body"><span class="organizational-dash-attn-title">' +
                escapeHtml(r.title || 'Setup item') +
                '</span><span class="organizational-dash-attn-context">Complete setup to unlock dashboard insights</span></span><span class="organizational-dash-attn-aside">Open</span></a>'
              );
            })
            .join('')
        : '');
  }

  function renderCoopSummary() {
    if (!coopSummaryBodyEl) return;
    if (!coopSummary) {
      coopSummaryBodyEl.innerHTML = '<p class="organizational-empty">Cooperative summary unavailable right now.</p>';
      return;
    }
    const base = '/organizational/o/' + encodeURIComponent(slug);
    const workshops = Array.isArray(coopSummary.workshops) ? coopSummary.workshops : [];

    if (workshops.length === 0 && !coopSummary.work_pool_open_count && !coopSummary.library_contribution_count) {
      coopSummaryBodyEl.innerHTML =
        '<p class="organizational-empty">Not yet participating in any cooperative workshops. <a href="' +
        base +
        '/cooperative/workshop">Browse the Workshop</a> to get started.</p>';
      return;
    }

    const workshopsHtml = workshops.length
      ? '<ul class="organizational-dash-coop-workshop-list">' +
        workshops
          .map(function (w) {
            return (
              '<li><a href="' +
              escapeHtml(base + '/cooperative/workshop?open=' + encodeURIComponent(w.id)) +
              '">' +
              escapeHtml(w.name || 'Workshop project') +
              '</a></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="organizational-hint">Not participating in any workshops yet.</p>';

    coopSummaryBodyEl.innerHTML =
      '<p class="organizational-hint organizational-dash-coop-membership">Active Workshops</p>' +
      workshopsHtml +
      '<p class="organizational-hint organizational-dash-coop-stats">' +
      (coopSummary.work_pool_open_count || 0) +
      ' open Work Pool request' +
      (coopSummary.work_pool_open_count === 1 ? '' : 's') +
      ' &middot; ' +
      (coopSummary.library_contribution_count || 0) +
      ' library contribution' +
      (coopSummary.library_contribution_count === 1 ? '' : 's') +
      '</p>';
  }

  function renderAll() {
    renderHeader();
    renderTiles(orgData || {}, grantsData || []);
    renderNeedsAttention();
    renderCoopSummary();
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


  async function init() {
    slug = parseSlug();
    if (!slug) {
      if (loadingEl) loadingEl.hidden = true;
      showError('Invalid URL.');
      return;
    }

    try {
  const orgOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (!orgOut || !orgOut.res.ok || !orgOut.data || !orgOut.data.org) {
      if (loadingEl) loadingEl.hidden = true;
      showError((orgOut && orgOut.data && orgOut.data.error) || 'Could not load dashboard.');
      return;
    }
    orgData = orgOut.data.org;
    const fyStr = String(inferSummaryFiscalYear(orgData));

    const results = await Promise.allSettled([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/grants', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/actuals/last-sync', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/actuals?status=pending&limit=500', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/status', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dashboard/attention', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dashboard/activity', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dashboard/cooperative-summary', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/reports/budget-vs-actual?fiscal_year=' + encodeURIComponent(fyStr), { method: 'GET' }),
    ]);

    const [grantsOut, syncOut, pendingOut, xeroOut, attnOut, activityOut, coopSummaryOut, bvaOut] = results.map(r => r.status === 'fulfilled' ? r.value : null);

    // Revenue / Expenses YTD tiles: the org record never carried these fields, so the tiles were
    // always "—". Sum the posting lines of the budget-vs-actual report instead.
    if (bvaOut && bvaOut.res && bvaOut.res.ok && bvaOut.data && Array.isArray(bvaOut.data.lines)) {
      let revYtd = 0;
      let expYtd = 0;
      bvaOut.data.lines.forEach(function (l) {
        if (!l.is_posting) return;
        const v = Number(l.ytd_actual_cents) || 0;
        if (l.type === 'income') revYtd += v;
        else if (l.type === 'expense') expYtd += v;
      });
      if (revYtd !== 0 || expYtd !== 0) {
        orgData.revenue_ytd_cents = revYtd;
        orgData.expenses_ytd_cents = expYtd;
      }
    }

    grantsData =
      grantsOut && grantsOut.res && grantsOut.res.ok && Array.isArray(grantsOut.data.grants) ? grantsOut.data.grants : [];
    if (syncOut && syncOut.res && syncOut.res.ok && syncOut.data.last_sync_at) {
      actualsLastSyncAt = syncOut.data.last_sync_at;
    } else {
      actualsLastSyncAt = orgData.actuals_last_sync_at || null;
    }

    if (pendingOut && pendingOut.res && pendingOut.res.ok && Array.isArray(pendingOut.data.actuals)) {
      pendingActualsCount = pendingOut.data.actuals.length;
    } else {
      pendingActualsCount = 0;
    }

    if (xeroOut && xeroOut.res && xeroOut.res.ok) {
      xeroConfigured = !!xeroOut.data.configured;
      xeroConnected = !!xeroOut.data.connected;
    } else {
      xeroConfigured = false;
      xeroConnected = false;
    }
    if (attnOut && attnOut.res && attnOut.res.ok) {
      attentionFeed = {
        items: Array.isArray(attnOut.data.items) ? attnOut.data.items : [],
        setup: Array.isArray(attnOut.data.setup) ? attnOut.data.setup : [],
      };
    } else {
      attentionFeed = { items: [], setup: [] };
    }
    if (activityOut && activityOut.res && activityOut.res.ok) {
      activityFeed = Array.isArray(activityOut.data.items) ? activityOut.data.items : [];
    } else {
      activityFeed = [];
    }
    coopSummary = coopSummaryOut && coopSummaryOut.res && coopSummaryOut.res.ok ? coopSummaryOut.data : null;

    showError('');
    renderAll();
    if (loadingEl) loadingEl.hidden = true;
    if (rootEl) rootEl.hidden = false;

    apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/dashboard/visit', { method: 'POST' }).catch(function () {});
  } catch (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load dashboard.');
    console.error('Dashboard init error:', e);
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

      // Overlay outside click handler
      document.addEventListener('click', (e) => {
        const overlay = e.target.closest('.organizational-overlay');
        if (overlay && e.target === overlay) {
          closeOrganizationalOverlay();
        }
      });
    })();
  }

  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  init().catch(function(e) {
    if (loadingEl) loadingEl.hidden = true;
    showError("Could not load dashboard.");
    console.error("Dashboard load error:", e);
  });
})();
