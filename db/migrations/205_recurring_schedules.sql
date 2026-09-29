-- 205: Purchases/Sales V1, Section 5 (shared recurring-schedule engine). Confirmed not
-- extractable from anything that exists: Budget's Insurance/Other Schedules
-- (org_schedules/org_schedule_items) is fiscal-year-bound and only ever outputs a budget
-- forecast line (org_budget_lines), never a posted record; Membership's "renewal tracking" is
-- just a renewal_period enum plus a manually-extended date pair, no generator behind it. This is
-- new, shared infrastructure for Purchases (recurring bills) and Sales (recurring invoices),
-- built once. frequency naming borrowed from org_schedule_items for consistency; the engine
-- itself is new.

CREATE TABLE org_recurring_schedules (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  schedule_type text NOT NULL CHECK (schedule_type IN ('bill', 'invoice')),
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'annual', 'custom_months')),
  active_months smallint[],
  next_occurrence_date date NOT NULL,
  end_date date,
  template jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_recurring_schedules_custom_months_needs_array
    CHECK (frequency <> 'custom_months' OR active_months IS NOT NULL)
);

ALTER TABLE org_recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_recurring_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY org_recurring_schedules_org_isolation ON org_recurring_schedules
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE INDEX idx_org_recurring_schedules_due ON org_recurring_schedules (org_id, next_occurrence_date) WHERE active;

COMMENT ON COLUMN org_recurring_schedules.template IS 'The bill/invoice shape to generate each occurrence: constituent_id, lines (account/program/grant/amount), reference. Not a foreign key to a real bill/invoice -- interpreted by the generator at occurrence time.';
COMMENT ON COLUMN org_recurring_schedules.end_date IS 'Nullable -- no fixed end is a valid state (e.g. rent). Spans fiscal-year boundaries without issue, unlike Budget''s schedules.';
