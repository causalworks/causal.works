-- 159: one-off data fix for the sole user still on a legacy digits-only
-- forwarding_address (user id 2, gyacc@pm.me -> 314@causal.works). This
-- predates the current friendly-handle causal_address system and was the
-- source of "petitions post as 314@causal.works but /admin shows
-- gyacc@causal.works" -- confirmed as the only account matching this
-- pattern (see query in admin conversation, 2026-08-21).
--
-- Promotes causal_address to be the forwarding_address too, so the
-- individual app's causalAddressForMovesCopy() (router.js) and inbound mail
-- routing agree. The old numeric alias is kept in user_addresses (not
-- deleted) so any mail already in flight to it still resolves -- just no
-- longer marked primary.

UPDATE users
SET forwarding_address = causal_address
WHERE id = 2
  AND email = 'gyacc@pm.me'
  AND forwarding_address = '314@causal.works'
  AND causal_address = 'gyacc@causal.works';

INSERT INTO user_addresses (user_id, address, is_primary)
VALUES (2, 'gyacc@causal.works', true)
ON CONFLICT (address) DO UPDATE SET is_primary = true;

UPDATE user_addresses
SET is_primary = false
WHERE user_id = 2 AND address = '314@causal.works';
