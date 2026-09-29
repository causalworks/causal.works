(function () {
  'use strict';

  // ── Constituent CSV import (auto-mapper) ──────────────────────────────────
  // Mirrors the grants.js import pattern: OUR_FIELDS + regex auto-detection,
  // shared #organizational-automap-backdrop modal, JSON-mapped import route.

  const OUR_FIELDS = [
    { key: 'display_name', label: 'Name / Org name', required: true,
      patterns: [/^name$/i, /display.?name/i, /org.?name/i, /organization/i, /funder.?name/i] },
    { key: 'type', label: 'Type',
      patterns: [/^type$/i, /constituent.?type/i, /funder.?type/i, /org.?type/i] },
    { key: 'email', label: 'Email',
      patterns: [/email/i] },
    { key: 'phone', label: 'Phone',
      patterns: [/phone/i, /tel(ephone)?/i] },
    { key: 'mailing_address', label: 'Mailing address',
      patterns: [/mailing.?address/i, /address/i] },
    { key: 'website', label: 'Website',
      patterns: [/website/i, /url/i, /web/i] },
    { key: 'notes', label: 'Notes',
      patterns: [/notes?/i, /comment/i, /description/i] },
    { key: 'tags', label: 'Tags',
      patterns: [/tags?/i, /category|categories/i, /label/i] },
  ];

  function parseCSVText(text) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    let headers = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cells = splitCsvLine(trimmed);
      if (!headers) { headers = cells; continue; }
      if (cells.length === 0) continue;
      const rec = {};
      headers.forEach((h, i) => { rec[h] = (cells[i] || '').trim(); });
      rows.push(rec);
    }
    return { headers: headers || [], rows };
  }

  function splitCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  function suggestField(header) {
    const h = String(header || '').trim();
    for (const f of OUR_FIELDS) {
      if (f.patterns.some(p => p.test(h))) return f.key;
    }
    return null;
  }

  function currentSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)\//);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // ── File input listener ───────────────────────────────────────────────────
  const fileInput = document.getElementById('organizational-constituents-import-file');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const text = e.target.result;
        const { headers, rows } = parseCSVText(text);
        if (!rows.length) { alert('No data rows found in the file.'); return; }
        const mappings = {};
        headers.forEach(h => { mappings[h] = suggestField(h); });
        showMappingModal(headers, mappings, rows);
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  const importBtn = document.getElementById('organizational-constituents-import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', function () {
      if (fileInput) fileInput.click();
    });
  }

  // ── Auto-map modal ────────────────────────────────────────────────────────
  function showMappingModal(csvHeaders, mappings, rawRows) {
    const backdrop = document.getElementById('organizational-automap-backdrop');
    const tableWrap = document.getElementById('organizational-automap-table-wrap');
    const statusEl  = document.getElementById('organizational-automap-status');
    const confirmBtn= document.getElementById('organizational-automap-confirm');
    const cancelBtn = document.getElementById('organizational-automap-cancel');
    const closeBtn  = document.getElementById('organizational-automap-close');
    if (!backdrop) return;

    // Build mapping table
    const fieldOptions = [
      '<option value="">Skip</option>',
      ...OUR_FIELDS.map(f => `<option value="${f.key}">${f.label}${f.required ? ' *' : ''}</option>`),
      '<option value="__extra__">Keep as custom field</option>',
    ].join('');

    tableWrap.innerHTML = `<table class="organizational-table" style="width:100%;">
      <thead><tr><th>Your column</th><th>Maps to</th><th>Sample</th></tr></thead>
      <tbody>${csvHeaders.map(h => {
        const sample = rawRows.slice(0, 3).map(r => (r[h] || '')).filter(Boolean).join(', ');
        const suggested = mappings[h] || '';
        return `<tr>
          <td style="font-size:0.85rem;">${window.escapeHtml ? window.escapeHtml(h) : h}</td>
          <td><select class="organizational-select organizational-map-select" data-csv-header="${window.escapeHtml ? window.escapeHtml(h) : h}" style="font-size:0.85rem;">
            ${fieldOptions}
          </select></td>
          <td style="font-size:0.8rem;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.escapeHtml ? window.escapeHtml(sample) : sample}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

    // Pre-select suggested mappings
    tableWrap.querySelectorAll('.organizational-map-select').forEach(sel => {
      const h = sel.dataset.csvHeader;
      const suggested = mappings[h] || '';
      if (suggested) sel.value = suggested;
    });

    const unmappedCount = csvHeaders.filter(h => !mappings[h]).length;
    if (statusEl) statusEl.textContent = unmappedCount > 0 ? `${unmappedCount} column(s) could not be auto-matched — please map them manually or skip.` : 'All columns matched. Review and confirm.';

    backdrop.style.display = 'block';

    function closeModal() { backdrop.style.display = 'none'; }
    if (closeBtn) { closeBtn.onclick = closeModal; }
    if (cancelBtn) { cancelBtn.onclick = closeModal; }

    if (confirmBtn) {
      confirmBtn.onclick = async function () {
        const finalMappings = {};
        tableWrap.querySelectorAll('.organizational-map-select').forEach(sel => {
          if (sel.value) finalMappings[sel.dataset.csvHeader] = sel.value;
        });

        // Validate required fields are mapped
        const mappedFields = new Set(Object.values(finalMappings).filter(v => v && v !== '__extra__'));
        if (!mappedFields.has('display_name')) {
          if (statusEl) statusEl.textContent = 'Error: display_name (Name) is required — please map it.';
          return;
        }

        // Build normalized rows
        const jsonRows = rawRows.map(raw => {
          const rec = {};
          for (const [csvH, ourKey] of Object.entries(finalMappings)) {
            const val = (raw[csvH] || '').trim();
            if (!val) continue;
            if (ourKey === '__extra__') continue; // drop unmapped extras for constituents
            rec[ourKey] = val;
          }
          return rec;
        }).filter(r => r.display_name);

        if (!jsonRows.length) {
          if (statusEl) statusEl.textContent = 'No valid rows after mapping.';
          return;
        }

        confirmBtn.disabled = true;
        if (statusEl) statusEl.textContent = `Importing ${jsonRows.length} row(s)…`;

        try {
          const slug = currentSlug();
          const res = await fetch(`/api/organizational/orgs/${encodeURIComponent(slug)}/import/constituents/json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: jsonRows }),
          });
          const data = await res.json();
          if (!res.ok) {
            const msg = (data.errors && data.errors.length) ? data.errors.map(e => `Row ${e.row}: ${e.error}`).join('; ') : (data.error || 'Import failed');
            if (statusEl) statusEl.textContent = 'Error: ' + msg;
            confirmBtn.disabled = false;
            return;
          }
          closeModal();
          // Reload the donors tab by triggering re-init
          if (window.OrganizationalFunders && window.OrganizationalFunders.donors) {
            window.OrganizationalFunders.donors.init(slug);
          }
          alert(`Import complete: ${data.inserted} added, ${data.updated} updated.`);
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Error: ' + err.message;
        } finally {
          confirmBtn.disabled = false;
        }
      };
    }
  }

})();
