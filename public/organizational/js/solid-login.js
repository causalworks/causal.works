(function () {
  const formSection = document.getElementById('solid-login-form-section');
  const loginForm = document.getElementById('solid-login-form');
  const issuerInput = document.getElementById('solid-login-issuer');
  const loginErrorEl = document.getElementById('solid-login-error');
  const loginSubmitBtn = document.getElementById('solid-login-submit');

  const sessionSection = document.getElementById('solid-session-section');
  const sessionWebIdEl = document.getElementById('solid-session-webid');
  const logoutBtn = document.getElementById('solid-logout-btn');

  const testFetchSection = document.getElementById('solid-test-fetch-section');
  const testFetchForm = document.getElementById('solid-test-fetch-form');
  const testFetchUrlInput = document.getElementById('solid-test-fetch-url');
  const testFetchResultEl = document.getElementById('solid-test-fetch-result');

  function redirectUri() {
    return `${window.location.origin}/organizational/solid-login-callback.html`;
  }

  async function render() {
    const session = await window.SolidOidcClient.getSession();
    if (session) {
      formSection.hidden = true;
      sessionSection.hidden = false;
      testFetchSection.hidden = false;
      sessionWebIdEl.textContent = session.webId;
      sessionWebIdEl.href = session.webId;
    } else {
      formSection.hidden = false;
      sessionSection.hidden = true;
      testFetchSection.hidden = true;
    }
  }

  async function submitLogin(e) {
    e.preventDefault();
    loginErrorEl.hidden = true;
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Redirecting…';
    try {
      // login() navigates away on success - nothing after this runs then.
      await window.SolidOidcClient.login(issuerInput.value.trim(), redirectUri());
    } catch (e2) {
      loginErrorEl.hidden = false;
      loginErrorEl.textContent = 'Could not start login: ' + (e2.message || 'unknown error');
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Log in with Solid';
    }
  }

  async function doLogout() {
    await window.SolidOidcClient.logout();
    await render();
  }

  async function submitTestFetch(e) {
    e.preventDefault();
    const url = testFetchUrlInput.value.trim();
    if (!url) return;
    testFetchResultEl.hidden = false;
    testFetchResultEl.textContent = 'Fetching…';
    try {
      const res = await window.SolidOidcClient.authFetch(url, { method: 'GET' });
      const text = await res.text();
      testFetchResultEl.textContent = `${res.status} ${res.statusText}\n\n${text.slice(0, 2000)}`;
    } catch (e2) {
      testFetchResultEl.textContent = 'Fetch failed: ' + (e2.message || 'unknown error');
    }
  }

  // Reached via the org-framed route (/o/:slug/solid-login, linked from that org's Solid Pod
  // page) -- show that workspace's own name in the header like every other page under it,
  // instead of the generic "cooperative"/"causalworks" defaults.
  async function setHeaderOrgIfFramed() {
    const slug = window.OrganizationalSidebar && typeof window.OrganizationalSidebar.slugFromPath === 'function'
      ? window.OrganizationalSidebar.slugFromPath() : '';
    if (!slug) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'same-origin' });
      const data = res.ok ? await res.json() : null;
      const org = data && data.org;
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (_) { /* header falls back to the generic defaults */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (loginForm) loginForm.addEventListener('submit', submitLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    if (testFetchForm) testFetchForm.addEventListener('submit', submitTestFetch);
    setHeaderOrgIfFramed();
    render();
  });
})();
