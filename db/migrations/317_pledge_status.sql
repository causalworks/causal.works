-- A pledge held in Funding until it is real. Status decides whether it can be posted:
--   intention      a stated hope to give, not binding: never booked
--   conditional    a promise with a barrier and a donor right of return: booked once the condition is met
--   unconditional  a clear, documented promise: available to Accounting to accept and post
-- Held pledges have posting_status 'held' (not in the Accounting queue). Marking a pledge unconditional makes it
-- 'unposted'; Accounting accepting it is what posts it. Existing pledges keep their behavior (unconditional).
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS pledge_status TEXT;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS pledge_condition TEXT;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS pledge_status_changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS pledge_status_changed_at TIMESTAMPTZ;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS pledge_status_note TEXT;
ALTER TABLE org_gifts DROP CONSTRAINT IF EXISTS org_gifts_pledge_status_check;
ALTER TABLE org_gifts ADD CONSTRAINT org_gifts_pledge_status_check CHECK (pledge_status IS NULL OR pledge_status IN ('intention', 'conditional', 'unconditional'));
ALTER TABLE org_gifts DROP CONSTRAINT IF EXISTS org_gifts_posting_status_check;
ALTER TABLE org_gifts ADD CONSTRAINT org_gifts_posting_status_check CHECK (posting_status IN ('not_applicable', 'held', 'unposted', 'posted', 'void'));
UPDATE org_gifts SET pledge_status = 'unconditional' WHERE gift_type = 'pledge' AND pledge_status IS NULL;
