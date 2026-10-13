/* module-quicklinks.js -- quicklinks between Budget, Accounting and Funding, at the right of each page title,
   so the left sidebar can stay closed while working. Shows the other two modules. */
(function () {
  'use strict';
  var m = /^\/organizational\/o\/([^/]+)\//.exec(window.location.pathname || '');
  if (!m) return;
  var base = '/organizational/o/' + m[1];
  var active = document.body.getAttribute('data-organizational-active');
  var MODULES = [['budget', 'Budget', '/budget'], ['accounting', 'Accounting', '/accounting'], ['grants', 'Funding', '/grants']];
  if (!MODULES.some(function (x) { return x[0] === active; })) return;
  var title = document.getElementById('organizational-org-title');
  if (!title || document.getElementById('organizational-module-quicklinks')) return;
  var nav = document.createElement('nav');
  nav.id = 'organizational-module-quicklinks';
  nav.setAttribute('aria-label', 'Quicklinks to other modules');
  nav.style.cssText = 'float:right;order:2;margin-left:auto;display:flex;gap:14px;align-items:center;font-size:0.8125rem;padding-top:8px;';
  nav.innerHTML = MODULES.filter(function (x) { return x[0] !== active; }).map(function (x) {
    return '<a class="organizational-nav-link" style="color:var(--text-secondary);" href="' + base + x[2] + '">' + x[1] + ' →</a>';
  }).join('');
  title.parentNode.insertBefore(nav, title);
})();
