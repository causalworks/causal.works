-- 269: Verified one-time-code access for link shares (external, non-Solid recipients).
-- Before this, a share was a public pod copy at an unguessable URL and "have the URL" was the
-- only check. Now the recipient's link points at a Causal page (/share/<share_token>) that emails
-- a short code to the address the share was created for; only after that does Causal stream the
-- document. See .claude/plans/2026-09-03-org-data-pod-scope.md ("external sharing" note).
--
-- Legacy rows (share_token NULL) keep the old public-copy behavior until revoked or reissued.
-- Undo: DROP FUNCTION resolve_pod_share(text); DROP TABLE pod_share_challenges;
--       DROP INDEX pod_access_permissions_share_token_key;
--       ALTER TABLE pod_access_permissions DROP COLUMN share_token;

ALTER TABLE pod_access_permissions ADD COLUMN IF NOT EXISTS share_token text;

CREATE UNIQUE INDEX IF NOT EXISTS pod_access_permissions_share_token_key
  ON pod_access_permissions (share_token) WHERE share_token IS NOT NULL;

CREATE TABLE pod_share_challenges (
    id serial PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    permission_id integer NOT NULL REFERENCES pod_access_permissions(id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    verified_at timestamp with time zone,
    requested_ip text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_pod_share_challenges_permission ON pod_share_challenges (permission_id, created_at DESC);

ALTER TABLE pod_share_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_share_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_share_challenges_org_isolation ON pod_share_challenges
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE ON TABLE pod_share_challenges TO causal_app;
GRANT USAGE ON SEQUENCE pod_share_challenges_id_seq TO causal_app;

-- The public share page has no session and so no org context yet; this is the one lookup that
-- has to work before it exists (same bootstrapping pattern as resolve_org_pod_credential).
-- Returns nothing for an unknown token. Callers must still check revoked_at/expires_at.
CREATE FUNCTION resolve_pod_share(p_token text)
RETURNS TABLE(permission_id integer, org_id integer, org_slug text, share_resource_url text,
              recipient_label text, expires_at timestamp with time zone, revoked_at timestamp with time zone)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.org_id, c.slug, p.share_resource_url, p.recipient_label, p.expires_at, p.revoked_at
    FROM pod_access_permissions p
    JOIN coop_members c ON c.id = p.org_id
   WHERE p.share_token = p_token AND p.share_token IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION resolve_pod_share(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_pod_share(text) TO causal_app;
