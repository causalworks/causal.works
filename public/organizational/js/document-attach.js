(function () {
  'use strict';

  // Documents section shared by bills, invoices, expense claims and ledger entries.

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;

  const CATEGORY_LABELS = {
    vendor_bill: 'Vendor bill', customer_invoice: 'Customer invoice', procurement_quote: 'Procurement quote', procurement_solicitation: 'Formal solicitation',
    expense_receipt: 'Receipt', bank_statement: 'Bank statement', contract_lease: 'Contract or lease', other: 'Other',
  };

  function categoryOptionsHtml(categories, selected) {
    return categories.map((c) =>
      '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + esc(CATEGORY_LABELS[c] || c) + '</option>'
    ).join('');
  }

  function sizeText(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return n + ' B';
  }

  function dateText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function html(sourceRefType, categories, opts) {
    const readOnly = !!(opts && opts.readOnly);
    const defaultCategory = (opts && opts.defaultCategory) || categories[0];
    return '<div class="organizational-panel-section-head">Documents <span class="doc-attach-count" style="font-weight:400;color:var(--text-secondary);"></span></div>'
      + '<div class="doc-attach-list" style="margin-bottom:8px;"><p class="organizational-empty" style="padding:8px 0;">Loading…</p></div>'
      + (readOnly ? '' : '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<label class="organizational-btn organizational-btn-outline" style="font-size:0.8125rem;padding:6px 12px;cursor:pointer;">Choose files'
        + '<input type="file" class="doc-attach-file" multiple hidden></label>'
        + '<span class="doc-attach-chosen organizational-hint" style="margin:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
        + '<select class="organizational-select doc-attach-category" style="width:auto;min-width:150px;max-width:190px;flex:none;font-size:0.8125rem;" aria-label="Kind of document">' + categoryOptionsHtml(categories, defaultCategory) + '</select>'
        + '<button type="button" class="organizational-btn doc-attach-upload-btn" style="font-size:0.8125rem;padding:6px 14px;" disabled>Upload</button>'
        + '</div>')
      + '<p class="doc-attach-note organizational-hint" hidden style="margin-top:6px;"></p>'
      + '<p class="doc-attach-error organizational-panel-error" hidden style="margin-top:6px;"></p>';
  }

  function rowHtml(slug, doc, readOnly) {
    const meta = [CATEGORY_LABELS[doc.category] || doc.category, sizeText(doc.byte_size), dateText(doc.created_at)].filter(Boolean).join(' · ');
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:0.8125rem;">'
      + '<a href="/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + doc.id + '/download" target="_blank" rel="noopener" title="' + esc(doc.title) + '" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(doc.title) + '</a>'
      + '<span style="flex:none;color:var(--text-secondary);white-space:nowrap;">' + esc(meta) + '</span>'
      + (readOnly ? '' : '<button type="button" class="organizational-btn-icon doc-attach-delete-btn" data-id="' + doc.id + '" title="Delete" aria-label="Delete ' + esc(doc.title) + '" style="flex:none;">✕</button>')
      + '</div>';
  }

  function wire(containerEl, { slug, sourceRefType, sourceRefId, readOnly }) {
    const listEl = containerEl.querySelector('.doc-attach-list');
    const fileInput = containerEl.querySelector('.doc-attach-file');
    const chosenEl = containerEl.querySelector('.doc-attach-chosen');
    const categorySelect = containerEl.querySelector('.doc-attach-category');
    const uploadBtn = containerEl.querySelector('.doc-attach-upload-btn');
    const countEl = containerEl.querySelector('.doc-attach-count');
    const errEl = containerEl.querySelector('.doc-attach-error');
    const noteEl = containerEl.querySelector('.doc-attach-note');

    function showErr(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }
    function showNote(msg) { if (noteEl) { noteEl.textContent = msg || ''; noteEl.hidden = !msg; } }

    async function load() {
      if (!listEl) return;
      const params = new URLSearchParams({ source_ref_type: sourceRefType, source_ref_id: String(sourceRefId) });
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents?' + params.toString());
      const docs = (out && out.data && out.data.documents) || [];
      if (countEl) countEl.textContent = docs.length ? '(' + docs.length + ')' : '';
      listEl.innerHTML = docs.length
        ? docs.map((d) => rowHtml(slug, d, readOnly)).join('')
        : '<p class="organizational-empty" style="padding:8px 0;">No documents attached yet.</p>';
    }

    if (fileInput) fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      if (chosenEl) chosenEl.textContent = files.length === 1 ? files[0].name : files.length ? files.length + ' files chosen' : '';
      if (uploadBtn) uploadBtn.disabled = !files.length;
    });

    if (uploadBtn) uploadBtn.addEventListener('click', async () => {
      showErr('');
      showNote('');
      const files = Array.from((fileInput && fileInput.files) || []);
      if (!files.length) { showErr('Choose a file first.'); return; }
      uploadBtn.disabled = true;
      let replaced = 0;
      const failed = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('category', categorySelect ? categorySelect.value : 'other');
        form.append('source_ref_type', sourceRefType);
        form.append('source_ref_id', String(sourceRefId));
        const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents', { method: 'POST', body: form, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { if (data.replaced) replaced += 1; }
        else failed.push(file.name + ': ' + (data.error || 'could not upload'));
      }
      if (fileInput) fileInput.value = '';
      if (chosenEl) chosenEl.textContent = '';
      if (replaced) showNote(replaced === 1 ? 'Replaced the earlier file with the same name.' : 'Replaced ' + replaced + ' earlier files with the same names.');
      if (failed.length) showErr(failed.join(' '));
      await load();
    });

    if (listEl) listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.doc-attach-delete-btn');
      if (!btn) return;
      if (!window.confirm('Delete this document? The file is removed and cannot be recovered.')) return;
      showErr('');
      showNote('');
      const id = btn.getAttribute('data-id');
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + id + '?hard=true', { method: 'DELETE' });
      if (out && out.res.ok) await load();
      else showErr((out && out.data && out.data.error) || 'Could not delete the document.');
    });

    load();
  }

  // Paperclip shown on a list row whose record has files; opens the first file, the title gives the count.
  function clip(item) {
    if (!item || !item.file_count) return '';
    const m = /^\/organizational\/o\/([^/]+)\//.exec(window.location.pathname || '');
    if (!m) return '';
    const n = Number(item.file_count);
    const href = '/api/organizational/orgs/' + m[1] + '/documents/' + encodeURIComponent(item.first_file_id) + '/download';
    return ' <a href="' + href + '" class="organizational-file-clip" onclick="event.stopPropagation()" title="' + n + (n === 1 ? ' file attached' : ' files attached') + '" aria-label="Open attached file" style="color:var(--text-secondary);white-space:nowrap;text-decoration:none;">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
      + (n > 1 ? '<span style="font-size:0.6875rem;">' + n + '</span>' : '') + '</a>';
  }

  window.OrganizationalDocumentAttach = { html, wire, clip };
})();
