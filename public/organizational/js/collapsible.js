(function () {
  function pageKey() {
    var path = String(window.location.pathname || '/');
    var clean = path.replace(/\/+$/, '');
    var bits = clean.split('/').filter(Boolean);
    if (!bits.length) return 'root';
    return bits[bits.length - 1].toLowerCase();
  }

  function storageKey(page, id) {
    return 'organizational-collapsed:' + page + ':' + id;
  }

  function applySavedState(detailsEl, page) {
    var id = detailsEl.id;
    if (!id) return;
    var saved = null;
    try {
      saved = window.localStorage.getItem(storageKey(page, id));
    } catch (_) {
      saved = null;
    }
    if (saved === 'closed') {
      detailsEl.open = false;
    } else if (saved === 'open') {
      detailsEl.open = true;
    }
  }

  function bindPersistence(detailsEl, page) {
    var id = detailsEl.id;
    if (!id) return;
    detailsEl.addEventListener('toggle', function () {
      try {
        window.localStorage.setItem(storageKey(page, id), detailsEl.open ? 'open' : 'closed');
      } catch (_) {}
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = pageKey();
    document.querySelectorAll('details.organizational-collapsible[id]').forEach(function (detailsEl) {
      applySavedState(detailsEl, page);
      bindPersistence(detailsEl, page);
    });
  });
})();
