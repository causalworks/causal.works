-- 258: Support the 'program' role at invite time, not just via post-acceptance role-change.
--
-- Real usage feedback (2026-09-19, immediately after the invite RLS fix in migration 257):
-- Invite only offered Admin/Finance while Change Role also offered Program, forcing every
-- program-scoped person through an extra invite-then-promote step -- flagged as a real UX gap,
-- not a hypothetical one (see .claude/plans/archive/2026-09-19-inviteaccept-rls-fix.md and modern-SaaS
-- precedent already researched there: Linear/Vercel assign a scoped role at invite time).
--
-- org_invites predates the invitee having an org_users row, so there's nowhere to attach an
-- org_program_grants row (which FKs to org_user_id) until acceptance. This column carries the
-- *intended* grants from invite-creation through to accept time, where inviteAccept.js
-- materializes them into real org_program_grants rows once the org_users row exists.
ALTER TABLE org_invites ADD COLUMN IF NOT EXISTS program_ids integer[] NOT NULL DEFAULT '{}';

-- Replace the RLS-bootstrap lookup functions from migration 257 to also return program_ids.
-- CREATE OR REPLACE can't change a function's OUT-parameter row shape, so drop first.
DROP FUNCTION IF EXISTS resolve_invite_by_token(text);
DROP FUNCTION IF EXISTS resolve_invite_by_id(integer);

CREATE OR REPLACE FUNCTION resolve_invite_by_token(p_token_hash text)
RETURNS TABLE(id integer, org_id integer, email text, role text, expires_at timestamptz, org_slug text, org_display_name text, program_ids integer[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, i.expires_at, o.slug, o.display_name, i.program_ids
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.token_hash = p_token_hash AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION resolve_invite_by_id(p_invite_id integer)
RETURNS TABLE(id integer, org_id integer, email text, role text, org_slug text, program_ids integer[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, o.slug, i.program_ids
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.id = p_invite_id AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_invite_by_token(text) TO causal_app;
GRANT EXECUTE ON FUNCTION resolve_invite_by_id(integer) TO causal_app;
