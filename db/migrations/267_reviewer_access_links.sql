-- 267: Reusable, non-consuming login links for external reviewers (ODI Solid open call demo,
-- see .claude/plans/2026-09-23-odi-workspace-splash.md) -- deliberately separate from the
-- magic-link mechanism (server/auth.js's sessions table), which is single-use by design and
-- shouldn't be modified to support reuse: a bug there risks real login security, not just demo
-- convenience. This table is a small, standalone, easily-revocable side door for a known,
-- temporary purpose -- a token here never touches the sessions table's own consumption logic,
-- it only ever creates a brand-new session row the same way any other login does.
--
-- Platform-level, not org-scoped -- no org_id, no RLS (matches coop_pod_credentials/
-- causal_service_credentials: singleton-ish platform tables, not per-org data).

CREATE TABLE reviewer_access_links (
    id SERIAL PRIMARY KEY,
    token text NOT NULL UNIQUE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviewer_access_links_token ON reviewer_access_links (token) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON TABLE reviewer_access_links TO causal_app;
GRANT USAGE ON SEQUENCE reviewer_access_links_id_seq TO causal_app;
