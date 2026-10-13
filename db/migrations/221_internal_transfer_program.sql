-- 221: Transfer tab rebuild -- a transfer between an org's own bank accounts has no P&L impact
-- (confirmed against Xero's own actual Transfer UI, which asks for a destination account and a
-- reference, never a program/tracking category), but org_ledger_lines.program_id is NOT NULL on
-- every line, so a transfer still needs *something* there. Same lazy-creation-by-flag pattern
-- already established for the AP/AR/clearing accounts (migrations 200/209/211) -- a real
-- "Internal Transfers" program, not a NULL-program special case, so no other part of the system
-- (budget-vs-actual, reports) needs to learn a new exception.
--
-- No collision-avoidance loop needed here unlike the AP/AR account functions: org_programs.code
-- has no uniqueness constraint (confirmed via pg_constraint), so a fixed code is safe.

ALTER TABLE org_programs ADD COLUMN is_system_transfer_program boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_org_programs_one_transfer_program_per_org ON org_programs (org_id) WHERE is_system_transfer_program;

COMMENT ON COLUMN org_programs.is_system_transfer_program IS 'Marks the org''s single system-managed "Internal Transfers" program, lazily created by org_get_or_create_internal_transfer_program on first use of the Transfer tab. Same pattern as is_system_ap_account/is_system_ar_account/is_system_clearing_account.';

CREATE FUNCTION org_get_or_create_internal_transfer_program(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
  v_id integer;
BEGIN
  SELECT id INTO v_id FROM org_programs
    WHERE org_id = p_org_id AND is_system_transfer_program = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO org_programs (org_id, code, name, description, active, is_default, program_kind, is_system_transfer_program)
  VALUES (p_org_id, 'INTERNAL-TRANSFERS', 'Internal Transfers', 'System program for transfers between the organization''s own bank accounts -- no P&L impact.', true, false, 'program', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
