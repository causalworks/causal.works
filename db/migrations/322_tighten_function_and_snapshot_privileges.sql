-- Functions that run with owner rights are callable only by the application role.
REVOKE EXECUTE ON FUNCTION
  admin_list_orgs_with_pod_status(),
  store_org_pod_credential(integer,text,text,text,text,text),
  resolve_org_pod_credential(integer),
  expire_due_pod_permissions(),
  org_enforce_ledger_lines_same_org(),
  org_run_due_recurring_schedules(),
  documents_due_for_local_purge(integer),
  mark_document_local_copy_purged(integer),
  get_document_purge_status(integer,integer),
  claim_due_pod_acr_outbox_rows(integer),
  resolve_invite_by_token(text),
  resolve_invite_by_id(integer),
  enforce_org_has_admin(),
  accounting_entry_reminders_due()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  admin_list_orgs_with_pod_status(),
  store_org_pod_credential(integer,text,text,text,text,text),
  resolve_org_pod_credential(integer),
  expire_due_pod_permissions(),
  org_run_due_recurring_schedules(),
  documents_due_for_local_purge(integer),
  mark_document_local_copy_purged(integer),
  get_document_purge_status(integer,integer),
  claim_due_pod_acr_outbox_rows(integer),
  resolve_invite_by_token(text),
  resolve_invite_by_id(integer),
  accounting_entry_reminders_due()
TO causal_app;

ALTER FUNCTION org_run_due_recurring_schedules() SET search_path = public;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- The demo snapshot is written and read only by snapshot_demo_org() and restore_demo_org().
REVOKE INSERT, UPDATE, DELETE, SELECT ON org_demo_snapshot FROM causal_app;
