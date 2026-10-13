-- Migration 109: Multi-program allocation for schedule items
--
-- Gives coop_schedule_items the same multi-program % split that
-- coop_personnel_allocations already gives workers — one schedule item
-- (Insurance, Other Schedules, or a Budget-grid sub-row) can now be split
-- across several programs by percentage, instead of a single program_id.
--
-- coop_schedule_items.program_id is kept for backward compatibility: items
-- with no allocation rows keep using it (no backfill required); items with
-- allocation rows use those instead (scheduleRecalc.js prefers allocations
-- when present).

CREATE TABLE IF NOT EXISTS coop_schedule_item_allocations (
  id                    BIGSERIAL PRIMARY KEY,
  coop_schedule_item_id BIGINT NOT NULL REFERENCES coop_schedule_items(id) ON DELETE CASCADE,
  coop_org_id           INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  coop_program_id       INTEGER NOT NULL REFERENCES coop_programs(id),
  percent_bps           INTEGER NOT NULL CHECK (percent_bps > 0 AND percent_bps <= 10000),
  CONSTRAINT coop_schedule_item_allocations_uq UNIQUE (coop_schedule_item_id, coop_program_id)
);

CREATE INDEX IF NOT EXISTS idx_coop_schedule_item_allocations_item
  ON coop_schedule_item_allocations(coop_schedule_item_id);
