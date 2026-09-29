-- 209: at Approval, a Bill posts a real double-entry transaction -- debit the expense
-- account(s) from the bill lines, credit Accounts Payable -- but nothing in an org's chart of
-- accounts is guaranteed to have an AP liability account today. Mirrors the exact lazy,
-- collision-checked per-org creation pattern Bank Reconciliation already established for its
-- clearing account (org_get_or_create_clearing_account, migration 200) rather than requiring
-- every org to pre-configure one or inventing a different mechanism.

ALTER TABLE org_accounts ADD COLUMN is_system_ap_account boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_org_accounts_one_ap_account_per_org ON org_accounts (org_id) WHERE is_system_ap_account;

COMMENT ON COLUMN org_accounts.is_system_ap_account IS 'Marks the org''s single system-managed Accounts Payable liability account, lazily created by org_get_or_create_ap_account on first Bill approval. Same pattern as is_system_clearing_account.';

CREATE FUNCTION org_get_or_create_ap_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_ap_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (2000 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Accounts Payable account (checked 2000-2020)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_ap_account)
  VALUES (p_org_id, v_candidate_code, 'Accounts Payable', 'liability', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
