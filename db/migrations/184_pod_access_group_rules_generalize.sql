-- 184: Generalize pod_access_group_category_rules -> pod_access_group_rules
-- to support document-scoped rules alongside category-scoped ones (a
-- document-level rule is the same mechanism with cardinality one, not a
-- different one - see podAccessGroups.js's resolveRuleTargetDocuments).
--
-- Renamed rather than left as "category_rules" holding non-category rows -
-- a table name actively lying about what it holds is exactly the kind of
-- stale-name confusion that's cost real time on this build before.

ALTER TABLE pod_access_group_category_rules RENAME TO pod_access_group_rules;
ALTER SEQUENCE pod_access_group_category_rules_id_seq RENAME TO pod_access_group_rules_id_seq;
ALTER TABLE pod_access_group_rules RENAME CONSTRAINT pod_access_group_category_rules_pkey TO pod_access_group_rules_pkey;
ALTER TABLE pod_access_group_rules RENAME CONSTRAINT pod_access_group_category_rules_created_by_user_id_fkey TO pod_access_group_rules_created_by_user_id_fkey;
ALTER TABLE pod_access_group_rules RENAME CONSTRAINT pod_access_group_category_rules_group_id_fkey TO pod_access_group_rules_group_id_fkey;
ALTER TABLE pod_access_group_rules RENAME CONSTRAINT pod_access_group_category_rules_org_id_fkey TO pod_access_group_rules_org_id_fkey;
ALTER INDEX idx_pod_access_group_category_rules_org_category RENAME TO idx_pod_access_group_rules_org_category;
ALTER POLICY pod_access_group_category_rules_org_isolation ON pod_access_group_rules RENAME TO pod_access_group_rules_org_isolation;

-- category becomes optional; org_document_id is the alternative target.
ALTER TABLE pod_access_group_rules ALTER COLUMN category DROP NOT NULL;
ALTER TABLE pod_access_group_rules
    ADD COLUMN org_document_id integer REFERENCES org_documents(id) ON DELETE CASCADE;

ALTER TABLE pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_target_check
    CHECK ((category IS NOT NULL) <> (org_document_id IS NOT NULL));

-- The old single unique constraint assumed category was always present;
-- replaced with one partial-unique index per rule type (category can now be
-- NULL, so a plain multi-column unique constraint can't express this).
ALTER TABLE pod_access_group_rules DROP CONSTRAINT pod_access_group_category_rules_org_id_category_group_id_key;
CREATE UNIQUE INDEX pod_access_group_rules_category_uniq
    ON pod_access_group_rules (org_id, category, group_id) WHERE category IS NOT NULL;
CREATE UNIQUE INDEX pod_access_group_rules_document_uniq
    ON pod_access_group_rules (org_id, org_document_id, group_id) WHERE org_document_id IS NOT NULL;

CREATE INDEX idx_pod_access_group_rules_org_document
    ON pod_access_group_rules (org_id, org_document_id) WHERE org_document_id IS NOT NULL;
