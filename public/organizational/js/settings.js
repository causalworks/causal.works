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
  const orgLegalName = document.getElementById('organizational-org-legal-name');
  const orgAddress = document.getElementById('organizational-org-address');
  const orgPhone = document.getElementById('organizational-org-phone');
  const orgContactEmail = document.getElementById('organizational-org-contact-email');
  const orgPaymentInstructions = document.getElementById('organizational-org-payment-instructions');
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
  function tableSorter(tbody, columns, onChange) {
    return tbody && window.OrganizationalTableSort
      ? window.OrganizationalTableSort.attach(tbody.closest('table'), { columns: columns, onChange: onChange })
      : null;
  }
  function sortedBy(sorter, rows) { return sorter ? sorter.sortRows(rows) : rows; }
  let usersCache = [];
  let usersSlug = '';
  let invitesCache = [];
  let invitesSlug = '';
  const usersSorter = tableSorter(usersTbody, [
    { key: 'email', type: 'text', get: function (m) { return m.email; } },
    { key: 'role', type: 'text', get: function (m) { return m.role; } },
    null, null,
  ], function () { renderOrgUsers(); });
  const invitesSorter = tableSorter(invitesTbody, [
    { key: 'email', type: 'text', get: function (i) { return i.email; } },
    { key: 'role', type: 'text', get: function (i) { return i.role; } },
    { key: 'expires', type: 'date', get: function (i) { return i.expires_at; } },
    null,
  ], function () { renderInvites(); });
  const accessSorter = tableSorter(document.getElementById('organizational-access-tbody'), [
    { key: 'email', type: 'text', get: function (m) { return m.email; } },
    { key: 'role', type: 'text', get: function (m) { return m.role; } },
    null, null,
  ], function () { renderAccessTable(); });

  const roleModal = document.getElementById('organizational-role-modal');
  const roleForm = document.getElementById('organizational-role-form');
  const roleMemberIdInput = document.getElementById('organizational-role-member-id');
  const roleSelect = document.getElementById('organizational-role-select');
  const roleProgramsField = document.getElementById('organizational-role-programs-field');
  const roleProgramsList = document.getElementById('organizational-role-programs-list');
  const roleCancelBtn = document.getElementById('organizational-role-cancel');
  let orgProgramsCache = null;
  console.log('User elements fetched');

  const panelOrg = document.getElementById('organizational-settings-panel-organization');
  const settingsTabOrg = document.getElementById('organizational-settings-tab-org');
  const panelIntegrations = document.getElementById('organizational-settings-panel-integrations');
  const settingsTabIntegrations = document.getElementById('organizational-settings-tab-integrations');

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
  const emailsSave = document.getElementById('organizational-emails-save');
  const orgReplyTo = document.getElementById('organizational-org-reply-to');
  const orgAckMessage = document.getElementById('organizational-org-ack-message');
  const orgAckSignoff = document.getElementById('organizational-org-ack-signoff');
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
  let currentOrgIsDemo = false;
  console.log('Variables initialized');

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

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
  function applyPermissionGating(org) {
    currentIsOrgAdmin = isAdminRole(org.role);

    if (orgDangerZoneEl) orgDangerZoneEl.hidden = !currentIsOrgAdmin || !!org.is_platform_demo;
    if (orgWorkspaceUsersZoneEl) orgWorkspaceUsersZoneEl.hidden = !currentIsOrgAdmin || !!org.is_platform_demo;
    if (orgWorkspaceUsersDemoNoteEl) orgWorkspaceUsersDemoNoteEl.hidden = !(currentIsOrgAdmin && org.is_platform_demo);

    [
      orgDisplayName, orgEin, orgState, orgFyEndMonth, orgMission, orgWebsite, orgSaveBtn,
      orgLegalName, orgAddress, orgPhone, orgContactEmail, orgPaymentInstructions,
      fiscalSponsorshipMode, sponsorshipModel, defaultAdminRate, fiscalSponsorshipSave,
      membershipEnabledCheckbox, membershipSave,
      orgReplyTo, orgAckMessage, orgAckSignoff, emailsSave,
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
      if (!String((orgState && orgState.value) || '').trim()) {
        showError('Choose your state. It decides which compliance requirements apply to you.');
        return;
      }
      const body = {
        display_name: String((orgDisplayName && orgDisplayName.value) || '').trim(),
        ein: String((orgEin && orgEin.value) || '').trim(),
        state: String((orgState && orgState.value) || '').trim() || null,
        fiscal_year_end_month: Number((orgFyEndMonth && orgFyEndMonth.value) || 12),
        legal_name: String((orgLegalName && orgLegalName.value) || '').trim(),
        mailing_address: String((orgAddress && orgAddress.value) || '').trim(),
        phone: String((orgPhone && orgPhone.value) || '').trim(),
        contact_email: String((orgContactEmail && orgContactEmail.value) || '').trim(),
        payment_instructions: String((orgPaymentInstructions && orgPaymentInstructions.value) || '').trim(),
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
    
    fiscalSponsorshipMode.addEventListener('change', function () {
      if (fiscalSponsorshipFields) {
        fiscalSponsorshipFields.hidden = !this.checked;
      }
    });

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

  function wireEmails() {
    if (!emailsSave) return;
    emailsSave.addEventListener('click', async function () {
      if (!currentSlug) return;
      const body = {
        reply_to_email: orgReplyTo.value.trim(),
        acknowledgment_message: orgAckMessage.value.trim(),
        acknowledgment_signoff: orgAckSignoff.value.trim(),
      };
      emailsSave.disabled = true;
      try {
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug), { method: 'PATCH', body: JSON.stringify(body) });
        showError(out && out.res.ok ? '' : ((out && out.data && out.data.error) || 'Could not save email settings.'));
      } catch (e) {
        showError('Could not save email settings.');
      } finally {
        emailsSave.disabled = false;
      }
    });
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

  const PERM_LABELS = { reports: 'Reports only', accounting_read: 'All Accounting (read-only)', donor_details: 'Donor details (read-only)',
    manage_budget: 'Budget manager', manage_personnel: 'Personnel (extra, for a Budget manager)', manage_funding: 'Funding manager (grants and funder organizations)', manage_donors: 'Donors manager (individual donors)',
    manage_compliance: 'Compliance manager', manage_sponsorship: 'Sponsorship manager', manage_structure: 'Structure manager' };
  let accessData = null;
  let accessTarget = null;

  function accessDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function accessErr(msg) {
    const el = document.getElementById('organizational-access-error');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function accessCellHtml(m) {
    if (m.has_full_access) return '<span class="organizational-hint">Full access through their role</span>';
    const rows = (m.permissions || []).filter(function (p) { return p.active || (p.revoked_at == null); }).map(function (p) {
      const label = escapeHtml(PERM_LABELS[p.permission] || p.permission);
      const mayChange = accessData.givable_permissions.indexOf(p.permission) >= 0;
      let when, buttons = '';
      if (p.ongoing) when = 'ongoing';
      else if (p.active) when = 'ends ' + accessDate(p.ends_at);
      else when = 'ended ' + accessDate(p.ends_at);
      if (mayChange) {
        if (!p.ongoing) buttons += ' <button type="button" class="organizational-btn organizational-btn-outline" data-access-renew="' + p.id + '" style="font-size:0.75rem;padding:2px 8px;">Renew 30 days</button>';
        buttons += ' <button type="button" class="organizational-btn organizational-btn-outline" data-access-revoke="' + p.id + '" style="font-size:0.75rem;padding:2px 8px;">Revoke</button>';
      }
      return '<div style="margin-bottom:4px;' + (p.active ? '' : 'color:var(--text-secondary);') + '" title="' + escapeHtml(p.reason || '') + '">' + label + ' · ' + escapeHtml(when) + buttons + '</div>';
    });
    return rows.length ? rows.join('') : '<span class="organizational-hint">No access</span>';
  }

  function renderAccessTable() {
    const tbody = document.getElementById('organizational-access-tbody');
    if (!tbody || !accessData) return;
    const others = accessData.members.filter(function (m) { return !m.has_full_access; });
    if (!others.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Everyone here already has full access through their role. Add a board member or other member above to give them read-only access.</td></tr>';
      return;
    }
    tbody.innerHTML = sortedBy(accessSorter, others).map(function (m) {
      return '<tr><td>' + escapeHtml(m.email) + '</td><td>' + escapeHtml(m.role) + '</td><td>' + accessCellHtml(m) + '</td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-outline" data-access-give="' + m.org_user_id + '" style="font-size:0.8125rem;">Give access</button></td></tr>';
    }).join('');
  }

  async function loadAccessPermissions(slug) {
    const zone = document.getElementById('organizational-access-zone');
    if (!zone) return;
    zone.hidden = true;
    if (currentOrgIsDemo) return;
    const mine = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/my-access', { method: 'GET' });
    if (!mine || !mine.res.ok || !mine.data.can_give_access) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/access-permissions', { method: 'GET' });
    if (!out || !out.res.ok) return;
    accessData = out.data;
    zone.hidden = false;
    renderAccessTable();
    const two = document.getElementById('organizational-two-admin-note');
    if (two) {
      const admins = accessData.members.filter(function (m) { return m.role === 'admin'; }).length;
      two.hidden = !(currentIsOrgAdmin && accessData.members.length > 1 && admins === 1);
    }
    const ba = document.getElementById('organizational-board-approver');
    if (ba) {
      ba.hidden = !currentIsOrgAdmin;
      if (currentIsOrgAdmin) {
        const cur = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/board-approver', { method: 'GET' });
        const cb = document.getElementById('organizational-board-approver-on');
        if (cur && cur.res.ok && cb) {
          cb.checked = !!cur.data.board_may_approve;
          if (!cur.data.small_org) document.getElementById('organizational-board-approver-hint').textContent = 'Not in effect: this organization has three or more admin and finance users.';
          if (!cb.dataset.wired) {
            cb.dataset.wired = '1';
            cb.addEventListener('change', async function () {
              const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/board-approver', { method: 'PUT', body: JSON.stringify({ board_may_approve: cb.checked }) });
              if (!out || !out.res.ok) { cb.checked = !cb.checked; accessErr((out && out.data && out.data.error) || 'Could not save.'); }
            });
          }
        }
      }
    }
    const fin = document.getElementById('organizational-access-finance');
    if (fin) {
      fin.hidden = !currentIsOrgAdmin;
      const on = document.getElementById('organizational-access-finance-on');
      if (on) on.checked = !!accessData.finance_can_give_access;
      document.querySelectorAll('#organizational-access-finance-perms input').forEach(function (cb) {
        cb.checked = (accessData.finance_giveable_permissions || []).indexOf(cb.value) >= 0;
      });
    }
  }

  function openAccessForm(orgUserId) {
    const m = accessData.members.filter(function (x) { return x.org_user_id === orgUserId; })[0];
    if (!m) return;
    accessTarget = orgUserId;
    accessErr('');
    document.getElementById('organizational-access-form-title').textContent = 'Give access to ' + m.email;
    document.getElementById('organizational-access-perm-choices').innerHTML = accessData.givable_permissions.map(function (p, i) {
      return '<label style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><input type="radio" name="organizational-access-perm" value="' + p + '"' + (i === 0 ? ' checked' : '') + ' style="width:auto;"> ' + escapeHtml(PERM_LABELS[p]) + '</label>';
    }).join('');
    document.getElementById('organizational-access-reason').value = '';
    const ongoing = document.querySelector('input[name="organizational-access-duration"][value="ongoing"]');
    if (ongoing) ongoing.checked = true;
    document.getElementById('organizational-access-form').hidden = false;
    document.getElementById('organizational-access-reason').focus();
  }

  function wireAccessPermissions() {
    const zone = document.getElementById('organizational-access-zone');
    if (!zone) return;
    const url = function (suffix) { return '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/' + suffix; };
    zone.addEventListener('click', async function (e) {
      const give = e.target.closest('[data-access-give]');
      if (give) { openAccessForm(Number(give.getAttribute('data-access-give'))); return; }
      const renew = e.target.closest('[data-access-renew]');
      const revoke = e.target.closest('[data-access-revoke]');
      if (renew || revoke) {
        const id = Number((renew || revoke).getAttribute(renew ? 'data-access-renew' : 'data-access-revoke'));
        if (revoke && !window.confirm('Revoke this access now? They lose it immediately.')) return;
        const out = await apiJson(url('access-permissions/' + id + '/' + (renew ? 'renew' : 'revoke')), { method: 'POST' });
        if (!out || !out.res.ok) { accessErr((out && out.data && out.data.error) || 'Could not change the access.'); return; }
        accessErr('');
        await loadAccessPermissions(currentSlug);
      }
    });
    const cancel = document.getElementById('organizational-access-cancel');
    if (cancel) cancel.addEventListener('click', function () { document.getElementById('organizational-access-form').hidden = true; });
    const save = document.getElementById('organizational-access-save');
    if (save) save.addEventListener('click', async function () {
      const perm = document.querySelector('input[name="organizational-access-perm"]:checked');
      const dur = document.querySelector('input[name="organizational-access-duration"]:checked');
      if (!perm || !accessTarget) return;
      save.disabled = true;
      const out = await apiJson(url('access-permissions'), { method: 'POST', body: JSON.stringify({
        org_user_id: accessTarget, permission: perm.value, duration: dur ? dur.value : 'ongoing',
        reason: document.getElementById('organizational-access-reason').value.trim() }) });
      save.disabled = false;
      if (!out || !out.res.ok) { accessErr((out && out.data && out.data.error) || 'Could not give access.'); return; }
      accessErr('');
      document.getElementById('organizational-access-form').hidden = true;
      await loadAccessPermissions(currentSlug);
    });
    const finSave = document.getElementById('organizational-access-finance-save');
    if (finSave) finSave.addEventListener('click', async function () {
      const on = document.getElementById('organizational-access-finance-on').checked;
      const perms = Array.prototype.slice.call(document.querySelectorAll('#organizational-access-finance-perms input:checked')).map(function (cb) { return cb.value; });
      const out = await apiJson(url('access-permission-settings'), { method: 'PUT', body: JSON.stringify({ finance_can_give_access: on, finance_giveable_permissions: perms }) });
      if (!out || !out.res.ok) { accessErr((out && out.data && out.data.error) || 'Could not save.'); return; }
      accessErr('');
      await loadAccessPermissions(currentSlug);
    });
  }

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
        ? 'Switching to this workspace\'s ledger replaces ' + n + ' imported actuals rows, month by month, for every month that has ledger transactions. This cannot be undone by switching back.'
        : 'Switching to this workspace\'s ledger: actuals will be built from your ledger from now on. No imported actuals are replaced.';
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

  function entryErr(msg) {
    const el = document.getElementById('organizational-entry-error');
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }

  async function loadEntrySwitch(slug) {
    const zone = document.getElementById('organizational-entry-zone');
    if (!zone) return;
    zone.hidden = true;
    if (!currentIsOrgAdmin) return;
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/my-accounting-entry', { method: 'GET' });
    if (!out || !out.res.ok) return;
    const d = out.data;
    zone.hidden = false;
    const status = document.getElementById('organizational-entry-status');
    const note = document.getElementById('organizational-entry-note');
    const offForm = document.getElementById('organizational-entry-off-form');
    const onActions = document.getElementById('organizational-entry-on-actions');
    offForm.hidden = true; onActions.hidden = true; entryErr('');
    if (d.locked) {
      status.textContent = 'This shared demo account keeps accounting entry on.';
      note.textContent = '';
      return;
    }
    note.textContent = d.has_finance_members
      ? 'Finance members are emailed when you switch this on or off, and every change is logged.'
      : 'Your workspace has no finance member, so you can enter and edit transactions whatever this is set to. The switch takes effect once a finance member is added.';
    if (d.enabled) {
      status.textContent = 'On' + (d.enabled_at ? ' since ' + new Date(d.enabled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' (' + d.days_on + ' day' + (d.days_on === 1 ? '' : 's') + ')' : '') +
        '. You can enter, change and void accounting transactions.' + (d.review_due ? ' It has been on for 30 days or more: keep it on for another 30 days, or turn it off.' : '');
      onActions.hidden = false;
      onActions.style.display = 'flex';
    } else {
      status.textContent = 'Off. You can see everything an admin sees, but you cannot enter or change accounting transactions. Switch it on if you need to, for example during a staff transition.';
      offForm.hidden = false;
    }
  }

  function wireEntrySwitch() {
    const url = function () { return '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/my-accounting-entry'; };
    const put = async function (enabled) {
      const reason = document.getElementById('organizational-entry-reason');
      const out = await apiJson(url(), { method: 'PUT', body: JSON.stringify({ enabled: enabled, reason: reason ? reason.value.trim() : '' }) });
      if (!out || !out.res.ok) { entryErr((out && out.data && out.data.error) || 'Could not change this setting.'); return; }
      if (reason) reason.value = '';
      await loadEntrySwitch(currentSlug);
      if (out.data.notified) entryErr('');
    };
    const on = document.getElementById('organizational-entry-on');
    const off = document.getElementById('organizational-entry-off');
    const keep = document.getElementById('organizational-entry-keep');
    if (on) on.addEventListener('click', function () { put(true); });
    if (off) off.addEventListener('click', function () { if (window.confirm('Turn off your accounting entry access?')) put(false); });
    if (keep) keep.addEventListener('click', async function () {
      const out = await apiJson(url() + '/keep', { method: 'POST' });
      if (!out || !out.res.ok) { entryErr((out && out.data && out.data.error) || 'Could not renew.'); return; }
      await loadEntrySwitch(currentSlug);
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
    if (orgLegalName) orgLegalName.value = org.legal_name || '';
    if (orgAddress) orgAddress.value = org.mailing_address || '';
    if (orgPhone) orgPhone.value = org.phone || '';
    if (orgContactEmail) orgContactEmail.value = org.contact_email || '';
    if (orgPaymentInstructions) orgPaymentInstructions.value = org.payment_instructions || '';
    if (orgReplyTo) orgReplyTo.value = org.reply_to_email || '';
    if (orgAckMessage) orgAckMessage.value = org.acknowledgment_message || '';
    if (orgAckSignoff) orgAckSignoff.value = org.acknowledgment_signoff || '';

    applyPermissionGating(org);
    currentOrgIsDemo = !!org.is_platform_demo;
    wireAccessPermissions();
    await loadAccessPermissions(slug);
    await loadBooksSource(slug);
    await loadEntrySwitch(slug);

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

    if (membershipEnabledCheckbox) {
      membershipEnabledCheckbox.checked = !!org.membership_enabled;
    }

    if (sessionTimeoutSelect) {
      sessionTimeoutSelect.value = String(org.session_timeout_minutes || 30);
    }

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
    wireEmails();
    wireMembership();
    wireSessionTimeout();
    wireBooksSource();
    wireEntrySwitch();
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
    usersCache = [];
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
      usersCache = members;
      usersSlug = slug;
      renderOrgUsers();
    } catch (e) {
      console.error('loadOrgUsers error:', e);
      if (usersTbody) usersTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load users.</td></tr>';
    }
  }

  function renderOrgUsers() {
    const slug = usersSlug;
    const members = usersCache;
    if (!usersTbody || !members.length) return;
    {
      usersTbody.innerHTML = sortedBy(usersSorter, members).map(function (m) {
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
    }
  }

  async function loadInvites(slug) {
    if (!slug) return;
    if (!invitesTbody) return;
    invitesCache = [];
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
      invitesCache = invites;
      invitesSlug = slug;
      renderInvites();
    } catch (e) {
      console.error('loadInvites error:', e);
      if (invitesTbody) invitesTbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="4">Could not load invites.</td></tr>';
    }
  }

  function renderInvites() {
    const slug = invitesSlug;
    if (!invitesTbody || !invitesCache.length) return;
    {
      invitesTbody.innerHTML = sortedBy(invitesSorter, invitesCache).map(function (inv) {
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

  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
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

  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

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
