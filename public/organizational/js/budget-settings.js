/* budget-settings.js — Budget module's own Settings tab: Chart of Accounts (account mapping +
 * programs/activities) and Imports.
 *
 * Moved from the org-wide Settings page (2026-09-11): this is Budget-module config, not
 * true-regardless-of-module org config, so it lives with the module that owns it.
 * "Organization" is an enterprise app — each module (Budget, Accounting, Compliance,
 * Membership, Fiscal Sponsorship, ...) may own its own settings; the org-wide Settings page
 * (settings.html/settings.js) stays for things true no matter which modules are on.
 *
 * Integrations (Xero/QuickBooks connect, disconnect, raw tracking-category browsing) briefly
 * lived here too but moved back to org-wide Settings on 2026-09-12 — an OAuth credential
 * belongs to the whole org, not to whichever module consumed it first, and other modules
 * (e.g. Compliance's 990 Expense classification) depend on the same chart of accounts. This
 * file now only READS connection status (via /xero/status) to decide whether to show the
 * mapping tables below; the Connect/Disconnect controls themselves are in settings.js.
 *
 * Ported near-verbatim from settings.js. Depends on window.OrganizationalBudget.getState()
 * for slug/isOrgAdmin (set by budget-workspace.js's load()), and on apiJson/escapeHtml from
 * utils.js. Exposes window.OrganizationalBudget.settings.render() — lazy-rendered the first
 * time the Settings tab is opened (see budget-workspace.js's switchTab), re-run (idempotently
 * re-wired, freshly re-loaded) on every subsequent visit to the tab.
 */
