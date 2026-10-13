-- demo-company: one realistic voided entry (2026-10-04) so the Transactions list's "Show voided" toggle and the
-- Voided status filter have something to show. A rent payment entered twice by mistake; the duplicate is voided
-- with a reason, the original stays posted. Voided entries are excluded from every balance and report.
-- Re-runnable. Run SELECT snapshot_demo_org(); afterwards.

DO $$
DECLARE
  v_org int; v_cash int; v_rent int; v_user int := 7; tid int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'demo-company';
  IF v_org IS NULL THEN RAISE EXCEPTION 'demo-company not found'; END IF;
  SELECT id INTO v_cash FROM org_accounts WHERE org_id = v_org AND code = '1100';
  SELECT id INTO v_rent FROM org_accounts WHERE org_id = v_org AND code = '7100';

  DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id = v_org AND memo = 'Office rent (duplicate entry)');
  DELETE FROM org_ledger_transactions WHERE org_id = v_org AND memo = 'Office rent (duplicate entry)';

  INSERT INTO org_ledger_transactions
    (org_id, transaction_date, fiscal_year, memo, payee, status, source, entry_type, created_by, voided_at, voided_by, void_reason)
  VALUES
    (v_org, DATE '2026-10-01', 2026, 'Office rent (duplicate entry)', 'Riverside Property Management', 'voided', 'manual', 'spend', v_user,
     TIMESTAMPTZ '2026-10-02 15:10:00+00', v_user, 'Duplicate of the 1 October rent entry; entered twice by mistake.')
  RETURNING id INTO tid;
  INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents) VALUES
    (tid, v_rent, 223, 320000, 0),
    (tid, v_cash, 223, 0, 320000);
END
$$;
