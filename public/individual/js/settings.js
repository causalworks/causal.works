/**
 * settings.js — User settings panel
 * Rebuilt for individual/index.html design system
 */

// ─── STATE ───
let settingsPanelOpen = false;
let userCountry = '';
let userZip = '';
let userCity = '';
let selectedOrgs = new Set();
let allOrgs = [];
let digestFrequency = 'off';
let keepForwardedEmailText = false;
let forwardingAddress = '';
let settingsAutoSaveTimer = null;
let primaryRegions = new Set();
let addressEditMode = false;
let orgSuggestMounted = false;

// ─── HELPERS ───
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ─── OPEN SETTINGS PANEL ───
async function openSettings() {
  settingsPanelOpen = true;
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  panel.classList.add('open');
  panel.innerHTML = `<div class="individual-settings-panel-header"><span class="individual-settings-panel-title">${INDIVIDUAL_STRINGS.settings.panelTitle}</span><span class="individual-settings-panel-close" onclick="closeSettings()">×</span></div>` +
    '<div class="individual-settings-panel-body"><div style="padding:24px; text-align:center; color:var(--text-secondary);">Loading settings…</div></div>';

  try {
    const [meRes, settingsRes, orgsRes] = await Promise.all([
      fetch('/api/me', { credentials: 'same-origin' }),
      fetch('/api/settings', { credentials: 'same-origin' }),
      fetch('/api/orgs', { credentials: 'same-origin' }),
    ]);

    const me = meRes.ok ? await meRes.json() : {};
    const settings = settingsRes.ok ? await settingsRes.json() : {};
    const orgs = orgsRes.ok ? await orgsRes.json() : [];

    userCountry = String(settings.location_country || me.location_country || '').trim().toUpperCase() || '';
    userZip = String(settings.location_zip || me.location_zip || '').trim() || '';
    userCity = String(settings.location_city || me.location_city || '').trim() || '';
    selectedOrgs = new Set((settings.org_ids || []).map(String));
    digestFrequency = settings.digest_frequency || 'off';
    keepForwardedEmailText = !!settings.keep_forwarded_email_text;
    primaryRegions = new Set((settings.primary_region || []).map(String));
    forwardingAddress = me.causal_address || me.forwarding_address || '';
    allOrgs = orgs || [];

    renderSettingsPanel();
  } catch (e) {
    console.error('openSettings', e);
    panel.innerHTML = `<div class="individual-settings-panel-header"><span class="individual-settings-panel-title">${INDIVIDUAL_STRINGS.settings.panelTitle}</span><span class="individual-settings-panel-close" onclick="closeSettings()">×</span></div>` +
      '<div class="individual-settings-panel-body"><div style="padding:24px; color:#991b1b;">Error loading settings</div></div>';
  }
}

// ─── CLOSE SETTINGS PANEL ───
function closeSettings() {
  settingsPanelOpen = false;
  const panel = document.getElementById('settings-panel');
  if (panel) panel.classList.remove('open');
  if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
}

