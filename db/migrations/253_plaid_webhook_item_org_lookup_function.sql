-- 253: RLS bootstrapping fix for the Plaid webhook handler (see
-- .claude/plans/archive/2026-09-17-rls-audit-serverjs-raw-pool.md).
--
-- handlePlaidWebhook (server/organizational/routes/plaid.js) has no user session on this
-- path -- Plaid signs the webhook instead -- so nothing ever calls enterOrgContext() before
-- the first query, which looks up org_plaid_items by item_id specifically to DISCOVER which
-- org owns that item. Same bootstrapping problem as resolve_member_org_id() (migration 148):
-- org_plaid_items has a fail-closed RLS policy keyed on app.current_org_id, but that's exactly
-- what this lookup exists to find, so it can't be set yet.
--
-- Fix: a narrow, auditable SECURITY DEFINER function, same pattern as 148. Given a Plaid
-- item_id, return the full org_plaid_items row (the handler needs org_id to enter context,
-- plus the rest of the row to actually run the sync) if one exists.

CREATE OR REPLACE FUNCTION resolve_plaid_item_by_item_id(p_item_id text)
RETURNS org_plaid_items
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM org_plaid_items WHERE item_id = p_item_id LIMIT 1;
$$;

-- Only the app role should ever call this -- not PUBLIC.
REVOKE ALL ON FUNCTION resolve_plaid_item_by_item_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_plaid_item_by_item_id(text) TO causal_app;
