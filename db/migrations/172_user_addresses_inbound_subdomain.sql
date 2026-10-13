-- Personal-address email feature (forwarding_address, causal_address, user_addresses)
-- moves off the causal.works root domain onto inbound.causal.works, freeing the root
-- domain's MX for an unrelated human mailbox. Local part unchanged.
--
-- user_addresses is the table /inbound actually routes against (see server.js), so it
-- must move in lockstep with the users columns or delivery to the new address silently
-- fails — same pattern as migrations 159/160 for the prior forwarding-address fixes.
-- org causal_address is untouched (separate feature, stays on the root domain).

BEGIN;

UPDATE users
SET forwarding_address = REPLACE(forwarding_address, '@causal.works', '@inbound.causal.works')
WHERE forwarding_address LIKE '%@causal.works';

UPDATE users
SET causal_address = REPLACE(causal_address, '@causal.works', '@inbound.causal.works')
WHERE causal_address LIKE '%@causal.works';

UPDATE user_addresses
SET address = REPLACE(address, '@causal.works', '@inbound.causal.works')
WHERE address LIKE '%@causal.works';

COMMIT;
