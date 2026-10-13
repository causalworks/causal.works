-- 178: Access Groups — pod-sharing lists, explicitly separate from
-- Platform Users/org_users (org_member_role). A group is just a named list
-- of external grantees (WebID or email, same resolution as ad-hoc grants)
-- that standing category rules (migration 179) and future features can
-- target. org_id is denormalized onto pod_access_group_members (not just
-- reachable via group_id -> pod_access_groups.org_id) to keep its RLS
-- policy a single-column check, matching the existing pod_access_grants
-- pattern of carrying org_id directly rather than requiring a join.

CREATE TABLE pod_access_groups (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE TABLE pod_access_group_members (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    group_id integer NOT NULL REFERENCES pod_access_groups(id) ON DELETE CASCADE,
    member_label text NOT NULL,
    member_webid text NOT NULL,
    member_profile_url text,
    added_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (group_id, member_webid)
);

CREATE INDEX idx_pod_access_groups_org ON pod_access_groups (org_id);
CREATE INDEX idx_pod_access_group_members_group ON pod_access_group_members (group_id);
CREATE INDEX idx_pod_access_group_members_org ON pod_access_group_members (org_id);

ALTER TABLE pod_access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_access_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_access_groups_org_isolation ON pod_access_groups
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

ALTER TABLE pod_access_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_access_group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_access_group_members_org_isolation ON pod_access_group_members
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pod_access_groups TO causal_app;
GRANT USAGE ON SEQUENCE pod_access_groups_id_seq TO causal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pod_access_group_members TO causal_app;
GRANT USAGE ON SEQUENCE pod_access_group_members_id_seq TO causal_app;
