/**
 * cooperative-systems.js — Systems tab of the Cooperative page.
 * Read-only reference content (planetary boundaries, Earth4All turnarounds, Meadows leverage
 * points) from GET /api/organizational/cooperative/systems-framework. Same content for every org.
 * Loaded before cooperative.js, which calls window.loadCooperativeSystems() when the tab opens.
 */
(function () {
  'use strict';

  var loaded = false;
  var framework = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function panel(name) {
    return document.querySelector('[data-organizational-systems-panel="' + name + '"]');
  }

  function showError(msg) {
    var el = document.getElementById('organizational-systems-error');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function accordionItem(title, meta, bodyHtml, open) {
    return '<details class="organizational-collapsible" style="margin-bottom: 0.5rem;"' + (open ? ' open' : '') + '>' +
      '<summary class="organizational-section-heading" style="text-transform: none; letter-spacing: 0; font-size: 0.9375rem; color: var(--organizational-text-primary, var(--text-primary));">' +
      '<span>' + title + '</span>' + (meta ? '<span style="margin-left:auto; margin-right:12px;">' + meta + '</span>' : '') +
      '</summary>' +
      '<div class="organizational-section-body">' + bodyHtml + '</div>' +
      '</details>';
  }

  function list(title, items) {
    if (!items || !items.length) return '';
    return '<h4 class="organizational-subheading" style="font-size: 0.875rem; margin: 16px 0 6px;">' + esc(title) + '</h4>' +
      '<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">' +
      items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') +
      '</ul>';
  }

  function renderOverview() {
    var el = panel('overview');
    if (!el) return;
    el.innerHTML =
      '<section class="organizational-card" style="max-width: 720px;">' +
      '<h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 8px;">How this works</h3>' +
      '<p class="organizational-hint" style="margin: 0 0 12px;">Every project connects to a bigger picture. Three layers are shown together:</p>' +
      '<ol style="margin: 0 0 16px; padding-left: 20px; line-height: 1.6;">' +
      '<li><strong>Planetary boundaries</strong> — how close each ecological limit is to being crossed.</li>' +
      '<li><strong>Turnarounds</strong> — the structural shifts that hold a limit or restore one already crossed.</li>' +
      '<li><strong>Leverage</strong> — how much impact an intervention is likely to have.</li>' +
      '</ol>' +
      '<h4 class="organizational-subheading" style="font-size: 0.875rem; margin: 0 0 6px;">In the Workshop</h4>' +
      '<ul style="margin: 0 0 16px; padding-left: 20px; line-height: 1.6;">' +
      '<li>A workshop project is tagged with the turnarounds it serves.</li>' +
      '<li>Each intervention is rated by where it sits in the leverage hierarchy, from numbers (least leverage) to paradigms (most).</li>' +
      '<li>An intervention can serve more than one turnaround.</li>' +
      '</ul>' +
      '<h4 class="organizational-subheading" style="font-size: 0.875rem; margin: 0 0 6px;">Why timing matters</h4>' +
      '<ul style="margin: 0 0 16px; padding-left: 20px; line-height: 1.6;">' +
      '<li>Once something is built (a pipeline, a law, a plant), it becomes rooted and harder to undo.</li>' +
      '<li>Whether a decision is still open matters as much as what it is about, because that is where the leverage is.</li>' +
      '</ul>' +
      '<p class="organizational-hint" style="margin: 0;"><strong>This is an early version of the framework.</strong> The links between interventions and turnarounds are meant to sharpen as the Workshop\'s systems-mapping work develops.</p>' +
      '</section>';
  }

  function renderBoundaries() {
    var el = panel('boundaries');
    if (!el) return;
    var bs = framework.boundaries || [];
    var crossed = bs.filter(function (b) { return b.status === 'transgressed'; }).length;
    var html = '<div style="max-width: 720px;">' +
      '<h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 8px;">' + bs.length + ' boundaries, ' + crossed + ' crossed</h3>' +
      '<p class="organizational-hint" style="margin: 0 0 6px;">Source: <a href="' + esc(framework.boundaries_source_url) + '" target="_blank" rel="noopener">Stockholm Resilience Centre</a> / Potsdam Institute Planetary Health Check. Updated annually.</p>' +
      '<p class="organizational-hint" style="margin: 0 0 16px;">The Earth system is regulated by measurable processes, from climate to biodiversity to freshwater to ocean chemistry. Scientists have identified a safe limit for each one. This is a current measurement, not a prediction.</p>';
    bs.forEach(function (b) {
      var arrow = b.trend === 'worsening' ? ' ↑' : b.trend === 'improving' ? ' ↓' : '';
      var badge = '<span class="organizational-badge">' + esc(b.status) + arrow + '</span>';
      html += accordionItem(esc(b.name), badge, '<p style="margin: 0; line-height: 1.6;">' + esc(b.description) + '</p>', false);
    });
    el.innerHTML = html + '</div>';
  }

  function renderTurnarounds() {
    var el = panel('turnarounds');
    if (!el) return;
    var boundaryNames = {};
    (framework.boundaries || []).forEach(function (b) {
      (b.turnaround_ids || []).forEach(function (tid) {
        (boundaryNames[tid] = boundaryNames[tid] || []).push(b.name);
      });
    });
    var html = '<div style="max-width: 720px;">' +
      '<h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 8px;">Five turnarounds</h3>' +
      '<p class="organizational-hint" style="margin: 0 0 16px;">From <a href="https://earth4all.life/the-five-extraordinary-turnarounds/" target="_blank" rel="noopener">Earth4All</a>: five structural shifts that together keep human wellbeing within planetary boundaries.</p>';
    (framework.turnarounds || []).forEach(function (t) {
      var body = '<p style="margin: 0 0 4px; line-height: 1.6;">' + esc(t.description) + '</p>' +
        list('Structural levers', t.levers) +
        list('Example actions', t.actions) +
        list('Earth4All system change policies', t.earth4allPolicies) +
        list('Planetary boundaries addressed', boundaryNames[t.id]) +
        '<h4 class="organizational-subheading" style="font-size: 0.875rem; margin: 16px 0 6px;">Why this matters</h4>' +
        '<p style="margin: 0; line-height: 1.6;">' + esc(t.why) + '</p>';
      html += accordionItem(esc(t.title), '', body, false);
    });
    el.innerHTML = html + '</div>';
  }

  function renderLeverage() {
    var el = panel('leverage');
    if (!el) return;
    var levels = (framework.leverage_levels || []).slice().sort(function (a, b) { return a.level - b.level; });
    var html = '<div style="max-width: 720px;">' +
      '<h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 8px;">Where to intervene</h3>' +
      '<p class="organizational-hint" style="margin: 0 0 6px;">Hierarchy adapted from <a href="https://donellameadows.org/" target="_blank" rel="noopener">Donella Meadows</a>, <em>Thinking in Systems</em> (2008). Examples are illustrative.</p>' +
      '<p class="organizational-hint" style="margin: 0 0 16px;">Changing a system\'s rules or feedback loops matters more than changing its outputs. Changing what a system is designed to optimize matters more than changing its rules. Changing the assumptions a system is built on matters most of all. Level 1 has the most leverage; level 12 has the least.</p>';
    levels.forEach(function (l) {
      var body = '<p style="margin: 0 0 6px; line-height: 1.6;">' + esc(l.description) + '</p>' +
        (l.examples ? '<p class="organizational-hint" style="margin: 0; font-style: italic;">' + esc(l.examples) + '</p>' : '');
      html += accordionItem(esc(l.level) + ' — ' + esc(l.label), '', body, false);
    });
    el.innerHTML = html + '</div>';
  }

  function wireTabs() {
    var tabs = document.querySelectorAll('[data-organizational-systems-tab]');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-organizational-systems-tab');
        tabs.forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('[data-organizational-systems-panel]').forEach(function (p) {
          p.hidden = p.getAttribute('data-organizational-systems-panel') !== name;
        });
      });
    });
  }

  window.loadCooperativeSystems = async function () {
    if (loaded) return;
    try {
      var res = await fetch('/api/organizational/cooperative/systems-framework', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      framework = await res.json();
      showError('');
      renderOverview();
      renderBoundaries();
      renderTurnarounds();
      renderLeverage();
      wireTabs();
      loaded = true;
    } catch (e) {
      showError('Could not load the Systems content. Try reloading the page.');
    }
  };
})();