// ─── RENDER SETTINGS PANEL ───
function renderSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  let header = '';
  header += `<span class="individual-settings-panel-title">${INDIVIDUAL_STRINGS.settings.panelTitle}</span>`;
  header += '<span id="sp-save-status" style="font-size:12px; color:var(--text-secondary); margin-left:auto; margin-right:12px;"></span>';
  header += '<button type="button" class="app-btn app-btn-small" onclick="event.stopPropagation();saveSettingsNow()" style="font-size:12px; margin-right:8px;">Save</button>';
  header += '<span class="individual-settings-panel-close" onclick="closeSettings()">×</span>';

  let html = '';
  html += '<div style="max-width:500px; margin:0 auto;">';

  // Profile card
  html += '<div class="individual-card" style="margin-bottom:16px;">';
  html += `<h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin:0 0 12px; letter-spacing:0.05em;">${INDIVIDUAL_STRINGS.settings.profile}</h3>`;
  html += '<div style="font-size:13px; color:var(--text-primary); margin-bottom:8px;">Causal address</div>';
  html += '<div id="sp-address-view" style="display:flex; gap:8px; align-items:center;">';
  html += '<code style="flex:1; background:var(--surface-page); padding:8px 12px; border-radius:6px; font-size:13px; color:var(--text-primary); font-family:monospace; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(forwardingAddress) + '</code>';
  html += '<button type="button" class="app-btn app-btn-outline" onclick="event.stopPropagation();copyAddress()" style="font-size:12px; white-space:nowrap;">Copy</button>';
  html += '<button type="button" class="app-btn app-btn-outline" onclick="event.stopPropagation();spStartAddressEdit()" style="font-size:12px; white-space:nowrap;">Edit</button>';
  html += '</div>';
  html += '<div id="sp-address-edit" style="display:none;">';
  html += '<div style="margin-bottom:8px;"><input type="text" id="sp-address-local" placeholder="e.g. jane-smith" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; color:var(--text-primary); font-family:inherit; box-sizing:border-box;"></div>';
  html += '<div id="sp-address-error" style="color:#991b1b; font-size:12px; margin-bottom:8px; display:none;"></div>';
  html += '<div style="display:flex; gap:8px;">';
  html += '<button type="button" class="app-btn" onclick="spSaveAddress()" style="flex:1; font-size:12px;">Save</button>';
  html += '<button type="button" class="app-btn app-btn-outline" onclick="spCancelAddressEdit()" style="flex:1; font-size:12px;">Cancel</button>';
  html += '</div>';
  html += '</div>';
  html += '<div id="sp-feedback" style="font-size:12px; color:#166534; margin-top:8px; opacity:0; transition:opacity 0.3s;"></div>';
  html += '</div>';

  // Location card
  html += '<div class="individual-card" style="margin-bottom:16px;">';
  html += `<h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin:0 0 12px; letter-spacing:0.05em;">${INDIVIDUAL_STRINGS.settings.location}</h3>`;
  html += '<label style="display:block; font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:6px;">Country</label>';
  html += '<select id="settings-country" onchange="onCountryChange()" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; color:var(--text-primary); background:white; margin-bottom:12px; font-family:inherit;">';
  html += '<option value="">Select a country</option>';
  ['US', 'CA', 'UK', 'DE', 'FR', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'AU', 'NZ'].forEach(code => {
    const selected = code === userCountry ? ' selected' : '';
    html += '<option value="' + code + '"' + selected + '>' + code + '</option>';
  });
  html += '</select>';
  html += '<label style="display:block; font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:6px;">ZIP / Postal Code</label>';
  html += '<input type="text" id="settings-zip" value="' + escapeHtml(userZip) + '" onchange="onZipChange()" onkeyup="scheduleAutoSave()" placeholder="e.g., 10001" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; color:var(--text-primary); font-family:inherit; box-sizing:border-box;">';
  html += '<label style="display:block; font-size:13px; font-weight:600; color:var(--text-primary); margin-top:12px; margin-bottom:6px;">City <span style="font-weight:400; color:var(--text-secondary);">(optional — improves local race data)</span></label>';
  html += '<input type="text" id="settings-city" value="' + escapeHtml(userCity) + '" onkeyup="scheduleAutoSave()" placeholder="e.g., Brooklyn" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; color:var(--text-primary); font-family:inherit; box-sizing:border-box;">';
  html += '<label style="display:block; font-size:13px; font-weight:600; color:var(--text-primary); margin-top:12px; margin-bottom:6px;">Geographic Focus</label>';
  html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
  ['Global', 'US', 'EU', 'UK', 'DE', 'FR', 'Other'].forEach((label) => {
    const val = label.toUpperCase().replace('OTHER', 'OTHER');
    const isSelected = primaryRegions.has(val);
    html += '<button type="button" class="app-btn app-btn-outline" onclick="spTogglePrimaryRegion(this)" data-val="' + val + '" style="' + (isSelected ? 'background:var(--accent); color:white; border-color:var(--accent);' : '') + ' font-size:12px;">' + label + '</button>';
  });
  html += '</div>';
  html += '</div>';

  // Organizations card
  html += '<div class="individual-card" style="margin-bottom:16px;">';
  html += `<h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin:0 0 12px; letter-spacing:0.05em;">${INDIVIDUAL_STRINGS.settings.organizations}</h3>`;
  html += '<div id="settings-org-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>';
  html += '</div>';

  // Communication card
  html += '<div class="individual-card" style="margin-bottom:16px;">';
  html += `<h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin:0 0 12px; letter-spacing:0.05em;">${INDIVIDUAL_STRINGS.settings.communication}</h3>`;
  html += '<label style="display:block; font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:8px;">Email Digest</label>';
  html += '<div style="display:flex; gap:8px;">';
  ['off', 'daily', 'weekly'].forEach(freq => {
    const label = freq === 'off' ? 'Off' : freq === 'daily' ? 'Daily' : 'Weekly';
    const active = digestFrequency === freq ? ' style="background:var(--accent); color:white; border-color:var(--accent);"' : '';
    html += '<button type="button" onclick="setDigestFrequency(\'' + freq + '\')" class="app-btn app-btn-outline" ' + active + ' style="flex:1; font-size:13px;">' + label + '</button>';
  });
  html += '</div>';
  html += '<label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; font-weight:600; color:var(--text-primary); margin-top:16px; cursor:pointer;">';
  html += '<input type="checkbox" id="settings-keep-email-text" onchange="setKeepForwardedEmailText(this.checked)"' + (keepForwardedEmailText ? ' checked' : '') + ' style="margin-top:2px;">';
  html += '<span>Keep a copy of emails sent to my Causal address</span></label>';
  html += '<div class="individual-hint" style="margin-top:6px;">Off by default. When off, each email is read when it arrives and its full text is not saved. We still keep the sender, subject and a short preview so your Responses list works. Turn this on if you want us to keep the full text so extraction can be re-checked and fixed.</div>';
  html += '</div>';

  // Account card
  html += '<div class="individual-card">';
  html += `<h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin:0 0 12px; letter-spacing:0.05em;">${INDIVIDUAL_STRINGS.settings.account}</h3>`;
  html += '<button type="button" class="app-btn app-btn-outline" onclick="settingsSignOut()" style="width:100%; font-size:13px;">Sign out</button>';
  html += '</div>';

  html += '</div>';

  panel.innerHTML =
    '<div class="individual-settings-panel-header">' + header + '</div>' +
    '<div class="individual-settings-panel-body">' + html + '</div>';
  renderOrgList();
  document.getElementById('settings-country').value = userCountry;
}

