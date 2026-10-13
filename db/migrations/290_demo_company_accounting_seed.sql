-- Demo Company (the shared demo org behind /demo, /demo-coop and /odi) accounting seed, 2026-10-03.
--
-- Replaces the leftover test debris in the demo ledger (10 voided verification transactions, orphaned
-- ledger lines, a $5 test bill, a draft test invoice, "Test Donor") with a believable small-nonprofit
-- year (Jan-Oct 2026): opening balances, restricted and unrestricted grant receipts, individual
-- donations, monthly payroll with grant-tagged program staff, rent/tech/insurance, a few bills and
-- invoices (some open, one overdue each), interest. Re-runnable: it deletes the demo org's accounting
-- rows first. Run SELECT snapshot_demo_org(); afterwards so the nightly reset keeps this baseline.
--
-- Not covered by the demo reset (known defect, see .claude/plans/2026-10-03-accounting-review-fixes-plan.md):
-- child tables without an org_id column (org_ledger_lines, org_bill_lines, org_invoice_lines) are never
-- restored or purged, so a visitor's new transactions leave orphan lines behind.

DO $seed$
DECLARE
  v_org int; v_user int := 7;
  m int; d date; t int; v int;
  v_cash int; v_mm int; v_ar int; v_ap int; v_na int;
  c_riverside int; c_clear int; c_bright int; c_metro int; c_east int;
  b1 int; b2 int; b3 int; i1 int; i2 int; i3 int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'demo-company';
  IF v_org IS NULL THEN RAISE EXCEPTION 'demo-company not found'; END IF;

  -- ---- clear old demo accounting rows
  DELETE FROM org_bill_lines WHERE bill_id IN (SELECT id FROM org_bills WHERE org_id = v_org);
  DELETE FROM org_invoice_lines WHERE invoice_id IN (SELECT id FROM org_invoices WHERE org_id = v_org);
  DELETE FROM org_bill_payments WHERE org_id = v_org;
  DELETE FROM org_invoice_payments WHERE org_id = v_org;
  DELETE FROM org_bills WHERE org_id = v_org;
  DELETE FROM org_invoices WHERE org_id = v_org;
  UPDATE org_bank_statement_lines SET ledger_transaction_id = NULL WHERE org_id = v_org;
  DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id = v_org)
     OR NOT EXISTS (SELECT 1 FROM org_ledger_transactions x WHERE x.id = org_ledger_lines.transaction_id);
  DELETE FROM org_ledger_transactions WHERE org_id = v_org;
  DELETE FROM org_constituents WHERE org_id = v_org AND display_name = 'Test Donor'
     AND NOT EXISTS (SELECT 1 FROM org_gifts g WHERE g.constituent_id = org_constituents.id);

  -- ---- accounts
  SELECT id INTO v_cash FROM org_accounts WHERE org_id = v_org AND code = '1100';
  SELECT id INTO v_mm   FROM org_accounts WHERE org_id = v_org AND code = '1110';
  SELECT id INTO v_ar   FROM org_accounts WHERE org_id = v_org AND is_system_ar_account;
  SELECT id INTO v_ap   FROM org_accounts WHERE org_id = v_org AND is_system_ap_account;
  SELECT id INTO v_na   FROM org_accounts WHERE org_id = v_org AND code = '3100';

  -- ---- contacts
  INSERT INTO org_constituents (org_id, display_name, is_vendor, is_customer, type, email) VALUES
    (v_org, 'Riverside Property Management', true, false, 'individual', NULL),
    (v_org, 'Clearwater Office Supply', true, false, 'individual', NULL),
    (v_org, 'Brightline CPA Group', true, false, 'individual', NULL),
    (v_org, 'Metro Workforce Board', false, true, 'individual', NULL),
    (v_org, 'Eastside Community College', false, true, 'individual', NULL);
  SELECT id INTO c_riverside FROM org_constituents WHERE org_id = v_org AND display_name = 'Riverside Property Management';
  SELECT id INTO c_clear     FROM org_constituents WHERE org_id = v_org AND display_name = 'Clearwater Office Supply';
  SELECT id INTO c_bright    FROM org_constituents WHERE org_id = v_org AND display_name = 'Brightline CPA Group';
  SELECT id INTO c_metro     FROM org_constituents WHERE org_id = v_org AND display_name = 'Metro Workforce Board';
  SELECT id INTO c_east      FROM org_constituents WHERE org_id = v_org AND display_name = 'Eastside Community College';

  -- ---- helpers: acct(code) and post(date, memo, payee, source, lines)
  CREATE OR REPLACE FUNCTION pg_temp.acct(p_org int, p_code text) RETURNS int LANGUAGE sql AS
    $f$ SELECT id FROM org_accounts WHERE org_id = p_org AND code = p_code $f$;

  -- lines: jsonb array of {a: account id, p: program id, g: grant id, rc: restriction class, dr, cr}
  CREATE OR REPLACE FUNCTION pg_temp.post(p_org int, p_user int, p_date date, p_memo text, p_payee text,
                                          p_source text, p_lines jsonb) RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE tid int;
  BEGIN
    INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, payee, status, source, created_by, approved_by, approved_at)
      VALUES (p_org, p_date, EXTRACT(year FROM p_date)::int, p_memo, p_payee, 'posted', p_source, p_user, p_user, p_date::timestamptz)
      RETURNING id INTO tid;
    INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, grant_id, donor_restriction_class, debit_cents, credit_cents)
      SELECT tid, (x->>'a')::int, (x->>'p')::int, NULLIF(x->>'g','')::int,
             NULLIF(x->>'rc','')::org_restriction_class, COALESCE((x->>'dr')::bigint, 0), COALESCE((x->>'cr')::bigint, 0)
      FROM jsonb_array_elements(p_lines) x;
    RETURN tid;
  END $f$;

  -- ---- opening balances (one manual entry on Jan 1)
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-01-01', 'Opening balances', NULL, 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'dr', 12000000),
    jsonb_build_object('a', v_mm,   'p', 223, 'dr', 6000000),
    jsonb_build_object('a', v_na,   'p', 223, 'cr', 18000000)));

  -- ---- grant receipts (restricted) and unrestricted support
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-01-12', 'Contract 2025-C – first payment', 'Agency C', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'rc', 'temporarily_restricted', 'dr', 6000000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4300'), 'p', 220, 'g', 87, 'rc', 'temporarily_restricted', 'cr', 6000000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-02-10', 'General Support Grant – Funder A', 'Funder A', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'dr', 5000000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4200'), 'p', 223, 'g', 85, 'cr', 5000000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-03-10', 'Program B Initiative – Funder B', 'Funder B', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'rc', 'temporarily_restricted', 'dr', 3000000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4100'), 'p', 221, 'g', 86, 'rc', 'temporarily_restricted', 'cr', 3000000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-04-08', 'Multi-Program Contract – first payment', 'Agency F', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'rc', 'temporarily_restricted', 'dr', 7500000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4300'), 'p', 220, 'g', 90, 'rc', 'temporarily_restricted', 'cr', 7500000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-08-12', 'Program C Expansion – Funder E', 'Funder E', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'rc', 'temporarily_restricted', 'dr', 2500000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4100'), 'p', 222, 'g', 89, 'rc', 'temporarily_restricted', 'cr', 2500000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-09-22', 'General Operating Support – Corp D', 'Corp D', 'manual', jsonb_build_array(
    jsonb_build_object('a', v_cash, 'p', 223, 'dr', 1000000),
    jsonb_build_object('a', pg_temp.acct(v_org,'4500'), 'p', 223, 'g', 88, 'cr', 1000000)));

  -- ---- individual donations
  FOR d, v IN SELECT * FROM (VALUES
      (DATE '2026-01-12', 185000), (DATE '2026-02-03', 240000), (DATE '2026-03-15', 310000), (DATE '2026-04-09', 127500),
      (DATE '2026-05-20', 450000), (DATE '2026-06-06', 210000), (DATE '2026-07-14', 165000), (DATE '2026-08-11', 290000),
      (DATE '2026-09-08', 520000), (DATE '2026-10-01', 110000)) q(dt, amt)
  LOOP
    PERFORM pg_temp.post(v_org, v_user, d, 'Individual donations', 'Individual donors', 'manual', jsonb_build_array(
      jsonb_build_object('a', v_cash, 'p', 224, 'dr', v),
      jsonb_build_object('a', pg_temp.acct(v_org,'4400'), 'p', 224, 'cr', v)));
  END LOOP;

  -- ---- monthly payroll Jan-Sep (program staff tagged to the grant that funds them) and recurring costs
  FOR m IN 1..9 LOOP
    d := (date_trunc('month', make_date(2026, m, 1)) + interval '1 month - 1 day')::date;
    PERFORM pg_temp.post(v_org, v_user, d, 'Payroll – ' || to_char(d, 'FMMonth YYYY'), 'Payroll provider', 'manual', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'5100'), 'p', 220, 'g', CASE WHEN m <= 3 THEN 87 ELSE 90 END, 'rc', 'temporarily_restricted', 'dr', 900000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5100'), 'p', 221, 'g', 86, 'rc', 'temporarily_restricted', 'dr', 700000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5100'), 'p', 222, 'g', 89, 'rc', 'temporarily_restricted', 'dr', 300000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5100'), 'p', 223, 'dr', 500000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5300'), 'p', 220, 'dr', 72000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5300'), 'p', 221, 'dr', 56000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5300'), 'p', 222, 'dr', 24000),
      jsonb_build_object('a', pg_temp.acct(v_org,'5300'), 'p', 223, 'dr', 40000),
      jsonb_build_object('a', v_cash, 'p', 223, 'rc', 'temporarily_restricted', 'cr', 1900000),
      jsonb_build_object('a', v_cash, 'p', 223, 'cr', 692000)));
    PERFORM pg_temp.post(v_org, v_user, d, 'Interest – money market', 'Bank', 'manual', jsonb_build_array(
      jsonb_build_object('a', v_mm, 'p', 223, 'dr', 18000),
      jsonb_build_object('a', pg_temp.acct(v_org,'4800'), 'p', 223, 'cr', 18000)));
  END LOOP;
  FOR m IN 1..10 LOOP
    PERFORM pg_temp.post(v_org, v_user, make_date(2026, m, 1), 'Office rent', 'Riverside Property Management', 'manual', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'7100'), 'p', 223, 'dr', 320000),
      jsonb_build_object('a', v_cash, 'p', 223, 'cr', 320000)));
    PERFORM pg_temp.post(v_org, v_user, LEAST(make_date(2026, m, 5), DATE '2026-10-02'), 'Software and subscriptions', 'Various', 'manual', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'7300'), 'p', 223, 'dr', 45000),
      jsonb_build_object('a', v_cash, 'p', 223, 'cr', 45000)));
  END LOOP;
  FOREACH d IN ARRAY ARRAY[DATE '2026-01-15', DATE '2026-04-15', DATE '2026-07-15'] LOOP
    PERFORM pg_temp.post(v_org, v_user, d, 'General liability insurance – quarterly', 'Insurance carrier', 'manual', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'7600'), 'p', 223, 'dr', 110000),
      jsonb_build_object('a', v_cash, 'p', 223, 'cr', 110000)));
  END LOOP;
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-03-20', 'Tax return preparation', 'Brightline CPA Group', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'8100'), 'p', 223, 'dr', 380000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 380000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-04-22', 'Staff training course', 'Training provider', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'6500'), 'p', 220, 'dr', 95000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 95000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-02-18', 'Program supplies', 'Clearwater Office Supply', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'6100'), 'p', 220, 'dr', 74000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 74000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-05-14', 'Program supplies', 'Clearwater Office Supply', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'6100'), 'p', 221, 'dr', 126000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 126000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-06-09', 'Mileage and travel', 'Staff reimbursement', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'6200'), 'p', 221, 'dr', 42000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 42000)));
  PERFORM pg_temp.post(v_org, v_user, DATE '2026-09-12', 'Fall appeal mailing', 'Print shop', 'manual', jsonb_build_array(
    jsonb_build_object('a', pg_temp.acct(v_org,'8400'), 'p', 224, 'dr', 135000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 135000)));

  -- ---- FY2025 closed (the books open on Jan 1 2026), so the dashboard doesn't flag it as unlocked
  INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at, locked_by_user_id)
    VALUES (v_org, 2025, TIMESTAMPTZ '2026-02-27 12:00:00+00', v_user)
    ON CONFLICT (org_id, fiscal_year) DO UPDATE SET locked_at = EXCLUDED.locked_at, locked_by_user_id = EXCLUDED.locked_by_user_id, reopened_at = NULL;

  -- ---- invoices (customers): one paid, one overdue, one open
  INSERT INTO org_invoices (org_id, constituent_id, invoice_date, due_date, reference, status, fiscal_year, created_by)
    VALUES (v_org, c_metro, DATE '2026-06-10', DATE '2026-07-10', 'WS-2026-06', 'paid', 2026, v_user) RETURNING id INTO i1;
  INSERT INTO org_invoices (org_id, constituent_id, invoice_date, due_date, reference, status, fiscal_year, created_by)
    VALUES (v_org, c_east, DATE '2026-08-20', DATE '2026-09-19', 'PO 44718', 'overdue', 2026, v_user) RETURNING id INTO i2;
  INSERT INTO org_invoices (org_id, constituent_id, invoice_date, due_date, reference, status, fiscal_year, created_by)
    VALUES (v_org, c_metro, DATE '2026-09-15', DATE '2026-10-15', 'WS-2026-09', 'sent', 2026, v_user) RETURNING id INTO i3;
  INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, quantity, unit_amount_cents) VALUES
    (i1, pg_temp.acct(v_org,'4600'), 221, 'Job-readiness workshop series', 1, 800000),
    (i2, pg_temp.acct(v_org,'4600'), 222, 'Staff training – fall session', 1, 450000),
    (i3, pg_temp.acct(v_org,'4600'), 221, 'Workshop series – fall cohort', 1, 1200000);
  UPDATE org_invoices SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-06-10', 'Invoice #' || i1 || ' (WS-2026-06)', 'Metro Workforce Board', 'invoice', jsonb_build_array(
      jsonb_build_object('a', v_ar, 'p', 221, 'dr', 800000), jsonb_build_object('a', pg_temp.acct(v_org,'4600'), 'p', 221, 'cr', 800000))) WHERE id = i1;
  UPDATE org_invoices SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-08-20', 'Invoice #' || i2 || ' (PO 44718)', 'Eastside Community College', 'invoice', jsonb_build_array(
      jsonb_build_object('a', v_ar, 'p', 222, 'dr', 450000), jsonb_build_object('a', pg_temp.acct(v_org,'4600'), 'p', 222, 'cr', 450000))) WHERE id = i2;
  UPDATE org_invoices SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-09-15', 'Invoice #' || i3 || ' (WS-2026-09)', 'Metro Workforce Board', 'invoice', jsonb_build_array(
      jsonb_build_object('a', v_ar, 'p', 221, 'dr', 1200000), jsonb_build_object('a', pg_temp.acct(v_org,'4600'), 'p', 221, 'cr', 1200000))) WHERE id = i3;
  INSERT INTO org_invoice_payments (org_id, invoice_id, bank_account_id, payment_date, amount_cents, reference, status, fiscal_year, created_by, ledger_transaction_id)
    VALUES (v_org, i1, v_cash, DATE '2026-07-02', 800000, 'EFT', 'posted', 2026, v_user,
      pg_temp.post(v_org, v_user, DATE '2026-07-02', 'Payment on invoice #' || i1, 'Metro Workforce Board', 'invoice_payment', jsonb_build_array(
        jsonb_build_object('a', v_cash, 'p', 223, 'dr', 800000), jsonb_build_object('a', v_ar, 'p', 221, 'cr', 800000))));

  -- ---- bills (vendors): one paid, one overdue, one open
  INSERT INTO org_bills (org_id, constituent_id, bill_date, due_date, reference, status, approved_by, approved_at, fiscal_year, created_by)
    VALUES (v_org, c_clear, DATE '2026-07-20', DATE '2026-08-19', 'CL-8841', 'paid', v_user, DATE '2026-07-21', 2026, v_user) RETURNING id INTO b3;
  INSERT INTO org_bills (org_id, constituent_id, bill_date, due_date, reference, status, approved_by, approved_at, fiscal_year, created_by)
    VALUES (v_org, c_bright, DATE '2026-09-05', DATE '2026-09-30', 'INV-2209', 'approved', v_user, DATE '2026-09-06', 2026, v_user) RETURNING id INTO b2;
  INSERT INTO org_bills (org_id, constituent_id, bill_date, due_date, reference, status, approved_by, approved_at, fiscal_year, created_by)
    VALUES (v_org, c_clear, DATE '2026-09-28', DATE '2026-10-28', 'CL-9017', 'approved', v_user, DATE '2026-09-29', 2026, v_user) RETURNING id INTO b1;
  INSERT INTO org_bill_lines (bill_id, account_id, program_id, amount_cents, line_memo) VALUES
    (b3, pg_temp.acct(v_org,'6100'), 220, 118000, 'Workshop materials'),
    (b2, pg_temp.acct(v_org,'8200'), 223, 250000, 'Quarterly bookkeeping review'),
    (b1, pg_temp.acct(v_org,'7200'), 223, 64000, 'Office supplies');
  UPDATE org_bills SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-07-20', 'Bill #' || b3, 'Clearwater Office Supply', 'bill_approval', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'6100'), 'p', 220, 'dr', 118000), jsonb_build_object('a', v_ap, 'p', 223, 'cr', 118000))) WHERE id = b3;
  UPDATE org_bills SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-09-05', 'Bill #' || b2, 'Brightline CPA Group', 'bill_approval', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'8200'), 'p', 223, 'dr', 250000), jsonb_build_object('a', v_ap, 'p', 223, 'cr', 250000))) WHERE id = b2;
  UPDATE org_bills SET ledger_transaction_id = pg_temp.post(v_org, v_user, DATE '2026-09-28', 'Bill #' || b1, 'Clearwater Office Supply', 'bill_approval', jsonb_build_array(
      jsonb_build_object('a', pg_temp.acct(v_org,'7200'), 'p', 223, 'dr', 64000), jsonb_build_object('a', v_ap, 'p', 223, 'cr', 64000))) WHERE id = b1;
  INSERT INTO org_bill_payments (org_id, bill_id, bank_account_id, payment_date, amount_cents, reference, status, fiscal_year, created_by, ledger_transaction_id)
    VALUES (v_org, b3, v_cash, DATE '2026-08-15', 118000, 'ACH', 'posted', 2026, v_user,
      pg_temp.post(v_org, v_user, DATE '2026-08-15', 'Payment on bill #' || b3, 'Clearwater Office Supply', 'bill_payment', jsonb_build_array(
        jsonb_build_object('a', v_ap, 'p', 223, 'dr', 118000), jsonb_build_object('a', v_cash, 'p', 223, 'cr', 118000))));
END
$seed$;
