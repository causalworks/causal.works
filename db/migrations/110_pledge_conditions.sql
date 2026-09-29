-- 110: dated conditional pledges — "I'll move my money if X hasn't changed by [date]"
ALTER TABLE bank_pledges ADD COLUMN IF NOT EXISTS condition_deadline DATE;
ALTER TABLE bank_pledges ADD COLUMN IF NOT EXISTS condition_note TEXT;

ALTER TABLE financial_rep_pledges ADD COLUMN IF NOT EXISTS condition_deadline DATE;
ALTER TABLE financial_rep_pledges ADD COLUMN IF NOT EXISTS condition_note TEXT;