// ─── RENDER ORGANIZATION LIST ───
function renderOrgList() {
  const container = document.getElementById('settings-org-list');
  if (!container) return;

  // Exclude user_contributed_orgs rows — those come from a separate table with
  // its own id sequence that can collide with real orgs.id, so they must never
  // be offered as followable (their ids aren't valid org_id references).
  const followable = allOrgs.filter((org) => org.subscription_status !== 'user_contributed');
  const sortByName = (a, b) => String(a.name || '').toLocaleLowerCase().localeCompare(String(b.name || '').toLocaleLowerCase());

  // Platform = admin-curated default orgs. User added = orgs any user brought onto
  // the platform via a suggestion or "+Add an org" — grows over time, so it gets its
  // own search box instead of a long flat checkbox list.
  const platformOrgs = followable.filter((org) => !org.is_user_added).sort(sortByName);
  const userAddedOrgs = followable.filter((org) => org.is_user_added).sort(sortByName);

  // No descriptions/links here — Advocates is the only place those show. Settings
  // is just the followable picklist (name + checkbox).
  const renderOrgRow = (org) => {
    const id = String(org.id);
    const isSelected = selectedOrgs.has(id);
    return `
      <label class="settings-org-row" data-org-name="${escapeHtml((org.name || '').toLowerCase())}" style="display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer; user-select:none; background:var(--surface-page);">
        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleOrg('${escapeHtml(id)}')" style="width:18px; height:18px; cursor:pointer;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:500; color:var(--text-primary);">${escapeHtml(org.name || '(Organization)')}</div>
          ${org.region ? '<div class="individual-hint" style="font-size:11px; margin-top:2px;">' + escapeHtml(org.region) + '</div>' : ''}
        </div>
      </label>`;
  };

  let html = '';
  if (platformOrgs.length) {
    html += '<div class="volunteer-opportunities-heading">Platform</div>';
    html += '<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:16px;">' + platformOrgs.map(renderOrgRow).join('') + '</div>';
  }
  // Always shown, even with zero user-added orgs yet — a new user needs the
  // search+add path from day one, not just once someone else has added something.
  html += '<div class="volunteer-opportunities-heading">User added</div>';
  html += '<div style="display:flex; gap:8px; margin-bottom:8px;">';
  html += '<input type="text" id="settings-org-search" placeholder="Find or add an organization…" oninput="filterSettingsOrgList(this.value)" style="flex:1; min-width:0; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; color:var(--text-primary); font-family:inherit; box-sizing:border-box;">';
  html += '<button type="button" class="app-btn app-btn-outline" onclick="spMountOrgSuggestUI(document.getElementById(\'sp-org-suggest-slot\'), document.getElementById(\'settings-org-search\').value, { omitIntro: true })" style="font-size:13px; white-space:nowrap; flex-shrink:0;">+ Add</button>';
  html += '</div>';
  html += '<div id="sp-org-suggest-slot" style="margin-bottom:8px;"></div>';
  if (userAddedOrgs.length) {
    html += '<div id="settings-org-list-user-added" style="display:flex; flex-direction:column; gap:4px; max-height:280px; overflow-y:auto;">' + userAddedOrgs.map(renderOrgRow).join('') + '</div>';
  } else {
    html += '<div class="individual-hint" style="padding:4px 0;">No user-added organizations yet — search above to check, or add one.</div>';
  }

  container.innerHTML = html;
}

