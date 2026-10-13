/* embed-height.js -- when a report page is shown inside a module (?embed=1), tell the module page how tall it is so the frame
   can grow to fit and the page scrolls once instead of twice. */
(function () {
  'use strict';
  if (!/[?&]embed=1(&|$)/.test(window.location.search) || window.parent === window) return;
  var last = 0;
  function send() {
    var h = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    if (h === last) return;
    last = h;
    window.parent.postMessage({ type: 'organizational-embed-height', height: h }, window.location.origin);
  }
  if (window.ResizeObserver) new ResizeObserver(send).observe(document.body);
  window.addEventListener('load', send);
  setInterval(send, 700);
})();
