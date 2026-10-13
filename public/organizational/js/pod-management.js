(function () {
  const errEl = document.getElementById('organizational-org-error');
  const tableEl = document.getElementById('pod-mgmt-table');
  const syncAllBtn = document.getElementById('pod-mgmt-sync-all-btn');
  const syncAllResultEl = document.getElementById('pod-mgmt-sync-all-result');
  const coopStatusEl = document.getElementById('pod-mgmt-coop-status');
  const coopProvisionBtn = document.getElementById('pod-mgmt-coop-provision-btn');
  const coopSyncBtn = document.getElementById('pod-mgmt-coop-sync-btn');
  const coopResultEl = document.getElementById('pod-mgmt-coop-result');
  const syncServiceStatusEl = document.getElementById('pod-mgmt-sync-service-status');
  const syncServiceProvisionBtn = document.getElementById('pod-mgmt-sync-service-provision-btn');
  const syncServiceResultEl = document.getElementById('pod-mgmt-sync-service-result');

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderTable(orgs) {
    if (!tableEl) return;
    if (!orgs || orgs.length === 0) {
      tableEl.innerHTML = '<p class="organizational-empty">No organizations found.</p>';
      return;
    }
    const rows = orgs.map((o) => {
      const statusLabel = o.pod_provisioned
        ? '<span style="color:#10b981; font-weight:600;">✓ Provisioned</span>'
        : '<span style="color:#6b7280; font-weight:600;">Not provisioned</span>';
      return `<tr>
        <td style="padding:8px 12px;">${escapeHtml(o.display_name)}</td>
        <td style="padding:8px 12px; color:var(--text-secondary); font-size:0.8125rem;">${escapeHtml(o.slug)}</td>
        <td style="padding:8px 12px;">${statusLabel}</td>
        <td style="padding:8px 12px;">${formatDate(o.pod_last_synced_at) || '—'}</td>
        <td style="padding:8px 12px;">${o.document_count}</td>
      </tr>`;
    }).join('');
    tableEl.innerHTML = `
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="text-align:left; border-bottom: 1px solid var(--border-subtle);">
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Organization</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Slug</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Pod status</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Last sync</th>
            <th style="padding:8px 12px; font-size:0.8125rem; color: var(--text-secondary);">Documents</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function load() {
    try {
      const res = await fetch('/api/organizational/cooperative/pod-management', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Could not load pod management data.');
        if (tableEl) tableEl.innerHTML = '';
        return;
      }
      renderTable(data.orgs);
      renderCoopStatus(data.coopPod);
      renderSyncServiceStatus(data.syncService);
    } catch (e) {
      console.error('load:', e);
      showError('Could not load pod management data.');
    }
  }

  function renderCoopStatus(coopPod) {
    if (!coopStatusEl) return;
    if (coopPod && coopPod.provisioned) {
      coopStatusEl.textContent = '✓ Provisioned';
      coopStatusEl.style.color = '#10b981';
      if (coopProvisionBtn) coopProvisionBtn.hidden = true;
      if (coopSyncBtn) coopSyncBtn.hidden = false;
    } else {
      coopStatusEl.textContent = 'Not provisioned';
      coopStatusEl.style.color = '#6b7280';
      if (coopProvisionBtn) coopProvisionBtn.hidden = false;
      if (coopSyncBtn) coopSyncBtn.hidden = true;
    }
  }

  async function provisionCoopPod() {
    if (!coopProvisionBtn) return;
    coopProvisionBtn.disabled = true;
    coopProvisionBtn.textContent = 'Provisioning…';
    if (coopResultEl) coopResultEl.hidden = true;
    try {
      const res = await fetch('/api/organizational/cooperative/pod-management/coop-pod/provision', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Could not provision coop pod');
      if (coopResultEl) {
        coopResultEl.hidden = false;
        coopResultEl.textContent = 'Coop pod provisioned.';
      }
      await load();
    } catch (e) {
      console.error('provisionCoopPod:', e);
      if (coopResultEl) {
        coopResultEl.hidden = false;
        coopResultEl.textContent = 'Provisioning failed: ' + (e.message || 'unknown error');
      }
    } finally {
      coopProvisionBtn.disabled = false;
      coopProvisionBtn.textContent = 'Provision coop pod';
    }
  }

  function renderSyncServiceStatus(syncService) {
    if (!syncServiceStatusEl) return;
    if (syncService && syncService.provisioned) {
      syncServiceStatusEl.textContent = '✓ Provisioned (' + syncService.webId + ')';
      syncServiceStatusEl.style.color = '#10b981';
      if (syncServiceProvisionBtn) syncServiceProvisionBtn.hidden = true;
    } else {
      syncServiceStatusEl.textContent = 'Not provisioned';
      syncServiceStatusEl.style.color = '#6b7280';
      if (syncServiceProvisionBtn) syncServiceProvisionBtn.hidden = false;
    }
  }

  async function provisionSyncService() {
    if (!syncServiceProvisionBtn) return;
    syncServiceProvisionBtn.disabled = true;
    syncServiceProvisionBtn.textContent = 'Provisioning…';
    if (syncServiceResultEl) syncServiceResultEl.hidden = true;
    try {
      const res = await fetch('/api/organizational/cooperative/pod-management/sync-service/provision', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Could not provision sync service');
      if (syncServiceResultEl) {
        syncServiceResultEl.hidden = false;
        syncServiceResultEl.textContent = 'Sync service provisioned. Orgs can now give it access from their Solid Pod page.';
      }
      await load();
    } catch (e) {
      console.error('provisionSyncService:', e);
      if (syncServiceResultEl) {
        syncServiceResultEl.hidden = false;
        syncServiceResultEl.textContent = 'Provisioning failed: ' + (e.message || 'unknown error');
      }
    } finally {
      syncServiceProvisionBtn.disabled = false;
      syncServiceProvisionBtn.textContent = 'Provision sync service';
    }
  }

  async function syncCoopLibrary() {
    if (!coopSyncBtn) return;
    coopSyncBtn.disabled = true;
    coopSyncBtn.textContent = 'Syncing…';
    if (coopResultEl) coopResultEl.hidden = true;
    try {
      const res = await fetch('/api/organizational/cooperative/pod-management/coop-pod/sync', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      if (coopResultEl) {
        coopResultEl.hidden = false;
        coopResultEl.textContent = `Synced ${data.synced}/${data.total} library items.`;
      }
    } catch (e) {
      console.error('syncCoopLibrary:', e);
      if (coopResultEl) {
        coopResultEl.hidden = false;
        coopResultEl.textContent = 'Sync failed: ' + (e.message || 'unknown error');
      }
    } finally {
      coopSyncBtn.disabled = false;
      coopSyncBtn.textContent = 'Sync library';
    }
  }

  async function syncAll() {
    if (!syncAllBtn) return;
    syncAllBtn.disabled = true;
    syncAllBtn.textContent = 'Syncing all…';
    if (syncAllResultEl) syncAllResultEl.hidden = true;
    try {
      const res = await fetch('/api/organizational/cooperative/pod-management/sync-all', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sync-all failed');
      if (syncAllResultEl) {
        syncAllResultEl.hidden = false;
        syncAllResultEl.textContent = `Synced ${data.orgsSucceeded}/${data.orgsAttempted} organizations.`;
      }
      await load();
    } catch (e) {
      console.error('syncAll:', e);
      if (syncAllResultEl) {
        syncAllResultEl.hidden = false;
        syncAllResultEl.textContent = 'Sync-all failed: ' + (e.message || 'unknown error');
      }
    } finally {
      syncAllBtn.disabled = false;
      syncAllBtn.textContent = 'Sync all';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    if (syncAllBtn) syncAllBtn.addEventListener('click', syncAll);
    if (coopProvisionBtn) coopProvisionBtn.addEventListener('click', provisionCoopPod);
    if (coopSyncBtn) coopSyncBtn.addEventListener('click', syncCoopLibrary);
    if (syncServiceProvisionBtn) syncServiceProvisionBtn.addEventListener('click', provisionSyncService);
  });
})();