function filterSettingsOrgList(query) {
  const q = String(query || '').trim().toLowerCase();
  const list = document.getElementById('settings-org-list-user-added');
  if (!list) return;
  list.querySelectorAll('.settings-org-row').forEach((row) => {
    const name = row.getAttribute('data-org-name') || '';
    row.style.display = !q || name.includes(q) ? 'flex' : 'none';
  });
}
window.filterSettingsOrgList = filterSettingsOrgList;

// ─── TOGGLE ORG SELECTION ───
function toggleOrg(orgId) {
  if (selectedOrgs.has(orgId)) {
    selectedOrgs.delete(orgId);
  } else {
    selectedOrgs.add(orgId);
  }
  scheduleAutoSave();
}

// ─── COUNTRY CHANGE ───
function onCountryChange() {
  const select = document.getElementById('settings-country');
  if (select) {
    userCountry = select.value;
    scheduleAutoSave();
  }
}

// ─── ZIP CHANGE ───
function onZipChange() {
  const input = document.getElementById('settings-zip');
  if (input) {
    userZip = input.value;
    scheduleAutoSave();
  }
}

// ─── DIGEST FREQUENCY ───
function setDigestFrequency(freq) {
  digestFrequency = freq;
  scheduleAutoSave();
  renderSettingsPanel();
}

