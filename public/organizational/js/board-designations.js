/* board-designations.js — board designations list and the designate/release transfer form. */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmtMoney = window.formatMoneyCents;

  let currentSlug = '';
  let designationsCache = [];
  let equityAccounts = [];

  const STATUS_LABELS = { active: 'Active', closed: 'Closed' };

  const tbody = document.getElementById('organizational-boarddesig-tbody');
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    columns: [
      { key: 'name', type: 'text', get: (d) => d.name },
      null,
      { key: 'board_approved_date', type: 'date', get: (d) => d.board_approved_date },
      { key: 'balance', type: 'currency', get: (d) => d.balance_cents },
      { key: 'status', type: 'text', get: (d) => STATUS_LABELS[d.status] || d.status },
      null,
    ],
    onChange: () => renderDesignations(),
  }) : null;

  function renderDesignations() {
    if (!tbody) return;
    if (!designationsCache.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No board designations yet.</td></tr>';
      return;
    }
    tbody.innerHTML = (sorter ? sorter.sortRows(designationsCache) : designationsCache).map((d) => (
      '<tr>'
      + '<td>' + esc(d.name) + '</td>'
      + '<td>' + esc(d.purpose || '') + '</td>'
      + '<td>' + esc(String(d.board_approved_date || '').slice(0, 10)) + '</td>'
      + '<td>' + fmtMoney(Number(d.balance_cents)) + '</td>'
      + '<td>' + esc(STATUS_LABELS[d.status] || d.status) + '</td>'
      + '<td>'
        + (d.status === 'active'
          ? '<button type="button" class="organizational-btn organizational-btn-outline boarddesig-move-btn" data-id="' + d.id + '" style="font-size:0.75rem;">Designate or release</button> '
          : '')
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

  async function loadEquityAccounts() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/accounts');
    const all = (out && out.data && (out.data.accounts || out.data)) || [];
    equityAccounts = (Array.isArray(all) ? all : []).filter((a) => a.type === 'equity' && a.is_posting);
  }

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

  function accountOptions(selectedId) {
    return equityAccounts.map((a) => '<option value="' + a.id + '"' + (Number(a.id) === Number(selectedId) ? ' selected' : '') + '>' + esc((a.code ? a.code + ' ' : '') + a.name) + '</option>').join('');
  }

  function renderMoveForm(d) {
    if (!formEl) return;
    const undesignated = equityAccounts.find((a) => /without donor restrictions/i.test(a.name));
    const designated = equityAccounts.find((a) => /board-designated/i.test(a.name));
    formEl.innerHTML = (
      '<h4 style="margin:0 0 12px;">Designate or release: ' + esc(d.name) + '</h4>'
      + '<div class="organizational-form-row"><label>Action<select id="boarddesig-m-dir"><option value="designate">Designate (move to this designation)</option><option value="release">Release (move back to undesignated)</option></select></label></div>'
      + '<div class="organizational-form-row"><label>Amount<input type="number" id="boarddesig-m-amt" min="0.01" step="0.01"></label></div>'
      + '<div class="organizational-form-row"><label>Date<input type="date" id="boarddesig-m-date" value="' + new Date().toISOString().slice(0, 10) + '"></label></div>'
      + '<div class="organizational-form-row"><label>Undesignated net assets account<select id="boarddesig-m-from">' + accountOptions(undesignated && undesignated.id) + '</select></label></div>'
      + '<div class="organizational-form-row"><label>Designated net assets account<select id="boarddesig-m-to">' + accountOptions(designated && designated.id) + '</select></label></div>'
      + '<div class="organizational-form-row"><label>Memo<input type="text" id="boarddesig-m-memo" placeholder="e.g. board resolution reference"></label></div>'
      + '<div class="organizational-panel-error" id="boarddesig-m-error" hidden></div>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
        + '<button type="button" class="organizational-btn organizational-btn-primary" id="boarddesig-m-save">Post</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline" id="boarddesig-m-cancel">Cancel</button>'
      + '</div>'
    );
    formEl.hidden = false;
    document.getElementById('boarddesig-m-cancel').addEventListener('click', () => { formEl.hidden = true; });
    document.getElementById('boarddesig-m-save').addEventListener('click', async () => {
      const errEl = document.getElementById('boarddesig-m-error');
      errEl.hidden = true;
      const dollars = Number(document.getElementById('boarddesig-m-amt').value);
      const body = {
        direction: document.getElementById('boarddesig-m-dir').value,
        amount_cents: Math.round(dollars * 100),
        transaction_date: document.getElementById('boarddesig-m-date').value,
        undesignated_account_id: Number(document.getElementById('boarddesig-m-from').value),
        designated_account_id: Number(document.getElementById('boarddesig-m-to').value),
        memo: document.getElementById('boarddesig-m-memo').value.trim(),
      };
      if (!(body.amount_cents > 0)) { errEl.textContent = 'Enter an amount.'; errEl.hidden = false; return; }
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/board-designations/' + d.id + '/transfer', { method: 'POST', body: JSON.stringify(body) });
      if (!out) return;
      if (!out.res.ok) { errEl.textContent = (out.data && out.data.error) || 'Could not post.'; errEl.hidden = false; return; }
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
      const moveBtn = e.target.closest('.boarddesig-move-btn');
      if (moveBtn) {
        const d = designationsCache.find((x) => Number(x.id) === Number(moveBtn.getAttribute('data-id')));
        if (d) renderMoveForm(d);
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

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (formEl && !formEl.hidden) formEl.hidden = true;
  });

  async function initBoardDesignations(slug) {
    currentSlug = slug;
    await Promise.all([loadDesignations(), loadEquityAccounts()]);
  }

  window.OrganizationalAccounting.boardDesignations = { init: initBoardDesignations };
})();
