-- 179: Standing rules mapping a document category to an access group.
-- v1 ships exactly one row ('board_resolution' -> "Board"), but the schema
-- doesn't assume a 1:1 category-to-group relationship - a category may
-- eventually map to more than one group, so no uniqueness constraint on
-- category alone. Applied at the existing sync-to-pod event
-- (server/organizational/lib/podSync.js): when a document in a matching
-- category syncs, every current member of the mapped group gets a grant.

CREATE TABLE pod_access_group_category_rules (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    category org_document_category NOT NULL,
    group_id integer NOT NULL REFERENCES pod_access_groups(id) ON DELETE CASCADE,
    created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (org_id, category, group_id)
);

CREATE INDEX idx_pod_access_group_category_rules_org_category
    ON pod_access_group_category_rules (org_id, category);

ALTER TABLE pod_access_group_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_access_group_category_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_access_group_category_rules_org_isolation ON pod_access_group_category_rules
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pod_access_group_category_rules TO causal_app;
GRANT USAGE ON SEQUENCE pod_access_group_category_rules_id_seq TO causal_app;
