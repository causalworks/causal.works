-- Generalizes the Statement of Cash Flows' non-cash expense adjustment (previously a
-- LOWER(a.name) LIKE '%depreciation%'/'%amortization%' name heuristic in
-- financialStatements.js) into an explicit flag, following the same pattern as
-- is_statistical (migration 228): a name-string match silently misses any org that renames
-- or codes its depreciation account differently, and silently over-matches an unrelated
-- account that happens to have "amortization" in its name.
ALTER TABLE public.org_accounts
  ADD COLUMN is_non_cash boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_accounts.is_non_cash IS
  'True for expense accounts that never move cash (depreciation, amortization, in-kind/donated-services expense). The Statement of Cash Flows adds these back to operating cash flow. Set explicitly per org/account -- do not infer from account name.';

-- Backfill accounts that the old name heuristic would have matched, so behavior is unchanged
-- for existing data until an org deliberately reviews/adjusts its own account flags.
UPDATE public.org_accounts
   SET is_non_cash = true
 WHERE type = 'expense'
   AND (LOWER(name) LIKE '%depreciation%' OR LOWER(name) LIKE '%amortization%');
