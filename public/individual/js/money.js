/**
 * money.js — Finances section: Bank pledges, donations, investments
 * Rebuilt for individual/index.html design system
 */

// ─── STATE ───
let bankInstitutions = [];
let selectedBankInstitution = null;
let bankPledgeAmount = '';

// ─── COMMON BANKS DATA ───
const COMMON_BANKS = [
  { name: 'JPMorgan Chase', key: 'chase', fossil: '$53.5B' },
  { name: 'Bank of America', key: 'bank of america', fossil: '$40.9B' },
  { name: 'Citibank', key: 'citibank', fossil: '$34.0B' },
  { name: 'Wells Fargo', key: 'wells fargo', fossil: '$26.3B' },
  { name: 'Goldman Sachs', key: 'goldman sachs', fossil: '$18.0B' },
  { name: 'Morgan Stanley', key: 'morgan stanley', fossil: '$15.8B' },
  { name: 'Charles Schwab', key: 'schwab', fossil: 'Not ranked (asset manager)' },
  { name: 'Barclays', key: 'barclays', fossil: '$35.4B' },
  { name: 'HSBC', key: 'hsbc', fossil: '$17.3B' },
  { name: 'BNP Paribas', key: 'bnp paribas', fossil: '$16.8B' },
];

// ─── HELPERS ───
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatCurrency(cents) {
  return '$' + (Number(cents) / 100).toFixed(2);
}

function bankSafeDomId(flagKey) {
  return String(flagKey || '').replace(/[^a-z0-9]+/gi, '_');
}

function parseBankCsv(str) {
  return String(str || '')
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function showBankConnectionError(msg, mountId) {
  const el = document.getElementById((mountId || BANK_STATUS_MOUNT_ID) + '__bank-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function hideBankConnectionError(mountId) {
  showBankConnectionError('', mountId);
}

// ─── BANK STATUS: single mount on the Vest tab ───
// Proxies → Financial only shows a read-only summary (loadFinancialTrackingSummary in
// moves.js); all adding/changing/removing a bank happens here on Vest.
const BANK_STATUS_MOUNT_ID = 'vest-bank-status';

async function fetchBankStatusData() {
  const meRes = await fetch('/api/me', { credentials: 'same-origin' });
  const me = meRes.ok ? await meRes.json() : {};
  const userBank = String(me.bank || '').trim();
  if (userBank) window._causalBank = userBank;

  let flagData = null;
  if (userBank) {
    try {
      const checkRes = await fetch('/api/bank/check', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_name: userBank }),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        flagData = checkData.flagged ? checkData.flag_data : null;
      }
    } catch (_) {}
  }
  return { userBank, flagData, fundHoldingsFlag: me.fund_holdings_flag };
}

// Refreshes the bank status card plus everything downstream of it (pledge card,
// pressure campaigns, alternatives) after any mutation — add/change/remove bank,
// fund-holdings flag, etc.
async function refreshBankMounts() {
  await loadVestBanksSection();
  if (typeof loadFinancialTrackingSummary === 'function') loadFinancialTrackingSummary();
}

