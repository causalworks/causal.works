-- 155: every platform user (coop_access = true) gets automatic full-edit
-- membership in the shared Demo Company workspace, no invite required.
--
-- org_users has FORCE RLS (migration 137) scoped by app.current_org_id,
-- which isn't set for signup/admin-toggle requests (no single org in
-- context at that point) -- same bootstrapping problem as migrations 148
-- and 151, same fix: a narrow SECURITY DEFINER function.
--
-- Looks the org up by slug rather than hardcoding an id, since the id is
-- an accident of insertion order and the slug is the stable, documented
-- identifier (see CLAUDE.md's "Current test org" note).

CREATE OR REPLACE FUNCTION bootstrap_demo_org_membership(p_user_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO org_users (coop_org_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'staff')
  ON CONFLICT (coop_org_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_demo_org_membership(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_demo_org_membership(integer) TO causal_app;

-- Backfill: everyone who already has platform access but isn't a Demo
-- Company member yet (this is what fixes andres@redmage.cc / user id 19).
DO $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    INSERT INTO org_users (coop_org_id, user_id, role)
    SELECT v_org_id, u.id, 'staff'
    FROM users u
    WHERE u.coop_access = true
    ON CONFLICT (coop_org_id, user_id) DO NOTHING;
  END IF;
END $$;
