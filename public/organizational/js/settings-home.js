/* settings-home.js — the Settings home: every setting the person may open, grouped (list defined in settings-index.js). */
(function () {
  'use strict';
  const m = window.location.pathname.match(/^\/organizational\/o\/([^/]+)\/settings\/?$/);
  const slug = m ? decodeURIComponent(m[1]) : '';
  if (!slug) return;
  async function init() {
    const el = document.getElementById('settings-home-groups');
    const { access, org } = await window.OrganizationalSettingsIndex.load(slug);
    if (!access) { el.innerHTML = '<p class="organizational-error">Your access could not be loaded. Try reloading.</p>'; return; }
    window.OrganizationalSettingsIndex.render(el, { slug, access, org });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
