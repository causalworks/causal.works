-- Bookkeeper review of the Accounting module (2026-10-01): one row per reviewed item, holding
-- the reviewer's answers as a small JSON object. Item text itself lives in
-- server/data/accounting-review.json; rows here are only the responses. Not org-scoped: this is
-- platform-admin working data behind /admin/accounting-review, so no RLS and no demo reset.
--
-- item_id: B##/P##/I##/Q## for the fixed review items, A-<time> for reviewer-added gaps,
-- L-<time> for decision-log rows.

CREATE TABLE IF NOT EXISTS accounting_review_entry (
  item_id    text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_review_entry TO causal_app;
