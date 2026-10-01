-- Accounting review (migration 288) now keeps one row per reviewer per item, so two people can
-- answer independently and compare. reviewer is the signed-in user's lowercased email, or
-- 'shared' for fields both people edit together (decisions, responses, decision-log rows).

ALTER TABLE accounting_review_entry ADD COLUMN reviewer text NOT NULL DEFAULT 'shared';
ALTER TABLE accounting_review_entry ALTER COLUMN reviewer DROP DEFAULT;
ALTER TABLE accounting_review_entry DROP CONSTRAINT accounting_review_entry_pkey;
ALTER TABLE accounting_review_entry ADD PRIMARY KEY (item_id, reviewer);
