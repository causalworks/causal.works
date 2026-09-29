-- Seed: causal-coop dummy data
-- Deletes all orgs except causal-coop (id=10), then loads full account/program/grant/budget/actuals data.
-- (No transaction wrapper so ON CONFLICT can work on actuals)

-- ── 1. Purge all orgs except causal-coop ────────────────────────────────────
DELETE FROM coop_orgs WHERE id <> 10;

-- ── 2. Account hierarchy for causal-coop ──────────────────────────────────────
-- Budget view requires roots: _H1_REV (income) and _H1_EXP (expense).
-- Level 1 = section header (not posting)
-- Level 2 = group header  (not posting)
-- Level 3 = posting account

-- Level 1: section roots
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting)
VALUES
  (10, '_H1_REV', 'Revenue',  'income',  1, false),
  (10, '_H1_EXP', 'Expenses', 'expense', 1, false);

-- Level 2: revenue groups (parent = _H1_REV)
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 10, '_H2_EARNED',  'Earned Revenue',      'income', 2, false, id FROM coop_accounts WHERE coop_org_id=10 AND code='_H1_REV';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 10, '_H2_CONTRIB', 'Contributed Revenue', 'income', 2, false, id FROM coop_accounts WHERE coop_org_id=10 AND code='_H1_REV';

-- Level 2: expense groups (parent = _H1_EXP)
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 10, '_H2_PERSONNEL', 'Personnel',          'expense', 2, false, id FROM coop_accounts WHERE coop_org_id=10 AND code='_H1_EXP';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, parent_id)
SELECT 10, '_H2_OPERATING', 'Operating Expenses', 'expense', 2, false, id FROM coop_accounts WHERE coop_org_id=10 AND code='_H1_EXP';

-- Level 3: income posting accounts
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '4000', 'Program Service Fees',    'income', 3, true, 'REV_EARNED',  id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_EARNED';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '5050', 'Individual Contributions', 'income', 3, true, 'REV_CONTRIB', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_CONTRIB';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '5300', 'Corporate Contributions', 'income', 3, true, 'REV_CONTRIB', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_CONTRIB';

-- Level 3: expense posting accounts — personnel
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '6010', 'Salaries & Wages — Operations', 'expense', 3, true, 'EXP_PERSONNEL', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_PERSONNEL';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '6140', 'Health Benefits',               'expense', 3, true, 'EXP_PERSONNEL', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_PERSONNEL';

-- Level 3: expense posting accounts — operating
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8120', 'Printing & Postage',      'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8600', 'Office Rent',             'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8880', 'Software & Technology',   'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8900', 'Office Supplies',         'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8940', 'Insurance',               'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';
INSERT INTO coop_accounts (coop_org_id, code, name, type, level, is_posting, standard_category, parent_id)
SELECT 10, '8960', 'Utilities',               'expense', 3, true, 'EXP_OPERATING', id FROM coop_accounts WHERE coop_org_id=10 AND code='_H2_OPERATING';

-- ── 3. Programs ──────────────────────────────────────────────────────────────
INSERT INTO coop_programs (coop_org_id, code, name, program_kind, program_manager, description, active)
VALUES
  (10, 'P01', 'Youth Arts Program',   'program', 'A. Rivera', 'Core youth programming', true),
  (10, 'P02', 'Community Outreach',   'program', 'J. Chen',   '',                       true),
  (10, 'P03', 'Artist Residency',     'program', '',          '',                       true),
  (10, 'P04', 'General',              'program', '',          'Management & general',   true),
  (10, 'P05', 'Fundraising',          'program', '',          '',                       true);

-- Activities (children of top-level programs)
INSERT INTO coop_programs (coop_org_id, code, name, program_kind, active, parent_id)
SELECT 10, 'P01-A1', 'Summer Workshop', 'activity', true, id FROM coop_programs WHERE coop_org_id=10 AND code='P01';
INSERT INTO coop_programs (coop_org_id, code, name, program_kind, active, parent_id)
SELECT 10, 'P01-A2', 'After-school',    'activity', true, id FROM coop_programs WHERE coop_org_id=10 AND code='P01';
INSERT INTO coop_programs (coop_org_id, code, name, program_kind, active, parent_id)
SELECT 10, 'P02-A1', 'Public Events',   'activity', true, id FROM coop_programs WHERE coop_org_id=10 AND code='P02';
INSERT INTO coop_programs (coop_org_id, code, name, program_kind, active, parent_id)
SELECT 10, 'P02-A2', 'Partnerships',    'activity', true, id FROM coop_programs WHERE coop_org_id=10 AND code='P02';

