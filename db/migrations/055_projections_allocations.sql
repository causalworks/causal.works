-- 055: manual projections + allocation schedules for projected values

CREATE TABLE IF NOT EXISTS np_projections (
  id BIGSERIAL PRIMARY KEY,
  np_org_id INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  np_account_id INTEGER NOT NULL REFERENCES np_accounts(id),
  np_program_id INTEGER NOT NULL REFERENCES np_programs(id),
  fiscal_year INTEGER NOT NULL,
  period_month INTEGER,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  formula TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT np_projections_period_month_chk CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12)
);

CREATE UNIQUE INDEX IF NOT EXISTS np_projections_uq_annual
  ON np_projections (np_org_id, np_account_id, np_program_id, fiscal_year)
  WHERE period_month IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS np_projections_uq_monthly
  ON np_projections (np_org_id, np_account_id, np_program_id, fiscal_year, period_month)
  WHERE period_month IS NOT NULL;

CREATE INDEX IF NOT EXISTS np_projections_org_fy_idx
  ON np_projections (np_org_id, fiscal_year);
CREATE INDEX IF NOT EXISTS np_projections_org_program_idx
  ON np_projections (np_org_id, np_program_id);
CREATE INDEX IF NOT EXISTS np_projections_org_account_idx
  ON np_projections (np_org_id, np_account_id);

CREATE TABLE IF NOT EXISTS np_allocation_schedules (
  id BIGSERIAL PRIMARY KEY,
  np_org_id INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  fiscal_year INTEGER NOT NULL,
  total_amount_cents BIGINT NOT NULL,
  source_account_id INTEGER REFERENCES np_accounts(id),
  distribution_type TEXT NOT NULL,
  monthly_pattern TEXT NOT NULL DEFAULT 'even',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT np_alloc_schedules_distribution_type_chk
    CHECK (distribution_type IN ('fixed_percent_by_program', 'fixed_amount_by_program')),
  CONSTRAINT np_alloc_schedules_monthly_pattern_chk
    CHECK (monthly_pattern IN ('even', 'monthly_custom'))
);

CREATE INDEX IF NOT EXISTS np_allocation_schedules_org_fy_idx
  ON np_allocation_schedules (np_org_id, fiscal_year);
CREATE INDEX IF NOT EXISTS np_allocation_schedules_org_active_idx
  ON np_allocation_schedules (np_org_id, active);

CREATE TABLE IF NOT EXISTS np_allocation_lines (
  id BIGSERIAL PRIMARY KEY,
  np_allocation_schedule_id INTEGER NOT NULL REFERENCES np_allocation_schedules(id) ON DELETE CASCADE,
  np_program_id INTEGER NOT NULL REFERENCES np_programs(id),
  np_account_id INTEGER NOT NULL REFERENCES np_accounts(id),
  percent_bps INTEGER,
  amount_cents BIGINT,
  CONSTRAINT np_allocation_lines_unique UNIQUE (np_allocation_schedule_id, np_program_id, np_account_id)
);

CREATE INDEX IF NOT EXISTS np_allocation_lines_schedule_idx
  ON np_allocation_lines (np_allocation_schedule_id);
CREATE INDEX IF NOT EXISTS np_allocation_lines_program_idx
  ON np_allocation_lines (np_program_id);
CREATE INDEX IF NOT EXISTS np_allocation_lines_account_idx
  ON np_allocation_lines (np_account_id);

CREATE TABLE IF NOT EXISTS np_allocation_monthly (
  id BIGSERIAL PRIMARY KEY,
  np_allocation_schedule_id INTEGER NOT NULL REFERENCES np_allocation_schedules(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  percent_bps INTEGER NOT NULL,
  CONSTRAINT np_allocation_monthly_unique UNIQUE (np_allocation_schedule_id, period_month)
);

CREATE INDEX IF NOT EXISTS np_allocation_monthly_schedule_idx
  ON np_allocation_monthly (np_allocation_schedule_id);
