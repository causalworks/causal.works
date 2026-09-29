-- 061: Seed cooperative data (member orgs, library, work requests, sponsored projects)

-- First, ensure we have some base orgs to work with
-- This script assumes np_orgs table has at least one org; we'll update existing ones or insert new ones

-- Seed member orgs with cooperative directory fields
-- We'll use display_name as a proxy to identify orgs to update, or insert new ones

INSERT INTO np_orgs (display_name, slug, ein, fiscal_year_end_month, membership_status, mission_summary, location_general, size_band, cooperative_turnarounds, member_since, cooperative_profile)
VALUES
  ('Northeast Workers Coalition', 'northeast-workers-coalition', NULL, 12, 'active', 'Building worker power across the Northeast through organizing and advocacy.', 'Boston, MA', '$250K-$500K', ARRAY['inequality', 'womens_empowerment'], '2024-01-15', '{"mission": "Building worker power", "region": "northeast"}'::jsonb),
  ('Sunrise Climate Justice Project', 'sunrise-climate-justice', NULL, 12, 'active', 'Youth-led movement fighting for climate justice and a Green New Deal.', 'Philadelphia, PA', 'under $250K', ARRAY['energy', 'inequality'], '2024-02-01', '{"mission": "Climate justice", "region": "mid-atlantic"}'::jsonb),
  ('Midwest Food Security Network', 'midwest-food-security', NULL, 12, 'active', 'Connecting food banks, farms, and communities to end hunger in the Midwest.', 'Chicago, IL', '$500K-$1M', ARRAY['food', 'poverty'], '2024-01-20', '{"mission": "Food security", "region": "midwest"}'::jsonb),
  ('Valley Education Alliance', 'valley-education-alliance', NULL, 6, 'active', 'Advocating for equitable funding and policies in rural school districts.', 'Fresno, CA', 'under $250K', ARRAY['inequality', 'poverty'], '2024-03-01', '{"mission": "Education equity", "region": "west"}'::jsonb),
  ('Gulf Coast Resilience Fund', 'gulf-coast-resilience', NULL, 12, 'active', 'Supporting communities impacted by climate disasters with recovery and preparedness.', 'New Orleans, LA', '$250K-$500K', ARRAY['energy', 'poverty'], '2024-01-10', '{"mission": "Climate resilience", "region": "south"}'::jsonb),
  ('Appalachian Health Collective', 'appalachian-health', NULL, 12, 'active', 'Providing healthcare access and health education in underserved Appalachian communities.', 'Charleston, WV', '$500K-$1M', ARRAY['poverty', 'womens_empowerment'], '2024-02-15', '{"mission": "Healthcare access", "region": "appalachia"}'::jsonb),
  ('Borderlands Immigrant Rights', 'borderlands-rights', NULL, 12, 'active', 'Defending immigrant rights and providing legal services at the border.', 'El Paso, TX', '$250K-$500K', ARRAY['inequality', 'poverty'], '2024-01-25', '{"mission": "Immigrant rights", "region": "southwest"}'::jsonb),
  ('Pacific Northwest Forest Alliance', 'pnw-forest', NULL, 12, 'active', 'Protecting old-growth forests and sustainable forestry practices.', 'Seattle, WA', 'over $1M', ARRAY['energy', 'food'], '2024-01-05', '{"mission": "Forest protection", "region": "pacific-northwest"}'::jsonb),
  ('Great Lakes Water Initiative', 'great-lakes-water', NULL, 12, 'active', 'Working to protect and restore the Great Lakes ecosystem.', 'Detroit, MI', '$500K-$1M', ARRAY['energy', 'inequality'], '2024-02-20', '{"mission": "Water protection", "region": "great-lakes"}'::jsonb),
  ('Desert Arts and Culture Council', 'desert-arts-council', NULL, 12, 'active', 'Preserving and celebrating Indigenous arts and culture in the Southwest.', 'Santa Fe, NM', 'under $250K', ARRAY['womens_empowerment', 'inequality'], '2024-03-10', '{"mission": "Arts and culture", "region": "southwest"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Seed cooperative library items
INSERT INTO cooperative_library_items (category, title, description, body_markdown, display_order, last_updated_at)
VALUES
  -- Chart of accounts
  ('chart_of_accounts', 'UCOA-aligned chart reference', 'Standard UCOA account codes and mapping guidance', '# UCOA Chart of Accounts Reference\n\nThis document provides the standard UCOA (Uniform Chart of Accounts) account codes used across the cooperative.\n\n## Revenue Codes\n- 10-199: Contributions and grants\n- 20-299: Program service revenue\n- 30-399: Investment income\n\n## Expense Codes\n- 40-499: Program expenses\n- 50-599: Management and general\n- 60-699: Fundraising\n\n*(Placeholder for full document)*', 1, NOW()),
  ('chart_of_accounts', 'Sample COA: Human Services Org', 'Example chart of accounts for a human services nonprofit', '# Sample Chart of Accounts: Human Services\n\n## Revenue\n- 101: Individual contributions\n- 102: Foundation grants\n- 103: Government contracts\n\n## Program Expenses\n- 401: Direct client services\n- 402: Case management\n- 403: Counseling services\n\n*(Placeholder for full document)*', 2, NOW()),
  
  -- Templates - Financial Reports
  ('templates_financial_reports', 'Board report template', 'Monthly financial report template for board meetings', '# Monthly Board Financial Report Template\n\n## Executive Summary\n- Total revenue: $___\n- Total expenses: $___\n- Net income: $___\n\n## Budget vs Actual\n| Category | Budget | Actual | Variance |\n\n## Key Metrics\n- Months of cash reserve: ___\n- Program expense ratio: ___%\n\n*(Placeholder for full document)*', 1, NOW()),
  ('templates_financial_reports', 'Month-end close template', 'Checklist and template for monthly financial close process', '# Month-End Close Template\n\n## Pre-Close Checklist\n- [ ] All invoices entered\n- [ ] Bank reconciliation complete\n- [ ] Revenue recognition reviewed\n\n## Close Process\n1. Review outstanding receivables\n2. Verify accruals\n3. Reconcile accounts\n\n*(Placeholder for full document)*', 2, NOW()),
  ('templates_financial_reports', 'Cash flow forecast template', '13-week cash flow forecasting template', '# Cash Flow Forecast Template\n\n## Opening Cash Balance: $___\n\n## Weekly Projections\n| Week | Inflows | Outflows | Net | Ending Balance |\n\n## Key Assumptions\n- Grant disbursement schedule\n- Major expense timing\n\n*(Placeholder for full document)*', 3, NOW()),
  
  -- Templates - Grants
  ('templates_grants', 'Grant proposal template', 'Standard grant proposal template for cooperative members', '# Grant Proposal Template\n\n## Executive Summary\n[Brief overview of project and funding request]\n\n## Statement of Need\n[Describe the problem and community need]\n\n## Project Description\n[Goals, objectives, activities]\n\n## Budget Narrative\n[Detailed budget explanation]\n\n*(Placeholder for full document)*', 1, NOW()),
  ('templates_grants', 'Letter of Inquiry template', 'LOI template for initial foundation outreach', '# Letter of Inquiry Template\n\nDear [Foundation Name],\n\n[Organization name] respectfully submits this letter of inquiry for consideration of funding for [project name].\n\n## Project Overview\n[Brief 2-3 paragraph description]\n\n## Funding Request\n$___ over ___ months\n\n*(Placeholder for full document)*', 2, NOW()),
  ('templates_grants', 'Grant report template', 'Standard narrative and financial report template for grant reporting', '# Grant Report Template\n\n## Period Covered: [dates]\n\n## Narrative Report\n### Progress Toward Objectives\n[Describe progress and outcomes]\n\n### Challenges and Lessons Learned\n[Reflect on challenges faced]\n\n## Financial Report\n| Budget Category | Budget | Actual | Explanation |\n\n*(Placeholder for full document)*', 3, NOW()),
  ('templates_grants', 'Grant budget template', 'Excel-ready budget template for grant applications', '# Grant Budget Template\n\n## Personnel\n| Position | % FTE | Annual Salary | Benefits | Total |\n\n## Direct Program Costs\n| Line Item | Unit Cost | Units | Total |\n\n## Indirect Costs\n- Administrative overhead: ___%\n\n## Total Budget Request: $___\n\n*(Placeholder for full document)*', 4, NOW()),
  
  -- Templates - Board Materials
  ('templates_board_materials', 'Board packet structure', 'Standard agenda and document organization for board meetings', '# Board Packet Structure\n\n## Meeting Information\n- Date, time, location\n- Attendees list\n- Quorum confirmation\n\n## Agenda Items\n1. Call to order\n2. Minutes approval\n3. Executive Director report\n4. Committee reports\n5. Old business\n6. New business\n7. Adjournment\n\n## Supporting Materials\n- Financial statements\n- Committee reports\n- Policy documents for review\n\n*(Placeholder for full document)*', 1, NOW()),
  ('templates_board_materials', 'Board meeting agenda template', 'Standard agenda template with time allocations', '# Board Meeting Agenda Template\n\n## Call to Order (5 min)\n- Welcome and introductions\n\n## Consent Agenda (10 min)\n- Minutes approval\n- Financial report acceptance\n\n## Executive Director Report (15 min)\n\n## Committee Reports (20 min)\n- Finance committee\n- Governance committee\n\n## Old Business (15 min)\n\n## New Business (20 min)\n\n## Adjournment\n\n*(Placeholder for full document)*', 2, NOW()),
  ('templates_board_materials', 'Financial report layout for board', 'How to present financial information to board members', '# Board Financial Report Layout\n\n## Dashboard Summary\n- Revenue vs Budget: ___%\n- Expenses vs Budget: ___%\n- Cash position: $___\n\n## Visual Charts\n- Revenue waterfall\n- Expense breakdown by program\n- Cash trend line\n\n## Narrative Highlights\n- Significant variances explained\n- Risks and opportunities\n\n*(Placeholder for full document)*', 3, NOW()),
  
  -- Policy Examples
  ('policy_examples', 'Financial policies template', 'Comprehensive financial policy document template', '# Financial Policies Template\n\n## Revenue Recognition Policy\n- When to recognize contributions\n- Treatment of restricted grants\n\n## Expense Policy\n- Authorization levels\n- Reimbursement procedures\n- Credit card usage\n\n## Investment Policy\n- Investment objectives\n- Risk tolerance\n- Spending policy\n\n*(Placeholder for full document)*', 1, NOW()),
  ('policy_examples', 'Conflict of interest policy', 'Standard conflict of interest policy template', '# Conflict of Interest Policy\n\n## Purpose\nTo ensure that all decisions are made in the best interest of the organization.\n\n## Disclosure Requirements\n- Board members must disclose financial interests\n- Staff must disclose outside employment\n\n## Review Process\n- Annual disclosure forms\n- Recusal from related decisions\n\n*(Placeholder for full document)*', 2, NOW()),
  ('policy_examples', 'Document retention policy', 'Policy for record retention and destruction schedules', '# Document Retention Policy\n\n## Retention Periods\n- Financial records: 7 years\n- Board minutes: Permanent\n- Personnel files: 7 years after termination\n- Grant files: 7 years after grant close\n\n## Destruction Process\n- Secure destruction methods\n- Certificate of destruction\n\n*(Placeholder for full document)*', 3, NOW()),
  ('policy_examples', 'Gift acceptance policy', 'Guidelines for accepting donations and gifts', '# Gift Acceptance Policy\n\n## Acceptable Gifts\n- Cash contributions\n- Securities\n- Real property (subject to board approval)\n\n## Restrictions\n- No gifts that create conflicts of interest\n- No gifts with unreasonable restrictions\n\n## Acknowledgment Process\n- All gifts acknowledged within 48 hours\n- Donor recognition guidelines\n\n*(Placeholder for full document)*', 4, NOW()),
  
  -- Methods Notes
  ('methods_notes', 'Month-end close workflow', 'Step-by-step process for monthly financial close', '# Month-End Close Workflow\n\n## Day 1-2: Data Entry\n- Enter all invoices and bills\n- Record revenue recognition\n- Bank feeds reconciliation\n\n## Day 3-4: Review and Adjust\n- Review accruals\n- Verify allocations\n- Check for missing entries\n\n## Day 5: Final Review\n- Financial statement review\n- Variance analysis\n- Management reports\n\n## Day 6: Distribution\n- Board report preparation\n- Grant report updates\n\n*(Placeholder for full document)*', 1, NOW()),
  ('methods_notes', 'Audit preparation checklist', 'Comprehensive checklist for annual audit preparation', '# Audit Preparation Checklist\n\n## 3 Months Before Audit\n- Select auditor\n- Begin PBC list preparation\n- Schedule audit timeline\n\n## 1 Month Before Audit\n- Complete year-end close\n- Prepare trial balance\n- Gather supporting documents\n\n## 2 Weeks Before Audit\n- Finalize PBC list\n- Prepare workpaper binders\n- Schedule entrance meeting\n\n## During Audit\n- Respond to inquiries promptly\n- Provide additional documentation\n- Review draft financials\n\n*(Placeholder for full document)*', 2, NOW()),
  ('methods_notes', '990 preparation guide', 'Guide to preparing Form 990 with cooperative best practices', '# Form 990 Preparation Guide\n\n## Timeline\n- Begin preparation 3 months before filing deadline\n- Allow 4-6 weeks for review\n- File by May 15th (with extension)\n\n## Key Sections\n- Part I: Summary\n- Part VII: Compensation (careful review)\n- Part IX: Functional expenses\n- Schedule A: Public charity status\n\n## Common Pitfalls\n- Inconsistent reporting between years\n- Missing disclosures\n- Incorrect compensation reporting\n\n*(Placeholder for full document)*', 3, NOW())
ON CONFLICT DO NOTHING;

-- Get org IDs for work requests (using the orgs we just inserted)
-- We'll use a CTE to reference them by slug

WITH orgs AS (
  SELECT id, slug FROM np_orgs
  WHERE slug IN ('northeast-workers-coalition', 'sunrise-climate-justice', 'midwest-food-security',
                 'valley-education-alliance', 'gulf-coast-resilience', 'appalachian-health',
                 'borderlands-rights', 'pnw-forest', 'great-lakes-water', 'desert-arts-council')
)
INSERT INTO cooperative_work_requests (np_org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at)
SELECT
  o.id,
  req.category::cooperative_work_category,
  req.title,
  req.description,
  req.hours_estimate,
  req.needed_by::date,
  req.status::cooperative_work_status,
  req.created_at,
  req.updated_at
FROM orgs o
CROSS JOIN (VALUES
  ('northeast-workers-coalition', 'bookkeeping', 'Monthly bookkeeping support', 'Need help with monthly reconciliation and financial statement preparation', 15, '2025-05-15', 'open', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('sunrise-climate-justice', 'grant_writing', 'Climate justice grant proposal', 'Seeking grant writer for $50k climate resilience grant', 20, '2025-06-01', 'in_progress', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('midwest-food-security', 'financial_analysis', 'Program cost analysis', 'Need analysis of per-meal costs across food programs', 10, '2025-05-20', 'open', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('valley-education-alliance', '990_prep', 'Annual 990 preparation', 'Need assistance preparing Form 990 for fiscal year ending June 30', 25, '2025-07-15', 'open', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('gulf-coast-resilience', 'board_reporting', 'Quarterly board report', 'Prepare financial dashboard and narrative for quarterly board meeting', 8, '2025-05-10', 'completed', NOW() - INTERVAL '21 days', NOW() - INTERVAL '14 days'),
  ('appalachian-health', 'grant_writing', 'Healthcare access grant', 'Grant writer needed for federal health disparities grant', 30, '2025-08-01', 'open', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  ('borderlands-rights', 'bookkeeping', 'Multi-entity bookkeeping', 'Complex bookkeeping for multiple funding sources and restricted grants', 20, '2025-05-30', 'in_progress', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  ('pnw-forest', 'financial_analysis', 'Revenue diversification study', 'Analysis of current revenue mix and diversification opportunities', 15, '2025-06-15', 'open', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('great-lakes-water', 'board_reporting', 'Annual financial report', 'Comprehensive annual financial report with projections', 12, '2025-05-25', 'open', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
  ('desert-arts-council', 'other', 'Budget development assistance', 'Help developing multi-year program budget for expansion', 18, '2025-06-30', 'open', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  ('northeast-workers-coalition', 'board_reporting', 'Board financial training', 'Provide financial literacy training for board members', 6, '2025-05-20', 'completed', NOW() - INTERVAL '28 days', NOW() - INTERVAL '21 days'),
  ('midwest-food-security', 'grant_writing', 'Food systems grant', 'Grant proposal for regional food systems collaboration', 22, '2025-07-01', 'open', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days')
) AS req(slug, category, title, description, hours_estimate, needed_by, status, created_at, updated_at)
WHERE o.slug = req.slug
ON CONFLICT DO NOTHING;

-- Set up one org as a fiscal sponsor with sponsored projects
-- We'll use "Appalachian Health Collective" as the fiscal sponsor
WITH sponsor_org AS (
  SELECT id FROM np_orgs WHERE slug = 'appalachian-health' LIMIT 1
)
UPDATE np_orgs
SET fiscal_sponsorship_mode = TRUE,
    sponsorship_model = 'model_a',
    default_admin_rate = 10.0
WHERE id = (SELECT id FROM sponsor_org);

-- Insert sponsored projects for the fiscal sponsor
WITH sponsor_org AS (
  SELECT id FROM np_orgs WHERE slug = 'appalachian-health' LIMIT 1
)
INSERT INTO np_sponsored_projects (sponsor_np_org_id, name, description, start_date, end_date, contact_lead_name, contact_lead_email, annual_budget_estimate, status, notes_markdown, created_at, updated_at)
SELECT
  (SELECT id FROM sponsor_org),
  project.name,
  project.description,
  project.start_date::date,
  project.end_date::date,
  project.contact_lead_name,
  project.contact_lead_email,
  project.annual_budget_estimate,
  project.status,
  project.notes_markdown,
  NOW(),
  NOW()
FROM (VALUES
  ('Rural Health Initiative', 'Mobile health clinics serving remote Appalachian communities', '2023-01-01', NULL, 'Maria Rodriguez', 'maria@appalachian-health.org', 150000, 'active', 'Successfully launched 3 mobile clinics. Expanding to 2 more counties next year.'::text),
  ('Youth Mental Health Program', 'School-based mental health services for rural youth', '2022-09-01', '2025-08-31', 'James Chen', 'james@appalachian-health.org', 85000, 'active', 'Partnering with 5 school districts. Seeking expansion funding.'::text),
  ('Community Health Worker Training', 'Training program for local community health workers', '2023-06-01', NULL, 'Sarah Williams', 'sarah@appalachian-health.org', 120000, 'active', 'Graduated 45 CHWs to date. Program has 95% job placement rate.'::text),
  ('Diabetes Prevention Initiative', 'Community-based diabetes prevention and education', '2021-03-01', '2024-12-31', 'Dr. Thomas Green', 'tgreen@appalachian-health.org', 200000, 'winding_down', 'Grant ending December 2024. Transitioning to ongoing program at local health department.'::text),
  ('Maternal Health Access', 'Improving maternal health outcomes in underserved areas', '2024-01-01', NULL, 'Aisha Johnson', 'aisha@appalachian-health.org', 175000, 'paused', 'Paused pending additional funding. Program design complete.'::text),
  ('Elder Care Coordination', 'Care coordination for elderly residents in rural areas', '2023-03-01', NULL, 'Robert Kim', 'robert@appalachian-health.org', 95000, 'active', 'Serving 120 elderly clients. High satisfaction scores.'::text)
) AS project(name, description, start_date, end_date, contact_lead_name, contact_lead_email, annual_budget_estimate, status, notes_markdown)
ON CONFLICT DO NOTHING;
