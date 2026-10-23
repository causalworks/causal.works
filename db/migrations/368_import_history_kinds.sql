-- Import history: allow the personnel import and the export-and-delete actions, which were being refused by the kind check.
ALTER TABLE org_import_history DROP CONSTRAINT org_import_history_import_kind_check;
ALTER TABLE org_import_history ADD CONSTRAINT org_import_history_import_kind_check
  CHECK (import_kind = ANY (ARRAY['coa','programs','grants','budget_lines','actuals','balance_sheet','bank_statement','personnel',
    'export_delete_actuals','export_delete_budget_lines','export_delete_grants','export_delete_structure']));
