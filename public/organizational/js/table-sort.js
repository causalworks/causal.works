// Click-to-sort for column headers. The page keeps its own data array and calls
// sorter.sortRows(rows) inside its render function. Click cycles: ascending,
// descending, then back to the page's own order.
//
//   const sorter = OrganizationalTableSort.attach(tableEl, {
//     columns: [ { key: 'vendor', type: 'text', get: (r) => r.vendor_name }, null, ... ],  // one entry per <th>
//     onChange: () => renderRows(cache),
//   });
//
// Grouped reports: call sorter.sortRows(groupRows) once per group or section and render group headers,
// subtotals and totals yourself, outside the sorted rows. When each group has its own table, pass the same
// { state } object ({ index: -1, dir: null }) to every attach() so all of them share one sort.
//
// Server mode ({ server: true }): the helper only tracks header state and calls
// onChange({ sort, dir }). The page passes those to its fetch. sort is null when
// the page default applies. Use { enabled: false } until the endpoint accepts sort/dir;
// then no header is made sortable.
(function () {
  'use strict';

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'number') return Number.isNaN(v);
    const s = String(v).trim();
    return s === '' || s === '—' || s === '-';
  }

  function parseNumber(v) {
    if (isEmpty(v)) return null;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[$,\s]/g, '');
    if (s.charAt(0) === '-') { neg = !neg; s = s.slice(1); }
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
    const n = parseFloat(s);
    return neg ? -n : n;
  }

  function parseDate(v) {
    if (isEmpty(v)) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }

  function normalize(v, type) {
    if (type === 'number' || type === 'currency') return parseNumber(v);
    if (type === 'date') return parseDate(v);
    return isEmpty(v) ? null : String(v);
  }

  function compareValues(a, b, type) {
    if (type === 'text' || !type) return collator.compare(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function sortArray(rows, col, dir) {
    const type = col.type || 'text';
    const get = col.get || ((r) => r[col.key]);
    const factor = dir === 'desc' ? -1 : 1;
    const items = rows.map((row, i) => ({ row, i, v: normalize(get(row), type) }));
    items.sort((x, y) => {
      if (x.v === null && y.v === null) return x.i - y.i;
      if (x.v === null) return 1;
      if (y.v === null) return -1;
      const c = compareValues(x.v, y.v, type) * factor;
      return c !== 0 ? c : x.i - y.i;
    });
    return items.map((it) => it.row);
  }

  function attach(table, opts) {
    opts = opts || {};
    if (!table || opts.enabled === false) return null;
    const headRow = table.tHead && table.tHead.rows[0];
    if (!headRow) return null;
    const columns = opts.columns || [];
    const server = !!opts.server;
    const state = opts.state || { index: -1, dir: null };

    function render() {
      for (let i = 0; i < columns.length; i++) {
        const th = headRow.cells[i];
        if (!th || !columns[i]) continue;
        const active = state.index === i && state.dir;
        th.setAttribute('aria-sort', active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      }
    }

    function notify() {
      if (typeof opts.onChange !== 'function') return;
      if (server) {
        const col = state.index >= 0 ? columns[state.index] : null;
        opts.onChange({ sort: col && state.dir ? col.key : null, dir: col && state.dir ? state.dir : null });
      } else {
        opts.onChange();
      }
    }

    function activate(i) {
      if (state.index !== i) { state.index = i; state.dir = 'asc'; }
      else if (state.dir === 'asc') state.dir = 'desc';
      else { state.index = -1; state.dir = null; }
      render();
      notify();
    }

    columns.forEach((col, i) => {
      const th = headRow.cells[i];
      if (!col || !th) return;
      th.classList.add('organizational-th-sortable');
      th.tabIndex = 0;
      th.addEventListener('click', () => activate(i));
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(i); }
      });
    });
    render();

    return {
      sortRows(rows) {
        if (server || state.index < 0 || !state.dir || !columns[state.index]) return rows;
        return sortArray(rows, columns[state.index], state.dir);
      },
      params() {
        const col = state.index >= 0 ? columns[state.index] : null;
        return col && state.dir ? { sort: col.key, dir: state.dir } : {};
      },
      getState() { return { index: state.index, dir: state.dir }; },
      render,
      reset() { state.index = -1; state.dir = null; render(); },
      activate,
    };
  }

  window.OrganizationalTableSort = { attach, sortArray, parseNumber, parseDate };
})();
