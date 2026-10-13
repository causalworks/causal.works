/**
 * Shared NP freshness / relative time helpers (browser globals).
 * @see formatRelativeTime
 */
(function (global) {
  'use strict';

  function parseIso(iso) {
    if (iso == null || String(iso).trim() === '') return null;
    const d = new Date(String(iso).trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatRelativeTime(iso_timestamp) {
    const d = parseIso(iso_timestamp);
    if (!d) return '—';
    const diffMs = Date.now() - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? '1 minute ago' : min + ' minutes ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 hour ago' : hr + ' hours ago';
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? '1 day ago' : day + ' days ago';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatAbsoluteFreshness(iso_timestamp) {
    const d = parseIso(iso_timestamp);
    if (!d) return '—';
    const diffMs = Date.now() - d.getTime();
    const day = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (day < 7) {
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatFreshnessLine(iso_timestamp, kind) {
    const d = parseIso(iso_timestamp);
    if (!d) return '';
    const diffMs = Date.now() - d.getTime();
    const prefixes = {
      updated: 'Last updated ',
      synced: 'Last synced ',
      generated: 'Summary generated ',
      edited: 'Budget lines last edited ',
      imported: 'Last imported ',
    };
    const prefix = prefixes[kind] || 'Last updated ';
    const tail = diffMs < 24 * 60 * 60 * 1000 ? formatRelativeTime(iso_timestamp) : formatAbsoluteFreshness(iso_timestamp);
    return prefix + tail;
  }

  function formatBasedOnActualsSynced(iso_timestamp) {
    const d = parseIso(iso_timestamp);
    if (!d) return 'Based on actuals — not imported yet';
    const diffMs = Date.now() - d.getTime();
    const tail = diffMs < 24 * 60 * 60 * 1000 ? formatRelativeTime(iso_timestamp) : formatAbsoluteFreshness(iso_timestamp);
    return 'Based on actuals synced ' + tail;
  }

  global.formatRelativeTime = formatRelativeTime;
  global.formatAbsoluteFreshness = formatAbsoluteFreshness;
  global.formatFreshnessLine = formatFreshnessLine;
  global.formatBasedOnActualsSynced = formatBasedOnActualsSynced;
})(typeof window !== 'undefined' ? window : globalThis);
