-- Migration 108: Remove the decision-pipeline scaffold added in migration 107.
--
-- Full revert: the entity-resolution/clustering scaffold (server/decisions/,
-- public/decisions-inspect/) is being removed entirely. Confirmed before
-- this migration that no live table has an FK into any decision_* table —
-- every FK among these 6 tables points from one decision_* table to
-- another, so this is a clean drop, not a migration-conflict risk.
--
-- The reusable part (the donate/newsletter/event-type non-decision gate
-- built in server/decisions/lib/resolution.js) is being ported into
-- extractAction() (server/ai/ai-service.js) directly as part of this same
-- change — the tables/module themselves are not being kept.

DROP TABLE IF EXISTS decision_matched_actions;
DROP TABLE IF EXISTS decision_leverage_reads;
DROP TABLE IF EXISTS decision_evidence_links;
DROP TABLE IF EXISTS decision_records;
DROP TABLE IF EXISTS decision_evidence_items;
DROP TABLE IF EXISTS decision_crawl_targets;
