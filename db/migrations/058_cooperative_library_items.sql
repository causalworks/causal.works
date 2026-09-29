-- 058: Create cooperative library items table
CREATE TYPE cooperative_library_category AS ENUM (
  'chart_of_accounts',
  'templates_financial_reports',
  'templates_grants',
  'templates_board_materials',
  'policy_examples',
  'methods_notes'
);

CREATE TABLE IF NOT EXISTS cooperative_library_items (
  id SERIAL PRIMARY KEY,
  category cooperative_library_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cooperative_library_items_category ON cooperative_library_items (category, display_order);