// ─── KEEP FORWARDED EMAIL TEXT ───
async function setKeepForwardedEmailText(on) {
  const previous = keepForwardedEmailText;
  keepForwardedEmailText = !!on;
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep_forwarded_email_text: keepForwardedEmailText }),
    });
    if (!res.ok) throw new Error('save failed');
  } catch (e) {
    keepForwardedEmailText = previous;
    const box = document.getElementById('settings-keep-email-text');
    if (box) box.checked = previous;
    alert('Could not save this setting. Please try again.');
  }
}

// ─── COPY ADDRESS ───
function copyAddress() {
  if (!forwardingAddress) {
    alert('No Causal address set');
    return;
  }
  navigator.clipboard.writeText(forwardingAddress).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = forwardingAddress;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

// ─── AUTO-SAVE ───
function scheduleAutoSave() {
  if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
  settingsAutoSaveTimer = setTimeout(doAutoSave, 700);
}

function setSaveStatus(text, colorVar) {
  const el = document.getElementById('sp-save-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = colorVar || 'var(--text-secondary)';
}

// Manual save: skips the debounce and saves whatever is currently selected.
function saveSettingsNow() {
  if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
  doAutoSave();
}

async function doAutoSave() {
  setSaveStatus('Saving…');
  try {
    const cityEl = document.getElementById('settings-city');
    const r = await fetch('/api/settings', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_country: userCountry || null,
        location_zip: userZip || null,
        location_city: cityEl ? cityEl.value.trim() || null : userCity || null,
        org_ids: Array.from(selectedOrgs).map(x => Number(x) || x),
        digest_frequency: digestFrequency,
        primary_region: Array.from(primaryRegions),
      }),
    });
    if (r.ok) {
      setSaveStatus('Saved ✓', '#166534');
      setTimeout(() => setSaveStatus(''), 2500);
      const body = await r.json().catch(() => ({}));
      if (body.geo_changed) {
        // Location changed — server is refreshing reps in background.
        // Call /api/reps/refresh so it awaits completion; then reload reps
        // if the user is currently on the Reps section.
        fetch('/api/reps/refresh', { method: 'POST', credentials: 'same-origin' })
          .then(() => { if (typeof loadReps === 'function') loadReps(); })
          .catch(() => {});
      }
    } else {
      setSaveStatus('Save failed — try again', '#991b1b');
    }
  } catch (e) {
    console.error('doAutoSave', e);
    setSaveStatus('Save failed — try again', '#991b1b');
  }
}

