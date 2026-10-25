-- Serialize first-use creation of an organization's system accounts and programs.

DO $$
DECLARE
  f record;
  def text;
BEGIN
  FOR f IN SELECT oid FROM pg_proc WHERE proname LIKE 'org\_get\_or\_create\_%' AND pronamespace = 'public'::regnamespace LOOP
    def := pg_get_functiondef(f.oid);
    IF position('get-or-create' IN def) = 0 THEN
      def := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM pg_advisory_xact_lock(hashtextextended(''get-or-create:'' || p_org_id::text, 0));\n');
      EXECUTE def;
    END IF;
  END LOOP;
END $$;
