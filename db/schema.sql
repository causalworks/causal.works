-- Includes migrations through 374
--
-- PostgreSQL database dump
--

\restrict 3JqqRjTUdvDEBWCAIr5T9tL5g9raRnjcJCe1vbyWXjtuRVE3Zaj7FqK4PPhrYBO

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
    'expense_receipt',
    'procurement_solicitation',
    'saved_report'
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
    'admins_only',
    'dues_members'
);


--
-- Name: org_indirect_cost_base; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_indirect_cost_base AS ENUM (
    'mtdc',
    'total_direct_costs',
    'salaries_wages'
);


--
-- Name: org_indirect_cost_rate_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_indirect_cost_rate_type AS ENUM (
    'none',
    'de_minimis',
    'negotiated'
);


--
-- Name: org_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_member_role AS ENUM (
    'admin',
    'staff',
    'board',
    'finance',
    'program',
    'fundraising'
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
-- Name: accounting_entry_reminders_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accounting_entry_reminders_due() RETURNS TABLE(org_user_id integer, org_id integer, org_slug text, org_name text, email text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH due AS (
    UPDATE org_users ou SET accounting_entry_reminded_at = now()
      FROM coop_members o, users u
     WHERE o.id = ou.org_id AND u.id = ou.user_id AND o.deleted_at IS NULL
       AND ou.role = 'admin' AND ou.accounting_entry_enabled
       AND ou.accounting_entry_enabled_at <= now() - interval '30 days'
       AND (ou.accounting_entry_reminded_at IS NULL OR ou.accounting_entry_reminded_at < ou.accounting_entry_enabled_at)
    RETURNING ou.id, ou.org_id, o.slug, o.display_name, u.email
  )
  SELECT id, org_id, slug, display_name, email FROM due;
$$;


--
-- Name: admin_delete_org(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_org(p_org_id integer) RETURNS TABLE(id integer, slug text, display_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM workshop_projects WHERE workshop_projects.slug = 'getting-started-' || p_org_id::text;
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
  WITH reclaimed AS (
    UPDATE pod_acr_outbox
       SET status = 'pending',
           attempt_count = attempt_count + 1,
           last_error = 'reclaimed: orphaned in processing status past grace period',
           next_attempt_at = now()
     WHERE status = 'processing'
       AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
  ),
  claimed AS (
    UPDATE pod_acr_outbox
       SET status = 'processing', claimed_at = now()
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
-- Name: current_program_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_program_ids() RETURNS integer[]
    LANGUAGE sql STABLE
    AS $$
  SELECT CASE
    WHEN current_setting('app.current_program_ids', true) IS NULL THEN ARRAY[]::int[]
    WHEN current_setting('app.current_program_ids', true) = '*' THEN NULL
    WHEN current_setting('app.current_program_ids', true) = '' THEN ARRAY[]::int[]
    ELSE string_to_array(current_setting('app.current_program_ids', true), ',')::int[]
  END;
$$;


--
-- Name: demo_org_reset_org_column(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_org_reset_org_column(p_table_name text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT kcu.column_name::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = p_table_name
    AND ccu.table_name = 'coop_members'
  ORDER BY (kcu.column_name <> 'org_id'), kcu.column_name
  LIMIT 1;
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
-- Name: enforce_org_has_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_org_has_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_admins integer;
  org_still_exists boolean;
BEGIN
  IF OLD.role IS DISTINCT FROM 'admin'::org_member_role THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin'::org_member_role THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM coop_members WHERE id = OLD.org_id) INTO org_still_exists;
  IF NOT org_still_exists THEN
    -- The org itself is gone (this row change is part of that same deletion's cascade) --
    -- no invariant left to protect.
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) FILTER (WHERE role = 'admin'::org_member_role)
    INTO remaining_admins
    FROM org_users
    WHERE org_id = OLD.org_id AND id <> OLD.id;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION 'org % must always keep at least one admin', OLD.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
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
-- Name: org_allow_ledger_source(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_allow_ledger_source(p_source text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  def text;
  vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
   WHERE c.conname = 'org_ledger_transactions_source_check' AND c.conrelid = 'org_ledger_transactions'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'org_ledger_transactions_source_check not found';
  END IF;
  SELECT array_agg(m[1]) INTO vals FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  IF vals IS NULL OR array_length(vals, 1) < 2 THEN
    RAISE EXCEPTION 'Could not read the allowed ledger sources from %', def;
  END IF;
  IF p_source = ANY (vals) THEN
    RETURN;
  END IF;
  vals := array_append(vals, p_source);
  ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
  EXECUTE 'ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check CHECK (source = ANY (ARRAY['
    || (SELECT string_agg(quote_literal(v) || '::text', ', ') FROM unnest(vals) AS v) || ']))';
END $$;


--
-- Name: org_apply_sponsor_report_holds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_apply_sponsor_report_holds() RETURNS TABLE(org_id integer, sponsored_project_id integer, action text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT p.id, p.sponsor_org_id, p.status, p.hold_kind, p.report_hold_waived_for,
           org_sponsor_overdue_report_due(p.id, COALESCE(ss.overdue_report_hold_days, 30)) AS overdue_due
      FROM org_sponsored_projects p
      JOIN org_settings s ON s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
      LEFT JOIN org_sponsor_settings ss ON ss.org_id = p.sponsor_org_id
     WHERE p.status IN ('active', 'winding_down') OR (p.status = 'on_hold' AND p.hold_kind = 'report_overdue')
  ), placed AS (
    UPDATE org_sponsored_projects p
       SET status_before_hold = p.status, status = 'on_hold', hold_kind = 'report_overdue', hold_reason = 'report overdue',
           hold_set_by = NULL, hold_set_at = now(), updated_at = now()
      FROM cand c
     WHERE c.id = p.id AND c.status IN ('active', 'winding_down') AND c.overdue_due IS NOT NULL
       AND c.report_hold_waived_for IS DISTINCT FROM c.overdue_due
    RETURNING p.sponsor_org_id, p.id
  ), lifted AS (
    UPDATE org_sponsored_projects p
       SET status = COALESCE(p.status_before_hold, 'active'), status_before_hold = NULL, hold_kind = NULL, hold_reason = NULL,
           hold_set_by = NULL, hold_set_at = NULL, updated_at = now()
      FROM cand c
     WHERE c.id = p.id AND c.status = 'on_hold' AND c.overdue_due IS NULL
    RETURNING p.sponsor_org_id, p.id
  ), logged AS (
    INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, field_name, old_value, new_value, metadata)
    SELECT x.sponsor_org_id, NULL::integer, 'update', 'org_sponsored_projects', x.id, 'status', 'active', 'on_hold', '{"reason":"report overdue","by":"daily job"}'::jsonb FROM placed x
    UNION ALL
    SELECT x.sponsor_org_id, NULL::integer, 'update', 'org_sponsored_projects', x.id, 'status', 'on_hold', 'active', '{"reason":"report received or due date moved","by":"daily job"}'::jsonb FROM lifted x
    RETURNING 1
  )
  SELECT x.sponsor_org_id, x.id, 'placed'::text FROM placed x
  UNION ALL
  SELECT x.sponsor_org_id, x.id, 'lifted'::text FROM lifted x;
END $$;


--
-- Name: org_audit_ledger_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_ledger_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_old jsonb; v_new jsonb; v_src jsonb; v_org integer; v_user integer;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
  v_src := COALESCE(v_new, v_old);
  IF TG_TABLE_NAME = 'org_ledger_transactions' THEN
    v_org := (v_src->>'org_id')::integer;
  ELSE
    SELECT org_id INTO v_org FROM org_ledger_transactions WHERE id = (v_src->>'transaction_id')::integer;
  END IF;
  IF v_org IS NULL THEN RETURN NULL; END IF;
  v_user := NULLIF(current_setting('app.current_user_id', true), '')::integer;
  INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_org, v_user, 'db_' || lower(TG_OP), TG_TABLE_NAME, (v_src->>'id')::bigint, v_old::text, v_new::text);
  RETURN NULL;
END $$;


--
-- Name: org_audit_log_chain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_log_chain() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org_audit_log:' || NEW.org_id::text, 0));
  SELECT row_hash INTO v_prev FROM org_audit_log WHERE org_id = NEW.org_id ORDER BY id DESC LIMIT 1;
  NEW.occurred_at := COALESCE(NEW.occurred_at, now());
  NEW.prev_hash := v_prev;
  NEW.row_hash := org_audit_row_hash(v_prev, NEW);
  RETURN NEW;
END $$;


--
-- Name: org_audit_log_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR current_user = 'causal_app' THEN
    RAISE EXCEPTION 'org_audit_log rows cannot be changed or deleted by the application';
  END IF;
  RETURN OLD;
END $$;


--
-- Name: org_audit_row_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

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
    prev_hash text,
    row_hash text,
    CONSTRAINT org_audit_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'db_insert'::text, 'db_update'::text, 'db_delete'::text])))
);

ALTER TABLE ONLY public.org_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: org_audit_row_hash(text, public.org_audit_log); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_row_hash(p_prev text, r public.org_audit_log) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(p_prev, ''), r.org_id::text, coalesce(r.user_id::text, ''), r.action, r.table_name,
    r.record_id::text, coalesce(r.field_name, ''), coalesce(r.old_value, ''), coalesce(r.new_value, ''),
    to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(r.metadata::text, '')
  ), 'UTF8')), 'hex')
$$;


--
-- Name: org_audit_verify(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_audit_verify(p_org_id integer) RETURNS TABLE(bad_id bigint, reason text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r org_audit_log; v_prev text := NULL;
BEGIN
  FOR r IN SELECT * FROM org_audit_log WHERE org_id = p_org_id ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM v_prev THEN bad_id := r.id; reason := 'link broken'; RETURN NEXT; RETURN; END IF;
    IF r.row_hash IS DISTINCT FROM org_audit_row_hash(v_prev, r) THEN bad_id := r.id; reason := 'content changed'; RETURN NEXT; RETURN; END IF;
    v_prev := r.row_hash;
  END LOOP;
END $$;


--
-- Name: org_claim_sponsor_report_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_claim_sponsor_report_reminders() RETURNS TABLE(reminder_id integer, org_id integer, sponsored_project_id integer, reminder_kind text, project_name text, due_date date, period_start date, period_end date, lead_email text, lead_name text, org_name text, reply_to text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id AS report_id, r.org_id, r.sponsored_project_id,
           CASE WHEN r.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due_soon' END AS kind
      FROM org_sponsor_reports r
      JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
      JOIN org_settings s ON s.org_id = r.org_id AND s.fiscal_sponsorship_mode
     WHERE r.kind = 'project_quarterly' AND r.received_at IS NULL
       AND r.due_date <= CURRENT_DATE + 7 AND r.due_date >= CURRENT_DATE - 60
       AND p.status IN ('active', 'on_hold', 'winding_down')
  ), claimed AS (
    INSERT INTO org_sponsor_report_reminders (org_id, sponsored_project_id, report_id, reminder_kind)
    SELECT d.org_id, d.sponsored_project_id, d.report_id, d.kind FROM due d
    ON CONFLICT (report_id, reminder_kind) DO NOTHING
    RETURNING id, org_id, sponsored_project_id, report_id, reminder_kind
  )
  SELECT c.id, c.org_id, c.sponsored_project_id, c.reminder_kind, p.name, r.due_date, r.period_start, r.period_end,
         COALESCE(NULLIF(lc.email, ''), p.contact_lead_email), COALESCE(lc.display_name, p.contact_lead_name), m.display_name,
         COALESCE(NULLIF(s.reply_to_email, ''), s.contact_email)
    FROM claimed c
    JOIN org_sponsor_reports r ON r.id = c.report_id
    JOIN org_sponsored_projects p ON p.id = c.sponsored_project_id
    JOIN coop_members m ON m.id = c.org_id
    JOIN org_settings s ON s.org_id = c.org_id
    LEFT JOIN org_constituents lc ON lc.id = p.lead_constituent_id;
END $$;


--
-- Name: org_claim_sponsor_statements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_claim_sponsor_statements() RETURNS TABLE(statement_id integer, org_id integer, sponsored_project_id integer, month date)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  INSERT INTO org_sponsor_statements (org_id, sponsored_project_id, month)
  SELECT p.sponsor_org_id, p.id, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
    FROM org_sponsored_projects p
    JOIN org_settings s ON s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
    JOIN org_sponsor_settings ss ON ss.org_id = p.sponsor_org_id
   WHERE p.status IN ('active', 'on_hold', 'winding_down')
     AND extract(day FROM CURRENT_DATE) >= ss.statement_day_of_month
     AND COALESCE(p.start_date, p.created_at::date) < date_trunc('month', CURRENT_DATE)::date
     AND date_trunc('month', CURRENT_DATE) - interval '1 month' >= date_trunc('month', ss.created_at)
  ON CONFLICT (sponsored_project_id, month) DO NOTHING
  RETURNING id, org_id, sponsored_project_id, month;
END $$;


--
-- Name: org_contact_has_role(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_contact_has_role(p_constituent_id integer, p_org_id integer, p_role text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_contact_roles r
     WHERE r.constituent_id = p_constituent_id AND r.org_id = p_org_id AND r.role = p_role
       AND r.starts_on <= CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on > CURRENT_DATE)
  );
$$;


--
-- Name: org_contact_roles_check_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_contact_roles_check_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_contact_roles.constituent_id % must reference an org_constituents row in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: org_documents_keep_sponsor_doc_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_documents_keep_sponsor_doc_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.sponsor_doc_type IS NULL AND NEW.supersedes_id IS NOT NULL THEN
    SELECT d.sponsor_doc_type INTO NEW.sponsor_doc_type FROM org_documents d WHERE d.id = NEW.supersedes_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: org_enforce_actuals_source_writer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_actuals_source_writer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'ledger') INTO v_actuals_source
    FROM org_settings WHERE org_id = NEW.org_id;
  IF v_actuals_source IS NULL THEN
    v_actuals_source := 'ledger';
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
        IF NOT org_contact_has_role(NEW.constituent_id, NEW.org_id, 'vendor') THEN
          RAISE EXCEPTION 'org_bills.constituent_id % must reference an org_constituents row with a current vendor role, in the same org', NEW.constituent_id
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
        IF NOT org_contact_has_role(NEW.constituent_id, NEW.org_id, 'vendor') THEN
          RAISE EXCEPTION 'org_bill_credit_notes.constituent_id % must reference an org_constituents row with a current vendor role, in the same org', NEW.constituent_id
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
-- Name: org_enforce_designation_on_equity_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_designation_on_equity_line() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.board_designation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.type = 'equity') THEN
    RAISE EXCEPTION 'A board designation can only be placed on a net assets (equity) line'
      USING ERRCODE = 'CA010';
  END IF;
  RETURN NEW;
END $$;


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
  v_scenario_id text;
