// idle-logout.js — forced logout after real browser inactivity.
//
// Separate from, and never relaxed by, the server-side session idle timeout (server/auth.js
// SESSION_IDLE_TIMEOUT_MINUTES, extendable per-org via Org Settings > Security /
// org_settings.session_timeout_minutes). An org can let a session survive long gaps between
// page loads or API calls, but a browser left genuinely unattended — no mouse, keyboard,
// touch, or scroll input at all — must still lock out on its own fixed timer. Keep this
// value in sync with server/auth.js's SESSION_UNATTENDED_TIMEOUT_MINUTES if it ever changes.
(function () {
  const IDLE_LOGOUT_MINUTES = 15;
  const IDLE_LOGOUT_MS = IDLE_LOGOUT_MINUTES * 60 * 1000;
  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

  let timer = null;

  function doLogout() {
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .finally(function () {
        window.location.href = '/login.html?error=idle';
      });
  }

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(doLogout, IDLE_LOGOUT_MS);
  }

  ACTIVITY_EVENTS.forEach(function (evt) {
    document.addEventListener(evt, resetTimer, { passive: true });
  });

  // Also catch a tab that was hidden (backgrounded, laptop closed) and comes back after
  // the idle window has already elapsed — the timers above pause with the tab, so this is
  // the only reliable trigger for that case.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') resetTimer();
  });

  resetTimer();
})();