// Single combined card: bank name, flag status, fund-holdings, standing position
// (appended separately into #vest-pledge-section right below this), and
// change/remove — one card instead of a separate "X is flagged" banner plus a
// duplicate status card underneath (2026-08 consolidation). Also fixes a real
// contradiction the two-card version had: flagData can be truthy with no
// bocc_2024 figure (e.g. Charles Schwab, flagged as an asset manager whose funds
// invest in fossil fuels rather than for direct financing) — the old fallback
// text ("Not among the top fossil-fuel-financing banks...") fired for that case
// too, telling a flagged user their bank was clean.
function buildBankStatusCardHtml(mountId, userBank, flagData, fundHoldingsFlag) {
  const eid = (base) => mountId + '__' + base;
  let html = '';

  if (userBank) {
    const isFlagged = !!flagData;
    html += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">';
    html += '<div style="font-size:15px; font-weight:600; color:var(--text-primary);">' + escapeHtml(userBank) + '</div>';
    html += '<div style="display:flex; gap:12px;">';
    html += '<a href="#" onclick="bankAccountEdit(\'' + mountId + '\'); return false;" class="individual-link" style="font-size:12px; font-weight:600;">Change</a>';
    html += '<a href="#" onclick="removeUserBankSegment(\'' + escapeHtml(userBank).replace(/'/g, "\\'") + '\', \'' + mountId + '\'); return false;" class="individual-link" style="font-size:12px; font-weight:600;">Remove</a>';
    html += '</div></div>';

    if (isFlagged) {
      html += '<div style="font-size:13px; color:var(--red, #b91c1c); font-weight:600; margin-bottom:4px;">⚠ Flagged for fossil fuel financing</div>';
      if (flagData.bocc_2024) {
        html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">Fossil fuel financing: <strong>' + escapeHtml(flagData.bocc_2024) + ' (2024)</strong> — Source: Banking on Climate Chaos.</div>';
      } else if (flagData.note) {
        html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">' + escapeHtml(flagData.note) + '</div>';
      } else {
        html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">Source: Banking on Climate Chaos.</div>';
      }
      html += '<button type="button" class="app-btn app-btn-outline" style="font-size:12px; margin-bottom:12px;" onclick="scrollToBankAlternatives()">See values-aligned alternatives</button>';
    } else {
      html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">✓ Not flagged by Banking on Climate Chaos.</div>';
    }
    html += '<div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">If you hold investment or money market funds there, those are screened separately.</div>';

    if (fundHoldingsFlag === true) {
      html += '<div data-aspirational="purse" style="padding:10px 12px; background:var(--surface-page); border-radius:4px; margin-bottom:12px;">';
      html += '<!-- ASPIRATIONAL:PURSE -->';
      html += '<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; color:var(--text-secondary); margin-bottom:4px;">Holdings X-ray — coming soon</div>';
      html += '<div style="font-size:12px; color:var(--text-secondary);">We don\'t screen investment or money-market products at this institution yet. Once connected, this will show which of your fund holdings are fossil-fuel-misaligned, with dollar figures and a screened alternative fund to switch to.</div>';
      html += '<!-- /ASPIRATIONAL -->';
      html += '</div>';
    } else if (fundHoldingsFlag == null) {
      html += '<div style="padding:10px 12px; background:var(--surface-page); border-radius:4px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">';
      html += '<span style="font-size:12px; color:var(--text-secondary);">Do you hold funds or investments at ' + escapeHtml(userBank) + ' too?</span>';
      html += '<span style="display:flex; gap:6px;">';
      html += '<button type="button" class="app-btn app-btn-small" style="font-size:12px;" onclick="setFundHoldingsFlag(true, \'' + mountId + '\')">Yes</button>';
      html += '<button type="button" class="app-btn app-btn-outline app-btn-small" style="font-size:12px;" onclick="setFundHoldingsFlag(false, \'' + mountId + '\')">No</button>';
      html += '</span>';
      html += '</div>';
    }
  } else {
    html += '<div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">Tell us which bank you use so we can show you divestment progress.</div>';
    html += '<button type="button" class="app-btn" style="font-size:13px;" onclick="bankAccountAdd(\'' + mountId + '\')">Add Your Bank</button>';
    html += '<div id="' + eid('bank-inline-add') + '" style="display:none; margin-top:12px; padding:12px; background:var(--bg-secondary); border-radius:4px;">';
    html += '<label style="display:block; margin-bottom:8px; font-weight:600; font-size:13px;">Select your bank:</label>';
    html += '<select id="' + eid('bank-institution-select') + '" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:4px; font-size:13px; margin-bottom:8px;" onchange="selectBankFromDropdown(this.value, \'' + mountId + '\')">';
    html += '<option value="">Choose a bank...</option>';
    COMMON_BANKS.forEach(function(bank) {
      html += '<option value="' + escapeHtml(bank.key) + '">' + escapeHtml(bank.name) + ' (' + escapeHtml(bank.fossil) + ')</option>';
    });
    html += '</select>';
    html += '<div style="display:flex; gap:8px; margin-bottom:8px;">';
    html += '<input type="text" id="' + eid('bank-institution-input-inline') + '" placeholder="Or type your bank name..." style="flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:4px; font-size:13px;">';
    html += '<button type="button" class="app-btn" style="font-size:13px;" onclick="checkMyBank(true, \'' + mountId + '\')">Add</button>';
    html += '</div>';
    html += '<div id="' + eid('bank-error') + '" style="display:none; margin-top:8px; padding:8px 12px; background:var(--red-bg); border:1px solid #fecaca; border-radius:4px; color:var(--red); font-size:13px;"></div>';
    html += '<div id="' + eid('bank-info') + '" style="display:none; margin-top:8px; padding:8px 12px; background:var(--green-bg); border:1px solid #bbf7d0; border-radius:4px; color:var(--green); font-size:12px;"></div>';
    html += '</div>';
  }
  return html;
}

// ─── FINANCES HOME: LOAD DASHBOARD DATA ───
async function loadMoneyHomeData() {
  try {
    const meRes = await fetch('/api/me', { credentials: 'same-origin' });
    const me = meRes.ok ? await meRes.json() : {};
    const userBank = String(me.bank || '').trim();
    const bankCount = userBank ? 1 : 0;

    const banksEl = document.getElementById('money-home-banks');
    if (banksEl) banksEl.textContent = String(bankCount);
  } catch (e) {
    console.error('loadMoneyHomeData', e);
  }
}

// ─── VEST TAB: BANKS SECTION ───
// Orchestrates the whole Banks section on Vest: status card (with standing-position
// pledge + pressure actions folded in), then, only for a flagged bank, a secondary
// "More ways to act" group (live pressure campaigns + values-aligned alternatives).
// Called on first expand of the Banks section and after any mutation (add/change/
// remove bank, pledge, etc).
async function loadVestBanksSection() {
  const statusEl = document.getElementById(BANK_STATUS_MOUNT_ID);
  if (!statusEl) return;

  statusEl.innerHTML = '<div class="individual-hint" style="padding:8px 0;">Loading…</div>';
  const pledgeSection = document.getElementById('vest-pledge-section');
  const pressureSection = document.getElementById('vest-pressure-campaigns');
  const altSection = document.getElementById('vest-alternatives-section');
  const moreWaysWrap = document.getElementById('vest-more-ways');
  if (pledgeSection) pledgeSection.innerHTML = '';
  if (pressureSection) pressureSection.innerHTML = '';
  if (altSection) altSection.innerHTML = '';
  if (moreWaysWrap) moreWaysWrap.style.display = 'none';

  try {
    const { userBank, flagData, fundHoldingsFlag } = await fetchBankStatusData();
    statusEl.innerHTML = buildBankStatusCardHtml(BANK_STATUS_MOUNT_ID, userBank, flagData, fundHoldingsFlag);

    if (userBank) loadBankPledges(userBank, flagData);

    // "Move what you don't need" used to render as its own card here, duplicating the
    // status card's own "See values-aligned alternatives" CTA one scroll down — removed
    // 2026-09-28 as part of decluttering Banks; the alternatives list below covers it.
    if (userBank && flagData) {
      if (moreWaysWrap) moreWaysWrap.style.display = 'flex';
      loadBankPressureCampaigns(userBank, pressureSection);
      loadBankAlternatives(altSection);
    }
  } catch (e) {
    console.error('loadVestBanksSection', e);
    statusEl.innerHTML = '<div class="individual-empty">Error loading bank status</div>';
  }
}

// Real, curated alternatives (server/data/bank-alternatives.js, matched to the
// user's state) instead of a couple of hardcoded names.
async function loadBankAlternatives(container) {
  container = container || document.getElementById('vest-alternatives-section');
  if (!container) return;
  container.innerHTML = '<div class="individual-hint" style="padding:8px 0;">Loading alternatives…</div>';
  try {
    const res = await fetch('/api/bank/alternatives-suggestions', { credentials: 'same-origin' });
    const data = res.ok ? await res.json() : { banks: [], links: [] };
    const banks = Array.isArray(data.banks) ? data.banks : [];
    const links = Array.isArray(data.links) ? data.links : [];

    let html = '<div class="individual-card" id="bank-alternatives-section">';
    html += '<div style="font-weight:600; margin-bottom:4px;">Values-Aligned Alternatives</div>';

    // Not every bank promotes its own climate alignment, so the "Fossil Free
    // Alliance" badge is worth explaining once up top rather than assuming it's
    // self-evident — links to the actual program page (run by Bank.Green).
    if (banks.some((b) => b.fossilFreeAlliance)) {
      html += '<div class="individual-hint" style="margin-bottom:12px;">Badged banks are vetted members of the <a href="https://bank.green/certification/" target="_blank" rel="noopener" class="individual-link">Fossil Free Alliance</a> — a certification you may not find on the bank\'s own site.</div>';
    }

    if (banks.length) {
      html += '<div style="display:flex; flex-direction:column; gap:10px; max-height:280px; overflow-y:auto;">';
      banks.forEach((b) => {
        html += '<div style="padding-bottom:10px; border-bottom:1px solid var(--border);">';
        html += '<div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">';
        html += '<span style="font-weight:500; font-size:13px;">' + escapeHtml(b.name) + '</span>';
        html += '<span class="individual-hint" style="font-size:11px;">' + (b.type === 'credit_union' ? 'Credit union' : 'Bank') + '</span>';
        if (b.fossilFreeAlliance) html += '<a href="https://bank.green/certification/" target="_blank" rel="noopener" class="individual-timing-badge" style="font-size:10px; text-decoration:none;" title="What is the Fossil Free Alliance?">Fossil Free Alliance</a>';
        if (b.stateSpecific) html += '<span class="individual-hint" style="font-size:11px;">near you</span>';
        html += '</div>';
        if (b.website) html += '<a href="' + escapeHtml(b.website) + '" target="_blank" rel="noopener" class="individual-link" style="font-size:12px;">' + escapeHtml(b.website.replace(/^https?:\/\//, '')) + ' →</a>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="individual-hint" style="margin-bottom:8px;">No curated matches for your area yet — search directories below.</div>';
    }

    if (links.length) {
      html += '<div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">';
      links.forEach((l) => {
        html += '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener" class="individual-link" style="font-size:12px;">' + escapeHtml(l.label) + ' →</a>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    console.error('loadBankAlternatives', e);
    container.innerHTML = '<div class="individual-empty">Could not load alternatives</div>';
  }
}

// Live campaigns/resolutions currently targeting this specific bank (Gemini-backed,
// server/individual/routes/bank.js `/api/bank/pressure`). Cached per bank per session
// since it's an LLM call — no point re-querying on every section toggle.
const _bankPressureCampaignCache = {};
async function loadBankPressureCampaigns(bankName, container) {
  container = container || document.getElementById('vest-pressure-campaigns');
  if (!container) return;
  const key = String(bankName || '').toLowerCase();
  if (!key) return;

  const renderResults = (results) => {
    if (!results.length) return;
    let html = container.innerHTML;
    html += '<div class="individual-card"><div style="font-weight:600; margin-bottom:10px;">Current campaigns targeting ' + escapeHtml(bankName) + '</div>';
    html += '<div style="display:flex; flex-direction:column; gap:10px;">';
    results.forEach((r) => {
      html += '<div style="padding-bottom:10px; border-bottom:1px solid var(--border);">';
      html += '<a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener" class="individual-link" style="font-size:13px; font-weight:500;">' + escapeHtml(r.title) + '</a>';
      html += '<div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">' + escapeHtml(r.description) + ' — <em>' + escapeHtml(r.source) + '</em></div>';
      html += '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
  };

  if (_bankPressureCampaignCache[key]) {
    renderResults(_bankPressureCampaignCache[key]);
    return;
  }

  try {
    const res = await fetch('/api/bank/pressure?bank=' + encodeURIComponent(bankName), { credentials: 'same-origin' });
    const data = res.ok ? await res.json() : { results: [] };
    const results = Array.isArray(data.results) ? data.results : [];
    _bankPressureCampaignCache[key] = results;
    renderResults(results);
  } catch (e) {
    console.error('loadBankPressureCampaigns', e);
  }
}

async function checkMyBank(isAddFlow, mountId) {
  mountId = mountId || BANK_STATUS_MOUNT_ID;
  const input = isAddFlow
    ? document.getElementById(mountId + '__bank-institution-input-inline')
    : document.getElementById('bank-institution-input');
  const institutionName = input && input.value ? String(input.value).trim() : '';

  if (!institutionName) {
    showBankConnectionError('Enter your bank name.', mountId);
    return;
  }

  try {
    hideBankConnectionError(mountId);
    const r = await fetch('/api/bank/check', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: institutionName }),
    });

    let data = null;
    try {
      data = await r.json();
    } catch (e) {}

    if (!r.ok) {
      showBankConnectionError(
        data && data.error ? data.error : 'Could not check your bank. Please try again.',
        mountId
      );
      return;
    }

    if (data && data.institution_name) {
      await appendBankToSettings(data.institution_name);
      if (input) input.value = '';
      if (isAddFlow) {
        toggleBankInlineAdd(false, mountId);
      }
      await refreshBankMounts();
    }
  } catch (e) {
    console.error('Bank check failed:', e);
    showBankConnectionError(e.message || 'Could not check your bank. Please try again.', mountId);
  }
}

async function appendBankToSettings(displayName) {
  const r = await fetch('/api/settings', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ append_bank: displayName }),
  });
  const data = await r.json().catch(function () {
    return {};
  });
  if (!r.ok) throw new Error(data.error || 'Could not save bank list');
  if (data.bank != null) window._causalBank = data.bank;
}

async function removeUserBankSegment(segment, mountId) {
  const seg = String(segment || '').trim();
  if (!seg) return;
  try {
    const r = await fetch('/api/bank/bank', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ institution_display: seg }),
    });
    const data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      alert(data.error || 'Could not remove bank.');
      return;
    }
    window._causalBank = data.bank != null ? data.bank : '';
    await refreshBankMounts();
  } catch (e) {
    alert('Network error.');
  }
}

