-- 300: Contacts become one record per person or organization, with roles as rows (2026-10-07).
-- Replaces org_constituents.type (a donor-CRM segmentation from migration 095) and the three role flags
-- is_donor / is_vendor / is_customer (migration 204) with:
--   kind      individual or organization
--   org_type  what kind of organization (organizations only, optional)
--   org_contact_roles  one row per role a contact holds, with optional start and end dates
-- Role keys: donor, vendor, customer, board_member, staff, dues_member. 'staff' and 'dues_member' are reserved:
-- nothing writes them yet. A role is current when starts_on <= today and ends_on is null or after today.
-- "Prospect" is not stored: a donor role with no gifts is a prospect, and "lapsed" is read from the last gift date.
-- The old columns are dropped here (no mirror), and the four rules that required a vendor on bills / bill credit
-- notes and a customer on invoices / invoice credit notes now check for a current role.
-- Backfill rules (guessed from names, because none of the current data is real) report counts via NOTICE.

BEGIN;

ALTER TABLE org_constituents ADD COLUMN kind text;
ALTER TABLE org_constituents ADD COLUMN org_type text;

-- ---- kind
UPDATE org_constituents SET kind = CASE
  WHEN type IN ('foundation', 'member_org') THEN 'organization'
  WHEN type = 'board' THEN 'individual'
  WHEN first_name IS NULL AND last_name IS NULL
       AND (is_vendor OR is_customer OR display_name ~* '(\mLLC\M|\mInc\M|\mLLP\M|\mCorp\M|\mCo\.|\mCompany\M|Foundation|\mFund\M|\mGroup\M|\mSociety\M|\mAlliance\M|Collaborative|\mCenter\M|Department|Commission|\mBank\M|Services|Properties|Insurance|Brokers|Digital|\mEvents\M|\mPrint\M|Clinic|Research|Interpreters|Reporting)')
       THEN 'organization'
  ELSE 'individual'
END;
-- Single-word vendors with no person name (for example a payroll provider) are organizations.
UPDATE org_constituents SET kind = 'organization'
 WHERE kind = 'individual' AND first_name IS NULL AND last_name IS NULL AND is_vendor AND display_name !~ '\s';

ALTER TABLE org_constituents ALTER COLUMN kind SET NOT NULL;
ALTER TABLE org_constituents ADD CONSTRAINT org_constituents_kind_check CHECK (kind IN ('individual', 'organization'));

-- ---- org_type (organizations only)
UPDATE org_constituents SET org_type = CASE
  WHEN type = 'member_org' THEN 'member_organization'
  WHEN display_name ~* '(Department|Commission|\mState of\M|\mCounty\M|\mCity of\M)' THEN 'government'
  WHEN type = 'foundation' OR display_name ~* '(Foundation|\mFund\M)' THEN 'foundation'
  WHEN is_vendor OR is_customer THEN 'corporate'
  ELSE NULL
END
WHERE kind = 'organization';

ALTER TABLE org_constituents ADD CONSTRAINT org_constituents_org_type_check
  CHECK (org_type IN ('foundation', 'corporate', 'government', 'nonprofit', 'member_organization'));
ALTER TABLE org_constituents ADD CONSTRAINT org_constituents_org_type_organizations_only
  CHECK (org_type IS NULL OR kind = 'organization');

COMMENT ON COLUMN org_constituents.kind IS 'individual or organization. Roles (donor, vendor, customer, ...) are rows in org_contact_roles.';
COMMENT ON COLUMN org_constituents.org_type IS 'Optional, organizations only: foundation, corporate (a company), government, nonprofit, member_organization. Overlaps org_grants.institution_type (free text), which still says what kind of funder a grant is.';

-- ---- roles
CREATE TABLE org_contact_roles (
  id             serial PRIMARY KEY,
  org_id         integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('donor', 'vendor', 'customer', 'board_member', 'staff', 'dues_member')),
  starts_on      date NOT NULL DEFAULT CURRENT_DATE,
  ends_on        date,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_contact_roles_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT org_contact_roles_unique UNIQUE (constituent_id, role, starts_on)
);
CREATE INDEX idx_org_contact_roles_org_role ON org_contact_roles (org_id, role);
CREATE INDEX idx_org_contact_roles_constituent ON org_contact_roles (constituent_id);

