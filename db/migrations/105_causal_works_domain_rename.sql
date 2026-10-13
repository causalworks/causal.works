-- causal.work is retired; platform moves to causal.works.
-- Rewrite existing stored addresses in place (local part unchanged, domain suffix only).

BEGIN;

UPDATE users
SET forwarding_address = REPLACE(forwarding_address, 'causal.work', 'causal.works')
WHERE forwarding_address LIKE '%causal.work';

UPDATE users
SET causal_address = REPLACE(causal_address, 'causal.work', 'causal.works')
WHERE causal_address LIKE '%causal.work';

UPDATE orgs
SET causal_address = REPLACE(causal_address, 'causal.work', 'causal.works')
WHERE causal_address LIKE '%causal.work';

COMMIT;