-- ── 4. Grants ────────────────────────────────────────────────────────────────
-- Use SELECT+JOIN to avoid scalar-subquery-in-VALUES issue in PostgreSQL
INSERT INTO coop_grants (coop_org_id, grant_code, funder, name, amount_cents, request_amount_cents,
                       start_date, end_date, grant_type, status, restrictions, fy_allocations,
                       next_report_due, final_report_submitted, renewal_application_due,
                       primary_program_id)
SELECT
  10, g.grant_code, g.funder, g.name, g.amount_cents, g.req_cents,
  g.start_date::date, g.end_date::date, g.grant_type, g.status,
  g.restrictions, g.fy_alloc::jsonb,
  g.next_report::date, g.final_report::date, g.renewal::date,
  p.id
FROM (VALUES
  ('G-NSF-01',    'National Science Foundation', 'STEM Youth Access',       12000000::bigint,  9500000::bigint,  '2026-01-01', '2027-06-30', 'restricted',   'awarded',  'Use for P01 only',  '{"FY2026":60000,"FY2027":60000}', '2026-09-01', NULL, NULL,       'P01'),
  ('G-UNITED-02', 'United Way',                  'General operating',        8500000::bigint,  NULL::bigint,     '2026-01-01', '2026-12-31', 'unrestricted', 'awarded',  NULL,                '{"FY2026":85000}',                NULL,        NULL, NULL,       'P04'),
  ('G-STATE-03',  'State Arts Council',           'Festival grant',           4000000::bigint,  4000000::bigint,  '2025-07-01', '2025-12-31', 'restricted',   'closed',   NULL,                NULL,                              NULL,        '2025-12-15', NULL, 'P02'),
  ('G-FOUND-04',  'Example Foundation',           'Capacity building',        NULL::bigint,     25000000::bigint, NULL,         NULL,         'unrestricted', 'applied',  NULL,                NULL,                              '2026-05-01', NULL, NULL, 'P04'),
  ('G-DONOR-05',  'Regional Bank',                'Capital campaign',         NULL::bigint,     50000000::bigint, NULL,         NULL,         NULL,           'prospect', NULL,                NULL,                              NULL,        NULL, NULL,       NULL),
  ('G-FED-06',    'Federal Agency X',             'Innovation pilot',         NULL::bigint,     18000000::bigint, NULL,         NULL,         NULL,           'declined', NULL,                NULL,                              NULL,        NULL, NULL,       'P03')
) AS g(grant_code, funder, name, amount_cents, req_cents, start_date, end_date, grant_type, status, restrictions, fy_alloc, next_report, final_report, renewal, prog_code)
LEFT JOIN coop_programs p ON p.coop_org_id=10 AND p.code=g.prog_code;

-- ── 5. Budget lines (FY 2026) ────────────────────────────────────────────────
-- amounts in CSV are dollars → multiply by 100 for cents
-- Grant-scoped lines for P01/8600 months 1-6
WITH prog AS (SELECT id FROM coop_programs WHERE coop_org_id=10 AND code='P01'),
     acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8600'),
     grnt AS (SELECT id FROM coop_grants WHERE coop_org_id=10 AND grant_code='G-NSF-01')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, grnt.id, 2026, m.month, m.amt * 100