BEGIN
  v_scenario_id := to_jsonb(COALESCE(NEW, OLD))->>'scenario_id';
  IF v_scenario_id IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
        IF NOT org_contact_has_role(NEW.constituent_id, NEW.org_id, 'customer') THEN
          RAISE EXCEPTION 'org_invoices.constituent_id % must reference an org_constituents row with a current customer role, in the same org', NEW.constituent_id
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
        IF NOT org_contact_has_role(NEW.constituent_id, NEW.org_id, 'customer') THEN
          RAISE EXCEPTION 'org_invoice_credit_notes.constituent_id % must reference an org_constituents row with a current customer role, in the same org', NEW.constituent_id
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
-- Name: org_enforce_ledger_transaction_contact_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_enforce_ledger_transaction_contact_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.constituent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_ledger_transactions.constituent_id % must reference an org_constituents row in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
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
-- Name: org_generate_sponsor_quarterly_reports(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_generate_sponsor_quarterly_reports(p_due_days integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  n integer;
BEGIN
  WITH proj AS (
    SELECT p.id, p.sponsor_org_id, GREATEST(COALESCE(p.start_date, p.created_at::date), COALESCE(ss.created_at::date, CURRENT_DATE)) AS start_on,
           ((COALESCE(s.fiscal_year_end_month, 12) % 12) + 1) AS fy_start
      FROM org_sponsored_projects p JOIN org_settings s ON s.org_id = p.sponsor_org_id
      LEFT JOIN org_sponsor_settings ss ON ss.org_id = p.sponsor_org_id
     WHERE s.fiscal_sponsorship_mode AND p.status IN ('active', 'on_hold', 'winding_down')
  ), bounds AS (
    SELECT id, sponsor_org_id,
           (date_trunc('month', start_on) - make_interval(months => ((extract(month FROM start_on)::int - fy_start + 12) % 12) % 3))::date AS first_q,
           (date_trunc('month', CURRENT_DATE) - make_interval(months => ((extract(month FROM CURRENT_DATE)::int - fy_start + 12) % 12) % 3))::date AS last_q
      FROM proj
  ), quarters AS (
    SELECT b.id, b.sponsor_org_id, q::date AS q_start, (q + interval '3 months' - interval '1 day')::date AS q_end
      FROM bounds b, generate_series(b.first_q, b.last_q, interval '3 months') AS q
  ), ins AS (
    INSERT INTO org_sponsor_reports (org_id, sponsored_project_id, kind, title, period_start, period_end, due_date)
    SELECT q.sponsor_org_id, q.id, 'project_quarterly', 'Quarterly report', q.q_start, q.q_end, q.q_end + p_due_days
      FROM quarters q
    ON CONFLICT (sponsored_project_id, period_end) WHERE kind = 'project_quarterly' DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;


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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  PERFORM pg_advisory_xact_lock(hashtextextended('get-or-create:' || p_org_id::text, 0));
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
  SELECT COALESCE(actuals_source, 'ledger') INTO v_actuals_source FROM org_settings WHERE org_id = p_org_id;

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
-- Name: org_mark_sponsor_report_reminder(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_mark_sponsor_report_reminder(p_id integer, p_status text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE org_sponsor_report_reminders SET send_status = p_status, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
   WHERE id = p_id AND p_status IN ('sent', 'failed', 'skipped');
$$;


--
-- Name: org_membership_message_event(text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_membership_message_event(p_message_id text, p_kind text, p_at timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  n integer;
BEGIN
  IF p_kind = 'delivered' THEN
    UPDATE org_membership_messages SET delivered_at = COALESCE(delivered_at, p_at) WHERE provider_message_id = p_message_id;
  ELSIF p_kind = 'opened' THEN
    UPDATE org_membership_messages SET opened_at = COALESCE(opened_at, p_at), delivered_at = COALESCE(delivered_at, p_at) WHERE provider_message_id = p_message_id;
  ELSIF p_kind = 'bounced' THEN
    UPDATE org_membership_messages SET status = 'failed' WHERE provider_message_id = p_message_id;
  ELSE
    RETURN 0;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


--
-- Name: org_membership_workspaces(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_membership_workspaces() RETURNS TABLE(org_id integer, slug text, display_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT c.id, c.slug::text, c.display_name::text
    FROM coop_members c JOIN org_settings s ON s.org_id = c.id
   WHERE s.membership_enabled AND c.deleted_at IS NULL
   ORDER BY c.id;
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
    SET search_path TO 'public'
    AS $$
DECLARE
  s RECORD;
  v_constituent_id integer;
  v_reference text;
  v_line jsonb;
  v_fiscal_year integer;
  v_new_id integer;
  v_next date;
  v_due_days integer;
  v_any boolean;
  v_pass integer := 0;
BEGIN
  LOOP
  v_any := false;
  v_pass := v_pass + 1;
  FOR s IN
    SELECT * FROM org_recurring_schedules
    WHERE active IS TRUE AND next_occurrence_date <= CURRENT_DATE
    ORDER BY id
  LOOP
    v_any := true;
    v_constituent_id := (s.template->>'constituent_id')::integer;
    v_reference := s.template->>'reference';
    v_fiscal_year := org_fiscal_year_for_date(s.org_id, s.next_occurrence_date);
    v_due_days := NULLIF(s.template->>'due_days', '')::integer;

    IF s.schedule_type = 'bill' THEN
      INSERT INTO org_bills (org_id, bill_number, constituent_id, bill_date, due_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, NULL, v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents, line_memo)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          NULLIF(v_line->>'grant_id', '')::integer,
          (v_line->>'amount_cents')::bigint,
          NULLIF(v_line->>'description', '')
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'bill'; generated_id := v_new_id;
      RETURN NEXT;

    ELSIF s.schedule_type = 'invoice' THEN
      INSERT INTO org_invoices (org_id, invoice_number, constituent_id, invoice_date, due_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, NULL, v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
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
  EXIT WHEN NOT v_any OR v_pass >= 60;
  END LOOP;
  RETURN;
END;
$$;


--
-- Name: org_sponsor_enable_rls(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_sponsor_enable_rls(p_table text, p_with_project boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_table || '_org_isolation', p_table);
  EXECUTE format($p$CREATE POLICY %I ON %I
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
    WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)$p$, p_table || '_org_isolation', p_table);
  IF p_with_project THEN
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_table || '_program_scope', p_table);
    EXECUTE format($p$CREATE POLICY %I ON %I AS RESTRICTIVE
      USING (current_program_ids() IS NULL OR EXISTS (
        SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())))$p$,
      p_table || '_program_scope', p_table);
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO causal_app', p_table);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO causal_app', p_table || '_id_seq');
END $_$;


--
-- Name: org_sponsor_overdue_report_due(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_sponsor_overdue_report_due(p_project_id integer, p_hold_days integer) RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    (SELECT min(r.due_date) FROM org_sponsor_reports r
      WHERE r.sponsored_project_id = p_project_id AND r.kind = 'project_quarterly' AND r.received_at IS NULL
        AND r.due_date + p_hold_days < CURRENT_DATE),
    (SELECT p.next_report_due FROM org_sponsored_projects p
      WHERE p.id = p_project_id AND p.next_report_due IS NOT NULL AND p.next_report_due + p_hold_days < CURRENT_DATE
        AND (p.last_report_received_at IS NULL OR p.last_report_received_at < p.next_report_due)
        AND NOT EXISTS (SELECT 1 FROM org_sponsor_reports r WHERE r.sponsored_project_id = p.id AND r.kind = 'project_quarterly')));
$$;


--
-- Name: org_take_document_number(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_take_document_number(p_org_id integer, p_kind text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_prefix text;
  v_n integer;
BEGIN
  IF p_kind = 'invoice' THEN
    UPDATE org_settings SET invoice_next_number = invoice_next_number + 1
      WHERE org_id = p_org_id RETURNING invoice_number_prefix, invoice_next_number - 1 INTO v_prefix, v_n;
  ELSIF p_kind = 'bill' THEN
    UPDATE org_settings SET bill_next_number = bill_next_number + 1
      WHERE org_id = p_org_id RETURNING bill_number_prefix, bill_next_number - 1 INTO v_prefix, v_n;
  ELSE
    RAISE EXCEPTION 'unknown document kind %', p_kind;
  END IF;
  IF v_n IS NULL THEN RETURN NULL; END IF;
  RETURN v_prefix || lpad(v_n::text, 4, '0');
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
-- Name: resolve_invite_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_invite_by_id(p_invite_id integer) RETURNS TABLE(id integer, org_id integer, email text, role text, org_slug text, program_ids integer[])
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, o.slug, i.program_ids
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.id = p_invite_id AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
$$;


--
-- Name: resolve_invite_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_invite_by_token(p_token_hash text) RETURNS TABLE(id integer, org_id integer, email text, role text, expires_at timestamp with time zone, org_slug text, org_display_name text, program_ids integer[])
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.org_id, i.email, i.role::text, i.expires_at, o.slug, o.display_name, i.program_ids
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE i.token_hash = p_token_hash AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  LIMIT 1;
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

CREATE FUNCTION public.resolve_member_org_id_and_role(p_user_id integer, p_slug text) RETURNS TABLE(org_id integer, role text, org_user_id integer, program_ids integer[])
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    o.id,
    m.role::text,
    m.id,
    COALESCE(
      (SELECT array_agg(g.program_id ORDER BY g.program_id)
         FROM org_program_grants g
        WHERE g.org_user_id = m.id),
      ARRAY[]::integer[]
    )
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
-- Name: resolve_pending_invites_for_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_pending_invites_for_email(p_email text) RETURNS TABLE(id integer, role text, created_at timestamp with time zone, org_slug text, org_display_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.role::text, i.created_at, o.slug, o.display_name
  FROM org_invites i
  INNER JOIN coop_members o ON o.id = i.org_id
  WHERE LOWER(i.email) = LOWER(p_email) AND i.used = FALSE AND i.expires_at > NOW() AND o.deleted_at IS NULL
  ORDER BY i.created_at DESC;
$$;


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
-- Name: resolve_plaid_item_by_item_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_plaid_item_by_item_id(p_item_id text) RETURNS public.org_plaid_items
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM org_plaid_items WHERE item_id = p_item_id LIMIT 1;
$$;


--
-- Name: resolve_pod_share(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_pod_share(p_token text) RETURNS TABLE(permission_id integer, org_id integer, org_slug text, share_resource_url text, recipient_label text, expires_at timestamp with time zone, revoked_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.org_id, c.slug, p.share_resource_url, p.recipient_label, p.expires_at, p.revoked_at
    FROM pod_access_permissions p
    JOIN coop_members c ON c.id = p.org_id
   WHERE p.share_token = p_token AND p.share_token IS NOT NULL;
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
  col text;
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
    col := demo_org_reset_org_column(t);
    CONTINUE WHEN col IS NULL;

    EXECUTE format('DELETE FROM %I WHERE %I = $1', t, col) USING v_org_id;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I,
         (SELECT COALESCE(jsonb_agg(row_data), ''[]''::jsonb) FROM org_demo_snapshot WHERE table_name = $1))',
      t, t
    ) USING t;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
  END LOOP;

  DELETE FROM org_audit_log WHERE org_id = v_org_id;

  -- Child tables with no org_id column are never covered by the table loop above, so lines that
  -- belonged to a visitor's now-deleted bills/invoices/transactions would otherwise pile up
  -- nightly (found 2026-10-03: 26 orphan ledger lines). Purge only lines whose parent is gone.
  DELETE FROM org_ledger_lines l WHERE NOT EXISTS (SELECT 1 FROM org_ledger_transactions t WHERE t.id = l.transaction_id);
  DELETE FROM org_bill_lines l WHERE NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = l.bill_id);
  DELETE FROM org_invoice_lines l WHERE NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = l.invoice_id);

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
  col text;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM org_demo_snapshot;

  FOREACH t IN ARRAY demo_org_reset_tables() LOOP
    col := demo_org_reset_org_column(t);
    CONTINUE WHEN col IS NULL;
    EXECUTE format(
      'INSERT INTO org_demo_snapshot (table_name, row_data) SELECT %L, to_jsonb(x) FROM %I x WHERE x.%I = $1',
      t, t, col
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


--
-- Name: accounting_review_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_review_entry (
    item_id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewer text NOT NULL
);


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

ALTER TABLE ONLY public.compliance_extension_proposals FORCE ROW LEVEL SECURITY;


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
    is_demo_fixture boolean DEFAULT false NOT NULL,
    created_via text,
    CONSTRAINT coop_members_cooperative_turnarounds_check CHECK (((array_length(cooperative_turnarounds, 1) IS NULL) OR (cooperative_turnarounds <@ ARRAY['energy'::text, 'food'::text, 'inequality'::text, 'poverty'::text, 'empowerment'::text]))),
    CONSTRAINT coop_members_created_via_check CHECK (((created_via IS NULL) OR (created_via = 'invited_sample'::text))),
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
-- Name: demo_visit_excluded; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_visit_excluded (
    visitor_hash text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: demo_visit_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_visit_key (
    id smallint DEFAULT 1 NOT NULL,
    key text NOT NULL,
    CONSTRAINT demo_visit_key_id_check CHECK ((id = 1))
);


--
-- Name: demo_visit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_visit_log (
    id bigint NOT NULL,
    visited_at timestamp with time zone DEFAULT now() NOT NULL,
    entry text NOT NULL,
    visitor_hash text NOT NULL,
    referrer_host text,
    is_bot boolean DEFAULT false NOT NULL,
    CONSTRAINT demo_visit_log_entry_check CHECK ((entry = ANY (ARRAY['demo'::text, 'demo-coop'::text, 'odi'::text])))
);


--
-- Name: demo_visit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demo_visit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demo_visit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demo_visit_log_id_seq OWNED BY public.demo_visit_log.id;


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
-- Name: org_access_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_access_permissions (
    id integer NOT NULL,
    org_id integer NOT NULL,
    org_user_id integer NOT NULL,
    permission text NOT NULL,
    reason text NOT NULL,
    ends_at timestamp with time zone,
    given_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    renewed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by_user_id integer,
    CONSTRAINT org_access_permissions_permission_check CHECK ((permission = ANY ('{reports,accounting_read,donor_details,manage_budget,manage_personnel,manage_funding,manage_compliance,manage_sponsorship,manage_structure,manage_donors,manage_membership}'::text[]))),
    CONSTRAINT org_access_permissions_reason_check CHECK ((length(btrim(reason)) >= 5))
);

ALTER TABLE ONLY public.org_access_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: org_access_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_access_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_access_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_access_permissions_id_seq OWNED BY public.org_access_permissions.id;


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
    is_mtdc_excluded boolean DEFAULT false NOT NULL,
    is_system_unallocated_receipts_account boolean DEFAULT false NOT NULL,
    description text,
    archived_at timestamp with time zone,
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
-- Name: COLUMN org_accounts.is_mtdc_excluded; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_mtdc_excluded IS 'True for direct-cost expense accounts that Modified Total Direct Costs excludes per 2 CFR 200.1: capital equipment, tuition remission, and participant support costs (stipends/travel for training or conference participants -- easy to miss, unlike the other two). Set explicitly per org/account -- do not infer from account name or type, same discipline as is_non_cash. Does NOT and cannot handle the subaward-portion-above-threshold exclusion ($25,000 for awards before Oct 1 2024, $50,000 on/after) -- that is a per-subaward dollar threshold, not a whole-account exclusion, and needs manual adjustment for subaward-heavy grants until per-subaward tracking exists. See indirectCostRecovery.js and the grant''s indirect cost rate settings UI for the same warning surfaced to users.';


--
-- Name: COLUMN org_accounts.is_system_unallocated_receipts_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_accounts.is_system_unallocated_receipts_account IS 'At most one per org. A holding account for incoming cash not yet tied to a specific grant/gift record -- see server/organizational/lib/giftPosting.js''s link-transaction reclassify path. Excluded from Find & Recode targeting, same as the other system-account flags.';


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
-- Name: org_bank_reconciliation_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bank_reconciliation_periods (
    id integer NOT NULL,
    org_id integer NOT NULL,
    bank_account_id integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    opening_balance_cents bigint NOT NULL,
    closing_balance_cents bigint NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by integer,
    reopened_at timestamp with time zone,
    reopened_by integer,
    reopen_reason text,
    report_snapshot jsonb,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bank_recon_periods_closed_check CHECK (((status = 'closed'::text) = (closed_at IS NOT NULL))),
    CONSTRAINT org_bank_recon_periods_dates_check CHECK ((period_start <= period_end)),
    CONSTRAINT org_bank_recon_periods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.org_bank_reconciliation_periods FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_bank_reconciliation_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_bank_reconciliation_periods IS 'Month-end reconciliation per bank/card account. Closed = bank side locked and report_snapshot stored. Reopen only for the latest closed period of the account.';


--
-- Name: org_bank_reconciliation_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bank_reconciliation_periods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bank_reconciliation_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bank_reconciliation_periods_id_seq OWNED BY public.org_bank_reconciliation_periods.id;


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
    note_date date,
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
    bill_number text,
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
-- Name: org_budget_scenario_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_budget_scenario_lines (
    id integer NOT NULL,
    scenario_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer,
    grant_id integer,
    month smallint NOT NULL,
    amount_cents bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_ref_id integer,
    source_ref_type text,
    is_override boolean DEFAULT false NOT NULL,
    CONSTRAINT org_budget_scenario_lines_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT org_budget_scenario_lines_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'personnel'::text, 'schedule'::text, 'grant_allocation'::text])))
);

ALTER TABLE ONLY public.org_budget_scenario_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_budget_scenario_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_budget_scenario_lines IS 'Sparse override cells for a scenario. Absence of a row for a given account/program/grant/month means "use the live org_budget_lines value." Promoting a scenario to live UPSERTs each override row into org_budget_lines and leaves untouched cells alone.';


--
-- Name: COLUMN org_budget_scenario_lines.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_scenario_lines.source_type IS '''manual'' = user typed this override directly (v1 Quick Overlay behavior, or an explicit override inside a detailed scenario). ''personnel''/''schedule''/''grant_allocation'' = written by that recalc engine from the scenario''s forked inputs; wiped and rewritten on every recalc unless is_override is true.';


--
-- Name: COLUMN org_budget_scenario_lines.is_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_budget_scenario_lines.is_override IS 'True once a user has manually edited a cell that a recalc engine also writes to -- protects it from being overwritten on the next scenario recalc, same semantics as org_budget_lines.is_override.';


--
-- Name: org_budget_scenario_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_budget_scenario_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_budget_scenario_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_budget_scenario_lines_id_seq OWNED BY public.org_budget_scenario_lines.id;


--
-- Name: org_budget_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_budget_scenarios (
    id integer NOT NULL,
    org_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scenario_type text DEFAULT 'overlay'::text NOT NULL,
    CONSTRAINT org_budget_scenarios_scenario_type_check CHECK ((scenario_type = ANY (ARRAY['overlay'::text, 'detailed'::text]))),
    CONSTRAINT org_budget_scenarios_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.org_budget_scenarios FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_budget_scenarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_budget_scenarios IS 'A named draft budget variant for a fiscal year (e.g. "Flat funding", "Growth -- new grant lands"). The live org_budget_lines table is the implicit baseline; scenarios never store a full copy, only the cells they override.';


--
-- Name: org_budget_scenarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_budget_scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_budget_scenarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_budget_scenarios_id_seq OWNED BY public.org_budget_scenarios.id;


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
    kind text NOT NULL,
    org_type text,
    additional_emails text[],
    CONSTRAINT org_constituents_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'organization'::text]))),
    CONSTRAINT org_constituents_org_type_check CHECK ((org_type = ANY (ARRAY['foundation'::text, 'corporate'::text, 'government'::text, 'nonprofit'::text, 'member_organization'::text]))),
    CONSTRAINT org_constituents_org_type_organizations_only CHECK (((org_type IS NULL) OR (kind = 'organization'::text)))
);

ALTER TABLE ONLY public.org_constituents FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_constituents.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_constituents.kind IS 'individual or organization. Roles (donor, vendor, customer, ...) are rows in org_contact_roles.';


--
-- Name: COLUMN org_constituents.org_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_constituents.org_type IS 'Optional, organizations only: foundation, corporate (a company), government, nonprofit, member_organization. Overlaps org_grants.institution_type (free text), which still says what kind of funder a grant is.';


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
-- Name: org_contact_email_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_contact_email_prefs (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    scope text DEFAULT 'membership'::text NOT NULL,
    unsubscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    CONSTRAINT org_contact_email_prefs_scope_check CHECK ((scope = ANY (ARRAY['membership'::text, 'all'::text])))
);

ALTER TABLE ONLY public.org_contact_email_prefs FORCE ROW LEVEL SECURITY;


--
-- Name: org_contact_email_prefs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_contact_email_prefs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_contact_email_prefs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_contact_email_prefs_id_seq OWNED BY public.org_contact_email_prefs.id;


--
-- Name: org_contact_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_contact_roles (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    role text NOT NULL,
    starts_on date DEFAULT CURRENT_DATE NOT NULL,
    ends_on date,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_contact_roles_dates CHECK (((ends_on IS NULL) OR (ends_on >= starts_on))),
    CONSTRAINT org_contact_roles_role_check CHECK ((role = ANY (ARRAY['donor'::text, 'vendor'::text, 'customer'::text, 'board_member'::text, 'staff'::text, 'dues_member'::text])))
);

ALTER TABLE ONLY public.org_contact_roles FORCE ROW LEVEL SECURITY;


--
-- Name: org_contact_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_contact_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_contact_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_contact_roles_id_seq OWNED BY public.org_contact_roles.id;


--
-- Name: org_conversion_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_conversion_balances (
    id integer NOT NULL,
    org_id integer NOT NULL,
    conversion_date date NOT NULL,
    program_id integer,
    balancing_account_id integer,
    ledger_transaction_id integer,
    status text DEFAULT 'open'::text NOT NULL,
    entered_by integer,
    locked_by integer,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_conversion_balances_status_check CHECK ((status = ANY (ARRAY['open'::text, 'locked'::text])))
);

ALTER TABLE ONLY public.org_conversion_balances FORCE ROW LEVEL SECURITY;


--
-- Name: org_conversion_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_conversion_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_conversion_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_conversion_balances_id_seq OWNED BY public.org_conversion_balances.id;


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

ALTER TABLE ONLY public.org_document_expectations FORCE ROW LEVEL SECURITY;


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
-- Name: org_document_retention_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_document_retention_rules (
    id integer NOT NULL,
    org_id integer,
    category public.org_document_category NOT NULL,
    retention_class public.org_document_retention_class DEFAULT 'fixed_term'::public.org_document_retention_class NOT NULL,
    retention_years integer,
    trigger text DEFAULT 'year_end'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_document_retention_rules_trigger_check CHECK ((trigger = ANY (ARRAY['record_date'::text, 'year_end'::text])))
);

ALTER TABLE ONLY public.org_document_retention_rules FORCE ROW LEVEL SECURITY;


--
-- Name: org_document_retention_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_document_retention_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_document_retention_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_document_retention_rules_id_seq OWNED BY public.org_document_retention_rules.id;


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
    sponsor_doc_type text,
    CONSTRAINT org_documents_fy_reasonable CHECK (((fiscal_year IS NULL) OR ((fiscal_year >= 1900) AND (fiscal_year <= 2200)))),
    CONSTRAINT org_documents_sponsor_doc_type_check CHECK (((sponsor_doc_type IS NULL) OR (sponsor_doc_type = ANY (ARRAY['application'::text, 'agreement'::text, 'insurance'::text, 'report'::text, 'correspondence'::text, 'tax_form'::text, 'donor_letter'::text]))))
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
    rate_cents_per_mile numeric(7,3),
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
    acquisition_ledger_transaction_id integer,
    prior_depreciation_cents bigint DEFAULT 0 NOT NULL,
    prior_depreciation_through date,
    CONSTRAINT org_fixed_assets_cost_positive CHECK ((cost_cents > 0)),
    CONSTRAINT org_fixed_assets_disposal_consistency CHECK (((status = 'disposed'::text) = (disposal_date IS NOT NULL))),
    CONSTRAINT org_fixed_assets_prior_depreciation_cents_check CHECK ((prior_depreciation_cents >= 0)),
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
-- Name: org_gift_pledge_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_gift_pledge_installments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    gift_id integer NOT NULL,
    due_date date NOT NULL,
    amount_cents bigint NOT NULL,
    status text DEFAULT 'expected'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ledger_transaction_id integer,
    collected_at date,
    CONSTRAINT org_gift_pledge_installments_amount_positive CHECK ((amount_cents > 0)),
    CONSTRAINT org_gift_pledge_installments_status_check CHECK ((status = ANY (ARRAY['expected'::text, 'collected'::text, 'written_off'::text])))
);

ALTER TABLE ONLY public.org_gift_pledge_installments FORCE ROW LEVEL SECURITY;


--
-- Name: org_gift_pledge_installments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_gift_pledge_installments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_gift_pledge_installments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_gift_pledge_installments_id_seq OWNED BY public.org_gift_pledge_installments.id;


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
    posting_status text DEFAULT 'not_applicable'::text NOT NULL,
    ledger_transaction_id integer,
    program_id integer,
    in_kind_description text,
    in_kind_valuation_method text,
    in_kind_fair_value_notes text,
    in_kind_revenue_account_id integer,
    in_kind_expense_account_id integer,
    total_pledged_cents bigint,
    is_multi_year_pledge boolean DEFAULT false NOT NULL,
    discount_rate_bps integer,
    discounted_present_value_cents bigint,
    receivable_account_id integer,
    pledge_years numeric(5,2),
    discounting_accepted_at timestamp with time zone,
    discounting_accepted_by_user_id integer,
    pledge_status text,
    pledge_condition text,
    pledge_status_changed_by integer,
    pledge_status_changed_at timestamp with time zone,
    pledge_status_note text,
    source text DEFAULT 'funding'::text NOT NULL,
    review_status text DEFAULT 'confirmed'::text NOT NULL,
    reviewed_by integer,
    reviewed_at timestamp with time zone,
    review_note text,
    not_gift_flagged_at timestamp with time zone,
    not_gift_flagged_by integer,
    not_gift_note text,
    sponsor_fee_exempt boolean DEFAULT false NOT NULL,
    sponsor_fee_exempt_reason text,
    sponsor_untagged_reviewed_at timestamp with time zone,
    sponsor_untagged_reviewed_by integer,
    donor_letter_document_id integer,
    benefit_description text,
    benefit_value_cents bigint,
    CONSTRAINT org_gifts_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT org_gifts_benefit_value_check CHECK (((benefit_value_cents IS NULL) OR ((benefit_value_cents >= 0) AND (benefit_value_cents <= amount_cents)))),
    CONSTRAINT org_gifts_discount_rate_bps_range CHECK (((discount_rate_bps IS NULL) OR ((discount_rate_bps >= 0) AND (discount_rate_bps <= 5000)))),
    CONSTRAINT org_gifts_in_kind_valuation_method_check CHECK (((in_kind_valuation_method IS NULL) OR (in_kind_valuation_method = ANY (ARRAY['quoted_market_price'::text, 'comparable_sales'::text, 'cost_replacement'::text, 'professional_appraisal'::text, 'donor_stated'::text, 'other'::text])))),
    CONSTRAINT org_gifts_pledge_status_check CHECK (((pledge_status IS NULL) OR (pledge_status = ANY (ARRAY['intention'::text, 'conditional'::text, 'unconditional'::text])))),
    CONSTRAINT org_gifts_posting_status_check CHECK ((posting_status = ANY (ARRAY['not_applicable'::text, 'held'::text, 'unposted'::text, 'posted'::text, 'void'::text]))),
    CONSTRAINT org_gifts_review_status_check CHECK ((review_status = ANY (ARRAY['confirmed'::text, 'to_confirm'::text, 'dismissed'::text]))),
    CONSTRAINT org_gifts_source_check CHECK ((source = ANY (ARRAY['funding'::text, 'accounting'::text]))),
    CONSTRAINT org_gifts_total_pledged_nonneg CHECK (((total_pledged_cents IS NULL) OR (total_pledged_cents >= 0)))
);

ALTER TABLE ONLY public.org_gifts FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_gifts.posting_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_gifts.posting_status IS 'not_applicable for cash donation/grant/dues gifts (never posted here -- reach the ledger via ordinary bank-deposit coding). unposted/posted/void only apply to in-kind gifts and pledge commitments, which have no other path to the ledger. Set to unposted at create time by donors.js; only server/organizational/routes/giftPostings.js moves it to posted/void, via postLedgerTransaction, mirroring org_bank_statement_lines'' unconfirmed/confirmed pattern.';


--
-- Name: COLUMN org_gifts.in_kind_valuation_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_gifts.in_kind_valuation_method IS 'Required for payment_method = in_kind. ASU 2020-07 requires nonprofits to disclose the valuation technique used to determine fair value for contributed nonfinancial assets.';


--
-- Name: COLUMN org_gifts.total_pledged_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_gifts.total_pledged_cents IS 'Face value of the promise for gift_type = pledge. amount_cents holds the amount actually posted at commitment (= discounted_present_value_cents if is_multi_year_pledge, else total_pledged_cents) -- kept distinct so the discount is always visible, not silently absorbed into amount_cents.';


--
-- Name: COLUMN org_gifts.discount_rate_bps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_gifts.discount_rate_bps IS 'Fixed at pledge commitment per ASC 958-605 (does not float with the pledge''s remaining term). Only meaningful when is_multi_year_pledge.';


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
-- Name: org_grant_allocation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_grant_allocation_requests (
    id integer NOT NULL,
    org_id integer NOT NULL,
    grant_id integer NOT NULL,
    coop_program_id integer NOT NULL,
    fiscal_year integer NOT NULL,
    amount_cents integer NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by_user_id integer,
    decided_by_user_id integer,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_grant_allocation_requests_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT org_grant_allocation_requests_fiscal_year_check CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_grant_allocation_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY public.org_grant_allocation_requests FORCE ROW LEVEL SECURITY;


--
-- Name: org_grant_allocation_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_grant_allocation_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_grant_allocation_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_grant_allocation_requests_id_seq OWNED BY public.org_grant_allocation_requests.id;


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
    auto_generated boolean DEFAULT false NOT NULL,
    scenario_id integer
);

ALTER TABLE ONLY public.org_grant_allocations FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN org_grant_allocations.auto_generated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grant_allocations.auto_generated IS 'TRUE when this FY allocation was auto-filled from the grant''s period_start_date/period_end_date + award amount (even split across missing years), rather than entered by a human. Flips FALSE on the first human edit.';


--
-- Name: COLUMN org_grant_allocations.scenario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grant_allocations.scenario_id IS 'NULL = live allocation. Set only on rows forked into a detailed scenario -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';


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
    indirect_cost_rate_type public.org_indirect_cost_rate_type DEFAULT 'none'::public.org_indirect_cost_rate_type NOT NULL,
    indirect_cost_rate_bps integer,
    indirect_cost_base public.org_indirect_cost_base DEFAULT 'mtdc'::public.org_indirect_cost_base NOT NULL,
    nicra_expiration_date date,
    nicra_document_id integer,
    CONSTRAINT org_grants_allocation_mode_check CHECK (((allocation_mode)::text = ANY ((ARRAY['amount'::character varying, 'percent'::character varying])::text[]))),
    CONSTRAINT org_grants_amount_passed_to_subrecipients_cents_check CHECK (((amount_passed_to_subrecipients_cents IS NULL) OR (amount_passed_to_subrecipients_cents >= 0))),
    CONSTRAINT org_grants_indirect_cost_rate_bps_check CHECK ((((indirect_cost_rate_type = 'none'::public.org_indirect_cost_rate_type) AND (indirect_cost_rate_bps IS NULL)) OR ((indirect_cost_rate_type = 'de_minimis'::public.org_indirect_cost_rate_type) AND (indirect_cost_rate_bps = ANY (ARRAY[1000, 1500]))) OR ((indirect_cost_rate_type = 'negotiated'::public.org_indirect_cost_rate_type) AND (indirect_cost_rate_bps > 0) AND (indirect_cost_rate_bps <= 10000)))),
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
-- Name: COLUMN org_grants.indirect_cost_rate_bps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.indirect_cost_rate_bps IS 'De minimis is 1500 bps (15% of MTDC) for awards under the Oct 2024 Uniform Guidance revision, or 1000 bps (10%) for older awards that elected under the pre-revision rate -- both allowed values kept since an org can hold awards from either era. Negotiated (NICRA) rates are org-specific and unconstrained beyond a 100% sanity ceiling.';


--
-- Name: COLUMN org_grants.indirect_cost_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_grants.indirect_cost_base IS 'MTDC (modified total direct costs) is the federal default base. Kept editable per grant, not hardcoded to MTDC, since a pre-2 CFR 200 legacy award or a private (non-federal) funder can specify a different base.';


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
    CONSTRAINT org_import_history_import_kind_check CHECK ((import_kind = ANY (ARRAY['coa'::text, 'programs'::text, 'grants'::text, 'budget_lines'::text, 'actuals'::text, 'balance_sheet'::text, 'bank_statement'::text, 'personnel'::text, 'export_delete_actuals'::text, 'export_delete_budget_lines'::text, 'export_delete_grants'::text, 'export_delete_structure'::text])))
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
-- Name: org_indirect_cost_recovery_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_indirect_cost_recovery_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    grant_id integer NOT NULL,
    period_start_date date NOT NULL,
    period_end_date date NOT NULL,
    mtdc_base_cents bigint NOT NULL,
    rate_bps integer NOT NULL,
    recovery_amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    posted_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_indirect_cost_recovery_entries_amount_nonneg CHECK ((recovery_amount_cents >= 0)),
    CONSTRAINT org_indirect_cost_recovery_entries_base_nonneg CHECK ((mtdc_base_cents >= 0)),
    CONSTRAINT org_indirect_cost_recovery_entries_period_order CHECK ((period_end_date >= period_start_date))
);

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries FORCE ROW LEVEL SECURITY;


--
-- Name: org_indirect_cost_recovery_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_indirect_cost_recovery_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_indirect_cost_recovery_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_indirect_cost_recovery_entries_id_seq OWNED BY public.org_indirect_cost_recovery_entries.id;


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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_ids integer[] DEFAULT '{}'::integer[] NOT NULL
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
    note_date date,
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
    invoice_number text,
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
    source_line_type text,
    source_line_id integer,
    CONSTRAINT org_ledger_lines_amounts_non_negative CHECK (((debit_cents >= 0) AND (credit_cents >= 0))),
    CONSTRAINT org_ledger_lines_exactly_one_side CHECK (((debit_cents > 0) <> (credit_cents > 0))),
    CONSTRAINT org_ledger_lines_source_line_type_check CHECK ((((source_line_type IS NULL) AND (source_line_id IS NULL)) OR ((source_line_type = ANY (ARRAY['org_bill_lines'::text, 'org_invoice_lines'::text, 'org_expense_claim_lines'::text, 'org_gifts'::text])) AND (source_line_id IS NOT NULL))))
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
    entry_type text,
    journal_reason text,
    constituent_id integer,
    CONSTRAINT org_ledger_transactions_entry_type_check CHECK (((entry_type IS NULL) OR (entry_type = ANY (ARRAY['receive'::text, 'spend'::text, 'transfer'::text, 'journal'::text])))),
    CONSTRAINT org_ledger_transactions_fy_reasonable CHECK (((fiscal_year >= 1900) AND (fiscal_year <= 2200))),
    CONSTRAINT org_ledger_transactions_no_self_reverse CHECK ((reverses_transaction_id IS DISTINCT FROM id)),
    CONSTRAINT org_ledger_transactions_source_check CHECK ((source = ANY ('{manual,bank_reconciliation,bill_approval,invoice,bill_payment,invoice_payment,fixed_asset_depreciation,fixed_asset_disposal,expense_claim_approval,expense_claim_payment,recode,gift_in_kind,pledge_commitment,pledge_accretion,indirect_cost_recovery,gift_reclassify,sponsored_disbursement,conversion_balance,sponsor_fee,sponsor_recall,sponsor_closing,membership_dues}'::text[]))),
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
-- Name: COLUMN org_ledger_transactions.entry_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.entry_type IS 'Which manual-entry form created this: receive, spend, transfer or journal. NULL for entries from other modules and older manual entries.';


--
-- Name: COLUMN org_ledger_transactions.journal_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.journal_reason IS 'Required explanation for a manual journal entry (entry_type = journal).';


--
-- Name: COLUMN org_ledger_transactions.constituent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_ledger_transactions.constituent_id IS 'The contact this entry is with (vendor, customer, donor). Null when no party applies or none is matched. payee stays as the text typed or imported.';


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
-- Name: org_membership_directory_optin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_directory_optin (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    fields text[] DEFAULT '{}'::text[] NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_directory_optin_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);

ALTER TABLE ONLY public.org_membership_directory_optin FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_directory_optin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_directory_optin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_directory_optin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_directory_optin_id_seq OWNED BY public.org_membership_directory_optin.id;


--
-- Name: org_membership_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_join_requests (
    id integer NOT NULL,
    org_id integer NOT NULL,
    status text DEFAULT 'unconfirmed'::text NOT NULL,
    kind text DEFAULT 'individual'::text NOT NULL,
    email text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    tier_id integer,
    price_cents integer,
    eligibility_confirmed boolean DEFAULT false NOT NULL,
    extra_gift_cents integer DEFAULT 0 NOT NULL,
    link_id integer,
    constituent_id integer,
    term_id integer,
    gift_id integer,
    decided_by integer,
    decision_reason text,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    decided_at timestamp with time zone,
    CONSTRAINT org_membership_join_requests_check CHECK (((status <> 'declined'::text) OR (length(btrim(COALESCE(decision_reason, ''::text))) > 0))),
    CONSTRAINT org_membership_join_requests_extra_gift_cents_check CHECK ((extra_gift_cents >= 0)),
    CONSTRAINT org_membership_join_requests_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'organization'::text]))),
    CONSTRAINT org_membership_join_requests_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT org_membership_join_requests_status_check CHECK ((status = ANY (ARRAY['unconfirmed'::text, 'awaiting_approval'::text, 'accepted'::text, 'declined'::text])))
);

ALTER TABLE ONLY public.org_membership_join_requests FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_join_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_join_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_join_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_join_requests_id_seq OWNED BY public.org_membership_join_requests.id;


--
-- Name: org_membership_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_messages (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    term_id integer NOT NULL,
    constituent_id integer NOT NULL,
    template_key text NOT NULL,
    offset_days integer DEFAULT 0 NOT NULL,
    to_email text,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_message_id text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    created_by integer,
    CONSTRAINT org_membership_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.org_membership_messages FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_messages_id_seq OWNED BY public.org_membership_messages.id;


--
-- Name: org_membership_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_payments (
    id integer NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    recorded_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posting_status text DEFAULT 'unposted'::text NOT NULL,
    ledger_transaction_id integer,
    org_id integer NOT NULL,
    term_id integer NOT NULL,
    constituent_id integer NOT NULL,
    kind text DEFAULT 'payment'::text NOT NULL,
    method text,
    discount_cents integer DEFAULT 0 NOT NULL,
    discount_reason text,
    reason text,
    processor_ref text,
    approved_by integer,
    approved_at timestamp with time zone,
    refund_of_id integer,
    posted_contribution_cents integer,
    posted_deferred_cents integer,
    posted_revenue_cents integer,
    deposit_account_id integer,
    posted_by integer,
    posted_at timestamp with time zone,
    CONSTRAINT org_membership_payments_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT org_membership_payments_kind_check CHECK ((kind = ANY (ARRAY['payment'::text, 'refund'::text, 'waiver'::text]))),
    CONSTRAINT org_membership_payments_method_check CHECK (((method IS NULL) OR (method = ANY (ARRAY['card'::text, 'check'::text, 'transfer'::text, 'cash'::text, 'other'::text])))),
    CONSTRAINT org_membership_payments_posting_status_check CHECK ((posting_status = ANY (ARRAY['unposted'::text, 'posted'::text, 'void'::text, 'not_applicable'::text]))),
    CONSTRAINT org_membership_payments_rules_check CHECK (((discount_cents >= 0) AND ((discount_cents = 0) OR (length(btrim(COALESCE(discount_reason, ''::text))) > 0)) AND ((kind = 'payment'::text) OR (length(btrim(COALESCE(reason, ''::text))) > 0)) AND ((kind <> 'refund'::text) OR (refund_of_id IS NOT NULL)) AND ((kind = 'payment'::text) OR (method IS NOT NULL) OR (kind = 'waiver'::text)) AND ((approved_by IS NULL) OR (recorded_by_user_id IS NULL) OR (approved_by <> recorded_by_user_id))))
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
-- Name: org_membership_recognition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_recognition (
    id integer NOT NULL,
    org_id integer NOT NULL,
    term_id integer NOT NULL,
    month date NOT NULL,
    amount_cents integer NOT NULL,
    ledger_transaction_id integer,
    posted_by integer,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_recognition_month_check CHECK ((month = (date_trunc('month'::text, (month)::timestamp with time zone))::date))
);

ALTER TABLE ONLY public.org_membership_recognition FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_recognition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_recognition_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_recognition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_recognition_id_seq OWNED BY public.org_membership_recognition.id;


--
-- Name: org_membership_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_seats (
    id integer NOT NULL,
    org_id integer NOT NULL,
    term_id integer NOT NULL,
    constituent_id integer NOT NULL,
    label text,
    starts_on date DEFAULT CURRENT_DATE NOT NULL,
    ends_on date,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_seats_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)))
);

ALTER TABLE ONLY public.org_membership_seats FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_seats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_seats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_seats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_seats_id_seq OWNED BY public.org_membership_seats.id;


--
-- Name: org_membership_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_settings (
    org_id integer NOT NULL,
    year_mode text DEFAULT 'rolling'::text NOT NULL,
    fixed_start_month smallint DEFAULT 1 NOT NULL,
    fixed_start_day smallint DEFAULT 1 NOT NULL,
    renewal_window_days integer DEFAULT 60 NOT NULL,
    proration_mode text DEFAULT 'none'::text NOT NULL,
    grace_days integer DEFAULT 30 NOT NULL,
    join_requires_approval boolean DEFAULT false NOT NULL,
    recognition_mode text DEFAULT 'spread'::text NOT NULL,
    deferred_dues_account_id integer,
    contribution_account_id integer,
    dues_revenue_account_id integer,
    default_program_id integer,
    directory_fields text[] DEFAULT '{}'::text[] NOT NULL,
    join_form_enabled boolean DEFAULT false NOT NULL,
    form_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    extra_gift_enabled boolean DEFAULT false NOT NULL,
    auto_renew_default boolean DEFAULT false NOT NULL,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_mode text DEFAULT 'test'::text NOT NULL,
    card_payments_enabled boolean DEFAULT false NOT NULL,
    monthly_instalments_enabled boolean DEFAULT false NOT NULL,
    directory_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT org_membership_settings_fixed_start_day_check CHECK (((fixed_start_day >= 1) AND (fixed_start_day <= 31))),
    CONSTRAINT org_membership_settings_fixed_start_month_check CHECK (((fixed_start_month >= 1) AND (fixed_start_month <= 12))),
    CONSTRAINT org_membership_settings_grace_days_check CHECK (((grace_days >= 0) AND (grace_days <= 366))),
    CONSTRAINT org_membership_settings_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['test'::text, 'live'::text]))),
    CONSTRAINT org_membership_settings_proration_mode_check CHECK ((proration_mode = ANY (ARRAY['none'::text, 'monthly'::text]))),
    CONSTRAINT org_membership_settings_recognition_mode_check CHECK ((recognition_mode = ANY (ARRAY['spread'::text, 'at_receipt'::text]))),
    CONSTRAINT org_membership_settings_renewal_window_days_check CHECK (((renewal_window_days >= 0) AND (renewal_window_days <= 366))),
    CONSTRAINT org_membership_settings_year_mode_check CHECK ((year_mode = ANY (ARRAY['rolling'::text, 'fixed'::text])))
);

ALTER TABLE ONLY public.org_membership_settings FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_templates (
    id integer NOT NULL,
    org_id integer NOT NULL,
    key text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    offset_days integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_templates_key_check CHECK ((key ~ '^[a-z0-9_]+$'::text))
);

ALTER TABLE ONLY public.org_membership_templates FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_templates_id_seq OWNED BY public.org_membership_templates.id;


--
-- Name: org_membership_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_terms (
    id integer NOT NULL,
    org_id integer NOT NULL,
    constituent_id integer NOT NULL,
    tier_id integer,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    price_cents integer DEFAULT 0 NOT NULL,
    contribution_cents integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'staff'::text NOT NULL,
    status_override text,
    status_reason text,
    ended_on date,
    ended_by integer,
    extension_count integer DEFAULT 0 NOT NULL,
    invoice_id integer,
    auto_renew boolean DEFAULT false NOT NULL,
    processor_subscription_ref text,
    renews_term_id integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processor_customer_ref text,
    instalment_plan text,
    payment_failed_at timestamp with time zone,
    CONSTRAINT org_membership_terms_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT org_membership_terms_check1 CHECK (((status_override IS NULL) OR (length(btrim(COALESCE(status_reason, ''::text))) > 0))),
    CONSTRAINT org_membership_terms_contribution_cents_check CHECK ((contribution_cents >= 0)),
    CONSTRAINT org_membership_terms_instalment_plan_check CHECK (((instalment_plan IS NULL) OR (instalment_plan = 'monthly'::text))),
    CONSTRAINT org_membership_terms_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT org_membership_terms_source_check CHECK ((source = ANY (ARRAY['staff'::text, 'join_form'::text, 'renewal'::text, 'import'::text]))),
    CONSTRAINT org_membership_terms_status_override_check CHECK ((status_override = 'ended'::text))
);

ALTER TABLE ONLY public.org_membership_terms FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_terms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_terms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_terms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_terms_id_seq OWNED BY public.org_membership_terms.id;


--
-- Name: org_membership_tier_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_tier_prices (
    id integer NOT NULL,
    org_id integer NOT NULL,
    tier_id integer NOT NULL,
    effective_on date NOT NULL,
    price_cents integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_membership_tier_prices_price_cents_check CHECK ((price_cents >= 0))
);

ALTER TABLE ONLY public.org_membership_tier_prices FORCE ROW LEVEL SECURITY;


--
-- Name: org_membership_tier_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_membership_tier_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_membership_tier_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_membership_tier_prices_id_seq OWNED BY public.org_membership_tier_prices.id;


--
-- Name: org_membership_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_membership_tiers (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    dues_currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    renewal_period public.renewal_period DEFAULT 'annual'::public.renewal_period NOT NULL,
    benefits_markdown text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revenue_account_id integer,
    program_id integer,
    applies_to text DEFAULT 'either'::text NOT NULL,
    pay_what_you_can boolean DEFAULT false NOT NULL,
    min_price_cents integer,
    suggested_price_cents integer,
    budget_low_cents bigint,
    budget_high_cents bigint,
    benefit_value_cents integer,
    seats_included integer DEFAULT 0 NOT NULL,
    benefits text[] DEFAULT '{}'::text[] NOT NULL,
    eligibility_statement text,
    eligibility_required boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT org_membership_tiers_amounts_check CHECK ((((min_price_cents IS NULL) OR (min_price_cents >= 0)) AND ((suggested_price_cents IS NULL) OR (suggested_price_cents >= 0)) AND ((benefit_value_cents IS NULL) OR (benefit_value_cents >= 0)) AND (seats_included >= 0) AND ((budget_low_cents IS NULL) OR (budget_high_cents IS NULL) OR (budget_high_cents >= budget_low_cents)))),
    CONSTRAINT org_membership_tiers_applies_to_check CHECK ((applies_to = ANY (ARRAY['individual'::text, 'organization'::text, 'either'::text])))
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
-- Name: org_payment_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_payment_accounts (
    id integer NOT NULL,
    org_id integer NOT NULL,
    provider text NOT NULL,
    mode text NOT NULL,
    account_ref text,
    secret_enc text,
    secret_iv text,
    secret_tag text,
    webhook_secret_enc text,
    webhook_secret_iv text,
    webhook_secret_tag text,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_payment_accounts_mode_check CHECK ((mode = ANY (ARRAY['test'::text, 'live'::text]))),
    CONSTRAINT org_payment_accounts_provider_check CHECK ((provider = 'stripe'::text))
);

ALTER TABLE ONLY public.org_payment_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: org_payment_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_payment_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_payment_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_payment_accounts_id_seq OWNED BY public.org_payment_accounts.id;


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
    scenario_id integer,
    avg_hours_per_week numeric(4,1),
    is_officer_or_key boolean DEFAULT false NOT NULL,
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
-- Name: COLUMN org_personnel.scenario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_personnel.scenario_id IS 'NULL = live personnel record. Set only on rows forked into a detailed scenario (org_budget_scenarios.scenario_type = ''detailed'') -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';


--
-- Name: COLUMN org_personnel.is_officer_or_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_personnel.is_officer_or_key IS 'Officer, director or key employee: shown to board members (and only these people) on 990 Schedule J.';


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
-- Name: org_pledge_accretion_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_pledge_accretion_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    gift_id integer NOT NULL,
    period_date date NOT NULL,
    amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_pledge_accretion_entries_amount_positive CHECK ((amount_cents > 0))
);

ALTER TABLE ONLY public.org_pledge_accretion_entries FORCE ROW LEVEL SECURITY;


--
-- Name: org_pledge_accretion_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_pledge_accretion_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_pledge_accretion_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_pledge_accretion_entries_id_seq OWNED BY public.org_pledge_accretion_entries.id;


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
-- Name: org_program_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_program_grants (
    id integer NOT NULL,
    org_id integer NOT NULL,
    org_user_id integer NOT NULL,
    program_id integer NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_program_grants FORCE ROW LEVEL SECURITY;


--
-- Name: org_program_grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_program_grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_program_grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_program_grants_id_seq OWNED BY public.org_program_grants.id;


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
-- Name: org_public_link_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_public_link_uses (
    id bigint NOT NULL,
    org_id integer NOT NULL,
    link_id integer NOT NULL,
    action text NOT NULL,
    ip_hash text,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_public_link_uses FORCE ROW LEVEL SECURITY;


--
-- Name: org_public_link_uses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_public_link_uses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_public_link_uses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_public_link_uses_id_seq OWNED BY public.org_public_link_uses.id;


--
-- Name: org_public_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_public_links (
    id integer NOT NULL,
    org_id integer NOT NULL,
    purpose text NOT NULL,
    constituent_id integer,
    sponsored_project_id integer,
    token_hash text NOT NULL,
    single_use boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by integer,
    revoke_reason text,
    label text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT org_public_links_purpose_check CHECK ((purpose ~ '^[a-z_]+$'::text))
);

ALTER TABLE ONLY public.org_public_links FORCE ROW LEVEL SECURITY;


--
-- Name: org_public_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_public_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_public_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_public_links_id_seq OWNED BY public.org_public_links.id;


--
-- Name: org_public_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_public_settings (
    org_id integer NOT NULL,
    challenge_verify_url text,
    challenge_site_key text,
    challenge_secret_enc text,
    challenge_secret_iv text,
    challenge_secret_tag text,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_public_settings FORCE ROW LEVEL SECURITY;


--
-- Name: org_record_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_record_notes (
    id integer NOT NULL,
    org_id integer NOT NULL,
    record_type text NOT NULL,
    record_id integer NOT NULL,
    body text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_record_notes_body_check CHECK ((length(btrim(body)) > 0)),
    CONSTRAINT org_record_notes_type_check CHECK ((record_type = ANY (ARRAY['bill'::text, 'invoice'::text, 'ledger_transaction'::text, 'contact'::text])))
);

ALTER TABLE ONLY public.org_record_notes FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_record_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_record_notes IS 'Free-text notes on a bill, invoice or ledger entry. Append-only. History comes from org_audit_log, not this table.';


--
-- Name: org_record_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_record_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_record_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_record_notes_id_seq OWNED BY public.org_record_notes.id;


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
    scenario_id integer,
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
-- Name: COLUMN org_schedule_items.scenario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.org_schedule_items.scenario_id IS 'NULL = live schedule item. Set only on rows forked into a detailed scenario -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';


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
    actuals_source text DEFAULT 'ledger'::text NOT NULL,
    expense_claim_approval_mode text DEFAULT 'pre_approval'::text NOT NULL,
    expense_claim_receipt_required_threshold_cents integer DEFAULT 0 NOT NULL,
    session_timeout_minutes smallint,
    finance_can_give_access boolean DEFAULT false NOT NULL,
    finance_giveable_permissions text[] DEFAULT '{}'::text[] NOT NULL,
    reports_1099 boolean DEFAULT true NOT NULL,
    threshold_1099_cents integer,
    board_may_approve boolean DEFAULT false NOT NULL,
    capitalization_threshold_cents integer DEFAULT 500000 NOT NULL,
    state text,
    show_number_colors boolean DEFAULT false NOT NULL,
    default_pledge_receivable_account_id integer,
    default_bank_account_id integer,
    default_individual_gift_account_id integer,
    legal_name text,
    mailing_address text,
    phone text,
    contact_email text,
    payment_instructions text,
    invoice_number_prefix text DEFAULT 'INV-'::text NOT NULL,
    invoice_next_number integer DEFAULT 1 NOT NULL,
    bill_number_prefix text DEFAULT 'BILL-'::text NOT NULL,
    bill_next_number integer DEFAULT 1 NOT NULL,
    default_invoice_terms_days integer,
    default_bill_terms_days integer,
    mileage_rate_cents_per_mile numeric(7,3),
    acknowledgment_message text,
    acknowledgment_signoff text,
    report_display jsonb,
    CONSTRAINT org_settings_actuals_source_check CHECK ((actuals_source = ANY (ARRAY['xero'::text, 'ledger'::text]))),
    CONSTRAINT org_settings_bill_next_number_check CHECK ((bill_next_number >= 1)),
    CONSTRAINT org_settings_capitalization_threshold_cents_check CHECK ((capitalization_threshold_cents >= 0)),
    CONSTRAINT org_settings_default_admin_rate_check CHECK (((default_admin_rate >= (0)::numeric) AND (default_admin_rate <= (100)::numeric))),
    CONSTRAINT org_settings_default_bill_terms_days_check CHECK (((default_bill_terms_days IS NULL) OR ((default_bill_terms_days >= 0) AND (default_bill_terms_days <= 365)))),
    CONSTRAINT org_settings_default_invoice_terms_days_check CHECK (((default_invoice_terms_days IS NULL) OR ((default_invoice_terms_days >= 0) AND (default_invoice_terms_days <= 365)))),
    CONSTRAINT org_settings_expense_claim_approval_mode_check CHECK ((expense_claim_approval_mode = ANY (ARRAY['pre_approval'::text, 'post_payout'::text]))),
    CONSTRAINT org_settings_fiscal_year_end_month_check CHECK (((fiscal_year_end_month >= 1) AND (fiscal_year_end_month <= 12))),
    CONSTRAINT org_settings_invoice_next_number_check CHECK ((invoice_next_number >= 1)),
    CONSTRAINT org_settings_mileage_rate_cents_per_mile_check CHECK (((mileage_rate_cents_per_mile IS NULL) OR (mileage_rate_cents_per_mile > (0)::numeric))),
    CONSTRAINT org_settings_onboarding_step_check CHECK ((onboarding_step = ANY (ARRAY['basics'::text, 'accounts'::text, 'prior_data'::text, 'programs'::text, 'complete'::text]))),
    CONSTRAINT org_settings_session_timeout_minutes_check CHECK (((session_timeout_minutes IS NULL) OR (session_timeout_minutes = ANY (ARRAY[15, 30, 60, 120, 240, 480])))),
    CONSTRAINT org_settings_state_check CHECK (((state IS NULL) OR (state ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT org_settings_threshold_1099_cents_check CHECK (((threshold_1099_cents IS NULL) OR (threshold_1099_cents >= 0)))
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
-- Name: org_sponsor_acknowledgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_acknowledgments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    item_key text NOT NULL,
    acknowledged_on date NOT NULL,
    document_id integer,
    note text,
    recorded_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_sponsor_acknowledgments FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_acknowledgments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_acknowledgments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_acknowledgments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_acknowledgments_id_seq OWNED BY public.org_sponsor_acknowledgments.id;


--
-- Name: org_sponsor_agreement_amendments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_agreement_amendments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    agreement_id integer NOT NULL,
    effective_date date NOT NULL,
    summary text NOT NULL,
    document_id integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_sponsor_agreement_amendments FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_agreement_amendments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_agreement_amendments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_agreement_amendments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_agreement_amendments_id_seq OWNED BY public.org_sponsor_agreement_amendments.id;


--
-- Name: org_sponsor_agreement_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_agreement_templates (
    id integer NOT NULL,
    org_id integer,
    model text,
    title text NOT NULL,
    body text NOT NULL,
    archived_at timestamp with time zone,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsor_agreement_templates_model_check CHECK (((model IS NULL) OR (model = ANY (ARRAY['model_a'::text, 'model_c'::text, 'other'::text]))))
);

ALTER TABLE ONLY public.org_sponsor_agreement_templates FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_agreement_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_agreement_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_agreement_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_agreement_templates_id_seq OWNED BY public.org_sponsor_agreement_templates.id;


--
-- Name: org_sponsor_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_agreements (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    template_id integer,
    effective_date date NOT NULL,
    term_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_document_id integer,
    signed_document_id integer,
    signed_at date,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_sponsor_agreements FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_agreements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_agreements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_agreements_id_seq OWNED BY public.org_sponsor_agreements.id;


--
-- Name: org_sponsor_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_applications (
    id integer NOT NULL,
    org_id integer NOT NULL,
    applicant_constituent_id integer,
    lead_constituent_id integer,
    project_name text NOT NULL,
    mission text,
    activities text,
    budget_cents bigint,
    leaders text,
    expected_funders text,
    risks text,
    status text DEFAULT 'submitted'::text NOT NULL,
    source text DEFAULT 'staff'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by integer,
    decided_at timestamp with time zone,
    decision_reason text,
    sponsored_project_id integer,
    CONSTRAINT org_sponsor_applications_budget_cents_check CHECK (((budget_cents IS NULL) OR (budget_cents >= 0))),
    CONSTRAINT org_sponsor_applications_source_check CHECK ((source = ANY (ARRAY['staff'::text, 'public'::text]))),
    CONSTRAINT org_sponsor_applications_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'accepted'::text, 'declined'::text])))
);

ALTER TABLE ONLY public.org_sponsor_applications FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_applications_id_seq OWNED BY public.org_sponsor_applications.id;


--
-- Name: org_sponsor_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_approvals (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    funder_constituent_id integer,
    draft_document_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by integer,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by integer,
    decided_at timestamp with time zone,
    decision_reason text,
    signed_document_id integer,
    CONSTRAINT org_sponsor_approvals_kind_check CHECK ((kind = ANY (ARRAY['letter_of_inquiry'::text, 'proposal'::text, 'pledge'::text, 'agreement'::text, 'solicitation'::text, 'publicity'::text]))),
    CONSTRAINT org_sponsor_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])))
);

ALTER TABLE ONLY public.org_sponsor_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_approvals_id_seq OWNED BY public.org_sponsor_approvals.id;


--
-- Name: org_sponsor_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_closings (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    destination_kind text NOT NULL,
    destination_constituent_id integer,
    amount_cents bigint NOT NULL,
    closing_date date NOT NULL,
    reason text NOT NULL,
    document_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    ledger_transaction_id integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    void_reason text,
    CONSTRAINT org_sponsor_closings_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT org_sponsor_closings_destination_kind_check CHECK ((destination_kind = ANY (ARRAY['project_charity'::text, 'new_sponsor'::text, 'sponsor_decides'::text]))),
    CONSTRAINT org_sponsor_closings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'posted'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_sponsor_closings FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_closings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_closings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_closings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_closings_id_seq OWNED BY public.org_sponsor_closings.id;


--
-- Name: org_sponsor_fee_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_fee_postings (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    amount_cents bigint NOT NULL,
    ledger_transaction_id integer,
    voided_at timestamp with time zone,
    void_reason text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsor_fee_postings_amount_cents_check CHECK ((amount_cents <> 0))
);

ALTER TABLE ONLY public.org_sponsor_fee_postings FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_fee_postings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_fee_postings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_fee_postings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_fee_postings_id_seq OWNED BY public.org_sponsor_fee_postings.id;


--
-- Name: org_sponsor_fee_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_fee_rules (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    kind text DEFAULT 'percent'::text NOT NULL,
    rate numeric(7,4),
    tiers jsonb,
    flat_cents bigint,
    minimum_quarter_cents bigint DEFAULT 0 NOT NULL,
    effective_from date NOT NULL,
    amendment_document_id integer,
    amendment_reason text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsor_fee_rules_flat_cents_check CHECK (((flat_cents IS NULL) OR (flat_cents >= 0))),
    CONSTRAINT org_sponsor_fee_rules_kind_check CHECK ((kind = ANY (ARRAY['percent'::text, 'flat'::text, 'tiered'::text]))),
    CONSTRAINT org_sponsor_fee_rules_minimum_quarter_cents_check CHECK ((minimum_quarter_cents >= 0)),
    CONSTRAINT org_sponsor_fee_rules_rate_check CHECK (((rate IS NULL) OR (rate >= (0)::numeric))),
    CONSTRAINT org_sponsor_fee_rules_shape CHECK ((((kind = 'percent'::text) AND (rate IS NOT NULL)) OR ((kind = 'flat'::text) AND (flat_cents IS NOT NULL)) OR ((kind = 'tiered'::text) AND (tiers IS NOT NULL) AND (jsonb_typeof(tiers) = 'array'::text))))
);

ALTER TABLE ONLY public.org_sponsor_fee_rules FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_fee_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_fee_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_fee_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_fee_rules_id_seq OWNED BY public.org_sponsor_fee_rules.id;


--
-- Name: org_sponsor_payment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_payment_requests (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    requester_link_ref text,
    payee_constituent_id integer NOT NULL,
    amount_cents bigint NOT NULL,
    purpose text NOT NULL,
    method text DEFAULT 'check'::text NOT NULL,
    document_id integer,
    budget_line text,
    needed_by date,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewer_id integer,
    reviewed_at timestamp with time zone,
    decision_reason text,
    override_reason text,
    override_by integer,
    override_at timestamp with time zone,
    disbursement_id integer,
    CONSTRAINT org_sponsor_payment_requests_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_sponsor_payment_requests_method_check CHECK ((method = ANY (ARRAY['check'::text, 'bank_transfer'::text, 'wire'::text, 'card'::text, 'other'::text]))),
    CONSTRAINT org_sponsor_payment_requests_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'needs_info'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY public.org_sponsor_payment_requests FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_payment_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_payment_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_payment_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_payment_requests_id_seq OWNED BY public.org_sponsor_payment_requests.id;


--
-- Name: org_sponsor_recalls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_recalls (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    amount_cents bigint NOT NULL,
    recall_date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    ledger_transaction_id integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    void_reason text,
    CONSTRAINT org_sponsor_recalls_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_sponsor_recalls_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'posted'::text, 'void'::text])))
);

ALTER TABLE ONLY public.org_sponsor_recalls FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_recalls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_recalls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_recalls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_recalls_id_seq OWNED BY public.org_sponsor_recalls.id;


--
-- Name: org_sponsor_report_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_report_reminders (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    report_id integer NOT NULL,
    reminder_kind text NOT NULL,
    send_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT org_sponsor_report_reminders_reminder_kind_check CHECK ((reminder_kind = ANY (ARRAY['due_soon'::text, 'overdue'::text]))),
    CONSTRAINT org_sponsor_report_reminders_send_status_check CHECK ((send_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.org_sponsor_report_reminders FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_report_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_report_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_report_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_report_reminders_id_seq OWNED BY public.org_sponsor_report_reminders.id;


--
-- Name: org_sponsor_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_reports (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    kind text NOT NULL,
    funder_constituent_id integer,
    title text,
    period_start date,
    period_end date,
    due_date date NOT NULL,
    received_at date,
    received_by integer,
    document_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsor_reports_kind_check CHECK ((kind = ANY (ARRAY['project_quarterly'::text, 'funder'::text])))
);

ALTER TABLE ONLY public.org_sponsor_reports FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_reports_id_seq OWNED BY public.org_sponsor_reports.id;


--
-- Name: org_sponsor_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_settings (
    org_id integer NOT NULL,
    default_fee_minimum_cents bigint DEFAULT 0 NOT NULL,
    second_approval_threshold_cents bigint DEFAULT 500000 NOT NULL,
    overdue_report_hold_days integer DEFAULT 30 NOT NULL,
    donor_letter_threshold_cents bigint DEFAULT 500000 NOT NULL,
    information_return_thresholds jsonb DEFAULT '{"2026": 200000}'::jsonb NOT NULL,
    statement_day_of_month smallint DEFAULT 5 NOT NULL,
    fee_income_account_id integer,
    fee_income_program_id integer,
    fee_expense_account_id integer,
    untagged_review_from timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recall_expense_account_id integer,
    recall_income_account_id integer,
    CONSTRAINT org_sponsor_settings_default_fee_minimum_cents_check CHECK ((default_fee_minimum_cents >= 0)),
    CONSTRAINT org_sponsor_settings_donor_letter_threshold_cents_check CHECK ((donor_letter_threshold_cents >= 0)),
    CONSTRAINT org_sponsor_settings_overdue_report_hold_days_check CHECK ((overdue_report_hold_days >= 0)),
    CONSTRAINT org_sponsor_settings_second_approval_threshold_cents_check CHECK ((second_approval_threshold_cents >= 0)),
    CONSTRAINT org_sponsor_settings_statement_day_of_month_check CHECK (((statement_day_of_month >= 1) AND (statement_day_of_month <= 28)))
);

ALTER TABLE ONLY public.org_sponsor_settings FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sponsor_statements (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    month date NOT NULL,
    opening_cents bigint,
    income_cents bigint,
    fees_cents bigint,
    expenses_cents bigint,
    closing_cents bigint,
    generated_document_id integer,
    send_status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    sent_to text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsor_statements_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT org_sponsor_statements_send_status_check CHECK ((send_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text, 'not_sent'::text])))
);

ALTER TABLE ONLY public.org_sponsor_statements FORCE ROW LEVEL SECURITY;


--
-- Name: org_sponsor_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_sponsor_statements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_sponsor_statements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_sponsor_statements_id_seq OWNED BY public.org_sponsor_statements.id;


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
    ledger_transaction_id integer,
    payment_request_id integer,
    first_approved_by integer,
    first_approved_at timestamp with time zone,
    override_reason text,
    override_by integer,
    override_at timestamp with time zone,
    kind text DEFAULT 'cash'::text NOT NULL,
    property_gift_id integer,
    payee_constituent_id integer,
    grant_agreement_document_id integer,
    CONSTRAINT org_sponsored_project_disbursements_admin_fee_cents_check CHECK (((admin_fee_cents IS NULL) OR (admin_fee_cents >= 0))),
    CONSTRAINT org_sponsored_project_disbursements_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_sponsored_project_disbursements_kind_check CHECK ((kind = ANY (ARRAY['cash'::text, 'property'::text]))),
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
    disbursement_expense_account_id integer,
    agreement_signed_at date,
    hold_reason text,
    hold_kind text,
    hold_set_by integer,
    hold_set_at timestamp with time zone,
    status_before_hold text,
    report_hold_waived_for date,
    lead_constituent_id integer,
    receiving_constituent_id integer,
    w9_on_file boolean DEFAULT false NOT NULL,
    w9_document_id integer,
    w9_received_at date,
    public_page_enabled boolean DEFAULT false NOT NULL,
    public_summary text,
    CONSTRAINT org_sponsored_projects_hold_kind_check CHECK (((hold_kind IS NULL) OR (hold_kind = ANY (ARRAY['manual'::text, 'report_overdue'::text])))),
    CONSTRAINT org_sponsored_projects_sponsorship_model_check CHECK (((sponsorship_model IS NULL) OR (sponsorship_model = ANY (ARRAY['model_a'::text, 'model_c'::text, 'other'::text])))),
    CONSTRAINT org_sponsored_projects_status_check CHECK ((status = ANY (ARRAY['applicant'::text, 'accepted'::text, 'active'::text, 'on_hold'::text, 'winding_down'::text, 'ended'::text, 'lapsed'::text, 'paused'::text, 'completed'::text])))
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
    last_dashboard_visit_at timestamp with time zone,
    accounting_entry_enabled boolean DEFAULT false NOT NULL,
    accounting_entry_enabled_at timestamp with time zone,
    accounting_entry_reminded_at timestamp with time zone
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
    activity_summary_generated_at timestamp with time zone,
    external_id uuid DEFAULT gen_random_uuid() NOT NULL
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
-- Name: COLUMN orgs.external_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orgs.external_id IS 'Stable opaque identifier for referencing this org outside this database. Never reused or edited; orgs.id stays the local key for all existing foreign keys.';


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
    user_id integer,
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
-- Name: payment_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_provider_events (
    id bigint NOT NULL,
    provider text NOT NULL,
    event_id text NOT NULL,
    org_id integer,
    event_type text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    result text
);


--
-- Name: payment_provider_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_provider_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_provider_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_provider_events_id_seq OWNED BY public.payment_provider_events.id;


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
-- Name: platform_audit_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_failures (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id integer,
    user_id integer,
    action text,
    table_name text,
    record_id integer,
    error text,
    reviewed_at timestamp with time zone
);


--
-- Name: platform_audit_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_audit_failures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_audit_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_audit_failures_id_seq OWNED BY public.platform_audit_failures.id;


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
    share_token text,
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
    claimed_at timestamp with time zone,
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
-- Name: pod_share_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_share_challenges (
    id integer NOT NULL,
    org_id integer NOT NULL,
    permission_id integer NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified_at timestamp with time zone,
    requested_ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.pod_share_challenges FORCE ROW LEVEL SECURITY;


--
-- Name: pod_share_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_share_challenges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_share_challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_share_challenges_id_seq OWNED BY public.pod_share_challenges.id;


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
-- Name: reviewer_access_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviewer_access_links (
    id integer NOT NULL,
    token text NOT NULL,
    user_id integer NOT NULL,
    label text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reviewer_access_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviewer_access_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviewer_access_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviewer_access_links_id_seq OWNED BY public.reviewer_access_links.id;


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
    user_id integer,
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
-- Name: demo_visit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_visit_log ALTER COLUMN id SET DEFAULT nextval('public.demo_visit_log_id_seq'::regclass);


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
-- Name: org_access_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions ALTER COLUMN id SET DEFAULT nextval('public.org_access_permissions_id_seq'::regclass);


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
-- Name: org_bank_reconciliation_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods ALTER COLUMN id SET DEFAULT nextval('public.org_bank_reconciliation_periods_id_seq'::regclass);


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
-- Name: org_budget_scenario_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines ALTER COLUMN id SET DEFAULT nextval('public.org_budget_scenario_lines_id_seq'::regclass);


--
-- Name: org_budget_scenarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenarios ALTER COLUMN id SET DEFAULT nextval('public.org_budget_scenarios_id_seq'::regclass);


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
-- Name: org_contact_email_prefs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_email_prefs ALTER COLUMN id SET DEFAULT nextval('public.org_contact_email_prefs_id_seq'::regclass);


--
-- Name: org_contact_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_roles ALTER COLUMN id SET DEFAULT nextval('public.org_contact_roles_id_seq'::regclass);


--
-- Name: org_conversion_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances ALTER COLUMN id SET DEFAULT nextval('public.org_conversion_balances_id_seq'::regclass);


--
-- Name: org_document_expectations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations ALTER COLUMN id SET DEFAULT nextval('public.org_document_expectations_id_seq'::regclass);


--
-- Name: org_document_retention_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_retention_rules ALTER COLUMN id SET DEFAULT nextval('public.org_document_retention_rules_id_seq'::regclass);


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
-- Name: org_gift_pledge_installments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gift_pledge_installments ALTER COLUMN id SET DEFAULT nextval('public.org_gift_pledge_installments_id_seq'::regclass);


--
-- Name: org_gifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts ALTER COLUMN id SET DEFAULT nextval('public.org_gifts_id_seq'::regclass);


--
-- Name: org_grant_allocation_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests ALTER COLUMN id SET DEFAULT nextval('public.org_grant_allocation_requests_id_seq'::regclass);


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
-- Name: org_indirect_cost_recovery_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries ALTER COLUMN id SET DEFAULT nextval('public.org_indirect_cost_recovery_entries_id_seq'::regclass);


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
-- Name: org_membership_directory_optin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_directory_optin ALTER COLUMN id SET DEFAULT nextval('public.org_membership_directory_optin_id_seq'::regclass);


--
-- Name: org_membership_join_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests ALTER COLUMN id SET DEFAULT nextval('public.org_membership_join_requests_id_seq'::regclass);


--
-- Name: org_membership_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages ALTER COLUMN id SET DEFAULT nextval('public.org_membership_messages_id_seq'::regclass);


--
-- Name: org_membership_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments ALTER COLUMN id SET DEFAULT nextval('public.org_membership_payments_id_seq'::regclass);


--
-- Name: org_membership_recognition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition ALTER COLUMN id SET DEFAULT nextval('public.org_membership_recognition_id_seq'::regclass);


--
-- Name: org_membership_seats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats ALTER COLUMN id SET DEFAULT nextval('public.org_membership_seats_id_seq'::regclass);


--
-- Name: org_membership_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_templates ALTER COLUMN id SET DEFAULT nextval('public.org_membership_templates_id_seq'::regclass);


--
-- Name: org_membership_terms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms ALTER COLUMN id SET DEFAULT nextval('public.org_membership_terms_id_seq'::regclass);


--
-- Name: org_membership_tier_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices ALTER COLUMN id SET DEFAULT nextval('public.org_membership_tier_prices_id_seq'::regclass);


--
-- Name: org_membership_tiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers ALTER COLUMN id SET DEFAULT nextval('public.org_membership_tiers_id_seq'::regclass);


--
-- Name: org_payment_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_payment_accounts ALTER COLUMN id SET DEFAULT nextval('public.org_payment_accounts_id_seq'::regclass);


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
-- Name: org_pledge_accretion_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries ALTER COLUMN id SET DEFAULT nextval('public.org_pledge_accretion_entries_id_seq'::regclass);


--
-- Name: org_program_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants ALTER COLUMN id SET DEFAULT nextval('public.org_program_grants_id_seq'::regclass);


--
-- Name: org_programs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_programs ALTER COLUMN id SET DEFAULT nextval('public.org_programs_id_seq'::regclass);


--
-- Name: org_projections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_projections ALTER COLUMN id SET DEFAULT nextval('public.org_projections_id_seq'::regclass);


--
-- Name: org_public_link_uses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_link_uses ALTER COLUMN id SET DEFAULT nextval('public.org_public_link_uses_id_seq'::regclass);


--
-- Name: org_public_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links ALTER COLUMN id SET DEFAULT nextval('public.org_public_links_id_seq'::regclass);


--
-- Name: org_record_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_record_notes ALTER COLUMN id SET DEFAULT nextval('public.org_record_notes_id_seq'::regclass);


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
-- Name: org_sponsor_acknowledgments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_acknowledgments ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_acknowledgments_id_seq'::regclass);


--
-- Name: org_sponsor_agreement_amendments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_agreement_amendments_id_seq'::regclass);


--
-- Name: org_sponsor_agreement_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_templates ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_agreement_templates_id_seq'::regclass);


--
-- Name: org_sponsor_agreements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_agreements_id_seq'::regclass);


--
-- Name: org_sponsor_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_applications_id_seq'::regclass);


--
-- Name: org_sponsor_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_approvals_id_seq'::regclass);


--
-- Name: org_sponsor_closings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_closings_id_seq'::regclass);


--
-- Name: org_sponsor_fee_postings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_postings ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_fee_postings_id_seq'::regclass);


--
-- Name: org_sponsor_fee_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_fee_rules_id_seq'::regclass);


--
-- Name: org_sponsor_payment_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_payment_requests_id_seq'::regclass);


--
-- Name: org_sponsor_recalls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_recalls ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_recalls_id_seq'::regclass);


--
-- Name: org_sponsor_report_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_report_reminders_id_seq'::regclass);


--
-- Name: org_sponsor_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_reports_id_seq'::regclass);


--
-- Name: org_sponsor_statements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements ALTER COLUMN id SET DEFAULT nextval('public.org_sponsor_statements_id_seq'::regclass);


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
-- Name: payment_provider_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_events ALTER COLUMN id SET DEFAULT nextval('public.payment_provider_events_id_seq'::regclass);


--
-- Name: pending_confirmations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_confirmations ALTER COLUMN id SET DEFAULT nextval('public.pending_confirmations_id_seq'::regclass);


--
-- Name: platform_audit_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_failures ALTER COLUMN id SET DEFAULT nextval('public.platform_audit_failures_id_seq'::regclass);


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
-- Name: pod_share_challenges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_share_challenges ALTER COLUMN id SET DEFAULT nextval('public.pod_share_challenges_id_seq'::regclass);


--
-- Name: representatives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representatives ALTER COLUMN id SET DEFAULT nextval('public.representatives_id_seq'::regclass);


--
-- Name: reviewer_access_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewer_access_links ALTER COLUMN id SET DEFAULT nextval('public.reviewer_access_links_id_seq'::regclass);


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
-- Name: accounting_review_entry accounting_review_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_review_entry
    ADD CONSTRAINT accounting_review_entry_pkey PRIMARY KEY (item_id, reviewer);


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
-- Name: demo_visit_excluded demo_visit_excluded_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_visit_excluded
    ADD CONSTRAINT demo_visit_excluded_pkey PRIMARY KEY (visitor_hash);


--
-- Name: demo_visit_key demo_visit_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_visit_key
    ADD CONSTRAINT demo_visit_key_pkey PRIMARY KEY (id);


--
-- Name: demo_visit_log demo_visit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_visit_log
    ADD CONSTRAINT demo_visit_log_pkey PRIMARY KEY (id);


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
-- Name: org_access_permissions org_access_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions
    ADD CONSTRAINT org_access_permissions_pkey PRIMARY KEY (id);


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
-- Name: org_bank_reconciliation_periods org_bank_recon_periods_unique_end; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_recon_periods_unique_end UNIQUE (org_id, bank_account_id, period_end);


--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_pkey PRIMARY KEY (id);


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
-- Name: org_budget_scenario_lines org_budget_scenario_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines
    ADD CONSTRAINT org_budget_scenario_lines_pkey PRIMARY KEY (id);


--
-- Name: org_budget_scenarios org_budget_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenarios
    ADD CONSTRAINT org_budget_scenarios_pkey PRIMARY KEY (id);


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
-- Name: org_contact_email_prefs org_contact_email_prefs_constituent_id_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_email_prefs
    ADD CONSTRAINT org_contact_email_prefs_constituent_id_scope_key UNIQUE (constituent_id, scope);


--
-- Name: org_contact_email_prefs org_contact_email_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_email_prefs
    ADD CONSTRAINT org_contact_email_prefs_pkey PRIMARY KEY (id);


--
-- Name: org_contact_roles org_contact_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_roles
    ADD CONSTRAINT org_contact_roles_pkey PRIMARY KEY (id);


--
-- Name: org_contact_roles org_contact_roles_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_roles
    ADD CONSTRAINT org_contact_roles_unique UNIQUE (constituent_id, role, starts_on);


--
-- Name: org_conversion_balances org_conversion_balances_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_org_id_key UNIQUE (org_id);


--
-- Name: org_conversion_balances org_conversion_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_pkey PRIMARY KEY (id);


--
-- Name: org_document_expectations org_document_expectations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations
    ADD CONSTRAINT org_document_expectations_pkey PRIMARY KEY (id);


--
-- Name: org_document_retention_rules org_document_retention_rules_org_id_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_retention_rules
    ADD CONSTRAINT org_document_retention_rules_org_id_category_key UNIQUE NULLS NOT DISTINCT (org_id, category);


--
-- Name: org_document_retention_rules org_document_retention_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_retention_rules
    ADD CONSTRAINT org_document_retention_rules_pkey PRIMARY KEY (id);


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
-- Name: org_gift_pledge_installments org_gift_pledge_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gift_pledge_installments
    ADD CONSTRAINT org_gift_pledge_installments_pkey PRIMARY KEY (id);


--
-- Name: org_gifts org_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_pkey PRIMARY KEY (id);


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_pkey PRIMARY KEY (id);


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
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_pkey PRIMARY KEY (id);


--
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_unique UNIQUE (grant_id, period_start_date, period_end_date);


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
-- Name: org_membership_directory_optin org_membership_directory_optin_constituent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_directory_optin
    ADD CONSTRAINT org_membership_directory_optin_constituent_id_key UNIQUE (constituent_id);


--
-- Name: org_membership_directory_optin org_membership_directory_optin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_directory_optin
    ADD CONSTRAINT org_membership_directory_optin_pkey PRIMARY KEY (id);


--
-- Name: org_membership_join_requests org_membership_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_pkey PRIMARY KEY (id);


--
-- Name: org_membership_messages org_membership_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_pkey PRIMARY KEY (id);


--
-- Name: org_membership_messages org_membership_messages_term_id_template_key_offset_days_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_term_id_template_key_offset_days_key UNIQUE (term_id, template_key, offset_days);


--
-- Name: org_membership_payments org_membership_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_pkey PRIMARY KEY (id);


--
-- Name: org_membership_recognition org_membership_recognition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_pkey PRIMARY KEY (id);


--
-- Name: org_membership_recognition org_membership_recognition_term_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_term_id_month_key UNIQUE (term_id, month);


--
-- Name: org_membership_seats org_membership_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats
    ADD CONSTRAINT org_membership_seats_pkey PRIMARY KEY (id);


--
-- Name: org_membership_settings org_membership_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_pkey PRIMARY KEY (org_id);


--
-- Name: org_membership_templates org_membership_templates_org_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_templates
    ADD CONSTRAINT org_membership_templates_org_id_key_key UNIQUE (org_id, key);


--
-- Name: org_membership_templates org_membership_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_templates
    ADD CONSTRAINT org_membership_templates_pkey PRIMARY KEY (id);


--
-- Name: org_membership_terms org_membership_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_pkey PRIMARY KEY (id);


--
-- Name: org_membership_tier_prices org_membership_tier_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices
    ADD CONSTRAINT org_membership_tier_prices_pkey PRIMARY KEY (id);


--
-- Name: org_membership_tier_prices org_membership_tier_prices_tier_id_effective_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices
    ADD CONSTRAINT org_membership_tier_prices_tier_id_effective_on_key UNIQUE (tier_id, effective_on);


--
-- Name: org_membership_tiers org_membership_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_pkey PRIMARY KEY (id);


--
-- Name: org_payment_accounts org_payment_accounts_org_id_provider_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_payment_accounts
    ADD CONSTRAINT org_payment_accounts_org_id_provider_mode_key UNIQUE (org_id, provider, mode);


--
-- Name: org_payment_accounts org_payment_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_payment_accounts
    ADD CONSTRAINT org_payment_accounts_pkey PRIMARY KEY (id);


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
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_pkey PRIMARY KEY (id);


--
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_unique UNIQUE (gift_id, period_date);


--
-- Name: org_pod_credentials org_pod_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pod_credentials
    ADD CONSTRAINT org_pod_credentials_pkey PRIMARY KEY (org_id);


--
-- Name: org_program_grants org_program_grants_org_user_id_program_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_org_user_id_program_id_key UNIQUE (org_user_id, program_id);


--
-- Name: org_program_grants org_program_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_pkey PRIMARY KEY (id);


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
-- Name: org_public_link_uses org_public_link_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_link_uses
    ADD CONSTRAINT org_public_link_uses_pkey PRIMARY KEY (id);


--
-- Name: org_public_links org_public_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links
    ADD CONSTRAINT org_public_links_pkey PRIMARY KEY (id);


--
-- Name: org_public_links org_public_links_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links
    ADD CONSTRAINT org_public_links_token_hash_key UNIQUE (token_hash);


--
-- Name: org_public_settings org_public_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_settings
    ADD CONSTRAINT org_public_settings_pkey PRIMARY KEY (org_id);


--
-- Name: org_record_notes org_record_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_record_notes
    ADD CONSTRAINT org_record_notes_pkey PRIMARY KEY (id);


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
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_acknowledgments
    ADD CONSTRAINT org_sponsor_acknowledgments_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments
    ADD CONSTRAINT org_sponsor_agreement_amendments_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_agreement_templates org_sponsor_agreement_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_templates
    ADD CONSTRAINT org_sponsor_agreement_templates_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_agreements org_sponsor_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_applications org_sponsor_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications
    ADD CONSTRAINT org_sponsor_applications_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_approvals org_sponsor_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_closings org_sponsor_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_postings
    ADD CONSTRAINT org_sponsor_fee_postings_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules
    ADD CONSTRAINT org_sponsor_fee_rules_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_sponsored_project_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules
    ADD CONSTRAINT org_sponsor_fee_rules_sponsored_project_id_effective_from_key UNIQUE (sponsored_project_id, effective_from);


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_recalls org_sponsor_recalls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_recalls
    ADD CONSTRAINT org_sponsor_recalls_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders
    ADD CONSTRAINT org_sponsor_report_reminders_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_report_id_reminder_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders
    ADD CONSTRAINT org_sponsor_report_reminders_report_id_reminder_kind_key UNIQUE (report_id, reminder_kind);


--
-- Name: org_sponsor_reports org_sponsor_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports
    ADD CONSTRAINT org_sponsor_reports_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_settings org_sponsor_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_pkey PRIMARY KEY (org_id);


--
-- Name: org_sponsor_statements org_sponsor_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements
    ADD CONSTRAINT org_sponsor_statements_pkey PRIMARY KEY (id);


--
-- Name: org_sponsor_statements org_sponsor_statements_sponsored_project_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements
    ADD CONSTRAINT org_sponsor_statements_sponsored_project_id_month_key UNIQUE (sponsored_project_id, month);


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
-- Name: payment_provider_events payment_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_events
    ADD CONSTRAINT payment_provider_events_pkey PRIMARY KEY (id);


--
-- Name: payment_provider_events payment_provider_events_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_events
    ADD CONSTRAINT payment_provider_events_provider_event_id_key UNIQUE (provider, event_id);


--
-- Name: pending_confirmations pending_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_confirmations
    ADD CONSTRAINT pending_confirmations_pkey PRIMARY KEY (id);


--
-- Name: platform_audit_failures platform_audit_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_failures
    ADD CONSTRAINT platform_audit_failures_pkey PRIMARY KEY (id);


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
-- Name: pod_share_challenges pod_share_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_share_challenges
    ADD CONSTRAINT pod_share_challenges_pkey PRIMARY KEY (id);


--
-- Name: representatives representatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representatives
    ADD CONSTRAINT representatives_pkey PRIMARY KEY (id);


--
-- Name: reviewer_access_links reviewer_access_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewer_access_links
    ADD CONSTRAINT reviewer_access_links_pkey PRIMARY KEY (id);


--
-- Name: reviewer_access_links reviewer_access_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewer_access_links
    ADD CONSTRAINT reviewer_access_links_token_key UNIQUE (token);


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
-- Name: idx_demo_visit_log_visited; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_visit_log_visited ON public.demo_visit_log USING btree (visited_at DESC);


--
-- Name: idx_demo_visit_log_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_visit_log_visitor ON public.demo_visit_log USING btree (visitor_hash);


--
-- Name: idx_inbound_debug_emails_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_debug_emails_created_at ON public.inbound_debug_emails USING btree (created_at);


--
-- Name: idx_local_event_attendance_user_attended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_local_event_attendance_user_attended ON public.local_event_attendance USING btree (user_id, attended);


--
-- Name: idx_membership_payments_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_payments_payment_date ON public.org_membership_payments USING btree (payment_date);


--
-- Name: idx_membership_tiers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_tiers_active ON public.org_membership_tiers USING btree (org_id, is_active) WHERE (is_active = true);


--
-- Name: idx_membership_tiers_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_tiers_org_id ON public.org_membership_tiers USING btree (org_id);


--
-- Name: idx_org_access_permissions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_access_permissions_org ON public.org_access_permissions USING btree (org_id);


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
-- Name: idx_org_accounts_one_unalloc_receipts_account_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_accounts_one_unalloc_receipts_account_per_org ON public.org_accounts USING btree (org_id) WHERE is_system_unallocated_receipts_account;


--
-- Name: idx_org_accounts_org_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_accounts_org_archived ON public.org_accounts USING btree (org_id) WHERE (archived_at IS NULL);


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
-- Name: idx_org_bank_recon_periods_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_bank_recon_periods_account ON public.org_bank_reconciliation_periods USING btree (org_id, bank_account_id, period_end);


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
-- Name: idx_org_budget_scenario_lines_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_scenario_lines_scenario ON public.org_budget_scenario_lines USING btree (scenario_id);


--
-- Name: idx_org_budget_scenarios_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_budget_scenarios_org_fy ON public.org_budget_scenarios USING btree (org_id, fiscal_year);


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
-- Name: idx_org_constituents_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_kind ON public.org_constituents USING btree (org_id, kind);


--
-- Name: idx_org_constituents_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_org ON public.org_constituents USING btree (org_id);


--
-- Name: idx_org_constituents_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_tags ON public.org_constituents USING gin (tags);


--
-- Name: idx_org_constituents_xero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_constituents_xero ON public.org_constituents USING btree (xero_contact_id) WHERE (xero_contact_id IS NOT NULL);


--
-- Name: idx_org_constituents_xero_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_constituents_xero_unique ON public.org_constituents USING btree (org_id, xero_contact_id) WHERE (xero_contact_id IS NOT NULL);


--
-- Name: idx_org_contact_roles_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_contact_roles_constituent ON public.org_contact_roles USING btree (constituent_id);


--
-- Name: idx_org_contact_roles_org_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_contact_roles_org_role ON public.org_contact_roles USING btree (org_id, role);


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
-- Name: idx_org_gift_pledge_installments_gift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gift_pledge_installments_gift ON public.org_gift_pledge_installments USING btree (gift_id);


--
-- Name: idx_org_gift_pledge_installments_org_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gift_pledge_installments_org_due ON public.org_gift_pledge_installments USING btree (org_id, due_date) WHERE (status = 'expected'::text);


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
-- Name: idx_org_gifts_posting_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_posting_status ON public.org_gifts USING btree (org_id, posting_status) WHERE (posting_status = 'unposted'::text);


--
-- Name: idx_org_gifts_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_received_at ON public.org_gifts USING btree (org_id, received_at DESC);


--
-- Name: idx_org_gifts_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_review ON public.org_gifts USING btree (org_id, review_status) WHERE (review_status = 'to_confirm'::text);


--
-- Name: idx_org_gifts_sponsored_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_gifts_sponsored_project ON public.org_gifts USING btree (sponsored_project_id) WHERE (sponsored_project_id IS NOT NULL);


--
-- Name: idx_org_gifts_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_gifts_stripe ON public.org_gifts USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_org_grant_alloc_requests_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_alloc_requests_grant ON public.org_grant_allocation_requests USING btree (grant_id, status);


--
-- Name: idx_org_grant_alloc_requests_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_alloc_requests_org ON public.org_grant_allocation_requests USING btree (org_id, status);


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
-- Name: idx_org_grant_allocations_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_grant_allocations_scenario ON public.org_grant_allocations USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_org_grant_allocations_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_grant_allocations_unique ON public.org_grant_allocations USING btree (grant_id, coop_program_id, fiscal_year, COALESCE(scenario_id, '-1'::integer));


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
-- Name: idx_org_indirect_cost_recovery_entries_org_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_indirect_cost_recovery_entries_org_grant ON public.org_indirect_cost_recovery_entries USING btree (org_id, grant_id);


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
-- Name: idx_org_ledger_lines_source_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_source_line ON public.org_ledger_lines USING btree (source_line_type, source_line_id) WHERE (source_line_type IS NOT NULL);


--
-- Name: idx_org_ledger_lines_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_lines_transaction ON public.org_ledger_lines USING btree (transaction_id);


--
-- Name: idx_org_ledger_transactions_constituent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_transactions_constituent ON public.org_ledger_transactions USING btree (org_id, constituent_id) WHERE (constituent_id IS NOT NULL);


--
-- Name: idx_org_ledger_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_transactions_date ON public.org_ledger_transactions USING btree (org_id, transaction_date);


--
-- Name: idx_org_ledger_transactions_org_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_ledger_transactions_org_fy ON public.org_ledger_transactions USING btree (org_id, fiscal_year);


--
-- Name: idx_org_personnel_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_personnel_scenario ON public.org_personnel USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_org_plaid_accounts_one_per_org_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_plaid_accounts_one_per_org_account ON public.org_plaid_accounts USING btree (org_account_id);


--
-- Name: idx_org_pledge_accretion_entries_org_gift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_pledge_accretion_entries_org_gift ON public.org_pledge_accretion_entries USING btree (org_id, gift_id);


--
-- Name: idx_org_program_grants_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_program_grants_org ON public.org_program_grants USING btree (org_id);


--
-- Name: idx_org_program_grants_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_program_grants_program ON public.org_program_grants USING btree (program_id);


--
-- Name: idx_org_program_grants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_program_grants_user ON public.org_program_grants USING btree (org_user_id);


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
-- Name: idx_org_record_notes_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_record_notes_record ON public.org_record_notes USING btree (org_id, record_type, record_id, created_at);


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
-- Name: idx_org_schedule_items_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_schedule_items_scenario ON public.org_schedule_items USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


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
-- Name: idx_pledge_installments_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pledge_installments_entry ON public.org_gift_pledge_installments USING btree (ledger_transaction_id) WHERE (ledger_transaction_id IS NOT NULL);


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
-- Name: idx_pod_share_challenges_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_share_challenges_permission ON public.pod_share_challenges USING btree (permission_id, created_at DESC);


--
-- Name: idx_reviewer_access_links_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviewer_access_links_token ON public.reviewer_access_links USING btree (token) WHERE (revoked_at IS NULL);


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
-- Name: org_bills_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_bills_number_unique ON public.org_bills USING btree (org_id, bill_number) WHERE (bill_number IS NOT NULL);


--
-- Name: org_gifts_sponsored_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_gifts_sponsored_project_idx ON public.org_gifts USING btree (org_id, sponsored_project_id) WHERE (sponsored_project_id IS NOT NULL);


--
-- Name: org_invoices_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_invoices_number_unique ON public.org_invoices USING btree (org_id, invoice_number) WHERE (invoice_number IS NOT NULL);


--
-- Name: org_membership_join_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_join_requests_status_idx ON public.org_membership_join_requests USING btree (org_id, status);


--
-- Name: org_membership_messages_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_messages_contact_idx ON public.org_membership_messages USING btree (org_id, constituent_id);


--
-- Name: org_membership_messages_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_messages_provider_idx ON public.org_membership_messages USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: org_membership_payments_processor_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_membership_payments_processor_ref_key ON public.org_membership_payments USING btree (processor_ref) WHERE (processor_ref IS NOT NULL);


--
-- Name: org_membership_payments_term_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_payments_term_idx ON public.org_membership_payments USING btree (term_id);


--
-- Name: org_membership_recognition_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_recognition_month_idx ON public.org_membership_recognition USING btree (org_id, month);


--
-- Name: org_membership_seats_open_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_membership_seats_open_key ON public.org_membership_seats USING btree (term_id, constituent_id) WHERE (ends_on IS NULL);


--
-- Name: org_membership_seats_term_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_seats_term_idx ON public.org_membership_seats USING btree (term_id);


--
-- Name: org_membership_terms_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_terms_contact_idx ON public.org_membership_terms USING btree (org_id, constituent_id);


--
-- Name: org_membership_terms_ends_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_terms_ends_idx ON public.org_membership_terms USING btree (org_id, ends_on);


--
-- Name: org_membership_terms_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_membership_terms_subscription_idx ON public.org_membership_terms USING btree (processor_subscription_ref) WHERE (processor_subscription_ref IS NOT NULL);


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
-- Name: org_public_link_uses_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_public_link_uses_link_idx ON public.org_public_link_uses USING btree (link_id, used_at);


--
-- Name: org_public_links_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_public_links_contact_idx ON public.org_public_links USING btree (constituent_id) WHERE (constituent_id IS NOT NULL);


--
-- Name: org_public_links_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_public_links_project_idx ON public.org_public_links USING btree (sponsored_project_id) WHERE (sponsored_project_id IS NOT NULL);


--
-- Name: org_sponsor_acknowledgments_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_acknowledgments_project_idx ON public.org_sponsor_acknowledgments USING btree (sponsored_project_id, item_key, acknowledged_on);


--
-- Name: org_sponsor_closings_one_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_sponsor_closings_one_live ON public.org_sponsor_closings USING btree (sponsored_project_id) WHERE (status <> 'void'::text);


--
-- Name: org_sponsor_fee_postings_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_fee_postings_project_idx ON public.org_sponsor_fee_postings USING btree (sponsored_project_id, period_end);


--
-- Name: org_sponsor_fee_rules_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_fee_rules_project_idx ON public.org_sponsor_fee_rules USING btree (sponsored_project_id, effective_from);


--
-- Name: org_sponsor_payment_requests_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_payment_requests_project_idx ON public.org_sponsor_payment_requests USING btree (sponsored_project_id, status);


--
-- Name: org_sponsor_recalls_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_recalls_project_idx ON public.org_sponsor_recalls USING btree (sponsored_project_id);


--
-- Name: org_sponsor_reports_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sponsor_reports_due_idx ON public.org_sponsor_reports USING btree (org_id, due_date) WHERE (received_at IS NULL);


--
-- Name: org_sponsor_reports_quarter_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_sponsor_reports_quarter_uq ON public.org_sponsor_reports USING btree (sponsored_project_id, period_end) WHERE (kind = 'project_quarterly'::text);


--
-- Name: org_sponsored_project_disbursements_property_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_sponsored_project_disbursements_property_uq ON public.org_sponsored_project_disbursements USING btree (property_gift_id) WHERE ((property_gift_id IS NOT NULL) AND (status <> 'void'::text));


--
-- Name: orgs_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orgs_external_id_key ON public.orgs USING btree (external_id);


--
-- Name: platform_audit_failures_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_audit_failures_open_idx ON public.platform_audit_failures USING btree (occurred_at) WHERE (reviewed_at IS NULL);


--
-- Name: pod_access_group_rules_category_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_access_group_rules_category_uniq ON public.pod_access_group_rules USING btree (org_id, category, group_id) WHERE (category IS NOT NULL);


--
-- Name: pod_access_group_rules_document_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_access_group_rules_document_uniq ON public.pod_access_group_rules USING btree (org_id, org_document_id, group_id) WHERE (org_document_id IS NOT NULL);


--
-- Name: pod_access_permissions_share_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_access_permissions_share_token_key ON public.pod_access_permissions USING btree (share_token) WHERE (share_token IS NOT NULL);


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
-- Name: uq_org_access_permissions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_access_permissions_open ON public.org_access_permissions USING btree (org_user_id, permission) WHERE (revoked_at IS NULL);


--
-- Name: uq_org_budget_scenario_lines_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_budget_scenario_lines_cell ON public.org_budget_scenario_lines USING btree (scenario_id, account_id, COALESCE(program_id, '-1'::integer), COALESCE(grant_id, '-1'::integer), month);


--
-- Name: uq_org_documents_record_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_documents_record_checksum ON public.org_documents USING btree (org_id, checksum_sha256, source_ref_type, source_ref_id) WHERE ((archived_at IS NULL) AND (source_ref_type IS NOT NULL));


--
-- Name: uq_org_documents_vault_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_documents_vault_checksum ON public.org_documents USING btree (org_id, checksum_sha256) WHERE ((archived_at IS NULL) AND (source_ref_type IS NULL));


--
-- Name: uq_org_fixed_assets_acquisition_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_fixed_assets_acquisition_txn ON public.org_fixed_assets USING btree (acquisition_ledger_transaction_id) WHERE (acquisition_ledger_transaction_id IS NOT NULL);


--
-- Name: uq_org_gifts_accounting_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_gifts_accounting_entry ON public.org_gifts USING btree (ledger_transaction_id) WHERE ((source = 'accounting'::text) AND (ledger_transaction_id IS NOT NULL));


--
-- Name: uq_org_ledger_one_live_entry_per_closing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_ledger_one_live_entry_per_closing ON public.org_ledger_transactions USING btree (org_id, source_ref_id) WHERE ((source_ref_type = 'org_sponsor_closings'::text) AND (status <> 'voided'::text));


--
-- Name: uq_org_ledger_one_live_entry_per_disbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_ledger_one_live_entry_per_disbursement ON public.org_ledger_transactions USING btree (org_id, source_ref_id) WHERE ((source_ref_type = 'org_sponsored_project_disbursements'::text) AND (status <> 'voided'::text));


--
-- Name: uq_org_ledger_one_live_entry_per_recall; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_ledger_one_live_entry_per_recall ON public.org_ledger_transactions USING btree (org_id, source_ref_id) WHERE ((source_ref_type = 'org_sponsor_recalls'::text) AND (status <> 'voided'::text));


--
-- Name: uq_org_ledger_one_live_reversal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_ledger_one_live_reversal ON public.org_ledger_transactions USING btree (org_id, reverses_transaction_id) WHERE ((reverses_transaction_id IS NOT NULL) AND (status <> 'voided'::text));


--
-- Name: uq_org_sponsor_one_live_disbursement_per_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_org_sponsor_one_live_disbursement_per_request ON public.org_sponsored_project_disbursements USING btree (payment_request_id) WHERE ((payment_request_id IS NOT NULL) AND (status <> 'void'::text));


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
-- Name: org_users trg_enforce_org_has_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_org_has_admin AFTER DELETE OR UPDATE ON public.org_users FOR EACH ROW EXECUTE FUNCTION public.enforce_org_has_admin();


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
-- Name: org_ledger_lines trg_ledger_lines_designation_equity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_lines_designation_equity BEFORE INSERT OR UPDATE OF board_designation_id, account_id ON public.org_ledger_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_designation_on_equity_line();


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
-- Name: org_access_permissions trg_org_access_permissions_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_access_permissions_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_access_permissions FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_accounts trg_org_accounts_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_accounts_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_accounts FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_actuals trg_org_actuals_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_actuals_posting_account BEFORE INSERT OR UPDATE OF org_account_id ON public.org_actuals FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_actuals();


--
-- Name: org_actuals trg_org_actuals_writer_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_actuals_writer_guard BEFORE INSERT OR UPDATE OF source, org_id ON public.org_actuals FOR EACH ROW EXECUTE FUNCTION public.org_enforce_actuals_source_writer();


--
-- Name: org_audit_log trg_org_audit_log_chain; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_audit_log_chain BEFORE INSERT ON public.org_audit_log FOR EACH ROW EXECUTE FUNCTION public.org_audit_log_chain();


--
-- Name: org_audit_log trg_org_audit_log_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_audit_log_immutable BEFORE DELETE OR UPDATE ON public.org_audit_log FOR EACH ROW EXECUTE FUNCTION public.org_audit_log_immutable();


--
-- Name: org_bank_reconciliation_periods trg_org_bank_reconciliation_periods_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_bank_reconciliation_periods_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_bank_reconciliation_periods FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_bank_rules trg_org_bank_rules_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_bank_rules_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_bank_rules FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_bill_credit_notes trg_org_bill_credit_notes_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_bill_credit_notes_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_bill_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_bill_payments trg_org_bill_payments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_bill_payments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_bill_payments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_bills trg_org_bills_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_bills_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_bills FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_board_designations trg_org_board_designations_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_board_designations_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_board_designations FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_budget_lines trg_org_budget_lines_posting_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_budget_lines_posting_account BEFORE INSERT OR UPDATE OF account_id ON public.org_budget_lines FOR EACH ROW EXECUTE FUNCTION public.org_enforce_posting_account_budget_lines();


--
-- Name: org_compliance_obligations trg_org_compliance_obligations_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_compliance_obligations_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_compliance_obligations FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_constituents trg_org_constituents_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_constituents_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_constituents FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_contact_roles trg_org_contact_roles_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_contact_roles_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_contact_roles FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_contact_roles trg_org_contact_roles_check_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_contact_roles_check_org BEFORE INSERT OR UPDATE ON public.org_contact_roles FOR EACH ROW EXECUTE FUNCTION public.org_contact_roles_check_org();


--
-- Name: org_conversion_balances trg_org_conversion_balances_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_conversion_balances_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_conversion_balances FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_documents trg_org_documents_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_documents_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_documents FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_documents trg_org_documents_keep_sponsor_doc_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_documents_keep_sponsor_doc_type BEFORE INSERT ON public.org_documents FOR EACH ROW EXECUTE FUNCTION public.org_documents_keep_sponsor_doc_type();


--
-- Name: org_expense_claim_payments trg_org_expense_claim_payments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_expense_claim_payments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_expense_claim_payments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_expense_claims trg_org_expense_claims_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_expense_claims_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_expense_claims FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_fiscal_year_locks trg_org_fiscal_year_locks_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_fiscal_year_locks_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_fiscal_year_locks FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_fixed_asset_depreciation_entries trg_org_fixed_asset_depreciation_entries_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_fixed_asset_depreciation_entries_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_fixed_asset_depreciation_entries FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_fixed_assets trg_org_fixed_assets_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_fixed_assets_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_fixed_assets FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_fringe_settings trg_org_fringe_settings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_fringe_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_fringe_settings FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_functional_classifications trg_org_functional_classifications_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_functional_classifications_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_functional_classifications FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_gift_pledge_installments trg_org_gift_pledge_installments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_gift_pledge_installments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_gift_pledge_installments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_gifts trg_org_gifts_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_gifts_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_gifts FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_grant_allocation_requests trg_org_grant_allocation_requests_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_grant_allocation_requests_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_grant_allocation_requests FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_grant_allocations trg_org_grant_allocations_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_grant_allocations_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_grant_allocations FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_grants trg_org_grants_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_grants_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_grants FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_indirect_cost_recovery_entries trg_org_indirect_cost_recovery_entries_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_indirect_cost_recovery_entries_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_indirect_cost_recovery_entries FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_invites trg_org_invites_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_invites_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_invites FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('token_hash');


--
-- Name: org_invoice_credit_notes trg_org_invoice_credit_notes_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_invoice_credit_notes_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_invoice_payments trg_org_invoice_payments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_invoice_payments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_invoices trg_org_invoices_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_invoices_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_invoices FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_ledger_lines trg_org_ledger_lines_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_ledger_lines_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_ledger_lines FOR EACH ROW EXECUTE FUNCTION public.org_audit_ledger_change();


--
-- Name: org_ledger_lines trg_org_ledger_lines_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_org_ledger_lines_balance AFTER INSERT OR DELETE OR UPDATE ON public.org_ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_transaction_balance();


--
-- Name: org_ledger_transactions trg_org_ledger_transactions_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_ledger_transactions_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_audit_ledger_change();


--
-- Name: org_ledger_transactions trg_org_ledger_transactions_contact_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_ledger_transactions_contact_same_org BEFORE INSERT OR UPDATE OF constituent_id, org_id ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_transaction_contact_same_org();


--
-- Name: org_ledger_transactions trg_org_ledger_transactions_reversal_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_ledger_transactions_reversal_same_org BEFORE INSERT OR UPDATE OF reverses_transaction_id, org_id ON public.org_ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.org_enforce_ledger_reversal_same_org();


--
-- Name: org_membership_join_requests trg_org_membership_join_requests_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_join_requests_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_join_requests FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('ip_hash');


--
-- Name: org_membership_payments trg_org_membership_payments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_payments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_payments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_membership_recognition trg_org_membership_recognition_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_recognition_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_recognition FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_membership_seats trg_org_membership_seats_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_seats_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_seats FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_membership_terms trg_org_membership_terms_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_terms_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_terms FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_membership_tier_prices trg_org_membership_tier_prices_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_tier_prices_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_tier_prices FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_membership_tiers trg_org_membership_tiers_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_membership_tiers_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_membership_tiers FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_payment_accounts trg_org_payment_accounts_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_payment_accounts_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_payment_accounts FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('secret_enc', 'secret_iv', 'secret_tag', 'webhook_secret_enc', 'webhook_secret_iv', 'webhook_secret_tag');


--
-- Name: org_personnel trg_org_personnel_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_personnel_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_personnel FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_plaid_accounts trg_org_plaid_accounts_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_plaid_accounts_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_plaid_accounts FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_plaid_items trg_org_plaid_items_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_plaid_items_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_plaid_items FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('access_token', 'cursor');


--
-- Name: org_pledge_accretion_entries trg_org_pledge_accretion_entries_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_pledge_accretion_entries_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_pledge_accretion_entries FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_program_grants trg_org_program_grants_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_program_grants_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_program_grants FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_programs trg_org_programs_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_programs_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_programs FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_public_links trg_org_public_links_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_public_links_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_public_links FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('token_hash');


--
-- Name: org_public_settings trg_org_public_settings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_public_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_public_settings FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('challenge_secret_enc', 'challenge_secret_iv', 'challenge_secret_tag');


--
-- Name: org_recurring_schedules trg_org_recurring_schedules_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_recurring_schedules_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_recurring_schedules FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_settings trg_org_settings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_settings FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('xero_token_data');


--
-- Name: org_settings trg_org_settings_recompute_actuals_on_source_flip; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_settings_recompute_actuals_on_source_flip AFTER UPDATE OF actuals_source ON public.org_settings FOR EACH ROW EXECUTE FUNCTION public.org_recompute_actuals_on_source_flip();


--
-- Name: org_sponsor_agreement_amendments trg_org_sponsor_agreement_amendments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_agreement_amendments_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_agreement_amendments FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_agreements trg_org_sponsor_agreements_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_agreements_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_agreements FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_applications trg_org_sponsor_applications_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_applications_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_applications FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_approvals trg_org_sponsor_approvals_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_approvals_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_approvals FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_closings trg_org_sponsor_closings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_closings_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_closings FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_fee_postings trg_org_sponsor_fee_postings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_fee_postings_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_fee_postings FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_fee_rules trg_org_sponsor_fee_rules_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_fee_rules_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_fee_rules FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_payment_requests trg_org_sponsor_payment_requests_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_payment_requests_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_payment_requests FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_recalls trg_org_sponsor_recalls_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_recalls_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_recalls FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_reports trg_org_sponsor_reports_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_reports_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_reports FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsor_statements trg_org_sponsor_statements_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsor_statements_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsor_statements FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsored_project_disbursements trg_org_sponsored_project_disbursements_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsored_project_disbursements_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsored_project_disbursements FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_sponsored_projects trg_org_sponsored_projects_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_sponsored_projects_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_sponsored_projects FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_users trg_org_users_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_users_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_users FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change();


--
-- Name: org_vendor_compliance trg_org_vendor_compliance_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_vendor_compliance_audit AFTER INSERT OR DELETE OR UPDATE ON public.org_vendor_compliance FOR EACH ROW EXECUTE FUNCTION public.org_audit_row_change('tax_id_encrypted');


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
-- Name: org_access_permissions org_access_permissions_given_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions
    ADD CONSTRAINT org_access_permissions_given_by_user_id_fkey FOREIGN KEY (given_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_access_permissions org_access_permissions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions
    ADD CONSTRAINT org_access_permissions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_access_permissions org_access_permissions_org_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions
    ADD CONSTRAINT org_access_permissions_org_user_id_fkey FOREIGN KEY (org_user_id) REFERENCES public.org_users(id) ON DELETE CASCADE;


--
-- Name: org_access_permissions org_access_permissions_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_access_permissions
    ADD CONSTRAINT org_access_permissions_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bank_reconciliation_periods
    ADD CONSTRAINT org_bank_reconciliation_periods_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: org_budget_scenario_lines org_budget_scenario_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines
    ADD CONSTRAINT org_budget_scenario_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id) ON DELETE CASCADE;


--
-- Name: org_budget_scenario_lines org_budget_scenario_lines_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines
    ADD CONSTRAINT org_budget_scenario_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_budget_scenario_lines org_budget_scenario_lines_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines
    ADD CONSTRAINT org_budget_scenario_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


--
-- Name: org_budget_scenario_lines org_budget_scenario_lines_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenario_lines
    ADD CONSTRAINT org_budget_scenario_lines_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.org_budget_scenarios(id) ON DELETE CASCADE;


--
-- Name: org_budget_scenarios org_budget_scenarios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenarios
    ADD CONSTRAINT org_budget_scenarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_budget_scenarios org_budget_scenarios_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_budget_scenarios
    ADD CONSTRAINT org_budget_scenarios_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


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
-- Name: org_contact_email_prefs org_contact_email_prefs_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_email_prefs
    ADD CONSTRAINT org_contact_email_prefs_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_contact_email_prefs org_contact_email_prefs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_email_prefs
    ADD CONSTRAINT org_contact_email_prefs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_contact_roles org_contact_roles_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_roles
    ADD CONSTRAINT org_contact_roles_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_contact_roles org_contact_roles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_contact_roles
    ADD CONSTRAINT org_contact_roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_conversion_balances org_conversion_balances_balancing_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_balancing_account_id_fkey FOREIGN KEY (balancing_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_conversion_balances org_conversion_balances_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_conversion_balances org_conversion_balances_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_conversion_balances org_conversion_balances_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_conversion_balances org_conversion_balances_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_conversion_balances org_conversion_balances_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_conversion_balances
    ADD CONSTRAINT org_conversion_balances_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_document_expectations org_document_expectations_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_expectations
    ADD CONSTRAINT org_document_expectations_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_document_retention_rules org_document_retention_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_retention_rules
    ADD CONSTRAINT org_document_retention_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


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
-- Name: org_fixed_assets org_fixed_assets_acquisition_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_acquisition_ledger_transaction_id_fkey FOREIGN KEY (acquisition_ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


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
-- Name: org_gift_pledge_installments org_gift_pledge_installments_gift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gift_pledge_installments
    ADD CONSTRAINT org_gift_pledge_installments_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.org_gifts(id) ON DELETE CASCADE;


--
-- Name: org_gift_pledge_installments org_gift_pledge_installments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gift_pledge_installments
    ADD CONSTRAINT org_gift_pledge_installments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


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
-- Name: org_gifts org_gifts_discounting_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_discounting_accepted_by_user_id_fkey FOREIGN KEY (discounting_accepted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_donor_letter_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_donor_letter_document_id_fkey FOREIGN KEY (donor_letter_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_in_kind_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_in_kind_expense_account_id_fkey FOREIGN KEY (in_kind_expense_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_gifts org_gifts_in_kind_revenue_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_in_kind_revenue_account_id_fkey FOREIGN KEY (in_kind_revenue_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_gifts org_gifts_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_gifts org_gifts_pledge_status_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_pledge_status_changed_by_fkey FOREIGN KEY (pledge_status_changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_gifts org_gifts_receivable_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_receivable_account_id_fkey FOREIGN KEY (receivable_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_gifts org_gifts_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_gifts org_gifts_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_gifts
    ADD CONSTRAINT org_gifts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: org_grant_allocation_requests org_grant_allocation_requests_coop_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_coop_program_id_fkey FOREIGN KEY (coop_program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE CASCADE;


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocation_requests
    ADD CONSTRAINT org_grant_allocation_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: org_grant_allocations org_grant_allocations_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grant_allocations
    ADD CONSTRAINT org_grant_allocations_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.org_budget_scenarios(id) ON DELETE CASCADE;


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
-- Name: org_grants org_grants_nicra_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_grants
    ADD CONSTRAINT org_grants_nicra_document_id_fkey FOREIGN KEY (nicra_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


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
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE CASCADE;


--
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_posted_by_fkey FOREIGN KEY (posted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_txn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


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
-- Name: org_ledger_transactions org_ledger_transactions_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ledger_transactions
    ADD CONSTRAINT org_ledger_transactions_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


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
-- Name: org_membership_directory_optin org_membership_directory_optin_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_directory_optin
    ADD CONSTRAINT org_membership_directory_optin_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_membership_directory_optin org_membership_directory_optin_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_directory_optin
    ADD CONSTRAINT org_membership_directory_optin_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_join_requests org_membership_join_requests_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_membership_join_requests org_membership_join_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_join_requests org_membership_join_requests_gift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.org_gifts(id) ON DELETE SET NULL;


--
-- Name: org_membership_join_requests org_membership_join_requests_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.org_public_links(id) ON DELETE SET NULL;


--
-- Name: org_membership_join_requests org_membership_join_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_join_requests org_membership_join_requests_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_membership_terms(id) ON DELETE SET NULL;


--
-- Name: org_membership_join_requests org_membership_join_requests_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_join_requests
    ADD CONSTRAINT org_membership_join_requests_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.org_membership_tiers(id);


--
-- Name: org_membership_messages org_membership_messages_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_membership_messages org_membership_messages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_messages org_membership_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_messages org_membership_messages_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_messages
    ADD CONSTRAINT org_membership_messages_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_membership_terms(id) ON DELETE CASCADE;


--
-- Name: org_membership_payments org_membership_payments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_payments org_membership_payments_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_membership_payments org_membership_payments_deposit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_deposit_account_id_fkey FOREIGN KEY (deposit_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_membership_payments org_membership_payments_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_membership_payments org_membership_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_payments org_membership_payments_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_payments org_membership_payments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_payments org_membership_payments_refund_of_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_refund_of_id_fkey FOREIGN KEY (refund_of_id) REFERENCES public.org_membership_payments(id);


--
-- Name: org_membership_payments org_membership_payments_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_payments
    ADD CONSTRAINT org_membership_payments_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_membership_terms(id) ON DELETE CASCADE;


--
-- Name: org_membership_recognition org_membership_recognition_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_membership_recognition org_membership_recognition_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_recognition org_membership_recognition_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_recognition org_membership_recognition_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_recognition
    ADD CONSTRAINT org_membership_recognition_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_membership_terms(id) ON DELETE CASCADE;


--
-- Name: org_membership_seats org_membership_seats_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats
    ADD CONSTRAINT org_membership_seats_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_membership_seats org_membership_seats_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats
    ADD CONSTRAINT org_membership_seats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_seats org_membership_seats_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats
    ADD CONSTRAINT org_membership_seats_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_seats org_membership_seats_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_seats
    ADD CONSTRAINT org_membership_seats_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_membership_terms(id) ON DELETE CASCADE;


--
-- Name: org_membership_settings org_membership_settings_contribution_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_contribution_account_id_fkey FOREIGN KEY (contribution_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_membership_settings org_membership_settings_default_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_default_program_id_fkey FOREIGN KEY (default_program_id) REFERENCES public.org_programs(id);


--
-- Name: org_membership_settings org_membership_settings_deferred_dues_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_deferred_dues_account_id_fkey FOREIGN KEY (deferred_dues_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_membership_settings org_membership_settings_dues_revenue_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_dues_revenue_account_id_fkey FOREIGN KEY (dues_revenue_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_membership_settings org_membership_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_settings org_membership_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_settings
    ADD CONSTRAINT org_membership_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_templates org_membership_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_templates
    ADD CONSTRAINT org_membership_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_templates org_membership_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_templates
    ADD CONSTRAINT org_membership_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_terms org_membership_terms_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_membership_terms org_membership_terms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_terms org_membership_terms_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_terms org_membership_terms_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.org_invoices(id) ON DELETE SET NULL;


--
-- Name: org_membership_terms org_membership_terms_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_terms org_membership_terms_renews_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_renews_term_id_fkey FOREIGN KEY (renews_term_id) REFERENCES public.org_membership_terms(id) ON DELETE SET NULL;


--
-- Name: org_membership_terms org_membership_terms_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_terms
    ADD CONSTRAINT org_membership_terms_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.org_membership_tiers(id);


--
-- Name: org_membership_tier_prices org_membership_tier_prices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices
    ADD CONSTRAINT org_membership_tier_prices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_membership_tier_prices org_membership_tier_prices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices
    ADD CONSTRAINT org_membership_tier_prices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_tier_prices org_membership_tier_prices_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tier_prices
    ADD CONSTRAINT org_membership_tier_prices_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.org_membership_tiers(id) ON DELETE CASCADE;


--
-- Name: org_membership_tiers org_membership_tiers_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_membership_tiers org_membership_tiers_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);


--
-- Name: org_membership_tiers org_membership_tiers_revenue_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_membership_tiers
    ADD CONSTRAINT org_membership_tiers_revenue_account_id_fkey FOREIGN KEY (revenue_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_payment_accounts org_payment_accounts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_payment_accounts
    ADD CONSTRAINT org_payment_accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_payment_accounts org_payment_accounts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_payment_accounts
    ADD CONSTRAINT org_payment_accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: org_personnel org_personnel_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_personnel
    ADD CONSTRAINT org_personnel_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.org_budget_scenarios(id) ON DELETE CASCADE;


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
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_gift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.org_gifts(id) ON DELETE CASCADE;


--
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_txn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_pod_credentials org_pod_credentials_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_pod_credentials
    ADD CONSTRAINT org_pod_credentials_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_program_grants org_program_grants_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_program_grants org_program_grants_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_program_grants org_program_grants_org_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_org_user_id_fkey FOREIGN KEY (org_user_id) REFERENCES public.org_users(id) ON DELETE CASCADE;


--
-- Name: org_program_grants org_program_grants_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_program_grants
    ADD CONSTRAINT org_program_grants_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE CASCADE;


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
-- Name: org_public_link_uses org_public_link_uses_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_link_uses
    ADD CONSTRAINT org_public_link_uses_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.org_public_links(id) ON DELETE CASCADE;


--
-- Name: org_public_link_uses org_public_link_uses_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_link_uses
    ADD CONSTRAINT org_public_link_uses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_public_links org_public_links_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links
    ADD CONSTRAINT org_public_links_constituent_id_fkey FOREIGN KEY (constituent_id) REFERENCES public.org_constituents(id) ON DELETE CASCADE;


--
-- Name: org_public_links org_public_links_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links
    ADD CONSTRAINT org_public_links_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_public_links org_public_links_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_links
    ADD CONSTRAINT org_public_links_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_public_settings org_public_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_public_settings
    ADD CONSTRAINT org_public_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_record_notes org_record_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_record_notes
    ADD CONSTRAINT org_record_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_record_notes org_record_notes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_record_notes
    ADD CONSTRAINT org_record_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


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
-- Name: org_schedule_items org_schedule_items_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedule_items
    ADD CONSTRAINT org_schedule_items_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.org_budget_scenarios(id) ON DELETE CASCADE;


--
-- Name: org_schedules org_schedules_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_schedules
    ADD CONSTRAINT org_schedules_coop_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_settings org_settings_default_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_default_bank_account_id_fkey FOREIGN KEY (default_bank_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_settings org_settings_default_individual_gift_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_default_individual_gift_account_id_fkey FOREIGN KEY (default_individual_gift_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_settings org_settings_default_pledge_receivable_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_default_pledge_receivable_account_id_fkey FOREIGN KEY (default_pledge_receivable_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_settings org_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_acknowledgments
    ADD CONSTRAINT org_sponsor_acknowledgments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_acknowledgments
    ADD CONSTRAINT org_sponsor_acknowledgments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_acknowledgments
    ADD CONSTRAINT org_sponsor_acknowledgments_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments
    ADD CONSTRAINT org_sponsor_agreement_amendments_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.org_sponsor_agreements(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments
    ADD CONSTRAINT org_sponsor_agreement_amendments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.org_documents(id);


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments
    ADD CONSTRAINT org_sponsor_agreement_amendments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_amendments
    ADD CONSTRAINT org_sponsor_agreement_amendments_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreement_templates org_sponsor_agreement_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreement_templates
    ADD CONSTRAINT org_sponsor_agreement_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreements org_sponsor_agreements_generated_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_generated_document_id_fkey FOREIGN KEY (generated_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_agreements org_sponsor_agreements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreements org_sponsor_agreements_signed_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_signed_document_id_fkey FOREIGN KEY (signed_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_agreements org_sponsor_agreements_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_agreements org_sponsor_agreements_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_agreements
    ADD CONSTRAINT org_sponsor_agreements_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.org_sponsor_agreement_templates(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_applications org_sponsor_applications_applicant_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications
    ADD CONSTRAINT org_sponsor_applications_applicant_constituent_id_fkey FOREIGN KEY (applicant_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_applications org_sponsor_applications_lead_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications
    ADD CONSTRAINT org_sponsor_applications_lead_constituent_id_fkey FOREIGN KEY (lead_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_applications org_sponsor_applications_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications
    ADD CONSTRAINT org_sponsor_applications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_applications org_sponsor_applications_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_applications
    ADD CONSTRAINT org_sponsor_applications_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_approvals org_sponsor_approvals_draft_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_draft_document_id_fkey FOREIGN KEY (draft_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_approvals org_sponsor_approvals_funder_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_funder_constituent_id_fkey FOREIGN KEY (funder_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_approvals org_sponsor_approvals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_approvals org_sponsor_approvals_signed_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_signed_document_id_fkey FOREIGN KEY (signed_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_approvals org_sponsor_approvals_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_approvals
    ADD CONSTRAINT org_sponsor_approvals_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_closings org_sponsor_closings_destination_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_destination_constituent_id_fkey FOREIGN KEY (destination_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_closings org_sponsor_closings_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_closings org_sponsor_closings_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_closings org_sponsor_closings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_closings org_sponsor_closings_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_closings
    ADD CONSTRAINT org_sponsor_closings_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_postings
    ADD CONSTRAINT org_sponsor_fee_postings_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_postings
    ADD CONSTRAINT org_sponsor_fee_postings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_postings
    ADD CONSTRAINT org_sponsor_fee_postings_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_amendment_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules
    ADD CONSTRAINT org_sponsor_fee_rules_amendment_document_id_fkey FOREIGN KEY (amendment_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules
    ADD CONSTRAINT org_sponsor_fee_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_fee_rules
    ADD CONSTRAINT org_sponsor_fee_rules_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_disbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_disbursement_id_fkey FOREIGN KEY (disbursement_id) REFERENCES public.org_sponsored_project_disbursements(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_payee_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_payee_constituent_id_fkey FOREIGN KEY (payee_constituent_id) REFERENCES public.org_constituents(id);


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_payment_requests
    ADD CONSTRAINT org_sponsor_payment_requests_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_recalls org_sponsor_recalls_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_recalls
    ADD CONSTRAINT org_sponsor_recalls_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_recalls org_sponsor_recalls_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_recalls
    ADD CONSTRAINT org_sponsor_recalls_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_recalls org_sponsor_recalls_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_recalls
    ADD CONSTRAINT org_sponsor_recalls_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders
    ADD CONSTRAINT org_sponsor_report_reminders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders
    ADD CONSTRAINT org_sponsor_report_reminders_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.org_sponsor_reports(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_report_reminders
    ADD CONSTRAINT org_sponsor_report_reminders_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_reports org_sponsor_reports_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports
    ADD CONSTRAINT org_sponsor_reports_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_reports org_sponsor_reports_funder_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports
    ADD CONSTRAINT org_sponsor_reports_funder_constituent_id_fkey FOREIGN KEY (funder_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_reports org_sponsor_reports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports
    ADD CONSTRAINT org_sponsor_reports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_reports org_sponsor_reports_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_reports
    ADD CONSTRAINT org_sponsor_reports_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_settings org_sponsor_settings_fee_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_fee_expense_account_id_fkey FOREIGN KEY (fee_expense_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_settings org_sponsor_settings_fee_income_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_fee_income_account_id_fkey FOREIGN KEY (fee_income_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_settings org_sponsor_settings_fee_income_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_fee_income_program_id_fkey FOREIGN KEY (fee_income_program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_settings org_sponsor_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_settings org_sponsor_settings_recall_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_recall_expense_account_id_fkey FOREIGN KEY (recall_expense_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_settings org_sponsor_settings_recall_income_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_settings
    ADD CONSTRAINT org_sponsor_settings_recall_income_account_id_fkey FOREIGN KEY (recall_income_account_id) REFERENCES public.org_accounts(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_statements org_sponsor_statements_generated_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements
    ADD CONSTRAINT org_sponsor_statements_generated_document_id_fkey FOREIGN KEY (generated_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


--
-- Name: org_sponsor_statements org_sponsor_statements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements
    ADD CONSTRAINT org_sponsor_statements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsor_statements org_sponsor_statements_sponsored_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsor_statements
    ADD CONSTRAINT org_sponsor_statements_sponsored_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disburse_grant_agreement_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disburse_grant_agreement_document_id_fkey FOREIGN KEY (grant_agreement_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


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
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_payee_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_payee_constituent_id_fkey FOREIGN KEY (payee_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_project_id_fkey FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_property_gift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_property_gift_id_fkey FOREIGN KEY (property_gift_id) REFERENCES public.org_gifts(id) ON DELETE RESTRICT;


--
-- Name: org_sponsored_project_disbursements org_sponsored_project_disbursements_request_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_project_disbursements
    ADD CONSTRAINT org_sponsored_project_disbursements_request_fk FOREIGN KEY (payment_request_id) REFERENCES public.org_sponsor_payment_requests(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_projects org_sponsored_projects_disbursement_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_disbursement_expense_account_id_fkey FOREIGN KEY (disbursement_expense_account_id) REFERENCES public.org_accounts(id);


--
-- Name: org_sponsored_projects org_sponsored_projects_lead_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_lead_constituent_id_fkey FOREIGN KEY (lead_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_projects org_sponsored_projects_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_projects org_sponsored_projects_receiving_constituent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_receiving_constituent_id_fkey FOREIGN KEY (receiving_constituent_id) REFERENCES public.org_constituents(id) ON DELETE SET NULL;


--
-- Name: org_sponsored_projects org_sponsored_projects_sponsor_coop_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_sponsor_coop_org_id_fkey FOREIGN KEY (sponsor_org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: org_sponsored_projects org_sponsored_projects_w9_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sponsored_projects
    ADD CONSTRAINT org_sponsored_projects_w9_document_id_fkey FOREIGN KEY (w9_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;


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
-- Name: payment_provider_events payment_provider_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_events
    ADD CONSTRAINT payment_provider_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE SET NULL;


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
-- Name: pod_share_challenges pod_share_challenges_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_share_challenges
    ADD CONSTRAINT pod_share_challenges_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;


--
-- Name: pod_share_challenges pod_share_challenges_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_share_challenges
    ADD CONSTRAINT pod_share_challenges_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.pod_access_permissions(id) ON DELETE CASCADE;


--
-- Name: reviewer_access_links reviewer_access_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewer_access_links
    ADD CONSTRAINT reviewer_access_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: compliance_extension_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_extension_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_extension_proposals compliance_extension_proposals_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_extension_proposals_org_isolation ON public.compliance_extension_proposals USING ((org_id = (current_setting('app.current_org_id'::text, true))::integer));


--
-- Name: compliance_extension_proposals compliance_extension_proposals_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_extension_proposals_program_scope ON public.compliance_extension_proposals AS RESTRICTIVE USING ((public.current_program_ids() IS NULL));


--
-- Name: org_access_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_access_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: org_access_permissions org_access_permissions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_access_permissions_org_isolation ON public.org_access_permissions USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


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
-- Name: org_actuals org_actuals_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_actuals_program_scope ON public.org_actuals AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (org_program_id = ANY (public.current_program_ids())) OR (org_activity_id = ANY (public.current_program_ids()))));


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
-- Name: org_allocation_lines org_allocation_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_allocation_lines_program_scope ON public.org_allocation_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


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
-- Name: org_bank_reconciliation_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bank_reconciliation_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bank_reconciliation_periods org_bank_reconciliation_periods_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_reconciliation_periods_org_isolation ON public.org_bank_reconciliation_periods USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bank_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_bank_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_bank_rules org_bank_rules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_rules_org_isolation ON public.org_bank_rules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_bank_rules org_bank_rules_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bank_rules_program_scope ON public.org_bank_rules AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (action_program_id = ANY (public.current_program_ids()))));


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
-- Name: org_bill_credit_notes org_bill_credit_notes_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bill_credit_notes_program_scope ON public.org_bill_credit_notes AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_bill_lines org_bill_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_bill_lines_program_scope ON public.org_bill_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_budget_lines org_budget_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_budget_lines_program_scope ON public.org_budget_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids())) OR (activity_id = ANY (public.current_program_ids()))));


--
-- Name: org_budget_scenario_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_budget_scenario_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: org_budget_scenario_lines org_budget_scenario_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_budget_scenario_lines_org_isolation ON public.org_budget_scenario_lines USING ((scenario_id IN ( SELECT org_budget_scenarios.id
   FROM public.org_budget_scenarios)));


--
-- Name: org_budget_scenario_lines org_budget_scenario_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_budget_scenario_lines_program_scope ON public.org_budget_scenario_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


--
-- Name: org_budget_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_budget_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: org_budget_scenarios org_budget_scenarios_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_budget_scenarios_org_isolation ON public.org_budget_scenarios USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_compliance_obligations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_compliance_obligations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_compliance_obligations org_compliance_obligations_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_compliance_obligations_program_scope ON public.org_compliance_obligations AS RESTRICTIVE USING ((public.current_program_ids() IS NULL));


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
-- Name: org_contact_email_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_contact_email_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: org_contact_email_prefs org_contact_email_prefs_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_contact_email_prefs_org_isolation ON public.org_contact_email_prefs USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_contact_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_contact_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: org_contact_roles org_contact_roles_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_contact_roles_org_isolation ON public.org_contact_roles USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_conversion_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_conversion_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: org_conversion_balances org_conversion_balances_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_conversion_balances_org_isolation ON public.org_conversion_balances USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_document_expectations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_document_expectations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_document_expectations org_document_expectations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_document_expectations_org_isolation ON public.org_document_expectations USING (((org_id IS NULL) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer))) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_document_retention_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_document_retention_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_document_retention_rules org_document_retention_rules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_document_retention_rules_org_isolation ON public.org_document_retention_rules USING (((org_id IS NULL) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer))) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


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
-- Name: org_expense_claim_lines org_expense_claim_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_expense_claim_lines_program_scope ON public.org_expense_claim_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_fixed_assets org_fixed_assets_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_fixed_assets_program_scope ON public.org_fixed_assets AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_gift_pledge_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_gift_pledge_installments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_gift_pledge_installments org_gift_pledge_installments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_gift_pledge_installments_org_isolation ON public.org_gift_pledge_installments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_gifts org_gifts_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_gifts_org_isolation ON public.org_gifts USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_gifts org_gifts_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_gifts_program_scope ON public.org_gifts AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


--
-- Name: org_grant_allocation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_grant_allocation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grant_allocation_requests_org_isolation ON public.org_grant_allocation_requests USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_grant_allocation_requests org_grant_allocation_requests_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grant_allocation_requests_program_scope ON public.org_grant_allocation_requests AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_grant_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_grant_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: org_grant_allocations org_grant_allocations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grant_allocations_org_isolation ON public.org_grant_allocations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_grant_allocations org_grant_allocations_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grant_allocations_program_scope ON public.org_grant_allocations AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: org_grants org_grants_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grants_org_isolation ON public.org_grants USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_grants org_grants_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_grants_program_scope ON public.org_grants AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (primary_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_import_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_import_history ENABLE ROW LEVEL SECURITY;

--
-- Name: org_import_history org_import_history_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_import_history_org_isolation ON public.org_import_history USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_indirect_cost_recovery_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_indirect_cost_recovery_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: org_indirect_cost_recovery_entries org_indirect_cost_recovery_entries_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_indirect_cost_recovery_entries_org_isolation ON public.org_indirect_cost_recovery_entries USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


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
-- Name: org_invoice_credit_notes org_invoice_credit_notes_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoice_credit_notes_program_scope ON public.org_invoice_credit_notes AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_invoice_lines org_invoice_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_invoice_lines_program_scope ON public.org_invoice_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_ledger_lines org_ledger_lines_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_ledger_lines_program_scope ON public.org_ledger_lines AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


--
-- Name: org_ledger_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ledger_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: org_ledger_transactions org_ledger_transactions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_ledger_transactions_org_isolation ON public.org_ledger_transactions USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_directory_optin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_directory_optin ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_directory_optin org_membership_directory_optin_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_directory_optin_org_isolation ON public.org_membership_directory_optin USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_join_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_join_requests org_membership_join_requests_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_join_requests_org_isolation ON public.org_membership_join_requests USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_messages org_membership_messages_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_messages_org_isolation ON public.org_membership_messages USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_payments org_membership_payments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_payments_org_isolation ON public.org_membership_payments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_recognition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_recognition ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_recognition org_membership_recognition_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_recognition_org_isolation ON public.org_membership_recognition USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_seats ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_seats org_membership_seats_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_seats_org_isolation ON public.org_membership_seats USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_settings org_membership_settings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_settings_org_isolation ON public.org_membership_settings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_templates org_membership_templates_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_templates_org_isolation ON public.org_membership_templates USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_terms org_membership_terms_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_terms_org_isolation ON public.org_membership_terms USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_tier_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_tier_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_tier_prices org_membership_tier_prices_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_tier_prices_org_isolation ON public.org_membership_tier_prices USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_membership_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: org_membership_tiers org_membership_tiers_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_tiers_program_scope ON public.org_membership_tiers AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


--
-- Name: org_compliance_obligations org_org_compliance_obligations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_compliance_obligations_org_isolation ON public.org_compliance_obligations USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_invites org_org_invites_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_invites_org_isolation ON public.org_invites USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_membership_tiers org_org_membership_tiers_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_org_membership_tiers_org_isolation ON public.org_membership_tiers USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_payment_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_payment_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_payment_accounts org_payment_accounts_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_payment_accounts_org_isolation ON public.org_payment_accounts USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


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
-- Name: org_personnel_allocations org_personnel_allocations_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_allocations_program_scope ON public.org_personnel_allocations AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_personnel_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_personnel_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_personnel_changes org_personnel_changes_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_changes_org_isolation ON public.org_personnel_changes USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_personnel_changes org_personnel_changes_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_changes_program_scope ON public.org_personnel_changes AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_personnel_allocations a
  WHERE ((a.coop_personnel_id = org_personnel_changes.coop_personnel_id) AND (a.coop_program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_personnel org_personnel_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_org_isolation ON public.org_personnel USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_personnel org_personnel_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_personnel_program_scope ON public.org_personnel AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_personnel_allocations a
  WHERE ((a.coop_personnel_id = org_personnel.id) AND (a.coop_program_id = ANY (public.current_program_ids())))))));


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
-- Name: org_pledge_accretion_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_pledge_accretion_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: org_pledge_accretion_entries org_pledge_accretion_entries_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_pledge_accretion_entries_org_isolation ON public.org_pledge_accretion_entries USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_pod_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_pod_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: org_pod_credentials org_pod_credentials_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_pod_credentials_org_isolation ON public.org_pod_credentials USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_program_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_program_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: org_program_grants org_program_grants_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_program_grants_org_isolation ON public.org_program_grants USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_program_grants org_program_grants_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_program_grants_program_scope ON public.org_program_grants AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_projections org_projections_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_projections_program_scope ON public.org_projections AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_public_link_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_public_link_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: org_public_link_uses org_public_link_uses_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_public_link_uses_org_isolation ON public.org_public_link_uses USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_public_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_public_links ENABLE ROW LEVEL SECURITY;

--
-- Name: org_public_links org_public_links_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_public_links_org_isolation ON public.org_public_links USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_public_links org_public_links_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_public_links_program_scope ON public.org_public_links AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (sponsored_project_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_public_links.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_public_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_public_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_public_settings org_public_settings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_public_settings_org_isolation ON public.org_public_settings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_record_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_record_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_record_notes org_record_notes_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_record_notes_org_isolation ON public.org_record_notes USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


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
-- Name: org_schedule_item_allocations org_schedule_item_allocations_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedule_item_allocations_program_scope ON public.org_schedule_item_allocations AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


--
-- Name: org_schedule_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_schedule_items ENABLE ROW LEVEL SECURITY;

--
-- Name: org_schedule_items org_schedule_items_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedule_items_org_isolation ON public.org_schedule_items USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_schedule_items org_schedule_items_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_schedule_items_program_scope ON public.org_schedule_items AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_sponsor_acknowledgments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_acknowledgments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_acknowledgments_org_isolation ON public.org_sponsor_acknowledgments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_acknowledgments org_sponsor_acknowledgments_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_acknowledgments_program_scope ON public.org_sponsor_acknowledgments AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_acknowledgments.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_agreement_amendments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_agreement_amendments ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_agreement_amendments_org_isolation ON public.org_sponsor_agreement_amendments USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_agreement_amendments org_sponsor_agreement_amendments_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_agreement_amendments_program_scope ON public.org_sponsor_agreement_amendments AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_agreement_amendments.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_agreement_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_agreement_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_agreement_templates org_sponsor_agreement_templates_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_agreement_templates_org_isolation ON public.org_sponsor_agreement_templates USING (((org_id IS NULL) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer))) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_agreements org_sponsor_agreements_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_agreements_org_isolation ON public.org_sponsor_agreements USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_agreements org_sponsor_agreements_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_agreements_program_scope ON public.org_sponsor_agreements AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_agreements.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_applications org_sponsor_applications_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_applications_org_isolation ON public.org_sponsor_applications USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_approvals org_sponsor_approvals_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_approvals_org_isolation ON public.org_sponsor_approvals USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_approvals org_sponsor_approvals_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_approvals_program_scope ON public.org_sponsor_approvals AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_approvals.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_closings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_closings org_sponsor_closings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_closings_org_isolation ON public.org_sponsor_closings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_closings org_sponsor_closings_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_closings_program_scope ON public.org_sponsor_closings AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_closings.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_fee_postings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_fee_postings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_fee_postings_org_isolation ON public.org_sponsor_fee_postings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_fee_postings org_sponsor_fee_postings_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_fee_postings_program_scope ON public.org_sponsor_fee_postings AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_fee_postings.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_fee_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_fee_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_fee_rules_org_isolation ON public.org_sponsor_fee_rules USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_fee_rules org_sponsor_fee_rules_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_fee_rules_program_scope ON public.org_sponsor_fee_rules AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_fee_rules.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_payment_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_payment_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_payment_requests_org_isolation ON public.org_sponsor_payment_requests USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_payment_requests org_sponsor_payment_requests_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_payment_requests_program_scope ON public.org_sponsor_payment_requests AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_payment_requests.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_recalls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_recalls ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_recalls org_sponsor_recalls_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_recalls_org_isolation ON public.org_sponsor_recalls USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_recalls org_sponsor_recalls_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_recalls_program_scope ON public.org_sponsor_recalls AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_recalls.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_report_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_report_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_report_reminders_org_isolation ON public.org_sponsor_report_reminders USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_report_reminders org_sponsor_report_reminders_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_report_reminders_program_scope ON public.org_sponsor_report_reminders AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_report_reminders.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_reports org_sponsor_reports_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_reports_org_isolation ON public.org_sponsor_reports USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_reports org_sponsor_reports_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_reports_program_scope ON public.org_sponsor_reports AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_reports.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


--
-- Name: org_sponsor_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_settings org_sponsor_settings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_settings_org_isolation ON public.org_sponsor_settings USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_statements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sponsor_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sponsor_statements org_sponsor_statements_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_statements_org_isolation ON public.org_sponsor_statements USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer)) WITH CHECK ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_sponsor_statements org_sponsor_statements_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsor_statements_program_scope ON public.org_sponsor_statements AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.org_sponsored_projects p
  WHERE ((p.id = org_sponsor_statements.sponsored_project_id) AND (p.program_id = ANY (public.current_program_ids())))))));


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
-- Name: org_sponsored_projects org_sponsored_projects_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sponsored_projects_program_scope ON public.org_sponsored_projects AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (program_id = ANY (public.current_program_ids()))));


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
-- Name: org_vendor_compliance org_vendor_compliance_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_vendor_compliance_program_scope ON public.org_vendor_compliance AS RESTRICTIVE USING ((public.current_program_ids() IS NULL));


--
-- Name: org_xero_program_track_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_xero_program_track_map ENABLE ROW LEVEL SECURITY;

--
-- Name: org_xero_program_track_map org_xero_program_track_map_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_xero_program_track_map_org_isolation ON public.org_xero_program_track_map USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: org_xero_program_track_map org_xero_program_track_map_program_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_xero_program_track_map_program_scope ON public.org_xero_program_track_map AS RESTRICTIVE USING (((public.current_program_ids() IS NULL) OR (coop_program_id = ANY (public.current_program_ids()))));


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
-- Name: pod_share_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_share_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_share_challenges pod_share_challenges_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_share_challenges_org_isolation ON public.pod_share_challenges USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO causal_app;


--
-- Name: FUNCTION accounting_entry_reminders_due(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accounting_entry_reminders_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.accounting_entry_reminders_due() TO causal_app;


--
-- Name: FUNCTION admin_delete_org(p_org_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_org(p_org_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_org(p_org_id integer) TO causal_app;


--
-- Name: FUNCTION admin_delete_user(p_user_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_user(p_user_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_user(p_user_id integer) TO causal_app;


--
-- Name: FUNCTION admin_list_orgs_with_member_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_list_orgs_with_member_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_orgs_with_member_counts() TO causal_app;


--
-- Name: FUNCTION admin_list_orgs_with_pod_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_list_orgs_with_pod_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_orgs_with_pod_status() TO causal_app;


--
-- Name: FUNCTION bootstrap_demo_org_membership(p_user_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bootstrap_demo_org_membership(p_user_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bootstrap_demo_org_membership(p_user_id integer) TO causal_app;


--
-- Name: FUNCTION claim_due_pod_acr_outbox_rows(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer) TO causal_app;


--
-- Name: FUNCTION demo_org_reset_tables(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.demo_org_reset_tables() FROM PUBLIC;
GRANT ALL ON FUNCTION public.demo_org_reset_tables() TO causal_app;


--
-- Name: FUNCTION documents_due_for_local_purge(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.documents_due_for_local_purge(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.documents_due_for_local_purge(p_limit integer) TO causal_app;


--
-- Name: FUNCTION enforce_org_has_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_org_has_admin() FROM PUBLIC;


--
-- Name: FUNCTION expire_due_pod_permissions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_due_pod_permissions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_due_pod_permissions() TO causal_app;


--
-- Name: FUNCTION get_document_purge_status(p_document_id integer, p_org_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_document_purge_status(p_document_id integer, p_org_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_document_purge_status(p_document_id integer, p_org_id integer) TO causal_app;


--
-- Name: FUNCTION mark_document_local_copy_purged(p_document_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_document_local_copy_purged(p_document_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_document_local_copy_purged(p_document_id integer) TO causal_app;


--
-- Name: FUNCTION org_allow_ledger_source(p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_allow_ledger_source(p_source text) FROM PUBLIC;


--
-- Name: FUNCTION org_apply_sponsor_report_holds(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_apply_sponsor_report_holds() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_apply_sponsor_report_holds() TO causal_app;


--
-- Name: FUNCTION org_audit_ledger_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_audit_ledger_change() FROM PUBLIC;


--
-- Name: FUNCTION org_audit_row_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_audit_row_change() FROM PUBLIC;


--
-- Name: TABLE org_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.org_audit_log TO causal_app;


--
-- Name: FUNCTION org_audit_verify(p_org_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_audit_verify(p_org_id integer) FROM PUBLIC;


--
-- Name: FUNCTION org_claim_sponsor_report_reminders(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_claim_sponsor_report_reminders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_claim_sponsor_report_reminders() TO causal_app;


--
-- Name: FUNCTION org_claim_sponsor_statements(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_claim_sponsor_statements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_claim_sponsor_statements() TO causal_app;


--
-- Name: FUNCTION org_enforce_ledger_lines_same_org(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_enforce_ledger_lines_same_org() FROM PUBLIC;


--
-- Name: FUNCTION org_generate_sponsor_quarterly_reports(p_due_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_generate_sponsor_quarterly_reports(p_due_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_generate_sponsor_quarterly_reports(p_due_days integer) TO causal_app;


--
-- Name: FUNCTION org_mark_sponsor_report_reminder(p_id integer, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_mark_sponsor_report_reminder(p_id integer, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_mark_sponsor_report_reminder(p_id integer, p_status text) TO causal_app;


--
-- Name: FUNCTION org_membership_message_event(p_message_id text, p_kind text, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_membership_message_event(p_message_id text, p_kind text, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_membership_message_event(p_message_id text, p_kind text, p_at timestamp with time zone) TO causal_app;


--
-- Name: FUNCTION org_membership_workspaces(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_membership_workspaces() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_membership_workspaces() TO causal_app;


--
-- Name: FUNCTION org_next_recurring_occurrence(p_current date, p_frequency text, p_active_months smallint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_next_recurring_occurrence(p_current date, p_frequency text, p_active_months smallint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_next_recurring_occurrence(p_current date, p_frequency text, p_active_months smallint[]) TO causal_app;


--
-- Name: FUNCTION org_run_due_recurring_schedules(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_run_due_recurring_schedules() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_run_due_recurring_schedules() TO causal_app;


--
-- Name: FUNCTION org_sponsor_enable_rls(p_table text, p_with_project boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_sponsor_enable_rls(p_table text, p_with_project boolean) FROM PUBLIC;


--
-- Name: FUNCTION resolve_invite_by_id(p_invite_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_invite_by_id(p_invite_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_invite_by_id(p_invite_id integer) TO causal_app;


--
-- Name: FUNCTION resolve_invite_by_token(p_token_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_invite_by_token(p_token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_invite_by_token(p_token_hash text) TO causal_app;


--
-- Name: FUNCTION resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean) TO causal_app;


--
-- Name: FUNCTION resolve_member_org_id_and_role(p_user_id integer, p_slug text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_member_org_id_and_role(p_user_id integer, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_member_org_id_and_role(p_user_id integer, p_slug text) TO causal_app;


--
-- Name: FUNCTION resolve_org_pod_credential(p_org_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_org_pod_credential(p_org_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_org_pod_credential(p_org_id integer) TO causal_app;


--
-- Name: FUNCTION resolve_pending_invites_for_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_pending_invites_for_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_pending_invites_for_email(p_email text) TO causal_app;


--
-- Name: TABLE org_plaid_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_plaid_items TO causal_app;


--
-- Name: FUNCTION resolve_plaid_item_by_item_id(p_item_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_plaid_item_by_item_id(p_item_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_plaid_item_by_item_id(p_item_id text) TO causal_app;


--
-- Name: FUNCTION resolve_pod_share(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_pod_share(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_pod_share(p_token text) TO causal_app;


--
-- Name: FUNCTION resolve_user_org_ids(p_user_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_user_org_ids(p_user_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_user_org_ids(p_user_id integer) TO causal_app;


--
-- Name: FUNCTION restore_demo_org(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.restore_demo_org() FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_demo_org() TO causal_app;


--
-- Name: FUNCTION snapshot_demo_org(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.snapshot_demo_org() FROM PUBLIC;
GRANT ALL ON FUNCTION public.snapshot_demo_org() TO causal_app;


--
-- Name: FUNCTION store_org_pod_credential(p_org_id integer, p_account_email text, p_encrypted_password text, p_encryption_iv text, p_encryption_auth_tag text, p_pod_webid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.store_org_pod_credential(p_org_id integer, p_account_email text, p_encrypted_password text, p_encryption_iv text, p_encryption_auth_tag text, p_pod_webid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.store_org_pod_credential(p_org_id integer, p_account_email text, p_encrypted_password text, p_encryption_iv text, p_encryption_auth_tag text, p_pod_webid text) TO causal_app;


--
-- Name: TABLE accounting_review_entry; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounting_review_entry TO causal_app;


--
-- Name: TABLE actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.actions TO causal_app;


--
-- Name: SEQUENCE actions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.actions_id_seq TO causal_app;


--
-- Name: TABLE allowed_emails; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.allowed_emails TO causal_app;


--
-- Name: TABLE bank_pledges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bank_pledges TO causal_app;


--
-- Name: SEQUENCE bank_pledges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.bank_pledges_id_seq TO causal_app;


--
-- Name: TABLE bank_pressure_actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bank_pressure_actions TO causal_app;


--
-- Name: SEQUENCE bank_pressure_actions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.bank_pressure_actions_id_seq TO causal_app;


--
-- Name: TABLE causal_service_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.causal_service_credentials TO causal_app;


--
-- Name: TABLE compliance_extension_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.compliance_extension_proposals TO causal_app;


--
-- Name: SEQUENCE compliance_extension_proposals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.compliance_extension_proposals_id_seq TO causal_app;


--
-- Name: TABLE compliance_template_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.compliance_template_items TO causal_app;


--
-- Name: SEQUENCE compliance_template_items_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.compliance_template_items_id_seq TO causal_app;


--
-- Name: TABLE contributions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contributions TO causal_app;


--
-- Name: SEQUENCE contributions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.contributions_id_seq TO causal_app;


--
-- Name: TABLE coop_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.coop_members TO causal_app;


--
-- Name: SEQUENCE coop_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.coop_members_id_seq TO causal_app;


--
-- Name: TABLE coop_pod_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.coop_pod_credentials TO causal_app;


--
-- Name: TABLE cooperative_library_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cooperative_library_items TO causal_app;


--
-- Name: SEQUENCE cooperative_library_items_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.cooperative_library_items_id_seq TO causal_app;


--
-- Name: TABLE cooperative_library_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cooperative_library_submissions TO causal_app;


--
-- Name: SEQUENCE cooperative_library_submissions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.cooperative_library_submissions_id_seq TO causal_app;


--
-- Name: TABLE cooperative_work_library_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cooperative_work_library_items TO causal_app;


--
-- Name: SEQUENCE cooperative_work_library_items_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.cooperative_work_library_items_id_seq TO causal_app;


--
-- Name: TABLE cooperative_work_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cooperative_work_requests TO causal_app;


--
-- Name: SEQUENCE cooperative_work_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.cooperative_work_requests_id_seq TO causal_app;


--
-- Name: TABLE demo_visit_excluded; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.demo_visit_excluded TO causal_app;


--
-- Name: TABLE demo_visit_key; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.demo_visit_key TO causal_app;


--
-- Name: TABLE demo_visit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.demo_visit_log TO causal_app;


--
-- Name: SEQUENCE demo_visit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.demo_visit_log_id_seq TO causal_app;


--
-- Name: TABLE financial_rep_pledges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.financial_rep_pledges TO causal_app;


--
-- Name: SEQUENCE financial_rep_pledges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.financial_rep_pledges_id_seq TO causal_app;


--
-- Name: TABLE inbound_debug_emails; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inbound_debug_emails TO causal_app;


--
-- Name: SEQUENCE inbound_debug_emails_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.inbound_debug_emails_id_seq TO causal_app;


--
-- Name: TABLE local_event_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.local_event_attendance TO causal_app;


--
-- Name: SEQUENCE local_event_attendance_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.local_event_attendance_id_seq TO causal_app;


--
-- Name: TABLE org_access_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_access_permissions TO causal_app;


--
-- Name: SEQUENCE org_access_permissions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_access_permissions_id_seq TO causal_app;


--
-- Name: TABLE org_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_accounts TO causal_app;


--
-- Name: SEQUENCE org_accounts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_accounts_id_seq TO causal_app;


--
-- Name: TABLE org_actuals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_actuals TO causal_app;


--
-- Name: SEQUENCE org_actuals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_actuals_id_seq TO causal_app;


--
-- Name: TABLE org_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_aliases TO causal_app;


--
-- Name: SEQUENCE org_aliases_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_aliases_id_seq TO causal_app;


--
-- Name: TABLE org_allocation_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_allocation_lines TO causal_app;


--
-- Name: SEQUENCE org_allocation_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_allocation_lines_id_seq TO causal_app;


--
-- Name: TABLE org_allocation_monthly; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_allocation_monthly TO causal_app;


--
-- Name: SEQUENCE org_allocation_monthly_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_allocation_monthly_id_seq TO causal_app;


--
-- Name: TABLE org_allocation_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_allocation_schedules TO causal_app;


--
-- Name: SEQUENCE org_allocation_schedules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_allocation_schedules_id_seq TO causal_app;


--
-- Name: SEQUENCE org_audit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_audit_log_id_seq TO causal_app;


--
-- Name: TABLE org_balance_sheet_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_balance_sheet_snapshots TO causal_app;


--
-- Name: SEQUENCE org_balance_sheet_snapshots_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_balance_sheet_snapshots_id_seq TO causal_app;


--
-- Name: TABLE org_bank_reconciliation_periods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bank_reconciliation_periods TO causal_app;


--
-- Name: SEQUENCE org_bank_reconciliation_periods_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bank_reconciliation_periods_id_seq TO causal_app;


--
-- Name: TABLE org_bank_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bank_rules TO causal_app;


--
-- Name: SEQUENCE org_bank_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bank_rules_id_seq TO causal_app;


--
-- Name: TABLE org_bank_statement_line_postings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bank_statement_line_postings TO causal_app;


--
-- Name: SEQUENCE org_bank_statement_line_postings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bank_statement_line_postings_id_seq TO causal_app;


--
-- Name: TABLE org_bank_statement_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bank_statement_lines TO causal_app;


--
-- Name: SEQUENCE org_bank_statement_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bank_statement_lines_id_seq TO causal_app;


--
-- Name: TABLE org_bill_credit_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bill_credit_notes TO causal_app;


--
-- Name: SEQUENCE org_bill_credit_notes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bill_credit_notes_id_seq TO causal_app;


--
-- Name: TABLE org_bill_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bill_lines TO causal_app;


--
-- Name: SEQUENCE org_bill_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bill_lines_id_seq TO causal_app;


--
-- Name: TABLE org_bill_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bill_payments TO causal_app;


--
-- Name: SEQUENCE org_bill_payments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bill_payments_id_seq TO causal_app;


--
-- Name: TABLE org_bills; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_bills TO causal_app;


--
-- Name: SEQUENCE org_bills_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_bills_id_seq TO causal_app;


--
-- Name: TABLE org_board_designations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_board_designations TO causal_app;


--
-- Name: SEQUENCE org_board_designations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_board_designations_id_seq TO causal_app;


--
-- Name: TABLE org_budget_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_budget_lines TO causal_app;


--
-- Name: SEQUENCE org_budget_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_budget_lines_id_seq TO causal_app;


--
-- Name: TABLE org_budget_scenario_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_budget_scenario_lines TO causal_app;


--
-- Name: SEQUENCE org_budget_scenario_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_budget_scenario_lines_id_seq TO causal_app;


--
-- Name: TABLE org_budget_scenarios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_budget_scenarios TO causal_app;


--
-- Name: SEQUENCE org_budget_scenarios_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_budget_scenarios_id_seq TO causal_app;


--
-- Name: TABLE org_compliance_obligations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_compliance_obligations TO causal_app;


--
-- Name: SEQUENCE org_compliance_obligations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_compliance_obligations_id_seq TO causal_app;


--
-- Name: TABLE org_constituent_interactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_constituent_interactions TO causal_app;


--
-- Name: SEQUENCE org_constituent_interactions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_constituent_interactions_id_seq TO causal_app;


--
-- Name: TABLE org_constituents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_constituents TO causal_app;


--
-- Name: SEQUENCE org_constituents_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_constituents_id_seq TO causal_app;


--
-- Name: TABLE org_contact_email_prefs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_contact_email_prefs TO causal_app;


--
-- Name: SEQUENCE org_contact_email_prefs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_contact_email_prefs_id_seq TO causal_app;


--
-- Name: TABLE org_contact_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_contact_roles TO causal_app;


--
-- Name: SEQUENCE org_contact_roles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_contact_roles_id_seq TO causal_app;


--
-- Name: TABLE org_conversion_balances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_conversion_balances TO causal_app;


--
-- Name: SEQUENCE org_conversion_balances_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_conversion_balances_id_seq TO causal_app;


--
-- Name: TABLE org_document_expectations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_document_expectations TO causal_app;


--
-- Name: SEQUENCE org_document_expectations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_document_expectations_id_seq TO causal_app;


--
-- Name: TABLE org_document_retention_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_document_retention_rules TO causal_app;


--
-- Name: SEQUENCE org_document_retention_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_document_retention_rules_id_seq TO causal_app;


--
-- Name: TABLE org_documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_documents TO causal_app;


--
-- Name: SEQUENCE org_documents_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_documents_id_seq TO causal_app;


--
-- Name: TABLE org_donation_url_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_donation_url_suggestions TO causal_app;


--
-- Name: SEQUENCE org_donation_url_suggestions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_donation_url_suggestions_id_seq TO causal_app;


--
-- Name: TABLE org_expense_claim_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_expense_claim_lines TO causal_app;


--
-- Name: SEQUENCE org_expense_claim_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_expense_claim_lines_id_seq TO causal_app;


--
-- Name: TABLE org_expense_claim_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_expense_claim_messages TO causal_app;


--
-- Name: SEQUENCE org_expense_claim_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_expense_claim_messages_id_seq TO causal_app;


--
-- Name: TABLE org_expense_claim_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_expense_claim_payments TO causal_app;


--
-- Name: SEQUENCE org_expense_claim_payments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_expense_claim_payments_id_seq TO causal_app;


--
-- Name: TABLE org_expense_claims; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_expense_claims TO causal_app;


--
-- Name: SEQUENCE org_expense_claims_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_expense_claims_id_seq TO causal_app;


--
-- Name: TABLE org_fiscal_year_locks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_fiscal_year_locks TO causal_app;


--
-- Name: SEQUENCE org_fiscal_year_locks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_fiscal_year_locks_id_seq TO causal_app;


--
-- Name: TABLE org_fixed_asset_depreciation_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_fixed_asset_depreciation_entries TO causal_app;


--
-- Name: SEQUENCE org_fixed_asset_depreciation_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_fixed_asset_depreciation_entries_id_seq TO causal_app;


--
-- Name: TABLE org_fixed_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_fixed_assets TO causal_app;


--
-- Name: SEQUENCE org_fixed_assets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_fixed_assets_id_seq TO causal_app;


--
-- Name: TABLE org_fringe_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_fringe_settings TO causal_app;


--
-- Name: SEQUENCE org_fringe_settings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_fringe_settings_id_seq TO causal_app;


--
-- Name: TABLE org_functional_classifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_functional_classifications TO causal_app;


--
-- Name: SEQUENCE org_functional_classifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_functional_classifications_id_seq TO causal_app;


--
-- Name: TABLE org_gift_pledge_installments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_gift_pledge_installments TO causal_app;


--
-- Name: SEQUENCE org_gift_pledge_installments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_gift_pledge_installments_id_seq TO causal_app;


--
-- Name: TABLE org_gifts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_gifts TO causal_app;


--
-- Name: SEQUENCE org_gifts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_gifts_id_seq TO causal_app;


--
-- Name: TABLE org_grant_allocation_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_grant_allocation_requests TO causal_app;


--
-- Name: SEQUENCE org_grant_allocation_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_grant_allocation_requests_id_seq TO causal_app;


--
-- Name: TABLE org_grant_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_grant_allocations TO causal_app;


--
-- Name: SEQUENCE org_grant_allocations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_grant_allocations_id_seq TO causal_app;


--
-- Name: TABLE org_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_grants TO causal_app;


--
-- Name: SEQUENCE org_grants_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_grants_id_seq TO causal_app;


--
-- Name: TABLE org_import_history; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_import_history TO causal_app;


--
-- Name: SEQUENCE org_import_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_import_history_id_seq TO causal_app;


--
-- Name: TABLE org_indirect_cost_recovery_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_indirect_cost_recovery_entries TO causal_app;


--
-- Name: SEQUENCE org_indirect_cost_recovery_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_indirect_cost_recovery_entries_id_seq TO causal_app;


--
-- Name: TABLE org_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_invites TO causal_app;


--
-- Name: SEQUENCE org_invites_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_invites_id_seq TO causal_app;


--
-- Name: TABLE org_invoice_credit_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_invoice_credit_notes TO causal_app;


--
-- Name: SEQUENCE org_invoice_credit_notes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_invoice_credit_notes_id_seq TO causal_app;


--
-- Name: TABLE org_invoice_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_invoice_lines TO causal_app;


--
-- Name: SEQUENCE org_invoice_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_invoice_lines_id_seq TO causal_app;


--
-- Name: TABLE org_invoice_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_invoice_payments TO causal_app;


--
-- Name: SEQUENCE org_invoice_payments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_invoice_payments_id_seq TO causal_app;


--
-- Name: TABLE org_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_invoices TO causal_app;


--
-- Name: SEQUENCE org_invoices_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_invoices_id_seq TO causal_app;


--
-- Name: TABLE org_ledger_approval_policies; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_ledger_approval_policies TO causal_app;


--
-- Name: TABLE org_ledger_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.org_ledger_lines TO causal_app;


--
-- Name: SEQUENCE org_ledger_lines_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_ledger_lines_id_seq TO causal_app;


--
-- Name: TABLE org_ledger_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.org_ledger_transactions TO causal_app;


--
-- Name: SEQUENCE org_ledger_transactions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_ledger_transactions_id_seq TO causal_app;


--
-- Name: TABLE org_membership_directory_optin; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_directory_optin TO causal_app;


--
-- Name: SEQUENCE org_membership_directory_optin_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_directory_optin_id_seq TO causal_app;


--
-- Name: TABLE org_membership_join_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_join_requests TO causal_app;


--
-- Name: SEQUENCE org_membership_join_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_join_requests_id_seq TO causal_app;


--
-- Name: TABLE org_membership_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_messages TO causal_app;


--
-- Name: SEQUENCE org_membership_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_messages_id_seq TO causal_app;


--
-- Name: TABLE org_membership_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_payments TO causal_app;


--
-- Name: SEQUENCE org_membership_payments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_payments_id_seq TO causal_app;


--
-- Name: TABLE org_membership_recognition; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_recognition TO causal_app;


--
-- Name: SEQUENCE org_membership_recognition_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_recognition_id_seq TO causal_app;


--
-- Name: TABLE org_membership_seats; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_seats TO causal_app;


--
-- Name: SEQUENCE org_membership_seats_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_seats_id_seq TO causal_app;


--
-- Name: TABLE org_membership_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_settings TO causal_app;


--
-- Name: TABLE org_membership_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_templates TO causal_app;


--
-- Name: SEQUENCE org_membership_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_templates_id_seq TO causal_app;


--
-- Name: TABLE org_membership_terms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_terms TO causal_app;


--
-- Name: SEQUENCE org_membership_terms_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_terms_id_seq TO causal_app;


--
-- Name: TABLE org_membership_tier_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_tier_prices TO causal_app;


--
-- Name: SEQUENCE org_membership_tier_prices_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_tier_prices_id_seq TO causal_app;


--
-- Name: TABLE org_membership_tiers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_membership_tiers TO causal_app;


--
-- Name: SEQUENCE org_membership_tiers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_membership_tiers_id_seq TO causal_app;


--
-- Name: TABLE org_payment_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_payment_accounts TO causal_app;


--
-- Name: SEQUENCE org_payment_accounts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_payment_accounts_id_seq TO causal_app;


--
-- Name: TABLE org_personnel; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_personnel TO causal_app;


--
-- Name: TABLE org_personnel_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_personnel_allocations TO causal_app;


--
-- Name: SEQUENCE org_personnel_allocations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_personnel_allocations_id_seq TO causal_app;


--
-- Name: TABLE org_personnel_changes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_personnel_changes TO causal_app;


--
-- Name: SEQUENCE org_personnel_changes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_personnel_changes_id_seq TO causal_app;


--
-- Name: SEQUENCE org_personnel_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_personnel_id_seq TO causal_app;


--
-- Name: TABLE org_plaid_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_plaid_accounts TO causal_app;


--
-- Name: SEQUENCE org_plaid_accounts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_plaid_accounts_id_seq TO causal_app;


--
-- Name: SEQUENCE org_plaid_items_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_plaid_items_id_seq TO causal_app;


--
-- Name: TABLE org_pledge_accretion_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_pledge_accretion_entries TO causal_app;


--
-- Name: SEQUENCE org_pledge_accretion_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_pledge_accretion_entries_id_seq TO causal_app;


--
-- Name: TABLE org_pod_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_pod_credentials TO causal_app;


--
-- Name: TABLE org_program_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_program_grants TO causal_app;


--
-- Name: SEQUENCE org_program_grants_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_program_grants_id_seq TO causal_app;


--
-- Name: TABLE org_programs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_programs TO causal_app;


--
-- Name: SEQUENCE org_programs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_programs_id_seq TO causal_app;


--
-- Name: TABLE org_projections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_projections TO causal_app;


--
-- Name: SEQUENCE org_projections_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_projections_id_seq TO causal_app;


--
-- Name: TABLE org_public_link_uses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_public_link_uses TO causal_app;


--
-- Name: SEQUENCE org_public_link_uses_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_public_link_uses_id_seq TO causal_app;


--
-- Name: TABLE org_public_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_public_links TO causal_app;


--
-- Name: SEQUENCE org_public_links_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_public_links_id_seq TO causal_app;


--
-- Name: TABLE org_public_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_public_settings TO causal_app;


--
-- Name: TABLE org_record_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_record_notes TO causal_app;


--
-- Name: SEQUENCE org_record_notes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_record_notes_id_seq TO causal_app;


--
-- Name: TABLE org_recurring_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_recurring_schedules TO causal_app;


--
-- Name: SEQUENCE org_recurring_schedules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_recurring_schedules_id_seq TO causal_app;


--
-- Name: TABLE org_schedule_item_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_schedule_item_allocations TO causal_app;


--
-- Name: SEQUENCE org_schedule_item_allocations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_schedule_item_allocations_id_seq TO causal_app;


--
-- Name: TABLE org_schedule_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_schedule_items TO causal_app;


--
-- Name: SEQUENCE org_schedule_items_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_schedule_items_id_seq TO causal_app;


--
-- Name: TABLE org_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_schedules TO causal_app;


--
-- Name: SEQUENCE org_schedules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_schedules_id_seq TO causal_app;


--
-- Name: TABLE org_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_settings TO causal_app;


--
-- Name: TABLE org_sponsor_acknowledgments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_acknowledgments TO causal_app;


--
-- Name: SEQUENCE org_sponsor_acknowledgments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_acknowledgments_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_agreement_amendments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_agreement_amendments TO causal_app;


--
-- Name: SEQUENCE org_sponsor_agreement_amendments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_agreement_amendments_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_agreement_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_agreement_templates TO causal_app;


--
-- Name: SEQUENCE org_sponsor_agreement_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_agreement_templates_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_agreements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_agreements TO causal_app;


--
-- Name: SEQUENCE org_sponsor_agreements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_agreements_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_applications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_applications TO causal_app;


--
-- Name: SEQUENCE org_sponsor_applications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_applications_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_approvals TO causal_app;


--
-- Name: SEQUENCE org_sponsor_approvals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_approvals_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_closings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_closings TO causal_app;


--
-- Name: SEQUENCE org_sponsor_closings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_closings_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_fee_postings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_fee_postings TO causal_app;


--
-- Name: SEQUENCE org_sponsor_fee_postings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_fee_postings_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_fee_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_fee_rules TO causal_app;


--
-- Name: SEQUENCE org_sponsor_fee_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_fee_rules_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_payment_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_payment_requests TO causal_app;


--
-- Name: SEQUENCE org_sponsor_payment_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_payment_requests_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_recalls; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_recalls TO causal_app;


--
-- Name: SEQUENCE org_sponsor_recalls_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_recalls_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_report_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_report_reminders TO causal_app;


--
-- Name: SEQUENCE org_sponsor_report_reminders_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_report_reminders_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_reports; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_reports TO causal_app;


--
-- Name: SEQUENCE org_sponsor_reports_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_reports_id_seq TO causal_app;


--
-- Name: TABLE org_sponsor_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_settings TO causal_app;


--
-- Name: TABLE org_sponsor_statements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsor_statements TO causal_app;


--
-- Name: SEQUENCE org_sponsor_statements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsor_statements_id_seq TO causal_app;


--
-- Name: TABLE org_sponsored_project_disbursements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsored_project_disbursements TO causal_app;


--
-- Name: SEQUENCE org_sponsored_project_disbursements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsored_project_disbursements_id_seq TO causal_app;


--
-- Name: TABLE org_sponsored_projects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_sponsored_projects TO causal_app;


--
-- Name: SEQUENCE org_sponsored_projects_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_sponsored_projects_id_seq TO causal_app;


--
-- Name: TABLE org_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_suggestions TO causal_app;


--
-- Name: SEQUENCE org_suggestions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_suggestions_id_seq TO causal_app;


--
-- Name: TABLE org_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_tasks TO causal_app;


--
-- Name: SEQUENCE org_tasks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_tasks_id_seq TO causal_app;


--
-- Name: TABLE org_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_users TO causal_app;


--
-- Name: SEQUENCE org_users_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_users_id_seq TO causal_app;


--
-- Name: TABLE org_vendor_compliance; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_vendor_compliance TO causal_app;


--
-- Name: SEQUENCE org_vendor_compliance_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_vendor_compliance_id_seq TO causal_app;


--
-- Name: TABLE org_xero_program_track_map; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_xero_program_track_map TO causal_app;


--
-- Name: SEQUENCE org_xero_program_track_map_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.org_xero_program_track_map_id_seq TO causal_app;


--
-- Name: TABLE orgs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.orgs TO causal_app;


--
-- Name: SEQUENCE orgs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.orgs_id_seq TO causal_app;


--
-- Name: TABLE page_views; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.page_views TO causal_app;


--
-- Name: SEQUENCE page_views_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.page_views_id_seq TO causal_app;


--
-- Name: TABLE password_reset_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.password_reset_tokens TO causal_app;


--
-- Name: SEQUENCE password_reset_tokens_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.password_reset_tokens_id_seq TO causal_app;


--
-- Name: TABLE payment_provider_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment_provider_events TO causal_app;


--
-- Name: SEQUENCE payment_provider_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.payment_provider_events_id_seq TO causal_app;


--
-- Name: TABLE pending_confirmations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pending_confirmations TO causal_app;


--
-- Name: SEQUENCE pending_confirmations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pending_confirmations_id_seq TO causal_app;


--
-- Name: TABLE platform_audit_failures; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_audit_failures TO causal_app;


--
-- Name: SEQUENCE platform_audit_failures_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.platform_audit_failures_id_seq TO causal_app;


--
-- Name: TABLE pod_access_group_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_access_group_members TO causal_app;


--
-- Name: SEQUENCE pod_access_group_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_access_group_members_id_seq TO causal_app;


--
-- Name: TABLE pod_access_group_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_access_group_rules TO causal_app;


--
-- Name: SEQUENCE pod_access_group_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_access_group_rules_id_seq TO causal_app;


--
-- Name: TABLE pod_access_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_access_groups TO causal_app;


--
-- Name: SEQUENCE pod_access_groups_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_access_groups_id_seq TO causal_app;


--
-- Name: TABLE pod_access_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_access_permissions TO causal_app;


--
-- Name: SEQUENCE pod_access_permissions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_access_permissions_id_seq TO causal_app;


--
-- Name: TABLE pod_acr_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_acr_outbox TO causal_app;


--
-- Name: SEQUENCE pod_acr_outbox_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_acr_outbox_id_seq TO causal_app;


--
-- Name: TABLE pod_share_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pod_share_challenges TO causal_app;


--
-- Name: SEQUENCE pod_share_challenges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pod_share_challenges_id_seq TO causal_app;


--
-- Name: TABLE representatives; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.representatives TO causal_app;


--
-- Name: SEQUENCE representatives_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.representatives_id_seq TO causal_app;


--
-- Name: TABLE reviewer_access_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reviewer_access_links TO causal_app;


--
-- Name: SEQUENCE reviewer_access_links_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.reviewer_access_links_id_seq TO causal_app;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sessions TO causal_app;


--
-- Name: SEQUENCE sessions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.sessions_id_seq TO causal_app;


--
-- Name: TABLE transactional_forwards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactional_forwards TO causal_app;


--
-- Name: SEQUENCE transactional_forwards_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.transactional_forwards_id_seq TO causal_app;


--
-- Name: TABLE user_actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_actions TO causal_app;


--
-- Name: SEQUENCE user_actions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_actions_id_seq TO causal_app;


--
-- Name: TABLE user_addresses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_addresses TO causal_app;


--
-- Name: SEQUENCE user_addresses_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_addresses_id_seq TO causal_app;


--
-- Name: TABLE user_contributed_orgs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_contributed_orgs TO causal_app;


--
-- Name: SEQUENCE user_contributed_orgs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_contributed_orgs_id_seq TO causal_app;


--
-- Name: TABLE user_inbound_emails; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_inbound_emails TO causal_app;


--
-- Name: SEQUENCE user_inbound_emails_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_inbound_emails_id_seq TO causal_app;


--
-- Name: TABLE user_org_petition_signatures; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_org_petition_signatures TO causal_app;


--
-- Name: SEQUENCE user_org_petition_signatures_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_org_petition_signatures_id_seq TO causal_app;


--
-- Name: TABLE user_org_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_org_preferences TO causal_app;


--
-- Name: SEQUENCE user_org_preferences_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_org_preferences_id_seq TO causal_app;


--
-- Name: TABLE user_org_setup_presets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_org_setup_presets TO causal_app;


--
-- Name: SEQUENCE user_org_setup_presets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_org_setup_presets_id_seq TO causal_app;


--
-- Name: TABLE user_rep_contact_actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_rep_contact_actions TO causal_app;


--
-- Name: SEQUENCE user_rep_contact_actions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_rep_contact_actions_id_seq TO causal_app;


--
-- Name: TABLE user_representatives; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_representatives TO causal_app;


--
-- Name: SEQUENCE user_representatives_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_representatives_id_seq TO causal_app;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO causal_app;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.users_id_seq TO causal_app;


--
-- Name: TABLE volunteer_opportunities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.volunteer_opportunities TO causal_app;


--
-- Name: SEQUENCE volunteer_opportunities_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.volunteer_opportunities_id_seq TO causal_app;


--
-- Name: TABLE watch_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.watch_contributions TO causal_app;


--
-- Name: SEQUENCE watch_contributions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.watch_contributions_id_seq TO causal_app;


--
-- Name: TABLE workshop_civic_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_civic_links TO causal_app;


--
-- Name: SEQUENCE workshop_civic_links_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_civic_links_id_seq TO causal_app;


--
-- Name: TABLE workshop_documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_documents TO causal_app;


--
-- Name: SEQUENCE workshop_documents_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_documents_id_seq TO causal_app;


--
-- Name: TABLE workshop_interventions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_interventions TO causal_app;


--
-- Name: SEQUENCE workshop_interventions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_interventions_id_seq TO causal_app;


--
-- Name: TABLE workshop_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_messages TO causal_app;


--
-- Name: SEQUENCE workshop_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_messages_id_seq TO causal_app;


--
-- Name: TABLE workshop_projects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_projects TO causal_app;


--
-- Name: SEQUENCE workshop_projects_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_projects_id_seq TO causal_app;


--
-- Name: TABLE workshop_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_proposals TO causal_app;


--
-- Name: SEQUENCE workshop_proposals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_proposals_id_seq TO causal_app;


--
-- Name: TABLE workshop_space_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_space_members TO causal_app;


--
-- Name: SEQUENCE workshop_space_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_space_members_id_seq TO causal_app;


--
-- Name: TABLE workshop_threads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_threads TO causal_app;


--
-- Name: SEQUENCE workshop_threads_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_threads_id_seq TO causal_app;


--
-- Name: TABLE workshop_workspaces; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workshop_workspaces TO causal_app;


--
-- Name: SEQUENCE workshop_workspaces_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workshop_workspaces_id_seq TO causal_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO causal_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO causal_app;


--
-- PostgreSQL database dump complete
--

\unrestrict 3JqqRjTUdvDEBWCAIr5T9tL5g9raRnjcJCe1vbyWXjtuRVE3Zaj7FqK4PPhrYBO

