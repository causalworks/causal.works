-- Forwarded-email storage is an opt-in user choice. When false (the default), the inbound handler
-- lets the AI read the email as it arrives but does not store the full text on the action row
-- (actions.raw_content stays NULL). Sender, subject and a short preview are still kept for the
-- Ledger Responses tab; the privacy page says so. Existing raw_content on email-sourced rows
-- was nulled when this shipped.
ALTER TABLE users ADD COLUMN IF NOT EXISTS keep_forwarded_email_text boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN users.keep_forwarded_email_text IS 'Opt-in: store the full text of emails this user forwards (actions.raw_content). Default off.';
