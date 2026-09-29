/**
 * Shared utility functions for Coop workspace pages.
 * This module consolidates common functions to reduce code duplication
 * and ensure consistent behavior across all NP JavaScript files.
 */

(function (global) {
  'use strict';

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} s - The string to escape
   * @returns {string} The escaped string
   */
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

  /**
   * Make an authenticated JSON API request with timeout protection.
   * @param {string} url - The API endpoint URL
   * @param {object} options - Fetch options (method, headers, body, etc.)
   * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
   * @returns {Promise<{res: Response, data: object}|null>} The response object or null on error
   */
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
      // Global 403 handling assumes "not a member of this org at all" (requireOrganizationalAccess) --
      // the right response is booting to the individual app. It's the wrong response for a role-scoped
      // 403 within a page the caller otherwise has full access to (e.g. admin-only vendor compliance
      // data) -- callers that want to show their own inline error for that case pass skip403Redirect.
      if (res.status === 403 && String(url || '').indexOf('/api/organizational/') !== -1 && !(options && options.skip403Redirect)) {
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

  /**
   * Format cents as USD currency string.
   * @param {number} cents - Amount in cents
   * @returns {string} Formatted currency string (e.g., "$1,234.56")
   */
  function formatMoneyCents(cents) {
    if (cents == null || cents === '' || Number.isNaN(Number(cents))) return '—';
    const n = Number(cents) / 100;
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  /**
   * Parse organization slug from URL path.
   * @returns {string} The organization slug or empty string
   */
  function parseSlug() {
    const m = (window.location.pathname || '').match(/^\/organizational\/o\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  /**
   * Show error message in designated error element.
   * @param {string} msg - Error message to display
   * @param {string} errorElementId - ID of the error element (default: 'organizational-error')
   */
  function showError(msg, errorElementId = 'organizational-error') {
    const errEl = document.getElementById(errorElementId);
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  /**
   * Format a date as a localized string.
   * @param {string|Date} iso - ISO date string or Date object
   * @returns {string} Formatted date string or '—' if invalid
   */
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
      return '—';
    }
  }

  /**
   * Polls an outbox-status endpoint until every given row settles (done or
   * failed) - a permission/revoke DB write returns as soon as it's committed;
   * CSS catches up asynchronously via pod_acr_outbox
   * (server/jobs/process-acr-outbox.js). "Removed"/"Given" in the UI
   * should mean CSS actually reflects it, not just that the DB write
   * returned.
   * @param {string} statusUrl - endpoint accepting ?ids=1,2,3
   * @param {number[]} ids - outbox row ids to watch
   * @param {(state: {pending:number, done:number, failed:number, settled:boolean, timedOut?:boolean}) => void} onUpdate
   */
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
          // Safety valve: stop polling after 30s so a stuck/slow row doesn't
          // spin the UI forever; the outbox worker keeps retrying regardless.
          onUpdate({ pending, done, failed, settled: true, timedOut: true });
        }
      } catch (e) {
        console.error('pollOutboxUntilSettled:', e);
      }
    };
    tick();
  }

  /**
   * Idle-session warning. Sessions now expire on inactivity (30 min, server-
   * enforced - see server/auth.js) rather than a flat 30-day window. No page
   * in this app autosaves in-progress edits (every save is an explicit
   * button click - confirmed by auditing every PATCH/POST call site under
   * public/organizational/js/), so a silent logout could lose real work.
   * This is a proactive, client-side-only warning, not the enforcement
   * mechanism itself - the server's own expires_at check (via apiJson's
   * existing 401 handling, and requireAuthPage's redirect-to-login on full
   * navigations) is what actually protects the data either way. Matches the
   * server's timeout approximately, not exactly - deliberately not a
   * heartbeat/presence system, just a courtesy on top of it.
   */
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
      // Passive + no per-event work beyond a timestamp write - cheap enough
      // to leave unthrottled; the expensive check runs on its own interval.
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

  // Export functions to global scope for backward compatibility
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

  // Also export individually for direct access
  global.escapeHtml = escapeHtml;
  global.apiJson = apiJson;
  global.formatMoneyCents = formatMoneyCents;
  global.parseSlug = parseSlug;
  global.showError = showError;
  global.formatDate = formatDate;
  global.pollOutboxUntilSettled = pollOutboxUntilSettled;
  global.isAdminRole = isAdminRole;

})(typeof window !== 'undefined' ? window : globalThis);
