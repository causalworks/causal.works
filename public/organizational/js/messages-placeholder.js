/* messages-placeholder.js -- VISUAL PLACEHOLDER ONLY. Not connected to the server; every name and message below is sample text.
   Shows where the Messages drawer will sit (right edge, not dimmed) and what a thread, a document request and a coding
   question look like. Replace with the real drawer when built. */
(function () {
  'use strict';

  function sampleHtml() {
    return ''
      + '<div class="organizational-messages-head">'
      +   '<div style="min-width:0;">'
      +     '<div class="organizational-messages-subject">Invoice 1042: what was this for?</div>'
      +     '<div class="organizational-messages-sub">About <a href="#" onclick="return false;">Bill 1042, Supplier X</a></div>'
      +     '<div class="organizational-messages-sub">Bookkeeper, Program staff</div>'
      +   '</div>'
      +   '<div class="organizational-messages-head-actions">'
      +     '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Resolve</button>'
      +     '<button type="button" class="organizational-panel-close" data-messages-close aria-label="Close messages">&times;</button>'
      +   '</div>'
      + '</div>'
      + '<div class="organizational-messages-note">Placeholder: sample text only. Nothing here is saved or sent.</div>'
      + '<div class="organizational-messages-body">'

      +   '<div class="organizational-messages-msg">'
      +     '<div class="organizational-messages-meta">Bookkeeper &middot; Mon 9:14 am</div>'
      +     '<div>The contract does not say which program this covers. Can you tell me what it was for?</div>'
      +   '</div>'

      +   '<div class="organizational-messages-card">'
      +     '<div class="organizational-messages-card-title">Coding question</div>'
      +     '<div class="organizational-messages-card-sub">Asked of Program staff</div>'
      +     '<div class="organizational-messages-field"><label>Program</label>'
      +       '<select class="organizational-select" disabled><option>Youth Workshops</option></select></div>'
      +     '<div class="organizational-messages-field"><label>Grant or project</label>'
      +       '<select class="organizational-select" disabled><option>Community Foundation grant</option></select></div>'
      +     '<div class="organizational-messages-field"><label>Kind of expense</label>'
      +       '<select class="organizational-select" disabled><option>Printing and materials</option></select></div>'
      +     '<div class="organizational-messages-field"><label>What was it for?</label>'
      +       '<div class="organizational-messages-quote">Workbooks for the spring cohort.</div></div>'
      +     '<div class="organizational-messages-card-actions">'
      +       '<button type="button" class="organizational-btn organizational-btn-primary organizational-messages-small">Accept</button>'
      +       '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Change</button>'
      +       '<span class="organizational-messages-sub">Nothing posts until you confirm in Cash Coding.</span>'
      +     '</div>'
      +   '</div>'

      +   '<div class="organizational-messages-msg">'
      +     '<div class="organizational-messages-meta">Bookkeeper &middot; Mon 9:20 am</div>'
      +     '<div>Thanks. I also need the receipt for the shipping charge.</div>'
      +   '</div>'

      +   '<div class="organizational-messages-card">'
      +     '<div class="organizational-messages-card-title">Document request <span class="organizational-badge">Open</span></div>'
      +     '<div class="organizational-messages-card-sub">Receipt for shipping, $48.20 &middot; asked of Program staff &middot; due Fri</div>'
      +     '<div class="organizational-messages-card-actions">'
      +       '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Choose file</button>'
      +       '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Take photo</button>'
      +     '</div>'
      +   '</div>'

      +   '<div class="organizational-messages-system">Receipt added by Program staff, Tue 2:05 pm &middot; shipping-receipt.jpg</div>'
      + '</div>'

      + '<div class="organizational-messages-composer">'
      +   '<textarea class="organizational-input" rows="2" placeholder="Write a message" disabled></textarea>'
      +   '<div class="organizational-messages-composer-row">'
      +     '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Attach</button>'
      +     '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Request a document</button>'
      +     '<button type="button" class="organizational-btn organizational-btn-outline organizational-messages-small">Ask a coding question</button>'
      +     '<button type="button" class="organizational-btn organizational-btn-primary organizational-messages-small" style="margin-left:auto;">Send</button>'
      +   '</div>'
      + '</div>';
  }

  function init() {
    if (document.getElementById('organizational-messages-drawer')) return;

    var tab = document.createElement('button');
    tab.type = 'button';
    tab.id = 'organizational-messages-tab';
    tab.className = 'organizational-messages-tab';
    tab.setAttribute('aria-controls', 'organizational-messages-drawer');
    tab.setAttribute('aria-expanded', 'false');
    tab.innerHTML = 'Messages <span class="organizational-messages-count">2</span>';

    var drawer = document.createElement('aside');
    drawer.id = 'organizational-messages-drawer';
    drawer.className = 'organizational-messages-drawer';
    drawer.setAttribute('aria-label', 'Messages (placeholder)');
    drawer.innerHTML = sampleHtml();

    var slot = document.querySelector('[data-messages-slot]');
    var tabStyle = 'position:static;border-right:1px solid var(--border-strong);border-radius:var(--radius-md);box-shadow:none;';
    if (!slot) {
      var gear = document.querySelector('.organizational-budget-settings-btn');
      var tabRow = gear ? gear.parentNode : document.querySelector('.organizational-tabs');
      if (tabRow && tabRow.parentNode) {
        slot = document.createElement('div');
        slot.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0 0;';
        tabRow.parentNode.insertBefore(slot, tabRow.nextSibling);
        tabStyle += 'padding:5px 10px;';
      }
    }
    if (slot) {
      tab.style.cssText = tabStyle;
      slot.appendChild(tab);
    } else {
      document.body.appendChild(tab);
    }
    document.body.appendChild(drawer);

    function setOpen(open) {
      drawer.classList.toggle('organizational-messages-is-open', open);
      tab.classList.toggle('organizational-messages-tab-hidden', open);
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    tab.addEventListener('click', function () { setOpen(true); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('[data-messages-close]')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('organizational-messages-is-open')) setOpen(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
