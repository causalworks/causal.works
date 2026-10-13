(function () {
  const errEl = document.getElementById('organizational-org-error');
  const loadingEl = document.getElementById('organizational-org-loading');
  const dashEl = document.getElementById('organizational-org-dashboard');
  const libraryList = document.getElementById('organizational-library-list');
  const submissionsList = document.getElementById('organizational-library-submissions-list');

  const proposeBtn = document.getElementById('organizational-library-propose-btn');
  const proposeModal = document.getElementById('organizational-library-propose-modal');
  const proposeForm = document.getElementById('organizational-library-propose-form');
  const proposeTarget = document.getElementById('organizational-library-propose-target');
  const proposeCategory = document.getElementById('organizational-library-propose-category');
  const proposeTitle = document.getElementById('organizational-library-propose-title');
  const proposeDescription = document.getElementById('organizational-library-propose-description');
  const proposeBody = document.getElementById('organizational-library-propose-body');
  const proposeCancel = document.getElementById('organizational-library-propose-cancel');

  let isCooperativeAdmin = false;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function slugFromPath() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\/library\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
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

  async function loadSubmissions() {
    if (!window.OrganizationalLibrary || !submissionsList) return;
    await window.OrganizationalLibrary.loadPendingSubmissionsInto(submissionsList, isCooperativeAdmin);
  }

  async function populateProposeTargetOptions() {
    if (!proposeTarget) return;
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
      proposeTarget.innerHTML = options.join('');
    } catch (e) {
      console.error('populateProposeTargetOptions:', e);
    }
  }

  function wirePropose() {
    if (proposeBtn && proposeModal) {
      proposeBtn.addEventListener('click', function () {
        populateProposeTargetOptions();
        proposeModal.hidden = false;
      });
    }
    if (proposeCancel && proposeModal && proposeForm) {
      proposeCancel.addEventListener('click', function () {
        proposeModal.hidden = true;
        proposeForm.reset();
      });
    }
    if (proposeForm) {
      proposeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!window.OrganizationalLibrary) return;
        try {
          await window.OrganizationalLibrary.submitLibraryChange({
            target_item_id: proposeTarget && proposeTarget.value ? Number(proposeTarget.value) : null,
            category: proposeCategory ? proposeCategory.value : '',
            title: proposeTitle ? proposeTitle.value : '',
            description: proposeDescription ? proposeDescription.value : '',
            body_markdown: proposeBody ? proposeBody.value : ''
          });
          proposeModal.hidden = true;
          proposeForm.reset();
          await loadSubmissions();
        } catch (err) {
          alert(err.message || 'Could not submit change');
        }
      });
    }
    if (submissionsList) {
      submissionsList.addEventListener('click', async function (e) {
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

  async function init() {
    const slug = slugFromPath();
    if (!slug) {
      showError('Invalid workspace URL.');
      loadingEl.hidden = true;
      return;
    }

    wirePropose();

    await loadOrgInfo(slug);

    loadingEl.hidden = true;
    dashEl.hidden = false;

    if (window.OrganizationalLibrary) {
      await window.OrganizationalLibrary.loadLibraryInto(libraryList);
      isCooperativeAdmin = await window.OrganizationalLibrary.loadIsCooperativeAdmin();
      await loadSubmissions();
    }
  }

  init().catch(function (e) {
    if (loadingEl) loadingEl.hidden = true;
    showError('Could not load library.');
    console.error('Library load error:', e);
  });
})();
