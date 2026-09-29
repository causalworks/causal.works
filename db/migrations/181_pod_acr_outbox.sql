-- 181: Transactional outbox for .acr propagation.
--
-- Closes two gaps confirmed live (DevPath): (1) group-member removal used to
-- revoke in Postgres, then loop synchronously through remote .acr PUTs before
-- the request returned - a real, measured window (up to ~1s per resource in
-- testing) where a removed person retained real working access. (2) if any
-- .acr PUT failed partway (ordinary CSS/network blip, no bug required),
-- Postgres and CSS silently disagreed forever - nothing detected or repaired
-- it.
--
-- Fix: every grant/revoke DB write now inserts an outbox row in the SAME
-- transaction as that write (see podAcrOutbox.js's withTransaction helper) -
-- so Postgres and "what CSS needs to be told" agree the instant the
-- transaction commits, before CSS is ever touched. A separate worker
-- (server/jobs/process-acr-outbox.js, sibling to expire-pod-grants.js)
-- processes pending rows on a short interval, retries on failure with
-- backoff, and surfaces persistently-failing rows as 'failed' instead of
-- silently retrying forever.
--
-- reason/grantee_webid are NOT branched on by the worker - rebuildResourceAcr
-- always does a full recompute of a resource's .acr from pod_access_grants'
-- CURRENT state (this codebase's established DB-is-truth/generated-projection
-- philosophy), so any pending row for a resource, whatever triggered it,
-- converges to the same correct result. They exist purely for observability
-- (what triggered this row, useful in last_error context and admin/UI display).

CREATE TABLE pod_acr_outbox (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    resource_url text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('grant', 'revoke')),
    grantee_webid text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    attempt_count integer NOT NULL DEFAULT 0,
    last_error text,
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    done_at timestamp with time zone
);

CREATE INDEX idx_pod_acr_outbox_pending ON pod_acr_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_pod_acr_outbox_org ON pod_acr_outbox (org_id, created_at DESC);

ALTER TABLE pod_acr_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_acr_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_acr_outbox_org_isolation ON pod_acr_outbox
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE ON TABLE pod_acr_outbox TO causal_app;
GRANT USAGE ON SEQUENCE pod_acr_outbox_id_seq TO causal_app;
