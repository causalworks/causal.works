/* gift-postings.js — Accounting-side review queue for in-kind gifts and pledge commitments
 * recorded in Donors (Fundraising). Donors never posts to the ledger itself; this tab is where
 * that actually happens, mirroring Banking's unconfirmed-lines -> explicit Create
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
  const runFeesBtn = document.getElementById('organizational-giftpostings-run-fees-btn');
  let sponsoredProjects = [];
  let pendingRows = [];
  const sorter = tbody && window.OrganizationalTableSort ? window.OrganizationalTableSort.attach(tbody.closest('table'), {
    columns: [
      { key: 'type', type: 'text', get: (g) => (g.disbursement ? 'Disbursement' : g.is_cash_grant ? 'Grant (cash)' : g.in_kind ? 'In-kind' : 'Pledge') },
      { key: 'received_at', type: 'date', get: (g) => g.received_at },
      { key: 'donor', type: 'text', get: (g) => g.constituent_name },
      { key: 'amount', type: 'currency', get: (g) => g.amount_cents },
      null,
      null,
    ],
    onChange: () => renderRows(pendingRows),
  }) : null;

  let currentSlug = '';
  let accounts = [];
  let programs = [];
  let wired = false;

  function fmtUsd(cents) {
    const n = Number(cents);
    return Number.isFinite(n) ? window.formatMoneyCents(n) : '—';
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
    accounts = allAccounts.filter((a) => a.is_posting
      && !a.is_system_ap_account && !a.is_system_ar_account && !a.is_system_clearing_account
      && !a.is_system_expense_claims_payable_account);
    const progData = (progOut && progOut.res.ok && progOut.data) || {};
    programs = progData.programs || (Array.isArray(progData) ? progData : []);
  }

  async function loadPending() {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings', { method: 'GET' });
    const rows = (out && out.res.ok && out.data && out.data.gift_postings) || [];
    const dis = ((out && out.res.ok && out.data && out.data.disbursements) || []).map((d) => ({
      id: 'd' + d.id, disbursement: d, received_at: d.date, constituent_name: d.project_name, amount_cents: d.amount_cents,
    }));
    const flagged = ((out && out.res.ok && out.data && out.data.flagged) || []).map((f) => ({ ...f, flag: f }));
    const isSponsor = !!(out && out.res.ok && out.data && out.data.fiscal_sponsor);
    if (runFeesBtn) runFeesBtn.hidden = !isSponsor;
    const untagged = ((out && out.res.ok && out.data && out.data.sponsor_untagged) || []).map((u) => ({ ...u, id: 'u' + u.id, untagged: u }));
    if (isSponsor && untagged.length && !sponsoredProjects.length) {
      const sp = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsored-projects', { method: 'GET' });
      sponsoredProjects = (sp && sp.res.ok && sp.data && sp.data.sponsored_projects) || [];
    }
    const recalls = ((out && out.res.ok && out.data && out.data.sponsor_recalls) || []).map((r) => ({
      id: 'r' + r.id, recall: r, received_at: r.recall_date, constituent_name: r.project_name, amount_cents: r.amount_cents,
    }));
    const closings = ((out && out.res.ok && out.data && out.data.sponsor_closings) || []).map((c) => ({
      id: 'c' + c.id, closing: c, received_at: c.closing_date, constituent_name: c.project_name, amount_cents: c.amount_cents,
    }));
    renderRows(flagged.concat(untagged, rows, dis, recalls, closings));
  }

  function projectLink(id, name, view) {
    return '<a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/sponsored-projects?project=' + id + '&view=' + view + '">' + esc(name) + '</a>';
  }

  function renderRows(rows) {
    if (!tbody) return;
    pendingRows = rows;
    if (!rows.length) {
      tbody.innerHTML = '<tr class="organizational-table-empty"><td colspan="6">Nothing is waiting to be posted.</td></tr>';
      return;
    }
    tbody.innerHTML = (sorter ? sorter.sortRows(rows) : rows).map((g) => {
      const isInKind = !!g.in_kind;
      const isCashGrant = !!g.is_cash_grant;
      if (g.flag) {
        return '<tr data-id="' + g.id + '"><td><strong style="color:var(--amber);">Not a gift?</strong></td>'
          + '<td>' + esc((g.received_at || '').slice(0, 10)) + '</td><td>' + esc(g.constituent_name || '—') + '</td><td>' + fmtUsd(g.amount_cents) + '</td>'
          + '<td style="font-size:0.8125rem;color:var(--text-secondary);">Flagged by ' + esc(g.flag.flagged_by || 'Funding') + ': ' + esc(g.flag.note || '')
          + (g.flag.ledger_transaction_id ? ' · <a href="/organizational/o/' + encodeURIComponent(currentSlug) + '/transactions?txn=' + g.flag.ledger_transaction_id + '">Open the entry</a> to recode it first' : '') + '</td>'
          + '<td style="white-space:nowrap;"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-flag-accept" data-id="' + g.id + '">Not a gift</button> '
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-flag-keep" data-id="' + g.id + '">Keep as gift</button></td></tr>';
      }
      if (g.closing) {
        const c = g.closing;
        return '<tr data-id="' + g.id + '"><td>Closing</td><td>' + esc(c.closing_date || '') + '</td><td>' + projectLink(c.project_id, c.project_name, 'money-out') + '</td><td>' + fmtUsd(c.amount_cents) + '</td>'
          + '<td style="font-size:0.8125rem;color:var(--text-secondary);">Remaining balance' + (c.destination_name ? ' to ' + esc(c.destination_name) : '') + ': ' + esc(c.reason) + '</td>'
          + '<td style="white-space:nowrap;"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-closing-post" data-id="' + c.id + '">Post…</button> '
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-closing-void" data-id="' + c.id + '">Cancel</button></td></tr>';
      }
      if (g.recall) {
        const rc = g.recall;
        return '<tr data-id="' + g.id + '"><td>Recall</td><td>' + esc(rc.recall_date || '') + '</td><td>' + projectLink(rc.project_id, rc.project_name, 'money-out') + '</td><td>' + fmtUsd(rc.amount_cents) + '</td>'
          + '<td style="font-size:0.8125rem;color:var(--text-secondary);">Funds taken back from the project: ' + esc(rc.reason) + '</td>'
          + '<td style="white-space:nowrap;"><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-recall-post" data-id="' + rc.id + '">Post</button> '
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-recall-void" data-id="' + rc.id + '">Cancel</button></td></tr>';
      }
      if (g.untagged) {
        const u = g.untagged;
        const opts = '<option value="">Choose project</option>' + sponsoredProjects.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
        return '<tr data-id="' + g.id + '"><td><strong style="color:var(--amber);">No project?</strong></td>'
          + '<td>' + esc((u.received_at || '').slice(0, 10)) + '</td><td>' + esc(u.constituent_name || '—') + '</td><td>' + fmtUsd(u.amount_cents) + '</td>'
          + '<td style="font-size:0.8125rem;color:var(--text-secondary);">This workspace is a fiscal sponsor and the gift is not tagged to a project.'
          + (u.in_books ? ' It is already in the books, so recode the entry first if it belongs to a project.' : '') + '</td>'
          + '<td style="white-space:nowrap;">' + (u.in_books ? '' : '<select class="organizational-select gp-untagged-project" style="max-width:150px;" data-id="' + u.id + '" aria-label="Project">' + opts + '</select> ')
          + '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-untagged-own" data-id="' + u.id + '" title="The workspace\'s own gift, not for a project">Own gift</button></td></tr>';
      }
      const typeLabel = g.disbursement ? 'Disbursement' : isCashGrant ? 'Grant (cash)' : (isInKind ? 'In-kind' : 'Pledge');
      const details = g.disbursement
        ? 'Approved in Sponsorship' + (g.disbursement.notes ? ': ' + esc(g.disbursement.notes) : '') + (g.disbursement.admin_fee_cents ? ' · fee ' + fmtUsd(g.disbursement.admin_fee_cents) + ' tracked on the project' : '')
        : isCashGrant
        ? 'Awaiting deposit — match in Banking, or link an already-posted transaction'
        : isInKind
          ? esc(g.in_kind.description || '') + (g.in_kind.valuation_method ? ' (' + esc(g.in_kind.valuation_method) + ')' : '')
          : (g.pledge && g.pledge.is_multi_year_pledge
              ? '<strong style="color:var(--amber);">Needs discounting</strong> · multi-year pledge of ' + fmtUsd(g.pledge.total_pledged_cents)
                + (g.pledge.discounted_present_value_cents != null ? ', proposed PV ' + fmtUsd(g.pledge.discounted_present_value_cents) : ', no rate proposed')
              : 'Pledge, ' + fmtUsd(g.pledge ? g.pledge.total_pledged_cents : g.amount_cents));
      const btnLabel = isCashGrant ? 'Link…' : 'Review…';
      return '<tr data-id="' + g.id + '">' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + esc((g.received_at || '').slice(0, 10)) + '</td>' +
        '<td>' + (g.disbursement && g.disbursement.project_id ? projectLink(g.disbursement.project_id, g.constituent_name || g.disbursement.project_name, 'money-out') : esc(g.constituent_name || '—')) + '</td>' +
        '<td>' + fmtUsd(g.amount_cents) + '</td>' +
        '<td style="font-size:0.8125rem;color:var(--text-secondary);">' + details + '</td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline organizational-giftpostings-review-btn" data-id="' + g.id + '">' + btnLabel + '</button></td>' +
      '</tr>';
    }).join('');
    const resolveFlag = async (id, keep) => {
      const msg = keep ? 'Keep this as a gift? The flag is removed.' : 'Remove this gift from Funding?';
      if (!window.confirm(msg)) return;
      const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + id + '/not-a-gift', { method: 'POST', body: JSON.stringify({ keep }) });
      if (r && r.res.ok) await loadPending();
    };
    tbody.querySelectorAll('.gp-flag-accept').forEach((b) => b.addEventListener('click', () => {
      const f = rows.find((x) => String(x.id) === b.dataset.id);
      if (f && f.flag && f.flag.ledger_transaction_id) openFlagPanel(f); else resolveFlag(b.dataset.id, false);
    }));
    tbody.querySelectorAll('.gp-flag-keep').forEach((b) => b.addEventListener('click', () => resolveFlag(b.dataset.id, true)));
    const reviewUntagged = async (id, body) => {
      const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + id + '/sponsor-review', { method: 'POST', body: JSON.stringify(body) });
      if (r && r.res.ok) await loadPending();
      else window.alert((r && r.data && r.data.error) || 'Could not save.');
    };
    tbody.querySelectorAll('.gp-untagged-project').forEach((sel) => sel.addEventListener('change', () => {
      if (sel.value) reviewUntagged(sel.dataset.id, { sponsored_project_id: Number(sel.value) });
    }));
    tbody.querySelectorAll('.gp-closing-post').forEach((b) => b.addEventListener('click', () => {
      const c = rows.find((x) => x.closing && String(x.closing.id) === b.dataset.id).closing;
      postPanel.innerHTML = '<p style="margin:0 0 4px;font-weight:600;font-size:0.875rem;">Post the closing transfer from ' + esc(c.project_name) + '</p>' +
        '<p class="organizational-hint" style="margin:0 0 10px;">' + fmtUsd(c.amount_cents) + (c.destination_name ? ' to ' + esc(c.destination_name) : '') + '. Posting charges the project fund and credits the bank account the money leaves from. The project then ends.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Posting date</label><input type="date" class="organizational-input" id="gp-close-date" value="' + esc(c.closing_date) + '"></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Expense account</label><select class="organizational-select" id="gp-close-expense"><option value="">— select —</option>' + acctOpts((a) => a.type === 'expense', c.disbursement_expense_account_id) + '</select></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Paid from (bank account)</label><select class="organizational-select" id="gp-close-bank"><option value="">— select —</option>' + acctOpts((a) => a.is_cash_account) + '</select></div></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;"><button type="button" class="organizational-btn organizational-btn-primary" id="gp-close-go">Post</button><span id="gp-close-status" style="font-size:0.8125rem;"></span></div>';
      postPanel.hidden = false;
      document.getElementById('gp-close-go').addEventListener('click', async () => {
        const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsor-closings/' + c.id + '/post', { method: 'POST', body: JSON.stringify({
          posting_date: document.getElementById('gp-close-date').value, expense_account_id: Number(document.getElementById('gp-close-expense').value) || null,
          bank_account_id: Number(document.getElementById('gp-close-bank').value) || null }) });
        if (!r || !r.res.ok) { document.getElementById('gp-close-status').textContent = (r && r.data && r.data.error) || 'Could not post.'; return; }
        postPanel.hidden = true;
        await loadPending();
      });
    }));
    tbody.querySelectorAll('.gp-closing-void').forEach((b) => b.addEventListener('click', async () => {
      const reason = window.prompt('Why is this closing being cancelled? (required)');
      if (!reason || !reason.trim()) return;
      const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsor-closings/' + b.dataset.id + '/void', { method: 'POST', body: JSON.stringify({ reason }) });
      if (r && r.res.ok) await loadPending(); else window.alert((r && r.data && r.data.error) || 'Could not cancel the closing.');
    }));
    tbody.querySelectorAll('.gp-recall-post').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Post this recall? It charges the project fund and credits the workspace.')) return;
      const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsor-recalls/' + b.dataset.id + '/post', { method: 'POST', body: '{}' });
      if (r && r.res.ok) await loadPending(); else window.alert((r && r.data && r.data.error) || 'Could not post the recall.');
    }));
    tbody.querySelectorAll('.gp-recall-void').forEach((b) => b.addEventListener('click', async () => {
      const reason = window.prompt('Why is this recall being cancelled? (required)');
      if (!reason || !reason.trim()) return;
      const r = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/sponsor-recalls/' + b.dataset.id + '/void', { method: 'POST', body: JSON.stringify({ reason }) });
      if (r && r.res.ok) await loadPending(); else window.alert((r && r.data && r.data.error) || 'Could not cancel the recall.');
    }));
    tbody.querySelectorAll('.gp-untagged-own').forEach((b) => b.addEventListener('click', () => reviewUntagged(b.dataset.id, { own: true })));
    tbody.querySelectorAll('.organizational-giftpostings-review-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gift = rows.find((g) => String(g.id) === btn.dataset.id);
        if (gift && gift.disbursement) openDisbursementPanel(gift.disbursement);
        else if (gift && gift.is_cash_grant) openLinkPanel(gift);
        else openPostPanel(gift);
      });
    });
  }

  function openFlagPanel(f) {
    postPanel.innerHTML =
      '<div class="organizational-panel-section-head">Not a gift: where does this money belong?</div>' +
      '<p class="organizational-hint">' + fmtUsd(f.amount_cents) + ' from ' + esc(f.constituent_name || 'an unnamed contact') + '. Funding says: ' + esc(f.flag.note || '') + '</p>' +
      '<div class="organizational-panel-field-row">' +
      '<label class="organizational-label" style="flex:1">Account<select id="gp-flag-account" class="organizational-select"><option value="">— select —</option>' + acctOpts(() => true) + '</select></label>' +
      '<label class="organizational-label" style="flex:1">Program<select id="gp-flag-program" class="organizational-select">' + programOpts('') + '</select></label></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;">' +
      '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-flag-recode">Recode and remove from Funding</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-flag-uncoded">Leave uncoded for now</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-flag-cancel">Cancel</button><span id="gp-flag-status" style="font-size:0.8125rem;color:var(--text-secondary);"></span></div>';
    postPanel.hidden = false;
    const statusEl = document.getElementById('gp-flag-status');
    const send = async (payload) => {
      statusEl.textContent = 'Saving…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + f.id + '/not-a-gift', { method: 'POST', body: JSON.stringify(payload) });
      if (out && !out.res.ok && out.data && out.data.code === 'recode_in_transactions') {
        if (window.confirm(out.data.error + '\n\nOK opens the entry so you can recode it there.')) {
          window.location.href = '/organizational/o/' + encodeURIComponent(currentSlug) + '/transactions?txn=' + out.data.transaction_id + '&edit=1';
        } else statusEl.textContent = '';
        return;
      }
      if (!out || !out.res.ok) { statusEl.textContent = (out && out.data && out.data.error) || 'Could not save'; return; }
      postPanel.hidden = true;
      await loadPending();
    };
    document.getElementById('gp-flag-cancel').addEventListener('click', () => { postPanel.hidden = true; });
    document.getElementById('gp-flag-recode').addEventListener('click', () => send({ account_id: Number(document.getElementById('gp-flag-account').value) || null, program_id: Number(document.getElementById('gp-flag-program').value) || null }));
    document.getElementById('gp-flag-uncoded').addEventListener('click', () => send({ uncoded: true }));
  }

  function openDisbursementPanel(d) {
    if (!postPanel) return;
    const today = new Date().toISOString().slice(0, 10);
    postPanel.innerHTML =
      '<p style="margin:0 0 4px;font-weight:600;font-size:0.875rem;">Post disbursement to ' + esc(d.project_name) + '</p>' +
      '<p class="organizational-hint" style="margin:0 0 10px;">' + fmtUsd(d.amount_cents) + ' approved in Sponsorship on ' + esc(d.date) + '. Posting debits the expense account and credits the bank account the money left from.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Posting date</label><input type="date" class="organizational-input" id="gp-posting-date" value="' + today + '"></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Program</label><select class="organizational-select" id="gp-program">' + programOpts(d.program_id) + '</select></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Disbursement expense account</label><select class="organizational-select" id="gp-expense"><option value="">— select —</option>' + acctOpts((a) => a.type === 'expense', d.expense_account_id) + '</select></div>' +
        (d.kind === 'property' ? '<div class="organizational-hint" style="font-size:0.8125rem;">Donated property: the item\'s asset account is credited at its recorded value. No bank account is involved.</div>'
          : '<div><label class="organizational-label" style="font-size:0.75rem;">Paid from (bank account)</label><select class="organizational-select" id="gp-bank"><option value="">— select —</option>' + acctOpts((a) => a.is_cash_account) + '</select></div>') +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;"><button type="button" class="organizational-btn organizational-btn-primary" id="gp-post-btn">Post</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-cancel-btn">Cancel</button><span id="gp-status" style="font-size:0.8125rem;color:var(--text-secondary);"></span></div>';
    postPanel.hidden = false;
    document.getElementById('gp-cancel-btn').addEventListener('click', () => { postPanel.hidden = true; });
    document.getElementById('gp-post-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('gp-status');
      statusEl.textContent = 'Posting…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/disbursement/' + d.id + '/post', {
        method: 'POST', body: JSON.stringify({
          posting_date: document.getElementById('gp-posting-date').value, program_id: Number(document.getElementById('gp-program').value) || null,
          expense_account_id: Number(document.getElementById('gp-expense').value) || null, bank_account_id: document.getElementById('gp-bank') ? Number(document.getElementById('gp-bank').value) || null : null }),
      });
      if (!out || !out.res.ok) { statusEl.textContent = (out && out.data && out.data.error) || 'Could not post'; return; }
      postPanel.hidden = true;
      await loadPending();
    });
  }

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
      '<p class="organizational-hint" style="margin:0 0 10px;">Use this when the deposit was already coded in Banking before this grant was entered here. This only links the record -- it does not post anything new. To fix the account it posted to, use Find &amp; Recode.</p>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-link-search-btn">Search nearby posted transactions</button>' +
      '<div id="gp-link-results" style="margin-top:10px;"></div>';
    postPanel.hidden = false;

    document.getElementById('gp-link-search-btn').addEventListener('click', async () => {
      const resultsEl = document.getElementById('gp-link-results');
      resultsEl.innerHTML = 'Searching…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/ledger/transactions?status=posted&date_from=' + from + '&date_to=' + to + '&amount_min_cents=' + amountLow + '&amount_max_cents=' + amountHigh, { method: 'GET' });
      const lines = (out && out.res.ok && out.data && out.data.lines) || [];
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
          if (out2.data && out2.data.reclassified) {
            alert('Linked -- reclassified from Unallocated Donor Receipts to the grant\'s revenue account.');
          }
          postPanel.hidden = true;
          await loadPending();
        });
      });
    });
  }

  function individualRevenueId(gift) {
    if (!gift || gift.constituent_kind !== 'individual') return null;
    const a = accounts.find((x) => x.is_system_contribution_revenue_account && x.type === 'income');
    return a ? a.id : null;
  }

  function openPostPanel(gift) {
    if (!postPanel || !gift) return;
    const isInKind = !!gift.in_kind;
    const today = new Date().toISOString().slice(0, 10);
    postPanel.innerHTML =
      '<p style="margin:0 0 6px;font-weight:600;font-size:0.875rem;">' + (isInKind ? 'Post in-kind gift' : 'Accept and post pledge commitment') + '</p>' +
      (!isInKind && gift.pledge && gift.pledge.marked_by
        ? '<p class="organizational-hint" style="margin:0 0 10px;">Funding marked this pledge unconditional' + (gift.pledge.marked_at ? ' on ' + esc(String(gift.pledge.marked_at).slice(0, 10)) : '') + ' (' + esc(gift.pledge.marked_by) + ')' + (gift.pledge.marked_note ? ': ' + esc(gift.pledge.marked_note) : '') + '. Check the documentation before accepting; nothing posts until you do.</p>'
        : '<div style="height:4px;"></div>') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Posting date</label>' +
          '<input type="date" class="organizational-input" id="gp-posting-date" value="' + today + '"></div>' +
        '<div><label class="organizational-label" style="font-size:0.75rem;">Program</label>' +
          '<select class="organizational-select" id="gp-program">' + programOpts(gift.program_id) + '</select></div>' +
        (isInKind
          ? '<div><label class="organizational-label" style="font-size:0.75rem;">Gifts-in-Kind revenue account</label>' +
              '<select class="organizational-select" id="gp-revenue">' + acctOpts((a) => a.type === 'income' && !a.is_system_contribution_revenue_account, gift.in_kind.revenue_account_id) + '</select></div>' +
            '<div><label class="organizational-label" style="font-size:0.75rem;">Expense account for what was donated</label>' +
              '<select class="organizational-select" id="gp-expense">' + acctOpts((a) => a.type === 'expense' || (a.type === 'asset' && !a.is_cash_account), gift.in_kind.expense_account_id) + '</select></div>'
          : '<div><label class="organizational-label" style="font-size:0.75rem;">Contribution revenue account</label>' +
              '<select class="organizational-select" id="gp-revenue"><option value="">— select —</option>' + acctOpts((a) => a.type === 'income' && a.standard_category === 'REV_CONTRIB', individualRevenueId(gift)) + '</select></div>' +
            '<div><label class="organizational-label" style="font-size:0.75rem;">Pledges receivable account</label>' +
              '<select class="organizational-select" id="gp-receivable">' + acctOpts((a) => a.type === 'asset', gift.pledge.receivable_account_id) + '</select></div>'
        ) +
      '</div>' +
      (!isInKind && gift.pledge && gift.pledge.is_multi_year_pledge
        ? '<div style="margin-top:12px;padding:10px 12px;border:1px solid var(--border-strong);border-radius:var(--radius-sm,6px);background:var(--surface-hover);">' +
            '<p style="margin:0 0 6px;font-weight:600;font-size:0.8125rem;">Discount to present value</p>' +
            '<p class="organizational-hint" style="margin:0 0 8px;">Funding' + (gift.pledge.discount_rate_bps != null ? ' proposed the values below' : ' did not propose a rate') + '. Set or accept the rate and term. Once posted they are fixed.</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
              '<div><label class="organizational-label" style="font-size:0.75rem;">Discount rate (%)</label>' +
                '<input type="number" class="organizational-input" id="gp-rate" min="0" max="50" step="0.01" value="' + (gift.pledge.discount_rate_bps != null ? gift.pledge.discount_rate_bps / 100 : '') + '"></div>' +
              '<div><label class="organizational-label" style="font-size:0.75rem;">Term (years)</label>' +
                '<input type="number" class="organizational-input" id="gp-years" min="0.25" step="0.25" value="' + (gift.pledge.pledge_years != null ? gift.pledge.pledge_years : '') + '"></div>' +
            '</div>' +
            '<p id="gp-pv-preview" style="margin:6px 0 0;font-size:0.8125rem;color:var(--text-secondary);"></p>' +
          '</div>'
        : '') +
      (!isInKind
        ? '<p class="organizational-hint" style="margin:10px 0 0;"><b>Rule of thumb for discounting:</b> a pledge due within about a year can be booked at face value. A pledge due over several years is booked at present value: discount each payment at a rate that matches how long it takes to arrive (commonly a risk-free rate such as a Treasury yield for that term, often a few percent), and fix the rate when you book it. The discount then flows back into contribution revenue each year as the pledge nears payment. Confirm the rate with your accountant or auditor.</p>'
        : '') +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
        '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-post-btn">' + (isInKind ? 'Post' : 'Accept and post') + '</button>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-cancel-btn">Cancel</button>' +
        '<span id="gp-status" style="font-size:0.8125rem;color:var(--text-secondary);"></span>' +
      '</div>';
    postPanel.hidden = false;

    const rateEl = document.getElementById('gp-rate');
    const yearsEl = document.getElementById('gp-years');
    const previewEl = document.getElementById('gp-pv-preview');
    function updatePv() {
      if (!rateEl || !yearsEl || !previewEl) return;
      const face = (gift.pledge && gift.pledge.total_pledged_cents) / 100;
      const r = parseFloat(rateEl.value), y = parseFloat(yearsEl.value);
      if (isNaN(r) || isNaN(y) || y <= 0 || !face) { previewEl.textContent = 'Enter a rate and term to see the present value that will post.'; return; }
      const pv = face / Math.pow(1 + r / 100, y);
      previewEl.textContent = 'Will post at present value $' + pv.toFixed(2) + ' (discount $' + (face - pv).toFixed(2) + ' of $' + face.toFixed(2) + ').';
    }
    if (rateEl && yearsEl) { rateEl.addEventListener('input', updatePv); yearsEl.addEventListener('input', updatePv); updatePv(); }

    document.getElementById('gp-cancel-btn').addEventListener('click', () => { postPanel.hidden = true; });
    document.getElementById('gp-post-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('gp-status');
      const payload = {
        posting_date: document.getElementById('gp-posting-date').value,
        program_id: Number(document.getElementById('gp-program').value) || null,
        revenue_account_id: Number(document.getElementById('gp-revenue').value) || null,
      };
      if (isInKind) payload.expense_account_id = Number(document.getElementById('gp-expense').value) || null;
      else {
        payload.receivable_account_id = Number(document.getElementById('gp-receivable').value) || null;
        if (rateEl && yearsEl) {
          const r = parseFloat(rateEl.value), y = parseFloat(yearsEl.value);
          if (isNaN(r) || isNaN(y)) { statusEl.textContent = 'Set the discount rate and term first.'; return; }
          payload.discount_rate_bps = Math.round(r * 100);
          payload.pledge_years = y;
        }
      }

      statusEl.textContent = 'Posting…';
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(currentSlug) + '/gift-postings/' + gift.id + '/post', {
        method: 'POST', body: JSON.stringify(payload),
      });
      if (!out || !out.res.ok) {
        statusEl.textContent = (out && out.data && out.data.error) || 'Could not post';
        return;
      }
      if (out.data && out.data.warning) {
        statusEl.textContent = 'Posted. ' + out.data.warning;
        const postBtn = document.getElementById('gp-post-btn');
        if (postBtn) postBtn.disabled = true;
        await loadPending();
        return;
      }
      postPanel.hidden = true;
      await loadPending();
    });
  }

  function openFeeRunPanel() {
    const base = '/api/organizational/orgs/' + encodeURIComponent(currentSlug);
    const today = new Date().toISOString().slice(0, 10);
    runPanel.innerHTML =
      '<p style="margin:0 0 10px;font-weight:600;font-size:0.875rem;">Run sponsorship fees</p>' +
      '<p class="organizational-hint" style="margin:0 0 10px;">Lists the administrative fee due for each sponsored project and each quarter that ended on or before the date, less what is already posted. Each entry charges the project\'s fund and credits fee income.</p>' +
      '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">' +
        '<div><label class="organizational-label" style="font-size:0.75rem;" for="gp-fee-through">Through date</label>' +
          '<input type="date" class="organizational-input" id="gp-fee-through" value="' + today + '"></div>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-fee-preview">Preview</button>' +
        '<button type="button" class="organizational-btn organizational-btn-primary" id="gp-fee-confirm" disabled>Post fees</button>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="gp-fee-cancel">Cancel</button>' +
      '</div>' +
      '<div id="gp-fee-result" style="margin-top:10px;font-size:0.8125rem;"></div>' +
      '<details class="organizational-collapsible" style="margin-top:10px;"><summary class="organizational-section-heading">Posted fee entries</summary>' +
        '<div class="organizational-section-body" id="gp-fee-entries"></div></details>';
    runPanel.hidden = false;
    const resultEl = document.getElementById('gp-fee-result');
    const confirmBtn = document.getElementById('gp-fee-confirm');
    const rowsHtml = (rows, withError) => '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Project</th><th>Quarter</th><th>Received</th><th>Fee</th><th>Already posted</th><th>To post</th>' + (withError ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr><td>' + esc(r.project_name) + '</td><td>' + esc(r.period_start + ' to ' + r.period_end) + '</td><td>' + fmtUsd(r.gross_cents) +
        (r.exempt_cents ? ' <span class="organizational-hint">(' + fmtUsd(r.exempt_cents) + ' exempt)</span>' : '') + '</td><td>' + fmtUsd(r.fee_cents) +
        (r.minimum_applied ? ' <span class="organizational-hint">minimum</span>' : '') + '</td><td>' + fmtUsd(r.posted_cents) + '</td><td>' + fmtUsd(r.due_cents) + '</td>' +
        (withError ? '<td style="color:var(--organizational-error);">' + esc(r.error || r.problem || '') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>';
    async function loadEntries() {
      const el = document.getElementById('gp-fee-entries');
      const out = await apiJson(base + '/sponsor-fees/postings', { method: 'GET' });
      const list = (out && out.res.ok && out.data && out.data.postings) || [];
      el.innerHTML = list.length ? '<div class="organizational-table-wrap"><table class="organizational-table"><thead><tr><th>Project</th><th>Quarter</th><th>Amount</th><th></th></tr></thead><tbody>' +
        list.map((p) => '<tr><td>' + esc(p.project_name) + '</td><td>' + esc(p.period_start + ' to ' + p.period_end) + '</td><td>' + fmtUsd(p.live ? p.amount_cents : 0) + '</td><td>' +
          (p.live ? '<button type="button" class="organizational-btn organizational-btn-sm organizational-btn-outline gp-fee-void" data-id="' + p.id + '">Reverse…</button>'
            : '<span class="organizational-hint">Reversed' + (p.void_reason ? ': ' + esc(p.void_reason) : '') + '</span>') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="organizational-hint" style="margin:0;">No fee entries yet.</p>';
      el.querySelectorAll('.gp-fee-void').forEach((b) => b.addEventListener('click', async () => {
        const reason = window.prompt('Why is this fee being reversed? (required)');
        if (!reason || !reason.trim()) return;
        const r = await apiJson(base + '/sponsor-fees/postings/' + b.dataset.id + '/void', { method: 'POST', body: JSON.stringify({ reason }) });
        if (!r || !r.res.ok) { window.alert((r && r.data && r.data.error) || 'Could not reverse the fee.'); return; }
        loadEntries();
      }));
    }
    loadEntries();
    document.getElementById('gp-fee-cancel').addEventListener('click', () => { runPanel.hidden = true; });
    document.getElementById('gp-fee-preview').addEventListener('click', async () => {
      resultEl.textContent = 'Working out fees…';
      confirmBtn.disabled = true;
      const through = document.getElementById('gp-fee-through').value;
      const out = await apiJson(base + '/sponsor-fees/preview?through_date=' + encodeURIComponent(through), { method: 'GET' });
      if (!out || !out.res.ok) { resultEl.textContent = (out && out.data && out.data.error) || 'Could not work out the fees.'; return; }
      const rows = out.data.rows || [];
      if (!rows.length) { resultEl.textContent = 'No fees are due through ' + through + '.'; return; }
      const blocked = rows.filter((r) => r.problem);
      resultEl.innerHTML = rowsHtml(rows, blocked.length > 0) + '<p style="margin:6px 0 0;">Total to post: <strong>' + fmtUsd(out.data.total_cents) + '</strong></p>';
      confirmBtn.disabled = blocked.length === rows.length;
    });
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      resultEl.textContent = 'Posting fees…';
      const out = await apiJson(base + '/sponsor-fees/run', { method: 'POST', body: JSON.stringify({ through_date: document.getElementById('gp-fee-through').value }) });
      if (!out || !out.res.ok) { resultEl.textContent = (out && out.data && out.data.error) || 'Could not post fees.'; return; }
      resultEl.innerHTML = '<p style="margin:0;">Posted ' + out.data.posted_count + (out.data.failed_count ? ', not posted ' + out.data.failed_count : '') + '.</p>' +
        (out.data.failed_count ? rowsHtml(out.data.failed, true) : '');
      loadEntries();
    });
  }

  function openRunPanel(kind) {
    if (!runPanel) return;
    if (kind === 'fees') { openFeeRunPanel(); return; }
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
    if (runFeesBtn) runFeesBtn.addEventListener('click', () => openRunPanel('fees'));
  }

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
