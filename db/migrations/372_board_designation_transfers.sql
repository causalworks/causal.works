-- 372: a board designation is carried on equity lines only; existing tags on asset lines are restated as transfer entries.

DO $$
DECLARE
  r record;
  v_from integer;
  v_to integer;
  v_txn integer;
  v_fy integer;
  v_amt bigint;
BEGIN
  FOR r IN
    SELECT l.id AS line_id, l.program_id, l.board_designation_id, l.debit_cents, l.credit_cents,
           t.org_id, t.transaction_date, t.fiscal_year, d.name AS designation_name
      FROM org_ledger_lines l
      JOIN org_ledger_transactions t ON t.id = l.transaction_id
      JOIN org_accounts a ON a.id = l.account_id
      JOIN org_board_designations d ON d.id = l.board_designation_id
     WHERE a.type <> 'equity'
     ORDER BY t.org_id, t.transaction_date, l.id
  LOOP
    SELECT id INTO v_from FROM org_accounts
     WHERE org_id = r.org_id AND type = 'equity' AND is_posting AND name ILIKE 'Net Assets Without Donor Restrictions%' ORDER BY code LIMIT 1;
    SELECT id INTO v_to FROM org_accounts
     WHERE org_id = r.org_id AND type = 'equity' AND is_posting AND name ILIKE '%Board-Designated%' ORDER BY code LIMIT 1;
    IF v_from IS NULL OR v_to IS NULL THEN
      RAISE EXCEPTION 'org % has a designation tag on a non-equity line but no matching equity accounts', r.org_id;
    END IF;
    v_amt := r.debit_cents - r.credit_cents;
    IF v_amt = 0 THEN CONTINUE; END IF;

    INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source, status, entry_type)
    VALUES (r.org_id, r.transaction_date, r.fiscal_year,
            CASE WHEN v_amt > 0 THEN 'Designate net assets: ' ELSE 'Release designated net assets: ' END || r.designation_name,
            'manual', 'posted', 'transfer')
    RETURNING id INTO v_txn;

    INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, board_designation_id, debit_cents, credit_cents)
    VALUES
      (v_txn, v_from, r.program_id, NULL,                      GREATEST(v_amt, 0), GREATEST(-v_amt, 0)),
      (v_txn, v_to,   r.program_id, r.board_designation_id,    GREATEST(-v_amt, 0), GREATEST(v_amt, 0));

    UPDATE org_ledger_lines SET board_designation_id = NULL WHERE id = r.line_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION org_enforce_designation_on_equity_line() RETURNS trigger AS $$
BEGIN
  IF NEW.board_designation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.type = 'equity') THEN
    RAISE EXCEPTION 'A board designation can only be placed on a net assets (equity) line'
      USING ERRCODE = 'CA010';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_lines_designation_equity
  BEFORE INSERT OR UPDATE OF board_designation_id, account_id ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_designation_on_equity_line();
