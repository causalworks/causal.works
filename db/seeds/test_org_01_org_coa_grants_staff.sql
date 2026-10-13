-- Test org "Tidal Shift" (slug tidal-shift), 2026-10-05.
-- Section 1 of 3: org, members, programs, chart of accounts, contacts, grants, staff.
-- Re-runnable: deletes the org (and its accounting rows) and recreates it. See
-- .claude/plans/2026-10-05-test-org-seed-plan.md. Run via stdin as postgres.

-- remove the copy created under the earlier working name, if it exists
DELETE FROM org_fiscal_year_locks WHERE org_id IN (SELECT id FROM coop_members WHERE slug = 'test-justice-forward');
UPDATE org_bank_statement_lines SET ledger_transaction_id = NULL WHERE org_id IN (SELECT id FROM coop_members WHERE slug = 'test-justice-forward');
DELETE FROM org_bill_lines WHERE bill_id IN (SELECT id FROM org_bills WHERE org_id IN (SELECT id FROM coop_members WHERE slug = 'test-justice-forward'));
DELETE FROM org_invoice_lines WHERE invoice_id IN (SELECT id FROM org_invoices WHERE org_id IN (SELECT id FROM coop_members WHERE slug = 'test-justice-forward'));
DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id IN (SELECT id FROM coop_members WHERE slug = 'test-justice-forward'));
DELETE FROM coop_members WHERE slug = 'test-justice-forward';

DO $seed$
DECLARE
  v_org int; v_guy int; v_fin int;
BEGIN
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  SELECT id INTO v_fin FROM users WHERE email = 'gyacc@pm.me';
  IF v_guy IS NULL OR v_fin IS NULL THEN RAISE EXCEPTION 'login users not found'; END IF;

  -- ---- remove any previous copy
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  IF v_org IS NOT NULL THEN
    DELETE FROM org_fiscal_year_locks WHERE org_id = v_org;
    UPDATE org_bank_statement_lines SET ledger_transaction_id = NULL WHERE org_id = v_org;
    DELETE FROM org_bill_lines WHERE bill_id IN (SELECT id FROM org_bills WHERE org_id = v_org);
    DELETE FROM org_invoice_lines WHERE invoice_id IN (SELECT id FROM org_invoices WHERE org_id = v_org);
    DELETE FROM org_ledger_lines WHERE transaction_id IN (SELECT id FROM org_ledger_transactions WHERE org_id = v_org);
    DELETE FROM coop_members WHERE id = v_org;
  END IF;

  INSERT INTO coop_members (display_name, slug, member_since, membership_status)
    VALUES ('Tidal Shift', 'tidal-shift', now(), 'active') RETURNING id INTO v_org;

  UPDATE coop_members SET mission_summary = 'Legal action and policy advocacy for Gulf Coast communities facing industrial pollution and permitting decisions.',
      location_general = 'New Orleans, LA', size_band = 'over $1M', cooperative_turnarounds = ARRAY['energy','inequality'] WHERE id = v_org;

  INSERT INTO org_settings (org_id, ein, fiscal_year_end_month, entity_classification, federal_grant_recipient,
      has_lobbying_activity, actuals_source, onboarding_step, onboarding_completed_at, expense_claim_approval_mode)
    VALUES (v_org, '84-1234567', 12, '501c3', true, true, 'ledger', 'complete', now(), 'pre_approval');

  INSERT INTO org_users (org_id, user_id, role, accounting_entry_enabled, accounting_entry_enabled_at) VALUES
    (v_org, v_guy, 'admin', true, now()),
    (v_org, v_fin, 'finance', false, NULL);

  -- ---- programs (top-level programs, activities beneath them)
  INSERT INTO org_programs (org_id, code, name, description, program_kind, is_default) VALUES
    (v_org, 'LIT', 'Climate & Permitting Litigation', 'Challenges to industrial permits and enforcement failures', 'program', false),
    (v_org, 'FCP', 'Frontline Communities Program', 'Legal and technical partnership with fenceline communities', 'program', false),
    (v_org, 'CLC', 'Environmental Health & Housing Clinic', 'Free walk-in legal clinic for pollution, mold and flood-related claims', 'program', false),
    (v_org, 'POL', 'Climate Policy & Advocacy', 'State legislative and agency advocacy', 'program', false),
    (v_org, 'MG',  'Management & General', '', 'program', true),
    (v_org, 'FR',  'Fundraising', '', 'program', true);
  INSERT INTO org_programs (org_id, code, name, program_kind, parent_id)
    SELECT v_org, x.code, x.name, 'activity', (SELECT id FROM org_programs WHERE org_id = v_org AND code = x.parent)
    FROM (VALUES ('LIT-PERMIT','Permit Challenges','LIT'), ('LIT-REG','Regulatory Comments & Hearings','LIT'),
                 ('FCP-AIR','Fenceline Air Monitoring Project','FCP'), ('POL-LEG','Clean Air & Permitting Transparency Campaign','POL')) x(code,name,parent);
