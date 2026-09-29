-- 217: migration 216 defined org_run_due_recurring_schedules() as SECURITY DEFINER (a genuine
-- cross-org batch job, same reasoning as admin_delete_org) but never locked down EXECUTE the
-- way admin_delete_org (migration 149) does -- Postgres grants EXECUTE to PUBLIC by default at
-- CREATE FUNCTION time, so it was callable by any DB role, not just causal_app. Closing that
-- gap to match the established convention. org_next_recurring_occurrence() is a pure date-math
-- helper with no side effects, but locking it down too for consistency with everything else
-- this function touches.

REVOKE ALL ON FUNCTION public.org_run_due_recurring_schedules() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_run_due_recurring_schedules() TO causal_app;

REVOKE ALL ON FUNCTION public.org_next_recurring_occurrence(date, text, smallint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_next_recurring_occurrence(date, text, smallint[]) TO causal_app;
