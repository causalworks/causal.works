-- Fiscal sponsorship core compliance, Phase 1 (schema only). Sponsored Projects had zero
-- financial connectivity -- no model-type field, no link to the Budget/Ledger program
-- dimension, no per-project admin-fee override -- confirmed via external research
-- (.claude/plans/2026-09-14-fiscal-sponsorship-core-compliance.md) and verified directly
-- against this table before writing this migration. All columns nullable: NULL means
-- "inherit the org-wide default from org_settings," same pattern already used elsewhere in
-- this codebase (a ledger line's restriction class defaults from its grant's
-- donor_restriction_class when not set explicitly -- Ledger_Module_V1_Spec.md 3.2).
--
-- Per-project override (not org-wide only) because real fiscal sponsors commonly run both
-- models across their portfolio at once -- a Model A project (fully absorbed) alongside a
-- Model C one (an existing entity the sponsor grants to) is not an edge case. Building the
-- override now, while financial connectivity is being added from scratch anyway, costs one
-- nullable column; retrofitting it after ledger-write paths assume a single org-wide model
-- would cost much more.

ALTER TABLE public.org_sponsored_projects
  ADD COLUMN sponsorship_model text,
  ADD COLUMN program_id integer,
  ADD COLUMN admin_rate numeric(5,2);

ALTER TABLE public.org_sponsored_projects
  ADD CONSTRAINT org_sponsored_projects_sponsorship_model_check
  CHECK (sponsorship_model IS NULL OR sponsorship_model IN ('model_a', 'model_c', 'other'));

ALTER TABLE public.org_sponsored_projects
  ADD CONSTRAINT org_sponsored_projects_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;

CREATE INDEX idx_org_sponsored_projects_program ON public.org_sponsored_projects (program_id)
  WHERE program_id IS NOT NULL;

-- Agreement-document linkage, same shape as org_documents.obligation_id (Compliance's own
-- linkage pattern) -- lets the actual fiscal sponsorship agreement (model type, admin fee,
-- reporting terms, variance-power language, fund-disposition-on-exit terms) attach to its
-- project record. grant_agreement / contract_lease are already valid org_document_category
-- values -- no enum change needed.
ALTER TABLE public.org_documents
  ADD COLUMN sponsored_project_id integer;

ALTER TABLE public.org_documents
  ADD CONSTRAINT org_documents_sponsored_project_id_fkey
  FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE SET NULL;

CREATE INDEX idx_org_documents_sponsored_project ON public.org_documents (sponsored_project_id)
  WHERE sponsored_project_id IS NOT NULL;
