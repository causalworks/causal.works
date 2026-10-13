-- 270: program-scope RLS for personnel and compliance.
--
-- Found 2026-09-25 by testing as causal_app with app.current_program_ids = one program: a
-- program-restricted user could still read every org_personnel row (names, salaries) and its
-- change history. Migration 259/262 covered allocations but not the base personnel table, and
-- the compliance tables only had org isolation. The route layer checks membership only, so this
-- is the only enforcement.
--
-- Decisions (plan .claude/plans/2026-09-19-solid-odi-demo-readiness.md):
--   * Personnel: a program-restricted user sees a person only if that person has an allocation to
--     one of their programs (allocation-only). Personnel history follows the same rule.
--   * Compliance: org-wide, stays admin/finance-only. Restricted users see no rows.
-- current_program_ids() IS NULL means unrestricted (admin, finance, legacy staff).
-- Not covered here: org_documents / org_document_expectations (no decision recorded yet).

CREATE POLICY org_personnel_program_scope ON org_personnel AS RESTRICTIVE USING (
  current_program_ids() IS NULL
  OR EXISTS (
    SELECT 1 FROM org_personnel_allocations a
     WHERE a.coop_personnel_id = org_personnel.id
       AND a.coop_program_id = ANY(current_program_ids())
  )
);

CREATE POLICY org_personnel_changes_program_scope ON org_personnel_changes AS RESTRICTIVE USING (
  current_program_ids() IS NULL
  OR EXISTS (
    SELECT 1 FROM org_personnel_allocations a
     WHERE a.coop_personnel_id = org_personnel_changes.coop_personnel_id
       AND a.coop_program_id = ANY(current_program_ids())
  )
);

CREATE POLICY org_compliance_obligations_program_scope ON org_compliance_obligations AS RESTRICTIVE
  USING (current_program_ids() IS NULL);
CREATE POLICY org_vendor_compliance_program_scope ON org_vendor_compliance AS RESTRICTIVE
  USING (current_program_ids() IS NULL);
CREATE POLICY compliance_extension_proposals_program_scope ON compliance_extension_proposals AS RESTRICTIVE
  USING (current_program_ids() IS NULL);
