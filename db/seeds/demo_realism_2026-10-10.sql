-- Demo company (org 42, slug demo-company): replace placeholder names with realistic ones, merge duplicate contacts,
-- remove two unused duplicate accounts, and add donors, gifts, pledges, compliance obligations and fixed assets so the
-- demo reads like a real small workforce-development nonprofit. People are shown by role or number, never by name.
-- Run via stdin as postgres; run `SELECT snapshot_demo_org();` afterwards so the nightly reset keeps it.
BEGIN;
DO $demo$
DECLARE
  v_org int; v_user int; rec record; fk record; v_keep int;
  v_cash int; v_a int; v_b int; v_c int; v_ga int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'demo-company';
  IF v_org IS NULL THEN RAISE EXCEPTION 'demo-company not found'; END IF;
  SELECT id INTO v_user FROM users WHERE email = 'demo@causal.works';

  -- 1. Merge duplicate contacts (same name): keep the oldest, move everything onto it, delete the rest.
  FOR rec IN SELECT lower(display_name) n, min(id) keep, array_agg(id ORDER BY id) ids FROM org_constituents WHERE org_id = v_org GROUP BY 1 HAVING count(*) > 1 LOOP
    v_keep := rec.keep;
    FOR fk IN SELECT conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
               WHERE c.confrelid = 'org_constituents'::regclass AND c.contype = 'f' LOOP
      IF fk.tbl IN ('org_contact_roles', 'org_vendor_compliance') THEN
        EXECUTE format('DELETE FROM %s WHERE %I = ANY($1) AND %I <> $2 AND EXISTS (SELECT 1 FROM %s k WHERE k.%I = $2)', fk.tbl, fk.col, fk.col, fk.tbl, fk.col) USING rec.ids, v_keep;
        -- roles: drop a duplicate's role the keeper already has, then move the rest
        IF fk.tbl = 'org_contact_roles' THEN
          EXECUTE format('DELETE FROM org_contact_roles d WHERE d.constituent_id = ANY($1) AND d.constituent_id <> $2 AND EXISTS (SELECT 1 FROM org_contact_roles k WHERE k.constituent_id = $2 AND k.role = d.role)') USING rec.ids, v_keep;
        END IF;
      END IF;
      EXECUTE format('UPDATE %s SET %I = $2 WHERE %I = ANY($1) AND %I <> $2', fk.tbl, fk.col, fk.col, fk.col) USING rec.ids, v_keep;
    END LOOP;
    DELETE FROM org_constituents WHERE id = ANY(rec.ids) AND id <> v_keep;
  END LOOP;

  -- 2. Two unused accounts that repeated the names of the system Accounts Receivable and Accounts Payable accounts get their own names
  UPDATE org_accounts SET name = 'Other Receivables' WHERE org_id = v_org AND code = '1210' AND lower(name) = 'accounts receivable';
  UPDATE org_accounts SET name = 'Accrued Expenses' WHERE org_id = v_org AND code = '2100' AND lower(name) = 'accounts payable';
  UPDATE org_accounts SET standard_category = 'ASSET_FIXED' WHERE org_id = v_org AND code IN ('1400', '1410', '1420', '1490') AND standard_category IS NULL;

  -- 3. Realistic names in place of Program A / Funder A / Emp1 ... (display text only; the closed 2025 year's lock is
  --    bypassed for these renames, which change no amounts)
  SET LOCAL session_replication_role = replica;
  UPDATE org_programs SET name = 'Youth Career Pathways', description = 'Paid internships and career coaching for ages 16 to 24' WHERE org_id = v_org AND code = 'PROG-A';
  UPDATE org_programs SET name = 'Adult Learning & Credentials', description = 'GED, certification and job-readiness classes for adults' WHERE org_id = v_org AND code = 'PROG-B';
  UPDATE org_programs SET name = 'Neighborhood Resource Navigation', description = 'Case management and referrals for residents in crisis' WHERE org_id = v_org AND code = 'PROG-C';
  UPDATE org_programs SET name = 'Management & General' WHERE org_id = v_org AND code = 'PROG-D';
  UPDATE org_programs SET name = 'Fundraising' WHERE org_id = v_org AND code = 'PROG-E';
  UPDATE org_programs SET name = 'Summer Internship Placement' WHERE org_id = v_org AND code = 'ACT-A1';
  UPDATE org_programs SET name = 'Career Readiness Workshops' WHERE org_id = v_org AND code = 'ACT-A2';
  UPDATE org_programs SET name = 'GED & Certification Prep' WHERE org_id = v_org AND code = 'ACT-B1';

  UPDATE org_grants SET name = 'General Support Grant – Meridian Community Foundation', funder = 'Meridian Community Foundation' WHERE org_id = v_org AND grant_code = 'GRT-01';
  UPDATE org_grants SET name = 'Adult Learning Initiative – Hartwell Family Foundation', funder = 'Hartwell Family Foundation' WHERE org_id = v_org AND grant_code = 'GRT-02';
  UPDATE org_grants SET name = 'Workforce Services Contract 2025-C – State Department of Labor', funder = 'State Department of Labor' WHERE org_id = v_org AND grant_code = 'GRT-03';
  UPDATE org_grants SET name = 'General Operating Support – Northbridge Bank', funder = 'Northbridge Bank' WHERE org_id = v_org AND grant_code = 'GRT-04';
  UPDATE org_grants SET name = 'Resource Navigation Expansion – Greater Valley United Way', funder = 'Greater Valley United Way' WHERE org_id = v_org AND grant_code = 'GRT-05';
  UPDATE org_grants SET name = 'Multi-Program Contract – County Workforce Development Board', funder = 'County Workforce Development Board' WHERE org_id = v_org AND grant_code = 'GRT-06';
  UPDATE org_grants SET name = 'Capacity Building Grant – Kessler Family Foundation', funder = 'Kessler Family Foundation' WHERE org_id = v_org AND grant_code = 'GRT-07';
  UPDATE org_ledger_transactions SET memo = replace(replace(replace(replace(replace(replace(replace(memo,
      'Funder A','Meridian Community Foundation'),'Funder B','Hartwell Family Foundation'),'Agency C','State Department of Labor'),'Corp D','Northbridge Bank'),'Funder E','Greater Valley United Way'),'Agency F','County Workforce Development Board'),'Program B Initiative','Adult Learning Initiative')
    WHERE org_id = v_org AND memo ~ '(Funder|Agency|Corp) [A-G]|Program B Initiative';

  UPDATE org_personnel p SET full_name = m.nm FROM (VALUES ('Emp1','Executive Director'),('Emp2','Program Director'),('Emp3','Finance Manager'),('Emp4','Program Coordinator'),('Emp5','Program Assistant'),('Cont1','Evaluation Consultant'),('Cont2','Grant Writing Consultant')) m(code, nm)
   WHERE p.org_id = v_org AND p.full_name = m.code;

  SET LOCAL session_replication_role = origin;

  -- 4. Funders, donors and a few more vendors as contacts, with roles
  CREATE TEMP TABLE _newc (display_name text, first_name text, last_name text, kind text, org_type text, email text, role text) ON COMMIT DROP;
  INSERT INTO _newc VALUES
   ('Meridian Community Foundation', NULL, NULL, 'organization', 'foundation', 'grants@meridiancf.example', 'donor'),
   ('Hartwell Family Foundation', NULL, NULL, 'organization', 'foundation', 'office@hartwellfoundation.example', 'donor'),
   ('Greater Valley United Way', NULL, NULL, 'organization', 'foundation', 'impact@gvunitedway.example', 'donor'),
   ('Kessler Family Foundation', NULL, NULL, 'organization', 'foundation', 'info@kesslerfoundation.example', 'donor'),
   ('Northbridge Bank', NULL, NULL, 'organization', 'corporate', 'communityaffairs@northbridge.example', 'donor'),
   ('Individual Donor 01', 'Donor', '01', 'individual', NULL, 'donor01@example.com', 'donor'),
   ('Individual Donor 02', 'Donor', '02', 'individual', NULL, 'donor02@example.com', 'donor'),
   ('Individual Donor 03', 'Donor', '03', 'individual', NULL, 'donor03@example.com', 'donor'),
   ('Individual Donor 04', 'Donor', '04', 'individual', NULL, 'donor04@example.com', 'donor'),
   ('Individual Donor 05', 'Donor', '05', 'individual', NULL, 'donor05@example.com', 'donor'),
   ('Individual Donor 06', 'Donor', '06', 'individual', NULL, 'donor06@example.com', 'donor'),
   ('Individual Donor 07', 'Donor', '07', 'individual', NULL, 'donor07@example.com', 'donor'),
   ('Individual Donor 08', 'Donor', '08', 'individual', NULL, 'donor08@example.com', 'donor'),
   ('Individual Donor 09', 'Donor', '09', 'individual', NULL, 'donor09@example.com', 'donor'),
   ('Individual Donor 10', 'Donor', '10', 'individual', NULL, 'donor10@example.com', 'donor'),
   ('Individual Donor 11', 'Donor', '11', 'individual', NULL, 'donor11@example.com', 'donor'),
   ('Individual Donor 12', 'Donor', '12', 'individual', NULL, 'donor12@example.com', 'donor'),
   ('Valley Print & Copy', NULL, NULL, 'organization', 'corporate', 'orders@valleyprint.example', 'vendor'),
   ('Summit Insurance Brokers', NULL, NULL, 'organization', 'corporate', 'service@summitinsurance.example', 'vendor'),
   ('Metro Transit Authority', NULL, NULL, 'organization', 'government', 'accounts@metrotransit.example', 'vendor');
  INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, kind, org_type)
    SELECT v_org, n.display_name, n.first_name, n.last_name, n.email, n.kind, n.org_type FROM _newc n
     WHERE NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.org_id = v_org AND lower(c.display_name) = lower(n.display_name));
  INSERT INTO org_contact_roles (org_id, constituent_id, role)
    SELECT v_org, c.id, n.role FROM _newc n JOIN org_constituents c ON c.org_id = v_org AND lower(c.display_name) = lower(n.display_name)
     WHERE NOT EXISTS (SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = c.id AND r.role = n.role);
  -- funder grants point at their funder contact
  UPDATE org_grants g SET constituent_id = c.id FROM org_constituents c WHERE g.org_id = v_org AND c.org_id = v_org AND g.constituent_id IS NULL AND lower(c.display_name) = lower(g.funder);

  -- 5. Gifts: a year of individual giving, two pledges (one multi-year that needs discounting), one in-kind gift
  SELECT id INTO v_a FROM org_programs WHERE org_id = v_org AND code = 'PROG-A';
  SELECT id INTO v_b FROM org_programs WHERE org_id = v_org AND code = 'PROG-B';
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, notes, recorded_by_user_id, posting_status)
    SELECT v_org, c.id, 'donation', g.amt * 100, g.dt::timestamptz, g.pm::gift_payment_method, g.camp, g.note, v_user, 'not_applicable'
      FROM (VALUES
        ('Individual Donor 01', 250, '2025-11-28', 'stripe', 'Giving Tuesday 2025', 'Online gift'),
        ('Individual Donor 02', 1000, '2025-12-15', 'check', 'Annual Appeal 2025', 'Year-end gift'),
        ('Individual Donor 03', 100, '2025-12-02', 'stripe', 'Giving Tuesday 2025', NULL),
        ('Individual Donor 04', 500, '2026-01-20', 'ach', 'Monthly Sustainers', 'Monthly gift, January'),
        ('Individual Donor 04', 500, '2026-02-20', 'ach', 'Monthly Sustainers', 'Monthly gift, February'),
        ('Individual Donor 04', 500, '2026-03-20', 'ach', 'Monthly Sustainers', 'Monthly gift, March'),
        ('Individual Donor 05', 2500, '2026-03-05', 'check', 'Spring Gala', 'Table sponsor'),
        ('Individual Donor 06', 75, '2026-03-18', 'stripe', 'Spring Gala', NULL),
        ('Individual Donor 07', 150, '2026-03-18', 'stripe', 'Spring Gala', NULL),
        ('Individual Donor 08', 5000, '2026-04-09', 'check', 'Major Gifts', 'Gift in honor of his mother'),
        ('Individual Donor 09', 300, '2026-04-22', 'ach', 'Annual Appeal 2026', NULL),
        ('Individual Donor 10', 125, '2026-05-06', 'stripe', 'Annual Appeal 2026', NULL),
        ('Individual Donor 11', 400, '2026-05-19', 'check', 'Annual Appeal 2026', NULL),
        ('Individual Donor 12', 1500, '2026-06-03', 'check', 'Major Gifts', 'Matched by her employer'),
        ('Individual Donor 01', 250, '2026-06-24', 'stripe', 'Annual Appeal 2026', 'Repeat donor'),
        ('Individual Donor 02', 1000, '2026-07-14', 'check', 'Annual Appeal 2026', NULL),
        ('Individual Donor 03', 100, '2026-08-01', 'stripe', 'Monthly Sustainers', NULL),
        ('Individual Donor 04', 500, '2026-08-20', 'ach', 'Monthly Sustainers', 'Monthly gift, August'),
        ('Individual Donor 04', 500, '2026-09-20', 'ach', 'Monthly Sustainers', 'Monthly gift, September'),
        ('Individual Donor 07', 200, '2026-09-09', 'stripe', 'Back to School Drive', NULL)
      ) g(who, amt, dt, pm, camp, note)
      JOIN org_constituents c ON c.org_id = v_org AND lower(c.display_name) = lower(g.who)
     WHERE NOT EXISTS (SELECT 1 FROM org_gifts x WHERE x.org_id = v_org AND x.constituent_id = c.id AND x.received_at = g.dt::timestamptz);
  -- pledges (promises; they post in Accounting). The multi-year one has no rate: Accounting sets it when posting.
  SELECT id INTO v_ga FROM org_accounts WHERE org_id = v_org AND code = '1220';
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, notes, recorded_by_user_id,
                         posting_status, program_id, total_pledged_cents, is_multi_year_pledge, receivable_account_id)
    SELECT v_org, c.id, 'pledge', 0, p.dt::timestamptz, 'check'::gift_payment_method, p.camp, p.note, v_user, 'unposted', p.prog, p.total * 100, p.multi, v_ga
      FROM (VALUES
        ('Hartwell Family Foundation', '2026-09-02', 'Major Gifts', 'Three-year pledge toward Adult Learning, paid in annual installments', v_b, 60000, true),
        ('Individual Donor 08', '2026-09-25', 'Annual Appeal 2026', 'Pledged for the fall; payment due by December', v_a, 5000, false)
      ) p(who, dt, camp, note, prog, total, multi)
      JOIN org_constituents c ON c.org_id = v_org AND lower(c.display_name) = lower(p.who)
     WHERE NOT EXISTS (SELECT 1 FROM org_gifts x WHERE x.org_id = v_org AND x.constituent_id = c.id AND x.gift_type = 'pledge');
  INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, payment_method, campaign, notes, recorded_by_user_id, posting_status,
                         program_id, in_kind_description, in_kind_valuation_method, in_kind_revenue_account_id)
    SELECT v_org, c.id, 'donation', 480000, '2026-08-12'::timestamptz, 'in_kind'::gift_payment_method, NULL, 'Eight refurbished laptops for the lab', v_user, 'unposted', v_b,
           'Eight refurbished laptops for the learning lab', 'comparable_sales', (SELECT id FROM org_accounts WHERE org_id = v_org AND code = '4650')
      FROM org_constituents c WHERE c.org_id = v_org AND c.display_name = 'Northbridge Bank'
       AND NOT EXISTS (SELECT 1 FROM org_gifts x WHERE x.org_id = v_org AND x.payment_method = 'in_kind');

  -- 6. Compliance calendar
  INSERT INTO org_compliance_obligations (org_id, source, category, title, description, frequency, next_due_date, status)
    SELECT v_org, 'org_extension'::compliance_source, o.cat, o.title, o.descr, o.freq::compliance_frequency, o.due::date, o.st::compliance_obligation_status
      FROM (VALUES
        ('Federal', 'Form 990 filing', 'File the annual information return (Form 990) with the IRS.', 'annual', '2026-11-15', 'due_soon'),
        ('State', 'Charitable solicitation registration renewal', 'Renew registration with the state attorney general.', 'annual', '2026-12-31', 'upcoming'),
        ('State', 'Annual report to the Secretary of State', 'File the nonprofit corporation annual report.', 'annual', '2027-03-15', 'upcoming'),
        ('Payroll', 'Quarterly payroll tax filing (Form 941)', 'File and pay federal payroll taxes for the quarter.', 'quarterly', '2026-10-31', 'due_soon'),
        ('Governance', 'Board conflict-of-interest disclosures', 'Collect annual conflict-of-interest statements from every board member.', 'annual', '2026-09-30', 'overdue'),
        ('Insurance', 'General liability and D&O renewal', 'Review coverage and renew the general liability and directors-and-officers policies.', 'annual', '2027-01-15', 'upcoming'),
        ('Funders', 'State Department of Labor quarterly report', 'Submit the quarterly performance and expenditure report for contract 2025-C.', 'quarterly', '2026-10-15', 'due_soon'),
        ('Audit', 'Annual financial audit fieldwork', 'Schedule and support the annual independent audit.', 'annual', '2027-02-01', 'upcoming')
      ) o(cat, title, descr, freq, due, st)
     WHERE NOT EXISTS (SELECT 1 FROM org_compliance_obligations x WHERE x.org_id = v_org AND x.title = o.title);

  -- 7. Fixed assets: two bought and added to the register, one bought and still waiting to be added
  SELECT id INTO v_cash FROM org_accounts WHERE org_id = v_org AND code = '1100';
  CREATE TEMP TABLE _fa (txn int, nm text, dt date, cost bigint, acct text, life int, add_asset boolean) ON COMMIT DROP;
  FOR rec IN SELECT * FROM (VALUES
      ('Learning lab computers (12)', DATE '2026-02-03', 1980000::bigint, '1410', 36, true),
      ('Training room furniture', DATE '2026-03-12', 1250000::bigint, '1400', 84, true),
      ('Projector and screens for the training room', DATE '2026-08-20', 640000::bigint, '1410', 36, false)
    ) a(nm, dt, cost, acct, life, add_asset) LOOP
    IF NOT EXISTS (SELECT 1 FROM org_ledger_transactions WHERE org_id = v_org AND memo = rec.nm) THEN
      WITH t AS (
        INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, status, memo, source, entry_type, created_by, approved_by)
        VALUES (v_org, rec.dt, EXTRACT(YEAR FROM rec.dt)::int, 'posted', rec.nm, 'manual', 'spend', v_user, v_user) RETURNING id)
      INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents)
        SELECT t.id, a.id, (SELECT id FROM org_programs WHERE org_id = v_org AND code = 'PROG-D'), rec.cost, 0 FROM t, org_accounts a WHERE a.org_id = v_org AND a.code = rec.acct
        UNION ALL SELECT t.id, v_cash, (SELECT id FROM org_programs WHERE org_id = v_org AND code = 'PROG-D'), 0, rec.cost FROM t;
    END IF;
    IF rec.add_asset AND NOT EXISTS (SELECT 1 FROM org_fixed_assets WHERE org_id = v_org AND name = rec.nm) THEN
      INSERT INTO org_fixed_assets (org_id, name, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, program_id,
                                    acquisition_date, cost_cents, salvage_value_cents, useful_life_months, created_by, acquisition_ledger_transaction_id)
        SELECT v_org, rec.nm, a.id, (SELECT id FROM org_accounts WHERE org_id = v_org AND code = '1490'), (SELECT id FROM org_accounts WHERE org_id = v_org AND code = '7800'),
               (SELECT id FROM org_programs WHERE org_id = v_org AND code = 'PROG-B'), rec.dt, rec.cost, 0, rec.life, v_user,
               (SELECT id FROM org_ledger_transactions WHERE org_id = v_org AND memo = rec.nm LIMIT 1)
          FROM org_accounts a WHERE a.org_id = v_org AND a.code = rec.acct;
    END IF;
  END LOOP;
END
$demo$;
COMMIT;

-- 8. (run separately after the block above) Each grant gets its revenue account so the FY2026 budget carries the grant
--    income, then the budget is recalculated from the app: recalcGrantBudget(pool, 42, 2026).
--    UPDATE org_grants g SET revenue_account_id = a.id FROM org_accounts a WHERE g.org_id = 42 AND a.org_id = 42 AND g.revenue_account_id IS NULL
--      AND a.code = CASE g.grant_code WHEN 'GRT-01' THEN '4200' WHEN 'GRT-02' THEN '4100' WHEN 'GRT-03' THEN '4300' WHEN 'GRT-04' THEN '4500'
--                                     WHEN 'GRT-05' THEN '4100' WHEN 'GRT-06' THEN '4300' WHEN 'GRT-07' THEN '4100' END;
