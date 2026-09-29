-- Migration 086: Internal Controls compliance template items
-- Adds 'internal_controls' as a placeholder category to compliance_template_items.
-- These items cover COSO-aligned obligations (audit, board review, IC assessment).
-- The category is intentionally sparse now; expand before the compliance section ships.

INSERT INTO compliance_template_items
  (applies_to_org_type, category, title, description, frequency, default_due_pattern, display_order, guidance_markdown)
VALUES

  ('{501c3,501c4,fiscal_sponsor,federal_grantee}',
   'internal_controls',
   'Independent Annual Audit or Review',
   'Annual independent audit (required for orgs with revenue >= $750K or federal expenditures >= $1M) or review engagement for smaller organizations. Auditor issues opinion on financial statements and may issue a management letter.',
   'annual',
   'fiscal_year_end+180_days',
   10,
   E'**Who requires this:**\n- Single Audit (2 CFR 200): required if >= $1M in federal award expenditures\n- Many foundations and state grants require audited financials for grants above certain thresholds\n- Some state charity registration requirements trigger at specific revenue levels\n\n**What to prepare:** Trial balance, budget vs. actuals comparison, schedule of grants, functional expense allocation, supporting schedules (insurance, depreciation, prepaid expenses).\n\n**Placeholder note:** Full audit preparation workflow to be built in Phase F (Financial/Audit Schedules).'),

  ('{501c3,501c4,fiscal_sponsor,federal_grantee}',
   'internal_controls',
   'Board Approval of Annual Financial Statements',
   'The board of directors formally reviews and approves the annual financial statements, including the audit or review report if applicable. Documents the board''s oversight of financial reporting.',
   'annual',
   'fiscal_year_end+210_days',
   20,
   E'**COSO relevance:** Control Environment component — board oversight is a foundational internal control.\n\n**What to document:** Board meeting minutes reflecting financial statement review, date of approval, any questions raised and management responses.\n\n**Placeholder note:** Board approval tracking to be integrated with governance module.'),

  ('{501c3,501c4,fiscal_sponsor,federal_grantee}',
   'internal_controls',
   'Management Letter Response',
   'If the external auditor issued a management letter identifying internal control deficiencies or recommendations, management must prepare a written response documenting planned remediation and timeline.',
   'annual',
   'audit_complete+60_days',
   30,
   E'**Why this matters:** Unaddressed management letter findings from prior years become repeat findings — a significant audit risk and a red flag for grantors.\n\n**Placeholder note:** Only applicable when an external audit or review was conducted. Link to audit findings tracking to be built.'),

  ('{501c3,501c4,fiscal_sponsor,federal_grantee}',
   'internal_controls',
   'Budget vs. Actuals Review (Quarterly)',
   'Finance committee or board treasurer reviews actual expenditures against approved budget at least quarterly. Identifies variances and documents explanations.',
   'quarterly',
   'quarter_end+30_days',
   40,
   E'**2 CFR 200 relevance:** Federal grantors expect quarterly variance review for grants. Significant variances (typically >= 10% of a budget category) may require prior approval to reallocate.\n\n**What to document:** Budget vs. actuals report, variance explanations for material differences, any grant reallocation requests submitted.\n\n**Placeholder note:** Budget vs. actuals report to be generated from coop_budget_lines vs. coop_actuals. Phase F.');
