-- 257: RLS bootstrap functions for inviteAccept.js -- fixes the invite-acceptance flow being
-- completely non-functional (see .claude/plans/archive/2026-09-16-rls-audit-membership-inviteaccept.md).
--
-- org_invites carries FORCE RLS (migration 137), isolated on org_id via app.current_org_id.
-- All four endpoints in inviteAccept.js need to look up an invite (by raw token, by id, or by
-- the caller's own email) BEFORE any org id is known -- the same bootstrapping problem
-- migrations 148/150 solved for other chokepoints, via a SECURITY DEFINER function that runs
-- as table owner (bypasses RLS) instead of the app.current_org_id GUC. Safe here for the same
-- reason password-reset tokens are safe: the raw token is the credential (unguessable,
-- single-use, expiring); the id/email-based lookups are gated by requireAuth() and an
-- explicit email match in the route handler, same as today's already-reviewed code.

CREATE OR REPLACE FUNCTION resolve_invite_by_token(p_token_hash text)
RETURNS TABLE(id integer, org_id integer, email text, role text, expires_at timestamptz, org_slug text, org_display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, i.expires_at, o.slug, o.display_name
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.token_hash = p_token_hash AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION resolve_invite_by_id(p_invite_id integer)
RETURNS TABLE(id integer, org_id integer, email text, role text, org_slug text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, o.slug
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.id = p_invite_id AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION resolve_pending_invites_for_email(p_email text)
RETURNS TABLE(id integer, role text, created_at timestamptz, org_slug text, org_display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.role::text, i.created_at, o.slug, o.display_name
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE LOWER(i.email) = LOWER(p_email) AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION resolve_invite_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_invite_by_id(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_pending_invites_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_invite_by_token(text) TO causal_app;
GRANT EXECUTE ON FUNCTION resolve_invite_by_id(integer) TO causal_app;
GRANT EXECUTE ON FUNCTION resolve_pending_invites_for_email(text) TO causal_app;
