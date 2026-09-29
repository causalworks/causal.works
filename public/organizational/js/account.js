(function () {
  const loadingEl = document.getElementById('organizational-account-loading');
  const errorEl = document.getElementById('organizational-account-error');
  const contentEl = document.getElementById('organizational-account-content');
  const emailEl = document.getElementById('organizational-account-email');
  const workspacesEmptyEl = document.getElementById('organizational-workspaces-empty');
  const workspacesTableWrapEl = document.getElementById('organizational-workspaces-table-wrap');
  const workspacesTbodyEl = document.getElementById('organizational-workspaces-tbody');

  function showError(msg) {
    if (loadingEl) loadingEl.hidden = true;
    if (contentEl) contentEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = msg || 'An error occurred';
      errorEl.hidden = !msg;
    }
  }

  async function loadAccount() {
    try {
      // Load user info
      const meRes = await fetch('/api/me', { credentials: 'include' });
      if (!meRes.ok) {
        showError('Could not load account information.');
        return;
      }
      const meData = await meRes.json();
      if (emailEl) emailEl.textContent = meData.email || '—';

      // Load user's NP orgs
      const orgsRes = await fetch('/api/organizational/orgs', { credentials: 'include' });
      const orgsData = orgsRes.ok ? await orgsRes.json() : { orgs: [] };
      const orgs = Array.isArray(orgsData.orgs) ? orgsData.orgs : [];

      // Reached via the org-framed route (/o/:slug/account, linked from inside a workspace) --
      // show that workspace's own name in the header like every other page under it, instead of
      // the generic "cooperative"/"causalworks" defaults. No-op on the bare /organizational/account
      // route, which has no single org to show.
      const slug = window.OrganizationalSidebar && typeof window.OrganizationalSidebar.slugFromPath === 'function'
        ? window.OrganizationalSidebar.slugFromPath() : '';
      if (slug) {
        const current = orgs.find((o) => o.slug === slug);
        if (current && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
          window.OrganizationalHeader.setOrg(current.display_name || '—');
        }
      }

      if (orgs.length === 0) {
        if (workspacesEmptyEl) workspacesEmptyEl.textContent = 'You do not belong to any workspaces yet.';
        if (workspacesTableWrapEl) workspacesTableWrapEl.hidden = true;
      } else {
        if (workspacesEmptyEl) workspacesEmptyEl.hidden = true;
        if (workspacesTableWrapEl) workspacesTableWrapEl.hidden = false;

        const rows = orgs
          .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))
          .map(org => {
            const role = org.role || 'member';
            return `<tr>
              <td>${escapeHtml(org.display_name || '—')}</td>
              <td>${escapeHtml(role)}</td>
              <td><a href="/organizational/o/${encodeURIComponent(org.slug)}/dashboard" class="organizational-link">Go to workspace</a></td>
            </tr>`;
          })
          .join('');

        if (workspacesTbodyEl) workspacesTbodyEl.innerHTML = rows || '<tr class="organizational-table-empty"><td colspan="3">No workspaces.</td></tr>';
      }

      if (loadingEl) loadingEl.hidden = true;
      if (contentEl) contentEl.hidden = false;
    } catch (e) {
      console.error('organizational-account load error:', e);
      showError('Could not load your account. Please try again.');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', loadAccount);
})();
