/* number-colors.js -- optional display setting (Organization settings, Display): show positive amounts in green and negative
   amounts in red. Off by default: amounts keep the text color of their column and negatives show in brackets. Loaded by
   sidebar.js only when the setting is on. It marks any element whose whole text is an amount; it never changes the text. */
(function () {
  'use strict';
  var NEG = 'organizational-num-neg', POS = 'organizational-num-pos';
  var SKIP = { SCRIPT: 1, STYLE: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1 };
  var AMOUNT = /^[\s ]*[+−-]?[\s ]*\(?[\s ]*[+−-]?[\s ]*\$?[\s ]*\d[\d,]*(?:\.\d+)?[\s ]*\)?[\s ]*$/;
  var observer = null, pending = [], scheduled = false, on = false;

  function classify(text) {
    if (!AMOUNT.test(text)) return null;
    if (text.indexOf('$') < 0 && !/\d\.\d{2}\b/.test(text)) return null;
    if (!/[1-9]/.test(text)) return null;
    return /[(−-]/.test(text) ? NEG : POS;
  }

  function mark(textNode) {
    var el = textNode.parentElement;
    if (!el || SKIP[el.tagName] || el.childNodes.length !== 1) return;
    var cls = classify(textNode.nodeValue || '');
    el.classList.remove(NEG, POS);
    if (cls) el.classList.add(cls);
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { mark(root); return; }
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) mark(n);
  }

  function flush() {
    scheduled = false;
    var list = pending; pending = [];
    if (!on) return;
    list.forEach(scan);
  }
  function queue(node) {
    pending.push(node);
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(flush); }
  }

  function enable() {
    if (on) return;
    on = true;
    document.body.classList.add('organizational-number-colors');
    scan(document.body);
    observer = new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'characterData') queue(r.target);
        else r.addedNodes.forEach(queue);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function disable() {
    on = false;
    if (observer) { observer.disconnect(); observer = null; }
    document.body.classList.remove('organizational-number-colors');
    document.querySelectorAll('.' + NEG + ', .' + POS).forEach(function (el) { el.classList.remove(NEG, POS); });
  }

  window.OrganizationalNumberColors = { enable: enable, disable: disable };
})();