function toggleBankInlineAdd(force, mountId) {
  mountId = mountId || BANK_STATUS_MOUNT_ID;
  const row = document.getElementById(mountId + '__bank-inline-add');
  if (!row) return;
  let open;
  if (force === true) open = true;
  else if (force === false) open = false;
  else open = row.style.display === 'none' || row.style.display === '';
  row.style.display = open ? 'block' : 'none';
  const input = document.getElementById(mountId + '__bank-institution-input-inline');
  if (open) {
    if (input) setTimeout(function () { input.focus(); }, 0);
  } else {
    if (input) input.value = '';
  }
}

function bankAccountAdd(mountId) {
  toggleBankInlineAdd(true, mountId);
}

function bankAccountEdit(mountId) {
  toggleBankInlineAdd(true, mountId);
}

function scrollToBankAlternatives() {
  const el = document.getElementById('bank-alternatives-section');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setFundHoldingsFlag(flag) {
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fund_holdings_flag: !!flag }),
    });
    if (!res.ok) {
      alert('Could not save. Please try again.');
      return;
    }
    await refreshBankMounts();
  } catch (e) {
    alert('Network error.');
  }
}

async function selectBankFromDropdown(bankKey, mountId) {
  mountId = mountId || BANK_STATUS_MOUNT_ID;
  const select = document.getElementById(mountId + '__bank-institution-select');
  const input = document.getElementById(mountId + '__bank-institution-input-inline');
  const info = document.getElementById(mountId + '__bank-info');

  if (!bankKey) {
    if (input) input.value = '';
    if (info) info.style.display = 'none';
    return;
  }

  // Fetch bank data from API
  try {
    const res = await fetch('/api/bank/check', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: bankKey }),
    });

    if (!res.ok) {
      if (info) {
        info.innerHTML = '<strong>Could not load bank information</strong>';
        info.style.display = 'block';
      }
      return;
    }

    const data = await res.json();
    const bankName = data.institution_name || bankKey;
    const flagData = data.flag_data || {};

    if (input) input.value = bankName;

    if (info) {
      let infoText = '<strong>' + escapeHtml(bankName) + '</strong>';

      if (flagData.bocc_2024) {
        infoText += ' financed ' + escapeHtml(flagData.bocc_2024) + ' in fossil fuels in 2024.';
      } else if (flagData.note) {
        infoText += ' — ' + escapeHtml(flagData.note);
      } else {
        infoText += ' has significant fossil fuel exposure.';
      }

      infoText += ' By diverting your funds, you apply pressure on this institution to divest from fossil fuels.';

      info.innerHTML = infoText;
      info.style.display = 'block';
    }
  } catch (e) {
    console.error('selectBankFromDropdown error:', e);
    if (info) {
      info.innerHTML = '<strong>Error loading bank data</strong>';
      info.style.display = 'block';
    }
  }
}

// ─── VEST TAB: INVESTMENTS SECTION ───
let _lastInvestContainer = null;

// Known-ticker lookup — flags are real for these five; anything else falls back to a
// generic "Research this holding" note rather than a fabricated score. No general
// ticker-screening data source exists yet.
const TICKER_SAMPLES = {
  'SWVXX': { name: 'Schwab Money Market', type: 'mmf', flag: 'warn', flagText: 'Banks with fossil fuel exposure' },
  'VMFXX': { name: 'Vanguard Fed Money Market', type: 'mmf', flag: 'ok', flagText: 'Treasury/Government only' },
  'SCHB': { name: 'Schwab US Broad Market ETF', type: 'broad', flag: 'info', flagText: 'Contains fossil fuels — consider shareholder action' },
  'VTI': { name: 'Vanguard Total Stock Market', type: 'broad', flag: 'info', flagText: 'Contains fossil fuels — consider shareholder action' },
  'FSKAX': { name: 'Fidelity Total Market Index', type: 'broad', flag: 'info', flagText: 'Contains fossil fuels — consider shareholder action' },
};

