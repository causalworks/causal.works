--
-- PostgreSQL database dump
--

\restrict tEvUxAsPU4pcgG8xmf1wVpcNdJw7YYTSjbm2ox78dcoZTVu7q6cazR7gyPAvdAI

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: compliance_frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compliance_frequency AS ENUM (
    'annual',
    'quarterly',
    'monthly',
    'one_time',
    'deadline_driven'
);


--
-- Name: compliance_obligation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compliance_obligation_status AS ENUM (
    'upcoming',
    'due_soon',
    'overdue',
    'completed_this_cycle',
    'not_applicable'
);


--
-- Name: compliance_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compliance_source AS ENUM (
    'base_template',
    'org_extension'
);


--
-- Name: cooperative_library_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cooperative_library_category AS ENUM (
    'chart_of_accounts',
    'templates_financial_reports',
    'templates_grants',
    'templates_board_materials',
    'policy_examples',
    'methods_notes'
);


--
-- Name: cooperative_work_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cooperative_work_category AS ENUM (
    'bookkeeping',
    'grant_writing',
    '990_prep',
    'board_reporting',
    'financial_analysis',
    'other'
);


--
-- Name: cooperative_work_library_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cooperative_work_library_category AS ENUM (
    'workshop_output',
    'work_pool_case_study',
    'engagement_artifact'
);


--
-- Name: cooperative_work_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cooperative_work_status AS ENUM (
    'open',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: gift_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gift_payment_method AS ENUM (
    'check',
    'ach',
    'wire',
    'credit_card',
    'cash',
    'stripe',
    'in_kind',
    'other'
);


--
-- Name: gift_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gift_type AS ENUM (
    'grant',
    'donation',
    'pledge',
    'membership_dues'
);


--
-- Name: membership_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.membership_status AS ENUM (
    'active',
    'grace_period',
    'lapsed',
    'terminated',
    'pending_first_payment'
);


--
-- Name: org_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_account_type AS ENUM (
    'income',
    'expense',
    'asset',
    'liability',
    'equity'
);


--
-- Name: org_actual_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_actual_status AS ENUM (
    'pending',
    'confirmed',
    'skipped'
);


--
-- Name: org_document_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_document_category AS ENUM (
    'irs_determination_letter',
    'form_990',
    'audited_financials',
    'management_letter',
    'board_minutes',
    'board_resolution',
    'bylaws',
    'articles_of_incorporation',
    'conflict_of_interest_policy',
    'coi_disclosure',
    'financial_policy',
    'personnel_policy',
    'grant_agreement',
    'award_letter',
    'funder_report',
    'insurance_certificate',
    'state_registration',
    'vendor_w9',
    'contract_lease',
    'payroll_tax_filing',
    'bank_statement',
    'other',
    'vendor_bill',
    'customer_invoice',
    'procurement_quote',
    'sponsee_report',
    'expense_receipt'
);


--
-- Name: org_document_retention_class; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_document_retention_class AS ENUM (
    'permanent',
    'fixed_term',
    'superseded_on_replacement'
);


--
-- Name: org_document_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_document_visibility AS ENUM (
    'org_all',
    'admins_only'
);


--
-- Name: org_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_member_role AS ENUM (
    'admin',
    'staff',
    'board'
);


--
-- Name: org_restriction_class; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_restriction_class AS ENUM (
    'unrestricted',
    'temporarily_restricted',
    'permanently_restricted'
);


--
-- Name: org_task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_task_status AS ENUM (
    'open',
    'assigned',
    'in_progress',
    'complete',
    'dismissed'
);


--
-- Name: proposal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proposal_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'promoted',
    'declined',
    'withdrawn'
);


--
-- Name: reminder_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reminder_type AS ENUM (
    'upcoming_renewal',
    'lapsed',
    'final_notice'
);


--
-- Name: renewal_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.renewal_period AS ENUM (
    'annual',
    'biennial',
    'monthly',
    'lifetime'
);


--
-- Name: sponsorship_model_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sponsorship_model_enum AS ENUM (
    'model_a',
    'model_c',
    'other'
);


--
-- Name: workshop_access_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workshop_access_scope AS ENUM (
    'members_only',
    'cooperative_visible',
    'public'
);


--
-- Name: workshop_space_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workshop_space_role AS ENUM (
    'convener',
    'participant',
    'observer'
);


--
-- Name: workshop_space_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workshop_space_type AS ENUM (
    'coalition',
    'cooperative_governance',
    'cooperative_methods',
    'org_internal'
);


