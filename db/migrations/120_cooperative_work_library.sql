-- 120: Cooperative-work library — accumulates content from actual cooperative activity
-- (workshop outputs, work-pool case studies, engagement artifacts), separate from the
-- seeded org-management reference library in cooperative_library_items (058/061).

CREATE TYPE cooperative_work_library_category AS ENUM (
  'workshop_output',
  'work_pool_case_study',
  'engagement_artifact'
);

CREATE TABLE IF NOT EXISTS cooperative_work_library_items (
  id SERIAL PRIMARY KEY,
  category cooperative_work_library_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  workshop_id INTEGER REFERENCES workshop_projects(id) ON DELETE SET NULL,
  source_coop_org_id INTEGER REFERENCES coop_orgs(id) ON DELETE SET NULL,
  contributed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cooperative_work_library_items_category
  ON cooperative_work_library_items (category, display_order);
CREATE INDEX IF NOT EXISTS idx_cooperative_work_library_items_workshop
  ON cooperative_work_library_items (workshop_id);

-- ── Demo workshop: Global Just Transition Fund coalition ──────────────────
-- Gives the "Cooperative work" library section a real workshop → library
-- lineage to display, using the existing Workshop schema (028/065/066).

INSERT INTO workshop_projects (slug, name, description, phase, e4a_turnarounds)
VALUES (
  'global-just-transition-fund',
  'Global Just Transition Fund',
  'Coalition coordinating a binding, worker-governed Just Transition Fund to remove the economic-fear barrier blocking rapid fossil fuel phase-out.',
  'synthesis',
  ARRAY['energy', 'poverty', 'inequality']
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, e4a_turnarounds, access_scope)
SELECT p.id,
       'coalition-formation',
       'Global Just Transition Fund Coalition',
       'Labor unions, climate organizers, renewable companies, and finance experts coordinating fund architecture and regional transition plans.',
       'coalition',
       ARRAY['energy', 'poverty', 'inequality'],
       'cooperative_visible'
FROM workshop_projects p
WHERE p.slug = 'global-just-transition-fund'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_workspaces w WHERE w.project_id = p.id AND w.slug = 'coalition-formation'
  );

INSERT INTO workshop_documents (workspace_id, title, content, e4a_turnarounds)
SELECT w.id,
       'Employment Lock-In Loop: Systems Analysis',
       $md$# Employment Lock-In Loop

**Reinforcing loop — why workers block climate action:**
Fossil jobs exist → workers fear economic devastation from transition → workers and communities oppose climate policy → politicians defer fossil phase-out to keep worker votes → fossil infrastructure stays operational → fossil jobs continue to exist. Each year of delay locks in ~30-40 years of new fossil infrastructure.

**The intervention:** a credible, binding Just Transition Fund removes the economic fear that powers this loop. Workers stop opposing climate policy → politicians gain freedom to act → phase-out accelerates, while workers stay protected through the transition.

**New reinforcing loop once the fund exists:** trust in the fund → workers stop opposing (or actively support) phase-out → climate policy advances → renewable buildout creates jobs → more workers transition successfully → trust increases further.

**Why this is the leverage point:** the barrier isn't technology (renewables are already cost-competitive) — it's political economy. Workers and fossil-dependent communities use real political power to block transition because they're protecting their survival, not because they're irrational. Removing the fear removes the opposition.$md$,
       ARRAY['energy', 'poverty']
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'global-just-transition-fund' AND w.slug = 'coalition-formation'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Employment Lock-In Loop: Systems Analysis'
  );

INSERT INTO workshop_documents (workspace_id, title, content, e4a_turnarounds)
SELECT w.id,
       'Regional Transition Plans & Fund Scale Summary',
       $md$# Regional Transition Plans & Fund Scale Summary

**Fund scale:** below $500B, workers won't believe the fund is real; above $2T it's comprehensive enough to remove the employment barrier entirely. Target range: $2-5T over 10-15 years, front-loaded. Funding sources include carbon tax/ETS expansion, a fossil extraction levy, a financial transaction tax, and a wealth tax on $50M+ holdings.

**Key regional lessons:**
- One size does not fit all — a Polish coal region needs a different plan than an Indonesian palm-oil region or a Texas oil basin.
- Wage guarantees are non-negotiable; "green jobs" that mean a 50% pay cut won't win worker support.
- Community matters more than the individual — economic diversification has to cover the whole region (schools, tax base, local business), not just retrain individual workers.
- Trust deficit is real: every region carries the memory of broken promises from past industrial transitions, so fund mechanisms need to be binding and automatic, not dependent on future political goodwill.

**Governance:** workers need decision-making power, not just beneficiary status — a governance board weighted toward labor and community representation (rather than government or corporate control) is what makes the fund credible enough to break the lock-in loop.$md$,
       ARRAY['poverty', 'inequality']
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'global-just-transition-fund' AND w.slug = 'coalition-formation'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Regional Transition Plans & Fund Scale Summary'
  );

-- ── Cooperative work library seed data ─────────────────────────────────────

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'Employment Lock-In Loop: Systems Analysis',
       'Systems map of the reinforcing loop blocking fossil fuel phase-out, and how a Just Transition Fund breaks it.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'global-just-transition-fund' AND d.title = 'Employment Lock-In Loop: Systems Analysis'),
       p.id,
       o.id,
       1
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'global-just-transition-fund' AND o.slug = 'test-co'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Employment Lock-In Loop: Systems Analysis');

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'Regional Transition Plans & Fund Scale Summary',
       'Fund-scale analysis and cross-regional lessons produced by the Global Just Transition Fund coalition.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'global-just-transition-fund' AND d.title = 'Regional Transition Plans & Fund Scale Summary'),
       p.id,
       o.id,
       2
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'global-just-transition-fund' AND o.slug = 'test-co'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Regional Transition Plans & Fund Scale Summary');

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, source_coop_org_id, display_order)
SELECT 'work_pool_case_study',
       'Grant writing support: 3-org case study',
       'How a work-pool grant-writing request turned into a reusable proposal structure for three cooperative members.',
       $md$# Grant Writing Support: Case Study

A cooperative member posted a work-pool need for grant-writing support ahead of a foundation deadline. A pool volunteer with grant-writing experience picked it up, and the resulting proposal structure (statement of need, project description, budget narrative) was reused by two other member organizations for their own submissions that quarter.

*(Placeholder for full case study write-up.)*$md$,
       o.id,
       1
FROM coop_orgs o
WHERE o.slug = 'test-co'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Grant writing support: 3-org case study');

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, source_coop_org_id, display_order)
SELECT 'engagement_artifact',
       'Member meeting notes: Q3 governance review',
       'Notes from a quarterly cooperative member meeting covering governance process updates.',
       $md$# Q3 Governance Review — Member Meeting Notes

Discussed proposed updates to member voting thresholds and reviewed the current committee structure. No binding decisions made this session; follow-up proposal to be drafted for the next meeting.

*(Placeholder for full meeting notes.)*$md$,
       o.id,
       1
FROM coop_orgs o
WHERE o.slug = 'test-co'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Member meeting notes: Q3 governance review');
