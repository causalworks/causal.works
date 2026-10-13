-- Test org "Tidal Shift" section 2 of 3: ledger Jan 2025 - early Oct 2026, Gusto payroll, bills, invoices,
-- payments, bank rules and confirmed bank lines. Run after section 1. Re-runnable (clears the org's ledger first).
-- Entries are created by the admin (guy@causal.works) and approved by the finance member (gyacc@pm.me).
-- Bank lines dated after 2026-09-14 are left unconfirmed on purpose (nothing posted for them) for Cash Coding.

DO $seed$
DECLARE
  v_org int; v_guy int; v_fin int; v_cash int; v_cutoff date := DATE '2026-09-14';
  d date; m int; wk int; n int; gross bigint; fee bigint; net bigint; tid int; t2 int; rid int;
  pr record; run_no int := 0; fy int; ee_ct int; s_g bigint; s_t bigint; s_m bigint; s_fed bigint; s_fica bigint; s_st bigint;
  s_kee bigint; s_health bigint; s_net bigint; payd date; tax_total bigint; k_total bigint; lines jsonb;
  mon_k bigint := 0; mon_health bigint := 0; grp record;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  IF v_org IS NULL THEN RAISE EXCEPTION 'run section 1 first'; END IF;
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  SELECT id INTO v_fin FROM users WHERE email = 'gyacc@pm.me';

  CREATE TEMP TABLE _ctx AS SELECT v_org AS org, v_guy AS guy, v_fin AS fin;

  -- ---- clean previous run
  DELETE FROM org_fiscal_year_locks WHERE org_id = v_org;
  UPDATE org_bank_statement_lines SET ledger_transaction_id = NULL WHERE org_id = v_org;
  DELETE FROM org_bank_statement_lines WHERE org_id = v_org;
  DELETE FROM org_bank_rules WHERE org_id = v_org;
  DELETE FROM org_bill_payments WHERE org_id = v_org;
  DELETE FROM org_invoice_payments WHERE org_id = v_org;
  DELETE FROM org_bill_lines WHERE bill_id IN (SELECT id FROM org_bills WHERE org_id = v_org);
  DELETE FROM org_invoice_lines WHERE invoice_id IN (SELECT id FROM org_invoices WHERE org_id = v_org);
  DELETE FROM org_bills WHERE org_id = v_org;
  DELETE FROM org_invoices WHERE org_id = v_org;
  DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id = v_org);
  DELETE FROM org_ledger_transactions WHERE org_id = v_org;

  -- ---- helpers
  CREATE FUNCTION pg_temp.a(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_accounts WHERE org_id=(SELECT org FROM _ctx) AND code=c $f$;
  CREATE FUNCTION pg_temp.p(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_programs WHERE org_id=(SELECT org FROM _ctx) AND code=c $f$;
  CREATE FUNCTION pg_temp.g(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_grants WHERE org_id=(SELECT org FROM _ctx) AND grant_code=c $f$;
  CREATE FUNCTION pg_temp.c(nm text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_constituents WHERE org_id=(SELECT org FROM _ctx) AND display_name=nm $f$;
  CREATE FUNCTION pg_temp.rcg(gc text) RETURNS text LANGUAGE sql AS $f$
    SELECT CASE WHEN gc IS NULL THEN NULL WHEN (SELECT grant_type FROM org_grants WHERE org_id=(SELECT org FROM _ctx) AND grant_code=gc)='unrestricted' THEN NULL ELSE 'temporarily_restricted' END $f$;
  -- ledger line: account code, program code, grant code, debit, credit
  CREATE FUNCTION pg_temp.l(ac text, pc text, gc text, dr numeric, cr numeric) RETURNS jsonb LANGUAGE sql AS $f$
    SELECT jsonb_build_object('a', pg_temp.a(ac), 'p', pg_temp.p(pc), 'g', pg_temp.g(gc), 'rc', pg_temp.rcg(gc), 'dr', dr, 'cr', cr) $f$;
  CREATE FUNCTION pg_temp.post(d date, memo text, payee text, src text, lines jsonb, etype text DEFAULT NULL, reason text DEFAULT NULL,
      ref text DEFAULT NULL, st text DEFAULT 'posted') RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE tid int; cx record;
  BEGIN
    SELECT * INTO cx FROM _ctx;
    INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, payee, reference_number, status, source, entry_type,
        journal_reason, created_by, approved_by, approved_at)
      VALUES (cx.org, d, EXTRACT(year FROM d)::int, memo, payee, ref, st, src, etype, reason, cx.guy,
        CASE WHEN st = 'pending_approval' THEN NULL ELSE cx.fin END, CASE WHEN st = 'pending_approval' THEN NULL ELSE d::timestamptz END)
      RETURNING id INTO tid;
    INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, grant_id, donor_restriction_class, debit_cents, credit_cents, board_designation_id)
      SELECT tid, (x->>'a')::int, (x->>'p')::int, NULLIF(x->>'g','')::int, NULLIF(x->>'rc','')::org_restriction_class,
             COALESCE((x->>'dr')::bigint,0), COALESCE((x->>'cr')::bigint,0), NULLIF(x->>'bd','')::int
      FROM jsonb_array_elements(lines) x;
    RETURN tid;
  END $f$;
  -- bank statement line on the operating account; tid null = unconfirmed
  CREATE FUNCTION pg_temp.bank(d date, amt numeric, payee text, descr text, tid int DEFAULT NULL, rule int DEFAULT NULL) RETURNS void LANGUAGE sql AS $f$
    INSERT INTO org_bank_statement_lines (org_id, bank_account_id, statement_date, amount_cents, payee_raw, description_raw, import_fingerprint,
        status, ledger_transaction_id, coding_source, credit_debit_indicator, source, applied_rule_id)
    VALUES ((SELECT org FROM _ctx), pg_temp.a('1010'), d, abs(amt), payee, descr, md5(d::text||amt::text||descr||random()::text),
        CASE WHEN tid IS NULL THEN 'unconfirmed' ELSE 'confirmed' END, tid, CASE WHEN rule IS NULL THEN 'manual' ELSE 'rule' END,
        CASE WHEN amt >= 0 THEN 'credit' ELSE 'debit' END, 'csv', rule) $f$;
  CREATE FUNCTION pg_temp.rnd(seed text, lo int, hi int) RETURNS int LANGUAGE sql AS $f$ SELECT lo + (abs(hashtext(seed)) % (hi - lo + 1)) $f$;
  -- bill line / invoice line builders
  CREATE FUNCTION pg_temp.bl(ac text, pc text, gc text, amt numeric, memo text, r1099 bool DEFAULT false) RETURNS jsonb LANGUAGE sql AS $f$
    SELECT jsonb_build_object('a', ac, 'p', pc, 'g', gc, 'amt', amt, 'memo', memo, 'r', r1099) $f$;
  CREATE FUNCTION pg_temp.il(ac text, pc text, gc text, descr text, qty numeric, unit bigint, fmv bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $f$
    SELECT jsonb_build_object('a', ac, 'p', pc, 'g', gc, 'desc', descr, 'qty', qty, 'unit', unit, 'fmv', fmv) $f$;

  -- bill: posts AP at approval when status is approved/paid/scheduled; pays on paid_date
  CREATE FUNCTION pg_temp.bill(vendor text, bd date, due date, ref text, st text, lines jsonb, paid date DEFAULT NULL,
      rationale text DEFAULT NULL, sched date DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE cx record; bid int; tid int; ptid int; x jsonb; tot bigint := 0; fyr int := EXTRACT(year FROM bd)::int; ledgered bool; lns jsonb := '[]'::jsonb;
  BEGIN
    SELECT * INTO cx FROM _ctx;
    ledgered := st IN ('approved','paid','scheduled','partially_paid');
    INSERT INTO org_bills (org_id, constituent_id, bill_date, due_date, reference, status, approved_by, approved_at, fiscal_year, created_by,
        procurement_rationale, scheduled_payment_date)
      VALUES (cx.org, pg_temp.c(vendor), bd, due, ref, st, CASE WHEN ledgered THEN cx.fin END, CASE WHEN ledgered THEN (bd + 1)::timestamptz END, fyr, cx.guy, rationale, sched)
      RETURNING id INTO bid;
    FOR x IN SELECT * FROM jsonb_array_elements(lines) LOOP
      INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents, is_1099_reportable, line_memo)
        VALUES (bid, pg_temp.a(x->>'a'), pg_temp.p(x->>'p'), pg_temp.g(x->>'g'), (x->>'amt')::bigint, (x->>'r')::bool, x->>'memo');
      tot := tot + (x->>'amt')::bigint;
      lns := lns || pg_temp.l(x->>'a', x->>'p', x->>'g', (x->>'amt')::bigint, 0);
    END LOOP;
    IF ledgered THEN
      tid := pg_temp.post(bd + 1, 'Bill #' || bid || COALESCE(' (' || ref || ')', ''), vendor, 'bill_approval',
               lns || pg_temp.l('2010','MG',NULL,0,tot));
      UPDATE org_bills SET ledger_transaction_id = tid WHERE id = bid;
    END IF;
    IF paid IS NOT NULL THEN
      ptid := pg_temp.post(paid, 'Payment on bill #' || bid, vendor, 'bill_payment',
               jsonb_build_array(pg_temp.l('2010','MG',NULL,tot,0), pg_temp.l('1010','MG',NULL,0,tot)));
      INSERT INTO org_bill_payments (org_id, bill_id, bank_account_id, payment_date, amount_cents, reference, status, fiscal_year, created_by, ledger_transaction_id)
        VALUES (cx.org, bid, pg_temp.a('1010'), paid, tot, 'ACH', 'posted', EXTRACT(year FROM paid)::int, cx.guy, ptid);
      PERFORM pg_temp.bank(paid, -tot, upper(vendor), 'ACH PMT ' || upper(left(vendor, 18)) || ' ' || ref, ptid);
    END IF;
    RETURN bid;
  END $f$;
  -- invoice: AR at send; payment on paid_date
  CREATE FUNCTION pg_temp.inv(cust text, idt date, due date, ref text, st text, lines jsonb, paid date DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE cx record; iid int; tid int; ptid int; x jsonb; tot bigint := 0; lns jsonb := '[]'::jsonb; firstp text; ledgered bool;
  BEGIN
    SELECT * INTO cx FROM _ctx;
    ledgered := st <> 'draft';
    INSERT INTO org_invoices (org_id, constituent_id, invoice_date, due_date, reference, status, fiscal_year, created_by)
      VALUES (cx.org, pg_temp.c(cust), idt, due, ref, st, EXTRACT(year FROM idt)::int, cx.guy) RETURNING id INTO iid;
    FOR x IN SELECT * FROM jsonb_array_elements(lines) LOOP
      INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, quantity, unit_amount_cents, fair_market_value_cents)
        VALUES (iid, pg_temp.a(x->>'a'), pg_temp.p(x->>'p'), x->>'desc', (x->>'qty')::numeric, (x->>'unit')::bigint, NULLIF(x->>'fmv','')::bigint);
      tot := tot + ((x->>'qty')::numeric * (x->>'unit')::bigint)::bigint;
      lns := lns || pg_temp.l(x->>'a', x->>'p', x->>'g', 0, ((x->>'qty')::numeric * (x->>'unit')::bigint)::bigint);
      firstp := COALESCE(firstp, x->>'p');
    END LOOP;
    IF ledgered THEN
      tid := pg_temp.post(idt, 'Invoice #' || iid || COALESCE(' (' || ref || ')', ''), cust, 'invoice', pg_temp.l('1210', firstp, NULL, tot, 0) || lns);
      UPDATE org_invoices SET ledger_transaction_id = tid WHERE id = iid;
    END IF;
    IF paid IS NOT NULL THEN
      ptid := pg_temp.post(paid, 'Payment on invoice #' || iid, cust, 'invoice_payment',
               jsonb_build_array(pg_temp.l('1010','MG',NULL,tot,0), pg_temp.l('1210', firstp, NULL, 0, tot)));
      INSERT INTO org_invoice_payments (org_id, invoice_id, bank_account_id, payment_date, amount_cents, reference, status, fiscal_year, created_by, ledger_transaction_id)
        VALUES (cx.org, iid, pg_temp.a('1010'), paid, tot, 'EFT', 'posted', EXTRACT(year FROM paid)::int, cx.guy, ptid);
      PERFORM pg_temp.bank(paid, tot, upper(cust), 'EFT CREDIT ' || upper(left(cust, 20)) || ' ' || ref, ptid);
    END IF;
    RETURN iid;
  END $f$;

  v_cash := pg_temp.a('1010');

  -- ---- bank rules (priority order); payroll rules route Gusto debits to the clearing / liability accounts
  INSERT INTO org_bank_rules (org_id, name, priority, is_active, bank_account_id, payee_contains, direction, action_account_id, action_program_id, created_by) VALUES
    (v_org, 'Gusto net pay', 10, true, v_cash, 'GUSTO NET', 'debit', pg_temp.a('1060'), pg_temp.p('MG'), v_guy),
    (v_org, 'Gusto payroll taxes', 11, true, v_cash, 'GUSTO TAX', 'debit', pg_temp.a('2110'), pg_temp.p('MG'), v_guy),
    (v_org, 'Gusto 401(k) remittance', 12, true, v_cash, 'GUSTO 401K', 'debit', pg_temp.a('2120'), pg_temp.p('MG'), v_guy),
    (v_org, 'Gusto subscription fee', 13, true, v_cash, 'GUSTO FEE', 'debit', pg_temp.a('7310'), pg_temp.p('MG'), v_guy),
    (v_org, 'Rent - Cedar Street', 20, true, v_cash, 'CEDAR STREET', 'debit', pg_temp.a('7100'), pg_temp.p('MG'), v_guy),
    (v_org, 'Stripe payouts', 30, true, v_cash, 'STRIPE TRANSFER', 'credit', pg_temp.a('1050'), pg_temp.p('FR'), v_guy);

  -- ---- opening balances (2025-01-01)
  PERFORM pg_temp.post(DATE '2025-01-01', 'Opening balances', NULL, 'manual', jsonb_build_array(
    pg_temp.l('1010','MG',NULL,64000000,0), pg_temp.l('1030','MG',NULL,45000000,0) || jsonb_build_object('bd', (SELECT id FROM org_board_designations WHERE org_id=v_org AND name LIKE 'Operating Reserve%')),
    pg_temp.l('1040','MG',NULL,31000000,0), pg_temp.l('1045','MG',NULL,8500000,0), pg_temp.l('1330','MG',NULL,2200000,0),
    pg_temp.l('1410','MG',NULL,9500000,0), pg_temp.l('1420','MG',NULL,6000000,0), pg_temp.l('1490','MG',NULL,0,8800000),
    pg_temp.l('2400','MG',NULL,0,8500000),
    pg_temp.l('3100','MG',NULL,0,117900000) , pg_temp.l('3200','MG',NULL,0,31000000)), 'journal', 'Opening balances carried from prior-year audited statements');

  -- ---- restricted and unrestricted grant receipts
  FOR pr IN SELECT * FROM (VALUES
      (DATE '2025-01-14','Horizon Climate Foundation','Horizon Climate Foundation – litigation fund installment','1010','4110','LIT','HCF-2025',50000000::bigint,true),
      (DATE '2026-01-13','Horizon Climate Foundation','Horizon Climate Foundation – litigation fund installment','1010','4110','LIT','HCF-2025',50000000,true),
      (DATE '2025-02-03','Meridian Community Bank Foundation','Meridian Community Bank Foundation – operating support','1010','4130','MG',NULL,15000000,true),
      (DATE '2026-02-09','Meridian Community Bank Foundation','Meridian Community Bank Foundation – operating support','1010','4130','MG','MBF-2026',15000000,true),
      (DATE '2025-01-22','Greenfield Community Foundation','Greenfield – Fenceline Communities Fund, 2025 first half','1010','4110','FCP','GCF-2026',15000000,true),
      (DATE '2025-07-16','Greenfield Community Foundation','Greenfield – Fenceline Communities Fund, 2025 second half','1010','4110','FCP','GCF-2026',15000000,true),
      (DATE '2026-01-20','Greenfield Community Foundation','Greenfield – Fenceline Communities Fund, 2026 first half','1010','4110','FCP','GCF-2026',20000000,true),
      (DATE '2026-07-14','Greenfield Community Foundation','Greenfield – Fenceline Communities Fund, 2026 second half','1010','4110','FCP','GCF-2026',20000000,true),
      (DATE '2025-01-08','State Access to Justice Commission','A2J IOLTA grant 2025 – Q1','1010','4100','CLC','A2J-2026',7500000,true),
      (DATE '2025-04-08','State Access to Justice Commission','A2J IOLTA grant 2025 – Q2','1010','4100','CLC','A2J-2026',7500000,true),
      (DATE '2025-07-08','State Access to Justice Commission','A2J IOLTA grant 2025 – Q3','1010','4100','CLC','A2J-2026',7500000,true),
      (DATE '2025-10-08','State Access to Justice Commission','A2J IOLTA grant 2025 – Q4','1010','4100','CLC','A2J-2026',7500000,true),
      (DATE '2026-01-08','State Access to Justice Commission','A2J IOLTA grant 2026 – Q1','1010','4100','CLC','A2J-2026',8750000,true),
      (DATE '2026-04-08','State Access to Justice Commission','A2J IOLTA grant 2026 – Q2','1010','4100','CLC','A2J-2026',8750000,true),
      (DATE '2026-07-08','State Access to Justice Commission','A2J IOLTA grant 2026 – Q3','1010','4100','CLC','A2J-2026',8750000,true),
      (DATE '2026-03-12','Civic Voice Fund','Civic Voice Fund – legislative campaign first payment','1010','4110','POL','CVF-2026',15000000,true)
    ) q(dt,funder,memo,cashac,revac,prog,gcode,amt,bk) LOOP
    tid := pg_temp.post(pr.dt, pr.memo, pr.funder, 'manual', jsonb_build_array(
      pg_temp.l(pr.cashac,'MG',pr.gcode,pr.amt,0) , pg_temp.l(pr.revac, pr.prog, pr.gcode, 0, pr.amt)), 'receive');
    IF pr.bk THEN PERFORM pg_temp.bank(pr.dt, pr.amt, pr.funder, 'ACH CREDIT ' || upper(left(pr.funder, 22)), tid); END IF;
  END LOOP;

  -- ---- EPA federal pass-through reimbursements (quarterly invoices; Q2 2026 is overdue)
  PERFORM pg_temp.inv('State Department of Environmental Quality', DATE '2025-09-30', DATE '2025-10-30', 'EPA-Q3-25', 'paid',
    jsonb_build_array(pg_temp.il('4100','FCP-AIR','EPA-2025','EPA pass-through reimbursement, Jul-Sep 2025',1,13125000)), DATE '2025-11-07');
  PERFORM pg_temp.inv('State Department of Environmental Quality', DATE '2025-12-31', DATE '2026-01-30', 'EPA-Q4-25', 'paid',
    jsonb_build_array(pg_temp.il('4100','FCP-AIR','EPA-2025','EPA pass-through reimbursement, Oct-Dec 2025',1,13125000)), DATE '2026-02-09');
  PERFORM pg_temp.inv('State Department of Environmental Quality', DATE '2026-03-31', DATE '2026-04-30', 'EPA-Q1-26', 'paid',
    jsonb_build_array(pg_temp.il('4100','FCP-AIR','EPA-2025','EPA pass-through reimbursement, Jan-Mar 2026',1,13125000)), DATE '2026-05-12');
  PERFORM pg_temp.inv('State Department of Environmental Quality', DATE '2026-06-30', DATE '2026-07-30', 'EPA-Q2-26', 'overdue',
    jsonb_build_array(pg_temp.il('4100','FCP-AIR','EPA-2025','EPA pass-through reimbursement, Apr-Jun 2026',1,13125000)));
  PERFORM pg_temp.inv('State Department of Environmental Quality', DATE '2026-09-30', DATE '2026-10-30', 'EPA-Q3-26', 'sent',
    jsonb_build_array(pg_temp.il('4100','FCP-AIR','EPA-2025','EPA pass-through reimbursement, Jul-Sep 2026',1,13125000)));
  -- CLE training to the law school clinic (quarterly), co-counsel fee share
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-03-15', DATE '2026-09-15', interval '3 months') dt LOOP
    PERFORM pg_temp.inv('Harbor Law School Clinic', pr.dt, (pr.dt + 30), 'CLE-' || to_char(pr.dt,'YYMM'),
      CASE WHEN pr.dt >= DATE '2026-09-01' THEN 'sent' ELSE 'paid' END,
      jsonb_build_array(pg_temp.il('4220','CLC',NULL,'Supervised clinic training – quarter',1,1200000)),
      CASE WHEN pr.dt >= DATE '2026-09-01' THEN NULL ELSE pr.dt + 38 END);
  END LOOP;
  PERFORM pg_temp.inv('Okafor & Lindqvist LLP (co-counsel)', DATE '2026-05-20', DATE '2026-06-19', 'FEESHARE-0526', 'paid',
    jsonb_build_array(pg_temp.il('4200','LIT-PERMIT',NULL,'Fee share – Bayou chemical plant permit case settlement',1,2200000)), DATE '2026-06-25');
  -- gala sponsorship invoices: quid-pro-quo (benefit value vs. contribution portion)
  PERFORM pg_temp.inv('Meridian Community Bank Foundation', DATE '2026-03-20', DATE '2026-04-19', 'GALA-SPON-26', 'paid',
    jsonb_build_array(pg_temp.il('4160','FR',NULL,'Gala table sponsorship (table of 10, dinner and program)',1,1500000,300000)), DATE '2026-04-08');

  -- ---- fee awards, client fees, interest, major gifts, gala
  PERFORM pg_temp.bank(DATE '2025-09-18', 6400000, 'COURT REGISTRY', 'WIRE IN COURT REGISTRY FEE AWARD',
    pg_temp.post(DATE '2025-09-18', 'Court-awarded attorney fees – Ridgeline petrochemical permit case', 'Court registry', 'manual',
      jsonb_build_array(pg_temp.l('1010','MG',NULL,6400000,0), pg_temp.l('4200','LIT-REG',NULL,0,6400000)), 'receive'));
  PERFORM pg_temp.post(DATE '2026-08-12', 'Court order awarding fees – Bayou chemical plant permit case (receivable)', 'Court order', 'manual',
    jsonb_build_array(pg_temp.l('1230','LIT-PERMIT',NULL,3800000,0), pg_temp.l('4200','LIT-PERMIT',NULL,0,3800000)), 'journal',
    'Court order dated 2026-08-10 awards fees of $38,000; collection expected within 90 days. Recorded as a receivable.');
  FOR pr IN SELECT (date_trunc('month', dt) + interval '1 month - 1 day')::date AS dt FROM generate_series(DATE '2025-01-01', DATE '2026-09-01', interval '1 month') dt LOOP
    gross := pg_temp.rnd('cf' || pr.dt, 180000, 410000);
    tid := pg_temp.post(pr.dt, 'Sliding-scale client fees', 'Clients', 'manual',
      jsonb_build_array(pg_temp.l('1010','MG',NULL,gross,0), pg_temp.l('4210','CLC',NULL,0,gross)), 'receive');
    PERFORM pg_temp.bank(pr.dt, gross, 'CLIENT FEES', 'MOBILE DEPOSIT CLIENT FEES', tid);
    fee := pg_temp.rnd('int' || pr.dt, 110000, 170000);
    PERFORM pg_temp.post(pr.dt, 'Interest – reserve savings', 'Bank', 'manual',
      jsonb_build_array(pg_temp.l('1030','MG',NULL,fee,0), pg_temp.l('4300','MG',NULL,0,fee)));
    gross := pg_temp.rnd('chk' || pr.dt, 800000, CASE WHEN extract(month from pr.dt) = 12 THEN 6500000 ELSE 2600000 END);
    tid := pg_temp.post(pr.dt - 2, 'Mailed donation checks deposit', 'Individual donors', 'manual',
      jsonb_build_array(pg_temp.l('1010','FR',NULL,gross,0), pg_temp.l('4140','FR',NULL,0,gross)), 'receive');
    PERFORM pg_temp.bank(pr.dt - 2, gross, 'DEPOSIT', 'CHECK DEPOSIT #' || (1000 + extract(month from pr.dt)::int), CASE WHEN pr.dt - 2 > v_cutoff THEN NULL ELSE tid END);
    IF pr.dt - 2 > v_cutoff THEN DELETE FROM org_ledger_lines WHERE transaction_id = tid; DELETE FROM org_ledger_transactions WHERE id = tid; END IF;
  END LOOP;
  FOR pr IN SELECT * FROM (VALUES
      (DATE '2025-03-06','Board member gift',7500000::bigint),(DATE '2025-06-27','Anonymous major gift',12500000),(DATE '2025-12-22','Year-end major gift – family foundation',20000000),
      (DATE '2026-03-04','Board member gift',7500000),(DATE '2026-06-26','Major gift – charitable trust',10000000),(DATE '2026-09-10','Major gift – board member',15000000)) q(dt,memo,amt) LOOP
    tid := pg_temp.post(pr.dt, pr.memo, NULL, 'manual', jsonb_build_array(pg_temp.l('1010','FR',NULL,pr.amt,0), pg_temp.l('4150','FR',NULL,0,pr.amt)), 'receive');
    PERFORM pg_temp.bank(pr.dt, pr.amt, 'WIRE IN', 'WIRE IN ' || upper(left(pr.memo, 22)), tid);
  END LOOP;
  FOR pr IN SELECT * FROM (VALUES (DATE '2025-05-17', 21000000::bigint), (DATE '2026-05-16', 24500000::bigint)) q(dt,amt) LOOP
    tid := pg_temp.post(pr.dt + 2, 'Annual gala receipts', 'Gala', 'manual',
      jsonb_build_array(pg_temp.l('1010','FR',NULL,pr.amt,0), pg_temp.l('4160','FR',NULL,0,pr.amt)), 'receive');
    PERFORM pg_temp.bank(pr.dt + 2, pr.amt, 'GALA PROCEEDS', 'DEPOSIT GALA PROCEEDS', tid);
  END LOOP;

  -- ---- online donations through Stripe: gross to clearing weekly, payout (net of fees) midweek
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-01-06', DATE '2026-09-28', interval '1 week') dt LOOP
    gross := pg_temp.rnd('st' || pr.dt, 450000, 1300000) * CASE WHEN extract(month from pr.dt) = 12 THEN 3 ELSE 1 END;
    PERFORM pg_temp.post(pr.dt, 'Online donations – week of ' || to_char(pr.dt,'Mon DD'), 'Stripe', 'manual',
      jsonb_build_array(pg_temp.l('1050','FR',NULL,gross,0), pg_temp.l('4140','FR',NULL,0,gross)));
    fee := round(gross * 0.029) + 30 * pg_temp.rnd('n' || pr.dt, 6, 24);
    net := gross - fee;
    IF pr.dt + 2 <= v_cutoff THEN
      tid := pg_temp.post(pr.dt + 2, 'Stripe payout', 'Stripe', 'bank_reconciliation',
        jsonb_build_array(pg_temp.l('1010','MG',NULL,net,0), pg_temp.l('8300','FR',NULL,fee,0), pg_temp.l('1050','FR',NULL,0,gross)));
      PERFORM pg_temp.bank(pr.dt + 2, net, 'STRIPE', 'STRIPE TRANSFER ST-' || to_char(pr.dt,'YYMMDD'), tid, (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Stripe payouts'));
    ELSE
      PERFORM pg_temp.bank(pr.dt + 2, net, 'STRIPE', 'STRIPE TRANSFER ST-' || to_char(pr.dt,'YYMMDD'));
    END IF;
  END LOOP;

  -- ---- staff payroll through Gusto: one journal per pay run; Gusto then debits net pay, taxes, 401k, and a fee
  CREATE TEMP TABLE _paygrant (nm text, prog text, gcode text, from_d date) ON COMMIT DROP;
  INSERT INTO _paygrant VALUES
    ('Anika Rao','LIT-PERMIT','HCF-2025','2025-01-01'),('Lena Whitaker','LIT-PERMIT','HCF-2025','2025-01-01'),('David Kessler','LIT-REG','HCF-2025','2025-01-01'),
    ('Michael Odum','CLC','A2J-2026','2026-01-01'),('Hannah Brooks','CLC','A2J-2026','2026-01-01'),('Ines Duarte','CLC','A2J-2026','2026-01-01'),
    ('Tariq Hussain','FCP-AIR','EPA-2025','2025-07-01'),('Yusuf Demir','FCP-AIR','EPA-2025','2025-07-01'),('Sofia Mendes','FCP','GCF-2026','2026-01-01'),('Grace Liu','FCP','GCF-2026','2026-01-01'),('Carla Jimenez','FCP','GCF-2026','2026-01-01'),
    ('Maya Thompson','POL-LEG','CVF-2026','2026-03-01'),('Ravi Patel','POL','CVF-2026','2026-03-01'),('Walter Fenn','POL-LEG','CVF-2026','2026-03-01');

  FOR pr IN SELECT dt::date AS dt FROM (
      SELECT (make_date(y, mo, 15)) AS dt FROM generate_series(2025, 2026) y, generate_series(1, 12) mo
      UNION ALL SELECT ((make_date(y, mo, 1) + interval '1 month - 1 day')::date) FROM generate_series(2025, 2026) y, generate_series(1, 12) mo) s
      WHERE dt <= DATE '2026-09-30' ORDER BY dt LOOP
    d := pr.dt; run_no := run_no + 1; fy := extract(year FROM d)::int;
    CREATE TEMP TABLE _run ON COMMIT DROP AS SELECT 1 WHERE false;
    DROP TABLE _run;
    CREATE TEMP TABLE _run AS
      SELECT a.account_id, pg.id AS program_id, pc.code AS pcode, COALESCE(gm.gcode, NULL) AS gcode,
             sum(round(p.annual_salary_cents / 24.0 * al.percent_bps / 10000.0))::bigint AS gc
      FROM org_personnel p
      JOIN org_personnel_allocations al ON al.coop_personnel_id = p.id
      JOIN org_programs pg ON pg.id = al.coop_program_id
      JOIN org_programs pc ON pc.id = pg.id
      JOIN LATERAL (SELECT p.salary_account_id AS account_id) a ON true
      LEFT JOIN _paygrant gm ON gm.nm = p.full_name AND gm.prog = pg.code AND gm.from_d <= d
      WHERE p.org_id = v_org AND p.fiscal_year = fy
      GROUP BY 1, 2, 3, 4;
    SELECT sum(gc) INTO s_g FROM _run;
    SELECT count(*) INTO ee_ct FROM org_personnel WHERE org_id = v_org AND fiscal_year = fy;
    s_t := round(s_g * 0.0825); s_m := round(s_g * 0.03);
    s_fed := round(s_g * 0.14); s_fica := round(s_g * 0.0765); s_st := round(s_g * 0.045); s_kee := round(s_g * 0.04);
    s_health := ee_ct * 7500; s_net := s_g - s_fed - s_fica - s_st - s_kee - s_health;
    lines := '[]'::jsonb;
    FOR grp IN SELECT * FROM _run LOOP
      lines := lines || jsonb_build_object('a', grp.account_id, 'p', grp.program_id, 'g', pg_temp.g(grp.gcode), 'rc', pg_temp.rcg(grp.gcode), 'dr', grp.gc, 'cr', 0)
                     || jsonb_build_object('a', pg_temp.a('6300'), 'p', grp.program_id, 'g', pg_temp.g(grp.gcode), 'rc', pg_temp.rcg(grp.gcode), 'dr', round(grp.gc * 0.0825), 'cr', 0)
                     || jsonb_build_object('a', pg_temp.a('6500'), 'p', grp.program_id, 'g', pg_temp.g(grp.gcode), 'rc', pg_temp.rcg(grp.gcode), 'dr', round(grp.gc * 0.03), 'cr', 0);
    END LOOP;
    -- rounding: the per-group employer taxes/match may differ from the totals by a few cents; recompute from groups
    SELECT sum(round(gc * 0.0825)), sum(round(gc * 0.03)) INTO s_t, s_m FROM _run;
    s_net := s_g - s_fed - s_fica - s_st - s_kee - s_health;
    lines := lines || pg_temp.l('1060','MG',NULL,0,s_net)
                   || pg_temp.l('2110','MG',NULL,0,s_fed + s_fica + s_st + s_t)
                   || pg_temp.l('2120','MG',NULL,0,s_kee + s_m)
                   || pg_temp.l('2130','MG',NULL,0,s_health);
    tid := pg_temp.post(d, 'Gusto payroll – pay date ' || to_char(d,'YYYY-MM-DD'), 'Gusto', 'manual', (
      -- jsonb arrays built with || above on objects: wrap into one array
      SELECT jsonb_agg(e) FROM (SELECT jsonb_array_elements(
        (SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(lines) x) q)) e) w), 'journal',
      'Gusto payroll register: gross wages, employer taxes and match; net pay to clearing', 'GUSTO-' || lpad(run_no::text, 3, '0'));
    -- Gusto's bank debits (net pay and taxes two days before pay date; 401k with the second run of the month)
    payd := d - 2;
    tax_total := s_fed + s_fica + s_st + s_t;
    IF payd <= v_cutoff THEN
      t2 := pg_temp.post(payd, 'Gusto net pay debit', 'Gusto', 'bank_reconciliation', jsonb_build_array(pg_temp.l('1060','MG',NULL,s_net,0), pg_temp.l('1010','MG',NULL,0,s_net)));
      PERFORM pg_temp.bank(payd, -s_net, 'GUSTO', 'GUSTO NET 4821' || lpad(run_no::text, 4, '0'), t2, (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Gusto net pay'));
      t2 := pg_temp.post(payd, 'Gusto payroll tax debit', 'Gusto', 'bank_reconciliation', jsonb_build_array(pg_temp.l('2110','MG',NULL,tax_total,0), pg_temp.l('1010','MG',NULL,0,tax_total)));
      PERFORM pg_temp.bank(payd, -tax_total, 'GUSTO', 'GUSTO TAX 4821' || lpad(run_no::text, 4, '0'), t2, (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Gusto payroll taxes'));
    ELSE
      PERFORM pg_temp.bank(payd, -s_net, 'GUSTO', 'GUSTO NET 4821' || lpad(run_no::text, 4, '0'));
      PERFORM pg_temp.bank(payd, -tax_total, 'GUSTO', 'GUSTO TAX 4821' || lpad(run_no::text, 4, '0'));
    END IF;
    mon_k := mon_k + s_kee + s_m; mon_health := mon_health + s_health;
    IF extract(day FROM d) > 15 THEN
      -- month end: remit 401k, pay the health premium (employer share + employee deductions), Gusto fee
      IF d <= v_cutoff THEN
        t2 := pg_temp.post(d + 1, 'Gusto 401(k) remittance', 'Gusto', 'bank_reconciliation', jsonb_build_array(pg_temp.l('2120','MG',NULL,mon_k,0), pg_temp.l('1010','MG',NULL,0,mon_k)));
        PERFORM pg_temp.bank(d + 1, -mon_k, 'GUSTO', 'GUSTO 401K ' || to_char(d,'MonYY'), t2, (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Gusto 401(k) remittance'));
        fee := 4000 + ee_ct * 600;
        t2 := pg_temp.post(d + 1, 'Gusto subscription fee', 'Gusto', 'bank_reconciliation', jsonb_build_array(pg_temp.l('7310','MG',NULL,fee,0), pg_temp.l('1010','MG',NULL,0,fee)));
        PERFORM pg_temp.bank(d + 1, -fee, 'GUSTO', 'GUSTO FEE ' || to_char(d,'MonYY'), t2, (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Gusto subscription fee'));
        net := ee_ct * 100000; -- employer health share
        SELECT jsonb_agg(jsonb_build_object('a', pg_temp.a('6400'), 'p', program_id, 'g', NULL, 'dr', round(net * gc::numeric / s_g), 'cr', 0))
          INTO lines FROM _run;
        t2 := pg_temp.post(d + 2, 'Health insurance premium – Blue Horizon', 'Blue Horizon Health', 'bank_reconciliation', (
          SELECT jsonb_agg(e) FROM (
            SELECT e FROM jsonb_array_elements(lines) e
            UNION ALL SELECT pg_temp.l('2130','MG',NULL,mon_health,0)
            UNION ALL SELECT pg_temp.l('1010','MG',NULL,0,
                ((SELECT sum((e->>'dr')::bigint) FROM jsonb_array_elements(lines) e) + mon_health)::bigint)) u));
        PERFORM pg_temp.bank(d + 2, -((SELECT sum(credit_cents) FROM org_ledger_lines WHERE transaction_id = t2 AND account_id = pg_temp.a('1010'))::numeric), 'BLUE HORIZON HEALTH', 'BLUE HORIZON PREMIUM ' || to_char(d,'MonYY'), t2);
      ELSE
        PERFORM pg_temp.bank(d + 1, -mon_k, 'GUSTO', 'GUSTO 401K ' || to_char(d,'MonYY'));
        PERFORM pg_temp.bank(d + 1, -(4000 + ee_ct * 600), 'GUSTO', 'GUSTO FEE ' || to_char(d,'MonYY'));
      END IF;
      mon_k := 0; mon_health := 0;
    END IF;
    DROP TABLE _run;
  END LOOP;

  -- ---- rent (split across programs), utilities, phone, insurance, bar dues, equipment
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-01-01', DATE '2026-10-01', interval '1 month') dt LOOP
    gross := CASE WHEN pr.dt < DATE '2025-07-01' THEN 1450000 ELSE 1500000 END;
    tid := NULL;
    IF pr.dt <= v_cutoff THEN
      tid := pg_temp.post(pr.dt, 'Office rent – Cedar Street Properties', 'Cedar Street Properties', 'bank_reconciliation', jsonb_build_array(
        pg_temp.l('7100','MG',NULL,round(gross*0.20),0), pg_temp.l('7100','LIT',NULL,round(gross*0.25),0), pg_temp.l('7100','FCP',NULL,round(gross*0.20),0),
        pg_temp.l('7100','CLC',NULL,round(gross*0.15),0), pg_temp.l('7100','POL',NULL,round(gross*0.10),0),
        pg_temp.l('7100','FR',NULL,gross - round(gross*0.20) - round(gross*0.25) - round(gross*0.20) - round(gross*0.15) - round(gross*0.10),0),
        pg_temp.l('1010','MG',NULL,0,gross)));
    END IF;
    PERFORM pg_temp.bank(pr.dt, -gross, 'CEDAR STREET PROPERTIES', 'CEDAR STREET PROPERTIES RENT ' || to_char(pr.dt,'MonYY'), tid, CASE WHEN tid IS NULL THEN NULL ELSE (SELECT id FROM org_bank_rules WHERE org_id=v_org AND name='Rent - Cedar Street') END);
    IF pr.dt + 8 <= v_cutoff THEN
      gross := pg_temp.rnd('ut' || pr.dt, 105000, 168000);
      tid := pg_temp.post(pr.dt + 8, 'Utilities', 'City Power & Water', 'bank_reconciliation', jsonb_build_array(pg_temp.l('7110','MG',NULL,gross,0), pg_temp.l('1010','MG',NULL,0,gross)));
      PERFORM pg_temp.bank(pr.dt + 8, -gross, 'CITY POWER & WATER', 'CITY POWER WATER AUTOPAY', tid);
      tid := pg_temp.post(pr.dt + 10, 'Phone and internet', 'Metro Fiber', 'bank_reconciliation', jsonb_build_array(pg_temp.l('7320','MG',NULL,78400,0), pg_temp.l('1010','MG',NULL,0,78400)));
      PERFORM pg_temp.bank(pr.dt + 10, -78400, 'METRO FIBER', 'METRO FIBER SERVICES', tid);
    END IF;
  END LOOP;
  -- insurance: annual premium billed to prepaid, amortized monthly
  PERFORM pg_temp.bill('Lakeshore Insurance Brokers', DATE '2025-01-10', DATE '2025-02-09', 'LK-2025-ANN', 'paid',
    jsonb_build_array(pg_temp.bl('1310','MG',NULL,4200000,'Annual premium: liability, D&O, malpractice')), DATE '2025-01-30');
  PERFORM pg_temp.bill('Lakeshore Insurance Brokers', DATE '2026-01-12', DATE '2026-02-11', 'LK-2026-ANN', 'paid',
    jsonb_build_array(pg_temp.bl('1310','MG',NULL,4440000,'Annual premium: liability, D&O, malpractice')), DATE '2026-01-28');
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-01-31', DATE '2026-09-30', interval '1 month') dt LOOP
    gross := CASE WHEN extract(year FROM pr.dt) = 2025 THEN 350000 ELSE 370000 END;
    PERFORM pg_temp.post((date_trunc('month', pr.dt) + interval '1 month - 1 day')::date, 'Insurance amortization', NULL, 'manual', jsonb_build_array(
      pg_temp.l('7400','MG',NULL,gross,0), pg_temp.l('1310','MG',NULL,0,gross)), 'journal', 'Monthly amortization of annual insurance premium');
  END LOOP;
  FOR pr IN SELECT * FROM (VALUES (DATE '2025-01-15', 680000::bigint), (DATE '2026-01-14', 710000::bigint)) q(dt,amt) LOOP
    tid := pg_temp.post(pr.dt, 'Annual bar dues and licenses', 'State Bar', 'bank_reconciliation', jsonb_build_array(
      pg_temp.l('7710','LIT',NULL,round(pr.amt*0.45),0), pg_temp.l('7710','FCP',NULL,round(pr.amt*0.30),0), pg_temp.l('7710','CLC',NULL,pr.amt - round(pr.amt*0.45) - round(pr.amt*0.30),0),
      pg_temp.l('1010','MG',NULL,0,pr.amt)));
    PERFORM pg_temp.bank(pr.dt, -pr.amt, 'STATE BAR', 'STATE BAR ANNUAL DUES', tid);
  END LOOP;
  tid := pg_temp.post(DATE '2025-03-12', 'Laptops (14) – replacement cycle', 'Dell', 'bank_reconciliation', jsonb_build_array(pg_temp.l('1420','MG',NULL,2840000,0), pg_temp.l('1010','MG',NULL,0,2840000)));
  PERFORM pg_temp.bank(DATE '2025-03-12', -2840000, 'DELL', 'DELL BUSINESS 55812', tid);

  -- ---- recurring bills: IT support and legal research, monthly
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-01-05', DATE '2026-09-05', interval '1 month') dt LOOP
    PERFORM pg_temp.bill('NorthStar IT Services', pr.dt, pr.dt + 30, 'NS-' || to_char(pr.dt,'YYMM'), 'paid',
      jsonb_build_array(pg_temp.bl('7300','MG',NULL,340000,'Managed IT support and licenses')), pr.dt + 28);
    PERFORM pg_temp.bill('Westlaw Research Services', pr.dt + 3, pr.dt + 33, 'WL-' || to_char(pr.dt,'YYMM'), 'paid',
      jsonb_build_array(pg_temp.bl('6750','LIT',NULL,177000,'Research subscription – litigation'), pg_temp.bl('6750','FCP',NULL,118000,'Research subscription – frontline communities')),
      pr.dt + 30);
  END LOOP;
  -- an October Westlaw bill scheduled, a duplicate NorthStar bill voided
  PERFORM pg_temp.bill('Westlaw Research Services', DATE '2026-10-02', DATE '2026-11-01', 'WL-2610', 'scheduled',
    jsonb_build_array(pg_temp.bl('6750','LIT',NULL,177000,'Research subscription – litigation'), pg_temp.bl('6750','FCP',NULL,118000,'Research subscription – frontline communities')), NULL, NULL, DATE '2026-10-28');
  PERFORM pg_temp.bill('NorthStar IT Services', DATE '2026-05-15', DATE '2026-06-14', 'NS-2605-DUP', 'void',
    jsonb_build_array(pg_temp.bl('7300','MG',NULL,340000,'Duplicate of NS-2605')));

  -- ---- one-off bills (litigation costs, experts, interpreters, audit, mail, events, advocacy, subgrants)
  FOR pr IN SELECT * FROM (VALUES
      ('Precision Court Reporting',DATE '2025-02-20','PCR-4412',480000::bigint),('Precision Court Reporting',DATE '2025-06-12','PCR-4520',620000),
      ('Precision Court Reporting',DATE '2025-10-08','PCR-4633',390000),('Precision Court Reporting',DATE '2026-02-18','PCR-4781',710000)) q(v,dt,ref,amt) LOOP
    PERFORM pg_temp.bill(pr.v, pr.dt, pr.dt + 30, pr.ref, 'paid', jsonb_build_array(pg_temp.bl('6720','LIT-PERMIT','HCF-2025',pr.amt,'Deposition transcripts',true)), pr.dt + 27);
  END LOOP;
  PERFORM pg_temp.bill('Precision Court Reporting', DATE '2026-07-22', DATE '2026-08-21', 'PCR-4902', 'approved',
    jsonb_build_array(pg_temp.bl('6720','LIT-PERMIT','HCF-2025',540000,'Hearing transcripts',true)));
  PERFORM pg_temp.bill('Dr. Elena Marchetti, Atmospheric Scientist', DATE '2025-04-02', DATE '2025-05-02', 'EM-001', 'paid', jsonb_build_array(pg_temp.bl('6210','LIT-PERMIT','HCF-2025',1850000,'Expert report phase 1',true)), DATE '2025-04-28');
  PERFORM pg_temp.bill('Dr. Elena Marchetti, Atmospheric Scientist', DATE '2025-11-14', DATE '2025-12-14', 'EM-002', 'paid', jsonb_build_array(pg_temp.bl('6210','LIT-PERMIT','HCF-2025',2200000,'Expert report phase 2',true)), DATE '2025-12-10');
  PERFORM pg_temp.bill('Dr. Elena Marchetti, Atmospheric Scientist', DATE '2026-04-30', DATE '2026-05-30', 'EM-003', 'paid', jsonb_build_array(pg_temp.bl('6210','LIT-PERMIT','HCF-2025',2650000,'Trial testimony preparation',true)), DATE '2026-05-26');
  PERFORM pg_temp.bill('Dr. Elena Marchetti, Atmospheric Scientist', DATE '2026-09-02', DATE '2026-10-02', 'EM-004', 'approved', jsonb_build_array(pg_temp.bl('6210','LIT-PERMIT','HCF-2025',1980000,'Rebuttal report',true)));
  FOR pr IN SELECT dt::date AS dt FROM generate_series(DATE '2025-03-31', DATE '2026-06-30', interval '3 months') dt LOOP
    PERFORM pg_temp.bill('Lingua Bridge Interpreters', (date_trunc('month', pr.dt) + interval '1 month - 1 day')::date, pr.dt + 30, 'LB-' || to_char(pr.dt,'YYMM'), 'paid',
      jsonb_build_array(pg_temp.bl('6730','FCP',CASE WHEN pr.dt >= DATE '2026-01-01' THEN 'GCF-2026' END,pg_temp.rnd('lb' || pr.dt, 320000, 580000),'Interpretation for community meetings and hearings',true)), pr.dt + 33);
  END LOOP;
  PERFORM pg_temp.bill('Lingua Bridge Interpreters', DATE '2026-09-30', DATE '2026-10-30', 'LB-2609', 'pending_approval', jsonb_build_array(pg_temp.bl('6730','FCP','GCF-2026',520000,'Interpretation Q3',true)));
  PERFORM pg_temp.bill('Brightline CPA Group', DATE '2025-03-10', DATE '2025-04-09', 'BL-A1', 'paid', jsonb_build_array(pg_temp.bl('8100','MG',NULL,850000,'FY2024 audit – progress billing')), DATE '2025-04-04');
  PERFORM pg_temp.bill('Brightline CPA Group', DATE '2025-04-15', DATE '2025-05-15', 'BL-A2', 'paid', jsonb_build_array(pg_temp.bl('8100','MG',NULL,1400000,'FY2024 audit and Form 990 review')), DATE '2025-05-09');
  PERFORM pg_temp.bill('Brightline CPA Group', DATE '2026-03-12', DATE '2026-04-11', 'BL-B1', 'paid', jsonb_build_array(pg_temp.bl('8100','MG',NULL,900000,'FY2025 audit – progress billing; includes Single Audit scope')), DATE '2026-04-06');
  PERFORM pg_temp.bill('Brightline CPA Group', DATE '2026-04-20', DATE '2026-05-20', 'BL-B2', 'paid', jsonb_build_array(pg_temp.bl('8100','MG',NULL,1550000,'FY2025 audit and Form 990 review')), DATE '2026-05-14');
  FOR pr IN SELECT * FROM (VALUES (DATE '2025-04-24',680000::bigint,'PP-1104'),(DATE '2025-10-20',940000,'PP-1187'),(DATE '2025-11-18',520000,'PP-1203'),(DATE '2026-04-23',710000,'PP-1291')) q(dt,amt,ref) LOOP
    PERFORM pg_temp.bill('Print & Post Co.', pr.dt, pr.dt + 30, pr.ref, 'paid', jsonb_build_array(pg_temp.bl('7820','FR',NULL,pr.amt,'Appeal mailing – print and postage')), pr.dt + 25);
  END LOOP;
  PERFORM pg_temp.bill('Print & Post Co.', DATE '2026-10-01', DATE '2026-10-31', 'PP-1344', 'approved', jsonb_build_array(pg_temp.bl('7820','FR',NULL,990000,'Fall appeal mailing')));
  PERFORM pg_temp.bill('Maple Hall Events', DATE '2025-04-30', DATE '2025-05-30', 'MH-2025', 'paid', jsonb_build_array(pg_temp.bl('7810','FR',NULL,3150000,'Gala venue, catering, AV')), DATE '2025-05-28');
  PERFORM pg_temp.bill('Maple Hall Events', DATE '2026-05-01', DATE '2026-05-31', 'MH-2026', 'paid', jsonb_build_array(pg_temp.bl('7810','FR',NULL,3620000,'Gala venue, catering, AV')), DATE '2026-05-27');
  PERFORM pg_temp.bill('Civic Reach Digital', DATE '2025-09-20', DATE '2025-10-20', 'VR-0925', 'paid', jsonb_build_array(pg_temp.bl('6780','POL',NULL,1200000,'Public comment turnout and outreach')), DATE '2025-10-15');
  PERFORM pg_temp.bill('Civic Reach Digital', DATE '2026-04-10', DATE '2026-05-10', 'VR-0426', 'paid', jsonb_build_array(pg_temp.bl('6795','POL-LEG','CVF-2026',1450000,'Grassroots lobbying: digital ads, HB 1180')), DATE '2026-05-06');
  PERFORM pg_temp.bill('Civic Reach Digital', DATE '2026-06-08', DATE '2026-07-08', 'VR-0626', 'paid', jsonb_build_array(pg_temp.bl('6795','POL-LEG','CVF-2026',1800000,'Grassroots lobbying: text and mail campaign, HB 1180')), DATE '2026-07-02');
  PERFORM pg_temp.bill('Civic Reach Digital', DATE '2026-08-14', DATE '2026-09-13', 'VR-0826', 'approved', jsonb_build_array(pg_temp.bl('6795','POL-LEG','CVF-2026',1650000,'Grassroots lobbying: hearing turnout')));
  PERFORM pg_temp.bill('Civic Reach Digital', DATE '2026-10-02', DATE '2026-11-01', 'VR-1026', 'draft', jsonb_build_array(pg_temp.bl('6780','POL',NULL,950000,'Public comment turnout and outreach')));
  PERFORM pg_temp.bill('Bayou Community Science Collaborative', DATE '2026-03-31', DATE '2026-04-30', 'RB-SUB-1', 'paid', jsonb_build_array(pg_temp.bl('6770','FCP','GCF-2026',2000000,'Subaward payment 1 of 2')), DATE '2026-04-24');
  PERFORM pg_temp.bill('Bayou Community Science Collaborative', DATE '2026-09-30', DATE '2026-10-30', 'RB-SUB-2', 'approved', jsonb_build_array(pg_temp.bl('6770','FCP','GCF-2026',2000000,'Subaward payment 2 of 2')));
  PERFORM pg_temp.bill('Eastside Residents Alliance', DATE '2026-06-30', DATE '2026-07-30', 'EW-SUB-1', 'paid', jsonb_build_array(pg_temp.bl('6770','POL-LEG','CVF-2026',1500000,'Community organizing subaward')), DATE '2026-07-24');
  -- federal-award bill that needs procurement documentation (contract attorney on the EPA award)
  PERFORM pg_temp.bill('Okafor & Lindqvist LLP (co-counsel)', DATE '2026-05-05', DATE '2026-06-04', 'OL-EPA-1', 'paid',
    jsonb_build_array(pg_temp.bl('6200','FCP-AIR','EPA-2025',2400000,'Contract attorney services for residents affected by permitted emissions',true)), DATE '2026-05-29',
    'Three quotes obtained (Okafor & Lindqvist $24,000; two others $26,500 and $31,000); lowest responsible bidder selected per 2 CFR 200.320.');

  -- ---- IOLTA client funds, reserve transfer, year-end depreciation, flagged journals
  PERFORM pg_temp.post(DATE '2025-11-20', 'Client settlement received – held in trust', 'Client matter 25-0812', 'manual',
    jsonb_build_array(pg_temp.l('1045','MG',NULL,1850000,0), pg_temp.l('2400','MG',NULL,0,1850000)), 'journal', 'Settlement proceeds deposited to IOLTA, owed to client');
  PERFORM pg_temp.post(DATE '2025-12-04', 'Disbursement to client from trust', 'Client matter 25-0812', 'manual',
    jsonb_build_array(pg_temp.l('2400','MG',NULL,1665000,0), pg_temp.l('1045','MG',NULL,0,1665000)), 'journal', 'Client disbursement per settlement statement; $185 balance remains pending client signature');
  PERFORM pg_temp.post(DATE '2026-04-14', 'Client funds received – held in trust', 'Client matter 26-0301', 'manual',
    jsonb_build_array(pg_temp.l('1045','MG',NULL,720000,0), pg_temp.l('2400','MG',NULL,0,720000)), 'journal', 'Restitution deposited to IOLTA, owed to client');
  PERFORM pg_temp.post(DATE '2025-12-19', 'Transfer to operating reserve (board resolution 2025-07)', NULL, 'manual',
    jsonb_build_array(pg_temp.l('1030','MG',NULL,10000000,0) || jsonb_build_object('bd', (SELECT id FROM org_board_designations WHERE org_id=v_org AND name LIKE 'Operating Reserve%')),
      pg_temp.l('1010','MG',NULL,0,10000000)), 'transfer');
  PERFORM pg_temp.post(DATE '2025-12-31', 'Depreciation – FY2025', NULL, 'manual', jsonb_build_array(
    pg_temp.l('8400','MG',NULL,2760000,0), pg_temp.l('1490','MG',NULL,0,2760000)), 'journal', 'Annual straight-line depreciation on furniture and computer equipment');
  PERFORM pg_temp.post(DATE '2025-12-31', 'Reclass December rent coded to utilities', NULL, 'manual', jsonb_build_array(
    pg_temp.l('7100','MG',NULL,120000,0), pg_temp.l('7110','MG',NULL,0,120000)), 'journal', 'Correcting entry: part of a rent charge was originally coded to utilities');
  PERFORM pg_temp.post(DATE '2026-09-29', 'Move Q3 frontline-program payroll to Greenfield grant (pending approval)', NULL, 'manual', jsonb_build_array(
    pg_temp.l('6100','FCP','GCF-2026',1200000,0), pg_temp.l('6100','FCP',NULL,0,1200000)), 'journal', 'Reallocation of attorney salary to the restricted grant after award terms were clarified', NULL, 'pending_approval');
  -- a duplicate entry posted then voided with a reversal
  tid := pg_temp.post(DATE '2026-02-12', 'Duplicate – online donation batch', 'Stripe', 'manual', jsonb_build_array(pg_temp.l('1050','FR',NULL,310000,0), pg_temp.l('4140','FR',NULL,0,310000)));
  UPDATE org_ledger_transactions SET status = 'voided', voided_at = DATE '2026-02-13', voided_by = v_guy, void_reason = 'Entered twice; batch already recorded on 2026-02-09' WHERE id = tid;
  t2 := pg_temp.post(DATE '2026-02-13', 'Void of: Duplicate – online donation batch', 'Stripe', 'manual', jsonb_build_array(pg_temp.l('1050','FR',NULL,0,310000), pg_temp.l('4140','FR',NULL,310000,0)));
  UPDATE org_ledger_transactions SET reverses_transaction_id = tid WHERE id = t2;

END
$seed$;

-- ---- close FY2025 (a separate statement: the ledger-to-actuals recompute is deferred to commit and a lock would block it)
INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at, locked_by_user_id)
  SELECT m.id, 2025, TIMESTAMPTZ '2026-04-30 12:00:00+00', u.id
  FROM coop_members m, users u WHERE m.slug = 'tidal-shift' AND u.email = 'guy@causal.works';
