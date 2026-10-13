-- Tidal Shift section 3 of 3 (finance side): donor gifts, in-kind gifts, pledges, expense claims, fixed assets,
-- leftover bank-feed lines for Cash Coding. Run after sections 1 and 2. Re-runnable: removes what it created first
-- (ledger entries it creates carry reference numbers starting 'S3-'). Workshop data is a separate section.

DO $seed$
DECLARE
  v_org int; v_guy int; v_fin int; v_cash int; i int; tid int; t2 int; cid int; gid int; pv bigint; claim int; cl record;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  IF v_org IS NULL THEN RAISE EXCEPTION 'run sections 1 and 2 first'; END IF;
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  SELECT id INTO v_fin FROM users WHERE email = 'gyacc@pm.me';
  CREATE TEMP TABLE _ctx AS SELECT v_org AS org, v_guy AS guy, v_fin AS fin;

  -- ---- remove a previous run
  DELETE FROM org_expense_claim_payments WHERE org_id = v_org;
  DELETE FROM org_expense_claim_lines WHERE claim_id IN (SELECT id FROM org_expense_claims WHERE org_id = v_org);
  DELETE FROM org_expense_claims WHERE org_id = v_org;
  DELETE FROM org_gift_pledge_installments WHERE org_id = v_org;
  DELETE FROM org_gifts WHERE org_id = v_org;
  DELETE FROM org_fixed_assets WHERE org_id = v_org;
  UPDATE org_bank_statement_lines SET ledger_transaction_id = NULL WHERE org_id = v_org AND import_fingerprint LIKE 's3-%';
  DELETE FROM org_bank_statement_lines WHERE org_id = v_org AND import_fingerprint LIKE 's3-%';
  DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id = v_org AND reference_number LIKE 'S3-%');
  DELETE FROM org_ledger_transactions WHERE org_id = v_org AND reference_number LIKE 'S3-%';

  CREATE FUNCTION pg_temp.a(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_accounts WHERE org_id=(SELECT org FROM _ctx) AND code=c $f$;
  CREATE FUNCTION pg_temp.p(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_programs WHERE org_id=(SELECT org FROM _ctx) AND code=c $f$;
  CREATE FUNCTION pg_temp.g(c text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_grants WHERE org_id=(SELECT org FROM _ctx) AND grant_code=c $f$;
  CREATE FUNCTION pg_temp.c(nm text) RETURNS int LANGUAGE sql AS $f$ SELECT id FROM org_constituents WHERE org_id=(SELECT org FROM _ctx) AND display_name=nm $f$;
  CREATE FUNCTION pg_temp.l(ac text, pc text, gc text, dr numeric, cr numeric) RETURNS jsonb LANGUAGE sql AS $f$
    SELECT jsonb_build_object('a', pg_temp.a(ac), 'p', pg_temp.p(pc), 'g', pg_temp.g(gc),
      'rc', CASE WHEN gc IS NULL THEN NULL WHEN (SELECT grant_type FROM org_grants WHERE org_id=(SELECT org FROM _ctx) AND grant_code=gc)='unrestricted' THEN NULL ELSE 'temporarily_restricted' END,
      'dr', dr, 'cr', cr) $f$;
  CREATE FUNCTION pg_temp.post(d date, memo text, payee text, src text, lines jsonb, ref text, etype text DEFAULT NULL, reason text DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE tid int; cx record;
  BEGIN
    SELECT * INTO cx FROM _ctx;
    INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, payee, reference_number, status, source, entry_type, journal_reason, created_by, approved_by, approved_at)
      VALUES (cx.org, d, EXTRACT(year FROM d)::int, memo, payee, ref, 'posted', src, etype, reason, cx.guy, cx.fin, d::timestamptz) RETURNING id INTO tid;
    INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, grant_id, donor_restriction_class, debit_cents, credit_cents)
      SELECT tid, (x->>'a')::int, (x->>'p')::int, NULLIF(x->>'g','')::int, NULLIF(x->>'rc','')::org_restriction_class, COALESCE((x->>'dr')::bigint,0), COALESCE((x->>'cr')::bigint,0)
      FROM jsonb_array_elements(lines) x;
    RETURN tid;
  END $f$;
  CREATE FUNCTION pg_temp.bank(d date, amt numeric, payee text, descr text, tid int DEFAULT NULL, st text DEFAULT NULL, xfer bool DEFAULT false) RETURNS void LANGUAGE sql AS $f$
    INSERT INTO org_bank_statement_lines (org_id, bank_account_id, statement_date, amount_cents, payee_raw, description_raw, import_fingerprint, status, ledger_transaction_id,
        is_internal_transfer, coding_source, credit_debit_indicator, source)
    VALUES ((SELECT org FROM _ctx), pg_temp.a('1010'), d, abs(amt), payee, descr, 's3-' || md5(d::text || amt::text || descr || random()::text),
        COALESCE(st, CASE WHEN tid IS NULL THEN 'unconfirmed' ELSE 'confirmed' END), tid, xfer, 'manual', CASE WHEN amt >= 0 THEN 'credit' ELSE 'debit' END, 'csv') $f$;
  CREATE FUNCTION pg_temp.rnd(seed text, lo int, hi int) RETURNS int LANGUAGE sql AS $f$ SELECT lo + (abs(hashtext(seed)) % (hi - lo + 1)) $f$;

  v_cash := pg_temp.a('1010');

  -- ---- donor gift records (Donors module). Cash gifts reach the books through bank coding, so posting is not applicable.
  FOR i IN 1..34 LOOP
    INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, program_id, recorded_by_user_id, posting_status)
    SELECT v_org, (SELECT id FROM org_constituents WHERE org_id = v_org AND kind = 'individual' AND org_contact_has_role(id, org_id, 'donor') ORDER BY id OFFSET (i * 3) % (SELECT count(*) FROM org_constituents WHERE org_id = v_org AND kind = 'individual' AND org_contact_has_role(id, org_id, 'donor')) LIMIT 1),
      'donation', pg_temp.rnd('g' || i, 5000, 250000) * CASE WHEN i % 11 = 0 THEN 8 ELSE 1 END,
      (DATE '2025-01-20' + (i * 17) % 620)::timestamptz,
      (ARRAY['credit_card','check','ach','stripe','cash','wire'])[1 + i % 6]::gift_payment_method,
      (ARRAY['Year-End 2025','Fall Appeal 2025','Gala 2026','Spring Appeal 2026','Monthly Giving'])[1 + i % 5],
      pg_temp.p('FR'), v_guy, 'not_applicable';
  END LOOP;

  -- ---- in-kind gifts: one posted, two waiting in Gift Postings
  tid := pg_temp.post(DATE '2026-06-30', 'In-kind: pro bono legal services (Q2)', 'Okafor & Lindqvist LLP (co-counsel)', 'gift_in_kind',
    jsonb_build_array(pg_temp.l('6200','LIT-PERMIT',NULL,4200000,0), pg_temp.l('4170','LIT-PERMIT',NULL,0,4200000)), 'S3-IK-1');
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, program_id, recorded_by_user_id, posting_status,
      ledger_transaction_id, in_kind_description, in_kind_valuation_method, in_kind_fair_value_notes, in_kind_revenue_account_id, in_kind_expense_account_id)
    VALUES (v_org, pg_temp.c('Okafor & Lindqvist LLP (co-counsel)'), 'donation', 4200000, TIMESTAMPTZ '2026-06-30 12:00+00', 'in_kind', 'Pro bono', pg_temp.p('LIT-PERMIT'), v_guy, 'posted',
      tid, 'Pro bono attorney time on permit challenge, 105 hours', 'comparable_sales', 'Hours valued at $400 per hour, the firm''s discounted public-interest rate', pg_temp.a('4170'), pg_temp.a('6200'));
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, program_id, recorded_by_user_id, posting_status,
      in_kind_description, in_kind_valuation_method, in_kind_fair_value_notes, in_kind_revenue_account_id, in_kind_expense_account_id) VALUES
    (v_org, pg_temp.c('NorthStar IT Services'), 'donation', 650000, TIMESTAMPTZ '2026-09-02 12:00+00', 'in_kind', 'Equipment', pg_temp.p('MG'), v_guy, 'unposted',
      '5 refurbished laptops donated for staff and clinic volunteers', 'quoted_market_price', 'Comparable refurbished units listed at $1,300 each', pg_temp.a('4170'), pg_temp.a('1420')),
    (v_org, pg_temp.c('Maple Hall Events'), 'donation', 1800000, TIMESTAMPTZ '2026-09-25 12:00+00', 'in_kind', 'Gala 2026', pg_temp.p('FR'), v_guy, 'unposted',
      'Donated venue use for fall donor reception', 'donor_stated', 'Donor-stated value from the venue''s published rate card', pg_temp.a('4170'), pg_temp.a('7810'));

  -- ---- pledges: a three-year pledge posted at present value (first installment collected), and a new unposted pledge
  pv := 14430000;
  tid := pg_temp.post(DATE '2026-04-20', 'Pledge: three-year commitment from major donor', NULL, 'pledge_commitment',
    jsonb_build_array(pg_temp.l('1220','FR',NULL,pv,0), pg_temp.l('4150','FR',NULL,0,pv)), 'S3-PL-1');
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, program_id, recorded_by_user_id, posting_status, ledger_transaction_id,
      total_pledged_cents, is_multi_year_pledge, discount_rate_bps, discounted_present_value_cents, receivable_account_id, notes)
    VALUES (v_org, (SELECT id FROM org_constituents WHERE org_id = v_org AND '{major donor}' <@ tags ORDER BY id LIMIT 1), 'pledge', 15000000, TIMESTAMPTZ '2026-04-20 12:00+00', 'check',
      'Major Gifts', pg_temp.p('FR'), v_guy, 'posted', tid, 15000000, true, 400, pv, pg_temp.a('1220'), 'Three annual installments of $50,000')
    RETURNING id INTO gid;
  INSERT INTO org_gift_pledge_installments (org_id, gift_id, due_date, amount_cents, status) VALUES
    (v_org, gid, DATE '2026-04-20', 5000000, 'collected'), (v_org, gid, DATE '2027-04-20', 5000000, 'expected'), (v_org, gid, DATE '2028-04-20', 5000000, 'expected');
  t2 := pg_temp.post(DATE '2026-04-22', 'Pledge installment 1 received', NULL, 'bank_reconciliation',
    jsonb_build_array(pg_temp.l('1010','FR',NULL,5000000,0), pg_temp.l('1220','FR',NULL,0,5000000)), 'S3-PL-1A');
  PERFORM pg_temp.bank(DATE '2026-04-22', 5000000, 'CHECK DEPOSIT', 'CHECK DEPOSIT PLEDGE INSTALLMENT', t2);
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, program_id, recorded_by_user_id, posting_status,
      total_pledged_cents, is_multi_year_pledge, receivable_account_id, notes)
    VALUES (v_org, pg_temp.c('Meridian Community Bank Foundation'), 'pledge', 5000000, TIMESTAMPTZ '2026-09-30 12:00+00', 'check', 'Corporate', pg_temp.p('MG'), v_guy, 'unposted',
      5000000, true, pg_temp.a('1220'), 'Two annual installments, first due 2027-01-15') RETURNING id INTO gid;
  INSERT INTO org_gift_pledge_installments (org_id, gift_id, due_date, amount_cents, status) VALUES
    (v_org, gid, DATE '2027-01-15', 2500000, 'expected'), (v_org, gid, DATE '2028-01-15', 2500000, 'expected');

  -- ---- expense claims (submitter and approver must differ)
  CREATE FUNCTION pg_temp.claim(cdate date, descr text, sub int, st text, lines jsonb, appr int DEFAULT NULL, disputed text DEFAULT NULL, affidavit text DEFAULT NULL, paid date DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $f$
  DECLARE cx record; cid int; x jsonb; tot bigint := 0; lns jsonb := '[]'::jsonb; t1 int; t2 int; ledgered bool;
  BEGIN
    SELECT * INTO cx FROM _ctx;
    ledgered := st IN ('approved','paid_pending_confirmation','paid','confirmed','disputed');
    INSERT INTO org_expense_claims (org_id, submitted_by, claim_date, description, status, approved_by, approved_at, fiscal_year, bank_account_id, disputed_reason, receipt_affidavit_reason, receipt_affidavit_at, receipt_affidavit_by)
      VALUES (cx.org, sub, cdate, descr, st, CASE WHEN ledgered THEN appr END, CASE WHEN ledgered THEN (cdate + 2)::timestamptz END, EXTRACT(year FROM cdate)::int, pg_temp.a('1010'), disputed, affidavit,
        CASE WHEN affidavit IS NOT NULL THEN cdate::timestamptz END, CASE WHEN affidavit IS NOT NULL THEN sub END) RETURNING id INTO cid;
    FOR x IN SELECT * FROM jsonb_array_elements(lines) LOOP
      INSERT INTO org_expense_claim_lines (claim_id, account_id, program_id, grant_id, expense_date, description, miles, rate_cents_per_mile, amount_cents, line_memo)
        VALUES (cid, pg_temp.a(x->>'a'), pg_temp.p(x->>'p'), pg_temp.g(x->>'g'), cdate, x->>'d', NULLIF(x->>'mi','')::numeric, NULLIF(x->>'rate','')::int, (x->>'amt')::bigint, x->>'m');
      tot := tot + (x->>'amt')::bigint;
      lns := lns || pg_temp.l(x->>'a', x->>'p', x->>'g', (x->>'amt')::bigint, 0);
    END LOOP;
    IF ledgered THEN
      t1 := pg_temp.post(cdate + 2, 'Expense claim #' || cid || ' approved', 'Staff reimbursement', 'expense_claim_approval', lns || pg_temp.l('2020','MG',NULL,0,tot), 'S3-EC-' || cid);
      UPDATE org_expense_claims SET ledger_transaction_id = t1 WHERE id = cid;
    END IF;
    IF paid IS NOT NULL THEN
      t2 := pg_temp.post(paid, 'Expense claim #' || cid || ' reimbursed', 'Staff reimbursement', 'expense_claim_payment',
              jsonb_build_array(pg_temp.l('2020','MG',NULL,tot,0), pg_temp.l('1010','MG',NULL,0,tot)), 'S3-ECP-' || cid);
      UPDATE org_expense_claims SET payment_ledger_transaction_id = t2 WHERE id = cid;
      INSERT INTO org_expense_claim_payments (org_id, claim_id, payment_date, amount_cents, bank_account_id, ledger_transaction_id, status, created_by)
        VALUES (cx.org, cid, paid, tot, pg_temp.a('1010'), t2, 'posted', cx.guy);
      PERFORM pg_temp.bank(paid, -tot, 'ACH REIMBURSEMENT', 'ACH REIMBURSEMENT CLAIM ' || cid, t2);
    END IF;
    RETURN cid;
  END $f$;
  PERFORM pg_temp.claim(DATE '2026-03-10', 'Travel to permit hearing, Baton Rouge', v_fin, 'confirmed', jsonb_build_array(
      jsonb_build_object('a','7600','p','LIT-PERMIT','g','HCF-2025','d','Hotel, 2 nights','amt',41230,'m','Hearing 3/9-3/10'),
      jsonb_build_object('a','7610','p','LIT-PERMIT','g','HCF-2025','d','Mileage, round trip','mi',186,'rate',72,'amt',13392,'m','186 miles at 72 cents')), v_guy, NULL, NULL, DATE '2026-03-20');
  PERFORM pg_temp.claim(DATE '2026-05-22', 'Registration and airfare, Climate Law Summit', v_guy, 'paid_pending_confirmation', jsonb_build_array(
      jsonb_build_object('a','7700','p','LIT','d','Summit registration','amt',65000),
      jsonb_build_object('a','7600','p','LIT','d','Airfare','amt',38400)), v_fin, NULL, NULL, DATE '2026-06-03');
  PERFORM pg_temp.claim(DATE '2026-06-18', 'Working lunch with community partners', v_fin, 'confirmed', jsonb_build_array(
      jsonb_build_object('a','6780','p','FCP','d','Catering, community listening session','amt',12800)), v_guy,
      NULL, 'Receipt lost; caterer confirmed amount by email (affidavit on file)', DATE '2026-06-30');
  PERFORM pg_temp.claim(DATE '2026-07-15', 'Community meeting supplies', v_guy, 'approved', jsonb_build_array(
      jsonb_build_object('a','6780','p','FCP-AIR','g','EPA-2025','d','Printing and poster board','amt',18650)), v_fin);
  PERFORM pg_temp.claim(DATE '2026-08-30', 'Mileage – fenceline site visits', v_fin, 'pending_approval', jsonb_build_array(
      jsonb_build_object('a','7610','p','FCP-AIR','g','EPA-2025','d','Site visits, August','mi',412,'rate',72,'amt',29664)));
  PERFORM pg_temp.claim(DATE '2026-09-12', 'Hotel for deposition', v_fin, 'disputed', jsonb_build_array(
      jsonb_build_object('a','7600','p','LIT-REG','d','Hotel, 3 nights','amt',68400)), v_guy, 'Amount exceeds the travel policy lodging cap; please re-submit with approval note');
  PERFORM pg_temp.claim(DATE '2026-09-28', 'Taxi and parking', v_guy, 'draft', jsonb_build_array(
      jsonb_build_object('a','7600','p','LIT-PERMIT','d','Parking, courthouse','amt',4200)));

  -- ---- fixed assets register, with the purchases not already in the ledger
  INSERT INTO org_fixed_assets (org_id, name, description, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, acquisition_date, cost_cents,
      salvage_value_cents, useful_life_months, status, program_id, created_by) VALUES
    (v_org, 'Laptops (14)', 'Staff replacement cycle', pg_temp.a('1420'), pg_temp.a('1490'), pg_temp.a('8400'), DATE '2025-03-12', 2840000, 0, 36, 'active', pg_temp.p('MG'), v_guy),
    (v_org, 'Fenceline air monitoring sensor network', '12 stationary sensors and gateway', pg_temp.a('1410'), pg_temp.a('1490'), pg_temp.a('8400'), DATE '2026-02-10', 6400000, 400000, 60, 'active', pg_temp.p('FCP-AIR'), v_guy),
    (v_org, 'Clinic furniture', 'Waiting room and intake desks', pg_temp.a('1410'), pg_temp.a('1490'), pg_temp.a('8400'), DATE '2026-04-03', 980000, 0, 84, 'active', pg_temp.p('CLC'), v_guy);
  tid := pg_temp.post(DATE '2026-02-10', 'Air monitoring sensor network', 'Clean Air Instruments', 'bank_reconciliation',
    jsonb_build_array(pg_temp.l('1410','FCP-AIR','EPA-2025',6400000,0), pg_temp.l('1010','MG',NULL,0,6400000)), 'S3-FA-1');
  PERFORM pg_temp.bank(DATE '2026-02-10', -6400000, 'CLEAN AIR INSTRUMENTS', 'WIRE OUT CLEAN AIR INSTRUMENTS', tid);
  tid := pg_temp.post(DATE '2026-04-03', 'Clinic furniture', 'Office Source', 'bank_reconciliation',
    jsonb_build_array(pg_temp.l('1410','CLC',NULL,980000,0), pg_temp.l('1010','MG',NULL,0,980000)), 'S3-FA-2');
  PERFORM pg_temp.bank(DATE '2026-04-03', -980000, 'OFFICE SOURCE', 'OFFICE SOURCE INV 88213', tid);

  -- ---- leftover bank-feed lines (nothing posted) for Cash Coding practice
  FOR cl IN SELECT * FROM (VALUES
      (DATE '2026-09-15', -14218, 'AMAZON MKTPLACE', 'AMAZON MKTPLACE PMTS AMZN.COM'),
      (DATE '2026-09-16', -8640, 'STAPLES', 'STAPLES 00231 NEW ORLEANS'),
      (DATE '2026-09-17', -14990, 'ZOOM', 'ZOOM.US 888-799-9666'),
      (DATE '2026-09-18', -2350, 'UBER', 'UBER *TRIP HELP.UBER.COM'),
      (DATE '2026-09-21', 124000, 'DONORBOX', 'DONORBOX PAYOUT'),
      (DATE '2026-09-22', 250000, 'CHECK DEPOSIT', 'MOBILE DEPOSIT CHECK 4471'),
      (DATE '2026-09-23', -45000, 'VENMO', 'VENMO PAYMENT 1038847221'),
      (DATE '2026-09-24', 8750000, 'WIRE IN', 'WIRE IN FROM UNKNOWN SENDER REF 77120'),
      (DATE '2026-09-25', -8750000, 'WIRE OUT', 'WIRE OUT REVERSAL REF 77120'),
      (DATE '2026-09-29', -61200, 'ADOBE', 'ADOBE *CREATIVE CLOUD'),
      (DATE '2026-10-01', 90000, 'PAYPAL', 'PAYPAL TRANSFER')) q(dt, amt, payee, descr) LOOP
    PERFORM pg_temp.bank(cl.dt, cl.amt, cl.payee, cl.descr);
  END LOOP;
  PERFORM pg_temp.bank(DATE '2026-09-30', -5000000, 'TRANSFER TO RESERVE SAVINGS', 'ONLINE TRANSFER TO SAV 6612', NULL, 'transfer_pending', true);
END
$seed$;

-- Contacts on ledger entries (migration 301 added the column; these seeds insert entries directly): bills, bill
-- payments, invoices, invoice payments and gifts take their document's contact, then a payee equal to exactly one
-- contact name is matched. The fiscal-year lock trigger is off for this statement block only (FY2025 is locked).
ALTER TABLE org_ledger_transactions DISABLE TRIGGER trg_fy_lock_ledger_transactions;
UPDATE org_ledger_transactions t SET constituent_id = x.cid
  FROM (SELECT ledger_transaction_id AS tid, constituent_id AS cid FROM org_bills WHERE ledger_transaction_id IS NOT NULL
        UNION ALL SELECT p.ledger_transaction_id, b.constituent_id FROM org_bill_payments p JOIN org_bills b ON b.id = p.bill_id WHERE p.ledger_transaction_id IS NOT NULL
        UNION ALL SELECT ledger_transaction_id, constituent_id FROM org_invoices WHERE ledger_transaction_id IS NOT NULL
        UNION ALL SELECT p.ledger_transaction_id, i.constituent_id FROM org_invoice_payments p JOIN org_invoices i ON i.id = p.invoice_id WHERE p.ledger_transaction_id IS NOT NULL
        UNION ALL SELECT ledger_transaction_id, constituent_id FROM org_gifts WHERE ledger_transaction_id IS NOT NULL AND constituent_id IS NOT NULL) x
 WHERE t.id = x.tid AND t.constituent_id IS NULL AND t.org_id = (SELECT id FROM coop_members WHERE slug = 'tidal-shift');
UPDATE org_ledger_transactions t SET constituent_id = m.cid
  FROM (SELECT t2.id AS tid, (array_agg(c.id))[1] AS cid
          FROM org_ledger_transactions t2
          JOIN org_constituents c ON c.org_id = t2.org_id AND lower(btrim(c.display_name)) = lower(btrim(t2.payee))
         WHERE t2.org_id = (SELECT id FROM coop_members WHERE slug = 'tidal-shift') AND t2.constituent_id IS NULL AND btrim(coalesce(t2.payee, '')) <> ''
         GROUP BY t2.id HAVING count(*) = 1) m
 WHERE t.id = m.tid;
ALTER TABLE org_ledger_transactions ENABLE TRIGGER trg_fy_lock_ledger_transactions;
