-- 153: fixes a real live bug in every RLS policy from migration 137 (renamed
-- by 144, extended by 152): PostgreSQL's set_config('app.current_org_id',
-- value, true) -- is_local=true -- makes an AD-HOC custom GUC's "reset"
-- value (what current_setting(name, true) returns once no transaction has
-- it actively set) become an EMPTY STRING '', not NULL, the first time that
-- GUC is ever touched in a session. Every subsequent query on that same
-- pooled connection that expects "not scoped to an org yet" to mean
-- current_setting(...) IS NULL instead gets '' -- and every policy here
-- casts it straight to ::integer, so ''::integer throws "invalid input
-- syntax for type integer" for any query that doesn't itself set the GUC on
-- a connection some earlier query already touched it on.
--
-- Reproduced directly in psql:
--   SELECT current_setting('app.current_org_id', true) IS NULL;      -- t (fresh session)
--   BEGIN; SELECT set_config('app.current_org_id', '42', true); COMMIT;
--   SELECT current_setting('app.current_org_id', true) IS NULL;      -- f  <- the bug
--   SELECT current_setting('app.current_org_id', true) = '';         -- t
--   SELECT current_setting('app.current_org_id', true)::int;         -- ERROR
--
-- This is why it surfaced as "Could not load organization" intermittently,
-- worse under fast/concurrent navigation: pg.Pool reuses a small set of
-- connections, so the more requests land on a connection that has already
-- been used for any org-scoped query, the more likely the NEXT unrelated
-- query on that same connection hits this.
--
-- Fix: wrap every cast in NULLIF(..., '') so both the true-unset case (NULL)
-- and this post-first-use reset case ('') are treated identically -- both
-- still fail RLS closed (NULL = anything is false), just without throwing.
-- This is the standard, documented idiom for this exact Postgres gotcha.

ALTER POLICY org_accounts_org_isolation ON public.org_accounts USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_actuals_org_isolation ON public.org_actuals USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_allocation_lines_org_isolation ON public.org_allocation_lines USING ((EXISTS ( SELECT 1
   FROM org_allocation_schedules s
  WHERE ((s.id = org_allocation_lines.coop_allocation_schedule_id) AND (s.coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer)))));
ALTER POLICY org_allocation_monthly_org_isolation ON public.org_allocation_monthly USING ((EXISTS ( SELECT 1
   FROM org_allocation_schedules s
  WHERE ((s.id = org_allocation_monthly.coop_allocation_schedule_id) AND (s.coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer)))));
ALTER POLICY org_allocation_schedules_org_isolation ON public.org_allocation_schedules USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_audit_log_org_isolation ON public.org_audit_log USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_balance_sheet_snapshots_org_isolation ON public.org_balance_sheet_snapshots USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_budget_lines_org_isolation ON public.org_budget_lines USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_org_compliance_obligations_org_isolation ON public.org_compliance_obligations USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_constituent_interactions_org_isolation ON public.org_constituent_interactions USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_constituents_org_isolation ON public.org_constituents USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_fringe_settings_org_isolation ON public.org_fringe_settings USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_functional_classifications_org_isolation ON public.org_functional_classifications USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_gifts_org_isolation ON public.org_gifts USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_grant_allocations_org_isolation ON public.org_grant_allocations USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_grants_org_isolation ON public.org_grants USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_import_history_org_isolation ON public.org_import_history USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_org_invites_org_isolation ON public.org_invites USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_org_members_org_isolation ON public.org_members USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_org_membership_payments_org_isolation ON public.org_membership_payments USING ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.id = org_membership_payments.member_id) AND (m.coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer)))));
ALTER POLICY org_org_membership_reminders_org_isolation ON public.org_membership_reminders USING ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.id = org_membership_reminders.member_id) AND (m.coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer)))));
ALTER POLICY org_org_membership_tiers_org_isolation ON public.org_membership_tiers USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_personnel_org_isolation ON public.org_personnel USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_personnel_allocations_org_isolation ON public.org_personnel_allocations USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_personnel_changes_org_isolation ON public.org_personnel_changes USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_programs_org_isolation ON public.org_programs USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_projections_org_isolation ON public.org_projections USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_schedule_item_allocations_org_isolation ON public.org_schedule_item_allocations USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_schedule_items_org_isolation ON public.org_schedule_items USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_schedules_org_isolation ON public.org_schedules USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_sponsored_projects_org_isolation ON public.org_sponsored_projects USING ((sponsor_coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_tasks_org_isolation ON public.org_tasks USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_users_org_isolation ON public.org_users USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
ALTER POLICY org_users_self_visibility ON public.org_users USING ((user_id = NULLIF(current_setting('app.current_user_id'::text, true), '')::integer));
ALTER POLICY org_xero_program_track_map_org_isolation ON public.org_xero_program_track_map USING ((coop_org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
