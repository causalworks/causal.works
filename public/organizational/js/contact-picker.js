/* contact-picker.js — shared searchable vendor/customer picker for Purchases and Sales.
 * Replaces a plain <select> with: type-to-filter against an already-loaded cache (no server
 * round trip), a pinned "+ Add new vendor/customer" row that creates a contact inline via the
 * same /constituents endpoint contacts-ui.js uses, and click-vs-blur handling borrowed from
 * donors.js's tag-autocomplete (mousedown+preventDefault on options, a short delayed blur-hide)
 * since that's the one place in this codebase that already solved this race correctly.
 *
 * One shared module rather than six per-panel copies -- filtering/positioning/keyboard-nav/
 * quick-add is real, stateful logic worth keeping in one place, unlike the trivial per-file
 * helpers (esc(), inputToCents()) this codebase normally duplicates freely.
 */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;

  const ROLE_LABELS = { vendor: 'vendor', customer: 'customer' };

  function mount(containerEl, options) {
    if (!containerEl) return null;
    const { getCache, role, slug, selectedId, disabled, valueElementId } = options;
    const roleLabel = ROLE_LABELS[role] || role;

    const initial = (getCache() || []).find((c) => Number(c.id) === Number(selectedId));

    if (disabled) {
      containerEl.innerHTML =
        '<div class="organizational-input" style="background:var(--surface-subtle,#f4f4f4);color:var(--text-secondary);">'
        + esc(initial ? initial.display_name : '—') + '</div>'
        + '<input type="hidden" id="' + valueElementId + '" value="' + (selectedId || '') + '">';
      return null;
    }

    containerEl.innerHTML =
      '<div class="organizational-contact-picker" style="position:relative;">'
      + '<input type="text" id="' + valueElementId + '-input" name="' + valueElementId + '-input" class="organizational-input organizational-contact-picker-input" autocomplete="off" placeholder="Search or add a ' + esc(roleLabel) + '…" value="' + esc(initial ? initial.display_name : '') + '">'
      + '<input type="hidden" id="' + valueElementId + '" value="' + (selectedId || '') + '">'
      + '<ul class="organizational-org-results organizational-contact-picker-results" hidden></ul>'
      + '</div>';

    const input = containerEl.querySelector('.organizational-contact-picker-input');
    const hidden = containerEl.querySelector('#' + valueElementId);
    const list = containerEl.querySelector('.organizational-contact-picker-results');
    let activeIndex = -1; // 0 = "+ Add new" row, 1..n = filtered matches
    let currentMatches = [];
    let quickAddOpen = false;

    function closeList() {
      list.hidden = true;
      list.innerHTML = '';
      activeIndex = -1;
      quickAddOpen = false;
    }

    function selectContact(contact) {
      hidden.value = contact.id;
      input.value = contact.display_name;
      closeList();
    }

    function renderQuickAddRow(query) {
      return '<li class="organizational-contact-picker-add-new" data-add-new="1">+ Add new ' + esc(roleLabel)
        + (query ? ': "' + esc(query) + '"' : '') + '</li>';
    }

    function openQuickAdd(query) {
      quickAddOpen = true;
      list.innerHTML =
        '<li style="padding:10px 12px;">'
        + '<input type="text" id="' + valueElementId + '-quickadd-name" name="' + valueElementId + '-quickadd-name" class="organizational-input organizational-contact-picker-quickadd-name" placeholder="Name" value="' + esc(query || '') + '" style="width:100%;margin-bottom:6px;">'
        + '<div style="display:flex;gap:6px;">'
        + '<button type="button" class="organizational-btn organizational-btn-primary organizational-contact-picker-quickadd-save" style="font-size:0.8125rem;padding:4px 10px;">Save</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline organizational-contact-picker-quickadd-cancel" style="font-size:0.8125rem;padding:4px 10px;">Cancel</button>'
        + '</div>'
        + '</li>';
      list.hidden = false;
      const nameInput = list.querySelector('.organizational-contact-picker-quickadd-name');
      const saveBtn = list.querySelector('.organizational-contact-picker-quickadd-save');
      const cancelBtn = list.querySelector('.organizational-contact-picker-quickadd-cancel');
      if (nameInput) { nameInput.focus(); nameInput.select(); }
      async function doSave() {
        const name = (nameInput.value || '').trim();
        if (!name) { nameInput.focus(); return; }
        const body = { display_name: name };
        if (role === 'vendor') body.is_vendor = true;
        else if (role === 'customer') body.is_customer = true;
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/constituents', {
          method: 'POST', body: JSON.stringify(body),
        });
        if (out && out.res.ok) {
          const cache = getCache();
          cache.push(out.data);
          selectContact(out.data);
        }
      }
      if (saveBtn) saveBtn.addEventListener('mousedown', (e) => { e.preventDefault(); doSave(); });
      if (nameInput) nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeList(); }
      });
      if (cancelBtn) cancelBtn.addEventListener('mousedown', (e) => { e.preventDefault(); closeList(); });
    }

    function renderMatches(query) {
      const cache = getCache() || [];
      const q = (query || '').trim().toLowerCase();
      currentMatches = q ? cache.filter((c) => (c.display_name || '').toLowerCase().includes(q)) : cache.slice(0, 20);
      const rows = currentMatches.slice(0, 20).map((c, i) =>
        '<li data-idx="' + (i + 1) + '"><button type="button">' + esc(c.display_name) + '</button></li>'
      ).join('');
      list.innerHTML = renderQuickAddRow(query) + (rows || '<li style="padding:10px 12px;color:var(--text-secondary);font-size:0.8125rem;">No matches</li>');
      list.hidden = false;
      activeIndex = -1;
      wireListClicks();
    }

    function wireListClicks() {
      const addNewEl = list.querySelector('[data-add-new]');
      if (addNewEl) addNewEl.addEventListener('mousedown', (e) => { e.preventDefault(); openQuickAdd(input.value); });
      list.querySelectorAll('li[data-idx] button').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = Number(btn.closest('li').getAttribute('data-idx')) - 1;
          const contact = currentMatches[idx];
          if (contact) selectContact(contact);
        });
      });
    }

    function setActive(idx) {
      activeIndex = idx;
      const items = Array.from(list.children);
      items.forEach((li, i) => li.classList.toggle('organizational-contact-picker-active', i === idx));
      const el = items[idx];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', () => { if (!quickAddOpen) renderMatches(input.value); });
    input.addEventListener('input', () => { hidden.value = ''; renderMatches(input.value); });
    input.addEventListener('blur', () => { setTimeout(() => { if (!quickAddOpen) closeList(); }, 150); });
    input.addEventListener('keydown', (e) => {
      if (quickAddOpen) return;
      if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { renderMatches(input.value); return; }
      const count = 1 + currentMatches.length; // add-new row + matches
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIndex + 1) % count); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIndex - 1 + count) % count); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex === 0) openQuickAdd(input.value);
        else if (activeIndex > 0) { const c = currentMatches[activeIndex - 1]; if (c) selectContact(c); }
      } else if (e.key === 'Escape') { closeList(); }
    });

    return { getValue: () => hidden.value };
  }

  window.OrganizationalContactPicker = { mount: mount };
})();
