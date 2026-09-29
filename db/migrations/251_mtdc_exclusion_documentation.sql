-- Documentation-only correction, no schema change. External review (2026-09-16) found two real
-- gaps in migration 249's MTDC exclusion design:
--
-- 1. The subaward-portion-above-threshold exclusion is structurally incompatible with a
--    per-account flag: is_mtdc_excluded can only exclude a WHOLE account, but the subaward rule
--    excludes only the PORTION of each individual subaward above a dollar threshold. An org
--    running multiple subawards through one expense account (some under threshold, some over)
--    cannot express "exclude $12K of this $62K subaward but include the rest" with a flag. This
--    is a genuine, disclosed limitation -- not silently implied as handled -- until subawards get
--    their own per-subaward tracking (a real, separate future feature, not built here).
-- 2. The threshold itself changed with the same Oct 2024 Uniform Guidance revision that changed
--    the de minimis rate (already tracked as two eras via indirect_cost_rate_bps IN (1000,1500)):
--    $25,000 for awards made before Oct 1, 2024, $50,000 for awards made on/after that date. The
--    original comment named only $25,000.
-- 3. Participant support costs (2 CFR 200.1) are a commonly-missed categorical exclusion,
--    alongside capital equipment and tuition remission -- worth naming explicitly since it's easy
--    to overlook, unlike equipment/tuition which are more obviously "not a normal direct cost."

COMMENT ON COLUMN public.org_accounts.is_mtdc_excluded IS
  'True for direct-cost expense accounts that Modified Total Direct Costs excludes per 2 CFR 200.1: capital equipment, tuition remission, and participant support costs (stipends/travel for training or conference participants -- easy to miss, unlike the other two). Set explicitly per org/account -- do not infer from account name or type, same discipline as is_non_cash. Does NOT and cannot handle the subaward-portion-above-threshold exclusion ($25,000 for awards before Oct 1 2024, $50,000 on/after) -- that is a per-subaward dollar threshold, not a whole-account exclusion, and needs manual adjustment for subaward-heavy grants until per-subaward tracking exists. See indirectCostRecovery.js and the grant''s indirect cost rate settings UI for the same warning surfaced to users.';
