-- 161: backfill users.first_login_at from actual session history.
--
-- Root cause (fixed in server/auth.js): verifyToken() -- the magic-link login
-- path, which is the only login path in practice since /auth/check-email
-- always reports hasPassword:false -- duplicated createSessionForUser's
-- session-creation logic inline but never ran the first_login_at UPDATE, so
-- the column silently stopped tracking real logins. The two rows that did
-- have a first_login_at (gyacc@pm.me, loopy@causal.works) only got it from
-- whenever that tracking briefly worked (2026-08-14), which is months after
-- their actual first login -- also wrong, so this overwrites those too.
--
-- "First login" is approximated as the earliest session row with a >5-day
-- expiry window (SESSION_EXPIRY_DAYS=30), which distinguishes a real
-- persistent login session from a magic-link/password-reset token (both use
-- much shorter expiries -- MAGIC_LINK_EXPIRY_MINUTES=24h).

UPDATE users u
SET first_login_at = earliest.first_real_session
FROM (
  SELECT s.user_id, MIN(s.created_at) AS first_real_session
  FROM sessions s
  WHERE s.expires_at - s.created_at > interval '5 days'
  GROUP BY s.user_id
) earliest
WHERE earliest.user_id = u.id;
