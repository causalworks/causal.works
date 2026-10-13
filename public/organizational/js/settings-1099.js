/* settings-1099.js — Settings > 1099 reporting card (admin and finance). Server: routes/vendorCompliance.js settings-1099. */
(function () {
  'use strict';
  const section = document.getElementById('organizational-1099-section');
  if (!section) return;
  const enabled = document.getElementById('organizational-1099-enabled');
  const detail = document.getElementById('organizational-1099-detail');
  const threshold = document.getElementById('organizational-1099-threshold');
  const legalEl = document.getElementById('organizational-1099-legal');
  const errEl = document.getElementById('organizational-1099-error');
  const saveBtn = document.getElementById('organizational-1099-save');
  const m = window.location.pathname.match(/^\/organizational\/o\/([^/]+)\//);
  if (!m) return;
  const url = '/api/organizational/orgs/' + encodeURIComponent(decodeURIComponent(m[1])) + '/settings-1099';
  const money = (cents) => '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }

  async function load() {
    const out = await window.apiJson(url);
    if (!out || !out.res.ok) return;
    const d = out.data;
    section.hidden = false;
    if (d.can_change === false) {
      [enabled, threshold, saveBtn].forEach((el) => { el.disabled = true; });
      saveBtn.hidden = true;
      const note = document.createElement('p');
      note.className = 'organizational-hint';
      note.style.margin = '8px 0 0';
      note.textContent = 'Changed by finance or an admin.';
      saveBtn.parentNode.appendChild(note);
    }
    enabled.checked = d.reports_1099;
    detail.hidden = !d.reports_1099;
    threshold.value = d.threshold_override_cents == null ? '' : (d.threshold_override_cents / 100).toFixed(2);
    legalEl.textContent = 'Leave blank to use the legal amount: ' + money(d.legal_threshold_cents) + ' for ' + d.year + ' payments'
      + (d.legal_thresholds.length ? ' (' + d.legal_thresholds.map((t) => money(t.cents) + ' for ' + t.year).join(', ') + '; it is indexed for inflation after 2026 and we update it when the IRS publishes new amounts)' : '') + '. You may report at a lower amount, never a higher one.';
  }

  enabled.addEventListener('change', () => { detail.hidden = !enabled.checked; });
  saveBtn.addEventListener('click', async () => {
    showErr('');
    const raw = threshold.value.trim().replace(/[$,]/g, '');
    let cents = null;
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { showErr('Enter the amount in dollars, for example 600.'); return; }
      cents = Math.round(n * 100);
    }
    saveBtn.disabled = true;
    const out = await window.apiJson(url, { method: 'PUT', body: JSON.stringify({ reports_1099: enabled.checked, threshold_override_cents: cents }) });
    saveBtn.disabled = false;
    if (out && out.res.ok) { saveBtn.textContent = 'Saved'; setTimeout(() => { saveBtn.textContent = 'Save 1099 settings'; }, 1500); }
    else showErr((out && out.data && out.data.error) || 'Could not save.');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
