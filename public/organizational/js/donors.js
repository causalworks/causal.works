(function () {
  'use strict';

  const donorsTbody     = document.getElementById('organizational-donors-tbody');
  const addBtn          = document.getElementById('organizational-funder-add');
  const searchInput     = document.getElementById('organizational-donors-search');
  const panel           = document.getElementById('organizational-donor-panel');
  const donorsList      = document.getElementById('organizational-donors-list');
  const panelTitle      = document.getElementById('organizational-donors-panel-title');
  const panelBody       = document.getElementById('organizational-donors-panel-body');
  const panelClose      = document.getElementById('organizational-donors-panel-close');
  const panelErrEl      = document.getElementById('organizational-donors-panel-error');

  let currentSlug      = '';
  let fundersCache     = [];
  const sorter = donorsTbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(donorsTbody.closest('table'), {
    state: { index: 5, dir: 'desc' },
    columns: [
      { key: 'name', type: 'text', get: (c) => c.display_name },
      { key: 'kind', type: 'text', get: (c) => kindLabel(c) },
      { key: 'email', type: 'text', get: (c) => c.email },
      { key: 'status', type: 'text', get: (c) => donorStatus(c) },
      { key: 'lifetime_giving', type: 'currency', get: (c) => c.lifetime_giving_cents || null },
      { key: 'last_gift_date', type: 'date', get: (c) => c.last_gift_date },
    ],
    onChange: () => renderFunderList(),
  }) : null;
  let activeTypeFilter = 'all';
  let activeKind       = 'all';
  let shownDonorIds = [];
  let activeSearch     = '';
  let activeTagFilter  = '';
  let panelConstituent = null;
  let orgHasXero       = false;
  let pendingGiftType  = null;
  let funderOnly       = false;

  function showPanelError(msg) {
    if (!panelErrEl) return;
    panelErrEl.textContent = msg || '';
    panelErrEl.hidden = !msg;
  }

  function fmt(cents) { return window.formatMoneyCents ? window.formatMoneyCents(cents) : `$${(cents / 100).toFixed(2)}`; }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  function donorStatus(c) {
    if (!c.last_gift_date) return 'prospect';
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 13);
    return new Date(c.last_gift_date) >= cutoff ? 'current' : 'lapsed';
  }
  const ORG_TYPE_LABELS = { foundation: 'Foundation', corporate: 'Corporate', government: 'Government', nonprofit: 'Nonprofit', member_organization: 'Cooperative org' };
  function kindLabel(c) {
    if (c.kind === 'organization') return ORG_TYPE_LABELS[c.org_type] || 'Organization';
    return 'Individual';
  }
  function statusBadge(c) {
    const labels = { prospect: 'Prospect', current: 'Current', lapsed: 'Lapsed' };
    const roles = Array.isArray(c.roles) && c.roles.includes('board_member') ? ' <span class="organizational-badge">Board member</span>' : '';
    return `<span class="organizational-badge">${esc(labels[donorStatus(c)])}</span>${roles}`;
  }

  function apiUrl(path) { return `/api/organizational/orgs/${currentSlug}${path}`; }

  async function apiFetch(path, opts) {
    const res = await fetch(apiUrl(path), { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function openPanel(constituent) {
    panelConstituent = constituent;
    panelTitle.textContent = constituent.display_name;
    showPanelError('');
    renderFunderDetail(constituent);
    showPage();
  }

  function showPage() {
    panel.hidden = false;
    panel.classList.add('organizational-panel-is-open');
    if (donorsList) donorsList.hidden = true;
    window.scrollTo(0, 0);
  }

  function closePanel() {
    panel.hidden = true;
    panel.classList.remove('organizational-panel-is-open');
    if (donorsList) donorsList.hidden = false;
    panelConstituent = null;
    pendingGiftType = null;
  }

  panelClose && panelClose.addEventListener('click', e => { e.preventDefault(); closePanel(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && panel.classList.contains('organizational-panel-is-open')) closePanel();
  });

  async function exportShownDonors(e) {
    e.preventDefault();
    if (!currentSlug) return;
    if (!shownDonorIds.length) { alert('No donors are showing to export.'); return; }
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/constituents/export.csv', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: shownDonorIds }),
    });
    if (!res.ok) { alert('Could not export.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = 'donors-export-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function updateExportLink() {
    const link = document.getElementById('organizational-export-csv-link');
    if (!link || !currentSlug) return;
    if (!link.dataset.wired) { link.dataset.wired = '1'; link.addEventListener('click', exportShownDonors); }
    const params = new URLSearchParams();
    if (activeTypeFilter === 'board_member') params.set('role', 'board_member');
    if (activeTagFilter) params.set('tags', activeTagFilter);
    const qs = params.toString();
    link.href = `/api/organizational/orgs/${encodeURIComponent(currentSlug)}/constituents/export.csv${qs ? '?' + qs : ''}`;
  }

  function renderFunderList() {
    if (!donorsTbody) return;
    updateExportLink();
    let list = fundersCache.filter(c => (c.roles || []).includes('donor'));
    if (activeKind !== 'all') list = list.filter(c => c.kind === activeKind);
    if (activeTypeFilter === 'board_member') {
      list = list.filter(c => c.roles.includes('board_member'));
    } else if (activeTypeFilter !== 'all') {
      list = list.filter(c => donorStatus(c) === activeTypeFilter);
    }
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      list = list.filter(c => (c.display_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.additional_emails || []).join(' ').toLowerCase().includes(q));
    }
    if (activeTagFilter) {
      const filterTags = activeTagFilter.split(',').map(t => t.trim()).filter(Boolean);
      if (filterTags.length) {
        list = list.filter(c => {
          const cTags = Array.isArray(c.tags) ? c.tags : [];
          return filterTags.some(ft => cTags.includes(ft));
        });
      }
    }
    shownDonorIds = list.map(c => c.id);
    if (!list.length) {
      donorsTbody.innerHTML = `<tr class="organizational-table-empty"><td colspan="6">No donors match this filter.</td></tr>`;
      return;
    }
    donorsTbody.innerHTML = (sorter ? sorter.sortRows(list) : list).map(c => {
      const name = esc(c.display_name);
      const totalGiven = c.lifetime_giving_cents ? fmt(c.lifetime_giving_cents) : '—';
      const lastGift = c.last_gift_date ? fmtDate(c.last_gift_date) : '—';
      return `<tr class="organizational-grants-row" data-constituent-id="${c.id}" style="cursor:pointer;">
        <td>${name}</td>
        <td class="organizational-grants-col-secondary">${esc(kindLabel(c))}</td>
        <td class="organizational-grants-col-secondary">${esc(c.email || '—')}</td>
        <td>${statusBadge(c)}</td>
        <td>${totalGiven}</td>
        <td>${lastGift}</td>
      </tr>`;
    }).join('');
  }

  if (donorsTbody) {
    donorsTbody.addEventListener('click', e => {
      const row = e.target.closest('tr[data-constituent-id]');
      if (!row) return;
      const c = fundersCache.find(x => x.id === Number(row.dataset.constituentId));
      if (c) openPanel(c);
    });
  }

  function renderFunderDetail(constituent) {
    showPanelError('');
    const contactLine = [constituent.email, constituent.phone].filter(Boolean).map(esc).join(' · ');
    panelBody.innerHTML = `
      <p style="margin:0 0 10px;font-size:var(--text-sm);color:var(--text-secondary);">${contactLine || 'No email or phone yet'}${(constituent.roles || []).includes('board_member') ? ' · board member' : ''}</p>
      <div id="donor-summary" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" class="organizational-btn" data-donor-open="gift" style="background:var(--organizational-accent-tint);color:var(--organizational-accent);">Log a gift</button>
        <button type="button" class="organizational-btn" data-donor-open="interaction" style="background:var(--organizational-accent-tint);color:var(--organizational-accent);">Log an interaction</button>
        ${constituent.kind === 'organization' ? '<button type="button" class="organizational-btn" data-donor-open="grant" style="background:var(--organizational-accent-tint);color:var(--organizational-accent);">Add a grant</button>' : ''}
        <button type="button" class="organizational-btn organizational-btn-outline" data-donor-open="details" style="margin-left:auto;">Details</button>
      </div>
      <div id="donor-grants" style="margin-bottom:12px;"></div>
      <div id="donor-details" hidden style="margin-bottom:14px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;background:var(--surface-1,#fff);">
        <div id="funder-contact-section">
          ${renderContactForm(constituent)}
        </div>
        <hr style="margin:20px 0 14px;border:none;border-top:1px solid var(--border);">
        <div style="display:flex;gap:8px;">
          <button class="organizational-btn organizational-btn-sm organizational-btn-outline" id="donor-archive-btn">Archive donor</button>
          <button class="organizational-btn organizational-btn-sm organizational-btn-outline" id="donor-delete-btn" style="color:var(--organizational-error,#c0392b);border-color:var(--organizational-error,#c0392b);">Delete</button>
        </div>
        <p style="margin:6px 0 0;font-size:var(--text-xs);color:var(--text-secondary);">Archive hides the donor from all lists but keeps their history. Delete is permanent and only allowed for donors with no history.</p>
      </div>
      <!-- One timeline: gifts, pledges and interactions, newest first. The two lists keep their own sections;
           arrangeTimeline() orders their rows together and keeps each form closed until its button is pressed. -->
      <div id="donor-timeline" style="display:flex;flex-direction:column;">
        <div id="funder-gifts-section" style="display:contents;"><em style="color:var(--text-secondary);font-size:var(--text-sm);">Loading…</em></div>
        <div id="funder-interactions-section" style="display:contents;"></div>
      </div>
    `;
    timelineOpen = { gift: false, interaction: false };
    grantFormOpen = false;
    panelBody.querySelectorAll('[data-donor-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.donorOpen;
        if (k === 'grant') {
          grantFormOpen = !grantFormOpen;
          renderDonorGrants(constituent);
          const f = panelBody.querySelector('#donor-grant-form');
          if (f && grantFormOpen) { f.scrollIntoView({ block: 'nearest' }); const n = f.querySelector('[name=name]'); if (n) n.focus(); }
          return;
        }
        if (k === 'details') {
          const d = panelBody.querySelector('#donor-details');
          d.hidden = !d.hidden;
          return;
        }
        timelineOpen[k] = !timelineOpen[k];
        arrangeTimeline();
        const f = panelBody.querySelector(k === 'gift' ? '#gift-log-form' : '#interaction-add-form');
        if (f && timelineOpen[k]) f.scrollIntoView({ block: 'nearest' });
      });
    });
    renderDonorGrants(constituent);
    wireContactForm(constituent);
    loadGiftHistory(constituent.id);
    loadInteractions(constituent.id);

    const archiveBtn = panelBody.querySelector('#donor-archive-btn');
    const deleteBtn  = panelBody.querySelector('#donor-delete-btn');

    archiveBtn && archiveBtn.addEventListener('click', async () => {
      if (!confirm(`Archive ${constituent.display_name}? They'll be hidden from all donor lists.`)) return;
      try {
        await apiFetch(`/constituents/${constituent.id}`, { method: 'DELETE' });
        fundersCache = fundersCache.filter(c => c.id !== constituent.id);
        renderFunderList();
        closePanel();
      } catch (err) {
        showPanelError(err.message);
      }
    });

    deleteBtn && deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Permanently delete ${constituent.display_name}? This cannot be undone.`)) return;
      try {
        await apiFetch(`/constituents/${constituent.id}?permanent=true`, { method: 'DELETE' });
        fundersCache = fundersCache.filter(c => c.id !== constituent.id);
        renderFunderList();
        closePanel();
      } catch (err) {
        showPanelError(err.message);
      }
    });
  }

  let grantFormOpen = false;
  function renderDonorGrants(c) {
    const el = panelBody && panelBody.querySelector('#donor-grants');
    const g = window.OrganizationalFunders.grants;
    if (!el || c.kind !== 'organization' || !g || !g.grantsFor) return;
    const list = g.grantsFor(c.id);
    const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    const programs = g.programs ? g.programs() : [];
    const form = !grantFormOpen ? '' : `<form id="donor-grant-form" style="margin-bottom:10px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;background:var(--surface-2);">
        <p style="font-size:var(--text-sm);font-weight:600;margin:0 0 8px;">Add a grant for ${esc(c.display_name)}</p>
        <div class="organizational-panel-fields">
          <div class="organizational-panel-field-row"><label class="organizational-label">Grant name *</label><input class="organizational-input" name="name" required maxlength="200"></div>
          <div class="organizational-panel-field-row"><label class="organizational-label">Status</label>
            <select class="organizational-input" name="status"><option value="prospect">Prospect</option><option value="applied">Applied</option><option value="awarded">Awarded</option></select></div>
          <div class="organizational-panel-field-row"><label class="organizational-label">Amount</label><input class="organizational-input" name="amount" inputmode="decimal" placeholder="Requested or awarded"></div>
          <div class="organizational-panel-field-row"><label class="organizational-label">Primary program</label>
            <select class="organizational-input" name="primary_program_id"><option value="">— None —</option>${programs.map(p => `<option value="${p.id}">${esc((p.code ? p.code + ' — ' : '') + p.name)}</option>`).join('')}</select></div>
          <div class="organizational-panel-field-row"><label class="organizational-label">Grant start</label><input class="organizational-input" type="date" name="start_date"></div>
          <div class="organizational-panel-field-row"><label class="organizational-label">Grant end</label><input class="organizational-input" type="date" name="end_date"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
          <button type="submit" class="organizational-btn" data-after="stay">Save</button>
          <button type="submit" class="organizational-btn organizational-btn-outline" data-after="open">Save and open the grant</button>
          <span id="donor-grant-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
        </div>
      </form>`;
    el.innerHTML = form + (list.length
      ? `<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:4px;">Grants</div>` + list.map(x => `
      <div data-open-grant="${x.id}" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;cursor:pointer;">
        <strong>${esc(x.name)}</strong>
        <span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(cap(x.status))}</span>
        <span style="margin-left:auto;">${x.amount_cents ? fmt(x.amount_cents) : '—'}</span>
      </div>`).join('')
      : (grantFormOpen ? '' : '<p style="margin:0;font-size:var(--text-sm);color:var(--text-secondary);">No grants yet.</p>'));
    el.querySelectorAll('[data-open-grant]').forEach(row => {
      row.addEventListener('click', () => { window.OrganizationalFunders.switchTab('grants'); g.openGrant(Number(row.dataset.openGrant)); });
    });
    const f = el.querySelector('#donor-grant-form');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault();
      const after = e.submitter && e.submitter.dataset.after;
      const body = { funder: c.display_name, constituent_id: c.id };
      new FormData(f).forEach((v, k) => { if (String(v).trim()) body[k] = String(v).trim(); });
      const status = f.querySelector('#donor-grant-status');
      status.textContent = 'Saving…';
      try {
        const out = await apiFetch('/grants', { method: 'POST', body: JSON.stringify(body) });
        await g.reload();
        grantFormOpen = false;
        renderDonorGrants(c);
        if (after === 'open' && out.grant) { window.OrganizationalFunders.switchTab('grants'); g.openGrant(Number(out.grant.id)); }
      } catch (err) {
        status.textContent = '';
        showPanelError(err.message);
      }
    });
  }

  function renderTagChips(tags) {
    const list = Array.isArray(tags) ? tags : [];
    return list.map(t =>
      `<span class="organizational-badge" style="cursor:pointer;user-select:none;" data-tag="${esc(t)}">${esc(t)} <span style="margin-left:4px;opacity:0.6;">✕</span></span>`
    ).join(' ');
  }

  function renderContactForm(c) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    return `<form id="funder-contact-form" data-id="${c.id}">
      <div class="organizational-panel-fields">
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="fc-name">Name</label>
        <input class="organizational-input" id="fc-name" name="display_name" value="${esc(c.display_name)}" required>
      </div>
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="fc-website">Website</label>
        <input class="organizational-input" id="fc-website" name="website" type="url" value="${esc(c.website || '')}">
      </div>
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="fc-email">Email</label>
        <input class="organizational-input" id="fc-email" name="email" type="email" value="${esc(c.email || '')}">
      </div>
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="fc-more-emails">Other emails</label>
        <input class="organizational-input" id="fc-more-emails" name="additional_emails" placeholder="Separate with commas" value="${esc((c.additional_emails || []).join(', '))}">
      </div>
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="fc-phone">Phone</label>
        <input class="organizational-input" id="fc-phone" name="phone" value="${esc(c.phone || '')}">
      </div>
      <div class="organizational-panel-field-row organizational-panel-field-full">
        <label class="organizational-label" for="fc-notes">Notes</label>
        <textarea class="organizational-textarea" id="fc-notes" name="notes" rows="3" style="width:100%;">${esc(c.notes || '')}</textarea>
      </div>
      <div class="organizational-panel-field-row organizational-panel-field-full">
        <label class="organizational-label">Other roles</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px 16px;">
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="fc-role-board-member" ${(c.roles || []).includes('board_member') ? 'checked' : ''}> Board member
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="fc-role-vendor" ${(c.roles || []).includes('vendor') ? 'checked' : ''}> Vendor <span style="color:var(--text-secondary);">(can be billed via Purchases)</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="fc-role-customer" ${(c.roles || []).includes('customer') ? 'checked' : ''}> Customer <span style="color:var(--text-secondary);">(can be invoiced via Sales)</span>
        </label>
        </div>
      </div>
      <div class="organizational-panel-field-row organizational-panel-field-full">
        <label class="organizational-label">Tags</label>
        <div id="fc-tag-chips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:24px;margin-bottom:4px;">${renderTagChips(tags)}</div>
        <div style="display:flex;gap:6px;align-items:center;position:relative;">
          <input type="text" class="organizational-input" id="fc-tag-input" placeholder="Add tag, press Enter" style="flex:1;font-size:var(--text-sm);">
          <div id="fc-tag-suggest" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);z-index:100;max-height:160px;overflow-y:auto;box-shadow:var(--shadow-md);"></div>
        </div>
      </div>
      </div>
      <div class="organizational-panel-actions" style="margin:16px 0 0;padding:14px 0;bottom:0;background:none;justify-content:flex-start;align-items:center;">
        <button type="submit" class="organizational-btn organizational-btn-primary">Save changes</button>
        <span id="fc-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
      </div>
    </form>`;
  }

  let formTags = [];

  function wireContactForm(constituent) {
    const form = panelBody.querySelector('#funder-contact-form');
    if (!form) return;

    formTags = Array.isArray(constituent.tags) ? constituent.tags.slice() : [];

    function refreshChips() {
      const chipsEl = form.querySelector('#fc-tag-chips');
      if (chipsEl) chipsEl.innerHTML = renderTagChips(formTags);
      (form.querySelectorAll('#fc-tag-chips [data-tag]') || []).forEach(chip => {
        chip.addEventListener('click', () => {
          const tag = chip.dataset.tag;
          formTags = formTags.filter(t => t !== tag);
          refreshChips();
        });
      });
    }
    refreshChips();

    const tagInput = form.querySelector('#fc-tag-input');
    const suggestEl = form.querySelector('#fc-tag-suggest');
    let orgTagCache = null;

    async function loadOrgTags() {
      if (orgTagCache) return orgTagCache;
      try {
        const data = await apiFetch('/constituents/tags');
        orgTagCache = Array.isArray(data) ? data : [];
      } catch (_) { orgTagCache = []; }
      return orgTagCache;
    }

    function addTag(value) {
      const tag = String(value || '').trim();
      if (!tag || formTags.includes(tag)) return;
      formTags.push(tag);
      refreshChips();
      if (tagInput) tagInput.value = '';
      if (suggestEl) suggestEl.style.display = 'none';
    }

    if (tagInput) {
      tagInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addTag(tagInput.value);
        }
      });

      tagInput.addEventListener('input', async () => {
        const q = tagInput.value.trim().toLowerCase();
        if (!q) { if (suggestEl) suggestEl.style.display = 'none'; return; }
        const tags = await loadOrgTags();
        const matches = tags.filter(t => t.toLowerCase().includes(q) && !formTags.includes(t));
        if (!matches.length) { if (suggestEl) suggestEl.style.display = 'none'; return; }
        if (suggestEl) {
          suggestEl.innerHTML = matches.slice(0, 8).map(t =>
            `<div data-suggest="${esc(t)}" style="padding:6px 10px;cursor:pointer;font-size:var(--text-sm);">${esc(t)}</div>`
          ).join('');
          suggestEl.style.display = 'block';
          suggestEl.querySelectorAll('[data-suggest]').forEach(el => {
            el.addEventListener('mousedown', e => { e.preventDefault(); addTag(el.dataset.suggest); });
          });
        }
      });

      tagInput.addEventListener('blur', () => {
        setTimeout(() => { if (suggestEl) suggestEl.style.display = 'none'; }, 150);
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const statusEl = form.querySelector('#fc-status');
      const fd = new FormData(form);
      const body = {};
      for (const [k, v] of fd.entries()) body[k] = v;
      body.tags = formTags;
      body.roles = ['donor'];
      if (form.querySelector('#fc-role-board-member').checked) body.roles.push('board_member');
      if (form.querySelector('#fc-role-vendor').checked) body.roles.push('vendor');
      if (form.querySelector('#fc-role-customer').checked) body.roles.push('customer');
      try {
        const updated = await apiFetch(`/constituents/${constituent.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        const idx = fundersCache.findIndex(c => c.id === constituent.id);
        if (idx >= 0) fundersCache[idx] = { ...fundersCache[idx], ...updated };
        panelConstituent = { ...panelConstituent, ...updated };
        formTags = Array.isArray(updated.tags) ? updated.tags.slice() : [];
        panelTitle.textContent = updated.display_name;
        if (statusEl) statusEl.textContent = 'Saved';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
        renderFunderList();
      } catch (err) {
        showPanelError(err.message);
      }
    });
  }

  async function loadInteractions(constituentId) {
    const section = panelBody && panelBody.querySelector('#funder-interactions-section');
    if (!section) return;
    try {
      const interactions = await apiFetch(`/constituents/${constituentId}/interactions`);
      renderInteractionLog(section, constituentId, interactions);
      arrangeTimeline();
    } catch (err) {
      section.innerHTML = `<p style="color:var(--organizational-error);font-size:var(--text-sm);">Could not load interactions: ${esc(err.message)}</p>`;
    }
  }

  function renderInteractionLog(section, constituentId, interactions) {
    const TYPES = { meeting: 'Meeting', call: 'Call', email: 'Email', note: 'Note', site_visit: 'Site visit' };
    const logHtml = interactions.length
      ? interactions.map(i => `
          <div class="organizational-interaction-row" style="display:flex;gap:10px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;" data-interaction-id="${i.id}" data-when="${esc(String(i.interaction_date || '').slice(0, 10))}">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <span class="organizational-badge">${esc(TYPES[i.interaction_type] || i.interaction_type)}</span>
                <span style="font-size:var(--text-sm);color:var(--text-secondary);">${fmtDate(i.interaction_date)}</span>
                ${i.grant_name ? `<span style="font-size:var(--text-sm);color:var(--text-secondary);">· ${esc(i.grant_name)}</span>` : ''}
              </div>
              <p style="margin:0;font-size:var(--text-sm);">${esc(i.description)}</p>
              ${i.recorded_by_email ? `<p style="margin:2px 0 0;font-size:var(--text-xs);color:var(--text-secondary);">Logged by ${esc(i.recorded_by_email)}</p>` : ''}
            </div>
            <button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-delete-interaction" data-id="${i.id}" title="Delete" style="align-self:flex-start;padding:2px 6px;">✕</button>
          </div>`
        ).join('')
      : '';

    section.innerHTML = `
      <div id="interaction-log-list" style="display:contents;">${logHtml}</div>
      <div id="interaction-add-form" style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;background:var(--surface-2);">
        <p style="font-size:var(--text-sm);font-weight:600;margin:0 0 8px;">Log an interaction</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <select class="organizational-select" id="int-type" style="min-width:140px;">
            ${Object.entries(TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <input type="date" class="organizational-input" id="int-date" value="${new Date().toISOString().slice(0,10)}" style="width:140px;">
        </div>
        <textarea class="organizational-textarea" id="int-desc" rows="2" placeholder="What happened?" style="width:100%;margin-bottom:8px;"></textarea>
        <button class="organizational-btn organizational-btn-sm" id="int-submit">Log interaction</button>
        <span id="int-status" style="font-size:var(--text-sm);color:var(--text-secondary);margin-left:8px;"></span>
      </div>
    `;

    section.querySelectorAll('.organizational-delete-interaction').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this interaction?')) return;
        const id = Number(btn.dataset.id);
        try {
          await apiFetch(`/interactions/${id}`, { method: 'DELETE' });
          const row = section.querySelector(`[data-interaction-id="${id}"]`);
          if (row) row.remove();
        } catch (err) {
          showPanelError(err.message);
        }
      });
    });

    const submitBtn = section.querySelector('#int-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const typeEl   = section.querySelector('#int-type');
        const dateEl   = section.querySelector('#int-date');
        const descEl   = section.querySelector('#int-desc');
        const statusEl = section.querySelector('#int-status');
        const description = (descEl.value || '').trim();
        if (!description) { descEl.focus(); return; }
        try {
          submitBtn.disabled = true;
          await apiFetch(`/constituents/${constituentId}/interactions`, {
            method: 'POST',
            body: JSON.stringify({
              interaction_type: typeEl.value,
              interaction_date: dateEl.value,
              description,
            }),
          });
          descEl.value = '';
          if (statusEl) { statusEl.textContent = 'Logged'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
          await loadInteractions(constituentId);
        } catch (err) {
          showPanelError(err.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
    }
  }

  async function loadToConfirm() {
    const el = document.getElementById('organizational-to-confirm');
    const tabBtn = document.querySelector('#organizational-funders-workspace-tabs [data-section="donors"]');
    if (!el || !currentSlug) return;
    let gifts = [];
    try { gifts = (await apiFetch('/gifts/to-confirm')).gifts || []; } catch (e) { el.hidden = true; return; }
    if (tabBtn) {
      let badge = tabBtn.querySelector('.organizational-tab-count');
      if (!gifts.length) { if (badge) badge.remove(); } else {
        if (!badge) { badge = document.createElement('span'); badge.className = 'organizational-tab-count'; badge.style.cssText = 'margin-left:6px;font-size:0.6875rem;padding:0 6px;border-radius:9px;background:var(--organizational-accent);color:#fff;'; tabBtn.appendChild(badge); }
        badge.textContent = gifts.length;
      }
    }
    if (!gifts.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<div style="font-weight:600;margin-bottom:2px;">Recorded in Accounting, to confirm (' + gifts.length + ')</div>'
      + '<p class="organizational-hint" style="margin:0 0 8px;">Money entered in the books as a donation. It already counts in giving totals. Confirm the donor (from Contacts) and campaign, or say it is not a gift.</p>'
      + '<div id="tc-rows">' + gifts.map((g) =>
        '<div class="tc-row" data-id="' + g.id + '" style="display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(220px,1.4fr) minmax(120px,0.8fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--border);">'
        + '<div><strong>' + fmt(g.amount_cents) + '</strong> <span style="color:var(--text-secondary);font-size:0.8125rem;">' + esc(fmtDate(g.received_at)) + (g.gift_type === 'grant' ? ' · grant' + (g.grant_name ? ': ' + esc(g.grant_name) : '') : '') + '</span>'
        + '<div style="font-size:0.75rem;color:var(--text-secondary);">' + esc(g.revenue_accounts || '') + (g.recorded_by ? ' · entered by ' + esc(g.recorded_by) : '') + (g.payee || g.memo ? ' · ' + esc(g.payee || g.memo) : '') + '</div></div>'
        + '<div><div class="tc-picker" data-id="' + g.id + '"></div>' + (g.constituent_id ? '' : '<div style="font-size:0.75rem;color:var(--amber);">Donor not identified</div>')
        + (g.payer_name ? '<div style="font-size:0.75rem;color:var(--text-secondary);">Paid by ' + esc(g.payer_name) + ' (on the entry in Accounting). The donor credited can be someone else, such as the person an estate or fund is paying for.</div>' : '') + '</div>'
        + '<input type="text" class="organizational-input tc-campaign" placeholder="Campaign (optional)" aria-label="Campaign">'
        + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">'
        + '<button type="button" class="organizational-btn organizational-btn-primary tc-confirm" data-id="' + g.id + '" style="font-size:0.8125rem;padding:2px 10px;">Confirm</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline tc-no" data-id="' + g.id + '" style="font-size:0.8125rem;padding:2px 10px;">Not a gift</button></div>'
        + '<div class="tc-no-row" data-id="' + g.id + '" hidden style="grid-column:1 / -1;display:none;gap:6px;align-items:center;">'
        + '<input type="text" class="organizational-input tc-no-reason" placeholder="Why is this not a gift? (a refund, a transfer, a reimbursement)" style="flex:1;">'
        + '<button type="button" class="organizational-btn organizational-btn-outline tc-no-ok" data-id="' + g.id + '" style="font-size:0.8125rem;padding:2px 10px;">Save</button></div>'
        + '<p class="tc-err organizational-error" data-id="' + g.id + '" hidden style="grid-column:1 / -1;margin:0;"></p>'
        + '</div>').join('') + '</div>';
    gifts.forEach((g) => {
      const mount = el.querySelector('.tc-picker[data-id="' + g.id + '"]');
      if (window.OrganizationalContactPicker && mount) {
        window.OrganizationalContactPicker.mount(mount, { getCache: () => fundersCache, role: 'donor', label: 'donor', slug: currentSlug, selectedId: g.constituent_id, valueElementId: 'tc-donor-' + g.id });
      }
    });
    const err = (id, msg) => { const p = el.querySelector('.tc-err[data-id="' + id + '"]'); if (p) { p.textContent = msg || ''; p.hidden = !msg; } };
    el.querySelectorAll('.tc-confirm').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id); err(id, '');
      const row = el.querySelector('.tc-row[data-id="' + id + '"]');
      const donor = document.getElementById('tc-donor-' + id);
      try {
        await apiFetch('/gifts/' + id + '/confirm', { method: 'POST', body: JSON.stringify({ constituent_id: donor && donor.value ? Number(donor.value) : null, campaign: row.querySelector('.tc-campaign').value.trim() || undefined }) });
        await init(currentSlug);
      } catch (e) { err(id, e.message); }
    }));
    el.querySelectorAll('.tc-no').forEach((b) => b.addEventListener('click', () => {
      const r = el.querySelector('.tc-no-row[data-id="' + b.dataset.id + '"]'); r.hidden = false; r.style.display = 'flex'; r.querySelector('input').focus();
    }));
    el.querySelectorAll('.tc-no-ok').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id); err(id, '');
      const reason = el.querySelector('.tc-no-row[data-id="' + id + '"] .tc-no-reason').value.trim();
      try {
        await apiFetch('/gifts/' + id + '/not-a-gift', { method: 'POST', body: JSON.stringify({ reason }) });
        await init(currentSlug);
      } catch (e) { err(id, e.message); }
    }));
  }

  async function loadPromisedSummary() {
    const el = document.getElementById('organizational-promised-summary');
    if (!el || !currentSlug) return;
    try {
      const d = await apiFetch('/gifts/promised-summary');
      const held = d.intention.cents + d.conditional.cents;
      if (!held && !d.awaiting_accounting.cents && !d.booked.cents) { el.hidden = true; return; }
      const parts = [];
      if (held) parts.push('<b>Promised, not yet in the books: ' + fmt(held) + '</b> (conditional ' + fmt(d.conditional.cents) + ', intention ' + fmt(d.intention.cents) + ')');
      if (d.awaiting_accounting.cents) parts.push('waiting for Accounting to accept: ' + fmt(d.awaiting_accounting.cents));
      if (d.booked.cents) parts.push('booked: ' + fmt(d.booked.cents));
      el.innerHTML = parts.join(' · ');
      el.hidden = false;
    } catch (e) { el.hidden = true; }
  }

  async function loadGiftHistory(constituentId) {
    const section = panelBody && panelBody.querySelector('#funder-gifts-section');
    if (!section) return;
    try {
      const gifts = await apiFetch(`/constituents/${constituentId}/gifts`);
      renderGiftHistory(section, constituentId, gifts);
      arrangeTimeline();
      applyPendingGift();
      renderDonorSummary(gifts);
      loadPromisedSummary();
    } catch (err) {
      section.innerHTML = `<p style="color:var(--organizational-error);font-size:var(--text-sm);">Could not load gifts: ${esc(err.message)}</p>`;
    }
  }

  function applyPendingGift() {
    if (!pendingGiftType || !panelBody) return;
    const typeEl = panelBody.querySelector('#gift-type');
    if (!typeEl) return;
    typeEl.value = pendingGiftType;
    typeEl.dispatchEvent(new Event('change'));
    pendingGiftType = null;
    timelineOpen.gift = true;
    arrangeTimeline();
    const f = panelBody.querySelector('#gift-log-form');
    if (f) { f.scrollIntoView({ block: 'nearest' }); const amt = f.querySelector('#gift-amount'); if (amt) amt.focus(); }
  }

  function openGiftPicker(type) {
    pendingGiftType = type;
    panelConstituent = null;
    panelTitle.textContent = type === 'pledge' ? 'Add pledge' : 'Add donation';
    showPanelError('');
    panelBody.innerHTML = `
      <p style="margin:0 0 8px;font-size:var(--text-sm);">Who is it from?</p>
      <input type="search" class="organizational-input" id="gift-pick-search" placeholder="Search donors…" autocomplete="off" style="max-width:420px;margin-bottom:8px;">
      <div id="gift-pick-list" style="max-width:420px;"></div>
      <p style="margin:12px 0 0;font-size:var(--text-sm);"><a href="#" class="organizational-link" id="gift-pick-new">Not listed? Add a new donor</a></p>`;
    const list = panelBody.querySelector('#gift-pick-list');
    const input = panelBody.querySelector('#gift-pick-search');
    function draw() {
      const q = input.value.trim().toLowerCase();
      if (!q) { list.innerHTML = ''; return; }
      const nameCount = {};
      fundersCache.forEach(c => { const k = String(c.display_name || '').toLowerCase(); nameCount[k] = (nameCount[k] || 0) + 1; });
      const rows = fundersCache.filter(c => (c.roles || []).includes('donor') && (c.display_name || '').toLowerCase().includes(q))
        .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name))).slice(0, 12);
      list.innerHTML = rows.length ? rows.map(c => `<div data-pick="${c.id}" style="display:flex;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;cursor:pointer;">
          <span>${esc(c.display_name)}</span><span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(kindLabel(c))}${nameCount[String(c.display_name).toLowerCase()] > 1 && c.email ? ' · ' + esc(c.email) : ''}</span></div>`).join('')
        : '<p style="margin:0;font-size:var(--text-sm);color:var(--text-secondary);">No donor matches.</p>';
    }
    draw();
    input.addEventListener('input', draw);
    list.addEventListener('click', e => {
      const row = e.target.closest('[data-pick]');
      const c = row && fundersCache.find(x => x.id === Number(row.dataset.pick));
      if (c) openPanel(c);
    });
    panelBody.querySelector('#gift-pick-new').addEventListener('click', e => { e.preventDefault(); openNewFunderPanel(); });
    showPage();
    input.focus();
  }

  [['organizational-gift-add-donation', 'donation'], ['organizational-gift-add-pledge', 'pledge']].forEach(([id, type]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { window.OrganizationalFunders.switchTab('donors'); openGiftPicker(type); });
  });

  let timelineOpen = { gift: false, interaction: false };
  function arrangeTimeline() {
    const root = panelBody && panelBody.querySelector('#donor-timeline');
    if (!root) return;
    const rows = Array.from(root.querySelectorAll('.organizational-gift-row, .organizational-interaction-row'));
    rows.sort((x, y) => String(y.dataset.when || '').localeCompare(String(x.dataset.when || '')));
    rows.forEach((r, i) => { r.style.order = String(i + 1); });
    const gf = root.querySelector('#gift-log-form');
    const inf = root.querySelector('#interaction-add-form');
    if (gf) { gf.hidden = !timelineOpen.gift; gf.style.order = '-2'; }
    if (inf) { inf.hidden = !timelineOpen.interaction; inf.style.order = '-1'; }
    root.querySelectorAll('[data-empty-note]').forEach(n => { n.hidden = rows.length > 0 && n.dataset.emptyNote !== 'first'; });
  }

  function renderDonorSummary(gifts) {
    const el = panelBody && panelBody.querySelector('#donor-summary');
    if (!el) return;
    const counted = gifts.filter(g => g.posting_status !== 'void' && g.review_status !== 'dismissed');
    const real = counted.filter(g => g.gift_type !== 'pledge');
    const total = real.reduce((n, g) => n + Number(g.amount_cents || 0), 0);
    const largest = real.reduce((n, g) => Math.max(n, Number(g.amount_cents || 0)), 0);
    const last = real.map(g => String(g.received_at || '').slice(0, 10)).sort().pop();
    const face = g => Number(g.total_pledged_cents != null ? g.total_pledged_cents : g.amount_cents || 0);
    const pledges = counted.filter(g => g.gift_type === 'pledge');
    const promised = pledges.filter(g => g.posting_status !== 'posted').reduce((n, g) => n + face(g), 0);
    const booked = pledges.filter(g => g.posting_status === 'posted').reduce((n, g) => n + face(g), 0);
    const tile = (label, value) => `<div style="flex:1 1 150px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;background:var(--surface-1,#fff);">
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${label}</div>
        <div style="font-size:1.125rem;font-weight:600;">${value}</div></div>`;
    el.innerHTML = tile('Total given', real.length ? fmt(total) : '—')
      + tile('Last gift', last ? fmtDate(last) : '—')
      + tile('Largest gift', largest ? fmt(largest) : '—')
      + tile('Promised, not booked', promised ? fmt(promised) : '—')
      + tile('Pledges booked', booked ? fmt(booked) : '—');
  }

  function pledgeStatusBadge(g) {
    const posted = g.posting_status === 'posted', void_ = g.posting_status === 'void';
    const label = void_ ? 'Void' : posted ? 'Booked' : g.posting_status === 'unposted' ? 'Waiting for Accounting'
      : g.pledge_status === 'conditional' ? 'Held: conditional' : 'Held: intention';
    const tip = g.pledge_status === 'conditional' ? 'Not in the books until the condition is met: ' + (g.pledge_condition || '')
      : g.pledge_status === 'intention' ? 'A hope to give, not binding. Not in the books.'
      : posted ? 'Accepted and posted by Accounting.' : 'Marked unconditional. Accounting accepts it before it is posted.';
    return `<span title="${esc(tip)}" style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(label)}</span>`;
  }

  function renderGiftHistory(section, constituentId, gifts) {
    const GIFT_TYPES = { donation: 'Donation', pledge: 'Pledge', grant: 'Grant' };
    const PAYMENT_METHODS = ['check', 'ach', 'wire', 'credit_card', 'cash', 'stripe', 'in_kind', 'other'];

    const listHtml = gifts.length
      ? gifts.map(g => {
          const typeLabel = GIFT_TYPES[g.gift_type] || g.gift_type;
          const ackStatus = g.acknowledgment_sent_at
            ? `<span title="Sent ${fmtDate(g.acknowledgment_sent_at)}" style="color:var(--text-secondary);font-size:var(--text-xs);">✓ ack'd</span>`
            : '';
          const receiptStatus = g.receipt_sent_at
            ? `<span title="Generated ${fmtDate(g.receipt_sent_at)}" style="color:var(--text-secondary);font-size:var(--text-xs);">✓ receipt generated</span>`
            : '';
          const campaignStr = g.campaign ? `<span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(g.campaign)}</span>` : '';
          const methodStr = g.payment_method ? `<span class="organizational-badge" style="font-size:var(--text-xs);">${esc(g.payment_method)}</span>` : '';
          const receiptLink = g.gift_type === 'pledge' ? '' : `<a class="organizational-link" href="/api/organizational/orgs/${esc(currentSlug)}/reports/gifts/${g.id}/receipt" download style="font-size:var(--text-xs);">Receipt</a>`;
          return `<div class="organizational-gift-row" data-gift-id="${g.id}" data-when="${esc(String(g.received_at || '').slice(0, 10))}" style="border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="organizational-badge">${esc(typeLabel)}</span>
              ${g.gift_type === 'pledge' ? pledgeStatusBadge(g) : ''}
              ${g.review_status === 'to_confirm' ? '<span class="organizational-badge" title="Recorded in Accounting. Confirm it in the Donors tab list." style="font-size:var(--text-xs);">From Accounting, to confirm</span>' : ''}
              ${g.needs_discounting && g.pledge_status === 'unconditional' && g.posting_status === 'unposted' ? '<span title="Accounting sets the discount rate when it posts this pledge" style="font-weight:600;font-size:var(--text-xs);color:var(--amber);">Needs discounting</span>' : ''}
              <span style="font-size:var(--text-sm);color:var(--text-secondary);">${fmtDate(g.received_at)}</span>
              <strong style="font-size:var(--text-sm);">${fmt(g.amount_cents)}</strong>
              ${methodStr}
              ${campaignStr}
              ${ackStatus}
              ${receiptStatus}
              <div style="margin-left:auto;display:flex;gap:4px;align-items:center;">
                ${receiptLink}
                <button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-edit-gift" data-id="${g.id}" style="padding:2px 6px;font-size:var(--text-xs);">Edit</button>
                ${g.not_gift_flagged_at ? `<span class="organizational-badge" title="${esc(g.not_gift_note || '')}" style="font-size:var(--text-xs);">Flagged: not a gift, with Accounting</span>` : (g.gift_source !== 'accounting' && (g.posting_status === 'unposted' || g.posting_status === 'held') ? `<button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-delete-gift" data-id="${g.id}" style="padding:2px 6px;font-size:var(--text-xs);">✕</button>` : `<button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-notgift-gift" data-id="${g.id}" style="padding:2px 6px;font-size:var(--text-xs);">Not a gift?</button>`)}
              </div>
            </div>
            <div class="organizational-gift-edit-form" id="gift-edit-${g.id}" hidden style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);"></div>
          </div>`;
        }).join('')
      : `<p data-empty-note="first" style="color:var(--text-secondary);font-size:var(--text-sm);margin:0 0 8px;order:0;">Nothing logged yet. Use Log a gift or Log an interaction.</p>`;

    section.innerHTML = `
      <div id="gift-history-list" style="display:contents;">${listHtml}</div>
      <div id="gift-log-form" style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;background:var(--surface-2);">
        <p style="font-size:var(--text-sm);font-weight:600;margin:0 0 8px;">Log a gift</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <label class="organizational-label" style="font-size:var(--text-xs);">Type</label>
            <select class="organizational-select" id="gift-type">
              ${Object.entries(GIFT_TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="organizational-label" style="font-size:var(--text-xs);">Amount ($)</label>
            <input type="number" class="organizational-input" id="gift-amount" min="0" step="0.01" placeholder="0.00">
          </div>
          <div>
            <label class="organizational-label" style="font-size:var(--text-xs);">Date</label>
            <input type="date" class="organizational-input" id="gift-date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label class="organizational-label" style="font-size:var(--text-xs);">Payment method</label>
            <select class="organizational-select" id="gift-method">
              <option value="">— optional —</option>
              ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="organizational-label" style="font-size:var(--text-xs);">Campaign / appeal</label>
            <input type="text" class="organizational-input" id="gift-campaign" placeholder="optional">
          </div>
          <div id="gift-grant-wrap" hidden>
            <label class="organizational-label" style="font-size:var(--text-xs);">Linked grant</label>
            <select class="organizational-select" id="gift-grant-id"><option value="">Loading…</option></select>
          </div>
          <div id="gift-sponsored-project-wrap" hidden>
            <label class="organizational-label" style="font-size:var(--text-xs);">Designated to sponsored project</label>
            <select class="organizational-select" id="gift-sponsored-project-id"><option value="">— none —</option></select>
          </div>
          <div id="gift-program-wrap" hidden>
            <label class="organizational-label" style="font-size:var(--text-xs);">Program</label>
            <select class="organizational-select" id="gift-program-id"><option value="">Loading…</option></select>
          </div>
        </div>
        <div id="gift-inkind-fields" hidden style="border:1px solid var(--border);border-radius:var(--radius-md);padding:8px;margin-bottom:8px;background:var(--surface-1);">
          <p style="font-size:var(--text-xs);font-weight:600;margin:0 0 6px;">In-kind details (required for posting to the ledger)</p>
          <div style="margin-bottom:6px;">
            <label class="organizational-label" style="font-size:var(--text-xs);">Description of property/services donated</label>
            <input type="text" class="organizational-input" id="gift-ik-description" placeholder="e.g. 5 laptops, legal services (10 hrs)">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Valuation method</label>
              <select class="organizational-select" id="gift-ik-valuation">
                <option value="">— select —</option>
                <option value="quoted_market_price">Quoted market price</option>
                <option value="comparable_sales">Comparable sales</option>
                <option value="cost_replacement">Cost/replacement</option>
                <option value="professional_appraisal">Professional appraisal</option>
                <option value="donor_stated">Donor-stated</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div></div>
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Gifts-in-Kind revenue account</label>
              <select class="organizational-select" id="gift-ik-revenue-account"><option value="">Loading…</option></select>
            </div>
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">In-kind expense account (non-cash)</label>
              <select class="organizational-select" id="gift-ik-expense-account"><option value="">Loading…</option></select>
            </div>
          </div>
          <div style="margin-top:6px;">
            <label class="organizational-label" style="font-size:var(--text-xs);">Fair value notes</label>
            <textarea class="organizational-textarea" id="gift-ik-notes" rows="2" placeholder="optional"></textarea>
          </div>
        </div>
        <div id="gift-pledge-fields" hidden style="border:1px solid var(--border);border-radius:var(--radius-md);padding:8px;margin-bottom:8px;background:var(--surface-1);">
          <p style="font-size:var(--text-xs);font-weight:600;margin:0 0 6px;">Pledge details (required for posting to the ledger)</p>
          <div style="margin-bottom:8px;">
            <label class="organizational-label" style="font-size:var(--text-xs);">How firm is this pledge?</label>
            <select class="organizational-select" id="gift-pl-status">
              <option value="unconditional">Unconditional: a clear, documented promise (Accounting accepts it, then it is booked)</option>
              <option value="conditional">Conditional: counts only when a condition is met</option>
              <option value="intention">Intention: a hope to give, not binding</option>
            </select>
            <p class="organizational-hint" style="margin:4px 0 0;">Conditional and intention pledges stay here in Funding and are not in the books until they become unconditional.</p>
            <textarea class="organizational-textarea" id="gift-pl-condition" rows="2" placeholder="What has to happen first (a match raised, a milestone met)" hidden style="margin-top:6px;"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Total pledged ($)</label>
              <input type="number" class="organizational-input" id="gift-pl-total" min="0" step="0.01" placeholder="0.00">
            </div>
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Pledge receivable account</label>
              <select class="organizational-select" id="gift-pl-receivable-account"><option value="">Loading…</option></select>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;margin-top:6px;">
            <input type="checkbox" id="gift-pl-multiyear"> Multi-year pledge (needs discounting to present value)
          </label>
          <p id="gift-pl-multiyear-hint" class="organizational-hint" style="margin:4px 0 0;" hidden>Accounting sets the discount rate and term when it posts this pledge. You can propose them here; both are optional.</p>
          <div id="gift-pl-multiyear-fields" hidden style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Proposed discount rate (%)</label>
              <input type="number" class="organizational-input" id="gift-pl-rate" min="0" max="50" step="0.1" placeholder="e.g. 3.0">
            </div>
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Proposed term (years)</label>
              <input type="number" class="organizational-input" id="gift-pl-years" min="1" step="1" placeholder="e.g. 3">
            </div>
          </div>
          <p id="gift-pl-pv-preview" style="font-size:var(--text-xs);color:var(--text-secondary);margin:6px 0 0;"></p>
        </div>
        <div style="margin-bottom:8px;">
          <label class="organizational-label" style="font-size:var(--text-xs);">Notes</label>
          <textarea class="organizational-textarea" id="gift-notes" rows="2" placeholder="optional"></textarea>
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;">
            <input type="checkbox" id="gift-ack"> Send acknowledgment email
          </label>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="organizational-btn organizational-btn-sm" id="gift-submit">Log gift</button>
          <span id="gift-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
        </div>
      </div>
    `;

    section.querySelectorAll('.organizational-notgift-gift').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = window.prompt('Why is this not a gift? (a refund, a transfer, a reimbursement). Accounting will see this note and decide.');
        if (!reason || reason.trim().length < 3) return;
        try {
          await apiFetch(`/gifts/${Number(btn.dataset.id)}/not-a-gift`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
          await loadGiftHistory(constituentId);
        } catch (err) {
          showPanelError(err.message);
        }
      });
    });

    section.querySelectorAll('.organizational-delete-gift').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this gift record?')) return;
        const id = Number(btn.dataset.id);
        try {
          await apiFetch(`/gifts/${id}`, { method: 'DELETE' });
          await loadGiftHistory(constituentId);
        } catch (err) {
          showPanelError(err.message);
        }
      });
    });

    section.querySelectorAll('.organizational-edit-gift').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const gift = gifts.find(g => g.id === id);
        if (!gift) return;
        const editEl = section.querySelector(`#gift-edit-${id}`);
        if (!editEl) return;
        if (!editEl.hidden) { editEl.hidden = true; return; }
        editEl.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div><label class="organizational-label" style="font-size:var(--text-xs);">Amount ($)</label>
              <input type="number" class="organizational-input gift-edit-amount" min="0" step="0.01" value="${gift.amount_dollars.toFixed(2)}"></div>
            <div><label class="organizational-label" style="font-size:var(--text-xs);">Date</label>
              <input type="date" class="organizational-input gift-edit-date" value="${gift.received_at ? gift.received_at.slice(0,10) : ''}"></div>
            <div><label class="organizational-label" style="font-size:var(--text-xs);">Campaign</label>
              <input type="text" class="organizational-input gift-edit-campaign" value="${esc(gift.campaign || '')}"></div>
            <div><label class="organizational-label" style="font-size:var(--text-xs);">Payment method</label>
              <select class="organizational-select gift-edit-method">
                <option value="">—</option>
                ${PAYMENT_METHODS.map(m => `<option value="${m}"${gift.payment_method === m ? ' selected' : ''}>${m}</option>`).join('')}
              </select></div>
          </div>
          <div style="margin-bottom:8px;"><label class="organizational-label" style="font-size:var(--text-xs);">Notes</label>
            <textarea class="organizational-textarea gift-edit-notes" rows="2">${esc(gift.notes || '')}</textarea></div>
          ${gift.gift_type === 'pledge' ? (gift.posting_status === 'posted' || gift.posting_status === 'void'
            ? `<p class="organizational-hint" style="margin:0 0 8px;">This pledge is ${gift.posting_status === 'posted' ? 'booked' : 'void'}. Accounting voids the posting first to change its status.</p>`
            : `<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px;">
                <label class="organizational-label" style="font-size:var(--text-xs);">How firm is this pledge?</label>
                <select class="organizational-select gift-edit-pstatus">
                  <option value="unconditional"${gift.pledge_status === 'unconditional' ? ' selected' : ''}>Unconditional (clear, documented promise)</option>
                  <option value="conditional"${gift.pledge_status === 'conditional' ? ' selected' : ''}>Conditional</option>
                  <option value="intention"${gift.pledge_status === 'intention' ? ' selected' : ''}>Intention</option>
                </select>
                <textarea class="organizational-textarea gift-edit-pcondition" rows="2" placeholder="The condition that has to be met" style="margin-top:6px;"${gift.pledge_status === 'conditional' ? '' : ' hidden'}>${esc(gift.pledge_condition || '')}</textarea>
                <input type="text" class="organizational-input gift-edit-pnote" placeholder="Why the status is changing (the donor confirmed in writing, the condition was met)" style="margin-top:6px;" hidden>
                <p class="organizational-hint" style="margin:4px 0 0;">Marking a pledge unconditional makes it available to Accounting. Nothing is posted until Accounting accepts it.</p>
              </div>`) : ''}
          <div style="display:flex;gap:8px;">
            <button class="organizational-btn organizational-btn-sm gift-edit-save">Save</button>
            <button class="organizational-btn organizational-btn-sm organizational-btn-outline gift-edit-cancel">Cancel</button>
            <span class="gift-edit-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
          </div>`;
        editEl.hidden = false;
        editEl.querySelector('.gift-edit-cancel').addEventListener('click', () => { editEl.hidden = true; });
        const pStatusEl = editEl.querySelector('.gift-edit-pstatus');
        if (pStatusEl) pStatusEl.addEventListener('change', () => {
          editEl.querySelector('.gift-edit-pcondition').hidden = pStatusEl.value !== 'conditional';
          editEl.querySelector('.gift-edit-pnote').hidden = pStatusEl.value === gift.pledge_status;
        });
        editEl.querySelector('.gift-edit-save').addEventListener('click', async () => {
          const dollars = parseFloat(editEl.querySelector('.gift-edit-amount').value);
          if (isNaN(dollars) || dollars < 0) return;
          const statusEl = editEl.querySelector('.gift-edit-status');
          try {
            await apiFetch(`/gifts/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                amount: dollars,
                received_at: editEl.querySelector('.gift-edit-date').value || undefined,
                campaign: editEl.querySelector('.gift-edit-campaign').value.trim() || null,
                payment_method: editEl.querySelector('.gift-edit-method').value || null,
                notes: editEl.querySelector('.gift-edit-notes').value.trim() || null,
                ...(pStatusEl ? {
                  pledge_status: pStatusEl.value,
                  pledge_condition: pStatusEl.value === 'conditional' ? (editEl.querySelector('.gift-edit-pcondition').value.trim() || null) : null,
                  pledge_status_note: editEl.querySelector('.gift-edit-pnote').value.trim() || undefined,
                } : {}),
              }),
            });
            if (statusEl) { statusEl.textContent = 'Saved'; }
            await loadGiftHistory(constituentId);
          } catch (err) {
            showPanelError(err.message);
          }
        });
      });
    });

    const typeEl = section.querySelector('#gift-type');
    const grantWrap = section.querySelector('#gift-grant-wrap');
    const grantSelect = section.querySelector('#gift-grant-id');
    let grantsLoaded = false;

    async function maybeLoadGrants() {
      if (typeEl.value !== 'grant' || grantsLoaded) return;
      grantsLoaded = true;
      try {
        const linked = await apiFetch(`/constituents/${constituentId}/grants`);
        grantSelect.innerHTML = `<option value="">— none —</option>` +
          linked.map(g => `<option value="${g.id}">${esc(g.name || 'Untitled')}</option>`).join('');
      } catch (_) {
        grantSelect.innerHTML = `<option value="">Could not load grants</option>`;
      }
    }

    const methodEl = section.querySelector('#gift-method');
    const programWrap = section.querySelector('#gift-program-wrap');
    const programSelect = section.querySelector('#gift-program-id');
    const inKindFields = section.querySelector('#gift-inkind-fields');
    const pledgeFields = section.querySelector('#gift-pledge-fields');
    const plStatusEl = section.querySelector('#gift-pl-status');
    const plConditionEl = section.querySelector('#gift-pl-condition');
    const ikRevenueSelect = section.querySelector('#gift-ik-revenue-account');
    const ikExpenseSelect = section.querySelector('#gift-ik-expense-account');
    const plReceivableSelect = section.querySelector('#gift-pl-receivable-account');
    let programsLoaded = false;
    let accountsLoaded = false;
    let defaultReceivableId = null;
    let plTotalTouched = false;
    const plTotalEl = section.querySelector('#gift-pl-total');
    const giftAmountEl = section.querySelector('#gift-amount');

    function syncPledgeFields() {
      if (plConditionEl) plConditionEl.hidden = !plStatusEl || plStatusEl.value !== 'conditional';
      if (plReceivableSelect) {
        const intention = plStatusEl && plStatusEl.value === 'intention';
        plReceivableSelect.disabled = intention;
        if (!intention && !plReceivableSelect.value && defaultReceivableId && plReceivableSelect.querySelector('option[value="' + defaultReceivableId + '"]')) {
          plReceivableSelect.value = String(defaultReceivableId);
        }
      }
    }
    function syncPledgeTotal() {
      if (plTotalEl && !plTotalTouched && typeEl && typeEl.value === 'pledge' && giftAmountEl && giftAmountEl.value) plTotalEl.value = giftAmountEl.value;
    }
    if (plStatusEl) plStatusEl.addEventListener('change', syncPledgeFields);
    if (plTotalEl) plTotalEl.addEventListener('input', () => { plTotalTouched = true; });
    if (giftAmountEl) giftAmountEl.addEventListener('input', syncPledgeTotal);

    async function maybeLoadProgramsAndAccounts() {
      if (!programsLoaded) {
        programsLoaded = true;
        try {
          const r = await apiFetch('/programs');
          const list = Array.isArray(r.programs) ? r.programs : (Array.isArray(r) ? r : []);
          programSelect.innerHTML = `<option value="">— select —</option>` +
            list.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        } catch (_) {
          programSelect.innerHTML = `<option value="">Could not load programs</option>`;
        }
      }
      if (!accountsLoaded) {
        accountsLoaded = true;
        try {
          const r = await apiFetch('/accounts');
          defaultReceivableId = r.defaults && r.defaults.pledge_receivable_account_id || null;
          const list = (Array.isArray(r.accounts) ? r.accounts : (Array.isArray(r) ? r : [])).filter(a => a.is_posting);
          const opt = (a) => `<option value="${a.id}">${esc(a.code ? a.code + ' — ' + a.name : a.name)}</option>`;
          const income = list.filter(a => a.type === 'income' && !a.is_system_contribution_revenue_account);
          const nonCashExpense = list.filter(a => a.type === 'expense' && a.is_non_cash);
          const asset = list.filter(a => a.type === 'asset');
          ikRevenueSelect.innerHTML = `<option value="">— select —</option>` + income.map(opt).join('');
          ikExpenseSelect.innerHTML = `<option value="">— select —</option>` + nonCashExpense.map(opt).join('');
          plReceivableSelect.innerHTML = `<option value="">— select —</option>` + asset.map(opt).join('');
          syncPledgeFields();
          if (!nonCashExpense.length) {
            ikExpenseSelect.innerHTML = `<option value="">No non-cash expense account set up yet — flag one in Accounting → Chart of Accounts</option>`;
          }
        } catch (_) {
          ikRevenueSelect.innerHTML = ikExpenseSelect.innerHTML = plReceivableSelect.innerHTML = `<option value="">Could not load accounts</option>`;
        }
      }
    }

    function updateFieldVisibility() {
      const isInKind = methodEl && methodEl.value === 'in_kind';
      const isPledge = typeEl && typeEl.value === 'pledge';
      if (inKindFields) inKindFields.hidden = !isInKind;
      if (pledgeFields) pledgeFields.hidden = !isPledge;
      if (programWrap) programWrap.hidden = !(isInKind || isPledge);
      if (isInKind || isPledge) maybeLoadProgramsAndAccounts();
      if (isPledge) { syncPledgeTotal(); syncPledgeFields(); }
    }

    if (typeEl) {
      typeEl.addEventListener('change', async () => {
        const isGrant = typeEl.value === 'grant';
        if (grantWrap) grantWrap.hidden = !isGrant;
        if (isGrant) await maybeLoadGrants();
        updateFieldVisibility();
      });
    }
    if (methodEl) methodEl.addEventListener('change', updateFieldVisibility);

    const multiyearCb = section.querySelector('#gift-pl-multiyear');
    const multiyearFields = section.querySelector('#gift-pl-multiyear-fields');
    const pvPreview = section.querySelector('#gift-pl-pv-preview');
    function updatePvPreview() {
      if (!pvPreview) return;
      const total = parseFloat(section.querySelector('#gift-pl-total').value);
      if (!multiyearCb.checked || isNaN(total) || total <= 0) { pvPreview.textContent = ''; return; }
      const ratePct = parseFloat(section.querySelector('#gift-pl-rate').value);
      const years = parseFloat(section.querySelector('#gift-pl-years').value);
      if (isNaN(ratePct) || isNaN(years) || years <= 0) { pvPreview.textContent = ''; return; }
      const pv = total / Math.pow(1 + ratePct / 100, years);
      pvPreview.textContent = `Proposed present value ≈ $${pv.toFixed(2)} (discount ≈ $${(total - pv).toFixed(2)}); Accounting confirms it when posting`;
    }
    if (multiyearCb) {
      multiyearCb.addEventListener('change', () => {
        if (multiyearFields) multiyearFields.hidden = !multiyearCb.checked;
        const hint = section.querySelector('#gift-pl-multiyear-hint');
        if (hint) hint.hidden = !multiyearCb.checked;
        updatePvPreview();
      });
    }
    ['gift-pl-total', 'gift-pl-rate', 'gift-pl-years'].forEach((id) => {
      const el = section.querySelector('#' + id);
      if (el) el.addEventListener('input', updatePvPreview);
    });

    const spWrap = section.querySelector('#gift-sponsored-project-wrap');
    const spSelect = section.querySelector('#gift-sponsored-project-id');
    if (spWrap && spSelect) {
      (async () => {
        try {
          const projects = await apiFetch('/sponsored-projects');
          const list = Array.isArray(projects.sponsored_projects) ? projects.sponsored_projects : [];
          if (list.length) {
            spSelect.innerHTML = `<option value="">— none —</option>` +
              list.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
            spWrap.hidden = false;
          }
        } catch (_) {
        }
      })();
    }

    const submitBtn = section.querySelector('#gift-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const amountEl  = section.querySelector('#gift-amount');
        const dateEl    = section.querySelector('#gift-date');
        const methodEl  = section.querySelector('#gift-method');
        const campaignEl= section.querySelector('#gift-campaign');
        const notesEl   = section.querySelector('#gift-notes');
        const ackEl     = section.querySelector('#gift-ack');
        const statusEl  = section.querySelector('#gift-status');

        const isInKind = methodEl && methodEl.value === 'in_kind';
        const isPledge = typeEl && typeEl.value === 'pledge';
        const dollars = isPledge ? 0 : parseFloat(amountEl.value);
        if (!isPledge && (isNaN(dollars) || dollars < 0)) { amountEl.focus(); return; }

        const payload = {
          constituent_id: constituentId,
          gift_type:       typeEl ? typeEl.value : 'donation',
          amount:          isPledge ? undefined : dollars,
          received_at:     dateEl.value || undefined,
          payment_method:  methodEl.value || null,
          campaign:        campaignEl.value.trim() || null,
          grant_id:        grantSelect && typeEl.value === 'grant' ? (Number(grantSelect.value) || null) : null,
          sponsored_project_id: spSelect && spSelect.value ? Number(spSelect.value) : null,
          notes:           notesEl.value.trim() || null,
          send_acknowledgment: !!(ackEl && ackEl.checked),
        };
        if (isInKind || isPledge) {
          payload.program_id = programSelect && programSelect.value ? Number(programSelect.value) : null;
        }
        if (isInKind) {
          payload.in_kind_description = section.querySelector('#gift-ik-description').value.trim();
          payload.in_kind_valuation_method = section.querySelector('#gift-ik-valuation').value;
          payload.in_kind_fair_value_notes = section.querySelector('#gift-ik-notes').value.trim() || null;
          payload.in_kind_revenue_account_id = ikRevenueSelect.value ? Number(ikRevenueSelect.value) : null;
          payload.in_kind_expense_account_id = ikExpenseSelect.value ? Number(ikExpenseSelect.value) : null;
        }
        if (isPledge) {
          payload.total_pledged = parseFloat(section.querySelector('#gift-pl-total').value);
          payload.pledge_status = section.querySelector('#gift-pl-status').value;
          payload.pledge_condition = payload.pledge_status === 'conditional' ? (section.querySelector('#gift-pl-condition').value.trim() || null) : null;
          payload.receivable_account_id = payload.pledge_status !== 'intention' && plReceivableSelect.value ? Number(plReceivableSelect.value) : null;
          payload.is_multi_year_pledge = !!(multiyearCb && multiyearCb.checked);
          if (payload.is_multi_year_pledge) {
            const rateVal = parseFloat(section.querySelector('#gift-pl-rate').value);
            const yearsVal = parseFloat(section.querySelector('#gift-pl-years').value);
            if (!isNaN(rateVal) && !isNaN(yearsVal)) {
              payload.discount_rate_bps = Math.round(rateVal * 100);
              payload.pledge_years = yearsVal;
            }
          }
        }

        try {
          submitBtn.disabled = true;
          await apiFetch('/gifts', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          amountEl.value = '';
          campaignEl.value = '';
          notesEl.value = '';
          if (ackEl) ackEl.checked = false;
          if (isInKind) {
            section.querySelector('#gift-ik-description').value = '';
            section.querySelector('#gift-ik-valuation').value = '';
            section.querySelector('#gift-ik-notes').value = '';
          }
          if (isPledge) {
            section.querySelector('#gift-pl-total').value = '';
            plTotalTouched = false;
            if (multiyearCb) multiyearCb.checked = false;
            if (multiyearFields) multiyearFields.hidden = true;
            if (pvPreview) pvPreview.textContent = '';
          }
          if (statusEl) { statusEl.textContent = 'Gift logged'; setTimeout(() => { statusEl.textContent = ''; }, 2500); }
          await loadGiftHistory(constituentId);
        } catch (err) {
          showPanelError(err.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
    }
  }

  function openNewFunderPanel() {
    panelTitle.textContent = 'New donor';
    showPanelError('');
    panelBody.innerHTML = `<form id="new-funder-form">
      <div class="organizational-field-row" style="margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <div>
          <label class="organizational-label" for="nf-kind">Type</label>
          <select class="organizational-input" id="nf-kind"><option value="individual">Individual</option><option value="organization">Organization</option></select>
        </div>
        <div id="nf-org-type-wrap" hidden>
          <label class="organizational-label" for="nf-org-type">Kind of organization</label>
          <select class="organizational-input" id="nf-org-type"><option value="">—</option>${Object.keys(ORG_TYPE_LABELS).map(k => `<option value="${k}">${ORG_TYPE_LABELS[k]}</option>`).join('')}</select>
        </div>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-name">Name <span style="color:var(--organizational-error)">*</span></label>
        <input class="organizational-input" id="nf-name" name="display_name" required>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-website">Website</label>
        <input class="organizational-input" id="nf-website" name="website" type="url">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-email">Email</label>
        <input class="organizational-input" id="nf-email" name="email" type="email">
      </div>
      <div class="organizational-panel-field-row">
        <label class="organizational-label" for="nf-more-emails">Other emails</label>
        <input class="organizational-input" id="nf-more-emails" name="additional_emails" placeholder="Separate with commas">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label">Other roles</label>
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="nf-role-board-member"> Board member
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="nf-role-vendor"> Vendor <span style="color:var(--text-secondary);">(can be billed via Purchases)</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="nf-role-customer"> Customer <span style="color:var(--text-secondary);">(can be invoiced via Sales)</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="organizational-btn organizational-btn-sm">Create donor</button>
        <span id="nf-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
      </div>
    </form>`;
    showPage();

    const form = panelBody.querySelector('#new-funder-form');
    const nfKind = form && form.querySelector('#nf-kind');
    if (nfKind && funderOnly) { nfKind.value = 'organization'; nfKind.disabled = true; }
    nfKind && nfKind.addEventListener('change', () => {
      const isOrg = nfKind.value === 'organization';
      form.querySelector('#nf-org-type-wrap').hidden = !isOrg;
      form.querySelector('#nf-role-board-member').closest('label').hidden = isOrg;
    });
    if (nfKind && funderOnly) nfKind.dispatchEvent(new Event('change'));
    form && form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {};
      for (const [k, v] of fd.entries()) if (v) body[k] = v;
      body.kind = nfKind.value;
      delete body.org_type;
      if (body.kind === 'organization' && form.querySelector('#nf-org-type').value) body.org_type = form.querySelector('#nf-org-type').value;
      body.roles = ['donor'];
      if (body.kind === 'individual' && form.querySelector('#nf-role-board-member').checked) body.roles.push('board_member');
      if (form.querySelector('#nf-role-vendor').checked) body.roles.push('vendor');
      if (form.querySelector('#nf-role-customer').checked) body.roles.push('customer');
      const dupKey = String(body.display_name || '').trim().toLowerCase() + '|' + String(body.email || '').trim().toLowerCase();
      if (form.dataset.dupAcked !== dupKey) {
        const nm = String(body.display_name || '').trim().toLowerCase();
        const em = String(body.email || '').trim().toLowerCase();
        const hasEmail = c => em && [c.email].concat(c.additional_emails || []).some(x => String(x || '').toLowerCase() === em);
        const same = fundersCache.filter(c => hasEmail(c) || (nm && String(c.display_name || '').trim().toLowerCase() === nm));
        if (same.length) {
          form.dataset.dupAcked = dupKey;
          const byEmail = same.some(hasEmail);
          showPanelError((byEmail ? 'A donor with this email already exists: ' : 'A donor with this name already exists: ') + same[0].display_name +
            (same[0].email ? ' (' + same[0].email + ')' : '') + '. Choose Create donor again to add a separate record.');
          return;
        }
      }
      try {
        const created = await apiFetch('/constituents', { method: 'POST', body: JSON.stringify(body) });
        fundersCache.unshift(created);
        renderFunderList();
        openPanel(created);
      } catch (err) {
        showPanelError(err.message);
      }
    });
  }

  const statusSelect = document.getElementById('organizational-donors-status');
  if (statusSelect) {
    statusSelect.addEventListener('change', () => {
      activeTypeFilter = statusSelect.value || 'all';
      renderFunderList();
    });
  }

  const kindSelect = document.getElementById('organizational-donors-kind');
  if (kindSelect) {
    kindSelect.addEventListener('change', () => {
      activeKind = kindSelect.value || 'all';
      renderFunderList();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeSearch = searchInput.value.trim();
      renderFunderList();
    });
  }

  const tagFilterInput = document.getElementById('organizational-tag-filter');
  const tagDatalist = document.getElementById('organizational-tag-datalist');
  if (tagFilterInput) {
    tagFilterInput.addEventListener('input', () => {
      activeTagFilter = tagFilterInput.value.trim();
      renderFunderList();
    });
  }

  if (addBtn) addBtn.addEventListener('click', () => { window.OrganizationalFunders.switchTab('donors'); openNewFunderPanel(); });

  async function init(slug) {
    currentSlug = slug;

    try {
      const org = window.OrganizationalFunders && typeof window.OrganizationalFunders.getOrg === 'function'
        ? window.OrganizationalFunders.getOrg() : null;
      orgHasXero = !!(org && org.xero_tenant_id);
      const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
      funderOnly = !!(access && access.can_read_contacts === false && access.can_read_funders);
      if (funderOnly) {
        activeKind = 'organization';
        const ks = document.getElementById('organizational-donors-kind');
        if (ks) { ks.value = 'organization'; ks.hidden = true; }
      }

      const fundersRes = await fetch(`/api/organizational/orgs/${slug}/constituents`).then(r => r.json()).catch(() => []);

      fundersCache = Array.isArray(fundersRes) ? fundersRes : [];
      renderFunderList();
      loadPromisedSummary();
      loadToConfirm();

      if (tagDatalist) {
        fetch(`/api/organizational/orgs/${slug}/constituents/tags`)
          .then(r => r.json())
          .then(tags => {
            if (Array.isArray(tags)) {
              tagDatalist.innerHTML = tags.map(t => `<option value="${esc(t)}">`).join('');
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      showPanelError('Could not load funders: ' + err.message);
    }
  }

  window.OrganizationalFunders = window.OrganizationalFunders || {};
  window.OrganizationalFunders.donors = {
    init: init,
    open: function (id) { const c = fundersCache.find(x => Number(x.id) === Number(id)); if (c) openPanel(c); },
    close: closePanel,
  };
})();