FROM prog, acct, grnt,
     (VALUES (1,862),(2,874),(3,886),(4,898),(5,910),(6,922)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- Non-grant lines for P01/8600 months 7-12 (from first CSV block)
WITH prog AS (SELECT id FROM coop_programs WHERE coop_org_id=10 AND code='P01'),
     acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8600')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM prog, acct,
     (VALUES (7,934),(8,946),(9,958),(10,970),(11,982),(12,994)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- Non-grant 8600 lines for P02/P04/P05 all 12 months
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8600')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P02'),(('P04')),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,862),(2,874),(3,886),(4,898),(5,910),(6,922),(7,934),(8,946),(9,958),(10,970),(11,982),(12,994)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 6010 lines for all four programs
WITH grnt AS (SELECT id FROM coop_grants WHERE coop_org_id=10 AND grant_code='G-UNITED-02'),
     acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='6010')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, CASE WHEN pc.code='P04' AND m.month<=3 THEN grnt.id ELSE NULL END, 2026, m.month, m.amt * 100
FROM acct, grnt,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,912),(2,924),(3,936),(4,948),(5,960),(6,972),(7,984),(8,996),(9,1008),(10,1020),(11,1032),(12,1044)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 8960 (Utilities) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8960')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,962),(2,974),(3,986),(4,998),(5,1010),(6,1022),(7,1034),(8,1046),(9,1058),(10,1070),(11,1082),(12,1094)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 8900 (Office Supplies) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8900')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,1112),(2,1124),(3,1136),(4,1148),(5,1160),(6,1172),(7,1184),(8,1196),(9,1208),(10,1220),(11,1232),(12,1244)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 6140 (Health Benefits) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='6140')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,812),(2,824),(3,836),(4,848),(5,860),(6,872),(7,884),(8,896),(9,908),(10,920),(11,932),(12,944)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 8940 (Insurance) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8940')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,862),(2,874),(3,886),(4,898),(5,910),(6,922),(7,934),(8,946),(9,958),(10,970),(11,982),(12,994)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 8880 (Software & Technology) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8880')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,962),(2,974),(3,986),(4,998),(5,1010),(6,1022),(7,1034),(8,1046),(9,1058),(10,1070),(11,1082),(12,1094)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 8120 (Printing & Postage) for all four programs
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='8120')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct,
     (VALUES ('P01'),('P02'),('P04'),('P05')) AS pc(code)
     JOIN coop_programs prog ON prog.coop_org_id=10 AND prog.code=pc.code,
     (VALUES (1,1062),(2,1074),(3,1086),(4,1098),(5,1110),(6,1122),(7,1134),(8,1146),(9,1158),(10,1170),(11,1182),(12,1194)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- Income budget lines (derived from actuals scale; no income in original CSV so we add plausible values)
-- 4000 Program Service Fees — P01
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='4000'),
     prog AS (SELECT id FROM coop_programs WHERE coop_org_id=10 AND code='P01')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct, prog,
     (VALUES (1,1400),(2,1420),(3,1440),(4,1460),(5,1480),(6,1500),(7,1520),(8,1540),(9,1560),(10,1580),(11,1600),(12,1620)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 5050 Individual Contributions — P01
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='5050'),
     prog AS (SELECT id FROM coop_programs WHERE coop_org_id=10 AND code='P01')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct, prog,
     (VALUES (1,1400),(2,1420),(3,1440),(4,1460),(5,1480),(6,1500),(7,1520),(8,1540),(9,1560),(10,1580),(11,1600),(12,1620)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- 5300 Corporate Contributions — P04
WITH acct AS (SELECT id FROM coop_accounts WHERE coop_org_id=10 AND code='5300'),
     prog AS (SELECT id FROM coop_programs WHERE coop_org_id=10 AND code='P04')
INSERT INTO coop_budget_lines (coop_org_id, account_id, program_id, fiscal_year, month, amount_cents)
SELECT 10, acct.id, prog.id, 2026, m.month, m.amt * 100
FROM acct, prog,
     (VALUES (1,1400),(2,1420),(3,1440),(4,1460),(5,1480),(6,1500),(7,1520),(8,1540),(9,1560),(10,1580),(11,1600),(12,1620)) AS m(month,amt)
ON CONFLICT DO NOTHING;

-- ── 6. Actuals ───────────────────────────────────────────────────────────────
-- source='csv', status='confirmed', amounts from CSV are dollars → *100 cents
-- Actuals reference P02-A1 activity via activity_code in CSV
-- 2025 actuals (Jan–Dec) and 2026 actuals (Jan–Mar)

-- Helper: insert actuals for one month batch
-- Format: (year, month, account_code, program_code, amount, dedupe_key)
-- activity P02-A1 applies when program_code is P02 and activity_code is P02-A1 in CSV

-- Jan 2025 — P01
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 1, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P01',1035,'csv-2025-1-5000-1000'),
  ('6010','P01',1036,'csv-2025-1-5100-1001'),
  ('8960','P01',1037,'csv-2025-1-5200-1002'),
  ('8600','P01',1038,'csv-2025-1-6000-1003'),
  ('8960','P01',1039,'csv-2025-1-6100-1004'),
  ('8900','P01',1040,'csv-2025-1-6200-1005'),
  ('5050','P01',1246,'csv-2025-1-4000-1006'),
  ('5300','P01',1247,'csv-2025-1-4100-1007'),
  ('4000','P01',1248,'csv-2025-1-4500-1008')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Feb 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 2, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1079,'csv-2025-2-5000-1009'),
  ('6010','P04',1080,'csv-2025-2-5100-1010'),
  ('8960','P04',1081,'csv-2025-2-5200-1011'),
  ('8600','P04',1082,'csv-2025-2-6000-1012'),
  ('8960','P04',1083,'csv-2025-2-6100-1013'),
  ('8900','P04',1084,'csv-2025-2-6200-1014'),
  ('5050','P04',1295,'csv-2025-2-4000-1015'),
  ('5300','P04',1296,'csv-2025-2-4100-1016'),
  ('4000','P04',1297,'csv-2025-2-4500-1017')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Mar 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 3, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1123,'csv-2025-3-5000-1018'),
  ('6010','P04',1124,'csv-2025-3-5100-1019'),
  ('8960','P04',1125,'csv-2025-3-5200-1020'),
  ('8600','P04',1126,'csv-2025-3-6000-1021'),
  ('8960','P04',1127,'csv-2025-3-6100-1022'),
  ('8900','P04',1128,'csv-2025-3-6200-1023'),
  ('5050','P04',1344,'csv-2025-3-4000-1024'),
  ('5300','P04',1345,'csv-2025-3-4100-1025'),
  ('4000','P04',1346,'csv-2025-3-4500-1026')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Apr 2025 — P02 (with activity P02-A1)
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, np_activity_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, act.id, 2025, 4, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P02','P02-A1',1167,'csv-2025-4-5000-1027'),
  ('6010','P02','P02-A1',1168,'csv-2025-4-5100-1028'),
  ('8960','P02','P02-A1',1169,'csv-2025-4-5200-1029'),
  ('8600','P02','P02-A1',1170,'csv-2025-4-6000-1030'),
  ('8960','P02','P02-A1',1171,'csv-2025-4-6100-1031'),
  ('8900','P02','P02-A1',1172,'csv-2025-4-6200-1032'),
  ('5050','P02','P02-A1',1393,'csv-2025-4-4000-1033'),
  ('5300','P02','P02-A1',1394,'csv-2025-4-4100-1034'),
  ('4000','P02','P02-A1',1395,'csv-2025-4-4500-1035')
) AS v(acct_code, prog_code, act_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
JOIN coop_programs act ON act.coop_org_id=10 AND act.code=v.act_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- May 2025 — P01
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 5, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P01',1211,'csv-2025-5-5000-1036'),
  ('6010','P01',1212,'csv-2025-5-5100-1037'),
  ('8960','P01',1213,'csv-2025-5-5200-1038'),
  ('8600','P01',1214,'csv-2025-5-6000-1039'),
  ('8960','P01',1215,'csv-2025-5-6100-1040'),
  ('8900','P01',1216,'csv-2025-5-6200-1041'),
  ('5050','P01',1442,'csv-2025-5-4000-1042'),
  ('5300','P01',1443,'csv-2025-5-4100-1043'),
  ('4000','P01',1444,'csv-2025-5-4500-1044')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Jun 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 6, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1255,'csv-2025-6-5000-1045'),
  ('6010','P04',1256,'csv-2025-6-5100-1046'),
  ('8960','P04',1257,'csv-2025-6-5200-1047'),
  ('8600','P04',1258,'csv-2025-6-6000-1048'),
  ('8960','P04',1259,'csv-2025-6-6100-1049'),
  ('8900','P04',1110,'csv-2025-6-6200-1050'),
  ('5050','P04',1491,'csv-2025-6-4000-1051'),
  ('5300','P04',1492,'csv-2025-6-4100-1052'),
  ('4000','P04',1493,'csv-2025-6-4500-1053')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Jul 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 7, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1149,'csv-2025-7-5000-1054'),
  ('6010','P04',1150,'csv-2025-7-5100-1055'),
  ('8960','P04',1151,'csv-2025-7-5200-1056'),
  ('8600','P04',1152,'csv-2025-7-6000-1057'),
  ('8960','P04',1153,'csv-2025-7-6100-1058'),
  ('8900','P04',1154,'csv-2025-7-6200-1059'),
  ('5050','P04',1540,'csv-2025-7-4000-1060'),
  ('5300','P04',1541,'csv-2025-7-4100-1061'),
  ('4000','P04',1542,'csv-2025-7-4500-1062')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Aug 2025 — P02 (with activity P02-A1)
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, np_activity_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, act.id, 2025, 8, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P02','P02-A1',1193,'csv-2025-8-5000-1063'),
  ('6010','P02','P02-A1',1194,'csv-2025-8-5100-1064'),
  ('8960','P02','P02-A1',1195,'csv-2025-8-5200-1065'),
  ('8600','P02','P02-A1',1196,'csv-2025-8-6000-1066'),
  ('8960','P02','P02-A1',1197,'csv-2025-8-6100-1067'),
  ('8900','P02','P02-A1',1198,'csv-2025-8-6200-1068'),
  ('5050','P02','P02-A1',1589,'csv-2025-8-4000-1069'),
  ('5300','P02','P02-A1',1590,'csv-2025-8-4100-1070'),
  ('4000','P02','P02-A1',1591,'csv-2025-8-4500-1071')
) AS v(acct_code, prog_code, act_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
JOIN coop_programs act ON act.coop_org_id=10 AND act.code=v.act_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Sep 2025 — P01
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 9, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P01',1237,'csv-2025-9-5000-1072'),
  ('6010','P01',1238,'csv-2025-9-5100-1073'),
  ('8960','P01',1239,'csv-2025-9-5200-1074'),
  ('8600','P01',1240,'csv-2025-9-6000-1075'),
  ('8960','P01',1241,'csv-2025-9-6100-1076'),
  ('8900','P01',1242,'csv-2025-9-6200-1077'),
  ('5050','P01',1638,'csv-2025-9-4000-1078'),
  ('5300','P01',1639,'csv-2025-9-4100-1079'),
  ('4000','P01',1640,'csv-2025-9-4500-1080')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Oct 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 10, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1281,'csv-2025-10-5000-1081'),
  ('6010','P04',1282,'csv-2025-10-5100-1082'),
  ('8960','P04',1283,'csv-2025-10-5200-1083'),
  ('8600','P04',1284,'csv-2025-10-6000-1084'),
  ('8960','P04',1285,'csv-2025-10-6100-1085'),
  ('8900','P04',1286,'csv-2025-10-6200-1086'),
  ('5050','P04',1687,'csv-2025-10-4000-1087'),
  ('5300','P04',1688,'csv-2025-10-4100-1088'),
  ('4000','P04',1689,'csv-2025-10-4500-1089')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Nov 2025 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2025, 11, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1325,'csv-2025-11-5000-1090'),
  ('6010','P04',1326,'csv-2025-11-5100-1091'),
  ('8960','P04',1327,'csv-2025-11-5200-1092'),
  ('8600','P04',1328,'csv-2025-11-6000-1093'),
  ('8960','P04',1329,'csv-2025-11-6100-1094'),
  ('8900','P04',1330,'csv-2025-11-6200-1095'),
  ('5050','P04',1736,'csv-2025-11-4000-1096'),
  ('5300','P04',1737,'csv-2025-11-4100-1097'),
  ('4000','P04',1738,'csv-2025-11-4500-1098')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Dec 2025 — P02 (with activity P02-A1)
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, np_activity_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, act.id, 2025, 12, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P02','P02-A1',1369,'csv-2025-12-5000-1099'),
  ('6010','P02','P02-A1',1370,'csv-2025-12-5100-1100'),
  ('8960','P02','P02-A1',1371,'csv-2025-12-5200-1101'),
  ('8600','P02','P02-A1',1372,'csv-2025-12-6000-1102'),
  ('8960','P02','P02-A1',1373,'csv-2025-12-6100-1103'),
  ('8900','P02','P02-A1',1374,'csv-2025-12-6200-1104'),
  ('5050','P02','P02-A1',1785,'csv-2025-12-4000-1105'),
  ('5300','P02','P02-A1',1786,'csv-2025-12-4100-1106'),
  ('4000','P02','P02-A1',1787,'csv-2025-12-4500-1107')
) AS v(acct_code, prog_code, act_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
JOIN coop_programs act ON act.coop_org_id=10 AND act.code=v.act_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- 2026 actuals ─────────────────────────────────────────
-- Jan 2026 — P01 (with G-NSF-01 on expense)
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, grant_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id,
       CASE WHEN v.acct_code='8600' THEN (SELECT id FROM coop_grants WHERE coop_org_id=10 AND grant_code='G-NSF-01') ELSE NULL END,
       2026, 1, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P01',993,'csv-2026-1-5000-1108'),
  ('6010','P01',994,'csv-2026-1-5100-1109'),
  ('8960','P01',995,'csv-2026-1-5200-1110'),
  ('8600','P01',996,'csv-2026-1-6000-1111'),
  ('8960','P01',997,'csv-2026-1-6100-1112'),
  ('8900','P01',998,'csv-2026-1-6200-1113'),
  ('5050','P01',1354,'csv-2026-1-4000-1114'),
  ('5300','P01',1355,'csv-2026-1-4100-1115'),
  ('4000','P01',1356,'csv-2026-1-4500-1116')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Feb 2026 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2026, 2, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1037,'csv-2026-2-5000-1117'),
  ('6010','P04',1038,'csv-2026-2-5100-1118'),
  ('8960','P04',1039,'csv-2026-2-5200-1119'),
  ('8600','P04',1040,'csv-2026-2-6000-1120'),
  ('8960','P04',1041,'csv-2026-2-6100-1121'),
  ('8900','P04',1042,'csv-2026-2-6200-1122'),
  ('5050','P04',1403,'csv-2026-2-4000-1123'),
  ('5300','P04',1404,'csv-2026-2-4100-1124'),
  ('4000','P04',1405,'csv-2026-2-4500-1125')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;

