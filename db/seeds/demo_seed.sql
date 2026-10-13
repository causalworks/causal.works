-- =============================================================================
-- DEMO COMPANY SEED  --  db/seeds/demo_seed.sql
-- =============================================================================
-- Target org : demo-company  (id = 42)
-- FY coverage: FY2025 (full year) + FY2026 (active, H1 actuals)
-- Run        : sudo -u postgres psql causal_db -f db/seeds/demo_seed.sql
-- =============================================================================
-- KNOWN GAPS (log for next pass):
--   [G1] source_ref_id not linked on budget lines (would need runtime IDs)
--   [G2] Deferred-revenue clearing workflow not yet built
--   [G3] Grants-receivable reconciliation workflow not yet built
--   [G4] Verify report UI rolls activity rows up under parent program subtotal
--   [G5] Verify GRT-07 (prospect) is hidden from budget grids
--   [G6] Indirect-cost recovery allocation lines stubbed in schedules only
-- =============================================================================

BEGIN;

-- ── 1. RESET (FK-safe order) ──────────────────────────────────────────────

DELETE FROM coop_functional_classifications WHERE coop_org_id = 42;
DELETE FROM coop_balance_sheet_snapshots    WHERE coop_org_id = 42;
DELETE FROM coop_actuals                    WHERE coop_org_id = 42;
DELETE FROM coop_budget_lines               WHERE coop_org_id = 42;
DELETE FROM coop_schedule_items             WHERE coop_org_id = 42;
DELETE FROM coop_schedules                  WHERE coop_org_id = 42;
DELETE FROM coop_allocation_lines
  WHERE coop_allocation_schedule_id IN (
    SELECT id FROM coop_allocation_schedules WHERE coop_org_id = 42);
DELETE FROM coop_allocation_schedules       WHERE coop_org_id = 42;
DELETE FROM coop_grant_allocations          WHERE coop_org_id = 42;
DELETE FROM coop_grants                     WHERE coop_org_id = 42;
DELETE FROM coop_personnel_allocations      WHERE coop_org_id = 42;
DELETE FROM coop_personnel                  WHERE coop_org_id = 42;
DELETE FROM coop_fringe_settings            WHERE coop_org_id = 42;
-- projections and xero maps (no CASCADE from programs)
DELETE FROM coop_projections                WHERE coop_org_id = 42;
DELETE FROM coop_xero_program_track_map     WHERE coop_org_id = 42;
-- accounts: L3 first (parent_id RESTRICT), then L2, then L1
DELETE FROM coop_accounts WHERE coop_org_id = 42 AND level = 3;
DELETE FROM coop_accounts WHERE coop_org_id = 42 AND level = 2;
DELETE FROM coop_accounts WHERE coop_org_id = 42 AND level = 1;
-- programs: activities (parent_id NOT NULL) before top-level
DELETE FROM coop_programs WHERE coop_org_id = 42 AND parent_id IS NOT NULL;
DELETE FROM coop_programs WHERE coop_org_id = 42 AND parent_id IS NULL;

-- Re-running this script resets display_name to whatever is hardcoded below — if the
-- demo org gets renamed again via Settings, update this literal too or a reseed will
-- silently revert it (this is how it drifted to a stale 'CausalNP Demo' last time).
UPDATE coop_orgs
SET display_name = 'Demo Company', fiscal_year_end_month = 12,
    onboarding_completed_at = NOW()
WHERE id = 42;


-- ── 2. ACCOUNTS ───────────────────────────────────────────────────────────
-- Level 1: section headers (not posting)

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting) VALUES
  (42, '_H1_ASSETS',     'Assets',                  'asset',     1, false),
  (42, '_H1_LIAB',       'Liabilities',             'liability', 1, false),
  (42, '_H1_NET_ASSETS', 'Net Assets',              'equity',    1, false),
  (42, '_H1_INCOME',     'Revenue',                 'income',    1, false),
  (42, '_H1_EXPENSE',    'Expenses',                'expense',   1, false);

-- Level 2: group headers (parent = L1)

-- Asset groups
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_CURR_ASSETS', 'Current Assets', 'asset', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_ASSETS';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_FIXED', 'Fixed Assets', 'asset', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_ASSETS';

-- Liability groups
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_CURR_LIAB', 'Current Liabilities', 'liability', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_LIAB';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_DEFERRED', 'Deferred Revenue', 'liability', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_LIAB';

-- Net assets group
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_NET_ASSETS', 'Net Asset Classes', 'equity', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_NET_ASSETS';

-- Income groups
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_GRANTS', 'Grants & Contracts', 'income', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_INCOME';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_CONTRIB', 'Contributions', 'income', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_INCOME';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_EARNED', 'Earned Revenue', 'income', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_INCOME';

-- Expense groups
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_PERSONNEL', 'Personnel Costs', 'expense', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_EXPENSE';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_PROG_EXP', 'Program Expenses', 'expense', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_EXPENSE';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_OPERATING', 'Operating Expenses', 'expense', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_EXPENSE';

INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 42, '_H2_ADMIN', 'Administrative Expenses', 'expense', 2, false, id
FROM coop_accounts WHERE coop_org_id = 42 AND code = '_H1_EXPENSE';

-- Level 3: posting accounts (parent_id + rollup_parent_id both point to L2)

