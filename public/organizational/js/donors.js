(function () {
  'use strict';

  // ── DOM refs ──
  const donorsTbody     = document.getElementById('organizational-donors-tbody');
  const addBtn          = document.getElementById('organizational-funder-add');
  const searchInput     = document.getElementById('organizational-donors-search');
  const panel           = document.getElementById('organizational-donor-panel');
  const panelOverlay    = document.getElementById('organizational-donors-panel-overlay');
  const panelTitle      = document.getElementById('organizational-donors-panel-title');
  const panelBody       = document.getElementById('organizational-donors-panel-body');
  const panelClose      = document.getElementById('organizational-donors-panel-close');
  const panelErrEl      = document.getElementById('organizational-donors-panel-error');

  // ── State ──
  let currentSlug      = '';
  let fundersCache     = [];
  let activeTypeFilter = 'all';
  let activeSearch     = '';
  let activeTagFilter  = '';    // comma-separated tag value from the tag filter input
  let panelConstituent = null;
  let orgHasXero       = false;

  // ── Utilities ──
  function showPanelError(msg) {
    if (!panelErrEl) return;
    panelErrEl.textContent = msg || '';
    panelErrEl.hidden = !msg;
  }

  function fmt(cents) { return window.formatMoneyCents ? window.formatMoneyCents(cents) : `$${(cents / 100).toFixed(2)}`; }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  function typeBadge(type) {
    const labels = { foundation: 'Foundation', individual: 'Individual', board: 'Board', prospect: 'Prospect', member_org: 'Member org' };
    const label = labels[type] || type || 'Unknown';
    return `<span class="organizational-badge">${esc(label)}</span>`;
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

  // ── Panel open/close ──
  function openPanel(constituent) {
    panelConstituent = constituent;
    panelTitle.textContent = constituent.display_name;
    showPanelError('');
    renderFunderDetail(constituent);
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');
  }

  function closePanel() {
    panel.classList.remove('organizational-panel-is-open');
    panelOverlay.classList.remove('organizational-panel-is-open');
    panelConstituent = null;
  }

  panelClose && panelClose.addEventListener('click', closePanel);
  panelOverlay && panelOverlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && panel.classList.contains('organizational-panel-is-open')) closePanel();
  });

  // ── Funder list ──
  function updateExportLink() {
    const link = document.getElementById('organizational-export-csv-link');
    if (!link || !currentSlug) return;
    const params = new URLSearchParams();
    if (activeTypeFilter && activeTypeFilter !== 'all') params.set('type', activeTypeFilter);
    if (activeTagFilter) params.set('tags', activeTagFilter);
    const qs = params.toString();
    link.href = `/api/organizational/orgs/${encodeURIComponent(currentSlug)}/constituents/export.csv${qs ? '?' + qs : ''}`;
  }

  // Donors tab shows people-type constituents only.
  // Foundations appear in the Grants tab; member_org dues are not gifts.
  const DONOR_TYPES = new Set(['individual', 'board', 'prospect']);

  function renderFunderList() {
    if (!donorsTbody) return;
    updateExportLink();
    let list = fundersCache.filter(c => DONOR_TYPES.has(c.type));
    if (activeTypeFilter !== 'all') {
      list = list.filter(c => c.type === activeTypeFilter);
    }
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      list = list.filter(c => (c.display_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q));
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
    if (!list.length) {
      donorsTbody.innerHTML = `<tr class="organizational-table-empty"><td colspan="5">No donors match this filter.</td></tr>`;
      return;
    }
    donorsTbody.innerHTML = list.map(c => {
      const name = esc(c.display_name);
      const totalGiven = c.lifetime_giving_cents ? fmt(c.lifetime_giving_cents) : '—';
      const lastGift = c.last_gift_date ? fmtDate(c.last_gift_date) : '—';
      return `<tr data-constituent-id="${c.id}">
        <td><strong>${name}</strong></td>
        <td>${typeBadge(c.type)}</td>
        <td>${totalGiven}</td>
        <td>${lastGift}</td>
        <td><button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-open-funder" data-id="${c.id}">Open</button></td>
      </tr>`;
    }).join('');

    donorsTbody.querySelectorAll('.organizational-open-funder').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const c = fundersCache.find(x => x.id === id);
        if (c) openPanel(c);
      });
    });
  }

  // ── Donor detail panel ──
  function renderFunderDetail(constituent) {
    showPanelError('');
    panelBody.innerHTML = `
      <div id="funder-contact-section">
        ${renderContactForm(constituent)}
      </div>
      <hr style="margin:20px 0;border:none;border-top:1px solid var(--border);">
      <h4 style="font-size:var(--text-sm);font-weight:600;margin:0 0 10px;">Gift history</h4>
      <div id="funder-gifts-section"><em style="color:var(--text-secondary);font-size:var(--text-sm);">Loading…</em></div>
      <hr style="margin:20px 0;border:none;border-top:1px solid var(--border);">
      <h4 style="font-size:var(--text-sm);font-weight:600;margin:0 0 10px;">Relationship history</h4>
      <div id="funder-interactions-section"><em style="color:var(--text-secondary);font-size:var(--text-sm);">Loading…</em></div>
      <hr style="margin:28px 0 16px;border:none;border-top:1px solid var(--border);">
      <div style="display:flex;gap:8px;">
        <button class="organizational-btn organizational-btn-sm organizational-btn-outline" id="donor-archive-btn">Archive donor</button>
        <button class="organizational-btn organizational-btn-sm organizational-btn-outline" id="donor-delete-btn" style="color:var(--organizational-error,#c0392b);border-color:var(--organizational-error,#c0392b);">Delete</button>
      </div>
      <p style="margin:6px 0 0;font-size:var(--text-xs);color:var(--text-secondary);">Archive hides the donor from all lists but keeps their history. Delete is permanent and only allowed for donors with no history.</p>
    `;
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

  function renderTagChips(tags) {
    const list = Array.isArray(tags) ? tags : [];
    return list.map(t =>
      `<span class="organizational-badge" style="cursor:pointer;user-select:none;" data-tag="${esc(t)}">${esc(t)} <span style="margin-left:4px;opacity:0.6;">✕</span></span>`
    ).join(' ');
  }

  function renderContactForm(c) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    return `<form id="funder-contact-form" data-id="${c.id}">
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-name">Name</label>
        <input class="organizational-input" id="fc-name" name="display_name" value="${esc(c.display_name)}" required>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-type">Type</label>
        <select class="organizational-select" id="fc-type" name="type">
          ${['individual','board','prospect'].map(t =>
            `<option value="${t}"${c.type === t ? ' selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-website">Website</label>
        <input class="organizational-input" id="fc-website" name="website" type="url" value="${esc(c.website || '')}">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-email">Email</label>
        <input class="organizational-input" id="fc-email" name="email" type="email" value="${esc(c.email || '')}">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-phone">Phone</label>
        <input class="organizational-input" id="fc-phone" name="phone" value="${esc(c.phone || '')}">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="fc-notes">Notes</label>
        <textarea class="organizational-textarea" id="fc-notes" name="notes" rows="3">${esc(c.notes || '')}</textarea>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label">Accounting roles</label>
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="fc-is-vendor" ${c.is_vendor ? 'checked' : ''}> Vendor <span style="color:var(--text-secondary);">(can be billed via Purchases)</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="fc-is-customer" ${c.is_customer ? 'checked' : ''}> Customer <span style="color:var(--text-secondary);">(can be invoiced via Sales)</span>
        </label>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label">Tags</label>
        <div id="fc-tag-chips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:24px;margin-bottom:4px;">${renderTagChips(tags)}</div>
        <div style="display:flex;gap:6px;align-items:center;position:relative;">
          <input type="text" class="organizational-input" id="fc-tag-input" placeholder="Add tag, press Enter" style="flex:1;font-size:var(--text-sm);">
          <div id="fc-tag-suggest" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);z-index:100;max-height:160px;overflow-y:auto;box-shadow:var(--shadow-md);"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button type="submit" class="organizational-btn organizational-btn-sm">Save changes</button>
        <span id="fc-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
      </div>
    </form>`;
  }

  // Current tag state for the open panel form (mutable array)
  let formTags = [];

  function wireContactForm(constituent) {
    const form = panelBody.querySelector('#funder-contact-form');
    if (!form) return;

    // Initialize tags from constituent
    formTags = Array.isArray(constituent.tags) ? constituent.tags.slice() : [];

    function refreshChips() {
      const chipsEl = form.querySelector('#fc-tag-chips');
      if (chipsEl) chipsEl.innerHTML = renderTagChips(formTags);
      // Re-wire chip remove clicks
      (form.querySelectorAll('#fc-tag-chips [data-tag]') || []).forEach(chip => {
        chip.addEventListener('click', () => {
          const tag = chip.dataset.tag;
          formTags = formTags.filter(t => t !== tag);
          refreshChips();
        });
      });
    }
    refreshChips();

    // Tag input: autocomplete + Enter-to-add
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
      // Checkboxes are absent from FormData when unchecked, so read them explicitly rather
      // than relying on form-field iteration -- otherwise unchecking one would never persist.
      body.is_vendor = form.querySelector('#fc-is-vendor').checked;
      body.is_customer = form.querySelector('#fc-is-customer').checked;
      try {
        const updated = await apiFetch(`/constituents/${constituent.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        // Update cache
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

  // ── Interaction log ──
  async function loadInteractions(constituentId) {
    const section = panelBody && panelBody.querySelector('#funder-interactions-section');
    if (!section) return;
    try {
      const interactions = await apiFetch(`/constituents/${constituentId}/interactions`);
      renderInteractionLog(section, constituentId, interactions);
    } catch (err) {
      section.innerHTML = `<p style="color:var(--organizational-error);font-size:var(--text-sm);">Could not load interactions: ${esc(err.message)}</p>`;
    }
  }

  function renderInteractionLog(section, constituentId, interactions) {
    const TYPES = { meeting: 'Meeting', call: 'Call', email: 'Email', note: 'Note', site_visit: 'Site visit' };
    const logHtml = interactions.length
      ? interactions.map(i => `
          <div class="organizational-interaction-row" style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);" data-interaction-id="${i.id}">
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
      : `<p style="color:var(--text-secondary);font-size:var(--text-sm);margin:0;">No interactions logged yet.</p>`;

    section.innerHTML = `
      <div id="interaction-log-list">${logHtml}</div>
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

  // ── Gift history ──
  async function loadGiftHistory(constituentId) {
    const section = panelBody && panelBody.querySelector('#funder-gifts-section');
    if (!section) return;
    try {
      const gifts = await apiFetch(`/constituents/${constituentId}/gifts`);
      renderGiftHistory(section, constituentId, gifts);
    } catch (err) {
      section.innerHTML = `<p style="color:var(--organizational-error);font-size:var(--text-sm);">Could not load gifts: ${esc(err.message)}</p>`;
    }
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
          const receiptLink = `<a class="organizational-link" href="/api/organizational/orgs/${esc(currentSlug)}/reports/gifts/${g.id}/receipt" download style="font-size:var(--text-xs);">Receipt</a>`;
          return `<div class="organizational-gift-row" data-gift-id="${g.id}" style="border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="organizational-badge">${esc(typeLabel)}</span>
              <span style="font-size:var(--text-sm);color:var(--text-secondary);">${fmtDate(g.received_at)}</span>
              <strong style="font-size:var(--text-sm);">${fmt(g.amount_cents)}</strong>
              ${methodStr}
              ${campaignStr}
              ${ackStatus}
              ${receiptStatus}
              <div style="margin-left:auto;display:flex;gap:4px;align-items:center;">
                ${receiptLink}
                <button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-edit-gift" data-id="${g.id}" style="padding:2px 6px;font-size:var(--text-xs);">Edit</button>
                <button class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-delete-gift" data-id="${g.id}" style="padding:2px 6px;font-size:var(--text-xs);">✕</button>
              </div>
            </div>
            <div class="organizational-gift-edit-form" id="gift-edit-${g.id}" hidden style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);"></div>
          </div>`;
        }).join('')
      : `<p style="color:var(--text-secondary);font-size:var(--text-sm);margin:0;">No gifts recorded yet.</p>`;

    section.innerHTML = `
      <div id="gift-history-list">${listHtml}</div>
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
            <input type="checkbox" id="gift-pl-multiyear"> Multi-year pledge (discount to present value)
          </label>
          <div id="gift-pl-multiyear-fields" hidden style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Discount rate (%)</label>
              <input type="number" class="organizational-input" id="gift-pl-rate" min="0" max="50" step="0.1" placeholder="e.g. 3.0">
            </div>
            <div>
              <label class="organizational-label" style="font-size:var(--text-xs);">Pledge term (years)</label>
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

    // Wire delete buttons
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

    // Wire edit buttons — show inline edit form
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
          <div style="display:flex;gap:8px;">
            <button class="organizational-btn organizational-btn-sm gift-edit-save">Save</button>
            <button class="organizational-btn organizational-btn-sm organizational-btn-outline gift-edit-cancel">Cancel</button>
            <span class="gift-edit-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
          </div>`;
        editEl.hidden = false;
        editEl.querySelector('.gift-edit-cancel').addEventListener('click', () => { editEl.hidden = true; });
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

    // Wire grant-id dropdown visibility when type = grant
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

    // In-kind and pledge fields, and the accounts/program pickers they need. Both only apply
    // when this specific combination is chosen -- everything else (cash donation/grant/dues)
    // stays exactly as before, no ledger posting involved.
    const methodEl = section.querySelector('#gift-method');
    const programWrap = section.querySelector('#gift-program-wrap');
    const programSelect = section.querySelector('#gift-program-id');
    const inKindFields = section.querySelector('#gift-inkind-fields');
    const pledgeFields = section.querySelector('#gift-pledge-fields');
    const ikRevenueSelect = section.querySelector('#gift-ik-revenue-account');
    const ikExpenseSelect = section.querySelector('#gift-ik-expense-account');
    const plReceivableSelect = section.querySelector('#gift-pl-receivable-account');
    let programsLoaded = false;
    let accountsLoaded = false;

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
          const list = (Array.isArray(r.accounts) ? r.accounts : (Array.isArray(r) ? r : [])).filter(a => a.is_posting);
          const opt = (a) => `<option value="${a.id}">${esc(a.code ? a.code + ' — ' + a.name : a.name)}</option>`;
          const income = list.filter(a => a.type === 'income' && !a.is_system_contribution_revenue_account);
          const nonCashExpense = list.filter(a => a.type === 'expense' && a.is_non_cash);
          const asset = list.filter(a => a.type === 'asset');
          ikRevenueSelect.innerHTML = `<option value="">— select —</option>` + income.map(opt).join('');
          ikExpenseSelect.innerHTML = `<option value="">— select —</option>` + nonCashExpense.map(opt).join('');
          plReceivableSelect.innerHTML = `<option value="">— select —</option>` + asset.map(opt).join('');
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

    // Multi-year toggle + live present-value preview (final PV always recomputed server-side
    // at posting time -- this is just so the person logging the pledge sees roughly what will
    // post before they submit).
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
      pvPreview.textContent = `Will post at present value ≈ $${pv.toFixed(2)} (discount ≈ $${(total - pv).toFixed(2)})`;
    }
    if (multiyearCb) {
      multiyearCb.addEventListener('change', () => {
        if (multiyearFields) multiyearFields.hidden = !multiyearCb.checked;
        updatePvPreview();
      });
    }
    ['gift-pl-total', 'gift-pl-rate', 'gift-pl-years'].forEach((id) => {
      const el = section.querySelector('#' + id);
      if (el) el.addEventListener('input', updatePvPreview);
    });

    // Sponsored-project designation is independent of gift_type (a donation, not just a
    // "grant" type gift, can be earmarked for a sponsored project) -- shown whenever the org
    // has any sponsored projects at all, harmless no-op otherwise.
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
          // Fiscal sponsorship mode off, or no access -- leave the field hidden, not an error.
        }
      })();
    }

    // Wire gift submit
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
          payload.receivable_account_id = plReceivableSelect.value ? Number(plReceivableSelect.value) : null;
          payload.is_multi_year_pledge = !!(multiyearCb && multiyearCb.checked);
          if (payload.is_multi_year_pledge) {
            payload.discount_rate_bps = Math.round(parseFloat(section.querySelector('#gift-pl-rate').value) * 100);
            payload.pledge_years = parseFloat(section.querySelector('#gift-pl-years').value);
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

  // ── New donor form ──
  function openNewFunderPanel() {
    panelTitle.textContent = 'New donor';
    showPanelError('');
    panelBody.innerHTML = `<form id="new-funder-form">
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-name">Name <span style="color:var(--organizational-error)">*</span></label>
        <input class="organizational-input" id="nf-name" name="display_name" required>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-type">Type</label>
        <select class="organizational-select" id="nf-type" name="type">
          <option value="individual">Individual</option>
          <option value="board">Board</option>
          <option value="prospect">Prospect</option>
        </select>
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-website">Website</label>
        <input class="organizational-input" id="nf-website" name="website" type="url">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label" for="nf-email">Email</label>
        <input class="organizational-input" id="nf-email" name="email" type="email">
      </div>
      <div class="organizational-field-row" style="margin-bottom:10px;">
        <label class="organizational-label">Accounting roles</label>
        <label style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="nf-is-vendor"> Vendor <span style="color:var(--text-secondary);">(can be billed via Purchases)</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:5px;font-size:var(--text-sm);font-weight:400;">
          <input type="checkbox" id="nf-is-customer"> Customer <span style="color:var(--text-secondary);">(can be invoiced via Sales)</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="organizational-btn organizational-btn-sm">Create donor</button>
        <span id="nf-status" style="font-size:var(--text-sm);color:var(--text-secondary);"></span>
      </div>
    </form>`;
    panel.classList.add('organizational-panel-is-open');
    panelOverlay.classList.add('organizational-panel-is-open');

    const form = panelBody.querySelector('#new-funder-form');
    form && form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {};
      for (const [k, v] of fd.entries()) if (v) body[k] = v;
      // is_donor otherwise defaults to false server-side for new rows (migration 204) -- this
      // panel is specifically "New donor," so every contact created here should be one.
      body.is_donor = true;
      body.is_vendor = form.querySelector('#nf-is-vendor').checked;
      body.is_customer = form.querySelector('#nf-is-customer').checked;
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

  // ── Type filter + search ──
  document.querySelectorAll('.organizational-type-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.organizational-type-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTypeFilter = btn.dataset.type || 'all';
      renderFunderList();
    });
  });

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

  if (addBtn) addBtn.addEventListener('click', openNewFunderPanel);

  // ── Init (called by funders-workspace.js coordinator) ──
  // Coordinator owns org load (single fetch) and title/sidebar/header chrome;
  // we just fetch the funder list here. (Grant-pipeline stats/dashboard live on
  // the Grants tab, not here — this tab is donor/funder relationship CRM only.)
  async function init(slug) {
    currentSlug = slug;

    try {
      const org = window.OrganizationalFunders && typeof window.OrganizationalFunders.getOrg === 'function'
        ? window.OrganizationalFunders.getOrg() : null;
      orgHasXero = !!(org && org.xero_tenant_id);

      // Note: deliberately NOT passing tab=institutions — that server-side filter restricts
      // results to foundation/member_org/prospect only, hiding individual and board donors.
      // The Funders/Donors tab is the full constituent CRM list, not just institutional funders.
      const fundersRes = await fetch(`/api/organizational/orgs/${slug}/constituents`).then(r => r.json()).catch(() => []);

      fundersCache = Array.isArray(fundersRes) ? fundersRes : [];
      renderFunderList();

      // Populate tag datalist for the tag filter input
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

  // ── Expose init() for the funders-workspace.js coordinator ──
  window.OrganizationalFunders = window.OrganizationalFunders || {};
  window.OrganizationalFunders.donors = { init: init };
})();
