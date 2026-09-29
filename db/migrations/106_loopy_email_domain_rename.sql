-- loopy@causal.work is the admin-notification account (0 actions, never onboarded,
-- referenced as the To: recipient for system notification emails). Rewrite its
-- login email to the retired-domain replacement, same pattern as migration 105.

BEGIN;

UPDATE users
SET email = 'loopy@causal.works'
WHERE id = 7 AND email = 'loopy@causal.work';

COMMIT;