// ─── ADDRESS EDITING ───
function spStartAddressEdit() {
  const localInput = document.getElementById('sp-address-local');
  const local = (forwardingAddress || '').split('@')[0] || '';
  if (localInput) localInput.value = local;
  const view = document.getElementById('sp-address-view');
  const edit = document.getElementById('sp-address-edit');
  const err = document.getElementById('sp-address-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  if (view) view.style.display = 'none';
  if (edit) edit.style.display = 'block';
  if (localInput) {
    localInput.focus();
    localInput.oninput = function () {
      this.value = this.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
    };
  }
}

function spCancelAddressEdit() {
  const view = document.getElementById('sp-address-view');
  const edit = document.getElementById('sp-address-edit');
  const err = document.getElementById('sp-address-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  if (edit) edit.style.display = 'none';
  if (view) view.style.display = 'flex';
}

async function spSaveAddress() {
  const localInput = document.getElementById('sp-address-local');
  const err = document.getElementById('sp-address-error');
  let local = (localInput && localInput.value ? localInput.value : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (localInput) localInput.value = local;
  if (!local || local.length < 3 || local.length > 30) {
    if (err) { err.textContent = 'Address must be 3–30 letters/numbers.'; err.style.display = 'block'; }
    return;
  }
  try {
    const r = await fetch('/api/user/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ local_part: local }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (err) { err.textContent = body.error || 'Could not update address.'; err.style.display = 'block'; }
      return;
    }
    forwardingAddress = body.address || (local + '@inbound.causal.works');
    const addrEl = document.querySelector('code[style*="monospace"]');
    if (addrEl) addrEl.textContent = forwardingAddress;
    if (typeof window !== 'undefined') {
      window.CAUSAL_ADDRESS = forwardingAddress;
    }
    spCancelAddressEdit();
    const fb = document.getElementById('sp-feedback');
    if (fb) {
      fb.textContent = 'Address updated. Your previous address still works.';
      fb.style.opacity = '1';
      setTimeout(() => { fb.style.opacity = '0'; }, 3500);
    }
    scheduleAutoSave();
  } catch (e) {
    if (err) { err.textContent = 'Could not update address.'; err.style.display = 'block'; }
  }
}

// ─── REGION SELECTION ───
function spTogglePrimaryRegion(el) {
  const v = el.dataset.val;
  if (!v) return;
  if (primaryRegions.has(v)) primaryRegions.delete(v);
  else primaryRegions.add(v);
  el.style.background = primaryRegions.has(v) ? 'var(--accent)' : '';
  el.style.color = primaryRegions.has(v) ? 'white' : '';
  el.style.borderColor = primaryRegions.has(v) ? 'var(--accent)' : '';
  scheduleAutoSave();
}

// ─── ORG SUGGESTION ───
async function spSuggestOrg(name, containerEl) {
  const trimmed = (name || '').trim().slice(0, 500);
  if (!trimmed) return false;
  let ok = false;
  try {
    const res = await fetch('/api/orgs/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ org_name: trimmed }),
    });
    ok = res.ok;
  } catch (_) {
    ok = false;
  }
  if (containerEl) {
    containerEl.innerHTML = ok
      ? '<div style="font-size:13px;color:#166534;padding:6px 0;">Thanks — we\'ll review it.</div>'
      : '<div style="font-size:13px;color:#991b1b;padding:6px 0;">Couldn\'t send — try again.</div>';
  }
  return ok;
}

function spMountOrgSuggestUI(containerEl, initialQuery, options) {
  if (!containerEl) return;
  const omitIntro = options && options.omitIntro;
  const introLine = omitIntro
    ? ''
    : '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Not on the list yet?</div>';
  containerEl.innerHTML = `
    <div class="org-suggest-block" style="padding:4px 0;">
      ${introLine}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="text" class="org-suggest-input" maxlength="500" placeholder="Organization name"
          style="flex:1;min-width:160px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none;font-family:inherit;">
        <button type="button" class="org-suggest-btn app-btn"
          style="font-size:12px;white-space:nowrap;">Suggest →</button>
      </div>
    </div>`;
  const inp = containerEl.querySelector('.org-suggest-input');
  const btn = containerEl.querySelector('.org-suggest-btn');
  if (inp) inp.value = initialQuery != null ? String(initialQuery) : '';
  if (btn) {
    btn.addEventListener('click', async () => {
      const v = (inp && inp.value || '').trim();
      if (!v) return;
      btn.disabled = true;
      await spSuggestOrg(v, containerEl);
    });
  }
}

// ─── SIGN OUT ───
async function settingsSignOut() {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  } catch (e) {
    console.error('settingsSignOut', e);
    window.location.href = '/login';
  }
}

// ─── EXPORT TO WINDOW ───
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleOrg = toggleOrg;
window.onCountryChange = onCountryChange;
window.onZipChange = onZipChange;
window.setDigestFrequency = setDigestFrequency;
window.setKeepForwardedEmailText = setKeepForwardedEmailText;
window.copyAddress = copyAddress;
window.scheduleAutoSave = scheduleAutoSave;
window.saveSettingsNow = saveSettingsNow;
window.settingsSignOut = settingsSignOut;
window.spStartAddressEdit = spStartAddressEdit;
window.spCancelAddressEdit = spCancelAddressEdit;
window.spSaveAddress = spSaveAddress;
window.spTogglePrimaryRegion = spTogglePrimaryRegion;
window.spSuggestOrg = spSuggestOrg;
window.spMountOrgSuggestUI = spMountOrgSuggestUI;
