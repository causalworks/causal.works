// Membership management (W1.4) - placeholder-grade UI

(function () {
  const state = {
    members: [],
    tiers: [],
    renewals: [],
    payments: [],
    currentTab: 'members'
  };

  let slug = '';

  function getOrgSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

async function membershipFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Membership request failed');
  return body;
}

function showMembershipTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.organizational-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.membershipTab === tab);
  });
  document.querySelectorAll('.organizational-tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `membership-tab-${tab}`);
  });
  
  if (tab === 'members') loadMembers();
  if (tab === 'tiers') loadTiers();
  if (tab === 'renewals') loadRenewals();
  if (tab === 'payments') loadPayments();
}

async function loadPayments() {
  const slug = getOrgSlug();
  const listEl = document.getElementById('membership-payments-list');
  listEl.innerHTML = '<div class="organizational-loading">Loading payments…</div>';

  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/payments`);
    state.payments = data.payments || [];
    renderPaymentsList();
  } catch (e) {
    listEl.innerHTML = '<div class="organizational-error">Could not load payment history</div>';
  }
}

function renderPaymentsList() {
  const listEl = document.getElementById('membership-payments-list');
  if (!state.payments.length) {
    listEl.innerHTML = '<div class="organizational-empty">No payments recorded yet</div>';
    return;
  }

  listEl.innerHTML = state.payments.map(p => `
    <div class="organizational-list-item">
      <div class="organizational-list-item-main">
        <div class="organizational-list-item-title">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</div>
        <div class="organizational-list-item-subtitle">${formatDate(p.period_covered_start)} – ${formatDate(p.period_covered_end)}${p.payment_method ? ' · ' + escapeHtml(p.payment_method) : ''}</div>
      </div>
      <div class="organizational-list-item-meta">
        <strong>${formatCents(p.amount_cents, p.currency)}</strong>
        <span class="organizational-date">${formatDate(p.payment_date)}</span>
      </div>
    </div>
  `).join('');
}

async function loadSummary() {
  const slug = getOrgSlug();
  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/summary`);
    document.getElementById('membership-total-active').textContent = data.total_active || 0;
    document.getElementById('membership-total-lapsed').textContent = data.total_lapsed || 0;
    document.getElementById('membership-total-grace').textContent = data.total_grace || 0;
    document.getElementById('membership-dues-year').textContent = `$${(data.dues_received_year / 100).toFixed(2)}`;
    document.getElementById('membership-dues-month').textContent = `$${(data.dues_received_month / 100).toFixed(2)}`;
    document.getElementById('membership-renewals-30').textContent = data.renewals_coming_30_days || 0;
  } catch (e) {
    console.error('Could not load summary:', e);
  }
}

async function loadMembers() {
  const slug = getOrgSlug();
  const tierFilter = document.getElementById('membership-tier-filter').value;
  const statusFilter = document.getElementById('membership-status-filter').value;
  const search = document.getElementById('membership-search').value;
  
  const params = new URLSearchParams();
  if (tierFilter) params.append('tier_id', tierFilter);
  if (statusFilter) params.append('status', statusFilter);
  if (search) params.append('search', search);
  
  const listEl = document.getElementById('membership-members-list');
  listEl.innerHTML = '<div class="organizational-loading">Loading members…</div>';
  
  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/members?${params}`);
    state.members = data.members || [];
    renderMembersList();
  } catch (e) {
    listEl.innerHTML = '<div class="organizational-error">Could not load members</div>';
  }
}

function renderMembersList() {
  const listEl = document.getElementById('membership-members-list');
  if (!state.members.length) {
    listEl.innerHTML = '<div class="organizational-empty">No members found</div>';
    return;
  }
  
  listEl.innerHTML = state.members.map(m => `
    <div class="organizational-list-item" onclick="viewMemberDetail(${m.id})">
      <div class="organizational-list-item-main">
        <div class="organizational-list-item-title">${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</div>
        <div class="organizational-list-item-subtitle">${escapeHtml(m.email)}</div>
      </div>
      <div class="organizational-list-item-meta">
        <span class="organizational-badge organizational-badge-${m.status}">${formatStatus(m.status)}</span>
        ${m.tier_name ? `<span class="organizational-badge">${escapeHtml(m.tier_name)}</span>` : ''}
        <span class="organizational-date">${formatDate(m.current_period_end)}</span>
      </div>
    </div>
  `).join('');
}

async function loadTiers() {
  const slug = getOrgSlug();
  const listEl = document.getElementById('membership-tiers-list');
  listEl.innerHTML = '<div class="organizational-loading">Loading tiers…</div>';
  
  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/tiers`);
    state.tiers = data.tiers || [];
    renderTiersList();
    updateTierSelects();
  } catch (e) {
    listEl.innerHTML = '<div class="organizational-error">Could not load tiers</div>';
  }
}

