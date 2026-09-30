(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');

  const unprovisionedEl = document.getElementById('organizational-data-pod-unprovisioned');
  const contentEl = document.getElementById('organizational-data-pod-content');
  const connectionEl = document.getElementById('organizational-data-pod-connection');
  const lastSyncEl = document.getElementById('organizational-data-pod-last-sync');
  const filesEl = document.getElementById('organizational-data-pod-files');
  const syncBtn = document.getElementById('organizational-data-pod-sync-btn');
  const syncResultEl = document.getElementById('organizational-data-pod-sync-result');

  const syncPermissionStatusEl = document.getElementById('organizational-sync-permission-status');
  const syncPermissionToggleBtn = document.getElementById('organizational-sync-permission-toggle');
  const syncPermissionResultEl = document.getElementById('organizational-sync-permission-result');
  let syncPermissionGiven = null;

  const permissionForm = document.getElementById('organizational-pod-permission-form');
  const permissionDocSelect = document.getElementById('organizational-pod-permission-doc');
  const permissionRecipientInput = document.getElementById('organizational-pod-permission-recipient');
  const permissionExpiresInput = document.getElementById('organizational-pod-permission-expires');
  const permissionSubmitBtn = document.getElementById('organizational-pod-permission-submit');
  const permissionResultEl = document.getElementById('organizational-pod-permission-result');
  const permissionsListEl = document.getElementById('organizational-pod-permissions-list');

  const groupForm = document.getElementById('organizational-access-group-form');
  const groupNameInput = document.getElementById('organizational-access-group-name');
  const groupResultEl = document.getElementById('organizational-access-group-result');
  const groupsListEl = document.getElementById('organizational-access-groups-list');

  const ruleForm = document.getElementById('organizational-access-rule-form');
  const ruleGroupSelect = document.getElementById('organizational-access-rule-group');
  const ruleResultEl = document.getElementById('organizational-access-rule-result');
  const rulesListEl = document.getElementById('organizational-access-rules-list');

  const CATEGORY_LABELS = {
    irs_determination_letter: 'IRS Determination Letter', form_990: 'Form 990',
    audited_financials: 'Audited Financial Statements', management_letter: 'Auditor Management Letter',
    board_minutes: 'Board Meeting Minutes', board_resolution: 'Board Resolutions', bylaws: 'Bylaws',
    articles_of_incorporation: 'Articles of Incorporation', conflict_of_interest_policy: 'Conflict of Interest Policy',
    coi_disclosure: 'COI Disclosures', financial_policy: 'Financial Policy', personnel_policy: 'Personnel Policy',
    grant_agreement: 'Grant Agreement', award_letter: 'Award Letter', funder_report: 'Funder Report',
    insurance_certificate: 'Insurance Certificate', state_registration: 'State Registration', vendor_w9: 'Vendor W-9',
    contract_lease: 'Contract / Lease', payroll_tax_filing: 'Payroll Tax Filing', bank_statement: 'Bank Statement', other: 'Other',
  };

  let currentSlug = '';
  let currentDocuments = [];
  let currentGroups = [];
  let groupMembersCache = {};
  let permissionsCountdownTimer = null;

  // ─── Outbox polling ──────────────────────────────────────────────────────
  // A permission/revoke DB write now returns as soon as it's committed - CSS
  // catches up asynchronously via pod_acr_outbox (server/jobs/process-acr-outbox.js).
  // "Removed"/"Given" in the UI should mean CSS actually reflects it, not
  // just that the DB write returned - so this polls each affected outbox row
  // until it's done/failed rather than assuming completion at request time.
  function pollOutboxUntilSettled(statusUrl, ids, onUpdate) {
    if (!ids || ids.length === 0) {
      onUpdate({ pending: 0, done: ids ? ids.length : 0, failed: 0, settled: true });
      return;
    }
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`${statusUrl}?ids=${ids.join(',')}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : { rows: [] };
        const rows = data.rows || [];
        const done = rows.filter((r) => r.status === 'done').length;
        const failed = rows.filter((r) => r.status === 'failed').length;
        const pending = ids.length - done - failed;
        const settled = pending === 0;
        onUpdate({ pending, done, failed, settled });
        if (!settled && Date.now() - start < 30000) {
          setTimeout(tick, 800);
        } else if (!settled) {
          // Safety valve: stop polling after 30s so a stuck/slow row doesn't
          // spin the UI forever; the outbox worker keeps retrying regardless.
          onUpdate({ pending, done, failed, settled: true, timedOut: true });
        }
      } catch (e) {
        console.error('pollOutboxUntilSettled:', e);
      }
    };
    tick();
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/solid-pod\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const POD_STATUS_LABELS = {
    present: { label: '✓ In pod', color: '#10b981' },
    missing: { label: '✗ Not synced', color: '#ef4444' },
    error: { label: '⚠ Could not verify', color: '#f59e0b' },
    unknown: { label: '⚠ Could not verify', color: '#f59e0b' },
  };

  function renderFiles(documents) {
    if (!filesEl) return;
    if (!documents || documents.length === 0) {
      filesEl.innerHTML = '<p class="organizational-empty">No documents to sync yet.</p>';
      return;
    }
    const rows = documents.map((d) => {
      const status = POD_STATUS_LABELS[d.podStatus] || POD_STATUS_LABELS.unknown;
      return `<tr>
        <td style="padding:8px 12px;">${escapeHtml(d.category.replace(/_/g, ' '))}</td>
        <td style="padding:8px 12px;">${escapeHtml(d.title)}</td>
        <td style="padding:8px 12px;">${formatDate(d.document_date) || '—'}</td>
        <td style="padding:8px 12px; color:${status.color}; font-weight:600;">${status.label}</td>
      </tr>`;
    }).join('');
    filesEl.innerHTML = `
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="text-align:left; border-bottom: 1px solid var(--border-subtle);">
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Category</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Title</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Document date</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Pod status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderLastSync(lastSync) {
    if (!lastSyncEl) return;
    if (!lastSync || !lastSync.timestamp) {
      lastSyncEl.textContent = 'Never';
      return;
    }
    lastSyncEl.textContent = formatDate(lastSync.timestamp) || lastSync.timestamp;
  }

  async function loadStatus(slug) {
    if (connectionEl) connectionEl.textContent = 'Checking…';
    if (filesEl) filesEl.innerHTML = '<p class="organizational-empty">Loading…</p>';
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/data-pod/status`, { credentials: 'include' });
      if (!res.ok) throw new Error('status request failed');
      const data = await res.json();

      if (!data.provisioned) {
        if (unprovisionedEl) unprovisionedEl.hidden = false;
        if (contentEl) contentEl.hidden = true;
        return;
      }

      if (unprovisionedEl) unprovisionedEl.hidden = true;
      if (contentEl) contentEl.hidden = false;

      if (connectionEl) {
        connectionEl.textContent = data.connected ? '● Connected' : '● Not connected';
        connectionEl.style.color = data.connected ? '#10b981' : '#ef4444';
      }
      renderLastSync(data.lastSync);
      renderFiles(data.documents);

      currentDocuments = data.documents || [];
      populatePermissionDocSelect(currentDocuments);
      loadPermissions(slug);
      loadAccessGroups(slug);
      loadSyncPermission(slug);
    } catch (e) {
      console.error('loadStatus:', e);
      if (unprovisionedEl) unprovisionedEl.hidden = true;
      if (contentEl) contentEl.hidden = false;
      if (connectionEl) {
        connectionEl.textContent = '● Could not reach pod';
        connectionEl.style.color = '#ef4444';
      }
      if (filesEl) filesEl.innerHTML = '<p class="organizational-empty">Could not load documents.</p>';
    }
  }

  // ─── External access permissions ────────────────────────────────────────

  function populatePermissionDocSelect(documents) {
    if (!permissionDocSelect) return;
    if (!documents || documents.length === 0) {
      permissionDocSelect.innerHTML = '<option value="">No documents available</option>';
      permissionDocSelect.disabled = true;
      return;
    }
    permissionDocSelect.disabled = false;
    permissionDocSelect.innerHTML = documents.map((d) =>
      `<option value="${d.id}">${escapeHtml(d.title)} (${escapeHtml(d.category.replace(/_/g, ' '))})</option>`
    ).join('');
  }

  function formatCountdown(msRemaining) {
    if (msRemaining <= 0) return 'Expired';
    const totalSeconds = Math.floor(msRemaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    if (minutes > 0) return `${minutes}m ${seconds}s left`;
    return `${seconds}s left`;
  }

  function renderPermissions(permissions) {
    if (!permissionsListEl) return;
    if (!permissions || permissions.length === 0) {
      permissionsListEl.innerHTML = '<p class="organizational-empty">No external access permissions yet.</p>';
      return;
    }
    const rows = permissions.map((g) => {
      const isRevoked = !!g.revoked_at;
      let statusHtml;
      if (isRevoked) {
        const label = g.revoked_reason === 'expired' ? 'Expired' : 'Revoked';
        statusHtml = `<span class="organizational-pod-permission-status-label" style="color:#6b7280; font-weight:600;">${label}</span>`;
      } else if (g.expires_at == null) {
        // Standing access (e.g. an Access Group cascade rule) has no expiry at
        // all - not the same fact as "expires_at happens to be in the past".
        // new Date(null).getTime() is 0 (Unix epoch), which previously made
        // every one of these render as "Expired" though nothing about them
        // had actually lapsed - misleading for exactly the audience (a Solid
        // demo reviewer) this page exists to be honest with.
        statusHtml = `<span class="organizational-pod-permission-status-label" style="color:#10b981; font-weight:600;">Standing access</span>`;
      } else {
        const expiresAt = new Date(g.expires_at).getTime();
        statusHtml = `<span class="organizational-pod-permission-countdown" data-expires="${expiresAt}" style="color:#10b981; font-weight:600;">${formatCountdown(expiresAt - Date.now())}</span>`;
      }
      const openedNote = g.verified_opens > 0 ? ` &middot; opened ${g.verified_opens}&times; after email check` : '';
      const recipientDisplay = g.share_token
        ? `${escapeHtml(g.recipient_label)} <a href="/share/${encodeURIComponent(g.share_token)}" target="_blank" rel="noopener">(link, email-verified)</a>${openedNote}`
        : g.share_resource_url
        ? `${escapeHtml(g.recipient_label)} <a href="${escapeHtml(g.share_resource_url)}" target="_blank" rel="noopener">(older link, anyone with it can open)</a>`
        : g.recipient_profile_url
        ? `<a href="${escapeHtml(g.recipient_profile_url)}" target="_blank" rel="noopener">${escapeHtml(g.recipient_label)}</a>`
        : `<a href="${escapeHtml(g.recipient_webid)}" target="_blank" rel="noopener">${escapeHtml(g.recipient_label)}</a>`;
      const revokeBtn = isRevoked ? '' : `<button type="button" class="organizational-btn organizational-btn-outline organizational-pod-permission-revoke-btn" data-permission-id="${g.id}" style="padding:4px 10px; font-size:0.8125rem;">Revoke now</button>`;
      return `<tr data-permission-row="${g.id}">
        <td style="padding:8px 12px;">${escapeHtml(g.document_title)}</td>
        <td style="padding:8px 12px;">${recipientDisplay}</td>
        <td style="padding:8px 12px;">${statusHtml}</td>
        <td style="padding:8px 12px;">${revokeBtn}</td>
      </tr>`;
    }).join('');
    permissionsListEl.innerHTML = `
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="text-align:left; border-bottom: 1px solid var(--border-subtle);">
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Document</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Given to</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Status</th>
            <th style="padding:8px 12px;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    if (permissionsCountdownTimer) clearInterval(permissionsCountdownTimer);
    permissionsCountdownTimer = setInterval(() => {
      document.querySelectorAll('.organizational-pod-permission-countdown').forEach((el) => {
        const expiresAt = Number(el.getAttribute('data-expires'));
        el.textContent = formatCountdown(expiresAt - Date.now());
      });
    }, 1000);
  }

  async function loadPermissions(slug) {
    if (!permissionsListEl) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/data-pod/permissions`, { credentials: 'include' });
      if (!res.ok) {
        permissionsListEl.innerHTML = res.status === 403
          ? '<p class="organizational-empty">Only organization admins can view external access permissions.</p>'
          : '<p class="organizational-empty">Could not load permissions.</p>';
        return;
      }
      const data = await res.json();
      renderPermissions(data.permissions);
    } catch (e) {
      console.error('loadPermissions:', e);
      permissionsListEl.innerHTML = '<p class="organizational-empty">Could not load permissions.</p>';
    }
  }

  async function submitPermissionForm(e) {
    e.preventDefault();
    if (!currentSlug || !permissionSubmitBtn) return;
    const orgDocumentId = permissionDocSelect ? permissionDocSelect.value : '';
    const recipient = permissionRecipientInput ? permissionRecipientInput.value.trim() : '';
    const expiresLocal = permissionExpiresInput ? permissionExpiresInput.value : '';
    if (!orgDocumentId || !recipient || !expiresLocal) return;

    permissionSubmitBtn.disabled = true;
    permissionSubmitBtn.textContent = 'Giving access…';
    if (permissionResultEl) permissionResultEl.hidden = true;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/data-pod/permissions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_document_id: Number(orgDocumentId),
          recipient,
          expires_at: new Date(expiresLocal).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create permission');
      if (permissionResultEl) {
        permissionResultEl.hidden = false;
        permissionResultEl.textContent = `Given access to ${recipient}.`;
      }
      if (permissionRecipientInput) permissionRecipientInput.value = '';
      if (permissionExpiresInput) permissionExpiresInput.value = '';
      await loadPermissions(currentSlug);
    } catch (e) {
      console.error('submitPermissionForm:', e);
      if (permissionResultEl) {
        permissionResultEl.hidden = false;
        permissionResultEl.textContent = 'Could not create permission: ' + (e.message || 'unknown error');
      }
    } finally {
      permissionSubmitBtn.disabled = false;
      permissionSubmitBtn.textContent = 'Give access';
    }
  }

  async function revokePermissionNow(permissionId) {
    if (!currentSlug) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/data-pod/permissions/${encodeURIComponent(permissionId)}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not revoke permission');
      await loadPermissions(currentSlug);

      // The row now shows "Revoked" (Postgres truth, returned immediately) -
      // append a propagation note until CSS's own .acr has actually caught up.
      const outboxId = data.permission && data.permission.outboxId;
      if (outboxId) {
        const labelEl = permissionsListEl && permissionsListEl.querySelector(`tr[data-permission-row="${permissionId}"] .organizational-pod-permission-status-label`);
        if (labelEl) {
          const note = document.createElement('span');
          note.style.cssText = 'color:var(--text-secondary); font-weight:400; font-size:0.8125rem;';
          note.textContent = ' · propagating to pod…';
          labelEl.appendChild(note);
          pollOutboxUntilSettled(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/data-pod/permissions/outbox-status`, [outboxId], ({ failed, settled }) => {
            if (!settled) return;
            note.textContent = failed ? ' · pod update failed, will retry automatically' : '';
            if (failed) note.style.color = '#ef4444';
          });
        }
      }
    } catch (e) {
      console.error('revokePermissionNow:', e);
      alert('Could not revoke permission: ' + (e.message || 'unknown error'));
    }
  }

  function applyExpiryPreset(minutes) {
    if (!permissionExpiresInput) return;
    const target = new Date(Date.now() + minutes * 60 * 1000);
    // datetime-local wants local time with no timezone suffix, seconds optional.
    const pad = (n) => String(n).padStart(2, '0');
    const value = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
    permissionExpiresInput.value = value;
  }

  async function syncNow() {
    if (!currentSlug || !syncBtn) return;
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing…';
    if (syncResultEl) syncResultEl.hidden = true;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/data-pod/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      if (syncResultEl) {
        syncResultEl.hidden = false;
        syncResultEl.textContent = `Synced ${data.synced}/${data.total} documents.` + (data.failed && data.failed.length ? ` ${data.failed.length} failed.` : '');
      }
      await loadStatus(currentSlug);
    } catch (e) {
      console.error('syncNow:', e);
      if (syncResultEl) {
        syncResultEl.hidden = false;
        syncResultEl.textContent = 'Sync failed: ' + (e.message || 'unknown error');
      }
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync now';
    }
  }

  // ─── Access groups ───────────────────────────────────────────────────────

  function renderGroups(groups) {
    if (!groupsListEl) return;
    if (!groups || groups.length === 0) {
      groupsListEl.innerHTML = '<p class="organizational-empty">No access groups yet.</p>';
      return;
    }
    groupsListEl.innerHTML = groups.map((g) => {
      const members = groupMembersCache[g.id];
      const membersHtml = members
        ? (members.length
            ? `<table style="width:100%; border-collapse: collapse; margin-top:8px;">${members.map((m) => `
                <tr>
                  <td style="padding:4px 8px; font-size:0.875rem;">${escapeHtml(m.member_label)}</td>
                  <td style="padding:4px 8px; text-align:right;"><button type="button" class="organizational-btn organizational-btn-outline organizational-group-remove-member-btn" data-group-id="${g.id}" data-member-id="${m.id}" style="padding:2px 8px; font-size:0.75rem;">Remove</button></td>
                </tr>`).join('')}</table>`
            : '<p class="organizational-empty" style="margin:8px 0 0;">No members yet.</p>')
        : '';
      return `<div class="organizational-card" style="margin-bottom:12px;" data-group-id="${g.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${escapeHtml(g.name)}</strong>
            <span class="organizational-hint" style="margin-left:8px;">${g.member_count} member${g.member_count === 1 ? '' : 's'}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="organizational-btn organizational-btn-outline organizational-group-toggle-members-btn" data-group-id="${g.id}" style="padding:4px 10px; font-size:0.8125rem;">${members ? 'Hide members' : 'Manage members'}</button>
            <button type="button" class="organizational-btn organizational-btn-outline organizational-group-delete-btn" data-group-id="${g.id}" style="padding:4px 10px; font-size:0.8125rem;">Delete group</button>
          </div>
        </div>
        ${members ? `
        <form class="organizational-group-add-member-form" data-group-id="${g.id}" style="display:flex; gap:8px; margin-top:12px;">
          <input type="text" class="organizational-group-add-member-input" required placeholder="WebID or email" style="flex:1; padding:6px 10px; border:0.5px solid var(--border-subtle); border-radius:6px; font-size:0.875rem;">
          <button type="submit" class="organizational-btn" style="padding:4px 12px; font-size:0.8125rem;">Add</button>
        </form>
        ${membersHtml}` : ''}
      </div>`;
    }).join('');
  }

  let currentRules = [];

  function populateRuleGroupSelect(groups) {
    if (!ruleGroupSelect) return;
    const previousValue = ruleGroupSelect.value;
    if (!groups || groups.length === 0) {
      ruleGroupSelect.innerHTML = '<option value="">Create a group first</option>';
      ruleGroupSelect.disabled = true;
      renderRuleChecklist();
      return;
    }
    ruleGroupSelect.disabled = false;
    ruleGroupSelect.innerHTML = groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    // Keep the same group selected across a reload (e.g. after saving) if it still exists.
    if (groups.some((g) => String(g.id) === previousValue)) ruleGroupSelect.value = previousValue;
    renderRuleChecklist();
  }

  // Renders one checkbox per document category, pre-checked for whichever
  // categories already have a rule mapping the SELECTED group. Reflects
  // currentRules, so switching groups or reloading after a save re-renders
  // with the right boxes checked - this is what makes "create" and "edit
  // existing coverage" the same single bulk action.
  function renderRuleChecklist() {
    const checklistEl = document.getElementById('organizational-access-rule-checklist');
    const saveBtn = document.getElementById('organizational-access-rule-save');
    if (!checklistEl) return;
    const groupId = ruleGroupSelect ? ruleGroupSelect.value : '';
    if (!groupId) {
      checklistEl.innerHTML = '<p class="organizational-empty">Select a group above.</p>';
      if (saveBtn) saveBtn.disabled = true;
      return;
    }
    if (saveBtn) saveBtn.disabled = false;
    const checkedCategories = new Set(
      currentRules.filter((r) => String(r.group_id) === groupId && r.category).map((r) => r.category)
    );
    checklistEl.innerHTML = Object.keys(CATEGORY_LABELS).map((cat) => `
      <label style="display:flex; align-items:center; gap:6px; font-size:0.875rem; font-weight:400;">
        <input type="checkbox" value="${cat}" ${checkedCategories.has(cat) ? 'checked' : ''}>
        ${escapeHtml(CATEGORY_LABELS[cat])}
      </label>`).join('');
  }

  // Only document-scoped rules render here - category coverage lives in the
  // checklist above; a table row per category rule would just be the
  // checklist's own state duplicated in a second, easier-to-desync form.
  function renderRules(rules) {
    if (!rulesListEl) return;
    const docRules = (rules || []).filter((r) => r.org_document_id);
    if (docRules.length === 0) {
      rulesListEl.innerHTML = '<p class="organizational-empty">No document-specific rules yet.</p>';
      return;
    }
    rulesListEl.innerHTML = `
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="text-align:left; border-bottom: 1px solid var(--border-subtle);">
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Document</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Group</th>
            <th style="padding:8px 12px;"></th>
          </tr>
        </thead>
        <tbody>${docRules.map((r) => `
          <tr>
            <td style="padding:8px 12px;">${escapeHtml(r.document_title || ('#' + r.org_document_id))}</td>
            <td style="padding:8px 12px;">${escapeHtml(r.group_name)}</td>
            <td style="padding:8px 12px;"><button type="button" class="organizational-btn organizational-btn-outline organizational-rule-delete-btn" data-rule-id="${r.id}" style="padding:4px 10px; font-size:0.8125rem;">Remove</button></td>
          </tr>`).join('')}</tbody>
      </table>`;
  }

  async function loadAccessGroups(slug) {
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/access-groups`, { credentials: 'include' });
      if (!res.ok) {
        if (groupsListEl) groupsListEl.innerHTML = '<p class="organizational-empty">Could not load access groups.</p>';
        return;
      }
      const data = await res.json();
      currentGroups = data.groups || [];
      currentRules = data.rules || [];
      groupMembersCache = {};
      renderGroups(currentGroups);
      populateRuleGroupSelect(currentGroups);
      renderRules(currentRules);
    } catch (e) {
      console.error('loadAccessGroups:', e);
      if (groupsListEl) groupsListEl.innerHTML = '<p class="organizational-empty">Could not load access groups.</p>';
    }
  }

  async function createGroupSubmit(e) {
    e.preventDefault();
    const name = groupNameInput ? groupNameInput.value.trim() : '';
    if (!name || !currentSlug) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create group');
      groupNameInput.value = '';
      if (groupResultEl) { groupResultEl.hidden = false; groupResultEl.textContent = `Created "${name}".`; }
      await loadAccessGroups(currentSlug);
    } catch (e) {
      if (groupResultEl) { groupResultEl.hidden = false; groupResultEl.textContent = 'Could not create group: ' + e.message; }
    }
  }

  async function toggleGroupMembers(groupId) {
    if (groupMembersCache[groupId]) {
      delete groupMembersCache[groupId];
      renderGroups(currentGroups);
      return;
    }
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/${groupId}/members`, { credentials: 'include' });
      const data = res.ok ? await res.json() : { members: [] };
      groupMembersCache[groupId] = data.members || [];
      renderGroups(currentGroups);
    } catch (e) {
      console.error('toggleGroupMembers:', e);
    }
  }

  async function addGroupMember(groupId, recipient) {
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/${groupId}/members`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add member');
      delete groupMembersCache[groupId];
      await loadAccessGroups(currentSlug);
      await toggleGroupMembers(groupId);
    } catch (e) {
      alert('Could not add member: ' + (e.message || 'unknown error'));
    }
  }

  async function removeGroupMember(groupId, memberId) {
    // "will be revoked" (not "revoked immediately"): the membership itself
    // is gone from Postgres the instant this call returns, but the pod's
    // .acr files catch up asynchronously via the outbox - see
    // pollOutboxUntilSettled below. Accurate about the actual guarantee.
    if (!confirm('Remove this member? Access this membership gave them (to every currently-covered document) will be revoked.')) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/${groupId}/members/${memberId}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove member');
      delete groupMembersCache[groupId];
      await loadAccessGroups(currentSlug);
      await toggleGroupMembers(groupId);

      const outboxIds = data.outboxIds || [];
      if (groupResultEl) {
        groupResultEl.hidden = false;
        groupResultEl.textContent = outboxIds.length ? `Removing access… (0/${outboxIds.length})` : 'Member removed.';
      }
      pollOutboxUntilSettled(
        `/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/outbox-status`,
        outboxIds,
        ({ pending, done, failed, settled }) => {
          if (!groupResultEl) return;
          groupResultEl.hidden = false;
          if (!settled) {
            groupResultEl.textContent = `Removing access… (${done + failed}/${outboxIds.length})`;
          } else if (failed > 0) {
            groupResultEl.textContent = `Access removed, but ${failed} of ${outboxIds.length} pod update(s) failed and will retry automatically.`;
          } else {
            groupResultEl.textContent = 'Access removed.';
          }
        }
      );
    } catch (e) {
      alert('Could not remove member: ' + (e.message || 'unknown error'));
    }
  }

  async function deleteGroupNow(groupId) {
    if (!confirm('Delete this group? All access it gave will be revoked.')) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/${groupId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not delete group');
      }
      await loadAccessGroups(currentSlug);
    } catch (e) {
      alert('Could not delete group: ' + (e.message || 'unknown error'));
    }
  }

  async function saveRuleChecklist(e) {
    e.preventDefault();
    const groupId = ruleGroupSelect ? ruleGroupSelect.value : '';
    if (!groupId || !currentSlug) return;
    const checklistEl = document.getElementById('organizational-access-rule-checklist');
    const categories = checklistEl
      ? Array.from(checklistEl.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value)
      : [];
    const saveBtn = document.getElementById('organizational-access-rule-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/${groupId}/category-rules`, {
        method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categories }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save category coverage');
      await loadAccessGroups(currentSlug);

      const outboxIds = data.outboxIds || [];
      if (ruleResultEl) {
        ruleResultEl.hidden = false;
        ruleResultEl.textContent = outboxIds.length ? `Saved. Giving access… (0/${outboxIds.length})` : 'Saved.';
      }
      pollOutboxUntilSettled(
        `/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/outbox-status`,
        outboxIds,
        ({ done, failed, settled }) => {
          if (!ruleResultEl) return;
          ruleResultEl.hidden = false;
          if (!settled) ruleResultEl.textContent = `Saved. Giving access… (${done + failed}/${outboxIds.length})`;
          else if (failed > 0) ruleResultEl.textContent = `Saved, but ${failed} of ${outboxIds.length} pod update(s) failed and will retry automatically.`;
          else ruleResultEl.textContent = 'Saved. Access given.';
        }
      );
    } catch (e) {
      if (ruleResultEl) { ruleResultEl.hidden = false; ruleResultEl.textContent = 'Could not save: ' + e.message; }
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save category coverage'; }
    }
  }

  async function deleteRuleNow(ruleId) {
    if (!confirm('Remove this standing rule? Future documents it covers will no longer auto-give this group access.')) return;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/access-groups/rules/${ruleId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not remove rule');
      }
      await loadAccessGroups(currentSlug);
    } catch (e) {
      alert('Could not remove rule: ' + (e.message || 'unknown error'));
    }
  }

  // ─── Sync/fetch permission (Part 2: org-given, not held) ───────

  function renderSyncPermission() {
    if (!syncPermissionStatusEl || !syncPermissionToggleBtn) return;
    if (syncPermissionGiven) {
      syncPermissionStatusEl.textContent = '✓ Given';
      syncPermissionStatusEl.style.color = '#10b981';
      syncPermissionToggleBtn.textContent = 'Revoke';
    } else {
      syncPermissionStatusEl.textContent = '✗ Not given';
      syncPermissionStatusEl.style.color = '#ef4444';
      syncPermissionToggleBtn.textContent = 'Give';
    }
    syncPermissionToggleBtn.disabled = false;
  }

  async function loadSyncPermission(slug) {
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/data-pod/sync-permission`, { credentials: 'include' });
      if (!res.ok) {
        if (syncPermissionStatusEl) syncPermissionStatusEl.textContent = res.status === 403 ? 'Admins only' : 'Could not load';
        if (syncPermissionToggleBtn) syncPermissionToggleBtn.hidden = true;
        return;
      }
      const data = await res.json();
      syncPermissionGiven = !!data.granted;
      renderSyncPermission();
    } catch (e) {
      console.error('loadSyncPermission:', e);
      if (syncPermissionStatusEl) syncPermissionStatusEl.textContent = 'Could not load';
    }
  }

  async function toggleSyncPermission() {
    if (!currentSlug || syncPermissionGiven === null) return;
    syncPermissionToggleBtn.disabled = true;
    const wasGiven = syncPermissionGiven;
    try {
      const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(currentSlug)}/data-pod/sync-permission`, {
        method: wasGiven ? 'DELETE' : 'POST', credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update permission');
      syncPermissionGiven = !wasGiven;
      renderSyncPermission();
      if (syncPermissionResultEl) {
        syncPermissionResultEl.hidden = false;
        syncPermissionResultEl.textContent = wasGiven
          ? 'Revoked. Automated sync and downloads are paused until given again.'
          : "Given. The platform's sync service can now sync and serve documents for this pod.";
      }
    } catch (e) {
      if (syncPermissionResultEl) { syncPermissionResultEl.hidden = false; syncPermissionResultEl.textContent = 'Could not update: ' + e.message; }
      syncPermissionToggleBtn.disabled = false;
    }
  }

  async function load() {
    const slug = parseSlug();
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }
    currentSlug = slug;
    showError('');

    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError(data.error || 'Could not load organization.');
        loadingEl.hidden = true;
        return;
      }
      const org = data.org;
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (e) {
      console.error('load:', e);
    }

    loadingEl.hidden = true;
    dashEl.hidden = false;

    loadStatus(slug);
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    if (syncBtn) syncBtn.addEventListener('click', syncNow);
    if (syncPermissionToggleBtn) syncPermissionToggleBtn.addEventListener('click', toggleSyncPermission);
    if (permissionForm) permissionForm.addEventListener('submit', submitPermissionForm);
    document.querySelectorAll('[data-preset-minutes]').forEach((btn) => {
      btn.addEventListener('click', () => applyExpiryPreset(Number(btn.getAttribute('data-preset-minutes'))));
    });
    if (permissionsListEl) {
      permissionsListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.organizational-pod-permission-revoke-btn');
        if (!btn) return;
        revokePermissionNow(btn.getAttribute('data-permission-id'));
      });
    }

    if (groupForm) groupForm.addEventListener('submit', createGroupSubmit);
    if (ruleGroupSelect) ruleGroupSelect.addEventListener('change', renderRuleChecklist);
    if (ruleForm) ruleForm.addEventListener('submit', saveRuleChecklist);

    if (groupsListEl) {
      groupsListEl.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.organizational-group-toggle-members-btn');
        const deleteBtn = e.target.closest('.organizational-group-delete-btn');
        const removeMemberBtn = e.target.closest('.organizational-group-remove-member-btn');
        if (toggleBtn) toggleGroupMembers(Number(toggleBtn.getAttribute('data-group-id')));
        else if (deleteBtn) deleteGroupNow(Number(deleteBtn.getAttribute('data-group-id')));
        else if (removeMemberBtn) removeGroupMember(Number(removeMemberBtn.getAttribute('data-group-id')), Number(removeMemberBtn.getAttribute('data-member-id')));
      });
      groupsListEl.addEventListener('submit', (e) => {
        const form = e.target.closest('.organizational-group-add-member-form');
        if (!form) return;
        e.preventDefault();
        const input = form.querySelector('.organizational-group-add-member-input');
        const recipient = input ? input.value.trim() : '';
        if (!recipient) return;
        addGroupMember(Number(form.getAttribute('data-group-id')), recipient);
      });
    }

    if (rulesListEl) {
      rulesListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.organizational-rule-delete-btn');
        if (!btn) return;
        deleteRuleNow(Number(btn.getAttribute('data-rule-id')));
      });
    }

    initHeader();
  });

  // ─── Header chrome (same pattern as compliance.js) ───────────────────────────

  async function initHeader() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/me', { credentials: 'same-origin', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('initHeader:', e);
    }
  }
})();