async function loadInvestTab(targetEl) {
  const container = targetEl || _lastInvestContainer || document.getElementById('vest-invest-content');
  if (!container) return;
  _lastInvestContainer = container;

  try {
    const res = await fetch('/api/user/invest-tickers', { credentials: 'same-origin' });
    const data = res.ok ? await res.json() : {};
    const tickers = Array.isArray(data.tickers) ? data.tickers : [];
    window._causalInvestTickers = tickers;
  } catch (_) {
    window._causalInvestTickers = [];
  }

  let html = '';

  if (window._causalInvestTickers && window._causalInvestTickers.length) {
    html += '<div><h3 style="font-size:13px; font-weight:600; margin-bottom:8px;">Your Holdings</h3>';
    window._causalInvestTickers.forEach((ticker) => {
      const info = TICKER_SAMPLES[ticker] || { name: ticker, type: 'unknown', flag: 'info', flagText: 'Research this holding' };
      html += '<div class="individual-card" style="margin-bottom:8px;">';
      html += '<div style="display:flex; justify-content:space-between; align-items:flex-start;">';
      html += '<div><div style="font-weight:600;">' + escapeHtml(ticker) + '<span class="individual-hint" style="font-weight:400;"> — ' + escapeHtml(info.name) + '</span></div>';
      html += '<div class="individual-hint">' + escapeHtml(info.flagText) + '</div></div>';
      html += '<button type="button" class="app-btn app-btn-outline" style="font-size:12px;" onclick="removeTicker(\'' + escapeHtml(ticker) + '\')">Remove</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  html += '<div class="individual-card">';
  html += '<div style="font-weight:600; margin-bottom:8px;">Add a holding</div>';
  html += '<div style="display:flex; gap:8px;">';
  html += '<input type="text" id="vest-ticker-input" placeholder="Ticker symbol, e.g. VTI" style="flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:4px; font-size:13px; text-transform:uppercase;" maxlength="10" onkeydown="if(event.key===\'Enter\'){event.preventDefault(); submitVestTicker();}">';
  html += '<button type="button" class="app-btn" style="font-size:13px;" onclick="submitVestTicker()">Add</button>';
  html += '</div>';
  html += '<div id="vest-ticker-error" style="display:none; margin-top:8px; font-size:12px; color:var(--red);"></div>';
  html += '<div class="individual-hint" style="margin-top:8px;">We can flag a small set of known funds today; other tickers show as unscreened until we have real data.</div>';
  html += '</div>';

  container.innerHTML = html;
}

function submitVestTicker() {
  const input = document.getElementById('vest-ticker-input');
  const errEl = document.getElementById('vest-ticker-error');
  const raw = input && input.value ? String(input.value).trim().toUpperCase() : '';
  if (errEl) errEl.style.display = 'none';
  if (!raw || !/^[A-Z0-9]{1,10}$/.test(raw)) {
    if (errEl) { errEl.textContent = 'Enter a valid ticker symbol.'; errEl.style.display = 'block'; }
    return;
  }
  addTickerToList(raw);
  if (input) input.value = '';
}
window.submitVestTicker = submitVestTicker;

function addTickerToList(ticker) {
  if (!window._causalInvestTickers) window._causalInvestTickers = [];
  if (!window._causalInvestTickers.includes(ticker)) {
    window._causalInvestTickers.push(ticker);
    saveInvestTickers(window._causalInvestTickers);
    loadInvestTab();
  }
}

async function removeTicker(ticker) {
  if (!window._causalInvestTickers) return;
  window._causalInvestTickers = window._causalInvestTickers.filter(t => t !== ticker);
  await saveInvestTickers(window._causalInvestTickers);
  loadInvestTab();
}

async function saveInvestTickers(tickers) {
  try {
    await fetch('/api/user/invest-tickers', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers })
    });
  } catch (e) {
    console.error('saveInvestTickers', e);
  }
}

// ─── BANK PLEDGE SYSTEM ───

async function loadBankPledges(userBank, flagData) {
  const section = document.getElementById('vest-pledge-section');
  if (!section) return;
  const bank = userBank || window._causalBank || '';
  if (!bank) return;

  const bankInfo = COMMON_BANKS.find(function(b) {
    return b.name.toLowerCase() === bank.toLowerCase();
  });
  if (!bankInfo || !bankInfo.key) return;

  try {
    const res = await fetch('/api/bank/pledge-stats?institution=' + encodeURIComponent(bankInfo.key), {
      credentials: 'same-origin'
    });
    if (!res.ok) return;
    const stats = await res.json();
    renderBankPledgeCard(section, bankInfo, stats, flagData && flagData.pressure ? flagData.pressure : null);
  } catch (e) {
    console.error('loadBankPledges', e);
  }
}

function formatPromiseDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

// Real, bank-specific campaign URLs curated in server/data/bank-flag-data.js — not
// every bank has all three.
const PRESSURE_ACTION_LABELS = {
  c4cj: 'Sign the Banking on Climate Chaos campaign',
  bankgreen: 'Pledge to move on Bank.Green',
  third_act: 'Join Third Act',
};
const PRESSURE_ACTION_URL_FIELDS = { c4cj: 'c4cj_url', bankgreen: 'bankgreen_action_url', third_act: 'third_act_url' };

