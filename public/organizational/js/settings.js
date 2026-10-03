(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const titleEl = document.getElementById('organizational-org-title');
  const slugLineEl = document.getElementById('organizational-org-slug-line');
  const roleBadgeEl = document.getElementById('organizational-org-role-badge');
  console.log('DOM elements fetched');

  const orgDisplayName = document.getElementById('organizational-org-display-name');
  const orgEin = document.getElementById('organizational-org-ein');
  const orgState = document.getElementById('organizational-org-state');
  const orgFyEndMonth = document.getElementById('organizational-org-fy-end-month');
  const orgMission = document.getElementById('organizational-org-mission');
  const orgWebsite = document.getElementById('organizational-org-website');
  const orgSaveBtn = document.getElementById('organizational-org-save');

  const orgDangerZoneEl = document.getElementById('organizational-org-danger-zone');
  const orgDeleteOpenBtn = document.getElementById('organizational-org-delete-open');
  const orgDeleteModal = document.getElementById('organizational-org-delete-modal');
  const orgDeleteForm = document.getElementById('organizational-org-delete-form');
  const orgDeleteNameEl = document.getElementById('organizational-org-delete-name');
  const orgDeleteNameEl2 = document.getElementById('organizational-org-delete-name-2');
  const orgDeleteConfirmInput = document.getElementById('organizational-org-delete-confirm');
  const orgDeleteConfirmBtn = document.getElementById('organizational-org-delete-confirm-btn');
  const orgDeleteCancelBtn = document.getElementById('organizational-org-delete-cancel');
  const orgDeleteErrorEl = document.getElementById('organizational-org-delete-error');

  const orgWorkspaceUsersZoneEl = document.getElementById('organizational-workspace-users-zone');
  const orgWorkspaceUsersDemoNoteEl = document.getElementById('organizational-workspace-users-demo-note-wrap');
  const userInviteBtn = document.getElementById('organizational-user-invite');
  const userModal = document.getElementById('organizational-user-modal');
  const userForm = document.getElementById('organizational-user-form');
  const userEmail = document.getElementById('organizational-user-email');
  const userRole = document.getElementById('organizational-user-role');
  const userProgramsField = document.getElementById('organizational-user-programs-field');
  const userProgramsList = document.getElementById('organizational-user-programs-list');
  const userCancelBtn = document.getElementById('organizational-user-cancel');
  const usersTbody = document.getElementById('organizational-users-tbody');
  const invitesTbody = document.getElementById('organizational-invites-tbody');

  const roleModal = document.getElementById('organizational-role-modal');
  const roleForm = document.getElementById('organizational-role-form');
  const roleMemberIdInput = document.getElementById('organizational-role-member-id');
  const roleSelect = document.getElementById('organizational-role-select');
  const roleProgramsField = document.getElementById('organizational-role-programs-field');
  const roleProgramsList = document.getElementById('organizational-role-programs-list');
  const roleCancelBtn = document.getElementById('organizational-role-cancel');
  let orgProgramsCache = null; // fetched once per settings-page load, reused across role-modal opens
  console.log('User elements fetched');

  const panelOrg = document.getElementById('organizational-settings-panel-organization');
  const settingsTabOrg = document.getElementById('organizational-settings-tab-org');
  const panelIntegrations = document.getElementById('organizational-settings-panel-integrations');
  const settingsTabIntegrations = document.getElementById('organizational-settings-tab-integrations');

  // Integrations tab — Xero connect/disconnect/status. Moved back here 2026-09-12 after
  // briefly living in Budget's Settings tab (see budget-settings.js's own comment on this) —
  // an OAuth credential belongs to the whole org, not to whichever module consumed it first.
  // Account/tracking-category MAPPING (which needs Programs) stays in Budget's own Settings
  // tab under "Chart of accounts" — this page only owns the connection itself and a raw,
  // read-only list of what Xero returns.
  const xeroBtn = document.getElementById('organizational-connect-xero');
  const xeroHint = document.getElementById('organizational-xero-hint');
  const xeroStatusLine = document.getElementById('organizational-xero-status-line');
  const xeroSyncFreshness = document.getElementById('organizational-xero-sync-freshness');
  const xeroConfigWarn = document.getElementById('organizational-xero-config-warn');
  const xeroRefreshBtn = document.getElementById('organizational-xero-refresh');
  const xeroDisconnectBtn = document.getElementById('organizational-xero-disconnect');
  const xeroTrackingSection = document.getElementById('organizational-xero-tracking-section');
  const xeroTrackingTbody = document.getElementById('organizational-xero-tracking-tbody');
  const xeroMappingLink = document.getElementById('organizational-xero-mapping-link');
  let xeroUiWired = false;

  const fiscalSponsorshipMode = document.getElementById('organizational-fiscal-sponsorship-mode');
  const fiscalSponsorshipFields = document.getElementById('organizational-fiscal-sponsorship-fields');
  const sponsorshipModel = document.getElementById('organizational-sponsorship-model');
  const defaultAdminRate = document.getElementById('organizational-default-admin-rate');
  const fiscalSponsorshipSave = document.getElementById('organizational-fiscal-sponsorship-save');
  const sponsoredProjectsCount = document.getElementById('organizational-sponsored-projects-count');

  const membershipEnabledCheckbox = document.getElementById('organizational-membership-enabled');
  const membershipSave = document.getElementById('organizational-membership-save');

  const sessionTimeoutSelect = document.getElementById('organizational-session-timeout');
  const sessionTimeoutSave = document.getElementById('organizational-session-timeout-save');

  const entityClassification = document.getElementById('organizational-entity-classification');
  const federalGrantRecipient = document.getElementById('organizational-federal-grant-recipient');
  const lobbyingActivity = document.getElementById('organizational-lobbying-activity');
  const politicalActivity = document.getElementById('organizational-political-activity');
  const stateRegistrations = document.getElementById('organizational-state-registrations');
  const orgCharacteristicsSave = document.getElementById('organizational-org-characteristics-save');

  let currentSlug = '';
  let currentIsOrgAdmin = false;
  console.log('Variables initialized');

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  // Organization and Integrations are the two org-wide settings tabs. Chart of accounts and
  // Imports live in Budget's own Settings tab (2026-09-11; see budget-settings.js) — that
  // data is Budget-module config, not true regardless-of-module. Organization is an
  // enterprise app; this page is for things true no matter which modules are on, and
  // Integrations belongs here rather than in a module because a connection is an org-wide
  // credential surface other modules (Budget, Compliance) consume, not something any one of
  // them owns.
  function parseSettingsPath() {
    const m = (window.location.pathname || '').match(
      /^\/organizational\/o\/([^/]+)\/settings(?:\/(organization|integrations))?\/?$/
    );
    if (!m) return { slug: '', tab: 'organization' };
    return { slug: decodeURIComponent(m[1]), tab: m[2] || 'organization' };
  }

  function wireSettingsSubnavHrefs(slug) {
    const base = '/organizational/o/' + encodeURIComponent(slug) + '/settings/';
    if (settingsTabOrg) settingsTabOrg.href = base + 'organization';
    if (settingsTabIntegrations) settingsTabIntegrations.href = base + 'integrations';
    // Budget's tabs are client-side only (no deep-linkable URL per tab) — link to the page
    // itself; the user clicks its own Settings tab from there.
    if (xeroMappingLink) xeroMappingLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/budget';
  }

  const SETTINGS_TAB_TITLES = {
    organization: 'Organization',
    integrations: 'Integrations',
  };

  function applySettingsTab(tab) {
    const t = tab === 'integrations' ? 'integrations' : 'organization';
    if (panelOrg) panelOrg.hidden = t !== 'organization';
    if (panelIntegrations) panelIntegrations.hidden = t !== 'integrations';
    if (settingsTabOrg) settingsTabOrg.classList.toggle('organizational-settings-subnav--active', t === 'organization');
    if (settingsTabIntegrations) settingsTabIntegrations.classList.toggle('organizational-settings-subnav--active', t === 'integrations');
    if (titleEl) titleEl.textContent = 'Settings | ' + SETTINGS_TAB_TITLES[t];
  }
  // Reflects the server-side admin-only gating (see npAdmin / orgIdForAdminMember on the
  // backend) in the UI: staff members of an org — including the many unrelated accounts
  // auto-enrolled as staff in the shared Demo Company sandbox (server.js enrollInDemoCooperative)
  // — should never see org-management controls they can't actually use.
  function applyPermissionGating(org) {
    currentIsOrgAdmin = isAdminRole(org.role);

    if (orgDangerZoneEl) orgDangerZoneEl.hidden = !currentIsOrgAdmin || !!org.is_platform_demo;
    if (orgWorkspaceUsersZoneEl) orgWorkspaceUsersZoneEl.hidden = !currentIsOrgAdmin || !!org.is_platform_demo;
    if (orgWorkspaceUsersDemoNoteEl) orgWorkspaceUsersDemoNoteEl.hidden = !(currentIsOrgAdmin && org.is_platform_demo);

    // Chart of accounts/Programs/Imports gating lives in budget-settings.js's own
    // applyBudgetSettingsPermissionGating() along with those elements (2026-09-11).
    [
      orgDisplayName, orgEin, orgState, orgFyEndMonth, orgMission, orgWebsite, orgSaveBtn,
      fiscalSponsorshipMode, sponsorshipModel, defaultAdminRate, fiscalSponsorshipSave,
      membershipEnabledCheckbox, membershipSave,
      sessionTimeoutSelect, sessionTimeoutSave,
      entityClassification, federalGrantRecipient, lobbyingActivity, politicalActivity,
      stateRegistrations, orgCharacteristicsSave,
    ].forEach(function (el) {
      if (el) el.disabled = !currentIsOrgAdmin;
    });
    if (xeroBtn) xeroBtn.disabled = !currentIsOrgAdmin;
    if (xeroDisconnectBtn) xeroDisconnectBtn.disabled = !currentIsOrgAdmin;
  }

  function wireOrgBasicsSave() {
    if (!orgSaveBtn) return;
    orgSaveBtn.addEventListener('click', async function () {
      if (!currentSlug) return;
      const body = {
        display_name: String((orgDisplayName && orgDisplayName.value) || '').trim(),
        ein: String((orgEin && orgEin.value) || '').trim(),
        state: String((orgState && orgState.value) || '').trim() || null,
        fiscal_year_end_month: Number((orgFyEndMonth && orgFyEndMonth.value) || 12),
        cooperative_profile: {
          mission: String((orgMission && orgMission.value) || '').trim(),
          website: String((orgWebsite && orgWebsite.value) || '').trim(),
        },
      };
      orgSaveBtn.disabled = true;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      orgSaveBtn.disabled = false;
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not save organization basics.');
        return;
      }
      showError('');
      const org = out.data && out.data.org;
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    });
  }

  function wireOrgDelete() {
    if (!orgDeleteOpenBtn || !orgDeleteModal || !orgDeleteForm) return;

    function orgName() {
      return String((orgDisplayName && orgDisplayName.value) || '').trim();
    }

    function closeModal() {
      orgDeleteModal.classList.remove('organizational-modal-open');
      orgDeleteForm.reset();
      if (orgDeleteErrorEl) {
        orgDeleteErrorEl.hidden = true;
        orgDeleteErrorEl.textContent = '';
      }
      if (orgDeleteConfirmBtn) orgDeleteConfirmBtn.disabled = true;
    }

    orgDeleteOpenBtn.addEventListener('click', function () {
      const name = orgName();
      if (orgDeleteNameEl) orgDeleteNameEl.textContent = name;
      if (orgDeleteNameEl2) orgDeleteNameEl2.textContent = name;
      orgDeleteModal.classList.add('organizational-modal-open');
      if (orgDeleteConfirmInput) orgDeleteConfirmInput.focus();
    });

    if (orgDeleteCancelBtn) {
      orgDeleteCancelBtn.addEventListener('click', closeModal);
    }
    orgDeleteModal.addEventListener('click', function (e) {
      if (e.target === orgDeleteModal) closeModal();
    });

    if (orgDeleteConfirmInput) {
      orgDeleteConfirmInput.addEventListener('input', function () {
        if (orgDeleteConfirmBtn) {
          orgDeleteConfirmBtn.disabled = orgDeleteConfirmInput.value !== orgName();
        }
      });
    }

    orgDeleteForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!currentSlug || !orgDeleteConfirmInput || orgDeleteConfirmInput.value !== orgName()) return;
      if (orgDeleteConfirmBtn) orgDeleteConfirmBtn.disabled = true;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
        method: 'DELETE',
        body: JSON.stringify({ confirm_name: orgDeleteConfirmInput.value }),
      });
      if (!out || !out.res.ok) {
        if (orgDeleteErrorEl) {
          orgDeleteErrorEl.textContent = (out && out.data && out.data.error) || 'Could not delete organization.';
          orgDeleteErrorEl.hidden = false;
        }
        if (orgDeleteConfirmBtn) orgDeleteConfirmBtn.disabled = false;
        return;
      }
      window.location.href = '/organizational/';
    });
  }

  async function loadSponsoredProjectsCount(slug) {
    if (!sponsoredProjectsCount) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/sponsored-projects', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (res.ok && data.sponsored_projects) {
        sponsoredProjectsCount.textContent = String(data.sponsored_projects.length);
      } else {
        sponsoredProjectsCount.textContent = '0';
      }
    } catch (e) {
      console.error('loadSponsoredProjectsCount:', e);
      sponsoredProjectsCount.textContent = '0';
    }
  }

  function wireFiscalSponsorship() {
    if (!fiscalSponsorshipMode) return;
    
    // Toggle visibility of fiscal sponsorship fields
    fiscalSponsorshipMode.addEventListener('change', function () {
      if (fiscalSponsorshipFields) {
        fiscalSponsorshipFields.hidden = !this.checked;
      }
    });

    // Save fiscal sponsorship settings
    if (fiscalSponsorshipSave) {
      fiscalSponsorshipSave.addEventListener('click', async function () {
        if (!currentSlug) return;
        
        const body = {
          fiscal_sponsorship_mode: fiscalSponsorshipMode ? fiscalSponsorshipMode.checked : false,
        };
        
        if (sponsorshipModel && sponsorshipModel.value) {
          body.sponsorship_model = sponsorshipModel.value;
        }
        
        if (defaultAdminRate && defaultAdminRate.value) {
          body.default_admin_rate = Number(defaultAdminRate.value);
        }
        
        fiscalSponsorshipSave.disabled = true;
        try {
          const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          if (!out || !out.res.ok) {
            showError((out && out.data && out.data.error) || 'Could not save fiscal sponsorship settings.');
            return;
          }
          showError('');
          if (sponsoredProjectsCount) {
            await loadSponsoredProjectsCount(currentSlug);
          }
          if (typeof window.OrganizationalSidebar === 'object' && typeof window.OrganizationalSidebar.checkOptionalFeatures === 'function') {
            window.OrganizationalSidebar.checkOptionalFeatures();
          }
        } catch (e) {
          console.error('fiscalSponsorshipSave error:', e);
          showError('Could not save fiscal sponsorship settings.');
        } finally {
          fiscalSponsorshipSave.disabled = false;
        }
      });
    }
  }

  function wireMembership() {
    if (!membershipSave) return;

    membershipSave.addEventListener('click', async function () {
      if (!currentSlug) return;

      const body = {
        membership_enabled: membershipEnabledCheckbox ? membershipEnabledCheckbox.checked : false,
      };

      membershipSave.disabled = true;
      try {
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not save membership settings.');
          return;
        }
        showError('');
        if (typeof window.OrganizationalSidebar === 'object' && typeof window.OrganizationalSidebar.checkOptionalFeatures === 'function') {
          window.OrganizationalSidebar.checkOptionalFeatures();
        }
      } catch (e) {
        console.error('wireMembership error:', e);
        showError('Could not save membership settings.');
      } finally {
        membershipSave.disabled = false;
      }
    });
  }

  function wireSessionTimeout() {
    if (!sessionTimeoutSave) return;

    sessionTimeoutSave.addEventListener('click', async function () {
      if (!currentSlug) return;

      const body = {
        session_timeout_minutes: sessionTimeoutSelect ? Number(sessionTimeoutSelect.value) : 30,
      };

      sessionTimeoutSave.disabled = true;
      try {
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not save security settings.');
          return;
        }
        showError('');
      } catch (e) {
        console.error('wireSessionTimeout error:', e);
        showError('Could not save security settings.');
      } finally {
        sessionTimeoutSave.disabled = false;
      }
    });
  }

  function wireOrgCharacteristics() {
    if (!orgCharacteristicsSave) return;

    orgCharacteristicsSave.addEventListener('click', async function () {
      if (!currentSlug) return;

      const body = {};

      if (entityClassification && entityClassification.value) {
        body.entity_classification = entityClassification.value;
      }

      if (federalGrantRecipient) {
        body.federal_grant_recipient = federalGrantRecipient.checked;
      }

      if (lobbyingActivity) {
        body.has_lobbying_activity = lobbyingActivity.checked;
      }

      if (politicalActivity) {
        body.has_political_electoral_activity = politicalActivity.checked;
      }

      if (stateRegistrations && stateRegistrations.value) {
        const states = stateRegistrations.value.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2);
        body.state_charitable_solicitation_registrations = states.length > 0 ? states : null;
      }

      orgCharacteristicsSave.disabled = true;
      try {
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not save organization characteristics.');
          return;
        }
        showError('');
      } catch (e) {
        console.error('orgCharacteristicsSave error:', e);
        showError('Could not save organization characteristics.');
      } finally {
        orgCharacteristicsSave.disabled = false;
      }
    });
  }

  // ─── Integrations (Xero) ────────────────────────────────────────────────────
  // Connection/status/raw-data-browsing only — account/tracking-category MAPPING lives in
  // Budget's own Settings tab (budget-settings.js), since it needs Programs (Budget-owned).

  function flashXeroParamsFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    const xero = params.get('xero');
    const reason = params.get('reason');
    if (!xero) return;
    if (xeroHint) {
      if (xero === 'connected') {
        xeroHint.textContent =
          'Xero connected. Account categories and tracking categories can be mapped from Budget → Settings → Chart of accounts.';
      } else if (xero === 'error') {
        xeroHint.textContent = 'Xero connection did not complete' + (reason ? ' (' + reason + ').' : '.');
      } else {
        xeroHint.textContent = '';
      }
      xeroHint.hidden = !xeroHint.textContent;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('xero');
      url.searchParams.delete('reason');
      const qs = url.searchParams.toString();
      window.history.replaceState({}, '', url.pathname + (qs ? '?' + qs : ''));
    } catch (_) {}
  }

  function wireXeroUiOnce() {
    if (xeroUiWired) return;
    xeroUiWired = true;
    if (xeroBtn) {
      xeroBtn.addEventListener('click', function () {
        if (!currentSlug) return;
        window.location.href = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/xero/connect';
      });
    }
    if (xeroRefreshBtn) {
      xeroRefreshBtn.addEventListener('click', async function () {
        if (!currentSlug) return;
        await loadXeroPanel(currentSlug);
      });
    }
    if (xeroDisconnectBtn) {
      xeroDisconnectBtn.addEventListener('click', async function () {
        if (!currentSlug) return;
        if (
          !confirm(
            'Disconnect Xero for this workspace? Your chart, budgets, and Xero account links are kept; only the live login to Xero is removed. You can reconnect anytime. Revoke the app in Xero as well if that org should fully drop access.'
          )
        ) {
          return;
        }
        showError('');
        xeroDisconnectBtn.disabled = true;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/xero/disconnect', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        xeroDisconnectBtn.disabled = false;
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not disconnect.');
          return;
        }
        await loadXeroPanel(currentSlug);
      });
    }
  }

  async function loadXeroPanel(slug) {
    if (xeroStatusLine) xeroStatusLine.textContent = '';
    if (xeroConfigWarn) {
      xeroConfigWarn.textContent = '';
      xeroConfigWarn.hidden = true;
    }
    const st = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/status');
    if (!st || !st.res.ok) return;
    const d = st.data || {};
    if (xeroStatusLine) {
      if (d.connected) {
        xeroStatusLine.textContent = 'Xero is connected' + (d.tenant_id ? ' (organization linked).' : '.');
      } else {
        xeroStatusLine.textContent =
          'Xero is not connected. Connect authorizes read-only access to your account categories and tracking categories.';
      }
    }
    if (xeroSyncFreshness) {
      if (d.connected && d.last_xero_touch_at && typeof window.formatFreshnessLine === 'function') {
        xeroSyncFreshness.textContent = window.formatFreshnessLine(d.last_xero_touch_at, 'synced');
        xeroSyncFreshness.hidden = false;
      } else {
        xeroSyncFreshness.textContent = '';
        xeroSyncFreshness.hidden = true;
      }
    }
    if (!d.configured && xeroConfigWarn) {
      xeroConfigWarn.textContent =
        'This server is missing Xero OAuth credentials (XERO_CLIENT_ID and XERO_CLIENT_SECRET). Set them on the host; redirect URI in the Xero developer app must match ' +
        (d.redirect_uri || '(BASE_URL)/np/xero/callback') +
        '.';
      xeroConfigWarn.hidden = false;
    }
    if (xeroRefreshBtn) xeroRefreshBtn.hidden = !(d.configured && d.connected);
    if (xeroDisconnectBtn) xeroDisconnectBtn.hidden = !(d.configured && d.connected);

    const showTracking = !!(d.configured && d.connected);
    if (xeroTrackingSection) xeroTrackingSection.hidden = !showTracking;
    if (showTracking) {
      await loadXeroTrackingCategories(slug);
    }
  }

  async function loadXeroTrackingCategories(slug) {
    if (!xeroTrackingTbody) return;
    const tr = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/tracking');
    if (!tr || !tr.res.ok) {
      xeroTrackingTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="3">' +
        escapeHtml(tr && tr.data && tr.data.error ? tr.data.error : 'Could not load tracking categories.') +
        '</td></tr>';
      return;
    }
    const cats = Array.isArray(tr.data.tracking_categories) ? tr.data.tracking_categories : [];
    if (cats.length === 0) {
      xeroTrackingTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="3">No tracking categories in this organization.</td></tr>';
      return;
    }
    xeroTrackingTbody.innerHTML = cats
      .map(function (c) {
        const opts = (c.options || [])
          .map(function (o) {
            return escapeHtml(o.name || '');
          })
          .filter(Boolean)
          .join(', ');
        return (
          '<tr><td>' +
          escapeHtml(c.name || '') +
          '</td><td>' +
          (opts || '—') +
          '</td><td>' +
          escapeHtml(c.status || '') +
          '</td></tr>'
        );
      })
      .join('');
  }

  // ── Where your books live (actuals source) ──
  let booksSourceCurrent = null;
  let booksSourceState = null;

  function booksSourceChoice() {
    const el = document.querySelector('input[name="organizational-books-source"]:checked');
    return el ? el.value : null;
  }

  function renderBooksSourceWarning() {
    const warnEl = document.getElementById('organizational-books-source-warn');
    const saveEl = document.getElementById('organizational-books-source-save');
    const choice = booksSourceChoice();
    if (!warnEl || !saveEl || !booksSourceState) return;
    const changed = !!choice && choice !== booksSourceCurrent;
    saveEl.disabled = !currentIsOrgAdmin || !changed;
    let msg = '';
    if (changed && choice === 'ledger') {
      const n = booksSourceState.switch_to_ledger_replaces_imported_rows;
      msg = n > 0
        ? 'Switching to Causal replaces ' + n + ' imported actuals rows, month by month, for every month that has ledger transactions. This cannot be undone by switching back.'
        : 'Switching to Causal: actuals will be built from your ledger from now on. No imported actuals are replaced.';
    } else if (changed && choice === 'xero') {
      const n = booksSourceState.switch_to_xero_removes_ledger_rows;
      msg = 'Switching to Xero or another tool removes the ' + n + ' actuals rows built from your ledger. Your ledger transactions stay; imported actuals are used instead. The financial statements stop being available.';
    }
    warnEl.textContent = msg;
    warnEl.hidden = !msg;
  }

  async function loadBooksSource(slug) {
    const card = document.getElementById('organizational-books-source-card');
    if (!card) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/actuals-source', { method: 'GET' });
    if (!out || !out.res.ok) { card.hidden = true; return; }
    booksSourceState = out.data;
    booksSourceCurrent = out.data.actuals_source;
    const ledgerEl = document.getElementById('organizational-books-source-ledger');
    const xeroEl = document.getElementById('organizational-books-source-xero');
    if (ledgerEl) { ledgerEl.checked = booksSourceCurrent === 'ledger'; ledgerEl.disabled = !currentIsOrgAdmin; }
    if (xeroEl) { xeroEl.checked = booksSourceCurrent === 'xero'; xeroEl.disabled = !currentIsOrgAdmin; }
    renderBooksSourceWarning();
  }

  function wireBooksSource() {
    const saveEl = document.getElementById('organizational-books-source-save');
    if (!saveEl) return;
    document.querySelectorAll('input[name="organizational-books-source"]').forEach(function (el) {
      el.addEventListener('change', renderBooksSourceWarning);
    });
    saveEl.addEventListener('click', async function () {
      const choice = booksSourceChoice();
      const warnEl = document.getElementById('organizational-books-source-warn');
      const errEl = document.getElementById('organizational-books-source-error');
      if (!currentSlug || !choice || choice === booksSourceCurrent) return;
      if (!window.confirm((warnEl && warnEl.textContent ? warnEl.textContent + '\n\n' : '') + 'Switch now?')) return;
      saveEl.disabled = true;
      if (errEl) errEl.hidden = true;
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/actuals-source', {
        method: 'PUT',
        body: JSON.stringify({ actuals_source: choice }),
      });
      if (!out || !out.res.ok) {
        if (errEl) { errEl.textContent = (out && out.data && out.data.error) || 'Could not change the data source.'; errEl.hidden = false; }
        renderBooksSourceWarning();
        return;
      }
      await loadBooksSource(currentSlug);
    });
  }

  async function load() {
    console.log('load() called');
    const { slug, tab } = parseSettingsPath();
    if (!slug) {
      showError('Invalid workspace URL.');
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    wireSettingsSubnavHrefs(slug);
    applySettingsTab(tab);
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

    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }
    if (slugLineEl) {
      slugLineEl.textContent = '';
      slugLineEl.appendChild(document.createTextNode('Slug '));
      const code = document.createElement('code');
      code.textContent = org.slug || '';
      slugLineEl.appendChild(code);
      slugLineEl.appendChild(document.createTextNode(' · ' + (org.membership_status || '') + ' · '));
      const back = document.createElement('a');
      back.href = '/organizational/';
      back.className = 'organizational-nav-link';
      back.style.color = 'var(--brand-primary)';
      back.style.fontWeight = '600';
      back.textContent = 'All workspaces';
      slugLineEl.appendChild(back);
    }
    if (roleBadgeEl) {
      roleBadgeEl.textContent = org.role || '';
      roleBadgeEl.classList.toggle('role-admin', isAdminRole(org.role));
      roleBadgeEl.hidden = !org.role;
    }

    const profile = org.cooperative_profile && typeof org.cooperative_profile === 'object' ? org.cooperative_profile : {};
    if (orgDisplayName) orgDisplayName.value = org.display_name || '';
    if (orgEin) orgEin.value = org.ein || '';
    if (orgState) orgState.value = org.state || '';
    if (orgFyEndMonth) orgFyEndMonth.value = String(org.fiscal_year_end_month || 12);
    if (orgMission) orgMission.value = profile.mission || '';
    if (orgWebsite) orgWebsite.value = profile.website || '';

    applyPermissionGating(org);
    await loadBooksSource(slug);

    // Fiscal sponsorship fields
    if (fiscalSponsorshipMode) {
      fiscalSponsorshipMode.checked = !!org.fiscal_sponsorship_mode;
      if (fiscalSponsorshipFields) {
        fiscalSponsorshipFields.hidden = !org.fiscal_sponsorship_mode;
      }
      if (sponsorshipModel) {
        sponsorshipModel.value = org.sponsorship_model || '';
      }
      if (defaultAdminRate) {
        defaultAdminRate.value = org.default_admin_rate || '';
      }
      if (sponsoredProjectsCount) {
        sponsoredProjectsCount.textContent = 'Loading...';
        loadSponsoredProjectsCount(currentSlug);
      }
    }

    // Membership fields
    if (membershipEnabledCheckbox) {
      membershipEnabledCheckbox.checked = !!org.membership_enabled;
    }

    // Security fields
    if (sessionTimeoutSelect) {
      sessionTimeoutSelect.value = String(org.session_timeout_minutes || 30);
    }

    // Org characteristics fields
    if (entityClassification) {
      entityClassification.value = org.entity_classification || '';
    }
    if (federalGrantRecipient) {
      federalGrantRecipient.checked = !!org.federal_grant_recipient;
    }
    if (lobbyingActivity) {
      lobbyingActivity.checked = !!org.has_lobbying_activity;
    }
    if (politicalActivity) {
      politicalActivity.checked = !!org.has_political_electoral_activity;
    }
    if (stateRegistrations && org.state_charitable_solicitation_registrations) {
      stateRegistrations.value = org.state_charitable_solicitation_registrations.join(', ');
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;

    wireOrgBasicsSave();
    wireOrgDelete();
    wireFiscalSponsorship();
    wireMembership();
    wireSessionTimeout();
    wireBooksSource();
    wireOrgCharacteristics();
    wireOrgUsersManagement();
    wireRoleModal();
    if (usersTbody) await loadOrgUsers(slug);
    if (invitesTbody) await loadInvites(slug);

    if (tab === 'integrations') {
      flashXeroParamsFromUrl();
      wireXeroUiOnce();
      await loadXeroPanel(slug);
    }
  }

  async function loadOrgUsers(slug) {
    if (!slug) return;
    if (!usersTbody) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/members', { method: 'GET' });
      if (!out || !out.res.ok) {
        usersTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load users.</td></tr>';
        return;
      }
      const members = out.data.members || [];
      if (members.length === 0) {
        usersTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">No users yet.</td></tr>';
        return;
      }
      usersTbody.innerHTML = members.map(function (m) {
        const isAdmin = isAdminRole(m.role);
        return '<tr>' +
          '<td>' + escapeHtml(m.email || '—') + '</td>' +
          '<td><span class="organizational-badge' + (isAdmin ? ' role-admin' : '') + '">' + escapeHtml(m.role) + '</span></td>' +
          '<td>Active</td>' +
          '<td>' +
            '<button type="button" class="organizational-btn organizational-btn-outline" data-action="change-role" data-id="' + m.id + '" data-role="' + m.role + '" style="font-size:0.8125rem;padding:4px 8px;">Change role</button> ' +
            '<button type="button" class="organizational-btn organizational-btn-outline" data-action="remove-member" data-id="' + m.id + '" style="font-size:0.8125rem;padding:4px 8px;color:var(--organizational-text-error,#dc2626);border-color:var(--organizational-text-error,#dc2626);">Remove</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      // Add event listeners for action buttons
      usersTbody.querySelectorAll('[data-action="change-role"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.getAttribute('data-id');
          const member = members.find(function (m) { return String(m.id) === String(id); });
          openRoleModal(member || { id: id, role: btn.getAttribute('data-role'), program_ids: [] });
        });
      });

      usersTbody.querySelectorAll('[data-action="remove-member"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.getAttribute('data-id');
          if (confirm('Are you sure you want to remove this user?')) {
            removeOrgUser(slug, id);
          }
        });
      });
    } catch (e) {
      console.error('loadOrgUsers error:', e);
      if (usersTbody) usersTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load users.</td></tr>';
    }
  }

  async function loadInvites(slug) {
    if (!slug) return;
    if (!invitesTbody) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/invites', { method: 'GET' });
      if (!out || !out.res.ok) {
        invitesTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load invites.</td></tr>';
        return;
      }
      const invites = out.data.invites || [];
      if (invites.length === 0) {
        invitesTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">No pending invites</td></tr>';
        return;
      }
      invitesTbody.innerHTML = invites.map(function (inv) {
        const expires = new Date(inv.expires_at).toLocaleDateString();
        return '<tr>' +
          '<td>' + escapeHtml(inv.email) + '</td>' +
          '<td><span class="organizational-badge' + (inv.role === 'admin' ? ' role-admin' : '') + '">' + escapeHtml(inv.role) + '</span></td>' +
          '<td>' + escapeHtml(expires) + '</td>' +
          '<td>' +
            '<button type="button" class="organizational-btn organizational-btn-outline" data-action="cancel-invite" data-id="' + inv.id + '" style="font-size:0.8125rem;padding:4px 8px;color:var(--organizational-text-error,#dc2626);border-color:var(--organizational-text-error,#dc2626);">Cancel</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      invitesTbody.querySelectorAll('[data-action="cancel-invite"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.getAttribute('data-id');
          if (confirm('Are you sure you want to cancel this invite?')) {
            cancelInvite(slug, id);
          }
        });
      });
    } catch (e) {
      console.error('loadInvites error:', e);
      if (invitesTbody) invitesTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load invites.</td></tr>';
    }
  }

  async function changeOrgUserRole(slug, userId, newRole, programIds) {
    if (!slug || !userId) return;
    try {
      const body = { role: newRole };
      if (newRole === 'program') body.program_ids = programIds || [];
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/members/' + userId, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!out || !out.res.ok) {
        alert(out.data.error || 'Could not update role.');
        return false;
      }
      await loadOrgUsers(slug);
      return true;
    } catch (e) {
      console.error('changeOrgUserRole error:', e);
      alert('Could not update role.');
      return false;
    }
  }

  async function fetchOrgPrograms() {
    if (orgProgramsCache) return orgProgramsCache;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/programs?dimension=program', { method: 'GET' });
      orgProgramsCache = (out && out.res.ok && out.data.programs) || [];
    } catch (e) {
      console.error('fetchOrgPrograms error:', e);
      orgProgramsCache = [];
    }
    return orgProgramsCache;
  }

  async function openRoleModal(member) {
    if (!roleModal) return;
    roleMemberIdInput.value = member.id;
    roleSelect.value = ['admin', 'finance', 'fundraising', 'program'].includes(member.role) ? member.role : 'finance';
    const programs = await fetchOrgPrograms();
    const grantedIds = new Set((member.program_ids || []).map(String));
    roleProgramsList.innerHTML = programs.map(function (p) {
      const checked = grantedIds.has(String(p.id)) ? ' checked' : '';
      return '<label style="display:block;font-weight:400;padding:4px 0;">' +
        '<input type="checkbox" value="' + p.id + '" class="organizational-role-program-checkbox"' + checked + '> ' +
        escapeHtml(p.name) +
        '</label>';
    }).join('') || '<p style="margin:0;color:var(--organizational-text-muted,var(--text-muted));">No programs set up for this organization yet.</p>';
    roleProgramsField.hidden = roleSelect.value !== 'program';
    roleModal.classList.add('organizational-modal-open');
  }

  function wireRoleModal() {
    if (!roleModal) return;
    roleSelect.addEventListener('change', function () {
      roleProgramsField.hidden = roleSelect.value !== 'program';
    });
    roleCancelBtn.addEventListener('click', function () {
      roleModal.classList.remove('organizational-modal-open');
    });
    roleModal.addEventListener('click', function (e) {
      if (e.target === roleModal) roleModal.classList.remove('organizational-modal-open');
    });
    roleForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const memberId = roleMemberIdInput.value;
      const role = roleSelect.value;
      const programIds = Array.from(roleProgramsList.querySelectorAll('.organizational-role-program-checkbox:checked'))
        .map(function (cb) { return Number(cb.value); });
      if (role === 'program' && programIds.length === 0) {
        alert('Select at least one program.');
        return;
      }
      const ok = await changeOrgUserRole(currentSlug, memberId, role, programIds);
      if (ok) roleModal.classList.remove('organizational-modal-open');
    });
  }

  async function removeOrgUser(slug, userId) {
    if (!slug || !userId) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/members/' + userId, {
        method: 'DELETE',
      });
      if (!out || !out.res.ok) {
        alert(out.data.error || 'Could not remove user.');
        return;
      }
      await loadOrgUsers(slug);
    } catch (e) {
      console.error('removeOrgUser error:', e);
      alert('Could not remove user.');
    }
  }

  async function cancelInvite(slug, inviteId) {
    if (!slug || !inviteId) return;
    try {
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/invites/' + inviteId, {
        method: 'DELETE',
      });
      if (!out || !out.res.ok) {
        alert(out.data.error || 'Could not cancel invite.');
        return;
      }
      await loadInvites(slug);
    } catch (e) {
      console.error('cancelInvite error:', e);
      alert('Could not cancel invite.');
    }
  }

  async function renderUserProgramsList() {
    if (!userProgramsList) return;
    const programs = await fetchOrgPrograms();
    userProgramsList.innerHTML = programs.map(function (p) {
      return '<label style="display:block;font-weight:400;padding:4px 0;">' +
        '<input type="checkbox" value="' + p.id + '" class="organizational-user-program-checkbox"> ' +
        escapeHtml(p.name) +
        '</label>';
    }).join('') || '<p style="margin:0;color:var(--organizational-text-muted,var(--text-muted));">No programs set up for this organization yet.</p>';
  }

  function wireOrgUsersManagement() {
    if (!userInviteBtn) return;
    userInviteBtn.addEventListener('click', function () {
      if (userModal) {
        userModal.classList.add('organizational-modal-open');
      }
      if (userEmail) userEmail.value = '';
      if (userRole) userRole.value = 'finance';
      if (userProgramsField) userProgramsField.hidden = true;
    });

    if (userRole) {
      userRole.addEventListener('change', function () {
        const isProgram = userRole.value === 'program';
        if (userProgramsField) userProgramsField.hidden = !isProgram;
        if (isProgram) renderUserProgramsList();
      });
    }

    if (userCancelBtn) {
      userCancelBtn.addEventListener('click', function () {
        if (userModal) {
          userModal.classList.remove('organizational-modal-open');
        }
      });
    }

    if (userModal) {
      userModal.addEventListener('click', function (e) {
        if (e.target === userModal) {
          userModal.classList.remove('organizational-modal-open');
        }
      });
    }

    if (userForm) {
      userForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        console.log('Form submitted');
        if (!currentSlug) return;
        const email = String((userEmail && userEmail.value) || '').trim();
        const role = String((userRole && userRole.value) || 'finance').toLowerCase();
        const programIds = userProgramsList
          ? Array.from(userProgramsList.querySelectorAll('.organizational-user-program-checkbox:checked')).map(function (cb) { return Number(cb.value); })
          : [];

        console.log('Invite data:', { email, role, currentSlug });

        if (!email) {
          alert('Email is required.');
          return;
        }
        if (role === 'program' && programIds.length === 0) {
          alert('Select at least one program.');
          return;
        }

        try {
          const body = { email, role };
          if (role === 'program') body.program_ids = programIds;
          const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/invites', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          console.log('Invite API response:', out);
          if (!out || !out.res.ok) {
            alert(out.data.error || 'Could not send invite.');
            return;
          }
          if (userModal) {
            userModal.classList.remove('organizational-modal-open');
          }
          await loadInvites(currentSlug);
          alert('Invite sent successfully!');
        } catch (err) {
          console.error('sendInvite error:', err);
          alert('Could not send invite.');
        }
      });
    }
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


  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;
  // 990 Functional Expense Classification editor moved to Compliance's "IRS Form 990" tab
  // (2026-09-11) — see compliance.js. Settings no longer has a 990 sub-tab.


  // Diagnostic: log that we're about to call load()
  console.log('[SETTINGS] About to call load()', { loadingEl: !!loadingEl, dashEl: !!dashEl, showError: typeof showError });

  load().then(function() {
    console.log('[SETTINGS] load() completed successfully');
  }).catch(function (e) {
    console.log('[SETTINGS] load() threw error', e);
    if (loadingEl) {
      loadingEl.hidden = true;
      console.log('[SETTINGS] Hidden loader');
    } else {
      console.log('[SETTINGS] loadingEl is null!');
    }
    if (typeof showError === 'function') {
      showError('Could not load workspace.');
      console.log('[SETTINGS] Called showError()');
    } else {
      console.log('[SETTINGS] showError is not a function!');
    }
    console.error('Settings load error:', e);
  });
})();
