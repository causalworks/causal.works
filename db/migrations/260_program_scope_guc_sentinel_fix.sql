-- 260: fix a real latent bug in migration 259's app.current_program_ids GUC handling, found
-- 2026-09-21 while building scripts/rls-coverage-test.js (the runtime test the RLS work itself
-- called for) -- not a hypothetical, verified live against the actual pg.Pool connection-reuse
-- path scopedPool.js uses.
--
-- The bug: Postgres does not let a custom ("placeholder") GUC return to a genuinely NULL/unset
-- state once it has been SET at all on a session -- SET LOCAL's "revert at COMMIT" and even
-- RESET both leave it at '' (empty string), never back to NULL. current_program_ids() (migration
-- 259) treated NULL as "no restriction" and '' as "restricted to nothing" -- so on a pooled
-- connection previously used by ANY program-scoped request, a LATER admin/finance request on
-- that same physical connection (which scopedPool.js never explicitly sets the GUC for, since
-- scope === null means "don't touch it") would inherit the decayed '' from the prior
-- transaction and be silently restricted to seeing ZERO rows across all 14 backstop tables --
-- verified reproducible with a single node -e repro using a 1-connection pg.Pool.
--
-- No 'program'-role user has been assigned in production yet (Step C's data cutover hasn't
-- run), so this has not yet caused a real incident -- but it would have, the first time any
-- 'program'-role request ever ran, intermittently and unpredictably depending on which pooled
-- connection got reused.
--
-- Fix: never rely on "unset" meaning anything. Always require an explicit value:
--   '*'  -- new sentinel, means "no restriction" (was: GUC left untouched / NULL)
--   ''   -- unchanged, means "restricted to zero programs" (a program-role user with no grants)
--   'n,n,...' -- unchanged, means "restricted to these ids"
-- scopedPool.js is updated in the same commit to ALWAYS call set_config with one of these three
-- values on every scoped transaction, never skipping the call. A stray genuine NULL (a request
-- path that somehow never went through scopedPool.js at all) now fails closed (sees nothing),
-- matching this codebase's stated fail-closed convention elsewhere -- not "unrestricted", which
-- was the wrong default for an unexpected/unaccounted-for code path anyway.

CREATE OR REPLACE FUNCTION current_program_ids() RETURNS int[] AS $$
  SELECT CASE
    WHEN current_setting('app.current_program_ids', true) IS NULL THEN ARRAY[]::int[]
    WHEN current_setting('app.current_program_ids', true) = '*' THEN NULL
    WHEN current_setting('app.current_program_ids', true) = '' THEN ARRAY[]::int[]
    ELSE string_to_array(current_setting('app.current_program_ids', true), ',')::int[]
  END;
$$ LANGUAGE sql STABLE;
