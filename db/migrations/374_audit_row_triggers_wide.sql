-- Row changes on gifts, grants, bills, invoices, claims, contacts, access, settings, membership and sponsorship tables are recorded by the database.
-- Columns holding secrets are left out of the record. Single-row-per-organization tables record the organization id as the record id.

CREATE OR REPLACE FUNCTION org_audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_src jsonb; v_org integer; v_user integer; v_col text;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  FOREACH v_col IN ARRAY COALESCE(TG_ARGV, ARRAY[]::text[]) LOOP
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  END LOOP;
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN RETURN NULL; END IF;
  v_src := COALESCE(v_new, v_old);
  v_org := COALESCE(v_src->>'org_id', v_src->>'sponsor_org_id')::integer;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM coop_members WHERE id = v_org) THEN RETURN NULL; END IF;
  v_user := NULLIF(current_setting('app.current_user_id', true), '')::integer;
  INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_org, v_user, 'db_' || lower(TG_OP), TG_TABLE_NAME, COALESCE((v_src->>'id')::bigint, v_org), v_old::text, v_new::text);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION org_audit_row_change() FROM PUBLIC;

DO $$
DECLARE
  spec text[];
  specs text[][] := ARRAY[
    ['org_gifts',''], ['org_gift_pledge_installments',''], ['org_grants',''], ['org_grant_allocations',''],
    ['org_grant_allocation_requests',''], ['org_program_grants',''],
    ['org_bills',''], ['org_bill_payments',''], ['org_bill_credit_notes',''],
    ['org_invoices',''], ['org_invoice_payments',''], ['org_invoice_credit_notes',''],
    ['org_expense_claims',''], ['org_expense_claim_payments',''],
    ['org_bank_reconciliation_periods',''], ['org_fiscal_year_locks',''], ['org_conversion_balances',''],
    ['org_indirect_cost_recovery_entries',''], ['org_pledge_accretion_entries',''], ['org_fixed_asset_depreciation_entries',''],
    ['org_accounts',''], ['org_programs',''], ['org_documents',''], ['org_compliance_obligations',''],
    ['org_payment_accounts','secret_enc,secret_iv,secret_tag,webhook_secret_enc,webhook_secret_iv,webhook_secret_tag'],
    ['org_vendor_compliance','tax_id_encrypted'],
    ['org_constituents',''], ['org_contact_roles',''], ['org_access_permissions',''], ['org_users',''],
    ['org_invites','token_hash'], ['org_public_links','token_hash'],
    ['org_public_settings','challenge_secret_enc,challenge_secret_iv,challenge_secret_tag'],
    ['org_settings','xero_token_data'],
    ['org_membership_tiers',''], ['org_membership_tier_prices',''], ['org_membership_terms',''], ['org_membership_payments',''],
    ['org_membership_recognition',''], ['org_membership_seats',''], ['org_membership_join_requests','ip_hash'],
    ['org_sponsor_agreements',''], ['org_sponsor_agreement_amendments',''], ['org_sponsored_projects',''],
    ['org_sponsored_project_disbursements',''], ['org_sponsor_payment_requests',''], ['org_sponsor_approvals',''],
    ['org_sponsor_closings',''], ['org_sponsor_recalls',''], ['org_sponsor_fee_rules',''], ['org_sponsor_fee_postings',''],
    ['org_sponsor_reports',''], ['org_sponsor_statements',''], ['org_sponsor_applications','']
  ];
  args text;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    IF to_regclass('public.' || spec[1]) IS NULL THEN RAISE EXCEPTION 'missing table %', spec[1]; END IF;
    args := CASE WHEN spec[2] = '' THEN '' ELSE (SELECT string_agg(quote_literal(c), ', ') FROM unnest(string_to_array(spec[2], ',')) c) END;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || spec[1] || '_audit', spec[1]);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION org_audit_row_change(%s)',
      'trg_' || spec[1] || '_audit', spec[1], args);
  END LOOP;
END $$;
