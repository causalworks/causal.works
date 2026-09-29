/* board-designations.js — Accounting build-order item #7: board-imposed internal earmarks of
 * net assets without donor restriction (operating reserve, building fund, quasi-endowment).
 * Not a separate GAAP net-asset class -- ASU 2016-14 requires only a liquidity/appropriation
 * disclosure. Balance is derived (SUM of tagged org_ledger_lines), same architecture as a
 * donor-restricted grant's per-fund balance -- no balance column to keep in sync. Money moves
 * in/out via ordinary manual transactions on the Transactions tab, tagged with a designation
 * via the dropdown added there (see ledger.js).
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  let currentSlug = '';
  let designationsCache = [];

  const STATUS_LABELS = { active: 'Active', closed: 'Closed' };

  const tbody = document.getElementById('organizational-boarddesig-tbody');

  function renderDesignations() {
    if (!tbody) return;
    if (!designationsCache.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No board designations yet.</td></tr>';
      return;
    }
    tbody.innerHTML = designationsCache.map((d) => (
      '<tr>'
      + '<td>' + esc(d.name) + '</td>'
      + '<td>' + esc(d.purpose || '') + '</td>'
      + '<td>' + esc(String(d.board_approved_date || '').slice(0, 10)) + '</td>'
      + '<td>' + fmtMoney(Number(d.balance_cents)) + '</td>'
      + '<td>' + esc(STATUS_LABELS[d.status] || d.status) + '</td>'
      + '<td>'
        + '<button type="button" class="organizational-btn organizational-btn-outline boarddesig-edit-btn" data-id="' + d.id + '" style="font-size:0.75rem;">Edit</button> '
        + (d.status === 'active'
          ? '<button type="button" class="organizational-btn organizational-btn-outline boarddesig-close-btn" data-id="' + d.id + '" style="font-size:0.75rem;">Close</button>'
          : '')
      + '</td>'
      + '</tr>'
    )).join('');
  }

  async function loadDesignations() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/board-designations');
    designationsCache = (out && out.data && out.data.designations) || [];
    renderDesignations();
  }

  // ── Create/edit form ──
  const formEl = document.getElementById('organizational-boarddesig-form');
  const addBtn = document.getElementById('organizational-boarddesig-add');

  function renderForm(existing) {
    if (!formEl) return;
    const d = existing || {};
    formEl.innerHTML = (
      '<h4 style="margin:0 0 12px;">' + (existing ? 'Edit designation' : 'New board designation') + '</h4>'
      + '<div class="organizational-form-row"><label>Name<input type="text" id="boarddesig-f-name" value="' + esc(d.name || '') + '"></label></div>'
      + '<div class="organizational-form-row"><label>Purpose<input type="text" id="boarddesig-f-purpose" value="' + esc(d.purpose || '') + '"></label></div>'
      + '<div class="organizational-form-row"><label>Board approved date<input type="date" id="boarddesig-f-date" value="' + esc(String(d.board_approved_date || '').slice(0, 10)) + '"></label></div>'
      + '<div class="organizational-form-row"><label>Board resolution reference<input type="text" id="boarddesig-f-ref" value="' + esc(d.board_resolution_ref || '') + '" placeholder="e.g. minutes reference"></label></div>'
      + '<div class="organizational-panel-error" id="boarddesig-f-error" hidden></div>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
        + '<button type="button" class="organizational-btn organizational-btn-primary" id="boarddesig-f-save">Save</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline" id="boarddesig-f-cancel">Cancel</button>'
      + '</div>'
    );
    formEl.hidden = false;
    formEl.dataset.editingId = existing ? String(existing.id) : '';

    document.getElementById('boarddesig-f-cancel').addEventListener('click', () => { formEl.hidden = true; });
    document.getElementById('boarddesig-f-save').addEventListener('click', async () => {
      const errEl = document.getElementById('boarddesig-f-error');
      errEl.hidden = true;
      const body = {
        name: document.getElementById('boarddesig-f-name').value.trim(),
        purpose: document.getElementById('boarddesig-f-purpose').value.trim() || null,
        board_approved_date: document.getElementById('boarddesig-f-date').value || null,
        board_resolution_ref: document.getElementById('boarddesig-f-ref').value.trim() || null,
      };
      if (!body.name) { errEl.textContent = 'Name is required.'; errEl.hidden = false; return; }
      const editingId = formEl.dataset.editingId;
      const url = '/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/board-designations' + (editingId ? '/' + editingId : '');
      const out = await apiJson(url, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!out) return;
      if (!out.res.ok) { errEl.textContent = (out.data && out.data.error) || 'Could not save.'; errEl.hidden = false; return; }
      formEl.hidden = true;
      await loadDesignations();
    });
  }

  if (addBtn) addBtn.addEventListener('click', () => renderForm(null));

  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.boarddesig-edit-btn');
      if (editBtn) {
        const d = designationsCache.find((x) => Number(x.id) === Number(editBtn.getAttribute('data-id')));
        if (d) renderForm(d);
        return;
      }
      const closeBtn = e.target.closest('.boarddesig-close-btn');
      if (closeBtn) {
        const id = closeBtn.getAttribute('data-id');
        if (!confirm('Close this board designation? It will no longer be selectable for new transactions.')) return;
        await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/board-designations/' + id, {
          method: 'PATCH', body: JSON.stringify({ status: 'closed' }),
        });
        await loadDesignations();
      }
    });
  }

  // ── Escape closes the board-designation form ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (formEl && !formEl.hidden) formEl.hidden = true;
  });

  // ── Entry point, called by the accounting-workspace coordinator ──
  async function initBoardDesignations(slug) {
    currentSlug = slug;
    await loadDesignations();
  }

  window.OrganizationalAccounting.boardDesignations = { init: initBoardDesignations };
})();
