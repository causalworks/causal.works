-- Reverses the unused opt-in column from 290: personal-address forwarding is retired, and raw email text
-- is now kept only for platform-subscribed org mail (source 'causal'), so no per-user setting is needed.
ALTER TABLE users DROP COLUMN IF EXISTS keep_forwarded_email_text;