-- The role row's org must match the contact's org.
CREATE FUNCTION org_contact_roles_check_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_contact_roles.constituent_id % must reference an org_constituents row in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_org_contact_roles_check_org BEFORE INSERT OR UPDATE ON org_contact_roles
  FOR EACH ROW EXECUTE FUNCTION org_contact_roles_check_org();

ALTER TABLE org_contact_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_contact_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY org_contact_roles_org_isolation ON org_contact_roles
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_contact_roles TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_contact_roles_id_seq TO causal_app;

-- ---- backfill roles from the old flags and type
INSERT INTO org_contact_roles (org_id, constituent_id, role, starts_on)
SELECT org_id, id, 'donor', created_at::date FROM org_constituents
 WHERE is_donor OR type IN ('foundation', 'prospect', 'board');
INSERT INTO org_contact_roles (org_id, constituent_id, role, starts_on)
SELECT org_id, id, 'vendor', created_at::date FROM org_constituents WHERE is_vendor;
INSERT INTO org_contact_roles (org_id, constituent_id, role, starts_on)
SELECT org_id, id, 'customer', created_at::date FROM org_constituents WHERE is_customer;
INSERT INTO org_contact_roles (org_id, constituent_id, role, starts_on)
SELECT org_id, id, 'board_member', created_at::date FROM org_constituents WHERE type = 'board';

DO $report$
DECLARE r record;
BEGIN
  FOR r IN SELECT kind, coalesce(org_type, '-') AS org_type, count(*) AS n FROM org_constituents GROUP BY 1, 2 ORDER BY 1, 2 LOOP
    RAISE NOTICE 'kind % / org_type %: % contacts', r.kind, r.org_type, r.n;
  END LOOP;
  FOR r IN SELECT role, count(*) AS n FROM org_contact_roles GROUP BY 1 ORDER BY 1 LOOP
    RAISE NOTICE 'role %: % rows', r.role, r.n;
  END LOOP;
END
$report$;

-- ---- the four database rules now check for a current role
CREATE FUNCTION org_contact_has_role(p_constituent_id integer, p_org_id integer, p_role text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_contact_roles r
     WHERE r.constituent_id = p_constituent_id AND r.org_id = p_org_id AND r.role = p_role
       AND r.starts_on <= CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on > CURRENT_DATE)
  );
$$;

DO $fn$
DECLARE d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('org_enforce_bill_constituent_is_vendor', 'org_bills', 'vendor'),
    ('org_enforce_bill_credit_note_constituent_is_vendor', 'org_bill_credit_notes', 'vendor'),
    ('org_enforce_invoice_constituent_is_customer', 'org_invoices', 'customer'),
    ('org_enforce_invoice_credit_note_constituent_is_customer', 'org_invoice_credit_notes', 'customer')
  ) AS t(fn, tbl, role) LOOP
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %I() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NOT org_contact_has_role(NEW.constituent_id, NEW.org_id, %L) THEN
          RAISE EXCEPTION '%s.constituent_id %s must reference an org_constituents row with a current %s role, in the same org', NEW.constituent_id
            USING ERRCODE = 'CA004';
        END IF;
        RETURN NEW;
      END;
      $body$$f$, d.fn, d.role, d.tbl, '%', d.role);
  END LOOP;
END
$fn$;

-- ---- drop the old columns
DROP INDEX idx_org_constituents_is_vendor;
DROP INDEX idx_org_constituents_is_customer;
DROP INDEX idx_org_constituents_type;
ALTER TABLE org_constituents DROP CONSTRAINT org_constituents_type_check;
ALTER TABLE org_constituents DROP COLUMN type, DROP COLUMN is_donor, DROP COLUMN is_vendor, DROP COLUMN is_customer;
CREATE INDEX idx_org_constituents_kind ON org_constituents (org_id, kind);

COMMIT;
