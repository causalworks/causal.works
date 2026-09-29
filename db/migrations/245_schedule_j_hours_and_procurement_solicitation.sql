-- 245: Two Accounting-module compliance gaps (CURRENT_PRIORITIES.md item #8, both confirmed
-- genuinely open 2026-09-14):
--
-- 1. 990 Schedule J Part I line 1a ("average hours per week devoted to position") has no field
--    anywhere in personnel data -- renderScheduleJ() in compliance.js has no hours column to
--    even fail to render. Adds org_personnel.avg_hours_per_week, nullable (existing rows have
--    no basis to infer a value; the UI defaults new entries to 40).
--
-- 2. The tiered procurement-quote gate in bills.js only enforces the flat $15K micro-purchase
--    tier (2 CFR 200.320(a)) -- missing the simplified-acquisition tier ($15K-$250K, "adequate
--    number of qualified sources") and the formal sealed-bid/competitive-proposal tier (at/above
--    the $250K simplified acquisition threshold, 2 CFR 200.320(c)/(d)). The formal tier needs a
--    document category distinct from a plain price quote -- adds 'procurement_solicitation' to
--    org_document_category so an org can attach a full sealed-bid/competitive-proposal package
--    as a single record instead of forcing it through the 'procurement_quote' slot.

ALTER TABLE org_personnel ADD COLUMN avg_hours_per_week numeric(4,1);

ALTER TYPE org_document_category ADD VALUE IF NOT EXISTS 'procurement_solicitation';
