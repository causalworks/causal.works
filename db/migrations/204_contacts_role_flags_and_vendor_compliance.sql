-- 204: Purchases/Sales V1, Section 2 (Contacts). Additive role flags on org_constituents --
-- type ('foundation'/'individual'/'board'/'prospect'/'member_org') is untouched and keeps
-- meaning what it already means; none of the three whitelists that validate against it
-- (donors.js CONSTITUENT_TYPES, importValidators.js, the client-side DONOR_TYPES dropdown) see
-- a vendor-only value pass through type, so none of them need to change. is_donor defaults to
-- true for every existing row so nothing already in the table silently loses a capability --
-- every row created before this migration was donor-side data by construction.

ALTER TABLE org_constituents
  ADD COLUMN is_donor boolean NOT NULL DEFAULT true,
  ADD COLUMN is_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN is_customer boolean NOT NULL DEFAULT false;

ALTER TABLE org_constituents ALTER COLUMN is_donor SET DEFAULT false;

COMMENT ON COLUMN org_constituents.is_donor IS 'Defaulted true on existing rows at migration time (every prior row was donor-side data); false is the default for new rows going forward -- a new contact is not a donor unless marked one.';
COMMENT ON COLUMN org_constituents.is_vendor IS 'Purchases/AP: a bill''s constituent_id must reference a row with is_vendor = true.';
COMMENT ON COLUMN org_constituents.is_customer IS 'Sales/AR: an invoice''s constituent_id must reference a row with is_customer = true.';

CREATE INDEX idx_org_constituents_is_vendor ON org_constituents (org_id, is_vendor) WHERE is_vendor;
CREATE INDEX idx_org_constituents_is_customer ON org_constituents (org_id, is_customer) WHERE is_customer;

-- Vendor compliance data: separate, access-controlled table rather than columns on
-- org_constituents directly, so donor-facing views/exports of the contact table never need to
-- know this data exists. Gated admin-only at the route layer (server/organizational/routes/
-- vendorCompliance.js) -- confirmed the real role model today is admin/staff only ('board' is a
-- DB enum value with no code path that can ever assign it), so admin-only is the honest gate,
-- not a placeholder for finer-grained roles that don't exist yet.
CREATE TABLE org_vendor_compliance (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  tax_id_encrypted text,
  tin_type text CHECK (tin_type IS NULL OR tin_type IN ('ein', 'ssn')),
  tax_entity_type text,
  is_1099_eligible boolean NOT NULL DEFAULT false,
  w9_received boolean NOT NULL DEFAULT false,
  w9_received_at timestamp with time zone,
  payment_terms text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_vendor_compliance_one_per_constituent UNIQUE (constituent_id)
);

ALTER TABLE org_vendor_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_vendor_compliance FORCE ROW LEVEL SECURITY;
CREATE POLICY org_vendor_compliance_org_isolation ON org_vendor_compliance
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

COMMENT ON TABLE org_vendor_compliance IS 'Sensitive vendor compliance data (tax ID, W-9 status), split from org_constituents so donor-facing consumers of that table never see it. Access gated admin-only at the route layer.';

-- 1099 relevance default, per account -- e.g. Professional Fees = true, Office Supplies = false.
-- Pre-fills a bill line's own is_1099_reportable, which stays editable per line.
ALTER TABLE org_accounts ADD COLUMN is_1099_reportable boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN org_accounts.is_1099_reportable IS 'Default 1099 relevance for a bill line coded to this account. Editable per line on the bill -- not every purchase from a 1099-eligible vendor is itself 1099-reportable.';