function renderTiersList() {
  const listEl = document.getElementById('membership-tiers-list');
  if (!state.tiers.length) {
    listEl.innerHTML = '<div class="organizational-empty">No tiers configured</div>';
    return;
  }
  
  listEl.innerHTML = state.tiers.map(t => `
    <div class="organizational-list-item">
      <div class="organizational-list-item-main">
        <div class="organizational-list-item-title">${escapeHtml(t.name)}</div>
        <div class="organizational-list-item-subtitle">$${(t.dues_amount_cents / 100).toFixed(2)} / ${t.renewal_period}</div>
      </div>
      <div class="organizational-list-item-meta">
        <span class="organizational-badge">${t.is_active ? 'Active' : 'Inactive'}</span>
      </div>
    </div>
  `).join('');
}

function updateTierSelects() {
  const tierFilter = document.getElementById('membership-tier-filter');
  const addTierSelect = document.getElementById('membership-add-tier-select');
  
  tierFilter.innerHTML = '<option value="">All Tiers</option>' + 
    state.tiers.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  
  addTierSelect.innerHTML = '<option value="">Select tier</option>' + 
    state.tiers.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
}

async function loadRenewals() {
  const slug = getOrgSlug();
  const daysAhead = document.getElementById('membership-renewals-days').value;
  const listEl = document.getElementById('membership-renewals-list');
  listEl.innerHTML = '<div class="organizational-loading">Loading renewals…</div>';
  
  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/renewals?days_ahead=${daysAhead}`);
    state.renewals = data.renewals || [];
    renderRenewalsList();
  } catch (e) {
    listEl.innerHTML = '<div class="organizational-error">Could not load renewals</div>';
  }
}

function renderRenewalsList() {
  const listEl = document.getElementById('membership-renewals-list');
  if (!state.renewals.length) {
    listEl.innerHTML = '<div class="organizational-empty">No upcoming renewals</div>';
    return;
  }
  
  listEl.innerHTML = state.renewals.map(r => `
    <div class="organizational-list-item">
      <div class="organizational-list-item-main">
        <div class="organizational-list-item-title">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</div>
        <div class="organizational-list-item-subtitle">${escapeHtml(r.email)}</div>
      </div>
      <div class="organizational-list-item-meta">
        <span class="organizational-badge organizational-badge-${r.status}">${formatStatus(r.status)}</span>
        <span class="organizational-date">Renews: ${formatDate(r.current_period_end)}</span>
      </div>
    </div>
  `).join('');
}

function openAddMemberModal() {
  const modal = document.getElementById('membership-add-member-modal');
  modal.hidden = false;
  modal.classList.add('organizational-modal-open');
}

function closeAddMemberModal() {
  const modal = document.getElementById('membership-add-member-modal');
  modal.classList.remove('organizational-modal-open');
  modal.hidden = true;
  document.getElementById('membership-add-member-form').reset();
}

async function submitAddMember() {
  const slug = getOrgSlug();
  const form = document.getElementById('membership-add-member-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  
  try {
    await membershipFetch(`/api/organizational/${slug}/membership/members`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    closeAddMemberModal();
    loadMembers();
    loadSummary();
  } catch (e) {
    alert('Could not add member: ' + e.message);
  }
}

function openAddTierModal() {
  const modal = document.getElementById('membership-add-tier-modal');
  modal.hidden = false;
  modal.classList.add('organizational-modal-open');
}

function closeAddTierModal() {
  const modal = document.getElementById('membership-add-tier-modal');
  modal.classList.remove('organizational-modal-open');
  modal.hidden = true;
  document.getElementById('membership-add-tier-form').reset();
}

async function submitAddTier() {
  const slug = getOrgSlug();
  const form = document.getElementById('membership-add-tier-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  data.dues_amount_cents = parseInt(data.dues_amount_cents, 10);
  data.display_order = parseInt(data.display_order, 10) || 0;
  
  try {
    await membershipFetch(`/api/organizational/${slug}/membership/tiers`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    closeAddTierModal();
    loadTiers();
  } catch (e) {
    alert('Could not add tier: ' + e.message);
  }
}

async function viewMemberDetail(memberId) {
  const slug = getOrgSlug();
  const contentEl = document.getElementById('membership-member-detail-content');
  contentEl.innerHTML = '<div class="organizational-loading">Loading…</div>';
  const detailModal = document.getElementById('membership-member-detail-modal');
  detailModal.hidden = false;
  detailModal.classList.add('organizational-modal-open');
  
  try {
    const data = await membershipFetch(`/api/organizational/${slug}/membership/members/${memberId}`);
    const m = data.member;
    document.getElementById('membership-member-detail-name').textContent = `${m.first_name} ${m.last_name}`;
    
    contentEl.innerHTML = `
      <div class="organizational-detail-section">
        <h3>Contact Information</h3>
        <p><strong>Email:</strong> ${escapeHtml(m.email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(m.phone || 'N/A')}</p>
        <p><strong>Address:</strong> ${escapeHtml(m.mailing_address || 'N/A')}</p>
      </div>
      <div class="organizational-detail-section">
        <h3>Membership Details</h3>
        <p><strong>Tier:</strong> ${escapeHtml(m.tier_name || 'N/A')}</p>
        <p><strong>Status:</strong> <span class="organizational-badge organizational-badge-${m.status}">${formatStatus(m.status)}</span></p>
        <p><strong>Joined:</strong> ${formatDate(m.joined_at)}</p>
        <p><strong>Current Period:</strong> ${formatDate(m.current_period_start)} – ${formatDate(m.current_period_end)}</p>
      </div>
      <div class="organizational-detail-section">
        <h3>Notes</h3>
        <p>${escapeHtml(m.notes || 'No notes')}</p>
      </div>
      <div class="organizational-detail-actions">
        <button type="button" class="organizational-btn-secondary" onclick="recordPayment(${m.id})">Record Payment</button>
        <button type="button" class="organizational-btn-secondary" onclick="sendReminder(${m.id})">Send Reminder</button>
      </div>
    `;
  } catch (e) {
    contentEl.innerHTML = '<div class="organizational-error">Could not load member detail</div>';
  }
}

function closeMemberDetailModal() {
  const modal = document.getElementById('membership-member-detail-modal');
  modal.classList.remove('organizational-modal-open');
  modal.hidden = true;
}

async function recordPayment(memberId) {
  const amountCents = prompt('Enter payment amount in cents (e.g., 10000 for $100.00):');
  if (!amountCents) return;
  
  const slug = getOrgSlug();
  try {
    await membershipFetch(`/api/organizational/${slug}/membership/members/${memberId}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amount_cents: parseInt(amountCents, 10),
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'manual'
      })
    });
    alert('Payment recorded');
    closeMemberDetailModal();
    loadMembers();
    loadSummary();
  } catch (e) {
    alert('Could not record payment: ' + e.message);
  }
}

