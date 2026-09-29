(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const titleEl = document.getElementById('organizational-org-title');
  const workshopProposeBtn = document.getElementById('organizational-workshop-propose-btn');

  const panelMembers = document.getElementById('organizational-organizational-panel-members');
  const panelActivities = document.getElementById('organizational-organizational-panel-activities');
  const panelLibrary = document.getElementById('organizational-organizational-panel-library');
  const panelWorkPool = document.getElementById('organizational-organizational-panel-work-pool');
  const panelWorkshop = document.getElementById('organizational-organizational-panel-workshop');
  const membersList = document.getElementById('organizational-members-list');
  const engagementResources = document.getElementById('organizational-engagement-resources');
  const libraryList = document.getElementById('organizational-library-list');
  const workLibraryList = document.getElementById('organizational-work-library-list');
  const workMineList = document.getElementById('organizational-work-mine-list');
  const workPoolList = document.getElementById('organizational-work-pool-list');

  const workPostBtn = document.getElementById('organizational-work-post-btn');
  const workModal = document.getElementById('organizational-work-modal');
  const workForm = document.getElementById('organizational-work-form');
  const workEditId = document.getElementById('organizational-work-edit-id');
  const workCategory = document.getElementById('organizational-work-category');
  const workTitle = document.getElementById('organizational-work-title');
  const workDescription = document.getElementById('organizational-work-description');
  const workHours = document.getElementById('organizational-work-hours');
  const workNeededBy = document.getElementById('organizational-work-needed-by');
  const workCancel = document.getElementById('organizational-work-cancel');
  const workSave = document.getElementById('organizational-work-save');

  const workshopProjectsList = document.getElementById('organizational-workshop-projects-list');
  const workshopDetailSection = document.getElementById('organizational-workshop-detail-section');
  const workshopProjectsSection = document.getElementById('organizational-workshop-projects-section');
  const workshopDetailTitle = document.getElementById('organizational-workshop-detail-title');
  const workshopDetailDescription = document.getElementById('organizational-workshop-detail-description');
  const workshopRail = document.getElementById('organizational-workshop-rail');
  const workshopRailContent = document.getElementById('organizational-workshop-rail-content');
  const workshopDetailBack = document.getElementById('organizational-workshop-detail-back');
  const workshopSyncPodBtn = document.getElementById('organizational-workshop-sync-pod-btn');
  const workshopSyncPodResult = document.getElementById('organizational-workshop-sync-pod-result');

  const interventionModal = document.getElementById('organizational-intervention-modal');
  const interventionForm = document.getElementById('organizational-intervention-form');
  const interventionTitle = document.getElementById('organizational-intervention-title');
  const interventionDescription = document.getElementById('organizational-intervention-description');
  const interventionLeverage = document.getElementById('organizational-intervention-leverage');
  const interventionTurnaroundsEl = document.getElementById('organizational-intervention-turnarounds');
  const interventionEffect = document.getElementById('organizational-intervention-effect');
  const interventionCancel = document.getElementById('organizational-intervention-cancel');
  const interventionSuggestBtn = document.getElementById('organizational-intervention-suggest-btn');
  const interventionSuggestResult = document.getElementById('organizational-intervention-suggest-result');
  const interventionModalTitleEl = document.getElementById('organizational-intervention-modal-title');
  const interventionSaveBtn = document.getElementById('organizational-intervention-save');

  const workshopProposeModal = document.getElementById('organizational-workshop-propose-modal');
  const workshopProposeForm = document.getElementById('organizational-workshop-propose-form');
  const workshopProposeName = document.getElementById('organizational-workshop-propose-name');
  const workshopProposeDescription = document.getElementById('organizational-workshop-propose-description');
  const workshopProposeTurnaroundsEl = document.getElementById('organizational-workshop-propose-turnarounds');
  const workshopProposeCancel = document.getElementById('organizational-workshop-propose-cancel');

  const librarySubtabCooperative = document.getElementById('organizational-library-subtab-cooperative');
  const librarySubtabManagement = document.getElementById('organizational-library-subtab-management');
  const librarySubpanelCooperative = document.getElementById('organizational-library-subpanel-cooperative');
  const librarySubpanelManagement = document.getElementById('organizational-library-subpanel-management');

  const libraryProposeBtn = document.getElementById('organizational-library-propose-btn');
  const libraryProposeModal = document.getElementById('organizational-library-propose-modal');
  const libraryProposeForm = document.getElementById('organizational-library-propose-form');
  const libraryProposeTarget = document.getElementById('organizational-library-propose-target');
  const libraryProposeCategory = document.getElementById('organizational-library-propose-category');
  const libraryProposeTitle = document.getElementById('organizational-library-propose-title');
  const libraryProposeDescription = document.getElementById('organizational-library-propose-description');
  const libraryProposeBody = document.getElementById('organizational-library-propose-body');
  const libraryProposeCancel = document.getElementById('organizational-library-propose-cancel');
  const librarySubmissionsList = document.getElementById('organizational-library-submissions-list');

  let currentSlug = '';
  let cooperativeAdminChecked = false;
  let isCooperativeAdmin = false;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function parseCooperativePath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/cooperative(?:\/(members|activities|library|work-pool|workshop))?\/?$/);
    if (!m) return { slug: '', tab: 'workshop' };
    const slug = decodeURIComponent(m[1]);
    const validTabs = ['members', 'activities', 'library', 'work-pool', 'workshop'];
    const tab = m[2] && validTabs.includes(m[2]) ? m[2] : 'workshop';
    return { slug, tab };
  }

  const TAB_TITLES = {
    workshop: 'Workshop',
    activities: 'Engagement',
    library: 'Library',
    members: 'Members',
    'work-pool': 'Work pool',
  };

  function applyCooperativeTab(tab) {
    const validTabs = ['members', 'activities', 'library', 'work-pool', 'workshop'];
    const t = validTabs.includes(tab) ? tab : 'workshop';
    if (panelMembers) panelMembers.hidden = t !== 'members';
    if (panelActivities) panelActivities.hidden = t !== 'activities';
    if (panelLibrary) panelLibrary.hidden = t !== 'library';
    if (panelWorkPool) panelWorkPool.hidden = t !== 'work-pool';
    if (panelWorkshop) panelWorkshop.hidden = t !== 'workshop';
    if (titleEl) titleEl.textContent = 'Cooperative | ' + TAB_TITLES[t];
    if (workshopProposeBtn) workshopProposeBtn.hidden = t !== 'workshop';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getSelectedOptionValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions).map(function (o) { return o.value; });
  }

  function setSelectedOptionValues(selectEl, values) {
    if (!selectEl) return;
    const selected = new Set(values || []);
    Array.from(selectEl.options).forEach(function (o) { o.selected = selected.has(o.value); });
  }

  function getCategoryLabel(cat) {
    const labels = {
      bookkeeping: 'Bookkeeping',
      grant_writing: 'Grant writing',
      '990_prep': '990 preparation',
      board_reporting: 'Board reporting',
      financial_analysis: 'Financial analysis',
      other: 'Other'
    };
    return labels[cat] || cat;
  }

  function getStatusLabel(status) {
    const labels = {
      open: 'Open',
      in_progress: 'In progress',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  function getStatusColor(status) {
    const colors = {
      open: '#10b981',
      in_progress: '#f59e0b',
      completed: '#6b7280',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  }

  async function loadMembers() {
    try {
      const res = await fetch('/api/organizational/cooperative/members', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        membersList.innerHTML = '<p class="organizational-empty">Could not load member directory.</p>';
        return;
      }
      const members = Array.isArray(data.members) ? data.members : [];
      if (members.length === 0) {
        membersList.innerHTML = '<p class="organizational-empty">Member directory is being assembled.</p>';
        return;
      }
      const rows = members.map(function (m) {
        const turnaroundPills = (m.cooperative_turnarounds || []).map(function (t) {
          const c = t.color || '#6b7280';
          return '<span class="organizational-badge organizational-badge--tag"><span class="organizational-badge-dot" style="background:' + c + ';"></span>' + escapeHtml(t.label || t.value) + '</span>';
        }).join(' ');
        return '<div class="organizational-card" style="padding: 16px; margin-bottom: 12px;">' +
          '<div style="font-weight: 600; font-size: 1.0625rem; margin-bottom: 4px;">' + escapeHtml(m.display_name) + '</div>' +
          '<div style="font-size: 0.9375rem; margin-bottom: 8px;">' + escapeHtml(m.mission_summary || '') + '</div>' +
          '<div style="margin-bottom: 8px;">' + turnaroundPills + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--text-secondary);">' +
          escapeHtml(m.location_general || '') +
          '</div></div>';
      }).join('');
      membersList.innerHTML = rows;
    } catch (e) {
      console.error('loadMembers:', e);
      membersList.innerHTML = '<p class="organizational-empty">Could not load member directory.</p>';
    }
  }

  function applyLibrarySubtab(subtab) {
    const t = subtab === 'management' ? 'management' : 'cooperative';
    if (librarySubpanelCooperative) librarySubpanelCooperative.hidden = t !== 'cooperative';
    if (librarySubpanelManagement) librarySubpanelManagement.hidden = t !== 'management';
    if (librarySubtabCooperative) librarySubtabCooperative.classList.toggle('organizational-btn-outline', t !== 'cooperative');
    if (librarySubtabManagement) librarySubtabManagement.classList.toggle('organizational-btn-outline', t !== 'management');
  }

  async function loadLibrary() {
    if (!window.OrganizationalLibrary) return;
    await window.OrganizationalLibrary.loadWorkLibraryInto(workLibraryList);
    await window.OrganizationalLibrary.loadLibraryInto(libraryList);
    await refreshCooperativeAdmin();
    await loadSubmissions();
  }

  async function refreshCooperativeAdmin() {
    if (cooperativeAdminChecked || !window.OrganizationalLibrary) return;
    isCooperativeAdmin = await window.OrganizationalLibrary.loadIsCooperativeAdmin();
    cooperativeAdminChecked = true;
  }

  async function loadSubmissions() {
    if (!window.OrganizationalLibrary || !librarySubmissionsList) return;
    await window.OrganizationalLibrary.loadPendingSubmissionsInto(librarySubmissionsList, isCooperativeAdmin);
  }

  async function loadWorkshopProjects() {
    if (!workshopProjectsList) return;
    try {
      const res = await fetch('/api/organizational/cooperative/workshops?org=' + encodeURIComponent(currentSlug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        workshopProjectsList.innerHTML = '<p class="organizational-empty">Could not load workshop projects.</p>';
        return;
      }
      const workshops = Array.isArray(data.workshops) ? data.workshops : [];
      if (workshops.length === 0) {
        workshopProjectsList.innerHTML = '<p class="organizational-empty">No workshop projects yet.</p>';
        return;
      }
      workshopProjectsList.innerHTML = workshops.map(function (w) {
        const turnarounds = (w.e4a_turnarounds || []).map(function (t) {
          return '<span class="organizational-badge">' + escapeHtml(t) + '</span>';
        }).join(' ');
        return '<div class="organizational-card" style="padding: 16px; cursor: pointer;" data-organizational-workshop-open="' + w.id + '">' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 8px;">' +
          '<div style="font-weight: 600;">' + escapeHtml(w.name) + '</div>' +
          '<span class="organizational-badge">' + escapeHtml(w.phase) + '</span>' +
          '</div>' +
          '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary); margin-bottom: 8px;">' + escapeHtml(w.description || '') + '</div>' +
          '<div style="margin-bottom: 4px;">' + turnarounds + '</div>' +
          '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary);">' + (w.workspace_count || 0) + ' workspace' + (w.workspace_count === 1 ? '' : 's') + '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      console.error('loadWorkshopProjects:', e);
      workshopProjectsList.innerHTML = '<p class="organizational-empty">Could not load workshop projects.</p>';
    }
  }

  let currentWorkshopData = null;
  let currentWorkshopSection = 'overview';
  let currentWorkshopId = null;
  let currentWorkshopInterventions = null;
  let editingInterventionId = null;

  async function openWorkshopDetail(id) {
    if (!workshopRailContent) return;
    workshopRailContent.innerHTML = '<p class="organizational-empty">Loading…</p>';
    if (workshopProjectsSection) workshopProjectsSection.hidden = true;
    if (workshopDetailSection) workshopDetailSection.hidden = false;
    try {
      const res = await fetch('/api/organizational/cooperative/workshops/' + encodeURIComponent(id) + '?org=' + encodeURIComponent(currentSlug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok || !data.workshop) {
        workshopRailContent.innerHTML = '<p class="organizational-empty">Could not load workshop.</p>';
        return;
      }
      currentWorkshopData = data;
      currentWorkshopId = id;
      currentWorkshopInterventions = null;
      if (workshopDetailTitle) workshopDetailTitle.textContent = data.workshop.name || '';
      if (workshopDetailDescription) workshopDetailDescription.textContent = data.workshop.description || '';
      applyWorkshopRailSection('overview');
    } catch (e) {
      console.error('openWorkshopDetail:', e);
      workshopRailContent.innerHTML = '<p class="organizational-empty">Could not load workshop.</p>';
    }
  }

  function closeWorkshopDetail() {
    if (workshopDetailSection) workshopDetailSection.hidden = true;
    if (workshopProjectsSection) workshopProjectsSection.hidden = false;
    currentWorkshopData = null;
    currentWorkshopId = null;
    currentWorkshopInterventions = null;
  }

  // Manual-trigger sync of this workshop's Interventions + Systems Map content
  // into the owning org's Solid pod. Scope is deliberately narrow (see
  // workshopPodSync.js on the server) - no proposals/decisions/notes yet.
  async function syncWorkshopToPod() {
    if (!currentWorkshopId || !workshopSyncPodBtn) return;
    workshopSyncPodBtn.disabled = true;
    workshopSyncPodBtn.textContent = 'Syncing…';
    if (workshopSyncPodResult) workshopSyncPodResult.hidden = true;
    try {
      const res = await fetch('/api/organizational/cooperative/workshops/' + encodeURIComponent(currentWorkshopId) + '/sync-to-pod', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      if (workshopSyncPodResult) {
        workshopSyncPodResult.hidden = false;
        workshopSyncPodResult.textContent = 'Synced ' + data.synced + '/' + data.total + ' items to the pod.' +
          (data.failed && data.failed.length ? ' ' + data.failed.length + ' failed.' : '');
      }
    } catch (e) {
      console.error('syncWorkshopToPod:', e);
      if (workshopSyncPodResult) {
        workshopSyncPodResult.hidden = false;
        workshopSyncPodResult.textContent = 'Sync failed: ' + (e.message || 'unknown error');
      }
    } finally {
      workshopSyncPodBtn.disabled = false;
      workshopSyncPodBtn.textContent = 'Sync to pod';
    }
  }

  function allWorkshopDocuments(data) {
    return (data.workspaces || []).reduce(function (acc, ws) {
      return acc.concat(ws.documents || []);
    }, []);
  }

  // Minimal, safe markdown for workshop documents and proposals: text is HTML-escaped first, then
  // **bold**, *italic*, http(s) links, "- " bullets, and "#" headings are converted. Anything else
  // stays plain text. Without this the raw ** and - markers showed on screen.
  function renderMarkdownLite(text) {
    const inline = function (line) {
      return escapeHtml(line)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
    };
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    let list = null;
    let para = [];
    const flushPara = function () {
      if (para.length) { out.push('<p style="margin: 0 0 6px;">' + para.join('<br>') + '</p>'); para = []; }
    };
    const flushList = function () {
      if (list) { out.push('<ul style="margin: 0 0 6px; padding-left: 18px;">' + list.join('') + '</ul>'); list = null; }
    };
    lines.forEach(function (raw) {
      const line = raw.trimEnd();
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      const heading = line.match(/^#{1,3}\s+(.*)$/);
      if (!line.trim()) { flushPara(); flushList(); return; }
      if (bullet) { flushPara(); (list = list || []).push('<li>' + inline(bullet[1]) + '</li>'); return; }
      flushList();
      if (heading) { flushPara(); out.push('<div style="font-weight: 600; margin: 4px 0;">' + inline(heading[1]) + '</div>'); return; }
      para.push(inline(line));
    });
    flushPara();
    flushList();
    return out.join('');
  }

  function renderWorkshopOverview(data) {
    const workspaces = data.workspaces || [];
    return workspaces.map(function (ws) {
      const docsHtml = (ws.documents || []).filter(function (d) { return d.doc_type === 'note'; }).map(function (doc) {
        return '<div style="padding: 12px; border: 1px solid var(--organizational-border-subtle); border-radius: 8px; margin-bottom: 8px;">' +
          '<div style="font-weight: 600; margin-bottom: 6px;">' + escapeHtml(doc.title) + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary);">' + renderMarkdownLite(doc.content) + '</div>' +
          '</div>';
      }).join('') || '<p class="organizational-empty">No documents yet.</p>';
      return '<div style="margin-bottom: 20px;">' +
        '<h4 style="margin-bottom: 4px;">' + escapeHtml(ws.name) + '</h4>' +
        '<p class="organizational-hint" style="margin: 0 0 12px;">' + escapeHtml(ws.description || '') + '</p>' +
        docsHtml +
        '</div>';
    }).join('');
  }

  function renderWorkshopSystemsMap(data) {
    const docs = allWorkshopDocuments(data).filter(function (d) {
      return d.doc_type === 'systems_map_loop' || d.doc_type === 'systems_map_cascade';
    });
    if (docs.length === 0) {
      return '<p class="organizational-empty">This workshop doesn\'t use systems mapping — see a coalition-style workshop for an example of loop and cascade analysis.</p>';
    }
    return docs.map(function (doc) {
      if (doc.doc_type === 'systems_map_loop') {
        return '<div class="organizational-workshop-loop-box">' +
          '<div style="font-weight: 600; margin-bottom: 8px;">' + escapeHtml(doc.title) + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary);">' + renderMarkdownLite(doc.content) + '</div>' +
          '</div>';
      }
      const sections = String(doc.content || '').split(/^### /m).filter(function (s) { return s.trim(); });
      const turnarounds = doc.e4a_turnarounds || [];
      const itemsHtml = sections.map(function (section) {
        const lines = section.split('\n');
        const heading = (lines.shift() || '').trim();
        const body = lines.join('\n').trim();
        const matchedTurnaround = turnarounds.find(function (t) {
          return (t.label || '').toLowerCase() === heading.toLowerCase();
        });
        const style = matchedTurnaround ? ' style="border-left-color:' + matchedTurnaround.color + ';"' : '';
        return '<div class="organizational-workshop-cascade-item"' + style + '>' +
          '<div style="font-weight: 600; margin-bottom: 4px;">' + escapeHtml(heading) + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary);">' + renderMarkdownLite(body) + '</div>' +
          '</div>';
      }).join('');
      return '<div style="margin-bottom: 16px;">' +
        '<div style="font-weight: 600; margin-bottom: 8px;">' + escapeHtml(doc.title) + '</div>' +
        itemsHtml +
        '</div>';
    }).join('');
  }

  function renderWorkshopActions(data) {
    const proposals = (data.workspaces || []).reduce(function (acc, ws) { return acc.concat(ws.proposals || []); }, []);
    if (proposals.length === 0) return '<p class="organizational-empty">No proposals yet.</p>';
    return proposals.map(function (p) {
      const decisionHtml = p.decision_notes_markdown
        ? '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary); margin-top: 8px;">' + renderMarkdownLite(p.decision_notes_markdown) + '</div>'
        : '';
      return '<div style="padding: 12px; border: 1px solid var(--organizational-border-subtle); border-radius: 8px; margin-bottom: 8px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 6px;">' +
        '<div style="font-weight: 600;">' + escapeHtml(p.title) + '</div>' +
        '<span class="organizational-badge">' + escapeHtml(p.status) + '</span>' +
        '</div>' +
        '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary);">' + renderMarkdownLite(p.body_markdown) + '</div>' +
        decisionHtml +
        '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary); margin-top: 8px;">Proposed by ' + escapeHtml(p.proposed_by_email || 'unknown') + ' · ' + formatDate(p.created_at) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderWorkshopParticipants(data) {
    const members = (data.workspaces || []).reduce(function (acc, ws) { return acc.concat(ws.members || []); }, []);
    if (members.length === 0) return '<p class="organizational-empty">No participants listed yet.</p>';
    return members.map(function (m) {
      const subline = [m.org_display_name, m.display_email].filter(Boolean).join(' · ');
      return '<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 10px 4px; border-bottom: 1px solid var(--organizational-border-subtle);">' +
        '<div>' +
        '<div style="font-weight: 600;">' + escapeHtml(m.user_email || 'Unknown') + '</div>' +
        '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary);">' + escapeHtml(subline) + '</div>' +
        '</div>' +
        '<span class="organizational-badge">' + escapeHtml(m.role) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderWorkshopDiscussion(data) {
    const threads = (data.workspaces || []).reduce(function (acc, ws) { return acc.concat(ws.threads || []); }, []);
    if (threads.length === 0) return '<p class="organizational-empty">No discussion yet.</p>';
    return threads.map(function (t) {
      const messagesHtml = (t.messages || []).map(function (m) {
        const author = m.display_email ? m.author_email + ' (' + m.display_email + ')' : (m.author_email || 'Unknown');
        return '<div style="padding: 8px 0; border-top: 1px solid var(--organizational-border-subtle);">' +
          '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary); margin-bottom: 2px;">' + escapeHtml(author) + ' · ' + formatDate(m.created_at) + '</div>' +
          '<div style="font-size: 0.875rem; white-space: pre-wrap;">' + escapeHtml(m.content) + '</div>' +
          '</div>';
      }).join('');
      return '<div style="padding: 12px; border: 1px solid var(--organizational-border-subtle); border-radius: 8px; margin-bottom: 12px;">' +
        '<div style="font-weight: 600; margin-bottom: 4px;">' + escapeHtml(t.title) + '</div>' +
        '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary); margin-bottom: 4px;">' + (t.reply_count || 0) + ' repl' + (t.reply_count === 1 ? 'y' : 'ies') + '</div>' +
        messagesHtml +
        '</div>';
    }).join('');
  }

  function renderInterventionCards(interventions) {
    if (!interventions || interventions.length === 0) {
      return '<p class="organizational-empty">No interventions proposed yet.</p>';
    }
    return interventions.map(function (iv) {
      const turnaroundPills = (iv.turnaround_ids || []).map(function (t) {
        const c = t.color || '#6b7280';
        return '<span class="organizational-badge organizational-badge--tag"><span class="organizational-badge-dot" style="background:' + c + ';"></span>' + escapeHtml(t.label || t.value) + '</span>';
      }).join(' ');
      const descriptionHtml = iv.description
        ? '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary); white-space: pre-wrap; margin-bottom: 8px;">' + escapeHtml(iv.description) + '</div>'
        : '';
      const effectHtml = iv.effect_estimate
        ? '<div style="font-size: 0.8125rem; white-space: pre-wrap; margin-top: 8px; padding: 8px 10px; background: var(--organizational-surface-page); border-radius: 6px;"><strong>Effect estimate:</strong> ' + escapeHtml(iv.effect_estimate) + '</div>'
        : '';
      const editBtnHtml = iv.can_edit
        ? '<button type="button" class="organizational-btn organizational-btn-outline" data-organizational-intervention-edit="' + iv.id + '" style="padding: 4px 10px; font-size: 0.75rem; flex-shrink:0;">Edit</button>'
        : '';
      return '<div class="organizational-card" style="padding: 12px; margin-bottom: 12px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 6px;">' +
        '<div style="font-weight: 600;">' + escapeHtml(iv.title) + '</div>' +
        '<div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">' +
        '<span class="organizational-badge">Leverage ' + iv.leverage_level + (iv.leverage_label ? ' — ' + escapeHtml(iv.leverage_label) : '') + '</span>' +
        editBtnHtml +
        '</div>' +
        '</div>' +
        descriptionHtml +
        '<div style="margin-bottom: 4px;">' + turnaroundPills + '</div>' +
        effectHtml +
        '<div style="font-size: 0.8125rem; color: var(--organizational-text-secondary); margin-top: 8px;">Proposed by ' + escapeHtml(iv.proposed_by_name || 'Unknown') + ' · ' + formatDate(iv.created_at) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderWorkshopInterventionsShell() {
    return '<div style="display:flex; justify-content:flex-end; margin-bottom: 12px;">' +
      '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-intervention-add-btn">+ Add intervention</button>' +
      '</div>' +
      '<div id="organizational-intervention-list">' + '<p class="organizational-empty">Loading interventions…</p>' + '</div>';
  }

  function openInterventionModalForAdd() {
    editingInterventionId = null;
    if (interventionForm) interventionForm.reset();
    if (interventionModalTitleEl) interventionModalTitleEl.textContent = 'Propose an intervention';
    if (interventionSaveBtn) interventionSaveBtn.textContent = 'Propose intervention';
    if (interventionSuggestResult) interventionSuggestResult.style.display = 'none';
    if (interventionModal) interventionModal.classList.add('organizational-modal-open');
  }

  function openInterventionModalForEdit(iv) {
    editingInterventionId = iv.id;
    if (interventionTitle) interventionTitle.value = iv.title || '';
    if (interventionDescription) interventionDescription.value = iv.description || '';
    if (interventionLeverage) interventionLeverage.value = String(iv.leverage_level || '');
    if (interventionEffect) interventionEffect.value = iv.effect_estimate || '';
    setSelectedOptionValues(interventionTurnaroundsEl, (iv.turnaround_ids || []).map(function (t) { return t.value || t; }));
    if (interventionModalTitleEl) interventionModalTitleEl.textContent = 'Edit intervention';
    if (interventionSaveBtn) interventionSaveBtn.textContent = 'Save changes';
    if (interventionSuggestResult) interventionSuggestResult.style.display = 'none';
    if (interventionModal) interventionModal.classList.add('organizational-modal-open');
  }

  function wireInterventionAddButton() {
    const btn = document.getElementById('organizational-intervention-add-btn');
    if (btn) {
      btn.addEventListener('click', openInterventionModalForAdd);
    }
    const listEl = document.getElementById('organizational-intervention-list');
    if (listEl) {
      listEl.addEventListener('click', function (e) {
        const editBtn = e.target.closest('[data-organizational-intervention-edit]');
        if (!editBtn || !currentWorkshopInterventions) return;
        const ivId = Number(editBtn.getAttribute('data-organizational-intervention-edit'));
        const iv = currentWorkshopInterventions.find(function (x) { return x.id === ivId; });
        if (iv) openInterventionModalForEdit(iv);
      });
    }
  }

  async function loadWorkshopInterventions() {
    if (!workshopRailContent || !currentWorkshopId) return;
    workshopRailContent.innerHTML = renderWorkshopInterventionsShell();
    wireInterventionAddButton();
    const listEl = document.getElementById('organizational-intervention-list');
    try {
      const res = await fetch('/api/organizational/cooperative/workshops/' + encodeURIComponent(currentWorkshopId) + '/interventions?org=' + encodeURIComponent(currentSlug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        if (listEl) listEl.innerHTML = '<p class="organizational-empty">Could not load interventions.</p>';
        return;
      }
      currentWorkshopInterventions = Array.isArray(data.interventions) ? data.interventions : [];
      if (listEl) listEl.innerHTML = renderInterventionCards(currentWorkshopInterventions);
    } catch (e) {
      console.error('loadWorkshopInterventions:', e);
      if (listEl) listEl.innerHTML = '<p class="organizational-empty">Could not load interventions.</p>';
    }
  }

  const WORKSHOP_RAIL_RENDERERS = {
    overview: renderWorkshopOverview,
    'systems-map': renderWorkshopSystemsMap,
    actions: renderWorkshopActions,
    participants: renderWorkshopParticipants,
    discussion: renderWorkshopDiscussion
  };

  function applyWorkshopRailSection(section) {
    const validSections = section === 'interventions' ? true : !!WORKSHOP_RAIL_RENDERERS[section];
    currentWorkshopSection = validSections ? section : 'overview';
    if (workshopRail) {
      workshopRail.querySelectorAll('[data-organizational-workshop-section]').forEach(function (btn) {
        btn.classList.toggle('organizational-workshop-rail__link--active', btn.getAttribute('data-organizational-workshop-section') === currentWorkshopSection);
      });
    }
    if (!workshopRailContent || !currentWorkshopData) return;
    if (currentWorkshopSection === 'interventions') {
      if (currentWorkshopInterventions) {
        workshopRailContent.innerHTML = renderWorkshopInterventionsShell();
        wireInterventionAddButton();
        const listEl = document.getElementById('organizational-intervention-list');
        if (listEl) listEl.innerHTML = renderInterventionCards(currentWorkshopInterventions);
      } else {
        loadWorkshopInterventions();
      }
      return;
    }
    const renderer = WORKSHOP_RAIL_RENDERERS[currentWorkshopSection] || renderWorkshopOverview;
    workshopRailContent.innerHTML = renderer(currentWorkshopData);
  }

  function openWorkshopTabAndDetail(id) {
    applyCooperativeTab('workshop');
    loadWorkshopProjects().then(function () {
      openWorkshopDetail(id);
    });
  }

  function wireWorkshopInteractions() {
    if (workshopProjectsList) {
      workshopProjectsList.addEventListener('click', function (e) {
        const card = e.target.closest('[data-organizational-workshop-open]');
        if (!card) return;
        openWorkshopDetail(card.getAttribute('data-organizational-workshop-open'));
      });
    }
    if (workshopDetailBack) {
      workshopDetailBack.addEventListener('click', closeWorkshopDetail);
    }
    if (workshopSyncPodBtn) {
      workshopSyncPodBtn.addEventListener('click', syncWorkshopToPod);
    }
    if (workshopRail) {
      workshopRail.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-organizational-workshop-section]');
        if (!btn) return;
        applyWorkshopRailSection(btn.getAttribute('data-organizational-workshop-section'));
      });
    }
    // Delegated: "via [workshop]" links rendered inside the Cooperative library sub-tab
    document.addEventListener('click', function (e) {
      const link = e.target.closest('[data-organizational-workshop-link]');
      if (!link) return;
      e.preventDefault();
      openWorkshopTabAndDetail(link.getAttribute('data-organizational-workshop-link'));
    });
    if (interventionCancel && interventionModal && interventionForm) {
      interventionCancel.addEventListener('click', function () {
        interventionModal.classList.remove('organizational-modal-open');
        interventionForm.reset();
        editingInterventionId = null;
        if (interventionSuggestResult) interventionSuggestResult.style.display = 'none';
      });
    }
    if (interventionSuggestBtn && interventionSuggestResult) {
      interventionSuggestBtn.addEventListener('click', async function () {
        if (!currentWorkshopId) return;
        const title = interventionTitle.value.trim();
        if (!title) {
          alert('Enter a title first so there\'s something to suggest from.');
          return;
        }
        const originalText = interventionSuggestBtn.textContent;
        interventionSuggestBtn.disabled = true;
        interventionSuggestBtn.textContent = 'Thinking…';
        interventionSuggestResult.style.display = 'none';
        try {
          const res = await fetch('/api/organizational/cooperative/workshops/' + encodeURIComponent(currentWorkshopId) + '/interventions/suggest?org=' + encodeURIComponent(currentSlug), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, description: interventionDescription.value.trim() })
          });
          const data = res.ok ? await res.json() : await res.json().catch(function () { return {}; });
          if (!res.ok) {
            interventionSuggestResult.innerHTML = '<span style="color: var(--organizational-error, #ef4444);">' + escapeHtml(data.error || 'Could not generate suggestions') + '</span>';
            interventionSuggestResult.style.display = 'block';
            return;
          }

          const turnaroundPillsHtml = (data.suggested_turnaround_ids || []).map(function (t) {
            const c = t.color || '#6b7280';
            return '<span class="organizational-badge organizational-badge--tag"><span class="organizational-badge-dot" style="background:' + c + ';"></span>' + escapeHtml(t.label || t.value) + '</span>';
          }).join(' ') || '<span style="color: var(--organizational-text-secondary);">(none)</span>';

          interventionSuggestResult.innerHTML =
            '<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--organizational-border-subtle);">' +
            '<div><strong>Suggested level: ' + data.suggested_level + (data.suggested_label ? ' — ' + escapeHtml(data.suggested_label) : '') + '</strong></div>' +
            '<div style="margin-top:4px; color: var(--organizational-text-secondary);">' + escapeHtml(data.rationale || '') + '</div>' +
            '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-intervention-suggest-apply-level" style="margin-top:8px; padding: 5px 10px; font-size: 0.75rem;">Use this level</button>' +
            '</div>' +
            '<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--organizational-border-subtle);">' +
            '<div><strong>Suggested turnarounds:</strong></div>' +
            '<div style="margin-top:4px;">' + turnaroundPillsHtml + '</div>' +
            '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-intervention-suggest-apply-turnarounds" style="margin-top:8px; padding: 5px 10px; font-size: 0.75rem;">Use these turnarounds</button>' +
            '</div>' +
            '<div>' +
            '<div><strong>Draft effect estimate:</strong></div>' +
            '<div style="margin-top:4px; color: var(--organizational-text-secondary);">' + escapeHtml(data.effect_estimate || '') + '</div>' +
            '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-intervention-suggest-apply-effect" style="margin-top:8px; padding: 5px 10px; font-size: 0.75rem;">Use this draft</button>' +
            '</div>';
          interventionSuggestResult.style.display = 'block';

          const applyLevelBtn = document.getElementById('organizational-intervention-suggest-apply-level');
          if (applyLevelBtn) {
            applyLevelBtn.addEventListener('click', function () {
              interventionLeverage.value = String(data.suggested_level);
            });
          }
          const applyTurnaroundsBtn = document.getElementById('organizational-intervention-suggest-apply-turnarounds');
          if (applyTurnaroundsBtn) {
            applyTurnaroundsBtn.addEventListener('click', function () {
              setSelectedOptionValues(interventionTurnaroundsEl, (data.suggested_turnaround_ids || []).map(function (t) { return t.value; }));
            });
          }
          const applyEffectBtn = document.getElementById('organizational-intervention-suggest-apply-effect');
          if (applyEffectBtn) {
            applyEffectBtn.addEventListener('click', function () {
              interventionEffect.value = data.effect_estimate || '';
            });
          }
        } catch (err) {
          console.error('suggest:', err);
          interventionSuggestResult.innerHTML = '<span style="color: var(--organizational-error, #ef4444);">Could not generate suggestions.</span>';
          interventionSuggestResult.style.display = 'block';
        } finally {
          interventionSuggestBtn.disabled = false;
          interventionSuggestBtn.textContent = originalText;
        }
      });
    }
    if (workshopProposeBtn && workshopProposeModal) {
      workshopProposeBtn.addEventListener('click', function () {
        workshopProposeModal.classList.add('organizational-modal-open');
      });
    }
    if (workshopProposeCancel && workshopProposeModal && workshopProposeForm) {
      workshopProposeCancel.addEventListener('click', function () {
        workshopProposeModal.classList.remove('organizational-modal-open');
        workshopProposeForm.reset();
      });
    }
    if (workshopProposeForm) {
      workshopProposeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const turnaroundIds = getSelectedOptionValues(workshopProposeTurnaroundsEl);
        try {
          const res = await fetch('/api/organizational/cooperative/workshops?org=' + encodeURIComponent(currentSlug), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: workshopProposeName.value,
              description: workshopProposeDescription.value,
              e4a_turnarounds: turnaroundIds
            })
          });
          const data = res.ok ? await res.json() : await res.json().catch(function () { return {}; });
          if (!res.ok) {
            alert(data.error || 'Could not create workshop');
            return;
          }
          workshopProposeModal.classList.remove('organizational-modal-open');
          workshopProposeForm.reset();
          await loadWorkshopProjects();
          if (data.workshop && data.workshop.id) openWorkshopDetail(data.workshop.id);
        } catch (err) {
          console.error('submit workshop propose:', err);
          alert('Could not create workshop');
        }
      });
    }
    if (interventionForm) {
      interventionForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!currentWorkshopId) return;
        const turnaroundIds = getSelectedOptionValues(interventionTurnaroundsEl);
        const isEdit = editingInterventionId != null;
        const url = '/api/organizational/cooperative/workshops/' + encodeURIComponent(currentWorkshopId) + '/interventions' +
          (isEdit ? '/' + encodeURIComponent(editingInterventionId) : '') +
          '?org=' + encodeURIComponent(currentSlug);
        try {
          const res = await fetch(url, {
            method: isEdit ? 'PATCH' : 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: interventionTitle.value,
              description: interventionDescription.value,
              leverage_level: interventionLeverage.value ? Number(interventionLeverage.value) : null,
              turnaround_ids: turnaroundIds,
              effect_estimate: interventionEffect.value
            })
          });
          const data = res.ok ? await res.json() : await res.json().catch(function () { return {}; });
          if (!res.ok) {
            alert(data.error || (isEdit ? 'Could not save changes' : 'Could not create intervention'));
            return;
          }
          interventionModal.classList.remove('organizational-modal-open');
          interventionForm.reset();
          editingInterventionId = null;
          if (interventionSuggestResult) interventionSuggestResult.style.display = 'none';
          currentWorkshopInterventions = null;
          if (currentWorkshopSection === 'interventions') loadWorkshopInterventions();
        } catch (err) {
          console.error('submit intervention:', err);
          alert(isEdit ? 'Could not save changes' : 'Could not create intervention');
        }
      });
    }
  }

  async function populateProposeTargetOptions() {
    if (!libraryProposeTarget) return;
    try {
      const res = await fetch('/api/organizational/cooperative/library', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      const library = data.library || {};
      const options = ['<option value="">— Propose a new item —</option>'];
      Object.values(library).forEach(function (items) {
        (items || []).forEach(function (item) {
          options.push('<option value="' + item.id + '">' + escapeHtml(item.title) + '</option>');
        });
      });
      libraryProposeTarget.innerHTML = options.join('');
    } catch (e) {
      console.error('populateProposeTargetOptions:', e);
    }
  }

  function wireLibraryPropose() {
    if (librarySubtabCooperative) {
      librarySubtabCooperative.addEventListener('click', function () { applyLibrarySubtab('cooperative'); });
    }
    if (librarySubtabManagement) {
      librarySubtabManagement.addEventListener('click', function () { applyLibrarySubtab('management'); });
    }
    if (libraryProposeBtn && libraryProposeModal) {
      libraryProposeBtn.addEventListener('click', function () {
        populateProposeTargetOptions();
        libraryProposeModal.classList.add('organizational-modal-open');
      });
    }
    if (libraryProposeCancel && libraryProposeModal && libraryProposeForm) {
      libraryProposeCancel.addEventListener('click', function () {
        libraryProposeModal.classList.remove('organizational-modal-open');
        libraryProposeForm.reset();
      });
    }
    if (libraryProposeForm) {
      libraryProposeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!window.OrganizationalLibrary) return;
        try {
          await window.OrganizationalLibrary.submitLibraryChange({
            target_item_id: libraryProposeTarget && libraryProposeTarget.value ? Number(libraryProposeTarget.value) : null,
            category: libraryProposeCategory ? libraryProposeCategory.value : '',
            title: libraryProposeTitle ? libraryProposeTitle.value : '',
            description: libraryProposeDescription ? libraryProposeDescription.value : '',
            body_markdown: libraryProposeBody ? libraryProposeBody.value : ''
          });
          libraryProposeModal.classList.remove('organizational-modal-open');
          libraryProposeForm.reset();
          await loadSubmissions();
        } catch (err) {
          alert(err.message || 'Could not submit change');
        }
      });
    }
    if (librarySubmissionsList) {
      librarySubmissionsList.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-organizational-submission-decide]');
        if (!btn || !window.OrganizationalLibrary) return;
        const id = btn.getAttribute('data-organizational-submission-decide');
        const decision = btn.getAttribute('data-decision');
        try {
          await window.OrganizationalLibrary.decideSubmission(id, decision);
          await loadSubmissions();
          await window.OrganizationalLibrary.loadLibraryInto(libraryList);
        } catch (err) {
          alert(err.message || 'Could not decide submission');
        }
      });
    }
  }

  async function loadEngagementResources() {
    if (!engagementResources) return;
    try {
      const res = await fetch('/api/organizational/cooperative/work-library?org=' + encodeURIComponent(currentSlug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        engagementResources.innerHTML = '<p class="organizational-empty">Could not load resources.</p>';
        return;
      }
      const groups = Array.isArray(data.groups) ? data.groups : [];
      const items = [];
      groups.forEach(function (g) {
        (g.items || []).forEach(function (item) {
          if (item.category === 'engagement_artifact') items.push(item);
        });
      });
      if (items.length === 0) {
        engagementResources.innerHTML = '<p class="organizational-empty">No engagement resources yet.</p>';
        return;
      }
      engagementResources.innerHTML = items.map(function (item) {
        return '<div style="padding: 12px; background: var(--organizational-surface-page); border-radius: 8px;">' +
          '<div style="font-weight: 600; margin-bottom: 4px;">' + escapeHtml(item.title) + '</div>' +
          '<div style="font-size: 0.875rem; color: var(--organizational-text-secondary);">' + escapeHtml(item.description || '') + '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      console.error('loadEngagementResources:', e);
      engagementResources.innerHTML = '<p class="organizational-empty">Could not load resources.</p>';
    }
  }

  function workRequestCardHtml(w, showOrg) {
    const meta = [getCategoryLabel(w.category), getStatusLabel(w.status)];
    if (w.hours_estimate != null) meta.push(Number(w.hours_estimate) + ' hrs');
    if (w.needed_by) meta.push('Needed by ' + String(w.needed_by).slice(0, 10));
    return '<div class="organizational-card" style="padding: 12px; margin-bottom: 8px;">' +
      '<div style="font-weight: 500; margin-bottom: 4px;">' + escapeHtml(w.title) + '</div>' +
      (showOrg && w.org_name ? '<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 4px;">' + escapeHtml(w.org_name) + '</div>' : '') +
      '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 4px;">' + escapeHtml(w.description || '') + '</div>' +
      '<div style="font-size: 0.8125rem; color: var(--text-secondary);">' + escapeHtml(meta.join(' • ')) + '</div>' +
      '</div>';
  }

  async function loadWorkPool() {
    // Section A: this org's own posted needs (/mine); Section B: open needs from other orgs.
    if (workMineList) {
      try {
        const res = await fetch('/api/organizational/cooperative/work-pool/mine', { credentials: 'include' });
        const data = res.ok ? await res.json() : {};
        const mine = Array.isArray(data.work_requests) ? data.work_requests : [];
        workMineList.innerHTML = !res.ok
          ? '<p class="organizational-empty">Could not load your posted needs.</p>'
          : mine.length === 0
            ? '<p class="organizational-empty">Your organization hasn\'t posted any work needs yet.</p>'
            : mine.map(function (w) { return workRequestCardHtml(w, false); }).join('');
      } catch (e) {
        console.error('loadWorkPool (mine):', e);
        workMineList.innerHTML = '<p class="organizational-empty">Could not load your posted needs.</p>';
      }
    }
    try {
      const res = await fetch('/api/organizational/cooperative/work-pool', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        workPoolList.innerHTML = '<p class="organizational-empty">Could not load work pool.</p>';
        return;
      }
      const workItems = Array.isArray(data.work_requests) ? data.work_requests : [];
      if (workItems.length === 0) {
        workPoolList.innerHTML = '<p class="organizational-empty">No work posted yet.</p>';
        return;
      }
      workPoolList.innerHTML = workItems.map(function (w) { return workRequestCardHtml(w, true); }).join('');
    } catch (e) {
      console.error('loadWorkPool:', e);
      workPoolList.innerHTML = '<p class="organizational-empty">Could not load work pool.</p>';
    }
  }

  async function loadOrgInfo(slug) {
    try {
      const res = await fetch('/api/organizational/orgs/' + encodeURIComponent(slug), { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        showError('Could not load organization.');
        return;
      }
      const org = data.org;
      if (org && window.OrganizationalSidebar && typeof window.OrganizationalSidebar.setWorkspaceName === 'function') {
        window.OrganizationalSidebar.setWorkspaceName(org.display_name || '—');
      }
      if (org && window.OrganizationalHeader && typeof window.OrganizationalHeader.setOrg === 'function') {
        window.OrganizationalHeader.setOrg(org.display_name || '—');
      }
    } catch (e) {
      console.error('loadOrgInfo:', e);
      showError('Could not load organization.');
    }
  }

  async function init() {
    const { slug, tab } = parseCooperativePath();
    currentSlug = slug;
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }

    applyCooperativeTab(tab);
    // Engagement "Get involved" cards link to the other Cooperative tabs (each tab is its own URL).
    document.querySelectorAll('[data-organizational-engagement-tab]').forEach(function (a) {
      a.href = '/organizational/o/' + encodeURIComponent(slug) + '/cooperative/' + a.getAttribute('data-organizational-engagement-tab');
    });
    applyLibrarySubtab('cooperative');
    wireWorkModal();
    wireWorkshopInteractions();
    wireLibraryPropose();

    await loadOrgInfo(slug);

    loadingEl.hidden = true;
    dashEl.hidden = false;

    if (tab === 'members') {
      await loadMembers();
    } else if (tab === 'library') {
      await loadLibrary();
    } else if (tab === 'work-pool') {
      await loadWorkPool();
    } else if (tab === 'workshop') {
      await loadWorkshopProjects();
      // Dashboard links here as /cooperative/workshop?open=<id> to land on one project.
      const openId = new URLSearchParams(window.location.search).get('open');
      if (openId) await openWorkshopDetail(openId);
    } else if (tab === 'activities') {
      await loadEngagementResources();
    }

    initHeader();
  }

  async function initHeader() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const me = await res.json();
        const userType = me.user_type || 'individual_basic';
        const isWorker = userType === 'independent_worker' || userType === 'org_worker';
        const coopIcon = document.getElementById('organizational-icon');
        if (coopIcon) coopIcon.style.display = isWorker ? 'flex' : 'none';
      }
    } catch (_) {}
  }

  function wireWorkModal() {
    if (!workPostBtn || !workModal || !workForm) return;
    workPostBtn.addEventListener('click', function () {
      workModal.classList.add('organizational-modal-open');
      if (workTitle) workTitle.focus();
    });
    if (workCancel) {
      workCancel.addEventListener('click', function () {
        workModal.classList.remove('organizational-modal-open');
        workForm.reset();
      });
    }
    if (workSave) {
      workSave.addEventListener('click', async function () {
        const title = workTitle ? workTitle.value : '';
        const desc = workDescription ? workDescription.value : '';
        const category = workCategory ? workCategory.value : 'other';
        const hours = workHours ? parseFloat(workHours.value) : 0;
        const neededBy = workNeededBy ? workNeededBy.value : null;
        if (!title) {
          alert('Title is required');
          return;
        }
        try {
          const res = await fetch('/api/organizational/cooperative/work-pool', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description: desc, category, hours_estimate: hours, needed_by: neededBy })
          });
          if (res.ok) {
            workModal.classList.remove('organizational-modal-open');
            workForm.reset();
            await loadWorkPool();
          } else {
            alert('Failed to post work');
          }
        } catch (e) {
          console.error('Error posting work:', e);
          alert('Error posting work');
        }
      });
    }
  }

  // ── Escape closes whichever cooperative modal is currently open. Reuses each modal's own
  // Cancel button (via .click()) rather than duplicating its close logic, since each button's
  // handler also resets its form / clears related state (e.g. editingInterventionId). ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (workModal && workModal.classList.contains('organizational-modal-open') && workCancel) { workCancel.click(); return; }
    if (interventionModal && interventionModal.classList.contains('organizational-modal-open') && interventionCancel) { interventionCancel.click(); return; }
    if (workshopProposeModal && workshopProposeModal.classList.contains('organizational-modal-open') && workshopProposeCancel) { workshopProposeCancel.click(); return; }
    if (libraryProposeModal && libraryProposeModal.classList.contains('organizational-modal-open') && libraryProposeCancel) { libraryProposeCancel.click(); return; }
  });

  init().catch(function(e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load cooperative.');
    console.error('Cooperative load error:', e);
  });
})();
