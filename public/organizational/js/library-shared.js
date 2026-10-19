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

  var LINK = 'color:var(--organizational-accent);text-decoration:underline;';

  function itemTable(items, apiBase) {
    return '<section class="organizational-card organizational-card-flush"><table class="organizational-table" style="margin:0;"><tbody>' +
      items.map(function (item) {
        var title = item.id && apiBase
          ? '<a href="#" data-library-item="' + apiBase + '/' + item.id + '" style="' + LINK + '">' + escapeHtml(item.title || '') + '</a>'
          : escapeHtml(item.title || '');
        return '<tr><td style="width:34%;font-weight:500;">' + title + '</td>' +
          '<td style="color:var(--text-secondary);">' + escapeHtml(item.description || '') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function renderCategorizedHtml(grouped, categories) {
    return Object.entries(grouped || {}).map(function ([key, items]) {
      if (!Array.isArray(items) || items.length === 0) return '';
      return '<h2 class="organizational-subheading">' + escapeHtml(categories[key] || key) + '</h2>' +
        itemTable(items, '/api/organizational/cooperative/library');
    }).filter(Boolean).join('');
  }

  function renderByWorkshopGrouping(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return '';
    return groups.map(function (group) {
      if (!Array.isArray(group.items) || group.items.length === 0) return '';
      var heading = group.workshop_id
        ? '<h2 class="organizational-subheading"><a href="#" data-organizational-workshop-link="' + group.workshop_id + '" style="' + LINK + '">' + escapeHtml(group.workshop_name || 'Workshop') + '</a></h2>'
        : '<h2 class="organizational-subheading">Other cooperative work</h2>';
      return heading + itemTable(group.items, '/api/organizational/cooperative/work-library');
    }).filter(Boolean).join('');
  }

  document.addEventListener('click', async function (e) {
    var a = e.target.closest && e.target.closest('[data-library-item]');
    if (!a) return;
    e.preventDefault();
    var row = a.closest('tr');
    var open = row.nextElementSibling;
    if (open && open.hasAttribute('data-library-body')) { open.remove(); return; }
    var tr = document.createElement('tr');
    tr.setAttribute('data-library-body', '');
    tr.innerHTML = '<td colspan="2" style="color:var(--text-secondary);">Loading…</td>';
    row.parentNode.insertBefore(tr, row.nextSibling);
    try {
      var res = await fetch(a.getAttribute('data-library-item'), { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      var body = data.item && (data.item.body_markdown || data.item.body || data.item.description);
      tr.firstChild.innerHTML = '<div style="white-space:pre-wrap;">' + escapeHtml(body || 'No content.') + '</div>';
    } catch (err) {
      tr.firstChild.textContent = 'Could not load this item.';
    }
  });

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
    return '<section class="organizational-card organizational-card-flush"><table class="organizational-table" style="margin:0;"><tbody>' +
      submissions.map(function (s) {
        var kind = s.target_item_id ? 'Edit to existing item' : 'New item';
        var actions = isAdmin
          ? '<a href="#" data-organizational-submission-decide="' + s.id + '" data-decision="approve" style="' + LINK + '">Approve</a> · ' +
            '<a href="#" data-organizational-submission-decide="' + s.id + '" data-decision="decline" style="' + LINK + '">Decline</a>'
          : '';
        return '<tr><td style="width:34%;font-weight:500;">' + escapeHtml(s.title || '') + '</td>' +
          '<td style="color:var(--text-secondary);">' + escapeHtml(s.description || '') + '<div style="font-size:0.8125rem;color:var(--text-muted);">' +
          escapeHtml(kind) + ' · proposed by ' + escapeHtml(s.proposed_by_email || 'unknown') + (s.source_org_name ? ' (' + escapeHtml(s.source_org_name) + ')' : '') + '</div></td>' +
          '<td style="width:150px;text-align:right;white-space:nowrap;font-size:0.8125rem;">' + actions + '</td></tr>';
      }).join('') + '</tbody></table></section>';
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
