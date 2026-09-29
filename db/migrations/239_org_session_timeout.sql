-- 239: Org-configurable session timeout (Org Settings).
--
-- Login sequencing changed so users land in the Cooperative workspace first (Agency is
-- reached via the existing sidebar link) -- separately, orgs asked for a way to extend how
-- long a session survives normal use before requiring a fresh login, beyond the platform
-- default 30-minute idle window (server/auth.js SESSION_IDLE_TIMEOUT_MINUTES). This column
-- is that per-org override, applied by requireOrgMembership.js while the user is actively
-- working inside that org's Cooperative workspace (org API calls touch the session using
-- this value instead of the global default). NULL means "use the platform default."
--
-- This is independent from, and does not relax, the separate 15-minute unattended-inactivity
-- auto-logout (client-side, mouse/keyboard/touch idle detection -- see
-- public/shared/js/idle-logout.js) -- that lock fires regardless of this setting.
ALTER TABLE org_settings
  ADD COLUMN session_timeout_minutes smallint,
  ADD CONSTRAINT org_settings_session_timeout_minutes_check
    CHECK (session_timeout_minutes IS NULL OR session_timeout_minutes IN (15, 30, 60, 120, 240, 480));
