(function () {
  'use strict';

  // Shared "attach documents to a record" section, used inside the Bill and Invoice detail
  // panels (Purchases_Sales_Contacts_V1_Spec.md Section 6 -- source_ref_id/source_ref_type on
  // org_documents, not a dedicated FK column per record type). Also how a bill satisfies the
  // procurement_quote requirement (spec 3.4) before it can be submitted.

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;

  const CATEGORY_LABELS = {
    vendor_bill: 'Vendor bill', customer_invoice: 'Customer invoice', procurement_quote: 'Procurement quote / price document',
    procurement_solicitation: 'Formal solicitation (sealed bid / competitive proposal)',
    expense_receipt: 'Receipt', other: 'Other',
  };

  function categoryOptionsHtml(categories, selected) {
    return categories.map((c) =>
      '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + esc(CATEGORY_LABELS[c] || c) + '</option>'
    ).join('');
  }

  /** sourceRefType: 'bill' | 'invoice'. categories: which org_document_category values this record's upload form offers. */
  function html(sourceRefType, categories) {
    return '<div class="organizational-panel-section-head">Documents</div>'
      + '<div class="doc-attach-list" style="margin-bottom:8px;"><p class="organizational-empty" style="padding:8px 0;">Loading…</p></div>'
      + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">'
      + '<input type="file" class="doc-attach-file" style="font-size:0.8125rem;max-width:220px;">'
      + '<select class="organizational-select doc-attach-category" style="width:auto;font-size:0.8125rem;">' + categoryOptionsHtml(categories, categories[0]) + '</select>'
      + '<button type="button" class="organizational-btn organizational-btn-outline doc-attach-upload-btn" style="font-size:0.8125rem;">Upload</button>'
      + '</div>'
      + '<p class="doc-attach-error organizational-panel-error" hidden style="margin-top:6px;"></p>';
  }

  function rowHtml(slug, doc) {
    return '<div class="organizational-panel-field-row" style="font-size:0.8125rem;padding:4px 0;border-bottom:1px solid var(--border);align-items:center;">'
      + '<a href="/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + doc.id + '/download" target="_blank" style="flex:2;">' + esc(doc.title) + '</a>'
      + '<span style="flex:1;color:var(--text-secondary);">' + esc(CATEGORY_LABELS[doc.category] || doc.category) + '</span>'
      + '<button type="button" class="organizational-btn-icon doc-attach-archive-btn" data-id="' + doc.id + '" title="Archive">✕</button>'
      + '</div>';
  }

  /** Wires the section inside `containerEl` (the panel body) for one record. Call once per panel open. */
  function wire(containerEl, { slug, sourceRefType, sourceRefId }) {
    const listEl = containerEl.querySelector('.doc-attach-list');
    const fileInput = containerEl.querySelector('.doc-attach-file');
    const categorySelect = containerEl.querySelector('.doc-attach-category');
    const uploadBtn = containerEl.querySelector('.doc-attach-upload-btn');
    const errEl = containerEl.querySelector('.doc-attach-error');

    function showErr(msg) { if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; } }

    async function load() {
      if (!listEl) return;
      const params = new URLSearchParams({ source_ref_type: sourceRefType, source_ref_id: String(sourceRefId) });
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents?' + params.toString());
      const docs = (out && out.data && out.data.documents) || [];
      listEl.innerHTML = docs.length
        ? docs.map((d) => rowHtml(slug, d)).join('')
        : '<p class="organizational-empty" style="padding:8px 0;">No documents attached yet.</p>';
    }

    if (uploadBtn) uploadBtn.addEventListener('click', async () => {
      showErr('');
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { showErr('Choose a file first.'); return; }
      const form = new FormData();
      form.append('file', file);
      form.append('category', categorySelect ? categorySelect.value : 'other');
      form.append('source_ref_type', sourceRefType);
      form.append('source_ref_id', String(sourceRefId));
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (fileInput) fileInput.value = '';
        await load();
      } else {
        showErr(data.error || 'Could not upload document.');
      }
    });

    if (listEl) listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.doc-attach-archive-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/documents/' + id, { method: 'DELETE' });
      if (out && out.res.ok) await load();
      else showErr((out && out.data && out.data.error) || 'Could not archive document.');
    });

    load();
  }

  window.OrganizationalDocumentAttach = { html, wire };
})();
