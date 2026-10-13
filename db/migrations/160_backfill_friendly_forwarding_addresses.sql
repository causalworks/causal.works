-- 160: backfill forwarding_address for the 4 users still stuck on the legacy
-- push-xxxx@inbound.causal.works format.
--
-- registerUser() only tried a friendly handle@causal.works address when a
-- display name was on hand; most signup paths (magic link, platform invite)
-- never collect one, so it silently fell through to the random push- hash
-- (server/auth.js generateForwardingAddress). Fixed going forward by falling
-- back to the email-derived handle (same one already used for causal_address)
-- instead of jumping straight to the hash. This backfills the 4 existing
-- rows to match what a fresh signup would now get.
--
-- Renames the user_addresses row in place (not insert+delete) to keep a
-- single primary row per user and respect the address unique constraint.

UPDATE users SET forwarding_address = 'loopy@causal.works' WHERE id = 7 AND forwarding_address = 'push-dca0cba6@inbound.causal.works';
UPDATE user_addresses SET address = 'loopy@causal.works' WHERE user_id = 7 AND address = 'push-dca0cba6@inbound.causal.works';

UPDATE users SET forwarding_address = 'mstreet430@causal.works' WHERE id = 8 AND forwarding_address = 'push-7de12d86@inbound.causal.works';
UPDATE user_addresses SET address = 'mstreet430@causal.works' WHERE user_id = 8 AND address = 'push-7de12d86@inbound.causal.works';

UPDATE users SET forwarding_address = 'swanly@causal.works' WHERE id = 17 AND forwarding_address = 'push-59216047@inbound.causal.works';
UPDATE user_addresses SET address = 'swanly@causal.works' WHERE user_id = 17 AND address = 'push-59216047@inbound.causal.works';

UPDATE users SET forwarding_address = 'andres@causal.works' WHERE id = 19 AND forwarding_address = 'push-c8f4575b@inbound.causal.works';
UPDATE user_addresses SET address = 'andres@causal.works' WHERE user_id = 19 AND address = 'push-c8f4575b@inbound.causal.works';