function renderBankPledgeCard(section, bankInfo, stats, pressureUrls) {
  const count = Number(stats.pledger_count) || 0;
  const userStatus = stats.user_pledge_status;
  const key = escapeHtml(bankInfo.key || '');
  const name = escapeHtml(bankInfo.name || '');
  const domId = bankSafeDomId(bankInfo.key || '');
  const conditionDeadline = stats.user_condition_deadline || null;
  const actionCounts = stats.pressure_action_counts || {};
  const userActions = Array.isArray(stats.user_pressure_actions) ? stats.user_pressure_actions : [];

  // No own card wrapper — this mounts directly under the Bank Status card
  // (#vest-bank-status-card in index.html) as its second half, not a separate box.
  let html = '<div style="border-top:1px solid var(--border); padding-top:14px; margin-top:2px;">';
  html += '<div style="font-weight:600; margin-bottom:8px;">Standing position</div>';

  if (count > 0) {
    html += '<div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;"><strong>' + count + ' ' + (count === 1 ? 'person' : 'people') + '</strong> have a standing position against ' + name + '.</div>';
  } else {
    html += '<div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">Take a standing position against ' + name + ' to be counted.</div>';
  }

  if (!userStatus || userStatus === 'partial_divest') {
    // No pledge yet — show take-position button, with an optional amount so "Money moved"
    // on Your Position can total up to something real instead of just a bank-name list.
    html += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; font-size:12px;">';
    html += '<span class="individual-hint" style="margin:0;">Amount you\'re moving (optional)</span>';
    html += '<input type="number" min="0" step="1" id="bank-pledge-amount-' + domId + '" placeholder="$" style="width:100px; padding:5px 8px; border:1px solid var(--border); border-radius:4px; font-size:12px;">';
    html += '</div>';
    html += '<button type="button" class="app-btn" style="font-size:13px;" onclick="bankPledgeSubmit(\'' + key + '\', \'' + domId + '\')">Take a standing position</button>';
  } else if (userStatus === 'pledged') {
    html += '<div style="font-size:12px; color:var(--green); margin-bottom:10px;">✓ Standing position held</div>';
    html += '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">';
    html += '<button type="button" class="app-btn app-btn-small" style="font-size:12px;" onclick="bankPledgeMarkDivested(\'' + key + '\')">I\'ve divested</button>';
    html += '<button type="button" class="app-btn app-btn-outline app-btn-small" style="font-size:12px;" onclick="bankPledgeWithdraw(\'' + key + '\')">Withdraw</button>';
    html += '</div>';
  } else if (userStatus === 'divested') {
    html += '<div style="font-size:12px; color:var(--green); margin-bottom:10px;">✓ Divested</div>';
    html += '<button type="button" class="app-btn app-btn-outline app-btn-small" style="font-size:12px;" onclick="bankPledgeWithdraw(\'' + key + '\')">Withdraw</button>';
  }

  if (pressureUrls) {
    const available = ['c4cj', 'bankgreen', 'third_act'].filter((t) => pressureUrls[PRESSURE_ACTION_URL_FIELDS[t]]);
    if (available.length) {
      html += '<div style="border-top:1px solid var(--border); margin-top:14px; padding-top:12px;">';
      html += '<div style="font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:8px;">Take it further — actually move the needle</div>';
      html += '<div style="display:flex; flex-direction:column; gap:6px;">';
      available.forEach((t) => {
        const url = escapeHtml(pressureUrls[PRESSURE_ACTION_URL_FIELDS[t]]);
        const done = userActions.includes(t);
        const c = Number(actionCounts[t]) || 0;
        html += '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">';
        html += '<a href="' + url + '" target="_blank" rel="noopener" class="individual-link" style="font-size:12px;" onclick="bankPressureActionSubmit(\'' + key + '\', \'' + t + '\')">' + escapeHtml(PRESSURE_ACTION_LABELS[t]) + ' →</a>';
        html += '<span style="font-size:11px; color:var(--text-secondary);">' + (done ? '✓ done' : '') + (c ? (done ? ' · ' : '') + c + ' ' + (c === 1 ? 'person' : 'people') : '') + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  if (userStatus !== 'divested' && (window._causalVisitedFinancial || conditionDeadline)) {
    html += '<div style="border-top:1px solid var(--border); margin-top:14px; padding-top:12px;">';
    if (conditionDeadline) {
      html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">You\'ve promised to move your money if ' + name + ' hasn\'t improved its financing record by <strong>' + escapeHtml(formatPromiseDate(conditionDeadline)) + '</strong>.</div>';
    } else {
      html += '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">Not ready? Make it a promise instead:</div>';
    }
    html += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px;">';
    html += '<span>I\'ll move my money if ' + name + ' hasn\'t improved by</span>';
    html += '<input type="date" id="bank-promise-date-' + domId + '" style="padding:5px 8px; border:1px solid var(--border); border-radius:4px; font-size:12px;" value="' + (conditionDeadline || '') + '" min="' + new Date().toISOString().slice(0, 10) + '">';
    html += '<button type="button" class="app-btn app-btn-small" style="font-size:12px;" onclick="bankPromiseSubmit(\'' + key + '\', \'' + domId + '\')">' + (conditionDeadline ? 'Extend' : 'Set reminder') + '</button>';
    html += '</div>';
    html += '</div>';
  }

  html += '<div style="font-size:11px; color:var(--text-secondary); margin-top:10px; line-height:1.5;">We share aggregated positions with bank investor relations and government affairs teams.</div>';

  // ASPIRATIONAL:PURSE — the pledger count above is already real and live; what's
  // missing is a public (non-login) dollar total and a timed institutional letter.
  // See docs/Causal_Development_Path.md "Purse — coordinated financial leverage".
  html += '<div data-aspirational="purse" style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">';
  html += '<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; color:var(--text-secondary); margin-bottom:4px;">Public ticker — coming soon</div>';
  html += '<div style="font-size:12px; color:var(--text-secondary);">A public, running dollar total for ' + name + ' — visible without logging in — plus a letter to the bank\'s investor relations team timed to its next AGM once a threshold is met.</div>';
  html += '</div>';
  // /ASPIRATIONAL

  html += '</div>';

  section.innerHTML = html;
}

async function bankPromiseSubmit(institutionKey, domId) {
  const input = document.getElementById('bank-promise-date-' + domId);
  const dateVal = input && input.value ? input.value : '';
  if (!dateVal) { alert('Choose a date first.'); return; }
  try {
    const res = await fetch('/api/bank/pledge/condition', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: institutionKey, condition_deadline: dateVal }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not save promise.');
      return;
    }
    await loadVestBanksSection();
  } catch (e) {
    alert('Network error.');
  }
}

async function bankPledgeSubmit(institutionKey, domId) {
  try {
    const amountInput = domId ? document.getElementById('bank-pledge-amount-' + domId) : null;
    const amountDollars = amountInput && amountInput.value ? Number(amountInput.value) : null;
    const body = { institution_name: institutionKey };
    if (amountDollars != null && Number.isFinite(amountDollars) && amountDollars >= 0) {
      body.pledge_amount = Math.round(amountDollars * 100);
    }
    const res = await fetch('/api/bank/pledge', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      await loadVestBanksSection();
    }
  } catch (e) {
    console.error('bankPledgeSubmit', e);
  }
}

async function bankPledgeMarkDivested(institutionKey) {
  try {
    const res = await fetch('/api/bank/pledge', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: institutionKey, status: 'divested' })
    });
    if (res.ok) {
      await loadVestBanksSection();
    }
  } catch (e) {
    console.error('bankPledgeMarkDivested', e);
  }
}

async function bankPledgeWithdraw(institutionKey) {
  try {
    const res = await fetch('/api/bank/pledge', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: institutionKey })
    });
    if (res.ok) {
      await loadVestBanksSection();
    }
  } catch (e) {
    console.error('bankPledgeWithdraw', e);
  }
}

// Records that the user actually clicked through to sign/pledge/join at C4CJ /
// Bank.Green / Third Act — the "actually show it moved" layer beyond just holding a
// standing position. Fire-and-forget: the link itself opens regardless.
async function bankPressureActionSubmit(institutionKey, actionType) {
  try {
    const res = await fetch('/api/bank/pressure-action', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_name: institutionKey, action_type: actionType })
    });
    if (res.ok) {
      await loadVestBanksSection();
    }
  } catch (e) {
    console.error('bankPressureActionSubmit', e);
  }
}
window.bankPressureActionSubmit = bankPressureActionSubmit;

// ─── GIVE TAB HELPERS ───
function getDomainFromOrgUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const hostname = u.hostname || '';
    if (!hostname) return null;
    const parts = hostname.split('.');
    const domain = parts.slice(-2).join('.');
    const rejectList = ['rs6.net', 'cc.net', 'exacttarget.com'];
    if (rejectList.includes(domain)) return null;
    return domain;
  } catch (_) {
    return null;
  }
}

// Delegates to causalOrgLogoHtml (moves.js, loaded first) — single source of truth for
// logo rendering (local-override lookup, object-fit:contain sizing, initials fallback)
// so the Give list matches every other logo slot in the app.
function getGiveOrgLogoHtml(org) {
  const domain = getDomainFromOrgUrl(org.donation_url || org.website_url);
  return causalOrgLogoHtml(domain, org.name, 24);
}

function toggleGiveOrgUnfollowDropdown(orgId, triggerEl) {
  const wrap = triggerEl && triggerEl.closest ? triggerEl.closest('.give-org-unfollow-trigger-wrap') : null;
  const dropdown = wrap ? wrap.querySelector('.individual-dropdown') : null;
  if (!dropdown) return;
  const open = dropdown.hasAttribute('hidden');
  document.querySelectorAll('.individual-dropdown').forEach((dd) => {
    if (dd !== dropdown) dd.setAttribute('hidden', '');
  });
  if (open) dropdown.removeAttribute('hidden');
  else dropdown.setAttribute('hidden', '');
}

