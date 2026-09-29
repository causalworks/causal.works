(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function usdFromCents(cents) {
    const n = Number(cents) || 0;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100);
  }

  function toDollarsText(cents) {
    const n = Number(cents) || 0;
    return (n / 100).toFixed(2);
  }

  function toCentsFromDollarsText(v) {
    const n = Number(String(v || '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
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
    return { res, data };
  }

  function buildMonthNames() {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }

  async function openProjectionEditor(opts) {
    if (window.OrganizationalProjectionEditor && typeof window.OrganizationalProjectionEditor.closeActive === 'function') {
      window.OrganizationalProjectionEditor.closeActive();
    }
    const slug = String(opts.slug || '');
    const fiscalYear = Number(opts.fiscalYear);
    let accountId = opts.accountId != null ? Number(opts.accountId) : null;
    let programId = opts.programId != null ? Number(opts.programId) : null;
    const anchorEl = opts.anchorEl || null;
    const onSaved = typeof opts.onSaved === 'function' ? opts.onSaved : function () {};
    const onError = typeof opts.onError === 'function' ? opts.onError : function () {};
    const showContextPickers = !!opts.showContextPickers;

    const overlay = document.createElement('div');
    overlay.className = 'organizational-proj-editor-overlay';
    const panel = document.createElement('div');
    panel.className = 'organizational-proj-editor-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Projection editor');
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    if (anchorEl && !showContextPickers) {
      const r = anchorEl.getBoundingClientRect();
      panel.style.position = 'absolute';
      panel.style.left = Math.max(8, Math.min(window.innerWidth - 420, r.left + window.scrollX)) + 'px';
      panel.style.top = Math.max(8, r.bottom + window.scrollY + 6) + 'px';
      overlay.style.background = 'transparent';
      overlay.style.pointerEvents = 'none';
      panel.style.pointerEvents = 'auto';
    }

    let dirty = false;
    let activeTab = 'annual';
    let existingAnnual = null;
    let existingMonthly = {};
    let accounts = [];
    let programs = [];

    async function loadExisting() {
      const out = await apiJson(
        '/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections?fiscal_year=' + encodeURIComponent(String(fiscalYear)),
        { method: 'GET' }
      );
      if (!out || !out.res.ok) throw new Error((out && out.data && out.data.error) || 'Could not load projections');
      const all = Array.isArray(out.data.projections) ? out.data.projections : [];
      const filtered = all.filter(function (r) {
        return Number(r.coop_account_id) === Number(accountId) && Number(r.coop_program_id) === Number(programId);
      });
      existingAnnual = filtered.find(function (r) {
        return r.period_month == null;
      }) || null;
      existingMonthly = {};
      filtered
        .filter(function (r) {
          return r.period_month != null;
        })
        .forEach(function (r) {
          existingMonthly[String(Number(r.period_month))] = r;
        });
    }

    async function ensureContextLists() {
      if (!showContextPickers) return;
      const [accOut, progOut] = await Promise.all([
        apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/accounts?budget_scope=true', { method: 'GET' }),
        apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/programs?dimension=program', { method: 'GET' }),
      ]);
      accounts = accOut && accOut.res && accOut.res.ok && Array.isArray(accOut.data.accounts) ? accOut.data.accounts : [];
      programs = progOut && progOut.res && progOut.res.ok && Array.isArray(progOut.data.programs) ? progOut.data.programs : [];
    }

    function focusFirstInput() {
      const first = panel.querySelector('input,select,textarea,button');
      if (first) first.focus();
    }

    function close() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onDocMouseDown, true);
      if (window.OrganizationalProjectionEditor && window.OrganizationalProjectionEditor._activeCloser === close) {
        window.OrganizationalProjectionEditor._activeCloser = null;
      }
      overlay.remove();
    }

    function maybeClose() {
      if (!dirty) return close();
      if (window.confirm('Discard unsaved projection changes?')) close();
    }

    function tabBtn(tab, label) {
      return (
        '<button type="button" class="organizational-btn organizational-btn-outline organizational-proj-tab-btn" data-tab="' +
        tab +
        '">' +
        escapeHtml(label) +
        '</button>'
      );
    }

    function render() {
      const annualVal = existingAnnual ? toDollarsText(existingAnnual.amount_cents) : '';
      const formulaVal = existingAnnual && existingAnnual.formula ? String(existingAnnual.formula) : '';
      const months = buildMonthNames();
      const monthInputs = months
        .map(function (name, i) {
          const m = i + 1;
          const row = existingMonthly[String(m)];
          const val = row ? toDollarsText(row.amount_cents) : '';
          const inherited =
            !row && existingAnnual ? '<div class="organizational-hint">Annual: ' + escapeHtml(toDollarsText(existingAnnual.amount_cents / 12)) + '</div>' : '';
          return (
            '<label class="organizational-proj-month-cell">' +
            '<span class="organizational-hint">' +
            name +
            '</span>' +
            '<input type="text" data-month="' +
            m +
            '" value="' +
            escapeHtml(val) +
            '">' +
            inherited +
            '</label>'
          );
        })
        .join('');

      const context = showContextPickers
        ? '<div class="organizational-proj-context-row">' +
          '<label class="organizational-budget-field"><span class="organizational-hint">Account</span><select id="organizational-proj-editor-account">' +
          accounts
            .map(function (a) {
              const sel = Number(a.id) === Number(accountId) ? ' selected' : '';
              return (
                '<option value="' +
                escapeHtml(String(a.id)) +
                '"' +
                sel +
                '>' +
                escapeHtml((a.code || '') + ' — ' + (a.name || '')) +
                '</option>'
              );
            })
            .join('') +
          '</select></label>' +
          '<label class="organizational-budget-field"><span class="organizational-hint">Program</span><select id="organizational-proj-editor-program">' +
          programs
            .map(function (p) {
              const sel = Number(p.id) === Number(programId) ? ' selected' : '';
              return '<option value="' + escapeHtml(String(p.id)) + '"' + sel + '>' + escapeHtml(p.name || '') + '</option>';
            })
            .join('') +
          '</select></label>' +
          '</div>'
        : '';

      panel.innerHTML =
        '<div class="organizational-proj-editor-head">' +
        '<strong>Projected amount editor</strong>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-proj-editor-close">Close</button>' +
        '</div>' +
        context +
        '<div class="organizational-proj-tabs">' +
        tabBtn('annual', 'Annual') +
        tabBtn('monthly', 'Monthly') +
        tabBtn('formula', 'Formula') +
        '</div>' +
        '<div class="organizational-proj-tab-body" data-body="annual" ' +
        (activeTab === 'annual' ? '' : 'hidden') +
        '>' +
        '<label class="organizational-budget-field"><span class="organizational-hint">Annual amount (USD)</span><input id="organizational-proj-editor-annual" type="text" value="' +
        escapeHtml(annualVal) +
        '"></label>' +
        '<p class="organizational-hint">Applies to all 12 months unless monthly overrides exist.</p>' +
        '<button type="button" class="organizational-btn app-btn-secondary" id="organizational-proj-save-annual">Save annual</button>' +
        '</div>' +
        '<div class="organizational-proj-tab-body" data-body="monthly" ' +
        (activeTab === 'monthly' ? '' : 'hidden') +
        '>' +
        '<div class="organizational-proj-month-grid">' +
        monthInputs +
        '</div>' +
        '<button type="button" class="organizational-btn app-btn-secondary" id="organizational-proj-save-monthly">Save monthly</button>' +
        '</div>' +
        '<div class="organizational-proj-tab-body" data-body="formula" ' +
        (activeTab === 'formula' ? '' : 'hidden') +
        '>' +
        '<label class="organizational-budget-field"><span class="organizational-hint">Formula</span><input id="organizational-proj-editor-formula" type="text" value="' +
        escapeHtml(formulaVal) +
        '"></label>' +
        '<p class="organizational-hint"><code>actual_ytd(code)</code> · <code>budget(code)</code> · <code>prior_year_actual(code)</code></p>' +
        '<p class="organizational-hint" id="organizational-proj-validate-msg"></p>' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-proj-validate-formula">Validate</button> ' +
        '<button type="button" class="organizational-btn app-btn-secondary" id="organizational-proj-save-formula">Save formula</button>' +
        '</div>' +
        '<div class="organizational-proj-editor-foot">' +
        '<button type="button" class="organizational-btn organizational-btn-outline" id="organizational-proj-clear">Clear override</button>' +
        '</div>';

      panel.querySelectorAll('.organizational-proj-tab-btn').forEach(function (b) {
        b.classList.toggle('organizational-budget-view-btn-active', b.getAttribute('data-tab') === activeTab);
        b.addEventListener('click', function () {
          activeTab = b.getAttribute('data-tab') || 'annual';
          render();
        });
      });

      panel.querySelector('.organizational-proj-editor-close').addEventListener('click', maybeClose);
      if (showContextPickers) {
        panel.querySelector('.organizational-proj-editor-account').addEventListener('change', async function (ev) {
          accountId = Number(ev.target.value);
          await loadExisting();
          render();
        });
        panel.querySelector('.organizational-proj-editor-program').addEventListener('change', async function (ev) {
          programId = Number(ev.target.value);
          await loadExisting();
          render();
        });
      }

      panel.querySelector('.organizational-proj-save-annual').addEventListener('click', async function () {
        try {
          const cents = toCentsFromDollarsText(panel.querySelector('.organizational-proj-editor-annual').value);
          const body = {
            account_id: Number(accountId),
            program_id: Number(programId),
            fiscal_year: Number(fiscalYear),
            period_month: null,
            amount: cents / 100,
          };
          if (existingAnnual) {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(existingAnnual.id)), {
              method: 'PATCH',
              body: JSON.stringify(body),
            });
          } else {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections', {
              method: 'POST',
              body: JSON.stringify(body),
            });
          }
          dirty = false;
          await onSaved();
          close();
        } catch (e) {
          onError(e);
        }
      });

      panel.querySelector('.organizational-proj-save-monthly').addEventListener('click', async function () {
        try {
          const vals = {};
          panel.querySelectorAll('[data-month]').forEach(function (inp) {
            const m = Number(inp.getAttribute('data-month'));
            const t = String(inp.value || '').trim();
            if (!t) return;
            vals[m] = toCentsFromDollarsText(t);
          });
          const deletes = Object.keys(existingMonthly).filter(function (k) {
            return !Object.prototype.hasOwnProperty.call(vals, k);
          });
          for (const k of deletes) {
            const row = existingMonthly[k];
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(row.id)), {
              method: 'DELETE',
            });
          }
          for (const mStr of Object.keys(vals)) {
            const m = Number(mStr);
            const row = existingMonthly[mStr];
            const body = {
              account_id: Number(accountId),
              program_id: Number(programId),
              fiscal_year: Number(fiscalYear),
              period_month: m,
              amount: vals[m] / 100,
            };
            if (row) {
              await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(row.id)), {
                method: 'PATCH',
                body: JSON.stringify(body),
              });
            } else {
              await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections', {
                method: 'POST',
                body: JSON.stringify(body),
              });
            }
          }
          dirty = false;
          await onSaved();
          close();
        } catch (e) {
          onError(e);
        }
      });

      panel.querySelector('.organizational-proj-validate-formula').addEventListener('click', async function () {
        const msg = panel.querySelector('.organizational-proj-validate-msg');
        msg.textContent = '';
        const formula = String(panel.querySelector('.organizational-proj-editor-formula').value || '').trim();
        const out = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/validate-formula', {
          method: 'POST',
          body: JSON.stringify({
            fiscal_year: Number(fiscalYear),
            program_id: Number(programId),
            formula: formula,
          }),
        });
        if (!out || !out.res || !out.res.ok || out.data.valid === false) {
          msg.textContent = (out && out.data && out.data.error) || 'Formula invalid.';
          msg.classList.add('organizational-bva-var-warn');
          return;
        }
        msg.textContent = 'Valid. Preview: ' + usdFromCents(out.data.preview_cents || 0);
        msg.classList.remove('organizational-bva-var-warn');
      });

      panel.querySelector('.organizational-proj-save-formula').addEventListener('click', async function () {
        try {
          const formula = String(panel.querySelector('.organizational-proj-editor-formula').value || '').trim();
          const vOut = await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/validate-formula', {
            method: 'POST',
            body: JSON.stringify({
              fiscal_year: Number(fiscalYear),
              program_id: Number(programId),
              formula: formula,
            }),
          });
          if (!vOut || !vOut.res || !vOut.res.ok || vOut.data.valid === false) {
            throw new Error((vOut && vOut.data && vOut.data.error) || 'Formula invalid');
          }
          const body = {
            account_id: Number(accountId),
            program_id: Number(programId),
            fiscal_year: Number(fiscalYear),
            period_month: null,
            formula: formula,
          };
          if (existingAnnual) {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(existingAnnual.id)), {
              method: 'PATCH',
              body: JSON.stringify(body),
            });
          } else {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections', {
              method: 'POST',
              body: JSON.stringify(body),
            });
          }
          dirty = false;
          await onSaved();
          close();
        } catch (e) {
          onError(e);
        }
      });

      panel.querySelector('.organizational-proj-clear').addEventListener('click', async function () {
        if (!window.confirm('Remove projection override for this account/program?')) return;
        try {
          await loadExisting();
          if (existingAnnual) {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(existingAnnual.id)), {
              method: 'DELETE',
            });
          }
          for (const m of Object.keys(existingMonthly)) {
            await apiJson('/api/organizational/orgs/' + encodeURIComponent(slug) + '/projections/' + encodeURIComponent(String(existingMonthly[m].id)), {
              method: 'DELETE',
            });
          }
          dirty = false;
          await onSaved();
          close();
        } catch (e) {
          onError(e);
        }
      });

      panel.querySelectorAll('input,select,textarea').forEach(function (el) {
        el.addEventListener('input', function () {
          dirty = true;
        });
      });

      focusFirstInput();
    }

    function onKeyDown(ev) {
      if (ev.key === 'Escape') maybeClose();
    }

    function onDocMouseDown(ev) {
      if (!panel.contains(ev.target)) {
        maybeClose();
      }
    }

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay && showContextPickers) maybeClose();
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onDocMouseDown, true);
    if (window.OrganizationalProjectionEditor) window.OrganizationalProjectionEditor._activeCloser = close;
    try {
      await ensureContextLists();
      if (showContextPickers) {
        if (accountId == null && accounts[0]) accountId = Number(accounts[0].id);
        if (programId == null && programs[0]) programId = Number(programs[0].id);
      }
      if (accountId != null && programId != null) await loadExisting();
      render();
    } catch (e) {
      onError(e);
      close();
    }
  }

  window.OrganizationalProjectionEditor = {
    open: openProjectionEditor,
    closeActive: function () {
      if (window.OrganizationalProjectionEditor && typeof window.OrganizationalProjectionEditor._activeCloser === 'function') {
        window.OrganizationalProjectionEditor._activeCloser();
      }
    },
    _activeCloser: null,
  };
})();