--
-- Name: admin_delete_org(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_org(p_org_id integer) RETURNS TABLE(id integer, slug text, display_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM coop_members WHERE coop_members.id = p_org_id
  RETURNING coop_members.id, coop_members.slug, coop_members.display_name;
$$;


--
-- Name: admin_delete_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_user(p_user_id integer) RETURNS TABLE(id integer, email text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email text;
BEGIN
  SELECT users.email INTO v_email FROM users WHERE users.id = p_user_id;

  DELETE FROM user_org_preferences WHERE user_org_preferences.user_id = p_user_id;
  UPDATE org_allocation_schedules SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_allocation_schedules SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_personnel SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_personnel SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_projections SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_projections SET updated_by = NULL WHERE updated_by = p_user_id;
  DELETE FROM workshop_proposals WHERE proposed_by_user_id = p_user_id;
  DELETE FROM cooperative_library_submissions WHERE proposed_by_user_id = p_user_id;

  IF v_email IS NOT NULL THEN
    DELETE FROM allowed_emails WHERE LOWER(allowed_emails.email) = LOWER(v_email);
  END IF;

  RETURN QUERY
  DELETE FROM users WHERE users.id = p_user_id
  RETURNING users.id, users.email::text;
END;
$$;


--
-- Name: admin_list_orgs_with_member_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_orgs_with_member_counts() RETURNS TABLE(id integer, display_name text, slug text, created_at timestamp with time zone, member_count integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT o.id, o.display_name, o.slug, o.created_at,
         (SELECT COUNT(*)::int FROM org_users u WHERE u.org_id = o.id) AS member_count
  FROM coop_members o
  ORDER BY o.created_at DESC;
$$;


--
-- Name: admin_list_orgs_with_pod_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_orgs_with_pod_status() RETURNS TABLE(org_id integer, display_name text, slug text, pod_provisioned boolean, pod_provisioned_at timestamp with time zone, pod_last_synced_at timestamp with time zone, pod_provisioning_error text, document_count integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    o.id AS org_id,
    o.display_name,
    o.slug,
    COALESCE(s.pod_provisioned, false) AS pod_provisioned,
    s.pod_provisioned_at,
    s.pod_last_synced_at,
    s.pod_provisioning_error,
    (SELECT COUNT(*)::int FROM org_documents d WHERE d.org_id = o.id AND d.archived_at IS NULL) AS document_count
  FROM coop_members o
  LEFT JOIN org_settings s ON s.org_id = o.id
  WHERE o.deleted_at IS NULL
  ORDER BY o.display_name;
$$;


--
-- Name: bootstrap_demo_org_membership(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_demo_org_membership(p_user_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO org_users (org_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'staff')
  ON CONFLICT (org_id, user_id) DO NOTHING;
END;
$$;


--
-- Name: claim_due_pod_acr_outbox_rows(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer DEFAULT 50) RETURNS TABLE(id integer, org_id integer, org_slug text, resource_url text, reason text, attempt_count integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH claimed AS (
    UPDATE pod_acr_outbox
       SET status = 'processing'
     WHERE id IN (
       SELECT o.id FROM pod_acr_outbox o
        WHERE o.status = 'pending' AND o.next_attempt_at <= now()
        ORDER BY o.created_at
        LIMIT p_limit
     )
    RETURNING id, org_id, resource_url, reason, attempt_count
  )
  SELECT c.id, c.org_id, m.slug AS org_slug, c.resource_url, c.reason, c.attempt_count
  FROM claimed c
  JOIN coop_members m ON m.id = c.org_id;
$$;


--
-- Name: demo_org_reset_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_org_reset_tables() RETURNS text[]
    LANGUAGE sql STABLE
    AS $$
  SELECT ARRAY(
    SELECT DISTINCT tc.table_name::text
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'coop_members'
      AND kcu.column_name = 'org_id'
      AND tc.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log', 'org_pod_credentials')
    ORDER BY 1
  );
$$;


--
-- Name: documents_due_for_local_purge(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.documents_due_for_local_purge(p_limit integer DEFAULT 100) RETURNS TABLE(id integer, org_id integer, stored_path text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT id, org_id, stored_path
      FROM org_documents
     WHERE pod_synced_at IS NOT NULL AND local_copy_purged_at IS NULL
     ORDER BY pod_synced_at
     LIMIT p_limit;
$$;


--
-- Name: expire_due_pod_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_due_pod_permissions() RETURNS TABLE(permission_id integer, org_id integer, org_slug text, resource_url text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH expired AS (
    UPDATE pod_access_permissions
       SET revoked_at = now(), revoked_reason = 'expired'
     WHERE revoked_at IS NULL AND expires_at <= now()
    RETURNING id, org_id, resource_url, share_resource_url
  ),
  distinct_resources AS (
    SELECT DISTINCT org_id, resource_url FROM expired WHERE share_resource_url IS NULL
  ),
  distinct_shares AS (
    SELECT DISTINCT org_id, share_resource_url FROM expired WHERE share_resource_url IS NOT NULL
  ),
  enqueued_revokes AS (
    INSERT INTO pod_acr_outbox (org_id, resource_url, reason)
    SELECT org_id, resource_url, 'revoke' FROM distinct_resources
    RETURNING 1
  ),
  enqueued_deletes AS (
    INSERT INTO pod_acr_outbox (org_id, resource_url, reason)
    SELECT org_id, share_resource_url, 'delete_share' FROM distinct_shares
    RETURNING 1
  )
  SELECT e.id AS permission_id, e.org_id, o.slug AS org_slug, e.resource_url
  FROM expired e
  JOIN coop_members o ON o.id = e.org_id;
$$;


--
-- Name: get_document_purge_status(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_document_purge_status(p_document_id integer, p_org_id integer) RETURNS TABLE(id integer, stored_path text, pod_synced_at timestamp with time zone, local_copy_purged_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT id, stored_path, pod_synced_at, local_copy_purged_at
      FROM org_documents
     WHERE id = p_document_id AND org_id = p_org_id;
$$;


--
-- Name: mark_document_local_copy_purged(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_document_local_copy_purged(p_document_id integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    UPDATE org_documents SET local_copy_purged_at = now() WHERE id = p_document_id;
$$;


--
-- Name: org_enforce_actuals_source_writer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_actuals_source_writer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'xero') INTO v_actuals_source
    FROM org_settings WHERE org_id = NEW.org_id;
  IF v_actuals_source IS NULL THEN
    v_actuals_source := 'xero';
  END IF;

  IF NEW.source = 'ledger' AND v_actuals_source <> 'ledger' THEN
    RAISE EXCEPTION 'org % has actuals_source=%, cannot accept a source=ledger org_actuals row', NEW.org_id, v_actuals_source
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source IN ('xero', 'csv') AND v_actuals_source <> 'xero' THEN
    RAISE EXCEPTION 'org % has actuals_source=%, cannot accept a source=% org_actuals row', NEW.org_id, v_actuals_source, NEW.source
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bank_statement_line_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bank_statement_line_account() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a
    WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id AND a.is_cash_account IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_bank_statement_lines.bank_account_id % must be a cash account belonging to org %', NEW.bank_account_id, NEW.org_id
      USING ERRCODE = 'CA007';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bank_statement_transfer_pair_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bank_statement_transfer_pair_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.transfer_pair_line_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM org_bank_statement_lines p
       WHERE p.id = NEW.transfer_pair_line_id AND p.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'org_bank_statement_lines.transfer_pair_line_id % does not belong to org %', NEW.transfer_pair_line_id, NEW.org_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_approval_separation_of_duties(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_approval_separation_of_duties() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.created_by
     AND EXISTS (
       SELECT 1 FROM org_bill_lines bl
       JOIN org_grants g ON g.id = bl.grant_id
       WHERE bl.bill_id = NEW.id AND g.is_federal_award IS TRUE
     )
  THEN
    RAISE EXCEPTION 'org_bills % touches a federal-award grant and cannot be approved by the same user who created it (created_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA008';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_constituent_is_vendor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_constituent_is_vendor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_vendor IS TRUE) THEN
    RAISE EXCEPTION 'org_bills.constituent_id % must reference an org_constituents row with is_vendor = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_credit_note_constituent_is_vendor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_credit_note_constituent_is_vendor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_vendor IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.constituent_id % must reference an org_constituents row with is_vendor = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_credit_notes_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_credit_notes_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.account_id % does not belong to org %', NEW.account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.program_id % does not belong to org %', NEW.program_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NEW.original_bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = NEW.original_bill_id AND b.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.original_bill_id % does not belong to org %', NEW.original_bill_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_lines_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_lines_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_bills WHERE id = NEW.bill_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NEW.grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_grants g WHERE g.id = NEW.grant_id AND g.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.grant_id % does not belong to org %', NEW.grant_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_payments_cash_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_payments_cash_account() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_payments.bank_account_id % must reference a cash account (is_cash_account = true)', NEW.bank_account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_bill_payments_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_bill_payments_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = NEW.bill_id AND b.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_payments.bill_id % does not belong to org %', NEW.bill_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_payments.bank_account_id % does not belong to org %', NEW.bank_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_expense_claim_no_self_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_expense_claim_no_self_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'org_expense_claims % cannot be approved by its own submitter (submitted_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA009';
  END IF;
  IF NEW.confirmed_by IS NOT NULL AND NEW.confirmed_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'org_expense_claims % cannot be confirmed by its own submitter (submitted_by = confirmed_by = %)', NEW.id, NEW.confirmed_by
      USING ERRCODE = 'CA009';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := COALESCE(NEW.fiscal_year, OLD.fiscal_year);
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_actuals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_actuals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := org_fiscal_year_for_period(v_org_id, COALESCE(NEW.period_year, OLD.period_year), COALESCE(NEW.period_month, OLD.period_month));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_alloc_child(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_alloc_child() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_schedule_id integer;
BEGIN
  v_schedule_id := COALESCE(NEW.coop_allocation_schedule_id, OLD.coop_allocation_schedule_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy
    FROM org_allocation_schedules WHERE id = v_schedule_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_balance_sheet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_balance_sheet() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := org_fiscal_year_for_date(v_org_id, COALESCE(NEW.as_of_date, OLD.as_of_date));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_bill_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_bill_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_bill_id integer;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy FROM org_bills WHERE id = v_bill_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_invoice_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_invoice_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_invoice_id integer;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy FROM org_invoices WHERE id = v_invoice_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_fiscal_year_lock_ledger_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_fiscal_year_lock_ledger_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_transaction_id integer;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy
    FROM org_ledger_transactions WHERE id = v_transaction_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: org_enforce_invoice_constituent_is_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_constituent_is_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_customer IS TRUE) THEN
    RAISE EXCEPTION 'org_invoices.constituent_id % must reference an org_constituents row with is_customer = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_invoice_credit_note_constituent_is_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_credit_note_constituent_is_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_customer IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.constituent_id % must reference an org_constituents row with is_customer = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_invoice_credit_notes_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_credit_notes_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.account_id % does not belong to org %', NEW.account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.program_id % does not belong to org %', NEW.program_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NEW.original_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = NEW.original_invoice_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.original_invoice_id % does not belong to org %', NEW.original_invoice_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_invoice_lines_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_lines_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_invoices WHERE id = NEW.invoice_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_invoice_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_invoice_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_invoice_payments_cash_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_payments_cash_account() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_payments.bank_account_id % must reference a cash account (is_cash_account = true)', NEW.bank_account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_invoice_payments_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_invoice_payments_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = NEW.invoice_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_payments.invoice_id % does not belong to org %', NEW.invoice_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_payments.bank_account_id % does not belong to org %', NEW.bank_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_ledger_approval_separation_of_duties(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_ledger_approval_separation_of_duties() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'org_ledger_transactions % cannot be approved by the same user who created it (created_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA005';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_ledger_lines_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_ledger_lines_same_org() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_ledger_transactions WHERE id = NEW.transaction_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NEW.grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_grants g WHERE g.id = NEW.grant_id AND g.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.grant_id % does not belong to org %', NEW.grant_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_ledger_reversal_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_ledger_reversal_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.reverses_transaction_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM org_ledger_transactions r
       WHERE r.id = NEW.reverses_transaction_id AND r.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'org_ledger_transactions.reverses_transaction_id % does not belong to org %', NEW.reverses_transaction_id, NEW.org_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_ledger_transaction_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_ledger_transaction_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_transaction_id integer;
  v_diff bigint;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT COALESCE(SUM(debit_cents), 0) - COALESCE(SUM(credit_cents), 0) INTO v_diff
    FROM org_ledger_lines WHERE transaction_id = v_transaction_id;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'org_ledger_transactions % does not balance (debit minus credit = % cents)', v_transaction_id, v_diff
      USING ERRCODE = 'CA002';
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: org_enforce_plaid_accounts_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_plaid_accounts_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_plaid_items i WHERE i.id = NEW.plaid_item_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_plaid_accounts.plaid_item_id % does not belong to org %', NEW.plaid_item_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.org_account_id AND a.org_id = NEW.org_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_plaid_accounts.org_account_id % must be a cash account belonging to org %', NEW.org_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_actuals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_actuals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.org_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.org_account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_actuals.org_account_id % must reference a posting org_accounts row', NEW.org_account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_bill_credit_notes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_bill_credit_notes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.account_id % must reference a posting org_accounts row', NEW.account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_bill_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_bill_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_budget_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_budget_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_budget_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_invoice_credit_notes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_invoice_credit_notes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.account_id % must reference a posting org_accounts row', NEW.account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_invoice_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_invoice_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_enforce_posting_account_ledger_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_posting_account_ledger_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_fiscal_year_for_date(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_fiscal_year_for_date(p_org_id integer, p_date date) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN org_fiscal_year_for_period(p_org_id, EXTRACT(YEAR FROM p_date)::integer, EXTRACT(MONTH FROM p_date)::integer);
END;
$$;


--
-- Name: org_fiscal_year_for_period(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_fiscal_year_for_period(p_org_id integer, p_year integer, p_month integer) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_fy_end_month integer;
BEGIN
  SELECT COALESCE(fiscal_year_end_month, 12) INTO v_fy_end_month FROM org_settings WHERE org_id = p_org_id;
  IF v_fy_end_month IS NULL THEN v_fy_end_month := 12; END IF;
  IF p_month <= v_fy_end_month THEN
    RETURN p_year;
  ELSE
    RETURN p_year + 1;
  END IF;
END;
$$;


--
-- Name: org_get_or_create_ap_account(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_ap_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_ap_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (2000 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Accounts Payable account (checked 2000-2020)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_ap_account)
  VALUES (p_org_id, v_candidate_code, 'Accounts Payable', 'liability', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: org_get_or_create_ar_account(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_ar_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts WHERE org_id = p_org_id AND is_system_ar_account = true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  LOOP
    v_candidate_code := (1200 + v_offset)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code);
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Accounts Receivable account (checked 1200-1220)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_ar_account)
  VALUES (p_org_id, v_candidate_code, 'Accounts Receivable', 'asset', 3, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: org_get_or_create_clearing_account(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_clearing_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_clearing_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (1090 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s transfer clearing account (checked 1090-1110)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_clearing_account)
  VALUES (p_org_id, v_candidate_code, 'Internal Bank Transfer Clearing', 'asset', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: org_get_or_create_contribution_revenue_account(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_contribution_revenue_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts WHERE org_id = p_org_id AND is_system_contribution_revenue_account = true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  LOOP
    v_candidate_code := (4900 + v_offset)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code);
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s contribution-revenue account (checked 4900-4920)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_contribution_revenue_account)
  VALUES (p_org_id, v_candidate_code, 'Contribution Revenue (Quid Pro Quo Split)', 'income', 3, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: org_get_or_create_expense_claims_payable_account(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_expense_claims_payable_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_expense_claims_payable_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (2050 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Expense Claims Payable account (checked 2050-2070)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_expense_claims_payable_account)
  VALUES (p_org_id, v_candidate_code, 'Expense Claims Payable', 'liability', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: org_get_or_create_internal_transfer_program(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_get_or_create_internal_transfer_program(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
BEGIN
  SELECT id INTO v_id FROM org_programs
    WHERE org_id = p_org_id AND is_system_transfer_program = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO org_programs (org_id, code, name, description, active, is_default, program_kind, is_system_transfer_program)
  VALUES (p_org_id, 'INTERNAL-TRANSFERS', 'Internal Transfers', 'System program for transfers between the organization''s own bank accounts -- no P&L impact.', true, false, 'program', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: org_ledger_recompute_actuals_for_period(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_ledger_recompute_actuals_for_period(p_org_id integer, p_period_year integer, p_period_month integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'xero') INTO v_actuals_source FROM org_settings WHERE org_id = p_org_id;

  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source = 'ledger';

  IF v_actuals_source IS DISTINCT FROM 'ledger' THEN
    RETURN;
  END IF;

  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source IN ('xero', 'csv');

  INSERT INTO org_actuals (
    org_id, status, source, dedupe_key, period_year, period_month,
    description, currency_code, amount_cents, xero_tracking_option_id,
    org_account_id, org_program_id, grant_id,
    auto_matched_account, auto_matched_program, auto_matched_activity
  )
  SELECT
    p_org_id,
    'confirmed'::org_actual_status,
    'ledger',
    'ledger:' || p_period_year || '-' || p_period_month || ':' || l.account_id || ':' || l.program_id
      || ':' || COALESCE(l.grant_id::text, 'none'),
    p_period_year,
    p_period_month,
    MAX(a.name),
    'USD',
    CASE WHEN a.type = 'expense'::org_account_type
         THEN SUM(l.debit_cents) - SUM(l.credit_cents)
         ELSE SUM(l.credit_cents) - SUM(l.debit_cents)
    END AS amount_cents,
    'ledger:' || l.program_id || ':' || COALESCE(l.grant_id::text, 'none'),
    l.account_id,
    l.program_id,
    l.grant_id,
    FALSE, FALSE, FALSE
  FROM org_ledger_lines l
  JOIN org_ledger_transactions t ON t.id = l.transaction_id
  JOIN org_accounts a ON a.id = l.account_id
  WHERE t.org_id = p_org_id AND t.status = 'posted'
    AND t.transaction_date >= make_date(p_period_year, p_period_month, 1)
    AND t.transaction_date < (make_date(p_period_year, p_period_month, 1) + interval '1 month')
    AND a.type IN ('income'::org_account_type, 'expense'::org_account_type)
  GROUP BY l.account_id, l.program_id, l.grant_id, a.type
  HAVING (CASE WHEN a.type = 'expense'::org_account_type
               THEN SUM(l.debit_cents) - SUM(l.credit_cents)
               ELSE SUM(l.credit_cents) - SUM(l.debit_cents)
          END) <> 0;
END;
$$;


--
-- Name: org_next_recurring_occurrence(date, text, smallint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_next_recurring_occurrence(p_current date, p_frequency text, p_active_months smallint[]) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_month smallint;
  v_year integer;
  v_candidate smallint;
BEGIN
  IF p_frequency = 'monthly' THEN
    RETURN (p_current + interval '1 month')::date;
  ELSIF p_frequency = 'quarterly' THEN
    RETURN (p_current + interval '3 months')::date;
  ELSIF p_frequency = 'annual' THEN
    RETURN (p_current + interval '1 year')::date;
  ELSIF p_frequency = 'custom_months' THEN
    v_month := EXTRACT(MONTH FROM p_current)::smallint;
    v_year := EXTRACT(YEAR FROM p_current)::integer;
    SELECT MIN(m) INTO v_candidate FROM unnest(p_active_months) AS m WHERE m > v_month;
    IF v_candidate IS NOT NULL THEN
      RETURN make_date(v_year, v_candidate, LEAST(EXTRACT(DAY FROM p_current)::integer, 28));
    END IF;
    SELECT MIN(m) INTO v_candidate FROM unnest(p_active_months) AS m;
    RETURN make_date(v_year + 1, COALESCE(v_candidate, 1), LEAST(EXTRACT(DAY FROM p_current)::integer, 28));
  ELSE
    RETURN (p_current + interval '1 month')::date;
  END IF;
END;
$$;


--
-- Name: org_recompute_actuals_on_source_flip(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_recompute_actuals_on_source_flip() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  r record;
BEGIN
  IF NEW.actuals_source IS DISTINCT FROM OLD.actuals_source THEN
    FOR r IN
      SELECT DISTINCT EXTRACT(YEAR FROM transaction_date)::integer AS period_year,
                       EXTRACT(MONTH FROM transaction_date)::integer AS period_month
      FROM org_ledger_transactions
      WHERE org_id = NEW.org_id
    LOOP
      PERFORM org_ledger_recompute_actuals_for_period(NEW.org_id, r.period_year, r.period_month);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: org_run_due_recurring_schedules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_run_due_recurring_schedules() RETURNS TABLE(schedule_id integer, generated_kind text, generated_id integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  s RECORD;
  v_constituent_id integer;
  v_reference text;
  v_line jsonb;
  v_fiscal_year integer;
  v_new_id integer;
  v_next date;
BEGIN
  FOR s IN
    SELECT * FROM org_recurring_schedules
    WHERE active IS TRUE AND next_occurrence_date <= CURRENT_DATE
    ORDER BY id
  LOOP
    v_constituent_id := (s.template->>'constituent_id')::integer;
    v_reference := s.template->>'reference';
    v_fiscal_year := org_fiscal_year_for_date(s.org_id, s.next_occurrence_date);

    IF s.schedule_type = 'bill' THEN
      INSERT INTO org_bills (org_id, constituent_id, bill_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, v_constituent_id, s.next_occurrence_date, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          NULLIF(v_line->>'grant_id', '')::integer,
          (v_line->>'amount_cents')::bigint
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'bill'; generated_id := v_new_id;
      RETURN NEXT;

    ELSIF s.schedule_type = 'invoice' THEN
      INSERT INTO org_invoices (org_id, constituent_id, invoice_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, v_constituent_id, s.next_occurrence_date, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, unit_amount_cents, fair_market_value_cents)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          v_line->>'description',
          (v_line->>'unit_amount_cents')::bigint,
          NULLIF(v_line->>'fair_market_value_cents', '')::bigint
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'invoice'; generated_id := v_new_id;
      RETURN NEXT;
    END IF;

    v_next := org_next_recurring_occurrence(s.next_occurrence_date, s.frequency, s.active_months);
    UPDATE org_recurring_schedules
      SET next_occurrence_date = v_next,
          active = (s.end_date IS NULL OR v_next <= s.end_date),
          updated_at = NOW()
      WHERE id = s.id;
  END LOOP;
  RETURN;
END;
$$;


--
-- Name: org_trigger_recompute_actuals_from_ledger_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_trigger_recompute_actuals_from_ledger_lines() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_transaction_id integer;
  v_org_id integer;
  v_period_year integer;
  v_period_month integer;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT org_id, EXTRACT(YEAR FROM transaction_date)::integer, EXTRACT(MONTH FROM transaction_date)::integer
    INTO v_org_id, v_period_year, v_period_month
    FROM org_ledger_transactions WHERE id = v_transaction_id;
  IF v_org_id IS NOT NULL THEN
    PERFORM org_ledger_recompute_actuals_for_period(v_org_id, v_period_year, v_period_month);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: org_trigger_recompute_actuals_from_ledger_void(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_trigger_recompute_actuals_from_ledger_void() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM org_ledger_recompute_actuals_for_period(
      NEW.org_id,
      EXTRACT(YEAR FROM NEW.transaction_date)::integer,
      EXTRACT(MONTH FROM NEW.transaction_date)::integer
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: resolve_member_org_id(integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean DEFAULT false) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT o.id
  FROM coop_members o
  INNER JOIN org_users m ON m.org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug
    AND (NOT p_require_admin OR m.role = 'admin')
  LIMIT 1;
$$;


--
-- Name: resolve_member_org_id_and_role(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_member_org_id_and_role(p_user_id integer, p_slug text) RETURNS TABLE(org_id integer, role text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT o.id, m.role::text
  FROM coop_members o
  INNER JOIN org_users m ON m.org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug AND o.deleted_at IS NULL
  LIMIT 1;
$$;


--
-- Name: resolve_org_pod_credential(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_org_pod_credential(p_org_id integer) RETURNS TABLE(account_email text, encrypted_password text, encryption_iv text, encryption_auth_tag text, pod_webid text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid
  FROM org_pod_credentials WHERE org_id = p_org_id;
$$;


--
-- Name: resolve_user_org_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_user_org_ids(p_user_id integer) RETURNS TABLE(org_id integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT org_id FROM org_users WHERE user_id = p_user_id;
$$;


--
-- Name: restore_demo_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_demo_org() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_org_id integer;
  t text;
  tables text[] := demo_org_reset_tables();
  v_restored integer := 0;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_demo_snapshot LIMIT 1) THEN
    RETURN 0; -- never snapshotted yet; nothing to restore against
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', t);
  END LOOP;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DELETE FROM %I WHERE org_id = $1', t) USING v_org_id;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I,
         (SELECT COALESCE(jsonb_agg(row_data), ''[]''::jsonb) FROM org_demo_snapshot WHERE table_name = $1))',
      t, t
    ) USING t;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
  END LOOP;

  DELETE FROM org_audit_log WHERE org_id = v_org_id;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;

  RETURN v_restored;
EXCEPTION WHEN OTHERS THEN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;
  RAISE;
END;
$_$;


--
-- Name: snapshot_demo_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_demo_org() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_org_id integer;
  t text;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM org_demo_snapshot;

  FOREACH t IN ARRAY demo_org_reset_tables() LOOP
    EXECUTE format(
      'INSERT INTO org_demo_snapshot (table_name, row_data) SELECT %L, to_jsonb(x) FROM %I x WHERE x.org_id = $1',
      t, t
    ) USING v_org_id;
  END LOOP;

  RETURN (SELECT count(*)::integer FROM org_demo_snapshot);
END;
$_$;


--
-- Name: store_org_pod_credential(integer, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_org_pod_credential(p_org_id integer, p_account_email text, p_encrypted_password text, p_encryption_iv text, p_encryption_auth_tag text, p_pod_webid text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO org_pod_credentials (org_id, account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid)
  VALUES (p_org_id, p_account_email, p_encrypted_password, p_encryption_iv, p_encryption_auth_tag, p_pod_webid)
  ON CONFLICT (org_id) DO UPDATE SET
    account_email = EXCLUDED.account_email,
    encrypted_password = EXCLUDED.encrypted_password,
    encryption_iv = EXCLUDED.encryption_iv,
    encryption_auth_tag = EXCLUDED.encryption_auth_tag,
    pod_webid = EXCLUDED.pod_webid;
$$;


--
-- Name: update_membership_members_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_membership_members_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_membership_tiers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_membership_tiers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_org_constituents_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_org_constituents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_org_gifts_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_org_gifts_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actions (
    id integer NOT NULL,
    org_name text,
    action_ask text,
    turnaround_category text,
    urgency text DEFAULT 'Medium'::text,
    raw_content text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    leverage_point text,
    strategy_text text,
    source_url text,
    decision_window_date timestamp with time zone,
    decision_window_label text,
    user_id integer,
    secondary_turnarounds text[],
    e4a_parameters text[],
    action_type text,
    scenario_label text,
    timing_confidence integer,
    org_id integer,
    do_now boolean DEFAULT false,
    timing_display text,
    feature_target text DEFAULT 'push'::text,
    rep_targets text[],
    source text DEFAULT 'user'::text NOT NULL,
    sender_email text,
    reply_to_email text,
    postmark_message_id text,
    inbound_to text,
    inbound_from text,
    inbound_subject text,
    inbound_received_at timestamp with time zone,
    material_stake text,
    boundary_ids text[] DEFAULT '{}'::text[],
    boundary_urgency_score integer DEFAULT 0,
    fr_docket_number text,
    fr_agency text,
    fr_document_url text,
    eip_alert_id text,
    eip_affected_state text
);


--
-- Name: COLUMN actions.sender_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.sender_email IS 'Inbound From address (lowercase) at ingest; used to resolve org via domain + aliases.';


--
-- Name: COLUMN actions.reply_to_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.reply_to_email IS 'Inbound Reply-To address (lowercase) when present; secondary signal for sender org.';


--
-- Name: COLUMN actions.fr_docket_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.fr_docket_number IS 'Federal Register document_number; unique per notice, used for ingest dedupe.';


--
-- Name: COLUMN actions.fr_agency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.fr_agency IS 'Issuing agency name(s) from the Federal Register notice, joined if multiple.';


--
-- Name: COLUMN actions.fr_document_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.fr_document_url IS 'Federal Register html_url for the notice (federalregister.gov).';


--
-- Name: COLUMN actions.eip_alert_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.eip_alert_id IS 'UUID from the EIP Oil & Gas Watch alert''s OGW URL (oilandgaswatch.org/alert/{id}); unique per alert, used as the upsert key.';


--
-- Name: COLUMN actions.eip_affected_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.actions.eip_affected_state IS 'Verbatim EIP "Affected State" value (e.g. "TX", "AL, MS" for multi-state projects). NULL for all non-EIP sources — Federal Register carries no equivalent field.';


--
-- Name: actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.actions_id_seq OWNED BY public.actions.id;


--
-- Name: allowed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowed_emails (
    email text NOT NULL,
    invited_by text,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: bank_pledges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_pledges (
    id integer NOT NULL,
    user_id integer NOT NULL,
    institution_name text NOT NULL,
    pledge_amount integer,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pledged'::text NOT NULL,
    condition_deadline date,
    condition_note text,
    CONSTRAINT bank_pledges_status_check CHECK ((status = ANY (ARRAY['pledged'::text, 'partial_divest'::text, 'divested'::text])))
);


--
-- Name: bank_pledges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_pledges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_pledges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_pledges_id_seq OWNED BY public.bank_pledges.id;


--
-- Name: bank_pressure_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_pressure_actions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    institution_name text NOT NULL,
    action_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_pressure_actions_action_type_check CHECK ((action_type = ANY (ARRAY['c4cj'::text, 'bankgreen'::text, 'third_act'::text])))
);


--
-- Name: bank_pressure_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_pressure_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_pressure_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_pressure_actions_id_seq OWNED BY public.bank_pressure_actions.id;


--
-- Name: causal_service_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.causal_service_credentials (
    id integer DEFAULT 1 NOT NULL,
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT causal_service_credentials_id_check CHECK ((id = 1))
);


--
-- Name: compliance_extension_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_extension_proposals (
    id integer NOT NULL,
    org_id integer NOT NULL,
    proposed_obligation_id integer NOT NULL,
    proposal_status public.proposal_status DEFAULT 'draft'::public.proposal_status NOT NULL,
    cooperative_notes_markdown text,
    decided_at timestamp with time zone,
    decided_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_extension_proposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_extension_proposals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_extension_proposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_extension_proposals_id_seq OWNED BY public.compliance_extension_proposals.id;


--
-- Name: compliance_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_template_items (
    id integer NOT NULL,
    applies_to_org_type text[] NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    frequency public.compliance_frequency NOT NULL,
    default_due_pattern text,
    guidance_markdown text,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_template_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_template_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_template_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_template_items_id_seq OWNED BY public.compliance_template_items.id;


--
-- Name: contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contributions (
    id integer NOT NULL,
    user_id integer,
    org_name text,
    amount_cents integer,
    currency text DEFAULT 'USD'::text,
    contributed_at timestamp with time zone,
    source text DEFAULT 'receipt'::text,
    created_at timestamp with time zone DEFAULT now(),
    org_id integer,
    ein text,
    everyorg_charge_id text,
    change_donation_id text
);


--
-- Name: contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contributions_id_seq OWNED BY public.contributions.id;


--
-- Name: coop_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coop_members (
    id integer NOT NULL,
    causal_org_id integer,
    display_name text NOT NULL,
    slug text,
    member_since timestamp with time zone,
    membership_status text DEFAULT 'trial'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mission_summary text,
    location_general text,
    size_band text,
    cooperative_turnarounds text[],
    deleted_at timestamp with time zone,
    deleted_by_user_id integer,
    is_platform_demo boolean DEFAULT false NOT NULL,
    CONSTRAINT coop_members_cooperative_turnarounds_check CHECK (((array_length(cooperative_turnarounds, 1) IS NULL) OR (cooperative_turnarounds <@ ARRAY['energy'::text, 'food'::text, 'inequality'::text, 'poverty'::text, 'womens_empowerment'::text]))),
    CONSTRAINT coop_members_membership_status_check CHECK ((membership_status = ANY (ARRAY['trial'::text, 'active'::text, 'inactive'::text]))),
    CONSTRAINT coop_members_size_band_check CHECK ((size_band = ANY (ARRAY['under $250K'::text, '$250K-$500K'::text, '$500K-$1M'::text, 'over $1M'::text])))
);


--
-- Name: COLUMN coop_members.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.coop_members.updated_at IS 'Application sets this on UPDATE; DEFAULT NOW() on INSERT only.';


--
-- Name: coop_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coop_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coop_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coop_members_id_seq OWNED BY public.coop_members.id;


--
-- Name: coop_pod_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coop_pod_credentials (
    id integer DEFAULT 1 NOT NULL,
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coop_pod_credentials_id_check CHECK ((id = 1))
);


--
-- Name: cooperative_library_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_library_items (
    id integer NOT NULL,
    category public.cooperative_library_category NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    body_markdown text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cooperative_library_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cooperative_library_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cooperative_library_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cooperative_library_items_id_seq OWNED BY public.cooperative_library_items.id;


--
-- Name: cooperative_library_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_library_submissions (
    id integer NOT NULL,
    target_item_id integer,
    category public.cooperative_library_category NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    body_markdown text NOT NULL,
    proposed_by_user_id integer NOT NULL,
    source_org_id integer,
    status public.proposal_status DEFAULT 'submitted'::public.proposal_status NOT NULL,
    decision_notes text,
    decided_at timestamp with time zone,
    decided_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cooperative_library_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cooperative_library_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cooperative_library_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cooperative_library_submissions_id_seq OWNED BY public.cooperative_library_submissions.id;


--
-- Name: cooperative_work_library_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_work_library_items (
    id integer NOT NULL,
    category public.cooperative_work_library_category NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    body_markdown text NOT NULL,
    workshop_id integer,
    source_org_id integer,
    contributed_by_user_id integer,
    display_order integer DEFAULT 0 NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cooperative_work_library_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cooperative_work_library_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cooperative_work_library_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cooperative_work_library_items_id_seq OWNED BY public.cooperative_work_library_items.id;


--
-- Name: cooperative_work_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_work_requests (
    id integer NOT NULL,
    org_id integer NOT NULL,
    category public.cooperative_work_category NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    hours_estimate numeric(5,1) NOT NULL,
    needed_by date,
    status public.cooperative_work_status DEFAULT 'open'::public.cooperative_work_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cooperative_work_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cooperative_work_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cooperative_work_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cooperative_work_requests_id_seq OWNED BY public.cooperative_work_requests.id;


--
-- Name: financial_rep_pledges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_rep_pledges (
    id integer NOT NULL,
    user_id integer NOT NULL,
    institution_key text NOT NULL,
    commitment_note text,
    status text DEFAULT 'committed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    condition_deadline date,
    condition_note text,
    CONSTRAINT financial_rep_pledges_status_check CHECK ((status = ANY (ARRAY['committed'::text, 'acted'::text, 'withdrawn'::text])))
);


--
-- Name: financial_rep_pledges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financial_rep_pledges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financial_rep_pledges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financial_rep_pledges_id_seq OWNED BY public.financial_rep_pledges.id;


--
-- Name: inbound_debug_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_debug_emails (
    id integer NOT NULL,
    user_id integer,
    message_id text,
    from_email text,
    to_email text,
    subject text,
    best_url text,
    top_urls jsonb,
    text_body text,
    html_body text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inbound_debug_emails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inbound_debug_emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inbound_debug_emails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inbound_debug_emails_id_seq OWNED BY public.inbound_debug_emails.id;


--
-- Name: local_event_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_event_attendance (
    id integer NOT NULL,
    user_id integer NOT NULL,
    source text DEFAULT 'mobilize'::text NOT NULL,
    event_key text NOT NULL,
    title text,
    org_name text,
    event_date timestamp with time zone,
    boundary_ids text[] DEFAULT '{}'::text[] NOT NULL,
    attended boolean NOT NULL,
    responded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE local_event_attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.local_event_attendance IS 'User-reported "did you attend?" responses for real local events (Mobilize) on the Attend tab — the non-actions-table counterpart to user_actions.completed_at, since these events are never stored elsewhere.';


--
-- Name: COLUMN local_event_attendance.event_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.local_event_attendance.event_key IS 'Stable per-event identifier — currently the Mobilize browser_url. Upsert key alongside user_id + source.';


--
-- Name: COLUMN local_event_attendance.attended; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.local_event_attendance.attended IS 'true = "Yes, I attended" (counts toward Ledger); false = "No" (dismisses the card from future feed loads, does not count).';


--
-- Name: local_event_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.local_event_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: local_event_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.local_event_attendance_id_seq OWNED BY public.local_event_attendance.id;


--
-- Name: org_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_accounts (
    id integer NOT NULL,
    org_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type public.org_account_type NOT NULL,
    rollup_parent_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    xero_account_id text,
    standard_category text,
    parent_id integer,
    is_posting boolean DEFAULT true NOT NULL,
    level smallint DEFAULT 3 NOT NULL,
    qb_xero_code text,
    import_category text,
    import_subcategory text,
    import_description text,
    import_active boolean DEFAULT true NOT NULL,
    budget_source text DEFAULT 'schedule'::text NOT NULL,
    is_cash_account boolean DEFAULT false NOT NULL,
    is_system_clearing_account boolean DEFAULT false NOT NULL,
    is_1099_reportable boolean DEFAULT false NOT NULL,
    is_system_ap_account boolean DEFAULT false NOT NULL,
    is_system_ar_account boolean DEFAULT false NOT NULL,
    is_system_contribution_revenue_account boolean DEFAULT false NOT NULL,
    is_statistical boolean DEFAULT false NOT NULL,
    is_non_cash boolean DEFAULT false NOT NULL,
    is_system_expense_claims_payable_account boolean DEFAULT false NOT NULL,
    CONSTRAINT org_accounts_budget_source_chk CHECK ((budget_source = ANY (ARRAY['schedule'::text, 'personnel'::text, 'grant_allocation'::text, 'insurance'::text, 'input'::text]))),
    CONSTRAINT org_accounts_level_check CHECK ((level = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT org_accounts_level_posting_match CHECK ((((level = ANY (ARRAY[1, 2])) AND (is_posting = false)) OR ((level = 3) AND (is_posting = true)))),
    CONSTRAINT org_accounts_no_self_parent CHECK ((parent_id IS DISTINCT FROM id)),
    CONSTRAINT org_accounts_no_self_rollup CHECK ((rollup_parent_id IS DISTINCT FROM id))
);

ALTER TABLE ONLY public.org_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_accounts.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.updated_at IS 'Application sets on UPDATE; DEFAULT NOW() on INSERT.';


--
-- Name: COLUMN org_accounts.xero_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.xero_account_id IS 'Xero AccountID (GUID) mapped to this row; at most one np_accounts row per org per Xero account.';


--
-- Name: COLUMN org_accounts.standard_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.standard_category IS 'Five-digit-style cooperative reporting bucket (e.g. 41000); org code/name preserved for books.';


--
-- Name: COLUMN org_accounts.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.parent_id IS 'COA hierarchy: NULL on level-1 summaries; subtotals point at summary; posting rows point at a level-2 subtotal.';


--
-- Name: COLUMN org_accounts.is_posting; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_posting IS 'TRUE only on leaf posting rows (level 3); FALSE on summary/subtotal roll-ups.';


--
-- Name: COLUMN org_accounts.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.level IS '1 = top summary (e.g. REVENUE), 2 = subtotal (e.g. Earned Revenue), 3 = posting account.';


--
-- Name: COLUMN org_accounts.qb_xero_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.qb_xero_code IS 'External account code for CSV / sync reconciliation.';


--
-- Name: COLUMN org_accounts.import_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.import_category IS 'Optional grouping from coa.csv (e.g. Personnel).';


--
-- Name: COLUMN org_accounts.import_subcategory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.import_subcategory IS 'Optional sub-grouping from coa.csv.';


--
-- Name: COLUMN org_accounts.budget_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.budget_source IS 'schedule=in-grid sub-rows | personnel=Personnel tab | grant_allocation=Grants page | insurance=Insurance tab | input=direct cell edit';


--
-- Name: COLUMN org_accounts.is_cash_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_cash_account IS 'TRUE for bank/cash-equivalent asset accounts, used by cashflow forecasting to compute opening/closing cash position. Auto-set TRUE on Xero sync for accounts whose Xero Type is BANK; editable by staff for cash-equivalents Xero classifies differently.';


--
-- Name: COLUMN org_accounts.is_system_clearing_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_system_clearing_account IS 'True for the org''s internal-bank-transfer clearing account (Bank Reconciliation V1). Looked up via this flag, never a hardcoded account code -- see org_get_or_create_clearing_account().';


--
-- Name: COLUMN org_accounts.is_1099_reportable; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_1099_reportable IS 'Default 1099 relevance for a bill line coded to this account. Editable per line on the bill -- not every purchase from a 1099-eligible vendor is itself 1099-reportable.';


--
-- Name: COLUMN org_accounts.is_system_ap_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_system_ap_account IS 'Marks the org''s single system-managed Accounts Payable liability account, lazily created by org_get_or_create_ap_account on first Bill approval. Same pattern as is_system_clearing_account.';


--
-- Name: COLUMN org_accounts.is_system_ar_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_system_ar_account IS 'Marks the org''s single system-managed Accounts Receivable asset account, lazily created by org_get_or_create_ar_account on first Invoice send. Same pattern as is_system_ap_account/is_system_clearing_account.';


--
-- Name: COLUMN org_accounts.is_system_contribution_revenue_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_system_contribution_revenue_account IS 'Marks the org''s single system-managed contribution-revenue income account, lazily created the first time a quid-pro-quo invoice line (spec 4.3) needs somewhere to post the non-exchange portion of a sale.';


--
-- Name: COLUMN org_accounts.is_statistical; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_statistical IS 'True for non-dollar KPI accounts (clients served, meals delivered) tracked alongside financial accounts via the same org_budget_lines/org_actuals machinery. Every query that sums dollar amounts across accounts must exclude these explicitly -- do not rely on type filtering alone.';


--
-- Name: COLUMN org_accounts.is_non_cash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_non_cash IS 'True for expense accounts that never move cash (depreciation, amortization, in-kind/donated-services expense). The Statement of Cash Flows adds these back to operating cash flow. Set explicitly per org/account -- do not infer from account name.';


--
-- Name: org_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_accounts_id_seq OWNED BY public.org_accounts.id;


--
-- Name: org_actuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_actuals (
    id integer NOT NULL,
    org_id integer NOT NULL,
    status public.org_actual_status DEFAULT 'pending'::public.org_actual_status NOT NULL,
    source text DEFAULT 'xero'::text NOT NULL,
    dedupe_key text NOT NULL,
    period_year smallint NOT NULL,
    period_month smallint NOT NULL,
    description text,
    currency_code character(3) DEFAULT 'USD'::bpchar NOT NULL,
    amount_cents bigint NOT NULL,
    tracking jsonb,
    org_account_id integer,
    org_program_id integer,
    auto_matched_account boolean DEFAULT false NOT NULL,
    auto_matched_program boolean DEFAULT false NOT NULL,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    xero_tracking_option_id text,
    org_activity_id integer,
    auto_matched_activity boolean DEFAULT false NOT NULL,
    grant_id integer,
    CONSTRAINT org_actuals_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT org_actuals_period_year_check CHECK (((period_year >= 1900) AND (period_year <= 2200))),
    CONSTRAINT org_actuals_source_check CHECK ((source = ANY (ARRAY['xero'::text, 'csv'::text, 'ledger'::text])))
);

ALTER TABLE ONLY public.org_actuals FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_actuals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_actuals IS 'Imported cash-bank style lines from Xero (bank transactions). amount_cents is absolute magnitude; account type drives revenue vs expense in reports.';


--
-- Name: COLUMN org_actuals.dedupe_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_actuals.dedupe_key IS 'Stable idempotency key per org, e.g. pl:{period_year}-{period_month}:{np_account_id}:{tracking_option_id|none}.';


--
-- Name: COLUMN org_actuals.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_actuals.updated_at IS 'Application sets on UPDATE; DEFAULT NOW() on INSERT.';


--
-- Name: org_actuals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_actuals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_actuals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_actuals_id_seq OWNED BY public.org_actuals.id;


--
-- Name: org_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_aliases (
    id integer NOT NULL,
    org_id integer NOT NULL,
    alias text NOT NULL,
    alias_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: org_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_aliases_id_seq OWNED BY public.org_aliases.id;


--
-- Name: org_allocation_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_allocation_lines (
    id bigint NOT NULL,
    coop_allocation_schedule_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    coop_account_id integer NOT NULL,
    percent_bps integer,
    amount_cents bigint
);

ALTER TABLE ONLY public.org_allocation_lines FORCE ROW LEVEL SECURITY;


--
-- Name: org_allocation_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_allocation_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_allocation_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_allocation_lines_id_seq OWNED BY public.org_allocation_lines.id;


--
-- Name: org_allocation_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_allocation_monthly (
    id bigint NOT NULL,
    coop_allocation_schedule_id integer NOT NULL,
    period_month integer NOT NULL,
    percent_bps integer NOT NULL,
    CONSTRAINT org_allocation_monthly_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);

ALTER TABLE ONLY public.org_allocation_monthly FORCE ROW LEVEL SECURITY;


--
-- Name: org_allocation_monthly_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_allocation_monthly_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_allocation_monthly_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_allocation_monthly_id_seq OWNED BY public.org_allocation_monthly.id;


--
-- Name: org_allocation_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_allocation_schedules (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    description text,
    fiscal_year integer NOT NULL,
    total_amount_cents bigint NOT NULL,
    source_account_id integer,
    distribution_type text NOT NULL,
    monthly_pattern text DEFAULT 'even'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_alloc_schedules_distribution_type_chk CHECK ((distribution_type = ANY (ARRAY['fixed_percent_by_program'::text, 'fixed_amount_by_program'::text]))),
    CONSTRAINT org_alloc_schedules_monthly_pattern_chk CHECK ((monthly_pattern = ANY (ARRAY['even'::text, 'monthly_custom'::text])))
);

ALTER TABLE ONLY public.org_allocation_schedules FORCE ROW LEVEL SECURITY;


--
-- Name: org_allocation_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_allocation_schedules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_allocation_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_allocation_schedules_id_seq OWNED BY public.org_allocation_schedules.id;


--
-- Name: org_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_audit_log (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    user_id integer,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id bigint NOT NULL,
    field_name text,
    old_value text,
    new_value text,
    metadata jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_audit_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])))
);

ALTER TABLE ONLY public.org_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: org_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_audit_log_id_seq OWNED BY public.org_audit_log.id;


--
-- Name: org_balance_sheet_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_balance_sheet_snapshots (
    id integer NOT NULL,
    org_id integer NOT NULL,
    as_of_date date NOT NULL,
    coop_account_id integer NOT NULL,
    balance_cents bigint NOT NULL,
    restriction_class public.org_restriction_class,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_balance_sheet_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_balance_sheet_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_balance_sheet_snapshots IS 'Imported opening / snapshot balances for BS accounts; replace-all per org+as_of_date on import.';


--
-- Name: org_balance_sheet_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_balance_sheet_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_balance_sheet_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_balance_sheet_snapshots_id_seq OWNED BY public.org_balance_sheet_snapshots.id;


--
-- Name: org_bank_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bank_rules (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    bank_account_id integer,
    payee_contains text,
    description_contains text,
    amount_min_cents bigint,
    amount_max_cents bigint,
    direction text,
    action_account_id integer NOT NULL,
    action_program_id integer NOT NULL,
    action_grant_id integer,
    action_donor_restriction_class public.org_restriction_class,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bank_rules_amount_range CHECK (((amount_min_cents IS NULL) OR (amount_max_cents IS NULL) OR (amount_min_cents <= amount_max_cents))),
    CONSTRAINT org_bank_rules_direction_check CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['debit'::text, 'credit'::text])))),
    CONSTRAINT org_bank_rules_needs_text_condition CHECK (((payee_contains IS NOT NULL) OR (description_contains IS NOT NULL)))
);

ALTER TABLE ONLY public.org_bank_rules FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_bank_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_bank_rules IS 'Deterministic, org-defined coding rules for bank reconciliation. Evaluated first-match-wins by priority against unconfirmed org_bank_statement_lines; never posts automatically -- a matched rule only pre-fills the coding a human then confirms via the existing Create/Cash-Coding posting path.';


--
-- Name: org_bank_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bank_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bank_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bank_rules_id_seq OWNED BY public.org_bank_rules.id;


--
-- Name: org_bank_statement_line_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bank_statement_line_postings (
    id integer NOT NULL,
    statement_line_id integer NOT NULL,
    ledger_transaction_id integer NOT NULL,
    amount_cents bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bank_statement_line_postings_amount_cents_check CHECK ((amount_cents > 0))
);

ALTER TABLE ONLY public.org_bank_statement_line_postings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_bank_statement_line_postings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_bank_statement_line_postings IS 'One row per bill/invoice payment posted as part of a multi-select Find & Match confirmation on a single bank statement line. Single-item Match/Create/Transfer do not use this table -- they keep using org_bank_statement_lines.ledger_transaction_id directly.';


--
-- Name: org_bank_statement_line_postings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bank_statement_line_postings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bank_statement_line_postings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bank_statement_line_postings_id_seq OWNED BY public.org_bank_statement_line_postings.id;


--
-- Name: org_bank_statement_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bank_statement_lines (
    id integer NOT NULL,
    org_id integer NOT NULL,
    bank_account_id integer NOT NULL,
    statement_date date NOT NULL,
    amount_cents bigint NOT NULL,
    payee_raw text,
    description_raw text,
    import_fingerprint text NOT NULL,
    status text DEFAULT 'unconfirmed'::text NOT NULL,
    ledger_transaction_id integer,
    is_internal_transfer boolean DEFAULT false NOT NULL,
    transfer_pair_line_id integer,
    discuss_note text,
    discuss_resolved_at timestamp with time zone,
    coding_source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    credit_debit_indicator text NOT NULL,
    source text DEFAULT 'csv'::text NOT NULL,
    plaid_transaction_id text,
    plaid_pending_transaction_id text,
    pending boolean DEFAULT false NOT NULL,
    applied_rule_id integer,
    CONSTRAINT org_bank_statement_lines_amount_non_negative CHECK ((amount_cents >= 0)),
    CONSTRAINT org_bank_statement_lines_coding_source_check CHECK ((coding_source = ANY (ARRAY['manual'::text, 'rule'::text]))),
    CONSTRAINT org_bank_statement_lines_credit_debit_indicator_check CHECK ((credit_debit_indicator = ANY (ARRAY['credit'::text, 'debit'::text]))),
    CONSTRAINT org_bank_statement_lines_no_self_pair CHECK ((transfer_pair_line_id IS DISTINCT FROM id)),
    CONSTRAINT org_bank_statement_lines_source_check CHECK ((source = ANY (ARRAY['csv'::text, 'plaid'::text]))),
    CONSTRAINT org_bank_statement_lines_status_check CHECK ((status = ANY (ARRAY['unconfirmed'::text, 'confirmed'::text, 'transfer_pending'::text])))
);

ALTER TABLE ONLY public.org_bank_statement_lines FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_bank_statement_lines.credit_debit_indicator; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_bank_statement_lines.credit_debit_indicator IS 'Which direction the amount moves from the org''s own perspective -- credit = money in, debit = money out. amount_cents is always non-negative; this column carries the direction instead of the sign, per spec Section 2.1.';


--
-- Name: COLUMN org_bank_statement_lines.pending; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_bank_statement_lines.pending IS 'Plaid pending transactions import as normal unconfirmed lines but are flagged pending so the UI can show them as provisional. A pending line is deleted outright (not updated) once Plaid reports the corresponding posted transaction, per Plaid''s own "new transaction, not a state change" model.';


--
-- Name: COLUMN org_bank_statement_lines.applied_rule_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_bank_statement_lines.applied_rule_id IS 'Which org_bank_rules row (if any) supplied this line''s coding when coding_source = ''rule''. NULL for manual codings, and set NULL on rule deletion (ON DELETE SET NULL) since the historical coding stays valid even if the rule that produced it is later removed.';


--
-- Name: org_bank_statement_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bank_statement_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bank_statement_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bank_statement_lines_id_seq OWNED BY public.org_bank_statement_lines.id;


--
-- Name: org_bill_credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bill_credit_notes (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    original_bill_id integer,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    amount_cents bigint NOT NULL,
    reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    ledger_transaction_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bill_credit_notes_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_bill_credit_notes_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_bill_credit_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'applied'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_bill_credit_notes FORCE ROW LEVEL SECURITY;


--
-- Name: org_bill_credit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bill_credit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bill_credit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bill_credit_notes_id_seq OWNED BY public.org_bill_credit_notes.id;


--
-- Name: org_bill_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bill_lines (
    id integer NOT NULL,
    bill_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    grant_id integer,
    amount_cents bigint NOT NULL,
    is_1099_reportable boolean,
    line_memo text,
    CONSTRAINT org_bill_lines_amount_cents_check CHECK ((amount_cents > 0))
);

ALTER TABLE ONLY public.org_bill_lines FORCE ROW LEVEL SECURITY;


--
-- Name: org_bill_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bill_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bill_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bill_lines_id_seq OWNED BY public.org_bill_lines.id;


--
-- Name: org_bill_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bill_payments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    bill_id integer NOT NULL,
    bank_account_id integer NOT NULL,
    payment_date date NOT NULL,
    amount_cents bigint NOT NULL,
    reference text,
    status text DEFAULT 'posted'::text NOT NULL,
    ledger_transaction_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bill_payments_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_bill_payments_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_bill_payments_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_bill_payments FORCE ROW LEVEL SECURITY;


--
-- Name: org_bill_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bill_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bill_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bill_payments_id_seq OWNED BY public.org_bill_payments.id;


--
-- Name: org_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bills (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    bill_date date NOT NULL,
    due_date date,
    reference text,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    procurement_rationale text,
    ledger_transaction_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_payment_date date,
    CONSTRAINT org_bills_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_bills_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'scheduled'::text, 'partially_paid'::text, 'paid'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_bills FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_bills.scheduled_payment_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_bills.scheduled_payment_date IS 'Set when status transitions approved -> scheduled via POST .../bills/:id/schedule; cleared on unschedule (back to approved) or on payment. Purely informational/organizational -- no automated job acts on this date.';


--
-- Name: org_bills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bills_id_seq OWNED BY public.org_bills.id;


--
-- Name: org_board_designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_board_designations (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    purpose text,
    board_approved_date date,
    board_resolution_ref text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_board_designations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.org_board_designations FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_board_designations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_board_designations IS 'Board-imposed internal earmarks of net assets without donor restriction (operating reserve, building fund, quasi-endowment). Not a distinct GAAP net-asset class -- ASU 2016-14 requires only a liquidity/appropriation disclosure, not a separate balance-sheet line. No specific account is required to exist; an org tags whichever of its own net-assets-without-restriction accounts it already uses.';


--
-- Name: org_board_designations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_board_designations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_board_designations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_board_designations_id_seq OWNED BY public.org_board_designations.id;


--
-- Name: org_budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_budget_lines (
    id integer NOT NULL,
    org_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    grant_id integer,
    fiscal_year integer NOT NULL,
    month smallint NOT NULL,
    amount_cents bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_id integer,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_ref_id bigint,
    source_ref_type text,
    is_override boolean DEFAULT false NOT NULL,
    override_amount_cents bigint,
    calculated_amount_cents bigint,
    source_updated_at timestamp with time zone,
    CONSTRAINT org_budget_lines_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_budget_lines_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT org_budget_lines_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'personnel'::text, 'insurance'::text, 'schedule'::text, 'grant_allocation'::text, 'indirect_cost'::text, 'prior_year'::text])))
);

ALTER TABLE ONLY public.org_budget_lines FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_budget_lines.org_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.org_id IS 'Denormalized for queries; must match accounts/programs for the same workspace.';


--
-- Name: COLUMN org_budget_lines.amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.amount_cents IS 'Budgeted amount for that month in whole cents.';


--
-- Name: COLUMN org_budget_lines.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.updated_at IS 'Application sets on UPDATE; DEFAULT NOW() on INSERT.';


--
-- Name: COLUMN org_budget_lines.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.source_type IS 'Origin of this line: manual (user-typed), personnel, insurance, schedule, grant_allocation, indirect_cost, prior_year';


--
-- Name: COLUMN org_budget_lines.is_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.is_override IS 'TRUE when user manually typed a value over a calculated line; recalc skips this row';


--
-- Name: COLUMN org_budget_lines.override_amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.override_amount_cents IS 'User-typed override value (stored separately from calculated_amount_cents)';


--
-- Name: COLUMN org_budget_lines.calculated_amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.calculated_amount_cents IS 'Last value pushed by the source calculator; null for manual lines';


--
-- Name: COLUMN org_budget_lines.source_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_lines.source_updated_at IS 'When the source record last changed; used to detect stale calculated values';


--
-- Name: org_budget_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_budget_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_budget_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_budget_lines_id_seq OWNED BY public.org_budget_lines.id;


--
-- Name: org_compliance_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_compliance_obligations (
    id integer NOT NULL,
    org_id integer NOT NULL,
    source public.compliance_source DEFAULT 'base_template'::public.compliance_source NOT NULL,
    template_item_id integer,
    category text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    frequency public.compliance_frequency NOT NULL,
    next_due_date date,
    last_completed_date date,
    status public.compliance_obligation_status DEFAULT 'upcoming'::public.compliance_obligation_status NOT NULL,
    notes_markdown text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_compliance_obligations FORCE ROW LEVEL SECURITY;


--
-- Name: org_compliance_obligations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_compliance_obligations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_compliance_obligations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_compliance_obligations_id_seq OWNED BY public.org_compliance_obligations.id;


--
-- Name: org_constituent_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_constituent_interactions (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    grant_id integer,
    interaction_type character varying(20) DEFAULT 'note'::character varying NOT NULL,
    interaction_date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    recorded_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_constituent_interactions_interaction_type_check CHECK (((interaction_type)::text = ANY ((ARRAY['meeting'::character varying, 'call'::character varying, 'email'::character varying, 'note'::character varying, 'site_visit'::character varying])::text[])))
);

ALTER TABLE ONLY public.org_constituent_interactions FORCE ROW LEVEL SECURITY;


--
-- Name: org_constituent_interactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_constituent_interactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_constituent_interactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_constituent_interactions_id_seq OWNED BY public.org_constituent_interactions.id;


--
-- Name: org_constituents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_constituents (
    id integer NOT NULL,
    org_id integer NOT NULL,
    type character varying(30) DEFAULT 'individual'::character varying NOT NULL,
    display_name text NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone character varying(50),
    mailing_address text,
    website text,
    xero_contact_id text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[],
    is_donor boolean DEFAULT false NOT NULL,
    is_vendor boolean DEFAULT false NOT NULL,
    is_customer boolean DEFAULT false NOT NULL,
    CONSTRAINT org_constituents_type_check CHECK (((type)::text = ANY ((ARRAY['foundation'::character varying, 'individual'::character varying, 'board'::character varying, 'prospect'::character varying, 'member_org'::character varying])::text[])))
);

ALTER TABLE ONLY public.org_constituents FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_constituents.is_donor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_constituents.is_donor IS 'Defaulted true on existing rows at migration time (every prior row was donor-side data); false is the default for new rows going forward -- a new contact is not a donor unless marked one.';


--
-- Name: COLUMN org_constituents.is_vendor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_constituents.is_vendor IS 'Purchases/AP: a bill''s constituent_id must reference a row with is_vendor = true.';


--
-- Name: COLUMN org_constituents.is_customer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_constituents.is_customer IS 'Sales/AR: an invoice''s constituent_id must reference a row with is_customer = true.';


--
-- Name: org_constituents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_constituents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_constituents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_constituents_id_seq OWNED BY public.org_constituents.id;


--
-- Name: org_demo_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_demo_snapshot (
    table_name text NOT NULL,
    row_data jsonb NOT NULL
);


--
-- Name: org_document_expectations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_document_expectations (
    id integer NOT NULL,
    org_id integer,
    category public.org_document_category NOT NULL,
    label text NOT NULL,
    cadence text NOT NULL,
    default_retention_class public.org_document_retention_class DEFAULT 'fixed_term'::public.org_document_retention_class NOT NULL,
    default_retention_years integer,
    guidance_markdown text,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT org_document_expectations_cadence_check CHECK ((cadence = ANY (ARRAY['annual'::text, 'one_time'::text, 'as_occurs'::text])))
);


--
-- Name: org_document_expectations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_document_expectations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_document_expectations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_document_expectations_id_seq OWNED BY public.org_document_expectations.id;


--
-- Name: org_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_documents (
    id integer NOT NULL,
    org_id integer NOT NULL,
    category public.org_document_category NOT NULL,
    title text NOT NULL,
    description text,
    original_filename text NOT NULL,
    stored_path text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    fiscal_year integer,
    document_date date,
    effective_date date,
    expiration_date date,
    retention_class public.org_document_retention_class DEFAULT 'fixed_term'::public.org_document_retention_class NOT NULL,
    retention_years integer,
    retention_until date,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id integer,
    is_current boolean DEFAULT true NOT NULL,
    visibility public.org_document_visibility DEFAULT 'org_all'::public.org_document_visibility NOT NULL,
    grant_id integer,
    obligation_id integer,
    uploaded_by_user_id integer,
    notes text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pod_synced_at timestamp with time zone,
    local_copy_purged_at timestamp with time zone,
    source_ref_id bigint,
    source_ref_type text,
    sponsored_project_id integer,
    CONSTRAINT org_documents_fy_reasonable CHECK (((fiscal_year IS NULL) OR ((fiscal_year >= 1900) AND (fiscal_year <= 2200))))
);

ALTER TABLE ONLY public.org_documents FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_documents.source_ref_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_documents.source_ref_id IS 'Generic attachment target, paired with source_ref_type -- e.g. a Bill or Invoice id. Matches the org_budget_lines/org_schedule_items convention rather than adding another single-purpose FK column like grant_id/obligation_id.';


--
-- Name: COLUMN org_documents.source_ref_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_documents.source_ref_type IS 'Discriminator for source_ref_id, e.g. ''bill'' or ''invoice''. NULL for documents not attached to one of these records.';


--
-- Name: org_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_documents_id_seq OWNED BY public.org_documents.id;


--
-- Name: org_donation_url_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_donation_url_suggestions (
    id integer NOT NULL,
    org_id integer NOT NULL,
    user_id integer NOT NULL,
    suggested_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: org_donation_url_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_donation_url_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_donation_url_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_donation_url_suggestions_id_seq OWNED BY public.org_donation_url_suggestions.id;


--
-- Name: org_expense_claim_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_expense_claim_lines (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    grant_id integer,
    expense_date date NOT NULL,
    description text NOT NULL,
    miles numeric(8,1),
    rate_cents_per_mile integer,
    amount_cents bigint NOT NULL,
    line_memo text,
    CONSTRAINT org_expense_claim_lines_amount_positive CHECK ((amount_cents > 0))
);

ALTER TABLE ONLY public.org_expense_claim_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_expense_claim_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_expense_claim_lines IS 'Line items for an expense claim. Mileage is first-class (miles/rate_cents_per_mile are optional metadata; amount_cents is always the number that actually posts, computed client-side from miles*rate when present).';


--
-- Name: org_expense_claim_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_expense_claim_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_expense_claim_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_expense_claim_lines_id_seq OWNED BY public.org_expense_claim_lines.id;


--
-- Name: org_expense_claim_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_expense_claim_messages (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    author_user_id integer NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_expense_claim_messages FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_expense_claim_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_expense_claim_messages IS 'Per-claim message thread between the claimant and admin/board (e.g. "still looking for the receipt, will upload by Friday"). Visible in-app on the claim; each new message also triggers a best-effort outbound email notification to the other party (see sendExpenseClaimMessageEmail.js) -- outbound only, no inbound-email parsing.';


--
-- Name: org_expense_claim_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_expense_claim_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_expense_claim_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_expense_claim_messages_id_seq OWNED BY public.org_expense_claim_messages.id;


--
-- Name: org_expense_claim_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_expense_claim_payments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    claim_id integer NOT NULL,
    payment_date date NOT NULL,
    amount_cents bigint NOT NULL,
    bank_account_id integer NOT NULL,
    ledger_transaction_id integer NOT NULL,
    status text DEFAULT 'posted'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_expense_claim_payments_amount_positive CHECK ((amount_cents > 0)),
    CONSTRAINT org_expense_claim_payments_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'voided'::text])))
);

ALTER TABLE ONLY public.org_expense_claim_payments FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_expense_claim_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_expense_claim_payments IS 'Payment record for a pre_approval-mode claim (the separate pay-after-approve step). post_payout-mode claims post their payment leg directly as part of submission and do not use this table -- see org_expense_claims.payment_ledger_transaction_id instead.';


--
-- Name: org_expense_claim_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_expense_claim_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_expense_claim_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_expense_claim_payments_id_seq OWNED BY public.org_expense_claim_payments.id;


--
-- Name: org_expense_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_expense_claims (
    id integer NOT NULL,
    org_id integer NOT NULL,
    submitted_by integer NOT NULL,
    claim_date date NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    confirmed_by integer,
    confirmed_at timestamp with time zone,
    disputed_reason text,
    ledger_transaction_id integer,
    payment_ledger_transaction_id integer,
    bank_account_id integer,
    fiscal_year integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    receipt_affidavit_reason text,
    receipt_affidavit_at timestamp with time zone,
    receipt_affidavit_by integer,
    receipt_follow_up_due date,
    receipt_resolved_at timestamp with time zone,
    CONSTRAINT org_expense_claims_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_expense_claims_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'paid_pending_confirmation'::text, 'paid'::text, 'confirmed'::text, 'disputed'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_expense_claims FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_expense_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_expense_claims IS 'Staff/board reimbursement claims. Deliberately separate from org_bills -- submitted_by is the actual claimant (not just an audit field), never touches 1099 tracking, and self-review is blocked unconditionally (not just for federal awards, unlike org_bills own trigger). Two status flows depending on org_settings.expense_claim_approval_mode: pre_approval (draft/pending_approval/approved/paid) or post_payout (draft/paid_pending_confirmation/confirmed or disputed).';


--
-- Name: COLUMN org_expense_claims.receipt_affidavit_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_expense_claims.receipt_affidavit_at IS 'Set when the claimant self-certifies a missing-receipt affidavit (structured, not a freeform note) to submit a claim at/above the org''s receipt threshold without an actual receipt attached. Does not change claim status -- submit is still a separate action.';


--
-- Name: COLUMN org_expense_claims.receipt_resolved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_expense_claims.receipt_resolved_at IS 'Set automatically when a real receipt document is later attached to this claim (see documents.js POST handler), clearing the outstanding-affidavit Attention Feed item.';


--
-- Name: org_expense_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_expense_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_expense_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_expense_claims_id_seq OWNED BY public.org_expense_claims.id;


--
-- Name: org_fiscal_year_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_fiscal_year_locks (
    id integer NOT NULL,
    org_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    locked_at timestamp with time zone,
    locked_by_user_id integer,
    reopened_at timestamp with time zone,
    reopened_by_user_id integer,
    reopen_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_fiscal_year_locks FORCE ROW LEVEL SECURITY;


--
-- Name: org_fiscal_year_locks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_fiscal_year_locks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_fiscal_year_locks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_fiscal_year_locks_id_seq OWNED BY public.org_fiscal_year_locks.id;


--
-- Name: org_fixed_asset_depreciation_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_fixed_asset_depreciation_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    fixed_asset_id integer NOT NULL,
    period_date date NOT NULL,
    amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_fixed_asset_depr_entries_amount_positive CHECK ((amount_cents > 0))
);

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_fixed_asset_depreciation_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_fixed_asset_depreciation_entries IS 'One row per (fixed_asset_id, period_date) that has already been posted -- the unique constraint is what makes Run Depreciation idempotent, not just application-level care.';


--
-- Name: org_fixed_asset_depreciation_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_fixed_asset_depreciation_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_fixed_asset_depreciation_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_fixed_asset_depreciation_entries_id_seq OWNED BY public.org_fixed_asset_depreciation_entries.id;


--
-- Name: org_fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_fixed_assets (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    description text,
    asset_account_id integer NOT NULL,
    accumulated_depreciation_account_id integer NOT NULL,
    depreciation_expense_account_id integer NOT NULL,
    acquisition_date date NOT NULL,
    cost_cents bigint NOT NULL,
    salvage_value_cents bigint DEFAULT 0 NOT NULL,
    useful_life_months integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    disposal_date date,
    disposal_proceeds_cents bigint,
    program_id integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_fixed_assets_cost_positive CHECK ((cost_cents > 0)),
    CONSTRAINT org_fixed_assets_disposal_consistency CHECK (((status = 'disposed'::text) = (disposal_date IS NOT NULL))),
    CONSTRAINT org_fixed_assets_salvage_lt_cost CHECK ((salvage_value_cents < cost_cents)),
    CONSTRAINT org_fixed_assets_salvage_nonneg CHECK ((salvage_value_cents >= 0)),
    CONSTRAINT org_fixed_assets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'fully_depreciated'::text, 'disposed'::text]))),
    CONSTRAINT org_fixed_assets_useful_life_positive CHECK ((useful_life_months > 0))
);

ALTER TABLE ONLY public.org_fixed_assets FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_fixed_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_fixed_assets IS 'Per-asset fixed asset register: cost basis, acquisition date, useful life. Straight-line depreciation only. Feeds Schedule D and org_fixed_asset_depreciation_entries -- replaces the old balance-sheet-snapshot-guessing Schedule D used before this register existed.';


--
-- Name: org_fixed_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_fixed_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_fixed_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_fixed_assets_id_seq OWNED BY public.org_fixed_assets.id;


--
-- Name: org_fringe_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_fringe_settings (
    id integer NOT NULL,
    org_id integer NOT NULL,
    suta_rate_bps integer DEFAULT 270 NOT NULL,
    suta_wage_base_cents integer DEFAULT 700000 NOT NULL,
    workers_comp_rate_bps integer DEFAULT 100 NOT NULL,
    health_ee_monthly_cents integer DEFAULT 0 NOT NULL,
    health_ee_spouse_monthly_cents integer DEFAULT 0 NOT NULL,
    health_ee_family_monthly_cents integer DEFAULT 0 NOT NULL,
    retirement_rate_bps integer DEFAULT 300 NOT NULL,
    dental_vision_monthly_cents integer DEFAULT 0 NOT NULL,
    disability_rate_bps integer DEFAULT 25 NOT NULL,
    other_monthly_cents integer DEFAULT 0 NOT NULL,
    ss_wage_base_cents integer DEFAULT 17610000 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fica_account_id integer,
    suta_account_id integer,
    workers_comp_account_id integer,
    retirement_account_id integer,
    disability_account_id integer,
    health_account_id integer,
    dental_vision_account_id integer,
    other_fringe_account_id integer
);

ALTER TABLE ONLY public.org_fringe_settings FORCE ROW LEVEL SECURITY;


--
-- Name: org_fringe_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_fringe_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_fringe_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_fringe_settings_id_seq OWNED BY public.org_fringe_settings.id;


--
-- Name: org_functional_classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_functional_classifications (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    account_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    program_services_bps integer DEFAULT 0 NOT NULL,
    mgmt_general_bps integer DEFAULT 0 NOT NULL,
    fundraising_bps integer DEFAULT 0 NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT functional_class_bps_sum CHECK ((((program_services_bps + mgmt_general_bps) + fundraising_bps) = 10000)),
    CONSTRAINT functional_class_nonnegative CHECK (((program_services_bps >= 0) AND (mgmt_general_bps >= 0) AND (fundraising_bps >= 0)))
);

ALTER TABLE ONLY public.org_functional_classifications FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_functional_classifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_functional_classifications IS 'FASB ASU 2016-14 functional expense splits per account per year. Feeds 990 Part IX. Values in basis points (10000 = 100%).';


--
-- Name: COLUMN org_functional_classifications.program_services_bps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_functional_classifications.program_services_bps IS 'Portion allocated to program services, in basis points (e.g. 7000 = 70%)';


--
-- Name: COLUMN org_functional_classifications.mgmt_general_bps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_functional_classifications.mgmt_general_bps IS 'Portion allocated to management & general, in basis points';


--
-- Name: COLUMN org_functional_classifications.fundraising_bps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_functional_classifications.fundraising_bps IS 'Portion allocated to fundraising, in basis points';


--
-- Name: org_functional_classifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_functional_classifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_functional_classifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_functional_classifications_id_seq OWNED BY public.org_functional_classifications.id;


--
-- Name: org_gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_gifts (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer,
    grant_id integer,
    soft_credit_constituent_id integer,
    gift_type public.gift_type DEFAULT 'donation'::public.gift_type NOT NULL,
    amount_cents bigint NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method public.gift_payment_method,
    stripe_payment_intent_id text,
    campaign text,
    acknowledgment_sent_at timestamp with time zone,
    receipt_sent_at timestamp with time zone,
    notes text,
    recorded_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sponsored_project_id integer,
    CONSTRAINT org_gifts_amount_cents_check CHECK ((amount_cents >= 0))
);

ALTER TABLE ONLY public.org_gifts FORCE ROW LEVEL SECURITY;


--
-- Name: org_gifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_gifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_gifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_gifts_id_seq OWNED BY public.org_gifts.id;


--
-- Name: org_grant_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_grant_allocations (
    id integer NOT NULL,
    org_id integer NOT NULL,
    grant_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_generated boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.org_grant_allocations FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_grant_allocations.auto_generated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grant_allocations.auto_generated IS 'TRUE when this FY allocation was auto-filled from the grant''s period_start_date/period_end_date + award amount (even split across missing years), rather than entered by a human. Flips FALSE on the first human edit.';


--
-- Name: org_grant_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_grant_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_grant_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_grant_allocations_id_seq OWNED BY public.org_grant_allocations.id;


--
-- Name: org_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_grants (
    id integer NOT NULL,
    org_id integer NOT NULL,
    funder text DEFAULT ''::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    amount_cents bigint,
    start_date date,
    end_date date,
    restrictions text,
    reporting_schedule jsonb,
    status text DEFAULT 'applied'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    grant_code text,
    request_amount_cents bigint,
    grant_type text,
    primary_program_id integer,
    fy_allocations jsonb,
    next_report_due date,
    final_report_submitted date,
    renewal_application_due date,
    allocation_mode character varying(10) DEFAULT 'amount'::character varying NOT NULL,
    revenue_account_id integer,
    constituent_id integer,
    loi_submitted_at date,
    application_submitted_at date,
    award_date date,
    period_start_date date,
    period_end_date date,
    funder_grant_id text,
    extra_data jsonb DEFAULT '{}'::jsonb,
    institution_type text,
    forecast_amount_cents integer,
    donor_restriction_class public.org_restriction_class,
    is_federal_award boolean DEFAULT false NOT NULL,
    federal_awarding_agency text,
    aln text,
    pass_through_entity_name text,
    pass_through_identifying_number text,
    amount_passed_to_subrecipients_cents bigint,
    CONSTRAINT org_grants_allocation_mode_check CHECK (((allocation_mode)::text = ANY ((ARRAY['amount'::character varying, 'percent'::character varying])::text[]))),
    CONSTRAINT org_grants_amount_passed_to_subrecipients_cents_check CHECK (((amount_passed_to_subrecipients_cents IS NULL) OR (amount_passed_to_subrecipients_cents >= 0))),
    CONSTRAINT org_grants_status_lifecycle_chk CHECK ((status = ANY (ARRAY['prospect'::text, 'applied'::text, 'awarded'::text, 'declined'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.org_grants FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_grants.amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.amount_cents IS 'Whole cents; NULL if amount not specified.';


--
-- Name: COLUMN org_grants.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.updated_at IS 'Application sets on UPDATE; DEFAULT NOW() on INSERT (same convention as np_orgs).';


--
-- Name: COLUMN org_grants.grant_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.grant_code IS 'Stable business key from imports; unique per org when set.';


--
-- Name: COLUMN org_grants.fy_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.fy_allocations IS 'JSON map of fiscal year label → amount in dollars from CSV (e.g. {"FY26": 50000}).';


--
-- Name: COLUMN org_grants.loi_submitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.loi_submitted_at IS 'Date letter of intent was submitted to funder';


--
-- Name: COLUMN org_grants.application_submitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.application_submitted_at IS 'Date full application was submitted';


--
-- Name: COLUMN org_grants.award_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.award_date IS 'Date grant was officially awarded';


--
-- Name: COLUMN org_grants.period_start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.period_start_date IS 'Start of grant performance period';


--
-- Name: COLUMN org_grants.period_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.period_end_date IS 'End of grant performance period (used for FY coverage calculation)';


--
-- Name: COLUMN org_grants.donor_restriction_class; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.donor_restriction_class IS 'Net-asset classification for this grant, distinct from the freeform restrictions text column (grant condition notes).';


--
-- Name: COLUMN org_grants.is_federal_award; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.is_federal_award IS 'Per-grant flag, distinct from org_settings.federal_grant_recipient (org-level 990/compliance flag). Drives the real-time approval gate in Ledger V1 Section 5.';


--
-- Name: COLUMN org_grants.aln; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.aln IS 'Assistance Listing Number (formerly CFDA number), format XX.XXX -- required on the SEFA for any is_federal_award grant.';


--
-- Name: COLUMN org_grants.pass_through_entity_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.pass_through_entity_name IS 'Set only when this org received the award AS a subrecipient, i.e. NOT directly from the federal agency -- e.g. a state agency or another nonprofit passed it through. NULL means direct from the federal awarding agency.';


--
-- Name: org_grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_grants_id_seq OWNED BY public.org_grants.id;


--
-- Name: org_import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_import_history (
    id integer NOT NULL,
    org_id integer NOT NULL,
    import_kind text NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    inserted integer DEFAULT 0 NOT NULL,
    updated integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    error_summary text,
    CONSTRAINT org_import_history_import_kind_check CHECK ((import_kind = ANY (ARRAY['coa'::text, 'programs'::text, 'grants'::text, 'budget_lines'::text, 'actuals'::text, 'balance_sheet'::text, 'bank_statement'::text])))
);

ALTER TABLE ONLY public.org_import_history FORCE ROW LEVEL SECURITY;


--
-- Name: org_import_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_import_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_import_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_import_history_id_seq OWNED BY public.org_import_history.id;


--
-- Name: org_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invites (
    id integer NOT NULL,
    org_id integer NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    role public.org_member_role DEFAULT 'staff'::public.org_member_role NOT NULL,
    invited_by integer,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_invites FORCE ROW LEVEL SECURITY;


--
-- Name: org_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_invites_id_seq OWNED BY public.org_invites.id;


--
-- Name: org_invoice_credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invoice_credit_notes (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    original_invoice_id integer,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    amount_cents bigint NOT NULL,
    reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    ledger_transaction_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_invoice_credit_notes_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_invoice_credit_notes_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_invoice_credit_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'applied'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_invoice_credit_notes FORCE ROW LEVEL SECURITY;


--
-- Name: org_invoice_credit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_invoice_credit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_invoice_credit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_invoice_credit_notes_id_seq OWNED BY public.org_invoice_credit_notes.id;


--
-- Name: org_invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invoice_lines (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    description text,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_amount_cents bigint NOT NULL,
    fair_market_value_cents bigint,
    line_memo text,
    CONSTRAINT org_invoice_lines_check CHECK (((fair_market_value_cents IS NULL) OR ((fair_market_value_cents >= 0) AND (fair_market_value_cents <= unit_amount_cents)))),
    CONSTRAINT org_invoice_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT org_invoice_lines_unit_amount_cents_check CHECK ((unit_amount_cents > 0))
);

ALTER TABLE ONLY public.org_invoice_lines FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_invoice_lines.fair_market_value_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_invoice_lines.fair_market_value_cents IS 'Set only for quid-pro-quo lines (spec 4.3): the exchange/earned-revenue portion of unit_amount_cents. NULL means the whole line is a straight exchange sale, posted to account_id in full. When set, the remainder (unit_amount_cents - fair_market_value_cents) posts to the org''s contribution-revenue account instead -- two ledger lines from one invoice line.';


--
-- Name: org_invoice_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_invoice_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_invoice_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_invoice_lines_id_seq OWNED BY public.org_invoice_lines.id;


--
-- Name: org_invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invoice_payments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    invoice_id integer NOT NULL,
    bank_account_id integer NOT NULL,
    payment_date date NOT NULL,
    amount_cents bigint NOT NULL,
    reference text,
    status text DEFAULT 'posted'::text NOT NULL,
    ledger_transaction_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_invoice_payments_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_invoice_payments_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_invoice_payments_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_invoice_payments FORCE ROW LEVEL SECURITY;


--
-- Name: org_invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_invoice_payments_id_seq OWNED BY public.org_invoice_payments.id;


--
-- Name: org_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invoices (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    reference text,
    status text DEFAULT 'draft'::text NOT NULL,
    ledger_transaction_id integer,
    membership_payment_id integer,
    fiscal_year integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_invoices_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text, 'void'::text, 'written_off'::text])))
);

ALTER TABLE ONLY public.org_invoices FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_invoices.membership_payment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_invoices.membership_payment_id IS 'Optional hook so an invoice can reference an org_membership_payments row instead of duplicating it (spec 4.6) -- not populated by any route yet, reserved for the Membership-integration UI work.';


--
-- Name: org_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_invoices_id_seq OWNED BY public.org_invoices.id;


--
-- Name: org_ledger_approval_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ledger_approval_policies (
    org_id integer NOT NULL,
    reviewer_role text,
    review_cadence text,
    description text,
    flagged_amount_threshold_cents bigint DEFAULT 500000 NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_ledger_approval_policies_threshold_non_negative CHECK ((flagged_amount_threshold_cents >= 0))
);

ALTER TABLE ONLY public.org_ledger_approval_policies FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_ledger_approval_policies.flagged_amount_threshold_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_approval_policies.flagged_amount_threshold_cents IS 'Default $5,000 -- an org-configurable starting point for the flagged-transaction review package, not a hard rule.';


--
-- Name: org_ledger_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ledger_lines (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    grant_id integer,
    donor_restriction_class public.org_restriction_class,
    debit_cents bigint DEFAULT 0 NOT NULL,
    credit_cents bigint DEFAULT 0 NOT NULL,
    line_memo text,
    board_designation_id integer,
    CONSTRAINT org_ledger_lines_amounts_non_negative CHECK (((debit_cents >= 0) AND (credit_cents >= 0))),
    CONSTRAINT org_ledger_lines_exactly_one_side CHECK (((debit_cents > 0) <> (credit_cents > 0)))
);

ALTER TABLE ONLY public.org_ledger_lines FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_ledger_lines.board_designation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_lines.board_designation_id IS 'Tags a line as part of a "designate" or "release" transfer for a specific board designation, same pattern as grant_id for donor-restricted funds. A designation''s balance is SUM(credit_cents - debit_cents) over lines carrying its id.';


--
-- Name: org_ledger_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_ledger_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_ledger_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_ledger_lines_id_seq OWNED BY public.org_ledger_lines.id;


--
-- Name: org_ledger_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ledger_transactions (
    id integer NOT NULL,
    org_id integer NOT NULL,
    transaction_date date NOT NULL,
    fiscal_year integer NOT NULL,
    memo text,
    payee text,
    reference_number text,
    status text DEFAULT 'posted'::text NOT NULL,
    voided_at timestamp with time zone,
    voided_by integer,
    void_reason text,
    reverses_transaction_id integer,
    source text DEFAULT 'manual'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    source_ref_id bigint,
    source_ref_type text,
    CONSTRAINT org_ledger_transactions_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_ledger_transactions_no_self_reverse CHECK ((reverses_transaction_id IS DISTINCT FROM id)),
    CONSTRAINT org_ledger_transactions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text]))),
    CONSTRAINT org_ledger_transactions_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'voided'::text, 'pending_approval'::text]))),
    CONSTRAINT org_ledger_transactions_voided_consistency CHECK (((status = 'voided'::text) = (voided_at IS NOT NULL)))
);

ALTER TABLE ONLY public.org_ledger_transactions FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_ledger_transactions.approved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.approved_by IS 'Set only for transactions that required the federal-award approval gate (a line tagged to an org_grants.is_federal_award=true grant). NULL for every ordinary transaction -- V1 has no blocking approval workflow otherwise.';


--
-- Name: COLUMN org_ledger_transactions.source_ref_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.source_ref_id IS 'Set only when this transaction was posted on behalf of another record (e.g. a Bill at Approval) rather than entered directly. Paired with source_ref_type.';


--
-- Name: COLUMN org_ledger_transactions.source_ref_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.source_ref_type IS 'Discriminator for source_ref_id, e.g. ''bill''. NULL for ordinary manual/bank_reconciliation transactions.';


--
-- Name: org_ledger_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_ledger_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_ledger_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_ledger_transactions_id_seq OWNED BY public.org_ledger_transactions.id;


--
-- Name: org_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_members (
    id integer NOT NULL,
    org_id integer NOT NULL,
    tier_id integer,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    mailing_address text,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    status public.membership_status DEFAULT 'pending_first_payment'::public.membership_status NOT NULL,
    notes text,
    cooperative_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_members FORCE ROW LEVEL SECURITY;


--
-- Name: org_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_members_id_seq OWNED BY public.org_members.id;


--
-- Name: org_membership_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_payments (
    id integer NOT NULL,
    member_id integer NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    period_covered_start timestamp with time zone NOT NULL,
    period_covered_end timestamp with time zone NOT NULL,
    payment_method character varying(100),
    notes text,
    recorded_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_payments_amount_cents_check CHECK ((amount_cents >= 0))
);

ALTER TABLE ONLY public.org_membership_payments FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_payments_id_seq OWNED BY public.org_membership_payments.id;


--
-- Name: org_membership_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_reminders (
    id integer NOT NULL,
    member_id integer NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_type public.reminder_type NOT NULL,
    delivery_method character varying(50) DEFAULT 'email'::character varying NOT NULL,
    delivered boolean DEFAULT false NOT NULL,
    notes text
);

ALTER TABLE ONLY public.org_membership_reminders FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_reminders_id_seq OWNED BY public.org_membership_reminders.id;


--
-- Name: org_membership_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_tiers (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    dues_amount_cents integer NOT NULL,
    dues_currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    renewal_period public.renewal_period DEFAULT 'annual'::public.renewal_period NOT NULL,
    benefits_markdown text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_tiers_dues_amount_cents_check CHECK ((dues_amount_cents >= 0))
);

ALTER TABLE ONLY public.org_membership_tiers FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_tiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_tiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_tiers_id_seq OWNED BY public.org_membership_tiers.id;


--
-- Name: org_personnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_personnel (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    worker_type text DEFAULT 'employee'::text NOT NULL,
    full_name text NOT NULL,
    title text,
    salary_account_id integer,
    annual_salary_cents bigint,
    fte_bps integer,
    start_month integer,
    end_month integer,
    health_tier text,
    use_custom_fringe boolean DEFAULT false NOT NULL,
    custom_suta_rate_bps integer,
    custom_workers_comp_rate_bps integer,
    custom_retirement_rate_bps integer,
    custom_dental_vision_monthly_cents integer,
    custom_disability_rate_bps integer,
    custom_other_monthly_cents integer,
    contractor_account_id integer,
    monthly_fee_cents bigint,
    notes text,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employment_type text DEFAULT 'full-time'::text,
    contract_type text DEFAULT 'hourly'::text,
    payroll_id text,
    department_code text,
    flsa_status text DEFAULT 'exempt'::text,
    auto_generated boolean DEFAULT false NOT NULL,
    CONSTRAINT org_personnel_contract_type_check CHECK ((contract_type = ANY (ARRAY['hourly'::text, 'monthly'::text, 'annual'::text, 'project'::text, 'ongoing'::text]))),
    CONSTRAINT org_personnel_employment_type_check CHECK ((employment_type = ANY (ARRAY['full-time'::text, 'part-time'::text, 'hourly'::text, 'contract'::text, 'seasonal'::text]))),
    CONSTRAINT org_personnel_end_month_check CHECK (((end_month >= 1) AND (end_month <= 12))),
    CONSTRAINT org_personnel_flsa_status_check CHECK ((flsa_status = ANY (ARRAY['exempt'::text, 'non-exempt'::text, 'hourly-non-exempt'::text]))),
    CONSTRAINT org_personnel_health_tier_check CHECK ((health_tier = ANY (ARRAY['employee'::text, 'spouse'::text, 'family'::text, 'none'::text, NULL::text]))),
    CONSTRAINT org_personnel_start_month_check CHECK (((start_month >= 1) AND (start_month <= 12))),
    CONSTRAINT org_personnel_worker_type_check CHECK ((worker_type = ANY (ARRAY['employee'::text, 'contractor'::text])))
);

ALTER TABLE ONLY public.org_personnel FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_personnel.auto_generated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_personnel.auto_generated IS 'TRUE when this fiscal_year''s row was auto-carried-forward from an ongoing position in fiscal_year-1 (same salary/FTE, no raise applied), rather than entered by a human.';


--
-- Name: org_personnel_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_personnel_allocations (
    id bigint NOT NULL,
    coop_personnel_id bigint NOT NULL,
    org_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    percent_bps integer NOT NULL,
    CONSTRAINT org_personnel_allocations_percent_bps_check CHECK (((percent_bps > 0) AND (percent_bps <= 10000)))
);

ALTER TABLE ONLY public.org_personnel_allocations FORCE ROW LEVEL SECURITY;


--
-- Name: org_personnel_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_personnel_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_personnel_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_personnel_allocations_id_seq OWNED BY public.org_personnel_allocations.id;


--
-- Name: org_personnel_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_personnel_changes (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    coop_personnel_id bigint,
    user_id integer,
    action text NOT NULL,
    field_name text,
    old_value text,
    new_value text,
    memo text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_personnel_changes_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])))
);

ALTER TABLE ONLY public.org_personnel_changes FORCE ROW LEVEL SECURITY;


--
-- Name: org_personnel_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_personnel_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_personnel_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_personnel_changes_id_seq OWNED BY public.org_personnel_changes.id;


--
-- Name: org_personnel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_personnel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_personnel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_personnel_id_seq OWNED BY public.org_personnel.id;


--
-- Name: org_plaid_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_plaid_accounts (
    id integer NOT NULL,
    org_id integer NOT NULL,
    plaid_item_id integer NOT NULL,
    plaid_account_id text NOT NULL,
    org_account_id integer NOT NULL,
    plaid_account_name text,
    plaid_account_mask text,
    current_balance_cents bigint,
    available_balance_cents bigint,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_plaid_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: org_plaid_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_plaid_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_plaid_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_plaid_accounts_id_seq OWNED BY public.org_plaid_accounts.id;


--
-- Name: org_plaid_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_plaid_items (
    id integer NOT NULL,
    org_id integer NOT NULL,
    item_id text NOT NULL,
    access_token text NOT NULL,
    institution_id text,
    institution_name text,
    status text DEFAULT 'active'::text NOT NULL,
    error_message text,
    cursor text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_plaid_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'error'::text, 'revoked'::text])))
);

ALTER TABLE ONLY public.org_plaid_items FORCE ROW LEVEL SECURITY;


--
-- Name: org_plaid_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_plaid_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_plaid_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_plaid_items_id_seq OWNED BY public.org_plaid_items.id;


--
-- Name: org_pod_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_pod_credentials (
    org_id integer NOT NULL,
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_pod_credentials FORCE ROW LEVEL SECURITY;


--
-- Name: org_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_programs (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    parent_id integer,
    is_default boolean DEFAULT false NOT NULL,
    fiscal_year_start_mmdd text,
    fiscal_year_end_mmdd text,
    program_manager text,
    program_kind text,
    is_system_transfer_program boolean DEFAULT false NOT NULL,
    CONSTRAINT org_programs_default_only_top_level CHECK (((NOT is_default) OR (parent_id IS NULL))),
    CONSTRAINT org_programs_no_self_parent CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT org_programs_program_kind_check CHECK (((program_kind IS NULL) OR (program_kind = ANY (ARRAY['program'::text, 'activity'::text]))))
);

ALTER TABLE ONLY public.org_programs FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_programs.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_programs.updated_at IS 'Application sets on UPDATE; DEFAULT NOW() on INSERT.';


--
-- Name: COLUMN org_programs.program_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_programs.program_kind IS 'program = top-level; activity = child of a program (matches CSV type).';


--
-- Name: COLUMN org_programs.is_system_transfer_program; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_programs.is_system_transfer_program IS 'Marks the org''s single system-managed "Internal Transfers" program, lazily created by org_get_or_create_internal_transfer_program on first use of the Transfer tab. Same pattern as is_system_ap_account/is_system_ar_account/is_system_clearing_account.';


--
-- Name: org_programs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_programs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_programs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_programs_id_seq OWNED BY public.org_programs.id;


--
-- Name: org_projections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_projections (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    coop_account_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    period_month integer,
    amount_cents bigint DEFAULT 0 NOT NULL,
    formula text,
    notes text,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_projections_period_month_chk CHECK (((period_month IS NULL) OR ((period_month >= 1) AND (period_month <= 12))))
);

ALTER TABLE ONLY public.org_projections FORCE ROW LEVEL SECURITY;


--
-- Name: org_projections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_projections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_projections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_projections_id_seq OWNED BY public.org_projections.id;


--
-- Name: org_recurring_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_recurring_schedules (
    id integer NOT NULL,
    org_id integer NOT NULL,
    schedule_type text NOT NULL,
    frequency text NOT NULL,
    active_months smallint[],
    next_occurrence_date date NOT NULL,
    end_date date,
    template jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_recurring_schedules_custom_months_needs_array CHECK (((frequency <> 'custom_months'::text) OR (active_months IS NOT NULL))),
    CONSTRAINT org_recurring_schedules_frequency_check CHECK ((frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'annual'::text, 'custom_months'::text]))),
    CONSTRAINT org_recurring_schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['bill'::text, 'invoice'::text])))
);

ALTER TABLE ONLY public.org_recurring_schedules FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_recurring_schedules.end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_recurring_schedules.end_date IS 'Nullable -- no fixed end is a valid state (e.g. rent). Spans fiscal-year boundaries without issue, unlike Budget''s schedules.';


--
-- Name: COLUMN org_recurring_schedules.template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_recurring_schedules.template IS 'The bill/invoice shape to generate each occurrence: constituent_id, lines (account/program/grant/amount), reference. Not a foreign key to a real bill/invoice -- interpreted by the generator at occurrence time.';


--
-- Name: org_recurring_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_recurring_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_recurring_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_recurring_schedules_id_seq OWNED BY public.org_recurring_schedules.id;


--
-- Name: org_schedule_item_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_schedule_item_allocations (
    id bigint NOT NULL,
    coop_schedule_item_id bigint NOT NULL,
    org_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    percent_bps integer NOT NULL,
    CONSTRAINT org_schedule_item_allocations_percent_bps_check CHECK (((percent_bps > 0) AND (percent_bps <= 10000)))
);

ALTER TABLE ONLY public.org_schedule_item_allocations FORCE ROW LEVEL SECURITY;


--
-- Name: org_schedule_item_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_schedule_item_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_schedule_item_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_schedule_item_allocations_id_seq OWNED BY public.org_schedule_item_allocations.id;


--
-- Name: org_schedule_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_schedule_items (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    account_id integer,
    program_id integer,
    grant_id integer,
    fiscal_year integer NOT NULL,
    label text NOT NULL,
    schedule_type text DEFAULT 'custom'::text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_amount_cents bigint DEFAULT 0 NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    active_months smallint[],
    start_month smallint DEFAULT 1 NOT NULL,
    end_month smallint DEFAULT 12 NOT NULL,
    source_ref_id bigint,
    source_ref_type text,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    named_schedule_id bigint,
    policy_start_date date,
    policy_end_date date,
    origin_item_id integer,
    auto_generated boolean DEFAULT false NOT NULL,
    CONSTRAINT org_schedule_items_frequency_check CHECK ((frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'annual'::text, 'one_time'::text, 'custom_months'::text]))),
    CONSTRAINT org_schedule_items_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['personnel'::text, 'insurance'::text, 'stipend'::text, 'grant_milestone'::text, 'indirect_cost'::text, 'custom'::text])))
);

ALTER TABLE ONLY public.org_schedule_items FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_schedule_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_schedule_items IS 'Sub-rows within named budget schedules. Each item computes monthly spread → coop_budget_lines on save.';


--
-- Name: COLUMN org_schedule_items.frequency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.frequency IS 'monthly=every month in range, quarterly=months 1/4/7/10 of range, annual=one payment, one_time=single month, custom_months=use active_months array';


--
-- Name: COLUMN org_schedule_items.active_months; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.active_months IS 'Month numbers (1–12) when this item is active. Required when frequency=custom_months.';


--
-- Name: COLUMN org_schedule_items.named_schedule_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.named_schedule_id IS 'Parent named schedule (Other Schedules tab grouping). NULL = ungrouped or insurance item.';


--
-- Name: COLUMN org_schedule_items.policy_start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.policy_start_date IS 'Insurance: actual policy start date. When set, recalc uses day-accurate proration instead of start_month/end_month.';


--
-- Name: COLUMN org_schedule_items.policy_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.policy_end_date IS 'Insurance: actual policy end date for day-accurate proration.';


--
-- Name: COLUMN org_schedule_items.origin_item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.origin_item_id IS 'Set when this row was auto-spawned into fiscal_year+1 (or beyond) from an insurance policy whose policy_end_date crosses the FY boundary; points back to the item that spawned it.';


--
-- Name: COLUMN org_schedule_items.auto_generated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.auto_generated IS 'TRUE until a human edits this row directly; the carryforward engine only ever creates/updates/deletes rows still TRUE here, never one a human has claimed.';


--
-- Name: org_schedule_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_schedule_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_schedule_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_schedule_items_id_seq OWNED BY public.org_schedule_items.id;


--
-- Name: org_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_schedules (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    name text NOT NULL,
    schedule_type text DEFAULT 'custom'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['event'::text, 'custom'::text, 'depreciation'::text, 'amortization'::text]))),
    CONSTRAINT org_schedules_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'locked'::text, 'reconciled'::text, 'audit_ready'::text])))
);

ALTER TABLE ONLY public.org_schedules FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_schedules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_schedules IS 'User-named schedule groups for the Other Schedules tab. Items FK here via named_schedule_id.';


--
-- Name: COLUMN org_schedules.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedules.status IS 'Lifecycle: draft → active → locked (months closed) → reconciled (vs GL) → audit_ready';


--
-- Name: org_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_schedules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_schedules_id_seq OWNED BY public.org_schedules.id;


--
-- Name: org_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_settings (
    org_id integer NOT NULL,
    ein text,
    fiscal_year_end_month smallint,
    xero_tenant_id text,
    xero_token_data jsonb,
    org_profile_data jsonb,
    fiscal_sponsorship_mode boolean DEFAULT false NOT NULL,
    sponsorship_model public.sponsorship_model_enum,
    default_admin_rate numeric(5,2),
    entity_classification text,
    federal_grant_recipient boolean DEFAULT false NOT NULL,
    state_charitable_solicitation_registrations text[],
    has_lobbying_activity boolean DEFAULT false NOT NULL,
    has_political_electoral_activity boolean DEFAULT false NOT NULL,
    membership_enabled boolean DEFAULT false NOT NULL,
    reply_to_email text,
    onboarding_step text DEFAULT 'basics'::text NOT NULL,
    onboarding_completed_at timestamp with time zone,
    onboarding_target_fiscal_year smallint,
    onboarding_conversion_date date,
    onboarding_has_prior_data boolean,
    onboarding_blank_coa_chosen boolean DEFAULT false NOT NULL,
    ai_summary_text text,
    ai_summary_generated_at timestamp with time zone,
    ai_summary_fiscal_year smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pod_provisioned boolean DEFAULT false NOT NULL,
    pod_provisioned_at timestamp with time zone,
    pod_provisioning_error text,
    pod_last_synced_at timestamp with time zone,
    actuals_source text DEFAULT 'xero'::text NOT NULL,
    expense_claim_approval_mode text DEFAULT 'pre_approval'::text NOT NULL,
    expense_claim_receipt_required_threshold_cents integer DEFAULT 0 NOT NULL,
    session_timeout_minutes smallint,
    CONSTRAINT org_settings_actuals_source_check CHECK ((actuals_source = ANY (ARRAY['xero'::text, 'ledger'::text]))),
    CONSTRAINT org_settings_default_admin_rate_check CHECK (((default_admin_rate >= (0)::numeric) AND (default_admin_rate <= (100)::numeric))),
    CONSTRAINT org_settings_expense_claim_approval_mode_check CHECK ((expense_claim_approval_mode = ANY (ARRAY['pre_approval'::text, 'post_payout'::text]))),
    CONSTRAINT org_settings_fiscal_year_end_month_check CHECK (((fiscal_year_end_month >= 1) AND (fiscal_year_end_month <= 12))),
    CONSTRAINT org_settings_onboarding_step_check CHECK ((onboarding_step = ANY (ARRAY['basics'::text, 'accounts'::text, 'prior_data'::text, 'programs'::text, 'complete'::text]))),
    CONSTRAINT org_settings_session_timeout_minutes_check CHECK (((session_timeout_minutes IS NULL) OR (session_timeout_minutes = ANY (ARRAY[15, 30, 60, 120, 240, 480]))))
);

ALTER TABLE ONLY public.org_settings FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_settings.org_profile_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.org_profile_data IS 'Was coop_members.cooperative_profile; relocated because nothing coop-network-facing reads it (runway_months/cash_balance_cents for the org''s own board report, plus mission/program_areas/region/website profile fields the org edits about itself).';


--
-- Name: COLUMN org_settings.ai_summary_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.ai_summary_text IS 'Last generated nonprofit finance summary for executives; refreshed at most daily by GET /summary.';


--
-- Name: COLUMN org_settings.ai_summary_generated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.ai_summary_generated_at IS 'When ai_summary_text was produced; application uses 24h TTL unless ?refresh=1.';


--
-- Name: COLUMN org_settings.actuals_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.actuals_source IS 'Which writer is authoritative for this org''s org_actuals rows. Reporting never blends both for the same org/period; only the matching writer may post org_actuals rows for that org.';


--
-- Name: COLUMN org_settings.expense_claim_approval_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.expense_claim_approval_mode IS 'pre_approval (default, stronger): a non-submitter must approve before payment posts. post_payout: submission posts payment immediately and a non-submitter confirms afterward -- for small orgs where pre-payment board approval is impractically slow. The self-review rule (approver/confirmer != submitter) is enforced at the DB trigger level in both modes.';


--
-- Name: COLUMN org_settings.expense_claim_receipt_required_threshold_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_settings.expense_claim_receipt_required_threshold_cents IS 'Claims with a total below this amount can submit without a receipt or affidavit. Defaults to 0 (today''s strict behavior: always require one) -- deliberately not defaulted to the IRS federal $75 floor, since state law varies and this is the org''s/bookkeeper''s call, not a platform default.';


--
-- Name: org_sponsored_project_disbursements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsored_project_disbursements (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    disbursement_date date NOT NULL,
    amount_cents bigint NOT NULL,
    admin_fee_cents bigint,
    notes text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    CONSTRAINT org_sponsored_project_disbursements_admin_fee_cents_check CHECK (((admin_fee_cents IS NULL) OR (admin_fee_cents >= 0))),
    CONSTRAINT org_sponsored_project_disbursements_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_sponsored_project_disbursements_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_sponsored_project_disbursements FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_sponsored_project_disbursements.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_sponsored_project_disbursements.status IS 'pending_approval (default, on create) -> approved (via a distinct /approve action) or void. Only approved disbursements count toward tracking totals -- a pending one is not yet real money out the door for reporting purposes.';


--
-- Name: org_sponsored_project_disbursements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsored_project_disbursements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsored_project_disbursements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsored_project_disbursements_id_seq OWNED BY public.org_sponsored_project_disbursements.id;


--
-- Name: org_sponsored_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsored_projects (
    id integer NOT NULL,
    sponsor_org_id integer NOT NULL,
    name text NOT NULL,
    description text,
    start_date date,
    end_date date,
    contact_lead_name text,
    contact_lead_email text,
    annual_budget_estimate numeric(12,2),
    status text DEFAULT 'active'::text NOT NULL,
    notes_markdown text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sponsorship_model text,
    program_id integer,
    admin_rate numeric(5,2),
    next_report_due date,
    last_report_received_at date,
    CONSTRAINT org_sponsored_projects_sponsorship_model_check CHECK (((sponsorship_model IS NULL) OR (sponsorship_model = ANY (ARRAY['model_a'::text, 'model_c'::text, 'other'::text])))),
    CONSTRAINT org_sponsored_projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'winding_down'::text])))
);

ALTER TABLE ONLY public.org_sponsored_projects FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_sponsored_projects.next_report_due; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_sponsored_projects.next_report_due IS 'When the sponsee''s next expenditure report is due -- the accountability half of IRC 4945(h), distinct from the money-tracking in org_sponsored_project_disbursements. Surfaced in the Needs Attention feed alongside grant/membership/document deadlines.';


--
-- Name: org_sponsored_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsored_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsored_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsored_projects_id_seq OWNED BY public.org_sponsored_projects.id;


--
-- Name: org_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_suggestions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    org_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ein text,
    propublica_verified boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    website_url text
);


--
-- Name: org_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_suggestions_id_seq OWNED BY public.org_suggestions.id;


--
-- Name: org_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_tasks (
    id integer NOT NULL,
    org_id integer NOT NULL,
    title text NOT NULL,
    body text,
    task_type text DEFAULT 'manual'::text NOT NULL,
    source_table text,
    source_id integer,
    status public.org_task_status DEFAULT 'open'::public.org_task_status NOT NULL,
    priority smallint DEFAULT 2 NOT NULL,
    assigned_to integer,
    assigned_by integer,
    assigned_at timestamp with time zone,
    due_date date,
    completed_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_tasks IS 'Executive dashboard / action queue; manual and system-generated items with optional assignee.';


--
-- Name: org_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_tasks_id_seq OWNED BY public.org_tasks.id;


--
-- Name: org_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_users (
    id integer NOT NULL,
    org_id integer NOT NULL,
    user_id integer NOT NULL,
    role public.org_member_role DEFAULT 'staff'::public.org_member_role NOT NULL,
    invited_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_dashboard_visit_at timestamp with time zone
);

ALTER TABLE ONLY public.org_users FORCE ROW LEVEL SECURITY;


--
-- Name: org_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_users_id_seq OWNED BY public.org_users.id;


--
-- Name: org_vendor_compliance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_vendor_compliance (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    tax_id_encrypted text,
    tin_type text,
    tax_entity_type text,
    is_1099_eligible boolean DEFAULT false NOT NULL,
    w9_received boolean DEFAULT false NOT NULL,
    w9_received_at timestamp with time zone,
    payment_terms text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_id_iv text,
    tax_id_auth_tag text,
    CONSTRAINT org_vendor_compliance_tin_type_check CHECK (((tin_type IS NULL) OR (tin_type = ANY (ARRAY['ein'::text, 'ssn'::text]))))
);

ALTER TABLE ONLY public.org_vendor_compliance FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_vendor_compliance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_vendor_compliance IS 'Sensitive vendor compliance data (tax ID, W-9 status), split from org_constituents so donor-facing consumers of that table never see it. Access gated admin-only at the route layer.';


--
-- Name: COLUMN org_vendor_compliance.tax_id_encrypted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_vendor_compliance.tax_id_encrypted IS 'AES-256-GCM ciphertext (base64), see server/organizational/lib/vendorTaxIdCrypto.js. Paired with tax_id_iv/tax_id_auth_tag. Uses its own key (VENDOR_TAX_ID_ENCRYPTION_KEY), not the Pod-credential key, so the two blast radii and rotation schedules stay independent.';


--
-- Name: org_vendor_compliance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_vendor_compliance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_vendor_compliance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_vendor_compliance_id_seq OWNED BY public.org_vendor_compliance.id;


--
-- Name: org_xero_program_track_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_xero_program_track_map (
    id integer NOT NULL,
    org_id integer NOT NULL,
    xero_tracking_category_id text NOT NULL,
    xero_tracking_option_id text NOT NULL,
    coop_program_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'activity'::text NOT NULL,
    CONSTRAINT org_xero_program_track_map_dimension_check CHECK ((dimension = ANY (ARRAY['program'::text, 'activity'::text])))
);

ALTER TABLE ONLY public.org_xero_program_track_map FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_xero_program_track_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_xero_program_track_map IS 'Maps a Xero tracking option (within a category) to an np_programs row for actuals import.';


--
-- Name: org_xero_program_track_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_xero_program_track_map_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_xero_program_track_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_xero_program_track_map_id_seq OWNED BY public.org_xero_program_track_map.id;


--
-- Name: orgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orgs (
    id integer NOT NULL,
    name text NOT NULL,
    category text,
    inbound_email text,
    subscription_status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    region text,
    causal_address text,
    added_by_user_id integer,
    validated_via text,
    ein text,
    primary_region text[] DEFAULT '{}'::text[] NOT NULL,
    sender_domains text[] DEFAULT '{}'::text[] NOT NULL,
    website_url text,
    propublica_verified boolean DEFAULT false NOT NULL,
    everyorg_slug text,
    website text,
    donation_url character varying(500),
    change_nonprofit_id text,
    activity_summary_text text,
    activity_summary_generated_at timestamp with time zone
);


--
-- Name: COLUMN orgs.region; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orgs.region IS 'Optional: US, EU, global, or NULL. Used to prioritize or filter actions by user location.';


--
-- Name: COLUMN orgs.validated_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orgs.validated_via IS 'propublica, admin, or null.';


--
-- Name: COLUMN orgs.ein; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orgs.ein IS 'IRS EIN from ProPublica when validated_via = propublica.';


--
-- Name: COLUMN orgs.sender_domains; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orgs.sender_domains IS 'Lowercase hostnames from From: addresses (e.g. aclu.org, mail.350.org). Subdomains match if they end with .<domain> for any listed domain.';


--
-- Name: orgs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orgs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orgs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orgs_id_seq OWNED BY public.orgs.id;


--
-- Name: page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_views (
    id integer NOT NULL,
    user_id integer NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: page_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.page_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: page_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.page_views_id_seq OWNED BY public.page_views.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: pending_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_confirmations (
    id integer NOT NULL,
    user_id integer,
    org_name text,
    confirmation_url text NOT NULL,
    email_subject text,
    created_at timestamp with time zone DEFAULT now(),
    confirmed_at timestamp with time zone
);


--
-- Name: pending_confirmations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pending_confirmations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pending_confirmations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pending_confirmations_id_seq OWNED BY public.pending_confirmations.id;


--
-- Name: pod_access_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_access_group_members (
    id integer NOT NULL,
    org_id integer NOT NULL,
    group_id integer NOT NULL,
    member_label text NOT NULL,
    member_webid text NOT NULL,
    member_profile_url text,
    added_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.pod_access_group_members FORCE ROW LEVEL SECURITY;


--
-- Name: pod_access_group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_access_group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_access_group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_access_group_members_id_seq OWNED BY public.pod_access_group_members.id;


--
-- Name: pod_access_group_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_access_group_rules (
    id integer NOT NULL,
    org_id integer NOT NULL,
    category public.org_document_category,
    group_id integer NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    org_document_id integer,
    CONSTRAINT pod_access_group_rules_target_check CHECK (((category IS NOT NULL) <> (org_document_id IS NOT NULL)))
);

ALTER TABLE ONLY public.pod_access_group_rules FORCE ROW LEVEL SECURITY;


--
-- Name: pod_access_group_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_access_group_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_access_group_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_access_group_rules_id_seq OWNED BY public.pod_access_group_rules.id;


--
-- Name: pod_access_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_access_groups (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.pod_access_groups FORCE ROW LEVEL SECURITY;


--
-- Name: pod_access_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_access_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_access_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_access_groups_id_seq OWNED BY public.pod_access_groups.id;


--
-- Name: pod_access_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_access_permissions (
    id integer NOT NULL,
    org_id integer NOT NULL,
    org_document_id integer,
    resource_url text NOT NULL,
    recipient_label text NOT NULL,
    recipient_webid text,
    recipient_profile_url text,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_reason text,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id integer,
    is_container boolean DEFAULT false NOT NULL,
    can_write boolean DEFAULT false NOT NULL,
    share_resource_url text,
    CONSTRAINT pod_access_permissions_container_shape_check CHECK (((is_container AND (org_document_id IS NULL)) OR ((NOT is_container) AND (org_document_id IS NOT NULL)))),
    CONSTRAINT pod_access_permissions_recipient_shape_check CHECK (((recipient_webid IS NOT NULL) <> (share_resource_url IS NOT NULL))),
    CONSTRAINT pod_access_permissions_revoked_reason_check CHECK ((revoked_reason = ANY (ARRAY['manual'::text, 'expired'::text, 'group_removed'::text])))
);

ALTER TABLE ONLY public.pod_access_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: pod_access_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_access_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_access_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_access_permissions_id_seq OWNED BY public.pod_access_permissions.id;


--
-- Name: pod_acr_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_acr_outbox (
    id integer NOT NULL,
    org_id integer NOT NULL,
    resource_url text NOT NULL,
    reason text NOT NULL,
    recipient_webid text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    done_at timestamp with time zone,
    CONSTRAINT pod_acr_outbox_reason_check CHECK ((reason = ANY (ARRAY['permission'::text, 'revoke'::text, 'delete_share'::text]))),
    CONSTRAINT pod_acr_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.pod_acr_outbox FORCE ROW LEVEL SECURITY;


--
-- Name: pod_acr_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_acr_outbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_acr_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_acr_outbox_id_seq OWNED BY public.pod_acr_outbox.id;


--
-- Name: representatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.representatives (
    id integer NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    level text NOT NULL,
    jurisdiction text,
    country text DEFAULT 'US'::text NOT NULL,
    source text,
    source_id text,
    user_contributed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    party text,
    photo_url text,
    bioguide_id text,
    website text,
    office_name text,
    phone text,
    committees text[],
    personal_website text,
    contact_form text,
    leadership_role text
);


--
-- Name: representatives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.representatives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: representatives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.representatives_id_seq OWNED BY public.representatives.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    user_id integer,
    token character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: transactional_forwards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactional_forwards (
    id integer NOT NULL,
    causal_address text NOT NULL,
    real_address text NOT NULL,
    subject text,
    from_email text,
    match_reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: transactional_forwards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactional_forwards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactional_forwards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactional_forwards_id_seq OWNED BY public.transactional_forwards.id;


--
-- Name: user_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_actions (
    id integer NOT NULL,
    user_id integer,
    action_id integer,
    received_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    clicked_at timestamp with time zone,
    opened_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    seeded boolean DEFAULT false
);


--
-- Name: user_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_actions_id_seq OWNED BY public.user_actions.id;


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_addresses (
    id integer NOT NULL,
    user_id integer,
    address text NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_addresses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_addresses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_addresses_id_seq OWNED BY public.user_addresses.id;


--
-- Name: user_contributed_orgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_contributed_orgs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    org_name text NOT NULL,
    ein text,
    propublica_verified boolean DEFAULT false NOT NULL,
    city text,
    state text,
    ntee_code text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    website_url text
);


--
-- Name: user_contributed_orgs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_contributed_orgs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_contributed_orgs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_contributed_orgs_id_seq OWNED BY public.user_contributed_orgs.id;


--
-- Name: user_inbound_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_inbound_emails (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action_id integer,
    message_id text,
    received_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    from_address text,
    from_name text,
    to_address text,
    subject text,
    preview text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_inbound_emails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_inbound_emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_inbound_emails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_inbound_emails_id_seq OWNED BY public.user_inbound_emails.id;


--
-- Name: user_org_petition_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_org_petition_signatures (
    id integer NOT NULL,
    user_id integer NOT NULL,
    org_id integer NOT NULL,
    causal_address_used text NOT NULL,
    petition_url text,
    signed_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_org_petition_signatures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_org_petition_signatures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_org_petition_signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_org_petition_signatures_id_seq OWNED BY public.user_org_petition_signatures.id;


--
-- Name: user_org_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_org_preferences (
    id integer NOT NULL,
    user_id integer,
    org_id integer,
    subscribed_at timestamp with time zone DEFAULT now(),
    followed boolean DEFAULT true NOT NULL
);


--
-- Name: user_org_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_org_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_org_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_org_preferences_id_seq OWNED BY public.user_org_preferences.id;


--
-- Name: user_org_setup_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_org_setup_presets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    source_org_id integer,
    accounts_snapshot jsonb NOT NULL,
    programs_snapshot jsonb,
    fiscal_year_end_month smallint,
    account_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_org_setup_presets_name_len CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))
);


--
-- Name: TABLE user_org_setup_presets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_org_setup_presets IS 'A user''s saved chart-of-accounts/program setup, reusable across orgs they create — the "I''ve done this before" path in the Accounts onboarding step.';


--
-- Name: COLUMN user_org_setup_presets.accounts_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_org_setup_presets.accounts_snapshot IS 'Array of account rows in the same shape POST /accounts/bulk accepts; replayed verbatim into a new org, never mutated in place.';


--
-- Name: COLUMN user_org_setup_presets.programs_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_org_setup_presets.programs_snapshot IS 'Optional array of {name, code} program rows captured at save time, applied after accounts_snapshot on apply-preset.';


--
-- Name: user_org_setup_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_org_setup_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_org_setup_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_org_setup_presets_id_seq OWNED BY public.user_org_setup_presets.id;


--
-- Name: user_rep_contact_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_rep_contact_actions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    rep_id integer NOT NULL,
    action_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    contacted_at timestamp with time zone,
    dismissed_at timestamp with time zone
);


--
-- Name: user_rep_contact_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_rep_contact_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_rep_contact_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_rep_contact_actions_id_seq OWNED BY public.user_rep_contact_actions.id;


--
-- Name: user_representatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_representatives (
    id integer NOT NULL,
    user_id integer,
    rep_id integer,
    matched_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_representatives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_representatives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_representatives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_representatives_id_seq OWNED BY public.user_representatives.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    forwarding_address character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    onboarded boolean DEFAULT false,
    brokerage text,
    bank text,
    turnaround_priorities text[],
    action_type_prefs text[],
    digest_frequency text DEFAULT 'off'::text,
    digest_last_sent_at timestamp with time zone,
    user_type text DEFAULT 'individual_basic'::text,
    causal_address text,
    primary_region text[] DEFAULT '{}'::text[] NOT NULL,
    donation_split jsonb DEFAULT '[]'::jsonb,
    password_hash text,
    location_country character varying(2),
    location_zip character varying(20),
    invest_tickers jsonb DEFAULT '[]'::jsonb,
    coop_access boolean DEFAULT false NOT NULL,
    is_cooperative_admin boolean DEFAULT false NOT NULL,
    location_city character varying(100),
    fund_holdings_flag boolean,
    bank_payoff_seen_at timestamp with time zone,
    visited_financial_at timestamp with time zone,
    last_visit_at timestamp with time zone,
    onboarding_step text DEFAULT 'bank'::text NOT NULL,
    onboarding_completed_at timestamp with time zone,
    first_login_at timestamp with time zone,
    is_platform_admin boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN users.coop_access; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.coop_access IS 'When true, user may access /np/ and /api/np/* with the same session as civic. Managed from /admin.';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: volunteer_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_opportunities (
    id integer NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    location text,
    description text,
    submitted_by_user_id integer NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kind text DEFAULT 'volunteer'::text NOT NULL,
    CONSTRAINT volunteer_opportunities_kind_check CHECK ((kind = ANY (ARRAY['volunteer'::text, 'local_action'::text])))
);


--
-- Name: volunteer_opportunities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.volunteer_opportunities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: volunteer_opportunities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.volunteer_opportunities_id_seq OWNED BY public.volunteer_opportunities.id;


--
-- Name: watch_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watch_contributions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    official_name text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: watch_contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.watch_contributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: watch_contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.watch_contributions_id_seq OWNED BY public.watch_contributions.id;


--
-- Name: workshop_civic_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_civic_links (
    id integer NOT NULL,
    space_id integer NOT NULL,
    linked_entity_type text NOT NULL,
    linked_entity_id integer NOT NULL,
    link_description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workshop_civic_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_civic_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_civic_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_civic_links_id_seq OWNED BY public.workshop_civic_links.id;


--
-- Name: workshop_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_documents (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_by_user_id integer,
    updated_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    previous_version_id integer,
    e4a_turnarounds text[],
    doc_type text DEFAULT 'note'::text NOT NULL,
    CONSTRAINT workshop_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['note'::text, 'systems_map_loop'::text, 'systems_map_cascade'::text])))
);


--
-- Name: workshop_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_documents_id_seq OWNED BY public.workshop_documents.id;


--
-- Name: workshop_interventions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_interventions (
    id integer NOT NULL,
    workshop_project_id integer NOT NULL,
    target_action_id integer,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    leverage_level integer NOT NULL,
    turnaround_ids text[],
    effect_estimate text DEFAULT ''::text NOT NULL,
    proposed_by_member_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workshop_interventions_leverage_level_check CHECK (((leverage_level >= 1) AND (leverage_level <= 12)))
);


--
-- Name: workshop_interventions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_interventions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_interventions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_interventions_id_seq OWNED BY public.workshop_interventions.id;


--
-- Name: workshop_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_messages (
    id integer NOT NULL,
    thread_id integer NOT NULL,
    content text NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    display_email text
);


--
-- Name: workshop_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_messages_id_seq OWNED BY public.workshop_messages.id;


--
-- Name: workshop_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_projects (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    phase text DEFAULT 'research'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    e4a_turnarounds text[],
    is_starter boolean DEFAULT false NOT NULL,
    CONSTRAINT workshop_projects_phase_check CHECK ((phase = ANY (ARRAY['research'::text, 'synthesis'::text, 'implementation'::text, 'graduation'::text])))
);


--
-- Name: workshop_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_projects_id_seq OWNED BY public.workshop_projects.id;


--
-- Name: workshop_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_proposals (
    id integer NOT NULL,
    space_id integer NOT NULL,
    title text NOT NULL,
    body_markdown text NOT NULL,
    proposed_by_user_id integer NOT NULL,
    status public.proposal_status DEFAULT 'draft'::public.proposal_status NOT NULL,
    decision_notes_markdown text,
    decided_at timestamp with time zone,
    decided_by_user_id integer,
    superseded_by_proposal_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workshop_proposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_proposals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_proposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_proposals_id_seq OWNED BY public.workshop_proposals.id;


--
-- Name: workshop_space_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_space_members (
    id integer NOT NULL,
    space_id integer NOT NULL,
    user_id integer NOT NULL,
    org_id integer,
    role public.workshop_space_role DEFAULT 'participant'::public.workshop_space_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    display_email text
);


--
-- Name: workshop_space_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_space_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_space_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_space_members_id_seq OWNED BY public.workshop_space_members.id;


--
-- Name: workshop_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_threads (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    title text NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workshop_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_threads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_threads_id_seq OWNED BY public.workshop_threads.id;


--
-- Name: workshop_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workshop_workspaces (
    id integer NOT NULL,
    project_id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    space_type public.workshop_space_type DEFAULT 'org_internal'::public.workshop_space_type NOT NULL,
    e4a_turnarounds text[],
    access_scope public.workshop_access_scope DEFAULT 'members_only'::public.workshop_access_scope NOT NULL
);


--
-- Name: workshop_workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workshop_workspaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workshop_workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workshop_workspaces_id_seq OWNED BY public.workshop_workspaces.id;


--
-- Name: actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions ALTER COLUMN id SET DEFAULT nextval('public.actions_id_seq'::regclass);


--
-- Name: bank_pledges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pledges ALTER COLUMN id SET DEFAULT nextval('public.bank_pledges_id_seq'::regclass);


--
-- Name: bank_pressure_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pressure_actions ALTER COLUMN id SET DEFAULT nextval('public.bank_pressure_actions_id_seq'::regclass);


--
-- Name: compliance_extension_proposals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_extension_proposals ALTER COLUMN id SET DEFAULT nextval('public.compliance_extension_proposals_id_seq'::regclass);


--
-- Name: compliance_template_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_template_items ALTER COLUMN id SET DEFAULT nextval('public.compliance_template_items_id_seq'::regclass);


--
-- Name: contributions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributions ALTER COLUMN id SET DEFAULT nextval('public.contributions_id_seq'::regclass);


--
-- Name: coop_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members ALTER COLUMN id SET DEFAULT nextval('public.coop_members_id_seq'::regclass);


--
-- Name: cooperative_library_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_items ALTER COLUMN id SET DEFAULT nextval('public.cooperative_library_items_id_seq'::regclass);


--
-- Name: cooperative_library_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions ALTER COLUMN id SET DEFAULT nextval('public.cooperative_library_submissions_id_seq'::regclass);


--
-- Name: cooperative_work_library_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_library_items ALTER COLUMN id SET DEFAULT nextval('public.cooperative_work_library_items_id_seq'::regclass);


--
-- Name: cooperative_work_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_requests ALTER COLUMN id SET DEFAULT nextval('public.cooperative_work_requests_id_seq'::regclass);


--
-- Name: financial_rep_pledges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_rep_pledges ALTER COLUMN id SET DEFAULT nextval('public.financial_rep_pledges_id_seq'::regclass);


--
-- Name: inbound_debug_emails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_debug_emails ALTER COLUMN id SET DEFAULT nextval('public.inbound_debug_emails_id_seq'::regclass);


--
-- Name: local_event_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_event_attendance ALTER COLUMN id SET DEFAULT nextval('public.local_event_attendance_id_seq'::regclass);


--
-- Name: org_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts ALTER COLUMN id SET DEFAULT nextval('public.org_accounts_id_seq'::regclass);


--
-- Name: org_actuals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals ALTER COLUMN id SET DEFAULT nextval('public.org_actuals_id_seq'::regclass);


--
-- Name: org_aliases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_aliases ALTER COLUMN id SET DEFAULT nextval('public.org_aliases_id_seq'::regclass);


--
-- Name: org_allocation_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines ALTER COLUMN id SET DEFAULT nextval('public.org_allocation_lines_id_seq'::regclass);


--
-- Name: org_allocation_monthly id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_monthly ALTER COLUMN id SET DEFAULT nextval('public.org_allocation_monthly_id_seq'::regclass);


--
-- Name: org_allocation_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules ALTER COLUMN id SET DEFAULT nextval('public.org_allocation_schedules_id_seq'::regclass);


--
-- Name: org_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_audit_log ALTER COLUMN id SET DEFAULT nextval('public.org_audit_log_id_seq'::regclass);


--
-- Name: org_balance_sheet_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_balance_sheet_snapshots ALTER COLUMN id SET DEFAULT nextval('public.org_balance_sheet_snapshots_id_seq'::regclass);


--
-- Name: org_bank_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules ALTER COLUMN id SET DEFAULT nextval('public.org_bank_rules_id_seq'::regclass);


--
-- Name: org_bank_statement_line_postings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_line_postings ALTER COLUMN id SET DEFAULT nextval('public.org_bank_statement_line_postings_id_seq'::regclass);


--
-- Name: org_bank_statement_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines ALTER COLUMN id SET DEFAULT nextval('public.org_bank_statement_lines_id_seq'::regclass);


--
-- Name: org_bill_credit_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes ALTER COLUMN id SET DEFAULT nextval('public.org_bill_credit_notes_id_seq'::regclass);


--
-- Name: org_bill_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines ALTER COLUMN id SET DEFAULT nextval('public.org_bill_lines_id_seq'::regclass);


--
-- Name: org_bill_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments ALTER COLUMN id SET DEFAULT nextval('public.org_bill_payments_id_seq'::regclass);


--
-- Name: org_bills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bills ALTER COLUMN id SET DEFAULT nextval('public.org_bills_id_seq'::regclass);


--
-- Name: org_board_designations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_board_designations ALTER COLUMN id SET DEFAULT nextval('public.org_board_designations_id_seq'::regclass);


--
-- Name: org_budget_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines ALTER COLUMN id SET DEFAULT nextval('public.org_budget_lines_id_seq'::regclass);


--
-- Name: org_compliance_obligations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_compliance_obligations ALTER COLUMN id SET DEFAULT nextval('public.org_compliance_obligations_id_seq'::regclass);


--
-- Name: org_constituent_interactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions ALTER COLUMN id SET DEFAULT nextval('public.org_constituent_interactions_id_seq'::regclass);


--
-- Name: org_constituents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituents ALTER COLUMN id SET DEFAULT nextval('public.org_constituents_id_seq'::regclass);


--
-- Name: org_document_expectations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations ALTER COLUMN id SET DEFAULT nextval('public.org_document_expectations_id_seq'::regclass);


--
-- Name: org_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents ALTER COLUMN id SET DEFAULT nextval('public.org_documents_id_seq'::regclass);


--
-- Name: org_donation_url_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_donation_url_suggestions ALTER COLUMN id SET DEFAULT nextval('public.org_donation_url_suggestions_id_seq'::regclass);


--
-- Name: org_expense_claim_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claim_lines_id_seq'::regclass);


--
-- Name: org_expense_claim_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_messages ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claim_messages_id_seq'::regclass);


--
-- Name: org_expense_claim_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claim_payments_id_seq'::regclass);


--
-- Name: org_expense_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claims_id_seq'::regclass);


--
-- Name: org_fiscal_year_locks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks ALTER COLUMN id SET DEFAULT nextval('public.org_fiscal_year_locks_id_seq'::regclass);


--
-- Name: org_fixed_asset_depreciation_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries ALTER COLUMN id SET DEFAULT nextval('public.org_fixed_asset_depreciation_entries_id_seq'::regclass);


--
-- Name: org_fixed_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets ALTER COLUMN id SET DEFAULT nextval('public.org_fixed_assets_id_seq'::regclass);


--
-- Name: org_fringe_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings ALTER COLUMN id SET DEFAULT nextval('public.org_fringe_settings_id_seq'::regclass);


--
-- Name: org_functional_classifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_functional_classifications ALTER COLUMN id SET DEFAULT nextval('public.org_functional_classifications_id_seq'::regclass);


--
-- Name: org_gifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts ALTER COLUMN id SET DEFAULT nextval('public.org_gifts_id_seq'::regclass);


--
-- Name: org_grant_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations ALTER COLUMN id SET DEFAULT nextval('public.org_grant_allocations_id_seq'::regclass);


--
-- Name: org_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants ALTER COLUMN id SET DEFAULT nextval('public.org_grants_id_seq'::regclass);


--
-- Name: org_import_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_import_history ALTER COLUMN id SET DEFAULT nextval('public.org_import_history_id_seq'::regclass);


--
-- Name: org_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites ALTER COLUMN id SET DEFAULT nextval('public.org_invites_id_seq'::regclass);


--
-- Name: org_invoice_credit_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes ALTER COLUMN id SET DEFAULT nextval('public.org_invoice_credit_notes_id_seq'::regclass);


--
-- Name: org_invoice_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_lines ALTER COLUMN id SET DEFAULT nextval('public.org_invoice_lines_id_seq'::regclass);


--
-- Name: org_invoice_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.org_invoice_payments_id_seq'::regclass);


--
-- Name: org_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices ALTER COLUMN id SET DEFAULT nextval('public.org_invoices_id_seq'::regclass);


--
-- Name: org_ledger_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines ALTER COLUMN id SET DEFAULT nextval('public.org_ledger_lines_id_seq'::regclass);


--
-- Name: org_ledger_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions ALTER COLUMN id SET DEFAULT nextval('public.org_ledger_transactions_id_seq'::regclass);


--
-- Name: org_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members ALTER COLUMN id SET DEFAULT nextval('public.org_members_id_seq'::regclass);


--
-- Name: org_membership_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments ALTER COLUMN id SET DEFAULT nextval('public.org_membership_payments_id_seq'::regclass);


--
-- Name: org_membership_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_reminders ALTER COLUMN id SET DEFAULT nextval('public.org_membership_reminders_id_seq'::regclass);


--
-- Name: org_membership_tiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers ALTER COLUMN id SET DEFAULT nextval('public.org_membership_tiers_id_seq'::regclass);


--
-- Name: org_personnel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel ALTER COLUMN id SET DEFAULT nextval('public.org_personnel_id_seq'::regclass);


--
-- Name: org_personnel_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations ALTER COLUMN id SET DEFAULT nextval('public.org_personnel_allocations_id_seq'::regclass);


--
-- Name: org_personnel_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_changes ALTER COLUMN id SET DEFAULT nextval('public.org_personnel_changes_id_seq'::regclass);


--
-- Name: org_plaid_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts ALTER COLUMN id SET DEFAULT nextval('public.org_plaid_accounts_id_seq'::regclass);


--
-- Name: org_plaid_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_items ALTER COLUMN id SET DEFAULT nextval('public.org_plaid_items_id_seq'::regclass);


--
-- Name: org_programs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_programs ALTER COLUMN id SET DEFAULT nextval('public.org_programs_id_seq'::regclass);


--
-- Name: org_projections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections ALTER COLUMN id SET DEFAULT nextval('public.org_projections_id_seq'::regclass);


--
-- Name: org_recurring_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_recurring_schedules ALTER COLUMN id SET DEFAULT nextval('public.org_recurring_schedules_id_seq'::regclass);


--
-- Name: org_schedule_item_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations ALTER COLUMN id SET DEFAULT nextval('public.org_schedule_item_allocations_id_seq'::regclass);


--
-- Name: org_schedule_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items ALTER COLUMN id SET DEFAULT nextval('public.org_schedule_items_id_seq'::regclass);


--
-- Name: org_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedules ALTER COLUMN id SET DEFAULT nextval('public.org_schedules_id_seq'::regclass);


--
-- Name: org_sponsored_project_disbursements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements ALTER COLUMN id SET DEFAULT nextval('public.org_sponsored_project_disbursements_id_seq'::regclass);


--
-- Name: org_sponsored_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects ALTER COLUMN id SET DEFAULT nextval('public.org_sponsored_projects_id_seq'::regclass);


--
-- Name: org_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_suggestions ALTER COLUMN id SET DEFAULT nextval('public.org_suggestions_id_seq'::regclass);


--
-- Name: org_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_tasks ALTER COLUMN id SET DEFAULT nextval('public.org_tasks_id_seq'::regclass);


--
-- Name: org_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users ALTER COLUMN id SET DEFAULT nextval('public.org_users_id_seq'::regclass);


--
-- Name: org_vendor_compliance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_vendor_compliance ALTER COLUMN id SET DEFAULT nextval('public.org_vendor_compliance_id_seq'::regclass);


--
-- Name: org_xero_program_track_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_xero_program_track_map ALTER COLUMN id SET DEFAULT nextval('public.org_xero_program_track_map_id_seq'::regclass);


--
-- Name: orgs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs ALTER COLUMN id SET DEFAULT nextval('public.orgs_id_seq'::regclass);


--
-- Name: page_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views ALTER COLUMN id SET DEFAULT nextval('public.page_views_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: pending_confirmations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_confirmations ALTER COLUMN id SET DEFAULT nextval('public.pending_confirmations_id_seq'::regclass);


--
-- Name: pod_access_group_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members ALTER COLUMN id SET DEFAULT nextval('public.pod_access_group_members_id_seq'::regclass);


--
-- Name: pod_access_group_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules ALTER COLUMN id SET DEFAULT nextval('public.pod_access_group_rules_id_seq'::regclass);


--
-- Name: pod_access_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_groups ALTER COLUMN id SET DEFAULT nextval('public.pod_access_groups_id_seq'::regclass);


--
-- Name: pod_access_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions ALTER COLUMN id SET DEFAULT nextval('public.pod_access_permissions_id_seq'::regclass);


--
-- Name: pod_acr_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_acr_outbox ALTER COLUMN id SET DEFAULT nextval('public.pod_acr_outbox_id_seq'::regclass);


--
-- Name: representatives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representatives ALTER COLUMN id SET DEFAULT nextval('public.representatives_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: transactional_forwards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_forwards ALTER COLUMN id SET DEFAULT nextval('public.transactional_forwards_id_seq'::regclass);


--
-- Name: user_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_actions ALTER COLUMN id SET DEFAULT nextval('public.user_actions_id_seq'::regclass);


--
-- Name: user_addresses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses ALTER COLUMN id SET DEFAULT nextval('public.user_addresses_id_seq'::regclass);


--
-- Name: user_contributed_orgs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contributed_orgs ALTER COLUMN id SET DEFAULT nextval('public.user_contributed_orgs_id_seq'::regclass);


--
-- Name: user_inbound_emails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inbound_emails ALTER COLUMN id SET DEFAULT nextval('public.user_inbound_emails_id_seq'::regclass);


--
-- Name: user_org_petition_signatures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_petition_signatures ALTER COLUMN id SET DEFAULT nextval('public.user_org_petition_signatures_id_seq'::regclass);


--
-- Name: user_org_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_org_preferences_id_seq'::regclass);


--
-- Name: user_org_setup_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_setup_presets ALTER COLUMN id SET DEFAULT nextval('public.user_org_setup_presets_id_seq'::regclass);


--
-- Name: user_rep_contact_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions ALTER COLUMN id SET DEFAULT nextval('public.user_rep_contact_actions_id_seq'::regclass);


--
-- Name: user_representatives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_representatives ALTER COLUMN id SET DEFAULT nextval('public.user_representatives_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: volunteer_opportunities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_opportunities ALTER COLUMN id SET DEFAULT nextval('public.volunteer_opportunities_id_seq'::regclass);


--
-- Name: watch_contributions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_contributions ALTER COLUMN id SET DEFAULT nextval('public.watch_contributions_id_seq'::regclass);


--
-- Name: workshop_civic_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_civic_links ALTER COLUMN id SET DEFAULT nextval('public.workshop_civic_links_id_seq'::regclass);


--
-- Name: workshop_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents ALTER COLUMN id SET DEFAULT nextval('public.workshop_documents_id_seq'::regclass);


--
-- Name: workshop_interventions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_interventions ALTER COLUMN id SET DEFAULT nextval('public.workshop_interventions_id_seq'::regclass);


--
-- Name: workshop_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_messages ALTER COLUMN id SET DEFAULT nextval('public.workshop_messages_id_seq'::regclass);


--
-- Name: workshop_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_projects ALTER COLUMN id SET DEFAULT nextval('public.workshop_projects_id_seq'::regclass);


--
-- Name: workshop_proposals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals ALTER COLUMN id SET DEFAULT nextval('public.workshop_proposals_id_seq'::regclass);


--
-- Name: workshop_space_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members ALTER COLUMN id SET DEFAULT nextval('public.workshop_space_members_id_seq'::regclass);


--
-- Name: workshop_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_threads ALTER COLUMN id SET DEFAULT nextval('public.workshop_threads_id_seq'::regclass);


--
-- Name: workshop_workspaces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_workspaces ALTER COLUMN id SET DEFAULT nextval('public.workshop_workspaces_id_seq'::regclass);


--
-- Name: actions actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (id);


--
-- Name: allowed_emails allowed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_emails
    ADD CONSTRAINT allowed_emails_pkey PRIMARY KEY (email);


--
-- Name: bank_pledges bank_pledges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pledges
    ADD CONSTRAINT bank_pledges_pkey PRIMARY KEY (id);


--
-- Name: bank_pledges bank_pledges_user_id_institution_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pledges
    ADD CONSTRAINT bank_pledges_user_id_institution_name_key UNIQUE (user_id, institution_name);


--
-- Name: bank_pressure_actions bank_pressure_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pressure_actions
    ADD CONSTRAINT bank_pressure_actions_pkey PRIMARY KEY (id);


--
-- Name: bank_pressure_actions bank_pressure_actions_user_inst_action_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pressure_actions
    ADD CONSTRAINT bank_pressure_actions_user_inst_action_uq UNIQUE (user_id, institution_name, action_type);


--
-- Name: causal_service_credentials causal_service_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.causal_service_credentials
    ADD CONSTRAINT causal_service_credentials_pkey PRIMARY KEY (id);


--
-- Name: compliance_extension_proposals compliance_extension_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_extension_proposals
    ADD CONSTRAINT compliance_extension_proposals_pkey PRIMARY KEY (id);


--
-- Name: compliance_template_items compliance_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_template_items
    ADD CONSTRAINT compliance_template_items_pkey PRIMARY KEY (id);


--
-- Name: contributions contributions_everyorg_charge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_everyorg_charge_id_key UNIQUE (everyorg_charge_id);


--
-- Name: contributions contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_pkey PRIMARY KEY (id);


--
-- Name: coop_members coop_members_causal_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members
    ADD CONSTRAINT coop_members_causal_org_id_key UNIQUE (causal_org_id);


--
-- Name: coop_members coop_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members
    ADD CONSTRAINT coop_members_pkey PRIMARY KEY (id);


--
-- Name: coop_members coop_members_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members
    ADD CONSTRAINT coop_members_slug_key UNIQUE (slug);


--
-- Name: coop_pod_credentials coop_pod_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_pod_credentials
    ADD CONSTRAINT coop_pod_credentials_pkey PRIMARY KEY (id);


--
-- Name: cooperative_library_items cooperative_library_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_items
    ADD CONSTRAINT cooperative_library_items_pkey PRIMARY KEY (id);


--
-- Name: cooperative_library_submissions cooperative_library_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions
    ADD CONSTRAINT cooperative_library_submissions_pkey PRIMARY KEY (id);


--
-- Name: cooperative_work_library_items cooperative_work_library_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_library_items
    ADD CONSTRAINT cooperative_work_library_items_pkey PRIMARY KEY (id);


--
-- Name: cooperative_work_requests cooperative_work_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_requests
    ADD CONSTRAINT cooperative_work_requests_pkey PRIMARY KEY (id);


--
-- Name: financial_rep_pledges financial_rep_pledges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_rep_pledges
    ADD CONSTRAINT financial_rep_pledges_pkey PRIMARY KEY (id);


--
-- Name: financial_rep_pledges financial_rep_pledges_user_id_institution_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_rep_pledges
    ADD CONSTRAINT financial_rep_pledges_user_id_institution_key_key UNIQUE (user_id, institution_key);


--
-- Name: inbound_debug_emails inbound_debug_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_debug_emails
    ADD CONSTRAINT inbound_debug_emails_pkey PRIMARY KEY (id);


--
-- Name: local_event_attendance local_event_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_event_attendance
    ADD CONSTRAINT local_event_attendance_pkey PRIMARY KEY (id);


--
-- Name: local_event_attendance local_event_attendance_user_id_source_event_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_event_attendance
    ADD CONSTRAINT local_event_attendance_user_id_source_event_key_key UNIQUE (user_id, source, event_key);


--
-- Name: org_accounts org_accounts_coop_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts
    ADD CONSTRAINT org_accounts_coop_org_id_code_key UNIQUE (org_id, code);


--
-- Name: org_accounts org_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts
    ADD CONSTRAINT org_accounts_pkey PRIMARY KEY (id);


--
-- Name: org_actuals org_actuals_coop_org_id_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_coop_org_id_dedupe_key_key UNIQUE (org_id, dedupe_key);


--
-- Name: org_actuals org_actuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_pkey PRIMARY KEY (id);


--
-- Name: org_aliases org_aliases_alias_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_aliases
    ADD CONSTRAINT org_aliases_alias_key_key UNIQUE (alias_key);


--
-- Name: org_aliases org_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_aliases
    ADD CONSTRAINT org_aliases_pkey PRIMARY KEY (id);


--
-- Name: org_allocation_lines org_allocation_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines
    ADD CONSTRAINT org_allocation_lines_pkey PRIMARY KEY (id);


--
-- Name: org_allocation_lines org_allocation_lines_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines
    ADD CONSTRAINT org_allocation_lines_unique UNIQUE (coop_allocation_schedule_id, coop_program_id, coop_account_id);


--
-- Name: org_allocation_monthly org_allocation_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_monthly
    ADD CONSTRAINT org_allocation_monthly_pkey PRIMARY KEY (id);


--
-- Name: org_allocation_monthly org_allocation_monthly_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_monthly
    ADD CONSTRAINT org_allocation_monthly_unique UNIQUE (coop_allocation_schedule_id, period_month);


--
-- Name: org_allocation_schedules org_allocation_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules
    ADD CONSTRAINT org_allocation_schedules_pkey PRIMARY KEY (id);


--
-- Name: org_audit_log org_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_audit_log
    ADD CONSTRAINT org_audit_log_pkey PRIMARY KEY (id);


--
-- Name: org_balance_sheet_snapshots org_balance_sheet_snapshots_coop_org_id_as_of_date_coop_accoun; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_balance_sheet_snapshots
    ADD CONSTRAINT org_balance_sheet_snapshots_coop_org_id_as_of_date_coop_accoun UNIQUE (org_id, as_of_date, coop_account_id);


--
-- Name: org_balance_sheet_snapshots org_balance_sheet_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_balance_sheet_snapshots
    ADD CONSTRAINT org_balance_sheet_snapshots_pkey PRIMARY KEY (id);


--
-- Name: org_bank_rules org_bank_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_pkey PRIMARY KEY (id);


--
-- Name: org_bank_statement_line_postings org_bank_statement_line_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_line_postings
    ADD CONSTRAINT org_bank_statement_line_postings_pkey PRIMARY KEY (id);


--
-- Name: org_bank_statement_lines org_bank_statement_lines_org_fingerprint_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_org_fingerprint_unique UNIQUE (org_id, import_fingerprint);


--
-- Name: org_bank_statement_lines org_bank_statement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_pkey PRIMARY KEY (id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_pkey PRIMARY KEY (id);


--
-- Name: org_bill_lines org_bill_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines
    ADD CONSTRAINT org_bill_lines_pkey PRIMARY KEY (id);


--
-- Name: org_bill_payments org_bill_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments
    ADD CONSTRAINT org_bill_payments_pkey PRIMARY KEY (id);


--
-- Name: org_bills org_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bills
    ADD CONSTRAINT org_bills_pkey PRIMARY KEY (id);


--
-- Name: org_board_designations org_board_designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_board_designations
    ADD CONSTRAINT org_board_designations_pkey PRIMARY KEY (id);


--
-- Name: org_budget_lines org_budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_pkey PRIMARY KEY (id);


--
-- Name: org_compliance_obligations org_compliance_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_compliance_obligations
    ADD CONSTRAINT org_compliance_obligations_pkey PRIMARY KEY (id);


--
-- Name: org_constituent_interactions org_constituent_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions
    ADD CONSTRAINT org_constituent_interactions_pkey PRIMARY KEY (id);


--
-- Name: org_constituents org_constituents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituents
    ADD CONSTRAINT org_constituents_pkey PRIMARY KEY (id);


--
-- Name: org_document_expectations org_document_expectations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations
    ADD CONSTRAINT org_document_expectations_pkey PRIMARY KEY (id);


--
-- Name: org_documents org_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_pkey PRIMARY KEY (id);


--
-- Name: org_donation_url_suggestions org_donation_url_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_donation_url_suggestions
    ADD CONSTRAINT org_donation_url_suggestions_pkey PRIMARY KEY (id);


--
-- Name: org_expense_claim_lines org_expense_claim_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_pkey PRIMARY KEY (id);


--
-- Name: org_expense_claim_messages org_expense_claim_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_messages
    ADD CONSTRAINT org_expense_claim_messages_pkey PRIMARY KEY (id);


--
-- Name: org_expense_claim_payments org_expense_claim_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_pkey PRIMARY KEY (id);


--
-- Name: org_expense_claims org_expense_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_pkey PRIMARY KEY (id);


--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_org_id_fiscal_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks
    ADD CONSTRAINT org_fiscal_year_locks_org_id_fiscal_year_key UNIQUE (org_id, fiscal_year);


--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks
    ADD CONSTRAINT org_fiscal_year_locks_pkey PRIMARY KEY (id);


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depr_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_unique UNIQUE (fixed_asset_id, period_date);


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depreciation_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depreciation_entries_pkey PRIMARY KEY (id);


--
-- Name: org_fixed_assets org_fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: org_fringe_settings org_fringe_settings_org_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_org_uq UNIQUE (org_id);


--
-- Name: org_fringe_settings org_fringe_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_pkey PRIMARY KEY (id);


--
-- Name: org_functional_classifications org_functional_classific_coop_org_id_account_id_fiscal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_functional_classifications
    ADD CONSTRAINT org_functional_classific_coop_org_id_account_id_fiscal_key UNIQUE (org_id, account_id, fiscal_year);


--
-- Name: org_functional_classifications org_functional_classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_functional_classifications
    ADD CONSTRAINT org_functional_classifications_pkey PRIMARY KEY (id);


--
-- Name: org_gifts org_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_pkey PRIMARY KEY (id);


--
-- Name: org_grant_allocations org_grant_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations
    ADD CONSTRAINT org_grant_allocations_pkey PRIMARY KEY (id);


--
-- Name: org_grants org_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_pkey PRIMARY KEY (id);


--
-- Name: org_import_history org_import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_import_history
    ADD CONSTRAINT org_import_history_pkey PRIMARY KEY (id);


--
-- Name: org_invites org_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_pkey PRIMARY KEY (id);


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_pkey PRIMARY KEY (id);


--
-- Name: org_invoice_lines org_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_lines
    ADD CONSTRAINT org_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: org_invoice_payments org_invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments
    ADD CONSTRAINT org_invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: org_invoices org_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices
    ADD CONSTRAINT org_invoices_pkey PRIMARY KEY (id);


--
-- Name: org_ledger_approval_policies org_ledger_approval_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_approval_policies
    ADD CONSTRAINT org_ledger_approval_policies_pkey PRIMARY KEY (org_id);


--
-- Name: org_ledger_lines org_ledger_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_pkey PRIMARY KEY (id);


--
-- Name: org_ledger_transactions org_ledger_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_pkey PRIMARY KEY (id);


--
-- Name: org_members org_members_coop_org_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_coop_org_id_email_key UNIQUE (org_id, email);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);


--
-- Name: org_membership_payments org_membership_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_pkey PRIMARY KEY (id);


--
-- Name: org_membership_reminders org_membership_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_reminders
    ADD CONSTRAINT org_membership_reminders_pkey PRIMARY KEY (id);


--
-- Name: org_membership_tiers org_membership_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_pkey PRIMARY KEY (id);


--
-- Name: org_personnel_allocations org_personnel_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations
    ADD CONSTRAINT org_personnel_allocations_pkey PRIMARY KEY (id);


--
-- Name: org_personnel_allocations org_personnel_allocations_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations
    ADD CONSTRAINT org_personnel_allocations_uq UNIQUE (coop_personnel_id, coop_program_id);


--
-- Name: org_personnel_changes org_personnel_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_changes
    ADD CONSTRAINT org_personnel_changes_pkey PRIMARY KEY (id);


--
-- Name: org_personnel org_personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_pkey PRIMARY KEY (id);


--
-- Name: org_plaid_accounts org_plaid_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts
    ADD CONSTRAINT org_plaid_accounts_pkey PRIMARY KEY (id);


--
-- Name: org_plaid_accounts org_plaid_accounts_plaid_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts
    ADD CONSTRAINT org_plaid_accounts_plaid_account_id_key UNIQUE (plaid_account_id);


--
-- Name: org_plaid_items org_plaid_items_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_items
    ADD CONSTRAINT org_plaid_items_item_id_key UNIQUE (item_id);


--
-- Name: org_plaid_items org_plaid_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_items
    ADD CONSTRAINT org_plaid_items_pkey PRIMARY KEY (id);


--
-- Name: org_pod_credentials org_pod_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pod_credentials
    ADD CONSTRAINT org_pod_credentials_pkey PRIMARY KEY (org_id);


--
-- Name: org_programs org_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_programs
    ADD CONSTRAINT org_programs_pkey PRIMARY KEY (id);


--
-- Name: org_projections org_projections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_pkey PRIMARY KEY (id);


--
-- Name: org_recurring_schedules org_recurring_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_recurring_schedules
    ADD CONSTRAINT org_recurring_schedules_pkey PRIMARY KEY (id);


--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations
    ADD CONSTRAINT org_schedule_item_allocations_pkey PRIMARY KEY (id);


--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations
    ADD CONSTRAINT org_schedule_item_allocations_uq UNIQUE (coop_schedule_item_id, coop_program_id);


--
-- Name: org_schedule_items org_schedule_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_pkey PRIMARY KEY (id);


--
-- Name: org_schedules org_schedules_coop_org_id_fiscal_year_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedules
    ADD CONSTRAINT org_schedules_coop_org_id_fiscal_year_name_key UNIQUE (org_id, fiscal_year, name);


--
-- Name: org_schedules org_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedules
    ADD CONSTRAINT org_schedules_pkey PRIMARY KEY (id);


--
-- Name: org_settings org_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_pkey PRIMARY KEY (org_id);


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_pkey PRIMARY KEY (id);


--
-- Name: org_sponsored_projects org_sponsored_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_pkey PRIMARY KEY (id);


--
-- Name: org_suggestions org_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_suggestions
    ADD CONSTRAINT org_suggestions_pkey PRIMARY KEY (id);


--
-- Name: org_tasks org_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_tasks
    ADD CONSTRAINT org_tasks_pkey PRIMARY KEY (id);


--
-- Name: org_users org_users_coop_org_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_coop_org_id_user_id_key UNIQUE (org_id, user_id);


--
-- Name: org_users org_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_pkey PRIMARY KEY (id);


--
-- Name: org_vendor_compliance org_vendor_compliance_one_per_constituent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_vendor_compliance
    ADD CONSTRAINT org_vendor_compliance_one_per_constituent UNIQUE (constituent_id);


--
-- Name: org_vendor_compliance org_vendor_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_vendor_compliance
    ADD CONSTRAINT org_vendor_compliance_pkey PRIMARY KEY (id);


--
-- Name: org_xero_program_track_map org_xero_program_track_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_xero_program_track_map
    ADD CONSTRAINT org_xero_program_track_map_pkey PRIMARY KEY (id);


--
-- Name: org_xero_program_track_map org_xero_program_track_map_uq_dim; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_xero_program_track_map
    ADD CONSTRAINT org_xero_program_track_map_uq_dim UNIQUE (org_id, xero_tracking_category_id, xero_tracking_option_id, dimension);


--
-- Name: orgs orgs_causal_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_causal_address_key UNIQUE (causal_address);


--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pending_confirmations pending_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_confirmations
    ADD CONSTRAINT pending_confirmations_pkey PRIMARY KEY (id);


--
-- Name: pod_access_group_members pod_access_group_members_group_id_member_webid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members
    ADD CONSTRAINT pod_access_group_members_group_id_member_webid_key UNIQUE (group_id, member_webid);


--
-- Name: pod_access_group_members pod_access_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members
    ADD CONSTRAINT pod_access_group_members_pkey PRIMARY KEY (id);


--
-- Name: pod_access_group_rules pod_access_group_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_pkey PRIMARY KEY (id);


--
-- Name: pod_access_groups pod_access_groups_org_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_groups
    ADD CONSTRAINT pod_access_groups_org_id_name_key UNIQUE (org_id, name);


--
-- Name: pod_access_groups pod_access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_groups
    ADD CONSTRAINT pod_access_groups_pkey PRIMARY KEY (id);


--
-- Name: pod_access_permissions pod_access_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions
    ADD CONSTRAINT pod_access_permissions_pkey PRIMARY KEY (id);


--
-- Name: pod_acr_outbox pod_acr_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_acr_outbox
    ADD CONSTRAINT pod_acr_outbox_pkey PRIMARY KEY (id);


--
-- Name: representatives representatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representatives
    ADD CONSTRAINT representatives_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: transactional_forwards transactional_forwards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_forwards
    ADD CONSTRAINT transactional_forwards_pkey PRIMARY KEY (id);


--
-- Name: user_actions user_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_pkey PRIMARY KEY (id);


--
-- Name: user_actions user_actions_user_id_action_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_user_id_action_id_key UNIQUE (user_id, action_id);


--
-- Name: user_addresses user_addresses_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_address_key UNIQUE (address);


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


--
-- Name: user_contributed_orgs user_contributed_orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contributed_orgs
    ADD CONSTRAINT user_contributed_orgs_pkey PRIMARY KEY (id);


--
-- Name: user_inbound_emails user_inbound_emails_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inbound_emails
    ADD CONSTRAINT user_inbound_emails_message_id_key UNIQUE (message_id);


--
-- Name: user_inbound_emails user_inbound_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inbound_emails
    ADD CONSTRAINT user_inbound_emails_pkey PRIMARY KEY (id);


--
-- Name: user_org_petition_signatures user_org_petition_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_petition_signatures
    ADD CONSTRAINT user_org_petition_signatures_pkey PRIMARY KEY (id);


--
-- Name: user_org_petition_signatures user_org_petition_signatures_user_id_org_id_petition_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_petition_signatures
    ADD CONSTRAINT user_org_petition_signatures_user_id_org_id_petition_url_key UNIQUE (user_id, org_id, petition_url);


--
-- Name: user_org_preferences user_org_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_org_preferences user_org_preferences_user_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_user_id_org_id_key UNIQUE (user_id, org_id);


--
-- Name: user_org_setup_presets user_org_setup_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_setup_presets
    ADD CONSTRAINT user_org_setup_presets_pkey PRIMARY KEY (id);


--
-- Name: user_rep_contact_actions user_rep_contact_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions
    ADD CONSTRAINT user_rep_contact_actions_pkey PRIMARY KEY (id);


--
-- Name: user_rep_contact_actions user_rep_contact_actions_user_id_rep_id_action_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions
    ADD CONSTRAINT user_rep_contact_actions_user_id_rep_id_action_id_key UNIQUE (user_id, rep_id, action_id);


--
-- Name: user_representatives user_representatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_representatives
    ADD CONSTRAINT user_representatives_pkey PRIMARY KEY (id);


--
-- Name: user_representatives user_representatives_user_id_rep_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_representatives
    ADD CONSTRAINT user_representatives_user_id_rep_id_key UNIQUE (user_id, rep_id);


--
-- Name: users users_causal_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_causal_address_key UNIQUE (causal_address);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_forwarding_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_forwarding_address_key UNIQUE (forwarding_address);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: volunteer_opportunities volunteer_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_opportunities
    ADD CONSTRAINT volunteer_opportunities_pkey PRIMARY KEY (id);


--
-- Name: watch_contributions watch_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_contributions
    ADD CONSTRAINT watch_contributions_pkey PRIMARY KEY (id);


--
-- Name: workshop_civic_links workshop_civic_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_civic_links
    ADD CONSTRAINT workshop_civic_links_pkey PRIMARY KEY (id);


--
-- Name: workshop_documents workshop_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents
    ADD CONSTRAINT workshop_documents_pkey PRIMARY KEY (id);


--
-- Name: workshop_interventions workshop_interventions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_interventions
    ADD CONSTRAINT workshop_interventions_pkey PRIMARY KEY (id);


--
-- Name: workshop_messages workshop_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_messages
    ADD CONSTRAINT workshop_messages_pkey PRIMARY KEY (id);


--
-- Name: workshop_projects workshop_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_projects
    ADD CONSTRAINT workshop_projects_pkey PRIMARY KEY (id);


--
-- Name: workshop_projects workshop_projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_projects
    ADD CONSTRAINT workshop_projects_slug_key UNIQUE (slug);


--
-- Name: workshop_proposals workshop_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals
    ADD CONSTRAINT workshop_proposals_pkey PRIMARY KEY (id);


--
-- Name: workshop_space_members workshop_space_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members
    ADD CONSTRAINT workshop_space_members_pkey PRIMARY KEY (id);


--
-- Name: workshop_space_members workshop_space_members_space_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members
    ADD CONSTRAINT workshop_space_members_space_id_user_id_key UNIQUE (space_id, user_id);


--
-- Name: workshop_threads workshop_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_threads
    ADD CONSTRAINT workshop_threads_pkey PRIMARY KEY (id);


--
-- Name: workshop_workspaces workshop_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_workspaces
    ADD CONSTRAINT workshop_workspaces_pkey PRIMARY KEY (id);


--
-- Name: workshop_workspaces workshop_workspaces_project_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_workspaces
    ADD CONSTRAINT workshop_workspaces_project_id_slug_key UNIQUE (project_id, slug);


--
-- Name: financial_rep_pledges_institution_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_rep_pledges_institution_key_idx ON public.financial_rep_pledges USING btree (institution_key);


--
-- Name: idx_actions_eip_alert_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_actions_eip_alert_id_unique ON public.actions USING btree (eip_alert_id) WHERE (eip_alert_id IS NOT NULL);


--
-- Name: idx_actions_fr_docket_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_actions_fr_docket_number_unique ON public.actions USING btree (fr_docket_number) WHERE (fr_docket_number IS NOT NULL);


--
-- Name: idx_actions_postmark_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_actions_postmark_message_id ON public.actions USING btree (postmark_message_id) WHERE (postmark_message_id IS NOT NULL);


--
-- Name: idx_actions_sender_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_sender_email_lower ON public.actions USING btree (lower(sender_email)) WHERE (sender_email IS NOT NULL);


--
-- Name: idx_actions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_user_id ON public.actions USING btree (user_id);


--
-- Name: idx_audit_log_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_occurred_at ON public.org_audit_log USING btree (occurred_at);


--
-- Name: idx_audit_log_org_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_org_table_record ON public.org_audit_log USING btree (org_id, table_name, record_id);


--
-- Name: idx_bank_pledges_institution_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_pledges_institution_name ON public.bank_pledges USING btree (institution_name);


--
-- Name: idx_bank_pressure_actions_institution_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_pressure_actions_institution_name ON public.bank_pressure_actions USING btree (institution_name);


--
-- Name: idx_budget_lines_composite_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_budget_lines_composite_key ON public.org_budget_lines USING btree (org_id, account_id, COALESCE(program_id, 0), COALESCE(grant_id, 0), COALESCE(activity_id, 0), fiscal_year, month);


--
-- Name: idx_compliance_extension_proposals_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_extension_proposals_org ON public.compliance_extension_proposals USING btree (org_id);


--
-- Name: idx_compliance_extension_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_extension_proposals_status ON public.compliance_extension_proposals USING btree (proposal_status);


--
-- Name: idx_compliance_template_items_applies_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_template_items_applies_to ON public.compliance_template_items USING gin (applies_to_org_type);


--
-- Name: idx_compliance_template_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_template_items_category ON public.compliance_template_items USING btree (category, display_order);


--
-- Name: idx_contributions_change_donation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contributions_change_donation_id ON public.contributions USING btree (change_donation_id) WHERE (change_donation_id IS NOT NULL);


--
-- Name: idx_contributions_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contributions_org_id ON public.contributions USING btree (org_id);


--
-- Name: idx_contributions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contributions_user_id ON public.contributions USING btree (user_id);


--
-- Name: idx_contributions_user_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contributions_user_org_date ON public.contributions USING btree (user_id, org_name, contributed_at DESC);


--
-- Name: idx_coop_bs_snapshots_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_bs_snapshots_org_date ON public.org_balance_sheet_snapshots USING btree (org_id, as_of_date DESC);


--
-- Name: idx_coop_functional_class_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_functional_class_org_fy ON public.org_functional_classifications USING btree (org_id, fiscal_year);


--
-- Name: idx_coop_interactions_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_interactions_constituent ON public.org_constituent_interactions USING btree (constituent_id);


--
-- Name: idx_coop_interactions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_interactions_org ON public.org_constituent_interactions USING btree (org_id, interaction_date DESC);


--
-- Name: idx_coop_members_causal_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_members_causal_org_id ON public.coop_members USING btree (causal_org_id);


--
-- Name: idx_coop_members_cooperative_turnarounds; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_members_cooperative_turnarounds ON public.coop_members USING gin (cooperative_turnarounds);


--
-- Name: idx_coop_members_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_members_deleted_at ON public.coop_members USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_coop_xero_prog_track_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_xero_prog_track_org ON public.org_xero_program_track_map USING btree (org_id);


--
-- Name: idx_cooperative_library_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_library_items_category ON public.cooperative_library_items USING btree (category, display_order);


--
-- Name: idx_cooperative_library_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_library_submissions_status ON public.cooperative_library_submissions USING btree (status, created_at);


--
-- Name: idx_cooperative_library_submissions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_library_submissions_target ON public.cooperative_library_submissions USING btree (target_item_id);


--
-- Name: idx_cooperative_work_library_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_work_library_items_category ON public.cooperative_work_library_items USING btree (category, display_order);


--
-- Name: idx_cooperative_work_library_items_workshop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_work_library_items_workshop ON public.cooperative_work_library_items USING btree (workshop_id);


--
-- Name: idx_cooperative_work_requests_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_work_requests_org ON public.cooperative_work_requests USING btree (org_id);


--
-- Name: idx_cooperative_work_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooperative_work_requests_status ON public.cooperative_work_requests USING btree (status, created_at DESC);


--
-- Name: idx_inbound_debug_emails_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_debug_emails_created_at ON public.inbound_debug_emails USING btree (created_at);


--
-- Name: idx_local_event_attendance_user_attended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_local_event_attendance_user_attended ON public.local_event_attendance USING btree (user_id, attended);


--
-- Name: idx_membership_members_cooperative_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_members_cooperative_user_id ON public.org_members USING btree (cooperative_user_id);


--
-- Name: idx_membership_members_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_members_org_id ON public.org_members USING btree (org_id);


--
-- Name: idx_membership_members_period_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_members_period_end ON public.org_members USING btree (org_id, current_period_end);


--
-- Name: idx_membership_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_members_status ON public.org_members USING btree (org_id, status);


--
-- Name: idx_membership_members_tier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_members_tier_id ON public.org_members USING btree (tier_id);


--
-- Name: idx_membership_payments_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_payments_member_id ON public.org_membership_payments USING btree (member_id);


--
-- Name: idx_membership_payments_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_payments_payment_date ON public.org_membership_payments USING btree (payment_date);


--
-- Name: idx_membership_reminders_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_reminders_member_id ON public.org_membership_reminders USING btree (member_id);


--
-- Name: idx_membership_reminders_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_reminders_sent_at ON public.org_membership_reminders USING btree (sent_at);


--
-- Name: idx_membership_tiers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_tiers_active ON public.org_membership_tiers USING btree (org_id, is_active) WHERE (is_active = true);


--
-- Name: idx_membership_tiers_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_tiers_org_id ON public.org_membership_tiers USING btree (org_id);


--
-- Name: idx_org_accounts_coop_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_accounts_coop_org_id ON public.org_accounts USING btree (org_id);


--
-- Name: idx_org_accounts_coop_org_xero_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_coop_org_xero_account ON public.org_accounts USING btree (org_id, xero_account_id) WHERE (xero_account_id IS NOT NULL);


--
-- Name: idx_org_accounts_one_ap_account_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_ap_account_per_org ON public.org_accounts USING btree (org_id) WHERE is_system_ap_account;


--
-- Name: idx_org_accounts_one_ar_account_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_ar_account_per_org ON public.org_accounts USING btree (org_id) WHERE is_system_ar_account;


--
-- Name: idx_org_accounts_one_clearing_account_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_clearing_account_per_org ON public.org_accounts USING btree (org_id) WHERE (is_system_clearing_account = true);


--
-- Name: idx_org_accounts_one_contrib_rev_account_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_contrib_rev_account_per_org ON public.org_accounts USING btree (org_id) WHERE is_system_contribution_revenue_account;


--
-- Name: idx_org_accounts_one_expense_claims_payable_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_expense_claims_payable_per_org ON public.org_accounts USING btree (org_id) WHERE is_system_expense_claims_payable_account;


--
-- Name: idx_org_accounts_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_accounts_parent_id ON public.org_accounts USING btree (parent_id);


--
-- Name: idx_org_accounts_rollup_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_accounts_rollup_parent_id ON public.org_accounts USING btree (rollup_parent_id);


--
-- Name: idx_org_actuals_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_grant ON public.org_actuals USING btree (org_id, grant_id) WHERE (grant_id IS NOT NULL);


--
-- Name: idx_org_actuals_org_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_org_account ON public.org_actuals USING btree (org_id, org_account_id);


--
-- Name: idx_org_actuals_org_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_org_activity ON public.org_actuals USING btree (org_id, org_activity_id);


--
-- Name: idx_org_actuals_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_org_period ON public.org_actuals USING btree (org_id, period_year, period_month);


--
-- Name: idx_org_actuals_org_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_org_program ON public.org_actuals USING btree (org_id, org_program_id);


--
-- Name: idx_org_actuals_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_actuals_org_status ON public.org_actuals USING btree (org_id, status);


--
-- Name: idx_org_actuals_period_cell_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_actuals_period_cell_unique ON public.org_actuals USING btree (org_id, org_account_id, period_year, period_month, COALESCE(xero_tracking_option_id, 'none'::text));


--
-- Name: idx_org_aliases_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_aliases_org_id ON public.org_aliases USING btree (org_id);


--
-- Name: idx_org_bank_rules_org_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_rules_org_priority ON public.org_bank_rules USING btree (org_id, priority);


--
-- Name: idx_org_bank_statement_line_postings_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_statement_line_postings_line ON public.org_bank_statement_line_postings USING btree (statement_line_id);


--
-- Name: idx_org_bank_statement_line_postings_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_statement_line_postings_txn ON public.org_bank_statement_line_postings USING btree (ledger_transaction_id);


--
-- Name: idx_org_bank_statement_lines_org_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_statement_lines_org_account ON public.org_bank_statement_lines USING btree (org_id, bank_account_id);


--
-- Name: idx_org_bank_statement_lines_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_statement_lines_org_date ON public.org_bank_statement_lines USING btree (org_id, statement_date);


--
-- Name: idx_org_bank_statement_lines_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_statement_lines_org_status ON public.org_bank_statement_lines USING btree (org_id, status);


--
-- Name: idx_org_bank_statement_lines_plaid_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_bank_statement_lines_plaid_txn ON public.org_bank_statement_lines USING btree (org_id, plaid_transaction_id) WHERE (plaid_transaction_id IS NOT NULL);


--
-- Name: idx_org_bill_credit_notes_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bill_credit_notes_org_status ON public.org_bill_credit_notes USING btree (org_id, status);


--
-- Name: idx_org_bill_lines_bill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bill_lines_bill ON public.org_bill_lines USING btree (bill_id);


--
-- Name: idx_org_bill_payments_org_bill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bill_payments_org_bill ON public.org_bill_payments USING btree (org_id, bill_id);


--
-- Name: idx_org_bills_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bills_constituent ON public.org_bills USING btree (constituent_id);


--
-- Name: idx_org_bills_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bills_org_status ON public.org_bills USING btree (org_id, status);


--
-- Name: idx_org_board_designations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_board_designations_org ON public.org_board_designations USING btree (org_id);


--
-- Name: idx_org_budget_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_lines_account ON public.org_budget_lines USING btree (account_id);


--
-- Name: idx_org_budget_lines_coop_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_lines_coop_org_id ON public.org_budget_lines USING btree (org_id);


--
-- Name: idx_org_budget_lines_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_lines_grant ON public.org_budget_lines USING btree (grant_id) WHERE (grant_id IS NOT NULL);


--
-- Name: idx_org_budget_lines_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_lines_lookup ON public.org_budget_lines USING btree (org_id, fiscal_year, month);


--
-- Name: idx_org_budget_lines_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_lines_program ON public.org_budget_lines USING btree (program_id);


--
-- Name: idx_org_compliance_obligations_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_compliance_obligations_category ON public.org_compliance_obligations USING btree (category);


--
-- Name: idx_org_compliance_obligations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_compliance_obligations_org ON public.org_compliance_obligations USING btree (org_id);


--
-- Name: idx_org_compliance_obligations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_compliance_obligations_status ON public.org_compliance_obligations USING btree (status, next_due_date);


--
-- Name: idx_org_compliance_obligations_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_compliance_obligations_template ON public.org_compliance_obligations USING btree (template_item_id);


--
-- Name: idx_org_constituents_is_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_is_customer ON public.org_constituents USING btree (org_id, is_customer) WHERE is_customer;


--
-- Name: idx_org_constituents_is_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_is_vendor ON public.org_constituents USING btree (org_id, is_vendor) WHERE is_vendor;


--
-- Name: idx_org_constituents_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_org ON public.org_constituents USING btree (org_id);


--
-- Name: idx_org_constituents_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_tags ON public.org_constituents USING gin (tags);


--
-- Name: idx_org_constituents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_type ON public.org_constituents USING btree (org_id, type);


--
-- Name: idx_org_constituents_xero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_xero ON public.org_constituents USING btree (xero_contact_id) WHERE (xero_contact_id IS NOT NULL);


--
-- Name: idx_org_constituents_xero_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_constituents_xero_unique ON public.org_constituents USING btree (org_id, xero_contact_id) WHERE (xero_contact_id IS NOT NULL);


--
-- Name: idx_org_document_expectations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_document_expectations_org ON public.org_document_expectations USING btree (org_id);


--
-- Name: idx_org_documents_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_grant ON public.org_documents USING btree (grant_id);


--
-- Name: idx_org_documents_obligation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_obligation ON public.org_documents USING btree (obligation_id);


--
-- Name: idx_org_documents_org_category_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_org_category_current ON public.org_documents USING btree (org_id, category, is_current);


--
-- Name: idx_org_documents_org_expiration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_org_expiration ON public.org_documents USING btree (org_id, expiration_date) WHERE (expiration_date IS NOT NULL);


--
-- Name: idx_org_documents_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_org_fy ON public.org_documents USING btree (org_id, fiscal_year);


--
-- Name: idx_org_documents_source_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_source_ref ON public.org_documents USING btree (org_id, source_ref_type, source_ref_id) WHERE (source_ref_id IS NOT NULL);


--
-- Name: idx_org_documents_sponsored_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_sponsored_project ON public.org_documents USING btree (sponsored_project_id) WHERE (sponsored_project_id IS NOT NULL);


--
-- Name: idx_org_documents_supersedes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_documents_supersedes ON public.org_documents USING btree (supersedes_id);


--
-- Name: idx_org_donation_url_suggestions_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_donation_url_suggestions_org_id ON public.org_donation_url_suggestions USING btree (org_id);


--
-- Name: idx_org_expense_claim_lines_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_expense_claim_lines_claim ON public.org_expense_claim_lines USING btree (claim_id);


--
-- Name: idx_org_expense_claim_messages_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_expense_claim_messages_claim ON public.org_expense_claim_messages USING btree (claim_id);


--
-- Name: idx_org_expense_claim_payments_org_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_expense_claim_payments_org_claim ON public.org_expense_claim_payments USING btree (org_id, claim_id);


--
-- Name: idx_org_expense_claims_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_expense_claims_org_status ON public.org_expense_claims USING btree (org_id, status);


--
-- Name: idx_org_expense_claims_org_submitter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_expense_claims_org_submitter ON public.org_expense_claims USING btree (org_id, submitted_by);


--
-- Name: idx_org_fixed_asset_depr_entries_org_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_fixed_asset_depr_entries_org_asset ON public.org_fixed_asset_depreciation_entries USING btree (org_id, fixed_asset_id);


--
-- Name: idx_org_fixed_assets_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_fixed_assets_org_status ON public.org_fixed_assets USING btree (org_id, status);


--
-- Name: idx_org_gifts_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_constituent ON public.org_gifts USING btree (constituent_id);


--
-- Name: idx_org_gifts_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_grant ON public.org_gifts USING btree (grant_id) WHERE (grant_id IS NOT NULL);


--
-- Name: idx_org_gifts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_org ON public.org_gifts USING btree (org_id);


--
-- Name: idx_org_gifts_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_received_at ON public.org_gifts USING btree (org_id, received_at DESC);


--
-- Name: idx_org_gifts_sponsored_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_sponsored_project ON public.org_gifts USING btree (sponsored_project_id) WHERE (sponsored_project_id IS NOT NULL);


--
-- Name: idx_org_gifts_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_gifts_stripe ON public.org_gifts USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_org_grant_allocations_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_allocations_fy ON public.org_grant_allocations USING btree (fiscal_year);


--
-- Name: idx_org_grant_allocations_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_allocations_grant ON public.org_grant_allocations USING btree (grant_id);


--
-- Name: idx_org_grant_allocations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_allocations_org ON public.org_grant_allocations USING btree (org_id);


--
-- Name: idx_org_grant_allocations_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_allocations_program ON public.org_grant_allocations USING btree (coop_program_id);


--
-- Name: idx_org_grant_allocations_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_grant_allocations_unique ON public.org_grant_allocations USING btree (grant_id, coop_program_id, fiscal_year);


--
-- Name: idx_org_grants_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_constituent ON public.org_grants USING btree (constituent_id) WHERE (constituent_id IS NOT NULL);


--
-- Name: idx_org_grants_coop_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_coop_org_id ON public.org_grants USING btree (org_id);


--
-- Name: idx_org_grants_coop_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_coop_org_status ON public.org_grants USING btree (org_id, status);


--
-- Name: idx_org_grants_funder_grant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_funder_grant_id ON public.org_grants USING btree (org_id, funder_grant_id) WHERE (funder_grant_id IS NOT NULL);


--
-- Name: idx_org_grants_institution_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_institution_type ON public.org_grants USING btree (org_id, institution_type) WHERE (institution_type IS NOT NULL);


--
-- Name: idx_org_grants_revenue_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grants_revenue_account ON public.org_grants USING btree (revenue_account_id) WHERE (revenue_account_id IS NOT NULL);


--
-- Name: idx_org_import_history_org_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_import_history_org_kind ON public.org_import_history USING btree (org_id, import_kind, finished_at DESC);


--
-- Name: idx_org_invites_coop_org_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invites_coop_org_email ON public.org_invites USING btree (org_id, lower(email));


--
-- Name: idx_org_invites_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invites_expires_at ON public.org_invites USING btree (expires_at) WHERE (used = false);


--
-- Name: idx_org_invites_pending_coop_org_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_invites_pending_coop_org_email ON public.org_invites USING btree (org_id, lower(email)) WHERE (used = false);


--
-- Name: idx_org_invites_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_invites_token_hash ON public.org_invites USING btree (token_hash);


--
-- Name: idx_org_invoice_credit_notes_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invoice_credit_notes_org_status ON public.org_invoice_credit_notes USING btree (org_id, status);


--
-- Name: idx_org_invoice_lines_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invoice_lines_invoice ON public.org_invoice_lines USING btree (invoice_id);


--
-- Name: idx_org_invoice_payments_org_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invoice_payments_org_invoice ON public.org_invoice_payments USING btree (org_id, invoice_id);


--
-- Name: idx_org_invoices_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invoices_constituent ON public.org_invoices USING btree (constituent_id);


--
-- Name: idx_org_invoices_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invoices_org_status ON public.org_invoices USING btree (org_id, status);


--
-- Name: idx_org_ledger_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_account ON public.org_ledger_lines USING btree (account_id);


--
-- Name: idx_org_ledger_lines_board_designation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_board_designation ON public.org_ledger_lines USING btree (board_designation_id) WHERE (board_designation_id IS NOT NULL);


--
-- Name: idx_org_ledger_lines_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_grant ON public.org_ledger_lines USING btree (grant_id) WHERE (grant_id IS NOT NULL);


--
-- Name: idx_org_ledger_lines_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_program ON public.org_ledger_lines USING btree (program_id);


--
-- Name: idx_org_ledger_lines_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_transaction ON public.org_ledger_lines USING btree (transaction_id);


--
-- Name: idx_org_ledger_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_transactions_date ON public.org_ledger_transactions USING btree (org_id, transaction_date);


--
-- Name: idx_org_ledger_transactions_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_transactions_org_fy ON public.org_ledger_transactions USING btree (org_id, fiscal_year);


--
-- Name: idx_org_plaid_accounts_one_per_org_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_plaid_accounts_one_per_org_account ON public.org_plaid_accounts USING btree (org_account_id);


--
-- Name: idx_org_programs_coop_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_programs_coop_org_active ON public.org_programs USING btree (org_id, active);


--
-- Name: idx_org_programs_coop_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_programs_coop_org_id ON public.org_programs USING btree (org_id);


--
-- Name: idx_org_programs_one_transfer_program_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_programs_one_transfer_program_per_org ON public.org_programs USING btree (org_id) WHERE is_system_transfer_program;


--
-- Name: idx_org_programs_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_programs_parent_id ON public.org_programs USING btree (parent_id);


--
-- Name: idx_org_recurring_schedules_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_recurring_schedules_due ON public.org_recurring_schedules USING btree (org_id, next_occurrence_date) WHERE active;


--
-- Name: idx_org_schedule_item_allocations_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_item_allocations_item ON public.org_schedule_item_allocations USING btree (coop_schedule_item_id);


--
-- Name: idx_org_schedule_items_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_items_account ON public.org_schedule_items USING btree (account_id);


--
-- Name: idx_org_schedule_items_named; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_items_named ON public.org_schedule_items USING btree (named_schedule_id) WHERE (named_schedule_id IS NOT NULL);


--
-- Name: idx_org_schedule_items_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_items_org_fy ON public.org_schedule_items USING btree (org_id, fiscal_year);


--
-- Name: idx_org_schedule_items_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_items_origin ON public.org_schedule_items USING btree (origin_item_id) WHERE (origin_item_id IS NOT NULL);


--
-- Name: idx_org_schedules_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedules_org_fy ON public.org_schedules USING btree (org_id, fiscal_year);


--
-- Name: idx_org_sponsored_project_disbursements_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsored_project_disbursements_project ON public.org_sponsored_project_disbursements USING btree (org_id, sponsored_project_id);


--
-- Name: idx_org_sponsored_projects_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsored_projects_program ON public.org_sponsored_projects USING btree (program_id) WHERE (program_id IS NOT NULL);


--
-- Name: idx_org_sponsored_projects_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsored_projects_sponsor ON public.org_sponsored_projects USING btree (sponsor_org_id);


--
-- Name: idx_org_sponsored_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsored_projects_status ON public.org_sponsored_projects USING btree (status);


--
-- Name: idx_org_suggestions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_suggestions_created_at ON public.org_suggestions USING btree (created_at);


--
-- Name: idx_org_suggestions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_suggestions_user_id ON public.org_suggestions USING btree (user_id);


--
-- Name: idx_org_tasks_coop_org_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_tasks_coop_org_assignee ON public.org_tasks USING btree (org_id, assigned_to);


--
-- Name: idx_org_tasks_coop_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_tasks_coop_org_status ON public.org_tasks USING btree (org_id, status);


--
-- Name: idx_org_tasks_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_tasks_source ON public.org_tasks USING btree (source_table, source_id);


--
-- Name: idx_org_users_coop_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_users_coop_org_id ON public.org_users USING btree (org_id);


--
-- Name: idx_org_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_users_user_id ON public.org_users USING btree (user_id);


--
-- Name: idx_page_views_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_created ON public.page_views USING btree (created_at DESC);


--
-- Name: idx_page_views_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_user_created ON public.page_views USING btree (user_id, created_at DESC);


--
-- Name: idx_password_reset_tokens_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_email ON public.password_reset_tokens USING btree (email);


--
-- Name: idx_password_reset_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: idx_pending_confirmations_unconfirmed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_confirmations_unconfirmed ON public.pending_confirmations USING btree (user_id, confirmed_at);


--
-- Name: idx_pending_confirmations_user_id_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_confirmations_user_id_created ON public.pending_confirmations USING btree (user_id, created_at DESC);


--
-- Name: idx_pod_access_group_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_group_members_group ON public.pod_access_group_members USING btree (group_id);


--
-- Name: idx_pod_access_group_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_group_members_org ON public.pod_access_group_members USING btree (org_id);


--
-- Name: idx_pod_access_group_rules_org_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_group_rules_org_category ON public.pod_access_group_rules USING btree (org_id, category);


--
-- Name: idx_pod_access_group_rules_org_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_group_rules_org_document ON public.pod_access_group_rules USING btree (org_id, org_document_id) WHERE (org_document_id IS NOT NULL);


--
-- Name: idx_pod_access_groups_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_groups_org ON public.pod_access_groups USING btree (org_id);


--
-- Name: idx_pod_access_permissions_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_permissions_document ON public.pod_access_permissions USING btree (org_document_id);


--
-- Name: idx_pod_access_permissions_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_permissions_expiry ON public.pod_access_permissions USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_pod_access_permissions_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_permissions_group ON public.pod_access_permissions USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_pod_access_permissions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_access_permissions_org ON public.pod_access_permissions USING btree (org_id, created_at DESC);


--
-- Name: idx_pod_acr_outbox_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_acr_outbox_org ON public.pod_acr_outbox USING btree (org_id, created_at DESC);


--
-- Name: idx_pod_acr_outbox_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_acr_outbox_pending ON public.pod_acr_outbox USING btree (next_attempt_at) WHERE (status = 'pending'::text);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_token ON public.sessions USING btree (token);


--
-- Name: idx_transactional_forwards_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactional_forwards_created_at ON public.transactional_forwards USING btree (created_at);


--
-- Name: idx_user_actions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_actions_user_id ON public.user_actions USING btree (user_id);


--
-- Name: idx_user_addresses_is_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_is_primary ON public.user_addresses USING btree (user_id, is_primary);


--
-- Name: idx_user_addresses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_user_id ON public.user_addresses USING btree (user_id);


--
-- Name: idx_user_contributed_orgs_added_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_contributed_orgs_added_at ON public.user_contributed_orgs USING btree (added_at DESC);


--
-- Name: idx_user_contributed_orgs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_contributed_orgs_user_id ON public.user_contributed_orgs USING btree (user_id);


--
-- Name: idx_user_inbound_emails_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_inbound_emails_received_at ON public.user_inbound_emails USING btree (received_at DESC);


--
-- Name: idx_user_inbound_emails_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_inbound_emails_user_id ON public.user_inbound_emails USING btree (user_id);


--
-- Name: idx_user_org_petition_signatures_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_org_petition_signatures_address ON public.user_org_petition_signatures USING btree (causal_address_used);


--
-- Name: idx_user_org_petition_signatures_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_org_petition_signatures_org_id ON public.user_org_petition_signatures USING btree (org_id);


--
-- Name: idx_user_org_petition_signatures_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_org_petition_signatures_user_id ON public.user_org_petition_signatures USING btree (user_id);


--
-- Name: idx_user_org_petition_signatures_user_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_org_petition_signatures_user_org ON public.user_org_petition_signatures USING btree (user_id, org_id);


--
-- Name: idx_user_org_setup_presets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_org_setup_presets_user_id ON public.user_org_setup_presets USING btree (user_id);


--
-- Name: idx_user_rep_contact_actions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_rep_contact_actions_user ON public.user_rep_contact_actions USING btree (user_id);


--
-- Name: idx_users_is_cooperative_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_cooperative_admin ON public.users USING btree (is_cooperative_admin) WHERE (is_cooperative_admin = true);


--
-- Name: idx_volunteer_opportunities_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_volunteer_opportunities_approved ON public.volunteer_opportunities USING btree (approved, created_at DESC);


--
-- Name: idx_volunteer_opportunities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_volunteer_opportunities_created_at ON public.volunteer_opportunities USING btree (created_at DESC);


--
-- Name: idx_volunteer_opportunities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_volunteer_opportunities_user_id ON public.volunteer_opportunities USING btree (submitted_by_user_id);


--
-- Name: idx_watch_contributions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watch_contributions_user_id ON public.watch_contributions USING btree (user_id);


--
-- Name: idx_workshop_civic_links_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_civic_links_entity ON public.workshop_civic_links USING btree (linked_entity_type, linked_entity_id);


--
-- Name: idx_workshop_civic_links_space; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_civic_links_space ON public.workshop_civic_links USING btree (space_id);


--
-- Name: idx_workshop_documents_doc_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_documents_doc_type ON public.workshop_documents USING btree (workspace_id, doc_type);


--
-- Name: idx_workshop_documents_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_documents_version ON public.workshop_documents USING btree (previous_version_id);


--
-- Name: idx_workshop_documents_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_documents_workspace ON public.workshop_documents USING btree (workspace_id, updated_at DESC);


--
-- Name: idx_workshop_interventions_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_interventions_project ON public.workshop_interventions USING btree (workshop_project_id, leverage_level);


--
-- Name: idx_workshop_interventions_target_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_interventions_target_action ON public.workshop_interventions USING btree (target_action_id);


--
-- Name: idx_workshop_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_messages_thread ON public.workshop_messages USING btree (thread_id, created_at);


--
-- Name: idx_workshop_proposals_space; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_proposals_space ON public.workshop_proposals USING btree (space_id, created_at DESC);


--
-- Name: idx_workshop_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_proposals_status ON public.workshop_proposals USING btree (space_id, status);


--
-- Name: idx_workshop_space_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_space_members_org ON public.workshop_space_members USING btree (org_id);


--
-- Name: idx_workshop_space_members_space; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_space_members_space ON public.workshop_space_members USING btree (space_id);


--
-- Name: idx_workshop_space_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_space_members_user ON public.workshop_space_members USING btree (user_id);


--
-- Name: idx_workshop_threads_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_threads_workspace ON public.workshop_threads USING btree (workspace_id, updated_at DESC);


--
-- Name: idx_workshop_workspaces_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workshop_workspaces_project ON public.workshop_workspaces USING btree (project_id);


--
-- Name: org_allocation_lines_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_lines_account_idx ON public.org_allocation_lines USING btree (coop_account_id);


--
-- Name: org_allocation_lines_program_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_lines_program_idx ON public.org_allocation_lines USING btree (coop_program_id);


--
-- Name: org_allocation_lines_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_lines_schedule_idx ON public.org_allocation_lines USING btree (coop_allocation_schedule_id);


--
-- Name: org_allocation_monthly_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_monthly_schedule_idx ON public.org_allocation_monthly USING btree (coop_allocation_schedule_id);


--
-- Name: org_allocation_schedules_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_schedules_org_active_idx ON public.org_allocation_schedules USING btree (org_id, active);


--
-- Name: org_allocation_schedules_org_fy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_allocation_schedules_org_fy_idx ON public.org_allocation_schedules USING btree (org_id, fiscal_year);


--
-- Name: org_personnel_changes_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_personnel_changes_org ON public.org_personnel_changes USING btree (org_id, changed_at DESC);


--
-- Name: org_personnel_changes_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_personnel_changes_worker ON public.org_personnel_changes USING btree (coop_personnel_id, changed_at DESC);


--
-- Name: org_personnel_org_fy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_personnel_org_fy_idx ON public.org_personnel USING btree (org_id, fiscal_year);


--
-- Name: org_projections_org_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_projections_org_account_idx ON public.org_projections USING btree (org_id, coop_account_id);


--
-- Name: org_projections_org_fy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_projections_org_fy_idx ON public.org_projections USING btree (org_id, fiscal_year);


--
-- Name: org_projections_org_program_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_projections_org_program_idx ON public.org_projections USING btree (org_id, coop_program_id);


--
-- Name: org_projections_uq_annual; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_projections_uq_annual ON public.org_projections USING btree (org_id, coop_account_id, coop_program_id, fiscal_year) WHERE (period_month IS NULL);


--
-- Name: org_projections_uq_monthly; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_projections_uq_monthly ON public.org_projections USING btree (org_id, coop_account_id, coop_program_id, fiscal_year, period_month) WHERE (period_month IS NOT NULL);


--
-- Name: pod_access_group_rules_category_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_access_group_rules_category_uniq ON public.pod_access_group_rules USING btree (org_id, category, group_id) WHERE (category IS NOT NULL);


--
-- Name: pod_access_group_rules_document_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_access_group_rules_document_uniq ON public.pod_access_group_rules USING btree (org_id, org_document_id, group_id) WHERE (org_document_id IS NOT NULL);


--
-- Name: uq_np_budget_line_no_grant_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_np_budget_line_no_grant_v2 ON public.org_budget_lines USING btree (org_id, account_id, program_id, COALESCE(activity_id, '-1'::integer), fiscal_year, month) WHERE (grant_id IS NULL);


--
-- Name: uq_np_budget_line_with_grant_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_np_budget_line_with_grant_v2 ON public.org_budget_lines USING btree (org_id, account_id, program_id, COALESCE(activity_id, '-1'::integer), grant_id, fiscal_year, month) WHERE (grant_id IS NOT NULL);


--
-- Name: uq_np_grants_org_grant_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_np_grants_org_grant_code ON public.org_grants USING btree (org_id, lower(grant_code)) WHERE ((grant_code IS NOT NULL) AND (btrim(grant_code) <> ''::text));


--
-- Name: uq_org_documents_org_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_documents_org_checksum ON public.org_documents USING btree (org_id, checksum_sha256) WHERE (archived_at IS NULL);


--
-- Name: org_bank_statement_lines trg_bank_statement_lines_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bank_statement_lines_account BEFORE INSERT OR UPDATE OF bank_account_id, org_id ON public.org_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bank_statement_line_account();


--
-- Name: org_bank_statement_lines trg_bank_statement_lines_transfer_pair_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bank_statement_lines_transfer_pair_same_org BEFORE INSERT OR UPDATE OF transfer_pair_line_id, org_id ON public.org_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bank_statement_transfer_pair_same_org();


--
-- Name: org_bill_credit_notes trg_bill_credit_notes_1_constituent_is_vendor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_credit_notes_1_constituent_is_vendor BEFORE INSERT OR UPDATE OF constituent_id ON public.org_bill_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_credit_note_constituent_is_vendor();


--
-- Name: org_bill_credit_notes trg_bill_credit_notes_2_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_credit_notes_2_same_org BEFORE INSERT OR UPDATE ON public.org_bill_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_credit_notes_same_org();


--
-- Name: org_bill_credit_notes trg_bill_credit_notes_3_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_credit_notes_3_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_bill_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_bill_credit_notes();


--
-- Name: org_bill_lines trg_bill_lines_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_lines_1_same_org BEFORE INSERT OR UPDATE ON public.org_bill_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_lines_same_org();


--
-- Name: org_bill_lines trg_bill_lines_2_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_lines_2_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_bill_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_bill_lines();


--
-- Name: org_bill_payments trg_bill_payments_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_payments_1_same_org BEFORE INSERT OR UPDATE ON public.org_bill_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_payments_same_org();


--
-- Name: org_bill_payments trg_bill_payments_2_cash_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_payments_2_cash_account BEFORE INSERT OR UPDATE OF bank_account_id ON public.org_bill_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_payments_cash_account();


--
-- Name: org_bills trg_bills_approval_separation_of_duties; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bills_approval_separation_of_duties BEFORE UPDATE OF approved_by ON public.org_bills FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_approval_separation_of_duties();


--
-- Name: org_bills trg_bills_constituent_is_vendor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bills_constituent_is_vendor BEFORE INSERT OR UPDATE OF constituent_id ON public.org_bills FOR EACH ROW EXECUTE FUNCTION public.org_enforce_bill_constituent_is_vendor();


--
-- Name: org_expense_claims trg_expense_claims_no_self_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_claims_no_self_review BEFORE UPDATE OF approved_by, confirmed_by ON public.org_expense_claims FOR EACH ROW EXECUTE FUNCTION public.org_enforce_expense_claim_no_self_review();


--
-- Name: org_actuals trg_fy_lock_actuals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_actuals BEFORE INSERT OR DELETE OR UPDATE ON public.org_actuals FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_actuals();


--
-- Name: org_allocation_lines trg_fy_lock_allocation_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_allocation_lines BEFORE INSERT OR DELETE OR UPDATE ON public.org_allocation_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_alloc_child();


--
-- Name: org_allocation_monthly trg_fy_lock_allocation_monthly; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_allocation_monthly BEFORE INSERT OR DELETE OR UPDATE ON public.org_allocation_monthly FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_alloc_child();


--
-- Name: org_allocation_schedules trg_fy_lock_allocation_schedules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_allocation_schedules BEFORE INSERT OR DELETE OR UPDATE ON public.org_allocation_schedules FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_balance_sheet_snapshots trg_fy_lock_balance_sheet; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_balance_sheet BEFORE INSERT OR DELETE OR UPDATE ON public.org_balance_sheet_snapshots FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_balance_sheet();


--
-- Name: org_bill_credit_notes trg_fy_lock_bill_credit_notes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_bill_credit_notes BEFORE INSERT OR DELETE OR UPDATE ON public.org_bill_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_bill_lines trg_fy_lock_bill_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_bill_lines BEFORE INSERT OR DELETE OR UPDATE ON public.org_bill_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_bill_lines();


--
-- Name: org_bill_payments trg_fy_lock_bill_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_bill_payments BEFORE INSERT OR DELETE OR UPDATE ON public.org_bill_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_bills trg_fy_lock_bills; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_bills BEFORE INSERT OR DELETE OR UPDATE ON public.org_bills FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_budget_lines trg_fy_lock_budget_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_budget_lines BEFORE INSERT OR DELETE OR UPDATE ON public.org_budget_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_expense_claims trg_fy_lock_expense_claims; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_expense_claims BEFORE INSERT OR DELETE OR UPDATE ON public.org_expense_claims FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_grant_allocations trg_fy_lock_grant_allocations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_grant_allocations BEFORE INSERT OR DELETE OR UPDATE ON public.org_grant_allocations FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_invoice_credit_notes trg_fy_lock_invoice_credit_notes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_invoice_credit_notes BEFORE INSERT OR DELETE OR UPDATE ON public.org_invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_invoice_lines trg_fy_lock_invoice_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_invoice_lines BEFORE INSERT OR DELETE OR UPDATE ON public.org_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_invoice_lines();


--
-- Name: org_invoice_payments trg_fy_lock_invoice_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_invoice_payments BEFORE INSERT OR DELETE OR UPDATE ON public.org_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_invoices trg_fy_lock_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_invoices BEFORE INSERT OR DELETE OR UPDATE ON public.org_invoices FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_ledger_lines trg_fy_lock_ledger_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_ledger_lines BEFORE INSERT OR DELETE OR UPDATE ON public.org_ledger_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock_ledger_lines();


--
-- Name: org_ledger_transactions trg_fy_lock_ledger_transactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_ledger_transactions BEFORE INSERT OR DELETE OR UPDATE ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_personnel trg_fy_lock_personnel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_personnel BEFORE INSERT OR DELETE OR UPDATE ON public.org_personnel FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_projections trg_fy_lock_projections; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_projections BEFORE INSERT OR DELETE OR UPDATE ON public.org_projections FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_schedule_items trg_fy_lock_schedule_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fy_lock_schedule_items BEFORE INSERT OR DELETE OR UPDATE ON public.org_schedule_items FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();


--
-- Name: org_invoice_credit_notes trg_invoice_credit_notes_1_constituent_is_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_credit_notes_1_constituent_is_customer BEFORE INSERT OR UPDATE OF constituent_id ON public.org_invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_credit_note_constituent_is_customer();


--
-- Name: org_invoice_credit_notes trg_invoice_credit_notes_2_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_credit_notes_2_same_org BEFORE INSERT OR UPDATE ON public.org_invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_credit_notes_same_org();


--
-- Name: org_invoice_credit_notes trg_invoice_credit_notes_3_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_credit_notes_3_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_invoice_credit_notes();


--
-- Name: org_invoice_lines trg_invoice_lines_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_lines_1_same_org BEFORE INSERT OR UPDATE ON public.org_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_lines_same_org();


--
-- Name: org_invoice_lines trg_invoice_lines_2_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_lines_2_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_invoice_lines();


--
-- Name: org_invoice_payments trg_invoice_payments_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_payments_1_same_org BEFORE INSERT OR UPDATE ON public.org_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_payments_same_org();


--
-- Name: org_invoice_payments trg_invoice_payments_2_cash_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_payments_2_cash_account BEFORE INSERT OR UPDATE OF bank_account_id ON public.org_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_payments_cash_account();


--
-- Name: org_invoices trg_invoices_constituent_is_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_constituent_is_customer BEFORE INSERT OR UPDATE OF constituent_id ON public.org_invoices FOR EACH ROW EXECUTE FUNCTION public.org_enforce_invoice_constituent_is_customer();


--
-- Name: org_ledger_lines trg_ledger_lines_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_lines_1_same_org BEFORE INSERT OR UPDATE OF transaction_id, account_id, program_id, grant_id ON public.org_ledger_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_lines_same_org();


--
-- Name: org_ledger_lines trg_ledger_lines_2_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_lines_2_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_ledger_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_ledger_lines();


--
-- Name: org_ledger_lines trg_ledger_lines_recompute_actuals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_ledger_lines_recompute_actuals AFTER INSERT OR DELETE OR UPDATE ON public.org_ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.org_trigger_recompute_actuals_from_ledger_lines();


--
-- Name: org_ledger_transactions trg_ledger_transactions_approval_separation_of_duties; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_transactions_approval_separation_of_duties BEFORE UPDATE OF approved_by ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_approval_separation_of_duties();


--
-- Name: org_ledger_transactions trg_ledger_transactions_recompute_actuals_on_void; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_transactions_recompute_actuals_on_void AFTER UPDATE OF status ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_trigger_recompute_actuals_from_ledger_void();


--
-- Name: org_actuals trg_org_actuals_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_actuals_posting_account BEFORE INSERT OR UPDATE OF org_account_id ON public.org_actuals FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_actuals();


--
-- Name: org_actuals trg_org_actuals_writer_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_actuals_writer_guard BEFORE INSERT OR UPDATE OF source, org_id ON public.org_actuals FOR EACH ROW EXECUTE FUNCTION public.org_enforce_actuals_source_writer();


--
-- Name: org_budget_lines trg_org_budget_lines_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_budget_lines_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_budget_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_budget_lines();


--
-- Name: org_ledger_lines trg_org_ledger_lines_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_org_ledger_lines_balance AFTER INSERT OR DELETE OR UPDATE ON public.org_ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_transaction_balance();


--
-- Name: org_ledger_transactions trg_org_ledger_transactions_reversal_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_ledger_transactions_reversal_same_org BEFORE INSERT OR UPDATE OF reverses_transaction_id, org_id ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_reversal_same_org();


--
-- Name: org_settings trg_org_settings_recompute_actuals_on_source_flip; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_settings_recompute_actuals_on_source_flip AFTER UPDATE OF actuals_source ON public.org_settings FOR EACH ROW EXECUTE FUNCTION public.org_recompute_actuals_on_source_flip();


--
-- Name: org_plaid_accounts trg_plaid_accounts_1_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plaid_accounts_1_same_org BEFORE INSERT OR UPDATE ON public.org_plaid_accounts FOR EACH ROW EXECUTE FUNCTION public.org_enforce_plaid_accounts_same_org();


--
-- Name: org_constituents trigger_org_constituents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_org_constituents_updated_at BEFORE UPDATE ON public.org_constituents FOR EACH ROW EXECUTE FUNCTION public.update_org_constituents_updated_at();


--
-- Name: org_gifts trigger_org_gifts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_org_gifts_updated_at BEFORE UPDATE ON public.org_gifts FOR EACH ROW EXECUTE FUNCTION public.update_org_gifts_updated_at();


--
-- Name: org_members trigger_update_membership_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_membership_members_updated_at BEFORE UPDATE ON public.org_members FOR EACH ROW EXECUTE FUNCTION public.update_membership_members_updated_at();


--
-- Name: org_membership_tiers trigger_update_membership_tiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_membership_tiers_updated_at BEFORE UPDATE ON public.org_membership_tiers FOR EACH ROW EXECUTE FUNCTION public.update_membership_tiers_updated_at();


--
-- Name: actions actions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id);


--
-- Name: actions actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bank_pledges bank_pledges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pledges
    ADD CONSTRAINT bank_pledges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bank_pressure_actions bank_pressure_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_pressure_actions
    ADD CONSTRAINT bank_pressure_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: compliance_extension_proposals compliance_extension_proposals_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_extension_proposals
    ADD CONSTRAINT compliance_extension_proposals_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: compliance_extension_proposals compliance_extension_proposals_proposed_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_extension_proposals
    ADD CONSTRAINT compliance_extension_proposals_proposed_obligation_id_fkey FOREIGN KEY (proposed_obligation_id) REFERENCES public.org_compliance_obligations(id) ON DELETE CASCADE;


--
-- Name: contributions contributions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE SET NULL;


--
-- Name: contributions contributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: coop_members coop_members_causal_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members
    ADD CONSTRAINT coop_members_causal_org_id_fkey FOREIGN KEY (causal_org_id) REFERENCES public.orgs(id) ON DELETE SET NULL;


--
-- Name: coop_members coop_members_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coop_members
    ADD CONSTRAINT coop_members_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cooperative_library_submissions cooperative_library_submissions_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions
    ADD CONSTRAINT cooperative_library_submissions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cooperative_library_submissions cooperative_library_submissions_proposed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions
    ADD CONSTRAINT cooperative_library_submissions_proposed_by_user_id_fkey FOREIGN KEY (proposed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cooperative_library_submissions cooperative_library_submissions_source_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions
    ADD CONSTRAINT cooperative_library_submissions_source_coop_org_id_fkey FOREIGN KEY (source_org_id) REFERENCES public.coop_members(id) ON DELETE SET NULL;


--
-- Name: cooperative_library_submissions cooperative_library_submissions_target_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_library_submissions
    ADD CONSTRAINT cooperative_library_submissions_target_item_id_fkey FOREIGN KEY (target_item_id) REFERENCES public.cooperative_library_items(id) ON DELETE SET NULL;


--
-- Name: cooperative_work_library_items cooperative_work_library_items_contributed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_library_items
    ADD CONSTRAINT cooperative_work_library_items_contributed_by_user_id_fkey FOREIGN KEY (contributed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cooperative_work_library_items cooperative_work_library_items_source_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_library_items
    ADD CONSTRAINT cooperative_work_library_items_source_coop_org_id_fkey FOREIGN KEY (source_org_id) REFERENCES public.coop_members(id) ON DELETE SET NULL;


--
-- Name: cooperative_work_library_items cooperative_work_library_items_workshop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_library_items
    ADD CONSTRAINT cooperative_work_library_items_workshop_id_fkey FOREIGN KEY (workshop_id) REFERENCES public.workshop_projects(id) ON DELETE SET NULL;


--
-- Name: cooperative_work_requests cooperative_work_requests_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_work_requests
    ADD CONSTRAINT cooperative_work_requests_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: financial_rep_pledges financial_rep_pledges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_rep_pledges
    ADD CONSTRAINT financial_rep_pledges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inbound_debug_emails inbound_debug_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_debug_emails
    ADD CONSTRAINT inbound_debug_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: local_event_attendance local_event_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_event_attendance
    ADD CONSTRAINT local_event_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_accounts org_accounts_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts
    ADD CONSTRAINT org_accounts_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_accounts org_accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts
    ADD CONSTRAINT org_accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.org_accounts(id) ON DELETE RESTRICT;


--
-- Name: org_accounts org_accounts_rollup_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_accounts
    ADD CONSTRAINT org_accounts_rollup_parent_id_fkey FOREIGN KEY (rollup_parent_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_actuals org_actuals_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_actuals org_actuals_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_actuals org_actuals_org_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_org_account_id_fkey FOREIGN KEY (org_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_actuals org_actuals_org_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_org_activity_id_fkey FOREIGN KEY (org_activity_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_actuals org_actuals_org_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_actuals
    ADD CONSTRAINT org_actuals_org_program_id_fkey FOREIGN KEY (org_program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_aliases org_aliases_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_aliases
    ADD CONSTRAINT org_aliases_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;


--
-- Name: org_allocation_lines org_allocation_lines_coop_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines
    ADD CONSTRAINT org_allocation_lines_coop_account_id_fkey FOREIGN KEY (coop_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_allocation_lines org_allocation_lines_coop_allocation_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines
    ADD CONSTRAINT org_allocation_lines_coop_allocation_schedule_id_fkey FOREIGN KEY (coop_allocation_schedule_id) REFERENCES public.org_allocation_schedules(id) ON DELETE CASCADE;


--
-- Name: org_allocation_lines org_allocation_lines_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_lines
    ADD CONSTRAINT org_allocation_lines_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_allocation_monthly org_allocation_monthly_coop_allocation_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_monthly
    ADD CONSTRAINT org_allocation_monthly_coop_allocation_schedule_id_fkey FOREIGN KEY (coop_allocation_schedule_id) REFERENCES public.org_allocation_schedules(id) ON DELETE CASCADE;


--
-- Name: org_allocation_schedules org_allocation_schedules_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules
    ADD CONSTRAINT org_allocation_schedules_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_allocation_schedules org_allocation_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules
    ADD CONSTRAINT org_allocation_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_allocation_schedules org_allocation_schedules_source_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules
    ADD CONSTRAINT org_allocation_schedules_source_account_id_fkey FOREIGN KEY (source_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_allocation_schedules org_allocation_schedules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_allocation_schedules
    ADD CONSTRAINT org_allocation_schedules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: org_audit_log org_audit_log_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_audit_log
    ADD CONSTRAINT org_audit_log_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_balance_sheet_snapshots org_balance_sheet_snapshots_coop_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_balance_sheet_snapshots
    ADD CONSTRAINT org_balance_sheet_snapshots_coop_account_id_fkey FOREIGN KEY (coop_account_id) REFERENCES public.org_accounts(id) ON DELETE CASCADE;


--
-- Name: org_balance_sheet_snapshots org_balance_sheet_snapshots_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_balance_sheet_snapshots
    ADD CONSTRAINT org_balance_sheet_snapshots_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bank_rules org_bank_rules_action_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_account_id_fkey FOREIGN KEY (action_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bank_rules org_bank_rules_action_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_grant_id_fkey FOREIGN KEY (action_grant_id) REFERENCES public.org_grants(id);


--
-- Name: org_bank_rules org_bank_rules_action_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_program_id_fkey FOREIGN KEY (action_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_bank_rules org_bank_rules_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bank_rules org_bank_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_bank_rules org_bank_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bank_statement_line_postings org_bank_statement_line_postings_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_line_postings
    ADD CONSTRAINT org_bank_statement_line_postings_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_bank_statement_line_postings org_bank_statement_line_postings_statement_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_line_postings
    ADD CONSTRAINT org_bank_statement_line_postings_statement_line_id_fkey FOREIGN KEY (statement_line_id) REFERENCES public.org_bank_statement_lines(id) ON DELETE CASCADE;


--
-- Name: org_bank_statement_lines org_bank_statement_lines_applied_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_applied_rule_id_fkey FOREIGN KEY (applied_rule_id) REFERENCES public.org_bank_rules(id) ON DELETE SET NULL;


--
-- Name: org_bank_statement_lines org_bank_statement_lines_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bank_statement_lines org_bank_statement_lines_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_bank_statement_lines org_bank_statement_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bank_statement_lines org_bank_statement_lines_transfer_pair_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_statement_lines
    ADD CONSTRAINT org_bank_statement_lines_transfer_pair_line_id_fkey FOREIGN KEY (transfer_pair_line_id) REFERENCES public.org_bank_statement_lines(id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bill_credit_notes org_bill_credit_notes_original_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_original_bill_id_fkey FOREIGN KEY (original_bill_id) REFERENCES public.org_bills(id);


--
-- Name: org_bill_credit_notes org_bill_credit_notes_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_credit_notes
    ADD CONSTRAINT org_bill_credit_notes_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_bill_lines org_bill_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines
    ADD CONSTRAINT org_bill_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bill_lines org_bill_lines_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines
    ADD CONSTRAINT org_bill_lines_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.org_bills(id) ON DELETE CASCADE;


--
-- Name: org_bill_lines org_bill_lines_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines
    ADD CONSTRAINT org_bill_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id);


--
-- Name: org_bill_lines org_bill_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_lines
    ADD CONSTRAINT org_bill_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_bill_payments org_bill_payments_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments
    ADD CONSTRAINT org_bill_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bill_payments org_bill_payments_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments
    ADD CONSTRAINT org_bill_payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.org_bills(id);


--
-- Name: org_bill_payments org_bill_payments_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments
    ADD CONSTRAINT org_bill_payments_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_bill_payments org_bill_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bill_payments
    ADD CONSTRAINT org_bill_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bills org_bills_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bills
    ADD CONSTRAINT org_bills_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id);


--
-- Name: org_bills org_bills_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bills
    ADD CONSTRAINT org_bills_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_bills org_bills_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bills
    ADD CONSTRAINT org_bills_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_board_designations org_board_designations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_board_designations
    ADD CONSTRAINT org_board_designations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_board_designations org_board_designations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_board_designations
    ADD CONSTRAINT org_board_designations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_budget_lines org_budget_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id) ON DELETE CASCADE;


--
-- Name: org_budget_lines org_budget_lines_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_budget_lines org_budget_lines_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_budget_lines org_budget_lines_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_budget_lines org_budget_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_lines
    ADD CONSTRAINT org_budget_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


--
-- Name: org_compliance_obligations org_compliance_obligations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_compliance_obligations
    ADD CONSTRAINT org_compliance_obligations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_compliance_obligations org_compliance_obligations_template_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_compliance_obligations
    ADD CONSTRAINT org_compliance_obligations_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES public.compliance_template_items(id) ON DELETE SET NULL;


--
-- Name: org_constituent_interactions org_constituent_interactions_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions
    ADD CONSTRAINT org_constituent_interactions_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_constituent_interactions org_constituent_interactions_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions
    ADD CONSTRAINT org_constituent_interactions_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_constituent_interactions org_constituent_interactions_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions
    ADD CONSTRAINT org_constituent_interactions_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_constituent_interactions org_constituent_interactions_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituent_interactions
    ADD CONSTRAINT org_constituent_interactions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_constituents org_constituents_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_constituents
    ADD CONSTRAINT org_constituents_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_document_expectations org_document_expectations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations
    ADD CONSTRAINT org_document_expectations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_documents org_documents_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_documents org_documents_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_documents org_documents_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.org_compliance_obligations(id) ON DELETE SET NULL;


--
-- Name: org_documents org_documents_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE SET NULL;


--
-- Name: org_documents org_documents_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_documents org_documents_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_donation_url_suggestions org_donation_url_suggestions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_donation_url_suggestions
    ADD CONSTRAINT org_donation_url_suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;


--
-- Name: org_donation_url_suggestions org_donation_url_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_donation_url_suggestions
    ADD CONSTRAINT org_donation_url_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_expense_claim_lines org_expense_claim_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_expense_claim_lines org_expense_claim_lines_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.org_expense_claims(id) ON DELETE CASCADE;


--
-- Name: org_expense_claim_lines org_expense_claim_lines_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id);


--
-- Name: org_expense_claim_lines org_expense_claim_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_expense_claim_messages org_expense_claim_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_messages
    ADD CONSTRAINT org_expense_claim_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);


--
-- Name: org_expense_claim_messages org_expense_claim_messages_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_messages
    ADD CONSTRAINT org_expense_claim_messages_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.org_expense_claims(id) ON DELETE CASCADE;


--
-- Name: org_expense_claim_payments org_expense_claim_payments_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_expense_claim_payments org_expense_claim_payments_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.org_expense_claims(id);


--
-- Name: org_expense_claim_payments org_expense_claim_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_expense_claim_payments org_expense_claim_payments_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_expense_claim_payments org_expense_claim_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_expense_claims org_expense_claims_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: org_expense_claims org_expense_claims_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_expense_claims org_expense_claims_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id);


--
-- Name: org_expense_claims org_expense_claims_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_expense_claims org_expense_claims_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_expense_claims org_expense_claims_payment_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_payment_ledger_transaction_id_fkey FOREIGN KEY (payment_ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_expense_claims org_expense_claims_receipt_affidavit_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_receipt_affidavit_by_fkey FOREIGN KEY (receipt_affidavit_by) REFERENCES public.users(id);


--
-- Name: org_expense_claims org_expense_claims_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_locked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks
    ADD CONSTRAINT org_fiscal_year_locks_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks
    ADD CONSTRAINT org_fiscal_year_locks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_reopened_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fiscal_year_locks
    ADD CONSTRAINT org_fiscal_year_locks_reopened_by_user_id_fkey FOREIGN KEY (reopened_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depr_entries_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_asset_id_fkey FOREIGN KEY (fixed_asset_id) REFERENCES public.org_fixed_assets(id) ON DELETE CASCADE;


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depr_entries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depr_entries_txn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_fixed_assets org_fixed_assets_accum_depr_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_accum_depr_account_id_fkey FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fixed_assets org_fixed_assets_asset_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_asset_account_id_fkey FOREIGN KEY (asset_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fixed_assets org_fixed_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_fixed_assets org_fixed_assets_depr_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_depr_expense_account_id_fkey FOREIGN KEY (depreciation_expense_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fixed_assets org_fixed_assets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_fixed_assets org_fixed_assets_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_fringe_settings org_fringe_settings_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_fringe_settings org_fringe_settings_dental_vision_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_dental_vision_account_id_fkey FOREIGN KEY (dental_vision_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_disability_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_disability_account_id_fkey FOREIGN KEY (disability_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_fica_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_fica_account_id_fkey FOREIGN KEY (fica_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_health_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_health_account_id_fkey FOREIGN KEY (health_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_other_fringe_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_other_fringe_account_id_fkey FOREIGN KEY (other_fringe_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_retirement_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_retirement_account_id_fkey FOREIGN KEY (retirement_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_suta_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_suta_account_id_fkey FOREIGN KEY (suta_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_fringe_settings org_fringe_settings_workers_comp_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fringe_settings
    ADD CONSTRAINT org_fringe_settings_workers_comp_account_id_fkey FOREIGN KEY (workers_comp_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_functional_classifications org_functional_classifications_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_functional_classifications
    ADD CONSTRAINT org_functional_classifications_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id) ON DELETE CASCADE;


--
-- Name: org_functional_classifications org_functional_classifications_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_functional_classifications
    ADD CONSTRAINT org_functional_classifications_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_gifts org_gifts_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_gifts org_gifts_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_soft_credit_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_soft_credit_constituent_id_fkey FOREIGN KEY (soft_credit_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE SET NULL;


--
-- Name: org_grant_allocations org_grant_allocations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations
    ADD CONSTRAINT org_grant_allocations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_grant_allocations org_grant_allocations_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations
    ADD CONSTRAINT org_grant_allocations_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


--
-- Name: org_grant_allocations org_grant_allocations_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations
    ADD CONSTRAINT org_grant_allocations_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE CASCADE;


--
-- Name: org_grants org_grants_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_grants org_grants_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_grants org_grants_primary_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_primary_program_id_fkey FOREIGN KEY (primary_program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_grants org_grants_revenue_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_revenue_account_id_fkey FOREIGN KEY (revenue_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_import_history org_import_history_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_import_history
    ADD CONSTRAINT org_import_history_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id);


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_original_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES public.org_invoices(id);


--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_credit_notes
    ADD CONSTRAINT org_invoice_credit_notes_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_invoice_lines org_invoice_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_lines
    ADD CONSTRAINT org_invoice_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_invoice_lines org_invoice_lines_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_lines
    ADD CONSTRAINT org_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.org_invoices(id) ON DELETE CASCADE;


--
-- Name: org_invoice_lines org_invoice_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_lines
    ADD CONSTRAINT org_invoice_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_invoice_payments org_invoice_payments_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments
    ADD CONSTRAINT org_invoice_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_invoice_payments org_invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments
    ADD CONSTRAINT org_invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.org_invoices(id);


--
-- Name: org_invoice_payments org_invoice_payments_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments
    ADD CONSTRAINT org_invoice_payments_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_invoice_payments org_invoice_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoice_payments
    ADD CONSTRAINT org_invoice_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_invoices org_invoices_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices
    ADD CONSTRAINT org_invoices_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id);


--
-- Name: org_invoices org_invoices_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices
    ADD CONSTRAINT org_invoices_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_invoices org_invoices_membership_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices
    ADD CONSTRAINT org_invoices_membership_payment_id_fkey FOREIGN KEY (membership_payment_id) REFERENCES public.org_membership_payments(id);


--
-- Name: org_invoices org_invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invoices
    ADD CONSTRAINT org_invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_ledger_approval_policies org_ledger_approval_policies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_approval_policies
    ADD CONSTRAINT org_ledger_approval_policies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_ledger_approval_policies org_ledger_approval_policies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_approval_policies
    ADD CONSTRAINT org_ledger_approval_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_ledger_lines org_ledger_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_ledger_lines org_ledger_lines_board_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_board_designation_id_fkey FOREIGN KEY (board_designation_id) REFERENCES public.org_board_designations(id);


--
-- Name: org_ledger_lines org_ledger_lines_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id);


--
-- Name: org_ledger_lines org_ledger_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_ledger_lines org_ledger_lines_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_lines
    ADD CONSTRAINT org_ledger_lines_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.org_ledger_transactions(id) ON DELETE CASCADE;


--
-- Name: org_ledger_transactions org_ledger_transactions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_ledger_transactions org_ledger_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_ledger_transactions org_ledger_transactions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_ledger_transactions org_ledger_transactions_reverses_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_reverses_transaction_id_fkey FOREIGN KEY (reverses_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_ledger_transactions org_ledger_transactions_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_members org_members_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_cooperative_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_cooperative_user_id_fkey FOREIGN KEY (cooperative_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_members org_members_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.org_membership_tiers(id) ON DELETE SET NULL;


--
-- Name: org_membership_payments org_membership_payments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.org_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_payments org_membership_payments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_reminders org_membership_reminders_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_reminders
    ADD CONSTRAINT org_membership_reminders_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.org_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_tiers org_membership_tiers_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_personnel_allocations org_personnel_allocations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations
    ADD CONSTRAINT org_personnel_allocations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_personnel_allocations org_personnel_allocations_coop_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations
    ADD CONSTRAINT org_personnel_allocations_coop_personnel_id_fkey FOREIGN KEY (coop_personnel_id) REFERENCES public.org_personnel(id) ON DELETE CASCADE;


--
-- Name: org_personnel_allocations org_personnel_allocations_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_allocations
    ADD CONSTRAINT org_personnel_allocations_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_personnel_changes org_personnel_changes_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_changes
    ADD CONSTRAINT org_personnel_changes_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_personnel_changes org_personnel_changes_coop_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_changes
    ADD CONSTRAINT org_personnel_changes_coop_personnel_id_fkey FOREIGN KEY (coop_personnel_id) REFERENCES public.org_personnel(id) ON DELETE SET NULL;


--
-- Name: org_personnel_changes org_personnel_changes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel_changes
    ADD CONSTRAINT org_personnel_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_personnel org_personnel_contractor_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_contractor_account_id_fkey FOREIGN KEY (contractor_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_personnel org_personnel_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_personnel org_personnel_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_personnel org_personnel_salary_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_salary_account_id_fkey FOREIGN KEY (salary_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_personnel org_personnel_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: org_plaid_accounts org_plaid_accounts_org_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts
    ADD CONSTRAINT org_plaid_accounts_org_account_id_fkey FOREIGN KEY (org_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_plaid_accounts org_plaid_accounts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts
    ADD CONSTRAINT org_plaid_accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_plaid_accounts org_plaid_accounts_plaid_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_accounts
    ADD CONSTRAINT org_plaid_accounts_plaid_item_id_fkey FOREIGN KEY (plaid_item_id) REFERENCES public.org_plaid_items(id) ON DELETE CASCADE;


--
-- Name: org_plaid_items org_plaid_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_plaid_items
    ADD CONSTRAINT org_plaid_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_pod_credentials org_pod_credentials_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pod_credentials
    ADD CONSTRAINT org_pod_credentials_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_programs org_programs_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_programs
    ADD CONSTRAINT org_programs_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_programs org_programs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_programs
    ADD CONSTRAINT org_programs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.org_programs(id) ON DELETE RESTRICT;


--
-- Name: org_projections org_projections_coop_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_coop_account_id_fkey FOREIGN KEY (coop_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_projections org_projections_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_projections org_projections_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_projections org_projections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_projections org_projections_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections
    ADD CONSTRAINT org_projections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: org_recurring_schedules org_recurring_schedules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_recurring_schedules
    ADD CONSTRAINT org_recurring_schedules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations
    ADD CONSTRAINT org_schedule_item_allocations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations
    ADD CONSTRAINT org_schedule_item_allocations_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_coop_schedule_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_item_allocations
    ADD CONSTRAINT org_schedule_item_allocations_coop_schedule_item_id_fkey FOREIGN KEY (coop_schedule_item_id) REFERENCES public.org_schedule_items(id) ON DELETE CASCADE;


--
-- Name: org_schedule_items org_schedule_items_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_schedule_items org_schedule_items_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_schedule_items org_schedule_items_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_schedule_items org_schedule_items_named_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_named_schedule_id_fkey FOREIGN KEY (named_schedule_id) REFERENCES public.org_schedules(id) ON DELETE CASCADE;


--
-- Name: org_schedule_items org_schedule_items_origin_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_origin_item_id_fkey FOREIGN KEY (origin_item_id) REFERENCES public.org_schedule_items(id) ON DELETE SET NULL;


--
-- Name: org_schedule_items org_schedule_items_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_schedules org_schedules_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedules
    ADD CONSTRAINT org_schedules_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_settings org_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_projects org_sponsored_projects_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_projects org_sponsored_projects_sponsor_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_sponsor_coop_org_id_fkey FOREIGN KEY (sponsor_org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_suggestions org_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_suggestions
    ADD CONSTRAINT org_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_tasks org_tasks_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_tasks
    ADD CONSTRAINT org_tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_tasks org_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_tasks
    ADD CONSTRAINT org_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_tasks org_tasks_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_tasks
    ADD CONSTRAINT org_tasks_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_users org_users_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_users org_users_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_users org_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_vendor_compliance org_vendor_compliance_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_vendor_compliance
    ADD CONSTRAINT org_vendor_compliance_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_vendor_compliance org_vendor_compliance_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_vendor_compliance
    ADD CONSTRAINT org_vendor_compliance_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_xero_program_track_map org_xero_program_track_map_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_xero_program_track_map
    ADD CONSTRAINT org_xero_program_track_map_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_xero_program_track_map org_xero_program_track_map_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_xero_program_track_map
    ADD CONSTRAINT org_xero_program_track_map_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


--
-- Name: orgs orgs_added_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_views page_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pending_confirmations pending_confirmations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_confirmations
    ADD CONSTRAINT pending_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pod_access_group_members pod_access_group_members_added_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members
    ADD CONSTRAINT pod_access_group_members_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pod_access_group_members pod_access_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members
    ADD CONSTRAINT pod_access_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.pod_access_groups(id) ON DELETE CASCADE;


--
-- Name: pod_access_group_members pod_access_group_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_members
    ADD CONSTRAINT pod_access_group_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: pod_access_group_rules pod_access_group_rules_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pod_access_group_rules pod_access_group_rules_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.pod_access_groups(id) ON DELETE CASCADE;


--
-- Name: pod_access_group_rules pod_access_group_rules_org_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_org_document_id_fkey FOREIGN KEY (org_document_id) REFERENCES public.org_documents(id) ON DELETE CASCADE;


--
-- Name: pod_access_group_rules pod_access_group_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_group_rules
    ADD CONSTRAINT pod_access_group_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: pod_access_groups pod_access_groups_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_groups
    ADD CONSTRAINT pod_access_groups_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pod_access_groups pod_access_groups_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_groups
    ADD CONSTRAINT pod_access_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: pod_access_permissions pod_access_permissions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions
    ADD CONSTRAINT pod_access_permissions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pod_access_permissions pod_access_permissions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions
    ADD CONSTRAINT pod_access_permissions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.pod_access_groups(id) ON DELETE SET NULL;


--
-- Name: pod_access_permissions pod_access_permissions_org_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions
    ADD CONSTRAINT pod_access_permissions_org_document_id_fkey FOREIGN KEY (org_document_id) REFERENCES public.org_documents(id) ON DELETE CASCADE;


--
-- Name: pod_access_permissions pod_access_permissions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_access_permissions
    ADD CONSTRAINT pod_access_permissions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: pod_acr_outbox pod_acr_outbox_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_acr_outbox
    ADD CONSTRAINT pod_acr_outbox_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_actions user_actions_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.actions(id) ON DELETE CASCADE;


--
-- Name: user_actions user_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_contributed_orgs user_contributed_orgs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contributed_orgs
    ADD CONSTRAINT user_contributed_orgs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_inbound_emails user_inbound_emails_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inbound_emails
    ADD CONSTRAINT user_inbound_emails_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.actions(id) ON DELETE SET NULL;


--
-- Name: user_inbound_emails user_inbound_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inbound_emails
    ADD CONSTRAINT user_inbound_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_org_petition_signatures user_org_petition_signatures_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_petition_signatures
    ADD CONSTRAINT user_org_petition_signatures_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;


--
-- Name: user_org_petition_signatures user_org_petition_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_petition_signatures
    ADD CONSTRAINT user_org_petition_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_org_preferences user_org_preferences_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id);


--
-- Name: user_org_preferences user_org_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_org_setup_presets user_org_setup_presets_source_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_setup_presets
    ADD CONSTRAINT user_org_setup_presets_source_coop_org_id_fkey FOREIGN KEY (source_org_id) REFERENCES public.coop_members(id) ON DELETE SET NULL;


--
-- Name: user_org_setup_presets user_org_setup_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_org_setup_presets
    ADD CONSTRAINT user_org_setup_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_rep_contact_actions user_rep_contact_actions_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions
    ADD CONSTRAINT user_rep_contact_actions_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.actions(id) ON DELETE CASCADE;


--
-- Name: user_rep_contact_actions user_rep_contact_actions_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions
    ADD CONSTRAINT user_rep_contact_actions_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES public.representatives(id) ON DELETE CASCADE;


--
-- Name: user_rep_contact_actions user_rep_contact_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rep_contact_actions
    ADD CONSTRAINT user_rep_contact_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_representatives user_representatives_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_representatives
    ADD CONSTRAINT user_representatives_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES public.representatives(id) ON DELETE CASCADE;


--
-- Name: user_representatives user_representatives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_representatives
    ADD CONSTRAINT user_representatives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: volunteer_opportunities volunteer_opportunities_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_opportunities
    ADD CONSTRAINT volunteer_opportunities_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watch_contributions watch_contributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_contributions
    ADD CONSTRAINT watch_contributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workshop_civic_links workshop_civic_links_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_civic_links
    ADD CONSTRAINT workshop_civic_links_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.workshop_workspaces(id) ON DELETE CASCADE;


--
-- Name: workshop_documents workshop_documents_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents
    ADD CONSTRAINT workshop_documents_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_documents workshop_documents_previous_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents
    ADD CONSTRAINT workshop_documents_previous_version_id_fkey FOREIGN KEY (previous_version_id) REFERENCES public.workshop_documents(id) ON DELETE SET NULL;


--
-- Name: workshop_documents workshop_documents_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents
    ADD CONSTRAINT workshop_documents_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_documents workshop_documents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_documents
    ADD CONSTRAINT workshop_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workshop_workspaces(id) ON DELETE CASCADE;


--
-- Name: workshop_interventions workshop_interventions_proposed_by_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_interventions
    ADD CONSTRAINT workshop_interventions_proposed_by_member_id_fkey FOREIGN KEY (proposed_by_member_id) REFERENCES public.workshop_space_members(id) ON DELETE SET NULL;


--
-- Name: workshop_interventions workshop_interventions_target_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_interventions
    ADD CONSTRAINT workshop_interventions_target_action_id_fkey FOREIGN KEY (target_action_id) REFERENCES public.actions(id) ON DELETE SET NULL;


--
-- Name: workshop_interventions workshop_interventions_workshop_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_interventions
    ADD CONSTRAINT workshop_interventions_workshop_project_id_fkey FOREIGN KEY (workshop_project_id) REFERENCES public.workshop_projects(id) ON DELETE CASCADE;


--
-- Name: workshop_messages workshop_messages_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_messages
    ADD CONSTRAINT workshop_messages_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_messages workshop_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_messages
    ADD CONSTRAINT workshop_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.workshop_threads(id) ON DELETE CASCADE;


--
-- Name: workshop_proposals workshop_proposals_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals
    ADD CONSTRAINT workshop_proposals_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_proposals workshop_proposals_proposed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals
    ADD CONSTRAINT workshop_proposals_proposed_by_user_id_fkey FOREIGN KEY (proposed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_proposals workshop_proposals_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals
    ADD CONSTRAINT workshop_proposals_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.workshop_workspaces(id) ON DELETE CASCADE;


--
-- Name: workshop_proposals workshop_proposals_superseded_by_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_proposals
    ADD CONSTRAINT workshop_proposals_superseded_by_proposal_id_fkey FOREIGN KEY (superseded_by_proposal_id) REFERENCES public.workshop_proposals(id) ON DELETE SET NULL;


--
-- Name: workshop_space_members workshop_space_members_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members
    ADD CONSTRAINT workshop_space_members_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE SET NULL;


--
-- Name: workshop_space_members workshop_space_members_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members
    ADD CONSTRAINT workshop_space_members_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.workshop_workspaces(id) ON DELETE CASCADE;


--
-- Name: workshop_space_members workshop_space_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_space_members
    ADD CONSTRAINT workshop_space_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workshop_threads workshop_threads_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_threads
    ADD CONSTRAINT workshop_threads_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workshop_threads workshop_threads_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_threads
    ADD CONSTRAINT workshop_threads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workshop_workspaces(id) ON DELETE CASCADE;


--
-- Name: workshop_workspaces workshop_workspaces_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workshop_workspaces
    ADD CONSTRAINT workshop_workspaces_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.workshop_projects(id) ON DELETE CASCADE;


--
-- Name: org_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_accounts org_accounts_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_accounts_org_isolation ON public.org_accounts USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_actuals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_actuals ENABLE ROW LEVEL SECURITY;

--
-- Name: org_actuals org_actuals_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_actuals_org_isolation ON public.org_actuals USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_allocation_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_allocation_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_allocation_lines org_allocation_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_allocation_lines_org_isolation ON public.org_allocation_lines USING ((EXISTS ( SELECT 1
   FROM public.org_allocation_schedules s
  WHERE ((s.id = org_allocation_lines.coop_allocation_schedule_id) AND (s.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_allocation_monthly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_allocation_monthly ENABLE ROW LEVEL SECURITY;

--
-- Name: org_allocation_monthly org_allocation_monthly_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_allocation_monthly_org_isolation ON public.org_allocation_monthly USING ((EXISTS ( SELECT 1
   FROM public.org_allocation_schedules s
  WHERE ((s.id = org_allocation_monthly.coop_allocation_schedule_id) AND (s.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_allocation_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_allocation_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_allocation_schedules org_allocation_schedules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_allocation_schedules_org_isolation ON public.org_allocation_schedules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: org_audit_log org_audit_log_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_audit_log_org_isolation ON public.org_audit_log USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_balance_sheet_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_balance_sheet_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: org_balance_sheet_snapshots org_balance_sheet_snapshots_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_balance_sheet_snapshots_org_isolation ON public.org_balance_sheet_snapshots USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bank_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bank_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bank_rules org_bank_rules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_rules_org_isolation ON public.org_bank_rules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bank_statement_line_postings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bank_statement_line_postings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bank_statement_line_postings org_bank_statement_line_postings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_statement_line_postings_org_isolation ON public.org_bank_statement_line_postings USING ((EXISTS ( SELECT 1
   FROM public.org_bank_statement_lines l
  WHERE ((l.id = org_bank_statement_line_postings.statement_line_id) AND (l.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_bank_statement_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bank_statement_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bank_statement_lines org_bank_statement_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_statement_lines_org_isolation ON public.org_bank_statement_lines USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bill_credit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bill_credit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bill_credit_notes org_bill_credit_notes_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bill_credit_notes_org_isolation ON public.org_bill_credit_notes USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bill_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bill_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bill_lines org_bill_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bill_lines_org_isolation ON public.org_bill_lines USING ((EXISTS ( SELECT 1
   FROM public.org_bills b
  WHERE ((b.id = org_bill_lines.bill_id) AND (b.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_bill_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bill_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bill_payments org_bill_payments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bill_payments_org_isolation ON public.org_bill_payments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bills ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bills org_bills_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bills_org_isolation ON public.org_bills USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_board_designations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_board_designations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_board_designations org_board_designations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_board_designations_org_isolation ON public.org_board_designations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_budget_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_budget_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_budget_lines org_budget_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_budget_lines_org_isolation ON public.org_budget_lines USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_compliance_obligations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_compliance_obligations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_constituent_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_constituent_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: org_constituent_interactions org_constituent_interactions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_constituent_interactions_org_isolation ON public.org_constituent_interactions USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_constituents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_constituents ENABLE ROW LEVEL SECURITY;

--
-- Name: org_constituents org_constituents_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_constituents_org_isolation ON public.org_constituents USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: org_documents org_documents_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_documents_org_isolation ON public.org_documents USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_expense_claim_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_expense_claim_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_expense_claim_lines org_expense_claim_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_expense_claim_lines_org_isolation ON public.org_expense_claim_lines USING ((EXISTS ( SELECT 1
   FROM public.org_expense_claims c
  WHERE ((c.id = org_expense_claim_lines.claim_id) AND (c.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_expense_claim_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_expense_claim_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: org_expense_claim_messages org_expense_claim_messages_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_expense_claim_messages_org_isolation ON public.org_expense_claim_messages USING ((EXISTS ( SELECT 1
   FROM public.org_expense_claims c
  WHERE ((c.id = org_expense_claim_messages.claim_id) AND (c.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_expense_claim_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_expense_claim_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_expense_claim_payments org_expense_claim_payments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_expense_claim_payments_org_isolation ON public.org_expense_claim_payments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_expense_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_expense_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: org_expense_claims org_expense_claims_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_expense_claims_org_isolation ON public.org_expense_claims USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_fiscal_year_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_fiscal_year_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: org_fiscal_year_locks org_fiscal_year_locks_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_fiscal_year_locks_org_isolation ON public.org_fiscal_year_locks USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_fixed_asset_depreciation_entries org_fixed_asset_depr_entries_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_fixed_asset_depr_entries_org_isolation ON public.org_fixed_asset_depreciation_entries USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_fixed_asset_depreciation_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_fixed_asset_depreciation_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: org_fixed_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_fixed_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: org_fixed_assets org_fixed_assets_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_fixed_assets_org_isolation ON public.org_fixed_assets USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_fringe_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_fringe_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_fringe_settings org_fringe_settings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_fringe_settings_org_isolation ON public.org_fringe_settings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_functional_classifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_functional_classifications ENABLE ROW LEVEL SECURITY;

--
-- Name: org_functional_classifications org_functional_classifications_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_functional_classifications_org_isolation ON public.org_functional_classifications USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_gifts org_gifts_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_gifts_org_isolation ON public.org_gifts USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_grant_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_grant_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_grant_allocations org_grant_allocations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grant_allocations_org_isolation ON public.org_grant_allocations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: org_grants org_grants_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grants_org_isolation ON public.org_grants USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_import_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_import_history ENABLE ROW LEVEL SECURITY;

--
-- Name: org_import_history org_import_history_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_import_history_org_isolation ON public.org_import_history USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invoice_credit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invoice_credit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invoice_credit_notes org_invoice_credit_notes_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoice_credit_notes_org_isolation ON public.org_invoice_credit_notes USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_invoice_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invoice_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invoice_lines org_invoice_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoice_lines_org_isolation ON public.org_invoice_lines USING ((EXISTS ( SELECT 1
   FROM public.org_invoices i
  WHERE ((i.id = org_invoice_lines.invoice_id) AND (i.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_invoice_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invoice_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invoice_payments org_invoice_payments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoice_payments_org_isolation ON public.org_invoice_payments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invoices org_invoices_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoices_org_isolation ON public.org_invoices USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_ledger_approval_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ledger_approval_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: org_ledger_approval_policies org_ledger_approval_policies_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_ledger_approval_policies_org_isolation ON public.org_ledger_approval_policies USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_ledger_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ledger_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_ledger_lines org_ledger_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_ledger_lines_org_isolation ON public.org_ledger_lines USING ((EXISTS ( SELECT 1
   FROM public.org_ledger_transactions t
  WHERE ((t.id = org_ledger_lines.transaction_id) AND (t.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_ledger_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ledger_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: org_ledger_transactions org_ledger_transactions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_ledger_transactions_org_isolation ON public.org_ledger_transactions USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: org_compliance_obligations org_org_compliance_obligations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_compliance_obligations_org_isolation ON public.org_compliance_obligations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_invites org_org_invites_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_invites_org_isolation ON public.org_invites USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_members org_org_members_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_members_org_isolation ON public.org_members USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_payments org_org_membership_payments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_membership_payments_org_isolation ON public.org_membership_payments USING ((EXISTS ( SELECT 1
   FROM public.org_members m
  WHERE ((m.id = org_membership_payments.member_id) AND (m.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_membership_reminders org_org_membership_reminders_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_membership_reminders_org_isolation ON public.org_membership_reminders USING ((EXISTS ( SELECT 1
   FROM public.org_members m
  WHERE ((m.id = org_membership_reminders.member_id) AND (m.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)))));


--
-- Name: org_membership_tiers org_org_membership_tiers_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_membership_tiers_org_isolation ON public.org_membership_tiers USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_personnel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_personnel ENABLE ROW LEVEL SECURITY;

--
-- Name: org_personnel_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_personnel_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_personnel_allocations org_personnel_allocations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_allocations_org_isolation ON public.org_personnel_allocations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_personnel_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_personnel_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_personnel_changes org_personnel_changes_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_changes_org_isolation ON public.org_personnel_changes USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_personnel org_personnel_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_org_isolation ON public.org_personnel USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_plaid_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_plaid_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_plaid_accounts org_plaid_accounts_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_plaid_accounts_org_isolation ON public.org_plaid_accounts USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_plaid_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_plaid_items ENABLE ROW LEVEL SECURITY;

--
-- Name: org_plaid_items org_plaid_items_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_plaid_items_org_isolation ON public.org_plaid_items USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_pod_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_pod_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: org_pod_credentials org_pod_credentials_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_pod_credentials_org_isolation ON public.org_pod_credentials USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: org_programs org_programs_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_programs_org_isolation ON public.org_programs USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_projections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_projections ENABLE ROW LEVEL SECURITY;

--
-- Name: org_projections org_projections_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_projections_org_isolation ON public.org_projections USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_recurring_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_recurring_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_recurring_schedules org_recurring_schedules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_recurring_schedules_org_isolation ON public.org_recurring_schedules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_schedule_item_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_schedule_item_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_schedule_item_allocations org_schedule_item_allocations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedule_item_allocations_org_isolation ON public.org_schedule_item_allocations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_schedule_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_schedule_items ENABLE ROW LEVEL SECURITY;

--
-- Name: org_schedule_items org_schedule_items_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedule_items_org_isolation ON public.org_schedule_items USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_schedules org_schedules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedules_org_isolation ON public.org_schedules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_settings org_settings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_settings_org_isolation ON public.org_settings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsored_project_disbursements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsored_project_disbursements ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsored_project_disbursements_org_isolation ON public.org_sponsored_project_disbursements USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsored_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsored_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsored_projects org_sponsored_projects_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsored_projects_org_isolation ON public.org_sponsored_projects USING ((sponsor_org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: org_tasks org_tasks_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_tasks_org_isolation ON public.org_tasks USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_users ENABLE ROW LEVEL SECURITY;

--
-- Name: org_users org_users_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_users_org_isolation ON public.org_users USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_users org_users_self_visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_users_self_visibility ON public.org_users FOR SELECT USING ((user_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::integer));


--
-- Name: org_vendor_compliance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_vendor_compliance ENABLE ROW LEVEL SECURITY;

--
-- Name: org_vendor_compliance org_vendor_compliance_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_vendor_compliance_org_isolation ON public.org_vendor_compliance USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_xero_program_track_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_xero_program_track_map ENABLE ROW LEVEL SECURITY;

--
-- Name: org_xero_program_track_map org_xero_program_track_map_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_xero_program_track_map_org_isolation ON public.org_xero_program_track_map USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: pod_access_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_access_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_access_group_members pod_access_group_members_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_access_group_members_org_isolation ON public.pod_access_group_members USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: pod_access_group_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_access_group_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_access_group_rules pod_access_group_rules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_access_group_rules_org_isolation ON public.pod_access_group_rules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: pod_access_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_access_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_access_groups pod_access_groups_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_access_groups_org_isolation ON public.pod_access_groups USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: pod_access_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_access_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_access_permissions pod_access_permissions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_access_permissions_org_isolation ON public.pod_access_permissions USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: pod_acr_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_acr_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_acr_outbox pod_acr_outbox_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_acr_outbox_org_isolation ON public.pod_acr_outbox USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- PostgreSQL database dump complete
--

\unrestrict tEvUxAsPU4pcgG8xmf1wVpcNdJw7YYTSjbm2ox78dcoZTVu7q6cazR7gyPAvdAI