function hideGiveOrgUnfollowDropdown(triggerEl) {
  const dropdown = triggerEl && triggerEl.closest ? triggerEl.closest('.individual-dropdown') : null;
  if (dropdown) dropdown.setAttribute('hidden', '');
}

async function confirmGiveOrgUnfollow(orgId, btnEl) {
  const row = btnEl && btnEl.closest ? btnEl.closest('.proxies-give-row') : null;
  if (!row) return;
  const catalog = window._giveOrgsCatalog || [];
  const org = catalog.find((o) => o.id === orgId);
  const isContributed = org && org.subscription_status === 'user_contributed';
  try {
    let r;
    if (isContributed) {
      r = await fetch('/api/user/contributed-orgs/' + orgId, { method: 'DELETE', credentials: 'same-origin' });
    } else {
      r = await fetch('/api/user/org-preference', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, followed: false }),
      });
    }
    if (!r.ok) throw new Error('Unfollow failed');
    row.remove();
  } catch (e) {
    console.error(e);
    alert('Could not unfollow. Please try again.');
  }
}

// Dedupe by name: same org can appear in both orgs + user_contributed_orgs.
// Prefer the canonical entry (has donation_url) over user-contributed (has null donation_url).
function normalizeOrgNameKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (e.g. Ekō → Eko)
    .toLowerCase()
    .trim();
}