-- Mar 2026 — P04
-- INSERT INTO coop_actuals (coop_org_id, coop_account_id, coop_program_id, period_year, period_month, amount_cents, source, status, dedupe_key, description)
SELECT 10, a.id, p.id, 2026, 3, amt*100, 'csv', 'confirmed', dk, 'expense sample'
FROM (VALUES
  ('8600','P04',1081,'csv-2026-3-5000-1126'),
  ('6010','P04',1082,'csv-2026-3-5100-1127'),
  ('8960','P04',1083,'csv-2026-3-5200-1128'),
  ('8600','P04',1084,'csv-2026-3-6000-1129'),
  ('8960','P04',1085,'csv-2026-3-6100-1130'),
  ('8900','P04',1086,'csv-2026-3-6200-1131'),
  ('5050','P04',1452,'csv-2026-3-4000-1132'),
  ('5300','P04',1453,'csv-2026-3-4100-1133'),
  ('4000','P04',1454,'csv-2026-3-4500-1134')
) AS v(acct_code, prog_code, amt, dk)
JOIN coop_accounts a ON a.coop_org_id=10 AND a.code=v.acct_code
JOIN coop_programs p ON p.coop_org_id=10 AND p.code=v.prog_code
ON CONFLICT (coop_org_id, dedupe_key) DO NOTHING;
