/**
 * Shared utility functions for Coop workspace pages.
 * This module consolidates common functions to reduce code duplication
 * and ensure consistent behavior across all NP JavaScript files.
 */

(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * True if a role string (an org's viewer role, a member's role, etc.) is 'admin'.
   * Case-insensitive, null/undefined-safe. Was independently reimplemented as the same
   * one-line `String(role || '').toLowerCase() === 'admin'` check in settings.js,
   * budget-workspace.js, compliance.js, and reports.js — centralized here (2026-09-12) so a
   * future change to what "admin" means doesn't require finding and updating every copy.
   * @param {string} role
   * @returns {boolean}
   */
  function isAdminRole(role) {
    return String(role || '').toLowerCase() === 'admin';
  }

  async function apiJson(url, options, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = {};
      }
      if (res.status === 401) {
        window.location.href = '/login.html';
        return null;
      }
      const roleRefusal = data && (data.code === 'no_access' || data.code === 'entry_off' || /requires one of these roles/.test(String(data.error || '')));
      if (res.status === 403 && !roleRefusal && String(url || '').indexOf('/api/organizational/') !== -1 && !(options && options.skip403Redirect)) {
        window.location.href = '/app.html?coop=disabled';
        return null;
      }
      return { res, data };
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        console.error('API request timeout:', url);
        return null;
      }
      throw e;
    }
  }

  function formatMoneyCents(cents, opts) {
    if (cents == null || cents === '' || Number.isNaN(Number(cents))) return '—';
    const n = Number(cents) / 100;
    const digits = opts && opts.whole ? 0 : 2;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting', minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function showError(msg, errorElementId = 'organizational-error') {
    const errEl = document.getElementById(errorElementId);
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
      return '—';
    }
  }

  function pollOutboxUntilSettled(statusUrl, ids, onUpdate) {
    if (!ids || ids.length === 0) {
      onUpdate({ pending: 0, done: ids ? ids.length : 0, failed: 0, settled: true });
      return;
    }
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`${statusUrl}?ids=${ids.join(',')}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : { rows: [] };
        const rows = data.rows || [];
        const done = rows.filter((r) => r.status === 'done').length;
        const failed = rows.filter((r) => r.status === 'failed').length;
        const pending = ids.length - done - failed;
        const settled = pending === 0;
        onUpdate({ pending, done, failed, settled });
        if (!settled && Date.now() - start < 30000) {
          setTimeout(tick, 800);
        } else if (!settled) {
          onUpdate({ pending, done, failed, settled: true, timedOut: true });
        }
      } catch (e) {
        console.error('pollOutboxUntilSettled:', e);
      }
    };
    tick();
  }

  function initIdleSessionWarning() {
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
    const WARNING_LEAD_MS = 2 * 60 * 1000;
    let lastActivityAt = Date.now();
    let warningEl = null;
    let checkTimer = null;
    let touchInFlight = false;

    function touchSessionNow() {
      if (touchInFlight) return;
      touchInFlight = true;
      fetch('/api/me', { credentials: 'include' })
        .catch(() => {})
        .finally(() => { touchInFlight = false; });
    }

    function showWarning() {
      if (warningEl) return;
      warningEl = document.createElement('div');
      warningEl.setAttribute('role', 'alert');
      warningEl.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; max-width:340px; padding:14px 16px; border-radius:10px; background:var(--surface-card); border:0.5px solid var(--border-subtle); box-shadow:var(--shadow-lg); font-size:0.875rem; color:var(--text-primary);';
      warningEl.innerHTML =
        '<div style="margin-bottom:10px;">You\'ll be logged out soon due to inactivity.</div>' +
        '<button type="button" class="organizational-btn" style="padding:6px 12px; font-size:0.8125rem;">Stay logged in</button>';
      warningEl.querySelector('button').addEventListener('click', () => {
        touchSessionNow();
        onActivity();
      });
      document.body.appendChild(warningEl);
    }

    function hideWarning() {
      if (!warningEl) return;
      warningEl.remove();
      warningEl = null;
    }

    function onActivity() {
      lastActivityAt = Date.now();
      if (warningEl) hideWarning();
    }

    function check() {
      const idleFor = Date.now() - lastActivityAt;
      if (idleFor >= IDLE_TIMEOUT_MS) {
        window.location.href = '/login.html';
        return;
      }
      if (idleFor >= IDLE_TIMEOUT_MS - WARNING_LEAD_MS) {
        showWarning();
      }
    }

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, onActivity, { passive: true });
    });
    checkTimer = setInterval(check, 15000);
    window.addEventListener('beforeunload', () => clearInterval(checkTimer));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initIdleSessionWarning);
    } else {
      initIdleSessionWarning();
    }
  }

  global.OrganizationalUtils = {
    escapeHtml,
    apiJson,
    formatMoneyCents,
    parseSlug,
    showError,
    formatDate,
    pollOutboxUntilSettled,
    isAdminRole,
  };

  global.escapeHtml = escapeHtml;
  global.apiJson = apiJson;
  global.formatMoneyCents = formatMoneyCents;
  global.parseSlug = parseSlug;
  global.showError = showError;
  global.formatDate = formatDate;
  global.pollOutboxUntilSettled = pollOutboxUntilSettled;
  global.isAdminRole = isAdminRole;

})(typeof window !== 'undefined' ? window : globalThis);

window.OrganizationalStatusHtml = function (status, label) {
  const green = ['posted', 'paid', 'confirmed', 'approved', 'reconciled', 'accepted', 'received'];
  const amber = ['pending_approval', 'submitted', 'scheduled', 'sent', 'paid_pending_confirmation', 'partially_paid', 'unreconciled', 'pending'];
  const red = ['overdue', 'disputed', 'rejected', 'failed'];
  const grey = ['draft', 'void', 'voided', 'written_off', 'cancelled', 'closed'];
  const key = String(status || '').toLowerCase();
  const color = green.includes(key) ? 'var(--green)' : amber.includes(key) ? 'var(--amber)' : red.includes(key) ? 'var(--red)' : grey.includes(key) ? 'var(--text-muted)' : 'inherit';
  return '<span style="font-weight:600;color:' + color + ';">' + window.escapeHtml(label != null ? label : String(status || '')) + '</span>';
};