function dedupeGiveOrgs(orgs) {
  const seenNames = new Map();
  (Array.isArray(orgs) ? orgs : []).forEach(org => {
    const key = normalizeOrgNameKey(org.name);
    const existing = seenNames.get(key);
    if (!existing) {
      seenNames.set(key, org);
      return;
    }
    // Same org can show up twice — once platform-tracked, once added by the user via
    // "+ Add an org". Keep the real, platform-tracked record (has actual giving
    // history, turnaround tags, and an activity summary) over a private-only stub.
    // is_private_only (set by /api/give/orgs) is the reliable signal for that — a
    // real org can also lack donation_url, so that alone isn't a safe tie-break.
    const keepRow = existing.is_private_only && !org.is_private_only ? org
      : !existing.is_private_only && org.is_private_only ? existing
      : (!existing.donation_url && org.donation_url ? org : existing);
    const isUserAdded = existing.subscription_status === 'user_contributed' || org.subscription_status === 'user_contributed';
    seenNames.set(key, isUserAdded ? { ...keepRow, subscription_status: 'user_contributed' } : keepRow);
  });
  return Array.from(seenNames.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

let _lastGiveFeedContainer = null;

async function loadGiveFeed(targetEl) {
  const container = targetEl || _lastGiveFeedContainer;
  if (!container) return;
  _lastGiveFeedContainer = container;

  try {
    const res = await fetch('/api/give/orgs', { credentials: 'same-origin' });
    if (!res.ok) {
      container.innerHTML = '<div class="individual-empty">Could not load organizations. Please refresh.</div>';
      return;
    }
    const orgs = await res.json();
    if (!Array.isArray(orgs)) {
      container.innerHTML = '<div class="individual-empty">Could not load organizations. Please refresh.</div>';
      return;
    }

    const dedupedOrgs = dedupeGiveOrgs(orgs);

    if (!dedupedOrgs.length) {
      container.innerHTML = `
        <div style="padding:32px 0; text-align:center;">
          <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:8px;">Track who you support</div>
          <div style="font-size:13px; color:var(--text-secondary); margin-bottom:24px; max-width:300px; margin-left:auto; margin-right:auto;">
            Add organizations you support to see what they're working on and give directly from here.
          </div>
          <button type="button" class="app-btn" onclick="openContributedOrgSheet()">+ Add an org</button>
        </div>`;
      return;
    }

    window._giveOrgsCatalog = dedupedOrgs;
    let html = '<button type="button" class="proxies-give-add-org-btn" onclick="openContributedOrgSheet()">+ Add an org</button>';

    const renderGiveFeedRow = (org) => {
      const id = org.id;
      const name = escapeHtml(org.name || '');
      const escapedName = name.replace(/'/g, "\\'");
      // Fall back to the org's homepage when there's no specific donation-page URL
      // on file — otherwise "Give now" silently skips straight to the confirmation
      // modal without ever opening anything, which reads as broken.
      const escapedDonationUrl = escapeHtml(org.donation_url || org.website_url || '').replace(/'/g, "\\'");
      movesOrgNameById[id] = String(org.name || '');
      const logoHtml = getGiveOrgLogoHtml(org);
      const rawSiteUrl = org.website_url || '';
      const siteUrl = rawSiteUrl && !/^https?:\/\//i.test(rawSiteUrl) ? 'https://' + rawSiteUrl : rawSiteUrl;
      const summaryText = org.activity_summary_text ? escapeHtml(org.activity_summary_text) : '';

      const givenCents = Number(org.given_cents_year) || 0;
      const giftCount = Number(org.gift_count_year) || 0;
      const givenLabel = givenCents > 0
        ? '$' + (givenCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' given this year (' + giftCount + (giftCount === 1 ? ' gift' : ' gifts') + ')'
        : 'Not given to yet this year';

      let row = '<div class="proxies-give-row">';
      row += '<div class="proxies-give-row-name">';
      row += logoHtml;
      row += '<div>';
      row += '<div>' + name + '</div>';
      if (summaryText) {
        row += '<div class="individual-hint" style="margin-top:3px; white-space:normal; line-height:1.4;">' + summaryText + '</div>';
      }
      row += '<div class="individual-hint" style="margin-top:3px;">' + givenLabel + '</div>';
      row += '</div>';
      row += '</div>';
      row += '<div class="proxies-give-row-actions">';
      row += '<button type="button" class="individual-cta-badge" style="min-width:64px; font-size:13px; padding:5px 14px;" onclick="initiateGive(' + id + ', \'' + escapedName + '\', \'' + escapedDonationUrl + '\')">Give now</button>';
      row += '<div class="give-org-menu-wrap" style="position:relative;">' +
        '<button type="button" style="background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:16px; padding:4px 6px;" onclick="toggleGiveOrgMenuDropdown(' + id + ', this)">⋯</button>' +
        '<div class="individual-dropdown" hidden style="position:absolute; top:100%; right:0; background:white; border:1px solid var(--border); border-radius:6px; min-width:140px; z-index:10;">' +
          '<button type="button" style="display:block; width:100%; text-align:left; padding:8px 12px; border:none; background:none; cursor:pointer; font-size:12px;" onclick="hideGiveOrgMenuDropdown(this); openOrgDonationSheet(' + id + ')">Log donation</button>' +
          (siteUrl ? '<a href="' + escapeHtml(siteUrl) + '" target="_blank" rel="noopener noreferrer" style="display:block; width:100%; box-sizing:border-box; text-align:left; padding:8px 12px; background:none; cursor:pointer; font-size:12px; color:var(--text-primary); text-decoration:none;">Visit site</a>' : '') +
          '<button type="button" style="display:block; width:100%; text-align:left; padding:8px 12px; border:none; background:none; cursor:pointer; font-size:12px; color:#991b1b;" onclick="hideGiveOrgMenuDropdown(this); confirmGiveOrgUnfollow(' + id + ', this)">Unfollow</button>' +
        '</div>' +
      '</div>';
      row += '</div></div>';
      return row;
    };

    const selfAdded = dedupedOrgs.filter((o) => o.subscription_status === 'user_contributed');
    const platformSubs = dedupedOrgs.filter((o) => o.subscription_status !== 'user_contributed');

    if (selfAdded.length) {
      html += '<div class="volunteer-opportunities-heading">Your orgs</div>';
      html += '<div class="proxies-give-list">';
      selfAdded.forEach((org) => { html += renderGiveFeedRow(org); });
      html += '</div>';
    }

    if (platformSubs.length) {
      html += '<div class="volunteer-opportunities-heading"' + (selfAdded.length ? ' style="margin-top:20px;"' : '') + '>Platform subscriptions</div>';
      html += '<div class="proxies-give-list">';
      platformSubs.forEach((org) => { html += renderGiveFeedRow(org); });
      html += '</div>';
    }

    container.innerHTML = html;
  } catch (e) {
    console.error('loadGiveFeed', e);
    container.innerHTML = '<div class="individual-empty">Error loading organizations</div>';
  }
}

// ─── GIVE TAB: DROPDOWN MENU HANDLERS ───
function toggleGiveOrgMenuDropdown(orgId, triggerEl) {
  const dropdown = triggerEl.nextElementSibling;
  if (!dropdown) return;
  const isHidden = dropdown.hidden;
  document.querySelectorAll('.individual-dropdown').forEach(el => {
    if (el !== dropdown) el.hidden = true;
  });
  dropdown.hidden = !isHidden;
}

function hideGiveOrgMenuDropdown(contextEl) {
  const dropdown = contextEl.closest('.individual-dropdown');
  if (dropdown) dropdown.hidden = true;
}

// Close Give dropdowns when clicking outside any menu wrapper
document.addEventListener('click', function(e) {
  const wrapper = e.target.closest('.give-org-menu-wrap');
  if (!wrapper) {
    document.querySelectorAll('.give-org-menu-wrap .individual-dropdown').forEach(dd => {
      dd.hidden = true;
    });
  }
});

// ─── DONATION FLOW STATE ───
let donateOrgId = null;
let donateOrgName = null;

// ─── CAUSAL ADDRESS DONATE MODAL ───
let causalDonateOrgId = null;
let causalDonateOrgName = null;
let causalDonateUrl = null;

function openCausalAddressDonate(orgId, orgName, url) {
  causalDonateOrgId = orgId;
  causalDonateOrgName = orgName;
  causalDonateUrl = url;
  const modal = document.getElementById('causal-address-donate-modal');
  if (!modal) return;
  const addressEl = document.getElementById('causal-donate-address');
  if (addressEl) addressEl.textContent = window.CAUSAL_ADDRESS || '';
  modal.classList.add('active');
}

function closeCausalAddressDonate() {
  const modal = document.getElementById('causal-address-donate-modal');
  if (modal) modal.classList.remove('active');
  causalDonateOrgId = null;
  causalDonateOrgName = null;
  causalDonateUrl = null;
}

function copyCausalAddress() {
  const addr = window.CAUSAL_ADDRESS || '';
  if (!addr) { alert('No Causal address available'); return; }
  navigator.clipboard.writeText(addr).then(() => {
    const btn = document.getElementById('causal-donate-copy-btn');
    if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
  }).catch(() => { alert('Failed to copy'); });
}

function openOrgDonationSite() {
  if (!causalDonateUrl) return;
  window.open(causalDonateUrl, '_blank', 'noopener noreferrer');
  closeCausalAddressDonate();
  setTimeout(() => { openDonationConfirmModal(); }, 2000);
}

function openDonationConfirmModal() {
  const modal = document.getElementById('donation-confirm-modal');
  if (!modal) return;
  const nameEl = document.getElementById('donation-confirm-org-name');
  if (nameEl) nameEl.textContent = donateOrgName || '';
  const dateEl = document.getElementById('donation-confirm-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  const amountEl = document.getElementById('donation-confirm-amount');
  if (amountEl) amountEl.value = '';
  modal.classList.add('active');
  if (amountEl) setTimeout(function () { amountEl.focus(); }, 40);
}

function initiateGive(orgId, orgName, donationUrl) {
  donateOrgId = Number(orgId);
  donateOrgName = orgName || '';
  if (donationUrl) {
    const utmParams = 'utm_source=causal&utm_medium=referral&utm_campaign=causal.works';
    const urlWithUtm = donationUrl + (donationUrl.indexOf('?') > -1 ? '&' : '?') + utmParams;
    window.open(urlWithUtm, '_blank', 'noopener noreferrer');
    setTimeout(function () {
      openDonationConfirmModal();
    }, 2500);
  } else {
    openDonationConfirmModal();
  }
}

function closeDonationConfirmModal() {
  const modal = document.getElementById('donation-confirm-modal');
  if (modal) modal.classList.remove('active');
  donateOrgId = null;
  donateOrgName = null;
}

async function submitDonationConfirm() {
  const amountInput = document.getElementById('donation-confirm-amount');
  const dateInput = document.getElementById('donation-confirm-date');
  const amount = amountInput ? Number(amountInput.value) : 0;
  if (!amount || amount < 1) { alert('Please enter a valid amount'); return; }
  const amountCents = Math.round(amount * 100);
  const donationDate = (dateInput && dateInput.value) ? String(dateInput.value) : new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch('/api/give/log-donation', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: donateOrgId, amount_cents: amountCents, currency: 'USD', donated_at: donationDate })
    });
    if (!r.ok) { alert('Failed to log donation'); return; }
    closeDonationConfirmModal();
    loadGiveFeed();
    if (typeof loadGivingHistory === 'function') loadGivingHistory();
  } catch (e) {
    alert('Network error');
  }
}

// ─── LEDGER POSITION ───
async function loadLedgerPosition() {
  const el = document.getElementById('ledger-position-section');
  if (!el) return;

  const summaryRes = await fetch('/api/user/ledger-summary', { credentials: 'same-origin' }).catch(() => null);
  const summary = summaryRes && summaryRes.ok ? await summaryRes.json() : {};

  const actionsYear = Number(summary.actions_taken_year) || 0;
  const orgsFollowed = Number(summary.orgs_followed) || 0;
  const givenCents = Number(summary.given_cents_year) || 0;
  const givenLabel = givenCents > 0 ? '$' + (givenCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$0';
  const movedCents = Number(summary.moved_cents) || 0;
  const movedLabel = movedCents > 0 ? '$' + (movedCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$0';

  el.innerHTML = `
    <div class="individual-section-title">Your Position</div>
    <div class="ledger-position-stats">
      <div class="ledger-position-stat">
        <div class="ledger-position-stat-label">Money moved</div>
        <div class="ledger-position-stat-value">${movedLabel}</div>
      </div>
      <div class="ledger-position-stat">
        <div class="ledger-position-stat-label">Actions this year</div>
        <div class="ledger-position-stat-value">${actionsYear}</div>
      </div>
      <div class="ledger-position-stat">
        <div class="ledger-position-stat-label">Organizations</div>
        <div class="ledger-position-stat-value">${orgsFollowed}</div>
      </div>
      <div class="ledger-position-stat">
        <div class="ledger-position-stat-label">Given this year</div>
        <div class="ledger-position-stat-value">${givenLabel}</div>
      </div>
    </div>
  `;
}

// ─── LEDGER IMPACT SUMMARY (Position tab) ───
async function loadLedgerImpact() {
  const el = document.getElementById('ledger-impact-summary');
  if (!el) return;
  el.innerHTML = 'Loading…';
  el.className = 'individual-hint';

  try {
    const r = await fetch('/api/user/ledger-impact', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('bad response');
    const data = await r.json();

    const actions = Number(data.actions_taken_year) || 0;
    const givenCents = Number(data.given_cents_year) || 0;
    const orgs = Number(data.orgs_given_year) || 0;
    const responses = Number(data.responses_year) || 0;
    const actionOrgs = Number(data.action_orgs_year) || 0;
    const tally = Array.isArray(data.boundary_tally) ? data.boundary_tally : [];

    if (!actions && !givenCents && !responses) {
      el.className = 'individual-empty';
      el.innerHTML = 'No actions or giving logged yet this year — activity here will summarize what you\'ve contributed to.';
      return;
    }

    const givenLabel = '$' + (givenCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });

    const statRow = '<div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom:12px;">' +
      '<div><span style="font-size:16px; font-weight:700; color:var(--text-primary);">' + actions + '</span> ' +
        '<span class="individual-hint">action' + (actions === 1 ? '' : 's') + ' completed' + (actionOrgs ? ' · ' + actionOrgs + ' org' + (actionOrgs === 1 ? '' : 's') : '') + '</span></div>' +
      '<div><span style="font-size:16px; font-weight:700; color:var(--text-primary);">' + givenLabel + '</span> ' +
        '<span class="individual-hint">given' + (orgs ? ' · ' + orgs + ' org' + (orgs === 1 ? '' : 's') : '') + '</span></div>' +
      '<div><span style="font-size:16px; font-weight:700; color:var(--text-primary);">' + responses + '</span> ' +
        '<span class="individual-hint">response' + (responses === 1 ? '' : 's') + ' received</span></div>' +
      '</div>';

    let systemsLine;
    if (tally.length) {
      const top = tally.slice(0, 4);
      const transgressedCount = top.filter(t => BOUNDARY_STATUS[t.boundary_id] === 'transgressed').length;
      systemsLine = 'Your action work concentrated in ' + top.map(t => escapeHtml(BOUNDARY_NAMES[t.boundary_id] || t.boundary_id)).join(', ') +
        (transgressedCount ? ' — ' + transgressedCount + ' of which ' + (transgressedCount === 1 ? 'is' : 'are') + ' currently transgressed.' : '.') +
        ' — <a href="#turnarounds/boundaries" style="color:var(--accent);">see System</a>';
    } else {
      systemsLine = 'None of your completed actions are tagged to a planetary boundary yet — as more of your actions carry those tags, this section will show which parts of the system your work concentrates on.';
    }

    el.className = '';
    el.innerHTML = statRow +
      '<div style="font-size:13px; color:var(--text-primary); line-height:1.6;">' + systemsLine + '</div>';
  } catch (e) {
    el.className = 'individual-error';
    el.innerHTML = '<span>⚠ Could not load impact summary.</span><button onclick="loadLedgerImpact()">Retry</button>';
  }
}

// ─── PERSONAL BALANCE SHEET (Position tab) ───
// ASPIRATIONAL:COMMONER — not yet wired to real accounts, shows the concept, not
// figures. This is the current sketch of the "Commoner" two-class asset structure /
// Net Stewardship Position idea — see docs/Causal_Development_Path.md.
function loadPersonalBalanceSheet() {
  const el = document.getElementById('personal-balance-sheet-summary');
  if (!el) return;

  const intro = '<div class="individual-hint" style="margin-bottom:16px;">' +
    'A fuller picture of your economic position with estimates of time, cost, and care that don\'t show up on a traditional balance sheet — not a claim about your borrowing power but a different view of your net value. Once wired to real data, each line below will carry a live figure.' +
    '</div>';

  const breakdownRows = [
    { label: 'Conventional net worth', desc: 'Assets minus debts, the version your bank sees' },
    { label: 'Unrecorded care work', desc: 'Lifetime unpaid care labor, valued at replacement cost' },
    { label: 'Commons share', desc: 'Your birthright stake in shared resources' },
    { label: 'Eco impact', desc: 'Cost of your consumption against your fair planetary share, shown as a reduction' },
    { label: 'Net Stewardship Position', desc: 'Net worth plus care work plus commons share, minus eco impact — your overall position, not just your net worth' },
  ];

  const breakdown = breakdownRows.map((row, i) => {
    const borderStyle = i < breakdownRows.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : '';
    const isTotal = row.label === 'Net Stewardship Position';
    return '<div style="padding:8px 0; ' + borderStyle + '">' +
      '<div style="font-size:13px; font-weight:' + (isTotal ? '700' : '600') + '; color:var(--text-primary);">' + escapeHtml(row.label) + '</div>' +
      '<div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">' + escapeHtml(row.desc) + '</div>' +
      '</div>';
  }).join('');

  el.className = '';
  el.innerHTML = intro + breakdown;
}

// ─── EXPORT TO WINDOW ───
window.loadPersonalBalanceSheet = loadPersonalBalanceSheet;
window.loadMoneyHomeData = loadMoneyHomeData;
window.loadVestBanksSection = loadVestBanksSection;
window.loadBankAlternatives = loadBankAlternatives;
window.loadBankPressureCampaigns = loadBankPressureCampaigns;
window.refreshBankMounts = refreshBankMounts;
window.bankAccountAdd = bankAccountAdd;
window.bankAccountEdit = bankAccountEdit;
window.scrollToBankAlternatives = scrollToBankAlternatives;
window.setFundHoldingsFlag = setFundHoldingsFlag;
window.bankPromiseSubmit = bankPromiseSubmit;
window.checkMyBank = checkMyBank;
window.removeUserBankSegment = removeUserBankSegment;
window.toggleBankInlineAdd = toggleBankInlineAdd;
window.selectBankFromDropdown = selectBankFromDropdown;
window.toggleGiveOrgUnfollowDropdown = toggleGiveOrgUnfollowDropdown;
window.hideGiveOrgUnfollowDropdown = hideGiveOrgUnfollowDropdown;
window.confirmGiveOrgUnfollow = confirmGiveOrgUnfollow;
window.loadGiveFeed = loadGiveFeed;
window.initiateGive = initiateGive;
window.openCausalAddressDonate = openCausalAddressDonate;
window.closeCausalAddressDonate = closeCausalAddressDonate;
window.copyCausalAddress = copyCausalAddress;
window.openOrgDonationSite = openOrgDonationSite;
window.openDonationConfirmModal = openDonationConfirmModal;
window.closeDonationConfirmModal = closeDonationConfirmModal;
window.submitDonationConfirm = submitDonationConfirm;
window.submitOrgDonation = submitOrgDonation;
window.loadInvestTab = loadInvestTab;
window.addTickerToList = addTickerToList;
window.removeTicker = removeTicker;
window.saveInvestTickers = saveInvestTickers;
window.loadBankPledges = loadBankPledges;
window.bankPledgeSubmit = bankPledgeSubmit;
window.bankPledgeMarkDivested = bankPledgeMarkDivested;
window.bankPledgeWithdraw = bankPledgeWithdraw;
window.dedupeGiveOrgs = dedupeGiveOrgs;
window.loadLedgerPosition = loadLedgerPosition;
window.loadLedgerImpact = loadLedgerImpact;