async function sendReminder(memberId) {
  const slug = getOrgSlug();
  // Placeholder - actual implementation would use Postmark
  alert('Reminder sending — coming soon (Postmark integration)');
}

function sendRenewalReminders() {
  // Placeholder - actual implementation would batch send via Postmark
  alert('Batch reminder sending — coming soon (Postmark integration)');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCents(amountCents, currency) {
  const amount = Number(amountCents || 0) / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

function formatStatus(status) {
  const labels = {
    active: 'Active',
    grace_period: 'Grace Period',
    lapsed: 'Lapsed',
    terminated: 'Terminated',
    pending_first_payment: 'Pending'
  };
  return labels[status] || status;
}

// Initialize
async function init() {
  slug = getOrgSlug();
  if (!slug) {
    const errEl = document.getElementById('organizational-org-error');
    const loadingEl = document.getElementById('organizational-org-loading');
    if (errEl) {
      errEl.textContent = 'Invalid workspace URL.';
      errEl.hidden = false;
    }
    if (loadingEl) loadingEl.hidden = true;
    return;
  }

  const loadingEl = document.getElementById('organizational-org-loading');
  const errEl = document.getElementById('organizational-org-error');
  const dashEl = document.getElementById('organizational-org-dashboard');

  try {
    const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (res.status === 404) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.textContent = 'Organization not found.';
        errEl.hidden = false;
      }
      return;
    }
    const data = await res.json();
    if (!res.ok || !data.org) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.textContent = data.error || 'Could not load workspace.';
        errEl.hidden = false;
      }
      return;
    }

    const org = data.org;
    if (window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
      window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
    }
    if (window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
      window.OrganizationalHeader.setOrg(org.display_name || '—');
    }

    if (loadingEl) loadingEl.hidden = true;
    if (dashEl) dashEl.hidden = false;

    // Load membership data
    loadSummary();
    loadMembers();
  } catch (e) {
    if (loadingEl) loadingEl.hidden = true;
    if (errEl) {
      errEl.textContent = 'Could not load workspace.';
      errEl.hidden = false;
    }
  }

  // Initialize header elements
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    bindOrganizationalDropdownOutsideClick();

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeOrganizationalDropdown();
      closeOrganizationalOverlay();
    });

    document.addEventListener('click', (e) => {
      const overlay = e.target.closest('.organizational-overlay');
      if (overlay && e.target === overlay) {
        closeOrganizationalOverlay();
      }
    });
  })();
}

