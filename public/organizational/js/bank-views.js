// Bank section: Statements view (every imported or connected bank line for the account, with
// the entry each one became) and Register view (the books' own entries for the account with a
// running balance). Both are read-mostly lists; the only changes made here are Unreconcile and Void,
// each with a required reason, through the same endpoints the rest of Accounting uses.
// banking.js calls init(slug) and dispatches 'banking:view' when the view tab changes;
// ledger.js dispatches 'ledger:changed' after an entry is voided or approved from its detail panel.
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;
  const fmt = window.formatMoneyCents;

  const acctSelect = document.getElementById('organizational-banking-account');
  const $ = (id) => document.getElementById(id);

  let slug = '';
  let canWrite = false;
  let currentView = 'reconcile';
  let wired = false;

  function base() { return '/api/organizational/orgs/' + encodeURIComponent(slug); }
  function openEntry(id) {
    const tx = window.OrganizationalAccounting.transactions;
    if (tx && typeof tx.openDetail === 'function') tx.openDetail(id, { fromBank: true });
  }
  function setText(id, msg, isError) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    if (isError !== undefined) el.hidden = !msg;
  }
  function money(cents) { return fmt(Number(cents)); }
  function cell(cents) { return cents && cents !== '0' ? money(cents) : '—'; }

  function askReason(sectionId, text, onConfirm) {
    closeReason();
    const section = $(sectionId);
    if (!section) return;
    const bar = document.createElement('div');
    bar.id = 'bankviews-reason-bar';
    bar.style.cssText = 'padding:8px 16px;border-bottom:1px solid var(--border);background:var(--surface-page);';
    bar.innerHTML = '<p class="organizational-hint" style="margin:0 0 6px;">' + esc(text) + '</p>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '<input type="text" id="bankviews-reason-input" class="organizational-input" placeholder="Reason (required)" aria-label="Reason" style="height:30px;box-sizing:border-box;font-size:0.8125rem;padding:0 8px;width:320px;">'
      + '<button type="button" id="bankviews-reason-ok" class="organizational-btn organizational-btn-primary" style="height:30px;box-sizing:border-box;font-size:0.8125rem;padding:0 12px;">Confirm</button>'
      + '<button type="button" id="bankviews-reason-cancel" class="organizational-btn organizational-btn-outline" style="height:30px;box-sizing:border-box;font-size:0.8125rem;padding:0 12px;">Cancel</button>'
      + '</div>';
    section.insertBefore(bar, section.firstChild);
    const input = $('bankviews-reason-input');
    input.focus();
    const go = async () => {
      const reason = input.value.trim();
      if (!reason) { input.style.borderColor = 'var(--red, #b91c1c)'; input.focus(); return; }
      $('bankviews-reason-ok').disabled = true;
      await onConfirm(reason);
      closeReason();
    };
    $('bankviews-reason-ok').addEventListener('click', go);
    $('bankviews-reason-cancel').addEventListener('click', closeReason);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') closeReason(); });
  }
  function closeReason() {
    const bar = $('bankviews-reason-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  async function unreconcileLines(lineIds, reason, keepEntry) {
    const results = { ok: 0, reversed: 0, cleared: 0, failed: [] };
    for (const id of lineIds) {
      const out = await apiJson(base() + '/bank-statement-lines/' + id + '/unreconcile', { method: 'POST', body: JSON.stringify(keepEntry ? { reason, keep_entry: true } : { reason }) });
      if (out && out.res.ok) {
        results.ok += 1;
        if (out.data && out.data.mode === 'reversed') results.reversed += 1;
        if (out.data && out.data.mode === 'transfer_cleared') results.cleared += 1;
      } else {
        results.failed.push((out && out.data && out.data.error) || 'Could not unreconcile line ' + id);
      }
    }
    return results;
  }
  function unreconcileMessage(r) {
    let m = r.ok ? r.ok + ' bank line' + (r.ok === 1 ? '' : 's') + ' returned to Reconcile.' : '';
    if (r.cleared) m += ' ' + r.cleared + (r.cleared === 1 ? ' was' : ' were') + ' only marked as a transfer (no entry posted), so the mark was cleared.';
    if (r.reversed) m += ' ' + r.reversed + ' sat in a locked year, so the original entry was left alone and reversed by a new entry.';
    return m.trim();
  }

  let statements = [];
  const statSorter = window.OrganizationalTableSort && $('organizational-statements-tbody')
    ? window.OrganizationalTableSort.attach($('organizational-statements-tbody').closest('table'), {
      columns: [
        { key: 'date', type: 'date', get: (l) => l.statement_date },
        { key: 'payee', type: 'text', get: (l) => l.payee_raw },
        { key: 'description', type: 'text', get: (l) => l.description_raw },
        { key: 'spent', type: 'currency', get: (l) => (l.credit_debit_indicator === 'debit' ? Number(l.amount_cents) : null) },
        { key: 'received', type: 'currency', get: (l) => (l.credit_debit_indicator === 'credit' ? Number(l.amount_cents) : null) },
        { key: 'status', type: 'text', get: (l) => statusLabel(l) },
        { key: 'source', type: 'text', get: (l) => l.source },
        null,
      ],
      onChange: () => renderStatements(),
    }) : null;

  function statusLabel(l) {
    if (l.status === 'confirmed') return l.coding_source === 'rule' ? 'Matched by rule' : 'Matched';
    if (l.status === 'transfer_pending') return 'Transfer pending';
    return l.pending ? 'Pending at bank' : 'Waiting to match';
  }
  function statusColor(l) {
    if (l.status === 'confirmed') return 'var(--green, #15803d)';
    if (l.status === 'transfer_pending') return 'var(--text-secondary)';
    return 'var(--amber, #b45309)';
  }

  async function loadStatements() {
    const acct = acctSelect && acctSelect.value;
    const tbody = $('organizational-statements-tbody');
    if (!acct) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="8">Pick a bank account.</td></tr>'; setText('organizational-statements-summary', ''); return; }
    setText('organizational-statements-error', '', false);
    const params = new URLSearchParams({ bank_account_id: acct, status: $('organizational-statements-status').value });
    const q = $('organizational-statements-q').value.trim();
    if (q) params.set('q', q);
    if ($('organizational-statements-from').value) params.set('from', $('organizational-statements-from').value);
    if ($('organizational-statements-to').value) params.set('to', $('organizational-statements-to').value);
    const min = $('organizational-statements-min').value.trim();
    let max = $('organizational-statements-max').value.trim();
    if ($('organizational-statements-exact').checked && min) max = min;
    if (min) params.set('min', min);
    if (max) params.set('max', max);
    const out = await apiJson(base() + '/bank-statement-lines/browse?' + params.toString());
    if (!out) return;
    if (!out.res.ok) { setText('organizational-statements-error', (out.data && out.data.error) || 'Could not load statement lines.', true); return; }
    statements = out.data.lines || [];
    const c = out.data.counts || {};
    const total = (c.unconfirmed || 0) + (c.confirmed || 0) + (c.transfer_pending || 0);
    setText('organizational-statements-summary',
      (c.confirmed || 0) + ' matched \u00b7 ' + (c.unconfirmed || 0) + ' waiting' + (c.transfer_pending ? ' \u00b7 ' + c.transfer_pending + ' transfer pending' : '')
      + (statements.length !== total ? ' \u00b7 showing ' + statements.length : '') + (out.data.truncated ? ' (first ' + out.data.cap + ')' : ''));
    renderStatements();
  }

  function renderStatements() {
    const tbody = $('organizational-statements-tbody');
    if (!statements.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="8">No statement lines match.</td></tr>'; return; }
    const rows = statSorter ? statSorter.sortRows(statements) : statements;
    tbody.innerHTML = rows.map((l) => {
      const debit = l.credit_debit_indicator === 'debit';
      const cents = String(l.amount_cents);
      let entry = '—';
      if (l.status === 'confirmed') {
        if ((l.posting_count || 0) > 1) entry = l.posting_count + ' entries';
        else if (l.ledger_transaction_id) {
          entry = '<a href="#" class="bankviews-open" data-txn="' + l.ledger_transaction_id + '">#' + l.ledger_transaction_id + '</a>'
            + (l.txn_status === 'voided' ? ' (voided)' : '');
        }
        if (canWrite) {
          const b = (cls, txt) => ' <button type="button" class="' + cls + ' organizational-btn organizational-btn-outline" data-line="' + l.id + '" style="height:24px;font-size:0.75rem;padding:0 8px;margin-left:6px;">' + txt + '</button>';
          entry += b('bankviews-unrec', 'Unreconcile') + b('bankviews-voidret', 'Void and return');
        }
      } else if (l.status === 'transfer_pending' && canWrite) {
        entry = '<button type="button" class="bankviews-unrec organizational-btn organizational-btn-outline" data-line="' + l.id + '" style="height:24px;font-size:0.75rem;padding:0 8px;">Undo transfer</button>';
      }
      const via = (l.source === 'plaid' ? 'Bank feed' : 'File import') + ' · ' + esc(String(l.created_at || '').slice(0, 10));
      return '<tr>'
        + '<td>' + esc(String(l.statement_date || '').slice(0, 10)) + '</td>'
        + '<td>' + esc(l.payee_raw || '') + '</td>'
        + '<td>' + esc(l.description_raw || '') + '</td>'
        + '<td style="text-align:right;">' + (debit ? money(cents) : '—') + '</td>'
        + '<td style="text-align:right;">' + (debit ? '—' : money(cents)) + '</td>'
        + '<td style="color:' + statusColor(l) + ';">' + esc(statusLabel(l)) + '</td>'
        + '<td>' + via + '</td>'
        + '<td>' + entry + '</td>'
        + '</tr>';
    }).join('');
  }

  let regLines = [];
  let regSelected = new Set();
  const regSorter = window.OrganizationalTableSort && $('organizational-register-tbody')
    ? window.OrganizationalTableSort.attach($('organizational-register-tbody').closest('table'), {
      columns: [
        null,
        { key: 'date', type: 'date', get: (l) => l.date },
        { key: 'contact', type: 'text', get: (l) => l.contact },
        { key: 'memo', type: 'text', get: (l) => l.memo },
        { key: 'reference', type: 'text', get: (l) => l.reference },
        { key: 'related', type: 'text', get: (l) => l.related_account },
        { key: 'program', type: 'text', get: (l) => l.program },
        { key: 'grant', type: 'text', get: (l) => l.grant },
        { key: 'spent', type: 'currency', get: (l) => (l.spent_cents !== '0' ? Number(l.spent_cents) : null) },
        { key: 'received', type: 'currency', get: (l) => (l.received_cents !== '0' ? Number(l.received_cents) : null) },
        { key: 'balance', type: 'currency', get: (l) => Number(l.balance_cents) },
        { key: 'status', type: 'text', get: (l) => (l.reconciled ? 'Reconciled' : 'Not reconciled') },
      ],
      onChange: () => renderRegister(),
    }) : null;

  async function loadRegister() {
    const acct = acctSelect && acctSelect.value;
    const tbody = $('organizational-register-tbody');
    regSelected = new Set();
    updateSelection();
    if (!acct) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="12">Pick a bank account.</td></tr>'; setText('organizational-register-summary', ''); return; }
    setText('organizational-register-error', '', false);
    const params = new URLSearchParams({ rec: $('organizational-register-rec').value });
    const q = $('organizational-register-q').value.trim();
    if (q) params.set('q', q);
    if ($('organizational-register-from').value) params.set('from', $('organizational-register-from').value);
    if ($('organizational-register-to').value) params.set('to', $('organizational-register-to').value);
    if ($('organizational-register-min').value.trim()) params.set('min', $('organizational-register-min').value.trim());
    if ($('organizational-register-max').value.trim()) params.set('max', $('organizational-register-max').value.trim());
    const out = await apiJson(base() + '/bank-accounts/' + encodeURIComponent(acct) + '/register?' + params.toString());
    if (!out) return;
    if (!out.res.ok) { setText('organizational-register-error', (out.data && out.data.error) || 'Could not load the register.', true); return; }
    const d = out.data;
    regLines = d.lines || [];
    if (!$('organizational-register-from').value) $('organizational-register-from').value = d.from;
    if (!$('organizational-register-to').value) $('organizational-register-to').value = d.to;
    const sumEl = $('organizational-register-summary');
    setText('organizational-register-summary', money(d.opening_cents) + ' \u2192 ' + money(d.closing_cents) + ' \u00b7 ' + regLines.length + (regLines.length === d.line_count ? '' : ' of ' + d.line_count) + ' entries' + (d.truncated ? ' (first ' + d.cap + ')' : ''));
    if (sumEl) sumEl.title = d.account.code + ' ' + d.account.name + ': balance before ' + d.from + ' ' + money(d.opening_cents) + '; balance at ' + d.to + ' ' + money(d.closing_cents) + '. Posted entries only.';
    renderRegister();
  }

  function renderRegister() {
    const tbody = $('organizational-register-tbody');
    if (!regLines.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="12">No entries match.</td></tr>'; return; }
    const rows = regSorter ? regSorter.sortRows(regLines) : regLines;
    tbody.innerHTML = rows.map((l) => (
      '<tr class="bankviews-reg-row" data-txn="' + l.transaction_id + '" style="cursor:pointer;">'
      + '<td><input type="checkbox" class="bankviews-reg-check" data-line="' + l.line_id + '"' + (regSelected.has(l.line_id) ? ' checked' : '') + ' aria-label="Select entry ' + l.transaction_id + '"></td>'
      + '<td style="white-space:nowrap;"><a href="#" class="bankviews-open" data-txn="' + l.transaction_id + '">' + esc(l.date) + '</a></td>'
      + '<td>' + esc(l.contact) + '</td>'
      + '<td>' + esc(l.memo) + '</td>'
      + '<td>' + esc(l.reference) + '</td>'
      + '<td>' + esc(l.related_account) + '</td>'
      + '<td>' + esc(l.program) + '</td>'
      + '<td>' + esc(l.grant) + '</td>'
      + '<td style="text-align:right;">' + cell(l.spent_cents) + '</td>'
      + '<td style="text-align:right;">' + cell(l.received_cents) + '</td>'
      + '<td style="text-align:right;">' + money(l.balance_cents) + '</td>'
      + '<td style="color:' + (l.reconciled ? 'var(--green, #15803d)' : 'var(--text-secondary)') + ';">' + (l.reconciled ? 'Reconciled' : 'Not reconciled') + '</td>'
      + '</tr>'
    )).join('');
  }

  function selectedRows() { return regLines.filter((l) => regSelected.has(l.line_id)); }
  function updateSelection() {
    const sel = selectedRows();
    const rec = sel.filter((l) => l.reconciled).length;
    const unrec = sel.length - rec;
    setText('organizational-register-selcount', sel.length ? sel.length + ' selected' : 'No entries selected');
    $('organizational-register-unreconcile').disabled = !(canWrite && rec);
    $('organizational-register-void').disabled = !(canWrite && sel.length);
    $('organizational-register-unreconcile').hidden = !canWrite;
    $('organizational-register-void').hidden = !canWrite;
    const all = $('organizational-register-select-all');
    if (all) all.checked = regLines.length > 0 && sel.length === regLines.length;
  }

  function startUnreconcile() {
    const sel = selectedRows().filter((l) => l.reconciled);
    const ids = [...new Set(sel.map((l) => l.statement_line_id))];
    if (!ids.length) return;
    const skipped = selectedRows().length - sel.length;
    askReason('organizational-banking-view-register',
      'Unreconcile ' + ids.length + ' bank line' + (ids.length === 1 ? '' : 's') + '. The entries stay in the books as not reconciled; the bank lines go back to Reconcile, where each entry is offered as a match.'
      + (skipped ? ' ' + skipped + ' selected entr' + (skipped === 1 ? 'y is' : 'ies are') + ' not reconciled and will be left alone.' : ''),
      async (reason) => {
        const r = await unreconcileLines(ids, reason, true);
        setText('organizational-register-error', r.failed.join(' '), true);
        await loadRegister();
        if (r.ok) setText('organizational-register-summary', unreconcileMessage(r));
      });
  }

  function startVoid() {
    const sel = selectedRows();
    if (!sel.length) return;
    const recLines = [...new Set(sel.filter((l) => l.reconciled).map((l) => l.statement_line_id))];
    const plainIds = [...new Set(sel.filter((l) => !l.reconciled).map((l) => l.transaction_id))];
    askReason('organizational-banking-view-register',
      'Void ' + sel.length + ' entr' + (sel.length === 1 ? 'y' : 'ies') + '. A voided entry stays in the history and drops out of balances.'
      + (recLines.length ? ' ' + recLines.length + ' reconciled bank line' + (recLines.length === 1 ? '' : 's') + ' will go back to Reconcile to be coded again.' : ''),
      async (reason) => {
        const failed = [];
        let done = 0;
        if (recLines.length) {
          const r = await unreconcileLines(recLines, reason, false);
          done += r.ok;
          failed.push(...r.failed);
        }
        for (const id of plainIds) {
          const out = await apiJson(base() + '/ledger/transactions/' + id + '/void', { method: 'POST', body: JSON.stringify({ void_reason: reason }) });
          if (out && out.res.ok) done += 1;
          else failed.push('#' + id + ': ' + ((out && out.data && (out.data.message || out.data.error)) || 'could not void'));
        }
        setText('organizational-register-error', failed.join(' '), true);
        await loadRegister();
        if (done) setText('organizational-register-summary', done + ' voided.');
      });
  }

  function wireToggle(prefix, onOpen) {
    const btn = $(prefix + '-toggle');
    const panel = $(prefix + '-filters');
    const set = (open) => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && onOpen) onOpen();
    };
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => set(panel.hidden));
    $(prefix + '-close').addEventListener('click', () => set(false));
  }

  function unreconcileWithReason(lineId, sectionId, afterFn) {
    askReason(sectionId,
      'Unreconcile this bank line. The entry stays in the books as not reconciled and the line goes back to Reconcile, where the entry is offered as a match. A line only marked as a transfer just loses the mark.',
      async (reason) => {
        const r = await unreconcileLines([lineId], reason, true);
        if (r.failed.length) window.alert(r.failed.join(' '));
        if (afterFn) await afterFn(r);
      });
  }

  let rmPeriods = null;
  let rmOpen = null;

  function rmBase() { return base() + '/bank-accounts/' + encodeURIComponent(acctSelect.value) + '/periods'; }
  function rmShowList() { $('organizational-reconcilemonth-list-wrap').hidden = false; $('organizational-reconcilemonth-detail').hidden = true; rmOpen = null; }
  function fmtDay(iso) { const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }

  async function loadReconcileMonth() {
    rmShowList();
    const tbody = $('organizational-reconcilemonth-tbody');
    if (!acctSelect || !acctSelect.value) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">Pick a bank account.</td></tr>'; setText('organizational-reconcilemonth-summary', ''); return; }
    setText('organizational-reconcilemonth-error', '', false);
    const out = await apiJson(rmBase());
    if (!out) return;
    if (!out.res.ok) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">' + esc((out.data && out.data.error) || 'Could not load periods.') + '</td></tr>'; return; }
    rmPeriods = out.data;
    const closed = rmPeriods.periods.filter((p) => p.status === 'closed');
    setText('organizational-reconcilemonth-summary', closed.length ? 'Closed through ' + fmtDay(closed[0].period_end) : 'No closed periods yet');
    $('organizational-reconcilemonth-new').hidden = !canWrite || !rmPeriods.next;
    $('organizational-reconcilemonth-form').hidden = true;
    if (!rmPeriods.periods.length) { tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="5">No periods yet.</td></tr>'; return; }
    tbody.innerHTML = rmPeriods.periods.map((p) => '<tr class="bankviews-rm-row" data-id="' + p.id + '" style="cursor:pointer;">'
      + '<td>' + esc(fmtDay(p.period_start)) + ' – ' + esc(fmtDay(p.period_end)) + '</td>'
      + '<td style="text-align:right;">' + money(p.opening_cents) + '</td><td style="text-align:right;">' + money(p.closing_cents) + '</td>'
      + '<td style="color:' + (p.status === 'closed' ? 'var(--green, #15803d)' : 'var(--amber, #b45309)') + ';">' + (p.status === 'closed' ? 'Closed' : 'Draft') + '</td>'
      + '<td><a href="#" class="bankviews-rm-open" data-id="' + p.id + '">' + (p.status === 'closed' ? 'Report' : 'Continue') + '</a></td></tr>').join('');
  }

  function rmOpenForm() {
    const n = rmPeriods && rmPeriods.next; if (!n) return;
    $('organizational-reconcilemonth-start').value = n.period_start;
    $('organizational-reconcilemonth-end').value = n.period_end;
    const op = $('organizational-reconcilemonth-opening');
    op.value = n.opening_cents != null ? (Number(n.opening_cents) / 100).toFixed(2) : '';
    op.disabled = !!n.opening_locked;
    op.title = n.opening_locked ? 'Carried from the previous closed period' : '';
    $('organizational-reconcilemonth-closing').value = '';
    $('organizational-reconcilemonth-form').hidden = false;
    $('organizational-reconcilemonth-closing').focus();
  }

  async function rmCreate() {
    setText('organizational-reconcilemonth-error', '', false);
    const body = { period_start: $('organizational-reconcilemonth-start').value, period_end: $('organizational-reconcilemonth-end').value, closing_balance: $('organizational-reconcilemonth-closing').value };
    if (!$('organizational-reconcilemonth-opening').disabled) body.opening_balance = $('organizational-reconcilemonth-opening').value;
    const out = await apiJson(rmBase(), { method: 'POST', body: JSON.stringify(body) });
    if (!out) return;
    if (!out.res.ok) { setText('organizational-reconcilemonth-error', (out.data && out.data.error) || 'Could not start the period.', true); return; }
    await rmOpenPeriod(out.data.id);
  }

  async function rmOpenPeriod(id) {
    const out = await apiJson(rmBase() + '/' + id);
    if (!out) return;
    if (!out.res.ok) { setText('organizational-reconcilemonth-error', (out.data && out.data.error) || 'Could not open the period.', true); return; }
    rmOpen = { id, data: out.data };
    $('organizational-reconcilemonth-list-wrap').hidden = true;
    $('organizational-reconcilemonth-detail').hidden = false;
    rmRender();
  }

  function rmTable(headers, rows, empty) {
    return '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr>' + headers.map((h) => '<th' + (h.right ? ' style="text-align:right;"' : '') + '>' + esc(h.t) + '</th>').join('') + '</tr></thead><tbody>'
      + (rows.length ? rows.join('') : '<tr class="organizational-table-empty"><td colspan="' + headers.length + '">' + esc(empty) + '</td></tr>') + '</tbody></table></div>';
  }
  function rmSections(rep) {
    const out = (list) => list.map((o) => '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.description) + '</td><td>' + esc(o.reference) + '</td><td style="text-align:right;">' + money(o.amount_cents) + '</td></tr>');
    const oh = [{ t: 'Date' }, { t: 'Description' }, { t: 'Reference' }, { t: 'Amount', right: true }];
    return '<div style="padding:12px 16px 0;font-weight:600;">Outstanding payments (' + rep.outstanding_payments.length + ')</div>'
      + '<p class="organizational-hint" style="margin:0;padding:0 16px 4px;">In the books, not yet on the statement.</p>'
      + rmTable(oh, out(rep.outstanding_payments), 'None.')
      + '<div style="padding:12px 16px 0;font-weight:600;">Outstanding deposits (' + rep.outstanding_deposits.length + ')</div>'
      + rmTable(oh, out(rep.outstanding_deposits), 'None.')
      + '<div style="padding:12px 16px 0;font-weight:600;">Reconciled bank lines (' + rep.reconciled.length + ')</div>'
      + rmTable([{ t: 'Date' }, { t: 'Payee' }, { t: 'Description' }, { t: 'Account' }, { t: 'Spent', right: true }, { t: 'Received', right: true }],
        rep.reconciled.map((l) => '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.payee) + '</td><td>' + esc(l.description) + '</td><td>' + esc(l.related_accounts) + '</td><td style="text-align:right;">' + cell(l.spent_cents) + '</td><td style="text-align:right;">' + cell(l.received_cents) + '</td></tr>'), 'No reconciled lines in this period.');
  }

  function rmRender() {
    const d = rmOpen.data, p = d.period, rep = d.report;
    const el = $('organizational-reconcilemonth-detail');
    const head = '<div style="padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);">'
      + '<a href="#" id="bankviews-rm-back">← Periods</a><strong>' + esc(fmtDay(p.period_start)) + ' – ' + esc(fmtDay(p.period_end)) + '</strong>'
      + '<span style="font-size:0.75rem;border:1px solid var(--border);border-radius:4px;padding:1px 6px;">' + (p.status === 'closed' ? 'Closed' : 'Draft') + '</span><span style="flex:1;"></span>'
      + (p.status === 'closed' ? '<button type="button" class="organizational-btn organizational-btn-outline" id="bankviews-rm-print" style="height:30px;font-size:0.8125rem;padding:0 12px;">Print or save as PDF</button>'
        + '<button type="button" class="organizational-btn organizational-btn-outline" id="bankviews-rm-csv" style="height:30px;font-size:0.8125rem;padding:0 12px;">Download CSV</button>'
        + (canWrite && d.can_reopen ? '<button type="button" class="organizational-btn organizational-btn-outline" id="bankviews-rm-reopen" style="height:30px;font-size:0.8125rem;padding:0 12px;">Reopen</button>' : '') : '')
      + '</div><p class="organizational-panel-error" id="bankviews-rm-error" hidden style="margin:8px 16px;"></p>';
    if (p.status === 'closed') {
      const row = (a, b, bold) => '<tr><td' + (bold ? ' style="font-weight:600;"' : '') + '>' + esc(a) + '</td><td style="text-align:right;' + (bold ? 'font-weight:600;' : '') + '">' + b + '</td></tr>';
      el.innerHTML = head
        + '<div style="padding:12px 16px;max-width:520px;"><table class="organizational-table"><tbody>'
        + row('Statement opening balance, ' + fmtDay(rep.period_start), money(rep.opening_cents))
        + row('Less payments in the period (' + rep.payments_count + ')', money(rep.payments_cents))
        + row('Plus deposits in the period (' + rep.deposits_count + ')', money(rep.deposits_cents))
        + row('Statement closing balance, ' + fmtDay(rep.period_end), money(rep.closing_cents), true)
        + row('Difference', money(rep.difference_cents))
        + row('Balance in the books at ' + fmtDay(rep.period_end), money(rep.books_balance_end_cents))
        + '</tbody></table><p class="organizational-hint">Closed ' + esc(String(rep.closed_on || '').slice(0, 10)) + (rep.closed_by ? ' by ' + esc(rep.closed_by) : '') + '. Saved as it was on that day.</p></div>'
        + rmSections(rep);
      return;
    }
    const diffOk = rep.difference_cents === '0';
    const box = (label, inner) => '<div style="min-width:130px;"><div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:2px;">' + label + '</div>' + inner + '</div>';
    const op = (id, v, dis) => '<input type="text" inputmode="decimal" id="' + id + '" class="organizational-input" value="' + (Number(v) / 100).toFixed(2) + '"' + (dis ? ' disabled' : '') + ' style="height:30px;box-sizing:border-box;font-size:0.8125rem;padding:0 8px;width:130px;text-align:right;">';
    const ro = (v) => '<div style="height:30px;line-height:30px;font-size:0.875rem;text-align:right;width:130px;">' + money(v) + '</div>';
    const sign = (t) => '<div style="align-self:flex-end;height:30px;line-height:30px;font-size:1rem;">' + t + '</div>';
    const locked = !!(rmPeriods && rmPeriods.latest_closed_id);
    el.innerHTML = head
      + '<div style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);">'
      + box('Opening statement balance', op('bankviews-rm-opening', rep.opening_cents, !canWrite || locked)) + sign('−')
      + box('Payments (' + rep.payments_count + ')', ro(rep.payments_cents)) + sign('+')
      + box('Deposits (' + rep.deposits_count + ')', ro(rep.deposits_cents)) + sign('=')
      + box('Period balance', ro(rep.period_balance_cents)) + sign('−')
      + box('Closing statement balance', op('bankviews-rm-closing', rep.closing_cents, !canWrite)) + sign('=')
      + box(diffOk ? 'Balances match' : 'Difference', '<div style="height:30px;line-height:30px;font-size:1rem;font-weight:600;color:' + (diffOk ? 'var(--green, #15803d)' : 'var(--red, #b91c1c)') + ';">' + (diffOk ? '✓ ' : '') + money(rep.difference_cents) + '</div>')
      + '</div>'
      + (rep.waiting_lines ? '<p class="organizational-hint" style="margin:0;padding:8px 16px;">' + rep.waiting_lines + ' bank line' + (rep.waiting_lines === 1 ? '' : 's') + ' in this period still need matching. <a href="#" id="bankviews-rm-togo">Go to Reconcile</a></p>' : '')
      + rmSections(rep)
      + (canWrite ? '<div style="position:sticky;bottom:0;padding:10px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border);background:var(--surface-card);">'
        + '<button type="button" class="organizational-btn organizational-btn-outline" id="bankviews-rm-discard">Discard draft</button>'
        + '<button type="button" class="organizational-btn organizational-btn-primary" id="bankviews-rm-close">Close period</button></div>' : '');
  }

  async function rmSaveBalances() {
    const body = { closing_balance: $('bankviews-rm-closing').value };
    const op = $('bankviews-rm-opening');
    if (op && !op.disabled) body.opening_balance = op.value;
    const out = await apiJson(rmBase() + '/' + rmOpen.id, { method: 'PATCH', body: JSON.stringify(body) });
    if (out && !out.res.ok) { setText('bankviews-rm-error', (out.data && out.data.error) || 'Could not save.', true); return; }
    await rmOpenPeriod(rmOpen.id);
  }

  function rmReportRows(rep) {
    const rows = [['Bank reconciliation', rep.account ? rep.account.code + ' ' + rep.account.name : ''], ['Period', rep.period_start + ' to ' + rep.period_end], [],
      ['Statement opening balance', (rep.opening_cents / 100).toFixed(2)], ['Less payments', (rep.payments_cents / 100).toFixed(2)], ['Plus deposits', (rep.deposits_cents / 100).toFixed(2)],
      ['Statement closing balance', (rep.closing_cents / 100).toFixed(2)], ['Difference', (rep.difference_cents / 100).toFixed(2)], ['Balance in the books at period end', (rep.books_balance_end_cents / 100).toFixed(2)], [],
      ['Outstanding payments'], ['Date', 'Description', 'Reference', 'Amount']];
    rep.outstanding_payments.forEach((o) => rows.push([o.date, o.description, o.reference, (o.amount_cents / 100).toFixed(2)]));
    rows.push([], ['Outstanding deposits'], ['Date', 'Description', 'Reference', 'Amount']);
    rep.outstanding_deposits.forEach((o) => rows.push([o.date, o.description, o.reference, (o.amount_cents / 100).toFixed(2)]));
    rows.push([], ['Reconciled bank lines'], ['Date', 'Payee', 'Description', 'Account', 'Spent', 'Received']);
    rep.reconciled.forEach((l) => rows.push([l.date, l.payee, l.description, l.related_accounts, l.spent_cents !== '0' ? (l.spent_cents / 100).toFixed(2) : '', l.received_cents !== '0' ? (l.received_cents / 100).toFixed(2) : '']));
    return rows;
  }
  function rmDownloadCsv() {
    const rep = rmOpen.data.report;
    const csv = rmReportRows(rep).map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'reconcile-month-' + rep.period_end + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function rmPrint() {
    const rep = rmOpen.data.report;
    const rows = rmReportRows(rep).map((r) => '<tr>' + (r.length ? r.map((c) => '<td>' + esc(c) + '</td>').join('') : '<td>&nbsp;</td>') + '</tr>').join('');
    const w = window.open('', '_blank');
    if (!w) { setText('bankviews-rm-error', 'Allow pop-ups to print the report.', true); return; }
    w.document.write('<!doctype html><title>Bank reconciliation ' + esc(rep.period_end) + '</title><style>body{font:13px system-ui,sans-serif;margin:24px}td{padding:3px 12px 3px 0;border-bottom:1px solid #ddd;vertical-align:top}</style>'
      + '<table>' + rows + '</table><p style="margin-top:32px">Prepared by: ' + esc(rep.closed_by || '') + ' &nbsp;&nbsp; Reviewed by: ____________ &nbsp;&nbsp; Date: ____________</p>');
    w.document.close();
    w.focus(); w.print();
  }

  function refreshActive() {
    if (currentView === 'statements') loadStatements();
    else if (currentView === 'register') loadRegister();
    else if (currentView === 'reconcile-month') loadReconcileMonth();
  }

  function wire() {
    if (wired) return;
    wired = true;
    document.addEventListener('banking:view', (e) => { currentView = e.detail.view; refreshActive(); });
    document.addEventListener('ledger:changed', () => { if (currentView === 'register') loadRegister(); });
    if (acctSelect) acctSelect.addEventListener('change', refreshActive);

    wireToggle('organizational-statements', () => $('organizational-statements-q').focus());
    wireToggle('organizational-register', () => $('organizational-register-q').focus());

    const enter = (id, fn) => { const el = $(id); if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(); }); };
    $('organizational-statements-run').addEventListener('click', loadStatements);
    $('organizational-statements-status').addEventListener('change', loadStatements);
    ['q', 'min', 'max'].forEach((k) => enter('organizational-statements-' + k, loadStatements));
    $('organizational-statements-clear').addEventListener('click', () => {
      ['q', 'from', 'to', 'min', 'max'].forEach((k) => { $('organizational-statements-' + k).value = ''; });
      $('organizational-statements-exact').checked = false;
      $('organizational-statements-status').value = 'all';
      loadStatements();
    });

    $('organizational-reconcilemonth-new').addEventListener('click', rmOpenForm);
    $('organizational-reconcilemonth-form-cancel').addEventListener('click', () => { $('organizational-reconcilemonth-form').hidden = true; });
    $('organizational-reconcilemonth-create').addEventListener('click', rmCreate);
    $('organizational-reconcilemonth-tbody').addEventListener('click', (e) => {
      const row = e.target.closest('.bankviews-rm-row');
      if (row) { e.preventDefault(); rmOpenPeriod(Number(row.getAttribute('data-id'))); }
    });
    $('organizational-reconcilemonth-detail').addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#bankviews-rm-back')) { e.preventDefault(); loadReconcileMonth(); return; }
      if (t.closest('#bankviews-rm-togo')) { e.preventDefault(); const tab = document.querySelector('#organizational-banking-view-tabs [data-view="reconcile"]'); if (tab) tab.click(); return; }
      if (t.closest('#bankviews-rm-csv')) { rmDownloadCsv(); return; }
      if (t.closest('#bankviews-rm-print')) { rmPrint(); return; }
      if (t.closest('#bankviews-rm-close')) {
        setText('bankviews-rm-error', '', false);
        const out = await apiJson(rmBase() + '/' + rmOpen.id + '/close', { method: 'POST' });
        if (out && out.res.ok) await rmOpenPeriod(rmOpen.id);
        else if (out) setText('bankviews-rm-error', (out.data && out.data.error) || 'Could not close the period.', true);
        return;
      }
      const discard = t.closest('#bankviews-rm-discard');
      if (discard) {
        if (!discard.dataset.armed) {
          discard.dataset.armed = '1'; discard.textContent = 'Click again to discard';
          setTimeout(() => { delete discard.dataset.armed; discard.textContent = 'Discard draft'; }, 4000);
          return;
        }
        const out = await apiJson(rmBase() + '/' + rmOpen.id, { method: 'DELETE' });
        if (out && out.res.ok) await loadReconcileMonth();
        else if (out) setText('bankviews-rm-error', (out.data && out.data.error) || 'Could not discard.', true);
        return;
      }
      if (t.closest('#bankviews-rm-reopen')) {
        askReason('organizational-reconcilemonth-detail', 'Reopen this period. The saved report is replaced when you close it again, and bank lines in it can be changed meanwhile.', async (reason) => {
          const out = await apiJson(rmBase() + '/' + rmOpen.id + '/reopen', { method: 'POST', body: JSON.stringify({ reason }) });
          if (out && out.res.ok) await rmOpenPeriod(rmOpen.id);
          else if (out) setText('bankviews-rm-error', (out.data && out.data.error) || 'Could not reopen.', true);
        });
      }
    });
    $('organizational-reconcilemonth-detail').addEventListener('change', (e) => {
      if (e.target.id === 'bankviews-rm-closing' || e.target.id === 'bankviews-rm-opening') rmSaveBalances();
    });

    $('organizational-register-run').addEventListener('click', loadRegister);
    $('organizational-register-rec').addEventListener('change', loadRegister);
    ['q', 'min', 'max'].forEach((k) => enter('organizational-register-' + k, loadRegister));
    $('organizational-register-clear').addEventListener('click', () => {
      ['q', 'from', 'to', 'min', 'max'].forEach((k) => { $('organizational-register-' + k).value = ''; });
      $('organizational-register-rec').value = 'all';
      loadRegister();
    });
    $('organizational-register-unreconcile').addEventListener('click', startUnreconcile);
    $('organizational-register-void').addEventListener('click', startVoid);
    $('organizational-register-select-all').addEventListener('change', (e) => {
      regSelected = e.target.checked ? new Set(regLines.map((l) => l.line_id)) : new Set();
      renderRegister();
      updateSelection();
    });

    $('organizational-register-tbody').addEventListener('click', (e) => {
      const link = e.target.closest('.bankviews-open');
      if (link) { e.preventDefault(); openEntry(Number(link.getAttribute('data-txn'))); return; }
      const check = e.target.closest('.bankviews-reg-check');
      if (check) {
        const id = Number(check.getAttribute('data-line'));
        if (check.checked) regSelected.add(id); else regSelected.delete(id);
        updateSelection();
        return;
      }
      const row = e.target.closest('.bankviews-reg-row');
      if (row) openEntry(Number(row.getAttribute('data-txn')));
    });

    $('organizational-statements-tbody').addEventListener('click', (e) => {
      const link = e.target.closest('.bankviews-open');
      if (link) { e.preventDefault(); openEntry(Number(link.getAttribute('data-txn'))); return; }
      const btn = e.target.closest('.bankviews-unrec, .bankviews-voidret');
      if (btn) {
        const id = Number(btn.getAttribute('data-line'));
        const keep = btn.classList.contains('bankviews-unrec') && !isTransferPending(id);
        askReason('organizational-banking-view-statements',
          btn.classList.contains('bankviews-voidret')
            ? 'Void and return. The entry this bank line created is voided (reversed, if its year is locked) and the line goes back to Reconcile to be coded again.'
            : 'Unreconcile. The entry stays in the books as not reconciled and the bank line goes back to Reconcile, where the entry is offered as a match.',
          async (reason) => {
            const r = await unreconcileLines([id], reason, keep);
            setText('organizational-statements-error', r.failed.join(' '), true);
            await loadStatements();
            if (r.ok) setText('organizational-statements-summary', unreconcileMessage(r));
          });
      }
    });
  }

  function isTransferPending(lineId) {
    const l = statements.find((x) => x.id === lineId);
    return !!(l && l.status === 'transfer_pending' && !l.ledger_transaction_id);
  }

  async function init(s) {
    slug = s;
    const access = window.OrganizationalMyAccess ? await window.OrganizationalMyAccess(slug) : null;
    canWrite = !!(access && access.can_write_accounting);
    wire();
    updateSelection();
    const qp = new URLSearchParams(window.location.search);
    const accountParam = qp.get('account');
    if (accountParam && acctSelect && [...acctSelect.options].some((o) => o.value === accountParam)) {
      acctSelect.value = accountParam;
      acctSelect.dispatchEvent(new Event('change'));
    }
    const viewParam = qp.get('view');
    const tab = viewParam && document.querySelector('#organizational-banking-view-tabs [data-view="' + viewParam + '"]');
    if (tab) tab.click();
  }

  window.OrganizationalAccounting.bankViews = { init, unreconcileWithReason };
})();