(function () {
  'use strict';

  window.OrganizationalBudget = window.OrganizationalBudget || {};

  function slug() { return window.OrganizationalBudget.getState?.()?.slug || ''; }
  function isOrgAdmin() { return !!window.OrganizationalBudget.getState?.()?.isOrgAdmin; }

  const errEl = document.getElementById('organizational-org-error');
  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  // Xero connect/disconnect/status controls live in settings.js now (see file header) — this
  // page only reads status to gate its own mapping tables.
  const xeroNotConnectedHint = document.getElementById('organizational-xero-not-connected-hint');
  const xeroSettingsLink = document.getElementById('organizational-xero-settings-link');
  const xeroMappingHeading = document.getElementById('organizational-xero-mapping-heading');
  const xeroMappingSection = document.getElementById('organizational-xero-mapping-section');
  const xeroMappingTbody = document.getElementById('organizational-xero-mapping-tbody');
  const xeroTrackMapHeading = document.getElementById('organizational-xero-track-map-heading');
  const xeroTrackMapSection = document.getElementById('organizational-xero-track-map-section');
  const xeroTrackMapBlocks = document.getElementById('organizational-xero-track-map-blocks');

  // Keeps each section's heading hidden right alongside its content -- previously the
  // headings ("Account categories mapping" / "Tracking → Program map") were static HTML with
  // no hidden wiring, so they stayed visible with nothing underneath whenever Xero wasn't
  // connected or had no tracking categories (caught in a 2026-09-15 layout review).
  function setMappingVisible(v) {
    if (xeroMappingHeading) xeroMappingHeading.hidden = !v;
    if (xeroMappingSection) xeroMappingSection.hidden = !v;
  }
  function setTrackMapVisible(v) {
    if (xeroTrackMapHeading) xeroTrackMapHeading.hidden = !v;
    if (xeroTrackMapSection) xeroTrackMapSection.hidden = !v;
  }

  const importGlobalHint = document.getElementById('organizational-import-global-hint');
  const importHistoryEmpty = document.getElementById('organizational-import-history-empty');

  const programsTbody = document.getElementById('organizational-programs-tbody');
  const programAddBtn = document.getElementById('organizational-program-add');
  const activityAddBtn = document.getElementById('organizational-activity-add');
  const programsFreshnessEl = document.getElementById('organizational-programs-freshness');
  const programModal = document.getElementById('organizational-program-modal');
  const programModalTitle = document.getElementById('organizational-program-modal-title');
  const programForm = document.getElementById('organizational-program-form');
  const programEditId = document.getElementById('organizational-program-edit-id');
  const programName = document.getElementById('organizational-program-name');
  const programDescription = document.getElementById('organizational-program-description');
  const programParentWrap = document.getElementById('organizational-program-parent-wrap');
  const programParentId = document.getElementById('organizational-program-parent-id');
  const programActive = document.getElementById('organizational-program-active');
  const programCancel = document.getElementById('organizational-program-cancel');
  const programSave = document.getElementById('organizational-program-save');

  const recodeModal = document.getElementById('organizational-recode-modal');
  const recodeSourceLabel = document.getElementById('organizational-recode-source-label');
  const recodeTargetSelect = document.getElementById('organizational-recode-target');
  const recodePreviewEl = document.getElementById('organizational-recode-preview');
  const recodeCancel = document.getElementById('organizational-recode-cancel');
  const recodeConfirm = document.getElementById('organizational-recode-confirm');

  // ── State ─────────────────────────────────────────────────────────────────────
  let programsCache = [];
  let accountsCache = [];
  let programsUiWired = false;
  let importsUiWired = false;
  let recodeSourceProgram = null;
  let recodeConflictsPresent = true;

  function syncOrganizationalModalBodyLock() {
    if (!document.body.classList.contains('organizational-app')) return;
    const programOpen = programModal && programModal.classList.contains('organizational-modal-open');
    const recodeOpen = recodeModal && recodeModal.classList.contains('organizational-modal-open');
    document.body.classList.toggle('organizational-app-modal-open', !!(programOpen || recodeOpen));
  }

  function truncateDesc(s, max) {
    const str = String(s || '').trim();
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }

  function renderProgramsManagement() {
    if (!programsTbody) return;
    if (!programsCache || programsCache.length === 0) {
      programsTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="4">No programs yet. Add one to start manual budget lines.</td></tr>';
      return;
    }
    const top = programsCache
      .filter(function (p) {
        return p.parent_id == null;
      })
      .sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || '')) || String(a.name || '').localeCompare(String(b.name || ''));
      });
    const kidsByParent = {};
    programsCache
      .filter(function (p) {
        return p.parent_id != null;
      })
      .forEach(function (p) {
        const k = String(p.parent_id);
        if (!kidsByParent[k]) kidsByParent[k] = [];
        kidsByParent[k].push(p);
      });
    Object.keys(kidsByParent).forEach(function (k) {
      kidsByParent[k].sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || '')) || String(a.name || '').localeCompare(String(b.name || ''));
      });
    });
    const rows = [];
    top.forEach(function (p) {
      const id = Number(p.id);
      const act = p.is_active != null ? p.is_active : p.active;
      const desc = truncateDesc(p.description, 160);
      const defaultBadge = p.is_default ? ' <span class="organizational-badge">default</span>' : '';
      rows.push(
        '<tr><td>' +
          escapeHtml(p.name) +
          defaultBadge +
          '</td><td>' +
          escapeHtml(desc || '—') +
          '</td><td>' +
          escapeHtml(act ? 'Yes' : 'No') +
          '</td><td style="text-align:right;white-space:nowrap;"><button type="button" class="organizational-btn organizational-btn-outline organizational-program-edit-btn" data-program-id="' +
          id +
          '" style="padding:6px 12px;font-size:0.8125rem;">Edit</button> <button type="button" class="organizational-btn organizational-btn-outline organizational-program-recode-btn" data-program-id="' +
          id +
          '" style="padding:6px 12px;font-size:0.8125rem;">Recode…</button></td></tr>'
      );
      (kidsByParent[String(id)] || []).forEach(function (c) {
        const cid = Number(c.id);
        const cAct = c.is_active != null ? c.is_active : c.active;
        const cDesc = truncateDesc(c.description, 160);
        rows.push(
          '<tr><td style="padding-left:20px;">└ ' +
            escapeHtml(c.name) +
            '</td><td>' +
            escapeHtml(cDesc || '—') +
            '</td><td>' +
            escapeHtml(cAct ? 'Yes' : 'No') +
            '</td><td style="text-align:right;white-space:nowrap;"><button type="button" class="organizational-btn organizational-btn-outline organizational-program-edit-btn" data-program-id="' +
            cid +
            '" style="padding:6px 12px;font-size:0.8125rem;">Edit</button> <button type="button" class="organizational-btn organizational-btn-outline organizational-program-recode-btn" data-program-id="' +
            cid +
            '" style="padding:6px 12px;font-size:0.8125rem;">Recode…</button></td></tr>'
        );
      });
    });
    programsTbody.innerHTML = rows.join('');
    programsTbody.querySelectorAll('.organizational-program-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = Number(btn.getAttribute('data-program-id'));
        const p = programsCache.find(function (x) {
          return Number(x.id) === id;
        });
        if (p) openProgramModal(p);
      });
    });
    programsTbody.querySelectorAll('.organizational-program-recode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = Number(btn.getAttribute('data-program-id'));
        const p = programsCache.find(function (x) {
          return Number(x.id) === id;
        });
        if (p) openRecodeModal(p);
      });
    });
  }

  function openProgramModal(program, mode) {
    if (!programModal) return;
    const editing = program && program.id;
    const isActivityMode = mode === 'activity' || (editing && program.parent_id != null);
    if (programModalTitle)
      programModalTitle.textContent = editing
        ? isActivityMode
          ? 'Edit activity'
          : 'Edit program'
        : isActivityMode
          ? 'Add activity'
          : 'Add program';
    if (programEditId) programEditId.value = editing ? String(program.id) : '';
    if (programName) programName.value = program ? program.name || '' : '';
    if (programDescription) programDescription.value = program ? program.description || '' : '';
    if (programParentWrap) programParentWrap.hidden = !isActivityMode;
    if (programParentId) {
      const topPrograms = programsCache.filter(function (p) {
        return p.parent_id == null;
      });
      programParentId.innerHTML =
        '<option value="">Select parent</option>' +
        topPrograms
          .map(function (p) {
            return '<option value="' + escapeHtml(String(p.id)) + '">' + escapeHtml(p.name || '') + '</option>';
          })
          .join('');
      if (isActivityMode && program && program.parent_id != null) {
        programParentId.value = String(program.parent_id);
      } else {
        programParentId.value = '';
      }
    }
    const isDefault = !!(program && program.is_default);
    if (programActive) {
      const currentActive =
        program && program.is_active != null ? !!program.is_active : program ? !!program.active : true;
      programActive.checked = currentActive;
      programActive.disabled = isDefault;
    }
    programModal.hidden = false;
    programModal.classList.add('organizational-modal-open');
    if (programForm) {
      programForm.dataset.mode = isActivityMode ? 'activity' : 'program';
      programForm.dataset.isDefault = isDefault ? '1' : '0';
    }
    syncOrganizationalModalBodyLock();
    if (programName) programName.focus();
  }

  function closeProgramModal() {
    if (!programModal) return;
    programModal.classList.remove('organizational-modal-open');
    programModal.hidden = true;
    if (programForm) programForm.reset();
    if (programEditId) programEditId.value = '';
    if (programParentId) programParentId.value = '';
    if (programActive) programActive.checked = true;
    if (programActive) programActive.disabled = false;
    if (programParentWrap) programParentWrap.hidden = true;
    if (programForm) {
      delete programForm.dataset.mode;
      delete programForm.dataset.isDefault;
    }
    syncOrganizationalModalBodyLock();
  }

  // ── Recode modal: move a program/activity's planning-stage data to a same-dimension sibling
  // (see server/organizational/lib/programRecode.js for exactly what moves vs. stays excluded).
  const RECODE_TABLE_LABELS = {
    org_budget_lines: 'Budget lines',
    org_grant_allocations: 'Grant allocations',
    org_personnel_allocations: 'Personnel allocations',
    org_schedule_items: 'Schedule items',
    org_projections: 'Projections',
    org_allocation_lines: 'Indirect cost allocations',
  };

  function recodeSiblings() {
    if (!recodeSourceProgram) return [];
    const isActivity = recodeSourceProgram.parent_id != null;
    return programsCache.filter(function (p) {
      if (!p || Number(p.id) === Number(recodeSourceProgram.id)) return false;
      const pIsActivity = p.parent_id != null;
      if (pIsActivity !== isActivity) return false;
      if (isActivity && Number(p.parent_id) !== Number(recodeSourceProgram.parent_id)) return false;
      const act = p.is_active != null ? p.is_active : p.active;
      return !!act;
    });
  }

  function openRecodeModal(program) {
    if (!recodeModal) return;
    recodeSourceProgram = program;
    recodeConflictsPresent = true;
    if (recodeConfirm) recodeConfirm.disabled = true;
    if (recodePreviewEl) recodePreviewEl.innerHTML = '';
    const noun = program.parent_id != null ? 'activity' : 'program';
    if (recodeSourceLabel) {
      recodeSourceLabel.textContent =
        'Moves all recodable data from the ' + noun + ' "' + (program.name || '') +
        '" to a different ' + noun + '. Posted transactions (ledger, bills, invoices, actuals) are not moved -- see the preview below.';
    }
    const siblings = recodeSiblings();
    if (recodeTargetSelect) {
      recodeTargetSelect.innerHTML =
        '<option value="">Select target ' + noun + '</option>' +
        siblings
          .map(function (p) {
            return '<option value="' + escapeHtml(String(p.id)) + '">' + escapeHtml(p.name || '') + '</option>';
          })
          .join('');
      recodeTargetSelect.value = '';
    }
    recodeModal.hidden = false;
    recodeModal.classList.add('organizational-modal-open');
    syncOrganizationalModalBodyLock();
  }

  function closeRecodeModal() {
    if (!recodeModal) return;
    recodeModal.classList.remove('organizational-modal-open');
    recodeModal.hidden = true;
    recodeSourceProgram = null;
    recodeConflictsPresent = true;
    if (recodeTargetSelect) recodeTargetSelect.value = '';
    if (recodePreviewEl) recodePreviewEl.innerHTML = '';
    if (recodeConfirm) recodeConfirm.disabled = true;
    syncOrganizationalModalBodyLock();
  }

  function renderRecodePreview(preview) {
    if (!recodePreviewEl) return;
    if (!preview || (preview.totalRecodable === 0 && (!preview.configRefs || preview.configRefs.length === 0))) {
      recodePreviewEl.innerHTML = '<p class="organizational-hint" style="margin:0;">Nothing to recode -- no planning-stage data found.</p>';
      return;
    }
    const rows = (preview.categories || []).map(function (c) {
      const label = RECODE_TABLE_LABELS[c.table] || c.table;
      const conflictNote = c.conflicts > 0
        ? ' <span style="color:var(--organizational-danger, #b91c1c);">(' + c.conflicts + ' conflict' + (c.conflicts === 1 ? '' : 's') + ' -- already exists on target)</span>'
        : '';
      return '<li>' + escapeHtml(label) + ': ' + c.count + conflictNote + '</li>';
    });
    const configRows = (preview.configRefs || []).map(function (c) {
      return '<li>' + escapeHtml(c.label) + ': ' + c.count + '</li>';
    });
    const excludedRows = (preview.excluded || []).map(function (c) {
      return '<li>' + escapeHtml(c.label) + ': ' + c.count + '</li>';
    });
    let html = '<p style="margin:0 0 4px;font-weight:600;font-size:0.875rem;">Will move:</p><ul style="margin:0 0 10px;padding-left:20px;font-size:0.875rem;">' + (rows.join('') || '<li>Nothing</li>') + '</ul>';
    if (configRows.length) {
      html += '<p style="margin:0 0 4px;font-weight:600;font-size:0.875rem;">Config references:</p><ul style="margin:0 0 10px;padding-left:20px;font-size:0.875rem;">' + configRows.join('') + '</ul>';
    }
    if (excludedRows.length) {
      html += '<p style="margin:0 0 4px;font-weight:600;font-size:0.875rem;">Not moved (posted data -- stays on source):</p><ul style="margin:0;padding-left:20px;font-size:0.875rem;color:var(--organizational-text-secondary,#6b7280);">' + excludedRows.join('') + '</ul>';
    }
    if (preview.hasConflicts) {
      html += '<p class="organizational-hint" style="margin-top:10px;color:var(--organizational-danger, #b91c1c);">Resolve the conflicts above before recoding -- those rows already have data on the target.</p>';
    }
    recodePreviewEl.innerHTML = html;
  }

  function wireRecodeModalOnce() {
    if (recodeModal && recodeModal.dataset.wired === '1') return;
    if (!recodeModal) return;
    recodeModal.dataset.wired = '1';
    recodeModal.addEventListener('click', function (e) {
      if (e.target === recodeModal) closeRecodeModal();
    });
    if (recodeCancel) recodeCancel.addEventListener('click', closeRecodeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (recodeModal.classList.contains('organizational-modal-open')) closeRecodeModal();
    });
    if (recodeTargetSelect) {
      recodeTargetSelect.addEventListener('change', async function () {
        const targetId = Number(recodeTargetSelect.value || 0);
        if (!recodeSourceProgram || !targetId) {
          recodeConflictsPresent = true;
          if (recodeConfirm) recodeConfirm.disabled = true;
          if (recodePreviewEl) recodePreviewEl.innerHTML = '';
          return;
        }
        if (recodePreviewEl) recodePreviewEl.innerHTML = '<p class="organizational-hint" style="margin:0;">Loading preview…</p>';
        if (recodeConfirm) recodeConfirm.disabled = true;
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(slug()) + '/programs/' + recodeSourceProgram.id +
            '/recode-preview?target_program_id=' + targetId,
          { method: 'GET' }
        );
        if (!out || !out.res.ok) {
          if (recodePreviewEl) recodePreviewEl.innerHTML = '<p class="organizational-hint" style="margin:0;">' + escapeHtml((out && out.data && out.data.error) || 'Could not load preview.') + '</p>';
          recodeConflictsPresent = true;
          return;
        }
        renderRecodePreview(out.data);
        recodeConflictsPresent = !!out.data.hasConflicts;
        const nothingToDo = out.data.totalRecodable === 0 && (!out.data.configRefs || out.data.configRefs.length === 0);
        if (recodeConfirm) recodeConfirm.disabled = recodeConflictsPresent || nothingToDo;
      });
    }
    if (recodeConfirm) {
      recodeConfirm.addEventListener('click', async function () {
        if (!recodeSourceProgram || !recodeTargetSelect || !recodeTargetSelect.value) return;
        recodeConfirm.disabled = true;
        const out = await apiJson(
          '/api/organizational/orgs/' + encodeURIComponent(slug()) + '/programs/' + recodeSourceProgram.id + '/recode',
          { method: 'POST', body: JSON.stringify({ target_program_id: Number(recodeTargetSelect.value) }) }
        );
        if (!out || !out.res.ok) {
          showError((out && out.data && out.data.error) || 'Could not recode.');
          recodeConfirm.disabled = false;
          return;
        }
        showError('');
        closeRecodeModal();
        await loadPrograms(slug());
      });
    }
  }

  function wireProgramsManagementOnce() {
    if (programsUiWired) return;
    programsUiWired = true;
    if (programModal) {
      programModal.addEventListener('click', function (e) {
        if (e.target === programModal) closeProgramModal();
      });
    }
    if (programCancel) programCancel.addEventListener('click', closeProgramModal);
    if (programAddBtn) {
      programAddBtn.addEventListener('click', function () {
        openProgramModal(null, 'program');
      });
    }
    if (activityAddBtn) {
      activityAddBtn.addEventListener('click', function () {
        openProgramModal(null, 'activity');
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (programModal && programModal.classList.contains('organizational-modal-open')) closeProgramModal();
    });
    if (programForm) {
      programForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!slug()) return;
        const name = (programName && programName.value) || '';
        if (!String(name).trim()) return;
        const body = {
          name: String(name).trim(),
          description: String((programDescription && programDescription.value) || ''),
          active: !!(programActive && programActive.checked),
        };
        const mode = programForm && programForm.dataset && programForm.dataset.mode ? programForm.dataset.mode : 'program';
        if (mode === 'activity') {
          const pid = Number.parseInt(String((programParentId && programParentId.value) || ''), 10);
          if (!Number.isInteger(pid) || pid < 1) {
            showError('Choose a parent program for the activity.');
            return;
          }
          body.parent_id = pid;
        }
        const editId = programEditId && programEditId.value ? Number(programEditId.value) : 0;
        const isEdit = Number.isInteger(editId) && editId > 0;
        if (programSave) programSave.disabled = true;
        let out;
        if (isEdit) {
          out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug()) + '/programs/' + editId, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
        } else {
          out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug()) + '/programs', {
            method: 'POST',
            body: JSON.stringify(body),
          });
        }
        if (programSave) programSave.disabled = false;
        if (!out) { if (loadingEl) loadingEl.hidden = true; return; }
        if (!out.res.ok) {
          showError(out.data.error || 'Could not save program.');
          return;
        }
        showError('');
        closeProgramModal();
        await loadPrograms(slug());
      });
    }
  }

  function normXeroId(id) {
    return String(id || '').trim().toLowerCase();
  }

  function accountLabel(a) {
    if (!a) return '';
    return String(a.code || '') + ' — ' + String(a.name || '') + ' (' + String(a.type || '') + ')';
  }

  function buildAccountOptionsHtml(accounts, selectedId) {
    let html = '<option value="">' + escapeHtml('— Not mapped —') + '</option>';
    (accounts || []).forEach(function (a) {
      if (!a || !a.id) return;
      const sel = Number(selectedId) === Number(a.id) ? ' selected' : '';
      html +=
        '<option value="' +
        escapeHtml(String(a.id)) +
        '"' +
        sel +
        '>' +
        escapeHtml(accountLabel(a)) +
        '</option>';
    });
    return html;
  }

  function buildProgramOptionsHtml(programs, selectedId) {
    let html = '<option value="">' + escapeHtml('— None —') + '</option>';
    (programs || []).forEach(function (p) {
      if (!p || !p.id) return;
      const sel = Number(selectedId) === Number(p.id) ? ' selected' : '';
      html +=
        '<option value="' +
        escapeHtml(String(p.id)) +
        '"' +
        sel +
        '>' +
        escapeHtml(p.name || '') +
        '</option>';
    });
    return html;
  }

  function topLevelPrograms(programs) {
    return (programs || []).filter(function (p) {
      return p && p.parent_id == null;
    });
  }

  function activityPrograms(programs) {
    return (programs || []).filter(function (p) {
      return p && p.parent_id != null;
    });
  }

  async function loadPrograms(slug) {
    const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs', { method: 'GET' });
    if (!out || !out.res.ok) {
      programsCache = [];
      renderProgramsManagement();
      if (programsFreshnessEl) {
        programsFreshnessEl.textContent = '';
        programsFreshnessEl.hidden = true;
      }
      return;
    }
    programsCache = Array.isArray(out.data.programs) ? out.data.programs : [];
    renderProgramsManagement();
    if (programsFreshnessEl) {
      const iso = out.data.programs_last_updated_at;
      if (iso && typeof window.formatFreshnessLine === 'function') {
        programsFreshnessEl.textContent = window.formatFreshnessLine(iso, 'updated');
        programsFreshnessEl.hidden = false;
      } else {
        programsFreshnessEl.textContent = '';
        programsFreshnessEl.hidden = true;
      }
    }
  }

  async function renderTrackingProgramMapTable(slug, cats) {
    if (!xeroTrackMapBlocks || !xeroTrackMapSection) return;
    if (!cats || cats.length === 0) {
      setTrackMapVisible(false);
      return;
    }
    let progs = programsCache;
    if (!progs || progs.length === 0) {
      const pr = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs');
      progs = pr && pr.data && pr.data.programs ? pr.data.programs : [];
    }
    const mapsOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/tracking-program-maps');
    const maps = (mapsOut && mapsOut.data && mapsOut.data.maps) || [];
    const mapByCategory = {};
    maps.forEach(function (m) {
      const cat = String(m.xero_tracking_category_id || '').toLowerCase();
      const opt = String(m.xero_tracking_option_id || '').toLowerCase();
      const dim = String(m.dimension || 'activity').toLowerCase();
      if (!mapByCategory[cat]) mapByCategory[cat] = {};
      mapByCategory[cat][opt + '|' + dim] = m.coop_program_id;
    });

    setTrackMapVisible(true);
    xeroTrackMapBlocks.innerHTML = '';

    function optionSelectHtml(dimension, selectedId) {
      const rows = dimension === 'program' ? topLevelPrograms(programsCache) : activityPrograms(programsCache);
      let html = '<option value="">— None —</option>';
      rows.forEach(function (p) {
        const sel = Number(selectedId) === Number(p.id) ? ' selected' : '';
        const label = (p.code ? p.code + ' — ' : '') + (p.name || '');
        html += '<option value="' + escapeHtml(String(p.id)) + '"' + sel + '>' + escapeHtml(label) + '</option>';
      });
      const addValue = dimension === 'program' ? '__add_program__' : '__add_activity__';
      const addLabel = dimension === 'program' ? '+ Add program' : '+ Add activity under…';
      html += '<option value="' + addValue + '">' + addLabel + '</option>';
      return html;
    }

    for (const c of cats) {
      const catId = String(c.tracking_category_id || '').toLowerCase();
      const opts = (Array.isArray(c.options) ? c.options : []).filter(function (o) {
        const st = String(o.status || '').toUpperCase();
        return st !== 'ARCHIVED' && st !== 'DELETED';
      });
      if (!opts.length) continue;
      const optionNameById = {};
      opts.forEach(function (o) {
        optionNameById[String(o.tracking_option_id || '').toLowerCase()] = String(o.name || '').trim();
      });
      const categoryMaps = mapByCategory[catId] || {};
      const existingDim = Object.keys(categoryMaps).some(function (k) {
        return k.endsWith('|program');
      })
        ? 'program'
        : 'activity';
      const blockState = { dimension: existingDim, selections: {} };
      opts.forEach(function (o) {
        const optId = String(o.tracking_option_id || '').toLowerCase();
        const mapped = categoryMaps[optId + '|' + existingDim];
        blockState.selections[optId] = mapped != null ? String(mapped) : '';
      });

      const block = document.createElement('section');
      block.className = 'organizational-card';
      block.style.marginBottom = '14px';
      block.setAttribute('data-cat-id', catId);
      block.innerHTML =
        '<div class="organizational-section-title" style="margin-top:0;">Tracking category: ' +
        escapeHtml(c.name || '') +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">' +
        '<span class="organizational-hint">This Xero category represents:</span>' +
        '<select class="organizational-track-dimension"><option value="activity">Activities</option><option value="program">Programs</option></select>' +
        '</div>' +
        '<div class="organizational-table-wrap"><table class="organizational-table" aria-label="Tracking map">' +
        '<thead><tr><th>Xero option</th><th>Maps to</th></tr></thead><tbody class="organizational-track-map-body"></tbody></table></div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:12px;">' +
        '<button type="button" class="organizational-btn app-btn-secondary organizational-track-map-save-all">Save mappings</button>' +
        '<p class="organizational-hint organizational-track-map-msg" style="margin:0;" hidden></p>' +
        '</div>';

      const dimSel = block.querySelector('.organizational-track-dimension');
      const tbody = block.querySelector('.organizational-track-map-body');
      const msg = block.querySelector('.organizational-track-map-msg');
      let successTimer = null;
      if (dimSel) dimSel.value = existingDim;

      function clearMessage() {
        if (successTimer) {
          clearTimeout(successTimer);
          successTimer = null;
        }
        if (msg) {
          msg.hidden = true;
          msg.textContent = '';
        }
      }

      function showSuccessMessage(text) {
        clearMessage();
        if (!msg) return;
        msg.hidden = false;
        msg.textContent = text;
        successTimer = setTimeout(function () {
          if (msg) {
            msg.hidden = true;
            msg.textContent = '';
          }
          successTimer = null;
        }, 3000);
      }

      function showErrorMessage(text) {
        clearMessage();
        if (!msg) return;
        msg.hidden = false;
        msg.textContent = text;
      }

      function collectCurrentSelections() {
        tbody.querySelectorAll('tr[data-opt-id]').forEach(function (trEl) {
          const optId = trEl.getAttribute('data-opt-id');
          const sel = trEl.querySelector('.organizational-track-map-prog');
          if (!optId || !sel) return;
          const v = String(sel.value || '');
          if (v === '__add_program__' || v === '__add_activity__') return;
          blockState.selections[optId] = v;
        });
      }

      function renderRows(preferredSelectionByOptId) {
        const dim = dimSel ? dimSel.value : blockState.dimension || 'activity';
        blockState.dimension = dim;
        tbody.innerHTML = opts
          .map(function (o) {
            const optId = String(o.tracking_option_id || '').toLowerCase();
            const preferred =
              preferredSelectionByOptId && Object.prototype.hasOwnProperty.call(preferredSelectionByOptId, optId)
                ? preferredSelectionByOptId[optId]
                : null;
            const selected =
              preferred != null
                ? preferred
                : blockState.selections[optId] != null
                  ? blockState.selections[optId]
                  : categoryMaps[optId + '|' + dim] || '';
            return (
              '<tr data-opt-id="' +
              escapeHtml(optId) +
              '">' +
              '<td>' +
              escapeHtml(o.name || '') +
              '</td>' +
              '<td><select class="organizational-track-map-prog">' +
              optionSelectHtml(dim, selected) +
              '</select>' +
              '<div class="organizational-track-inline-create" hidden style="margin-top:8px;"></div></td>' +
              '</tr>'
            );
          })
          .join('');

        tbody.querySelectorAll('.organizational-track-map-prog').forEach(function (sel) {
          sel.addEventListener('change', function () {
            clearMessage();
            const createWrap = sel.closest('td').querySelector('.organizational-track-inline-create');
            if (!createWrap) return;
            const trEl = sel.closest('tr');
            const optId = trEl ? trEl.getAttribute('data-opt-id') : '';
            const optName = optionNameById[String(optId || '').toLowerCase()] || '';
            const v = sel.value;
            if (v !== '__add_program__' && v !== '__add_activity__') {
              if (optId) blockState.selections[optId] = v;
              createWrap.hidden = true;
              createWrap.innerHTML = '';
              return;
            }
            if (v === '__add_program__') {
              createWrap.hidden = false;
              createWrap.innerHTML =
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<input type="text" class="organizational-track-new-name" placeholder="New program name" value="' +
                escapeHtml(optName) +
                '">' +
                '<button type="button" class="organizational-btn organizational-btn-outline organizational-track-create">Create</button></div>';
            } else {
              const parentOpts =
                '<option value="">Select parent</option>' +
                topLevelPrograms(programsCache)
                  .map(function (p) {
                    return '<option value="' + escapeHtml(String(p.id)) + '">' + escapeHtml(p.name || '') + '</option>';
                  })
                  .join('');
              createWrap.hidden = false;
              createWrap.innerHTML =
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<select class="organizational-track-parent-id">' +
                parentOpts +
                '</select>' +
                '<input type="text" class="organizational-track-new-name" placeholder="New activity name" value="' +
                escapeHtml(optName) +
                '">' +
                '<button type="button" class="organizational-btn organizational-btn-outline organizational-track-create">Create</button></div>';
            }
            const createBtn = createWrap.querySelector('.organizational-track-create');
            if (!createBtn) return;
            createBtn.addEventListener('click', async function () {
              clearMessage();
              const nameEl = createWrap.querySelector('.organizational-track-new-name');
              const parentEl = createWrap.querySelector('.organizational-track-parent-id');
              const name = String(nameEl && nameEl.value ? nameEl.value : '').trim();
              if (!name) {
                showError('Enter a name to create.');
                return;
              }
              let body = { name: name };
              if (v === '__add_activity__') {
                const pid = Number.parseInt(String(parentEl && parentEl.value ? parentEl.value : ''), 10);
                if (!Number.isInteger(pid) || pid < 1) {
                  showError('Choose a parent program for the activity.');
                  return;
                }
                body.parent_id = pid;
              }
              createBtn.disabled = true;
              const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug()) + '/programs', {
                method: 'POST',
                body: JSON.stringify(body),
              });
              createBtn.disabled = false;
              if (!out || !out.res.ok) {
                showError((out && out.data && out.data.error) || 'Could not create program/activity.');
                return;
              }
              showError('');
              await loadPrograms(slug());
              collectCurrentSelections();
              if (out.data && out.data.program && out.data.program.id && optId) {
                blockState.selections[optId] = String(out.data.program.id);
              }
              renderRows();
            });
          });
        });
      }

      if (dimSel) {
        dimSel.addEventListener('change', function () {
          clearMessage();
          collectCurrentSelections();
          renderRows();
        });
      }

      const saveBtn = block.querySelector('.organizational-track-map-save-all');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
          clearMessage();
          const dim = dimSel ? dimSel.value : 'activity';
          const mappingsPayload = [];
          tbody.querySelectorAll('tr[data-opt-id]').forEach(function (trEl) {
            const optId = trEl.getAttribute('data-opt-id');
            const sel = trEl.querySelector('.organizational-track-map-prog');
            if (!optId || !sel) return;
            const raw = sel.value;
            const programId =
              raw && raw !== '__add_program__' && raw !== '__add_activity__' ? Number(raw) : null;
            mappingsPayload.push({
              xero_tracking_category_id: catId,
              xero_tracking_option_id: optId,
              coop_program_id: Number.isInteger(programId) ? programId : null,
              dimension: dim,
            });
          });
          saveBtn.disabled = true;
          const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug()) + '/tracking-program-map', {
            method: 'PUT',
            body: JSON.stringify({
              category_dimensions: (function () {
                const cd = {};
                cd[catId] = dim;
                return cd;
              })(),
              mappings: mappingsPayload,
            }),
          });
          saveBtn.disabled = false;
          if (!out || !out.res.ok) {
            showErrorMessage((out && out.data && out.data.error) || 'Could not save mappings.');
            return;
          }
          showSuccessMessage('Saved mappings.');
        });
      }

      renderRows();
      xeroTrackMapBlocks.appendChild(block);
    }
  }

  async function refreshXeroTables(slug) {
    if (!slug || !xeroMappingTbody) return;
    const base = '/api/organizational/orgs/' + encodeURIComponent(slug);
    const [xa, npa, tr] = await Promise.all([
      apiJson(base + '/xero/accounts'),
      apiJson(base + '/accounts'),
      apiJson(base + '/xero/tracking'),
    ]);
    if (!npa || !npa.res.ok) {
      xeroMappingTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="4">Could not load NP accounts.</td></tr>';
      return;
    }
    const accountList = Array.isArray(npa.data.accounts) ? npa.data.accounts : [];
    accountsCache = accountList;
    const xeroByNp = {};
    accountList.forEach(function (a) {
      if (a && a.xero_account_id) {
        xeroByNp[normXeroId(a.xero_account_id)] = a.id;
      }
    });

    if (!xa || !xa.res.ok) {
      xeroMappingTbody.innerHTML =
        '<tr class="organizational-table-empty"><td colspan="4">' +
        escapeHtml(xa && xa.data && xa.data.error ? xa.data.error : 'Could not load Xero accounts.') +
        '</td></tr>';
    } else {
      const list = Array.isArray(xa.data.accounts) ? xa.data.accounts : [];
      const rows = list
        .filter(function (a) {
          return a && a.account_id;
        })
        .sort(function (a, b) {
          const c1 = String(a.code || '').localeCompare(String(b.code || ''));
          if (c1 !== 0) return c1;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
      if (rows.length === 0) {
        xeroMappingTbody.innerHTML =
          '<tr class="organizational-table-empty"><td colspan="4">No Xero accounts returned.</td></tr>';
      } else {
        xeroMappingTbody.innerHTML = rows
          .map(function (a) {
            const xid = normXeroId(a.account_id);
            const mapped = xeroByNp[xid];
            const opts = buildAccountOptionsHtml(accountList, mapped);
            return (
              '<tr data-xero-account-id="' +
              escapeHtml(xid) +
              '"><td><code>' +
              escapeHtml(a.code || '—') +
              '</code></td><td>' +
              escapeHtml(a.name || '') +
              '</td><td>' +
              escapeHtml(a.type || '') +
              ' <span class="organizational-hint">' +
              escapeHtml(a.status || '') +
              '</span></td><td><select class="organizational-xero-map-select" aria-label="Map to NP account">' +
              opts +
              '</select></td></tr>'
            );
          })
          .join('');
        xeroMappingTbody.querySelectorAll('.organizational-xero-map-select').forEach(function (sel) {
          sel.addEventListener('change', async function () {
            const trEl = sel.closest('tr');
            const rawId = trEl && trEl.getAttribute('data-xero-account-id');
            if (!rawId) return;
            const v = sel.value;
            const body = {
              xero_account_id: rawId,
              coop_account_id: v === '' ? null : Number(v),
            };
            sel.disabled = true;
            const out = await apiJson(base + '/xero/map-account', {
              method: 'POST',
              body: JSON.stringify(body),
            });
            sel.disabled = false;
            if (!out || !out.res.ok) {
              showError((out && out.data && out.data.error) || 'Could not save mapping.');
              await refreshXeroTables(slug);
              return;
            }
            showError('');
            await refreshXeroTables(slug);
          });
        });
      }
    }

    if (!tr || !tr.res.ok) {
      if (xeroTrackMapSection) setTrackMapVisible(false);
    } else {
      const cats = Array.isArray(tr.data.tracking_categories) ? tr.data.tracking_categories : [];
      if (cats.length === 0) {
        if (xeroTrackMapSection) setTrackMapVisible(false);
      } else {
        await renderTrackingProgramMapTable(slug, cats);
      }
    }
  }

  // Reads connection status only — Connect/Disconnect/Refresh controls live in settings.js
  // now (see file header). Gates this page's own mapping tables and points to Settings when
  // not connected, instead of duplicating the credential UI here.
  async function loadXeroPanel(slug) {
    const st = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/xero/status');
    const d = (st && st.res.ok && st.data) || {};
    const showTables = !!(d.configured && d.connected);

    if (xeroNotConnectedHint) xeroNotConnectedHint.hidden = showTables;
    if (xeroSettingsLink) xeroSettingsLink.href = '/organizational/o/' + encodeURIComponent(slug) + '/settings/integrations';
    setMappingVisible(showTables);
    if (showTables) {
      await refreshXeroTables(slug);
    } else if (xeroTrackMapSection) {
      setTrackMapVisible(false);
    }
  }

  function formatImportHistoryLine(row) {
    if (!row || !row.finished_at) return '';
    const t =
      typeof window.formatRelativeTime === 'function'
        ? window.formatRelativeTime(row.finished_at)
        : String(row.finished_at);
    const ins = row.inserted != null ? Number(row.inserted) : 0;
    const up = row.updated != null ? Number(row.updated) : 0;
    const sk = row.skipped != null ? Number(row.skipped) : 0;
    return 'Last import ' + t + ' · +' + ins + ' / ~' + up + ' / skip ' + sk;
  }
  async function refreshImportHistory(slug) {
    if (!importGlobalHint || !slug) return;
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug) + '/import/history', {
        credentials: 'include',
      });
      const data = res.ok ? await res.json() : {};
      const rows = (data && data.history) || [];
      if (!rows.length) {
        importGlobalHint.textContent = '';
        importGlobalHint.hidden = true;
        if (importHistoryEmpty) importHistoryEmpty.hidden = false;
        return;
      }
      importGlobalHint.innerHTML = rows
        .map(function (r) {
          return '<strong>' + escapeHtml(r.import_kind) + ':</strong> ' + escapeHtml(formatImportHistoryLine(r));
        })
        .join('<br>');
      importGlobalHint.hidden = false;
      if (importHistoryEmpty) importHistoryEmpty.hidden = true;
    } catch (_) {
      importGlobalHint.hidden = true;
    }
  }

  function wireImportsPanelOnce() {
    if (importsUiWired) return;
    importsUiWired = true;
    document.querySelectorAll('.organizational-import-card').forEach(function (card) {
      const kind = card.getAttribute('data-import-kind');
      const btn = card.querySelector('.organizational-import-submit');
      const file = card.querySelector('.organizational-import-file');
      const result = card.querySelector('.organizational-import-result');
      if (!kind || !btn || !file || !result) return;
      btn.addEventListener('click', async function () {
        if (!slug()) return;
        if (!file.files || !file.files[0]) {
          result.hidden = false;
          result.textContent = 'Choose a CSV file first.';
          return;
        }
        btn.disabled = true;
        result.hidden = false;
        result.textContent = 'Importing…';
        const fd = new FormData();
        fd.append('file', file.files[0]);
        try {
          const res = await fetch(
            '/api/organizational/orgs/' + encodeURIComponent(slug()) + '/import/' + kind,
            { method: 'POST', body: fd, credentials: 'include' }
          );
          const data = await res.json().catch(function () {
            return {};
          });
          if (!res.ok) {
            const errs = (data && data.errors) || [];
            const msg =
              (data && data.error) ||
              (errs.length
                ? errs
                    .slice(0, 8)
                    .map(function (e) {
                      return 'Row ' + e.row + ': ' + e.message;
                    })
                    .join('; ')
                : 'Import failed');
            result.textContent = msg;
            return;
          }
          const ins = data.inserted != null ? data.inserted : 0;
          const up = data.updated != null ? data.updated : 0;
          const sk = data.skipped != null ? data.skipped : 0;
          result.textContent = 'OK — inserted ' + ins + ', updated ' + up + ', skipped ' + sk + '.';
          file.value = '';
          await refreshImportHistory(slug());
        } catch (e) {
          result.textContent = e.message || 'Network error';
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // ── Permission gating ─────────────────────────────────────────────────────────
  // Replicates the subset of settings.js's applyPermissionGating() that applied to these
  // now-moved elements — that function no longer finds them (returns null, silent no-op),
  // so gating for Programs/Imports/account-mapping must happen here instead. (Xero
  // connect/disconnect gating lives in settings.js now, next to those controls.)
  function applyBudgetSettingsPermissionGating() {
    const admin = isOrgAdmin();
    [programAddBtn, activityAddBtn].forEach(function (el) {
      if (el) el.disabled = !admin;
    });
    document.querySelectorAll('.organizational-import-submit').forEach(function (btn) { btn.disabled = !admin; });
    document.querySelectorAll('.organizational-xero-map-select').forEach(function (sel) { sel.disabled = !admin; });
    document.querySelectorAll('.organizational-track-map-save-all').forEach(function (btn) { btn.disabled = !admin; });
  }

  // ── Entry point ───────────────────────────────────────────────────────────────
  function render() {
    if (!slug()) return;
    applyBudgetSettingsPermissionGating();
    loadXeroPanel(slug());
    wireProgramsManagementOnce();
    wireRecodeModalOnce();
    loadPrograms(slug());
    wireImportsPanelOnce();
    refreshImportHistory(slug());
  }

  window.OrganizationalBudget.settings = { render };
})();
