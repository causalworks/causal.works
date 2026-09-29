(function () {
  const errEl = document.getElementById('organizational-onb-error');
  const loadingEl = document.getElementById('organizational-onb-loading');
  const rootEl = document.getElementById('organizational-onb-root');
  const titleEl = document.getElementById('organizational-onb-title');
  const progressEl = document.getElementById('organizational-onb-progress');
  const panelEl = document.getElementById('organizational-onb-panel');
  const backOrgA = document.getElementById('organizational-onb-back-org');

  let slug = '';
  let org = null;
  let categories = [];
  let presets = [];
  let accountsDraft = [];
  /** Deep copy of Xero-imported rows so removed lines can be re-added from the picker. Cleared for CSV / template / manual paths. */
  let xeroImportSnapshot = [];
  let basicsSub = 'welcome';
  let accountsSub = 'pick';
  let showDonePhase = false;
  let csvHeaders = [];
  let csvRows = [];
  let columnMap = { code: '', name: '', type: '', balance: '' };
  let manualRows = [{ code: '', name: '', type: 'expense', parent: '' }];
  let programsDraft = [];

  // Single source of truth for the wizard progress bar and welcome-screen preview list —
  // previously these were two hand-maintained lists that drifted out of sync.
  const WIZARD_STEPS = [
    { key: 'basics', label: 'Basics' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'prior_data', label: 'Prior data' },
    { key: 'programs', label: 'Programs' },
    { key: 'done', label: 'Done' },
  ];

  /** FY label = calendar year the fiscal year ends in (matches org_budget_lines.fiscal_year convention). */
  function computeCurrentFiscalYear(endMonth) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const em = Number(endMonth) || 12;
    return month <= em ? year : year + 1;
  }

  const XERO_TO_ACCT = {
    REVENUE: 'income',
    SALES: 'income',
    OTHERINCOME: 'income',
    EXPENSE: 'expense',
    OVERHEADS: 'expense',
    DIRECTCOSTS: 'expense',
    CURRLIAB: 'liability',
    TERMLIAB: 'liability',
    EQUITY: 'liability',
    BANK: 'asset',
    CURRENT: 'asset',
    FIXED: 'asset',
    NONCURRENT: 'asset',
  };

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/onboarding\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }
    if (res.status === 403 && String(url || '').indexOf('/api/organizational/') !== -1) {
      window.location.href = '/app.html?coop=disabled';
      return null;
    }
    return { res, data };
  }

  async function patchStep(step) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/onboarding-step', {
      method: 'PATCH',
      body: JSON.stringify({ step }),
    });
    if (!out || !out.res.ok) {
      showError((out && out.data && out.data.error) || 'Could not save progress.');
      return false;
    }
    if (org) org.onboarding_step = step;
    return true;
  }

  function suggestCategory(name, acctType, codeOpt) {
    const code = codeOpt != null ? String(codeOpt).trim() : '';
    const codeNumMatch = /^(\d+)/.exec(code);
    const codeNum = codeNumMatch ? parseInt(codeNumMatch[1], 10) : NaN;
    const n = String(name || '').toLowerCase();
    let standard_category = null;
    let category_label = null;
    let needs_review = false;
    if (acctType === 'asset') {
      if (/cash|bank|checking|savings|petty/.test(n)) {
        standard_category = '10000';
        category_label = '1xxxx — Cash & current assets';
      } else {
        standard_category = '15000';
        category_label = '1xxxx — Other assets';
      }
    } else if (acctType === 'liability') {
      if (/equity|net asset|fund balance|retained/.test(n)) {
        standard_category = '30000';
        category_label = '3xxxx — Total money available';
      } else {
        standard_category = '20000';
        category_label = '2xxxx — Liabilities';
      }
    } else if (acctType === 'income') {
      if (/government|federal|state|city|contract|pass/.test(n)) {
        standard_category = '41000';
        category_label = '41xxx — Government grants';
      } else if (/foundation|institutional/.test(n)) {
        standard_category = '42000';
        category_label = '42xxx — Foundation grants';
      } else if (/individual|donor|membership|contribution|donation/.test(n)) {
        standard_category = '43000';
        category_label = '43xxx — Individual contributions';
      } else if (/fee|service|revenue|tuition|ticket|admission/.test(n)) {
        standard_category = '44000';
        category_label = '44xxx — Earned revenue';
      } else if (/event|gala|auction/.test(n)) {
        standard_category = '45000';
        category_label = '45xxx — Special events';
      } else if (/other income|interest/.test(n) || /revenue|income|grant/.test(n)) {
        standard_category = '46000';
        category_label = '46xxx — Other income';
      } else needs_review = true;
      if (!standard_category && !Number.isNaN(codeNum)) {
        if (codeNum >= 5000 && codeNum <= 5499) {
          standard_category = '43000';
          category_label = '43xxx — Individual contributions';
        } else if (codeNum >= 5700 && codeNum <= 5799) {
          standard_category = '47000';
          category_label = '57xxx — Released / restricted revenue';
        } else if (codeNum >= 4000 && codeNum <= 4899) {
          standard_category = '44000';
          category_label = '44xxx — Earned revenue';
        } else if (codeNum === 4999) {
          standard_category = '46000';
          category_label = '46xxx — Other income';
        }
      }
    } else if (acctType === 'expense') {
      if (/salary|wage|payroll|benefit|personnel|staff/.test(n)) {
        standard_category = '51000';
        category_label = '51xxx — Personnel';
      } else if (/rent|lease|occupancy|utilities|facilities/.test(n)) {
        standard_category = '52000';
        category_label = '52xxx — Occupancy';
      } else if (/phone|internet|software|technology|communications|website/.test(n)) {
        standard_category = '53000';
        category_label = '53xxx — Communications & technology';
      } else if (/travel|meeting|conference|mileage/.test(n)) {
        standard_category = '55000';
        category_label = '55xxx — Travel & meetings';
      } else if (/legal|audit|accounting|consult|professional/.test(n)) {
        standard_category = '56000';
        category_label = '56xxx — Professional services';
      } else if (/fundraising|development/.test(n)) {
        standard_category = '58000';
        category_label = '58xxx — Fundraising';
      } else if (/admin|general|office|supplies|insurance|bank fee/.test(n)) {
        standard_category = '57000';
        category_label = '57xxx — Administrative & general';
      } else if (/program|project|client|mission/.test(n)) {
        standard_category = '54000';
        category_label = '54xxx — Program expenses';
      } else needs_review = true;
      if (!standard_category && !Number.isNaN(codeNum)) {
        if (codeNum >= 6000 && codeNum <= 6199) {
          standard_category = '51000';
          category_label = '51xxx — Personnel';
        } else if (codeNum >= 6200 && codeNum <= 6299) {
          standard_category = '56000';
          category_label = '56xxx — Professional services';
        } else if (codeNum >= 6400 && codeNum <= 6499) {
          standard_category = '52000';
          category_label = '52xxx — Occupancy';
        } else if (codeNum >= 6500 && codeNum <= 6999) {
          standard_category = '59000';
          category_label = '65xxx — Operations (supplies, misc.)';
        } else if (codeNum >= 7000 && codeNum <= 9998) {
          standard_category = '57000';
          category_label = '57xxx — Administrative & general';
        } else if (codeNum === 9990) {
          standard_category = '57000';
          category_label = '57xxx — Administrative & general';
        }
      }
    }
    if (needs_review || !standard_category) {
      return { standard_category: standard_category || null, category_label: null, needs_review: true };
    }
    return { standard_category, category_label, needs_review: false };
  }

  function mapXeroRow(a) {
    const xt = String(a.type || '').toUpperCase().trim();
    let acctType = XERO_TO_ACCT[xt] || null;
    if (!acctType) acctType = 'expense';
    const base = suggestCategory(a.name, acctType, a.code);
    const needs = base.needs_review || !XERO_TO_ACCT[xt] || xt === 'EQUITY';
    return {
      code: String(a.code != null ? a.code : '').trim() || String(a.account_id || '').slice(0, 8),
      name: String(a.name || '').trim() || 'Account',
      type: acctType,
      standard_category: base.standard_category,
      category_label: base.category_label,
      needs_review: needs,
      rollup_parent_code: '',
      xero_type: xt,
      xero_account_id: a.account_id ? String(a.account_id).trim().toLowerCase() : '',
      is_posting: true,
      level: 3,
    };
  }

  function draftContainsSnapshotRow(snapRow, draft) {
    const xid = String(snapRow.xero_account_id || '').trim().toLowerCase();
    if (xid) {
      return draft.some(function (d) {
        return String(d.xero_account_id || '').trim().toLowerCase() === xid;
      });
    }
    const c = String(snapRow.code || '').trim().toLowerCase();
    const n = String(snapRow.name || '').trim().toLowerCase();
    return draft.some(function (d) {
      return (
        String(d.code || '').trim().toLowerCase() === c &&
        String(d.name || '').trim().toLowerCase() === n
      );
    });
  }

  function normalizeTypeCell(raw) {
    const t = String(raw || '')
      .toLowerCase()
      .trim();
    if (/^inc|^rev|^credit|^4/.test(t) || t === 'income' || t === 'revenue') return 'income';
    if (/^exp|^cost|^debit|^5/.test(t) || t === 'expense') return 'expense';
    if (/^asset|^1/.test(t) || t === 'asset') return 'asset';
    if (/^liab|^2|^eq/.test(t) || t === 'liability' || t === 'equity') return 'liability';
    return '';
  }

  function wizardStepIndex() {
    if (!org) return 0;
    if (showDonePhase) return WIZARD_STEPS.length - 1;
    const i = WIZARD_STEPS.findIndex(function (s) {
      return s.key === org.onboarding_step;
    });
    return i >= 0 ? i : 0;
  }

  function renderProgress() {
    if (!progressEl) return;
    const cur = wizardStepIndex();
    progressEl.innerHTML = WIZARD_STEPS.map(function (s, i) {
        const active = i === cur ? ' organizational-wizard-step-active' : '';
        return '<span class="organizational-wizard-step' + active + '">' + escapeHtml(s.label) + '</span>';
      })
      .join('<span class="organizational-wizard-step-sep" aria-hidden="true">·</span>');
  }

  function render() {
    renderProgress();
    if (!panelEl || !org) return;
    const idx = wizardStepIndex();
    if (titleEl) titleEl.textContent = org.display_name || 'Workspace setup';
    if (backOrgA) backOrgA.href = '/organizational/o/' + encodeURIComponent(slug);

    if (idx === 0) {
      if (basicsSub === 'form') renderBasicsForm();
      else renderBasics();
    } else if (idx === 1) {
      if (accountsSub === 'confirm') renderAccountsConfirm();
      else renderAccountsPick();
    } else if (idx === 2) renderPriorData();
    else if (idx === 3) renderPrograms();
    else renderDone();
  }

  function renderBasics() {
    const previewSteps = WIZARD_STEPS.slice(0, -1);
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Welcome to Cooperative</h2>' +
      '<p class="organizational-hint" style="font-size:0.9375rem;line-height:1.6;">Let\'s set up your nonprofit workspace in just a few steps. We\'ll help you configure your chart of accounts, connect your accounting software, and import your budget data.</p>' +
      '<div class="organizational-onb-steps-preview">' +
      previewSteps
        .map(function (s, i) {
          return (
            '<div class="organizational-onb-step-preview"><span class="organizational-onb-step-num">' +
            (i + 1) +
            '</span><span class="organizational-onb-step-label">' +
            escapeHtml(s.label) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn" id="onb-basics-next">Get started</button>' +
      '</div>';

    document.getElementById('onb-basics-next').onclick = function () {
      basicsSub = 'form';
      render();
    };
  }

  function renderBasicsForm() {
    const cp = org.cooperative_profile && typeof org.cooperative_profile === 'object' ? org.cooperative_profile : {};
    const mission = cp.mission || '';
    const areas = Array.isArray(cp.program_areas) ? cp.program_areas.join(', ') : '';
    const region = cp.region || '';
    const website = cp.website || '';
    const state = org.state || '';
    const fy = org.fiscal_year_end_month != null ? Number(org.fiscal_year_end_month) : 12;
    panelEl.innerHTML =
      '<div class="organizational-wizard-actions" style="margin-bottom:8px;">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-basics-back">Back</button>' +
      '</div>' +
      '<h2 class="organizational-wizard-heading">Organization basics</h2>' +
      '<p class="organizational-hint">Confirm your organization details. Nothing is finalized until you continue.</p>' +
      '<label>Organization legal name</label>' +
      '<input type="text" id="onb-display-name" maxlength="200" value="' +
      escapeHtml(org.display_name) +
      '" />' +
      '<label>EIN <span class="organizational-label-soft">(required for 990 support)</span></label>' +
      '<input type="text" id="onb-ein" maxlength="32" value="' +
      escapeHtml(org.ein || '') +
      '" placeholder="12-3456789" />' +
      '<label>State <span class="organizational-label-soft">(required for compliance requirements)</span></label>' +
      '<select id="onb-state">' +
      '<option value="">Select state</option>' +
      '<option value="AL"' + (state === 'AL' ? ' selected' : '') + '>Alabama</option>' +
      '<option value="AK"' + (state === 'AK' ? ' selected' : '') + '>Alaska</option>' +
      '<option value="AZ"' + (state === 'AZ' ? ' selected' : '') + '>Arizona</option>' +
      '<option value="AR"' + (state === 'AR' ? ' selected' : '') + '>Arkansas</option>' +
      '<option value="CA"' + (state === 'CA' ? ' selected' : '') + '>California</option>' +
      '<option value="CO"' + (state === 'CO' ? ' selected' : '') + '>Colorado</option>' +
      '<option value="CT"' + (state === 'CT' ? ' selected' : '') + '>Connecticut</option>' +
      '<option value="DE"' + (state === 'DE' ? ' selected' : '') + '>Delaware</option>' +
      '<option value="FL"' + (state === 'FL' ? ' selected' : '') + '>Florida</option>' +
      '<option value="GA"' + (state === 'GA' ? ' selected' : '') + '>Georgia</option>' +
      '<option value="HI"' + (state === 'HI' ? ' selected' : '') + '>Hawaii</option>' +
      '<option value="ID"' + (state === 'ID' ? ' selected' : '') + '>Idaho</option>' +
      '<option value="IL"' + (state === 'IL' ? ' selected' : '') + '>Illinois</option>' +
      '<option value="IN"' + (state === 'IN' ? ' selected' : '') + '>Indiana</option>' +
      '<option value="IA"' + (state === 'IA' ? ' selected' : '') + '>Iowa</option>' +
      '<option value="KS"' + (state === 'KS' ? ' selected' : '') + '>Kansas</option>' +
      '<option value="KY"' + (state === 'KY' ? ' selected' : '') + '>Kentucky</option>' +
      '<option value="LA"' + (state === 'LA' ? ' selected' : '') + '>Louisiana</option>' +
      '<option value="ME"' + (state === 'ME' ? ' selected' : '') + '>Maine</option>' +
      '<option value="MD"' + (state === 'MD' ? ' selected' : '') + '>Maryland</option>' +
      '<option value="MA"' + (state === 'MA' ? ' selected' : '') + '>Massachusetts</option>' +
      '<option value="MI"' + (state === 'MI' ? ' selected' : '') + '>Michigan</option>' +
      '<option value="MN"' + (state === 'MN' ? ' selected' : '') + '>Minnesota</option>' +
      '<option value="MS"' + (state === 'MS' ? ' selected' : '') + '>Mississippi</option>' +
      '<option value="MO"' + (state === 'MO' ? ' selected' : '') + '>Missouri</option>' +
      '<option value="MT"' + (state === 'MT' ? ' selected' : '') + '>Montana</option>' +
      '<option value="NE"' + (state === 'NE' ? ' selected' : '') + '>Nebraska</option>' +
      '<option value="NV"' + (state === 'NV' ? ' selected' : '') + '>Nevada</option>' +
      '<option value="NH"' + (state === 'NH' ? ' selected' : '') + '>New Hampshire</option>' +
      '<option value="NJ"' + (state === 'NJ' ? ' selected' : '') + '>New Jersey</option>' +
      '<option value="NM"' + (state === 'NM' ? ' selected' : '') + '>New Mexico</option>' +
      '<option value="NY"' + (state === 'NY' ? ' selected' : '') + '>New York</option>' +
      '<option value="NC"' + (state === 'NC' ? ' selected' : '') + '>North Carolina</option>' +
      '<option value="ND"' + (state === 'ND' ? ' selected' : '') + '>North Dakota</option>' +
      '<option value="OH"' + (state === 'OH' ? ' selected' : '') + '>Ohio</option>' +
      '<option value="OK"' + (state === 'OK' ? ' selected' : '') + '>Oklahoma</option>' +
      '<option value="OR"' + (state === 'OR' ? ' selected' : '') + '>Oregon</option>' +
      '<option value="PA"' + (state === 'PA' ? ' selected' : '') + '>Pennsylvania</option>' +
      '<option value="RI"' + (state === 'RI' ? ' selected' : '') + '>Rhode Island</option>' +
      '<option value="SC"' + (state === 'SC' ? ' selected' : '') + '>South Carolina</option>' +
      '<option value="SD"' + (state === 'SD' ? ' selected' : '') + '>South Dakota</option>' +
      '<option value="TN"' + (state === 'TN' ? ' selected' : '') + '>Tennessee</option>' +
      '<option value="TX"' + (state === 'TX' ? ' selected' : '') + '>Texas</option>' +
      '<option value="UT"' + (state === 'UT' ? ' selected' : '') + '>Utah</option>' +
      '<option value="VT"' + (state === 'VT' ? ' selected' : '') + '>Vermont</option>' +
      '<option value="VA"' + (state === 'VA' ? ' selected' : '') + '>Virginia</option>' +
      '<option value="WA"' + (state === 'WA' ? ' selected' : '') + '>Washington</option>' +
      '<option value="WV"' + (state === 'WV' ? ' selected' : '') + '>West Virginia</option>' +
      '<option value="WI"' + (state === 'WI' ? ' selected' : '') + '>Wisconsin</option>' +
      '<option value="WY"' + (state === 'WY' ? ' selected' : '') + '>Wyoming</option>' +
      '</select>' +
      '<label>Fiscal year end month</label>' +
      '<select id="onb-fy-month">' +
      Array.from({ length: 12 }, function (_, i) {
        const m = i + 1;
        const sel = m === fy ? ' selected' : '';
        const name = new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' });
        return '<option value="' + m + '"' + sel + '>' + escapeHtml(name) + '</option>';
      }).join('') +
      '</select>' +
      (function () {
        const currentFY = computeCurrentFiscalYear(fy);
        const nextFY = currentFY + 1;
        const targetFY = org.onboarding_target_fiscal_year != null ? Number(org.onboarding_target_fiscal_year) : currentFY;
        const conversionDate = org.onboarding_conversion_date
          ? String(org.onboarding_conversion_date).slice(0, 10)
          : '';
        return (
          '<label>Which fiscal year are you budgeting for?</label>' +
          '<select id="onb-target-fy">' +
          '<option value="' + currentFY + '"' + (targetFY === currentFY ? ' selected' : '') + '>Current fiscal year (FY' + currentFY + ')</option>' +
          '<option value="' + nextFY + '"' + (targetFY === nextFY ? ' selected' : '') + '>Upcoming fiscal year (FY' + nextFY + ')</option>' +
          '</select>' +
          '<label>Go-live date <span class="organizational-label-soft">(optional — the date Causal becomes your source of truth; helps us suggest an opening-balances import)</span></label>' +
          '<input type="date" id="onb-conversion-date" value="' + escapeHtml(conversionDate) + '" />'
        );
      })() +
      '<label>Mission statement <span class="organizational-label-soft">(optional)</span></label>' +
      '<textarea id="onb-mission" rows="3" maxlength="1200" placeholder="1–2 sentences">' +
      escapeHtml(mission) +
      '</textarea>' +
      '<label>Primary program areas <span class="organizational-label-soft">(optional, comma-separated)</span></label>' +
      '<input type="text" id="onb-areas" value="' +
      escapeHtml(areas) +
      '" placeholder="Climate, Housing, Legal aid" />' +
      '<label>Region <span class="organizational-label-soft">(optional)</span></label>' +
      '<input type="text" id="onb-region" value="' +
      escapeHtml(region) +
      '" />' +
      '<label>Website <span class="organizational-label-soft">(optional)</span></label>' +
      '<input type="url" id="onb-website" value="' +
      escapeHtml(website) +
      '" placeholder="https://…" />' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn" id="onb-basics-next">Continue</button>' +
      '</div>';

    document.getElementById('onb-basics-back').onclick = async function () {
      basicsSub = 'welcome';
      render();
    };

    document.getElementById('onb-basics-next').onclick = async function () {
      showError('');
      const display_name = String(document.getElementById('onb-display-name').value || '').trim();
      if (!display_name) {
        showError('Organization name is required.');
        return;
      }
      const ein = String(document.getElementById('onb-ein').value || '').trim() || null;
      const state = String(document.getElementById('onb-state').value || '').trim() || null;
      const fiscal_year_end_month = Number(document.getElementById('onb-fy-month').value);
      const missionV = String(document.getElementById('onb-mission').value || '').trim();
      const areasV = String(document.getElementById('onb-areas').value || '')
        .split(',')
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      const regionV = String(document.getElementById('onb-region').value || '').trim();
      const websiteV = String(document.getElementById('onb-website').value || '').trim();
      const cooperative_profile = {};
      if (missionV) cooperative_profile.mission = missionV;
      if (areasV.length) cooperative_profile.program_areas = areasV;
      if (regionV) cooperative_profile.region = regionV;
      if (websiteV) cooperative_profile.website = websiteV;
      const onboarding_target_fiscal_year = Number(document.getElementById('onb-target-fy').value);
      const onboarding_conversion_date = String(document.getElementById('onb-conversion-date').value || '').trim() || null;

      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), {
        method: 'PATCH',
        body: JSON.stringify({
          display_name,
          ein,
          state,
          fiscal_year_end_month,
          cooperative_profile,
          onboarding_target_fiscal_year,
          onboarding_conversion_date,
        }),
      });
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not save.');
        return;
      }
      org = out.data.org;
      if (!(await patchStep('accounts'))) return;
      org.onboarding_step = 'accounts';
      accountsSub = 'pick';
      render();
    };
  }

  function renderAccountsPick() {
    const qs = new URLSearchParams(window.location.search || '');
    const xeroSt = qs.get('xero');
    if (xeroSt === 'error') {
      showError('Xero connection failed: ' + escapeHtml(qs.get('reason') || 'unknown'));
    } else if (xeroSt === 'connected') {
      showError('');
      loadXeroIntoDraft();
      return;
    }

    const presetBlock = presets.length
      ? '<div id="onb-preset-pick">' +
        '<label>I\'ve done this before <span class="organizational-label-soft">(use a chart of accounts you saved from another workspace)</span></label>' +
        '<select id="onb-preset-select">' +
        '<option value="">Choose a saved setup…</option>' +
        presets
          .map(function (p) {
            return '<option value="' + p.id + '">' + escapeHtml(p.name) + ' (' + p.account_count + ' accounts)</option>';
          })
          .join('') +
        '</select>' +
        '<button type="button" class="organizational-btn" id="onb-preset-apply">Use this setup</button>' +
        '</div>'
      : '';

    panelEl.innerHTML =
      '<div class="organizational-wizard-actions" style="margin-bottom:8px;">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-acct-back">Back</button>' +
      '</div>' +
      '<h2 class="organizational-wizard-heading">Chart of accounts</h2>' +
      '<p class="organizational-hint">Set up your chart of accounts during onboarding. You can update it later in Settings > Chart of accounts.</p>' +
      presetBlock +
      '<button type="button" class="organizational-btn" id="onb-xero-direct">Connect Xero and import chart</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-quick-start">Quick Start: Use nonprofit template</button>' +
      '<details class="organizational-onb-details">' +
      '<summary class="organizational-onb-details-summary">Other ways to build your chart</summary>' +
      '<p class="organizational-hint" style="margin-top:10px;">Spreadsheet upload, QuickBooks export, or manual entry.</p>' +
      '<div class="organizational-onb-choice-list">' +
      '<label class="organizational-onb-choice"><input type="radio" name="finpath" value="qb" /> We use QuickBooks</label>' +
      '<label class="organizational-onb-choice"><input type="radio" name="finpath" value="other" checked /> We use spreadsheets or something else</label>' +
      '</div>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn" id="onb-acct-next">Continue</button>' +
      '</div>' +
      '</details>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-blank-start">Start with a blank workspace <span class="organizational-label-soft">(not recommended)</span></button>' +
      '<div id="onb-blank-confirm-wrap" hidden>' +
      '<p class="organizational-hint">You\'ll need to add accounts manually before your budget will show anything. Most people should use one of the options above instead.</p>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-blank-cancel">Cancel</button>' +
      '<button type="button" class="organizational-btn" id="onb-blank-confirm">Yes, I\'ll build my chart from scratch</button>' +
      '</div>';

    document.getElementById('onb-acct-back').onclick = async function () {
      if (!(await patchStep('basics'))) return;
      org.onboarding_step = 'basics';
      render();
    };
    document.getElementById('onb-xero-direct').onclick = function () {
      window.location.href =
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/connect?return=onboarding';
    };
    if (presets.length) {
      document.getElementById('onb-preset-apply').onclick = async function () {
        const presetId = Number(document.getElementById('onb-preset-select').value);
        if (!presetId) {
          showError('Choose a saved setup first.');
          return;
        }
        showError('');
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(slug) + '/apply-preset',
          { method: 'POST', body: JSON.stringify({ preset_id: presetId }) }
        );
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not apply saved setup.');
          return;
        }
        if (!(await patchStep('prior_data'))) return;
        org.onboarding_step = 'prior_data';
        render();
      };
    }
    document.getElementById('onb-blank-start').onclick = function () {
      document.getElementById('onb-blank-confirm-wrap').hidden = false;
    };
    document.getElementById('onb-blank-cancel').onclick = function () {
      document.getElementById('onb-blank-confirm-wrap').hidden = true;
    };
    document.getElementById('onb-blank-confirm').onclick = async function () {
      showError('');
      const out = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/onboarding/confirm-blank-coa',
        { method: 'POST' }
      );
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not save choice.');
        return;
      }
      if (!(await patchStep('prior_data'))) return;
      org.onboarding_step = 'prior_data';
      render();
    };
    document.getElementById('onb-quick-start').onclick = async function () {
      showError('');
      panelEl.innerHTML = '<p class="organizational-empty">Loading nonprofit template…</p>';
      // Load the comprehensive template directly
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/account-templates', {
        method: 'GET',
      });
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not load templates.');
        renderAccountsPick();
        return;
      }
      const templates = out.data.templates || [];
      const comprehensive = templates.find(function (t) {
        return t.id === 'comprehensive';
      });
      if (!comprehensive || !comprehensive.accounts) {
        showError('Comprehensive template not found.');
        renderAccountsPick();
        return;
      }
      accountsDraft = comprehensive.accounts;
      accountsSub = 'confirm';
      window.history.replaceState({}, '', '/organizational/o/' + encodeURIComponent(slug) + '/onboarding?step=accounts');
      render();
    };
    document.getElementById('onb-acct-next').onclick = function () {
      const r = panelEl.querySelector('input[name="finpath"]:checked');
      const v = r ? r.value : 'other';
      if (v === 'qb') {
        renderQbThenOther();
        return;
      }
      renderOtherPaths();
    };
  }

  async function loadXeroIntoDraft() {
    showError('');
    panelEl.innerHTML = '<p class="organizational-empty">Loading Xero chart…</p>';
    const base = '/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/accounts';
    const [accOnb, accFull] = await Promise.all([
      apiJson(base + '?purpose=onboarding', { method: 'GET' }),
      apiJson(base, { method: 'GET' }),
    ]);
    if (!accOnb || !accOnb.res.ok) {
      showError((accOnb && accOnb.data && accOnb.data.error) || 'Could not load Xero accounts.');
      accountsSub = 'pick';
      render();
      return;
    }
    const list = accOnb.data.accounts || [];
    accountsDraft = list.map(mapXeroRow);
    if (accFull && accFull.res.ok && Array.isArray(accFull.data.accounts)) {
      xeroImportSnapshot = accFull.data.accounts.map(mapXeroRow);
    } else {
      xeroImportSnapshot = accountsDraft.map(function (r) {
        return JSON.parse(JSON.stringify(r));
      });
    }
    accountsSub = 'confirm';
    window.history.replaceState({}, '', '/organizational/o/' + encodeURIComponent(slug) + '/onboarding?step=accounts');
    render();
  }

  function renderQbThenOther() {
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">QuickBooks</h2>' +
      '<p class="organizational-hint">QuickBooks connection is coming soon. In the meantime, export your <abbr class="organizational-term" tabindex="0" title="Chart of accounts — the list of accounts used to categorize income and expenses">categories for tracking money</abbr> as CSV and use the spreadsheet option below.</p>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-qb-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-qb-csv">Use CSV / spreadsheet</button>' +
      '</div>';
    document.getElementById('onb-qb-back').onclick = function () {
      render();
    };
    document.getElementById('onb-qb-csv').onclick = function () {
      renderOtherPaths();
    };
  }

  function renderOtherPaths() {
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Spreadsheets or other</h2>' +
      '<p class="organizational-hint">Choose how you want to build your chart for review.</p>' +
      '<div class="organizational-onb-subchoices">' +
      '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-csv">Upload CSV or spreadsheet</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-template">Start from a standard template</button>' +
      '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-manual">Enter accounts manually</button>' +
      '</div>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-other-back">Back</button>' +
      '</div>';
    document.getElementById('onb-other-back').onclick = function () {
      render();
    };
    document.getElementById('onb-csv').onclick = renderCsvUpload;
    document.getElementById('onb-template').onclick = renderTemplatePick;
    document.getElementById('onb-manual').onclick = renderManual;
  }

  function guessHeaderMap(headers) {
    const lower = headers.map(function (h) {
      return String(h || '')
        .toLowerCase()
        .trim();
    });
    const find = function (pred) {
      for (let i = 0; i < lower.length; i += 1) {
        if (pred(lower[i])) return headers[i];
      }
      return '';
    };
    return {
      code: find(function (h) {
        return /^(code|num|no|#|acct|account\s*#|gl)/.test(h);
      }),
      name: find(function (h) {
        return /name|description|title|account/.test(h) && !/type|class|category/.test(h);
      }),
      type: find(function (h) {
        return /type|class|natural/.test(h);
      }),
      balance: find(function (h) {
        return /balance|amount/.test(h);
      }),
    };
  }

  function renderCsvUpload() {
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Upload file</h2>' +
      '<p class="organizational-hint">.csv, .xlsx, .xls, .ods — first row should be column headers.</p>' +
      '<input type="file" id="onb-file" accept=".csv,.xlsx,.xls,.ods" />' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-csv-cancel">Back</button>' +
      '</div>';
    document.getElementById('onb-csv-cancel').onclick = function () {
      renderOtherPaths();
    };
    document.getElementById('onb-file').onchange = function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const wb = typeof XLSX !== 'undefined' ? XLSX.read(reader.result, { type: 'binary' }) : null;
          if (!wb || !wb.SheetNames.length) throw new Error('Could not read workbook');
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          if (!rows || rows.length < 2) throw new Error('Need a header row and at least one data row');
          csvHeaders = (rows[0] || []).map(function (c) {
            return String(c);
          });
          csvRows = rows.slice(1).filter(function (r) {
            return r.some(function (c) {
              return String(c).trim() !== '';
            });
          });
          columnMap = guessHeaderMap(csvHeaders);
          renderCsvMap();
        } catch (err) {
          showError(err.message || 'Parse failed');
        }
      };
      reader.readAsBinaryString(f);
    };
  }

  function renderCsvMap() {
    function opt(sel, headers) {
      return (
        '<option value="">—</option>' +
        headers
          .map(function (h) {
            return '<option value="' + escapeHtml(h) + '"' + (h === sel ? ' selected' : '') + '>' + escapeHtml(h) + '</option>';
          })
          .join('')
      );
    }
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Map columns</h2>' +
      '<table class="organizational-table organizational-onb-map-table"><tbody>' +
      '<tr><th>Maps to</th><th>Your column</th></tr>' +
      '<tr><td>Code</td><td><select id="map-code">' +
      opt(columnMap.code, csvHeaders) +
      '</select></td></tr>' +
      '<tr><td>Name</td><td><select id="map-name">' +
      opt(columnMap.name, csvHeaders) +
      '</select></td></tr>' +
      '<tr><td>Type</td><td><select id="map-type">' +
      opt(columnMap.type, csvHeaders) +
      '</select></td></tr>' +
      '<tr><td>Opening balance <span class="organizational-label-soft">(optional)</span></td><td><select id="map-balance">' +
      opt(columnMap.balance, csvHeaders) +
      '</select></td></tr>' +
      '</tbody></table>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-map-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-map-ok">Preview chart</button>' +
      '</div>';
    document.getElementById('onb-map-back').onclick = function () {
      renderCsvUpload();
    };
    document.getElementById('onb-map-ok').onclick = function () {
      const cIdx = csvHeaders.indexOf(document.getElementById('map-code').value);
      const nIdx = csvHeaders.indexOf(document.getElementById('map-name').value);
      const tIdx = csvHeaders.indexOf(document.getElementById('map-type').value);
      if (cIdx < 0 || nIdx < 0) {
        showError('Code and Name columns are required.');
        return;
      }
      accountsDraft = [];
      xeroImportSnapshot = [];
      csvRows.forEach(function (row) {
        const code = String(row[cIdx] != null ? row[cIdx] : '').trim();
        const name = String(row[nIdx] != null ? row[nIdx] : '').trim();
        if (!code && !name) return;
        let acctType = 'expense';
        if (tIdx >= 0) {
          const nt = normalizeTypeCell(row[tIdx]);
          if (nt) acctType = nt;
        }
        const sug = suggestCategory(name || code, acctType, code || name.slice(0, 12));
        accountsDraft.push({
          code: code || name.slice(0, 12),
          name: name || code,
          type: acctType,
          standard_category: sug.standard_category,
          category_label: sug.category_label,
          needs_review: sug.needs_review,
          rollup_parent_code: '',
          xero_account_id: '',
          is_posting: true,
          level: 3,
        });
      });
      if (!accountsDraft.length) {
        showError('No rows found.');
        return;
      }
      accountsSub = 'confirm';
      render();
    };
  }

  function renderTemplatePick() {
    panelEl.innerHTML = '<p class="organizational-empty">Loading templates…</p>';
    apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/account-templates', { method: 'GET' }).then(function (out) {
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not load templates.');
        renderOtherPaths();
        return;
      }
      const templates = out.data.templates || [];
      panelEl.innerHTML =
        '<h2 class="organizational-wizard-heading">Choose a template</h2>' +
        '<div class="organizational-onb-template-list">' +
        templates
          .map(function (t) {
            return (
              '<button type="button" class="organizational-onb-template-card" data-id="' +
              escapeHtml(t.id) +
              '">' +
              '<strong>' +
              escapeHtml(t.name) +
              '</strong>' +
              '<span class="organizational-hint">' +
              escapeHtml(t.description || '') +
              '</span></button>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="organizational-wizard-actions">' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-tpl-back">Back</button>' +
        '</div>';
      document.getElementById('onb-tpl-back').onclick = function () {
        renderOtherPaths();
      };
      panelEl.querySelectorAll('.organizational-onb-template-card').forEach(function (btn) {
        btn.onclick = function () {
          const id = btn.getAttribute('data-id');
          const tpl = templates.find(function (x) {
            return x.id === id;
          });
          if (!tpl) return;
          xeroImportSnapshot = [];
          accountsDraft = (tpl.accounts || []).map(function (a) {
            const sug = suggestCategory(a.name, a.type, a.code);
            const hasExplicitCat =
              a.standard_category != null && String(a.standard_category).trim() !== '';
            const standard_category = hasExplicitCat
              ? String(a.standard_category).trim()
              : sug.standard_category;
            const catRow = categories.find(function (c) {
              return c.code === standard_category;
            });
            const category_label = hasExplicitCat ? (catRow && catRow.label) || '' : sug.category_label;
            const needs_review = hasExplicitCat ? false : sug.needs_review;
            return {
              code: String(a.code),
              name: String(a.name),
              type: a.type,
              standard_category: standard_category,
              category_label: category_label,
              needs_review: needs_review,
              rollup_parent_code: a.rollup_parent_code ? String(a.rollup_parent_code).trim() : '',
              xero_account_id: '',
              is_posting: a.is_posting !== undefined ? !!a.is_posting : true,
              level: a.level !== undefined && a.level !== null ? Number(a.level) : 3,
            };
          });
          accountsSub = 'confirm';
          render();
        };
      });
    });
  }

  function renderManual() {
    function rowHtml(r, i) {
      const types = ['income', 'expense', 'asset', 'liability'];
      const parentOpts =
        '<option value="">—</option>' +
        manualRows
          .map(function (x, j) {
            if (j === i || !x.code) return '';
            return '<option value="' + escapeHtml(x.code) + '"' + (x.code === r.parent ? ' selected' : '') + '>' + escapeHtml(x.code + ' — ' + x.name) + '</option>';
          })
          .join('');
      return (
        '<tr data-i="' +
        i +
        '"><td><input type="text" class="onb-m-code" value="' +
        escapeHtml(r.code) +
        '" placeholder="Code" /></td>' +
        '<td><input type="text" class="onb-m-name" value="' +
        escapeHtml(r.name) +
        '" placeholder="Name" /></td>' +
        '<td><select class="onb-m-type">' +
        types
          .map(function (t) {
            return '<option value="' + t + '"' + (r.type === t ? ' selected' : '') + '>' + t + '</option>';
          })
          .join('') +
        '</select></td>' +
        '<td><select class="onb-m-parent">' +
        parentOpts +
        '</select></td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-outline onb-m-remove">Remove</button></td></tr>'
      );
    }
    function refresh() {
      const tb = document.getElementById('onb-manual-tbody');
      if (!tb) return;
      tb.innerHTML = manualRows.map(rowHtml).join('');
      tb.querySelectorAll('.onb-m-remove').forEach(function (btn) {
        btn.onclick = function () {
          const tr = btn.closest('tr');
          const i = Number(tr.getAttribute('data-i'));
          manualRows.splice(i, 1);
          if (!manualRows.length) manualRows.push({ code: '', name: '', type: 'expense', parent: '' });
          refresh();
        };
      });
    }
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Manual accounts</h2>' +
      '<table class="organizational-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Parent</th><th></th></tr></thead>' +
      '<tbody id="onb-manual-tbody"></tbody></table>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-manual-add">+ Add row</button>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-manual-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-manual-next">Preview chart</button>' +
      '</div>';
    refresh();
    document.getElementById('onb-manual-add').onclick = function () {
      manualRows.push({ code: '', name: '', type: 'expense', parent: '' });
      refresh();
    };
    document.getElementById('onb-manual-back').onclick = function () {
      renderOtherPaths();
    };
    document.getElementById('onb-manual-next').onclick = function () {
      const tb = document.getElementById('onb-manual-tbody');
      const trs = tb.querySelectorAll('tr');
      manualRows = [];
      trs.forEach(function (tr) {
        manualRows.push({
          code: String(tr.querySelector('.onb-m-code').value || '').trim(),
          name: String(tr.querySelector('.onb-m-name').value || '').trim(),
          type: tr.querySelector('.onb-m-type').value,
          parent: String(tr.querySelector('.onb-m-parent').value || '').trim(),
        });
      });
      const ordered = [];
      const byCode = {};
      manualRows.forEach(function (r) {
        if (!r.code || !r.name) return;
        const sug = suggestCategory(r.name, r.type, r.code);
        const row = {
          code: r.code,
          name: r.name,
          type: r.type,
          standard_category: sug.standard_category,
          category_label: sug.category_label,
          needs_review: sug.needs_review,
          rollup_parent_code: r.parent || '',
          xero_account_id: '',
          is_posting: true,
          level: 3,
        };
        ordered.push(row);
        byCode[r.code] = row;
      });
      if (!ordered.length) {
        showError('Add at least one account with code and name.');
        return;
      }
      accountsDraft = ordered;
      accountsSub = 'confirm';
      render();
    };
  }

  function categorySelectHtml(selected) {
    return (
      '<select class="onb-cat-sel">' +
      '<option value="">Choose standard category…</option>' +
      categories
        .map(function (c) {
          const sel = c.code === selected ? ' selected' : '';
          return '<option value="' + escapeHtml(c.code) + '"' + sel + '>' + escapeHtml(c.label) + '</option>';
        })
        .join('') +
      '</select>'
    );
  }

  function renderAccountsConfirm() {
    const hasXeroIds = accountsDraft.some(function (r) {
      return String(r.xero_account_id || '').trim();
    });
    let addImportOpts =
      '<option value="">Add account…</option><option value="__blank__">＋ New blank row</option>';
    if (xeroImportSnapshot.length) {
      xeroImportSnapshot.forEach(function (row, i) {
        if (draftContainsSnapshotRow(row, accountsDraft)) return;
        const label = String(row.code || '') + ' — ' + String(row.name || '');
        addImportOpts +=
          '<option value="imp:' +
          i +
          '">' +
          escapeHtml(label.length > 90 ? label.slice(0, 87) + '…' : label) +
          '</option>';
      });
    }
    const rows = accountsDraft.map(function (r, idx) {
      const hasCat = !!String(r.standard_category || '').trim();
      const status = !hasCat
        ? '<span class="organizational-onb-warn" title="Choose a standard category">⚠</span>'
        : r.needs_review
          ? '<span class="organizational-onb-warn" title="Confirm or adjust category">⚠</span>'
          : '<span class="organizational-onb-ok" title="Category set — you can still change it">✓</span>';
      const catCell = categorySelectHtml(r.standard_category);
      return (
        '<tr data-idx="' +
        idx +
        '">' +
        '<td><input type="text" class="onb-row-code organizational-input-sm" value="' +
        escapeHtml(r.code) +
        '" /></td>' +
        '<td><input type="text" class="onb-row-name" value="' +
        escapeHtml(r.name) +
        '" /></td>' +
        '<td><select class="onb-row-type">' +
        ['income', 'expense', 'asset', 'liability']
          .map(function (t) {
            return '<option value="' + t + '"' + (r.type === t ? ' selected' : '') + '>' + t + '</option>';
          })
          .join('') +
        '</select></td>' +
        '<td class="onb-cat-cell">' +
        catCell +
        '</td>' +
        '<td>' +
        status +
        '</td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-outline onb-row-remove">Remove</button></td>' +
        '</tr>'
      );
    });
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Confirm <abbr class="organizational-term" tabindex="0" title="Chart of accounts — the list of accounts used to categorize income and expenses">account categories</abbr></h2>' +
      '<p class="organizational-hint">Every row uses the category dropdown (even when ✓). Change anytime before save. Your codes and names stay as in Xero or your file unless you edit them here.' +
      (xeroImportSnapshot.length
        ? ' <span class="organizational-label-soft">Default import: active income, expense, and bank accounts (archived omitted; zero-balance rows dropped only when Xero returns balances). Use <strong>Add account</strong> to pull in any other active Xero line (e.g. receivables) from the full <abbr class="organizational-term" tabindex="0" title="Chart of accounts — the list of accounts used to categorize income and expenses">account list</abbr>.</span>'
        : '') +
      '</p>' +
      '<div class="organizational-table-wrap">' +
      '<table class="organizational-table organizational-onb-confirm-table">' +
      '<thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Standard category</th><th></th><th></th></tr></thead>' +
      '<tbody id="onb-confirm-tbody">' +
      rows.join('') +
      '</tbody></table></div>' +
      '<div class="onb-add-row-toolbar">' +
      '<label class="organizational-hint onb-add-import-label">Restore from import or add: ' +
      '<select id="onb-add-from-import" class="onb-add-import-select">' +
      addImportOpts +
      '</select></label> ' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-add-row">＋ Blank row</button>' +
      '</div>' +
      '<label class="organizational-hint onb-xero-push-label" id="onb-xero-push-wrap"' +
      (hasXeroIds ? '' : ' hidden') +
      '><input type="checkbox" id="onb-xero-push" /> ' +
      'After saving, push updated <strong>names</strong> to the matching accounts in Xero (requires OAuth scope <code>accounting.settings</code>; reconnect Xero if you only granted read).</label>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-confirm-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-confirm-save">Confirm and save</button>' +
      '</div>';

    function syncDraftFromDom() {
      const trs = panelEl.querySelectorAll('#onb-confirm-tbody tr');
      trs.forEach(function (tr) {
        const idx = Number(tr.getAttribute('data-idx'));
        if (!accountsDraft[idx]) return;
        accountsDraft[idx].code = String(tr.querySelector('.onb-row-code').value || '').trim();
        accountsDraft[idx].name = String(tr.querySelector('.onb-row-name').value || '').trim();
        accountsDraft[idx].type = tr.querySelector('.onb-row-type').value;
        const sel = tr.querySelector('.onb-cat-sel');
        if (sel) {
          accountsDraft[idx].standard_category = String(sel.value || '').trim();
          const opt = sel.options[sel.selectedIndex];
          accountsDraft[idx].category_label = opt ? opt.textContent : '';
          if (accountsDraft[idx].standard_category) {
            accountsDraft[idx].needs_review = false;
          } else {
            accountsDraft[idx].needs_review = true;
          }
        }
      });
    }

    panelEl.querySelectorAll('.onb-cat-sel').forEach(function (sel) {
      sel.onchange = function () {
        syncDraftFromDom();
        renderAccountsConfirm();
      };
    });

    panelEl.querySelectorAll('.onb-row-remove').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFromDom();
        const tr = btn.closest('tr');
        const idx = Number(tr.getAttribute('data-idx'));
        accountsDraft.splice(idx, 1);
        renderAccountsConfirm();
      };
    });

    function pushBlankRow() {
      syncDraftFromDom();
      accountsDraft.push({
        code: '',
        name: '',
        type: 'expense',
        standard_category: '',
        category_label: '',
        needs_review: true,
        rollup_parent_code: '',
        xero_account_id: '',
        is_posting: true,
        level: 3,
      });
      renderAccountsConfirm();
    }
    document.getElementById('onb-add-row').onclick = pushBlankRow;
    const addImp = document.getElementById('onb-add-from-import');
    if (addImp) {
      addImp.onchange = function () {
        const v = this.value;
        if (!v) return;
        syncDraftFromDom();
        if (v === '__blank__') {
          accountsDraft.push({
            code: '',
            name: '',
            type: 'expense',
            standard_category: '',
            category_label: '',
            needs_review: true,
            rollup_parent_code: '',
            xero_account_id: '',
            is_posting: true,
            level: 3,
          });
        } else if (v.indexOf('imp:') === 0) {
          const i = Number(v.slice(4));
          if (Number.isInteger(i) && xeroImportSnapshot[i]) {
            accountsDraft.push(JSON.parse(JSON.stringify(xeroImportSnapshot[i])));
          }
        }
        this.value = '';
        renderAccountsConfirm();
      };
    }

    document.getElementById('onb-confirm-back').onclick = function () {
      accountsSub = 'pick';
      render();
    };

    document.getElementById('onb-confirm-save').onclick = async function () {
      syncDraftFromDom();
      for (let i = 0; i < accountsDraft.length; i += 1) {
        const r = accountsDraft[i];
        if (!r.code || !r.name) {
          showError('Every row needs a code and name.');
          return;
        }
        if (!r.standard_category) {
          showError('Assign a standard category for every row (see ⚠).');
          return;
        }
      }
      const payload = accountsDraft.map(function (r) {
        const row = {
          code: r.code,
          name: r.name,
          type: r.type,
          standard_category: r.standard_category,
          rollup_parent_code: r.rollup_parent_code || '',
          xero_account_id: String(r.xero_account_id || '').trim().toLowerCase(),
        };
        if (r.level !== undefined && r.level !== null && r.level !== '') {
          row.level = Number(r.level);
        }
        if (r.is_posting !== undefined && r.is_posting !== null) {
          row.is_posting = !!r.is_posting;
        }
        return row;
      });
      const doXeroPush =
        hasXeroIds &&
        document.getElementById('onb-xero-push') &&
        document.getElementById('onb-xero-push').checked;
      showError('');
      const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts/bulk', {
        method: 'POST',
        body: JSON.stringify({ accounts: payload }),
      });
      if (!out || !out.res.ok) {
        if (out && out.data && out.data.row_errors) {
          showError('Fix the highlighted rows and try again.');
          return;
        }
        showError((out && out.data && out.data.error) || 'Save failed.');
        return;
      }
      let xeroPushWarning = '';
      if (doXeroPush) {
        const pushOut = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/push-account-names',
          { method: 'POST', body: JSON.stringify({}) }
        );
        if (!pushOut || !pushOut.res.ok) {
          xeroPushWarning =
            (pushOut && pushOut.data && pushOut.data.error) ||
            'Chart saved in Causal, but pushing names to Xero failed. Check OAuth scope (accounting.settings), reconnect Xero, or update names in Xero manually.';
        } else if (pushOut.data && pushOut.data.errors && pushOut.data.errors.length) {
          xeroPushWarning =
            'Chart saved. Some Xero name updates failed: ' +
            pushOut.data.errors
              .slice(0, 3)
              .map(function (e) {
                return (e.code || '') + ': ' + (e.error || '');
              })
              .join('; ');
        }
      }
      if (!(await patchStep('prior_data'))) return;
      org.onboarding_step = 'prior_data';
      accountsSub = 'pick';
      showDonePhase = false;
      showError(xeroPushWarning);
      render();
    };
  }

  function renderPriorData() {
    const targetFY = org.onboarding_target_fiscal_year != null
      ? Number(org.onboarding_target_fiscal_year)
      : computeCurrentFiscalYear(org.fiscal_year_end_month);
    const hasXero = !!org.xero_tenant_id;
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Bring in prior-year data?</h2>' +
      '<p class="organizational-hint">Optional — for year-over-year comparison and a faster start on FY' + targetFY + '. You can always do this later from Settings.</p>' +
      '<div class="organizational-onb-choice-list">' +
      '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-prior-clone-budget">Clone last year\'s budget as your starting point</button>' +
      (hasXero
        ? '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-prior-xero-actuals">Import last year\'s actuals from Xero (full year + year-to-date)</button>'
        : '') +
      '<button type="button" class="organizational-btn organizational-btn-outline organizational-onb-block" id="onb-prior-personnel">Copy personnel/payroll setup from last year</button>' +
      '<a class="organizational-btn organizational-btn-outline organizational-onb-block" href="/organizational/o/' + encodeURIComponent(slug) + '/settings/imports">Upload a CSV of prior-year budget or actuals</a>' +
      '</div>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-prior-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-prior-skip">Skip — I\'ll start fresh</button>' +
      '</div>';

    document.getElementById('onb-prior-back').onclick = async function () {
      if (!(await patchStep('accounts'))) return;
      org.onboarding_step = 'accounts';
      accountsSub = 'pick';
      render();
    };
    document.getElementById('onb-prior-skip').onclick = async function () {
      if (!(await patchStep('programs'))) return;
      org.onboarding_step = 'programs';
      render();
    };
    document.getElementById('onb-prior-clone-budget').onclick = async function () {
      showError('');
      const out = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/budget-lines/copy-from-prior-year',
        { method: 'POST', body: JSON.stringify({ fiscal_year: targetFY }) }
      );
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not copy prior-year budget.');
        return;
      }
      showError('Copied ' + (out.data.copied || 0) + ' budget line(s) from FY' + (out.data.from_fiscal_year) + '.');
    };
    if (hasXero) {
      document.getElementById('onb-prior-xero-actuals').onclick = async function () {
        showError('');
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/import-actuals',
          { method: 'POST', body: JSON.stringify({}) }
        );
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not import Xero actuals.');
          return;
        }
        showError('Xero actuals import started.');
      };
    }
    document.getElementById('onb-prior-personnel').onclick = async function () {
      showError('');
      const out = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/personnel/copy-from-prior-year',
        { method: 'POST', body: JSON.stringify({ fiscal_year: targetFY }) }
      );
      if (!out || !out.res.ok) {
        showError((out && out.data && out.data.error) || 'Could not copy personnel.');
        return;
      }
      showError('Copied ' + (out.data.copied || 0) + ' worker(s) from FY' + (out.data.from_fiscal_year) + '.');
    };
  }

  function renderPrograms() {
    panelEl.innerHTML = '<p class="organizational-empty">Loading programs…</p>';
    apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program', { method: 'GET' })
      .then(function (out) {
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not load programs.');
          programsDraft = [];
        } else {
          programsDraft = (out.data.programs || []).map(function (p) {
            return { id: p.id, name: p.name, code: p.code || '', active: p.is_active !== false, orig_name: p.name, orig_code: p.code || '' };
          });
        }
        renderProgramsList();
      });
  }

  function renderProgramsList() {
    function rowHtml(p, i) {
      return (
        '<tr data-i="' + i + '">' +
        '<td><input type="text" class="onb-prog-name" value="' + escapeHtml(p.name) + '" placeholder="Program name" /></td>' +
        '<td><input type="text" class="onb-prog-code" value="' + escapeHtml(p.code) + '" placeholder="Code" /></td>' +
        '<td><button type="button" class="organizational-btn organizational-btn-outline onb-prog-remove">Remove</button></td>' +
        '</tr>'
      );
    }
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">Programs</h2>' +
      '<p class="organizational-hint">Confirm the programs you\'ll budget by. You can add, rename, or remove these anytime later in Settings.</p>' +
      '<table class="organizational-table"><thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>' +
      '<tbody id="onb-prog-tbody">' + programsDraft.map(rowHtml).join('') + '</tbody></table>' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-prog-add">+ Add another program</button>' +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-prog-skip">Skip</button>' +
      '<button type="button" class="organizational-btn" id="onb-prog-next">Save and continue</button>' +
      '</div>';

    function syncFromDom() {
      const trs = panelEl.querySelectorAll('#onb-prog-tbody tr');
      trs.forEach(function (tr) {
        const i = Number(tr.getAttribute('data-i'));
        if (!programsDraft[i]) return;
        programsDraft[i].name = String(tr.querySelector('.onb-prog-name').value || '').trim();
        programsDraft[i].code = String(tr.querySelector('.onb-prog-code').value || '').trim();
      });
    }

    panelEl.querySelectorAll('.onb-prog-remove').forEach(function (btn) {
      btn.onclick = function () {
        syncFromDom();
        const tr = btn.closest('tr');
        const i = Number(tr.getAttribute('data-i'));
        programsDraft.splice(i, 1);
        renderProgramsList();
      };
    });
    document.getElementById('onb-prog-add').onclick = function () {
      syncFromDom();
      programsDraft.push({ id: null, name: '', code: '', active: true, orig_name: '', orig_code: '' });
      renderProgramsList();
    };
    document.getElementById('onb-prog-skip').onclick = function () {
      showDonePhase = true;
      render();
    };
    document.getElementById('onb-prog-next').onclick = async function () {
      syncFromDom();
      showError('');
      for (const p of programsDraft) {
        if (p.id == null) {
          if (!p.name) continue;
          const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs', {
            method: 'POST',
            body: JSON.stringify({ name: p.name, code: p.code || null }),
          });
          if (!out || !out.res.ok) {
            showError((out && out.data && out.data.error) || 'Could not save a new program.');
            return;
          }
        } else if (p.name !== p.orig_name || p.code !== p.orig_code) {
          const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs/' + p.id, {
            method: 'PATCH',
            body: JSON.stringify({ name: p.name, code: p.code || null }),
          });
          if (!out || !out.res.ok) {
            showError((out && out.data && out.data.error) || 'Could not save program changes.');
            return;
          }
        }
      }
      showDonePhase = true;
      render();
    };
  }

  function renderDone() {
    const isAdmin = org.role === 'admin';
    panelEl.innerHTML =
      '<h2 class="organizational-wizard-heading">You\'re all set!</h2>' +
      '<p class="organizational-hint">Your workspace is ready. Here\'s what you can do next:</p>' +
      '<div class="organizational-onb-next-steps">' +
      '<div class="organizational-onb-next-step"><a href="/organizational/o/' + encodeURIComponent(slug) + '" class="organizational-nav-link organizational-onb-next-step-link">View your dashboard</a><span class="organizational-onb-next-step-desc">See your financial overview and metrics</span></div>' +
      '<div class="organizational-onb-next-step"><a href="/organizational/o/' + encodeURIComponent(slug) + '/budget" class="organizational-nav-link organizational-onb-next-step-link">Edit your budget</a><span class="organizational-onb-next-step-desc">Update planned amounts by month and program</span></div>' +
      '<div class="organizational-onb-next-step"><a href="/organizational/o/' + encodeURIComponent(slug) + '/settings/imports" class="organizational-nav-link organizational-onb-next-step-link">Import more data</a><span class="organizational-onb-next-step-desc">Add actuals, programs, or grants</span></div>' +
      '</div>' +
      (isAdmin
        ? '<p class="organizational-hint">Manage multiple orgs? Save this chart of accounts as a template you can reuse next time you set one up.</p>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-save-preset">Save this setup as a template</button>'
        : '') +
      '<div class="organizational-wizard-actions">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="onb-done-back">Back</button>' +
      '<button type="button" class="organizational-btn" id="onb-done-go">Go to workspace</button>' +
      '</div>';
    document.getElementById('onb-done-back').onclick = function () {
      showDonePhase = false;
      render();
    };
    if (isAdmin) {
      document.getElementById('onb-save-preset').onclick = async function () {
        const name = window.prompt('Name this template (e.g. "Standard nonprofit setup"):', org.display_name + ' setup');
        if (!name || !name.trim()) return;
        showError('');
        const out = await apiJson('/api/organizational/setup-presets', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), source_slug: slug }),
        });
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not save template.');
          return;
        }
        showError('Saved. It will be offered next time you set up a new workspace.');
      };
    }
    document.getElementById('onb-done-go').onclick = async function () {
      if (!(await patchStep('complete'))) return;
      window.location.href = '/organizational/o/' + encodeURIComponent(slug);
    };
  }

  async function init() {
    slug = parseSlug();
    if (!slug) {
      if (loadingEl) loadingEl.hidden = true;
      showError('Invalid URL.');
      return;
    }
    const qs = new URLSearchParams(window.location.search || '');
    if (qs.get('step') === 'accounts') {
      accountsSub = 'pick';
    }

    const catOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/standard-categories', {
      method: 'GET',
    });
    if (catOut && catOut.res.ok) categories = catOut.data.categories || [];

    const presetsOut = await apiJson('/api/organizational/setup-presets', { method: 'GET' });
    if (presetsOut && presetsOut.res.ok) presets = presetsOut.data.presets || [];

    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug), { method: 'GET' });
    if (loadingEl) loadingEl.hidden = true;
    if (!out || !out.res.ok) {
      showError((out && out.data && out.data.error) || 'Could not load workspace.');
      return;
    }
    org = out.data.org;
    if (!org.onboarding_step) org.onboarding_step = 'basics';

    if (org.onboarding_step === 'complete') {
      window.location.replace('/organizational/o/' + encodeURIComponent(slug));
      return;
    }

    if (loadingEl) loadingEl.hidden = true;
    if (rootEl) rootEl.hidden = false;

    if (qs.get('xero') === 'connected' && org.onboarding_step === 'accounts') {
      accountsSub = 'pick';
      await loadXeroIntoDraft();
      return;
    }

    render();
  }

  // Initialize header elements
  (async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';

        // Show coop icon for workers, hide for public users
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (e) {
      console.error('Failed to initialize header:', e);
    }

    // Bind outside click handlers
    bindOrganizationalDropdownOutsideClick();

    // Escape key handler
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

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  // Expose functions globally
  window.toggleOrganizationalDropdown = toggleOrganizationalDropdown;
  window.closeOrganizationalDropdown = closeOrganizationalDropdown;
  window.coopDropdownOpenMembers = coopDropdownOpenMembers;
  window.coopDropdownOpenLibrary = coopDropdownOpenLibrary;
  window.coopDropdownOpenWorkPool = coopDropdownOpenWorkPool;
  window.openOrganizationalOverlay = openOrganizationalOverlay;
  window.closeOrganizationalOverlay = closeOrganizationalOverlay;

  init().catch(function(e) {
    console.error("Onboarding init error:", e);
  });
})();
