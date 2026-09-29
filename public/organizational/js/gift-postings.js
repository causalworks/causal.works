/* gift-postings.js — Accounting-side review queue for in-kind gifts and pledge commitments
 * recorded in Donors (Fundraising). Donors never posts to the ledger itself; this tab is where
 * that actually happens, mirroring Bank Reconciliation's unconfirmed-lines -> explicit Create
 * pattern. See server/organizational/lib/giftPosting.js / routes/giftPostings.js.
 *
 * Registers window.OrganizationalAccounting.giftPostings.init(slug), called eagerly by
 * accounting-workspace.js alongside every other Accounting tab.
 */
(function () {
  'use strict';

  window.OrganizationalAccounting = window.OrganizationalAccounting || {};

  const esc = window.escapeHtml;
  const apiJson = window.apiJson;

  const tbody = document.getElementById('organizational-giftpostings-tbody');
  const postPanel = document.getElementById('organizational-giftpostings-post-panel');
  const runPanel = document.getElementById('organizational-giftpostings-run-panel');
  const runAccretionBtn = document.getElementById('organizational-giftpostings-run-accretion-btn');
  const runRecoveryBtn = document.getElementById('organizational-giftpostings-run-recovery-btn');

  let currentSlug = '';
  let accounts = [];
  let programs = [];
  let wired = false;

  function fmtUsd(cents) {
    const n = Number(cents);
    return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100) : '—';
  }
  function acctOpts(filterFn, selectedId) {
    return accounts.filter(filterFn).map((a) =>
      '<option value="' + a.id + '"' + (String(a.id) === String(selectedId) ? ' selected' : '') + '>' +
      esc(a.code ? a.code + ' — ' + a.name : a.name) + '</option>'
    ).join('');
  }
  function programOpts(selectedId) {
    return '<option value="">— select —</option>' + programs.map((p) =>
      '<option value="' + p.id + '"' + (String(p.id) === String(selectedId) ? ' selected' : '') + '>' + esc(p.name) + '</option>'
    ).join('');
  }

  async function loadFieldOptions() {
    const [acctOut, progOut] = await Promise.all([
      apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/accounts', { method: 'GET' }),
      apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/programs', { method: 'GET' }),
    ]);
    const allAccounts = (acctOut && acctOut.res.ok && acctOut.data && acctOut.data.accounts) || [];
    // Same system-account exclusion as Find & Recode -- these should never be pickable as a
    // gift-posting target either.
    accounts = allAccounts.filter((a) => a.is_posting
      && !a.is_system_ap_account && !a.is_system_ar_account && !a.is_system_clearing_account
      && !a.is_system_expense_claims_payable_account);
    const progData = (progOut && progOut.res.ok && progOut.data) || {};
    programs = progData.programs || (Array.isArray(progData) ? progData : []);
  }

  async function loadPending() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings', { method: 'GET' });
    const rows = (out && out.res.ok && out.data && out.data.gift_postings) || [];
    renderRows(rows);
  }

  function renderRows(rows) {
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">No gifts pending posting.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((g) => {
      const isInKind = !!g.in_kind;
      const isCashGrant = !!g.is_cash_grant;
      const typeLabel = isCashGrant ? 'Grant (cash)' : (isInKind ? 'In-kind' : 'Pledge');
      const details = isCashGrant
        ? 'Awaiting deposit — match in Bank Reconciliation, or link an already-posted transaction'
        : isInKind
          ? esc(g.in_kind.description || '') + (g.in_kind.valuation_method ? ' (' + esc(g.in_kind.valuation_method) + ')' : '')
          : (g.pledge && g.pledge.is_multi_year_pledge
              ? 'Multi-year, PV ' + fmtUsd(g.pledge.discounted_present_value_cents) + ' of ' + fmtUsd(g.pledge.total_pledged_cents)
              : 'Pledge, ' + fmtUsd(g.pledge ? g.pledge.total_pledged_cents : g.amount_cents));
      const btnLabel = isCashGrant ? 'Link…' : 'Review…';
      return '<tr data-id="' + g.id + '">' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + esc((g.received_at || '').slice(0, 10)) + '</td>' +
        '<td>' + esc(g.constituent_name || '—') + '</td>' +
        '<td>' + fmtUsd(g.amount_cents) + '</td>' +
        '<td style="font-size:0.8125rem;color:var(--text-secondary);">' + details + '</td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-giftpostings-review-btn" data-id="' + g.id + '">' + btnLabel + '</button></td>' +
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.organizational-giftpostings-review-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gift = rows.find((g) => String(g.id) === btn.dataset.id);
        if (gift && gift.is_cash_grant) openLinkPanel(gift);
        else openPostPanel(gift);
      });
    });
  }

  // Ordering 3: the deposit already posted (via ordinary Create in Bank Reconciliation) before
  // this grant gift was entered -- no open bank line left for Match to find. Search recent
  // posted transactions and link directly; posts nothing new.
  function openLinkPanel(gift) {
    if (!postPanel) return;
    const received = String(gift.received_at || '').slice(0, 10);
    const d = received ? new Date(received + 'T00:00:00') : new Date();
    const from = new Date(d.getTime() - 15 * 86400000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const amountLow = Math.round(gift.amount_cents * 0.98);
    const amountHigh = Math.round(gift.amount_cents * 1.02);
    postPanel.innerHTML =
      '<p style="margin:0 0 10px;font-weight:600;font-size:0.875rem;">Link an already-posted transaction</p>' +
      '<p class="organizational-hint" style="margin:0 0 10px;">Use this when the deposit was already coded in Bank Reconciliation before this grant was entered here. This only links the record -- it does not post anything new. To fix the account it posted to, use Find &amp; Recode.</p>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-link-search-btn">Search nearby posted transactions</button>' +
      '<div id="gp-link-results" style="margin-top:10px;"></div>';
    postPanel.hidden = false;

    document.getElementById('gp-link-search-btn').addEventListener('click', async () => {
      const resultsEl = document.getElementById('gp-link-results');
      resultsEl.innerHTML = 'Searching…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions?status=posted&date_from=' + from + '&date_to=' + to + '&amount_min_cents=' + amountLow + '&amount_max_cents=' + amountHigh, { method: 'GET' });
      const lines = (out && out.res.ok && out.data && out.data.lines) || [];
      // The endpoint returns one row per ledger LINE (a 2-line transaction shows up twice) --
      // dedupe to one row per transaction_id for the picker.
      const byTxn = new Map();
      lines.forEach((l) => { if (!byTxn.has(l.transaction_id)) byTxn.set(l.transaction_id, l); });
      const txns = [...byTxn.values()];
      if (!txns.length) { resultsEl.innerHTML = '<p class="organizational-empty">No posted transactions found in that date/amount range.</p>'; return; }
      resultsEl.innerHTML = txns.map((t) =>
        '<div class="organizational-panel-field-row" style="align-items:center;padding:6px;border-bottom:1px solid var(--border);">' +
          '<span style="flex:1;font-size:0.8125rem;">' + esc(t.transaction_date) + ' · ' + esc(t.memo || t.payee || ('#' + t.transaction_id)) + ' · coded to ' + esc(t.account_name || '—') + '</span>' +
          '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-primary gp-link-confirm-btn" data-txn-id="' + t.transaction_id + '">Link</button>' +
        '</div>'
      ).join('');
      resultsEl.querySelectorAll('.gp-link-confirm-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const out2 = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + gift.id + '/link-transaction', {
            method: 'POST', body: JSON.stringify({ ledger_transaction_id: Number(btn.dataset.txnId) }),
          });
          if (!out2 || !out2.res.ok) { resultsEl.insertAdjacentHTML('afterbegin', '<p class="organizational-panel-error">' + esc((out2 && out2.data && out2.data.error) || 'Could not link') + '</p>'); return; }
          // reclassified: the money was sitting in Unallocated Donor Receipts and a new
          // correcting entry moved it to the grant's real revenue account; false means it was
          // already coded to a real account and just got linked, no new entry.
          if (out2.data && out2.data.reclassified) {
            alert('Linked -- reclassified from Unallocated Donor Receipts to the grant\'s revenue account.');
          }
          postPanel.hidden = true;
          await loadPending();
        });
      });
    });
  }

  function openPostPanel(gift) {
    if (!postPanel || !gift) return;
    const isInKind = !!gift.in_kind;
    const today = new Date().toISOString().slice(0, 10);
    postPanel.innerHTML =
      '<p style="margin:0 0 10px;font-weight:600;font-size:0.875rem;">' + (isInKind ? 'Post in-kind gift' : 'Post pledge commitment') + '</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Posting date</label>' +
          '<input type="date" class="organizational-input" id="gp-posting-date" value="' + today + '"></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Program</label>' +
          '<select class="organizational-select" id="gp-program">' + programOpts(gift.program_id) + '</select></div>' +
        (isInKind
          ? '<div><label class="organizational-label" style="font-size:0.75rem;">Gifts-in-Kind revenue account</label>' +
              '<select class="organizational-select" id="gp-revenue">' + acctOpts((a) => a.type === 'income' && !a.is_system_contribution_revenue_account, gift.in_kind.revenue_account_id) + '</select></div>' +
            '<div><label class="organizational-label" style="font-size:0.75rem;">In-kind expense account (non-cash)</label>' +
              '<select class="organizational-select" id="gp-expense">' + acctOpts((a) => a.type === 'expense' && a.is_non_cash, gift.in_kind.expense_account_id) + '</select></div>'
          : '<div><label class="organizational-label" style="font-size:0.75rem;">Contribution revenue account</label>' +
              '<select class="organizational-select" id="gp-revenue">' + acctOpts((a) => a.type === 'income' && !a.is_system_contribution_revenue_account) + '</select></div>' +
            '<div><label class="organizational-label" style="font-size:0.75rem;">Pledges receivable account</label>' +
              '<select class="organizational-select" id="gp-receivable">' + acctOpts((a) => a.type === 'asset', gift.pledge.receivable_account_id) + '</select></div>'
        ) +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
        '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-post-btn">Post</button>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-cancel-btn">Cancel</button>' +
        '<span id="gp-status" style="font-size:0.8125rem;color:var(--text-secondary);"></span>' +
      '</div>';
    postPanel.hidden = false;

    document.getElementById('gp-cancel-btn').addEventListener('click', () => { postPanel.hidden = true; });
    document.getElementById('gp-post-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('gp-status');
      const payload = {
        posting_date: document.getElementById('gp-posting-date').value,
        program_id: Number(document.getElementById('gp-program').value) || null,
        revenue_account_id: Number(document.getElementById('gp-revenue').value) || null,
      };
      if (isInKind) payload.expense_account_id = Number(document.getElementById('gp-expense').value) || null;
      else payload.receivable_account_id = Number(document.getElementById('gp-receivable').value) || null;

      statusEl.textContent = 'Posting…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + gift.id + '/post', {
        method: 'POST', body: JSON.stringify(payload),
      });
      if (!out || !out.res.ok) {
        statusEl.textContent = (out && out.data && out.data.error) || 'Could not post';
        return;
      }
      postPanel.hidden = true;
      await loadPending();
    });
  }

  function openRunPanel(kind) {
    if (!runPanel) return;
    const today = new Date().toISOString().slice(0, 10);
    const firstOfYear = today.slice(0, 4) + '-01-01';
    if (kind === 'accretion') {
      runPanel.innerHTML =
        '<p style="margin:0 0 10px;font-weight:600;font-size:0.875rem;">Run pledge accretion</p>' +
        '<p class="organizational-hint" style="margin:0 0 10px;">Posts discount accretion for every multi-year pledge with an installment schedule, through the date below. Idempotent — already-posted periods are skipped.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Through date</label>' +
            '<input type="date" class="organizational-input" id="gp-run-through" value="' + today + '"></div>' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Accretion income account</label>' +
            '<select class="organizational-select" id="gp-run-income">' + acctOpts((a) => a.type === 'income') + '</select></div>' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-run-preview-btn">Preview</button>' +
          '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-run-confirm-btn" disabled>Run</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-run-cancel-btn">Cancel</button>' +
        '</div>' +
        '<div id="gp-run-result" style="margin-top:10px;font-size:0.8125rem;"></div>';
    } else {
      runPanel.innerHTML =
        '<p style="margin:0 0 10px;font-weight:600;font-size:0.875rem;">Run indirect cost recovery</p>' +
        '<p class="organizational-hint" style="margin:0 0 10px;">Computes MTDC base x elected rate for every grant with a rate election, over the period below, and posts one recovery entry per grant. Only counts posted (approved) direct costs.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Period start</label>' +
            '<input type="date" class="organizational-input" id="gp-run-start" value="' + firstOfYear + '"></div>' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Period end</label>' +
            '<input type="date" class="organizational-input" id="gp-run-end" value="' + today + '"></div>' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Program</label>' +
            '<select class="organizational-select" id="gp-run-program">' + programOpts() + '</select></div>' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Debit (receivable/due-from) account</label>' +
            '<select class="organizational-select" id="gp-run-debit">' + acctOpts((a) => a.type === 'asset') + '</select></div>' +
          '<div><label class="organizational-label" style="font-size:0.75rem;">Credit (recovery revenue) account</label>' +
            '<select class="organizational-select" id="gp-run-credit">' + acctOpts((a) => a.type === 'income') + '</select></div>' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-run-preview-btn">Preview</button>' +
          '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-run-confirm-btn" disabled>Run</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-run-cancel-btn">Cancel</button>' +
        '</div>' +
        '<div id="gp-run-result" style="margin-top:10px;font-size:0.8125rem;"></div>';
    }
    runPanel.hidden = false;

    const resultEl = document.getElementById('gp-run-result');
    const confirmBtn = document.getElementById('gp-run-confirm-btn');
    document.getElementById('gp-run-cancel-btn').addEventListener('click', () => { runPanel.hidden = true; });
    document.getElementById('gp-run-preview-btn').addEventListener('click', async () => {
      resultEl.textContent = 'Loading preview…';
      confirmBtn.disabled = true;
      let out;
      if (kind === 'accretion') {
        const through = document.getElementById('gp-run-through').value;
        out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/pledges/run-accretion-preview?through_date=' + encodeURIComponent(through), { method: 'GET' });
      } else {
        const start = document.getElementById('gp-run-start').value;
        const end = document.getElementById('gp-run-end').value;
        out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/indirect-cost-recovery/preview?period_start_date=' + encodeURIComponent(start) + '&period_end_date=' + encodeURIComponent(end), { method: 'GET' });
      }
      if (!out || !out.res.ok) { resultEl.textContent = (out && out.data && out.data.error) || 'Could not load preview'; return; }
      const total = fmtUsd(out.data.total_cents);
      const grants = kind === 'accretion' ? [] : (out.data.grants || []);
      const count = kind === 'accretion' ? (out.data.periods || []).length : grants.length;
      let html = esc(count + (kind === 'accretion' ? ' period(s)' : ' grant(s)') + ' totaling ' + total + '.' + (count === 0 ? ' Nothing to post.' : ''));
      // amount_passed_to_subrecipients_cents-derived: is_mtdc_excluded can only exclude a whole
      // account, not the per-subaward dollar threshold -- surfaced here, not silently implied
      // as handled. See migration 251.
      grants.filter((g) => g.subaward_warning).forEach((g) => {
        html += '<p style="color:var(--organizational-error);font-size:0.8125rem;margin:6px 0 0;">' + esc(g.grant_name) + ': ' + esc(g.subaward_warning) + '</p>';
      });
      resultEl.innerHTML = html;
      confirmBtn.disabled = count === 0;
    });
    confirmBtn.addEventListener('click', async () => {
      resultEl.textContent = 'Posting…';
      confirmBtn.disabled = true;
      let out;
      if (kind === 'accretion') {
        out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/pledges/run-accretion', {
          method: 'POST',
          body: JSON.stringify({
            through_date: document.getElementById('gp-run-through').value,
            income_account_id: Number(document.getElementById('gp-run-income').value) || null,
          }),
        });
      } else {
        out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/indirect-cost-recovery/run', {
          method: 'POST',
          body: JSON.stringify({
            period_start_date: document.getElementById('gp-run-start').value,
            period_end_date: document.getElementById('gp-run-end').value,
            program_id: Number(document.getElementById('gp-run-program').value) || null,
            debit_account_id: Number(document.getElementById('gp-run-debit').value) || null,
            credit_account_id: Number(document.getElementById('gp-run-credit').value) || null,
          }),
        });
      }
      if (!out || !out.res.ok) { resultEl.textContent = (out && out.data && out.data.error) || 'Could not run'; return; }
      resultEl.textContent = 'Posted ' + out.data.posted_count + ', failed ' + out.data.failed_count + '.';
    });
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    if (runAccretionBtn) runAccretionBtn.addEventListener('click', () => openRunPanel('accretion'));
    if (runRecoveryBtn) runRecoveryBtn.addEventListener('click', () => openRunPanel('recovery'));
  }

  // ── Escape closes whichever gift-postings panel is currently open ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (postPanel && !postPanel.hidden) { postPanel.hidden = true; return; }
    if (runPanel && !runPanel.hidden) { runPanel.hidden = true; return; }
  });

  window.OrganizationalAccounting.giftPostings = {
    init: async function (slug) {
      currentSlug = slug;
      await loadFieldOptions();
      wireOnce();
      await loadPending();
    },
  };
})();