END
$seed$;

-- ---- chart of accounts
DO $coa$
DECLARE v_org int; r record;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  CREATE TEMP TABLE _coa (code text, name text, type text, lvl int, cat text, parent text, src text,
    cash bool DEFAULT false, ar bool DEFAULT false, ap bool DEFAULT false, clr bool DEFAULT false, contrib bool DEFAULT false,
    ecp bool DEFAULT false, unalloc bool DEFAULT false, noncash bool DEFAULT false, mtdc_ex bool DEFAULT false,
    stat bool DEFAULT false, r1099 bool DEFAULT false, ord serial) ON COMMIT DROP;
  INSERT INTO _coa (code,name,type,lvl,cat,parent,src) VALUES
   ('_H1_AST','ASSETS','asset',1,'ASSET_CURRENT',NULL,'schedule'),
   ('_H2_AST_CURRENT','Current Assets','asset',2,'ASSET_CURRENT','_H1_AST','schedule'),
   ('_H2_AST_FIXED','Fixed Assets','asset',2,'ASSET_FIXED','_H1_AST','schedule'),
   ('_H1_LIA','LIABILITIES','liability',1,'LIAB_CURRENT',NULL,'schedule'),
   ('_H2_LIAB_CURRENT','Current Liabilities','liability',2,'LIAB_CURRENT','_H1_LIA','schedule'),
   ('_H1_NET','NET ASSETS','equity',1,'NET_ASSETS',NULL,'schedule'),
   ('_H2_NET_ASSETS','Net Assets','equity',2,'NET_ASSETS','_H1_NET','schedule'),
   ('_H1_REV','REVENUE','income',1,'REV_EARNED',NULL,'schedule'),
   ('_H2_REV_EARNED','Earned Revenue','income',2,'REV_EARNED','_H1_REV','schedule'),
   ('_H2_REV_CONTRIB','Contributed Revenue','income',2,'REV_CONTRIB','_H1_REV','schedule'),
   ('_H1_EXP','EXPENSES','expense',1,'EXP_OPERATING',NULL,'schedule'),
   ('_H2_EXP_PERSONNEL','Personnel Expenses','expense',2,'EXP_PERSONNEL','_H1_EXP','schedule'),
   ('_H2_EXP_PROGRAM','Program & Case Expenses','expense',2,'EXP_PROGRAM','_H1_EXP','schedule'),
   ('_H2_EXP_OPERATING','Operating Expenses','expense',2,'EXP_OPERATING','_H1_EXP','schedule'),
   ('_H3_EXP_FUNDRAISING','Fundraising','expense',2,'EXP_OPERATING','_H1_EXP','schedule'),
   -- current assets
   ('1010','Operating Checking','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1030','Reserve Savings','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1040','Restricted Grants Account','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1045','IOLTA Client Trust Account','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1050','Card Processor Clearing','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1060','Gusto Payroll Clearing (Net Pay)','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1200','Grants Receivable','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1210','Accounts Receivable','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1220','Pledges Receivable','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1230','Court-Awarded Fees Receivable','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1250','Employee Advances','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1310','Prepaid Insurance','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1320','Other Prepaid Expenses','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1330','Security Deposits','asset',3,'ASSET_CURRENT','_H2_AST_CURRENT','schedule'),
   ('1410','Furniture & Equipment','asset',3,'ASSET_FIXED','_H2_AST_FIXED','schedule'),
   ('1420','Computer Equipment','asset',3,'ASSET_FIXED','_H2_AST_FIXED','schedule'),
   ('1430','Leasehold Improvements','asset',3,'ASSET_FIXED','_H2_AST_FIXED','schedule'),
   ('1490','Accumulated Depreciation','asset',3,'ASSET_FIXED','_H2_AST_FIXED','schedule'),
   -- liabilities
   ('2010','Accounts Payable','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2020','Expense Claims Payable','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2030','Unallocated Donor Receipts','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2100','Accrued Payroll','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2110','Payroll Taxes Payable (Fed, FICA, State, SUTA)','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2120','401(k) Contributions Payable','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2130','Health Insurance Payable','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2140','Accrued Vacation','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2200','Deferred Grant Revenue','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2210','Refundable Advances (Conditional Awards)','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   ('2400','Client Funds Held in Trust','liability',3,'LIAB_CURRENT','_H2_LIAB_CURRENT','schedule'),
   -- net assets
   ('3100','Net Assets Without Donor Restrictions','equity',3,'NET_ASSETS','_H2_NET_ASSETS','schedule'),
   ('3200','Net Assets With Donor Restrictions','equity',3,'NET_ASSETS','_H2_NET_ASSETS','schedule'),
   ('3300','Board-Designated Operating Reserve','equity',3,'NET_ASSETS','_H2_NET_ASSETS','schedule'),
   -- revenue
   ('4100','Government Grants & Contracts','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4110','Foundation Grants – Restricted','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4120','Foundation Grants – Unrestricted','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4130','Corporate Support','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4140','Individual Contributions','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4150','Major Gifts','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','grant_allocation'),
   ('4160','Special Events','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','schedule'),
   ('4170','In-Kind Contributions (Pro Bono & Goods)','income',3,'REV_CONTRIB','_H2_REV_CONTRIB','schedule'),
   ('4200','Court-Awarded Attorney Fees & Settlements','income',3,'REV_EARNED','_H2_REV_EARNED','schedule'),
   ('4210','Sliding-Scale Client Fees','income',3,'REV_EARNED','_H2_REV_EARNED','schedule'),
   ('4220','Training & CLE Revenue','income',3,'REV_EARNED','_H2_REV_EARNED','schedule'),
   ('4300','Interest & Investment Income','income',3,'REV_EARNED','_H2_REV_EARNED','schedule'),
   -- personnel
   ('6100','Attorney Salaries','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6110','Paralegal, Scientific & Legal Support Salaries','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6120','Organizer & Policy Staff Salaries','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6130','Administrative & Development Salaries','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6200','Contract Attorneys & Consultants','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6210','Expert Witnesses','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','schedule'),
   ('6300','Payroll Taxes – FICA/SUTA','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6400','Health Insurance & Benefits','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6500','Retirement Contributions (401k Match)','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   ('6600','Workers Compensation','expense',3,'EXP_PERSONNEL','_H2_EXP_PERSONNEL','personnel'),
   -- program and case
   ('6710','Court Filing Fees','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6720','Court Reporters & Transcripts','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6730','Interpreters & Translation','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6735','Air Monitoring Equipment & Lab Analysis','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6740','Discovery & E-Discovery','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6750','Legal Research Subscriptions','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6760','Client Assistance','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6770','Subgrants to Partner Organizations','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6780','Community Education & Outreach','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6790','Lobbying – Direct','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('6795','Lobbying – Grassroots','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   -- operating
   ('7100','Rent & Occupancy','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7110','Utilities','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7200','Office Supplies','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7300','Technology & Software','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7310','Payroll Service Fees','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7320','Telephone & Internet','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7400','Insurance (Liability, D&O, Malpractice)','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','insurance'),
   ('7500','Postage & Printing','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7600','Travel & Lodging','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7610','Mileage Reimbursement','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7700','Training & Professional Development','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7710','Bar Dues & Licenses','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7800','Communications & Media','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('7810','Fundraising Event Costs','expense',3,'EXP_OPERATING','_H3_EXP_FUNDRAISING','schedule'),
   ('7820','Direct Mail & Online Appeals','expense',3,'EXP_OPERATING','_H3_EXP_FUNDRAISING','schedule'),
   ('8100','Audit & Accounting Fees','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('8300','Bank & Card Processing Fees','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('8400','Depreciation','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('8500','Subscriptions & Memberships','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('8900','Miscellaneous Expense','expense',3,'EXP_OPERATING','_H2_EXP_OPERATING','schedule'),
   ('9100','Clients Served (statistical)','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule'),
   ('9110','Cases Opened (statistical)','expense',3,'EXP_PROGRAM','_H2_EXP_PROGRAM','schedule');
  UPDATE _coa SET cash = true WHERE code IN ('1010','1030','1040');
  UPDATE _coa SET clr = true WHERE code = '1050';
  UPDATE _coa SET ar = true WHERE code = '1210';
  UPDATE _coa SET ap = true WHERE code = '2010';
  UPDATE _coa SET ecp = true WHERE code = '2020';
  UPDATE _coa SET unalloc = true WHERE code = '2030';
  UPDATE _coa SET contrib = true WHERE code = '4140';
  UPDATE _coa SET noncash = true WHERE code = '8400';
  UPDATE _coa SET mtdc_ex = true WHERE code IN ('6770','1410','1420','1430');
  UPDATE _coa SET stat = true WHERE code IN ('9100','9110');
  UPDATE _coa SET r1099 = true WHERE code IN ('6200','6210','6720','6730');

  FOR r IN SELECT * FROM _coa ORDER BY lvl, ord LOOP
    INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, standard_category, budget_source,
        is_cash_account, is_system_ar_account, is_system_ap_account, is_system_clearing_account,
        is_system_contribution_revenue_account, is_system_expense_claims_payable_account,
        is_system_unallocated_receipts_account, is_non_cash, is_mtdc_excluded, is_statistical, is_1099_reportable,
        parent_id, rollup_parent_id)
      VALUES (v_org, r.code, r.name, r.type::org_account_type, r.lvl, r.lvl = 3, r.cat, r.src,
        r.cash, r.ar, r.ap, r.clr, r.contrib, r.ecp, r.unalloc, r.noncash, r.mtdc_ex, r.stat, r.r1099,
        (SELECT id FROM org_accounts WHERE org_id = v_org AND code = r.parent),
        (SELECT id FROM org_accounts WHERE org_id = v_org AND code = r.parent));
  END LOOP;
END
$coa$;

-- ---- contacts: funders, donors, board, vendors, customers
DO $contacts$
DECLARE v_org int; i int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  -- Organizations and the one individual vendor: (name, kind, org_type, roles, tags)
  CREATE TEMP TABLE _seed_contacts (nm text, kind text, org_type text, roles text[], tags text[]) ON COMMIT DROP;
  INSERT INTO _seed_contacts VALUES
    ('Horizon Climate Foundation','organization','foundation','{donor}','{funder}'),
    ('Greenfield Community Foundation','organization','foundation','{donor}','{funder}'),
    ('Meridian Community Bank Foundation','organization','foundation','{donor,customer}','{funder,corporate}'),
    ('Civic Voice Fund','organization','foundation','{donor}','{funder}'),
    ('Pelican Climate Fund','organization','foundation','{donor}','{funder}'),
    ('State Access to Justice Commission','organization','government','{donor,customer}','{funder,government}'),
    ('State Department of Environmental Quality','organization','government','{donor,customer}','{funder,government,pass-through}'),
    ('Harbor Law School Clinic','organization','member_organization','{customer}','{partner}'),
    ('Bayou Community Science Collaborative','organization','member_organization','{vendor}','{partner,subrecipient}'),
    ('Eastside Residents Alliance','organization','member_organization','{vendor}','{partner,subrecipient}'),
    ('Okafor & Lindqvist LLP (co-counsel)','organization','member_organization','{vendor,customer}','{co-counsel}'),
    ('Gusto','organization','corporate','{vendor}','{payroll}'),
    ('Cedar Street Properties','organization','corporate','{vendor}','{landlord}'),
    ('Westlaw Research Services','organization','corporate','{vendor}','{legal research}'),
    ('Precision Court Reporting','organization','corporate','{vendor}','{1099}'),
    ('Dr. Elena Marchetti, Atmospheric Scientist','individual',NULL,'{vendor}','{expert,1099}'),
    ('Lingua Bridge Interpreters','organization','corporate','{vendor}','{1099}'),
    ('Lakeshore Insurance Brokers','organization','corporate','{vendor}','{insurance}'),
    ('Brightline CPA Group','organization','corporate','{vendor}','{audit}'),
    ('NorthStar IT Services','organization','corporate','{vendor}','{it}'),
    ('Print & Post Co.','organization','corporate','{vendor}','{print}'),
    ('Maple Hall Events','organization','corporate','{vendor}','{events}'),
    ('Civic Reach Digital','organization','corporate','{vendor}','{communications}');
  INSERT INTO org_constituents (org_id, display_name, kind, org_type, tags)
    SELECT v_org, nm, kind, org_type, tags FROM _seed_contacts;
  INSERT INTO org_contact_roles (org_id, constituent_id, role)
    SELECT v_org, c.id, r FROM _seed_contacts sc
      JOIN org_constituents c ON c.org_id = v_org AND c.display_name = sc.nm
      CROSS JOIN LATERAL unnest(sc.roles) AS r;
  -- board (7)
  INSERT INTO org_constituents (org_id, display_name, first_name, last_name, kind, email, tags)
  SELECT v_org, f||' '||l, f, l, 'individual', 'board' || n || '@example.invalid', '{board}'
  FROM (VALUES (1,'Board','chair'),(2,'Board','treasurer'),(3,'Board','secretary'),(4,'Board member','04'),
               (5,'Board member','05'),(6,'Board member','06'),(7,'Board member','07')) b(n,f,l);
  INSERT INTO org_contact_roles (org_id, constituent_id, role)
    SELECT v_org, c.id, r FROM org_constituents c CROSS JOIN unnest(ARRAY['donor','board_member']) AS r
     WHERE c.org_id = v_org AND '{board}' <@ c.tags;
  -- individual donors: 12, one record per person
  FOR i IN 1..12 LOOP
    INSERT INTO org_constituents (org_id, display_name, first_name, last_name, kind, email, tags)
    VALUES (v_org, 'Donor ' || lpad(i::text, 2, '0'), 'Donor', lpad(i::text, 2, '0'), 'individual',
      'donor' || i || '@example.invalid', CASE WHEN i <= 4 THEN '{major donor}'::text[] ELSE '{}'::text[] END);
  END LOOP;
  INSERT INTO org_contact_roles (org_id, constituent_id, role)
    SELECT v_org, c.id, 'donor' FROM org_constituents c
     WHERE c.org_id = v_org AND c.kind = 'individual' AND c.first_name IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = c.id AND r.role = 'donor');
END
$contacts$;

-- ---- grants
DO $grants$
DECLARE v_org int; v_guy int;
  p_lit int; p_imm int; p_clc int; p_pol int; p_mg int; p_envx int; p_voteX int; p_asy int; p_leg int;
  BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  SELECT id INTO p_lit FROM org_programs WHERE org_id=v_org AND code='LIT';
  SELECT id INTO p_imm FROM org_programs WHERE org_id=v_org AND code='FCP';
  SELECT id INTO p_clc FROM org_programs WHERE org_id=v_org AND code='CLC';
  SELECT id INTO p_pol FROM org_programs WHERE org_id=v_org AND code='POL';
  SELECT id INTO p_mg  FROM org_programs WHERE org_id=v_org AND code='MG';

  INSERT INTO org_grants (org_id, funder, name, grant_code, amount_cents, start_date, end_date, period_start_date, period_end_date,
      award_date, status, grant_type, primary_program_id, allocation_mode, revenue_account_id, constituent_id,
      donor_restriction_class, restrictions, funder_grant_id, fy_allocations, institution_type,
      is_federal_award, federal_awarding_agency, aln, pass_through_entity_name, pass_through_identifying_number,
      amount_passed_to_subrecipients_cents, indirect_cost_rate_type, indirect_cost_rate_bps, indirect_cost_base,
      next_report_due)
  SELECT v_org, x.funder, x.name, x.code, x.amt, x.sd, x.ed, x.sd, x.ed, x.award, x.status, x.gtype, x.prog, 'amount',
      (SELECT id FROM org_accounts WHERE org_id=v_org AND code=x.rev),
      (SELECT id FROM org_constituents WHERE org_id=v_org AND display_name=x.funder),
      x.rc::org_restriction_class, x.restr, x.fid, x.fy::jsonb, x.inst,
      x.fed, x.agency, x.aln, x.pte, x.pten, x.sub, x.irt::org_indirect_cost_rate_type, x.irb, 'mtdc'::org_indirect_cost_base, x.nrd
  FROM (VALUES
    ('Horizon Climate Foundation','Climate Justice Litigation Fund','HCF-2025',150000000::bigint,DATE '2025-01-01',DATE '2027-12-31',DATE '2024-11-15','awarded','restricted',p_lit,'4110','temporarily_restricted','Litigation costs for industrial permit challenges and regulatory proceedings only','EQF-25-0417','{"FY2025": 50000000, "FY2026": 50000000, "FY2027": 50000000}','foundation',false,NULL,NULL,NULL,NULL,NULL::bigint,'none',NULL::int,DATE '2026-12-15'),
    ('State Department of Environmental Quality','Community Air Monitoring & Legal Assistance (federal pass-through)','EPA-2025',105000000,DATE '2025-07-01',DATE '2027-06-30',DATE '2025-05-20','awarded','restricted',p_imm,'4100','temporarily_restricted','Fenceline air monitoring and legal assistance to affected residents; 2 CFR 200 applies','EPA-SUB-8821','{"FY2025": 26250000, "FY2026": 52500000, "FY2027": 26250000}','government',true,'U.S. Environmental Protection Agency','66.940','State Department of Environmental Quality','DPS-EPA-2025-114',NULL,'de_minimis',1500,DATE '2026-10-31'),
    ('Greenfield Community Foundation','Fenceline Communities Fund','GCF-2026',70000000,DATE '2025-01-01',DATE '2026-12-31',DATE '2024-12-02','awarded','restricted',p_imm,'4110','temporarily_restricted','Fenceline community partnerships; up to $40,000 may be passed to Bayou Community Science Collaborative','GCF-2026-092','{"FY2025": 30000000, "FY2026": 40000000}','foundation',false,NULL,NULL,NULL,NULL,4000000,'none',NULL,DATE '2026-12-31'),
    ('State Access to Justice Commission','IOLTA Civil Legal Aid Grant','A2J-2026',65000000,DATE '2025-01-01',DATE '2026-12-31',DATE '2024-11-10','awarded','restricted',p_clc,'4100','temporarily_restricted','Environmental health and housing clinic operations; quarterly reports','A2J-26-33','{"FY2025": 30000000, "FY2026": 35000000}','government',false,NULL,NULL,NULL,NULL,NULL,'none',NULL,DATE '2026-10-15'),
    ('Meridian Community Bank Foundation','General Operating Support 2026','MBF-2026',15000000,DATE '2026-01-01',DATE '2026-12-31',DATE '2026-02-01','awarded','unrestricted',p_mg,'4130','unrestricted','General operating','MBF-26-7','{"FY2026": 15000000}','corporate',false,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL),
    ('Civic Voice Fund','Clean Air & Permitting Transparency Campaign Grant','CVF-2026',25000000,DATE '2026-03-01',DATE '2027-02-28',DATE '2026-02-20','awarded','restricted',p_pol,'4110','temporarily_restricted','Policy advocacy; lobbying portion capped under 501(h) election','CVF-26-12','{"FY2026": 15000000, "FY2027": 10000000}','foundation',false,NULL,NULL,NULL,NULL,NULL,'none',NULL,DATE '2027-01-31'),
    ('Pelican Climate Fund','Clean Energy Accountability Project','PCF-2027',60000000,DATE '2027-01-01',DATE '2028-12-31',NULL,'applied','restricted',p_lit,'4110','temporarily_restricted','Application submitted 2026-09-12','','{"FY2027": 30000000, "FY2028": 30000000}','foundation',false,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL),
    ('Horizon Climate Foundation','Capacity Building Renewal','HCF-2028',25000000,DATE '2028-01-01',DATE '2030-12-31',NULL,'prospect','restricted',p_mg,'4110','temporarily_restricted','Concept note stage','','{}','foundation',false,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL)
  ) x(funder,name,code,amt,sd,ed,award,status,gtype,prog,rev,rc,restr,fid,fy,inst,fed,agency,aln,pte,pten,sub,irt,irb,nrd);
END
$grants$;

-- ---- staff (FY2025 and FY2026 rows). Fields: name, title, type, salary, program split
DO $staff$
DECLARE v_org int; v_guy int; fy int; s record; pid bigint; v_sal int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  FOR fy IN 2025..2026 LOOP
    FOR s IN SELECT * FROM (VALUES
      ('Renata Silva','Executive Director',16500000,'6130','MG:60,FR:20,POL:20',true),
      ('Michael Odum','Legal Director',14500000,'6100','LIT:70,CLC:30',true),
      ('Anika Rao','Senior Staff Attorney',11800000,'6100','LIT-PERMIT:100',false),
      ('David Kessler','Senior Staff Attorney',11200000,'6100','LIT-REG:100',false),
      ('Lena Whitaker','Staff Attorney',9800000,'6100','LIT-PERMIT:100',false),
      ('Omar Haddad','Staff Attorney',9400000,'6100','LIT-REG:100',false),
      ('Sofia Mendes','Directing Attorney, Frontline Communities',12500000,'6100','FCP:100',true),
      ('Tariq Hussain','Staff Attorney, Frontline Communities',9200000,'6100','FCP-AIR:100',false),
      ('Grace Liu','Staff Attorney, Frontline Communities',9000000,'6100','FCP:100',false),
      ('Carla Jimenez','Paralegal',6800000,'6110','FCP:100',false),
      ('Peter Novak','Paralegal',6400000,'6110','LIT:100',false),
      ('Yusuf Demir','Environmental Scientist (air monitoring)',7000000,'6110','FCP-AIR:100',false),
      ('Hannah Brooks','Clinic Supervising Attorney',10500000,'6100','CLC:100',false),
      ('Ines Duarte','Clinic Intake Coordinator',5800000,'6110','CLC:100',false),
      ('Walter Fenn','Policy Director',12000000,'6120','POL:60,POL-LEG:40',true),
      ('Maya Thompson','Community Organizer',7200000,'6120','POL-LEG:100',false),
      ('Ravi Patel','Community Organizer',6800000,'6120','POL:100',false),
      ('Chloe Barnes','Communications Manager',8200000,'6130','POL:50,MG:50',false),
      ('Gwen Aldridge','Finance Director',11500000,'6130','MG:100',true),
      ('Julian Reyes','Development Director',11200000,'6130','FR:100',true),
      ('Nadia Ferreira','Grants Manager',8500000,'6130','FR:60,MG:40',false),
      ('Tom Eriksen','Operations Coordinator',6200000,'6130','MG:100',false)
    ) q(nm,title,sal,acct,split,officer) LOOP
      v_sal := round(s.sal * CASE WHEN fy = 2026 THEN 1.035 ELSE 1 END);
      INSERT INTO org_personnel (org_id, fiscal_year, worker_type, full_name, title, salary_account_id, annual_salary_cents,
          fte_bps, start_month, end_month, health_tier, employment_type, flsa_status, created_by, avg_hours_per_week, is_officer_or_key)
        VALUES (v_org, fy, 'employee', s.nm, s.title, (SELECT id FROM org_accounts WHERE org_id=v_org AND code=s.acct),
          v_sal, 10000, 1, 12, 'employee_only', 'full-time', 'exempt', v_guy, 40, s.officer)
        RETURNING id INTO pid;
      INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
        SELECT pid, v_org, (SELECT id FROM org_programs WHERE org_id=v_org AND code = split_part(t,':',1)), split_part(t,':',2)::int * 100
        FROM unnest(string_to_array(s.split, ',')) t;
    END LOOP;
  END LOOP;
END
$staff$;

-- ---- board-designated funds (the FY2025 lock is set at the end of section 2)
DO $misc$
DECLARE v_org int; v_guy int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  INSERT INTO org_board_designations (org_id, name, purpose, board_approved_date, board_resolution_ref, status, created_by)
    VALUES (v_org, 'Operating Reserve (3 months)', 'Board-designated reserve equal to three months of operating costs', DATE '2025-06-18', 'Resolution 2025-07', 'active', v_guy),
           (v_org, 'Litigation Contingency', 'Set aside for adverse cost awards', DATE '2026-04-22', 'Resolution 2026-03', 'active', v_guy);
END
$misc$;
