/* record-notes.js — "History & Notes" block for an accounting record (bill, invoice, ledger entry).
   OrganizationalRecordNotes.mount(el, { slug, type, id }) draws the notes, an Add note box and a collapsed history list.
   Notes are never edited. Server: routes/recordNotes.js. */
(function () {
  'use strict';
  window.OrganizationalRecordNotes = window.OrganizationalRecordNotes || {};
  const esc = window.escapeHtml;

  function when(v) {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function canWrite() {
    const org = window.OrganizationalAccounting && window.OrganizationalAccounting.getOrg && window.OrganizationalAccounting.getOrg();
    return ['admin', 'finance', 'staff'].includes(String((org && org.role) || '').toLowerCase());
  }

  function historyHtml(h) {
    const who = esc(h.by || 'System');
    const body = h.created ? 'Created' : h.changes.map((c) => esc(c.field) + (c.from != null || c.to != null ? ': ' + esc(c.from == null ? '(none)' : c.from) + ' → ' + esc(c.to == null ? '(none)' : c.to) : '')).join('; ');
    return '<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:0.8125rem;color:var(--text-secondary);">'
      + '<span>' + esc(when(h.at)) + ' · ' + who + '</span><div style="color:var(--text-primary);">' + body + (h.reason ? ' <i>(' + esc(h.reason) + ')</i>' : '') + '</div></div>';
  }
  function noteHtml(n) {
    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">'
      + '<div style="font-size:0.75rem;color:var(--text-secondary);">' + esc(when(n.at)) + ' · ' + esc(n.by || '') + '</div>'
      + '<div style="white-space:pre-wrap;">' + esc(n.body) + '</div></div>';
  }

  async function mount(el, opts) {
    if (!el) return;
    const url = '/api/organizational/orgs/' + encodeURIComponent(opts.slug) + '/record-notes/' + encodeURIComponent(opts.type) + '/' + encodeURIComponent(opts.id);
    const withHistory = opts.historyLink !== false;
    const writeOk = opts.canWrite !== undefined ? !!opts.canWrite : canWrite();
    let showHistory = false, adding = false, err = '';
    let data = { notes: [], history: [] };

    async function load() {
      const out = await window.apiJson(url);
      data = out && out.res.ok ? { notes: out.data.notes || [], history: out.data.history || [] } : { notes: [], history: [] };
      draw();
    }
    function draw() {
      const n = data.history.length;
      el.innerHTML = '<div class="organizational-panel-section-head">' + (withHistory ? 'History &amp; Notes' : 'Notes') + '</div>'
        + (data.notes.length ? data.notes.map(noteHtml).join('') : '')
        + (err ? '<p class="organizational-panel-error">' + esc(err) + '</p>' : '')
        + (adding
          ? '<div style="margin-top:8px;"><textarea id="rn-text" rows="3" class="organizational-input" style="width:100%;" maxlength="4000" aria-label="Note"></textarea>'
            + '<div style="display:flex;gap:8px;margin-top:6px;"><button type="button" id="rn-save" class="organizational-btn organizational-btn-primary" style="height:30px;font-size:0.8125rem;padding:0 12px;">Save note</button>'
            + '<button type="button" id="rn-cancel" class="organizational-btn organizational-btn-outline" style="height:30px;font-size:0.8125rem;padding:0 12px;">Cancel</button></div></div>'
          : '<div style="display:flex;gap:16px;margin-top:8px;font-size:0.8125rem;">'
            + (writeOk ? '<a href="#" id="rn-add">Add note</a>' : '')
            + (n && withHistory ? '<a href="#" id="rn-toggle">' + (showHistory ? 'Hide history' : 'Show history (' + n + (n === 1 ? ' entry' : ' entries') + ')') + '</a>' : '') + '</div>')
        + (showHistory ? '<div style="margin-top:6px;">' + data.history.slice().reverse().map(historyHtml).join('') + '</div>' : '');
      const q = (id) => el.querySelector('#' + id);
      if (q('rn-add')) q('rn-add').addEventListener('click', (e) => { e.preventDefault(); adding = true; err = ''; draw(); q('rn-text').focus(); });
      if (q('rn-toggle')) q('rn-toggle').addEventListener('click', (e) => { e.preventDefault(); showHistory = !showHistory; draw(); });
      if (q('rn-cancel')) q('rn-cancel').addEventListener('click', () => { adding = false; err = ''; draw(); });
      if (q('rn-save')) q('rn-save').addEventListener('click', async () => {
        const text = q('rn-text').value.trim();
        if (!text) { err = 'Write the note first.'; draw(); adding = true; return; }
        const out = await window.apiJson(url, { method: 'POST', body: JSON.stringify({ body: text }) });
        if (out && out.res.ok) { adding = false; err = ''; await load(); }
        else { err = (out && out.data && out.data.error) || 'Could not save the note.'; draw(); }
      });
    }
    await load();
  }
  window.OrganizationalRecordNotes.mount = mount;
})();