function closeOrganizationalDropdown() {
  const dd = document.getElementById('organizational-dropdown');
  const icon = document.getElementById('organizational-icon');
  if (dd) {
    dd.hidden = true;
    dd.setAttribute('aria-hidden', 'true');
  }
  if (icon) icon.setAttribute('aria-expanded', 'false');
}

function toggleOrganizationalDropdown(ev) {
  if (ev) ev.stopPropagation();
  const dd = document.getElementById('organizational-dropdown');
  const icon = document.getElementById('organizational-icon');
  if (!dd) return;
  const opening = dd.hidden;
  dd.hidden = !opening;
  dd.setAttribute('aria-hidden', opening ? 'false' : 'true');
  if (icon) icon.setAttribute('aria-expanded', opening ? 'true' : 'false');
}

let coopDropdownDocClickBound = false;
function bindOrganizationalDropdownOutsideClick() {
  if (coopDropdownDocClickBound) return;
  coopDropdownDocClickBound = true;
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('organizational-dropdown');
    const icon = document.getElementById('organizational-icon');
    if (!dd || dd.hidden) return;
    if (icon && icon.contains(e.target)) return;
    if (dd && dd.contains(e.target)) return;
    closeOrganizationalDropdown();
  });
}

function coopDropdownOpenMembers() {
  closeOrganizationalDropdown();
  openOrganizationalOverlay('members');
}

function coopDropdownOpenLibrary() {
  closeOrganizationalDropdown();
  openOrganizationalOverlay('library');
}

function coopDropdownOpenWorkPool() {
  closeOrganizationalDropdown();
  openOrganizationalOverlay('work-pool');
}

function openOrganizationalOverlay(type) {
  const overlay = document.getElementById('organizational-overlay-' + type);
  if (overlay) {
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    loadOrganizationalOverlayData(type);
  }
}

function closeOrganizationalOverlay() {
  document.querySelectorAll('.organizational-overlay').forEach(overlay => {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  });
  document.body.style.overflow = '';
}

async function loadOrganizationalOverlayData(type) {
  const listEl = document.getElementById('organizational-overlay-' + type + '-list');
  if (!listEl) return;

  if (type === 'members') {
    listEl.innerHTML = '<p class="organizational-empty">Loading member directory…</p>';
    try {
      const res = await fetch('/api/organizational/cooperative/members', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        const members = data.members || [];
        if (members.length === 0) {
          listEl.innerHTML = '<p class="organizational-empty">No members yet.</p>';
        } else {
          listEl.innerHTML = members.map(m => `
            <div class="organizational-list-item">
              <div class="organizational-list-item-main">
                <div class="organizational-list-item-title">${escapeHtml(m.display_name || m.slug || '—')}</div>
              </div>
            </div>
          `).join('');
        }
      } else {
        listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
      }
    } catch (e) {
      listEl.innerHTML = '<p class="organizational-error">Could not load members.</p>';
    }
  } else if (type === 'library') {
    listEl.innerHTML = '<p class="organizational-empty">Library coming soon.</p>';
  } else if (type === 'work-pool') {
    listEl.innerHTML = '<p class="organizational-empty">Work pool coming soon.</p>';
  }
}


// Expose functions globally
window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
window.closeOrganizationalDropdown = closeOrganizationalDropdown;
window.coopDropdownOpenMembers = coopDropdownOpenMembers;
window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
window.openOrganizationalOverlay = openOrganizationalOverlay;
window.closeOrganizationalOverlay = closeOrganizationalOverlay;

document.addEventListener("DOMContentLoaded", function() {
  init().catch(function(e) {
    const loadingEl = document.getElementById("organizational-org-loading");
    if (loadingEl) loadingEl.hidden = true;
    console.error("Membership load error:", e);
  });
});
})();
