-- 063: Seed compliance template items and org obligations

-- Seed base template items (25-40 items covering categories)
INSERT INTO compliance_template_items (applies_to_org_type, category, title, description, frequency, default_due_pattern, guidance_markdown, display_order) VALUES
-- 501(c)(3) specific items
(ARRAY['501c3'], 'tax_filing', 'Annual Form 990 filing', 'File IRS Form 990 for the fiscal year.', 'annual', 'annually by [fiscal year end + 4.5 months]', '# Form 990 Filing

Complete Form 990 including all applicable schedules. Key sections:
- Part I: Summary of activities
- Part VII: Compensation (careful review required)
- Part IX: Functional expenses
- Schedule A: Public charity status

*(Placeholder for full guidance)*', 1),
(ARRAY['501c3'], 'governance', 'Annual board meeting documentation', 'Document all board meetings with minutes and attendance records.', 'annual', 'within 30 days after each meeting', '# Board Meeting Documentation

Maintain minutes for all board meetings including:
- Attendance list
- Motions and decisions
- Conflict of interest disclosures
- Financial report review

*(Placeholder for full guidance)*', 2),
(ARRAY['501c3'], 'governance', 'Annual conflict of interest disclosures', 'Collect signed conflict of interest disclosure forms from all board members and key staff.', 'annual', 'annually by fiscal year end', '# Conflict of Interest Disclosures

Each director and key staff must disclose:
- Financial interests in other organizations
- Family relationships with other directors
- Any potential conflicts

*(Placeholder for full guidance)*', 3),
(ARRAY['501c3'], 'governance', 'Donor acknowledgment compliance', 'Ensure all charitable contributions over $250 are acknowledged with required disclosures.', 'deadline_driven', 'within 30 days of receipt', '# Donor Acknowledgments

Required elements for acknowledgments over $250:
- Statement that no goods/services were provided
- Description and value of goods/services if provided
- Statement that contribution is tax-deductible

*(Placeholder for full guidance)*', 4),
(ARRAY['501c3'], 'governance', 'Annual governance review', 'Review and update bylaws, governance policies, and board composition.', 'annual', 'annually by fiscal year end', '# Governance Review

Annual review should cover:
- Bylaws compliance
- Board term limits and rotation
- Committee structure effectiveness
- Policy updates needed

*(Placeholder for full guidance)*', 5),

-- 501(c)(4) specific items
(ARRAY['501c4'], 'tax_filing', 'Annual Form 990 filing', 'File IRS Form 990 for the fiscal year.', 'annual', 'annually by [fiscal year end + 4.5 months]', '# Form 990 Filing for 501(c)(4)

Additional considerations for social welfare organizations:
- Part III: Statement of program service accomplishments
- Lobbying activities disclosure (Schedule C)
- Political activity reporting

*(Placeholder for full guidance)*', 6),
(ARRAY['501c4'], 'tax_filing', 'Lobbying expenditure tracking', 'Track and report lobbying expenditures if applicable.', 'quarterly', 'quarterly with Form 990', '# Lobbying Expenditure Tracking

Maintain records of:
- Direct lobbying expenses
- Grassroots lobbying expenses
- Time spent on lobbying activities
- Related communications

*(Placeholder for full guidance)*', 7),
(ARRAY['501c4'], 'state_registration', 'State nonprofit registration renewal', 'Renew state nonprofit corporation registration.', 'annual', 'varies by state', '# State Registration Renewal

Each state has different requirements:
- Annual report filing
- Registered agent updates
- Good standing verification

*(Placeholder for full guidance)*', 8),

-- Fiscal sponsor specific items
(ARRAY['fiscal_sponsor'], 'fiscal_sponsor_specific', 'Sponsored project agreement reviews', 'Review all sponsored project agreements for compliance and risk.', 'annual', 'annually', '# Sponsored Project Agreement Reviews

Review each project for:
- Compliance with fiscal sponsor requirements
- Financial oversight adequacy
- Risk assessment
- Reporting requirements met

*(Placeholder for full guidance)*', 9),
(ARRAY['fiscal_sponsor'], 'fiscal_sponsor_specific', 'Annual sponsor-project compliance check', 'Conduct annual compliance review of all sponsored projects.', 'annual', 'annually by fiscal year end', '# Annual Sponsor-Project Compliance Check

Verify:
- All projects maintain separate accounting
- Restricted funds properly tracked
- Grant requirements met
- Audit requirements satisfied

*(Placeholder for full guidance)*', 10),
(ARRAY['fiscal_sponsor'], 'fiscal_sponsor_specific', 'Donor restriction compliance', 'Ensure all donor restrictions on sponsored projects are honored.', 'quarterly', 'quarterly', '# Donor Restriction Compliance

Track and verify:
- Restricted fund balances
- Expense allocation to restrictions
- Donor reporting requirements
- Restriction modifications documented

*(Placeholder for full guidance)*', 11),

-- Federal grant recipient specific items
(ARRAY['federal_grantee'], 'federal_grants_specific', 'Subrecipient monitoring annual review', 'Conduct annual risk assessment and monitoring of all subrecipients.', 'annual', 'annually', '# Subrecipient Monitoring

Annual review includes:
- Financial capability assessment
- Compliance history review
- Site visits as needed
- Corrective action plans

*(Placeholder for full guidance)*', 12),
(ARRAY['federal_grantee'], 'federal_grants_specific', 'Single audit threshold tracking', 'Monitor federal expenditures to determine if single audit is required.', 'monthly', 'monthly', '# Single Audit Threshold

Track total federal expenditures:
- If >$750,000 annually: single audit required
- Maintain audit readiness documentation
- Prepare for audit if threshold approached

*(Placeholder for full guidance)*', 13),
(ARRAY['federal_grantee'], 'federal_grants_specific', 'Indirect cost rate documentation', 'Maintain current indirect cost rate agreement and documentation.', 'annual', 'annually', '# Indirect Cost Rate

Keep current:
- Negotiated indirect cost rate agreement
- Cost allocation plan
- Time distribution documentation
- Rate calculation methodology

*(Placeholder for full guidance)*', 14),
(ARRAY['federal_grantee'], 'federal_grants_specific', 'FFATA reporting', 'Submit FFATA sub-award reporting as required by federal awards.', 'quarterly', 'quarterly', '# FFATA Reporting

Report on all sub-awards:
- Sub-recipient details
- Award amounts
- Project information
- Executive compensation

*(Placeholder for full guidance)*', 15),

-- Cross-cutting items (apply to multiple org types)
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'insurance', 'General liability insurance renewal', 'Renew general liability insurance policy.', 'annual', 'annually by policy expiration', '# General Liability Insurance

Maintain adequate coverage for:
- General liability
- Directors and officers liability
- Property insurance
- Cyber liability (if applicable)

*(Placeholder for full guidance)*', 16),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'corporate_filing', 'Registered agent update', 'Verify and update registered agent information if needed.', 'annual', 'annually', '# Registered Agent

Ensure:
- Registered agent information current
- Agent available during business hours
- Change of agent filed promptly if needed
- State correspondence monitored

*(Placeholder for full guidance)*', 17),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'corporate_filing', 'State corporate annual report', 'File annual report with state of incorporation.', 'annual', 'varies by state', '# State Annual Report

Each state requires:
- Annual report filing
- Updated officer/director information
- Filing fee payment
- Good standing verification

*(Placeholder for full guidance)*', 18),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'fiscal_year_end', 'Fiscal year-end close', 'Complete annual financial close and reconciliation.', 'annual', 'within 90 days of fiscal year end', '# Fiscal Year-End Close

Complete:
- Bank reconciliation
- Account reconciliation
- Accrual adjustments
- Financial statement preparation
- Audit preparation if applicable

*(Placeholder for full guidance)*', 19),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - CA', 'Renew California charitable solicitation registration.', 'annual', 'annually by November 15', '# California Registration

Registry of Charitable Trusts (CT-TR):
- Annual filing required
- Financial statements attached
- $25 filing fee
- Late penalties apply

*(Placeholder for full guidance)*', 20),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - NY', 'Renew New York charitable solicitation registration.', 'annual', 'annually by November 15', '# New York Registration

Charities Bureau filing:
- CHAR500 form annually
- Financial statements required
- Attorney General oversight
- Late filing penalties

*(Placeholder for full guidance)*', 21),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - FL', 'Renew Florida charitable solicitation registration.', 'annual', 'annually by December 31', '# Florida Registration

Department of Agriculture and Consumer Services:
- Annual registration renewal
- Financial report required
- $50 registration fee
- Solicitation permit maintenance

*(Placeholder for full guidance)*', 22),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - TX', 'Renew Texas charitable solicitation registration.', 'annual', 'annually by November 15', '# Texas Registration

Secretary of State:
- Annual report filing
- No separate charitable registration
- Exempt organization filing
- Good standing verification

*(Placeholder for full guidance)*', 23),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - IL', 'Renew Illinois charitable solicitation registration.', 'annual', 'annually by November 15', '# Illinois Registration

Attorney General Charitable Trust Bureau:
- Annual report filing
- Financial statements required
- $25 filing fee
- Professional fundraiser registration if applicable

*(Placeholder for full guidance)*', 24),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - MA', 'Renew Massachusetts charitable solicitation registration.', 'annual', 'annually by November 15', '# Massachusetts Registration

Attorney General Office:
- Annual filing (PC form)
- Financial statements attached
- $35 filing fee
- Professional solicitor reporting

*(Placeholder for full guidance)*', 25),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - PA', 'Renew Pennsylvania charitable solicitation registration.', 'annual', 'annually by November 15', '# Pennsylvania Registration

Department of State:
- Annual filing required
- Financial statements attached
- $15 filing fee
- Bureau of Charitable Organizations oversight

*(Placeholder for full guidance)*', 26),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - WA', 'Renew Washington charitable solicitation registration.', 'annual', 'annually by November 15', '# Washington Registration

Secretary of State Charities Program:
- Annual report filing
- Financial disclosure required
- $20 filing fee
- Commercial co-venturer registration if applicable

*(Placeholder for full guidance)*', 27),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - OR', 'Renew Oregon charitable solicitation registration.', 'annual', 'annually by November 15', '# Oregon Registration

Department of Justice:
- Annual report filing
- Financial statements required
- $50 filing fee
- Professional fundraiser registration

*(Placeholder for full guidance)*', 28),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - CO', 'Renew Colorado charitable solicitation registration.', 'annual', 'annually by November 15', '# Colorado Registration

Secretary of State:
- Annual report filing
- Financial statements attached
- $25 filing fee
- Charitable organization registration

*(Placeholder for full guidance)*', 29),
(ARRAY['501c3', '501c4', 'fiscal_sponsor', 'federal_grantee'], 'state_registration', 'Charitable solicitation registration - MI', 'Renew Michigan charitable solicitation registration.', 'annual', 'annually by November 15', '# Michigan Registration

Department of Attorney General:
- Annual filing required
- Financial statements attached
- $25 filing fee
- Solicitation permit maintenance

*(Placeholder for full guidance)*', 30);

-- Get org IDs from Wave 0 seed data for populating obligations
WITH orgs AS (
  SELECT id, slug FROM np_orgs WHERE slug IN (
    'northeast-workers-coalition', 'sunrise-climate-justice', 'midwest-food-security',
    'valley-education-alliance', 'gulf-coast-resilience', 'appalachian-health',
    'borderlands-rights', 'pnw-forest', 'great-lakes-water', 'desert-arts-council'
  )
)
-- Populate obligations for a few orgs with realistic characteristics
-- Assume northeast-workers-coalition is 501c3 and has state registrations
INSERT INTO np_org_compliance_obligations (np_org_id, source, template_item_id, category, title, description, frequency, next_due_date, status, notes_markdown)
SELECT
  o.id,
  'base_template',
  t.id,
  t.category,
  t.title,
  t.description,
  t.frequency,
  CASE 
    WHEN t.frequency = 'annual' THEN (CURRENT_DATE + INTERVAL '3 months')::DATE
    WHEN t.frequency = 'quarterly' THEN (CURRENT_DATE + INTERVAL '1 month')::DATE
    ELSE NULL
  END,
  CASE 
    WHEN t.frequency = 'annual' AND RANDOM() < 0.3 THEN 'overdue'::compliance_obligation_status
    WHEN t.frequency = 'annual' AND RANDOM() < 0.5 THEN 'due_soon'::compliance_obligation_status
    ELSE 'upcoming'::compliance_obligation_status
  END,
  NULL
FROM orgs o
CROSS JOIN compliance_template_items t
WHERE o.slug = 'northeast-workers-coalition'
  AND t.applies_to_org_type @> ARRAY['501c3']
  AND t.display_order <= 15
ON CONFLICT DO NOTHING;

-- Add a custom org extension for northeast-workers-coalition
WITH org AS (
  SELECT id FROM np_orgs WHERE slug = 'northeast-workers-coalition' LIMIT 1
)
INSERT INTO np_org_compliance_obligations (np_org_id, source, category, title, description, frequency, next_due_date, status, notes_markdown)
SELECT
  org.id,
  'org_extension',
  'federal_grants_specific',
  'DOL Community-Based Job Training Grant compliance',
  'Additional reporting requirements for Department of Labor grant received in 2024.',
  'quarterly',
  (CURRENT_DATE + INTERVAL '2 months')::DATE,
  'upcoming',
  'Requires quarterly performance reports and detailed time allocation documentation.'
FROM org
ON CONFLICT DO NOTHING;

-- Propose this extension for cooperative review
WITH org AS (
  SELECT id FROM np_orgs WHERE slug = 'northeast-workers-coalition' LIMIT 1
),
extension AS (
  SELECT id FROM np_org_compliance_obligations 
  WHERE np_org_id = (SELECT id FROM org) 
    AND source = 'org_extension' 
    AND title = 'DOL Community-Based Job Training Grant compliance'
  LIMIT 1
)
INSERT INTO compliance_extension_proposals (np_org_id, proposed_obligation_id, proposal_status)
SELECT
  org.id,
  extension.id,
  'submitted'
FROM org, extension
ON CONFLICT DO NOTHING;

-- Populate obligations for appalachian-health (fiscal sponsor)
WITH org AS (
  SELECT id FROM np_orgs WHERE slug = 'appalachian-health' LIMIT 1
)
INSERT INTO np_org_compliance_obligations (np_org_id, source, template_item_id, category, title, description, frequency, next_due_date, status, notes_markdown)
SELECT
  org.id,
  'base_template',
  t.id,
  t.category,
  t.title,
  t.description,
  t.frequency,
  CASE 
    WHEN t.frequency = 'annual' THEN (CURRENT_DATE + INTERVAL '6 months')::DATE
    WHEN t.frequency = 'quarterly' THEN (CURRENT_DATE + INTERVAL '2 months')::DATE
    ELSE NULL
  END,
  'upcoming',
  NULL
FROM org
CROSS JOIN compliance_template_items t
WHERE t.applies_to_org_type @> ARRAY['fiscal_sponsor']
  OR t.applies_to_org_type @> ARRAY['501c3']
ON CONFLICT DO NOTHING;

-- Update some orgs with characteristics for type-aware assignment
UPDATE np_orgs
SET entity_classification = '501(c)(3)',
    federal_grant_recipient = TRUE,
    state_charitable_solicitation_registrations = ARRAY['MA', 'NY'],
    has_lobbying_activity = FALSE,
    has_political_electoral_activity = FALSE
WHERE slug = 'northeast-workers-coalition';

UPDATE np_orgs
SET entity_classification = '501(c)(3)',
    federal_grant_recipient = FALSE,
    state_charitable_solicitation_registrations = ARRAY['WV'],
    has_lobbying_activity = FALSE,
    has_political_electoral_activity = FALSE
WHERE slug = 'appalachian-health';

UPDATE np_orgs
SET entity_classification = '501(c)(3)',
    federal_grant_recipient = TRUE,
    state_charitable_solicitation_registrations = ARRAY['IL', 'IN', 'MI'],
    has_lobbying_activity = TRUE,
    has_political_electoral_activity = FALSE
WHERE slug = 'midwest-food-security';
