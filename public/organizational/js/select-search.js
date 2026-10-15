// Searchable dropdown for a plain <select>: the select stays in the page (hidden), so code that reads select.value, sets it,
// or listens for change and input events keeps working. Loaded on every workspace page: any single-choice dropdown with 15 or
// more choices becomes searchable by itself (add data-no-search to opt out, or data-searchable to force it on a short one). A text box shows the full chosen label (it is not cut off by a
// narrow column) and filters the choices as you type; the list opens in a popup that can be wider than the box.
// Arrow keys, Enter and Escape work; a click picks.
(function () {
  'use strict';

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let openPop = null;

  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; }
  }

  function labelOf(sel) {
    const o = sel.options[sel.selectedIndex];
    return o && o.value !== '' ? o.textContent : '';
  }

  function choices(sel) {
    return Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }));
  }

  function enhance(sel, opts) {
    if (!sel || sel.dataset.searchable === '1') return;
    sel.dataset.searchable = '1';
    const first = sel.options[0] && sel.options[0].value === '' ? String(sel.options[0].textContent) : '';
    const noun = first.replace(/[—–\-…]/g, '').replace(/^\s*(choose|select)\s+(an?|the)?\s*/i, '').trim().toLowerCase();
    const placeholder = (opts && opts.placeholder) || (noun && !/^(none|not linked|all\b)/.test(noun) ? 'Search ' + noun + '…' : 'Search…');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'organizational-input';
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    input.style.cssText = 'width:100%;box-sizing:border-box;cursor:pointer;text-overflow:ellipsis;';
    input.setAttribute('aria-label', sel.getAttribute('aria-label') || placeholder);
    input.disabled = sel.disabled;
    sel.parentNode.insertBefore(input, sel);
    sel.style.cssText += ';position:absolute;opacity:0;width:1px;height:1px;pointer-events:none;';
    sel.tabIndex = -1;
    sel.focus = function () { input.focus(); };

    const show = () => { input.value = labelOf(sel); input.title = input.value; };
    show();

    Object.defineProperty(sel, 'value', {
      configurable: true,
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); show(); },
    });
    const idxDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get() { return idxDesc.get.call(this); },
      set(v) { idxDesc.set.call(this, v); show(); },
    });
    sel.addEventListener('change', show);
    if (window.MutationObserver) {
      new MutationObserver(() => { input.disabled = sel.disabled; show(); }).observe(sel, { attributes: true, attributeFilter: ['disabled'], childList: true });
    }

    function pick(v) {
      valueDesc.set.call(sel, v);
      show();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      closePop();
    }

    function open() {
      closePop();
      const list = choices(sel);
      const current = sel.value;
      const pop = document.createElement('div');
      const r = input.getBoundingClientRect();
      const width = Math.max(r.width, 320);
      const below = window.innerHeight - r.bottom - 12;
      const up = below < 200 && r.top > below;
      pop.style.cssText = 'position:fixed;z-index:1000;left:' + Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px;width:' + width + 'px;'
        + 'max-height:' + Math.max(140, Math.min(300, (up ? r.top : below) - 8)) + 'px;overflow-y:auto;overscroll-behavior:contain;'
        + (up ? 'bottom:' + (window.innerHeight - r.top + 2) + 'px;' : 'top:' + (r.bottom + 2) + 'px;')
        + 'background:var(--surface-card);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-lg);padding:2px 0;font-size:0.8125rem;';
      document.body.appendChild(pop);
      openPop = pop;
      let shown = list.filter((c) => c.value !== '' || !current);
      let active = Math.max(0, shown.findIndex((c) => c.value === current));
      const paint = () => {
        pop.innerHTML = shown.length
          ? shown.map((c, i) => '<div data-i="' + i + '" style="padding:5px 10px;' + (c.disabled ? 'color:var(--text-secondary);' : 'cursor:pointer;')
            + (i === active ? 'background:var(--surface-active);' : '') + (c.value === current ? 'font-weight:600;' : '') + '">'
            + (c.label || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>').join('')
          : '<div style="padding:6px 10px;color:var(--text-secondary);">No matches</div>';
        const act = pop.children[active];
        if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      };
      paint();
      input.select();
      pop.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const row = e.target.closest('[data-i]');
        const c = row && shown[Number(row.dataset.i)];
        if (c && !c.disabled) pick(c.value);
      });
      const onInput = () => {
        const q = input.value.trim().toLowerCase();
        shown = list.filter((c) => c.value !== '' && c.label.toLowerCase().includes(q));
        active = 0;
        paint();
      };
      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); const c = shown[active]; if (c && !c.disabled) pick(c.value); }
        else if (e.key === 'Escape') { closePop(); show(); }
      };
      const cleanup = () => { input.removeEventListener('input', onInput); input.removeEventListener('keydown', onKey); input.removeEventListener('blur', onBlur); };
      const onBlur = () => { cleanup(); closePop(); show(); };
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', onKey);
      input.addEventListener('blur', onBlur);
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', () => { if (!openPop) open(); });
  }

  function enhanceIn(root, selector) {
    (root || document).querySelectorAll(selector || 'select').forEach((s) => enhance(s));
  }

  const AUTO_MIN_CHOICES = 15;
  function consider(sel) {
    if (!(sel instanceof HTMLSelectElement) || sel.dataset.searchable === '1' || sel.dataset.noSearch !== undefined) return;
    if (sel.multiple || sel.size > 1) return;
    if (sel.dataset.searchable !== undefined || sel.options.length >= AUTO_MIN_CHOICES) enhance(sel);
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SELECT') consider(node);
    else if (node.querySelectorAll) node.querySelectorAll('select').forEach(consider);
  }
  if (window.MutationObserver) {
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') {
          if (m.target instanceof HTMLSelectElement) consider(m.target);
          m.addedNodes.forEach(scan);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', () => scan(document.body));
  if (document.readyState !== 'loading') scan(document.body);

  window.addEventListener('scroll', (e) => { if (openPop && e.target !== openPop && !(openPop.contains && e.target instanceof Node && openPop.contains(e.target))) closePop(); }, true);
  window.OrganizationalSelectSearch = { enhance, enhanceIn };
})();
