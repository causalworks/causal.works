-- admin_delete_org() removed only the coop_members row. Every org gets its own "Getting Started"
-- workshop project (slug getting-started-<coop_members.id>, see server/organizational/lib/
-- starterWorkshop.js), and workshop_projects has no foreign key back to coop_members, so each
-- deleted org left its starter workshop behind. The demo user, as convener of one left by test
-- org 114, then saw it listed next to Demo Company's own (2026-09-30).
--
-- Deleting the project cascades to its workspaces, threads, documents, and members.
-- cooperative_work_library_items.workshop_id is ON DELETE SET NULL, so library items survive.

CREATE OR REPLACE FUNCTION public.admin_delete_org(p_org_id integer)
 RETURNS TABLE(id integer, slug text, display_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM workshop_projects WHERE workshop_projects.slug = 'getting-started-' || p_org_id::text;
  DELETE FROM coop_members WHERE coop_members.id = p_org_id
  RETURNING coop_members.id, coop_members.slug, coop_members.display_name;
$function$;