-- Assets – Current
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'asset', 3, true, p.id, p.id
FROM (VALUES
  ('1100', 'Cash – Operating'),
  ('1110', 'Cash – Money Market'),
  ('1200', 'Grants Receivable'),
  ('1210', 'Accounts Receivable'),
  ('1300', 'Prepaid Insurance'),
  ('1310', 'Prepaid Rent'),
  ('1320', 'Other Prepaid Expenses')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_CURR_ASSETS';

-- Assets – Fixed
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'asset', 3, true, p.id, p.id
FROM (VALUES
  ('1400', 'Furniture & Equipment'),
  ('1410', 'Computer Equipment'),
  ('1420', 'Leasehold Improvements'),
  ('1490', 'Accumulated Depreciation')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_FIXED';

-- Liabilities – Current
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'liability', 3, true, p.id, p.id
FROM (VALUES
  ('2100', 'Accounts Payable'),
  ('2110', 'Accrued Salaries & Benefits'),
  ('2120', 'Accrued Vacation')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_CURR_LIAB';

-- Liabilities – Deferred
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'liability', 3, true, p.id, p.id
FROM (VALUES
  ('2200', 'Deferred Grant Revenue – Restricted'),
  ('2210', 'Deferred Program Revenue')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_DEFERRED';

-- Net Assets
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'equity', 3, true, p.id, p.id
FROM (VALUES
  ('3100', 'Net Assets Without Donor Restrictions'),
  ('3200', 'Net Assets With Donor Restrictions')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_NET_ASSETS';

-- Income – Grants
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'income', 3, true, p.id, p.id
FROM (VALUES
  ('4100', 'Foundation Grants – Restricted'),
  ('4200', 'Foundation Grants – Unrestricted'),
  ('4300', 'Government Contracts')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_GRANTS';

-- Income – Contributions
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'income', 3, true, p.id, p.id
FROM (VALUES
  ('4400', 'Individual Contributions'),
  ('4500', 'Corporate Support')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_CONTRIB';

-- Income – Earned
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'income', 3, true, p.id, p.id
FROM (VALUES
  ('4600', 'Program Service Revenue'),
  ('4700', 'Special Events Revenue'),
  ('4800', 'Investment Income')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_EARNED';

-- Expense – Personnel
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'expense', 3, true, p.id, p.id
FROM (VALUES
  ('5100', 'Staff Salaries'),
  ('5200', 'Contractor Fees'),
  ('5300', 'Payroll Taxes – FICA/SUTA'),
  ('5400', 'Health Insurance'),
  ('5410', 'Dental & Vision'),
  ('5500', 'Retirement Contributions'),
  ('5600', 'Workers'' Compensation')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_PERSONNEL';

-- Expense – Program
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'expense', 3, true, p.id, p.id
FROM (VALUES
  ('6100', 'Program Supplies'),
  ('6200', 'Program Travel'),
  ('6300', 'Program Consultants'),
  ('6400', 'Direct Client Services'),
  ('6500', 'Training & Education'),
  ('6600', 'Subgrants & Subcontracts')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_PROG_EXP';

-- Expense – Operating
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'expense', 3, true, p.id, p.id
FROM (VALUES
  ('7100', 'Rent & Occupancy'),
  ('7200', 'Office Supplies'),
  ('7300', 'Technology & Software'),
  ('7400', 'Telephone & Internet'),
  ('7500', 'Postage & Printing'),
  ('7600', 'General Liability Insurance'),
  ('7700', 'Equipment Rental'),
  ('7800', 'Depreciation')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_OPERATING';

-- Expense – Administrative
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id, rollup_parent_id)
SELECT 42, v.code, v.name, 'expense', 3, true, p.id, p.id
FROM (VALUES
  ('8100', 'Audit & Legal Fees'),
  ('8200', 'Accounting & Bookkeeping'),
  ('8300', 'Board Expenses'),
  ('8400', 'Marketing & Outreach'),
  ('8500', 'Subscriptions & Memberships')
) AS v(code, name)
JOIN coop_accounts p ON p.coop_org_id = 42 AND p.code = '_H2_ADMIN';


-- ── 3. PROGRAMS ───────────────────────────────────────────────────────────
-- Top-level programs first

INSERT INTO coop_programs (coop_org_id, code, name, description, active, program_kind)
VALUES
  (42, 'PROG-A', 'Program A',                'Primary service delivery program',   true, 'program'),
  (42, 'PROG-B', 'Program B',                'Secondary service delivery program',  true, 'program'),
  (42, 'PROG-C', 'Program C',                'Tertiary service delivery program',   true, 'program'),
  (42, 'PROG-D', 'General & Administration', 'Organizational overhead and finance', true, 'program'),
  (42, 'PROG-E', 'Fundraising',              'Development and donor stewardship',   true, 'program');

-- Activities (children of programs)
INSERT INTO coop_programs (coop_org_id, code, name, description, active, program_kind, parent_id)
SELECT 42, 'ACT-A1', 'Activity A1', 'Sub-activity under Program A', true, 'activity', id
FROM coop_programs WHERE coop_org_id = 42 AND code = 'PROG-A';

INSERT INTO coop_programs (coop_org_id, code, name, description, active, program_kind, parent_id)
SELECT 42, 'ACT-A2', 'Activity A2', 'Sub-activity under Program A', true, 'activity', id
FROM coop_programs WHERE coop_org_id = 42 AND code = 'PROG-A';

INSERT INTO coop_programs (coop_org_id, code, name, description, active, program_kind, parent_id)
SELECT 42, 'ACT-B1', 'Activity B1', 'Sub-activity under Program B', true, 'activity', id
FROM coop_programs WHERE coop_org_id = 42 AND code = 'PROG-B';


-- ── 4. FRINGE SETTINGS ────────────────────────────────────────────────────

INSERT INTO coop_fringe_settings (
  coop_org_id,
  suta_rate_bps, suta_wage_base_cents,
  workers_comp_rate_bps,
  health_ee_monthly_cents, health_ee_spouse_monthly_cents, health_ee_family_monthly_cents,
  retirement_rate_bps,
  dental_vision_monthly_cents,
  disability_rate_bps,
  ss_wage_base_cents,
  -- account links (set after accounts exist)
  fica_account_id,
  suta_account_id,
  workers_comp_account_id,
  retirement_account_id,
  health_account_id,
  dental_vision_account_id,
  notes
) VALUES (
  42,
  270,  700000,   -- SUTA 2.70%, $7K wage base
  150,            -- Workers Comp 1.50%
  65000, 120000, 180000,  -- health tiers: EE $650, EE+Spouse $1,200, Family $1,800
  300,            -- retirement 3.00%
  8000,           -- dental/vision $80/mo
  25,             -- disability 0.25%
  16860000,       -- SS wage base $168,600
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5300'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5300'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5600'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5500'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5400'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5410'),
  'Demo company fringe rates — FY2025/2026'
);


-- ── 5. GRANTS ─────────────────────────────────────────────────────────────

INSERT INTO coop_grants (
  coop_org_id, grant_code, funder, name,
  amount_cents, start_date, end_date,
  status, grant_type, allocation_mode,
  primary_program_id,
  fy_allocations, restrictions, notes
)
SELECT
  42, v.grant_code, v.funder, v.name,
  v.amount_cents, v.start_date::date, v.end_date::date,
  v.status, v.grant_type, 'amount',
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code=v.primary_prog),
  v.fy_alloc::jsonb, v.restrictions, v.notes
FROM (VALUES
  ('GRT-01', 'Funder A',   'General Support Grant – Funder A',
   15000000, '2025-01-01', '2027-12-31', 'awarded', 'restricted',
   'PROG-A',
   '{"FY2025":4500000,"FY2026":5000000,"FY2027":5500000}',
   'Restricted to Program A service delivery', 'Multi-year; 3 installments'),

  ('GRT-02', 'Funder B',   'Program B Initiative – Funder B',
   9000000, '2026-01-01', '2026-12-31', 'awarded', 'restricted',
   'PROG-B',
   '{"FY2026":9000000}',
   'Restricted to Program B activities', NULL),

  ('GRT-03', 'Agency C',   'Contract 2025-C – Agency C',
   22000000, '2025-01-01', '2026-12-31', 'awarded', 'restricted',
   'PROG-A',
   '{"FY2025":11000000,"FY2026":11000000}',
   'Government contract; Program A delivery', 'Reimbursement-basis; invoiced monthly'),

  ('GRT-04', 'Corp D',     'General Operating Support – Corp D',
   3500000, '2026-01-01', '2026-12-31', 'awarded', 'unrestricted',
   'PROG-D',
   '{"FY2026":3500000}',
   NULL, 'Annual corporate gift; unrestricted'),

  ('GRT-05', 'Funder E',   'Program C Expansion – Funder E',
   6500000, '2026-01-01', '2026-12-31', 'awarded', 'restricted',
   'PROG-C',
   '{"FY2026":6500000}',
   'Restricted to Program C expansion activities', NULL),

  ('GRT-06', 'Agency F',   'Multi-Program Contract – Agency F',
   27500000, '2025-01-01', '2026-12-31', 'awarded', 'restricted',
   'PROG-A',
   '{"FY2025":13750000,"FY2026":13750000}',
   'Programs A and B; cost-reimbursement', 'Reports due quarterly'),

  ('GRT-07', 'Funder G',   'Capacity Building Grant – Funder G',
   12000000, '2027-01-01', '2027-12-31', 'prospect', 'restricted',
   'PROG-A',
   '{"FY2027":12000000}',
   'Anticipated restricted grant; pending LOI', 'Application due Q3 2026')
) AS v(grant_code, funder, name, amount_cents, start_date, end_date, status, grant_type,
        primary_prog, fy_alloc, restrictions, notes);


-- ── 6. NAMED SCHEDULES (coop_schedules) ──────────────────────────────────

INSERT INTO coop_schedules (coop_org_id, fiscal_year, name, schedule_type, status, sort_order)
VALUES
  (42, 2025, 'General Liability Insurance',     'custom',      'active', 1),
  (42, 2025, 'Computer Equipment Depreciation', 'depreciation','active', 2),
  (42, 2025, 'Annual Audit Fee',                'event',       'active', 3),
  (42, 2026, 'General Liability Insurance',     'custom',      'active', 1),
  (42, 2026, 'Computer Equipment Depreciation', 'depreciation','active', 2),
  (42, 2026, 'Annual Audit Fee',                'event',       'active', 3),
  (42, 2026, 'Office Equipment Lease',          'custom',      'active', 4);

-- Schedule items for FY2026 -- insurance (one_time July, maps to 7600)
INSERT INTO coop_schedule_items (
  coop_org_id, fiscal_year, named_schedule_id,
  account_id, program_id,
  label, schedule_type, quantity, unit_amount_cents,
  frequency, start_month, end_month,
  policy_start_date, policy_end_date
)
SELECT
  42, 2026,
  (SELECT id FROM coop_schedules WHERE coop_org_id=42 AND fiscal_year=2026 AND name='General Liability Insurance'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7600'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  'Annual GL Policy FY2026', 'insurance', 1, 960000,
  'one_time', 7, 7,
  '2026-07-01', '2027-06-30';

-- Schedule items for FY2026 -- depreciation (monthly, maps to 7800)
-- Two items: Furniture $35K/60mo=$583/mo, Computers $28K/36mo=$778/mo
INSERT INTO coop_schedule_items (
  coop_org_id, fiscal_year, named_schedule_id,
  account_id, program_id,
  label, schedule_type, quantity, unit_amount_cents,
  frequency, start_month, end_month
)
SELECT
  42, 2026,
  (SELECT id FROM coop_schedules WHERE coop_org_id=42 AND fiscal_year=2026 AND name='Computer Equipment Depreciation'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7800'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  v.label, 'custom', 1, v.monthly_cents,
  'monthly', 1, 12
FROM (VALUES
  ('Furniture & Equipment depreciation', 58300),
  ('Computer equipment depreciation',    77800)
) AS v(label, monthly_cents);

-- Schedule items for FY2026 -- annual audit (one_time December, maps to 8100)
INSERT INTO coop_schedule_items (
  coop_org_id, fiscal_year, named_schedule_id,
  account_id, program_id,
  label, schedule_type, quantity, unit_amount_cents,
  frequency, start_month, end_month
)
SELECT
  42, 2026,
  (SELECT id FROM coop_schedules WHERE coop_org_id=42 AND fiscal_year=2026 AND name='Annual Audit Fee'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8100'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  'Annual Financial Statement Audit', 'custom', 1, 1800000,
  'one_time', 12, 12;

-- Schedule items for FY2026 -- office equipment lease (monthly, maps to 7700)
INSERT INTO coop_schedule_items (
  coop_org_id, fiscal_year, named_schedule_id,
  account_id, program_id,
  label, schedule_type, quantity, unit_amount_cents,
  frequency, start_month, end_month
)
SELECT
  42, 2026,
  (SELECT id FROM coop_schedules WHERE coop_org_id=42 AND fiscal_year=2026 AND name='Office Equipment Lease'),
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7700'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  'Copier & printer lease', 'custom', 1, 60000,
  'monthly', 1, 12;


-- ── 7. ALLOCATION SCHEDULES ───────────────────────────────────────────────

-- Indirect cost recovery (15% rate, conceptual -- [G6] budget lines not auto-generated)
INSERT INTO coop_allocation_schedules (
  coop_org_id, name, fiscal_year,
  total_amount_cents, distribution_type, monthly_pattern, active
) VALUES
  (42, 'Indirect Cost Recovery (15%)', 2025,  4200000, 'fixed_percent_by_program', 'even', true),
  (42, 'Indirect Cost Recovery (15%)', 2026,  4700000, 'fixed_percent_by_program', 'even', true),
  (42, 'Rent Allocation',              2025,  7200000, 'fixed_percent_by_program', 'even', true),
  (42, 'Rent Allocation',              2026,  7200000, 'fixed_percent_by_program', 'even', true);

-- Rent allocation lines (7100, split A 30% / B 30% / C 20% / D 20%)
INSERT INTO coop_allocation_lines (coop_allocation_schedule_id, coop_program_id, coop_account_id, percent_bps)
SELECT s.id, p.id, a.id, v.bps
FROM (VALUES
  ('PROG-A', 3000),
  ('PROG-B', 3000),
  ('PROG-C', 2000),
  ('PROG-D', 2000)
) AS v(prog_code, bps)
JOIN coop_programs  p ON p.coop_org_id = 42 AND p.code = v.prog_code
JOIN coop_accounts  a ON a.coop_org_id = 42 AND a.code = '7100'
JOIN coop_allocation_schedules s ON s.coop_org_id = 42 AND s.name = 'Rent Allocation' AND s.fiscal_year = 2026;

INSERT INTO coop_allocation_lines (coop_allocation_schedule_id, coop_program_id, coop_account_id, percent_bps)
SELECT s.id, p.id, a.id, v.bps
FROM (VALUES
  ('PROG-A', 3000),
  ('PROG-B', 3000),
  ('PROG-C', 2000),
  ('PROG-D', 2000)
) AS v(prog_code, bps)
JOIN coop_programs  p ON p.coop_org_id = 42 AND p.code = v.prog_code
JOIN coop_accounts  a ON a.coop_org_id = 42 AND a.code = '7100'
JOIN coop_allocation_schedules s ON s.coop_org_id = 42 AND s.name = 'Rent Allocation' AND s.fiscal_year = 2025;


-- ── 8. PERSONNEL ──────────────────────────────────────────────────────────
-- FY2025 employees

INSERT INTO coop_personnel (
  coop_org_id, fiscal_year, worker_type,
  full_name, title,
  salary_account_id, annual_salary_cents, fte_bps,
  start_month, end_month, health_tier,
  employment_type, flsa_status
)
SELECT
  42, 2025, 'employee',
  v.name, v.title,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5100'),
  v.salary_cents, v.fte_bps,
  1, 12, v.health_tier,
  v.emp_type, 'exempt'
FROM (VALUES
  ('Emp1', 'Executive Director',    8800000, 10000, 'family',   'full-time'),
  ('Emp2', 'Program Director',      7000000, 10000, 'employee', 'full-time'),
  ('Emp3', 'Finance Manager',       6000000, 10000, 'spouse',   'full-time'),
  ('Emp4', 'Program Coordinator',   4800000, 10000, 'employee', 'full-time'),
  ('Emp5', 'Program Assistant',     4200000,  7500, 'none',     'part-time')
) AS v(name, title, salary_cents, fte_bps, health_tier, emp_type);

-- FY2025 contractors
INSERT INTO coop_personnel (
  coop_org_id, fiscal_year, worker_type,
  full_name, title,
  contractor_account_id, monthly_fee_cents,
  start_month, end_month,
  contract_type
)
SELECT
  42, 2025, 'contractor',
  v.name, v.title,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5200'),
  v.monthly_cents,
  1, 12, 'monthly'
FROM (VALUES
  ('Cont1', 'Consultant A', 360000),
  ('Cont2', 'Consultant B', 180000)
) AS v(name, title, monthly_cents);

-- FY2026 employees (with raises)
INSERT INTO coop_personnel (
  coop_org_id, fiscal_year, worker_type,
  full_name, title,
  salary_account_id, annual_salary_cents, fte_bps,
  start_month, end_month, health_tier,
  employment_type, flsa_status
)
SELECT
  42, 2026, 'employee',
  v.name, v.title,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5100'),
  v.salary_cents, v.fte_bps,
  1, 12, v.health_tier,
  v.emp_type, 'exempt'
FROM (VALUES
  ('Emp1', 'Executive Director',    9000000, 10000, 'family',   'full-time'),
  ('Emp2', 'Program Director',      7200000, 10000, 'employee', 'full-time'),
  ('Emp3', 'Finance Manager',       6200000, 10000, 'spouse',   'full-time'),
  ('Emp4', 'Program Coordinator',   5000000, 10000, 'employee', 'full-time'),
  ('Emp5', 'Program Assistant',     4400000,  7500, 'none',     'part-time')
) AS v(name, title, salary_cents, fte_bps, health_tier, emp_type);

-- FY2026 contractors
INSERT INTO coop_personnel (
  coop_org_id, fiscal_year, worker_type,
  full_name, title,
  contractor_account_id, monthly_fee_cents,
  start_month, end_month,
  contract_type
)
SELECT
  42, 2026, 'contractor',
  v.name, v.title,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='5200'),
  v.monthly_cents,
  1, 12, 'monthly'
FROM (VALUES
  ('Cont1', 'Consultant A', 380000),
  ('Cont2', 'Consultant B', 190000)
) AS v(name, title, monthly_cents);

-- Personnel allocations (same percentages for both years)
-- Emp1: A 25% / B 20% / C 20% / D 30% / E 5%
-- Emp2: A 50% / B 35% / D 10% / E 5%
-- Emp3: A 10% / B 10% / C 10% / D 70%
-- Emp4: A 60% / B 30% / D 10%
-- Emp5: A 100%
-- Cont1: A 50% / B 40% / D 10%
-- Cont2: C 80% / D 20%

INSERT INTO coop_personnel_allocations (coop_personnel_id, coop_org_id, coop_program_id, percent_bps)
SELECT p.id, 42, prog.id, v.bps
FROM coop_personnel p
JOIN (VALUES
  ('Emp1', 'PROG-A', 2500),
  ('Emp1', 'PROG-B', 2000),
  ('Emp1', 'PROG-C', 2000),
  ('Emp1', 'PROG-D', 3000),
  ('Emp1', 'PROG-E',  500),
  ('Emp2', 'PROG-A', 5000),
  ('Emp2', 'PROG-B', 3500),
  ('Emp2', 'PROG-D', 1000),
  ('Emp2', 'PROG-E',  500),
  ('Emp3', 'PROG-A', 1000),
  ('Emp3', 'PROG-B', 1000),
  ('Emp3', 'PROG-C', 1000),
  ('Emp3', 'PROG-D', 7000),
  ('Emp4', 'PROG-A', 6000),
  ('Emp4', 'PROG-B', 3000),
  ('Emp4', 'PROG-D', 1000),
  ('Emp5', 'PROG-A',10000),
  ('Cont1','PROG-A', 5000),
  ('Cont1','PROG-B', 4000),
  ('Cont1','PROG-D', 1000),
  ('Cont2','PROG-C', 8000),
  ('Cont2','PROG-D', 2000)
) AS v(person_name, prog_code, bps) ON p.full_name = v.person_name AND p.coop_org_id = 42
JOIN coop_programs prog ON prog.coop_org_id = 42 AND prog.code = v.prog_code;


-- ── 9. GRANT ALLOCATIONS ──────────────────────────────────────────────────

INSERT INTO coop_grant_allocations (coop_org_id, grant_id, coop_program_id, fiscal_year, amount_cents)
SELECT 42, g.id, p.id, v.fy, v.amt
FROM (VALUES
  ('GRT-01','PROG-A',2025,4500000),
  ('GRT-01','PROG-A',2026,5000000),
  ('GRT-02','PROG-B',2026,9000000),
  ('GRT-03','PROG-A',2025,11000000),
  ('GRT-03','PROG-A',2026,11000000),
  ('GRT-04','PROG-D',2026,3500000),
  ('GRT-05','PROG-C',2026,6500000),
  ('GRT-06','PROG-A',2025,8250000),
  ('GRT-06','PROG-B',2025,5500000),
  ('GRT-06','PROG-A',2026,8250000),
  ('GRT-06','PROG-B',2026,5500000)
) AS v(gc, pc, fy, amt)
JOIN coop_grants   g ON g.coop_org_id = 42 AND g.grant_code = v.gc
JOIN coop_programs p ON p.coop_org_id = 42 AND p.code = v.pc;


-- ── 10. BUDGET LINES ──────────────────────────────────────────────────────
-- Pattern: multi-row VALUES + JOIN + generate_series(1,12) for uniform months.
-- Special cases (one_time, month-12 spike) get their own INSERTs.
-- FY2025 amounts are ~90% of FY2026 (three years: prior, current, next visible).
-- source_type 'personnel' for salary/contractor/fringe rows; 'manual' elsewhere.
-- source_ref_id left NULL (G1 gap — would need runtime IDs from schedule rows).
-- =============================================================================

-- ── 10a. INCOME – FY2026 ─────────────────────────────────────────────────

-- Restricted grants (with grant_id)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,grant_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, g.id, 2026, m, v.amt, 'manual'
FROM (VALUES
  ('4100','PROG-A','GRT-01', 416700),
  ('4100','PROG-B','GRT-02', 750000),
  ('4100','PROG-C','GRT-05', 541700),
  ('4300','PROG-A','GRT-03', 916700),
  ('4300','PROG-A','GRT-06', 687500),
  ('4300','PROG-B','GRT-06', 458300)
) AS v(acc,prog,gc,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
JOIN coop_grants   g ON g.coop_org_id=42 AND g.grant_code=v.gc
CROSS JOIN generate_series(1,12) AS m;

-- Unrestricted / earned income (no grant_id)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, v.amt, 'manual'
FROM (VALUES
  ('4200','PROG-D', 291700),
  ('4400','PROG-D',1375000),
  ('4500','PROG-D', 500000),
  ('4600','PROG-A', 666700),
  ('4600','PROG-B', 333300),
  ('4800','PROG-D', 166700)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- Special events: one-time in November
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4700'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-E'),
  2026, 11, 6000000, 'manual'
);

-- ── 10b. EXPENSES – PERSONNEL FY2026 ─────────────────────────────────────

INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, v.amt, 'personnel'
FROM (VALUES
  -- 5100 Staff Salaries
  ('5100','PROG-A',1064200),
  ('5100','PROG-B', 536700),
  ('5100','PROG-C', 201700),
  ('5100','PROG-D', 688300),
  ('5100','PROG-E',  67500),
  -- 5200 Contractors
  ('5200','PROG-A', 190000),
  ('5200','PROG-B', 152000),
  ('5200','PROG-C', 152000),
  ('5200','PROG-D',  76000),
  -- 5300 Payroll Taxes
  ('5300','PROG-A',  84500),
  ('5300','PROG-B',  42700),
  ('5300','PROG-C',  16100),
  ('5300','PROG-D',  54700),
  ('5300','PROG-E',   5300),
  -- 5400 Health Insurance
  ('5400','PROG-A', 128500),
  ('5400','PROG-B',  90300),
  ('5400','PROG-C',  48000),
  ('5400','PROG-D', 151000),
  ('5400','PROG-E',  12300),
  -- 5410 Dental & Vision
  ('5410','PROG-A',  13300),
  ('5410','PROG-B',   6700),
  ('5410','PROG-C',   2500),
  ('5410','PROG-D',   8600),
  ('5410','PROG-E',    800),
  -- 5500 Retirement
  ('5500','PROG-A',  31900),
  ('5500','PROG-B',  16100),
  ('5500','PROG-C',   6100),
  ('5500','PROG-D',  20700),
  ('5500','PROG-E',   2000),
  -- 5600 Workers Comp
  ('5600','PROG-A',  16000),
  ('5600','PROG-B',   8100),
  ('5600','PROG-C',   3000),
  ('5600','PROG-D',  10400),
  ('5600','PROG-E',   1000)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- ── 10c. EXPENSES – PROGRAM FY2026 ───────────────────────────────────────

INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, v.amt, 'manual'
FROM (VALUES
  ('6100','PROG-A',125000),
  ('6100','PROG-B', 75000),
  ('6100','PROG-C', 50000),
  ('6200','PROG-A',100000),
  ('6200','PROG-B', 60000),
  ('6200','PROG-C', 40000),
  ('6300','PROG-A',200000),
  ('6300','PROG-B',120000),
  ('6300','PROG-C', 80000),
  ('6400','PROG-A',250000),
  ('6400','PROG-B',150000),
  ('6400','PROG-C',100000),
  ('6500','PROG-A', 41700),
  ('6500','PROG-B', 33300),
  ('6500','PROG-C', 25000),
  ('6600','PROG-A', 29200),
  ('6600','PROG-B', 20800)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- ── 10d. EXPENSES – OPERATING FY2026 ─────────────────────────────────────

-- Uniform monthly operating
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, v.amt, 'manual'
FROM (VALUES
  ('7100','PROG-A',180000),
  ('7100','PROG-B',180000),
  ('7100','PROG-C',120000),
  ('7100','PROG-D',120000),
  ('7200','PROG-D', 50000),
  ('7300','PROG-A', 37500),
  ('7300','PROG-B', 37500),
  ('7300','PROG-C', 37500),
  ('7300','PROG-D', 37500),
  ('7400','PROG-D', 30000),
  ('7500','PROG-D', 40000),
  ('7700','PROG-D', 60000),
  ('7800','PROG-D',136100)   -- depreciation: $583+$778/mo from schedule
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- 7600 Insurance: one-time in July (from schedule)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7600'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  2026, 7, 960000, 'schedule'
);

-- ── 10e. EXPENSES – ADMIN FY2026 ─────────────────────────────────────────

-- Uniform months for accounting, board, marketing, subscriptions
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, v.amt, 'manual'
FROM (VALUES
  ('8200','PROG-D',130000),
  ('8300','PROG-D', 50000),
  ('8400','PROG-D', 50000),
  ('8400','PROG-E', 50000),
  ('8500','PROG-D', 40000)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- 8100 Audit: months 1-11 misc legal, month 12 audit fee
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2026, m, 41700, 'manual'
FROM coop_accounts a, coop_programs p, generate_series(1,11) AS m
WHERE a.coop_org_id=42 AND a.code='8100'
  AND p.coop_org_id=42 AND p.code='PROG-D';

INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8100'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  2026, 12, 1841700, 'schedule'   -- $18K audit + $417 misc = $18,417
);

-- ── 10f. BUDGET LINES – FY2025 (≈90% of FY2026) ─────────────────────────

-- FY2025 income (restricted grants)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,grant_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, g.id, 2025, m, v.amt, 'manual'
FROM (VALUES
  ('4100','PROG-A','GRT-01', 375000),
  ('4300','PROG-A','GRT-03', 916700),
  ('4300','PROG-A','GRT-06', 618800),
  ('4300','PROG-B','GRT-06', 412500)
) AS v(acc,prog,gc,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
JOIN coop_grants   g ON g.coop_org_id=42 AND g.grant_code=v.gc
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 income (unrestricted/earned)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, v.amt, 'manual'
FROM (VALUES
  ('4200','PROG-D', 262500),
  ('4400','PROG-D',1237500),
  ('4500','PROG-D', 450000),
  ('4600','PROG-A', 600000),
  ('4600','PROG-B', 300000),
  ('4800','PROG-D', 150000)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 special events (month 11)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4700'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-E'),
  2025, 11, 5000000, 'manual'
);

-- FY2025 personnel (90% of FY2026 monthly amounts)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, v.amt, 'personnel'
FROM (VALUES
  ('5100','PROG-A', 957800),('5100','PROG-B', 483000),('5100','PROG-C', 181500),
  ('5100','PROG-D', 619500),('5100','PROG-E',  60800),
  ('5200','PROG-A', 171000),('5200','PROG-B', 136800),('5200','PROG-C', 136800),
  ('5200','PROG-D',  68400),
  ('5300','PROG-A',  76100),('5300','PROG-B',  38400),('5300','PROG-C',  14500),
  ('5300','PROG-D',  49200),('5300','PROG-E',   4800),
  ('5400','PROG-A', 115700),('5400','PROG-B',  81300),('5400','PROG-C',  43200),
  ('5400','PROG-D', 135900),('5400','PROG-E',  11100),
  ('5410','PROG-A',  12000),('5410','PROG-B',   6000),('5410','PROG-C',   2300),
  ('5410','PROG-D',   7700),('5410','PROG-E',    700),
  ('5500','PROG-A',  28700),('5500','PROG-B',  14500),('5500','PROG-C',   5500),
  ('5500','PROG-D',  18600),('5500','PROG-E',   1800),
  ('5600','PROG-A',  14400),('5600','PROG-B',   7300),('5600','PROG-C',   2700),
  ('5600','PROG-D',   9400),('5600','PROG-E',    900)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 program expenses (90%)
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, v.amt, 'manual'
FROM (VALUES
  ('6100','PROG-A',112500),('6100','PROG-B',67500),('6100','PROG-C',45000),
  ('6200','PROG-A', 90000),('6200','PROG-B',54000),('6200','PROG-C',36000),
  ('6300','PROG-A',180000),('6300','PROG-B',108000),('6300','PROG-C',72000),
  ('6400','PROG-A',225000),('6400','PROG-B',135000),('6400','PROG-C',90000),
  ('6500','PROG-A', 37500),('6500','PROG-B',30000),('6500','PROG-C',22500),
  ('6600','PROG-A', 26300),('6600','PROG-B',18700)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 operating expenses
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, v.amt, 'manual'
FROM (VALUES
  ('7100','PROG-A',162000),('7100','PROG-B',162000),('7100','PROG-C',108000),('7100','PROG-D',108000),
  ('7200','PROG-D',45000),
  ('7300','PROG-A',33800),('7300','PROG-B',33800),('7300','PROG-C',33800),('7300','PROG-D',33800),
  ('7400','PROG-D',27000),
  ('7500','PROG-D',36000),
  ('7700','PROG-D',54000),
  ('7800','PROG-D',122500)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 insurance one_time month 7
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7600'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  2025, 7, 864000, 'schedule'
);

-- FY2025 admin
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, v.amt, 'manual'
FROM (VALUES
  ('8200','PROG-D',117000),('8300','PROG-D',45000),
  ('8400','PROG-D',45000),('8400','PROG-E',45000),
  ('8500','PROG-D',36000)
) AS v(acc,prog,amt)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog
CROSS JOIN generate_series(1,12) AS m;

-- FY2025 audit
INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
SELECT 42, a.id, p.id, 2025, m, 37500, 'manual'
FROM coop_accounts a, coop_programs p, generate_series(1,11) AS m
WHERE a.coop_org_id=42 AND a.code='8100' AND p.coop_org_id=42 AND p.code='PROG-D';

INSERT INTO coop_budget_lines
  (coop_org_id,account_id,program_id,fiscal_year,month,amount_cents,source_type)
VALUES (
  42,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8100'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  2025, 12, 1657500, 'schedule'
);


-- ── 11. ACTUALS ───────────────────────────────────────────────────────────
-- One row per (account, year, month). Program attribution is informational.
-- dedupe_key pattern: 'demo-{acc_code}-{year}-{month}'

-- FY2025: Uniform monthly expense actuals (full year, all 12 months)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT
  42,'confirmed','csv',
  'demo-'||a.code||'-2025-'||m::text,
  2025, m, v.monthly_cents,
  a.id, p.id, 'USD', true, true
FROM (VALUES
  ('5100','PROG-A',2475000),
  ('5200','PROG-A', 515000),
  ('5300','PROG-A', 189200),
  ('5400','PROG-A', 420000),
  ('5410','PROG-A',  30000),
  ('5500','PROG-A',  72900),
  ('5600','PROG-A',  36400),
  ('6100','PROG-A', 225000),
  ('6200','PROG-A', 183300),
  ('6300','PROG-A', 350000),
  ('6400','PROG-A', 450000),
  ('7100','PROG-A', 600000),
  ('7300','PROG-A', 141700),
  ('7400','PROG-D',  30000),
  ('7700','PROG-D',  60000),
  ('7800','PROG-D',  80000),
  ('8200','PROG-D', 130000),
  ('8400','PROG-D',  91700)
) AS v(acc_code,prog_code,monthly_cents)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc_code
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog_code
CROSS JOIN generate_series(1,12) AS m;

-- FY2025: Government contract income (monthly, $20,625/mo)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4300-2025-'||m::text,
  2025, m, 2062500,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4300'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
  'USD', true, true
FROM generate_series(1,12) AS m;

-- FY2025: Contributions (monthly approx $9K + Dec bump)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4400-2025-'||m::text,
  2025, m,
  CASE WHEN m = 12 THEN 5500000 WHEN m = 11 THEN 2000000 ELSE 909100 END,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4400'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  'USD', true, true
FROM generate_series(1,12) AS m;

-- FY2025: Program service revenue (monthly $8,333)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4600-2025-'||m::text,
  2025, m, 833300,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4600'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
  'USD', true, true
FROM generate_series(1,12) AS m;

-- FY2025: Quarterly actuals (grants, corporate, investment) — months 3,6,9,12
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-'||v.acc||'-2025-'||m::text,
  2025, m, v.amt,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code=v.acc),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code=v.prog),
  'USD', true, true
FROM (VALUES
  ('4100','PROG-A',4500000),
  ('4500','PROG-D',1375000),
  ('4800','PROG-D', 450000)
) AS v(acc,prog,amt)
CROSS JOIN (VALUES (3),(6),(9),(12)) AS q(m);

-- FY2025: Special events November, insurance July, training & subgrants
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
VALUES
  (42,'confirmed','csv','demo-4700-2025-11',
   2025,11,5000000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4700'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-E'),
   'USD',true,true),
  (42,'confirmed','csv','demo-7600-2025-7',
   2025,7,920000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='7600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2025-2',
   2025,2,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2025-5',
   2025,5,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2025-8',
   2025,8,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2025-11',
   2025,11,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6600-2025-3',
   2025,3,125000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6600-2025-6',
   2025,6,125000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6600-2025-9',
   2025,9,125000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6600-2025-12',
   2025,12,125000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  -- Audit December
  (42,'confirmed','csv','demo-8100-2025-12',
   2025,12,2050000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8100'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
   'USD',true,true),
  -- Board/supplies/postage quarterly
  (42,'confirmed','csv','demo-8300-2025-3',  2025,3,145000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8300'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),'USD',true,true),
  (42,'confirmed','csv','demo-8300-2025-6',  2025,6,145000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8300'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),'USD',true,true),
  (42,'confirmed','csv','demo-8300-2025-9',  2025,9,145000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8300'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),'USD',true,true),
  (42,'confirmed','csv','demo-8300-2025-12', 2025,12,145000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='8300'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),'USD',true,true);

-- ── FY2026 H1 Actuals (Jan–Jun 2026) ─────────────────────────────────────

-- Monthly uniform expense actuals
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT
  42,'confirmed','csv',
  'demo-'||a.code||'-2026-'||m::text,
  2026, m, v.monthly_cents,
  a.id, p.id, 'USD', true, true
FROM (VALUES
  ('5100','PROG-A',2558300),
  ('5200','PROG-A', 570000),
  ('5300','PROG-A', 203300),
  ('5400','PROG-A', 430000),
  ('5410','PROG-A',  32000),
  ('5500','PROG-A',  76800),
  ('5600','PROG-A',  38400),
  ('6100','PROG-A', 250000),
  ('6200','PROG-A', 200000),
  ('6300','PROG-A', 333300),
  ('6400','PROG-A', 500000),
  ('7100','PROG-A', 600000),
  ('7300','PROG-A', 150000),
  ('7400','PROG-D',  30000),
  ('7700','PROG-D',  60000),
  ('7800','PROG-D', 136100),
  ('8200','PROG-D', 130000),
  ('8400','PROG-D', 100000)
) AS v(acc_code,prog_code,monthly_cents)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc_code
JOIN coop_programs p ON p.coop_org_id=42 AND p.code=v.prog_code
CROSS JOIN generate_series(1,6) AS m;

-- FY2026 H1: government contracts monthly
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4300-2026-'||m::text,
  2026, m, 2062500,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4300'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
  'USD', true, true
FROM generate_series(1,6) AS m;

-- FY2026 H1: contributions monthly (slightly ahead of budget)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4400-2026-'||m::text,
  2026, m, 1050000,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4400'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
  'USD', true, true
FROM generate_series(1,6) AS m;

-- FY2026 H1: program service revenue
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
SELECT 42,'confirmed','csv','demo-4600-2026-'||m::text,
  2026, m, 900000,
  (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4600'),
  (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
  'USD', true, true
FROM generate_series(1,6) AS m;

-- FY2026 H1: quarterly items (grants Q1 month 3, corporate month 3, investment month 3)
INSERT INTO coop_actuals
  (coop_org_id,status,source,dedupe_key,period_year,period_month,
   amount_cents,coop_account_id,coop_program_id,currency_code,
   auto_matched_account,auto_matched_program)
VALUES
  (42,'confirmed','csv','demo-4100-2026-3',
   2026,3,2250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4100'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-4100-2026-6',
   2026,6,2250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4100'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-4500-2026-3',
   2026,3,1375000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
   'USD',true,true),
  (42,'confirmed','csv','demo-4800-2026-3',
   2026,3,500000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4800'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
   'USD',true,true),
  (42,'confirmed','csv','demo-4800-2026-6',
   2026,6,500000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='4800'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-D'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2026-2',
   2026,2,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6500-2026-5',
   2026,5,250000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6500'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true),
  (42,'confirmed','csv','demo-6600-2026-3',
   2026,3,150000,
   (SELECT id FROM coop_accounts WHERE coop_org_id=42 AND code='6600'),
   (SELECT id FROM coop_programs WHERE coop_org_id=42 AND code='PROG-A'),
   'USD',true,true);


-- ── 12. BALANCE SHEET SNAPSHOTS ───────────────────────────────────────────

-- As of 2024-12-31 (FY2025 opening)
-- Assets: $515,300 | Liabilities: $101,500 | Net Assets: $413,800
INSERT INTO coop_balance_sheet_snapshots
  (coop_org_id, as_of_date, coop_account_id, balance_cents, restriction_class)
SELECT 42, '2024-12-31', a.id, v.bal, v.rc
FROM (VALUES
  ('1100', 28500000, NULL),
  ('1110',  9500000, NULL),
  ('1200',  6500000, 'temporarily_restricted'),
  ('1210',  1500000, NULL),
  ('1300',   480000, NULL),
  ('1310',   600000, NULL),
  ('1400',  3500000, NULL),
  ('1410',  2800000, NULL),
  ('1490', -1850000, NULL),
  ('2100',  2200000, NULL),
  ('2110',  3150000, NULL),
  ('2120',   800000, NULL),
  ('2200',  3500000, 'temporarily_restricted'),
  ('2210',   500000, NULL),
  ('3100', 29880000, 'unrestricted'),
  ('3200', 11500000, 'temporarily_restricted')
) AS v(code, bal, rc)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.code;

-- As of 2025-12-31 (FY2026 opening / FY2025 closing)
-- Assets: $607,700 | Liabilities: $114,000 | Net Assets: $493,700
INSERT INTO coop_balance_sheet_snapshots
  (coop_org_id, as_of_date, coop_account_id, balance_cents, restriction_class)
SELECT 42, '2025-12-31', a.id, v.bal, v.rc
FROM (VALUES
  ('1100', 34000000, NULL),
  ('1110', 11000000, NULL),
  ('1200',  8500000, 'temporarily_restricted'),
  ('1210',  1200000, NULL),
  ('1300',   520000, NULL),
  ('1310',   600000, NULL),
  ('1400',  3500000, NULL),
  ('1410',  4300000, NULL),
  ('1490', -2850000, NULL),
  ('2100',  2400000, NULL),
  ('2110',  3500000, NULL),
  ('2120',   950000, NULL),
  ('2200',  4200000, 'temporarily_restricted'),
  ('2210',   350000, NULL),
  ('3100', 37870000, 'unrestricted'),
  ('3200', 11500000, 'temporarily_restricted')
) AS v(code, bal, rc)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.code;


-- ── 13. FUNCTIONAL CLASSIFICATIONS (990 Part IX) ──────────────────────────
-- Covers both FY2025 and FY2026. Bps must sum to 10000 per row.

INSERT INTO coop_functional_classifications
  (coop_org_id, account_id, fiscal_year, program_services_bps, mgmt_general_bps, fundraising_bps)
SELECT 42, a.id, fy, v.ps, v.mg, v.fr
FROM (VALUES
  -- Personnel (70% program / 25% mgmt / 5% fundraising)
  ('5100',7000,2500,500),('5200',7500,2000,500),('5300',7000,2500,500),
  ('5400',7000,2500,500),('5410',7000,2500,500),('5500',7000,2500,500),
  ('5600',7000,2500,500),
  -- Program expenses (100% program)
  ('6100',10000,0,0),('6200',10000,0,0),('6300',10000,0,0),
  ('6400',10000,0,0),('6500',10000,0,0),('6600',10000,0,0),
  -- Operating
  ('7100',6000,3000,1000),('7200',4000,5000,1000),('7300',5000,4000,1000),
  ('7400',5000,4000,1000),('7500',6000,2000,2000),('7600',4000,5000,1000),
  ('7700',5000,4000,1000),('7800',5000,4000,1000),
  -- Administrative
  ('8100',1000,8000,1000),('8200',1000,8000,1000),('8300',0,9000,1000),
  ('8400',2000,2000,6000),('8500',3000,6000,1000)
) AS v(acc_code, ps, mg, fr)
JOIN coop_accounts a ON a.coop_org_id=42 AND a.code=v.acc_code
CROSS JOIN (VALUES (2025),(2026)) AS y(fy);


COMMIT;
