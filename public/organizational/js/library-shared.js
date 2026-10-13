/**
 * Shared org-management + cooperative-work library rendering, plus the
 * Management-tab propose/approve submission flow.
 * Used by both cooperative.html (Cooperative > Library tab) and library.html (top-level Library page).
 */
(function (global) {
  'use strict';

  var escapeHtml = global.escapeHtml || function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  var LIBRARY_CATEGORIES = {
    chart_of_accounts:           'Chart of Accounts',
    templates_financial_reports: 'Financial Report Templates',
    templates_grants:            'Grant Templates',
    templates_board_materials:   'Board Materials',
    policy_examples:             'Policy Examples',
    methods_notes:               'Methods & Notes'
  };

  function renderCategorizedHtml(grouped, categories) {
    return Object.entries(grouped || {}).map(function ([key, items]) {
      if (!Array.isArray(items) || items.length === 0) return '';
      var catLabel = categories[key] || key;
      var itemRows = items.map(function (item) {
        return '<div class="organizational-card" style="padding: 12px; margin-bottom: 8px;">' +
          '<div style="font-weight: 500; margin-bottom: 4px;">' + escapeHtml(item.title || '') + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary);">' + escapeHtml(item.description || '') + '</div>' +
          '</div>';
      }).join('');
      return '<details class="organizational-card" style="margin-bottom: 12px;">' +
        '<summary style="font-size: 1rem; font-weight: 600; cursor: pointer;">' + escapeHtml(catLabel) + '</summary>' +
        '<div style="margin-top: 12px;">' + itemRows + '</div>' +
        '</details>';
    }).filter(Boolean).join('');
  }

  function renderByWorkshopGrouping(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return '';
    return groups.map(function (group) {
      if (!Array.isArray(group.items) || group.items.length === 0) return '';
      var heading = group.workshop_id
        ? '<h3 style="margin-bottom: 8px;"><a href="#" class="organizational-nav-link" data-organizational-workshop-link="' + group.workshop_id + '">' + escapeHtml(group.workshop_name || 'Workshop') + '</a></h3>'
        : '<h3 style="margin-bottom: 8px;">Other cooperative work</h3>';
      var itemRows = group.items.map(function (item) {
        return '<div class="organizational-card" style="padding: 12px; margin-bottom: 8px;">' +
          '<div style="font-weight: 500; margin-bottom: 4px;">' + escapeHtml(item.title || '') + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary);">' + escapeHtml(item.description || '') + '</div>' +
          '</div>';
      }).join('');
      return '<div style="margin-bottom: 20px;">' + heading + itemRows + '</div>';
    }).filter(Boolean).join('');
  }

  async function loadLibraryInto(targetEl) {
    if (!targetEl) return;
    try {
      var res = await fetch('/api/organizational/cooperative/library', { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      if (!res.ok) {
        targetEl.innerHTML = '<p class="organizational-empty">Could not load library.</p>';
        return;
      }
      var html = renderCategorizedHtml(data.library || {}, LIBRARY_CATEGORIES);
      targetEl.innerHTML = html || '<p class="organizational-empty">No library items yet.</p>';
    } catch (e) {
      console.error('loadLibraryInto:', e);
      targetEl.innerHTML = '<p class="organizational-empty">Could not load library.</p>';
    }
  }

  function currentCooperativeOrgSlug() {
    var m = (global.location && global.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/cooperative/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function loadWorkLibraryInto(targetEl) {
    if (!targetEl) return;
    try {
      var res = await fetch('/api/organizational/cooperative/work-library?org=' + encodeURIComponent(currentCooperativeOrgSlug()), { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      if (!res.ok) {
        targetEl.innerHTML = '<p class="organizational-empty">Could not load cooperative work library.</p>';
        return;
      }
      var html = renderByWorkshopGrouping(data.groups || []);
      targetEl.innerHTML = html || '<p class="organizational-empty">No cooperative-work library items yet.</p>';
    } catch (e) {
      console.error('loadWorkLibraryInto:', e);
      targetEl.innerHTML = '<p class="organizational-empty">Could not load cooperative work library.</p>';
    }
  }

  async function loadIsCooperativeAdmin() {
    try {
      var res = await fetch('/api/organizational/cooperative/is-cooperative-admin', { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      return !!data.is_cooperative_admin;
    } catch (e) {
      console.error('loadIsCooperativeAdmin:', e);
      return false;
    }
  }

  async function submitLibraryChange(payload) {
    var res = await fetch('/api/organizational/cooperative/library/submissions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = res.ok ? await res.json() : {};
    if (!res.ok) throw new Error(data.error || 'Could not submit change');
    return data.submission;
  }

  async function decideSubmission(id, decision, decisionNotes) {
    var res = await fetch('/api/organizational/cooperative/library/submissions/' + encodeURIComponent(id), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decision, decision_notes: decisionNotes || undefined })
    });
    var data = res.ok ? await res.json() : {};
    if (!res.ok) throw new Error(data.error || 'Could not decide submission');
    return data.submission;
  }

  function renderSubmissionsList(submissions, isAdmin) {
    if (!Array.isArray(submissions) || submissions.length === 0) {
      return '<p class="organizational-empty">No pending submissions.</p>';
    }
    return submissions.map(function (s) {
      var actions = isAdmin
        ? '<div style="margin-top: 10px; display: flex; gap: 8px;">' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-organizational-submission-decide="' + s.id + '" data-decision="approve">Approve</button>' +
          '<button type="button" class="organizational-btn organizational-btn-outline" data-organizational-submission-decide="' + s.id + '" data-decision="decline">Decline</button>' +
          '</div>'
        : '';
      var kind = s.target_item_id ? 'Edit to existing item' : 'New item';
      return '<div class="organizational-card" style="padding: 12px; margin-bottom: 8px;">' +
        '<div style="font-weight: 500; margin-bottom: 4px;">' + escapeHtml(s.title || '') + '</div>' +
        '<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 4px;">' + escapeHtml(kind) + ' · proposed by ' + escapeHtml(s.proposed_by_email || 'unknown') + (s.source_org_name ? ' (' + escapeHtml(s.source_org_name) + ')' : '') + '</div>' +
        '<div style="font-size: 0.875rem; color: var(--text-secondary);">' + escapeHtml(s.description || '') + '</div>' +
        actions +
        '</div>';
    }).join('');
  }

  async function loadPendingSubmissionsInto(targetEl, isAdmin) {
    if (!targetEl) return;
    try {
      var res = await fetch('/api/organizational/cooperative/library/submissions', { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      if (!res.ok) {
        targetEl.innerHTML = '<p class="organizational-empty">Could not load pending submissions.</p>';
        return;
      }
      targetEl.innerHTML = renderSubmissionsList(data.submissions || [], isAdmin);
    } catch (e) {
      console.error('loadPendingSubmissionsInto:', e);
      targetEl.innerHTML = '<p class="organizational-empty">Could not load pending submissions.</p>';
    }
  }

  global.OrganizationalLibrary = {
    LIBRARY_CATEGORIES: LIBRARY_CATEGORIES,
    renderCategorizedHtml: renderCategorizedHtml,
    renderByWorkshopGrouping: renderByWorkshopGrouping,
    loadLibraryInto: loadLibraryInto,
    loadWorkLibraryInto: loadWorkLibraryInto,
    loadIsCooperativeAdmin: loadIsCooperativeAdmin,
    submitLibraryChange: submitLibraryChange,
    decideSubmission: decideSubmission,
    loadPendingSubmissionsInto: loadPendingSubmissionsInto
  };
})(window);
