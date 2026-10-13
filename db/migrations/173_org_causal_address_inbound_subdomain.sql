-- Org causal_address (the shared address each org's own mailing list sends confirmations/
-- actions to, e.g. avaaz@causal.works) moves off the root domain onto inbound.causal.works,
-- same reason and same pattern as migration 172 for personal user addresses: the root
-- domain's MX is being freed for an unrelated human mailbox, so anything routing through
-- Postmark has to live on the subdomain. Local part unchanged.
--
-- This does NOT resubscribe orgs on their end -- each org's own list/petition platform
-- still has the old @causal.works address on file and will keep sending there until
-- someone updates it there directly.

BEGIN;

UPDATE orgs
SET causal_address = REPLACE(causal_address, '@causal.works', '@inbound.causal.works')
WHERE causal_address LIKE '%@causal.works';

COMMIT;
